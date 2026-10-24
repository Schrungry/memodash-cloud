import test from "node:test";
import assert from "node:assert/strict";
import { memoryTimeline, readMemoryCard } from "../lib/memory.ts";
import { scheduler, reviveCard } from "../lib/study.ts";
import { defaults } from "../lib/types.ts";

const day=86400000,first=new Date("2026-10-01T08:00:00Z"),second=new Date(+first+2*day);
const engine=scheduler(defaults),c1=engine.next(reviveCard(null,first),first,3).card,c2=engine.next(c1,second,3).card;
const records=[{id:"1",rating:3,reviewed_at:first.toISOString(),duration:5000,is_new:1},{id:"2",rating:3,reviewed_at:second.toISOString(),duration:3000,is_new:0}];

test("saved states produce decays and review jumps without replay estimates",()=>{
  const now=new Date(+second+day),result=memoryTimeline(records.map((row,i)=>({...row,card_data:JSON.stringify(i?c2:c1)})),defaults,JSON.stringify(c2),now);
  assert.equal(result.estimatedCount,0);
  assert.equal(result.incomplete,false);
  assert.equal(result.points.filter(point=>point.phase==="after").length,2);
  assert.ok(result.reviews[0].before<100);
  assert.ok(result.current<100&&result.current>0);
  assert.equal(result.current,engine.forgetting_curve(1,c2.stability)*100);
  assert.equal(result.difficulty,c2.difficulty);
  assert.ok(result.points.every((point,i)=>point.value>=0&&point.value<=100&&(!i||point.time>=result.points[i-1].time)));
});

test("retrievability is 90 percent after one stability interval",()=>{
  const now=new Date(+first+c1.stability*day);
  const result=memoryTimeline([{...records[0],card_data:JSON.stringify(c1)}],defaults,JSON.stringify(c1),now);
  assert.ok(Math.abs(result.current-90)<0.00001);
});

test("old logs are replayed and explicitly counted as estimates",()=>{
  const result=memoryTimeline([...records].reverse(),defaults,null,new Date(+second+day));
  assert.equal(result.estimatedCount,2);
  assert.equal(result.current,engine.forgetting_curve(1,c2.stability)*100);
  assert.equal(result.difficulty,c2.difficulty);
  assert.deepEqual(result.reviews.map(row=>row.id),["2","1"]);
  assert.equal(result.reviews[1].before,null);
  assert.equal(records[0].id,"1");
});

test("an imported current card without logs still has a labelled partial curve",()=>{
  const result=memoryTimeline([],defaults,JSON.stringify(c2),new Date(+second+day));
  assert.equal(result.incomplete,true);
  assert.equal(result.reviews.length,0);
  assert.ok(result.points.length>0);
});

test("corrupt or incomplete snapshots fall back to estimated history",()=>{
  assert.equal(readMemoryCard("bad json"),null);
  assert.equal(readMemoryCard({stability:1}),null);
  const result=memoryTimeline([{...records[1],card_data:"bad json"}],defaults,null,new Date(+second+day));
  assert.equal(result.estimatedCount,1);
  assert.equal(result.incomplete,true);
});
