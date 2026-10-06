CREATE TABLE users (
  id TEXT PRIMARY KEY,
  google_id TEXT UNIQUE,
  name TEXT NOT NULL,
  email TEXT,
  picture TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,            -- sha-256 of the cookie token
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE quizzes (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  settings TEXT NOT NULL,         -- JSON GameSettings
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_quizzes_owner ON quizzes(owner_id, updated_at DESC);

CREATE TABLE questions (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  type TEXT NOT NULL,             -- mcq | tf | text
  text TEXT NOT NULL,
  image TEXT,
  options TEXT,                   -- JSON string[]
  correct_index INTEGER,
  accepted_answers TEXT,          -- JSON string[]
  typo_tolerance INTEGER NOT NULL DEFAULT 1,
  time_limit_s INTEGER NOT NULL,
  points INTEGER NOT NULL
);
CREATE INDEX idx_questions_quiz ON questions(quiz_id, position);

CREATE TABLE game_results (
  id TEXT PRIMARY KEY,
  quiz_id TEXT,
  host_id TEXT NOT NULL,
  pin TEXT NOT NULL,
  started_at INTEGER,
  ended_at INTEGER NOT NULL,
  results TEXT NOT NULL           -- JSON ResultsPayload
);
CREATE INDEX idx_results_host ON game_results(host_id, ended_at DESC);

-- PINs are unique among live games only; a row is released when the game ends.
CREATE TABLE live_games (
  pin TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL,
  host_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
