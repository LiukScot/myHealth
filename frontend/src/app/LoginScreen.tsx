import type { UseFormReturn } from "react-hook-form";
import type { UseMutationResult } from "@tanstack/react-query";

type LoginScreenProps = {
  loginForm: UseFormReturn<{ email: string; password: string }>;
  loginMutation: UseMutationResult<unknown, Error, { email: string; password: string }>;
};

export function LoginScreen({ loginForm, loginMutation }: LoginScreenProps) {
  return (
    <main className="screen auth-screen">
      <section className="auth-card">
        <h1>Health</h1>
        <p>Sign in to access your private health workspace.</p>
        <form onSubmit={loginForm.handleSubmit((values) => loginMutation.mutate(values))} className="stack">
          <label>
            Email
            <input type="email" autoComplete="email" {...loginForm.register("email")} />
          </label>
          <label>
            Password
            <input type="password" autoComplete="current-password" {...loginForm.register("password")} />
          </label>
          <button type="submit" disabled={loginMutation.isPending}>
            {loginMutation.isPending ? "Signing in..." : "Sign in"}
          </button>
          {loginMutation.error && <p className="error">{String(loginMutation.error.message)}</p>}
          <p className="hint">Signup is disabled. Use CLI provisioning.</p>
        </form>
      </section>
    </main>
  );
}
