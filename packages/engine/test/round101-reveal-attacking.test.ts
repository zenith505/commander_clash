// Round 101: Arachnogenesis ("the number of creatures attacking you", "non-Spider creatures") and "Reveal cards from the
// top of your library until you reveal a creature card. Put that card onto the battlefield (into your hand) and the rest
// on the bottom of your library in a random order" (Jalira, Evolutionary Leap; CR 701.20a).

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passUntil, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, planActivate, planCast, waitingOn, type GameState } from "../src";

const pass = (s: GameState) => act(s, { type: "passPriority", player: waitingOn(s)! });

// Real oracle text (Scryfall).
const arachnogenesis = card("Arachnogenesis", "Instant", "{2}{G}", {
  oracleText:
    "Create X 1/2 green Spider creature tokens with reach, where X is the number of creatures attacking you. Prevent all combat damage that would be dealt this turn by non-Spider creatures.",
});
const leap = card("Evolutionary Leap", "Enchantment", "{1}{G}", {
  oracleText: "{G}, Sacrifice a creature: Reveal cards from the top of your library until you reveal a creature card. Put that card into your hand and the rest on the bottom of your library in a random order.",
});
const jalira = card("Jalira, Master Polymorphist", "Legendary Creature — Human Wizard", "{3}{U}", {
  power: "2",
  toughness: "2",
  oracleText:
    "{2}{U}, {T}, Sacrifice another creature: Reveal cards from the top of your library until you reveal a nonlegendary creature card. Put that card onto the battlefield and the rest on the bottom of your library in a random order.",
});

describe("round 101: Arachnogenesis", () => {
  it("parses", () => expect(isFullySupported(arachnogenesis)).toBe(true));

  it("a Spider for each creature attacking you, and only Spiders deal combat damage", () => {
    const { s: s0, ap, opp, ids } = setup([arachnogenesis]);
    const attackers = [0, 1, 2].map(() => putOnBattlefield(s0, opp, bear()));
    // A creature attacking someone else isn't attacking you.
    const third = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    let s = passUntil(s0, "declareAttackers", opp);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: attackers[0]!, defender: ap }, { attacker: attackers[1]!, defender: ap }, { attacker: attackers[2]!, defender: third }] });
    while (waitingOn(s) !== ap) s = pass(s);
    s.players[ap]!.manaPool.G += 3;
    for (const a of planCast(s, ap, ids[0]!, [])!) s = act(s, a);
    while (s.stack.length) s = pass(s);
    const spiders = s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap);
    expect(spiders).toHaveLength(2);
    const life = s.players[ap]!.life;
    const thirdLife = s.players[third]!.life;
    s = passUntil(s, "end", opp);
    expect(s.players[ap]!.life).toBe(life);
    expect(s.players[third]!.life).toBe(thirdLife);
  });
});

describe("round 101: reveal until a creature card", () => {
  it("parses", () => {
    expect(isFullySupported(leap)).toBe(true);
    expect(isFullySupported(jalira)).toBe(true);
  });

  it("Evolutionary Leap: the first creature card goes to the hand, the others to the bottom", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, leap);
    const fodder = putOnBattlefield(s0, ap, bear());
    const p = s0.players[ap]!;
    // The top: two Forests, then a bear.
    const f1 = putOnBattlefield(s0, ap, forest);
    const f2 = putOnBattlefield(s0, ap, forest);
    const b = putOnBattlefield(s0, ap, bear({ name: "Top Bear" }));
    for (const id of [f1, f2, b]) {
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      s0.objects[id]!.zone = "library";
    }
    p.library.unshift(f1, f2, b);
    const size = p.library.length;
    p.manaPool.G += 1;
    const leapId = s0.battlefield.find((id) => s0.objects[id]!.cardId === leap.oracleId)!;
    let s = s0;
    const plan = planActivate(s, ap, leapId, 0, [], undefined, undefined, undefined, { sacrifice: [fodder] });
    expect(plan).toBeTruthy();
    for (const a of plan!) s = act(s, a);
    while (s.stack.length && !s.pending) s = pass(s);
    expect(s.objects[fodder]!.zone).toBe("graveyard");
    expect(s.objects[b]!.zone).toBe("hand");
    expect(s.players[ap]!.library.length).toBe(size - 1);
    expect(s.players[ap]!.library.slice(-2).sort()).toEqual([f1, f2].sort());
  });

  it("Jalira: a nonlegendary creature card onto the battlefield; none found, all to the bottom", () => {
    const { s: s0, ap } = setup([]);
    const j = putOnBattlefield(s0, ap, jalira);
    const fodder = putOnBattlefield(s0, ap, bear());
    const p = s0.players[ap]!;
    p.library = p.library.filter((id) => !s0.cards[s0.objects[id]!.cardId]!.types.includes("Creature"));
    const size = p.library.length;
    p.manaPool.U += 3;
    let s = s0;
    for (const a of planActivate(s, ap, j, 0, [], undefined, undefined, undefined, { sacrifice: [fodder] })!) s = act(s, a);
    while (s.stack.length && !s.pending) s = pass(s);
    expect(s.players[ap]!.library.length).toBe(size);
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Creature"))).toEqual([j]);
  });
});
