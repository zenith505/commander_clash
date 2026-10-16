// "Reveal the top card of your library. If it's a X card, A. Otherwise, B." (CR 701.20a): the revealed card stays in
// the library until an instruction moves it, so "it" refers to that card only while it is still there. And "Its owner
// creates ..." after "Exile target card from a graveyard" (the owner of that card, not the controller of the spell).

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, forest, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, objHasKeyword, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
};
const inGraveyard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
};
const tokensOf = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid);

// Real oracle text (Scryfall).
const nylea = card("Nylea, Keen-Eyed", "Legendary Enchantment Creature — God", "{3}{G}", { power: "5", toughness: "6", keywords: ["Indestructible"], oracleText: "Indestructible\nAs long as your devotion to green is less than five, Nylea isn't a creature.\nCreature spells you cast cost {1} less to cast.\n{2}{G}: Reveal the top card of your library. If it's a creature card, put it into your hand. Otherwise, you may put it into your graveyard." });
const oracle = card("Coiling Oracle", "Creature — Snake Elf Druid", "{G}{U}", { power: "1", toughness: "1", oracleText: "When this creature enters, reveal the top card of your library. If it's a land card, put it onto the battlefield. Otherwise, put that card into your hand." });
const raid = card("Impromptu Raid", "Enchantment", "{3}{R/G}", { oracleText: "{2}{R/G}: Reveal the top card of your library. If it isn't a creature card, put it into your graveyard. Otherwise, put that card onto the battlefield. That creature gains haste. Sacrifice it at the beginning of the next end step." });
const thrasios = card("Thrasios, Triton Hero", "Legendary Creature — Merfolk Wizard", "{G}{U}", { power: "1", toughness: "3", keywords: ["Partner"], oracleText: "{4}: Scry 1, then reveal the top card of your library. If it's a land card, put it onto the battlefield tapped. Otherwise, draw a card.\nPartner (You can have two commanders if both have partner.)" });
const pyre = card("Funeral Pyre", "Instant", "{W}", { oracleText: "Exile target card from a graveyard. Its owner creates a 1/1 white Spirit creature token with flying." });
const pharika = card("Pharika, God of Affliction", "Legendary Enchantment Creature — God", "{1}{B}{G}", { power: "5", toughness: "5", keywords: ["Indestructible"], oracleText: "Indestructible\nAs long as your devotion to black and green is less than seven, Pharika isn't a creature.\n{B}{G}: Exile target creature card from a graveyard. Its owner creates a 1/1 black and green Snake enchantment creature token with deathtouch." });
const brutal = card("Brutal Deceiver", "Creature — Spirit", "{2}{R}", { power: "2", toughness: "2", oracleText: "{1}: Look at the top card of your library.\n{2}: Reveal the top card of your library. If it's a land card, this creature gets +1/+0 and gains first strike until end of turn. Activate only once each turn." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });

describe("reveal the top card", () => {
  it("compiles", () => supported(nylea, oracle, raid, thrasios, pyre, pharika, brutal));

  it("Brutal Deceiver: look at the top card (it stays there); reveal a land for +1/+0 and first strike, once each turn", () => {
    const { s: s0, ap } = setup([]);
    const d = putOnBattlefield(s0, ap, brutal);
    const l = onTop(s0, ap, forest);
    let s = settle(activate(s0, ap, d, 0));
    expect(s.pending).toMatchObject({ kind: "arrangeTop", how: "look", cards: [l] });
    expect(() => act(s, { type: "arrangeTop", player: ap, top: [], away: [l] })).toThrow(/back on top/);
    s = settle(act(s, { type: "arrangeTop", player: ap, top: [l], away: [] }));
    expect(s.players[ap]!.library[0]).toBe(l);
    s = settle(activate(s, ap, d, 1));
    expect(pt(s, d)).toBe("3/2");
    expect(objHasKeyword(s, s.objects[d]!, "First strike")).toBe(true);
    expect(s.players[ap]!.library[0]).toBe(l);
    expect(() => activate(s, ap, d, 1)).toThrow();
  });

  it("Brutal Deceiver: a nonland revealed does nothing", () => {
    const { s: s0, ap } = setup([]);
    const d = putOnBattlefield(s0, ap, brutal);
    onTop(s0, ap, shock);
    const s = settle(activate(s0, ap, d, 1));
    expect(pt(s, d)).toBe("2/2");
  });

  it("Nylea: a creature card goes to hand; otherwise you may put it into your graveyard", () => {
    const { s: s0, ap } = setup([]);
    const n = putOnBattlefield(s0, ap, nylea);
    const b = onTop(s0, ap, bear());
    let s = settle(activate(s0, ap, n, 0));
    expect(s.players[ap]!.hand).toContain(b);
    const sh = onTop(s, ap, shock);
    s = settle(activate(s, ap, n, 0));
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.players[ap]!.graveyard).toContain(sh);
    const sh2 = onTop(s, ap, shock);
    s = settle(activate(s, ap, n, 0));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.players[ap]!.library[0]).toBe(sh2);
  });

  it("Coiling Oracle: a land goes onto the battlefield, anything else to hand", () => {
    const { s: s0, ap, ids } = setup([oracle, oracle]);
    const l = onTop(s0, ap, forest);
    let s = settle(cast(s0, ap, ids[0]!));
    expect(s.objects[l]!.zone).toBe("battlefield");
    expect(s.objects[l]!.controller).toBe(ap);
    const sh = onTop(s, ap, shock);
    s = settle(cast(s, ap, ids[1]!));
    expect(s.players[ap]!.hand).toContain(sh);
  });

  it("Impromptu Raid: a creature enters with haste and is sacrificed at the next end step; a noncreature is milled", () => {
    const { s: s0, ap } = setup([]);
    const r = putOnBattlefield(s0, ap, raid);
    const sh = onTop(s0, ap, shock);
    let s = settle(activate(s0, ap, r, 0));
    expect(s.players[ap]!.graveyard).toContain(sh);
    const b = onTop(s, ap, bear());
    s = settle(activate(s, ap, r, 0));
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(objHasKeyword(s, s.objects[b]!, "Haste")).toBe(true);
    s = settle(passUntil(s, "end", ap));
    s = settle(s);
    expect(s.players[ap]!.graveyard).toContain(b);
    expect(s.activePlayer).toBe(ap);
  });

  it("Thrasios: scry 1 first, then a land enters tapped; otherwise draw (the revealed card)", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, thrasios);
    const l = onTop(s0, ap, forest);
    let s = settle(activate(s0, ap, t, 0));
    expect(s.pending?.kind).toBe("arrangeTop");
    s = settle(act(s, { type: "arrangeTop", player: ap, top: [l], away: [] }));
    expect(s.objects[l]!.zone).toBe("battlefield");
    expect(s.objects[l]!.tapped).toBe(true);
    const sh = onTop(s, ap, shock);
    s = settle(activate(s, ap, t, 0));
    s = settle(act(s, { type: "arrangeTop", player: ap, top: [sh], away: [] }));
    expect(s.players[ap]!.hand).toContain(sh);
  });

  it("an empty library reveals nothing and does nothing", () => {
    const { s: s0, ap } = setup([]);
    const n = putOnBattlefield(s0, ap, nylea);
    s0.players[ap]!.library = [];
    const s = settle(activate(s0, ap, n, 0));
    expect(s.pending).toBeFalsy();
    expect(s.players[ap]!.hand.length).toBe(s0.players[ap]!.hand.length);
  });
});

describe("its owner", () => {
  it("Funeral Pyre: the owner of the exiled card gets the token", () => {
    const { s: s0, ap, opp, ids } = setup([pyre]);
    const theirs = inGraveyard(s0, opp, shock);
    const s = settle(cast(s0, ap, ids[0]!, [target(theirs)]));
    expect(s.objects[theirs]!.zone).toBe("exile");
    expect(tokensOf(s, opp)).toHaveLength(1);
    expect(tokensOf(s, ap)).toHaveLength(0);
  });

  it("Pharika: a creature card from any graveyard; its owner gets the Snake", () => {
    const { s: s0, ap, opp } = setup([]);
    const p = putOnBattlefield(s0, ap, pharika);
    const theirs = inGraveyard(s0, opp, bear());
    const s = settle(activate(s0, ap, p, 0, [target(theirs)]));
    const [snake] = tokensOf(s, opp);
    expect(snake).toBeDefined();
    expect(objHasKeyword(s, s.objects[snake!]!, "Deathtouch")).toBe(true);
    expect(tokensOf(s, ap)).toHaveLength(0);
  });
});
