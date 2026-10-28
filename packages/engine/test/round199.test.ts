// Round 199: "as long as you control an artifact creature or a Plan" (Doctor Doom), "each creature you control that's a
// Food or a Golem" (Brenard, Ginger Sculptor), "each creature that didn't enter this turn" (Let the Galaxy Burn), "prevent
// all combat damage that other creatures would deal this turn" (Haze Frog), "choose a creature at random, then destroy the
// rest" (Last One Standing), "choose X cards in your hand and discard the rest" (Breakthrough), "both on top of your
// library or both on the bottom" (Dream Cache), "your life total becomes the number of charge counters on ~" (Eternity
// Vessel), "as long as you control another Elf, you may play an additional land" (Thranduil's Company), "a noncreature
// spell or a Dragon spell" (Runescale Stormbrood), "deals combat damage to a planeswalker" (Zagras), "pay life equal to
// its power. If you do, put that many +1/+1 counters on it" (Madame Null), "flash if X is 3 or less" (Silver Scrutiny),
// "scry that many cards plus one" (Kenessos), "as long as enchanted permanent is a creature, it gets +1/+1 for each ..."
// (Born to Drive), "enchanted by Auras you control have base power and toughness 4/4 and have flying" (Archon of the Wild
// Rose), "attach any number of Auras and Equipment you control to it" (Heavenly Blademaster), "spells ... that target ~
// cost {1} less" (Accursed Witch // Infectious Curse), "Equipment named ..." (Shield of Kaldra), "a tenth of the creatures
// they control, rounded up" (Legate Lanius), "a spell with the same name as a card in their graveyard" (Dragonlord
// Kolaghan), "a creature you control with flash or haste is dealt damage" (Sonic the Hedgehog), Plan cards (The Masters
// of Evil).

import { describe, expect, it } from "vitest";
import { act, card, forest, passUntil, putOnBattlefield, scry, setup } from "./helpers";
import { spellCost } from "../src/game";
import { applyAction, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question. */
const resolveAll = (s: GameState) => {
  for (let i = 0; i < 120 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const pt = (s: GameState, id: ObjectId) => [power(s, s.objects[id]!), toughness(s, s.objects[id]!)];
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Moves every card but `keep` from `pid`'s hand to the bottom of their library. */
const trimHand = (s: GameState, pid: PlayerId, keep: ObjectId[]) => {
  const pl = s.players[pid]!;
  for (const id of pl.hand.filter((h) => !keep.includes(h))) {
    s.objects[id]!.zone = "library";
    pl.library.push(id);
  }
  pl.hand = pl.hand.filter((h) => keep.includes(h));
  invalidateCharacteristics(s);
};
/** Like resolveAll, answering "you may" with yes, targets with `targets`, and "of their choice" picks with the first options. */
const settle = (s: GameState, targets: TargetChoice[] = []) => {
  for (let i = 0; i < 200 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: true });
    else if (p?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: p.player, ids: p.options.slice(0, p.count) });
    else if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets });
    else if (p) throw new Error(`waiting for ${p.kind}`);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const generic = (s: GameState, pid: PlayerId, id: ObjectId, targets: TargetChoice[]) => {
  const { cost, extra } = spellCost(s, pid, s.objects[id]!, 0, [], { targets });
  return cost.symbols.reduce((n, c) => n + (c.kind === "generic" ? c.amount : 0), extra);
};
const treasures = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.cards[s.objects[id]!.cardId]?.name === "Treasure Token" && controllerOf(s, s.objects[id]!) === pid);
const next = (s: GameState, pid: PlayerId, k = 1) => s.turnOrder[(s.turnOrder.indexOf(pid) + k) % 4]!;
/** Passes (no blocks, "you may" answered as `may`) until `step` of `ap`'s turn with an empty stack, or another question. */
const toStep = (s: GameState, step: GameState["step"], ap: PlayerId, may = true) => {
  for (let i = 0; i < 800; i++) {
    if (s.step === step && s.activePlayer === ap && !s.stack.length && !s.triggerQueue.length && !s.pending) return s;
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: p.player, attacks: [] });
    else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: may });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  throw new Error(`never reached ${step}`);
};
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: ObjectId; defender: PlayerId; planeswalker?: ObjectId }[]) => act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks });
const creature = (name: string, sub: string, p: number, t = p, cost = "{G}") => card(name, `Creature — ${sub}`, cost, { cmc: cost.match(/\{/g)?.length ?? 0, power: String(p), toughness: String(t) });
const shock = card("Test Shock", "Instant", "{1}{R}", { cmc: 2, oracleText: "This spell deals 2 damage to any target." });
const pinger = card("Test Pinger", "Creature — Human Wizard", "{R}", { cmc: 1, power: "1", toughness: "1", oracleText: "{T}: This creature deals 1 damage to any target." });
const walker = card("Test Walker", "Legendary Planeswalker — Test", "{3}", { cmc: 3, loyalty: "5", oracleText: "+1: You gain 1 life." });
const plan = card("Test Plan", "Enchantment — Plan", "{1}{B}", { cmc: 2, oracleText: "" });
const sorcery = card("Test Divination", "Sorcery", "{U}", { cmc: 1, oracleText: "Draw a card." });
const opt = card("Test Opt", "Instant", "{U}", { cmc: 1, oracleText: "Scry 1. Draw a card." });
const aura = card("Test Aura", "Enchantment — Aura", "{W}", { cmc: 1, oracleText: "Enchant creature\nEnchanted creature gets +1/+1." });
const sword = card("Test Sword", "Artifact — Equipment", "{1}", { cmc: 1, oracleText: "Equipped creature gets +1/+0.\nEquip {1}" });
const elf = creature("Test Elf", "Elf", 1);
const dragon = creature("Test Dragon", "Dragon", 4, 4, "{3}{R}");

// Real oracle text (Scryfall).
const doctorDoom = card("Doctor Doom", "Legendary Creature — Human Scientist Villain", "{4}{B}{B}", {"cmc":6,"power":"3","toughness":"3","keywords":[],"oracleText":"When Doctor Doom enters, create two 3/3 colorless Robot Villain artifact creature tokens named Doombot.\nAs long as you control an artifact creature or a Plan, Doctor Doom has indestructible.\nAt the beginning of your end step, you draw a card and lose 1 life.","colors":["B"],"colorIdentity":["B"]});
const brenardGingerSculptor = card("Brenard, Ginger Sculptor", "Legendary Creature — Human Artificer", "{1}{G}{W}{U}", {"cmc":4,"power":"3","toughness":"3","keywords":["Food"],"oracleText":"Each creature you control that's a Food or a Golem gets +2/+2 and has trample.\nWhenever another nontoken creature you control dies, you may exile it. If you do, create a token that's a copy of that creature, except it's a 1/1 Food Golem artifact creature in addition to its other types and it has \"{2}, {T}, Sacrifice this token: You gain 3 life.\"","colors":["G","U","W"],"colorIdentity":["G","U","W"]});
const letTheGalaxyBurn = card("Let the Galaxy Burn", "Sorcery", "{X}{5}{R}", {"cmc":6,"keywords":["Cascade"],"oracleText":"Cascade (When you cast this spell, exile cards from the top of your library until you exile a nonland card that costs less. You may cast it without paying its mana cost. Put the exiled cards on the bottom in a random order.)\nLet the Galaxy Burn deals X plus 2 damage to each creature that didn't enter this turn.","colors":["R"],"colorIdentity":["R"]});
const hazeFrog = card("Haze Frog", "Creature — Frog", "{3}{G}{G}", {"cmc":5,"power":"2","toughness":"1","keywords":["Flash"],"oracleText":"Flash (You may cast this spell any time you could cast an instant.)\nWhen this creature enters, prevent all combat damage that other creatures would deal this turn.","colors":["G"],"colorIdentity":["G"]});
const lastOneStanding = card("Last One Standing", "Sorcery", "{1}{B}{R}", {"cmc":3,"keywords":[],"oracleText":"Choose a creature at random, then destroy the rest.","colors":["B","R"],"colorIdentity":["B","R"]});
const breakthrough = card("Breakthrough", "Sorcery", "{X}{U}", {"cmc":1,"keywords":[],"oracleText":"Draw four cards, then choose X cards in your hand and discard the rest.","colors":["U"],"colorIdentity":["U"]});
const dreamCache = card("Dream Cache", "Sorcery", "{2}{U}", {"cmc":3,"keywords":[],"oracleText":"Draw three cards, then put two cards from your hand both on top of your library or both on the bottom of your library.","colors":["U"],"colorIdentity":["U"]});
const eternityVessel = card("Eternity Vessel", "Artifact", "{6}", {"cmc":6,"keywords":["Landfall"],"oracleText":"This artifact enters with X charge counters on it, where X is your life total.\nLandfall — Whenever a land you control enters, you may have your life total become the number of charge counters on this artifact.","colors":[],"colorIdentity":[]});
const thranduilsCompany = card("Thranduil's Company", "Creature — Elf Soldier", "{2}{G}{U}", {"cmc":4,"power":"3","toughness":"4","keywords":["Landfall"],"oracleText":"As long as you control another Elf, you may play an additional land on each of your turns.\nLandfall — Whenever a land you control enters, put two +1/+1 counters on target creature you control. It gains vigilance until end of turn.","colors":["G","U"],"colorIdentity":["G","U"]});
const runescaleStormbrood = scry("adventure", [{"name": "Runescale Stormbrood", "type_line": "Creature — Dragon", "mana_cost": "{3}{R}", "oracle_text": "Flying\nWhenever you cast a noncreature spell or a Dragon spell, this creature gets +2/+0 until end of turn.", "power": "2", "toughness": "4"}, {"name": "Chilling Screech", "type_line": "Instant — Omen", "mana_cost": "{1}{U}", "oracle_text": "Counter target spell with mana value 2 or less. (Then shuffle this card into its owner's library.)"}], { keywords: ["Flying"], color_identity: ["R", "U"] });
const zagrasThiefOfHeartbeats = card("Zagras, Thief of Heartbeats", "Legendary Creature — Vampire Rogue", "{4}{B}{R}", {"cmc":6,"power":"4","toughness":"4","keywords":["Deathtouch","Flying","Haste"],"oracleText":"This spell costs {1} less to cast for each creature in your party.\nFlying, deathtouch, haste\nOther creatures you control have deathtouch.\nWhenever a creature you control deals combat damage to a planeswalker, destroy that planeswalker.","colors":["B","R"],"colorIdentity":["B","R"]});
const madameNullPowerBroker = card("Madame Null, Power Broker", "Legendary Creature — Demon Advisor", "{2}{B}", {"cmc":3,"power":"1","toughness":"3","keywords":["Deathtouch"],"oracleText":"Deathtouch\nWhenever another creature you control enters, you may pay life equal to its power. If you do, put that many +1/+1 counters on it.","colors":["B"],"colorIdentity":["B"]});
const silverScrutiny = card("Silver Scrutiny", "Sorcery", "{X}{U}{U}", {"cmc":2,"keywords":[],"oracleText":"You may cast this spell as though it had flash if X is 3 or less.\nDraw X cards.","colors":["U"],"colorIdentity":["U"]});
const kenessosPriestOfThassa = card("Kenessos, Priest of Thassa", "Legendary Creature — Merfolk Cleric", "{1}{U}", {"cmc":2,"power":"1","toughness":"3","keywords":[],"oracleText":"If you would scry a number of cards, scry that many cards plus one instead.\n{3}{G/U}: Look at the top card of your library. If it's a Kraken, Leviathan, Octopus, or Serpent creature card, you may put it onto the battlefield. If you don't put the card onto the battlefield, you may put it on the bottom of your library.","colors":["U"],"colorIdentity":["G","U"]});
const bornToDrive = card("Born to Drive", "Enchantment — Aura", "{2}{W}", {"cmc":3,"keywords":["Enchant","Channel"],"oracleText":"Enchant artifact or creature\nAs long as enchanted permanent is a creature, it gets +1/+1 for each creature and/or Vehicle you control.\nChannel — {2}{W}, Discard this card: Create two 1/1 colorless Pilot creature tokens with \"This token crews Vehicles as though its power were 2 greater.\"","colors":["W"],"colorIdentity":["W"]});
const archonOfTheWildRose = card("Archon of the Wild Rose", "Creature — Archon", "{2}{W}{W}", {"cmc":4,"power":"4","toughness":"4","keywords":["Flying"],"oracleText":"Flying\nOther creatures you control that are enchanted by Auras you control have base power and toughness 4/4 and have flying.","colors":["W"],"colorIdentity":["W"]});
const heavenlyBlademaster = card("Heavenly Blademaster", "Creature — Angel", "{5}{W}", {"cmc":6,"power":"3","toughness":"6","keywords":["Flying","Double strike"],"oracleText":"Flying, double strike\nWhen this creature enters, you may attach any number of Auras and Equipment you control to it.\nOther creatures you control get +1/+1 for each Aura and Equipment attached to this creature.","colors":["W"],"colorIdentity":["W"]});
const accursedWitch = scry("transform", [{"name": "Accursed Witch", "type_line": "Creature — Human Shaman", "mana_cost": "{3}{B}", "oracle_text": "Spells your opponents cast that target this creature cost {1} less to cast.\nWhen this creature dies, return it to the battlefield transformed under your control attached to target opponent.", "power": "4", "toughness": "2"}, {"name": "Infectious Curse", "type_line": "Enchantment — Aura Curse", "oracle_text": "Enchant player\nSpells you cast that target enchanted player cost {1} less to cast.\nAt the beginning of enchanted player's upkeep, that player loses 1 life and you gain 1 life."}], { keywords: ["Transform", "Enchant"], color_identity: ["B"] });
const shieldOfKaldra = card("Shield of Kaldra", "Legendary Artifact — Equipment", "{4}", {"cmc":4,"keywords":["Equip"],"oracleText":"Equipment named Sword of Kaldra, Shield of Kaldra, and Helm of Kaldra have indestructible.\nEquipped creature has indestructible. (Damage and effects that say \"destroy\" don't destroy it.)\nEquip {4}","colors":[],"colorIdentity":[]});
const legateLaniusCaesarsAce = card("Legate Lanius, Caesar's Ace", "Legendary Creature — Human Soldier", "{2}{B}{R}", {"cmc":4,"power":"2","toughness":"2","keywords":["Decimate"],"oracleText":"Decimate — When Legate Lanius enters, each opponent sacrifices a tenth of the creatures they control of their choice, rounded up.\nWhenever an opponent sacrifices a creature, put a +1/+1 counter on Legate Lanius.","colors":["B","R"],"colorIdentity":["B","R"]});
const dragonlordKolaghan = card("Dragonlord Kolaghan", "Legendary Creature — Elder Dragon", "{4}{B}{R}", {"cmc":6,"power":"6","toughness":"5","keywords":["Flying","Haste"],"oracleText":"Flying, haste\nOther creatures you control have haste.\nWhenever an opponent casts a creature or planeswalker spell with the same name as a card in their graveyard, that player loses 10 life.","colors":["B","R"],"colorIdentity":["B","R"]});
const sonicTheHedgehog = card("Sonic the Hedgehog", "Legendary Creature — Hedgehog Warrior", "{1}{U}{R}{W}", {"cmc":4,"power":"2","toughness":"4","keywords":["Gotta Go Fast","Treasure","Haste"],"oracleText":"Haste\nGotta Go Fast — Whenever Sonic the Hedgehog attacks, put a +1/+1 counter on each creature you control with flash or haste.\nWhenever a creature you control with flash or haste is dealt damage, create a tapped Treasure token.","colors":["R","U","W"],"colorIdentity":["R","U","W"]});
const theMastersOfEvil = card("The Masters of Evil", "Legendary Creature — Human Villain", "{5}{B}", {"cmc":6,"power":"5","toughness":"6","keywords":[],"oracleText":"Other Villains you control get +2/+1.\n{1}{B}, Discard this card: Search your library for a Plan card, reveal it, put it into your hand, then shuffle.","colors":["B"],"colorIdentity":["B"]});
const swordOfKaldra = card("Sword of Kaldra", "Legendary Artifact — Equipment", "{4}", {"cmc":4,"keywords":["Equip"],"oracleText":"Equipped creature gets +5/+5.\nWhenever equipped creature deals damage to a creature, exile that creature.\nEquip {4}","colors":[],"colorIdentity":[]});
const ALL = [doctorDoom, brenardGingerSculptor, letTheGalaxyBurn, hazeFrog, lastOneStanding, breakthrough, dreamCache, eternityVessel, thranduilsCompany, runescaleStormbrood, zagrasThiefOfHeartbeats, madameNullPowerBroker, silverScrutiny, kenessosPriestOfThassa, bornToDrive, archonOfTheWildRose, heavenlyBlademaster, accursedWitch, shieldOfKaldra, legateLaniusCaesarsAce, dragonlordKolaghan, sonicTheHedgehog, theMastersOfEvil];

describe("Round 199", () => {
  it("all compile", () => supported(...ALL));

  it("Doctor Doom has indestructible only while you control an artifact creature or a Plan", () => {
    const { s, ap, opp } = setup([]);
    const doom = putOnBattlefield(s, ap, doctorDoom);
    expect(objHasKeyword(s, s.objects[doom]!, "Indestructible")).toBe(false);
    const p = putOnBattlefield(s, ap, plan);
    expect(objHasKeyword(s, s.objects[doom]!, "Indestructible")).toBe(true);
    s.battlefield.splice(s.battlefield.indexOf(p), 1);
    s.objects[p]!.zone = "graveyard";
    invalidateCharacteristics(s);
    expect(objHasKeyword(s, s.objects[doom]!, "Indestructible")).toBe(false);
    // An opponent's artifact creature doesn't count; an artifact that isn't a creature doesn't either.
    putOnBattlefield(s, opp, card("Test Golem", "Artifact Creature — Golem", "{2}", { power: "2", toughness: "2" }));
    putOnBattlefield(s, ap, card("Test Rock", "Artifact", "{2}"));
    expect(objHasKeyword(s, s.objects[doom]!, "Indestructible")).toBe(false);
    putOnBattlefield(s, ap, card("Test Golem", "Artifact Creature — Golem", "{2}", { power: "2", toughness: "2" }));
    expect(objHasKeyword(s, s.objects[doom]!, "Indestructible")).toBe(true);
  });

  it("Brenard: creatures you control that are Foods or Golems get +2/+2 and trample", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, brenardGingerSculptor);
    const cookie = putOnBattlefield(s, ap, card("Test Cookie", "Artifact Creature — Food", "{1}", { power: "1", toughness: "1" }));
    const golem = putOnBattlefield(s, ap, creature("Test Golem", "Golem", 2));
    const bear = putOnBattlefield(s, ap, creature("Test Bear", "Bear", 2));
    const theirs = putOnBattlefield(s, opp, creature("Their Golem", "Golem", 2));
    expect(pt(s, cookie)).toEqual([3, 3]);
    expect(pt(s, golem)).toEqual([4, 4]);
    expect(objHasKeyword(s, s.objects[golem]!, "Trample")).toBe(true);
    expect(pt(s, bear)).toEqual([2, 2]);
    expect(pt(s, theirs)).toEqual([2, 2]);
  });

  it("Let the Galaxy Burn deals X plus 2 damage only to creatures that didn't enter this turn", () => {
    const { s: s0, ap, ids, opp } = setup([letTheGalaxyBurn]);
    s0.players[ap]!.library = s0.players[ap]!.library.filter((id) => characteristics(s0, s0.objects[id]!).types.includes("Land"));
    const old = putOnBattlefield(s0, opp, creature("Old Bear", "Bear", 3));
    const fresh = putOnBattlefield(s0, opp, creature("Fresh Bear", "Bear", 3));
    s0.objects[fresh]!.enteredTurn = s0.turn;
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 1));
    s = toStep(s, "main1", ap, false);
    expect(s.objects[old]!.zone).toBe("graveyard");
    expect(s.objects[fresh]!.zone).toBe("battlefield");
    expect(s.objects[fresh]!.damage).toBe(0);
  });

  it("Haze Frog prevents the combat damage of every other creature this turn, but not its own", () => {
    const { s: s0, ap, ids, opp } = setup([hazeFrog]);
    const bear = putOnBattlefield(s0, ap, creature("Test Bear", "Bear", 2));
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = resolveAll(s);
    const frog = ids[0]!;
    expect(s.objects[frog]!.zone).toBe("battlefield");
    s.objects[frog]!.controlledSinceTurn = -1;
    s = attack(s, ap, [{ attacker: bear, defender: opp }, { attacker: frog, defender: opp }]);
    s = toStep(s, "main2", ap);
    // The frog's 2 got through, the bear's 2 didn't.
    expect(s.players[opp]!.life).toBe(38);
  });

  it("Last One Standing keeps one creature at random and destroys the rest", () => {
    const { s: s0, ap, ids, opp } = setup([lastOneStanding]);
    const all = [putOnBattlefield(s0, ap, creature("A", "Bear", 2)), putOnBattlefield(s0, opp, creature("B", "Bear", 2)), putOnBattlefield(s0, next(s0, ap, 2), creature("C", "Bear", 2))];
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = resolveAll(s);
    expect(s.pending).toBeFalsy();
    expect(all.filter((id) => s.objects[id]!.zone === "battlefield")).toHaveLength(1);
    expect(all.filter((id) => s.objects[id]!.zone === "graveyard")).toHaveLength(2);
  });

  it("Breakthrough: draw four, keep X cards of your choice and discard the rest", () => {
    const { s: s0, ap, ids } = setup([breakthrough, sorcery, opt]);
    trimHand(s0, ap, ids);
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 1));
    s = resolveAll(s);
    expect(s.pending?.kind).toBe("discard");
    const hand = s.players[ap]!.hand;
    expect(hand).toHaveLength(6);
    expect(s.pending?.kind === "discard" && s.pending.count).toBe(5);
    const keep = ids[2]!;
    s = act(s, { type: "discard", player: ap, objectIds: hand.filter((id) => id !== keep) });
    s = resolveAll(s);
    expect(s.players[ap]!.hand).toEqual([keep]);
    // X = 0: the whole hand.
    const t = setup([breakthrough, sorcery]);
    trimHand(t.s, t.ap, t.ids);
    let s2 = run(t.s, planCast(t.s, t.ap, t.ids[0]!, undefined, undefined, undefined, 0));
    s2 = resolveAll(s2);
    expect(s2.pending).toBeFalsy();
    expect(s2.players[t.ap]!.hand).toHaveLength(0);
  });

  it("Dream Cache: draw three, then two cards both on the bottom (or both on top)", () => {
    const { s: s0, ap, ids } = setup([dreamCache, sorcery, opt]);
    trimHand(s0, ap, ids);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = resolveAll(s);
    expect(s.pending?.kind).toBe("chooseOption");
    expect(s.pending?.kind === "chooseOption" && s.pending.labels).toEqual(["Put two cards from your hand on top of your library", "Put two cards from your hand on the bottom of your library"]);
    s = act(s, { type: "chooseOption", player: ap, choice: "1" });
    expect(s.pending?.kind).toBe("handToTop");
    s = act(s, { type: "handToTop", player: ap, objectIds: [ids[1]!, ids[2]!] });
    s = resolveAll(s);
    expect(s.players[ap]!.hand).toHaveLength(3);
    expect(s.players[ap]!.library.slice(-2).sort()).toEqual([ids[1]!, ids[2]!].sort());
  });

  it("Eternity Vessel enters with your life total in charge counters; landfall may set your life to that many", () => {
    const { s: s0, ap, ids } = setup([eternityVessel, card("Test Island", "Basic Land — Island")]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = resolveAll(s);
    expect(s.objects[ids[0]!]!.counters.charge).toBe(40);
    s.objects[ids[0]!]!.counters.charge = 12;
    s = act(s, { type: "playLand", player: ap, objectId: ids[1]! });
    s = resolveAll(s);
    expect(s.pending?.kind).toBe("chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = resolveAll(s);
    expect(s.players[ap]!.life).toBe(12);
  });

  it("Thranduil's Company lets you play an additional land only while you control another Elf", () => {
    const lands = [card("Land A", "Land"), card("Land B", "Land"), card("Land C", "Land")];
    const { s: s0, ap, ids } = setup(lands);
    const tc = putOnBattlefield(s0, ap, thranduilsCompany);
    const landfall = (s: GameState) => {
      s = resolveAll(s);
      if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(tc)] });
      return resolveAll(s);
    };
    let s = landfall(act(s0, { type: "playLand", player: ap, objectId: ids[0]! }));
    expect(s.objects[tc]!.counters["+1/+1"]).toBe(2);
    expect(() => act(s, { type: "playLand", player: ap, objectId: ids[1]! })).toThrow();
    putOnBattlefield(s, ap, elf);
    s = landfall(act(s, { type: "playLand", player: ap, objectId: ids[1]! }));
    expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
    expect(() => act(s, { type: "playLand", player: ap, objectId: ids[2]! })).toThrow();
  });

  it("Runescale Stormbrood gets +2/+0 for a noncreature spell or a Dragon spell, not another creature spell", () => {
    const { s: s0, ap, ids } = setup([sorcery, dragon, creature("Test Bear", "Bear", 2)]);
    const brood = putOnBattlefield(s0, ap, runescaleStormbrood);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = resolveAll(s);
    expect(pt(s, brood)).toEqual([4, 4]);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(pt(s, brood)).toEqual([6, 4]);
    s = resolveAll(run(s, planCast(s, ap, ids[2]!)));
    expect(pt(s, brood)).toEqual([6, 4]);
  });

  it("Zagras destroys a planeswalker that a creature you control dealt combat damage to, not one dealt other damage", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, zagrasThiefOfHeartbeats);
    const bear = putOnBattlefield(s0, ap, creature("Test Bear", "Bear", 2));
    const ping = putOnBattlefield(s0, ap, pinger);
    for (const id of [bear, ping]) s0.objects[id]!.controlledSinceTurn = -1;
    const hit = putOnBattlefield(s0, opp, walker);
    const pinged = putOnBattlefield(s0, opp, card("Other Walker", "Legendary Planeswalker — Other", "{3}", { cmc: 3, loyalty: "5", oracleText: "+1: You gain 1 life." }));
    for (const id of [hit, pinged]) s0.objects[id]!.counters.loyalty = 5;
    let s = resolveAll(run(s0, planActivate(s0, ap, ping, 0, [tgt(pinged)])));
    expect(s.objects[pinged]!.zone).toBe("battlefield");
    expect(s.objects[pinged]!.counters.loyalty).toBe(4);
    s = attack(s, ap, [{ attacker: bear, defender: opp, planeswalker: hit }]);
    s = toStep(s, "main2", ap);
    expect(s.objects[hit]!.zone).toBe("graveyard");
    expect(s.objects[pinged]!.zone).toBe("battlefield");
  });

  it("Madame Null: pay life equal to the entering creature's power for that many +1/+1 counters", () => {
    const { s: s0, ap, ids } = setup([creature("Test Troll", "Troll", 3, 3, "{2}{G}"), creature("Test Bear", "Bear", 2, 2, "{1}{G}")]);
    putOnBattlefield(s0, ap, madameNullPowerBroker);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending?.kind).toBe("chooseMay");
    s = resolveAll(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.players[ap]!.life).toBe(37);
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(3);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    s = resolveAll(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.players[ap]!.life).toBe(37);
    expect(s.objects[ids[1]!]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Silver Scrutiny can be cast at instant speed only with X of 3 or less", () => {
    const { s: s0, ap, ids } = setup([silverScrutiny, opt]);
    expect(planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 5)).not.toBeNull();
    const s = run(s0, planCast(s0, ap, ids[1]!));
    expect(s.stack).toHaveLength(1);
    expect(planCast(s, ap, ids[0]!, undefined, undefined, undefined, 3)).not.toBeNull();
    expect(planCast(s, ap, ids[0]!, undefined, undefined, undefined, 4)).toBeNull();
    const t = resolveAll(run(s, planCast(s, ap, ids[0]!, undefined, undefined, undefined, 3)));
    // Silver Scrutiny resolved first (three cards drawn); Test Opt now asks about its scry.
    expect(t.pending?.kind).toBe("arrangeTop");
    expect(t.players[ap]!.hand).toHaveLength(s.players[ap]!.hand.length - 1 + 3);
  });

  it("Kenessos makes you scry one more card", () => {
    const { s: s0, ap, ids } = setup([opt]);
    putOnBattlefield(s0, ap, kenessosPriestOfThassa);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "arrangeTop", how: "scry", player: ap });
    expect(s.pending?.kind === "arrangeTop" && s.pending.cards).toHaveLength(2);
  });

  it("Born to Drive: an enchanted creature gets +1/+1 for each creature and Vehicle you control; a Vehicle that isn't a creature gets nothing", () => {
    const { s, ap, opp } = setup([]);
    const bear = putOnBattlefield(s, ap, creature("Test Bear", "Bear", 2));
    putOnBattlefield(s, ap, elf);
    const cart = putOnBattlefield(s, ap, card("Test Cart", "Artifact — Vehicle", "{2}", { cmc: 2, power: "3", toughness: "3" }));
    putOnBattlefield(s, opp, creature("Their Bear", "Bear", 2));
    const a = putOnBattlefield(s, ap, bornToDrive);
    s.objects[a]!.attachedTo = bear;
    const b = putOnBattlefield(s, ap, bornToDrive);
    s.objects[b]!.attachedTo = cart;
    invalidateCharacteristics(s);
    expect(pt(s, bear)).toEqual([5, 5]);
    expect(pt(s, cart)).toEqual([3, 3]);
  });

  it("Archon of the Wild Rose: other creatures enchanted by your Auras are base 4/4 with flying", () => {
    const { s, ap, opp } = setup([]);
    const archon = putOnBattlefield(s, ap, archonOfTheWildRose);
    const bear = putOnBattlefield(s, ap, creature("Test Bear", "Bear", 2));
    const plain = putOnBattlefield(s, ap, creature("Plain Bear", "Bear", 2));
    const theirsOn = putOnBattlefield(s, ap, creature("Other Bear", "Bear", 2));
    const a = putOnBattlefield(s, ap, aura);
    s.objects[a]!.attachedTo = bear;
    const b = putOnBattlefield(s, opp, aura);
    s.objects[b]!.attachedTo = theirsOn;
    const c = putOnBattlefield(s, ap, aura);
    s.objects[c]!.attachedTo = archon;
    invalidateCharacteristics(s);
    // Layer 7b sets 4/4, then the Aura's +1/+1 applies in 7c.
    expect(pt(s, bear)).toEqual([5, 5]);
    expect(objHasKeyword(s, s.objects[bear]!, "Flying")).toBe(true);
    expect(pt(s, plain)).toEqual([2, 2]);
    expect(pt(s, theirsOn)).toEqual([3, 3]);
    expect(objHasKeyword(s, s.objects[theirsOn]!, "Flying")).toBe(false);
    expect(pt(s, archon)).toEqual([5, 5]);
  });

  it("Heavenly Blademaster attaches the chosen Auras and Equipment to itself and pumps your other creatures for each", () => {
    const { s: s0, ap, ids } = setup([heavenlyBlademaster]);
    const bear = putOnBattlefield(s0, ap, creature("Test Bear", "Bear", 2));
    const a = putOnBattlefield(s0, ap, aura);
    s0.objects[a]!.attachedTo = bear;
    const sw = putOnBattlefield(s0, ap, sword);
    const left = putOnBattlefield(s0, ap, sword);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "attach", min: 0 });
    if (s.pending?.kind !== "pickPermanents") return;
    expect([...s.pending.options].sort()).toEqual([a, sw, left].sort());
    s = resolveAll(act(s, { type: "pickPermanents", player: ap, ids: [a, sw] }));
    expect(s.objects[a]!.attachedTo).toBe(ids[0]);
    expect(s.objects[sw]!.attachedTo).toBe(ids[0]);
    expect(s.objects[left]!.attachedTo).toBeUndefined();
    expect(pt(s, ids[0]!)).toEqual([5, 7]);
    expect(pt(s, bear)).toEqual([4, 4]);
  });

  it("Accursed Witch: opponents' spells that target it cost {1} less; as Infectious Curse, your spells that target the cursed player do", () => {
    const { s: s0, ap, ids, opp } = setup([shock]);
    const other = next(s0, ap, 2);
    const witch = putOnBattlefield(s0, ap, accursedWitch);
    const theirShock = into(s0, opp, shock, "hand");
    expect(generic(s0, opp, theirShock, [tgt(witch)])).toBe(0);
    expect(generic(s0, opp, theirShock, [{ kind: "player", id: ap }])).toBe(1);
    expect(generic(s0, ap, ids[0]!, [tgt(witch)])).toBe(1);
    // The Witch dies and comes back as a Curse on an opponent.
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(witch)])), [{ kind: "player", id: opp }]);
    expect(s.objects[witch]!.zone).toBe("battlefield");
    expect(s.objects[witch]!.attachedToPlayer).toBe(opp);
    const mine = into(s, ap, shock, "hand");
    expect(generic(s, ap, mine, [{ kind: "player", id: opp }])).toBe(0);
    expect(generic(s, ap, mine, [{ kind: "player", id: other }])).toBe(1);
    const theirs2 = into(s, other, shock, "hand");
    expect(generic(s, other, theirs2, [{ kind: "player", id: opp }])).toBe(1);
  });

  it("Shield of Kaldra gives indestructible to every Equipment named Sword, Shield or Helm of Kaldra, and to the equipped creature", () => {
    const { s, ap, opp } = setup([]);
    const shield = putOnBattlefield(s, ap, shieldOfKaldra);
    const sk = putOnBattlefield(s, opp, swordOfKaldra);
    const other = putOnBattlefield(s, ap, sword);
    const bear = putOnBattlefield(s, ap, creature("Test Bear", "Bear", 2));
    s.objects[shield]!.attachedTo = bear;
    invalidateCharacteristics(s);
    expect(objHasKeyword(s, s.objects[shield]!, "Indestructible")).toBe(true);
    expect(objHasKeyword(s, s.objects[sk]!, "Indestructible")).toBe(true);
    expect(objHasKeyword(s, s.objects[other]!, "Indestructible")).toBe(false);
    expect(objHasKeyword(s, s.objects[bear]!, "Indestructible")).toBe(true);
  });

  it("Legate Lanius: each opponent sacrifices a tenth of their creatures, rounded up, and each sacrifice grows it", () => {
    const { s: s0, ap, ids, opp } = setup([legateLaniusCaesarsAce]);
    const many = Array.from({ length: 11 }, () => putOnBattlefield(s0, opp, creature("Test Bear", "Bear", 2)));
    const one = putOnBattlefield(s0, next(s0, ap, 2), creature("Lone Bear", "Bear", 2));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(many.filter((id) => s.objects[id]!.zone === "graveyard")).toHaveLength(2);
    expect(s.objects[one]!.zone).toBe("graveyard");
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(3);
    expect(pt(s, ids[0]!)).toEqual([5, 5]);
  });

  it("Dragonlord Kolaghan: an opponent who casts a creature spell with the same name as a card in their graveyard loses 10 life", () => {
    const flashBear = card("Test Flash Bear", "Creature — Bear", "{G}", { cmc: 1, power: "2", toughness: "2", keywords: ["Flash"], oracleText: "Flash" });
    const { s: s0, ap, ids, opp } = setup([opt]);
    const other = next(s0, ap, 2);
    putOnBattlefield(s0, ap, dragonlordKolaghan);
    for (const pid of [opp, other]) putOnBattlefield(s0, pid, forest);
    into(s0, opp, flashBear, "graveyard");
    into(s0, other, creature("Test Flash Bear Two", "Bear", 2), "graveyard");
    const theirs = into(s0, opp, flashBear, "hand");
    const others = into(s0, other, flashBear, "hand");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    s = run(s, planCast(s, opp, theirs));
    s = act(s, { type: "passPriority", player: opp });
    while (waitingOn(s) !== other) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = run(s, planCast(s, other, others));
    s = resolveAll(s);
    expect(s.players[opp]!.life).toBe(30);
    expect(s.players[other]!.life).toBe(40);
  });

  it("Sonic: a creature you control with flash or haste that's dealt damage makes a tapped Treasure", () => {
    const { s: s0, ap } = setup([]);
    const sonic = putOnBattlefield(s0, ap, sonicTheHedgehog);
    const flashy = putOnBattlefield(s0, ap, card("Test Flasher", "Creature — Bird", "{U}", { cmc: 1, power: "1", toughness: "3", keywords: ["Flash"], oracleText: "Flash" }));
    const bear = putOnBattlefield(s0, ap, creature("Test Bear", "Bear", 2, 3));
    const pings = [0, 1, 2].map(() => putOnBattlefield(s0, ap, pinger));
    for (const id of pings) s0.objects[id]!.controlledSinceTurn = -1;
    let s = resolveAll(run(s0, planActivate(s0, ap, pings[0]!, 0, [tgt(bear)])));
    expect(treasures(s, ap)).toHaveLength(0);
    s = resolveAll(run(s, planActivate(s, ap, pings[1]!, 0, [tgt(sonic)])));
    expect(treasures(s, ap)).toHaveLength(1);
    s = resolveAll(run(s, planActivate(s, ap, pings[2]!, 0, [tgt(flashy)])));
    expect(treasures(s, ap)).toHaveLength(2);
    expect(treasures(s, ap).every((id) => s.objects[id]!.tapped)).toBe(true);
  });

  it("The Masters of Evil pumps other Villains and finds a Plan card from your library", () => {
    const { s: s0, ap, ids } = setup([theMastersOfEvil]);
    const doom = putOnBattlefield(s0, ap, doctorDoom);
    const p = into(s0, ap, plan, "library");
    let s = run(s0, planActivate(s0, ap, ids[0]!, 0));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    expect(s.pending?.kind === "searchLibrary" && s.pending.cards).toEqual([p]);
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [p] }));
    expect(s.players[ap]!.hand).toContain(p);
    putOnBattlefield(s, ap, theMastersOfEvil);
    expect(pt(s, doom)).toEqual([5, 4]);
  });
});
