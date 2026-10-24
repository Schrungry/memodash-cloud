import assert from "node:assert/strict";
import test from "node:test";
import { chooseReviewQuestion, matchesClozeAnswer, REVIEW_QUESTION_PROBABILITY } from "../lib/quiz.ts";

const word = {
  id: "book:1", bookId: "book", rank: 1, word: "Access", phonetic: "", phoneticUk: "", definition: "访问",
  phrases: [], sentences: [{content: "There is no access to the house from the road.", cn: ""}],
  exams: [{question: "There is no _____ to the house.", choices: [
    {choiceIndex: 1, choice: "access"}, {choiceIndex: 2, choice: "edge"},
    {choiceIndex: 3, choice: "avenue"}, {choiceIndex: 4, choice: "exposure"}],
    answer: {rightIndex: 1, explain: ""}}],
};

test("new words and the ordinary-card branch do not become questions", () => {
  assert.equal(chooseReviewQuestion(word, true, () => 0), null);
  assert.equal(chooseReviewQuestion(word, false, () => REVIEW_QUESTION_PROBABILITY), null);
});

test("a review may use an existing sentence, with the answer hidden", () => {
  const quiz = chooseReviewQuestion(word, false, () => 0);
  assert.equal(quiz?.kind, "cloze");
  assert.equal(quiz?.prompt, "There is no ______ to the house from the road.");
  assert.equal(quiz?.answer, "access");
  assert.equal(matchesClozeAnswer(" ACCESS ", "access"), true);
  assert.equal(matchesClozeAnswer("accessible", "access"), false);
});

test("a review may use the source multiple-choice question", () => {
  const values = [0, 0.8, 0];
  const quiz = chooseReviewQuestion(word, false, () => values.shift());
  assert.equal(quiz?.kind, "choice");
  assert.equal(quiz?.rightIndex, 1);
  assert.equal(quiz?.choices.length, 4);
});

test("a word with no usable question stays an ordinary card", () => {
  assert.equal(chooseReviewQuestion({...word, sentences: [], exams: []}, false, () => 0), null);
  assert.equal(chooseReviewQuestion({...word, word: "act", sentences: [{content: "Action matters.", cn: ""}], exams: []}, false, () => 0), null);
});
