import { env } from "cloudflare:workers";
import { gunzipSync, strFromU8 } from "fflate";
import catalogData from "./catalog.json";
import type { Book, Word } from "./types";
export const catalog: Book[] = catalogData;
export async function loadBook(id: string, origin: string): Promise<Word[]> {
  const book = catalog.find(b => b.id === id);
  if (!book) throw new Error("词书不存在");
  if (!env.BUCKET || !env.ASSETS) throw new Error("词书存储尚未就绪");
  const key = `wordbooks/v2/${id}.json`;
  const cached = await env.BUCKET.get(key);
  if (cached) return cached.json<Word[]>();
  const response = await env.ASSETS.fetch(new Request(`${origin}/wordbooks/${id}.json.gz`));
  if (!response.ok) throw new Error("预置词书暂时无法读取，请稍后重试");
  const bytes=new Uint8Array(await response.arrayBuffer());
  const words:Word[]=JSON.parse(strFromU8(bytes[0]===31&&bytes[1]===139?gunzipSync(bytes):bytes));
  if (!words.length || words.some(w => !w.word || !Number.isInteger(w.rank) || w.bookId!==id)) throw new Error("词书内容无效");
  await env.BUCKET.put(key, JSON.stringify(words), { httpMetadata: { contentType: "application/json; charset=utf-8" } });
  return words;
}
