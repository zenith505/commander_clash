// Round 133: round 132's gaps (bots and automatic payment use Doubling Cube), then the most played cards.

import { describe, expect, it } from "vitest";
import { act, card, forest, passUntil, putOnBattlefield, scry, setup, target } from "./helpers";
import { invalidateCharacteristics } from "../src/layers";
import { botActions, legalActions, canBeSacrificed, characteristics, controllerOf, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until something asks a player to choose (or the stack is empty). */
const passToPending = (s: GameState) => {
  for (let i = 0; i < 30 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Only these cards stay in `pid`'s hand; the others go to the bottom of the library. */
const onlyInHand = (s: GameState, pid: PlayerId, keep: string[]) => {
  const p = s.players[pid]!;
  for (const x of p.hand.filter((x) => !keep.includes(x))) {
    s.objects[x]!.zone = "library";
    p.library.push(x);
  }
  p.hand = p.hand.filter((x) => keep.includes(x));
};
const nextOf = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % 4]!;
const emptyPools = (s: GameState) => {
  for (const p of Object.values(s.players)) p.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
};

const doublingCube = card("Doubling Cube", "Artifact", "{2}", { oracleText: "{3}, {T}: Double the amount of each type of unspent mana you have." });

describe("Doubling Cube: automatic payment and bots use it when nothing else pays", () => {
  const wurm = card("Test Wurm", "Creature — Wurm", "{6}{G}{G}", { power: "8", toughness: "8" });
  /** `untapped` of the player's lands stay untapped, Forests first. */
  const withLands = (untapped: number, cube = true) => {
    const { s, ap, ids } = setup([wurm]);
    emptyPools(s);
    const lands = s.battlefield.filter((id) => s.objects[id]!.controller === ap).sort((a, b) => Number(s.objects[b]!.cardId.includes("Forest")) - Number(s.objects[a]!.cardId.includes("Forest")));
    lands.forEach((id, i) => (s.objects[id]!.tapped = i >= untapped));
    const cubeId = cube ? putOnBattlefield(s, ap, doublingCube) : undefined;
    return { s, ap, wurm: ids[0]!, cubeId };
  };

  it("seven lands make {G}{6}: the Cube pays {3} from the pool and doubles the rest into {6}{G}{G}", () => {
    supported(doublingCube);
    const { s: s0, ap, wurm: id, cubeId } = withLands(7);
    const plan = planCast(s0, ap, id);
    expect(plan?.some((a) => a.type === "activateMana" && a.objectId === cubeId)).toBe(true);
    const s = run(s0, plan);
    expect(s.stack.map((x) => x.objectId)).toContain(id);
    expect(s.objects[cubeId!]!.tapped).toBe(true);
  });

  it("a bot casts the spell it couldn't otherwise pay for with the Cube", () => {
    const { s: s0, ap, wurm: id, cubeId } = withLands(7);
    // Only the Wurm in hand (no land to play first).
    onlyInHand(s0, ap, [id]);
    const acts = botActions(s0, ap);
    expect(acts.some((a) => a.type === "activateMana" && a.objectId === cubeId)).toBe(true);
    const s = run(s0, acts);
    expect(s.stack.map((x) => x.objectId)).toContain(id);
  });

  it("without the Cube, or with too few lands for it, the spell can't be paid for", () => {
    expect(planCast(withLands(7, false).s, withLands(7, false).ap, withLands(7, false).wurm)).toBeNull();
    const { s, ap, wurm: id } = withLands(6);
    expect(planCast(s, ap, id)).toBeNull();
  });

  it("with enough lands, the Cube isn't used", () => {
    const { s, ap, wurm: id, cubeId } = withLands(8);
    const plan = planCast(s, ap, id);
    expect(plan).not.toBeNull();
    expect(plan!.some((a) => "objectId" in a && a.objectId === cubeId)).toBe(false);
  });
});

const slicer = scry(
  "transform",
  [
    { name: "Slicer, Hired Muscle", mana_cost: "{4}{R}", type_line: "Legendary Artifact Creature — Robot", oracle_text: "More Than Meets the Eye {2}{R} (You may cast this card converted for {2}{R}.)\nDouble strike, haste\nAt the beginning of each opponent's upkeep, you may have that player gain control of Slicer until end of turn. If you do, untap Slicer, goad it, and it can't be sacrificed this turn. If you don't, convert it.", power: "3", toughness: "4" },
    { name: "Slicer, High-Speed Antagonist", type_line: "Legendary Artifact — Vehicle", oracle_text: "Living metal (During your turn, this Vehicle is also a creature.)\nFirst strike, haste\nWhenever Slicer deals combat damage to a player, convert it at end of combat.", power: "3", toughness: "2", color_indicator: ["R"] },
  ],
  { keywords: ["Goad", "Living metal", "First strike", "Haste", "Convert", "More Than Meets the Eye", "Double strike"] },
);

describe("Slicer, Hired Muscle: hired out to each opponent on their upkeep, or converted", () => {
  const atUpkeep = () => {
    const { s: s0, ap } = setup([]);
    const id = putOnBattlefield(s0, ap, slicer);
    s0.objects[id]!.tapped = true;
    const opp = nextOf(s0, ap);
    let s = passUntil(s0, "upkeep", opp);
    s = passToPending(s);
    expect(s.pending?.kind).toBe("chooseMay");
    expect(s.pending?.player).toBe(ap);
    return { s, ap, opp, id };
  };

  it("if you do, that player controls it until end of turn, untapped, goaded by you, and it can't be sacrificed", () => {
    supported(slicer);
    const { s: s0, ap, opp, id } = atUpkeep();
    let s = act(s0, { type: "chooseMay", player: ap, yes: true });
    s = passToPending(s);
    const o = s.objects[id]!;
    expect(controllerOf(s, o)).toBe(opp);
    expect(o.tapped).toBe(false);
    expect(characteristics(s, o).goadedBy).toEqual([ap]);
    expect(canBeSacrificed(s, o)).toBe(false);
    expect(characteristics(s, o).name).toBe("Slicer, Hired Muscle");
    // Back to us at the cleanup step (tapped here so it doesn't have to attack), and it can be sacrificed again.
    s.objects[id]!.tapped = true;
    s = passUntil(s, "upkeep", nextOf(s, opp));
    expect(controllerOf(s, s.objects[id]!)).toBe(ap);
    expect(canBeSacrificed(s, s.objects[id]!)).toBe(true);
  });

  it("if you don't, it converts to its Vehicle face and stays yours", () => {
    const { s: s0, ap, id } = atUpkeep();
    let s = act(s0, { type: "chooseMay", player: ap, yes: false });
    s = passToPending(s);
    expect(controllerOf(s, s.objects[id]!)).toBe(ap);
    expect(characteristics(s, s.objects[id]!).name).toBe("Slicer, High-Speed Antagonist");
  });

  it("a bot hires it out while another opponent is left for it to attack, else converts it", () => {
    const { s, ap } = atUpkeep();
    expect(botActions(s, ap)).toEqual([{ type: "chooseMay", player: ap, yes: true }]);
    const two = structuredClone(s);
    for (const p of two.turnOrder.filter((p) => p !== ap && p !== waitingOn(s) && p !== two.activePlayer)) two.players[p]!.lost = true;
    expect(botActions(two, ap)).toEqual([{ type: "chooseMay", player: ap, yes: false }]);
  });
});

const rona = scry(
  "transform",
  [
    { name: "Rona, Herald of Invasion", mana_cost: "{1}{U}", type_line: "Legendary Creature — Human Wizard", oracle_text: "Whenever you cast a legendary spell, untap Rona.\n{T}: Draw a card, then discard a card.\n{5}{B/P}: Transform Rona. Activate only as a sorcery. ({B/P} can be paid with either {B} or 2 life.)", power: "1", toughness: "3" },
    { name: "Rona, Tolarian Obliterator", type_line: "Legendary Creature — Phyrexian Wizard", oracle_text: "Trample\nWhenever a source deals damage to Rona, that source's controller exiles a card from their hand at random. If it's a land card, you may put it onto the battlefield under your control. Otherwise, you may cast it without paying its mana cost.", power: "5", toughness: "5", color_indicator: ["U", "B"] },
  ],
  { keywords: ["Trample"] },
);
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });

describe("Rona, Tolarian Obliterator: a source's controller exiles a card from their hand at random, for Rona's controller", () => {
  /** Rona's back face up under the next player's control; we hold Shock and `other`. */
  const shot = (other: CardDef) => {
    const { s: s0, ap, ids } = setup([shock, other]);
    const [shockId, otherId] = ids as [string, string];
    const opp = nextOf(s0, ap);
    const id = putOnBattlefield(s0, opp, rona);
    s0.objects[id]!.face = 1;
    invalidateCharacteristics(s0);
    onlyInHand(s0, ap, ids);
    let s = run(s0, planCast(s0, ap, shockId, [target(id)]));
    s = passToPending(s);
    return { s, ap, opp, id, otherId };
  };

  it("a land card: Rona's controller may put it onto the battlefield under their control", () => {
    supported(rona);
    const { s: s0, ap, opp, otherId } = shot(forest);
    expect(s0.pending).toMatchObject({ kind: "chooseMay", player: opp, card: otherId });
    expect(s0.objects[otherId]!.zone).toBe("exile");
    // A bot puts it onto the battlefield.
    expect(botActions(s0, opp)).toEqual([{ type: "chooseMay", player: opp, yes: true }]);
    const s = passToPending(act(s0, { type: "chooseMay", player: opp, yes: true }));
    expect(s.objects[otherId]!.zone).toBe("battlefield");
    expect(controllerOf(s, s.objects[otherId]!)).toBe(opp);
    expect(s.objects[otherId]!.owner).toBe(ap);
  });

  it("a nonland card: Rona's controller may cast it without paying its mana cost, as the trigger resolves", () => {
    const sorcery = card("Test Insight", "Sorcery", "{4}{U}{U}", { oracleText: "Draw two cards." });
    const { s: s0, opp, otherId } = shot(sorcery);
    expect(s0.pending).toMatchObject({ kind: "castFree", player: opp, objectId: otherId });
    const hand = s0.players[opp]!.hand.length;
    let s = botActions(s0, opp).reduce((x, a) => act(x, a), s0);
    expect(s.stack.some((x) => x.objectId === otherId && x.controller === opp)).toBe(true);
    s = passToPending(s);
    expect(s.players[opp]!.hand.length).toBe(hand + 2);
  });

  it("with no card in hand, nothing happens", () => {
    const { s: s0, ap, ids } = setup([shock]);
    const opp = nextOf(s0, ap);
    const id = putOnBattlefield(s0, opp, rona);
    s0.objects[id]!.face = 1;
    invalidateCharacteristics(s0);
    const shockId = ids[0]!;
    onlyInHand(s0, ap, ids);
    const s = passToPending(run(s0, planCast(s0, ap, shockId, [target(id)])));
    expect(s.pending).toBeNull();
    expect(s.objects[id]!.damage).toBe(2);
  });
});

const oscorp = card("Oscorp Industries", "Land", "", { oracleText: "This land enters tapped.\nWhen this land enters from a graveyard, you lose 2 life.\n{T}: Add {U}, {B}, or {R}.\nMayhem (You may play this card from your graveyard if you discarded it this turn. Timing rules still apply.)", keywords: ["Mayhem"] });
const rummage = card("Test Rummage", "Sorcery", "{R}", { oracleText: "Discard a card, then draw a card." });

describe("Oscorp Industries: mayhem without a cost, a land played from the graveyard the turn it was discarded (CR 702.187c)", () => {
  const discarded = () => {
    const { s: s0, ap, ids } = setup([rummage, oscorp]);
    onlyInHand(s0, ap, ids);
    // The only card in hand, so it's the one discarded.
    const s = passToPending(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[1]!]!.zone).toBe("graveyard");
    return { s, ap, id: ids[1]! };
  };

  it("discarded this turn, it's played from the graveyard with the turn's land play, enters tapped, and its owner loses 2 life", () => {
    supported(oscorp);
    const { s: s0, ap, id } = discarded();
    expect(s0.players[ap]!.landsPlayedThisTurn).toBe(0);
    const life = s0.players[ap]!.life;
    expect(legalActions(s0, ap)).toContainEqual({ type: "playLand", player: ap, objectId: id });
    const s = passToPending(act(s0, { type: "playLand", player: ap, objectId: id }));
    expect(s.objects[id]!.zone).toBe("battlefield");
    expect(s.objects[id]!.tapped).toBe(true);
    expect(s.players[ap]!.landsPlayedThisTurn).toBe(1);
    expect(s.players[ap]!.life).toBe(life - 2);
  });

  it("not after a land was played this turn, nor on a later turn", () => {
    const { s: s0, ap, id } = discarded();
    const s = structuredClone(s0);
    s.players[ap]!.landsPlayedThisTurn = 1;
    expect(() => act(s, { type: "playLand", player: ap, objectId: id })).toThrow();
    const later = passUntil(passUntil(s0, "upkeep", nextOf(s0, ap)), "main1", ap, 4000);
    expect(later.turn).toBeGreaterThan(s0.turn);
    expect(legalActions(later, ap).some((a) => a.type === "playLand" && a.objectId === id)).toBe(false);
  });

  it("milled, it can't be played", () => {
    const { s: s0, ap, ids } = setup([oscorp]);
    const id = ids[0]!;
    s0.players[ap]!.hand = s0.players[ap]!.hand.filter((x) => x !== id);
    s0.objects[id]!.zone = "graveyard";
    s0.players[ap]!.graveyard.push(id);
    expect(legalActions(s0, ap).some((a) => a.type === "playLand" && a.objectId === id)).toBe(false);
  });
});
