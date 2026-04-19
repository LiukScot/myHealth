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
import type { useAuth } from "../hooks/use-auth";
import {
  AnimatedEditingLabel,
  MultiSelectField,
  SectionHead,
  useDiaryColumnCap,
} from "./shared";
import { SettingsVariantB } from "./settings-mockups";
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

function bandNine(level: number | null | undefined, higherIsBetter = false): "low" | "mid" | "high" | "" {
  if (level == null || Number.isNaN(Number(level))) return "";
  const n = Math.round(Number(level));
  if (higherIsBetter) {
    if (n <= 3) return "high";
    if (n <= 6) return "mid";
    return "low";
  }
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
  higherIsBetter = false,
}: {
  label: string;
  value: number | null;
  onChange: (next: number | null) => void;
  fractionDigits?: number;
  /** When true, higher scores use success styling and lower scores use warning/danger (e.g. mood). */
  higherIsBetter?: boolean;
}) {
  const n =
    value != null && !Number.isNaN(Number(value)) ? Math.min(9, Math.max(1, Math.round(Number(value)))) : null;
  const band = bandNine(n, higherIsBetter);
  return (
    <div className="bar-metric">
      <span className="name">{label}</span>
      <div className="bars" role="group" aria-label={label}>
        {Array.from({ length: 9 }, (_, i) => {
          const slot = i + 1;
          const filled = n != null && slot <= n;
          const slotBand = higherIsBetter
            ? slot <= 3
              ? "high"
              : slot <= 6
                ? "mid"
                : "low"
            : slot <= 3
              ? "low"
              : slot <= 6
                ? "mid"
                : "high";
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
      <span className={["val", band].filter(Boolean).join(" ")}>{formatMetricDisplay(value, fractionDigits)}</span>
    </div>
  );
}

function CoffeeStepper({ value, onChange }: { value: number | null; onChange: (next: number | null) => void }) {
  const n = value != null && !Number.isNaN(Number(value)) ? Math.min(50, Math.max(0, Math.floor(Number(value)))) : 0;
  return (
    <div className="bar-metric bar-metric-stepper">
      <span className="name">Coffee</span>
      <span aria-hidden="true" className="bar-metric-spacer" />
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

          <SectionHead title="Averages" />
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

          <SectionHead title="Metrics over time" />
          <div className="chart-wrap chart-wrap-wide">
            <div className="graph-header">
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

  const {
    leftColRef,
    pastColRef,
    pastEntriesBodyRef,
    overflow: pastEntriesOverflow,
  } = useDiaryColumnCap(diaryEntries, isLoading);

  return (
    <section className="panel">
      <h1 className="panel-title">Diary</h1>
      <div className="panel-split panel-split--diary">
        <div className="panel-col" ref={leftColRef}>
        <h2 className="entries-heading">New entry</h2>
        <form className="dense-form-grid diary-dense-form" onSubmit={diaryForm.handleSubmit(onSubmit)}>
        <div className="core-col">
          <div className="dense-form-hidden-fields" aria-hidden="true">
            <input type="hidden" {...diaryForm.register("moodLevel", { valueAsNumber: true })} />
            <input type="hidden" {...diaryForm.register("depressionLevel", { valueAsNumber: true })} />
            <input type="hidden" {...diaryForm.register("anxietyLevel", { valueAsNumber: true })} />
          </div>
          <label className="field field-line">
            <span className="field-line-label">Date &amp; time</span>
            <input
              type="datetime-local"
              {...diaryForm.register("dateTime")}
              aria-label="Date/time"
              onClick={(e) => {
                const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
                el.showPicker?.();
              }}
            />
          </label>
          <div className="field field-line metric-group-label">
            <span className="field-line-label">Values</span>
          </div>
          <BarMetric
            label="Mood"
            value={moodLevel ?? null}
            fractionDigits={1}
            higherIsBetter
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
          <label className="field field-line">
            <span className="field-line-label">Description</span>
            <textarea
              {...diaryForm.register("description")}
              placeholder="What happened today? How did it feel?"
              rows={2}
              aria-label="Description"
            />
          </label>
          <label className="field field-line">
            <span className="field-line-label">Gratitude</span>
            <textarea
              {...diaryForm.register("gratitude")}
              placeholder="One small thing you're glad about…"
              rows={2}
              aria-label="Gratitude"
            />
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
            <div className="section-head">
              <span className="section-title">Emotions</span>
            </div>
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
            <button type="submit" className={`btn btn-primary${diaryMutationState.isSuccess ? " is-success-pulse" : ""}`}>
              {diaryMutationState.isSuccess ? "\u2713 Saved" : editingDiary ? "Update entry" : "Save entry"}
            </button>
          </div>
        </div>
      </form>
        </div>
        <div className="panel-col diary-past-col" ref={pastColRef}>
          {isLoading && <p className="hint">Loading diary entries...</p>}

          <h2 className="entries-heading">Past entries</h2>
          {diaryEntries.length === 0 ? (
            <EmptyState
              title="No diary entries yet"
              description="Use the form above to log your first mood entry. Once you save it, it will appear here."
            />
          ) : (
            <div className="diary-past-entries-stack">
              <div className="diary-past-entries-body" ref={pastEntriesBodyRef}>
                {diaryEntries.map((entry) => {
                const moodBand = bandNine(entry.moodLevel ?? undefined, true);
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
              })}
              </div>
              <div
                className={`save-section diary-past-footer-slot${pastEntriesOverflow ? " diary-past-more" : ""}`}
                aria-hidden={!pastEntriesOverflow}
              >
                {!isLoading && pastEntriesOverflow ? (
                  <button type="button" className="btn">
                    Show more
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

const DESIGN_COLOR_TOKENS: { name: string; varName: string; role: string }[] = [
  { name: "Background", varName: "--bg", role: "App canvas" },
  { name: "Card", varName: "--card", role: "Panels, inputs" },
  { name: "Card strong", varName: "--card-strong", role: "Elevated surfaces" },
  { name: "Card soft", varName: "--card-soft", role: "Subtle fills" },
  { name: "Text", varName: "--text", role: "Primary text" },
  { name: "Muted", varName: "--muted", role: "Secondary text" },
  { name: "Muted soft", varName: "--muted-soft", role: "Tertiary text" },
  { name: "Border", varName: "--border", role: "Dividers" },
  { name: "Border soft", varName: "--border-soft", role: "Hairlines" },
  { name: "Accent", varName: "--accent", role: "Primary action" },
  { name: "Accent 2", varName: "--accent-2", role: "Accent hover" },
  { name: "Success", varName: "--success", role: "Positive state" },
  { name: "Warning", varName: "--warning", role: "Mid state" },
  { name: "Danger", varName: "--danger", role: "Negative state" },
];

const DESIGN_SPACING_TOKENS: { varName: string; px: string }[] = [
  { varName: "--space-1", px: "10px" },
  { varName: "--space-2", px: "20px" },
  { varName: "--space-3", px: "30px" },
  { varName: "--space-4", px: "40px" },
];

const DESIGN_RADIUS_TOKENS: { varName: string; px: string }[] = [
  { varName: "--radius-sm", px: "10px" },
  { varName: "--radius-md", px: "12px" },
  { varName: "--radius-lg", px: "16px" },
];

export function DesignSystemSection() {
  const [moodDemo, setMoodDemo] = useState<number | null>(6);
  const [painDemo, setPainDemo] = useState<number | null>(3);
  const [coffeeDemo, setCoffeeDemo] = useState<number | null>(2);
  const [tabDemo, setTabDemo] = useState<"positive" | "negative" | "general">("positive");

  return (
    <section className="panel">
      <h1 className="panel-title">Design System</h1>
      <p className="hint ds-lede">
        Living reference for the tokens, primitives, and patterns the Diary page is built from.
        Every example below uses the same classes as the real app &mdash; edit{" "}
        <code>styles.css</code> and this page updates with it.
      </p>

      <div className="panel-split panel-split--diary">
        <div className="panel-col ds-col">
          <h2 className="entries-heading">Foundations</h2>

          <section className="ds-section">
            <div className="section-head">
              <span className="section-title">Colors</span>
              <span className="section-aside">CSS custom properties</span>
            </div>
            <ul className="ds-swatches">
              {DESIGN_COLOR_TOKENS.map((t) => (
                <li key={t.varName} className="ds-swatch">
                  <span className="ds-swatch-chip" style={{ background: `var(${t.varName})` }} />
                  <div className="ds-swatch-meta">
                    <span className="ds-swatch-name">{t.name}</span>
                    <code className="ds-swatch-var">{t.varName}</code>
                    <span className="ds-swatch-role">{t.role}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="ds-section">
            <div className="section-head">
              <span className="section-title">Typography</span>
              <span className="section-aside">Manrope</span>
            </div>
            <dl className="ds-type-scale">
              <div className="ds-type-row">
                <dt style={{ font: "700 28px var(--font-body)" }}>Panel title</dt>
                <dd>28 / 700</dd>
              </div>
              <div className="ds-type-row">
                <dt style={{ font: "700 10px var(--font-body)", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--muted)" }}>
                  Entries heading
                </dt>
                <dd>10 / 700 / 0.16em</dd>
              </div>
              <div className="ds-type-row">
                <dt style={{ font: "500 14px var(--font-body)" }}>Body</dt>
                <dd>14 / 500</dd>
              </div>
              <div className="ds-type-row">
                <dt style={{ font: "500 12px var(--font-body)", color: "var(--muted)" }}>Hint</dt>
                <dd>12 / 500 / muted</dd>
              </div>
              <div className="ds-type-row">
                <dt style={{ font: "500 12px var(--font-mono, ui-monospace, Menlo, monospace)", fontVariantNumeric: "tabular-nums", color: "var(--muted)" }}>
                  Entry date · Apr 18, 5:03 PM
                </dt>
                <dd>12 / mono / tabular</dd>
              </div>
            </dl>
          </section>

          <section className="ds-section">
            <div className="section-head">
              <span className="section-title">Spacing</span>
              <span className="section-aside">Base scale</span>
            </div>
            <ul className="ds-scale-list">
              {DESIGN_SPACING_TOKENS.map((t) => (
                <li key={t.varName} className="ds-scale-row">
                  <code>{t.varName}</code>
                  <span className="ds-scale-bar" style={{ width: `var(${t.varName})` }} />
                  <span className="ds-scale-val">{t.px}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="ds-section">
            <div className="section-head">
              <span className="section-title">Radius</span>
              <span className="section-aside">Rounded corners</span>
            </div>
            <ul className="ds-radius-list">
              {DESIGN_RADIUS_TOKENS.map((t) => (
                <li key={t.varName} className="ds-radius-item">
                  <span className="ds-radius-chip" style={{ borderRadius: `var(${t.varName})` }} />
                  <code>{t.varName}</code>
                  <span className="ds-scale-val">{t.px}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="ds-section">
            <div className="section-head">
              <span className="section-title">Badges</span>
              <span className="section-aside">9-point scale</span>
            </div>
            <div className="ds-badges">
              <span className="pain-badge sm low">2</span>
              <span className="pain-badge sm mid">5</span>
              <span className="pain-badge sm high">8</span>
              <span className="pain-badge sm muted">&mdash;</span>
            </div>
          </section>
        </div>

        <div className="panel-col ds-col">
          <h2 className="entries-heading">Components</h2>

          <section className="ds-section">
            <div className="section-head">
              <span className="section-title">Buttons</span>
              <span className="section-aside">Pill utility</span>
            </div>
            <div className="ds-btn-row">
              <button type="button" className="btn">Default</button>
              <button type="button" className="btn btn-primary">Primary</button>
              <button type="button" className="btn btn-primary is-success-pulse">✓ Saved</button>
              <button type="button" className="btn btn-danger">Danger</button>
            </div>
          </section>

          <section className="ds-section">
            <div className="section-head">
              <span className="section-title">Form fields</span>
              <span className="section-aside">Field-line</span>
            </div>
            <div className="ds-fields">
              <label className="field field-line">
                <span className="field-line-label">Text</span>
                <input type="text" defaultValue="Sample value" aria-label="Text" />
              </label>
              <label className="field field-line">
                <span className="field-line-label">Date &amp; time</span>
                <input type="datetime-local" defaultValue="2026-04-18T17:30" aria-label="Date/time" />
              </label>
              <label className="field field-line">
                <span className="field-line-label">Description</span>
                <textarea rows={2} placeholder="Free text area…" aria-label="Description" />
              </label>
            </div>
          </section>

          <section className="ds-section">
            <div className="section-head">
              <span className="section-title">Metrics</span>
              <span className="section-aside">BarMetric · Stepper</span>
            </div>
            <div className="ds-metrics">
              <BarMetric label="Mood" value={moodDemo} fractionDigits={1} higherIsBetter onChange={setMoodDemo} />
              <BarMetric label="Pain" value={painDemo} onChange={setPainDemo} />
              <CoffeeStepper value={coffeeDemo} onChange={setCoffeeDemo} />
            </div>
          </section>

          <section className="ds-section">
            <div className="section-head">
              <span className="section-title">Tabs</span>
              <span className="section-aside">Underline, accent</span>
            </div>
            <nav className="tag-tabs" role="tablist" aria-label="Demo tabs">
              {(["positive", "negative", "general"] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tabDemo === id}
                  className={tabDemo === id ? "active" : ""}
                  onClick={() => setTabDemo(id)}
                >
                  {id[0].toUpperCase() + id.slice(1)} <span className="count">0</span>
                </button>
              ))}
            </nav>
          </section>

          <section className="ds-section">
            <div className="section-head">
              <span className="section-title">Entry row</span>
              <span className="section-aside">Collapsible details</span>
            </div>
            <details className="entry-row" open>
              <summary>
                <span className="date">Apr 18, 5:03 PM</span>
                <span className="pain-badge sm mid">6</span>
                <span className="preview">grateful · distracted, restless</span>
                <span />
                <span className="chevron" aria-hidden="true">▶</span>
              </summary>
              <div className="entry-expanded">
                <div className="detail-group">
                  <span className="label">Mood · Dep · Anx</span>
                  <span className="value">6 · 4 · 4</span>
                </div>
                <div className="detail-group">
                  <span className="label">Positive</span>
                  <span className="value">
                    <span className="tag-mini">grateful</span>
                  </span>
                </div>
              </div>
            </details>
          </section>
        </div>
      </div>
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

  const {
    leftColRef,
    pastColRef,
    pastEntriesBodyRef,
    overflow: pastEntriesOverflow,
  } = useDiaryColumnCap(painEntries, isLoading);

  return (
    <section className="panel">
      <h1 className="panel-title">Pain</h1>
      <div className="panel-split panel-split--diary">
        <div className="panel-col" ref={leftColRef}>
        <h2 className="entries-heading">New entry</h2>
        <form className="dense-form-grid pain-dense-form" onSubmit={painForm.handleSubmit(onSubmit)}>
        <div className="core-col">
          <div className="dense-form-hidden-fields" aria-hidden="true">
            <input type="hidden" {...painForm.register("painLevel", { valueAsNumber: true })} />
            <input type="hidden" {...painForm.register("fatigueLevel", { valueAsNumber: true })} />
            <input type="hidden" {...painForm.register("coffeeCount", { valueAsNumber: true })} />
          </div>
          <label className="field field-line">
            <span className="field-line-label">Date &amp; time</span>
            <input
              type="datetime-local"
              {...painForm.register("dateTime")}
              aria-label="Date/time"
              onClick={(e) => {
                const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
                el.showPicker?.();
              }}
            />
          </label>
          <div className="field field-line metric-group-label">
            <span className="field-line-label">Values</span>
          </div>
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
          <label className="field field-line">
            <span className="field-line-label">Note</span>
            <textarea
              {...painForm.register("note")}
              placeholder="Anything worth remembering about this flare…"
              rows={2}
              aria-label="Note"
            />
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
            <div className="section-head">
              <span className="section-title">Factors</span>
            </div>
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
            <button type="submit" className={`btn btn-primary${painMutationState.isSuccess ? " is-success-pulse" : ""}`}>
              {painMutationState.isSuccess ? "\u2713 Saved" : editingPain ? "Update entry" : "Save entry"}
            </button>
          </div>
        </div>
      </form>
        </div>
        <div className="panel-col diary-past-col" ref={pastColRef}>
      {isLoading && <p className="hint">Loading pain entries...</p>}

      <h2 className="entries-heading">Past entries</h2>
      {painEntries.length === 0 ? (
        <EmptyState
          title="No pain entries yet"
          description="Track your first session with the form above. Your pain history will show up here once you save it."
        />
      ) : (
        <div className="diary-past-entries-stack">
          <div className="diary-past-entries-body" ref={pastEntriesBodyRef}>
            {painEntries.map((entry) => {
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
            })}
          </div>
          <div
            className={`save-section diary-past-footer-slot${pastEntriesOverflow ? " diary-past-more" : ""}`}
            aria-hidden={!pastEntriesOverflow}
          >
            {!isLoading && pastEntriesOverflow ? (
              <button type="button" className="btn">
                Show more
              </button>
            ) : null}
          </div>
        </div>
      )}
        </div>
      </div>
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
  const cbtFields: { key: keyof CbtFormValues; label: string; hint?: string; multiline?: boolean }[] = [
    { key: "situation", label: "Situation", hint: "What's the situation?" },
    {
      key: "thoughts",
      label: "Thoughts",
      hint: "What thoughts are running through your mind? How much do you believe each one?",
      multiline: true,
    },
    {
      key: "helpfulReasoning",
      label: "Helpful reasoning",
      hint: "Any helpful reasoning to counter this thought pattern?",
      multiline: true,
    },
    {
      key: "mainUnhelpfulThought",
      label: "Main unhelpful thought",
      hint: "The single thought you want to work on.",
    },
    {
      key: "effectOfBelieving",
      label: "Effect of believing it",
      hint: "What would change if you didn't believe it?",
      multiline: true,
    },
    {
      key: "evidenceForAgainst",
      label: "Evidence for / against",
      hint: "What supports or rejects this thought?",
      multiline: true,
    },
    {
      key: "alternativeExplanation",
      label: "Alternative explanation",
      hint: "Could there be another way to read the situation?",
      multiline: true,
    },
    {
      key: "worstBestScenario",
      label: "Worst / best scenario",
      hint: "What's the worst? Would you survive it? What's the best?",
      multiline: true,
    },
    {
      key: "friendAdvice",
      label: "Advice to a friend",
      hint: "What would you tell a friend in this situation?",
      multiline: true,
    },
    {
      key: "productiveResponse",
      label: "Productive response",
      hint: "Take a breath. What are your next steps?",
      multiline: true,
    },
  ];

  const {
    leftColRef,
    pastColRef,
    pastEntriesBodyRef,
    overflow: pastEntriesOverflow,
  } = useDiaryColumnCap(cbtEntries, isLoading);

  return (
    <section className="panel">
      <h1 className="panel-title">CBT Thought Response</h1>
      <div className="panel-split panel-split--diary">
        <div className="panel-col" ref={leftColRef}>
          <h2 className="entries-heading">New entry</h2>
          <form className="dense-form-grid therapy-form" onSubmit={cbtForm.handleSubmit(onSubmit)}>
            <div className="core-col">
              <label className="field field-line">
                <span className="field-line-label">Date &amp; time</span>
                <input
                  type="datetime-local"
                  {...cbtForm.register("dateTime")}
                  aria-label="Date/time"
                  onClick={(e) => {
                    const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
                    el.showPicker?.();
                  }}
                />
              </label>
              <SectionHead title="Thought record" />
              {cbtFields.map((f) => (
                <label key={f.key} className="field field-line">
                  <span className="field-line-label">{f.label}</span>
                  {f.multiline ? (
                    <textarea rows={2} placeholder={f.hint} aria-label={f.label} {...cbtForm.register(f.key)} />
                  ) : (
                    <input type="text" placeholder={f.hint} aria-label={f.label} {...cbtForm.register(f.key)} />
                  )}
                </label>
              ))}
              {editingCbt ? (
                <div className="dense-form-inline-actions">
                  <button type="button" onClick={onCancelEdit}>
                    Cancel edit
                  </button>
                </div>
              ) : null}
            </div>
            <div className="save-section">
              <button type="submit" className={`btn btn-primary${cbtMutationState.isSuccess ? " is-success-pulse" : ""}`}>
                {cbtMutationState.isSuccess ? "\u2713 Saved" : editingCbt ? "Update entry" : "Save entry"}
              </button>
            </div>
          </form>
        </div>
        <div className="panel-col diary-past-col" ref={pastColRef}>
          {isLoading && <p className="hint">Loading CBT entries...</p>}

          <h2 className="entries-heading">Past entries</h2>
          {cbtEntries.length === 0 ? (
            <EmptyState
              title="No CBT entries yet"
              description="Use the prompts above to record your first thought response. Completed reflections will appear here."
            />
          ) : (
            <div className="diary-past-entries-stack">
              <div className="diary-past-entries-body" ref={pastEntriesBodyRef}>
            {cbtEntries.map((entry) => (
          <details key={entry.id} className="entry-row">
            <summary>
              <span className="date">{formatEntrySummaryDate(entry.entryDate, entry.entryTime)}</span>
              <span className="pain-badge sm muted">CBT</span>
              <span className="preview">{entry.situation || entry.mainUnhelpfulThought || entry.productiveResponse || "—"}</span>
              <span />
              <span className="chevron" aria-hidden="true">▶</span>
            </summary>
            <div className="entry-expanded">
              {cbtFields.map((f) => {
                const v = entry[f.key as keyof CbtEntry] as unknown as string | null | undefined;
                return (
                  <div key={f.key} className="detail-group">
                    <span className="label">{f.label}</span>
                    <span className="value">{v || "—"}</span>
                  </div>
                );
              })}
              <div className="detail-actions">
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
              </div>
            </div>
          </details>
        ))}
              </div>
              <div
                className={`save-section diary-past-footer-slot${pastEntriesOverflow ? " diary-past-more" : ""}`}
                aria-hidden={!pastEntriesOverflow}
              >
                {!isLoading && pastEntriesOverflow ? (
                  <button type="button" className="btn">
                    Show more
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </div>
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
  type DbtGroup = {
    title: string;
    aside?: string;
    callouts?: string[];
    fields: { key: keyof DbtFormValues; label: string; hint?: string; multiline?: boolean }[];
  };

  const dbtGroups: DbtGroup[] = [
    {
      title: "Recognize the emotion",
      aside: "Name and allow",
      callouts: [
        "Try naming a more intense form of your emotion — not just sad, maybe distraught; not just mad, maybe appalled.",
      ],
      fields: [
        { key: "emotionName", label: "Emotion", hint: "What emotion are you feeling?" },
        {
          key: "allowAffirmation",
          label: "Affirmation",
          hint: "I can allow myself to feel this. I'm not bad because of it…",
          multiline: true,
        },
      ],
    },
    {
      title: "Watch the emotion",
      aside: "Observe without grabbing",
      callouts: [
        "Watch the emotion and see what it does. It's a wave — float with it instead of getting caught.",
      ],
      fields: [
        { key: "watchEmotion", label: "Call it what it is", hint: "Name the emotion plainly." },
        { key: "bodyLocation", label: "Where in the body", hint: "Where do you notice it?" },
        { key: "bodyFeeling", label: "Body sensation", hint: "What does it feel like physically?" },
      ],
    },
    {
      title: "Be present",
      aside: "Five senses",
      callouts: [
        "Turn attention back to now. Use your five senses, or your breath, as the anchor.",
      ],
      fields: [
        {
          key: "presentMoment",
          label: "Right now",
          hint: "What can you feel, hear, see, smell, or taste?",
          multiline: true,
        },
      ],
    },
  ];

  const {
    leftColRef,
    pastColRef,
    pastEntriesBodyRef,
    overflow: pastEntriesOverflow,
  } = useDiaryColumnCap(dbtEntries, isLoading);

  return (
    <section className="panel">
      <h1 className="panel-title">DBT Distress Tolerance</h1>
      <div className="panel-split panel-split--diary">
        <div className="panel-col" ref={leftColRef}>
          <h2 className="entries-heading">New entry</h2>
      <form className="dense-form-grid therapy-form" onSubmit={dbtForm.handleSubmit(onSubmit)}>
        <div className="core-col">
          <label className="field field-line">
            <span className="field-line-label">Date &amp; time</span>
            <input
              type="datetime-local"
              {...dbtForm.register("dateTime")}
              aria-label="Date/time"
              onClick={(e) => {
                const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
                el.showPicker?.();
              }}
            />
          </label>
          {dbtGroups.map((g) => (
            <div key={g.title} className="ds-section">
              <SectionHead title={g.title} />
              {g.callouts?.map((c, i) => (
                <p key={i} className="hint therapy-callout">{c}</p>
              ))}
              {g.fields.map((f) => (
                <label key={f.key} className="field field-line">
                  <span className="field-line-label">{f.label}</span>
                  {f.multiline ? (
                    <textarea rows={2} placeholder={f.hint} aria-label={f.label} {...dbtForm.register(f.key)} />
                  ) : (
                    <input type="text" placeholder={f.hint} aria-label={f.label} {...dbtForm.register(f.key)} />
                  )}
                </label>
              ))}
            </div>
          ))}
          <p className="hint therapy-callout">
            When the emotion comes back, that's ok. Emotions come and go — watch it again, float with the wave.
          </p>
          {editingDbt ? (
            <div className="dense-form-inline-actions">
              <button type="button" onClick={onCancelEdit}>
                Cancel edit
              </button>
            </div>
          ) : null}
        </div>
        <div className="save-section">
          <button type="submit" className={`btn btn-primary${dbtMutationState.isSuccess ? " is-success-pulse" : ""}`}>
            {dbtMutationState.isSuccess ? "\u2713 Saved" : editingDbt ? "Update entry" : "Save entry"}
          </button>
        </div>
      </form>
        </div>
        <div className="panel-col diary-past-col" ref={pastColRef}>

      {isLoading && <p className="hint">Loading DBT entries...</p>}

      <h2 className="entries-heading">Past entries</h2>
      {dbtEntries.length === 0 ? (
        <EmptyState
          title="No DBT entries yet"
          description="Work through the steps above to log your first distress-tolerance practice. Saved entries will appear here."
        />
      ) : (
        <div className="diary-past-entries-stack">
          <div className="diary-past-entries-body" ref={pastEntriesBodyRef}>
        {dbtEntries.map((entry) => (
          <details key={entry.id} className="entry-row">
            <summary>
              <span className="date">{formatEntrySummaryDate(entry.entryDate, entry.entryTime)}</span>
              <span className="pain-badge sm muted">DBT</span>
              <span className="preview">{entry.emotionName || entry.presentMoment || "—"}</span>
              <span />
              <span className="chevron" aria-hidden="true">▶</span>
            </summary>
            <div className="entry-expanded">
              <div className="detail-group">
                <span className="label">Emotion</span>
                <span className="value">{entry.emotionName || "—"}</span>
              </div>
              <div className="detail-group">
                <span className="label">Affirmation</span>
                <span className="value">{entry.allowAffirmation || "—"}</span>
              </div>
              <div className="detail-group">
                <span className="label">Watch</span>
                <span className="value">{entry.watchEmotion || "—"}</span>
              </div>
              <div className="detail-group">
                <span className="label">Body location</span>
                <span className="value">{entry.bodyLocation || "—"}</span>
              </div>
              <div className="detail-group">
                <span className="label">Body feeling</span>
                <span className="value">{entry.bodyFeeling || "—"}</span>
              </div>
              <div className="detail-group">
                <span className="label">Present moment</span>
                <span className="value">{entry.presentMoment || "—"}</span>
              </div>
              <div className="detail-actions">
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
              </div>
            </div>
          </details>
        ))}
          </div>
          <div
            className={`save-section diary-past-footer-slot${pastEntriesOverflow ? " diary-past-more" : ""}`}
            aria-hidden={!pastEntriesOverflow}
          >
            {!isLoading && pastEntriesOverflow ? (
              <button type="button" className="btn">
                Show more
              </button>
            ) : null}
          </div>
        </div>
      )}
        </div>
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
  const variantProps = {
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
  };
  return (
    <section className="panel panel--frameless">
      <h1 className="panel-title">Settings</h1>
      <SettingsVariantB {...variantProps} />
    </section>
  );
}
