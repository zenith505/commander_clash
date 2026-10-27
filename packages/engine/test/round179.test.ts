// Round 179: the most played cards still unsupported, in popularity order, from about rank 10,640 on, and the cards
// that share their templates.

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, island, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { characteristics, compileCard, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, parseManaCost, planActivate, planCast, planMana, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Says yes (or no) to a "you may" question, paying its mana first. */
const may = (s: GameState, yes: boolean) => {
  if (s.pending?.kind !== "chooseMay") throw new Error("no question");
  const pid = s.pending.player;
  if (yes && s.pending.pay?.mana) for (const a of planMana(s, pid, parseManaCost(s.pending.pay.mana))!) s = act(s, a);
  return act(s, { type: "chooseMay", player: pid, yes });
};
/** Everyone passes until the stack is empty; "you may" questions get `yes`. Stops at any other question. */
const resolveAll = (s: GameState, yes = true) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending?.kind === "chooseMay"); i++) {
    if (s.pending?.kind === "chooseMay") s = may(s, yes);
    else if (s.pending) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** A card put straight into a zone, not from the battlefield. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else if (zone !== "exile") s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) =>
  settle(act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks }));
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const counters = (s: GameState, id: string, c = "+1/+1") => s.objects[id]!.counters[c] ?? 0;
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && [name, `${name} Token`].includes(characteristics(s, s.objects[id]!).name));
const lands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).types.includes("Land"));
const murder = card("Test Murder", "Instant", "{1}", { cmc: 1, oracleText: "Destroy target creature." });
const opt = card("Opt", "Instant", "{U}", { cmc: 1, oracleText: "Draw a card." });
const sword = card("Test Sword", "Artifact — Equipment", "{2}", { cmc: 2, oracleText: "Equipped creature gets +2/+2.\nEquip {2}" });
const axe = card("Test Axe", "Artifact — Equipment", "{1}", { cmc: 1, oracleText: "Equipped creature gets +1/+0.\nEquip {1}" });
const aura = card("Test Aura", "Enchantment — Aura", "{1}{W}", { cmc: 2, oracleText: "Enchant creature\nEnchanted creature gets +2/+2." });
const blueBear = card("Blue Bear", "Creature — Bear", "{1}{U}", { cmc: 2, power: "2", toughness: "2" });
const ogre = card("Hill Giant", "Creature — Giant", "{3}{R}", { cmc: 4, power: "3", toughness: "3" });
const warrior = card("Test Warrior", "Creature — Human Warrior", "{1}{W}", { cmc: 2, power: "2", toughness: "2" });

// Real oracle text (Scryfall).
const roaleskApexHybrid = card("Roalesk, Apex Hybrid", "Legendary Creature — Human Mutant", "{2}{G}{G}{U}", {cmc: 5,"power":"4","toughness":"5","keywords":["Flying","Trample","Proliferate"],"oracleText":"Flying, trample\nWhen Roalesk enters, put two +1/+1 counters on another target creature you control.\nWhen Roalesk dies, proliferate, then proliferate again. (Choose any number of permanents and/or players, then give each another counter of each kind already there. Then do it again.)"});
const manaBreach = card("Mana Breach", "Enchantment", "{2}{U}", {cmc: 3,"oracleText":"Whenever a player casts a spell, that player returns a land they control to its owner's hand."});
const callerOfTheClaw = card("Caller of the Claw", "Creature — Elf", "{2}{G}", {cmc: 3,"power":"2","toughness":"2","keywords":["Flash"],"oracleText":"Flash\nWhen this creature enters, create a 2/2 green Bear creature token for each nontoken creature put into your graveyard from the battlefield this turn."});
const freshMeat = card("Fresh Meat", "Instant", "{3}{G}", {cmc: 4,"oracleText":"Create a 3/3 green Beast creature token for each creature put into your graveyard from the battlefield this turn."});
const urborgJustice = card("Urborg Justice", "Instant", "{B}{B}", {cmc: 2,"oracleText":"Target opponent sacrifices a creature of their choice for each creature put into your graveyard from the battlefield this turn."});
const obzedatGhostCouncil = card("Obzedat, Ghost Council", "Legendary Creature — Spirit Advisor", "{1}{W}{W}{B}{B}", {cmc: 5,"power":"5","toughness":"5","oracleText":"When Obzedat enters, target opponent loses 2 life and you gain 2 life.\nAt the beginning of your end step, you may exile Obzedat. If you do, return it to the battlefield under its owner's control at the beginning of your next upkeep. It gains haste.","colors":["B","W"]});
const heraldOfAmity = card("Herald of Amity", "Creature — Griffin", "{3}{W}", {cmc: 4,"power":"2","toughness":"2","keywords":["Flying"],"oracleText":"Flying\nWhen this creature enters, exile the top eight cards of your library. You may cast an Aura spell from among them without paying its mana cost. Then put the rest on the bottom of your library in a random order.\nWhenever this creature attacks, it gets +X/+X until end of turn, where X is the number of Auras you control."});
const ajaniUnyielding = card("Ajani Unyielding", "Legendary Planeswalker — Ajani", "{4}{G}{W}", {cmc: 6,"loyalty":"4","oracleText":"+2: Reveal the top three cards of your library. Put all nonland permanent cards revealed this way into your hand and the rest on the bottom of your library in any order.\n−2: Exile target creature. Its controller gains life equal to its power.\n−9: Put five +1/+1 counters on each creature you control and five loyalty counters on each other planeswalker you control."});
const bessSoulNourisher = card("Bess, Soul Nourisher", "Legendary Creature — Human Citizen", "{1}{G}{W}", {cmc: 3,"power":"1","toughness":"1","oracleText":"Whenever one or more other creatures you control with base power and toughness 1/1 enter, put a +1/+1 counter on Bess.\nWhenever Bess attacks, each other creature you control with base power and toughness 1/1 gets +X/+X until end of turn, where X is the number of +1/+1 counters on Bess."});
const duskanaTheRageMother = card("Duskana, the Rage Mother", "Legendary Creature — Bear", "{2}{R}{G}{W}", {cmc: 5,"power":"5","toughness":"5","oracleText":"When Duskana enters, draw a card for each creature you control with base power and toughness 2/2.\nWhenever a creature you control with base power and toughness 2/2 attacks, it gets +3/+3 until end of turn.","colors":["G","R","W"]});
const nahiriHeirOfTheAncients = card("Nahiri, Heir of the Ancients", "Legendary Planeswalker — Nahiri", "{2}{R}{W}", {cmc: 4,"loyalty":"4","oracleText":"+1: Create a 1/1 white Kor Warrior creature token. You may attach an Equipment you control to it.\n−2: Look at the top six cards of your library. You may reveal a Warrior or Equipment card from among them and put it into your hand. Put the rest on the bottom of your library in a random order.\n−3: Nahiri deals damage to target creature or planeswalker equal to twice the number of Equipment you control."});
const goldwardensGambit = card("Goldwardens' Gambit", "Sorcery", "{6}{R}{R}", {cmc: 8,"keywords":["Affinity"],"oracleText":"Affinity for Equipment (This spell costs {1} less to cast for each Equipment you control.)\nCreate five 2/2 red Rebel creature tokens. They gain haste until end of turn. For each of those tokens, you may attach an Equipment you control to it."});
const resoluteStrike = card("Resolute Strike", "Instant", "{W}", {cmc: 1,"oracleText":"Target creature gets +2/+2 until end of turn. If it's a Warrior, you may attach an Equipment you control to it."});
const expelFromOrazca = card("Expel from Orazca", "Instant", "{1}{U}", {cmc: 2,"keywords":["Ascend"],"oracleText":"Ascend (If you control ten or more permanents, you get the city's blessing for the rest of the game.)\nReturn target nonland permanent to its owner's hand. If you have the city's blessing, you may put that permanent on top of its owner's library instead."});
const mysticalDispute = card("Mystical Dispute", "Instant", "{2}{U}", {cmc: 3,"oracleText":"This spell costs {2} less to cast if it targets a blue spell.\nCounter target spell unless its controller pays {3}."});
const sternScolding = card("Stern Scolding", "Instant", "{U}", {cmc: 1,"oracleText":"Counter target creature spell with power or toughness 2 or less."});
const banewhipPunisher = card("Banewhip Punisher", "Creature — Human Warrior", "{2}{B}", {cmc: 3,"power":"2","toughness":"2","oracleText":"When this creature enters, you may put a -1/-1 counter on target creature.\n{B}, Sacrifice this creature: Destroy target creature that has a -1/-1 counter on it."});
const triadOfFates = card("Triad of Fates", "Legendary Creature — Human Wizard", "{2}{W}{B}", {cmc: 4,"power":"3","toughness":"3","oracleText":"{1}, {T}: Put a fate counter on another target creature.\n{W}, {T}: Exile target creature that has a fate counter on it, then return it to the battlefield under its owner's control.\n{B}, {T}: Exile target creature that has a fate counter on it. Its controller draws two cards.","colors":["B","W"]});
const foultongueShriek = card("Foul-Tongue Shriek", "Instant", "{B}", {cmc: 1,"oracleText":"Target opponent loses 1 life for each attacking creature you control. You gain that much life."});
const guildswornProwler = card("Guildsworn Prowler", "Creature — Tiefling Rogue Assassin", "{1}{B}", {cmc: 2,"power":"2","toughness":"1","keywords":["Deathtouch"],"oracleText":"Deathtouch\nWhen this creature dies, if it wasn't blocking, draw a card."});
const tendTheSprigs = card("Tend the Sprigs", "Sorcery", "{2}{G}", {cmc: 3,"oracleText":"Search your library for a basic land card, put it onto the battlefield tapped, then shuffle. Then if you control seven or more lands and/or Treefolk, create a 3/4 green Treefolk creature token with reach. (It can block creatures with flying.)"});
const dakkonShadowSlayer = card("Dakkon, Shadow Slayer", "Legendary Planeswalker — Dakkon", "{W}{U}{B}", {cmc: 3,"loyalty":"0","keywords":["Surveil"],"oracleText":"Dakkon enters with a number of loyalty counters on him equal to the number of lands you control.\n+1: Surveil 2.\n−3: Exile target creature.\n−6: You may put an artifact card from your hand or graveyard onto the battlefield.","colors":["B","U","W"]});
const anyaMercilessAngel = card("Anya, Merciless Angel", "Legendary Creature — Angel", "{3}{R}{W}", {cmc: 5,"power":"4","toughness":"4","keywords":["Flying"],"oracleText":"Flying\nAnya gets +3/+3 for each opponent whose life total is less than half their starting life total.\nAs long as an opponent's life total is less than half their starting life total, Anya has indestructible."});
const scarbladesMalice = card("Scarblade's Malice", "Instant", "{B}", {cmc: 1,"oracleText":"Target creature you control gains deathtouch and lifelink until end of turn. When that creature dies this turn, create a 2/2 black and green Elf creature token."});
const timeToFeed = card("Time to Feed", "Sorcery", "{2}{G}", {cmc: 3,"keywords":["Fight"],"oracleText":"Choose target creature an opponent controls. When that creature dies this turn, you gain 3 life. Target creature you control fights that creature. (Each deals damage equal to its power to the other.)"});
const curfew = card("Curfew", "Instant", "{U}", {cmc: 1,"oracleText":"Each player returns a creature they control to its owner's hand."});
const blizzardSpecter = card("Blizzard Specter", "Snow Creature — Specter", "{2}{U}{B}", {cmc: 4,"power":"2","toughness":"3","keywords":["Flying"],"oracleText":"Flying\nWhenever this creature deals combat damage to a player, choose one —\n• That player returns a permanent they control to its owner's hand.\n• That player discards a card.","colors":["B","U"]});
const asmiraHolyAvenger = card("Asmira, Holy Avenger", "Legendary Creature — Human Cleric", "{2}{G}{W}", {cmc: 4,"power":"2","toughness":"3","keywords":["Flying"],"oracleText":"Flying\nAt the beginning of each end step, put a +1/+1 counter on Asmira for each creature put into your graveyard from the battlefield this turn."});

describe("round 179", () => {
  it("compiles every card of the round", () => {
    supported(roaleskApexHybrid, manaBreach, callerOfTheClaw, freshMeat, urborgJustice, obzedatGhostCouncil, heraldOfAmity, ajaniUnyielding, bessSoulNourisher, duskanaTheRageMother, nahiriHeirOfTheAncients, goldwardensGambit, resoluteStrike, expelFromOrazca, mysticalDispute, sternScolding, banewhipPunisher, triadOfFates, foultongueShriek, guildswornProwler, tendTheSprigs, dakkonShadowSlayer, anyaMercilessAngel, scarbladesMalice, timeToFeed, curfew, blizzardSpecter, asmiraHolyAvenger);
  });

  it("Roalesk, Apex Hybrid: when it dies, proliferate, then proliferate again", () => {
    const { s: s0, ap, ids } = setup([murder]);
    const r = putOnBattlefield(s0, ap, roaleskApexHybrid);
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[b]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s0);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(r)])));
    expect(zone(s, r)).toBe("graveyard");
    expect(counters(s, b)).toBe(3);
  });

  it("Mana Breach: the player who cast the spell returns a land they control to its owner's hand", () => {
    const { s: s0, ap, ids } = setup([opt]);
    putOnBattlefield(s0, s0.turnOrder[1]!, manaBreach);
    const before = lands(s0, ap).length;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap });
    const pick = s.pending!.kind === "pickPermanents" ? s.pending.options[0]! : "";
    s = resolveAll(act(s, { type: "pickPermanents", player: ap, ids: [pick] }));
    expect(lands(s, ap).length).toBe(before - 1);
    expect(zone(s, pick)).toBe("hand");
  });

  it("Caller of the Claw and Fresh Meat count the creatures put into your graveyard from the battlefield this turn", () => {
    const { s: s0, ap, ids, opp } = setup([murder, murder, murder, murder, callerOfTheClaw, freshMeat]);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, bear());
    let s = s0;
    for (const [i, t] of [[0, a], [1, b], [2, theirs]] as const) s = resolveAll(run(s, planCast(s, ap, ids[i]!, [tgt(t)])));
    // A token goes to its owner's graveyard too (CR 111.7): Fresh Meat counts it, Caller of the Claw doesn't.
    const tok = putOnBattlefield(s, ap, bear({ name: "Token Bear" }));
    s.objects[tok]!.isToken = true;
    s = resolveAll(run(s, planCast(s, ap, ids[3]!, [tgt(tok)])));
    s = resolveAll(run(s, planCast(s, ap, ids[4]!)));
    expect(named(s, ap, "Bear").length).toBe(2);
    s = resolveAll(run(s, planCast(s, ap, ids[5]!)));
    expect(named(s, ap, "Beast").length).toBe(3);
  });

  it("Urborg Justice: the opponent sacrifices a creature for each creature put into your graveyard this turn", () => {
    const { s: s0, ap, ids, opp } = setup([murder, murder, urborgJustice]);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear());
    const theirs = [putOnBattlefield(s0, opp, bear()), putOnBattlefield(s0, opp, bear()), putOnBattlefield(s0, opp, bear())];
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(a)])));
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(b)])));
    s = settle(run(s, planCast(s, ap, ids[2]!, [player(opp)])));
    if (s.pending?.kind === "pickPermanents") s = resolveAll(act(s, { type: "pickPermanents", player: opp, ids: s.pending.options.slice(0, 2) }));
    expect(theirs.filter((id) => zone(s, id) === "graveyard").length).toBe(2);
  });

  it("Obzedat, Ghost Council: exiled at your end step, it returns at your next upkeep with haste", () => {
    const { s: s0, ap } = setup([]);
    const o = putOnBattlefield(s0, ap, obzedatGhostCouncil);
    let s = passUntil(s0, "end", ap);
    s = settle(s);
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(may(s, true));
    expect(zone(s, o)).toBe("exile");
    s = passUntil(s, "upkeep", ap);
    s = settle(s);
    expect(zone(s, o)).toBe("battlefield");
    expect(objHasKeyword(s, s.objects[o]!, "Haste")).toBe(true);
    // It came back under its owner's control at its owner's (the controller's) upkeep; its enters trigger targets an opponent.
    expect(controllerOf(s, s.objects[o]!)).toBe(ap);
  });

  it("Herald of Amity: casts an Aura from among the top eight cards for free, the rest to the bottom", () => {
    const { s: s0, ap, ids } = setup([heraldOfAmity]);
    const b = putOnBattlefield(s0, ap, bear());
    const top = [into(s0, ap, opt, "library"), into(s0, ap, aura, "library"), into(s0, ap, ogre, "library")];
    const size = s0.players[ap]!.library.length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong" });
    expect(s.pending!.kind === "chooseOption" && s.pending.options).toEqual([top[1], "none"]);
    s = act(s, { type: "chooseOption", player: ap, choice: top[1]! });
    s = resolveAll(run(s, planCast(s, ap, top[1]!, [tgt(b)])));
    expect(zone(s, top[1]!)).toBe("battlefield");
    expect(pt(s, b)).toBe("4/4");
    expect(s.players[ap]!.library.length).toBe(size - 1);
    expect(s.players[ap]!.library.slice(-7)).toContain(top[0]);
  });

  it("Ajani Unyielding −9: five +1/+1 counters on each creature and five loyalty counters on each other planeswalker", () => {
    const { s: s0, ap } = setup([]);
    const aj = putOnBattlefield(s0, ap, ajaniUnyielding);
    s0.objects[aj]!.counters.loyalty = 10;
    const nahiri = putOnBattlefield(s0, ap, nahiriHeirOfTheAncients);
    s0.objects[nahiri]!.counters.loyalty = 4;
    const b = putOnBattlefield(s0, ap, bear());
    const s = resolveAll(run(s0, planActivate(s0, ap, aj, 2)));
    expect(counters(s, b)).toBe(5);
    expect(counters(s, nahiri, "loyalty")).toBe(9);
    expect(counters(s, aj, "loyalty")).toBe(1);
  });

  it("Bess, Soul Nourisher: grows when 1/1s enter; its attack pumps the other 1/1s", () => {
    const one = card("Test Squire", "Creature — Human", "{W}", { cmc: 1, power: "1", toughness: "1" });
    const { s: s0, ap, ids, opp } = setup([one, bear()]);
    const bess = putOnBattlefield(s0, ap, bessSoulNourisher);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(counters(s, bess)).toBe(1);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(counters(s, bess)).toBe(1);
    const [sq, big] = ids as [string, string];
    s = attack(s, ap, [{ attacker: bess, defender: opp }]);
    s = resolveAll(s);
    expect(pt(s, sq)).toBe("2/2");
    expect(pt(s, big)).toBe("2/2");
  });

  it("Duskana, the Rage Mother: draws for each 2/2; an attacking 2/2 gets +3/+3", () => {
    const { s: s0, ap, ids, opp } = setup([duskanaTheRageMother]);
    const b = putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, ap, ogre);
    const hand = s0.players[ap]!.hand.length;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
    s = resolveAll(attack(s, ap, [{ attacker: b, defender: opp }]));
    expect(pt(s, b)).toBe("5/5");
  });

  it("Nahiri, Heir of the Ancients +1: the Kor Warrior token gets an Equipment you control, if you choose", () => {
    const { s: s0, ap } = setup([]);
    const n = putOnBattlefield(s0, ap, nahiriHeirOfTheAncients);
    s0.objects[n]!.counters.loyalty = 4;
    const sw = putOnBattlefield(s0, ap, sword);
    let s = settle(run(s0, planActivate(s0, ap, n, 0)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "attachWhich", options: [sw, "none"] });
    s = resolveAll(act(s, { type: "chooseOption", player: ap, choice: sw }));
    const tok = named(s, ap, "Kor Warrior")[0]!;
    expect(s.objects[sw]!.attachedTo).toBe(tok);
    expect(pt(s, tok)).toBe("3/3");
  });

  it("Goldwardens' Gambit: an Equipment for each of the five tokens, one at a time", () => {
    const { s: s0, ap, ids } = setup([goldwardensGambit]);
    const sw = putOnBattlefield(s0, ap, sword);
    const ax = putOnBattlefield(s0, ap, axe);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const toks = named(s, ap, "Rebel");
    expect(toks.length).toBe(5);
    s = act(s, { type: "chooseOption", player: ap, choice: sw });
    s = act(s, { type: "chooseOption", player: ap, choice: ax });
    for (let i = 0; i < 3; i++) s = act(s, { type: "chooseOption", player: ap, choice: "none" });
    s = resolveAll(s);
    const withSword = s.objects[sw]!.attachedTo!;
    const withAxe = s.objects[ax]!.attachedTo!;
    expect(toks).toContain(withSword);
    expect(toks).toContain(withAxe);
    expect(withSword).not.toBe(withAxe);
    expect(pt(s, withSword)).toBe("4/4");
    expect(toks.every((t) => objHasKeyword(s, s.objects[t]!, "Haste"))).toBe(true);
  });

  it("Resolute Strike: only a Warrior may get an Equipment", () => {
    const { s: s0, ap, ids } = setup([resoluteStrike, resoluteStrike]);
    const w = putOnBattlefield(s0, ap, warrior);
    const b = putOnBattlefield(s0, ap, bear());
    const sw = putOnBattlefield(s0, ap, sword);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(s.pending).toBeNull();
    expect(s.objects[sw]!.attachedTo).toBeUndefined();
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(w)])));
    s = resolveAll(act(s, { type: "chooseOption", player: ap, choice: sw }));
    expect(s.objects[sw]!.attachedTo).toBe(w);
    expect(pt(s, w)).toBe("6/6");
  });

  it("Expel from Orazca: with the city's blessing, the permanent may go on top of its owner's library instead", () => {
    const { s: s0, ap, ids, opp } = setup([expelFromOrazca, expelFromOrazca]);
    const a = putOnBattlefield(s0, opp, bear());
    const b = putOnBattlefield(s0, opp, bear());
    // Fourteen lands: ascend gives the city's blessing as it resolves (CR 702.131a).
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(a)])));
    expect(s.pending?.kind).toBe("chooseMay");
    s = resolveAll(may(s, true));
    expect(zone(s, a)).toBe("library");
    expect(s.players[opp]!.library[0]).toBe(a);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(b)])));
    s = resolveAll(may(s, false));
    expect(zone(s, b)).toBe("hand");
  });

  it("Expel from Orazca: without the city's blessing, back to its owner's hand", () => {
    const { s: s0, ap, ids, opp } = setup([expelFromOrazca]);
    // Only the two lands it needs: no city's blessing.
    for (const id of lands(s0, ap)) if (!["Island"].includes(characteristics(s0, s0.objects[id]!).name)) s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
    invalidateCharacteristics(s0);
    const a = putOnBattlefield(s0, opp, bear());
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(a)])));
    expect(s.players[ap]!.citysBlessing ?? false).toBe(false);
    expect(zone(s, a)).toBe("hand");
  });

  it("Mystical Dispute costs {2} less if it targets a blue spell; Stern Scolding counters a creature spell with power or toughness 2 or less", () => {
    const { s: s0, ap, ids } = setup([blueBear, mysticalDispute, bear(), mysticalDispute, sternScolding, ogre]);
    const untapped = (s: GameState) => lands(s, ap).filter((id) => !s.objects[id]!.tapped).length;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    const blueItem = s.stack[s.stack.length - 1]!.id;
    const before = untapped(s);
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: blueItem }]));
    expect(before - untapped(s)).toBe(1);
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap });
    s = resolveAll(act(s, { type: "payUnless", player: ap, pay: false }));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    s = run(s, planCast(s, ap, ids[2]!));
    const greenItem = s.stack[s.stack.length - 1]!.id;
    const before2 = untapped(s);
    s = run(s, planCast(s, ap, ids[3]!, [{ kind: "stack", id: greenItem }]));
    expect(before2 - untapped(s)).toBe(3);
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap });
    s = resolveAll(act(s, { type: "payUnless", player: ap, pay: false }));
    expect(zone(s, ids[2]!)).toBe("graveyard");
    // Stern Scolding: a 3/3 isn't a legal target.
    s = run(s, planCast(s, ap, ids[5]!));
    const ogreItem = s.stack[s.stack.length - 1]!.id;
    expect(planCast(s, ap, ids[4]!, [{ kind: "stack", id: ogreItem }])).toBeNull();
  });

  it("Stern Scolding counters a 2/2 creature spell", () => {
    const { s: s0, ap, ids } = setup([bear(), sternScolding]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: s.stack[s.stack.length - 1]!.id }])));
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });

  it("Banewhip Punisher and Triad of Fates target only a creature that has that counter on it", () => {
    const { s: s0, ap, opp } = setup([]);
    const p = putOnBattlefield(s0, ap, banewhipPunisher);
    const t = putOnBattlefield(s0, ap, triadOfFates);
    const a = putOnBattlefield(s0, opp, bear());
    const b = putOnBattlefield(s0, opp, ogre);
    expect(planActivate(s0, ap, p, 0, [tgt(a)])).toBeNull();
    s0.objects[a]!.counters["-1/-1"] = 1;
    s0.objects[b]!.counters.fate = 1;
    invalidateCharacteristics(s0);
    let s = resolveAll(run(s0, planActivate(s0, ap, p, 0, [tgt(a)])));
    expect(zone(s, a)).toBe("graveyard");
    const hand = s.players[opp]!.hand.length;
    s = resolveAll(run(s, planActivate(s, ap, t, 2, [tgt(b)])));
    expect(zone(s, b)).toBe("exile");
    expect(s.players[opp]!.hand.length).toBe(hand + 2);
  });

  it("Foul-Tongue Shriek: the opponent loses 1 life for each attacking creature you control and you gain that much", () => {
    const { s: s0, ap, ids, opp } = setup([foultongueShriek]);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear());
    let s = attack(s0, ap, [{ attacker: a, defender: opp }, { attacker: b, defender: opp }]);
    const [me, them] = [s.players[ap]!.life, s.players[opp]!.life];
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect(s.players[opp]!.life).toBe(them - 2);
    expect(s.players[ap]!.life).toBe(me + 2);
  });

  it("Guildsworn Prowler: draws when it dies, but not if it was blocking", () => {
    const { s: s0, ap, ids, opp } = setup([murder]);
    const p1 = putOnBattlefield(s0, ap, guildswornProwler);
    const hand = s0.players[ap]!.hand.length;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(p1)])));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
    const p2 = putOnBattlefield(s, ap, guildswornProwler);
    const o = putOnBattlefield(s, opp, ogre);
    s = act(passUntil(s, "declareAttackers", opp), { type: "declareAttackers", player: opp, attacks: [{ attacker: o, defender: ap }] });
    s = settle(s);
    const h2 = s.players[ap]!.hand.length;
    s = act(passUntil(s, "declareBlockers", opp), { type: "declareBlockers", player: ap, blocks: [{ blocker: p2, attacker: o }] });
    s = passUntil(s, "end", opp);
    expect(zone(s, p2)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(h2);
  });

  it("Tend the Sprigs: a Treefolk with seven or more lands and/or Treefolk", () => {
    const { s: s0, ap, ids } = setup([tendTheSprigs]);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const found = (s.pending as { cards: string[] }).cards[0]!;
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [found] }));
    expect(zone(s, found)).toBe("battlefield");
    expect(s.objects[found]!.tapped).toBe(true);
    expect(named(s, ap, "Treefolk").length).toBe(1);
  });

  it("Dakkon, Shadow Slayer enters with a loyalty counter for each land you control", () => {
    const { s: s0, ap, ids } = setup([dakkonShadowSlayer]);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(counters(s, ids[0]!, "loyalty")).toBe(lands(s, ap).length);
  });

  it("Anya, Merciless Angel: +3/+3 for each opponent below half their starting life, and indestructible then", () => {
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, anyaMercilessAngel);
    expect(pt(s0, a)).toBe("4/4");
    const [b, c] = s0.turnOrder.filter((p) => p !== ap);
    s0.players[b!]!.life = 19;
    s0.players[c!]!.life = 20;
    invalidateCharacteristics(s0);
    expect(pt(s0, a)).toBe("7/7");
    expect(objHasKeyword(s0, s0.objects[a]!, "Indestructible")).toBe(true);
    s0.players[c!]!.life = 3;
    invalidateCharacteristics(s0);
    expect(pt(s0, a)).toBe("10/10");
  });

  it("Scarblade's Malice: an Elf when that creature dies this turn", () => {
    const { s: s0, ap, ids } = setup([scarbladesMalice, murder]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(objHasKeyword(s, s.objects[b]!, "Deathtouch")).toBe(true);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(b)])));
    expect(named(s, ap, "Elf").length).toBe(1);
  });

  it("Time to Feed: your creature fights the chosen one; you gain 3 life when it dies", () => {
    const { s: s0, ap, ids, opp } = setup([timeToFeed]);
    const theirs = putOnBattlefield(s0, opp, bear());
    const mine = putOnBattlefield(s0, ap, ogre);
    const life = s0.players[ap]!.life;
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(theirs), tgt(mine)])));
    expect(zone(s, theirs)).toBe("graveyard");
    expect(s.objects[mine]!.damage).toBe(2);
    expect(s.players[ap]!.life).toBe(life + 3);
  });

  it("Curfew: each player returns a creature they control", () => {
    const { s: s0, ap, ids, opp } = setup([curfew]);
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, bear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    for (let i = 0; i < 4 && s.pending?.kind === "pickPermanents"; i++) s = act(s, { type: "pickPermanents", player: s.pending.player, ids: s.pending.options.slice(0, 1) });
    s = resolveAll(s);
    expect([zone(s, mine), zone(s, theirs)]).toEqual(["hand", "hand"]);
  });
});
