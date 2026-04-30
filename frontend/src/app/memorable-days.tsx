import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { SectionHead, InlineFeedback, useSplitColumnHeightSync } from "./shared";
import { formatMonthLabel, toDateKey, type InlineMessage, type MemorableDay } from "./core";
import { getErrorMessage } from "../lib";
import { memorableDayPayloadSchema, matchesMemorableDate, type useMemorableDays } from "../hooks/use-memorable-days";

type Props = {
  memorable: ReturnType<typeof useMemorableDays>;
};

type DraftState = {
  id: number | null;
  date: string;
  title: string;
  emoji: string;
  description: string;
  repeatMode: "one-time" | "monthly" | "yearly";
  locked: boolean;
};

type MemorableLookups = {
  oneTimeByDate: Map<string, MemorableDay[]>;
  monthlyByDay: Map<number, MemorableDay[]>;
  yearlyByMonthDay: Map<string, MemorableDay[]>;
};

function buildCalendarDays(month: Date) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const start = new Date(firstDay);
  start.setDate(start.getDate() - firstDay.getDay());
  const end = new Date(lastDay);
  end.setDate(end.getDate() + (6 - end.getDay()));
  const dayCount = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  return Array.from({ length: dayCount }, (_, index) => {
    const value = new Date(start);
    value.setDate(start.getDate() + index);
    return value;
  });
}

function emptyDraft(date: string): DraftState {
  return { id: null, date, title: "", emoji: "", description: "", repeatMode: "one-time", locked: false };
}

function getDraftErrorMessage(error: unknown) {
  if (error instanceof z.ZodError) {
    const titleIssue = error.issues.find((issue) => issue.path[0] === "title");
    if (titleIssue) return "Title is required.";
    const dateIssue = error.issues.find((issue) => issue.path[0] === "date");
    if (dateIssue) return "Date is invalid.";
    return "Check the form fields and try again.";
  }
  return getErrorMessage(error);
}

function buildMemorableLookups(items: MemorableDay[]): MemorableLookups {
  const oneTimeByDate = new Map<string, MemorableDay[]>();
  const monthlyByDay = new Map<number, MemorableDay[]>();
  const yearlyByMonthDay = new Map<string, MemorableDay[]>();

  for (const item of items) {
    const [, month, day] = item.date.split("-").map(Number);
    if (item.repeatMode === "one-time") {
      oneTimeByDate.set(item.date, [...(oneTimeByDate.get(item.date) ?? []), item]);
      continue;
    }
    if (item.repeatMode === "monthly") {
      monthlyByDay.set(day, [...(monthlyByDay.get(day) ?? []), item]);
      continue;
    }
    const monthDayKey = `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    yearlyByMonthDay.set(monthDayKey, [...(yearlyByMonthDay.get(monthDayKey) ?? []), item]);
  }

  return { oneTimeByDate, monthlyByDay, yearlyByMonthDay };
}

export function MemorableDaysSection({ memorable }: Props) {
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [feedback, setFeedback] = useState<InlineMessage | null>(null);
  const [successDateKey, setSuccessDateKey] = useState<string | null>(null);
  const days = useMemo(() => buildCalendarDays(memorable.visibleMonth), [memorable.visibleMonth]);
  const lookups = useMemo(() => buildMemorableLookups(memorable.memorableDays), [memorable.memorableDays]);
  const todayKey = toDateKey(new Date());
  const { leftColRef, rightColRef } = useSplitColumnHeightSync([days.length, memorable.memorableDays.length, memorable.isLoading]);

  useEffect(() => {
    if (!draft) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDraft(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [draft]);

  useEffect(() => {
    if (!successDateKey) return;
    const timer = window.setTimeout(() => setSuccessDateKey(null), 2500);
    return () => window.clearTimeout(timer);
  }, [successDateKey]);

  useEffect(() => {
    if (!draft?.date) return;
    const [year, month] = draft.date.split("-").map(Number);
    if (!year || !month) return;
    memorable.setVisibleMonth(new Date(year, month - 1, 1));
  }, [draft?.date]);

  const onSave = async () => {
    if (!draft) return;
    try {
      const payload = memorableDayPayloadSchema.parse({
        date: draft.date,
        title: draft.title,
        emoji: draft.emoji,
        description: draft.description,
        repeatMode: draft.repeatMode,
      });
      if (draft.id) await memorable.updateMemorableDay(draft.id, payload);
      else await memorable.createMemorableDay(payload);
      setSuccessDateKey(draft.date);
      setFeedback(null);
      setDraft(null);
    } catch (error) {
      setFeedback({ tone: "error", text: getDraftErrorMessage(error) });
    }
  };

  const onDelete = async () => {
    if (!draft?.id) return;
    try {
      await memorable.deleteMemorableDay(draft.id);
      setDraft(null);
    } catch (error) {
      setFeedback({ tone: "error", text: getErrorMessage(error) });
    }
  };

  const openCreate = (date: string) => {
    memorable.setSelectedDate(date);
    setDraft(emptyDraft(date));
  };

  const openEdit = (item: MemorableDay) => {
    memorable.setSelectedDate(item.date);
    memorable.setVisibleMonth(new Date(`${item.date}T00:00:00`));
    setDraft({
      id: item.id > 0 ? item.id : null,
      date: item.date,
      title: item.title,
      emoji: item.emoji,
      description: item.description,
      repeatMode: item.repeatMode,
      locked: item.locked,
    });
    setFeedback(null);
  };

  return (
    <section className="panel panel--memorable">
      <div className="memorable-header">
        <div>
          <h1 className="panel-title">Memorable days</h1>
        </div>
      </div>
      {feedback?.tone === "error" ? <InlineFeedback message={feedback} /> : null}

      <div className="panel-split memorable-layout">
        <section ref={leftColRef} className="panel-col memorable-calendar-panel">
          <div className="memorable-calendar-head">
            <button type="button" className="btn memorable-month-nav" onClick={() => memorable.setVisibleMonth(new Date(memorable.visibleMonth.getFullYear(), memorable.visibleMonth.getMonth() - 1, 1))}>
              Prev
            </button>
            <SectionHead title={formatMonthLabel(memorable.visibleMonth)} />
            <button type="button" className="btn memorable-month-nav" onClick={() => memorable.setVisibleMonth(new Date(memorable.visibleMonth.getFullYear(), memorable.visibleMonth.getMonth() + 1, 1))}>
              Next
            </button>
          </div>
          <div className="memorable-weekdays">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => <span key={label}>{label}</span>)}
          </div>
          <div className="memorable-calendar-grid">
            {days.map((day) => {
              const dayKey = toDateKey(day);
              const monthMatch = day.getMonth() === memorable.visibleMonth.getMonth();
              const isToday = dayKey === todayKey;
              const showSuccess = successDateKey === dayKey;
              const monthDayKey = dayKey.slice(5);
              const items = [
                ...(lookups.oneTimeByDate.get(dayKey) ?? []),
                ...(lookups.monthlyByDay.get(day.getDate()) ?? []),
                ...(lookups.yearlyByMonthDay.get(monthDayKey) ?? []),
              ].filter((item) => matchesMemorableDate(item, dayKey));
              return (
                <div
                  key={dayKey}
                  className={`memorable-day-cell${monthMatch ? "" : " is-outside"}${isToday ? " is-today" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    memorable.setSelectedDate(dayKey);
                    if (items[0]) openEdit(items[0]);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      memorable.setSelectedDate(dayKey);
                      if (items[0]) openEdit(items[0]);
                    }
                  }}
                >
                  <span className="memorable-day-top">
                    <span>{day.getDate()}</span>
                    <span
                      className={`memorable-day-add${showSuccess ? " is-success" : ""}`}
                      role="button"
                      tabIndex={0}
                      aria-label={`Add memorable day on ${dayKey}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        openCreate(dayKey);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          event.stopPropagation();
                          openCreate(dayKey);
                        }
                      }}
                    >
                      {showSuccess ? "✓" : "+"}
                    </span>
                  </span>
                  <span className="memorable-day-markers">
                    {items.slice(0, 3).map((item) => (
                      <span key={`${item.source}-${item.id}-${item.date}`} className="memorable-day-marker">
                        {item.emoji || "•"} {item.title}
                      </span>
                    ))}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section ref={rightColRef} className="panel-col memorable-list-panel">
          <SectionHead title="All memorable days" />
          {memorable.isLoading ? (
            <p className="hint">Loading memorable days...</p>
          ) : memorable.memorableDays.length === 0 ? (
            <div className="empty-state">
              <p className="empty-state-title">No memorable days yet</p>
              <p className="empty-state-copy">Add one birthday, anniversary, or event to start the list.</p>
            </div>
          ) : (
            <div className="memorable-list">
              {memorable.memorableDays.map((item) => (
                <button
                  type="button"
                  key={`${item.source}-${item.id}-${item.date}`}
                  className="memorable-list-item"
                  onClick={() => openEdit(item)}
                >
                  <span className="memorable-list-emoji">{item.emoji || "✨"}</span>
                  <span className="memorable-list-body">
                    <strong>{item.title}</strong>
                    <span>{item.date}</span>
                    <span>{item.locked ? "Locked from Settings" : item.repeatMode}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      <button type="button" className="memorable-fab" aria-label="Add memorable day" onClick={() => openCreate(toDateKey(new Date()))}>
        +
      </button>

      {draft ? (
        <div className="memorable-modal-backdrop" role="presentation" onClick={() => setDraft(null)}>
          <div className="memorable-modal" role="dialog" aria-modal="true" aria-label={draft.id ? "Edit memorable day" : "Add memorable day"} onClick={(event) => event.stopPropagation()}>
            <SectionHead title={draft.id ? "Edit memorable day" : "Add memorable day"} />
            <div className="memorable-modal-top-row">
              <label className="field field-line">
                <span className="field-line-label">Date</span>
                <input type="date" value={draft.date} onChange={(event) => setDraft((current) => current ? { ...current, date: event.target.value } : current)} />
              </label>
              <div className="field field-line memorable-emoji-field">
                <span className="field-line-label">Emoji</span>
                <input
                  type="text"
                  inputMode="text"
                  maxLength={8}
                  aria-label="Emoji"
                  placeholder="✨"
                  value={draft.emoji}
                  onChange={(event) => setDraft((current) => current ? { ...current, emoji: event.target.value } : current)}
                />
              </div>
            </div>
            <label className="field field-line">
              <span className="field-line-label">Title</span>
              <input type="text" value={draft.title} onChange={(event) => setDraft((current) => current ? { ...current, title: event.target.value } : current)} />
            </label>
            <label className="field field-line">
              <span className="field-line-label">Description</span>
              <textarea rows={3} value={draft.description} onChange={(event) => setDraft((current) => current ? { ...current, description: event.target.value } : current)} />
            </label>
            <label className="field field-line">
              <span className="field-line-label">Repeat</span>
              <select value={draft.repeatMode} onChange={(event) => setDraft((current) => current ? { ...current, repeatMode: event.target.value as DraftState["repeatMode"] } : current)} disabled={draft.locked}>
                <option value="one-time">One-time</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </label>
            {draft.locked ? <p className="hint">Edit birthday in Settings. Same truth, less duplication.</p> : null}
            <div className="memorable-modal-actions">
              <button type="button" className="btn btn-primary" onClick={() => void onSave()} disabled={memorable.isSaving || draft.locked}>
                Save
              </button>
              {draft.id && !draft.locked ? (
                <button type="button" className="btn btn-danger" onClick={() => void onDelete()} disabled={memorable.isSaving}>
                  Delete
                </button>
              ) : null}
              <button type="button" className="btn memorable-modal-cancel" onClick={() => setDraft(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
