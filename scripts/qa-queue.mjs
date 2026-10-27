// Queue regression against a LOCAL production build and disposable test users.
import assert from "node:assert/strict";

const origin = process.argv[2] || "http://127.0.0.1:8787";
if (!["127.0.0.1", "localhost"].includes(new URL(origin).hostname)) throw new Error("Run queue QA only against a local preview");
const uid = `qa_queue_${crypto.randomUUID()}`;
async function request(path, body, user = uid) {
  const response = await fetch(`${origin}/api/${path}`, {method: body === undefined ? "GET" : "POST", headers: {
    "oai-authenticated-user-id": user, "oai-authenticated-user-email": `${user}@sites.test`, origin, "content-type": "application/json",
  }, body: body === undefined ? undefined : JSON.stringify(body)});
  const data = await response.json(); assert.equal(response.status, 200, JSON.stringify(data)); return data;
}
const settings = {...(await request("overview")).settings, currentBook: "CET4luan_1", newLimit: 2, reviewLimit: 100};
await request("settings", settings);
const source = (await request("words/source?bookId=CET4luan_1&wordId=CET4luan_1%3A1")).word;
const one = (await request("words", {word: "custom-one", definition: "自定义新词一"})).word;
const two = (await request("words", {word: "custom-two", definition: "自定义新词二"})).word;
const now = Date.now(), due = new Date(now - 3600_000).toISOString();
await request("import", {kind: "cards", rows: [{word_id: source.id, book_id: source.bookId, word: source.word, data: {
  due, last_review: new Date(now - 86400_000).toISOString(), state: 2, stability: 3, difficulty: 5, elapsed_days: 1, scheduled_days: 1, learning_steps: 0, reps: 2, lapses: 0,
}}]});
const rate = card => request("review", {wordId: card.word.id, version: card.version, rating: 4, duration: 1000, requestId: crypto.randomUUID()});

const dueCard = await request("study");
assert.equal(dueCard.word.id, source.id, "Due reviews must remain ahead of both kinds of new words");
assert.equal(dueCard.isNew, false); await rate(dueCard);
const remaining = new Set([one.id, two.id]);
for (let i = 0; i < 2; i++) {
  const card = await request("study");
  assert.ok(remaining.has(card.word?.id), "Unlearned custom words must precede unlearned preset-book words");
  assert.equal(card.isNew, true); remaining.delete(card.word.id); await rate(card);
}
assert.equal((await request("study")).word, null, "Both sources share the daily new-word quota");
const three = (await request("words", {word: "custom-three", definition: "第三个生词"})).word;
assert.equal((await request("study")).word, null, "Adding a custom word must not bypass an exhausted quota");
await request("settings", {...settings, newLimit: 4});
const third = await request("study"); assert.equal(third.word.id, three.id); await rate(third);
const preset = await request("study");
assert.equal(preset.isNew, true); assert.equal(preset.word.bookId, settings.currentBook);
assert.notEqual(preset.word.id, source.id); await rate(preset);
assert.equal((await request("overview")).stats.newToday, 4);
assert.equal((await request("study")).word, null);
assert.equal((await request("study", undefined, `qa_queue_other_${crypto.randomUUID()}`)).word, null);
await request("settings", {...settings, currentBook: "custom", newLimit: 5});
const fourth = (await request("words", {word: "custom-four", definition: "第四个生词"})).word;
assert.equal((await request("study")).word.id, fourth.id, "Custom-only mode must continue to work");
await request("settings", {...settings, currentBook: "custom", newLimit: 0});
assert.equal((await request("study")).word, null);
console.log("PASS: due reviews → custom new words → book new words; shared quotas, quota exhaustion, custom-only mode, and user isolation.");
