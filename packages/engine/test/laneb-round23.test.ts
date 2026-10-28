// Lane B, round 23: the cards the earlier rounds skipped, least played first (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, mountain, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty, answering choices as the bots would; a counter choice is left to the test. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseOption" && p.what === "counterChoice") break;
    if (p?.kind === "discard" || p?.kind === "declareAttackers" || p?.kind === "declareBlockers") break;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const dmg = (s: GameState, id: string) => s.objects[id]!.damage ?? 0;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const creature = (name: string, typeLine: string, manaCost: string, p: number, t: number, extra: Partial<CardDef> = {}) =>
  card(name, typeLine, manaCost, { power: String(p), toughness: String(t), ...extra });
const bigBeast = () => creature("Big Beast", "Creature — Beast", "{3}{G}", 4, 5, { cmc: 4 });
const greenBear = () => creature("Green Bear", "Creature — Bear", "{1}{G}", 2, 2, { cmc: 2 });
const roc = () => creature("Sky Roc", "Creature — Bird", "{3}{W}", 2, 4, { cmc: 4, keywords: ["Flying"], oracleText: "Flying" });
const ogre = () => creature("Red Ogre", "Creature — Ogre", "{2}{R}", 3, 3, { cmc: 3 });
const gold = () => creature("Gold Dragon", "Creature — Dragon", "{2}{R}{G}", 4, 4, { cmc: 4 });
const sorcery = (name: string, cost: string, cmc: number) => card(name, "Sorcery", cost, { cmc, oracleText: "Draw a card." });
const land = (name: string) => card(name, "Land");
/** Moves a new card for `def` into `pid`'s hand, graveyard or library (on top). */
const into = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard" | "library" = "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Empties `pid`'s hand (to the graveyard), so a random discard has only the cards a test puts there. */
const emptyHand = (s: GameState, pid: PlayerId) => {
  for (const id of s.players[pid]!.hand) s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(...s.players[pid]!.hand);
  s.players[pid]!.hand = [];
};
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices: CostChoices = {}) => run(s, planCast(s, pid, id, targets, undefined, "auto", undefined, choices));
const activateNow = (s: GameState, pid: PlayerId, id: string, index: number, targets: TargetChoice[] = [], x?: number, costs?: CostChoices) => run(s, planActivate(s, pid, id, index, targets, undefined, undefined, x, costs));
const keywordCounter = (s: GameState, id: string, k: string) => s.objects[id]!.counters[k] ?? 0;
/** Passes priority (empty stack) until `pid` has it. */
const priorityTo = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 8 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

// Real oracle text (Scryfall).
const flycatcherGiraffid = card("Flycatcher Giraffid", "Creature — Antelope Lizard", "{4}{G}", {"cmc":5,"power":"3","toughness":"5","oracleText":"This creature enters with your choice of a reach counter or a vigilance counter on it."});
const helicaGlider = card("Helica Glider", "Creature — Nightmare Squirrel", "{2}{W}", {"cmc":3,"power":"2","toughness":"2","oracleText":"This creature enters with your choice of a flying counter or a first strike counter on it."});
const wingfoldPteron = card("Wingfold Pteron", "Creature — Dinosaur", "{5}{U}", {"cmc":6,"power":"3","toughness":"6","oracleText":"This creature enters with your choice of a flying counter or a hexproof counter on it. (A creature with hexproof can't be the target of spells or abilities your opponents control.)"});
const bootNipper = card("Boot Nipper", "Creature — Beast", "{1}{B}", {"cmc":2,"power":"2","toughness":"1","oracleText":"This creature enters with your choice of a deathtouch counter or a lifelink counter on it."});
const ferociousTigorilla = card("Ferocious Tigorilla", "Creature — Cat Ape", "{3}{R}", {"cmc":4,"power":"4","toughness":"3","oracleText":"This creature enters with your choice of a trample counter or a menace counter on it. (A creature with menace can't be blocked except by two or more creatures.)"});
const tizerusCharger = card("Tizerus Charger", "Creature — Pegasus", "{2}{B}", {"cmc":3,"power":"3","toughness":"2","keywords":["Escape"],"oracleText":"Escape—{4}{B}, Exile five other cards from your graveyard. (You may cast this card from your graveyard for its escape cost.)\nThis creature escapes with your choice of a +1/+1 counter or a flying counter on it."});
const dragonWhelp = card("Dragon Whelp", "Creature — Dragon", "{2}{R}{R}", {"cmc":4,"power":"2","toughness":"3","keywords":["Flying"],"oracleText":"Flying\n{R}: This creature gets +1/+0 until end of turn. If this ability has been activated four or more times this turn, sacrifice this creature at the beginning of the next end step."});
const farrelitePriest = card("Farrelite Priest", "Creature — Human Cleric", "{1}{W}{W}", {"cmc":3,"power":"1","toughness":"3","oracleText":"{1}: Add {W}. If this ability has been activated four or more times this turn, sacrifice this creature at the beginning of the next end step."});
const initiatesOfTheEbonHand = card("Initiates of the Ebon Hand", "Creature — Cleric", "{B}", {"cmc":1,"power":"1","toughness":"1","oracleText":"{1}: Add {B}. If this ability has been activated four or more times this turn, sacrifice this creature at the beginning of the next end step."});
const nalathniDragon = card("Nalathni Dragon", "Creature — Dragon", "{2}{R}{R}", {"cmc":4,"power":"1","toughness":"1","keywords":["Flying","Banding"],"oracleText":"Flying; banding (Any creatures with banding, and up to one without, can attack in a band. Bands are blocked as a group. If any creatures with banding you control are blocking or being blocked by a creature, you divide that creature's combat damage, not its controller, among any of the creatures it's being blocked by or is blocking.)\n{R}: This creature gets +1/+0 until end of turn. If this ability has been activated four or more times this turn, sacrifice this creature at the beginning of the next end step."});
const pyromancy = card("Pyromancy", "Enchantment", "{2}{R}{R}", {"cmc":4,"oracleText":"{3}, Discard a card at random: This enchantment deals damage to any target equal to the mana value of the discarded card."});
const stormscaleAnarch = card("Stormscale Anarch", "Creature — Lizard Shaman", "{2}{R}{R}", {"cmc":4,"power":"2","toughness":"2","oracleText":"{2}{R}, Discard a card at random: This creature deals 2 damage to any target. If the discarded card was multicolored, this creature deals 4 damage instead."});
const hisokaMinamoSensei = card("Hisoka, Minamo Sensei", "Legendary Creature — Human Wizard", "{2}{U}{U}", {"cmc":4,"power":"1","toughness":"3","oracleText":"{2}{U}, Discard a card: Counter target spell if it has the same mana value as the discarded card."});
const landsEdge = card("Land's Edge", "World Enchantment", "{1}{R}{R}", {"cmc":3,"oracleText":"Discard a card: If the discarded card was a land card, this enchantment deals 2 damage to target player or planeswalker. Any player may activate this ability."});
const blastOfGenius = card("Blast of Genius", "Sorcery", "{4}{U}{R}", {"cmc":6,"oracleText":"Choose any target. Draw three cards, then discard a card. Blast of Genius deals damage equal to the discarded card's mana value to that permanent or player."});
const erraticExplosion = card("Erratic Explosion", "Sorcery", "{2}{R}", {"cmc":3,"oracleText":"Choose any target. Reveal cards from the top of your library until you reveal a nonland card. Erratic Explosion deals damage equal to that card's mana value to that permanent or player. Put the revealed cards on the bottom of your library in any order."});
const erraticMutation = card("Erratic Mutation", "Instant", "{2}{U}", {"cmc":3,"oracleText":"Choose target creature. Reveal cards from the top of your library until you reveal a nonland card. That creature gets +X/-X until end of turn, where X is that card's mana value. Put all cards revealed this way on the bottom of your library in any order."});
const goblinMachinist = card("Goblin Machinist", "Creature — Goblin", "{4}{R}", {"cmc":5,"power":"0","toughness":"5","oracleText":"{2}{R}: Reveal cards from the top of your library until you reveal a nonland card. This creature gets +X/+0 until end of turn, where X is that card's mana value. Put the revealed cards on the bottom of your library in any order."});
const explosiveRevelation = card("Explosive Revelation", "Sorcery", "{3}{R}{R}", {"cmc":5,"oracleText":"Choose any target. Reveal cards from the top of your library until you reveal a nonland card. Explosive Revelation deals damage equal to that card's mana value to that permanent or player. Put the nonland card into your hand and the rest on the bottom of your library in any order."});
const martyrOfAshes = card("Martyr of Ashes", "Creature — Human Shaman", "{R}", {"cmc":1,"power":"1","toughness":"1","oracleText":"{2}, Reveal X red cards from your hand, Sacrifice this creature: This creature deals X damage to each creature without flying."});
const martyrOfSpores = card("Martyr of Spores", "Creature — Human Shaman", "{G}", {"cmc":1,"power":"1","toughness":"1","oracleText":"{1}, Reveal X green cards from your hand, Sacrifice this creature: Target creature gets +X/+X until end of turn."});
const martyrOfSands = card("Martyr of Sands", "Creature — Human Cleric", "{W}", {"cmc":1,"power":"1","toughness":"1","oracleText":"{1}, Reveal X white cards from your hand, Sacrifice this creature: You gain three times X life."});
const martyrOfFrost = card("Martyr of Frost", "Creature — Human Wizard", "{U}", {"cmc":1,"power":"1","toughness":"1","oracleText":"{2}, Reveal X blue cards from your hand, Sacrifice this creature: Counter target spell unless its controller pays {X}."});

describe("Lane B round 23", () => {
  it("supports every card of the round", () => {
    supported(flycatcherGiraffid, helicaGlider, wingfoldPteron, bootNipper, ferociousTigorilla, tizerusCharger, dragonWhelp, farrelitePriest, initiatesOfTheEbonHand, nalathniDragon,
      pyromancy, stormscaleAnarch, hisokaMinamoSensei, landsEdge, blastOfGenius, erraticExplosion, erraticMutation, goblinMachinist, explosiveRevelation,
      martyrOfAshes, martyrOfSpores, martyrOfSands, martyrOfFrost);
  });

  it("Helica Glider enters with the counter its controller chooses, and only that one (CR 614.1c, 614.12)", () => {
    const { s: s0, ap, ids } = setup([helicaGlider]);
    let s = settle(castNow(s0, ap, ids[0]!));
    const p = s.pending;
    expect(p?.kind === "chooseOption" && p.what).toBe("counterChoice");
    expect(p?.kind === "chooseOption" && p.options).toEqual(["flying", "first strike"]);
    expect(p?.kind === "chooseOption" && p.labels).toEqual(["A flying counter", "A first strike counter"]);
    expect(() => act(s, { type: "chooseOption", player: ap, choice: "trample" })).toThrow();
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "first strike" }));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(keywordCounter(s, ids[0]!, "first strike")).toBe(1);
    expect(keywordCounter(s, ids[0]!, "flying")).toBe(0);
    expect(objHasKeyword(s, s.objects[ids[0]!]!, "First strike")).toBe(true);
    expect(objHasKeyword(s, s.objects[ids[0]!]!, "Flying")).toBe(false);
  });

  it("the other counter-choice creatures: each gets one of its two counters, and a bot picks the stronger one", () => {
    for (const [def, choice, keyword] of [[flycatcherGiraffid, "vigilance", "Vigilance"], [wingfoldPteron, "hexproof", "Hexproof"], [bootNipper, "lifelink", "Lifelink"], [ferociousTigorilla, "trample", "Trample"]] as const) {
      const { s: s0, ap, ids } = setup([def]);
      let s = settle(castNow(s0, ap, ids[0]!));
      expect(s.pending?.kind === "chooseOption" && s.pending.what, def.name).toBe("counterChoice");
      s = settle(act(s, { type: "chooseOption", player: ap, choice }));
      expect(keywordCounter(s, ids[0]!, choice), def.name).toBe(1);
      expect(objHasKeyword(s, s.objects[ids[0]!]!, keyword), def.name).toBe(true);
    }
    // Bots: deathtouch over lifelink, menace over trample, flying over hexproof.
    for (const [def, want] of [[bootNipper, "deathtouch"], [ferociousTigorilla, "menace"], [wingfoldPteron, "flying"]] as const) {
      const { s: s0, ap, ids } = setup([def]);
      const s = settle(castNow(s0, ap, ids[0]!));
      expect(botActions(s, ap)).toEqual([{ type: "chooseOption", player: ap, choice: want }]);
    }
  });

  it("Tizerus Charger gets its choice only when it escapes (CR 702.138c)", () => {
    const { s: s0, ap, ids } = setup([tizerusCharger]);
    // Cast from the hand: no counter and no question.
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(s.pending).toBeNull();
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(Object.values(s.objects[ids[0]!]!.counters).reduce((a, b) => a + b, 0)).toBe(0);
    // Escaped from the graveyard, exiling five other cards.
    const { s: t0, ap: bp } = setup([]);
    const charger = into(t0, bp, tizerusCharger, "graveyard");
    const others = Array.from({ length: 5 }, (_, i) => into(t0, bp, land(`Waste ${i}`), "graveyard"));
    let t = settle(castNow(t0, bp, charger, [], { via: "escape", exileCards: others }));
    expect(t.pending?.kind === "chooseOption" && t.pending.options).toEqual(["+1/+1", "flying"]);
    t = settle(act(t, { type: "chooseOption", player: bp, choice: "+1/+1" }));
    expect(pt(t, charger)).toBe("4/3");
    expect(objHasKeyword(t, t.objects[charger]!, "Flying")).toBe(false);
  });

  it("Dragon Whelp: the fourth activation in a turn sacrifices it at the beginning of the next end step (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const whelp = putOnBattlefield(s0, ap, dragonWhelp);
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, ap, mountain);
    let s = s0;
    for (let i = 0; i < 3; i++) s = settle(activateNow(s, ap, whelp, 0));
    expect(pt(s, whelp)).toBe("5/3");
    expect(s.delayed ?? []).toHaveLength(0);
    // Three activations only: it survives the end step.
    const t = settle(passUntil(s, "end"));
    expect(zone(t, whelp)).toBe("battlefield");
    s = settle(activateNow(s, ap, whelp, 0));
    expect(pt(s, whelp)).toBe("6/3");
    expect(s.delayed ?? []).toHaveLength(1);
    s = settle(activateNow(s, ap, whelp, 0));
    expect(s.delayed ?? []).toHaveLength(2);
    s = settle(passUntil(s, "end"));
    expect(zone(s, whelp)).toBe("graveyard");
  });

  it("Nalathni Dragon works the same, and a bot stops at three activations", () => {
    const { s: s0, ap } = setup([]);
    const dragon = putOnBattlefield(s0, ap, nalathniDragon);
    putOnBattlefield(s0, ap, mountain);
    let s = s0;
    for (let i = 0; i < 3; i++) s = settle(activateNow(s, ap, dragon, 0));
    expect(pt(s, dragon)).toBe("4/1");
    expect(botActions(s, ap).some((a) => a.type === "activateAbility" && a.objectId === dragon)).toBe(false);
    s = settle(activateNow(s, ap, dragon, 0));
    expect(s.delayed ?? []).toHaveLength(1);
  });

  it("Farrelite Priest and Initiates of the Ebon Hand: a mana ability whose fourth activation sacrifices it at the next end step", () => {
    const { s: s0, ap } = setup([]);
    const priest = putOnBattlefield(s0, ap, farrelitePriest);
    const initiates = putOnBattlefield(s0, ap, initiatesOfTheEbonHand);
    let s = s0;
    s.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 8 };
    for (let i = 0; i < 3; i++) s = act(s, { type: "activateMana", player: ap, objectId: priest, mana: "W", ability: 0 });
    expect(s.players[ap]!.manaPool.W).toBe(3);
    expect(s.delayed ?? []).toHaveLength(0);
    s = act(s, { type: "activateMana", player: ap, objectId: priest, mana: "W", ability: 0 });
    expect(s.delayed ?? []).toHaveLength(1);
    for (let i = 0; i < 3; i++) s = act(s, { type: "activateMana", player: ap, objectId: initiates, mana: "B", ability: 0 });
    expect(s.players[ap]!.manaPool.B).toBe(3);
    expect(s.delayed ?? []).toHaveLength(1);
    s = settle(passUntil(s, "end"));
    expect(zone(s, priest)).toBe("graveyard");
    expect(zone(s, initiates)).toBe("battlefield");
  });

  it("Pyromancy deals damage equal to the mana value of the card discarded at random", () => {
    const { s: s0, ap, opp } = setup([]);
    const pyro = putOnBattlefield(s0, ap, pyromancy);
    emptyHand(s0, ap);
    const ogreCard = into(s0, ap, ogre());
    const before = life(s0, opp);
    const s = settle(activateNow(s0, ap, pyro, 0, [ply(opp)]));
    expect(zone(s, ogreCard)).toBe("graveyard");
    expect(life(s, opp)).toBe(before - 3);
  });

  it("Stormscale Anarch deals 4 instead if the discarded card was multicolored", () => {
    const { s: s0, ap, opp } = setup([]);
    const anarch = putOnBattlefield(s0, ap, stormscaleAnarch);
    emptyHand(s0, ap);
    into(s0, ap, gold());
    const before = life(s0, opp);
    let s = settle(activateNow(s0, ap, anarch, 0, [ply(opp)]));
    expect(life(s, opp)).toBe(before - 4);
    into(s, ap, ogre());
    s = settle(activateNow(s, ap, anarch, 0, [ply(opp)]));
    expect(life(s, opp)).toBe(before - 6);
  });

  it("Hisoka counters a spell only if it has the discarded card's mana value", () => {
    const { s: s0, ap, ids } = setup([greenBear(), sorcery("Two Drop", "{1}{U}", 2), sorcery("Three Drop", "{2}{U}", 3)]);
    const hisoka = putOnBattlefield(s0, ap, hisokaMinamoSensei);
    // A spell of ours on the stack, then Hisoka's ability with a three-drop discarded: not countered.
    let s = run(s0, planCast(s0, ap, ids[0]!, []));
    s = activateNow(s, ap, hisoka, 0, [{ kind: "stack", id: s.stack[0]!.id }], undefined, { discard: [ids[2]!] });
    s = settle(s);
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(zone(s, ids[2]!)).toBe("graveyard");
    // Another bear, with the two-drop discarded: countered.
    const bear2 = into(s, ap, greenBear());
    s = run(s, planCast(s, ap, bear2, []));
    s = settle(activateNow(s, ap, hisoka, 0, [{ kind: "stack", id: s.stack[0]!.id }], undefined, { discard: [ids[1]!] }));
    expect(zone(s, bear2)).toBe("graveyard");
  });

  it("Land's Edge: any player may discard; only a land deals 2 damage to the target, chosen before the discard", () => {
    const { s: s0, ap, opp } = setup([]);
    const edge = putOnBattlefield(s0, ap, landsEdge);
    const forestCard = into(s0, opp, land("Lonely Forest"));
    const bearCard = into(s0, opp, greenBear());
    let s = priorityTo(s0, opp);
    const before = life(s, ap);
    s = settle(activateNow(s, opp, edge, 0, [ply(ap)], undefined, { discard: [bearCard] }));
    expect(zone(s, bearCard)).toBe("graveyard");
    expect(life(s, ap)).toBe(before);
    s = priorityTo(s, opp);
    s = settle(activateNow(s, opp, edge, 0, [ply(ap)], undefined, { discard: [forestCard] }));
    expect(life(s, ap)).toBe(before - 2);
  });

  it("Blast of Genius draws three, then deals damage equal to the discarded card's mana value to its target", () => {
    const { s: s0, ap, opp, ids } = setup([blastOfGenius]);
    const beast = putOnBattlefield(s0, opp, bigBeast());
    const top = [into(s0, ap, land("Top Land"), "library"), into(s0, ap, ogre(), "library"), into(s0, ap, bigBeast(), "library")];
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(beast)]));
    expect(s.pending?.kind).toBe("discard");
    for (const id of top) expect(zone(s, id)).toBe("hand");
    s = settle(act(s, { type: "discard", player: ap, objectIds: [top[2]!] }));
    expect(dmg(s, beast)).toBe(4);
    expect(zone(s, beast)).toBe("battlefield");
  });

  it("Erratic Explosion reveals until a nonland card, deals its mana value, and puts the revealed cards on the bottom", () => {
    const { s: s0, ap, opp, ids } = setup([erraticExplosion]);
    const lib = s0.players[ap]!.library;
    const ogreCard = into(s0, ap, ogre(), "library");
    const l2 = into(s0, ap, land("Second Land"), "library");
    const l1 = into(s0, ap, land("First Land"), "library");
    expect(lib.slice(0, 3)).toEqual([l1, l2, ogreCard]);
    const before = life(s0, opp);
    const s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]));
    expect(life(s, opp)).toBe(before - 3);
    const after = s.players[ap]!.library;
    expect(after.slice(-3).sort()).toEqual([l1, l2, ogreCard].sort());
    expect(after.slice(0, 3)).not.toContain(ogreCard);
  });

  it("Erratic Explosion with only lands in the library deals no damage (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([erraticExplosion]);
    const lib = s0.players[ap]!.library;
    for (const id of lib) { s0.objects[id]!.zone = "graveyard"; s0.players[ap]!.graveyard.push(id); }
    s0.players[ap]!.library = [];
    into(s0, ap, land("Only Land"), "library");
    const before = life(s0, opp);
    const s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]));
    expect(life(s, opp)).toBe(before);
    expect(s.players[ap]!.library).toHaveLength(1);
  });

  it("Erratic Mutation gives +X/-X and Goblin Machinist +X/+0, X the revealed nonland card's mana value", () => {
    const { s: s0, ap, opp, ids } = setup([erraticMutation]);
    const beast = putOnBattlefield(s0, opp, bigBeast());
    into(s0, ap, ogre(), "library");
    into(s0, ap, land("Some Land"), "library");
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(beast)]));
    expect(pt(s, beast)).toBe("7/2");
    const machinist = putOnBattlefield(s, ap, goblinMachinist);
    into(s, ap, gold(), "library");
    s = settle(activateNow(s, ap, machinist, 0));
    expect(pt(s, machinist)).toBe("4/5");
  });

  it("Explosive Revelation puts the nonland card into its caster's hand and the rest on the bottom", () => {
    const { s: s0, ap, opp, ids } = setup([explosiveRevelation]);
    const beast = putOnBattlefield(s0, opp, bigBeast());
    const ogreCard = into(s0, ap, ogre(), "library");
    const l1 = into(s0, ap, land("First Land"), "library");
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(beast)]));
    expect(dmg(s, beast)).toBe(3);
    expect(zone(s, ogreCard)).toBe("hand");
    expect(s.players[ap]!.library.at(-1)).toBe(l1);
  });

  it("Martyr of Ashes reveals X red cards, which stay in the hand, and deals X damage to each creature without flying", () => {
    const { s: s0, ap, opp } = setup([]);
    const martyr = putOnBattlefield(s0, ap, martyrOfAshes);
    const reds = [into(s0, ap, ogre()), into(s0, ap, ogre())];
    const greenCard = into(s0, ap, greenBear());
    const beast = putOnBattlefield(s0, opp, bigBeast());
    const bird = putOnBattlefield(s0, opp, roc());
    // X is how many cards are revealed; a green card can't be one of them.
    expect(planActivate(s0, ap, martyr, 0, [], undefined, undefined, 2, { reveal: [reds[0]!, greenCard] })).toBeNull();
    expect(planActivate(s0, ap, martyr, 0, [], undefined, undefined, 2, { reveal: [reds[0]!] })).toBeNull();
    const s = settle(activateNow(s0, ap, martyr, 0, [], 2, { reveal: reds }));
    expect(zone(s, martyr)).toBe("graveyard");
    for (const id of reds) expect(zone(s, id)).toBe("hand");
    expect(dmg(s, beast)).toBe(2);
    expect(dmg(s, bird)).toBe(0);
  });

  it("Martyr of Spores, Martyr of Sands and Martyr of Frost use the X revealed", () => {
    const { s: s0, ap, opp } = setup([]);
    const spores = putOnBattlefield(s0, ap, martyrOfSpores);
    const sands = putOnBattlefield(s0, ap, martyrOfSands);
    const greens = [into(s0, ap, greenBear()), into(s0, ap, bigBeast())];
    const whites = [into(s0, ap, roc()), into(s0, ap, roc()), into(s0, ap, roc())];
    const beast = putOnBattlefield(s0, ap, bigBeast());
    let s = settle(activateNow(s0, ap, spores, 0, [tgt(beast)], 2, { reveal: greens }));
    expect(pt(s, beast)).toBe("6/7");
    const before = life(s, ap);
    s = settle(activateNow(s, ap, sands, 0, [], 3, { reveal: whites }));
    expect(life(s, ap)).toBe(before + 9);
    // Martyr of Frost: its controller is the opponent here, countering our spell unless we pay {X}.
    const frost = putOnBattlefield(s, opp, martyrOfFrost);
    const blues = [into(s, opp, sorcery("Blue One", "{U}", 1)), into(s, opp, sorcery("Blue Two", "{1}{U}", 2))];
    const spell = into(s, ap, greenBear());
    for (const id of [...s.battlefield]) if (s.objects[id]!.controller === ap && characteristics(s, s.objects[id]!).types.includes("Land")) s.objects[id]!.tapped = true;
    invalidateCharacteristics(s);
    s.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 2, C: 0 };
    s = run(s, planCast(s, ap, spell, []));
    s = priorityTo(s, opp);
    s.players[opp]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 };
    s = settle(activateNow(s, opp, frost, 0, [{ kind: "stack", id: s.stack[0]!.id }], 2, { reveal: blues }));
    expect(zone(s, spell)).toBe("graveyard");
    expect(zone(s, frost)).toBe("graveyard");
  });
});
