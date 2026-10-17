// "Untap up to N lands" (Snap, Palinchron, Frantic Search): the lands are chosen as the spell or ability resolves
// (CR 608.2d), any tapped lands, anyone's (rulings: "You may untap lands controlled by any player"), and none is fine.

import { describe, expect, it } from "vitest";
import { act, card, passAll, putOnBattlefield, setup } from "./helpers";
import { botActions, isFullySupported, planCast, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const snap = card("Snap", "Instant", "{1}{U}", { oracleText: "Return target creature to its owner's hand. Untap up to two lands." });
const palinchron = card("Palinchron", "Creature — Illusion", "{5}{U}{U}", { power: "4", toughness: "5", keywords: ["Flying"], oracleText: "Flying\nWhen this creature enters, untap up to seven lands.\n{2}{U}{U}: Return this creature to its owner's hand." });
const frantic = card("Frantic Search", "Instant", "{2}{U}", { oracleText: "Draw two cards, then discard two cards. Untap up to three lands." });
const treachery = card("Treachery", "Enchantment — Aura", "{3}{U}{U}", { keywords: ["Enchant"], oracleText: "Enchant creature\nWhen this Aura enters, untap up to five lands.\nYou control enchanted creature." });
const timeSpiral = card("Time Spiral", "Sorcery", "{4}{U}{U}", { oracleText: "Exile Time Spiral. Each player shuffles their hand and graveyard into their library, then draws seven cards. You untap up to six lands." });
const bear = card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });

const castIt = (s: GameState, pid: PlayerId, id: string, targets?: Parameters<typeof planCast>[3]) => {
  for (const a of planCast(s, pid, id, targets)!) s = act(s, a);
  return passAll(s);
};
const tappedLands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.objects[id]!.tapped && s.cards[s.objects[id]!.cardId]!.typeLine.includes("Land"));

describe("untap up to N lands", () => {
  it("parse", () => {
    for (const d of [snap, palinchron, frantic, treachery, timeSpiral]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Snap: up to two tapped lands, anyone's, chosen as it resolves", () => {
    const { s: s0, ap, opp, ids } = setup([snap]);
    const b = putOnBattlefield(s0, opp, bear);
    const theirs = putOnBattlefield(s0, opp, card("Forest", "Basic Land — Forest"));
    s0.objects[theirs]!.tapped = true;
    let s = castIt(s0, ap, ids[0]!, [{ kind: "object", id: b }]);
    expect(s.objects[b]!.zone).toBe("hand");
    const p = s.pending;
    expect(p?.kind === "pickPermanents" && p.action === "untap" && p.player === ap && p.count === 2 && p.min === 0).toBe(true);
    if (p?.kind !== "pickPermanents") return;
    const mine = tappedLands(s, ap);
    expect(mine.length).toBe(2);
    expect(p.options.sort()).toEqual([...mine, theirs].sort());
    expect(() => act(s, { type: "pickPermanents", player: ap, ids: [...mine, theirs] })).toThrow();
    s = act(s, { type: "pickPermanents", player: ap, ids: [mine[0]!, theirs] });
    expect(s.pending).toBeNull();
    expect([s.objects[mine[0]!]!.tapped, s.objects[mine[1]!]!.tapped, s.objects[theirs]!.tapped]).toEqual([false, true, false]);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("Snap: untapping none is a choice", () => {
    const { s: s0, ap, opp, ids } = setup([snap]);
    const b = putOnBattlefield(s0, opp, bear);
    let s = castIt(s0, ap, ids[0]!, [{ kind: "object", id: b }]);
    s = act(s, { type: "pickPermanents", player: ap, ids: [] });
    expect(s.pending).toBeNull();
    expect(tappedLands(s, ap).length).toBe(2);
  });

  it("Palinchron: its enters trigger untaps the seven lands it was cast with", () => {
    const { s: s0, ap, ids } = setup([palinchron]);
    let s = castIt(s0, ap, ids[0]!);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    const mine = tappedLands(s, ap);
    expect(mine.length).toBe(7);
    expect(s.pending?.kind === "pickPermanents" && s.pending.count === 7).toBe(true);
    s = act(s, { type: "pickPermanents", player: ap, ids: mine });
    expect(tappedLands(s, ap).length).toBe(0);
  });

  it("Frantic Search: discards, then untaps; a bot untaps its own lands", () => {
    const { s: s0, ap, opp, ids } = setup([frantic]);
    const theirs = putOnBattlefield(s0, opp, card("Forest", "Basic Land — Forest"));
    s0.objects[theirs]!.tapped = true;
    let s = castIt(s0, ap, ids[0]!);
    for (let i = 0; i < 4 && s.pending && !(s.pending.kind === "pickPermanents" && s.pending.action === "untap"); i++) s = act(s, botActions(s, ap)[0]!);
    expect(s.pending?.kind === "pickPermanents" && s.pending.action === "untap").toBe(true);
    const pick = botActions(s, ap)[0]!;
    expect(pick.type === "pickPermanents" && pick.ids.length === 3 && !pick.ids.includes(theirs)).toBe(true);
    s = act(s, pick);
    expect(tappedLands(s, ap).length).toBe(0);
    expect(s.objects[theirs]!.tapped).toBe(true);
  });
});
