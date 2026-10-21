import { defaults, type Settings } from "./types.ts";

export type Backup = { app: "MemoDashCloud"; version: 1; settings: Settings; words: any[]; cards: any[]; reviews: any[] };

function records(value: unknown, label: string): any[] {
  if (!Array.isArray(value) || value.some(row => !row || typeof row !== "object" || Array.isArray(row))) throw new Error(`备份中的${label}格式无效`);
  return value;
}

function settings(input: any): Settings {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("备份中的学习设置格式无效");
  const result = Object.fromEntries(Object.keys(defaults).map(key => [key, input[key] ?? defaults[key as keyof Settings]])) as Settings;
  if (typeof result.currentBook !== "string" || typeof result.newLimit !== "number" || !Number.isInteger(result.newLimit) || result.newLimit < 0 || result.newLimit > 500 || typeof result.reviewLimit !== "number" || !Number.isInteger(result.reviewLimit) || result.reviewLimit < 0 || result.reviewLimit > 5000 || typeof result.retention !== "number" || !Number.isFinite(result.retention) || result.retention < .7 || result.retention > .99 || typeof result.autoAudio !== "boolean" || !["us", "uk"].includes(result.accent)) throw new Error("备份中的学习设置超出支持范围");
  try { if (typeof result.timezone !== "string") throw 0; new Intl.DateTimeFormat("en", {timeZone: result.timezone}); } catch { throw new Error("备份中的学习时区无效"); }
  return result;
}

export function parseBackup(text: string): Backup {
  let data: any;
  try { data = JSON.parse(text.replace(/^\uFEFF/, "")); } catch { throw new Error("文件不是有效的 JSON 备份，请选择从本站导出的备份文件"); }
  if (!data || typeof data !== "object" || data.app !== "MemoDashCloud" || data.version !== 1) throw new Error("备份格式不受支持，请选择从本站导出的备份文件");
  return {app: "MemoDashCloud", version: 1, settings: settings(data.settings), words: records(data.words, "生词"), cards: records(data.cards, "卡片"), reviews: records(data.reviews, "复习记录")};
}
