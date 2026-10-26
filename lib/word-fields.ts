import type { Meaning, Word } from "./types";

export const partsOfSpeech = [
  ["n.", "名词"], ["v.", "动词"], ["vt.", "及物动词"], ["vi.", "不及物动词"],
  ["adj.", "形容词"], ["adv.", "副词"], ["pron.", "代词"], ["prep.", "介词"],
  ["conj.", "连词"], ["interj.", "感叹词"], ["num.", "数词"], ["art.", "冠词"],
  ["det.", "限定词"], ["aux.", "助动词"], ["modal.", "情态动词"],
  ["phr.", "短语"], ["abbr.", "缩写"], ["pref.", "前缀"], ["suf.", "后缀"], ["other", "其他 / 未标注"],
] as const;

export function normalizeHeadword(word: string) {
  return word.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function formatMeanings(meanings: Meaning[]) {
  return meanings.map(row => `${row.partOfSpeech === "other" ? "" : row.partOfSpeech + " "}${row.meaning.trim()}`).join("; ");
}

export function meaningsFor(word: Pick<Word, "definition" | "meanings">): Meaning[] {
  if (word.meanings?.length) return word.meanings.map(row => ({...row}));
  const pattern = /^([a-z]+\.)\s*/;
  const aliases: Record<string, string> = {"int.": "interj.", "inter.": "interj.", "interjection.": "interj.", "number.": "num.", "a.": "adj.", "determiner.": "det.", "conjunction.": "conj.", "vbl.": "v."};
  return (word.definition || "").split(/;\s*(?=[a-z]+\.\s)|\n/).filter(text => text.trim()).map(text => {
    const match = text.trim().match(pattern);
    const pos = match ? aliases[match[1]] || match[1] : "other";
    const recognized = partsOfSpeech.some(([value]) => value === pos) && pos !== "other";
    return {partOfSpeech: recognized ? pos : "other", meaning: recognized ? text.trim().replace(pattern, "") : text.trim()};
  });
}
