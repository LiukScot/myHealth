import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { SectionHead, InlineFeedback, useSplitColumnHeightSync } from "./shared";
import { toDateKey, type InlineMessage, type MemorableDay } from "./core";
import { emojiCatalog, emojiCategoryLabels, type EmojiCategory, type EmojiRecord } from "./emoji-catalog";
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

type EmojiPickerScrollTopByCategory = Record<EmojiCategory, number>;

type EmojiPickerState = {
  open: boolean;
  activeCategory: EmojiCategory;
  search: string;
  recent: string[];
  scrollTopByCategory: EmojiPickerScrollTopByCategory;
};

const emojiCategoryOrder = Object.keys(emojiCategoryLabels) as EmojiCategory[];

function createEmojiPickerScrollTopByCategory(): EmojiPickerScrollTopByCategory {
  return {
    recent: 0,
    smileys: 0,
    people: 0,
    nature: 0,
    food: 0,
    travel: 0,
    objects: 0,
    symbols: 0,
    flags: 0,
  };
}

function createEmojiPickerState(): EmojiPickerState {
  return {
    open: false,
    activeCategory: "recent",
    search: "",
    recent: [],
    scrollTopByCategory: createEmojiPickerScrollTopByCategory(),
  };
}

function buildCalendarDays(month: Date, weekStart: "sunday" | "monday") {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const firstOffset = weekStart === "monday" ? (firstDay.getDay() + 6) % 7 : firstDay.getDay();
  const lastOffset = weekStart === "monday" ? (6 - ((lastDay.getDay() + 6) % 7)) : (6 - lastDay.getDay());
  const start = new Date(firstDay);
  start.setDate(start.getDate() - firstOffset);
  const end = new Date(lastDay);
  end.setDate(end.getDate() + lastOffset);
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
  const [popoverDateKey, setPopoverDateKey] = useState<string | null>(null);
  const [emojiPicker, setEmojiPicker] = useState<EmojiPickerState>(() => createEmojiPickerState());
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const emojiPickerScrollRef = useRef<HTMLDivElement | null>(null);
  const emojiPickerSearchRef = useRef<HTMLInputElement | null>(null);
  const emojiPickerWasOpenRef = useRef(false);
  const weekdayLabels = memorable.weekStart === "monday"
    ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const days = useMemo(() => buildCalendarDays(memorable.visibleMonth, memorable.weekStart), [memorable.visibleMonth, memorable.weekStart]);
  const lookups = useMemo(() => buildMemorableLookups(memorable.memorableDays), [memorable.memorableDays]);
  const emojiByValue = useMemo(() => new Map(emojiCatalog.map((record) => [record.emoji, record])), []);
  const emojiRecordsByCategory = useMemo(() => {
    const grouped = {
      smileys: [] as EmojiRecord[],
      people: [] as EmojiRecord[],
      nature: [] as EmojiRecord[],
      food: [] as EmojiRecord[],
      travel: [] as EmojiRecord[],
      objects: [] as EmojiRecord[],
      symbols: [] as EmojiRecord[],
      flags: [] as EmojiRecord[],
    };
    for (const record of emojiCatalog) {
      grouped[record.category].push(record);
    }
    return grouped;
  }, []);
  const {
    open: emojiPickerOpen,
    activeCategory: emojiPickerActiveCategory,
    search: emojiPickerSearch,
    recent: emojiPickerRecent,
    scrollTopByCategory: emojiPickerScrollTopByCategory,
  } = emojiPicker;
  const todayKey = toDateKey(new Date());
  const { leftColRef, rightColRef } = useSplitColumnHeightSync([days.length, memorable.memorableDays.length, memorable.isLoading]);
  const popoverItems = useMemo(() => {
    if (!popoverDateKey) return [];
    const [,, day] = popoverDateKey.split("-").map(Number);
    const monthDayKey = popoverDateKey.slice(5);
    return [
      ...(lookups.oneTimeByDate.get(popoverDateKey) ?? []),
      ...(lookups.monthlyByDay.get(day) ?? []),
      ...(lookups.yearlyByMonthDay.get(monthDayKey) ?? []),
    ].filter((item) => matchesMemorableDate(item, popoverDateKey));
  }, [popoverDateKey, lookups]);
  const emojiPickerRecords = useMemo(() => {
    const search = emojiPickerSearch.trim().toLowerCase();
    if (search) {
      // When searching, search the full catalog instead of just the active category
      return emojiCatalog.filter((record) => record.searchText.includes(search));
    }
    const baseRecords = emojiPickerActiveCategory === "recent"
      ? emojiPickerRecent.map((emoji) => emojiByValue.get(emoji)).filter((record): record is EmojiRecord => Boolean(record))
      : emojiRecordsByCategory[emojiPickerActiveCategory];
    return baseRecords;
  }, [emojiByValue, emojiPickerActiveCategory, emojiPickerRecent, emojiPickerSearch, emojiRecordsByCategory]);

  useEffect(() => {
    if (!draft) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !emojiPickerOpen) {
        setDraft(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [draft, emojiPickerOpen]);

  useEffect(() => {
    if (!successDateKey) return;
    const timer = window.setTimeout(() => setSuccessDateKey(null), 2500);
    return () => window.clearTimeout(timer);
  }, [successDateKey]);

  useEffect(() => {
    if (!popoverDateKey) return;
    const onMouseDown = (event: MouseEvent) => {
      if (popoverRef.current?.contains(event.target as Node)) return;
      setPopoverDateKey(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPopoverDateKey(null);
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [popoverDateKey]);

  useEffect(() => {
    if (!emojiPickerOpen) return;
    const savedScrollTop = emojiPickerScrollTopByCategory[emojiPickerActiveCategory] ?? 0;
    const wasOpen = emojiPickerWasOpenRef.current;
    emojiPickerWasOpenRef.current = true;
    const frame = window.requestAnimationFrame(() => {
      if (!wasOpen && emojiPickerSearchRef.current) {
        emojiPickerSearchRef.current.focus();
      }
      if (emojiPickerScrollRef.current) {
        emojiPickerScrollRef.current.scrollTop = savedScrollTop;
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [emojiPickerActiveCategory, emojiPickerOpen, emojiPickerScrollTopByCategory]);

  useEffect(() => {
    if (emojiPickerOpen) return;
    emojiPickerWasOpenRef.current = false;
  }, [emojiPickerOpen]);

  const rememberEmojiPickerScrollTop = useCallback(() => {
    const scroller = emojiPickerScrollRef.current;
    if (!scroller) return;
    const nextScrollTop = scroller.scrollTop;
    setEmojiPicker((current) => {
      const currentScrollTop = current.scrollTopByCategory[current.activeCategory] ?? 0;
      if (currentScrollTop === nextScrollTop) return current;
      return {
        ...current,
        scrollTopByCategory: {
          ...current.scrollTopByCategory,
          [current.activeCategory]: nextScrollTop,
        },
      };
    });
  }, []);

  const closeEmojiPicker = useCallback(() => {
    rememberEmojiPickerScrollTop();
    setEmojiPicker((current) => ({ ...current, open: false }));
  }, [rememberEmojiPickerScrollTop]);

  useEffect(() => {
    if (!emojiPickerOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      if (emojiPickerRef.current?.contains(event.target as Node)) return;
      closeEmojiPicker();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeEmojiPicker();
      }
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeEmojiPicker, emojiPickerOpen]);

  useEffect(() => {
    if (!draft?.date) return;
    const [year, month] = draft.date.split("-").map(Number);
    if (!year || !month) return;
    memorable.setVisibleMonth(new Date(year, month - 1, 1));
  }, [draft?.date, memorable]);

  const closeDraft = () => {
    setDraft(null);
    setFeedback(null);
    closeEmojiPicker();
  };

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
      closeDraft();
    } catch (error) {
      setFeedback({ tone: "error", text: getDraftErrorMessage(error) });
    }
  };

  const onDelete = async () => {
    if (!draft?.id) return;
    try {
      await memorable.deleteMemorableDay(draft.id);
      closeDraft();
    } catch (error) {
      setFeedback({ tone: "error", text: getErrorMessage(error) });
    }
  };

  const openCreate = (date: string) => {
    memorable.setSelectedDate(date);
    setFeedback(null);
    closeEmojiPicker();
    setDraft(emptyDraft(date));
  };

  const openEdit = (item: MemorableDay) => {
    memorable.setSelectedDate(item.date);
    memorable.setVisibleMonth(new Date(`${item.date}T00:00:00`));
    setFeedback(null);
    closeEmojiPicker();
    setDraft({
      id: item.id > 0 ? item.id : null,
      date: item.date,
      title: item.title,
      emoji: item.emoji,
      description: item.description,
      repeatMode: item.repeatMode,
      locked: item.locked,
    });
  };

  const openEmojiPicker = () => {
    setEmojiPicker((current) => ({ ...current, open: true }));
    emojiPickerWasOpenRef.current = false;
  };

  const selectEmoji = (record: EmojiRecord) => {
    setDraft((current) => (current ? { ...current, emoji: record.emoji } : current));
    setEmojiPicker((current) => ({
      ...current,
      recent: [record.emoji, ...current.recent.filter((emoji) => emoji !== record.emoji)].slice(0, 24),
    }));
    closeEmojiPicker();
  };

  const onListItemWheel = (event: React.WheelEvent<HTMLButtonElement>) => {
    const list = event.currentTarget.closest(".memorable-list");
    if (!(list instanceof HTMLElement)) return;
    if (list.scrollHeight <= list.clientHeight + 1) return;
    const newScrollTop = Math.max(0, Math.min(list.scrollTop + event.deltaY, list.scrollHeight - list.clientHeight));
    if (newScrollTop !== list.scrollTop) {
      list.scrollTop = newScrollTop;
      event.preventDefault();
    }
  };

  return (
    <section className="panel panel--memorable">
      <div className="memorable-header">
        <div>
          <h1 className="panel-title">Memorable days</h1>
          <SectionHead title="Calendar" />
        </div>
      </div>
      <button type="button" className="btn btn-primary memorable-add-btn" onClick={() => openCreate(toDateKey(new Date()))}>Add new</button>
      {feedback?.tone === "error" ? <InlineFeedback message={feedback} /> : null}

      <div className="panel-split memorable-layout">
        <section ref={leftColRef} className="panel-col memorable-calendar-panel">
          <div className="memorable-calendar-head">
            <button type="button" className="btn memorable-month-nav" onClick={() => memorable.setVisibleMonth(new Date(memorable.visibleMonth.getFullYear(), memorable.visibleMonth.getMonth() - 1, 1))}>
              Prev
            </button>
            <button
              type="button"
              className="btn memorable-month-label"
              onClick={() => memorable.setVisibleMonth(new Date())}
              aria-label="Go to current month"
            >
              {new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long", year: "numeric" }).format(new Date())}
            </button>
            <button type="button" className="btn memorable-month-nav" onClick={() => memorable.setVisibleMonth(new Date(memorable.visibleMonth.getFullYear(), memorable.visibleMonth.getMonth() + 1, 1))}>
              Next
            </button>
          </div>
          <div className="memorable-weekdays">
            {weekdayLabels.map((label) => <span key={label}>{label}</span>)}
          </div>
          <div className="memorable-calendar-grid">
            {days.map((day) => {
              const dayKey = toDateKey(day);
              const monthMatch = day.getMonth() === memorable.visibleMonth.getMonth();
              const isToday = dayKey === todayKey;
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
                  onClick={(event) => {
                    if ((event.target as Element).closest("button")) return;
                    memorable.setSelectedDate(dayKey);
                    if (items.length > 0) setPopoverDateKey(popoverDateKey === dayKey ? null : dayKey);
                    else openCreate(dayKey);
                  }}
                >
                  <span className="memorable-day-top">
                    <button
                      type="button"
                      className="memorable-day-number"
                      aria-label={items.length > 0 ? `View events on ${dayKey}` : `${day.getDate()}`}
                      onClick={() => {
                        memorable.setSelectedDate(dayKey);
                        if (items.length > 0) setPopoverDateKey(popoverDateKey === dayKey ? null : dayKey);
                      }}
                    >
                      {day.getDate()}
                    </button>
                  </span>
                  <span className="memorable-day-markers">
                    {items.slice(0, 2).map((item) => (
                      <span key={`${item.source}-${item.id}-${item.date}`} className="memorable-day-marker">
                        {item.emoji || "•"} {item.title}
                      </span>
                    ))}
                    {items.length > 2 ? (
                      <span className="memorable-day-overflow">+{items.length - 2} more</span>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section ref={rightColRef} className="panel-col memorable-list-panel">
          <h2 className="entries-heading">All memorable days</h2>
          {memorable.isLoading ? (
            <p className="hint">Loading memorable days...</p>
          ) : memorable.memorableDays.length === 0 ? (
            <div className="empty-state">
              <p className="empty-state-title">No memorable days yet</p>
              <p className="empty-state-copy">Add one birthday, anniversary, or event to start the list.</p>
            </div>
          ) : (
            <div className="memorable-list">
              {[...memorable.memorableDays]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((item) => (
                <button
                  type="button"
                  key={`${item.source}-${item.id}-${item.date}`}
                  className="memorable-list-item"
                  onWheelCapture={onListItemWheel}
                  onClick={() => openEdit(item)}
                >
                  <span className="memorable-list-emoji">{item.emoji || "✨"}</span>
                  <span className="memorable-list-body">
                    <span className="memorable-list-topline">
                      <strong>{item.title}</strong>
                      <span className="memorable-list-date">{item.date}</span>
                    </span>
                    <span className="memorable-list-meta">{item.locked ? "Locked from Settings" : item.repeatMode}</span>
                  </span>
                </button>
                ))}
            </div>
          )}
        </section>
      </div>

      {draft ? (
        <div className="memorable-modal-backdrop" role="presentation" onClick={closeDraft}>
          <div className="memorable-modal" role="dialog" aria-modal="true" aria-label={draft.id ? "Edit memorable day" : "Add memorable day"} onClick={(event) => event.stopPropagation()}>
            <SectionHead title={draft.id ? "Edit memorable day" : "Add memorable day"} />
            <div className="memorable-modal-top-row">
              <label className="field field-line">
                <span className="field-line-label">Date</span>
                <input type="date" value={draft.date} onChange={(event) => setDraft((current) => current ? { ...current, date: event.target.value } : current)} />
              </label>
              <label className="field field-line memorable-emoji-field">
                <span className="field-line-label">Emoji</span>
                <div ref={emojiPickerRef} className="memorable-emoji-picker">
                  <button
                    type="button"
                    className="btn memorable-emoji-picker-trigger"
                    aria-label={`Emoji ${draft.emoji || "✨"}`}
                    aria-haspopup="dialog"
                    aria-expanded={emojiPickerOpen}
                    aria-controls="emoji-picker-panel"
                    onClick={() => {
                      if (emojiPickerOpen) {
                        closeEmojiPicker();
                        return;
                      }
                      openEmojiPicker();
                    }}
                  >
                    <span aria-hidden="true" className="memorable-emoji-picker-trigger-emoji">
                      {draft.emoji || "✨"}
                    </span>
                  </button>

                  {emojiPickerOpen ? (
                    <div
                      id="emoji-picker-panel"
                      role="dialog"
                      aria-label="Emoji picker"
                      className="memorable-emoji-picker-panel"
                      onMouseDown={(event) => event.stopPropagation()}
                    >
                      <label className="field field-line memorable-emoji-picker-search">
                        <span className="field-line-label">Search emoji</span>
                        <input
                          ref={emojiPickerSearchRef}
                          className="memorable-emoji-picker-search-input"
                          type="search"
                          value={emojiPickerSearch}
                          onChange={(event) => setEmojiPicker((current) => ({ ...current, search: event.target.value }))}
                          placeholder="Search emoji"
                        />
                      </label>

                      <div role="tablist" aria-label="Emoji categories" className="memorable-emoji-picker-tabs">
                        {emojiCategoryOrder.map((category) => {
                          const isActive = emojiPickerActiveCategory === category;
                          const label = emojiCategoryLabels[category];
                          return (
                            <button
                              key={category}
                              type="button"
                              role="tab"
                              aria-selected={isActive}
                              className={`memorable-emoji-picker-tab${isActive ? " is-active" : ""}`}
                              onClick={() => {
                                rememberEmojiPickerScrollTop();
                                setEmojiPicker((current) => ({ ...current, activeCategory: category }));
                              }}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>

                      <div
                        ref={emojiPickerScrollRef}
                        className="memorable-emoji-picker-scroll"
                      >
                        {emojiPickerRecords.length > 0 ? (
                          <div className="memorable-emoji-picker-grid">
                            {emojiPickerRecords.map((record) => {
                              const isSelected = draft.emoji === record.emoji;
                              return (
                                <button
                                  key={record.emoji}
                                  type="button"
                                  aria-label={record.name}
                                  aria-pressed={isSelected}
                                  className={`memorable-emoji-picker-emoji${isSelected ? " is-selected" : ""}`}
                                  onClick={() => selectEmoji(record)}
                                >
                                  {record.emoji}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="hint memorable-emoji-picker-empty">
                            No emoji match.
                          </p>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </label>
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
              <button type="button" className="btn memorable-modal-cancel" onClick={closeDraft}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {popoverDateKey ? (
        <div className="memorable-modal-backdrop" role="presentation" onClick={() => setPopoverDateKey(null)}>
          <div ref={popoverRef} className="memorable-modal" role="dialog" aria-modal="true" aria-label={`Events on ${popoverDateKey}`} onClick={(event) => event.stopPropagation()}>
            <SectionHead title={popoverDateKey} />
            <div className="memorable-day-popover-list">
              {popoverItems.map((item) => (
                <button
                  key={`${item.source}-${item.id}-${item.date}`}
                  type="button"
                  className="memorable-day-popover-item"
                  onClick={() => {
                    setPopoverDateKey(null);
                    openEdit(item);
                  }}
                >
                  <span className="memorable-day-popover-emoji">{item.emoji || "✨"}</span>
                  <span className="memorable-day-popover-body">
                    <strong>{item.title}</strong>
                    <span className="memorable-list-meta">{item.repeatMode}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="memorable-modal-actions">
              <button type="button" className="btn btn-primary" onClick={() => { setPopoverDateKey(null); openCreate(popoverDateKey); }}>
                Add new
              </button>
              <button type="button" className="btn memorable-modal-cancel" onClick={() => setPopoverDateKey(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
