// Lists of targets under one instruction: "Destroy up to one target artifact, up to one target creature, and up to one
// target land" (Boom Box), "Return up to one target instant card and up to one target sorcery card from your graveyard to
// your hand" (Pull from the Deep), "Return target permanent you control and target permanent you don't control to their
// owners' hands" (Aether Tradewinds). Each "target" is its own instance of the word, so one object can be chosen for
// two of them if it fits both (CR 115.3); any "up to one" can be left unchosen (CR 115.6).

import { describe, expect, it } from "vitest";
import { activate, bear, card, cast, putOnBattlefield, setup, target } from "./helpers";
import { compileCard, isFullySupported, planCast, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const boomBox = card("Boom Box", "Artifact", "{2}", { oracleText: "{6}, {T}, Sacrifice this artifact: Destroy up to one target artifact, up to one target creature, and up to one target land." });
const decimate = card("Decimate", "Sorcery", "{2}{R}{G}", { oracleText: "Destroy target artifact, target creature, target enchantment, and target land. (You can't cast this spell unless you have legal choices for all its targets.)" });
const pull = card("Pull from the Deep", "Sorcery", "{2}{U}{U}", { oracleText: "Return up to one target instant card and up to one target sorcery card from your graveyard to your hand. Exile Pull from the Deep." });
const tradewinds = card("Aether Tradewinds", "Instant", "{2}{U}", { oracleText: "Return target permanent you control and target permanent you don't control to their owners' hands." });
const reconstruct = card("Reconstruct History", "Sorcery", "{3}{R}{W}", { oracleText: "Return up to one target artifact card, up to one target enchantment card, up to one target instant card, up to one target sorcery card, and up to one target planeswalker card from your graveyard to your hand.\nExile Reconstruct History." });
const specialist = card("Restoration Specialist", "Creature — Dwarf Artificer", "{1}{W}", { power: "1", toughness: "1", oracleText: "{W}, Sacrifice this creature: Return up to one target artifact card and up to one target enchantment card from your graveyard to your hand." });

const stone = card("Mind Stone", "Artifact", "{2}", { oracleText: "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card." });
const myr = card("Iron Myr", "Artifact Creature — Myr", "{2}", { power: "1", toughness: "1", oracleText: "{T}: Add {R}." });
const anthem = card("Glorious Anthem", "Enchantment", "{1}{W}{W}", { oracleText: "Creatures you control get +1/+1." });
const quarry = card("Urza's Mine", "Land — Urza's Mine", "", { oracleText: "{T}: Add {C}. If you control an Urza's Power-Plant and an Urza's Tower, add {C}{C}{C} instead." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });

const NONE: TargetChoice = { kind: "none" };
const onField = (s: GameState, id: string) => s.battlefield.includes(id);
function toGraveyard(s: GameState, pid: PlayerId, defs: CardDef[]) {
  return defs.map((d) => {
    const id = putOnBattlefield(s, pid, d);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "graveyard";
    s.players[pid]!.graveyard.push(id);
    return id;
  });
}

describe("lists of targets under one instruction", () => {
  it("compiles them, one target each, optional where it says up to one", () => {
    for (const d of [boomBox, decimate, pull, tradewinds, reconstruct, specialist]) expect(isFullySupported(d), d.name).toBe(true);
    expect(compileCard(boomBox).activated[0]!.body.targets.map((t) => !!t.optional)).toEqual([true, true, true]);
    expect(compileCard(decimate).spell!.targets.map((t) => !!t.optional)).toEqual([false, false, false, false]);
    expect(compileCard(reconstruct).spell!.targets).toHaveLength(5);
  });

  it("doesn't read \"target A or target B\" as two targets: that's one target, chosen from either", () => {
    const either = card("Test Either", "Instant", "{1}{U}", { oracleText: "Return target creature or target land to its owner's hand." });
    const t = compileCard(either).spell?.targets;
    expect(t === undefined || t.length !== 2).toBe(true);
  });

  it("Boom Box: destroys each target chosen, and may leave some unchosen", () => {
    let { s, ap, opp } = setup([]);
    const box = putOnBattlefield(s, ap, boomBox);
    const art = putOnBattlefield(s, opp, stone);
    const land = putOnBattlefield(s, opp, quarry);
    const b = putOnBattlefield(s, opp, bear());
    s = activate(s, ap, box, 0, [target(art), NONE, target(land)]);
    expect(onField(s, art)).toBe(false);
    expect(onField(s, land)).toBe(false);
    expect(onField(s, b)).toBe(true);
    expect(onField(s, box)).toBe(false);
  });

  it("Boom Box: one artifact creature can be both the artifact and the creature target (CR 115.3)", () => {
    let { s, ap, opp } = setup([]);
    const box = putOnBattlefield(s, ap, boomBox);
    const m = putOnBattlefield(s, opp, myr);
    s = activate(s, ap, box, 0, [target(m), target(m), NONE]);
    expect(onField(s, m)).toBe(false);
    expect(s.stack).toHaveLength(0);
  });

  it("Decimate: can't be cast without a legal choice for every target, and destroys all four", () => {
    let { s, ap, opp, ids } = setup([decimate]);
    const art = putOnBattlefield(s, opp, stone);
    const b = putOnBattlefield(s, opp, bear());
    const land = putOnBattlefield(s, opp, quarry);
    // No enchantment yet.
    expect(planCast(s, ap, ids[0]!, [target(art), target(b), NONE, target(land)])).toBeNull();
    const ench = putOnBattlefield(s, opp, anthem);
    s = cast(s, ap, ids[0]!, [target(art), target(b), target(ench), target(land)]);
    for (const id of [art, b, ench, land]) expect(onField(s, id)).toBe(false);
  });

  it("Pull from the Deep: returns the instant and the sorcery chosen, then is exiled", () => {
    let { s, ap, ids } = setup([pull]);
    const [sh, div] = toGraveyard(s, ap, [shock, divination]);
    s = cast(s, ap, ids[0]!, [target(sh!), target(div!)]);
    expect(s.players[ap]!.hand).toEqual(expect.arrayContaining([sh, div]));
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
  });

  it("Pull from the Deep: an instant can't be the sorcery target", () => {
    let { s, ap, ids } = setup([pull]);
    const [sh] = toGraveyard(s, ap, [shock]);
    expect(planCast(s, ap, ids[0]!, [NONE, target(sh!)])).toBeNull();
    s = cast(s, ap, ids[0]!, [target(sh!), NONE]);
    expect(s.players[ap]!.hand).toContain(sh);
  });

  it("Aether Tradewinds: returns a permanent of yours and one you don't control", () => {
    let { s, ap, opp, ids } = setup([tradewinds]);
    const mine = putOnBattlefield(s, ap, bear({ name: "My Bear" }));
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    expect(planCast(s, ap, ids[0]!, [target(theirs), target(mine)])).toBeNull();
    s = cast(s, ap, ids[0]!, [target(mine), target(theirs)]);
    expect(s.players[ap]!.hand).toContain(mine);
    expect(s.players[opp]!.hand).toContain(theirs);
  });

  it("Restoration Specialist: returns the artifact and the enchantment", () => {
    let { s, ap } = setup([]);
    const spec = putOnBattlefield(s, ap, specialist);
    const [st, an] = toGraveyard(s, ap, [stone, anthem]);
    s = activate(s, ap, spec, 0, [target(st!), target(an!)]);
    expect(s.players[ap]!.hand).toEqual(expect.arrayContaining([st, an]));
  });
});
