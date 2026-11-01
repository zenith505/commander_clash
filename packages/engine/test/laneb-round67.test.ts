// Lane B, round 67: unsupported cards no earlier round wrote down, from EDHREC rank about 19,700 up and the B10 and B11
// lists (`npm run popular -- --least`): the Words' draw replacements, looking at face-down creatures, Arboria, Fblthp,
// Impossibly Lost, Turtle Van, Give // Take, Reason // Believe, Vision, Howl of the Horde, Keeper of Progenitus and
// Shizuko, Caller of Autumn.

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, attackProblem, botActions, castProblem, characteristics, controllerOf, draw, faceDownVisible, invalidateCharacteristics, isFullySupported, planActivate, planCast, topVisible, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";
const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/**
 * Everyone passes until the stack is empty, answering "you may" with `may` and trigger targets with `targets`; other
 * players' questions are answered as the bots would. Stops at any other question of `me`'s.
 */
const settle = (s: GameState, opts: { may?: boolean; targets?: TargetChoice[]; me?: PlayerId } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me !== undefined && p.player !== opts.me) s = act(s, botActions(s, p.player)[0]!);
    else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.may ?? true });
    else if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets ?? [] });
    else if (p && opts.me !== undefined) return s;
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
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error("never got there");
};
/**
 * Attack with `attacks`, no blocks; `me`'s trigger targets are answered with `targets`; other players answer as bots
 * do. Runs until combat is over.
 */
const attack = (s: GameState, me: PlayerId, attacks: { attacker: ObjectId; defender: PlayerId }[], opts: { targets?: TargetChoice[] } = {}) => {
  s = act(s, { type: "declareAttackers", player: me, attacks });
  for (let i = 0; i < 160 && s.step !== "main2" && !s.over; i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p && p.player === me && p.kind === "chooseTargets" && opts.targets) s = act(s, { type: "chooseTargets", player: me, targets: opts.targets });
    else if (p) s = act(s, botActions(s, p.player)[0]!);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const nameOf = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices: CostChoices = {}) => run(s, planCast(s, pid, id, targets, undefined, "auto", undefined, choices));
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
const counters = (s: GameState, id: string, kind = "+1/+1") => s.objects[id]!.counters?.[kind] ?? 0;
const tokensNamed = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && controllerOf(s, s.objects[id]!) === pid && nameOf(s, id).replace(/ Token$/, "") === name);
const activateNow = (s: GameState, pid: PlayerId, id: string, index: number, targets: TargetChoice[] = []) => run(s, planActivate(s, pid, id, index, targets));
const pool = (s: GameState, pid: PlayerId) => s.players[pid]!.manaPool;

// Real oracle text (Scryfall).
const turtleVan = (): CardDef => ({"oracleId":"aeb9a2e6-ad11-4e2c-81d0-caf279d31ece","name":"Turtle Van","manaCost":"{3}","cmc":3,"typeLine":"Artifact — Vehicle","supertypes":[],"types":["Artifact"],"subtypes":["Vehicle"],"oracleText":"Whenever this Vehicle attacks, put a +1/+1 counter on target creature that crewed it this turn. Then if that creature is a Mutant, Ninja, or Turtle, double the number of +1/+1 counters on it.\nCrew 1 (Tap any number of creatures you control with total power 1 or more: This Vehicle becomes an artifact creature until end of turn.)","power":"4","toughness":"4","colors":[],"colorIdentity":[],"keywords":["Crew","Double"],"imageUrl":"https://cards.scryfall.io/normal/front/f/c/fce6a8b6-b43c-4045-9378-97b2463f9b4d.jpg?1783904066","artUrl":"https://cards.scryfall.io/art_crop/front/f/c/fce6a8b6-b43c-4045-9378-97b2463f9b4d.jpg?1783904066","set":"tmt","releasedAt":"2026-03-06","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const giveTake = (): CardDef => ({"oracleId":"67a82d5e-a9dc-4e8c-9d23-c6d6aa1e57d1","name":"Give // Take","manaCost":"{2}{G} // {2}{U}","cmc":6,"typeLine":"Sorcery // Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Put three +1/+1 counters on target creature.\nFuse (You may cast one or both halves of this card from your hand.)","colors":["G","U"],"colorIdentity":["G","U"],"keywords":["Fuse"],"imageUrl":"https://cards.scryfall.io/normal/front/9/a/9af07d28-45a2-45d6-b1cb-0858c609a881.jpg?1783940016","artUrl":"https://cards.scryfall.io/art_crop/front/9/a/9af07d28-45a2-45d6-b1cb-0858c609a881.jpg?1783940016","set":"dgm","releasedAt":"2013-05-03","rarity":"uncommon","layout":"split","gameChanger":false,"faces":[{"name":"Give","manaCost":"{2}{G}","typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Put three +1/+1 counters on target creature.\nFuse (You may cast one or both halves of this card from your hand.)","colors":["G"]},{"name":"Take","manaCost":"{2}{U}","typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Remove all +1/+1 counters from target creature you control. Draw that many cards.\nFuse (You may cast one or both halves of this card from your hand.)","colors":["U"]}]}) as CardDef;
const reasonBelieve = (): CardDef => ({"oracleId":"e2b152ea-82d5-465e-8e13-3d62aacd6692","name":"Reason // Believe","manaCost":"{U} // {4}{G}","cmc":6,"typeLine":"Sorcery // Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Scry 3.","colors":["G","U"],"colorIdentity":["G","U"],"keywords":["Aftermath","Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/1/c/1ca644e3-4fb3-4d38-b714-e3d7459bd8b9.jpg?1783936006","artUrl":"https://cards.scryfall.io/art_crop/front/1/c/1ca644e3-4fb3-4d38-b714-e3d7459bd8b9.jpg?1783936006","set":"hou","releasedAt":"2017-07-14","rarity":"rare","layout":"split","gameChanger":false,"faces":[{"name":"Reason","manaCost":"{U}","typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Scry 3.","colors":["U"]},{"name":"Believe","manaCost":"{4}{G}","typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Aftermath (Cast this spell only from your graveyard. Then exile it.)\nLook at the top card of your library. You may put it onto the battlefield if it's a creature card. If you don't, put it into your hand.","colors":["G"]}]}) as CardDef;
const vision = (): CardDef => ({"oracleId":"1a44261a-2b6a-45dc-91a4-b2eb219ba6fb","name":"Vision, Spectral Synthezoid","manaCost":"{6}{U}{U}","cmc":8,"typeLine":"Legendary Artifact Creature — Robot Hero","supertypes":["Legendary"],"types":["Artifact","Creature"],"subtypes":["Robot","Hero"],"oracleText":"Flying\nOnce during each of your turns, you may cast a noncreature or Robot spell from your hand without paying its mana cost.","power":"2","toughness":"5","colors":["U"],"colorIdentity":["U"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/c/3/c3da7f82-d2f7-4aaa-b62a-238b3e3e4871.jpg?1783903066","artUrl":"https://cards.scryfall.io/art_crop/front/c/3/c3da7f82-d2f7-4aaa-b62a-238b3e3e4871.jpg?1783903066","set":"msc","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const wilding = (): CardDef => ({"oracleId":"888582df-4fe2-4d05-9b62-10c90aaa76f2","name":"Words of Wilding","manaCost":"{2}{G}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"{1}: The next time you would draw a card this turn, create a 2/2 green Bear creature token instead.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/d/fdb9565f-5b09-4127-b169-3146079dab84.jpg?1783945032","artUrl":"https://cards.scryfall.io/art_crop/front/f/d/fdb9565f-5b09-4127-b169-3146079dab84.jpg?1783945032","set":"ons","releasedAt":"2002-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const worship = (): CardDef => ({"oracleId":"f1fad5ab-d087-4912-b1b9-42733fa34707","name":"Words of Worship","manaCost":"{2}{W}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"{1}: The next time you would draw a card this turn, you gain 5 life instead.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/e/0ea5c6e0-8361-4214-997b-32a66b19fae9.jpg?1783945089","artUrl":"https://cards.scryfall.io/art_crop/front/0/e/0ea5c6e0-8361-4214-997b-32a66b19fae9.jpg?1783945089","set":"ons","releasedAt":"2002-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const lens = (): CardDef => ({"oracleId":"7df50107-25d8-47dc-9a13-27b257cfbf6f","name":"Lens of Clarity","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"You may look at the top card of your library and at face-down creatures you don't control any time.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/c/3c82e2b8-f0f6-44da-83ee-8a671344ac62.jpg?1783939048","artUrl":"https://cards.scryfall.io/art_crop/front/3/c/3c82e2b8-f0f6-44da-83ee-8a671344ac62.jpg?1783939048","set":"ktk","releasedAt":"2014-09-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const footage = (): CardDef => ({"oracleId":"ad37551c-9d20-4902-8190-6a0aa32a7947","name":"Found Footage","manaCost":"{1}","cmc":1,"typeLine":"Artifact — Clue","supertypes":[],"types":["Artifact"],"subtypes":["Clue"],"oracleText":"You may look at face-down creatures your opponents control any time.\n{2}, Sacrifice this artifact: Surveil 2, then draw a card. (To surveil 2, look at the top two cards of your library, then put any number of them into your graveyard and the rest on top of your library in any order.)","colors":[],"colorIdentity":[],"keywords":["Surveil"],"imageUrl":"https://cards.scryfall.io/normal/front/b/1/b12eb087-762e-4e7d-a6e0-f48df603b7c7.jpg?1783909433","artUrl":"https://cards.scryfall.io/art_crop/front/b/1/b12eb087-762e-4e7d-a6e0-f48df603b7c7.jpg?1783909433","set":"dsk","releasedAt":"2024-09-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const keeperLens = (): CardDef => ({"oracleId":"84b28100-ad70-4a78-b557-99f5ef6126a3","name":"Keeper of the Lens","manaCost":"{1}","cmc":1,"typeLine":"Artifact Creature — Golem","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Golem"],"oracleText":"You may look at face-down creatures you don't control any time.","power":"1","toughness":"2","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/6/86d6c502-ae3e-4e67-8f1d-3323b4468f72.jpg?1783938568","artUrl":"https://cards.scryfall.io/art_crop/front/8/6/86d6c502-ae3e-4e67-8f1d-3323b4468f72.jpg?1783938568","set":"dtk","releasedAt":"2015-03-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const fblthp = (): CardDef => ({"oracleId":"17e7212e-69d8-4014-af98-447baed2cae7","name":"Fblthp, Impossibly Lost","manaCost":"{1}{U}","cmc":2,"typeLine":"Legendary Creature — Homunculus","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Homunculus"],"oracleText":"When one or more of your opponents are dealt combat damage during your turn, draw two cards. If your library has no cards in it, you win the game. Fblthp's owner shuffles him into their library. (If you draw from an empty library this way, you still win the game.)","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/3/a3a2edbb-d144-4670-acad-17316cea98d2.jpg?1789127697","artUrl":"https://cards.scryfall.io/art_crop/front/a/3/a3a2edbb-d144-4670-acad-17316cea98d2.jpg?1789127697","set":"fra","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const arboria = (): CardDef => ({"oracleId":"acb3e93c-a1d3-458f-b8c3-c426cd359fa4","name":"Arboria","manaCost":"{2}{G}{G}","cmc":4,"typeLine":"World Enchantment","supertypes":["World"],"types":["Enchantment"],"subtypes":[],"oracleText":"Creatures can't attack a player unless that player cast a spell or put a nontoken permanent onto the battlefield during their last turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/1/b18f4de2-adfe-4784-bd57-9e2ad9088825.jpg?1783918449","artUrl":"https://cards.scryfall.io/art_crop/front/b/1/b18f4de2-adfe-4784-bd57-9e2ad9088825.jpg?1783918449","set":"dmr","releasedAt":"2023-01-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const howl = (): CardDef => ({"oracleId":"76d9c310-9d06-43e8-87a9-fb03318a6cb8","name":"Howl of the Horde","manaCost":"{2}{R}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"When you next cast an instant or sorcery spell this turn, copy that spell. You may choose new targets for the copy.\nRaid — If you attacked this turn, when you next cast an instant or sorcery spell this turn, copy that spell an additional time. You may choose new targets for the copy.","colors":["R"],"colorIdentity":["R"],"keywords":["Raid"],"imageUrl":"https://cards.scryfall.io/normal/front/5/d/5db4baf3-f0dc-4b27-8323-a76764332590.jpg?1783939072","artUrl":"https://cards.scryfall.io/art_crop/front/5/d/5db4baf3-f0dc-4b27-8323-a76764332590.jpg?1783939072","set":"ktk","releasedAt":"2014-09-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const keeperProg = (): CardDef => ({"oracleId":"a30241b4-5e92-44cd-b19b-7d6d59e95ada","name":"Keeper of Progenitus","manaCost":"{3}{G}","cmc":4,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"Whenever a player taps a Mountain, Forest, or Plains for mana, that player adds one mana of any type that land produced.","power":"1","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/b/c/bcb023a2-e929-47e9-bd58-cbc6f241e7a4.jpg?1783942553","artUrl":"https://cards.scryfall.io/art_crop/front/b/c/bcb023a2-e929-47e9-bd58-cbc6f241e7a4.jpg?1783942553","set":"ala","releasedAt":"2008-10-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const shizuko = (): CardDef => ({"oracleId":"c4984e18-9caf-4dd0-9c24-e60ccb27e2a0","name":"Shizuko, Caller of Autumn","manaCost":"{1}{G}{G}","cmc":3,"typeLine":"Legendary Creature — Snake Shaman","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Snake","Shaman"],"oracleText":"At the beginning of each player's upkeep, that player adds {G}{G}{G}. Until end of turn, they don't lose this mana as steps and phases end.","power":"2","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/d/a/dab9407d-9389-4ec9-963c-80de095a6812.jpg?1783944180","artUrl":"https://cards.scryfall.io/art_crop/front/d/a/dab9407d-9389-4ec9-963c-80de095a6812.jpg?1783944180","set":"bok","releasedAt":"2005-02-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

// Test cards.
const vanilla = (name: string, typeLine: string, cost: string, cmc: number, p: number, t: number, extra: Partial<CardDef> = {}) => card(name, typeLine, cost, { cmc, power: String(p), toughness: String(t), ...extra });
const bearC = (name = "Plain Bear", p = 2, t = 2) => vanilla(name, "Creature — Bear", "{1}{G}", 2, p, t, { colors: ["G"] });
const ninja = () => vanilla("Test Ninja", "Creature — Human Ninja", "{1}{U}", 2, 1, 1, { colors: ["U"] });
const robot = () => vanilla("Test Robot", "Artifact Creature — Robot", "{4}", 4, 3, 3);
const bolt = (name = "Test Bolt", n = 3) => card(name, "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: `${name} deals ${n} damage to any target.` });
const ponder = (name = "Test Draw") => card(name, "Sorcery", "{2}{U}", { cmc: 3, colors: ["U"], oracleText: "Draw two cards." });
const rock = (name: string) => card(name, "Artifact", "{1}", { cmc: 1 });

describe("Lane B round 67", () => {
  it("are fully supported", () => {
    supported(turtleVan(), giveTake(), reasonBelieve(), vision(), wilding(), worship(), lens(), footage(), keeperLens(), fblthp(), arboria(), howl(), keeperProg(), shizuko());
  });

  it("Turtle Van: a +1/+1 counter on the creature that crewed it, doubled if it's a Ninja", () => {
    for (const isNinja of [true, false]) {
      const { s: s0, ap, opp } = setup([]);
      for (const p of s0.players) if (p.id !== ap) emptyHand(s0, p.id);
      const v = putOnBattlefield(s0, ap, turtleVan());
      const crewer = putOnBattlefield(s0, ap, isNinja ? ninja() : bearC());
      const idx = abilitiesOf(s0, s0.objects[v]!).activated.findIndex((a) => /^Crew/.test(a.text));
      let s = settle(act(s0, { type: "activateAbility", player: ap, objectId: v, index: idx, tapCreatures: [crewer] }), { me: ap });
      s = passUntil(s, "declareAttackers", ap);
      s = attack(s, ap, [{ attacker: v, defender: opp }], { targets: [tgt(crewer)] });
      expect(counters(s, crewer), isNinja ? "Ninja" : "Bear").toBe(isNinja ? 2 : 1);
    }
  });

  it("Turtle Van: only a creature that crewed it this turn can be the target", () => {
    const { s: s0, ap } = setup([]);
    const v = putOnBattlefield(s0, ap, turtleVan());
    const crewer = putOnBattlefield(s0, ap, ninja());
    const other = putOnBattlefield(s0, ap, ninja());
    const idx = abilitiesOf(s0, s0.objects[v]!).activated.findIndex((a) => /^Crew/.test(a.text));
    const s = settle(act(s0, { type: "activateAbility", player: ap, objectId: v, index: idx, tapCreatures: [crewer] }), { me: ap });
    const spec = abilitiesOf(s, s.objects[v]!).triggers[0]!.body.targets[0]!;
    expect(spec.crewedSource).toBe(true);
    expect(s.objects[other]!.tapped).toBeFalsy();
    expect(s.objects[crewer]!.tapped).toBe(true);
  });

  it("Give // Take: Take removes all +1/+1 counters from your creature and draws that many cards", () => {
    const { s: s0, ap } = setup([]);
    const mine = putOnBattlefield(s0, ap, bearC("My Bear"));
    s0.objects[mine]!.counters["+1/+1"] = 3;
    invalidateCharacteristics(s0);
    const gt = toZone(s0, ap, giveTake(), "hand");
    const hand = s0.players[ap]!.hand.length;
    const s = settle(castNow(s0, ap, gt, [tgt(mine)], { face: 1 }));
    expect(counters(s, mine)).toBe(0);
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 3);
    expect(zone(s, gt)).toBe("graveyard");
  });

  it("Give // Take: with no counters Take draws nothing; fused on one creature it draws three (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const mine = putOnBattlefield(s0, ap, bearC("My Bear"));
    const gt = toZone(s0, ap, giveTake(), "hand");
    const hand = s0.players[ap]!.hand.length;
    let s = settle(castNow(s0, ap, gt, [tgt(mine)], { face: 1 }));
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    // Fused: Give's three counters first, then Take removes them and draws three.
    const gt2 = toZone(s, ap, giveTake(), "hand");
    poolOnly(s, ap, { G: 1, U: 1, C: 4 });
    const hand2 = s.players[ap]!.hand.length;
    s = settle(castNow(s, ap, gt2, [tgt(mine), tgt(mine)], { face: 2 }));
    expect(counters(s, mine)).toBe(0);
    expect(s.players[ap]!.hand.length).toBe(hand2 - 1 + 3);
  });

  it("Reason // Believe: Believe puts a creature card from the top onto the battlefield, or into your hand", () => {
    for (const yes of [true, false]) {
      const { s: s0, ap } = setup([]);
      const top = toZone(s0, ap, bearC("Top Bear"), "library");
      // Believe has aftermath: cast from the graveyard (CR 702.127a), then exiled.
      const rb = toZone(s0, ap, reasonBelieve(), "graveyard");
      const s = settle(castNow(s0, ap, rb, [], { face: 1, via: "aftermath" }), { may: yes });
      expect(zone(s, top), yes ? "put" : "not put").toBe(yes ? "battlefield" : "hand");
      expect(zone(s, rb)).toBe("exile");
    }
  });

  it("Reason // Believe: a card on top that isn't a creature card goes to your hand; Reason scries 3", () => {
    const { s: s0, ap } = setup([]);
    const top = toZone(s0, ap, rock("Top Rock"), "library");
    const rb = toZone(s0, ap, reasonBelieve(), "graveyard");
    let s = settle(castNow(s0, ap, rb, [], { face: 1, via: "aftermath" }));
    expect(zone(s, top)).toBe("hand");
    expect(s.battlefield.includes(top)).toBe(false);
    // Reason from the hand: scry 3, a look at the top three.
    const rb2 = toZone(s, ap, reasonBelieve(), "hand");
    s = castNow(s, ap, rb2, [], { face: 0 });
    for (let i = 0; i < 20 && s.pending?.kind !== "arrangeTop"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("arrangeTop");
  });

  it("Vision: once during each of your turns, a noncreature or Robot spell from your hand for free", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, vision());
    poolOnly(s0, ap, {});
    const a = toZone(s0, ap, ponder("First Draw"), "hand");
    const b = toZone(s0, ap, ponder("Second Draw"), "hand");
    const r = toZone(s0, ap, robot(), "hand");
    const plainBear = toZone(s0, ap, bearC("Hand Bear"), "hand");
    expect(castProblem(s0, ap, plainBear, [], undefined, undefined, undefined, undefined, { alt: "payZero" })).not.toBeNull();
    expect(planCast(s0, ap, r, [], undefined, "auto", undefined, { alt: "payZero" })).not.toBeNull();
    let s = settle(castNow(s0, ap, a, [], { alt: "payZero" }));
    expect(zone(s, a)).toBe("graveyard");
    // Used for this turn.
    expect(castProblem(s, ap, b, [], undefined, undefined, undefined, undefined, { alt: "payZero" })).not.toBeNull();
    expect(planCast(s, ap, r, [], undefined, "auto", undefined, { alt: "payZero" })).toBeNull();
  });

  it("Vision: a Robot creature spell counts; not during another player's turn", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, vision());
    poolOnly(s0, ap, {});
    const r = toZone(s0, ap, robot(), "hand");
    let s = settle(castNow(s0, ap, r, [], { alt: "payZero" }));
    expect(zone(s, r)).toBe("battlefield");
    const instant = toZone(s, ap, bolt(), "hand");
    s = goUntil(s, (x) => x.activePlayer === opp && x.step === "main1" && !x.stack.length && !x.pending);
    expect(castProblem(s, ap, instant, [ply(opp)], undefined, undefined, undefined, undefined, { alt: "payZero" })).not.toBeNull();
  });

  it("Words of Wilding: the next draw this turn is a 2/2 Bear instead; later draws are draws", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, wilding());
    let s = settle(activateNow(s0, ap, w, 0));
    expect(s.players[ap]!.nextDrawInstead).toHaveLength(1);
    const hand = s.players[ap]!.hand.length;
    const lib = s.players[ap]!.library.length;
    const p = toZone(s, ap, ponder(), "hand");
    s = settle(castNow(s, ap, p));
    // Two draws: the first a Bear, the second a card.
    expect(tokensNamed(s, ap, "Bear")).toHaveLength(1);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.players[ap]!.library.length).toBe(lib - 1);
    expect(s.players[ap]!.nextDrawInstead).toBeUndefined();
  });

  it("Words of Wilding: an unused shield ends with the turn; an empty library loses nothing to it (CR 614.11)", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, wilding());
    let s = settle(activateNow(s0, ap, w, 0));
    s = goUntil(s, (x) => x.activePlayer !== ap && x.step === "main1");
    expect(s.players[ap]!.nextDrawInstead).toBeUndefined();
    // Back on our turn with an empty library: the shield replaces the draw, no draw from an empty library.
    const s2 = settle(activateNow(s0, ap, w, 0));
    for (const id of s2.players[ap]!.library.splice(0)) s2.objects[id]!.zone = "exile";
    draw(s2, ap, 1);
    expect(tokensNamed(s2, ap, "Bear")).toHaveLength(1);
    expect(s2.players[ap]!.drewFromEmptyLibrary).toBe(false);
  });

  it("Words of Worship: the next draw is 5 life instead; two activations replace two draws", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, worship());
    let s = settle(activateNow(s0, ap, w, 0));
    s = settle(activateNow(s, ap, w, 0));
    const before = life(s, ap);
    const hand = s.players[ap]!.hand.length;
    draw(s, ap, 3);
    expect(life(s, ap)).toBe(before + 10);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("Words of Wilding: a bot uses it in its upkeep to turn its draw step's draw into a Bear", () => {
    const { s: s0, ap } = setup([]);
    const nextP = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    for (const p of s0.players) emptyHand(s0, p.id);
    putOnBattlefield(s0, nextP, wilding());
    putOnBattlefield(s0, nextP, card("Forest", "Basic Land — Forest"));
    s0.players[nextP]!.command = [];
    let s = goUntil(s0, (x) => x.activePlayer === nextP && x.step === "upkeep" && !x.stack.length && !x.pending && waitingOn(x) === nextP);
    // Its upkeep: the bot activates Words of Wilding, once, then passes.
    for (let i = 0; i < 20 && s.step === "upkeep"; i++) {
      const p = waitingOn(s)!;
      const acts = p === nextP || s.pending ? botActions(s, s.pending?.player ?? p) : [{ type: "passPriority", player: p } as Action];
      for (const a of acts) s = act(s, a);
    }
    s = goUntil(s, (x) => x.activePlayer === nextP && x.step === "main1");
    expect(tokensNamed(s, nextP, "Bear")).toHaveLength(1);
    expect(s.players[nextP]!.hand.length).toBe(0);
  });

  it("Lens of Clarity, Found Footage, Keeper of the Lens: you see other players' face-down creatures, not their face-down spells", () => {
    for (const def of [lens(), footage(), keeperLens()]) {
      const { s, ap, opp } = setup([]);
      const fd = putOnBattlefield(s, opp, bearC("Hidden Bear"));
      s.objects[fd]!.faceDown = "manifest";
      invalidateCharacteristics(s);
      expect(faceDownVisible(s, s.objects[fd]!, ap)).toBe(false);
      expect(faceDownVisible(s, s.objects[fd]!, opp)).toBe(true);
      const l = putOnBattlefield(s, ap, def);
      expect(faceDownVisible(s, s.objects[fd]!, ap), def.name).toBe(true);
      // Another player doesn't see it, and a face-down spell on the stack stays hidden (rulings).
      const third = s.turnOrder.find((p) => p !== ap && p !== opp)!;
      expect(faceDownVisible(s, s.objects[fd]!, third)).toBe(false);
      s.objects[fd]!.zone = "stack";
      expect(faceDownVisible(s, s.objects[fd]!, ap)).toBe(false);
      expect(zone(s, l)).toBe("battlefield");
    }
  });

  it("Lens of Clarity: you may also look at the top card of your library", () => {
    const { s, ap } = setup([]);
    const l = putOnBattlefield(s, ap, lens());
    expect(abilitiesOf(s, s.objects[l]!).lookTop).toBe(true);
    expect(topVisible(s, ap, ap)).toBe(true);
    expect(topVisible(s, ap, s.turnOrder.find((p) => p !== ap)!)).toBe(false);
  });

  it("Fblthp, Impossibly Lost: combat damage to an opponent on your turn draws two, then he's shuffled into your library", () => {
    const { s: s0, ap, opp } = setup([]);
    for (const p of s0.players) if (p.id !== ap) emptyHand(s0, p.id);
    const f = putOnBattlefield(s0, ap, fblthp());
    const hand = s0.players[ap]!.hand.length;
    let s = passUntil(s0, "declareAttackers", ap);
    s = attack(s, ap, [{ attacker: f, defender: opp }]);
    expect(life(s, opp)).toBe(40 - 1);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(zone(s, f)).toBe("library");
    expect(s.over).toBe(false);
  });

  it("Fblthp, Impossibly Lost: drawing your library empty this way wins the game", () => {
    const { s: s0, ap, opp } = setup([]);
    for (const p of s0.players) if (p.id !== ap) emptyHand(s0, p.id);
    const f = putOnBattlefield(s0, ap, fblthp());
    let s = passUntil(s0, "declareAttackers", ap);
    for (const id of s.players[ap]!.library.splice(1)) s.objects[id]!.zone = "exile";
    s = attack(s, ap, [{ attacker: f, defender: opp }]);
    expect(s.over).toBe(true);
    expect(s.winner).toBe(ap);
  });

  it("Fblthp, Impossibly Lost: not during another player's turn", () => {
    const { s: s0, ap, opp } = setup([]);
    for (const p of s0.players) emptyHand(s0, p.id);
    putOnBattlefield(s0, ap, fblthp());
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear"));
    s0.objects[theirs]!.controlledSinceTurn = -1;
    let s = goUntil(s0, (x) => x.activePlayer === opp && x.step === "declareAttackers" && x.pending?.kind === "declareAttackers");
    const hand = s.players[ap]!.hand.length;
    s = attack(s, opp, [{ attacker: theirs, defender: third }]);
    expect(life(s, third)).toBe(40 - 2);
    expect(s.players[ap]!.hand.length).toBe(hand);
  });

  it("Arboria: a player who didn't cast a spell or put a nontoken permanent onto the battlefield during their last turn can't be attacked", () => {
    const { s: s0, ap, opp } = setup([]);
    for (const p of s0.players) emptyHand(s0, p.id);
    putOnBattlefield(s0, ap, arboria());
    // Our turn: we play a land, which puts a nontoken permanent onto the battlefield.
    const land = toZone(s0, ap, card("Wastes", "Basic Land"), "hand");
    let s = act(s0, { type: "playLand", player: ap, objectId: land });
    expect(s.players[ap]!.actedTurn).toBe(s.turn);
    const theirs = putOnBattlefield(s, opp, bearC("Their Bear"));
    s.objects[theirs]!.controlledSinceTurn = -1;
    s = goUntil(s, (x) => x.activePlayer === opp && x.step === "main1");
    const third = s.turnOrder[(s.turnOrder.indexOf(ap) + 2) % 4]!;
    expect(attackProblem(s, s.objects[theirs]!, ap)).toBeNull();
    // The third player hasn't had a turn yet: no spell, no permanent.
    expect(attackProblem(s, s.objects[theirs]!, third)).toMatch(/Arboria/);
    // Their planeswalkers can still be attacked (rulings).
    expect(attackProblem(s, s.objects[theirs]!, third, true)).toBeNull();
  });

  it("Arboria: a token doesn't count, a creature spell does, and only during the player's own turn", () => {
    const { s: s0, ap, opp } = setup([]);
    for (const p of s0.players) emptyHand(s0, p.id);
    const tokenMaker = toZone(s0, ap, card("Test Tokens", "Sorcery", "{W}", { cmc: 1, colors: ["W"], oracleText: "Create a 1/1 white Soldier creature token." }), "hand");
    putOnBattlefield(s0, ap, arboria());
    let s = settle(castNow(s0, ap, tokenMaker));
    // Casting the sorcery was a spell: that counts.
    expect(s.players[ap]!.actedTurn).toBe(s.turn);
    s.players[ap]!.actedTurn = undefined;
    // A token entering by itself doesn't.
    const again = toZone(s, ap, card("More Tokens", "Instant", "{W}", { cmc: 1, colors: ["W"], oracleText: "Create a 1/1 white Soldier creature token." }), "hand");
    s.players[ap]!.actedTurn = undefined;
    s = castNow(s, ap, again);
    s.players[ap]!.actedTurn = undefined;
    s = settle(s);
    expect(s.players[ap]!.actedTurn).toBeUndefined();
    // On another player's turn, casting a spell doesn't count for us.
    const b = toZone(s, ap, bolt(), "hand");
    s = goUntil(s, (x) => x.activePlayer === opp && x.step === "main1" && !x.stack.length && !x.pending);
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(castNow(s, ap, b, [ply(opp)]));
    expect(s.players[ap]!.actedTurn).toBeUndefined();
  });

  it("Howl of the Horde: the next instant or sorcery is copied, twice with raid (rulings)", () => {
    for (const raid of [false, true]) {
      const { s: s0, ap, opp } = setup([]);
      const h = toZone(s0, ap, howl(), "hand");
      const b = toZone(s0, ap, bolt("Test Bolt", 2), "hand");
      if (raid) s0.players[ap]!.attackedTurn = s0.turn;
      let s = settle(castNow(s0, ap, h));
      const others = (x: GameState) => x.players.filter((p) => p.id !== ap).reduce((n, p) => n + p.life, 0);
      const before = others(s);
      s = settle(castNow(s, ap, b, [ply(opp)]));
      // The bolt and each copy deal 2 (the copies may be aimed at another opponent).
      expect(before - others(s) + (life(s0, ap) - life(s, ap)), raid ? "raid" : "no raid").toBe(raid ? 6 : 4);
    }
  });

  it("Keeper of Progenitus: a Mountain, Forest or Plains tapped for mana adds one more of that type; a Swamp doesn't", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, keeperProg());
    const f = s0.battlefield.find((id) => controllerOf(s0, s0.objects[id]!) === ap && nameOf(s0, id) === "Forest")!;
    const sw = s0.battlefield.find((id) => controllerOf(s0, s0.objects[id]!) === ap && nameOf(s0, id) === "Swamp")!;
    let s = act(s0, { type: "activateMana", player: ap, objectId: f, mana: "G" });
    expect(pool(s, ap).G).toBe(2);
    s = act(s, { type: "activateMana", player: ap, objectId: sw, mana: "B" });
    expect(pool(s, ap).B).toBe(1);
  });

  it("Shizuko, Caller of Autumn: each player adds {G}{G}{G} in their upkeep and keeps it until end of turn", () => {
    const { s: s0, ap } = setup([]);
    for (const p of s0.players) emptyHand(s0, p.id);
    putOnBattlefield(s0, ap, shizuko());
    const nextP = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    for (const id of s0.battlefield.filter((x) => controllerOf(s0, s0.objects[x]!) === nextP)) s0.objects[id]!.tapped = true;
    s0.players[nextP]!.command = [];
    let s = goUntil(s0, (x) => x.activePlayer === nextP && x.step === "draw");
    expect(pool(s, nextP).G).toBe(3);
    s = goUntil(s, (x) => x.activePlayer === nextP && x.step === "main1");
    // Still there in their main phase (a bot may have spent some; it hasn't emptied as the steps ended).
    expect(pool(s, nextP).G ?? 0).toBeGreaterThan(0);
    s = goUntil(s, (x) => x.activePlayer !== nextP && x.step === "main1");
    expect(pool(s, nextP).G ?? 0).toBe(0);
  });
});
