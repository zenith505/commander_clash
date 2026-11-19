// Round 421 (Lane A): Lady Loki, Agent of Chaos ("Whenever you cast your first instant, sorcery, or Villain spell each
// turn, exile it, then exile cards from the top of your library until you exile a nonland card. ~ deals damage to each
// opponent equal to the difference between that spell's mana value and that nonland card's mana value. You may cast
// that card without paying its mana cost.", CR 202.3e, 608.2h, 107.2, 608.2g) and Medomai's Prophecy (chapter II's name
// kept on the Saga, chapter III's delayed trigger "When you cast a spell with the chosen name for the first time this
// turn, draw two cards.", CR 607.2, 603.7c) and Squall, Gunblade Duelist (an intervening if on the creatures attacking
// one of your opponents, their power or toughness equal to the chosen number, CR 603.4, 608.2h).

import { describe, expect, it } from "vitest";
import { act, addEffect, bear, forest, passUntil, putOnBattlefield, setup } from "./helpers";
import { moveObject } from "../src/game";
import { applyAction, botActions, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const loki = (): CardDef => ({"oracleId": "6efae65b-5ae5-4f62-97e7-cd4d1249fa9e", "name": "Lady Loki, Agent of Chaos", "manaCost": "{5}{R}", "cmc": 6, "typeLine": "Legendary Creature — God Sorcerer Villain", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["God", "Sorcerer", "Villain"], "oracleText": "Whenever you cast your first instant, sorcery, or Villain spell each turn, exile it, then exile cards from the top of your library until you exile a nonland card. Lady Loki deals damage to each opponent equal to the difference between that spell's mana value and that nonland card's mana value. You may cast that card without paying its mana cost.", "power": "5", "toughness": "5", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/4/4/44ac85d4-0429-4813-b7fe-eed1f6575b7d.jpg?1783903283", "artUrl": "https://cards.scryfall.io/art_crop/front/4/4/44ac85d4-0429-4813-b7fe-eed1f6575b7d.jpg?1783903283", "commanderLegal": "legal", "set": "msc", "releasedAt": "2026-06-26", "rarity": "rare", "layout": "normal", "gameChanger": false} as CardDef);
const bolt = (): CardDef => ({"oracleId": "4457ed35-7c10-48c8-9776-456485fdf070", "name": "Lightning Bolt", "manaCost": "{R}", "cmc": 1, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Lightning Bolt deals 3 damage to any target.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008", "artUrl": "https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008", "commanderLegal": "legal", "set": "msc", "releasedAt": "2026-06-26", "rarity": "uncommon", "layout": "normal", "gameChanger": false} as CardDef);
const divination = (): CardDef => ({"oracleId": "273b339c-964b-4a18-8eb5-ceb8abcdfd9e", "name": "Divination", "manaCost": "{2}{U}", "cmc": 3, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Draw two cards.", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025", "artUrl": "https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025", "commanderLegal": "legal", "set": "dom", "releasedAt": "2018-04-27", "rarity": "common", "layout": "normal", "gameChanger": false} as CardDef);
const blaze = (): CardDef => ({"oracleId": "0596920f-9946-42f4-a03b-24aab67f9f1b", "name": "Blaze", "manaCost": "{X}{R}", "cmc": 1, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Blaze deals X damage to any target.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/3/9/3940d0ca-0ca2-4446-9330-a554c3e89824.jpg?1783946468", "artUrl": "https://cards.scryfall.io/art_crop/front/3/9/3940d0ca-0ca2-4446-9330-a554c3e89824.jpg?1783946468", "commanderLegal": "legal", "set": "p02", "releasedAt": "1998-06-24", "rarity": "uncommon", "layout": "normal", "gameChanger": false} as CardDef);
const doombot = (): CardDef => ({"oracleId": "f24efc60-fdac-4a5d-bcbc-784ec5ae6d96", "name": "Aerial Doombot", "manaCost": "{U}", "cmc": 1, "typeLine": "Artifact Creature — Robot Villain", "supertypes": [], "types": ["Artifact", "Creature"], "subtypes": ["Robot", "Villain"], "oracleText": "Flying\nPower-up — {5}{U}: Put three +1/+1 counters on this creature. (Activate each power-up ability only once. Reduce the cost by its mana cost if it entered this turn.)", "power": "1", "toughness": "1", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Flying", "Power-up"], "imageUrl": "https://cards.scryfall.io/normal/front/e/7/e727ec1c-dc3b-4f1a-8a62-18549f118b89.jpg?1783902963", "artUrl": "https://cards.scryfall.io/art_crop/front/e/7/e727ec1c-dc3b-4f1a-8a62-18549f118b89.jpg?1783902963", "commanderLegal": "legal", "set": "msh", "releasedAt": "2026-06-26", "rarity": "common", "layout": "normal", "gameChanger": false} as CardDef);
const squall = (): CardDef => ({"oracleId": "880c2b0a-b708-4f11-a88a-ec990c904602", "name": "Squall, Gunblade Duelist", "manaCost": "{R}{W}{B}", "cmc": 3, "typeLine": "Legendary Creature — Human Mercenary", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Human", "Mercenary"], "oracleText": "First strike\nAs Squall enters, choose a number.\nWhenever one or more creatures attack one of your opponents, if any of those creatures have power or toughness equal to the chosen number, Squall deals damage equal to its power to defending player.", "power": "3", "toughness": "2", "colors": ["B", "R", "W"], "colorIdentity": ["B", "R", "W"], "keywords": ["First strike"], "imageUrl": "https://cards.scryfall.io/normal/front/6/8/682b9f3c-960b-4600-b650-eefd588071d3.jpg?1783904653", "artUrl": "https://cards.scryfall.io/art_crop/front/6/8/682b9f3c-960b-4600-b650-eefd588071d3.jpg?1783904653", "commanderLegal": "legal", "set": "fic", "releasedAt": "2025-12-05", "rarity": "rare", "layout": "normal", "gameChanger": false} as CardDef);
const medomai = (): CardDef => ({"oracleId": "e2ea1901-68ac-4afc-adc2-ac6bc7465311", "name": "Medomai's Prophecy", "manaCost": "{1}{U}", "cmc": 2, "typeLine": "Enchantment — Saga", "supertypes": [], "types": ["Enchantment"], "subtypes": ["Saga"], "oracleText": "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after IV.)\nI — Scry 2.\nII — Choose a card name.\nIII — When you cast a spell with the chosen name for the first time this turn, draw two cards.\nIV — Look at the top card of each player's library.", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Scry"], "imageUrl": "https://cards.scryfall.io/normal/front/3/d/3d2bd7b4-28de-4d9e-86c5-a46bd608cb02.jpg?1783931583", "artUrl": "https://cards.scryfall.io/art_crop/front/3/d/3d2bd7b4-28de-4d9e-86c5-a46bd608cb02.jpg?1783931583", "commanderLegal": "legal", "set": "thb", "releasedAt": "2020-01-24", "rarity": "uncommon", "layout": "saga", "gameChanger": false} as CardDef);
const bears = (): CardDef => ({"oracleId": "14c8f55d-d177-4c25-a931-ebeb9e6062a0", "name": "Grizzly Bears", "manaCost": "{1}{G}", "cmc": 2, "typeLine": "Creature — Bear", "supertypes": [], "types": ["Creature"], "subtypes": ["Bear"], "oracleText": "", "power": "2", "toughness": "2", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798", "artUrl": "https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798", "commanderLegal": "legal", "set": "slz", "releasedAt": "2026-09-02", "rarity": "common", "layout": "normal", "gameChanger": false} as CardDef);

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** The bots' answers for every question, whoever is asked, until the stack is empty. */
const settleBots = (s: GameState) => {
  for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    s = s.pending ? botActions(s, pid).reduce((x, a) => act(x, a), s) : act(s, { type: "passPriority", player: pid });
  }
  return s;
};
/** `defs` on top of `pid`'s library, `defs[0]` first; their ids in the same order. */
function onTop(s: GameState, pid: PlayerId, defs: CardDef[]): ObjectId[] {
  const ids = defs.map((d) => {
    const id = putOnBattlefield(s, pid, d);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "library";
    return id;
  });
  s.players[pid]!.library.unshift(...ids);
  invalidateCharacteristics(s);
  return ids;
}
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const lifeOf = (s: GameState) => s.turnOrder.map((p) => s.players[p]!.life);

/** Lady Loki on `ap`'s battlefield, `hand` in hand, `top` on top of the library. */
function lokiOut(hand: CardDef[], top: CardDef[]) {
  const { s, ap, opp, ids } = setup(hand);
  const lokiId = putOnBattlefield(s, ap, loki());
  const lib = onTop(s, ap, top);
  return { s, ap, opp, ids, lokiId, lib };
}

describe("round 421: the cards compile", () => {
  it("are fully supported", () => {
    for (const d of [loki(), medomai(), squall()]) expect(isFullySupported(d), d.name).toBe(true);
  });
});

describe("round 421: Lady Loki, Agent of Chaos", () => {
  it("exiles the first sorcery, exiles down to a nonland card, deals the difference to each opponent, and may cast that card", () => {
    const { s: s0, ap, opp, ids, lib } = lokiOut([divination()], [forest, forest, bolt()]);
    const before = lifeOf(s0);
    const hand0 = s0.players[ap]!.hand.length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    // The trigger resolved up to the cast: Divination exiled (never resolved, no cards drawn), the two Forests and the
    // Bolt exiled, 3 - 1 = 2 damage to each opponent, none to you.
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: lib[2] });
    expect(zone(s, ids[0]!)).toBe("exile");
    expect(lib.map((id) => zone(s, id))).toEqual(["exile", "exile", "exile"]);
    const apIdx = s.turnOrder.indexOf(ap);
    expect(lifeOf(s)).toEqual(before.map((l, i) => (i === apIdx ? l : l - 2)));
    s = act(s, { type: "castSpell", player: ap, objectId: lib[2]!, targets: [{ kind: "player", id: opp }] });
    s = settle(s);
    expect(zone(s, lib[2]!)).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(before[s.turnOrder.indexOf(opp)]! - 5);
    // The Forests stay in exile; Divination was never resolved.
    expect(lib.slice(0, 2).map((id) => zone(s, id))).toEqual(["exile", "exile"]);
    expect(s.players[ap]!.hand.length).toBe(hand0 - 1);
  });

  it("only the first instant, sorcery or Villain spell each turn: a second one resolves as usual", () => {
    const { s: s0, ap, ids, lib } = lokiOut([divination(), divination()], [bolt(), bolt(), bolt()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: lib[0] });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    // Declined: the Bolt stays in exile.
    expect(zone(s, lib[0]!)).toBe("exile");
    const life = lifeOf(s);
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(s.pending).toBeNull();
    expect(zone(s, ids[1]!)).toBe("graveyard");
    // Divination drew the two Bolts left on top.
    expect(zone(s, lib[1]!)).toBe("hand");
    expect(zone(s, lib[2]!)).toBe("hand");
    expect(lifeOf(s)).toEqual(life);
  });

  it("a Villain creature spell counts, a creature spell that isn't one doesn't (and doesn't use up the first)", () => {
    const { s: s0, ap, ids, lib } = lokiOut([bears(), doombot()], [bolt()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeNull();
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(zone(s, lib[0]!)).toBe("library");
    const before = lifeOf(s);
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(zone(s, ids[1]!)).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: lib[0] });
    // Both mana value 1: no damage.
    expect(lifeOf(s)).toEqual(before);
  });

  it("an X spell's mana value counts its X, as it was on the stack", () => {
    const { s: s0, ap, opp, ids } = lokiOut([blaze()], [bears()]);
    const before = lifeOf(s0);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, undefined, 4)));
    // Blaze with X = 4 has mana value 5; the Bears 2: 3 damage to each opponent.
    expect(zone(s, ids[0]!)).toBe("exile");
    const apIdx = s.turnOrder.indexOf(ap);
    expect(lifeOf(s)).toEqual(before.map((l, i) => (i === apIdx ? l : l - 3)));
    expect(s.pending).toMatchObject({ kind: "castFree" });
  });

  it("with no nonland card in the library, that card's mana value is 0 (CR 107.2): the spell's whole mana value", () => {
    const { s: s0, ap, ids } = lokiOut([divination()], []);
    const p = s0.players[ap]!;
    const lands = [forest, forest, forest].map(() => {
      const id = putOnBattlefield(s0, ap, forest);
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      s0.objects[id]!.zone = "library";
      return id;
    });
    for (const id of p.library) s0.objects[id]!.zone = "exile";
    p.library = lands;
    invalidateCharacteristics(s0);
    const before = lifeOf(s0);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeNull();
    expect(lands.map((id) => zone(s, id))).toEqual(["exile", "exile", "exile"]);
    const apIdx = s.turnOrder.indexOf(ap);
    expect(lifeOf(s)).toEqual(before.map((l, i) => (i === apIdx ? l : l - 3)));
  });

  it("bots play it through", () => {
    const { s: s0, ap, ids, lib } = lokiOut([divination()], [forest, bolt()]);
    const s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeNull();
    expect(zone(s, ids[0]!)).toBe("exile");
    expect(["graveyard", "exile"]).toContain(zone(s, lib[1]!));
  });
});

describe("round 421: Medomai's Prophecy", () => {
  /** On to `ap`'s next precombat main phase, its hand emptied first (so no cleanup discard); the Saga's chapter triggers then. */
  const nextTurn = (s0: GameState, ap: PlayerId) => {
    s0.players[ap]!.hand = [];
    const o = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    return passUntil(passUntil(s0, "upkeep", o), "main1", ap);
  };
  const toHand = (s: GameState, pid: PlayerId, defs: CardDef[]) =>
    defs.map((d) => {
      const id = putOnBattlefield(s, pid, d);
      s.battlefield.splice(s.battlefield.indexOf(id), 1);
      s.objects[id]!.zone = "hand";
      s.players[pid]!.hand.push(id);
      invalidateCharacteristics(s);
      return id;
    });
  /** The Saga with one lore counter, on to chapter II, and "Lightning Bolt" named. */
  function named() {
    const { s: s0, ap, opp } = setup([]);
    const saga = putOnBattlefield(s0, ap, medomai());
    s0.objects[saga]!.counters.lore = 1;
    moveObject(s0, putOnBattlefield(s0, opp, bolt()), "exile"); // a card in the game with that name
    let s = settle(nextTurn(s0, ap));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "cardName", player: ap, purpose: "own" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Lightning Bolt" }));
    expect(s.objects[saga]!.chosen?.name).toBe("Lightning Bolt");
    return { s, ap, opp, saga };
  }

  it("chapter III: the first spell with the chosen name cast this turn draws two cards, once; other names don't", () => {
    const { s: s1, ap, opp } = named();
    let s = settle(nextTurn(s1, ap));
    expect(s.floatingTriggers?.length).toBe(1);
    const [div, b1, b2] = toHand(s, ap, [divination(), bolt(), bolt()]);
    const h = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, div!)));
    expect(s.players[ap]!.hand.length).toBe(h + 1); // Divination's own two only
    s = settle(run(s, planCast(s, ap, b1!, [{ kind: "player", id: opp }])));
    expect(s.players[ap]!.hand.length).toBe(h + 2); // a Bolt cast, two drawn
    expect(s.floatingTriggers?.length ?? 0).toBe(0);
    s = settle(run(s, planCast(s, ap, b2!, [{ kind: "player", id: opp }])));
    expect(s.players[ap]!.hand.length).toBe(h + 1);
  });

  it("chapter III: not if a spell with that name was already cast this turn, before it resolved", () => {
    const { s: s1, ap, opp } = named();
    let s = nextTurn(s1, ap);
    // Chapter III's trigger on the stack: a Bolt cast in response is the first with that name this turn.
    expect(s.stack.length).toBe(1);
    const [b1, b2] = toHand(s, ap, [bolt(), bolt()]);
    s = settle(run(s, planCast(s, ap, b1!, [{ kind: "player", id: opp }])));
    expect(s.floatingTriggers?.length).toBe(1);
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, b2!, [{ kind: "player", id: opp }])));
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
  });

  it("chapter III's trigger ends with the turn", () => {
    const { s: s1, ap, opp } = named();
    let s = settle(nextTurn(s1, ap));
    expect(s.floatingTriggers?.length).toBe(1);
    // Chapter IV next turn, then the Saga is sacrificed; the delayed trigger is long gone.
    s = settle(nextTurn(s, ap));
    expect(s.floatingTriggers?.length ?? 0).toBe(0);
    const [b1] = toHand(s, ap, [bolt()]);
    const h = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, b1!, [{ kind: "player", id: opp }])));
    expect(s.players[ap]!.hand.length).toBe(h - 1);
  });

  it("the name is read as the Saga last existed if it's gone before chapter III resolves (CR 608.2h)", () => {
    const { s: s1, ap, opp, saga } = named();
    let s = nextTurn(s1, ap);
    expect(s.stack.length).toBe(1);
    moveObject(s, saga, "graveyard");
    s = settle(s);
    expect(s.floatingTriggers?.length).toBe(1);
    const [b1] = toHand(s, ap, [bolt()]);
    const h = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, b1!, [{ kind: "player", id: opp }])));
    expect(s.players[ap]!.hand.length).toBe(h + 1);
  });

  it("with no name chosen (a new object), chapter III makes nothing", () => {
    const { s: s0, ap } = setup([]);
    const saga = putOnBattlefield(s0, ap, medomai());
    s0.objects[saga]!.counters.lore = 2;
    const s = settle(nextTurn(s0, ap));
    expect(s.pending).toBeNull();
    expect(s.floatingTriggers?.length ?? 0).toBe(0);
  });

  it("a bot names a card of its own for chapter II", () => {
    const { s: s0, ap } = setup([]);
    const saga = putOnBattlefield(s0, ap, medomai());
    s0.objects[saga]!.counters.lore = 1;
    let s = nextTurn(s0, ap);
    toHand(s, ap, [divination()]);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "cardName" });
    const [a] = botActions(s, ap);
    const mine = new Set([...s.players[ap]!.hand, ...s.players[ap]!.library].map((id) => s.cards[s.objects[id]!.cardId]!.name));
    expect(a).toMatchObject({ type: "chooseOption" });
    expect(mine.has((a as { choice: string }).choice)).toBe(true);
  });
});

describe("round 421: Squall, Gunblade Duelist", () => {
  const giant = () => bear({ name: "Hill Giant", power: "3", toughness: "3" });
  /** Squall (3/2) on `ap`'s battlefield with `number` chosen. */
  function squallOut(number = 2) {
    const { s, ap, opp } = setup([]);
    const sq = putOnBattlefield(s, ap, squall());
    s.objects[sq]!.chosen = { number };
    const others = s.turnOrder.filter((p) => p !== ap);
    return { s, ap, opp, sq, others };
  }
  const lifeOf = (s: GameState) => Object.fromEntries(s.turnOrder.map((p) => [p, s.players[p]!.life]));
  const sqPower = Number(squall().power);

  it("triggers once for each opponent attacked by a creature with that power or toughness, dealing ~'s power to that player", () => {
    const { s: s0, ap, sq, others } = squallOut();
    const b = putOnBattlefield(s0, ap, bear());
    const g = putOnBattlefield(s0, ap, giant());
    let s = passUntil(s0, "declareAttackers", ap);
    const before = lifeOf(s);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: others[0]! }, { attacker: g, defender: others[1]! }] });
    s = settle(s);
    const after = lifeOf(s);
    expect(after[others[0]!]).toBe(before[others[0]!]! - sqPower);
    expect(after[others[1]!]).toBe(before[others[1]!]);
    expect(after[ap]).toBe(before[ap]);
    expect(s.objects[sq]!.zone).toBe("battlefield");
  });

  it("no creature with that power or toughness: no trigger at all", () => {
    const { s: s0, ap, others } = squallOut();
    const g = putOnBattlefield(s0, ap, giant());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: g, defender: others[0]! }] });
    expect(s.triggerQueue.length + s.stack.length).toBe(0);
  });

  it("toughness counts too, and another player's creatures attacking your opponent do; attacking you doesn't", () => {
    const { s: s0, ap, opp } = squallOut(3);
    const third = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const wall = putOnBattlefield(s0, opp, bear({ name: "Wall Thing", power: "1", toughness: "3" }));
    const wall2 = putOnBattlefield(s0, opp, bear({ name: "Wall Thing", power: "1", toughness: "3" }));
    let s = passUntil(s0, "declareAttackers", opp);
    const before = lifeOf(s);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: wall, defender: third }, { attacker: wall2, defender: ap }] });
    s = settle(s);
    const after = lifeOf(s);
    expect(after[third]).toBe(before[third]! - sqPower);
    expect(after[ap]).toBe(before[ap]);
  });

  it("checked again as it resolves: a creature pumped past the number by then does nothing (CR 603.4)", () => {
    const { s: s0, ap, others } = squallOut();
    const b = putOnBattlefield(s0, ap, bear());
    let s = passUntil(s0, "declareAttackers", ap);
    const before = lifeOf(s);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: others[0]! }] });
    expect(s.triggerQueue.length + s.stack.length).toBeGreaterThan(0);
    addEffect(s, ap, [b], [{ kind: "modifyPT", power: 1, toughness: 1 }]);
    s = settle(s);
    expect(lifeOf(s)[others[0]!]).toBe(before[others[0]!]);
  });

  it("a creature gone by then counts as it last existed on the battlefield (rulings)", () => {
    const { s: s0, ap, others } = squallOut();
    const b = putOnBattlefield(s0, ap, bear());
    let s = passUntil(s0, "declareAttackers", ap);
    const before = lifeOf(s);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: others[0]! }] });
    moveObject(s, b, "graveyard");
    s = settle(s);
    expect(lifeOf(s)[others[0]!]).toBe(before[others[0]!]! - sqPower);
  });

  it("a bot chooses the power or toughness most common among its creatures", () => {
    const { s: s0, ap, ids } = setup([squall()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "number" });
    const [a] = botActions(s, ap);
    // The library is Forests and Grizzly Bears.
    expect(a).toMatchObject({ type: "chooseOption", choice: "2" });
    s = settle(act(s, a!));
    expect(s.objects[ids[0]!]!.chosen?.number).toBe(2);
  });
});
