"""Export a sanitized, private migration file. Output MUST stay under ignored outputs/."""
import json, sqlite3, pathlib, sys, datetime, collections
from zoneinfo import ZoneInfo
source=pathlib.Path(sys.argv[1]); root=pathlib.Path(__file__).resolve().parents[1]
db=sqlite3.connect((source/'data/memodash.db').as_uri()+'?mode=ro',uri=True);db.row_factory=sqlite3.Row
rows=lambda table:[dict(r) for r in db.execute(f'SELECT * FROM {table}')]
word_rows=rows('words');card_rows=rows('cards');log_rows=rows('review_logs')
allowed={'current_book_id','daily_new_limit','daily_review_limit','fsrs_desired_retention','timezone','auto_play_audio','auto_play_accent'}
old={r['key']:json.loads(r['value']) for r in rows('settings') if r['key'] in allowed}
book=lambda b:'custom' if b=='custom_words' else b
word_map={r['id']:r for r in word_rows}; word_id=lambda r:f"{book(r['book_id'])}:{r['rank']}"
profile=dict(currentBook=book(old.get('current_book_id') or ''),newLimit=old.get('daily_new_limit',20),reviewLimit=old.get('daily_review_limit',200),retention=old.get('fsrs_desired_retention',.9),timezone=old.get('timezone','Asia/Shanghai'),autoAudio=old.get('auto_play_audio',False),accent=old.get('auto_play_accent','us'))
def iso(v):return datetime.datetime.fromisoformat(v).astimezone(datetime.timezone.utc).isoformat().replace('+00:00','Z') if v else None
custom=[]
for r in word_rows:
    if book(r['book_id'])=='custom':custom.append(dict(id=word_id(r),bookId='custom',rank=r['rank'],word=r['word'],phonetic=r['phonetic'] or '',phoneticUk=r['phonetic_uk'] or '',definition=r['definition'] or '',phrases=json.loads(r['phrases'] or '[]'),sentences=json.loads(r['sentences'] or '[]')))
cards=[];logs=[];card_map={r['id']:r for r in card_rows}; grouped=collections.defaultdict(list)
for l in sorted(log_rows,key=lambda l:l['review_datetime']):grouped[l['card_pk']].append(l)
for c in card_rows:
    w=word_map[c['word_id']]; history=grouped[c['id']]
    data=dict(due=iso(c['due']),last_review=iso(c['last_review']),state=c['state'],learning_steps=min(c['step'] or 0,1),stability=c['stability'] or 0,difficulty=c['difficulty'] or 0,elapsed_days=0,scheduled_days=0,reps=len(history),lapses=sum(l['rating']==1 for l in history))
    cards.append(dict(word_id=word_id(w),book_id=book(c['book_id']),word=w['word'],data=json.dumps(data,separators=(',',':')),due=data['due'],version=1))
    for i,l in enumerate(history):
        at=iso(l['review_datetime']);day=datetime.datetime.fromisoformat(at.replace('Z','+00:00')).astimezone(ZoneInfo(profile['timezone'])).strftime('%Y-%m-%d')
        logs.append(dict(id=f"legacy:{l['id']}",word_id=word_id(w),book_id=book(w['book_id']),word=w['word'],rating=l['rating'],reviewed_at=at,day=day,is_new=int(i==0),duration=min(3600000,max(0,l['review_duration'] or 0))))
backup=dict(app='MemoDashCloud',version=1,settings=profile,words=custom,cards=cards,reviews=logs)
out=root/'outputs/legacy-migration.json';out.parent.mkdir(exist_ok=True);out.write_text(json.dumps(backup,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print(f'Private migration file: {out}; {len(custom)} custom words, {len(cards)} cards, {len(logs)} reviews. Only supported settings exported.')
