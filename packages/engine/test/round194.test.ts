// Round 194: more of the harder cards both lanes skipped, from the most played down: "each opponent loses life equal to
// the number of creatures attacking them" (Within Range), "+X/+0, where X is the number of lands defending player
// controls" (Elturel Survivors), "dies or is put into exile while its power is 4 or greater" (Syr Vondam), "the greatest
// power among creatures sacrificed this way" and "Madness—{2}{B}, Pay 8 life" (Shadowgrange Archfiend), "each Dragon you
// control deals 1 damage to that creature" (Sarkhan the Masterless), "you may pay {X}. If you do, return another target
// Zombie creature card with mana value X" (Relentless Dead), Shelinda's "if its power is less than ~'s power. Otherwise",
// "you may pay {2} and sacrifice a token" (Killer Service, Conspiracy Theorist), Anax's "if the creature had power 4 or
// greater", Koll's "if it was enchanted or equipped", "~ or a commander you control attacks alone" (Ironsoul Enforcer),
// Archon of Coronation's "damage doesn't cause you to lose life", "attach any number of target Equipment" (Armory
// Automaton), a required "for each opponent" target (Blatant Thievery, Sylvan Primordial, Frenzied Gorespawn), Dreadhound,
// Mindblade Render, "Spend only black mana on X" (Crypt Rats), "pay {1}{R} and discard a card" (Wolf of Devil's Breach)
// and "pay {1} and sacrifice an artifact" (Sokenzan Smelter).

import { describe, expect, it } from "vitest";
import { act, addEffect, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { castProblem, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; "you may" questions get `yes`. Stops at any other question. */
const resolveAll = (s: GameState, yes = true) => {
  for (let i = 0; i < 120 && (s.stack.length || s.triggerQueue.length || s.pending?.kind === "chooseMay"); i++) {
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes });
    else if (s.pending) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const choose = (s: GameState, targets: TargetChoice[]) => (s.pending?.kind === "chooseTargets" ? act(s, { type: "chooseTargets", player: s.pending.player, targets }) : s);
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const counters = (s: GameState, id: string, c = "+1/+1") => s.objects[id]!.counters[c] ?? 0;
const pt = (s: GameState, id: ObjectId) => [power(s, s.objects[id]!), toughness(s, s.objects[id]!)];
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && s.cards[s.objects[id]!.cardId]!.name === name);
const next = (s: GameState, pid: PlayerId, k = 1) => s.turnOrder[(s.turnOrder.indexOf(pid) + k) % 4]!;
const creature = (name: string, sub: string, p: number, t = p, cost = "{G}") => card(name, `Creature — ${sub}`, cost, { cmc: cost.match(/\{/g)?.length ?? 0, power: String(p), toughness: String(t) });
const murder = card("Test Murder", "Instant", "{B}", { cmc: 1, oracleText: "Destroy target creature." });
const banish = card("Test Banish", "Instant", "{W}", { cmc: 1, oracleText: "Exile target creature." });
const rummage = card("Test Rummage", "Sorcery", "{R}", { cmc: 1, oracleText: "Discard a card." });
const sword = card("Test Sword", "Artifact — Equipment", "{1}", { cmc: 1, oracleText: "Equipped creature gets +1/+1.\nEquip {1}" });
const walker = card("Test Walker", "Legendary Planeswalker — Jace", "{3}", { cmc: 3, loyalty: "3", oracleText: "+1: Draw a card." });
const forestCard = card("Forest", "Basic Land — Forest");

// Real oracle text (Scryfall).
const withinRange = card("Within Range", "Enchantment", "{3}{B}", {"cmc":4,"keywords":[],"oracleText":"When this enchantment enters, create two 1/1 red Warrior creature tokens.\nWhenever you attack, each opponent loses life equal to the number of creatures attacking them.","colors":["B"]});
const elturel = card("Elturel Survivors", "Creature — Tiefling Peasant", "{3}{R}", {"cmc":4,"power":"0","toughness":"4","keywords":["Trample","Myriad"],"oracleText":"Trample, myriad (Whenever this creature attacks, for each opponent other than defending player, you may create a token copy that's tapped and attacking that player or a planeswalker they control. Exile the tokens at end of combat.)\nAs long as this creature is attacking, it gets +X/+0, where X is the number of lands defending player controls.","colors":["R"]});
const vondam = card("Syr Vondam, Sunstar Exemplar", "Legendary Creature — Human Knight", "{W}{B}", {"cmc":2,"power":"2","toughness":"2","keywords":["Vigilance","Menace"],"oracleText":"Vigilance, menace\nWhenever another creature you control dies or is put into exile, put a +1/+1 counter on Syr Vondam and you gain 1 life.\nWhen Syr Vondam dies or is put into exile while its power is 4 or greater, destroy up to one target nonland permanent.","colors":["B","W"]});
const shadowgrange = card("Shadowgrange Archfiend", "Creature — Demon", "{6}{B}", {"cmc":7,"power":"8","toughness":"4","keywords":["Madness"],"oracleText":"When this creature enters, each opponent sacrifices a creature with the greatest power among creatures they control. You gain life equal to the greatest power among creatures sacrificed this way.\nMadness—{2}{B}, Pay 8 life. (If you discard this card, discard it into exile. When you do, cast it for its madness cost or put it into your graveyard.)","colors":["B"]});
const sarkhan = card("Sarkhan the Masterless", "Legendary Planeswalker — Sarkhan", "{3}{R}{R}", {"cmc":5,"loyalty":"5","keywords":[],"oracleText":"Whenever a creature attacks you or a planeswalker you control, each Dragon you control deals 1 damage to that creature.\n+1: Until end of turn, each planeswalker you control becomes a 4/4 red Dragon creature and gains flying.\n−3: Create a 4/4 red Dragon creature token with flying.","colors":["R"]});
const relentless = card("Relentless Dead", "Creature — Zombie", "{B}{B}", {"cmc":2,"power":"2","toughness":"2","keywords":["Menace"],"oracleText":"Menace (This creature can't be blocked except by two or more creatures.)\nWhen this creature dies, you may pay {B}. If you do, return it to its owner's hand.\nWhen this creature dies, you may pay {X}. If you do, return another target Zombie creature card with mana value X from your graveyard to the battlefield.","colors":["B"]});
const shelinda = card("Shelinda, Yevon Acolyte", "Legendary Creature — Human Cleric", "{G}{W}", {"cmc":2,"power":"2","toughness":"2","keywords":["Lifelink"],"oracleText":"Lifelink\nWhenever another creature you control enters, put a +1/+1 counter on that creature if its power is less than Shelinda's power. Otherwise, put a +1/+1 counter on Shelinda.","colors":["G","W"]});
const killer = card("Killer Service", "Enchantment", "{2}{G}", {"cmc":3,"keywords":["Food"],"oracleText":"When this enchantment enters, create a number of Food tokens equal to the number of opponents you have. (They're artifacts with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")\nAt the beginning of your end step, you may pay {2} and sacrifice a token. If you do, create a 4/4 green Rhino Warrior creature token.","colors":["G"]});
const anax = card("Anax, Hardened in the Forge", "Legendary Enchantment Creature — Demigod", "{1}{R}{R}", {"cmc":3,"power":"*","toughness":"3","keywords":[],"oracleText":"Anax's power is equal to your devotion to red. (Each {R} in the mana costs of permanents you control counts toward your devotion to red.)\nWhenever Anax or another nontoken creature you control dies, create a 1/1 red Satyr creature token with \"This token can't block.\" If the creature had power 4 or greater, create two of those tokens instead.","colors":["R"]});
const koll = card("Koll, the Forgemaster", "Legendary Creature — Dwarf Warrior", "{R}{W}", {"cmc":2,"power":"2","toughness":"2","keywords":[],"oracleText":"Whenever another nontoken creature you control dies, if it was enchanted or equipped, return it to its owner's hand.\nCreature tokens you control that are enchanted or equipped get +1/+1.","colors":["R","W"]});
const ironsoul = card("Ironsoul Enforcer", "Artifact Creature — Human Samurai", "{4}{W}", {"cmc":5,"power":"4","toughness":"4","keywords":[],"oracleText":"Whenever this creature or a commander you control attacks alone, return target artifact card from your graveyard to the battlefield.","colors":["W"]});

const archon = card("Archon of Coronation", "Creature — Archon", "{4}{W}{W}", {"cmc":6,"power":"5","toughness":"5","keywords":["Flying"],"oracleText":"Flying\nWhen this creature enters, you become the monarch.\nAs long as you're the monarch, damage doesn't cause you to lose life. (When a creature deals combat damage to you, its controller still becomes the monarch.)","colors":["W"]});
const armory = card("Armory Automaton", "Artifact Creature — Construct", "{3}", {"cmc":3,"power":"2","toughness":"2","keywords":[],"oracleText":"Whenever this creature enters or attacks, you may attach any number of target Equipment to it. (Control of the Equipment doesn't change.)","colors":[]});
const thievery = card("Blatant Thievery", "Sorcery", "{4}{U}{U}{U}", {"cmc":7,"keywords":[],"oracleText":"For each opponent, gain control of target permanent that player controls.","colors":["U"]});
const dreadhound = card("Dreadhound", "Creature — Demon Dog", "{4}{B}{B}", {"cmc":6,"power":"6","toughness":"6","keywords":["Mill"],"oracleText":"When this creature enters, mill three cards. (Put the top three cards of your library into your graveyard.)\nWhenever a creature dies or a creature card is put into a graveyard from a library, each opponent loses 1 life.","colors":["B"]});
const render = card("Mindblade Render", "Creature — Azra Warrior", "{1}{B}", {"cmc":2,"power":"1","toughness":"3","keywords":[],"oracleText":"Whenever your opponents are dealt combat damage, if any of that damage was dealt by a Warrior, you draw a card and you lose 1 life.","colors":["B"]});
const cryptRats = card("Crypt Rats", "Creature — Rat", "{2}{B}", {"cmc":3,"power":"1","toughness":"1","keywords":[],"oracleText":"{X}: This creature deals X damage to each creature and each player. Spend only black mana on X.","colors":["B"]});
const hellkite = card("Crimson Hellkite", "Creature — Dragon", "{6}{R}{R}{R}", {"cmc":9,"power":"6","toughness":"6","keywords":["Flying"],"oracleText":"Flying\n{X}, {T}: This creature deals X damage to target creature. Spend only red mana on X.","colors":["R"]});

const sylvan = card("Sylvan Primordial", "Creature — Avatar", "{5}{G}{G}", {"cmc":7,"power":"6","toughness":"8","keywords":["Reach"],"oracleText":"Reach\nWhen this creature enters, for each opponent, destroy target noncreature permanent that player controls. Search your library for up to X Forest cards, where X is the number of permanents destroyed this way, put those cards onto the battlefield tapped, then shuffle.","colors":["G"]});
const gorespawn = card("Frenzied Gorespawn", "Creature — Horror", "{3}{B}{R}", {"cmc":5,"power":"4","toughness":"4","keywords":["Goad"],"oracleText":"When this creature enters, for each opponent, goad target creature that player controls. (Until your next turn, those creatures attack each combat if able and attack a player other than you if able.)\nWhenever one or more creatures attack one of your opponents, those creatures gain menace until end of turn.","colors":["B","R"]});
const wolf = card("Wolf of Devil's Breach", "Creature — Elemental Wolf", "{3}{R}{R}", {"cmc":5,"power":"5","toughness":"5","keywords":[],"oracleText":"Whenever this creature attacks, you may pay {1}{R} and discard a card. If you do, this creature deals damage to target creature or planeswalker equal to the discarded card's mana value.","colors":["R"]});
const smelter = card("Sokenzan Smelter", "Creature — Goblin Artificer", "{1}{R}", {"cmc":2,"power":"2","toughness":"2","keywords":[],"oracleText":"At the beginning of combat on your turn, you may pay {1} and sacrifice an artifact. If you do, create a 3/1 red Construct artifact creature token with haste.","colors":["R"]});

const ALL = [withinRange, elturel, vondam, shadowgrange, sarkhan, relentless, shelinda, killer, anax, koll, ironsoul, archon, armory, thievery, dreadhound, render, cryptRats, hellkite, sylvan, gorespawn, wolf, smelter];

describe("Round 194", () => {
  it("all compile", () => supported(...ALL));

  it("Within Range: each opponent loses life equal to the creatures attacking them, not their planeswalkers", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, withinRange);
    const [o1, o2, o3] = [next(s, ap), next(s, ap, 2), next(s, ap, 3)];
    const pw = putOnBattlefield(s, o3, walker);
    s.objects[pw]!.counters.loyalty = 3;
    const guys = [1, 2, 3, 4].map((i) => putOnBattlefield(s, ap, creature(`Test Guy ${i}`, "Warrior", 1)));
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: guys[0]!, defender: o1 }, { attacker: guys[1]!, defender: o1 }, { attacker: guys[2]!, defender: o2 }, { attacker: guys[3]!, defender: o3, planeswalker: pw }] });
    s = resolveAll(s);
    expect([life(s, o1), life(s, o2), life(s, o3)]).toEqual([38, 39, 40]);
  });

  it("Elturel Survivors: +X/+0 while attacking, X the lands defending player controls; 0/4 otherwise", () => {
    let { s, ap } = setup([]);
    const elt = putOnBattlefield(s, ap, elturel);
    const [o1, o2] = [next(s, ap), next(s, ap, 2)];
    for (let i = 0; i < 3; i++) putOnBattlefield(s, o1, forestCard);
    putOnBattlefield(s, o2, forestCard);
    expect(pt(s, elt)).toEqual([0, 4]);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: elt, defender: o1 }] });
    expect(pt(s, elt)).toEqual([3, 4]);
    s = resolveAll(s);
    if (s.pending?.kind === "chooseOption") s = act(s, { type: "chooseOption", player: s.pending.player, choice: s.pending.options[0]! });
    s = resolveAll(s);
    // Myriad's token attacking the second opponent counts that player's lands.
    const tokenVsO2 = s.battlefield.find((id) => s.objects[id]!.isToken && s.objects[id]!.attacking === o2);
    expect(tokenVsO2).toBeDefined();
    expect(pt(s, tokenVsO2!)).toEqual([1, 4]);
  });

  it("Syr Vondam: dying or exiled with power 4 or greater destroys up to one nonland permanent; with less, nothing", () => {
    let { s, ap, ids } = setup([murder, banish]);
    const opp = next(s, ap);
    const v = putOnBattlefield(s, ap, vondam);
    s.objects[v]!.counters["+1/+1"] = 2;
    const [x, y] = [putOnBattlefield(s, opp, creature("Test Ox", "Ox", 3)), putOnBattlefield(s, opp, creature("Test Yak", "Ox", 3))];
    invalidateCharacteristics(s);
    s = run(s, planCast(s, ap, ids[0]!, [tgt(v)]));
    s = resolveAll(s);
    s = choose(s, [tgt(x)]);
    s = resolveAll(s);
    expect(zone(s, v)).toBe("graveyard");
    expect(zone(s, x)).toBe("graveyard");
    // Power 3: no trigger, exiled or not.
    const v2 = putOnBattlefield(s, ap, vondam);
    s.objects[v2]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s);
    s = run(s, planCast(s, ap, ids[1]!, [tgt(v2)]));
    s = resolveAll(s);
    expect(s.pending?.kind).not.toBe("chooseTargets");
    expect(zone(s, v2)).toBe("exile");
    expect(zone(s, y)).toBe("battlefield");
  });

  it("Syr Vondam: exiled with power 4 triggers too", () => {
    let { s, ap, ids } = setup([banish]);
    const opp = next(s, ap);
    const v = putOnBattlefield(s, ap, vondam);
    s.objects[v]!.counters["+1/+1"] = 2;
    const x = putOnBattlefield(s, opp, creature("Test Ox", "Ox", 3));
    invalidateCharacteristics(s);
    s = run(s, planCast(s, ap, ids[0]!, [tgt(v)]));
    s = resolveAll(s);
    s = choose(s, [tgt(x)]);
    s = resolveAll(s);
    expect(zone(s, x)).toBe("graveyard");
  });

  it("Shadowgrange Archfiend: each opponent sacrifices its greatest-power creature; you gain the greatest power sacrificed", () => {
    let { s, ap, ids } = setup([shadowgrange]);
    const [o1, o2] = [next(s, ap), next(s, ap, 2)];
    const small = putOnBattlefield(s, o1, creature("Test Small", "Ox", 2));
    const big = putOnBattlefield(s, o1, creature("Test Big", "Ox", 5));
    const mid = putOnBattlefield(s, o2, creature("Test Mid", "Ox", 3));
    s = run(s, planCast(s, ap, ids[0]!));
    s = resolveAll(s);
    expect(zone(s, big)).toBe("graveyard");
    expect(zone(s, small)).toBe("battlefield");
    expect(zone(s, mid)).toBe("graveyard");
    expect(life(s, ap)).toBe(45);
  });

  it("Shadowgrange Archfiend: madness costs {2}{B} and 8 life; with less than 8 life it can't be cast that way", () => {
    let { s, ap, ids } = setup([rummage, shadowgrange]);
    s = run(s, planCast(s, ap, ids[0]!));
    s = resolveAll(s);
    if (s.pending?.kind === "discard") s = act(s, { type: "discard", player: ap, objectIds: [ids[1]!] });
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "castFree", how: "madness", objectId: ids[1] });
    const low = structuredClone(s);
    low.players[ap]!.life = 7;
    expect(castProblem(low, ap, ids[1]!)).toMatch(/life/);
    s = run(s, planCast(s, ap, ids[1]!));
    expect(life(s, ap)).toBe(32);
    s = resolveAll(s);
    expect(zone(s, ids[1]!)).toBe("battlefield");
  });

  it("Sarkhan the Masterless: a creature attacking you or your planeswalker is dealt 1 damage by each Dragon you control", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const sk = putOnBattlefield(s, ap, sarkhan);
    s.objects[sk]!.counters.loyalty = 5;
    const dragon = creature("Test Dragon", "Dragon", 4, 4, "{R}");
    putOnBattlefield(s, ap, dragon);
    putOnBattlefield(s, ap, dragon);
    const ox = putOnBattlefield(s, opp, creature("Test Ox", "Ox", 2));
    const yak = putOnBattlefield(s, opp, creature("Test Yak", "Ox", 3));
    s = passUntil(s, "declareAttackers", opp);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: ox, defender: ap }, { attacker: yak, defender: ap, planeswalker: sk }] });
    s = resolveAll(s);
    expect(zone(s, ox)).toBe("graveyard");
    expect(s.objects[yak]!.damage).toBe(2);
  });

  it("Sarkhan the Masterless: no trigger for a creature attacking another player", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    putOnBattlefield(s, ap, sarkhan);
    putOnBattlefield(s, ap, creature("Test Dragon", "Dragon", 4, 4, "{R}"));
    const ox = putOnBattlefield(s, opp, creature("Test Ox", "Ox", 2));
    s = passUntil(s, "declareAttackers", opp);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: ox, defender: next(s, opp) === ap ? next(s, opp, 2) : next(s, opp) }] });
    expect(s.stack.length + s.triggerQueue.length).toBe(0);
  });

  it("Relentless Dead: pay the target Zombie card's mana value to return it", () => {
    let { s, ap, ids } = setup([murder]);
    const rd = putOnBattlefield(s, ap, relentless);
    const ghoul = into(s, ap, creature("Test Ghoul", "Zombie", 2, 2, "{2}{B}"), "graveyard");
    s = run(s, planCast(s, ap, ids[0]!, [tgt(rd)]));
    for (let i = 0; i < 20 && (s.stack.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: [tgt(ghoul)] });
      else if (p?.kind === "chooseMay") {
        if (/\{B\}/.test(p.prompt) && !/X/.test(p.prompt)) s = act(s, { type: "chooseMay", player: p.player, yes: false });
        else {
          expect(p.prompt).toMatch(/\{3\}/);
          s.players[ap]!.manaPool.B += 3;
          s = act(s, { type: "chooseMay", player: p.player, yes: true });
        }
      } else if (p) throw new Error(`unexpected ${p.kind}`);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(zone(s, ghoul)).toBe("battlefield");
    expect(zone(s, rd)).toBe("graveyard");
  });

  it("Shelinda: a smaller creature entering gets the counter; otherwise Shelinda does", () => {
    let { s, ap, ids } = setup([creature("Test Elf", "Elf", 1), creature("Test Giant", "Giant", 3)]);
    const sh = putOnBattlefield(s, ap, shelinda);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(counters(s, ids[0]!)).toBe(1);
    expect(counters(s, sh)).toBe(0);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(counters(s, ids[1]!)).toBe(0);
    expect(counters(s, sh)).toBe(1);
  });

  it("Killer Service: at your end step, pay {2} and sacrifice a token for a 4/4 Rhino", () => {
    let { s, ap, ids } = setup([killer]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    const foods = named(s, ap, "Food Token");
    expect(foods).toHaveLength(3);
    s = passUntil(s, "end", ap);
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", pay: { mana: "{2}" } });
    s.players[ap]!.manaPool.G += 2;
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    for (let i = 0; i < 10 && s.pending && s.pending.kind !== "pickPermanents"; i++) s = resolveAll(s);
    if (s.pending?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: ap, ids: [foods[0]!] });
    s = resolveAll(s);
    expect(named(s, ap, "Food Token")).toHaveLength(2);
    expect(named(s, ap, "Rhino Warrior Token")).toHaveLength(1);
  });

  it("Killer Service: without a token, it doesn't ask", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, killer);
    s = passUntil(s, "end", ap);
    for (let i = 0; i < 20 && !s.pending && s.step === "end"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).not.toBe("chooseMay");
  });

  it("Anax: a creature with power 4 or greater dying makes two Satyrs, a smaller one one", () => {
    let { s, ap, ids } = setup([murder, murder]);
    putOnBattlefield(s, ap, anax);
    const big = putOnBattlefield(s, ap, creature("Test Big", "Ox", 4));
    const small = putOnBattlefield(s, ap, creature("Test Small", "Ox", 2));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(big)])));
    expect(named(s, ap, "Satyr Token")).toHaveLength(2);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(small)])));
    expect(named(s, ap, "Satyr Token")).toHaveLength(3);
  });

  it("Koll: an equipped nontoken creature that dies returns to its owner's hand; an unequipped one doesn't; equipped tokens get +1/+1", () => {
    let { s, ap, ids } = setup([murder, murder]);
    putOnBattlefield(s, ap, koll);
    const eq = putOnBattlefield(s, ap, creature("Test Knight", "Knight", 2));
    const plain = putOnBattlefield(s, ap, creature("Test Squire", "Knight", 2));
    const sw = putOnBattlefield(s, ap, sword);
    s.objects[sw]!.attachedTo = eq;
    const tok = putOnBattlefield(s, ap, creature("Test Token", "Soldier", 1));
    s.objects[tok]!.isToken = true;
    const sw2 = putOnBattlefield(s, ap, sword);
    s.objects[sw2]!.attachedTo = tok;
    invalidateCharacteristics(s);
    expect(pt(s, tok)).toEqual([3, 3]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(eq)])));
    expect(zone(s, eq)).toBe("hand");
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(plain)])));
    expect(zone(s, plain)).toBe("graveyard");
  });

  it("Ironsoul Enforcer: it or your commander attacking alone returns an artifact card; two attackers don't", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const iron = putOnBattlefield(s, ap, ironsoul);
    const cmd = putOnBattlefield(s, ap, creature("Test Cmdr", "Elf", 3), { commander: true });
    const art = into(s, ap, sword, "graveyard");
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: cmd, defender: opp }] });
    s = choose(s, [tgt(art)]);
    s = resolveAll(s);
    expect(zone(s, art)).toBe("battlefield");
    expect(controllerOf(s, s.objects[iron]!)).toBe(ap);
  });

  it("Ironsoul Enforcer: attacking alone itself triggers; with another attacker, nothing", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const iron = putOnBattlefield(s, ap, ironsoul);
    const other = putOnBattlefield(s, ap, creature("Test Guy", "Elf", 3));
    const art = into(s, ap, sword, "graveyard");
    const t = structuredClone(s);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: iron, defender: opp }] });
    s = choose(s, [tgt(art)]);
    s = resolveAll(s);
    expect(zone(s, art)).toBe("battlefield");
    let u = passUntil(t, "declareAttackers", ap);
    u = act(u, { type: "declareAttackers", player: ap, attacks: [{ attacker: iron, defender: opp }, { attacker: other, defender: opp }] });
    expect(u.pending?.kind).not.toBe("chooseTargets");
    u = resolveAll(u);
    expect(zone(u, art)).toBe("graveyard");
  });

  it("Archon of Coronation: while you're the monarch, damage doesn't make you lose life; lifelink, commander damage and the monarch still change", () => {
    const shock = card("Test Shock", "Instant", "{R}", { cmc: 1, oracleText: "Test Shock deals 2 damage to any target." });
    let { s, ap, ids } = setup([shock]);
    const opp = next(s, ap);
    putOnBattlefield(s, opp, archon);
    s.monarch = opp;
    const cmdr = putOnBattlefield(s, ap, creature("Test Leech", "Leech", 3, 3, "{B}"), { commander: true });
    addEffect(s, ap, [cmdr], [{ kind: "addKeywords", keywords: ["Lifelink"] }], "game");
    const myLife = life(s, ap);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: cmdr, defender: opp }] });
    s = passUntil(s, "endCombat", ap);
    expect(life(s, opp)).toBe(40);
    expect(life(s, ap)).toBe(myLife + 3);
    expect(s.players[opp]!.commanderDamage[cmdr]).toBe(3);
    s = resolveAll(s);
    expect(s.monarch).toBe(ap);
    // No longer the monarch: damage makes them lose life again.
    s = passUntil(s, "main2", ap);
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }]));
    s = resolveAll(s);
    expect(life(s, opp)).toBe(38);
  });

  it("Armory Automaton: entering, it may attach any number of target Equipment to itself, an opponent's too, whose control doesn't change", () => {
    let { s, ap, ids } = setup([armory]);
    const opp = next(s, ap);
    const mySword = putOnBattlefield(s, ap, sword);
    const theirSword = putOnBattlefield(s, opp, { ...sword, name: "Test Saber" });
    const ox = putOnBattlefield(s, opp, creature("Test Ox", "Ox", 2));
    s.objects[theirSword]!.attachedTo = ox;
    invalidateCharacteristics(s);
    s = passUntil(s, "main1", ap);
    s = run(s, planCast(s, ap, ids[0]!));
    s = resolveAll(s);
    expect(s.pending?.kind).toBe("chooseTargets");
    s = choose(s, [tgt(mySword), tgt(theirSword)]);
    s = resolveAll(s);
    const me = ids[0]!;
    expect(s.objects[mySword]!.attachedTo).toBe(me);
    expect(s.objects[theirSword]!.attachedTo).toBe(me);
    expect(controllerOf(s, s.objects[theirSword]!)).toBe(opp);
    expect(pt(s, me)).toEqual([4, 4]);
  });

  it("Armory Automaton: choosing no Equipment, nothing moves", () => {
    let { s, ap, ids } = setup([armory]);
    const mySword = putOnBattlefield(s, ap, sword);
    s = passUntil(s, "main1", ap);
    s = run(s, planCast(s, ap, ids[0]!));
    s = resolveAll(s);
    s = choose(s, []);
    s = resolveAll(s);
    expect(s.objects[mySword]!.attachedTo).toBeUndefined();
  });

  it("Blatant Thievery: one target for each opponent, each required; you gain control of all of them", () => {
    let { s, ap, ids } = setup([thievery]);
    const [o1, o2, o3] = [next(s, ap), next(s, ap, 2), next(s, ap, 3)];
    const [a, b, c] = [putOnBattlefield(s, o1, creature("Test Ox", "Ox", 2)), putOnBattlefield(s, o2, sword), putOnBattlefield(s, o3, forestCard)];
    s = passUntil(s, "main1", ap);
    s.players[ap]!.manaPool.U += 7;
    // Leaving an opponent's target out isn't allowed.
    expect(planCast(s, ap, ids[0]!, [tgt(a), tgt(b), { kind: "none" }])).toBeNull();
    expect(planCast(s, ap, ids[0]!, [tgt(a), tgt(b)])).toBeNull();
    // Each target must be the right opponent's.
    expect(planCast(s, ap, ids[0]!, [tgt(b), tgt(a), tgt(c)])).toBeNull();
    s = run(s, planCast(s, ap, ids[0]!, [tgt(a), tgt(b), tgt(c)]));
    s = resolveAll(s);
    expect([a, b, c].map((id) => controllerOf(s, s.objects[id]!))).toEqual([ap, ap, ap]);
  });

  it("Blatant Thievery: an opponent with nothing to target gets no target; the others' are still required", () => {
    let { s, ap, ids } = setup([thievery]);
    const [o1, o2, o3] = [next(s, ap), next(s, ap, 2), next(s, ap, 3)];
    for (const p of [o1, o2, o3]) for (const id of s.battlefield.filter((x) => controllerOf(s, s.objects[x]!) === p)) s.battlefield.splice(s.battlefield.indexOf(id), 1);
    const [a, c] = [putOnBattlefield(s, o1, forestCard), putOnBattlefield(s, o3, sword)];
    invalidateCharacteristics(s);
    s = passUntil(s, "main1", ap);
    s.players[ap]!.manaPool.U += 7;
    expect(planCast(s, ap, ids[0]!, [tgt(a), { kind: "none" }, { kind: "none" }])).toBeNull();
    s = run(s, planCast(s, ap, ids[0]!, [tgt(a), { kind: "none" }, tgt(c)]));
    s = resolveAll(s);
    expect([a, c].map((id) => controllerOf(s, s.objects[id]!))).toEqual([ap, ap]);
  });

  it("Dreadhound: each creature card milled and each creature dying makes each opponent lose 1 life", () => {
    let { s, ap, ids } = setup([dreadhound, murder]);
    const [o1, o2, o3] = [next(s, ap), next(s, ap, 2), next(s, ap, 3)];
    into(s, ap, creature("Test Ox", "Ox", 2), "library");
    into(s, ap, forestCard, "library");
    into(s, ap, creature("Test Yak", "Ox", 2), "library");
    const bear = putOnBattlefield(s, o1, creature("Test Bear", "Bear", 2));
    s = passUntil(s, "main1", ap);
    s.players[ap]!.manaPool.B += 7;
    s = run(s, planCast(s, ap, ids[0]!));
    s = resolveAll(s);
    // Two creature cards of the three milled.
    expect([life(s, o1), life(s, o2), life(s, o3)]).toEqual([38, 38, 38]);
    s = run(s, planCast(s, ap, ids[1]!, [tgt(bear)]));
    s = resolveAll(s);
    expect([life(s, o1), life(s, o2), life(s, o3), life(s, ap)]).toEqual([37, 37, 37, 40]);
  });

  it("Mindblade Render: once for all the combat damage Warriors deal to your opponents; not for other creatures", () => {
    let { s, ap } = setup([]);
    const [o1, o2] = [next(s, ap), next(s, ap, 2)];
    putOnBattlefield(s, ap, render);
    const w1 = putOnBattlefield(s, ap, creature("Test Brave", "Warrior", 2));
    const w2 = putOnBattlefield(s, ap, creature("Test Brute", "Warrior", 2));
    const ox = putOnBattlefield(s, ap, creature("Test Ox", "Ox", 2));
    const hand = s.players[ap]!.hand.length;
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: w1, defender: o1 }, { attacker: w2, defender: o2 }, { attacker: ox, defender: o2 }] });
    s = passUntil(s, "endCombat", ap);
    s = resolveAll(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(life(s, ap)).toBe(39);
    // Only a non-Warrior dealing the damage: nothing.
    const ox2 = putOnBattlefield(s, o1, creature("Test Yak", "Ox", 2));
    s = passUntil(s, "declareAttackers", o1);
    s = act(s, { type: "declareAttackers", player: o1, attacks: [{ attacker: ox2, defender: o2 }] });
    s = passUntil(s, "endCombat", o1);
    s = resolveAll(s);
    expect(life(s, ap)).toBe(39);
  });

  it("Mindblade Render: an opponent's Warrior dealing combat damage to another opponent triggers it; to you, not", () => {
    let { s, ap } = setup([]);
    const [o1, o2] = [next(s, ap), next(s, ap, 2)];
    putOnBattlefield(s, ap, render);
    const theirs = putOnBattlefield(s, o1, creature("Test Brave", "Warrior", 2));
    const theirs2 = putOnBattlefield(s, o1, creature("Test Brute", "Warrior", 2));
    s = passUntil(s, "declareAttackers", o1);
    s = act(s, { type: "declareAttackers", player: o1, attacks: [{ attacker: theirs, defender: ap }] });
    s = passUntil(s, "endCombat", o1);
    s = resolveAll(s);
    expect(life(s, ap)).toBe(38);
    s = passUntil(s, "declareAttackers", o1);
    s = act(s, { type: "declareAttackers", player: o1, attacks: [{ attacker: theirs, defender: o2 }, { attacker: theirs2, defender: o2 }] });
    s = passUntil(s, "endCombat", o1);
    s = resolveAll(s);
    expect(life(s, ap)).toBe(37);
  });

  it("Crypt Rats: X paid with black mana only; X damage to each creature and each player", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    s = passUntil(s, "main1", ap);
    for (const id of s.battlefield.filter((x) => controllerOf(s, s.objects[x]!) === ap)) s.battlefield.splice(s.battlefield.indexOf(id), 1);
    const rats = putOnBattlefield(s, ap, cryptRats);
    const giant = putOnBattlefield(s, opp, creature("Test Giant", "Giant", 3));
    const ox = putOnBattlefield(s, opp, creature("Test Ox", "Ox", 2));
    s.players[ap]!.manaPool.B = 2;
    s.players[ap]!.manaPool.R = 3;
    expect(planActivate(s, ap, rats, 0, undefined, undefined, undefined, 3)).toBeNull();
    s = run(s, planActivate(s, ap, rats, 0, undefined, undefined, undefined, 2));
    expect(s.players[ap]!.manaPool.R).toBe(3);
    s = resolveAll(s);
    expect([zone(s, rats), zone(s, ox), zone(s, giant)]).toEqual(["graveyard", "graveyard", "battlefield"]);
    expect(s.turnOrder.map((p) => life(s, p))).toEqual([38, 38, 38, 38]);
  });

  it("Sylvan Primordial: one noncreature permanent of each opponent who has one is destroyed; that many Forests", () => {
    let { s, ap, ids } = setup([sylvan]);
    const [o1, o2, o3] = [next(s, ap), next(s, ap, 2), next(s, ap, 3)];
    for (const p of [o1, o2, o3]) for (const id of s.battlefield.filter((x) => controllerOf(s, s.objects[x]!) === p)) s.battlefield.splice(s.battlefield.indexOf(id), 1);
    const [a, b] = [putOnBattlefield(s, o1, sword), putOnBattlefield(s, o3, forestCard)];
    putOnBattlefield(s, o2, creature("Test Ox", "Ox", 2));
    const forests = [into(s, ap, forestCard, "library"), into(s, ap, forestCard, "library"), into(s, ap, forestCard, "library")];
    s = passUntil(s, "main1", ap);
    s.players[ap]!.manaPool.G += 7;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.pending?.kind).toBe("chooseTargets");
    // Ben has only a creature: no target for him.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(a), { kind: "none" }, { kind: "none" }] })).toThrow();
    s = choose(s, [tgt(a), { kind: "none" }, tgt(b)]);
    s = resolveAll(s);
    expect([zone(s, a), zone(s, b)]).toEqual(["graveyard", "graveyard"]);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", max: 2 });
    s = act(s, { type: "searchLibrary", player: ap, found: forests.slice(0, 2) });
    s = resolveAll(s);
    expect(forests.filter((id) => zone(s, id) === "battlefield")).toHaveLength(2);
  });

  it("Frenzied Gorespawn: one creature of each opponent who has one is goaded", () => {
    let { s, ap, ids } = setup([gorespawn]);
    const [o1, o3] = [next(s, ap), next(s, ap, 3)];
    const [x, y] = [putOnBattlefield(s, o1, creature("Test Ox", "Ox", 2)), putOnBattlefield(s, o3, creature("Test Yak", "Ox", 2))];
    s = passUntil(s, "main1", ap);
    s.players[ap]!.manaPool.B += 5;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.pending?.kind).toBe("chooseTargets");
    s = choose(s, [tgt(x), { kind: "none" }, tgt(y)]);
    s = resolveAll(s);
    expect([x, y].map((id) => characteristics(s, s.objects[id]!).goadedBy)).toEqual([[ap], [ap]]);
  });

  it("Wolf of Devil's Breach: pay {1}{R} and discard a card to deal damage equal to its mana value to the target", () => {
    const giantCard = creature("Test Giant", "Giant", 3, 3, "{3}{R}");
    let { s, ap, ids } = setup([giantCard]);
    const opp = next(s, ap);
    const w = putOnBattlefield(s, ap, wolf);
    const target = putOnBattlefield(s, opp, creature("Test Wurm", "Wurm", 4, 4));
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: w, defender: opp }] });
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = choose(s, [tgt(target)]);
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", pay: { mana: "{1}{R}" } });
    s.players[ap]!.manaPool.R += 2;
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    if (s.pending?.kind === "discard") s = act(s, { type: "discard", player: ap, objectIds: [ids[0]!] });
    s = resolveAll(s);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(zone(s, target)).toBe("graveyard");
  });

  it("Sokenzan Smelter: at the beginning of combat, pay {1} and sacrifice an artifact for a 3/1 Construct with haste", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, smelter);
    const art = putOnBattlefield(s, ap, sword);
    s = passUntil(s, "beginCombat", ap);
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", pay: { mana: "{1}" } });
    s.players[ap]!.manaPool.R += 1;
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    if (s.pending?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: ap, ids: [art] });
    s = resolveAll(s);
    expect(zone(s, art)).toBe("graveyard");
    const tok = named(s, ap, "Construct Token");
    expect(tok).toHaveLength(1);
    expect(pt(s, tok[0]!)).toEqual([3, 1]);
  });
});
