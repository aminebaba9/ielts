-- Prevent accidental creation of a second owner by a repeated bootstrap command.
CREATE UNIQUE INDEX IF NOT EXISTS idx_only_one_owner ON users(role) WHERE role='owner';
