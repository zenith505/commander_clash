// Lane B round B272: Cass, Hand of Vengeance (whenever it or another creature you control dies, if it was enchanted or
// equipped, the Aura cards that were attached to it return from your graveyard attached to target creature, then the
// Equipment that were attached to it are attached to that creature; CR 603.10a, 603.4, 303.4f, 701.3) and Bruna, Light of
// Alabaster (as it attacks or blocks, any number of Auras on the battlefield attached to it, then any number of Aura
// cards from your graveyard and/or hand put onto the battlefield attached to it; CR 701.3a-b, 303.4f-g, 110.2a).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup, target } from "./helpers";
import { botActions } from "../src/bot";
import { applyAction, controllerOf, invalidateCharacteristics, isFullySupported, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const cass = (): CardDef => ({"oracleId": "f9b6b1db-37c6-43d4-b762-6c9770da5964", "name": "Cass, Hand of Vengeance", "manaCost": "{2}{R}{W}", "cmc": 4, "typeLine": "Legendary Creature — Human Ranger", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Human", "Ranger"], "oracleText": "Vigilance\nWhenever Cass or another creature you control dies, if it was enchanted or equipped, return any number of Aura cards that were attached to it from your graveyard to the battlefield attached to target creature, then attach any number of Equipment that were attached to it to that creature.", "power": "4", "toughness": "3", "colors": ["R", "W"], "colorIdentity": ["R", "W"], "keywords": ["Vigilance"], "imageUrl": "https://cards.scryfall.io/normal/front/5/b/5b6d7fa6-4de6-4bc8-b250-2ed6eb559618.jpg?1783912391", "artUrl": "https://cards.scryfall.io/art_crop/front/5/b/5b6d7fa6-4de6-4bc8-b250-2ed6eb559618.jpg?1783912391", "layout": "normal"}) as CardDef;
const bruna = (): CardDef => ({"oracleId": "e8f213eb-58db-4fab-bd0b-2acfd0a86ac3", "name": "Bruna, Light of Alabaster", "manaCost": "{3}{W}{W}{U}", "cmc": 6, "typeLine": "Legendary Creature — Angel", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Angel"], "oracleText": "Flying, vigilance\nWhenever Bruna attacks or blocks, you may attach to it any number of Auras on the battlefield and you may put onto the battlefield attached to it any number of Aura cards that could enchant it from your graveyard and/or hand.", "power": "5", "toughness": "5", "colors": ["U", "W"], "colorIdentity": ["U", "W"], "keywords": ["Flying", "Vigilance"], "imageUrl": "https://cards.scryfall.io/normal/front/e/3/e390bc78-31ad-4131-a9e4-93ee0c7c2f34.jpg?1783940656", "artUrl": "https://cards.scryfall.io/art_crop/front/e/3/e390bc78-31ad-4131-a9e4-93ee0c7c2f34.jpg?1783940656", "layout": "normal"}) as CardDef;
const pacifism = (): CardDef => ({"oracleId": "5f5e0b10-c8cf-450c-bfd3-bcb0528ec330", "name": "Pacifism", "manaCost": "{1}{W}", "cmc": 2, "typeLine": "Enchantment — Aura", "supertypes": [], "types": ["Enchantment"], "subtypes": ["Aura"], "oracleText": "Enchant creature\nEnchanted creature can't attack or block.", "colors": ["W"], "colorIdentity": ["W"], "keywords": ["Enchant"], "imageUrl": "https://cards.scryfall.io/normal/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091", "artUrl": "https://cards.scryfall.io/art_crop/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091", "layout": "normal"}) as CardDef;
const holyStrength = (): CardDef => ({"oracleId": "9357de36-f8be-4f49-b2c8-9fe9eaf82b07", "name": "Holy Strength", "manaCost": "{W}", "cmc": 1, "typeLine": "Enchantment — Aura", "supertypes": [], "types": ["Enchantment"], "subtypes": ["Aura"], "oracleText": "Enchant creature\nEnchanted creature gets +1/+2.", "colors": ["W"], "colorIdentity": ["W"], "keywords": ["Enchant"], "imageUrl": "https://cards.scryfall.io/normal/front/e/2/e21264cb-d915-4431-92fd-b0aa32a715fc.jpg?1783943078", "artUrl": "https://cards.scryfall.io/art_crop/front/e/2/e21264cb-d915-4431-92fd-b0aa32a715fc.jpg?1783943078", "layout": "normal"}) as CardDef;
const bonesplitter = (): CardDef => ({"oracleId": "452e3f5f-ce17-4682-966b-5cc100210aee", "name": "Bonesplitter", "manaCost": "{1}", "cmc": 1, "typeLine": "Artifact — Equipment", "supertypes": [], "types": ["Artifact"], "subtypes": ["Equipment"], "oracleText": "Equipped creature gets +2/+0.\nEquip {1}", "colors": [], "colorIdentity": [], "keywords": ["Equip"], "imageUrl": "https://cards.scryfall.io/normal/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980", "artUrl": "https://cards.scryfall.io/art_crop/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980", "layout": "normal"}) as CardDef;
const bolt = (): CardDef => ({"oracleId": "4457ed35-7c10-48c8-9776-456485fdf070", "name": "Lightning Bolt", "manaCost": "{R}", "cmc": 1, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Lightning Bolt deals 3 damage to any target.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008", "artUrl": "https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008", "layout": "normal"}) as CardDef;
const bears = (): CardDef => ({"oracleId": "14c8f55d-d177-4c25-a931-ebeb9e6062a0", "name": "Grizzly Bears", "manaCost": "{1}{G}", "cmc": 2, "typeLine": "Creature — Bear", "supertypes": [], "types": ["Creature"], "subtypes": ["Bear"], "oracleText": "", "power": "2", "toughness": "2", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798", "artUrl": "https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798", "layout": "normal"}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId": "342199e0-15b6-4824-83da-25caef2592b3", "name": "Hill Giant", "manaCost": "{3}{R}", "cmc": 4, "typeLine": "Creature — Giant", "supertypes": [], "types": ["Creature"], "subtypes": ["Giant"], "oracleText": "", "power": "3", "toughness": "3", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018", "artUrl": "https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018", "layout": "normal"}) as CardDef;
const ancestralMask = (): CardDef => ({"oracleId": "db5380ed-ba28-4ea2-abc3-4998e2022903", "name": "Ancestral Mask", "manaCost": "{2}{G}", "cmc": 3, "typeLine": "Enchantment — Aura", "supertypes": [], "types": ["Enchantment"], "subtypes": ["Aura"], "oracleText": "Enchant creature\nEnchanted creature gets +2/+2 for each other enchantment on the battlefield.", "colors": ["G"], "colorIdentity": ["G"], "keywords": ["Enchant"], "imageUrl": "https://cards.scryfall.io/normal/front/c/7/c7a19fc5-20f3-48d2-8c12-e012d3b302e7.jpg?1783937570", "artUrl": "https://cards.scryfall.io/art_crop/front/c/7/c7a19fc5-20f3-48d2-8c12-e012d3b302e7.jpg?1783937570", "layout": "normal"}) as CardDef;
const vodalianZombie = (): CardDef => ({"oracleId": "58e4f299-bb32-4727-8498-a364166adc38", "name": "Vodalian Zombie", "manaCost": "{U}{B}", "cmc": 2, "typeLine": "Creature — Merfolk Zombie", "supertypes": [], "types": ["Creature"], "subtypes": ["Merfolk", "Zombie"], "oracleText": "Protection from green", "power": "2", "toughness": "2", "colors": ["B", "U"], "colorIdentity": ["B", "U"], "keywords": ["Protection"], "imageUrl": "https://cards.scryfall.io/normal/front/f/3/f30a5a06-32ce-4d71-b71f-e3e1d8d4511a.jpg?1783945653", "artUrl": "https://cards.scryfall.io/art_crop/front/f/3/f30a5a06-32ce-4d71-b71f-e3e1d8d4511a.jpg?1783945653", "layout": "normal"}) as CardDef;
const wildGrowth = (): CardDef => ({"oracleId": "706ae742-1807-44b7-a4fa-f2e26f61519a", "name": "Wild Growth", "manaCost": "{G}", "cmc": 1, "typeLine": "Enchantment — Aura", "supertypes": [], "types": ["Enchantment"], "subtypes": ["Aura"], "oracleText": "Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional {G}.", "colors": ["G"], "colorIdentity": ["G"], "keywords": ["Enchant"], "producedMana": ["G"], "imageUrl": "https://cards.scryfall.io/normal/front/1/6/16fdfa77-424a-4f83-bb48-1c43b6c84b17.jpg?1783912353", "artUrl": "https://cards.scryfall.io/art_crop/front/1/6/16fdfa77-424a-4f83-bb48-1c43b6c84b17.jpg?1783912353", "layout": "normal"}) as CardDef;
const murder = (): CardDef => ({"oracleId": "938b4e2c-88d9-4637-bc00-e228920c9a78", "name": "Murder", "manaCost": "{1}{B}{B}", "cmc": 3, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Destroy target creature.", "colors": ["B"], "colorIdentity": ["B"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477", "artUrl": "https://cards.scryfall.io/art_crop/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477", "layout": "normal"}) as CardDef;
const unholyStrength = (): CardDef => ({"oracleId": "090d88a9-7f2d-4bd1-a30a-7c48d05068be", "name": "Unholy Strength", "manaCost": "{B}", "cmc": 1, "typeLine": "Enchantment — Aura", "supertypes": [], "types": ["Enchantment"], "subtypes": ["Aura"], "oracleText": "Enchant creature\nEnchanted creature gets +2/+1.", "colors": ["B"], "colorIdentity": ["B"], "keywords": ["Enchant"], "imageUrl": "https://cards.scryfall.io/normal/front/8/a/8adc48d8-7ff9-46d4-921a-03e63ca41a66.jpg?1783943025", "artUrl": "https://cards.scryfall.io/art_crop/front/8/a/8adc48d8-7ff9-46d4-921a-03e63ca41a66.jpg?1783943025", "layout": "normal"}) as CardDef;
const shock = (): CardDef => ({"oracleId": "a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d", "name": "Shock", "manaCost": "{R}", "cmc": 1, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Shock deals 2 damage to any target.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334", "artUrl": "https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334", "layout": "normal"}) as CardDef;

const supported = (...ds: CardDef[]) => ds.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 400 && !s.over && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Plays on with no attacks or blocks until `done`, stopping at any other question. */
const until = (s: GameState, done: (s: GameState) => boolean, max = 3000) => {
  for (let i = 0; i < max && !s.over; i++) {
    if (done(s)) return s;
    const pid = waitingOn(s)!;
    const p = s.pending;
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (p?.kind === "pickPermanents" && p.action === "keepTapped") s = act(s, { type: "pickPermanents", player: pid, ids: [] });
    else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, p.count) });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: pid });
  }
  return s;
};
/** Lets the bots answer every question until `done`. */
const botsUntil = (s: GameState, done: (s: GameState) => boolean, max = 400) => {
  for (let i = 0; i < max && !s.over && !done(s); i++) {
    const pid = waitingOn(s)!;
    for (const a of botActions(s, pid)) s = applyAction(s, a);
  }
  return s;
};
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
/** A fresh copy of `def` in one of `pid`'s zones. */
const putIn = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** `what` (an Aura or Equipment) attached to `host`. */
const attach = (s: GameState, what: string, host: string) => {
  s.objects[what]!.attachedTo = host;
  invalidateCharacteristics(s);
};
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;

describe("Cass, Hand of Vengeance", () => {
  it("is supported", () => supported(cass(), bruna()));

  /** Your Cass, Hill Giant with your Holy Strength and Bonesplitter on it, Grizzly Bears; Murder in your hand. */
  const board = () => {
    const { s, ap, opp, ids } = setup([murder()]);
    const c = putOnBattlefield(s, ap, cass());
    const giant = putOnBattlefield(s, ap, hillGiant());
    const holy = putOnBattlefield(s, ap, holyStrength());
    const bone = putOnBattlefield(s, ap, bonesplitter());
    attach(s, holy, giant);
    attach(s, bone, giant);
    const bear = putOnBattlefield(s, ap, bears());
    return { s, ap, opp, murder: ids[0]!, c, giant, holy, bone, bear };
  };

  it("returns the chosen Aura cards attached to the target, then attaches the chosen Equipment to it", () => {
    const { s: s0, ap, murder: m, giant, holy, bone, bear } = board();
    let s = settle(run(s0, planCast(s0, ap, m, [target(giant)])));
    expect(zone(s, giant)).toBe("graveyard");
    // The Aura went to the graveyard (CR 704.5m); the Equipment stayed, unattached (CR 704.5n).
    expect(zone(s, holy)).toBe("graveyard");
    expect(s.objects[bone]!.attachedTo).toBeUndefined();
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(bear)] }));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, cards: [holy], min: 0, max: 1, fromGraveyard: "battlefield" });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [holy] }));
    expect(zone(s, holy)).toBe("battlefield");
    expect(s.objects[holy]!.attachedTo).toBe(bear);
    expect(controllerOf(s, s.objects[holy]!)).toBe(ap);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "attach", options: [bone], min: 0 });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [bone] }));
    expect(s.objects[bone]!.attachedTo).toBe(bear);
    // Holy Strength +1/+2, Bonesplitter +2/+0.
    expect(pt(s, bear)).toBe("5/4");
  });

  it("may return none and attach none", () => {
    const { s: s0, ap, murder: m, giant, holy, bone, bear } = board();
    let s = settle(run(s0, planCast(s0, ap, m, [target(giant)])));
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(bear)] }));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }));
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [] }));
    expect(zone(s, holy)).toBe("graveyard");
    expect(s.objects[bone]!.attachedTo).toBeUndefined();
    expect(pt(s, bear)).toBe("2/2");
  });

  it("Cass itself: only if it was enchanted or equipped; not for another creature that wasn't", () => {
    // Unenchanted Cass dies: no trigger (the condition is about it too, CR 603.4).
    const { s: s0, ap, murder: m, c, bear, bone } = board();
    let s = settle(run(s0, planCast(s0, ap, m, [target(c)])));
    expect(zone(s, c)).toBe("graveyard");
    expect(s.pending).toBeFalsy();
    expect(s.stack.length).toBe(0);
    // An unenchanted, unequipped creature of yours: no trigger.
    const b = board();
    s = settle(run(b.s, planCast(b.s, b.ap, b.murder, [target(b.bear)])));
    expect(zone(s, b.bear)).toBe("graveyard");
    expect(s.pending).toBeFalsy();
    // Cass equipped: it sees itself die (CR 603.10a), and the Equipment goes to the target.
    const e = board();
    attach(e.s, e.bone, e.c);
    s = settle(run(e.s, planCast(e.s, e.ap, e.murder, [target(e.c)])));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: e.ap });
    s = settle(act(s, { type: "chooseTargets", player: e.ap, targets: [target(e.bear)] }));
    // No Aura was on Cass: straight to the Equipment.
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "attach", options: [e.bone] });
    s = settle(act(s, { type: "pickPermanents", player: e.ap, ids: [e.bone] }));
    expect(s.objects[e.bone]!.attachedTo).toBe(e.bear);
    void ap; void bear; void bone;
  });

  it("not an Aura that can't legally enchant the target, nor one another player owns, nor Equipment that weren't on it", () => {
    const { s: s0, ap, opp, murder: m, giant, holy, bone } = board();
    // Ancestral Mask (green) can't enchant Vodalian Zombie (protection from green, rulings).
    const fire = putOnBattlefield(s0, ap, ancestralMask());
    attach(s0, fire, giant);
    // An opponent's Pacifism on the Giant goes to their graveyard.
    const pac = putOnBattlefield(s0, opp, pacifism());
    attach(s0, pac, giant);
    const kor = putOnBattlefield(s0, ap, vodalianZombie());
    // An Equipment that wasn't attached to the Giant.
    const other = putOnBattlefield(s0, ap, bonesplitter());
    let s = settle(run(s0, planCast(s0, ap, m, [target(giant)])));
    expect(zone(s, fire)).toBe("graveyard");
    expect(s.players[opp]!.graveyard).toContain(pac);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(kor)] }));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", cards: [holy] });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [holy] }));
    expect(s.objects[holy]!.attachedTo).toBe(kor);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", options: [bone] });
    void other;
  });

  it("a card that left the graveyard and came back is a new object, not returned (CR 400.7)", () => {
    const { s: s0, ap, murder: m, giant, holy, bear } = board();
    let s = settle(run(s0, planCast(s0, ap, m, [target(giant)])));
    // Holy Strength leaves the graveyard and comes back before Cass's ability resolves.
    const o = s.objects[holy]!;
    o.zoneChanges = (o.zoneChanges ?? 0) + 2;
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(bear)] }));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "attach" });
    expect(zone(s, holy)).toBe("graveyard");
  });

  it("a bot targets its best creature and returns the Auras that help it, attaching the Equipment", () => {
    const { s: s0, ap, murder: m, c, giant, holy, bone } = board();
    // A harmful Aura of its own on the Giant (it was never the Giant's controller's choice to keep).
    const pac = putOnBattlefield(s0, ap, pacifism());
    attach(s0, pac, giant);
    let s = run(s0, planCast(s0, ap, m, [target(giant)]));
    s = botsUntil(s, (x) => !x.stack.length && !x.triggerQueue.length && !x.pending && zone(x, giant) === "graveyard");
    // Cass (4/3) is worth more than Grizzly Bears.
    expect(s.objects[holy]!.attachedTo).toBe(c);
    expect(s.objects[bone]!.attachedTo).toBe(c);
    expect(zone(s, pac)).toBe("graveyard");
  });
});

describe("Bruna, Light of Alabaster", () => {
  /**
   * Your Bruna; an opponent's Grizzly Bears with their Holy Strength on it; your Pacifism on an opponent's Hill Giant;
   * their Wild Growth on a land; Unholy Strength and Wild Growth in your hand, Ancestral Mask in your graveyard.
   */
  const board = () => {
    const { s, ap, opp } = setup([]);
    const b = putOnBattlefield(s, ap, bruna());
    const bear = putOnBattlefield(s, opp, bears());
    const holy = putOnBattlefield(s, opp, holyStrength());
    attach(s, holy, bear);
    const giant = putOnBattlefield(s, opp, hillGiant());
    const pac = putOnBattlefield(s, ap, pacifism());
    attach(s, pac, giant);
    const land = s.battlefield.find((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Land"))!;
    const growth = putOnBattlefield(s, opp, wildGrowth());
    attach(s, growth, land);
    const unholy = putIn(s, ap, unholyStrength(), "hand");
    const growthCard = putIn(s, ap, wildGrowth(), "hand");
    const mask = putIn(s, ap, ancestralMask(), "graveyard");
    return { s, ap, opp, b, bear, holy, giant, pac, growth, unholy, growthCard, mask };
  };
  const attack = (s: GameState, ap: PlayerId, b: string, opp: PlayerId) => {
    s = until(s, (x) => x.pending?.kind === "declareAttackers" && x.pending.player === ap);
    return settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] }));
  };

  it("as it attacks: any players' Auras that could enchant it, then Aura cards from your hand and graveyard", () => {
    const { s: s0, ap, opp, b, holy, pac, growth, unholy, growthCard, mask } = board();
    let s = attack(s0, ap, b, opp);
    // Any player's Auras on the battlefield that could enchant it: not Wild Growth (enchant land, rulings).
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "attach", min: 0 });
    if (s.pending?.kind !== "pickPermanents") throw new Error("no pick");
    expect([...s.pending.options].sort()).toEqual([holy, pac].sort());
    expect(s.pending.options).not.toContain(growth);
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [holy] }));
    expect(s.objects[holy]!.attachedTo).toBe(b);
    // Attaching doesn't change who controls it (CR 701.3a).
    expect(controllerOf(s, s.objects[holy]!)).toBe(opp);
    // Then Aura cards that could enchant it, from your hand and graveyard: not Wild Growth.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, fromHand: true });
    if (s.pending?.kind !== "searchLibrary") throw new Error("no search");
    expect([...s.pending.cards].sort()).toEqual([unholy, mask].sort());
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [unholy, mask] }));
    for (const id of [unholy, mask]) {
      expect(zone(s, id)).toBe("battlefield");
      expect(s.objects[id]!.attachedTo).toBe(b);
      // Put onto the battlefield by your ability: under your control (CR 110.2a).
      expect(controllerOf(s, s.objects[id]!)).toBe(ap);
    }
    expect(zone(s, growthCard)).toBe("hand");
    // 5/5, Holy Strength +1/+2, Unholy Strength +2/+1, Ancestral Mask +2/+2 for each other enchantment (Pacifism, Wild
    // Growth, Holy Strength, Unholy Strength: 4).
    expect(pt(s, b)).toBe("16/16");
  });

  it("as it blocks too; it may take nothing", () => {
    const { s: s0, ap, opp, b, holy, unholy } = board();
    // The opponent's turn, their Hill Giant (no Pacifism now) attacking you.
    const s1 = structuredClone(s0);
    const giant = putOnBattlefield(s1, opp, hillGiant());
    let s = until(s1, (x) => x.pending?.kind === "declareAttackers" && x.pending.player === opp);
    s = settle(act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: giant, defender: ap }] }));
    s = until(s, (x) => x.pending?.kind === "declareBlockers" && x.pending.player === ap);
    s = settle(act(s, { type: "declareBlockers", player: ap, blocks: [{ blocker: b, attacker: giant }] }));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "attach" });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [] }));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }));
    expect(s.objects[holy]!.attachedTo).not.toBe(b);
    expect(zone(s, unholy)).toBe("hand");
  });

  it("nothing once Bruna has left the battlefield (CR 400.7, 303.4g)", () => {
    const { s: s0, ap, opp, b, holy, unholy, mask } = board();
    let s = until(s0, (x) => x.pending?.kind === "declareAttackers" && x.pending.player === ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    expect(s.stack.length + s.triggerQueue.length).toBeGreaterThan(0);
    expect(s.pending).toBeFalsy();
    // Bruna leaves with its trigger on the stack.
    s = structuredClone(s);
    s.battlefield.splice(s.battlefield.indexOf(b), 1);
    s.objects[b]!.zone = "graveyard";
    s.objects[b]!.zoneChanges = (s.objects[b]!.zoneChanges ?? 0) + 1;
    s.objects[b]!.attacking = undefined;
    s.players[ap]!.graveyard.push(b);
    invalidateCharacteristics(s);
    s = settle(s);
    expect(s.pending).toBeFalsy();
    expect(s.stack.length).toBe(0);
    expect(s.objects[holy]!.attachedTo).not.toBe(b);
    expect(zone(s, unholy)).toBe("hand");
    expect(zone(s, mask)).toBe("graveyard");
  });

  it("a bot takes the Auras that help Bruna, never a harmful one, and puts only helpful Aura cards onto it", () => {
    const { s: s0, ap, opp, b, holy, pac, unholy, mask } = board();
    // Pacifism in hand too: never put onto Bruna.
    const pacCard = putIn(s0, ap, pacifism(), "hand");
    let s = until(s0, (x) => x.pending?.kind === "declareAttackers" && x.pending.player === ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    s = botsUntil(s, (x) => !x.stack.length && !x.triggerQueue.length && !x.pending);
    expect(s.objects[holy]!.attachedTo).toBe(b);
    expect(s.objects[pac]!.attachedTo).not.toBe(b);
    expect(s.objects[unholy]!.attachedTo).toBe(b);
    expect(zone(s, pacCard)).toBe("hand");
    expect(s.objects[mask]!.attachedTo).toBe(b);
  });
});
