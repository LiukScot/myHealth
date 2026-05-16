import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoginScreen } from "./LoginScreen";
import { loginSchema } from "./core";
import type { UseMutationResult } from "@tanstack/react-query";

type LoginValues = { email: string; password: string };

// reason: react-query mutation surface is huge; only a few fields are read by LoginScreen
// so we cast through unknown from a partial mock.
function makeMutation(overrides: Record<string, unknown> = {}) {
  const mutate = vi.fn();
  const base = {
    mutate,
    isPending: false,
    error: null,
    ...overrides,
  };
  return base as unknown as UseMutationResult<unknown, Error, LoginValues>;
}

function Wrapper({
  onSubmit,
  isPending = false,
  error = null,
}: {
  onSubmit?: (v: LoginValues) => void;
  isPending?: boolean;
  error?: Error | null;
}) {
  const form = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });
  const mutation = makeMutation({
    isPending,
    error,
    mutate: ((values: LoginValues) => onSubmit?.(values)) as never,
  });
  return <LoginScreen loginForm={form} loginMutation={mutation} />;
}

describe("<LoginScreen />", () => {
  test("renders email + password fields and submit button", () => {
    render(<Wrapper />);
    expect(screen.getByText("Health")).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sign in/i })).toBeInTheDocument();
  });

  test("disables submit and shows pending label while mutation is pending", () => {
    render(<Wrapper isPending />);
    const btn = screen.getByRole("button", { name: /Signing in.../i });
    expect(btn).toBeDisabled();
  });

  test("surfaces validation error when email is empty", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Wrapper onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/Password/i), "Password123!");
    await user.click(screen.getByRole("button", { name: /Sign in/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  test("submits values when both fields are filled", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Wrapper onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/Email/i), "user@example.com");
    await user.type(screen.getByLabelText(/Password/i), "Password123!");
    await user.click(screen.getByRole("button", { name: /Sign in/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "Password123!",
    });
  });

  test("displays mutation error message", () => {
    render(<Wrapper error={new Error("Invalid credentials")} />);
    expect(screen.getByText(/Invalid credentials/i)).toBeInTheDocument();
  });

  test("renders signup-disabled hint", () => {
    render(<Wrapper />);
    expect(screen.getByText(/Signup is disabled/i)).toBeInTheDocument();
  });
});
