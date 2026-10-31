import assert from "node:assert/strict";
import test from "node:test";
import { StudySession } from "../lib/study-session.ts";

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const empty={word:null,reason:"完成"};
const card=(id,next)=>({word:{id,word:id},version:0,isNew:true,due:0,outcomes:[],...(next?{next}:{})});
function setup(request){let time=1000,serial=0;const session=new StudySession(request,()=>time,()=>`request-${++serial}`);return {session,tick:n=>{time+=n;}};}

test("next card appears before the save roundtrip, with no extra study request or duplicate score",async()=>{
  const save=deferred(),calls=[];
  const {session,tick}=setup(async(path,body)=>{calls.push({path,body});return path==="study"?card("one",card("two")):save.promise;});
  await session.load();tick(7000);
  const pending=session.rate(3);
  assert.equal(session.getSnapshot().card.word.id,"two");
  assert.equal(session.getSnapshot().saving,true);
  assert.equal(await session.rate(4),false);
  const speculativeKey=session.getSnapshot().card.cardKey;
  await Promise.resolve();
  assert.equal(calls[1].body.requestId,"request-1");
  assert.equal(calls[1].body.wordId,"one");
  assert.equal(calls[1].body.duration,7000);
  tick(500);save.resolve({ok:true,next:card("two",card("three"))});await pending;
  assert.equal(session.getSnapshot().card.cardKey,speculativeKey,"Confirmation preserves the displayed card and its revealed answer");
  assert.equal(calls.filter(c=>c.path==="study").length,1);
  tick(2000);const second=session.rate(4);await second;
  assert.equal(calls[2].body.wordId,"two");
  assert.equal(calls[2].body.requestId,speculativeKey);
  assert.equal(calls[2].body.duration,2500,"Study timing starts on display, not on server prefetch or confirmation");
});

test("save failure restores the rated card and retry uses its original idempotency key",async()=>{
  let attempt=0;const calls=[];
  const {session}=setup(async(path,body)=>{if(path==="study")return card("one",card("two"));calls.push(body);if(!attempt++)throw new Error("offline");return {ok:true,next:card("two")};});
  await session.load();await assert.rejects(session.rate(3),/offline/);
  assert.equal(session.getSnapshot().card.word.id,"one");
  assert.equal(session.getSnapshot().card.initialRevealed,true);
  assert.equal(session.getSnapshot().saving,false);
  await session.rate(3);assert.equal(calls[0].requestId,calls[1].requestId);
  assert.equal(session.getSnapshot().card.word.id,"two");
});

test("canonical response replaces stale prefetch and completion waits for persistence",async()=>{
  const save=deferred();
  const {session}=setup(async path=>path==="study"?card("one",card("stale")):save.promise);
  await session.load();const pending=session.rate(4);save.resolve({ok:true,next:card("due-in-another-window")});await pending;
  assert.equal(session.getSnapshot().card.word.id,"due-in-another-window");
  const final=deferred();const {session:last}=setup(async path=>path==="study"?card("last",empty):final.promise);
  await last.load();const done=last.rate(4);
  assert.equal(last.getSnapshot().card.word.id,"last");
  final.resolve({ok:true,next:empty});await done;
  assert.equal(last.getSnapshot().card.word,null);
});

test("refresh races, leaving study, and returning during a save cannot install stale cards",async()=>{
  const slow=deferred();let count=0;
  const {session}=setup(async()=>++count===1?slow.promise:card("fresh"));
  const first=session.load();await Promise.resolve();await session.load();slow.resolve(card("stale"));await first;
  assert.equal(session.getSnapshot().card.word.id,"fresh");
  const save=deferred();let reads=0;
  const {session:active}=setup(async path=>path==="review"?save.promise:(++reads===1?card("one",card("two")):card("fresh-after-save")));
  await active.load();const rate=active.rate(3);active.invalidate();const reload=active.load();
  assert.equal(reads,1,"Reload must wait for the in-flight review");
  save.resolve({ok:true,next:card("stale-return")});await Promise.all([rate,reload]);
  assert.equal(active.getSnapshot().card.word.id,"fresh-after-save");
});

test("saved review with a failed follow-up read never restores a card that was already saved",async()=>{
  let reads=0;
  const {session}=setup(async path=>{if(path==="review")return {ok:true};if(!reads++)return card("one",card("two"));throw new Error("queue unavailable");});
  await session.load();await assert.rejects(session.rate(4),/queue unavailable/);
  assert.equal(session.getSnapshot().card,null);
  assert.equal(session.getSnapshot().saving,false);
  assert.equal(await session.rate(4),false);
});
