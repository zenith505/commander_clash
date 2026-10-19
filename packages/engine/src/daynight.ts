// Day and night (CR 731) and the daybound and nightbound keywords (702.145) on the faces of some double-faced cards.

import { objHasKeyword } from "./cards";
import { transformPermanent } from "./effects/run-permanents";
import { log } from "./game";
import type { GameState } from "./types";

/** It becomes day or night (CR 731.1), and the daybound and nightbound permanents transform as it does (702.145b, e). */
export function setDayNight(s: GameState, v: "day" | "night") {
  if (s.dayNight === v) return;
  log(s, s.dayNight ? (v === "night" ? "Day becomes night." : "Night becomes day.") : `It becomes ${v}.`);
  s.dayNight = v;
  turnWithDayNight(s);
}

/** A daybound permanent front face up at night, a nightbound one back face up by day: transformed (CR 702.145c, f). */
function turnWithDayNight(s: GameState) {
  for (const id of [...s.battlefield]) {
    const o = s.objects[id]!;
    if (s.dayNight === "night" ? o.face !== 1 && objHasKeyword(s, o, "Daybound") : o.face === 1 && objHasKeyword(s, o, "Nightbound")) transformPermanent(s, o, true);
  }
}

/**
 * Checked any time, not as a state-based action (CR 702.145c-g): with neither day nor night, a daybound permanent makes
 * it day, else a nightbound one makes it night; then the permanents that don't match the time of day transform.
 */
export function checkDayNight(s: GameState) {
  if (!s.dayNight) {
    const has = (k: string) => s.battlefield.some((id) => objHasKeyword(s, s.objects[id]!, k));
    if (has("Daybound")) setDayNight(s, "day");
    else if (has("Nightbound")) setDayNight(s, "night");
    return;
  }
  turnWithDayNight(s);
}

/**
 * The untap step's second part, after phasing and before untapping (CR 502.2, 731.2): day becomes night if the last turn's active player cast no spells
 * during it, night becomes day if they cast two or more.
 */
export function dayNightUntapCheck(s: GameState) {
  const last = s.lastTurn;
  if (!s.dayNight || !last) return; // 731.2c
  const n = last.cast[last.active] ?? 0;
  if (s.dayNight === "day" && n === 0) setDayNight(s, "night");
  else if (s.dayNight === "night" && n >= 2) setDayNight(s, "day");
}
