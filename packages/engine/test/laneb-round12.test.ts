// Lane B, round 12: the cards the earlier rounds skipped, least played first (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, castProblem, planActivate, planTurnFaceUp, turnFaceUpProblem, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/**
 * Everyone passes until the stack is empty. "You may" questions get `yes`; a pending target choice gets `targets`; a pick
 * gets `pick` (or the first ones offered); a discard the first cards in hand. Stops at any other question.
 */
const settle = (s: GameState, opts: { yes?: boolean; targets?: TargetChoice[]; pick?: string[] } = {}) => {
  for (let i = 0; i < 200 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.yes ?? true });
    else if (p?.kind === "chooseTargets" && opts.targets) s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets } as Action);
    else if (p?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: p.player, ids: opts.pick ?? p.options.slice(0, p.count) });
    else if (p?.kind === "discard") s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
    else if (p) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const has = (s: GameState, id: string, k: string) => objHasKeyword(s, s.objects[id]!, k);
const chars = (s: GameState, id: string) => characteristics(s, s.objects[id]!);
const creature = (name: string, typeLine: string, manaCost: string, p: number, t: number, extra: Partial<CardDef> = {}) =>
  card(name, typeLine, manaCost, { power: String(p), toughness: String(t), ...extra });
const greenBear = () => creature("Green Bear", "Creature — Bear", "{1}{G}", 2, 2);
const redGoblin = () => creature("Red Goblin", "Creature — Goblin", "{R}", 1, 1);
const bigOgre = () => creature("Big Ogre", "Creature — Ogre", "{4}{R}", 6, 6);
const landsOf = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && chars(s, id).types.includes("Land"));
const into = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard" = "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};

// Real oracle text (Scryfall).
const magmaBurst = card("Magma Burst", "Instant", "{3}{R}", { cmc: 4, keywords: ["Kicker"], oracleText: "Kicker—Sacrifice two lands. (You may sacrifice two lands in addition to any other costs as you cast this spell.)\nMagma Burst deals 3 damage to any target. If this spell was kicked, it deals 3 damage to another target." });
const phyrexianScuta = card("Phyrexian Scuta", "Creature — Phyrexian Zombie", "{3}{B}", { cmc: 4, power: "3", toughness: "3", keywords: ["Kicker"], oracleText: "Kicker—Pay 3 life. (You may pay 3 life in addition to any other costs as you cast this spell.)\nIf this creature was kicked, it enters with two +1/+1 counters on it." });
const goblinBarrage = card("Goblin Barrage", "Sorcery", "{3}{R}", { cmc: 4, keywords: ["Kicker"], oracleText: "Kicker—Sacrifice an artifact or Goblin. (You may sacrifice an artifact or Goblin in addition to any other costs as you cast this spell.)\nGoblin Barrage deals 4 damage to target creature. If this spell was kicked, it also deals 4 damage to target player or planeswalker." });
const arcticMerfolk = card("Arctic Merfolk", "Creature — Merfolk", "{1}{U}", { cmc: 2, power: "1", toughness: "1", keywords: ["Kicker"], oracleText: "Kicker—Return a creature you control to its owner's hand. (You may return a creature you control to its owner's hand in addition to any other costs as you cast this spell.)\nIf this creature was kicked, it enters with a +1/+1 counter on it." });
const bogDown = card("Bog Down", "Sorcery", "{2}{B}", { cmc: 3, keywords: ["Kicker"], oracleText: "Kicker—Sacrifice two lands. (You may sacrifice two lands in addition to any other costs as you cast this spell.)\nTarget player discards two cards. If this spell was kicked, that player discards three cards instead." });
const fallingTimber = card("Falling Timber", "Instant", "{2}{G}", { cmc: 3, keywords: ["Kicker"], oracleText: "Kicker—Sacrifice a land. (You may sacrifice a land in addition to any other costs as you cast this spell.)\nPrevent all combat damage target creature would deal this turn. If this spell was kicked, prevent all combat damage another target creature would deal this turn." });
const dwarvenLandslide = card("Dwarven Landslide", "Sorcery", "{3}{R}", { cmc: 4, keywords: ["Kicker"], oracleText: "Kicker—{2}{R}, Sacrifice a land. (You may pay {2}{R} and sacrifice a land in addition to any other costs as you cast this spell.)\nDestroy target land. If this spell was kicked, destroy another target land." });
const rushingRiver = card("Rushing River", "Instant", "{2}{U}", { cmc: 3, keywords: ["Kicker"], oracleText: "Kicker—Sacrifice a land. (You may sacrifice a land in addition to any other costs as you cast this spell.)\nReturn target nonland permanent to its owner's hand. If this spell was kicked, return another target nonland permanent to its owner's hand." });
const viciousOffering = card("Vicious Offering", "Instant", "{1}{B}", { cmc: 2, keywords: ["Kicker"], oracleText: "Kicker—Sacrifice a creature. (You may sacrifice a creature in addition to any other costs as you cast this spell.)\nTarget creature gets -2/-2 until end of turn. If this spell was kicked, that creature gets -5/-5 until end of turn instead." });
const stompedByTheFoot = card("Stomped by the Foot", "Instant", "{1}{B}", { cmc: 2, keywords: ["Kicker"], oracleText: "Kicker—Sacrifice an artifact or creature. (You may sacrifice an artifact or creature in addition to any other costs as you cast this spell.)\nTarget creature gets -2/-2 until end of turn. If this spell was kicked, that creature gets -5/-5 until end of turn instead." });
const finalFlourish = card("Final Flourish", "Instant", "{1}{B}", { cmc: 2, keywords: ["Kicker"], oracleText: "Kicker—Sacrifice an artifact or creature. (You may sacrifice an artifact or creature in addition to any other costs as you cast this spell.)\nTarget creature gets -2/-2 until end of turn. If this spell was kicked, that creature gets -6/-6 until end of turn instead." });
const vaynesTreachery = card("Vayne's Treachery", "Instant", "{1}{B}", { cmc: 2, keywords: ["Kicker"], oracleText: "Kicker—Sacrifice an artifact or creature. (You may sacrifice an artifact or creature in addition to any other costs as you cast this spell.)\nTarget creature gets -2/-2 until end of turn. If this spell was kicked, that creature gets -6/-6 until end of turn instead." });
const primalGrowth = card("Primal Growth", "Sorcery", "{2}{G}", { cmc: 3, keywords: ["Kicker"], oracleText: "Kicker—Sacrifice a creature. (You may sacrifice a creature in addition to any other costs as you cast this spell.)\nSearch your library for a basic land card, put that card onto the battlefield, then shuffle. If this spell was kicked, instead search your library for up to two basic land cards, put them onto the battlefield, then shuffle." });
const skizzikSurger = card("Skizzik Surger", "Creature — Elemental", "{4}{R}{R}", { cmc: 6, power: "6", toughness: "4", keywords: ["Haste","Echo"], oracleText: "Haste\nEcho—Sacrifice two lands. (At the beginning of your upkeep, if this came under your control since the beginning of your last upkeep, sacrifice it unless you pay its echo cost.)" });
const deepcavernImp = card("Deepcavern Imp", "Creature — Imp Rebel", "{2}{B}", { cmc: 3, power: "2", toughness: "2", keywords: ["Echo","Flying","Haste"], oracleText: "Flying, haste\nEcho—Discard a card. (At the beginning of your upkeep, if this came under your control since the beginning of your last upkeep, sacrifice it unless you pay its echo cost.)" });
const rakdosHeadliner = card("Rakdos Headliner", "Creature — Devil", "{B}{R}", { cmc: 2, colors: ["B","R"], power: "3", toughness: "3", keywords: ["Haste","Echo"], oracleText: "Haste\nEcho—Discard a card. (At the beginning of your upkeep, if this came under your control since the beginning of your last upkeep, sacrifice it unless you pay its echo cost.)" });
const sinuousStriker = card("Sinuous Striker", "Creature — Snake Warrior", "{2}{U}", { cmc: 3, power: "2", toughness: "2", keywords: ["Eternalize"], oracleText: "{U}: This creature gets +1/-1 until end of turn.\nEternalize—{3}{U}{U}, Discard a card. ({3}{U}{U}, Discard a card, Exile this card from your graveyard: Create a token that's a copy of it, except it's a 4/4 black Zombie Snake Warrior with no mana cost. Eternalize only as a sorcery.)" });
const sunscourgeChampion = card("Sunscourge Champion", "Creature — Human Wizard", "{2}{W}", { cmc: 3, power: "2", toughness: "3", keywords: ["Eternalize"], oracleText: "When this creature enters, you gain life equal to its power.\nEternalize—{2}{W}{W}, Discard a card. ({2}{W}{W}, Discard a card, Exile this card from your graveyard: Create a token that's a copy of it, except it's a 4/4 black Zombie Human Wizard with no mana cost. Eternalize only as a sorcery.)" });
const putridRaptor = card("Putrid Raptor", "Creature — Zombie Dinosaur Beast", "{4}{B}{B}", { cmc: 6, power: "4", toughness: "4", keywords: ["Morph"], oracleText: "Morph—Discard a Zombie card. (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)" });
const zombieCutthroat = card("Zombie Cutthroat", "Creature — Zombie", "{3}{B}{B}", { cmc: 5, power: "3", toughness: "4", keywords: ["Morph"], oracleText: "Morph—Pay 5 life. (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)" });
const skirkVolcanist = card("Skirk Volcanist", "Creature — Goblin", "{3}{R}", { cmc: 4, power: "3", toughness: "1", keywords: ["Morph"], oracleText: "Morph—Sacrifice two Mountains. (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)\nWhen this creature is turned face up, it deals 3 damage divided as you choose among one, two, or three target creatures." });
const ravenGuildInitiate = card("Raven Guild Initiate", "Creature — Human Wizard", "{2}{U}", { cmc: 3, power: "1", toughness: "4", keywords: ["Morph"], oracleText: "Morph—Return a Bird you control to its owner's hand. (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)" });
const gathanRaiders = card("Gathan Raiders", "Creature — Human Warrior", "{3}{R}{R}", { cmc: 5, power: "3", toughness: "3", keywords: ["Morph","Hellbent"], oracleText: "Hellbent — This creature gets +2/+2 as long as you have no cards in hand.\nMorph—Discard a card. (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)" });
const watcherOfTheRoost = card("Watcher of the Roost", "Creature — Bird Soldier", "{2}{W}", { cmc: 3, power: "2", toughness: "1", keywords: ["Flying","Morph"], oracleText: "Flying\nMorph—Reveal a white card in your hand. (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)\nWhen this creature is turned face up, you gain 2 life." });
const hordeAmbusher = card("Horde Ambusher", "Creature — Human Berserker", "{1}{R}", { cmc: 2, power: "2", toughness: "2", keywords: ["Morph"], oracleText: "Whenever this creature blocks, it deals 1 damage to you.\nMorph—Reveal a red card in your hand. (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)\nWhen this creature is turned face up, target creature can't block this turn." });
const fathomSeer = card("Fathom Seer", "Creature — Illusion", "{1}{U}", { cmc: 2, power: "1", toughness: "3", keywords: ["Morph"], oracleText: "Morph—Return two Islands you control to their owner's hand. (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)\nWhen this creature is turned face up, draw two cards." });
const temurCharger = card("Temur Charger", "Creature — Horse", "{1}{G}", { cmc: 2, power: "3", toughness: "1", keywords: ["Morph"], oracleText: "Morph—Reveal a green card in your hand. (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)\nWhen this creature is turned face up, target creature gains trample until end of turn." });
const dragonsEyeSavants = card("Dragon's Eye Savants", "Creature — Human Wizard", "{1}{U}", { cmc: 2, power: "0", toughness: "6", keywords: ["Morph"], oracleText: "Morph—Reveal a blue card in your hand. (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)\nWhen this creature is turned face up, look at target opponent's hand." });
const ruthlessRipper = card("Ruthless Ripper", "Creature — Human Assassin", "{B}", { cmc: 1, power: "1", toughness: "1", keywords: ["Morph","Deathtouch"], oracleText: "Deathtouch\nMorph—Reveal a black card in your hand. (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)\nWhen this creature is turned face up, target player loses 2 life." });

describe("kicker costs that aren't mana (CR 702.33a, 118.8)", () => {
  it("compiles them", () => {
    supported(magmaBurst, phyrexianScuta, goblinBarrage, arcticMerfolk, bogDown, fallingTimber, dwarvenLandslide, rushingRiver, viciousOffering, stompedByTheFoot, finalFlourish, vaynesTreachery, primalGrowth);
  });

  it("Magma Burst kicked: two lands sacrificed with its other costs, and a second target", () => {
    const { s: s0, ap, ids, opp } = setup([magmaBurst]);
    const ogre = putOnBattlefield(s0, opp, bigOgre());
    const lands = landsOf(s0, ap);
    // Sacrificing only one land doesn't pay it.
    expect(castProblem(s0, ap, ids[0]!, [player(opp), tgt(ogre)], undefined, undefined, undefined, undefined, { kicks: [0], sacrifice: [lands[0]!] })).not.toBeNull();
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [player(opp), tgt(ogre)], undefined, "auto", undefined, { kicks: [0], sacrifice: [lands[0]!, lands[1]!] })));
    expect(zone(s, lands[0]!)).toBe("graveyard");
    expect(zone(s, lands[1]!)).toBe("graveyard");
    expect(landsOf(s, ap).length).toBe(lands.length - 2);
    expect(life(s, opp)).toBe(37);
    expect(s.objects[ogre]!.damage).toBe(3);
  });

  it("Magma Burst unkicked: no land sacrificed, one target", () => {
    const { s: s0, ap, ids, opp } = setup([magmaBurst]);
    const lands = landsOf(s0, ap);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [player(opp), { kind: "none" }], undefined, "auto")));
    expect(landsOf(s, ap).length).toBe(lands.length);
    expect(life(s, opp)).toBe(37);
  });

  it("Phyrexian Scuta kicked by paying 3 life enters with two +1/+1 counters", () => {
    const { s: s0, ap, ids } = setup([phyrexianScuta]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [], undefined, "auto", undefined, { kicks: [0] })));
    expect(life(s, ap)).toBe(37);
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(2);
  });

  it("Arctic Merfolk kicked: a creature you control goes back to your hand", () => {
    const { s: s0, ap, ids } = setup([arcticMerfolk]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [], undefined, "auto", undefined, { kicks: [0], returnToHand: [bear] })));
    expect(zone(s, bear)).toBe("hand");
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(1);
  });

  it("Goblin Barrage can sacrifice the Goblin it targets (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([goblinBarrage]);
    const gob = putOnBattlefield(s0, ap, redGoblin());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(gob), player(opp)], undefined, "auto", undefined, { kicks: [0], sacrifice: [gob] })));
    expect(zone(s, gob)).toBe("graveyard");
    expect(life(s, opp)).toBe(36);
  });

  it("a bot kicks Vicious Offering with a token it can spare, and Magma Burst with lands it has plenty of", () => {
    const { s: s0, ap, ids, opp } = setup([viciousOffering]);
    const token = putOnBattlefield(s0, ap, greenBear());
    s0.objects[token]!.isToken = true;
    putOnBattlefield(s0, opp, creature("Ogre Lord", "Creature — Ogre", "{3}{R}", 5, 5));
    s0.players[ap]!.landsPlayedThisTurn = 1;
    s0.players[ap]!.command = [];
    s0.players[ap]!.hand = [ids[0]!];
    const cast = botActions(s0, ap).find((a) => a.type === "castSpell" && a.objectId === ids[0]);
    expect(cast).toMatchObject({ kicks: [0], sacrifice: [token] });
    const { s: s1, ap: ap1, ids: ids1, opp: opp1 } = setup([magmaBurst]);
    s1.players[opp1]!.life = 3;
    s1.players[ap1]!.landsPlayedThisTurn = 1;
    s1.players[ap1]!.command = [];
    s1.players[ap1]!.hand = [ids1[0]!];
    const burst = botActions(s1, ap1).find((a) => a.type === "castSpell" && a.objectId === ids1[0]);
    expect(burst).toMatchObject({ kicks: [0] });
    expect((burst as { sacrifice: string[] }).sacrifice.every((id) => chars(s1, id).types.includes("Land"))).toBe(true);
  });

  it("Vicious Offering kicked by sacrificing a creature gives -5/-5", () => {
    const { s: s0, ap, ids, opp } = setup([viciousOffering]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    const ogre = putOnBattlefield(s0, opp, bigOgre());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(ogre)], undefined, "auto", undefined, { kicks: [0], sacrifice: [bear] })));
    expect(zone(s, bear)).toBe("graveyard");
    expect(chars(s, ogre).power).toBe(1);
  });
});

/** The next upkeep of `pid`, with its triggers resolved. */
const toUpkeep = (s: GameState, pid: PlayerId, opts: Parameters<typeof settle>[1] = {}) => settle(passUntil(s, "upkeep", pid), opts);

describe("echo and eternalize costs that aren't mana (CR 702.30a, 702.129a)", () => {
  it("compiles them", () => supported(skizzikSurger, deepcavernImp, rakdosHeadliner, sinuousStriker, sunscourgeChampion));

  it("Deepcavern Imp: echo paid by discarding a card, the next upkeep only", () => {
    const { s: s0, ap } = setup([]);
    const imp = putOnBattlefield(s0, ap, deepcavernImp, { sick: true });
    let s = passUntil(s0, "upkeep", ap);
    const hand = s.players[ap]!.hand.length;
    s = settle(s);
    expect(zone(s, imp)).toBe("battlefield");
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    // Paid once: no echo the upkeep after.
    s = passUntil(s, "upkeep", ap);
    const again = s.players[ap]!.hand.length;
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(again);
  });

  it("Deepcavern Imp: with no card in hand, it's sacrificed (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const imp = putOnBattlefield(s0, ap, deepcavernImp, { sick: true });
    let s = passUntil(s0, "upkeep", ap);
    const p = s.players[ap]!;
    for (const id of p.hand) s.objects[id]!.zone = "library";
    p.library.push(...p.hand);
    p.hand = [];
    s = settle(s);
    expect(zone(s, imp)).toBe("graveyard");
  });

  it("Skizzik Surger: echo paid by sacrificing two lands, or declined", () => {
    const { s: s0, ap } = setup([]);
    const surger = putOnBattlefield(s0, ap, skizzikSurger, { sick: true });
    const lands = landsOf(s0, ap).length;
    const paid = toUpkeep(s0, ap);
    expect(zone(paid, surger)).toBe("battlefield");
    expect(landsOf(paid, ap).length).toBe(lands - 2);
    const declined = toUpkeep(s0, ap, { yes: false });
    expect(zone(declined, surger)).toBe("graveyard");
    expect(landsOf(declined, ap).length).toBe(lands);
  });

  it("Sinuous Striker: eternalize discards a card from hand with its mana", () => {
    const { s: s0, ap } = setup([]);
    const striker = into(s0, ap, sinuousStriker, "graveyard");
    const discard = into(s0, ap, greenBear());
    const s = settle(run(s0, planActivate(s0, ap, striker, 1, [], undefined, undefined, undefined, { discard: [discard] })));
    expect(zone(s, striker)).toBe("exile");
    expect(zone(s, discard)).toBe("graveyard");
    const token = s.battlefield.find((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap)!;
    expect(chars(s, token)).toMatchObject({ power: 4, toughness: 4, colors: ["B"] });
    expect(chars(s, token).subtypes).toContain("Zombie");
  });
});

/** `def` cast face down from `pid`'s hand for {3} (CR 702.37c) and resolved. */
const faceDown = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = into(s, pid, def);
  return { s: settle(run(s, planCast(s, pid, id, undefined, undefined, "auto", undefined, { faceDown: true }))), id };
};
const whiteKnight = () => creature("White Knight", "Creature — Human Knight", "{W}{W}", 2, 2);
const blackRat = () => creature("Black Rat", "Creature — Rat", "{B}", 1, 1);
const zombieCard = () => creature("Gray Zombie", "Creature — Zombie", "{1}{B}", 2, 2);
const littleBird = () => creature("Little Bird", "Creature — Bird", "{U}", 1, 1);

describe("morph costs that aren't mana (CR 702.37e, 118.8)", () => {
  it("compiles them", () => supported(putridRaptor, zombieCutthroat, skirkVolcanist, ravenGuildInitiate, gathanRaiders, watcherOfTheRoost, hordeAmbusher, fathomSeer, temurCharger, dragonsEyeSavants, ruthlessRipper));

  it("Zombie Cutthroat: 5 life, no mana", () => {
    const { s: s0, ap } = setup([]);
    const { s: s1, id } = faceDown(s0, ap, zombieCutthroat);
    expect(s1.objects[id]!.faceDown).toBe("morph");
    const s = run(s1, planTurnFaceUp(s1, ap, id));
    expect(s.objects[id]!.faceDown).toBeUndefined();
    expect(chars(s, id).name).toBe("Zombie Cutthroat");
    expect(life(s, ap)).toBe(35);
    expect(s.log.some((l) => /turns a face-down creature face up: it's Zombie Cutthroat \(morph pay 5 life\)/.test(l.text))).toBe(true);
  });

  it("Watcher of the Roost: a white card revealed stays in hand; with none, it can't be turned face up", () => {
    const { s: s0, ap } = setup([]);
    const { s: s1, id } = faceDown(s0, ap, watcherOfTheRoost);
    s1.players[ap]!.hand = [];
    const rat = into(s1, ap, blackRat());
    expect(turnFaceUpProblem(s1, ap, id)).toMatch(/reveal a white card/);
    expect(turnFaceUpProblem(s1, ap, id, 0, 0, { reveal: [rat] })).not.toBeNull();
    const knight = into(s1, ap, whiteKnight());
    expect(() => run(s1, [{ type: "turnFaceUp", player: ap, objectId: id }])).toThrow(/choose what to pay/);
    const s = settle(run(s1, planTurnFaceUp(s1, ap, id, 0, 0, { reveal: [knight] })));
    expect(chars(s, id).name).toBe("Watcher of the Roost");
    expect(zone(s, knight)).toBe("hand");
    expect(life(s, ap)).toBe(42);
  });

  it("Putrid Raptor: only a Zombie card can be discarded for it", () => {
    const { s: s0, ap } = setup([]);
    const { s: s1, id } = faceDown(s0, ap, putridRaptor);
    const rat = into(s1, ap, blackRat());
    const zombie = into(s1, ap, zombieCard());
    expect(turnFaceUpProblem(s1, ap, id, 0, 0, { discard: [rat] })).not.toBeNull();
    const s = run(s1, planTurnFaceUp(s1, ap, id, 0, 0, { discard: [zombie] }));
    expect(zone(s, zombie)).toBe("graveyard");
    expect(chars(s, id)).toMatchObject({ name: "Putrid Raptor", power: 4, toughness: 4 });
  });

  it("Raven Guild Initiate: it can't return itself (face down it isn't a Bird), a Bird you control goes back", () => {
    const { s: s0, ap } = setup([]);
    const { s: s1, id } = faceDown(s0, ap, ravenGuildInitiate);
    expect(turnFaceUpProblem(s1, ap, id)).toMatch(/return a Bird/);
    expect(turnFaceUpProblem(s1, ap, id, 0, 0, { returnToHand: [id] })).not.toBeNull();
    const bird = putOnBattlefield(s1, ap, littleBird());
    const s = run(s1, planTurnFaceUp(s1, ap, id, 0, 0, { returnToHand: [bird] }));
    expect(zone(s, bird)).toBe("hand");
    expect(chars(s, id).name).toBe("Raven Guild Initiate");
  });

  it("Skirk Volcanist: two Mountains sacrificed, then its turned-face-up trigger", () => {
    const { s: s0, ap, opp } = setup([]);
    const ogre = putOnBattlefield(s0, opp, bigOgre());
    const { s: s1, id } = faceDown(s0, ap, skirkVolcanist);
    const mountains = landsOf(s1, ap).filter((l) => chars(s1, l).subtypes.includes("Mountain"));
    const plains = landsOf(s1, ap).find((l) => chars(s1, l).subtypes.includes("Plains"))!;
    expect(turnFaceUpProblem(s1, ap, id, 0, 0, { sacrifice: [mountains[0]!, plains] })).not.toBeNull();
    let s = run(s1, planTurnFaceUp(s1, ap, id, 0, 0, { sacrifice: mountains.slice(0, 2) }));
    expect(mountains.slice(0, 2).map((m) => zone(s, m))).toEqual(["graveyard", "graveyard"]);
    expect(chars(s, id).name).toBe("Skirk Volcanist");
    s = settle(s, { targets: [{ kind: "object", id: ogre, amount: 3 } as TargetChoice, { kind: "none" }, { kind: "none" }] });
    expect(s.objects[ogre]!.damage).toBe(3);
  });

  it("a bot turns Zombie Cutthroat face up with life to spare, and Gathan Raiders by discarding", () => {
    const { s: s0, ap } = setup([]);
    const { s: s1, id } = faceDown(s0, ap, zombieCutthroat);
    s1.players[ap]!.landsPlayedThisTurn = 1;
    s1.players[ap]!.command = [];
    s1.players[ap]!.hand = [];
    expect(botActions(s1, ap)).toEqual([{ type: "turnFaceUp", player: ap, objectId: id }]);
    s1.players[ap]!.life = 18;
    expect(botActions(s1, ap).some((a) => a.type === "turnFaceUp")).toBe(false);
    const { s: s2, id: raiders } = faceDown(s0, ap, gathanRaiders);
    s2.players[ap]!.landsPlayedThisTurn = 1;
    s2.players[ap]!.command = [];
    s2.players[ap]!.hand = [];
    const one = into(s2, ap, card("Spare Forest", "Land", ""));
    const two = into(s2, ap, card("Spare Swamp", "Land", ""));
    const up = botActions(s2, ap).find((a) => a.type === "turnFaceUp");
    expect(up).toMatchObject({ objectId: raiders, costs: { discard: [expect.any(String)] } });
    expect([one, two]).toContain((up as { costs: { discard: string[] } }).costs.discard[0]);
  });
});
