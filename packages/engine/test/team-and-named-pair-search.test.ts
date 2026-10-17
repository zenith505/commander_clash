// "Each player on your team" is you alone in a game that isn't between teams (CR 102.4: Azra Bladeseeker). "A card named
// A and/or a card named B" (Alpine Houndmaster): one search for up to two cards, at most one of each name (CR 701.23).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, planCast, waitingOn, type CardDef, type GameState } from "../src";
import { moveObject } from "../src/game";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const untilPending = (s: GameState, kind: string) => {
  for (let i = 0; i < 20 && s.pending?.kind !== kind; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const name = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;

// Real oracle text (Scryfall).
const azra = card("Azra Bladeseeker", "Creature — Azra Warrior", "{2}{R}", { power: "3", toughness: "2", oracleText: "When this creature enters, each player on your team may discard a card, then each player who discarded a card this way draws a card." });
const houndmaster = card("Alpine Houndmaster", "Creature — Human Warrior", "{R}{W}", { power: "2", toughness: "2", oracleText: "When this creature enters, you may search your library for a card named Alpine Watchdog and/or a card named Igneous Cur, reveal them, put them into your hand, then shuffle.\nWhenever this creature attacks, it gets +X/+0 until end of turn, where X is the number of other attacking creatures." });
const watchdog = card("Alpine Watchdog", "Creature — Dog", "{1}{W}", { power: "2", toughness: "2", keywords: ["Vigilance"], oracleText: "Vigilance (Attacking doesn't cause this creature to tap.)" });
const cur = card("Igneous Cur", "Creature — Elemental Dog", "{1}{R}", { power: "1", toughness: "2", oracleText: "{1}{R}: This creature gets +2/+0 until end of turn." });
const shock = card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target." });

describe("each player on your team", () => {
  it("parse", () => supported(azra));

  it("Azra Bladeseeker: you may discard a card, and if you do, draw one", () => {
    const { s: s0, ap, ids } = setup([azra, shock]);
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!)!) s = act(s, a);
    s = untilPending(s, "chooseMay");
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    const before = s.players[ap]!.hand.length;
    const no = act(s, { type: "chooseMay", player: ap, yes: false });
    expect(no.players[ap]!.hand.length).toBe(before);
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "discard", player: ap });
    s = act(s, { type: "discard", player: ap, objectIds: [ids[1]!] });
    expect(s.objects[ids[1]!]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(before);
    expect(s.players[ap]!.hand).not.toContain(ids[1]);
  });
});

describe("a card named A and/or a card named B", () => {
  it("parse", () => supported(houndmaster));

  it("Alpine Houndmaster offers one of each name and puts both into your hand", () => {
    const { s: s0, ap, ids } = setup([houndmaster]);
    const inLib = [watchdog, watchdog, cur].map((d) => {
      const id = putOnBattlefield(s0, ap, d);
      moveObject(s0, id, "library", { top: true });
      return id;
    });
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!)!) s = act(s, a);
    s = untilPending(s, "chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 2, min: 0 });
    const offered = s.pending!.kind === "searchLibrary" ? s.pending!.cards : [];
    expect(offered.map((id) => name(s, id)).sort()).toEqual(["Alpine Watchdog", "Igneous Cur"]);
    s = act(s, { type: "searchLibrary", player: ap, found: offered });
    expect(offered.every((id) => s.players[ap]!.hand.includes(id))).toBe(true);
    expect(inLib.filter((id) => s.objects[id]!.zone === "library").length).toBe(1);
  });
});
