import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const origin=process.argv[2] || 'http://127.0.0.1:8787';
const uid=`qa_${crypto.randomUUID()}`, other=`qa_${crypto.randomUUID()}`;
async function request(path,body,user=uid,override={}){
  const r=await fetch(`${origin}/api/${path}`,{method:body===undefined?'GET':'POST',headers:{connection:'close',...(user?{'oai-authenticated-user-id':user,'oai-authenticated-user-email':`${user}@sites.test`}:{}),...(body===undefined?{}:{'content-type':'application/json',origin}),...override},body:body===undefined?undefined:JSON.stringify(body)});
  const raw=await r.text();let data;try{data=JSON.parse(raw);}catch{throw new Error(`${path} HTTP ${r.status}: ${raw.slice(0,250)}`);}return {status:r.status,data};
}
const a=await request('overview');assert.equal(a.status,200);assert.equal(a.data.books.length,81);assert.equal(a.data.stats.allLearned,0);
assert.equal((await request('overview',undefined,null)).status,401);
assert.equal((await request('settings',{...a.data.settings,newLimit:-1})).status,400);
assert.equal((await request('words',{word:'private',definition:'私有'},uid,{origin:'https://invalid.test'})).status,403);
assert.equal((await request('words',{word:'',definition:'空词'})).status,400);
const w=(await request('words',{word:'serendipity',definition:'意外发现美好事物的运气',phonetic:'ˌserənˈdɪpəti'})).data.word;
assert.equal((await request('words',undefined,other)).data.words.length,0);
assert.equal((await request('settings',{...a.data.settings,newLimit:1})).status,200);
const card=(await request('study')).data;assert.equal(card.word.id,w.id);assert.equal(card.version,0);assert.equal(card.outcomes.length,4);
const input={wordId:w.id,rating:3,version:0,requestId:crypto.randomUUID(),duration:2500};
assert.equal((await request('review',input,other)).status,404);
assert.equal((await request('review',input)).status,200);
assert.equal((await request('review',input)).status,200);
assert.equal((await request('review',{...input,requestId:crypto.randomUUID()})).status,409);
const after=(await request('overview')).data;assert.equal(after.stats.newToday,1);assert.equal(after.stats.totalToday,1);assert.equal(after.stats.allLearned,1);
assert.equal((await request('history')).data.reviews.length,1);
assert.equal((await request('overview',undefined,other)).data.stats.totalToday,0);
await request('words',{word:'another',definition:'另一个'});
assert.equal((await request('study')).data.word,null);
const backup=(await request('backup')).data;assert.equal(backup.app,'MemoDashCloud');assert.equal(backup.cards.length,1);assert.equal(backup.words.length,2);assert.equal(backup.reviews.length,1);assert.equal(backup.cards[0].user_id,undefined);
for(const kind of ['words','cards','reviews']){
  assert.equal((await request('import',{kind,rows:backup[kind]},other)).status,200);
  assert.equal((await request('import',{kind,rows:backup[kind]},other)).status,200);
}
assert.equal((await request('overview',undefined,other)).data.stats.allLearned,1);
assert.equal((await request('history',undefined,other)).data.reviews.length,1);
assert.equal((await request('settings',{...a.data.settings,currentBook:'CET4luan_1',newLimit:20})).status,200);
const bookCard=await request('study');assert.equal(bookCard.status,200);assert.equal(bookCard.data.word.bookId,'CET4luan_1');assert.ok(bookCard.data.word.definition);
assert.equal((await request('review',{wordId:bookCard.data.word.id,rating:4,version:bookCard.data.version,requestId:crypto.randomUUID(),duration:1000})).status,200);
const quotaUser=`qa_quota_${crypto.randomUUID()}`;
const q1=(await request('words',{word:'one',definition:'一'},quotaUser)).data.word;
const q2=(await request('words',{word:'two',definition:'二'},quotaUser)).data.word;
await request('settings',{...a.data.settings,newLimit:1},quotaUser);
const concurrent=await Promise.all([q1,q2].map(w=>request('review',{wordId:w.id,version:0,rating:3,requestId:crypto.randomUUID()},quotaUser)));
assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
assert.equal((await request('overview',undefined,quotaUser)).data.stats.newToday,1);
const legacyUser=`qa_legacy_${crypto.randomUUID()}`;
const legacy=JSON.parse(await readFile(new URL('../outputs/legacy-migration.json',import.meta.url),'utf8'));
for(const kind of ['words','cards','reviews'])for(let i=0;i<legacy[kind].length;i+=50){const r=await request('import',{kind,rows:legacy[kind].slice(i,i+50)},legacyUser);assert.equal(r.status,200,JSON.stringify({kind,i,error:r.data.error}));}
assert.equal((await request('import',{kind:'settings',settings:legacy.settings},legacyUser)).status,200);
const migrated=(await request('backup',undefined,legacyUser)).data;
assert.equal(migrated.cards.length,legacy.cards.length);assert.equal(migrated.reviews.length,legacy.reviews.length);assert.equal(migrated.words.length,legacy.words.length);
assert.equal((await request('study',undefined,legacyUser)).status,200);
const remoteBook=a.data.books.find(b=>b.id==='KaoYanluan_1');
await request('settings',{...a.data.settings,currentBook:remoteBook.id},quotaUser);
const remote=await request('study',undefined,quotaUser);assert.equal(remote.status,200,JSON.stringify(remote.data));
console.log(`PASS: concurrent daily quota, full legacy migration (${migrated.cards.length} cards / ${migrated.reviews.length} reviews), server wordbook initialization (${remoteBook.id}).`);
console.log('PASS: anonymous access, two-user isolation, input validation, CSRF, FSRS scheduling, duplicate/stale ratings, quotas, history, backup roundtrip, shared server wordbook and rating.');
