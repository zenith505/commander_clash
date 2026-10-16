// Spells and abilities usable only at certain times (CR 506.8, 601.3, 602.5b): "Cast this spell only during combat
// before blockers are declared", "... only during the declare attackers step and only if you've been attacked this
// step" (a creature attacked you, not only your planeswalkers: Heavy Fog rulings), "Activate only during your upkeep",
// "... only during your turn and only if an opponent lost life this turn", a mana ability "only during an opponent's
// turn". "During combat after blockers are declared" can't be used in a combat whose declare blockers step was skipped
// (506.8f).

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, island, passAll, passUntil, plainsCard, putOnBattlefield, setup, target } from "./helpers";
import { abilitiesOf, abilityProblem, botActions, castProblem, isFullySupported, loseLife, moveObject, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall), except `afterBlocks`, which uses the real phrase on a plain effect.
const heavyFog = card("Heavy Fog", "Instant", "{1}{G}", { oracleText: "Cast this spell only during the declare attackers step and only if you've been attacked this step.\nPrevent all damage that would be dealt to you this turn by attacking creatures." });
const remove = card("Remove", "Instant", "{U}", { oracleText: "Cast this spell only during the declare attackers step and only if you've been attacked this step.\nReturn target attacking creature to its owner's hand." });
const panic = card("Panic", "Instant", "{R}", { oracleText: "Cast this spell only during combat before blockers are declared.\nTarget creature can't block this turn.\nDraw a card at the beginning of the next turn's upkeep." });
const festival = card("Festival", "Instant", "{W}", { oracleText: "Cast this spell only during an opponent's upkeep.\nCreatures can't attack this turn." });
const reset = card("Reset", "Instant", "{U}{U}", { oracleText: "Cast this spell only during an opponent's turn after their upkeep step.\nUntap all lands you control." });
const necrologia = card("Necrologia", "Instant", "{3}{B}{B}", { oracleText: "Cast this spell only during your end step.\nAs an additional cost to cast this spell, pay X life.\nDraw X cards." });
const savageBeating = card("Savage Beating", "Instant", "{3}{R}{R}", { keywords: ["Entwine"], oracleText: "Cast this spell only during combat on your turn.\nChoose one —\n• Creatures you control gain double strike until end of turn.\n• Untap all creatures you control. After this phase, there is an additional combat phase.\nEntwine {1}{R} (Choose both if you pay the entwine cost.)" });
const teleport = card("Teleport", "Instant", "{U}{U}{U}", { oracleText: "Cast this spell only during the declare attackers step.\nTarget creature can't be blocked this turn." });
const feast = card("Feast of Blood", "Sorcery", "{1}{B}", { oracleText: "Cast this spell only if you control two or more Vampires.\nDestroy target creature. You gain 4 life." });
const afterBlocks = card("Late Vigil", "Instant", "{W}", { oracleText: "Cast this spell only during combat after blockers are declared.\nYou gain 3 life." });
const eternalDragon = card("Eternal Dragon", "Creature — Dragon Spirit", "{5}{W}{W}", { power: "5", toughness: "5", keywords: ["Flying", "Plainscycling", "Landcycling", "Typecycling", "Cycling"], oracleText: "Flying\n{3}{W}{W}: Return this card from your graveyard to your hand. Activate only during your upkeep.\nPlainscycling {2} ({2}, Discard this card: Search your library for a Plains card, reveal it, put it into your hand, then shuffle.)" });
const gutterbones = card("Gutterbones", "Creature — Skeleton Warrior", "{B}", { power: "2", toughness: "1", oracleText: "This creature enters tapped.\n{1}{B}: Return this card from your graveyard to your hand. Activate only during your turn and only if an opponent lost life this turn." });
const kongming = card("Kongming's Contraptions", "Creature — Human Soldier", "{3}{W}", { power: "2", toughness: "4", oracleText: "{T}: This creature deals 2 damage to target attacking creature. Activate only during the declare attackers step and only if you've been attacked this step." });
const lavinia = card("Lavinia, Foil to Conspiracy", "Legendary Creature — Human Detective", "{1}{W/U}{W/U}", { power: "2", toughness: "3", keywords: ["Investigate", "Vigilance"], oracleText: "Vigilance\nWhenever you cast your second spell each turn, investigate. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")\n{T}: Add {C}{C}. Activate only during an opponent's turn." });
const desert = card("Desert", "Land — Desert", "", { oracleText: "{T}: Add {C}.\n{T}: This land deals 1 damage to target attacking creature. Activate only during the end of combat step." });
const kuldotha = card("Kuldotha Phoenix", "Creature — Phoenix", "{2}{R}{R}{R}", { power: "4", toughness: "4", keywords: ["Flying", "Metalcraft", "Haste"], oracleText: "Flying, haste\nMetalcraft — {4}: Return this card from your graveyard to the battlefield. Activate only during your upkeep and only if you control three or more artifacts." });
const vampire = card("Vampire Nighthawk", "Creature — Vampire Shaman", "{1}{B}{B}", { power: "2", toughness: "3" });
const arcumsSleigh = card("Arcum's Sleigh", "Artifact", "{1}", { oracleText: "{2}, {T}: Target creature gains vigilance until end of turn. Activate only during combat and only if defending player controls a snow land." });

/** Nothing in the way but paying (the mana is in lands, not the pool). */
const allowed = (problem: string | null) => problem === null || /^not enough mana/.test(problem);
const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

/** A card in `pid`'s hand. */
function inHand(s: GameState, pid: PlayerId, d: CardDef) {
  const id = putOnBattlefield(s, pid, d);
  moveObject(s, id, "hand");
  return id;
}
function inGraveyard(s: GameState, pid: PlayerId, d: CardDef) {
  const id = putOnBattlefield(s, pid, d);
  moveObject(s, id, "graveyard");
  return s.players[pid]!.graveyard.find((g) => s.objects[g]!.cardId === d.oracleId)!;
}
const lands = (s: GameState, pid: PlayerId, ...defs: CardDef[]) => defs.forEach((d) => putOnBattlefield(s, pid, d));
/** Pass priority until `pid` has it (in the same step). */
function priorityTo(s: GameState, pid: PlayerId) {
  for (let i = 0; i < 8 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(waitingOn(s)).toBe(pid);
  return s;
}
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return s;
};
const attackWith = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) => act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks });
const ability = (s: GameState, id: string, zone: "battlefield" | "graveyard" = "battlefield") => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => (a.zone === "graveyard") === (zone === "graveyard") && !a.mana);

describe("cast only during", () => {
  it("parses", () => supported(heavyFog, remove, panic, festival, reset, necrologia, savageBeating, teleport, feast, afterBlocks, eternalDragon, gutterbones, kongming, lavinia, desert, kuldotha));

  it("leaves out an ability about the defending player of a combat its source isn't in (Arcum's Sleigh)", () => expect(isFullySupported(arcumsSleigh)).toBe(false));

  it("Heavy Fog: only in the declare attackers step, by a player a creature attacks", () => {
    const { s: s0, ap, opp } = setup([]);
    const third = s0.turnOrder[(s0.turnOrder.indexOf(opp) + 1) % 4]!;
    const fog = inHand(s0, opp, heavyFog), fog3 = inHand(s0, third, heavyFog);
    lands(s0, opp, forest, forest);
    lands(s0, third, forest, forest);
    const a = putOnBattlefield(s0, ap, bear()), b = putOnBattlefield(s0, ap, bear());
    expect(castProblem(s0, opp, fog)).toBe("Heavy Fog can be cast only during the declare attackers step and only if you've been attacked this step");
    let s = attackWith(s0, ap, [{ attacker: a, defender: opp }, { attacker: b, defender: opp }]);
    expect(s.step).toBe("declareAttackers");
    // The player who wasn't attacked can't.
    expect(castProblem(s, third, fog3)).toMatch(/only if you've been attacked/);
    s = priorityTo(s, opp);
    s = run(s, planCast(s, opp, fog));
    s = passAll(s);
    expect(s.stack).toHaveLength(0);
    s = passUntil(s, "main2", ap);
    expect(s.players[opp]!.life).toBe(40);
  });

  it("Remove: the attacked player bounces an attacker", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = inHand(s0, opp, remove);
    lands(s0, opp, island);
    const a = putOnBattlefield(s0, ap, bear());
    let s = priorityTo(attackWith(s0, ap, [{ attacker: a, defender: opp }]), opp);
    s = passAll(run(s, planCast(s, opp, r, [target(a)])));
    expect(s.players[ap]!.hand.some((h) => s.objects[h]!.cardId === s.objects[a]?.cardId || h === a)).toBe(true);
    expect(s.battlefield).not.toContain(a);
  });

  it("Panic: during combat before blockers are declared, not in a main phase or after blocks", () => {
    const { s: s0, ap, ids, opp } = setup([panic, panic]);
    const blocker = putOnBattlefield(s0, opp, bear());
    expect(castProblem(s0, ap, ids[0]!, [target(blocker)])).toBe("Panic can be cast only during combat before blockers are declared");
    let s = passUntil(s0, "beginCombat", ap);
    expect(allowed(castProblem(s, ap, ids[0]!, [target(blocker)]))).toBe(true);
    s = passAll(run(s, planCast(s, ap, ids[0]!, [target(blocker)])));
    const a = putOnBattlefield(s, ap, bear());
    s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
    expect(allowed(castProblem(s, ap, ids[1]!, [target(blocker)]))).toBe(true);
    s = act(passUntil(s, "declareBlockers", ap), { type: "declareBlockers", player: opp, blocks: [] });
    expect(castProblem(s, ap, ids[1]!, [target(blocker)])).toMatch(/only during combat before blockers/);
  });

  it("after blockers are declared: not in a combat with no attackers, which skips that step (CR 506.8f)", () => {
    const { s: s0, ap, ids } = setup([afterBlocks]);
    const s = passUntil(s0, "endCombat", ap);
    expect(castProblem(s, ap, ids[0]!)).toMatch(/only during combat after blockers/);
    const { s: t0, ap: ap2, ids: ids2, opp: opp2 } = setup([afterBlocks]);
    const a = putOnBattlefield(t0, ap2, bear());
    let t = attackWith(t0, ap2, [{ attacker: a, defender: opp2 }]);
    t = act(passUntil(t, "declareBlockers", ap2), { type: "declareBlockers", player: opp2, blocks: [] });
    expect(allowed(castProblem(t, ap2, ids2[0]!))).toBe(true);
    t = passUntil(t, "endCombat", ap2);
    expect(allowed(castProblem(t, ap2, ids2[0]!))).toBe(true);
  });

  it("whose turn: Festival in an opponent's upkeep, Reset after it, Necrologia in your end step, Savage Beating in your combat", () => {
    const { s: s0, ap, ids, opp } = setup([necrologia, savageBeating]);
    const f = inHand(s0, opp, festival), r = inHand(s0, opp, reset);
    lands(s0, opp, plainsCard, island, island);
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, 1)).toBe("Necrologia can be cast only during your end step");
    expect(castProblem(s0, ap, ids[1]!, undefined, [0])).toMatch(/only during combat on your turn/);
    let s = passUntil(s0, "beginCombat", ap);
    expect(allowed(castProblem(s, ap, ids[1]!, undefined, [0]))).toBe(true);
    s = passUntil(s, "end", ap);
    expect(allowed(castProblem(s, ap, ids[0]!, undefined, undefined, undefined, undefined, 1))).toBe(true);
    // Reset: this is an opponent's turn for `opp`, past the upkeep.
    expect(castProblem(s, opp, r)).not.toMatch(/only during/);
    // Festival: in an opponent's upkeep, not in its own.
    const next = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    expect(next).toBe(opp);
    s = passUntil(s, "upkeep", opp);
    expect(castProblem(s, opp, f)).toMatch(/only during an opponent's upkeep/);
    expect(castProblem(s, opp, r)).toMatch(/only during an opponent's turn after their upkeep step/);
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(opp) + 1) % 4]!);
    expect(castProblem(s, opp, f)).not.toMatch(/only during/);
    expect(castProblem(s, opp, r)).toMatch(/after their upkeep step/);
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = passUntil(s, "draw", s.activePlayer);
    expect(castProblem(s, opp, r)).not.toMatch(/only during/);
  });

  it("Teleport: any player's declare attackers step", () => {
    const { s: s0, ap, ids, opp } = setup([teleport]);
    const a = putOnBattlefield(s0, ap, bear());
    expect(castProblem(s0, ap, ids[0]!, [target(a)])).toMatch(/only during the declare attackers step/);
    const s = attackWith(s0, ap, [{ attacker: a, defender: opp }]);
    expect(allowed(castProblem(s, ap, ids[0]!, [target(a)]))).toBe(true);
  });

  it("Feast of Blood: only with two or more Vampires (CR 601.3)", () => {
    const { s, ap, ids, opp } = setup([feast]);
    const victim = putOnBattlefield(s, opp, bear());
    putOnBattlefield(s, ap, vampire);
    expect(castProblem(s, ap, ids[0]!, [target(victim)])).toBe("Feast of Blood can be cast only if you control two or more Vampires");
    putOnBattlefield(s, ap, vampire);
    expect(allowed(castProblem(s, ap, ids[0]!, [target(victim)]))).toBe(true);
  });
});

describe("activate only during", () => {
  it("Eternal Dragon: from your graveyard, only during your upkeep", () => {
    const { s: s0, ap } = setup([]);
    const d = inGraveyard(s0, ap, eternalDragon);
    const i = ability(s0, d, "graveyard");
    expect(abilityProblem(s0, ap, d, i)).toBe("Eternal Dragon's ability can't be activated now");
    let s = passUntil(s0, "upkeep", ap);
    expect(s.objects[d]!.zone).toBe("graveyard");
    s = passAll(run(s, planActivate(s, ap, d, i)));
    expect(s.players[ap]!.hand).toContain(d);
  });

  it("Gutterbones: during your turn and only if an opponent lost life this turn", () => {
    const { s, ap, opp } = setup([]);
    const g = inGraveyard(s, ap, gutterbones);
    const i = ability(s, g, "graveyard");
    expect(abilityProblem(s, ap, g, i)).toMatch(/can't be activated now/);
    loseLife(s, opp, 1);
    expect(allowed(abilityProblem(s, ap, g, i))).toBe(true);
    // An opponent's turn: no.
    const t = priorityTo(passUntil(s, "main1", opp), ap);
    loseLife(t, opp, 1);
    expect(abilityProblem(t, ap, g, i)).toMatch(/can't be activated now/);
  });

  it("Kongming's Contraptions: when attacked, 2 damage to an attacker", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, opp, kongming);
    const a = putOnBattlefield(s0, ap, bear());
    expect(abilityProblem(priorityTo(passAll(s0), opp), opp, k, 0, [target(a)])).toMatch(/can't be activated now/);
    let s = priorityTo(attackWith(s0, ap, [{ attacker: a, defender: opp }]), opp);
    s = passAll(run(s, planActivate(s, opp, k, 0, [target(a)])));
    expect(s.battlefield).not.toContain(a);
  });

  it("Desert: only during the end of combat step", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, opp, desert);
    const a = putOnBattlefield(s0, ap, bear({ toughness: "1", name: "Frail Bear" }));
    const i = ability(s0, d);
    let s = priorityTo(attackWith(s0, ap, [{ attacker: a, defender: opp }]), opp);
    expect(abilityProblem(s, opp, d, i, [target(a)])).toMatch(/can't be activated now/);
    s = priorityTo(act(passUntil(s, "declareBlockers", ap), { type: "declareBlockers", player: opp, blocks: [] }), opp);
    expect(abilityProblem(s, opp, d, i, [target(a)])).toMatch(/can't be activated now/);
    s = priorityTo(passUntil(s, "endCombat", ap), opp);
    s = passAll(run(s, planActivate(s, opp, d, i, [target(a)])));
    expect(s.battlefield).not.toContain(a);
  });

  it("Kuldotha Phoenix: in your upkeep with metalcraft", () => {
    const { s: s0, ap } = setup([]);
    const p = inGraveyard(s0, ap, kuldotha);
    const i = ability(s0, p, "graveyard");
    let s = passUntil(s0, "upkeep", ap);
    expect(abilityProblem(s, ap, p, i)).toMatch(/can't be activated now/);
    for (let n = 0; n < 3; n++) putOnBattlefield(s, ap, card(`Bauble ${n}`, "Artifact", "{0}"));
    s = passAll(run(s, planActivate(s, ap, p, i)));
    expect(s.battlefield).toContain(p);
  });

  it("Lavinia: a mana ability only during an opponent's turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const l = putOnBattlefield(s0, opp, lavinia);
    // On the active player's turn, an opponent's for Lavinia's controller.
    expect(act(priorityTo(passAll(s0), opp), { type: "activateMana", player: opp, objectId: l, mana: "C" }).players[opp]!.manaPool.C).toBe(2);
    const own = passUntil(s0, "main1", opp);
    expect(() => act(own, { type: "activateMana", player: opp, objectId: l, mana: "C" })).toThrow(/can.t produce \{C\} right now/);
    expect(ap).not.toBe(opp);
  });
});

describe("bots", () => {
  it("cast Heavy Fog when attacked by enough power, not for one Bear", () => {
    const { s: s0, ap, opp } = setup([]);
    inHand(s0, opp, heavyFog);
    lands(s0, opp, forest, forest);
    const attackers = [0, 1, 2].map(() => putOnBattlefield(s0, ap, bear()));
    const one = priorityTo(attackWith(s0, ap, [{ attacker: attackers[0]!, defender: opp }]), opp);
    expect(botActions(one, opp).some((a) => a.type === "castSpell")).toBe(false);
    const many = priorityTo(attackWith(s0, ap, attackers.map((a) => ({ attacker: a, defender: opp }))), opp);
    expect(botActions(many, opp).some((a) => a.type === "castSpell")).toBe(true);
  });

  it("return Eternal Dragon in their upkeep", () => {
    const { s: s0, ap } = setup([]);
    const d = inGraveyard(s0, ap, eternalDragon);
    const s = passUntil(s0, "upkeep", ap);
    expect(botActions(s, ap).some((a) => a.type === "activateAbility" && a.objectId === d)).toBe(true);
    expect(botActions(s0, ap).some((a) => a.type === "activateAbility" && a.objectId === d)).toBe(false);
  });
});
