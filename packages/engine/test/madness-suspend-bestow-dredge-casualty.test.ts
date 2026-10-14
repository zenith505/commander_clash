// Madness (CR 702.35), suspend (CR 702.62), bestow (CR 702.103), dredge (CR 702.52), casualty (CR 702.153).

import { describe, expect, it } from "vitest";
import { act, addEffect, bear, card, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import {
  botActions,
  castProblem,
  characteristics,
  isFullySupported,
  legalActions,
  objHasKeyword,
  planCast,
  planSuspend,
  spellTargets,
  suspendProblem,
  waitingOn,
  type Action,
  type CardDef,
  type GameState,
  type PlayerId,
} from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, actions: Action[] | null) => {
  if (!actions) throw new Error("no plan");
  return actions.reduce((x, a) => act(x, a), s);
};
const castNow = (s: GameState, pid: PlayerId, id: string, targets?: Parameters<typeof planCast>[3], choices?: Parameters<typeof planCast>[7]) =>
  run(s, planCast(s, pid, id, targets, undefined, "auto", undefined, choices));
/** Put a card into a zone of `pid`'s (hand, graveyard, library top). */
const toZone = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  return id;
};
const nameOf = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;

// Real oracle text (Scryfall), with the keywords Scryfall lists.
const fieryTemper = card("Fiery Temper", "Instant", "{1}{R}{R}", { keywords: ["Madness"], oracleText: "Fiery Temper deals 3 damage to any target.\nMadness {R} (If you discard this card, discard it into exile. When you do, cast it for its madness cost or put it into your graveyard.)" });
const kitchenImp = card("Kitchen Imp", "Creature — Imp", "{3}{B}", { power: "2", toughness: "2", keywords: ["Flying", "Madness", "Haste"], oracleText: "Flying, haste\nMadness {B} (If you discard this card, discard it into exile. When you do, cast it for its madness cost or put it into your graveyard.)" });
const carefulStudy = card("Careful Study", "Sorcery", "{U}", { oracleText: "Draw two cards, then discard two cards." });
const mindRot = card("Mind Rot", "Sorcery", "{2}{B}", { oracleText: "Target player discards two cards." });
const riftBolt = card("Rift Bolt", "Sorcery", "{2}{R}", { keywords: ["Suspend"], oracleText: "Rift Bolt deals 3 damage to any target.\nSuspend 1—{R} (Rather than cast this card from your hand, you may pay {R} and exile it with a time counter on it. At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost.)" });
const ephemeron = card("Errant Ephemeron", "Creature — Illusion", "{6}{U}", { power: "4", toughness: "4", keywords: ["Flying", "Suspend"], oracleText: "Flying\nSuspend 4—{1}{U} (Rather than cast this card from your hand, you may pay {1}{U} and exile it with four time counters on it. At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost. It has haste.)" });
const lotusBloom = card("Lotus Bloom", "Artifact", "", { keywords: ["Suspend"], oracleText: "Suspend 3—{0} (Rather than cast this card from your hand, pay {0} and exile it with three time counters on it. At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost.)\n{T}, Sacrifice this artifact: Add three mana of any one color." });
const boonSatyr = card("Boon Satyr", "Enchantment Creature — Satyr", "{1}{G}{G}", { power: "4", toughness: "2", keywords: ["Bestow", "Flash"], oracleText: "Flash\nBestow {3}{G}{G} (If you cast this card for its bestow cost, it's an Aura spell with enchant creature. It becomes a creature again if it's not attached.)\nEnchanted creature gets +4/+2." });
const nyxbornWolf = card("Nyxborn Wolf", "Enchantment Creature — Wolf", "{2}{G}", { power: "3", toughness: "1", keywords: ["Bestow"], oracleText: "Bestow {4}{G} (If you cast this card for its bestow cost, it's an Aura spell with enchant creature. It becomes a creature again if it's not attached.)\nEnchanted creature gets +3/+1." });
const golgariThug = card("Golgari Thug", "Creature — Human Warrior", "{1}{B}", { power: "1", toughness: "1", keywords: ["Dredge", "Mill"], oracleText: "When this creature dies, put target creature card from your graveyard on top of your library.\nDredge 4 (If you would draw a card, you may mill four cards instead. If you do, return this card from your graveyard to your hand.)" });
const dakmorSalvage = card("Dakmor Salvage", "Land", "", { keywords: ["Dredge", "Mill"], oracleText: "This land enters tapped.\n{T}: Add {B}.\nDredge 2 (If you would draw a card, you may mill two cards instead. If you do, return this card from your graveyard to your hand.)" });
const arcBlade = card("Arc Blade", "Sorcery", "{3}{R}{R}", { keywords: ["Suspend"], oracleText: "Arc Blade deals 2 damage to any target. Exile Arc Blade with three time counters on it.\nSuspend 3—{2}{R} (Rather than cast this card from your hand, you may pay {2}{R} and exile it with three time counters on it. At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost.)" });
const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });
const lightEmUp = card("Light 'Em Up", "Sorcery", "{1}{R}", { keywords: ["Casualty"], oracleText: "Casualty 2 (As you cast this spell, you may sacrifice a creature with power 2 or greater. When you do, copy this spell and you may choose a new target for the copy.)\nLight 'Em Up deals 2 damage to target creature or planeswalker." });
const joinTheMaestros = card("Join the Maestros", "Sorcery", "{4}{B}", { keywords: ["Casualty"], oracleText: "Casualty 2 (As you cast this spell, you may sacrifice a creature with power 2 or greater. When you do, copy this spell.)\nCreate a 4/3 black Ogre Warrior creature token." });
const swords = card("Swords to Plowshares", "Instant", "{W}", { oracleText: "Exile target creature. Its controller gains life equal to its power." });
const actOfTreason = card("Act of Treason", "Sorcery", "{2}{R}", { oracleText: "Gain control of target creature until end of turn. Untap that creature. It gains haste until end of turn. (It can attack and {T} this turn.)" });

describe("madness", () => {
  it("exiles a discarded card with madness; its owner may cast it for its madness cost as the trigger resolves (CR 702.35a)", () => {
    supported(fieryTemper, carefulStudy);
    const { s: s0, ap, ids, opp } = setup([carefulStudy, fieryTemper]);
    const [study, temper] = ids as [string, string];
    let s = settle(castNow(s0, ap, study));
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, count: 2 });
    const other = s.players[ap]!.hand.find((id) => id !== temper)!;
    s = act(s, { type: "discard", player: ap, objectIds: [temper, other] });
    // Discarded into exile; the other card went to the graveyard as usual.
    expect(s.objects[temper]!.zone).toBe("exile");
    expect(s.objects[other]!.zone).toBe("graveyard");
    expect(s.stack.at(-1)?.description).toMatch(/Madness \{R\}/);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: temper, how: "madness" });
    // Mana abilities can be activated to pay for it; the madness cost {R} is what's paid, not {1}{R}{R}.
    const lands = s.battlefield.filter((id) => s.objects[id]!.controller === ap && !s.objects[id]!.tapped).length;
    const plan = planCast(s, ap, temper, [{ kind: "player", id: opp }]);
    expect(plan?.filter((a) => a.type === "activateMana")).toHaveLength(1);
    s = run(s, plan);
    expect(s.objects[temper]!.zone).toBe("stack");
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && !s.objects[id]!.tapped).length).toBe(lands - 1);
    const life = s.players[opp]!.life;
    s = settle(s);
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.objects[temper]!.zone).toBe("graveyard");
  });

  it("puts the card into the graveyard if its owner doesn't cast it", () => {
    const { s: s0, ap, ids, opp } = setup([fieryTemper]);
    const temper = ids[0]!;
    const rot = toZone(s0, opp, mindRot, "hand");
    for (const l of ["Swamp", "Swamp", "Swamp"]) putOnBattlefield(s0, opp, card(l, "Basic Land — Swamp"));
    s0.activePlayer = opp;
    s0.priority = opp;
    let s = settle(castNow(s0, opp, rot, [{ kind: "player", id: ap }]));
    if (s.pending?.kind === "discard") s = act(s, { type: "discard", player: ap, objectIds: [temper, s.players[ap]!.hand.find((x) => x !== temper)!] });
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "castFree", how: "madness" });
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    expect(s.objects[temper]!.zone).toBe("graveyard");
  });

  it("casts a creature for its madness cost on another player's turn, ignoring its timing (rulings)", () => {
    supported(kitchenImp);
    const { s: s0, ap, opp } = setup([]);
    const imp = toZone(s0, opp, kitchenImp, "hand");
    putOnBattlefield(s0, opp, card("Swamp", "Basic Land — Swamp"));
    const rot = toZone(s0, ap, mindRot, "hand");
    let s = settle(castNow(s0, ap, rot, [{ kind: "player", id: opp }]));
    if (s.pending?.kind === "discard") s = act(s, { type: "discard", player: opp, objectIds: [imp, s.players[opp]!.hand.find((x) => x !== imp)!] });
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "castFree", player: opp, objectId: imp });
    // The bot casts it: a 2/2 flyer for {B} beats a card in the graveyard.
    s = run(s, botActions(s, opp));
    s = settle(s);
    expect(s.objects[imp]!.zone).toBe("battlefield");
    expect(s.objects[imp]!.controller).toBe(opp);
  });

  it("discarding down to hand size: the trigger gets priority in cleanup, then there's another cleanup step (CR 514.3a)", () => {
    const { s: s0, ap } = setup([fieryTemper]);
    const temper = s0.players[ap]!.hand.at(-1)!;
    for (const id of s0.players[ap]!.hand.filter((x) => x !== temper)) {
      s0.objects[id]!.zone = "library";
      s0.players[ap]!.library.push(id);
    }
    s0.players[ap]!.hand = [temper];
    for (let i = 0; i < 8; i++) toZone(s0, ap, bear(), "hand");
    let s = passUntil(s0, "cleanup", ap);
    expect(s.pending).toMatchObject({ kind: "discardToHandSize", player: ap, count: 2 });
    const turn = s.turn;
    s = act(s, { type: "discard", player: ap, objectIds: [temper, s.players[ap]!.hand.find((x) => x !== temper)!] });
    expect(s.step).toBe("cleanup");
    expect(s.turn).toBe(turn);
    expect(s.stack.at(-1)?.description).toMatch(/Madness/);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "castFree", how: "madness" });
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    s = settle(s);
    for (let i = 0; i < 10 && s.turn === turn; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.turn).toBe(turn + 1);
    expect(s.objects[temper]!.zone).toBe("graveyard");
  });
});

describe("suspend", () => {
  it("exiles a card with time counters as a special action; the upkeep removes them and the last one lets you cast it free (CR 702.62a)", () => {
    supported(riftBolt);
    const { s: s0, ap, ids, opp } = setup([riftBolt]);
    const bolt = ids[0]!;
    expect(suspendProblem(s0, ap, bolt)).toMatch(/not enough mana/);
    expect(legalActions(s0, ap).some((a) => a.type === "suspend")).toBe(false);
    let s = run(s0, planSuspend(s0, ap, bolt));
    expect(s.objects[bolt]!.zone).toBe("exile");
    expect(s.objects[bolt]!.counters.time).toBe(1);
    expect(s.stack).toHaveLength(0); // it doesn't use the stack
    expect(s.priority).toBe(ap);
    // The next upkeep of its owner.
    s = passUntil(s, "upkeep", ap);
    s = passUntil(act(s, { type: "passPriority", player: ap }), "upkeep", ap);
    expect(s.stack.at(-1)?.description).toMatch(/remove a time counter/);
    s = settle(s);
    expect(s.objects[bolt]!.counters.time).toBeUndefined();
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: bolt, how: "suspend" });
    const life = s.players[opp]!.life;
    s = run(s, planCast(s, ap, bolt, [{ kind: "player", id: opp }]));
    s = settle(s);
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.objects[bolt]!.zone).toBe("graveyard");
  });

  it("a spell that exiles itself with time counters is suspended again; not if it doesn't resolve (Arc Blade rulings)", () => {
    supported(arcBlade);
    const { s: s0, ap, ids, opp } = setup([arcBlade]);
    const blade = ids[0]!;
    const life = s0.players[opp]!.life;
    let s = settle(castNow(s0, ap, blade, [{ kind: "player", id: opp }]));
    expect(s.players[opp]!.life).toBe(life - 2);
    expect(s.objects[blade]!.zone).toBe("exile");
    expect(s.objects[blade]!.counters.time).toBe(3);
    // Countered by its target being gone: it goes to the graveyard instead.
    const { s: s1, ap: ap1, ids: ids1, opp: opp1 } = setup([arcBlade]);
    const b = putOnBattlefield(s1, opp1, bear());
    s = castNow(s1, ap1, ids1[0]!, [target(b)]);
    s.battlefield.splice(s.battlefield.indexOf(b), 1);
    s.objects[b]!.zone = "graveyard";
    s.objects[b]!.zoneChanges = (s.objects[b]!.zoneChanges ?? 0) + 1;
    s.players[opp1]!.graveyard.push(b);
    s = settle(s);
    expect(s.objects[ids1[0]!]!.zone).toBe("graveyard");
  });

  it("only when you could cast it: a sorcery's suspend waits for your main phase (CR 702.62c)", () => {
    const { s, ap, opp } = setup([]);
    const bolt = toZone(s, opp, riftBolt, "hand");
    putOnBattlefield(s, opp, card("Mountain", "Basic Land — Mountain"));
    expect(suspendProblem(s, opp, bolt)).toMatch(/priority|sorcery/);
    s.priority = opp;
    expect(suspendProblem(s, opp, bolt)).toMatch(/sorcery speed/);
    expect(suspendProblem(s, ap, bolt)).toMatch(/your hand/);
  });

  it("a card with no mana cost can't be cast from hand, but can be suspended (CR 118.6, rulings)", () => {
    supported(lotusBloom);
    const { s: s0, ap, ids } = setup([lotusBloom]);
    const bloom = ids[0]!;
    expect(castProblem(s0, ap, bloom)).toMatch(/no mana cost/);
    expect(planCast(s0, ap, bloom)).toBeNull();
    expect(suspendProblem(s0, ap, bloom)).toBeNull();
    const s = act(s0, { type: "suspend", player: ap, objectId: bloom });
    expect(s.objects[bloom]!.counters.time).toBe(3);
  });

  it("a creature cast with suspend has haste until its caster loses control of it (CR 702.62a)", () => {
    supported(ephemeron);
    const { s: s0, ap, ids, opp } = setup([ephemeron]);
    const eph = ids[0]!;
    let s = run(s0, planSuspend(s0, ap, eph));
    expect(s.objects[eph]!.counters.time).toBe(4);
    s.objects[eph]!.counters.time = 1; // three upkeeps later
    s = passUntil(s, "upkeep", ap);
    s = passUntil(act(s, { type: "passPriority", player: ap }), "upkeep", ap);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "castFree", how: "suspend" });
    s = run(s, botActions(s, ap));
    s = settle(s);
    const o = s.objects[eph]!;
    expect(o.zone).toBe("battlefield");
    expect(objHasKeyword(s, o, "Haste")).toBe(true);
    // Another player takes it: no haste, and none when it comes back either.
    const steal = addEffect(s, opp, [eph], [{ kind: "control" }], "game");
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(characteristics(s, s.objects[eph]!).controller).toBe(opp);
    expect(objHasKeyword(s, s.objects[eph]!, "Haste")).toBe(false);
    s.effects = s.effects.filter((e) => e !== steal && e.id !== steal.id);
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(characteristics(s, s.objects[eph]!).controller).toBe(ap);
    expect(objHasKeyword(s, s.objects[eph]!, "Haste")).toBe(false);
  });

  it("declining the cast leaves the card in exile, no longer suspended", () => {
    const { s: s0, ap, ids } = setup([riftBolt]);
    const bolt = ids[0]!;
    let s = run(s0, planSuspend(s0, ap, bolt));
    s = passUntil(s, "upkeep", ap);
    s = passUntil(act(s, { type: "passPriority", player: ap }), "upkeep", ap);
    s = settle(s);
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    s = settle(s);
    expect(s.objects[bolt]!.zone).toBe("exile");
    expect(s.objects[bolt]!.counters.time).toBeUndefined();
    // No more triggers for it.
    s = passUntil(s, "upkeep", ap);
    s = passUntil(act(s, { type: "passPriority", player: ap }), "upkeep", ap);
    expect(s.stack.some((x) => /time counter/.test(x.description))).toBe(false);
  });
});

describe("bestow", () => {
  it("cast bestowed it's an Aura spell targeting a creature; on the battlefield an Aura, not a creature (CR 702.103a-b)", () => {
    supported(boonSatyr, nyxbornWolf);
    const { s: s0, ap, ids } = setup([boonSatyr]);
    const satyr = ids[0]!;
    const b = putOnBattlefield(s0, ap, bear());
    expect(spellTargets(s0, satyr)).toHaveLength(0);
    expect(spellTargets(s0, satyr, undefined, "bestow")).toHaveLength(1);
    let s = castNow(s0, ap, satyr, [target(b)], { alt: "bestow" });
    const spell = s.objects[satyr]!;
    expect(spell.bestowed).toBe(true);
    expect(s.log.some((e) => /casts Boon Satyr bestowed/.test(e.text))).toBe(true);
    s = settle(s);
    const o = s.objects[satyr]!;
    expect(o.zone).toBe("battlefield");
    expect(o.attachedTo).toBe(b);
    const c = characteristics(s, o);
    expect(c.types).toEqual(["Enchantment"]);
    expect(c.subtypes).toEqual(["Aura"]); // the Satyr type goes with the creature type (CR 205.1a)
    expect(pt(s, b)).toBe("6/4");
  });

  it("becomes an enchantment creature when the creature it enchants leaves (CR 702.103f)", () => {
    const { s: s0, ap, ids } = setup([nyxbornWolf, swords]);
    const [wolf, kill] = ids as [string, string];
    const b = putOnBattlefield(s0, ap, bear());
    let s = settle(castNow(s0, ap, wolf, [target(b)], { alt: "bestow" }));
    expect(pt(s, b)).toBe("5/3");
    s = settle(castNow(s, ap, kill, [target(b)]));
    expect(s.objects[b]!.zone).toBe("exile");
    const o = s.objects[wolf]!;
    expect(o.zone).toBe("battlefield");
    expect(o.attachedTo).toBeUndefined();
    expect(o.bestowed).toBeUndefined();
    expect(characteristics(s, o).types).toEqual(["Enchantment", "Creature"]);
    expect(pt(s, wolf)).toBe("3/1");
    // It's been under its controller's control since the turn began? No: it entered this turn, so it's summoning sick.
  });

  it("resolves as a creature if its target is gone (CR 702.103e, 608.3b)", () => {
    const { s: s0, ap, ids, opp } = setup([nyxbornWolf]);
    const wolf = ids[0]!;
    const b = putOnBattlefield(s0, opp, bear());
    let s = castNow(s0, ap, wolf, [target(b)], { alt: "bestow" });
    // The target leaves before it resolves.
    s.battlefield.splice(s.battlefield.indexOf(b), 1);
    s.objects[b]!.zone = "graveyard";
    s.objects[b]!.zoneChanges = (s.objects[b]!.zoneChanges ?? 0) + 1;
    s.players[opp]!.graveyard.push(b);
    s = settle(s);
    const o = s.objects[wolf]!;
    expect(o.zone).toBe("battlefield");
    expect(o.bestowed).toBeUndefined();
    expect(characteristics(s, o).types).toContain("Creature");
    expect(pt(s, wolf)).toBe("3/1");
  });

  it("pays the bestow cost; cast normally it's a creature", () => {
    const { s: s0, ap, ids } = setup([nyxbornWolf, nyxbornWolf]);
    const b = putOnBattlefield(s0, ap, bear());
    const untapped = (s: GameState) => s.battlefield.filter((id) => s.objects[id]!.controller === ap && !s.objects[id]!.tapped && s.cards[s.objects[id]!.cardId]!.types.includes("Land")).length;
    const before = untapped(s0);
    let s = settle(castNow(s0, ap, ids[0]!, [target(b)], { alt: "bestow" }));
    expect(before - untapped(s)).toBe(5);
    s = settle(castNow(s, ap, ids[1]!));
    expect(before - untapped(s)).toBe(8);
    expect(characteristics(s, s.objects[ids[1]!]!).types).toContain("Creature");
  });

  it("the bot bestows on its own creature when it can afford it", () => {
    const { s: s0, ap, ids } = setup([boonSatyr]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = s0;
    let cast: Action | undefined;
    for (let i = 0; i < 5 && !cast; i++) {
      const plan = botActions(s, ap);
      cast = plan.find((a) => a.type === "castSpell");
      if (!cast) s = run(s, plan); // e.g. the land drop comes first
    }
    expect(cast).toMatchObject({ objectId: ids[0], alt: "bestow", targets: [target(b)] });
  });
});

describe("dredge", () => {
  it("replaces the draw step's draw: mill N and return the card to hand instead (CR 702.52a)", () => {
    supported(golgariThug, dakmorSalvage);
    const { s: s0, ap } = setup([]);
    const thug = toZone(s0, ap, golgariThug, "graveyard");
    let s = passUntil(s0, "upkeep", ap);
    s = passUntil(act(s, { type: "passPriority", player: ap }), "upkeep", ap);
    const lib = s.players[ap]!.library.length;
    const hand = s.players[ap]!.hand.length;
    for (let i = 0; i < 4 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.step).toBe("draw");
    expect(s.pending).toMatchObject({ kind: "dredge", player: ap, options: [thug], left: 1 });
    s = act(s, { type: "dredge", player: ap, objectId: thug });
    expect(s.objects[thug]!.zone).toBe("hand");
    expect(s.players[ap]!.library.length).toBe(lib - 4);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.players[ap]!.draws?.turn === s.turn ? s.players[ap]!.draws.n : 0).toBe(0); // not a draw
    expect(s.pending).toBeNull();
    expect(s.priority).toBe(ap);
  });

  it("each draw of several is replaced separately; drawing normally is fine too", () => {
    const { s: s0, ap, ids } = setup([divination]);
    const thug = toZone(s0, ap, golgariThug, "graveyard");
    const lib = s0.players[ap]!.library.length;
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "dredge", left: 2 });
    s = act(s, { type: "dredge", player: ap, objectId: thug });
    // The Thug is in hand now; nothing else can dredge, so the second draw just happens.
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.library.length).toBe(lib - 5);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    // With the Thug back in the graveyard: draw normally.
    s.players[ap]!.hand.splice(s.players[ap]!.hand.indexOf(thug), 1);
    s.objects[thug]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(thug);
    const div2 = toZone(s, ap, divination, "hand");
    s = settle(castNow(s, ap, div2));
    expect(s.pending).toMatchObject({ kind: "dredge", left: 2 });
    s = act(s, { type: "dredge", player: ap });
    expect(s.pending).toMatchObject({ kind: "dredge", left: 1 });
    s = act(s, { type: "dredge", player: ap });
    expect(s.objects[thug]!.zone).toBe("graveyard");
    expect(s.players[ap]!.library.length).toBe(lib - 7);
  });

  it("can't dredge with fewer cards in the library than N (CR 702.52b)", () => {
    const { s: s0, ap, ids } = setup([divination]);
    toZone(s0, ap, golgariThug, "graveyard");
    const salvage = toZone(s0, ap, dakmorSalvage, "graveyard");
    s0.players[ap]!.library = s0.players[ap]!.library.slice(0, 3);
    const s = settle(castNow(s0, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "dredge", options: [salvage] });
  });
});

describe("casualty", () => {
  it("sacrificing a creature with enough power copies the spell, with new targets (CR 702.153a)", () => {
    supported(lightEmUp, joinTheMaestros);
    const { s: s0, ap, ids, opp } = setup([lightEmUp]);
    const spell = ids[0]!;
    const big = putOnBattlefield(s0, ap, bear());
    const small = putOnBattlefield(s0, ap, card("Elf", "Creature — Elf", "{G}", { power: "1", toughness: "1" }));
    const [x, y] = [putOnBattlefield(s0, opp, bear()), putOnBattlefield(s0, opp, bear())];
    expect(castProblem(s0, ap, spell, [target(x)], undefined, undefined, undefined, undefined, { casualty: small })).toMatch(/power 2 or greater/);
    let s = castNow(s0, ap, spell, [target(x)], { casualty: big });
    expect(s.objects[big]!.zone).toBe("graveyard");
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "copyTargets" });
    s = act(s, { type: "copyTargets", player: ap, targets: [target(y)] });
    s = settle(s);
    expect(s.objects[x]!.zone).toBe("graveyard");
    expect(s.objects[y]!.zone).toBe("graveyard");
  });

  it("no copy without the sacrifice", () => {
    const { s: s0, ap, ids } = setup([joinTheMaestros]);
    let s = settle(castNow(s0, ap, ids[0]!));
    const ogres = s.battlefield.filter((id) => nameOf(s, id).startsWith("Ogre Warrior"));
    expect(ogres).toHaveLength(1);
    const { s: s1, ap: ap1, ids: ids1 } = setup([joinTheMaestros]);
    const b = putOnBattlefield(s1, ap1, bear());
    s = settle(castNow(s1, ap1, ids1[0]!, undefined, { casualty: b }));
    expect(s.battlefield.filter((id) => nameOf(s, id).startsWith("Ogre Warrior"))).toHaveLength(2);
  });
});
