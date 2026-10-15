// Additional combat and main phases (CR 500.8, 505.1a): Relentless Assault, Aurelia, Port Razer, Karlach, Combat
// Celebrant, Finest Hour; "attacks for the first time each turn", "if it's the first combat phase of the turn",
// "whenever ~ attacks alone", "can't attack a player it has already attacked this turn".

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passAll, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { addPhases, attackProblem, botActions, isFullySupported, parseManaCost, planMana, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) =>
  settle(act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks }));
/** Nobody blocks; on to the end of combat step. */
const noBlocks = (s: GameState) => settle(passUntil(s, "endCombat"));
/** Pass (attacking with nothing) until the end step, noting each step entered. */
const stepsToEnd = (s: GameState) => {
  const seen: string[] = [];
  for (let i = 0; i < 200 && s.step !== "end"; i++) {
    const before = s.step;
    s = s.pending?.kind === "declareAttackers" ? act(s, { type: "declareAttackers", player: s.pending.player, attacks: [] }) : act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.step !== before) seen.push(s.step);
  }
  return seen;
};

// Real oracle text (Scryfall).
const assault = card("Relentless Assault", "Sorcery", "{2}{R}{R}", { oracleText: "Untap all creatures that attacked this turn. After this main phase, there is an additional combat phase followed by an additional main phase." });
const seize = card("Seize the Day", "Sorcery", "{3}{R}", { keywords: ["Flashback"], oracleText: "Untap target creature. After this main phase, there is an additional combat phase followed by an additional main phase.\nFlashback {2}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.)" });
const aurelia = card("Aurelia, the Warleader", "Legendary Creature — Angel", "{2}{R}{R}{W}{W}", { power: "3", toughness: "4", keywords: ["Flying", "Vigilance", "Haste"], oracleText: "Flying, vigilance, haste\nWhenever Aurelia attacks for the first time each turn, untap all creatures you control. After this phase, there is an additional combat phase." });
const razer = card("Port Razer", "Creature — Orc Pirate", "{3}{R}{R}", { power: "4", toughness: "4", oracleText: "Whenever this creature deals combat damage to a player, untap each creature you control. After this phase, there is an additional combat phase.\nThis creature can't attack a player it has already attacked this turn." });
const karlach = card("Karlach, Fury of Avernus", "Legendary Creature — Tiefling Barbarian", "{4}{R}", { power: "5", toughness: "4", keywords: ["Choose a background"], oracleText: "Whenever you attack, if it's the first combat phase of the turn, untap all attacking creatures. They gain first strike until end of turn. After this phase, there is an additional combat phase.\nChoose a Background (You can have a Background as a second commander.)" });
const celebrant = card("Combat Celebrant", "Creature — Human Warrior", "{2}{R}", { power: "4", toughness: "1", keywords: ["Exert"], oracleText: "If this creature hasn't been exerted this turn, you may exert it as it attacks. When you do, untap all other creatures you control and after this phase, there is an additional combat phase. (An exerted creature won't untap during your next untap step.)" });
const finest = card("Finest Hour", "Enchantment", "{2}{G}{W}{U}", { keywords: ["Exalted"], oracleText: "Exalted (Whenever a creature you control attacks alone, that creature gets +1/+1 until end of turn.)\nWhenever a creature you control attacks alone, if it's the first combat phase of the turn, untap that creature. After this phase, there is an additional combat phase." });
const scourge = card("Scourge of the Throne", "Creature — Dragon", "{4}{R}{R}", { power: "5", toughness: "5", keywords: ["Flying", "Dethrone"], oracleText: "Flying\nDethrone (Whenever this creature attacks the player with the most life or tied for most life, put a +1/+1 counter on it.)\nWhenever this creature attacks for the first time each turn, if it's attacking the player with the most life or tied for most life, untap all attacking creatures. After this phase, there is an additional combat phase." });
const sprint = card("Grim Reaper's Sprint", "Enchantment — Aura", "{4}{R}", { keywords: ["Enchant", "Morbid"], oracleText: "Morbid — This spell costs {3} less to cast if a creature died this turn.\nEnchant creature\nWhen this Aura enters, untap each creature you control. If it's your main phase, there is an additional combat phase after this phase.\nEnchanted creature gets +2/+2 and has haste." });
const hellkite = card("Hellkite Charger", "Creature — Dragon", "{4}{R}{R}", { power: "5", toughness: "5", keywords: ["Flying", "Haste"], oracleText: "Flying, haste\nWhenever this creature attacks, you may pay {5}{R}{R}. If you do, untap all attacking creatures and after this phase, there is an additional combat phase." });
const runner = card("Lightning Runner", "Creature — Human Warrior", "{3}{R}{R}", { power: "2", toughness: "2", keywords: ["Haste", "Double strike"], oracleText: "Double strike, haste\nWhenever this creature attacks, you get {E}{E} (two energy counters), then you may pay eight {E}. If you pay, untap all creatures you control, and after this phase, there is an additional combat phase." });
const kavu = card("Rogue Kavu", "Creature — Kavu", "{1}{R}", { power: "1", toughness: "1", oracleText: "Whenever this creature attacks alone, it gets +2/+0 until end of turn." });
const lunk = card("Lunk Errant", "Creature — Giant Warrior", "{5}{R}", { power: "4", toughness: "4", oracleText: "Whenever this creature attacks alone, it gets +1/+1 and gains trample until end of turn." });

describe("additional combat phases", () => {
  it("Relentless Assault in the second main phase: untap the creatures that attacked, then another combat and main phase", () => {
    supported(assault, seize, aurelia, razer, karlach, celebrant, finest, scourge, sprint, hellkite, runner, kavu, lunk);
    const { s: s0, ap, opp, ids } = setup([assault]);
    const b = putOnBattlefield(s0, ap, bear());
    const idle = putOnBattlefield(s0, ap, bear({ name: "Idle Bear" }));
    s0.objects[idle]!.tapped = true; // tapped, but it didn't attack
    let s = noBlocks(attack(s0, ap, [{ attacker: b, defender: opp }]));
    s = passUntil(s, "main2", ap);
    expect(s.players[opp]!.life).toBe(38);
    expect(s.combatsThisTurn).toBe(1);
    s = cast(s, ap, ids[0]!);
    expect(s.objects[b]!.tapped).toBe(false);
    expect(s.objects[idle]!.tapped).toBe(true);
    // The added combat comes right after this main phase, then the added main phase, then the end step.
    s = passAll(s);
    expect(s.step).toBe("beginCombat");
    expect(s.combatsThisTurn).toBe(2);
    s = noBlocks(attack(s, ap, [{ attacker: b, defender: opp }]));
    expect(s.players[opp]!.life).toBe(36);
    expect(stepsToEnd(s)).toEqual(["main2", "end"]);
  });

  it("cast in the first main phase, the added phases come before the turn's own combat (CR 500.8)", () => {
    const { s: s0, ap, ids } = setup([assault]);
    const s = cast(s0, ap, ids[0]!);
    expect(s.addedPhases).toEqual(["combat", "main"]);
    expect(stepsToEnd(s)).toEqual(["beginCombat", "endCombat", "main2", "beginCombat", "endCombat", "main2", "end"]);
  });

  it("'after this main phase' adds nothing outside a main phase; the most recently added phase comes first", () => {
    const { s: s0, ap } = setup([]);
    let s = passUntil(s0, "beginCombat", ap);
    addPhases(s, ["combat", "main"], "main");
    expect(s.addedPhases).toBeUndefined();
    addPhases(s, ["combat"], "combat");
    addPhases(s, ["combat", "main"]);
    expect(s.addedPhases).toEqual(["combat", "main", "combat"]);
    expect(stepsToEnd(s)).toEqual(["endCombat", "beginCombat", "endCombat", "main2", "beginCombat", "endCombat", "main2", "end"]);
    // A new turn starts with none.
    s = passUntil(s, "main1");
    expect(s.addedPhases).toBeUndefined();
    expect(s.combatsThisTurn).toBeUndefined();
  });

  it("Aurelia: her first attack each turn untaps your creatures and adds a combat with no main phase before it", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, aurelia);
    const b = putOnBattlefield(s0, ap, bear());
    let s = attack(s0, ap, [{ attacker: a, defender: opp }, { attacker: b, defender: opp }]);
    expect(s.objects[b]!.tapped).toBe(false);
    s = noBlocks(s);
    expect(s.players[opp]!.life).toBe(35);
    s = passAll(s);
    expect(s.step).toBe("beginCombat"); // no main phase in between (rulings)
    // Her second attack this turn doesn't trigger.
    s = attack(s, ap, [{ attacker: a, defender: opp }, { attacker: b, defender: opp }]);
    expect(s.stack.length + s.triggerQueue.length).toBe(0);
    expect(s.objects[b]!.tapped).toBe(true);
    s = noBlocks(s);
    expect(s.players[opp]!.life).toBe(30);
    expect(stepsToEnd(s)).toEqual(["main2", "end"]);
  });

  it("Port Razer: another combat after combat damage, but not against a player it already attacked", () => {
    const { s: s0, ap, opp } = setup([]);
    const third = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const r = putOnBattlefield(s0, ap, razer);
    let s = noBlocks(attack(s0, ap, [{ attacker: r, defender: opp }]));
    expect(s.players[opp]!.life).toBe(36);
    expect(s.objects[r]!.tapped).toBe(false);
    s = passUntil(s, "declareAttackers", ap);
    expect(s.combatsThisTurn).toBe(2);
    expect(attackProblem(s, s.objects[r]!, opp)).toMatch(/already attacked/);
    expect(attackProblem(s, s.objects[r]!, opp, true)).toBeNull(); // a planeswalker that player controls is fine (rulings)
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: r, defender: opp }] })).toThrow(/already attacked/);
    s = noBlocks(settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: r, defender: third }] })));
    expect(s.players[third]!.life).toBe(36);
    // A third combat: it has attacked both of them now.
    s = passUntil(s, "declareAttackers", ap);
    expect(s.combatsThisTurn).toBe(3);
    expect(attackProblem(s, s.objects[r]!, third)).toMatch(/already attacked/);
  });

  it("Karlach: only the first combat phase of the turn adds another; the attackers untap and gain first strike", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, karlach);
    const b = putOnBattlefield(s0, ap, bear());
    let s = attack(s0, ap, [{ attacker: b, defender: opp }]);
    expect(s.objects[b]!.tapped).toBe(false);
    expect(s.objects[k]!.tapped).toBe(false);
    s = noBlocks(s);
    s = passAll(s);
    expect(s.step).toBe("beginCombat");
    s = attack(s, ap, [{ attacker: b, defender: opp }, { attacker: k, defender: opp }]);
    expect(s.objects[b]!.tapped).toBe(true); // no trigger in the second combat
    s = noBlocks(s);
    expect(s.players[opp]!.life).toBe(40 - 2 - 2 - 5);
    expect(stepsToEnd(s)).toEqual(["main2", "end"]);
  });

  it("Combat Celebrant: exerted once this turn, it can't be exerted again in the added combat", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, celebrant);
    const b = putOnBattlefield(s0, ap, bear());
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: c, defender: opp }, { attacker: b, defender: opp }] });
    expect(s.pending?.kind === "pickPermanents" && s.pending.action).toBe("exert");
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [c] }));
    expect(s.objects[b]!.tapped).toBe(false); // "all other creatures"
    expect(s.objects[c]!.tapped).toBe(true);
    s = noBlocks(s);
    s = passAll(s);
    expect(s.step).toBe("beginCombat");
    s.objects[c]!.tapped = false; // as if something untapped it
    s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: c, defender: opp }] });
    expect(s.pending?.kind).not.toBe("pickPermanents");
  });

  it("Finest Hour: attacking alone in the first combat untaps it and adds a combat; exalted works in both", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, finest);
    const b = putOnBattlefield(s0, ap, bear());
    let s = attack(s0, ap, [{ attacker: b, defender: opp }]);
    expect(pt(s, b)).toBe("3/3");
    expect(s.objects[b]!.tapped).toBe(false);
    s = passAll(noBlocks(s));
    expect(s.step).toBe("beginCombat");
    s = attack(s, ap, [{ attacker: b, defender: opp }]);
    expect(pt(s, b)).toBe("4/4");
    expect(s.objects[b]!.tapped).toBe(true);
    s = noBlocks(s);
    expect(s.players[opp]!.life).toBe(40 - 3 - 4);
    expect(stepsToEnd(s)).toEqual(["main2", "end"]);
  });

  it("Scourge of the Throne: only when it attacks a player with the most life or tied for it", () => {
    const { s: s0, ap, opp } = setup([]);
    const sc = putOnBattlefield(s0, ap, scourge);
    s0.players[opp]!.life = 30;
    let s = attack(s0, ap, [{ attacker: sc, defender: opp }]);
    expect(s.objects[sc]!.tapped).toBe(true);
    s = passAll(noBlocks(s));
    expect(s.step).toBe("main2");
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const sc1 = putOnBattlefield(s1, ap1, scourge);
    s = attack(s1, ap1, [{ attacker: sc1, defender: opp1 }]);
    expect(s.objects[sc1]!.tapped).toBe(false);
    expect(s.addedPhases).toEqual(["combat"]);
  });

  it("Grim Reaper's Sprint: an added combat only if it enters during your main phase", () => {
    const { s: s0, ap, ids } = setup([sprint]);
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[b]!.tapped = true;
    const s = cast(s0, ap, ids[0]!, [{ kind: "object", id: b }]);
    const t = settle(s);
    expect(t.objects[b]!.tapped).toBe(false);
    expect(t.addedPhases).toEqual(["combat"]);
  });

  it("Hellkite Charger and Lightning Runner: paying adds a combat", () => {
    const { s: s0, ap, opp } = setup([]);
    const h = putOnBattlefield(s0, ap, hellkite);
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: h, defender: opp }] });
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (const a of planMana(s, ap, parseManaCost("{5}{R}{R}"))!) s = act(s, a);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[h]!.tapped).toBe(false);
    expect(s.addedPhases).toEqual(["combat"]);

    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const r = putOnBattlefield(s1, ap1, runner);
    s1.players[ap1]!.energy = 6;
    s = act(passUntil(s1, "declareAttackers", ap1), { type: "declareAttackers", player: ap1, attacks: [{ attacker: r, defender: opp1 }] });
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[ap1]!.energy).toBe(8);
    s = settle(act(s, { type: "chooseMay", player: ap1, yes: true }));
    expect(s.players[ap1]!.energy).toBe(0);
    expect(s.objects[r]!.tapped).toBe(false);
    expect(s.addedPhases).toEqual(["combat"]);
  });
});

describe("attacking alone", () => {
  it("Rogue Kavu and Lunk Errant get their bonus only when they're the only attacker (CR 506.5)", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, kavu);
    putOnBattlefield(s0, ap, lunk);
    let s = attack(s0, ap, [{ attacker: k, defender: opp }]);
    expect(pt(s, k)).toBe("3/1");
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const k1 = putOnBattlefield(s1, ap1, kavu);
    const l1 = putOnBattlefield(s1, ap1, lunk);
    s = attack(s1, ap1, [{ attacker: k1, defender: opp1 }, { attacker: l1, defender: opp1 }]);
    expect(pt(s, k1)).toBe("1/1");
    expect(pt(s, l1)).toBe("4/4");
    const { s: s2, ap: ap2, opp: opp2 } = setup([]);
    const l2 = putOnBattlefield(s2, ap2, lunk);
    s = attack(s2, ap2, [{ attacker: l2, defender: opp2 }]);
    expect(pt(s, l2)).toBe("5/5");
  });
});

describe("bots", () => {
  it("a bot with Aurelia and Port Razer attacks in each added combat and the turn ends", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, aurelia);
    putOnBattlefield(s0, ap, razer);
    let s = s0;
    const turn = s.turn;
    let most = 0;
    for (let i = 0; i < 400 && s.turn === turn && !s.winner; i++) {
      s = botActions(s, waitingOn(s)!).reduce((x, a) => act(x, a), s);
      most = Math.max(most, s.combatsThisTurn ?? 0);
    }
    expect(s.turn).toBe(turn + 1);
    expect(most).toBeGreaterThanOrEqual(2);
    expect(s.log.some((l) => /An additional combat phase begins/.test(l.text))).toBe(true);
  });
});
