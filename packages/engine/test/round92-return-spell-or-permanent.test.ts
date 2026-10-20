// Round 92: "Return target spell or nonland permanent an opponent controls to its owner's hand" (Sink into Stupor),
// "... spell or permanent" (Venser, Shaper Savant), "... spell or creature" (Unsubstantiate): one target that's a spell
// or a permanent (CR 115.1). A spell returned this way isn't countered, so it works on one that can't be (rulings).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, forest, island, putOnBattlefield, scry, setup } from "./helpers";
import { faceDef, isFullySupported, legalTargets, compileCard, planCast, waitingOn, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const sink = scry("modal_dfc", [
  { name: "Sink into Stupor", mana_cost: "{1}{U}{U}", type_line: "Instant", oracle_text: "Return target spell or nonland permanent an opponent controls to its owner's hand." },
  { name: "Soporific Springs", type_line: "Land", oracle_text: "As Soporific Springs enters, you may pay 3 life. If you don't, it enters tapped.\n{T}: Add {U}." },
]);
const venser = card("Venser, Shaper Savant", "Legendary Creature — Human Wizard", "{2}{U}{U}", { power: "2", toughness: "2", keywords: ["Flash"], oracleText: "Flash (You may cast this spell any time you could cast an instant.)\nWhen Venser enters, return target spell or permanent to its owner's hand." });
const unsubstantiate = card("Unsubstantiate", "Instant", "{1}{U}", { oracleText: "Return target spell or creature to its owner's hand." });
const flashBear = bear({ name: "Ambush Bear", keywords: ["Flash"], oracleText: "Flash" });
const uncounterable = bear({ name: "Stubborn Bear", oracleText: "This spell can't be countered." });

/** `opp` casts a flash creature from their hand while `ap`'s spell is on the stack; `ap` gets priority back. */
function opponentResponds(s: GameState, ap: PlayerId, opp: PlayerId) {
  for (let i = 0; i < 3; i++) putOnBattlefield(s, opp, forest);
  const id = putOnBattlefield(s, opp, flashBear);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[opp]!.hand.push(id);
  for (let i = 0; i < 8 && waitingOn(s) !== opp; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  for (const a of planCast(s, opp, id)!) s = act(s, a);
  for (let i = 0; i < 8 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return { s, id };
}

describe("return target spell or permanent", () => {
  it("parse", () => {
    for (const d of [sink, venser, unsubstantiate]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Sink into Stupor: an opponent's nonland permanent or spell, not yours and not a land", () => {
    const { s, ap, opp } = setup([]);
    const theirs = putOnBattlefield(s, opp, bear());
    const land = putOnBattlefield(s, opp, island);
    const mine = putOnBattlefield(s, ap, bear());
    const spec = compileCard(faceDef(sink, 0)).spell!.targets[0]!;
    const ids = legalTargets(s, spec, ap).map((t) => t.id);
    expect(ids).toContain(theirs);
    expect(ids).not.toContain(land);
    expect(ids).not.toContain(mine);
  });

  it("Sink into Stupor returns an opponent's creature to its owner's hand", () => {
    const { s: s0, ap, ids, opp } = setup([sink]);
    const theirs = putOnBattlefield(s0, opp, bear());
    const s = cast(s0, ap, ids[0]!, [{ kind: "object", id: theirs }]);
    expect(s.objects[theirs]!.zone).toBe("hand");
    expect(s.players[opp]!.hand).toContain(theirs);
  });

  it("Sink into Stupor returns an opponent's spell to their hand, and only theirs", () => {
    const setupRes = setup([sink, bear()]);
    const { ap, ids, opp } = setupRes;
    let s = setupRes.s;
    for (const a of planCast(s, ap, ids[1]!)!) s = act(s, a);
    const mySpell = s.stack[0]!;
    const r = opponentResponds(s, ap, opp);
    s = r.s;
    const theirSpell = s.stack.find((x) => x.objectId === r.id)!;
    const spec = compileCard(faceDef(sink, 0)).spell!.targets[0]!;
    const legal = legalTargets(s, spec, ap);
    expect(legal).toContainEqual({ kind: "stack", id: theirSpell.id });
    expect(legal).not.toContainEqual({ kind: "stack", id: mySpell.id });
    for (const a of planCast(s, ap, ids[0]!, [{ kind: "stack", id: theirSpell.id }])!) s = act(s, a);
    for (let i = 0; i < 8 && s.stack.length > 1; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[r.id]!.zone).toBe("hand");
    expect(s.stack.some((x) => x.objectId === r.id)).toBe(false);
    expect(s.objects[ids[1]!]!.zone).toBe("stack"); // ours is still there
  });

  it("Unsubstantiate returns a spell that can't be countered: it isn't countered (rulings)", () => {
    const setupRes = setup([unsubstantiate, uncounterable]);
    const { ap, ids } = setupRes;
    let s = setupRes.s;
    for (const a of planCast(s, ap, ids[1]!)!) s = act(s, a);
    const spell = s.stack[0]!;
    for (const a of planCast(s, ap, ids[0]!, [{ kind: "stack", id: spell.id }])!) s = act(s, a);
    for (let i = 0; i < 8 && s.stack.length > 1; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[ids[1]!]!.zone).toBe("hand");
    expect(s.stack).toEqual([]);
  });

  it("Unsubstantiate can't target a noncreature permanent", () => {
    const { s, ap, opp } = setup([unsubstantiate]);
    const land = putOnBattlefield(s, opp, island);
    const b = putOnBattlefield(s, opp, bear());
    const spec = compileCard(unsubstantiate).spell!.targets[0]!;
    const ids = legalTargets(s, spec, ap).map((t) => t.id);
    expect(ids).toContain(b);
    expect(ids).not.toContain(land);
  });

  it("Venser's trigger returns any permanent, a land too", () => {
    const { s: s0, ap, ids, opp } = setup([venser]);
    const land = putOnBattlefield(s0, opp, island);
    let s = cast(s0, ap, ids[0]!);
    for (let i = 0; i < 10 && s.objects[ids[0]!]!.zone !== "battlefield"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    // The trigger asks for its target.
    const pend = s.pending;
    expect(pend?.kind).toBe("chooseTargets");
    if (pend?.kind !== "chooseTargets") return;
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: land }] } as never);
    for (let i = 0; i < 10 && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[land]!.zone).toBe("hand");
  });
});
