// Triggered abilities that work from the graveyard: an ability whose effect moves the card out of a zone functions
// only in that zone (CR 113.6m), and the card's owner controls it (CR 113.8). The Eidolons, Squee, Akoum Firebird.

import { describe, expect, it } from "vitest";
import { act, card, cast, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { botActions, compileCard, planCast, isFullySupported, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const eidolon = card("Aurora Eidolon", "Creature — Spirit", "{3}{W}", {
  power: "2",
  toughness: "2",
  oracleText: "{W}, Sacrifice this creature: Prevent the next 3 damage that would be dealt to any target this turn.\nWhenever you cast a multicolored spell, you may return this card from your graveyard to your hand.",
});
const squee = card("Squee, Goblin Nabob", "Legendary Creature — Goblin", "{2}{R}", { power: "1", toughness: "1", oracleText: "At the beginning of your upkeep, you may return this card from your graveyard to your hand." });
const firebird = card("Akoum Firebird", "Creature — Phoenix", "{2}{R}{R}", {
  power: "3",
  toughness: "3",
  keywords: ["Landfall", "Flying", "Haste"],
  oracleText: "Flying, haste\nThis creature attacks each combat if able.\nLandfall — Whenever a land you control enters, you may pay {4}{R}{R}. If you do, return this card from your graveyard to the battlefield.",
});
const killians = card("Killian's Confidence", "Sorcery", "{W}{B}", {
  oracleText: "Target creature gets +1/+1 until end of turn. Draw a card.\nWhenever one or more creatures you control deal combat damage to a player, you may pay {W/B}. If you do, return this card from your graveyard to your hand.",
});
const screams = card("Screams from Within", "Enchantment — Aura", "{1}{B}{B}", {
  keywords: ["Enchant"],
  oracleText: "Enchant creature\nEnchanted creature gets -1/-1.\nWhen enchanted creature dies, return this card from your graveyard to the battlefield.",
});
const gold = card("Azorius Guildmage", "Creature — Vedalken Wizard", "{W}{U}", { power: "2", toughness: "2" });
const mono = card("Coral Merfolk", "Creature — Merfolk", "{1}{U}", { power: "2", toughness: "1" });
const land = card("Mountain", "Basic Land — Mountain");

/** Put a copy of `def` into `pid`'s graveyard. */
function inGraveyard(s: GameState, pid: PlayerId, def: CardDef) {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
}
/** Pass priority until a decision is pending or the stack is empty. */
function toChoice(s: GameState) {
  for (let i = 0; i < 20 && !s.pending && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}

describe("triggers from the graveyard (CR 113.6m)", () => {
  it("compile; an Aura's 'when enchanted creature dies, return this card' isn't one (it works on the battlefield)", () => {
    supported(eidolon, squee, firebird, killians);
    expect(compileCard(eidolon).triggers[0]!.zone).toBe("graveyard");
    expect(compileCard(squee).triggers[0]!.zone).toBe("graveyard");
    expect(isFullySupported(screams)).toBe(false);
  });

  it("an Eidolon returns when its owner casts a multicolored spell, not a monocolored one (CR 105.4)", () => {
    const { s: s0, ap, ids } = setup([mono, gold]);
    const e = inGraveyard(s0, ap, eidolon);
    let s = cast(s0, ap, ids[0]!);
    expect(s.stack.length + (s.pending ? 1 : 0)).toBe(0);
    expect(s.objects[e]!.zone).toBe("graveyard");
    s = cast(s, ap, ids[1]!);
    s = toChoice(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = toChoice(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[e]!.zone).toBe("hand");
    expect(s.players[ap]!.hand).toContain(e);
  });

  it("only from the graveyard: on the battlefield it doesn't trigger, and another player's spell doesn't count", () => {
    const { s: s0, ap, opp, ids } = setup([gold]);
    putOnBattlefield(s0, ap, eidolon);
    inGraveyard(s0, opp, eidolon);
    const s = cast(s0, ap, ids[0]!);
    expect(s.stack.length).toBe(0);
    expect(s.pending).toBeNull();
  });

  it("does nothing if the card left the graveyard before it resolves (CR 400.7)", () => {
    const { s: s0, ap, ids } = setup([gold]);
    const e = inGraveyard(s0, ap, eidolon);
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!)!) s = act(s, a);
    expect(s.stack.some((x) => x.sourceId === e)).toBe(true);
    // As if exiled in response: a new object (CR 400.7).
    s.players[ap]!.graveyard = s.players[ap]!.graveyard.filter((x) => x !== e);
    s.objects[e]!.zone = "exile";
    s.objects[e]!.zoneChanges = (s.objects[e]!.zoneChanges ?? 0) + 1;
    s.players[ap]!.exile.push(e);
    s = toChoice(s);
    if (s.pending?.kind === "chooseMay") s = toChoice(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[e]!.zone).toBe("exile");
  });

  it("Squee returns at its owner's upkeep; the bot says yes", () => {
    const { s: s0, ap } = setup([]);
    const q = inGraveyard(s0, ap, squee);
    // Other players' upkeeps go by without a trigger (passUntil would stop on a pending choice).
    let s = passUntil(s0, "upkeep", ap);
    expect(s.objects[q]!.zone).toBe("graveyard");
    s = toChoice(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = toChoice(act(s, botActions(s, ap)[0]!));
    expect(s.objects[q]!.zone).toBe("hand");
  });

  it("Akoum Firebird: landfall from the graveyard, paying {4}{R}{R} to return it to the battlefield", () => {
    const { s: s0, ap, ids } = setup([land]);
    const f = inGraveyard(s0, ap, firebird);
    let s = act(s0, { type: "playLand", player: ap, objectId: ids[0]! });
    s = toChoice(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, pay: { mana: "{4}{R}{R}" } });
    const untapped = (name: string) => s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === name && !s.objects[id]!.tapped);
    for (const m of untapped("Mountain").slice(0, 2)) s = act(s, { type: "activateMana", player: ap, objectId: m, mana: "R" });
    for (const m of untapped("Forest").slice(0, 3)) s = act(s, { type: "activateMana", player: ap, objectId: m, mana: "G" });
    s = act(s, { type: "activateMana", player: ap, objectId: untapped("Island")[0]!, mana: "U" });
    s = toChoice(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[f]!.zone).toBe("battlefield");
  });
});

describe("spell and enchantment subtypes in filters (CR 205.3h, 205.3k)", () => {
  const onna = card("Haru-Onna", "Creature — Spirit", "{3}{G}", { power: "2", toughness: "1", oracleText: "When this creature enters, draw a card.\nWhenever you cast a Spirit or Arcane spell, you may return this creature to its owner's hand." });
  const trial = card("Trial of Ambition", "Enchantment", "{1}{B}", { oracleText: "When this enchantment enters, target opponent sacrifices a creature of their choice.\nWhen a Cartouche you control enters, return this enchantment to its owner's hand." });
  const arcane = card("Peer Through Depths", "Instant — Arcane", "{1}{U}", { oracleText: "Look at the top five cards of your library. You may reveal an instant or sorcery card from among them and put it into your hand. Put the rest back in any order." });
  const plainInstant = card("Brainstorm", "Instant", "{U}", { oracleText: "Draw three cards, then put two cards from your hand on top of your library in any order." });

  it("the Onna return on a Spirit or Arcane spell; the Trials on a Cartouche", () => {
    supported(onna, trial);
    // A spell that's neither: only Brainstorm goes on the stack.
    const { s: s0, ap, ids } = setup([plainInstant, arcane]);
    const o = putOnBattlefield(s0, ap, onna);
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!)!) s = act(s, a);
    expect(s.stack.length).toBe(1);
    s = toChoice(s);
    // An Arcane one: the Onna's trigger goes on top of it.
    for (const a of planCast(s, ap, ids[1]!)!) s = act(s, a);
    expect(s.stack.length).toBe(2);
    s = toChoice(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay" });
    s = toChoice(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[o]!.zone).toBe("hand");
  });
});

describe("returning an Aura from the graveyard attached to the entering creature (CR 303.4f)", () => {
  const scales = card("Dragon Scales", "Enchantment — Aura", "{1}{W}", {
    keywords: ["Enchant"],
    oracleText: "Enchant creature\nEnchanted creature gets +1/+2 and has vigilance.\nWhen a creature with mana value 6 or greater enters, you may return this card from your graveyard to the battlefield attached to that creature.",
  });
  const big = card("Craw Wurm", "Creature — Wurm", "{4}{G}{G}", { power: "6", toughness: "4", cmc: 6 });
  const bigWhiteProof = card("Wurm of Purity", "Creature — Wurm", "{4}{G}{G}", { power: "6", toughness: "4", cmc: 6, keywords: ["Protection from white"], oracleText: "Protection from white" });

  it("attaches to that creature; one with protection from white can't have it, so it stays (CR 303.4d, 303.4g)", () => {
    supported(scales);
    const { s: s0, ap, ids } = setup([big, bigWhiteProof]);
    const sc = inGraveyard(s0, ap, scales);
    let s = toChoice(cast(s0, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = toChoice(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[sc]!.zone).toBe("battlefield");
    expect(s.objects[sc]!.attachedTo).toBe(ids[0]);
    expect(pt(s, ids[0]!)).toBe("7/6");

    const t = setup([bigWhiteProof]);
    const sc2 = inGraveyard(t.s, t.ap, scales);
    let u = toChoice(cast(t.s, t.ap, t.ids[0]!));
    u = toChoice(act(u, { type: "chooseMay", player: t.ap, yes: true }));
    expect(u.objects[sc2]!.zone).toBe("graveyard");
  });
});
