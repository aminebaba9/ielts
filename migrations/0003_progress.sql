-- Account-scoped learner progress. Run remotely BEFORE deploying the updated Worker.
-- A visit is not a completion or an externally verified IELTS score.
CREATE TABLE IF NOT EXISTS learning_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  pathway TEXT NOT NULL CHECK (pathway IN ('5.5-6.5','6.5-7+')),
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lesson_positions (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck TEXT NOT NULL CHECK (deck IN ('rd','ls','wt1','wt2','sp','es')),
  module_index INTEGER NOT NULL CHECK (module_index BETWEEN 0 AND 10),
  slide_index INTEGER NOT NULL CHECK (slide_index BETWEEN 0 AND 80),
  seen_at TEXT NOT NULL,
  PRIMARY KEY(user_id,deck)
);
CREATE TABLE IF NOT EXISTS module_visits (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck TEXT NOT NULL CHECK (deck IN ('rd','ls','wt1','wt2','sp','es')),
  module_index INTEGER NOT NULL CHECK (module_index BETWEEN 0 AND 10),
  first_seen_at TEXT NOT NULL,
  PRIMARY KEY(user_id,deck,module_index)
);
CREATE TABLE IF NOT EXISTS day_checklists (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pathway TEXT NOT NULL CHECK (pathway IN ('5.5-6.5','6.5-7+')),
  day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 20),
  completed_at TEXT NOT NULL,
  PRIMARY KEY(user_id,pathway,day)
);
CREATE TABLE IF NOT EXISTS first_attempt_results (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task TEXT NOT NULL CHECK (task IN ('reading-mixed','listening-1','listening-2','listening-3','listening-4')),
  correct INTEGER NOT NULL CHECK (correct BETWEEN 0 AND 40),
  total INTEGER NOT NULL CHECK (total BETWEEN 1 AND 40),
  recorded_at TEXT NOT NULL,
  PRIMARY KEY(user_id,task)
);
CREATE TABLE IF NOT EXISTS skill_feedback (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill TEXT NOT NULL CHECK (skill IN ('writing','speaking')),
  day INTEGER NOT NULL CHECK (day BETWEEN 11 AND 20),
  note TEXT NOT NULL CHECK (length(note) BETWEEN 1 AND 1200),
  author_id INTEGER NOT NULL REFERENCES users(id),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id,skill,day)
);
CREATE INDEX IF NOT EXISTS idx_module_visits_user ON module_visits(user_id);
CREATE INDEX IF NOT EXISTS idx_days_user ON day_checklists(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_user ON skill_feedback(user_id);
