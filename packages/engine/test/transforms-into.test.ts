// "When this creature transforms into [this face]" (CR 701.27e): it triggers when the permanent transforms or converts
// and has that face up after; it's an ability of the face now up. Entering the battlefield transformed isn't
// transforming (712.14a), and transforming isn't leaving the battlefield (712.18).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, scry, setup, target } from "./helpers";
import { botActions, characteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type GameState } from "../src";
import { moveObject } from "../src/game";
import { transformPermanent } from "../src/effects/run-permanents";

// Real oracle text (Scryfall).
const weird = scry(
  "transform",
  [
    { name: "Captive Weird", mana_cost: "{U}", type_line: "Creature — Weird", oracle_text: "Defender\n{3}{R/P}: Transform this creature. Activate only as a sorcery. ({R/P} can be paid with either {R} or 2 life.)", power: "1", toughness: "3" },
    { name: "Compleated Conjurer", type_line: "Creature — Phyrexian Weird", oracle_text: "When this creature transforms into Compleated Conjurer, exile the top card of your library. Until the end of your next turn, you may play that card.", power: "3", toughness: "3" },
  ],
  { keywords: ["Defender", "Transform"] },
);
const thallid = scry(
  "transform",
  [
    { name: "Blightreaper Thallid", mana_cost: "{1}{B}", type_line: "Creature — Fungus", oracle_text: "{3}{G/P}: Transform this creature. Activate only as a sorcery. ({G/P} can be paid with either {G} or 2 life.)", power: "2", toughness: "2" },
    { name: "Blightsower Thallid", type_line: "Creature — Phyrexian Fungus", oracle_text: "When this creature transforms into Blightsower Thallid or dies, create a 1/1 green Phyrexian Saproling creature token.", power: "3", toughness: "3" },
  ],
  { keywords: ["Transform"] },
);
const cathar = scry(
  "transform",
  [
    { name: "Brutal Cathar", mana_cost: "{2}{W}", type_line: "Creature — Human Soldier Werewolf", oracle_text: "Whenever this creature enters or transforms into Brutal Cathar, exile target creature an opponent controls until this creature leaves the battlefield.\nDaybound (If a player casts no spells during their own turn, it becomes night next turn.)", power: "2", toughness: "2" },
    { name: "Moonrage Brute", type_line: "Creature — Werewolf", oracle_text: "First strike\nWard—Pay 3 life.\nNightbound (If a player casts at least two spells during their own turn, it becomes day next turn.)", power: "3", toughness: "3" },
  ],
  { keywords: ["Daybound", "Nightbound", "First strike", "Ward", "Transform"] },
);
const ogre = card("Ogre", "Creature — Ogre", "{3}{R}", { power: "4", toughness: "4" });
const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
/** Everyone passes until the stack and the triggers are done, the bot answering any choice. */
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending); i++) s = act(s, s.pending ? botActions(s, waitingOn(s)!)[0]! : { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const name = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;
const saprolings = (s: GameState) => s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Saproling")).length;

describe('"When ~ transforms into ~" (CR 701.27e)', () => {
  it("compile", () => {
    for (const c of [weird, thallid, cathar]) expect(isFullySupported(c)).toBe(true);
  });

  it("Captive Weird transforms into Compleated Conjurer: exile the top card, which you may play", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, weird);
    const top = s0.players[ap]!.library[0]!;
    const s = settle(run(s0, planActivate(s0, ap, w, 0)));
    expect(name(s, w)).toBe("Compleated Conjurer");
    expect(s.objects[top]!.zone).toBe("exile");
    expect(s.objects[top]!.mayPlay?.player).toBe(ap);
  });

  it("Blightsower Thallid: a Saproling when it transforms and when it dies, but not when it enters transformed (CR 712.14a)", () => {
    const { s: s0, ap, ids } = setup([murder]);
    const t = putOnBattlefield(s0, ap, thallid);
    let s = settle(run(s0, planActivate(s0, ap, t, 0)));
    expect(name(s, t)).toBe("Blightsower Thallid");
    expect(saprolings(s)).toBe(1);
    s = settle(run(s, planCast(s, ap, ids[0]!, [target(t)])));
    expect(s.objects[t]!.zone).toBe("graveyard");
    expect(saprolings(s)).toBe(2);
    // Back onto the battlefield transformed: it didn't transform.
    moveObject(s, t, "battlefield", { face: 1 });
    s = settle(s);
    expect(name(s, t)).toBe("Blightsower Thallid");
    expect(saprolings(s)).toBe(2);
  });

  it("Brutal Cathar: night and back to day exiles another creature, and both stay exiled until it leaves (CR 712.18)", () => {
    const { s: s0, ap, opp, ids } = setup([cathar, murder]);
    const [o1, o2] = [putOnBattlefield(s0, opp, ogre), putOnBattlefield(s0, opp, ogre)];
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const c = ids[0]!;
    expect([o1, o2].filter((o) => s.objects[o]!.zone === "exile")).toHaveLength(1);
    // Night: it transforms into Moonrage Brute, which has no such ability; the exiled Ogre stays exiled.
    expect(transformPermanent(s, s.objects[c]!, true)).toBe(true);
    s = settle(s);
    expect(name(s, c)).toBe("Moonrage Brute");
    expect([o1, o2].filter((o) => s.objects[o]!.zone === "exile")).toHaveLength(1);
    // Day again: it transforms into Brutal Cathar, and exiles the other Ogre.
    expect(transformPermanent(s, s.objects[c]!, true)).toBe(true);
    s = settle(s);
    expect(name(s, c)).toBe("Brutal Cathar");
    expect([o1, o2].filter((o) => s.objects[o]!.zone === "exile")).toHaveLength(2);
    // It leaves: both come back.
    s = settle(run(s, planCast(s, ap, ids[1]!, [target(c)])));
    expect(s.objects[c]!.zone).toBe("graveyard");
    expect([o1, o2].filter((o) => s.objects[o]!.zone === "battlefield")).toHaveLength(2);
  });
});
