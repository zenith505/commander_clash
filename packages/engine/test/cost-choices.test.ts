// Choices between additional costs (CR 118.8, 601.2b): "As an additional cost to cast this spell, sacrifice a creature
// or pay {3}{B}" (Spark Harvest), "pay 5 life or pay {2}" (Redirect Lightning), "reveal a Pirate card from your hand or
// pay {1}" (Daring Buccaneer). And counters with a mixed target (CR 115.1c-d): "Counter target triggered ability or
// colorless spell" (Consign to Memory), "... activated ability, triggered ability, or legendary spell" (Tale's End).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, putOnBattlefield, setup, swamp, target } from "./helpers";
import { botActions, castProblem, isFullySupported, planCast, waitingOn, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const harvest = card("Spark Harvest", "Sorcery", "{B}", { oracleText: "As an additional cost to cast this spell, sacrifice a creature or pay {3}{B}.\nDestroy target creature or planeswalker." });
const redirect = card("Redirect Lightning", "Instant — Lesson", "{R}", {
  oracleText: "As an additional cost to cast this spell, pay 5 life or pay {2}.\nChange the target of target spell or ability with a single target.",
});
const buccaneer = card("Daring Buccaneer", "Creature — Human Pirate", "{R}", { power: "2", toughness: "2", oracleText: "As an additional cost to cast this spell, reveal a Pirate card from your hand or pay {2}." });
const pirate = card("Fathom Fleet Captain", "Creature — Human Pirate", "{1}{B}", { power: "2", toughness: "1" });
const consign = card("Consign to Memory", "Instant", "{U}", {
  oracleText: "Replicate {1} (When you cast this spell, copy it for each time you paid its replicate cost. You may choose new targets for the copies.)\nCounter target triggered ability or colorless spell.",
});
const talesEnd = card("Tale's End", "Instant", "{1}{U}", { oracleText: "Counter target activated ability, triggered ability, or legendary spell." });
const ring = card("Sol Ring", "Artifact", "{1}");
const hero = card("Legendary Hero", "Legendary Creature — Human", "{1}{W}", { power: "2", toughness: "2" });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });

const untappedLands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && !s.objects[id]!.tapped && s.cards[s.objects[id]!.cardId]!.types.includes("Land")).length;

describe("a choice of additional costs", () => {
  it("compiles", () => {
    for (const d of [harvest, redirect, buccaneer, consign, talesEnd]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Spark Harvest: the way to pay must be announced; sacrificing costs no extra mana, paying costs {3}{B} more", () => {
    const { s: s0, ap, opp, ids } = setup([harvest]);
    const victim = putOnBattlefield(s0, opp, bear());
    const fodder = putOnBattlefield(s0, ap, bear());
    expect(castProblem(s0, ap, ids[0]!, [target(victim)])).toMatch(/not enough mana/); // nothing else stops it
    expect(() => act(s0, { type: "castSpell", player: ap, objectId: ids[0]!, targets: [target(victim)] })).toThrow(/choose how to pay/);
    // Sacrifice a creature.
    const before = untappedLands(s0, ap);
    const plan = planCast(s0, ap, ids[0]!, [target(victim)], undefined, "auto", undefined, { costOr: 0, sacrifice: [fodder] })!;
    let s = structuredClone(s0);
    for (const a of plan) s = act(s, a);
    expect(s.objects[fodder]!.zone).toBe("graveyard");
    expect(before - untappedLands(s, ap)).toBe(1);
    // Pay {3}{B}.
    const plan2 = planCast(s0, ap, ids[0]!, [target(victim)], undefined, "auto", undefined, { costOr: 1 })!;
    s = structuredClone(s0);
    for (const a of plan2) s = act(s, a);
    expect(s.objects[fodder]!.zone).toBe("battlefield");
    expect(before - untappedLands(s, ap)).toBe(5);
    // Sacrificing needs a sacrifice choice; paying mana can't come with one.
    expect(castProblem(s0, ap, ids[0]!, [target(victim)], undefined, undefined, undefined, undefined, { costOr: 1, sacrifice: [fodder] })).toMatch(/doesn't ask you to sacrifice/);
    expect(castProblem(s0, ap, ids[0]!, [target(victim)], undefined, undefined, undefined, undefined, { costOr: 2 })).toMatch(/no such cost/);
  });

  it("Redirect Lightning: 5 life or {2}", () => {
    const { s: s0, ap, ids } = setup([redirect, shock]);
    let s = s0;
    // Something with a single target to redirect: our own Shock at an opponent.
    const opp = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    const plan = planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }])!;
    for (const a of plan) s = act(s, a);
    const life = s.players[ap]!.life;
    const spell = s.stack[s.stack.length - 1]!.id;
    const pay = planCast(s, ap, ids[0]!, [{ kind: "stack", id: spell }], undefined, "auto", undefined, { costOr: 0 })!;
    let t = structuredClone(s);
    for (const a of pay) t = act(t, a);
    expect(t.players[ap]!.life).toBe(life - 5);
    const mana = planCast(s, ap, ids[0]!, [{ kind: "stack", id: spell }], undefined, "auto", undefined, { costOr: 1 })!;
    t = structuredClone(s);
    const lands = untappedLands(t, ap);
    for (const a of mana) t = act(t, a);
    expect(t.players[ap]!.life).toBe(life);
    expect(lands - untappedLands(t, ap)).toBe(3);
  });

  it("Daring Buccaneer: reveal a Pirate card from your hand (it stays there) or pay {2}", () => {
    const { s: s0, ap, ids } = setup([buccaneer, pirate]);
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { costOr: 0, reveal: [ids[0]!] })).toMatch(/choose a Pirate card to reveal/); // not itself
    const plan = planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { costOr: 0, reveal: [ids[1]!] })!;
    let s = structuredClone(s0);
    const lands = untappedLands(s, ap);
    for (const a of plan) s = act(s, a);
    expect(lands - untappedLands(s, ap)).toBe(1);
    expect(s.objects[ids[1]!]!.zone).toBe("hand");
    expect(s.log.some((e) => /reveals Fathom Fleet Captain/.test(e.text))).toBe(true);
  });

  it("a bot announces a way it can pay", () => {
    const { s: s0, ap, opp, ids } = setup([harvest]);
    putOnBattlefield(s0, opp, card("Big", "Creature — Giant", "{5}", { power: "6", toughness: "6" }));
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, ap, swamp);
    const p = s0.players[ap]!;
    for (const id of p.hand.filter((x) => x !== ids[0])) {
      s0.objects[id]!.zone = "library";
      p.library.push(id);
    }
    p.hand = [ids[0]!];
    p.isBot = true;
    let s = s0;
    for (let i = 0; i < 80 && !s.log.some((e) => /casts Spark Harvest/.test(e.text)); i++) for (const a of botActions(s, waitingOn(s)!)) s = act(s, a);
    expect(s.log.find((e) => /casts Spark Harvest/.test(e.text))?.text).toMatch(/paying \{3\}\{B\} more/);
  });
});

describe("counters with a mixed target", () => {
  it("Consign to Memory: a colorless spell yes, a colored one no; Tale's End: a legendary spell yes", () => {
    const { s: s0, ap, opp, ids } = setup([consign, talesEnd]);
    let s = s0;
    const oRing = putOnBattlefield(s, opp, ring);
    const oHero = putOnBattlefield(s, opp, hero);
    const oBolt = putOnBattlefield(s, opp, shock);
    for (const id of [oRing, oHero, oBolt]) {
      s.battlefield.splice(s.battlefield.indexOf(id), 1);
      s.objects[id]!.zone = "hand";
      s.players[opp]!.hand.push(id);
    }
    // Put the three spells on the stack directly, as the opponent's.
    const push = (id: string) => {
      s.objects[id]!.zone = "stack";
      s.players[opp]!.hand = s.players[opp]!.hand.filter((x) => x !== id);
      const sid = `s${s.nextId++}`;
      s.stack.push({ id: sid, kind: "spell", objectId: id, controller: opp, targets: [] } as never);
      return sid;
    };
    const [sRing, sHero, sBolt] = [push(oRing), push(oHero), push(oBolt)];
    const can = (card: string, sid: string) => !!planCast(s, ap, card, [{ kind: "stack", id: sid }]);
    expect(can(ids[0]!, sRing)).toBe(true);
    expect(can(ids[0]!, sHero)).toBe(false);
    expect(can(ids[0]!, sBolt)).toBe(false);
    expect(can(ids[1]!, sHero)).toBe(true);
    expect(can(ids[1]!, sRing)).toBe(false);
    s = cast(s, ap, ids[1]!, [{ kind: "stack", id: sHero }]);
    expect(s.objects[oHero]!.zone).toBe("graveyard");
  });
});
