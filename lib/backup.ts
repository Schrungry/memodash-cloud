import { defaults, type Settings } from "./types.ts";

export type CloudBackup = { app: "MemoDashCloud"; version: 1; settings: Settings; words: any[]; cards: any[]; reviews: any[] };
const settingKeys = ["current_book_id", "daily_new_limit", "daily_review_limit", "fsrs_desired_retention", "timezone", "auto_play_audio", "auto_play_accent"];
const bookId = (id: string) => id === "custom_words" ? "custom" : id;
function iso(value: unknown): string {
  if (typeof value !== "string") throw new Error("备份中的日期无效");
  // Python's old backups may contain a naive ISO date. Legacy MemoDash treats it as UTC.
  const input = /(?:Z|[+-]\d\d:\d\d)$/i.test(value) ? value : value + "Z";
  const date = new Date(input);
  if (!Number.isFinite(+date)) throw new Error("备份中的日期无效");
  return date.toISOString();
}
function list(value: unknown, label: string): any[] {
  if (!Array.isArray(value) || value.some(row => !row || typeof row !== "object" || Array.isArray(row))) throw new Error(`备份中的${label}格式无效`);
  return value;
}
function pairs(value: unknown, label: string) {
  let data = value;
  try { if (typeof value === "string") data = JSON.parse(value); } catch { throw new Error(`备份中的${label}格式无效`); }
  return list(data || [], label).map(p => ({ content: p.content || "", cn: p.cn || "" }));
}
function safeSettings(input: any): Settings {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("备份中的学习设置格式无效");
  // Explicit allowlist also keeps obsolete credentials out of website-version imports.
  const result = Object.fromEntries(Object.keys(defaults).map(key => [key, input[key] ?? defaults[key as keyof Settings]])) as Settings;
  if (typeof result.currentBook !== "string" || typeof result.newLimit !== "number" || !Number.isInteger(result.newLimit) || result.newLimit < 0 || result.newLimit > 500 || typeof result.reviewLimit !== "number" || !Number.isInteger(result.reviewLimit) || result.reviewLimit < 0 || result.reviewLimit > 5000 || typeof result.retention !== "number" || !Number.isFinite(result.retention) || result.retention < .7 || result.retention > .99 || typeof result.autoAudio !== "boolean" || !["us", "uk"].includes(result.accent)) throw new Error("备份中的学习设置超出网站支持的范围");
  try { if (typeof result.timezone !== "string") throw 0; new Intl.DateTimeFormat("en", {timeZone: result.timezone}); } catch { throw new Error("备份中的学习时区无效"); }
  return result;
}

/** Parse and convert locally; the raw legacy file (including obsolete secrets) is never sent. */
export function normalizeBackup(text: string): CloudBackup {
  let backup: any;
  try { backup = JSON.parse(text.replace(/^\uFEFF/, "")); } catch { throw new Error("文件不是有效的 JSON 备份，请选择原 MemoDash 导出的备份文件"); }
  if (!backup || typeof backup !== "object") throw new Error("备份格式无效");
  if (backup.app === "MemoDashCloud" && backup.version === 1) {
    return {app: "MemoDashCloud", version: 1, settings: safeSettings(backup.settings), words: list(backup.words, "生词"), cards: list(backup.cards, "卡片"), reviews: list(backup.reviews, "复习记录")};
  }
  if (backup.app !== "MemoDash" || ![1, 2].includes(backup.version)) throw new Error("不支持此文件，请选择 MemoDash 原版完整备份（v2）或网站版备份");
  if (!Array.isArray(backup.words)) throw new Error("这份旧版备份缺少词条信息，无法匹配学习进度。请在原 MemoDash 中重新导出完整备份（v2），再导入");
  const settingsRows = list(backup.settings, "设置");
  const old: Record<string, any> = {};
  for (const row of settingsRows) {
    if (!settingKeys.includes(row.key)) continue;
    try { old[row.key] = typeof row.value === "string" ? JSON.parse(row.value) : row.value; } catch { throw new Error("备份中的学习设置不是有效的 JSON"); }
  }
  const settings = safeSettings({currentBook: bookId(old.current_book_id || ""), newLimit: old.daily_new_limit, reviewLimit: old.daily_review_limit, retention: old.fsrs_desired_retention, timezone: old.timezone, autoAudio: old.auto_play_audio, accent: old.auto_play_accent});
  const wordsById = new Map<number, any>();
  for (const w of list(backup.words, "词条")) {
    if (!Number.isSafeInteger(w.id) || wordsById.has(w.id) || typeof w.book_id !== "string" || !Number.isSafeInteger(w.rank) || typeof w.word !== "string" || !w.word.trim()) throw new Error("备份中存在无效或重复的词条编号");
    wordsById.set(w.id, w);
  }
  const wordId = (w: any) => `${bookId(w.book_id)}:${w.rank}`;
  const cardRows = list(backup.cards, "卡片");
  const cardsById = new Map<number, any>();
  for (const c of cardRows) {
    const w = wordsById.get(c.word_id);
    if (!Number.isSafeInteger(c.id) || cardsById.has(c.id) || !w || w.book_id !== c.book_id) throw new Error("备份卡片缺少对应词条或编号重复，请导出完整备份");
    cardsById.set(c.id, c);
  }
  const grouped = new Map<number, any[]>();
  const seenLogs = new Set<number>();
  for (const log of list(backup.review_logs, "复习记录")) {
    const card = cardsById.get(log.card_pk);
    if (!Number.isSafeInteger(log.id) || seenLogs.has(log.id) || !card || card.fsrs_card_id !== log.fsrs_card_id || ![1,2,3,4].includes(log.rating)) throw new Error("备份复习记录的卡片关联或评分无效");
    seenLogs.add(log.id);
    const normalized = {...log, at: iso(log.review_datetime)};
    const items = grouped.get(log.card_pk) || [];
    items.push(normalized); grouped.set(log.card_pk, items);
  }
  const words = [...wordsById.values()].filter(w => bookId(w.book_id) === "custom").map(w => ({id: wordId(w), bookId: "custom", rank: w.rank, word: w.word, phonetic: w.phonetic || "", phoneticUk: w.phonetic_uk || "", definition: w.definition || "", phrases: pairs(w.phrases, "短语"), sentences: pairs(w.sentences, "例句")}));
  const reviews: any[] = [];
  const dayFormat = new Intl.DateTimeFormat("en-CA", {timeZone: settings.timezone, year: "numeric", month: "2-digit", day: "2-digit"});
  const cards = cardRows.map(c => {
    const w = wordsById.get(c.word_id)!;
    const logs = (grouped.get(c.id) || []).sort((a,b) => a.at.localeCompare(b.at) || a.id-b.id);
    if (![1,2,3].includes(c.state) || (c.stability != null && (typeof c.stability !== "number" || !Number.isFinite(c.stability) || c.stability <= 0)) || (c.difficulty != null && (typeof c.difficulty !== "number" || !Number.isFinite(c.difficulty) || c.difficulty < 1 || c.difficulty > 10)) || (c.step != null && (!Number.isInteger(c.step) || c.step < 0))) throw new Error("备份中的卡片调度状态无效");
    const due = iso(c.due);
    const data = {due, last_review: c.last_review ? iso(c.last_review) : undefined, state: c.state, learning_steps: Math.min(c.step || 0, 1), stability: c.stability || 0, difficulty: c.difficulty || 0, elapsed_days: 0, scheduled_days: 0, reps: logs.length, lapses: logs.filter(l => l.rating === 1).length};
    logs.forEach((log,i) => reviews.push({id: `legacy:${log.id}`, word_id: wordId(w), book_id: bookId(w.book_id), word: w.word, rating: log.rating, reviewed_at: log.at, day: dayFormat.format(new Date(log.at)), is_new: Number(i === 0), duration: Math.min(3600000,Math.max(0,Math.round(log.review_duration || 0)))}));
    return {word_id: wordId(w), book_id: bookId(w.book_id), word: w.word, data: JSON.stringify(data), due, version: 1};
  });
  return {app: "MemoDashCloud", version: 1, settings, words, cards, reviews};
}
