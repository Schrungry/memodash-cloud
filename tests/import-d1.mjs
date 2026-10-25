// Exercise the actual server import function and SQL against an isolated local D1.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { Miniflare } from "miniflare";
import ts from "typescript";
import { importBackupData, parseBackup } from "../lib/backup.ts";

const require = createRequire(import.meta.url);
const root = new URL("../", import.meta.url);
const compile = source => ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true}}).outputText;

test("D1 bulk import preserves dependencies, user isolation, idempotency, and existing progress", async t => {
  const mf = new Miniflare({modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: {DB: "import-test"}, compatibilityDate: "2026-05-15"});
  t.after(() => mf.dispose());
  const database = await mf.getD1Database("DB");
  for (const file of readdirSync(new URL("drizzle/", root)).filter(name => name.endsWith(".sql")).sort()) {
    const statements = readFileSync(new URL(`drizzle/${file}`, root), "utf8").split("--> statement-breakpoint").map(sql => sql.trim()).filter(Boolean);
    await database.batch(statements.map(sql => database.prepare(sql)));
  }
  const operations = {reads: 0, writes: 0};
  const db = {
    prepare(sql) {
      const statement = database.prepare(sql);
      if (!sql.startsWith("SELECT")) return statement;
      return {bind(...args) { const bound = statement.bind(...args); return {async all() { operations.reads++; return bound.all(); }}; }};
    },
    async batch(statements) { operations.writes++; return database.batch(statements); },
  };
  const exports = {};
  new Function("require", "exports", compile(readFileSync(new URL("lib/server.ts", root), "utf8")))(name => {
    if (name === "cloudflare:workers") return {env: {DB: db}};
    if (name === "./books") return {catalog: require("../lib/catalog.json")};
    if (["./types", "./study", "./memory"].includes(name)) return require(`../lib/${name.slice(2)}.ts`);
    throw new Error(`Unexpected import: ${name}`);
  }, exports);
  const {importBackup} = exports;
  const state = {due: "2026-10-25T00:00:00.000Z", last_review: "2026-10-24T00:00:00.000Z", state: 2, stability: 3, difficulty: 5, elapsed_days: 1, scheduled_days: 1, learning_steps: 0, reps: 1, lapses: 0};
  const word = (id, rank = 1) => ({id, rank, word: "remember", definition: "记住"});
  const card = word_id => ({word_id, book_id: "custom", word: "remember", data: JSON.stringify(state)});
  const review = (id, word_id) => ({id, word_id, book_id: "custom", word: "remember", rating: 3, reviewed_at: state.last_review, day: "2026-10-24", is_new: 0, duration: 500, card_data: JSON.stringify(state)});
  const count = async (table, uid) => (await database.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id=?`).bind(uid).first()).n;
  const rejects400 = (uid, body, message) => assert.rejects(importBackup(uid, body), e => e.status === 400 && message.test(e.message));

  await importBackup("owner", {kind: "words", rows: [word("custom:first")]});
  await rejects400("other", {kind: "cards", rows: [card("custom:first")]}, /对应生词/);
  assert.equal(await count("cards", "other"), 0);

  const words = Array.from({length: 50}, (_, i) => word(`custom:${i}`, i));
  await importBackup("owner", {kind: "words", rows: words});
  operations.reads = operations.writes = 0;
  await importBackup("owner", {kind: "cards", rows: words.map(w => card(w.id))});
  assert.deepEqual(operations, {reads: 1, writes: 1});
  const reviews = Array.from({length: 50}, (_, i) => review(`r${i}`, `custom:${i % 3}`));
  operations.reads = operations.writes = 0;
  await importBackup("owner", {kind: "reviews", rows: reviews});
  assert.deepEqual(operations, {reads: 1, writes: 1});
  await rejects400("other", {kind: "reviews", rows: [reviews[0]]}, /对应卡片/);
  await rejects400("owner", {kind: "reviews", rows: [review("valid", "custom:1"), review("missing", "custom:missing")]}, /对应卡片/);
  assert.equal(await count("reviews", "owner"), 50);
  await rejects400("owner", {kind: "cards", rows: [card("custom:first"), {...card("custom:1"), data: JSON.stringify({...state, stability: -1})}]}, /调度状态/);
  assert.equal(await count("cards", "owner"), 50);
  await rejects400("owner", {kind: "reviews", rows: [{...review("bad", "custom:1"), reviewed_at: state.due}]}, /记忆状态/);
  await rejects400("owner", {kind: "reviews", rows: Array(51).fill(reviews[0])}, /最多导入/);
  await importBackup("owner", {kind: "reviews", rows: reviews});
  assert.equal(await count("reviews", "owner"), 50);
  await importBackup("owner", {kind: "cards", rows: [{...card("custom:0"), data: JSON.stringify({...state, reps: 99})}]});
  assert.equal(JSON.parse((await database.prepare("SELECT data FROM cards WHERE user_id=? AND word_id=?").bind("owner", "custom:0").first()).data).reps, 1);

  await t.test("full migration fixture with bounded concurrency and retry", async fixtureTest => {
    const fixture = new URL("outputs/legacy-migration.json", root);
    let input;
    try { input = parseBackup(readFileSync(fixture, "utf8")); } catch (e) { if (e.code === "ENOENT") { fixtureTest.skip("Local migration fixture is not present"); return; } throw e; }
    const uid = "migration";
    operations.reads = operations.writes = 0;
    const started = performance.now();
    await importBackupData(input, body => importBackup(uid, body));
    const firstRun = {...operations};
    console.log(JSON.stringify({fixture: "legacy-migration.json", elapsedMs: Math.round(performance.now() - started), d1Operations: firstRun, cards: input.cards.length, reviews: input.reviews.length}));
    assert.equal(await count("custom_words", uid), input.words.length);
    assert.equal(await count("cards", uid), input.cards.length);
    assert.equal(await count("reviews", uid), input.reviews.length);
    assert.ok(firstRun.reads <= 54);
    await importBackupData(input, body => importBackup(uid, body));
    assert.equal(await count("cards", uid), input.cards.length);
    assert.equal(await count("reviews", uid), input.reviews.length);
  });
});
