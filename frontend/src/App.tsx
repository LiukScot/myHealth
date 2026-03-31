import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiEnvelopeSchema, apiFetch, getErrorMessage, splitDateTime, toLocalDateTimeValue } from "./lib";
import {
  aiKeyStatusSchema,
  BACKUP_JSON_EXPORT_OK,
  BACKUP_JSON_IMPORT_OK,
  BACKUP_XLSX_EXPORT_OK,
  BACKUP_XLSX_IMPORT_OK,
  average,
  buildDailyAverages,
  changePasswordSchema,
  defaultPrefsValue,
  defaultWellbeingSelection,
  diaryFormSchema,
  diaryListSchema,
  extractWellbeingSelection,
  formatNumber,
  getQuickRangeBounds,
  inDateRange,
  listToCsv,
  loginSchema,
  moodOptionsSchema,
  navItems,
  normalizeQuickRange,
  painFormSchema,
  painListSchema,
  painOptionsSchema,
  prefsSchema,
  previousRange,
  sessionDataSchema,
  useAuthStore,
  wellbeingGraphId,
} from "./app/core";
import type { DashboardCard, DiaryEntry, InlineMessage, NavItem, PainEntry, WellbeingSeries } from "./app/core";
import { InlineFeedback } from "./app/shared";
import {
  ChatSection,
  DashboardSection,
  DiarySection,
  PainSection,
  SettingsSection,
} from "./app/screens";

function App() {
  const queryClient = useQueryClient();
  const { user, setUser } = useAuthStore();
  const [nav, setNav] = useState<NavItem>("dashboard");
  const [chatReply, setChatReply] = useState("");
  const [chatStatus, setChatStatus] = useState("");
  const [editingDiary, setEditingDiary] = useState<DiaryEntry | null>(null);
  const [editingPain, setEditingPain] = useState<PainEntry | null>(null);
  const [confirmDeleteDiary, setConfirmDeleteDiary] = useState<number | null>(null);
  const [confirmDeletePain, setConfirmDeletePain] = useState<number | null>(null);
  const [dashboardFrom, setDashboardFrom] = useState("");
  const [dashboardTo, setDashboardTo] = useState("");
  const [activeQuickRange, setActiveQuickRange] = useState<ReturnType<typeof normalizeQuickRange>>("all");
  const [graphSelection, setGraphSelection] = useState({ ...defaultWellbeingSelection });
  const [dashboardPrefsBootstrapped, setDashboardPrefsBootstrapped] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<InlineMessage | null>(null);
  const [backupFeedback, setBackupFeedback] = useState<InlineMessage | null>(null);
  const [purgeConfirmArmed, setPurgeConfirmArmed] = useState(false);
  const [aiKeyFeedback, setAiKeyFeedback] = useState<InlineMessage | null>(null);

  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: async () => apiFetch("/api/v1/auth/session", { method: "GET" }, (raw) => sessionDataSchema.parse(raw).data),
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
    queryFn: async () => apiFetch("/api/v1/diary", { method: "GET" }, (raw) => diaryListSchema.parse(raw).data),
  });

  const painQuery = useQuery({
    queryKey: ["pain"],
    enabled: !!user,
    queryFn: async () => apiFetch("/api/v1/pain", { method: "GET" }, (raw) => painListSchema.parse(raw).data),
  });

  const prefsQuery = useQuery({
    queryKey: ["prefs"],
    enabled: !!user,
    queryFn: async () => apiFetch("/api/v1/preferences", { method: "GET" }, (raw) => prefsSchema.parse(raw).data),
  });

  const aiKeyQuery = useQuery({
    queryKey: ["ai-key"],
    enabled: !!user,
    queryFn: async () => apiFetch("/api/v1/ai/key", { method: "GET" }, (raw) => aiKeyStatusSchema.parse(raw).data),
  });

  const painOptionsQuery = useQuery({
    queryKey: ["pain-options"],
    enabled: !!user,
    queryFn: async () => apiFetch("/api/v1/pain/options", { method: "GET" }, (raw) => painOptionsSchema.parse(raw).data),
  });

  useEffect(() => {
    setDashboardPrefsBootstrapped(false);
    setDashboardFrom("");
    setDashboardTo("");
    setActiveQuickRange("all");
    setGraphSelection(defaultWellbeingSelection);
    setPasswordFeedback(null);
    setBackupFeedback(null);
    setPurgeConfirmArmed(false);
    setAiKeyFeedback(null);
  }, [user?.id]);

  const painFieldOptions = painOptionsQuery.data ?? {
    area: [],
    symptoms: [],
    activities: [],
    medicines: [],
    habits: [],
    other: [],
  };

  const createDefaultPainFormValues = useCallback(
    () => ({
      dateTime: toLocalDateTimeValue(),
      painLevel: null,
      fatigueLevel: null,
      coffeeCount: null,
      area: "",
      symptoms: "",
      activities: "",
      medicines: listToCsv(painFieldOptions.medicines),
      habits: "",
      other: "",
      note: "",
    }),
    [painFieldOptions.medicines],
  );

  const moodOptionsQuery = useQuery({
    queryKey: ["mood-options"],
    enabled: !!user,
    queryFn: async () => apiFetch("/api/v1/mood/options", { method: "GET" }, (raw) => moodOptionsSchema.parse(raw).data),
  });

  const moodFieldOptions = moodOptionsQuery.data ?? {
    positive_moods: [],
    negative_moods: [],
    general_moods: [],
  };

  const loginForm = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });
  const changePasswordForm = useForm<z.infer<typeof changePasswordSchema>>({
    resolver: zodResolver(changePasswordSchema),
  });

  const diaryForm = useForm<z.infer<typeof diaryFormSchema>>({
    defaultValues: {
      dateTime: toLocalDateTimeValue(),
      moodLevel: null,
      depressionLevel: null,
      anxietyLevel: null,
      positiveMoods: "",
      negativeMoods: "",
      generalMoods: "",
      description: "",
      gratitude: "",
      reflection: "",
    },
  });

  const painForm = useForm<z.infer<typeof painFormSchema>>({
    defaultValues: createDefaultPainFormValues(),
  });

  const [watchedArea, watchedSymptoms, watchedActivities, watchedMedicines, watchedHabits, watchedOther] =
    painForm.watch(["area", "symptoms", "activities", "medicines", "habits", "other"]);

  useEffect(() => {
    if (editingPain || painForm.formState.isDirty) {
      return;
    }
    painForm.reset(createDefaultPainFormValues());
  }, [createDefaultPainFormValues, editingPain, painForm, painForm.formState.isDirty]);

  const loginMutation = useMutation({
    mutationFn: async (values: z.infer<typeof loginSchema>) =>
      apiFetch(
        "/api/v1/auth/login",
        { method: "POST", body: JSON.stringify(values) },
        (raw) => apiEnvelopeSchema(z.object({ email: z.string(), name: z.string().nullable() })).parse(raw).data,
      ),
    onSuccess: async () => {
      const session = await queryClient.fetchQuery({
        queryKey: ["session"],
        queryFn: async () => apiFetch("/api/v1/auth/session", { method: "GET" }, (raw) => sessionDataSchema.parse(raw).data),
      });
      if (session.authenticated && session.user) {
        setUser(session.user);
      }
      loginForm.reset();
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () =>
      apiFetch("/api/v1/auth/logout", { method: "POST" }, (raw) =>
        apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data,
      ),
    onSuccess: async () => {
      setUser(null);
      await queryClient.invalidateQueries();
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (values: z.infer<typeof changePasswordSchema>) =>
      apiFetch(
        "/api/v1/auth/change-password",
        { method: "POST", body: JSON.stringify({ currentPassword: values.currentPassword, newPassword: values.newPassword }) },
        (raw) => apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data,
      ),
    onMutate: () => {
      setPasswordFeedback(null);
    },
    onSuccess: () => {
      changePasswordForm.reset();
      setPasswordFeedback({ tone: "success", text: "Password updated." });
    },
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
        positiveMoods: parsedValues.positiveMoods,
        negativeMoods: parsedValues.negativeMoods,
        generalMoods: parsedValues.generalMoods,
        description: parsedValues.description,
        gratitude: parsedValues.gratitude,
        reflection: parsedValues.reflection,
      };
      if (editingDiary) {
        return apiFetch(`/api/v1/diary/${editingDiary.id}`, { method: "PUT", body: JSON.stringify(payload) }, (raw) =>
          apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data,
        );
      }
      return apiFetch("/api/v1/diary", { method: "POST", body: JSON.stringify(payload) }, (raw) =>
        apiEnvelopeSchema(z.object({ id: z.number() })).parse(raw).data,
      );
    },
    onSuccess: async () => {
      setEditingDiary(null);
      diaryForm.reset({
        dateTime: toLocalDateTimeValue(),
        moodLevel: null,
        depressionLevel: null,
        anxietyLevel: null,
        positiveMoods: "",
        negativeMoods: "",
        generalMoods: "",
        description: "",
        gratitude: "",
        reflection: "",
      });
      await queryClient.invalidateQueries({ queryKey: ["diary"] });
      setTimeout(() => diaryMutation.reset(), 3000);
    },
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
        note: parsedValues.note,
      };

      if (editingPain) {
        return apiFetch(`/api/v1/pain/${editingPain.id}`, { method: "PUT", body: JSON.stringify(payload) }, (raw) =>
          apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data,
        );
      }
      return apiFetch("/api/v1/pain", { method: "POST", body: JSON.stringify(payload) }, (raw) =>
        apiEnvelopeSchema(z.object({ id: z.number() })).parse(raw).data,
      );
    },
    onSuccess: async () => {
      setEditingPain(null);
      painForm.reset(createDefaultPainFormValues());
      await queryClient.invalidateQueries({ queryKey: ["pain"] });
      setTimeout(() => painMutation.reset(), 3000);
    },
  });

  const diaryDeleteMutation = useMutation({
    mutationFn: async (id: number) =>
      apiFetch(`/api/v1/diary/${id}`, { method: "DELETE" }, (raw) =>
        apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["diary"] });
    },
  });

  const painDeleteMutation = useMutation({
    mutationFn: async (id: number) =>
      apiFetch(`/api/v1/pain/${id}`, { method: "DELETE" }, (raw) =>
        apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pain"] });
    },
  });

  const aiKeyMutation = useMutation({
    mutationFn: async (key: string) =>
      apiFetch("/api/v1/ai/key", { method: "PUT", body: JSON.stringify({ key }) }, (raw) =>
        apiEnvelopeSchema(z.object({ hasKey: z.boolean() })).parse(raw).data,
      ),
    onMutate: () => {
      setAiKeyFeedback(null);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ai-key"] });
      setAiKeyFeedback({ tone: "success", text: "AI key saved." });
    },
    onError: (error) => {
      setAiKeyFeedback({ tone: "error", text: getErrorMessage(error) });
    },
  });

  const clearAiKeyMutation = useMutation({
    mutationFn: async () =>
      apiFetch("/api/v1/ai/key", { method: "DELETE" }, (raw) =>
        apiEnvelopeSchema(z.object({ hasKey: z.boolean() })).parse(raw).data,
      ),
    onMutate: () => {
      setAiKeyFeedback(null);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ai-key"] });
      setAiKeyFeedback({ tone: "info", text: "Stored AI key cleared." });
    },
    onError: (error) => {
      setAiKeyFeedback({ tone: "error", text: getErrorMessage(error) });
    },
  });

  const prefsMutation = useMutation({
    mutationFn: async (values: { model: string; chatRange: string; lastRange: string; graphSelection: Record<string, unknown> }) =>
      apiFetch("/api/v1/preferences", { method: "PUT", body: JSON.stringify(values) }, (raw) =>
        apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["prefs"] });
    },
  });

  const purgeMutation = useMutation({
    mutationFn: async () =>
      apiFetch("/api/v1/data/purge", { method: "POST" }, (raw) =>
        apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data,
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["diary"] }),
        queryClient.invalidateQueries({ queryKey: ["pain"] }),
        queryClient.invalidateQueries({ queryKey: ["prefs"] }),
      ]);
      setPurgeConfirmArmed(false);
      setNav("dashboard");
    },
  });

  const clearPasswordStatus = useCallback(() => {
    if (passwordFeedback) {
      setPasswordFeedback(null);
    }
    if (changePasswordMutation.error) {
      changePasswordMutation.reset();
    }
  }, [passwordFeedback, changePasswordMutation]);

  const clearAiKeyStatus = useCallback(() => {
    if (aiKeyFeedback) {
      setAiKeyFeedback(null);
    }
  }, [aiKeyFeedback]);

  const savePrefsPatch = (
    patch: Partial<{ model: string; chatRange: string; lastRange: string; graphSelection: Record<string, unknown> }>,
  ) => {
    const base = prefsQuery.data ?? defaultPrefsValue;
    prefsMutation.mutate({
      model: patch.model ?? base.model,
      chatRange: patch.chatRange ?? base.chatRange,
      lastRange: patch.lastRange ?? base.lastRange,
      graphSelection: patch.graphSelection ?? base.graphSelection,
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

  const applyDashboardQuickRange = (range: ReturnType<typeof normalizeQuickRange>, persist = true) => {
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
    [diaryQuery.data, dashboardFrom, dashboardTo],
  );

  const filteredPain = useMemo(
    () => (painQuery.data ?? []).filter((entry) => inDateRange(entry.entryDate, dashboardFrom, dashboardTo)),
    [painQuery.data, dashboardFrom, dashboardTo],
  );

  const previousBounds = useMemo(() => previousRange(dashboardFrom, dashboardTo), [dashboardFrom, dashboardTo]);
  const previousFrom = previousBounds?.from ?? "";
  const previousTo = previousBounds?.to ?? "";

  const previousDiary = useMemo(
    () => (previousBounds ? (diaryQuery.data ?? []).filter((entry) => inDateRange(entry.entryDate, previousFrom, previousTo)) : []),
    [diaryQuery.data, previousBounds, previousFrom, previousTo],
  );

  const previousPain = useMemo(
    () => (previousBounds ? (painQuery.data ?? []).filter((entry) => inDateRange(entry.entryDate, previousFrom, previousTo)) : []),
    [painQuery.data, previousBounds, previousFrom, previousTo],
  );

  const dashboardCards = useMemo<DashboardCard[]>(() => {
    const currentValues = {
      diaryCount: filteredDiary.length,
      painCount: filteredPain.length,
      moodAvg: average(filteredDiary.map((entry) => entry.moodLevel)),
      depressionAvg: average(filteredDiary.map((entry) => entry.depressionLevel)),
      anxietyAvg: average(filteredDiary.map((entry) => entry.anxietyLevel)),
      painAvg: average(filteredPain.map((entry) => entry.painLevel)),
      fatigueAvg: average(filteredPain.map((entry) => entry.fatigueLevel)),
    };

    const previousValues = {
      diaryCount: previousBounds ? previousDiary.length : null,
      painCount: previousBounds ? previousPain.length : null,
      moodAvg: previousBounds ? average(previousDiary.map((entry) => entry.moodLevel)) : null,
      depressionAvg: previousBounds ? average(previousDiary.map((entry) => entry.depressionLevel)) : null,
      anxietyAvg: previousBounds ? average(previousDiary.map((entry) => entry.anxietyLevel)) : null,
      painAvg: previousBounds ? average(previousPain.map((entry) => entry.painLevel)) : null,
      fatigueAvg: previousBounds ? average(previousPain.map((entry) => entry.fatigueLevel)) : null,
    };

    return [
      { label: "Journal entries", emoji: "📒", value: currentValues.diaryCount, formattedValue: String(currentValues.diaryCount), previous: previousValues.diaryCount },
      { label: "Pain entries", emoji: "📓", value: currentValues.painCount, formattedValue: String(currentValues.painCount), previous: previousValues.painCount },
      { label: "Mood avg", emoji: "🙂", value: currentValues.moodAvg, formattedValue: formatNumber(currentValues.moodAvg), previous: previousValues.moodAvg },
      {
        label: "Depression avg",
        emoji: "😔",
        value: currentValues.depressionAvg,
        formattedValue: formatNumber(currentValues.depressionAvg),
        previous: previousValues.depressionAvg,
        invertDelta: true,
      },
      {
        label: "Anxiety avg",
        emoji: "😨",
        value: currentValues.anxietyAvg,
        formattedValue: formatNumber(currentValues.anxietyAvg),
        previous: previousValues.anxietyAvg,
        invertDelta: true,
      },
      {
        label: "Pain avg",
        emoji: "🤕",
        value: currentValues.painAvg,
        formattedValue: formatNumber(currentValues.painAvg),
        previous: previousValues.painAvg,
        invertDelta: true,
      },
      {
        label: "Fatigue avg",
        emoji: "🥱",
        value: currentValues.fatigueAvg,
        formattedValue: formatNumber(currentValues.fatigueAvg),
        previous: previousValues.fatigueAvg,
        invertDelta: true,
      },
    ];
  }, [filteredDiary, filteredPain, previousBounds, previousDiary, previousPain]);

  const wellbeingSeries = useMemo<WellbeingSeries[]>(
    () => [
      { key: "pain", label: "Pain", color: "#ff6f91", points: buildDailyAverages(filteredPain, (entry) => entry.entryDate, (entry) => entry.painLevel) },
      { key: "fatigue", label: "Fatigue", color: "#f6c344", points: buildDailyAverages(filteredPain, (entry) => entry.entryDate, (entry) => entry.fatigueLevel) },
      { key: "mood", label: "Mood", color: "#7bd3f1", points: buildDailyAverages(filteredDiary, (entry) => entry.entryDate, (entry) => entry.moodLevel) },
      { key: "depression", label: "Depression", color: "#c6a1ff", points: buildDailyAverages(filteredDiary, (entry) => entry.entryDate, (entry) => entry.depressionLevel) },
      { key: "anxiety", label: "Anxiety", color: "#6fe1b0", points: buildDailyAverages(filteredDiary, (entry) => entry.entryDate, (entry) => entry.anxietyLevel) },
    ],
    [filteredDiary, filteredPain],
  );

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
          spanGaps: true,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: {
            type: "time" as const,
            time: {
              parser: "yyyy-MM-dd",
              tooltipFormat: "dd MMM yyyy",
              unit: undefined,
            },
            ticks: { color: "#a1a1ad", maxTicksLimit: 12 },
            grid: { color: "rgba(255,255,255,0.08)" },
          },
          y: {
            min: 0,
            max: 10,
            ticks: { color: "#a1a1ad", stepSize: 1 },
            grid: { color: "rgba(255,255,255,0.08)" },
          },
        },
      },
    };
  }, [wellbeingSeries, graphSelection]);

  const doExportJson = async () => {
    const payload = await apiFetch("/api/v1/backup/json", { method: "GET" }, (raw) => apiEnvelopeSchema(z.any()).parse(raw).data);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `health-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  };

  const doImportJson = async (file: File) => {
    const text = await file.text();
    const parsed = JSON.parse(text);
    await apiFetch("/api/v1/backup/json/import", { method: "POST", body: JSON.stringify(parsed) }, (raw) =>
      apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data,
    );
    await queryClient.invalidateQueries();
  };

  const doExportXlsx = async () => {
    const response = await fetch("/api/v1/backup/xlsx", { credentials: "include" });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Spreadsheet export failed");
    }
    const blob = await response.blob();
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `health-backup-${new Date().toISOString().slice(0, 10)}.xlsx`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  };

  const doImportXlsx = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/v1/backup/xlsx/import", {
      method: "POST",
      credentials: "include",
      body: form,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Spreadsheet import failed");
    }
    await queryClient.invalidateQueries();
  };

  const runBackupAction = async (action: () => Promise<void>, successMessage: InlineMessage) => {
    setBackupFeedback(null);
    try {
      await action();
      setBackupFeedback(successMessage);
    } catch (error) {
      setBackupFeedback({ tone: "error", text: getErrorMessage(error) });
    }
  };

  const resetDiaryForm = () => {
    setEditingDiary(null);
    diaryForm.reset({
      dateTime: toLocalDateTimeValue(),
      moodLevel: null,
      depressionLevel: null,
      anxietyLevel: null,
      positiveMoods: "",
      negativeMoods: "",
      generalMoods: "",
      description: "",
      gratitude: "",
      reflection: "",
    });
  };

  const resetPainForm = () => {
    setEditingPain(null);
    painForm.reset(createDefaultPainFormValues());
  };

  const startDiaryEdit = (entry: DiaryEntry) => {
    setEditingDiary(entry);
    diaryForm.reset({
      dateTime: toLocalDateTimeValue(entry.entryDate, entry.entryTime),
      moodLevel: entry.moodLevel,
      depressionLevel: entry.depressionLevel,
      anxietyLevel: entry.anxietyLevel,
      positiveMoods: entry.positiveMoods,
      negativeMoods: entry.negativeMoods,
      generalMoods: entry.generalMoods,
      description: entry.description,
      gratitude: entry.gratitude,
      reflection: entry.reflection,
    });
  };

  const startPainEdit = (entry: PainEntry) => {
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
      note: entry.note,
    });
  };

  if (!user) {
    return (
      <main className="screen auth-screen">
        <section className="auth-card">
          <h1>Health</h1>
          <p>Sign in to access your private health workspace.</p>
          <form onSubmit={loginForm.handleSubmit((values) => loginMutation.mutate(values))} className="stack">
            <label>
              Email
              <input type="email" autoComplete="email" {...loginForm.register("email")} />
            </label>
            <label>
              Password
              <input type="password" autoComplete="current-password" {...loginForm.register("password")} />
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
          <h1>Health</h1>
        </div>
        <div className="header-actions">
          <details>
            <summary>Account</summary>
            <form className="stack" onFocus={clearPasswordStatus} onSubmit={changePasswordForm.handleSubmit((v) => changePasswordMutation.mutate(v))}>
              <label>
                Current password
                <input type="password" autoComplete="current-password" {...changePasswordForm.register("currentPassword")} />
              </label>
              <label>
                New password
                <input type="password" autoComplete="new-password" {...changePasswordForm.register("newPassword")} />
              </label>
              <label>
                Confirm
                <input type="password" autoComplete="new-password" {...changePasswordForm.register("confirmPassword")} />
              </label>
              <button type="submit" disabled={changePasswordMutation.isPending}>
                Change password
              </button>
              <InlineFeedback
                message={changePasswordMutation.error ? { tone: "error", text: getErrorMessage(changePasswordMutation.error) } : passwordFeedback}
              />
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
        <DashboardSection
          dashboardFrom={dashboardFrom}
          dashboardTo={dashboardTo}
          activeQuickRange={activeQuickRange}
          onDateChange={handleDashboardDateChange}
          onQuickRange={(range) => applyDashboardQuickRange(range)}
          dashboardCards={dashboardCards}
          wellbeingSeries={wellbeingSeries}
          graphSelection={graphSelection}
          onGraphToggle={(key, checked) => {
            const nextSelection = { ...graphSelection, [key]: checked };
            setGraphSelection(nextSelection);
            savePrefsPatch({
              graphSelection: {
                ...(prefsQuery.data?.graphSelection ?? {}),
                [wellbeingGraphId]: nextSelection,
              },
            });
          }}
          wellbeingChart={wellbeingChart}
        />
      )}

      {nav === "diary" && (
        <DiarySection
          diaryForm={diaryForm}
          diaryMutationState={{ isSuccess: diaryMutation.isSuccess }}
          editingDiary={editingDiary}
          moodFieldOptions={moodFieldOptions}
          diaryEntries={diaryQuery.data ?? []}
          confirmDeleteDiary={confirmDeleteDiary}
          onSubmit={(values) => diaryMutation.mutate(values)}
          onCancelEdit={resetDiaryForm}
          onStartEdit={startDiaryEdit}
          onDeleteClick={(id) => {
            if (confirmDeleteDiary === id) {
              diaryDeleteMutation.mutate(id);
              setConfirmDeleteDiary(null);
            } else {
              setConfirmDeleteDiary(id);
            }
          }}
          onDeleteBlur={() => setConfirmDeleteDiary(null)}
        />
      )}

      {nav === "pain" && (
        <PainSection
          painForm={painForm}
          painMutationState={{ isSuccess: painMutation.isSuccess }}
          editingPain={editingPain}
          painFieldOptions={painFieldOptions}
          watchedValues={{
            area: watchedArea,
            symptoms: watchedSymptoms,
            activities: watchedActivities,
            medicines: watchedMedicines,
            habits: watchedHabits,
            other: watchedOther,
          }}
          painEntries={painQuery.data ?? []}
          confirmDeletePain={confirmDeletePain}
          onSubmit={(values) => painMutation.mutate(values)}
          onCancelEdit={resetPainForm}
          onStartEdit={startPainEdit}
          onDeleteClick={(id) => {
            if (confirmDeletePain === id) {
              painDeleteMutation.mutate(id);
              setConfirmDeletePain(null);
            } else {
              setConfirmDeletePain(id);
            }
          }}
          onDeleteBlur={() => setConfirmDeletePain(null)}
        />
      )}

      {nav === "chat" && (
        <ChatSection
          defaultModel={prefsQuery.data?.model ?? "mistral-small-latest"}
          defaultRange={prefsQuery.data?.chatRange ?? "all"}
          chatStatus={chatStatus}
          chatReply={chatReply}
          onSend={async (message, model, range) => {
            setChatStatus("Sending...");
            const data = await apiFetch(
              "/api/v1/ai/chat",
              { method: "POST", body: JSON.stringify({ message, model, range }) },
              (raw) => apiEnvelopeSchema(z.object({ reply: z.string(), fallback: z.boolean().optional() })).parse(raw).data,
            );
            setChatReply(data.reply);
            setChatStatus(data.fallback ? "AI fallback response" : "AI response received");
          }}
        />
      )}

      {nav === "settings" && (
        <SettingsSection
          aiKeyHasKey={Boolean(aiKeyQuery.data?.hasKey)}
          aiKeyFeedback={aiKeyFeedback}
          aiKeySaving={aiKeyMutation.isPending}
          aiKeyClearing={clearAiKeyMutation.isPending}
          onAiKeyFeedbackClear={clearAiKeyStatus}
          onAiKeySave={(key) => {
            const clean = key.trim();
            if (!clean) {
              setAiKeyFeedback({ tone: "error", text: "Enter a key before saving." });
              return false;
            }
            aiKeyMutation.mutate(clean);
            return true;
          }}
          onAiKeyClear={() => {
            clearAiKeyStatus();
            clearAiKeyMutation.mutate();
          }}
          purgeConfirmArmed={purgeConfirmArmed}
          purgePending={purgeMutation.isPending}
          purgeError={purgeMutation.error ? { tone: "error", text: getErrorMessage(purgeMutation.error) } : null}
          onPurgeArm={() => {
            purgeMutation.reset();
            setPurgeConfirmArmed(true);
          }}
          onPurgeConfirm={() => purgeMutation.mutate()}
          onPurgeCancel={() => {
            purgeMutation.reset();
            setPurgeConfirmArmed(false);
          }}
          prefsValue={prefsQuery.data ?? defaultPrefsValue}
          onSavePrefs={(value) => prefsMutation.mutate(value)}
          onExportJson={() => {
            void runBackupAction(doExportJson, BACKUP_JSON_EXPORT_OK);
          }}
          onImportJson={(file) => {
            void runBackupAction(() => doImportJson(file), BACKUP_JSON_IMPORT_OK);
          }}
          onExportXlsx={() => {
            void runBackupAction(doExportXlsx, BACKUP_XLSX_EXPORT_OK);
          }}
          onImportXlsx={(file) => {
            void runBackupAction(() => doImportXlsx(file), BACKUP_XLSX_IMPORT_OK);
          }}
          backupFeedback={backupFeedback}
        />
      )}
    </main>
  );
}

export default App;
