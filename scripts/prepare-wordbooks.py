"""Vendor all public wordbooks as compressed normalized server assets."""
import pathlib,json,gzip,zipfile,urllib.request,urllib.parse,io,concurrent.futures,time
root=pathlib.Path(__file__).resolve().parents[1]
catalog=json.loads((root/'lib/catalog.json').read_text(encoding='utf-8'))
cache=root/'outputs/book-cache';cache.mkdir(parents=True,exist_ok=True)
def normalize(e,bid):
    c=(e.get('content') or {}).get('word',{}).get('content',{}) or {}
    return dict(id=f"{bid}:{e['wordRank']}",bookId=bid,rank=int(e['wordRank']),word=e['headWord'],phonetic=c.get('usphone') or c.get('phone') or '',phoneticUk=c.get('ukphone') or '',definition='; '.join((t.get('pos','')+'. ' if t.get('pos') else '')+t.get('tranCn','') for t in c.get('trans',[])),phrases=[dict(content=p.get('pContent',''),cn=p.get('pCn','')) for p in (c.get('phrase') or {}).get('phrases',[])],sentences=[dict(content=s.get('sContent',''),cn=s.get('sCn','')) for s in (c.get('sentence') or {}).get('sentences',[])+(c.get('realExamSentence') or {}).get('sentences',[])])
def prepare(b):
    output=root/f"public/wordbooks/{b['id']}.json.gz"
    if output.exists():
        words=json.loads(gzip.decompress(output.read_bytes()));return b['id'],len(words),output.stat().st_size
    existing=root/f"public/wordbooks/{b['id']}.json"
    if existing.exists():words=json.loads(existing.read_text(encoding='utf-8'))
    else:
        zipname=pathlib.PurePosixPath(urllib.parse.urlparse(b['url']).path).name
        target=cache/zipname
        if not target.exists():
            url=f'https://raw.githubusercontent.com/kajweb/dict/master/book/{zipname}'
            for attempt in range(3):
                try:
                    data=urllib.request.urlopen(url,timeout=60).read();zipfile.ZipFile(io.BytesIO(data)).testzip();target.write_bytes(data);break
                except Exception:
                    if attempt==2:raise
                    time.sleep(1+attempt)
        with zipfile.ZipFile(target) as z:raw=z.read(z.namelist()[0]).decode('utf-8-sig')
        words=[normalize(json.loads(line),b['id']) for line in raw.splitlines() if line.strip()]
    words.sort(key=lambda w:w['rank'])
    if not words or len({w['id'] for w in words})!=len(words):raise ValueError(f"Invalid wordbook {b['id']}")
    output.write_bytes(gzip.compress(json.dumps(words,ensure_ascii=False,separators=(',',':')).encode('utf-8'),compresslevel=9,mtime=0))
    return b['id'],len(words),output.stat().st_size
results={};failures=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    futures={pool.submit(prepare,b):b for b in catalog}
    for f in concurrent.futures.as_completed(futures):
        try:
            bid,count,size=f.result();results[bid]=(count,size);print(f"Prepared {bid}: {count} words / {size} bytes",flush=True)
        except Exception as exc:failures.append(futures[f]['id']);print(f"Failed {futures[f]['id']}: {exc}",flush=True)
if failures:raise SystemExit('Wordbook preparation incomplete: '+','.join(failures))
for b in catalog:b['bundled']=True;b['packed']=True;b['count']=results[b['id']][0]
(root/'lib/catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print(f"All {len(results)} books prepared; {sum(c for c,s in results.values())} words; {sum(s for c,s in results.values())/1e6:.1f} MB compressed.")
