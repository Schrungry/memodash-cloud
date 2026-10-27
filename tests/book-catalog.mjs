import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { bookCategories, matchesBookCategory, matchesBookSearch } from "../lib/book-catalog.ts";

const books = JSON.parse(readFileSync(new URL("../lib/catalog.json", import.meta.url), "utf8"));

test("the Chinese TOEFL category finds both existing TOEFL books", () => {
  assert.deepEqual(books.filter(book => matchesBookCategory(book, "托福")).map(book => [book.id, book.count]), [["TOEFL_2", 9213], ["TOEFL_3", 4264]]);
  assert.ok(bookCategories(books).includes("托福"));
  assert.deepEqual(books.filter(book => matchesBookSearch(book, "托福")), books.filter(book => matchesBookSearch(book, " TOEFL ")));
});

test("only categories with matching books are offered", () => {
  const withoutToefl = books.filter(book => !book.id.startsWith("TOEFL"));
  assert.ok(!bookCategories(withoutToefl).includes("托福"));
  assert.deepEqual(bookCategories([]), ["全部"]);
  for (const category of bookCategories(books)) assert.ok(books.some(book => matchesBookCategory(book, category)));
});
