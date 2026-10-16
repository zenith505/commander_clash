// Outlaws (CR 700.12): Assassins, Mercenaries, Pirates, Rogues and Warlocks, any of them. "~ has flash as long as you've
// committed a crime this turn" and "You may cast this spell as though it had flash if you control a Human" (CR 702.8a:
// conditions about the player, checked as it's cast). "Whenever you commit a crime during your turn" triggers only on
// your turn (CR 700.13).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, mountain, passAll, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { castProblem, compileCard, controllerOf, isFullySupported, objHasKeyword, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const ride = card("Take for a Ride", "Sorcery", "{2}{R}", { oracleText: "Take for a Ride has flash as long as you've committed a crime this turn. (Targeting opponents, anything they control, and/or cards in their graveyards is a crime.)\nGain control of target creature until end of turn. Untap that creature. It gains haste until end of turn." });
const muscle = card("Overzealous Muscle", "Creature — Ogre Mercenary", "{4}{B}", { power: "5", toughness: "4", oracleText: "Whenever you commit a crime during your turn, this creature gains indestructible until end of turn. (Targeting opponents, anything they control, and/or cards in their graveyards is a crime. Damage and effects that say \"destroy\" don't destroy a creature with indestructible.)" });
const posse = card("Hellspur Posse Boss", "Creature — Lizard Rogue", "{2}{R}{R}", { power: "2", toughness: "4", oracleText: "Other outlaws you control have haste. (Assassins, Mercenaries, Pirates, Rogues, and Warlocks are outlaws.)\nWhen this creature enters, create two 1/1 red Mercenary creature tokens with \"{T}: Target creature you control gets +1/+0 until end of turn. Activate only as a sorcery.\"" });
const sheriff = card("Shoot the Sheriff", "Instant", "{1}{B}", { oracleText: "Destroy target non-outlaw creature. (Assassins, Mercenaries, Pirates, Rogues, and Warlocks are outlaws. Everyone else is fair game.)" });
const bards = card("Bard's Company", "Creature — Human Citizen", "{2}{W}{U}", { power: "2", toughness: "3", keywords: ["Recruit"], oracleText: "You may cast this spell as though it had flash if you control a Human.\nOther creatures you control get +1/+1.\nWhenever this creature enters or attacks, recruit. (Draw a card, then discard a card. If you discarded a nonland card, create a 1/1 white Human Soldier creature token.)" });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const opt = card("Opt", "Instant", "{U}", { oracleText: "Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card." });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const can = (s: GameState, pid: PlayerId, id: string, t?: Parameters<typeof planCast>[3]) => planCast(s, pid, id, t) !== null;
const run = (s: GameState, pid: PlayerId, id: string, t?: Parameters<typeof planCast>[3]) => planCast(s, pid, id, t)!.reduce((x, a) => act(x, a), s);

describe("outlaws, conditional flash, crimes during your turn", () => {
  it("compiles them", () => {
    supported(ride, muscle, posse, sheriff, bards);
    expect(compileCard(ride).flashIf).toEqual({ kind: "committedCrime" });
    expect(compileCard(muscle).triggers[0]).toMatchObject({ event: "youCommitCrime", activeIf: { kind: "yourTurn" } });
  });

  it("Take for a Ride has flash only once you've committed a crime this turn", () => {
    let { s, ap, ids, opp } = setup([shock, ride, shock]);
    const theirs = putOnBattlefield(s, opp, bear());
    const mine = putOnBattlefield(s, ap, bear());
    // With a spell on the stack, a sorcery can't be cast (CR 307.1). Shocking your own creature isn't a crime.
    s = run(s, ap, ids[0]!, [target(mine)]);
    expect(castProblem(s, ap, ids[1]!, [target(theirs)])).toMatch(/sorcery|stack|now|instant/i);
    expect(can(s, ap, ids[1]!, [target(theirs)])).toBe(false);
    s = passAll(s);
    // Shock targeting an opponent is a crime: now it has flash.
    s = run(s, ap, ids[2]!, [{ kind: "player", id: opp }]);
    expect(can(s, ap, ids[1]!, [target(theirs)])).toBe(true);
    s = passAll(run(s, ap, ids[1]!, [target(theirs)]));
    expect(controllerOf(s, s.objects[theirs]!)).toBe(ap);
  });

  it("Overzealous Muscle: indestructible for a crime on your turn, not on an opponent's", () => {
    let { s, ap, ids, opp } = setup([shock]);
    const m = putOnBattlefield(s, ap, muscle);
    s = cast(s, ap, ids[0]!, [{ kind: "player", id: opp }]);
    s = passAll(s);
    expect(objHasKeyword(s, s.objects[m]!, "Indestructible")).toBe(true);
    // On the next player's turn, another crime of yours doesn't trigger it.
    s = passUntil(s, "main1", opp);
    expect(objHasKeyword(s, s.objects[m]!, "Indestructible")).toBe(false);
    const second = putOnBattlefield(s, ap, shock);
    s.battlefield.splice(s.battlefield.indexOf(second), 1);
    s.objects[second]!.zone = "hand";
    s.players[ap]!.hand.push(second);
    for (const l of [mountain, mountain]) putOnBattlefield(s, ap, l);
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = run(s, ap, second, [{ kind: "player", id: opp }]);
    expect(s.players[ap]!.crimeTurn).toBe(s.turn);
    s = passAll(s);
    expect(s.stack).toHaveLength(0);
    expect(objHasKeyword(s, s.objects[m]!, "Indestructible")).toBe(false);
  });

  it("outlaws: Hellspur Posse Boss gives other outlaws haste; Shoot the Sheriff can't target one", () => {
    let { s, ap, ids, opp } = setup([sheriff]);
    putOnBattlefield(s, ap, posse);
    const rogue = putOnBattlefield(s, ap, bear({ name: "Cutpurse", subtypes: ["Human", "Rogue"], typeLine: "Creature — Human Rogue" }), { sick: true });
    const plain = putOnBattlefield(s, ap, bear(), { sick: true });
    expect(objHasKeyword(s, s.objects[rogue]!, "Haste")).toBe(true);
    expect(objHasKeyword(s, s.objects[plain]!, "Haste")).toBe(false);
    expect(castProblem(s, ap, ids[0]!, [target(rogue)])).not.toBeNull();
    const theirs = putOnBattlefield(s, opp, bear());
    s = cast(s, ap, ids[0]!, [target(theirs)]);
    expect(s.objects[theirs]!.zone).toBe("graveyard");
  });

  it("Bard's Company: castable at instant speed while you control a Human", () => {
    let { s, ap, ids } = setup([opt, bards]);
    s = run(s, ap, ids[0]!);
    expect(can(s, ap, ids[1]!)).toBe(false);
    putOnBattlefield(s, ap, bear({ name: "Villager", subtypes: ["Human"], typeLine: "Creature — Human" }));
    expect(can(s, ap, ids[1]!)).toBe(true);
  });
});
