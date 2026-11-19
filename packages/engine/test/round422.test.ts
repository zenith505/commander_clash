// Round 422 (Lane A): Possibility Storm ("Whenever a player casts a spell from their hand, that player exiles it, then
// exiles cards from the top of their library until they exile a card that shares a card type with it. That player may
// cast that card without paying its mana cost. Then they put all cards exiled with ~ on the bottom of their library in a
// random order.", CR 205.2a, 608.2g, 608.2h), Knowledge Pool (its imprint's cards and the spells its trigger exiles are
// "exiled with ~", CR 607.2a; "If the player does" only once the spell was exiled, rulings) and Ashnod the Uncaring ("if
// one or more permanents were sacrificed to activate it": to pay its costs, not for mana, CR 602.2b, 603.4, rulings).

import { describe, expect, it } from "vitest";
import { act, forest, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const storm = (): CardDef => ({"oracleId": "8586169f-cb8c-4424-ba64-a7c1cc00680e", "name": "Possibility Storm", "manaCost": "{3}{R}{R}", "cmc": 5, "typeLine": "Enchantment", "supertypes": [], "types": ["Enchantment"], "subtypes": [], "oracleText": "Whenever a player casts a spell from their hand, that player exiles it, then exiles cards from the top of their library until they exile a card that shares a card type with it. That player may cast that card without paying its mana cost. Then they put all cards exiled with this enchantment on the bottom of their library in a random order.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/7/b/7b9eb4e1-7bb6-4224-a47a-051c04df98c0.jpg?1783904231", "artUrl": "https://cards.scryfall.io/art_crop/front/7/b/7b9eb4e1-7bb6-4224-a47a-051c04df98c0.jpg?1783904231", "commanderLegal": "legal", "set": "sld", "releasedAt": "2026-02-23", "rarity": "rare", "layout": "normal", "gameChanger": false} as CardDef);
const pool = (): CardDef => ({"oracleId": "cb53bd72-dee8-46fa-b0f9-1eee3a99379a", "name": "Knowledge Pool", "manaCost": "{6}", "cmc": 6, "typeLine": "Artifact", "supertypes": [], "types": ["Artifact"], "subtypes": [], "oracleText": "Imprint — When this artifact enters, each player exiles the top three cards of their library.\nWhenever a player casts a spell from their hand, that player exiles it. If the player does, they may cast a spell from among other cards exiled with this artifact without paying its mana cost.", "colors": [], "colorIdentity": [], "keywords": ["Imprint"], "imageUrl": "https://cards.scryfall.io/normal/front/3/9/393454c2-b256-4a6e-9bc2-56a47cab5073.jpg?1783941368", "artUrl": "https://cards.scryfall.io/art_crop/front/3/9/393454c2-b256-4a6e-9bc2-56a47cab5073.jpg?1783941368", "commanderLegal": "legal", "set": "mbs", "releasedAt": "2011-02-04", "rarity": "rare", "layout": "normal", "gameChanger": false} as CardDef);
const ashnod = (): CardDef => ({"oracleId": "dcd5ab1b-adc5-486e-a1e0-636af6ee9470", "name": "Ashnod the Uncaring", "manaCost": "{2}{U}{B}{R}", "cmc": 5, "typeLine": "Legendary Creature — Human Artificer", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Human", "Artificer"], "oracleText": "Deathtouch\nWhenever you activate an ability of an artifact or creature that isn't a mana ability, if one or more permanents were sacrificed to activate it, you may copy that ability. You may choose new targets for the copy. (Sacrificing an artifact for mana to activate an ability doesn't count.)", "power": "1", "toughness": "4", "colors": ["B", "R", "U"], "colorIdentity": ["B", "R", "U"], "keywords": ["Deathtouch"], "imageUrl": "https://cards.scryfall.io/normal/front/a/7/a76e8ab8-33bf-4a5a-b6a2-7046301b6c31.jpg?1783919723", "artUrl": "https://cards.scryfall.io/art_crop/front/a/7/a76e8ab8-33bf-4a5a-b6a2-7046301b6c31.jpg?1783919723", "commanderLegal": "legal", "set": "brc", "releasedAt": "2022-11-18", "rarity": "mythic", "layout": "normal", "gameChanger": false} as CardDef);
const fanatic = (): CardDef => ({"oracleId": "7efd5d62-6da2-428a-98e3-5b842f668656", "name": "Mogg Fanatic", "manaCost": "{R}", "cmc": 1, "typeLine": "Creature — Goblin", "supertypes": [], "types": ["Creature"], "subtypes": ["Goblin"], "oracleText": "Sacrifice this creature: It deals 1 damage to any target.", "power": "1", "toughness": "1", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/c/a/ca2ecfd4-c874-4468-8601-87aa110d5a00.jpg?1783946627", "artUrl": "https://cards.scryfall.io/art_crop/front/c/a/ca2ecfd4-c874-4468-8601-87aa110d5a00.jpg?1783946627", "commanderLegal": "legal", "set": "tmp", "releasedAt": "1997-10-14", "rarity": "common", "layout": "normal", "gameChanger": false} as CardDef);
const bolt = (): CardDef => ({"oracleId": "4457ed35-7c10-48c8-9776-456485fdf070", "name": "Lightning Bolt", "manaCost": "{R}", "cmc": 1, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Lightning Bolt deals 3 damage to any target.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008", "artUrl": "https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008", "commanderLegal": "legal", "set": "msc", "releasedAt": "2026-06-26", "rarity": "uncommon", "layout": "normal", "gameChanger": false} as CardDef);
const divination = (): CardDef => ({"oracleId": "273b339c-964b-4a18-8eb5-ceb8abcdfd9e", "name": "Divination", "manaCost": "{2}{U}", "cmc": 3, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Draw two cards.", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025", "artUrl": "https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025", "commanderLegal": "legal", "set": "dom", "releasedAt": "2018-04-27", "rarity": "common", "layout": "normal", "gameChanger": false} as CardDef);
const citadel = (): CardDef => ({"oracleId": "8dc067bf-f78f-4ac4-b6e7-b305c42cf0bc", "name": "Darksteel Citadel", "manaCost": "", "cmc": 0, "typeLine": "Artifact Land", "supertypes": [], "types": ["Artifact", "Land"], "subtypes": [], "oracleText": "Indestructible\n{T}: Add {C}.", "colors": [], "colorIdentity": [], "keywords": ["Indestructible"], "producedMana": ["C"], "imageUrl": "https://cards.scryfall.io/normal/front/c/d/cdfafa38-e7db-4a42-99b8-fc65ab41c572.jpg?1783925163", "artUrl": "https://cards.scryfall.io/art_crop/front/c/d/cdfafa38-e7db-4a42-99b8-fc65ab41c572.jpg?1783925163", "commanderLegal": "legal", "set": "sld", "releasedAt": "2021-10-15", "rarity": "rare", "layout": "normal", "gameChanger": false} as CardDef);
const mindStone = (): CardDef => ({"oracleId": "c97361b5-af16-4a7b-af85-a429dbaf4ad2", "name": "Mind Stone", "manaCost": "{2}", "cmc": 2, "typeLine": "Artifact", "supertypes": [], "types": ["Artifact"], "subtypes": [], "oracleText": "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.", "colors": [], "colorIdentity": [], "keywords": [], "producedMana": ["C"], "imageUrl": "https://cards.scryfall.io/normal/front/7/f/7fdef0b6-a3b9-4752-bce6-53c0140a1693.jpg?1783906237", "artUrl": "https://cards.scryfall.io/art_crop/front/7/f/7fdef0b6-a3b9-4752-bce6-53c0140a1693.jpg?1783906237", "commanderLegal": "legal", "set": "fic", "releasedAt": "2025-06-13", "rarity": "uncommon", "layout": "normal", "gameChanger": false} as CardDef);
const seer = (): CardDef => ({"oracleId": "f82a4e85-526d-4456-b700-7760043a31be", "name": "Viscera Seer", "manaCost": "{B}", "cmc": 1, "typeLine": "Creature — Vampire Wizard", "supertypes": [], "types": ["Creature"], "subtypes": ["Vampire", "Wizard"], "oracleText": "Sacrifice a creature: Scry 1. (Look at the top card of your library. You may put that card on the bottom.)", "power": "1", "toughness": "1", "colors": ["B"], "colorIdentity": ["B"], "keywords": ["Scry"], "imageUrl": "https://cards.scryfall.io/normal/front/d/b/dba1cf83-e13d-401e-b76f-b12a51b307f9.jpg?1783926567", "artUrl": "https://cards.scryfall.io/art_crop/front/d/b/dba1cf83-e13d-401e-b76f-b12a51b307f9.jpg?1783926567", "commanderLegal": "legal", "set": "sld", "releasedAt": "2021-06-21", "rarity": "common", "layout": "normal", "gameChanger": false} as CardDef);
const shock = (): CardDef => ({"oracleId": "a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d", "name": "Shock", "manaCost": "{R}", "cmc": 1, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Shock deals 2 damage to any target.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334", "artUrl": "https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334", "commanderLegal": "legal", "set": "spm", "releasedAt": "2025-09-26", "rarity": "common", "layout": "normal", "gameChanger": false} as CardDef);
const counterspell = (): CardDef => ({"oracleId": "cc187110-1148-4090-bbb8-e205694a39f5", "name": "Counterspell", "manaCost": "{U}{U}", "cmc": 2, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Counter target spell.", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/0/c/0c9a7cb0-5bff-48ff-b620-2838816ac9b5.jpg?1783937618", "artUrl": "https://cards.scryfall.io/art_crop/front/0/c/0c9a7cb0-5bff-48ff-b620-2838816ac9b5.jpg?1783937618", "commanderLegal": "legal", "set": "ema", "releasedAt": "2016-06-10", "rarity": "common", "layout": "normal", "gameChanger": false} as CardDef);
const foothills = (): CardDef => ({"oracleId": "6587a463-a108-4854-b6d1-944e89b8c8a4", "name": "Wooded Foothills", "manaCost": "", "cmc": 0, "typeLine": "Land", "supertypes": [], "types": ["Land"], "subtypes": [], "oracleText": "{T}, Pay 1 life, Sacrifice this land: Search your library for a Mountain or Forest card, put it onto the battlefield, then shuffle.", "colors": [], "colorIdentity": [], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/4/e/4e11ea8a-f895-438d-a3b7-f070238e4161.jpg?1783911232", "artUrl": "https://cards.scryfall.io/art_crop/front/4/e/4e11ea8a-f895-438d-a3b7-f070238e4161.jpg?1783911232", "commanderLegal": "legal", "set": "mh3", "releasedAt": "2024-06-14", "rarity": "rare", "layout": "normal", "gameChanger": false} as CardDef);
const ornithopter = (): CardDef => ({"oracleId": "a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba", "name": "Ornithopter", "manaCost": "{0}", "cmc": 0, "typeLine": "Artifact Creature — Thopter", "supertypes": [], "types": ["Artifact", "Creature"], "subtypes": ["Thopter"], "oracleText": "Flying", "power": "0", "toughness": "2", "colors": [], "colorIdentity": [], "keywords": ["Flying"], "imageUrl": "https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724", "artUrl": "https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724", "commanderLegal": "legal", "set": "aer", "releasedAt": "2017-01-20", "rarity": "uncommon", "layout": "normal", "gameChanger": false} as CardDef);
const bears = (): CardDef => ({"oracleId": "14c8f55d-d177-4c25-a931-ebeb9e6062a0", "name": "Grizzly Bears", "manaCost": "{1}{G}", "cmc": 2, "typeLine": "Creature — Bear", "supertypes": [], "types": ["Creature"], "subtypes": ["Bear"], "oracleText": "", "power": "2", "toughness": "2", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798", "artUrl": "https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798", "commanderLegal": "legal", "set": "slz", "releasedAt": "2026-09-02", "rarity": "common", "layout": "normal", "gameChanger": false} as CardDef);
const elder = (): CardDef => ({"oracleId": "e3afc704-220f-498f-9eaa-0821b17dc24c", "name": "Sakura-Tribe Elder", "manaCost": "{1}{G}", "cmc": 2, "typeLine": "Creature — Snake Shaman", "supertypes": [], "types": ["Creature"], "subtypes": ["Snake", "Shaman"], "oracleText": "Sacrifice this creature: Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.", "power": "1", "toughness": "1", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/5/3/53754cb3-0294-41e0-90d7-a35710ea30e4.jpg?1783923949", "artUrl": "https://cards.scryfall.io/art_crop/front/5/3/53754cb3-0294-41e0-90d7-a35710ea30e4.jpg?1783923949", "commanderLegal": "legal", "set": "nec", "releasedAt": "2022-02-18", "rarity": "common", "layout": "normal", "gameChanger": false} as CardDef);

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
/** How far from the bottom of its owner's library a card is (0: the bottom card), or -1. */
const fromBottom = (s: GameState, id: ObjectId) => {
  const lib = s.players[s.objects[id]!.owner]!.library;
  const i = lib.indexOf(id);
  return i < 0 ? -1 : lib.length - 1 - i;
};

describe("round 422: the cards compile", () => {
  it("are fully supported", () => {
    for (const d of [storm(), pool(), ashnod()]) expect(isFullySupported(d), d.name).toBe(true);
  });
});

describe("round 422: Possibility Storm", () => {
  it("exiles the spell, then cards down to one sharing a card type; that one may be cast free; the rest go to the bottom", () => {
    const { s: s0, ap, ids } = setup([divination()]);
    putOnBattlefield(s0, ap, storm());
    const lib = onTop(s0, ap, [citadel(), bolt(), divination()]);
    const hand0 = s0.players[ap]!.hand.length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    // Divination exiled from the stack, never resolving; Citadel and Bolt aren't sorceries, the second Divination is.
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: lib[2] });
    expect(zone(s, ids[0]!)).toBe("exile");
    expect(lib.map((id) => zone(s, id))).toEqual(["exile", "exile", "exile"]);
    s = settle(act(s, { type: "castSpell", player: ap, objectId: lib[2]! }));
    // Cast from exile, so it doesn't trigger the Storm again: it resolves and draws two.
    expect(s.pending).toBeNull();
    expect(zone(s, lib[2]!)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand0 - 1 + 2);
    // The original Divination, the Citadel and the Bolt: the bottom three cards, in some order.
    for (const id of [ids[0]!, lib[0]!, lib[1]!]) {
      expect(zone(s, id)).toBe("library");
      expect(fromBottom(s, id)).toBeLessThan(3);
    }
  });

  it("the card found and not cast goes to the bottom with the others", () => {
    const { s: s0, ap, ids } = setup([bolt()]);
    putOnBattlefield(s0, ap, storm());
    const opp = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    const lib = onTop(s0, ap, [divination(), shock()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: lib[1] });
    const life = s.players[opp]!.life;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.players[opp]!.life).toBe(life);
    for (const id of [ids[0]!, ...lib]) {
      expect(zone(s, id)).toBe("library");
      expect(fromBottom(s, id)).toBeLessThan(3);
    }
  });

  it("any card type shared stops it, a land too: an artifact land for an artifact spell, which can't be cast", () => {
    const { s: s0, ap, ids } = setup([mindStone()]);
    putOnBattlefield(s0, ap, storm());
    const lib = onTop(s0, ap, [bears(), citadel(), ornithopter()]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    // Bears isn't an artifact; the Citadel is (Artifact Land). A land can't be cast: nothing to ask, all to the bottom.
    expect(s.pending).toBeNull();
    for (const id of [ids[0]!, lib[0]!, lib[1]!]) {
      expect(zone(s, id)).toBe("library");
      expect(fromBottom(s, id)).toBeLessThan(3);
    }
    // The Ornithopter wasn't reached: it's on top now.
    expect(s.players[ap]!.library[0]).toBe(lib[2]);
  });

  it("a creature spell finds an artifact creature; the player who cast it does the rest, not the Storm's controller", () => {
    const { s: s0, ap, ids } = setup([bears()]);
    const opp = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    putOnBattlefield(s0, opp, storm());
    const lib = onTop(s0, ap, [bolt(), ornithopter()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: lib[1] });
    s = settle(act(s, { type: "castSpell", player: ap, objectId: lib[1]! }));
    expect(zone(s, lib[1]!)).toBe("battlefield");
    expect(s.objects[lib[1]!]!.controller ?? s.objects[lib[1]!]!.owner).toBe(ap);
    expect(zone(s, ids[0]!)).toBe("library");
    expect(zone(s, lib[0]!)).toBe("library");
  });

  it("nothing sharing a type: the whole library is exiled, then all of it goes to the bottom", () => {
    const { s: s0, ap, ids } = setup([bolt()]);
    putOnBattlefield(s0, ap, storm());
    const opp = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    const p = s0.players[ap]!;
    const n = p.library.length; // forests and bears only: no instant
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.library.length).toBe(n + 1);
    expect(zone(s, ids[0]!)).toBe("library");
  });

  it("bots play it through", () => {
    const { s: s0, ap, ids } = setup([divination()]);
    putOnBattlefield(s0, ap, storm());
    const lib = onTop(s0, ap, [bolt(), divination()]);
    const s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeNull();
    expect(zone(s, ids[0]!)).toBe("library");
    expect(["graveyard", "library"]).toContain(zone(s, lib[1]!));
  });
});

describe("round 422: Knowledge Pool", () => {
  /** Knowledge Pool cast and resolved: each player's top three cards exiled with it (`tops` on top of each library first). */
  function poolOut(hand: CardDef[], tops: CardDef[][]) {
    const { s: s0, ap, ids } = setup([pool(), ...hand]);
    const lib = s0.turnOrder.map((pid, i) => onTop(s0, pid, tops[i] ?? []));
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeNull();
    expect(zone(s, ids[0]!)).toBe("battlefield");
    return { s, ap, ids: ids.slice(1), lib, poolId: ids[0]! };
  }

  it("enters exiling each player's top three cards, linked to it", () => {
    const { s, lib, poolId } = poolOut([], [[bolt(), shock(), divination()], [bolt(), bolt(), bolt()]]);
    for (const id of [...lib[0]!, ...lib[1]!]) expect(zone(s, id)).toBe("exile");
    const key = `${poolId}@${s.objects[poolId]!.zoneChanges ?? 0}`;
    expect(s.linkedExile?.[key]?.length).toBe(12);
  });

  it("a spell cast from a hand is exiled; its caster may cast another card exiled with it, free, even an opponent's", () => {
    const { s: s0, ap, ids, lib, poolId } = poolOut([divination()], [[forest, forest, forest], [bolt(), forest, forest]]);
    const opp = s0.turnOrder[1]!;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("exile");
    expect(s.pending).toMatchObject({ player: ap });
    const p = s.pending!;
    // The Divination just exiled isn't among the choices; the opponent's Bolt is.
    const options = p.kind === "chooseOption" ? p.options : [];
    expect(options).toContain(lib[1]![0]);
    expect(options).not.toContain(ids[0]);
    s = act(s, { type: "chooseOption", player: ap, choice: lib[1]![0]! });
    if (s.pending?.kind === "castFree") s = act(s, { type: "castSpell", player: ap, objectId: lib[1]![0]!, targets: [{ kind: "player", id: opp }] });
    const life = s.players[opp]!.life;
    s = settle(s);
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(zone(s, lib[1]![0]!)).toBe("graveyard");
    // The Divination stays exiled with the Pool, for a later spell.
    const key = `${poolId}@${s.objects[poolId]!.zoneChanges ?? 0}`;
    expect(s.linkedExile?.[key]?.some((l) => l.id === ids[0])).toBe(true);
  });

  it("if the spell isn't exiled (it left the stack first), nothing is cast", () => {
    const { s: s0, ap, ids } = poolOut([divination()], [[bolt(), bolt(), bolt()]]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    // Put the trigger on the stack, then take the Divination off it (as a counterspell would) before the trigger resolves.
    for (let i = 0; i < 20 && s.triggerQueue.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const at = s.stack.findIndex((x) => x.kind === "spell" && x.objectId === ids[0]);
    expect(at).toBeGreaterThanOrEqual(0);
    s.stack.splice(at, 1);
    s.objects[ids[0]!]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(ids[0]!);
    s = settle(s);
    expect(s.pending).toBeNull();
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });

  it("bots play it through", () => {
    const { s: s0, ap, ids } = poolOut([divination()], [[bolt(), divination(), shock()]]);
    const s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeNull();
    expect(zone(s, ids[0]!)).toBe("exile");
  });
});

describe("round 422: Ashnod the Uncaring", () => {
  /** Answers Ashnod's "may" with `yes` and keeps the copy's targets; other questions as a bot; passes otherwise. */
  const resolveAll = (s: GameState, ap: PlayerId, yes: boolean) => {
    let asked = 0;
    for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "chooseMay") {
        expect(p.player).toBe(ap);
        asked++;
        s = act(s, { type: "chooseMay", player: ap, yes });
      } else if (p?.kind === "copyTargets") s = act(s, { type: "copyTargets", player: p.player });
      // Scry, a library search: as a bot would.
      else if (p) s = botActions(s, waitingOn(s)!).reduce((x, a) => act(x, a), s);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    return { s, asked };
  };

  it("a creature's ability that sacrificed it: copied (two damage); declined, one", () => {
    for (const yes of [true, false]) {
      const { s: s0, ap, opp } = setup([]);
      putOnBattlefield(s0, ap, ashnod());
      const f = putOnBattlefield(s0, ap, fanatic());
      const life = s0.players[opp]!.life;
      const { s, asked } = resolveAll(run(s0, planActivate(s0, ap, f, 0, [{ kind: "player", id: opp }])), ap, yes);
      expect(asked).toBe(1);
      expect(s.players[opp]!.life).toBe(life - (yes ? 2 : 1));
    }
  });

  it("a cost sacrificing another permanent counts; an artifact's ability too", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, ashnod());
    const seerId = putOnBattlefield(s0, ap, seer());
    const b = putOnBattlefield(s0, ap, bears());
    const r1 = resolveAll(run(s0, planActivate(s0, ap, seerId, 0, undefined, undefined, undefined, undefined, { sacrifice: [b] })), ap, true);
    expect(r1.asked).toBe(1);
    expect(zone(r1.s, b)).toBe("graveyard");
    const stone = putOnBattlefield(r1.s, ap, mindStone());
    const hand = r1.s.players[ap]!.hand.length;
    const idx = 0; // "{1}, {T}, Sacrifice this artifact: Draw a card." (its mana ability is apart)
    const r2 = resolveAll(run(r1.s, planActivate(r1.s, ap, stone, idx)), ap, true);
    expect(r2.asked).toBe(1);
    expect(r2.s.players[ap]!.hand.length).toBe(hand + 2);
  });

  it("no trigger without a sacrifice, for a land's ability, or for an opponent's", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, ashnod());
    // A land (not an artifact or creature) sacrificed for its own ability.
    const land = putOnBattlefield(s0, ap, foothills());
    const r1 = resolveAll(run(s0, planActivate(s0, ap, land, 0)), ap, true);
    expect(r1.asked).toBe(0);
    // An opponent's Mogg Fanatic.
    const f = putOnBattlefield(r1.s, opp, fanatic());
    let s = r1.s;
    s.priority = opp;
    const plan = planActivate(s, opp, f, 0, [{ kind: "player", id: ap }]);
    expect(plan).not.toBeNull();
    const life = s.players[ap]!.life;
    const r2 = resolveAll(run(s, plan), ap, true);
    expect(r2.asked).toBe(0);
    s = r2.s;
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.life).toBe(life - 1);
  });

  it("bots copy their own sacrifice abilities", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, ashnod());
    const f = putOnBattlefield(s0, ap, fanatic());
    const life = s0.players[opp]!.life;
    const s = settleBots(run(s0, planActivate(s0, ap, f, 0, [{ kind: "player", id: opp }])));
    expect(s.pending).toBeNull();
    expect(s.players[opp]!.life).toBeLessThan(life);
  });
});
