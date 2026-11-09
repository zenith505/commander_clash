// Lane B round B157: Breaking // Entering (a creature card from any graveyard, then haste), Failure // Comply (a name
// banned for opponents until your next turn), Reincarnation (a delayed trigger returning a card under the dead creature's
// owner's control), Love on the Battlefield (a delayed combat damage trigger about each of the two attackers), Magmablood
// Archaic (the colors spent on the spell that triggered it, as it was cast), Mob Mentality ("all non-Wall creatures you
// control attack"), The Crowd Goes Wild (support X on a sorcery), Touch of Moonglove ("a creature dealt damage by that
// creature dies this turn") and Break Out (the revealed card onto the battlefield only with mana value 2 or less).

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup } from "./helpers";
import { botActions, castProblem, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, planCast, power, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const entering = (): CardDef => ({"oracleId":"043370fd-9cfe-47ce-8019-e915cee1ae95","name":"Breaking // Entering","manaCost":"{U}{B} // {4}{B}{R}","cmc":8,"typeLine":"Sorcery // Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target player mills eight cards.\nFuse (You may cast one or both halves of this card from your hand.)","colors":["B","R","U"],"colorIdentity":["B","R","U"],"keywords":["Mill","Fuse"],"imageUrl":"https://cards.scryfall.io/normal/front/6/6/66724f4e-59dd-4c70-b09b-49947320e6d1.jpg?1783940017","artUrl":"https://cards.scryfall.io/art_crop/front/6/6/66724f4e-59dd-4c70-b09b-49947320e6d1.jpg?1783940017","commanderLegal":"legal","set":"dgm","releasedAt":"2013-05-03","rarity":"rare","layout":"split","gameChanger":false,"faces":[{"name":"Breaking","manaCost":"{U}{B}","typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target player mills eight cards.\nFuse (You may cast one or both halves of this card from your hand.)","colors":["U","B"]},{"name":"Entering","manaCost":"{4}{B}{R}","typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Put a creature card from a graveyard onto the battlefield under your control. It gains haste until end of turn.\nFuse (You may cast one or both halves of this card from your hand.)","colors":["B","R"]}]}) as CardDef;
const comply = (): CardDef => ({"oracleId":"ed8184f8-f6a7-4f97-9f4e-bf72077af754","name":"Failure // Comply","manaCost":"{1}{U} // {W}","cmc":3,"typeLine":"Instant // Sorcery","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Return target spell to its owner's hand.","colors":["U","W"],"colorIdentity":["U","W"],"keywords":["Aftermath"],"imageUrl":"https://cards.scryfall.io/normal/front/b/9/b9623c8c-01b4-4e8f-a5b9-eeea408ec027.jpg?1783936454","artUrl":"https://cards.scryfall.io/art_crop/front/b/9/b9623c8c-01b4-4e8f-a5b9-eeea408ec027.jpg?1783936454","commanderLegal":"legal","set":"akh","releasedAt":"2017-04-28","rarity":"rare","layout":"split","gameChanger":false,"faces":[{"name":"Failure","manaCost":"{1}{U}","typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Return target spell to its owner's hand.","colors":["U"]},{"name":"Comply","manaCost":"{W}","typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Aftermath (Cast this spell only from your graveyard. Then exile it.)\nChoose a card name. Until your next turn, your opponents can't cast spells with the chosen name.","colors":["W"]}]}) as CardDef;
const reincarnation = (): CardDef => ({"oracleId":"d6bf5e22-8d33-43a9-8824-435068e0a87a","name":"Reincarnation","manaCost":"{1}{G}{G}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose target creature. When that creature dies this turn, return a creature card from its owner's graveyard to the battlefield under the control of that creature's owner.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/e/7ee379cd-b3fb-487b-846c-eab02902de79.jpg?1783939655","artUrl":"https://cards.scryfall.io/art_crop/front/7/e/7ee379cd-b3fb-487b-846c-eab02902de79.jpg?1783939655","commanderLegal":"legal","set":"c13","releasedAt":"2013-11-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const love = (): CardDef => ({"oracleId":"645dbd86-fe30-4897-a3ca-633f07ec5b54","name":"Love on the Battlefield","manaCost":"{1}{U}{R}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever you attack with exactly two creatures, those creatures gain first strike until end of turn, then draw a card. Whenever either of those creatures deals combat damage to a player this combat, put a +1/+1 counter on it.","colors":["R","U"],"colorIdentity":["R","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/f/3f2e65ff-27ae-4dfc-bf17-66f0c4949699.jpg?1783903268","artUrl":"https://cards.scryfall.io/art_crop/front/3/f/3f2e65ff-27ae-4dfc-bf17-66f0c4949699.jpg?1783903268","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const magma = (): CardDef => ({"oracleId":"c6a5adc8-ee57-421e-8235-0b3160f44568","name":"Magmablood Archaic","manaCost":"{2/R}{2/R}{2/R}","cmc":6,"typeLine":"Creature — Avatar","supertypes":[],"types":["Creature"],"subtypes":["Avatar"],"oracleText":"Reach, trample\nConverge — This creature enters with a +1/+1 counter on it for each color of mana spent to cast it.\nWhenever you cast an instant or sorcery spell, creatures you control get +1/+0 until end of turn for each color of mana spent to cast that spell.","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":["Reach","Converge","Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/4/d/4d611278-9948-4345-b4dd-aa6eaf21b233.jpg?1783903667","artUrl":"https://cards.scryfall.io/art_crop/front/4/d/4d611278-9948-4345-b4dd-aa6eaf21b233.jpg?1783903667","commanderLegal":"legal","set":"sos","releasedAt":"2026-04-24","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const mob = (): CardDef => ({"oracleId":"90e8fb2c-6473-42c3-92f4-f46a744920fa","name":"Mob Mentality","manaCost":"{R}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature has trample.\nWhenever all non-Wall creatures you control attack, enchanted creature gets +X/+0 until end of turn, where X is the number of attacking creatures.","colors":["R"],"colorIdentity":["R"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/e/4/e428d56a-9445-4e86-b281-656e2d251e0b.jpg?1783946987","artUrl":"https://cards.scryfall.io/art_crop/front/e/4/e428d56a-9445-4e86-b281-656e2d251e0b.jpg?1783946987","commanderLegal":"legal","set":"vis","releasedAt":"1997-02-03","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const crowd = (): CardDef => ({"oracleId":"21302f37-0632-4202-9823-f08c5aec016e","name":"The Crowd Goes Wild","manaCost":"{X}{G}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Assist (Another player can pay up to {X} of this spell's cost. You choose the value of X.)\nSupport X. (Put a +1/+1 counter on each of up to X target creatures.)\nEach creature with a +1/+1 counter on it gains trample until end of turn.","colors":["G"],"colorIdentity":["G"],"keywords":["Support","Assist"],"imageUrl":"https://cards.scryfall.io/normal/front/9/4/94ae9160-5bc0-4162-8ea6-ef11c387c195.jpg?1783934853","artUrl":"https://cards.scryfall.io/art_crop/front/9/4/94ae9160-5bc0-4162-8ea6-ef11c387c195.jpg?1783934853","commanderLegal":"legal","set":"bbd","releasedAt":"2018-06-08","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const moonglove = (): CardDef => ({"oracleId":"d3a6bff6-ea85-4e8a-b256-7427d15326b6","name":"Touch of Moonglove","manaCost":"{B}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature you control gets +1/+0 and gains deathtouch until end of turn. Whenever a creature dealt damage by that creature dies this turn, its controller loses 2 life. (Any amount of damage a creature with deathtouch deals to a creature is enough to destroy it.)","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/f/bf659f2f-983c-4a62-a969-4176e5fbe193.jpg?1783938335","artUrl":"https://cards.scryfall.io/art_crop/front/b/f/bf659f2f-983c-4a62-a969-4176e5fbe193.jpg?1783938335","commanderLegal":"legal","set":"ori","releasedAt":"2015-07-17","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const breakOut = (): CardDef => ({"oracleId":"99eaac39-28d4-4af7-984b-f75fd37902ed","name":"Break Out","manaCost":"{R}{G}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Look at the top six cards of your library. You may reveal a creature card from among them. If that card has mana value 2 or less, you may put it onto the battlefield and it gains haste until end of turn. If you didn't put the revealed card onto the battlefield this way, put it into your hand. Put the rest on the bottom of your library in a random order.","colors":["G","R"],"colorIdentity":["G","R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/0/60b50a8f-2788-41df-81ca-61194960b730.jpg?1783912855","artUrl":"https://cards.scryfall.io/art_crop/front/6/0/60b50a8f-2788-41df-81ca-61194960b730.jpg?1783912855","commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const fireIce = (): CardDef => ({"oracleId":"ae92942b-919c-4ea9-b693-85fcef765d5a","name":"Fire // Ice","manaCost":"{1}{R} // {1}{U}","cmc":4,"typeLine":"Instant // Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Fire deals 2 damage divided as you choose among one or two targets.","colors":["R","U"],"colorIdentity":["R","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/b/ab8292ae-9a52-43e7-92f7-0f45f4bb71ec.jpg?1783940411","artUrl":"https://cards.scryfall.io/art_crop/front/a/b/ab8292ae-9a52-43e7-92f7-0f45f4bb71ec.jpg?1783940411","commanderLegal":"legal","set":"ddj","releasedAt":"2012-09-07","rarity":"uncommon","layout":"split","gameChanger":false,"faces":[{"name":"Fire","manaCost":"{1}{R}","typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Fire deals 2 damage divided as you choose among one or two targets.","colors":["R"]},{"name":"Ice","manaCost":"{1}{U}","typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Tap target permanent.\nDraw a card.","colors":["U"]}]}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const tgt = (id: string) => ({ kind: "object" as const, id });
const ply = (id: PlayerId) => ({ kind: "player" as const, id });
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
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
/** Everyone passes, answering the end-of-turn questions, until `active`'s `step`; stops at any other question. */
const goUntil = (s: GameState, step: GameState["step"], active: PlayerId, max = 3000) => {
  for (let i = 0; i < max; i++) {
    if (s.step === step && s.activePlayer === active) return s;
    const pid = waitingOn(s)!;
    const pend = s.pending;
    if (pend?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (pend?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (pend?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, pend.count) });
    else if (pend) return s;
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error(`never reached ${step}`);
};
/** Passes (no blockers) until a question for `pid` or the second main phase. */
const throughCombat = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 400; i++) {
    if (s.pending?.kind === "declareBlockers") {
      s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
      continue;
    }
    if ((s.pending && "player" in s.pending && s.pending.player === pid) || s.step === "main2") return s;
    if (s.pending) throw new Error(`unexpected ${s.pending.kind}`);
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const toZone = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone === "hand" ? "hand" : "graveyard"].push(id);
  invalidateCharacteristics(s);
  return id;
};
const others = (s: GameState, ap: PlayerId) => {
  const i = s.turnOrder.indexOf(ap);
  return [1, 2, 3].map((k) => s.turnOrder[(i + k) % 4]!);
};
const beast = (name: string, p: number, extra: Partial<CardDef> = {}) => card(name, "Creature — Beast", "{2}{G}", { power: String(p), toughness: String(p), colors: ["G"], ...extra });
const wall = () => card("Test Wall", "Creature — Wall", "{1}{W}", { power: "0", toughness: "4", keywords: ["Defender"], oracleText: "Defender" });
const murder = () => card("Test Murder", "Instant", "{B}", { cmc: 1, colors: ["B"], oracleText: "Destroy target creature." });
const bite = () => card("Test Bite", "Instant", "{G}", { cmc: 1, colors: ["G"], oracleText: "Target creature you control deals damage equal to its power to target creature you don't control." });
const charm = () => card("Test Charm", "Instant", "{U}{R}", { cmc: 2, colors: ["U", "R"], oracleText: "Draw a card." });
const bolt = () => card("Lightning Bolt", "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: "Lightning Bolt deals 3 damage to any target." });
const kw = (s: GameState, id: string, k: string) => objHasKeyword(s, s.objects[id]!, k);

describe("Lane B round B157", () => {
  it("compiles the cards", () => supported(entering(), comply(), reincarnation(), love(), magma(), mob(), crowd(), moonglove(), breakOut()));

  it("Breaking // Entering fused: Breaking mills eight, then Entering puts a creature card from any graveyard onto the battlefield under your control with haste (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([entering()]);
    const [, o2] = others(s0, ap);
    s0.players[ap]!.manaPool = { W: 0, U: 2, B: 2, R: 2, G: 0, C: 4 };
    const theirs = toZone(s0, o2!, beast("Test Beast", 5), "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [ply(opp)], undefined, "auto", undefined, { face: 2 })));
    expect(s.players[opp]!.graveyard.length).toBeGreaterThanOrEqual(8);
    // Not targeted: any creature card in any graveyard, the ones just milled too (rulings).
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, anyGraveyard: true, fromGraveyard: "battlefield" });
    const offered = s.pending?.kind === "searchLibrary" ? s.pending.cards : [];
    expect(offered).toContain(theirs);
    expect(offered.some((id) => s.objects[id]!.owner === opp)).toBe(true);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [theirs] }));
    expect(s.objects[theirs]!.zone).toBe("battlefield");
    expect(controllerOf(s, s.objects[theirs]!)).toBe(ap);
    expect(kw(s, theirs, "Haste")).toBe(true);
    // Until end of turn only.
    s = goUntil(s, "upkeep", opp);
    expect(kw(s, theirs, "Haste")).toBe(false);
  });

  it("Entering alone with no creature card in any graveyard does nothing", () => {
    const { s: s0, ap, ids } = setup([entering()]);
    for (const p of s0.turnOrder) s0.players[p]!.graveyard = [];
    s0.players[ap]!.manaPool = { W: 0, U: 0, B: 1, R: 1, G: 0, C: 4 };
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [], undefined, "auto", undefined, { face: 1 })));
    expect(s.pending).toBeNull();
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("Comply (aftermath): the chosen name can't be cast by your opponents until your next turn; you still can, and the other half of a split card can (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([bolt(), fireIce()]);
    const yard = toZone(s0, ap, comply(), "graveyard");
    const theirBolt = toZone(s0, opp, bolt(), "hand");
    const theirFireIce = toZone(s0, opp, fireIce(), "hand");
    let s = settle(run(s0, planCast(s0, ap, yard, [], undefined, "auto", undefined, { face: 1, via: "aftermath" })));
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "cardName" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Lightning Bolt" }));
    expect(s.objects[yard]!.zone).toBe("exile");
    expect(castProblem(s, opp, theirBolt, [ply(ap)])).toMatch(/can't be cast/);
    expect(castProblem(s, ap, ids[0]!, [ply(opp)]) ?? "").not.toMatch(/can't be cast/);
    // Naming one half: the other half can still be cast.
    const s2 = settle(run(s0, planCast(s0, ap, yard, [], undefined, "auto", undefined, { face: 1, via: "aftermath" })));
    const s3 = settle(act(s2, { type: "chooseOption", player: ap, choice: "Fire" }));
    const tapMe = putOnBattlefield(s3, ap, bear());
    expect(castProblem(s3, opp, theirFireIce, [ply(ap)], undefined, undefined, undefined, undefined, { face: 0 })).toMatch(/can't be cast/);
    expect(castProblem(s3, opp, theirFireIce, [tgt(tapMe)], undefined, undefined, undefined, undefined, { face: 1 }) ?? "").not.toMatch(/can't be cast/);
    // Over as your next turn begins.
    s = goUntil(s, "upkeep", ap);
    expect(s.namedBansUntil).toBeUndefined();
  });

  it("Reincarnation: when the target dies this turn, you choose a creature card in its owner's graveyard and it enters under that owner's control (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([reincarnation(), murder()]);
    const victim = putOnBattlefield(s0, opp, beast("Test Beast", 3));
    const old = toZone(s0, opp, beast("Old Beast", 6), "graveyard");
    const mine = toZone(s0, ap, beast("My Beast", 7), "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(victim)])));
    expect(s.objects[victim]!.zone).toBe("battlefield");
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(victim)])));
    // You choose (Reincarnation's controller), among the owner's graveyard only: the dead creature itself too.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const offered = s.pending?.kind === "searchLibrary" ? s.pending.cards : [];
    expect(offered).toContain(old);
    expect(offered).toContain(victim);
    expect(offered).not.toContain(mine);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [old] }));
    expect(s.objects[old]!.zone).toBe("battlefield");
    expect(controllerOf(s, s.objects[old]!)).toBe(opp);
  });

  it("Reincarnation: nothing happens if the creature dies on a later turn", () => {
    const { s: s0, ap, ids, opp } = setup([reincarnation(), murder()]);
    const victim = putOnBattlefield(s0, opp, beast("Test Beast", 3));
    const old = toZone(s0, opp, beast("Old Beast", 6), "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(victim)])));
    s = goUntil(s, "upkeep", opp);
    for (let i = 0; i < 20 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s.players[ap]!.manaPool = { W: 0, U: 0, B: 1, R: 0, G: 0, C: 0 };
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(victim)])));
    expect(s.objects[victim]!.zone).toBe("graveyard");
    expect(s.pending).toBeNull();
    expect(s.objects[old]!.zone).toBe("graveyard");
  });

  const loveAttack = (n: number) => {
    const { s: s0, ap } = setup([]);
    const [o1] = others(s0, ap);
    s0.players[ap]!.hand = [];
    putOnBattlefield(s0, ap, love());
    const attackers = Array.from({ length: n }, (_, i) => putOnBattlefield(s0, ap, beast(`Beast ${"ABC"[i]}`, 2)));
    let s = goUntil(s0, "declareAttackers", ap);
    const hand = s.players[ap]!.hand.length;
    s = act(s, { type: "declareAttackers", player: ap, attacks: attackers.map((a) => ({ attacker: a, defender: o1! })) });
    return { s, ap, o1: o1!, attackers, hand };
  };

  it("Love on the Battlefield: attacking with exactly two creatures gives them first strike and draws; each that deals combat damage to a player gets a +1/+1 counter", () => {
    const { s: s0, ap, o1, attackers, hand } = loveAttack(2);
    let s = settle(s0);
    expect(attackers.every((a) => kw(s, a, "First strike"))).toBe(true);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    s = throughCombat(s, ap);
    expect(s.players[o1]!.life).toBe(40 - 4);
    expect(attackers.map((a) => s.objects[a]!.counters["+1/+1"] ?? 0)).toEqual([1, 1]);
  });

  it("Love on the Battlefield: not with three attackers; a blocked one gets no counter; this combat only", () => {
    const three = settle(loveAttack(3).s);
    expect(three.log.some((l) => /Love on the Battlefield/.test(l.text))).toBe(false);
    const { s: s0, ap, o1, attackers } = loveAttack(2);
    const blocker = putOnBattlefield(s0, o1, card("Test Blocker", "Creature — Wall", "{1}", { power: "0", toughness: "8", keywords: ["Defender"], oracleText: "Defender" }));
    let s = settle(s0);
    for (let i = 0; i < 100 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareBlockers", player: o1, blocks: [{ blocker, attacker: attackers[0]! }] });
    s = throughCombat(s, ap);
    expect(attackers.map((a) => s.objects[a]!.counters["+1/+1"] ?? 0)).toEqual([0, 1]);
    expect(s.floatingTriggers ?? []).toEqual([]);
  });

  it("Magmablood Archaic: an instant cast with blue and red mana gives your creatures +2/+0 until end of turn", () => {
    const { s: s0, ap, ids } = setup([charm()]);
    const archaic = putOnBattlefield(s0, ap, magma());
    const b = putOnBattlefield(s0, ap, bear());
    const before = power(s0, s0.objects[b]!);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(power(s, s.objects[b]!)).toBe(before + 2);
    expect(power(s, s.objects[archaic]!)).toBe(power(s0, s0.objects[archaic]!) + 2);
  });

  it("Magmablood Archaic: the trigger still counts the colors if that spell has left the stack before it resolves (rulings)", () => {
    const { s: s0, ap, ids } = setup([charm()]);
    putOnBattlefield(s0, ap, magma());
    const b = putOnBattlefield(s0, ap, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    // The trigger waits above the spell; the spell is gone (countered) before it resolves.
    for (let i = 0; i < 20 && s.triggerQueue.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const spell = s.stack.find((x) => x.kind === "spell");
    expect(spell).toBeDefined();
    s.stack = s.stack.filter((x) => x !== spell);
    const o = s.objects[ids[0]!]!;
    o.zone = "graveyard";
    o.zoneChanges = (o.zoneChanges ?? 0) + 1;
    s.players[ap]!.graveyard.push(o.id);
    invalidateCharacteristics(s);
    s = settle(s);
    expect(power(s, s.objects[b]!)).toBe(4);
  });

  it("Mob Mentality: when all your non-Wall creatures attack (Walls may stay home), enchanted creature gets +X/+0, X the attacking creatures", () => {
    const { s: s0, ap } = setup([]);
    const [o1] = others(s0, ap);
    s0.players[ap]!.hand = [];
    const a = putOnBattlefield(s0, ap, beast("Beast A", 2));
    const b = putOnBattlefield(s0, ap, beast("Beast B", 2));
    putOnBattlefield(s0, ap, wall());
    const aura = putOnBattlefield(s0, ap, mob());
    s0.objects[aura]!.attachedTo = a;
    invalidateCharacteristics(s0);
    expect(kw(s0, a, "Trample")).toBe(true);
    let s = goUntil(s0, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [a, b].map((x) => ({ attacker: x, defender: o1! })) }));
    expect(power(s, s.objects[a]!)).toBe(4);
    expect(power(s, s.objects[b]!)).toBe(2);
  });

  it("Mob Mentality: no trigger if a non-Wall creature you control doesn't attack, even one that couldn't", () => {
    const { s: s0, ap } = setup([]);
    const [o1] = others(s0, ap);
    s0.players[ap]!.hand = [];
    const a = putOnBattlefield(s0, ap, beast("Beast A", 2));
    putOnBattlefield(s0, ap, beast("Beast B", 2), { sick: true });
    const aura = putOnBattlefield(s0, ap, mob());
    s0.objects[aura]!.attachedTo = a;
    invalidateCharacteristics(s0);
    let s = goUntil(s0, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: o1! }] }));
    expect(power(s, s.objects[a]!)).toBe(2);
  });

  it("The Crowd Goes Wild: support X puts a counter on each of up to X target creatures; each creature with a +1/+1 counter then gains trample until end of turn (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([crowd()]);
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, beast("Test Beast", 3));
    const had = putOnBattlefield(s0, ap, beast("Countered Beast", 2));
    s0.objects[had]!.counters = { "+1/+1": 1 };
    const plain = putOnBattlefield(s0, ap, beast("Plain Beast", 2));
    // Too many targets for X = 2.
    expect(planCast(s0, ap, ids[0]!, [tgt(mine), tgt(theirs), tgt(plain)], undefined, "auto", 2)).toBeNull();
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(mine), tgt(theirs)], undefined, "auto", 2)));
    expect([mine, theirs].map((id) => s.objects[id]!.counters["+1/+1"])).toEqual([1, 1]);
    expect([mine, theirs, had].every((id) => kw(s, id, "Trample"))).toBe(true);
    expect(kw(s, plain, "Trample")).toBe(false);
    // A counter put on later doesn't give trample (rulings).
    s.objects[plain]!.counters = { "+1/+1": 1 };
    invalidateCharacteristics(s);
    expect(kw(s, plain, "Trample")).toBe(false);
  });

  it("The Crowd Goes Wild with X = 0: no targets, creatures with +1/+1 counters still gain trample (rulings)", () => {
    const { s: s0, ap, ids } = setup([crowd()]);
    const had = putOnBattlefield(s0, ap, beast("Countered Beast", 2));
    s0.objects[had]!.counters = { "+1/+1": 1 };
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [], undefined, "auto", 0)));
    expect(kw(s, had, "Trample")).toBe(true);
  });

  const breakSetup = () => {
    const { s: s0, ap, ids } = setup([breakOut()]);
    const cheap = toZone(s0, ap, card("Cheap Beast", "Creature — Beast", "{1}{G}", { power: "2", toughness: "2", colors: ["G"] }), "library");
    const big = toZone(s0, ap, card("Big Beast", "Creature — Beast", "{2}{G}", { power: "3", toughness: "3", colors: ["G"] }), "library");
    const fillers = [1, 2, 3, 4].map((i) => toZone(s0, ap, card(`Filler ${i}`, "Sorcery", "{1}", { oracleText: "Draw a card." }), "library"));
    return { s0, ap, ids, cheap, big, fillers };
  };

  it("Break Out: a creature card with mana value 2 or less may go onto the battlefield with haste; the rest go to the bottom", () => {
    const { s0, ap, ids, cheap, big, fillers } = breakSetup();
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const offered = s.pending?.kind === "searchLibrary" ? s.pending.cards : [];
    expect(offered).toEqual(expect.arrayContaining([cheap, big]));
    s = act(s, { type: "searchLibrary", player: ap, found: [cheap] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "either", labels: ["Put Cheap Beast onto the battlefield", "Put Cheap Beast into your hand"] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "0" }));
    expect(s.objects[cheap]!.zone).toBe("battlefield");
    expect(kw(s, cheap, "Haste")).toBe(true);
    const lib = s.players[ap]!.library;
    expect(lib.slice(-5).sort()).toEqual([big, ...fillers].sort());
  });

  it("Break Out: the same card may go into your hand instead", () => {
    const { s0, ap, ids, cheap } = breakSetup();
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = act(s, { type: "searchLibrary", player: ap, found: [cheap] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "1" }));
    expect(s.objects[cheap]!.zone).toBe("hand");
  });

  it("Break Out: a creature card with mana value 3 goes into your hand, no choice", () => {
    const { s0, ap, ids, big } = breakSetup();
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [big] }));
    expect(s.pending).toBeNull();
    expect(s.objects[big]!.zone).toBe("hand");
  });

  it("Break Out: a bot puts a cheap creature onto the battlefield", () => {
    const { s0, ap, ids, cheap } = breakSetup();
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = act(s, { type: "searchLibrary", player: ap, found: [cheap] });
    s = settle(run(s, botActions(s, ap)));
    expect(s.objects[cheap]!.zone).toBe("battlefield");
  });

  it("Touch of Moonglove: +1/+0 and deathtouch; each creature it dealt damage to that dies this turn costs its controller 2 life (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([moonglove(), bite(), murder()]);
    const [, o2] = others(s0, ap);
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, beast("Big Beast", 6));
    const other = putOnBattlefield(s0, o2!, beast("Other Beast", 2));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(mine)])));
    expect(power(s, s.objects[mine]!)).toBe(3);
    expect(kw(s, mine, "Deathtouch")).toBe(true);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(mine), tgt(theirs)])));
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    // Its controller loses 2, not Moonglove's caster.
    expect(s.players[opp]!.life).toBe(38);
    expect(s.players[ap]!.life).toBe(40);
    // A creature it didn't damage dying costs nothing.
    s = settle(run(s, planCast(s, ap, ids[2]!, [tgt(other)])));
    expect(s.objects[other]!.zone).toBe("graveyard");
    expect(s.players[o2!]!.life).toBe(40);
    expect(s.players[opp]!.life).toBe(38);
  });
});
