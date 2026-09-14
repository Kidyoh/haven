import { describe, expect, test, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AlertActive from "@/components/AlertActive";
import CountdownOverlay from "@/components/CountdownOverlay";
import NotFound from "@/pages/NotFound";
import { Callout, EmptyState, Spinner, StatusPill } from "@/components/haven/Feedback";
import { BrandMark, PageHeader } from "@/components/haven/Screen";
import { TextField } from "@/components/haven/Field";

/**
 * Smoke tests for screens that sit behind auth (so a browser pass cannot reach
 * them) and for the shared chrome every page is built from.
 */

describe("alert screens", () => {
  test("the active-alert screen states what is happening and offers the way out", () => {
    render(<AlertActive onSafe={() => {}} />);
    expect(screen.getByText(/alert active/i)).toBeInTheDocument();
    expect(screen.getByText(/help is on the way/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /i am safe/i })).toBeInTheDocument();
  });

  test("the countdown announces the remaining seconds and can always be cancelled", () => {
    render(<CountdownOverlay seconds={10} onComplete={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole("timer")).toHaveTextContent("10");
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  test("the countdown fires exactly once when it reaches zero", () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    render(<CountdownOverlay seconds={1} onComplete={onComplete} onCancel={() => {}} />);
    // act() flushes the state update the timer schedules, and the effect that
    // reacts to it — without it the tick lands but the component never re-runs.
    act(() => vi.advanceTimersByTime(1100));
    expect(onComplete).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe("shared chrome", () => {
  test("404 offers a way back into both halves of the app", () => {
    render(
      <MemoryRouter initialEntries={["/nope"]}>
        <NotFound />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: /go to haven/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /find help/i })).toBeInTheDocument();
  });

  test("the brand lockup renders the wordmark and its surface name", () => {
    render(<BrandMark stacked subtitle="Response dashboard" />);
    expect(screen.getByText("HAVEN")).toBeInTheDocument();
    expect(screen.getByText("Response dashboard")).toBeInTheDocument();
  });

  test("a page header exposes its back affordance to assistive tech", () => {
    render(<PageHeader title="Organizations" onBack={() => {}} backLabel="Back to dashboard" />);
    expect(screen.getByRole("button", { name: "Back to dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Organizations" })).toBeInTheDocument();
  });

  test("an error callout is announced, a neutral one is not", () => {
    const { rerender } = render(<Callout tone="danger">Wrong password</Callout>);
    expect(screen.getByRole("alert")).toHaveTextContent("Wrong password");
    rerender(<Callout tone="info">Just so you know</Callout>);
    expect(screen.getByRole("status")).toHaveTextContent("Just so you know");
  });

  test("status pills read as words, not just colour", () => {
    const { rerender } = render(<StatusPill active />);
    expect(screen.getByText("Active")).toBeInTheDocument();
    rerender(<StatusPill active={false} />);
    expect(screen.getByText("Resolved")).toBeInTheDocument();
  });

  test("the spinner has an accessible name", () => {
    render(<Spinner label="Signing in" />);
    expect(screen.getByRole("status", { name: "Signing in" })).toBeInTheDocument();
  });

  test("empty states say what is missing", () => {
    render(<EmptyState icon={<span />} title="No organizations yet" description="Add one to get started." />);
    expect(screen.getByRole("heading", { name: /no organizations yet/i })).toBeInTheDocument();
  });

  test("a field labels its input, and marks only the optional ones", () => {
    const { rerender } = render(<TextField label="Email" required />);
    expect(screen.getByLabelText("Email")).toBeRequired();
    expect(screen.queryByText("optional")).not.toBeInTheDocument();
    rerender(<TextField label="Phone" optional />);
    expect(screen.getByText("optional")).toBeInTheDocument();
  });

  test("a field's hint and error are wired up for screen readers", () => {
    const { rerender } = render(<TextField label="Phone" hint="Used during an alert." />);
    expect(screen.getByLabelText("Phone")).toHaveAccessibleDescription("Used during an alert.");
    rerender(<TextField label="Phone" error="That number looks wrong." />);
    const input = screen.getByLabelText("Phone");
    expect(input).toHaveAccessibleDescription("That number looks wrong.");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });
});
