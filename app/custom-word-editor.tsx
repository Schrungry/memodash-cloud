"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, Plus, Search, Trash2, X } from "lucide-react";
import type { Meaning, Word } from "../lib/types";
import { formatMeanings, meaningsFor, partsOfSpeech } from "../lib/word-fields";
import "./word-editor.css";

type Pair = {content: string; cn: string};
type Fields = {word: string; phonetic: string; phoneticUk: string; meanings: Meaning[]; sentences: Pair[]; phrases: Pair[]; source?: Word["source"]};
type Match = {bookId: string; bookTitle: string; wordId: string; word: string; definition: string; phonetic: string; phoneticUk: string};
const emptyMeaning = (): Meaning => ({partOfSpeech: "n.", meaning: ""});
function fieldsFor(word?: Word | null): Fields {
  return {word: word?.word || "", phonetic: word?.phonetic || "", phoneticUk: word?.phoneticUk || "", meanings: word ? meaningsFor(word) : [emptyMeaning()], sentences: (word?.sentences || []).map(row => ({content: row.content, cn: row.cn || ""})), phrases: (word?.phrases || []).map(row => ({...row})), ...(word?.source ? {source: word.source} : {})};
}

export default function CustomWordEditor({word, request, onClose, onChanged}: {
  word: Word | null; request: (path: string, body?: unknown) => Promise<any>;
  onClose: () => void; onChanged: (message: string) => Promise<void>;
}) {
  const [step, setStep] = useState<"lookup" | "choose" | "details">(word ? "details" : "lookup");
  const [query, setQuery] = useState(""), [matches, setMatches] = useState<Match[]>([]), [selected, setSelected] = useState("");
  const [fields, setFields] = useState<Fields>(() => fieldsFor(word)), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [searched, setSearched] = useState(false), [sourceTitle, setSourceTitle] = useState(""), [confirmDelete, setConfirmDelete] = useState(false);
  const dialog = useRef<HTMLElement>(null), locked = useRef(false);
  useEffect(() => { if (!busy) dialog.current?.querySelector<HTMLInputElement>("input")?.focus(); }, [step, busy]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !locked.current) onClose();
      if (event.key !== "Tab") return;
      const elements = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]') || []);
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", handler);
    return () => { document.removeEventListener("keydown", handler); document.body.style.overflow = previousOverflow; previous?.focus(); };
  }, [onClose]);
  const run = async (action: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError("");
    try { await action(); } catch (error) { setError((error as Error).message); dialog.current?.scrollTo({top: 0, behavior: "smooth"}); }
    finally { locked.current = false; setBusy(false); }
  };
  const loadSource = async (match: Match) => {
    const result = await request(`words/source?bookId=${encodeURIComponent(match.bookId)}&wordId=${encodeURIComponent(match.wordId)}`);
    const next = fieldsFor(result.word);
    next.source = {bookId: match.bookId, wordId: match.wordId};
    setFields(next); setSourceTitle(match.bookTitle); setStep("details");
  };
  const lookup = (event: FormEvent) => {
    event.preventDefault();
    run(async () => {
      const result = await request(`words/lookup?q=${encodeURIComponent(query.trim())}`);
      setSearched(true); setMatches(result.matches); setSourceTitle("");
      if (!result.matches.length) {
        setFields({...fieldsFor(), word: query.trim()}); setStep("details");
      } else if (result.matches.length === 1) await loadSource(result.matches[0]);
      else { setSelected(result.matches[0].wordId); setStep("choose"); }
    });
  };
  const save = (event: FormEvent) => {
    event.preventDefault();
    run(async () => {
      await request(word ? "words/update" : "words", {...fields, definition: formatMeanings(fields.meanings), ...(word ? {id: word.id} : {})});
      await onChanged(word ? "生词已更新，学习进度已保留" : "生词已保存，将自动加入学习队列");
    });
  };
  const remove = () => run(async () => {
    await request("words/delete", {id: word!.id});
    await onChanged("生词及其学习进度、历史复习记录已删除");
  });
  const updateMeaning = (index: number, change: Partial<Meaning>) => setFields({...fields, meanings: fields.meanings.map((row, i) => i === index ? {...row, ...change} : row)});
  const updatePair = (kind: "sentences" | "phrases", index: number, change: Partial<Pair>) => setFields({...fields, [kind]: fields[kind].map((row, i) => i === index ? {...row, ...change} : row)});
  const close = () => { if (!locked.current) onClose(); };

  return <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <section ref={dialog} className="modal word-editor" role="dialog" aria-modal="true" aria-labelledby="word-editor-title">
      <div className="section-heading"><div><div className="eyebrow">{word ? "MAKE IT YOURS" : "A NEW ACQUAINTANCE"}</div><h2 id="word-editor-title">{word ? "编辑这个单词" : step === "lookup" ? "先找找这个单词" : step === "choose" ? "选择一份词书释义" : "收下这个新单词"}</h2></div><button className="icon-button" aria-label="关闭生词编辑" disabled={busy} onClick={close}><X size={20}/></button></div>
      {!word && <div className="editor-steps" aria-label="添加生词步骤"><span className={step === "lookup" ? "current" : ""}>1 · 输入单词</span><ArrowRight size={14}/><span className={step !== "lookup" ? "current" : ""}>2 · {step === "choose" ? "选择词书" : "确认词条"}</span></div>}
      {error && <p className="editor-error" role="alert">{error}</p>}
      {step === "lookup" && <form onSubmit={lookup}>
        <label>想添加的单词<input autoFocus required maxLength={120} autoComplete="off" value={query} onChange={event => setQuery(event.target.value)} placeholder="例如 encompass" disabled={busy}/></label>
        <p className="editor-help">先检索全部 81 本词书，按完整单词匹配，忽略大小写。没有找到时，再填写你自己的词条。</p>
        <div className="modal-actions"><button className="button" type="button" onClick={close} disabled={busy}>取消</button><button className="button primary" type="submit" disabled={busy || !query.trim()}><Search size={16}/>{busy ? "正在检索全部词书…" : "查找单词"}</button></div>
      </form>}
      {step === "choose" && <>
        <p className="editor-help">「{query.trim()}」有 {matches.length} 个词书词条，选择你想收入生词本的一份。</p>
        <div className="source-options" role="radiogroup" aria-label="词书来源">{matches.map(match => <label className={`source-option ${selected === match.wordId ? "selected" : ""}`} key={match.wordId}>
          <input type="radio" name="source-word" value={match.wordId} checked={selected === match.wordId} onChange={() => setSelected(match.wordId)} disabled={busy}/>
          <span><strong>{match.bookTitle}</strong><b>{match.word}</b><small>{match.phonetic && `美 /${match.phonetic}/`}{match.phoneticUk && `　英 /${match.phoneticUk}/`}</small><span>{match.definition}</span></span>
        </label>)}</div>
        <div className="modal-actions"><button className="button" disabled={busy} onClick={() => { setStep("lookup"); setError(""); }}><ArrowLeft size={15}/>重新查词</button><button className="button primary" disabled={busy || !selected} onClick={() => run(() => loadSource(matches.find(match => match.wordId === selected)!))}>{busy ? "正在读取词条…" : "使用选中词条"}<ArrowRight size={15}/></button></div>
      </>}
      {step === "details" && <form onSubmit={save}>
        {!word && <p className="editor-source">{sourceTitle ? `已从《${sourceTitle}》载入音标、释义、例句和词组，可调整后保存。` : searched ? "已检索全部 81 本词书，未找到该词。请填写你的词条。" : "填写你的词条。"}</p>}
        {word && <p className="editor-help">修改词条内容会保留现有学习进度。</p>}
        <label>单词<input autoFocus required maxLength={120} value={fields.word} onChange={event => setFields({...fields, word: event.target.value})} disabled={busy}/></label>
        <div className="form-grid editor-phonetics"><label>美式音标（可选）<input maxLength={150} value={fields.phonetic} onChange={event => setFields({...fields, phonetic: event.target.value})} disabled={busy}/></label><label>英式音标（可选）<input maxLength={150} value={fields.phoneticUk} onChange={event => setFields({...fields, phoneticUk: event.target.value})} disabled={busy}/></label></div>
        <fieldset disabled={busy} className="editor-group"><legend>中文释义</legend><p className="editor-help">每条释义单独选择词性，可添加多条。</p>
          {fields.meanings.map((row, index) => <div className="meaning-row" key={index}>
            <label>词性 {index + 1}<select aria-label={`释义 ${index + 1} 的词性`} value={row.partOfSpeech} onChange={event => updateMeaning(index, {partOfSpeech: event.target.value})}>{partsOfSpeech.map(([value, label]) => <option key={value} value={value}>{value === "other" ? label : `${value} ${label}`}</option>)}</select></label>
            <label>中文释义 {index + 1}<textarea required maxLength={2000} rows={2} value={row.meaning} onChange={event => updateMeaning(index, {meaning: event.target.value})}/></label>
            <button type="button" className="icon-button remove-row" aria-label={`删除释义 ${index + 1}`} disabled={fields.meanings.length === 1} onClick={() => setFields({...fields, meanings: fields.meanings.filter((_, i) => i !== index)})}><X size={16}/></button>
          </div>)}
          <button type="button" className="text-button" disabled={fields.meanings.length >= 30} onClick={() => setFields({...fields, meanings: [...fields.meanings, emptyMeaning()]})}><Plus size={14}/>添加释义</button>
        </fieldset>
        {(["sentences", "phrases"] as const).map(kind => <fieldset disabled={busy} className="editor-group" key={kind}>
          <legend>{kind === "sentences" ? "例句" : "词组"}（可选）</legend>
          {fields[kind].map((row, index) => <div className="pair-row" key={index}>
            <label>{kind === "sentences" ? "英文例句" : "英文词组"} {index + 1}<textarea required maxLength={2000} rows={2} value={row.content} onChange={event => updatePair(kind, index, {content: event.target.value})}/></label>
            <label>中文翻译 {index + 1}<textarea maxLength={2000} rows={2} value={row.cn} onChange={event => updatePair(kind, index, {cn: event.target.value})}/></label>
            <button className="icon-button remove-row" type="button" aria-label={`删除${kind === "sentences" ? "例句" : "词组"} ${index + 1}`} onClick={() => setFields({...fields, [kind]: fields[kind].filter((_, i) => i !== index)})}><X size={16}/></button>
          </div>)}
          <button className="text-button" type="button" disabled={fields[kind].length >= 100} onClick={() => setFields({...fields, [kind]: [...fields[kind], {content: "", cn: ""}]})}><Plus size={14}/>添加{kind === "sentences" ? "例句" : "词组"}</button>
        </fieldset>)}
        {confirmDelete && <div className="delete-confirm" role="alert"><strong>删除「{word?.word}」？</strong><p>将永久删除该生词、学习进度及全部历史复习记录，此操作无法撤销。</p><div><button className="button" type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>保留这个单词</button><button className="button danger" type="button" disabled={busy} onClick={remove}>{busy ? "正在删除…" : "确认删除全部记录"}</button></div></div>}
        <div className="modal-actions editor-footer">
          {word && !confirmDelete && <button className="text-button delete-word" type="button" disabled={busy} onClick={() => setConfirmDelete(true)}><Trash2 size={15}/>删除生词</button>}
          {!word && <button className="button" type="button" disabled={busy} onClick={() => { setStep(matches.length > 1 ? "choose" : "lookup"); setError(""); }}><ArrowLeft size={15}/>上一步</button>}
          <button className="button" type="button" disabled={busy} onClick={close}>取消</button><button className="button primary" type="submit" disabled={busy || confirmDelete}>{busy ? "正在保存…" : word ? "保存修改" : "保存到生词本"}<Check size={15}/></button>
        </div>
      </form>}
    </section>
  </div>;
}
