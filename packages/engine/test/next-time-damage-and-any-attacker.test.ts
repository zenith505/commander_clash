// "The next time a source of your choice would deal damage to you this turn, prevent half that damage, rounded down"
// (Dark Sphere): the source chosen as it resolves (CR 609.7a), and only its next damage event (CR 615.8). "Whenever a
// creature attacks" (Caltrops, Righteous Cause): anyone's creature, each as it's declared as an attacker (CR 508.3a).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, planActivate, waitingOn, type Action, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const sphere = card("Dark Sphere", "Artifact", "{0}", { oracleText: "{T}, Sacrifice this artifact: The next time a source of your choice would deal damage to you this turn, prevent half that damage, rounded down." });
const caltrops = card("Caltrops", "Artifact", "{3}", { oracleText: "Whenever a creature attacks, this artifact deals 1 damage to it." });
const cause = card("Righteous Cause", "Enchantment", "{3}{W}{W}", { oracleText: "Whenever a creature attacks, you gain 1 life." });
const cannon = card("Test Cannon", "Creature — Construct", "{5}", { power: "1", toughness: "1", oracleText: "{T}: This creature deals 5 damage to any target." });
const bear = card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
const resolve = (s: GameState) => {
  for (let i = 0; i < 40 && s.stack.length && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;

describe("the next time a source of your choice would deal damage to you", () => {
  it("parse", () => expect(isFullySupported(sphere)).toBe(true));

  it("Dark Sphere prevents half of that source's next damage to you, rounded down, then nothing more", () => {
    const { s: s0, ap, opp } = setup([]);
    const ds = putOnBattlefield(s0, ap, sphere);
    const gun = putOnBattlefield(s0, opp, cannon);
    let s = resolve(run(s0, planActivate(s0, ap, ds, 0)));
    expect(s.objects[ds]!.zone).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "damageSource", player: ap });
    const key = s.pending!.kind === "chooseOption" ? s.pending!.options.find((k) => k.startsWith(`${gun}@`))! : "";
    s = act(s, { type: "chooseOption", player: ap, choice: key });
    expect(s.damageMods?.length).toBe(1);
    // Let the opponent act: they fire at us.
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    const before = life(s, ap);
    s = resolve(run(s, planActivate(s, opp, gun, 0, [{ kind: "player", id: ap }])));
    expect(life(s, ap)).toBe(before - 3);
    expect(s.damageMods).toBeUndefined();
    // Untap it and fire again: all 5.
    s.objects[gun]!.tapped = false;
    if (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(waitingOn(s)).toBe(opp);
    s = resolve(run(s, planActivate(s, opp, gun, 0, [{ kind: "player", id: ap }])));
    expect(life(s, ap)).toBe(before - 8);
  });
});

describe("whenever a creature attacks", () => {
  it("parse", () => [caltrops, cause].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Caltrops and Righteous Cause trigger for an opponent's attacker", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, caltrops);
    putOnBattlefield(s0, ap, cause);
    const b = putOnBattlefield(s0, opp, bear);
    let s = passUntil(s0, "declareAttackers", opp);
    const before = life(s, ap);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: b, defender: ap }] });
    for (let i = 0; i < 20 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[b]!.damage).toBe(1);
    expect(life(s, ap)).toBe(before + 1);
  });
});
