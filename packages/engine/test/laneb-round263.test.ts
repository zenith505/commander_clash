// Lane B round B263: Guardian Angel (a shield of X, then {1} for one more any time this turn: a special action, CR 116.2c),
// Blood of the Martyr (damage to any creature dealt to its controller instead, chosen each time, CR 614.9) and Torrent of
// Lava (an ability each creature has while the spell is on the stack, CR 113.6: a shield against that spell only).

import { describe, expect, it } from "vitest";
import { act, passUntil, plainsCard, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, invalidateCharacteristics, isFullySupported, legalActions, payableShields, payShieldProblem, planActivate, planCast, planPayShield, abilitiesOf, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const guardianAngel = (): CardDef => ({"oracleId":"1a91ca69-e890-41dc-866b-3aabf10c9a9c","name":"Guardian Angel","manaCost":"{X}{W}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Prevent the next X damage that would be dealt to any target this turn. Until end of turn, you may pay {1} any time you could cast an instant. If you do, prevent the next 1 damage that would be dealt to that permanent or player this turn.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/f/0f84d676-5327-454c-a033-b4498a9d28e2.jpg?1783948714","artUrl":"https://cards.scryfall.io/art_crop/front/0/f/0f84d676-5327-454c-a033-b4498a9d28e2.jpg?1783948714","layout":"normal"});
const bloodOfTheMartyr = (): CardDef => ({"oracleId":"0e69e6c2-fdc5-4c1a-bd96-c4283b82743a","name":"Blood of the Martyr","manaCost":"{W}{W}{W}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Until end of turn, if damage would be dealt to any creature, you may have that damage dealt to you instead.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/2/22d4761d-acf2-4cb3-86a8-a3f30420a92e.jpg?1783947950","artUrl":"https://cards.scryfall.io/art_crop/front/2/2/22d4761d-acf2-4cb3-86a8-a3f30420a92e.jpg?1783947950","layout":"normal"});
const torrentOfLava = (): CardDef => ({"oracleId":"f467ec85-ffe2-4963-82e0-509a7873fd63","name":"Torrent of Lava","manaCost":"{X}{R}{R}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Torrent of Lava deals X damage to each creature without flying.\nAs long as Torrent of Lava is on the stack, each creature has \"{T}: Prevent the next 1 damage that would be dealt to this creature by Torrent of Lava this turn.\"","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/9/19528a24-4968-4742-a2d1-06f94e60f290.jpg?1783947070","artUrl":"https://cards.scryfall.io/art_crop/front/1/9/19528a24-4968-4742-a2d1-06f94e60f290.jpg?1783947070","layout":"normal"});
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","layout":"normal"});
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","layout":"normal"});
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","layout":"normal"});
const serraAngel = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","layout":"normal"});
const lavaAxe = (): CardDef => ({"oracleId":"387b6b07-a283-412d-94c3-f7f1dc76e858","name":"Lava Axe","manaCost":"{4}{R}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Lava Axe deals 5 damage to target player or planeswalker.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/1/e11ec278-46f5-4970-ad0b-f6718c73de6c.jpg?1783946235","artUrl":"https://cards.scryfall.io/art_crop/front/e/1/e11ec278-46f5-4970-ad0b-f6718c73de6c.jpg?1783946235","layout":"normal"});
const typhoidRats = (): CardDef => ({"oracleId":"d6ee6cc1-902d-4f56-afa5-6fa4813bfbbc","name":"Typhoid Rats","manaCost":"{B}","cmc":1,"typeLine":"Creature — Rat","supertypes":[],"types":["Creature"],"subtypes":["Rat"],"oracleText":"Deathtouch (Any amount of damage this deals to a creature is enough to destroy it.)","power":"1","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Deathtouch"],"imageUrl":"https://cards.scryfall.io/normal/front/d/1/d13cb90b-50c3-46ef-83f8-812dfb7ff881.jpg?1783938691","artUrl":"https://cards.scryfall.io/art_crop/front/d/1/d13cb90b-50c3-46ef-83f8-812dfb7ff881.jpg?1783938691","layout":"normal"});

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
const ptgt = (id: PlayerId): TargetChoice => ({ kind: "player", id });
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
const shieldPrompt = (s: GameState) => (s.pending?.kind === "chooseOption" && s.pending.what === "damageShield" ? s.pending : undefined);
/** Answers the damage question by the label that starts with `label`. */
function answer(s: GameState, label: string): GameState {
  const p = shieldPrompt(s);
  if (!p) throw new Error(`no damage question: ${JSON.stringify(s.pending)}`);
  const i = (p.labels ?? []).findIndex((l) => l.startsWith(label));
  if (i < 0) throw new Error(`no "${label}" in ${JSON.stringify(p.labels)}`);
  return act(s, { type: "chooseOption", player: p.player, choice: p.options[i]! });
}
/** Answers every question with the bots' answers until none is left (at most `max`). */
const bots = (s: GameState, max = 20) => {
  for (let i = 0; i < max && s.pending; i++) for (const a of botActions(s, s.pending.player)) s = act(s, a);
  return s;
};
/** `attacker`'s controller attacks `defender` with `ats`; `defender` declares `blocks`. Stops at the first question after. */
const attack = (s0: GameState, attacker: PlayerId, defender: PlayerId, ats: string[], blocks: [string, string][] = []) => {
  let s = passUntil(s0, "declareAttackers", attacker);
  s = act(s, { type: "declareAttackers", player: attacker, attacks: ats.map((a) => ({ attacker: a, defender })) } as Action);
  s = until(s, (x) => x.pending?.kind === "declareBlockers" && x.pending.player === defender);
  s = act(s, { type: "declareBlockers", player: defender, blocks: blocks.map(([blocker, at]) => ({ blocker, attacker: at })) } as Action);
  return s;
};

describe("Guardian Angel", () => {
  it("is supported", () => supported(guardianAngel()));

  it("prevents the next X damage to its target, and {1} paid any time this turn prevents 1 more", () => {
    const { s: s0, ap, ids } = setup([guardianAngel(), shock(), shock()]);
    const giant = putOnBattlefield(s0, ap, hillGiant());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(giant)], undefined, undefined, 1)));
    expect(s.objects[giant]!.preventNext).toBe(1);
    const [ps] = payableShields(s, ap);
    expect(ps).toBeDefined();
    expect(legalActions(s, ap).some((a) => a.type === "payShield")).toBe(false); // the mana isn't in the pool yet
    s = run(s, planPayShield(s, ap, ps!.id));
    expect(s.objects[giant]!.preventNext).toBe(2);
    expect(logged(s, /pays \{1\} for Guardian Angel: it will prevent the next 1 more damage to Hill Giant/)).toBe(true);
    s = run(s, planPayShield(s, ap, ps!.id));
    expect(s.objects[giant]!.preventNext).toBe(3);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(giant)])));
    s = settle(run(s, planCast(s, ap, ids[2]!, [tgt(giant)])));
    // 3 of the 4 prevented.
    expect(s.objects[giant]!.damage).toBe(1);
    expect(zone(s, giant)).toBe("battlefield");
  });

  it("paying is a special action: it doesn't use the stack, and the player keeps priority (CR 116.2c, 116.3)", () => {
    const { s: s0, ap, ids } = setup([guardianAngel(), shock()]);
    const giant = putOnBattlefield(s0, ap, hillGiant());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(giant)], undefined, undefined, 0)));
    expect(s.objects[giant]!.preventNext ?? 0).toBe(0);
    s = run(s, planCast(s, ap, ids[1]!, [tgt(giant)]));
    expect(s.stack.length).toBe(1);
    const ps = payableShields(s, ap)[0]!;
    s = run(s, planPayShield(s, ap, ps.id));
    expect(s.stack.length).toBe(1);
    expect(s.priority).toBe(ap);
    s = run(s, planPayShield(s, ap, ps.id));
    s = settle(s);
    expect(s.objects[giant]!.damage).toBe(0);
  });

  it("works on a player target", () => {
    const { s: s0, ap, ids } = setup([guardianAngel(), lavaAxe()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [ptgt(ap)], undefined, undefined, 1)));
    expect(s.players[ap]!.preventNext).toBe(1);
    const ps = payableShields(s, ap)[0]!;
    s = run(s, planPayShield(s, ap, ps.id));
    s = settle(run(s, planCast(s, ap, ids[1]!, [ptgt(ap)])));
    expect(s.players[ap]!.life).toBe(37);
  });

  it("only its controller may pay, only while they have priority", () => {
    const { s: s0, ap, opp, ids } = setup([guardianAngel()]);
    const giant = putOnBattlefield(s0, ap, hillGiant());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(giant)], undefined, undefined, 0)));
    const ps = payableShields(s, ap)[0]!;
    expect(payableShields(s, opp)).toEqual([]);
    expect(payShieldProblem(s, opp, ps.id)).toMatch(/no shield/);
    expect(planPayShield(s, opp, ps.id)).toBeNull();
  });

  it("ends with the turn, and does nothing once the permanent has left the battlefield", () => {
    const { s: s0, ap, ids } = setup([guardianAngel(), shock(), shock()]);
    const bears = putOnBattlefield(s0, ap, grizzlyBears());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(bears)], undefined, undefined, 0)));
    expect(payableShields(s, ap).length).toBe(1);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(bears)])));
    expect(zone(s, bears)).toBe("graveyard");
    expect(payableShields(s, ap)).toEqual([]);
    const giant = putOnBattlefield(s, ap, hillGiant());
    const ga2 = inHand(s, ap, guardianAngel());
    s = settle(run(s, planCast(s, ap, ga2, [tgt(giant)], undefined, undefined, 0)));
    expect(payableShields(s, ap).length).toBe(1);
    const turn = s.turn;
    s = until(s, (x) => x.turn > turn);
    expect(s.payShields).toBeUndefined();
    expect(payableShields(s, ap)).toEqual([]);
  });

  it("a bot pays when a spell would destroy its creature, until the creature survives", () => {
    const { s: s0, ap, opp, ids } = setup([guardianAngel(), shock()]);
    const bears = putOnBattlefield(s0, ap, grizzlyBears());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(bears)], undefined, undefined, 0)));
    // The bot is the opponent here: the permission is given to it, about its Bears.
    s.payShields = s.payShields!.map((ps) => ({ ...ps, player: opp }));
    s.objects[bears]!.controller = opp;
    s.objects[bears]!.owner = opp;
    putOnBattlefield(s, opp, plainsCard);
    putOnBattlefield(s, opp, plainsCard);
    invalidateCharacteristics(s);
    s = run(s, planCast(s, ap, ids[1]!, [tgt(bears)]));
    // The opponent gets priority after the players before it pass.
    s = until(s, (x) => x.priority === opp);
    for (let i = 0; i < 8 && s.priority === opp; i++) {
      const acts = botActions(s, opp);
      if (acts.some((a) => a.type === "passPriority")) break;
      for (const a of acts) s = act(s, a);
    }
    expect(s.objects[bears]!.preventNext).toBe(1);
    s = settle(s);
    expect(zone(s, bears)).toBe("battlefield");
  });
});

describe("Blood of the Martyr", () => {
  it("is supported", () => supported(bloodOfTheMartyr()));

  it("damage to a creature: its controller chooses to have it dealt to them instead", () => {
    const { s: s0, ap, opp, ids } = setup([bloodOfTheMartyr(), shock()]);
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(bears)])));
    expect(shieldPrompt(s)).toMatchObject({ player: ap });
    expect(shieldPrompt(s)!.prompt).toMatch(/Blood of the Martyr: Shock would deal 2 damage to Grizzly Bears\. Have that damage dealt to you instead\?/);
    s = settle(answer(s, "Deal it to"));
    expect(zone(s, bears)).toBe("battlefield");
    expect(s.objects[bears]!.damage).toBe(0);
    expect(s.players[ap]!.life).toBe(38);
  });

  it("declined, the creature is dealt the damage", () => {
    const { s: s0, ap, opp, ids } = setup([bloodOfTheMartyr(), shock()]);
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(bears)])));
    s = settle(answer(s, "Don't redirect it"));
    expect(zone(s, bears)).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(40);
  });

  it("asks for each creature dealt damage at once, and lasts the turn only", () => {
    const { s: s0, ap, opp, ids } = setup([bloodOfTheMartyr(), torrentOfLava()]);
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    const giant = putOnBattlefield(s0, ap, hillGiant());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(run(s, planCast(s, ap, ids[1]!, undefined, undefined, undefined, 3)));
    const asked: string[] = [];
    for (let i = 0; i < 4 && shieldPrompt(s); i++) {
      const p = shieldPrompt(s)!;
      asked.push(p.prompt!);
      s = settle(answer(s, /Hill Giant/.test(p.prompt!) ? "Deal it to" : "Don't redirect it"));
    }
    expect(asked.length).toBe(2);
    expect(zone(s, bears)).toBe("graveyard");
    expect(zone(s, giant)).toBe("battlefield");
    expect(s.players[ap]!.life).toBe(37);
    const turn = s.turn;
    s = until(s, (x) => x.turn > turn);
    expect((s.damageRules ?? []).some((r) => r.redirectMay)).toBe(false);
  });

  it("combat damage is asked about too; deathtouch damage dealt to the player instead doesn't destroy the creature (CR 614.9)", () => {
    const { s: s0, ap, opp, ids } = setup([bloodOfTheMartyr()]);
    const rats = putOnBattlefield(s0, opp, typhoidRats());
    const giant = putOnBattlefield(s0, ap, hillGiant());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = attack(s, ap, opp, [giant], [[rats, giant]]);
    s = until(s, (x) => !!shieldPrompt(x) && /Typhoid Rats would deal 1 damage to Hill Giant/.test(shieldPrompt(x)!.prompt!));
    s = answer(s, "Deal it to");
    s = bots(s);
    s = until(s, (x) => x.step === "end" || x.step === "main2");
    // The deathtouch damage went to the player, not the Giant.
    expect(zone(s, giant)).toBe("battlefield");
    expect(s.players[ap]!.life).toBe(39);
  });

  it("a bot takes its own creature's lethal damage while it has life to spare, never another player's creature's", () => {
    const { s: s0, ap, opp, ids } = setup([bloodOfTheMartyr(), shock(), shock()]);
    const mine = putOnBattlefield(s0, ap, grizzlyBears());
    const theirs = putOnBattlefield(s0, opp, grizzlyBears());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(mine)])));
    expect(shieldPrompt(s)!.labels![0]).toMatch(/^Deal it to/);
    s = settle(bots(s));
    expect(zone(s, mine)).toBe("battlefield");
    s = settle(run(s, planCast(s, ap, ids[2]!, [tgt(theirs)])));
    expect(shieldPrompt(s)!.labels![0]).toBe("Don't redirect it");
    s = settle(bots(s));
    expect(zone(s, theirs)).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(38);
  });
});

describe("Torrent of Lava", () => {
  it("is supported", () => supported(torrentOfLava()));

  it("while it's on the stack, each creature has a tap ability preventing 1 of its damage", () => {
    const { s: s0, ap, opp, ids } = setup([torrentOfLava()]);
    const giant = putOnBattlefield(s0, ap, hillGiant());
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    const angel = putOnBattlefield(s0, opp, serraAngel());
    expect(abilitiesOf(s0, s0.objects[giant]!).activated.length).toBe(0);
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 3));
    expect(s.stack.length).toBe(1);
    const ab = abilitiesOf(s, s.objects[giant]!).activated;
    expect(ab.length).toBe(1);
    expect(ab[0]!.text).toBe("{T}: Prevent the next 1 damage that would be dealt to ~ by Torrent of Lava this turn.");
    // Fliers too: each creature has it.
    expect(abilitiesOf(s, s.objects[angel]!).activated.length).toBe(1);
    s = run(s, planActivate(s, ap, giant, 0));
    expect(s.objects[giant]!.tapped).toBe(true);
    s = settle(s);
    expect(s.objects[giant]!.damage).toBe(2);
    expect(zone(s, giant)).toBe("battlefield");
    expect(zone(s, bears)).toBe("graveyard");
    expect(s.objects[angel]!.damage).toBe(0);
    // Gone once the spell has left the stack.
    expect(abilitiesOf(s, s.objects[giant]!).activated.length).toBe(0);
  });

  it("the shield is against Torrent of Lava only", () => {
    const { s: s0, ap, ids } = setup([torrentOfLava(), shock()]);
    const giant = putOnBattlefield(s0, ap, hillGiant());
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 0));
    s = run(s, planActivate(s, ap, giant, 0));
    s = settle(s);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(giant)])));
    expect(s.objects[giant]!.damage).toBe(2);
  });

  it("a tapped or summoning-sick creature can't use it", () => {
    const { s: s0, ap, ids } = setup([torrentOfLava()]);
    const sick = putOnBattlefield(s0, ap, hillGiant(), { sick: true });
    const s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 3));
    expect(planActivate(s, ap, sick, 0)).toBeNull();
  });

  it("a bot taps a creature when the 1 prevented lets it survive", () => {
    const { s: s0, ap, opp, ids } = setup([torrentOfLava()]);
    const giant = putOnBattlefield(s0, opp, hillGiant());
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 3));
    s = until(s, (x) => x.priority === opp);
    for (let i = 0; i < 6 && s.priority === opp; i++) {
      const acts = botActions(s, opp);
      if (acts.some((a) => a.type === "passPriority")) break;
      for (const a of acts) s = act(s, a);
    }
    expect(s.objects[giant]!.tapped).toBe(true);
    expect(s.objects[bears]!.tapped).toBe(false);
    s = settle(s);
    expect(zone(s, giant)).toBe("battlefield");
    expect(zone(s, bears)).toBe("graveyard");
  });
});
