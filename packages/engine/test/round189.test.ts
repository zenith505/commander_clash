// Round 189: more of the harder cards both lanes skipped, from the most played down: "copy that spell X times" (Storm
// King's Thunder, Photon Blast Barrage), "choose one. If ..., choose both instead" (SOLDIER Military Program, Disciple of
// Perdition, Prophetic Titan), counters checked again after being put (Ayara's Oathsworn), a group biting one creature
// (Bartz and Boko, Moonlight Hunt), the destroyed land's controller searching (Magmatic Hellkite), Saffi Eriksdotter,
// Vraska the Unseen's +1, Cult Conscript, Game Over, Tainted Sigil, Henrika's back face, Celeborn the Wise and
// By Invitation Only.

import { describe, expect, it } from "vitest";
import { act, bear, card, commander, mountain, passUntil, putOnBattlefield, scry, setup, swamp } from "./helpers";
import { abilitiesOf, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; "you may" questions get `yes`, copies keep their targets. Stops at any other question. */
const resolveAll = (s: GameState, yes = true) => {
  for (let i = 0; i < 120 && (s.stack.length || s.triggerQueue.length || s.pending?.kind === "chooseMay" || s.pending?.kind === "copyTargets"); i++) {
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes });
    else if (s.pending?.kind === "copyTargets") s = act(s, { type: "copyTargets", player: s.pending.player });
    else if (s.pending) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const choose = (s: GameState, targets: TargetChoice[]) => (s.pending?.kind === "chooseTargets" ? resolveAll(act(s, { type: "chooseTargets", player: s.pending.player, targets })) : s);
const modes = (s: GameState, m: number[]) => {
  if (s.pending?.kind !== "chooseModes") throw new Error(`no modes question: ${s.pending?.kind}`);
  return act(s, { type: "chooseModes", player: s.pending.player, modes: m });
};
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
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
const lands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).types.includes("Land"));
const tapAllBut = (s: GameState, pid: PlayerId, keep: ObjectId[]) => {
  for (const id of lands(s, pid)) s.objects[id]!.tapped = !keep.includes(id);
  invalidateCharacteristics(s);
};
const next = (s: GameState, pid: PlayerId, k = 1) => s.turnOrder[(s.turnOrder.indexOf(pid) + k) % 4]!;
/** Passes (no blocks, "you may" answered yes) until `step` of `ap`'s turn with an empty stack, or until another question. */
const toStep = (s: GameState, step: GameState["step"], ap: PlayerId) => {
  for (let i = 0; i < 800; i++) {
    if (s.step === step && s.activePlayer === ap && !s.stack.length && !s.triggerQueue.length && !s.pending) return s;
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: p.player, attacks: [] });
    else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: true });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  throw new Error(`never reached ${step}`);
};
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: ObjectId; defender: PlayerId; planeswalker?: ObjectId }[]) => act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks });
const shock = card("Test Shock", "Instant", "{R}", { cmc: 1, oracleText: "This spell deals 2 damage to any target." });
const bolt = card("Test Bolt", "Instant", "{R}", { cmc: 1, oracleText: "This spell deals 3 damage to any target." });
const creature = (name: string, sub: string, p: number, t = p) => card(name, `Creature — ${sub}`, "{G}", { cmc: 1, power: String(p), toughness: String(t) });

// Real oracle text (Scryfall).
const stormKingsThunder = card("Storm King's Thunder", "Instant", "{X}{R}{R}{R}", {"cmc": 3, "oracleText": "When you next cast an instant or sorcery spell this turn, copy that spell X times. You may choose new targets for the copies.", "colors": ["R"], "layout": "normal"});
const photonBlastBarrage = card("Photon Blast Barrage", "Sorcery", "{X}{R}{R}", {"cmc": 2, "oracleText": "When you cast this spell, copy it X times. You may choose new targets for the copies.\nPhoton Blast Barrage deals 1 damage to target creature.", "colors": ["R"], "layout": "normal"});
const soldierMilitaryProgram = card("SOLDIER Military Program", "Enchantment", "{2}{W}", {"cmc": 3, "oracleText": "At the beginning of combat on your turn, choose one. If you control a commander, you may choose both instead.\n• Create a 1/1 white Soldier creature token.\n• Put a +1/+1 counter on each of up to two Soldiers you control.", "colors": ["W"], "layout": "normal"});
const discipleOfPerdition = card("Disciple of Perdition", "Creature \u2014 Human Warlock", "{1}{B}", {"cmc": 2, "power": "1", "toughness": "3", "oracleText": "When this creature dies, choose one. If you have exactly 13 life, you may choose both instead.\n• You draw a card and you lose 1 life.\n• Exile target opponent's graveyard. That player loses 1 life.", "colors": ["B"], "layout": "normal"});
const propheticTitan = card("Prophetic Titan", "Creature \u2014 Giant Wizard", "{4}{U}{R}", {"cmc": 6, "power": "4", "toughness": "4", "keywords": ["Delirium"], "oracleText": "Delirium — When this creature enters, choose one. If there are four or more card types among cards in your graveyard, choose both instead.\n• This creature deals 4 damage to any target.\n• Look at the top four cards of your library. Put one of them into your hand and the rest on the bottom of your library in a random order.", "colors": ["R", "U"], "layout": "normal"});
const ayarasOathsworn = card("Ayara's Oathsworn", "Creature \u2014 Human Knight", "{1}{B}", {"cmc": 2, "power": "2", "toughness": "2", "keywords": ["Menace"], "oracleText": "Menace\nWhenever this creature deals combat damage to a player, if it has fewer than four +1/+1 counters on it, put a +1/+1 counter on it. Then if it has exactly four +1/+1 counters on it, search your library for a card, put it into your hand, then shuffle.", "colors": ["B"], "layout": "normal"});
const bartzAndBoko = card("Bartz and Boko", "Legendary Creature \u2014 Human Bird", "{3}{G}{G}", {"cmc": 5, "power": "4", "toughness": "3", "keywords": ["Affinity"], "oracleText": "Affinity for Birds (This spell costs {1} less to cast for each Bird you control.)\nWhen Bartz and Boko enters, each other Bird you control deals damage equal to its power to target creature an opponent controls.", "colors": ["G"], "layout": "normal"});
const moonlightHunt = card("Moonlight Hunt", "Instant", "{1}{G}", {"cmc": 2, "oracleText": "Choose target creature you don't control. Each creature you control that's a Wolf or a Werewolf deals damage equal to its power to that creature.", "colors": ["G"], "layout": "normal"});
const magmaticHellkite = card("Magmatic Hellkite", "Creature \u2014 Dragon", "{2}{R}{R}", {"cmc": 4, "power": "4", "toughness": "5", "keywords": ["Flying"], "oracleText": "Flying\nWhen this creature enters, destroy target nonbasic land an opponent controls. Its controller searches their library for a basic land card, puts it onto the battlefield tapped with a stun counter on it, then shuffles. (If a permanent with a stun counter would become untapped, remove one from it instead.)", "colors": ["R"], "layout": "normal"});
const saffiEriksdotter = card("Saffi Eriksdotter", "Legendary Creature \u2014 Human Scout", "{G}{W}", {"cmc": 2, "power": "2", "toughness": "2", "oracleText": "Sacrifice Saffi Eriksdotter: When target creature is put into your graveyard this turn, return that card to the battlefield.", "colors": ["G", "W"], "layout": "normal"});
const vraskaTheUnseen = card("Vraska the Unseen", "Legendary Planeswalker \u2014 Vraska", "{3}{B}{G}", {"cmc": 5, "loyalty": "5", "oracleText": "+1: Until your next turn, whenever a creature deals combat damage to Vraska, destroy that creature.\n−3: Destroy target nonland permanent.\n−7: Create three 1/1 black Assassin creature tokens with \"Whenever this token deals combat damage to a player, that player loses the game.\"", "colors": ["B", "G"], "layout": "normal"});
const cultConscript = card("Cult Conscript", "Creature \u2014 Skeleton Warrior", "{B}", {"cmc": 1, "power": "2", "toughness": "1", "oracleText": "This creature enters tapped.\n{1}{B}: Return this card from your graveyard to the battlefield. Activate only if a non-Skeleton creature died under your control this turn.", "colors": ["B"], "layout": "normal"});
const gameOver = card("Game Over", "Sorcery", "{3}{B}{B}", {"cmc": 5, "oracleText": "This spell costs {2} less to cast if a player's life total is less than or equal to half their starting life total.\nDestroy all creatures.", "colors": ["B"], "layout": "normal"});
const taintedSigil = card("Tainted Sigil", "Artifact", "{1}{W}{B}", {"cmc": 3, "oracleText": "{T}, Sacrifice this artifact: You gain life equal to the total life lost by all players this turn. (Damage causes loss of life.)", "colors": ["B", "W"], "layout": "normal"});
const celebornTheWise = card("Celeborn the Wise", "Legendary Creature \u2014 Elf Noble", "{3}{G}", {"cmc": 4, "power": "3", "toughness": "3", "keywords": ["Scry"], "oracleText": "Whenever you attack with one or more Elves, scry 1.\nWhenever you scry, Celeborn gets +1/+1 until end of turn for each card looked at while scrying this way.", "colors": ["G"], "layout": "normal"});
const byInvitationOnly = card("By Invitation Only", "Sorcery", "{3}{W}{W}", {"cmc": 5, "oracleText": "Choose a number between 0 and 13. Each player sacrifices that many creatures of their choice.", "colors": ["W"], "layout": "normal"});
const henrikaDomnathi = scry("transform", [
  { name: "Henrika Domnathi", mana_cost: "{2}{B}{B}", type_line: "Legendary Creature — Vampire", power: "1", toughness: "3", oracle_text: "Flying\nAt the beginning of combat on your turn, choose one that hasn't been chosen —\n• Each player sacrifices a creature of their choice.\n• You draw a card and you lose 1 life.\n• Transform Henrika." },
  { name: "Henrika, Infernal Seer", type_line: "Legendary Creature — Vampire", color_indicator: ["B"], power: "3", toughness: "4", oracle_text: "Flying, deathtouch, lifelink\n{1}{B}{B}: Each creature you control with flying, deathtouch, and/or lifelink gets +1/+0 until end of turn." },
], { keywords: ["Deathtouch", "Flying", "Lifelink", "Transform"] });
// Targeted "up to two target creatures you control" stays its own template.
const felidarSavior = card("Felidar Savior", "Creature \u2014 Cat Beast", "{3}{W}", {"cmc": 4, "power": "2", "toughness": "3", "keywords": ["Lifelink"], "oracleText": "Lifelink (Damage dealt by this creature also causes you to gain that much life.)\nWhen this creature enters, put a +1/+1 counter on each of up to two other target creatures you control.", "colors": ["W"], "layout": "normal"});
const zimoneParadoxSculptor = card("Zimone, Paradox Sculptor", "Legendary Creature \u2014 Human Wizard", "{2}{G}{U}", {"cmc": 4, "power": "1", "toughness": "4", "keywords": ["Double"], "oracleText": "At the beginning of combat on your turn, put a +1/+1 counter on each of up to two target creatures you control.\n{G}{U}, {T}: Double the number of each kind of counter on up to two target creatures and/or artifacts you control.", "colors": ["G", "U"], "layout": "normal"});

const ALL = [stormKingsThunder, photonBlastBarrage, soldierMilitaryProgram, discipleOfPerdition, propheticTitan, ayarasOathsworn, bartzAndBoko, moonlightHunt, magmaticHellkite, saffiEriksdotter, vraskaTheUnseen, cultConscript, gameOver, taintedSigil, henrikaDomnathi, celebornTheWise, byInvitationOnly];

describe("round 189", () => {
  it("all compile", () => supported(...ALL));

  it("\"each of up to two target creatures you control\" is still targeted (Felidar Savior, Zimone)", () => supported(felidarSavior, zimoneParadoxSculptor));

  it("Storm King's Thunder copies the next instant or sorcery X times, with X locked in as the Thunder resolved", () => {
    let { s, ap, ids, opp } = setup([stormKingsThunder, shock, shock]);
    putOnBattlefield(s, ap, mountain);
    putOnBattlefield(s, ap, mountain);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, undefined, undefined, undefined, 2)));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [player(opp)])));
    expect(life(s, opp)).toBe(40 - 6);
    // Only the next one.
    s = resolveAll(run(s, planCast(s, ap, ids[2]!, [player(opp)])));
    expect(life(s, opp)).toBe(40 - 8);
  });

  it("Photon Blast Barrage copies itself X times as it's cast, each copy with its own target", () => {
    let { s, ap, ids, opp } = setup([photonBlastBarrage]);
    const a = putOnBattlefield(s, opp, creature("Test One", "Beast", 1));
    const b = putOnBattlefield(s, opp, creature("Test Two", "Beast", 1));
    const c = putOnBattlefield(s, opp, creature("Test Three", "Beast", 1));
    s = run(s, planCast(s, ap, ids[0]!, [tgt(a)], undefined, undefined, 2));
    for (const t of [b, c]) {
      for (let i = 0; i < 10 && s.pending?.kind !== "copyTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(s.pending?.kind).toBe("copyTargets");
      s = act(s, { type: "copyTargets", player: ap, targets: [tgt(t)] });
    }
    s = resolveAll(s);
    expect([a, b, c].map((id) => zone(s, id))).toEqual(["graveyard", "graveyard", "graveyard"]);
  });
  it("SOLDIER Military Program: one mode without a commander; with one, either or both, and up to two Soldiers get counters", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, soldierMilitaryProgram);
    const sol = putOnBattlefield(s, ap, creature("Test Soldier", "Human Soldier", 2));
    s = passUntil(s, "beginCombat", ap);
    expect(s.pending).toMatchObject({ kind: "chooseModes", min: 1, max: 1 });
    expect(() => modes(s, [0, 1])).toThrow();
    s = resolveAll(modes(s, [0]));
    const tokens = () => s.battlefield.filter((id) => s.objects[id]!.isToken && controllerOf(s, s.objects[id]!) === ap);
    expect(tokens()).toHaveLength(1);
    // Next turn, with a commander.
    s = passUntil(s, "main1", next(s, ap));
    s = passUntil(s, "main1", ap);
    putOnBattlefield(s, ap, commander("Test Leader"), { commander: true });
    s = passUntil(s, "beginCombat", ap);
    expect(s.pending).toMatchObject({ kind: "chooseModes", min: 1, max: 2 });
    s = resolveAll(modes(s, [0, 1]));
    expect(tokens()).toHaveLength(2);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "counters", count: 2, min: 0 });
    if (s.pending?.kind !== "pickPermanents") throw new Error("no pick");
    expect(s.pending.options).toHaveLength(3);
    expect(() => act(s, { type: "pickPermanents", player: ap, ids: [sol, ...tokens()] })).toThrow();
    s = resolveAll(act(s, { type: "pickPermanents", player: ap, ids: [sol, tokens()[1]!] }));
    expect([counters(s, sol), counters(s, tokens()[0]!), counters(s, tokens()[1]!)]).toEqual([1, 0, 1]);
  });

  it("SOLDIER Military Program with only the counters mode and no Soldiers asks nothing", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, soldierMilitaryProgram);
    s = passUntil(s, "beginCombat", ap);
    s = resolveAll(modes(s, [1]));
    expect(s.pending?.kind).not.toBe("pickPermanents");
  });

  it("Disciple of Perdition: at exactly 13 life you may choose both modes; otherwise only one", () => {
    let { s, ap, ids, opp } = setup([bolt, bolt]);
    const d1 = putOnBattlefield(s, ap, discipleOfPerdition);
    const d2 = putOnBattlefield(s, ap, discipleOfPerdition);
    const g = into(s, opp, bear(), "graveyard");
    s.players[ap]!.life = 13;
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(d1)])));
    expect(s.pending).toMatchObject({ kind: "chooseModes", min: 1, max: 2 });
    s = choose(modes(s, [0, 1]), [player(opp)]);
    expect(zone(s, g)).toBe("exile");
    expect(life(s, opp)).toBe(39);
    expect(life(s, ap)).toBe(12);
    expect(s.players[ap]!.hand.length).toBe(hand);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(d2)])));
    expect(s.pending).toMatchObject({ kind: "chooseModes", min: 1, max: 1 });
  });

  it("Prophetic Titan: with delirium both modes happen with no choice; without, one", () => {
    let { s, ap, ids, opp } = setup([propheticTitan, propheticTitan]);
    for (const d of [bear(), shock, soldierMilitaryProgram, card("Test Rock", "Artifact", "{1}", { cmc: 1 })]) into(s, ap, d, "graveyard");
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.pending?.kind).toBe("chooseTargets");
    s = choose(s, [player(opp)]);
    expect(life(s, opp)).toBe(36);
    expect(s.pending).toMatchObject({ player: ap });
    expect(s.pending?.kind).not.toBe("chooseModes");
  });

  it("Prophetic Titan without delirium asks for one mode", () => {
    let { s, ap, ids } = setup([propheticTitan]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseModes", min: 1, max: 1 });
  });
  it("Ayara's Oathsworn: a counter while it has fewer than four, then a tutor once it has exactly four", () => {
    let { s, ap, opp } = setup([]);
    const a = putOnBattlefield(s, ap, ayarasOathsworn);
    s.objects[a]!.counters["+1/+1"] = 2;
    s = toStep(attack(s, ap, [{ attacker: a, defender: opp }]), "main2", ap);
    expect(counters(s, a)).toBe(3);
    expect(s.pending).toBeFalsy();
    s = passUntil(s, "main1", next(s, ap));
    s = passUntil(s, "main1", ap);
    s = toStep(attack(s, ap, [{ attacker: a, defender: opp }]), "main2", ap);
    expect(counters(s, a)).toBe(4);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 1 });
    if (s.pending?.kind !== "searchLibrary") throw new Error("no search");
    const found = s.pending.cards[0]!;
    s = act(s, { type: "searchLibrary", player: ap, found: [found] });
    expect(zone(s, found)).toBe("hand");
    // At four counters the intervening "if" is false: no trigger at all.
    s = passUntil(s, "main1", next(s, ap));
    s = passUntil(s, "main1", ap);
    const before = life(s, opp);
    s = toStep(attack(s, ap, [{ attacker: a, defender: opp }]), "main2", ap);
    expect(life(s, opp)).toBe(before - 6);
    expect(counters(s, a)).toBe(4);
    expect(s.pending).toBeFalsy();
  });

  it("Bartz and Boko: each other Bird you control deals damage equal to its power to the target", () => {
    let { s, ap, ids, opp } = setup([bartzAndBoko]);
    putOnBattlefield(s, ap, creature("Test Bird", "Bird", 2));
    putOnBattlefield(s, ap, creature("Test Big Bird", "Bird Soldier", 3));
    putOnBattlefield(s, ap, creature("Test Beast", "Beast", 5));
    const t = putOnBattlefield(s, opp, creature("Test Wall", "Wall", 0, 6));
    s = choose(resolveAll(run(s, planCast(s, ap, ids[0]!))), [tgt(t)]);
    expect(s.objects[t]!.damage).toBe(5);
    expect(zone(s, t)).toBe("battlefield");
  });

  it("Moonlight Hunt: each Wolf or Werewolf you control deals damage equal to its power to a creature you don't control", () => {
    let { s, ap, ids, opp } = setup([moonlightHunt]);
    putOnBattlefield(s, ap, creature("Test Wolf", "Wolf", 2));
    putOnBattlefield(s, ap, creature("Test Werewolf", "Human Werewolf", 3));
    putOnBattlefield(s, ap, creature("Test Beast", "Beast", 5));
    putOnBattlefield(s, opp, creature("Test Their Wolf", "Wolf", 4));
    const t = putOnBattlefield(s, opp, creature("Test Wall", "Wall", 0, 9));
    expect(planCast(s, ap, ids[0]!, [tgt(named(s, ap, "Test Wolf")[0]!)])).toBeNull();
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(t)])));
    expect(s.objects[t]!.damage).toBe(5);
  });

  it("Magmatic Hellkite: the destroyed land's controller searches for a basic land, which enters tapped with a stun counter", () => {
    let { s, ap, ids, opp } = setup([magmaticHellkite]);
    const t = putOnBattlefield(s, opp, card("Test Nonbasic", "Land"));
    const basic = putOnBattlefield(s, opp, card("Forest", "Basic Land — Forest"));
    expect(planCast(s, ap, ids[0]!)).not.toBeNull();
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(basic)] })).toThrow();
    s = choose(s, [tgt(t)]);
    expect(zone(s, t)).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: opp });
    if (s.pending?.kind !== "searchLibrary") throw new Error("no search");
    const found = s.pending.cards[0]!;
    s = resolveAll(act(s, { type: "searchLibrary", player: opp, found: [found] }));
    expect(zone(s, found)).toBe("battlefield");
    expect(controllerOf(s, s.objects[found]!)).toBe(opp);
    expect(s.objects[found]!.tapped).toBe(true);
    expect(counters(s, found, "stun")).toBe(1);
  });
  it("Saffi Eriksdotter returns your creature once when it's put into your graveyard this turn", () => {
    let { s, ap, ids, opp } = setup([shock, shock, shock]);
    const saffi = putOnBattlefield(s, ap, saffiEriksdotter);
    const b = putOnBattlefield(s, ap, creature("Test Kid", "Human", 1));
    s = resolveAll(run(s, planActivate(s, ap, saffi, 0, [tgt(b)])));
    expect(zone(s, saffi)).toBe("graveyard");
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
    const back = named(s, ap, "Test Kid");
    expect(back).toHaveLength(1);
    // A new object: it doesn't come back again (Saffi's ruling).
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(back[0]!)])));
    expect(named(s, ap, "Test Kid")).toHaveLength(0);
  });

  it("Saffi Eriksdotter doesn't return an opponent's creature, and targeting itself does nothing", () => {
    let { s, ap, ids, opp } = setup([shock]);
    const saffi = putOnBattlefield(s, ap, saffiEriksdotter);
    const theirs = putOnBattlefield(s, opp, creature("Test Their Kid", "Human", 1));
    s = resolveAll(run(s, planActivate(s, ap, saffi, 0, [tgt(theirs)])));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(theirs)])));
    expect(zone(s, theirs)).toBe("graveyard");
    expect(named(s, ap, "Test Their Kid")).toHaveLength(0);
    expect(named(s, opp, "Test Their Kid")).toHaveLength(0);
    const saffi2 = putOnBattlefield(s, ap, saffiEriksdotter);
    s = resolveAll(run(s, planActivate(s, ap, saffi2, 0, [tgt(saffi2)])));
    expect(named(s, ap, "Saffi Eriksdotter")).toHaveLength(0);
    expect(s.delayed ?? []).toEqual([]);
  });

  it("Vraska the Unseen +1: until your next turn, a creature that deals combat damage to her is destroyed", () => {
    let { s, ap, opp } = setup([]);
    const v = putOnBattlefield(s, ap, vraskaTheUnseen);
    s.objects[v]!.counters.loyalty = 5;
    s = resolveAll(run(s, planActivate(s, ap, v, 0)));
    expect(counters(s, v, "loyalty")).toBe(6);
    const b = putOnBattlefield(s, opp, bear());
    const c = putOnBattlefield(s, opp, bear({ name: "Test Other Bear" }));
    s = passUntil(s, "main1", opp);
    s = toStep(attack(s, opp, [{ attacker: b, defender: ap, planeswalker: v }, { attacker: c, defender: ap }]), "main2", opp);
    expect(counters(s, v, "loyalty")).toBe(4);
    expect(zone(s, b)).toBe("graveyard");
    expect(zone(s, c)).toBe("battlefield");
  });

  it("Cult Conscript returns from the graveyard only after a non-Skeleton creature died under your control this turn", () => {
    let { s, ap, ids } = setup([shock, shock]);
    const cc = into(s, ap, cultConscript, "graveyard");
    expect(planActivate(s, ap, cc, 0)).toBeNull();
    const sk = putOnBattlefield(s, ap, creature("Test Skeleton", "Skeleton", 1));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(sk)])));
    expect(planActivate(s, ap, cc, 0)).toBeNull();
    const b = putOnBattlefield(s, ap, creature("Test Kid", "Human", 1));
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(b)])));
    s = resolveAll(run(s, planActivate(s, ap, cc, 0)));
    expect(zone(s, cc)).toBe("battlefield");
    expect(s.objects[cc]!.tapped).toBe(true);
  });

  it("Game Over costs {2} less once a player is at half their starting life or less, and destroys all creatures", () => {
    let { s, ap, ids, opp } = setup([gameOver]);
    const b = putOnBattlefield(s, opp, bear());
    const swamps = lands(s, ap).filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Swamp");
    tapAllBut(s, ap, [...swamps, lands(s, ap).find((id) => !swamps.includes(id))!]);
    expect(planCast(s, ap, ids[0]!)).toBeNull();
    s.players[next(s, ap, 2)]!.life = 20;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(zone(s, b)).toBe("graveyard");
  });

  it("Tainted Sigil gains the total life lost by all players this turn", () => {
    let { s, ap, ids, opp } = setup([shock, shock]);
    const sig = putOnBattlefield(s, ap, taintedSigil);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [player(ap)])));
    expect(life(s, ap)).toBe(38);
    s = resolveAll(run(s, planActivate(s, ap, sig, 0)));
    expect(life(s, ap)).toBe(42);
    expect(zone(s, sig)).toBe("graveyard");
  });

  it("Henrika, Infernal Seer pumps each creature you control with flying, deathtouch or lifelink", () => {
    let { s, ap, opp } = setup([]);
    const h = putOnBattlefield(s, ap, henrikaDomnathi);
    s.objects[h]!.face = 1;
    invalidateCharacteristics(s);
    const bird = putOnBattlefield(s, ap, card("Test Bird", "Creature — Bird", "{U}", { power: "1", toughness: "1", oracleText: "Flying", keywords: ["Flying"] }));
    const b = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, card("Test Their Bird", "Creature — Bird", "{U}", { power: "1", toughness: "1", oracleText: "Flying", keywords: ["Flying"] }));
    expect(pt(s, h)).toEqual([3, 4]);
    s = resolveAll(run(s, planActivate(s, ap, h, 0)));
    expect([pt(s, h), pt(s, bird), pt(s, b), pt(s, theirs)]).toEqual([[4, 4], [2, 1], [2, 2], [1, 1]]);
  });

  it("Celeborn the Wise: attacking with an Elf scries 1, and each scry gives +1/+1 per card looked at", () => {
    let { s, ap, opp } = setup([]);
    const c = putOnBattlefield(s, ap, celebornTheWise);
    const e = putOnBattlefield(s, ap, creature("Test Elf", "Elf", 1));
    s = toStep(attack(s, ap, [{ attacker: e, defender: opp }]), "main2", ap);
    expect(s.pending).toMatchObject({ kind: "arrangeTop", how: "scry", player: ap });
    if (s.pending?.kind !== "arrangeTop") throw new Error("no scry");
    s = act(s, { type: "arrangeTop", player: ap, top: s.pending.cards, away: [] });
    s = toStep(s, "main2", ap);
    expect(pt(s, c)).toEqual([4, 4]);
  });

  it("By Invitation Only: each player sacrifices the chosen number of creatures of their choice", () => {
    let { s, ap, ids, opp } = setup([byInvitationOnly]);
    const mine = [1, 2, 3].map((i) => putOnBattlefield(s, ap, creature(`Test Mine ${i}`, "Human", i)));
    const theirs = [1, 2].map((i) => putOnBattlefield(s, opp, creature(`Test Theirs ${i}`, "Human", i)));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "number", numberRange: { min: 0, max: 13 } });
    s = resolveAll(act(s, { type: "chooseOption", player: ap, choice: "2" }));
    // You choose yours; bots choose theirs.
    for (let i = 0; i < 8 && s.pending?.kind === "pickPermanents"; i++) {
      const p = s.pending;
      expect(p.count).toBe(2);
      s = resolveAll(act(s, { type: "pickPermanents", player: p.player, ids: p.player === ap ? [mine[0]!, mine[2]!] : p.options.slice(0, 2) }));
    }
    expect(mine.map((id) => zone(s, id))).toEqual(["graveyard", "battlefield", "graveyard"]);
    expect(theirs.map((id) => zone(s, id))).toEqual(["graveyard", "graveyard"]);
  });
  it("bots answer SOLDIER Military Program's modes and pick, and By Invitation Only's number", () => {
    let { s, ap, ids } = setup([byInvitationOnly]);
    putOnBattlefield(s, ap, soldierMilitaryProgram);
    putOnBattlefield(s, ap, commander("Test Leader"), { commander: true });
    putOnBattlefield(s, ap, creature("Test Soldier", "Human Soldier", 2));
    const bot = (s: GameState) => {
      for (let i = 0; i < 40 && s.pending && s.pending.kind !== "declareAttackers"; i++) s = act(s, botActions(s, s.pending.player)[0]!);
      return s;
    };
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    s = bot(s);
    s = resolveAll(s);
    s = passUntil(s, "beginCombat", ap);
    expect(s.pending?.kind).toBe("chooseModes");
    const picked = botActions(s, ap)[0]!;
    expect(picked).toMatchObject({ type: "chooseModes", modes: [0, 1] });
    s = bot(resolveAll(act(s, picked)));
    s = toStep(s, "declareAttackers", ap);
  });
});
