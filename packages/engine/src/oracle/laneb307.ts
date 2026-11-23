// Lane B round B307: Snowblind.
import type { AmountExpr, StaticAbility } from "../abilities";
import { parseCount } from "./counts";

/**
 * Snowblind: "Enchanted creature gets -X/-Y. If that creature is attacking, X is the number of snow lands defending player
 * controls. Otherwise, X is the number of snow lands its controller controls. Y is equal to X or to enchanted creature's
 * toughness minus 1, whichever is smaller."
 *
 * One layer 7c effect (CR 613.4c). X counts the permanents the enchanted creature's defending player controls while it's
 * attacking (CR 506.2, 802.2a: the player it attacks, or the controller of the planeswalker it attacks), otherwise those its
 * controller controls, as layers 1-6 leave them (count `affectedDefenderOrControllerPermanents`). Y reads the toughness
 * the effect is applied to: every other P/T change in layer 7c and every counter changes what it does, so it depends on
 * them and waits for them (CR 613.8a-b, Modification leaveToughness). A toughness of 1 or less gives a Y below 0, and 0 is
 * used instead (CR 107.1b): then it's -X/-0.
 */
export function snowblindStatic(line: string): StaticAbility | null {
  const m = /^Enchanted creature gets -X\/-Y\. If that creature is attacking, X is the number of ([a-z ]+?) defending player controls\. Otherwise, X is the number of ([a-z ]+?) its controller controls\. Y is equal to X or to enchanted creature's toughness minus 1, whichever is smaller\.$/.exec(line);
  if (!m || m[1] !== m[2]) return null;
  const c = parseCount(`the number of ${m[1]} you control`, null);
  if (!c || c.count.kind !== "permanents" || c.times !== undefined || c.plus || c.negate || c.half || Object.keys(c.count).some((k) => k !== "kind" && k !== "filter")) return null;
  const { controller: _mine, ...filter } = c.count.filter;
  const x: AmountExpr = { count: { kind: "affectedDefenderOrControllerPermanents", filter: { ...filter, text: m[1]! } }, negate: true };
  return { affects: { kind: "attached" }, mods: [{ kind: "modifyPT", power: x, toughness: x, leaveToughness: 1 }], text: line };
}
