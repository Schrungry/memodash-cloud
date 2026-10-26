// Production-build API checks against a LOCAL server and a disposable test user.
import assert from "node:assert/strict";
import { formatMeanings, meaningsFor } from "../lib/word-fields.ts";

const origin = process.argv[2] || "http://127.0.0.1:8787";
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname)) throw new Error("Run word-management QA only against a local preview");
const uid = `qa_words_${crypto.randomUUID()}`, other = `qa_words_${crypto.randomUUID()}`;
async function request(path, body, user = uid, extraHeaders = {}) {
  const response = await fetch(`${origin}/api/${path}`, {method: body === undefined ? "GET" : "POST", headers: {
    ...(user ? {"oai-authenticated-user-id": user, "oai-authenticated-user-email": `${user}@sites.test`} : {}),
    origin, "content-type": "application/json", ...extraHeaders,
  }, body: body === undefined ? undefined : JSON.stringify(body)});
  const data = await response.json();
  return {status: response.status, data};
}
const ok = async (...args) => { const response = await request(...args); assert.equal(response.status, 200, JSON.stringify(response.data)); return response.data; };
assert.equal((await ok("overview")).stats.pending, 0);
assert.equal((await request("words/lookup?q=access", undefined, null)).status, 401);
assert.equal((await request("words/lookup?q=")).status, 400);
const lookup = await ok("words/lookup?q=%20ACCESS%20");
assert.equal(lookup.booksSearched, 81); assert.ok(lookup.matches.length > 1);
assert.equal((await ok("words/lookup?q=zzzxnotaword987654321")).matches.length, 0);
const match = lookup.matches[0];
const {word: source} = await ok(`words/source?bookId=${match.bookId}&wordId=${encodeURIComponent(match.wordId)}`);
assert.equal(source.id, match.wordId); assert.ok(source.phonetic); assert.ok(source.phoneticUk);
assert.equal((await request("words/source?bookId=invalid&wordId=invalid:1")).status, 400);
const input = {word: source.word, phonetic: source.phonetic, phoneticUk: source.phoneticUk, meanings: meaningsFor(source), sentences: source.sentences, phrases: source.phrases, source: {bookId: match.bookId, wordId: match.wordId}};
input.definition = formatMeanings(input.meanings);
const created = (await ok("words", input)).word;
assert.equal((await ok("overview")).stats.pending, 1);
assert.equal(created.source.bookId, match.bookId);
assert.equal(created.sentences.length, source.sentences.length);
assert.equal((await request("words", {...input, meanings: [{partOfSpeech: "fake", meaning: "x"}]})).status, 400);
const next = await ok("study"); assert.equal(next.word.id, created.id);
await ok("review", {wordId: created.id, version: 0, rating: 3, duration: 500, requestId: crypto.randomUUID()});
const before = await ok("backup"); assert.equal(before.reviews.length, 1);
const edited = {id: created.id, word: "access-edited", phonetic: "US", phoneticUk: "UK", meanings: [{partOfSpeech: "v.", meaning: "接口验收释义"}, {partOfSpeech: "n.", meaning: "第二条释义"}], sentences: [{content: "First example.", cn: "第一句"}, {content: "Second example.", cn: "第二句"}], phrases: [{content: "first phrase", cn: "词组一"}, {content: "second phrase", cn: "词组二"}]};
assert.equal((await request("words/update", edited, other)).status, 404);
assert.equal((await request("words/delete", {id: created.id}, other)).status, 404);
assert.equal((await request("words/delete", {id: created.id}, uid, {origin: "https://invalid.test"})).status, 403);
const changed = (await ok("words/update", edited)).word;
assert.equal(changed.id, created.id); assert.equal(changed.meanings.length, 2); assert.equal(changed.phoneticUk, "UK");
const after = await ok("backup");
for (const field of ["data", "due", "version"]) assert.equal(after.cards[0][field], before.cards[0][field]);
const history = await ok("history?q=" + encodeURIComponent("接口验收释义")); assert.equal(history.total, 1);
await ok("words/delete", {id: created.id});
const deleted = await ok("backup");
assert.equal(deleted.words.length, 0); assert.equal(deleted.cards.length, 0); assert.equal(deleted.reviews.length, 0);
assert.equal((await ok("history")).total, 0);
assert.equal((await request("history/word?wordId=" + encodeURIComponent(created.id))).status, 404);
assert.equal((await ok("overview")).stats.pending, 0);
console.log("PASS: all-book lookup, case normalization, missing word, source selection, rich meanings/phonetics/examples/phrases, edit with preserved scheduling, tenant isolation, CSRF, full deletion, and pending-new count.");
