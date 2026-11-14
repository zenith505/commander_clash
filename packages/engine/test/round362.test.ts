// Round 362 (Lane A): a creature that becomes a copy of a creature card it exiles from a graveyard, keeping that ability
// (Dimir Doppelganger), or of one milled at its controller's upkeep (Shadow Kin); two mana of one color and two of
// another, spendable only on creature or enchantment spells (Open the Omenpaths); damage equal to the power of a creature
// chosen or a creature card revealed as the spell's additional cost (Monstrous Emergence); any number of creatures
// sacrificed for life, and any amount of life paid to look at that many cards (Plunge into Darkness); and every life
// total handed around as its controller chooses (Reverse the Sands).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, moveObject, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions are answered as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes (answering other players' questions as bots, declaring no attacks) until `me` has a question of `kind`. */
const until = (s: GameState, me: PlayerId, kind: string, max = 3000) => {
  for (let i = 0; i < max; i++) {
    const p = s.pending;
    if (p?.player === me && p.kind === kind) return s;
    const who = waitingOn(s)!;
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: who, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: who, blocks: [] });
    else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: who, objectIds: s.players[who]!.hand.slice(0, p.count) });
    else if (p) for (const a of botActions(s, who)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: who });
  }
  throw new Error(`no ${kind} for ${me}`);
};
const moveTo = (zone: "graveyard" | "hand" | "library") => (s: GameState, pid: PlayerId, def: CardDef, at = 0) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.splice(at, 0, id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const toYard = moveTo("graveyard");
const toHand = moveTo("hand");
const toTop = moveTo("library");
const nameOf = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!).name;
const tapAllLands = (s: GameState, pid: PlayerId) => {
  for (const id of s.battlefield) if (controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).types.includes("Land")) s.objects[id]!.tapped = true;
};

// Real oracle text (Scryfall).
const doppel = (): CardDef => ({"oracleId":"1916f120-4418-404a-aed5-b95ebf60d3a3","name":"Dimir Doppelganger","manaCost":"{1}{U}{B}","cmc":3,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"{1}{U}{B}: Exile target creature card from a graveyard. This creature becomes a copy of that card, except it has this ability.","power":"0","toughness":"2","colors":["B","U"],"colorIdentity":["B","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/4/a48be841-d35c-4d99-aebc-3684b36760ac.jpg?1783943622","artUrl":"https://cards.scryfall.io/art_crop/front/a/4/a48be841-d35c-4d99-aebc-3684b36760ac.jpg?1783943622","commanderLegal":"legal","set":"rav","releasedAt":"2005-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const kin = (): CardDef => ({"oracleId":"7ecc506e-bed0-4ae2-9d2f-5143ef63f62c","name":"Shadow Kin","manaCost":"{3}{U}","cmc":4,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"Flash\nAt the beginning of your upkeep, each player mills three cards. You may exile a creature card from among the cards milled this way. If you do, this creature becomes a copy of that card, except it has this ability.","power":"2","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":["Flash","Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/0/0/00ca621f-c409-4255-828b-c9957e82c06f.jpg?1783925380","artUrl":"https://cards.scryfall.io/art_crop/front/0/0/00ca621f-c409-4255-828b-c9957e82c06f.jpg?1783925380","commanderLegal":"legal","set":"mic","releasedAt":"2021-09-24","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const omen = (): CardDef => ({"oracleId":"9ac01998-6e26-4ba5-b66c-614ec831caef","name":"Open the Omenpaths","manaCost":"{2}{R}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose one —\n• Add two mana of any one color and two mana of any other color. Spend this mana only to cast creature or enchantment spells.\n• Creatures you control get +1/+0 until end of turn.","colors":["R"],"colorIdentity":["R"],"keywords":[],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/4/e/4e4023c8-8e7f-42b9-99e5-87e80fc3d6c8.jpg?1783928227","artUrl":"https://cards.scryfall.io/art_crop/front/4/e/4e4023c8-8e7f-42b9-99e5-87e80fc3d6c8.jpg?1783928227","commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const emergence = (): CardDef => ({"oracleId":"5542ea4d-34ab-4f89-8894-793a7038f501","name":"Monstrous Emergence","manaCost":"{1}{G}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"As an additional cost to cast this spell, choose a creature you control or reveal a creature card from your hand.\nMonstrous Emergence deals damage equal to the power of the creature you chose or the card you revealed to target creature.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/9/b999eb47-b842-47f1-be91-c79fc46e1896.jpg?1783909451","artUrl":"https://cards.scryfall.io/art_crop/front/b/9/b999eb47-b842-47f1-be91-c79fc46e1896.jpg?1783909451","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const plunge = (): CardDef => ({"oracleId":"07a39452-f9d5-41ba-acbc-fc5e7f698f64","name":"Plunge into Darkness","manaCost":"{1}{B}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose one —\n• Sacrifice any number of creatures. You gain 3 life for each creature sacrificed this way.\n• Pay any amount of life, then look at that many cards from the top of your library. Put one of those cards into your hand and exile the rest.\nEntwine {B} (Choose both if you pay the entwine cost.)","colors":["B"],"colorIdentity":["B"],"keywords":["Entwine"],"imageUrl":"https://cards.scryfall.io/normal/front/d/2/d21c74b4-dd9e-43d6-ad0a-06e026a8d672.jpg?1783944397","artUrl":"https://cards.scryfall.io/art_crop/front/d/2/d21c74b4-dd9e-43d6-ad0a-06e026a8d672.jpg?1783944397","commanderLegal":"legal","set":"5dn","releasedAt":"2004-06-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const sands = (): CardDef => ({"oracleId":"b353f0ab-266c-4448-b93b-fafb68b03765","name":"Reverse the Sands","manaCost":"{6}{W}{W}","cmc":8,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Redistribute any number of players' life totals. (Each of those players gets one life total back.)","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/a/aae9c988-5e8c-4d3a-af6d-8ac083698159.jpg?1783944332","artUrl":"https://cards.scryfall.io/art_crop/front/a/a/aae9c988-5e8c-4d3a-af6d-8ac083698159.jpg?1783944332","commanderLegal":"legal","set":"chk","releasedAt":"2004-10-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const serra = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const emperion = (): CardDef => ({"oracleId":"bcd2f70c-36c2-44b2-9d4b-1000e9bb62b6","name":"Platinum Emperion","manaCost":"{8}","cmc":8,"typeLine":"Artifact Creature — Golem","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Golem"],"oracleText":"Your life total can't change. (You can't gain or lose life. You can't pay any amount of life except 0.)","power":"8","toughness":"8","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/1/71b03143-9e85-4061-88e6-ad621f75ec3b.jpg?1783933762","artUrl":"https://cards.scryfall.io/art_crop/front/7/1/71b03143-9e85-4061-88e6-ad621f75ec3b.jpg?1783933762","commanderLegal":"legal","set":"uma","releasedAt":"2018-12-07","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const anthem = (): CardDef => ({"oracleId":"e3886fe8-9b76-4613-8891-4ec74657c087","name":"Glorious Anthem","manaCost":"{1}{W}{W}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Creatures you control get +1/+1.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/1/61f867c5-0727-4408-b479-b81518daa0ec.jpg?1783946375","artUrl":"https://cards.scryfall.io/art_crop/front/6/1/61f867c5-0727-4408-b479-b81518daa0ec.jpg?1783946375","commanderLegal":"legal","set":"usg","releasedAt":"1998-10-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const rip = (): CardDef => ({"oracleId":"087f9ad7-e74f-40e2-8102-1ed2925d0418","name":"Rest in Peace","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, exile all graveyards.\nIf a card or token would be put into a graveyard from anywhere, exile it instead.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/8/98040e14-8182-4a94-9322-bbd967dc4dfe.jpg?1783910962","artUrl":"https://cards.scryfall.io/art_crop/front/9/8/98040e14-8182-4a94-9322-bbd967dc4dfe.jpg?1783910962","commanderLegal":"legal","set":"acr","releasedAt":"2024-07-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ogre = (): CardDef => ({"oracleId":"83c8a3a6-2e1a-4e26-8847-6d066f42d906","name":"Gray Ogre","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Ogre","supertypes":[],"types":["Creature"],"subtypes":["Ogre"],"oracleText":"","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/3/73ae5276-b607-4f23-a9d2-e8cc7b8e3693.jpg?1783948685","artUrl":"https://cards.scryfall.io/art_crop/front/7/3/73ae5276-b607-4f23-a9d2-e8cc7b8e3693.jpg?1783948685","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const prodigal = (): CardDef => ({"oracleId":"5e961d15-5972-4e4b-9385-1cd7cd7c6bbe","name":"Prodigal Sorcerer","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Human Wizard Sorcerer","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard","Sorcerer"],"oracleText":"{T}: This creature deals 1 damage to any target.","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/0/50aef269-55f9-4d84-8bc5-29e794297f11.jpg?1783937607","artUrl":"https://cards.scryfall.io/art_crop/front/5/0/50aef269-55f9-4d84-8bc5-29e794297f11.jpg?1783937607","commanderLegal":"legal","set":"ema","releasedAt":"2016-06-10","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const opt = (): CardDef => ({"oracleId":"713332c1-5bd8-400f-bfff-c1ca0697a043","name":"Opt","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","artUrl":"https://cards.scryfall.io/art_crop/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","commanderLegal":"legal","set":"sld","releasedAt":"2025-07-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

describe("round 362: compiles", () => {
  it("every card of the round", () => supported(doppel(), kin(), omen(), emergence(), plunge(), sands()));
});

describe("Dimir Doppelganger", () => {
  it("exiles a creature card from any graveyard and becomes a copy of it, keeping this ability; a later copy overwrites it", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, ap, doppel());
    const angel = toYard(s0, opp, serra());
    const sorcerer = toYard(s0, ap, prodigal());
    let s = settle(run(s0, planActivate(s0, ap, d, 0, [{ kind: "object", id: angel }])), ap);
    expect(s.objects[angel]!.zone).toBe("exile");
    const ch = characteristics(s, s.objects[d]!);
    expect(ch.name).toBe("Serra Angel");
    expect(ch.keywords).toEqual(expect.arrayContaining(["Flying", "Vigilance"]));
    expect(`${ch.power}/${ch.toughness}`).toBe("4/4");
    // Still has its own ability (CR 707.9a), which can copy again: the new copy wins by timestamp (rulings).
    s.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    s = settle(run(s, planActivate(s, ap, d, 0, [{ kind: "object", id: sorcerer }])), ap);
    expect(s.objects[sorcerer]!.zone).toBe("exile");
    expect(nameOf(s, d)).toBe("Prodigal Sorcerer");
    expect(characteristics(s, s.objects[d]!).keywords).not.toContain("Flying");
    // Prodigal Sorcerer's ping and Dimir Doppelganger's copy ability.
    for (const id of s.battlefield) s.objects[id]!.tapped = false;
    const third = toYard(s, opp, ogre());
    const copyAbility = [0, 1].find((i) => !!planActivate(s, ap, d, i, [{ kind: "object", id: third }]));
    expect(copyAbility).toBeDefined();
  });

  it("does nothing if the card left the graveyard before it resolves (CR 608.2b)", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, ap, doppel());
    const angel = toYard(s0, opp, serra());
    let s = run(s0, planActivate(s0, ap, d, 0, [{ kind: "object", id: angel }]));
    moveObject(s, angel, "hand");
    s = settle(s, ap);
    expect(nameOf(s, d)).toBe("Dimir Doppelganger");
    expect(s.objects[angel]!.zone).toBe("hand");
  });
});

describe("Shadow Kin", () => {
  it("each player mills three at your upkeep; you may exile a milled creature card and it becomes a copy, keeping the ability", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, kin());
    // Second from the top: the opponent draws one card in their turn first.
    const angel = toTop(s0, opp, serra(), 1);
    let s = until(s0, ap, "searchLibrary");
    expect(s.activePlayer).toBe(ap);
    expect(s.step).toBe("upkeep");
    // Each player's top three cards are in their graveyard; only the creature cards among them are offered, the angel too.
    for (const pid of s.turnOrder) expect(s.players[pid]!.graveyard.length).toBeGreaterThanOrEqual(3);
    const p = s.pending!;
    expect(p).toMatchObject({ kind: "searchLibrary", min: 0, max: 1 });
    if (p.kind !== "searchLibrary") throw new Error("no pick");
    expect(p.cards).toContain(angel);
    expect(p.cards.every((id) => characteristics(s, s.objects[id]!).types.includes("Creature"))).toBe(true);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [angel] }), ap);
    expect(s.objects[angel]!.zone).toBe("exile");
    expect(nameOf(s, k)).toBe("Serra Angel");
    // Its ability stays: it triggers again at the next upkeep (CR 707.9a).
    s = until(s, ap, "searchLibrary");
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }), ap);
    expect(nameOf(s, k)).toBe("Serra Angel");
  });

  it("choosing none leaves it as it is; cards a replacement exiled instead weren't put into a graveyard and aren't offered", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, kin());
    toTop(s0, opp, serra(), 1);
    putOnBattlefield(s0, opp, rip());
    // With Rest in Peace, every milled card is exiled: nothing to choose.
    let t = s0;
    for (let i = 0; i < 3000 && !(t.activePlayer === ap && t.step === "draw"); i++) {
      const p = t.pending;
      const who = waitingOn(t)!;
      expect(p?.kind === "searchLibrary" && p.player === ap).toBe(false);
      if (p?.kind === "declareAttackers") t = act(t, { type: "declareAttackers", player: who, attacks: [] });
      else if (p?.kind === "declareBlockers") t = act(t, { type: "declareBlockers", player: who, blocks: [] });
      else if (p?.kind === "discardToHandSize") t = act(t, { type: "discard", player: who, objectIds: t.players[who]!.hand.slice(0, p.count) });
      else if (p) for (const a of botActions(t, who)) t = act(t, a);
      else t = act(t, { type: "passPriority", player: who });
    }
    expect(nameOf(t, k)).toBe("Shadow Kin");
    expect(t.players[opp]!.exile.length).toBeGreaterThanOrEqual(3);
  });
});

describe("Open the Omenpaths", () => {
  it("two mana of one color, then two of another (not the first), only for creature or enchantment spells", () => {
    const { s: s0, ap, ids } = setup([omen(), anthem(), opt()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [], [0])), ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "color", options: ["White", "Blue", "Black", "Red", "Green"] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "White" }), ap);
    // The second color is any but the first (CR 608.2d).
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "color", options: ["Blue", "Black", "Red", "Green"] });
    expect(() => act(s, { type: "chooseOption", player: ap, choice: "White" })).toThrow();
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Blue" }), ap);
    expect(s.players[ap]!.manaPool).toMatchObject({ W: 2, U: 2 });
    // With every land tapped, the four mana pays for an enchantment, not an instant (CR 106.6).
    tapAllLands(s, ap);
    expect(planCast(s, ap, ids[2]!)).toBeNull();
    s = settle(run(s, planCast(s, ap, ids[1]!)), ap);
    expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
  });

  it("the other mode: creatures you control get +1/+0 until end of turn; a bot picks two different colors", () => {
    const { s: s0, ap, ids } = setup([omen()]);
    const e = putOnBattlefield(s0, ap, elves());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [], [1])), ap);
    expect(`${characteristics(s, s.objects[e]!).power}/${characteristics(s, s.objects[e]!).toughness}`).toBe("2/1");
    const { s: t0, ap: me, ids: mine } = setup([omen()]);
    let t = run(t0, planCast(t0, me, mine[0]!, [], [0]));
    t = settle(t, me);
    const picked: string[] = [];
    for (let i = 0; i < 3 && t.pending?.kind === "chooseOption"; i++) {
      const [a] = botActions(t, me);
      if (a?.type !== "chooseOption") break;
      picked.push(a.choice);
      t = settle(act(t, a), me);
    }
    expect(picked.length).toBe(2);
    expect(picked[0]).not.toBe(picked[1]);
    const pool = t.players[me]!.manaPool;
    expect(Object.values(pool).reduce((a, b) => a + b, 0)).toBe(4);
  });
});

describe("Monstrous Emergence", () => {
  it("damage equal to the power of the creature chosen for its cost, as it is when the spell resolves (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([emergence()]);
    const angel = putOnBattlefield(s0, ap, serra());
    const theirs = putOnBattlefield(s0, opp, serra());
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: theirs }], undefined, undefined, undefined, { reveal: [angel] }));
    // The chosen creature isn't tapped or sacrificed: only chosen (CR 701.4a).
    expect(s.objects[angel]!.zone).toBe("battlefield");
    s.effects.push({ id: `x${s.nextId++}`, timestamp: s.nextTimestamp++, controller: ap, sourceName: "test", duration: "endOfTurn", affected: [angel], mods: [{ kind: "modifyPT", power: 2, toughness: 0 }] });
    invalidateCharacteristics(s);
    s = settle(s, ap);
    expect(s.objects[theirs]!.damage ?? 0).toBe(0);
    expect(s.objects[theirs]!.zone).toBe("graveyard");
  });

  it("or a creature card revealed from the hand, its power; as it last existed if the chosen creature left (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([emergence(), ogre()]);
    const theirs = putOnBattlefield(s0, opp, serra());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: theirs }], undefined, undefined, undefined, { reveal: [ids[1]!] })), ap);
    expect(s.objects[ids[1]!]!.zone).toBe("hand");
    expect(s.objects[theirs]!.damage).toBe(2);
    const { s: t0, ap: me, opp: them, ids: mine } = setup([emergence()]);
    const angel = putOnBattlefield(t0, me, serra());
    const target = putOnBattlefield(t0, them, serra());
    let t = run(t0, planCast(t0, me, mine[0]!, [{ kind: "object", id: target }], undefined, undefined, undefined, { reveal: [angel] }));
    moveObject(t, angel, "graveyard");
    t = settle(t, me);
    expect(t.objects[target]!.zone).toBe("graveyard");
  });

  it("can't be cast with no creature to choose or reveal", () => {
    const { s, ap, opp, ids } = setup([emergence()]);
    const theirs = putOnBattlefield(s, opp, serra());
    // The opening hand's Grizzly Bears could be revealed: only the spell stays in the hand.
    const p = s.players[ap]!;
    for (const id of p.hand.filter((x) => x !== ids[0])) {
      s.objects[id]!.zone = "library";
      p.library.push(id);
    }
    p.hand = [ids[0]!];
    expect(planCast(s, ap, ids[0]!, [{ kind: "object", id: theirs }])).toBeNull();
    // A creature an opponent controls doesn't do.
    putOnBattlefield(s, opp, elves());
    expect(planCast(s, ap, ids[0]!, [{ kind: "object", id: theirs }])).toBeNull();
    const mine = putOnBattlefield(s, ap, elves());
    expect(planCast(s, ap, ids[0]!, [{ kind: "object", id: theirs }])).not.toBeNull();
    expect(planCast(s, ap, ids[0]!, [{ kind: "object", id: theirs }], undefined, undefined, undefined, { reveal: [mine] })).not.toBeNull();
  });
});

describe("Plunge into Darkness", () => {
  it("sacrifice any number of creatures for 3 life each; pay any amount of life to look at that many, one into the hand", () => {
    const { s: s0, ap, ids } = setup([plunge()]);
    const a = putOnBattlefield(s0, ap, elves());
    const b = putOnBattlefield(s0, ap, ogre());
    const life = s0.players[ap]!.life;
    let s = until(run(s0, planCast(s0, ap, ids[0]!, [], [0, 1])), ap, "pickPermanents");
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "sacrifice", min: 0, anyNumber: true });
    s = until(act(s, { type: "pickPermanents", player: ap, ids: [a, b] }), ap, "chooseOption");
    expect(s.objects[a]!.zone).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(life + 6);
    // Up to the life it could pay (CR 119.4), chosen as it resolves (rulings).
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "payLife", numberRange: { min: 0, max: life + 6 } });
    const top = s.players[ap]!.library.slice(0, 3);
    s = act(s, { type: "chooseOption", player: ap, choice: "3" });
    expect(s.players[ap]!.life).toBe(life + 3);
    s = settle(s, ap);
    const p = s.pending!;
    expect(p.player).toBe(ap);
    const pick = "cards" in p ? (p.cards as ObjectId[]) : "options" in p ? (p.options as ObjectId[]) : [];
    expect([...pick].sort()).toEqual([...top].sort());
    const kind = p.kind;
    s = settle(act(s, kind === "searchLibrary" ? { type: "searchLibrary", player: ap, found: [top[1]!] } : ({ type: kind, player: ap, ids: [top[1]!] } as Action)), ap);
    expect(s.objects[top[1]!]!.zone).toBe("hand");
    expect(s.objects[top[0]!]!.zone).toBe("exile");
    expect(s.objects[top[2]!]!.zone).toBe("exile");
  });

  it("paying 0 life looks at nothing", () => {
    const { s: s0, ap, ids } = setup([plunge()]);
    const life = s0.players[ap]!.life;
    let s = until(run(s0, planCast(s0, ap, ids[0]!, [], [1])), ap, "chooseOption");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "0" }), ap);
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.life).toBe(life);
    expect(s.players[ap]!.exile.length).toBe(0);
  });
});

describe("Reverse the Sands", () => {
  it("its controller chooses who gets which life total; each gains or loses the difference (CR 119.5)", () => {
    const { s: s0, ap, ids } = setup([sands()]);
    const at = s0.turnOrder.indexOf(ap);
    const order = [...s0.turnOrder.slice(at), ...s0.turnOrder.slice(0, at)];
    [10, 40, 25, 18].forEach((n, i) => (s0.players[order[i]!]!.life = n));
    let s = until(run(s0, planCast(s0, ap, ids[0]!)), ap, "chooseOption");
    const p = s.pending;
    if (p?.kind !== "chooseOption") throw new Error("no choice");
    expect(p.what).toBe("redistribute");
    // Every way to hand four different totals around, "as they are" first.
    expect(p.options.length).toBe(24);
    expect(p.labels?.[0]).toBe("Leave the life totals as they are");
    // ap takes the 40, the player with 40 gets ap's 10, the others keep theirs.
    const swap = p.options.find((o) => o === [1, 0, 2, 3].join(","))!;
    s = settle(act(s, { type: "chooseOption", player: ap, choice: swap }), ap);
    expect(order.map((pid) => s.players[pid]!.life)).toEqual([40, 10, 25, 18]);
  });

  it("a player whose life total can't change is offered no other total (CR 119.7, 119.8); a bot takes the highest", () => {
    const { s: s0, ap, ids } = setup([sands()]);
    const at = s0.turnOrder.indexOf(ap);
    const order = [...s0.turnOrder.slice(at), ...s0.turnOrder.slice(0, at)];
    [10, 40, 25, 18].forEach((n, i) => (s0.players[order[i]!]!.life = n));
    putOnBattlefield(s0, order[1]!, emperion());
    let s = until(run(s0, planCast(s0, ap, ids[0]!)), ap, "chooseOption");
    const p = s.pending;
    if (p?.kind !== "chooseOption") throw new Error("no choice");
    // The 40 stays where it is: the other three totals, six ways.
    expect(p.options.length).toBe(6);
    expect(p.options.every((o) => o.split(",")[1] === "1")).toBe(true);
    const [a] = botActions(s, ap);
    s = settle(act(s, a!), ap);
    expect(order.map((pid) => s.players[pid]!.life)).toEqual([25, 40, 10, 18]);
  });
});
