// Lane B round B247: Expert-Level Safe (two numbers chosen secretly and revealed at once, rulings; the cards exiled with it,
// CR 607.2a, exiled face down, CR 406.3), Urgent Necropsy (collect evidence X, CR 701.59a, X locked in from its targets
// before costs are paid, CR 601.2f and rulings) and Inniaz, the Gale Force (each player gains control of a nonland
// permanent of your choice controlled by the player to their right, CR 101.4; a creature given away is removed from combat,
// CR 506.4).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const safe = (): CardDef => ({"oracleId": "cf9129a3-25fe-4787-b41c-0b6968ba5aee", "name": "Expert-Level Safe", "manaCost": "{2}", "cmc": 2, "typeLine": "Artifact", "supertypes": [], "types": ["Artifact"], "subtypes": [], "oracleText": "When this artifact enters, exile the top two cards of your library face down.\n{1}, {T}: You and target opponent each secretly choose 1, 2, or 3. Then those choices are revealed. If they match, sacrifice this artifact and put all cards exiled with it into their owners' hands. Otherwise, exile the top card of your library face down.", "colors": [], "colorIdentity": [], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/4/9/499f4bdc-8b6a-4e87-92fd-8368537a6ced.jpg?1783912379", "artUrl": "https://cards.scryfall.io/art_crop/front/4/9/499f4bdc-8b6a-4e87-92fd-8368537a6ced.jpg?1783912379", "commanderLegal": "legal", "set": "pip", "releasedAt": "2024-03-08", "rarity": "uncommon", "layout": "normal", "gameChanger": false}) as CardDef;
const necropsy = (): CardDef => ({"oracleId": "378a6203-0d47-4165-bdc2-43dfdfb4d15d", "name": "Urgent Necropsy", "manaCost": "{2}{B}{G}", "cmc": 4, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "As an additional cost to cast this spell, collect evidence X, where X is the total mana value of the permanents this spell targets.\nDestroy up to one target artifact, up to one target creature, up to one target enchantment, and up to one target planeswalker.", "colors": ["B", "G"], "colorIdentity": ["B", "G"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/d/2/d2ac346a-fc46-4023-aa60-4d55170697dc.jpg?1783912833", "artUrl": "https://cards.scryfall.io/art_crop/front/d/2/d2ac346a-fc46-4023-aa60-4d55170697dc.jpg?1783912833", "commanderLegal": "legal", "set": "mkm", "releasedAt": "2024-02-09", "rarity": "mythic", "layout": "normal", "gameChanger": false}) as CardDef;
const inniaz = (): CardDef => ({"oracleId": "b06ebf74-4042-4c8f-a70b-98ba9e74e6ed", "name": "Inniaz, the Gale Force", "manaCost": "{3}{U}{U}", "cmc": 5, "typeLine": "Legendary Creature — Djinn", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Djinn"], "oracleText": "Flying\n{2}{W/U}: Attacking creatures with flying get +1/+1 until end of turn. ({W/U} can be paid with either {W} or {U}.)\nWhenever three or more creatures you control with flying attack, each player gains control of a nonland permanent of your choice controlled by the player to their right.", "power": "4", "toughness": "4", "colors": ["U"], "colorIdentity": ["U", "W"], "keywords": ["Flying"], "imageUrl": "https://cards.scryfall.io/normal/front/b/2/b238485f-ef67-4295-892b-a10235368f74.jpg?1783930506", "artUrl": "https://cards.scryfall.io/art_crop/front/b/2/b238485f-ef67-4295-892b-a10235368f74.jpg?1783930506", "commanderLegal": "legal", "set": "jmp", "releasedAt": "2020-07-17", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const drake = (): CardDef => ({"oracleId": "d6ffdaf0-ac08-4de9-bbce-2eab2f86bcca", "name": "Wind Drake", "manaCost": "{2}{U}", "cmc": 3, "typeLine": "Creature — Drake", "supertypes": [], "types": ["Creature"], "subtypes": ["Drake"], "oracleText": "Flying", "power": "2", "toughness": "2", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Flying"], "imageUrl": "https://cards.scryfall.io/normal/front/5/e/5e227a63-abea-494e-9d66-6ff0a3da14ca.jpg?1783937211", "artUrl": "https://cards.scryfall.io/art_crop/front/5/e/5e227a63-abea-494e-9d66-6ff0a3da14ca.jpg?1783937211", "commanderLegal": "legal", "set": "kld", "releasedAt": "2016-09-30", "rarity": "common", "layout": "normal", "gameChanger": false}) as CardDef;
const solRing = (): CardDef => ({"oracleId": "6ad8011d-3471-4369-9d68-b264cc027487", "name": "Sol Ring", "manaCost": "{1}", "cmc": 1, "typeLine": "Artifact", "supertypes": [], "types": ["Artifact"], "subtypes": [], "oracleText": "{T}: Add {C}{C}.", "colors": [], "colorIdentity": [], "keywords": [], "producedMana": ["C"], "imageUrl": "https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446", "artUrl": "https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446", "commanderLegal": "legal", "set": "frc", "releasedAt": "2026-10-02", "rarity": "uncommon", "layout": "normal", "gameChanger": false}) as CardDef;
const propaganda = (): CardDef => ({"oracleId": "ea9709b6-4c37-4d5a-b04d-cd4c42e4f9dd", "name": "Propaganda", "manaCost": "{2}{U}", "cmc": 3, "typeLine": "Enchantment", "supertypes": [], "types": ["Enchantment"], "subtypes": [], "oracleText": "Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you.", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/a/c/ac943e31-26bc-4b54-b73f-460e6e402d86.jpg?1783903239", "artUrl": "https://cards.scryfall.io/art_crop/front/a/c/ac943e31-26bc-4b54-b73f-460e6e402d86.jpg?1783903239", "commanderLegal": "legal", "set": "msc", "releasedAt": "2026-06-26", "rarity": "uncommon", "layout": "normal", "gameChanger": false}) as CardDef;
const steelOverseer = (): CardDef => ({"oracleId": "986ae327-f433-4c58-93dc-afc544b9bfcb", "name": "Steel Overseer", "manaCost": "{2}", "cmc": 2, "typeLine": "Artifact Creature — Construct", "supertypes": [], "types": ["Artifact", "Creature"], "subtypes": ["Construct"], "oracleText": "{T}: Put a +1/+1 counter on each artifact creature you control.", "power": "1", "toughness": "1", "colors": [], "colorIdentity": [], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/c/a/ca078f45-b4eb-4b5b-87cb-80b6c0ba5f31.jpg?1783912342", "artUrl": "https://cards.scryfall.io/art_crop/front/c/a/ca078f45-b4eb-4b5b-87cb-80b6c0ba5f31.jpg?1783912342", "commanderLegal": "legal", "set": "pip", "releasedAt": "2024-03-08", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId": "a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba", "name": "Ornithopter", "manaCost": "{0}", "cmc": 0, "typeLine": "Artifact Creature — Thopter", "supertypes": [], "types": ["Artifact", "Creature"], "subtypes": ["Thopter"], "oracleText": "Flying", "power": "0", "toughness": "2", "colors": [], "colorIdentity": [], "keywords": ["Flying"], "imageUrl": "https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724", "artUrl": "https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724", "commanderLegal": "legal", "set": "aer", "releasedAt": "2017-01-20", "rarity": "uncommon", "layout": "normal", "gameChanger": false}) as CardDef;
const bears = (): CardDef => ({"oracleId": "14c8f55d-d177-4c25-a931-ebeb9e6062a0", "name": "Grizzly Bears", "manaCost": "{1}{G}", "cmc": 2, "typeLine": "Creature — Bear", "supertypes": [], "types": ["Creature"], "subtypes": ["Bear"], "oracleText": "", "power": "2", "toughness": "2", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798", "artUrl": "https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798", "commanderLegal": "legal", "set": "slz", "releasedAt": "2026-09-02", "rarity": "common", "layout": "normal", "gameChanger": false}) as CardDef;
const jace = (): CardDef => ({"oracleId": "cc2b6e58-2d6f-495e-95f3-9496105c4cba", "name": "Jace Beleren", "manaCost": "{1}{U}{U}", "cmc": 3, "typeLine": "Legendary Planeswalker — Jace", "supertypes": ["Legendary"], "types": ["Planeswalker"], "subtypes": ["Jace"], "oracleText": "+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards.", "loyalty": "3", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Mill"], "imageUrl": "https://cards.scryfall.io/normal/front/b/c/bc836203-4bb9-4bfa-89ab-0ad49f916c92.jpg?1783942523", "artUrl": "https://cards.scryfall.io/art_crop/front/b/c/bc836203-4bb9-4bfa-89ab-0ad49f916c92.jpg?1783942523", "commanderLegal": "legal", "set": "dd2", "releasedAt": "2008-11-07", "rarity": "mythic", "layout": "normal", "gameChanger": false}) as CardDef;
const forestCard = (): CardDef => ({"oracleId": "b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6", "name": "Forest", "manaCost": "", "cmc": 0, "typeLine": "Basic Land — Forest", "supertypes": ["Basic"], "types": ["Land"], "subtypes": ["Forest"], "oracleText": "({T}: Add {G}.)", "colors": [], "colorIdentity": ["G"], "keywords": [], "producedMana": ["G"], "imageUrl": "https://cards.scryfall.io/normal/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689", "artUrl": "https://cards.scryfall.io/art_crop/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689", "commanderLegal": "legal", "set": "trk", "releasedAt": "2026-11-13", "rarity": "common", "layout": "normal", "gameChanger": false}) as CardDef;

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
const none: TargetChoice = { kind: "none" };
const toZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "library" | "exile" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
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
const choose = (s: GameState, pid: PlayerId, choice: string) => act(s, { type: "chooseOption", player: pid, choice });

describe("Lane B round B247", () => {
  it("are fully supported", () => {
    supported(safe(), necropsy(), inniaz());
  });
});

describe("Lane B round B247: Expert-Level Safe", () => {
  /** The Safe cast and resolved, its enters trigger too; the two cards it exiled. */
  const safeOut = () => {
    const { s: s0, ap, opp, ids } = only([safe()]);
    const top = s0.players[ap]!.library.slice(0, 3);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), [ap]);
    return { s, ap, opp, id: ids[0]!, top };
  };
  /** Activates the Safe targeting `opp`, stopping at the first number to choose. */
  const crack = (s: GameState, ap: PlayerId, id: string, opp: PlayerId) => settle(run(s, planActivate(s, ap, id, 0, [player(opp)])), [ap, opp]);

  it("enters exiling the top two cards of your library face down", () => {
    const { s, ap, id, top } = safeOut();
    expect(zoneOf(s, id)).toBe("battlefield");
    expect(top.slice(0, 2).map((c) => zoneOf(s, c))).toEqual(["exile", "exile"]);
    expect(top.slice(0, 2).every((c) => s.objects[c]!.hiddenExile?.seen.length === 0)).toBe(true);
    expect(zoneOf(s, top[2]!)).toBe("library");
    expect(s.players[ap]!.hand.length).toBe(0);
  });

  it("matching numbers: the Safe is sacrificed and the cards exiled with it go to their owner's hand", () => {
    const { s: s0, ap, opp, id, top } = safeOut();
    let s = crack(s0, ap, id, opp);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "secretNumber", player: ap, numberRange: { min: 1, max: 3 } });
    // Only 1, 2 or 3.
    expect(() => choose(s, ap, "4")).toThrow();
    expect(() => choose(s, ap, "0")).toThrow();
    const before = s.log.length;
    s = choose(s, ap, "2");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "secretNumber", player: opp });
    // Nothing tells the opponent which number was chosen yet.
    expect(s.log.slice(before).map((l) => l.text ?? String(l)).join("\n")).not.toMatch(/2/);
    s = settle(choose(s, opp, "2"), [ap, opp]);
    expect(s.log.map((l) => l.text ?? String(l)).join("\n")).toMatch(/The numbers match\./);
    expect(zoneOf(s, id)).toBe("graveyard");
    expect(top.slice(0, 2).map((c) => zoneOf(s, c))).toEqual(["hand", "hand"]);
    expect(s.players[ap]!.hand.length).toBe(2);
    expect(zoneOf(s, top[2]!)).toBe("library");
  });

  it("different numbers: one more card exiled face down, and a later match returns all three", () => {
    const { s: s0, ap, opp, id, top } = safeOut();
    let s = crack(s0, ap, id, opp);
    s = choose(s, ap, "1");
    s = settle(choose(s, opp, "3"), [ap, opp]);
    expect(s.log.map((l) => l.text ?? String(l)).join("\n")).toMatch(/The numbers don't match\./);
    expect(zoneOf(s, id)).toBe("battlefield");
    expect(top.map((c) => zoneOf(s, c))).toEqual(["exile", "exile", "exile"]);
    expect(s.objects[top[2]!]!.hiddenExile?.seen).toEqual([]);
    // Again next turn, untapped.
    s.objects[id]!.tapped = false;
    s = crack(s, ap, id, opp);
    s = choose(s, ap, "3");
    s = settle(choose(s, opp, "3"), [ap, opp]);
    expect(zoneOf(s, id)).toBe("graveyard");
    expect(top.map((c) => zoneOf(s, c))).toEqual(["hand", "hand", "hand"]);
  });

  it("only you and the target opponent choose; bots answer with 1, 2 or 3", () => {
    const { s: s0, ap, opp, id } = safeOut();
    let s = crack(s0, ap, id, opp);
    s = choose(s, ap, "2");
    const asked: PlayerId[] = [];
    for (let i = 0; i < 50 && (s.stack.length || s.pending); i++) {
      const p = s.pending;
      if (p) {
        asked.push(p.player);
        const a = botActions(s, p.player);
        expect(a[0]).toMatchObject({ type: "chooseOption" });
        expect(["1", "2", "3"]).toContain((a[0] as { choice: string }).choice);
        for (const x of a) s = act(s, x);
      } else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(asked).toEqual([opp]);
    expect(s.log.map((l) => l.text ?? String(l)).join("\n")).toMatch(/The numbers (match|don't match)\./);
  });

  it("a bot can activate it on its own", () => {
    const { s: s0, ap, opp, id } = safeOut();
    const plan = planActivate(s0, ap, id, 0, [player(opp)]);
    expect(plan).not.toBeNull();
    // Targeting yourself isn't allowed: "target opponent".
    expect(planActivate(s0, ap, id, 0, [player(ap)])).toBeNull();
    const s = settle(run(s0, plan));
    expect(s.log.map((l) => l.text ?? String(l)).join("\n")).toMatch(/The numbers are revealed: /);
  });

  it("with the Safe gone before the ability resolves, the cards exiled with it still go to their owner's hand on a match", () => {
    const { s: s0, ap, opp, id, top } = safeOut();
    let s = run(s0, planActivate(s0, ap, id, 0, [player(opp)]));
    // The Safe leaves the battlefield in response.
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "graveyard";
    s.objects[id]!.zoneChanges = (s.objects[id]!.zoneChanges ?? 0) + 1;
    s.players[ap]!.graveyard.push(id);
    invalidateCharacteristics(s);
    s = settle(s, [ap, opp]);
    s = choose(s, ap, "1");
    s = settle(choose(s, opp, "1"), [ap, opp]);
    expect(top.slice(0, 2).map((c) => zoneOf(s, c))).toEqual(["hand", "hand"]);
  });
});

describe("Lane B round B247: Urgent Necropsy", () => {
  /** Necropsy in hand; `yard` cards in your graveyard; an opponent with a Sol Ring, Grizzly Bears, Propaganda and Jace. */
  const scene = (yard: CardDef[]) => {
    const { s, ap, opp, ids } = only([necropsy()]);
    const ring = putOnBattlefield(s, opp, solRing());
    const bear = putOnBattlefield(s, opp, bears());
    const prop = putOnBattlefield(s, opp, propaganda());
    const jb = putOnBattlefield(s, opp, jace());
    s.objects[jb]!.counters.loyalty = 3;
    const gy = yard.map((d) => toZone(s, ap, d, "graveyard"));
    return { s, ap, opp, id: ids[0]!, ring, bear, prop, jb, gy };
  };
  const cast = (s: GameState, ap: PlayerId, id: string, targets: TargetChoice[], evidence?: string[]) =>
    settle(run(s, planCast(s, ap, id, targets, undefined, "auto", undefined, evidence ? { evidence } : {})), [ap]);

  it("X is the total mana value of its targets: evidence 1+2+3+3 = 9 destroys all four", () => {
    const { s: s0, ap, id, ring, bear, prop, jb, gy } = scene([inniaz(), drake(), bears(), forestCard()]);
    // 5 + 3 + 2 = 10, at least 9.
    const s = cast(s0, ap, id, [tgt(ring), tgt(bear), tgt(prop), tgt(jb)], [gy[0]!, gy[1]!, gy[2]!]);
    for (const x of [ring, bear, prop, jb]) expect(zoneOf(s, x)).toBe("graveyard");
    expect(gy.map((x) => zoneOf(s, x))).toEqual(["exile", "exile", "exile", "graveyard"]);
  });

  it("can't be cast with too little mana value picked, or too little in your graveyard", () => {
    const { s: s0, ap, id, ring, bear, prop, jb, gy } = scene([inniaz(), drake()]);
    const all = [tgt(ring), tgt(bear), tgt(prop), tgt(jb)];
    // 9 needed: Inniaz (5) isn't enough, nor is all the graveyard has (8).
    expect(() => run(s0, planCast(s0, ap, id, all, undefined, "auto", undefined, { evidence: [gy[0]!] }))).toThrow();
    expect(() => run(s0, planCast(s0, ap, id, all, undefined, "auto", undefined, { evidence: [gy[0]!, gy[1]!] }))).toThrow();
    // With no evidence named, it isn't collected for you either.
    expect(() => run(s0, planCast(s0, ap, id, all, undefined, "auto", undefined, {}))).toThrow();
    // Three of them (Sol Ring, Bears, Propaganda: 6) can be.
    const s = cast(s0, ap, id, [tgt(ring), tgt(bear), tgt(prop), none], [gy[0]!, gy[1]!]);
    expect([ring, bear, prop, jb].map((x) => zoneOf(s, x))).toEqual(["graveyard", "graveyard", "graveyard", "battlefield"]);
  });

  it("with fewer targets, X is smaller; with no targets, X is 0 and nothing is exiled", () => {
    const { s: s0, ap, id, ring, bear, gy } = scene([drake()]);
    // Sol Ring + Grizzly Bears = 3: the Drake is enough.
    let s = cast(s0, ap, id, [tgt(ring), tgt(bear), none, none], [gy[0]!]);
    expect([zoneOf(s, ring), zoneOf(s, bear), zoneOf(s, gy[0]!)]).toEqual(["graveyard", "graveyard", "exile"]);
    const r = scene([drake()]);
    s = cast(r.s, r.ap, r.id, [none, none, none, none], []);
    expect(zoneOf(s, r.id)).toBe("graveyard");
    expect(zoneOf(s, r.gy[0]!)).toBe("graveyard");
  });

  it("a permanent targeted twice (an artifact creature) counts once", () => {
    const { s: s0, ap, opp, id, gy } = scene([ornithopter(), bears()]);
    const overseer = putOnBattlefield(s0, opp, steelOverseer());
    // Two, not four: Grizzly Bears (2) alone is enough.
    const s = cast(s0, ap, id, [tgt(overseer), tgt(overseer), none, none], [gy[1]!]);
    expect(zoneOf(s, overseer)).toBe("graveyard");
    expect(zoneOf(s, gy[1]!)).toBe("exile");
    expect(zoneOf(s, gy[0]!)).toBe("graveyard");
  });

  it("a bot casting it leaves out targets until it can pay the evidence", () => {
    const { s: s0, ap, id, ring, bear, prop, jb } = scene([drake()]);
    let s = s0;
    for (let i = 0; i < 6 && zoneOf(s, id) === "hand"; i++) for (const a of botActions(s, ap)) s = act(s, a);
    expect(zoneOf(s, id)).not.toBe("hand");
    s = settle(s);
    expect(zoneOf(s, id)).toBe("graveyard");
    // 3 mana value of evidence: some of the four, at most 3 in all.
    const gone = [ring, bear, prop, jb].filter((x) => zoneOf(s, x) === "graveyard");
    expect(gone.length).toBeGreaterThan(0);
    expect(gone.reduce((n, x) => n + (s.cards[s.objects[x]!.cardId]!.cmc ?? 0), 0)).toBeLessThanOrEqual(3);
  });
});

describe("Lane B round B247: Inniaz, the Gale Force", () => {
  /** Inniaz and two Wind Drakes for the active player, a Sol Ring and Grizzly Bears for each other player, attacks declared. */
  const attack = (fliers: number) => {
    const { s: s0, ap } = only([]);
    const order = s0.turnOrder;
    const ini = putOnBattlefield(s0, ap, inniaz());
    const drakes = Array.from({ length: fliers - 1 }, () => putOnBattlefield(s0, ap, drake()));
    const others = order.filter((p) => p !== ap);
    const stuff = Object.fromEntries(others.map((p) => [p, { ring: putOnBattlefield(s0, p, solRing()), bear: putOnBattlefield(s0, p, bears()) }])) as Record<PlayerId, { ring: string; bear: string }>;
    let s = passUntil(s0, "declareAttackers", ap);
    const opp = order[(order.indexOf(ap) + 1) % 4]!;
    s = act(s, { type: "declareAttackers", player: ap, attacks: [ini, ...drakes].map((attacker) => ({ attacker, defender: opp })) });
    return { s, ap, opp, ini, drakes, stuff, order };
  };
  const right = (s: GameState, p: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(p) + 3) % 4]!;

  it("three fliers attacking: you choose, for each player, a nonland permanent of the player to their right, and it changes hands for good", () => {
    let { s, ap, ini, stuff } = attack(3);
    s = settle(s, [ap]);
    // First: for you, from the player to your right.
    const seen: PlayerId[] = [];
    const pick: Record<PlayerId, string> = {} as Record<PlayerId, string>;
    for (let i = 0; i < 4 && s.pending?.kind === "pickPermanents"; i++) {
      const p = s.pending;
      expect(p.player).toBe(ap);
      const forWhom = p.pickFor ?? ap;
      const from = right(s, forWhom);
      seen.push(forWhom);
      const mine = from === ap;
      // Lands aren't offered; the player to your right's Sol Ring and Bears are.
      if (!mine) expect([...p.options].sort()).toEqual([stuff[from]!.ring, stuff[from]!.bear].sort());
      const choice = mine ? ini : stuff[from]!.ring;
      expect(p.options).toContain(choice);
      pick[forWhom] = choice;
      s = settle(act(s, { type: "pickPermanents", player: ap, ids: [choice] }), [ap]);
    }
    expect(seen.length).toBe(4);
    expect(seen[0]).toBe(ap);
    // Each player controls what was chosen for them.
    for (const [forWhom, id] of Object.entries(pick)) expect(controllerOf(s, s.objects[id]!)).toBe(Number(forWhom));
    // Inniaz went to the player to your left, and left combat (CR 506.4).
    expect(s.objects[ini]!.attacking).toBeUndefined();
    // For good: still theirs next turn.
    s = passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    for (const [forWhom, id] of Object.entries(pick)) expect(controllerOf(s, s.objects[id]!)).toBe(Number(forWhom));
  });

  it("a player whose right neighbour has no nonland permanents gets nothing; a single one is taken without asking", () => {
    const r = attack(3);
    let s = r.s;
    const ap = r.ap;
    // The player to your right has only the Sol Ring left; the one across has nothing.
    const toRight = right(s, ap);
    const across = right(s, toRight);
    for (const id of [r.stuff[toRight]!.bear, r.stuff[across]!.ring, r.stuff[across]!.bear]) {
      s.battlefield.splice(s.battlefield.indexOf(id), 1);
      s.objects[id]!.zone = "graveyard";
    }
    invalidateCharacteristics(s);
    s = settle(s, [ap]);
    // You'd get the Sol Ring without being asked; the player to your right (from across) nothing; then picks for the others.
    const asked: PlayerId[] = [];
    for (let i = 0; i < 4 && s.pending?.kind === "pickPermanents"; i++) {
      asked.push(s.pending.pickFor ?? ap);
      s = settle(act(s, { type: "pickPermanents", player: ap, ids: [s.pending.options[0]!] }), [ap]);
    }
    expect(asked).not.toContain(ap);
    expect(asked).not.toContain(toRight);
    expect(controllerOf(s, s.objects[r.stuff[toRight]!.ring]!)).toBe(ap);
  });

  it("two fliers don't trigger it", () => {
    let { s, ap, ini } = attack(2);
    s = settle(s, [ap]);
    expect(s.pending?.kind === "pickPermanents").toBe(false);
    expect(controllerOf(s, s.objects[ini]!)).toBe(ap);
    expect(s.log.map((l) => l.text ?? String(l)).join("\n")).not.toMatch(/gains control/);
  });

  it("a bot picks for every player", () => {
    let { s, ap } = attack(4);
    s = settle(s);
    expect(s.log.map((l) => l.text ?? String(l)).join("\n")).toMatch(/gains control of/);
    // Four players, each gaining one permanent.
    expect(s.log.filter((l) => /^[A-D] gains control of/.test(l.text ?? String(l))).length).toBe(4);
    expect(ap).toBeDefined();
  });
});
