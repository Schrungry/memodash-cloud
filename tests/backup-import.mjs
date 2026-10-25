import assert from "node:assert/strict";
import test from "node:test";
import { importBackupData } from "../lib/backup.ts";
import { defaults } from "../lib/types.ts";

const backup = (extra = {}) => ({app: "MemoDashCloud", version: 1, settings: defaults, words: [], cards: [], reviews: [], ...extra});
const rows = count => Array.from({length: count}, (_, id) => ({id, word: "example"}));
const tick = () => new Promise(resolve => setImmediate(resolve));

test("imports stages in order with at most three active batches and monotonic progress", async () => {
  const input = backup({words: rows(160), cards: rows(160), reviews: rows(160)});
  const completed = [], updates = [];
  let active = 0, maxActive = 0;
  await importBackupData(input, async body => {
    if (body.kind === "cards") assert.equal(completed.filter(x => x === "words").length, 4);
    if (body.kind === "reviews") assert.equal(completed.filter(x => x === "cards").length, 4);
    if (body.kind === "settings") assert.equal(completed.filter(x => x === "reviews").length, 4);
    else assert.ok(body.rows.length <= 50);
    maxActive = Math.max(maxActive, ++active);
    await tick();
    completed.push(body.kind); active--;
  }, (done, total) => updates.push([done, total]));
  assert.equal(maxActive, 3);
  assert.equal(completed.length, 13);
  assert.deepEqual(updates, Array.from({length: 14}, (_, i) => [i, 13]));
});

test("bounds complete JSON bodies by UTF-8 bytes, including Chinese and emoji", async () => {
  const input = backup({words: Array.from({length: 10}, (_, id) => ({id, definition: "中文😀".repeat(5_000)}))});
  const imported = [];
  await importBackupData(input, async body => {
    assert.ok(Buffer.byteLength(JSON.stringify(body), "utf8") <= 180_000);
    if (body.kind === "words") imported.push(...body.rows);
  });
  assert.deepEqual(imported, input.words);
});

test("rejects an oversized row in a later stage before sending any records", async () => {
  let calls = 0;
  await assert.rejects(importBackupData(backup({words: rows(1), reviews: [{word: "中".repeat(60_000)}]}), async () => { calls++; }), /单条记录过大/);
  assert.equal(calls, 0);
});

test("on failure drains in-flight requests, stops queuing, and skips later stages/settings", async () => {
  const sent = [], pending = [];
  const failure = new Error("batch failed");
  let settled = false;
  const run = importBackupData(backup({words: rows(300), cards: rows(1)}), body => {
    sent.push(body.kind);
    return new Promise((resolve, reject) => pending.push({resolve, reject}));
  });
  const result = assert.rejects(run, error => error === failure).then(() => { settled = true; });
  assert.equal(pending.length, 3);
  pending[0].reject(failure);
  await tick();
  assert.equal(settled, false);
  assert.equal(sent.length, 3);
  pending[1].resolve(); pending[2].resolve();
  await result;
  assert.deepEqual(sent, ["words", "words", "words"]);
});

test("an empty backup still applies settings once", async () => {
  const sent = [];
  await importBackupData(backup(), async body => sent.push(body));
  assert.deepEqual(sent, [{kind: "settings", settings: defaults}]);
});
