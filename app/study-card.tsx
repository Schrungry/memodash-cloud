"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Volume2 } from "lucide-react";
import type { Settings, Word } from "../lib/types";
import { chooseReviewQuestion, matchesClozeAnswer } from "../lib/quiz";

const labels = ["忘记", "困难", "记得", "轻松"];
function interval(due: string) {
  const minutes = Math.max(1, Math.round((+new Date(due) - Date.now()) / 60000));
  return minutes < 60 ? `${minutes} 分钟` : minutes < 1440 ? `${Math.round(minutes / 60)} 小时` : `${Math.round(minutes / 1440)} 天`;
}

type StudyCardData = { word: Word; isNew: boolean; outcomes: {due: string}[] };
export default function StudyCard({card, settings, busy, onPlay, onRate}:{
  card: StudyCardData; settings: Settings; busy: boolean;
  onPlay: (word: string, accent: "us" | "uk") => void; onRate: (rating: number) => void;
}) {
  const [question] = useState(() => chooseReviewQuestion(card.word, card.isNew));
  const [flipped, setFlipped] = useState(false);
  const [input, setInput] = useState("");
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [correct, setCorrect] = useState<boolean | null>(null);
  const reveal = useCallback(() => {
    if (flipped) return;
    setFlipped(true);
    if (settings.autoAudio) onPlay(card.word.word, settings.accent);
  }, [flipped, settings.autoAudio, settings.accent, onPlay, card.word.word]);
  const choose = useCallback((index: number) => {
    if (flipped || busy || question?.kind !== "choice") return;
    setSelectedChoice(index);
    setCorrect(index === question.rightIndex);
    reveal();
  }, [flipped, busy, question, reveal]);
  const submitCloze = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!input.trim() || question?.kind !== "cloze" || flipped) return;
    setCorrect(matchesClozeAnswer(input, question.answer));
    reveal();
  };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest("input,textarea,select,button,a") || event.altKey || event.ctrlKey || event.metaKey || busy) return;
      if (event.code === "Space" && !flipped) { event.preventDefault(); reveal(); }
      if (/^[1-4]$/.test(event.key)) {
        if (flipped) { event.preventDefault(); onRate(Number(event.key)); }
        else if (question?.kind === "choice") { event.preventDefault(); choose(Number(event.key)); }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [flipped, busy, question, reveal, choose, onRate]);

  const rightChoice = question?.kind === "choice" ? question.choices.find(choice => choice.choiceIndex === question.rightIndex)?.choice : null;
  return <>
    <section className="study-card">
      <div className="card-top"><span className="pill">{card.isNew ? "初次见面" : "温故知新"}</span><span>{question ? question.kind === "cloze" ? "例句填空" : "四选一考题" : "先回忆，再揭晓"}</span></div>
      {question && <div className="question-face">
        <span className="question-label">{question.kind === "cloze" ? "补全例句中的单词" : "根据题干，选择正确答案"}</span>
        <p className="question-prompt">{question.prompt}</p>
        {question.kind === "cloze" ? !flipped && <form className="cloze-form" onSubmit={submitCloze}>
          <label htmlFor="cloze-answer">填写空缺的单词</label>
          <div><input id="cloze-answer" autoComplete="off" spellCheck={false} value={input} onChange={event => setInput(event.target.value)} placeholder="输入答案"/><button className="button primary" disabled={!input.trim() || busy} type="submit">确认答案</button></div>
        </form> : <div className="choice-grid" role="group" aria-label="选择题选项">
          {question.choices.map(choice => <button key={choice.choiceIndex} type="button" disabled={flipped || busy} className={`choice-option ${flipped && choice.choiceIndex === question.rightIndex ? "correct" : ""} ${flipped && choice.choiceIndex === selectedChoice && !correct ? "incorrect" : ""}`} onClick={() => choose(choice.choiceIndex)}><span>{choice.choiceIndex}</span>{choice.choice}</button>)}
        </div>}
      </div>}
      {(!question || flipped) && <div className="word-face"><h2>{card.word.word}</h2><div className="phonetics">{card.word.phonetic && <span>美 /{card.word.phonetic}/</span>}<button className="icon-button" aria-label="播放美式发音" onClick={() => onPlay(card.word.word,"us")}><Volume2 size={19}/></button>{card.word.phoneticUk && <><span>英 /{card.word.phoneticUk}/</span><button className="icon-button" aria-label="播放英式发音" onClick={() => onPlay(card.word.word,"uk")}><Volume2 size={19}/></button></>}</div></div>}
      {flipped ? <div className="word-back">
        {question && <div className={`answer-feedback ${correct === true ? "is-correct" : correct === false ? "is-incorrect" : ""}`}><strong>{correct === true ? "答对了" : correct === false ? "再记住一次" : "参考答案"}</strong><span>{question.kind === "cloze" ? question.answer : rightChoice}</span>{question.kind === "choice" && question.explanation && <p>{question.explanation}</p>}{question.kind === "cloze" && <p>{question.sentence.content}{question.sentence.cn ? ` · ${question.sentence.cn}` : ""}</p>}</div>}
        <p className="definition">{card.word.definition || "暂无释义"}</p>
        {card.word.sentences.slice(0,3).map((sentence,i) => <div className="example" key={i}><p>{sentence.content}</p><span>{sentence.cn}</span></div>)}
        {card.word.phrases.length > 0 && <div className="phrases">{card.word.phrases.slice(0,6).map((phrase,i) => <span key={i}><b>{phrase.content}</b> {phrase.cn}</span>)}</div>}
      </div> : !question && <div className="recall-hint">想一想，这个单词是什么意思？</div>}
      <div className="card-bottom">{flipped ? <span>根据真实的回忆感受，选择一个评分。</span> : <button className={question ? "button" : "button primary"} onClick={reveal}>{question ? "查看答案" : "显示释义"}<kbd>Space</kbd></button>}</div>
    </section>
    {flipped && <div className="rating-grid">{labels.map((label,i) => <button disabled={busy} className={`rating rating-${i}`} key={label} onClick={() => onRate(i+1)}><span>{label}<kbd>{i+1}</kbd></span><small>{interval(card.outcomes[i].due)}后</small></button>)}</div>}
    <p className="keyboard-hint">{question?.kind === "choice" && !flipped ? "点击选项或按数字 1–4 作答" : question?.kind === "cloze" && !flipped ? "输入答案并确认，或查看答案" : flipped ? "按数字 1–4 评分" : "空格显示释义"} <span>·</span> 进度自动保存</p>
  </>;
}
