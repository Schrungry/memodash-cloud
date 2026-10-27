import type { Book } from "./types";

function searchText(text: string) {
  return text.normalize("NFKC").trim().toLowerCase().replace(/托福/g, "toefl").replace(/雅思/g, "ielts");
}

export function matchesBookCategory(book: Book, category: string) {
  if (category === "全部") return true;
  const query = searchText(category);
  return book.tags.some(tag => searchText(tag) === query) || searchText(book.title).includes(query);
}

export function matchesBookSearch(book: Book, query: string) {
  return searchText(`${book.title} ${book.tags.join(" ")}`).includes(searchText(query));
}

export function bookCategories(books: Book[]) {
  return ["全部", "四级", "六级", "考研", "雅思", "托福", "GRE"].filter(category => category === "全部" || books.some(book => matchesBookCategory(book, category)));
}
