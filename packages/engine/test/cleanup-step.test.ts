// "At the beginning of the next cleanup step" (CR 514.3a) and Mirage's "as though it had flash" sacrifice.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, actions: Action[] | null) => {
  if (!actions) throw new Error("no plan");
  return actions.reduce((x, a) => act(x, a), s);
};
const castNow = (s: GameState, pid: PlayerId, id: string, targets?: TargetChoice[]) => run(s, planCast(s, pid, id, targets, undefined, "auto"));
/** Others pass until `pid` has priority. */
const priorityTo = (s: GameState, pid: PlayerId) => {
  while (waitingOn(s) !== pid) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Through the cleanup step to the next turn's upkeep. */
const toNextTurn = (s: GameState) => passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(s.activePlayer) + 1) % 4]);

// Real oracle text (Scryfall).
const spiderClimb = card("Spider Climb", "Enchantment — Aura", "{G}", { keywords: ["Enchant"], oracleText: "You may cast this spell as though it had flash. If you cast it any time a sorcery couldn't have been cast, the controller of the permanent it becomes sacrifices it at the beginning of the next cleanup step.\nEnchant creature\nEnchanted creature gets +0/+3 and has reach. (It can block creatures with flying.)" });
const parapet = card("Parapet", "Enchantment", "{1}{W}", { oracleText: "You may cast this spell as though it had flash. If you cast it any time a sorcery couldn't have been cast, the controller of the permanent it becomes sacrifices it at the beginning of the next cleanup step.\nCreatures you control get +0/+1." });
const waylay = card("Waylay", "Instant", "{2}{W}", { oracleText: "Create three 2/2 white Knight creature tokens. Exile them at the beginning of the next cleanup step." });
const thawingGlaciers = card("Thawing Glaciers", "Land", "", { oracleText: "This land enters tapped.\n{1}, {T}: Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle. Return this land to its owner's hand at the beginning of the next cleanup step." });

describe("as though it had flash, sacrificed at the next cleanup step", () => {
  it("cast at sorcery timing, it stays", () => {
    supported(spiderClimb, parapet);
    const { s: s0, ap, ids } = setup([parapet]);
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    s = toNextTurn(s);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
  });

  it("cast any other time, its controller sacrifices it in the cleanup step, after the end step", () => {
    const { s: s0, ap, ids } = setup([parapet]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = passUntil(s0, "beginCombat", ap);
    s = settle(castNow(s, ap, ids[0]!));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    s = passUntil(s, "end", ap);
    expect(pt(s, b)).toBe("2/3"); // still there through the end step
    s = toNextTurn(s);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.log.some((e) => /sacrifices Parapet/.test(e.text))).toBe(true);
  });

  it("an Aura cast in response on another turn: sacrificed in that turn's cleanup step", () => {
    const { s: s0, ap, ids, opp } = setup([spiderClimb]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = priorityTo(passUntil(s0, "upkeep", opp), ap);
    s = settle(castNow(s, ap, ids[0]!, [target(b)]));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(b);
    expect(pt(s, b)).toBe("2/5");
    s = toNextTurn(s);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(pt(s, b)).toBe("2/2");
  });

  it("a sorcery-speed card can't be cast at instant speed without it", () => {
    const { s: s0, ap, ids } = setup([bear()]);
    const s = passUntil(s0, "beginCombat", ap);
    expect(planCast(s, ap, ids[0]!, undefined, undefined, "auto")).toBeNull();
  });
});

describe("at the beginning of the next cleanup step", () => {
  it("Waylay's Knights are exiled in the cleanup step", () => {
    supported(waylay);
    const { s: s0, ap, ids, opp } = setup([waylay]);
    let s = priorityTo(passUntil(s0, "end", opp), ap);
    s = settle(castNow(s, ap, ids[0]!));
    const knights = () => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap);
    expect(knights()).toHaveLength(3);
    s = toNextTurn(s);
    expect(knights()).toHaveLength(0);
  });

  it("Thawing Glaciers returns to its owner's hand", () => {
    supported(thawingGlaciers);
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, thawingGlaciers);
    let s = run(s0, planActivate(s0, ap, g, 0));
    s = settle(s);
    const pend = s.pending;
    if (pend?.kind !== "searchLibrary") throw new Error("expected a search");
    s = settle(act(s, { type: "searchLibrary", player: ap, found: pend.cards.slice(0, 1) }));
    expect(s.objects[g]!.zone).toBe("battlefield");
    s = toNextTurn(s);
    expect(s.objects[g]!.zone).toBe("hand");
  });
});
