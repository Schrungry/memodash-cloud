// Local-only integration check. All synthetic records are removed in finally.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const base="http://127.0.0.1:5173";
const login=await fetch(base+"/signin-with-chatgpt?return_to=%2F",{redirect:"manual"});
const cookie=login.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie,"Local simulated sign-in should set a cookie");
const request=async(path,body)=>{
  const response=await fetch(`${base}/api/${path}`,{method:body===undefined?"GET":"POST",headers:{cookie,Origin:base,"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;
};
const sql=command=>execFileSync(process.execPath,["--import","./scripts/sites-env.mjs","./node_modules/wrangler/bin/wrangler.js","d1","execute","DB","--local","--config","dist/server/wrangler.json","--persist-to",".wrangler/state","--command",command],{stdio:"pipe"});
let id;
try {
  const token=randomUUID().slice(0,8),word=`historycheck${token}`;
  const created=await request("words",{word,definition:"历史接口验收词；中文释义检索",sentences:[]});
  id=created.word.id;assert.match(id,/^custom:[\da-f-]{36}$/);
  await request("review",{wordId:id,version:0,rating:3,duration:1200,requestId:randomUUID()});
  const byWord=await request(`history?q=${word.toUpperCase()}`);
  assert.equal(byWord.total,1);assert.equal(byWord.reviews[0].bookTitle,"我的生词本");assert.match(byWord.reviews[0].definition,/中文释义/);
  const byMeaning=await request("history?q="+encodeURIComponent("历史接口验收词"));
  assert.ok(byMeaning.reviews.some(row=>row.word_id===id));
  const detail=await request("history/word?wordId="+encodeURIComponent(id));
  assert.equal(detail.reviews.length,1);assert.equal(detail.estimatedCount,0);assert.ok(detail.points.length>1);assert.ok(detail.current>0&&detail.current<=100);
  const backup=await request("backup");assert.ok(backup.reviews.find(row=>row.word_id===id).card_data);
  // Force the same metadata-missing state as pre-update learning records.
  sql(`DELETE FROM history_words WHERE user_id='local_seedy' AND word_id='${id}'`);
  const hydrated=await request(`history?q=${word}`);assert.match(hydrated.reviews[0].definition,/中文释义/);
  assert.equal((await fetch(base+"/api/history")).status,401);
  assert.equal((await fetch(base+"/api/history/word?wordId=custom:missing",{headers:{cookie}})).status,404);
  console.log("PASS: native review snapshot, word/Chinese search, book metadata, detail curve, backup, metadata backfill, anonymous rejection, and missing-word isolation.");
} finally {
  if(id)sql(`DELETE FROM reviews WHERE user_id='local_seedy' AND word_id='${id}'; DELETE FROM cards WHERE user_id='local_seedy' AND word_id='${id}'; DELETE FROM history_words WHERE user_id='local_seedy' AND word_id='${id}'; DELETE FROM custom_words WHERE user_id='local_seedy' AND id='${id}'`);
}
