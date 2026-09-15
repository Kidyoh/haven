import { describe, expect, test } from "vitest";
import { bearingDegrees, compassPoint, distanceMeters, formatDistance, hasCoordinates, walkingMinutes } from "@/lib/pathways/geo";

// Meskel Square and Gandhi Memorial Hospital, Addis Ababa (a little under a kilometre apart).
const meskel = { lat: 9.0107, lng: 38.7613 };
const gandhi = { lat: 9.0154037, lng: 38.7554164 };

describe("pathways geo", () => {
  test("distance between two points in Addis Ababa", () => {
    const d = distanceMeters(meskel, gandhi);
    expect(d).toBeGreaterThan(750);
    expect(d).toBeLessThan(900);
    expect(distanceMeters(gandhi, gandhi)).toBe(0);
  });

  test("bearing and the nearest compass point", () => {
    expect(compassPoint(bearingDegrees(meskel, gandhi))).toBe("nw");
    expect(compassPoint(bearingDegrees({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }))).toBe("n");
    expect(compassPoint(bearingDegrees({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }))).toBe("e");
    expect(compassPoint(359)).toBe("n");
    expect(compassPoint(-90)).toBe("w");
  });

  test("distances read naturally", () => {
    expect(formatDistance(3)).toBe("10 m");
    expect(formatDistance(347)).toBe("350 m");
    expect(formatDistance(1234)).toBe("1.2 km");
    expect(formatDistance(14_600)).toBe("15 km");
    expect(walkingMinutes(1000)).toBe(17);
  });

  test("records without a pin are recognised", () => {
    expect(hasCoordinates({ lat: null, lng: null })).toBe(false);
    expect(hasCoordinates({ lat: 9, lng: 38 })).toBe(true);
  });
});
