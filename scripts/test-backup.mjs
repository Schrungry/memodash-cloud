import assert from 'node:assert/strict';
import {parseBackup} from '../lib/backup.ts';
import {defaults} from '../lib/types.ts';

const backup={app:'MemoDashCloud',version:1,settings:{...defaults,currentBook:'custom'},words:[{id:'custom:test',bookId:'custom',rank:1,word:'remember',definition:'记住',phonetic:'',phoneticUk:'',phrases:[],sentences:[]}],cards:[{word_id:'custom:test',book_id:'custom',word:'remember',data:'{}',due:'2026-10-25T00:00:00Z',version:1}],reviews:[{id:'test',word_id:'custom:test',rating:3}]};
assert.deepEqual(parseBackup(JSON.stringify(backup)),backup);
assert.deepEqual(parseBackup('\uFEFF'+JSON.stringify(backup)),backup);
assert.throws(()=>parseBackup('{broken'),/JSON/);
assert.throws(()=>parseBackup(JSON.stringify({...backup,app:'OtherApp'})),/格式不受支持/);
assert.throws(()=>parseBackup(JSON.stringify({...backup,version:2})),/格式不受支持/);
assert.throws(()=>parseBackup(JSON.stringify({...backup,words:null})),/生词/);
assert.throws(()=>parseBackup(JSON.stringify({...backup,settings:[]})),/学习设置/);
assert.throws(()=>parseBackup(JSON.stringify({...backup,settings:{...defaults,retention:.1}})),/支持范围/);
assert.throws(()=>parseBackup(JSON.stringify({...backup,settings:{...defaults,timezone:'Invalid/Zone'}})),/学习时区/);
assert.equal(parseBackup(JSON.stringify({...backup,settings:{...defaults,extraOption:'ignored'}})).settings.extraOption,undefined);
console.log('PASS: native backup roundtrip, BOM, unsupported format/version rejection, record shape and settings validation.');
