-- Safe additive migration for activity-based tracking. Existing members and legacy self-reported data stay intact.
CREATE TABLE IF NOT EXISTS practice_attempts (
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 deck TEXT NOT NULL CHECK(deck IN ('rd','ls','review')),
 module_index INTEGER NOT NULL CHECK(module_index BETWEEN 0 AND 10),
 score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 10),
 total INTEGER NOT NULL CHECK(total BETWEEN 1 AND 10),
 submitted_at TEXT NOT NULL,
 PRIMARY KEY(user_id,deck,module_index)
);
CREATE TABLE IF NOT EXISTS writing_submissions (
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 deck TEXT NOT NULL CHECK(deck IN ('wt1','wt2')),
 module_index INTEGER NOT NULL CHECK(module_index BETWEEN 0 AND 6),
 response TEXT NOT NULL CHECK(length(response) BETWEEN 100 AND 12000),
 word_count INTEGER NOT NULL,
 submitted_at TEXT NOT NULL,
 PRIMARY KEY(user_id,deck,module_index)
);
CREATE TABLE IF NOT EXISTS speaking_activities (
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 day INTEGER NOT NULL CHECK(day BETWEEN 16 AND 20),
 duration_seconds INTEGER NOT NULL,
 submitted_at TEXT NOT NULL,
 PRIMARY KEY(user_id,day)
);
CREATE INDEX IF NOT EXISTS idx_attempts_user ON practice_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_writing_user ON writing_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_speaking_user ON speaking_activities(user_id);
