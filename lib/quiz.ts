import type { ExamQuestion, Word } from "./types";

export const REVIEW_QUESTION_PROBABILITY = 0.35;

export type ReviewQuestion =
  | { kind: "cloze"; prompt: string; answer: string; sentence: {content: string; cn: string} }
  | { kind: "choice"; prompt: string; choices: ExamQuestion["choices"]; rightIndex: number; explanation: string };

function clozeCandidates(word: Word): Extract<ReviewQuestion, {kind: "cloze"}>[] {
  const target = word.word.trim();
  if (target.length < 2 || target.length > 80) return [];
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^|[^A-Za-z])(${escaped})(?=$|[^A-Za-z])`, "i");
  return (word.sentences || []).flatMap(sentence => {
    const content = sentence.content?.trim();
    if (!content || content.length > 320 || /_{2,}/.test(content)) return [];
    const match = pattern.exec(content);
    if (!match) return [];
    const start = match.index + match[1].length;
    return [{kind: "cloze" as const, prompt: `${content.slice(0,start)}______${content.slice(start+match[2].length)}`, answer: match[2], sentence}];
  });
}

function choiceCandidates(word: Word): Extract<ReviewQuestion, {kind: "choice"}>[] {
  return (word.exams || []).flatMap(exam => {
    if (!exam.question?.trim() || exam.choices?.length !== 4 || !exam.choices.some(choice => choice.choiceIndex === exam.answer?.rightIndex)) return [];
    return [{kind: "choice" as const, prompt: exam.question, choices: exam.choices,
      rightIndex: exam.answer.rightIndex, explanation: exam.answer.explain || ""}];
  });
}

export function chooseReviewQuestion(word: Word, isNew: boolean, random = Math.random): ReviewQuestion | null {
  if (isNew || random() >= REVIEW_QUESTION_PROBABILITY) return null;
  const cloze = clozeCandidates(word);
  const choice = choiceCandidates(word);
  if (!cloze.length && !choice.length) return null;
  const pool = cloze.length && choice.length ? (random() < 0.5 ? cloze : choice) : (cloze.length ? cloze : choice);
  return pool[Math.floor(random() * pool.length)];
}

export function matchesClozeAnswer(input: string, answer: string) {
  return input.trim().replace(/\s+/g, " ").toLocaleLowerCase() === answer.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}
