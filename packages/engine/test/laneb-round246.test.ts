// Lane B round B246: Lagrella, the Magpie (any number of other target creatures controlled by different players, CR 115.3,
// exiled until it leaves, CR 610.3; a delayed trigger made as that resolves, CR 603.7a, for a card that returns under its
// controller's control, CR 610.3c, triggering once, CR 603.7b), Cloudspire Coordinator (the Mounts and Vehicles that
// entered under your control this turn, a changeling as a Mount, CR 702.73a) and Sentinel of Lost Lore (targets in exile:
// a face-up card with an Adventure, CR 715.4, by owner).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const lagrella = (): CardDef => ({"oracleId": "6a98b586-5187-48a1-bde3-f6141f3e9cb1", "name": "Lagrella, the Magpie", "manaCost": "{G}{W}{U}", "cmc": 3, "typeLine": "Legendary Creature — Human Soldier", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Human", "Soldier"], "oracleText": "When Lagrella enters, exile any number of other target creatures controlled by different players until Lagrella leaves the battlefield. When an exiled card enters under your control this way, put two +1/+1 counters on it.", "power": "2", "toughness": "3", "colors": ["G", "U", "W"], "colorIdentity": ["G", "U", "W"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/5/9/5956dbe0-0d4c-42b1-8554-0fa6de1ee6bc.jpg?1783923028", "artUrl": "https://cards.scryfall.io/art_crop/front/5/9/5956dbe0-0d4c-42b1-8554-0fa6de1ee6bc.jpg?1783923028", "commanderLegal": "legal", "set": "snc", "releasedAt": "2022-04-29", "rarity": "uncommon", "layout": "normal", "gameChanger": false}) as CardDef;
const cloudspire = (): CardDef => ({"oracleId": "65d8b481-ebe9-4029-98a8-dd4693340bff", "name": "Cloudspire Coordinator", "manaCost": "{R}{W}", "cmc": 2, "typeLine": "Creature — Human Pilot", "supertypes": [], "types": ["Creature"], "subtypes": ["Human", "Pilot"], "oracleText": "When this creature enters, scry 2.\n{T}: Create X 1/1 colorless Pilot creature tokens, where X is the number of Mounts and/or Vehicles that entered the battlefield under your control this turn. The tokens have \"This token saddles Mounts and crews Vehicles as though its power were 2 greater.\"", "power": "3", "toughness": "1", "colors": ["R", "W"], "colorIdentity": ["R", "W"], "keywords": ["Scry"], "imageUrl": "https://cards.scryfall.io/normal/front/e/e/eef16cda-9150-4e7d-8490-d9f287b81b62.jpg?1783907860", "artUrl": "https://cards.scryfall.io/art_crop/front/e/e/eef16cda-9150-4e7d-8490-d9f287b81b62.jpg?1783907860", "commanderLegal": "legal", "set": "dft", "releasedAt": "2025-02-14", "rarity": "uncommon", "layout": "normal", "gameChanger": false}) as CardDef;
const sentinel = (): CardDef => ({"oracleId": "683775ac-481e-4c26-ab2f-5d2813af0268", "name": "Sentinel of Lost Lore", "manaCost": "{1}{G}{G}", "cmc": 3, "typeLine": "Creature — Elf Knight", "supertypes": [], "types": ["Creature"], "subtypes": ["Elf", "Knight"], "oracleText": "When this creature enters, choose one or more —\n• Return target card you own in exile that has an Adventure to your hand.\n• Put target card you don't own in exile that has an Adventure on the bottom of its owner's library.\n• Exile target player's graveyard.", "power": "3", "toughness": "4", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/a/8/a8556d3c-9290-4600-afa5-5928d74e3c96.jpg?1783915028", "artUrl": "https://cards.scryfall.io/art_crop/front/a/8/a8556d3c-9290-4600-afa5-5928d74e3c96.jpg?1783915028", "commanderLegal": "legal", "set": "woe", "releasedAt": "2023-09-08", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const ox = (): CardDef => ({"oracleId": "bcd56fbf-fde3-41c2-83f5-9636e92d2893", "name": "Bulwark Ox", "manaCost": "{1}{W}", "cmc": 2, "typeLine": "Creature — Ox Mount", "supertypes": [], "types": ["Creature"], "subtypes": ["Ox", "Mount"], "oracleText": "Whenever this creature attacks while saddled, put a +1/+1 counter on target creature.\nSacrifice this creature: Creatures you control with counters on them gain hexproof and indestructible until end of turn.\nSaddle 1 (Tap any number of other creatures you control with total power 1 or more: This Mount becomes saddled until end of turn. Saddle only as a sorcery.)", "power": "2", "toughness": "2", "colors": ["W"], "colorIdentity": ["W"], "keywords": ["Saddle"], "imageUrl": "https://cards.scryfall.io/normal/front/1/0/106944b2-f3ae-4350-be33-61b9f92fc92f.jpg?1783907920", "artUrl": "https://cards.scryfall.io/art_crop/front/1/0/106944b2-f3ae-4350-be33-61b9f92fc92f.jpg?1783907920", "commanderLegal": "legal", "set": "dft", "releasedAt": "2025-02-14", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const plow = (): CardDef => ({"oracleId": "4cdf524a-1a99-4143-823b-d3c5c867c580", "name": "Colossal Plow", "manaCost": "{2}", "cmc": 2, "typeLine": "Artifact — Vehicle", "supertypes": [], "types": ["Artifact"], "subtypes": ["Vehicle"], "oracleText": "Whenever this Vehicle attacks, add {W}{W}{W} and you gain 3 life. Until end of turn, you don't lose this mana as steps and phases end.\nCrew 6 (Tap any number of creatures you control with total power 6 or more: This Vehicle becomes an artifact creature until end of turn.)", "power": "6", "toughness": "3", "colors": [], "colorIdentity": ["W"], "keywords": ["Crew"], "producedMana": ["W"], "imageUrl": "https://cards.scryfall.io/normal/front/f/b/fba3fe29-067f-4c7e-8b3b-779f3b37712a.jpg?1783928186", "artUrl": "https://cards.scryfall.io/art_crop/front/f/b/fba3fe29-067f-4c7e-8b3b-779f3b37712a.jpg?1783928186", "commanderLegal": "legal", "set": "khm", "releasedAt": "2021-02-05", "rarity": "uncommon", "layout": "normal", "gameChanger": false}) as CardDef;
const outcast = (): CardDef => ({"oracleId": "a61ef0cc-1da9-49f9-b0dc-01cf9f6205be", "name": "Changeling Outcast", "manaCost": "{B}", "cmc": 1, "typeLine": "Creature — Shapeshifter", "supertypes": [], "types": ["Creature"], "subtypes": ["Shapeshifter"], "oracleText": "Changeling (This card is every creature type.)\nThis creature can't block and can't be blocked.", "power": "1", "toughness": "1", "colors": ["B"], "colorIdentity": ["B"], "keywords": ["Changeling"], "imageUrl": "https://cards.scryfall.io/normal/front/0/8/08151d00-513a-4957-aa16-01c0f0245112.jpg?1783933130", "artUrl": "https://cards.scryfall.io/art_crop/front/0/8/08151d00-513a-4957-aa16-01c0f0245112.jpg?1783933130", "commanderLegal": "legal", "set": "mh1", "releasedAt": "2019-06-14", "rarity": "common", "layout": "normal", "gameChanger": false}) as CardDef;
const bears = (): CardDef => ({"oracleId": "14c8f55d-d177-4c25-a931-ebeb9e6062a0", "name": "Grizzly Bears", "manaCost": "{1}{G}", "cmc": 2, "typeLine": "Creature — Bear", "supertypes": [], "types": ["Creature"], "subtypes": ["Bear"], "oracleText": "", "power": "2", "toughness": "2", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798", "artUrl": "https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798", "commanderLegal": "legal", "set": "slz", "releasedAt": "2026-09-02", "rarity": "common", "layout": "normal", "gameChanger": false}) as CardDef;
const giant = (): CardDef => ({"oracleId": "d6d72f5f-8f5d-4180-b514-f22ff5482902", "name": "Bonecrusher Giant // Stomp", "manaCost": "{2}{R} // {1}{R}", "cmc": 3, "typeLine": "Creature — Giant // Instant — Adventure", "supertypes": [], "types": ["Creature"], "subtypes": ["Giant"], "oracleText": "Whenever this creature becomes the target of a spell, this creature deals 2 damage to that spell's controller.", "power": "4", "toughness": "3", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/0/9/09fd2d9c-1793-4beb-a3fb-7a869f660cd4.jpg?1783932628", "artUrl": "https://cards.scryfall.io/art_crop/front/0/9/09fd2d9c-1793-4beb-a3fb-7a869f660cd4.jpg?1783932628", "commanderLegal": "legal", "set": "eld", "releasedAt": "2019-10-04", "rarity": "rare", "layout": "adventure", "gameChanger": false, "faces": [{"name": "Bonecrusher Giant", "manaCost": "{2}{R}", "typeLine": "Creature — Giant", "supertypes": [], "types": ["Creature"], "subtypes": ["Giant"], "oracleText": "Whenever this creature becomes the target of a spell, this creature deals 2 damage to that spell's controller.", "power": "4", "toughness": "3", "colors": ["R"]}, {"name": "Stomp", "manaCost": "{1}{R}", "typeLine": "Instant — Adventure", "supertypes": [], "types": ["Instant"], "subtypes": ["Adventure"], "oracleText": "Damage can't be prevented this turn. Stomp deals 2 damage to any target.", "colors": ["R"]}]}) as CardDef;
const murder = (): CardDef => ({"oracleId": "938b4e2c-88d9-4637-bc00-e228920c9a78", "name": "Murder", "manaCost": "{1}{B}{B}", "cmc": 3, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Destroy target creature.", "colors": ["B"], "colorIdentity": ["B"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477", "artUrl": "https://cards.scryfall.io/art_crop/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477", "commanderLegal": "legal", "set": "dsk", "releasedAt": "2024-09-27", "rarity": "common", "layout": "normal", "gameChanger": false}) as CardDef;
const bolt = (): CardDef => ({"oracleId": "4457ed35-7c10-48c8-9776-456485fdf070", "name": "Lightning Bolt", "manaCost": "{R}", "cmc": 1, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Lightning Bolt deals 3 damage to any target.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008", "artUrl": "https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008", "commanderLegal": "legal", "set": "msc", "releasedAt": "2026-06-26", "rarity": "uncommon", "layout": "normal", "gameChanger": false}) as CardDef;
const elves = (): CardDef => ({"oracleId": "68954295-54e3-4303-a6bc-fc4547a4e3a3", "name": "Llanowar Elves", "manaCost": "{G}", "cmc": 1, "typeLine": "Creature — Elf Druid", "supertypes": [], "types": ["Creature"], "subtypes": ["Elf", "Druid"], "oracleText": "{T}: Add {G}.", "power": "1", "toughness": "1", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "producedMana": ["G"], "imageUrl": "https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528", "artUrl": "https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528", "commanderLegal": "legal", "set": "sld", "releasedAt": "2026-07-13", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;

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
const zoneOf = (s: GameState, id: string) => s.objects[id]?.zone;
/** The battlefield object that is now the card `id` was (a card keeps its id across zones here). */
const plus = (s: GameState, id: string) => s.objects[id]!.counters["+1/+1"] ?? 0;

describe("Lane B round B246", () => {
  it("are fully supported", () => {
    supported(lagrella(), cloudspire(), sentinel());
  });
});

/** Casts `id` and lets it resolve, stopping at `ap`'s first question. */
const castAndSettle = (s: GameState, ap: PlayerId, id: string, targets?: TargetChoice[]) => settle(run(s, planCast(s, ap, id, targets)), [ap]);
/** Murder on `target`, from `ap`'s hand, resolved; stops at `ap`'s first question. */
const murderIt = (s: GameState, ap: PlayerId, target: string) => {
  const m = toZone(s, ap, murder(), "hand");
  return settle(run(s, planCast(s, ap, m, [tgt(target)])), [ap]);
};

describe("Lane B round B246: Lagrella, the Magpie", () => {
  it("exiles other creatures controlled by different players; when it leaves, the cards return under their owners' control and the one of yours gets two +1/+1 counters", () => {
    const { s: s0, ap, opp, ids } = only([lagrella()]);
    const mine = putOnBattlefield(s0, ap, bears());
    const theirs = putOnBattlefield(s0, opp, elves());
    const theirs2 = putOnBattlefield(s0, opp, bears());
    let s = castAndSettle(s0, ap, ids[0]!);
    expect(s.pending?.kind).toBe("chooseTargets");
    // Two of one player's creatures: not "controlled by different players" (CR 115.3); Lagrella itself isn't "other".
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(theirs), tgt(theirs2)] })).toThrow();
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(ids[0]!)] })).toThrow();
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(mine), tgt(theirs)] });
    s = settle(s, [ap]);
    expect(zoneOf(s, mine)).toBe("exile");
    expect(zoneOf(s, theirs)).toBe("exile");
    expect(zoneOf(s, theirs2)).toBe("battlefield");
    s = murderIt(s, ap, ids[0]!);
    expect(zoneOf(s, ids[0]!)).toBe("graveyard");
    expect(zoneOf(s, mine)).toBe("battlefield");
    expect(zoneOf(s, theirs)).toBe("battlefield");
    expect(s.objects[theirs]!.controller).toBe(opp);
    expect(plus(s, mine)).toBe(2);
    expect(pt(s, mine)).toBe("4/4");
    expect(plus(s, theirs)).toBe(0);
    expect(s.stack.length).toBe(0);
  });

  it("a creature you control but don't own returns under its owner's control: no counters, and no trigger", () => {
    const { s: s0, ap, opp, ids } = only([lagrella()]);
    const stolen = putOnBattlefield(s0, opp, bears());
    s0.objects[stolen]!.controller = ap;
    invalidateCharacteristics(s0);
    let s = castAndSettle(s0, ap, ids[0]!);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(stolen)] }), [ap]);
    expect(zoneOf(s, stolen)).toBe("exile");
    const before = s.log.length;
    s = murderIt(s, ap, ids[0]!);
    expect(zoneOf(s, stolen)).toBe("battlefield");
    expect(s.objects[stolen]!.controller).toBe(opp);
    expect(plus(s, stolen)).toBe(0);
    expect(s.log.slice(before).some((l) => /\+1\/\+1 counter/.test(l.text ?? String(l)))).toBe(false);
  });

  it("with two of your cards returning at once, the delayed trigger triggers once, for the one you choose (CR 603.7b)", () => {
    const { s: s0, ap, opp, ids } = only([lagrella()]);
    const mine = putOnBattlefield(s0, ap, bears());
    const lent = putOnBattlefield(s0, ap, elves());
    s0.objects[lent]!.controller = opp; // yours, controlled by an opponent
    invalidateCharacteristics(s0);
    let s = castAndSettle(s0, ap, ids[0]!);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(mine), tgt(lent)] }), [ap]);
    expect(zoneOf(s, mine)).toBe("exile");
    expect(zoneOf(s, lent)).toBe("exile");
    s = murderIt(s, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "triggerSubject", player: ap });
    expect(s.pending?.kind === "chooseOption" && [...s.pending.options].sort()).toEqual([mine, lent].sort());
    s = settle(act(s, { type: "chooseOption", player: ap, choice: lent }), [ap]);
    expect(s.objects[lent]!.controller).toBe(ap);
    expect(plus(s, lent)).toBe(2);
    expect(plus(s, mine)).toBe(0);
    expect(s.stack.length).toBe(0);
  });

  it("a bot answers the choice with one of the cards", () => {
    const { s: s0, ap, opp, ids } = only([lagrella()]);
    const mine = putOnBattlefield(s0, ap, bears());
    const lent = putOnBattlefield(s0, ap, elves());
    s0.objects[lent]!.controller = opp;
    invalidateCharacteristics(s0);
    let s = castAndSettle(s0, ap, ids[0]!);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(mine), tgt(lent)] }), [ap]);
    s = murderIt(s, ap, ids[0]!);
    expect(s.pending).toMatchObject({ what: "triggerSubject" });
    s = settle(s);
    expect(plus(s, mine) + plus(s, lent)).toBe(2);
  });

  it("if Lagrella has left before its ability resolves, nothing is exiled (CR 610.3b)", () => {
    const { s: s0, ap, opp, ids } = only([lagrella()]);
    const mine = putOnBattlefield(s0, ap, bears());
    const theirs = putOnBattlefield(s0, opp, elves());
    let s = castAndSettle(s0, ap, ids[0]!);
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(mine), tgt(theirs)] });
    expect(s.stack.length).toBe(1);
    s = murderIt(s, ap, ids[0]!);
    expect(zoneOf(s, ids[0]!)).toBe("graveyard");
    expect(zoneOf(s, mine)).toBe("battlefield");
    expect(zoneOf(s, theirs)).toBe("battlefield");
    expect(plus(s, mine)).toBe(0);
  });

  it("a token exiled this way doesn't come back; no target at all is fine (CR 115.6)", () => {
    const { s: s0, ap, opp, ids } = only([lagrella()]);
    const tok = putOnBattlefield(s0, opp, elves());
    s0.objects[tok]!.isToken = true;
    let s = castAndSettle(s0, ap, ids[0]!);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(tok)] }), [ap]);
    expect(s.objects[tok]?.zone === "battlefield").toBe(false);
    s = murderIt(s, ap, ids[0]!);
    expect(s.objects[tok]?.zone === "battlefield").toBe(false);
    // Again with no targets chosen.
    const r = only([lagrella()]);
    putOnBattlefield(r.s, r.opp, elves());
    let t = castAndSettle(r.s, r.ap, r.ids[0]!);
    if (t.pending?.kind === "chooseTargets") t = settle(act(t, { type: "chooseTargets", player: r.ap, targets: [] }), [r.ap]);
    expect(zoneOf(t, r.ids[0]!)).toBe("battlefield");
    expect(t.stack.length).toBe(0);
  });

  it("a bot casting Lagrella picks targets controlled by different players", () => {
    const { s: s0, ap, opp, ids } = only([lagrella()]);
    putOnBattlefield(s0, ap, bears());
    const a = putOnBattlefield(s0, opp, elves());
    const b = putOnBattlefield(s0, opp, bears());
    const c = putOnBattlefield(s0, s0.turnOrder[(s0.turnOrder.indexOf(opp) + 1) % 4]!, bears());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s);
    const exiled = [a, b, c].filter((id) => zoneOf(s, id) === "exile");
    expect(exiled.filter((id) => id === a || id === b).length).toBe(1);
    expect(exiled).toContain(c);
  });
});

describe("Lane B round B246: Cloudspire Coordinator", () => {
  it("creates a Pilot for each Mount and/or Vehicle that entered under your control this turn, a changeling counting as a Mount", () => {
    const { s: s0, ap, ids } = only([ox(), plow(), outcast(), bears()]);
    const coord = putOnBattlefield(s0, ap, cloudspire());
    let s = s0;
    for (const id of ids) s = castAndSettle(s, ap, id);
    for (const id of ids) expect(zoneOf(s, id)).toBe("battlefield");
    // One that has left since still counts (it entered this turn).
    const b = toZone(s, ap, bolt(), "hand");
    s = settle(run(s, planCast(s, ap, b, [tgt(ids[0]!)])), [ap]);
    expect(zoneOf(s, ids[0]!)).toBe("graveyard");
    const before = new Set(s.battlefield);
    s = settle(run(s, planActivate(s, ap, coord, 0)), [ap]);
    const pilots = s.battlefield.filter((id) => !before.has(id));
    expect(pilots.length).toBe(3);
    for (const id of pilots) {
      expect(s.cards[s.objects[id]!.cardId]!.name).toMatch(/^Pilot/);
      expect(pt(s, id)).toBe("1/1");
    }
    // Each crews as though its power were 3: Colossal Plow's crew 6 takes two of them, not one.
    for (const id of pilots) s.objects[id]!.controlledSinceTurn = -1;
    const plowId = ids[1]!;
    expect(() => act(s, { type: "activateAbility", player: ap, objectId: plowId, index: 0, tapCreatures: [pilots[0]!] })).toThrow();
    s = settle(act(s, { type: "activateAbility", player: ap, objectId: plowId, index: 0, tapCreatures: [pilots[0]!, pilots[1]!] }), [ap]);
    expect(s.objects[pilots[0]!]!.tapped && s.objects[pilots[1]!]!.tapped).toBe(true);
    expect(s.objects[plowId]!.tapped).toBe(false);
    expect(characteristics(s, s.objects[plowId]!).types).toContain("Creature");
  });

  it("counts none of another player's, nor last turn's", () => {
    const { s: s0, ap, opp } = only([]);
    const coord = putOnBattlefield(s0, ap, cloudspire());
    putOnBattlefield(s0, ap, ox()); // not entered this turn (no event)
    s0.turnLog = { ...(s0.turnLog ?? {}), entered: [{ controller: opp, types: ["Artifact"], subtypes: ["Vehicle"], colors: [], id: "x", zc: 0 }] } as GameState["turnLog"];
    const before = new Set(s0.battlefield);
    const s = settle(run(s0, planActivate(s0, ap, coord, 0)), [ap]);
    expect(s.battlefield.filter((id) => !before.has(id)).length).toBe(0);
  });
});

describe("Lane B round B246: Sentinel of Lost Lore", () => {
  it("returns your exiled adventurer card to your hand, puts an opponent's on the bottom of its owner's library, and exiles a graveyard", () => {
    const { s: s0, ap, opp, ids } = only([sentinel()]);
    const myGiant = toZone(s0, ap, giant(), "exile");
    const theirGiant = toZone(s0, opp, giant(), "exile");
    const yard = toZone(s0, opp, bears(), "graveyard");
    let s = castAndSettle(s0, ap, ids[0]!);
    expect(s.pending?.kind).toBe("chooseModes");
    s = act(s, { type: "chooseModes", player: ap, modes: [0, 1, 2] });
    expect(s.pending?.kind).toBe("chooseTargets");
    // Mode one's target is a card you own, mode two's one you don't (rulings).
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(theirGiant), tgt(myGiant), player(opp)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(myGiant), tgt(theirGiant), player(opp)] }), [ap]);
    expect(zoneOf(s, myGiant)).toBe("hand");
    expect(s.players[ap]!.hand).toContain(myGiant);
    expect(zoneOf(s, theirGiant)).toBe("library");
    expect(s.players[opp]!.library.at(-1)).toBe(theirGiant);
    expect(zoneOf(s, yard)).toBe("exile");
  });

  it("only face-up exiled cards with an Adventure can be targeted; with none, the graveyard mode is the only choice (rulings)", () => {
    const { s: s0, ap, opp, ids } = only([sentinel()]);
    const bearsEx = toZone(s0, ap, bears(), "exile");
    const down = toZone(s0, ap, giant(), "exile");
    s0.objects[down]!.faceDown = "manifest";
    let s = castAndSettle(s0, ap, ids[0]!);
    if (s.pending?.kind === "chooseModes") {
      expect(s.pending.legal).toEqual([false, false, true]);
      s = act(s, { type: "chooseModes", player: ap, modes: [2] });
    }
    expect(s.pending?.kind).toBe("chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [player(opp)] }), [ap]);
    expect(zoneOf(s, bearsEx)).toBe("exile");
    expect(zoneOf(s, down)).toBe("exile");
    expect(s.stack.length).toBe(0);
  });
});
