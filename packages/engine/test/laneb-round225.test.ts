// Lane B round B225: Heart of Bogardan (an unpaid cumulative upkeep deals twice its age counters minus 2 to a player or
// planeswalker and their creatures), Lesser Werewolf (shrinks itself to put -0/-1 counters on a creature in combat with
// it, while its power is 1 or more), Goblin Flotilla (unless you pay {R} at each combat, creatures in combat with it gain
// first strike) and Acidic Dagger (a creature's combat damage destroys non-Wall creatures this turn).

import { describe, expect, it } from "vitest";
import { act, bear, mountain, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, botActions, isFullySupported, moveObject, objHasKeyword, planActivate, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const heart = (): CardDef => ({"oracleId":"1e1d8c64-4cea-4c2c-8933-be19d13bf07c","name":"Heart of Bogardan","manaCost":"{2}{R}{R}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Cumulative upkeep {2} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nWhen a player doesn't pay this enchantment's cumulative upkeep, this enchantment deals X damage to target player or planeswalker and each creature that player or that planeswalker's controller controls, where X is twice the number of age counters on this enchantment minus 2.","colors":["R"],"colorIdentity":["R"],"keywords":["Cumulative upkeep"],"imageUrl":"https://cards.scryfall.io/normal/front/4/e/4e30d025-1df9-4a08-b686-037e9cbf23a6.jpg?1783946726","artUrl":"https://cards.scryfall.io/art_crop/front/4/e/4e30d025-1df9-4a08-b686-037e9cbf23a6.jpg?1783946726","commanderLegal":"legal","set":"wth","releasedAt":"1997-06-09","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const werewolf = (): CardDef => ({"oracleId":"5542afeb-285f-4889-9d09-46ce20d0d189","name":"Lesser Werewolf","manaCost":"{3}{B}","cmc":4,"typeLine":"Creature — Werewolf","supertypes":[],"types":["Creature"],"subtypes":["Werewolf"],"oracleText":"{B}: If this creature's power is 1 or more, it gets -1/-0 until end of turn and put a -0/-1 counter on target creature blocking or blocked by this creature. Activate only during the declare blockers step.","power":"2","toughness":"4","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/a/baae02e4-7db9-4a7b-a4ee-ecb22fcb77bd.jpg?1783948064","artUrl":"https://cards.scryfall.io/art_crop/front/b/a/baae02e4-7db9-4a7b-a4ee-ecb22fcb77bd.jpg?1783948064","commanderLegal":"legal","set":"leg","releasedAt":"1994-06-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const flotilla = (): CardDef => ({"oracleId":"014ca38f-d4ac-4417-bfa8-785a7d6fce43","name":"Goblin Flotilla","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Goblin","supertypes":[],"types":["Creature"],"subtypes":["Goblin"],"oracleText":"Islandwalk (This creature can't be blocked as long as defending player controls an Island.)\nAt the beginning of each combat, unless you pay {R}, whenever this creature blocks or becomes blocked by a creature this combat, that creature gains first strike until end of turn.","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":["Landwalk","Islandwalk"],"imageUrl":"https://cards.scryfall.io/normal/front/8/7/87024efe-4a74-49fe-a43a-480bed0a650a.jpg?1783947895","artUrl":"https://cards.scryfall.io/art_crop/front/8/7/87024efe-4a74-49fe-a43a-480bed0a650a.jpg?1783947895","commanderLegal":"legal","set":"fem","releasedAt":"1994-11-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const dagger = (): CardDef => ({"oracleId":"bf034a20-e362-4f38-9bf9-857777c62598","name":"Acidic Dagger","manaCost":"{4}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{4}, {T}: Whenever target creature deals combat damage to a non-Wall creature this turn, destroy that non-Wall creature. When the targeted creature leaves the battlefield this turn, sacrifice this artifact. Activate only before blockers are declared.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/d/6dfdea79-2a7c-489d-8466-e6090c2a0919.jpg?1783947045","artUrl":"https://cards.scryfall.io/art_crop/front/6/d/6dfdea79-2a7c-489d-8466-e6090c2a0919.jpg?1783947045","commanderLegal":"legal","set":"mir","releasedAt":"1996-10-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const wallOfStone = (): CardDef => ({"oracleId":"cd4cadb4-3156-49bd-b36e-12ba5c85938b","name":"Wall of Stone","manaCost":"{1}{R}{R}","cmc":3,"typeLine":"Creature — Wall","supertypes":[],"types":["Creature"],"subtypes":["Wall"],"oracleText":"Defender (This creature can't attack.)","power":"0","toughness":"8","colors":["R"],"colorIdentity":["R"],"keywords":["Defender"],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/140e567c-6e4a-42b0-8084-d6c9695ae802.jpg?1783948680","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/140e567c-6e4a-42b0-8084-d6c9695ae802.jpg?1783948680","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const ajani = (): CardDef => ({"oracleId":"dfb5f660-fd8b-4b7b-934c-6a71cd182f15","name":"Ajani Goldmane","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Legendary Planeswalker — Ajani","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Ajani"],"oracleText":"+1: You gain 2 life.\n−1: Put a +1/+1 counter on each creature you control. Those creatures gain vigilance until end of turn.\n−6: Create a white Avatar creature token. It has \"This token's power and toughness are each equal to your life total.\"","loyalty":"4","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/a/2a1470a6-d09d-4a2a-84a6-d56e32ed237a.jpg?1783942919","artUrl":"https://cards.scryfall.io/art_crop/front/2/a/2a1470a6-d09d-4a2a-84a6-d56e32ed237a.jpg?1783942919","commanderLegal":"legal","set":"lrw","releasedAt":"2007-10-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Passes and lets bots answer until the stack is empty or `me` has a question. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const obj = (s: GameState, id: ObjectId) => s.objects[id]!;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const nextOf = (s: GameState, pid: PlayerId, k: number) => s.turnOrder[(s.turnOrder.indexOf(pid) + k) % s.turnOrder.length]!;
const toUpkeep = (s0: GameState, ap: PlayerId) => {
  let s = passUntil(s0, "end", nextOf(s0, ap, 3));
  s = passUntil(s, "upkeep", ap);
  return settle(s, ap);
};
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
/** `ap` attacks `defender` with `attackers`; the defending player blocks as `blocks` says; then it's the declare blockers step. */
const toBlocks = (s0: GameState, ap: PlayerId, defender: PlayerId, attackers: ObjectId[], blocks: { blocker: ObjectId; attacker: ObjectId }[], me?: PlayerId) => {
  let s = passUntil(s0, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: attackers.map((attacker) => ({ attacker, defender })) });
  s = passUntil(s, "declareBlockers");
  while (s.pending?.kind !== "declareBlockers" || s.pending.player !== defender) {
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
    else if (s.pending && s.pending.player !== me) for (const a of botActions(s, s.pending.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return settle(act(s, { type: "declareBlockers", player: defender, blocks }), me);
};

describe("Heart of Bogardan", () => {
  it("not paid: X is twice its age counters minus 2, to the target player and each creature they control", () => {
    supported(heart());
    const { s: s0, ap, opp } = setup([]);
    const h = putOnBattlefield(s0, ap, heart());
    obj(s0, h).counters.age = 2;
    const theirs = putOnBattlefield(s0, opp, hillGiant());
    const theirs2 = putOnBattlefield(s0, opp, wallOfStone());
    const mine = putOnBattlefield(s0, ap, hillGiant());
    const other = putOnBattlefield(s0, nextOf(s0, opp, 1), hillGiant());
    let s = toUpkeep(s0, ap);
    expect(obj(s, h).counters.age).toBe(3);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), ap);
    // Sacrificed as it goes unpaid; its trigger asks for a target.
    expect(obj(s, h).zone).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    // A bot aims it at an opponent.
    const b = botActions(s, ap)[0];
    expect(b?.type === "chooseTargets" && b.targets[0]?.kind === "player" && b.targets[0].id !== ap).toBe(true);
    const before = life(s, opp);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [player(opp)] }), ap);
    // X = 2 * 3 - 2 = 4, the {2}{2} last paid (rulings).
    expect(life(s, opp)).toBe(before - 4);
    expect(obj(s, theirs).zone).toBe("graveyard");
    expect(obj(s, theirs2).damage).toBe(4);
    expect(obj(s, mine).zone).toBe("battlefield");
    expect(obj(s, mine).damage).toBe(0);
    expect(obj(s, other).damage).toBe(0);
  });

  it("paid: nothing happens; a planeswalker target hits its controller's creatures", () => {
    const { s: s0, ap, opp } = setup([]);
    const h = putOnBattlefield(s0, ap, heart());
    let s = toUpkeep(s0, ap);
    expect(obj(s, h).counters.age).toBe(1);
    s.players[ap]!.manaPool.R += 2;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(obj(s, h).zone).toBe("battlefield");
    expect(s.pending).toBeNull();
    // Next upkeep: two age counters, not paid, aimed at a planeswalker: X = 2.
    const walker = putOnBattlefield(s, opp, ajani());
    obj(s, walker).counters.loyalty = 4;
    const giant = putOnBattlefield(s, opp, hillGiant());
    s = toUpkeep(s, ap);
    expect(obj(s, h).counters.age).toBe(2);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), ap);
    const before = life(s, opp);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: walker }] }), ap);
    expect(obj(s, walker).counters.loyalty).toBe(2);
    expect(obj(s, giant).damage).toBe(2);
    expect(life(s, opp)).toBe(before);
  });

  it("one age counter, not paid: X is 0", () => {
    const { s: s0, ap, opp } = setup([]);
    const h = putOnBattlefield(s0, ap, heart());
    let s = toUpkeep(s0, ap);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), ap);
    expect(obj(s, h).zone).toBe("graveyard");
    const before = life(s, opp);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [player(opp)] }), ap);
    expect(life(s, opp)).toBe(before);
  });
});

describe("Lesser Werewolf", () => {
  it("each activation: -1/-0 on it and a -0/-1 counter on the creature blocking it; at power 0 it does nothing", () => {
    supported(werewolf());
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, werewolf());
    const g = putOnBattlefield(s0, opp, hillGiant());
    // Only during the declare blockers step.
    expect(planActivate(s0, ap, w, 0, [{ kind: "object", id: g }])).toBeNull();
    let s = toBlocks(s0, ap, opp, [w], [{ blocker: g, attacker: w }], ap);
    expect(s.step).toBe("declareBlockers");
    expect(pt(s, w)).toBe("2/4");
    s = settle(run(s, planActivate(s, ap, w, 0, [{ kind: "object", id: g }])), ap);
    expect(pt(s, w)).toBe("1/4");
    expect(obj(s, g).counters["-0/-1"]).toBe(1);
    expect(pt(s, g)).toBe("3/2");
    s = settle(run(s, planActivate(s, ap, w, 0, [{ kind: "object", id: g }])), ap);
    expect(pt(s, w)).toBe("0/4");
    expect(pt(s, g)).toBe("3/1");
    // Still activatable at power 0 (rulings), but it does nothing then.
    s.players[ap]!.manaPool.B += 1;
    // A bot doesn't activate it for nothing.
    expect(botActions(s, ap).some((a) => a.type === "activateAbility" && a.objectId === w)).toBe(false);
    s = settle(run(s, planActivate(s, ap, w, 0, [{ kind: "object", id: g }])), ap);
    expect(pt(s, w)).toBe("0/4");
    expect(obj(s, g).counters["-0/-1"]).toBe(2);
  });

  it("targets only a creature blocking or blocked by it", () => {
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, werewolf());
    const g = putOnBattlefield(s0, opp, hillGiant());
    const g2 = putOnBattlefield(s0, opp, hillGiant());
    const s = toBlocks(s0, ap, opp, [w], [{ blocker: g, attacker: w }], ap);
    expect(planActivate(s, ap, w, 0, [{ kind: "object", id: g2 }])).toBeNull();
    expect(planActivate(s, ap, w, 0, [{ kind: "object", id: g }])).not.toBeNull();
  });
});

describe("Goblin Flotilla", () => {
  it("unpaid: a creature blocking it gains first strike this combat", () => {
    supported(flotilla());
    const { s: s0, ap, opp } = setup([]);
    const f = putOnBattlefield(s0, ap, flotilla());
    const g = putOnBattlefield(s0, opp, hillGiant());
    let s = passUntil(s0, "beginCombat", ap);
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), ap);
    expect(s.floatingTriggers?.some((t) => t.sourceId === f && t.until === "endOfCombat")).toBe(true);
    s = toBlocks(s, ap, opp, [f], [{ blocker: g, attacker: f }], ap);
    expect(objHasKeyword(s, obj(s, g), "First strike")).toBe(true);
    // The Giant deals its damage first: the Flotilla dies without dealing any.
    s = passUntil(s, "endCombat");
    expect(obj(s, f).zone).toBe("graveyard");
    expect(obj(s, g).damage).toBe(0);
  });

  it("paid: no first strike", () => {
    const { s: s0, ap, opp } = setup([]);
    const f = putOnBattlefield(s0, ap, flotilla());
    const g = putOnBattlefield(s0, opp, hillGiant());
    let s = settle(passUntil(s0, "beginCombat", ap), ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s.players[ap]!.manaPool.R += 1;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(s.floatingTriggers?.some((t) => t.sourceId === f) ?? false).toBe(false);
    s = toBlocks(s, ap, opp, [f], [{ blocker: g, attacker: f }], ap);
    expect(objHasKeyword(s, obj(s, g), "First strike")).toBe(false);
    s = passUntil(s, "endCombat");
    expect(obj(s, g).damage).toBe(2);
  });

  it("at another player's combat, unpaid: the creature it blocks gains first strike", () => {
    const { s: s0, ap, opp } = setup([]);
    const f = putOnBattlefield(s0, opp, flotilla());
    putOnBattlefield(s0, opp, mountain);
    const g = putOnBattlefield(s0, ap, hillGiant());
    const g2 = putOnBattlefield(s0, ap, hillGiant());
    let s = settle(passUntil(s0, "beginCombat", ap), opp);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp });
    s = settle(act(s, { type: "chooseMay", player: opp, yes: false }), opp);
    s = toBlocks(s, ap, opp, [g, g2], [{ blocker: f, attacker: g }], opp);
    expect(objHasKeyword(s, obj(s, g), "First strike")).toBe(true);
    expect(objHasKeyword(s, obj(s, g2), "First strike")).toBe(false);
    s = passUntil(s, "endCombat");
    expect(obj(s, f).zone).toBe("graveyard");
    expect(obj(s, g).damage).toBe(0);
  });
});

describe("Acidic Dagger", () => {
  it("the target's combat damage destroys each non-Wall creature it's dealt to, not a Wall", () => {
    supported(dagger());
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, ap, dagger());
    const g = putOnBattlefield(s0, ap, hillGiant());
    const g2 = putOnBattlefield(s0, ap, hillGiant());
    const big = putOnBattlefield(s0, opp, bear({ name: "Big Bear", toughness: "6" }));
    const wall = putOnBattlefield(s0, opp, wallOfStone());
    // Bots leave it alone.
    expect(botActions(s0, ap).some((a) => a.type === "activateAbility" && a.objectId === d)).toBe(false);
    let s = settle(run(s0, planActivate(s0, ap, d, 0, [{ kind: "object", id: g }])), ap);
    expect(obj(s, d).tapped).toBe(true);
    s = toBlocks(s, ap, opp, [g, g2], [{ blocker: big, attacker: g }, { blocker: wall, attacker: g2 }], ap);
    // Before blockers are declared only.
    expect(abilityProblem(s, ap, d, 0, [{ kind: "object", id: g2 }])).not.toBeNull();
    s = settle(passUntil(s, "endCombat"), ap);
    expect(obj(s, big).zone).toBe("graveyard");
    expect(obj(s, wall).zone).toBe("battlefield");
    expect(obj(s, d).zone).toBe("battlefield");
  });

  it("a Wall dealt damage by the target survives; the Dagger is sacrificed when the target leaves", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, ap, dagger());
    const g = putOnBattlefield(s0, ap, hillGiant());
    const wall = putOnBattlefield(s0, opp, wallOfStone());
    let s = settle(run(s0, planActivate(s0, ap, d, 0, [{ kind: "object", id: g }])), ap);
    s = toBlocks(s, ap, opp, [g], [{ blocker: wall, attacker: g }], ap);
    s = settle(passUntil(s, "endCombat"), ap);
    expect(obj(s, wall).zone).toBe("battlefield");
    expect(obj(s, wall).damage).toBe(3);
    moveObject(s, g, "graveyard");
    s = settle(s, ap);
    expect(obj(s, d).zone).toBe("graveyard");
  });

  it("only this turn: another creature's damage, or a later turn's, destroys nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, ap, dagger());
    const g = putOnBattlefield(s0, ap, hillGiant());
    const g2 = putOnBattlefield(s0, ap, hillGiant());
    const big = putOnBattlefield(s0, opp, bear({ name: "Big Bear", toughness: "6" }));
    let s = settle(run(s0, planActivate(s0, ap, d, 0, [{ kind: "object", id: g }])), ap);
    s = toBlocks(s, ap, opp, [g2], [{ blocker: big, attacker: g2 }], ap);
    s = settle(passUntil(s, "endCombat"), ap);
    expect(obj(s, big).zone).toBe("battlefield");
    expect(s.floatingTriggers?.some((t) => t.sourceId === d)).toBe(true);
    s = passUntil(s, "upkeep", nextOf(s, ap, 1));
    expect(s.floatingTriggers?.some((t) => t.sourceId === d) ?? false).toBe(false);
  });
});
