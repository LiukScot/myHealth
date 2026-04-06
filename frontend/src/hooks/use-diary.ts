import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiEnvelopeSchema, apiFetch, splitDateTime, toLocalDateTimeValue } from "../lib";
import {
  diaryFormSchema,
  diaryListSchema,
  moodOptionsSchema,
} from "../app/core";
import type { DiaryEntry, DiaryFormValues } from "../app/core";

const EMPTY_MOOD_OPTIONS = {
  positive_moods: [] as string[],
  negative_moods: [] as string[],
  general_moods: [] as string[],
};

export function useDiary(enabled: boolean) {
  const queryClient = useQueryClient();
  const [editingDiary, setEditingDiary] = useState<DiaryEntry | null>(null);
  const [confirmDeleteDiary, setConfirmDeleteDiary] = useState<number | null>(null);

  const diaryQuery = useQuery({
    queryKey: ["diary"],
    enabled,
    queryFn: async () => apiFetch("/api/v1/diary", { method: "GET" }, (raw) => diaryListSchema.parse(raw).data),
  });

  const moodOptionsQuery = useQuery({
    queryKey: ["mood-options"],
    enabled,
    queryFn: async () => apiFetch("/api/v1/mood/options", { method: "GET" }, (raw) => moodOptionsSchema.parse(raw).data),
  });

  const moodFieldOptions = moodOptionsQuery.data ?? EMPTY_MOOD_OPTIONS;

  const diaryForm = useForm<DiaryFormValues>({
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

  const diaryDeleteMutation = useMutation({
    mutationFn: async (id: number) =>
      apiFetch(`/api/v1/diary/${id}`, { method: "DELETE" }, (raw) =>
        apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["diary"] });
    },
  });

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

  return {
    diaryEntries: diaryQuery.data ?? [],
    moodFieldOptions,
    diaryForm,
    diaryMutation,
    editingDiary,
    confirmDeleteDiary,
    resetDiaryForm,
    startDiaryEdit,
    onDeleteClick: (id: number) => {
      if (confirmDeleteDiary === id) {
        diaryDeleteMutation.mutate(id);
        setConfirmDeleteDiary(null);
      } else {
        setConfirmDeleteDiary(id);
      }
    },
    onDeleteBlur: () => setConfirmDeleteDiary(null),
  };
}
