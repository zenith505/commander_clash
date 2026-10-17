// Delayed triggered abilities with a stated duration (CR 603.7b): "until end of turn, whenever ...", "until the end of
// your next turn, whenever ...". They trigger each time until then; their source is the spell or the source of the
// ability that made them and their controller who controlled that (603.7d-e); one about "~" is about that object only
// (603.7c); "triggers an additional time" doesn't apply to them (603.2d).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, mountain, passAll, passUntil, putOnBattlefield, setup, swamp, target } from "./helpers";
import { compileCard, isFullySupported, moveObject, planActivate, planCast, waitingOn, type CardDef, type Effect, type GameState } from "../src";

// Real oracle text (Scryfall).
const bold = card("Season of the Bold", "Sorcery", "{3}{R}{R}", { oracleText: "Choose up to five {P} worth of modes. You may choose the same mode more than once.\n{P} — Create a tapped Treasure token.\n{P}{P} — Exile the top two cards of your library. Until the end of your next turn, you may play them.\n{P}{P}{P} — Until the end of your next turn, whenever you cast a spell, Season of the Bold deals 2 damage to up to one target creature." });
const mirari = card("The Mirari Conjecture", "Enchantment — Saga", "{4}{U}", { oracleText: "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Return target instant card from your graveyard to your hand.\nII — Return target sorcery card from your graveyard to your hand.\nIII — Until end of turn, whenever you cast an instant or sorcery spell, copy it. You may choose new targets for the copy." });
const titan = card("Mountain Titan", "Creature — Giant", "{2}{B}{R}", { power: "2", toughness: "2", oracleText: "{1}{R}{R}: Until end of turn, whenever you cast a black spell, put a +1/+1 counter on Mountain Titan." });
const thrinax = card("Infested Thrinax", "Creature — Insect Beast", "{4}{G}", { power: "3", toughness: "4", oracleText: "When this creature enters, until end of turn, whenever a nontoken creature you control dies, create a number of 1/1 green Saproling creature tokens equal to that creature's power." });
const lyra = card("Lyra, Tolarian Archangel", "Legendary Creature — Angel", "{3}{W}{U}", { power: "3", toughness: "3", keywords: ["Flying"], oracleText: "Flying\n{3}{U}{U}: Until end of turn, whenever Lyra deals combat damage to a player, draw two cards." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const whisper = card("Night's Whisper", "Sorcery", "{1}{B}", { oracleText: "You draw two cards and you lose 2 life." });
const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });
const quick = card("Ancestral Recall", "Instant", "{U}", { oracleText: "Target player draws three cards." });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
/** Everyone passes until the stack is empty. */
const settle = (s: GameState) => {
  for (let i = 0; i < 20 && s.stack.length; i++) s = s.pending?.kind === "copyTargets" ? act(s, { type: "copyTargets", player: s.pending.player }) : passAll(s);
  return s;
};
const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  if (!plan) throw new Error("can't do that");
  for (const a of plan) s = act(s, a);
  return s;
};

describe("delayed triggers with a duration (CR 603.7b)", () => {
  it("compiles them", () => {
    supported(bold, mirari, titan, thrinax, lyra);
    const e = compileCard(bold).spell!.modal!.modes[2]!.effects[0]!;
    expect(e).toMatchObject({ type: "floatingTrigger", until: "endOfYourNextTurn", trigger: { event: "castSpell" } });
    expect(compileCard(bold).spell!.modal!.modes[2]!.targets).toEqual([]); // targets are chosen as it triggers (rulings)
  });

  it("Season of the Bold: each spell you cast until the end of your next turn deals 2 damage to up to one target creature", () => {
    let { s, ap, opp, ids } = setup([bold, divination]);
    const theirs = putOnBattlefield(s, opp, bear({ name: "Big Bear", power: "4", toughness: "4" }));
    s = cast(s, ap, ids[0]!, undefined, [2]);
    expect(s.floatingTriggers).toHaveLength(1);
    // Casting Divination triggers it; the target is chosen as it goes on the stack.
    s = run(s, planCast(s, ap, ids[1]!));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = act(s, { type: "chooseTargets", player: ap, targets: [target(theirs)] });
    // It resolves before the spell that caused it to trigger (rulings).
    expect(s.stack.length).toBe(2);
    s = passAll(s);
    expect(s.objects[theirs]!.damage).toBe(2);
    // An opponent's turn, then ours again: still there until our next turn's cleanup.
    s = passAll(s);
    s = passUntil(s, "main1", opp);
    expect(s.floatingTriggers).toHaveLength(1);
    s = passUntil(s, "main1", ap);
    expect(s.floatingTriggers).toHaveLength(1);
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    expect(s.floatingTriggers).toBeUndefined();
  });

  it("an opponent's spells don't trigger it", () => {
    let { s, ap, opp, ids } = setup([bold, divination]);
    putOnBattlefield(s, opp, mountain);
    const o = putOnBattlefield(s, opp, shock);
    s.battlefield.splice(s.battlefield.indexOf(o), 1);
    s.objects[o]!.zone = "hand";
    s.players[opp]!.hand.push(o);
    s = cast(s, ap, ids[0]!, undefined, [2]);
    s = run(s, planCast(s, ap, ids[1]!));
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "none" }] });
    // In response, the opponent casts Shock: only the spell goes on the stack.
    while (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const before = s.stack.length;
    s = run(s, planCast(s, opp, o, [{ kind: "player", id: ap }]));
    expect(s.stack.length).toBe(before + 1);
    expect(s.pending).toBeNull();
    expect(s.triggerQueue).toHaveLength(0);
  });

  it("Mountain Titan: until end of turn, a counter for each black spell; it ends in the cleanup step", () => {
    let { s, ap, ids } = setup([whisper, whisper]);
    const t = putOnBattlefield(s, ap, titan);
    for (let i = 0; i < 3; i++) putOnBattlefield(s, ap, swamp);
    s = run(s, planActivate(s, ap, t, 0));
    s = passAll(s);
    s = settle(cast(s, ap, ids[0]!));
    s = settle(cast(s, ap, ids[1]!));
    expect(s.objects[t]!.counters["+1/+1"]).toBe(2);
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    expect(s.floatingTriggers).toBeUndefined();
  });

  it("Mountain Titan: about that object only; if it left and came back it's a new one (CR 603.7c, 400.7)", () => {
    let { s, ap, ids } = setup([whisper]);
    const t = putOnBattlefield(s, ap, titan);
    s = run(s, planActivate(s, ap, t, 0));
    s = passAll(s);
    moveObject(s, t, "graveyard");
    moveObject(s, t, "battlefield");
    s = cast(s, ap, ids[0]!);
    expect(s.objects[t]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("The Mirari Conjecture: chapter III copies each instant and sorcery spell cast that turn", () => {
    let { s, ap, ids } = setup([quick]);
    const m = putOnBattlefield(s, ap, mirari);
    // Run its chapter III ability by hand: the effect it makes.
    const iii = compileCard(mirari).triggers.find((t) => t.body.text.startsWith("Until end of turn"))!;
    expect(iii.body.effects[0]).toMatchObject({ type: "floatingTrigger", until: "endOfTurn" });
    s.floatingTriggers = [{ id: "f1", controller: ap, sourceId: m, sourceCardId: mirari.oracleId, sourceZc: s.objects[m]!.zoneChanges ?? 0, trigger: (iii.body.effects[0] as Extract<Effect, { type: "floatingTrigger" }>).trigger, until: "endOfTurn", turn: s.turn }];
    const hand = s.players[ap]!.hand.length;
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: ap }]));
    s = settle(s);
    // Ancestral Recall and its copy each drew three cards.
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 6);
  });

  it("Infested Thrinax: a Saproling for each point of power of each nontoken creature of yours that dies this turn", () => {
    let { s, ap, ids } = setup([thrinax, shock]);
    const b = putOnBattlefield(s, ap, bear());
    s = cast(s, ap, ids[0]!);
    s = passAll(s);
    expect(s.floatingTriggers).toHaveLength(1);
    s = cast(s, ap, ids[1]!, [target(b)]);
    const saps = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]?.name === "Saproling" || s.objects[id]!.isToken);
    expect(saps.length).toBe(2);
  });

  it("Lyra: two cards each time she deals combat damage to a player this turn", () => {
    let { s, ap, opp } = setup([]);
    const l = putOnBattlefield(s, ap, lyra);
    s = run(s, planActivate(s, ap, l, 0));
    s = passAll(s);
    expect(s.floatingTriggers).toHaveLength(1);
    const hand = s.players[ap]!.hand.length;
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: l, defender: opp }] });
    s = passUntil(s, "main2", ap);
    expect(s.players[opp]!.life).toBe(37);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });
});
