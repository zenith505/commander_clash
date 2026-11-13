// Lane B round B190: Evolving Door ("search your library for a creature card that's exactly that many colors plus one ...
// You may cast the exiled card"), Awesome Presence ("Enchanted creature can't be blocked unless defending player pays {3} for each
// creature they control that's blocking it"), Blood Spatter Analysis ("Then sacrifice it if it has five or more bloodstain
// counters on it. When you do, ..."), Wall of Mourning ("exile a card from the top of your library face down for each
// opponent you have" and its coven return at random), Induced Amnesia ("target player exiles all cards from their hand
// face down, then draws that many cards", returned when it's put into a graveyard) and Triton Tactics ("tap each creature
// that was blocked by one of those creatures this turn and it doesn't untap during its controller's next untap step").

import { describe, expect, it } from "vitest";
import { act, addEffect, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { blockCost, blockRequirementProblem, botActions, planActivate, characteristics, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";
import { moveObject, runStateBasedActions } from "../src/game";

// Real card data (Scryfall).
const presence = (): CardDef => ({"oracleId":"d6efff61-2087-4f48-a8a8-6c465190dad9","name":"Awesome Presence","manaCost":"{U}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't be blocked unless defending player pays {3} for each creature they control that's blocking it.","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/0/a/0aa8a120-5c13-4852-bdc8-80ae50a6e3d3.jpg?1783947196","artUrl":"https://cards.scryfall.io/art_crop/front/0/a/0aa8a120-5c13-4852-bdc8-80ae50a6e3d3.jpg?1783947196","commanderLegal":"legal","set":"all","releasedAt":"1996-06-10","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const spatter = (): CardDef => ({"oracleId":"aa929252-5dcc-4c9b-9e7c-61d0bef98d6d","name":"Blood Spatter Analysis","manaCost":"{B}{R}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, it deals 3 damage to target creature an opponent controls.\nWhenever one or more creatures die, mill a card and put a bloodstain counter on this enchantment. Then sacrifice it if it has five or more bloodstain counters on it. When you do, return target creature card from your graveyard to your hand.","colors":["B","R"],"colorIdentity":["B","R"],"keywords":["Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/2/b/2b80feb8-5cc8-4e91-ac22-a733305a67de.jpg?1783912856","artUrl":"https://cards.scryfall.io/art_crop/front/2/b/2b80feb8-5cc8-4e91-ac22-a733305a67de.jpg?1783912856","commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const mourning = (): CardDef => ({"oracleId":"585c9671-7451-4506-8b21-0d64106c4cd7","name":"Wall of Mourning","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Wall","supertypes":[],"types":["Creature"],"subtypes":["Wall"],"oracleText":"Defender\nWhen this creature enters, exile a card from the top of your library face down for each opponent you have.\nCoven — At the beginning of your end step, if you control three or more creatures with different powers, put a card exiled with this creature into its owner's hand.","power":"0","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Coven","Defender"],"imageUrl":"https://cards.scryfall.io/normal/front/9/8/98692a19-c9d4-48bf-9315-d88c44136f8b.jpg?1783925382","artUrl":"https://cards.scryfall.io/art_crop/front/9/8/98692a19-c9d4-48bf-9315-d88c44136f8b.jpg?1783925382","commanderLegal":"legal","set":"mic","releasedAt":"2021-09-24","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const amnesia = (): CardDef => ({"oracleId":"6f01c124-0518-428c-9efe-7f3741f3c109","name":"Induced Amnesia","manaCost":"{2}{U}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, target player exiles all cards from their hand face down, then draws that many cards.\nWhen this enchantment is put into a graveyard from the battlefield, return the exiled cards to their owner's hand.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/4/a4ee56f1-9f08-459f-8517-0fe7bc645fa3.jpg?1783935325","artUrl":"https://cards.scryfall.io/art_crop/front/a/4/a4ee56f1-9f08-459f-8517-0fe7bc645fa3.jpg?1783935325","commanderLegal":"legal","set":"rix","releasedAt":"2018-01-19","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const tactics = (): CardDef => ({"oracleId":"55b72176-e428-4d2a-a701-237e8c8de22e","name":"Triton Tactics","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Up to two target creatures each get +0/+3 until end of turn. Untap those creatures. At this turn's next end of combat, tap each creature that was blocked by one of those creatures this turn and it doesn't untap during its controller's next untap step.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/f/ef2609e3-ec28-4a41-884e-3d10be5e31b4.jpg?1783939787","artUrl":"https://cards.scryfall.io/art_crop/front/e/f/ef2609e3-ec28-4a41-884e-3d10be5e31b4.jpg?1783939787","commanderLegal":"legal","set":"ths","releasedAt":"2013-09-27","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const ogre = (): CardDef => ({"oracleId":"83c8a3a6-2e1a-4e26-8847-6d066f42d906","name":"Gray Ogre","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Ogre","supertypes":[],"types":["Creature"],"subtypes":["Ogre"],"oracleText":"","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/3/73ae5276-b607-4f23-a9d2-e8cc7b8e3693.jpg?1783948685","artUrl":"https://cards.scryfall.io/art_crop/front/7/3/73ae5276-b607-4f23-a9d2-e8cc7b8e3693.jpg?1783948685","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const serra = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const lure = (): CardDef => ({"oracleId":"7a7425ba-4478-4bc4-855f-abf947ea4fa2","name":"Lure","manaCost":"{1}{G}{G}","cmc":3,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nAll creatures able to block enchanted creature do so.","colors":["G"],"colorIdentity":["G"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/1/1/11c193e4-4484-46c1-83ce-c421d47bed9f.jpg?1783944286","artUrl":"https://cards.scryfall.io/art_crop/front/1/1/11c193e4-4484-46c1-83ce-c421d47bed9f.jpg?1783944286","commanderLegal":"legal","set":"chk","releasedAt":"2004-10-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const sorcerer = (): CardDef => ({"oracleId":"5e961d15-5972-4e4b-9385-1cd7cd7c6bbe","name":"Prodigal Sorcerer","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Human Wizard Sorcerer","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard","Sorcerer"],"oracleText":"{T}: This creature deals 1 damage to any target.","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/0/50aef269-55f9-4d84-8bc5-29e794297f11.jpg?1783937607","artUrl":"https://cards.scryfall.io/art_crop/front/5/0/50aef269-55f9-4d84-8bc5-29e794297f11.jpg?1783937607","commanderLegal":"legal","set":"ema","releasedAt":"2016-06-10","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const evolving = (): CardDef => ({"oracleId":"30e4849e-c58c-4b65-9fb3-7aa40c944904","name":"Evolving Door","manaCost":"{2}{G}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{1}, {T}, Sacrifice a creature: Count the colors of the sacrificed creature, then search your library for a creature card that's exactly that many colors plus one. Exile that card, then shuffle. You may cast the exiled card. Activate only as a sorcery.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/1/01bc3b04-46b7-43df-9b29-1502b9f18bbf.jpg?1783923104","artUrl":"https://cards.scryfall.io/art_crop/front/0/1/01bc3b04-46b7-43df-9b29-1502b9f18bbf.jpg?1783923104","commanderLegal":"legal","set":"snc","releasedAt":"2022-04-29","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const watchwolf = (): CardDef => ({"oracleId":"a35c2e20-eb90-4132-b65f-be1fcb569819","name":"Watchwolf","manaCost":"{G}{W}","cmc":2,"typeLine":"Creature — Wolf","supertypes":[],"types":["Creature"],"subtypes":["Wolf"],"oracleText":"","power":"3","toughness":"3","colors":["G","W"],"colorIdentity":["G","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/5/95e5828a-3e54-4b9c-9e84-21880930f2d5.jpg?1783943608","artUrl":"https://cards.scryfall.io/art_crop/front/9/5/95e5828a-3e54-4b9c-9e84-21880930f2d5.jpg?1783943608","commanderLegal":"legal","set":"rav","releasedAt":"2005-10-07","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const kird = (): CardDef => ({"oracleId":"fbbc3acb-c917-44ff-ac6f-9dd6ebe3f4ad","name":"Kird Ape","manaCost":"{R}","cmc":1,"typeLine":"Creature — Ape","supertypes":[],"types":["Creature"],"subtypes":["Ape"],"oracleText":"This creature gets +1/+2 as long as you control a Forest.","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/b/ebe8845e-df1c-481c-949c-aab84af99a05.jpg?1783948383","artUrl":"https://cards.scryfall.io/art_crop/front/e/b/ebe8845e-df1c-481c-949c-aab84af99a05.jpg?1783948383","commanderLegal":"legal","set":"arn","releasedAt":"1993-12-17","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const sprouting = (): CardDef => ({"oracleId":"ea74e89e-0724-4744-a6c9-e35c415624fb","name":"Sprouting Thrinax","manaCost":"{B}{R}{G}","cmc":3,"typeLine":"Creature — Lizard","supertypes":[],"types":["Creature"],"subtypes":["Lizard"],"oracleText":"When this creature dies, create three 1/1 green Saproling creature tokens.","power":"3","toughness":"3","colors":["B","G","R"],"colorIdentity":["B","G","R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/9/8950df86-1e27-4b6b-8b5c-25298a3bda85.jpg?1783942540","artUrl":"https://cards.scryfall.io/art_crop/front/8/9/8950df86-1e27-4b6b-8b5c-25298a3bda85.jpg?1783942540","commanderLegal":"legal","set":"ala","releasedAt":"2008-10-03","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

// Test cards.
const golem = card("Test Golem", "Artifact Creature — Golem", "{2}", { cmc: 2, power: "2", toughness: "2" });
const sentry = card("Test Sentry", "Creature — Soldier", "{2}{W}", { cmc: 3, power: "2", toughness: "5", colors: ["W"], keywords: ["Vigilance"], oracleText: "Vigilance" });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Passes until the stack and triggers are done, or `me` is asked something; other questions go to the bot. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player === me) return s;
    if (p) s = run(s, botActions(s, p.player));
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: ObjectId): TargetChoice => ({ kind: "object", id });
const next = (s: GameState, p: PlayerId, n = 1) => s.turnOrder[(s.turnOrder.indexOf(p) + n) % 4]!;
/** A card of `def` owned by `pid`, put into `where` (on top of the library). */
const place = (s: GameState, pid: PlayerId, def: CardDef, where: "graveyard" | "library" | "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
const attach = (s: GameState, pid: PlayerId, def: CardDef, host: ObjectId) => {
  const aura = putOnBattlefield(s, pid, def);
  s.objects[aura]!.attachedTo = host;
  invalidateCharacteristics(s);
  return aura;
};
/** To `pid`'s declare blockers question in this combat. */
const toBlocks = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 200 && !(s.pending?.kind === "declareBlockers" && s.pending.player === pid); i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p) s = run(s, botActions(s, p.player));
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes until `pid` has priority. */
const toPriority = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 20 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("Round B190 cards are supported", () => {
  it("compiles all six", () => supported(evolving(), presence(), spatter(), mourning(), amnesia(), tactics()));
});

describe("Awesome Presence: {3} for each creature blocking the enchanted creature (CR 509.1d)", () => {
  const attack = (lureToo = false) => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const a = putOnBattlefield(s, ap, ogre());
    const other = putOnBattlefield(s, ap, giant());
    attach(s, ap, presence(), a);
    if (lureToo) attach(s, ap, lure(), a);
    const b1 = putOnBattlefield(s, opp, bears());
    const b2 = putOnBattlefield(s, opp, elves());
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }, { attacker: other, defender: opp }] });
    return { s: toBlocks(s, opp), ap, opp, a, other, b1, b2 };
  };

  it("one blocker costs {3}, two cost {6}; blocking the other attacker is free", () => {
    const { s, a, other, b1, b2 } = attack();
    expect(blockCost(s, 1, [b1], [{ blocker: b1, attacker: a }])).toBe("{3}");
    expect(blockCost(s, 2, [b1, b2], [{ blocker: b1, attacker: a }, { blocker: b2, attacker: a }])).toBe("{6}");
    expect(blockCost(s, 1, [b1], [{ blocker: b1, attacker: other }])).toBe("");
  });

  it("without the mana it can't be blocked; with it the blocker pays", () => {
    let { s, opp, a, b1 } = attack();
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: b1, attacker: a }] })).toThrow(/costs \{3\}/);
    s.players[opp]!.manaPool.C = 3;
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: b1, attacker: a }] });
    expect(s.objects[b1]!.blocking).toEqual([a]);
    expect(s.players[opp]!.manaPool.C ?? 0).toBe(0);
  });

  it("with Lure on it too, nothing obliges the defender to pay (CR 509.1c)", () => {
    const { s, opp } = attack(true);
    expect(blockRequirementProblem(s, opp, [])).toBeNull();
  });

  it("a creature it doesn't enchant has no such cost", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const a = putOnBattlefield(s, ap, ogre());
    const host = putOnBattlefield(s, opp, giant());
    attach(s, ap, presence(), host);
    const b1 = putOnBattlefield(s, opp, bears());
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
    s = toBlocks(s, opp);
    expect(blockCost(s, 1, [b1], [{ blocker: b1, attacker: a }])).toBe("");
    expect(characteristics(s, s.objects[host]!).blockedTax).toBe(3);
  });
});

describe("Blood Spatter Analysis: a counter for each event of creatures dying; the fifth sacrifices it and returns a creature card", () => {
  /** Cast, its enters ability aimed at an opponent's Hill Giant, then `extra` more bloodstain counters put on it. */
  const start = (extra: number) => {
    let { s, ap, ids } = setup([spatter(), shock()]);
    const opp = next(s, ap);
    const victim = putOnBattlefield(s, opp, giant());
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s, ap);
    expect(s.pending?.kind).toBe("chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(victim)] }));
    const bsa = ids[0]!;
    s.objects[bsa]!.counters = { ...s.objects[bsa]!.counters, bloodstain: (s.objects[bsa]!.counters.bloodstain ?? 0) + extra };
    return { s, ap, opp, bsa, shockId: ids[1]!, victim };
  };

  it("enters dealing 3 damage to target creature an opponent controls; each death adds a counter and mills a card", () => {
    let { s, ap, opp, bsa, shockId, victim } = start(0);
    expect(s.objects[victim]!.zone).toBe("graveyard");
    // The Giant's death triggered it once: one counter, one card milled.
    expect(s.objects[bsa]!.counters.bloodstain).toBe(1);
    expect(s.players[ap]!.graveyard.length).toBe(1);
    const bear = putOnBattlefield(s, opp, bears());
    s = run(s, planCast(s, ap, shockId, [tgt(bear)]));
    s = settle(s);
    expect(s.objects[bsa]!.counters.bloodstain).toBe(2);
    expect(s.objects[bsa]!.zone).toBe("battlefield");
  });

  it("two creatures dying at once are one event: one counter", () => {
    let { s, opp, bsa } = start(0);
    const x = putOnBattlefield(s, opp, bears());
    const y = putOnBattlefield(s, opp, elves());
    moveObject(s, x, "graveyard");
    moveObject(s, y, "graveyard");
    runStateBasedActions(s);
    s = settle(s);
    expect(s.objects[bsa]!.counters.bloodstain).toBe(2);
  });

  it("the fifth counter sacrifices it, and the reflexive ability returns a creature card from your graveyard", () => {
    let { s, ap, opp, bsa, shockId } = start(3);
    expect(s.objects[bsa]!.counters.bloodstain).toBe(4);
    const card = place(s, ap, serra(), "graveyard");
    const bear = putOnBattlefield(s, opp, bears());
    s = run(s, planCast(s, ap, shockId, [tgt(bear)]));
    s = settle(s);
    expect(s.objects[bsa]!.zone).toBe("graveyard");
    expect(s.objects[card]!.zone).toBe("hand");
  });

  it("a fifth counter from elsewhere doesn't sacrifice it until its ability resolves (rulings)", () => {
    let { s, bsa } = start(4);
    expect(s.objects[bsa]!.counters.bloodstain).toBe(5);
    runStateBasedActions(s);
    s = settle(s);
    expect(s.objects[bsa]!.zone).toBe("battlefield");
  });
});

describe("Wall of Mourning: a face-down card for each opponent; coven returns one at random", () => {
  const cast = () => {
    let { s, ap, ids } = setup([mourning()]);
    const lib = s.players[ap]!.library.slice(0, 3);
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s);
    return { s, ap, wall: ids[0]!, lib };
  };

  it("exiles the top three cards face down, which nobody may look at (rulings)", () => {
    const { s, lib } = cast();
    for (const id of lib) {
      expect(s.objects[id]!.zone).toBe("exile");
      expect(s.objects[id]!.hiddenExile?.seen).toEqual([]);
    }
  });

  it("at your end step with three creatures of different powers, one goes to your hand; without coven, none", () => {
    let { s, ap, lib } = cast();
    const handBefore = s.players[ap]!.hand.length;
    s = passUntil(s, "end", ap);
    s = settle(s);
    expect(lib.filter((id) => s.objects[id]!.zone === "hand").length).toBe(0);
    let t = cast();
    putOnBattlefield(t.s, t.ap, bears());
    putOnBattlefield(t.s, t.ap, giant());
    t.s = passUntil(t.s, "end", t.ap);
    t.s = settle(t.s);
    const back = t.lib.filter((id) => t.s.objects[id]!.zone === "hand");
    expect(back.length).toBe(1);
    expect(t.lib.filter((id) => t.s.objects[id]!.zone === "exile").length).toBe(2);
    // The others don't learn which card it was (CR 406.3).
    const name = t.s.cards[t.s.objects[back[0]!]!.cardId]!.name;
    expect(t.s.log.filter((l) => l.to === undefined && l.text.includes(name) && l.text.includes("Wall of Mourning")).length).toBe(0);
    void handBefore;
  });
});

describe("Induced Amnesia: the target exiles their hand face down and draws that many; back when it goes to a graveyard", () => {
  const cast = () => {
    let { s, ap, ids } = setup([amnesia()]);
    const opp = next(s, ap);
    const hand = [place(s, opp, bears(), "hand"), place(s, opp, giant(), "hand"), place(s, opp, shock(), "hand")];
    const before = s.players[opp]!.hand.length;
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s, ap);
    expect(s.pending?.kind).toBe("chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    return { s, ap, opp, hand, before, enchantment: ids[0]! };
  };

  it("exiles them face down, unseen by anyone, and draws as many", () => {
    const { s, opp, hand, before } = cast();
    for (const id of hand) {
      expect(s.objects[id]!.zone).toBe("exile");
      expect(s.objects[id]!.hiddenExile?.seen).toEqual([]);
    }
    expect(s.players[opp]!.hand.length).toBe(before);
    expect(s.players[opp]!.hand.some((id) => hand.includes(id))).toBe(false);
  });

  it("put into a graveyard from the battlefield, it returns them to their owner's hand", () => {
    let { s, opp, hand, before, enchantment } = cast();
    moveObject(s, enchantment, "graveyard");
    runStateBasedActions(s);
    s = settle(s);
    for (const id of hand) expect(s.objects[id]!.zone).toBe("hand");
    expect(s.players[opp]!.hand.length).toBe(before * 2);
  });

  it("leaving for anywhere else, they're exiled for good (rulings)", () => {
    let { s, hand, enchantment } = cast();
    moveObject(s, enchantment, "exile");
    runStateBasedActions(s);
    s = settle(s);
    for (const id of hand) expect(s.objects[id]!.zone).toBe("exile");
  });
});

describe("Triton Tactics: +0/+3 and untap; the creatures they blocked are tapped and don't untap next time", () => {
  it("taps the attacker its target blocked at end of combat, and skips its next untap", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const angel = putOnBattlefield(s, ap, sentry);
    const other = putOnBattlefield(s, ap, ogre());
    const blocker = putOnBattlefield(s, opp, giant());
    const idle = putOnBattlefield(s, opp, bears());
    const tt = place(s, opp, tactics(), "hand");
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: angel, defender: opp }, { attacker: other, defender: opp }] });
    s = toBlocks(s, opp);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker, attacker: angel }] });
    s = toPriority(s, opp);
    s.players[opp]!.manaPool.U = 1;
    s = run(s, planCast(s, opp, tt, [tgt(blocker), tgt(idle)]));
    s = settle(s);
    expect(characteristics(s, s.objects[blocker]!).toughness).toBe(6);
    expect(s.objects[blocker]!.tapped).toBeFalsy();
    // It has vigilance: untapped until the end of combat.
    expect(s.objects[angel]!.tapped).toBeFalsy();
    s = passUntil(s, "main2", ap);
    s = settle(s);
    expect(s.objects[angel]!.tapped).toBe(true);
    expect(s.objects[angel]!.skipNextUntap).toBe(true);
    // The unblocked Ogre and the creature that blocked nothing aren't affected.
    expect(s.objects[other]!.skipNextUntap).toBeFalsy();
  });
});

describe("Evolving Door: a creature card exactly one color more than the sacrificed creature, exiled, cast as it resolves", () => {
  const go = (fodder: () => CardDef) => {
    let { s, ap } = setup([]);
    const door = putOnBattlefield(s, ap, evolving());
    const sac = putOnBattlefield(s, ap, fodder());
    const wolf = place(s, ap, watchwolf(), "library");
    const ape = place(s, ap, kird(), "library");
    const thrinax = place(s, ap, sprouting(), "library");
    s = run(s, planActivate(s, ap, door, 0, undefined, undefined, undefined, undefined, { sacrifice: [sac] }));
    s = settle(s, ap);
    return { s, ap, sac, wolf, ape, thrinax };
  };

  it("a green creature finds only two-color creature cards; the one found is exiled and may be cast, paying its cost", () => {
    let { s, ap, sac, wolf, ape, thrinax } = go(bears);
    expect(s.objects[sac]!.zone).toBe("graveyard");
    expect(s.pending?.kind).toBe("searchLibrary");
    const offered = s.pending?.kind === "searchLibrary" ? s.pending.cards : [];
    expect(offered).toContain(wolf);
    expect(offered).not.toContain(ape);
    expect(offered).not.toContain(thrinax);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [wolf] }), ap);
    expect(s.objects[wolf]!.zone).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "castFree", how: "paid", objectId: wolf });
    s = settle(run(s, planCast(s, ap, wolf, undefined, undefined, "auto")), ap);
    expect(s.objects[wolf]!.zone).toBe("battlefield");
  });

  it("a colorless creature finds one-color cards; declining to cast leaves the card in exile (rulings: now or never)", () => {
    let { s, ap, wolf, ape } = go(() => golem);
    const offered = s.pending?.kind === "searchLibrary" ? s.pending.cards : [];
    expect(offered).toContain(ape);
    expect(offered).not.toContain(wolf);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [ape] }), ap);
    expect(s.pending?.kind).toBe("castFree");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), ap);
    expect(s.objects[ape]!.zone).toBe("exile");
    expect(s.objects[ape]!.mayPlay).toBeUndefined();
  });

  it("counts the sacrificed creature's colors as it last existed on the battlefield (rulings)", () => {
    let { s, ap } = setup([]);
    const door = putOnBattlefield(s, ap, evolving());
    const sac = putOnBattlefield(s, ap, bears());
    addEffect(s, ap, [sac], [{ kind: "addColors", colors: ["W"] }]);
    const thrinax = place(s, ap, sprouting(), "library");
    const wolf = place(s, ap, watchwolf(), "library");
    s = settle(run(s, planActivate(s, ap, door, 0, undefined, undefined, undefined, undefined, { sacrifice: [sac] })), ap);
    const offered = s.pending?.kind === "searchLibrary" ? s.pending.cards : [];
    expect(offered).toContain(thrinax);
    expect(offered).not.toContain(wolf);
  });
});
