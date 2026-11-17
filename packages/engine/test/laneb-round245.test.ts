// Lane B round B245: Caller of the Hunt (a creature type chosen as an additional cost of a permanent spell, CR 601.2b,
// "the chosen type" of its characteristic-defining ability, CR 607.2d, kept by the permanent the spell becomes, CR
// 400.7d, and by a copy of the spell, CR 707.10, but not by a copy of the permanent, CR 707.2), Reap Intellect (up to X
// cards from a revealed hand exiled, then one search for cards with those names, CR 701.23b) and Deadly Cover-Up (with
// evidence collected, CR 701.59c, a card chosen from an opponent's graveyard as it resolves and its owner's zones searched
// for its name).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, castProblem, characteristics, invalidateCharacteristics, isFullySupported, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const caller = (): CardDef => ({"oracleId": "2ad60059-7a29-40a8-b595-3932f1222d33", "name": "Caller of the Hunt", "manaCost": "{2}{G}", "cmc": 3, "typeLine": "Creature — Human", "supertypes": [], "types": ["Creature"], "subtypes": ["Human"], "oracleText": "As an additional cost to cast this spell, choose a creature type.\nCaller of the Hunt's power and toughness are each equal to the number of creatures of the chosen type on the battlefield.", "power": "*", "toughness": "*", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/c/0/c0e8e1cf-0a47-4ce4-889a-091229d0e466.jpg?1783945928", "artUrl": "https://cards.scryfall.io/art_crop/front/c/0/c0e8e1cf-0a47-4ce4-889a-091229d0e466.jpg?1783945928", "commanderLegal": "legal", "set": "mmq", "releasedAt": "1999-10-04", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const reap = (): CardDef => ({"oracleId": "aa97eb3d-8b8d-418b-8615-839812d60fe0", "name": "Reap Intellect", "manaCost": "{X}{2}{U}{B}", "cmc": 4, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Target opponent reveals their hand. You choose up to X nonland cards from it and exile them. For each card exiled this way, search that player's graveyard, hand, and library for any number of cards with the same name as that card and exile them. Then that player shuffles.", "colors": ["B", "U"], "colorIdentity": ["B", "U"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/c/6/c6297df2-c67a-4054-9617-5c6202c76de8.jpg?1783940024", "artUrl": "https://cards.scryfall.io/art_crop/front/c/6/c6297df2-c67a-4054-9617-5c6202c76de8.jpg?1783940024", "commanderLegal": "legal", "set": "dgm", "releasedAt": "2013-05-03", "rarity": "mythic", "layout": "normal", "gameChanger": false}) as CardDef;
const coverUp = (): CardDef => ({"oracleId": "04e2afbe-0c08-42bc-93e6-662066a958bf", "name": "Deadly Cover-Up", "manaCost": "{3}{B}{B}", "cmc": 5, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "As an additional cost to cast this spell, you may collect evidence 6.\nDestroy all creatures. If evidence was collected, exile a card from an opponent's graveyard. Then search its owner's graveyard, hand, and library for any number of cards with that name and exile them. That player shuffles, then draws a card for each card exiled from their hand this way.", "colors": ["B"], "colorIdentity": ["B"], "keywords": ["Collect evidence"], "imageUrl": "https://cards.scryfall.io/normal/front/3/8/3876aa0f-b199-43f5-8a91-c2d620b8ef84.jpg?1783912899", "artUrl": "https://cards.scryfall.io/art_crop/front/3/8/3876aa0f-b199-43f5-8a91-c2d620b8ef84.jpg?1783912899", "commanderLegal": "legal", "set": "mkm", "releasedAt": "2024-02-09", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const elves = (): CardDef => ({"oracleId": "68954295-54e3-4303-a6bc-fc4547a4e3a3", "name": "Llanowar Elves", "manaCost": "{G}", "cmc": 1, "typeLine": "Creature — Elf Druid", "supertypes": [], "types": ["Creature"], "subtypes": ["Elf", "Druid"], "oracleText": "{T}: Add {G}.", "power": "1", "toughness": "1", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "producedMana": ["G"], "imageUrl": "https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528", "artUrl": "https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528", "commanderLegal": "legal", "set": "sld", "releasedAt": "2026-07-13", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const mystic = (): CardDef => ({"oracleId": "3f3b2c10-21f8-4e13-be83-4ef3fa36e123", "name": "Elvish Mystic", "manaCost": "{G}", "cmc": 1, "typeLine": "Creature — Elf Druid", "supertypes": [], "types": ["Creature"], "subtypes": ["Elf", "Druid"], "oracleText": "{T}: Add {G}.", "power": "1", "toughness": "1", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "producedMana": ["G"], "imageUrl": "https://cards.scryfall.io/normal/front/a/c/acbe8763-1373-49f8-b4a6-dd5984b1d25f.jpg?1783911494", "artUrl": "https://cards.scryfall.io/art_crop/front/a/c/acbe8763-1373-49f8-b4a6-dd5984b1d25f.jpg?1783911494", "commanderLegal": "legal", "set": "sld", "releasedAt": "2024-05-13", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const bears = (): CardDef => ({"oracleId": "14c8f55d-d177-4c25-a931-ebeb9e6062a0", "name": "Grizzly Bears", "manaCost": "{1}{G}", "cmc": 2, "typeLine": "Creature — Bear", "supertypes": [], "types": ["Creature"], "subtypes": ["Bear"], "oracleText": "", "power": "2", "toughness": "2", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798", "artUrl": "https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798", "commanderLegal": "legal", "set": "slz", "releasedAt": "2026-09-02", "rarity": "common", "layout": "normal", "gameChanger": false}) as CardDef;
const bolt = (): CardDef => ({"oracleId": "4457ed35-7c10-48c8-9776-456485fdf070", "name": "Lightning Bolt", "manaCost": "{R}", "cmc": 1, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Lightning Bolt deals 3 damage to any target.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008", "artUrl": "https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008", "commanderLegal": "legal", "set": "msc", "releasedAt": "2026-06-26", "rarity": "uncommon", "layout": "normal", "gameChanger": false}) as CardDef;
const opt = (): CardDef => ({"oracleId": "713332c1-5bd8-400f-bfff-c1ca0697a043", "name": "Opt", "manaCost": "{U}", "cmc": 1, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Scry"], "imageUrl": "https://cards.scryfall.io/normal/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078", "artUrl": "https://cards.scryfall.io/art_crop/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078", "commanderLegal": "legal", "set": "sld", "releasedAt": "2025-07-25", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const island = (): CardDef => ({"oracleId": "b2c6aa39-2d2a-459c-a555-fb48ba993373", "name": "Island", "manaCost": "", "cmc": 0, "typeLine": "Basic Land — Island", "supertypes": ["Basic"], "types": ["Land"], "subtypes": ["Island"], "oracleText": "({T}: Add {U}.)", "colors": [], "colorIdentity": ["U"], "keywords": [], "producedMana": ["U"], "imageUrl": "https://cards.scryfall.io/normal/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646", "artUrl": "https://cards.scryfall.io/art_crop/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646", "commanderLegal": "legal", "set": "trk", "releasedAt": "2026-11-13", "rarity": "common", "layout": "normal", "gameChanger": false}) as CardDef;
const doubleMajor = (): CardDef => ({"oracleId": "ece44a82-dcf0-4439-bdd9-a09c99a6f159", "name": "Double Major", "manaCost": "{G}{U}", "cmc": 2, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Copy target creature spell you control, except it isn't legendary if the spell is legendary. (A copy of a creature spell becomes a token.)", "colors": ["G", "U"], "colorIdentity": ["G", "U"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/c/3/c3d35413-8742-4443-8859-93c91112978d.jpg?1783927318", "artUrl": "https://cards.scryfall.io/art_crop/front/c/3/c3d35413-8742-4443-8859-93c91112978d.jpg?1783927318", "commanderLegal": "legal", "set": "stx", "releasedAt": "2021-04-23", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const clone = (): CardDef => ({"oracleId": "42226b87-0746-4ebf-9fd0-108d508462af", "name": "Clone", "manaCost": "{3}{U}", "cmc": 4, "typeLine": "Creature — Shapeshifter", "supertypes": [], "types": ["Creature"], "subtypes": ["Shapeshifter"], "oracleText": "You may have this creature enter as a copy of any creature on the battlefield.", "power": "0", "toughness": "0", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/4/8/48c2e9e2-f679-451d-a700-18104af08988.jpg?1784013893", "artUrl": "https://cards.scryfall.io/art_crop/front/4/8/48c2e9e2-f679-451d-a700-18104af08988.jpg?1784013893", "commanderLegal": "legal", "set": "sld", "releasedAt": "2026-06-15", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const outcast = (): CardDef => ({"oracleId": "a61ef0cc-1da9-49f9-b0dc-01cf9f6205be", "name": "Changeling Outcast", "manaCost": "{B}", "cmc": 1, "typeLine": "Creature — Shapeshifter", "supertypes": [], "types": ["Creature"], "subtypes": ["Shapeshifter"], "oracleText": "Changeling (This card is every creature type.)\nThis creature can't block and can't be blocked.", "power": "1", "toughness": "1", "colors": ["B"], "colorIdentity": ["B"], "keywords": ["Changeling"], "imageUrl": "https://cards.scryfall.io/normal/front/0/8/08151d00-513a-4957-aa16-01c0f0245112.jpg?1783933130", "artUrl": "https://cards.scryfall.io/art_crop/front/0/8/08151d00-513a-4957-aa16-01c0f0245112.jpg?1783933130", "commanderLegal": "legal", "set": "mh1", "releasedAt": "2019-06-14", "rarity": "common", "layout": "normal", "gameChanger": false}) as CardDef;
const divination = (): CardDef => ({"oracleId": "273b339c-964b-4a18-8eb5-ceb8abcdfd9e", "name": "Divination", "manaCost": "{2}{U}", "cmc": 3, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Draw two cards.", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025", "artUrl": "https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025", "commanderLegal": "legal", "set": "dom", "releasedAt": "2018-04-27", "rarity": "common", "layout": "normal", "gameChanger": false}) as CardDef;

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
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const toZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "library" | "exile" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
/** `setup` with only `hand` in the active player's hand (the opening hand put back into the library). */
const only = (hand: CardDef[]) => {
  const r = setup([]);
  const p = r.s.players[r.ap]!;
  for (const id of p.hand) r.s.objects[id]!.zone = "library";
  p.library.push(...p.hand);
  p.hand = [];
  const ids = hand.map((d) => toZone(r.s, r.ap, d, "hand"));
  return { ...r, ids };
};
/** Empties `pid`'s hand into their library. */
const emptyHand = (s: GameState, pid: PlayerId) => {
  const p = s.players[pid]!;
  for (const id of p.hand) s.objects[id]!.zone = "library";
  p.library.push(...p.hand);
  p.hand = [];
};
const zoneOf = (s: GameState, id: string) => s.objects[id]?.zone;

describe("Lane B round B245", () => {
  it("are fully supported", () => {
    supported(caller(), reap(), coverUp());
  });
});

describe("Lane B round B245: Caller of the Hunt", () => {
  it("a creature type is chosen as it's cast; its power and toughness count the creatures of that type on the battlefield, anyone's, from then on", () => {
    const { s: s0, ap, opp, ids } = only([caller(), bolt()]);
    const mine = putOnBattlefield(s0, ap, elves());
    const theirs = putOnBattlefield(s0, opp, mystic());
    putOnBattlefield(s0, opp, bears());
    // No type chosen, it can't be cast; nor with something that isn't a creature type (CR 205.3m).
    const plan = planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { creatureType: "Elf" })!;
    const noType = plan.map((a) => (a.type === "castSpell" ? (({ creatureType: _, ...rest }) => rest)(a) : a)) as Action[];
    expect(() => run(s0, noType)).toThrow(/choose a creature type/);
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { creatureType: "Artifact" })).toMatch(/isn't a creature type/);
    expect(planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { creatureType: "Artifact" })).toBeNull();
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { creatureType: "Elf" }));
    expect(s.stack.at(-1)?.description).toMatch(/Caller of the Hunt \(Elf\)/);
    // On the stack, it already counts them (CR 604.3).
    const callerId = ids[0]!;
    const onStack = characteristics(s, s.objects[callerId]!);
    expect(`${onStack.power}/${onStack.toughness}`).toBe("2/2");
    s = settle(s);
    expect(zoneOf(s, callerId)).toBe("battlefield");
    expect(s.objects[callerId]!.chosen?.type).toBe("Elf");
    expect(pt(s, callerId)).toBe("2/2");
    // Another Elf enters: counted at once; one dies: no longer.
    putOnBattlefield(s, ap, elves());
    expect(pt(s, callerId)).toBe("3/3");
    s = run(s, planCast(s, ap, ids[1]!, [tgt(theirs)], undefined, "auto"));
    s = settle(s);
    expect(zoneOf(s, theirs)).toBe("graveyard");
    expect(pt(s, callerId)).toBe("2/2");
    expect(zoneOf(s, mine)).toBe("battlefield");
  });

  it("its own type counts it: a Human chosen makes it at least 1/1", () => {
    const { s: s0, ap, ids } = only([caller()]);
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { creatureType: "Human" }));
    s = settle(s);
    expect(pt(s, ids[0]!)).toBe("1/1");
  });

  it("not cast, no type was chosen: 0/0 anywhere else, and put onto the battlefield it dies", () => {
    const { s: s0, ap, ids } = only([caller()]);
    putOnBattlefield(s0, ap, elves());
    const c = characteristics(s0, s0.objects[ids[0]!]!);
    expect(`${c.power}/${c.toughness}`).toBe("0/0");
    const put = putOnBattlefield(s0, ap, caller());
    expect(pt(s0, put)).toBe("0/0");
    const s = act(s0, { type: "passPriority", player: waitingOn(s0)! });
    expect(zoneOf(s, put)).toBe("graveyard");
  });

  it("a copy of the spell keeps the type chosen for it (CR 707.10); a Clone of the permanent doesn't (CR 707.2)", () => {
    const { s: s0, ap, ids } = only([caller(), doubleMajor(), clone()]);
    putOnBattlefield(s0, ap, elves());
    putOnBattlefield(s0, ap, elves());
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { creatureType: "Elf" }));
    const spell = s.stack.at(-1)!.id;
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: spell }], undefined, "auto"));
    s = settle(s);
    const copies = s.battlefield.filter((b) => s.cards[s.objects[b]!.cardId]!.name === "Caller of the Hunt");
    expect(copies.length).toBe(2);
    for (const id of copies) expect(pt(s, id)).toBe("2/2");
    // Clone: it enters as a copy, but no type was chosen for it: 0/0, so it dies.
    s = run(s, planCast(s, ap, ids[2]!, undefined, undefined, "auto"));
    s = settle(s, [ap]);
    if (s.pending?.player === ap) {
      const p = s.pending;
      if (p.kind === "chooseOption") s = act(s, { type: "chooseOption", player: ap, choice: p.options.find((o) => /Caller/.test(String(o))) ?? p.options[0]! } as Action);
      else if (p.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: ap, found: [copies[0]!] });
      else throw new Error(`unexpected ${p.kind}`);
      s = settle(s);
    }
    expect(zoneOf(s, ids[2]!)).toBe("graveyard");
  });

  it("bots choose the type with the most creatures on the battlefield", () => {
    const { s: s0, ap, opp, ids } = only([caller()]);
    putOnBattlefield(s0, opp, elves());
    putOnBattlefield(s0, opp, mystic());
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, ap, bears());
    const cast = botActions(s0, ap).find((a) => a.type === "castSpell" && a.objectId === ids[0]);
    expect(cast).toBeDefined();
    expect(cast?.type === "castSpell" ? cast.creatureType : undefined).toBe("Bear");
  });
});

describe("Lane B round B245: Reap Intellect", () => {
  it("up to X nonland cards from the revealed hand are exiled, then cards with those names in that player's graveyard, hand and library, any number of them", () => {
    const { s: s0, ap, opp, ids } = only([reap()]);
    emptyHand(s0, opp);
    const [b1, b2, o1, land] = [toZone(s0, opp, bolt(), "hand"), toZone(s0, opp, bolt(), "hand"), toZone(s0, opp, opt(), "hand"), toZone(s0, opp, island(), "hand")];
    const yardBolt = toZone(s0, opp, bolt(), "graveyard");
    const libBolt = toZone(s0, opp, bolt(), "library");
    const libOpt = toZone(s0, opp, opt(), "library");
    let s = run(s0, planCast(s0, ap, ids[0]!, [player(opp)], undefined, "auto", 2));
    s = settle(s, [ap]);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 2 });
    const offered = s.pending?.kind === "searchLibrary" ? s.pending.cards : [];
    expect(offered).not.toContain(land);
    expect(new Set(offered)).toEqual(new Set([b1, b2, o1]));
    s = act(s, { type: "searchLibrary", player: ap, found: [b1, o1] });
    // One search for both names; the Opt in the library is left there (any number).
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const found = s.pending?.kind === "searchLibrary" ? s.pending.cards : [];
    expect(new Set(found)).toEqual(new Set([b2, yardBolt, libBolt, libOpt]));
    s = act(s, { type: "searchLibrary", player: ap, found: [b2, yardBolt, libBolt] });
    s = settle(s);
    for (const id of [b1, b2, o1, yardBolt, libBolt]) expect(zoneOf(s, id)).toBe("exile");
    expect(zoneOf(s, libOpt)).toBe("library");
    expect(zoneOf(s, land)).toBe("hand");
  });

  it("with X = 0 nothing is exiled and nothing is searched for", () => {
    const { s: s0, ap, opp, ids } = only([reap()]);
    emptyHand(s0, opp);
    const b1 = toZone(s0, opp, bolt(), "hand");
    let s = run(s0, planCast(s0, ap, ids[0]!, [player(opp)], undefined, "auto", 0));
    s = settle(s, [ap]);
    expect(s.pending).toBeFalsy();
    expect(zoneOf(s, b1)).toBe("hand");
    expect(zoneOf(s, ids[0]!)).toBe("graveyard");
  });
});

describe("Lane B round B245: Deadly Cover-Up", () => {
  it("without evidence it destroys all creatures and that's all", () => {
    const { s: s0, ap, opp, ids } = only([coverUp()]);
    const a = putOnBattlefield(s0, ap, bears());
    const b = putOnBattlefield(s0, opp, elves());
    toZone(s0, opp, bolt(), "graveyard");
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto"));
    s = settle(s, [ap]);
    expect(s.pending).toBeFalsy();
    expect(zoneOf(s, a)).toBe("graveyard");
    expect(zoneOf(s, b)).toBe("graveyard");
  });

  it("with evidence: a card from an opponent's graveyard, chosen after the creatures die, then its owner's zones searched for its name; they draw one for each card exiled from their hand", () => {
    const { s: s0, ap, opp, ids } = only([coverUp()]);
    emptyHand(s0, opp);
    const ev = [toZone(s0, ap, divination(), "graveyard"), toZone(s0, ap, divination(), "graveyard")];
    const myYard = toZone(s0, ap, bolt(), "graveyard");
    const theirElves = putOnBattlefield(s0, opp, elves());
    const handElves = toZone(s0, opp, elves(), "hand");
    const libElves = toZone(s0, opp, elves(), "library");
    const otherOpp = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const otherYard = toZone(s0, otherOpp, island(), "graveyard");
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { evidence: ev }));
    for (const id of ev) expect(zoneOf(s, id)).toBe("exile");
    s = settle(s, [ap]);
    expect(zoneOf(s, theirElves)).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 1, max: 1 });
    const offered = s.pending?.kind === "searchLibrary" ? s.pending.cards : [];
    // Any opponent's graveyard, a basic land too (rulings), never your own.
    expect(offered).toContain(theirElves);
    expect(offered).toContain(otherYard);
    expect(offered).not.toContain(myYard);
    s = act(s, { type: "searchLibrary", player: ap, found: [theirElves] });
    expect(zoneOf(s, theirElves)).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const found = s.pending?.kind === "searchLibrary" ? s.pending.cards : [];
    expect(new Set(found)).toEqual(new Set([handElves, libElves]));
    const handBefore = s.players[opp]!.hand.length;
    s = act(s, { type: "searchLibrary", player: ap, found: [handElves, libElves] });
    s = settle(s);
    expect(zoneOf(s, handElves)).toBe("exile");
    expect(zoneOf(s, libElves)).toBe("exile");
    // One card exiled from their hand: they draw one.
    expect(s.players[opp]!.hand.length).toBe(handBefore - 1 + 1);
  });
});
