import { sqliteTable, text, integer, index, primaryKey } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
  disabledAt: text("disabled_at"),
});

export const diaryEntries = sqliteTable(
  "diary_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    entryDate: text("entry_date").notNull(),
    entryTime: text("entry_time").notNull(),
    moodLevel: integer("mood_level"),
    depressionLevel: integer("depression_level"),
    anxietyLevel: integer("anxiety_level"),
    positiveMoods: text("positive_moods").default(""),
    negativeMoods: text("negative_moods").default(""),
    generalMoods: text("general_moods").default(""),
    description: text("description"),
    gratitude: text("gratitude"),
    reflection: text("reflection"),
    createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
    updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
  },
  (table) => [
    index("idx_diary_user_date").on(table.userId, table.entryDate, table.entryTime),
  ]
);

export const painEntries = sqliteTable(
  "pain_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    entryDate: text("entry_date").notNull(),
    entryTime: text("entry_time").notNull(),
    painLevel: integer("pain_level"),
    fatigueLevel: integer("fatigue_level"),
    coffeeCount: integer("coffee_count"),
    area: text("area").notNull().default(""),
    symptoms: text("symptoms").notNull().default(""),
    activities: text("activities").notNull().default(""),
    medicines: text("medicines").notNull().default(""),
    habits: text("habits").notNull().default(""),
    other: text("other").notNull().default(""),
    note: text("note"),
    createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
    updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
  },
  (table) => [
    index("idx_pain_user_date").on(table.userId, table.entryDate, table.entryTime),
  ]
);

export const cbtEntries = sqliteTable(
  "cbt_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    entryDate: text("entry_date").notNull(),
    entryTime: text("entry_time").notNull(),
    situation: text("situation").notNull().default(""),
    thoughts: text("thoughts").notNull().default(""),
    helpfulReasoning: text("helpful_reasoning").notNull().default(""),
    mainUnhelpfulThought: text("main_unhelpful_thought").notNull().default(""),
    effectOfBelieving: text("effect_of_believing").notNull().default(""),
    evidenceForAgainst: text("evidence_for_against").notNull().default(""),
    alternativeExplanation: text("alternative_explanation").notNull().default(""),
    worstBestScenario: text("worst_best_scenario").notNull().default(""),
    friendAdvice: text("friend_advice").notNull().default(""),
    productiveResponse: text("productive_response").notNull().default(""),
    createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
    updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
  },
  (table) => [
    index("idx_cbt_user_date").on(table.userId, table.entryDate, table.entryTime),
  ]
);

export const dbtEntries = sqliteTable(
  "dbt_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    entryDate: text("entry_date").notNull(),
    entryTime: text("entry_time").notNull(),
    emotionName: text("emotion_name").notNull().default(""),
    allowAffirmation: text("allow_affirmation").notNull().default(""),
    watchEmotion: text("watch_emotion").notNull().default(""),
    bodyLocation: text("body_location").notNull().default(""),
    bodyFeeling: text("body_feeling").notNull().default(""),
    presentMoment: text("present_moment").notNull().default(""),
    emotionReturns: text("emotion_returns").notNull().default(""),
    createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
    updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
  },
  (table) => [
    index("idx_dbt_user_date").on(table.userId, table.entryDate, table.entryTime),
  ]
);

export const userPreferences = sqliteTable("user_preferences", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  model: text("model").notNull().default("mistral-small-latest"),
  chatRange: text("chat_range").notNull().default("all"),
  lastRange: text("last_range").notNull().default("all"),
  graphSelectionJson: text("graph_selection_json").notNull().default("{}"),
  updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const appMeta = sqliteTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const sessions = sqliteTable("sessions", {
  sid: text("sid").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const painRemovedOptions = sqliteTable(
  "pain_removed_options",
  {
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    field: text("field").notNull(),
    value: text("value").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.field, table.value] }),
  ]
);

export const painOptions = sqliteTable("pain_options", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  field: text("field").notNull(),
  value: text("value").notNull(),
});

export const moodOptions = sqliteTable("mood_options", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  field: text("field").notNull(),
  value: text("value").notNull(),
});

export const moodRemovedOptions = sqliteTable(
  "mood_removed_options",
  {
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    field: text("field").notNull(),
    value: text("value").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.field, table.value] }),
  ]
);

export const mcpTokens = sqliteTable(
  "mcp_tokens",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    label: text("label").notNull().default(""),
    createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
    expiresAt: text("expires_at"),
    lastUsedAt: text("last_used_at"),
  },
  (table) => [
    index("idx_mcp_tokens_user").on(table.userId),
  ]
);
