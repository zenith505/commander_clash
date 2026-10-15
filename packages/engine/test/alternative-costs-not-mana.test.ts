// Alternative costs that aren't (only) mana (CR 118.9): "You may pay 1 life and exile a blue card from your hand rather
// than pay this spell's mana cost" (Force of Will), returning Islands (Daze, Gush), sacrificing Mountains (Fireblast),
// tapping a creature (Orim's Cure), and ones only allowed while a condition holds as the spell is cast (CR 601.2b):
// "If you control a Swamp" (Snuff Out), "If it's not your turn" (Force of Negation), the traps' "If four or more creatures
// are attacking" (Arrow Volley Trap). The spell's mana value doesn't change (rulings on Force of Will, the traps), and
// its mana cost can still be paid instead (rulings on the traps).

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, putOnBattlefield, setup } from "./helpers";
import { botActions, castProblem, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const fow = card("Force of Will", "Instant", "{3}{U}{U}", { oracleText: "You may pay 1 life and exile a blue card from your hand rather than pay this spell's mana cost.\nCounter target spell." });
const daze = card("Daze", "Instant", "{1}{U}", { oracleText: "You may return an Island you control to its owner's hand rather than pay this spell's mana cost.\nCounter target spell unless its controller pays {1}." });
const gush = card("Gush", "Instant", "{4}{U}", { oracleText: "You may return two Islands you control to their owner's hand rather than pay this spell's mana cost.\nDraw two cards." });
const fireblast = card("Fireblast", "Instant", "{4}{R}{R}", { oracleText: "You may sacrifice two Mountains rather than pay this spell's mana cost.\nFireblast deals 4 damage to any target." });
const snuff = card("Snuff Out", "Instant", "{3}{B}", { oracleText: "If you control a Swamp, you may pay 4 life rather than pay this spell's mana cost.\nDestroy target nonblack creature. It can't be regenerated." });
const negation = card("Force of Negation", "Instant", "{1}{U}{U}", { oracleText: "If it's not your turn, you may exile a blue card from your hand rather than pay this spell's mana cost.\nCounter target noncreature spell. If that spell is countered this way, exile it instead of putting it into its owner's graveyard." });
const cure = card("Orim's Cure", "Instant", "{1}{W}", { oracleText: "If you control a Plains, you may tap an untapped creature you control rather than pay this spell's mana cost.\nPrevent the next 4 damage that would be dealt to any target this turn." });
const volley = card("Arrow Volley Trap", "Instant — Trap", "{3}{W}{W}", { oracleText: "If four or more creatures are attacking, you may pay {1}{W} rather than pay this spell's mana cost.\nArrow Volley Trap deals 5 damage divided as you choose among any number of target attacking creatures." });
const edict = card("Blasphemous Edict", "Sorcery", "{3}{B}{B}", { oracleText: "You may pay {B} rather than pay this spell's mana cost if there are thirteen or more creatures on the battlefield.\nEach player sacrifices thirteen creatures of their choice." });
const sephara = card("Sephara, Sky's Blade", "Legendary Creature — Angel", "{4}{W}{W}{W}", { power: "7", toughness: "7", keywords: ["Flying", "Lifelink"], oracleText: "You may pay {W} and tap four untapped creatures you control with flying rather than pay this spell's mana cost.\nFlying, lifelink\nOther creatures you control with flying have indestructible. (Damage and effects that say \"destroy\" don't destroy them.)" });
const runeflare = card("Runeflare Trap", "Instant — Trap", "{4}{R}{R}", { oracleText: "If an opponent drew three or more cards this turn, you may pay {R} rather than pay this spell's mana cost.\nRuneflare Trap deals damage to target player equal to the number of cards in that player's hand." });
const blueCard = card("Opt", "Instant", "{U}", { oracleText: "Scry 1.\nDraw a card." });
const redCard = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });

const alt = { alt: "alternative" as const };
const run = (s: GameState, plan: ReturnType<typeof planCast>) => plan!.reduce((x, a) => act(x, a), s);
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === name);
const toHand = (s: GameState, pid: PlayerId, d: CardDef) => {
  const id = putOnBattlefield(s, pid, d);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
const tapAll = (s: GameState, pid: PlayerId) => s.battlefield.forEach((id) => s.objects[id]!.controller === pid && (s.objects[id]!.tapped = true));
const stackTarget = (s: GameState): TargetChoice => ({ kind: "stack", id: s.stack.at(-1)!.id });

describe("alternative costs that aren't mana", () => {
  it("is supported", () => [fow, daze, gush, fireblast, snuff, negation, cure, volley, edict, sephara, runeflare].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Force of Will: 1 life and a blue card from your hand, not itself and not a red one", () => {
    const { s: s0, ap, ids } = setup([divination, fow, blueCard, redCard]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    tapAll(s, ap);
    const t = [stackTarget(s)];
    expect(castProblem(s, ap, ids[1]!, t, undefined, undefined, undefined, undefined, { ...alt, exileFromHand: [ids[3]!] })).toMatch(/blue card/);
    expect(castProblem(s, ap, ids[1]!, t, undefined, undefined, undefined, undefined, { ...alt, exileFromHand: [ids[1]!] })).toMatch(/blue card/);
    const life = s.players[ap]!.life;
    s = passAll(run(s, planCast(s, ap, ids[1]!, t, undefined, "auto", undefined, { ...alt, exileFromHand: [ids[2]!] })));
    expect(s.objects[ids[2]!]!.zone).toBe("exile");
    expect(s.players[ap]!.life).toBe(life - 1);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard"); // countered
    expect(s.objects[ids[1]!]!.zone).toBe("graveyard");
  });

  it("Force of Will: no blue card in hand, no alternative cost", () => {
    const { s: s0, ap, ids } = setup([divination, fow, redCard]);
    const s = run(s0, planCast(s0, ap, ids[0]!));
    expect(castProblem(s, ap, ids[1]!, [stackTarget(s)], undefined, undefined, undefined, undefined, alt)).toMatch(/exile from your hand a blue card/);
  });

  it("Daze: an Island returned to hand; Gush: two of them, and draws two", () => {
    const { s: s0, ap, ids } = setup([divination, daze, gush]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    const islands = named(s, ap, "Island");
    expect(castProblem(s, ap, ids[1]!, [stackTarget(s)], undefined, undefined, undefined, undefined, { ...alt, returnToHand: [named(s, ap, "Forest")[0]!] })).toMatch(/Island/);
    s = run(s, planCast(s, ap, ids[1]!, [stackTarget(s)], undefined, "auto", undefined, { ...alt, returnToHand: [islands[0]!] }));
    expect(s.objects[islands[0]!]!.zone).toBe("hand");
    const hand = s.players[ap]!.hand.length;
    s = run(s, planCast(s, ap, ids[2]!, undefined, undefined, "auto", undefined, { ...alt, returnToHand: [islands[1]!, islands[2]!] }));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2); // Gush left, two Islands back
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = passAll(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 1 + 2);
  });

  it("Fireblast: two Mountains sacrificed, nothing else paid", () => {
    const { s: s0, ap, ids, opp } = setup([fireblast]);
    tapAll(s0, ap);
    const mountains = named(s0, ap, "Mountain");
    const life = s0.players[opp]!.life;
    const plan = planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, "auto", undefined, { ...alt, sacrifice: mountains.slice(0, 2) });
    expect(plan!.filter((a) => a.type === "activateMana")).toHaveLength(0);
    const s = passAll(run(s0, plan));
    expect(s.players[opp]!.life).toBe(life - 4);
    expect(mountains.slice(0, 2).map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard"]);
  });

  it("Snuff Out: 4 life only while you control a Swamp; the mana cost is still there", () => {
    const { s: s0, ap, ids, opp } = setup([snuff]);
    const b = putOnBattlefield(s0, opp, bear());
    const life = s0.players[ap]!.life;
    const s = passAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: b }], undefined, "auto", undefined, alt)));
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(life - 4);
    const { s: t, ap: ap2, ids: ids2, opp: opp2 } = setup([snuff]);
    const b2 = putOnBattlefield(t, opp2, bear());
    for (const id of named(t, ap2, "Swamp")) {
      t.battlefield.splice(t.battlefield.indexOf(id), 1);
      t.objects[id]!.zone = "graveyard";
    }
    invalidateCharacteristics(t);
    expect(castProblem(t, ap2, ids2[0]!, [{ kind: "object", id: b2 }], undefined, undefined, undefined, undefined, alt)).toMatch(/alternative cost can't be paid now/);
    expect(planCast(t, ap2, ids2[0]!, [{ kind: "object", id: b2 }])).toBeNull(); // {3}{B} with no Swamp: no black mana
  });

  it("Force of Negation: only when it's not your turn", () => {
    const { s: s0, ap, ids, opp } = setup([divination, negation, blueCard]);
    const fon = toHand(s0, opp, negation);
    const pitch = toHand(s0, opp, blueCard);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    // On your own turn: no.
    expect(castProblem(s, ap, ids[1]!, [stackTarget(s)], undefined, undefined, undefined, undefined, { ...alt, exileFromHand: [ids[2]!] })).toMatch(/can't be paid now/);
    // On an opponent's turn: yes, with no mana at all.
    while (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = run(s, planCast(s, opp, fon, [stackTarget(s)], undefined, "auto", undefined, { ...alt, exileFromHand: [pitch] }));
    s = passAll(s);
    expect(s.objects[ids[0]!]!.zone).toBe("exile"); // countered this way: exiled
  });

  it("Orim's Cure: tap an untapped creature you control, summoning sick or not", () => {
    const { s: s0, ap, ids } = setup([cure]);
    tapAll(s0, ap);
    const b = putOnBattlefield(s0, ap, bear(), { sick: true });
    const s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: ap }], undefined, "auto", undefined, { ...alt, tap: [b] }));
    expect(s.objects[b]!.tapped).toBe(true);
    expect(s.stack.at(-1)?.objectId).toBe(ids[0]);
  });

  it("Arrow Volley Trap: {1}{W} only with four or more creatures attacking", () => {
    const { s: s0, ap, ids, opp } = setup([volley]);
    const attackers = [1, 2, 3, 4].map(() => putOnBattlefield(s0, opp, bear()));
    attackers.slice(0, 3).forEach((id) => (s0.objects[id]!.attacking = ap));
    const t: TargetChoice[] = [{ kind: "object", id: attackers[0]!, amount: 5 }, { kind: "none" }, { kind: "none" }, { kind: "none" }, { kind: "none" }];
    expect(castProblem(s0, ap, ids[0]!, t, undefined, undefined, undefined, undefined, alt)).toMatch(/can't be paid now/);
    s0.objects[attackers[3]!]!.attacking = ap;
    const plan = planCast(s0, ap, ids[0]!, t, undefined, "auto", undefined, alt);
    expect(plan!.filter((a) => a.type === "activateMana")).toHaveLength(2);
    const s = passAll(run(s0, plan));
    expect(s.objects[attackers[0]!]!.zone).toBe("graveyard");
  });

  it("Blasphemous Edict: {B} with thirteen or more creatures on the battlefield", () => {
    const { s: s0, ap, ids, opp } = setup([edict]);
    for (let i = 0; i < 12; i++) putOnBattlefield(s0, i % 2 ? opp : ap, bear());
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, alt)).toMatch(/can't be paid now/);
    putOnBattlefield(s0, opp, bear());
    expect(planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, alt)!.filter((a) => a.type === "activateMana")).toHaveLength(1);
  });

  it("Sephara: {W} and four untapped creatures with flying tapped", () => {
    const { s: s0, ap, ids } = setup([sephara]);
    const flyer = () => card("Storm Crow", "Creature — Bird", "{1}{U}", { power: "1", toughness: "2", keywords: ["Flying"], oracleText: "Flying" });
    const crows = [1, 2, 3].map(() => putOnBattlefield(s0, ap, flyer(), { sick: true }));
    const walker = putOnBattlefield(s0, ap, bear());
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { ...alt, tap: [...crows, walker] })).toMatch(/flying/);
    const fourth = putOnBattlefield(s0, ap, flyer());
    const plan = planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { ...alt, tap: [...crows, fourth] });
    expect(plan!.filter((a) => a.type === "activateMana")).toHaveLength(1);
    const s = run(s0, plan);
    expect([...crows, fourth].every((id) => s.objects[id]!.tapped)).toBe(true);
  });

  it("Runeflare Trap: {R} once an opponent drew three cards this turn", () => {
    const { s: s0, ap, ids, opp } = setup([runeflare]);
    const t: TargetChoice[] = [{ kind: "player", id: opp }];
    // Opening hands aren't drawn during a turn (CR 103.5).
    expect(castProblem(s0, ap, ids[0]!, t, undefined, undefined, undefined, undefined, alt)).toMatch(/can't be paid now/);
    s0.players[opp]!.draws = { turn: s0.turn, n: 2 };
    expect(castProblem(s0, ap, ids[0]!, t, undefined, undefined, undefined, undefined, alt)).toMatch(/can't be paid now/);
    s0.players[ap]!.draws = { turn: s0.turn, n: 5 }; // your own draws don't count
    expect(castProblem(s0, ap, ids[0]!, t, undefined, undefined, undefined, undefined, alt)).toMatch(/can't be paid now/);
    s0.players[opp]!.draws = { turn: s0.turn, n: 3 };
    const plan = planCast(s0, ap, ids[0]!, t, undefined, "auto", undefined, alt);
    expect(plan!.filter((a) => a.type === "activateMana")).toHaveLength(1);
    const life = s0.players[opp]!.life;
    const s = passAll(run(s0, plan));
    expect(s.players[opp]!.life).toBe(life - s.players[opp]!.hand.length);
  });

  it("a bot pitches a blue card to Force of Will a big spell when it has no mana", () => {
    const { s: s0, ap, ids, opp } = setup([card("Big Spell", "Sorcery", "{4}{U}", { oracleText: "Draw three cards." })]);
    toHand(s0, opp, fow);
    const pitch = toHand(s0, opp, blueCard);
    toHand(s0, opp, redCard);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    while (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const acts = botActions(s, opp);
    const castIt = acts.find((a) => a.type === "castSpell");
    expect(castIt).toMatchObject({ alt: "alternative", exileFromHand: [pitch] });
    for (const a of acts) s = act(s, a);
    s = passAll(s);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });
});
