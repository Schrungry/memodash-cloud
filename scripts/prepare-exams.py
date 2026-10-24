"""Build compact exam assets from the original public wordbook archives."""

import gzip
import json
import pathlib
import urllib.parse
import urllib.request
import zipfile

root = pathlib.Path(__file__).resolve().parents[1]
catalog = json.loads((root / "lib/catalog.json").read_text(encoding="utf-8"))
cache = root / "outputs/book-cache"
cache.mkdir(parents=True, exist_ok=True)
assets = root / "public/exams"
assets.mkdir(parents=True, exist_ok=True)
exam_books = []

for book in catalog:
    archive_name = pathlib.PurePosixPath(urllib.parse.urlparse(book["url"]).path).name
    archive = cache / archive_name
    if not archive.exists():
        archive.write_bytes(urllib.request.urlopen(book["url"], timeout=60).read())
    with zipfile.ZipFile(archive) as source:
        lines = source.read(source.namelist()[0]).decode("utf-8-sig").splitlines()

    questions = {}
    for line in lines:
        if not line.strip():
            continue
        entry = json.loads(line)
        content = (((entry.get("content") or {}).get("word") or {}).get("content") or {})
        exams = content.get("exam") or []
        if exams:
            questions[str(entry["wordRank"])] = [
                {
                    "question": exam["question"],
                    "choices": exam["choices"],
                    "answer": exam["answer"],
                }
                for exam in exams
                if exam.get("examType") == 1
            ]

    if not questions:
        continue
    exam_books.append(book["id"])
    payload = json.dumps(questions, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    (assets / f"{book['id']}.json.gz").write_bytes(gzip.compress(payload, compresslevel=9, mtime=0))
    print(f"{book['id']}: {sum(map(len, questions.values()))} questions")

(root / "lib/exam-books.json").write_text(
    json.dumps(exam_books, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8"
)
print(f"Prepared {len(exam_books)} question books")
