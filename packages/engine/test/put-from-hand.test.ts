// "You may put a land card from your hand onto the battlefield": the player picks as it resolves (CR 608.2d); it
// isn't playing a land (CR 305.4), so it doesn't use the turn's land drop.

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, putOnBattlefield, setup } from "./helpers";
import { botActions, isFullySupported, waitingOn, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const scout = card("Llanowar Scout", "Creature — Elf Scout", "{1}{G}", { power: "1", toughness: "3", oracleText: "{T}: You may put a land card from your hand onto the battlefield." });
const ghalta = card("Ghalta, Stampede Tyrant", "Legendary Creature — Elder Dinosaur", "{5}{G}{G}{G}", {
  power: "12",
  toughness: "12",
  keywords: ["Trample"],
  oracleText: "Trample\nWhen Ghalta enters, put any number of creature cards from your hand onto the battlefield.",
});
const embrace = card("Embrace the Paradox", "Instant", "{3}{G}{U}", { oracleText: "Draw three cards. You may put a land card from your hand onto the battlefield tapped." });
const aura = card("Briarhorn Aura", "Enchantment — Aura", "{G}", { oracleText: "Enchant creature\nEnchanted creature gets +1/+1." });
const forest = card("Forest", "Basic Land — Forest");

const toChoice = (s: GameState) => {
  for (let i = 0; i < 20 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("putting a card from your hand onto the battlefield", () => {
  it("compiles; 'an Aura card' doesn't (it would need something to enchant)", () => {
    supported(scout, ghalta, embrace);
    expect(isFullySupported(card("Aura Bearer", "Creature — Elf", "{G}", { oracleText: "{T}: You may put an Aura card from your hand onto the battlefield." }))).toBe(false);
  });

  it("Llanowar Scout: pick a land from the hand, or none; the land drop is still there", () => {
    const { s: s0, ap, ids } = setup([forest, aura]);
    const scoutId = putOnBattlefield(s0, ap, scout);
    let s = toChoice(activate(s0, ap, scoutId, 0));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, fromHand: true, cards: expect.arrayContaining([ids[0]]), min: 0, max: 1 });
    if (s.pending?.kind === "searchLibrary") expect(s.pending.cards).not.toContain(ids[1]);
    s = toChoice(act(s, { type: "searchLibrary", player: ap, found: [ids[0]!] }));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[0]!]!.tapped).toBe(false);
    expect(s.players[ap]!.landsPlayedThisTurn).toBe(0);
  });

  it("Ghalta: any number of creature cards, chosen by the bot too", () => {
    const { s: s0, ap, ids } = setup([ghalta, bear(), bear(), forest]);
    let s = toChoice(cast(s0, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", cards: expect.arrayContaining([ids[1], ids[2]]), min: 0 });
    if (s.pending?.kind === "searchLibrary") expect(s.pending.cards).not.toContain(ids[3]);
    s = toChoice(act(s, botActions(s, ap)[0]!));
    expect([ids[1], ids[2]].every((id) => s.objects[id!]!.zone === "battlefield")).toBe(true);
    expect(s.objects[ids[3]!]!.zone).toBe("hand");
  });
});
