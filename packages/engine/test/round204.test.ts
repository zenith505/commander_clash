// Round 204: "becomes prepared" and "becomes unprepared" on any creature (CR 722.3a-b: Skycoach Waypoint, Hexhaven Dueling
// Arena, Biblioplex Tomekeeper, Infinite Coursework), "you may exile eight cards from your graveyard. If you do"
// (Emeritus of Ideation), "three or more artifact and/or creature cards in your graveyard" (Lorehold Archivist), "your third
// spell each turn" (Emeritus of Conflict, Captain Ripley Vance, Vance's Blasting Cannons), "Whenever ... attacks this turn"
// (The Revelations of Ezio, Origin of the Hidden Ones, Basri, Devoted Paladin, The Bloodsky Massacre, Ondu Rising), "if it
// was cast from your graveyard" (Rocket-Powered Goblin Glider), renown (CR 702.112b: Relic Seeker, Valeron Wardens,
// Scab-Clan Berserker, Honored Hierarch, Goblin Glory Chaser), "if it had seven or more verse counters on it" (Lost Isle
// Calling), Razzle-Dazzler, Wicked Wolf, Mortal Combat, Epochrasite, Triceraton Commander, Hope-Ender Coatl, Fall of the
// Thran, and "you may tap another untapped creature you control. If you do" (Tidal Terror, Gravelgill Scoundrel, Redcap
// Raiders, Civil Servant).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, scry, setup } from "./helpers";
import { applyAction, blockProblem, botActions, chooseTargets, compileCard, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/**
 * Everyone passes until the stack is empty, answering "you may" with `may`, trigger targets with `targets`, a pick from a
 * graveyard with `pick` (or the first ones offered), a permanent pick with `ids` (or the first ones offered); stops at any
 * other question.
 */
const settle = (s: GameState, opts: { may?: boolean; targets?: TargetChoice[]; pick?: ObjectId[]; ids?: ObjectId[]; modes?: number[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.may ?? true });
    else if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets ?? [] });
    else if (p?.kind === "chooseModes" && opts.modes) s = act(s, { type: "chooseModes", player: p.player, modes: opts.modes });
    else if (p?.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: p.player, found: opts.pick ? opts.pick.filter((id) => p.cards.includes(id)) : p.cards.slice(0, p.max) });
    else if (p?.kind === "pickPermanents" && p.action !== "keepTapped") s = act(s, { type: "pickPermanents", player: p.player, ids: opts.ids ?? p.options.slice(0, p.count) });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes (no blocks, `may` to "you may") until `step` of `ap`'s turn with an empty stack, or another question. */
const toStep = (s: GameState, step: GameState["step"], ap: PlayerId, may = false) => {
  for (let i = 0; i < 1500; i++) {
    if (s.step === step && s.activePlayer === ap && !s.stack.length && !s.triggerQueue.length && !s.pending) return s;
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: p.player, attacks: [] });
    else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: may });
    else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
    else if (p?.kind === "pickPermanents" && p.action === "keepTapped") s = act(s, { type: "pickPermanents", player: p.player, ids: [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  throw new Error(`never reached ${step}`);
};
/** Declare these attacks (each at `defender`) in `ap`'s turn; their attack triggers wait on the stack. */
const attack = (s: GameState, ap: PlayerId, defender: PlayerId, attackers: ObjectId[]) => {
  s = passUntil(s, "declareAttackers", ap);
  return act(s, { type: "declareAttackers", player: ap, attacks: attackers.map((attacker) => ({ attacker, defender })) });
};
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % s.turnOrder.length]!;
const exiledCopy = (s: GameState, id: ObjectId) => {
  const c = s.objects[id]!.prepared?.copy;
  return c && s.objects[c]?.zone === "exile" ? c : undefined;
};
const cantrip = (n = "Test Cantrip") => card(n, "Instant", "{U}", { cmc: 1, oracleText: "Draw a card." });
/** Moves the cards in a player's hand to the bottom of their library, so no one discards to hand size. */
const emptyHand = (s: GameState, pid: PlayerId) => {
  for (const id of s.players[pid]!.hand.splice(0)) {
    s.objects[id]!.zone = "library";
    s.players[pid]!.library.push(id);
  }
};
const rock = (n = "Test Rock") => card(n, "Artifact", "{1}", { cmc: 1 });

// Real oracle text (Scryfall).
const skycoachWaypoint = card("Skycoach Waypoint", "Land", "", {"cmc":0,"keywords":["Prepared"],"oracleText":"{T}: Add {C}.\n{3}, {T}: Target creature becomes prepared. (Only creatures with prepare spells can become prepared.)","colors":[],"colorIdentity":[],"layout":"normal"});
const hexhavenDuelingArena = card("Hexhaven Dueling Arena", "Land", "", {"cmc":0,"keywords":["Prepared"],"oracleText":"{T}: Add {C}.\n{2}, {T}: Target creature that attacked this turn becomes prepared. Activate only as a sorcery. (Only creatures with prepare spells can become prepared.)\n{4}, {T}: Target creature becomes prepared.","colors":[],"colorIdentity":[],"layout":"normal"});
const biblioplexTomekeeper = card("Biblioplex Tomekeeper", "Artifact Creature — Construct", "{4}", {"cmc":4,"power":"3","toughness":"4","keywords":["Prepared"],"oracleText":"When this creature enters, choose up to one —\n• Target creature becomes prepared. (Only creatures with prepare spells can become prepared.)\n• Target creature becomes unprepared.","colors":[],"colorIdentity":[],"layout":"normal"});
const infiniteCoursework = card("Infinite Coursework", "Enchantment — Aura", "{2}{U}", {"cmc":3,"keywords":["Enchant","Prepared"],"oracleText":"Enchant creature\nWhen this Aura enters, tap enchanted creature. It becomes unprepared.\nEnchanted creature loses all abilities and doesn't untap during its controller's untap step.","colors":["U"],"colorIdentity":["U"],"layout":"normal"});
const emeritusOfIdeation = scry("prepare", [{"name":"Emeritus of Ideation","mana_cost":"{3}{U}{U}","type_line":"Creature — Human Wizard","oracle_text":"Flying, ward {2}\nThis creature enters prepared.\nWhenever this creature attacks, you may exile eight cards from your graveyard. If you do, this creature becomes prepared.","power":"5","toughness":"5"},{"name":"Ancestral Recall","mana_cost":"{U}","type_line":"Instant","oracle_text":"Target player draws three cards."}], { keywords: ["Flying","Prepared","Ward"], color_identity: ["U"] });
const loreholdArchivist = scry("prepare", [{"name":"Lorehold Archivist","mana_cost":"{1}{R}{W}","type_line":"Creature — Dwarf Artificer","oracle_text":"First strike\nAt the beginning of your upkeep, if there are three or more artifact and/or creature cards in your graveyard, this creature becomes prepared. (While it's prepared, you may cast a copy of its spell. Doing so unprepares it.)","power":"3","toughness":"2"},{"name":"Restore Relic","mana_cost":"{2}{R}{W}","type_line":"Sorcery","oracle_text":"Exile target artifact or creature card from your graveyard. Create a token that's a copy of it."}], { keywords: ["First strike","Prepared"], color_identity: ["R","W"] });
const emeritusOfConflict = scry("prepare", [{"name":"Emeritus of Conflict","mana_cost":"{1}{R}","type_line":"Creature — Human Wizard","oracle_text":"First strike\nWhenever you cast your third spell each turn, this creature becomes prepared. (While it's prepared, you may cast a copy of its spell. Doing so unprepares it.)","power":"2","toughness":"2"},{"name":"Lightning Bolt","mana_cost":"{R}","type_line":"Instant","oracle_text":"Lightning Bolt deals 3 damage to any target."}], { keywords: ["First strike","Prepared"], color_identity: ["R"] });
const captainRipleyVance = card("Captain Ripley Vance", "Legendary Creature — Human Pirate", "{2}{R}", {"cmc":3,"power":"3","toughness":"2","keywords":[],"oracleText":"Whenever you cast your third spell each turn, put a +1/+1 counter on Captain Ripley Vance, then it deals damage equal to its power to any target.","colors":["R"],"colorIdentity":["R"],"layout":"normal"});
const vancesBlastingCannons = scry("transform", [{"name":"Vance's Blasting Cannons","mana_cost":"{3}{R}","type_line":"Legendary Enchantment","oracle_text":"At the beginning of your upkeep, exile the top card of your library. If it's a nonland card, you may cast that card this turn.\nWhenever you cast your third spell in a turn, you may transform Vance's Blasting Cannons."},{"name":"Spitfire Bastion","mana_cost":"","type_line":"Legendary Land","oracle_text":"(Transforms from Vance's Blasting Cannons.)\n{T}: Add {R}.\n{2}{R}, {T}: Spitfire Bastion deals 3 damage to any target."}], { keywords: ["Transform"], color_identity: ["R"] });
const theRevelationsOfEzio = card("The Revelations of Ezio", "Enchantment — Saga", "{2}{B}", {"cmc":3,"keywords":[],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Destroy target tapped creature an opponent controls.\nII — Whenever an Assassin you control attacks this turn, put a +1/+1 counter on it.\nIII — Return target Assassin creature card from your graveyard to the battlefield with an additional +1/+1 counter on it.","colors":["B"],"colorIdentity":["B"],"layout":"saga"});
const originOfTheHiddenOnes = card("Origin of the Hidden Ones", "Enchantment — Saga", "{3}{R}", {"cmc":4,"keywords":[],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — This Saga deals 4 damage to any target.\nII — Create two 1/1 black Assassin creature tokens with menace.\nIII — Whenever an Assassin you control attacks this turn, create a 1/1 black Assassin creature token with menace that's tapped and attacking.","colors":["R"],"colorIdentity":["R"],"layout":"saga"});
const basriDevotedPaladin = card("Basri, Devoted Paladin", "Legendary Planeswalker — Basri", "{4}{W}{W}", {"cmc":6,"loyalty":"4","keywords":[],"oracleText":"+1: Put a +1/+1 counter on up to one target creature. It gains vigilance until end of turn.\n−1: Whenever a creature attacks this turn, put a +1/+1 counter on it.\n−6: Creatures you control get +2/+2 and gain flying until end of turn.","colors":["W"],"colorIdentity":["W"],"layout":"normal"});
const theBloodskyMassacre = card("The Bloodsky Massacre", "Enchantment — Saga", "{1}{B}{R}", {"cmc":3,"keywords":[],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Create a 2/3 red Demon Berserker creature token with menace.\nII — Whenever a Berserker attacks this turn, you draw a card and you lose 1 life.\nIII — Add {R} for each Berserker you control. Until end of turn, you don't lose this mana as steps and phases end.","colors":["B","R"],"colorIdentity":["B","R"],"layout":"saga"});
const onduRising = card("Ondu Rising", "Sorcery", "{1}{W}", {"cmc":2,"keywords":["Awaken"],"oracleText":"Whenever a creature attacks this turn, it gains lifelink until end of turn.\nAwaken 4—{4}{W} (If you cast this spell for {4}{W}, also put four +1/+1 counters on target land you control and it becomes a 0/0 Elemental creature with haste. It's still a land.)","colors":["W"],"colorIdentity":["W"],"layout":"normal"});
const rocketPoweredGoblinGlider = card("Rocket-Powered Goblin Glider", "Artifact — Equipment", "{3}", {"cmc":3,"keywords":["Mayhem","Equip"],"oracleText":"When this Equipment enters, if it was cast from your graveyard, attach it to target creature you control.\nEquipped creature gets +2/+0 and has flying and haste.\nEquip {2}\nMayhem {2}","colors":[],"colorIdentity":[],"layout":"normal"});
const relicSeeker = card("Relic Seeker", "Creature — Human Soldier", "{1}{W}", {"cmc":2,"power":"2","toughness":"2","keywords":["Renown"],"oracleText":"Renown 1 (When this creature deals combat damage to a player, if it isn't renowned, put a +1/+1 counter on it and it becomes renowned.)\nWhen this creature becomes renowned, you may search your library for an Equipment card, reveal it, put it into your hand, then shuffle.","colors":["W"],"colorIdentity":["W"],"layout":"normal"});
const valeronWardens = card("Valeron Wardens", "Creature — Human Monk", "{2}{G}", {"cmc":3,"power":"1","toughness":"3","keywords":["Renown"],"oracleText":"Renown 2 (When this creature deals combat damage to a player, if it isn't renowned, put two +1/+1 counters on it and it becomes renowned.)\nWhenever a creature you control becomes renowned, draw a card.","colors":["G"],"colorIdentity":["G"],"layout":"normal"});
const scabClanBerserker = card("Scab-Clan Berserker", "Creature — Human Berserker", "{1}{R}{R}", {"cmc":3,"power":"2","toughness":"2","keywords":["Renown","Haste"],"oracleText":"Haste\nRenown 1 (When this creature deals combat damage to a player, if it isn't renowned, put a +1/+1 counter on it and it becomes renowned.)\nWhenever an opponent casts a noncreature spell, if this creature is renowned, this creature deals 2 damage to that player.","colors":["R"],"colorIdentity":["R"],"layout":"normal"});
const honoredHierarch = card("Honored Hierarch", "Creature — Human Druid", "{G}", {"cmc":1,"power":"1","toughness":"1","keywords":["Renown"],"oracleText":"Renown 1 (When this creature deals combat damage to a player, if it isn't renowned, put a +1/+1 counter on it and it becomes renowned.)\nAs long as this creature is renowned, it has vigilance and \"{T}: Add one mana of any color.\"","colors":["G"],"colorIdentity":["G"],"layout":"normal"});
const goblinGloryChaser = card("Goblin Glory Chaser", "Creature — Goblin Warrior", "{R}", {"cmc":1,"power":"1","toughness":"1","keywords":["Renown"],"oracleText":"Renown 1 (When this creature deals combat damage to a player, if it isn't renowned, put a +1/+1 counter on it and it becomes renowned.)\nAs long as this creature is renowned, it has menace. (It can't be blocked except by two or more creatures.)","colors":["R"],"colorIdentity":["R"],"layout":"normal"});
const lostIsleCalling = card("Lost Isle Calling", "Enchantment", "{1}{U}", {"cmc":2,"keywords":[],"oracleText":"Whenever you scry, put a verse counter on this enchantment.\n{4}{U}{U}, Exile this enchantment: Draw a card for each verse counter on this enchantment. If it had seven or more verse counters on it, take an extra turn after this one. Activate only as a sorcery.","colors":["U"],"colorIdentity":["U"],"layout":"normal"});
const razzleDazzler = card("Razzle-Dazzler", "Creature — Human Wizard", "{1}{U}", {"cmc":2,"power":"1","toughness":"2","keywords":[],"oracleText":"Whenever you cast your second spell each turn, put a +1/+1 counter on this creature. It can't be blocked this turn.","colors":["U"],"colorIdentity":["U"],"layout":"normal"});
const wickedWolf = card("Wicked Wolf", "Creature — Wolf", "{2}{G}{G}", {"cmc":4,"power":"3","toughness":"3","keywords":["Fight"],"oracleText":"When this creature enters, it fights up to one target creature you don't control.\nSacrifice a Food: Put a +1/+1 counter on this creature. It gains indestructible until end of turn. Tap it.","colors":["G"],"colorIdentity":["G"],"layout":"normal"});
const mortalCombat = card("Mortal Combat", "Enchantment", "{2}{B}{B}", {"cmc":4,"keywords":[],"oracleText":"At the beginning of your upkeep, if twenty or more creature cards are in your graveyard, you win the game.","colors":["B"],"colorIdentity":["B"],"layout":"normal"});
const epochrasite = card("Epochrasite", "Artifact Creature — Construct", "{2}", {"cmc":2,"power":"1","toughness":"1","keywords":[],"oracleText":"This creature enters with three +1/+1 counters on it if you didn't cast it from your hand.\nWhen this creature dies, exile it with three time counters on it and it gains suspend. (At the beginning of its owner's upkeep, they remove a time counter. When the last is removed, they may cast this card without paying its mana cost. It has haste.)","colors":[],"colorIdentity":[],"layout":"normal"});
const triceratonCommander = card("Triceraton Commander", "Creature — Dinosaur Soldier", "{X}{X}{W}{W}", {"cmc":2,"power":"2","toughness":"2","keywords":["Flying"],"oracleText":"Flying\nWhen this creature enters, create X 2/2 white Dinosaur Soldier creature tokens.\nWhenever this creature attacks, Dinosaurs you control other than this creature get +1/+1 and gain flying until end of turn.","colors":["W"],"colorIdentity":["W"],"layout":"normal"});
const hopeEnderCoatl = card("Hope-Ender Coatl", "Creature — Eldrazi Snake", "{2}{U}", {"cmc":3,"power":"2","toughness":"2","keywords":["Flying","Devoid","Flash"],"oracleText":"Devoid (This card has no color.)\nFlash\nWhen you cast this spell, counter target spell an opponent controls unless they pay {1}.\nFlying","colors":[],"colorIdentity":["U"],"layout":"normal"});
const fallOfTheThran = card("Fall of the Thran", "Enchantment — Saga", "{5}{W}", {"cmc":6,"keywords":[],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Destroy all lands.\nII, III — Each player returns two land cards from their graveyard to the battlefield.","colors":["W"],"colorIdentity":["W"],"layout":"saga"});
const tidalTerror = card("Tidal Terror", "Creature — Octopus", "{4}{U}{U}", {"cmc":6,"power":"5","toughness":"6","keywords":["Islandcycling","Landcycling","Typecycling","Cycling"],"oracleText":"Whenever this creature attacks, you may tap two other untapped creatures you control. If you do, this creature can't be blocked this turn.\nIslandcycling {2} ({2}, Discard this card: Search your library for an Island card, reveal it, put it into your hand, then shuffle.)","colors":["U"],"colorIdentity":["U"],"layout":"normal"});
const gravelgillScoundrel = card("Gravelgill Scoundrel", "Creature — Merfolk Rogue", "{1}{U}", {"cmc":2,"power":"1","toughness":"3","keywords":["Vigilance"],"oracleText":"Vigilance\nWhenever this creature attacks, you may tap another untapped creature you control. If you do, this creature can't be blocked this turn.","colors":["U"],"colorIdentity":["U"],"layout":"normal"});
const redcapRaiders = card("Redcap Raiders", "Creature — Goblin Warrior", "{2}{R}", {"cmc":3,"power":"3","toughness":"2","keywords":[],"oracleText":"Whenever this creature attacks, you may tap an untapped non-Human creature you control. If you do, this creature gets +1/+1 and gains trample until end of turn.","colors":["R"],"colorIdentity":["R"],"layout":"normal"});
const civilServant = card("Civil Servant", "Creature — Cat Citizen", "{G}{W}", {"cmc":2,"power":"2","toughness":"3","keywords":[],"oracleText":"Whenever this creature attacks, you may tap another untapped Citizen you control. If you do, this creature gets +1/+0 and gains lifelink until end of turn.","colors":["G","W"],"colorIdentity":["G","W"],"layout":"normal"});

const testScholar = scry("prepare", [{ name: "Test Scholar", mana_cost: "{1}{U}", type_line: "Creature — Human Wizard", oracle_text: "Flying", power: "1", toughness: "1" }, { name: "Test Lesson", mana_cost: "{U}", type_line: "Sorcery", oracle_text: "Draw a card." }], { keywords: ["Flying", "Prepared"] });

describe("becomes prepared, becomes unprepared (CR 722.3a-b)", () => {
  it("compile", () => supported(skycoachWaypoint, hexhavenDuelingArena, biblioplexTomekeeper, infiniteCoursework, emeritusOfIdeation, loreholdArchivist));

  it("Skycoach Waypoint prepares a creature with a prepare spell; one without, or one already prepared, is unchanged (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const way = putOnBattlefield(s0, ap, skycoachWaypoint);
    const scholar = putOnBattlefield(s0, ap, testScholar);
    const b = putOnBattlefield(s0, ap, bear());
    let s = settle(run(s0, planActivate(s0, ap, way, 0, [tgt(scholar)])));
    expect(s.objects[scholar]!.prepared).toBeTruthy();
    const copy = exiledCopy(s, scholar)!;
    expect(copy).toBeDefined();
    // Again (untapped by hand): already prepared, so no second copy (rulings).
    s.objects[way]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, way, 0, [tgt(scholar)])));
    expect(exiledCopy(s, scholar)).toBe(copy);
    expect(s.players[ap]!.exile.filter((id) => s.objects[id]!.preparedFrom)).toHaveLength(1);
    // A creature without a prepare spell can be the target, and nothing happens.
    s.objects[way]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, way, 0, [tgt(b)])));
    expect(s.objects[b]!.prepared).toBeFalsy();
  });

  it("a bot aims Skycoach Waypoint at its own unprepared creature with a prepare spell, not at a bear", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, bear());
    const scholar = putOnBattlefield(s0, ap, testScholar);
    putOnBattlefield(s0, opp, testScholar);
    const body = compileCard(skycoachWaypoint).activated[0]!.body;
    expect(chooseTargets(s0, ap, body)).toEqual([tgt(scholar)]);
    s0.objects[scholar]!.prepared = {};
    expect(chooseTargets(s0, ap, body)).toBeNull();
  });

  it("Hexhaven Dueling Arena's {2} ability needs a creature that attacked this turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const arena = putOnBattlefield(s0, ap, hexhavenDuelingArena);
    const scholar = putOnBattlefield(s0, ap, testScholar);
    expect(planActivate(s0, ap, arena, 0, [tgt(scholar)])).toBeNull();
    expect(planActivate(s0, ap, arena, 1, [tgt(scholar)])).not.toBeNull();
    let s = toStep(attack(s0, ap, opp, [scholar]), "main2", ap);
    s = settle(run(s, planActivate(s, ap, arena, 0, [tgt(scholar)])));
    expect(exiledCopy(s, scholar)).toBeDefined();
  });

  it("Biblioplex Tomekeeper's second mode unprepares an opponent's creature: the copy in exile is gone (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([biblioplexTomekeeper]);
    const theirs = putOnBattlefield(s0, opp, testScholar);
    let s = settle(run(s0, planActivate(s0, ap, putOnBattlefield(s0, ap, skycoachWaypoint), 0, [tgt(theirs)])));
    const copy = exiledCopy(s, theirs)!;
    expect(s.players[opp]!.exile).toContain(copy);
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s, { modes: [1], targets: [tgt(theirs)] });
    expect(s.objects[theirs]!.prepared).toBeFalsy();
    expect(s.objects[copy]).toBeUndefined();
    expect(s.players[opp]!.exile).not.toContain(copy);
  });

  it("Infinite Coursework taps the creature and unprepares it; losing all abilities alone wouldn't (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([infiniteCoursework]);
    const theirs = putOnBattlefield(s0, opp, testScholar);
    let s = settle(run(s0, planActivate(s0, ap, putOnBattlefield(s0, ap, skycoachWaypoint), 0, [tgt(theirs)])));
    expect(exiledCopy(s, theirs)).toBeDefined();
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(theirs)])));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(theirs);
    expect(s.objects[theirs]!.tapped).toBe(true);
    expect(s.objects[theirs]!.prepared).toBeFalsy();
    expect(objHasKeyword(s, s.objects[theirs]!, "Flying")).toBe(false);
  });

  it("Emeritus of Ideation: exiling eight cards from your graveyard prepares it; with seven it can't be done (CR 609.3)", () => {
    const { s: s0, ap, opp } = setup([]);
    const emeritus = putOnBattlefield(s0, ap, emeritusOfIdeation);
    expect(s0.objects[emeritus]!.prepared).toBeFalsy();
    const yard = Array.from({ length: 7 }, (_, i) => into(s0, ap, rock(`Rock ${i}`), "graveyard"));
    const seven = structuredClone(s0);
    let s = attack(seven, ap, opp, [emeritus]);
    s = settle(s);
    expect(s.objects[emeritus]!.prepared).toBeFalsy();
    for (const id of yard) expect(s.objects[id]!.zone).toBe("graveyard");
    yard.push(into(s0, ap, rock("Rock 7"), "graveyard"));
    s = settle(attack(s0, ap, opp, [emeritus]));
    expect(s.objects[emeritus]!.prepared).toBeTruthy();
    for (const id of yard) expect(s.objects[id]!.zone).toBe("exile");
    // Saying no: nothing exiled, not prepared.
    const s1 = structuredClone(s0);
    const s2 = settle(attack(s1, ap, opp, [emeritus]), { may: false });
    expect(s2.objects[emeritus]!.prepared).toBeFalsy();
    for (const id of yard) expect(s2.objects[id]!.zone).toBe("graveyard");
  });

  it("Lorehold Archivist becomes prepared in your upkeep only with three or more artifact and/or creature cards in your graveyard", () => {
    const { s: s0, ap } = setup([]);
    const archivist = putOnBattlefield(s0, ap, loreholdArchivist);
    emptyHand(s0, ap);
    into(s0, ap, rock("Rock A"), "graveyard");
    into(s0, ap, bear(), "graveyard");
    into(s0, ap, card("Test Spell", "Sorcery", "{R}", { cmc: 1, oracleText: "Draw a card." }), "graveyard");
    const two = toStep(toStep(structuredClone(s0), "main1", next(s0, ap)), "draw", ap);
    expect(two.objects[archivist]!.prepared).toBeFalsy();
    into(s0, ap, rock("Rock B"), "graveyard");
    let s = toStep(s0, "main1", next(s0, ap));
    s = toStep(s, "upkeep", ap);
    s = settle(s);
    expect(s.objects[archivist]!.prepared).toBeTruthy();
  });
});

describe("your third spell each turn", () => {
  it("compile", () => supported(emeritusOfConflict, captainRipleyVance, vancesBlastingCannons));

  it("Emeritus of Conflict becomes prepared as your third spell this turn is cast, counting spells cast before it was there (rulings)", () => {
    const { s: s0, ap } = setup([cantrip("Cantrip One"), cantrip("Cantrip Two"), cantrip("Cantrip Three"), cantrip("Cantrip Four")]);
    const ids = s0.players[ap]!.hand.slice(-4);
    s0.players[ap]!.manaPool.U = 4;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const emeritus = putOnBattlefield(s, ap, emeritusOfConflict);
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(s.objects[emeritus]!.prepared).toBeFalsy();
    s = run(s, planCast(s, ap, ids[2]!));
    // The trigger resolves before the spell (rulings).
    expect(s.stack.length).toBe(2);
    s = settle(s);
    expect(s.objects[emeritus]!.prepared).toBeTruthy();
    const copy = exiledCopy(s, emeritus)!;
    s = settle(run(s, planCast(s, ap, ids[3]!)));
    expect(exiledCopy(s, emeritus)).toBe(copy);
  });

  it("Captain Ripley Vance gets a +1/+1 counter and deals damage equal to its power, the counter included", () => {
    const { s: s0, ap, opp } = setup([cantrip("Cantrip One"), cantrip("Cantrip Two"), cantrip("Cantrip Three")]);
    const ids = s0.players[ap]!.hand.slice(-3);
    s0.players[ap]!.manaPool.U = 3;
    const vance = putOnBattlefield(s0, ap, captainRipleyVance);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, ids[2]!)), { targets: [{ kind: "player", id: opp }] });
    expect(s.objects[vance]!.counters["+1/+1"]).toBe(1);
    expect(power(s, s.objects[vance]!)).toBe(4);
    expect(s.players[opp]!.life).toBe(life - 4);
  });

  it("Vance's Blasting Cannons may transform as your third spell in a turn is cast", () => {
    const { s: s0, ap } = setup([cantrip("Cantrip One"), cantrip("Cantrip Two"), cantrip("Cantrip Three")]);
    const ids = s0.players[ap]!.hand.slice(-3);
    s0.players[ap]!.manaPool.U = 3;
    const cannons = putOnBattlefield(s0, ap, vancesBlastingCannons);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(s.objects[cannons]!.face).toBeUndefined();
    s = settle(run(s, planCast(s, ap, ids[2]!)));
    expect(s.objects[cannons]!.face).toBe(1);
  });
});

describe("whenever ... attacks this turn (CR 603.7b)", () => {
  it("compile", () => supported(theRevelationsOfEzio, originOfTheHiddenOnes, basriDevotedPaladin, theBloodskyMassacre, onduRising));

  it("Basri, Devoted Paladin −1: each creature that attacks this turn gets a +1/+1 counter as it attacks", () => {
    const { s: s0, ap, opp } = setup([]);
    const basri = putOnBattlefield(s0, ap, basriDevotedPaladin);
    s0.objects[basri]!.counters.loyalty = 4;
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear());
    let s = settle(run(s0, planActivate(s0, ap, basri, 1)));
    s = settle(attack(s, ap, opp, [a, b]));
    expect(s.objects[a]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
    // Over at the end of the turn: the next player's attackers get none.
    const theirs = putOnBattlefield(s, next(s, ap), bear());
    s = toStep(s, "main1", next(s, ap));
    s = settle(attack(s, next(s0, ap), ap, [theirs]));
    expect(s.objects[theirs]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Ondu Rising: a creature that attacks this turn gains lifelink, anyone's (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([onduRising]);
    const a = putOnBattlefield(s0, ap, bear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "none" }])));
    expect(objHasKeyword(s, s.objects[a]!, "Lifelink")).toBe(false);
    s = settle(attack(s, ap, opp, [a]));
    expect(objHasKeyword(s, s.objects[a]!, "Lifelink")).toBe(true);
  });

  it("The Revelations of Ezio II: only Assassins you control get the counter", () => {
    const { s: s0, ap, opp } = setup([]);
    const saga = putOnBattlefield(s0, ap, theRevelationsOfEzio);
    s0.objects[saga]!.counters.lore = 1;
    const assassin = card("Test Assassin", "Creature — Human Assassin", "{1}{B}", { cmc: 2, power: "2", toughness: "2" });
    let s = toStep(s0, "main1", next(s0, ap));
    s = toStep(s, "main1", ap);
    expect(s.objects[saga]!.counters.lore).toBe(2);
    const a = putOnBattlefield(s, ap, assassin);
    const b = putOnBattlefield(s, ap, bear());
    s = settle(attack(s, ap, opp, [a, b]));
    expect(s.objects[a]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[b]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});

describe("cast from your graveyard, renown, and more", () => {
  it("compile", () => supported(rocketPoweredGoblinGlider, relicSeeker, valeronWardens, scabClanBerserker, honoredHierarch, goblinGloryChaser, lostIsleCalling, razzleDazzler, wickedWolf, mortalCombat, epochrasite, triceratonCommander, hopeEnderCoatl, fallOfTheThran));

  it("Rocket-Powered Goblin Glider attaches as it enters only if it was cast from your graveyard (mayhem)", () => {
    const { s: s0, ap, ids } = setup([rocketPoweredGoblinGlider]);
    const b = putOnBattlefield(s0, ap, bear());
    const fromHand = settle(run(s0, planCast(s0, ap, ids[0]!)), { targets: [tgt(b)] });
    expect(fromHand.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(fromHand.objects[ids[0]!]!.attachedTo).toBeUndefined();
    // Discarded this turn, cast from the graveyard for its mayhem cost (CR 702.187).
    const s1 = structuredClone(s0);
    const g = ids[0]!;
    s1.players[ap]!.hand.splice(s1.players[ap]!.hand.indexOf(g), 1);
    s1.objects[g]!.zone = "graveyard";
    s1.players[ap]!.graveyard.push(g);
    s1.objects[g]!.discardedTurn = s1.turn;
    invalidateCharacteristics(s1);
    const plan = planCast(s1, ap, g, undefined, undefined, undefined, undefined, { via: "mayhem" });
    expect(plan).not.toBeNull();
    const s = settle(run(s1, plan), { targets: [tgt(b)] });
    expect(s.objects[g]!.attachedTo).toBe(b);
    expect(objHasKeyword(s, s.objects[b]!, "Flying")).toBe(true);
  });

  it("renown: Relic Seeker's and Valeron Wardens's triggers, and 'as long as ~ is renowned'", () => {
    const { s: s0, ap, opp } = setup([]);
    const seeker = putOnBattlefield(s0, ap, relicSeeker);
    const wardens = putOnBattlefield(s0, ap, valeronWardens);
    const chaser = putOnBattlefield(s0, ap, goblinGloryChaser);
    const sword = into(s0, ap, card("Test Sword", "Artifact — Equipment", "{1}", { cmc: 1, oracleText: "Equipped creature gets +1/+0.\nEquip {1}" }), "library");
    // At the bottom, so no draw finds it.
    s0.players[ap]!.library.push(s0.players[ap]!.library.shift()!);
    expect(objHasKeyword(s0, s0.objects[chaser]!, "Menace")).toBe(false);
    const hand = s0.players[ap]!.hand.length;
    let s = attack(s0, ap, opp, [seeker, chaser]);
    s = toStep(s, "combatDamage", ap, true);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = settle(s, { pick: [sword] });
    expect(s.objects[seeker]!.renowned).toBe(true);
    expect(s.objects[sword]!.zone).toBe("hand");
    // Valeron Wardens draws for each creature of yours that became renowned (two).
    expect(s.players[ap]!.hand.length).toBe(hand + 1 + 2);
    expect(s.objects[chaser]!.renowned).toBe(true);
    expect(objHasKeyword(s, s.objects[chaser]!, "Menace")).toBe(true);
    expect(s.objects[wardens]!.renowned).toBeFalsy();
  });

  it("Scab-Clan Berserker deals 2 damage to an opponent casting a noncreature spell only while it's renowned", () => {
    const { s: start, ap, opp } = setup([]);
    // The opponent has priority (an instant, in this turn).
    let s0 = start;
    while (waitingOn(s0) !== opp) s0 = act(s0, { type: "passPriority", player: waitingOn(s0)! });
    const scab = putOnBattlefield(s0, ap, scabClanBerserker);
    s0.players[opp]!.manaPool.U = 2;
    const c1 = into(s0, opp, cantrip("Their Cantrip"), "hand");
    const life = s0.players[opp]!.life;
    const plain = settle(run(structuredClone(s0), planCast(structuredClone(s0), opp, c1)));
    expect(plain.players[opp]!.life).toBe(life);
    s0.objects[scab]!.renowned = true;
    const s = settle(run(s0, planCast(s0, opp, c1)));
    expect(s.players[opp]!.life).toBe(life - 2);
  });

  it("Lost Isle Calling: cards for each verse counter, and an extra turn with seven or more, as it last existed", () => {
    const { s: s0, ap } = setup([]);
    const isle = putOnBattlefield(s0, ap, lostIsleCalling);
    s0.objects[isle]!.counters.verse = 7;
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planActivate(s0, ap, isle, 0)));
    expect(s.objects[isle]!.zone).toBe("exile");
    expect(s.players[ap]!.hand.length).toBe(hand + 7);
    expect(s.extraTurns?.length ?? 0).toBeGreaterThan(0);
    const s1 = structuredClone(s0);
    s1.objects[isle]!.counters.verse = 6;
    const six = settle(run(s1, planActivate(s1, ap, isle, 0)));
    expect(six.players[ap]!.hand.length).toBe(hand + 6);
    expect(six.extraTurns?.length ?? 0).toBe(0);
  });
});

// Real oracle text (Scryfall): cards the templates above support too.
const meandersGuide = card("Meanders Guide", "Creature — Merfolk Scout", "{2}{W}", {"cmc":3,"power":"3","toughness":"2","keywords":[],"oracleText":"Whenever this creature attacks, you may tap another untapped Merfolk you control. When you do, return target creature card with mana value 3 or less from your graveyard to the battlefield.","colors":["W"],"colorIdentity":["W"],"layout":"normal"});
const scouringSwarm = card("Scouring Swarm", "Creature — Insect", "{1}{B}{G}", {"cmc":3,"power":"1","toughness":"1","keywords":["Flying"],"oracleText":"Flying\nWhenever you sacrifice a land, create a tapped token that's a copy of this creature if seven or more land cards are in your graveyard. Otherwise, create a tapped 1/1 black Insect creature token with flying.","colors":["B","G"],"colorIdentity":["B","G"],"layout":"normal"});
const skywarpSkaab = card("Skywarp Skaab", "Creature — Zombie Drake", "{3}{U}{U}", {"cmc":5,"power":"2","toughness":"5","keywords":["Flying"],"oracleText":"Flying\nWhen this creature enters, you may exile two creature cards from your graveyard. If you do, draw a card.","colors":["U"],"colorIdentity":["U"],"layout":"normal"});
const saheeliFiligreeMaster = card("Saheeli, Filigree Master", "Legendary Planeswalker — Saheeli", "{2}{U}{R}", {"cmc":4,"loyalty":"3","keywords":["Scry"],"oracleText":"+1: Scry 1. You may tap an untapped artifact you control. If you do, draw a card.\n−2: Create two 1/1 colorless Thopter artifact creature tokens with flying. They gain haste until end of turn.\n−4: You get an emblem with \"Artifact creatures you control get +1/+1\" and \"Artifact spells you cast cost {1} less to cast.\"","colors":["R","U"],"colorIdentity":["R","U"],"layout":"normal"});
const consulsLieutenant = card("Consul's Lieutenant", "Creature — Human Soldier", "{W}{W}", {"cmc":2,"power":"2","toughness":"1","keywords":["Renown","First strike"],"oracleText":"First strike\nRenown 1 (When this creature deals combat damage to a player, if it isn't renowned, put a +1/+1 counter on it and it becomes renowned.)\nWhenever this creature attacks, if it's renowned, other attacking creatures you control get +1/+1 until end of turn.","colors":["W"],"colorIdentity":["W"],"layout":"normal"});
const aegisSculptor = card("Aegis Sculptor", "Creature — Bird Wizard", "{3}{U}", {"cmc":4,"power":"2","toughness":"3","keywords":["Flying","Ward"],"oracleText":"Flying\nWard {2} (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays {2}.)\nAt the beginning of your upkeep, you may exile two cards from your graveyard. If you do, put a +1/+1 counter on this creature.","colors":["U"],"colorIdentity":["U"],"layout":"normal"});
const rustHarvester = card("Rust Harvester", "Artifact Creature — Robot", "{R}", {"cmc":1,"power":"1","toughness":"1","keywords":["Menace"],"oracleText":"Menace\n{2}, {T}, Exile an artifact card from your graveyard: Put a +1/+1 counter on this creature, then it deals damage equal to its power to any target.","colors":["R"],"colorIdentity":["R"],"layout":"normal"});

const food = () => card("Test Food", "Artifact — Food", "{2}", { cmc: 2, oracleText: "{2}, {T}, Sacrifice this artifact: You gain 3 life." });
const dino = () => card("Test Dinosaur", "Creature — Dinosaur", "{1}{W}", { cmc: 2, power: "2", toughness: "2" });
const attackers = (s: GameState) => s.battlefield.filter((id) => s.objects[id]!.attacking !== undefined);

describe("second spell, Food, upkeep, enters, cast triggers", () => {
  it("Razzle-Dazzler gets a +1/+1 counter and can't be blocked this turn as your second spell each turn is cast", () => {
    const { s: s0, ap, opp } = setup([cantrip("Cantrip One"), cantrip("Cantrip Two")]);
    const ids = s0.players[ap]!.hand.slice(-2);
    s0.players[ap]!.manaPool.U = 2;
    const razzle = putOnBattlefield(s0, ap, razzleDazzler);
    const blocker = putOnBattlefield(s0, opp, bear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[razzle]!.counters["+1/+1"] ?? 0).toBe(0);
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(s.objects[razzle]!.counters["+1/+1"]).toBe(1);
    s = attack(s, ap, opp, [razzle]);
    expect(blockProblem(s, s.objects[blocker]!, s.objects[razzle]!)).not.toBeNull();
  });

  it("Wicked Wolf: sacrificing a Food gives it a counter and indestructible, and taps it", () => {
    const { s: s0, ap } = setup([]);
    const wolf = putOnBattlefield(s0, ap, wickedWolf);
    const f = putOnBattlefield(s0, ap, food());
    const s = settle(run(s0, planActivate(s0, ap, wolf, 0, undefined, undefined, undefined, undefined, { sacrifice: [f] })));
    expect(s.objects[f]!.zone).toBe("graveyard");
    expect(s.objects[wolf]!.counters["+1/+1"]).toBe(1);
    expect(objHasKeyword(s, s.objects[wolf]!, "Indestructible")).toBe(true);
    expect(s.objects[wolf]!.tapped).toBe(true);
  });

  it("Mortal Combat wins the game in your upkeep with twenty creature cards in your graveyard, not nineteen", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, mortalCombat);
    emptyHand(s0, ap);
    for (let i = 0; i < 19; i++) into(s0, ap, bear(), "graveyard");
    const nineteen = settle(toStep(toStep(structuredClone(s0), "main1", next(s0, ap)), "upkeep", ap));
    expect(nineteen.winner).toBeNull();
    into(s0, ap, bear(), "graveyard");
    const s = settle(toStep(toStep(s0, "main1", next(s0, ap)), "upkeep", ap));
    expect(s.winner).toBe(ap);
  });

  it("Epochrasite enters with three +1/+1 counters only if you didn't cast it from your hand", () => {
    const reanimate = card("Test Reanimate", "Sorcery", "{B}", { cmc: 1, oracleText: "Return target creature card from your graveyard to the battlefield." });
    const { s: s0, ap, ids } = setup([epochrasite, reanimate]);
    s0.players[ap]!.manaPool.C = 2;
    const cast = settle(run(structuredClone(s0), planCast(structuredClone(s0), ap, ids[0]!)));
    expect(cast.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(cast.objects[ids[0]!]!.counters["+1/+1"] ?? 0).toBe(0);
    const yard = into(s0, ap, epochrasite, "graveyard");
    s0.players[ap]!.manaPool.B = 1;
    const s = settle(run(s0, planCast(s0, ap, ids[1]!, [tgt(yard)])));
    expect(s.objects[yard]!.zone).toBe("battlefield");
    expect(s.objects[yard]!.counters["+1/+1"]).toBe(3);
  });

  it("Triceraton Commander pumps the other Dinosaurs you control as it attacks, not itself", () => {
    const { s: s0, ap, opp } = setup([]);
    const tri = putOnBattlefield(s0, ap, triceratonCommander);
    const d = putOnBattlefield(s0, ap, dino());
    const b = putOnBattlefield(s0, ap, bear());
    const s = settle(attack(s0, ap, opp, [tri]));
    expect(power(s, s.objects[d]!)).toBe(3);
    expect(objHasKeyword(s, s.objects[d]!, "Flying")).toBe(true);
    expect(power(s, s.objects[tri]!)).toBe(2);
    expect(power(s, s.objects[b]!)).toBe(2);
  });

  it("Hope-Ender Coatl's cast trigger counters an opponent's spell unless they pay {1}", () => {
    const { s: start, ap, opp, ids } = setup([hopeEnderCoatl]);
    let s = start;
    while (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s.players[opp]!.manaPool.U = 1;
    const theirs = into(s, opp, cantrip("Their Cantrip"), "hand");
    s = run(s, planCast(s, opp, theirs));
    const item = s.stack[s.stack.length - 1]!;
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s.players[ap]!.manaPool.U = 3;
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 20 && s.pending?.kind !== "payUnless"; i++) {
      if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: s.pending.player, targets: [{ kind: "stack", id: item.id }] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.pending).toMatchObject({ kind: "payUnless", player: opp });
    s = settle(act(s, { type: "payUnless", player: opp, pay: false }));
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
  });

  it("Rust Harvester: exile an artifact card from your graveyard, then a counter and damage equal to its power", () => {
    const { s: s0, ap, opp } = setup([]);
    const rust = putOnBattlefield(s0, ap, rustHarvester);
    const r = into(s0, ap, rock(), "graveyard");
    s0.players[ap]!.manaPool.C = 2;
    const life = s0.players[opp]!.life;
    const s = settle(run(s0, planActivate(s0, ap, rust, 0, [{ kind: "player", id: opp }], undefined, undefined, undefined, { exileCards: [r] })));
    expect(s.objects[r]!.zone).toBe("exile");
    expect(s.objects[rust]!.counters["+1/+1"]).toBe(1);
    expect(s.players[opp]!.life).toBe(life - 2);
  });

  it("Skywarp Skaab draws only if two creature cards are exiled from your graveyard (CR 609.3)", () => {
    const { s: s0, ap, ids } = setup([skywarpSkaab]);
    s0.players[ap]!.manaPool.U = 5;
    const one = into(s0, ap, bear(), "graveyard");
    const hand = s0.players[ap]!.hand.length;
    const s1 = settle(run(structuredClone(s0), planCast(structuredClone(s0), ap, ids[0]!)));
    expect(s1.objects[one]!.zone).toBe("graveyard");
    expect(s1.players[ap]!.hand.length).toBe(hand - 1);
    const two = into(s0, ap, bear(), "graveyard");
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[one]!.zone).toBe("exile");
    expect(s.objects[two]!.zone).toBe("exile");
    expect(s.players[ap]!.hand.length).toBe(hand);
  });
});

describe("tap another untapped creature as a creature attacks", () => {
  it("compile", () => supported(tidalTerror, gravelgillScoundrel, redcapRaiders, civilServant, meandersGuide, scouringSwarm, skywarpSkaab, saheeliFiligreeMaster, consulsLieutenant, aegisSculptor, rustHarvester));

  it("Tidal Terror can't be blocked after tapping two other untapped creatures; with only one, it can't be done", () => {
    const { s: s0, ap, opp } = setup([]);
    const terror = putOnBattlefield(s0, ap, tidalTerror);
    const a = putOnBattlefield(s0, ap, bear());
    const blocker = putOnBattlefield(s0, opp, bear());
    const lone = settle(attack(structuredClone(s0), ap, opp, [terror]));
    expect(lone.objects[a]!.tapped).toBe(false);
    expect(blockProblem(lone, lone.objects[blocker]!, lone.objects[terror]!)).toBeNull();
    const b = putOnBattlefield(s0, ap, bear());
    const s = settle(attack(s0, ap, opp, [terror]), { ids: [a, b] });
    expect(s.objects[a]!.tapped).toBe(true);
    expect(s.objects[b]!.tapped).toBe(true);
    expect(blockProblem(s, s.objects[blocker]!, s.objects[terror]!)).not.toBeNull();
  });

  it("Gravelgill Scoundrel taps another creature, not itself (it has vigilance), to be unblockable", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, gravelgillScoundrel);
    const a = putOnBattlefield(s0, ap, bear());
    const blocker = putOnBattlefield(s0, opp, bear());
    let s = attack(s0, ap, opp, [g]);
    expect(s.objects[g]!.tapped).toBe(false);
    s = settle(s, { ids: [a] });
    expect(s.objects[a]!.tapped).toBe(true);
    expect(s.objects[g]!.tapped).toBe(false);
    expect(blockProblem(s, s.objects[blocker]!, s.objects[g]!)).not.toBeNull();
  });

  it("Redcap Raiders taps only a non-Human creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, redcapRaiders);
    const human = putOnBattlefield(s0, ap, card("Test Human", "Creature — Human Soldier", "{W}", { cmc: 1, power: "1", toughness: "1" }));
    const humans = settle(attack(structuredClone(s0), ap, opp, [r]));
    expect(humans.objects[human]!.tapped).toBe(false);
    expect(power(humans, humans.objects[r]!)).toBe(3);
    const a = putOnBattlefield(s0, ap, bear());
    let s = attack(s0, ap, opp, [r]);
    s = settle(s, { may: true });
    expect(s.objects[a]!.tapped).toBe(true);
    expect(power(s, s.objects[r]!)).toBe(4);
    expect(objHasKeyword(s, s.objects[r]!, "Trample")).toBe(true);
  });

  it("Civil Servant taps another Citizen for +1/+0 and lifelink", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, civilServant);
    putOnBattlefield(s0, ap, bear());
    const none = settle(attack(structuredClone(s0), ap, opp, [c]));
    expect(power(none, none.objects[c]!)).toBe(2);
    const citizen = putOnBattlefield(s0, ap, card("Test Citizen", "Creature — Human Citizen", "{W}", { cmc: 1, power: "1", toughness: "1" }));
    const s = settle(attack(s0, ap, opp, [c]));
    expect(s.objects[citizen]!.tapped).toBe(true);
    expect(power(s, s.objects[c]!)).toBe(3);
    expect(objHasKeyword(s, s.objects[c]!, "Lifelink")).toBe(true);
  });

  it("Meanders Guide: tapping another Merfolk returns a creature card with mana value 3 or less from your graveyard", () => {
    const { s: s0, ap, opp } = setup([]);
    const guide = putOnBattlefield(s0, ap, meandersGuide);
    const merfolk = putOnBattlefield(s0, ap, card("Test Merfolk", "Creature — Merfolk", "{U}", { cmc: 1, power: "1", toughness: "1" }));
    const dead = into(s0, ap, bear({ cmc: 2 }), "graveyard");
    const s = settle(attack(s0, ap, opp, [guide]), { targets: [tgt(dead)] });
    expect(s.objects[merfolk]!.tapped).toBe(true);
    expect(s.objects[dead]!.zone).toBe("battlefield");
  });
});

describe("renown and sagas that watch attackers", () => {
  it("Honored Hierarch has vigilance and a mana ability only while renowned", () => {
    const { s: s0, ap } = setup([]);
    const h = putOnBattlefield(s0, ap, honoredHierarch);
    expect(objHasKeyword(s0, s0.objects[h]!, "Vigilance")).toBe(false);
    s0.objects[h]!.renowned = true;
    invalidateCharacteristics(s0);
    expect(objHasKeyword(s0, s0.objects[h]!, "Vigilance")).toBe(true);
  });

  it("Consul's Lieutenant pumps the other attackers only if it's renowned", () => {
    const { s: s0, ap, opp } = setup([]);
    const lt = putOnBattlefield(s0, ap, consulsLieutenant);
    const b = putOnBattlefield(s0, ap, bear());
    const plain = settle(attack(structuredClone(s0), ap, opp, [lt, b]));
    expect(power(plain, plain.objects[b]!)).toBe(2);
    s0.objects[lt]!.renowned = true;
    const s = settle(attack(s0, ap, opp, [lt, b]));
    expect(power(s, s.objects[b]!)).toBe(3);
    expect(power(s, s.objects[lt]!)).toBe(2);
  });

  it("The Bloodsky Massacre II: you draw and lose 1 life whenever a Berserker attacks this turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const saga = putOnBattlefield(s0, ap, theBloodskyMassacre);
    s0.objects[saga]!.counters.lore = 1;
    let s = toStep(s0, "main1", next(s0, ap));
    s = toStep(s, "main1", ap);
    expect(s.objects[saga]!.counters.lore).toBe(2);
    const zerk = putOnBattlefield(s, ap, card("Test Berserker", "Creature — Human Berserker", "{R}", { cmc: 1, power: "1", toughness: "1" }));
    const b = putOnBattlefield(s, ap, bear());
    const hand = s.players[ap]!.hand.length;
    const life = s.players[ap]!.life;
    s = settle(attack(s, ap, opp, [zerk, b]));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.players[ap]!.life).toBe(life - 1);
  });

  it("Origin of the Hidden Ones III: an Assassin that attacks makes a tapped and attacking Assassin token", () => {
    const { s: s0, ap, opp } = setup([]);
    const saga = putOnBattlefield(s0, ap, originOfTheHiddenOnes);
    s0.objects[saga]!.counters.lore = 2;
    let s = toStep(s0, "main1", next(s0, ap));
    s = toStep(s, "main1", ap);
    const assassin = putOnBattlefield(s, ap, card("Test Assassin", "Creature — Human Assassin", "{1}{B}", { cmc: 2, power: "2", toughness: "2" }));
    s = settle(attack(s, ap, opp, [assassin]));
    // The token attacks a player of your choice (CR 508.4).
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "attackWhom" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: String(opp) }));
    const att = attackers(s);
    expect(att).toHaveLength(2);
    const token = att.find((id) => id !== assassin)!;
    expect(s.objects[token]!.tapped).toBe(true);
    expect(s.objects[token]!.attacking).toBe(opp);
  });

  it("Fall of the Thran II: each player returns two land cards from their graveyard to the battlefield", () => {
    const { s: s0, ap, opp } = setup([]);
    const saga = putOnBattlefield(s0, ap, fallOfTheThran);
    s0.objects[saga]!.counters.lore = 1;
    const mine = [0, 1, 2].map((i) => into(s0, ap, card(`Test Land ${i}`, "Land", "", { cmc: 0 }), "graveyard"));
    const theirs = into(s0, opp, card("Their Land", "Land", "", { cmc: 0 }), "graveyard");
    let s = toStep(s0, "main1", next(s0, ap));
    s = toStep(s, "main1", ap);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 2, max: 2 });
    s = settle(s);
    expect(s.objects[saga]!.counters.lore).toBe(2);
    expect(mine.filter((id) => s.objects[id]!.zone === "battlefield")).toHaveLength(2);
    expect(s.objects[theirs]!.zone).toBe("battlefield");
  });

  it("Scouring Swarm copies itself if seven or more land cards are in your graveyard, the sacrificed land included (rulings)", () => {
    const outlet = card("Test Outlet", "Artifact", "{1}", { cmc: 1, oracleText: "Sacrifice a land: You gain 1 life." });
    const { s: s0, ap } = setup([]);
    const swarm = putOnBattlefield(s0, ap, scouringSwarm);
    const o = putOnBattlefield(s0, ap, outlet);
    for (let i = 0; i < 6; i++) into(s0, ap, card(`Test Land ${i}`, "Land", "", { cmc: 0 }), "graveyard");
    const land = () => putOnBattlefield(s0, ap, card("Test Field", "Land", "", { cmc: 0 }));
    const l1 = land();
    const before = s0.battlefield.length;
    const s = settle(run(s0, planActivate(s0, ap, o, 0, undefined, undefined, undefined, undefined, { sacrifice: [l1] })));
    const made = s.battlefield.filter((id) => !s0.battlefield.includes(id));
    expect(s.battlefield.length).toBe(before);
    expect(made).toHaveLength(1);
    expect(s.objects[made[0]!]!.tapped).toBe(true);
    expect(s.cards[s.objects[made[0]!]!.cardId]?.name ?? "").not.toBe("Insect");
    expect(s.objects[swarm]!.zone).toBe("battlefield");
  });
});
