// Round 420 (Lane A): Kotose, the Silent Spider ("exile target card other than a basic land card from an opponent's
// graveyard. Search that player's graveyard, hand, and library for any number of cards with the same name as that card
// and exile them. Then that player shuffles. For as long as you control ~, you may play one of the exiled cards, and you
// may spend mana as though it were mana of any color to cast it.", CR 701.23, 611.2b, 609.4b), Allure of the Unknown (an
// opponent exiles one of the revealed nonland cards and may cast it free, CR 608.2d, 608.2g, 118.9) and Cloak and Dagger,
// Entwined (a nonland card from the target opponent's hand or the chosen creature, exiled until it leaves, CR 610.3).

import { describe, expect, it } from "vitest";
import { act, bear, forest, passUntil, putOnBattlefield, setup, swamp } from "./helpers";
import { applyAction, botActions, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";
import { moveObject } from "../src/game";

// Real card data (Scryfall).
const kotose = (): CardDef => ({"oracleId": "bfef4daa-b950-46ce-8c08-11f9983741cf", "name": "Kotose, the Silent Spider", "manaCost": "{3}{U}{B}", "cmc": 5, "typeLine": "Legendary Creature — Human Ninja", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Human", "Ninja"], "oracleText": "When Kotose enters, exile target card other than a basic land card from an opponent's graveyard. Search that player's graveyard, hand, and library for any number of cards with the same name as that card and exile them. Then that player shuffles. For as long as you control Kotose, you may play one of the exiled cards, and you may spend mana as though it were mana of any color to cast it.", "power": "4", "toughness": "4", "colors": ["B", "U"], "colorIdentity": ["B", "U"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/3/1/314e97b5-cd43-4f5e-acdd-a107208e061c.jpg?1783923832", "artUrl": "https://cards.scryfall.io/art_crop/front/3/1/314e97b5-cd43-4f5e-acdd-a107208e061c.jpg?1783923832", "commanderLegal": "legal", "set": "neo", "releasedAt": "2022-02-18", "rarity": "rare", "layout": "normal", "gameChanger": false} as CardDef);
const cloak = (): CardDef => ({"oracleId": "64132f93-66ac-4794-8c07-a88f9ed0e22b", "name": "Cloak and Dagger, Entwined", "manaCost": "{1}{W}{B}", "cmc": 3, "typeLine": "Legendary Creature — Human Hero", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Human", "Hero"], "oracleText": "Deathtouch, lifelink\nWhen Cloak and Dagger enter, choose target opponent and up to one target creature they control. They reveal their hand. You may exile a nonland card from their hand or the chosen creature until Cloak and Dagger leave the battlefield.", "power": "2", "toughness": "2", "colors": ["B", "W"], "colorIdentity": ["B", "W"], "keywords": ["Lifelink", "Deathtouch"], "imageUrl": "https://cards.scryfall.io/normal/front/5/0/50aa361c-72fd-4ecb-b877-a27646c66ad0.jpg?1783902830", "artUrl": "https://cards.scryfall.io/art_crop/front/5/0/50aa361c-72fd-4ecb-b877-a27646c66ad0.jpg?1783902830", "commanderLegal": "legal", "set": "msh", "releasedAt": "2026-06-26", "rarity": "rare", "layout": "normal", "gameChanger": false} as CardDef);
const allure = (): CardDef => ({"oracleId": "252d9b25-45a1-40ca-b563-4cdefc791a44", "name": "Allure of the Unknown", "manaCost": "{3}{B}{R}", "cmc": 5, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Reveal the top six cards of your library. An opponent exiles a nonland card from among them, then you put the rest into your hand. That opponent may cast the exiled card without paying its mana cost.", "colors": ["B", "R"], "colorIdentity": ["B", "R"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/f/7/f77e09c3-917c-4bbb-bb94-60f4e9417832.jpg?1783931526", "artUrl": "https://cards.scryfall.io/art_crop/front/f/7/f77e09c3-917c-4bbb-bb94-60f4e9417832.jpg?1783931526", "commanderLegal": "legal", "set": "thb", "releasedAt": "2020-01-24", "rarity": "rare", "layout": "normal", "gameChanger": false} as CardDef);
const bolt = (): CardDef => ({"oracleId": "4457ed35-7c10-48c8-9776-456485fdf070", "name": "Lightning Bolt", "manaCost": "{R}", "cmc": 1, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Lightning Bolt deals 3 damage to any target.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008", "artUrl": "https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008", "commanderLegal": "legal", "set": "msc", "releasedAt": "2026-06-26", "rarity": "uncommon", "layout": "normal", "gameChanger": false} as CardDef);
const divination = (): CardDef => ({"oracleId": "273b339c-964b-4a18-8eb5-ceb8abcdfd9e", "name": "Divination", "manaCost": "{2}{U}", "cmc": 3, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Draw two cards.", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025", "artUrl": "https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025", "commanderLegal": "legal", "set": "dom", "releasedAt": "2018-04-27", "rarity": "common", "layout": "normal", "gameChanger": false} as CardDef);
const solRing = (): CardDef => ({"oracleId": "6ad8011d-3471-4369-9d68-b264cc027487", "name": "Sol Ring", "manaCost": "{1}", "cmc": 1, "typeLine": "Artifact", "supertypes": [], "types": ["Artifact"], "subtypes": [], "oracleText": "{T}: Add {C}{C}.", "colors": [], "colorIdentity": [], "keywords": [], "producedMana": ["C"], "imageUrl": "https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446", "artUrl": "https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446", "commanderLegal": "legal", "set": "frc", "releasedAt": "2026-10-02", "rarity": "uncommon", "layout": "normal", "gameChanger": false} as CardDef);

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
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
/** The bots' answers for every question, whoever is asked, until the stack is empty. */
const settleBots = (s: GameState) => {
  for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    s = s.pending ? botActions(s, pid).reduce((x, a) => act(x, a), s) : act(s, { type: "passPriority", player: pid });
  }
  return s;
};
/** `defs` into `pid`'s `zone` (on top of the library, `defs[0]` first); their ids in the same order. */
function place(s: GameState, pid: PlayerId, zone: "graveyard" | "hand" | "library", defs: CardDef[]): ObjectId[] {
  const ids = defs.map((d) => {
    const id = putOnBattlefield(s, pid, d);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = zone;
    return id;
  });
  if (zone === "library") s.players[pid]!.library.unshift(...ids);
  else s.players[pid]![zone].push(...ids);
  invalidateCharacteristics(s);
  return ids;
}
/** Only these lands for `pid`: the others setup() gave are gone. */
function onlyLands(s: GameState, pid: PlayerId, defs: CardDef[]) {
  for (const id of [...s.battlefield]) if (s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land")) moveObject(s, id, "graveyard");
  return defs.map((d) => putOnBattlefield(s, pid, d));
}
/** Whether `pid` can cast the Bolt or Divination `id` now at `at`, tapping their lands for it. */
const canCast = (s: GameState, pid: PlayerId, id: ObjectId, at?: PlayerId) => planCast(s, pid, id, at !== undefined && s.cards[s.objects[id]!.cardId]!.name === "Lightning Bolt" ? [{ kind: "player", id: at }] : undefined) !== null;
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const logText = (s: GameState) => s.log.map((e) => e.text).join("\n");

describe("round 420: the cards compile", () => {
  it("are fully supported", () => {
    for (const d of [kotose(), allure(), cloak()]) expect(isFullySupported(d), d.name).toBe(true);
  });
});

describe("round 420: Kotose, the Silent Spider", () => {
  /** Kotose cast and its enters trigger aimed at the opponent's graveyard Bolt; copies in their hand and library. */
  function kotoseIn() {
    const { s: s0, ap, opp, ids } = setup([kotose()]);
    const [yardBolt] = place(s0, opp, "graveyard", [bolt()]);
    const [handBolt] = place(s0, opp, "hand", [bolt()]);
    const [libBolt] = place(s0, opp, "library", [bolt()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(yardBolt!)] }));
    return { s, ap, opp, k: ids[0]!, yardBolt: yardBolt!, handBolt: handBolt!, libBolt: libBolt! };
  }

  it("exiles the target and the cards with its name you find; you may play one of them, with mana of any color, while you control Kotose", () => {
    let { s, ap, opp, yardBolt, handBolt, libBolt } = kotoseIn();
    // The target is exiled first; then the search of their graveyard, hand and library (any number of them, rulings).
    expect(zone(s, yardBolt)).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, zonesOf: opp });
    const p = s.pending?.kind === "searchLibrary" ? s.pending : undefined;
    expect([...p!.cards].sort()).toEqual([handBolt, libBolt].sort());
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [handBolt, libBolt] }));
    expect([zone(s, handBolt), zone(s, libBolt)]).toEqual(["exile", "exile"]);
    expect(logText(s)).toMatch(/may play one of Lightning Bolt, Lightning Bolt, Lightning Bolt for as long as they control Kotose/);
    // Only Swamps: a Bolt from among them is cast with black mana as though it were red (CR 609.4b).
    onlyLands(s, ap, [swamp, swamp]);
    for (const id of [yardBolt, handBolt, libBolt]) expect(canCast(s, ap, id, opp), id).toBe(true);
    expect(canCast(s, opp, yardBolt, ap)).toBe(false);
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, handBolt, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(life - 3);
    // One of them only (rulings): the others stay exiled for good.
    expect(canCast(s, ap, yardBolt, opp)).toBe(false);
    expect(canCast(s, ap, libBolt, opp)).toBe(false);
  });

  it("some cards with that name may be left where they are, and those found can't be played once you no longer control Kotose", () => {
    let { s, ap, opp, k, yardBolt, handBolt, libBolt } = kotoseIn();
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }));
    expect(zone(s, handBolt)).toBe("hand");
    expect(zone(s, libBolt)).toBe("library");
    expect(canCast(s, ap, yardBolt, opp)).toBe(true);
    // Kotose leaves: the permission is over, and doesn't come back (rulings).
    moveObject(s, k, "graveyard");
    invalidateCharacteristics(s);
    expect(canCast(s, ap, yardBolt, opp)).toBe(false);
    expect(s.objects[yardBolt]!.owner).toBe(opp);
  });

  it("a land card can be the target only if it isn't basic, and is then played with your land play", () => {
    const { s: s0, ap, opp, ids } = setup([kotose()]);
    const fake = { ...forest, oracleId: "nonbasic-forest", name: "Gaea's Grove", typeLine: "Land", supertypes: [] } as CardDef;
    const [basic] = place(s0, opp, "graveyard", [forest]);
    const [grove] = place(s0, opp, "graveyard", [fake]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const p = s.pending?.kind === "chooseTargets" ? s.pending : undefined;
    expect(p).toBeDefined();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(grove!)] }));
    expect(zone(s, grove!)).toBe("exile");
    expect(zone(s, basic!)).toBe("graveyard");
    s.players[ap]!.landsPlayedThisTurn = 0;
    s = act(s, { type: "playLand", player: ap, objectId: grove! });
    expect(s.objects[grove!]).toMatchObject({ zone: "battlefield", controller: ap, owner: opp });
  });

  it("bots answer the search", () => {
    let { s } = kotoseIn();
    s = settleBots(s);
    expect(s.stack.length).toBe(0);
    expect(s.pending).toBeNull();
  });
});

describe("round 420: Allure of the Unknown", () => {
  function allureCast(top: CardDef[]) {
    const { s: s0, ap, opp, ids } = setup([allure()]);
    const lib = place(s0, ap, "library", top);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    return { s, ap, opp, lib };
  }

  it("the opponent you choose exiles a nonland card, you take the rest, and that opponent may cast it for free as it resolves", () => {
    let { s, ap, opp, lib } = allureCast([bear(), forest, divination(), forest, forest, forest]);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "opponent" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: String(opp) }));
    // The opponent picks one of the two nonland cards.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: opp, min: 1, max: 1 });
    const p = s.pending?.kind === "searchLibrary" ? s.pending : undefined;
    expect([...p!.cards].sort()).toEqual([lib[0]!, lib[2]!].sort());
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "searchLibrary", player: opp, found: [lib[0]!] }));
    expect(zone(s, lib[0]!)).toBe("exile");
    expect(s.players[ap]!.hand.length).toBe(hand + 5);
    // That opponent may cast the Bears now, on your turn, for free (timing ignored, rulings).
    expect(s.pending).toMatchObject({ kind: "castFree", player: opp, objectId: lib[0] });
    s = settle(act(s, { type: "castSpell", player: opp, objectId: lib[0]! }));
    expect(s.objects[lib[0]!]).toMatchObject({ zone: "battlefield", controller: opp, owner: ap });
  });

  it("declined, the card stays exiled and can't be cast later", () => {
    let { s, ap, opp, lib } = allureCast([divination(), forest, forest, forest, forest, forest]);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: String(opp) }));
    // One nonland card: that one is exiled, no choice to make.
    expect(zone(s, lib[0]!)).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "castFree", player: opp });
    s = settle(act(s, { type: "chooseMay", player: opp, yes: false }));
    expect(s.stack.length).toBe(0);
    expect(zone(s, lib[0]!)).toBe("exile");
    expect(s.objects[lib[0]!]!.mayPlay).toBeUndefined();
    expect(canCast(s, opp, lib[0]!)).toBe(false);
    expect(canCast(s, ap, lib[0]!)).toBe(false);
  });

  it("with only lands revealed, nothing is exiled and all six go to your hand (rulings)", () => {
    let { s, ap, lib } = allureCast([forest, forest, forest, forest, forest, forest]);
    s = settle(s);
    expect(s.pending).toBeNull();
    for (const id of lib) expect(zone(s, id)).toBe("hand");
    expect(s.players[ap]!.hand).toEqual(expect.arrayContaining(lib));
  });

  it("bots choose, pick and cast", () => {
    let { s, ap, lib } = allureCast([bear(), divination(), solRing(), forest, forest, forest]);
    s = settleBots(s);
    expect(s.pending).toBeNull();
    // One of the three nonland cards is exiled (and maybe cast: a permanent the opponent's, Divination in your graveyard).
    const ex = lib.slice(0, 3).filter((id) => s.objects[id]!.zone !== "hand");
    expect(ex.length).toBe(1);
    const o = s.objects[ex[0]!]!;
    expect(o.zone === "exile" || o.zone === "graveyard" || (o.zone === "battlefield" && o.controller !== ap)).toBe(true);
    expect(logText(s)).toMatch(/chooses [A-D] for Allure of the Unknown/);
  });
});

describe("round 420: Cloak and Dagger, Entwined", () => {
  function cloakIn() {
    const { s: s0, ap, opp, ids } = setup([cloak(), bolt()]);
    const [theirBolt, theirForest] = place(s0, opp, "hand", [bolt(), forest]);
    const b = putOnBattlefield(s0, opp, bear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    return { s, ap, opp, cd: ids[0]!, myBolt: ids[1]!, theirBolt: theirBolt!, theirForest: theirForest!, b };
  }

  it("the opponent reveals their hand; a nonland card from it is exiled until Cloak and Dagger leave", () => {
    let { s, ap, opp, cd, myBolt, theirBolt, theirForest, b } = cloakIn();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }, tgt(b)] }));
    expect(logText(s)).toMatch(/reveals .*Lightning Bolt.*Forest|reveals .*Forest.*Lightning Bolt/);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 1, hand: opp });
    const p = s.pending?.kind === "searchLibrary" ? s.pending : undefined;
    // Their nonland cards and the chosen creature; not the Forest.
    expect(p!.cards).toContain(theirBolt);
    expect(p!.cards).toContain(b);
    expect(p!.cards).not.toContain(theirForest);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [theirBolt] }));
    expect(zone(s, theirBolt)).toBe("exile");
    expect(zone(s, b)).toBe("battlefield");
    // They leave: the card returns to its owner's hand (CR 610.3a).
    s = settle(run(s, planCast(s, ap, myBolt, [tgt(cd)])));
    expect(zone(s, cd)).toBe("graveyard");
    expect(zone(s, theirBolt)).toBe("hand");
    expect(s.players[opp]!.hand).toContain(theirBolt);
  });

  it("or the chosen creature is exiled until they leave, and returns to the battlefield", () => {
    let { s, ap, opp, cd, myBolt, theirBolt, b } = cloakIn();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }, tgt(b)] }));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [b] }));
    expect(zone(s, b)).toBe("exile");
    expect(zone(s, theirBolt)).toBe("hand");
    s = settle(run(s, planCast(s, ap, myBolt, [tgt(cd)])));
    const back = s.battlefield.map((id) => s.objects[id]!).find((o) => s.cards[o.cardId]!.name === "Grizzly Bears" && o.owner === opp);
    expect(back).toBeDefined();
    expect(back!.controller).toBe(opp);
  });

  it("may exile nothing, and with no creature chosen only the hand's cards are offered", () => {
    let { s, ap, opp, theirBolt, b } = cloakIn();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }, { kind: "none" }] }));
    const p = s.pending?.kind === "searchLibrary" ? s.pending : undefined;
    expect(p!.cards).toContain(theirBolt);
    expect(p!.cards).not.toContain(b);
    expect(p!.cards.every((id) => s.objects[id]!.zone === "hand" && s.objects[id]!.owner === opp)).toBe(true);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }));
    expect(zone(s, theirBolt)).toBe("hand");
    expect(zone(s, b)).toBe("battlefield");
    expect(s.pending).toBeNull();
  });

  it("if Cloak and Dagger have left before it resolves, nothing is exiled (CR 610.3c)", () => {
    let { s, ap, opp, cd, theirBolt, b } = cloakIn();
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }, tgt(b)] });
    moveObject(s, cd, "graveyard");
    invalidateCharacteristics(s);
    s = settle(s);
    expect(s.pending).toBeNull();
    expect(zone(s, theirBolt)).toBe("hand");
    expect(zone(s, b)).toBe("battlefield");
  });

  it("bots exile something", () => {
    let { s, ap, cd } = cloakIn();
    s = settleBots(s);
    expect(s.pending).toBeNull();
    // A card of the opponent it chose (the one with the highest mana value), exiled until Cloak and Dagger leave.
    const ex = s.objects[cd]!.exiledUntilLeaves ?? [];
    expect(ex.length).toBe(1);
    expect(s.objects[ex[0]!.id]).toMatchObject({ zone: "exile" });
    expect(s.objects[ex[0]!.id]!.owner).not.toBe(ap);
  });
});
