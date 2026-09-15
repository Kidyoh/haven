/**
 * Chart colors. HAVEN is dark-only, so these are the dark steps, checked with
 * the data-viz palette validator against the card surface (#15181e):
 *  - series: one hue for single-series charts (contrast >= 3:1).
 *  - ramp: one-hue sequential scale for magnitude; low values sit near the
 *    surface, high values are bright (monotone lightness, ends clear 2:1).
 * HAVEN's red, green and amber keep their status meanings and are never used
 * as series colors: safe green and warning amber fail colour-blind separation
 * side by side.
 */
export const VIZ = {
  series: "#3987e5",
  seriesHover: "#6da7ec",
  /** Sequential ramp for the dark surface: low values sit near the surface, high values are bright. */
  ramp: ["#184f95", "#256abf", "#3987e5", "#6da7ec", "#9ec5f4"],
  empty: "hsl(var(--secondary))",
  grid: "hsl(var(--border))",
  baseline: "hsl(220 12% 30%)",
  deemphasis: "hsl(var(--muted-foreground))",
};
