// Lane B, round 69: the gaps round B68 left (two instances of conspire, CR 702.78b; the drawing player's choice among a
// draw shield and Underrealm Lich, Tomorrow, dredge and the other replacements of a draw, CR 616.1), then unsupported
// cards from the bottom of the popularity list (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, conspireInstances, controllerOf, draw, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";
import { putCounters } from "../src/counters";
import { botActions, characteristics, conspireCandidates, controllerOf, draw, drawShields, graveyardWays, hasConspire, invalidateCharacteristics, isFullySupported, mayPlayFromExile, mustAttackPlayers, objHasKeyword, planActivate, planCast, power, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";
const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty, answering "you may" with `may`; other questions are answered as the bots would, except `me`'s (it stops there). */
const settle = (s: GameState, opts: { may?: boolean; me?: PlayerId } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me !== undefined && p.player === opts.me) return s;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.may ?? true });
    else if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: [] });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Plays on (no attacks or blocks, the bots answering other questions) until `stop`. */
const goUntil = (s: GameState, stop: (s: GameState) => boolean) => {
  for (let i = 0; i < 3000; i++) {
    if (stop(s)) return s;
    const p = s.pending;
    const pid = waitingOn(s)!;
    if (p?.kind === "declareAttackers") {
      // Attackers that must attack (Skeletal Swarming) attack as the bot would have them.
      try {
        s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
      } catch {
        for (const a of botActions(s, pid)) s = act(s, a);
      }
    }
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error("never got there");
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const nameOf = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices: CostChoices = {}) => run(s, planCast(s, pid, id, targets, undefined, "auto", undefined, choices));
const activateNow = (s: GameState, pid: PlayerId, id: string, index: number, targets: TargetChoice[] = []) => run(s, planActivate(s, pid, id, index, targets));
/** Moves a new card for `def` into `pid`'s hand, library (on top), graveyard or exile. */
const toZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "library" | "graveyard" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Takes `pid`'s lands off the battlefield and leaves exactly `pool` to pay with. */
const poolOnly = (s: GameState, pid: PlayerId, pool: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  for (const id of s.battlefield.filter((x) => s.objects[x]!.controller === pid && characteristics(s, s.objects[x]!).types.includes("Land"))) {
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "exile";
    s.players[pid]!.exile.push(id);
  }
  s.players[pid]!.manaPool = { ...s.players[pid]!.manaPool, ...pool };
  invalidateCharacteristics(s);
};
const emptyHand = (s: GameState, pid: PlayerId) => s.players[pid]!.hand.splice(0).forEach((id) => (s.objects[id]!.zone = "exile"));
const tokensNamed = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && controllerOf(s, s.objects[id]!) === pid && nameOf(s, id).replace(/ Token$/, "") === name);
/** A shield from a Words activation, as Words of Wilding and Words of Worship make them (Player.nextDrawInstead). */
const bearShield = (s: GameState) => ({ turn: s.turn, source: "Words of Wilding", token: { name: "Bear", power: 2, toughness: 2, colors: ["G" as const], types: ["Creature"], subtypes: ["Bear"], keywords: [] } });
const lifeShield = (s: GameState) => ({ turn: s.turn, source: "Words of Worship", gain: 5 });

// Real oracle text (Scryfall).
const schemes = (): CardDef => ({"oracleId":"854cac11-9a22-4dea-8c1b-c49a4858a754","name":"Raiding Schemes","manaCost":"{3}{R}{G}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Each noncreature spell you cast has conspire. (As you cast a noncreature spell, you may tap two untapped creatures you control that share a color with it. When you do, copy it and you may choose new targets for the copy. A copy of a permanent spell becomes a token.)","colors":["G","R"],"colorIdentity":["G","R"],"keywords":[],"commanderLegal":"legal","set":"ecl","releasedAt":"2026-01-23","rarity":"rare","layout":"normal","gameChanger":false});
const wort = (): CardDef => ({"oracleId":"d6b67c7e-3b24-4f60-8e3a-c6ca45229d7f","name":"Wort, the Raidmother","manaCost":"{4}{R/G}{R/G}","cmc":6,"typeLine":"Legendary Creature — Goblin Shaman","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Goblin","Shaman"],"oracleText":"When Wort enters, create two 1/1 red and green Goblin Warrior creature tokens.\nEach red or green instant or sorcery spell you cast has conspire. (As you cast the spell, you may tap two untapped creatures you control that share a color with it. When you do, copy it and you may choose new targets for the copy.)","power":"3","toughness":"3","colors":["G","R"],"colorIdentity":["G","R"],"keywords":[],"commanderLegal":"legal","set":"shm","releasedAt":"2008-05-02","rarity":"rare","layout":"normal","gameChanger":false});
const burnTrail = (): CardDef => ({"oracleId":"566b4dcc-b7d7-4443-b2d0-954f1fc33a11","name":"Burn Trail","manaCost":"{3}{R}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Burn Trail deals 3 damage to any target.\nConspire (As you cast this spell, you may tap two untapped creatures you control that share a color with it. When you do, copy it and you may choose a new target for the copy.)","colors":["R"],"colorIdentity":["R"],"keywords":["Conspire"],"commanderLegal":"legal","set":"shm","releasedAt":"2008-05-02","rarity":"common","layout":"normal","gameChanger":false});
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false});
const ragingKavu = (): CardDef => ({"oracleId":"d126bb08-be60-4046-91f1-65672ef42c63","name":"Raging Kavu","manaCost":"{1}{R}{G}","cmc":3,"typeLine":"Creature — Kavu","supertypes":[],"types":["Creature"],"subtypes":["Kavu"],"oracleText":"Flash\nHaste","power":"3","toughness":"1","colors":["G","R"],"colorIdentity":["G","R"],"keywords":["Haste","Flash"],"commanderLegal":"legal","set":"inv","releasedAt":"2000-10-02","rarity":"rare","layout":"normal","gameChanger":false});
const lich = (): CardDef => ({"oracleId":"e1bce9c3-300c-4a9d-abe0-a1f02d3a1105","name":"Underrealm Lich","manaCost":"{3}{B}{G}","cmc":5,"typeLine":"Creature — Zombie Elf Shaman","supertypes":[],"types":["Creature"],"subtypes":["Zombie","Elf","Shaman"],"oracleText":"If you would draw a card, instead look at the top three cards of your library, then put one into your hand and the rest into your graveyard.\nPay 4 life: This creature gains indestructible until end of turn. Tap it.","power":"4","toughness":"3","colors":["B","G"],"colorIdentity":["B","G"],"keywords":[],"commanderLegal":"legal","set":"grn","releasedAt":"2018-10-05","rarity":"mythic","layout":"normal","gameChanger":false});
const tomorrow = (): CardDef => ({"oracleId":"51d517c9-2812-44ce-ab4d-e5422b5ecf6c","name":"Tomorrow, Azami's Familiar","manaCost":"{5}{U}","cmc":6,"typeLine":"Legendary Creature — Spirit","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Spirit"],"oracleText":"If you would draw a card, look at the top three cards of your library instead. Put one of those cards into your hand and the rest on the bottom of your library in any order.","power":"1","toughness":"5","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"bok","releasedAt":"2005-02-04","rarity":"rare","layout":"normal","gameChanger":false});
const loam = (): CardDef => ({"oracleId":"ac8fba34-512c-4f24-999a-ab72f1ce4acb","name":"Life from the Loam","manaCost":"{1}{G}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Return up to three target land cards from your graveyard to your hand.\nDredge 3 (If you would draw a card, you may mill three cards instead. If you do, return this card from your graveyard to your hand.)","colors":["G"],"colorIdentity":["G"],"keywords":["Dredge","Mill"],"commanderLegal":"legal","set":"sld","releasedAt":"2019-12-05","rarity":"rare","layout":"normal","gameChanger":false});
const thief = (): CardDef => ({"oracleId":"f8dab16e-1d50-443e-9431-8b6f1cf61c9c","name":"Notion Thief","manaCost":"{2}{U}{B}","cmc":4,"typeLine":"Creature — Human Rogue","supertypes":[],"types":["Creature"],"subtypes":["Human","Rogue"],"oracleText":"Flash\nIf an opponent would draw a card except the first one they draw in each of their draw steps, instead that player skips that draw and you draw a card.","power":"3","toughness":"1","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Flash"],"commanderLegal":"legal","set":"sld","releasedAt":"2026-04-27","rarity":"rare","layout":"normal","gameChanger":true});
const archive = (): CardDef => ({"oracleId":"d5c4d36c-54b3-4149-906b-a57a670260fc","name":"Alhammarret's Archive","manaCost":"{5}","cmc":5,"typeLine":"Legendary Artifact","supertypes":["Legendary"],"types":["Artifact"],"subtypes":[],"oracleText":"If you would gain life, you gain twice that much life instead.\nIf you would draw a card except the first one you draw in each of your draw steps, draw two cards instead.","colors":[],"colorIdentity":[],"keywords":[],"commanderLegal":"legal","set":"ori","releasedAt":"2015-07-17","rarity":"mythic","layout":"normal","gameChanger":false});

type DrawInstead = Extract<GameState["pending"], { kind: "drawInstead" }>;

describe("Lane B round 69: B68's gaps", () => {
  it("two Raiding Schemes: two instances of conspire, each paid with two creatures, each a copy (CR 702.78b)", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, schemes());
    putOnBattlefield(s0, ap, schemes());
    const g = [0, 1, 2, 3, 4, 5].map(() => putOnBattlefield(s0, ap, ragingKavu()));
    const b = toZone(s0, ap, bolt(), "hand");
    expect(conspireInstances(s0, ap, s0.objects[b]!)).toBe(2);
    poolOnly(s0, ap, { R: 1 });
    // Six creatures is a third payment it doesn't have; an odd number pays no instance.
    expect(planCast(s0, ap, b, [ply(opp)], undefined, "auto", undefined, { conspire: g })).toBeNull();
    expect(planCast(s0, ap, b, [ply(opp)], undefined, "auto", undefined, { conspire: g.slice(0, 3) })).toBeNull();
    // Both paid: two copies.
    let s = castNow(s0, ap, b, [ply(opp)], { conspire: g.slice(0, 4) });
    expect(g.slice(0, 4).every((id) => s.objects[id]!.tapped)).toBe(true);
    let copies = 0;
    for (let i = 0; i < 20 && (s.stack.length || s.pending); i++) {
      s = settle(s, { me: ap });
      if (s.pending?.kind === "copyTargets") {
        copies++;
        s = act(s, { type: "copyTargets", player: ap, targets: [ply(opp)] });
      }
    }
    expect(copies).toBe(2);
    expect(life(s, opp)).toBe(40 - 9);
    // Only one paid: one copy.
    s = castNow(s0, ap, b, [ply(opp)], { conspire: g.slice(0, 2) });
    copies = 0;
    for (let i = 0; i < 20 && (s.stack.length || s.pending); i++) {
      s = settle(s, { me: ap });
      if (s.pending?.kind === "copyTargets") {
        copies++;
        s = act(s, { type: "copyTargets", player: ap, targets: [ply(opp)] });
      }
    }
    expect(copies).toBe(1);
    expect(life(s, opp)).toBe(40 - 6);
  });

  it("Wort, the Raidmother on a card with printed conspire: two instances, two copies; without Wort, one (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, wort());
    const g = [0, 1, 2, 3].map(() => putOnBattlefield(s0, ap, ragingKavu()));
    const t = toZone(s0, ap, burnTrail(), "hand");
    expect(conspireInstances(s0, ap, s0.objects[t]!)).toBe(2);
    poolOnly(s0, ap, { R: 4 });
    let s = castNow(s0, ap, t, [ply(opp)], { conspire: g });
    let copies = 0;
    for (let i = 0; i < 20 && (s.stack.length || s.pending); i++) {
      s = settle(s, { me: ap });
      if (s.pending?.kind === "copyTargets") {
        copies++;
        s = act(s, { type: "copyTargets", player: ap, targets: [ply(opp)] });
      }
    }
    expect(copies).toBe(2);
    expect(life(s, opp)).toBe(40 - 9);
    const s1 = structuredClone(s0);
    s1.battlefield.splice(s1.battlefield.indexOf(w), 1);
    s1.objects[w]!.zone = "graveyard";
    s1.players[ap]!.graveyard.push(w);
    invalidateCharacteristics(s1);
    expect(conspireInstances(s1, ap, s1.objects[t]!)).toBe(1);
    expect(planCast(s1, ap, t, [ply(opp)], undefined, "auto", undefined, { conspire: g })).toBeNull();
    expect(planCast(s1, ap, t, [ply(opp)], undefined, "auto", undefined, { conspire: g.slice(0, 2) })).not.toBeNull();
  });

  it("a bot pays every instance of conspire it has the creatures for", () => {
    const { s: s0, ap } = setup([]);
    for (const p of s0.players) emptyHand(s0, p.id);
    s0.players[ap]!.command = [];
    putOnBattlefield(s0, ap, schemes());
    putOnBattlefield(s0, ap, schemes());
    for (let i = 0; i < 4; i++) putOnBattlefield(s0, ap, ragingKavu());
    toZone(s0, ap, bolt(), "hand");
    poolOnly(s0, ap, { R: 1 });
    // After combat: the creatures aren't needed to attack.
    s0.step = "main2";
    const cast = botActions(s0, ap).find((a) => a.type === "castSpell") as (Action & { conspire?: ObjectId[] }) | undefined;
    expect(cast?.conspire).toHaveLength(4);
  });

  it("a Words shield and Underrealm Lich: the drawing player chooses (CR 616.1); the shield not chosen waits for the next draw", () => {
    const { s: s0, ap } = setup([]);
    const l = putOnBattlefield(s0, ap, lich());
    s0.players[ap]!.nextDrawInstead = [bearShield(s0)];
    const [a, b, c] = s0.players[ap]!.library.slice(0, 3) as [ObjectId, ObjectId, ObjectId];
    let s = s0;
    expect(draw(s, ap, 1)).toBe(false);
    const pend = s.pending as DrawInstead;
    expect(pend).toMatchObject({ kind: "drawInstead", player: ap, options: ["words:0", `dig:${l}`] });
    expect(pend.labels[1]).toMatch(/Look at the top 3 cards instead.*graveyard \(Underrealm Lich\)/);
    s = act(s, { type: "drawInstead", player: ap, choice: `dig:${l}` });
    // The look, with nothing else offered: the player already chose.
    expect(s.pending).toMatchObject({ kind: "drawLook", keep: true, cards: [a, b, c] });
    expect((s.pending as { instead?: unknown }).instead).toBeUndefined();
    s = act(s, { type: "drawLook", player: ap, objectId: b });
    expect(zone(s, b)).toBe("hand");
    expect(zone(s, a)).toBe("graveyard");
    expect(tokensNamed(s, ap, "Bear")).toHaveLength(0);
    expect(s.players[ap]!.nextDrawInstead).toHaveLength(1);
    // The next draw: the shield this time.
    expect(draw(s, ap, 1)).toBe(false);
    s = act(s, { type: "drawInstead", player: ap, choice: "words:0" });
    expect(tokensNamed(s, ap, "Bear")).toHaveLength(1);
    expect(s.players[ap]!.nextDrawInstead).toBeUndefined();
    expect(s.pending).toBeFalsy();
  });

  it("a Words shield and dredge: dredging leaves the shield for the next draw; a bot dredges a card it wants back", () => {
    const { s: s0, ap, opp } = setup([]);
    const loamId = toZone(s0, ap, loam(), "graveyard");
    s0.players[ap]!.nextDrawInstead = [lifeShield(s0)];
    const top3 = s0.players[ap]!.library.slice(0, 3);
    let s = structuredClone(s0);
    expect(draw(s, ap, 1)).toBe(false);
    expect((s.pending as DrawInstead).options).toEqual(["words:0", `dredge:${loamId}`]);
    expect((s.pending as DrawInstead).labels[1]).toBe("Dredge Life from the Loam: mill 3 and return it to your hand");
    s = act(s, { type: "drawInstead", player: ap, choice: `dredge:${loamId}` });
    expect(zone(s, loamId)).toBe("hand");
    expect(top3.every((id) => zone(s, id) === "graveyard")).toBe(true);
    expect(life(s, ap)).toBe(40);
    expect(s.players[ap]!.nextDrawInstead).toHaveLength(1);
    // Or the shield: Loam stays.
    s = structuredClone(s0);
    draw(s, ap, 1);
    s = act(s, { type: "drawInstead", player: ap, choice: "words:0" });
    expect(life(s, ap)).toBe(45);
    expect(zone(s, loamId)).toBe("graveyard");
    // A bot with its own Words takes it first, as before.
    const s2 = structuredClone(s0);
    const theirLoam = toZone(s2, opp, loam(), "graveyard");
    s2.players[opp]!.nextDrawInstead = [lifeShield(s2)];
    expect(draw(s2, opp, 1)).toBe(false);
    expect((s2.pending as DrawInstead).options).toEqual(["words:0", `dredge:${theirLoam}`]);
    expect(botActions(s2, opp)).toEqual([{ type: "drawInstead", player: opp, choice: "words:0" }]);
  });

  it("Underrealm Lich and Tomorrow together: the drawing player chooses which look replaces each draw", () => {
    const { s: s0, ap } = setup([]);
    const l = putOnBattlefield(s0, ap, lich());
    const t = putOnBattlefield(s0, ap, tomorrow());
    const [a, b, c] = s0.players[ap]!.library.slice(0, 3) as [ObjectId, ObjectId, ObjectId];
    let s = s0;
    expect(draw(s, ap, 1)).toBe(false);
    expect([...(s.pending as DrawInstead).options].sort()).toEqual([`dig:${l}`, `dig:${t}`].sort());
    s = act(s, { type: "drawInstead", player: ap, choice: `dig:${t}` });
    expect(s.pending).toMatchObject({ kind: "drawLook", keep: true, bottom: true, source: "Tomorrow, Azami's Familiar", cards: [a, b, c] });
    s = act(s, { type: "drawLook", player: ap, objectId: c });
    s = act(s, { type: "orderLibrary", player: ap, order: [a, b] });
    expect(zone(s, c)).toBe("hand");
    expect(s.players[ap]!.library.slice(-2)).toEqual([a, b]);
    expect(s.players[ap]!.graveyard).toHaveLength(0);
    // A bot chooses one of them.
    expect(draw(s, ap, 1)).toBe(false);
    expect(botActions(s, ap)[0]).toMatchObject({ type: "drawInstead", choice: expect.stringMatching(/^dig:/) });
  });

  it("an opponent's Notion Thief and your dredge: you choose; the Thief draws only if you choose it", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, thief());
    const loamId = toZone(s0, ap, loam(), "graveyard");
    // Not the draw step: the Thief applies.
    let s = structuredClone(s0);
    const theirHand = s.players[opp]!.hand.length;
    expect(draw(s, ap, 1)).toBe(false);
    expect((s.pending as DrawInstead).options).toEqual([`dredge:${loamId}`, "thief"]);
    s = act(s, { type: "drawInstead", player: ap, choice: `dredge:${loamId}` });
    expect(zone(s, loamId)).toBe("hand");
    expect(s.players[opp]!.hand.length).toBe(theirHand);
    s = structuredClone(s0);
    draw(s, ap, 1);
    s = act(s, { type: "drawInstead", player: ap, choice: "thief" });
    expect(s.players[opp]!.hand.length).toBe(theirHand + 1);
    expect(zone(s, loamId)).toBe("graveyard");
    // A Thief alone asks nothing, as before.
    s = structuredClone(s0);
    s.players[ap]!.graveyard = s.players[ap]!.graveyard.filter((id) => id !== loamId);
    expect(draw(s, ap, 1)).toBe(true);
    expect(s.players[opp]!.hand.length).toBe(theirHand + 1);
  });

  it("Alhammarret's Archive and a Words shield: the Archive first makes two draws, the shield replaces the first of them", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, archive());
    s0.players[ap]!.nextDrawInstead = [bearShield(s0)];
    const hand = s0.players[ap]!.hand.length;
    let s = s0;
    expect(draw(s, ap, 1)).toBe(false);
    expect((s.pending as DrawInstead).options).toEqual(["words:0", "archive"]);
    s = act(s, { type: "drawInstead", player: ap, choice: "archive" });
    expect(tokensNamed(s, ap, "Bear")).toHaveLength(1);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.pending).toBeFalsy();
  });
});
