import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { formatMeanings, meaningsFor, normalizeHeadword, partsOfSpeech } from "../lib/word-fields.ts";
import { prepareWordIndex } from "../scripts/prepare-word-index.mjs";

test("legacy definitions become editable meanings without losing their text", () => {
  const definition = "v. 获取; n. 接近，入口；访问";
  assert.equal(formatMeanings(meaningsFor({definition})), definition);
  assert.deepEqual(meaningsFor({definition: "没有词性的旧释义"}), [{partOfSpeech: "other", meaning: "没有词性的旧释义"}]);
  const meanings = [{partOfSpeech: "adj.", meaning: "清晰的"}];
  assert.deepEqual(meaningsFor({definition: "ignored", meanings}), meanings);
  assert.deepEqual(meaningsFor({definition: "int. 喂！"}), [{partOfSpeech: "interj.", meaning: "喂！"}]);
  assert.deepEqual(meaningsFor({definition: "unknown. 保留原文"}), [{partOfSpeech: "other", meaning: "unknown. 保留原文"}]);
  assert.equal(new Set(partsOfSpeech.map(([pos]) => pos)).size, partsOfSpeech.length);
});

test("lookup normalizes case, Unicode width, and whitespace", () => {
  assert.equal(normalizeHeadword("  ＡＣＣＥＳＳ  "), "access");
  assert.equal(normalizeHeadword("in   front of"), "in front of");
});

test("sharded lookup covers all source entries, including words found in multiple books", () => {
  if (!existsSync(new URL("../public/word-index/v1/0.json.gz", import.meta.url))) prepareWordIndex();
  const books = JSON.parse(readFileSync(new URL("../lib/catalog.json", import.meta.url), "utf8"));
  let count = 0;
  const shards = Array.from({length: 16}, (_, i) => JSON.parse(gunzipSync(readFileSync(new URL(`../public/word-index/v1/${i.toString(16)}.json.gz`, import.meta.url)))));
  for (const [index, book] of books.entries()) {
    const words = JSON.parse(gunzipSync(readFileSync(new URL(`../public/wordbooks/${book.id}.json.gz`, import.meta.url))));
    for (const word of words) {
      const key = normalizeHeadword(word.word), shard = parseInt(createHash("sha256").update(key).digest("hex")[0], 16);
      assert.ok(shards[shard][key].some(row => row[0] === index && row[1] === word.rank && row[3] === word.definition), word.id);
      count++;
    }
  }
  assert.equal(count, 153009);
  const key = "access", shard = parseInt(createHash("sha256").update(key).digest("hex")[0], 16);
  assert.ok(new Set(shards[shard][key].map(row => row[0])).size > 1);
});
