import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { Chart as ChartJS, TimeScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from "chart.js";
import "chartjs-adapter-date-fns";
import { Line } from "react-chartjs-2";
import { apiEnvelopeSchema, apiFetch, splitDateTime, toLocalDateTimeValue } from "./lib";

ChartJS.register(TimeScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

type User = { id: number; email: string; name: string | null };
type AuthState = { user: User | null; setUser: (user: User | null) => void };
const useAuthStore = create<AuthState>((set) => ({ user: null, setUser: (user) => set({ user }) }));

const painFieldKeys = ["area", "symptoms", "activities", "medicines", "habits", "other"] as const;
type PainFieldKey = (typeof painFieldKeys)[number];



const sessionDataSchema = apiEnvelopeSchema(
  z.object({
    authenticated: z.boolean(),
    user: z
      .object({ id: z.number(), email: z.string(), name: z.string().nullable() })
      .optional()
  })
);

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
    confirmPassword: z.string().min(8)
  })
  .refine((val) => val.newPassword === val.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match"
  });

const diaryEntrySchema = z.object({
  id: z.number(),
  entryDate: z.string(),
  entryTime: z.string(),
  moodLevel: z.number().nullable(),
  depressionLevel: z.number().nullable(),
  anxietyLevel: z.number().nullable(),
  description: z.string(),
  gratitude: z.string(),
  reflection: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

const painEntrySchema = z.object({
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
  updatedAt: z.string()
});

const prefsSchema = apiEnvelopeSchema(
  z.object({
    model: z.string(),
    chatRange: z.string(),
    lastRange: z.string(),
    graphSelection: z.record(z.string(), z.any())
  })
);

const aiKeyStatusSchema = apiEnvelopeSchema(
  z.object({
    hasKey: z.boolean(),
    last4: z.string().optional()
  })
);

const diaryListSchema = apiEnvelopeSchema(z.array(diaryEntrySchema));
const painListSchema = apiEnvelopeSchema(z.array(painEntrySchema));
const painOptionsSchema = apiEnvelopeSchema(
  z.object({
    area: z.array(z.string()),
    symptoms: z.array(z.string()),
    activities: z.array(z.string()),
    medicines: z.array(z.string()),
    habits: z.array(z.string()),
    other: z.array(z.string())
  })
);

const nullableNumberField = (min: number, max: number) =>
  z.preprocess(
    (value) => {
      if (value === "" || value === null || value === undefined) return null;
      if (typeof value === "number" && Number.isNaN(value)) return null;
      return value;
    },
    z.number().min(min).max(max).nullable()
  );

const diaryFormSchema = z.object({
  dateTime: z.string().min(1),
  moodLevel: nullableNumberField(1, 9),
  depressionLevel: nullableNumberField(1, 9),
  anxietyLevel: nullableNumberField(1, 9),
  description: z.string().default(""),
  gratitude: z.string().default(""),
  reflection: z.string().default("")
});

const painFormSchema = z.object({
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
  note: z.string().default("")
});

type DiaryEntry = z.infer<typeof diaryEntrySchema>;
type PainEntry = z.infer<typeof painEntrySchema>;

const navItems = ["dashboard", "diary", "pain", "chat", "settings"] as const;
type NavItem = (typeof navItems)[number];

const dashboardQuickRanges = [
  { value: "7", label: "1 week" },
  { value: "30", label: "1 month" },
  { value: "90", label: "3 months" },
  { value: "180", label: "6 months" },
  { value: "365", label: "1 year" },
  { value: "1095", label: "3 years" },
  { value: "all", label: "Since start" }
] as const;
type DashboardQuickRange = (typeof dashboardQuickRanges)[number]["value"];

const wellbeingSeriesKeys = ["pain", "fatigue", "mood", "depression", "anxiety"] as const;
type WellbeingSeriesKey = (typeof wellbeingSeriesKeys)[number];

const wellbeingGraphId = "graph-wellbeing";
const defaultPrefsValue = {
  model: "mistral-small-latest",
  chatRange: "all",
  lastRange: "all",
  graphSelection: {}
};

const defaultWellbeingSelection: Record<WellbeingSeriesKey, boolean> = {
  pain: true,
  fatigue: true,
  mood: true,
  depression: true,
  anxiety: true
};

type DashboardCard = {
  label: string;
  emoji: string;
  value: number | null;
  formattedValue: string;
  previous: number | null;
  invertDelta?: boolean;
};

type SeriesPoint = { date: string; value: number };
type WellbeingSeries = {
  key: WellbeingSeriesKey;
  label: string;
  color: string;
  points: SeriesPoint[];
};

function normalizeQuickRange(value: unknown): DashboardQuickRange {
  const str = String(value ?? "").trim();
  if (dashboardQuickRanges.some((item) => item.value === str)) {
    return str as DashboardQuickRange;
  }
  return "all";
}

function getQuickRangeBounds(range: DashboardQuickRange): { from: string; to: string } {
  if (range === "all") {
    return { from: "", to: "" };
  }
  const days = Number(range);
  const now = new Date();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    from: from.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10)
  };
}

function inDateRange(dateValue: string, from: string, to: string): boolean {
  if (!dateValue) return false;
  if (from && dateValue < from) return false;
  if (to && dateValue > to) return false;
  return true;
}

function average(values: Array<number | null | undefined>): number | null {
  const filtered = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!filtered.length) {
    return null;
  }
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function formatNumber(value: number | null, digits = 2): string {
  if (value === null) {
    return "–";
  }
  return value.toFixed(digits);
}

function formatDelta(value: number, invert = false): { text: string; className: string } | null {
  if (!Number.isFinite(value)) return null;
  const rounded = Number(value.toFixed(0));
  if (!Number.isFinite(rounded)) return null;
  const positive = invert ? rounded < 0 : rounded > 0;
  const negative = invert ? rounded > 0 : rounded < 0;
  return {
    text: `${rounded > 0 ? "+" : ""}${rounded}%`,
    className: positive ? "positive" : negative ? "negative" : "neutral"
  };
}

function calcDeltaPercent(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) {
    return null;
  }
  return ((current - previous) / previous) * 100;
}

const deltaSemantic: Record<string, { color: string; border: string; bg: string }> = {
  positive: { color: "#6fe1b0", border: "rgba(111, 225, 176, 0.5)", bg: "rgba(111, 225, 176, 0.09)" },
  negative: { color: "#ff8fb1", border: "rgba(255, 143, 177, 0.5)", bg: "rgba(255, 143, 177, 0.1)" },
  neutral: { color: "#a1a1ad", border: "var(--border)", bg: "rgba(255, 255, 255, 0.03)" }
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
    b: parseInt(h.slice(5, 7), 16)
  });
  const pa = parse(hexA);
  const pb = parse(hexB);
  const hr = (x: number) => x.toString(16).padStart(2, "0");
  return `#${hr(blend(pa.r, pb.r, t))}${hr(blend(pa.g, pb.g, t))}${hr(blend(pa.b, pb.b, t))}`;
}

/** LIU-22: Closer to 0% = closer to white. Returns full style so badge visibly shifts (aggressive: 15% span). */
function getDeltaStyle(className: string, absPct: number): CSSProperties {
  const semantic = deltaSemantic[className] ?? deltaSemantic.neutral;
  const t = Math.max(0, Math.min(1, 1 - absPct / 15));
  const useWhiteStyle = t > 0.5;
  return {
    color: blendHex(deltaWhite, semantic.color, t),
    borderColor: useWhiteStyle ? deltaWhiteBorder : semantic.border,
    backgroundColor: useWhiteStyle ? deltaWhiteBg : semantic.bg
  };
}

function previousRange(from: string, to: string): { from: string; to: string } | null {
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
    to: prevTo.toISOString().slice(0, 10)
  };
}

function buildDailyAverages<T>(
  rows: T[],
  getDate: (row: T) => string,
  getValue: (row: T) => number | null | undefined
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

function extractWellbeingSelection(rawGraphSelection: Record<string, unknown> | undefined): Record<WellbeingSeriesKey, boolean> {
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

function csvToList(input?: string): string[] {
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

function listToCsv(values: string[]): string {
  return csvToList(values.join(",")).join(", ");
}

function mergeOptions(...collections: Array<string[] | undefined>): string[] {
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


function App() {
  const queryClient = useQueryClient();
  const { user, setUser } = useAuthStore();
  const [nav, setNav] = useState<NavItem>("dashboard");
  const [chatReply, setChatReply] = useState<string>("");
  const [chatStatus, setChatStatus] = useState<string>("");
  const [editingDiary, setEditingDiary] = useState<DiaryEntry | null>(null);
  const [editingPain, setEditingPain] = useState<PainEntry | null>(null);
  const [dashboardFrom, setDashboardFrom] = useState("");
  const [dashboardTo, setDashboardTo] = useState("");
  const [activeQuickRange, setActiveQuickRange] = useState<DashboardQuickRange>("all");
  const [graphSelection, setGraphSelection] = useState<Record<WellbeingSeriesKey, boolean>>(defaultWellbeingSelection);
  const [dashboardPrefsBootstrapped, setDashboardPrefsBootstrapped] = useState(false);

  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: async () => apiFetch("/api/v1/auth/session", { method: "GET" }, (raw) => sessionDataSchema.parse(raw).data)
  });

  if (sessionQuery.data?.authenticated && sessionQuery.data.user && !user) {
    setUser(sessionQuery.data.user);
  }
  if (sessionQuery.data && !sessionQuery.data.authenticated && user) {
    setUser(null);
  }

  const diaryQuery = useQuery({
    queryKey: ["diary"],
    enabled: !!user,
    queryFn: async () => apiFetch("/api/v1/diary", { method: "GET" }, (raw) => diaryListSchema.parse(raw).data)
  });

  const painQuery = useQuery({
    queryKey: ["pain"],
    enabled: !!user,
    queryFn: async () => apiFetch("/api/v1/pain", { method: "GET" }, (raw) => painListSchema.parse(raw).data)
  });

  const prefsQuery = useQuery({
    queryKey: ["prefs"],
    enabled: !!user,
    queryFn: async () => apiFetch("/api/v1/preferences", { method: "GET" }, (raw) => prefsSchema.parse(raw).data)
  });

  const aiKeyQuery = useQuery({
    queryKey: ["ai-key"],
    enabled: !!user,
    queryFn: async () => apiFetch("/api/v1/ai/key", { method: "GET" }, (raw) => aiKeyStatusSchema.parse(raw).data)
  });

  const painOptionsQuery = useQuery({
    queryKey: ["pain-options"],
    enabled: !!user,
    queryFn: async () => apiFetch("/api/v1/pain/options", { method: "GET" }, (raw) => painOptionsSchema.parse(raw).data)
  });

  useEffect(() => {
    setDashboardPrefsBootstrapped(false);
    setDashboardFrom("");
    setDashboardTo("");
    setActiveQuickRange("all");
    setGraphSelection(defaultWellbeingSelection);
  }, [user?.id]);

  const painFieldOptions = painOptionsQuery.data ?? {
    area: [], symptoms: [], activities: [], medicines: [], habits: [], other: []
  };

  const loginForm = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });
  const changePasswordForm = useForm<z.infer<typeof changePasswordSchema>>({
    resolver: zodResolver(changePasswordSchema)
  });

  const diaryForm = useForm<z.infer<typeof diaryFormSchema>>({
    defaultValues: {
      dateTime: toLocalDateTimeValue(),
      moodLevel: null,
      depressionLevel: null,
      anxietyLevel: null,
      description: "",
      gratitude: "",
      reflection: ""
    }
  });

  const painForm = useForm<z.infer<typeof painFormSchema>>({
    defaultValues: {
      dateTime: toLocalDateTimeValue(),
      painLevel: null,
      fatigueLevel: null,
      coffeeCount: null,
      area: "",
      symptoms: "",
      activities: "",
      medicines: "",
      habits: "",
      other: "",
      note: ""
    }
  });

  const loginMutation = useMutation({
    mutationFn: async (values: z.infer<typeof loginSchema>) =>
      apiFetch(
        "/api/v1/auth/login",
        { method: "POST", body: JSON.stringify(values) },
        (raw) => apiEnvelopeSchema(z.object({ email: z.string(), name: z.string().nullable() })).parse(raw).data
      ),
    onSuccess: async () => {
      const session = await queryClient.fetchQuery({
        queryKey: ["session"],
        queryFn: async () => apiFetch("/api/v1/auth/session", { method: "GET" }, (raw) => sessionDataSchema.parse(raw).data)
      });
      if (session.authenticated && session.user) {
        setUser(session.user);
      }
      loginForm.reset();
    }
  });

  const logoutMutation = useMutation({
    mutationFn: async () =>
      apiFetch("/api/v1/auth/logout", { method: "POST" }, (raw) =>
        apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data
      ),
    onSuccess: async () => {
      setUser(null);
      await queryClient.invalidateQueries();
    }
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (values: z.infer<typeof changePasswordSchema>) =>
      apiFetch(
        "/api/v1/auth/change-password",
        { method: "POST", body: JSON.stringify({ currentPassword: values.currentPassword, newPassword: values.newPassword }) },
        (raw) => apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data
      ),
    onSuccess: () => {
      changePasswordForm.reset();
      alert("Password updated");
    }
  });

  const diaryMutation = useMutation({
    mutationFn: async (values: z.infer<typeof diaryFormSchema>) => {
      const parsedValues = diaryFormSchema.parse(values);
      const parts = splitDateTime(parsedValues.dateTime);
      const payload = {
        entryDate: parts.entryDate,
        entryTime: parts.entryTime,
        moodLevel: parsedValues.moodLevel ?? null,
        depressionLevel: parsedValues.depressionLevel ?? null,
        anxietyLevel: parsedValues.anxietyLevel ?? null,
        description: parsedValues.description,
        gratitude: parsedValues.gratitude,
        reflection: parsedValues.reflection
      };
      if (editingDiary) {
        return apiFetch(
          `/api/v1/diary/${editingDiary.id}`,
          { method: "PUT", body: JSON.stringify(payload) },
          (raw) => apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data
        );
      }
      return apiFetch(
        "/api/v1/diary",
        { method: "POST", body: JSON.stringify(payload) },
        (raw) => apiEnvelopeSchema(z.object({ id: z.number() })).parse(raw).data
      );
    },
    onSuccess: async () => {
      setEditingDiary(null);
      diaryForm.reset({
        dateTime: toLocalDateTimeValue(),
        moodLevel: null,
        depressionLevel: null,
        anxietyLevel: null,
        description: "",
        gratitude: "",
        reflection: ""
      });
      await queryClient.invalidateQueries({ queryKey: ["diary"] });
    }
  });

  const painMutation = useMutation({
    mutationFn: async (values: z.infer<typeof painFormSchema>) => {
      const parsedValues = painFormSchema.parse(values);
      const parts = splitDateTime(parsedValues.dateTime);
      const payload = {
        entryDate: parts.entryDate,
        entryTime: parts.entryTime,
        painLevel: parsedValues.painLevel ?? null,
        fatigueLevel: parsedValues.fatigueLevel ?? null,
        coffeeCount: parsedValues.coffeeCount ?? null,
        area: parsedValues.area,
        symptoms: parsedValues.symptoms,
        activities: parsedValues.activities,
        medicines: parsedValues.medicines,
        habits: parsedValues.habits,
        other: parsedValues.other,
        note: parsedValues.note
      };

      if (editingPain) {
        return apiFetch(
          `/api/v1/pain/${editingPain.id}`,
          { method: "PUT", body: JSON.stringify(payload) },
          (raw) => apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data
        );
      }
      return apiFetch(
        "/api/v1/pain",
        { method: "POST", body: JSON.stringify(payload) },
        (raw) => apiEnvelopeSchema(z.object({ id: z.number() })).parse(raw).data
      );
    },
    onSuccess: async () => {
      setEditingPain(null);
      painForm.reset({
        dateTime: toLocalDateTimeValue(),
        painLevel: null,
        fatigueLevel: null,
        coffeeCount: null,
        area: "",
        symptoms: "",
        activities: "",
        medicines: "",
        habits: "",
        other: "",
        note: ""
      });
      await queryClient.invalidateQueries({ queryKey: ["pain"] });
    }
  });

  const diaryDeleteMutation = useMutation({
    mutationFn: async (id: number) =>
      apiFetch(`/api/v1/diary/${id}`, { method: "DELETE" }, (raw) =>
        apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["diary"] });
    }
  });

  const painDeleteMutation = useMutation({
    mutationFn: async (id: number) =>
      apiFetch(`/api/v1/pain/${id}`, { method: "DELETE" }, (raw) =>
        apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pain"] });
    }
  });

  const aiKeyMutation = useMutation({
    mutationFn: async (key: string) =>
      apiFetch("/api/v1/ai/key", { method: "PUT", body: JSON.stringify({ key }) }, (raw) =>
        apiEnvelopeSchema(z.object({ hasKey: z.boolean() })).parse(raw).data
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ai-key"] });
    }
  });

  const clearAiKeyMutation = useMutation({
    mutationFn: async () =>
      apiFetch("/api/v1/ai/key", { method: "DELETE" }, (raw) =>
        apiEnvelopeSchema(z.object({ hasKey: z.boolean() })).parse(raw).data
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ai-key"] });
    }
  });

  const prefsMutation = useMutation({
    mutationFn: async (values: { model: string; chatRange: string; lastRange: string; graphSelection: Record<string, unknown> }) =>
      apiFetch("/api/v1/preferences", { method: "PUT", body: JSON.stringify(values) }, (raw) =>
        apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["prefs"] });
    }
  });

  const purgeMutation = useMutation({
    mutationFn: async () =>
      apiFetch("/api/v1/data/purge", { method: "POST" }, (raw) =>
        apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["diary"] });
      await queryClient.invalidateQueries({ queryKey: ["pain"] });
      await queryClient.invalidateQueries({ queryKey: ["prefs"] });
      setNav("dashboard");
    }
  });

  const savePrefsPatch = (
    patch: Partial<{ model: string; chatRange: string; lastRange: string; graphSelection: Record<string, unknown> }>
  ) => {
    const base = prefsQuery.data ?? defaultPrefsValue;
    prefsMutation.mutate({
      model: patch.model ?? base.model,
      chatRange: patch.chatRange ?? base.chatRange,
      lastRange: patch.lastRange ?? base.lastRange,
      graphSelection: patch.graphSelection ?? base.graphSelection
    });
  };

  useEffect(() => {
    if (!prefsQuery.data || dashboardPrefsBootstrapped) {
      return;
    }

    const restoredRange = normalizeQuickRange(prefsQuery.data.lastRange);
    const bounds = getQuickRangeBounds(restoredRange);
    setDashboardFrom(bounds.from);
    setDashboardTo(bounds.to);
    setActiveQuickRange(restoredRange);
    setGraphSelection(extractWellbeingSelection(prefsQuery.data.graphSelection));
    setDashboardPrefsBootstrapped(true);
  }, [prefsQuery.data, dashboardPrefsBootstrapped]);

  const applyDashboardQuickRange = (range: DashboardQuickRange, persist = true) => {
    const bounds = getQuickRangeBounds(range);
    setDashboardFrom(bounds.from);
    setDashboardTo(bounds.to);
    setActiveQuickRange(range);
    if (persist) {
      savePrefsPatch({ lastRange: range });
    }
  };

  const handleDashboardDateChange = (field: "from" | "to", value: string) => {
    if (field === "from") {
      setDashboardFrom(value);
    } else {
      setDashboardTo(value);
    }
    setActiveQuickRange("all");
    savePrefsPatch({ lastRange: "all" });
  };

  const filteredDiary = useMemo(
    () => (diaryQuery.data ?? []).filter((entry) => inDateRange(entry.entryDate, dashboardFrom, dashboardTo)),
    [diaryQuery.data, dashboardFrom, dashboardTo]
  );

  const filteredPain = useMemo(
    () => (painQuery.data ?? []).filter((entry) => inDateRange(entry.entryDate, dashboardFrom, dashboardTo)),
    [painQuery.data, dashboardFrom, dashboardTo]
  );

  const previousBounds = useMemo(() => previousRange(dashboardFrom, dashboardTo), [dashboardFrom, dashboardTo]);
  const previousFrom = previousBounds?.from ?? "";
  const previousTo = previousBounds?.to ?? "";

  const previousDiary = useMemo(
    () => (previousBounds ? (diaryQuery.data ?? []).filter((entry) => inDateRange(entry.entryDate, previousFrom, previousTo)) : []),
    [diaryQuery.data, previousBounds, previousFrom, previousTo]
  );

  const previousPain = useMemo(
    () => (previousBounds ? (painQuery.data ?? []).filter((entry) => inDateRange(entry.entryDate, previousFrom, previousTo)) : []),
    [painQuery.data, previousBounds, previousFrom, previousTo]
  );

  const dashboardCards = useMemo<DashboardCard[]>(() => {
    const currentValues = {
      diaryCount: filteredDiary.length,
      painCount: filteredPain.length,
      moodAvg: average(filteredDiary.map((entry) => entry.moodLevel)),
      depressionAvg: average(filteredDiary.map((entry) => entry.depressionLevel)),
      anxietyAvg: average(filteredDiary.map((entry) => entry.anxietyLevel)),
      painAvg: average(filteredPain.map((entry) => entry.painLevel)),
      fatigueAvg: average(filteredPain.map((entry) => entry.fatigueLevel))
    };

    const previousValues = {
      diaryCount: previousBounds ? previousDiary.length : null,
      painCount: previousBounds ? previousPain.length : null,
      moodAvg: previousBounds ? average(previousDiary.map((entry) => entry.moodLevel)) : null,
      depressionAvg: previousBounds ? average(previousDiary.map((entry) => entry.depressionLevel)) : null,
      anxietyAvg: previousBounds ? average(previousDiary.map((entry) => entry.anxietyLevel)) : null,
      painAvg: previousBounds ? average(previousPain.map((entry) => entry.painLevel)) : null,
      fatigueAvg: previousBounds ? average(previousPain.map((entry) => entry.fatigueLevel)) : null
    };

    return [
      {
        label: "Journal entries",
        emoji: "📒",
        value: currentValues.diaryCount,
        formattedValue: String(currentValues.diaryCount),
        previous: previousValues.diaryCount
      },
      {
        label: "Pain entries",
        emoji: "📓",
        value: currentValues.painCount,
        formattedValue: String(currentValues.painCount),
        previous: previousValues.painCount
      },
      {
        label: "Mood avg",
        emoji: "🙂",
        value: currentValues.moodAvg,
        formattedValue: formatNumber(currentValues.moodAvg),
        previous: previousValues.moodAvg
      },
      {
        label: "Depression avg",
        emoji: "😔",
        value: currentValues.depressionAvg,
        formattedValue: formatNumber(currentValues.depressionAvg),
        previous: previousValues.depressionAvg,
        invertDelta: true
      },
      {
        label: "Anxiety avg",
        emoji: "😨",
        value: currentValues.anxietyAvg,
        formattedValue: formatNumber(currentValues.anxietyAvg),
        previous: previousValues.anxietyAvg,
        invertDelta: true
      },
      {
        label: "Pain avg",
        emoji: "🤕",
        value: currentValues.painAvg,
        formattedValue: formatNumber(currentValues.painAvg),
        previous: previousValues.painAvg,
        invertDelta: true
      },
      {
        label: "Fatigue avg",
        emoji: "🥱",
        value: currentValues.fatigueAvg,
        formattedValue: formatNumber(currentValues.fatigueAvg),
        previous: previousValues.fatigueAvg,
        invertDelta: true
      }
    ];
  }, [filteredDiary, filteredPain, previousBounds, previousDiary, previousPain]);

  const wellbeingSeries = useMemo<WellbeingSeries[]>(() => {
    return [
      { key: "pain", label: "Pain", color: "#ff6f91", points: buildDailyAverages(filteredPain, (entry) => entry.entryDate, (entry) => entry.painLevel) },
      { key: "fatigue", label: "Fatigue", color: "#f6c344", points: buildDailyAverages(filteredPain, (entry) => entry.entryDate, (entry) => entry.fatigueLevel) },
      { key: "mood", label: "Mood", color: "#7bd3f1", points: buildDailyAverages(filteredDiary, (entry) => entry.entryDate, (entry) => entry.moodLevel) },
      { key: "depression", label: "Depression", color: "#c6a1ff", points: buildDailyAverages(filteredDiary, (entry) => entry.entryDate, (entry) => entry.depressionLevel) },
      { key: "anxiety", label: "Anxiety", color: "#6fe1b0", points: buildDailyAverages(filteredDiary, (entry) => entry.entryDate, (entry) => entry.anxietyLevel) }
    ];
  }, [filteredDiary, filteredPain]);

  const wellbeingChart = useMemo(() => {
    const visibleSeries = wellbeingSeries.filter((series) => (graphSelection[series.key] ?? true) && series.points.length > 0);
    const hasAnyData = wellbeingSeries.some((series) => series.points.length > 0);

    return {
      hasAnyData,
      hasVisibleData: visibleSeries.length > 0,
      data: {
        datasets: visibleSeries.map((series) => ({
          label: series.label,
          data: series.points.map((point) => ({ x: point.date, y: Number(point.value.toFixed(2)) })),
          borderColor: series.color,
          backgroundColor: series.color,
          tension: 0.32,
          pointRadius: 2.5,
          spanGaps: true
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: "#f5f5f7" }
          }
        },
        scales: {
          x: {
            type: "time" as const,
            time: {
              parser: "yyyy-MM-dd",
              tooltipFormat: "dd MMM yyyy",
              unit: undefined
            },
            ticks: { color: "#a1a1ad", maxTicksLimit: 12 },
            grid: { color: "rgba(255,255,255,0.08)" }
          },
          y: {
            min: 0,
            max: 10,
            ticks: { color: "#a1a1ad", stepSize: 1 },
            grid: { color: "rgba(255,255,255,0.08)" }
          }
        }
      }
    };
  }, [wellbeingSeries, graphSelection]);

  const doExportJson = async () => {
    const payload = await apiFetch("/api/v1/backup/json", { method: "GET" }, (raw) => apiEnvelopeSchema(z.any()).parse(raw).data);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `myhealth-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  };

  const doImportJson = async (file: File) => {
    const text = await file.text();
    const parsed = JSON.parse(text);
    await apiFetch(
      "/api/v1/backup/json/import",
      { method: "POST", body: JSON.stringify(parsed) },
      (raw) => apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data
    );
    await queryClient.invalidateQueries();
  };

  const doExportXlsx = async () => {
    const response = await fetch("/api/v1/backup/xlsx", { credentials: "include" });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `HTTP ${response.status}`);
    }
    const blob = await response.blob();
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `myhealth-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  };

  const doImportXlsx = async (file: File) => {
    const form = new FormData();
    form.set("file", file);
    const response = await fetch("/api/v1/backup/xlsx/import", {
      method: "POST",
      credentials: "include",
      body: form
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `HTTP ${response.status}`);
    }
    await queryClient.invalidateQueries();
  };

  if (!user) {
    return (
      <main className="screen auth-screen">
        <section className="auth-card">
          <h1>myHealth</h1>
          <p>Sign in to access your private health workspace.</p>
          <form onSubmit={loginForm.handleSubmit((values) => loginMutation.mutate(values))} className="stack">
            <label>
              Email
              <input type="email" {...loginForm.register("email")} />
            </label>
            <label>
              Password
              <input type="password" {...loginForm.register("password")} />
            </label>
            <button type="submit" disabled={loginMutation.isPending}>
              {loginMutation.isPending ? "Signing in..." : "Sign in"}
            </button>
            {loginMutation.error && <p className="error">{String((loginMutation.error as Error).message)}</p>}
            <p className="hint">Signup is disabled. Use CLI provisioning.</p>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="screen app-screen">
      <header className="app-header">
        <div>
          <h1>myHealth</h1>
        </div>
        <div className="header-actions">
          <details>
            <summary>Account</summary>
            <form className="stack" onSubmit={changePasswordForm.handleSubmit((v) => changePasswordMutation.mutate(v))}>
              <label>
                Current password
                <input type="password" {...changePasswordForm.register("currentPassword")} />
              </label>
              <label>
                New password
                <input type="password" {...changePasswordForm.register("newPassword")} />
              </label>
              <label>
                Confirm
                <input type="password" {...changePasswordForm.register("confirmPassword")} />
              </label>
              <button type="submit" disabled={changePasswordMutation.isPending}>
                Change password
              </button>
              {changePasswordMutation.error && <p className="error">{String((changePasswordMutation.error as Error).message)}</p>}
            </form>
            <button onClick={() => logoutMutation.mutate()} disabled={logoutMutation.isPending}>
              Log out
            </button>
          </details>
        </div>
      </header>

      <nav className="nav-grid">
        {navItems.map((item) => (
          <button key={item} className={item === nav ? "active" : ""} onClick={() => setNav(item)}>
            {item}
          </button>
        ))}
      </nav>

      {nav === "dashboard" && (
        <section className="panel">
          <h2>Dashboard</h2>
          <p className="hint">Overview of diary and pain logs.</p>

          <div className="dashboard-filters">
            <label>
              From
              <input type="date" value={dashboardFrom} onChange={(event) => handleDashboardDateChange("from", event.target.value)} />
            </label>
            <label>
              To
              <input type="date" value={dashboardTo} onChange={(event) => handleDashboardDateChange("to", event.target.value)} />
            </label>
            <div className="dashboard-quick-ranges">
              {dashboardQuickRanges.map((range) => (
                <button
                  type="button"
                  key={range.value}
                  className={activeQuickRange === range.value ? "active" : ""}
                  onClick={() => applyDashboardQuickRange(range.value)}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>

          <div className="stats-grid stats-grid-dashboard">
            {dashboardCards.map((card) => {
              const deltaPct = calcDeltaPercent(card.value, card.previous);
              const delta = deltaPct === null ? null : formatDelta(deltaPct, Boolean(card.invertDelta));
              const absPct = deltaPct !== null ? Math.abs(deltaPct) : 0;
              const deltaStyle = delta ? getDeltaStyle(delta.className, absPct) : undefined;
              return (
                <article key={card.label}>
                  <h3>
                    <span className="card-emoji" aria-hidden="true">
                      {card.emoji}
                    </span>
                    {card.label}
                  </h3>
                  <strong>{card.formattedValue}</strong>
                  {delta ? (
                    <span className={`delta ${delta.className}`} style={deltaStyle}>
                      {delta.text}
                    </span>
                  ) : null}
                </article>
              );
            })}
          </div>

          <div className="chart-wrap chart-wrap-wide">
            <div className="graph-header">
              <h3>Metrics over time</h3>
              <div className="graph-toggle-list">
                {wellbeingSeries.map((series) => {
                  const checked = graphSelection[series.key] ?? true;
                  const hasData = series.points.length > 0;
                  return (
                    <label
                      key={series.key}
                      className={hasData ? "series-toggle" : "series-toggle is-disabled"}
                      style={{ "--series-color": series.color } as CSSProperties}
                    >
                      <input
                        type="checkbox"
                        checked={checked && hasData}
                        disabled={!hasData}
                        onChange={(event) => {
                          const nextSelection = { ...graphSelection, [series.key]: event.target.checked };
                          setGraphSelection(nextSelection);
                          savePrefsPatch({
                            graphSelection: {
                              ...(prefsQuery.data?.graphSelection ?? {}),
                              [wellbeingGraphId]: nextSelection
                            }
                          });
                        }}
                      />
                      <span>{series.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {wellbeingChart.hasVisibleData ? (
              <div className="chart-canvas chart-canvas-wide">
                <Line data={wellbeingChart.data} options={wellbeingChart.options} />
              </div>
            ) : (
              <p className="hint">{wellbeingChart.hasAnyData ? "Toggle on a metric to see it." : "No data yet"}</p>
            )}
          </div>
        </section>
      )}

      {nav === "diary" && (
        <section className="panel">
          <h2>Diary</h2>
          <form className="form-grid" onSubmit={diaryForm.handleSubmit((v) => diaryMutation.mutate(v))}>
            <label>
              Date/time
              <input type="datetime-local" {...diaryForm.register("dateTime")} />
            </label>
            <label>
              Mood (1-9)
              <input type="number" min={1} max={9} step={0.1} {...diaryForm.register("moodLevel", { valueAsNumber: true })} />
            </label>
            <label>
              Depression (1-9)
              <input type="number" min={1} max={9} {...diaryForm.register("depressionLevel", { valueAsNumber: true })} />
            </label>
            <label>
              Anxiety (1-9)
              <input type="number" min={1} max={9} {...diaryForm.register("anxietyLevel", { valueAsNumber: true })} />
            </label>
            <label>
              Description
              <textarea {...diaryForm.register("description")} />
            </label>
            <label>
              Gratitude
              <textarea {...diaryForm.register("gratitude")} />
            </label>
            <label>
              Reflection
              <textarea {...diaryForm.register("reflection")} />
            </label>
            <div className="row-actions">
              <button type="submit">{editingDiary ? "Update entry" : "Add entry"}</button>
              {editingDiary && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingDiary(null);
                    diaryForm.reset({
                      dateTime: toLocalDateTimeValue(),
                      moodLevel: null,
                      depressionLevel: null,
                      anxietyLevel: null,
                      description: "",
                      gratitude: "",
                      reflection: ""
                    });
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>

          <div className="table-scroll diary-table">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Mood</th>
                  <th>Dep</th>
                  <th>Anx</th>
                  <th>Description</th>
                  <th>Gratitude</th>
                  <th>Reflection</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(diaryQuery.data ?? []).map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.entryDate}</td>
                    <td>{entry.entryTime}</td>
                    <td>{entry.moodLevel ?? "-"}</td>
                    <td>{entry.depressionLevel ?? "-"}</td>
                    <td>{entry.anxietyLevel ?? "-"}</td>
                    <td>{entry.description || "-"}</td>
                    <td>{entry.gratitude || "-"}</td>
                    <td>{entry.reflection || "-"}</td>
                    <td>
                      <button
                        onClick={() => {
                          setEditingDiary(entry);
                          diaryForm.reset({
                            dateTime: toLocalDateTimeValue(entry.entryDate, entry.entryTime),
                            moodLevel: entry.moodLevel,
                            depressionLevel: entry.depressionLevel,
                            anxietyLevel: entry.anxietyLevel,
                            description: entry.description,
                            gratitude: entry.gratitude,
                            reflection: entry.reflection
                          });
                        }}
                      >
                        Edit
                      </button>
                      <button onClick={() => diaryDeleteMutation.mutate(entry.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {nav === "pain" && (
        <section className="panel">
          <h2>Pain</h2>
                    <form className="stack pain-form" onSubmit={painForm.handleSubmit((v) => painMutation.mutate(v))}>
            <div className="pain-core-grid">
              <label>
                Date/time
                <input type="datetime-local" {...painForm.register("dateTime")} />
              </label>
              <label>
                Pain (1-9)
                <input type="number" min={1} max={9} {...painForm.register("painLevel", { valueAsNumber: true })} />
              </label>
              <label>
                Fatigue (1-9)
                <input type="number" min={1} max={9} {...painForm.register("fatigueLevel", { valueAsNumber: true })} />
              </label>
              <label>
                Coffee
                <input type="number" min={0} max={50} {...painForm.register("coffeeCount", { valueAsNumber: true })} />
              </label>
            </div>

            <div className="pain-tags-grid">
              <MultiSelectField
                label="Area"
                fieldKey="area"
                value={painForm.watch("area")}
                options={painFieldOptions.area}
                onChange={(next) => painForm.setValue("area", next, { shouldDirty: true })}
              />
              <hr className="pain-tags-sep" />
              <MultiSelectField
                label="Symptoms"
                fieldKey="symptoms"
                value={painForm.watch("symptoms")}
                options={painFieldOptions.symptoms}
                onChange={(next) => painForm.setValue("symptoms", next, { shouldDirty: true })}
              />
              <hr className="pain-tags-sep" />
              <MultiSelectField
                label="Activities"
                fieldKey="activities"
                value={painForm.watch("activities")}
                options={painFieldOptions.activities}
                onChange={(next) => painForm.setValue("activities", next, { shouldDirty: true })}
              />
              <hr className="pain-tags-sep" />
              <MultiSelectField
                label="Medicines"
                fieldKey="medicines"
                value={painForm.watch("medicines")}
                options={painFieldOptions.medicines}
                onChange={(next) => painForm.setValue("medicines", next, { shouldDirty: true })}
              />
              <hr className="pain-tags-sep" />
              <MultiSelectField
                label="Habits"
                fieldKey="habits"
                value={painForm.watch("habits")}
                options={painFieldOptions.habits}
                onChange={(next) => painForm.setValue("habits", next, { shouldDirty: true })}
              />
              <hr className="pain-tags-sep" />
              <MultiSelectField
                label="Other"
                fieldKey="other"
                value={painForm.watch("other")}
                options={painFieldOptions.other}
                onChange={(next) => painForm.setValue("other", next, { shouldDirty: true })}
              />
            </div>

            <label className="pain-note-field">
              Notes
              <textarea {...painForm.register("note")} />
            </label>

            <div className="row-actions">
              <button type="submit">{editingPain ? "Update entry" : "Add entry"}</button>
              {editingPain && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingPain(null);
                    painForm.reset({
                      dateTime: toLocalDateTimeValue(),
                      painLevel: null,
                      fatigueLevel: null,
                      coffeeCount: null,
                      area: "",
                      symptoms: "",
                      activities: "",
                      medicines: "",
                      habits: "",
                      other: "",
                      note: ""
                    });
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>

          <div className="table-scroll pain-table">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Pain</th>
                  <th>Fatigue</th>
                  <th>Coffee</th>
                  <th>Area</th>
                  <th>Symptoms</th>
                  <th>Activities</th>
                  <th>Medicines</th>
                  <th>Habits</th>
                  <th>Other</th>
                  <th>Notes</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(painQuery.data ?? []).map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.entryDate}</td>
                    <td>{entry.entryTime}</td>
                    <td>{entry.painLevel ?? "-"}</td>
                    <td>{entry.fatigueLevel ?? "-"}</td>
                    <td>{entry.coffeeCount ?? "-"}</td>
                    <td>{entry.area || "-"}</td>
                    <td>{entry.symptoms || "-"}</td>
                    <td>{entry.activities || "-"}</td>
                    <td>{entry.medicines || "-"}</td>
                    <td>{entry.habits || "-"}</td>
                    <td>{entry.other || "-"}</td>
                    <td>{entry.note || "-"}</td>
                    <td>
                      <button
                        onClick={() => {
                          setEditingPain(entry);
                          painForm.reset({
                            dateTime: toLocalDateTimeValue(entry.entryDate, entry.entryTime),
                            painLevel: entry.painLevel,
                            fatigueLevel: entry.fatigueLevel,
                            coffeeCount: entry.coffeeCount,
                            area: entry.area,
                            symptoms: entry.symptoms,
                            activities: entry.activities,
                            medicines: entry.medicines,
                            habits: entry.habits,
                            other: entry.other,
                            note: entry.note
                          });
                        }}
                      >
                        Edit
                      </button>
                      <button onClick={() => painDeleteMutation.mutate(entry.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {nav === "chat" && (
        <section className="panel">
          <h2>Chatbot</h2>
          <p className="hint">AI key {aiKeyQuery.data?.hasKey ? `configured (ending ${aiKeyQuery.data.last4 ?? ""})` : "not configured"}</p>
          <ChatComposer
            defaultModel={prefsQuery.data?.model ?? "mistral-small-latest"}
            defaultRange={prefsQuery.data?.chatRange ?? "all"}
            onSend={async (message, model, range) => {
              setChatStatus("Sending...");
              const data = await apiFetch(
                "/api/v1/ai/chat",
                { method: "POST", body: JSON.stringify({ message, model, range }) },
                (raw) => apiEnvelopeSchema(z.object({ reply: z.string(), fallback: z.boolean().optional() })).parse(raw).data
              );
              setChatReply(data.reply);
              setChatStatus(data.fallback ? "AI fallback response" : "AI response received");
            }}
          />
          {chatStatus && <p className="hint">{chatStatus}</p>}
          {chatReply && <article className="chat-output">{chatReply}</article>}
        </section>
      )}

      {nav === "settings" && (
        <section className="panel">
          <h2>Settings</h2>
          <div className="settings-grid">
            <article>
              <h3>AI key</h3>
              <AiKeyEditor
                hasKey={Boolean(aiKeyQuery.data?.hasKey)}
                onSave={(key) => aiKeyMutation.mutate(key)}
                onClear={() => clearAiKeyMutation.mutate()}
              />
            </article>
            <article>
              <h3>Preferences</h3>
              <PreferencesEditor
                value={prefsQuery.data ?? { model: "mistral-small-latest", chatRange: "all", lastRange: "all", graphSelection: {} }}
                onSave={(value) => prefsMutation.mutate(value)}
              />
            </article>
            <article>
              <h3>Backup</h3>
              <button onClick={doExportJson}>Export JSON</button>
              <label className="file-input">
                Import JSON
                <input
                  type="file"
                  accept=".json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      doImportJson(file).catch((err) => alert((err as Error).message));
                    }
                  }}
                />
              </label>
              <button onClick={() => doExportXlsx().catch((err) => alert((err as Error).message))}>Export XLSX</button>
              <label className="file-input">
                Import XLSX
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      doImportXlsx(file).catch((err) => alert((err as Error).message));
                    }
                  }}
                />
              </label>
            </article>
            <article>
              <h3>Danger zone</h3>
              <button
                className="danger"
                onClick={() => {
                  if (confirm("Delete all myHealth data for this account?")) {
                    purgeMutation.mutate();
                  }
                }}
              >
                Purge all data
              </button>
            </article>
          </div>
        </section>
      )}
    </main>
  );
}

type MultiSelectFieldProps = {
  label: string;
  fieldKey: PainFieldKey;
  value: string;
  options: string[];
  onChange: (next: string) => void;
};

function MultiSelectField({ label, fieldKey, value, options, onChange }: MultiSelectFieldProps) {
  const queryClient = useQueryClient();
  const selectedValues = useMemo(() => csvToList(value), [value]);
  const [hiddenSet, setHiddenSet] = useState<Set<string>>(() => new Set());
  const selectedSet = useMemo(() => new Set(selectedValues.map((entry) => entry.toLowerCase())), [selectedValues]);
  const allOptions = useMemo(() => {
    const merged = mergeOptions(options, selectedValues);
    if (!hiddenSet.size) return merged;
    return merged.filter((option) => {
      const key = option.toLowerCase();
      // Allow hidden options to remain visible when currently selected
      if (selectedSet.has(key)) return true;
      return !hiddenSet.has(key);
    });
  }, [options, selectedValues, hiddenSet, selectedSet]);
  const [customValue, setCustomValue] = useState("");

  useEffect(() => {
    if (!selectedValues.length) {
      setCustomValue("");
    }
  }, [selectedValues.length]);

  const toggleOption = (option: string) => {
    const key = option.trim().toLowerCase();
    if (!key) return;

    const isSelected = selectedValues.some((entry) => entry.trim().toLowerCase() === key);
    const nextValues = isSelected
      ? selectedValues.filter((entry) => entry.trim().toLowerCase() !== key)
      : [...selectedValues, option];

    onChange(listToCsv(nextValues));
  };

  const permanentlyRemoveOption = async (option: string) => {
    const key = option.trim().toLowerCase();
    if (!key) return;

    setHiddenSet((current) => {
      const next = new Set(current);
      next.add(key);
      return next;
    });

    const nextValues = selectedValues.filter((entry) => entry.trim().toLowerCase() !== key);
    onChange(listToCsv(nextValues));

    try {
      await apiFetch(
        "/api/v1/pain/options/remove",
        {
          method: "POST",
          body: JSON.stringify({ field: fieldKey, value: option })
        },
        (raw) => apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data
      );
      await queryClient.invalidateQueries({ queryKey: ["pain-options"] });
    } catch {
      // if this fails, the option will still be hidden locally for this session
    }
  };

  const clearSelections = () => {
    onChange("");
  };

  return (
    <div className="multi-select-field">
      <span>{label}</span>
      <div className="multi-option-list" role="group" aria-label={label}>
        {allOptions.map((option) => {
          const isSelected = selectedSet.has(option.toLowerCase());
          return (
            <button
              type="button"
              key={option}
              className={isSelected ? "multi-option-chip active" : "multi-option-chip"}
              onClick={() => toggleOption(option)}
            >
              <span className="multi-option-label">{option}</span>
              <span
                className="multi-option-remove"
                onClick={(event) => {
                  event.stopPropagation();
                  if (!confirm(`Remove "${option}" from suggestions?`)) return;
                  void permanentlyRemoveOption(option);
                }}
                aria-hidden="true"
              >
                ×
              </span>
            </button>
          );
        })}
      </div>
      <div className="row-actions multi-option-actions">
        <input
          type="text"
          placeholder={"Add " + label.toLowerCase() + " option"}
          value={customValue}
          onChange={(event) => setCustomValue(event.target.value)}
        />
        <button
          type="button"
          onClick={() => {
            const clean = customValue.trim();
            if (!clean) return;
            const nextValues = mergeOptions(selectedValues, [clean]);
            onChange(listToCsv(nextValues));
            setCustomValue("");
            setHiddenSet((current) => {
              const key = clean.toLowerCase();
              if (!current.has(key)) return current;
              const next = new Set(current);
              next.delete(key);
              return next;
            });
            void (async () => {
              try {
                await apiFetch(
                  "/api/v1/pain/options/restore",
                  {
                    method: "POST",
                    body: JSON.stringify({ field: fieldKey, value: clean })
                  },
                  (raw) => apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data
                );
                await queryClient.invalidateQueries({ queryKey: ["pain-options"] });
              } catch {
                // ignore failures; option is already visible locally
              }
            })();
          }}
        >
          Add
        </button>
        <button type="button" onClick={clearSelections} disabled={!selectedValues.length}>
          Clear
        </button>
      </div>
    </div>
  );
}

type AiKeyEditorProps = {
  hasKey: boolean;
  onSave: (key: string) => void;
  onClear: () => void;
};

function AiKeyEditor({ hasKey, onSave, onClear }: AiKeyEditorProps) {
  const [value, setValue] = useState("");
  return (
    <div className="stack">
      <input type="password" placeholder={hasKey ? "Stored key exists" : "Paste key"} value={value} onChange={(e) => setValue(e.target.value)} />
      <div className="row-actions">
        <button
          onClick={() => {
            if (!value.trim()) {
              alert("Enter a key");
              return;
            }
            onSave(value.trim());
            setValue("");
          }}
        >
          Save key
        </button>
        <button onClick={onClear}>Clear key</button>
      </div>
    </div>
  );
}

type PreferencesEditorProps = {
  value: { model: string; chatRange: string; lastRange: string; graphSelection: Record<string, unknown> };
  onSave: (value: { model: string; chatRange: string; lastRange: string; graphSelection: Record<string, unknown> }) => void;
};

function PreferencesEditor({ value, onSave }: PreferencesEditorProps) {
  const [model, setModel] = useState(value.model);
  const [chatRange, setChatRange] = useState(value.chatRange);
  const [lastRange, setLastRange] = useState(value.lastRange);

  useEffect(() => {
    setModel(value.model);
  }, [value.model]);

  useEffect(() => {
    setChatRange(value.chatRange);
  }, [value.chatRange]);

  useEffect(() => {
    setLastRange(value.lastRange);
  }, [value.lastRange]);

  return (
    <div className="stack">
      <label>
        Model
        <select value={model} onChange={(e) => setModel(e.target.value)}>
          <option value="mistral-small-latest">mistral-small-latest</option>
          <option value="mistral-medium-latest">mistral-medium-latest</option>
          <option value="mistral-large-latest">mistral-large-latest</option>
        </select>
      </label>
      <label>
        Chat range
        <select value={chatRange} onChange={(e) => setChatRange(e.target.value)}>
          <option value="all">all</option>
          <option value="30">30 days</option>
          <option value="90">90 days</option>
          <option value="365">365 days</option>
        </select>
      </label>
      <label>
        Last dashboard range
        <select value={lastRange} onChange={(e) => setLastRange(e.target.value)}>
          <option value="all">all</option>
          <option value="7">7 days</option>
          <option value="30">30 days</option>
          <option value="90">90 days</option>
          <option value="180">180 days</option>
          <option value="365">365 days</option>
          <option value="1095">1095 days</option>
        </select>
      </label>
      <button onClick={() => onSave({ model, chatRange, lastRange, graphSelection: value.graphSelection ?? {} })}>Save prefs</button>
    </div>
  );
}

type ChatComposerProps = {
  defaultModel: string;
  defaultRange: string;
  onSend: (message: string, model: string, range: string) => Promise<void>;
};

function ChatComposer({ defaultModel, defaultRange, onSend }: ChatComposerProps) {
  const [message, setMessage] = useState("");
  const [model, setModel] = useState(defaultModel);
  const [range, setRange] = useState(defaultRange);
  const [loading, setLoading] = useState(false);

  return (
    <div className="stack stack-compact">
      <label>
        Model
        <select value={model} onChange={(e) => setModel(e.target.value)}>
          <option value="mistral-small-latest">mistral-small-latest</option>
          <option value="mistral-medium-latest">mistral-medium-latest</option>
          <option value="mistral-large-latest">mistral-large-latest</option>
        </select>
      </label>
      <label>
        Range
        <select value={range} onChange={(e) => setRange(e.target.value)}>
          <option value="all">all</option>
          <option value="30">30 days</option>
          <option value="90">90 days</option>
          <option value="365">365 days</option>
        </select>
      </label>
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder="Ask about your trends..." />
      <button
        disabled={loading || !message.trim()}
        onClick={async () => {
          setLoading(true);
          try {
            await onSend(message.trim(), model, range);
            setMessage("");
          } finally {
            setLoading(false);
          }
        }}
      >
        {loading ? "Sending..." : "Send"}
      </button>
    </div>
  );
}

export default App;
