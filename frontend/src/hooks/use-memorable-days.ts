import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiEnvelopeSchema, apiFetch } from "../lib";
import { memorableDayListSchema, memorableRepeatModeSchema } from "../app/core";
import type { MemorableDay, MemorableRepeatMode } from "../app/core";

type MemorableDayPayload = {
  date: string;
  title: string;
  emoji: string;
  description: string;
  repeatMode: MemorableRepeatMode;
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function matchesMemorableDate(item: MemorableDay, date: string) {
  if (date < item.date) return false;
  const [, itemMonth, itemDay] = item.date.split("-").map(Number);
  const [, dateMonth, dateDay] = date.split("-").map(Number);
  if (item.repeatMode === "one-time") return item.date === date;
  if (item.repeatMode === "monthly") return itemDay === dateDay;
  return itemMonth === dateMonth && itemDay === dateDay;
}

export function useMemorableDays(enabled: boolean) {
  const queryClient = useQueryClient();
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(todayKey());

  const memorableDaysQuery = useQuery({
    queryKey: ["memorable-days"],
    enabled,
    queryFn: async () =>
      apiFetch("/api/v1/memorable-days", { method: "GET" }, (raw) => memorableDayListSchema.parse(raw).data),
  });

  const mutationParser = (raw: unknown) => apiEnvelopeSchema(z.object({ ok: z.boolean().optional(), id: z.number().optional() })).parse(raw).data;

  const createMutation = useMutation({
    mutationFn: async (payload: MemorableDayPayload) =>
      apiFetch("/api/v1/memorable-days", { method: "POST", body: JSON.stringify(payload) }, mutationParser),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["memorable-days"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: MemorableDayPayload }) =>
      apiFetch(`/api/v1/memorable-days/${id}`, { method: "PUT", body: JSON.stringify(payload) }, mutationParser),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["memorable-days"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) =>
      apiFetch(`/api/v1/memorable-days/${id}`, { method: "DELETE" }, mutationParser),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["memorable-days"] });
    },
  });

  const items = memorableDaysQuery.data ?? [];
  const sortedItems = useMemo(
    () => [...items].sort((left, right) => left.date.localeCompare(right.date) || left.title.localeCompare(right.title)),
    [items],
  );
  const todayItems = useMemo(() => sortedItems.filter((item) => matchesMemorableDate(item, todayKey())), [sortedItems]);

  return {
    memorableDays: sortedItems,
    todayItems,
    isLoading: memorableDaysQuery.isLoading,
    visibleMonth,
    selectedDate,
    setSelectedDate,
    setVisibleMonth,
    createMemorableDay: (payload: MemorableDayPayload) => createMutation.mutateAsync(payload),
    updateMemorableDay: (id: number, payload: MemorableDayPayload) => updateMutation.mutateAsync({ id, payload }),
    deleteMemorableDay: (id: number) => deleteMutation.mutateAsync(id),
    isSaving: createMutation.isPending || updateMutation.isPending || deleteMutation.isPending,
  };
}

export const memorableDayPayloadSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().trim().min(1),
  emoji: z.string().trim().max(16).default(""),
  description: z.string().default(""),
  repeatMode: memorableRepeatModeSchema,
});
