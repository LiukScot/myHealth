import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib";
import {
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
import type { DashboardCard, DashboardQuickRange, WellbeingSeries, WellbeingSeriesKey } from "../app/core";
import { usePrefs } from "./use-settings";

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
            time: { parser: "yyyy-MM-dd", tooltipFormat: "dd MMM yyyy", unit: undefined },
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
    wellbeingSeries,
    graphSelection,
    handleGraphToggle,
    wellbeingChart,
  };
}
