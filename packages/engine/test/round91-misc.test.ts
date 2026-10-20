// Round 91, one-offs: Sword of Feast and Famine ("that player discards a card and you untap all lands you control"),
// Culling Ritual ("Add {B} or {G} for each permanent destroyed this way": either color for each one, rulings).

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, isFullySupported, manaAbilitiesOn, planActivate, planCast, waitingOn, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const sword = card("Sword of Feast and Famine", "Artifact — Equipment", "{3}", { oracleText: "Equipped creature gets +2/+2 and has protection from black and from green.\nWhenever equipped creature deals combat damage to a player, that player discards a card and you untap all lands you control.\nEquip {2}" });
const ritual = card("Culling Ritual", "Sorcery", "{2}{B}{G}", { oracleText: "Destroy each nonland permanent with mana value 2 or less. Add {B} or {G} for each permanent destroyed this way." });

const settle = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const attack = (s: GameState, ap: PlayerId, attacker: string, defender: PlayerId) =>
  settle(act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker, defender }] }));

describe("round 91 one-offs", () => {
  it("parse", () => {
    for (const d of [sword, ritual]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Sword of Feast and Famine: the player discards, and your lands untap", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[putOnBattlefield(s0, ap, sword)]!.attachedTo = b;
    const lands = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.types.includes("Land"));
    for (const id of lands) s0.objects[id]!.tapped = true;
    const hand = s0.players[opp]!.hand.length;
    let s = attack(s0, ap, b, opp);
    s = settle(passUntil(s, "combatDamage"));
    for (let i = 0; i < 10 && s.pending; i++) s = settle(act(s, botActions(s, s.pending.player)[0]!));
    expect(s.players[opp]!.life).toBe(40 - 4);
    expect(s.players[opp]!.hand.length).toBe(hand - 1);
    expect(lands.every((id) => !s.objects[id]!.tapped)).toBe(true);
  });

  it("Culling Ritual: destroys the cheap permanents and adds either color for each", () => {
    const { s: s0, ap, ids, opp } = setup([ritual]);
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, opp, bear());
    const big = putOnBattlefield(s0, opp, card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" }));
    let s = cast(s0, ap, ids[0]!);
    const pend = s.pending;
    if (pend?.kind !== "chooseOption") throw new Error("no choice");
    expect(pend.labels).toEqual(["add {B}{B}{B}", "add {B}{B}{G}", "add {B}{G}{G}", "add {G}{G}{G}"]);
    s = act(s, { type: "chooseOption", player: ap, choice: pend.options[2]! });
    expect(s.players[ap]!.manaPool.B).toBe(1);
    expect(s.players[ap]!.manaPool.G).toBe(2);
    expect(s.battlefield).toContain(big);
    expect(s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Grizzly Bears")).toEqual([]);
  });

  it("Culling Ritual with nothing destroyed adds nothing and asks nothing", () => {
    const { s: s0, ap, ids } = setup([ritual]);
    const s = cast(s0, ap, ids[0]!);
    expect(s.pending ?? undefined).toBeUndefined();
    expect(s.players[ap]!.manaPool.B + s.players[ap]!.manaPool.G).toBe(0);
  });
});

describe("Spirit Guides: a mana ability that works from the hand", () => {
  const simian = card("Simian Spirit Guide", "Creature — Ape Spirit", "{2}{R}", { power: "2", toughness: "2", oracleText: "Exile this card from your hand: Add {R}." });
  it("parse", () => expect(isFullySupported(simian)).toBe(true));

  it("exiling it from your hand adds {R} right away, without the stack (CR 605.3b)", () => {
    const { s: s0, ap, ids } = setup([simian]);
    const s = act(s0, { type: "activateAbility", player: ap, objectId: ids[0]!, index: 0 });
    expect(s.stack).toEqual([]);
    expect(s.players[ap]!.manaPool.R).toBe(1);
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    expect(s.players[ap]!.hand).not.toContain(ids[0]!);
  });

  it("not from the battlefield", () => {
    const { s, ap } = setup([]);
    const g = putOnBattlefield(s, ap, simian);
    expect(() => act(s, { type: "activateAbility", player: ap, objectId: g, index: 0 })).toThrow();
  });
});

describe("the next spell you cast this turn can't be countered", () => {
  const village = card("Mistrise Village", "Land", "", { oracleText: "This land enters tapped unless you control a Mountain or a Forest.\n{T}: Add {U}.\n{U}, {T}: The next spell you cast this turn can't be countered." });
  const insist = card("Insist", "Sorcery", "{G}", { oracleText: "The next creature spell you cast this turn can't be countered.\nDraw a card." });
  const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });

  it("parse", () => {
    for (const d of [village, insist]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Mistrise Village: the next spell can't be countered, the one after can", () => {
    const { s: s0, ap, ids } = setup([bear(), bear()]);
    const v = putOnBattlefield(s0, ap, village);
    let s = activate(s0, ap, v, 0);
    for (const a of planCast(s, ap, ids[0]!)!) s = act(s, a);
    expect(s.objects[ids[0]!]!.uncounterableCast).toBe(true);
    s = cast(settleAll(s), ap, ids[1]!);
    expect(s.objects[ids[1]!]!.uncounterableCast ?? false).toBe(false);
  });

  it("Insist: only a creature spell uses it up", () => {
    const { s: s0, ap, ids, opp } = setup([insist, shock, bear()]);
    let s = cast(s0, ap, ids[0]!);
    for (const a of planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }])!) s = act(s, a);
    expect(s.objects[ids[1]!]!.uncounterableCast ?? false).toBe(false);
    s = settleAll(s);
    for (const a of planCast(s, ap, ids[2]!)!) s = act(s, a);
    expect(s.objects[ids[2]!]!.uncounterableCast).toBe(true);
  });
});

function settleAll(s: GameState): GameState {
  for (let i = 0; i < 40 && !s.pending && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}

describe("Goldspan Dragon", () => {
  const goldspan = card("Goldspan Dragon", "Creature — Dragon", "{3}{R}{R}", { power: "4", toughness: "4", keywords: ["Flying", "Haste"], oracleText: "Flying, haste\nWhenever this creature attacks or becomes the target of a spell, create a Treasure token.\nTreasures you control have \"{T}, Sacrifice this artifact: Add two mana of any one color.\"" });
  const giant = card("Giant Growth", "Instant", "{G}", { oracleText: "Target creature gets +3/+3 until end of turn." });
  const treasures = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === "Treasure Token");

  it("parse", () => expect(isFullySupported(goldspan)).toBe(true));

  it("a Treasure when it attacks and when a spell targets it; Treasures make two mana of one color", () => {
    const { s: s0, ap, ids, opp } = setup([giant]);
    const g = putOnBattlefield(s0, ap, goldspan);
    let s = cast(s0, ap, ids[0]!, [{ kind: "object", id: g }]);
    s = settleAll(s);
    expect(treasures(s, ap).length).toBe(1);
    s = attack(s, ap, g, opp);
    expect(treasures(s, ap).length).toBe(2);
    const t = treasures(s, ap)[0]!;
    expect(manaAbilitiesOn(s, s.objects[t]!).map((m) => m.produces)).toContainEqual({ kind: "oneOf", options: ["W", "U", "B", "R", "G"], amount: 2 });
  });
});

describe("Ragavan, Nimble Pilferer", () => {
  const ragavan = card("Ragavan, Nimble Pilferer", "Legendary Creature — Monkey Pirate", "{R}", { power: "2", toughness: "1", oracleText: "Whenever Ragavan deals combat damage to a player, create a Treasure token and exile the top card of that player's library. Until end of turn, you may cast that card.\nDash {1}{R} (You may cast this spell for its dash cost. If you do, it gains haste, and it's returned from the battlefield to its owner's hand at the beginning of the next end step.)" });
  it("parse", () => expect(isFullySupported(ragavan)).toBe(true));

  it("a Treasure, and the top card of that player's library, which you may cast this turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, ragavan);
    const top = s0.players[opp]!.library[0]!;
    let s = attack(s0, ap, r, opp);
    s = settle(passUntil(s, "combatDamage"));
    expect(s.objects[top]!.zone).toBe("exile");
    expect(s.objects[top]!.mayPlay).toMatchObject({ player: ap, until: "thisTurn", castOnly: true });
    expect(s.battlefield.some((id) => s.cards[s.objects[id]!.cardId]!.name === "Treasure Token" && s.objects[id]!.controller === ap)).toBe(true);
  });
});

describe("Talon Gates of Madara", () => {
  const gates = card("Talon Gates of Madara", "Land — Gate", "", { oracleText: "When this land enters, up to one target creature phases out.\n{T}: Add {C}.\n{1}, {T}: Add one mana of any color.\n{4}: Put this card from your hand onto the battlefield." });
  it("parse", () => expect(isFullySupported(gates)).toBe(true));

  it("{4} from your hand puts it onto the battlefield, using the stack, not a land play", () => {
    const { s: s0, ap, ids } = setup([gates]);
    const index = 0;
    let s = s0;
    for (const a of (planActivate(s, ap, ids[0]!, index) ?? [])) s = act(s, a);
    expect(s.stack.length).toBe(1);
    s = settleAll(s);
    for (let i = 0; i < 5 && s.pending; i++) s = settleAll(act(s, botActions(s, s.pending.player)[0]!));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.players[ap]!.landsPlayedThisTurn ?? 0).toBe(s0.players[ap]!.landsPlayedThisTurn ?? 0);
  });

  it("nothing happens if it has left your hand", () => {
    const { s: s0, ap, ids } = setup([gates]);
    let s = s0;
    for (const a of planActivate(s, ap, ids[0]!, 0)!) s = act(s, a);
    // It's discarded in response.
    const p = s.players[ap]!;
    p.hand.splice(p.hand.indexOf(ids[0]!), 1);
    p.graveyard.push(ids[0]!);
    Object.assign(s.objects[ids[0]!]!, { zone: "graveyard", zoneChanges: (s.objects[ids[0]!]!.zoneChanges ?? 0) + 1 });
    s = settleAll(s);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });
});
