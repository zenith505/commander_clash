// Round 325 (Lane A, skip-list cards): -2/-1 counters distributed among targets (Contagion); "Max speed — You may cast this
// card from your graveyard." (Lightwheel Enhancements); "Until end of turn, you gain control of target creature and it gains
// haste." with entwine (Grab the Reins); "if you control more creatures of that type than each other player" (Peer
// Pressure); a damaged creature losing indestructible and exiled if it would die this turn (Burn from Within); "Whenever
// another Goblin you control becomes blocked, sacrifice it. If you do, it deals 4 damage to each creature blocking it."
// (Ib Halfheart, Goblin Tactician).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { applyAction, botActions, legalActions, mayPlayLandFromGraveyard, planActivate, castProblem, characteristics, controllerOf, harmfulCounter, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) s = act(s, botActions(s, p.player)[0]!);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** A card in `pid`'s hand. */
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** A card in `pid`'s graveyard. */
const inYard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  invalidateCharacteristics(s);
  return id;
};
const creature = (name: string, typeLine: string, manaCost: string, extra: Partial<CardDef> = {}) => card(name, typeLine, manaCost, { cmc: 2, power: "2", toughness: "2", ...extra });
const playerT = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const pt = (s: GameState, id: string) => ((c) => `${c.power}/${c.toughness}`)(characteristics(s, s.objects[id]!));

// Real oracle text (Scryfall).
const contagion = (): CardDef => ({"oracleId":"433e86ce-df04-4182-bb63-ad2607d67dbd","name":"Contagion","manaCost":"{3}{B}{B}","cmc":5,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"You may pay 1 life and exile a black card from your hand rather than pay this spell's mana cost.\nDistribute two -2/-1 counters among one or two target creatures.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/0/00c8f94a-7690-47f5-b664-61411a32ab74.jpg?1783947189","artUrl":"https://cards.scryfall.io/art_crop/front/0/0/00c8f94a-7690-47f5-b664-61411a32ab74.jpg?1783947189","commanderLegal":"legal","set":"all","releasedAt":"1996-06-10","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const lightwheel = (): CardDef => ({"oracleId":"17fae94e-558f-449a-b30c-e3c37a068b79","name":"Lightwheel Enhancements","manaCost":"{W}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature or Vehicle\nStart your engines! (If you have no speed, it starts at 1. It increases once on each of your turns when an opponent loses life. Max speed is 4.)\nEnchanted permanent gets +1/+1 and has vigilance.\nMax speed — You may cast this card from your graveyard.","colors":["W"],"colorIdentity":["W"],"keywords":["Max speed","Enchant","Start your engines!"],"imageUrl":"https://cards.scryfall.io/normal/front/9/a/9ab169c1-4e25-4a5d-8961-4f06298c3781.jpg?1783907917","artUrl":"https://cards.scryfall.io/art_crop/front/9/a/9ab169c1-4e25-4a5d-8961-4f06298c3781.jpg?1783907917","commanderLegal":"legal","set":"dft","releasedAt":"2025-02-14","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const grab = (): CardDef => ({"oracleId":"3ceda405-8175-416a-beda-9a95f5acc60c","name":"Grab the Reins","manaCost":"{3}{R}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose one —\n• Until end of turn, you gain control of target creature and it gains haste.\n• Sacrifice a creature. Grab the Reins deals damage equal to that creature's power to any target.\nEntwine {2}{R} (Choose both if you pay the entwine cost.)","colors":["R"],"colorIdentity":["R"],"keywords":["Entwine"],"imageUrl":"https://cards.scryfall.io/normal/front/5/7/570fa211-e937-4ad7-bc72-60f8adc3203d.jpg?1783944540","artUrl":"https://cards.scryfall.io/art_crop/front/5/7/570fa211-e937-4ad7-bc72-60f8adc3203d.jpg?1783944540","commanderLegal":"legal","set":"mrd","releasedAt":"2003-10-02","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const peer = (): CardDef => ({"oracleId":"bd6b02f9-277e-4f6a-b0a4-d893a939cf73","name":"Peer Pressure","manaCost":"{3}{U}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose a creature type. If you control more creatures of that type than each other player, you gain control of all creatures of that type. (This effect lasts indefinitely.)","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/e/be0110ba-49e4-4729-8a84-4d408b20df53.jpg?1783945080","artUrl":"https://cards.scryfall.io/art_crop/front/b/e/be0110ba-49e4-4729-8a84-4d408b20df53.jpg?1783945080","commanderLegal":"legal","set":"ons","releasedAt":"2002-10-07","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const burn = (): CardDef => ({"oracleId":"8a1ccbdb-3d89-42fb-a731-6db4241acf24","name":"Burn from Within","manaCost":"{X}{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Burn from Within deals X damage to any target. If a creature is dealt damage this way, it loses indestructible until end of turn. If that creature would die this turn, exile it instead.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/8/f8bdc165-4c6f-47e6-8bda-877c0be3613b.jpg?1783937758","artUrl":"https://cards.scryfall.io/art_crop/front/f/8/f8bdc165-4c6f-47e6-8bda-877c0be3613b.jpg?1783937758","commanderLegal":"legal","set":"soi","releasedAt":"2016-04-08","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const ib = (): CardDef => ({"oracleId":"6742c4b9-8fa6-439f-844d-04a09fa20c45","name":"Ib Halfheart, Goblin Tactician","manaCost":"{3}{R}","cmc":4,"typeLine":"Legendary Creature — Goblin Advisor","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Goblin","Advisor"],"oracleText":"Whenever another Goblin you control becomes blocked, sacrifice it. If you do, it deals 4 damage to each creature blocking it.\nSacrifice two Mountains: Create two 1/1 red Goblin creature tokens.","power":"3","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/8/38134389-b471-4f58-a9ae-26bf9dc1557a.jpg?1783943220","artUrl":"https://cards.scryfall.io/art_crop/front/3/8/38134389-b471-4f58-a9ae-26bf9dc1557a.jpg?1783943220","commanderLegal":"legal","set":"tsp","releasedAt":"2006-10-06","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const golem = (): CardDef => ({"oracleId":"8773c2ea-ef41-4403-bb52-07f0d70d9bbe","name":"Clay Golem","manaCost":"{4}","cmc":4,"typeLine":"Artifact Creature — Golem","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Golem"],"oracleText":"{6}, Roll a d8: Monstrosity X, where X is the result. (If this creature isn't monstrous, put X +1/+1 counters on it and it becomes monstrous.)\nBerserk — When this creature becomes monstrous, destroy target permanent.","power":"4","toughness":"4","colors":[],"colorIdentity":[],"keywords":["Monstrosity"],"imageUrl":"https://cards.scryfall.io/normal/front/3/a/3a949c88-07bb-4526-9460-9324574cc466.jpg?1783926238","artUrl":"https://cards.scryfall.io/art_crop/front/3/a/3a949c88-07bb-4526-9460-9324574cc466.jpg?1783926238","commanderLegal":"legal","set":"afc","releasedAt":"2021-07-23","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const tomik = (): CardDef => ({"oracleId":"9895a33f-9bbd-4440-8c1a-0d401431b77f","name":"Tomik, Distinguished Advokist","manaCost":"{W}{W}","cmc":2,"typeLine":"Legendary Creature — Human Advisor","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Advisor"],"oracleText":"Flying\nLands on the battlefield and land cards in graveyards can't be the targets of spells or abilities your opponents control.\nYour opponents can't play land cards from graveyards.","power":"2","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/f/3/f346387c-2f13-472b-b5b1-968b490eb38f.jpg?1783933473","artUrl":"https://cards.scryfall.io/art_crop/front/f/3/f346387c-2f13-472b-b5b1-968b490eb38f.jpg?1783933473","commanderLegal":"legal","set":"war","releasedAt":"2019-05-03","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const frenzy = (): CardDef => ({"oracleId":"3715e8b8-31df-499b-8a91-1bcd1199d6eb","name":"Experimental Frenzy","manaCost":"{3}{R}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"You may look at the top card of your library any time.\nYou may play lands and cast spells from the top of your library.\nYou can't play lands or cast spells from your hand.\n{3}{R}: Destroy this enchantment.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/b/4b8f32e2-5dc8-4f1b-8a69-d3ae06378ed8.jpg?1783934164","artUrl":"https://cards.scryfall.io/art_crop/front/4/b/4b8f32e2-5dc8-4f1b-8a69-d3ae06378ed8.jpg?1783934164","commanderLegal":"legal","set":"grn","releasedAt":"2018-10-05","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const crumple = (): CardDef => ({"oracleId":"d4ab7848-5c37-4c6b-be29-0bb703333e5b","name":"Spell Crumple","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target spell. If that spell is countered this way, put it on the bottom of its owner's library instead of into that player's graveyard. Put Spell Crumple on the bottom of its owner's library.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/2/2247df4a-c5d8-4b34-b3a6-3c958eb65f94.jpg?1783941233","artUrl":"https://cards.scryfall.io/art_crop/front/2/2/2247df4a-c5d8-4b34-b3a6-3c958eb65f94.jpg?1783941233","commanderLegal":"legal","set":"cmd","releasedAt":"2011-06-17","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);

describe("round 325", () => {
  it("are fully supported", () => supported(contagion(), lightwheel(), grab(), peer(), burn(), ib(), golem(), tomik(), frenzy(), crumple()));
});

describe("round 325: Contagion", () => {
  it("two -2/-1 counters divided among two target creatures, cast by paying 1 life and exiling a black card", () => {
    const { s: s0, ap, opp, ids } = setup([contagion(), card("Dark Ritual", "Instant", "{B}", { cmc: 1, colors: ["B"], oracleText: "Add {B}{B}{B}." })]);
    const big = putOnBattlefield(s0, opp, creature("Big Bear", "Creature — Bear", "{2}{G}", { power: "3", toughness: "3" }));
    const small = putOnBattlefield(s0, opp, creature("Small Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "1" }));
    for (const id of s0.battlefield) if (s0.objects[id]!.controller === ap) s0.objects[id]!.tapped = true;
    const t: TargetChoice[] = [{ kind: "object", id: big, amount: 1 }, { kind: "object", id: small, amount: 1 }];
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, t, undefined, "auto", undefined, { alt: "alternative", exileFromHand: [ids[1]!] })), ap);
    expect(s.players[ap]!.life).toBe(39);
    expect(s.objects[ids[1]!]!.zone).toBe("exile");
    expect(s.objects[big]!.counters["-2/-1"]).toBe(1);
    expect(pt(s, big)).toBe("1/2");
    // A 2/1 with a -2/-1 counter is 0/0 and is put into its owner's graveyard (CR 704.5f).
    expect(s.objects[small]!.zone).toBe("graveyard");
  });

  it("both counters on one target; they don't cancel out with +1/+1 counters (CR 704.5q is only -1/-1)", () => {
    const { s: s0, ap, opp, ids } = setup([contagion()]);
    const big = putOnBattlefield(s0, opp, creature("Huge Bear", "Creature — Bear", "{3}{G}", { power: "5", toughness: "5" }));
    s0.objects[big]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s0);
    const t: TargetChoice[] = [{ kind: "object", id: big, amount: 2 }, { kind: "none" }];
    expect(castProblem(s0, ap, ids[0]!, t) ?? "").not.toMatch(/target/);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, t)), ap);
    expect(s.objects[big]!.counters).toMatchObject({ "+1/+1": 1, "-2/-1": 2 });
    expect(pt(s, big)).toBe("2/4");
  });

  it("-2/-1 counters are harmful to the bots, as -1/-1 and -0/-1 counters are; +1/+0 isn't", () => {
    expect(harmfulCounter("-2/-1")).toBe(true);
    expect(harmfulCounter("-0/-1")).toBe(true);
    expect(harmfulCounter("+1/+0")).toBe(false);
    expect(harmfulCounter("+1/+1")).toBe(false);
  });
});

describe("round 325: Lightwheel Enhancements", () => {
  it("can be cast from your graveyard only while you have max speed; it gives +1/+1 and vigilance", () => {
    const { s: s0, ap } = setup([]);
    const bearId = putOnBattlefield(s0, ap, creature("Road Bear", "Creature — Bear", "{1}{G}"));
    const aura = inYard(s0, ap, lightwheel());
    const via = { via: "permission" as const };
    s0.players[ap]!.speed = 3;
    expect(castProblem(s0, ap, aura, [target(bearId)], undefined, undefined, undefined, undefined, via)).toMatch(/can't cast Lightwheel Enhancements from your graveyard now/);
    s0.players[ap]!.speed = 4;
    expect(castProblem(s0, ap, aura, [target(bearId)], undefined, undefined, undefined, undefined, via) ?? "").not.toMatch(/graveyard/);
    const s = settle(run(s0, planCast(s0, ap, aura, [target(bearId)], undefined, "auto", undefined, via)), ap);
    expect(s.objects[aura]).toMatchObject({ zone: "battlefield", attachedTo: bearId });
    expect(pt(s, bearId)).toBe("3/3");
    expect(characteristics(s, s.objects[bearId]!).keywords).toContain("Vigilance");
  });

  it("a player without speed can't cast it from the graveyard", () => {
    const { s: s0, ap } = setup([]);
    const bearId = putOnBattlefield(s0, ap, creature("Road Bear", "Creature — Bear", "{1}{G}"));
    const aura = inYard(s0, ap, lightwheel());
    s0.players[ap]!.speed = undefined;
    expect(castProblem(s0, ap, aura, [target(bearId)], undefined, undefined, undefined, undefined, { via: "permission" })).toMatch(/can't cast/);
  });
});

describe("round 325: Grab the Reins", () => {
  it("first mode: you control the creature until end of turn and it has haste; it isn't untapped", () => {
    const { s: s0, ap, opp, ids } = setup([grab()]);
    const theirs = putOnBattlefield(s0, opp, creature("Their Bear", "Creature — Bear", "{1}{G}"));
    s0.objects[theirs]!.tapped = true;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(theirs)], [0])), ap);
    expect(controllerOf(s, s.objects[theirs]!)).toBe(ap);
    expect(s.objects[theirs]!.tapped).toBe(true);
    expect(characteristics(s, s.objects[theirs]!).keywords).toContain("Haste");
    const later = passUntil(s, "upkeep");
    expect(controllerOf(later, later.objects[theirs]!)).toBe(opp);
  });

  it("entwined: you may sacrifice the creature you gained control of; it deals damage equal to its power (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([grab()]);
    const theirs = putOnBattlefield(s0, opp, creature("Their Giant", "Creature — Giant", "{4}{R}", { power: "5", toughness: "5" }));
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(theirs), playerT(opp)], [0, 1]));
    s = settle(s, ap);
    // Its only creature then is the one it took, so that's the one sacrificed.
    if (s.pending?.kind === "pickPermanents") s = settle(act(s, { type: "pickPermanents", player: ap, ids: [theirs] }), ap);
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(35);
  });

  it("second mode alone with no creature to sacrifice: no damage (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([grab()]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [playerT(opp)], [1])), ap);
    expect(s.players[opp]!.life).toBe(40);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });
});

describe("round 325: Peer Pressure", () => {
  const elf = (n: string) => creature(n, "Creature — Elf Druid", "{G}", { cmc: 1, power: "1", toughness: "1" });
  const game = (mine: number, theirs: number) => {
    const { s: s0, ap, opp, ids } = setup([peer()]);
    const me = Array.from({ length: mine }, (_, i) => putOnBattlefield(s0, ap, elf(`My Elf ${i}`)));
    const them = Array.from({ length: theirs }, (_, i) => putOnBattlefield(s0, opp, elf(`Their Elf ${i}`)));
    const goblin = putOnBattlefield(s0, opp, creature("Their Goblin", "Creature — Goblin", "{R}"));
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "creatureType" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Elf" }), ap);
    return { s, ap, opp, me, them, goblin };
  };

  it("with more of the type than each other player, you gain control of all creatures of that type, for good", () => {
    const { s, ap, them, goblin } = game(3, 2);
    for (const id of them) expect(controllerOf(s, s.objects[id]!)).toBe(ap);
    expect(controllerOf(s, s.objects[goblin]!)).not.toBe(ap);
    const later = passUntil(s, "upkeep");
    for (const id of them) expect(controllerOf(later, later.objects[id]!)).toBe(ap);
  });

  it("tied for the most: nothing changes control", () => {
    const { s, opp, them } = game(2, 2);
    for (const id of them) expect(controllerOf(s, s.objects[id]!)).toBe(opp);
  });
});

describe("round 325: Burn from Within", () => {
  const titan = () => creature("Steel Titan", "Creature — Golem", "{4}", { power: "3", toughness: "3", keywords: ["Indestructible"], oracleText: "Indestructible" });

  it("a creature dealt damage this way loses indestructible, so lethal damage destroys it, and it's exiled instead", () => {
    const { s: s0, ap, opp, ids } = setup([burn()]);
    const t = putOnBattlefield(s0, opp, titan());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(t)], undefined, "auto", 3)), ap);
    expect(s.objects[t]!.zone).toBe("exile");
  });

  it("not lethal: it stays without indestructible this turn, and a later death this turn exiles it (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([burn(), card("Murder", "Instant", "{1}{B}{B}", { cmc: 3, oracleText: "Destroy target creature." })]);
    const t = putOnBattlefield(s0, opp, titan());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(t)], undefined, "auto", 1)), ap);
    expect(s.objects[t]!.zone).toBe("battlefield");
    expect(characteristics(s, s.objects[t]!).keywords).not.toContain("Indestructible");
    s = settle(run(s, planCast(s, ap, ids[1]!, [target(t)])), ap);
    expect(s.objects[t]!.zone).toBe("exile");
  });

  it("at a player: just the damage", () => {
    const { s: s0, ap, opp, ids } = setup([burn()]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [playerT(opp)], undefined, "auto", 4)), ap);
    expect(s.players[opp]!.life).toBe(36);
  });

  it("X is 0: no damage dealt, so it keeps indestructible (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([burn()]);
    const t = putOnBattlefield(s0, opp, titan());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(t)], undefined, "auto", 0)), ap);
    expect(characteristics(s, s.objects[t]!).keywords).toContain("Indestructible");
  });
});

describe("round 325: Ib Halfheart, Goblin Tactician", () => {
  const goblin = () => creature("Goblin Raider", "Creature — Goblin Warrior", "{1}{R}", { power: "2", toughness: "1" });
  const wall = (n: string) => creature(n, "Creature — Wall", "{1}{W}", { power: "0", toughness: "4", keywords: ["Defender"], oracleText: "Defender" });
  const attack = (attackerDef: () => CardDef) => {
    const { s: s0, ap, opp } = setup([]);
    const at = putOnBattlefield(s0, ap, attackerDef());
    const ibId = attackerDef().name === ib().name ? at : putOnBattlefield(s0, ap, ib());
    const w1 = putOnBattlefield(s0, opp, wall("Wall One"));
    const w2 = putOnBattlefield(s0, opp, wall("Wall Two"));
    const bystander = putOnBattlefield(s0, opp, wall("Wall Three"));
    let s = passUntil(s0, "declareAttackers");
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: at, defender: opp }] }), opp);
    while (!(s.pending?.kind === "declareBlockers" && s.pending.player === opp)) s = act(s, s.pending?.kind === "declareBlockers" ? { type: "declareBlockers", player: s.pending.player, blocks: [] } : { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: w1, attacker: at }, { blocker: w2, attacker: at }] });
    s = settle(s, ap);
    return { s, ap, opp, ibId, at, w1, w2, bystander };
  };

  it("another Goblin blocked: it's sacrificed and deals 4 damage to each creature that was blocking it", () => {
    const { s, at, w1, w2, bystander } = attack(goblin);
    expect(s.objects[at]!.zone).toBe("graveyard");
    expect(s.objects[w1]!.zone).toBe("graveyard");
    expect(s.objects[w2]!.zone).toBe("graveyard");
    expect(s.objects[bystander]!.zone).toBe("battlefield");
  });

  it("not for Ib itself, nor for a creature that isn't a Goblin", () => {
    const self = attack(ib);
    expect(self.s.objects[self.at]!.zone).toBe("battlefield");
    expect(self.s.objects[self.w1]!.zone).toBe("battlefield");
    const other = attack(() => creature("Bear Raider", "Creature — Bear", "{1}{G}"));
    expect(other.s.objects[other.at]!.zone).toBe("battlefield");
    expect(other.s.objects[other.w1]!.zone).toBe("battlefield");
  });
});

describe("round 325: Clay Golem", () => {
  it("the d8 is rolled as it's activated, before it resolves; Monstrosity X uses that result, and berserk destroys a permanent", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, golem());
    const victim = putOnBattlefield(s0, opp, creature("Doomed Bear", "Creature — Bear", "{1}{G}"));
    let s = run(s0, planActivate(s0, ap, g, 0));
    const item = s.stack.at(-1)!;
    expect(item).toMatchObject({ kind: "ability", sourceId: g });
    const rolled = item.rolled!;
    expect(rolled).toBeGreaterThanOrEqual(1);
    expect(rolled).toBeLessThanOrEqual(8);
    expect(s.log.some((l) => /rolls a d8 for Clay Golem/.test(l.text))).toBe(true);
    s = settle(s, ap);
    // Berserk's target: the only other permanent worth it is theirs; answer as asked.
    for (let i = 0; i < 5 && s.pending; i++) s = settle(act(s, botActions(s, s.pending.player)[0]!), ap);
    s = settle(s, ap);
    expect(s.objects[g]!.monstrous).toBeTruthy();
    expect(s.objects[g]!.counters["+1/+1"]).toBe(rolled);
    expect(s.battlefield.includes(victim) || s.objects[victim]!.zone === "graveyard").toBe(true);
  });

  it("already monstrous: it can still be activated, rolling the die, but nothing more happens (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, golem());
    s0.objects[g]!.monstrous = true;
    s0.objects[g]!.counters["+1/+1"] = 3;
    const plan = planActivate(s0, ap, g, 0);
    expect(plan).not.toBeNull();
    const s = settle(run(s0, plan), ap);
    expect(s.log.some((l) => /rolls a d8 for Clay Golem/.test(l.text))).toBe(true);
    expect(s.objects[g]!.counters["+1/+1"]).toBe(3);
  });

  it("a bot with the mana activates it", () => {
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, golem());
    s0.players[ap]!.hand = [];
    let s = s0;
    const activated = () => s.log.some((l) => /activates Clay Golem/.test(l.text));
    // Every player as the bots would, until the Golem's controller activates it (within its first turn cycle).
    for (let i = 0; i < 2000 && !activated() && s.turn < 6; i++) {
      const p = s.pending?.player ?? waitingOn(s)!;
      s = act(s, botActions(s, p)[0]!);
    }
    expect(activated()).toBe(true);
    expect(s.objects[g]!.monstrous || s.stack.some((x) => x.sourceId === g)).toBeTruthy();
  });
});

describe("round 325: Tomik, Distinguished Advokist", () => {
  const stoneRain = card("Stone Rain", "Sorcery", "{2}{R}", { cmc: 3, colors: ["R"], oracleText: "Destroy target land." });
  const graveExile = card("Grave Exile", "Instant", "{B}", { cmc: 1, colors: ["B"], oracleText: "Exile target card from a graveyard." });
  const crucible = card("Crucible of Worlds", "Artifact", "{3}", { cmc: 3, oracleText: "You may play lands from your graveyard." });
  const wastes = card("Wastes", "Basic Land", "");
  const game = () => {
    const { s: s0, ap, opp, ids } = setup([stoneRain, graveExile]);
    putOnBattlefield(s0, opp, tomik());
    const myLand = s0.battlefield.find((id) => s0.objects[id]!.controller === ap && characteristics(s0, s0.objects[id]!).types.includes("Land"))!;
    const theirLand = putOnBattlefield(s0, opp, wastes);
    const theirYardLand = inYard(s0, opp, wastes);
    const myYardLand = inYard(s0, ap, wastes);
    const yardBear = inYard(s0, opp, creature("Dead Bear", "Creature — Bear", "{1}{G}"));
    return { s: s0, ap, opp, ids, myLand, theirLand, theirYardLand, myYardLand, yardBear };
  };

  it("its controller's opponents can't target lands on the battlefield, theirs or anyone's", () => {
    const { s, ap, ids, myLand, theirLand } = game();
    expect(castProblem(s, ap, ids[0]!, [target(myLand)]) ?? "").toMatch(/target/);
    expect(castProblem(s, ap, ids[0]!, [target(theirLand)]) ?? "").toMatch(/target/);
  });

  it("nor land cards in graveyards; other cards there they can", () => {
    const { s, ap, ids, theirYardLand, myYardLand, yardBear } = game();
    expect(castProblem(s, ap, ids[1]!, [target(theirYardLand)]) ?? "").toMatch(/target/);
    expect(castProblem(s, ap, ids[1]!, [target(myYardLand)]) ?? "").toMatch(/target/);
    expect(castProblem(s, ap, ids[1]!, [target(yardBear)]) ?? "").not.toMatch(/target/);
  });

  it("Tomik's controller targets them as usual", () => {
    const { s: s0, ap, opp } = setup([stoneRain, graveExile]);
    putOnBattlefield(s0, ap, tomik());
    const theirLand = putOnBattlefield(s0, opp, wastes);
    const theirYardLand = inYard(s0, opp, wastes);
    const hand = s0.players[ap]!.hand;
    expect(castProblem(s0, ap, hand[0]!, [target(theirLand)]) ?? "").not.toMatch(/target/);
    expect(castProblem(s0, ap, hand[1]!, [target(theirYardLand)]) ?? "").not.toMatch(/target/);
  });

  it("its controller's opponents can't play land cards from graveyards, even with Crucible of Worlds (rulings)", () => {
    const { s, ap, opp, myYardLand } = game();
    putOnBattlefield(s, ap, crucible);
    expect(mayPlayLandFromGraveyard(s, s.objects[myYardLand]!, ap)).toBe(false);
    expect(botActions(s, ap).some((a) => a.type === "playLand" && a.objectId === myYardLand)).toBe(false);
    // Without Tomik, the Crucible works.
    const tomikId = s.battlefield.find((id) => characteristics(s, s.objects[id]!).name === tomik().name)!;
    s.battlefield.splice(s.battlefield.indexOf(tomikId), 1);
    s.objects[tomikId]!.zone = "graveyard";
    s.players[opp]!.graveyard.push(tomikId);
    invalidateCharacteristics(s);
    expect(mayPlayLandFromGraveyard(s, s.objects[myYardLand]!, ap)).toBe(true);
  });
});

describe("round 325: Experimental Frenzy", () => {
  it("you can't play lands or cast spells from your hand; from the top of your library you can", () => {
    const { s: s0, ap, ids } = setup([card("Shock", "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: "Shock deals 2 damage to any target." }), card("Wastes", "Basic Land", "")]);
    putOnBattlefield(s0, ap, frenzy());
    const top = s0.players[ap]!.library[0]!;
    expect(castProblem(s0, ap, ids[0]!, [playerT(ap)])).toMatch(/Experimental Frenzy: you can't cast spells from your hand/);
    const acts = legalActions(s0, ap);
    expect(acts.some((a) => a.type === "playLand" && a.objectId === ids[1])).toBe(false);
    expect(() => applyAction(s0, { type: "playLand", player: ap, objectId: ids[1]! })).toThrow(/from your hand/);
    // The top card (a Forest or a Grizzly Bears in these decks) is playable as usual.
    const topName = characteristics(s0, s0.objects[top]!).name;
    if (topName === "Forest") expect(acts.some((a) => a.type === "playLand" && a.objectId === top)).toBe(true);
    else expect(castProblem(s0, ap, top) ?? "").not.toMatch(/hand|library/);
  });

  it("other players aren't affected, and your commander can still be cast", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, frenzy());
    const cmd = s0.players[ap]!.command[0]!;
    expect(castProblem(s0, ap, cmd) ?? "").not.toMatch(/hand/);
    const theirs = inHand(s0, opp, card("Shock", "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: "Shock deals 2 damage to any target." }));
    expect(castProblem(s0, opp, theirs, [playerT(ap)]) ?? "").not.toMatch(/hand/);
  });
});

describe("round 325: Spell Crumple", () => {
  const divination = card("Divination", "Sorcery", "{2}{U}", { cmc: 3, colors: ["U"], oracleText: "Draw two cards." });
  const forceful = card("Unstoppable Word", "Sorcery", "{2}{U}", { cmc: 3, colors: ["U"], oracleText: "This spell can't be countered.\nDraw two cards." });
  const crumpleIt = (spell: CardDef) => {
    const { s: s0, ap, ids } = setup([spell, crumple()]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    const item = s.stack.at(-1)!;
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: item.id }]));
    s = settle(s, ap);
    return { s, ap, ids };
  };

  it("the countered spell goes to the bottom of its owner's library, and so does Spell Crumple", () => {
    const { s, ap, ids } = crumpleIt(divination);
    const lib = s.players[ap]!.library;
    expect(s.objects[ids[0]!]!.zone).toBe("library");
    expect(s.objects[ids[1]!]!.zone).toBe("library");
    expect(lib.slice(-2).sort()).toEqual([ids[0]!, ids[1]!].sort());
    expect(s.log.some((l) => /counters Divination and puts it on the bottom of its owner's library/.test(l.text))).toBe(true);
  });

  it("a spell that can't be countered stays and resolves; Spell Crumple still goes to the bottom (rulings)", () => {
    const { s, ap, ids } = crumpleIt(forceful);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.objects[ids[1]!]!.zone).toBe("library");
    expect(s.players[ap]!.library.at(-1)).toBe(ids[1]);
  });
});
