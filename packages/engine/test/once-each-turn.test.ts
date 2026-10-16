// "This ability triggers only once each turn" (the object's own count; a new object starts over, CR 400.7; a permanent
// leaving the battlefield looks back at the one it was, CR 603.10a) and "Do this only once each turn" after "you may"
// (CR 603.2h: it triggers only if its controller hasn't chosen to do it this turn, rulings on Ancient Cornucopia).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, isFullySupported, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const tokens = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.objects[id]!.isToken && s.cards[s.objects[id]!.cardId]!.name === name);

/** Pass priority and let bots answer every choice until the stack and the trigger queue are empty; `answer` gives
 * the test's own answer. */
function settle(s: GameState, answer?: (s: GameState) => Action | undefined) {
  for (let i = 0; i < 120 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    const mine = answer?.(s);
    if (mine) s = act(s, mine);
    else if (s.pending) s = act(s, botActions(s, pid)[0]!);
    else s = act(s, { type: "passPriority", player: pid });
  }
  return s;
}
/** Activate the altar, sacrificing `id`. */
function sacrifice(s: GameState, pid: PlayerId, altarId: string, id: string) {
  return act(s, { type: "activateAbility", player: pid, objectId: altarId, index: 0, costs: { sacrifice: [id] } });
}
const mayAnswer = (yes: boolean, asked: string[] = []) => (s: GameState): Action | undefined => {
  if (s.pending?.kind !== "chooseMay") return undefined;
  asked.push(s.pending.prompt);
  return { type: "chooseMay", player: s.pending.player, yes };
};

// Real oracle text (Scryfall).
const varis = card("Varis, Silverymoon Ranger", "Legendary Creature — Human Elf Ranger", "{1}{G}{G}", { power: "3", toughness: "3", keywords: ["Reach", "Ward", "Venture into the dungeon"], oracleText: "Reach, ward {1}\nWhenever you cast a creature or planeswalker spell, venture into the dungeon. This ability triggers only once each turn. (To venture into the dungeon, enter the first room or advance to the next room.)\nWhenever you complete a dungeon, create a 2/2 green Wolf creature token." });
const kingpin = card("Kingpin, Wilson Fisk", "Legendary Creature — Human Villain", "{3}{B}", { power: "3", toughness: "6", keywords: ["Treasure", "Menace"], oracleText: "Menace\nWhenever you sacrifice Kingpin or another creature, create two Treasure tokens. This ability triggers only once each turn. (They're artifacts with \"{T}, Sacrifice this token: Add one mana of any color.\")" });
const leonardo = card("Leonardo, the Balance", "Legendary Creature — Mutant Ninja Turtle", "{3}{W}", { power: "3", toughness: "3", keywords: ["Partner"], oracleText: "Whenever a token you control enters, you may put a +1/+1 counter on each creature you control. Do this only once each turn.\n{W}{U}{B}{R}{G}: Creatures you control gain menace, trample, and lifelink until end of turn.\nPartner—Character select (You can have two commanders if both have this ability.)" });
const mechanAssembler = card("Mechan Assembler", "Artifact Creature — Robot Artificer", "{4}{U}", { power: "4", toughness: "4", oracleText: "Whenever another artifact you control enters, create a 2/2 colorless Robot artifact creature token. This ability triggers only once each turn." });
const irreverentGremlin = card("Irreverent Gremlin", "Creature — Gremlin", "{1}{R}", { power: "2", toughness: "2", keywords: ["Menace"], oracleText: "Menace\nWhenever another creature you control with power 2 or less enters, you may discard a card. If you do, draw a card. Do this only once each turn." });
// Test cards.
const altar = card("Test Altar", "Artifact", "{1}", { oracleText: "Sacrifice a creature: You gain 1 life." });
const soldiers = card("Raise the Soldiers", "Instant", "{W}", { oracleText: "Create a 1/1 white Soldier creature token." });
const trinket = card("Trinket", "Artifact", "{1}");

describe("triggers only once each turn", () => {
  it("parses", () => supported(varis, kingpin, leonardo, mechanAssembler, irreverentGremlin));

  it("Varis: the second creature spell of the turn doesn't venture again; the next turn it does", () => {
    const { s: s0, ap, ids } = setup([bear(), bear(), bear()]);
    putOnBattlefield(s0, ap, varis);
    let s = settle(cast(s0, ap, ids[0]!));
    expect(s.players[ap]!.dungeon?.room).toBe(0);
    s = settle(cast(s, ap, ids[1]!));
    expect(s.players[ap]!.dungeon?.room).toBe(0);
    // A turn later, once again.
    s = passUntil(s, "main1", ap, 4000);
    s = passUntil(passUntil(s, "end"), "main1", ap, 4000);
    expect(s.players[ap]!.dungeon?.room).toBe(0);
    s = settle(cast(s, ap, ids[2]!));
    expect(s.players[ap]!.dungeon?.room).not.toBe(0);
  });

  it("Kingpin: the first sacrifice makes Treasures, the second doesn't; Kingpin sacrificed itself after that still remembers", () => {
    const { s: s0, ap } = setup([]);
    const k = putOnBattlefield(s0, ap, kingpin);
    const a = putOnBattlefield(s0, ap, altar);
    const b1 = putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, ap, bear());
    const sac = (s: GameState, id: string) => settle(sacrifice(s, ap, a, id));
    let s = sac(s0, b1);
    expect(tokens(s, ap, "Treasure Token")).toHaveLength(2);
    s = sac(s, k);
    expect(tokens(s, ap, "Treasure Token")).toHaveLength(2);
  });

  it("Kingpin sacrificing itself first triggers once", () => {
    const { s: s0, ap } = setup([]);
    const k = putOnBattlefield(s0, ap, kingpin);
    const a = putOnBattlefield(s0, ap, altar);
    const s = settle(sacrifice(s0, ap, a, k));
    expect(tokens(s, ap, "Treasure Token")).toHaveLength(2);
  });

  it("Mechan Assembler: one Robot for the first artifact of the turn, none for the second", () => {
    const { s: s0, ap, ids } = setup([trinket, trinket]);
    putOnBattlefield(s0, ap, mechanAssembler);
    let s = settle(cast(s0, ap, ids[0]!));
    expect(tokens(s, ap, "Robot Token")).toHaveLength(1);
    s = settle(cast(s, ap, ids[1]!));
    expect(tokens(s, ap, "Robot Token")).toHaveLength(1);
  });
});

describe("do this only once each turn", () => {
  it("Leonardo: saying no lets it trigger again; once it's done, it doesn't trigger again that turn", () => {
    const { s: s0, ap, ids } = setup([soldiers, soldiers, soldiers]);
    const leo = putOnBattlefield(s0, ap, leonardo);
    const asked: string[] = [];
    let s = settle(cast(s0, ap, ids[0]!), mayAnswer(false, asked));
    expect(asked).toHaveLength(1);
    expect(s.objects[leo]!.counters["+1/+1"] ?? 0).toBe(0);
    s = settle(cast(s, ap, ids[1]!), mayAnswer(true, asked));
    expect(asked).toHaveLength(2);
    expect(s.objects[leo]!.counters["+1/+1"]).toBe(1);
    s = settle(cast(s, ap, ids[2]!), mayAnswer(true, asked));
    expect(asked).toHaveLength(2); // didn't trigger
    expect(s.objects[leo]!.counters["+1/+1"]).toBe(1);
  });

  it("Irreverent Gremlin: the discard is what counts; \"if you do\" follows it", () => {
    const { s: s0, ap, ids } = setup([bear({ power: "1", toughness: "1", name: "Elf A" }), bear({ power: "1", toughness: "1", name: "Elf B" }), bear()]);
    putOnBattlefield(s0, ap, irreverentGremlin);
    const asked: string[] = [];
    let s = settle(cast(s0, ap, ids[0]!), mayAnswer(true, asked));
    expect(asked).toHaveLength(1);
    const hand = s.players[ap]!.hand.length;
    s = settle(cast(s, ap, ids[1]!), mayAnswer(true, asked));
    expect(asked).toHaveLength(1);
    expect(s.players[ap]!.hand.length).toBe(hand - 1); // only the Elf B left the hand
  });
});
