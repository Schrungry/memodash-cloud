export type Word = { id: string; bookId: string; rank: number; word: string; phonetic: string; phoneticUk: string; definition: string; phrases: {content: string; cn: string}[]; sentences: {content: string; cn: string}[] };
export type Book = { id: string; title: string; count: number; tags: string[]; description: string; url: string; bundled?: boolean };
export type Settings = { currentBook: string; newLimit: number; reviewLimit: number; retention: number; timezone: string; autoAudio: boolean; accent: "us" | "uk" };
export const defaults: Settings = { currentBook: "", newLimit: 20, reviewLimit: 200, retention: .9, timezone: "Asia/Shanghai", autoAudio: false, accent: "us" };
