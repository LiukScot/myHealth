import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { InlineFeedback, AnimatedEditingLabel } from "./shared";

describe("<InlineFeedback />", () => {
  test("renders nothing when message is null", () => {
    const { container } = render(<InlineFeedback message={null} />);
    expect(container.firstChild).toBeNull();
  });

  test("renders success tone as status with aria-live polite", () => {
    render(<InlineFeedback message={{ tone: "success", text: "Saved." }} />);
    const node = screen.getByText("Saved.");
    expect(node).toHaveAttribute("role", "status");
    expect(node).toHaveAttribute("aria-live", "polite");
    expect(node).toHaveClass("is-success");
  });

  test("renders error tone as alert with aria-live assertive", () => {
    render(<InlineFeedback message={{ tone: "error", text: "Bad." }} />);
    const node = screen.getByText("Bad.");
    expect(node).toHaveAttribute("role", "alert");
    expect(node).toHaveAttribute("aria-live", "assertive");
  });

  test("appends additional className", () => {
    render(<InlineFeedback message={{ tone: "info", text: "Hi" }} className="extra" />);
    expect(screen.getByText("Hi")).toHaveClass("extra");
  });
});

describe("<AnimatedEditingLabel />", () => {
  test("renders idle label when inactive", () => {
    render(<AnimatedEditingLabel active={false} idleLabel="Edit" />);
    expect(screen.getByText("Edit")).toBeInTheDocument();
  });

  test("renders editing label when active", () => {
    render(<AnimatedEditingLabel active editingLabel="Editing" />);
    // Initial state shows "Editing." (1 dot). Both the visible label and the sizer match.
    expect(screen.getAllByText(/Editing/i).length).toBeGreaterThan(0);
  });
});
