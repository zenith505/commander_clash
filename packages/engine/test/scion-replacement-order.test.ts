// Scion of Halaster's "the first time you would draw a card each turn, instead look at the top two cards ..." with
// Alhammarret's Archive and dredge replacing the same draw: the player drawing chooses which applies first (CR 616.1,
// Alhammarret's Archive ruling). The look first: the draw it makes can still be doubled or dredged. Another first: that
// was the first time, so there's no look.

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, planCast, invalidateCharacteristics, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const scion = card("Scion of Halaster", "Legendary Enchantment — Background", "{1}{B}", { oracleText: 'Commander creatures you own have "The first time you would draw a card each turn, instead look at the top two cards of your library. Put one of them into your graveyard and the other back on top of your library. Then draw a card."' });
const archive = card("Alhammarret's Archive", "Legendary Artifact", "{5}", { oracleText: "If you would gain life, you gain twice that much life instead.\nIf you would draw a card except the first one you draw in each of your draw steps, draw two cards instead." });
const salvage = card("Dakmor Salvage", "Land", "", { keywords: ["Dredge", "Mill"], oracleText: "This land enters tapped.\n{T}: Add {B}.\nDredge 2 (If you would draw a card, you may mill two cards instead. If you do, return this card from your graveyard to your hand.)" });
const cmdr = card("Elf Commander Test", "Legendary Creature — Elf Warrior", "{1}{G}", { power: "3", toughness: "3" });
const cantrip = card("Draw Test", "Sorcery", "{0}", { oracleText: "Draw a card." });

function moveTo(s: GameState, id: string, zone: "hand" | "graveyard") {
  const o = s.objects[id]!;
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  o.zone = zone;
  s.players[o.owner]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
}
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Scion with a commander creature out for `ap`, plus `more` on the battlefield, and a cantrip in hand. */
function table(more: CardDef[] = []) {
  const { s, ap } = setup([]);
  putOnBattlefield(s, ap, scion);
  putOnBattlefield(s, ap, cmdr, { commander: true });
  for (const d of more) putOnBattlefield(s, ap, d);
  const spell = moveTo(s, putOnBattlefield(s, ap, cantrip), "hand");
  // This turn's draw step was before Scion was out: the cantrip's draw is the first one it sees.
  delete s.players[ap]!.firstWouldDraw;
  return { s, ap, spell };
}
const cast = (s: GameState, pid: PlayerId, id: string) => settle(planCast(s, pid, id)!.reduce((x, a) => act(x, a), s));
const pend = (s: GameState) => s.pending as { kind: string; player: PlayerId; cards: string[]; instead?: { archive?: number; dredge?: string[] } };

describe("Scion of Halaster with other draw replacements (CR 616.1)", () => {
  it("with Alhammarret's Archive: the Archive first draws two, and there's no look", () => {
    let { s, ap, spell } = table([archive]);
    const top = s.players[ap]!.library.slice(0, 2);
    const yard = s.players[ap]!.graveyard.length;
    s = cast(s, ap, spell);
    expect(pend(s)).toMatchObject({ kind: "drawLook", player: ap, cards: top, instead: { archive: 2 } });
    s = settle(act(s, { type: "drawLook", player: ap, instead: "archive" }));
    expect(s.pending).toBeNull();
    expect(top.map((id) => s.objects[id]!.zone)).toEqual(["hand", "hand"]);
    expect(s.players[ap]!.graveyard.length).toBe(yard + 1); // just the cantrip
  });

  it("with Alhammarret's Archive: the look first, then the Archive doubles the draw it makes", () => {
    let { s, ap, spell } = table([archive]);
    const top = s.players[ap]!.library.slice(0, 3);
    s = cast(s, ap, spell);
    s = settle(act(s, { type: "drawLook", player: ap, objectId: top[0]! }));
    expect(s.pending).toBeNull();
    expect(top.map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "hand", "hand"]);
  });

  it("with dredge: dredging first mills and returns the card, and there's no look or draw", () => {
    let { s, ap, spell } = table([]);
    const d = moveTo(s, putOnBattlefield(s, ap, salvage), "graveyard");
    const top = s.players[ap]!.library.slice(0, 3);
    s = cast(s, ap, spell);
    expect(pend(s)).toMatchObject({ kind: "drawLook", instead: { dredge: [d] } });
    expect(pend(s).instead!.archive).toBeUndefined();
    s = settle(act(s, { type: "drawLook", player: ap, instead: { dredge: d } }));
    expect(s.pending).toBeNull();
    expect(s.objects[d]!.zone).toBe("hand");
    expect(top.map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "library"]);
  });

  it("with dredge: the look first, and the draw it makes can still be dredged", () => {
    let { s, ap, spell } = table([]);
    const d = moveTo(s, putOnBattlefield(s, ap, salvage), "graveyard");
    const top = s.players[ap]!.library.slice(0, 2);
    s = cast(s, ap, spell);
    s = act(s, { type: "drawLook", player: ap, objectId: top[0]! });
    expect(s.pending).toMatchObject({ kind: "dredge", player: ap, options: [d] });
    s = settle(act(s, { type: "dredge", player: ap, objectId: d }));
    expect(s.objects[d]!.zone).toBe("hand");
    expect(top.map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard"]);
  });

  it("the draw step's first draw: the Archive doesn't apply to it, so it isn't offered; a bot looks first", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, scion);
    putOnBattlefield(s0, ap, cmdr, { commander: true });
    putOnBattlefield(s0, ap, archive);
    let s = passUntil(s0, "upkeep", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!);
    s = passUntil(s, "draw", ap);
    expect(pend(s)).toMatchObject({ kind: "drawLook", player: ap });
    expect(pend(s).instead).toBeUndefined();
    const { s: s1, ap: ap1, spell } = table([archive]);
    let t = cast(s1, ap1, spell);
    t = act(t, botActions(t, ap1)[0]!);
    expect(t.players[ap1]!.graveyard.length).toBe(2); // the cantrip and the card it binned
  });
});
