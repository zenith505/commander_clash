// "As though it had flash if you pay {2} more" (CR 601.2f), "your opponents can't cast spells during your turn",
// "creature spells you control can't be countered" (CR 101.2), "counter target spell that targets a permanent you
// control" (CR 115.3), and "costs {3} less if you've cast another spell this turn" (CR 601.2f).

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, putOnBattlefield, setup, target } from "./helpers";
import { castProblem, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.oracleText).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const play = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
const toHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
};
const tappedBy = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.tapped && s.objects[id]!.controller === pid).length;
/** The active player passes with an empty stack: the next player gets priority during the active player's turn. */
const giveOpponentPriority = (s: GameState, opp: PlayerId) => {
  for (let i = 0; i < 4 && waitingOn(s) !== opp; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(waitingOn(s)).toBe(opp);
  return s;
};
const lands = (s: GameState, pid: PlayerId, defs: CardDef[]) => defs.forEach((d) => putOnBattlefield(s, pid, d));

const rout = card("Rout", "Sorcery", "{3}{W}{W}", { oracleText: "You may cast this spell as though it had flash if you pay {2} more to cast it. (You may cast it any time you could cast an instant.)\nDestroy all creatures. They can't be regenerated.", cmc: 5 });
const dragonlordDromoka = card("Dragonlord Dromoka", "Legendary Creature — Elder Dragon", "{4}{G}{W}", { power: "5", toughness: "7", oracleText: "This spell can't be countered.\nFlying, lifelink\nYour opponents can't cast spells during your turn.", keywords: ["Flying", "Lifelink"], cmc: 6 });
const prowlingSerpopard = card("Prowling Serpopard", "Creature — Cat Snake", "{1}{G}{G}", { power: "4", toughness: "3", oracleText: "This spell can't be countered.\nCreature spells you control can't be countered.", cmc: 3 });
const leylineOfLifeforce = card("Leyline of Lifeforce", "Enchantment", "{2}{G}{G}", { oracleText: "If this card is in your opening hand, you may begin the game with it on the battlefield.\nCreature spells can't be countered.", cmc: 4 });
const rebuffTheWicked = card("Rebuff the Wicked", "Instant", "{W}", { oracleText: "Counter target spell that targets a permanent you control.", cmc: 1 });
const gigastormTitan = card("Gigastorm Titan", "Creature — Elemental", "{4}{U}", { power: "4", toughness: "4", oracleText: "This spell costs {3} less to cast if you've cast another spell this turn.", cmc: 5 });
const counterspell = card("Counterspell", "Instant", "{U}{U}", { oracleText: "Counter target spell." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const opt = card("Opt", "Instant", "{U}", { oracleText: "Scry 1.\nDraw a card." });
const plains = card("Plains", "Basic Land — Plains");
const island = card("Island", "Basic Land — Island");
const mountain = card("Mountain", "Basic Land — Mountain");

describe("flash for a price, and who can cast what", () => {
  it("compiles the cards", () => supported(rout, dragonlordDromoka, prowlingSerpopard, leylineOfLifeforce, rebuffTheWicked, gigastormTitan));

  it("Rout costs {2} more only when cast at instant speed", () => {
    const { s: s0, ap, ids } = setup([rout]);
    expect(tappedBy(play(s0, planCast(s0, ap, ids[0]!)), ap)).toBe(5); // its normal cost at sorcery speed
    const { s: t0, opp: opp2 } = setup([]);
    lands(t0, opp2, [plains, plains, plains, plains, plains, plains, plains]);
    const r = toHand(t0, opp2, rout);
    let t = giveOpponentPriority(t0, opp2);
    expect(castProblem(t, opp2, r)).toMatch(/not enough mana/); // only the mana is missing: it can be cast now
    t = play(t, planCast(t, opp2, r));
    expect(tappedBy(t, opp2)).toBe(7);
    expect(t.stack.length).toBe(1);
  });

  it("Dragonlord Dromoka: opponents can't cast spells during its controller's turn", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, dragonlordDromoka);
    lands(s0, opp, [mountain]);
    const bolt = toHand(s0, opp, shock);
    const s = giveOpponentPriority(s0, opp);
    expect(castProblem(s, opp, bolt, [{ kind: "player", id: ap }])).toMatch(/can't cast spells during/);
  });

  it("Prowling Serpopard: your creature spells can't be countered, other spells can", () => {
    const { s: s0, ap, ids, opp } = setup([bear(), opt]);
    putOnBattlefield(s0, ap, prowlingSerpopard);
    lands(s0, opp, [island, island, island, island]);
    const c1 = toHand(s0, opp, counterspell);
    const c2 = toHand(s0, opp, counterspell);
    let s = play(s0, planCast(s0, ap, ids[0]!));
    s = giveOpponentPriority(s, opp);
    s = settle(play(s, planCast(s, opp, c1, [{ kind: "stack", id: s.stack[0]!.id }])));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    s = play(s, planCast(s, ap, ids[1]!));
    s = giveOpponentPriority(s, opp);
    s = settle(play(s, planCast(s, opp, c2, [{ kind: "stack", id: s.stack[0]!.id }])));
    expect(s.objects[ids[1]!]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(s0.players[ap]!.hand.length - 2); // Opt was countered: no card drawn
  });

  it("Leyline of Lifeforce: nobody's creature spells can be countered", () => {
    const { s: s0, ap, ids, opp } = setup([bear()]);
    putOnBattlefield(s0, opp, leylineOfLifeforce);
    lands(s0, opp, [island, island]);
    const c1 = toHand(s0, opp, counterspell);
    let s = play(s0, planCast(s0, ap, ids[0]!));
    s = giveOpponentPriority(s, opp);
    s = settle(play(s, planCast(s, opp, c1, [{ kind: "stack", id: s.stack[0]!.id }])));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
  });

  it("Rebuff the Wicked targets only a spell that targets a permanent you control", () => {
    const { s: s0, ap, opp } = setup([]);
    const mine = putOnBattlefield(s0, opp, bear());
    lands(s0, opp, [plains]);
    const rebuff = toHand(s0, opp, rebuffTheWicked);
    const atFace = toHand(s0, ap, shock);
    const atBear = toHand(s0, ap, shock);
    let s = play(s0, planCast(s0, ap, atFace, [{ kind: "player", id: opp }]));
    s = giveOpponentPriority(s, opp);
    expect(castProblem(s, opp, rebuff, [{ kind: "stack", id: s.stack[0]!.id }])).toMatch(/target/);
    s = settle(s);
    s = play(s, planCast(s, ap, atBear, [target(mine)]));
    s = giveOpponentPriority(s, opp);
    expect(castProblem(s, opp, rebuff, [{ kind: "stack", id: s.stack[0]!.id }])).toMatch(/not enough mana/);
    s = settle(play(s, planCast(s, opp, rebuff, [{ kind: "stack", id: s.stack[0]!.id }])));
    expect(s.objects[mine]!.damage).toBe(0);
    expect(s.objects[atBear]!.zone).toBe("graveyard");
  });

  it("Gigastorm Titan costs {3} less after you've cast another spell this turn", () => {
    const { s: s0, ap, ids, opp } = setup([gigastormTitan, shock]);
    expect(tappedBy(play(s0, planCast(s0, ap, ids[0]!)), ap)).toBe(5);
    let s = settle(passAll(play(s0, planCast(s0, ap, ids[1]!, [{ kind: "player", id: opp }]))));
    const before = tappedBy(s, ap);
    s = play(s, planCast(s, ap, ids[0]!));
    expect(tappedBy(s, ap) - before).toBe(2);
  });
});
