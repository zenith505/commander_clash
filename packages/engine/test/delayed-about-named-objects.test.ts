// Delayed triggers about objects an ability named earlier (CR 603.7): "Target creature you control gets +1/+0 ... Destroy
// that creature at the beginning of the next end step" (the object it changed, even if it's no longer a creature, CR
// 700.7; nothing if it left the battlefield, 603.7c and 400.7), the tokens or cards it created or returned, the
// permanents a group effect changed, ~ itself; "at the beginning of your next end step"; "if you do" after a may; the
// player-only kind ("discard three cards at the beginning of the next end step").

import { describe, expect, it } from "vitest";
import { act, bear, card, island, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { controllerOf, isFullySupported, planActivate, planCast, waitingOn, type Action, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const moggCannon = card("Mogg Cannon", "Artifact", "{2}", { oracleText: "{T}: Target creature you control gets +1/+0 and gains flying until end of turn. Destroy that creature at the beginning of the next end step." });
const celestialSword = card("Celestial Sword", "Artifact", "{6}", { oracleText: "{3}, {T}: Target creature you control gets +3/+3 until end of turn. Its controller sacrifices it at the beginning of the next end step." });
const krovikan = card("Krovikan Elementalist", "Creature — Human Wizard", "{B}{B}", { power: "1", toughness: "1", oracleText: "{2}{R}: Target creature gets +1/+0 until end of turn.\n{U}{U}: Target creature you control gains flying until end of turn. Sacrifice it at the beginning of the next end step." });
const deathknell = card("Deathknell Kami", "Creature — Spirit", "{1}{B}", { power: "0", toughness: "1", keywords: ["Flying", "Soulshift"], oracleText: "Flying\n{2}: This creature gets +1/+1 until end of turn. Sacrifice it at the beginning of the next end step.\nSoulshift 1 (When this creature dies, you may return target Spirit card with mana value 1 or less from your graveyard to your hand.)" });
const dragonMask = card("Dragon Mask", "Artifact", "{3}", { oracleText: "{3}, {T}: Target creature you control gets +2/+2 until end of turn. Return it to its owner's hand at the beginning of the next end step. (Return it only if it's on the battlefield.)" });
const macabre = card("Macabre Mockery", "Instant", "{2}{B}{R}", { oracleText: "Put target creature card from an opponent's graveyard onto the battlefield under your control. It gets +2/+0 and gains haste until end of turn. Sacrifice it at the beginning of the next end step." });
const oldHob = card("Old Hob, Alleycat Blues", "Legendary Creature — Cat Mutant Rebel", "{4}{R}", { power: "4", toughness: "4", oracleText: "At the beginning of combat on your turn, create a 2/2 red Mutant creature token. It gains haste until end of turn. Destroy it at the beginning of the next end step.\n{1}{W}: Target attacking creature token gains indestructible until end of turn." });
const stoneIdol = card("Stone Idol Trap", "Instant — Trap", "{5}{R}", { oracleText: "This spell costs {1} less to cast for each attacking creature.\nCreate a 6/12 colorless Construct artifact creature token with trample. Exile it at the beginning of your next end step." });
const ideas = card("Ideas Unbound", "Sorcery — Arcane", "{U}{U}", { oracleText: "Draw three cards. Discard three cards at the beginning of the next end step." });
const rukhEgg = card("Rukh Egg", "Creature — Bird Egg", "{3}{R}", { power: "0", toughness: "3", oracleText: "When this creature dies, create a 4/4 red Bird creature token with flying at the beginning of the next end step." });
const momo = card("Momo's Heist", "Sorcery", "{2}{R}", { oracleText: "Gain control of target artifact. Untap it. It gains haste. At the beginning of the next end step, sacrifice it." });
const hazoret = card("Hazoret's Favor", "Enchantment", "{2}{R}", { oracleText: "At the beginning of combat on your turn, you may have target creature you control get +2/+0 and gain haste until end of turn. If you do, sacrifice it at the beginning of the next end step." });
const cogwork = card("Cogwork Assembler", "Artifact Creature — Assembly-Worker", "{3}", { power: "2", toughness: "3", oracleText: "{7}: Create a token that's a copy of target artifact. That token gains haste. Exile it at the beginning of the next end step." });
const wings = card("Wings of Hubris", "Artifact — Equipment", "{2}", { keywords: ["Equip"], oracleText: "Equipped creature has flying.\nSacrifice this Equipment: Equipped creature can't be blocked this turn. Sacrifice it at the beginning of the next end step.\nEquip {1} ({1}: Attach to target creature you control. Equip only as a sorcery.)" });
const tears = card("Tears of Rage", "Instant", "{2}{R}{R}", { oracleText: "Cast this spell only during the declare attackers step.\nAttacking creatures you control get +X/+0 until end of turn, where X is the number of attacking creatures. Sacrifice those creatures at the beginning of the next end step." });
const soulshriek = card("Soulshriek", "Instant", "{B}", { oracleText: "Target creature you control gets +X/+0 until end of turn, where X is the number of creature cards in your graveyard. Sacrifice that creature at the beginning of the next end step." });
const saltRoad = card("Salt Road Skirmish", "Sorcery", "{3}{B}", { oracleText: "Destroy target creature. Create two 1/1 red Warrior creature tokens. They gain haste until end of turn. Sacrifice them at the beginning of the next end step." });
const transluminant = card("Transluminant", "Creature — Dryad Shaman", "{1}{G}", { power: "2", toughness: "2", oracleText: "{W}, Sacrifice this creature: Create a 1/1 white Spirit creature token with flying at the beginning of the next end step." });
const apprentice = card("Apprentice Necromancer", "Creature — Zombie Wizard", "{1}{B}", { power: "1", toughness: "1", oracleText: "{B}, {T}, Sacrifice this creature: Return target creature card from your graveyard to the battlefield. That creature gains haste. At the beginning of the next end step, sacrifice it." });
const slave = card("Slave of Bolas", "Sorcery", "{3}{U/R}{B}", { oracleText: "Gain control of target creature. Untap that creature. It gains haste until end of turn. Sacrifice it at the beginning of the next end step." });
const attackBox = card("Attack-in-the-Box", "Artifact Creature — Toy", "{3}", { power: "2", toughness: "4", oracleText: "Whenever this creature attacks, you may have it get +4/+0 until end of turn. If you do, sacrifice it at the beginning of the next end step." });
const cauldron = card("Cauldron Dance", "Instant", "{4}{B}{R}", { oracleText: "Cast this spell only during combat.\nReturn target creature card from your graveyard to the battlefield. That creature gains haste. Return it to your hand at the beginning of the next end step.\nYou may put a creature card from your hand onto the battlefield. That creature gains haste. Its controller sacrifices it at the beginning of the next end step." });
const puppeteer = card("Puppeteer Clique", "Creature — Faerie Wizard", "{3}{B}{B}", { power: "3", toughness: "2", keywords: ["Flying", "Persist"], oracleText: "Flying\nWhen this creature enters, put target creature card from an opponent's graveyard onto the battlefield under your control. It gains haste. At the beginning of your next end step, exile it.\nPersist (When this creature dies, if it had no -1/-1 counters on it, return it to the battlefield under its owner's control with a -1/-1 counter on it.)" });
const statue = card("Ornithopter", "Artifact Creature — Thopter", "{0}", { power: "0", toughness: "2", keywords: ["Flying"] });
const relic = card("Darksteel Relic", "Artifact", "{0}");

const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return settle(plan!.reduce((x, a) => act(x, a), s));
};
const castIt = (s: GameState, pid: PlayerId, id: string, targets?: TargetChoice[]) => run(s, planCast(s, pid, id, targets));
const activateIt = (s: GameState, pid: PlayerId, id: string, index: number, targets?: TargetChoice[]) => run(s, planActivate(s, pid, id, index, targets));
/** To the active player's end step, with its delayed triggers resolved. */
const toEnd = (s: GameState, pid: PlayerId) => settle(passUntil(s, "end", pid));
const toGraveyard = (s: GameState, id: string) => {
  const o = s.objects[id]!;
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  o.zone = "graveyard";
  s.players[o.owner]!.graveyard.push(id);
};

describe("delayed triggers about objects named earlier", () => {
  it("parse", () => {
    for (const d of [moggCannon, celestialSword, krovikan, deathknell, dragonMask, macabre, oldHob, stoneIdol, ideas, rukhEgg, momo, hazoret, cogwork, wings, tears, soulshriek, saltRoad, transluminant, apprentice, slave, attackBox, cauldron, puppeteer])
      expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Mogg Cannon: the creature it changed is destroyed at the next end step, even if it's no longer a creature (CR 700.7)", () => {
    const { s: s0, ap } = setup([]);
    const cannon = putOnBattlefield(s0, ap, moggCannon);
    const b = putOnBattlefield(s0, ap, bear());
    let s = activateIt(s0, ap, cannon, 0, [target(b)]);
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.delayed?.length).toBe(1);
    // It stops being a creature: "that creature" is still that object.
    s.cards[s.objects[b]!.cardId] = { ...s.cards[s.objects[b]!.cardId]!, typeLine: "Artifact", types: ["Artifact"], subtypes: [] };
    s = toEnd(s, ap);
    expect(s.objects[b]!.zone).toBe("graveyard");
  });

  it("Mogg Cannon: a creature that left the battlefield and came back is a new object, left alone (CR 603.7c, 400.7)", () => {
    const { s: s0, ap } = setup([]);
    const cannon = putOnBattlefield(s0, ap, moggCannon);
    const b = putOnBattlefield(s0, ap, bear());
    let s = activateIt(s0, ap, cannon, 0, [target(b)]);
    s.objects[b]!.zoneChanges = (s.objects[b]!.zoneChanges ?? 0) + 2; // blinked
    s = toEnd(s, ap);
    expect(s.objects[b]!.zone).toBe("battlefield");
  });

  it("Dragon Mask: returned to its owner's hand at the next end step", () => {
    const { s: s0, ap } = setup([]);
    const mask = putOnBattlefield(s0, ap, dragonMask);
    const b = putOnBattlefield(s0, ap, bear());
    let s = activateIt(s0, ap, mask, 0, [target(b)]);
    s = toEnd(s, ap);
    expect(s.objects[b]!.zone).toBe("hand");
  });

  it("Celestial Sword: its controller then sacrifices it, even after a change of control", () => {
    const { s: s0, ap, opp } = setup([]);
    const sword = putOnBattlefield(s0, ap, celestialSword);
    const b = putOnBattlefield(s0, ap, bear());
    let s = activateIt(s0, ap, sword, 0, [target(b)]);
    s.objects[b]!.controller = opp;
    s = toEnd(s, ap);
    expect(s.objects[b]!.zone).toBe("graveyard");
  });

  it("Krovikan Elementalist: 'sacrifice it' does nothing once you no longer control it (CR 701.21a)", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, krovikan);
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, ap, island);
    const b = putOnBattlefield(s0, ap, bear());
    const b2 = putOnBattlefield(s0, ap, bear());
    let s = activateIt(s0, ap, k, 1, [target(b)]);
    s = activateIt(s, ap, k, 1, [target(b2)]);
    s.objects[b2]!.controller = opp;
    s = toEnd(s, ap);
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[b2]!.zone).toBe("battlefield");
  });

  it("Deathknell Kami: 'it' is ~, sacrificed once however many times it was pumped", () => {
    const { s: s0, ap } = setup([]);
    const k = putOnBattlefield(s0, ap, deathknell);
    let s = activateIt(s0, ap, k, 0);
    s = activateIt(s, ap, k, 0);
    expect(s.delayed?.length).toBe(2);
    s = toEnd(s, ap);
    expect(s.objects[k]!.zone).toBe("graveyard");
  });

  it("Wings of Hubris: the equipped creature as it last was, after the Equipment was sacrificed to pay", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, wings);
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[w]!.attachedTo = b;
    let s = activateIt(s0, ap, w, 0);
    expect(s.objects[w]!.zone).toBe("graveyard");
    s = toEnd(s, ap);
    expect(s.objects[b]!.zone).toBe("graveyard");
  });

  it("Macabre Mockery: the permanent the card became is sacrificed", () => {
    const { s: s0, ap, opp, ids } = setup([macabre]);
    const theirs = putOnBattlefield(s0, opp, bear());
    toGraveyard(s0, theirs);
    let s = castIt(s0, ap, ids[0]!, [{ kind: "object", id: theirs }]);
    expect(s.objects[theirs]!.zone).toBe("battlefield");
    expect(s.objects[theirs]!.controller).toBe(ap);
    s = toEnd(s, ap);
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.players[opp]!.graveyard).toContain(theirs);
  });

  it("Apprentice Necromancer: 'At the beginning of the next end step, sacrifice it'", () => {
    const { s: s0, ap } = setup([]);
    const nec = putOnBattlefield(s0, ap, apprentice);
    const mine = putOnBattlefield(s0, ap, bear());
    toGraveyard(s0, mine);
    let s = activateIt(s0, ap, nec, 0, [{ kind: "object", id: mine }]);
    expect(s.objects[mine]!.zone).toBe("battlefield");
    s = toEnd(s, ap);
    expect(s.objects[mine]!.zone).toBe("graveyard");
  });

  it("Salt Road Skirmish: both tokens are sacrificed; Momo's Heist: the stolen artifact keeps haste and is sacrificed", () => {
    const { s: s0, ap, opp, ids } = setup([saltRoad, momo]);
    const victim = putOnBattlefield(s0, opp, bear());
    const theirs = putOnBattlefield(s0, opp, statue);
    let s = castIt(s0, ap, ids[0]!, [target(victim)]);
    const warriors = s.battlefield.filter((id) => s.objects[id]!.isToken);
    expect(warriors.length).toBe(2);
    s = castIt(s, ap, ids[1]!, [target(theirs)]);
    expect(controllerOf(s, s.objects[theirs]!)).toBe(ap);
    s = toEnd(s, ap);
    for (const w of warriors) expect(s.objects[w]).toBeUndefined();
    expect(s.objects[theirs]!.zone).toBe("graveyard");
  });

  it("Slave of Bolas: you control it at the end step, so you sacrifice it", () => {
    const { s: s0, ap, opp, ids } = setup([slave]);
    const theirs = putOnBattlefield(s0, opp, bear());
    s0.objects[theirs]!.tapped = true;
    let s = castIt(s0, ap, ids[0]!, [target(theirs)]);
    expect(s.objects[theirs]!.tapped).toBe(false);
    s = toEnd(s, ap);
    expect(s.objects[theirs]!.zone).toBe("graveyard");
  });

  it("Cogwork Assembler: 'That token gains haste' lasts while it's there; the token is exiled at the next end step", () => {
    const { s: s0, ap } = setup([]);
    const cog = putOnBattlefield(s0, ap, cogwork);
    const orni = putOnBattlefield(s0, ap, statue);
    let s = activateIt(s0, ap, cog, 0, [target(orni)]);
    const tok = s.battlefield.find((id) => s.objects[id]!.isToken)!;
    expect(tok).toBeDefined();
    s = passUntil(s, "main2", ap);
    expect(s.objects[tok]?.zone).toBe("battlefield");
    s = toEnd(s, ap);
    expect(s.objects[tok]).toBeUndefined();
    expect(s.objects[orni]!.zone).toBe("battlefield");
  });

  it("Stone Idol Trap: cast on an opponent's turn, the token stays until your own next end step", () => {
    const { s: s0, ap, opp, ids } = setup([stoneIdol]);
    let s = passUntil(s0, "main1", opp);
    for (let i = 0; i < 4 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = castIt(s, ap, ids[0]!);
    const tok = s.battlefield.find((id) => s.objects[id]!.isToken)!;
    expect(s.delayed?.[0]?.when).toBe("yourNextEndStep");
    s = toEnd(s, opp);
    expect(s.objects[tok]?.zone).toBe("battlefield");
    s = toEnd(s, ap);
    expect(s.objects[tok]).toBeUndefined();
  });

  it("Ideas Unbound: draw three now, discard three at the next end step", () => {
    const { s: s0, ap, ids } = setup([ideas]);
    const before = s0.players[ap]!.hand.length - 1;
    let s = castIt(s0, ap, ids[0]!);
    expect(s.players[ap]!.hand.length).toBe(before + 3);
    s = passUntil(s, "end", ap);
    for (let i = 0; i < 20 && s.pending?.kind !== "discard"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const p = s.pending;
    expect(p?.kind === "discard" && p.player === ap && p.count === 3).toBe(true);
    if (p?.kind !== "discard") return;
    s = act(s, { type: "discard", player: ap, objectIds: s.players[ap]!.hand.slice(0, 3) });
    expect(s.players[ap]!.hand.length).toBe(before);
  });

  it("Rukh Egg and Transluminant: the token comes at the next end step, after the source is gone", () => {
    const { s: s0, ap } = setup([]);
    const egg = putOnBattlefield(s0, ap, rukhEgg);
    const tl = putOnBattlefield(s0, ap, transluminant);
    let s = activateIt(s0, ap, tl, 0);
    expect(s.objects[tl]!.zone).toBe("graveyard");
    s.objects[egg]!.damage = 5;
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(s.objects[egg]!.zone).toBe("graveyard");
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken).length).toBe(0);
    s = toEnd(s, ap);
    const names = s.battlefield.filter((id) => s.objects[id]!.isToken).map((id) => s.cards[s.objects[id]!.cardId]!.name).sort();
    expect(names).toEqual(["Bird Token", "Spirit Token"]);
  });

  it("Old Hob: the token it makes each combat is destroyed at the end step", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, oldHob);
    let s = settle(passUntil(s0, "beginCombat", ap));
    const tok = s.battlefield.find((id) => s.objects[id]!.isToken)!;
    expect(tok).toBeDefined();
    s = toEnd(s, ap);
    expect(s.objects[tok]).toBeUndefined();
  });

  it("Hazoret's Favor: sacrificed only if you chose to pump it", () => {
    for (const yes of [true, false]) {
      const { s: s0, ap } = setup([]);
      putOnBattlefield(s0, ap, hazoret);
      const b = putOnBattlefield(s0, ap, bear());
      let s = passUntil(s0, "beginCombat", ap);
      for (let i = 0; i < 20 && (s.triggerQueue.length || s.stack.length || s.pending); i++) {
        const p = s.pending;
        if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: [target(b)] });
        else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes });
        else s = act(s, { type: "passPriority", player: waitingOn(s)! });
      }
      s = toEnd(s, ap);
      expect(s.objects[b]!.zone, String(yes)).toBe(yes ? "graveyard" : "battlefield");
    }
  });

  it("Tears of Rage: each attacking creature it pumped is sacrificed", () => {
    const { s: s0, ap, ids } = setup([tears]);
    const a1 = putOnBattlefield(s0, ap, bear());
    const a2 = putOnBattlefield(s0, ap, bear());
    const home = putOnBattlefield(s0, ap, bear());
    let s = passUntil(s0, "declareAttackers", ap);
    const opp = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a1, defender: opp }, { attacker: a2, defender: opp }] });
    s = castIt(s, ap, ids[0]!);
    expect(s.delayed?.length).toBe(2);
    s = toEnd(s, ap);
    expect([s.objects[a1]!.zone, s.objects[a2]!.zone, s.objects[home]!.zone]).toEqual(["graveyard", "graveyard", "battlefield"]);
  });

  it("Puppeteer Clique: the stolen creature is exiled at your next end step", () => {
    const { s: s0, ap, opp, ids } = setup([puppeteer]);
    const theirs = putOnBattlefield(s0, opp, bear());
    toGraveyard(s0, theirs);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 10 && s.pending?.kind === "chooseTargets"; i++) s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: theirs }] }));
    expect(s.objects[theirs]!.zone).toBe("battlefield");
    s = toEnd(s, ap);
    expect(s.objects[theirs]!.zone).toBe("exile");
  });

  it("Momo's Heist on a noncreature artifact: gained, untapped and sacrificed", () => {
    const { s: s0, ap, opp, ids } = setup([momo]);
    const r = putOnBattlefield(s0, opp, relic);
    let s = castIt(s0, ap, ids[0]!, [target(r)]);
    expect(controllerOf(s, s.objects[r]!)).toBe(ap);
    s = toEnd(s, ap);
    expect(s.objects[r]!.zone).toBe("graveyard");
  });

  it("Soulshriek: one delayed trigger for its one target", () => {
    const { s: s0, ap, ids } = setup([soulshriek]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = castIt(s0, ap, ids[0]!, [target(b)]);
    expect(s.delayed?.length).toBe(1);
    s = toEnd(s, ap);
    expect(s.objects[b]!.zone).toBe("graveyard");
  });
});
