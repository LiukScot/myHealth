import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8)
});

export const diarySchema = z.object({
  entryDate: z.string().min(1),
  entryTime: z.string().min(1),
  moodLevel: z.number().min(1).max(9).nullable().optional(),
  depressionLevel: z.number().min(1).max(9).nullable().optional(),
  anxietyLevel: z.number().min(1).max(9).nullable().optional(),
  positiveMoods: z.string().optional().default(""),
  negativeMoods: z.string().optional().default(""),
  generalMoods: z.string().optional().default(""),
  description: z.string().optional().default(""),
  gratitude: z.string().optional().default(""),
  reflection: z.string().optional().default("")
});

export const painValueSchema = z.union([z.string(), z.array(z.string())]).optional();

export const painSchema = z.object({
  entryDate: z.string().min(1),
  entryTime: z.string().min(1),
  painLevel: z.number().int().min(1).max(9).nullable().optional(),
  fatigueLevel: z.number().int().min(1).max(9).nullable().optional(),
  coffeeCount: z.number().int().min(0).max(50).nullable().optional(),
  area: painValueSchema,
  symptoms: painValueSchema,
  activities: painValueSchema,
  medicines: painValueSchema,
  habits: painValueSchema,
  other: painValueSchema,
  note: z.string().optional().default(""),
  tags: z
    .object({
      area: z.array(z.string()).optional(),
      symptoms: z.array(z.string()).optional(),
      activities: z.array(z.string()).optional(),
      medicines: z.array(z.string()).optional(),
      habits: z.array(z.string()).optional(),
      other: z.array(z.string()).optional()
    })
    .partial()
    .optional()
});

export const cbtSchema = z.object({
  entryDate: z.string().min(1),
  entryTime: z.string().min(1),
  situation: z.string().optional().default(""),
  thoughts: z.string().optional().default(""),
  helpfulReasoning: z.string().optional().default(""),
  mainUnhelpfulThought: z.string().optional().default(""),
  effectOfBelieving: z.string().optional().default(""),
  evidenceForAgainst: z.string().optional().default(""),
  alternativeExplanation: z.string().optional().default(""),
  worstBestScenario: z.string().optional().default(""),
  friendAdvice: z.string().optional().default(""),
  productiveResponse: z.string().optional().default(""),
});

export const dbtSchema = z.object({
  entryDate: z.string().min(1),
  entryTime: z.string().min(1),
  emotionName: z.string().optional().default(""),
  allowAffirmation: z.string().optional().default(""),
  watchEmotion: z.string().optional().default(""),
  bodyLocation: z.string().optional().default(""),
  bodyFeeling: z.string().optional().default(""),
  presentMoment: z.string().optional().default(""),
  emotionReturns: z.string().optional().default(""),
});

export const prefsSchema = z.object({
  model: z.string().default("mistral-small-latest"),
  chatRange: z.string().default("all"),
  lastRange: z.string().default("all"),
  graphSelection: z.record(z.string(), z.any()).default({})
});

export const aiKeySchema = z.object({ key: z.string().min(1).max(4096) });

export const chatSchema = z.object({
  message: z.string().min(1),
  range: z.string().optional(),
  model: z.string().optional()
});

export const backupImportSchema = z.object({
  diary: z
    .object({ rows: z.array(z.record(z.string(), z.any())).default([]) })
    .optional(),
  pain: z
    .object({
      rows: z.array(z.record(z.string(), z.any())).default([]),
      options: z
        .object({
          options: z.record(z.string(), z.array(z.string())).optional(),
          removed: z.record(z.string(), z.array(z.string())).optional()
        })
        .optional()
    })
    .optional(),
  prefs: z.record(z.string(), z.any()).optional()
});

export const optionFieldSchema = z.object({
  field: z.string(),
  value: z.string().min(1)
});
