// Fixed sentences with color words in them, read after a text change of color words (CR 612.1-612.2: Swirl the Mists,
// Sleight of Mind): the same sentence with any color words where the printed ones are, a list of them ("red, green, and
// white") as any list, one color too (collapseColorRepeats leaves "red, red, and red" as "red").
import type { Color } from "../types";

/** A color word's color (CR 105.1). */
export const COLOR_OF_WORD: Record<string, Color> = { white: "W", blue: "U", black: "B", red: "R", green: "G" };
const COLOR_OF = COLOR_OF_WORD;
const C = "\\b(?:white|blue|black|red|green)\\b";
const LIST = `${C}(?:(?:, ${C})*,? (?:and\\/or|and|or) ${C})?`;
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const cache = new Map<string, RegExp>();

/** The regular expression for `template`: each list of color words in it a group that takes any list of them. */
function regexOf(template: string): RegExp {
  const hit = cache.get(template);
  if (hit) return hit;
  const parts = template.split(new RegExp(`(${LIST})`, "i"));
  const src = parts.map((p, i) => (i % 2 ? `(${LIST})` : esc(p))).join("");
  const re = new RegExp(`^${src}$`, "i");
  cache.set(template, re);
  return re;
}

/** The colors of a list of color words ("white and black"), each once, in order. */
export function colorsOfList(list: string): Color[] {
  return [...new Set(list.toLowerCase().match(/\b(?:white|blue|black|red|green)\b/g)!.map((w) => COLOR_OF[w]!))];
}

/**
 * `line` as `template` with color words changed: each list of color words in the template, in order, as the colors `line`
 * has there; null when it isn't. The printed line gives the printed colors.
 */
export function colorTemplate(template: string, line: string): Color[][] | null {
  const m = regexOf(template).exec(line);
  if (!m) return null;
  return m.slice(1).map((g) => colorsOfList(g!));
}

/** The color word of a color, lower case. */
export const colorWord = (c: Color): string => ({ W: "white", U: "blue", B: "black", R: "red", G: "green" })[c];

/** `template` with its lists of color words replaced, in order, by these colors (as a list: "white and black"). */
export function withColors(template: string, lists: Color[][]): string {
  let i = 0;
  return template.replace(new RegExp(LIST, "gi"), (m) => {
    const cs = lists[i++];
    if (!cs) return m;
    const ws = cs.map(colorWord);
    const word = ws.length === 1 ? ws[0]! : ws.length === 2 ? `${ws[0]} and ${ws[1]}` : `${ws.slice(0, -1).join(", ")}, and ${ws[ws.length - 1]}`;
    return /^[A-Z]/.test(m) ? word.charAt(0).toUpperCase() + word.slice(1) : word;
  });
}
