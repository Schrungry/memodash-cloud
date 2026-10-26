import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

// Compact lookup previews, split into 16 assets so one search reads one small shard.
export function prepareWordIndex() {
  const root = new URL("../", import.meta.url);
  const books = JSON.parse(readFileSync(new URL("lib/catalog.json", root), "utf8"));
  const shards = Array.from({length: 16}, () => Object.create(null));
  let count = 0;
  for (const [index, book] of books.entries()) {
    const words = JSON.parse(gunzipSync(readFileSync(new URL(`public/wordbooks/${book.id}.json.gz`, root))));
    for (const word of words) {
      const key = word.word.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
      const shard = shards[parseInt(createHash("sha256").update(key).digest("hex")[0], 16)];
      (shard[key] ??= []).push([index, word.rank, word.word, word.definition, word.phonetic || "", word.phoneticUk || ""]);
      count++;
    }
  }
  const target = new URL("public/word-index/v1/", root);
  mkdirSync(target, {recursive: true});
  for (const [index, shard] of shards.entries()) {
    writeFileSync(new URL(`${index.toString(16)}.json.gz`, target), gzipSync(JSON.stringify(shard), {level: 9}));
  }
  console.log(`Prepared lookup index: ${count} entries across ${books.length} books, 16 shards.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) prepareWordIndex();
