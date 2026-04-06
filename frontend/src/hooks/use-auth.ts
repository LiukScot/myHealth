import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiEnvelopeSchema, apiFetch } from "../lib";
import { loginSchema, changePasswordSchema, sessionDataSchema, useAuthStore } from "../app/core";
import type { InlineMessage } from "../app/core";
import { useState, useCallback, useEffect } from "react";

export function useAuth() {
  const queryClient = useQueryClient();
  const { user, setUser } = useAuthStore();
  const [passwordFeedback, setPasswordFeedback] = useState<InlineMessage | null>(null);

  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: async () => apiFetch("/api/v1/auth/session", { method: "GET" }, (raw) => sessionDataSchema.parse(raw).data),
  });

  // Sync the auth store with the session query result. Must run as an effect,
  // not during render, otherwise React warns about updating one component
  // (zustand subscribers) while rendering another (App).
  useEffect(() => {
    if (!sessionQuery.data) return;
    if (sessionQuery.data.authenticated && sessionQuery.data.user && !user) {
      setUser(sessionQuery.data.user);
    } else if (!sessionQuery.data.authenticated && user) {
      setUser(null);
    }
  }, [sessionQuery.data, user, setUser]);

  const loginForm = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });

  const loginMutation = useMutation({
    mutationFn: async (values: z.infer<typeof loginSchema>) =>
      apiFetch(
        "/api/v1/auth/login",
        { method: "POST", body: JSON.stringify(values) },
        (raw) => apiEnvelopeSchema(z.object({ email: z.string(), name: z.string().nullable() })).parse(raw).data,
      ),
    onSuccess: async () => {
      const session = await queryClient.fetchQuery({
        queryKey: ["session"],
        queryFn: async () => apiFetch("/api/v1/auth/session", { method: "GET" }, (raw) => sessionDataSchema.parse(raw).data),
      });
      if (session.authenticated && session.user) {
        setUser(session.user);
      }
      loginForm.reset();
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () =>
      apiFetch("/api/v1/auth/logout", { method: "POST" }, (raw) =>
        apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data,
      ),
    onSuccess: async () => {
      setUser(null);
      await queryClient.invalidateQueries();
    },
  });

  const changePasswordForm = useForm<z.infer<typeof changePasswordSchema>>({
    resolver: zodResolver(changePasswordSchema),
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (values: z.infer<typeof changePasswordSchema>) =>
      apiFetch(
        "/api/v1/auth/change-password",
        { method: "POST", body: JSON.stringify({ currentPassword: values.currentPassword, newPassword: values.newPassword }) },
        (raw) => apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data,
      ),
    onMutate: () => {
      setPasswordFeedback(null);
    },
    onSuccess: () => {
      changePasswordForm.reset();
      setPasswordFeedback({ tone: "success", text: "Password updated." });
    },
  });

  const clearPasswordStatus = useCallback(() => {
    if (passwordFeedback) setPasswordFeedback(null);
    if (changePasswordMutation.error) changePasswordMutation.reset();
  }, [passwordFeedback, changePasswordMutation]);

  return {
    user,
    loginForm,
    loginMutation,
    logoutMutation,
    changePasswordForm,
    changePasswordMutation,
    passwordFeedback,
    clearPasswordStatus,
  };
}
