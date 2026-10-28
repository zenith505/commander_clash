// Round 188: more of the harder cards both lanes skipped, from the most played down: lands that enter only by
// sacrificing untapped lands (Lotus Vale, Scorched Ruins, Balduvian Trading Post, Soldevi Excavations), "choose odd or
// even" (Extinction Event, Mutinous Massacre, Twins of Discord, Zimone's Hypothesis, Thanos, Gollum, Ashling's
// Prerogative), a turn of Anti-Venom's prevention for one creature (Gatta and Luzzu), "that player becomes the monarch"
// (Starscream, M'Baku), Sapling of Colfenor's reveal, and Gix's Command's counters on up to one creature.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, scry, setup } from "./helpers";
import { botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ManaType, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; "you may" questions get `yes`. Stops at any other question. */
const resolveAll = (s: GameState, yes = true) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending?.kind === "chooseMay"); i++) {
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes });
    else if (s.pending) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Answers a target question for a trigger, if one is asked. */
const choose = (s: GameState, targets: TargetChoice[]) => (s.pending?.kind === "chooseTargets" ? resolveAll(act(s, { type: "chooseTargets", player: s.pending.player, targets })) : s);
const option = (s: GameState, choice: string) => {
  if (s.pending?.kind !== "chooseOption") throw new Error(`no option question: ${s.pending?.kind}`);
  return resolveAll(act(s, { type: "chooseOption", player: s.pending.player, choice }));
};
/** A card put straight into a zone, not from the battlefield. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const counters = (s: GameState, id: string, c = "+1/+1") => s.objects[id]!.counters[c] ?? 0;
const pt = (s: GameState, id: ObjectId) => [power(s, s.objects[id]!), toughness(s, s.objects[id]!)];
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const lands = (s: GameState, pid: PlayerId, name?: string) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).types.includes("Land") && (!name || s.cards[s.objects[id]!.cardId]!.name === name));
/** Taps all but `keep` of `pid`'s lands. */
const tapAllBut = (s: GameState, pid: PlayerId, keep: ObjectId[]) => {
  for (const id of lands(s, pid)) s.objects[id]!.tapped = !keep.includes(id);
  invalidateCharacteristics(s);
};
/** A creature of mana value `mv` and power `p`. */
const mvCreature = (mv: number, p = 2, extra: Partial<CardDef> = {}) => card(`Test Creature ${mv}/${p}${extra.colors?.length === 0 ? " colorless" : ""}`, "Creature — Beast", mv ? `{${mv - 1}}{G}` : "", { cmc: mv, power: String(p), toughness: "3", colors: mv ? ["G"] : [], ...extra });
const shock = card("Test Shock", "Instant", "{R}", { cmc: 1, oracleText: "This spell deals 2 damage to any target." });

// Real oracle text (Scryfall).
const lotusVale = card("Lotus Vale", "Land", "", {"cmc":0,"oracleText":"If this land would enter, sacrifice two untapped lands instead. If you do, put this land onto the battlefield. If you don't, put it into its owner's graveyard.\n{T}: Add three mana of any one color.","layout":"normal"});
const scorchedRuins = card("Scorched Ruins", "Land", "", {"cmc":0,"oracleText":"If this land would enter, sacrifice two untapped lands instead. If you do, put this land onto the battlefield. If you don't, put it into its owner's graveyard.\n{T}: Add {C}{C}{C}{C}.","layout":"normal"});
const balduvianTradingPost = card("Balduvian Trading Post", "Land", "", {"cmc":0,"oracleText":"If this land would enter, sacrifice an untapped Mountain instead. If you do, put this land onto the battlefield. If you don't, put it into its owner's graveyard.\n{T}: Add {C}{R}.\n{1}, {T}: This land deals 1 damage to target attacking creature.","layout":"normal"});
const soldeviExcavations = card("Soldevi Excavations", "Land", "", {"cmc":0,"keywords":["Scry"],"oracleText":"If this land would enter, sacrifice an untapped Island instead. If you do, put this land onto the battlefield. If you don't, put it into its owner's graveyard.\n{T}: Add {C}{U}.\n{1}, {T}: Scry 1.","layout":"normal"});
const gattaAndLuzzu = card("Gatta and Luzzu", "Legendary Creature — Human Soldier", "{2}{W}", {"cmc":3,"power":"1","toughness":"1","keywords":["Flash"],"oracleText":"Flash\nWhen Gatta and Luzzu enters, choose target creature you control. If damage would be dealt to that creature this turn, prevent that damage and put that many +1/+1 counters on it.","colors":["W"],"layout":"normal"});
const mBakuJabariChieftain = card("M'Baku, Jabari Chieftain", "Legendary Creature — Human Noble Warrior", "{1}{G}{G}", {"cmc":3,"power":"4","toughness":"3","oracleText":"At the beginning of your end step, if there is no monarch, target opponent becomes the monarch.\nWhenever a creature attacks one of your opponents, if that player is the monarch, that creature gets +1/+1 and gains trample until end of turn.","colors":["G"],"layout":"normal"});
const saplingOfColfenor = card("Sapling of Colfenor", "Legendary Creature — Treefolk Shaman", "{3}{B/G}{B/G}", {"cmc":5,"power":"2","toughness":"5","keywords":["Indestructible"],"oracleText":"Indestructible\nWhenever Sapling of Colfenor attacks, reveal the top card of your library. If it's a creature card, you gain life equal to that card's toughness, lose life equal to its power, then put it into your hand.","colors":["B","G"],"layout":"normal"});
const extinctionEvent = card("Extinction Event", "Sorcery", "{3}{B}", {"cmc":4,"oracleText":"Choose odd or even. Exile each creature with mana value of the chosen quality. (Zero is even.)","colors":["B"],"layout":"normal"});
const mutinousMassacre = card("Mutinous Massacre", "Sorcery", "{3}{B}{B}{R}{R}", {"cmc":7,"oracleText":"Choose odd or even. Destroy each creature with mana value of the chosen quality. Then gain control of all creatures until end of turn. Untap them. They gain haste until end of turn. (Zero is even.)","colors":["B","R"],"layout":"normal"});
const twinsOfDiscord = card("Twins of Discord", "Creature — Eldrazi", "{7}", {"cmc":7,"power":"8","toughness":"6","oracleText":"Whenever you attack, choose odd or even. Creatures with mana value of that quality can't block this turn. (Zero is even.)\nEach other colorless creature you control has bloodthirst 2. (If an opponent was dealt damage this turn, that creature enters with two additional +1/+1 counters on it.)","layout":"normal"});
const zimonesHypothesis = card("Zimone's Hypothesis", "Instant", "{3}{U}{U}", {"cmc":5,"oracleText":"You may put a +1/+1 counter on a creature. Then choose odd or even. Return each creature with power of the chosen quality to its owner's hand. (Zero is even.)","colors":["U"],"layout":"normal"});
const thanosTheMadTitan = card("Thanos, the Mad Titan", "Legendary Creature — Eternal Villain", "{R}{W}{B}", {"cmc":3,"power":"4","toughness":"4","keywords":["Deathtouch","Power-up","Lifelink"],"oracleText":"Deathtouch, lifelink\nPower-up — {C}{W}{U}{B}{R}{G}: Put two +1/+1 counters on Thanos. Choose odd or even. Destroy each other creature with mana value of the chosen quality. (Activate each power-up ability only once. Reduce the cost by his mana cost if he entered this turn. Zero is even.)","colors":["B","R","W"],"layout":"normal"});
const gollumRiddleMaster = card("Gollum, Riddle Master", "Legendary Creature — Halfling Horror", "{1}{B}", {"cmc":2,"power":"3","toughness":"1","oracleText":"As Gollum enters, choose odd or even. (Zero is even.)\nWhenever an opponent casts a spell with mana value of the chosen quality, choose one that hasn't been chosen —\n• Put a +1/+1 counter on Gollum.\n• Each opponent loses 2 life and you gain 2 life.\n• Draw a card.","colors":["B"],"layout":"normal"});
const ashlingsPrerogative = card("Ashling's Prerogative", "Enchantment", "{1}{R}", {"cmc":2,"oracleText":"As this enchantment enters, choose odd or even. (Zero is even.)\nEach creature with mana value of the chosen quality has haste.\nEach creature without mana value of the chosen quality enters tapped.","colors":["R"],"layout":"normal"});
const gixsCommand = card("Gix's Command", "Sorcery", "{3}{B}{B}", {"cmc":5,"oracleText":"Choose two —\n• Put two +1/+1 counters on up to one creature. It gains lifelink until end of turn.\n• Destroy each creature with power 2 or less.\n• Return up to two creature cards from your graveyard to your hand.\n• Each opponent sacrifices a creature with the greatest power among creatures they control.","colors":["B"],"layout":"normal"});
const starscream = scry("transform", [
  { name: "Starscream, Power Hungry", mana_cost: "{3}{B}", type_line: "Legendary Artifact Creature — Robot", power: "2", toughness: "3", oracle_text: "More Than Meets the Eye {2}{B} (You may cast this card converted for {2}{B}.)\nFlying\nWhenever you draw a card, if you're the monarch, target opponent loses 2 life.\nWhenever one or more creatures deal combat damage to you, convert Starscream." },
  { name: "Starscream, Seeker Leader", type_line: "Legendary Artifact — Vehicle", color_indicator: ["B"], power: "2", toughness: "3", oracle_text: "Living metal (During your turn, this Vehicle is also a creature.)\nFlying, menace, haste\nWhenever Starscream deals combat damage to a player, if there is no monarch, that player becomes the monarch.\nWhenever you become the monarch, convert Starscream." },
], { keywords: ["Flying", "Living metal", "Haste", "Convert", "Menace", "More Than Meets the Eye"] });

const thunderousVelocipede = card("Thunderous Velocipede", "Artifact — Vehicle", "{1}{G}{G}", {"cmc":3,"power":"5","toughness":"5","keywords":["Crew","Trample"],"oracleText":"Trample\nEach other Vehicle and creature you control enters with an additional +1/+1 counter on it if its mana value is 4 or less. Otherwise, it enters with three additional +1/+1 counters on it.\nCrew 3","colors":["G"],"layout":"normal"});
const kiboUktabiPrince = card("Kibo, Uktabi Prince", "Legendary Creature — Monkey Noble", "{2}{G}", {"cmc":3,"power":"2","toughness":"2","oracleText":"{T}: Each player creates a colorless artifact token named Banana with \"{T}, Sacrifice this token: Add {R} or {G}. You gain 2 life.\"\nWhenever an artifact an opponent controls is put into a graveyard from the battlefield, put a +1/+1 counter on each creature you control that's an Ape or a Monkey.\nWhenever Kibo attacks, defending player sacrifices an artifact of their choice.","colors":["G"],"layout":"normal"});
const botanicalBrawler = card("Botanical Brawler", "Creature — Elemental Warrior", "{G}{W}", {"cmc":2,"power":"0","toughness":"0","keywords":["Trample"],"oracleText":"Trample\nThis creature enters with two +1/+1 counters on it.\nWhenever one or more +1/+1 counters are put on another permanent you control, if it's the first time +1/+1 counters have been put on that permanent this turn, put a +1/+1 counter on this creature.","colors":["G","W"],"layout":"normal"});
const wolverineBestThereIs = card("Wolverine, Best There Is", "Legendary Creature — Mutant Berserker Hero", "{1}{R}{G}", {"cmc":3,"power":"2","toughness":"2","keywords":["Heal","Regenerate","Unrivaled Lethality","Double"],"oracleText":"Unrivaled Lethality — Double all damage Wolverine would deal.\nAt the beginning of each end step, if Wolverine dealt damage to another creature this turn, put a +1/+1 counter on him.\n{1}{G}: Regenerate Wolverine. (The next time he would be destroyed this turn, instead tap him, remove him from combat, and heal all damage on him.)","colors":["G","R"],"layout":"normal"});
const growth = card("Test Growth", "Instant", "{G}", { cmc: 1, oracleText: "Put a +1/+1 counter on target creature." });
const fight = card("Test Fight", "Sorcery", "{G}", { cmc: 1, oracleText: "Target creature you control fights target creature you don't control." });

const elvishGuidance = card("Elvish Guidance", "Enchantment — Aura", "{2}{G}", {"cmc":3,"keywords":["Enchant"],"oracleText":"Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional {G} for each Elf on the battlefield.","colors":["G"],"layout":"normal"});
const ringwraiths = card("Ringwraiths", "Creature — Wraith Knight", "{4}{B}{B}", {"cmc":6,"power":"5","toughness":"5","oracleText":"When this creature enters, target creature an opponent controls gets -3/-3 until end of turn. If that creature is legendary, its controller loses 3 life.\nWhen the Ring tempts you, return this card from your graveyard to your hand.","colors":["B"],"layout":"normal"});
const slimeAgainstHumanity = card("Slime Against Humanity", "Sorcery", "{2}{G}", {"cmc":3,"oracleText":"Create a 0/0 green Ooze creature token with trample. Put X +1/+1 counters on it, where X is two plus the total number of cards you own in exile and in your graveyard that are Oozes or are named Slime Against Humanity.\nA deck can have any number of cards named Slime Against Humanity.","colors":["G"],"layout":"normal"});
const morningtidesLight = card("Morningtide's Light", "Sorcery", "{3}{W}", {"cmc":4,"oracleText":"Exile any number of target creatures. At the beginning of the next end step, return those cards to the battlefield tapped under their owners' control.\nUntil your next turn, prevent all damage that would be dealt to you.\nExile Morningtide's Light.","colors":["W"],"layout":"normal"});
const birthdayEscape = card("Birthday Escape", "Sorcery", "{U}", { cmc: 1, oracleText: "Draw a card. The Ring tempts you." });
const elf = (name = "Test Elf") => card(name, "Creature — Elf", "{G}", { cmc: 1, power: "1", toughness: "1", colors: ["G"] });
const tapFor = (pid: PlayerId, id: ObjectId, mana: ManaType): Action => ({ type: "activateMana", player: pid, objectId: id, mana });
const pool = (s: GameState, pid: PlayerId) => Object.entries(s.players[pid]!.manaPool).flatMap(([m, n]) => Array<string>(n).fill(m)).join("");

const ALL = [lotusVale, scorchedRuins, balduvianTradingPost, soldeviExcavations, gattaAndLuzzu, mBakuJabariChieftain, saplingOfColfenor, extinctionEvent, mutinousMassacre, twinsOfDiscord, zimonesHypothesis, thanosTheMadTitan, gollumRiddleMaster, ashlingsPrerogative, gixsCommand, starscream, thunderousVelocipede, kiboUktabiPrince, botanicalBrawler, wolverineBestThereIs, elvishGuidance, ringwraiths, slimeAgainstHumanity, morningtidesLight];

describe("round 188", () => {
  it("all compile", () => supported(...ALL));

  it("Lotus Vale enters only by sacrificing two untapped lands, chosen together", () => {
    let { s, ap, ids } = setup([lotusVale]);
    const keep = lands(s, ap).slice(0, 3);
    tapAllBut(s, ap, keep);
    s = act(s, { type: "playLand", player: ap, objectId: ids[0]! });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "sacrifice", count: 2 });
    if (s.pending?.kind !== "pickPermanents") throw new Error("no pick");
    // Only the untapped ones, not Lotus Vale itself.
    expect([...s.pending.options].sort()).toEqual([...keep].sort());
    expect(() => act(s, { type: "pickPermanents", player: ap, ids: [keep[0]!] })).toThrow();
    s = act(s, { type: "pickPermanents", player: ap, ids: [keep[0]!, keep[1]!] });
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect([zone(s, keep[0]!), zone(s, keep[1]!), zone(s, keep[2]!)]).toEqual(["graveyard", "graveyard", "battlefield"]);
  });

  it("Scorched Ruins with exactly two untapped lands sacrifices both; with one, it goes to the graveyard and nothing is sacrificed", () => {
    let { s, ap, ids } = setup([scorchedRuins]);
    const two = lands(s, ap).slice(0, 2);
    tapAllBut(s, ap, two);
    s = act(s, { type: "playLand", player: ap, objectId: ids[0]! });
    expect(s.pending).toBeFalsy();
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(two.map((id) => zone(s, id))).toEqual(["graveyard", "graveyard"]);
    s = passUntil(passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]), "main1", ap);
    const again = into(s, ap, scorchedRuins, "hand");
    const one = lands(s, ap).filter((id) => id !== ids[0]).slice(0, 1);
    tapAllBut(s, ap, one);
    const before = lands(s, ap).length;
    s = act(s, { type: "playLand", player: ap, objectId: again });
    expect(zone(s, again)).toBe("graveyard");
    expect(lands(s, ap)).toHaveLength(before);
  });

  it("Balduvian Trading Post and Soldevi Excavations need an untapped Mountain / Island", () => {
    let { s, ap, ids } = setup([balduvianTradingPost, soldeviExcavations]);
    const mountains = lands(s, ap, "Mountain");
    tapAllBut(s, ap, [mountains[0]!, ...lands(s, ap, "Island")]);
    // One untapped Mountain: it's the one sacrificed, with no question.
    s = act(s, { type: "playLand", player: ap, objectId: ids[0]! });
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(zone(s, mountains[0]!)).toBe("graveyard");
    s = passUntil(passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]), "main1", ap);
    for (const id of lands(s, ap, "Island")) s.objects[id]!.tapped = true;
    s = act(s, { type: "playLand", player: ap, objectId: ids[1]! });
    expect(zone(s, ids[1]!)).toBe("graveyard");
  });

  it("bots play Lotus Vale only with five or more lands and two untapped ones", () => {
    let { s, ap, ids } = setup([lotusVale]);
    // Only Lotus Vale in hand: it's played last of all lands.
    s.players[ap]!.hand = [ids[0]!];
    expect(botActions(s, ap).some((a) => a.type === "playLand" && a.objectId === ids[0])).toBe(true);
    for (const id of lands(s, ap).slice(4)) {
      s.battlefield.splice(s.battlefield.indexOf(id), 1);
      delete s.objects[id];
    }
    invalidateCharacteristics(s);
    expect(botActions(s, ap).some((a) => a.type === "playLand" && a.objectId === ids[0])).toBe(false);
  });

  it("Gatta and Luzzu: damage to the chosen creature this turn is prevented and becomes +1/+1 counters", () => {
    let { s, ap, ids } = setup([gattaAndLuzzu, shock, shock]);
    const b = putOnBattlefield(s, ap, bear());
    s = choose(resolveAll(run(s, planCast(s, ap, ids[0]!))), [tgt(b)]);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(b)])));
    expect(zone(s, b)).toBe("battlefield");
    expect(counters(s, b)).toBe(2);
    expect(s.objects[b]!.damage).toBe(0);
    expect(pt(s, b)).toEqual([4, 4]);
    // Only this turn.
    const nextP = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    s = passUntil(s, "main1", nextP);
    s.objects[ids[2]!]!.controller = ap;
    s = passUntil(s, "main1", ap);
    s = resolveAll(run(s, planCast(s, ap, ids[2]!, [tgt(b)])));
    expect(counters(s, b)).toBe(2);
    expect(s.objects[b]!.damage).toBe(2);
  });

  it("M'Baku: with no monarch, target opponent becomes the monarch at your end step; creatures attacking the monarch get +1/+1 and trample", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, mBakuJabariChieftain);
    s = passUntil(s, "end", ap);
    s = choose(s, [player(opp)]);
    expect(s.monarch).toBe(opp);
    const other = s.turnOrder[(s.turnOrder.indexOf(ap) + 2) % 4]!;
    s = passUntil(s, "main1", ap);
    const a = putOnBattlefield(s, ap, bear());
    const c = putOnBattlefield(s, ap, bear());
    s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }, { attacker: c, defender: other }] });
    s = resolveAll(s);
    expect(pt(s, a)).toEqual([3, 3]);
    expect(objHasKeyword(s, s.objects[a]!, "Trample")).toBe(true);
    expect(pt(s, c)).toEqual([2, 2]);
  });

  it("Starscream, Seeker Leader: combat damage to a player when there's no monarch makes that player the monarch", () => {
    let { s, ap, opp } = setup([]);
    const st = putOnBattlefield(s, ap, starscream);
    s.objects[st]!.face = 1;
    invalidateCharacteristics(s);
    s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: st, defender: opp }] });
    s = resolveAll(passUntil(s, "combatDamage", ap));
    s = resolveAll(s);
    expect(s.monarch).toBe(opp);
  });

  it("Sapling of Colfenor: a revealed creature card gains you its toughness, loses you its power, then goes to your hand", () => {
    let { s, ap, opp } = setup([]);
    const sap = putOnBattlefield(s, ap, saplingOfColfenor);
    const top = into(s, ap, card("Test Wall", "Creature — Wall", "{2}", { cmc: 2, power: "1", toughness: "5" }), "library");
    const me = life(s, ap);
    s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: sap, defender: opp }] });
    s = resolveAll(s);
    expect(life(s, ap)).toBe(me + 5 - 1);
    expect(zone(s, top)).toBe("hand");
  });

  it("Sapling of Colfenor: a noncreature card stays on top", () => {
    let { s, ap, opp } = setup([]);
    const sap = putOnBattlefield(s, ap, saplingOfColfenor);
    const top = into(s, ap, card("Test Relic", "Artifact", "{1}", { cmc: 1 }), "library");
    const me = life(s, ap);
    s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: sap, defender: opp }] });
    s = resolveAll(s);
    expect(life(s, ap)).toBe(me);
    expect(s.players[ap]!.library[0]).toBe(top);
  });

  it("Extinction Event exiles each creature with mana value of the chosen quality; zero is even", () => {
    let { s, ap, ids, opp } = setup([extinctionEvent]);
    const zero = putOnBattlefield(s, opp, mvCreature(0));
    const one = putOnBattlefield(s, opp, mvCreature(1));
    const two = putOnBattlefield(s, ap, mvCreature(2));
    const three = putOnBattlefield(s, ap, mvCreature(3));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "parity", options: ["odd", "even"] });
    s = option(s, "even");
    expect([zero, one, two, three].map((id) => zone(s, id))).toEqual(["exile", "battlefield", "exile", "battlefield"]);
  });

  it("Mutinous Massacre destroys the chosen quality, then you gain control of the rest, untapped and with haste", () => {
    let { s, ap, ids, opp } = setup([mutinousMassacre]);
    const one = putOnBattlefield(s, opp, mvCreature(1));
    const two = putOnBattlefield(s, opp, mvCreature(2), { sick: true });
    s.objects[two]!.tapped = true;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    s = option(s, "odd");
    expect(zone(s, one)).toBe("graveyard");
    expect(controllerOf(s, s.objects[two]!)).toBe(ap);
    expect(s.objects[two]!.tapped).toBe(false);
    expect(objHasKeyword(s, s.objects[two]!, "Haste")).toBe(true);
  });

  it("Twins of Discord: whenever you attack, creatures with mana value of the chosen quality can't block this turn", () => {
    let { s, ap, opp } = setup([]);
    const t = putOnBattlefield(s, ap, twinsOfDiscord);
    const odd = putOnBattlefield(s, opp, mvCreature(3));
    const even = putOnBattlefield(s, opp, mvCreature(2));
    s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: t, defender: opp }] });
    s = resolveAll(s);
    s = option(s, "odd");
    s = passUntil(s, "declareBlockers", ap);
    for (let i = 0; i < 10 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: odd, attacker: t }] })).toThrow();
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: even, attacker: t }] });
    expect(s.objects[even]!.blocking).toBeDefined();
  });

  it("Twins of Discord: other colorless creatures you control have bloodthirst 2", () => {
    let { s, ap, ids, opp } = setup([shock]);
    putOnBattlefield(s, ap, twinsOfDiscord);
    const colorless = card("Test Construct", "Artifact Creature — Construct", "{2}", { cmc: 2, power: "1", toughness: "1" });
    const green = card("Test Elf", "Creature — Elf", "{1}{G}", { cmc: 2, power: "1", toughness: "1", colors: ["G"] });
    const [c, g] = [into(s, ap, colorless, "hand"), into(s, ap, green, "hand")];
    s = resolveAll(run(s, planCast(s, ap, c)));
    expect(counters(s, c)).toBe(0);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    const c2 = into(s, ap, colorless, "hand");
    s = resolveAll(run(s, planCast(s, ap, c2)));
    s = resolveAll(run(s, planCast(s, ap, g)));
    expect([counters(s, c2), counters(s, g)]).toEqual([2, 0]);
  });

  it("Zimone's Hypothesis: a +1/+1 counter on any creature first, then each creature with power of the chosen quality returns", () => {
    let { s, ap, ids, opp } = setup([zimonesHypothesis]);
    const theirs = putOnBattlefield(s, opp, mvCreature(2, 2));
    const mine = putOnBattlefield(s, ap, mvCreature(3, 3));
    const other = putOnBattlefield(s, opp, mvCreature(4, 4));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "counters" });
    if (s.pending?.kind !== "pickPermanents") throw new Error("no pick");
    expect(s.pending.options).toEqual(expect.arrayContaining([theirs, mine, other]));
    s = resolveAll(act(s, { type: "pickPermanents", player: ap, ids: [theirs] }));
    s = option(s, "odd");
    expect([zone(s, theirs), zone(s, mine), zone(s, other)]).toEqual(["hand", "hand", "battlefield"]);
  });

  it("Gollum: as it enters you choose odd or even; an opponent's spell of that quality triggers it, others don't", () => {
    let { s, ap, ids, opp } = setup([gollumRiddleMaster]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "parity" });
    s = option(s, "odd");
    const g = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Gollum, Riddle Master")!;
    expect(s.objects[g]!.chosen?.parity).toBe("odd");
    for (const l of lands(s, ap, "Mountain")) s.objects[l]!.controller = opp;
    invalidateCharacteristics(s);
    const odd = into(s, opp, card("Test Bolt", "Instant", "{R}", { cmc: 1, oracleText: "This spell deals 1 damage to any target." }), "hand");
    const even = into(s, opp, card("Test Blast", "Instant", "{1}{R}", { cmc: 2, oracleText: "This spell deals 1 damage to any target." }), "hand");
    for (let i = 0; i < 10 && waitingOn(s) !== opp; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = run(s, planCast(s, opp, even, [player(ap)]));
    expect(s.pending).toBeFalsy();
    expect(s.stack.filter((i) => i.kind === "ability")).toHaveLength(0);
    s = resolveAll(s);
    for (let i = 0; i < 10 && waitingOn(s) !== opp; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = run(s, planCast(s, opp, odd, [player(ap)]));
    expect(s.pending).toMatchObject({ kind: "chooseModes", sourceId: g });
  });

  it("Ashling's Prerogative: creatures of the chosen quality have haste, the others enter tapped", () => {
    let { s, ap, ids } = setup([ashlingsPrerogative]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    s = option(s, "even");
    const even = into(s, ap, mvCreature(2), "hand");
    const odd = into(s, ap, mvCreature(1), "hand");
    s = resolveAll(run(s, planCast(s, ap, even)));
    s = resolveAll(run(s, planCast(s, ap, odd)));
    expect(objHasKeyword(s, s.objects[even]!, "Haste")).toBe(true);
    expect(s.objects[even]!.tapped).toBe(false);
    expect(objHasKeyword(s, s.objects[odd]!, "Haste")).toBe(false);
    expect(s.objects[odd]!.tapped).toBe(true);
  });

  it("Gix's Command: two +1/+1 counters on up to one creature, any player's, with lifelink; destroy each creature with power 2 or less", () => {
    let { s, ap, ids, opp } = setup([gixsCommand]);
    const big = putOnBattlefield(s, opp, mvCreature(2, 1));
    const small = putOnBattlefield(s, opp, mvCreature(2, 2));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, undefined, [0, 1])));
    if (s.pending?.kind !== "pickPermanents") throw new Error(`no pick: ${s.pending?.kind}`);
    s = resolveAll(act(s, { type: "pickPermanents", player: ap, ids: [big] }));
    expect(counters(s, big)).toBe(2);
    expect(objHasKeyword(s, s.objects[big]!, "Lifelink")).toBe(true);
    expect(zone(s, big)).toBe("battlefield");
    expect(zone(s, small)).toBe("graveyard");
  });

  it("Thunderous Velocipede: other creatures and Vehicles you control enter with one +1/+1 counter at mana value 4 or less, three otherwise", () => {
    let { s, ap, opp } = setup([]);
    const v = putOnBattlefield(s, ap, thunderousVelocipede);
    const small = into(s, ap, mvCreature(4), "hand");
    const big = into(s, ap, mvCreature(5), "hand");
    const theirs = into(s, opp, mvCreature(2), "hand");
    s.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 9, C: 0 } as never;
    for (const id of [small, big]) s = resolveAll(run(s, planCast(s, ap, id)));
    expect([counters(s, small), counters(s, big), counters(s, v)]).toEqual([1, 3, 0]);
    const vehicle = into(s, ap, card("Test Wagon", "Artifact — Vehicle", "{6}", { cmc: 6, power: "3", toughness: "3", oracleText: "Crew 1" }), "hand");
    const rock = into(s, ap, card("Test Rock", "Artifact", "{2}", { cmc: 2 }), "hand");
    s.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 8 } as never;
    for (const id of [vehicle, rock]) s = resolveAll(run(s, planCast(s, ap, id)));
    expect([counters(s, vehicle), counters(s, rock)]).toEqual([3, 0]);
    const other = putOnBattlefield(s, opp, mvCreature(2));
    expect(counters(s, other)).toBe(0);
    expect(zone(s, theirs)).toBe("hand");
  });

  it("Kibo: each player creates a Banana; an opponent's artifact dying puts +1/+1 counters on your Apes and Monkeys; attacking makes the defender sacrifice an artifact", () => {
    let { s, ap, opp } = setup([]);
    const k = putOnBattlefield(s, ap, kiboUktabiPrince);
    s = resolveAll(run(s, planActivate(s, ap, k, 0)));
    const bananas = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Banana");
    expect(bananas.map((id) => controllerOf(s, s.objects[id]!)).sort()).toEqual([...s.turnOrder].sort());
    expect(characteristics(s, s.objects[bananas[0]!]!).types).toEqual(["Artifact"]);
    expect(characteristics(s, s.objects[bananas[0]!]!).colors).toEqual([]);
    const theirs = bananas.find((id) => controllerOf(s, s.objects[id]!) === opp)!;
    s.objects[k]!.tapped = false;
    s = passUntil(s, "declareAttackers", ap);
    s = resolveAll(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: k, defender: opp }] }));
    expect(s.objects[theirs]?.zone ?? "gone").not.toBe("battlefield");
    expect(counters(s, k)).toBe(1);
  });

  it("Botanical Brawler: the first +1/+1 counters put on each other permanent you control this turn, entering with them included", () => {
    let { s, ap, ids } = setup([botanicalBrawler, growth, growth, growth]);
    s.players[ap]!.manaPool = { W: 1, U: 0, B: 0, R: 0, G: 3, C: 0 } as never;
    const b = putOnBattlefield(s, ap, bear());
    const c = putOnBattlefield(s, ap, bear());
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(b)])));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(counters(s, ids[0]!)).toBe(2);
    // Counters were already put on the first bear this turn, before Brawler was here.
    s = resolveAll(run(s, planCast(s, ap, ids[2]!, [tgt(b)])));
    expect(counters(s, ids[0]!)).toBe(2);
    s = resolveAll(run(s, planCast(s, ap, ids[3]!, [tgt(c)])));
    expect(counters(s, ids[0]!)).toBe(3);
    // A creature entering with a +1/+1 counter counts.
    const entering = into(s, ap, card("Test Hatchling", "Creature — Elf", "{G}", { cmc: 1, power: "0", toughness: "0", oracleText: "This creature enters with a +1/+1 counter on it." }), "hand");
    s.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 1, C: 0 } as never;
    s = resolveAll(run(s, planCast(s, ap, entering)));
    expect([counters(s, entering), counters(s, ids[0]!)]).toEqual([1, 4]);
  });

  it("Wolverine deals double damage and grows at end step only after damaging another creature", () => {
    let { s, ap, opp, ids } = setup([fight]);
    const w = putOnBattlefield(s, ap, wolverineBestThereIs);
    const big = putOnBattlefield(s, opp, card("Test Wall", "Creature — Wall", "{4}", { cmc: 4, power: "1", toughness: "5" }));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(w), tgt(big)])));
    expect(s.objects[big]!.damage).toBe(4);
    expect(s.objects[w]!.damage).toBe(1);
    s = resolveAll(passUntil(s, "end", ap));
    expect(counters(s, w)).toBe(1);
    // A turn with only damage to a player: no counter.
    s = passUntil(s, "main1", ap);
    const life0 = life(s, opp);
    s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: w, defender: opp }] });
    s = resolveAll(passUntil(s, "combatDamage", ap));
    expect(life(s, opp)).toBe(life0 - 6);
    s = resolveAll(passUntil(s, "end", ap));
    expect(counters(s, w)).toBe(1);
  });

  it("Elvish Guidance: the enchanted land adds an additional {G} for each Elf on the battlefield, anyone's", () => {
    const { s: s0, ap, opp } = setup([]);
    tapAllBut(s0, ap, []);
    const f = putOnBattlefield(s0, ap, card("Forest", "Basic Land — Forest"));
    const eg = putOnBattlefield(s0, ap, elvishGuidance);
    s0.objects[eg]!.attachedTo = f;
    invalidateCharacteristics(s0);
    expect(pool(act(s0, tapFor(ap, f, "G")), ap)).toBe("G");
    // Two Elves: one yours, one an opponent's.
    putOnBattlefield(s0, ap, elf());
    putOnBattlefield(s0, opp, elf("Their Elf"));
    const s = act(s0, tapFor(ap, f, "G"));
    expect(pool(s, ap)).toBe("GGG");
  });

  it("Ringwraiths: when the Ring tempts you, it returns from your graveyard to your hand", () => {
    let { s, ap, ids } = setup([birthdayEscape]);
    const rw = into(s, ap, ringwraiths, "graveyard");
    s.players[ap]!.manaPool = { W: 0, U: 1, B: 0, R: 0, G: 0, C: 0 } as never;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.players[ap]!.ring).toMatchObject({ tempted: 1 });
    expect(zone(s, rw)).toBe("hand");
  });

  it("Ringwraiths enters: target opponent's creature gets -3/-3, and a legendary one's controller loses 3 life", () => {
    let { s, ap, opp } = setup([]);
    const legend = putOnBattlefield(s, opp, card("Test Legend", "Legendary Creature — Human", "{3}", { cmc: 3, power: "4", toughness: "4" }));
    const rw = into(s, ap, ringwraiths, "hand");
    s.players[ap]!.manaPool = { W: 0, U: 0, B: 6, R: 0, G: 0, C: 0 } as never;
    s = choose(resolveAll(run(s, planCast(s, ap, rw))), [tgt(legend)]);
    expect(pt(s, legend)).toEqual([1, 1]);
    expect(life(s, opp)).toBe(37);
  });

  it("Slime Against Humanity counts your Oozes and Slimes in exile and in your graveyard, face up, plus two", () => {
    let { s, ap, ids, opp } = setup([slimeAgainstHumanity]);
    const ooze = card("Test Ooze", "Creature — Ooze", "{G}", { cmc: 1, power: "1", toughness: "1", colors: ["G"] });
    into(s, ap, slimeAgainstHumanity, "graveyard");
    into(s, ap, ooze, "graveyard");
    const exiled = into(s, ap, slimeAgainstHumanity, "graveyard");
    s.players[ap]!.graveyard.splice(s.players[ap]!.graveyard.indexOf(exiled), 1);
    s.objects[exiled]!.zone = "exile";
    s.players[ap]!.exile.push(exiled);
    const down = into(s, ap, ooze, "graveyard");
    s.players[ap]!.graveyard.splice(s.players[ap]!.graveyard.indexOf(down), 1);
    Object.assign(s.objects[down]!, { zone: "exile", faceDown: true });
    s.players[ap]!.exile.push(down);
    into(s, opp, ooze, "graveyard");
    into(s, ap, bear(), "graveyard");
    s.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 3, C: 0 } as never;
    const before = new Set(s.battlefield);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    const token = s.battlefield.find((id) => !before.has(id))!;
    expect(characteristics(s, s.objects[token]!).subtypes).toEqual(["Ooze"]);
    // 2 + the Slime and the Ooze in your graveyard + the face-up Slime in exile; not the one being cast (rulings).
    expect(counters(s, token)).toBe(5);
    expect(pt(s, token)).toEqual([5, 5]);
  });

  it("Morningtide's Light exiles creatures until the next end step, prevents damage to you until your next turn, and exiles itself", () => {
    let { s, ap, ids, opp } = setup([morningtidesLight]);
    const mine = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    s.players[ap]!.manaPool = { W: 1, U: 0, B: 0, R: 0, G: 3, C: 0 } as never;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(mine), tgt(theirs)])));
    expect([zone(s, mine), zone(s, theirs), zone(s, ids[0]!)]).toEqual(["exile", "exile", "exile"]);
    s = resolveAll(passUntil(s, "end", ap));
    const back = s.battlefield.filter((id) => ["Grizzly Bears", "Their Bear"].includes(s.cards[s.objects[id]!.cardId]!.name));
    expect(back.map((id) => [controllerOf(s, s.objects[id]!), s.objects[id]!.tapped]).sort()).toEqual([[ap, true], [opp, true]].sort());
    // An opponent's attack the next turn deals you nothing.
    const nextP = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    s = passUntil(s, "main1", nextP);
    const life0 = life(s, ap);
    const atk = putOnBattlefield(s, nextP, bear({ name: "Attacker" }));
    s = act(passUntil(s, "declareAttackers", nextP), { type: "declareAttackers", player: nextP, attacks: [{ attacker: atk, defender: ap }] });
    s = resolveAll(passUntil(s, "combatDamage", nextP));
    expect(life(s, ap)).toBe(life0);
    // Your next turn: it's over.
    s = passUntil(s, "main1", ap);
    s.objects[ids[0]!]!.zone = "exile";
    const shockId = into(s, opp, shock, "hand");
    s.players[opp]!.manaPool = { W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 } as never;
    s = passUntil(s, "main1", opp);
    s.players[opp]!.manaPool = { W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 } as never;
    const l1 = life(s, ap);
    s = resolveAll(run(s, planCast(s, opp, shockId, [player(ap)])));
    expect(life(s, ap)).toBe(l1 - 2);
  });
});
