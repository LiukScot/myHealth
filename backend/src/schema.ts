export const SCHEMA_VERSION = 9;

export const migrationStatements: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    disabled_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS diary_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    entry_date TEXT NOT NULL,
    entry_time TEXT NOT NULL,
    mood_level INTEGER,
    depression_level INTEGER,
    anxiety_level INTEGER,
    description TEXT,
    gratitude TEXT,
    reflection TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS pain_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    entry_date TEXT NOT NULL,
    entry_time TEXT NOT NULL,
    pain_level INTEGER,
    fatigue_level INTEGER,
    coffee_count INTEGER,
    area TEXT NOT NULL DEFAULT '',
    symptoms TEXT NOT NULL DEFAULT '',
    activities TEXT NOT NULL DEFAULT '',
    medicines TEXT NOT NULL DEFAULT '',
    habits TEXT NOT NULL DEFAULT '',
    other TEXT NOT NULL DEFAULT '',
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS user_preferences (
    user_id INTEGER PRIMARY KEY,
    model TEXT NOT NULL DEFAULT 'mistral-small-latest',
    chat_range TEXT NOT NULL DEFAULT 'all',
    last_range TEXT NOT NULL DEFAULT 'all',
    graph_selection_json TEXT NOT NULL DEFAULT '{}',
    birthday TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  // schema-v9: add birthday column to existing databases
  `ALTER TABLE user_preferences ADD COLUMN birthday TEXT`,
  `CREATE TABLE IF NOT EXISTS memorable_days (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    title TEXT NOT NULL,
    emoji TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    repeat_mode TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_memorable_days_user_date ON memorable_days(user_id, date DESC, id DESC)`,
  // user_ai_settings dropped — Mistral chatbot replaced by MCP server.
  `DROP TABLE IF EXISTS user_ai_settings`,
  `CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_diary_user_date ON diary_entries(user_id, entry_date DESC, entry_time DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_pain_user_date ON pain_entries(user_id, entry_date DESC, entry_time DESC)`,
  `CREATE TABLE IF NOT EXISTS pain_removed_options (
    user_id INTEGER NOT NULL,
    field TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (user_id, field, value),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS pain_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    field TEXT NOT NULL,
    value TEXT NOT NULL,
    UNIQUE(user_id, field, value),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS mood_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    field TEXT NOT NULL,
    value TEXT NOT NULL,
    UNIQUE(user_id, field, value),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS mood_removed_options (
    user_id INTEGER NOT NULL,
    field TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (user_id, field, value),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `INSERT OR IGNORE INTO mood_options (user_id, field, value)
   SELECT u.id, v.field, v.value
   FROM users u
   CROSS JOIN (
     SELECT 'positive_moods'  AS field, 'happy'       AS value UNION ALL
     SELECT 'positive_moods',           'calm'                  UNION ALL
     SELECT 'positive_moods',           'grateful'              UNION ALL
     SELECT 'positive_moods',           'energetic'             UNION ALL
     SELECT 'positive_moods',           'hopeful'               UNION ALL
     SELECT 'positive_moods',           'relaxed'               UNION ALL
     SELECT 'positive_moods',           'confident'             UNION ALL
     SELECT 'negative_moods',           'sad'                   UNION ALL
     SELECT 'negative_moods',           'angry'                 UNION ALL
     SELECT 'negative_moods',           'frustrated'            UNION ALL
     SELECT 'negative_moods',           'lonely'                UNION ALL
     SELECT 'negative_moods',           'overwhelmed'           UNION ALL
     SELECT 'negative_moods',           'irritable'             UNION ALL
     SELECT 'negative_moods',           'hopeless'              UNION ALL
     SELECT 'general_moods',            'tired'                 UNION ALL
     SELECT 'general_moods',            'numb'                  UNION ALL
     SELECT 'general_moods',            'distracted'            UNION ALL
     SELECT 'general_moods',            'restless'              UNION ALL
     SELECT 'general_moods',            'bored'                 UNION ALL
     SELECT 'general_moods',            'indifferent'
   ) AS v`,
  `INSERT OR IGNORE INTO pain_options (user_id, field, value)
   SELECT u.id, v.field, v.value
   FROM users u
   CROSS JOIN (
     SELECT 'area'       AS field, 'tmj'                    AS value UNION ALL
     SELECT 'area',                'legs'                            UNION ALL
     SELECT 'area',                'shoulders'                       UNION ALL
     SELECT 'area',                'chest'                           UNION ALL
     SELECT 'area',                'neck'                            UNION ALL
     SELECT 'area',                'head'                            UNION ALL
     SELECT 'area',                'back'                            UNION ALL
     SELECT 'area',                'abdomen'                         UNION ALL
     SELECT 'symptoms',            'running nose'                    UNION ALL
     SELECT 'symptoms',            'coughing'                        UNION ALL
     SELECT 'symptoms',            'nausea'                          UNION ALL
     SELECT 'symptoms',            'short breath'                    UNION ALL
     SELECT 'symptoms',            'diarrhea'                        UNION ALL
     SELECT 'symptoms',            'stiffness'                       UNION ALL
     SELECT 'symptoms',            'palpitation'                     UNION ALL
     SELECT 'symptoms',            'fever'                           UNION ALL
     SELECT 'symptoms',            'frequent piss'                   UNION ALL
     SELECT 'symptoms',            'itching'                         UNION ALL
     SELECT 'symptoms',            'pins & needles'                  UNION ALL
     SELECT 'symptoms',            'cramps'                          UNION ALL
     SELECT 'symptoms',            'salivation'                      UNION ALL
     SELECT 'symptoms',            'vomit'                           UNION ALL
     SELECT 'activities',          'sit for a long time'             UNION ALL
     SELECT 'activities',          'lay down for a long time'        UNION ALL
     SELECT 'activities',          'outside'                         UNION ALL
     SELECT 'activities',          'walk'                            UNION ALL
     SELECT 'activities',          'heavy strain'                    UNION ALL
     SELECT 'activities',          'stand up for a long time'        UNION ALL
     SELECT 'activities',          'work'                            UNION ALL
     SELECT 'activities',          'hyperfocus'                      UNION ALL
     SELECT 'activities',          'stretch'                         UNION ALL
     SELECT 'activities',          'breathing'                       UNION ALL
     SELECT 'activities',          'photography'                     UNION ALL
     SELECT 'activities',          'bath'                            UNION ALL
     SELECT 'activities',          'nap'                             UNION ALL
     SELECT 'medicines',           '200mg celebrex'                  UNION ALL
     SELECT 'medicines',           '4mg sirdalud'                    UNION ALL
     SELECT 'habits',              'good sleep'                      UNION ALL
     SELECT 'habits',              'healthy food'                    UNION ALL
     SELECT 'other',               '>6h day byte'                    UNION ALL
     SELECT 'other',               'cum'                             UNION ALL
     SELECT 'other',               '>12h day byte'                   UNION ALL
     SELECT 'other',               '<1h masturbation'                UNION ALL
     SELECT 'other',               '>1h masturbation'
   ) AS v`,
  `CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    email TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)`,
  `CREATE TABLE IF NOT EXISTS cbt_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    entry_date TEXT NOT NULL,
    entry_time TEXT NOT NULL,
    situation TEXT NOT NULL DEFAULT '',
    thoughts TEXT NOT NULL DEFAULT '',
    helpful_reasoning TEXT NOT NULL DEFAULT '',
    main_unhelpful_thought TEXT NOT NULL DEFAULT '',
    effect_of_believing TEXT NOT NULL DEFAULT '',
    evidence_for_against TEXT NOT NULL DEFAULT '',
    alternative_explanation TEXT NOT NULL DEFAULT '',
    worst_best_scenario TEXT NOT NULL DEFAULT '',
    friend_advice TEXT NOT NULL DEFAULT '',
    productive_response TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_cbt_user_date ON cbt_entries(user_id, entry_date DESC, entry_time DESC)`,
  `CREATE TABLE IF NOT EXISTS dbt_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    entry_date TEXT NOT NULL,
    entry_time TEXT NOT NULL,
    emotion_name TEXT NOT NULL DEFAULT '',
    allow_affirmation TEXT NOT NULL DEFAULT '',
    watch_emotion TEXT NOT NULL DEFAULT '',
    body_location TEXT NOT NULL DEFAULT '',
    body_feeling TEXT NOT NULL DEFAULT '',
    present_moment TEXT NOT NULL DEFAULT '',
    emotion_returns TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_dbt_user_date ON dbt_entries(user_id, entry_date DESC, entry_time DESC)`,

  // ── MCP server: personal access tokens ─────────────────────────────────
  `CREATE TABLE IF NOT EXISTS mcp_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT,
    last_used_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_mcp_tokens_user ON mcp_tokens(user_id)`,

  // ── FTS5: diary_fts ────────────────────────────────────────────────────
  `CREATE VIRTUAL TABLE IF NOT EXISTS diary_fts USING fts5(
    description,
    reflection,
    content='diary_entries',
    content_rowid='id',
    tokenize='unicode61 remove_diacritics 2'
  )`,
  `CREATE TRIGGER IF NOT EXISTS diary_fts_ai AFTER INSERT ON diary_entries BEGIN
    INSERT INTO diary_fts(rowid, description, reflection)
    VALUES (new.id, COALESCE(new.description, ''), COALESCE(new.reflection, ''));
  END`,
  `CREATE TRIGGER IF NOT EXISTS diary_fts_ad AFTER DELETE ON diary_entries BEGIN
    INSERT INTO diary_fts(diary_fts, rowid, description, reflection)
    VALUES ('delete', old.id, COALESCE(old.description, ''), COALESCE(old.reflection, ''));
  END`,
  `CREATE TRIGGER IF NOT EXISTS diary_fts_au AFTER UPDATE ON diary_entries BEGIN
    INSERT INTO diary_fts(diary_fts, rowid, description, reflection)
    VALUES ('delete', old.id, COALESCE(old.description, ''), COALESCE(old.reflection, ''));
    INSERT INTO diary_fts(rowid, description, reflection)
    VALUES (new.id, COALESCE(new.description, ''), COALESCE(new.reflection, ''));
  END`,

  // ── FTS5: cbt_fts ──────────────────────────────────────────────────────
  `CREATE VIRTUAL TABLE IF NOT EXISTS cbt_fts USING fts5(
    situation,
    thoughts,
    helpful_reasoning,
    main_unhelpful_thought,
    effect_of_believing,
    evidence_for_against,
    alternative_explanation,
    worst_best_scenario,
    friend_advice,
    productive_response,
    content='cbt_entries',
    content_rowid='id',
    tokenize='unicode61 remove_diacritics 2'
  )`,
  `CREATE TRIGGER IF NOT EXISTS cbt_fts_ai AFTER INSERT ON cbt_entries BEGIN
    INSERT INTO cbt_fts(rowid, situation, thoughts, helpful_reasoning, main_unhelpful_thought, effect_of_believing, evidence_for_against, alternative_explanation, worst_best_scenario, friend_advice, productive_response)
    VALUES (new.id, new.situation, new.thoughts, new.helpful_reasoning, new.main_unhelpful_thought, new.effect_of_believing, new.evidence_for_against, new.alternative_explanation, new.worst_best_scenario, new.friend_advice, new.productive_response);
  END`,
  `CREATE TRIGGER IF NOT EXISTS cbt_fts_ad AFTER DELETE ON cbt_entries BEGIN
    INSERT INTO cbt_fts(cbt_fts, rowid, situation, thoughts, helpful_reasoning, main_unhelpful_thought, effect_of_believing, evidence_for_against, alternative_explanation, worst_best_scenario, friend_advice, productive_response)
    VALUES ('delete', old.id, old.situation, old.thoughts, old.helpful_reasoning, old.main_unhelpful_thought, old.effect_of_believing, old.evidence_for_against, old.alternative_explanation, old.worst_best_scenario, old.friend_advice, old.productive_response);
  END`,
  `CREATE TRIGGER IF NOT EXISTS cbt_fts_au AFTER UPDATE ON cbt_entries BEGIN
    INSERT INTO cbt_fts(cbt_fts, rowid, situation, thoughts, helpful_reasoning, main_unhelpful_thought, effect_of_believing, evidence_for_against, alternative_explanation, worst_best_scenario, friend_advice, productive_response)
    VALUES ('delete', old.id, old.situation, old.thoughts, old.helpful_reasoning, old.main_unhelpful_thought, old.effect_of_believing, old.evidence_for_against, old.alternative_explanation, old.worst_best_scenario, old.friend_advice, old.productive_response);
    INSERT INTO cbt_fts(rowid, situation, thoughts, helpful_reasoning, main_unhelpful_thought, effect_of_believing, evidence_for_against, alternative_explanation, worst_best_scenario, friend_advice, productive_response)
    VALUES (new.id, new.situation, new.thoughts, new.helpful_reasoning, new.main_unhelpful_thought, new.effect_of_believing, new.evidence_for_against, new.alternative_explanation, new.worst_best_scenario, new.friend_advice, new.productive_response);
  END`,

  // ── FTS5: dbt_fts ──────────────────────────────────────────────────────
  `CREATE VIRTUAL TABLE IF NOT EXISTS dbt_fts USING fts5(
    emotion_name,
    allow_affirmation,
    watch_emotion,
    body_location,
    body_feeling,
    present_moment,
    emotion_returns,
    content='dbt_entries',
    content_rowid='id',
    tokenize='unicode61 remove_diacritics 2'
  )`,
  `CREATE TRIGGER IF NOT EXISTS dbt_fts_ai AFTER INSERT ON dbt_entries BEGIN
    INSERT INTO dbt_fts(rowid, emotion_name, allow_affirmation, watch_emotion, body_location, body_feeling, present_moment, emotion_returns)
    VALUES (new.id, new.emotion_name, new.allow_affirmation, new.watch_emotion, new.body_location, new.body_feeling, new.present_moment, new.emotion_returns);
  END`,
  `CREATE TRIGGER IF NOT EXISTS dbt_fts_ad AFTER DELETE ON dbt_entries BEGIN
    INSERT INTO dbt_fts(dbt_fts, rowid, emotion_name, allow_affirmation, watch_emotion, body_location, body_feeling, present_moment, emotion_returns)
    VALUES ('delete', old.id, old.emotion_name, old.allow_affirmation, old.watch_emotion, old.body_location, old.body_feeling, old.present_moment, old.emotion_returns);
  END`,
  `CREATE TRIGGER IF NOT EXISTS dbt_fts_au AFTER UPDATE ON dbt_entries BEGIN
    INSERT INTO dbt_fts(dbt_fts, rowid, emotion_name, allow_affirmation, watch_emotion, body_location, body_feeling, present_moment, emotion_returns)
    VALUES ('delete', old.id, old.emotion_name, old.allow_affirmation, old.watch_emotion, old.body_location, old.body_feeling, old.present_moment, old.emotion_returns);
    INSERT INTO dbt_fts(rowid, emotion_name, allow_affirmation, watch_emotion, body_location, body_feeling, present_moment, emotion_returns)
    VALUES (new.id, new.emotion_name, new.allow_affirmation, new.watch_emotion, new.body_location, new.body_feeling, new.present_moment, new.emotion_returns);
  END`,

  // ── FTS5: pain_fts ─────────────────────────────────────────────────────
  `CREATE VIRTUAL TABLE IF NOT EXISTS pain_fts USING fts5(
    note,
    symptoms,
    content='pain_entries',
    content_rowid='id',
    tokenize='unicode61 remove_diacritics 2'
  )`,
  `CREATE TRIGGER IF NOT EXISTS pain_fts_ai AFTER INSERT ON pain_entries BEGIN
    INSERT INTO pain_fts(rowid, note, symptoms)
    VALUES (new.id, COALESCE(new.note, ''), COALESCE(new.symptoms, ''));
  END`,
  `CREATE TRIGGER IF NOT EXISTS pain_fts_ad AFTER DELETE ON pain_entries BEGIN
    INSERT INTO pain_fts(pain_fts, rowid, note, symptoms)
    VALUES ('delete', old.id, COALESCE(old.note, ''), COALESCE(old.symptoms, ''));
  END`,
  `CREATE TRIGGER IF NOT EXISTS pain_fts_au AFTER UPDATE ON pain_entries BEGIN
    INSERT INTO pain_fts(pain_fts, rowid, note, symptoms)
    VALUES ('delete', old.id, COALESCE(old.note, ''), COALESCE(old.symptoms, ''));
    INSERT INTO pain_fts(rowid, note, symptoms)
    VALUES (new.id, COALESCE(new.note, ''), COALESCE(new.symptoms, ''));
  END`
];

export const TAG_TYPES = ["area", "symptoms", "activities", "medicines", "habits", "other"] as const;
export type TagType = (typeof TAG_TYPES)[number];

export const MOOD_TAG_FIELDS = ["positive_moods", "negative_moods", "general_moods"] as const;
export type MoodTagField = (typeof MOOD_TAG_FIELDS)[number];
