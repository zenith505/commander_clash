// Lane B round B262: Immortal Coil (damage to you prevented, a graveyard card exiled for each 1 prevented, CR 615.5; a
// state trigger losing the game, CR 603.8), Bitter Feud (damage between the two chosen players doubled, CR 614.1a) and
// Winter's Chill (each target's controller pays {2}, {1} or nothing as it resolves, rulings).

import { describe, expect, it } from "vitest";
import { act, island, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, castProblem, invalidateCharacteristics, isFullySupported, parseManaCost, planActivate, planCast, planMana, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const immortalCoil = (): CardDef => ({"oracleId":"c85fc672-12d8-4ab0-b18d-ccd590ac063c","name":"Immortal Coil","manaCost":"{2}{B}{B}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}, Exile two cards from your graveyard: Draw a card.\nIf damage would be dealt to you, prevent that damage. Exile a card from your graveyard for each 1 damage prevented this way.\nWhen there are no cards in your graveyard, you lose the game.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/b/0b79ec57-7c45-4ef9-9051-449d473b65ea.jpg?1783942566","artUrl":"https://cards.scryfall.io/art_crop/front/0/b/0b79ec57-7c45-4ef9-9051-449d473b65ea.jpg?1783942566","layout":"normal"});
const bitterFeud = (): CardDef => ({"oracleId":"e4add901-3f2b-4f92-bb26-7f599e288802","name":"Bitter Feud","manaCost":"{4}{R}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"As this enchantment enters, choose two players.\nIf a source controlled by one of the chosen players would deal damage to the other chosen player or a permanent that player controls, that source deals double that damage to that player or permanent instead.","colors":["R"],"colorIdentity":["R"],"keywords":["Double"],"imageUrl":"https://cards.scryfall.io/normal/front/0/7/07d0ebe9-0b58-491e-ab49-ea3934ee389f.jpg?1783938867","artUrl":"https://cards.scryfall.io/art_crop/front/0/7/07d0ebe9-0b58-491e-ab49-ea3934ee389f.jpg?1783938867","layout":"normal"});
const winterSChill = (): CardDef => ({"oracleId":"ae78d498-11c7-427f-9d13-3f1b7096f803","name":"Winter's Chill","manaCost":"{X}{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Cast this spell only during combat before blockers are declared.\nX can't be greater than the number of snow lands you control.\nChoose X target attacking creatures. For each of those creatures, its controller may pay {1} or {2}. If that player doesn't, destroy that creature at end of combat. If that player pays only {1}, prevent all combat damage that would be dealt to and dealt by that creature this combat.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/7/a779aca7-ff2c-48d8-9484-6ad04b2c6bcb.jpg?1783947507","artUrl":"https://cards.scryfall.io/art_crop/front/a/7/a779aca7-ff2c-48d8-9484-6ad04b2c6bcb.jpg?1783947507","layout":"normal"});
const snowCoveredIsland = (): CardDef => ({"oracleId":"5b2460a5-6ae5-4cad-ba94-1a9e98e6e4c0","name":"Snow-Covered Island","manaCost":"","cmc":0,"typeLine":"Basic Snow Land — Island","supertypes":["Basic","Snow"],"types":["Land"],"subtypes":["Island"],"oracleText":"({T}: Add {U}.)","colors":[],"colorIdentity":["U"],"keywords":[],"producedMana":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/0/d/0dcf8c0a-cf91-42a0-a54e-da5e7c697ee3.jpg?1783928166","artUrl":"https://cards.scryfall.io/art_crop/front/0/d/0dcf8c0a-cf91-42a0-a54e-da5e7c697ee3.jpg?1783928166","layout":"normal"});
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","layout":"normal"});
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","layout":"normal"});
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","layout":"normal"});
const skullcrack = (): CardDef => ({"oracleId":"a6fc0b0c-9ba2-47f2-ab92-26fd20d0f86d","name":"Skullcrack","manaCost":"{1}{R}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Players can't gain life this turn. Damage can't be prevented this turn. Skullcrack deals 3 damage to target player or planeswalker.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/7/170a06cd-501e-43c8-98e0-63ebd61cc0aa.jpg?1783911719","artUrl":"https://cards.scryfall.io/art_crop/front/1/7/170a06cd-501e-43c8-98e0-63ebd61cc0aa.jpg?1783911719","layout":"normal"});
const crawWurm = (): CardDef => ({"oracleId":"6a462a69-3e42-41de-a3aa-a488d9f38d69","name":"Craw Wurm","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Creature — Wurm","supertypes":[],"types":["Creature"],"subtypes":["Wurm"],"oracleText":"","power":"6","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","artUrl":"https://cards.scryfall.io/art_crop/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","layout":"normal"});

const supported = (...ds: CardDef[]) => ds.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes priority (no attacks or blocks) until `done`; stops at any other question. */
const until = (s: GameState, done: (s: GameState) => boolean, max = 600) => {
  for (let i = 0; i < max; i++) {
    if (done(s)) return s;
    const pid = waitingOn(s)!;
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (s.pending?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, s.pending.count) });
    else if (s.pending) throw new Error(`unexpected question ${s.pending.kind}`);
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error("never done");
};
/** Passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 400 && !s.over && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
/** A fresh copy of `def` in `pid`'s hand. */
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** `n` fresh cards in `pid`'s graveyard. */
const toYard = (s: GameState, pid: PlayerId, defs: CardDef[]) =>
  defs.map((d) => {
    const id = putOnBattlefield(s, pid, d);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "graveyard";
    s.players[pid]!.graveyard.push(id);
    invalidateCharacteristics(s);
    return id;
  });
/** Answers every question with the bots' answers until none is left (at most `max`). */
const bots = (s: GameState, max = 20) => {
  for (let i = 0; i < max && s.pending; i++) for (const a of botActions(s, s.pending.player)) s = act(s, a);
  return s;
};

const shieldPrompt = (s: GameState) => (s.pending?.kind === "chooseOption" && s.pending.what === "damageShield" ? s.pending : undefined);
/** Answers the damage question by the label that starts with `label`. */
function answer(s: GameState, label: string): GameState {
  const p = shieldPrompt(s);
  if (!p) throw new Error(`no damage question: ${JSON.stringify(s.pending)}`);
  const i = (p.labels ?? []).findIndex((l) => l.startsWith(label));
  if (i < 0) throw new Error(`no "${label}" in ${JSON.stringify(p.labels)}`);
  return act(s, { type: "chooseOption", player: p.player, choice: p.options[i]! });
}
const ptgt = (id: PlayerId): TargetChoice => ({ kind: "player", id });

describe("Immortal Coil", () => {
  it("is supported", () => supported(immortalCoil()));

  it("damage to its controller is prevented; they choose a card from their graveyard to exile for each 1 prevented", () => {
    const { s: s0, ap, opp, ids } = setup([shock()]);
    putOnBattlefield(s0, opp, immortalCoil());
    const yard = toYard(s0, opp, [hillGiant(), grizzlyBears(), crawWurm()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [ptgt(opp)])));
    expect(shieldPrompt(s)).toMatchObject({ player: opp });
    expect(shieldPrompt(s)!.prompt).toMatch(/Immortal Coil: exile 2 cards from your graveyard for the damage prevented \(1 of 2\)/);
    s = answer(s, "Craw Wurm");
    s = answer(s, "Hill Giant");
    s = settle(s);
    expect(s.players[opp]!.life).toBe(40);
    expect(yard.map((id) => zone(s, id))).toEqual(["exile", "graveyard", "exile"]);
    expect(s.players[opp]!.lost).toBeFalsy();
    expect(logged(s, /2 damage from Shock to .* is prevented \(Immortal Coil\)/)).toBe(true);
  });

  it("all of the damage is prevented with fewer cards; those are exiled, and with none left its controller loses (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([shock()]);
    putOnBattlefield(s0, opp, immortalCoil());
    const yard = toYard(s0, opp, [hillGiant()]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [ptgt(opp)])));
    expect(s.players[opp]!.life).toBe(40);
    expect(zone(s, yard[0]!)).toBe("exile");
    expect(s.players[opp]!.lost).toBe(true);
  });

  it("damage that can't be prevented is dealt, and nothing is exiled (CR 615.12)", () => {
    const { s: s0, ap, opp, ids } = setup([skullcrack()]);
    putOnBattlefield(s0, opp, immortalCoil());
    const yard = toYard(s0, opp, [hillGiant(), grizzlyBears(), crawWurm()]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [ptgt(opp)])));
    expect(s.players[opp]!.life).toBe(37);
    expect(yard.map((id) => zone(s, id))).toEqual(["graveyard", "graveyard", "graveyard"]);
  });

  it("only damage to its controller: damage to their creatures is dealt", () => {
    const { s: s0, ap, opp, ids } = setup([shock()]);
    putOnBattlefield(s0, opp, immortalCoil());
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    const yard = toYard(s0, opp, [hillGiant(), crawWurm()]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(bears)])));
    expect(zone(s, bears)).toBe("graveyard");
    expect(yard.map((id) => zone(s, id))).toEqual(["graveyard", "graveyard"]);
  });

  it("with an empty graveyard it triggers; a card put there afterwards doesn't stop the loss (rulings)", () => {
    const { s: s0, opp } = setup([]);
    expect(s0.players[opp]!.graveyard.length).toBe(0);
    putOnBattlefield(s0, opp, immortalCoil());
    let s = act(s0, { type: "passPriority", player: waitingOn(s0)! });
    expect(s.stack.some((x) => /Immortal Coil/.test(x.description))).toBe(true);
    toYard(s, opp, [hillGiant()]);
    s = settle(s);
    expect(s.players[opp]!.lost).toBe(true);
  });

  it("with cards in the graveyard, nothing triggers", () => {
    const { s: s0, opp } = setup([]);
    putOnBattlefield(s0, opp, immortalCoil());
    toYard(s0, opp, [hillGiant()]);
    const s = settle(act(s0, { type: "passPriority", player: waitingOn(s0)! }));
    expect(s.players[opp]!.lost).toBeFalsy();
    expect(logged(s, /Immortal Coil's ability triggers/)).toBe(false);
  });

  it("{T}, exile two cards from your graveyard: draw a card", () => {
    const { s: s0, ap } = setup([]);
    const coil = putOnBattlefield(s0, ap, immortalCoil());
    const yard = toYard(s0, ap, [hillGiant(), grizzlyBears(), crawWurm()]);
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planActivate(s0, ap, coil, 0, [], undefined, undefined, undefined, { exileCards: yard.slice(0, 2) })));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(yard.filter((id) => zone(s, id) === "exile").length).toBe(2);
    expect(s.players[ap]!.lost).toBeFalsy();
  });

  it("combat damage from several attackers: all prevented, a card for each 1", () => {
    const { s: s0, ap } = setup([]);
    const opp = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    putOnBattlefield(s0, opp, immortalCoil());
    const yard = toYard(s0, opp, [hillGiant(), grizzlyBears(), crawWurm(), shock(), skullcrack(), immortalCoil(), bitterFeud()]);
    const ats = [putOnBattlefield(s0, ap, hillGiant()), putOnBattlefield(s0, ap, grizzlyBears())];
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: ats.map((a) => ({ attacker: a, defender: opp })) } as Action);
    s = until(s, (x) => x.step === "end" || !!shieldPrompt(x));
    s = bots(s);
    s = until(s, (x) => x.step === "end");
    expect(s.players[opp]!.life).toBe(40);
    expect(yard.filter((id) => zone(s, id) === "exile").length).toBe(5);
    expect(s.players[opp]!.lost).toBeFalsy();
  });
});

describe("Immortal Coil bots", () => {
  it("a bot doesn't cast it with a small graveyard", () => {
    const { s: s0, ap, ids } = setup([immortalCoil()]);
    toYard(s0, ap, [hillGiant(), grizzlyBears()]);
    const as = botActions(s0, ap);
    expect(as.some((a) => a.type === "castSpell" && a.objectId === ids[0])).toBe(false);
  });

  it("a bot doesn't exile its graveyard below five cards with it out", () => {
    const { s: s0, ap } = setup([]);
    const coil = putOnBattlefield(s0, ap, immortalCoil());
    toYard(s0, ap, [hillGiant(), grizzlyBears(), crawWurm(), shock(), skullcrack()]);
    const as = botActions(s0, ap);
    expect(as.some((a) => a.type === "activateAbility" && a.objectId === coil)).toBe(false);
  });
});

describe("Bitter Feud", () => {
  it("is supported", () => supported(bitterFeud()));

  it("as it enters, its controller chooses two different players", () => {
    const { s: s0, ap, ids } = setup([bitterFeud()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending?.kind).toBe("chooseOption");
    if (s.pending?.kind !== "chooseOption") return;
    expect(s.pending.options.length).toBe(4);
    const [b, c] = s.turnOrder.filter((p) => p !== ap);
    s = act(s, { type: "chooseOption", player: ap, choice: String(b) });
    expect(s.pending?.kind).toBe("chooseOption");
    if (s.pending?.kind !== "chooseOption") return;
    expect(s.pending.options).not.toContain(String(b));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: String(c) }));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.objects[ids[0]!]!.chosen?.players).toEqual([b, c]);
  });

  /** `ap` controls Bitter Feud with `pair` chosen. */
  const feud = (hand: CardDef[], pair: (ap: PlayerId, opp: PlayerId, other: PlayerId) => [PlayerId, PlayerId]) => {
    const { s: s0, ap, opp, ids } = setup(hand);
    const other = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const f = putOnBattlefield(s0, ap, bitterFeud());
    s0.objects[f]!.chosen = { players: pair(ap, opp, other) };
    invalidateCharacteristics(s0);
    return { s0, ap, opp, other, ids, f };
  };

  it("a source one chosen player controls deals double damage to the other chosen player", () => {
    const { s0, ap, opp, ids } = feud([shock()], (ap, opp) => [ap, opp]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [ptgt(opp)])));
    expect(s.players[opp]!.life).toBe(36);
  });

  it("and to a permanent the other chosen player controls", () => {
    const { s0, ap, opp, ids } = feud([shock()], (ap, opp) => [opp, ap]);
    const giant = putOnBattlefield(s0, opp, hillGiant());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(giant)])));
    expect(zone(s, giant)).toBe("graveyard");
    expect(logged(s, /Shock deals 4 damage to Hill Giant/)).toBe(true);
  });

  it("not to a player who wasn't chosen, nor to the source's controller's own things", () => {
    const { s0, ap, opp, other, ids } = feud([shock(), shock()], (ap, opp) => [ap, opp]);
    const mine = putOnBattlefield(s0, ap, crawWurm());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [ptgt(other)])));
    expect(s.players[other]!.life).toBe(38);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(mine)])));
    expect(s.objects[mine]!.damage).toBe(2);
    expect(s.players[opp]!.life).toBe(40);
  });

  it("both ways: combat damage from the other chosen player's creature to the first is doubled too", () => {
    const { s0, ap, opp } = feud([], (ap, opp) => [opp, ap]);
    const giant = putOnBattlefield(s0, opp, hillGiant());
    let s = passUntil(s0, "declareAttackers", opp);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: giant, defender: ap }] } as Action);
    s = until(s, (x) => x.step === "end");
    expect(s.players[ap]!.life).toBe(34);
  });

  it("two Bitter Feuds choosing the same players double it twice (rulings)", () => {
    const { s0, ap, opp, ids } = feud([shock()], (ap, opp) => [ap, opp]);
    const f2 = putOnBattlefield(s0, ap, bitterFeud());
    s0.objects[f2]!.chosen = { players: [opp, ap] };
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [ptgt(opp)])));
    expect(s.players[opp]!.life).toBe(32);
  });

  it("a replacement, not prevention: it doubles damage that can't be prevented", () => {
    const { s0, ap, opp, ids } = feud([skullcrack()], (ap, opp) => [ap, opp]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [ptgt(opp)])));
    expect(s.players[opp]!.life).toBe(34);
  });

  it("a bot chooses two of its opponents", () => {
    const { s: s0, ap, ids } = setup([bitterFeud()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = bots(s);
    s = settle(s);
    const pair = s.objects[ids[0]!]!.chosen?.players ?? [];
    expect(pair.length).toBe(2);
    expect(pair).not.toContain(ap);
    expect(new Set(pair).size).toBe(2);
  });
});

describe("Winter's Chill", () => {
  it("is supported", () => supported(winterSChill()));

  /** `ap` attacks `opp` with Hill Giant, Grizzly Bears and Craw Wurm; `opp` has `snow` Snow-Covered Islands and Winter's Chill, and has priority in the declare attackers step. */
  const chilled = (snow = 3) => {
    const { s: s0, ap, opp } = setup([]);
    for (let i = 0; i < snow; i++) putOnBattlefield(s0, opp, snowCoveredIsland());
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, opp, island);
    const chill = inHand(s0, opp, winterSChill());
    const ats = [hillGiant(), grizzlyBears(), crawWurm()].map((d) => putOnBattlefield(s0, ap, d));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: ats.map((a) => ({ attacker: a, defender: opp })) } as Action);
    s = until(s, (x) => x.step === "declareAttackers" && !x.pending && waitingOn(x) === opp);
    return { s, ap, opp, chill, ats };
  };
  const pay = (s: GameState, pid: PlayerId, yes: boolean) => {
    const p = s.pending;
    if (p?.kind !== "payUnless" || p.player !== pid) throw new Error(`no payment question: ${JSON.stringify(p)}`);
    return yes ? run(s, [...planMana(s, pid, parseManaCost(p.cost))!, { type: "payUnless", player: pid, pay: true }]) : act(s, { type: "payUnless", player: pid, pay: false });
  };

  it("can't be cast with X greater than the snow lands its caster controls", () => {
    const { s, opp, chill, ats } = chilled(2);
    expect(planCast(s, opp, chill, ats.map(tgt), undefined, undefined, 3)).toBeNull();
    expect(castProblem(s, opp, chill, ats.map(tgt), undefined, undefined, undefined, 3)).toMatch(/X can't be greater than the number of snow lands you control/);
    expect(planCast(s, opp, chill, ats.slice(0, 2).map(tgt), undefined, undefined, 2)).not.toBeNull();
  });

  it("only during combat before blockers are declared", () => {
    const { s: s0, opp } = setup([]);
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, opp, snowCoveredIsland());
    const chill = inHand(s0, opp, winterSChill());
    expect(planCast(s0, opp, chill, [], undefined, undefined, 0)).toBeNull();
  });

  it("each controller pays {2}, {1} or nothing: as usual, no combat damage to or by it, or destroyed at end of combat", () => {
    const { s: s0, ap, opp, chill, ats } = chilled(3);
    let s = run(s0, planCast(s0, opp, chill, ats.map(tgt), undefined, undefined, 3));
    s = settle(s);
    // Hill Giant: {2} paid.
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap, cost: "{2}", what: "Hill Giant" });
    s = pay(s, ap, true);
    // Grizzly Bears: {2} declined, then {1} paid.
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap, cost: "{2}", what: "Grizzly Bears" });
    s = pay(s, ap, false);
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap, cost: "{1}", what: "Grizzly Bears" });
    s = pay(s, ap, true);
    // Craw Wurm: nothing paid.
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap, cost: "{2}", what: "Craw Wurm" });
    s = pay(s, ap, false);
    s = pay(s, ap, false);
    s = settle(s);
    expect(zone(s, chill)).toBe("graveyard");
    s = until(s, (x) => x.step === "end");
    // Hill Giant (3) and Craw Wurm (6) hit; Grizzly Bears' damage was prevented.
    expect(s.players[opp]!.life).toBe(31);
    expect(zone(s, ats[0]!)).toBe("battlefield");
    expect(zone(s, ats[1]!)).toBe("battlefield");
    expect(zone(s, ats[2]!)).toBe("graveyard");
    expect(logged(s, /Craw Wurm will be destroyed at end of combat/)).toBe(true);
  });

  it("paying {1}: damage to it is prevented too, and it isn't destroyed", () => {
    const { s: s0, ap, opp, chill, ats } = chilled(1);
    const wall = putOnBattlefield(s0, opp, crawWurm());
    let s = settle(run(s0, planCast(s0, opp, chill, [tgt(ats[0]!)], undefined, undefined, 1)));
    s = pay(s, ap, false);
    s = pay(s, ap, true);
    s = settle(s);
    s = until(s, (x) => x.pending?.kind === "declareBlockers");
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: wall, attacker: ats[0]! }] } as Action);
    s = until(s, (x) => x.step === "end");
    expect(zone(s, ats[0]!)).toBe("battlefield");
    expect(s.objects[ats[0]!]!.damage).toBe(0);
    expect(s.objects[wall]!.damage).toBe(0);
  });

  it("a player who can't pay {2} is asked for {1}; one who can't pay at all isn't asked", () => {
    const { s: s0, ap, opp, chill, ats } = chilled(2);
    // Only one untapped land for ap.
    const lands = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.types.includes("Land"));
    for (const id of lands.slice(1)) s0.objects[id]!.tapped = true;
    let s = settle(run(s0, planCast(s0, opp, chill, ats.slice(0, 2).map(tgt), undefined, undefined, 2)));
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap, cost: "{1}", what: "Hill Giant" });
    s = pay(s, ap, true);
    s = settle(s);
    expect(s.pending).toBeFalsy();
    expect(logged(s, /Grizzly Bears will be destroyed at end of combat/)).toBe(true);
  });

  it("a bot defending casts it on the biggest attackers, and a bot attacking pays {2} when it can", () => {
    const { s: s0, ap, opp, chill, ats } = chilled(1);
    let s = s0;
    const as = botActions(s, opp);
    expect(as.some((a) => a.type === "castSpell" && a.objectId === chill)).toBe(true);
    for (const a of as) s = act(s, a);
    const item = s.stack.find((x) => x.objectId === chill);
    expect(item?.targets).toEqual([expect.objectContaining({ kind: "object", id: ats[2] })]);
    s = settle(s);
    for (let i = 0; i < 6 && s.pending?.kind === "payUnless"; i++) for (const a of botActions(s, s.pending.player)) s = act(s, a);
    s = settle(s);
    expect(logged(s, new RegExp(`pays \\{2\\} for Craw Wurm`))).toBe(true);
    expect(s.players[ap]!.lost).toBeFalsy();
  });
});
