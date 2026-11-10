// Round 330 (Lane A, skip-list cards): emblems with activated abilities, activated by their owner from the command zone
// (CR 114.4): "Tap an untapped artifact you control: This emblem deals 1 damage to any target." (Karn, Living Legacy)
// and "{1}{B}, Sacrifice a creature: You gain X life and draw X cards, where X is the sacrificed creature's power." (Ob
// Nixilis of the Black Oath); "Pay any amount of mana. Look at that many cards from the top of your library, then put one
// of those cards into your hand and the rest on the bottom of your library in a random order." (Karn's −1).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, applyAction, botActions, isFullySupported, planActivate, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) s = act(s, botActions(s, p.player)[0]!);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string) => ({ kind: "object" as const, id });

// Real oracle text (Scryfall).
const karn = (): CardDef => ({"oracleId":"09ab1278-811f-4b97-bd34-7493d6e081e9","name":"Karn, Living Legacy","manaCost":"{4}","cmc":4,"typeLine":"Legendary Planeswalker — Karn","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Karn"],"oracleText":"+1: Create a tapped Powerstone token. (It's an artifact with \"{T}: Add {C}. This mana can't be spent to cast a nonartifact spell.\")\n−1: Pay any amount of mana. Look at that many cards from the top of your library, then put one of those cards into your hand and the rest on the bottom of your library in a random order.\n−7: You get an emblem with \"Tap an untapped artifact you control: This emblem deals 1 damage to any target.\"","loyalty":"4","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"commanderLegal":"legal","set":"dmu","releasedAt":"2022-09-09","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const obNix = (): CardDef => ({"oracleId":"cfc9a2f9-92fa-4608-b98d-f9763c89fc40","name":"Ob Nixilis of the Black Oath","manaCost":"{3}{B}{B}","cmc":5,"typeLine":"Legendary Planeswalker — Nixilis","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Nixilis"],"oracleText":"+2: Each opponent loses 1 life. You gain life equal to the life lost this way.\n−2: Create a 5/5 black Demon creature token with flying. You lose 2 life.\n−8: You get an emblem with \"{1}{B}, Sacrifice a creature: You gain X life and draw X cards, where X is the sacrificed creature's power.\"\nOb Nixilis of the Black Oath can be your commander.","loyalty":"3","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","set":"c14","releasedAt":"2014-11-07","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const golem = card("Test Golem", "Artifact Creature — Golem", "{3}", { power: "3", toughness: "3" });
const rock = card("Test Rock", "Artifact", "{2}");
const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "2" });
const elf = card("Test Elf", "Creature — Elf", "{G}", { power: "1", toughness: "1" });

function walker(s: GameState, pid: PlayerId, d: CardDef, loyalty: number) {
  const id = putOnBattlefield(s, pid, d);
  s.objects[id]!.counters.loyalty = loyalty;
  return id;
}
const emblemOf = (s: GameState, pid: PlayerId) => (s.emblems ?? []).find((id) => s.objects[id]!.owner === pid)!;

describe("round 330: emblems with activated abilities", () => {
  it("compile", () => {
    supported(karn(), obNix());
  });

  it("Ob Nixilis of the Black Oath's emblem: its owner activates it from the command zone, sacrificing a creature for X life and X cards", () => {
    const { s: s0, ap } = setup([]);
    const ob = walker(s0, ap, obNix(), 8);
    let s = settle(run(s0, planActivate(s0, ap, ob, 2)));
    const em = emblemOf(s, ap);
    expect(s.objects[em]).toMatchObject({ zone: "command", emblem: true });
    const ogreId = putOnBattlefield(s, ap, ogre);
    const life = s.players[ap]!.life;
    const hand = s.players[ap]!.hand.length;
    // Only its owner can activate it (CR 114.4, 602.1).
    const other = s.turnOrder.find((p) => p !== ap)!;
    expect(abilityProblem(s, other, em, 0)).toMatch(/command zone|priority/);
    s = settle(run(s, planActivate(s, ap, em, 0, undefined, undefined, undefined, undefined, { sacrifice: [ogreId] })));
    expect(s.objects[ogreId]!.zone).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(life + 3);
    expect(s.players[ap]!.hand.length).toBe(hand + 3);
    // Still there: it can be activated again.
    expect(s.emblems).toContain(em);
  });

  it("Karn, Living Legacy's emblem: tap an untapped artifact you control, even one that just entered, for 1 damage to any target from the emblem", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = walker(s0, ap, karn(), 7);
    let s = settle(run(s0, planActivate(s0, ap, k, 2)));
    const em = emblemOf(s, ap);
    // A summoning-sick artifact creature can pay it (rulings: its own {T} isn't the cost).
    const g = putOnBattlefield(s, ap, golem, { sick: true });
    const e = putOnBattlefield(s, opp, elf);
    s = settle(run(s, planActivate(s, ap, em, 0, [tgt(e)], undefined, undefined, undefined, { tap: [g] })));
    expect(s.objects[g]!.tapped).toBe(true);
    expect(s.objects[e]!.zone).toBe("graveyard");
    // A tapped artifact can't pay it again.
    expect(abilityProblem(s, ap, em, 0, [{ kind: "player", id: opp }], undefined, undefined, undefined, { tap: [g] })).not.toBeNull();
    const r = putOnBattlefield(s, ap, rock);
    const life = s.players[opp]!.life;
    s = settle(run(s, planActivate(s, ap, em, 0, [{ kind: "player", id: opp }], undefined, undefined, undefined, { tap: [r] })));
    expect(s.players[opp]!.life).toBe(life - 1);
  });

  it("Karn, Living Legacy's −1: pay any amount of mana as it resolves, look at that many cards, one into your hand, the rest on the bottom", () => {
    const { s: s0, ap } = setup([]);
    const k = walker(s0, ap, karn(), 4);
    let s = settle(run(s0, planActivate(s0, ap, k, 1)), ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "payX", player: ap });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "3" }), ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s.players[ap]!.manaPool.C = 3;
    const top3 = s.players[ap]!.library.slice(0, 3);
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(s.players[ap]!.manaPool.C ?? 0).toBe(0);
    // One of the three must be taken (rulings).
    const p = s.pending!;
    expect(p).toBeDefined();
    s = settle(act(s, botActions(s, ap)[0]!), ap);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    const taken = s.players[ap]!.hand.find((id) => top3.includes(id))!;
    expect(taken).toBeDefined();
    const lib = s.players[ap]!.library;
    for (const id of top3.filter((x) => x !== taken)) expect(lib.slice(-2)).toContain(id);
  });

  it("Karn, Living Legacy's −1 with nothing paid: no card is looked at or taken (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const k = walker(s0, ap, karn(), 4);
    const lib = [...s0.players[ap]!.library];
    const hand = s0.players[ap]!.hand.length;
    let s = settle(run(s0, planActivate(s0, ap, k, 1)), ap);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "none" }), ap);
    expect(s.pending).toBeFalsy();
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.players[ap]!.library).toEqual(lib);
  });

  it("bots: Karn's emblem pings an opponent with an idle artifact in the second main phase; not again with nothing to tap", () => {
    const { s: s0, ap } = setup([]);
    const k = walker(s0, ap, karn(), 7);
    let s = settle(run(s0, planActivate(s0, ap, k, 2)));
    const em = emblemOf(s, ap);
    putOnBattlefield(s, ap, rock);
    s = passUntil(s, "main2", ap);
    s.players[ap]!.hand = [];
    // No mana for anything else (its commander).
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Land")) s.objects[id]!.tapped = true;
    let plan = botActions(s, ap);
    const use = plan.find((a) => a.type === "activateAbility" && a.objectId === em);
    expect(use).toBeDefined();
    const t = (use as { targets?: { kind: string; id: string }[] }).targets?.[0];
    expect(t && (t.kind === "object" || t.id !== ap)).toBe(true);
    s = settle(run(s, plan));
    // With its only artifact tapped, nothing more.
    plan = botActions(s, ap);
    expect(plan.some((a) => a.type === "activateAbility" && a.objectId === em)).toBe(false);
  });

  it("bots: Ob Nixilis's emblem eats a creature token of power 2 or more, not a nontoken creature", () => {
    const { s: s0, ap } = setup([]);
    const ob = walker(s0, ap, obNix(), 8);
    let s = settle(run(s0, planActivate(s0, ap, ob, 2)));
    const em = emblemOf(s, ap);
    s = passUntil(s, "main2", ap);
    s.players[ap]!.hand = [];
    putOnBattlefield(s, ap, ogre);
    const swamps = s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.name !== "Swamp" && s.cards[s.objects[id]!.cardId]!.types.includes("Land"));
    for (const id of swamps) s.objects[id]!.tapped = true;
    expect(botActions(s, ap).some((a) => a.type === "activateAbility" && a.objectId === em)).toBe(false);
    const token = putOnBattlefield(s, ap, card("Demon Token", "Token Creature — Demon", "", { power: "5", toughness: "5" }));
    s.objects[token]!.isToken = true;
    const plan = botActions(s, ap);
    const use = plan.find((a) => a.type === "activateAbility" && a.objectId === em) as { costs?: { sacrifice?: string[] } } | undefined;
    expect(use?.costs?.sacrifice).toEqual([token]);
  });
});
