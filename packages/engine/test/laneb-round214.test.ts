// Lane B round B214: Warping Wurm (its phase-in counter resolves before its upkeep "phases out unless you pay"), All
// Hallow's Eve (exiled with two scream counters; at the last one, every creature card in each graveyard returns), Ice Cave
// (any other player may pay a spell's mana cost to counter it), Tidal Flats (each attacker without flying paid for, or
// your blockers gain first strike) and Alpine Moon (opponents' lands with the chosen name lose their land types and
// abilities and tap for any color).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, botActions, characteristics, invalidateCharacteristics, isFullySupported, moveObject, parseManaCost, planActivate, planCast, planMana, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const warpingWurm = (): CardDef => ({"oracleId":"c54c1517-cf7c-4afb-92f8-70c9d1591b45","name":"Warping Wurm","manaCost":"{2}{G}{U}","cmc":4,"typeLine":"Creature — Wurm","supertypes":[],"types":["Creature"],"subtypes":["Wurm"],"oracleText":"Phasing (This phases in or out before you untap during each of your untap steps. While it's phased out, it's treated as though it doesn't exist.)\nAt the beginning of your upkeep, this creature phases out unless you pay {2}{G}{U}.\nWhenever this creature phases in, put a +1/+1 counter on it.","power":"1","toughness":"1","colors":["G","U"],"colorIdentity":["G","U"],"keywords":["Phasing"],"imageUrl":"https://cards.scryfall.io/normal/front/a/2/a2c41d0f-f1db-4797-b245-7de12ffa3a0d.jpg?1783947048","artUrl":"https://cards.scryfall.io/art_crop/front/a/2/a2c41d0f-f1db-4797-b245-7de12ffa3a0d.jpg?1783947048","commanderLegal":"legal","set":"mir","releasedAt":"1996-10-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const allHallowsEve = (): CardDef => ({"oracleId":"ebed900f-6de3-4ae7-9795-fae34882298d","name":"All Hallow's Eve","manaCost":"{2}{B}{B}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Exile All Hallow's Eve with two scream counters on it.\nAt the beginning of your upkeep, if this card is exiled with a scream counter on it, remove a scream counter from it. If there are no more scream counters on it, put it into your graveyard and each player returns all creature cards from their graveyard to the battlefield.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/8/18787a2d-6688-47e9-94bc-ccf229df823f.jpg?1783948069","artUrl":"https://cards.scryfall.io/art_crop/front/1/8/18787a2d-6688-47e9-94bc-ccf229df823f.jpg?1783948069","commanderLegal":"legal","set":"leg","releasedAt":"1994-06-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const iceCave = (): CardDef => ({"oracleId":"c532ecd2-feeb-41f5-bda0-b05e86f86a45","name":"Ice Cave","manaCost":"{3}{U}{U}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a player casts a spell, any other player may pay that spell's mana cost. If a player does, counter the spell. (Mana cost includes color.)","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/c/fc2877c2-4426-4c07-92a2-8ba5107d5e7e.jpg?1783945353","artUrl":"https://cards.scryfall.io/art_crop/front/f/c/fc2877c2-4426-4c07-92a2-8ba5107d5e7e.jpg?1783945353","commanderLegal":"legal","set":"apc","releasedAt":"2001-06-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const tidalFlats = (): CardDef => ({"oracleId":"bf39d0f7-f689-45fd-b37b-12d1618fd6e7","name":"Tidal Flats","manaCost":"{U}","cmc":1,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"{U}{U}: For each attacking creature without flying, its controller may pay {1}. If that player doesn't, creatures you control blocking that creature gain first strike until end of turn.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/e/2e820f3f-434e-4d09-91b9-0ebd6966b393.jpg?1783947909","artUrl":"https://cards.scryfall.io/art_crop/front/2/e/2e820f3f-434e-4d09-91b9-0ebd6966b393.jpg?1783947909","commanderLegal":"legal","set":"fem","releasedAt":"1994-11-01","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const alpineMoon = (): CardDef => ({"oracleId":"8b46b50c-f824-4c4e-86de-38065c6f9a64","name":"Alpine Moon","manaCost":"{R}","cmc":1,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"As this enchantment enters, choose a nonbasic land card name.\nLands your opponents control with the chosen name lose all land types and abilities, and they gain \"{T}: Add one mana of any color.\"","colors":["R"],"colorIdentity":["R"],"keywords":[],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/2435c810-2baf-4e3b-80ce-542b94694901.jpg?1783934557","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/2435c810-2baf-4e3b-80ce-542b94694901.jpg?1783934557","commanderLegal":"legal","set":"m19","releasedAt":"2018-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const serraAngel = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const templeofEpiphany = (): CardDef => ({"oracleId":"79f94050-d850-41ca-b1db-5ae0cf743f0a","name":"Temple of Epiphany","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"This land enters tapped.\nWhen this land enters, scry 1. (Look at the top card of your library. You may put that card on the bottom.)\n{T}: Add {U} or {R}.","colors":[],"colorIdentity":["R","U"],"keywords":["Scry"],"producedMana":["R","U"],"imageUrl":"https://cards.scryfall.io/normal/front/3/1/311d6842-0ba6-494d-b10c-9ac47f78c757.jpg?1783912319","artUrl":"https://cards.scryfall.io/art_crop/front/3/1/311d6842-0ba6-494d-b10c-9ac47f78c757.jpg?1783912319","commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const tropicalIsland = (): CardDef => ({"oracleId":"74b7fe23-5d3a-4092-8d78-7c0eba8f6f73","name":"Tropical Island","manaCost":"","cmc":0,"typeLine":"Land — Forest Island","supertypes":[],"types":["Land"],"subtypes":["Forest","Island"],"oracleText":"({T}: Add {G} or {U}.)","colors":[],"colorIdentity":["G","U"],"keywords":[],"producedMana":["G","U"],"imageUrl":"https://cards.scryfall.io/normal/front/a/9/a9c6c759-aabf-44e7-ba8c-33c5df232b56.jpg?1783948659","artUrl":"https://cards.scryfall.io/art_crop/front/a/9/a9c6c759-aabf-44e7-ba8c-33c5df232b56.jpg?1783948659","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const earthquake = (): CardDef => ({"oracleId":"9a40614b-50a3-422c-849e-53c8b7d3d204","name":"Earthquake","manaCost":"{X}{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Earthquake deals X damage to each creature without flying and each player.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/c/ac5d49b5-cf4d-48a4-b21d-0a3b7e6320a4.jpg?1783903402","artUrl":"https://cards.scryfall.io/art_crop/front/a/c/ac5d49b5-cf4d-48a4-b21d-0a3b7e6320a4.jpg?1783903402","commanderLegal":"legal","set":"sld","releasedAt":"2026-06-15","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const island = (): CardDef => ({"oracleId":"b2c6aa39-2d2a-459c-a555-fb48ba993373","name":"Island","manaCost":"","cmc":0,"typeLine":"Basic Land — Island","supertypes":["Basic"],"types":["Land"],"subtypes":["Island"],"oracleText":"({T}: Add {U}.)","colors":[],"colorIdentity":["U"],"keywords":[],"producedMana":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646","artUrl":"https://cards.scryfall.io/art_crop/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const mountain = (): CardDef => ({"oracleId":"a3fb7228-e76b-4e96-a40e-20b5fed75685","name":"Mountain","manaCost":"","cmc":0,"typeLine":"Basic Land — Mountain","supertypes":["Basic"],"types":["Land"],"subtypes":["Mountain"],"oracleText":"({T}: Add {R}.)","colors":[],"colorIdentity":["R"],"keywords":[],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/2/a/2a844b96-6616-4c39-8f4f-5d14a3b2bd55.jpg?1785981666","artUrl":"https://cards.scryfall.io/art_crop/front/2/a/2a844b96-6616-4c39-8f4f-5d14a3b2bd55.jpg?1785981666","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const gavonyTownship = (): CardDef => ({"oracleId":"8a44e4e7-dfa2-427b-bbff-11c398fa60bb","name":"Gavony Township","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{2}{G}{W}, {T}: Put a +1/+1 counter on each creature you control.","colors":[],"colorIdentity":["G","W"],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/e/3/e39a449a-5681-49af-a58d-d15d470d0735.jpg?1783923197","artUrl":"https://cards.scryfall.io/art_crop/front/e/3/e39a449a-5681-49af-a58d-d15d470d0735.jpg?1783923197","commanderLegal":"legal","set":"ncc","releasedAt":"2022-04-29","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Passes and lets bots answer until the stack is empty or `me` has a question. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const nextOf = (s: GameState, pid: PlayerId, k: number) => s.turnOrder[(s.turnOrder.indexOf(pid) + k) % s.turnOrder.length]!;
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], x?: number) => run(s, planCast(s, pid, id, targets, undefined, undefined, x));
/** Moves a new card for `def` into `pid`'s hand (or graveyard). */
const toZone = (s: GameState, pid: PlayerId, def: CardDef, z: "hand" | "graveyard" = "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** `pid` answers its payUnless question: pays (tapping what it needs) or not. */
const answerPay = (s: GameState, pid: PlayerId, pay: boolean) => {
  const p = s.pending;
  if (p?.kind !== "payUnless" || p.player !== pid) throw new Error(`no payment for ${pid}: ${JSON.stringify(p)}`);
  if (!pay) return act(s, { type: "payUnless", player: pid, pay: false });
  const taps = planMana(s, pid, parseManaCost(p.cost));
  if (!taps) throw new Error(`${pid} can't pay ${p.cost}`);
  return run(s, [...taps, { type: "payUnless", player: pid, pay: true }]);
};
const untappedLands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && !s.objects[id]!.tapped).length;

describe("Lane B round B214", () => {
  it("are fully supported", () => {
    supported(warpingWurm(), allHallowsEve(), iceCave(), tidalFlats(), alpineMoon());
  });

  it("Warping Wurm: the +1/+1 counter for phasing in is on it before its upkeep payment is asked; declined, it phases out with it", () => {
    const { s: s0, ap } = setup([]);
    const wurm = putOnBattlefield(s0, ap, warpingWurm());
    // Phasing: out at your next untap step, back in at the one after (CR 702.26a).
    let s = settle(passUntil(s0, "upkeep", ap), ap);
    expect(zone(s, wurm)).toBe("phasedOut");
    s = passUntil(passUntil(s, "main1", ap), "upkeep", ap);
    expect(zone(s, wurm)).toBe("battlefield");
    s = settle(s, ap);
    // The question: pay or phase out. The counter is on it already.
    const p = s.pending;
    if (p?.kind !== "chooseMay" || !p.pay?.mana) throw new Error(JSON.stringify(p));
    expect(p.pay.mana).toBe("{2}{G}{U}");
    expect(s.objects[wurm]!.counters["+1/+1"]).toBe(1);
    const declined = settle(act(s, { type: "chooseMay", player: ap, yes: false }), ap);
    expect(zone(declined, wurm)).toBe("phasedOut");
    expect(declined.objects[wurm]!.counters["+1/+1"]).toBe(1);
    const paid = settle(run(s, [...planMana(s, ap, parseManaCost(p.pay.mana))!, { type: "chooseMay", player: ap, yes: true }]), ap);
    expect(zone(paid, wurm)).toBe("battlefield");
    expect(paid.objects[wurm]!.counters["+1/+1"]).toBe(1);
  });

  it("All Hallow's Eve: exiled with two scream counters; one comes off each upkeep, and at the last it goes to the graveyard and every creature card returns under its owner's control", () => {
    const { s: s0, ap, opp } = setup([]);
    const eve = toZone(s0, ap, allHallowsEve());
    const mine = toZone(s0, ap, grizzlyBears(), "graveyard");
    const theirs = toZone(s0, opp, hillGiant(), "graveyard");
    const bolt = toZone(s0, opp, lightningBolt(), "graveyard");
    let s = settle(castNow(s0, ap, eve), ap);
    expect(zone(s, eve)).toBe("exile");
    expect(s.objects[eve]!.counters.scream).toBe(2);
    s = settle(passUntil(s, "upkeep", ap), ap);
    expect(zone(s, eve)).toBe("exile");
    expect(s.objects[eve]!.counters.scream).toBe(1);
    expect(zone(s, mine)).toBe("graveyard");
    s = settle(passUntil(passUntil(s, "main1", ap), "upkeep", ap), ap);
    expect(zone(s, eve)).toBe("graveyard");
    expect(zone(s, mine)).toBe("battlefield");
    expect(zone(s, theirs)).toBe("battlefield");
    expect(s.objects[theirs]!.controller).toBe(opp);
    expect(zone(s, bolt)).toBe("graveyard");
  });

  it("All Hallow's Eve: in a graveyard (not exiled) its upkeep ability doesn't trigger (CR 603.4)", () => {
    const { s: s0, ap } = setup([]);
    const eve = toZone(s0, ap, allHallowsEve(), "graveyard");
    const mine = toZone(s0, ap, grizzlyBears(), "graveyard");
    s0.objects[eve]!.counters.scream = 1;
    const s = settle(passUntil(s0, "upkeep", ap), ap);
    expect(zone(s, eve)).toBe("graveyard");
    expect(zone(s, mine)).toBe("graveyard");
  });

  it("Ice Cave: another player pays the spell's mana cost and it's countered; its caster isn't asked", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, iceCave());
    putOnBattlefield(s0, opp, mountain());
    const b = toZone(s0, ap, lightningBolt());
    let s = settle(castNow(s0, ap, b, [ply(opp)]), opp);
    expect(s.pending).toMatchObject({ kind: "payUnless", player: opp, cost: "{R}" });
    s = settle(answerPay(s, opp, true), opp);
    expect(zone(s, b)).toBe("graveyard");
    expect(life(s, opp)).toBe(40);
    expect(untappedLands(s, opp)).toBe(0);
  });

  it("Ice Cave: each other player in turn order until one pays; with no one paying, the spell resolves", () => {
    const { s: s0, ap, opp } = setup([]);
    const third = nextOf(s0, ap, 2);
    const fourth = nextOf(s0, ap, 3);
    putOnBattlefield(s0, opp, iceCave());
    putOnBattlefield(s0, opp, mountain());
    putOnBattlefield(s0, third, mountain());
    putOnBattlefield(s0, fourth, mountain());
    const b1 = toZone(s0, ap, lightningBolt());
    let s = settle(castNow(s0, ap, b1, [ply(opp)]), opp);
    expect(s.pending).toMatchObject({ kind: "payUnless", player: opp });
    s = answerPay(s, opp, false);
    expect(s.pending).toMatchObject({ kind: "payUnless", player: third });
    s = answerPay(s, third, false);
    expect(s.pending).toMatchObject({ kind: "payUnless", player: fourth });
    s = settle(answerPay(s, fourth, true), opp);
    expect(zone(s, b1)).toBe("graveyard");
    expect(life(s, opp)).toBe(40);
    // None pays: it resolves.
    const b2 = toZone(s, ap, lightningBolt());
    s = settle(castNow(s, ap, b2, [ply(opp)]), opp);
    s = answerPay(s, opp, false);
    expect(s.pending?.player).not.toBe(ap);
    // The third and fourth players' Mountains are tapped now: they can't pay, so they aren't asked.
    s = settle(s, opp);
    expect(life(s, opp)).toBe(37);
  });

  it("Ice Cave: the mana cost of a spell with X on the stack has the X it was cast with (CR 107.3h)", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, iceCave());
    for (const l of [mountain(), mountain(), mountain()]) putOnBattlefield(s0, opp, l);
    const q = toZone(s0, ap, earthquake());
    const s = settle(castNow(s0, ap, q, [], 2), opp);
    expect(s.pending).toMatchObject({ kind: "payUnless", player: opp, cost: "{2}{R}" });
  });

  it("Ice Cave: a bot pays to counter a spell of mana value 2 or more, not a one-mana spell", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, iceCave());
    for (const l of [mountain(), mountain(), mountain()]) putOnBattlefield(s0, opp, l);
    const b = toZone(s0, ap, lightningBolt());
    let s = settle(castNow(s0, ap, b, [ply(opp)]), opp);
    expect(botActions(s, opp).at(-1)).toMatchObject({ type: "payUnless", pay: false });
    const q = toZone(s0, ap, earthquake());
    s = settle(castNow(s0, ap, q, [], 2), opp);
    expect(botActions(s, opp).at(-1)).toMatchObject({ type: "payUnless", pay: true });
  });

  it("Tidal Flats: not paid for, your creature blocking an attacker without flying gains first strike; a flyer isn't asked about", () => {
    const { s: s0, ap, opp } = setup([]);
    const flats = putOnBattlefield(s0, ap, tidalFlats());
    const mine = putOnBattlefield(s0, ap, hillGiant());
    const angelBlocker = putOnBattlefield(s0, ap, serraAngel());
    const attacker = putOnBattlefield(s0, opp, hillGiant());
    const angel = putOnBattlefield(s0, opp, serraAngel());
    putOnBattlefield(s0, opp, island());
    let s = passUntil(s0, "declareAttackers", opp);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker, defender: ap }, { attacker: angel, defender: ap }] });
    for (let i = 0; i < 20 && !(s.pending?.kind === "declareBlockers" && s.pending.player === ap); i++) s = act(s, s.pending?.kind === "declareBlockers" ? { type: "declareBlockers", player: s.pending.player, blocks: [] } : { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareBlockers", player: ap, blocks: [{ blocker: mine, attacker }, { blocker: angelBlocker, attacker: angel }] });
    for (let i = 0; i < 20 && s.pending?.kind === "declareBlockers"; i++) s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
    for (let i = 0; i < 20 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const at = s;
    s = run(s, planActivate(s, ap, flats, 0));
    s = settle(s, opp);
    expect(s.pending).toMatchObject({ kind: "payUnless", player: opp, cost: "{1}" });
    const declined = settle(answerPay(s, opp, false), opp);
    expect(declined.pending).toBeNull();
    expect(characteristics(declined, declined.objects[mine]!).keywords).toContain("First strike");
    expect(characteristics(declined, declined.objects[angelBlocker]!).keywords).not.toContain("First strike");
    const after = passUntil(declined, "endCombat", opp);
    expect(zone(after, mine)).toBe("battlefield");
    expect(zone(after, attacker)).toBe("graveyard");
    // Paid: no first strike, and the two Giants trade.
    const paid = passUntil(settle(answerPay(s, opp, true), opp), "endCombat", opp);
    expect(zone(paid, mine)).toBe("graveyard");
    expect(zone(paid, attacker)).toBe("graveyard");
    // A bot activates it here, while its blocker would gain first strike.
    expect(botActions(at, ap).some((a) => a.type === "activateAbility" && a.objectId === flats)).toBe(true);
  });

  it("Alpine Moon: opponents' lands with the chosen name lose their land types and abilities and tap for any color; yours don't", () => {
    const { s: s0, ap, opp } = setup([]);
    const moon = putOnBattlefield(s0, ap, alpineMoon());
    s0.objects[moon]!.chosen = { name: "Tropical Island" };
    const theirs = putOnBattlefield(s0, opp, tropicalIsland());
    const township = putOnBattlefield(s0, opp, gavonyTownship());
    const yours = putOnBattlefield(s0, ap, tropicalIsland());
    invalidateCharacteristics(s0);
    const c = characteristics(s0, s0.objects[theirs]!);
    expect(c.subtypes).toEqual([]);
    expect(c.types).toEqual(["Land"]);
    const ab = abilitiesOf(s0, s0.objects[theirs]!);
    expect(ab.activated).toEqual([]);
    expect(ab.mana.length).toBe(1);
    expect(JSON.stringify(ab.mana[0])).toContain("any");
    expect(characteristics(s0, s0.objects[yours]!).subtypes).toEqual(["Forest", "Island"]);
    expect(abilitiesOf(s0, s0.objects[township]!).activated.length).toBe(1);
    expect(abilitiesOf(s0, s0.objects[township]!).mana.length).toBe(1);
  });

  it("Alpine Moon: a land with the chosen name enters untapped and without its enters trigger (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const moon = putOnBattlefield(s0, ap, alpineMoon());
    s0.objects[moon]!.chosen = { name: "Temple of Epiphany" };
    const temple = toZone(s0, opp, templeofEpiphany());
    const mine = toZone(s0, ap, templeofEpiphany());
    moveObject(s0, temple, "battlefield", { controller: opp });
    moveObject(s0, mine, "battlefield", { controller: ap });
    expect(s0.objects[temple]!.tapped).toBe(false);
    expect(s0.objects[mine]!.tapped).toBe(true);
    expect(s0.triggerQueue.filter((t) => t.sourceId === temple)).toEqual([]);
    expect(s0.triggerQueue.filter((t) => t.sourceId === mine).length).toBe(1);
  });

  it("Alpine Moon: cast, it asks for a nonbasic land card name; a bot names an opponent's land", () => {
    const { s: s0, ap, opp } = setup([]);
    const moon = toZone(s0, ap, alpineMoon());
    const theirs = putOnBattlefield(s0, opp, tropicalIsland());
    let s = settle(castNow(s0, ap, moon), ap);
    const p = s.pending;
    if (p?.kind !== "chooseOption" || p.what !== "cardName") throw new Error(JSON.stringify(p));
    expect(p.options).toContain("Tropical Island");
    expect(p.options).not.toContain("Island");
    expect(botActions(s, ap)).toEqual([{ type: "chooseOption", player: ap, choice: "Tropical Island" }]);
    s = act(s, { type: "chooseOption", player: ap, choice: "Tropical Island" });
    expect(s.objects[moon]!.chosen?.name).toBe("Tropical Island");
    expect(characteristics(s, s.objects[theirs]!).subtypes).toEqual([]);
  });
});
