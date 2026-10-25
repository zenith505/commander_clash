// Round 156: the most played cards, in popularity order, starting with Ultron, Artificial Malevolence.

import { describe, expect, it } from "vitest";
import { act, addEffect, bear, card, passUntil, pt, putOnBattlefield, setup, swamp } from "./helpers";
import { abilitiesOf, abilityProblem, blockProblem, castProblem, characteristics, compileCard, invalidateCharacteristics, isFullySupported, objHasKeyword, parseManaCost, planActivate, planCast, planMana, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
/** Passes until a "you may pay" question, then pays `cost` and says yes. */
const payMay = (s: GameState, pid: PlayerId, cost: string) => {
  for (let i = 0; i < 20 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(s.pending?.kind).toBe("chooseMay");
  for (const a of planMana(s, pid, parseManaCost(cost))!) s = act(s, a);
  return resolveAll(act(s, { type: "chooseMay", player: pid, yes: true }));
};
/** Passes to the declare attackers question of this turn. */
const toAttack = (s: GameState) => {
  for (let i = 0; i < 40 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(s.pending?.kind).toBe("declareAttackers");
  return s;
};
/** No blocks, then passes until combat damage is done; "you may" questions get `yes`. */
const throughDamage = (s: GameState) => {
  for (let i = 0; i < 40 && s.step !== "endCombat"; i++) {
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: waitingOn(s)!, blocks: [] });
    else if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes: true });
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
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
const obj = (id: string): TargetChoice => ({ kind: "object", id });
const nameOf = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const indexOf = (s: GameState, id: string, text: RegExp) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => text.test(a.text));
const mine = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && nameOf(s, id) === name);

// Real oracle text (Scryfall).
const ultron = card("Ultron, Artificial Malevolence", "Legendary Artifact Creature — Robot Villain", "{3}", {cmc: 3,power: "2",toughness: "4",oracleText: "Whenever another nontoken artifact you control enters, you may pay {2}. If you do, create a token that's a copy of it. If the token isn't a creature, it becomes a 2/2 Robot Villain creature in addition to its other types."});
const portal = card("Thran Portal", "Land — Gate", "", {cmc: 0,oracleText: "This land enters tapped unless you control two or fewer other lands.\nAs this land enters, choose a basic land type.\nThis land is the chosen type in addition to its other types.\nMana abilities of this land cost an additional 1 life to activate."});
const dust = card("Everything Comes to Dust", "Sorcery", "{7}{W}{W}{W}", {cmc: 10,keywords: ["Convoke"],oracleText: "Convoke (Your creatures can help cast this spell. Each creature you tap while casting this spell pays for {1} or one mana of that creature's color.)\nExile all creatures except those that share a creature type with a creature that convoked this spell, all artifacts, and all enchantments."});
const tannuk = card("Tannuk, Steadfast Second", "Legendary Creature — Kavu Pilot", "{2}{R}{R}", {cmc: 4,power: "3",toughness: "5",oracleText: "Other creatures you control have haste.\nArtifact cards and red creature cards in your hand have warp {2}{R}. (You may cast a card from your hand for its warp cost. Exile that permanent at the beginning of the next end step, then you may cast it from exile on a later turn.)"});
const bitter = card("Bitter Work", "Enchantment", "{1}{R}{G}", {cmc: 3,keywords: ["Exhaust","Earthbend"],oracleText: "Whenever you attack a player with one or more creatures with power 4 or greater, draw a card.\nExhaust — {4}: Earthbend 4. Activate only during your turn. (Target land you control becomes a 0/0 creature with haste that's still a land. Put four +1/+1 counters on it. When it dies or is exiled, return it to the battlefield tapped. Activate each exhaust ability only once.)"});
const mastery = card("Ugin's Mastery", "Enchantment", "{4}", {cmc: 4,keywords: ["Manifest"],oracleText: "Whenever you cast a colorless creature spell, manifest the top card of your library. (Put it onto the battlefield face down as a 2/2 creature. Turn it face up any time for its mana cost if it's a creature card.)\nWhenever you attack with creatures with total power 6 or greater, you may turn a face-down creature you control face up."});
const vats = card("V.A.T.S.", "Instant", "{2}{B}{B}", {cmc: 4,keywords: ["Split second"],oracleText: "Split second (As long as this spell is on the stack, players can't cast spells or activate abilities that aren't mana abilities.)\nChoose any number of target creatures with equal toughness. Destroy the chosen creatures."});
const evil = card("Endless Evil", "Enchantment — Aura", "{2}{U}", {cmc: 3,keywords: ["Enchant"],oracleText: "Enchant creature you control\nAt the beginning of your upkeep, create a token that's a copy of enchanted creature, except the token is 1/1.\nWhen enchanted creature dies, if that creature was a Horror, return this card to its owner's hand."});
const role = card("Reluctant Role Model", "Creature — Human Survivor", "{1}{W}", {cmc: 2,power: "2",toughness: "2",keywords: ["Lifelink","Survival"],oracleText: "Survival — At the beginning of your second main phase, if this creature is tapped, put a flying, lifelink, or +1/+1 counter on it.\nWhenever this creature or another creature you control dies, if it had counters on it, put those counters on up to one target creature."});
const jeska = card("Jeska, Thrice Reborn", "Legendary Planeswalker — Jeska", "{2}{R}", {cmc: 3,loyalty: "0",keywords: ["Triple","Partner"],oracleText: "Jeska enters with a loyalty counter on her for each time you've cast a commander from the command zone this game.\n0: Choose target creature. Until your next turn, if that creature would deal combat damage to one of your opponents, it deals triple that damage to that player instead.\n−X: Jeska deals X damage to each of up to three targets.\nJeska, Thrice Reborn can be your commander.\nPartner"});
const serpent = card("Serpent of Yawning Depths", "Enchantment Creature — Serpent", "{4}{U}{U}", {cmc: 6,power: "6",toughness: "6",oracleText: "Krakens, Leviathans, Octopuses, and Serpents you control can't be blocked except by Krakens, Leviathans, Octopuses, and Serpents."});
const cleaver = card("Cleaver Skaab", "Creature — Zombie Horror", "{3}{U}", {cmc: 4,power: "2",toughness: "4",oracleText: "{3}, {T}, Sacrifice another Zombie: Create two tokens that are copies of the sacrificed creature."});
const marisi = card("Marisi, Breaker of the Coil", "Legendary Creature — Cat Warrior", "{1}{R}{G}{W}", {cmc: 4,power: "5",toughness: "4",keywords: ["Goad"],oracleText: "Your opponents can't cast spells during combat.\nWhenever a creature you control deals combat damage to a player, goad each creature that player controls. (Until your next turn, those creatures attack each combat if able and attack a player other than you if able.)"});
const breakOpen = card("Break Open", "Instant", "{1}{R}", {cmc: 2,oracleText: "Turn target face-down creature an opponent controls face up."});
const alarmist = card("Skirk Alarmist", "Creature — Human Wizard", "{1}{R}", {cmc: 2,power: "1",toughness: "2",keywords: ["Haste"],oracleText: "Haste\n{T}: Turn target face-down creature you control face up. At the beginning of the next end step, sacrifice it."});
const rose = card("Rose, Cutthroat Raider", "Legendary Artifact Creature — Robot", "{2}{R}{R}", {cmc: 4,power: "3",toughness: "2",keywords: ["First strike","Raid"],oracleText: "First strike\nRaid — At end of combat on your turn, if you attacked this turn, create a Junk token for each opponent you attacked. (It's an artifact with \"{T}, Sacrifice this token: Exile the top card of your library. You may play that card this turn. Activate only as a sorcery.\")\nWhenever you sacrifice a Junk, add {R}."});
const wojek = card("Wojek Investigator", "Creature — Angel Detective", "{2}{W}", {cmc: 3,power: "2",toughness: "4",keywords: ["Flying","Investigate","Vigilance"],oracleText: "Flying, vigilance\nAt the beginning of your upkeep, investigate once for each opponent who has more cards in hand than you. (To investigate, create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")"});
const skirmisher = card("Angelic Skirmisher", "Creature — Angel", "{4}{W}{W}", {cmc: 6,power: "4",toughness: "4",keywords: ["Flying","Vigilance"],oracleText: "Flying\nAt the beginning of each combat, choose first strike, vigilance, or lifelink. Creatures you control gain that ability until end of turn."});
const liliana = card("Liliana the Repentant", "Legendary Creature — Human Warlock", "{1}{B}", {cmc: 2,power: "2",toughness: "2",keywords: ["Exhaust","Mill"],oracleText: "Whenever another creature or planeswalker you control enters, mill two cards.\nExhaust — {5}{B}: Return target creature or planeswalker card from your graveyard to the battlefield. Put a +1/+1 counter on Liliana. Activate only as a sorcery. (Activate each exhaust ability only once.)"});

// Supported now too, from the same pieces.
const ixidor = card("Ixidor, Reality Sculptor", "Legendary Creature — Human Wizard", "{3}{U}{U}", {cmc: 5,power: "3",toughness: "4",oracleText: "Face-down creatures get +1/+1.\n{2}{U}: Turn target face-down creature face up."});
const nosy = card("Nosy Goblin", "Creature — Goblin", "{2}{R}", {cmc: 3,power: "2",toughness: "1",oracleText: "{T}, Sacrifice this creature: Destroy target face-down creature."});
const whisperer = card("Primal Whisperer", "Creature — Elf Soldier", "{4}{G}", {cmc: 5,power: "2",toughness: "2",keywords: ["Morph"],oracleText: "This creature gets +2/+2 for each face-down creature on the battlefield.\nMorph {3}{G} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)"});
const threats = card("Threats Around Every Corner", "Enchantment", "{3}{G}", {cmc: 4,keywords: ["Manifest","Manifest dread"],oracleText: "When this enchantment enters, manifest dread.\nWhenever a face-down permanent you control enters, search your library for a basic land card, put it onto the battlefield tapped, then shuffle."});
const glitch = card("Glitch Interpreter", "Creature — Human Wizard", "{2}{U}", {cmc: 3,power: "2",toughness: "3",keywords: ["Manifest","Manifest dread"],oracleText: "When this creature enters, if you control no face-down permanents, return this creature to its owner's hand and manifest dread.\nWhenever one or more colorless creatures you control deal combat damage to a player, draw a card."});
const militant = card("Militant Angel", "Creature — Angel", "{3}{W}{W}", {cmc: 5,power: "3",toughness: "4",keywords: ["Flying","Lifelink"],oracleText: "Flying, lifelink\nWhen this creature enters, create a number of 2/2 white Knight creature tokens with vigilance equal to the number of opponents you attacked this turn."});
const vargus = card("Captain Vargus Wrath", "Legendary Creature — Orc Pirate", "{U}{R}", {cmc: 2,power: "1",toughness: "1",oracleText: "Whenever Captain Vargus Wrath attacks, Pirates you control get +1/+1 until end of turn for each time you've cast a commander from the command zone this game."});
const fastForward = card("Fast Forward", "Sorcery", "{4}{R}", {cmc: 5,keywords: ["Goad"],oracleText: "This spell costs {1} less to cast for each opponent you attacked this turn.\nGoad all creatures your opponents control. (Until your next turn, those creatures attack each combat if able and attack a player other than you if able.)"});
const bertha = card("Big Bertha", "Legendary Creature — Mutant Hero", "{X}{G}", {cmc: 1,power: "1",toughness: "1",keywords: ["Vigilance"],oracleText: "Vigilance\nBig Bertha enters with X +1/+1 counters on her.\n{1}{G}, {T}: Put a +1/+1 counter on Big Bertha."});
const hulk = card("Hulk, Strongest There Is", "Legendary Creature — Gamma Berserker Hero", "{2}{G}{G}", {cmc: 4,power: "3",toughness: "3",keywords: ["Trample","Double"],oracleText: "Trample\nHulk enters with a +1/+1 counter on him.\nAt the beginning of your upkeep, double the number of +1/+1 counters on each Gamma creature you control."});
const morlun = card("Morlun, Devourer of Spiders", "Legendary Creature — Vampire Villain", "{X}{B}{B}", {cmc: 2,power: "2",toughness: "1",keywords: ["Lifelink"],oracleText: "Lifelink\nMorlun enters with X +1/+1 counters on him.\nWhen Morlun enters, he deals X damage to target opponent."});
const jirina = card("Jirina Kudro", "Legendary Creature — Human Soldier", "{1}{R}{W}{B}", {cmc: 4,power: "3",toughness: "3",oracleText: "When Jirina Kudro enters, create a 1/1 white Human Soldier creature token for each time you've cast a commander from the command zone this game.\nOther Humans you control get +2/+0."});
const pipes = card("They Came from the Pipes", "Enchantment", "{4}{U}", {cmc: 5,keywords: ["Manifest","Manifest dread"],oracleText: "When this enchantment enters, manifest dread twice. (To manifest dread, look at the top two cards of your library. Put one onto the battlefield face down as a 2/2 creature and the other into your graveyard. Turn it face up any time for its mana cost if it's a creature card.)\nWhenever a face-down creature you control enters, draw a card."});
const fontOfMagic = card("Font of Magic", "Enchantment", "{3}{U}", {cmc: 4,oracleText: "Instant and sorcery spells you cast cost {1} less to cast for each time you've cast a commander from the command zone this game."});
const blaze = card("Test Blaze", "Sorcery", "{3}{R}", { cmc: 4, oracleText: "Test Blaze deals 4 damage to any target." });

const rock = card("Test Rock", "Artifact", "{2}", { cmc: 2, oracleText: "{T}: Add {C}." });
const golem = card("Test Golem", "Artifact Creature — Golem", "{2}", { cmc: 2, power: "3", toughness: "3" });
const murder = card("Test Murder", "Instant", "{B}", { cmc: 1, oracleText: "Destroy target creature." });
const shock = card("Test Shock", "Instant", "{R}", { cmc: 1, oracleText: "Test Shock deals 2 damage to any target." });
const ogre = card("Test Ogre", "Creature — Ogre", "{3}{R}", { cmc: 4, power: "4", toughness: "4" });
const zombie = card("Test Zombie", "Creature — Zombie", "{1}{B}", { cmc: 2, power: "3", toughness: "1" });
const horror = card("Test Horror", "Creature — Horror", "{1}{U}", { cmc: 2, power: "2", toughness: "2" });
const kraken = card("Test Kraken", "Creature — Kraken", "{3}{U}", { cmc: 4, power: "4", toughness: "4" });
const octopus = card("Test Octopus", "Creature — Octopus", "{1}{U}", { cmc: 2, power: "1", toughness: "1" });
const sliver = card("Test Sliver", "Creature — Sliver", "{1}{W}", { cmc: 2, power: "2", toughness: "2" });
const shrine = card("Test Shrine", "Enchantment", "{1}{W}", { cmc: 2 });
const zombieGolem = card("Test Zombie Golem", "Artifact Creature — Zombie Golem", "{3}", { cmc: 3, power: "2", toughness: "2" });
const bolt = card("Test Bolt", "Sorcery", "{R}", { cmc: 1, oracleText: "Test Bolt deals 3 damage to any target." });
const faceDown = (s: GameState, id: string) => {
  s.objects[id]!.faceDown = "manifest";
  invalidateCharacteristics(s);
  return id;
};

describe("round 156 cards", () => {
  it("are fully supported", () => supported(ultron, portal, dust, tannuk, bitter, mastery, vats, evil, role, jeska, serpent, cleaver, marisi, liliana, breakOpen, alarmist, rose, wojek, skirmisher));
  it("and these, from the same pieces", () => supported(ixidor, nosy, whisperer, threats, glitch, militant, vargus, fastForward, bertha, hulk, morlun, jirina, pipes, fontOfMagic));
  it("but not a face-down creature spell's cost reduction yet (Dream Chisel)", () => {
    const chisel = card("Dream Chisel", "Artifact", "{2}", { cmc: 2, oracleText: "Face-down creature spells you cast cost {1} less to cast." });
    expect(isFullySupported(chisel)).toBe(false);
  });
});

describe("Ultron, Artificial Malevolence", () => {
  it("pays {2} to copy another nontoken artifact; a noncreature copy becomes a 2/2 Robot Villain creature too", () => {
    const { s: s0, ap, ids } = setup([rock, golem]);
    putOnBattlefield(s0, ap, ultron);
    let s = payMay(run(s0, planCast(s0, ap, ids[0]!)), ap, "{2}");
    const copies = mine(s, ap, "Test Rock").filter((id) => s.objects[id]!.isToken);
    expect(copies).toHaveLength(1);
    const ch = characteristics(s, s.objects[copies[0]!]!);
    expect(ch.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(ch.subtypes).toEqual(expect.arrayContaining(["Robot", "Villain"]));
    expect(pt(s, copies[0]!)).toBe("2/2");
    // The original stays a noncreature artifact.
    expect(characteristics(s, s.objects[ids[0]!]!).types).toEqual(["Artifact"]);
    // An artifact creature's copy keeps its own power and toughness.
    s = payMay(run(s, planCast(s, ap, ids[1]!)), ap, "{2}");
    const g = mine(s, ap, "Test Golem").filter((id) => s.objects[id]!.isToken);
    expect(g).toHaveLength(1);
    expect(pt(s, g[0]!)).toBe("3/3");
    expect(characteristics(s, s.objects[g[0]!]!).subtypes).toEqual(["Golem"]);
  });

  it("makes nothing if you don't pay", () => {
    const { s: s0, ap, ids } = setup([rock]);
    putOnBattlefield(s0, ap, ultron);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)), false);
    expect(mine(s, ap, "Test Rock")).toHaveLength(1);
  });
});

describe("Thran Portal", () => {
  it("enters tapped with three or more other lands, is the chosen basic type, and its mana abilities cost 1 life", () => {
    const { s: s0, ap } = setup([]);
    const id = into(s0, ap, portal, "hand");
    let s = act(s0, { type: "playLand", player: ap, objectId: id });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "basicLandType" });
    s = act(s, { type: "chooseOption", player: ap, choice: "Swamp" });
    expect(s.objects[id]!.tapped).toBe(true);
    const ch = characteristics(s, s.objects[id]!);
    expect(ch.subtypes).toEqual(expect.arrayContaining(["Gate", "Swamp"]));
    s.objects[id]!.tapped = false;
    const life = s.players[ap]!.life;
    s = act(s, { type: "activateMana", player: ap, objectId: id, mana: "B" });
    expect(s.players[ap]!.life).toBe(life - 1);
    expect(s.players[ap]!.manaPool.B).toBe(1);
  });

  it("enters untapped with two or fewer other lands", () => {
    const { s: s0, ap } = setup([]);
    const lands = s0.battlefield.filter((x) => s0.objects[x]!.controller === ap && characteristics(s0, s0.objects[x]!).types.includes("Land"));
    for (const l of lands.slice(2)) {
      s0.battlefield.splice(s0.battlefield.indexOf(l), 1);
      s0.objects[l]!.zone = "graveyard";
      s0.players[ap]!.graveyard.push(l);
    }
    invalidateCharacteristics(s0);
    const id = into(s0, ap, portal, "hand");
    let s = act(s0, { type: "playLand", player: ap, objectId: id });
    s = act(s, { type: "chooseOption", player: ap, choice: "Island" });
    expect(s.objects[id]!.tapped).toBe(false);
  });
});

describe("Tannuk, Steadfast Second", () => {
  it("gives artifact cards and red creature cards in your hand warp {2}{R}; the permanent is exiled at the next end step", () => {
    const { s: s0, ap, ids } = setup([ogre, rock, bear()]);
    putOnBattlefield(s0, ap, tannuk);
    // A green creature card doesn't get warp.
    expect(castProblem(s0, ap, ids[2]!, undefined, undefined, undefined, undefined, undefined, { alt: "grantedWarp" })).toMatch(/doesn't have/);
    const lands = (s: GameState) => s.battlefield.filter((x) => s.objects[x]!.controller === ap && !s.objects[x]!.tapped && characteristics(s, s.objects[x]!).types.includes("Land")).length;
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { alt: "grantedWarp" }));
    expect(lands(s0) - lands(s)).toBe(3);
    s = resolveAll(s);
    expect(zone(s, ids[0]!)).toBe("battlefield");
    // Haste from Tannuk.
    expect(objHasKeyword(s, s.objects[ids[0]!]!, "Haste")).toBe(true);
    s = run(s, planCast(s, ap, ids[1]!, undefined, undefined, undefined, undefined, { alt: "grantedWarp" }));
    s = resolveAll(s);
    expect(zone(s, ids[1]!)).toBe("battlefield");
    s = resolveAll(passUntil(s, "end", ap));
    expect(zone(s, ids[0]!)).toBe("exile");
    expect(zone(s, ids[1]!)).toBe("exile");
    // Cast from exile on a later turn, for its mana cost.
    s = passUntil(s, "main1", ap);
    expect(planCast(s, ap, ids[0]!)).not.toBeNull();
  });

  it("doesn't grant warp to cards in other players' hands, or once Tannuk is gone", () => {
    const { s: s0, ap, opp, ids } = setup([ogre]);
    putOnBattlefield(s0, opp, tannuk);
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { alt: "grantedWarp" })).toMatch(/doesn't have/);
    const t = putOnBattlefield(s0, ap, tannuk);
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { alt: "grantedWarp" })).not.toMatch(/doesn't have/);
    s0.battlefield.splice(s0.battlefield.indexOf(t), 1);
    s0.objects[t]!.zone = "graveyard";
    s0.players[ap]!.graveyard.push(t);
    invalidateCharacteristics(s0);
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { alt: "grantedWarp" })).toMatch(/doesn't have/);
  });
});

describe("Everything Comes to Dust", () => {
  const board = (s: GameState, ap: PlayerId, opp: PlayerId) => ({
    myZombie: putOnBattlefield(s, ap, zombie),
    myOgre: putOnBattlefield(s, ap, ogre),
    zGolem: putOnBattlefield(s, ap, zombieGolem),
    rock: putOnBattlefield(s, opp, rock),
    shrine: putOnBattlefield(s, opp, shrine),
    theirZombie: putOnBattlefield(s, opp, zombie),
    theirHorror: putOnBattlefield(s, opp, horror),
  });

  it("exiles all artifacts, enchantments and creatures except those sharing a creature type with a creature that convoked it", () => {
    const { s: s0, ap, opp, ids } = setup([dust]);
    const b = board(s0, ap, opp);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, [b.myZombie])));
    expect(s.objects[b.myZombie]!.tapped).toBe(true);
    for (const id of [b.myOgre, b.zGolem, b.rock, b.shrine, b.theirHorror]) expect(zone(s, id), nameOf(s0, id)).toBe("exile");
    // The artifact Zombie goes as an artifact; the other Zombies stay.
    expect(zone(s, b.myZombie)).toBe("battlefield");
    expect(zone(s, b.theirZombie)).toBe("battlefield");
  });

  it("without convoke, exiles every creature", () => {
    const { s: s0, ap, opp, ids } = setup([dust]);
    const b = board(s0, ap, opp);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, [])));
    for (const id of Object.values(b)) expect(zone(s, id), nameOf(s0, id)).toBe("exile");
  });

  it("uses a convoking creature's types as it last existed if it has left the battlefield", () => {
    const { s: s0, ap, opp, ids } = setup([dust, murder]);
    for (let i = 0; i < 4; i++) putOnBattlefield(s0, ap, swamp);
    const b = board(s0, ap, opp);
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, [b.myZombie]));
    s = run(s, planCast(s, ap, ids[1]!, [obj(b.myZombie)]));
    s = resolveAll(s);
    expect(zone(s, b.myZombie)).toBe("graveyard");
    expect(zone(s, b.theirZombie)).toBe("battlefield");
    expect(zone(s, b.theirHorror)).toBe("exile");
  });
});

describe("V.A.T.S.", () => {
  it("destroys any number of target creatures with equal toughness", () => {
    const { s: s0, ap, opp, ids } = setup([vats]);
    const a = putOnBattlefield(s0, opp, ogre);
    const c = putOnBattlefield(s0, opp, kraken);
    const d = putOnBattlefield(s0, ap, horror);
    // Toughness 4 and 2: not together.
    expect(planCast(s0, ap, ids[0]!, [obj(a), obj(d)])).toBeNull();
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [obj(a), obj(c)])));
    expect(zone(s, a)).toBe("graveyard");
    expect(zone(s, c)).toBe("graveyard");
    expect(zone(s, d)).toBe("battlefield");
  });

  it("does nothing if the toughnesses aren't equal any more as it resolves", () => {
    const { s: s0, ap, opp, ids } = setup([vats]);
    const a = putOnBattlefield(s0, opp, ogre);
    const c = putOnBattlefield(s0, opp, kraken);
    let s = run(s0, planCast(s0, ap, ids[0]!, [obj(a), obj(c)]));
    addEffect(s, opp, [a], [{ kind: "modifyPT", power: 0, toughness: 1 }]);
    s = resolveAll(s);
    expect(zone(s, a)).toBe("battlefield");
    expect(zone(s, c)).toBe("battlefield");
  });
});

describe("Endless Evil", () => {
  it("copies the enchanted creature as a 1/1 each upkeep, and returns to hand when an enchanted Horror dies", () => {
    const { s: s0, ap, ids } = setup([evil, murder]);
    const h = putOnBattlefield(s0, ap, horror);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [obj(h)])));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(h);
    s = resolveAll(passUntil(s, "upkeep", ap));
    const copies = mine(s, ap, "Test Horror").filter((id) => s.objects[id]!.isToken);
    expect(copies).toHaveLength(1);
    expect(pt(s, copies[0]!)).toBe("1/1");
    s = passUntil(s, "main1", ap);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [obj(h)])));
    expect(zone(s, ids[0]!)).toBe("hand");
  });

  it("stays in the graveyard when the enchanted creature wasn't a Horror", () => {
    const { s: s0, ap, ids } = setup([evil, murder]);
    const o = putOnBattlefield(s0, ap, ogre);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [obj(o)])));
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [obj(o)])));
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });
});

describe("Cleaver Skaab", () => {
  it("sacrifices another Zombie to create two token copies of it", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, cleaver);
    const z = putOnBattlefield(s0, ap, zombie);
    const s = resolveAll(run(s0, planActivate(s0, ap, c, 0, [], undefined, undefined, undefined, { sacrifice: [z] })));
    expect(zone(s, z)).toBe("graveyard");
    const tokens = mine(s, ap, "Test Zombie").filter((id) => s.objects[id]!.isToken);
    expect(tokens).toHaveLength(2);
    expect(pt(s, tokens[0]!)).toBe("3/1");
  });
});

describe("Ugin's Mastery", () => {
  it("manifests when you cast a colorless creature spell", () => {
    const { s: s0, ap, ids } = setup([golem, ogre]);
    putOnBattlefield(s0, ap, mastery);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.objects[id]!.faceDown)).toHaveLength(1);
    // A colored creature spell doesn't.
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.objects[id]!.faceDown)).toHaveLength(1);
  });

  it("attacking with total power 6 or greater turns a face-down creature you control face up", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, mastery);
    const o = putOnBattlefield(s0, ap, ogre);
    const fd = faceDown(s0, putOnBattlefield(s0, ap, kraken));
    const other = faceDown(s0, putOnBattlefield(s0, ap, horror));
    faceDown(s0, putOnBattlefield(s0, opp, ogre));
    let s = toAttack(s0);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: o, defender: opp }, { attacker: fd, defender: opp }] });
    s = resolveAll(s);
    // Only your own face-down creatures, attacking or not.
    expect(s.pending).toMatchObject({ kind: "pickPermanents" });
    expect(s.pending?.kind === "pickPermanents" && [...s.pending.options].sort()).toEqual([fd, other].sort());
    s = resolveAll(act(s, { type: "pickPermanents", player: ap, ids: [fd] }));
    expect(s.objects[fd]!.faceDown).toBeFalsy();
    expect(s.objects[other]!.faceDown).toBeTruthy();
    expect(pt(s, fd)).toBe("4/4");
  });

  it("doesn't trigger below total power 6", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, mastery);
    const o = putOnBattlefield(s0, ap, ogre);
    faceDown(s0, putOnBattlefield(s0, ap, kraken));
    let s = toAttack(s0);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: o, defender: opp }] });
    expect(s.triggerQueue.length + s.stack.length).toBe(0);
  });

  it("a manifested instant or sorcery card is revealed and stays face down", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, mastery);
    const o = putOnBattlefield(s0, ap, ogre);
    const k = putOnBattlefield(s0, ap, kraken);
    const fd = faceDown(s0, putOnBattlefield(s0, ap, bolt));
    let s = toAttack(s0);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: o, defender: opp }, { attacker: k, defender: opp }] });
    // The only face-down creature is chosen; an instant card is revealed and stays face down (CR 701.40g).
    s = resolveAll(s);
    expect(s.objects[fd]!.faceDown).toBeTruthy();
    expect(pt(s, fd)).toBe("2/2");
  });
});

describe("Break Open and Skirk Alarmist", () => {
  it("Break Open turns an opponent's face-down creature face up", () => {
    const { s: s0, ap, opp, ids } = setup([breakOpen]);
    const fd = faceDown(s0, putOnBattlefield(s0, opp, kraken));
    const mineDown = faceDown(s0, putOnBattlefield(s0, ap, ogre));
    expect(planCast(s0, ap, ids[0]!, [obj(mineDown)])).toBeNull();
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [obj(fd)])));
    expect(s.objects[fd]!.faceDown).toBeFalsy();
    expect(nameOf(s, fd)).toBe("Test Kraken");
  });

  it("Skirk Alarmist turns your face-down creature face up and sacrifices it at the next end step", () => {
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, alarmist);
    const fd = faceDown(s0, putOnBattlefield(s0, ap, kraken));
    let s = resolveAll(run(s0, planActivate(s0, ap, a, 0, [obj(fd)])));
    expect(s.objects[fd]!.faceDown).toBeFalsy();
    s = resolveAll(passUntil(s, "end", ap));
    expect(zone(s, fd)).toBe("graveyard");
  });
});

describe("Bitter Work", () => {
  it("draws when you attack a player with a creature with power 4 or greater", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, bitter);
    const o = putOnBattlefield(s0, ap, ogre);
    const hand = s0.players[ap]!.hand.length;
    let s = act(toAttack(s0), { type: "declareAttackers", player: ap, attacks: [{ attacker: o, defender: opp }] });
    s = resolveAll(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("exhaust: earthbend 4, only during your turn, only once", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, bitter);
    const land = s0.battlefield.find((x) => s0.objects[x]!.controller === ap && nameOf(s0, x) === "Forest")!;
    let s = resolveAll(run(s0, planActivate(s0, ap, b, 0, [obj(land)])));
    expect(characteristics(s, s.objects[land]!).types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    expect(pt(s, land)).toBe("4/4");
    expect(objHasKeyword(s, s.objects[land]!, "Haste")).toBe(true);
    const other = s.battlefield.find((x) => s.objects[x]!.controller === ap && nameOf(s, x) === "Forest" && x !== land)!;
    expect(abilityProblem(s, ap, b, 0, [obj(other)])).not.toBeNull();
    // Not during an opponent's turn.
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const b1 = putOnBattlefield(s1, ap1, bitter);
    const l1 = s1.battlefield.find((x) => s1.objects[x]!.controller === ap1 && nameOf(s1, x) === "Forest")!;
    let t = passUntil(s1, "upkeep", opp1);
    while (t.priority !== ap1) t = act(t, { type: "passPriority", player: waitingOn(t)! });
    expect(abilityProblem(t, ap1, b1, 0, [obj(l1)])).toMatch(/can't be activated now/);
    expect(opp).toBeDefined();
  });
});

describe("Reluctant Role Model", () => {
  it("survival: if it's tapped at the beginning of your second main phase, it gets your choice of counter", () => {
    const { s: s0, ap } = setup([]);
    const r = putOnBattlefield(s0, ap, role);
    s0.objects[r]!.tapped = true;
    let s = s0;
    for (let i = 0; i < 60 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.step).toBe("main2");
    expect(s.pending).toMatchObject({ kind: "chooseOption" });
    expect(s.pending?.kind === "chooseOption" && s.pending.options).toEqual(["flying", "lifelink", "+1/+1"]);
    s = resolveAll(act(s, { type: "chooseOption", player: ap, choice: "flying" }));
    expect(s.objects[r]!.counters?.flying).toBe(1);
    expect(objHasKeyword(s, s.objects[r]!, "Flying")).toBe(true);
  });

  it("moves a dying creature's counters to up to one target creature, even its own as it dies", () => {
    const { s: s0, ap, ids } = setup([murder]);
    const r = putOnBattlefield(s0, ap, role);
    const o = putOnBattlefield(s0, ap, ogre);
    const k = putOnBattlefield(s0, ap, kraken);
    s0.objects[o]!.counters = { "+1/+1": 2, flying: 1 };
    invalidateCharacteristics(s0);
    let s = run(s0, planCast(s0, ap, ids[0]!, [obj(o)]));
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [obj(k)] }));
    expect(s.objects[k]!.counters).toMatchObject({ "+1/+1": 2, flying: 1 });
    expect(pt(s, k)).toBe("6/6");
    expect(zone(s, r)).toBe("battlefield");
  });

  it("does nothing for a creature that had no counters", () => {
    const { s: s0, ap, ids } = setup([murder]);
    putOnBattlefield(s0, ap, role);
    const o = putOnBattlefield(s0, ap, ogre);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [obj(o)])));
    expect(s.pending).toBeFalsy();
    expect(s.stack).toHaveLength(0);
  });
});

describe("Jeska, Thrice Reborn", () => {
  it("enters with a loyalty counter for each time you've cast a commander from the command zone", () => {
    const { s: s0, ap, ids } = setup([jeska]);
    const cmd = Object.keys(s0.players[ap]!.commanderCasts)[0]!;
    s0.players[ap]!.commanderCasts[cmd] = 2;
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.counters?.loyalty).toBe(2);
  });

  it("0: until your next turn, the target creature deals triple combat damage to opponents", () => {
    const { s: s0, ap, opp } = setup([]);
    const j = putOnBattlefield(s0, ap, jeska);
    s0.objects[j]!.counters = { loyalty: 1 };
    const o = putOnBattlefield(s0, ap, ogre);
    let s = resolveAll(run(s0, planActivate(s0, ap, j, 0, [obj(o)])));
    const life = s.players[opp]!.life;
    s = act(toAttack(s), { type: "declareAttackers", player: ap, attacks: [{ attacker: o, defender: opp }] });
    s = throughDamage(s);
    expect(s.players[opp]!.life).toBe(life - 12);
  });

  it("−X deals X damage to each of up to three targets", () => {
    const { s: s0, ap, opp } = setup([]);
    const j = putOnBattlefield(s0, ap, jeska);
    s0.objects[j]!.counters = { loyalty: 3 };
    const a = putOnBattlefield(s0, opp, horror);
    const life = s0.players[opp]!.life;
    const i = indexOf(s0, j, /^−X/);
    const s = resolveAll(run(s0, planActivate(s0, ap, j, i, [obj(a), { kind: "player", id: opp }, { kind: "none" }], undefined, undefined, 2)));
    expect(zone(s, a)).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life - 2);
    expect(s.objects[j]!.counters?.loyalty).toBe(1);
  });
});

describe("Serpent of Yawning Depths", () => {
  it("Krakens, Leviathans, Octopuses and Serpents you control can be blocked only by those", () => {
    const { s: s0, ap, opp } = setup([]);
    const serp = putOnBattlefield(s0, ap, serpent);
    const k = putOnBattlefield(s0, ap, kraken);
    const mineOgre = putOnBattlefield(s0, ap, ogre);
    const theirOgre = putOnBattlefield(s0, opp, ogre);
    const theirOcto = putOnBattlefield(s0, opp, octopus);
    const O = (id: string) => s0.objects[id]!;
    expect(blockProblem(s0, O(theirOgre), O(k), opp)).not.toBeNull();
    expect(blockProblem(s0, O(theirOgre), O(serp), opp)).not.toBeNull();
    expect(blockProblem(s0, O(theirOcto), O(k), opp)).toBeNull();
    expect(blockProblem(s0, O(theirOgre), O(mineOgre), opp)).toBeNull();
  });
});

describe("Marisi, Breaker of the Coil", () => {
  it("your opponents can't cast spells during combat", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, marisi);
    const m = into(s0, opp, murder, "hand");
    const mine1 = into(s0, ap, murder, "hand");
    expect(castProblem(s0, opp, m) ?? "").not.toMatch(/combat/);
    let s = toAttack(s0);
    expect(castProblem(s, opp, m)).toMatch(/combat/);
    expect(castProblem(s, ap, mine1) ?? "").not.toMatch(/combat/);
  });

  it("goads each creature a player controls when a creature you control deals combat damage to them", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, marisi);
    const o = putOnBattlefield(s0, ap, ogre);
    const theirs = putOnBattlefield(s0, opp, horror);
    let s = act(toAttack(s0), { type: "declareAttackers", player: ap, attacks: [{ attacker: o, defender: opp }] });
    s = resolveAll(throughDamage(s));
    expect(characteristics(s, s.objects[theirs]!).goadedBy).toEqual([ap]);
  });
});

describe("Liliana the Repentant", () => {
  it("mills two when another creature enters; exhaust returns a creature card and grows Liliana, once", () => {
    const { s: s0, ap } = setup([]);
    const l = putOnBattlefield(s0, ap, liliana);
    const dead = into(s0, ap, ogre, "graveyard");
    into(s0, ap, horror, "graveyard");
    const yard = s0.players[ap]!.graveyard.length;
    let s = resolveAll(run(s0, planActivate(s0, ap, l, 0, [obj(dead)])));
    expect(zone(s, dead)).toBe("battlefield");
    expect(pt(s, l)).toBe("3/3");
    // The Ogre entering milled two.
    expect(s.players[ap]!.graveyard.length).toBe(yard - 1 + 2);
    const other = s.players[ap]!.graveyard.find((id) => nameOf(s, id) === "Test Horror")!;
    expect(abilityProblem(s, ap, l, 0, [obj(other)])).not.toBeNull();
  });
});

describe("Rose, Cutthroat Raider", () => {
  it("creates a Junk for each opponent you attacked this turn; sacrificing a Junk adds {R}", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, rose);
    const o = putOnBattlefield(s0, ap, ogre);
    const k = putOnBattlefield(s0, ap, kraken);
    const h = putOnBattlefield(s0, ap, horror);
    const [o1, o2] = s0.turnOrder.filter((p) => p !== ap);
    let s = act(toAttack(s0), { type: "declareAttackers", player: ap, attacks: [{ attacker: o, defender: o1! }, { attacker: k, defender: o2! }, { attacker: h, defender: o2! }] });
    s = resolveAll(throughDamage(s));
    const junk = mine(s, ap, "Junk Token");
    expect(junk).toHaveLength(2);
    s = passUntil(s, "main2", ap);
    const top = s.players[ap]!.library[0]!;
    s = resolveAll(run(s, planActivate(s, ap, junk[0]!, 0)));
    // Mana stays in the pool until the step ends (CR 106.4).
    expect(s.players[ap]!.manaPool.R).toBe(1);
    expect(zone(s, top)).toBe("exile");
  });

  it("doesn't trigger if you didn't attack", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, rose);
    let s = toAttack(s0);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [] });
    s = resolveAll(passUntil(s, "main2", ap));
    expect(mine(s, ap, "Junk Token")).toHaveLength(0);
  });
});

describe("Wojek Investigator", () => {
  it("investigates once for each opponent with more cards in hand than you, counted as it resolves", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, wojek);
    // You keep two cards; one opponent has none (they'll draw one on their turn).
    const trim = (pid: PlayerId, keep: number) => {
      const p = s0.players[pid]!;
      for (const id of p.hand.slice(keep)) {
        s0.objects[id]!.zone = "library";
        p.library.push(id);
      }
      p.hand = p.hand.slice(0, keep);
    };
    trim(ap, 2);
    trim(s0.turnOrder.find((p) => p !== ap)!, 0);
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "upkeep", ap);
    while (!s.stack.length && s.triggerQueue.length === 0) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const expected = s.turnOrder.filter((p) => p !== ap && s.players[p]!.hand.length > s.players[ap]!.hand.length).length;
    s = resolveAll(s);
    expect(expected).toBe(2);
    expect(mine(s, ap, "Clue Token")).toHaveLength(expected);
  });
});

describe("Angelic Skirmisher", () => {
  it("at the beginning of each combat, creatures you control then gain the chosen keyword until end of turn", () => {
    const { s: s0, ap, ids } = setup([kraken]);
    putOnBattlefield(s0, ap, skirmisher);
    const o = putOnBattlefield(s0, ap, ogre);
    let s = s0;
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.step).toBe("beginCombat");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "keyword", options: ["First strike", "Vigilance", "Lifelink"] });
    s = resolveAll(act(s, { type: "chooseOption", player: ap, choice: "Lifelink" }));
    expect(objHasKeyword(s, s.objects[o]!, "Lifelink")).toBe(true);
    expect(objHasKeyword(s, s.objects[o]!, "Vigilance")).toBe(false);
    expect(ids).toHaveLength(1);
  });
});

/** Answers each library search with its first card(s), and "you may" with yes, until the stack is empty. */
const settleSearches = (s: GameState) => {
  for (let i = 0; i < 20; i++) {
    s = resolveAll(s);
    if (s.pending?.kind !== "searchLibrary") return s;
    s = act(s, { type: "searchLibrary", player: s.pending.player, found: s.pending.cards.slice(0, Math.max(1, s.pending.min)) });
  }
  return s;
};
const faceDownOf = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.objects[id]!.faceDown);

describe("face-down permanents in filters (CR 708.2)", () => {
  it("Ixidor: face-down creatures get +1/+1, and {2}{U} turns one face up", () => {
    const { s: s0, ap, opp } = setup([]);
    const ix = putOnBattlefield(s0, ap, ixidor);
    const fd = faceDown(s0, putOnBattlefield(s0, opp, kraken));
    expect(pt(s0, fd)).toBe("3/3");
    expect(pt(s0, ix)).toBe("3/4");
    const s = resolveAll(run(s0, planActivate(s0, ap, ix, 0, [obj(fd)])));
    expect(s.objects[fd]!.faceDown).toBeFalsy();
    expect(pt(s, fd)).toBe("4/4");
  });

  it("Nosy Goblin targets only a face-down creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, nosy);
    const up = putOnBattlefield(s0, opp, kraken);
    const fd = faceDown(s0, putOnBattlefield(s0, opp, ogre));
    expect(planActivate(s0, ap, g, 0, [obj(up)])).toBeNull();
    const s = resolveAll(run(s0, planActivate(s0, ap, g, 0, [obj(fd)])));
    expect(zone(s, fd)).toBe("graveyard");
  });

  it("Primal Whisperer gets +2/+2 for each face-down creature on the battlefield", () => {
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, whisperer);
    faceDown(s0, putOnBattlefield(s0, opp, kraken));
    faceDown(s0, putOnBattlefield(s0, ap, ogre));
    expect(pt(s0, w)).toBe("6/6");
  });

  it("Threats Around Every Corner and They Came from the Pipes trigger on a face-down permanent entering", () => {
    const { s: s0, ap, ids } = setup([threats]);
    putOnBattlefield(s0, ap, pipes);
    const lands = (s: GameState) => s.battlefield.filter((id) => s.objects[id]!.controller === ap && characteristics(s, s.objects[id]!).types.includes("Land")).length;
    const hand = s0.players[ap]!.hand.length;
    const s = settleSearches(run(s0, planCast(s0, ap, ids[0]!)));
    expect(faceDownOf(s, ap)).toHaveLength(1);
    // One land from Threats, one card from the Pipes (the Threats card left the hand).
    expect(lands(s)).toBe(lands(s0) + 1);
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
  });

  it("Glitch Interpreter returns to hand and manifests dread only if you control no face-down permanent", () => {
    const { s: s0, ap, ids } = setup([glitch]);
    let s = settleSearches(run(s0, planCast(s0, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("hand");
    expect(faceDownOf(s, ap)).toHaveLength(1);
    s = settleSearches(run(s, planCast(s, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(faceDownOf(s, ap)).toHaveLength(1);
  });
});

describe("opponents you attacked this turn", () => {
  const attackTwo = (s0: GameState, ap: PlayerId) => {
    const o = putOnBattlefield(s0, ap, ogre);
    const k = putOnBattlefield(s0, ap, kraken);
    const [o1, o2] = s0.turnOrder.filter((p) => p !== ap);
    let s = act(toAttack(s0), { type: "declareAttackers", player: ap, attacks: [{ attacker: o, defender: o1! }, { attacker: k, defender: o2! }] });
    return passUntil(resolveAll(throughDamage(s)), "main2", ap);
  };

  it("Militant Angel makes a Knight for each", () => {
    const { s: s0, ap, ids } = setup([militant]);
    let s = attackTwo(s0, ap);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(mine(s, ap, "Knight Token")).toHaveLength(2);
  });

  it("Fast Forward costs {1} less for each", () => {
    const { s: s0, ap, ids } = setup([fastForward]);
    const s = attackTwo(s0, ap);
    const tapped = (st: GameState) => st.battlefield.filter((id) => st.objects[id]!.controller === ap && st.objects[id]!.tapped && characteristics(st, st.objects[id]!).types.includes("Land")).length;
    const after = run(s, planCast(s, ap, ids[0]!));
    expect(tapped(after) - tapped(s)).toBe(3);
  });
});

describe("commander casts, and counters on him or her", () => {
  it("Captain Vargus Wrath: Pirates get +1/+1 for each time you've cast a commander from the command zone", () => {
    const { s: s0, ap, opp } = setup([]);
    const v = putOnBattlefield(s0, ap, vargus);
    s0.players[ap]!.commanderCasts[Object.keys(s0.players[ap]!.commanderCasts)[0]!] = 2;
    const s = resolveAll(act(toAttack(s0), { type: "declareAttackers", player: ap, attacks: [{ attacker: v, defender: opp }] }));
    expect(pt(s, v)).toBe("3/3");
  });

  it("Jirina Kudro makes a Human Soldier for each time", () => {
    const { s: s0, ap, ids } = setup([jirina]);
    s0.players[ap]!.commanderCasts[Object.keys(s0.players[ap]!.commanderCasts)[0]!] = 2;
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.objects[id]!.isToken)).toHaveLength(2);
  });

  it("Font of Magic: instants and sorceries cost {1} less for each time", () => {
    const { s: s0, ap, opp, ids } = setup([blaze]);
    putOnBattlefield(s0, ap, fontOfMagic);
    s0.players[ap]!.commanderCasts[Object.keys(s0.players[ap]!.commanderCasts)[0]!] = 2;
    const tapped = (st: GameState) => st.battlefield.filter((id) => st.objects[id]!.controller === ap && st.objects[id]!.tapped).length;
    const s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    expect(tapped(s) - tapped(s0)).toBe(2);
  });

  it("Big Bertha and Morlun enter with X counters; Hulk's are doubled each upkeep", () => {
    const { s: s0, ap, opp, ids } = setup([bertha, morlun, hulk]);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 3)));
    expect(pt(s, ids[0]!)).toBe("4/4");
    const life = s.players[opp]!.life;
    s = run(s, planCast(s, ap, ids[1]!, undefined, undefined, undefined, 2));
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(pt(s, ids[1]!)).toBe("4/3");
    expect(s.players[opp]!.life).toBe(life - 2);
    const h = putOnBattlefield(s, ap, hulk);
    s.objects[h]!.counters = { "+1/+1": 2 };
    invalidateCharacteristics(s);
    s = resolveAll(passUntil(s, "upkeep", ap));
    expect(s.objects[h]!.counters?.["+1/+1"]).toBe(4);
  });
});
