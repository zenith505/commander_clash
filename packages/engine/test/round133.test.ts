// Round 133: round 132's gaps (bots and automatic payment use Doubling Cube), then the most played cards.

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passUntil, putOnBattlefield, scry, setup, target } from "./helpers";
import { invalidateCharacteristics } from "../src/layers";
import { addMana } from "../src/spend";
import { moveObject, spellCost } from "../src/game";
import { manaValue as manaValueOf } from "../src/mana";
import { setFace } from "../src/faces";
import { abilityProblem, botActions, potentialAttackers, compileCard, faceDef, legalActions, manaOptions, planActivate, canBeSacrificed, characteristics, controllerOf, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
    setFace(s0, s0.objects[id]!, 1);
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
    setFace(s0, s0.objects[id]!, 1);
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

const yuna = card("Yuna, Grand Summoner", "Legendary Creature — Human Cleric Summoner", "{1}{G}{U}", { power: "1", toughness: "5", oracleText: "Grand Summon — {T}: Add one mana of any color. When you next cast a creature spell this turn, that creature enters with two additional +1/+1 counters on it.\nWhenever another permanent you control is put into a graveyard from the battlefield, if it had one or more counters on it, you may put that number of +1/+1 counters on target creature." });

describe("Yuna, Grand Summoner", () => {
  it("Grand Summon: the next creature spell cast this turn enters with two more +1/+1 counters, only that one", () => {
    supported(yuna);
    const bear1 = card("First Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });
    const bear2 = card("Second Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });
    const { s: s0, ap, ids } = setup([bear1, bear2]);
    emptyPools(s0);
    const y = putOnBattlefield(s0, ap, yuna);
    let s = act(s0, { type: "activateMana", player: ap, objectId: y, mana: "G", ability: 0 });
    expect(s.players[ap]!.manaPool.G).toBe(1);
    expect(s.objects[y]!.tapped).toBe(true);
    s = passToPending(run(s, planCast(s, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(2);
    s = passToPending(run(s, planCast(s, ap, ids[1]!)));
    expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[1]!]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("another permanent of ours dies with counters on it: that many +1/+1 counters, of every kind it had (rulings)", () => {
    const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });
    const { s: s0, ap, ids } = setup([murder]);
    putOnBattlefield(s0, ap, yuna);
    const victim = putOnBattlefield(s0, ap, card("Test Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    const other = putOnBattlefield(s0, ap, card("Other Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    s0.objects[victim]!.counters = { "+1/+1": 2, stun: 1 };
    invalidateCharacteristics(s0);
    let s = passToPending(run(s0, planCast(s0, ap, ids[0]!, [target(victim)])));
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [target(other)] } as Action);
    s = passToPending(s);
    expect(s.pending?.kind).toBe("chooseMay");
    s = passToPending(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[other]!.counters["+1/+1"]).toBe(3);
  });

  it("not for a permanent that had no counters", () => {
    const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });
    const { s: s0, ap, ids } = setup([murder]);
    putOnBattlefield(s0, ap, yuna);
    const victim = putOnBattlefield(s0, ap, card("Test Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    const s = passToPending(run(s0, planCast(s0, ap, ids[0]!, [target(victim)])));
    expect(s.objects[victim]!.zone).toBe("graveyard");
    expect(s.pending).toBeNull();
    expect(s.stack.length).toBe(0);
  });
});

const jeweledAmulet = card("Jeweled Amulet", "Artifact", "{0}", { oracleText: "{1}, {T}: Put a charge counter on this artifact. Note the type of mana spent to pay this activation cost. Activate only if there are no charge counters on this artifact.\n{T}, Remove a charge counter from this artifact: Add one mana of this artifact's last noted type." });

describe("Jeweled Amulet: the type of mana spent on its first ability, added by its second", () => {
  it("{R} spent on the charge: later its counter makes {R}", () => {
    supported(jeweledAmulet);
    const { s: s0, ap } = setup([]);
    emptyPools(s0);
    const id = putOnBattlefield(s0, ap, jeweledAmulet);
    addMana(s0, ap, ["R"]);
    let s = passToPending(act(s0, { type: "activateAbility", player: ap, objectId: id, index: 0 }));
    expect(s.objects[id]!.counters.charge).toBe(1);
    expect(s.objects[id]!.notedMana).toBe("R");
    // Only while it has no charge counters.
    expect(abilityProblem(s, ap, id, 0)).not.toBeNull();
    s.objects[id]!.tapped = false;
    expect(manaOptions(s, s.objects[id]!).map((x) => x.adds)).toEqual([["R"]]);
    s = act(s, { type: "activateMana", player: ap, objectId: id, mana: "R", ability: 0 });
    expect(s.players[ap]!.manaPool.R).toBe(1);
    expect(s.objects[id]!.counters.charge ?? 0).toBe(0);
  });

  it("a charge counter from elsewhere with no type noted makes no mana (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const id = putOnBattlefield(s0, ap, jeweledAmulet);
    s0.objects[id]!.counters.charge = 1;
    invalidateCharacteristics(s0);
    expect(manaOptions(s0, s0.objects[id]!).every((x) => x.adds.length === 0)).toBe(true);
  });
});

const clavileno = card("Clavileño, First of the Blessed", "Legendary Creature — Vampire Cleric", "{1}{W}{B}", { power: "2", toughness: "2", oracleText: "Whenever you attack, target attacking Vampire that isn't a Demon becomes a Demon in addition to its other types. It gains \"When this creature dies, draw a card and create a tapped 4/3 white and black Vampire Demon creature token with flying.\"" });

describe("Clavileño, First of the Blessed: an attacking Vampire becomes a Demon with a dies trigger, for good", () => {
  it("the Vampire becomes a Demon and, when it dies, its controller draws and gets a tapped 4/3 flier", () => {
    supported(clavileno);
    const vamp = card("Test Vampire", "Creature — Vampire", "{1}{B}", { power: "2", toughness: "2" });
    const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });
    const { s: s0, ap, ids, opp } = setup([murder]);
    putOnBattlefield(s0, ap, clavileno);
    const v = putOnBattlefield(s0, ap, vamp);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: v, defender: opp }] });
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [target(v)] } as Action);
    s = passToPending(s);
    expect(characteristics(s, s.objects[v]!).subtypes).toEqual(expect.arrayContaining(["Vampire", "Demon"]));
    // Still a Demon after the turn: no duration.
    s = passUntil(s, "upkeep", nextOf(s, ap));
    expect(characteristics(s, s.objects[v]!).subtypes).toContain("Demon");
    s = passUntil(s, "main1", ap, 4000);
    const hand = s.players[ap]!.hand.length;
    s = passToPending(run(s, planCast(s, ap, ids[0]!, [target(v)])));
    expect(s.objects[v]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand); // Murder left, a card drawn
    const token = s.battlefield.map((id) => s.objects[id]!).find((o) => o.isToken && controllerOf(s, o) === ap);
    expect(token && characteristics(s, token).subtypes).toEqual(["Vampire", "Demon"]);
    expect(token?.tapped).toBe(true);
  });

  it("a Vampire that's already a Demon can't be targeted", () => {
    const demon = card("Test Vampire Demon", "Creature — Vampire Demon", "{1}{B}", { power: "2", toughness: "2" });
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, clavileno);
    const v = putOnBattlefield(s0, ap, demon);
    let s = passUntil(s0, "declareAttackers", ap);
    s = passToPending(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: v, defender: opp }] }));
    expect(s.pending).toBeNull();
    expect(s.stack.length).toBe(0);
  });
});

const ral = scry(
  "transform",
  [
    { name: "Ral, Monsoon Mage", mana_cost: "{1}{R}", type_line: "Legendary Creature — Human Wizard", oracle_text: "Instant and sorcery spells you cast cost {1} less to cast.\nWhenever you cast an instant or sorcery spell during your turn, flip a coin. If you lose the flip, Ral deals 1 damage to you. If you win the flip, you may exile Ral. If you do, return him to the battlefield transformed under his owner's control.", power: "1", toughness: "3" },
    { name: "Ral, Leyline Prodigy", type_line: "Legendary Planeswalker — Ral", oracle_text: "Ral enters with an additional loyalty counter on him for each instant and sorcery spell you've cast this turn.\n+1: Until your next turn, instant and sorcery spells you cast cost {1} less to cast.\n−2: Ral deals 2 damage divided as you choose among one or two targets. Draw a card if you control a blue permanent other than Ral.\n−8: Exile the top eight cards of your library. You may cast instant and sorcery spells from among them this turn without paying their mana costs.", loyalty: "2", color_indicator: ["U", "R"] },
  ],
);
const opt = card("Opt", "Instant", "{U}", { oracleText: "Scry 1.\nDraw a card." });

/** The mana value of what casting `id` costs `pid` now: its symbols and generic mana together. */
const costOf = (s: GameState, pid: PlayerId, id: string) => {
  const c = spellCost(s, pid, s.objects[id]!);
  return manaValueOf(c.cost) + c.extra;
};

describe("Ral, Monsoon Mage // Ral, Leyline Prodigy", () => {
  /** Ral's trigger for casting Opt, on top of the stack; then resolved with the coin landing `won` or not. */
  const flipped = (won: boolean) => {
    const { s: s0, ap, ids } = setup([opt]);
    const r = putOnBattlefield(s0, ap, ral);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    expect(s.triggerQueue.length + s.stack.length).toBeGreaterThan(1);
    for (let seed = 1; seed < 200; seed++) {
      const t = structuredClone(s);
      t.rngState = seed;
      let u = t;
      for (let i = 0; i < 10 && !u.pending && u.stack.some((x) => x.sourceId === r); i++) u = act(u, { type: "passPriority", player: waitingOn(u)! });
      const won2 = u.pending?.kind === "chooseMay";
      if (won2 === won) return { s: u, ap, r, opt: ids[0]! };
    }
    throw new Error("no seed");
  };

  it("compiles on both faces; it triggers only during its controller's turn", () => {
    supported(ral);
    expect(compileCard(faceDef(ral, 0)).triggers[0]!.cast?.ownTurn).toBe(true);
  });

  it("losing the flip: 1 damage to you", () => {
    const { s, ap } = flipped(false);
    expect(s.players[ap]!.life).toBe(39);
  });

  it("winning the flip: you may exile Ral; he returns transformed with a loyalty counter more for each instant and sorcery cast this turn", () => {
    const { s: s0, ap, r } = flipped(true);
    const s = act(s0, { type: "chooseMay", player: ap, yes: true });
    const back = s.battlefield.map((id) => s.objects[id]!).find((o) => characteristics(s, o).name === "Ral, Leyline Prodigy");
    expect(back).toBeDefined();
    expect(back!.id === r || s.objects[r]!.zone !== "battlefield").toBe(true);
    // 2 printed, +1 for Opt (still on the stack, rulings).
    expect(back!.counters.loyalty).toBe(3);
    expect(s.players[ap]!.life).toBe(40);
  });

  it("+1: instant and sorcery spells cost {1} less until your next turn; −8: only instants and sorceries may be cast free this turn", () => {
    const { s: s0, ap, ids } = setup([card("Test Bolt", "Instant", "{2}{R}", { oracleText: "Test Bolt deals 3 damage to any target." })]);
    const r = putOnBattlefield(s0, ap, ral);
    setFace(s0, s0.objects[r]!, 1);
    s0.objects[r]!.counters.loyalty = 9;
    invalidateCharacteristics(s0);
    const s1 = passToPending(run(s0, planActivate(s0, ap, r, 0)));
    expect(s1.objects[r]!.counters.loyalty).toBe(10);
    expect(costOf(s1, ap, ids[0]!)).toBe(2);
    expect(costOf(s0, ap, ids[0]!)).toBe(3);
    // −8, with an instant, a sorcery and a creature among the top eight.
    const top = [opt, card("Test Sorcery", "Sorcery", "{5}{U}", { oracleText: "Draw two cards." }), card("Test Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3" })];
    const lib = s0.players[ap]!.library;
    const putTop = top.map((c) => {
      const id = putOnBattlefield(s0, ap, c);
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      s0.objects[id]!.zone = "library";
      lib.unshift(id);
      return id;
    });
    const s = passToPending(run(s0, planActivate(s0, ap, r, 2)));
    expect(putTop.map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile", "exile"]);
    expect(putTop.map((id) => !!s.objects[id]!.mayPlay?.free)).toEqual([true, true, false]);
  });
});

describe("Crovax the Cursed: \"you may sacrifice a creature. If you do, ... If you don't, ...\"", () => {
  const crovax = card("Crovax the Cursed", "Legendary Creature — Vampire Noble", "{2}{B}{B}", {
    oracleText: "Crovax enters with four +1/+1 counters on it.\nAt the beginning of your upkeep, you may sacrifice a creature. If you do, put a +1/+1 counter on Crovax. If you don't, remove a +1/+1 counter from Crovax.\n{B}: Crovax gains flying until end of turn.",
    power: "0",
    toughness: "0",
  });
  /** Crovax's upkeep trigger, asking whether to sacrifice. */
  const upkeep = () => {
    const { s: s0, ap } = setup([]);
    const id = putOnBattlefield(s0, ap, crovax);
    s0.objects[id]!.counters["+1/+1"] = 4;
    invalidateCharacteristics(s0);
    const s = passToPending(passUntil(passUntil(s0, "upkeep", nextOf(s0, ap)), "upkeep", ap));
    return { s, ap, id };
  };

  it("declining removes a counter", () => {
    supported(crovax);
    const { s: s0, ap, id } = upkeep();
    expect(s0.pending?.kind).toBe("chooseMay");
    const s = passToPending(act(s0, { type: "chooseMay", player: ap, yes: false }));
    expect(s.objects[id]!.counters["+1/+1"]).toBe(3);
  });

  it("sacrificing a creature adds one", () => {
    const { s: s0, ap, id } = upkeep();
    const other = putOnBattlefield(s0, ap, bear());
    let s = act(s0, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending?.kind === "pickPermanents" && s.pending.options).toContain(other);
    s = act(s, { type: "pickPermanents", player: ap, ids: [other] });
    s = passToPending(s);
    expect(s.objects[other]!.zone).toBe("graveyard");
    expect(s.objects[id]!.counters["+1/+1"]).toBe(5);
  });
});

const aang = scry(
  "transform",
  [
    { name: "Aang, Swift Savior", mana_cost: "{1}{W}{U}", type_line: "Legendary Creature — Human Avatar Ally", oracle_text: "Flash\nFlying\nWhen Aang enters, airbend up to one other target creature or spell. (Exile it. While it's exiled, its owner may cast it for {2} rather than its mana cost.)\nWaterbend {8}: Transform Aang. (While paying a waterbend cost, you can tap your artifacts and creatures to help. Each one pays for {1}.)", power: "2", toughness: "3" },
    { name: "Aang and La, Ocean's Fury", type_line: "Legendary Creature — Avatar Spirit Ally", oracle_text: "Reach, trample\nWhenever Aang and La attack, put a +1/+1 counter on each tapped creature you control.", power: "5", toughness: "5" },
  ],
  { keywords: ["Flash", "Flying", "Airbend", "Waterbend", "Reach", "Trample"] },
);

describe("Aang, Swift Savior // Aang and La, Ocean's Fury", () => {
  const sorcery = card("Test Sorcery", "Sorcery", "{5}{U}", { oracleText: "Draw two cards." });
  /** Aang cast in response to our own sorcery, his trigger asking for its target. */
  const entered = () => {
    const { s: s0, ap, ids } = setup([sorcery, aang]);
    const [sorc, a] = ids as [string, string];
    onlyInHand(s0, ap, ids);
    addMana(s0, ap, ["W", "U", "U", ...Array<"C">(8).fill("C")]);
    let s = run(s0, planCast(s0, ap, sorc));
    s = run(s, planCast(s, ap, a));
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (let i = 0; i < 6 && !s.pending && s.objects[a]!.zone !== "battlefield"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return { s, ap, sorc, a };
  };

  it("compiles on both faces", () => supported(aang));

  it("airbends a spell: it leaves the stack without resolving, and its owner may cast it from exile for {2}", () => {
    const { s: s0, ap, sorc } = entered();
    expect(s0.pending?.kind).toBe("chooseTargets");
    const item = s0.stack.find((x) => x.objectId === sorc)!;
    let s = act(s0, { type: "chooseTargets", player: ap, targets: [{ kind: "stack", id: item.id }] });
    s = passToPending(s);
    expect(s.objects[sorc]!.zone).toBe("exile");
    expect(s.objects[sorc]!.mayPlay).toMatchObject({ player: ap, until: "exiled", castOnly: true, cost: "{2}" });
    expect(s.players[ap]!.hand).toHaveLength(0);
  });

  it("airbends another creature, but not Aang himself", () => {
    const { s: s0, ap, a } = entered();
    const opp = nextOf(s0, ap);
    const theirs = putOnBattlefield(s0, opp, bear());
    expect(() => act(s0, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: a }] })).toThrow();
    const s = passToPending(act(s0, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: theirs }] }));
    expect(s.objects[theirs]!.zone).toBe("exile");
    expect(s.objects[theirs]!.mayPlay).toMatchObject({ player: opp, cost: "{2}" });
  });

  it("Aang and La attack: a +1/+1 counter on each tapped creature you control", () => {
    const { s: s0, ap } = setup([]);
    const id = putOnBattlefield(s0, ap, aang);
    setFace(s0, s0.objects[id]!, 1);
    const tapped = putOnBattlefield(s0, ap, bear());
    s0.objects[tapped]!.tapped = true;
    const untapped = putOnBattlefield(s0, ap, bear({ name: "Untapped Bear" }));
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "declareAttackers", ap);
    const opp = nextOf(s, ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: id, defender: opp }] });
    s = passToPending(s);
    expect(s.objects[tapped]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[untapped]!.counters["+1/+1"] ?? 0).toBe(0);
    // Aang and La don't have vigilance: tapped as they attack, so they get one too.
    expect(s.objects[id]!.counters["+1/+1"]).toBe(1);
  });
});

describe("cards named for two characters take plural verbs: \"Whenever Aang and Katara enter or attack\"", () => {
  const aangKatara = card("Aang and Katara", "Legendary Creature — Human Avatar Ally", "{3}{G}{W}{U}", { power: "5", toughness: "5", oracleText: "Whenever Aang and Katara enter or attack, create X 1/1 white Ally creature tokens, where X is the number of tapped artifacts and/or creatures you control." });
  const falcon = card("Falcon and Redwing", "Legendary Creature — Human Bird Hero", "{2}{W}", { power: "1", toughness: "2", keywords: ["Flying"], oracleText: "Flying\nWhenever Falcon and Redwing deal combat damage to a player, create that many 1/1 white Bird creature tokens with flying, then put a +1/+1 counter on Falcon and Redwing." });

  it("Aang and Katara attack: an Ally for each tapped artifact and creature, themselves included", () => {
    supported(aangKatara, falcon);
    const { s: s0, ap } = setup([]);
    const id = putOnBattlefield(s0, ap, aangKatara);
    const tapped = putOnBattlefield(s0, ap, bear());
    s0.objects[tapped]!.tapped = true;
    let s = passUntil(s0, "declareAttackers", ap);
    s = passToPending(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: id, defender: nextOf(s, ap) }] }));
    expect(s.battlefield.filter((x) => s.objects[x]!.controller === ap && characteristics(s, s.objects[x]!).subtypes.includes("Ally") && s.objects[x]!.isToken)).toHaveLength(2);
  });

  it("Falcon and Redwing deal combat damage to a player: that many Birds, then a counter", () => {
    const { s: s0, ap } = setup([]);
    const id = putOnBattlefield(s0, ap, falcon);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: id, defender: nextOf(s, ap) }] });
    for (let i = 0; i < 40 && s.objects[id]!.counters["+1/+1"] === undefined; i++) s = s.pending ? run(s, botActions(s, s.pending.player).slice(0, 1)) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[id]!.counters["+1/+1"]).toBe(1);
    expect(s.battlefield.filter((x) => s.objects[x]!.controller === ap && characteristics(s, s.objects[x]!).name === "Bird Token")).toHaveLength(1);
  });
});

describe("The Book of Exalted Deeds", () => {
  const book = card("The Book of Exalted Deeds", "Legendary Artifact — Book", "{W}{W}{W}", {
    oracleText: "At the beginning of your end step, if you gained 3 or more life this turn, create a 3/3 white Angel creature token with flying.\n{W}{W}{W}, {T}, Exile The Book of Exalted Deeds: Put an enlightened counter on target Angel. It gains \"You can't lose the game and your opponents can't win the game.\" Activate only as a sorcery.",
  });
  const angel = card("Test Angel", "Creature — Angel", "{3}{W}", { power: "3", toughness: "3", keywords: ["Flying"], oracleText: "Flying" });

  it("the Angel gains \"You can't lose the game ...\" for good, even if it loses the counter; with 0 life you stay in", () => {
    supported(book);
    const { s: s0, ap } = setup([]);
    const b = putOnBattlefield(s0, ap, book);
    const a = putOnBattlefield(s0, ap, angel);
    addMana(s0, ap, ["W", "W", "W"]);
    let s = passToPending(run(s0, planActivate(s0, ap, b, 0, [target(a)])));
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.objects[a]!.counters.enlightened).toBe(1);
    s.objects[a]!.counters = {};
    s.players[ap]!.life = 0;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[ap]!.lost).toBeFalsy();
    // Once the Angel is gone, the state-based action applies.
    s.battlefield.splice(s.battlefield.indexOf(a), 1);
    s.objects[a]!.zone = "graveyard";
    invalidateCharacteristics(s);
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[ap]!.lost).toBe(true);
  });

  it("a non-Angel can't be targeted", () => {
    const { s: s0, ap } = setup([]);
    const b = putOnBattlefield(s0, ap, book);
    putOnBattlefield(s0, ap, bear());
    addMana(s0, ap, ["W", "W", "W"]);
    expect(planActivate(s0, ap, b, 0)).toBeNull();
  });
});

describe("\"Put your choice of a +1/+1 counter or two charge counters on ...\": chosen as it resolves", () => {
  const inspirit = card("Inspirit, Flagship Vessel", "Legendary Artifact — Spacecraft", "{U}{R}{W}", {
    power: "5",
    toughness: "5",
    keywords: ["Station"],
    oracleText: "Station (Tap another creature you control: Put charge counters equal to its power on this Spacecraft. Station only as a sorcery. It's an artifact creature at 8+.)\n1+ | At the beginning of combat on your turn, put your choice of a +1/+1 counter or two charge counters on up to one other target artifact.\n8+ | Flying\nOther artifacts you control have hexproof and indestructible.",
  });
  const assaultron = card("Assaultron Dominator", "Artifact Creature — Robot", "{1}{R}", { power: "2", toughness: "2", oracleText: "When this creature enters, you get {E}{E} (two energy counters).\nWhenever an artifact creature you control attacks, you may pay {E}. If you do, put your choice of a +1/+1, first strike, or trample counter on that creature." });
  const relic = card("Test Relic", "Artifact", "{1}", { oracleText: "" });

  it("Inspirit with a charge counter: two charge counters on another artifact at the beginning of combat", () => {
    supported(inspirit, assaultron);
    const { s: s0, ap } = setup([]);
    const id = putOnBattlefield(s0, ap, inspirit);
    s0.objects[id]!.counters.charge = 1;
    const r = putOnBattlefield(s0, ap, relic);
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "beginCombat", ap);
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: r }] });
    s = passToPending(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", labels: ["Put a +1/+1 counter", "Put two charge counters"] });
    s = passToPending(act(s, { type: "chooseOption", player: ap, choice: "1" }));
    expect(s.objects[r]!.counters).toEqual({ charge: 2 });
  });

  it("Inspirit without charge counters doesn't trigger", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, inspirit);
    putOnBattlefield(s0, ap, relic);
    const s = passUntil(s0, "beginCombat", ap);
    expect(s.triggerQueue.length + s.stack.length).toBe(0);
    expect(s.pending).toBeFalsy();
  });

  it("Assaultron Dominator: pay {E} and choose the first strike counter for the attacking artifact creature", () => {
    const { s: s0, ap } = setup([]);
    const id = putOnBattlefield(s0, ap, assaultron);
    s0.players[ap]!.energy = 1;
    let s = passUntil(s0, "declareAttackers", ap);
    s = passToPending(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: id, defender: nextOf(s, ap) }] }));
    expect(s.pending?.kind).toBe("chooseMay");
    s = passToPending(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.pending).toMatchObject({ kind: "chooseOption", labels: ["Put a +1/+1 counter", "Put a first strike counter", "Put a trample counter"] });
    s = passToPending(act(s, { type: "chooseOption", player: ap, choice: "1" }));
    expect(s.objects[id]!.counters).toEqual({ "first strike": 1 });
    expect(s.players[ap]!.energy ?? 0).toBe(0);
  });
});

describe("Retether: each Aura card from your graveyard returns, enchanting only creatures", () => {
  const retether = card("Retether", "Sorcery", "{3}{W}", { oracleText: "Return each Aura card from your graveyard to the battlefield. Only creatures can be enchanted this way. (Aura cards that can't enchant a creature on the battlefield remain in your graveyard.)" });
  const holy = card("Holy Strength", "Enchantment — Aura", "{W}", { oracleText: "Enchant creature\nEnchanted creature gets +1/+2." });
  const growth = card("Wild Growth", "Enchantment — Aura", "{G}", { oracleText: "Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional {G}." });
  const curse = card("Curse of Test", "Enchantment — Aura Curse", "{B}", { oracleText: "Enchant player\nEnchanted player's upkeeps are slow." });
  const toYard = (s: GameState, pid: PlayerId, d: CardDef) => {
    const id = putOnBattlefield(s, pid, d);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "graveyard";
    s.players[pid]!.graveyard.push(id);
    return id;
  };

  it("an Aura for a creature returns on one; one for a land or a player stays in the graveyard", () => {
    supported(retether);
    const { s: s0, ap, ids } = setup([retether]);
    addMana(s0, ap, ["W", "C", "C", "C"]);
    const b = putOnBattlefield(s0, ap, bear());
    const [h, g] = [toYard(s0, ap, holy), toYard(s0, ap, growth)];
    const s = passToPending(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[h]!.zone).toBe("battlefield");
    expect(s.objects[h]!.attachedTo).toBe(b);
    expect(s.objects[g]!.zone).toBe("graveyard");
  });

  it("with two creatures, its controller chooses which one", () => {
    const { s: s0, ap, ids } = setup([retether]);
    addMana(s0, ap, ["W", "C", "C", "C"]);
    putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, nextOf(s0, ap), bear());
    const h = toYard(s0, ap, holy);
    let s = passToPending(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "enchant" });
    s = passToPending(act(s, { type: "chooseOption", player: ap, choice: theirs }));
    expect(s.objects[h]!.attachedTo).toBe(theirs);
  });

  it("an Aura that would enchant a player doesn't return", () => {
    const { s: s0, ap, ids } = setup([retether]);
    addMana(s0, ap, ["W", "C", "C", "C"]);
    const c = toYard(s0, ap, curse);
    const s = passToPending(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeFalsy();
    expect(s.objects[c]!.zone).toBe("graveyard");
  });
});

describe("Sower of Discord: two players chosen as it enters; damage to one makes the other lose that much life", () => {
  const sower = card("Sower of Discord", "Creature — Demon", "{4}{B}{B}", { power: "6", toughness: "6", keywords: ["Flying"], oracleText: "Flying\nAs this creature enters, choose two players.\nWhenever damage is dealt to one of the chosen players, the other chosen player also loses that much life." });
  const bolt = card("Test Bolt", "Instant", "{R}", { oracleText: "Test Bolt deals 3 damage to any target." });

  /** Sower cast and resolved, its two players chosen: `a`, then `b`. */
  const entered = (a: (ap: PlayerId, opp: PlayerId) => PlayerId, b: (ap: PlayerId, opp: PlayerId) => PlayerId) => {
    const { s: s0, ap, ids } = setup([sower, bolt]);
    onlyInHand(s0, ap, ids);
    addMana(s0, ap, ["B", "B", "C", "C", "C", "C", "R"]);
    const opp = nextOf(s0, ap);
    let s = passToPending(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "player", prompt: "choose two players: the first" });
    expect(s.pending?.kind === "chooseOption" && s.pending.options).toHaveLength(4);
    s = act(s, { type: "chooseOption", player: ap, choice: String(a(ap, opp)) });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "player", prompt: "choose the second of two players" });
    expect(s.pending?.kind === "chooseOption" && s.pending.options).not.toContain(String(a(ap, opp)));
    s = passToPending(act(s, { type: "chooseOption", player: ap, choice: String(b(ap, opp)) }));
    return { s, ap, opp, sowerId: ids[0]!, boltId: ids[1]! };
  };

  it("damage to one chosen player: the other loses that much life (not damage)", () => {
    supported(sower);
    const { s: s0, ap, opp, sowerId, boltId } = entered((ap) => ap, (_, opp) => opp);
    expect(s0.objects[sowerId]!.chosen?.players).toEqual([ap, opp]);
    const s = passToPending(run(s0, planCast(s0, ap, boltId, [{ kind: "player", id: ap }])));
    expect(s.players[ap]!.life).toBe(37);
    expect(s.players[opp]!.life).toBe(37);
  });

  it("damage to a player who wasn't chosen does nothing", () => {
    const { s: s0, ap, opp, boltId } = entered((_, opp) => opp, (ap, opp) => [0, 1, 2, 3].find((p) => p !== ap && p !== opp)!);
    const s = passToPending(run(s0, planCast(s0, ap, boltId, [{ kind: "player", id: ap }])));
    expect(s.players[ap]!.life).toBe(37);
    expect(s.players[opp]!.life).toBe(40);
  });
});

describe("Bumi, Unleashed: an additional combat phase only land creatures can attack in", () => {
  const bumi = card("Bumi, Unleashed", "Legendary Creature — Human Noble Ally", "{3}{R}{G}", { power: "5", toughness: "4", keywords: ["Trample", "Earthbend"], oracleText: "Trample\nWhen Bumi enters, earthbend 4. (Target land you control becomes a 0/0 creature with haste that's still a land. Put four +1/+1 counters on it. When it dies or is exiled, return it to the battlefield tapped.)\nWhenever Bumi deals combat damage to a player, untap all lands you control. After this phase, there is an additional combat phase. Only land creatures can attack during that combat phase." });
  const arbor = card("Test Arbor", "Land Creature — Forest Dryad", "", { power: "1", toughness: "1" });

  it("after Bumi's damage, lands untap and only the land creature can attack in the added combat; the rule ends with the turn", () => {
    supported(bumi);
    const { s: s0, ap } = setup([]);
    const b = putOnBattlefield(s0, ap, bumi);
    const a = putOnBattlefield(s0, ap, arbor);
    const land = putOnBattlefield(s0, ap, forest);
    s0.objects[land]!.tapped = true;
    const opp = nextOf(s0, ap);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    for (let i = 0; i < 60 && !(s.pending?.kind === "declareAttackers" && s.step === "declareAttackers"); i++) s = s.pending ? run(s, botActions(s, s.pending.player).slice(0, 1)) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[opp]!.life).toBe(35);
    expect(s.objects[land]!.tapped).toBe(false);
    expect(s.objects[b]!.tapped).toBe(true);
    s.objects[b]!.tapped = false;
    const ids = potentialAttackers(s, ap).map((o) => o.id);
    expect(ids).toContain(a);
    expect(ids).not.toContain(b);
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] })).toThrow();
    s = act(s, { type: "declareAttackers", player: ap, attacks: [] });
    expect(s.combatAttackOnly).toBeDefined();
    s = passUntil(s, "upkeep", nextOf(s, ap));
    expect(s.combatAttackOnly).toBeUndefined();
  });
});

describe("Detection Tower, Glaring Spotlight: targeting as though they didn't have hexproof", () => {
  const tower = card("Detection Tower", "Land", "", { oracleText: "{T}: Add {C}.\n{1}, {T}: Until end of turn, your opponents and creatures your opponents control with hexproof can be the targets of spells and abilities you control as though they didn't have hexproof." });
  const spotlight = card("Glaring Spotlight", "Artifact", "{1}", { oracleText: "Creatures your opponents control with hexproof can be the targets of spells and abilities you control as though they didn't have hexproof.\n{3}, Sacrifice this artifact: Creatures you control gain hexproof until end of turn and can't be blocked this turn." });
  const leyline = card("Leyline of Sanctity", "Enchantment", "{2}{W}{W}", { oracleText: "You have hexproof." });
  const troll = card("Test Troll", "Creature — Troll", "{2}{G}", { power: "3", toughness: "3", keywords: ["Hexproof"], oracleText: "Hexproof" });
  const bolt = card("Test Bolt", "Instant", "{R}", { oracleText: "Test Bolt deals 3 damage to any target." });
  const scene = () => {
    const { s, ap, ids } = setup([bolt]);
    const opp = nextOf(s, ap);
    putOnBattlefield(s, opp, leyline);
    const t = putOnBattlefield(s, opp, troll);
    addMana(s, ap, ["R"]);
    return { s, ap, opp, t, boltId: ids[0]! };
  };
  const canTarget = (s: GameState, ap: PlayerId, id: string, t: TargetChoice) => {
    try {
      return !!planCast(s, ap, id, [t]);
    } catch {
      return false;
    }
  };

  it("Detection Tower: this turn, the opponent and their hexproof creature can be targeted", () => {
    supported(tower, spotlight);
    const { s: s0, ap, opp, t, boltId } = scene();
    expect(canTarget(s0, ap, boltId, { kind: "player", id: opp })).toBe(false);
    expect(canTarget(s0, ap, boltId, target(t))).toBe(false);
    const tw = putOnBattlefield(s0, ap, tower);
    addMana(s0, ap, ["C"]);
    const s = passToPending(run(s0, planActivate(s0, ap, tw, 0)));
    addMana(s, ap, ["R"]);
    expect(canTarget(s, ap, boltId, { kind: "player", id: opp })).toBe(true);
    expect(canTarget(s, ap, boltId, target(t))).toBe(true);
    // Only for its controller's spells and abilities.
    expect(s.turnRules?.some((r) => r.player === opp && r.rule === "seeHexproof")).toBe(false);
  });

  it("Glaring Spotlight: the creature, not the player", () => {
    const { s, ap, opp, t, boltId } = scene();
    putOnBattlefield(s, ap, spotlight);
    expect(canTarget(s, ap, boltId, target(t))).toBe(true);
    expect(canTarget(s, ap, boltId, { kind: "player", id: opp })).toBe(false);
  });
});

describe("Rashmi, Eternities Crafter: the first spell each turn reveals the top card, cast free if its mana value is lesser", () => {
  const rashmi = card("Rashmi, Eternities Crafter", "Legendary Creature — Elf Druid", "{2}{G}{U}", { power: "2", toughness: "3", oracleText: "Whenever you cast your first spell each turn, reveal the top card of your library. You may cast it without paying its mana cost if it's a spell with lesser mana value. If you don't cast it, put it into your hand." });
  const big = card("Test Sorcery", "Sorcery", "{3}{U}", { oracleText: "Draw two cards." });
  const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3" });
  const giant = card("Test Giant", "Creature — Giant", "{4}{R}", { power: "5", toughness: "5" });
  /** Rashmi out, our sorcery cast with `top` on top of the library; to the trigger's question. */
  const revealed = (top: CardDef) => {
    const { s: s0, ap, ids } = setup([big]);
    onlyInHand(s0, ap, ids);
    putOnBattlefield(s0, ap, rashmi);
    const t = putOnBattlefield(s0, ap, top);
    s0.battlefield.splice(s0.battlefield.indexOf(t), 1);
    s0.objects[t]!.zone = "library";
    s0.players[ap]!.library.unshift(t);
    addMana(s0, ap, ["U", "C", "C", "C"]);
    const s = passToPending(run(s0, planCast(s0, ap, ids[0]!)));
    return { s, ap, t, sorc: ids[0]! };
  };

  it("lesser mana value: it may be cast free, before the spell that triggered it resolves", () => {
    supported(rashmi);
    const { s: s0, ap, t, sorc } = revealed(ogre);
    expect(s0.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong", options: [t, "none"] });
    let s = act(s0, { type: "chooseOption", player: ap, choice: t });
    for (let i = 0; i < 3 && s.pending; i++) s = run(s, botActions(s, ap).slice(0, 1));
    expect(s.stack.map((x) => x.objectId)).toEqual([sorc, t]);
  });

  it("declined, it goes to the hand", () => {
    const { s: s0, ap, t } = revealed(ogre);
    const s = act(s0, { type: "chooseOption", player: ap, choice: "none" });
    expect(s.objects[t]!.zone).toBe("hand");
  });

  it("an equal or greater mana value, or a land: straight to the hand", () => {
    for (const top of [giant, forest, card("Test Four", "Creature — Ogre", "{3}{R}", { power: "4", toughness: "4" })]) {
      const { s, t } = revealed(top);
      expect(s.pending).toBeFalsy();
      expect(s.objects[t]!.zone).toBe("hand");
    }
  });
});

describe("Communal Brewing: creature spells enter with X more +1/+1 counters, X its ingredient counters", () => {
  const brewing = card("Communal Brewing", "Enchantment", "{2}{G}", { oracleText: "When this enchantment enters, any number of target opponents each draw a card. Put an ingredient counter on this enchantment, then put an ingredient counter on it for each card drawn this way.\nWhenever you cast a creature spell, that creature enters with X additional +1/+1 counters on it, where X is the number of ingredient counters on this enchantment." });

  it("three ingredient counters: the creature enters with three +1/+1 counters", () => {
    supported(brewing);
    const { s: s0, ap, ids } = setup([bear()]);
    onlyInHand(s0, ap, ids);
    const b = putOnBattlefield(s0, ap, brewing);
    s0.objects[b]!.counters.ingredient = 3;
    addMana(s0, ap, ["G", "C"]);
    let s = passToPending(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(3);
    // Gone before the trigger resolves: its last known counters (rulings).
    const { s: t0, ap: p2, ids: ids2 } = setup([bear()]);
    onlyInHand(t0, p2, ids2);
    const b2 = putOnBattlefield(t0, p2, brewing);
    t0.objects[b2]!.counters.ingredient = 2;
    addMana(t0, p2, ["G", "C"]);
    s = run(t0, planCast(t0, p2, ids2[0]!));
    moveObject(s, b2, "graveyard");
    s = passToPending(s);
    expect(s.objects[ids2[0]!]!.counters["+1/+1"] ?? 0).toBe(2);
  });

  it("as it enters, two target opponents draw: three ingredient counters", () => {
    const { s: s0, ap, ids } = setup([brewing]);
    onlyInHand(s0, ap, ids);
    addMana(s0, ap, ["G", "C", "C"]);
    const [o1, o2] = [nextOf(s0, ap), nextOf(s0, nextOf(s0, ap))];
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 10 && !s.pending && s.objects[ids[0]!]!.zone !== "battlefield"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("chooseTargets");
    s = passToPending(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: o1 }, { kind: "player", id: o2 }] }));
    expect(s.objects[ids[0]!]!.counters.ingredient).toBe(3);
  });
});

describe("Rose Room Treasurer: a Treasure the first two times each turn, then pay {X} for X damage", () => {
  const rose = card("Rose Room Treasurer", "Creature — Human Noble", "{1}{R}", { power: "2", toughness: "2", oracleText: "Alliance — Whenever another creature you control enters, create a Treasure token if this is the first or second time this ability has resolved this turn. Otherwise, you may pay {X}. When you do, this creature deals X damage to any target." });

  it("two Treasures, then the third time X damage to a target", () => {
    supported(rose);
    const { s: s0, ap, ids } = setup([bear(), bear({ name: "Bear Two" }), bear({ name: "Bear Three" })]);
    onlyInHand(s0, ap, ids);
    putOnBattlefield(s0, ap, rose);
    const opp = nextOf(s0, ap);
    addMana(s0, ap, ["G", "G", "G", "C", "C", "C", "C", "C"]);
    let s = s0;
    for (const id of ids.slice(0, 2)) s = passToPending(run(s, planCast(s, ap, id)));
    const treasures = () => s.battlefield.filter((x) => characteristics(s, s.objects[x]!).subtypes.includes("Treasure"));
    expect(treasures()).toHaveLength(2);
    s = passToPending(run(s, planCast(s, ap, ids[2]!)));
    expect(treasures()).toHaveLength(2);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "payX" });
    s = act(s, { type: "chooseOption", player: ap, choice: "2" });
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = passToPending(s);
    expect(s.pending?.kind).toBe("chooseTargets");
    s = passToPending(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.players[opp]!.life).toBe(38);
  });
});

describe("Sphinx's Tutelage: mill two, again while two nonland cards share a color", () => {
  const tutelage = card("Sphinx's Tutelage", "Enchantment", "{2}{U}", { oracleText: "Whenever you draw a card, target opponent mills two cards. If two nonland cards that share a color were milled this way, repeat this process.\n{5}{U}: Draw a card, then discard a card." });
  const red = (n: string) => card(n, "Instant", "{R}", { oracleText: "Draw a card." });
  const azorius = card("Test Azorius", "Instant", "{W}{U}", { oracleText: "Draw a card." });
  const blue = card("Test Blue", "Instant", "{U}", { oracleText: "Draw a card." });
  const relic = card("Test Relic", "Artifact", "{1}", { oracleText: "" });

  /** The opponent's library from the top: `top`; then our draw step's trigger, targeting them. */
  const milled = (top: CardDef[]) => {
    const { s: s00, ap } = setup([]);
    putOnBattlefield(s00, ap, tutelage);
    const opp = nextOf(s00, ap);
    // Our next upkeep, before our draw.
    const s0 = passUntil(passUntil(s00, "upkeep", opp), "upkeep", ap);
    const ids = top.map((d) => {
      const id = putOnBattlefield(s0, opp, d);
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      s0.objects[id]!.zone = "library";
      return id;
    });
    s0.players[opp]!.library.unshift(...ids);
    let s = passUntil(s0, "draw", ap);
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] });
    s = passToPending(s);
    return { s, ids };
  };

  it("two red cards, then a red and a white-blue: it stops after the second pair", () => {
    supported(tutelage);
    const { s, ids } = milled([red("Red One"), red("Red Two"), red("Red Three"), azorius, blue, blue]);
    expect(ids.map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "graveyard", "graveyard", "library", "library"]);
  });

  it("a land or a colorless card stops it", () => {
    for (const second of [forest, relic]) {
      const { s, ids } = milled([red("Red One"), second, red("Red Two"), red("Red Three")]);
      expect(ids.map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "library", "library"]);
    }
  });
});
