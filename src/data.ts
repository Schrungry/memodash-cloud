// MemoDash 客户端数据层：替代原 Cloudflare D1 + /api/* 服务端。
// 所有数据通过 WorkBuddy 云服务 SDK 访问，RLS 按用户隔离（owner_id = auth.uid()）。
import { gunzipSync, strFromU8 } from "fflate";
import { cloud } from "./cloud";
import catalogData from "../lib/catalog.json";
import examBookData from "../lib/exam-books.json";
import { defaults, type Book, type Settings, type Word, type HistoryRow, type WordHistory } from "../lib/types";
import { formatMeanings, normalizeHeadword, partsOfSpeech } from "../lib/word-fields";
import { localDay, outcomes, review, scheduler, reviveCard } from "../lib/study";
import { memoryTimeline, readMemoryCard, type ReviewRecord } from "../lib/memory";

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }

const catalog: Book[] = catalogData as unknown as Book[];
const examBooks = new Set<string>(examBookData as unknown as string[]);

function unwrap<T>({ data, error }: { data: T; error: any }): T {
  if (error) {
    if (Number(error.status) === 401) throw new HttpError(401, "登录已过期，请重新登录");
    if (error.code === "42501") throw new HttpError(403, "没有权限执行此操作，请重新登录后再试");
    if (error.code === "23505") throw new HttpError(409, "记录已存在");
    throw new HttpError(503, "服务暂时无法完成请求，请稍后重试");
  }
  return data;
}
const iso = (v: string | Date) => new Date(v).toISOString();
const cardStr = (data: unknown): string | null => (data == null ? null : JSON.stringify(data));

// ---------- 词书（静态资源，所有用户共享） ----------
function decode(bytes: Uint8Array) { return JSON.parse(strFromU8(bytes[0] === 31 && bytes[1] === 139 ? gunzipSync(bytes) : bytes)); }
const bookCache = new Map<string, Promise<Word[]>>();
export function loadBook(id: string): Promise<Word[]> {
  let cached = bookCache.get(id);
  if (!cached) {
    cached = fetchBook(id);
    bookCache.set(id, cached);
    cached.catch(() => bookCache.delete(id));
  }
  return cached;
}
async function fetchBook(id: string): Promise<Word[]> {
  const book = catalog.find(b => b.id === id);
  if (!book) throw new HttpError(404, "词书不存在");
  const response = await fetch(`/wordbooks/${id}.json.gz`);
  if (!response.ok) throw new HttpError(503, "预置词书暂时无法读取，请稍后重试");
  const words: Word[] = decode(new Uint8Array(await response.arrayBuffer()));
  if (!words.length || words.some(w => !w.word || !Number.isInteger(w.rank) || w.bookId !== id)) throw new HttpError(500, "词书内容无效");
  if (examBooks.has(id)) {
    try {
      const examResponse = await fetch(`/exams/${id}.json.gz`);
      if (examResponse.ok) {
        const questions: Record<string, Word["exams"]> = decode(new Uint8Array(await examResponse.arrayBuffer()));
        for (const word of words) if (questions[String(word.rank)]?.length) word.exams = questions[String(word.rank)];
      }
    } catch { /* 题库资源暂时失败不影响普通卡片 */ }
  }
  return words;
}

// ---------- 设置 ----------
export async function settingsFor(): Promise<Settings> {
  const row = unwrap(await cloud.database.from("profiles").select("settings").maybeSingle());
  return { ...defaults, ...(row?.settings || {}) };
}
export function validateSettings(input: any): Settings {
  if (!input || typeof input !== "object") throw new HttpError(400, "设置格式无效");
  const s: Settings = { currentBook: input.currentBook, newLimit: input.newLimit, reviewLimit: input.reviewLimit, retention: input.retention, timezone: input.timezone, autoAudio: input.autoAudio, accent: input.accent };
  if (typeof s.currentBook !== "string" || (s.currentBook && s.currentBook !== "custom" && !catalog.some(b => b.id === s.currentBook))) throw new HttpError(400, "请选择有效词书");
  if (!Number.isInteger(s.newLimit) || s.newLimit < 0 || s.newLimit > 500 || !Number.isInteger(s.reviewLimit) || s.reviewLimit < 0 || s.reviewLimit > 5000) throw new HttpError(400, "新词上限应为 0–500，复习上限应为 0–5000");
  if (typeof s.retention !== "number" || !Number.isFinite(s.retention) || s.retention < .7 || s.retention > .99) throw new HttpError(400, "目标保留率应为 70%–99%");
  try { if (typeof s.timezone !== "string") throw 0; new Intl.DateTimeFormat("en", { timeZone: s.timezone }); } catch { throw new HttpError(400, "时区无效"); }
  if (typeof s.autoAudio !== "boolean" || !["us", "uk"].includes(s.accent)) throw new HttpError(400, "发音设置无效");
  return s;
}
export async function saveSettings(s: Settings) {
  unwrap(await cloud.database.from("profiles").upsert({ settings: s }).select());
}

// ---------- 生词本 ----------
export async function customFor(): Promise<Word[]> {
  const rows = unwrap(await cloud.database.from("custom_words").select("data").order("created_at", { ascending: false }));
  return (rows || []).map((r: any) => r.data as Word);
}
async function wordsFor(s: Settings): Promise<Word[]> {
  const custom = await customFor();
  return s.currentBook && s.currentBook !== "custom" ? [...custom, ...await loadBook(s.currentBook)] : custom;
}
export function validateWord(input: any): Omit<Word, "id" | "rank" | "bookId"> {
  if (!input || typeof input !== "object") throw new HttpError(400, "生词格式无效");
  const text = (v: any, max: number, required = false) => { if (typeof v !== "string" || v.length > max || (required && !v.trim())) throw new HttpError(400, "请填写有效的单词和释义，并控制字段长度"); return v.trim(); };
  const pairs = (a: any) => { if (!Array.isArray(a) || a.length > 100) throw new HttpError(400, "短语或例句格式无效，每类最多 100 条"); return a.map(p => { if (!p || typeof p !== "object") throw new HttpError(400, "短语或例句格式无效"); return { content: text(p.content, 2000), cn: text(p.cn, 2000) }; }); };
  let meanings;
  if (input.meanings !== undefined) {
    if (!Array.isArray(input.meanings) || !input.meanings.length || input.meanings.length > 30) throw new HttpError(400, "请填写 1–30 条中文释义");
    meanings = input.meanings.map((row: any) => {
      if (!row || !partsOfSpeech.some(([pos]) => pos === row.partOfSpeech)) throw new HttpError(400, "请从列表中选择词性");
      return { partOfSpeech: row.partOfSpeech, meaning: text(row.meaning, 2000, true) };
    });
  }
  let source;
  if (input.source !== undefined) {
    if (!input.source || !catalog.some(book => book.id === input.source.bookId) || typeof input.source.wordId !== "string" || input.source.wordId.length > 200 || !input.source.wordId.startsWith(`${input.source.bookId}:`)) throw new HttpError(400, "词书来源无效");
    source = { bookId: input.source.bookId, wordId: input.source.wordId };
  }
  return { word: text(input.word, 120, true), definition: text(meanings ? formatMeanings(meanings) : input.definition, 4000, true), ...(meanings ? { meanings } : {}), ...(source ? { source } : {}), phonetic: text(input.phonetic || "", 150), phoneticUk: text(input.phoneticUk || "", 150), phrases: pairs(input.phrases || []), sentences: pairs(input.sentences || []) };
}
export async function addWord(input: any) {
  const valid = validateWord(input);
  const id = `custom:${crypto.randomUUID()}`;
  const w: Word = { ...valid, id, bookId: "custom", rank: Date.now() };
  unwrap(await cloud.database.from("custom_words").insert({ id, data: w }).select());
  return { word: w };
}
function customWordId(id: unknown): string {
  if (typeof id !== "string" || !id.startsWith("custom:") || id.length > 200) throw new HttpError(400, "生词编号无效");
  return id;
}
// 编辑生词：只改词条内容，卡片与历史记录上的序号/进度保留。
export async function updateWord(input: any) {
  const id = customWordId(input?.id), valid = validateWord(input);
  const old = unwrap(await cloud.database.from("custom_words").select("data").eq("id", id).maybeSingle()) as { data: Word } | null;
  if (!old) throw new HttpError(404, "生词不存在");
  const previous = old.data as Word, word: Word = { ...valid, id, bookId: "custom", rank: previous.rank };
  await Promise.all([
    unwrap(await cloud.database.from("custom_words").update({ data: word }).eq("id", id).select()),
    unwrap(await cloud.database.from("cards").update({ word: word.word }).eq("word_id", id).select()),
    unwrap(await cloud.database.from("reviews").update({ word: word.word }).eq("word_id", id).select()),
    unwrap(await cloud.database.from("history_words").update({ word: word.word, definition: word.definition }).eq("word_id", id).select()),
  ]);
  return { word };
}
export async function deleteWord(input: any) {
  const id = customWordId(input?.id);
  const existing = unwrap(await cloud.database.from("custom_words").select("id").eq("id", id).maybeSingle());
  if (!existing) throw new HttpError(404, "生词不存在");
  for (const [table, column] of [["reviews", "word_id"], ["history_words", "word_id"], ["cards", "word_id"], ["custom_words", "id"]] as const) {
    unwrap(await cloud.database.from(table).delete().eq(column, id));
  }
  return { ok: true };
}
// 全词书查词：只读取按首字符分片的检索索引中的一个分片。
export async function lookupBookWords(query: string) {
  const key = normalizeHeadword(query);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key)));
  const shard = (hash[0] >> 4).toString(16);
  const response = await fetch(`/word-index/v1/${shard}.json.gz`);
  if (!response.ok) throw new HttpError(503, "词书检索暂时不可用，请稍后重试");
  const entries = decode(new Uint8Array(await response.arrayBuffer()));
  const matches = (Object.hasOwn(entries, key) ? entries[key] : []) as [number, number, string, string, string, string][];
  return { matches: matches.map(([index, rank, word, definition, phonetic, phoneticUk]) => ({ bookId: catalog[index].id, bookTitle: catalog[index].title, wordId: `${catalog[index].id}:${rank}`, word, definition, phonetic, phoneticUk })), booksSearched: catalog.length };
}

// ---------- 学习概览 ----------
type DayCount = { day: string; total: number | string; new_count: number | string; review_count: number | string };
async function dayCounts(): Promise<DayCount[]> {
  return unwrap(await cloud.database.rpc("daily_review_counts")) || [];
}
export async function overview() {
  const s = await settingsFor(), day = localDay(s.timezone);
  const [cards, counts, customRes] = await Promise.all([
    unwrap(await cloud.database.from("cards").select("book_id,data,due")),
    dayCounts(),
    cloud.database.from("custom_words").select("id", { count: "exact", head: true }),
  ]);
  if (customRes.error) throw new HttpError(503, "服务暂时无法完成请求，请稍后重试");
  const customCount = Number(customRes.count || 0);
  const today = counts.find(r => r.day === day);
  const all = (cards || []) as { book_id: string; data: unknown; due: string }[];
  const active = all.filter(c => c.book_id === s.currentBook || c.book_id === "custom");
  const now = new Date(), states = [0, 0, 0, 0], fsrs = scheduler(s);
  let retention = 0, n = 0;
  const learnedCounts = new Map<string, number>();
  for (const row of all) {
    learnedCounts.set(row.book_id, (learnedCounts.get(row.book_id) || 0) + 1);
    const c = reviveCard(cardStr(row.data));
    states[c.state]++;
    if (c.last_review && c.stability > 0) { retention += Number(fsrs.get_retrievability(c, now, false)); n++; }
  }
  const learned = learnedCounts.get(s.currentBook) || 0;
  const due = active.filter(c => new Date(c.due) <= now).length;
  const book = catalog.find(b => b.id === s.currentBook);
  const total = s.currentBook === "custom" ? customCount : book?.count || 0;
  const availableNew = Math.max(0, (book?.count || 0) + customCount - active.length);
  const newRemaining = Math.min(availableNew, Math.max(0, s.newLimit - Number(today?.new_count || 0)));
  const reviewRemaining = s.reviewLimit ? Math.min(due, Math.max(0, s.reviewLimit - Number(today?.review_count || 0))) : due;
  return {
    settings: s,
    stats: { today: day, newToday: Number(today?.new_count || 0), reviewedToday: Number(today?.review_count || 0), totalToday: Number(today?.total || 0), due, newRemaining, reviewRemaining, pending: newRemaining + reviewRemaining, learned, total, allLearned: all.length, retention: n ? Math.round(retention / n * 100) : null, states, customCount },
    series: counts.map(r => ({ day: r.day, count: Number(r.total) })),
    books: catalog.map(({ url, ...b }) => ({ ...b, learnedCount: learnedCounts.get(b.id) || 0 })),
  };
}

// ---------- 学习队列 ----------
export type PreparedNext = { wordId: string; version: number };
export async function nextCard(prepared?: PreparedNext) {
  const s = await settingsFor(); const now = new Date(); const day = localDay(s.timezone, now);
  const nowIso = now.toISOString();
  const [words, cardsRaw, counts] = await Promise.all([
    wordsFor(s),
    unwrap(await cloud.database.from("cards").select("word_id,data,due,version").in("book_id", [s.currentBook, "custom"]).order("due")),
    dayCounts(),
  ]);
  const cards = ((cardsRaw || []) as any[]).map(c => ({ ...c, due: iso(c.due) }));
  const today = counts.find(r => r.day === day);
  const map = new Map(words.map(w => [w.id, w]));
  const due = cards.filter(c => c.due <= nowIso && map.has(c.word_id));
  const learned = new Set(cards.map(c => c.word_id));
  // 当前卡与下一张预取卡来自同一份只读快照：预取不建卡、不推进学习，只提前算出来。
  const choose = (completed?: { id: string; isNew: boolean }, preferred?: PreparedNext): any => {
    const remainingDue = completed ? due.filter(c => c.word_id !== completed.id) : due;
    const canReview = !s.reviewLimit || Number(today?.review_count || 0) + (completed && !completed.isNew ? 1 : 0) < s.reviewLimit;
    const canLearn = Number(today?.new_count || 0) + (completed?.isNew ? 1 : 0) < s.newLimit;
    let row = canReview ? remainingDue[0] : undefined;
    let word = row ? map.get(row.word_id) : canLearn ? words.find(w => !learned.has(w.id) && w.id !== completed?.id) : undefined;
    // 屏幕上已有卡片时保持它是当前卡；确认前仍要校验范围、版本、到期状态与额度。
    if (preferred && preferred.wordId !== completed?.id) {
      const target = map.get(preferred.wordId), existing = cards.find(c => c.word_id === preferred.wordId);
      if (target && (existing ? canReview && existing.version === preferred.version && remainingDue.includes(existing) : canLearn && preferred.version === 0)) { row = existing; word = target; }
    }
    if (!word) return { word: null, due: remainingDue.length, nextDue: cards.find(c => c.word_id !== completed?.id && c.due > nowIso)?.due || null, reason: !words.length ? "选择词书或添加生词，开始你的第一次学习。" : !canReview && remainingDue.length ? "今日复习额度已完成，明天继续。" : "当前学习任务已完成，稍后再来看看。" };
    return { word, version: row?.version || 0, isNew: !row, outcomes: outcomes(row ? cardStr(row.data) : null, s, now), due: remainingDue.length };
  };
  const current = choose(undefined, prepared);
  return current.word ? { ...current, next: choose({ id: current.word.id, isNew: current.isNew }) } : current;
}

// ---------- 提交评分（事务在数据库函数内完成） ----------
export async function submitReview(input: any) {
  if (!input || typeof input.wordId !== "string" || ![1, 2, 3, 4].includes(input.rating) || !Number.isInteger(input.version) || input.version < 0 || typeof input.requestId !== "string" || !/^[\da-f-]{36}$/i.test(input.requestId)) throw new HttpError(400, "评分格式无效");
  const prepared = input.preparedNext as PreparedNext | undefined;
  if (prepared !== undefined && (!prepared || typeof prepared.wordId !== "string" || !prepared.wordId || prepared.wordId.length > 200 || !Number.isInteger(prepared.version) || prepared.version < 0)) throw new HttpError(400, "预取卡片格式无效");
  const includeNext = input.includeNext === true;
  const s = await settingsFor(), now = new Date(), day = localDay(s.timezone, now);
  const word = (await wordsFor(s)).find(w => w.id === input.wordId);
  if (!word) throw new HttpError(404, "当前学习列表中没有此单词");
  const old = unwrap(await cloud.database.from("cards").select("data,version,due").eq("word_id", word.id).maybeSingle());
  if ((old?.version || 0) !== input.version || (old && new Date(old.due) > now)) throw new HttpError(409, "卡片已在其他窗口更新，请刷新学习队列");
  const card = review(old ? cardStr(old.data) : null, input.rating, s, now);
  const duration = Number.isFinite(input.duration) ? Math.min(3600000, Math.max(0, Math.round(input.duration))) : 0;
  const isNew = old ? 0 : 1;
  const limit = old ? s.reviewLimit || 2147483647 : s.newLimit;
  const result = unwrap(await cloud.database.rpc("submit_review", {
    p_word_id: word.id, p_book_id: word.bookId, p_word: word.word, p_definition: word.definition,
    p_rating: input.rating, p_version: input.version, p_request_id: input.requestId,
    p_card: card as any, p_due: card.due.toISOString(), p_day: day, p_is_new: isNew,
    p_duration: duration, p_limit: limit, p_now: now.toISOString(),
  }));
  if (!result?.ok) throw new HttpError(409, result?.message || "学习额度或卡片状态已更新，请刷新后继续");
  // 写入已提交。预取队列读失败不能表现得像保存失败。
  if (includeNext) {
    try { return { ok: true, next: await nextCard(prepared) }; }
    catch (error) { console.error("Next card preparation failed", error instanceof Error ? error.message : "unknown"); }
  }
  return { ok: true };
}

// ---------- 学习记录 ----------
const bookTitle = (id: string) => id === "custom" ? "我的生词本" : catalog.find(book => book.id === id)?.title || "未知词书";
async function ensureHistoryWords(wordId?: string) {
  const missing = unwrap(await cloud.database.rpc("missing_history_words", { p_word_id: wordId ?? null })) as { word_id: string; book_id: string; word: string }[] | null;
  if (!missing?.length) return;
  const groups = new Map<string, typeof missing>();
  for (const row of missing) { const group = groups.get(row.book_id); if (group) group.push(row); else groups.set(row.book_id, [row]); }
  for (const [bid, rows] of groups) {
    const words = bid === "custom" ? await customFor() : await loadBook(bid);
    const definitions = new Map(words.map(word => [word.id, word.definition]));
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50).map(row => ({ word_id: row.word_id, book_id: row.book_id, word: row.word, definition: definitions.get(row.word_id) || "" }));
      unwrap(await cloud.database.from("history_words").upsert(batch, { ignoreDuplicates: true }).select());
    }
  }
}
export async function history(page = 0, search = "") {
  await ensureHistoryWords();
  const result = unwrap(await cloud.database.rpc("review_history", { p_page: page, p_search: search.trim() }));
  const total = Number(result?.total || 0);
  const reviews = ((result?.reviews || []) as Omit<HistoryRow, "bookTitle">[]).map(row => ({ ...row, reviewed_at: iso(row.reviewed_at), bookTitle: bookTitle(row.book_id) }));
  return { reviews, total, hasMore: (page + 1) * 50 < total };
}
export async function wordHistory(wordId: string): Promise<WordHistory> {
  await ensureHistoryWords(wordId);
  const [reviewsRaw, card, word, settings] = await Promise.all([
    unwrap(await cloud.database.from("reviews").select("id,rating,reviewed_at,duration,is_new,card_data").eq("word_id", wordId).order("reviewed_at").order("id")),
    unwrap(await cloud.database.from("cards").select("data,due").eq("word_id", wordId).maybeSingle()),
    unwrap(await cloud.database.from("history_words").select("word,definition,book_id").eq("word_id", wordId).maybeSingle()),
    settingsFor(),
  ]);
  if (!word) throw new HttpError(404, "没有找到这个单词的学习记录");
  const records = ((reviewsRaw || []) as any[]).map(r => ({ ...r, reviewed_at: iso(r.reviewed_at) })) as ReviewRecord[];
  return { wordId, word: word.word, definition: word.definition, bookTitle: bookTitle(word.book_id), due: card?.due ? iso(card.due) : null, ...memoryTimeline(records, settings, card ? cardStr(card.data) : null) };
}

// ---------- 备份导出 / 导入 ----------
export async function exportBackup() {
  const [cards, reviews] = await Promise.all([
    unwrap(await cloud.database.from("cards").select("word_id,book_id,word,data,due,version").order("word_id")),
    unwrap(await cloud.database.from("reviews").select("id,word_id,book_id,word,rating,reviewed_at,day,is_new,duration,card_data").order("reviewed_at")),
  ]);
  return {
    app: "MemoDashCloud", version: 1, exportedAt: new Date().toISOString(),
    settings: await settingsFor(),
    words: await customFor(),
    cards: (cards || []).map((c: any) => ({ ...c, data: JSON.stringify(c.data), due: iso(c.due) })),
    reviews: (reviews || []).map((r: any) => ({ ...r, reviewed_at: iso(r.reviewed_at), card_data: r.card_data == null ? null : JSON.stringify(r.card_data) })),
  };
}
export async function importBackup(input: any) {
  if (!input || !["words", "cards", "reviews", "settings"].includes(input.kind)) throw new HttpError(400, "导入格式无效");
  if (input.kind === "settings") { await saveSettings(validateSettings(input.settings)); return { ok: true }; }
  if (!Array.isArray(input.rows) || input.rows.length > 50) throw new HttpError(400, "每次最多导入 50 条记录");
  const text = (v: any, max = 200) => { if (typeof v !== "string" || !v.length || v.length > max) throw new HttpError(400, "备份包含无效文本"); return v; };
  const isoCheck = (v: any) => { if (typeof v !== "string" || !Number.isFinite(+new Date(v))) throw new HttpError(400, "备份时间无效"); return new Date(v).toISOString(); };
  const rows: any[] = [];
  const dependencies = new Set<string>();
  for (const row of input.rows) {
    if (!row || typeof row !== "object") throw new HttpError(400, "备份记录无效");
    if (input.kind === "words") {
      const w = validateWord(row); const id = text(row.id);
      if (!id.startsWith("custom:") || !Number.isSafeInteger(row.rank)) throw new HttpError(400, "生词编号无效");
      rows.push({ id, data: { ...w, id, bookId: "custom", rank: row.rank }, created_at: new Date().toISOString() });
      continue;
    }
    const wordId = text(row.word_id), bookId = text(row.book_id), word = text(row.word, 120);
    if (bookId !== "custom" && !catalog.some(b => b.id === bookId)) throw new HttpError(400, "备份词书无效");
    if (!wordId.startsWith(`${bookId}:`)) throw new HttpError(400, "词条编号与词书不匹配");
    if (input.kind === "cards") {
      if (bookId === "custom") dependencies.add(wordId);
      let c; try { c = typeof row.data === "string" ? JSON.parse(row.data) : row.data; } catch { throw new HttpError(400, "卡片格式无效"); }
      if (!c || ![0, 1, 2, 3].includes(c.state) || ![c.stability, c.difficulty, c.elapsed_days, c.scheduled_days, c.learning_steps, c.reps, c.lapses].every(v => typeof v === "number" && Number.isFinite(v) && v >= 0) || c.difficulty > 10 || c.stability > 100000 || !Number.isInteger(c.learning_steps) || c.learning_steps > 1 || !Number.isInteger(c.reps) || !Number.isInteger(c.lapses)) throw new HttpError(400, "卡片调度状态无效");
      const due = isoCheck(c.due), last = c.last_review ? isoCheck(c.last_review) : undefined;
      const safe = { due, last_review: last, state: c.state, stability: c.stability, difficulty: c.difficulty, elapsed_days: c.elapsed_days, scheduled_days: c.scheduled_days, learning_steps: c.learning_steps, reps: c.reps, lapses: c.lapses };
      rows.push({ word_id: wordId, book_id: bookId, word, data: safe, due, version: 1 });
    } else {
      if (![1, 2, 3, 4].includes(row.rating) || ![0, 1].includes(row.is_new) || !Number.isInteger(row.duration) || row.duration < 0 || row.duration > 3600000 || typeof row.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.day)) throw new HttpError(400, "复习日志无效");
      const at = isoCheck(row.reviewed_at), id = text(row.id, 250);
      dependencies.add(wordId);
      const snapshot = row.card_data == null ? null : readMemoryCard(row.card_data);
      if (row.card_data != null && (!snapshot || Number(snapshot.last_review) !== +new Date(at))) throw new HttpError(400, "复习记录中的记忆状态无效");
      rows.push({ id, word_id: wordId, book_id: bookId, word, rating: row.rating, reviewed_at: at, day: row.day, is_new: row.is_new, duration: row.duration, card_data: snapshot });
    }
  }
  if (dependencies.size) {
    const ids = [...dependencies];
    const column = input.kind === "cards" ? "id" : "word_id";
    const table = input.kind === "cards" ? "custom_words" : "cards";
    const found = new Set(((unwrap(await cloud.database.from(table).select(column).in(column, ids)) || []) as any[]).map(row => row[column]));
    if (ids.some(id => !found.has(id))) throw new HttpError(400, input.kind === "cards" ? "请先导入对应生词" : "请先导入对应卡片");
  }
  if (rows.length) unwrap(await cloud.database.from(input.kind === "words" ? "custom_words" : input.kind).upsert(rows, { ignoreDuplicates: true }).select());
  return { ok: true, processed: rows.length };
}

// ---------- /api/* 兼容入口（供既有组件调用） ----------
export async function api(path: string, body?: unknown): Promise<any> {
  try {
    const [route, query] = path.split("?");
    const params = new URLSearchParams(query || "");
    if (body === undefined) {
      if (route === "overview") return await overview();
      if (route === "study") return await nextCard();
      if (route === "words") return { words: await customFor() };
      if (route === "words/lookup") {
        const q = params.get("q") || "";
        if (!q.trim() || q.length > 120) throw new HttpError(400, "请输入不超过 120 字符的单词");
        return await lookupBookWords(q);
      }
      if (route === "words/source") {
        const bookId = params.get("bookId"), wordId = params.get("wordId");
        if (!bookId || !catalog.some(book => book.id === bookId) || !wordId || wordId.length > 200 || !wordId.startsWith(`${bookId}:`)) throw new HttpError(400, "词书来源无效");
        const word = (await loadBook(bookId)).find(word => word.id === wordId);
        if (!word) throw new HttpError(404, "词条不存在");
        return { word };
      }
      if (route === "backup") return await exportBackup();
      if (route === "history") {
        const p = Number(params.get("page") || 0), q = params.get("q") || "";
        if (!Number.isInteger(p) || p < 0 || p > 10000 || q.length > 120) throw new HttpError(400, "页码或搜索内容无效");
        return await history(p, q);
      }
      if (route === "history/word") {
        const id = params.get("wordId");
        if (!id || id.length > 200) throw new HttpError(400, "单词编号无效");
        return await wordHistory(id);
      }
    } else {
      if (route === "review") return await submitReview(body);
      if (route === "settings") { const s = validateSettings(body); await saveSettings(s); return { settings: s }; }
      if (route === "words") return await addWord(body);
      if (route === "words/update") return await updateWord(body);
      if (route === "words/delete") return await deleteWord(body);
      if (route === "import") return await importBackup(body);
    }
    throw new HttpError(404, "接口不存在");
  } catch (error) {
    if (error instanceof HttpError) throw new Error(error.message);
    if (error instanceof Error && error.message) throw error;
    throw new Error("服务暂时无法完成请求，请稍后重试");
  }
}
