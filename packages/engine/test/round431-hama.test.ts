// Round 431: Hama, the Bloodbender ("When Hama enters, target opponent mills three cards. Exile up to one noncreature,
// nonland card from that player's graveyard. For as long as you control Hama, you may cast the exiled card during your turn
// by waterbending {X} rather than paying its mana cost, where X is its mana value.").
import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, castProblem, defOf, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const hama = (): CardDef => ({"oracleId":"ef80e174-78e8-412d-a6fe-89c7af746669","name":"Hama, the Bloodbender","manaCost":"{2}{U/B}{U/B}{U/B}","cmc":5,"typeLine":"Legendary Creature — Human Warlock","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Warlock"],"oracleText":"When Hama enters, target opponent mills three cards. Exile up to one noncreature, nonland card from that player's graveyard. For as long as you control Hama, you may cast the exiled card during your turn by waterbending {X} rather than paying its mana cost, where X is its mana value. (While paying a waterbend cost, you can tap your artifacts and creatures to help. Each one pays for {1}.)","power":"3","toughness":"3","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Mill","Waterbend"],"layout":"normal"}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"layout":"normal"}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty or `me` is asked something; bots answer the others. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
/** A new card for `def` on top of `pid`'s library. */
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  invalidateCharacteristics(s);
  return id;
};
const lands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && defOf(s, s.objects[id]!).types.includes("Land"));
/** Hama cast at `opp`, whose top three cards are Divination, Grizzly Bears and Sol Ring; stops at the choice of a card. */
const entered = () => {
  const { s: s0, ap, opp, ids } = setup([hama()]);
  const ring = onTop(s0, opp, solRing());
  const bear = onTop(s0, opp, bears());
  const div = onTop(s0, opp, divination());
  const h = ids[0]!;
  let s = settle(run(s0, planCast(s0, ap, h)), ap);
  s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }), ap);
  return { s, ap, opp, h, div, bear, ring };
};
/** As `entered`, with Divination chosen and exiled. */
const exiled = () => {
  const r = entered();
  const s = settle(act(r.s, { type: "searchLibrary", player: r.ap, found: [r.div] }), r.ap);
  return { ...r, s };
};

describe("round 431: Hama, the Bloodbender", () => {
  it("is fully supported", () => {
    expect(isFullySupported(hama())).toBe(true);
  });

  it("mills three, then offers only the noncreature, nonland cards milled", () => {
    const { s, ap, opp, div, bear, ring } = entered();
    for (const id of [div, bear, ring]) expect(s.players[opp]!.graveyard).toContain(id);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, fromGraveyard: "exile", min: 0, max: 1 });
    expect(s.pending?.kind === "searchLibrary" && [...s.pending.cards].sort()).toEqual([div, ring].sort());
    expect(s.pending?.kind === "searchLibrary" && s.pending.cards).not.toContain(bear);
  });

  it("exiles the chosen card; on your turn it can be cast for {3} generic (no blue needed), not its {2}{U}", () => {
    const { s: s1, ap, opp, div } = exiled();
    let s = s1;
    expect(zone(s, div)).toBe("exile");
    expect(s.objects[div]!.mayPlay).toMatchObject({ player: ap, cost: "{3}", waterbend: true, yourTurnOnly: true, until: "whileControlled" });
    // Only Mountains left untapped: no blue mana, yet it can be cast.
    for (const id of lands(s, ap)) if (!/Mountain/.test(defOf(s, s.objects[id]!).name)) s.objects[id]!.tapped = true;
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, div)), ap);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    // Its owner's graveyard after it resolves.
    expect(s.players[opp]!.graveyard).toContain(div);
    expect(s.log.some((l) => /casts Divination from exile/.test(l.text))).toBe(true);
  });

  it("waterbends: with no mana, Hama and two other creatures tap to pay all {3} (Hama too: summoning sickness doesn't matter, rulings)", () => {
    const { s: s1, ap, h, div } = exiled();
    let s = s1;
    for (const id of lands(s, ap)) s.objects[id]!.tapped = true;
    const b1 = putOnBattlefield(s, ap, bears());
    const b2 = putOnBattlefield(s, ap, bears());
    s.objects[h]!.controlledSinceTurn = s.turn; // it entered this turn
    const plan = planCast(s, ap, div);
    expect(plan).not.toBeNull();
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, plan), ap);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    for (const id of [h, b1, b2]) expect(s.objects[id]!.tapped).toBe(true);
    expect(s.log.some((l) => /to waterbend/.test(l.text))).toBe(true);
    expect(s.turnLog?.bent?.[ap]).toContain("water");
  });

  it("no more than {3} can be paid by tapping: a fourth creature isn't enough for a bigger cost", () => {
    const { s: s1, ap, div } = exiled();
    const s = s1;
    for (const id of lands(s, ap)) s.objects[id]!.tapped = true;
    const extra = [putOnBattlefield(s, ap, bears()), putOnBattlefield(s, ap, bears()), putOnBattlefield(s, ap, bears()), putOnBattlefield(s, ap, bears())];
    expect(castProblem(s, ap, div, undefined, undefined, undefined, undefined, undefined, { waterbend: extra })).toMatch(/no more than 3/);
  });

  it("not during an opponent's turn", () => {
    const { s: s1, ap, opp, div } = exiled();
    const s = passUntil(s1, "main1", opp);
    expect(castProblem(s, ap, div)).not.toBeNull();
    expect(planCast(s, ap, div)).toBeNull();
  });

  it("not once you no longer control Hama", () => {
    const { s: s1, ap, h, div } = exiled();
    const s = s1;
    s.battlefield.splice(s.battlefield.indexOf(h), 1);
    s.objects[h]!.zone = "graveyard";
    s.objects[h]!.zoneChanges = (s.objects[h]!.zoneChanges ?? 0) + 1;
    s.players[ap]!.graveyard.push(h);
    invalidateCharacteristics(s);
    expect(castProblem(s, ap, div)).not.toBeNull();
  });

  it("a bot choosing picks a card and may cast it later", () => {
    const { s: s1, ap, div, ring } = entered();
    let s = s1;
    for (const a of botActions(s, ap)) s = act(s, a);
    s = settle(s);
    // The dearest it could pay for: Divination, then cast from exile on its own turn.
    expect(zone(s, div)).toBe("exile");
    expect(zone(s, ring)).toBe("graveyard");
    for (let i = 0; i < 30 && zone(s, div) === "exile" && waitingOn(s) === ap; i++) {
      const acts = botActions(s, ap);
      if (!acts.length || acts[0]!.type === "passPriority") break;
      for (const a of acts) s = act(s, a);
      s = settle(s);
    }
    expect(zone(s, div)).not.toBe("exile");
  });
});
