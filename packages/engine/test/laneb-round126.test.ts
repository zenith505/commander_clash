// Lane B round B126: Veiled Sentry and Opal Titan (the triggering spell's mana value and colors, as cast or as it last
// existed on the stack), Selfless Exorcist (the exiled card as the source of the damage), Moratorium Stone (every card and
// permanent with the target card's name), Ersatz Gnomes (a spell made colorless, the permanent it becomes too),
// Battlefield Scrounger (graveyard cards put on the bottom of the library as a cost), Gurzigost (two cards to keep it; damage
// assigned as though unblocked, chosen as the ability resolves), Crown of Convergence (creatures sharing a color with the
// top card of the library), Mindreaver (counter a spell named like a card its heroic ability exiled).

import { describe, expect, it } from "vitest";
import { act, forest, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, botActions, characteristics, invalidateCharacteristics, isFullySupported, legalTargets, abilitiesOf, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type Step, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; questions of the players in `me` stop it, others the bots answer. */
const settle = (s: GameState, opts: { me?: PlayerId[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me?.includes(p.player)) return s;
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes priority (answering other questions as bots, no attacks or blocks) until `step` of `active`'s turn, stopping at a question of `me`. */
const goTo = (s: GameState, step: Step, active: PlayerId, me?: PlayerId) => {
  for (let i = 0; i < 3000 && !(s.step === step && s.activePlayer === active); i++) {
    const p = s.pending;
    if (p && p.player === me) return s;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: p.player, attacks: [] });
    else if (p?.kind === "discardToHandSize") s = run(s, botActions(s, p.player));
    else if (p) s = run(s, botActions(s, p.player));
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ptOf = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
/** A card of `def` put into `pid`'s graveyard, hand or library (on top). */
const putIn = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
const nameOf = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;

// Real oracle text (Scryfall).
const veiledSentry = (): CardDef => ({"oracleId":"0b9b8e60-51eb-4d4a-95c1-48ca5b8153df","name":"Veiled Sentry","manaCost":"{U}","cmc":1,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When an opponent casts a spell, if this permanent is an enchantment, it becomes an Illusion creature with power and toughness each equal to that spell's mana value.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/e/de458a9d-6c09-42bb-b470-c2691e95345a.jpg?1783946352","commanderLegal":"legal","set":"usg","releasedAt":"1998-10-12","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const opalTitan = (): CardDef => ({"oracleId":"ce06fe83-a8c5-46b7-b30c-b8189d217741","name":"Opal Titan","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When an opponent casts a creature spell, if this permanent is an enchantment, it becomes a 4/4 Giant creature with protection from each of that spell's colors.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/7/379f1f01-88c6-4cc2-9049-078aa6980582.jpg?1783946373","commanderLegal":"legal","set":"usg","releasedAt":"1998-10-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const selflessExorcist = (): CardDef => ({"oracleId":"78e875b1-e621-4bf0-ad81-24ed9e2b43f8","name":"Selfless Exorcist","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Human Cleric","supertypes":[],"types":["Creature"],"subtypes":["Human","Cleric"],"oracleText":"{T}: Exile target creature card from a graveyard. That card deals damage equal to its power to this creature.","power":"3","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/9/c9b1c300-aec3-4512-9902-309615e86c73.jpg?1783945133","commanderLegal":"legal","set":"jud","releasedAt":"2002-05-27","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const moratoriumStone = (): CardDef => ({"oracleId":"bb0d89e7-4ae6-4ac2-a0e6-51ab08226069","name":"Moratorium Stone","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{2}, {T}: Exile target card from a graveyard.\n{2}{W}{B}, {T}, Sacrifice this artifact: Exile target nonland card from a graveyard, all other cards from graveyards with the same name as that card, and all permanents with that name.","colors":[],"colorIdentity":["B","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/5/5529edfc-22bd-43dc-878b-6ec9fba74795.jpg?1783943456","commanderLegal":"legal","set":"gpt","releasedAt":"2006-02-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ersatzGnomes = (): CardDef => ({"oracleId":"ea016b84-7f77-42e7-bd14-2e62a1e35f3b","name":"Ersatz Gnomes","manaCost":"{3}","cmc":3,"typeLine":"Artifact Creature — Gnome","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Gnome"],"oracleText":"{T}: Target spell becomes colorless.\n{T}: Target permanent becomes colorless until end of turn.","power":"1","toughness":"1","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/a/5a2747ab-00c8-4f59-b9a6-54ff4e99f6c8.jpg?1783947043","commanderLegal":"legal","set":"mir","releasedAt":"1996-10-08","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const battlefieldScrounger = (): CardDef => ({"oracleId":"92ac7531-10bb-47a2-9dd0-378d547b4ed6","name":"Battlefield Scrounger","manaCost":"{3}{G}{G}","cmc":5,"typeLine":"Creature — Centaur","supertypes":[],"types":["Creature"],"subtypes":["Centaur"],"oracleText":"Threshold — Put three cards from your graveyard on the bottom of your library: This creature gets +3/+3 until end of turn. Activate only once each turn and only if there are seven or more cards in your graveyard.","power":"3","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":["Threshold"],"imageUrl":"https://cards.scryfall.io/normal/front/f/5/f5ac74bc-1198-4a9a-bcde-668cca08b274.jpg?1783945114","commanderLegal":"legal","set":"jud","releasedAt":"2002-05-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const gurzigost = (): CardDef => ({"oracleId":"835733a2-3738-4fc0-97d5-33156b711ba4","name":"Gurzigost","manaCost":"{3}{G}{G}","cmc":5,"typeLine":"Creature — Beast","supertypes":[],"types":["Creature"],"subtypes":["Beast"],"oracleText":"At the beginning of your upkeep, sacrifice this creature unless you put two cards from your graveyard on the bottom of your library.\n{G}{G}, Discard a card: You may have this creature assign its combat damage this turn as though it weren't blocked.","power":"6","toughness":"8","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/4/f4e672c6-6ddc-4dd2-b4c7-5083d7566e87.jpg?1783945142","commanderLegal":"legal","set":"tor","releasedAt":"2002-02-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const crownofConvergence = (): CardDef => ({"oracleId":"316c265b-67e2-48b3-aac8-07a898dbb20f","name":"Crown of Convergence","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"Play with the top card of your library revealed.\nAs long as the top card of your library is a creature card, creatures you control that share a color with that card get +1/+1.\n{G}{W}: Put the top card of your library on the bottom of your library.","colors":[],"colorIdentity":["G","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/1/c1b9f8c8-2927-4746-a540-dd3853b9a00e.jpg?1783943600","commanderLegal":"legal","set":"rav","releasedAt":"2005-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const mindreaver = (): CardDef => ({"oracleId":"f606ab91-1f20-4351-acd3-6366b1895f72","name":"Mindreaver","manaCost":"{U}{U}","cmc":2,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"Heroic — Whenever you cast a spell that targets this creature, exile the top three cards of target player's library.\n{U}{U}, Sacrifice this creature: Counter target spell with the same name as a card exiled with this creature.","power":"2","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":["Heroic"],"imageUrl":"https://cards.scryfall.io/normal/front/8/7/87912ae7-3edc-4ea2-9b4b-caf2bc149ad1.jpg?1783939567","commanderLegal":"legal","set":"bng","releasedAt":"2014-02-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const counterspell = (): CardDef => ({"oracleId":"cc187110-1148-4090-bbb8-e205694a39f5","name":"Counterspell","manaCost":"{U}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target spell.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/c/0c9a7cb0-5bff-48ff-b620-2838816ac9b5.jpg?1783937618","commanderLegal":"legal","set":"ema","releasedAt":"2016-06-10","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const giantGrowth = (): CardDef => ({"oracleId":"5748ebf1-24e3-499d-ab7c-c2cebd462a24","name":"Giant Growth","manaCost":"{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature gets +3/+3 until end of turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/d/fd1f95bf-48ea-455a-8a6c-0249b11c8900.jpg?1783902918","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const serraAngel = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const llanowarElves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const lightningElemental = (): CardDef => ({"oracleId":"58aee5cb-7b88-446e-ab10-9f83c10d7227","name":"Lightning Elemental","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Elemental","supertypes":[],"types":["Creature"],"subtypes":["Elemental"],"oracleText":"Haste (This creature can attack and {T} as soon as it comes under your control.)","power":"4","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":["Haste"],"imageUrl":"https://cards.scryfall.io/normal/front/1/1/11f6d2a4-cc97-43f3-a8b2-f96262c27371.jpg?1783946627","commanderLegal":"legal","set":"tmp","releasedAt":"1997-10-14","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const vampireNighthawk = (): CardDef => ({"oracleId":"feb244f8-bcb1-44cf-9940-2719221a7309","name":"Vampire Nighthawk","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Creature — Vampire Shaman","supertypes":[],"types":["Creature"],"subtypes":["Vampire","Shaman"],"oracleText":"Flying\nDeathtouch (Any amount of damage this deals to a creature is enough to destroy it.)\nLifelink (Damage dealt by this creature also causes you to gain that much life.)","power":"2","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":["Deathtouch","Flying","Lifelink"],"imageUrl":"https://cards.scryfall.io/normal/front/4/4/44f19fe3-7a17-4c45-adfa-590f73dfebfa.jpg?1783942148","commanderLegal":"legal","set":"zen","releasedAt":"2009-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const hornofPlenty = (): CardDef => ({"oracleId":"72d3b499-dbff-4631-b6e3-0a292b39d527","name":"Horn of Plenty","manaCost":"{6}","cmc":6,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"Whenever a player casts a spell, they may pay {1}. If the player does, they draw a card at the beginning of the next end step.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/5/d5e04462-1d10-47df-b456-211dd0a87891.jpg?1783945912","commanderLegal":"legal","set":"mmq","releasedAt":"1999-10-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const pool = (s: GameState, pid: PlayerId, mana: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  s.players[pid]!.manaPool = { ...s.players[pid]!.manaPool, ...mana };
};
/** The active player attacks with `attacks`; the defender declares `blocks`; then it's the declare blockers step. */
const combat = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[], blocks: { blocker: string; attacker: string }[] = []) => {
  s = goTo(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks });
  for (let i = 0; i < 200 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  const defenders = new Set(attacks.map((a) => a.defender));
  while (s.pending?.kind === "declareBlockers") {
    const p = s.pending.player;
    s = act(s, { type: "declareBlockers", player: p, blocks: defenders.has(p) ? blocks : [] });
  }
  return s;
};

describe("Veiled Sentry and Opal Titan: the spell that triggered them", () => {
  it("compile", () => supported(veiledSentry(), opalTitan()));

  it("Veiled Sentry: an opponent's 4-mana spell makes it a 4/4 Illusion creature that's no longer an enchantment", () => {
    const { s: s0, ap, ids, opp } = setup([hillGiant()]);
    const v = putOnBattlefield(s0, opp, veiledSentry());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const c = characteristics(s, s.objects[v]!);
    expect(c.types).toEqual(["Creature"]);
    expect(c.subtypes).toEqual(["Illusion"]);
    expect(ptOf(s, v)).toBe("4/4");
  });

  it("Veiled Sentry: the spell's mana value is remembered after it was countered (rulings); its controller's own spell doesn't trigger it", () => {
    // The Sentry's controller counters the Giant before the Sentry's trigger resolves (their own spell doesn't trigger it).
    const { s: s0, ap, ids, opp } = setup([hillGiant()]);
    const v = putOnBattlefield(s0, opp, veiledSentry());
    const counter = putIn(s0, opp, counterspell(), "hand");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    const giant = s.stack.find((x) => x.kind === "spell")!;
    expect(s.stack).toHaveLength(2);
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    pool(s, opp, { U: 2 });
    s = run(s, planCast(s, opp, counter, [{ kind: "stack", id: giant.id }]));
    s = settle(s);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(ptOf(s, v)).toBe("4/4");
  });

  it("Opal Titan: a red creature spell makes it a 4/4 Giant with protection from red, a colorless one gives no protection (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([hillGiant(), ornithopter()]);
    const t1 = putOnBattlefield(s0, opp, opalTitan());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    let c = characteristics(s, s.objects[t1]!);
    expect(c.types).toEqual(["Creature"]);
    expect(c.subtypes).toEqual(["Giant"]);
    expect(ptOf(s, t1)).toBe("4/4");
    expect(c.keywords).toContain("Protection from red");
    // A second Titan, triggered by a colorless artifact creature spell.
    const t2 = putOnBattlefield(s, opp, opalTitan());
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    c = characteristics(s, s.objects[t2]!);
    expect(c.types).toEqual(["Creature"]);
    expect(c.keywords.filter((k) => k.startsWith("Protection"))).toEqual([]);
    // The first Titan isn't an enchantment any more, so it didn't trigger again (still only red).
    expect(characteristics(s, s.objects[t1]!).keywords.filter((k) => k.startsWith("Protection"))).toEqual(["Protection from red"]);
  });
});

describe("Selfless Exorcist: the exiled card deals the damage", () => {
  it("compile", () => supported(selflessExorcist()));

  it("a 2-power creature card exiled from an opponent's graveyard deals 2 damage to it", () => {
    const { s: s0, ap, opp } = setup([]);
    const ex = putOnBattlefield(s0, ap, selflessExorcist());
    const bears = putIn(s0, opp, grizzlyBears(), "graveyard");
    const s = settle(run(s0, planActivate(s0, ap, ex, 0, [tgt(bears)])));
    expect(s.objects[bears]!.zone).toBe("exile");
    expect(s.objects[ex]!.zone).toBe("battlefield");
    expect(s.objects[ex]!.damage).toBe(2);
  });

  it("the card in exile is the source: its deathtouch destroys the Exorcist and its lifelink gains its owner life (CR 108.4a)", () => {
    const { s: s0, ap, opp } = setup([]);
    const ex = putOnBattlefield(s0, ap, selflessExorcist());
    const hawk = putIn(s0, opp, vampireNighthawk(), "graveyard");
    const life = s0.players[opp]!.life;
    const s = settle(run(s0, planActivate(s0, ap, ex, 0, [tgt(hawk)])));
    expect(s.objects[hawk]!.zone).toBe("exile");
    expect(s.objects[ex]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life + 2);
  });

  it("a noncreature card can't be targeted", () => {
    const { s: s0, ap, opp } = setup([]);
    const ex = putOnBattlefield(s0, ap, selflessExorcist());
    const bolt = putIn(s0, opp, lightningBolt(), "graveyard");
    expect(planActivate(s0, ap, ex, 0, [tgt(bolt)])).toBeNull();
  });
});

describe("Moratorium Stone: every card and permanent with that name", () => {
  it("compile", () => supported(moratoriumStone()));

  it("exiles the target, the other cards with its name in every graveyard and the permanents with that name, nothing else", () => {
    const { s: s0, ap, opp } = setup([]);
    const stone = putOnBattlefield(s0, ap, moratoriumStone());
    const b1 = putIn(s0, opp, grizzlyBears(), "graveyard");
    const b2 = putIn(s0, ap, grizzlyBears(), "graveyard");
    const b3 = putOnBattlefield(s0, opp, grizzlyBears());
    const b4 = putOnBattlefield(s0, ap, grizzlyBears());
    const giant = putIn(s0, opp, hillGiant(), "graveyard");
    const lib = putIn(s0, opp, grizzlyBears(), "library");
    const s = settle(run(s0, planActivate(s0, ap, stone, 1, [tgt(b1)])));
    for (const id of [b1, b2, b3, b4]) expect(s.objects[id]!.zone, id).toBe("exile");
    expect(s.objects[giant]!.zone).toBe("graveyard");
    expect(s.objects[lib]!.zone).toBe("library");
    expect(s.objects[stone]!.zone).toBe("graveyard");
  });

  it("a land card can't be its target; its first ability exiles any one card", () => {
    const { s: s0, ap, opp } = setup([]);
    const stone = putOnBattlefield(s0, ap, moratoriumStone());
    const land = putIn(s0, opp, forest, "graveyard");
    const other = putIn(s0, opp, forest, "graveyard");
    expect(planActivate(s0, ap, stone, 1, [tgt(land)])).toBeNull();
    const s = settle(run(s0, planActivate(s0, ap, stone, 0, [tgt(land)])));
    expect(s.objects[land]!.zone).toBe("exile");
    expect(s.objects[other]!.zone).toBe("graveyard");
  });
});

describe("Ersatz Gnomes: a spell made colorless", () => {
  it("compile", () => supported(ersatzGnomes()));

  it("the creature spell made colorless enters colorless and stays so (rulings)", () => {
    const { s: s0, ap, ids } = setup([grizzlyBears()]);
    const g = putOnBattlefield(s0, ap, ersatzGnomes());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    const item = s.stack.find((x) => x.kind === "spell")!;
    s = settle(run(s, planActivate(s, ap, g, 0, [{ kind: "stack", id: item.id }])));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(characteristics(s, s.objects[ids[0]!]!).colors).toEqual([]);
    // Still colorless on later turns.
    s = goTo(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    expect(characteristics(s, s.objects[ids[0]!]!).colors).toEqual([]);
  });

  it("its second ability makes a permanent colorless until end of turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, ersatzGnomes());
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    let s = settle(run(s0, planActivate(s0, ap, g, 1, [tgt(bears)])));
    expect(characteristics(s, s.objects[bears]!).colors).toEqual([]);
    s = goTo(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    expect(characteristics(s, s.objects[bears]!).colors).toEqual(["G"]);
  });
});

describe("Battlefield Scrounger: graveyard cards on the bottom of the library as a cost", () => {
  it("compile", () => supported(battlefieldScrounger()));

  it("with seven cards in the graveyard, puts the three chosen on the bottom in that order for +3/+3, once each turn", () => {
    const { s: s0, ap } = setup([]);
    const sc = putOnBattlefield(s0, ap, battlefieldScrounger());
    const yard = Array.from({ length: 7 }, (_, i) => putIn(s0, ap, i % 2 ? hillGiant() : grizzlyBears(), "graveyard"));
    let s = settle(run(s0, planActivate(s0, ap, sc, 0, undefined, undefined, undefined, undefined, { exileCards: [yard[4]!, yard[0]!, yard[2]!] })));
    expect(ptOf(s, sc)).toBe("6/6");
    expect(s.players[ap]!.library.slice(-3)).toEqual([yard[4], yard[0], yard[2]]);
    expect(s.players[ap]!.graveyard).toHaveLength(4);
    // Once each turn (and only four cards are left anyway).
    for (let i = 0; i < 3; i++) putIn(s, ap, grizzlyBears(), "graveyard");
    expect(abilityProblem(s, ap, sc, 0)).not.toBeNull();
  });

  it("can't be activated with six cards in the graveyard; the bot pays with cards it has no use for", () => {
    const { s: s0, ap } = setup([]);
    const sc = putOnBattlefield(s0, ap, battlefieldScrounger());
    for (let i = 0; i < 6; i++) putIn(s0, ap, grizzlyBears(), "graveyard");
    expect(abilityProblem(s0, ap, sc, 0)).not.toBeNull();
    putIn(s0, ap, grizzlyBears(), "graveyard");
    expect(abilityProblem(s0, ap, sc, 0)).toBeNull();
    const plan = planActivate(s0, ap, sc, 0);
    expect(plan).not.toBeNull();
  });
});

describe("Gurzigost: two graveyard cards to keep it; combat damage as though unblocked", () => {
  it("compile", () => supported(gurzigost()));

  /** To `ap`'s next upkeep, its hand emptied first, stopping at its own question. */
  const toUpkeepAsk = (s: GameState, ap: PlayerId) => {
    s.players[ap]!.hand = [];
    s = goTo(s, "draw", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    return goTo(s, "draw", ap, ap);
  };

  it("at upkeep, putting two graveyard cards on the bottom of the library keeps it", () => {
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, gurzigost());
    const a = putIn(s0, ap, grizzlyBears(), "graveyard");
    const b = putIn(s0, ap, hillGiant(), "graveyard");
    let s = toUpkeepAsk(s0, ap);
    expect(s.pending?.kind).toBe("chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = settle(s, { me: [ap] });
    if (s.pending?.player === ap) s = run(s, botActions(s, ap));
    s = settle(s);
    expect(s.objects[g]!.zone).toBe("battlefield");
    expect(s.objects[a]!.zone).toBe("library");
    expect(s.objects[b]!.zone).toBe("library");
    expect(s.players[ap]!.library.slice(-2).sort()).toEqual([a, b].sort());
  });

  it("with only one card in the graveyard it can't be kept, so it's sacrificed (CR 609.3)", () => {
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, gurzigost());
    const a = putIn(s0, ap, grizzlyBears(), "graveyard");
    let s = toUpkeepAsk(s0, ap);
    if (s.pending?.player === ap) s = run(s, botActions(s, ap));
    s = settle(s);
    expect(s.objects[g]!.zone).toBe("graveyard");
    expect(s.objects[a]!.zone).toBe("graveyard");
  });

  it("choosing as the ability resolves to assign its damage as though unblocked: all 6 to the defending player, none to the blocker", () => {
    const { s: s0, ap, ids, opp } = setup([grizzlyBears()]);
    const g = putOnBattlefield(s0, ap, gurzigost());
    const blocker = putOnBattlefield(s0, opp, grizzlyBears());
    pool(s0, ap, { G: 2 });
    let s = run(s0, planActivate(s0, ap, g, 0, undefined, undefined, undefined, undefined, { discard: [ids[0]!] }));
    s = settle(s, { me: [ap] });
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    const life = s.players[opp]!.life;
    s = combat(s, ap, [{ attacker: g, defender: opp }], [{ blocker, attacker: g }]);
    expect(s.objects[g]!.blockedBy).toEqual([blocker]);
    s = goTo(s, "endCombat", ap);
    expect(s.players[opp]!.life).toBe(life - 6);
    expect(s.objects[blocker]!.zone).toBe("battlefield");
    expect(s.objects[blocker]!.damage ?? 0).toBe(0);
    // Gurzigost was dealt the Bears' 2 as usual.
    expect(s.objects[g]!.damage).toBe(2);
  });

  it("declining it: the damage goes to the blocker as usual, and no choice is left for the damage step", () => {
    const { s: s0, ap, ids, opp } = setup([grizzlyBears()]);
    const g = putOnBattlefield(s0, ap, gurzigost());
    const blocker = putOnBattlefield(s0, opp, grizzlyBears());
    pool(s0, ap, { G: 2 });
    let s = run(s0, planActivate(s0, ap, g, 0, undefined, undefined, undefined, undefined, { discard: [ids[0]!] }));
    s = settle(s, { me: [ap] });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    const life = s.players[opp]!.life;
    s = combat(s, ap, [{ attacker: g, defender: opp }], [{ blocker, attacker: g }]);
    s = goTo(s, "endCombat", ap, ap);
    expect(s.step).toBe("endCombat");
    expect(s.players[opp]!.life).toBe(life);
    expect(s.objects[blocker]!.zone).toBe("graveyard");
  });
});

describe("Crown of Convergence: creatures sharing a color with the top card of the library", () => {
  it("compile", () => supported(crownofConvergence()));

  it("a green creature card on top gives your green creatures +1/+1, not others or an opponent's; moving it to the bottom ends it", () => {
    const { s: s0, ap, opp } = setup([]);
    const crown = putOnBattlefield(s0, ap, crownofConvergence());
    const elf = putOnBattlefield(s0, ap, llanowarElves());
    const giant = putOnBattlefield(s0, ap, hillGiant());
    const oppElf = putOnBattlefield(s0, opp, llanowarElves());
    const land = putIn(s0, ap, forest, "library");
    const top = putIn(s0, ap, grizzlyBears(), "library");
    expect(ptOf(s0, elf)).toBe("2/2");
    expect(ptOf(s0, giant)).toBe("3/3");
    expect(ptOf(s0, oppElf)).toBe("1/1");
    pool(s0, ap, { G: 1, W: 1 });
    const s = settle(run(s0, planActivate(s0, ap, crown, 0)));
    expect(s.players[ap]!.library[0]).toBe(land);
    expect(s.players[ap]!.library.at(-1)).toBe(top);
    expect(ptOf(s, elf)).toBe("1/1");
  });

  it("a red creature card on top pumps the red creature; a colorless one pumps nothing (rulings)", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, crownofConvergence());
    const elf = putOnBattlefield(s0, ap, llanowarElves());
    const giant = putOnBattlefield(s0, ap, hillGiant());
    const thopter = putOnBattlefield(s0, ap, ornithopter());
    const red = putIn(s0, ap, lightningElemental(), "library");
    expect(ptOf(s0, giant)).toBe("4/4");
    expect(ptOf(s0, elf)).toBe("1/1");
    s0.players[ap]!.library.shift();
    s0.objects[red]!.zone = "exile";
    putIn(s0, ap, ornithopter(), "library");
    expect(ptOf(s0, giant)).toBe("3/3");
    expect(ptOf(s0, thopter)).toBe("0/2");
  });
});

describe("Mindreaver: counter a spell named like a card its heroic ability exiled", () => {
  it("compile", () => supported(mindreaver()));

  it("heroic exiles the top three cards of the target player's library; then it counters a spell with one of those names", () => {
    const { s: s0, ap, ids, opp } = setup([giantGrowth(), lightningBolt(), grizzlyBears()]);
    const mr = putOnBattlefield(s0, ap, mindreaver());
    putIn(s0, opp, hillGiant(), "library");
    const exiledBolt = putIn(s0, opp, lightningBolt(), "library");
    putIn(s0, opp, serraAngel(), "library");
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(mr)]));
    s = settle(s, { me: [ap] });
    expect(s.pending?.kind).toBe("chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.objects[exiledBolt]!.zone).toBe("exile");
    expect(s.players[opp]!.exile).toHaveLength(3);
    // A spell with another name can't be its target.
    s = run(s, planCast(s, ap, ids[2]!));
    const bears = s.stack.find((x) => x.kind === "spell")!;
    pool(s, ap, { U: 2 });
    expect(planActivate(s, ap, mr, 0, [{ kind: "stack", id: bears.id }])).toBeNull();
    s = settle(s);
    // A Lightning Bolt can, and it's countered after Mindreaver is sacrificed (the cards are still linked to it as it was).
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }]));
    const bolt = s.stack.find((x) => x.kind === "spell")!;
    pool(s, ap, { U: 2 });
    const life = s.players[opp]!.life;
    s = settle(run(s, planActivate(s, ap, mr, 0, [{ kind: "stack", id: bolt.id }])));
    expect(s.objects[mr]!.zone).toBe("graveyard");
    expect(s.objects[ids[1]!]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life);
  });

  it("with no cards exiled with it, nothing can be its target", () => {
    const { s: s0, ap, ids } = setup([lightningBolt()]);
    const mr = putOnBattlefield(s0, ap, mindreaver());
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: s0.turnOrder[1]! }]));
    const bolt = s.stack.find((x) => x.kind === "spell")!;
    pool(s, ap, { U: 2 });
    expect(planActivate(s, ap, mr, 0, [{ kind: "stack", id: bolt.id }])).toBeNull();
  });
});

describe("Horn of Plenty: the caster may pay {1} to draw at the next end step", () => {
  it("compile", () => supported(hornofPlenty()));

  it("the player who cast the spell decides and pays, and draws a card as the next end step begins", () => {
    const { s: s0, ap, ids, opp } = setup([grizzlyBears()]);
    putOnBattlefield(s0, opp, hornofPlenty());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, { me: [ap] });
    expect(s.pending?.player).toBe(ap);
    expect(s.pending?.kind).toBe("chooseMay");
    pool(s, ap, { C: 1 });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { me: [ap] });
    expect(s.players[ap]!.manaPool.C ?? 0).toBe(0);
    const hand = s.players[ap]!.hand.length;
    s = goTo(s, "end", ap);
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    // Horn's controller drew nothing.
  });

  it("declining: no card at the end step", () => {
    const { s: s0, ap, ids, opp } = setup([grizzlyBears()]);
    putOnBattlefield(s0, opp, hornofPlenty());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, { me: [ap] });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), { me: [ap] });
    const hand = s.players[ap]!.hand.length;
    const oppHand = s.players[opp]!.hand.length;
    s = settle(goTo(s, "end", ap));
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.players[opp]!.hand.length).toBe(oppHand);
  });
});
