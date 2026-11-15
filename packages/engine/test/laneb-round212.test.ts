// Lane B round B212: Divine Deflection (one shield of X shared by you and your permanents, that much damage dealt to the
// target), Refraction Trap (its trap cost, and the same for a source of your choice), Channel Harm (all damage from
// sources you don't control prevented, and you may have it deal that much to the target creature), Decoy Gambit (for
// each opponent, their creature returned unless they have you draw a card) and Fade Away (for each creature, its
// controller sacrifices a permanent unless they pay {1}).

import { describe, expect, it } from "vitest";
import { act, mountain as mountainCard, plainsCard, putOnBattlefield, setup } from "./helpers";
const mountain = () => mountainCard;
import { botActions, characteristics, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const deflection = (): CardDef => ({"oracleId":"fe4a9464-1581-40a3-a50f-fc4df8f91444","name":"Divine Deflection","manaCost":"{X}{W}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Prevent the next X damage that would be dealt to you and/or permanents you control this turn. If damage is prevented this way, Divine Deflection deals that much damage to any target.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/c/ec06e42f-e294-44ef-8fa8-1d1a4c2090d8.jpg?1783940736","artUrl":"https://cards.scryfall.io/art_crop/front/e/c/ec06e42f-e294-44ef-8fa8-1d1a4c2090d8.jpg?1783940736","commanderLegal":"legal","set":"avr","releasedAt":"2012-05-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const refraction = (): CardDef => ({"oracleId":"0fc0554d-da45-49d2-941b-3f6c6458e823","name":"Refraction Trap","manaCost":"{3}{W}","cmc":4,"typeLine":"Instant — Trap","supertypes":[],"types":["Instant"],"subtypes":["Trap"],"oracleText":"If an opponent cast a red instant or sorcery spell this turn, you may pay {W} rather than pay this spell's mana cost.\nPrevent the next 3 damage that a source of your choice would deal to you and/or permanents you control this turn. If damage is prevented this way, Refraction Trap deals that much damage to any target.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/c/bcdceb36-fd36-4315-8ebe-9b8fc3777428.jpg?1783942065","artUrl":"https://cards.scryfall.io/art_crop/front/b/c/bcdceb36-fd36-4315-8ebe-9b8fc3777428.jpg?1783942065","commanderLegal":"legal","set":"wwk","releasedAt":"2010-02-05","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const channel = (): CardDef => ({"oracleId":"4b3d1cfb-9f1d-4e4e-a15a-2e248ff5bdfc","name":"Channel Harm","manaCost":"{5}{W}","cmc":6,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Prevent all damage that would be dealt to you and permanents you control this turn by sources you don't control. If damage is prevented this way, you may have Channel Harm deal that much damage to target creature.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/8/8801465e-295f-4b6b-a321-120f1b1edd0b.jpg?1783938714","artUrl":"https://cards.scryfall.io/art_crop/front/8/8/8801465e-295f-4b6b-a321-120f1b1edd0b.jpg?1783938714","commanderLegal":"legal","set":"frf","releasedAt":"2015-01-23","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const decoy = (): CardDef => ({"oracleId":"94d9878e-9786-438c-8b33-c1dff730b748","name":"Decoy Gambit","manaCost":"{2}{U}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"For each opponent, choose up to one target creature that player controls, then return that creature to its owner's hand unless its controller has you draw a card.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/9/39671ac5-c730-4ba2-a2d9-23d5ac13f12b.jpg?1783931222","artUrl":"https://cards.scryfall.io/art_crop/front/3/9/39671ac5-c730-4ba2-a2d9-23d5ac13f12b.jpg?1783931222","commanderLegal":"legal","set":"c20","releasedAt":"2020-04-17","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const fade = (): CardDef => ({"oracleId":"f92c2d47-f2f7-43d9-acf3-0145bad1977d","name":"Fade Away","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"For each creature, its controller sacrifices a permanent of their choice unless they pay {1}.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/6/a6f9103e-dcc2-4f7a-a8ca-eaa831f5f83b.jpg?1783946525","artUrl":"https://cards.scryfall.io/art_crop/front/a/6/a6f9103e-dcc2-4f7a-a8ca-eaa831f5f83b.jpg?1783946525","commanderLegal":"legal","set":"exo","releasedAt":"1998-06-15","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const grizzly = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const quake = (): CardDef => ({"oracleId":"9a40614b-50a3-422c-849e-53c8b7d3d204","name":"Earthquake","manaCost":"{X}{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Earthquake deals X damage to each creature without flying and each player.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/c/ac5d49b5-cf4d-48a4-b21d-0a3b7e6320a4.jpg?1783903402","artUrl":"https://cards.scryfall.io/art_crop/front/a/c/ac5d49b5-cf4d-48a4-b21d-0a3b7e6320a4.jpg?1783903402","commanderLegal":"legal","set":"sld","releasedAt":"2026-06-15","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const serra = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const lions = (): CardDef => ({"oracleId":"60ba93eb-39e6-4af2-9c66-cd38f72daff2","name":"Savannah Lions","manaCost":"{W}","cmc":1,"typeLine":"Creature — Cat","supertypes":[],"types":["Creature"],"subtypes":["Cat"],"oracleText":"","power":"2","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/9/a9757246-e782-4d7a-8273-d9efe284edaf.jpg?1783935189","artUrl":"https://cards.scryfall.io/art_crop/front/a/9/a9757246-e782-4d7a-8273-d9efe284edaf.jpg?1783935189","commanderLegal":"legal","set":"a25","releasedAt":"2018-03-16","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

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
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices: CostChoices = {}, x?: number) => run(s, planCast(s, pid, id, targets, undefined, undefined, x, choices));
/** Moves a new card for `def` into `pid`'s hand. */
const toHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** The damage events a player was dealt, from the log ("X deals N damage to P"). */
const hitsTo = (s: GameState, name: string, by: string) => s.log.filter((l) => l.text.startsWith(`${by} deals `) && l.text.includes(` damage to ${name}`)).length;
const answer = (s: GameState, pid: PlayerId, pick: (labels: string[]) => number) => {
  const p = s.pending;
  if (p?.kind !== "chooseOption" || p.player !== pid) throw new Error(`no question for ${pid}: ${JSON.stringify(p)}`);
  if (pick(p.labels ?? p.options) < 0) throw new Error(`no such option: ${JSON.stringify(p)}`);
  return act(s, { type: "chooseOption", player: pid, choice: p.options[pick(p.labels ?? p.options)]! });
};

describe("Lane B round B212", () => {
  it("are fully supported", () => {
    supported(deflection(), refraction(), channel(), decoy(), fade());
  });

  it("Divine Deflection: the next X damage to your creature is prevented and Divine Deflection deals that much to the target", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = toHand(s0, ap, deflection());
    const big = putOnBattlefield(s0, ap, giant());
    const b = toHand(s0, ap, bolt());
    let s = settle(castNow(s0, ap, d, [ply(opp)], {}, 2));
    expect(zone(s, d)).toBe("graveyard");
    const before = life(s, opp);
    s = settle(castNow(s, ap, b, [tgt(big)]));
    // 2 of Lightning Bolt's 3 prevented, 2 dealt to the opponent by Divine Deflection, 1 marked on the giant.
    expect(life(s, opp)).toBe(before - 2);
    expect(s.objects[big]!.damage).toBe(1);
    expect(hitsTo(s, s.players[opp]!.name, "Divine Deflection")).toBe(1);
  });

  it("Divine Deflection: one shield for you and your permanents; you choose which damage dealt at once it takes, and it deals all it prevented as one amount", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = toHand(s0, ap, deflection());
    const g = putOnBattlefield(s0, ap, giant());
    const q = toHand(s0, ap, quake());
    let s = settle(castNow(s0, ap, d, [ply(opp)], {}, 3));
    const [mine, theirs] = [life(s, ap), life(s, opp)];
    // Earthquake for 2: 2 to you and 2 to the Hill Giant, 4 in all; the shield of 3 can't take all of it.
    s = settle(castNow(s, ap, q, [], {}, 2), ap);
    expect(s.pending?.kind).toBe("chooseOption");
    // All of the giant's, 1 at a time; the last 1 of the shield then takes yours.
    s = settle(answer(s, ap, (l) => l.findIndex((x) => x.startsWith("Hill Giant"))), ap);
    s = settle(answer(s, ap, (l) => l.findIndex((x) => x.startsWith("Hill Giant"))), ap);
    s = settle(s);
    expect(s.objects[g]!.damage).toBe(0);
    expect(life(s, ap)).toBe(mine - 1);
    // The opponent takes Earthquake's 2 and Divine Deflection's 3, dealt once.
    expect(life(s, opp)).toBe(theirs - 2 - 3);
    expect(hitsTo(s, s.players[opp]!.name, "Divine Deflection")).toBe(1);
  });

  it("Divine Deflection: an illegal target as it resolves means nothing is prevented (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = toHand(s0, ap, deflection());
    const theirs = putOnBattlefield(s0, opp, grizzly());
    const big = putOnBattlefield(s0, ap, giant());
    let s = castNow(s0, ap, d, [tgt(theirs)], {}, 3);
    s.battlefield.splice(s.battlefield.indexOf(theirs), 1);
    s.objects[theirs]!.zone = "graveyard";
    s.players[opp]!.graveyard.push(theirs);
    s = settle(s);
    const b = toHand(s, ap, bolt());
    s = settle(castNow(s, ap, b, [tgt(big)]));
    expect(zone(s, big)).toBe("graveyard");
  });

  it("Refraction Trap: {W} instead after an opponent cast a red instant or sorcery spell this turn, not a red creature spell", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = toHand(s0, ap, refraction());
    const alt = { alt: "alternative" } as CostChoices;
    // Only one white source: the {3}{W} cost needs four.
    for (const id of s0.battlefield.filter((x) => s0.objects[x]!.controller === ap && characteristics(s0, s0.objects[x]!).types.includes("Land") && !characteristics(s0, s0.objects[x]!).subtypes.includes("Plains"))) s0.objects[id]!.tapped = true;
    for (const id of s0.battlefield.filter((x) => s0.objects[x]!.controller === ap && characteristics(s0, s0.objects[x]!).subtypes.includes("Plains")).slice(1)) s0.objects[id]!.tapped = true;
    expect(planCast(s0, ap, r, [ply(opp)])).toBeNull();
    expect(planCast(s0, ap, r, [ply(opp)], undefined, undefined, undefined, alt)).toBeNull();
    // A red creature spell isn't enough; a red instant is.
    s0.castThisTurn = [{ player: opp, card: "x", colors: ["R"], types: ["Creature"] }];
    expect(planCast(s0, ap, r, [ply(opp)], undefined, undefined, undefined, alt)).toBeNull();
    s0.castThisTurn = [{ player: opp, card: "x", colors: ["R"], types: ["Instant"] }];
    expect(planCast(s0, ap, r, [ply(opp)], undefined, undefined, undefined, alt)).not.toBeNull();
    // Your own red instant isn't an opponent's.
    s0.castThisTurn = [{ player: ap, card: "x", colors: ["R"], types: ["Instant"] }];
    expect(planCast(s0, ap, r, [ply(opp)], undefined, undefined, undefined, alt)).toBeNull();
  });

  it("Refraction Trap: the chosen source's next 3 damage to you and your permanents is prevented, and Refraction Trap deals that much", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = toHand(s0, ap, refraction());
    const g = putOnBattlefield(s0, ap, giant());
    const q = toHand(s0, ap, quake());
    // Earthquake for 2 on the stack, then Refraction Trap above it: Earthquake is the source chosen as it resolves.
    let s = castNow(s0, ap, q, [], {}, 2);
    s = castNow(s, ap, r, [ply(opp)]);
    s = settle(s, ap);
    expect(s.pending?.kind === "chooseOption" && s.pending.what).toBe("damageSource");
    s = settle(answer(s, ap, (l) => l.findIndex((x) => x.startsWith("Earthquake"))), ap);
    const [mine, theirs] = [life(s, ap), life(s, opp)];
    // 2 to you and 2 to the giant: you choose which 3 of the 4 it takes, 1 at a time.
    s = settle(answer(s, ap, (l) => l.findIndex((x) => x.startsWith("Hill Giant"))), ap);
    s = settle(answer(s, ap, (l) => l.findIndex((x) => !x.startsWith("Hill Giant"))), ap);
    s = settle(answer(s, ap, (l) => l.findIndex((x) => !x.startsWith("Hill Giant"))), ap);
    s = settle(s);
    expect(s.objects[g]!.damage).toBe(1);
    expect(life(s, ap)).toBe(mine);
    expect(life(s, opp)).toBe(theirs - 2 - 3);
    expect(hitsTo(s, s.players[opp]!.name, "Refraction Trap")).toBe(1);
  });

  it("Refraction Trap: damage from another source isn't prevented", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = toHand(s0, ap, refraction());
    const g = putOnBattlefield(s0, ap, giant());
    const theirs = putOnBattlefield(s0, opp, grizzly());
    let s = settle(castNow(s0, ap, r, [ply(opp)]), ap);
    // Only the opponent's bear to choose (a permanent of theirs): its damage later would be prevented, not a Bolt's.
    if (s.pending?.kind === "chooseOption") s = settle(answer(s, ap, (l) => l.findIndex((x) => x.startsWith("Grizzly Bears"))), ap);
    const b = toHand(s, ap, bolt());
    s = settle(castNow(s, ap, b, [tgt(g)]), ap);
    expect(zone(s, g)).toBe("graveyard");
    expect(s.damageRules?.some((x) => x.by?.chosen?.id === theirs)).toBe(true);
  });

  it("Channel Harm: damage from sources you don't control to you and your permanents is prevented; you may have it deal that much to the target creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = toHand(s0, ap, channel());
    const mine = putOnBattlefield(s0, ap, grizzly());
    const theirs = putOnBattlefield(s0, opp, giant());
    let s = settle(castNow(s0, ap, c, [tgt(theirs)]));
    const before = life(s, ap);
    // The opponent's Lightning Bolt at you: prevented; you choose to deal 3 to their Hill Giant.
    putOnBattlefield(s, opp, mountain());
    const ob = toHand(s, opp, bolt());
    s.priority = opp;
    s = settle(castNow(s, opp, ob, [ply(ap)]), ap);
    expect(s.pending?.kind).toBe("chooseOption");
    s = settle(answer(s, ap, (l) => l.findIndex((x) => x.startsWith("Deal"))), ap);
    expect(life(s, ap)).toBe(before);
    expect(zone(s, theirs)).toBe("graveyard");
    // Your own Lightning Bolt at your bear isn't from a source you don't control: dealt.
    const yb = toHand(s, ap, bolt());
    s = settle(castNow(s, ap, yb, [tgt(mine)]), ap);
    expect(zone(s, mine)).toBe("graveyard");
  });

  it("Channel Harm: you may decline to deal the damage; it's still prevented", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = toHand(s0, ap, channel());
    const mine = putOnBattlefield(s0, ap, giant());
    const theirs = putOnBattlefield(s0, opp, giant());
    let s = settle(castNow(s0, ap, c, [tgt(theirs)]));
    putOnBattlefield(s, opp, mountain());
    const ob = toHand(s, opp, bolt());
    s.priority = opp;
    s = settle(castNow(s, opp, ob, [tgt(mine)]), ap);
    s = settle(answer(s, ap, (l) => l.findIndex((x) => x.startsWith("Don't"))), ap);
    expect(s.objects[mine]!.damage).toBe(0);
    expect(s.objects[theirs]!.damage).toBe(0);
  });

  it("Channel Harm: two of them aimed at each other's creatures: the bots break the loop (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = toHand(s0, ap, channel());
    const mine = putOnBattlefield(s0, ap, giant());
    const theirs = putOnBattlefield(s0, opp, giant());
    let s = settle(castNow(s0, ap, c, [tgt(theirs)]));
    for (let i = 0; i < 6; i++) putOnBattlefield(s, opp, plainsCard);
    const c2 = toHand(s, opp, { ...channel() });
    s.priority = opp;
    s = settle(castNow(s, opp, c2, [tgt(mine)]));
    putOnBattlefield(s, opp, mountain());
    const ob = toHand(s, opp, bolt());
    s.priority = opp;
    const before = life(s, ap);
    s = settle(castNow(s, opp, ob, [ply(ap)]));
    expect(life(s, ap)).toBe(before);
    expect(s.objects[mine]!.damage).toBe(0);
    expect(s.objects[theirs]!.damage).toBe(0);
  });

  it("Decoy Gambit: each opponent chooses in turn order, knowing the earlier choices; you draw first, then the creatures are returned", () => {
    const { s: s0, ap } = setup([]);
    const [o1, o2, o3] = [nextOf(s0, ap, 1), nextOf(s0, ap, 2), nextOf(s0, ap, 3)];
    const d = toHand(s0, ap, decoy());
    const cheap = putOnBattlefield(s0, o1, grizzly());
    const dear = putOnBattlefield(s0, o2, giant());
    putOnBattlefield(s0, o3, lions());
    const hand = s0.players[ap]!.hand.length;
    // A target for the first two opponents, none for the third.
    let s = settle(castNow(s0, ap, d, [tgt(cheap), tgt(dear), { kind: "none" }]));
    // A bot returns its cheap bear and pays a card for its Hill Giant (mana value 4).
    expect(s.players[o1]!.hand).toContain(cheap);
    expect(zone(s, dear)).toBe("battlefield");
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
    const texts = s.log.map((l) => l.text);
    const asked1 = texts.findIndex((t) => t.includes(`${s.players[o1]!.name} lets Grizzly Bears return`));
    const asked2 = texts.findIndex((t) => t.includes(`${s.players[o2]!.name} has ${s.players[ap]!.name} draw a card`));
    const drew = texts.findIndex((t, i) => i > asked2 && t.includes(`${s.players[ap]!.name} draws 1 card`));
    const back = texts.findIndex((t) => t.includes("Decoy Gambit returns Grizzly Bears"));
    expect(asked1).toBeGreaterThan(-1);
    expect(asked2).toBeGreaterThan(asked1);
    expect(drew).toBeGreaterThan(asked2);
    expect(back).toBeGreaterThan(drew);
  });

  it("Decoy Gambit: you answer for your own creature; a creature that changed controller isn't a legal target, so its player can't choose", () => {
    const { s: s0, ap } = setup([]);
    const [o1, o2] = [nextOf(s0, ap, 1), nextOf(s0, ap, 2)];
    const d = toHand(s0, ap, decoy());
    const a = putOnBattlefield(s0, o1, giant());
    const b = putOnBattlefield(s0, o2, giant());
    let s = castNow(s0, ap, d, [tgt(a), tgt(b), { kind: "none" }]);
    // Before it resolves, the second opponent's giant comes under the first opponent's control.
    s.effects.push({ id: `x${s.nextId++}`, timestamp: s.nextTimestamp++, controller: o1, sourceName: "test", duration: "game", affected: [b], mods: [{ kind: "control" }] });
    invalidateCharacteristics(s);
    s = settle(s, o1);
    expect(s.pending?.kind === "chooseMay" && s.pending.player).toBe(o1);
    expect(s.pending?.kind === "chooseMay" && s.pending.card).toBe(a);
    s = settle(act(s, { type: "chooseMay", player: o1, yes: false }), o1);
    // Only one question: the other giant isn't a legal target any more (rulings).
    expect(s.pending).toBeNull();
    expect(s.players[o1]!.hand).toContain(a);
    expect(zone(s, b)).toBe("battlefield");
  });

  it("Fade Away: each player counts their creatures, pays {1} or picks a permanent for each, and the permanents are sacrificed at once", () => {
    const { s: s0, ap } = setup([]);
    const o1 = nextOf(s0, ap, 1);
    const f = toHand(s0, ap, fade());
    const mine = [putOnBattlefield(s0, ap, grizzly()), putOnBattlefield(s0, ap, giant())];
    const theirs = [putOnBattlefield(s0, o1, grizzly()), putOnBattlefield(s0, o1, lions()), putOnBattlefield(s0, o1, giant())];
    // One land to pay with: the opponent pays once and sacrifices two.
    const theirLand = putOnBattlefield(s0, o1, mountain());
    let s = settle(castNow(s0, ap, f), ap);
    // Two creatures: two choices, the first of them paying {1}.
    expect(s.pending?.kind === "chooseOption" && s.pending.what).toBe("punisher");
    expect(s.pending?.kind === "chooseOption" && s.pending.prompt).toMatch(/\(1 of 2\)/);
    s = answer(s, ap, (l) => l.findIndex((x) => x.startsWith("Pay")));
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap, cost: "{1}", otherwise: "sacrifice a permanent instead" });
    // Paid the way a bot pays: tapping a land for it (CR 605.3a).
    s = settle(run(s, botActions(s, ap)), ap);
    expect(s.log.some((l) => /pays \{1\}/.test(l.text))).toBe(true);
    // Then sacrificing one: the bear, picked now and sacrificed with everyone else's at the end.
    s = answer(s, ap, (l) => l.findIndex((x) => x.startsWith("Sacrifice")));
    s = settle(s, ap);
    expect(s.pending?.kind).toBe("pickPermanents");
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [mine[0]!] }), ap);
    s = settle(s);
    expect(zone(s, mine[0]!)).toBe("graveyard");
    // Yours is sacrificed only after the opponent (later in turn order) has paid: all at once at the end (rulings).
    const texts = s.log.map((l) => l.text);
    const theyPaid = texts.findIndex((t) => t.startsWith(`${s.players[o1]!.name} pays {1}`));
    const yoursGone = texts.findIndex((t) => t === `${s.players[ap]!.name} sacrifices Grizzly Bears.`);
    expect(theyPaid).toBeGreaterThan(-1);
    expect(yoursGone).toBeGreaterThan(theyPaid);
    expect(zone(s, mine[1]!)).toBe("battlefield");
    // Three creatures, one {1} paid: two of their permanents are sacrificed (any permanent, rulings).
    expect([...theirs, theirLand].filter((id) => zone(s, id) === "graveyard")).toHaveLength(2);
    // The Hill Giant is one the bot keeps.
    expect(zone(s, theirs[2]!)).toBe("battlefield");
  });

  it("Fade Away: a player with no creatures does nothing; one who can't pay sacrifices", () => {
    const { s: s0, ap } = setup([]);
    const [o1, o2] = [nextOf(s0, ap, 1), nextOf(s0, ap, 2)];
    const f = toHand(s0, ap, fade());
    const b = putOnBattlefield(s0, o1, grizzly());
    const land = putOnBattlefield(s0, o2, mountain());
    let s = settle(castNow(s0, ap, f));
    expect(zone(s, b)).toBe("graveyard");
    expect(zone(s, land)).toBe("battlefield");
  });
});
