import { describe, expect, test } from "vitest";
import {
  batteryHistogram,
  hotspots,
  insights,
  quantile,
  resolveHistogram,
  splitByWindow,
  summarize,
  volumeSeries,
  weekHourMatrix,
  type IncidentRow,
} from "@/lib/analytics/incidents";

// Tuesday 15 September 2026, 12:00 East Africa Time (09:00 UTC).
const NOW = Date.UTC(2026, 8, 15, 9, 0, 0);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

let n = 0;
function row(overrides: Partial<IncidentRow> = {}): IncidentRow {
  n += 1;
  return {
    id: `i${n}`,
    user_id: "u1",
    status: "resolved",
    created_at: new Date(NOW - HOUR).toISOString(),
    activated_at: null,
    resolved_at: null,
    duress_at: null,
    battery_level: null,
    signal_strength: "online",
    latitude: null,
    longitude: null,
    accuracy_meters: null,
    location_fixes: 0,
    clips: 0,
    audio_seconds: 0,
    sms_sent: 0,
    sms_failed: 0,
    contacts_reached: 0,
    ...overrides,
  };
}

const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();

describe("analytics summary", () => {
  test("counts alerts and cancellations separately", () => {
    const s = summarize([row(), row({ status: "active" }), row({ status: "cancelled" })]);
    expect(s.alerts).toBe(2);
    expect(s.cancelled).toBe(1);
    expect(s.open).toBe(1);
    expect(s.cancelRate).toBeCloseTo(1 / 3);
  });

  test("time to resolve runs from activation, and takes the median and p90", () => {
    const rows = [5, 10, 20, 40, 120].map((minutes) =>
      row({ created_at: at(3 * HOUR), activated_at: at(3 * HOUR - 5000), resolved_at: new Date(NOW - 3 * HOUR + 5000 + minutes * 60_000).toISOString() }),
    );
    const s = summarize(rows);
    expect(s.resolve.count).toBe(5);
    expect(s.resolve.median).toBeCloseTo(20);
    expect(s.resolve.p90).toBeCloseTo(88);
  });

  test("contact reach is per alert, delivery is per text", () => {
    const s = summarize([
      row({ sms_sent: 2, contacts_reached: 2 }),
      row({ sms_sent: 0, sms_failed: 3, contacts_reached: 0 }),
      row({ sms_sent: 1, sms_failed: 1, contacts_reached: 1 }),
    ]);
    expect(s.sms.reachRate).toBeCloseTo(2 / 3);
    expect(s.sms.deliveryRate).toBeCloseTo(3 / 7);
  });

  test("repeat people and duress", () => {
    const s = summarize([row({ user_id: "a" }), row({ user_id: "a", duress_at: at(0) }), row({ user_id: "b" })]);
    expect(s.people).toBe(2);
    expect(s.repeatPeople).toBe(1);
    expect(s.duress).toBe(1);
  });

  test("empty input gives nulls, not NaN", () => {
    const s = summarize([]);
    expect(s.sms.reachRate).toBeNull();
    expect(s.resolve.median).toBeNull();
    expect(quantile([], 0.5)).toBeNull();
  });
});

describe("windows and buckets", () => {
  test("splits the current window from the one before it", () => {
    const { current, previous } = splitByWindow(
      [row({ created_at: at(2 * DAY) }), row({ created_at: at(10 * DAY) }), row({ created_at: at(20 * DAY) })],
      "7d",
      NOW,
    );
    expect(current).toHaveLength(1);
    expect(previous).toHaveLength(1);
  });

  test("daily buckets are zero-filled and end today, in East Africa Time", () => {
    // 22:30 UTC on Monday is 01:30 Tuesday in Addis, so it lands on Tuesday (today), not Monday.
    const lateMondayUtc = new Date(Date.UTC(2026, 8, 14, 22, 30)).toISOString();
    const series = volumeSeries([row({ created_at: lateMondayUtc }), row({ status: "cancelled" })], "7d", NOW);
    expect(series).toHaveLength(7);
    expect(series.at(-1)).toMatchObject({ label: "Tue", value: 1 });
    expect(series.at(-2)).toMatchObject({ label: "Mon", value: 0 });
    expect(series.reduce((a, b) => a + b.value, 0)).toBe(1);
  });

  test("90 days is weekly, 12 months is monthly", () => {
    expect(volumeSeries([row()], "90d", NOW)).toHaveLength(13);
    const months = volumeSeries([row()], "365d", NOW);
    expect(months).toHaveLength(12);
    expect(months.at(-1)).toMatchObject({ label: "Sep", value: 1 });
  });

  test("the weekday/hour grid is Monday-first in East Africa Time", () => {
    const m = weekHourMatrix([row({ created_at: new Date(Date.UTC(2026, 8, 14, 22, 30)).toISOString() })]);
    expect(m[1][1]).toBe(1); // Tuesday 01:00 EAT
  });

  test("resolve and battery histograms place values in the right bins", () => {
    const resolved = row({ created_at: at(2 * HOUR), resolved_at: at(2 * HOUR - 7 * 60_000) });
    expect(resolveHistogram([resolved]).find((b) => b.value === 1)?.label).toBe("5–15m");
    const battery = batteryHistogram([row({ battery_level: 20 }), row({ battery_level: 21 }), row({ battery_level: null })]);
    expect(battery.map((b) => b.value)).toEqual([1, 1, 0, 0]);
  });
});

describe("hotspots", () => {
  test("groups alerts on a ~1 km grid and counts distinct people", () => {
    const spots = hotspots([
      row({ latitude: 9.0301, longitude: 38.7402, user_id: "a" }),
      row({ latitude: 9.0304, longitude: 38.7398, user_id: "b" }),
      row({ latitude: 8.99, longitude: 38.79 }),
      row({ latitude: null, longitude: null }),
    ]);
    expect(spots[0]).toMatchObject({ lat: 9.03, lng: 38.74, alerts: 2, people: 2 });
    expect(spots).toHaveLength(2);
  });
});

describe("insights", () => {
  test("only claims what the data supports", () => {
    const quiet = summarize([row()]);
    expect(insights(quiet, weekHourMatrix([row()]))).toEqual([]);
  });

  test("flags open alerts, duress and poor contact reach", () => {
    const rows = [
      row({ status: "active" }),
      row({ duress_at: at(0), contacts_reached: 1 }),
      row({ contacts_reached: 0 }),
      row({ contacts_reached: 0 }),
    ];
    const text = insights(summarize(rows), weekHourMatrix(rows)).map((i) => i.text).join("\n");
    expect(text).toMatch(/1 alert is still open/);
    expect(text).toMatch(/duress PIN/);
    expect(text).toMatch(/3 of 4 alerts reached no emergency contact/);
  });
});
