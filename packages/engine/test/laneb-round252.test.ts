// Lane B round B252: Swans of Bryn Argoll ("If a source would deal damage to ~, prevent that damage. The source's controller
// draws cards equal to the damage prevented this way.", CR 615.5, 615.12, rulings) and Elemental Resonance ("At the beginning of
// your first main phase, add mana equal to enchanted permanent's mana cost.", rulings, CR 107.4) and Don't Blink ("Until end of
// turn, if one or more creatures would enter from exile or after being cast from exile, their owners shuffle them into their
// libraries instead.", CR 614.1a, 614.12).

import { describe, expect, it } from "vitest";
import { act, bear, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, compileCard, invalidateCharacteristics, isFullySupported, moveObject, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const swansofBrynArg = (): CardDef => ({"oracleId":"b187aeeb-5cf5-4b73-a3ef-f39188d2ba33","name":"Swans of Bryn Argoll","manaCost":"{2}{W/U}{W/U}","cmc":4,"typeLine":"Creature — Bird Spirit","supertypes":[],"types":["Creature"],"subtypes":["Bird","Spirit"],"oracleText":"Flying\nIf a source would deal damage to this creature, prevent that damage. The source's controller draws cards equal to the damage prevented this way.","power":"4","toughness":"3","colors":["U","W"],"colorIdentity":["U","W"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/0/c/0cdf78b7-3c32-422a-a73f-d198e6f06290.jpg?1783942735","artUrl":"https://cards.scryfall.io/art_crop/front/0/c/0cdf78b7-3c32-422a-a73f-d198e6f06290.jpg?1783942735","layout":"normal"});
const magmaJet = (): CardDef => ({"oracleId":"2f292253-64d3-4cf2-881f-a3eea4fda388","name":"Magma Jet","manaCost":"{1}{R}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Magma Jet deals 2 damage to any target. Scry 2.","colors":["R"],"colorIdentity":["R"],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/8/a/8af1c5b0-973d-467e-a797-51ca75c183c1.jpg?1783936645","artUrl":"https://cards.scryfall.io/art_crop/front/8/a/8af1c5b0-973d-467e-a797-51ca75c183c1.jpg?1783936645","layout":"normal"});
const stinkweedImp = (): CardDef => ({"oracleId":"e005bc76-4985-4ec6-b9f6-cf6d0d9f5df4","name":"Stinkweed Imp","manaCost":"{2}{B}","cmc":3,"typeLine":"Creature — Imp","supertypes":[],"types":["Creature"],"subtypes":["Imp"],"oracleText":"Flying\nWhenever this creature deals combat damage to a creature, destroy that creature.\nDredge 5 (If you would draw a card, you may mill five cards instead. If you do, return this card from your graveyard to your hand.)","power":"1","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":["Flying","Dredge","Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/6/a/6a601d71-04e0-48f1-8011-a77186c1dd97.jpg?1783904233","artUrl":"https://cards.scryfall.io/art_crop/front/6/a/6a601d71-04e0-48f1-8011-a77186c1dd97.jpg?1783904233","layout":"normal"});
const skullcrack = (): CardDef => ({"oracleId":"a6fc0b0c-9ba2-47f2-ab92-26fd20d0f86d","name":"Skullcrack","manaCost":"{1}{R}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Players can't gain life this turn. Damage can't be prevented this turn. Skullcrack deals 3 damage to target player or planeswalker.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/7/170a06cd-501e-43c8-98e0-63ebd61cc0aa.jpg?1783911719","artUrl":"https://cards.scryfall.io/art_crop/front/1/7/170a06cd-501e-43c8-98e0-63ebd61cc0aa.jpg?1783911719","layout":"normal"});
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","layout":"normal"});
const elementalReson = (): CardDef => ({"oracleId":"1f4ff059-e505-4746-ba4f-6b78a502f523","name":"Elemental Resonance","manaCost":"{2}{G}{G}","cmc":4,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant permanent\nAt the beginning of your first main phase, add mana equal to enchanted permanent's mana cost. (Mana cost includes color. If a mana symbol has multiple colors, choose one.)","colors":["G"],"colorIdentity":["G"],"keywords":["Enchant"],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/9/7/9757631a-c505-4a16-94c1-8bb609ce7bc5.jpg?1783943413","artUrl":"https://cards.scryfall.io/art_crop/front/9/7/9757631a-c505-4a16-94c1-8bb609ce7bc5.jpg?1783943413","layout":"normal"});
const birthingPod = (): CardDef => ({"oracleId":"f8b9dd54-0837-47f4-ad14-7a0322d46d5f","name":"Birthing Pod","manaCost":"{3}{G/P}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"({G/P} can be paid with either {G} or 2 life.)\n{1}{G/P}, {T}, Sacrifice a creature: Search your library for a creature card with mana value equal to 1 plus the sacrificed creature's mana value, put that card onto the battlefield, then shuffle. Activate only as a sorcery.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/6/36df0c13-b7cb-44d6-85e1-17f2967a0f55.jpg?1783920226","artUrl":"https://cards.scryfall.io/art_crop/front/3/6/36df0c13-b7cb-44d6-85e1-17f2967a0f55.jpg?1783920226","layout":"normal"});
const endlessOne = (): CardDef => ({"oracleId":"7a51780a-fa28-4ee0-94c7-4330800ca9cb","name":"Endless One","manaCost":"{X}","cmc":0,"typeLine":"Creature — Eldrazi","supertypes":[],"types":["Creature"],"subtypes":["Eldrazi"],"oracleText":"This creature enters with X +1/+1 counters on it.","power":"0","toughness":"0","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/4/64820f4f-1f78-4338-beb8-5ed5a447cfe4.jpg?1783938224","artUrl":"https://cards.scryfall.io/art_crop/front/6/4/64820f4f-1f78-4338-beb8-5ed5a447cfe4.jpg?1783938224","layout":"normal"});
const dontBlink = (): CardDef => ({"oracleId":"5733c3fb-c533-456c-b30e-5d2b9e206b6b","name":"Don't Blink","manaCost":"{1}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Until end of turn, if one or more creatures would enter from exile or after being cast from exile, their owners shuffle them into their libraries instead.\nCycling {2} ({2}, Discard this card: Draw a card.)","colors":["U"],"colorIdentity":["U"],"keywords":["Cycling"],"imageUrl":"https://cards.scryfall.io/normal/front/6/b/6b92aed2-9f40-4507-bd91-fd1b4d405c91.jpg?1783914424","artUrl":"https://cards.scryfall.io/art_crop/front/6/b/6b92aed2-9f40-4507-bd91-fd1b4d405c91.jpg?1783914424","layout":"normal"});
const cloudshift = (): CardDef => ({"oracleId":"6879f5ce-7a1b-4606-bad1-885779b0d456","name":"Cloudshift","manaCost":"{W}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Exile target creature you control, then return that card to the battlefield under your control.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/d/6dc0c976-26d2-40c9-a571-c370e9139d1d.jpg?1783904809","artUrl":"https://cards.scryfall.io/art_crop/front/6/d/6dc0c976-26d2-40c9-a571-c370e9139d1d.jpg?1783904809","layout":"normal"});
const bonecrusherGia = (): CardDef => ({"oracleId":"d6d72f5f-8f5d-4180-b514-f22ff5482902","name":"Bonecrusher Giant // Stomp","manaCost":"{2}{R} // {1}{R}","cmc":3,"typeLine":"Creature — Giant // Instant — Adventure","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"Whenever this creature becomes the target of a spell, this creature deals 2 damage to that spell's controller.","power":"4","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/9/09fd2d9c-1793-4beb-a3fb-7a869f660cd4.jpg?1783932628","artUrl":"https://cards.scryfall.io/art_crop/front/0/9/09fd2d9c-1793-4beb-a3fb-7a869f660cd4.jpg?1783932628","layout":"adventure","faces":[{"name":"Bonecrusher Giant","manaCost":"{2}{R}","typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"Whenever this creature becomes the target of a spell, this creature deals 2 damage to that spell's controller.","power":"4","toughness":"3","colors":["R"]},{"name":"Stomp","manaCost":"{1}{R}","typeLine":"Instant — Adventure","supertypes":[],"types":["Instant"],"subtypes":["Adventure"],"oracleText":"Damage can't be prevented this turn. Stomp deals 2 damage to any target.","colors":["R"]}]});
const realBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","layout":"normal"});

const supported = (...ds: CardDef[]) => ds.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes and lets bots answer until the stack is empty or one of `me` has a question. */
const settle = (s: GameState, me: PlayerId[] = []) => {
  for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && !me.includes(p.player)) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));
/** Puts a card in `pid`'s graveyard. */
function inGraveyard(s: GameState, pid: PlayerId, d: CardDef): string {
  const id = putOnBattlefield(s, pid, d);
  moveObject(s, id, "graveyard");
  invalidateCharacteristics(s);
  return id;
}

describe("Lane B round B252", () => {
  it("are fully supported", () => {
    supported(swansofBrynArg(), elementalReson(), dontBlink());
    expect(compileCard(swansofBrynArg()).preventToSelfDrawsSource).toBe(true);
  });
});

describe("Lane B round B252: Swans of Bryn Argoll", () => {
  it("a spell's damage to it is prevented and the spell's controller draws that many", () => {
    const { s: s0, ap, opp, ids } = setup([lightningBolt()]);
    const sw = putOnBattlefield(s0, opp, swansofBrynArg());
    const hand = s0.players[ap]!.hand.length;
    const theirs = s0.players[opp]!.hand.length;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(sw)])));
    expect(s.objects[sw]!.zone).toBe("battlefield");
    expect(s.objects[sw]!.damage ?? 0).toBe(0);
    // Its controller is the one casting Lightning Bolt (rulings): the Bolt went to the graveyard, three cards came in.
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 3);
    expect(s.players[opp]!.hand.length).toBe(theirs);
    expect(logged(s, /draws 3 cards \(Swans of Bryn Argoll\)/)).toBe(true);
  });

  it("damage that can't be prevented is dealt, and nothing is drawn (CR 615.12)", () => {
    const { s: s0, ap, opp, ids } = setup([skullcrack(), lightningBolt()]);
    const sw = putOnBattlefield(s0, opp, swansofBrynArg());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp } as TargetChoice])));
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(sw)])));
    expect(s.objects[sw]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    expect(logged(s, /\(Swans of Bryn Argoll\)/)).toBe(false);
  });

  it("the draws come right after the damage, before the rest of the spell: a dredge question, then Magma Jet's scry", () => {
    const { s: s0, ap, opp, ids } = setup([magmaJet()]);
    const sw = putOnBattlefield(s0, opp, swansofBrynArg());
    const imp = inGraveyard(s0, ap, stinkweedImp());
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(sw)]));
    s = settle(s, [ap]);
    // The first of the two draws can be replaced by dredge 5.
    expect(s.pending).toMatchObject({ kind: "dredge", player: ap, options: [imp] });
    s = act(s, { type: "dredge", player: ap, objectId: imp });
    // The second draw is just made, and then Magma Jet goes on: scry 2.
    expect(s.objects[imp]!.zone).toBe("hand");
    expect(s.pending?.player).toBe(ap);
    expect(s.pending?.kind).toBe("arrangeTop");
    expect(s.resolving).not.toBeNull();
  });

  it("combat damage to it is prevented too: the attacking creature's controller draws", () => {
    const { s: s0, ap, opp } = setup([]);
    const sw = putOnBattlefield(s0, opp, swansofBrynArg());
    const b = putOnBattlefield(s0, ap, bear());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: sw, attacker: b }] });
    for (let i = 0; i < 10 && s.pending?.kind === "declareBlockers"; i++) s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
    const hand = s.players[ap]!.hand.length;
    s = passUntil(s, "endCombat", ap);
    expect(s.objects[sw]!.damage ?? 0).toBe(0);
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(characteristics(s, s.objects[sw]!).name).toBe("Swans of Bryn Argoll");
  });
});

/** Elemental Resonance on `host`, at the start of `ap`'s next first main phase with its trigger waiting to resolve. */
function resonance(s: GameState, ap: PlayerId, host: string) {
  const er = putOnBattlefield(s, ap, elementalReson());
  s.objects[er]!.attachedTo = host;
  invalidateCharacteristics(s);
  s = passUntil(s, "end", ap);
  s = passUntil(s, "main1", ap);
  return { s, er };
}
const pool = (s: GameState, pid: PlayerId) => Object.fromEntries(Object.entries(s.players[pid]!.manaPool).filter(([, n]) => n));

describe("Lane B round B252: Elemental Resonance", () => {
  it("adds {C} for each generic mana and a mana of each colored symbol's color, Phyrexian ones too", () => {
    const { s: s0, ap } = setup([]);
    const pod = putOnBattlefield(s0, ap, birthingPod());
    let { s } = resonance(s0, ap, pod);
    s = settle(s, [ap]);
    // Birthing Pod's {3}{G/P}: {C}{C}{C}{G}, in the pool for this main phase (rulings: whether you want it or not).
    expect(s.step).toBe("main1");
    expect(pool(s, ap)).toEqual({ C: 3, G: 1 });
    expect(logged(s, /adds \{G\}\{C\}\{C\}\{C\}/)).toBe(true);
  });

  it("a hybrid symbol adds one of its colors, chosen as it resolves: {W}{W}, {W}{U} or {U}{U} for Swans of Bryn Argoll", () => {
    const { s: s0, ap, opp } = setup([]);
    const sw = putOnBattlefield(s0, opp, swansofBrynArg()); // anyone's permanent
    let { s } = resonance(s0, ap, sw);
    s = settle(s, [ap]);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "either", labels: ["Add {W}{W}{C}{C}", "Add {W}{U}{C}{C}", "Add {U}{U}{C}{C}"] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "1" }), [ap]);
    expect(pool(s, ap)).toEqual({ W: 1, U: 1, C: 2 });
  });

  it("{X} adds nothing (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const one = putOnBattlefield(s0, ap, endlessOne());
    s0.objects[one]!.counters = { "+1/+1": 2 }; // as if cast for X = 2
    let { s } = resonance(s0, ap, one);
    s = settle(s, [ap]);
    expect(pool(s, ap)).toEqual({});
    expect(logged(s, /the mana cost adds no mana/)).toBe(true);
  });
});

describe("Lane B round B252: Don't Blink", () => {
  it("a creature returning from exile is shuffled into its owner's library instead (Cloudshift)", () => {
    const { s: s0, ap, ids } = setup([dontBlink(), cloudshift()]);
    const b = putOnBattlefield(s0, ap, realBears());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(logged(s, /creatures that would enter from exile or after being cast from exile are shuffled/)).toBe(true);
    const lib = s.players[ap]!.library.length;
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(b)])));
    expect(s.objects[b]!.zone).toBe("library");
    expect(s.players[ap]!.library.length).toBe(lib + 1);
    expect(logged(s, /Grizzly Bears is shuffled into its owner's library instead of entering \(Don't Blink\)/)).toBe(true);
  });

  it("a creature spell cast from exile goes to its owner's library as it resolves; one cast from a hand enters", () => {
    const { s: s0, ap, opp, ids } = setup([bonecrusherGia(), dontBlink(), realBears()]);
    const victim = putOnBattlefield(s0, opp, realBears());
    // Stomp first: the card goes on an adventure into exile (CR 715.3d).
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(victim)], undefined, "auto", undefined, { face: 1 })));
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("library");
    s = settle(run(s, planCast(s, ap, ids[2]!)));
    expect(s.objects[ids[2]!]!.zone).toBe("battlefield");
  });

  it("only until end of turn", () => {
    const { s: s0, ap, ids } = setup([dontBlink()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.dontBlinkTurn).toBe(s.turn);
    const b = putOnBattlefield(s, ap, realBears());
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    moveObject(s, b, "exile");
    moveObject(s, b, "battlefield");
    expect(s.objects[b]!.zone).toBe("battlefield");
  });
});
