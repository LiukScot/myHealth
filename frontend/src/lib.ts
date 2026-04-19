import { z } from "zod";

export const apiEnvelopeSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({ data: dataSchema });

export async function apiFetch<T>(
  path: string,
  options: RequestInit,
  parser: (raw: unknown) => T
): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers ?? {})
    },
    ...options
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : {};

  if (!res.ok) {
    const message = json?.error?.message || `HTTP ${res.status}`;
    throw new Error(message);
  }

  return parser(json);
}

export function toLocalDateTimeValue(dateIso?: string, time?: string) {
  if (dateIso && time) {
    return `${dateIso}T${time}`;
  }
  const now = new Date();
  const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  return localIso;
}

export function splitDateTime(localDateTime: string): { entryDate: string; entryTime: string } {
  const d = new Date(localDateTime);
  const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString();
  return { entryDate: iso.slice(0, 10), entryTime: iso.slice(11, 16) };
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
