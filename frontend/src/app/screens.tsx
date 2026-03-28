import { type CSSProperties } from "react";
import type { ChartData, ChartOptions } from "chart.js";
import { type UseFormReturn } from "react-hook-form";
import { Chart as ChartJS, TimeScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from "chart.js";
import "chartjs-adapter-date-fns";
import { Line } from "react-chartjs-2";
import type { DashboardQuickRange, DiaryEntry, DiaryFormValues, InlineMessage, PainEntry, PainFormValues, WellbeingSeries, WellbeingSeriesKey } from "./core";
import {
  AiKeyEditor,
  ChatComposer,
  InlineFeedback,
  MultiSelectField,
  PreferencesEditor,
} from "./shared";
import {
  calcDeltaPercent,
  dashboardQuickRanges,
  formatDelta,
  getDeltaStyle,
} from "./core";

ChartJS.register(TimeScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

type WellbeingChartView = {
  hasAnyData: boolean;
  hasVisibleData: boolean;
  data: ChartData<"line", { x: string; y: number }[], string>;
  options: ChartOptions<"line">;
};

export function DashboardSection({
  dashboardFrom,
  dashboardTo,
  activeQuickRange,
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
      <h2>Dashboard</h2>

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
          <p className="hint">{wellbeingChart.hasAnyData ? "Toggle on a metric to see it." : "No data yet"}</p>
        )}
      </div>
    </section>
  );
}

export function DiarySection({
  diaryForm,
  diaryMutationState,
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
  return (
    <section className="panel">
      <h2>Diary</h2>
      <form className="form-grid" onSubmit={diaryForm.handleSubmit(onSubmit)}>
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
        <div className="mood-tags-grid">
          <MultiSelectField
            label="Positive"
            fieldKey="positive_moods"
            value={diaryForm.watch("positiveMoods")}
            options={moodFieldOptions.positive_moods}
            onChange={(next) => diaryForm.setValue("positiveMoods", next, { shouldDirty: true })}
            domain="mood"
          />
          <MultiSelectField
            label="Negative"
            fieldKey="negative_moods"
            value={diaryForm.watch("negativeMoods")}
            options={moodFieldOptions.negative_moods}
            onChange={(next) => diaryForm.setValue("negativeMoods", next, { shouldDirty: true })}
            domain="mood"
          />
          <MultiSelectField
            label="General"
            fieldKey="general_moods"
            value={diaryForm.watch("generalMoods")}
            options={moodFieldOptions.general_moods}
            onChange={(next) => diaryForm.setValue("generalMoods", next, { shouldDirty: true })}
            domain="mood"
          />
        </div>
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
          <button type="submit" className={diaryMutationState.isSuccess ? "btn-check" : ""}>
            {diaryMutationState.isSuccess ? "\u2713" : editingDiary ? "Update entry" : "Add entry"}
          </button>
          {editingDiary && (
            <button type="button" onClick={onCancelEdit}>
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
              <th>Positive</th>
              <th>Negative</th>
              <th>General</th>
              <th>Description</th>
              <th>Gratitude</th>
              <th>Reflection</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {diaryEntries.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.entryDate}</td>
                <td>{entry.entryTime}</td>
                <td>{entry.moodLevel ?? "-"}</td>
                <td>{entry.depressionLevel ?? "-"}</td>
                <td>{entry.anxietyLevel ?? "-"}</td>
                <td>{entry.positiveMoods || "-"}</td>
                <td>{entry.negativeMoods || "-"}</td>
                <td>{entry.generalMoods || "-"}</td>
                <td>{entry.description || "-"}</td>
                <td>{entry.gratitude || "-"}</td>
                <td>{entry.reflection || "-"}</td>
                <td>
                  <button onClick={() => onStartEdit(entry)}>Edit</button>
                  <button
                    className={confirmDeleteDiary === entry.id ? "btn-delete-confirm" : ""}
                    onClick={() => onDeleteClick(entry.id)}
                    onBlur={onDeleteBlur}
                  >
                    {confirmDeleteDiary === entry.id ? "Delete?" : "Delete"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function PainSection({
  painForm,
  painMutationState,
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
  return (
    <section className="panel">
      <h2>Pain</h2>
      <form className="stack pain-form" onSubmit={painForm.handleSubmit(onSubmit)}>
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
          <MultiSelectField label="Area" fieldKey="area" value={watchedValues.area} options={painFieldOptions.area} onChange={(next) => painForm.setValue("area", next, { shouldDirty: true })} />
          <MultiSelectField label="Symptoms" fieldKey="symptoms" value={watchedValues.symptoms} options={painFieldOptions.symptoms} onChange={(next) => painForm.setValue("symptoms", next, { shouldDirty: true })} />
          <MultiSelectField label="Activities" fieldKey="activities" value={watchedValues.activities} options={painFieldOptions.activities} onChange={(next) => painForm.setValue("activities", next, { shouldDirty: true })} />
          <MultiSelectField label="Medicines" fieldKey="medicines" value={watchedValues.medicines} options={painFieldOptions.medicines} onChange={(next) => painForm.setValue("medicines", next, { shouldDirty: true })} />
          <MultiSelectField label="Habits" fieldKey="habits" value={watchedValues.habits} options={painFieldOptions.habits} onChange={(next) => painForm.setValue("habits", next, { shouldDirty: true })} />
          <MultiSelectField label="Other" fieldKey="other" value={watchedValues.other} options={painFieldOptions.other} onChange={(next) => painForm.setValue("other", next, { shouldDirty: true })} />
        </div>

        <label className="pain-note-field">
          Notes
          <textarea {...painForm.register("note")} />
        </label>

        <div className="row-actions">
          <button type="submit" className={painMutationState.isSuccess ? "btn-check" : ""}>
            {painMutationState.isSuccess ? "\u2713" : editingPain ? "Update entry" : "Add entry"}
          </button>
          {editingPain && (
            <button type="button" onClick={onCancelEdit}>
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
            {painEntries.map((entry) => (
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
                  <button onClick={() => onStartEdit(entry)}>Edit</button>
                  <button
                    className={confirmDeletePain === entry.id ? "btn-delete-confirm" : ""}
                    onClick={() => onDeleteClick(entry.id)}
                    onBlur={onDeleteBlur}
                  >
                    {confirmDeletePain === entry.id ? "Delete?" : "Delete"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ChatSection({
  defaultModel,
  defaultRange,
  chatStatus,
  chatReply,
  onSend,
}: {
  defaultModel: string;
  defaultRange: string;
  chatStatus: string;
  chatReply: string;
  onSend: (message: string, model: string, range: string) => Promise<void>;
}) {
  return (
    <section className="panel">
      <h2>Chatbot</h2>
      <ChatComposer defaultModel={defaultModel} defaultRange={defaultRange} onSend={onSend} />
      {chatStatus && <p className="hint">{chatStatus}</p>}
      {chatReply && <article className="chat-output">{chatReply}</article>}
    </section>
  );
}

export function SettingsSection({
  aiKeyHasKey,
  aiKeyFeedback,
  aiKeySaving,
  aiKeyClearing,
  onAiKeyFeedbackClear,
  onAiKeySave,
  onAiKeyClear,
  purgeConfirmArmed,
  purgePending,
  purgeError,
  onPurgeArm,
  onPurgeConfirm,
  onPurgeCancel,
  prefsValue,
  onSavePrefs,
  onExportJson,
  onImportJson,
  onExportXlsx,
  onImportXlsx,
  backupFeedback,
}: {
  aiKeyHasKey: boolean;
  aiKeyFeedback: InlineMessage | null;
  aiKeySaving: boolean;
  aiKeyClearing: boolean;
  onAiKeyFeedbackClear: () => void;
  onAiKeySave: (key: string) => boolean;
  onAiKeyClear: () => void;
  purgeConfirmArmed: boolean;
  purgePending: boolean;
  purgeError: InlineMessage | null;
  onPurgeArm: () => void;
  onPurgeConfirm: () => void;
  onPurgeCancel: () => void;
  prefsValue: { model: string; chatRange: string; lastRange: string; graphSelection: Record<string, unknown> };
  onSavePrefs: (value: { model: string; chatRange: string; lastRange: string; graphSelection: Record<string, unknown> }) => void;
  onExportJson: () => void;
  onImportJson: (file: File) => void;
  onExportXlsx: () => void;
  onImportXlsx: (file: File) => void;
  backupFeedback: InlineMessage | null;
}) {
  return (
    <section className="panel">
      <h2>Settings</h2>
      <div className="settings-grid">
        <div className="settings-column">
          <article>
            <h3>AI key</h3>
            <AiKeyEditor
              hasKey={aiKeyHasKey}
              feedback={aiKeyFeedback}
              isSaving={aiKeySaving}
              isClearing={aiKeyClearing}
              onFeedbackClear={onAiKeyFeedbackClear}
              onSave={onAiKeySave}
              onClear={onAiKeyClear}
            />
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
          <h3>Preferences</h3>
          <PreferencesEditor
            key={`${prefsValue.model}:${prefsValue.chatRange}:${prefsValue.lastRange}`}
            value={prefsValue}
            onSave={onSavePrefs}
          />
        </article>
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
      </div>
    </section>
  );
}
