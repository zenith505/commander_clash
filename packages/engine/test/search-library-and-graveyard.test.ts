// "Search your library and/or graveyard for a card named Chandra, Bold Pyromancer, reveal it, and put it into your hand.
// If you search your library this way, shuffle." (CR 701.23): the graveyard alone (no shuffle) or both, the player's
// choice, asked when the graveyard has a card that fits. "If X is 10 or more, ..." (Finale of Devastation, Finale of
// Glory): the X the spell was cast with (CR 107.3a).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, putOnBattlefield, setup } from "./helpers";
import { applyAction, compileCard, isFullySupported, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState } from "../src";
import { moveObject } from "../src/game";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return settle(plan!.reduce((x, a) => act(x, a), s));
};
const inZone = (s: GameState, pid: number, def: CardDef, zone: "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  if (zone === "graveyard") moveObject(s, id, "graveyard");
  else {
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "library";
    s.players[pid]!.library.splice(5, 0, id);
  }
  return id;
};

// Real oracle text (Scryfall).
const outburst = card("Chandra's Outburst", "Sorcery", "{3}{R}{R}", { oracleText: "Chandra's Outburst deals 4 damage to target player or planeswalker.\nSearch your library and/or graveyard for a card named Chandra, Bold Pyromancer, reveal it, and put it into your hand. If you search your library this way, shuffle." });
const devastation = card("Finale of Devastation", "Sorcery", "{X}{G}{G}", { oracleText: "Search your library and/or graveyard for a creature card with mana value X or less and put it onto the battlefield. If you search your library this way, shuffle. If X is 10 or more, creatures you control get +X/+X and gain haste until end of turn." });
const glory = card("Finale of Glory", "Sorcery", "{X}{W}{W}", { oracleText: "Create X 2/2 white Soldier creature tokens with vigilance. If X is 10 or more, also create X 4/4 white Angel creature tokens with flying and vigilance." });
const visage = card("Visage of Bolas", "Artifact", "{4}", { oracleText: "When this artifact enters, you may search your library and/or graveyard for a card named Nicol Bolas, the Deceiver, reveal it, and put it into your hand. If you search your library this way, shuffle.\n{T}: Add {U}, {B}, or {R}." });
const chandra = card("Chandra, Bold Pyromancer", "Legendary Planeswalker — Chandra", "{4}{R}{R}", { loyalty: "5", oracleText: "+1: Add {R}{R}. Chandra, Bold Pyromancer deals 2 damage to target player." });
const troll = card("Test Troll", "Creature — Troll", "{2}{G}{G}", { power: "4", toughness: "4" });

describe("search your library and/or graveyard", () => {
  it("parse", () => {
    supported(outburst, devastation, glory, visage);
    expect(compileCard(outburst).spell!.effects[1]).toMatchObject({ type: "search", orGraveyard: true, filter: { named: "Chandra, Bold Pyromancer" }, reveal: true, dest: { zone: "hand" } });
    // "A or B" is one card with either name (named-or-and-from-hand.test.ts); "A and/or B" is up to one of each, not yet.
    expect(compileCard(card("Test Tutor", "Sorcery", "{1}", { oracleText: "Search your library for a card named Alpine Watchdog and/or a card named Igneous Cur, reveal them, put them into your hand, then shuffle." })).unsupported).toHaveLength(1);
  });

  it("the graveyard only: no shuffle", () => {
    const { s: s0, ap, opp, ids } = setup([outburst]);
    const c = inZone(s0, ap, chandra, "graveyard");
    const order = [...s0.players[ap]!.library];
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "searchZones", options: ["both", "graveyard"] });
    s = act(s, { type: "chooseOption", player: ap, choice: "graveyard" });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", cards: [c] });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [c] }));
    expect(s.objects[c]!.zone).toBe("hand");
    expect(s.players[ap]!.library).toEqual(order);
  });

  it("both: the library's cards are offered too, and it's shuffled", () => {
    const { s: s0, ap, opp, ids } = setup([outburst]);
    inZone(s0, ap, chandra, "graveyard");
    const inLib = inZone(s0, ap, chandra, "library");
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    s = act(s, { type: "chooseOption", player: ap, choice: "both" });
    if (s.pending?.kind !== "searchLibrary") throw new Error("no search");
    expect(s.pending.cards).toHaveLength(2);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [inLib] }));
    expect(s.objects[inLib]!.zone).toBe("hand");
    expect(s.log.some((l) => /searches their library and graveyard, finds a card \(Chandra, Bold Pyromancer\), and shuffles/.test(l.text))).toBe(true);
  });

  it("nothing that fits in the graveyard: no question, both are searched", () => {
    const { s: s0, ap, opp, ids } = setup([outburst]);
    const inLib = inZone(s0, ap, chandra, "library");
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", cards: [inLib] });
    expect(() => applyAction(s, { type: "chooseOption", player: ap, choice: "graveyard" })).toThrow();
  });

  it("Finale of Devastation with X = 10: the creature, then +10/+10 and haste for your creatures", () => {
    const { s: s0, ap, ids } = setup([devastation]);
    const t = inZone(s0, ap, troll, "graveyard");
    const b = putOnBattlefield(s0, ap, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 10));
    s = act(s, { type: "chooseOption", player: ap, choice: "graveyard" });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [t] }));
    expect(s.objects[t]!.zone).toBe("battlefield");
    expect([power(s, s.objects[t]!), toughness(s, s.objects[b]!)]).toEqual([14, 12]);
  });

  it("Finale of Devastation with X = 4: no bonus, and mana value 4 or less only", () => {
    const { s: s0, ap, ids } = setup([devastation]);
    const big = card("Test Giant", "Creature — Giant", "{5}{R}", { power: "6", toughness: "6" });
    inZone(s0, ap, big, "graveyard");
    const t = inZone(s0, ap, troll, "graveyard");
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 4));
    s = act(s, { type: "chooseOption", player: ap, choice: "graveyard" });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", cards: [t] });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [t] }));
    expect(power(s, s.objects[t]!)).toBe(4);
  });

  it("Finale of Glory: Angels too only with X 10 or more", () => {
    const angels = (s: GameState) => s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name.startsWith("Angel")).length;
    const { s: s0, ap, ids } = setup([glory]);
    expect(angels(run(structuredClone(s0), planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 9)))).toBe(0);
    expect(angels(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 10)))).toBe(10);
  });

  it("Visage of Bolas: a bot searching both", () => {
    return import("../src/bot").then(({ botActions }) => {
      const { s: s0, ap, ids } = setup([visage]);
      const nicol = card("Nicol Bolas, the Deceiver", "Legendary Planeswalker — Bolas", "{5}{U}{B}{R}", { loyalty: "5" });
      const yard = inZone(s0, ap, nicol, "graveyard");
      let s = cast(s0, ap, ids[0]!);
      for (let i = 0; i < 6 && s.pending; i++) for (const a of botActions(s, ap)) s = act(s, a);
      s = settle(s);
      expect(s.objects[yard]!.zone).toBe("hand");
    });
  });
});
