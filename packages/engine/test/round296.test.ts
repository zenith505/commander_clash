// Round 296: harder cards from the "Out after round N" lists, most played first.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { dealDamage, objectSource } from "../src/damage";
import { applyAction, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes priority until the stack and the trigger queue are empty or someone is asked something. */
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && !s.pending && (s.stack.length || s.triggerQueue.length || i === 0); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Puts `pid`'s hand down to `n` cards (the rest on top of the library), so the cleanup step doesn't discard. */
const trimHand = (s: GameState, pid: PlayerId, n: number) => {
  for (const id of s.players[pid]!.hand.splice(n)) { s.objects[id]!.zone = "library"; s.players[pid]!.library.unshift(id); }
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const none: TargetChoice = { kind: "none" };
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
/** A fresh copy of `def` in `pid`'s `where` (the top of the library). */
const put = (s: GameState, pid: PlayerId, def: CardDef, where: "library" | "hand" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
const cast = (s: GameState, pid: PlayerId, id: string, targets?: TargetChoice[]) => settle(run(s, planCast(s, pid, id, targets)));

// Real oracle text (Scryfall).
const tablet = (): CardDef => ({"oracleId":"71ce7034-1400-4e7c-9ef3-37baed669faf","name":"Tablet of the Guilds","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"As this artifact enters, choose two colors.\nWhenever you cast a spell, if it's at least one of the chosen colors, you gain 1 life for each of the chosen colors it is.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/b/6b006384-6fb6-4129-b1d2-7674d1141f8f.jpg?1783940323","artUrl":"https://cards.scryfall.io/art_crop/front/6/b/6b006384-6fb6-4129-b1d2-7674d1141f8f.jpg?1783940323","commanderLegal":"legal","set":"rtr","releasedAt":"2012-10-05","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const myth = (): CardDef => ({"oracleId":"83e047ac-aaa9-4bd8-9ea0-49761d39139c","name":"Myth Unbound","manaCost":"{2}{G}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Your commander costs {1} less to cast for each time it's been cast from the command zone this game.\nWhenever your commander is put into the command zone from anywhere, draw a card.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/8/b88ca71b-de1f-497c-b094-8fe954cf8223.jpg?1783934333","artUrl":"https://cards.scryfall.io/art_crop/front/b/8/b88ca71b-de1f-497c-b094-8fe954cf8223.jpg?1783934333","commanderLegal":"legal","set":"c18","releasedAt":"2018-08-10","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const gideon = (): CardDef => ({"oracleId":"813c19f5-3580-488d-9eee-c7a563def532","name":"Gideon Blackblade","manaCost":"{1}{W}{W}","cmc":3,"typeLine":"Legendary Planeswalker — Gideon","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Gideon"],"oracleText":"During your turn, Gideon Blackblade is a 4/4 Human Soldier creature with indestructible that's still a planeswalker.\nPrevent all damage that would be dealt to Gideon Blackblade during your turn.\n+1: Up to one other target creature you control gains your choice of vigilance, lifelink, or indestructible until end of turn.\n−6: Exile target nonland permanent.","loyalty":"4","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/d/2d82cf3e-b29f-4eb1-a58f-dadddc6d7ec2.jpg?1783931619","artUrl":"https://cards.scryfall.io/art_crop/front/2/d/2d82cf3e-b29f-4eb1-a58f-dadddc6d7ec2.jpg?1783931619","commanderLegal":"legal","set":"sld","releasedAt":"2019-12-16","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const jared = (): CardDef => ({"oracleId":"f9485c76-122d-4faf-9194-b84ed9c41378","name":"Jared Carthalion","manaCost":"{W}{U}{B}{R}{G}","cmc":5,"typeLine":"Legendary Planeswalker — Jared","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Jared"],"oracleText":"+1: Create a 3/3 Kavu creature token with trample that's all colors.\n−3: Choose up to two target creatures. For each of them, put a number of +1/+1 counters on it equal to the number of colors it is.\n−6: Return target multicolored card from your graveyard to your hand. If that card was all colors, draw a card and create two Treasure tokens.\nJared Carthalion can be your commander.","loyalty":"5","colors":["B","G","R","U","W"],"colorIdentity":["B","G","R","U","W"],"keywords":["Treasure"],"imageUrl":"https://cards.scryfall.io/normal/front/5/a/5acffa48-9e3f-4ba3-a55f-d459307f46df.jpg?1783921476","artUrl":"https://cards.scryfall.io/art_crop/front/5/a/5acffa48-9e3f-4ba3-a55f-d459307f46df.jpg?1783921476","commanderLegal":"legal","set":"dmc","releasedAt":"2022-09-09","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const riddler = (): CardDef => ({"oracleId":"58582fac-4c42-4a1c-9ab1-4a892b500da4","name":"Quantum Riddler","manaCost":"{3}{U}{U}","cmc":5,"typeLine":"Creature — Sphinx","supertypes":[],"types":["Creature"],"subtypes":["Sphinx"],"oracleText":"Flying\nWhen this creature enters, draw a card.\nAs long as you have one or fewer cards in hand, if you would draw one or more cards, you draw that many cards plus one instead.\nWarp {1}{U}","power":"4","toughness":"6","colors":["U"],"colorIdentity":["U"],"keywords":["Flying","Warp"],"imageUrl":"https://cards.scryfall.io/normal/front/1/2/120be808-ff3b-4fca-96a1-4db6b9825856.jpg?1783905977","artUrl":"https://cards.scryfall.io/art_crop/front/1/2/120be808-ff3b-4fca-96a1-4db6b9825856.jpg?1783905977","commanderLegal":"legal","set":"eoe","releasedAt":"2025-08-01","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const spry = (): CardDef => ({"oracleId":"04cc9177-1ffc-4ac8-a64d-7995b4f33d23","name":"Spry and Mighty","manaCost":"{4}{G}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose exactly two creatures you control. You draw X cards and the chosen creatures get +X/+X and gain trample until end of turn, where X is the difference between the chosen creatures' powers.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/5/152b7374-e991-443f-b6ca-914415635c4a.jpg?1783904420","artUrl":"https://cards.scryfall.io/art_crop/front/1/5/152b7374-e991-443f-b6ca-914415635c4a.jpg?1783904420","commanderLegal":"legal","set":"ecl","releasedAt":"2026-01-23","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const approach = (): CardDef => ({"oracleId":"47e191f7-6314-4875-b5ee-57e5daf089c4","name":"Dragon's Approach","manaCost":"{2}{R}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Dragon's Approach deals 3 damage to each opponent. You may exile this spell and four cards named Dragon's Approach from your graveyard. If you do, search your library for a Dragon creature card, put it onto the battlefield, then shuffle.\nA deck can have any number of cards named Dragon's Approach.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/c/0cb504a0-1dfb-49d0-84c3-7bd318d55481.jpg?1783927356","artUrl":"https://cards.scryfall.io/art_crop/front/0/c/0cb504a0-1dfb-49d0-84c3-7bd318d55481.jpg?1783927356","commanderLegal":"legal","set":"stx","releasedAt":"2021-04-23","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const toolkit = (): CardDef => ({"oracleId":"a87abe7a-fee9-45fd-b3d8-896e43ed6b3c","name":"Agent's Toolkit","manaCost":"{1}{G}{U}","cmc":3,"typeLine":"Artifact — Clue","supertypes":[],"types":["Artifact"],"subtypes":["Clue"],"oracleText":"This artifact enters with a +1/+1 counter, a flying counter, a deathtouch counter, and a shield counter on it. (If it would be dealt damage or destroyed, remove a shield counter from it instead.)\nWhenever a creature you control enters, you may move a counter from this artifact onto that creature.\n{2}, Sacrifice this artifact: Draw a card.","colors":["G","U"],"colorIdentity":["G","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/9/4958486a-0f02-4312-8b3f-fb90e54d332c.jpg?1783923307","artUrl":"https://cards.scryfall.io/art_crop/front/4/9/4958486a-0f02-4312-8b3f-fb90e54d332c.jpg?1783923307","commanderLegal":"legal","set":"ncc","releasedAt":"2022-04-29","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const courier = (): CardDef => ({"oracleId":"a01746f3-8e6f-47ce-a95b-e44556d1f73e","name":"Aven Courier","manaCost":"{1}{U}","cmc":2,"typeLine":"Creature — Bird Advisor","supertypes":[],"types":["Creature"],"subtypes":["Bird","Advisor"],"oracleText":"Flying\nWhenever this creature attacks, choose a counter on a permanent you control. Put a counter of that kind on target permanent you control if it doesn't have a counter of that kind on it.","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/f/4/f462456a-21eb-4da3-accd-dc89b73215c2.jpg?1783923328","artUrl":"https://cards.scryfall.io/art_crop/front/f/4/f462456a-21eb-4da3-accd-dc89b73215c2.jpg?1783923328","commanderLegal":"legal","set":"ncc","releasedAt":"2022-04-29","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const stairwell = (): CardDef => ({"oracleId":"9aaf1149-eccb-434a-a1a7-14b93fa50141","name":"Tombstone Stairwell","manaCost":"{2}{B}{B}","cmc":4,"typeLine":"World Enchantment","supertypes":["World"],"types":["Enchantment"],"subtypes":[],"oracleText":"Cumulative upkeep {1}{B} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nAt the beginning of each upkeep, if this enchantment is on the battlefield, each player creates a 2/2 black Zombie creature token with haste named Tombspawn for each creature card in their graveyard.\nAt the beginning of each end step and when this enchantment leaves the battlefield, destroy all tokens created with this enchantment. They can't be regenerated.","colors":["B"],"colorIdentity":["B"],"keywords":["Cumulative upkeep"],"imageUrl":"https://cards.scryfall.io/normal/front/f/8/f8fe2f99-7ec2-490c-8ec3-aa2fb4680826.jpg?1783947085","artUrl":"https://cards.scryfall.io/art_crop/front/f/8/f8fe2f99-7ec2-490c-8ec3-aa2fb4680826.jpg?1783947085","commanderLegal":"legal","set":"mir","releasedAt":"1996-10-08","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);

describe("Tablet of the Guilds: two colors chosen as it enters, then life for each chosen color a spell you cast is", () => {
  it("asks for two different colors, then gains 1 life for each of them the spell is; a spell of neither doesn't trigger", () => {
    supported(tablet());
    const { s: s0, ap, ids } = setup([tablet(), card("Test Azorius", "Instant", "{W}{U}"), card("Test Paladin", "Instant", "{W}"), card("Test Shock", "Instant", "{R}")]);
    let s = cast(s0, ap, ids[0]!);
    expect(s.pending?.kind).toBe("chooseOption");
    s = act(s, { type: "chooseOption", player: ap, choice: "White" });
    expect(s.pending?.kind).toBe("chooseOption");
    const second = s.pending as Extract<GameState["pending"], { kind: "chooseOption" }>;
    expect(second.options).not.toContain("White");
    expect(second.options).toContain("Blue");
    s = act(s, { type: "chooseOption", player: ap, choice: "Blue" });
    expect(waitingOn(s)).toBe(ap);
    expect(s.objects[ids[0]!]!.chosen?.colors).toEqual(["W", "U"]);
    const life = () => s.players[ap]!.life;
    let before = life();
    s = cast(s, ap, ids[1]!);
    expect(life() - before).toBe(2);
    before = life();
    s = cast(s, ap, ids[2]!);
    expect(life() - before).toBe(1);
    before = life();
    s = cast(s, ap, ids[3]!);
    expect(life() - before).toBe(0);
    expect(s.log.some((l) => /Test Shock/.test(l.text) && /gains/.test(l.text))).toBe(false);
  });
});

describe("Myth Unbound: your commander costs {1} less for each previous cast, and you draw when it goes to the command zone", () => {
  it("cuts {1} for each time it was cast from the command zone: {1}{G} with tax {4} costs {3}{G}", () => {
    supported(myth());
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, myth());
    // No lands: only the mana in the pool.
    s0.battlefield = s0.battlefield.filter((id) => !characteristics(s0, s0.objects[id]!).types.includes("Land"));
    invalidateCharacteristics(s0);
    const cmd = s0.players[ap]!.command[0]!;
    s0.players[ap]!.commanderCasts[cmd] = 2;
    s0.players[ap]!.manaPool = { ...s0.players[ap]!.manaPool, G: 1, C: 2 };
    expect(planCast(s0, ap, cmd)).toBeNull();
    s0.players[ap]!.manaPool = { ...s0.players[ap]!.manaPool, G: 1, C: 3 };
    const s = settle(run(s0, planCast(s0, ap, cmd)));
    expect(zone(s, cmd)).toBe("battlefield");
    expect(s.players[ap]!.commanderCasts[cmd]).toBe(3);
  });
  it("another player's commander doesn't cost less", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, myth());
    const theirs = s0.players[opp]!.command[0]!;
    s0.players[opp]!.commanderCasts[theirs] = 1;
    // Their commander costs {1}{G} plus {2} tax: three mana isn't enough.
    s0.players[opp]!.manaPool = { ...s0.players[opp]!.manaPool, G: 1, C: 2 };
    s0.activePlayer = opp;
    s0.priority = opp;
    expect(planCast(s0, opp, theirs)).toBeNull();
  });
  it("draws a card when your commander dies and goes to the command zone; another player's commander doesn't count", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, myth());
    const mine = putOnBattlefield(s0, ap, card("Test General", "Legendary Creature — Elf", "{1}{G}", { power: "2", toughness: "2" }), { commander: true });
    const theirs = putOnBattlefield(s0, opp, card("Test Rival", "Legendary Creature — Elf", "{1}{G}", { power: "2", toughness: "2" }), { commander: true });
    const hand = s0.players[ap]!.hand.length;
    dealDamage(s0, objectSource(s0, s0.objects[mine]!), { object: s0.objects[theirs]! }, 2);
    let s = settle(act(s0, { type: "passPriority", player: waitingOn(s0)! }));
    expect(zone(s, theirs)).toBe("command");
    expect(s.players[ap]!.hand.length).toBe(hand);
    dealDamage(s, objectSource(s, s.objects[theirs] ?? s.objects[mine]!), { object: s.objects[mine]! }, 2);
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(zone(s, mine)).toBe("command");
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });
});

describe("Gideon Blackblade: a 4/4 indestructible creature during your turn, and damage to him is prevented then", () => {
  it("is a Human Soldier creature planeswalker with indestructible on your turn, and only a planeswalker on others'", () => {
    supported(gideon());
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, gideon());
    s0.objects[g]!.counters.loyalty = 4;
    invalidateCharacteristics(s0);
    const c = characteristics(s0, s0.objects[g]!);
    expect(c.types).toEqual(expect.arrayContaining(["Creature", "Planeswalker"]));
    expect(c.subtypes).toEqual(expect.arrayContaining(["Human", "Soldier", "Gideon"]));
    expect([c.power, c.toughness]).toEqual([4, 4]);
    expect(objHasKeyword(s0, s0.objects[g]!, "Indestructible")).toBe(true);
    // Damage on your turn is prevented: no loyalty lost, no damage marked.
    const b = putOnBattlefield(s0, opp, bear());
    dealDamage(s0, objectSource(s0, s0.objects[b]!), { object: s0.objects[g]! }, 3);
    expect(s0.objects[g]!.counters.loyalty).toBe(4);
    expect(s0.objects[g]!.damage).toBe(0);
    // On the next player's turn he's only a planeswalker, and damage removes loyalty.
    const s = passUntil(s0, "main1", opp);
    const c2 = characteristics(s, s.objects[g]!);
    expect(c2.types).not.toContain("Creature");
    expect(objHasKeyword(s, s.objects[g]!, "Indestructible")).toBe(false);
    dealDamage(s, objectSource(s, s.objects[b]!), { object: s.objects[g]! }, 3);
    expect(s.objects[g]!.counters.loyalty).toBe(1);
  });
});

describe("Jared Carthalion: +1/+1 counters by each target's colors; a multicolored card back, more if it's all colors", () => {
  it("−3: each of up to two targets gets a counter for each of its own colors", () => {
    supported(jared());
    const { s: s0, ap, opp } = setup([]);
    const j = putOnBattlefield(s0, ap, jared());
    s0.objects[j]!.counters.loyalty = 5;
    const two = putOnBattlefield(s0, ap, card("Test Gold", "Creature — Bear", "{G}{W}", { power: "2", toughness: "2" }));
    const one = putOnBattlefield(s0, opp, bear());
    const grey = putOnBattlefield(s0, opp, card("Test Golem", "Artifact Creature — Golem", "{2}", { power: "2", toughness: "2" }));
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planActivate(s0, ap, j, 1, [tgt(two), tgt(one)])));
    expect(s.objects[two]!.counters["+1/+1"]).toBe(2);
    expect(s.objects[one]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[j]!.counters.loyalty).toBe(2);
    // A colorless creature gets none, and one target is fine.
    const { s: t0, ap: ap2 } = setup([]);
    const j2 = putOnBattlefield(t0, ap2, jared());
    t0.objects[j2]!.counters.loyalty = 5;
    const g2 = putOnBattlefield(t0, ap2, card("Test Golem", "Artifact Creature — Golem", "{2}", { power: "2", toughness: "2" }));
    s = settle(run(t0, planActivate(t0, ap2, j2, 1, [tgt(g2), none])));
    expect(s.objects[g2]!.counters["+1/+1"] ?? 0).toBe(0);
    void grey;
  });
  it("−6: returns the card; one that's all colors also draws a card and makes two Treasures, a two-color one doesn't", () => {
    const { s: s0, ap } = setup([]);
    s0.players[ap]!.hand = [];
    const j = putOnBattlefield(s0, ap, jared());
    s0.objects[j]!.counters.loyalty = 6;
    const rainbow = put(s0, ap, card("Test Rainbow", "Creature — Avatar", "{W}{U}{B}{R}{G}", { power: "5", toughness: "5" }), "graveyard");
    let s = settle(run(s0, planActivate(s0, ap, j, 2, [tgt(rainbow)])));
    expect(zone(s, rainbow)).toBe("hand");
    expect(s.players[ap]!.hand.length).toBe(2);
    expect(s.battlefield.filter((id) => characteristics(s, s.objects[id]!).subtypes.includes("Treasure")).length).toBe(2);
    const { s: t0, ap: ap2 } = setup([]);
    t0.players[ap2]!.hand = [];
    const j2 = putOnBattlefield(t0, ap2, jared());
    t0.objects[j2]!.counters.loyalty = 6;
    const gold = put(t0, ap2, card("Test Gold", "Creature — Bear", "{G}{W}", { power: "2", toughness: "2" }), "graveyard");
    s = settle(run(t0, planActivate(t0, ap2, j2, 2, [tgt(gold)])));
    expect(zone(s, gold)).toBe("hand");
    expect(s.players[ap2]!.hand.length).toBe(1);
    expect(s.battlefield.filter((id) => characteristics(s, s.objects[id]!).subtypes.includes("Treasure")).length).toBe(0);
  });
});

describe("Quantum Riddler: with one or fewer cards in hand, an instruction to draw is one more card", () => {
  const divination = () => card("Test Divination", "Sorcery", "{U}", { oracleText: "Draw two cards." });
  it("draw two with an empty hand is draw three; with two cards in hand it's two", () => {
    supported(riddler());
    const { s: s0, ap, ids } = setup([divination()]);
    putOnBattlefield(s0, ap, riddler());
    s0.players[ap]!.hand = [ids[0]!];
    let s = cast(s0, ap, ids[0]!);
    expect(s.players[ap]!.hand.length).toBe(3);
    // Now three cards in hand: no extra.
    const more = put(s, ap, divination(), "hand");
    s = cast(s, ap, more);
    expect(s.players[ap]!.hand.length).toBe(5);
  });
  it("the draw step's draw is an instruction too", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, riddler());
    s0.players[ap]!.hand = [];
    let s = passUntil(s0, "main1", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]);
    // Through the other players' turns to ap's draw step (no cards are played; nothing else draws for ap).
    for (let i = 0; i < 3; i++) s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(s.activePlayer) + 1) % 4]);
    expect(s.activePlayer).toBe(ap);
    s = passUntil(s, "main1", ap);
    expect(s.players[ap]!.hand.length).toBe(2);
  });
  it("its enters trigger's draw, with one card in hand, is two", () => {
    const { s: s0, ap, ids } = setup([riddler(), card("Test Kept", "Instant", "{U}")]);
    s0.players[ap]!.hand = [ids[0]!, ids[1]!];
    let s = cast(s0, ap, ids[0]!);
    // Riddler is on the battlefield as its trigger resolves; one card (Test Kept) in hand.
    expect(s.players[ap]!.hand.length).toBe(3);
  });
});

describe("Spry and Mighty: two creatures you choose; X is the difference between their powers", () => {
  it("draws X, and both get +X/+X and trample until end of turn", () => {
    supported(spry());
    const { s: s0, ap, ids } = setup([spry()]);
    s0.players[ap]!.hand = [ids[0]!];
    const small = putOnBattlefield(s0, ap, bear());
    const big = putOnBattlefield(s0, ap, card("Test Giant", "Creature — Giant", "{4}", { power: "5", toughness: "5" }));
    putOnBattlefield(s0, ap, card("Test Third", "Creature — Elf", "{G}", { power: "1", toughness: "1" }));
    let s = cast(s0, ap, ids[0]!);
    expect(s.pending?.kind).toBe("pickPermanents");
    const q = s.pending as Extract<GameState["pending"], { kind: "pickPermanents" }>;
    expect(q.count).toBe(2);
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [small, big] }));
    expect(s.players[ap]!.hand.length).toBe(3);
    expect([characteristics(s, s.objects[small]!).power, characteristics(s, s.objects[big]!).power]).toEqual([5, 8]);
    expect(objHasKeyword(s, s.objects[small]!, "Trample")).toBe(true);
    expect(objHasKeyword(s, s.objects[big]!, "Trample")).toBe(true);
  });
  it("does nothing with only one creature (rulings)", () => {
    const { s: s0, ap, ids } = setup([spry()]);
    s0.players[ap]!.hand = [ids[0]!];
    const only = putOnBattlefield(s0, ap, bear());
    const s = cast(s0, ap, ids[0]!);
    expect(s.pending).toBeFalsy();
    expect(s.players[ap]!.hand.length).toBe(0);
    expect(characteristics(s, s.objects[only]!).power).toBe(2);
  });
});

describe("Dragon's Approach: 3 damage to each opponent; with four more in your graveyard, exile them for a Dragon", () => {
  it("exiles itself and four named cards from the graveyard, then puts a Dragon creature card from the library onto the battlefield", () => {
    supported(approach());
    const { s: s0, ap, ids } = setup([approach()]);
    const yard = [0, 1, 2, 3, 4].map(() => put(s0, ap, approach(), "graveyard"));
    const dragon = put(s0, ap, card("Test Dragon", "Creature — Dragon", "{4}{R}{R}", { power: "6", toughness: "6" }), "library");
    const lives = s0.turnOrder.map((p) => s0.players[p]!.life);
    let s = cast(s0, ap, ids[0]!);
    expect(s.turnOrder.map((p, i) => lives[i]! - s.players[p]!.life)).toEqual(s.turnOrder.map((p) => (p === ap ? 0 : 3)));
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    // Five in the graveyard: four are chosen.
    expect(s.pending?.kind).toBe("searchLibrary");
    const pick = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    expect([...pick.cards].sort()).toEqual([...yard].sort());
    expect([pick.min, pick.max]).toEqual([4, 4]);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: yard.slice(0, 4) }));
    expect(s.pending?.kind).toBe("searchLibrary");
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [dragon] }));
    expect(zone(s, ids[0]!)).toBe("exile");
    expect(yard.filter((id) => zone(s, id) === "exile").length).toBe(4);
    expect(yard.filter((id) => zone(s, id) === "graveyard").length).toBe(1);
    expect(zone(s, dragon)).toBe("battlefield");
  });
  it("with only three others in the graveyard, there's nothing to choose and it goes to the graveyard", () => {
    const { s: s0, ap, ids } = setup([approach()]);
    [0, 1, 2].forEach(() => put(s0, ap, approach(), "graveyard"));
    const s = cast(s0, ap, ids[0]!);
    expect(s.pending).toBeFalsy();
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });
});

describe("Agent's Toolkit: enters with four kinds of counters, then moves one onto each creature of yours that enters", () => {
  it("enters with a +1/+1, a flying, a deathtouch and a shield counter; a creature entering may take the kind you choose", () => {
    supported(toolkit());
    const { s: s0, ap, ids } = setup([toolkit(), bear()]);
    let s = cast(s0, ap, ids[0]!);
    expect(s.objects[ids[0]!]!.counters).toEqual({ "+1/+1": 1, flying: 1, deathtouch: 1, shield: 1 });
    s = cast(s, ap, ids[1]!);
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.pending?.kind).toBe("chooseOption");
    const q = s.pending as Extract<GameState["pending"], { kind: "chooseOption" }>;
    expect([...q.options].sort()).toEqual(["+1/+1", "deathtouch", "flying", "shield"]);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "flying" }));
    expect(s.objects[ids[1]!]!.counters.flying).toBe(1);
    expect(objHasKeyword(s, s.objects[ids[1]!]!, "Flying")).toBe(true);
    expect(s.objects[ids[0]!]!.counters.flying ?? 0).toBe(0);
  });
});

describe("Aven Courier: a counter kind from a permanent you control, put on the target if it has none of that kind", () => {
  const setupCourier = () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, courier());
    const other = putOnBattlefield(s0, ap, bear({ name: "Test Holder" }));
    s0.objects[other]!.counters = { "+1/+1": 2, lifelink: 1 };
    const target = putOnBattlefield(s0, ap, bear({ name: "Test Target" }));
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] } as Action));
    return { s, ap, target, other };
  };
  it("the chosen kind goes on the target", () => {
    supported(courier());
    let { s, ap, target } = setupCourier();
    expect(s.pending?.kind).toBe("chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(target)] }));
    expect(s.pending?.kind).toBe("chooseOption");
    const q = s.pending as Extract<GameState["pending"], { kind: "chooseOption" }>;
    expect([...q.options].sort()).toEqual(["+1/+1", "lifelink"]);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "lifelink" }));
    expect(s.objects[target]!.counters).toEqual({ lifelink: 1 });
    expect(objHasKeyword(s, s.objects[target]!, "Lifelink")).toBe(true);
  });
  it("nothing if the target already has a counter of that kind", () => {
    let { s, ap, other } = setupCourier();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(other)] }));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "+1/+1" }));
    expect(s.objects[other]!.counters).toEqual({ "+1/+1": 2, lifelink: 1 });
  });
});

describe("Tombstone Stairwell: Tombspawn tokens for each creature card in each graveyard, destroyed at each end step", () => {
  it("at each upkeep each player creates one for each creature card in their own graveyard; the end step destroys them all", () => {
    supported(stairwell());
    const { s: s0, ap, opp } = setup([]);
    const st = putOnBattlefield(s0, ap, stairwell());
    trimHand(s0, ap, 5);
    put(s0, ap, bear(), "graveyard");
    put(s0, opp, bear(), "graveyard");
    put(s0, opp, bear(), "graveyard");
    put(s0, opp, card("Test Land", "Land"), "graveyard");
    let s = passUntil(s0, "upkeep", opp);
    s = settle(s);
    const tombs = (x: GameState, p: PlayerId) => x.battlefield.filter((id) => x.objects[id]!.isToken && x.objects[id]!.controller === p && characteristics(x, x.objects[id]!).name === "Tombspawn");
    expect(tombs(s, ap).length).toBe(1);
    expect(tombs(s, opp).length).toBe(2);
    const one = tombs(s, opp)[0]!;
    const c = characteristics(s, s.objects[one]!);
    expect([c.power, c.toughness, c.subtypes]).toEqual([2, 2, ["Zombie"]]);
    expect(objHasKeyword(s, s.objects[one]!, "Haste")).toBe(true);
    s = settle(passUntil(s, "end", opp));
    expect(tombs(s, ap).length + tombs(s, opp).length).toBe(0);
    void st;
  });
  it("when it leaves the battlefield, the tokens it made are destroyed", () => {
    const { s: s0, ap, opp } = setup([]);
    const st = putOnBattlefield(s0, ap, stairwell());
    trimHand(s0, ap, 5);
    put(s0, opp, bear(), "graveyard");
    let s = settle(passUntil(s0, "upkeep", opp));
    const made = s.battlefield.filter((id) => s.objects[id]!.isToken);
    expect(made.length).toBe(1);
    // Another token, not made by the Stairwell, stays.
    const other = putOnBattlefield(s, opp, bear());
    s.objects[other]!.isToken = true;
    // Destroy the Stairwell: its leaves trigger destroys the token it made.
    const sac = card("Test Disenchant", "Instant", "{W}", { oracleText: "Destroy target enchantment." });
    const d = put(s, opp, sac, "hand");
    s.players[opp]!.manaPool = { ...s.players[opp]!.manaPool, W: 1 };
    s = settle(run(s, planCast(s, opp, d, [tgt(st)])));
    expect(zone(s, st)).toBe("graveyard");
    expect(made.every((id) => s.objects[id]?.zone !== "battlefield")).toBe(true);
    expect(zone(s, other)).toBe("battlefield");
  });
});
