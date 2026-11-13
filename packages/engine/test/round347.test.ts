// Round 347 (Lane A): cards exiled with a permanent or spell that its controller may play. Lobelia, Defender of Bag End
// (the top card of each opponent's library exiled face down; one of them played free this turn for each activation),
// Gandalf, Goblins' Bane's Flameshape (two cards exiled face down, played while you control a Wizard), Urianger Augurelt
// (look at the top card and maybe exile it face down; play those cards this turn, spells {2} less) and The Temporal
// Anchor (cards a scry put on the bottom exiled from the bottom; played during your turn).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, applyAction, botActions, castProblem, chooseModes, isFullySupported, mayPlayFromExile, moveObject, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const nameOf = (s: GameState, id: ObjectId) => s.cards[s.objects[id]!.cardId]!.name;
/** Puts the first card named `name` in `pid`'s library on top of it. */
const toTop = (s: GameState, pid: PlayerId, name: string) => {
  const lib = s.players[pid]!.library;
  const i = lib.findIndex((id) => nameOf(s, id) === name);
  if (i < 0) throw new Error(`no ${name}`);
  lib.unshift(...lib.splice(i, 1));
  return lib[0]!;
};
/** A copy of `def` put on top of `pid`'s library. */
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
};
/** No lands for `pid` but these. */
const onlyLands = (s: GameState, pid: PlayerId, keep: number) => {
  let kept = 0;
  for (const id of [...s.battlefield]) {
    const o = s.objects[id]!;
    if (o.controller === pid && s.cards[o.cardId]!.types.includes("Land") && kept++ >= keep) moveObject(s, id, "graveyard");
  }
};

// Real oracle text (Scryfall).
const lobelia = (): CardDef => ({"oracleId":"0f2e3e2e-9857-4be5-9bf0-62da1cc147fc","name":"Lobelia, Defender of Bag End","manaCost":"{2}{B}","cmc":3,"typeLine":"Legendary Creature — Halfling Citizen","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Halfling","Citizen"],"oracleText":"When Lobelia enters, look at the top card of each opponent's library and exile those cards face down.\n{T}, Sacrifice an artifact: Choose one —\n• Until end of turn, you may play a card exiled with Lobelia without paying its mana cost.\n• Each opponent loses 2 life and you gain 2 life.","power":"2","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/f/5fc6bd3c-eef0-4255-870a-fd48067e9891.jpg?1783915996","artUrl":"https://cards.scryfall.io/art_crop/front/5/f/5fc6bd3c-eef0-4255-870a-fd48067e9891.jpg?1783915996","commanderLegal":"legal","set":"ltc","releasedAt":"2023-06-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const gandalf = (): CardDef => ({"oracleId":"f48f2a9b-4ba5-4984-8180-3950889bba65","name":"Gandalf, Goblins' Bane // Flameshape","manaCost":"{2}{R} // {1}{R}","cmc":3,"typeLine":"Legendary Creature — Avatar Wizard // Sorcery — Adventure","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Avatar","Wizard"],"oracleText":"Whenever you cast a noncreature spell, Gandalf gets +1/+1 until end of turn and deals 1 damage to each opponent.","power":"2","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/b/9b0d29a1-7da9-4fb3-8536-8ff8d8acae0b.jpg?1784376993","artUrl":"https://cards.scryfall.io/art_crop/front/9/b/9b0d29a1-7da9-4fb3-8536-8ff8d8acae0b.jpg?1784376993","commanderLegal":"legal","set":"hob","releasedAt":"2026-08-14","rarity":"mythic","layout":"adventure","gameChanger":false,"faces":[{"name":"Gandalf, Goblins' Bane","manaCost":"{2}{R}","typeLine":"Legendary Creature — Avatar Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Avatar","Wizard"],"oracleText":"Whenever you cast a noncreature spell, Gandalf gets +1/+1 until end of turn and deals 1 damage to each opponent.","power":"2","toughness":"3","colors":["R"]},{"name":"Flameshape","manaCost":"{1}{R}","typeLine":"Sorcery — Adventure","supertypes":[],"types":["Sorcery"],"subtypes":["Adventure"],"oracleText":"Look at the top two cards of your library and exile them face down. For as long as they remain exiled, you may play them if you control a Wizard.","colors":["R"]}]}) as CardDef;
const urianger = (): CardDef => ({"oracleId":"7ca584e7-4621-4b4e-a381-a0051acbf66a","name":"Urianger Augurelt","manaCost":"{W}{U}","cmc":2,"typeLine":"Legendary Creature — Elf Advisor","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elf","Advisor"],"oracleText":"Whenever you play a land from exile or cast a spell from exile, you gain 2 life.\nDraw Arcanum — {T}: Look at the top card of your library. You may exile it face down.\nPlay Arcanum — {T}: Until end of turn, you may play cards exiled with Urianger Augurelt. Spells you cast this way cost {2} less to cast.","power":"1","toughness":"3","colors":["U","W"],"colorIdentity":["U","W"],"keywords":["Draw Arcanum","Play Arcanum"],"imageUrl":"https://cards.scryfall.io/normal/front/4/4/44d44107-da15-41b9-8dfb-6335c1cbd83a.jpg?1783906341","artUrl":"https://cards.scryfall.io/art_crop/front/4/4/44d44107-da15-41b9-8dfb-6335c1cbd83a.jpg?1783906341","commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const anchor = (): CardDef => ({"oracleId":"168f2fbb-8cf7-43e0-8bb6-5e4cc3c1e363","name":"The Temporal Anchor","manaCost":"{3}{U}{U}{U}","cmc":6,"typeLine":"Legendary Artifact","supertypes":["Legendary"],"types":["Artifact"],"subtypes":[],"oracleText":"At the beginning of your upkeep, scry 2.\nWhenever you choose to put one or more cards on the bottom of your library while scrying, exile that many cards from the bottom of your library.\nDuring your turn, you may play cards exiled with The Temporal Anchor.","colors":["U"],"colorIdentity":["U"],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/1/a/1a212d59-b72e-4939-a757-c131ca4323ce.jpg?1783920095","artUrl":"https://cards.scryfall.io/art_crop/front/1/a/1a212d59-b72e-4939-a757-c131ca4323ce.jpg?1783920095","commanderLegal":"legal","set":"bro","releasedAt":"2022-11-18","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const opt = (): CardDef => ({"oracleId":"713332c1-5bd8-400f-bfff-c1ca0697a043","name":"Opt","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","artUrl":"https://cards.scryfall.io/art_crop/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","commanderLegal":"legal","set":"sld","releasedAt":"2025-07-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const apprentice = (): CardDef => ({"oracleId":"5e961d15-5972-4e4b-9385-1cd7cd7c6bbe","name":"Prodigal Sorcerer","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Human Wizard Sorcerer","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard","Sorcerer"],"oracleText":"{T}: This creature deals 1 damage to any target.","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/0/50aef269-55f9-4d84-8bc5-29e794297f11.jpg?1783937607","artUrl":"https://cards.scryfall.io/art_crop/front/5/0/50aef269-55f9-4d84-8bc5-29e794297f11.jpg?1783937607","commanderLegal":"legal","set":"ema","releasedAt":"2016-06-10","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const opponentsOf = (s: GameState, ap: PlayerId) => s.turnOrder.filter((p) => p !== ap);

describe("round 347: compiles", () => {
  it("every card of the round", () => supported(lobelia(), gandalf(), urianger(), anchor()));
});

describe("Lobelia, Defender of Bag End", () => {
  /** Lobelia cast and resolved: each opponent's top card exiled face down (a Grizzly Bears for the first, Forests for the rest). */
  const ready = () => {
    const { s: s0, ap, ids } = setup([lobelia()]);
    const opps = opponentsOf(s0, ap);
    const tops = [toTop(s0, opps[0]!, "Grizzly Bears"), toTop(s0, opps[1]!, "Forest"), toTop(s0, opps[2]!, "Forest")];
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    const lob = ids[0]!;
    s.objects[lob]!.controlledSinceTurn = -1;
    return { s, ap, opps, tops, lob };
  };
  const activate = (s: GameState, ap: PlayerId, lob: ObjectId, mode: number) => {
    const ring = putOnBattlefield(s, ap, solRing());
    s.objects[lob]!.tapped = false;
    return { s: settle(run(s, planActivate(s, ap, lob, 0, undefined, [mode], undefined, undefined, { sacrifice: [ring] })), ap), ring };
  };

  it("as it enters, the top card of each opponent's library is exiled face down; only its controller may look at them (rulings)", () => {
    const { s, ap, opps, tops } = ready();
    tops.forEach((id, i) => {
      expect(s.objects[id]!.zone).toBe("exile");
      expect(s.objects[id]!.owner).toBe(opps[i]);
      expect(s.objects[id]!.hiddenExile?.seen).toEqual([ap]);
      // Not playable yet: that takes the first mode.
      expect(mayPlayFromExile(s, s.objects[id]!, ap)).toBe(false);
    });
  });

  it("the first mode: one of them, any, played this turn without paying its mana cost; each activation allows one more", () => {
    const { s: s0, ap, tops, lob } = ready();
    onlyLands(s0, ap, 0);
    let { s, ring } = activate(s0, ap, lob, 0);
    expect(s.objects[ring]!.zone).toBe("graveyard");
    for (const id of tops) expect(mayPlayFromExile(s, s.objects[id]!, ap)).toBe(true);
    // The opponent's Grizzly Bears, with no lands at all: free (CR 118.9).
    expect(castProblem(s, ap, tops[0]!)).toBeNull();
    s = settle(run(s, planCast(s, ap, tops[0]!)), ap);
    expect(s.objects[tops[0]!]!.zone).toBe("battlefield");
    expect(s.objects[tops[0]!]!.controller).toBe(ap);
    // That was the one: the Forests can't be played now.
    for (const id of tops.slice(1)) expect(mayPlayFromExile(s, s.objects[id]!, ap)).toBe(false);
    // Activated again: one more, a Forest played with the turn's land play (rulings).
    s = activate(s, ap, lob, 0).s;
    expect(mayPlayFromExile(s, s.objects[tops[1]!]!, ap)).toBe(true);
    s = act(s, { type: "playLand", player: ap, objectId: tops[1]! });
    expect(s.objects[tops[1]!]!.zone).toBe("battlefield");
    expect(mayPlayFromExile(s, s.objects[tops[2]!]!, ap)).toBe(false);
  });

  it("two activations before any play: two of them; none after the turn ends", () => {
    const { s: s0, ap, tops, lob } = ready();
    let s = activate(s0, ap, lob, 0).s;
    s = activate(s, ap, lob, 0).s;
    s = settle(run(s, planCast(s, ap, tops[0]!)), ap);
    s = act(s, { type: "playLand", player: ap, objectId: tops[1]! });
    expect(s.objects[tops[1]!]!.zone).toBe("battlefield");
    expect(mayPlayFromExile(s, s.objects[tops[2]!]!, ap)).toBe(false);
  });

  it("the permission lasts until end of turn only", () => {
    const { s: s0, ap, opps, tops, lob } = ready();
    let s = activate(s0, ap, lob, 0).s;
    s = passUntil(s, "upkeep", opps[0]);
    for (const id of tops) expect(mayPlayFromExile(s, s.objects[id]!, ap)).toBe(false);
  });

  it("bots: the free play in their main phase when a card exiled with it could be played, else the life drain", () => {
    const { s, ap, lob } = ready();
    const body = abilitiesOf(s, s.objects[lob]!).activated[0]!.body;
    // Main phase, stack empty: the opponent's Grizzly Bears is worth more than 2 life from each opponent.
    expect(chooseModes(s, ap, body, false, lob)?.modes).toEqual([0]);
    // No card exiled with it left: the drain.
    for (const id of [...s.players[s.turnOrder.find((p) => p !== ap)!]!.exile]) moveObject(s, id, "graveyard");
    for (const p of s.turnOrder) for (const id of [...s.players[p]!.exile]) if (s.objects[id]!.hiddenExile) moveObject(s, id, "graveyard");
    expect(chooseModes(s, ap, body, false, lob)?.modes).toEqual([1]);
  });

  it("the second mode: each opponent loses 2 life and you gain 2 life", () => {
    const { s: s0, ap, opps, lob } = ready();
    const life = (s: GameState, p: PlayerId) => s.players[p]!.life;
    const before = [ap, ...opps].map((p) => life(s0, p));
    const s = activate(s0, ap, lob, 1).s;
    expect([ap, ...opps].map((p) => life(s, p))).toEqual([before[0]! + 2, ...before.slice(1).map((n) => n - 2)]);
  });
});

describe("Gandalf, Goblins' Bane // Flameshape", () => {
  it("Flameshape: the top two cards exiled face down, playable for as long as they stay exiled while you control a Wizard", () => {
    const { s: s0, ap, ids } = setup([gandalf()]);
    const g = ids[0]!;
    const top = s0.players[ap]!.library.slice(0, 2);
    let s = settle(run(s0, planCast(s0, ap, g, undefined, undefined, undefined, undefined, { face: 1 })), ap);
    for (const id of top) {
      expect(s.objects[id]!.zone).toBe("exile");
      expect(s.objects[id]!.hiddenExile?.seen).toEqual([ap]);
      // No Wizard: Gandalf himself is on an adventure in exile.
      expect(mayPlayFromExile(s, s.objects[id]!, ap)).toBe(false);
    }
    expect(s.objects[g]!.zone).toBe("exile");
    // A Wizard: they're playable, now and on a later turn.
    const wiz = putOnBattlefield(s, ap, apprentice());
    for (const id of top) expect(mayPlayFromExile(s, s.objects[id]!, ap)).toBe(true);
    moveObject(s, wiz, "graveyard");
    for (const id of top) expect(mayPlayFromExile(s, s.objects[id]!, ap)).toBe(false);
    // Gandalf cast from his adventure is a Wizard too.
    s = settle(run(s, planCast(s, ap, g)), ap);
    expect(s.objects[g]!.zone).toBe("battlefield");
    for (const id of top) expect(mayPlayFromExile(s, s.objects[id]!, ap)).toBe(true);
    s = passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    // Another player's turn: a land can't be played then, but the permission is still there for a spell with flash.
    for (const id of top) expect(s.objects[id]!.mayPlay?.ifControl?.subtypes).toEqual(["Wizard"]);
  });
});

describe("Urianger Augurelt", () => {
  /** Urianger on the battlefield, untapped; `pid`'s lands only a Mountain and an Island. */
  const ready = () => {
    const { s, ap } = setup([]);
    onlyLands(s, ap, 0);
    putOnBattlefield(s, ap, card("Mountain", "Basic Land — Mountain"));
    putOnBattlefield(s, ap, card("Island", "Basic Land — Island"));
    const u = putOnBattlefield(s, ap, urianger());
    return { s, ap, u };
  };
  const draw = (s: GameState, ap: PlayerId, u: ObjectId, exile: boolean) => {
    s.objects[u]!.tapped = false;
    const top = s.players[ap]!.library[0]!;
    s = settle(run(s, planActivate(s, ap, u, 0)), ap);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, cards: [top], min: 0, max: 1 });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: exile ? [top] : [] }), ap);
    return { s, top };
  };

  it("Draw Arcanum: look at the top card and exile it face down, or leave it on top", () => {
    const { s: s0, ap, u } = ready();
    let { s, top } = draw(s0, ap, u, false);
    expect(s.players[ap]!.library[0]).toBe(top);
    ({ s, top } = draw(s, ap, u, true));
    expect(s.objects[top]!.zone).toBe("exile");
    expect(s.objects[top]!.hiddenExile?.seen).toEqual([ap]);
    expect(mayPlayFromExile(s, s.objects[top]!, ap)).toBe(false);
  });

  it("Play Arcanum: this turn, cards exiled with it may be played, spells {2} less (generic only); casting from exile gains 2 life", () => {
    const { s: s0, ap, u } = ready();
    const giantId = onTop(s0, ap, giant());
    let { s } = draw(s0, ap, u, true);
    const forestId = onTop(s, ap, card("Forest", "Basic Land — Forest"));
    ({ s } = draw(s, ap, u, true));
    expect(s.objects[forestId]!.zone).toBe("exile");
    s.objects[u]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, u, 1)), ap);
    for (const id of [giantId, forestId]) expect(mayPlayFromExile(s, s.objects[id]!, ap)).toBe(true);
    const life = s.players[ap]!.life;
    // Hill Giant ({3}{R}) for {1}{R}, with a Mountain and an Island (castProblem looks at the mana pool, planCast at the lands).
    expect(planCast(s, ap, giantId)).not.toBeNull();
    s = settle(run(s, planCast(s, ap, giantId)), ap);
    expect(s.objects[giantId]!.zone).toBe("battlefield");
    expect(s.players[ap]!.life).toBe(life + 2);
    // The Forest, with the turn's land play: 2 more life.
    s = settle(act(s, { type: "playLand", player: ap, objectId: forestId }), ap);
    expect(s.objects[forestId]!.zone).toBe("battlefield");
    expect(s.players[ap]!.life).toBe(life + 4);
  });

  it("bots exile the card they look at with Draw Arcanum", () => {
    const { s: s0, ap, u } = ready();
    const top = s0.players[ap]!.library[0]!;
    let s = settle(run(s0, planActivate(s0, ap, u, 0)), ap);
    for (const a of botActions(s, ap)) s = act(s, a);
    expect(s.objects[top]!.zone).toBe("exile");
  });

  it("the cost reduction doesn't reduce colored mana, and the permission ends with the turn", () => {
    const { s: s0, ap, u } = ready();
    const boltId = onTop(s0, ap, bolt());
    let { s } = draw(s0, ap, u, true);
    s.objects[u]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, u, 1)), ap);
    // Lightning Bolt still costs {R}: tap the Mountain away and it can't be cast.
    const mountainId = s.battlefield.find((id) => nameOf(s, id) === "Mountain")!;
    s.objects[mountainId]!.tapped = true;
    expect(planCast(s, ap, boltId)).toBeNull();
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    expect(mayPlayFromExile(s, s.objects[boltId]!, ap)).toBe(false);
  });
});

describe("The Temporal Anchor", () => {
  it("a scry that puts cards on the bottom: that many exiled from the bottom, played during your turn only", () => {
    const { s: s0, ap, ids } = setup([opt()]);
    const a = putOnBattlefield(s0, ap, anchor());
    const bears = toTop(s0, ap, "Grizzly Bears");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "arrangeTop", how: "scry", cards: [bears] });
    s = settle(act(s, { type: "arrangeTop", player: ap, top: [], away: [bears] }), ap);
    expect(s.objects[bears]!.zone).toBe("exile");
    expect(s.objects[bears]!.hiddenExile).toBeUndefined();
    expect(mayPlayFromExile(s, s.objects[bears]!, ap)).toBe(true);
    expect(planCast(s, ap, bears)).not.toBeNull();
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    expect(mayPlayFromExile(s, s.objects[bears]!, ap)).toBe(false);
    void a;
  });

  it("a scry keeping everything on top doesn't trigger it; its upkeep scry 2 with both on the bottom exiles two", () => {
    const { s: s0, ap, ids } = setup([opt()]);
    putOnBattlefield(s0, ap, anchor());
    const top = s0.players[ap]!.library[0]!;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    const exiledBefore = s.players[ap]!.exile.length;
    s = settle(act(s, { type: "arrangeTop", player: ap, top: [top], away: [] }), ap);
    expect(s.players[ap]!.exile.length).toBe(exiledBefore);
    // Its own upkeep trigger next turn.
    s = passUntil(s, "upkeep", ap, 4000);
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "arrangeTop", how: "scry" });
    const two = (s.pending as { cards: ObjectId[] }).cards;
    expect(two).toHaveLength(2);
    s = settle(act(s, { type: "arrangeTop", player: ap, top: [], away: two }), ap);
    for (const id of two) expect(s.objects[id]!.zone).toBe("exile");
  });
});
