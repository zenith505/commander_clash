// Lane B round B286: Unpredictable Cyclone ("If a cycling ability of another nonland card would cause you to draw a card,
// instead exile cards from the top of your library until you exile a card that shares a card type with the cycled card. You
// may cast that card without paying its mana cost. Then put the exiled cards that weren't cast this way on the bottom of your
// library in a random order."; CR 614.1a, 614.6, 702.29a and its rulings).

import { describe, expect, it } from "vitest";
import { act, bear, forest, putOnBattlefield, setup } from "./helpers";
import { compileCard, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const cyclone = (): CardDef => ({"oracleId":"5b67a944-ab0b-4155-8bc0-becb1b38b3bb","name":"Unpredictable Cyclone","manaCost":"{3}{R}{R}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"If a cycling ability of another nonland card would cause you to draw a card, instead exile cards from the top of your library until you exile a card that shares a card type with the cycled card. You may cast that card without paying its mana cost. Then put the exiled cards that weren't cast this way on the bottom of your library in a random order.\nCycling {2} ({2}, Discard this card: Draw a card.)","colors":["R"],"colorIdentity":["R"],"keywords":["Cycling"],"layout":"normal"}) as CardDef;
const renewedFaith = (): CardDef => ({"oracleId":"aa4ecefa-808e-4706-af16-4ea5af9743fc","name":"Renewed Faith","manaCost":"{2}{W}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"You gain 6 life.\nCycling {1}{W} ({1}{W}, Discard this card: Draw a card.)\nWhen you cycle this card, you may gain 2 life.","colors":["W"],"colorIdentity":["W"],"keywords":["Cycling"],"layout":"normal"}) as CardDef;
const tusker = (): CardDef => ({"oracleId":"82406175-63b3-4972-be8b-db0e70c908cb","name":"Krosan Tusker","manaCost":"{5}{G}{G}","cmc":7,"typeLine":"Creature — Boar Beast","supertypes":[],"types":["Creature"],"subtypes":["Boar","Beast"],"oracleText":"Cycling {2}{G} ({2}{G}, Discard this card: Draw a card.)\nWhen you cycle this card, you may search your library for a basic land card, reveal that card, put it into your hand, then shuffle. (Do this before you draw.)","power":"6","toughness":"5","colors":["G"],"colorIdentity":["G"],"keywords":["Cycling"],"layout":"normal"}) as CardDef;
const steppe = (): CardDef => ({"oracleId":"8dec6fcf-1254-4b1b-ba23-7a3e492a7241","name":"Secluded Steppe","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"This land enters tapped.\n{T}: Add {W}.\nCycling {W} ({W}, Discard this card: Draw a card.)","colors":[],"colorIdentity":["W"],"keywords":["Cycling"],"producedMana":["W"],"layout":"normal"}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const riddler = (): CardDef => ({"oracleId":"58582fac-4c42-4a1c-9ab1-4a892b500da4","name":"Quantum Riddler","manaCost":"{3}{U}{U}","cmc":5,"typeLine":"Creature — Sphinx","supertypes":[],"types":["Creature"],"subtypes":["Sphinx"],"oracleText":"Flying\nWhen this creature enters, draw a card.\nAs long as you have one or fewer cards in hand, if you would draw one or more cards, you draw that many cards plus one instead.\nWarp {1}{U}","power":"4","toughness":"6","colors":["U"],"colorIdentity":["U"],"keywords":["Flying","Warp"],"layout":"normal"}) as CardDef;
const archive = (): CardDef => ({"oracleId":"d5c4d36c-54b3-4149-906b-a57a670260fc","name":"Alhammarret's Archive","manaCost":"{5}","cmc":5,"typeLine":"Legendary Artifact","supertypes":["Legendary"],"types":["Artifact"],"subtypes":[],"oracleText":"If you would gain life, you gain twice that much life instead.\nIf you would draw a card except the first one you draw in each of your draw steps, draw two cards instead.","colors":[],"colorIdentity":[],"keywords":[],"layout":"normal"}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 200 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Put fresh copies of `defs` on top of `pid`'s library, the first on top. */
const onTop = (s: GameState, pid: PlayerId, defs: CardDef[]) =>
  [...defs].reverse().map((def) => {
    const id = putOnBattlefield(s, pid, def);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "library";
    s.players[pid]!.library.unshift(id);
    return id;
  }).reverse();
const nameIs = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;
const cycleIt = (s: GameState, pid: PlayerId, id: string) => run(s, planActivate(s, pid, id, compileCard(s.cards[s.objects[id]!.cardId]!).activated.findIndex((a) => a.cycling)));
/** `ap` controls Unpredictable Cyclone, with `hand` in hand and `top` on top of their library. */
const board = (hand: CardDef[], top: CardDef[]) => {
  const { s, ap, opp, ids } = setup(hand);
  const cy = putOnBattlefield(s, ap, cyclone());
  const lib = onTop(s, ap, top);
  return { s, ap, opp, ids, cy, lib };
};

describe("Unpredictable Cyclone", () => {
  it("is supported", () => {
    expect(isFullySupported(cyclone())).toBe(true);
    expect(compileCard(cyclone()).drawCycloneCycled).toBe(true);
  });

  it("cycling an instant: exile until an instant instead of drawing, cast it free, the rest on the bottom", () => {
    const { s: s0, ap, opp, ids, lib } = board([renewedFaith()], [forest, bear(), bolt(), forest]);
    const [f1, b, bo, f2] = lib as [string, string, string, string];
    const hand = s0.players[ap]!.hand.length;
    let s = settle(cycleIt(s0, ap, ids[0]!));
    // Renewed Faith's "When you cycle" trigger asks first (it resolves before the cycling ability).
    if (s.pending?.kind === "chooseMay" && s.pending.player === ap) s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: bo });
    expect(s.objects[f1]!.zone).toBe("exile");
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.objects[f2]!.zone).toBe("library");
    s = settle(run(s, planCast(s, ap, bo, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(37);
    // Nothing was drawn (CR 614.6): the hand lost only Renewed Faith.
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    expect(s.objects[f1]!.zone).toBe("library");
    expect(s.objects[b]!.zone).toBe("library");
    const lb = s.players[ap]!.library;
    expect(lb.slice(-2).sort()).toEqual([f1, b].sort());
    expect(lb[0]).toBe(f2);
  });

  it("declining the cast: that card goes to the bottom with the rest", () => {
    const { s: s0, ap, ids, lib } = board([renewedFaith()], [bear(), bolt(), forest]);
    const [b, bo] = lib as [string, string];
    let s = settle(cycleIt(s0, ap, ids[0]!));
    if (s.pending?.kind === "chooseMay" && s.pending.player === ap) s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: bo });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.pending).toBeNull();
    expect(s.objects[bo]!.zone).toBe("library");
    expect(s.players[ap]!.library.slice(-2).sort()).toEqual([b, bo].sort());
    expect(s.stack.length).toBe(0);
  });

  it("a creature card cycled finds a creature, cast free at once (timing ignored)", () => {
    const { s: s0, ap, ids, lib } = board([tusker()], [bolt(), bear({ name: "Top Bear" })]);
    const [bo, tb] = lib as [string, string];
    let s = settle(cycleIt(s0, ap, ids[0]!));
    // Krosan Tusker's "When you cycle" search, declined.
    for (let i = 0; i < 5 && s.pending && s.pending.kind !== "castFree"; i++) {
      if (s.pending.kind === "chooseMay") s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
      else break;
    }
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: tb });
    s = settle(run(s, planCast(s, ap, tb)));
    expect(s.objects[tb]!.zone).toBe("battlefield");
    expect(s.objects[bo]!.zone).toBe("library");
  });

  it("not for a land card's cycling, a draw that isn't cycling's, or another player's cycling", () => {
    const { s: s0, ap, ids } = board([steppe(), divination()], []);
    const hand = s0.players[ap]!.hand.length;
    let s = settle(cycleIt(s0, ap, ids[0]!));
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.hand.length).toBe(hand); // Steppe gone, a card drawn
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    // Another player's Cyclone doesn't see your cycling ("cause you to draw").
    const { s: t0, ap: ap2, opp, ids: ids2 } = setup([renewedFaith()]);
    putOnBattlefield(t0, opp, cyclone());
    const h2 = t0.players[ap2]!.hand.length;
    let t = settle(cycleIt(t0, ap2, ids2[0]!));
    if (t.pending?.kind === "chooseMay") t = settle(act(t, { type: "chooseMay", player: ap2, yes: false }));
    expect(t.pending).toBeNull();
    expect(t.players[ap2]!.hand.length).toBe(h2);
  });

  it("cycling a second Unpredictable Cyclone is another nonland card's cycling: it's replaced", () => {
    const { s: s0, ap, ids, lib } = board([cyclone()], [forest, cyclone()]);
    const [f, c2] = lib as [string, string];
    let s = settle(cycleIt(s0, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: c2 });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.objects[f]!.zone).toBe("library");
    expect(nameIs(s, c2)).toBe("Unpredictable Cyclone");
  });

  it("with no card sharing a card type, the whole library is exiled and put back; nothing is drawn", () => {
    const { s: s0, ap, ids } = board([renewedFaith()], []);
    // Only lands and creatures left.
    const before = s0.players[ap]!.library.length;
    const hand = s0.players[ap]!.hand.length;
    let s = settle(cycleIt(s0, ap, ids[0]!));
    if (s.pending?.kind === "chooseMay" && s.pending.player === ap) s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.library.length).toBe(before);
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    expect(s.players[ap]!.lost).toBeFalsy();
  });

  it("with Alhammarret's Archive too, its controller chooses which replaces the draw (CR 616.1)", () => {
    const { s: s0, ap, ids, lib } = board([renewedFaith()], [bolt(), forest]);
    putOnBattlefield(s0, ap, archive());
    let s = settle(cycleIt(s0, ap, ids[0]!));
    if (s.pending?.kind === "chooseMay" && s.pending.player === ap) s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.pending).toMatchObject({ kind: "drawInstead", player: ap });
    const opts = (s.pending as { options: string[] }).options;
    expect(opts).toContain("archive");
    const key = opts.find((o) => o.startsWith("cyclone:"))!;
    expect(key).toBeTruthy();
    s = act(s, { type: "drawInstead", player: ap, choice: key });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: lib[0] });
  });

  it("each draw the cycling ability makes is replaced: Quantum Riddler's one more draw finds a second card", () => {
    const { s: s0, ap, ids, lib } = board([renewedFaith()], [bolt(), forest, bolt(), forest]);
    putOnBattlefield(s0, ap, riddler());
    // One card in hand (Renewed Faith): Riddler turns the draw into two, each replaced.
    for (const id of [...s0.players[ap]!.hand]) if (id !== ids[0]) {
      s0.players[ap]!.hand.splice(s0.players[ap]!.hand.indexOf(id), 1);
      s0.objects[id]!.zone = "graveyard";
      s0.players[ap]!.graveyard.push(id);
    }
    let s = settle(cycleIt(s0, ap, ids[0]!));
    if (s.pending?.kind === "chooseMay" && s.pending.player === ap) s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: lib[0] });
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: lib[2] });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.hand.length).toBe(0);
  });
});
