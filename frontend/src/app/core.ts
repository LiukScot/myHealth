import { create } from "zustand";
import { z } from "zod";
import { apiEnvelopeSchema } from "../lib";

export type User = { id: number; email: string; name: string | null };
type AuthState = { user: User | null; setUser: (user: User | null) => void };
export const useAuthStore = create<AuthState>((set) => ({ user: null, setUser: (user) => set({ user }) }));

export type PainFieldKey = "area" | "symptoms" | "activities" | "medicines" | "habits" | "other";
export type MoodFieldKey = "positive_moods" | "negative_moods" | "general_moods";

export const sessionDataSchema = apiEnvelopeSchema(
  z.object({
    authenticated: z.boolean(),
    user: z.object({ id: z.number(), email: z.string(), name: z.string().nullable() }).optional(),
  }),
);

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .refine((val) => val.newPassword === val.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export const diaryEntrySchema = z.object({
  id: z.number(),
  entryDate: z.string(),
  entryTime: z.string(),
  moodLevel: z.number().nullable(),
  depressionLevel: z.number().nullable(),
  anxietyLevel: z.number().nullable(),
  positiveMoods: z.string(),
  negativeMoods: z.string(),
  generalMoods: z.string(),
  description: z.string(),
  gratitude: z.string(),
  reflection: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const painEntrySchema = z.object({
  id: z.number(),
  entryDate: z.string(),
  entryTime: z.string(),
  painLevel: z.number().nullable(),
  fatigueLevel: z.number().nullable(),
  coffeeCount: z.number().nullable(),
  area: z.string(),
  symptoms: z.string(),
  activities: z.string(),
  medicines: z.string(),
  habits: z.string(),
  other: z.string(),
  note: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const prefsSchema = apiEnvelopeSchema(
  z.object({
    model: z.string(),
    chatRange: z.string(),
    lastRange: z.string(),
    graphSelection: z.record(z.string(), z.any()),
  }),
);

export const aiKeyStatusSchema = apiEnvelopeSchema(
  z.object({
    hasKey: z.boolean(),
    last4: z.string().optional(),
  }),
);

export const diaryListSchema = apiEnvelopeSchema(z.array(diaryEntrySchema));
export const painListSchema = apiEnvelopeSchema(z.array(painEntrySchema));
export const painOptionsSchema = apiEnvelopeSchema(
  z.object({
    area: z.array(z.string()),
    symptoms: z.array(z.string()),
    activities: z.array(z.string()),
    medicines: z.array(z.string()),
    habits: z.array(z.string()),
    other: z.array(z.string()),
  }),
);

export const moodOptionsSchema = apiEnvelopeSchema(
  z.object({
    positive_moods: z.array(z.string()),
    negative_moods: z.array(z.string()),
    general_moods: z.array(z.string()),
  }),
);

const nullableNumberField = (min: number, max: number) =>
  z.preprocess(
    (value) => {
      if (value === "" || value === null || value === undefined) return null;
      if (typeof value === "number" && Number.isNaN(value)) return null;
      return value;
    },
    z.number().min(min).max(max).nullable(),
  );

export const diaryFormSchema = z.object({
  dateTime: z.string().min(1),
  moodLevel: nullableNumberField(1, 9),
  depressionLevel: nullableNumberField(1, 9),
  anxietyLevel: nullableNumberField(1, 9),
  positiveMoods: z.string().default(""),
  negativeMoods: z.string().default(""),
  generalMoods: z.string().default(""),
  description: z.string().default(""),
  gratitude: z.string().default(""),
  reflection: z.string().default(""),
});

export const painFormSchema = z.object({
  dateTime: z.string().min(1),
  painLevel: nullableNumberField(1, 9),
  fatigueLevel: nullableNumberField(1, 9),
  coffeeCount: nullableNumberField(0, 50),
  area: z.string().default(""),
  symptoms: z.string().default(""),
  activities: z.string().default(""),
  medicines: z.string().default(""),
  habits: z.string().default(""),
  other: z.string().default(""),
  note: z.string().default(""),
});

export type DiaryEntry = z.infer<typeof diaryEntrySchema>;
export type PainEntry = z.infer<typeof painEntrySchema>;
export type DiaryFormValues = z.infer<typeof diaryFormSchema>;
export type PainFormValues = z.infer<typeof painFormSchema>;

export const navItems = ["dashboard", "diary", "pain", "cbt", "dbt", "chat", "settings"] as const;
export type NavItem = (typeof navItems)[number];

export const newEntryItems: NavItem[] = ["pain", "diary", "cbt", "dbt"];
export const therapyItems: NavItem[] = ["diary", "cbt", "dbt"];

export const dashboardQuickRanges = [
  { value: "7", label: "1 week" },
  { value: "30", label: "1 month" },
  { value: "90", label: "3 months" },
  { value: "180", label: "6 months" },
  { value: "365", label: "1 year" },
  { value: "1095", label: "3 years" },
  { value: "all", label: "Since start" },
] as const;
export type DashboardQuickRange = (typeof dashboardQuickRanges)[number]["value"];

export const wellbeingSeriesKeys = ["pain", "fatigue", "mood", "depression", "anxiety"] as const;
export type WellbeingSeriesKey = (typeof wellbeingSeriesKeys)[number];

export const wellbeingGraphId = "graph-wellbeing";
export const defaultPrefsValue = {
  model: "mistral-small-latest",
  chatRange: "all",
  lastRange: "all",
  graphSelection: {},
};

export const defaultWellbeingSelection: Record<WellbeingSeriesKey, boolean> = {
  pain: true,
  fatigue: true,
  mood: true,
  depression: true,
  anxiety: true,
};

export type DashboardCard = {
  label: string;
  emoji: string;
  value: number | null;
  formattedValue: string;
  previous: number | null;
  invertDelta?: boolean;
};

export type SeriesPoint = { date: string; value: number };
export type WellbeingSeries = {
  key: WellbeingSeriesKey;
  label: string;
  color: string;
  points: SeriesPoint[];
};

export type InlineMessageTone = "error" | "success" | "warning" | "info";
export type InlineMessage = {
  tone: InlineMessageTone;
  text: string;
};

export const BACKUP_JSON_EXPORT_OK: InlineMessage = { tone: "info", text: "JSON export started." };
export const BACKUP_JSON_IMPORT_OK: InlineMessage = { tone: "success", text: "JSON import completed." };
export const BACKUP_XLSX_EXPORT_OK: InlineMessage = { tone: "info", text: "Spreadsheet export started." };
export const BACKUP_XLSX_IMPORT_OK: InlineMessage = { tone: "success", text: "Spreadsheet import completed." };

export function inDateRange(dateValue: string, from: string, to: string): boolean {
  if (!dateValue) return false;
  if (from && dateValue < from) return false;
  if (to && dateValue > to) return false;
  return true;
}

export function average(values: Array<number | null | undefined>): number | null {
  const filtered = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!filtered.length) {
    return null;
  }
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

export function formatNumber(value: number | null, digits = 2): string {
  if (value === null) {
    return "–";
  }
  return value.toFixed(digits);
}

export function formatDelta(value: number, invert = false): { text: string; className: string } | null {
  if (!Number.isFinite(value)) return null;
  const rounded = Number(value.toFixed(0));
  if (!Number.isFinite(rounded)) return null;
  const positive = invert ? rounded < 0 : rounded > 0;
  const negative = invert ? rounded > 0 : rounded < 0;
  return {
    text: `${rounded > 0 ? "+" : ""}${rounded}%`,
    className: positive ? "positive" : negative ? "negative" : "neutral",
  };
}

export function calcDeltaPercent(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) {
    return null;
  }
  return ((current - previous) / previous) * 100;
}

const deltaSemantic: Record<string, { color: string; border: string; bg: string }> = {
  positive: { color: "#6fe1b0", border: "rgba(111, 225, 176, 0.5)", bg: "rgba(111, 225, 176, 0.09)" },
  negative: { color: "#ff8fb1", border: "rgba(255, 143, 177, 0.5)", bg: "rgba(255, 143, 177, 0.1)" },
  neutral: { color: "#a1a1ad", border: "var(--border)", bg: "rgba(255, 255, 255, 0.03)" },
};
const deltaWhite = "#f5f5f7";
const deltaWhiteBorder = "rgba(245, 245, 247, 0.4)";
const deltaWhiteBg = "rgba(255, 255, 255, 0.06)";

function blend(a: number, b: number, t: number) {
  return Math.round(a * t + b * (1 - t));
}

function blendHex(hexA: string, hexB: string, t: number): string {
  const parse = (h: string) => ({
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  });
  const pa = parse(hexA);
  const pb = parse(hexB);
  const hr = (x: number) => x.toString(16).padStart(2, "0");
  return `#${hr(blend(pa.r, pb.r, t))}${hr(blend(pa.g, pb.g, t))}${hr(blend(pa.b, pb.b, t))}`;
}

export function getDeltaStyle(className: string, absPct: number): React.CSSProperties {
  const semantic = deltaSemantic[className] ?? deltaSemantic.neutral;
  const t = Math.max(0, Math.min(1, 1 - absPct / 15));
  const useWhiteStyle = t > 0.5;
  return {
    color: blendHex(deltaWhite, semantic.color, t),
    borderColor: useWhiteStyle ? deltaWhiteBorder : semantic.border,
    backgroundColor: useWhiteStyle ? deltaWhiteBg : semantic.bg,
  };
}

export function previousRange(from: string, to: string): { from: string; to: string } | null {
  if (!from) {
    return null;
  }
  const fromDate = new Date(`${from}T00:00:00`);
  const toDate = to ? new Date(`${to}T23:59:59`) : new Date();
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return null;
  }
  const duration = toDate.getTime() - fromDate.getTime();
  if (duration <= 0) {
    return null;
  }
  const prevTo = new Date(fromDate.getTime() - 24 * 60 * 60 * 1000);
  const prevFrom = new Date(prevTo.getTime() - duration);
  return {
    from: prevFrom.toISOString().slice(0, 10),
    to: prevTo.toISOString().slice(0, 10),
  };
}

export function buildDailyAverages<T>(
  rows: T[],
  getDate: (row: T) => string,
  getValue: (row: T) => number | null | undefined,
): SeriesPoint[] {
  const buckets = new Map<string, { sum: number; count: number }>();
  for (const row of rows) {
    const date = getDate(row);
    const value = getValue(row);
    if (!date || typeof value !== "number" || !Number.isFinite(value)) {
      continue;
    }
    const current = buckets.get(date) ?? { sum: 0, count: 0 };
    current.sum += value;
    current.count += 1;
    buckets.set(date, current);
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, stats]) => ({ date, value: stats.sum / stats.count }));
}

export function extractWellbeingSelection(rawGraphSelection: Record<string, unknown> | undefined): Record<WellbeingSeriesKey, boolean> {
  const out: Record<WellbeingSeriesKey, boolean> = { ...defaultWellbeingSelection };
  const graphNode = rawGraphSelection?.[wellbeingGraphId];
  if (!graphNode || typeof graphNode !== "object") {
    return out;
  }
  const node = graphNode as Record<string, unknown>;
  for (const key of wellbeingSeriesKeys) {
    if (typeof node[key] === "boolean") {
      out[key] = node[key];
    }
  }
  return out;
}

export function csvToList(input?: string): string[] {
  if (!input) return [];
  const values = input
    .split(/,\s*/)
    .map((value) => value.trim())
    .filter(Boolean);
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(value);
  }
  return unique;
}

export function listToCsv(values: string[]): string {
  return csvToList(values.join(",")).join(", ");
}

export function mergeOptions(...collections: Array<string[] | undefined>): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const collection of collections) {
    for (const value of collection ?? []) {
      const clean = value.trim();
      if (!clean) continue;
      const key = clean.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(clean);
    }
  }
  return unique;
}

export function normalizeQuickRange(value: unknown): DashboardQuickRange {
  const str = String(value ?? "").trim();
  if (dashboardQuickRanges.some((item) => item.value === str)) {
    return str as DashboardQuickRange;
  }
  return "all";
}

export function getQuickRangeBounds(range: DashboardQuickRange): { from: string; to: string } {
  if (range === "all") {
    return { from: "", to: "" };
  }
  const days = Number(range);
  const now = new Date();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    from: from.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
  };
}
