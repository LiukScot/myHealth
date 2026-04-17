import { type CSSProperties, useState } from "react";
import type { ChartData, ChartOptions } from "chart.js";
import { type UseFormReturn } from "react-hook-form";
import { Chart as ChartJS, TimeScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from "chart.js";
import "chartjs-adapter-date-fns";
import { Line } from "react-chartjs-2";
import {
  csvToList,
  type CbtEntry,
  type CbtFormValues,
  type DashboardQuickRange,
  type DbtEntry,
  type DbtFormValues,
  type DiaryEntry,
  type DiaryFormValues,
  type InlineMessage,
  type PainEntry,
  type PainFieldKey,
  type PainFormValues,
  type WellbeingSeries,
  type WellbeingSeriesKey,
} from "./core";
import { getErrorMessage } from "../lib";
import type { useAuth } from "../hooks/use-auth";
import {
  AnimatedEditingLabel,
  InlineFeedback,
  MultiSelectField,
} from "./shared";
import { McpAccessSection } from "./McpAccessSection";
import {
  calcDeltaPercent,
  dashboardQuickRanges,
  formatDelta,
  getDeltaStyle,
} from "./core";

ChartJS.register(TimeScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

function formatEntrySummaryDate(entryDate: string, entryTime: string): string {
  const time = entryTime.length >= 5 ? entryTime : `${entryTime}:00`;
  const d = new Date(`${entryDate}T${time}`);
  if (Number.isNaN(d.getTime())) return `${entryDate} ${entryTime}`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d);
}

function bandNine(level: number | null | undefined): "low" | "mid" | "high" | "" {
  if (level == null || Number.isNaN(Number(level))) return "";
  const n = Math.round(Number(level));
  if (n <= 3) return "low";
  if (n <= 6) return "mid";
  return "high";
}

function painPreview(entry: PainEntry): string {
  const parts = [entry.area, entry.symptoms].filter((p) => p?.trim()).join(", ");
  const note = entry.note?.trim();
  if (parts && note) return `${parts} · ${note}`;
  if (parts) return parts;
  if (note) return note;
  return "—";
}

function diaryPreview(entry: DiaryEntry): string {
  const moodBits = [entry.positiveMoods, entry.negativeMoods, entry.generalMoods].map((s) => s?.trim()).filter(Boolean).join(", ");
  const desc = entry.description?.trim();
  if (moodBits && desc) return `${moodBits} · ${desc}`;
  return moodBits || desc || "—";
}

function formatMetricDisplay(value: number | null | undefined, fractionDigits = 0): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: fractionDigits });
}

function BarMetric({
  label,
  value,
  onChange,
  fractionDigits = 0,
}: {
  label: string;
  value: number | null;
  onChange: (next: number | null) => void;
  fractionDigits?: number;
}) {
  const n =
    value != null && !Number.isNaN(Number(value)) ? Math.min(9, Math.max(1, Math.round(Number(value)))) : null;
  const band = bandNine(n);
  return (
    <div className="bar-metric">
      <div className="bar-metric-label">
        <span className="name">{label}</span>
        <span className={["val", band].filter(Boolean).join(" ")}>{formatMetricDisplay(value, fractionDigits)}</span>
      </div>
      <div className="bars" role="group" aria-label={label}>
        {Array.from({ length: 9 }, (_, i) => {
          const slot = i + 1;
          const filled = n != null && slot <= n;
          const slotBand = slot <= 3 ? "low" : slot <= 6 ? "mid" : "high";
          return (
            <button
              key={slot}
              type="button"
              className={["bar", filled ? "filled" : "", filled ? slotBand : ""].filter(Boolean).join(" ")}
              aria-label={`${label} ${slot} of 9`}
              aria-pressed={n === slot}
              onClick={() => {
                if (n != null && slot === n) onChange(null);
                else onChange(slot);
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function CoffeeStepper({ value, onChange }: { value: number | null; onChange: (next: number | null) => void }) {
  const n = value != null && !Number.isNaN(Number(value)) ? Math.min(50, Math.max(0, Math.floor(Number(value)))) : 0;
  return (
    <div className="bar-metric">
      <div className="bar-metric-label">
        <span className="name">Coffee</span>
      </div>
      <div className="stepper-group">
        <button type="button" aria-label="Decrease coffee count" onClick={() => onChange(Math.max(0, n - 1))}>
          −
        </button>
        <span className="val" aria-live="polite">
          {value != null ? n : "—"}
        </span>
        <button type="button" aria-label="Increase coffee count" onClick={() => onChange(Math.min(50, n + 1))}>
          +
        </button>
      </div>
    </div>
  );
}

type WellbeingChartView = {
  hasAnyData: boolean;
  hasVisibleData: boolean;
  data: ChartData<"line", { x: string; y: number }[], string>;
  options: ChartOptions<"line">;
};

function EmptyState({
  title,
  description,
  compact = false,
}: {
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "empty-state empty-state-compact" : "empty-state"}>
      <p className="empty-state-title">{title}</p>
      <p className="empty-state-copy">{description}</p>
    </div>
  );
}

export function DashboardSection({
  dashboardFrom,
  dashboardTo,
  activeQuickRange,
  isLoading,
  hasEntriesInRange,
  hasEntriesOverall,
  onDateChange,
  onQuickRange,
  dashboardCards,
  wellbeingSeries,
  graphSelection,
  onGraphToggle,
  wellbeingChart,
}: {
  dashboardFrom: string;
  dashboardTo: string;
  activeQuickRange: DashboardQuickRange;
  isLoading: boolean;
  hasEntriesInRange: boolean;
  hasEntriesOverall: boolean;
  onDateChange: (field: "from" | "to", value: string) => void;
  onQuickRange: (range: DashboardQuickRange) => void;
  dashboardCards: Array<{ label: string; emoji: string; value: number | null; formattedValue: string; previous: number | null; invertDelta?: boolean }>;
  wellbeingSeries: WellbeingSeries[];
  graphSelection: Record<WellbeingSeriesKey, boolean>;
  onGraphToggle: (key: WellbeingSeriesKey, checked: boolean) => void;
  wellbeingChart: WellbeingChartView;
}) {
  return (
    <section className="panel">
      <h1 className="panel-title">Dashboard</h1>

      <div className="dashboard-filters">
        <label>
          From
          <input type="date" value={dashboardFrom} onChange={(event) => onDateChange("from", event.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={dashboardTo} onChange={(event) => onDateChange("to", event.target.value)} />
        </label>
        <div className="dashboard-quick-ranges">
          {dashboardQuickRanges.map((range) => (
            <button
              type="button"
              key={range.value}
              className={activeQuickRange === range.value ? "active" : ""}
              onClick={() => onQuickRange(range.value)}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="hint">Loading dashboard data...</p>
      ) : (
        <>
          {!hasEntriesInRange ? (
            <EmptyState
              title={hasEntriesOverall ? "No entries in this date range" : "No health entries yet"}
              description={hasEntriesOverall
                ? "Try widening the dates, or add a new diary or pain entry to start filling this range."
                : "Your averages will appear here after you log your first diary or pain entry."}
            />
          ) : null}

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
                        onChange={(event) => onGraphToggle(series.key, event.target.checked)}
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
              <p className="hint">
                {wellbeingChart.hasAnyData ? "Toggle on a metric to see it." : hasEntriesOverall ? "No chart data in this date range." : "No chart data yet. Add a diary or pain entry to get started."}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}

export function DiarySection({
  diaryForm,
  diaryMutationState,
  isLoading,
  editingDiary,
  moodFieldOptions,
  diaryEntries,
  confirmDeleteDiary,
  onSubmit,
  onCancelEdit,
  onStartEdit,
  onDeleteClick,
  onDeleteBlur,
}: {
  diaryForm: UseFormReturn<DiaryFormValues>;
  diaryMutationState: { isSuccess: boolean };
  isLoading: boolean;
  editingDiary: DiaryEntry | null;
  moodFieldOptions: { positive_moods: string[]; negative_moods: string[]; general_moods: string[] };
  diaryEntries: DiaryEntry[];
  confirmDeleteDiary: number | null;
  onSubmit: (values: DiaryFormValues) => void;
  onCancelEdit: () => void;
  onStartEdit: (entry: DiaryEntry) => void;
  onDeleteClick: (id: number) => void;
  onDeleteBlur: () => void;
}) {
  const [moodTab, setMoodTab] = useState<"positive" | "negative" | "general">("positive");
  const moodLevels = diaryForm.watch(["moodLevel", "depressionLevel", "anxietyLevel"]);
  const [moodLevel, depressionLevel, anxietyLevel] = moodLevels;
  const positiveMoods = diaryForm.watch("positiveMoods");
  const negativeMoods = diaryForm.watch("negativeMoods");
  const generalMoods = diaryForm.watch("generalMoods");

  const moodTabs = [
    { id: "positive" as const, label: "Positive", count: csvToList(positiveMoods).length },
    { id: "negative" as const, label: "Negative", count: csvToList(negativeMoods).length },
    { id: "general" as const, label: "General", count: csvToList(generalMoods).length },
  ];

  return (
    <section className="panel">
      <h1 className="panel-title">Diary</h1>
      <form className="dense-form-grid diary-dense-form" onSubmit={diaryForm.handleSubmit(onSubmit)}>
        <div className="core-col">
          <div className="dense-form-hidden-fields" aria-hidden="true">
            <input type="hidden" {...diaryForm.register("moodLevel", { valueAsNumber: true })} />
            <input type="hidden" {...diaryForm.register("depressionLevel", { valueAsNumber: true })} />
            <input type="hidden" {...diaryForm.register("anxietyLevel", { valueAsNumber: true })} />
          </div>
          <h3 className="core-col-heading">Right now</h3>
          <label className="field">
            <span className="section-heading">Date/time</span>
            <input type="datetime-local" {...diaryForm.register("dateTime")} />
          </label>
          <BarMetric
            label="Mood"
            value={moodLevel ?? null}
            fractionDigits={1}
            onChange={(next) => diaryForm.setValue("moodLevel", next, { shouldDirty: true })}
          />
          <BarMetric
            label="Depression"
            value={depressionLevel ?? null}
            onChange={(next) => diaryForm.setValue("depressionLevel", next, { shouldDirty: true })}
          />
          <BarMetric
            label="Anxiety"
            value={anxietyLevel ?? null}
            onChange={(next) => diaryForm.setValue("anxietyLevel", next, { shouldDirty: true })}
          />
          <label className="field">
            <span className="section-heading">Description</span>
            <textarea {...diaryForm.register("description")} placeholder="Optional…" rows={3} />
          </label>
          <label className="field">
            <span className="section-heading">Gratitude</span>
            <textarea {...diaryForm.register("gratitude")} placeholder="Optional…" rows={2} />
          </label>
          <label className="field">
            <span className="section-heading">Reflection</span>
            <textarea {...diaryForm.register("reflection")} placeholder="Optional…" rows={2} />
          </label>
          {editingDiary ? (
            <div className="dense-form-inline-actions">
              <button type="button" onClick={onCancelEdit}>
                Cancel edit
              </button>
            </div>
          ) : null}
        </div>

        <div className="right-col">
          <div className="tags-col">
            <nav className="tag-tabs" role="tablist" aria-label="Mood categories">
              {moodTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={moodTab === tab.id}
                  className={moodTab === tab.id ? "active" : ""}
                  onClick={() => setMoodTab(tab.id)}
                >
                  {tab.label}{" "}
                  <span className="count">{tab.count}</span>
                </button>
              ))}
            </nav>
            <div className="tag-panel">
              {moodTab === "positive" ? (
                <MultiSelectField
                  hideLabel
                  label="Positive"
                  fieldKey="positive_moods"
                  value={positiveMoods}
                  options={moodFieldOptions.positive_moods}
                  onChange={(next) => diaryForm.setValue("positiveMoods", next, { shouldDirty: true })}
                  domain="mood"
                />
              ) : null}
              {moodTab === "negative" ? (
                <MultiSelectField
                  hideLabel
                  label="Negative"
                  fieldKey="negative_moods"
                  value={negativeMoods}
                  options={moodFieldOptions.negative_moods}
                  onChange={(next) => diaryForm.setValue("negativeMoods", next, { shouldDirty: true })}
                  domain="mood"
                />
              ) : null}
              {moodTab === "general" ? (
                <MultiSelectField
                  hideLabel
                  label="General"
                  fieldKey="general_moods"
                  value={generalMoods}
                  options={moodFieldOptions.general_moods}
                  onChange={(next) => diaryForm.setValue("generalMoods", next, { shouldDirty: true })}
                  domain="mood"
                />
              ) : null}
            </div>
          </div>
          <div className="save-section">
            <button type="submit" className={`btn-primary save-cta${diaryMutationState.isSuccess ? " is-success-pulse" : ""}`}>
              {diaryMutationState.isSuccess ? "\u2713 Saved" : editingDiary ? "Update entry" : "Save entry"}
            </button>
          </div>
        </div>
      </form>

      {isLoading && <p className="hint">Loading diary entries...</p>}

      <h2 className="entries-heading">Past entries</h2>
      {diaryEntries.length === 0 ? (
        <EmptyState
          title="No diary entries yet"
          description="Use the form above to log your first mood entry. Once you save it, it will appear here."
        />
      ) : (
        diaryEntries.map((entry) => {
          const moodBand = bandNine(entry.moodLevel ?? undefined);
          return (
            <details key={entry.id} className="entry-row">
              <summary>
                <span className="date">{formatEntrySummaryDate(entry.entryDate, entry.entryTime)}</span>
                {entry.moodLevel != null ? (
                  <span className={`pain-badge sm${moodBand ? ` ${moodBand}` : ""}`}>{entry.moodLevel}</span>
                ) : (
                  <span className="pain-badge sm muted">—</span>
                )}
                <span className="preview">{diaryPreview(entry)}</span>
                <span />
                <span className="chevron" aria-hidden="true">
                  ▶
                </span>
              </summary>
              <div className="entry-expanded">
                <div className="detail-group">
                  <span className="label">Mood · Dep · Anx</span>
                  <span className="value">
                    {entry.moodLevel ?? "—"} · {entry.depressionLevel ?? "—"} · {entry.anxietyLevel ?? "—"}
                  </span>
                </div>
                <div className="detail-group">
                  <span className="label">Positive</span>
                  <span className="value">
                    {csvToList(entry.positiveMoods).length ? (
                      csvToList(entry.positiveMoods).map((t) => (
                        <span key={t} className="tag-mini">
                          {t}
                        </span>
                      ))
                    ) : (
                      "—"
                    )}
                  </span>
                </div>
                <div className="detail-group">
                  <span className="label">Negative</span>
                  <span className="value">
                    {csvToList(entry.negativeMoods).length ? (
                      csvToList(entry.negativeMoods).map((t) => (
                        <span key={t} className="tag-mini">
                          {t}
                        </span>
                      ))
                    ) : (
                      "—"
                    )}
                  </span>
                </div>
                <div className="detail-group">
                  <span className="label">General</span>
                  <span className="value">
                    {csvToList(entry.generalMoods).length ? (
                      csvToList(entry.generalMoods).map((t) => (
                        <span key={t} className="tag-mini">
                          {t}
                        </span>
                      ))
                    ) : (
                      "—"
                    )}
                  </span>
                </div>
                <div className="detail-group">
                  <span className="label">Description</span>
                  <span className="value">{entry.description || "—"}</span>
                </div>
                <div className="detail-group">
                  <span className="label">Gratitude</span>
                  <span className="value">{entry.gratitude || "—"}</span>
                </div>
                <div className="detail-group">
                  <span className="label">Reflection</span>
                  <span className="value">{entry.reflection || "—"}</span>
                </div>
                <div className="detail-actions">
                  <button
                    type="button"
                    className={editingDiary?.id === entry.id ? "active is-editing" : editingDiary ? "is-editing" : undefined}
                    onClick={() => {
                      if (editingDiary) {
                        onCancelEdit();
                        return;
                      }
                      onStartEdit(entry);
                    }}
                  >
                    <AnimatedEditingLabel active={Boolean(editingDiary)} />
                  </button>
                  <button
                    type="button"
                    className={confirmDeleteDiary === entry.id ? "btn-delete-confirm" : ""}
                    onClick={() => onDeleteClick(entry.id)}
                    onBlur={onDeleteBlur}
                  >
                    {confirmDeleteDiary === entry.id ? "Delete?" : "Delete"}
                  </button>
                </div>
              </div>
            </details>
          );
        })
      )}
    </section>
  );
}

const PAIN_TABS: { id: PainFieldKey; label: string }[] = [
  { id: "area", label: "Area" },
  { id: "symptoms", label: "Symptoms" },
  { id: "activities", label: "Activities" },
  { id: "medicines", label: "Medicines" },
  { id: "habits", label: "Habits" },
  { id: "other", label: "Other" },
];

export function PainSection({
  painForm,
  painMutationState,
  isLoading,
  editingPain,
  painFieldOptions,
  watchedValues,
  painEntries,
  confirmDeletePain,
  onSubmit,
  onCancelEdit,
  onStartEdit,
  onDeleteClick,
  onDeleteBlur,
}: {
  painForm: UseFormReturn<PainFormValues>;
  painMutationState: { isSuccess: boolean };
  isLoading: boolean;
  editingPain: PainEntry | null;
  painFieldOptions: { area: string[]; symptoms: string[]; activities: string[]; medicines: string[]; habits: string[]; other: string[] };
  watchedValues: { area: string; symptoms: string; activities: string; medicines: string; habits: string; other: string };
  painEntries: PainEntry[];
  confirmDeletePain: number | null;
  onSubmit: (values: PainFormValues) => void;
  onCancelEdit: () => void;
  onStartEdit: (entry: PainEntry) => void;
  onDeleteClick: (id: number) => void;
  onDeleteBlur: () => void;
}) {
  const [painTab, setPainTab] = useState<PainFieldKey>("area");
  const [painLevel, fatigueLevel, coffeeCount] = painForm.watch(["painLevel", "fatigueLevel", "coffeeCount"]);

  const painTabCounts: Record<PainFieldKey, number> = {
    area: csvToList(watchedValues.area).length,
    symptoms: csvToList(watchedValues.symptoms).length,
    activities: csvToList(watchedValues.activities).length,
    medicines: csvToList(watchedValues.medicines).length,
    habits: csvToList(watchedValues.habits).length,
    other: csvToList(watchedValues.other).length,
  };

  const painOptionsForTab = (id: PainFieldKey) => painFieldOptions[id];

  return (
    <section className="panel">
      <h1 className="panel-title">Pain</h1>
      <form className="dense-form-grid pain-dense-form" onSubmit={painForm.handleSubmit(onSubmit)}>
        <div className="core-col">
          <div className="dense-form-hidden-fields" aria-hidden="true">
            <input type="hidden" {...painForm.register("painLevel", { valueAsNumber: true })} />
            <input type="hidden" {...painForm.register("fatigueLevel", { valueAsNumber: true })} />
            <input type="hidden" {...painForm.register("coffeeCount", { valueAsNumber: true })} />
          </div>
          <h3 className="core-col-heading">Right now</h3>
          <label className="field">
            <span className="section-heading">Date/time</span>
            <input type="datetime-local" {...painForm.register("dateTime")} />
          </label>
          <BarMetric
            label="Pain level"
            value={painLevel ?? null}
            onChange={(next) => painForm.setValue("painLevel", next, { shouldDirty: true })}
          />
          <BarMetric
            label="Fatigue"
            value={fatigueLevel ?? null}
            onChange={(next) => painForm.setValue("fatigueLevel", next, { shouldDirty: true })}
          />
          <CoffeeStepper value={coffeeCount ?? null} onChange={(next) => painForm.setValue("coffeeCount", next, { shouldDirty: true })} />
          <label className="field">
            <span className="section-heading">Note</span>
            <textarea {...painForm.register("note")} placeholder="Optional note…" rows={4} />
          </label>
          {editingPain ? (
            <div className="dense-form-inline-actions">
              <button type="button" onClick={onCancelEdit}>
                Cancel edit
              </button>
            </div>
          ) : null}
        </div>

        <div className="right-col">
          <div className="tags-col">
            <nav className="tag-tabs" role="tablist" aria-label="Pain categories">
              {PAIN_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={painTab === tab.id}
                  className={painTab === tab.id ? "active" : ""}
                  onClick={() => setPainTab(tab.id)}
                >
                  {tab.label}{" "}
                  <span className="count">{painTabCounts[tab.id]}</span>
                </button>
              ))}
            </nav>
            <div className="tag-panel">
              {painTab === "area" ? (
                <MultiSelectField
                  hideLabel
                  label="Area"
                  fieldKey="area"
                  value={watchedValues.area}
                  options={painOptionsForTab("area")}
                  onChange={(next) => painForm.setValue("area", next, { shouldDirty: true })}
                />
              ) : null}
              {painTab === "symptoms" ? (
                <MultiSelectField
                  hideLabel
                  label="Symptoms"
                  fieldKey="symptoms"
                  value={watchedValues.symptoms}
                  options={painOptionsForTab("symptoms")}
                  onChange={(next) => painForm.setValue("symptoms", next, { shouldDirty: true })}
                />
              ) : null}
              {painTab === "activities" ? (
                <MultiSelectField
                  hideLabel
                  label="Activities"
                  fieldKey="activities"
                  value={watchedValues.activities}
                  options={painOptionsForTab("activities")}
                  onChange={(next) => painForm.setValue("activities", next, { shouldDirty: true })}
                />
              ) : null}
              {painTab === "medicines" ? (
                <MultiSelectField
                  hideLabel
                  label="Medicines"
                  fieldKey="medicines"
                  value={watchedValues.medicines}
                  options={painOptionsForTab("medicines")}
                  onChange={(next) => painForm.setValue("medicines", next, { shouldDirty: true })}
                />
              ) : null}
              {painTab === "habits" ? (
                <MultiSelectField
                  hideLabel
                  label="Habits"
                  fieldKey="habits"
                  value={watchedValues.habits}
                  options={painOptionsForTab("habits")}
                  onChange={(next) => painForm.setValue("habits", next, { shouldDirty: true })}
                />
              ) : null}
              {painTab === "other" ? (
                <MultiSelectField
                  hideLabel
                  label="Other"
                  fieldKey="other"
                  value={watchedValues.other}
                  options={painOptionsForTab("other")}
                  onChange={(next) => painForm.setValue("other", next, { shouldDirty: true })}
                />
              ) : null}
            </div>
          </div>
          <div className="save-section">
            <button type="submit" className={`btn-primary save-cta${painMutationState.isSuccess ? " is-success-pulse" : ""}`}>
              {painMutationState.isSuccess ? "\u2713 Saved" : editingPain ? "Update entry" : "Save entry"}
            </button>
          </div>
        </div>
      </form>

      {isLoading && <p className="hint">Loading pain entries...</p>}

      <h2 className="entries-heading">Past entries</h2>
      {painEntries.length === 0 ? (
        <EmptyState
          title="No pain entries yet"
          description="Track your first session with the form above. Your pain history will show up here once you save it."
        />
      ) : (
        painEntries.map((entry) => {
          const painBand = bandNine(entry.painLevel ?? undefined);
          return (
            <details key={entry.id} className="entry-row">
              <summary>
                <span className="date">{formatEntrySummaryDate(entry.entryDate, entry.entryTime)}</span>
                {entry.painLevel != null ? (
                  <span className={`pain-badge sm${painBand ? ` ${painBand}` : ""}`}>{entry.painLevel}</span>
                ) : (
                  <span className="pain-badge sm muted">—</span>
                )}
                <span className="preview">{painPreview(entry)}</span>
                <span />
                <span className="chevron" aria-hidden="true">
                  ▶
                </span>
              </summary>
              <div className="entry-expanded">
                <div className="detail-group">
                  <span className="label">Pain · Fatigue · Coffee</span>
                  <span className="value">
                    {entry.painLevel ?? "—"} · {entry.fatigueLevel ?? "—"} · {entry.coffeeCount ?? "—"}
                  </span>
                </div>
                <div className="detail-group">
                  <span className="label">Area</span>
                  <span className="value">
                    {csvToList(entry.area).length ? (
                      csvToList(entry.area).map((t) => (
                        <span key={t} className="tag-mini">
                          {t}
                        </span>
                      ))
                    ) : (
                      "—"
                    )}
                  </span>
                </div>
                <div className="detail-group">
                  <span className="label">Symptoms</span>
                  <span className="value">
                    {csvToList(entry.symptoms).length ? (
                      csvToList(entry.symptoms).map((t) => (
                        <span key={t} className="tag-mini">
                          {t}
                        </span>
                      ))
                    ) : (
                      "—"
                    )}
                  </span>
                </div>
                <div className="detail-group">
                  <span className="label">Activities</span>
                  <span className="value">
                    {csvToList(entry.activities).length ? (
                      csvToList(entry.activities).map((t) => (
                        <span key={t} className="tag-mini">
                          {t}
                        </span>
                      ))
                    ) : (
                      "—"
                    )}
                  </span>
                </div>
                <div className="detail-group">
                  <span className="label">Medicines</span>
                  <span className="value">
                    {csvToList(entry.medicines).length ? (
                      csvToList(entry.medicines).map((t) => (
                        <span key={t} className="tag-mini">
                          {t}
                        </span>
                      ))
                    ) : (
                      "—"
                    )}
                  </span>
                </div>
                <div className="detail-group">
                  <span className="label">Habits</span>
                  <span className="value">
                    {csvToList(entry.habits).length ? (
                      csvToList(entry.habits).map((t) => (
                        <span key={t} className="tag-mini">
                          {t}
                        </span>
                      ))
                    ) : (
                      "—"
                    )}
                  </span>
                </div>
                <div className="detail-group">
                  <span className="label">Other</span>
                  <span className="value">
                    {csvToList(entry.other).length ? (
                      csvToList(entry.other).map((t) => (
                        <span key={t} className="tag-mini">
                          {t}
                        </span>
                      ))
                    ) : (
                      "—"
                    )}
                  </span>
                </div>
                <div className="detail-group">
                  <span className="label">Note</span>
                  <span className="value">{entry.note || "—"}</span>
                </div>
                <div className="detail-actions">
                  <button
                    type="button"
                    className={editingPain?.id === entry.id ? "active is-editing" : editingPain ? "is-editing" : undefined}
                    onClick={() => {
                      if (editingPain) {
                        onCancelEdit();
                        return;
                      }
                      onStartEdit(entry);
                    }}
                  >
                    <AnimatedEditingLabel active={Boolean(editingPain)} />
                  </button>
                  <button
                    type="button"
                    className={confirmDeletePain === entry.id ? "btn-delete-confirm" : ""}
                    onClick={() => onDeleteClick(entry.id)}
                    onBlur={onDeleteBlur}
                  >
                    {confirmDeletePain === entry.id ? "Delete?" : "Delete"}
                  </button>
                </div>
              </div>
            </details>
          );
        })
      )}
    </section>
  );
}

export function CbtSection({
  cbtForm,
  cbtMutationState,
  isLoading,
  editingCbt,
  cbtEntries,
  confirmDeleteCbt,
  onSubmit,
  onCancelEdit,
  onStartEdit,
  onDeleteClick,
  onDeleteBlur,
}: {
  cbtForm: UseFormReturn<CbtFormValues>;
  cbtMutationState: { isSuccess: boolean };
  isLoading: boolean;
  editingCbt: CbtEntry | null;
  cbtEntries: CbtEntry[];
  confirmDeleteCbt: number | null;
  onSubmit: (values: CbtFormValues) => void;
  onCancelEdit: () => void;
  onStartEdit: (entry: CbtEntry) => void;
  onDeleteClick: (id: number) => void;
  onDeleteBlur: () => void;
}) {
  return (
    <section className="panel">
      <h1 className="panel-title">CBT Thought Response</h1>
      <form className="therapy-form" onSubmit={cbtForm.handleSubmit(onSubmit)}>
        <label>
          Date/time
          <input type="datetime-local" {...cbtForm.register("dateTime")} />
        </label>

        <div className="therapy-section"><h2>Situation</h2></div>
        <label>
          What's the situation?
          <input type="text" {...cbtForm.register("situation")} />
        </label>

        <div className="therapy-section"><h2>Thoughts</h2></div>
        <label>
          What thoughts are running through your mind? How much do you believe each one? Go beyond simple thoughts — ask: why would this be bad? What would it mean?
          <input type="text" {...cbtForm.register("thoughts")} />
        </label>
        <label>
          Do you have any helpful reasoning to counter this thought pattern?
          <input type="text" {...cbtForm.register("helpfulReasoning")} />
        </label>

        <div className="therapy-section"><h2>Question your unhelpful thoughts</h2></div>
        <label>
          What is the main unhelpful thought?
          <input type="text" {...cbtForm.register("mainUnhelpfulThought")} />
        </label>
        <label>
          What is the effect of believing this? What would you be able to do if you didn't believe it?
          <input type="text" {...cbtForm.register("effectOfBelieving")} />
        </label>
        <label>
          What evidence supports or rejects this thought?
          <input type="text" {...cbtForm.register("evidenceForAgainst")} />
        </label>
        <label>
          Could there be an alternative explanation for the situation?
          <input type="text" {...cbtForm.register("alternativeExplanation")} />
        </label>
        <label>
          What's the worst that could happen? Would you survive it? How about the best scenario?
          <input type="text" {...cbtForm.register("worstBestScenario")} />
        </label>
        <label>
          Imagine your friend was in this situation. What advice would you give them?
          <input type="text" {...cbtForm.register("friendAdvice")} />
        </label>

        <div className="therapy-section"><h2>A more productive response</h2></div>
        <div className="therapy-callout">Take a deep breath and try to see the thoughts from an outside perspective. Is there a more productive and rational response to this situation?</div>
        <label>
          What are your next steps?
          <input type="text" {...cbtForm.register("productiveResponse")} />
        </label>

        <div className="row-actions">
          <button type="submit" className={cbtMutationState.isSuccess ? "btn-check" : ""}>
            {cbtMutationState.isSuccess ? "\u2713" : editingCbt ? "Update entry" : "Add entry"}
          </button>
          {editingCbt && (
            <button type="button" onClick={onCancelEdit}>
              Cancel
            </button>
          )}
        </div>
      </form>

      {isLoading && <p className="hint">Loading CBT entries...</p>}

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Time</th>
              <th>Situation</th>
              <th>Main thought</th>
              <th>Response</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {cbtEntries.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    title="No CBT entries yet"
                    description="Use the prompts above to record your first thought response. Completed reflections will appear here."
                    compact
                  />
                </td>
              </tr>
            ) : (
              cbtEntries.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.entryDate}</td>
                  <td>{entry.entryTime}</td>
                  <td>{entry.situation || "-"}</td>
                  <td>{entry.mainUnhelpfulThought || "-"}</td>
                  <td>{entry.productiveResponse || "-"}</td>
                  <td>
                    <button
                      type="button"
                      className={editingCbt?.id === entry.id ? "active is-editing" : editingCbt ? "is-editing" : undefined}
                      onClick={() => {
                        if (editingCbt) {
                          onCancelEdit();
                          return;
                        }
                        onStartEdit(entry);
                      }}
                    >
                      <AnimatedEditingLabel active={Boolean(editingCbt)} />
                    </button>
                    <button
                      type="button"
                      className={confirmDeleteCbt === entry.id ? "btn-delete-confirm" : ""}
                      onClick={() => onDeleteClick(entry.id)}
                      onBlur={onDeleteBlur}
                    >
                      {confirmDeleteCbt === entry.id ? "Delete?" : "Delete"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function DbtSection({
  dbtForm,
  dbtMutationState,
  isLoading,
  editingDbt,
  dbtEntries,
  confirmDeleteDbt,
  onSubmit,
  onCancelEdit,
  onStartEdit,
  onDeleteClick,
  onDeleteBlur,
}: {
  dbtForm: UseFormReturn<DbtFormValues>;
  dbtMutationState: { isSuccess: boolean };
  isLoading: boolean;
  editingDbt: DbtEntry | null;
  dbtEntries: DbtEntry[];
  confirmDeleteDbt: number | null;
  onSubmit: (values: DbtFormValues) => void;
  onCancelEdit: () => void;
  onStartEdit: (entry: DbtEntry) => void;
  onDeleteClick: (id: number) => void;
  onDeleteBlur: () => void;
}) {
  return (
    <section className="panel">
      <h1 className="panel-title">DBT Distress Tolerance</h1>
      <form className="therapy-form" onSubmit={dbtForm.handleSubmit(onSubmit)}>
        <label>
          Date/time
          <input type="datetime-local" {...dbtForm.register("dateTime")} />
        </label>

        <div className="therapy-section"><h2>Recognize and allow the emotion</h2></div>
        <div className="therapy-callout">Try to think of a more intense form of your emotion. Instead of sad, maybe you are distraught or crushed. Instead of mad, you are disgusted or appalled.</div>
        <label>
          What emotion are you feeling?
          <input type="text" {...dbtForm.register("emotionName")} />
        </label>
        <div className="therapy-callout">"I am feeling this emotion. It's ok, I can allow myself to feel this. I'm not bad because I have this feeling. I'm going to make space for it. I can control myself, so I don't need to get rid of this feeling."</div>
        <label>
          Write your own affirmation:
          <input type="text" {...dbtForm.register("allowAffirmation")} />
        </label>

        <div className="therapy-section"><h2>Watch the emotion</h2></div>
        <div className="therapy-callout">Let me watch this emotion and see what it does. I don't have to get caught up in it. My emotion is like an ocean wave — I'm going to float with it.</div>
        <label>
          Call the emotion what it is.
          <input type="text" {...dbtForm.register("watchEmotion")} />
        </label>
        <label>
          Where do you notice the emotion in your body?
          <input type="text" {...dbtForm.register("bodyLocation")} />
        </label>
        <label>
          What do you feel?
          <input type="text" {...dbtForm.register("bodyFeeling")} />
        </label>

        <div className="therapy-section"><h2>Be present</h2></div>
        <div className="therapy-callout">Turn your attention back to what you are doing now. Notice what's going on with all five senses, or focus on your breath as your anchor for the present moment.</div>
        <label>
          What can you feel, hear, see, smell, or taste right now?
          <input type="text" {...dbtForm.register("presentMoment")} />
        </label>

        <div className="therapy-section"><h2>When the emotion comes back</h2></div>
        <div className="therapy-callout">That's ok. Emotions come and go. Watch it again. Let it sit in the room with you, or float with it like an ocean wave.</div>

        <div className="row-actions">
          <button type="submit" className={dbtMutationState.isSuccess ? "btn-check" : ""}>
            {dbtMutationState.isSuccess ? "\u2713" : editingDbt ? "Update entry" : "Add entry"}
          </button>
          {editingDbt && (
            <button type="button" onClick={onCancelEdit}>
              Cancel
            </button>
          )}
        </div>
      </form>

      {isLoading && <p className="hint">Loading DBT entries...</p>}

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Time</th>
              <th>Emotion</th>
              <th>Body location</th>
              <th>Present moment</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {dbtEntries.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    title="No DBT entries yet"
                    description="Work through the steps above to log your first distress-tolerance practice. Saved entries will appear here."
                    compact
                  />
                </td>
              </tr>
            ) : (
              dbtEntries.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.entryDate}</td>
                  <td>{entry.entryTime}</td>
                  <td>{entry.emotionName || "-"}</td>
                  <td>{entry.bodyLocation || "-"}</td>
                  <td>{entry.presentMoment || "-"}</td>
                  <td>
                    <button
                      type="button"
                      className={editingDbt?.id === entry.id ? "active is-editing" : editingDbt ? "is-editing" : undefined}
                      onClick={() => {
                        if (editingDbt) {
                          onCancelEdit();
                          return;
                        }
                        onStartEdit(entry);
                      }}
                    >
                      <AnimatedEditingLabel active={Boolean(editingDbt)} />
                    </button>
                    <button
                      type="button"
                      className={confirmDeleteDbt === entry.id ? "btn-delete-confirm" : ""}
                      onClick={() => onDeleteClick(entry.id)}
                      onBlur={onDeleteBlur}
                    >
                      {confirmDeleteDbt === entry.id ? "Delete?" : "Delete"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function SettingsSection({
  auth,
  purgeConfirmArmed,
  purgePending,
  purgeError,
  onPurgeArm,
  onPurgeConfirm,
  onPurgeCancel,
  onExportJson,
  onImportJson,
  onExportXlsx,
  onImportXlsx,
  backupFeedback,
}: {
  auth: ReturnType<typeof useAuth>;
  purgeConfirmArmed: boolean;
  purgePending: boolean;
  purgeError: InlineMessage | null;
  onPurgeArm: () => void;
  onPurgeConfirm: () => void;
  onPurgeCancel: () => void;
  onExportJson: () => void;
  onImportJson: (file: File) => void;
  onExportXlsx: () => void;
  onImportXlsx: (file: File) => void;
  backupFeedback: InlineMessage | null;
}) {
  return (
    <section className="panel panel--frameless">
      <h1 className="panel-title">Settings</h1>
      <div className="settings-grid">
        <div className="settings-column">
          <article>
            <h3>Account</h3>
            <form
              className="stack"
              onFocus={auth.clearPasswordStatus}
              onSubmit={auth.changePasswordForm.handleSubmit((v) => auth.changePasswordMutation.mutate(v))}
            >
              <label>
                Current password
                <input type="password" autoComplete="current-password" {...auth.changePasswordForm.register("currentPassword")} />
              </label>
              <label>
                New password
                <input type="password" autoComplete="new-password" {...auth.changePasswordForm.register("newPassword")} />
              </label>
              <label>
                Confirm
                <input type="password" autoComplete="new-password" {...auth.changePasswordForm.register("confirmPassword")} />
              </label>
              <button type="submit" disabled={auth.changePasswordMutation.isPending}>
                Change password
              </button>
              <InlineFeedback
                message={
                  auth.changePasswordMutation.error
                    ? { tone: "error", text: getErrorMessage(auth.changePasswordMutation.error) }
                    : auth.passwordFeedback
                }
              />
            </form>
            <button onClick={() => auth.logoutMutation.mutate()} disabled={auth.logoutMutation.isPending} style={{ marginTop: 10 }}>
              Log out
            </button>
          </article>
          <article className="danger-zone">
            <h3>Danger zone</h3>
            {purgeConfirmArmed ? (
              <div className="inline-confirmation" role="group" aria-label="Confirm purge all data">
                <InlineFeedback
                  className="confirmation-copy"
                  message={{
                    tone: "warning",
                    text: "This permanently deletes all diary, pain, and preference data for this account.",
                  }}
                />
                <div className="row-actions confirmation-actions">
                  <button type="button" className="danger" onClick={onPurgeConfirm} disabled={purgePending}>
                    {purgePending ? "Purging..." : "Confirm purge all data"}
                  </button>
                  <button type="button" onClick={onPurgeCancel} disabled={purgePending}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="danger" onClick={onPurgeArm}>
                Purge all data
              </button>
            )}
            <InlineFeedback message={purgeError} />
          </article>
        </div>
        <article>
          <h3>Backup</h3>
          <div className="stack">
            <button type="button" onClick={onExportJson}>
              Export JSON
            </button>
            <label className="file-input">
              Import JSON
              <input
                type="file"
                accept=".json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onImportJson(file);
                  e.target.value = "";
                }}
              />
            </label>
            <button type="button" onClick={onExportXlsx}>
              Export XLSX
            </button>
            <label className="file-input">
              Import XLSX
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onImportXlsx(file);
                  e.target.value = "";
                }}
              />
            </label>
            <InlineFeedback message={backupFeedback} />
          </div>
        </article>
        <McpAccessSection enabled />
      </div>
    </section>
  );
}
