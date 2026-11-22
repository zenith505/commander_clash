// Round 449: Saruman of Many Colors. "Ward—Discard an enchantment, instant, or sorcery card." (CR 702.21a, the ward cost a
// discard of a card of those types, CR 701.9a; with none in hand it can't be paid, CR 118.3, rulings) and "Whenever you cast
// your second spell each turn, each opponent mills two cards. When one or more cards are milled this way, exile target
// enchantment, instant, or sorcery card with equal or lesser mana value than that spell from an opponent's graveyard. Copy
// the exiled card. You may cast the copy without paying its mana cost." (a reflexive trigger, CR 603.12, its target chosen
// as it triggers, rulings; the copy cast as it resolves or never, CR 608.2g, 707.12).

import { describe, expect, it } from "vitest";
import { act, bear, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, botActions, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const saruman = (): CardDef => ({"oracleId":"c2d04138-cc17-4dd0-9a4c-9c87df72ed01","name":"Saruman of Many Colors","manaCost":"{3}{W}{U}{B}","cmc":6,"typeLine":"Legendary Creature — Avatar Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Avatar","Wizard"],"oracleText":"Ward—Discard an enchantment, instant, or sorcery card.\nWhenever you cast your second spell each turn, each opponent mills two cards. When one or more cards are milled this way, exile target enchantment, instant, or sorcery card with equal or lesser mana value than that spell from an opponent's graveyard. Copy the exiled card. You may cast the copy without paying its mana cost.","power":"5","toughness":"4","colors":["B","U","W"],"colorIdentity":["B","U","W"],"keywords":["Ward","Mill"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const opt = (): CardDef => ({"oracleId":"713332c1-5bd8-400f-bfff-c1ca0697a043","name":"Opt","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":["Scry"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const rancor = (): CardDef => ({"oracleId":"9d2d6479-531c-4ce1-b52b-00e36fa63b64","name":"Rancor","manaCost":"{G}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature gets +2/+0 and has trample.\nWhen this Aura is put into a graveyard from the battlefield, return it to its owner's hand.","colors":["G"],"colorIdentity":["G"],"keywords":["Enchant"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const holy = (): CardDef => ({"oracleId":"9357de36-f8be-4f49-b2c8-9fe9eaf82b07","name":"Holy Strength","manaCost":"{W}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature gets +1/+2.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const mindRot = (): CardDef => ({"oracleId":"ad44cf74-b717-48fb-9fa2-77512024d76a","name":"Mind Rot","manaCost":"{2}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target player discards two cards.","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes until something is asked (or the stack and queue are empty); bots answer the questions of players not in `me`. */
const settleFor = (s: GameState, me: PlayerId[]) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && me.includes(p.player)) return s;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Only these cards in `pid`'s hand: the rest go to the library. */
const handOnly = (s: GameState, pid: PlayerId, keep: string[]) => {
  const p = s.players[pid]!;
  for (const id of p.hand.filter((x) => !keep.includes(x))) {
    s.objects[id]!.zone = "library";
    p.library.push(id);
  }
  p.hand = p.hand.filter((x) => keep.includes(x));
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;

describe("Round 449: Saruman of Many Colors", () => {
  it("compiles fully: a ward trigger and a second-spell trigger", () => {
    for (const d of [saruman(), divination(), opt(), bolt(), shock(), holy(), mindRot(), rancor()]) expect(isFullySupported(d), d.name).toBe(true);
    const { s, ap } = setup([]);
    const id = putOnBattlefield(s, ap, saruman());
    const ts = abilitiesOf(s, s.objects[id]!).triggers;
    expect(ts.map((t) => t.event)).toEqual(["becomesTargetOfOpponent", "castSpell"]);
    expect(ts[0]!.body.effects[0]).toMatchObject({ type: "counterUnlessPays", ward: true, unless: { discard: 1, discardFilter: { types: ["Enchantment", "Instant", "Sorcery"] } } });
    expect(ts[1]!.cast?.nth).toBe(2);
  });

  describe("Ward—Discard an enchantment, instant, or sorcery card", () => {
    /** An opponent Shocks my Saruman with these other cards in hand. */
    function shockSaruman(others: CardDef[]) {
      const { s, ap, opp } = setup([]);
      const sar = putOnBattlefield(s, ap, saruman());
      const sh = into(s, opp, shock(), "hand");
      const rest = others.map((d) => into(s, opp, d, "hand"));
      handOnly(s, opp, [sh, ...rest]);
      let s1 = act(s, { type: "passPriority", player: ap });
      expect(waitingOn(s1)).toBe(opp);
      s1.players[opp]!.manaPool = { ...s1.players[opp]!.manaPool, R: 1 };
      s1 = run(s1, planCast(s1, opp, sh, [tgt(sar)]));
      s1 = settleFor(s1, [opp]);
      return { s: s1, ap, opp, sar, sh, rest };
    }

    it("with only creature cards left in hand it can't be paid: the Shock is countered", () => {
      const { s, sar, sh, rest } = shockSaruman([bear()]);
      expect(s.pending).toBeFalsy();
      expect(zone(s, sh)).toBe("graveyard");
      expect(s.objects[sar]!.damage).toBe(0);
      expect(zone(s, rest[0]!)).toBe("hand");
    });

    it("paying: only an enchantment, instant or sorcery card can be discarded", () => {
      const { s, opp, sar, rest } = shockSaruman([bear(), holy(), opt()]);
      expect(s.pending).toMatchObject({ kind: "payUnless", player: opp, discard: 1, discardFilter: { text: "enchantment, instant, or sorcery card" } });
      const s1 = act(s, { type: "payUnless", player: opp, pay: true });
      expect(s1.pending).toMatchObject({ kind: "discard", player: opp, count: 1, filter: { text: "enchantment, instant, or sorcery card" } });
      expect(() => act(s1, { type: "discard", player: opp, objectIds: [rest[0]!] })).toThrow(/enchantment, instant, or sorcery card/);
      const s2 = settle(act(s1, { type: "discard", player: opp, objectIds: [rest[2]!] }));
      expect(zone(s2, rest[2]!)).toBe("graveyard");
      expect(zone(s2, rest[0]!)).toBe("hand");
      expect(zone(s2, rest[1]!)).toBe("hand");
      expect(s2.objects[sar]!.damage).toBe(2);
    });

    it("with one such card it's discarded without asking; declining counters the Shock", () => {
      const a = shockSaruman([bear(), divination()]);
      const s1 = settle(act(a.s, { type: "payUnless", player: a.opp, pay: true }));
      expect(zone(s1, a.rest[1]!)).toBe("graveyard");
      expect(zone(s1, a.rest[0]!)).toBe("hand");
      expect(s1.objects[a.sar]!.damage).toBe(2);
      const b = shockSaruman([bear(), divination()]);
      const s2 = settle(act(b.s, { type: "payUnless", player: b.opp, pay: false }));
      expect(zone(s2, b.sh)).toBe("graveyard");
      expect(zone(s2, b.rest[1]!)).toBe("hand");
      expect(s2.objects[b.sar]!.damage).toBe(0);
    });

    it("bots pay only when they hold such a card", () => {
      const a = shockSaruman([bear(), holy()]);
      expect(botActions(a.s, a.opp)).toEqual([{ type: "payUnless", player: a.opp, pay: true }]);
      const s = settleFor(a.s, []);
      expect(zone(s, a.rest[1]!)).toBe("graveyard");
      expect(s.objects[a.sar]!.damage).toBe(2);
    });
  });

  describe("the second spell each turn: each opponent mills two, then a card no greater than that spell is copied", () => {
    /** My Saruman; the next opponent's library tops are Mind Rot (mana value 3) and Lightning Bolt (1); I cast `first` then `second`. */
    function board() {
      const { s, ap, opp } = setup([]);
      const sar = putOnBattlefield(s, ap, saruman());
      const others = s.turnOrder.filter((p) => p !== ap);
      const bl = into(s, opp, bolt(), "library");
      const mr = into(s, opp, mindRot(), "library");
      // An enchantment already in another opponent's graveyard, mana value 1.
      const rc = into(s, others[1]!, rancor(), "graveyard");
      // A Shock in my own graveyard (mana value 1).
      const mine = into(s, ap, shock(), "graveyard");
      const dv = into(s, ap, divination(), "hand");
      const op = into(s, ap, opt(), "hand");
      s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, U: 4, C: 2 };
      return { s, ap, opp, others, sar, bl, mr, rc, mine, dv, op };
    }

    it("no trigger for the first spell; the second makes each opponent mill two", () => {
      const { s: s0, ap, others, dv, op, mr, bl } = board();
      const libs = others.map((p) => s0.players[p]!.library.length);
      let s = settleFor(run(s0, planCast(s0, ap, dv)), [ap]);
      expect(s.pending).toBeFalsy();
      expect(others.map((p) => s.players[p]!.library.length)).toEqual(libs);
      s = run(s, planCast(s, ap, op));
      expect(s.stack).toHaveLength(2); // Opt and the trigger
      s = act(s, { type: "passPriority", player: waitingOn(s)! });
      for (let i = 0; i < 10 && s.stack.length === 2 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(others.map((p) => s.players[p]!.library.length)).toEqual(libs.map((n) => n - 2));
      expect(zone(s, mr)).toBe("graveyard");
      expect(zone(s, bl)).toBe("graveyard");
      // The reflexive trigger's target: chosen now, from any opponent's graveyard.
      expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    });

    /** Both cast (Divination first, then Opt), up to the reflexive trigger's targets. */
    function toTargets(firstDv = true) {
      const b = board();
      let s = settleFor(run(b.s, planCast(b.s, b.ap, firstDv ? b.dv : b.op)), []); // a bot answers my scry for Opt
      s = run(s, planCast(s, b.ap, firstDv ? b.op : b.dv));
      for (let i = 0; i < 30 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(s.pending).toMatchObject({ kind: "chooseTargets", player: b.ap });
      return { ...b, s };
    }

    it("Opt (mana value 1) second: Mind Rot (3) can't be the target, Lightning Bolt and Rancor can; the copy of Bolt is cast for free", () => {
      const { s: s0, ap, opp, mr, bl, rc, mine } = toTargets(true);
      expect(() => act(s0, { type: "chooseTargets", player: ap, targets: [tgt(mr)] })).toThrow();
      // Any opponent's graveyard, not only the cards milled; not my own.
      expect(act(structuredClone(s0), { type: "chooseTargets", player: ap, targets: [tgt(rc)] }).pending).toBeFalsy();
      expect(() => act(s0, { type: "chooseTargets", player: ap, targets: [tgt(mine)] })).toThrow();
      let s = act(s0, { type: "chooseTargets", player: ap, targets: [tgt(bl)] });
      s = settle(s);
      expect(zone(s, bl)).toBe("exile");
      expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong" });
      s = act(s, { type: "chooseOption", player: ap, choice: bl });
      expect(s.pending).toMatchObject({ kind: "castFree", player: ap });
      const copy = s.pending?.kind === "castFree" ? s.pending.objectId : "";
      expect(copy).not.toBe(bl);
      const lifeBefore = s.players[opp]!.life;
      s = settle(run(s, planCast(s, ap, copy, [{ kind: "player", id: opp }])));
      expect(s.players[opp]!.life).toBe(lifeBefore - 3);
      expect(zone(s, bl)).toBe("exile");
    });

    it("Divination (mana value 3) second: Mind Rot can be the target; not casting the copy leaves the card in exile", () => {
      const { s: s0, ap, mr } = toTargets(false);
      let s = settle(act(s0, { type: "chooseTargets", player: ap, targets: [tgt(mr)] }));
      expect(zone(s, mr)).toBe("exile");
      s = settle(act(s, { type: "chooseOption", player: ap, choice: "none" }));
      expect(zone(s, mr)).toBe("exile");
      expect(s.stack).toHaveLength(0);
    });

    it("nothing milled (empty libraries): no reflexive trigger", () => {
      const b = board();
      for (const p of b.others) {
        for (const id of b.s.players[p]!.library) b.s.objects[id]!.zone = "exile";
        b.s.players[p]!.exile.push(...b.s.players[p]!.library);
        b.s.players[p]!.library = [];
      }
      let s = settleFor(run(b.s, planCast(b.s, b.ap, b.dv)), [b.ap]);
      s = run(s, planCast(s, b.ap, b.op));
      for (let i = 0; i < 30 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(s.pending?.kind).not.toBe("chooseTargets");
      expect(zone(s, b.rc)).toBe("graveyard");
    });

    it("bots choose a target and cast the copy", () => {
      const b = toTargets(true);
      const s = settleFor(b.s, []);
      expect(zone(s, b.bl) === "exile" || zone(s, b.rc) === "exile").toBe(true);
      expect(zone(s, b.mr)).toBe("graveyard");
    });
  });
});
