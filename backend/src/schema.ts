export const SCHEMA_VERSION = 6;

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
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS user_ai_settings (
    user_id INTEGER PRIMARY KEY,
    mistral_api_key TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
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
  `CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)`
];

export const TAG_TYPES = ["area", "symptoms", "activities", "medicines", "habits", "other"] as const;
export type TagType = (typeof TAG_TYPES)[number];

export const MOOD_TAG_FIELDS = ["positive_moods", "negative_moods", "general_moods"] as const;
export type MoodTagField = (typeof MOOD_TAG_FIELDS)[number];
