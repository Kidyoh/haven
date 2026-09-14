import { describe, expect, test } from "vitest";
import { daysSince, displayStatus, isStale } from "@/lib/pathways/staleness";

const today = new Date("2026-09-14T12:00:00Z");

describe("pathways staleness", () => {
  test("daysSince counts whole UTC days", () => {
    expect(daysSince("2026-09-14", today)).toBe(0);
    expect(daysSince("2026-09-13", today)).toBe(1);
    expect(daysSince("2026-06-16", today)).toBe(90);
    expect(daysSince("2026-06-15", today)).toBe(91);
  });

  test("verified within 90 days is verified", () => {
    const r = { status: "verified" as const, verified_on: "2026-06-16" };
    expect(isStale(r, today)).toBe(false);
    expect(displayStatus(r, today)).toBe("verified");
  });

  test("verified older than 90 days is flagged, not hidden or downgraded", () => {
    const r = { status: "verified" as const, verified_on: "2026-06-15" };
    expect(isStale(r, today)).toBe(true);
    expect(displayStatus(r, today)).toBe("verified_stale");
    expect(r.status).toBe("verified"); // the record itself is untouched
  });

  test("threshold comes from the dataset meta", () => {
    const r = { status: "verified" as const, verified_on: "2026-08-01" };
    expect(displayStatus(r, today, 30)).toBe("verified_stale");
    expect(displayStatus(r, today, 60)).toBe("verified");
  });

  test("unverified and reported_closed are never stale", () => {
    expect(displayStatus({ status: "unverified", verified_on: "2020-01-01" }, today)).toBe("unverified");
    expect(displayStatus({ status: "reported_closed", verified_on: "2020-01-01" }, today)).toBe("reported_closed");
  });

  test("an unparsable date is treated as infinitely old", () => {
    expect(displayStatus({ status: "verified", verified_on: "not-a-date" }, today)).toBe("verified_stale");
  });
});
