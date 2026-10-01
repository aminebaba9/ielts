-- Small-scale, capped private audio stored in D1 chunks; no R2 subscription required.
CREATE TABLE IF NOT EXISTS audio_recordings (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 part TEXT NOT NULL CHECK(part IN ('p1','p2','p3','combined')),
 mime TEXT NOT NULL CHECK(mime IN ('audio/webm','audio/mp4','audio/ogg')),
 duration_seconds INTEGER NOT NULL CHECK(duration_seconds BETWEEN 1 AND 1800),
 size_bytes INTEGER NOT NULL CHECK(size_bytes BETWEEN 1 AND 5000000),
 chunk_count INTEGER NOT NULL CHECK(chunk_count BETWEEN 1 AND 20),
 status TEXT NOT NULL CHECK(status IN ('pending','ready')),
 created_at TEXT NOT NULL,
 completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_audio_user ON audio_recordings(user_id,status,created_at);
CREATE TABLE IF NOT EXISTS audio_chunks (
 recording_id INTEGER NOT NULL REFERENCES audio_recordings(id) ON DELETE CASCADE,
 idx INTEGER NOT NULL CHECK(idx BETWEEN 0 AND 19),
 bytes BLOB NOT NULL CHECK(length(bytes) BETWEEN 1 AND 256000),
 PRIMARY KEY(recording_id,idx)
);
-- Existing Speaking rows have no sound file and are shown as metadata-only history.
ALTER TABLE speaking_history ADD COLUMN audio_id INTEGER REFERENCES audio_recordings(id);
CREATE INDEX IF NOT EXISTS idx_speaking_audio ON speaking_history(audio_id);
