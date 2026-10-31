import { env } from "cloudflare:workers";
import { catalog, loadBook } from "./books";
import { defaults, type Settings, type Word } from "./types";
import { localDay, outcomes, review, scheduler, reviveCard } from "./study";
import { memoryTimeline, readMemoryCard, type ReviewRecord } from "./memory";
import type { HistoryRow, WordHistory } from "./types";
import { partsOfSpeech, formatMeanings } from "./word-fields";
import type { PreparedCard } from "./study-session";
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export function db() { if (!env.DB) throw new Error("数据存储尚未就绪"); return env.DB; }
export async function settingsFor(uid: string): Promise<Settings> {
  const row = await db().prepare("SELECT settings FROM profiles WHERE user_id=?").bind(uid).first<{settings:string}>();
  return { ...defaults, ...(row ? JSON.parse(row.settings) : {}) };
}
export function validateSettings(input: any): Settings {
  if (!input || typeof input !== "object") throw new HttpError(400,"设置格式无效");
  const s: Settings = {currentBook: input.currentBook, newLimit: input.newLimit, reviewLimit: input.reviewLimit, retention: input.retention, timezone: input.timezone, autoAudio: input.autoAudio, accent: input.accent};
  if (typeof s.currentBook !== "string" || (s.currentBook && s.currentBook !== "custom" && !catalog.some(b=>b.id===s.currentBook))) throw new HttpError(400,"请选择有效词书");
  if (!Number.isInteger(s.newLimit) || s.newLimit<0 || s.newLimit>500 || !Number.isInteger(s.reviewLimit) || s.reviewLimit<0 || s.reviewLimit>5000) throw new HttpError(400,"新词上限应为 0–500，复习上限应为 0–5000");
  if (typeof s.retention !== "number" || !Number.isFinite(s.retention) || s.retention<.7 || s.retention>.99) throw new HttpError(400,"目标保留率应为 70%–99%");
  try { if (typeof s.timezone !== "string") throw 0; new Intl.DateTimeFormat("en", {timeZone:s.timezone}); } catch { throw new HttpError(400,"时区无效"); }
  if (typeof s.autoAudio !== "boolean" || !["us","uk"].includes(s.accent)) throw new HttpError(400,"发音设置无效");
  return s;
}
export async function saveSettings(uid: string, s: Settings) {
  await db().prepare("INSERT INTO profiles(user_id,settings) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET settings=excluded.settings").bind(uid,JSON.stringify(s)).run();
}
export async function customFor(uid: string): Promise<Word[]> {
  const r = await db().prepare("SELECT data FROM custom_words WHERE user_id=? ORDER BY created_at DESC").bind(uid).all<{data:string}>();
  return r.results.map(r=>JSON.parse(r.data));
}
async function wordsFor(uid: string, s: Settings, origin: string) {
  const custom = await customFor(uid);
  return s.currentBook && s.currentBook !== "custom" ? [...custom, ...await loadBook(s.currentBook,origin)] : custom;
}
export async function overview(uid: string) {
  const s=await settingsFor(uid), day=localDay(s.timezone);
  const result=await db().batch([
    db().prepare("SELECT COUNT(*) total, SUM(CASE WHEN is_new=1 THEN 1 ELSE 0 END) new_count, SUM(CASE WHEN is_new=0 THEN 1 ELSE 0 END) review_count FROM reviews WHERE user_id=? AND day=?").bind(uid,day),
    db().prepare("SELECT book_id, data, due FROM cards WHERE user_id=?").bind(uid),
    db().prepare("SELECT day, COUNT(*) count FROM reviews WHERE user_id=? GROUP BY day ORDER BY day DESC LIMIT 365").bind(uid),
    db().prepare("SELECT COUNT(*) count FROM custom_words WHERE user_id=?").bind(uid),
  ]);
  const daily:any=result[0].results[0]; const all:any[]=result[1].results;
  const active=all.filter(c=>c.book_id===s.currentBook || c.book_id==="custom");
  const now=new Date(), states=[0,0,0,0], fsrs=scheduler(s); let retention=0, n=0;
  const learnedCounts=new Map<string,number>();
  for (const row of all) {learnedCounts.set(row.book_id,(learnedCounts.get(row.book_id)||0)+1);const c=reviveCard(row.data);states[c.state]++;if(c.last_review && c.stability>0){retention+=Number(fsrs.get_retrievability(c,now,false));n++;}}
  const learned=learnedCounts.get(s.currentBook)||0;
  const due=active.filter(c=>c.due<=now.toISOString()).length;
  const book = catalog.find(b=>b.id===s.currentBook);
  const customCount=Number((result[3].results[0] as any).count);
  const total=s.currentBook==="custom"?customCount:book?.count || 0;
  const availableNew=Math.max(0,(book?.count || 0)+customCount-active.length);
  const newRemaining=Math.min(availableNew,Math.max(0,s.newLimit-Number(daily.new_count||0)));
  const reviewRemaining=s.reviewLimit?Math.min(due,Math.max(0,s.reviewLimit-Number(daily.review_count||0))):due;
  return {settings:s, stats:{today:day, newToday:Number(daily.new_count||0), reviewedToday:Number(daily.review_count||0), totalToday:Number(daily.total||0), due, newRemaining, reviewRemaining, pending:newRemaining+reviewRemaining, learned, total, allLearned:all.length, retention:n?Math.round(retention/n*100):null, states, customCount}, series:result[2].results, books:catalog.map(({url,...b})=>({...b,learnedCount:learnedCounts.get(b.id)||0}))};
}
export async function nextCard(uid: string, origin: string) {
  const s=await settingsFor(uid); const now=new Date();const day=localDay(s.timezone,now);
  const [words, result]=await Promise.all([wordsFor(uid,s,origin), db().batch([
    db().prepare("SELECT word_id, data, due, version FROM cards WHERE user_id=? AND (book_id=? OR book_id='custom') ORDER BY due").bind(uid,s.currentBook),
    db().prepare("SELECT SUM(is_new) new_count, SUM(CASE WHEN is_new=0 THEN 1 ELSE 0 END) review_count FROM reviews WHERE user_id=? AND day=?").bind(uid,day),
  ])]);
  const cards:any[]=result[0].results; const counts:any=result[1].results[0]; const map=new Map(words.map(w=>[w.id,w]));
  const due=cards.filter(c=>c.due<=now.toISOString() && map.has(c.word_id));
  const learned=new Set(cards.map(c=>c.word_id));
  // Prepare one lookahead from the same read-only snapshot. Account for the
  // displayed card's quota, but do not create cards or advance learning here.
  const choose=(completed?:{id:string;isNew:boolean}):PreparedCard=>{
    const remainingDue=completed?due.filter(c=>c.word_id!==completed.id):due;
    const canReview=!s.reviewLimit || Number(counts.review_count||0)+(completed&&!completed.isNew?1:0)<s.reviewLimit;
    const row=canReview?remainingDue[0]:undefined;
    const word=row?map.get(row.word_id):Number(counts.new_count||0)+(completed?.isNew?1:0)<s.newLimit?words.find(w=>!learned.has(w.id)&&w.id!==completed?.id):undefined;
    if (!word) return {word:null, due:remainingDue.length, nextDue:cards.find(c=>c.word_id!==completed?.id&&c.due>now.toISOString())?.due || null, reason:!words.length?"选择词书或添加生词，开始你的第一次学习。":!canReview&&remainingDue.length?"今日复习额度已完成，明天继续。":"当前学习任务已完成，稍后再来看看。"};
    return {word, version:row?.version || 0, isNew:!row, outcomes:outcomes(row?.data || null,s,now), due:remainingDue.length};
  };
  const current=choose();
  return current.word?{...current,next:choose({id:current.word.id,isNew:current.isNew})}:current;
}
async function reviewResponse(uid:string, origin:string, includeNext:boolean) {
  if(includeNext)try{return {ok:true,next:await nextCard(uid,origin)};}catch(error){
    // The write has committed. A failed queue read must not look like a failed save.
    console.error("Next card preparation failed",error instanceof Error?error.message:"unknown");
  }
  return {ok:true};
}
export async function submitReview(uid: string, input: any, origin: string) {
  if (!input || typeof input.wordId!=="string" || ![1,2,3,4].includes(input.rating) || !Number.isInteger(input.version) || input.version<0 || typeof input.requestId!=="string" || !/^[\da-f-]{36}$/i.test(input.requestId)) throw new HttpError(400,"评分格式无效");
  const requestId=`${uid}:${input.requestId}`;
  if(await db().prepare("SELECT id FROM reviews WHERE id=? AND user_id=?").bind(requestId,uid).first()) return reviewResponse(uid,origin,input.includeNext===true);
  const s=await settingsFor(uid), now=new Date(), day=localDay(s.timezone,now);
  const word=(await wordsFor(uid,s,origin)).find(w=>w.id===input.wordId);
  if (!word) throw new HttpError(404,"当前学习列表中没有此单词");
  const old=await db().prepare("SELECT data,version,due FROM cards WHERE user_id=? AND word_id=?").bind(uid,word.id).first<{data:string;version:number;due:string}>();
  if ((old?.version || 0)!==input.version || (old && old.due>now.toISOString())) throw new HttpError(409,"卡片已在其他窗口更新，请刷新学习队列");
  const card=review(old?.data || null,input.rating,s,now);
  const duration=Number.isFinite(input.duration)?Math.min(3600000,Math.max(0,Math.round(input.duration))):0;
  const limit=old?s.reviewLimit || 2147483647:s.newLimit;
  const result=await db().batch([
    db().prepare(`INSERT INTO cards(user_id,word_id,book_id,word,data,due,version) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM reviews WHERE user_id=? AND day=? AND is_new=?)<? ON CONFLICT(user_id,word_id) DO UPDATE SET data=excluded.data,due=excluded.due,version=excluded.version WHERE cards.version=?`).bind(uid,word.id,word.bookId,word.word,JSON.stringify(card),card.due.toISOString(),input.version+1,uid,day,old?0:1,limit,input.version),
    db().prepare("INSERT INTO reviews(id,user_id,word_id,book_id,word,rating,reviewed_at,day,is_new,duration,card_data) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE changes()=1").bind(requestId,uid,word.id,word.bookId,word.word,input.rating,now.toISOString(),day,old?0:1,duration,JSON.stringify(card)),
    db().prepare("INSERT INTO history_words(user_id,word_id,book_id,word,definition) VALUES(?,?,?,?,?) ON CONFLICT(user_id,word_id) DO UPDATE SET definition=excluded.definition,word=excluded.word").bind(uid,word.id,word.bookId,word.word,word.definition),
  ]);
  if (!result[0].meta.changes) throw new HttpError(409,"学习额度或卡片状态已更新，请刷新后继续");
  return reviewResponse(uid,origin,input.includeNext===true);
}
export function validateWord(input: any): Omit<Word,"id"|"rank"|"bookId"> {
  if(!input || typeof input!=="object")throw new HttpError(400,"生词格式无效");
  const text=(v:any,max:number,required=false)=>{if(typeof v!=="string" || v.length>max || (required&&!v.trim()))throw new HttpError(400,"请填写有效的单词和释义，并控制字段长度");return v.trim();};
  const pairs=(a:any)=>{if(!Array.isArray(a)||a.length>100)throw new HttpError(400,"短语或例句格式无效，每类最多 100 条");return a.map(p=>{if(!p||typeof p!=="object")throw new HttpError(400,"短语或例句格式无效");return {content:text(p.content,2000),cn:text(p.cn,2000)};});};
  let meanings;
  if(input.meanings!==undefined){
    if(!Array.isArray(input.meanings)||!input.meanings.length||input.meanings.length>30)throw new HttpError(400,"请填写 1–30 条中文释义");
    meanings=input.meanings.map((row:any)=>{
      if(!row||!partsOfSpeech.some(([pos])=>pos===row.partOfSpeech))throw new HttpError(400,"请从列表中选择词性");
      return {partOfSpeech:row.partOfSpeech,meaning:text(row.meaning,2000,true)};
    });
  }
  let source;
  if(input.source!==undefined){
    if(!input.source||!catalog.some(book=>book.id===input.source.bookId)||typeof input.source.wordId!=="string"||input.source.wordId.length>200||!input.source.wordId.startsWith(`${input.source.bookId}:`))throw new HttpError(400,"词书来源无效");
    source={bookId:input.source.bookId,wordId:input.source.wordId};
  }
  return {word:text(input.word,120,true), definition:text(meanings?formatMeanings(meanings):input.definition,4000,true), ...(meanings?{meanings}:{}), ...(source?{source}:{}), phonetic:text(input.phonetic || "",150),phoneticUk:text(input.phoneticUk || "",150),phrases:pairs(input.phrases || []),sentences:pairs(input.sentences || [])};
}
export async function addWord(uid:string,input:any) {
  const valid=validateWord(input);const id=`custom:${crypto.randomUUID()}`;
  const w:Word={...valid,id,bookId:"custom",rank:Date.now()};
  await db().prepare("INSERT INTO custom_words(user_id,id,data,created_at) VALUES(?,?,?,?)").bind(uid,id,JSON.stringify(w),new Date().toISOString()).run();
  return {word:w};
}
function customWordId(id: unknown): string {
  if(typeof id!=="string"||!id.startsWith("custom:")||id.length>200)throw new HttpError(400,"生词编号无效");
  return id;
}
export async function updateWord(uid:string,input:any) {
  const id=customWordId(input?.id), valid=validateWord(input);
  const old=await db().prepare("SELECT data FROM custom_words WHERE user_id=? AND id=?").bind(uid,id).first<{data:string}>();
  if(!old)throw new HttpError(404,"生词不存在");
  const previous:Word=JSON.parse(old.data), word:Word={...valid,id,bookId:"custom",rank:previous.rank};
  await db().batch([
    db().prepare("UPDATE custom_words SET data=? WHERE user_id=? AND id=?").bind(JSON.stringify(word),uid,id),
    db().prepare("UPDATE cards SET word=? WHERE user_id=? AND word_id=?").bind(word.word,uid,id),
    db().prepare("UPDATE reviews SET word=? WHERE user_id=? AND word_id=?").bind(word.word,uid,id),
    db().prepare("UPDATE history_words SET word=?,definition=? WHERE user_id=? AND word_id=?").bind(word.word,word.definition,uid,id),
  ]);
  return {word};
}
export async function deleteWord(uid:string,input:any) {
  const id=customWordId(input?.id);
  if(!await db().prepare("SELECT id FROM custom_words WHERE user_id=? AND id=?").bind(uid,id).first())throw new HttpError(404,"生词不存在");
  await db().batch([
    db().prepare("DELETE FROM reviews WHERE user_id=? AND word_id=?").bind(uid,id),
    db().prepare("DELETE FROM history_words WHERE user_id=? AND word_id=?").bind(uid,id),
    db().prepare("DELETE FROM cards WHERE user_id=? AND word_id=?").bind(uid,id),
    db().prepare("DELETE FROM custom_words WHERE user_id=? AND id=?").bind(uid,id),
  ]);
  return {ok:true};
}
const bookTitle = (id:string) => id==="custom" ? "我的生词本" : catalog.find(book=>book.id===id)?.title || "未知词书";
async function ensureHistoryWords(uid:string, origin:string, wordId?:string) {
  const missing = await db().prepare(`SELECT DISTINCT r.word_id,r.book_id,r.word FROM reviews r LEFT JOIN history_words h ON h.user_id=r.user_id AND h.word_id=r.word_id WHERE r.user_id=? AND h.word_id IS NULL${wordId?" AND r.word_id=?":""}`).bind(...(wordId?[uid,wordId]:[uid])).all<{word_id:string;book_id:string;word:string}>();
  const groups = new Map<string,typeof missing.results>();
  for(const row of missing.results) {const group=groups.get(row.book_id);if(group)group.push(row);else groups.set(row.book_id,[row]);}
  for(const [bid, rows] of groups) {
    const words=bid==="custom"?await customFor(uid):await loadBook(bid,origin);
    const definitions=new Map(words.map(word=>[word.id,word.definition]));
    for(let i=0;i<rows.length;i+=50) await db().batch(rows.slice(i,i+50).map(row=>db().prepare("INSERT OR IGNORE INTO history_words(user_id,word_id,book_id,word,definition) VALUES(?,?,?,?,?)").bind(uid,row.word_id,row.book_id,row.word,definitions.get(row.word_id)||"")));
  }
}
export async function history(uid:string, origin:string, page=0, search="") {
  await ensureHistoryWords(uid,origin);
  const query=search.trim();
  const from="FROM (SELECT *,ROW_NUMBER() OVER (PARTITION BY word_id ORDER BY reviewed_at DESC,id DESC) history_rank FROM reviews WHERE user_id=?) r LEFT JOIN history_words h ON h.user_id=r.user_id AND h.word_id=r.word_id WHERE r.history_rank=1 AND (?='' OR instr(lower(r.word),lower(?))>0 OR instr(lower(COALESCE(h.definition,'')),lower(?))>0)";
  const results=await db().batch([
    db().prepare(`SELECT r.id,r.word_id,r.book_id,r.word,r.rating,r.reviewed_at,r.duration,r.is_new,COALESCE(h.definition,'') definition ${from} ORDER BY r.reviewed_at DESC,r.id DESC LIMIT 50 OFFSET ?`).bind(uid,query,query,query,page*50),
    db().prepare(`SELECT COUNT(*) total ${from}`).bind(uid,query,query,query),
  ]);
  const total=Number((results[1].results[0] as any).total);
  return {reviews:(results[0].results as Omit<HistoryRow,"bookTitle">[]).map(row=>({...row,bookTitle:bookTitle(row.book_id)})),total,hasMore:(page+1)*50<total};
}
export async function wordHistory(uid:string, origin:string, wordId:string):Promise<WordHistory> {
  await ensureHistoryWords(uid,origin,wordId);
  const [result,settings]=await Promise.all([db().batch([
    db().prepare("SELECT id,rating,reviewed_at,duration,is_new,card_data FROM reviews WHERE user_id=? AND word_id=? ORDER BY reviewed_at,id").bind(uid,wordId),
    db().prepare("SELECT data,due FROM cards WHERE user_id=? AND word_id=?").bind(uid,wordId),
    db().prepare("SELECT word,definition,book_id FROM history_words WHERE user_id=? AND word_id=?").bind(uid,wordId),
  ]),settingsFor(uid)]);
  const word=result[2].results[0] as {word:string;definition:string;book_id:string}|undefined;
  if(!word) throw new HttpError(404,"没有找到这个单词的学习记录");
  const card=result[1].results[0] as {data:string;due:string}|undefined;
  return {wordId,word:word.word,definition:word.definition,bookTitle:bookTitle(word.book_id),due:card?.due||null,...memoryTimeline(result[0].results as ReviewRecord[],settings,card?.data||null)};
}
export async function exportBackup(uid:string) {
  const results=await db().batch([
    db().prepare("SELECT word_id,book_id,word,data,due,version FROM cards WHERE user_id=? ORDER BY word_id").bind(uid),
    db().prepare("SELECT id,word_id,book_id,word,rating,reviewed_at,day,is_new,duration,card_data FROM reviews WHERE user_id=? ORDER BY reviewed_at").bind(uid),
  ]);
  return {app:"MemoDashCloud",version:1,exportedAt:new Date().toISOString(),settings:await settingsFor(uid),words:await customFor(uid),cards:results[0].results,reviews:results[1].results.map((r:any)=>({...r,id:r.id.slice(uid.length+1)}))};
}
export async function importBackup(uid:string,input:any) {
  if(!input || !["words","cards","reviews","settings"].includes(input.kind)) throw new HttpError(400,"导入格式无效");
  if(input.kind==="settings"){await saveSettings(uid,validateSettings(input.settings));return {ok:true};}
  if(!Array.isArray(input.rows)||input.rows.length>50)throw new HttpError(400,"每次最多导入 50 条记录");
  const text=(v:any,max=200)=>{if(typeof v!=="string"||!v.length||v.length>max)throw new HttpError(400,"备份包含无效文本");return v;};
  const iso=(v:any)=>{if(typeof v!=="string"||!Number.isFinite(+new Date(v)))throw new HttpError(400,"备份时间无效");return new Date(v).toISOString();};
  const statements:D1PreparedStatement[]=[];
  const dependencies=new Set<string>();
  for(const row of input.rows){
    if(!row || typeof row!=="object")throw new HttpError(400,"备份记录无效");
    if(input.kind==="words"){
      const w=validateWord(row);const id=text(row.id);if(!id.startsWith("custom:")||!Number.isSafeInteger(row.rank))throw new HttpError(400,"生词编号无效");
      statements.push(db().prepare("INSERT OR IGNORE INTO custom_words(user_id,id,data,created_at) VALUES(?,?,?,?)").bind(uid,id,JSON.stringify({...w,id,bookId:"custom",rank:row.rank}),new Date().toISOString()));
      continue;
    }
    const wordId=text(row.word_id),bookId=text(row.book_id),word=text(row.word,120);
    if(bookId!=="custom"&&!catalog.some(b=>b.id===bookId))throw new HttpError(400,"备份词书无效");
    if(!wordId.startsWith(`${bookId}:`))throw new HttpError(400,"词条编号与词书不匹配");
    if(input.kind==="cards"){
      if(bookId==="custom")dependencies.add(wordId);
      let c;try{c=typeof row.data==="string"?JSON.parse(row.data):row.data;}catch{throw new HttpError(400,"卡片格式无效");}
      if(!c || ![0,1,2,3].includes(c.state)||![c.stability,c.difficulty,c.elapsed_days,c.scheduled_days,c.learning_steps,c.reps,c.lapses].every(v=>typeof v==="number"&&Number.isFinite(v)&&v>=0)||c.difficulty>10||c.stability>100000||!Number.isInteger(c.learning_steps)||c.learning_steps>1||!Number.isInteger(c.reps)||!Number.isInteger(c.lapses))throw new HttpError(400,"卡片调度状态无效");
      const due=iso(c.due),last=c.last_review?iso(c.last_review):undefined;
      const safe={due,last_review:last,state:c.state,stability:c.stability,difficulty:c.difficulty,elapsed_days:c.elapsed_days,scheduled_days:c.scheduled_days,learning_steps:c.learning_steps,reps:c.reps,lapses:c.lapses};
      statements.push(db().prepare("INSERT OR IGNORE INTO cards(user_id,word_id,book_id,word,data,due,version) VALUES(?,?,?,?,?,?,1)").bind(uid,wordId,bookId,word,JSON.stringify(safe),due));
    }else{
      if(![1,2,3,4].includes(row.rating)||![0,1].includes(row.is_new)||!Number.isInteger(row.duration)||row.duration<0||row.duration>3600000||typeof row.day!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(row.day))throw new HttpError(400,"复习日志无效");
      const at=iso(row.reviewed_at),id=`${uid}:${text(row.id,250)}`;
      dependencies.add(wordId);
      const snapshot=row.card_data==null?null:readMemoryCard(row.card_data);
      if(row.card_data!=null && (!snapshot || Number(snapshot.last_review)!==+new Date(at)))throw new HttpError(400,"复习记录中的记忆状态无效");
      statements.push(db().prepare("INSERT OR IGNORE INTO reviews(id,user_id,word_id,book_id,word,rating,reviewed_at,day,is_new,duration,card_data) VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind(id,uid,wordId,bookId,word,row.rating,at,row.day,row.is_new,row.duration,snapshot?JSON.stringify(snapshot):null));
    }
  }
  if(dependencies.size){
    const ids=[...dependencies], placeholders=ids.map(()=>"?").join(",");
    const query=input.kind==="cards"
      ? `SELECT id AS word_id FROM custom_words WHERE user_id=? AND id IN (${placeholders})`
      : `SELECT word_id FROM cards WHERE user_id=? AND word_id IN (${placeholders})`;
    const result=await db().prepare(query).bind(uid,...ids).all<{word_id:string}>();
    const found=new Set(result.results.map(row=>row.word_id));
    if(ids.some(id=>!found.has(id)))throw new HttpError(400,input.kind==="cards"?"请先导入对应生词":"请先导入对应卡片");
  }
  if(statements.length)await db().batch(statements);
  return {ok:true,processed:statements.length};
}
