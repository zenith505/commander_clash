// Round 90, second batch: Kami of Whispered Hopes (+1/+1 counters on any permanent you control, plus one), Beastmaster
// Ascension (a static with "seven or more quest counters"), Sram (cast trigger for a list of subtypes), Goblin
// Anarchomancer ("each spell you cast that's red or green"), Pyroblast (any target, its color checked as it resolves,
// rulings), Laboratory Maniac (a draw from an empty library replaced by a win, CR 614.1a), Thassa's Oracle (devotion,
// CR 700.5, and a win check) and Mayhem Devil ("whenever a player sacrifices a permanent").

import { describe, expect, it } from "vitest";
import { act, card, cast, pt, putOnBattlefield, setup, target } from "./helpers";
import { botActions, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const kami = card("Kami of Whispered Hopes", "Creature — Spirit", "{1}{G}", { power: "0", toughness: "0", oracleText: "This creature enters with a +1/+1 counter on it.\nIf one or more +1/+1 counters would be put on a permanent you control, that many plus one +1/+1 counters are put on that permanent instead.\n{T}: Add X mana of any one color, where X is this creature's power." });
const ascension = card("Beastmaster Ascension", "Enchantment", "{2}{G}", { oracleText: "Whenever a creature you control attacks, you may put a quest counter on this enchantment.\nAs long as this enchantment has seven or more quest counters on it, creatures you control get +5/+5." });
const sram = card("Sram, Senior Edificer", "Legendary Creature — Dwarf Advisor", "{1}{W}", { power: "2", toughness: "2", oracleText: "Whenever you cast an Aura, Equipment, or Vehicle spell, draw a card." });
const anarchomancer = card("Goblin Anarchomancer", "Creature — Goblin Shaman", "{R}{G}", { power: "2", toughness: "2", oracleText: "Each spell you cast that's red or green costs {1} less to cast." });
const pyroblast = card("Pyroblast", "Instant", "{R}", { oracleText: "Choose one —\n• Counter target spell if it's blue.\n• Destroy target permanent if it's blue." });
const labMan = card("Laboratory Maniac", "Creature — Human Wizard", "{2}{U}", { power: "2", toughness: "2", oracleText: "If you would draw a card while your library has no cards in it, you win the game instead." });
const oracle = card("Thassa's Oracle", "Creature — Merfolk Wizard", "{U}{U}", { power: "1", toughness: "3", oracleText: "When this creature enters, look at the top X cards of your library, where X is your devotion to blue. Put up to one of them on top of your library and the rest on the bottom of your library in a random order. If X is greater than or equal to the number of cards in your library, you win the game. (Each {U} in the mana costs of permanents you control counts toward your devotion to blue.)" });
const devil = card("Mayhem Devil", "Creature — Devil", "{1}{B}{R}", { power: "3", toughness: "3", oracleText: "Whenever a player sacrifices a permanent, this creature deals 1 damage to any target." });
const blueGuy = card("Blue Guy", "Creature — Merfolk", "{U}", { power: "1", toughness: "1" });
const redGuy = card("Red Guy", "Creature — Goblin", "{R}", { power: "1", toughness: "1" });
const ponder = card("Blue Draw", "Instant", "{U}", { oracleText: "Draw a card." });
const aura = card("Small Aura", "Enchantment — Aura", "{W}", { oracleText: "Enchant creature\nEnchanted creature gets +1/+1." });
const growth = card("Big Growth", "Instant", "{3}{G}", { oracleText: "Put a +1/+1 counter on target creature." });
const fling = card("Sac Outlet", "Artifact", "{1}", { oracleText: "Sacrifice a creature: You gain 1 life." });

function settle(s: GameState): GameState {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}

describe("round 90 statics and wins", () => {
  it("parse", () => {
    for (const c of [kami, ascension, sram, anarchomancer, pyroblast, labMan, oracle, devil]) expect(isFullySupported(c), c.name).toBe(true);
  });

  it("Kami of Whispered Hopes: one more +1/+1 counter on any permanent you control", () => {
    const { s: s0, ap, ids } = setup([growth]);
    const k = putOnBattlefield(s0, ap, kami);
    s0.objects[k]!.counters["+1/+1"] = 1; // it enters with one (put on directly here)
    const b = putOnBattlefield(s0, ap, card("Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    const s = settle(cast(s0, ap, ids[0]!, [target(b)]));
    expect(s.objects[b]!.counters["+1/+1"]).toBe(2);
    expect(pt(s, b)).toBe("4/4");
  });

  it("Beastmaster Ascension: +5/+5 only from seven quest counters on", () => {
    const { s, ap } = setup([]);
    const asc = putOnBattlefield(s, ap, ascension);
    const b = putOnBattlefield(s, ap, card("Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    s.objects[asc]!.counters.quest = 6;
    invalidateCharacteristics(s);
    expect(pt(s, b)).toBe("2/2");
    s.objects[asc]!.counters.quest = 7;
    invalidateCharacteristics(s);
    expect(pt(s, b)).toBe("7/7");
  });

  it("Sram draws for an Aura spell, not for a creature spell", () => {
    const { s: s0, ap, ids } = setup([aura, card("Plain Guy", "Creature — Human", "{W}", { power: "1", toughness: "1" })]);
    putOnBattlefield(s0, ap, sram);
    const hand = s0.players[ap]!.hand.length;
    const host = putOnBattlefield(s0, ap, card("Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    let s = settle(cast(s0, ap, ids[0]!, [target(host)]));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
    s = settle(cast(s, ap, ids[1]!));
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
  });

  it("Goblin Anarchomancer: red and green spells cost {1} less, others don't", () => {
    const { s: s0, ap, ids } = setup([growth, card("Blue Thing", "Sorcery", "{3}{U}", { oracleText: "Draw a card." })]);
    putOnBattlefield(s0, ap, anarchomancer);
    const b = putOnBattlefield(s0, ap, card("Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    const green = planCast(s0, ap, ids[0]!, [target(b)])!.filter((a) => a.type === "activateMana");
    const blue = planCast(s0, ap, ids[1]!)!.filter((a) => a.type === "activateMana");
    expect(green).toHaveLength(3);
    expect(blue).toHaveLength(4);
  });

  it("Pyroblast destroys or counters only if it's blue, but can target anything", () => {
    const { s: s0, ap, ids, opp } = setup([pyroblast, pyroblast, ponder]);
    const blue = putOnBattlefield(s0, opp, blueGuy);
    const red = putOnBattlefield(s0, opp, redGuy);
    let s = settle(cast(s0, ap, ids[0]!, [target(red)], [1]));
    expect(s.objects[red]!.zone).toBe("battlefield");
    s = settle(cast(s, ap, ids[1]!, [target(blue)], [1]));
    expect(s.objects[blue]!.zone).toBe("graveyard");
  });

  it("Pyroblast counters a blue spell", () => {
    const { s: s0, ap, ids } = setup([pyroblast, ponder]);
    let s = s0;
    for (const a of planCast(s, ap, ids[1]!)!) s = act(s, a);
    const spell = s.stack.find((x) => x.objectId === ids[1])!;
    for (const a of planCast(s, ap, ids[0]!, [{ kind: "stack", id: spell.id }], [0])!) s = act(s, a);
    const hand = s.players[ap]!.hand.length;
    s = settle(s);
    // Countered: no card drawn.
    expect(s.objects[ids[1]!]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand);
  });

  it("a bot doesn't waste Pyroblast on a permanent that isn't blue", () => {
    const { s: s0, ap, ids, opp } = setup([pyroblast]);
    s0.players[ap]!.hand = [ids[0]!];
    s0.players[ap]!.command = [];
    const red = putOnBattlefield(s0, opp, card("Red Dragon", "Creature — Dragon", "{4}{R}{R}", { power: "6", toughness: "6" }));
    const acts = botActions(s0, ap);
    const c = acts.find((a) => a.type === "castSpell" && a.objectId === ids[0]) as { targets?: { id: string }[] } | undefined;
    expect(c?.targets?.some((t) => t.id === red) ?? false).toBe(false);
  });

  it("Laboratory Maniac: drawing from an empty library wins instead", () => {
    const { s: s0, ap, ids } = setup([ponder]);
    putOnBattlefield(s0, ap, labMan);
    s0.players[ap]!.library = [];
    const s = settle(cast(s0, ap, ids[0]!));
    expect(s.over).toBe(true);
    expect(s.winner).toBe(ap);
  });

  it("Thassa's Oracle: devotion at least the library's size wins; otherwise one card stays on top", () => {
    const { s: s0, ap, ids } = setup([oracle]);
    putOnBattlefield(s0, ap, blueGuy);
    // Devotion 3 (Oracle's {U}{U} and Blue Guy's {U}) against three cards: a win.
    const lib = s0.players[ap]!.library;
    for (const id of lib.slice(3)) s0.objects[id]!.zone = "exile";
    s0.players[ap]!.library = lib.slice(0, 3);
    let s = settle(cast(s0, ap, ids[0]!));
    for (let i = 0; i < 6 && s.pending && !s.over; i++) s = settle(act(s, botActions(s, ap)[0]!));
    expect(s.over).toBe(true);
    expect(s.winner).toBe(ap);
  });

  it("Thassa's Oracle with a bigger library: no win", () => {
    const { s: s0, ap, ids } = setup([oracle]);
    const size = s0.players[ap]!.library.length;
    let s = settle(cast(s0, ap, ids[0]!));
    for (let i = 0; i < 6 && s.pending; i++) s = settle(act(s, botActions(s, ap)[0]!));
    expect(s.over).toBeFalsy();
    expect(s.players[ap]!.library.length).toBe(size);
  });

  it("Mayhem Devil triggers when any player sacrifices a permanent", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, devil);
    const outlet = putOnBattlefield(s0, opp, fling);
    const victim = putOnBattlefield(s0, opp, redGuy);
    let s = s0;
    // The opponent sacrifices at instant speed; the trigger is ours.
    s.priority = opp;
    const plan = planCastOrActivate(s, opp, outlet, victim);
    for (const a of plan) s = act(s, a);
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
  });
});

function planCastOrActivate(s: GameState, pid: PlayerId, outlet: string, victim: string) {
  return [{ type: "activateAbility" as const, player: pid, objectId: outlet, index: 0, costs: { sacrifice: [victim] } }];
}
