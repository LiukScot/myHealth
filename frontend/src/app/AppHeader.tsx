import { getErrorMessage } from "../lib";
import { InlineFeedback } from "./shared";
import type { useAuth } from "../hooks/use-auth";
type AppHeaderProps = {
  auth: ReturnType<typeof useAuth>;
};

export function AppHeader({ auth }: AppHeaderProps) {
  return (
    <header className="app-header">
      <div></div>
      <div className="header-actions">
        <details>
          <summary>Account</summary>
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
          <button onClick={() => auth.logoutMutation.mutate()} disabled={auth.logoutMutation.isPending}>
            Log out
          </button>
        </details>
      </div>
    </header>
  );
}
