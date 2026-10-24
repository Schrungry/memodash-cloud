"""Exercise the actual history query against the generated SQLite schema."""
import pathlib
import re
import sqlite3
import unittest

root = pathlib.Path(__file__).resolve().parents[1]

class HistorySQL(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        for file in sorted((root / 'drizzle').glob('*.sql')):
            self.db.executescript(file.read_text(encoding='utf-8'))
        source = (root / 'lib/server.ts').read_text(encoding='utf-8')
        self.query = re.search(r'const from="([^"]+)";', source)[1]
        for uid, meaning, count in [('a', '记住；回忆', 56), ('b', '秘密', 1)]:
            self.db.execute('INSERT INTO history_words VALUES(?,?,?,?,?)', (uid, 'custom:fixture', 'custom', 'Remember', meaning))
            for i in range(count):
                self.db.execute('INSERT INTO reviews(id,user_id,word_id,book_id,word,rating,reviewed_at,day,is_new,duration) VALUES(?,?,?,?,?,?,?,?,?,?)',
                    (f'{uid}:{i:03}', uid, 'custom:fixture', 'custom', 'Remember', 3, f'2026-10-24T08:00:{i:02}.000Z', '2026-10-24', int(i == 0), 1000))

    def count(self, user, query):
        return self.db.execute('SELECT COUNT(*) ' + self.query, (user, query, query, query)).fetchone()[0]

    def tearDown(self):
        self.db.close()

    def test_chinese_and_case_insensitive_word_search_cover_all_pages(self):
        self.assertEqual(self.count('a', '记住'), 56)
        self.assertEqual(self.count('a', 'REMEM'), 56)
        rows = self.db.execute('SELECT r.id ' + self.query + ' ORDER BY r.reviewed_at DESC,r.id DESC LIMIT 50 OFFSET ?', ('a', '回忆', '回忆', '回忆', 50)).fetchall()
        self.assertEqual(len(rows), 6)

    def test_search_and_detail_are_scoped_to_the_signed_in_user(self):
        self.assertEqual(self.count('a', '秘密'), 0)
        self.assertEqual(self.count('b', '秘密'), 1)
        source = (root / 'lib/server.ts').read_text(encoding='utf-8')
        detail = re.search(r'prepare\("(SELECT id,rating,reviewed_at,duration,is_new,card_data FROM reviews [^"]+)"\)', source)[1]
        self.assertEqual(len(self.db.execute(detail, ('a', 'custom:fixture')).fetchall()), 56)
        self.assertEqual(len(self.db.execute(detail, ('b', 'custom:fixture')).fetchall()), 1)
        self.assertEqual(len(self.db.execute(detail, ('c', 'custom:fixture')).fetchall()), 0)

    def test_percent_and_underscore_are_literal_substrings(self):
        self.assertEqual(self.count('a', '%'), 0)
        self.assertEqual(self.count('a', '_'), 0)

if __name__ == '__main__':
    unittest.main()
