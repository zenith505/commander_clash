// Exchanging life totals (CR 701.12c: Mirror Universe, Axis of Mortality), "prevent all damage that would be dealt to
// you" (Glacial Chasm, Solitary Confinement), Terminus (all creatures to the bottom at once, each owner ordering
// theirs), Bonfire of the Damned (a player or planeswalker and that player's creatures), Ghalta (total power).

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { botActions, isFullySupported, manaValue, planCast, spellCost, waitingOn, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const mirrorUniverse = card("Mirror Universe", "Artifact", "{6}", { oracleText: "{T}, Sacrifice this artifact: Exchange life totals with target opponent. Activate only during your upkeep." });
const magusMirror = card("Magus of the Mirror", "Creature — Human Wizard", "{4}{B}{B}", { power: "4", toughness: "2", oracleText: "{T}, Sacrifice this creature: Exchange life totals with target opponent. Activate only during your upkeep." });
const axis = card("Axis of Mortality", "Enchantment", "{4}{W}{W}", { oracleText: "At the beginning of your upkeep, you may have two target players exchange life totals." });
const glacialChasm = card("Glacial Chasm", "Land", "", { keywords: ["Cumulative upkeep"], oracleText: "Cumulative upkeep—Pay 2 life. (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nWhen this land enters, sacrifice a land.\nCreatures you control can't attack.\nPrevent all damage that would be dealt to you." });
const solitary = card("Solitary Confinement", "Enchantment", "{2}{W}", { oracleText: "At the beginning of your upkeep, sacrifice this enchantment unless you discard a card.\nSkip your draw step.\nYou have shroud. (You can't be the target of spells or abilities.)\nPrevent all damage that would be dealt to you." });
const terminus = card("Terminus", "Sorcery", "{4}{W}{W}", { keywords: ["Miracle"], oracleText: "Put all creatures on the bottom of their owners' libraries.\nMiracle {W} (You may cast this card for its miracle cost when you draw it if it's the first card you drew this turn.)" });
const hallowedBurial = card("Hallowed Burial", "Sorcery", "{3}{W}{W}", { oracleText: "Put all creatures on the bottom of their owners' libraries." });
const bonfire = card("Bonfire of the Damned", "Sorcery", "{X}{X}{R}", { keywords: ["Miracle"], oracleText: "Bonfire of the Damned deals X damage to target player or planeswalker and each creature that player or that planeswalker's controller controls.\nMiracle {X}{R} (You may cast this card for its miracle cost when you draw it if it's the first card you drew this turn.)" });
const lavalanche = card("Lavalanche", "Sorcery", "{X}{B}{R}{G}", { oracleText: "Lavalanche deals X damage to target player or planeswalker and each creature that player or that planeswalker's controller controls." });
const flameWave = card("Flame Wave", "Sorcery", "{3}{R}{R}{R}{R}", { oracleText: "Flame Wave deals 4 damage to target player or planeswalker and each creature that player or that planeswalker's controller controls." });
const chandraNalaar = card("Chandra Nalaar", "Legendary Planeswalker — Chandra", "{3}{R}{R}", { loyalty: "6", oracleText: "+1: Chandra Nalaar deals 1 damage to target player or planeswalker.\n−X: Chandra Nalaar deals X damage to target creature.\n−8: Chandra Nalaar deals 10 damage to target player or planeswalker and each creature that player or that planeswalker's controller controls." });
const ghalta = card("Ghalta, Primal Hunger", "Legendary Creature — Elder Dinosaur", "{10}{G}{G}", { power: "12", toughness: "12", keywords: ["Trample"], oracleText: "This spell costs {X} less to cast, where X is the total power of creatures you control.\nTrample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)" });
const lordEagles = card("The Lord of the Eagles", "Legendary Creature — Bird Noble", "{7}{U}{U}", { power: "8", toughness: "8", keywords: ["Flying", "Flash"], oracleText: "Flash\nThis spell costs {X} less to cast, where X is the total power of creatures you control with flying.\nFlying" });
const salvo = card("Volcanic Salvo", "Sorcery", "{10}{R}{R}", { oracleText: "This spell costs {X} less to cast, where X is the total power of creatures you control.\nVolcanic Salvo deals 6 damage to each of up to two target creatures and/or planeswalkers." });
const jace = card("Jace Beleren", "Legendary Planeswalker — Jace", "{1}{U}{U}", { loyalty: "3", keywords: ["Mill"], oracleText: "+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards." });
const bolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });

const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const nextOf = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % 4]!;

it("is supported", () => [mirrorUniverse, magusMirror, axis, glacialChasm, solitary, terminus, hallowedBurial, bonfire, lavalanche, flameWave, chandraNalaar, ghalta, lordEagles, salvo].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

describe("exchanging life totals (CR 701.12c)", () => {
  it("Mirror Universe: only during your upkeep; you get their total and they get yours", () => {
    const { s: s0, ap, opp } = setup([]);
    const mu = putOnBattlefield(s0, ap, mirrorUniverse);
    s0.players[ap]!.life = 5;
    s0.players[opp]!.life = 31;
    expect(() => activate(s0, ap, mu, 0, [{ kind: "player", id: opp }])).toThrow(); // main phase: not now
    let s = passUntil(s0, "upkeep", nextOf(s0, ap));
    s = passUntil(s, "upkeep", ap);
    s = activate(s, ap, mu, 0, [{ kind: "player", id: opp }]);
    s = settle(s);
    expect(s.players[ap]!.life).toBe(31);
    expect(s.players[opp]!.life).toBe(5);
    expect(s.objects[mu]!.zone).toBe("graveyard");
  });

  it("a player who can't gain life can't be given a higher total, so nothing changes (CR 701.12a, c)", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, card("Erebos Test", "Enchantment", "{1}{B}", { oracleText: "Your opponents can't gain life." }));
    const mu = putOnBattlefield(s0, ap, mirrorUniverse);
    s0.players[ap]!.life = 5;
    let s = passUntil(s0, "upkeep", nextOf(s0, ap));
    s = passUntil(s, "upkeep", ap);
    s = settle(activate(s, ap, mu, 0, [{ kind: "player", id: opp }]));
    expect(s.players[ap]!.life).toBe(5);
    expect(s.players[opp]!.life).toBe(40);
  });

  it("Axis of Mortality: two target players, at the beginning of your upkeep; a bot swaps itself with the richest opponent", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, axis);
    s0.players[ap]!.life = 9;
    s0.players[opp]!.life = 50;
    let s = passUntil(s0, "upkeep", nextOf(s0, ap));
    for (let i = 0; i < 200 && !(s.step === "upkeep" && s.activePlayer === ap && (s.pending || s.stack.length)); i++) s = act(s, botActions(s, waitingOn(s)!)[0] ?? { type: "passPriority", player: waitingOn(s)! });
    // The bot's own choice of targets as the trigger is put on the stack: itself and the richest opponent.
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    const pick = botActions(s, ap)[0]!;
    expect(pick).toMatchObject({ targets: [{ kind: "player", id: ap }, { kind: "player", id: opp }] });
    s = act(s, pick);
    for (let i = 0; i < 20 && (s.stack.length || s.pending); i++) s = act(s, botActions(s, waitingOn(s)!)[0] ?? { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[ap]!.life).toBe(50);
    expect(s.players[opp]!.life).toBe(9);
  });
});

describe("prevent all damage that would be dealt to you", () => {
  it("Glacial Chasm: no damage to you; your creatures are still dealt damage", () => {
    const { s: s0, ap, opp, ids } = setup([bolt, bolt]);
    putOnBattlefield(s0, opp, glacialChasm);
    const b = putOnBattlefield(s0, opp, bear());
    let s = cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    expect(s.players[opp]!.life).toBe(40);
    s = cast(s, ap, ids[1]!, [target(b)]);
    expect(s.objects[b]!.zone).toBe("graveyard");
  });

  it("Solitary Confinement: damage that doesn't target you is prevented too (you have shroud)", () => {
    const { s: s0, ap, opp, ids } = setup([card("Each Opponent Test", "Sorcery", "{R}", { oracleText: "This spell deals 2 damage to each opponent." })]);
    putOnBattlefield(s0, opp, solitary);
    const s = cast(s0, ap, ids[0]!);
    expect(s.players[opp]!.life).toBe(40);
    expect(s.players[nextOf(s, opp)]!.life).toBe(38);
  });
});

describe("Terminus", () => {
  it("every creature goes to the bottom of its owner's library at once, in the order its owner chooses", () => {
    const { s: s0, ap, opp, ids } = setup([terminus]);
    const a1 = putOnBattlefield(s0, ap, bear({ name: "Bear One" }));
    const a2 = putOnBattlefield(s0, ap, bear({ name: "Bear Two" }));
    const b1 = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    // Your bear under the opponent's control goes to your library.
    const stolen = putOnBattlefield(s0, ap, bear({ name: "Stolen Bear" }));
    s0.objects[stolen]!.controller = opp;
    let s = settle(planCast(s0, ap, ids[0]!)!.reduce((x, a) => act(x, a), s0));
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: ap, how: "bottom" });
    expect([...(s.pending as { cards: string[] }).cards].sort()).toEqual([a1, a2, stolen].sort());
    // Nothing has moved yet: all of them leave at the same time.
    expect(s.objects[a1]!.zone).toBe("battlefield");
    s = settle(act(s, { type: "arrangeTop", player: ap, top: [a2, stolen, a1], away: [] }));
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.library.slice(-3)).toEqual([a2, stolen, a1]);
    expect(s.players[opp]!.library.at(-1)).toBe(b1);
    expect(s.battlefield.some((id) => s.objects[id]!.zone === "battlefield" && ["Bear One", "Their Bear"].includes(s.cards[s.objects[id]!.cardId]!.name))).toBe(false);
  });
});

describe("Bonfire of the Damned", () => {
  it("at a player: that player and each creature they control, not anyone else's", () => {
    const { s: s0, ap, opp, ids } = setup([bonfire]);
    const theirs = putOnBattlefield(s0, opp, bear());
    const mine = putOnBattlefield(s0, ap, bear());
    const s = settle(planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, undefined, 2)!.reduce((x, a) => act(x, a), s0));
    expect(s.players[opp]!.life).toBe(38);
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.objects[mine]!.zone).toBe("battlefield");
  });

  it("at a planeswalker: it and each creature its controller controls; the player isn't dealt damage", () => {
    const { s: s0, ap, opp, ids } = setup([bonfire]);
    const pw = putOnBattlefield(s0, opp, jace);
    s0.objects[pw]!.counters.loyalty = 2;
    const theirs = putOnBattlefield(s0, opp, bear());
    const s = settle(planCast(s0, ap, ids[0]!, [target(pw)], undefined, undefined, 2)!.reduce((x, a) => act(x, a), s0));
    expect(s.objects[pw]!.zone).toBe("graveyard");
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(40);
  });
});

describe("costs {X} less, X the total power of creatures you control", () => {
  it("Ghalta: the sum of their power; a negative power takes some off; never below {G}{G}", () => {
    const { s, ap, ids } = setup([ghalta, lordEagles]);
    const total = (id: string) => {
      const { cost, extra } = spellCost(s, ap, s.objects[id]!);
      return manaValue(cost) + extra;
    };
    const cost = () => total(ids[0]!);
    expect(cost()).toBe(12);
    putOnBattlefield(s, ap, bear());
    putOnBattlefield(s, ap, bear());
    expect(cost()).toBe(8);
    putOnBattlefield(s, ap, card("Big Test", "Creature — Giant", "{5}", { power: "9", toughness: "9" }));
    expect(cost()).toBe(2);
    // Only creatures with flying count for the Lord of the Eagles.
    expect(total(ids[1]!)).toBe(9);
    putOnBattlefield(s, ap, card("Bird Test", "Creature — Bird", "{1}{U}", { power: "3", toughness: "1", keywords: ["Flying"], oracleText: "Flying" }));
    expect(total(ids[1]!)).toBe(6);
  });
});
