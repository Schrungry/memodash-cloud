"""Read the original project without modifying it. Never copy account settings/secrets."""
import json, sqlite3, sys, pathlib
source = pathlib.Path(sys.argv[1])
root = pathlib.Path(__file__).resolve().parents[1]
catalog = json.loads((source / 'book/bookLists.json').read_text(encoding='utf-8'))['data']['normalBooksInfo']
db = sqlite3.connect((source / 'data/memodash.db').as_uri() + '?mode=ro', uri=True)
db.row_factory = sqlite3.Row
def loads(value):
    return json.loads(value) if value else []
def word(row):
    return dict(id=f"{row['book_id']}:{row['rank']}", bookId=row['book_id'], rank=row['rank'], word=row['word'], phonetic=row['phonetic'] or '', phoneticUk=row['phonetic_uk'] or '', definition=row['definition'] or '', phrases=loads(row['phrases']), sentences=loads(row['sentences']))
(root / 'lib').mkdir(exist_ok=True)
(root / 'public/wordbooks').mkdir(parents=True, exist_ok=True)
books = []
for b in catalog:
    rows = db.execute('SELECT * FROM words WHERE book_id=? ORDER BY rank', [b['id']]).fetchall()
    if rows:
        (root / f"public/wordbooks/{b['id']}.json").write_text(json.dumps([word(r) for r in rows], ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    books.append(dict(id=b['id'], title=b['title'], count=b['wordNum'], tags=[t['tagName'] for t in b.get('tags',[])], description=b.get('introduce',''), url=b['offlinedata'].replace('http:', 'https:'), bundled=bool(rows)))
(root / 'lib/catalog.json').write_text(json.dumps(books, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(f'Prepared {len(books)} catalog entries and {sum(b["bundled"] for b in books)} shared wordbooks; no personal data copied.')
