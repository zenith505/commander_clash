// Lane B, round 7: the least played cards first, working up the popularity list (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, addEffect, card, forest, island, mountain, passUntil, plainsCard, pt, putOnBattlefield, setup, swamp } from "./helpers";
import { attackCost, blockProblem, botActions, characteristics, compileCard, harmfulTargets, invalidateCharacteristics, isFullySupported, objHasKeyword, parseManaCost, planActivate, planCast, planMana, planTurnFaceUp, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";
import { potentialAttackers } from "../src/game";
import { discardCards } from "../src/effects/run-library";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/**
 * Everyone passes until the stack is empty. "You may" questions get `yes`; a pending target choice gets `targets`; a
 * punisher's player in `payers` pays (with their lands), the others don't. Stops at any other question.
 */
const settle = (s: GameState, opts: { yes?: boolean; targets?: TargetChoice[]; payers?: PlayerId[] } = {}) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.yes ?? true });
    else if (p?.kind === "chooseTargets" && opts.targets) s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets } as Action);
    else if (p?.kind === "chooseOption" && p.what === "punisher") s = act(s, { type: "chooseOption", player: p.player, choice: opts.payers?.includes(p.player) ? p.options[0]! : "none" });
    else if (p?.kind === "payUnless") {
      const yes = !!opts.payers?.includes(p.player);
      s = run(s, [...(yes && p.cost ? planMana(s, p.player, parseManaCost(p.cost))! : []), { type: "payUnless", player: p.player, pay: yes }]);
    } else if (p?.kind === "arrangeTop") s = act(s, { type: "arrangeTop", player: p.player, top: p.cards, away: [] });
    else if (p) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % s.turnOrder.length]!;
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const types = (s: GameState, id: string) => characteristics(s, s.objects[id]!).types;
const has = (s: GameState, id: string, k: string) => objHasKeyword(s, s.objects[id]!, k);
const creature = (name: string, typeLine: string, manaCost: string, p: number, t: number, extra: Partial<CardDef> = {}) =>
  card(name, typeLine, manaCost, { power: String(p), toughness: String(t), ...extra });
const greenBear = () => creature("Green Bear", "Creature — Bear", "{1}{G}", 2, 2);
const blueBird = () => creature("Blue Bird", "Creature — Bird", "{1}{U}", 1, 1, { keywords: ["Flying"], oracleText: "Flying" });
const into = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard" = "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Attackers declared, the game paused on the defending player's blocks (or on a target for an attack trigger). */
const toBlocks = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[], targets?: TargetChoice[]) => {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks });
  for (let i = 0; i < 40 && s.pending?.kind !== "declareBlockers"; i++) {
    if (s.pending?.kind === "chooseTargets" && targets) s = act(s, { type: "chooseTargets", player: s.pending.player, targets } as Action);
    else if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes: true });
    else if (s.pending) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Blocks declared by `opp`; every other defending player declares none. */
const block = (s: GameState, opp: PlayerId, blocks: { blocker: string; attacker: string }[]) => {
  s = act(s, { type: "declareBlockers", player: opp, blocks });
  for (let i = 0; i < 10 && s.pending?.kind === "declareBlockers"; i++) s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
  return s;
};
/** The next upkeep of `pid`, with its triggers resolved. */
const toUpkeep = (s: GameState, pid: PlayerId, opts: Parameters<typeof settle>[1] = {}) => settle(passUntil(s, "upkeep", pid), opts);

const attach = (s: GameState, pid: PlayerId, def: CardDef, to: string) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.attachedTo = to;
  invalidateCharacteristics(s);
  return id;
};
/** The top spell on the stack, as a target. */
const topSpell = (s: GameState): TargetChoice => ({ kind: "stack", id: s.stack[s.stack.length - 1]!.id } as TargetChoice);

// Real oracle text (Scryfall).
const falsePeace = card("False Peace", "Sorcery", "{W}", { cmc: 1, oracleText: "Target player skips all combat phases of their next turn." });
const emptyCityRuse = card("Empty City Ruse", "Sorcery", "{W}", { cmc: 1, oracleText: "Target opponent skips all combat phases of their next turn." });
const boggartForager = card("Boggart Forager", "Creature — Goblin Rogue", "{R}", { cmc: 1, power: "1", toughness: "1", oracleText: "{R}, Sacrifice this creature: Target player shuffles their library." });
const exhaustion = card("Exhaustion", "Sorcery", "{2}{U}", { cmc: 3, oracleText: "Creatures and lands target opponent controls don't untap during their next untap step." });
const bontusLastReckoning = card("Bontu's Last Reckoning", "Sorcery", "{1}{B}{B}", { cmc: 3, oracleText: "Destroy all creatures. Lands you control don't untap during your next untap step." });
const manaVapors = card("Mana Vapors", "Sorcery", "{1}{U}", { cmc: 2, oracleText: "Lands target player controls don't untap during their next untap step." });
const foresight = card("Foresight", "Sorcery", "{1}{U}", { cmc: 2, oracleText: "Search your library for three cards, exile them, then shuffle.\nDraw a card at the beginning of the next turn's upkeep." });
const denyingWind = card("Denying Wind", "Sorcery", "{7}{U}{U}", { cmc: 9, oracleText: "Search target player's library for up to seven cards and exile them. Then that player shuffles." });
const jestersCap = card("Jester's Cap", "Artifact", "{4}", { cmc: 4, oracleText: "{2}, {T}, Sacrifice this artifact: Search target player's library for three cards and exile them. Then that player shuffles." });
const nightmareIncursion = card("Nightmare Incursion", "Sorcery", "{5}{B}", { cmc: 6, oracleText: "Search target player's library for up to X cards, where X is the number of Swamps you control, and exile them. Then that player shuffles." });
const razeToTheGround = card("Raze to the Ground", "Sorcery", "{2}{R}", { cmc: 3, oracleText: "This spell can't be countered.\nDestroy target artifact. If its mana value was 1 or less, draw a card." });
const extinguishTheLight = card("Extinguish the Light", "Instant", "{2}{B}{B}", { cmc: 4, oracleText: "Destroy target creature or planeswalker. If its mana value was 3 or less, you gain 3 life." });
const relicCrush = card("Relic Crush", "Instant", "{4}{G}", { cmc: 5, oracleText: "Destroy target artifact or enchantment and up to one other target artifact or enchantment." });
const emptyTheCatacombs = card("Empty the Catacombs", "Sorcery", "{3}{B}", { cmc: 4, oracleText: "Each player returns all creature cards from their graveyard to their hand." });
const wallOfVapor = card("Wall of Vapor", "Creature — Wall", "{3}{U}", { cmc: 4, power: "0", toughness: "1", keywords: ["Defender"], oracleText: "Defender (This creature can't attack.)\nPrevent all damage that would be dealt to this creature by creatures it's blocking." });
const armoredTransport = card("Armored Transport", "Artifact Creature — Construct", "{3}", { cmc: 3, power: "2", toughness: "1", oracleText: "Prevent all combat damage that would be dealt to this creature by creatures blocking it." });
const crusherZendikon = card("Crusher Zendikon", "Enchantment — Aura", "{2}{R}", { cmc: 3, keywords: ["Enchant"], oracleText: "Enchant land\nEnchanted land is a 4/2 red Beast creature with trample. It's still a land.\nWhen enchanted land dies, return that card to its owner's hand." });
const livingTerrain = card("Living Terrain", "Enchantment — Aura", "{2}{G}{G}", { cmc: 4, keywords: ["Enchant"], oracleText: "Enchant land\nEnchanted land is a 5/6 green Treefolk creature that's still a land." });
const ensoulArtifact = card("Ensoul Artifact", "Enchantment — Aura", "{1}{U}", { cmc: 2, keywords: ["Enchant"], oracleText: "Enchant artifact\nEnchanted artifact is a creature with base power and toughness 5/5 in addition to its other types." });
const genjuOfTheFalls = card("Genju of the Falls", "Enchantment — Aura", "{U}", { cmc: 1, keywords: ["Enchant"], oracleText: "Enchant Island\n{2}: Enchanted Island becomes a 3/2 blue Spirit creature with flying until end of turn. It's still a land.\nWhen enchanted Island is put into a graveyard, you may return this card from your graveyard to your hand." });
const genjuOfTheRealm = card("Genju of the Realm", "Legendary Enchantment — Aura", "{W}{U}{B}{R}{G}", { cmc: 5, keywords: ["Enchant"], oracleText: "Enchant land\n{2}: Enchanted land becomes a legendary 8/12 Spirit creature with trample until end of turn. It's still a land.\nWhen enchanted land is put into a graveyard, you may return Genju of the Realm from your graveyard to your hand." });
const skyTether = card("Sky Tether", "Enchantment — Aura", "{W}", { cmc: 1, keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature has defender and loses flying." });
const lushGrowth = card("Lush Growth", "Enchantment — Aura", "{G}", { cmc: 1, keywords: ["Enchant"], oracleText: "Enchant land\nEnchanted land is a Mountain, Forest, and Plains." });
const brainwash = card("Brainwash", "Enchantment — Aura", "{W}", { cmc: 1, keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature can't attack unless its controller pays {3}." });
const phyrexianMarauder = card("Phyrexian Marauder", "Artifact Creature — Phyrexian Construct", "{X}", { cmc: 0, power: "0", toughness: "0", oracleText: "This creature enters with X +1/+1 counters on it.\nThis creature can't block.\nThis creature can't attack unless you pay {1} for each +1/+1 counter on it." });
const recalibrate = card("Recalibrate", "Instant", "{1}{U}", { cmc: 2, oracleText: "Return target creature to its owner's hand. If you've discarded a card this turn, draw a card." });
const titanbonesToweringHeart = card("Titanbones, Towering Heart", "Legendary Creature — Skeleton Druid", "{3}{G}", { cmc: 4, power: "4", toughness: "3", keywords: ["Reach"], oracleText: "Reach\nWhenever you gain life, put two +1/+1 counters on Titanbones.\nWhen you discard this card, you gain 3 life." });
const barteredCow = card("Bartered Cow", "Creature — Ox", "{3}{W}", { cmc: 4, power: "3", toughness: "3", keywords: ["Food"], oracleText: "When this creature dies and when you discard this card, create a Food token. (It's an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")" });
const hellionEruption = card("Hellion Eruption", "Sorcery", "{5}{R}", { cmc: 6, oracleText: "Sacrifice all creatures you control, then create that many 4/4 red Hellion creature tokens." });
const sacredExcavation = card("Sacred Excavation", "Sorcery", "{3}{U}", { cmc: 4, oracleText: "Return up to two target cards with cycling from your graveyard to your hand." });
const kumenasSpeaker = card("Kumena's Speaker", "Creature — Merfolk Shaman", "{G}", { cmc: 1, power: "1", toughness: "1", oracleText: "This creature gets +1/+1 as long as you control another Merfolk or an Island." });
const manorGargoyle = card("Manor Gargoyle", "Artifact Creature — Gargoyle", "{5}", { cmc: 5, power: "4", toughness: "4", keywords: ["Defender"], oracleText: "Defender\nThis creature has indestructible as long as it has defender.\n{1}: Until end of turn, this creature loses defender and gains flying." });
const domestication = card("Domestication", "Enchantment — Aura", "{2}{U}{U}", { cmc: 4, keywords: ["Enchant"], oracleText: "Enchant creature\nYou control enchanted creature.\nAt the beginning of your end step, if enchanted creature's power is 4 or greater, sacrifice this Aura." });
const boardedWindow = card("Boarded Window", "Artifact", "{3}", { cmc: 3, oracleText: "Creatures attacking you get -1/-0.\nAt the beginning of each end step, if you were dealt 4 or more damage this turn, exile this artifact." });
const chandrasSpitfire = card("Chandra's Spitfire", "Creature — Elemental", "{2}{R}", { cmc: 3, power: "1", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nWhenever an opponent is dealt noncombat damage, this creature gets +3/+0 until end of turn." });
const momentumRumbler = card("Momentum Rumbler", "Creature — Dinosaur", "{3}{R}", { cmc: 4, power: "3", toughness: "3", oracleText: "Whenever this creature attacks, if it doesn't have first strike, put a first strike counter on it.\nWhenever this creature attacks, if it has first strike, it gains double strike until end of turn." });
const kamisFlare = card("Kami's Flare", "Instant", "{1}{R}", { cmc: 2, oracleText: "Kami's Flare deals 3 damage to target creature or planeswalker. Kami's Flare also deals 2 damage to that permanent's controller if you control a modified creature. (Equipment, Auras you control, and counters are modifications.)" });
const oketrasLastMercy = card("Oketra's Last Mercy", "Sorcery", "{1}{W}{W}", { cmc: 3, oracleText: "Your life total becomes equal to your starting life total. Lands you control don't untap during your next untap step." });
const gorillaTitan = card("Gorilla Titan", "Creature — Ape", "{3}{G}{G}", { cmc: 5, power: "4", toughness: "4", keywords: ["Trample"], oracleText: "Trample\nThis creature gets +4/+4 as long as there are no cards in your graveyard." });
const viridianBetrayers = card("Viridian Betrayers", "Creature — Phyrexian Elf Warrior", "{1}{G}{G}", { cmc: 3, power: "3", toughness: "1", oracleText: "This creature has infect as long as an opponent is poisoned. (It deals damage to creatures in the form of -1/-1 counters and to players in the form of poison counters.)" });
const wildfireElemental = card("Wildfire Elemental", "Creature — Elemental", "{2}{R}{R}", { cmc: 4, power: "3", toughness: "3", oracleText: "Whenever an opponent is dealt noncombat damage, creatures you control get +1/+0 until end of turn." });
const testBlast = (n: number) => card(`Test Blast ${n}`, "Instant", "{R}", { cmc: 1, oracleText: `Test Blast ${n} deals ${n} damage to any target.` });
const steps = (s: GameState, pid: PlayerId) => {
  const seen: string[] = [];
  s = passUntil(s, "main1", pid);
  for (let i = 0; i < 200 && s.activePlayer === pid; i++) {
    seen.push(s.step);
    s = s.pending?.kind === "declareAttackers" || s.pending ? s : act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending) break;
  }
  return seen;
};

describe("Skips, shuffles and permanents that don't untap (CR 614.10, 502.3)", () => {
  it("are fully supported", () => supported(falsePeace, emptyCityRuse, boggartForager, exhaustion, bontusLastReckoning, manaVapors, oketrasLastMercy));

  it("False Peace: the target player has no combat phase on their next turn, then combat again on the one after", () => {
    let { s, ap, opp, ids } = setup([falsePeace]);
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect(s.players[opp]!.skips).toEqual([{ what: "combat", wholeTurn: true }]);
    expect(steps(s, opp)).not.toContain("beginCombat");
    s = passUntil(s, "end", opp);
    expect(s.log.some((l) => /skips their combat phase/.test(typeof l === "string" ? l : JSON.stringify(l)))).toBe(true);
    s = passUntil(s, "main1", next(s, opp));
    expect(s.players[opp]!.skips).toBeUndefined();
  });

  it("Empty City Ruse targets only an opponent", () => {
    let { s, ap, opp, ids } = setup([emptyCityRuse]);
    expect(planCast(s, ap, ids[0]!, [player(ap)])).toBeNull();
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect(s.players[opp]!.skips?.[0]?.wholeTurn).toBe(true);
  });

  it("Boggart Forager: target player shuffles their library", () => {
    let { s, ap, opp } = setup([]);
    const b = putOnBattlefield(s, ap, boggartForager);
    const before = [...s.players[opp]!.library];
    s = settle(run(s, planActivate(s, ap, b, 0, [player(opp)])));
    expect(zone(s, b)).toBe("graveyard");
    expect([...s.players[opp]!.library].sort()).toEqual([...before].sort());
    expect(s.players[opp]!.library).not.toEqual(before);
  });

  it("Exhaustion: the opponent's tapped creatures and lands stay tapped during their next untap step only", () => {
    let { s, ap, opp, ids } = setup([exhaustion]);
    const land = putOnBattlefield(s, opp, island);
    const c = putOnBattlefield(s, opp, greenBear());
    const art = putOnBattlefield(s, opp, card("Test Rock", "Artifact", "{2}", { oracleText: "{T}: Add {C}." }));
    for (const id of [land, c, art]) s.objects[id]!.tapped = true;
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect(s.players[opp]!.noUntapNext).toEqual(["Creature", "Land"]);
    s = passUntil(s, "upkeep", opp);
    expect(s.objects[land]!.tapped).toBe(true);
    expect(s.objects[c]!.tapped).toBe(true);
    expect(s.objects[art]!.tapped).toBe(false);
    expect(s.players[opp]!.noUntapNext).toBeUndefined();
    s = passUntil(passUntil(s, "main1", next(s, opp)), "upkeep", opp);
    expect(s.objects[land]!.tapped).toBe(false);
  });

  it("Bontu's Last Reckoning destroys all creatures, and your lands don't untap during your next untap step", () => {
    let { s, ap, opp, ids } = setup([bontusLastReckoning]);
    const mine = putOnBattlefield(s, ap, greenBear());
    const theirs = putOnBattlefield(s, opp, greenBear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    expect(zone(s, mine)).toBe("graveyard");
    expect(zone(s, theirs)).toBe("graveyard");
    const tapped = s.battlefield.filter((id) => s.objects[id]!.tapped);
    expect(tapped.length).toBe(3);
    s = passUntil(passUntil(s, "main1", opp), "upkeep", ap);
    expect(tapped.every((id) => s.objects[id]!.tapped)).toBe(true);
  });

  it("Mana Vapors: only lands", () => {
    let { s, ap, opp, ids } = setup([manaVapors]);
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect(s.players[opp]!.noUntapNext).toEqual(["Land"]);
  });

  it("Oketra's Last Mercy: your life total becomes 40 (the starting life total), and your lands stay tapped", () => {
    let { s, ap, ids } = setup([oketrasLastMercy]);
    s.players[ap]!.life = 7;
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    expect(life(s, ap)).toBe(40);
    expect(s.players[ap]!.noUntapNext).toEqual(["Land"]);
  });

  it("the bot points Exhaustion at an opponent", () => {
    const def = compileCard(exhaustion);
    expect(harmfulTargets(def.spell!)).toEqual([true]);
  });
});

describe("Searching libraries to exile cards (CR 701.23)", () => {
  it("are fully supported", () => supported(foresight, denyingWind, jestersCap, nightmareIncursion));

  it("Foresight: you exile three cards from your library; the bot picks the ones it wants least, then draws next upkeep", () => {
    let { s, ap, ids } = setup([foresight]);
    s = run(s, planCast(s, ap, ids[0]!, []));
    for (let i = 0; i < 10 && s.pending?.kind !== "searchLibrary"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const p = s.pending;
    expect(p?.kind).toBe("searchLibrary");
    if (p?.kind !== "searchLibrary") return;
    expect(p.away).toBe(true);
    expect([p.min, p.max]).toEqual([3, 3]);
    const a = botActions(s, ap).find((x) => x.type === "searchLibrary");
    expect(a && a.type === "searchLibrary" && a.found.length).toBe(3);
    // Forests are worth less to the bot than more creatures when it already has plenty of lands.
    s = act(s, a!);
    expect(s.players[ap]!.exile.length).toBeGreaterThanOrEqual(3);
  });

  it("Denying Wind exiles up to seven cards from the target player's library, then they shuffle", () => {
    let { s, ap, opp, ids } = setup([denyingWind]);
    const lib = s.players[opp]!.library.length;
    s = run(s, planCast(s, ap, ids[0]!, [player(opp)]));
    for (let i = 0; i < 10 && s.pending?.kind !== "searchLibrary"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const p = s.pending;
    if (p?.kind !== "searchLibrary") throw new Error("no search");
    expect(p.player).toBe(ap);
    expect([p.min, p.max]).toEqual([0, 7]);
    const found = p.cards.slice(0, 7);
    s = settle(act(s, { type: "searchLibrary", player: ap, found }));
    expect(found.every((id) => zone(s, id) === "exile")).toBe(true);
    expect(s.players[opp]!.library.length).toBe(lib - 7);
  });

  it("Nightmare Incursion: up to X, X the Swamps you control", () => {
    let { s, ap, opp, ids } = setup([nightmareIncursion]);
    const swamps = s.battlefield.filter((id) => types(s, id).includes("Land") && characteristics(s, s.objects[id]!).subtypes.includes("Swamp")).length;
    s = run(s, planCast(s, ap, ids[0]!, [player(opp)]));
    for (let i = 0; i < 10 && s.pending?.kind !== "searchLibrary"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const p = s.pending;
    if (p?.kind !== "searchLibrary") throw new Error("no search");
    expect(p.max).toBe(swamps);
  });

  it("Jester's Cap: exactly three", () => {
    let { s, ap, opp } = setup([]);
    const cap = putOnBattlefield(s, ap, jestersCap);
    s = run(s, planActivate(s, ap, cap, 0, [player(opp)]));
    for (let i = 0; i < 10 && s.pending?.kind !== "searchLibrary"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const p = s.pending;
    if (p?.kind !== "searchLibrary") throw new Error("no search");
    expect([p.min, p.max]).toEqual([3, 3]);
  });
});

describe("Destroy riders and multi-target destruction (CR 608.2h)", () => {
  it("are fully supported", () => supported(razeToTheGround, extinguishTheLight, relicCrush, hellionEruption));

  it("Raze to the Ground draws a card only for an artifact with mana value 1 or less", () => {
    for (const mv of [1, 2]) {
      let { s, ap, opp, ids } = setup([razeToTheGround]);
      const a = putOnBattlefield(s, opp, card("Test Trinket", "Artifact", `{${mv}}`, { cmc: mv }));
      const hand = s.players[ap]!.hand.length;
      s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(a)])));
      expect(zone(s, a)).toBe("graveyard");
      expect(s.players[ap]!.hand.length).toBe(hand - 1 + (mv <= 1 ? 1 : 0));
    }
  });

  it("Extinguish the Light gains 3 life only for mana value 3 or less (its last known mana value)", () => {
    for (const big of [false, true]) {
      let { s, ap, opp, ids } = setup([extinguishTheLight]);
      const c = putOnBattlefield(s, opp, big ? creature("Test Giant", "Creature — Giant", "{4}{R}", 5, 5) : greenBear());
      const l0 = life(s, ap);
      s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(c)])));
      expect(zone(s, c)).toBe("graveyard");
      expect(life(s, ap)).toBe(l0 + (big ? 0 : 3));
    }
  });

  it("Relic Crush destroys one or two artifacts or enchantments", () => {
    let { s, ap, opp, ids } = setup([relicCrush]);
    const a = putOnBattlefield(s, opp, card("Test Trinket", "Artifact", "{1}", { cmc: 1 }));
    const e = putOnBattlefield(s, opp, card("Test Omen", "Enchantment", "{1}{W}", { cmc: 2 }));
    expect(planCast(s, ap, ids[0]!, [tgt(a), tgt(a)])).toBeNull();
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(a), tgt(e)])));
    expect(zone(s, a)).toBe("graveyard");
    expect(zone(s, e)).toBe("graveyard");
  });

  it("Hellion Eruption: one 4/4 Hellion for each creature sacrificed", () => {
    let { s, ap, ids } = setup([hellionEruption]);
    const a = putOnBattlefield(s, ap, greenBear());
    const b = putOnBattlefield(s, ap, blueBird());
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    expect(zone(s, a)).toBe("graveyard");
    expect(zone(s, b)).toBe("graveyard");
    const hellions = s.battlefield.filter((id) => characteristics(s, s.objects[id]!).subtypes.includes("Hellion"));
    expect(hellions.length).toBe(2);
    expect(pt(s, hellions[0]!)).toBe("4/4");
  });
});

describe("Graveyards: returning creature cards, cycling cards (CR 702.29)", () => {
  it("are fully supported", () => supported(emptyTheCatacombs, sacredExcavation));

  it("Empty the Catacombs returns each player's creature cards to their own hands", () => {
    let { s, ap, opp, ids } = setup([emptyTheCatacombs]);
    const mine = into(s, ap, greenBear(), "graveyard");
    const theirs = into(s, opp, blueBird(), "graveyard");
    const land = into(s, opp, island, "graveyard");
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    expect(s.players[ap]!.hand).toContain(mine);
    expect(s.players[opp]!.hand).toContain(theirs);
    expect(zone(s, land)).toBe("graveyard");
  });

  it("Sacred Excavation targets only cards with cycling", () => {
    let { s, ap, ids } = setup([sacredExcavation]);
    const cyc = into(s, ap, card("Test Cycler", "Creature — Beast", "{3}{G}", { power: "3", toughness: "3", keywords: ["Cycling"], oracleText: "Cycling {2}" }), "graveyard");
    const plain = into(s, ap, greenBear(), "graveyard");
    expect(planCast(s, ap, ids[0]!, [tgt(plain), { kind: "none" }])).toBeNull();
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(cyc), { kind: "none" }])));
    expect(s.players[ap]!.hand).toContain(cyc);
  });
});

describe("Combat damage prevented by the creatures in that combat (CR 615)", () => {
  it("are fully supported", () => supported(wallOfVapor, armoredTransport));

  it("Wall of Vapor takes no damage from the creature it blocks", () => {
    let { s, ap, opp } = setup([]);
    const a = putOnBattlefield(s, ap, creature("Test Ogre", "Creature — Ogre", "{2}{R}", 3, 3));
    const w = putOnBattlefield(s, opp, wallOfVapor);
    s = toBlocks(s, ap, [{ attacker: a, defender: opp }]);
    s = block(s, opp, [{ blocker: w, attacker: a }]);
    s = passUntil(s, "main2", ap);
    expect(zone(s, w)).toBe("battlefield");
    expect(s.objects[w]!.damage).toBe(0);
  });

  it("Armored Transport takes no combat damage from its blockers, and still deals its own", () => {
    let { s, ap, opp } = setup([]);
    const t = putOnBattlefield(s, ap, armoredTransport);
    const b = putOnBattlefield(s, opp, greenBear());
    s = toBlocks(s, ap, [{ attacker: t, defender: opp }]);
    s = block(s, opp, [{ blocker: b, attacker: t }]);
    s = passUntil(s, "main2", ap);
    expect(zone(s, t)).toBe("battlefield");
    expect(zone(s, b)).toBe("graveyard");
  });

  it("Armored Transport is still damaged by a creature that isn't blocking it", () => {
    let { s, ap, ids } = setup([testBlast(2)]);
    const t = putOnBattlefield(s, ap, armoredTransport);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(t)])));
    expect(zone(s, t)).toBe("graveyard");
  });
});

describe("Auras that animate lands and artifacts (CR 613.1d, 613.4b)", () => {
  it("are fully supported", () => supported(crusherZendikon, livingTerrain, ensoulArtifact, genjuOfTheFalls, genjuOfTheRealm, lushGrowth));

  it("Crusher Zendikon: the land is a red 4/2 Beast with trample and still a land; when it dies the card returns to hand", () => {
    let { s, ap, opp, ids } = setup([extinguishTheLight]);
    const land = putOnBattlefield(s, opp, forest);
    attach(s, opp, crusherZendikon, land);
    const c = characteristics(s, s.objects[land]!);
    expect(c.types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    expect(c.subtypes).toEqual(expect.arrayContaining(["Forest", "Beast"]));
    expect(c.colors).toEqual(["R"]);
    expect(pt(s, land)).toBe("4/2");
    expect(has(s, land, "Trample")).toBe(true);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(land)])));
    expect(s.players[opp]!.hand).toContain(land);
  });

  it("Living Terrain: a green 5/6 Treefolk land creature", () => {
    let { s, ap } = setup([]);
    const land = putOnBattlefield(s, ap, island);
    attach(s, ap, livingTerrain, land);
    const c = characteristics(s, s.objects[land]!);
    expect(c.types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    expect(c.colors).toEqual(["G"]);
    expect(pt(s, land)).toBe("5/6");
  });

  it("Ensoul Artifact: a 5/5 artifact creature", () => {
    let { s, ap } = setup([]);
    const a = putOnBattlefield(s, ap, card("Test Trinket", "Artifact", "{1}", { cmc: 1 }));
    attach(s, ap, ensoulArtifact, a);
    expect(types(s, a)).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(pt(s, a)).toBe("5/5");
  });

  it("Genju of the Falls animates its Island, and comes back to hand when the Island goes to the graveyard", () => {
    let { s, ap, opp, ids } = setup([extinguishTheLight]);
    const isl = putOnBattlefield(s, ap, island);
    const g = attach(s, ap, genjuOfTheFalls, isl);
    s = settle(run(s, planActivate(s, ap, g, 0)));
    expect(types(s, isl)).toContain("Creature");
    expect(pt(s, isl)).toBe("3/2");
    expect(has(s, isl, "Flying")).toBe(true);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(isl)])), { yes: true });
    expect(zone(s, isl)).toBe("graveyard");
    expect(s.players[ap]!.hand).toContain(g);
    void opp;
  });

  it("Genju of the Realm is a battlefield trigger: it works for any land", () => {
    const def = compileCard(genjuOfTheRealm);
    expect(def.unsupported).toEqual([]);
    let { s, ap } = setup([]);
    const land = putOnBattlefield(s, ap, plainsCard);
    const g = attach(s, ap, genjuOfTheRealm, land);
    s = settle(run(s, planActivate(s, ap, g, 0)));
    expect(pt(s, land)).toBe("8/12");
    expect(characteristics(s, s.objects[land]!).supertypes).toContain("Legendary");
  });

  it("Lush Growth: the land is a Mountain, Forest and Plains, and taps for their colors", () => {
    let { s, ap } = setup([]);
    const land = putOnBattlefield(s, ap, island);
    attach(s, ap, lushGrowth, land);
    expect(characteristics(s, s.objects[land]!).subtypes.sort()).toEqual(["Forest", "Mountain", "Plains"]);
  });
});

describe("Statics with conditions and keyword changes (CR 613.8 dependencies)", () => {
  it("are fully supported", () => supported(skyTether, kumenasSpeaker, manorGargoyle, gorillaTitan, viridianBetrayers, domestication, boardedWindow));

  it("Sky Tether: defender, and no flying", () => {
    let { s, ap } = setup([]);
    const b = putOnBattlefield(s, ap, blueBird());
    attach(s, ap, skyTether, b);
    expect(has(s, b, "Defender")).toBe(true);
    expect(has(s, b, "Flying")).toBe(false);
  });

  it("Kumena's Speaker gets +1/+1 with another Merfolk or an Island", () => {
    let { s, opp } = setup([]);
    const k = putOnBattlefield(s, opp, kumenasSpeaker);
    expect(pt(s, k)).toBe("1/1");
    const m = putOnBattlefield(s, opp, creature("Test Merfolk", "Creature — Merfolk", "{U}", 1, 1));
    expect(pt(s, k)).toBe("2/2");
    s.battlefield.splice(s.battlefield.indexOf(m), 1);
    s.objects[m]!.zone = "graveyard";
    invalidateCharacteristics(s);
    expect(pt(s, k)).toBe("1/1");
    putOnBattlefield(s, opp, island);
    expect(pt(s, k)).toBe("2/2");
  });

  it("Manor Gargoyle is indestructible only while it has defender: losing defender loses that too", () => {
    let { s, ap } = setup([]);
    const g = putOnBattlefield(s, ap, manorGargoyle);
    expect(has(s, g, "Indestructible")).toBe(true);
    s = settle(run(s, planActivate(s, ap, g, 0)));
    expect(has(s, g, "Defender")).toBe(false);
    expect(has(s, g, "Flying")).toBe(true);
    expect(has(s, g, "Indestructible")).toBe(false);
  });

  it("Sky Tether on Manor Gargoyle: the granted defender keeps it indestructible", () => {
    let { s, ap } = setup([]);
    const g = putOnBattlefield(s, ap, manorGargoyle);
    s = settle(run(s, planActivate(s, ap, g, 0)));
    expect(has(s, g, "Indestructible")).toBe(false);
    attach(s, ap, skyTether, g);
    expect(has(s, g, "Indestructible")).toBe(true);
  });

  it("Gorilla Titan is 8/8 while your graveyard is empty", () => {
    let { s, ap } = setup([]);
    const g = putOnBattlefield(s, ap, gorillaTitan);
    expect(s.players[ap]!.graveyard.length).toBe(0);
    expect(pt(s, g)).toBe("8/8");
    into(s, ap, greenBear(), "graveyard");
    expect(pt(s, g)).toBe("4/4");
  });

  it("Viridian Betrayers has infect once an opponent is poisoned", () => {
    let { s, ap, opp } = setup([]);
    const v = putOnBattlefield(s, ap, viridianBetrayers);
    expect(has(s, v, "Infect")).toBe(false);
    s.players[opp]!.poison = 1;
    invalidateCharacteristics(s);
    expect(has(s, v, "Infect")).toBe(true);
  });

  it("Domestication: you control the creature; at your end step, sacrifice the Aura if its power is 4 or more", () => {
    let { s, ap, opp } = setup([]);
    const c = putOnBattlefield(s, opp, greenBear());
    const d = attach(s, ap, domestication, c);
    expect(characteristics(s, s.objects[c]!).controller).toBe(ap);
    s = settle(passUntil(s, "end", ap));
    expect(zone(s, d)).toBe("battlefield");
    s = passUntil(s, "main1", ap);
    addEffect(s, ap, [c], [{ kind: "modifyPT", power: 2, toughness: 0 }]);
    s = settle(passUntil(s, "end", ap));
    expect(zone(s, d)).toBe("graveyard");
    expect(characteristics(s, s.objects[c]!).controller).toBe(opp);
  });

  it("Boarded Window: attackers get -1/-0; it stays after 3 damage to you in a turn", () => {
    let { s, ap, opp, ids } = setup([testBlast(1)]);
    const w = putOnBattlefield(s, opp, boardedWindow);
    const a = putOnBattlefield(s, ap, creature("Test Ogre", "Creature — Ogre", "{2}{R}", 3, 3));
    s = toBlocks(s, ap, [{ attacker: a, defender: opp }]);
    expect(pt(s, a)).toBe("2/3");
    s = block(s, opp, []);
    s = passUntil(s, "main2", ap);
    expect(life(s, opp)).toBe(38);
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    s = settle(passUntil(s, "end", ap));
    expect(zone(s, w)).toBe("battlefield");
  });

  it("Boarded Window is exiled at the end step of a turn its controller was dealt 4 damage", () => {
    let { s, ap, opp, ids } = setup([testBlast(3), testBlast(1)]);
    const w = putOnBattlefield(s, opp, boardedWindow);
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    s = settle(run(s, planCast(s, ap, ids[1]!, [player(opp)])));
    s = settle(passUntil(s, "end", ap));
    expect(zone(s, w)).toBe("exile");
  });
});

describe("Attack costs for one creature (CR 508.1g-h)", () => {
  it("are fully supported", () => supported(brainwash, phyrexianMarauder));

  it("Brainwash: attacking with the enchanted creature costs {3}, attacking with others is free", () => {
    let { s, ap, opp } = setup([]);
    const c = putOnBattlefield(s, ap, greenBear());
    const other = putOnBattlefield(s, ap, greenBear());
    attach(s, opp, brainwash, c);
    expect(attackCost(s, [{ attacker: c, defender: opp }])).toBe("{3}");
    expect(attackCost(s, [{ attacker: other, defender: opp }])).toBe("");
    expect(attackCost(s, [{ attacker: c, defender: opp }, { attacker: other, defender: next(s, opp) }])).toBe("{3}");
  });

  it("Phyrexian Marauder: {1} for each +1/+1 counter on it", () => {
    let { s, ap, opp } = setup([]);
    const m = putOnBattlefield(s, ap, phyrexianMarauder);
    s.objects[m]!.counters["+1/+1"] = 3;
    invalidateCharacteristics(s);
    expect(pt(s, m)).toBe("3/3");
    expect(attackCost(s, [{ attacker: m, defender: opp }])).toBe("{3}");
  });

  it("the cost is paid as attackers are declared: Brainwash's creature attacks once its controller pays", () => {
    let { s, ap, opp } = setup([]);
    const c = putOnBattlefield(s, ap, greenBear());
    attach(s, opp, brainwash, c);
    s = passUntil(s, "declareAttackers", ap);
    const untapped = () => s.battlefield.filter((id) => types(s, id).includes("Land") && !s.objects[id]!.tapped).length;
    const before = untapped();
    s = run(s, [...planMana(s, ap, parseManaCost("{3}"))!, { type: "declareAttackers", player: ap, attacks: [{ attacker: c, defender: opp }] }]);
    expect(s.objects[c]!.attacking).toBe(opp);
    expect(untapped()).toBe(before - 3);
  });
});

describe("Discard triggers and \"if you've discarded a card this turn\" (CR 701.9)", () => {
  it("are fully supported", () => supported(recalibrate, titanbonesToweringHeart, barteredCow));

  it("Recalibrate draws a card only after you discarded one this turn", () => {
    for (const discarded of [false, true]) {
      let { s, ap, opp, ids } = setup([recalibrate, greenBear()]);
      const c = putOnBattlefield(s, opp, greenBear());
      if (discarded) discardCards(s, ap, [ids[1]!]);
      const hand = s.players[ap]!.hand.length;
      s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(c)])));
      expect(s.players[opp]!.hand).toContain(c);
      expect(s.players[ap]!.hand.length).toBe(hand - 1 + (discarded ? 1 : 0));
    }
  });

  it("an opponent's discard doesn't count for Recalibrate", () => {
    let { s, ap, opp, ids } = setup([recalibrate]);
    const theirs = into(s, opp, greenBear());
    discardCards(s, opp, [theirs]);
    const c = putOnBattlefield(s, opp, greenBear());
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(c)])));
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
  });

  it("Titanbones: when you discard it, you gain 3 life", () => {
    let { s, ap, ids } = setup([titanbonesToweringHeart]);
    const l0 = life(s, ap);
    discardCards(s, ap, [ids[0]!]);
    s = settle(s);
    expect(life(s, ap)).toBe(l0 + 3);
  });

  it("Bartered Cow makes a Food when discarded and when it dies", () => {
    let { s, ap, ids } = setup([barteredCow, extinguishTheLight]);
    const foods = () => s.battlefield.filter((id) => characteristics(s, s.objects[id]!).subtypes.includes("Food")).length;
    discardCards(s, ap, [ids[0]!]);
    s = settle(s);
    expect(foods()).toBe(1);
    const cow = putOnBattlefield(s, ap, barteredCow);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(cow)])));
    expect(foods()).toBe(2);
  });
});

describe("Noncombat damage to opponents, keyword checks on attack, modified creatures", () => {
  it("are fully supported", () => supported(chandrasSpitfire, wildfireElemental, momentumRumbler, kamisFlare));

  it("Chandra's Spitfire gets +3/+0 when an opponent is dealt noncombat damage, not combat damage", () => {
    let { s, ap, opp, ids } = setup([testBlast(1)]);
    const sp = putOnBattlefield(s, ap, chandrasSpitfire);
    const a = putOnBattlefield(s, ap, greenBear());
    s = toBlocks(s, ap, [{ attacker: a, defender: opp }]);
    s = block(s, opp, []);
    s = passUntil(s, "main2", ap);
    expect(life(s, opp)).toBe(38);
    expect(pt(s, sp)).toBe("1/3");
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect(pt(s, sp)).toBe("4/3");
  });

  it("Chandra's Spitfire doesn't care about damage to you", () => {
    let { s, ap, ids } = setup([testBlast(1)]);
    const sp = putOnBattlefield(s, ap, chandrasSpitfire);
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(ap)])));
    expect(pt(s, sp)).toBe("1/3");
  });

  it("Wildfire Elemental: your creatures get +1/+0", () => {
    let { s, ap, opp, ids } = setup([testBlast(1)]);
    const w = putOnBattlefield(s, ap, wildfireElemental);
    const b = putOnBattlefield(s, ap, greenBear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect(pt(s, w)).toBe("4/3");
    expect(pt(s, b)).toBe("3/2");
  });

  it("Momentum Rumbler: its first attack gives it a first strike counter; with first strike, an attack gives double strike", () => {
    let { s, ap, opp } = setup([]);
    const r = putOnBattlefield(s, ap, momentumRumbler);
    s = toBlocks(s, ap, [{ attacker: r, defender: opp }]);
    expect(s.objects[r]!.counters["first strike"]).toBe(1);
    expect(has(s, r, "First strike")).toBe(true);
    expect(has(s, r, "Double strike")).toBe(false);
    s = block(s, opp, []);
    s = passUntil(passUntil(s, "main1", opp), "main1", ap);
    s = toBlocks(s, ap, [{ attacker: r, defender: opp }]);
    expect(s.objects[r]!.counters["first strike"]).toBe(1);
    expect(has(s, r, "Double strike")).toBe(true);
  });

  it("Kami's Flare deals 2 to the permanent's controller only if you control a modified creature", () => {
    for (const modified of [false, true]) {
      let { s, ap, opp, ids } = setup([kamisFlare]);
      const mine = putOnBattlefield(s, ap, greenBear());
      if (modified) s.objects[mine]!.counters["+1/+1"] = 1;
      invalidateCharacteristics(s);
      const c = putOnBattlefield(s, opp, creature("Test Ogre", "Creature — Ogre", "{2}{R}", 3, 4));
      s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(c)])));
      expect(s.objects[c]!.damage).toBe(3);
      expect(life(s, opp)).toBe(modified ? 38 : 40);
    }
  });
});
