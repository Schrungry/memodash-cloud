import { env } from "cloudflare:workers";
import { gunzipSync, strFromU8 } from "fflate";
import catalogData from "./catalog.json";
import examBookData from "./exam-books.json";
import type { Book, Word } from "./types";
export const catalog: Book[] = catalogData;
const examBooks = new Set<string>(examBookData);
function decode(bytes: Uint8Array) { return JSON.parse(strFromU8(bytes[0]===31&&bytes[1]===139?gunzipSync(bytes):bytes)); }
export async function loadBook(id: string, origin: string): Promise<Word[]> {
  const book = catalog.find(b => b.id === id);
  if (!book) throw new Error("词书不存在");
  if (!env.BUCKET || !env.ASSETS) throw new Error("词书存储尚未就绪");
  const key = `wordbooks/${examBooks.has(id)?"v3":"v2"}/${id}.json`;
  const cached = await env.BUCKET.get(key);
  if (cached) return cached.json<Word[]>();
  const response = await env.ASSETS.fetch(new Request(`${origin}/wordbooks/${id}.json.gz`));
  if (!response.ok) throw new Error("预置词书暂时无法读取，请稍后重试");
  const bytes=new Uint8Array(await response.arrayBuffer());
  const words:Word[]=decode(bytes);
  if (!words.length || words.some(w => !w.word || !Number.isInteger(w.rank) || w.bookId!==id)) throw new Error("词书内容无效");
  if (examBooks.has(id)) {
    try {
      const examResponse = await env.ASSETS.fetch(new Request(`${origin}/exams/${id}.json.gz`));
      if (!examResponse.ok) return words;
      const questions:Record<string,Word["exams"]> = decode(new Uint8Array(await examResponse.arrayBuffer()));
      for (const word of words) if (questions[String(word.rank)]?.length) word.exams=questions[String(word.rank)];
    } catch {
      // A transient question-asset failure should leave ordinary cards usable.
      return words;
    }
  }
  await env.BUCKET.put(key, JSON.stringify(words), { httpMetadata: { contentType: "application/json; charset=utf-8" } });
  return words;
}
