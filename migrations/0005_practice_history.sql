-- Replace the fixed 20-day pathway with repeatable practice history.
-- Additive: preserves account records and 0003/0004 data without requiring learners to restart.
CREATE TABLE IF NOT EXISTS practice_history (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 deck TEXT NOT NULL CHECK(deck IN ('rd','ls','review')),
 module_index INTEGER NOT NULL CHECK(module_index BETWEEN 0 AND 10),
 score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 10),
 total INTEGER NOT NULL CHECK(total BETWEEN 1 AND 10),
 submitted_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_practice_history_user ON practice_history(user_id,deck,module_index,submitted_at);
INSERT INTO practice_history(user_id,deck,module_index,score,total,submitted_at)
 SELECT user_id,deck,module_index,score,total,submitted_at FROM practice_attempts;

CREATE TABLE IF NOT EXISTS writing_history (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 deck TEXT NOT NULL CHECK(deck IN ('wt1','wt2')),
 module_index INTEGER NOT NULL CHECK(module_index BETWEEN 0 AND 6),
 response TEXT NOT NULL CHECK(length(response) BETWEEN 100 AND 12000),
 word_count INTEGER NOT NULL,
 submitted_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_writing_history_user ON writing_history(user_id,submitted_at);
INSERT INTO writing_history(user_id,deck,module_index,response,word_count,submitted_at)
 SELECT user_id,deck,module_index,response,word_count,submitted_at FROM writing_submissions;

CREATE TABLE IF NOT EXISTS speaking_history (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 part TEXT NOT NULL CHECK(part IN ('p1','p2','p3','combined')),
 duration_seconds INTEGER NOT NULL CHECK(duration_seconds BETWEEN 1 AND 1800),
 submitted_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_speaking_history_user ON speaking_history(user_id,submitted_at);
INSERT INTO speaking_history(user_id,part,duration_seconds,submitted_at)
 SELECT user_id,CASE WHEN day=16 THEN 'p1' WHEN day=17 THEN 'p2' WHEN day=18 THEN 'p3' ELSE 'combined' END,
 duration_seconds,submitted_at FROM speaking_activities;

CREATE TABLE IF NOT EXISTS teacher_reviews (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 skill TEXT NOT NULL CHECK(skill IN ('writing','speaking')),
 activity_id INTEGER NOT NULL,
 rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
 note TEXT NOT NULL CHECK(length(note) BETWEEN 1 AND 1200),
 author_id INTEGER NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON teacher_reviews(user_id,created_at);
