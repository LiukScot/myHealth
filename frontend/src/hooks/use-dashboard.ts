import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib";
import {
  calcDeltaPercent,
  average,
  buildDailyAverages,
  defaultWellbeingSelection,
  diaryListSchema,
  extractWellbeingSelection,
  formatNumber,
  getQuickRangeBounds,
  inDateRange,
  normalizeQuickRange,
  painListSchema,
  previousRange,
  wellbeingGraphId,
} from "../app/core";
import type {
  DashboardCard,
  DashboardConnection,
  DashboardInsight,
  DashboardQuickRange,
  DiaryEntry,
  PainEntry,
  WellbeingSeries,
  WellbeingSeriesKey,
} from "../app/core";
import { usePrefs } from "./use-settings";

type DashboardDay = {
  date: string;
  diaryCount: number;
  painCount: number;
  mood: number | null;
  depression: number | null;
  anxiety: number | null;
  pain: number | null;
  fatigue: number | null;
  coffee: number | null;
};

type NumericDashboardKey = "mood" | "depression" | "anxiety" | "pain" | "fatigue" | "coffee";

function buildDashboardDays(diaryEntries: DiaryEntry[], painEntries: PainEntry[]): DashboardDay[] {
  const dates = new Set<string>();
  diaryEntries.forEach((entry) => dates.add(entry.entryDate));
  painEntries.forEach((entry) => dates.add(entry.entryDate));

  return Array.from(dates)
    .sort()
    .map((date) => {
      const diaryForDate = diaryEntries.filter((entry) => entry.entryDate === date);
      const painForDate = painEntries.filter((entry) => entry.entryDate === date);
      return {
        date,
        diaryCount: diaryForDate.length,
        painCount: painForDate.length,
        mood: average(diaryForDate.map((entry) => entry.moodLevel)),
        depression: average(diaryForDate.map((entry) => entry.depressionLevel)),
        anxiety: average(diaryForDate.map((entry) => entry.anxietyLevel)),
        pain: average(painForDate.map((entry) => entry.painLevel)),
        fatigue: average(painForDate.map((entry) => entry.fatigueLevel)),
        coffee: average(painForDate.map((entry) => entry.coffeeCount)),
      };
    });
}

function getLongestEntryStreak(days: DashboardDay[]) {
  if (!days.length) return 0;
  let best = 1;
  let current = 1;
  for (let index = 1; index < days.length; index += 1) {
    const previous = new Date(`${days[index - 1].date}T00:00:00`);
    const next = new Date(`${days[index].date}T00:00:00`);
    const diffDays = Math.round((next.getTime() - previous.getTime()) / (24 * 60 * 60 * 1000));
    if (diffDays === 1) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 1;
    }
  }
  return best;
}

function describeLargestShift(cards: DashboardCard[]) {
  const candidates = cards
    .filter((card) => card.previous !== null)
    .map((card) => ({ card, delta: calcDeltaPercent(card.value, card.previous) }))
    .filter((item): item is { card: DashboardCard; delta: number } => item.delta !== null)
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta));

  const strongest = candidates[0];
  if (!strongest) return "Need previous-range data to compare trends.";
  const direction = strongest.delta > 0 ? "up" : strongest.delta < 0 ? "down" : "flat";
  return `${strongest.card.label} changed most vs previous range (${direction} ${Math.abs(Math.round(strongest.delta))}%).`;
}

function describeMissingData(days: DashboardDay[]) {
  const missingPain = days.filter((day) => day.diaryCount > 0 && day.painCount === 0).length;
  const missingDiary = days.filter((day) => day.painCount > 0 && day.diaryCount === 0).length;
  if (missingPain === 0 && missingDiary === 0) {
    return "Diary and pain are both present on every tracked day.";
  }
  if (missingPain >= missingDiary) {
    return `Pain missing on ${missingPain} tracked day${missingPain === 1 ? "" : "s"}.`;
  }
  return `Diary missing on ${missingDiary} tracked day${missingDiary === 1 ? "" : "s"}.`;
}

function buildInsightRail(days: DashboardDay[], cards: DashboardCard[]): DashboardInsight[] {
  const streak = getLongestEntryStreak(days);
  return [
    {
      title: "Best streak",
      detail:
        streak === 0
          ? "No tracked days in this range yet."
          : `${streak} day${streak === 1 ? "" : "s"} with at least one diary or pain entry.`,
    },
    {
      title: "Biggest shift",
      detail: describeLargestShift(cards),
    },
    {
      title: "Missing data",
      detail: describeMissingData(days),
    },
  ];
}

function pearsonCorrelation(values: Array<[number, number]>) {
  if (values.length < 5) return null;
  const xs = values.map(([x]) => x);
  const ys = values.map(([, y]) => y);
  const xMean = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const yMean = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  const numerator = values.reduce((sum, [x, y]) => sum + (x - xMean) * (y - yMean), 0);
  const xVariance = xs.reduce((sum, value) => sum + (value - xMean) ** 2, 0);
  const yVariance = ys.reduce((sum, value) => sum + (value - yMean) ** 2, 0);
  const denominator = Math.sqrt(xVariance * yVariance);
  if (!denominator) return null;
  return numerator / denominator;
}

function getPairValues(days: DashboardDay[], leftKey: NumericDashboardKey, rightKey: NumericDashboardKey) {
  return days.flatMap((day) => {
    const left = day[leftKey];
    const right = day[rightKey];
    if (left === null || right === null) return [];
    return [[left, right] as [number, number]];
  });
}

function getConfidence(correlation: number, sampleSize: number): DashboardConnection["confidence"] {
  const score = Math.abs(correlation);
  if (sampleSize >= 6 && score >= 0.7) return "strong";
  if (sampleSize >= 4 && score >= 0.35) return "medium";
  return "weak";
}

function buildConnections(days: DashboardDay[]): DashboardConnection[] {
  const configs: Array<{
    title: string;
    leftKey: NumericDashboardKey;
    rightKey: NumericDashboardKey;
    positiveSummary: string;
    negativeSummary: string;
    detail: string;
  }> = [
    {
      title: "Pain x fatigue",
      leftKey: "fatigue",
      rightKey: "pain",
      positiveSummary: "Higher fatigue days often match higher pain.",
      negativeSummary: "Higher fatigue days sometimes match lower pain.",
      detail: "Compared same-day fatigue and pain averages from pain entries.",
    },
    {
      title: "Coffee x anxiety",
      leftKey: "coffee",
      rightKey: "anxiety",
      positiveSummary: "Days with more coffee tend to show higher anxiety.",
      negativeSummary: "Days with more coffee tend to show lower anxiety.",
      detail: "Compared coffee counts and diary anxiety scores on overlapping dates.",
    },
    {
      title: "Mood x pain",
      leftKey: "mood",
      rightKey: "pain",
      positiveSummary: "Mood and pain moved together (unusual — double-check entries).",
      negativeSummary: "Higher mood days tend to have lower pain (expected pattern).",
      detail: "Compared diary mood scores and pain averages on overlapping dates.",
    },
  ];

  return configs.flatMap((config) => {
    const pairs = getPairValues(days, config.leftKey, config.rightKey);
    const correlation = pearsonCorrelation(pairs);
    if (correlation === null) return [];
    return [{
      title: config.title,
      summary: correlation >= 0 ? config.positiveSummary : config.negativeSummary,
      detail: `${config.detail} ${pairs.length} overlapping day${pairs.length === 1 ? "" : "s"} in range.`,
      confidence: getConfidence(correlation, pairs.length),
    }];
  });
}

export function useDashboard(enabled: boolean) {
  const { prefsQuery, savePrefsPatch } = usePrefs(enabled);
  const [dashboardFrom, setDashboardFrom] = useState("");
  const [dashboardTo, setDashboardTo] = useState("");
  const [activeQuickRange, setActiveQuickRange] = useState<DashboardQuickRange>("all");
  const [graphSelection, setGraphSelection] = useState({ ...defaultWellbeingSelection });
  const [bootstrapped, setBootstrapped] = useState(false);

  const diaryQuery = useQuery({
    queryKey: ["diary"],
    enabled,
    queryFn: async () => apiFetch("/api/v1/diary", { method: "GET" }, (raw) => diaryListSchema.parse(raw).data),
  });

  const painQuery = useQuery({
    queryKey: ["pain"],
    enabled,
    queryFn: async () => apiFetch("/api/v1/pain", { method: "GET" }, (raw) => painListSchema.parse(raw).data),
  });

  useEffect(() => {
    if (!prefsQuery.data || bootstrapped) return;
    const restoredRange = normalizeQuickRange(prefsQuery.data.lastRange);
    const bounds = getQuickRangeBounds(restoredRange);
    setDashboardFrom(bounds.from);
    setDashboardTo(bounds.to);
    setActiveQuickRange(restoredRange);
    setGraphSelection(extractWellbeingSelection(prefsQuery.data.graphSelection));
    setBootstrapped(true);
  }, [prefsQuery.data, bootstrapped]);

  const applyQuickRange = (range: DashboardQuickRange, persist = true) => {
    const bounds = getQuickRangeBounds(range);
    setDashboardFrom(bounds.from);
    setDashboardTo(bounds.to);
    setActiveQuickRange(range);
    if (persist) savePrefsPatch({ lastRange: range });
  };

  const handleDateChange = (field: "from" | "to", value: string) => {
    if (field === "from") setDashboardFrom(value);
    else setDashboardTo(value);
    setActiveQuickRange("all");
    savePrefsPatch({ lastRange: "all" });
  };

  const filteredDiary = useMemo(
    () => (diaryQuery.data ?? []).filter((e) => inDateRange(e.entryDate, dashboardFrom, dashboardTo)),
    [diaryQuery.data, dashboardFrom, dashboardTo],
  );

  const filteredPain = useMemo(
    () => (painQuery.data ?? []).filter((e) => inDateRange(e.entryDate, dashboardFrom, dashboardTo)),
    [painQuery.data, dashboardFrom, dashboardTo],
  );

  const hasEntriesOverall = (diaryQuery.data?.length ?? 0) > 0 || (painQuery.data?.length ?? 0) > 0;
  const hasEntriesInRange = filteredDiary.length > 0 || filteredPain.length > 0;
  const dashboardDays = useMemo(
    () => buildDashboardDays(filteredDiary, filteredPain),
    [filteredDiary, filteredPain],
  );

  const prevBounds = useMemo(() => previousRange(dashboardFrom, dashboardTo), [dashboardFrom, dashboardTo]);
  const prevFrom = prevBounds?.from ?? "";
  const prevTo = prevBounds?.to ?? "";

  const previousDiary = useMemo(
    () => (prevBounds ? (diaryQuery.data ?? []).filter((e) => inDateRange(e.entryDate, prevFrom, prevTo)) : []),
    [diaryQuery.data, prevBounds, prevFrom, prevTo],
  );

  const previousPain = useMemo(
    () => (prevBounds ? (painQuery.data ?? []).filter((e) => inDateRange(e.entryDate, prevFrom, prevTo)) : []),
    [painQuery.data, prevBounds, prevFrom, prevTo],
  );

  const dashboardCards = useMemo<DashboardCard[]>(() => {
    const cur = {
      diaryCount: filteredDiary.length,
      painCount: filteredPain.length,
      moodAvg: average(filteredDiary.map((e) => e.moodLevel)),
      depressionAvg: average(filteredDiary.map((e) => e.depressionLevel)),
      anxietyAvg: average(filteredDiary.map((e) => e.anxietyLevel)),
      painAvg: average(filteredPain.map((e) => e.painLevel)),
      fatigueAvg: average(filteredPain.map((e) => e.fatigueLevel)),
    };
    const prev = {
      diaryCount: prevBounds ? previousDiary.length : null,
      painCount: prevBounds ? previousPain.length : null,
      moodAvg: prevBounds ? average(previousDiary.map((e) => e.moodLevel)) : null,
      depressionAvg: prevBounds ? average(previousDiary.map((e) => e.depressionLevel)) : null,
      anxietyAvg: prevBounds ? average(previousDiary.map((e) => e.anxietyLevel)) : null,
      painAvg: prevBounds ? average(previousPain.map((e) => e.painLevel)) : null,
      fatigueAvg: prevBounds ? average(previousPain.map((e) => e.fatigueLevel)) : null,
    };
    return [
      { label: "Journal entries", emoji: "\u{1F4D2}", value: cur.diaryCount, formattedValue: String(cur.diaryCount), previous: prev.diaryCount },
      { label: "Pain entries", emoji: "\u{1F4D3}", value: cur.painCount, formattedValue: String(cur.painCount), previous: prev.painCount },
      { label: "Mood avg", emoji: "\u{1F642}", value: cur.moodAvg, formattedValue: formatNumber(cur.moodAvg), previous: prev.moodAvg },
      { label: "Depression avg", emoji: "\u{1F614}", value: cur.depressionAvg, formattedValue: formatNumber(cur.depressionAvg), previous: prev.depressionAvg, invertDelta: true },
      { label: "Anxiety avg", emoji: "\u{1F628}", value: cur.anxietyAvg, formattedValue: formatNumber(cur.anxietyAvg), previous: prev.anxietyAvg, invertDelta: true },
      { label: "Pain avg", emoji: "\u{1F915}", value: cur.painAvg, formattedValue: formatNumber(cur.painAvg), previous: prev.painAvg, invertDelta: true },
      { label: "Fatigue avg", emoji: "\u{1F971}", value: cur.fatigueAvg, formattedValue: formatNumber(cur.fatigueAvg), previous: prev.fatigueAvg, invertDelta: true },
    ];
  }, [filteredDiary, filteredPain, prevBounds, previousDiary, previousPain]);

  const wellbeingSeries = useMemo<WellbeingSeries[]>(
    () => [
      { key: "pain", label: "Pain", color: "#ff6f91", points: buildDailyAverages(filteredPain, (e) => e.entryDate, (e) => e.painLevel) },
      { key: "fatigue", label: "Fatigue", color: "#f6c344", points: buildDailyAverages(filteredPain, (e) => e.entryDate, (e) => e.fatigueLevel) },
      { key: "mood", label: "Mood", color: "#7bd3f1", points: buildDailyAverages(filteredDiary, (e) => e.entryDate, (e) => e.moodLevel) },
      { key: "depression", label: "Depression", color: "#c6a1ff", points: buildDailyAverages(filteredDiary, (e) => e.entryDate, (e) => e.depressionLevel) },
      { key: "anxiety", label: "Anxiety", color: "#6fe1b0", points: buildDailyAverages(filteredDiary, (e) => e.entryDate, (e) => e.anxietyLevel) },
    ],
    [filteredDiary, filteredPain],
  );

  const wellbeingChart = useMemo(() => {
    const visibleSeries = wellbeingSeries.filter((s) => (graphSelection[s.key] ?? true) && s.points.length > 0);
    const hasAnyData = wellbeingSeries.some((s) => s.points.length > 0);
    return {
      hasAnyData,
      hasVisibleData: visibleSeries.length > 0,
      data: {
        datasets: visibleSeries.map((s) => ({
          label: s.label,
          data: s.points.map((p) => ({ x: p.date, y: Number(p.value.toFixed(2)) })),
          borderColor: s.color,
          backgroundColor: s.color,
          tension: 0.32,
          pointRadius: 2.5,
          spanGaps: true,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            type: "time" as const,
            time: {
              parser: "yyyy-MM-dd",
              tooltipFormat: "dd MMM yyyy",
              minUnit: "day" as const,
              displayFormats: { day: "dd MMM", week: "dd MMM", month: "MMM yyyy" },
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

  const handleGraphToggle = (key: WellbeingSeriesKey, checked: boolean) => {
    const nextSelection = { ...graphSelection, [key]: checked };
    setGraphSelection(nextSelection);
    savePrefsPatch({
      graphSelection: {
        ...(prefsQuery.data?.graphSelection ?? {}),
        [wellbeingGraphId]: nextSelection,
      },
    });
  };

  const dashboardInsights = useMemo(
    () => buildInsightRail(dashboardDays, dashboardCards),
    [dashboardDays, dashboardCards],
  );

  const dashboardConnections = useMemo(
    () => buildConnections(dashboardDays),
    [dashboardDays],
  );

  return {
    dashboardFrom,
    dashboardTo,
    activeQuickRange,
    isLoading: diaryQuery.isLoading || painQuery.isLoading,
    hasEntriesInRange,
    hasEntriesOverall,
    handleDateChange,
    applyQuickRange,
    dashboardCards,
    dashboardInsights,
    dashboardConnections,
    wellbeingSeries,
    graphSelection,
    handleGraphToggle,
    wellbeingChart,
  };
}
