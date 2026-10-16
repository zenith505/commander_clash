// Cards exiled face down that only the player who exiled them may look at and play (CR 406.3; rulings on Gonti, Rev and
// Three Wishes): until their next turn, for as long as they stay exiled, or while the source stays on the battlefield;
// "mana of any type can be spent to cast it" (CR 609.4b); "without paying its mana cost" (CR 118.9).

import { describe, expect, it } from "vitest";
import { act, card, cast, forest, passUntil, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, mayPlayFromExile, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";
import { moveObject } from "../src/game";
import { addMana } from "../src/spend";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

// Real oracle text (Scryfall).
const wishes = card("Three Wishes", "Instant", "{1}{U}{U}", { oracleText: "Exile the top three cards of your library face down. You may look at those cards for as long as they remain exiled. Until your next turn, you may play those cards. At the beginning of your next upkeep, put any of those cards you didn't play into your graveyard." });
const robbery = card("Outrageous Robbery", "Instant", "{X}{B}{B}", { oracleText: "Target opponent exiles the top X cards of their library face down. You may look at and play those cards for as long as they remain exiled. If you cast a spell this way, you may spend mana as though it were mana of any type to cast it." });
const intet = card("Intet, the Dreamer", "Legendary Creature — Dragon", "{3}{G}{U}{R}", { power: "6", toughness: "6", keywords: ["Flying"], oracleText: "Flying\nWhenever Intet deals combat damage to a player, you may pay {2}{U}. If you do, exile the top card of your library face down. You may look at that card for as long as it remains exiled. You may play that card without paying its mana cost for as long as Intet remains on the battlefield." });
const rev = card("Rev, Tithe Extractor", "Legendary Creature — Human Rogue", "{3}{B}", { power: "3", toughness: "3", oracleText: "Whenever you attack, target creature gains deathtouch until end of turn.\nWhenever one or more creatures you control deal combat damage to a player, create a Treasure token, then look at the top card of that player's library and exile it face down. You may cast that card for as long as it remains exiled. (A Treasure token is an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")" });
const gonti = card("Gonti, Canny Acquisitor", "Legendary Creature — Aetherborn Rogue", "{2}{B}{G}{U}", { power: "5", toughness: "5", oracleText: "Spells you cast but don't own cost {1} less to cast.\nWhenever one or more creatures you control deal combat damage to a player, look at the top card of that player's library, then exile it face down. You may play that card for as long as it remains exiled, and mana of any type can be spent to cast that spell." });
const scarlett = card("Headliner Scarlett", "Legendary Creature — Human Warlock", "{3}{R}", { power: "3", toughness: "3", keywords: ["Haste"], oracleText: "Haste\nWhen Headliner Scarlett enters, creatures target player controls can't block this turn.\nAt the beginning of your upkeep, exile the top card of your library face down. You may look at and play that card this turn." });
const extract = card("Extract Power", "Sorcery", "{5}{U}", { oracleText: "Look at the top card of each player's library, then exile those cards face down. You may play them without paying their mana costs for as long as they remain exiled." });

/** `id`'s triggered ability `index` triggers now, about combat damage to `to`. */
function trigger(s: GameState, pid: PlayerId, id: string, index: number, to?: PlayerId) {
  s.triggerQueue.push({ sourceId: id, sourceCardId: s.objects[id]!.cardId, controller: pid, index, sourceZc: s.objects[id]!.zoneChanges ?? 0, ...(to !== undefined ? { event: { player: to } } : {}) });
  return settle(s);
}
/** Only `pid`'s lands of these names stay on the battlefield. */
function onlyLands(s: GameState, pid: PlayerId, names: string[]) {
  for (const id of [...s.battlefield]) {
    const o = s.objects[id]!;
    if (o.controller === pid && s.cards[o.cardId]!.types.includes("Land") && !names.includes(s.cards[o.cardId]!.name)) moveObject(s, id, "graveyard");
  }
}

describe("face-down exile you may play", () => {
  it("parse", () => supported(wishes, robbery, intet, rev, gonti, scarlett, extract));

  it("Three Wishes: you may look at and play them until your next turn; at your next upkeep the rest go to the graveyard", () => {
    const { s: s0, ap, ids } = setup([wishes]);
    const top = s0.players[ap]!.library.slice(0, 3);
    let s = cast(s0, ap, ids[0]!);
    for (const id of top) {
      expect(s.objects[id]!.zone).toBe("exile");
      expect(s.objects[id]!.hiddenExile?.seen).toEqual([ap]);
      expect(mayPlayFromExile(s, s.objects[id]!, ap)).toBe(true);
    }
    // Play a land from among them (both setups' libraries are Forests and Grizzly Bears).
    const land = top.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest");
    if (land) {
      s = act(s, { type: "playLand", player: ap, objectId: land });
      expect(s.objects[land]!.zone).toBe("battlefield");
    }
    const rest = top.filter((id) => id !== land);
    s = passUntil(s, "upkeep", ap === s.turnOrder[0] ? s.turnOrder[1] : s.turnOrder[0]);
    // Another player's turn: still playable (an instant could be cast then).
    expect(rest.every((id) => mayPlayFromExile(s, s.objects[id]!, ap))).toBe(true);
    s = passUntil(s, "upkeep", ap);
    // Your next turn has begun: no longer, and the upkeep trigger puts them into your graveyard.
    expect(rest.some((id) => mayPlayFromExile(s, s.objects[id]!, ap))).toBe(false);
    s = settle(s);
    for (const id of rest) expect(s.objects[id]!.zone).toBe("graveyard");
  });

  it("Outrageous Robbery: an opponent's cards, played with mana of any type; nobody else may look", () => {
    const { s: s0, ap, opp, ids } = setup([robbery]);
    const olib = s0.players[opp]!.library;
    olib.unshift(...olib.splice(olib.findIndex((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Grizzly Bears"), 1));
    const theirs = olib.slice(0, 2);
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, undefined, 2)!) s = act(s, a);
    s = settle(s);
    for (const id of theirs) {
      expect(s.objects[id]!.zone).toBe("exile");
      expect(s.objects[id]!.owner).toBe(opp);
      expect(s.objects[id]!.hiddenExile?.seen).toEqual([ap]);
      expect(s.objects[id]!.mayPlay).toMatchObject({ player: ap, anyType: true });
      expect(mayPlayFromExile(s, s.objects[id]!, opp)).toBe(false);
    }
    // Their Grizzly Bears ({1}{G}) with only Islands untapped.
    const bear = theirs[0]!;
    onlyLands(s, ap, ["Island"]);
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap) s.objects[id]!.tapped = false;
    s = cast(s, ap, bear);
    expect(s.objects[bear]!.zone).toBe("battlefield");
    expect(s.objects[bear]!.controller).toBe(ap);
  });

  it("Gonti: its trigger exiles that player's top card; casting it costs {1} less and any type of mana", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, gonti);
    // Their top card is a Grizzly Bears.
    const lib = s0.players[opp]!.library;
    const bearAt = lib.findIndex((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Grizzly Bears");
    lib.unshift(...lib.splice(bearAt, 1));
    const bear = lib[0]!;
    let s = trigger(s0, ap, g, 0, opp);
    expect(s.objects[bear]!.zone).toBe("exile");
    expect(s.objects[bear]!.hiddenExile?.seen).toEqual([ap]);
    // One Island pays for it: {1}{G} less {1}, any type.
    onlyLands(s, ap, ["Island"]);
    let islands = s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.name === "Island");
    for (const id of islands.slice(1)) moveObject(s, id, "graveyard");
    islands = islands.slice(0, 1);
    s = cast(s, ap, bear);
    expect(s.objects[bear]!.zone).toBe("battlefield");
    expect(s.objects[islands[0]!]!.tapped).toBe(true);
  });

  it("Rev: cast only, so a land exiled this way can't be played (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, rev);
    const lib = s0.players[opp]!.library;
    const at = lib.findIndex((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Forest");
    lib.unshift(...lib.splice(at, 1));
    const top = lib[0]!;
    const s = trigger(s0, ap, r, 1, opp);
    expect(s.objects[top]!.zone).toBe("exile");
    expect(mayPlayFromExile(s, s.objects[top]!, ap)).toBe(false);
    expect(s.battlefield.some((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap)).toBe(true); // the Treasure
  });

  it("Intet: pay {2}{U}, then play it free while Intet stays on the battlefield", () => {
    const { s: s0, ap, opp } = setup([]);
    const i = putOnBattlefield(s0, ap, intet);
    const lib = s0.players[ap]!.library;
    const at = lib.findIndex((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Grizzly Bears");
    lib.unshift(...lib.splice(at, 1));
    const bear = lib[0]!;
    let s = trigger(s0, ap, i, 0, opp);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    addMana(s, ap, ["U", "C", "C"]);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[bear]!.zone).toBe("exile");
    expect(s.objects[bear]!.hiddenExile?.seen).toEqual([ap]);
    // Free: no lands needed.
    onlyLands(s, ap, []);
    expect(mayPlayFromExile(s, s.objects[bear]!, ap)).toBe(true);
    // Once Intet leaves, it can't be played (rulings), though you may still look at it.
    moveObject(s, i, "graveyard");
    expect(mayPlayFromExile(s, s.objects[bear]!, ap)).toBe(false);
    expect(s.objects[bear]!.hiddenExile?.seen).toEqual([ap]);
  });

  it("Intet: the bear is cast without paying its mana cost", () => {
    const { s: s0, ap, opp } = setup([]);
    const i = putOnBattlefield(s0, ap, intet);
    const lib = s0.players[ap]!.library;
    const at = lib.findIndex((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Grizzly Bears");
    lib.unshift(...lib.splice(at, 1));
    const bear = lib[0]!;
    let s = trigger(s0, ap, i, 0, opp);
    addMana(s, ap, ["U", "C", "C"]);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    onlyLands(s, ap, []);
    s = cast(s, ap, bear);
    expect(s.objects[bear]!.zone).toBe("battlefield");
  });

  it("Headliner Scarlett: this turn only", () => {
    const { s: s0, ap } = setup([]);
    const h = putOnBattlefield(s0, ap, scarlett);
    const top = s0.players[ap]!.library[0]!;
    let s = trigger(s0, ap, h, 1);
    expect(mayPlayFromExile(s, s.objects[top]!, ap)).toBe(true);
    s = passUntil(s, "upkeep", s.turnOrder.find((p) => p !== ap));
    expect(mayPlayFromExile(s, s.objects[top]!, ap)).toBe(false);
    void forest;
  });
});
