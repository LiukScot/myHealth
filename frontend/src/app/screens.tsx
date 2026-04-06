import { type CSSProperties } from "react";
import type { ChartData, ChartOptions } from "chart.js";
import { type UseFormReturn } from "react-hook-form";
import { Chart as ChartJS, TimeScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from "chart.js";
import "chartjs-adapter-date-fns";
import { Line } from "react-chartjs-2";
import type { CbtEntry, CbtFormValues, DashboardQuickRange, DbtEntry, DbtFormValues, DiaryEntry, DiaryFormValues, InlineMessage, PainEntry, PainFormValues, WellbeingSeries, WellbeingSeriesKey } from "./core";
import { getErrorMessage } from "../lib";
import type { useAuth } from "../hooks/use-auth";
import {
  InlineFeedback,
  MultiSelectField,
  PreferencesEditor,
} from "./shared";
import { McpAccessSection } from "./McpAccessSection";
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
      <h1 className="panel-title">Diary</h1>
      <form className="form-grid" onSubmit={diaryForm.handleSubmit(onSubmit)}>
        <label>
          <span className="section-heading">Date/time</span>
          <input type="datetime-local" {...diaryForm.register("dateTime")} />
        </label>
        <label>
          <span className="section-heading">Mood (1-9)</span>
          <input type="number" min={1} max={9} step={0.1} {...diaryForm.register("moodLevel", { valueAsNumber: true })} />
        </label>
        <label>
          <span className="section-heading">Depression (1-9)</span>
          <input type="number" min={1} max={9} {...diaryForm.register("depressionLevel", { valueAsNumber: true })} />
        </label>
        <label>
          <span className="section-heading">Anxiety (1-9)</span>
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
          <span className="section-heading">Description</span>
          <input type="text" {...diaryForm.register("description")} />
        </label>
        <label>
          <span className="section-heading">Gratitude</span>
          <input type="text" {...diaryForm.register("gratitude")} />
        </label>
        <label>
          <span className="section-heading">Reflection</span>
          <input type="text" {...diaryForm.register("reflection")} />
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
      <h1 className="panel-title">Pain</h1>
      <form className="stack pain-form" onSubmit={painForm.handleSubmit(onSubmit)}>
        <div className="pain-core-grid">
          <label>
            <span className="section-heading">Date/time</span>
            <input type="datetime-local" {...painForm.register("dateTime")} />
          </label>
          <label>
            <span className="section-heading">Pain (1-9)</span>
            <input type="number" min={1} max={9} {...painForm.register("painLevel", { valueAsNumber: true })} />
          </label>
          <label>
            <span className="section-heading">Fatigue (1-9)</span>
            <input type="number" min={1} max={9} {...painForm.register("fatigueLevel", { valueAsNumber: true })} />
          </label>
          <label>
            <span className="section-heading">Coffee</span>
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
          <span className="section-heading">Notes</span>
          <input type="text" {...painForm.register("note")} />
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

export function CbtSection({
  cbtForm,
  cbtMutationState,
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
            {cbtEntries.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.entryDate}</td>
                <td>{entry.entryTime}</td>
                <td>{entry.situation || "-"}</td>
                <td>{entry.mainUnhelpfulThought || "-"}</td>
                <td>{entry.productiveResponse || "-"}</td>
                <td>
                  <button onClick={() => onStartEdit(entry)}>Edit</button>
                  <button
                    className={confirmDeleteCbt === entry.id ? "btn-delete-confirm" : ""}
                    onClick={() => onDeleteClick(entry.id)}
                    onBlur={onDeleteBlur}
                  >
                    {confirmDeleteCbt === entry.id ? "Delete?" : "Delete"}
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

export function DbtSection({
  dbtForm,
  dbtMutationState,
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
            {dbtEntries.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.entryDate}</td>
                <td>{entry.entryTime}</td>
                <td>{entry.emotionName || "-"}</td>
                <td>{entry.bodyLocation || "-"}</td>
                <td>{entry.presentMoment || "-"}</td>
                <td>
                  <button onClick={() => onStartEdit(entry)}>Edit</button>
                  <button
                    className={confirmDeleteDbt === entry.id ? "btn-delete-confirm" : ""}
                    onClick={() => onDeleteClick(entry.id)}
                    onBlur={onDeleteBlur}
                  >
                    {confirmDeleteDbt === entry.id ? "Delete?" : "Delete"}
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

export function SettingsSection({
  auth,
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
  auth: ReturnType<typeof useAuth>;
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
        <McpAccessSection enabled />
      </div>
    </section>
  );
}
