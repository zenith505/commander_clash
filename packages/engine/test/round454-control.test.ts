// Round 454: The Dominion Bracelet (a granted ability whose cost exiles the Equipment, "You control target opponent
// during their next turn") and Secret of Bloodbending (control of an opponent during their next combat phase only, or
// during their next turn with its waterbend cost paid), CR 723.

import { describe, expect, it } from "vitest";
import { act, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, abilityProblem, botActions, compileCard, deciderOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, playerLoses, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const bracelet = (): CardDef => ({"oracleId":"c017f8ae-9103-4965-a07a-f259f44a157d","name":"The Dominion Bracelet","manaCost":"{2}","cmc":2,"typeLine":"Legendary Artifact — Equipment","supertypes":["Legendary"],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +1/+1 and has \"{15}, Exile The Dominion Bracelet: You control target opponent during their next turn. This ability costs {X} less to activate, where X is this creature's power. Activate only as a sorcery.\" (You see all cards that player could see and make all decisions for them.)\nEquip {1}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/f/5/f5360880-2849-45d6-b1aa-08c7e01083af.jpg?1783905918","artUrl":"https://cards.scryfall.io/art_crop/front/f/5/f5360880-2849-45d6-b1aa-08c7e01083af.jpg?1783905918","commanderLegal":"legal","set":"eoe","releasedAt":"2025-08-01","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const bloodbending = (): CardDef => ({"oracleId":"743fa824-18cb-4225-ba7b-5b0bbc3c8d41","name":"Secret of Bloodbending","manaCost":"{U}{U}{U}{U}","cmc":4,"typeLine":"Sorcery — Lesson","supertypes":[],"types":["Sorcery"],"subtypes":["Lesson"],"oracleText":"As an additional cost to cast this spell, you may waterbend {10}.\nYou control target opponent during their next combat phase. If this spell's additional cost was paid, you control that player during their next turn instead. (You see all cards that player could see and make all decisions for them.)\nExile Secret of Bloodbending.","colors":["U"],"colorIdentity":["U"],"keywords":["Waterbend"],"imageUrl":"https://cards.scryfall.io/normal/front/9/b/9bb928ae-f636-4aee-9146-a7885e6a8976.jpg?1783904982","artUrl":"https://cards.scryfall.io/art_crop/front/9/b/9bb928ae-f636-4aee-9146-a7885e6a8976.jpg?1783904982","commanderLegal":"legal","set":"tla","releasedAt":"2025-11-21","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const mindslaver = (): CardDef => ({"oracleId":"a806f4ee-f48a-46c3-8772-5aaabebe4c7e","name":"Mindslaver","manaCost":"{6}","cmc":6,"typeLine":"Legendary Artifact","supertypes":["Legendary"],"types":["Artifact"],"subtypes":[],"oracleText":"{4}, {T}, Sacrifice Mindslaver: You control target player during that player's next turn. (You see all cards that player could see and make all decisions for them.)","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/5/65b007d5-d9da-4342-ba7e-4b5d8d79912b.jpg?1783911706","artUrl":"https://cards.scryfall.io/art_crop/front/6/5/65b007d5-d9da-4342-ba7e-4b5d8d79912b.jpg?1783911706","commanderLegal":"legal","set":"otp","releasedAt":"2024-04-19","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const aggravatedAssault = (): CardDef => ({"oracleId":"20129459-a386-41eb-899d-1aede3427300","name":"Aggravated Assault","manaCost":"{2}{R}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"{3}{R}{R}: Untap all creatures you control. After this main phase, there is an additional combat phase followed by an additional main phase. Activate only as a sorcery.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/6/a6a8223a-98f9-43b9-aa89-b6a2c6fcaebe.jpg?1783903395","artUrl":"https://cards.scryfall.io/art_crop/front/a/6/a6a8223a-98f9-43b9-aa89-b6a2c6fcaebe.jpg?1783903395","commanderLegal":"legal","set":"sld","releasedAt":"2026-06-15","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const island = (): CardDef => ({"oracleId":"b2c6aa39-2d2a-459c-a555-fb48ba993373","name":"Island","manaCost":"","cmc":0,"typeLine":"Basic Land — Island","supertypes":["Basic"],"types":["Land"],"subtypes":["Island"],"oracleText":"({T}: Add {U}.)","colors":[],"colorIdentity":["U"],"keywords":[],"producedMana":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646","artUrl":"https://cards.scryfall.io/art_crop/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % 4]!;
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  return plan.reduce((x, a) => act(x, a), s);
};
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
/** Puts `def` onto the battlefield under `pid`, attached to `to`. */
const attach = (s: GameState, pid: PlayerId, def: CardDef, to: string) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.attachedTo = to;
  invalidateCharacteristics(s);
  return id;
};
const abIndex = (s: GameState, id: string, re: RegExp) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => re.test(a.text));
/** Taps all but `n` of `pid`'s untapped lands. */
const leaveLands = (s: GameState, pid: PlayerId, n: number) => {
  const lands = s.battlefield.filter((id) => s.objects[id]!.controller === pid && !s.objects[id]!.tapped && s.cards[s.objects[id]!.cardId]!.types.includes("Land"));
  for (const id of lands.slice(n)) s.objects[id]!.tapped = true;
};
/** Plays on, everyone passing and attacking with nothing, until `until` holds. */
const goUntil = (s: GameState, until: (s: GameState) => boolean, max = 3000) => {
  for (let i = 0; i < max; i++) {
    if (until(s)) return s;
    const pid = waitingOn(s)!;
    const pend = s.pending;
    if (pend?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (pend?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (pend?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, pend.count) });
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error("never got there");
};

describe("The Dominion Bracelet", () => {
  it("compiles: the equipped creature gets +1/+1 and an ability that exiles the Bracelet", () => {
    supported(bracelet());
    const { s, ap } = setup([]);
    const giant = putOnBattlefield(s, ap, hillGiant());
    attach(s, ap, bracelet(), giant);
    expect(pt(s, giant)).toBe("4/4");
    const i = abIndex(s, giant, /Exile The Dominion Bracelet/);
    expect(i).toBeGreaterThanOrEqual(0);
    const ab = abilitiesOf(s, s.objects[giant]!).activated[i]!;
    expect(ab.text).toMatch(/^\{15\}, Exile The Dominion Bracelet: You control target opponent during their next turn\./);
    expect(ab.grantSourceCost?.action).toBe("exile");
    expect(ab.sorcerySpeed).toBe(true);
  });

  it("costs {X} less, X the creature's power with the Bracelet's +1/+1 (locked in before costs are paid, rulings); exiles the Bracelet and controls the opponent's next turn", () => {
    const { s: s0, ap } = setup([]);
    const victim = next(s0, next(s0, ap));
    const giant = putOnBattlefield(s0, ap, hillGiant());
    const b = attach(s0, ap, bracelet(), giant);
    const i = abIndex(s0, giant, /Exile The Dominion Bracelet/);
    // Power 4: {11}. Ten lands aren't enough, eleven are.
    const ten = structuredClone(s0);
    leaveLands(ten, ap, 10);
    expect(planActivate(ten, ap, giant, i, [ply(victim)])).toBeNull();
    leaveLands(s0, ap, 11);
    let s = run(s0, planActivate(s0, ap, giant, i, [ply(victim)]));
    // Exiled as the cost, before the ability resolves; the creature isn't tapped.
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.objects[giant]!.tapped).toBe(false);
    expect(s.stack).toHaveLength(1);
    expect(pt(s, giant)).toBe("3/3");
    s = settle(s);
    expect(s.playerControls).toEqual([expect.objectContaining({ controlled: victim, controller: ap })]);
    s = passUntil(s, "main1", next(s, ap));
    expect(deciderOf(s, next(s, ap))).toBe(next(s, ap));
    s = passUntil(s, "main1", victim);
    expect(deciderOf(s, victim)).toBe(ap);
    expect(s.activePlayer).toBe(victim);
  });

  it("only an opponent, only as a sorcery, and only while the Bracelet is still there", () => {
    const { s, ap, opp } = setup([]);
    const giant = putOnBattlefield(s, ap, hillGiant());
    const b = attach(s, ap, bracelet(), giant);
    const i = abIndex(s, giant, /Exile The Dominion Bracelet/);
    expect(planActivate(s, ap, giant, i, [ply(ap)])).toBeNull();
    expect(planActivate(s, ap, giant, i, [ply(opp)])).not.toBeNull();
    // Not in combat (sorcery timing, CR 602.5d).
    const combat = passUntil(structuredClone(s), "beginCombat", ap);
    expect(planActivate(combat, ap, giant, i, [ply(opp)])).toBeNull();
    expect(abilityProblem(combat, ap, giant, i, [ply(opp)])).toMatch(/sorcery|main phase/);
    // Gone: no ability left to activate.
    const gone = structuredClone(s);
    gone.objects[b]!.attachedTo = undefined;
    invalidateCharacteristics(gone);
    expect(abIndex(gone, giant, /Exile The Dominion Bracelet/)).toBe(-1);
    // An opponent's Bracelet on your creature: still the creature's controller's ability (CR 301.5d), still exiled as the cost.
    const theirs = structuredClone(s);
    theirs.objects[b]!.controller = opp;
    invalidateCharacteristics(theirs);
    expect(planActivate(theirs, ap, giant, i, [ply(opp)])).not.toBeNull();
    const after = run(theirs, planActivate(theirs, ap, giant, i, [ply(opp)]));
    expect(after.objects[b]!.zone).toBe("exile");
  });

  it("with a power of 15 or more it costs nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    const giant = putOnBattlefield(s0, ap, hillGiant());
    s0.objects[giant]!.counters["+1/+1"] = 11;
    invalidateCharacteristics(s0);
    attach(s0, ap, bracelet(), giant);
    leaveLands(s0, ap, 0);
    const s = settle(run(s0, planActivate(s0, ap, giant, abIndex(s0, giant, /Exile The Dominion Bracelet/), [ply(opp)])));
    expect(s.playerControls).toEqual([expect.objectContaining({ controlled: opp, controller: ap })]);
  });

  it("bots don't take another player's turn with it", () => {
    const { s, ap } = setup([]);
    const giant = putOnBattlefield(s, ap, hillGiant());
    attach(s, ap, bracelet(), giant);
    const acts = botActions(s, ap);
    expect(acts.some((a) => a.type === "activateAbility" && a.objectId === giant)).toBe(false);
  });
});

describe("Secret of Bloodbending", () => {
  const islands = (s: GameState, pid: PlayerId) => {
    for (let i = 0; i < 4; i++) putOnBattlefield(s, pid, island());
  };

  it("compiles: control during their next combat phase, or during their next turn with waterbend {10} paid", () => {
    supported(bloodbending());
    const c = compileCard(bloodbending());
    expect(c.kicker?.waterbend).toBe(10);
    expect(c.exileSelfOnResolve).toBe(true);
    expect(c.spell!.targets).toEqual([expect.objectContaining({ kind: "player", opponent: true })]);
    expect(c.spell!.effects).toEqual([
      {
        type: "if",
        cond: { kind: "kicked" },
        effects: [{ type: "controlPlayer", who: { ref: "target", index: 0 }, controller: { ref: "you" } }],
        otherwise: [{ type: "controlPlayer", who: { ref: "target", index: 0 }, controller: { ref: "you" }, combat: true }],
      },
    ]);
  });

  it("you control the opponent during their next combat phase only: from the beginning of combat to the end of combat", () => {
    const { s: s0, ap, ids } = setup([bloodbending()]);
    islands(s0, ap);
    const victim = next(s0, ap);
    putOnBattlefield(s0, victim, grizzlyBears());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [ply(victim)])));
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    expect(s.playerControls).toEqual([expect.objectContaining({ controlled: victim, controller: ap, combat: true })]);
    // Not during their main phase.
    s = passUntil(s, "main1", victim);
    expect(deciderOf(s, victim)).toBe(victim);
    s = passUntil(s, "beginCombat", victim);
    expect(deciderOf(s, victim)).toBe(ap);
    expect(s.activePlayer).toBe(victim); // still the active player (CR 723.3)
    expect(s.log.some((l) => /controls .* during this combat phase/.test(l.text))).toBe(true);
    // Their attacks are yours to declare (CR 723.5).
    s = goUntil(s, (x) => x.pending?.kind === "declareAttackers");
    expect(s.pending?.player).toBe(victim);
    expect(deciderOf(s, victim)).toBe(ap);
    // A bot controlling them would declare no attacks.
    expect(botActions(s, victim)).toEqual([{ type: "declareAttackers", player: victim, attacks: [] }]);
    s = act(s, { type: "declareAttackers", player: victim, attacks: [] });
    s = goUntil(s, (x) => x.step === "main2");
    expect(deciderOf(s, victim)).toBe(victim);
    expect(s.controlledTurn).toBeUndefined();
    expect(s.playerControls).toBeUndefined();
    // Their next combat phase isn't controlled again.
    s = passUntil(s, "beginCombat", victim);
    expect(deciderOf(s, victim)).toBe(victim);
  });

  it("waterbend {10} paid: you control them during their whole next turn instead", () => {
    const { s: s0, ap, ids } = setup([bloodbending()]);
    islands(s0, ap);
    const victim = next(s0, next(s0, ap));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [ply(victim)], undefined, "auto", undefined, { kicks: [0] })));
    expect(s.playerControls).toEqual([expect.objectContaining({ controlled: victim, controller: ap })]);
    expect(s.playerControls![0]!.combat).toBeUndefined();
    s = passUntil(s, "upkeep", victim);
    expect(deciderOf(s, victim)).toBe(ap);
    s = passUntil(s, "main2", victim);
    expect(deciderOf(s, victim)).toBe(ap);
  });

  it("a skipped combat phase isn't the one: it waits for the next combat phase they actually take (rulings)", () => {
    const { s: s0, ap, ids } = setup([bloodbending()]);
    islands(s0, ap);
    const victim = next(s0, ap);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [ply(victim)])));
    s.players[victim]!.skips = [{ what: "combat" }];
    s = passUntil(s, "main2", victim);
    expect(s.log.some((l) => /skips their combat phase/.test(l.text))).toBe(true);
    expect(deciderOf(s, victim)).toBe(victim);
    expect(s.playerControls).toHaveLength(1);
    // Round the table to their next turn's combat.
    s = passUntil(s, "beginCombat", victim);
    expect(deciderOf(s, victim)).toBe(ap);
  });

  it("an additional combat phase is another phase: the control ends with the first one", () => {
    const { s: s0, ap, ids } = setup([bloodbending()]);
    islands(s0, ap);
    const victim = next(s0, ap);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [ply(victim)])));
    s = passUntil(s, "main1", victim);
    // An additional combat phase after this main phase, then the turn's own one (CR 500.8).
    s.addedPhases = ["combat"];
    s = passUntil(s, "beginCombat", victim);
    expect(deciderOf(s, victim)).toBe(ap);
    const combats = s.combatsThisTurn;
    s = goUntil(s, (x) => (x.combatsThisTurn ?? 0) > combats! && x.step === "beginCombat");
    expect(deciderOf(s, victim)).toBe(victim);
  });

  it("the last control effect created works (CR 723.1a): a later Secret overrides Mindslaver's turn for that combat phase only", () => {
    const { s: s0, ap, ids } = setup([bloodbending()]);
    islands(s0, ap);
    const victim = next(s0, next(s0, ap));
    const other = next(s0, ap);
    // Another player's turn control first, then the Secret.
    s0.playerControls = [{ controlled: victim, controller: other, created: 0 }];
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [ply(victim)])));
    s = passUntil(s, "main1", victim);
    expect(deciderOf(s, victim)).toBe(other);
    s = passUntil(s, "beginCombat", victim);
    expect(deciderOf(s, victim)).toBe(ap);
    s = goUntil(s, (x) => x.step === "main2");
    expect(deciderOf(s, victim)).toBe(other);
    s = passUntil(s, "end", victim);
    expect(deciderOf(s, victim)).toBe(other);
  });

  it("the last control effect created works (CR 723.1a): a later Mindslaver overrides the Secret, whose phase is spent", () => {
    const { s: s0, ap, ids } = setup([bloodbending()]);
    islands(s0, ap);
    const victim = next(s0, next(s0, ap));
    const other = next(s0, ap);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [ply(victim)])));
    const slaver = putOnBattlefield(s, other, mindslaver());
    islands(s, other);
    s = passUntil(s, "main1", other);
    s = settle(run(s, planActivate(s, other, slaver, 0, [ply(victim)])));
    s = passUntil(s, "beginCombat", victim);
    expect(deciderOf(s, victim)).toBe(other);
    expect(s.playerControls).toBeUndefined();
    // Their next turn's combat phase is theirs.
    s = goUntil(s, (x) => x.step === "main2");
    s = passUntil(s, "beginCombat", victim);
    expect(deciderOf(s, victim)).toBe(victim);
  });

  it("if you leave the game, the control ends (CR 800.4a)", () => {
    const { s: s0, ap, ids } = setup([bloodbending()]);
    islands(s0, ap);
    const victim = next(s0, ap);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [ply(victim)])));
    s = passUntil(s, "beginCombat", victim);
    expect(deciderOf(s, victim)).toBe(ap);
    playerLoses(s, ap, "test");
    expect(deciderOf(s, victim)).toBe(victim);
    s = goUntil(s, (x) => x.step === "main2");
    expect(s.controlledTurn).toBeUndefined();
  });
});
