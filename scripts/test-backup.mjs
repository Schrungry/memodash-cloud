import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {normalizeBackup} from '../lib/backup.ts';
const fixture={app:'MemoDash',version:2,settings:[{key:'current_book_id',value:'"custom_words"'},{key:'ai_api_key',value:'"DO_NOT_UPLOAD_THIS_SECRET"'}],words:[{id:1,book_id:'custom_words',rank:1,word:'remember',definition:'记住',phonetic:'',phonetic_uk:'',phrases:null,sentences:null}],cards:[{id:1,word_id:1,book_id:'custom_words',fsrs_card_id:101,state:2,step:null,stability:5,difficulty:4,due:'2026-10-25T00:00:00+00:00',last_review:'2026-10-20T00:00:00+00:00'}],review_logs:[{id:1,card_pk:1,fsrs_card_id:101,rating:3,review_datetime:'2026-10-20T00:00:00+00:00',review_duration:500}]};
const converted=normalizeBackup(JSON.stringify(fixture));
assert.equal(converted.settings.currentBook,'custom');assert.equal(converted.words[0].id,'custom:1');assert.equal(converted.cards[0].word_id,'custom:1');assert.equal(converted.reviews[0].id,'legacy:1');assert.equal(converted.reviews[0].day,'2026-10-20');assert.equal(converted.reviews[0].is_new,1);assert.equal(JSON.parse(converted.cards[0].data).stability,5);assert.ok(!JSON.stringify(converted).includes('DO_NOT_UPLOAD_THIS_SECRET'));
console.log('PASS: portable direct-v2 regression fixture and credential filtering.');
try{await readFile(new URL('../outputs/legacy-raw-backup.json',import.meta.url));}catch(e){if(e.code==='ENOENT'){console.log('Private full-dataset fixture is absent; portable regression test completed.');process.exit(0);}throw e;}
const raw=await readFile(new URL('../outputs/legacy-raw-backup.json',import.meta.url),'utf8');
const expected=JSON.parse(await readFile(new URL('../outputs/legacy-migration.json',import.meta.url),'utf8'));
const result=normalizeBackup('\uFEFF'+raw);
assert.equal(result.cards.length,expected.cards.length);
assert.equal(result.reviews.length,expected.reviews.length);
assert.deepEqual(result.settings,expected.settings);
assert.deepEqual(result.words,expected.words.map(w=>({...w,phrases:w.phrases.map(({content,cn})=>({content,cn})),sentences:w.sentences.map(({content,cn})=>({content,cn}))})));
const byId=new Map(result.cards.map(c=>[c.word_id,c]));
for(const c of expected.cards){const actual=byId.get(c.word_id);assert.ok(actual);const a=JSON.parse(actual.data),e=JSON.parse(c.data);assert.equal(+new Date(a.due),+new Date(e.due));assert.equal(+new Date(a.last_review),+new Date(e.last_review));for(const key of ['state','stability','difficulty','learning_steps','reps','lapses'])assert.equal(a[key],e[key]);}
const reviews=new Map(result.reviews.map(r=>[r.id,r]));
for(const r of expected.reviews){const actual=reviews.get(r.id);assert.ok(actual);assert.equal(+new Date(actual.reviewed_at),+new Date(r.reviewed_at));for(const key of ['day','word_id','book_id','rating','duration','is_new'])assert.equal(actual[key],r[key]);}
assert.ok(!JSON.stringify(result).includes('DO_NOT_UPLOAD_THIS_SECRET'));
assert.equal(result.settings.ai_api_key,undefined);
assert.equal(result.settings.fsrs_parameters,undefined);
assert.deepEqual(normalizeBackup(JSON.stringify(expected)).settings,expected.settings);
assert.throws(()=>normalizeBackup('{broken'),/JSON/);
const old=JSON.parse(raw);
assert.throws(()=>normalizeBackup(JSON.stringify({...old,version:1,words:undefined})),/重新导出完整备份/);
assert.throws(()=>normalizeBackup(JSON.stringify({...old,words:[]})),/缺少对应词条/);
assert.throws(()=>normalizeBackup(JSON.stringify({...old,review_logs:[{...old.review_logs[0],card_pk:-99}]})),/卡片关联/);
await writeFile(new URL('../outputs/legacy-migration-from-browser.json',import.meta.url),JSON.stringify(result));
console.log(`PASS: direct legacy v2 import (${result.cards.length} cards / ${result.reviews.length} reviews / ${result.words.length} custom words), exact settings and scheduling state, stable log IDs, BOM, website backup, secret filtering, invalid JSON, incomplete v1 and broken references.`);
if(process.argv[2]){
  const origin=new URL(process.argv[2]).origin;
  assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname),'Integration test must use a local worker.');
  const uid=`qa_direct_import_${crypto.randomUUID()}`;
  async function api(path,body){const response=await fetch(`${origin}/api/${path}`,{method:body===undefined?'GET':'POST',headers:{'oai-authenticated-user-id':uid,'oai-authenticated-user-email':'qa@sites.test',...(body===undefined?{}:{origin,'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json();assert.equal(response.status,200,JSON.stringify({path,error:data.error}));return data;}
  for(let repeat=0;repeat<2;repeat++)for(const kind of ['words','cards','reviews'])for(let i=0;i<result[kind].length;i+=50)await api('import',{kind,rows:result[kind].slice(i,i+50)});
  await api('import',{kind:'settings',settings:result.settings});
  const saved=await api('backup');assert.equal(saved.cards.length,result.cards.length);assert.equal(saved.reviews.length,result.reviews.length);assert.equal(saved.words.length,result.words.length);assert.deepEqual(saved.settings,result.settings);
  console.log('PASS: browser-converted legacy backup saved to D1, repeated import deduplicated, complete counts and settings verified.');
}
