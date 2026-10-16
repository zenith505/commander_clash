// More suspect cards (CR 701.60) and goading a group (CR 701.15): "can't become suspected" (Airtight Alibi), "if the
// sacrificed creature was suspected" (Agency Coroner, its last known information, CR 608.2h), a granted dies trigger that
// returns and suspects the creature (Presumed Dead), "goad all suspected creatures" (Nelly Borca), "goad all creatures you
// don't control" (Disrupt Decorum), and "Until your next turn, those creatures can't block" (Taunt from the Rampart).

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { characteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const alibi = card("Airtight Alibi", "Enchantment — Aura", "{2}{G}", { oracleText: "Flash\nEnchant creature\nWhen this Aura enters, untap enchanted creature. It gains hexproof until end of turn. If it's suspected, it's no longer suspected.\nEnchanted creature gets +2/+2 and can't become suspected." });
const coroner = card("Agency Coroner", "Creature — Ogre Cleric", "{4}{B}", { power: "3", toughness: "6", oracleText: "{2}{B}, Sacrifice another creature: Draw a card. If the sacrificed creature was suspected, draw two cards instead." });
const presumed = card("Presumed Dead", "Instant", "{1}{B}", { oracleText: "Until end of turn, target creature gets +2/+0 and gains \"When this creature dies, return it to the battlefield under its owner's control and suspect it.\" (A suspected creature has menace and can't block.)" });
const nelly = card("Nelly Borca, Impulsive Accuser", "Legendary Creature — Human Detective", "{2}{R}{W}", { power: "2", toughness: "4", oracleText: "Vigilance\nWhenever Nelly Borca attacks, suspect target creature. Then goad all suspected creatures. (A suspected creature has menace and can't block.)" });
const decorum = card("Disrupt Decorum", "Sorcery", "{2}{R}{R}", { oracleText: "Goad all creatures you don't control. (Until your next turn, those creatures attack each combat if able and attack a player other than you if able.)" });
const taunt = card("Taunt from the Rampart", "Sorcery", "{3}{R}{W}", { oracleText: "Goad all creatures your opponents control. Until your next turn, those creatures can't block. (Until your next turn, those creatures attack each combat if able and attack a player other than you if able.)" });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const isSuspected = (s: GameState, id: string) => s.objects[id]!.suspected !== undefined;
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("can't do that");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Pass until the stack and triggers are empty, choosing `targets` for a trigger. */
function settle(s: GameState, targets: TargetChoice[] = []) {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pend = s.pending;
    if (pend?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: pend.player, targets });
    else if (pend) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
}

describe("suspect and goad, more cards", () => {
  it("compiles them", () => {
    supported(alibi, coroner, presumed, nelly, decorum, taunt);
  });

  it("Airtight Alibi ends suspicion as it enters, and the creature can't become suspected while enchanted", () => {
    let { s, ap, ids, opp } = setup([alibi]);
    const mine = putOnBattlefield(s, ap, bear());
    s.objects[mine]!.suspected = s.nextTimestamp++;
    s.objects[mine]!.tapped = true;
    s = settle(run(s, planCast(s, ap, ids[0]!, [target(mine)])));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(mine);
    expect(isSuspected(s, mine)).toBe(false);
    expect(s.objects[mine]!.tapped).toBe(false);
    expect(characteristics(s, s.objects[mine]!).keywords).toContain("Hexproof");
    // Our own Nelly Borca attacks and targets it (hexproof doesn't stop its controller): it doesn't become suspected, so
    // it isn't goaded either.
    const n = putOnBattlefield(s, ap, nelly);
    s.objects[n]!.controlledSinceTurn = -1;
    s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: n, defender: opp }] });
    s = settle(s, [target(mine)]);
    expect(isSuspected(s, mine)).toBe(false);
    expect(characteristics(s, s.objects[mine]!).goadedBy).toHaveLength(0);
  });

  it("Nelly Borca suspects the target, then goads every suspected creature, including ones you control", () => {
    let { s, ap, opp } = setup([]);
    const n = putOnBattlefield(s, ap, nelly);
    s.objects[n]!.controlledSinceTurn = -1;
    const theirs = putOnBattlefield(s, opp, bear());
    const already = putOnBattlefield(s, opp, bear());
    const mine = putOnBattlefield(s, ap, bear());
    const clean = putOnBattlefield(s, opp, bear());
    s.objects[already]!.suspected = s.nextTimestamp++;
    s.objects[mine]!.suspected = s.nextTimestamp++;
    s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: n, defender: opp }] });
    s = settle(s, [target(theirs)]);
    for (const id of [theirs, already, mine]) expect(characteristics(s, s.objects[id]!).goadedBy, id).toEqual([ap]);
    expect(characteristics(s, s.objects[clean]!).goadedBy).toHaveLength(0);
  });

  it("Disrupt Decorum goads the creatures you don't control as it resolves, not ones that enter later", () => {
    let { s, ap, ids, opp } = setup([decorum]);
    const theirs = putOnBattlefield(s, opp, bear());
    const mine = putOnBattlefield(s, ap, bear());
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(characteristics(s, s.objects[theirs]!).goadedBy).toEqual([ap]);
    expect(characteristics(s, s.objects[theirs]!).attacksIfAble).toBe(true);
    expect(characteristics(s, s.objects[mine]!).goadedBy).toHaveLength(0);
    const later = putOnBattlefield(s, opp, bear());
    expect(characteristics(s, s.objects[later]!).goadedBy).toHaveLength(0);
  });

  it("Taunt from the Rampart: the goaded creatures can't block until your next turn", () => {
    let { s, ap, ids, opp } = setup([taunt]);
    const theirs = putOnBattlefield(s, opp, bear());
    const mine = putOnBattlefield(s, ap, bear());
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(characteristics(s, s.objects[theirs]!).goadedBy).toEqual([ap]);
    expect(characteristics(s, s.objects[theirs]!).cantBlock).toBe(true);
    expect(characteristics(s, s.objects[mine]!).cantBlock).toBe(false);
    const later = putOnBattlefield(s, opp, bear());
    expect(characteristics(s, s.objects[later]!).cantBlock).toBe(false);
  });

  it("Agency Coroner draws two for a suspected creature, one otherwise", () => {
    let { s, ap } = setup([]);
    const c = putOnBattlefield(s, ap, coroner);
    for (let i = 0; i < 2; i++) putOnBattlefield(s, ap, card("Swamp", "Basic Land — Swamp"));
    const plain = putOnBattlefield(s, ap, bear());
    const sus = putOnBattlefield(s, ap, bear());
    s.objects[sus]!.suspected = s.nextTimestamp++;
    let hand = s.players[ap]!.hand.length;
    s = settle(run(s, planActivate(s, ap, c, 0, [], undefined, undefined, undefined, { sacrifice: [plain] })));
    expect(s.objects[plain]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    hand = s.players[ap]!.hand.length;
    s = settle(run(s, planActivate(s, ap, c, 0, [], undefined, undefined, undefined, { sacrifice: [sus] })));
    expect(s.objects[sus]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });

  it("Presumed Dead: the creature dies, comes back under its owner's control and is suspected", () => {
    let { s, ap, ids, opp } = setup([presumed, shock]);
    const theirs = putOnBattlefield(s, opp, bear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [target(theirs)])));
    expect(characteristics(s, s.objects[theirs]!).power).toBe(4);
    s = settle(run(s, planCast(s, ap, ids[1]!, [target(theirs)])));
    // The same card, as a new object (CR 400.7): back under its owner's control, suspected, without the +2/+0.
    const back = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Grizzly Bears" && s.objects[id]!.owner === opp && id === theirs);
    expect(back).toBe(theirs);
    expect(s.objects[theirs]!.zone).toBe("battlefield");
    expect(s.objects[theirs]!.controller).toBe(opp);
    expect(isSuspected(s, theirs)).toBe(true);
    expect(characteristics(s, s.objects[theirs]!).power).toBe(2);
    expect(characteristics(s, s.objects[theirs]!).keywords).toContain("Menace");
  });

  it("Presumed Dead on a token: it doesn't come back (CR 111.7)", () => {
    let { s, ap, ids, opp } = setup([presumed, shock]);
    s = passAll(s);
    const theirs = putOnBattlefield(s, opp, bear());
    s.objects[theirs]!.isToken = true;
    s = settle(run(s, planCast(s, ap, ids[0]!, [target(theirs)])));
    s = settle(run(s, planCast(s, ap, ids[1]!, [target(theirs)])));
    expect(s.battlefield.includes(theirs)).toBe(false);
  });
});

