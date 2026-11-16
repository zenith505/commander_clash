// Lane B, round 69: the gaps round B68 left (two instances of conspire, CR 702.78b; the drawing player's choice among a
// draw shield and Underrealm Lich, Tomorrow, dredge and the other replacements of a draw, CR 616.1), then unsupported
// cards from the bottom of the popularity list (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { blockCost, botActions, characteristics, conspireInstances, controllerOf, draw, invalidateCharacteristics, isFullySupported, manaAbilitiesOn, manaChoices, planActivate, planCast, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";
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
const schemes = (): CardDef => ({"oracleId":"854cac11-9a22-4dea-8c1b-c49a4858a754","name":"Raiding Schemes","manaCost":"{3}{R}{G}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Each noncreature spell you cast has conspire. (As you cast a noncreature spell, you may tap two untapped creatures you control that share a color with it. When you do, copy it and you may choose new targets for the copy. A copy of a permanent spell becomes a token.)","colors":["G","R"],"colorIdentity":["G","R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/b/0bab5da5-72a7-4340-9b53-492ab14a9f71.jpg?1783904405","artUrl":"https://cards.scryfall.io/art_crop/front/0/b/0bab5da5-72a7-4340-9b53-492ab14a9f71.jpg?1783904405","commanderLegal":"legal","set":"ecl","releasedAt":"2026-01-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const wort = (): CardDef => ({"oracleId":"d6b67c7e-3b24-4f60-8e3a-c6ca45229d7f","name":"Wort, the Raidmother","manaCost":"{4}{R/G}{R/G}","cmc":6,"typeLine":"Legendary Creature — Goblin Shaman","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Goblin","Shaman"],"oracleText":"When Wort enters, create two 1/1 red and green Goblin Warrior creature tokens.\nEach red or green instant or sorcery spell you cast has conspire. (As you cast the spell, you may tap two untapped creatures you control that share a color with it. When you do, copy it and you may choose new targets for the copy.)","power":"3","toughness":"3","colors":["G","R"],"colorIdentity":["G","R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/3/535189ec-572f-44ed-9741-09b9f575fc40.jpg?1783942718","artUrl":"https://cards.scryfall.io/art_crop/front/5/3/535189ec-572f-44ed-9741-09b9f575fc40.jpg?1783942718","commanderLegal":"legal","set":"shm","releasedAt":"2008-05-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const burnTrail = (): CardDef => ({"oracleId":"566b4dcc-b7d7-4443-b2d0-954f1fc33a11","name":"Burn Trail","manaCost":"{3}{R}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Burn Trail deals 3 damage to any target.\nConspire (As you cast this spell, you may tap two untapped creatures you control that share a color with it. When you do, copy it and you may choose a new target for the copy.)","colors":["R"],"colorIdentity":["R"],"keywords":["Conspire"],"imageUrl":"https://cards.scryfall.io/normal/front/7/f/7f01f9a0-f1d0-4241-a270-df4ed673d1fd.jpg?1783942750","artUrl":"https://cards.scryfall.io/art_crop/front/7/f/7f01f9a0-f1d0-4241-a270-df4ed673d1fd.jpg?1783942750","commanderLegal":"legal","set":"shm","releasedAt":"2008-05-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const ragingKavu = (): CardDef => ({"oracleId":"d126bb08-be60-4046-91f1-65672ef42c63","name":"Raging Kavu","manaCost":"{1}{R}{G}","cmc":3,"typeLine":"Creature — Kavu","supertypes":[],"types":["Creature"],"subtypes":["Kavu"],"oracleText":"Flash\nHaste","power":"3","toughness":"1","colors":["G","R"],"colorIdentity":["G","R"],"keywords":["Haste","Flash"],"imageUrl":"https://cards.scryfall.io/normal/front/2/7/27573679-e9e5-4bfc-b5d5-85d4648b01b6.jpg?1783945659","artUrl":"https://cards.scryfall.io/art_crop/front/2/7/27573679-e9e5-4bfc-b5d5-85d4648b01b6.jpg?1783945659","commanderLegal":"legal","set":"inv","releasedAt":"2000-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const lich = (): CardDef => ({"oracleId":"e1bce9c3-300c-4a9d-abe0-a1f02d3a1105","name":"Underrealm Lich","manaCost":"{3}{B}{G}","cmc":5,"typeLine":"Creature — Zombie Elf Shaman","supertypes":[],"types":["Creature"],"subtypes":["Zombie","Elf","Shaman"],"oracleText":"If you would draw a card, instead look at the top three cards of your library, then put one into your hand and the rest into your graveyard.\nPay 4 life: This creature gains indestructible until end of turn. Tap it.","power":"4","toughness":"3","colors":["B","G"],"colorIdentity":["B","G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/7/0782e090-209c-428f-966a-17f3ceab2903.jpg?1783934118","artUrl":"https://cards.scryfall.io/art_crop/front/0/7/0782e090-209c-428f-966a-17f3ceab2903.jpg?1783934118","commanderLegal":"legal","set":"grn","releasedAt":"2018-10-05","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const tomorrow = (): CardDef => ({"oracleId":"51d517c9-2812-44ce-ab4d-e5422b5ecf6c","name":"Tomorrow, Azami's Familiar","manaCost":"{5}{U}","cmc":6,"typeLine":"Legendary Creature — Spirit","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Spirit"],"oracleText":"If you would draw a card, look at the top three cards of your library instead. Put one of those cards into your hand and the rest on the bottom of your library in any order.","power":"1","toughness":"5","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/9/095813f9-d559-40bd-a50f-7c1f6e494e60.jpg?1783944201","artUrl":"https://cards.scryfall.io/art_crop/front/0/9/095813f9-d559-40bd-a50f-7c1f6e494e60.jpg?1783944201","commanderLegal":"legal","set":"bok","releasedAt":"2005-02-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const loam = (): CardDef => ({"oracleId":"ac8fba34-512c-4f24-999a-ab72f1ce4acb","name":"Life from the Loam","manaCost":"{1}{G}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Return up to three target land cards from your graveyard to your hand.\nDredge 3 (If you would draw a card, you may mill three cards instead. If you do, return this card from your graveyard to your hand.)","colors":["G"],"colorIdentity":["G"],"keywords":["Dredge","Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/8/9/899ed197-e434-4f01-a71f-053ae3820d6c.jpg?1783931626","artUrl":"https://cards.scryfall.io/art_crop/front/8/9/899ed197-e434-4f01-a71f-053ae3820d6c.jpg?1783931626","commanderLegal":"legal","set":"sld","releasedAt":"2019-12-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const thief = (): CardDef => ({"oracleId":"f8dab16e-1d50-443e-9431-8b6f1cf61c9c","name":"Notion Thief","manaCost":"{2}{U}{B}","cmc":4,"typeLine":"Creature — Human Rogue","supertypes":[],"types":["Creature"],"subtypes":["Human","Rogue"],"oracleText":"Flash\nIf an opponent would draw a card except the first one they draw in each of their draw steps, instead that player skips that draw and you draw a card.","power":"3","toughness":"1","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Flash"],"imageUrl":"https://cards.scryfall.io/normal/front/e/4/e419afcd-c123-4ec6-b669-8240d9daea88.jpg?1783903506","artUrl":"https://cards.scryfall.io/art_crop/front/e/4/e419afcd-c123-4ec6-b669-8240d9daea88.jpg?1783903506","commanderLegal":"legal","set":"sld","releasedAt":"2026-04-27","rarity":"rare","layout":"normal","gameChanger":true}) as CardDef;
const archive = (): CardDef => ({"oracleId":"d5c4d36c-54b3-4149-906b-a57a670260fc","name":"Alhammarret's Archive","manaCost":"{5}","cmc":5,"typeLine":"Legendary Artifact","supertypes":["Legendary"],"types":["Artifact"],"subtypes":[],"oracleText":"If you would gain life, you gain twice that much life instead.\nIf you would draw a card except the first one you draw in each of your draw steps, draw two cards instead.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/0/70afb856-6697-411b-b1aa-e9290a0bfd68.jpg?1783938312","artUrl":"https://cards.scryfall.io/art_crop/front/7/0/70afb856-6697-411b-b1aa-e9290a0bfd68.jpg?1783938312","commanderLegal":"legal","set":"ori","releasedAt":"2015-07-17","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;

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

// Round B69's cards (real oracle text, Scryfall).
const fantastic = (): CardDef => ({"oracleId":"a8011dce-17fb-46e1-8297-81a4acccbd05","name":"Mister Fantastic","manaCost":"{2}{U}","cmc":3,"typeLine":"Legendary Creature — Human Scientist Hero","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Scientist","Hero"],"oracleText":"Reach, vigilance\nAt the beginning of combat on your turn, if you've cast a noncreature spell this turn, draw a card.\n{R}{G}{W}{U}, {T}: Copy target triggered ability you control twice. You may choose new targets for the copies.","power":"2","toughness":"4","colors":["U"],"colorIdentity":["G","R","U","W"],"keywords":["Reach","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/f/1/f1d80509-ece1-4b6d-bfe5-c6d003f581cf.jpg?1783903304","artUrl":"https://cards.scryfall.io/art_crop/front/f/1/f1d80509-ece1-4b6d-bfe5-c6d003f581cf.jpg?1783903304","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const donraph = (): CardDef => ({"oracleId":"01758a4a-ac29-47ad-8e88-158374f1ae4c","name":"Don & Raph, Hard Science","manaCost":"{1}{U/R}{U/R}","cmc":3,"typeLine":"Legendary Creature — Mutant Ninja Turtle","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Mutant","Ninja","Turtle"],"oracleText":"Menace\nWhenever Don & Raph attack, the next noncreature spell you cast this turn has affinity for artifacts. (It costs {1} less to cast for each artifact you control.)","power":"2","toughness":"4","colors":["R","U"],"colorIdentity":["R","U"],"keywords":["Menace"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4f38126c-26a9-4447-801f-4f19e84c4aa5.jpg?1783904078","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4f38126c-26a9-4447-801f-4f19e84c4aa5.jpg?1783904078","commanderLegal":"legal","set":"tmt","releasedAt":"2026-03-06","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const lecturer = (): CardDef => ({"oracleId":"ac230b68-f945-4a1a-bd89-33e6d62e3c36","name":"Silverquill Lecturer","manaCost":"{4}{W}","cmc":5,"typeLine":"Creature — Kor Wizard","supertypes":[],"types":["Creature"],"subtypes":["Kor","Wizard"],"oracleText":"Creature spells you cast have demonstrate. (Whenever you cast a creature spell, you may copy it. If you do, choose an opponent to also copy it. Each copy becomes a token.)","power":"3","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/0/507e34d0-cdc5-4226-9664-b725b702044d.jpg?1783911411","artUrl":"https://cards.scryfall.io/art_crop/front/5/0/507e34d0-cdc5-4226-9664-b725b702044d.jpg?1783911411","commanderLegal":"legal","set":"m3c","releasedAt":"2024-06-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const zhao = (): CardDef => ({"oracleId":"94c64d41-d756-42b6-b0e7-0a351d64a68c","name":"Zhao, the Moon Slayer","manaCost":"{1}{R}","cmc":2,"typeLine":"Legendary Creature — Human Soldier","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Soldier"],"oracleText":"Menace\nNonbasic lands enter tapped.\n{7}: Put a conqueror counter on Zhao.\nAs long as Zhao has a conqueror counter on him, nonbasic lands are Mountains. (They lose all other land types and abilities and have \"{T}: Add {R}.\")","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":["Menace"],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/f/1/f1015bf5-de98-41f3-b6b1-ed95f7465944.jpg?1783904949","artUrl":"https://cards.scryfall.io/art_crop/front/f/1/f1015bf5-de98-41f3-b6b1-ed95f7465944.jpg?1783904949","commanderLegal":"legal","set":"tla","releasedAt":"2025-11-21","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const toxicrene = (): CardDef => ({"oracleId":"fbfe98f0-110b-4d4b-9240-2767b08acf68","name":"Toxicrene","manaCost":"{3}{G}","cmc":4,"typeLine":"Creature — Tyranid","supertypes":[],"types":["Creature"],"subtypes":["Tyranid"],"oracleText":"Reach, deathtouch\nHypertoxic Miasma — All lands have \"{T}: Add one mana of any color\" and lose all other abilities.","power":"2","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":["Deathtouch","Hypertoxic Miasma","Reach"],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/a/9/a9b0fe26-18af-4b2e-861e-568d2f6208fd.jpg?1783920868","artUrl":"https://cards.scryfall.io/art_crop/front/a/9/a9b0fe26-18af-4b2e-861e-568d2f6208fd.jpg?1783920868","commanderLegal":"legal","set":"40k","releasedAt":"2022-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const cult = (): CardDef => ({"oracleId":"4ea5409e-9b39-434c-bdb8-8c798128f199","name":"Cult of the Waxing Moon","manaCost":"{4}{G}","cmc":5,"typeLine":"Creature — Human Shaman","supertypes":[],"types":["Creature"],"subtypes":["Human","Shaman"],"oracleText":"Whenever a permanent you control transforms into a non-Human creature, create a 2/2 green Wolf creature token.","power":"5","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/2/d2a13669-4656-476a-8984-ec3d47960907.jpg?1783937733","artUrl":"https://cards.scryfall.io/art_crop/front/d/2/d2a13669-4656-476a-8984-ec3d47960907.jpg?1783937733","commanderLegal":"legal","set":"soi","releasedAt":"2016-04-08","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const slime = (): CardDef => ({"oracleId":"4696decb-7bff-4c6b-8a7b-9ec324faefde","name":"Ravenous Slime","manaCost":"{2}{G}","cmc":3,"typeLine":"Creature — Ooze","supertypes":[],"types":["Creature"],"subtypes":["Ooze"],"oracleText":"This creature can't be blocked by creatures with power 2 or less.\nIf a creature an opponent controls would die, instead exile it and put a number of +1/+1 counters equal to that creature's power on this creature.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/2/528d8f5e-2d58-4526-875b-21d199267210.jpg?1783934331","artUrl":"https://cards.scryfall.io/art_crop/front/5/2/528d8f5e-2d58-4526-875b-21d199267210.jpg?1783934331","commanderLegal":"legal","set":"c18","releasedAt":"2018-08-10","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const hydro = (): CardDef => ({"oracleId":"a93a8edf-2879-4cae-b3b9-b46298270823","name":"Hydro-Man, Fluid Felon","manaCost":"{U}{U}","cmc":2,"typeLine":"Legendary Creature — Elemental Villain","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elemental","Villain"],"oracleText":"Whenever you cast a blue spell, if Hydro-Man is a creature, he gets +1/+1 until end of turn.\nAt the beginning of your end step, untap Hydro-Man. Until your next turn, he becomes a land and gains \"{T}: Add {U}.\" (He's not a creature during that time.)","power":"2","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":[],"producedMana":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/0/a/0a1265db-ff16-4751-9301-78d29b271cda.jpg?1783905273","artUrl":"https://cards.scryfall.io/art_crop/front/0/a/0a1265db-ff16-4751-9301-78d29b271cda.jpg?1783905273","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const cadence = (): CardDef => ({"oracleId":"49d0fdd6-cc8f-4fe1-a6bd-4321dac18404","name":"War Cadence","manaCost":"{2}{R}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"{X}{R}: This turn, creatures can't block unless their controller pays {X} for each blocking creature they control.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/0/e030d2eb-70c5-4ff7-8f03-ad5495cf9c69.jpg?1783945932","artUrl":"https://cards.scryfall.io/art_crop/front/e/0/e030d2eb-70c5-4ff7-8f03-ad5495cf9c69.jpg?1783945932","commanderLegal":"legal","set":"mmq","releasedAt":"1999-10-04","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const retribution = (): CardDef => ({"oracleId":"550b8bee-1773-427b-b300-aaceff243e11","name":"Retribution of the Ancients","manaCost":"{B}","cmc":1,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"{B}, Remove X +1/+1 counters from among creatures you control: Target creature gets -X/-X until end of turn.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/d/0d3ee29d-b374-471d-80c3-bcad7a4226e6.jpg?1783939078","artUrl":"https://cards.scryfall.io/art_crop/front/0/d/0d3ee29d-b374-471d-80c3-bcad7a4226e6.jpg?1783939078","commanderLegal":"legal","set":"ktk","releasedAt":"2014-09-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const visionary = (): CardDef => ({"oracleId":"c6a3a882-a127-4590-93d7-679ef4313efe","name":"Elvish Visionary","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Elf Shaman","supertypes":[],"types":["Creature"],"subtypes":["Elf","Shaman"],"oracleText":"When this creature enters, draw a card.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/9/69f570b5-1629-4b10-8f66-ed9b4355a0a4.jpg?1783908825","artUrl":"https://cards.scryfall.io/art_crop/front/6/9/69f570b5-1629-4b10-8f66-ed9b4355a0a4.jpg?1783908825","commanderLegal":"legal","set":"j25","releasedAt":"2024-11-15","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const barb = (): CardDef => ({"oracleId":"9a1622a5-c982-407b-a158-7b8ad9238aac","name":"Searing Barb","manaCost":"{2}{R}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Searing Barb deals 2 damage to any target. If it's a creature, it can't block this turn. Incubate 1. (Create an Incubator token with a +1/+1 counter on it and \"{2}: Transform this token.\" It transforms into a 0/0 Phyrexian artifact creature.)","colors":["R"],"colorIdentity":["R"],"keywords":["Incubate","Transform"],"imageUrl":"https://cards.scryfall.io/normal/front/6/9/69f156b6-68c2-4787-b3f0-6d1079bb576f.jpg?1783916981","artUrl":"https://cards.scryfall.io/art_crop/front/6/9/69f156b6-68c2-4787-b3f0-6d1079bb576f.jpg?1783916981","commanderLegal":"legal","set":"mom","releasedAt":"2023-04-21","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const tower = (): CardDef => ({"oracleId":"0895c9b7-ae7d-4bb3-af17-3b75deb50a25","name":"Command Tower","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add one mana of any color in your commander's color identity.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/1/a/1ac6cb62-45da-4e9a-84c6-09e6eacf0664.jpg?1789644465","artUrl":"https://cards.scryfall.io/art_crop/front/1/a/1ac6cb62-45da-4e9a-84c6-09e6eacf0664.jpg?1789644465","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const damnation = (): CardDef => ({"oracleId":"d57a8f0b-7989-4db5-8756-6f2690097252","name":"Damnation","manaCost":"{2}{B}{B}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Destroy all creatures. They can't be regenerated.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/f/7fc1d7db-11a3-4ff9-8d27-1fe401053080.jpg?1783928578","artUrl":"https://cards.scryfall.io/art_crop/front/7/f/7fc1d7db-11a3-4ff9-8d27-1fe401053080.jpg?1783928578","commanderLegal":"legal","set":"sld","releasedAt":"2020-11-30","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const relic = (name: string): CardDef => ({ ...giant(), oracleId: `relic-${name}`, name, manaCost: "{1}", cmc: 1, typeLine: "Artifact", types: ["Artifact"], subtypes: [], oracleText: "", power: undefined, toughness: undefined, colors: [] }) as CardDef;
/** What a land can tap for: each color its mana abilities make. */
const makes = (s: GameState, id: string) => [...new Set(manaAbilitiesOn(s, s.objects[id]!).flatMap((ab) => manaChoices(s, s.objects[id]!, ab)))].sort();
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && nameOf(s, id).replace(/ Token$/, "") === name);

describe("Lane B round 69: cards", () => {
  it("compile", () => supported(fantastic(), donraph(), lecturer(), zhao(), toxicrene(), cult(), slime(), hydro(), cadence(), retribution()));
  it("Day of the Moon is supported since round 382 (a name chosen for the Saga each chapter, then goad by those names)", () => {
    expect(isFullySupported({ ...cadence(), oracleId: "day-of-the-moon", name: "Day of the Moon", typeLine: "Enchantment — Saga", subtypes: ["Saga"], oracleText: "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI, II, III — Choose a creature card name, then goad all creatures with a name chosen for this enchantment. (Until your next turn, they attack each combat if able and attack a player other than you if able.)" } as CardDef)).toBe(true);
  });
});

describe("Mister Fantastic", () => {
  it("copies target triggered ability you control twice: Elvish Visionary's trigger draws three cards", () => {
    const { s: s0, ap, ids } = setup([visionary()]);
    const f = putOnBattlefield(s0, ap, fantastic());
    poolOnly(s0, ap, { G: 1, C: 1 });
    let s = castNow(s0, ap, ids[0]!);
    for (let i = 0; i < 20 && !s.stack.some((x) => x.kind === "ability"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const trig = s.stack.find((x) => x.kind === "ability")!;
    expect(trig).toBeTruthy();
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, R: 1, G: 1, W: 1, U: 1 };
    const hand = s.players[ap]!.hand.length;
    s = run(s, planActivate(s, ap, f, 0, [{ kind: "stack", id: trig.id }]));
    expect(s.objects[f]!.tapped).toBe(true);
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 3);
  });
});

describe("Don & Raph, Hard Science", () => {
  it("attacking: the next noncreature spell you cast this turn has affinity for artifacts; a creature spell first doesn't use it", () => {
    const { s: s0, ap, opp, ids } = setup([bears(), divination(), divination()]);
    const dr = putOnBattlefield(s0, ap, donraph());
    putOnBattlefield(s0, ap, relic("Relic A"));
    putOnBattlefield(s0, ap, relic("Relic B"));
    let s = goUntil(s0, (st) => st.pending?.kind === "declareAttackers" && st.activePlayer === ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: dr, defender: opp }] });
    s = goUntil(s, (st) => st.step === "main2" && !st.stack.length && !st.pending && waitingOn(st) === ap);
    poolOnly(s, ap, { G: 1, C: 1 });
    s = settle(castNow(s, ap, ids[0]!));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    // Divination {2}{U}, two artifacts: {U}.
    poolOnly(s, ap, { U: 1 });
    s = settle(castNow(s, ap, ids[1]!));
    expect(zone(s, ids[1]!)).toBe("graveyard");
    // Only the next one.
    poolOnly(s, ap, { U: 1 });
    expect(planCast(s, ap, ids[2]!)).toBeNull();
  });
});

describe("Silverquill Lecturer", () => {
  it("a creature spell you cast has demonstrate: you copy it and the opponent you choose copies it too, each a token", () => {
    const { s: s0, ap, opp, ids } = setup([bears()]);
    putOnBattlefield(s0, ap, lecturer());
    poolOnly(s0, ap, { G: 1, C: 1 });
    let s = castNow(s0, ap, ids[0]!);
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "demonstrate" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: String(opp) }));
    expect(named(s, ap, "Grizzly Bears")).toHaveLength(2);
    expect(named(s, opp, "Grizzly Bears")).toHaveLength(1);
    expect(named(s, opp, "Grizzly Bears").every((id) => s.objects[id]!.isToken)).toBe(true);
  });
  it("not a noncreature spell", () => {
    const { s: s0, ap, ids } = setup([divination()]);
    putOnBattlefield(s0, ap, lecturer());
    poolOnly(s0, ap, { U: 1, C: 2 });
    let s = castNow(s0, ap, ids[0]!);
    for (let i = 0; i < 20 && s.stack.length; i++) {
      expect(s.pending?.kind).not.toBe("chooseMay");
      s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });
});

describe("Zhao, the Moon Slayer", () => {
  it("nonbasic lands enter tapped; with a conqueror counter, nonbasic lands are Mountains that tap for {R} only", () => {
    const { s: s0, ap, opp } = setup([]);
    const z = putOnBattlefield(s0, opp, zhao());
    const t = toZone(s0, ap, tower(), "hand");
    let s = act(s0, { type: "playLand", player: ap, objectId: t });
    expect(s.objects[t]!.tapped).toBe(true);
    expect(characteristics(s, s.objects[t]!).subtypes).not.toContain("Mountain");
    const swamp = s.battlefield.find((id) => nameOf(s, id) === "Swamp" && controllerOf(s, s.objects[id]!) === ap)!;
    s.objects[z]!.counters.conqueror = 1;
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[t]!).subtypes).toEqual(["Mountain"]);
    expect(makes(s, t)).toEqual(["R"]);
    expect(makes(s, swamp)).toEqual(["B"]);
  });
});

describe("Toxicrene", () => {
  it("all lands tap for any color and lose their other abilities, a Forest's {G} too; land types stay", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, ap, tower());
    const swamp = s0.battlefield.find((id) => nameOf(s0, id) === "Swamp" && controllerOf(s0, s0.objects[id]!) === ap)!;
    const before = [...s0.battlefield];
    putOnBattlefield(s0, opp, toxicrene());
    invalidateCharacteristics(s0);
    expect(makes(s0, swamp)).toEqual(["B", "G", "R", "U", "W"]);
    expect(manaAbilitiesOn(s0, s0.objects[swamp]!)).toHaveLength(1);
    expect(characteristics(s0, s0.objects[swamp]!).subtypes).toEqual(["Swamp"]);
    expect(makes(s0, t)).toEqual(["B", "G", "R", "U", "W"]);
    expect(manaAbilitiesOn(s0, s0.objects[t]!)).toHaveLength(1);
    expect(before).toContain(t);
  });
});

describe("Cult of the Waxing Moon", () => {
  it("an Incubator token you control transforming into a Phyrexian artifact creature (non-Human) makes a Wolf", () => {
    const { s: s0, ap, opp, ids } = setup([barb()]);
    putOnBattlefield(s0, ap, cult());
    poolOnly(s0, ap, { R: 1, C: 2 });
    let s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]), { me: ap });
    const inc = s.battlefield.find((id) => s.objects[id]!.isToken && controllerOf(s, s.objects[id]!) === ap)!;
    expect(tokensNamed(s, ap, "Wolf")).toHaveLength(0);
    poolOnly(s, ap, { C: 2 });
    s = settle(run(s, planActivate(s, ap, inc, 0)), { me: ap });
    expect(characteristics(s, s.objects[inc]!).types).toContain("Creature");
    expect(tokensNamed(s, ap, "Wolf")).toHaveLength(1);
  });
});

describe("Ravenous Slime", () => {
  it("an opponent's dying creature is exiled instead, and the Slime gets +1/+1 counters equal to its power; yours dies", () => {
    const { s: s0, ap, opp, ids } = setup([bolt(), bolt()]);
    const sl = putOnBattlefield(s0, ap, slime());
    const theirs = putOnBattlefield(s0, opp, giant());
    const mine = putOnBattlefield(s0, ap, bears());
    s0.objects[theirs]!.counters["+1/+1"] = 1; // 4/4: dies to Bolt plus 1 damage
    s0.objects[theirs]!.damage = 1;
    invalidateCharacteristics(s0);
    poolOnly(s0, ap, { R: 2 });
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(theirs)]));
    expect(zone(s, theirs)).toBe("exile");
    expect(s.objects[sl]!.counters["+1/+1"]).toBe(4);
    s = settle(castNow(s, ap, ids[1]!, [tgt(mine)]));
    expect(zone(s, mine)).toBe("graveyard");
    expect(s.objects[sl]!.counters["+1/+1"]).toBe(4);
  });
  it("dying at the same time as an opponent's creature: that creature is still exiled (rulings), no counters", () => {
    const { s: s0, ap, opp, ids } = setup([damnation()]);
    const sl = putOnBattlefield(s0, ap, slime());
    const theirs = putOnBattlefield(s0, opp, giant());
    poolOnly(s0, ap, { B: 2, C: 2 });
    const s = settle(castNow(s0, ap, ids[0]!));
    expect(zone(s, sl)).toBe("graveyard");
    expect(zone(s, theirs)).toBe("exile");
  });
});

describe("Hydro-Man, Fluid Felon", () => {
  it("at your end step: untapped, a land that taps for {U} and not a creature until your next turn", () => {
    const { s: s0, ap } = setup([]);
    const h = putOnBattlefield(s0, ap, hydro());
    s0.objects[h]!.tapped = true;
    const t0 = s0.turn;
    let s = goUntil(s0, (st) => st.step === "end" && st.activePlayer === ap && !st.stack.length && !st.triggerQueue.length && !st.pending && characteristics(st, st.objects[h]!).types.includes("Land"));
    const c = characteristics(s, s.objects[h]!);
    expect(c.types).toEqual(["Land"]);
    expect(s.objects[h]!.tapped).toBe(false);
    expect(makes(s, h)).toEqual(["U"]);
    s = goUntil(s, (st) => st.activePlayer !== ap && st.step === "main1");
    expect(characteristics(s, s.objects[h]!).types).toEqual(["Land"]);
    s = goUntil(s, (st) => st.activePlayer === ap && st.turn > t0 && st.step === "upkeep");
    expect(characteristics(s, s.objects[h]!).types).toEqual(["Creature"]);
    expect(makes(s, h)).toEqual([]);
  });
});

describe("War Cadence", () => {
  it("{X}{R}: this turn, blocking costs {X} for each blocking creature; next turn it's free again", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, cadence());
    poolOnly(s0, ap, { R: 1, C: 2 });
    let s = settle(run(s0, planActivate(s0, ap, w, 0, [], undefined, undefined, 2)));
    expect(blockCost(s, 1)).toBe("{2}");
    expect(blockCost(s, 3)).toBe("{6}");
    s = goUntil(s, (st) => st.activePlayer !== ap && st.step === "main1");
    expect(blockCost(s, 1)).toBe("");
  });
});

describe("Retribution of the Ancients", () => {
  it("remove X +1/+1 counters from among your creatures: target creature gets -X/-X", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, retribution());
    const a = putOnBattlefield(s0, ap, bears());
    const b = putOnBattlefield(s0, ap, giant());
    const t = putOnBattlefield(s0, opp, giant());
    s0.objects[a]!.counters["+1/+1"] = 1;
    s0.objects[b]!.counters["+1/+1"] = 2;
    invalidateCharacteristics(s0);
    poolOnly(s0, ap, { B: 1 });
    // The counters must add up to X, and there must be that many.
    expect(planActivate(s0, ap, r, 0, [tgt(t)], undefined, undefined, 3, { counters: [{ id: a, kind: "+1/+1" }, { id: b, kind: "+1/+1" }] })).toBeNull();
    expect(planActivate(s0, ap, r, 0, [tgt(t)], undefined, undefined, 4)).toBeNull();
    const s = settle(run(s0, planActivate(s0, ap, r, 0, [tgt(t)], undefined, undefined, 3, { counters: [{ id: a, kind: "+1/+1" }, { id: b, kind: "+1/+1" }, { id: b, kind: "+1/+1" }] })));
    expect(zone(s, t)).toBe("graveyard");
    expect(s.objects[a]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.objects[b]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});
