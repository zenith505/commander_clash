// Round 234: cards from the top of the popularity list. Shiko and Narset, Unified ("copy that spell if it targets a
// permanent or player ... If you don't copy a spell this way, draw a card"); The Horus Heresy ("Starting with you, each
// player chooses a creature. Destroy each creature chosen this way"); Dead Man's Chest (exile cards equal to its power
// from the top of its owner's library, cast them with mana of any type); Battle for Bretagard (copies of tokens with
// different names); The Capitoline Triad (exile historic cards with total mana value 30 or greater); Yidaro, Wandering
// Monster (cycled a card named ~ four or more times); Grub's Command ("puts each Goblin card milled this way into their
// hand"); Gideon, Champion of Justice (P/T equal to his loyalty, locked in); Chandra, Pyromaster ("that player or that
// planeswalker's controller", "copy it three times"); Jaya, Fiery Negotiator ("Whenever you attack this turn ... to that
// creature", "a red instant or sorcery spell"); Wall of Nets ("all creatures blocked by this creature"). Along the way:
// Huntmaster of the Fells, Soul of Shandalar and Unyaro Griffin.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, abilityProblem, applyAction, controllerOf, destroyPermanent, botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";
import { putCounters } from "../src/counters";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/**
 * Everyone passes until the stack is empty, answering "you may" with `may` and trigger targets with `targets`; other
 * players' questions are answered as the bots would. Stops at any other question of `me`'s.
 */
const settle = (s: GameState, opts: { may?: boolean; targets?: TargetChoice[]; me?: PlayerId } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me !== undefined && p.player !== opts.me) s = act(s, botActions(s, p.player)[0]!);
    else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.may ?? true });
    else if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets ?? [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]?.zone;
/** Taps everything a player controls, then gives them exactly this mana. */
const poolOnly = (s: GameState, pid: PlayerId, mana: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  for (const id of s.battlefield) if (s.objects[id]!.controller === pid) s.objects[id]!.tapped = true;
  Object.assign(s.players[pid]!.manaPool, mana);
};
const mine = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).name === name);
/** The opponents in turn order, starting after `ap`. */
const opps = (s: GameState, ap: PlayerId) => [1, 2, 3].map((i) => s.turnOrder[(s.turnOrder.indexOf(ap) + i) % 4]!);

// Real oracle text (Scryfall).
const shiko = (): CardDef => ({"oracleId":"40ed32a6-ad56-48c7-aecf-b4238c34c212","name":"Shiko and Narset, Unified","manaCost":"{1}{U}{R}{W}","cmc":4,"typeLine":"Legendary Creature — Human Spirit Dragon","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Spirit","Dragon"],"oracleText":"Flying, vigilance\nFlurry — Whenever you cast your second spell each turn, copy that spell if it targets a permanent or player, and you may choose new targets for the copy. If you don't copy a spell this way, draw a card.","power":"4","toughness":"4","colors":["R","U","W"],"colorIdentity":["R","U","W"],"keywords":["Flying","Flurry","Vigilance"],"layout":"normal"}) as CardDef;
const horus = (): CardDef => ({"oracleId":"fc315174-d063-41dd-9379-11d95c5fd4ed","name":"The Horus Heresy","manaCost":"{3}{U}{B}{R}","cmc":6,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — For each opponent, gain control of up to one target nonlegendary creature that player controls for as long as this Saga remains on the battlefield.\nII — Draw a card for each creature you control but don't own.\nIII — Starting with you, each player chooses a creature. Destroy each creature chosen this way.","colors":["B","R","U"],"colorIdentity":["B","R","U"],"keywords":[],"layout":"saga"}) as CardDef;
const chest = (): CardDef => ({"oracleId":"e5fdd6fd-6492-47ec-8b74-9ff22ff9849a","name":"Dead Man's Chest","manaCost":"{1}{B}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature an opponent controls\nWhen enchanted creature dies, exile cards equal to its power from the top of its owner's library. You may cast spells from among those cards for as long as they remain exiled, and mana of any type can be spent to cast them.","colors":["B"],"colorIdentity":["B"],"keywords":["Enchant"],"layout":"normal"}) as CardDef;
const bretagard = (): CardDef => ({"oracleId":"8294539d-7982-4ec9-8392-99eed78542f5","name":"Battle for Bretagard","manaCost":"{1}{G}{W}","cmc":3,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Create a 1/1 white Human Warrior creature token.\nII — Create a 1/1 green Elf Warrior creature token.\nIII — Choose any number of artifact tokens and/or creature tokens you control with different names. For each of them, create a token that's a copy of it.","colors":["G","W"],"colorIdentity":["G","W"],"keywords":[],"layout":"saga"}) as CardDef;
const triad = (): CardDef => ({"oracleId":"e0321049-a3ed-4378-b607-7fb190b6f0fd","name":"The Capitoline Triad","manaCost":"{10}","cmc":10,"typeLine":"Legendary Creature — God Artificer","supertypes":["Legendary"],"types":["Creature"],"subtypes":["God","Artificer"],"oracleText":"Those Who Came Before — This spell costs {1} less to cast for each historic card in your graveyard. (Artifacts, legendaries, and Sagas are historic.)\nExile any number of historic cards from your graveyard with total mana value 30 or greater: You get an emblem with \"Creatures you control have base power and toughness 9/9.\"","power":"7","toughness":"7","colors":[],"colorIdentity":[],"keywords":["Those Who Came Before"],"layout":"normal"}) as CardDef;
const yidaro = (): CardDef => ({"oracleId":"6c0e22f2-f0f3-43e6-87c5-c543032112d8","name":"Yidaro, Wandering Monster","manaCost":"{5}{R}{R}","cmc":7,"typeLine":"Legendary Creature — Dinosaur Turtle","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Dinosaur","Turtle"],"oracleText":"Trample, haste\nCycling {1}{R}\nWhen you cycle this card, shuffle it into your library from your graveyard. If you've cycled a card named Yidaro, Wandering Monster four or more times this game, put it onto the battlefield from your graveyard instead. (Do this before you draw.)","power":"8","toughness":"8","colors":["R"],"colorIdentity":["R"],"keywords":["Haste","Trample","Cycling"],"layout":"normal"}) as CardDef;
const grubs = (): CardDef => ({"oracleId":"8173e160-9a22-43f7-90d1-9ada043bc1b7","name":"Grub's Command","manaCost":"{3}{B}{R}","cmc":5,"typeLine":"Kindred Sorcery — Goblin","supertypes":[],"types":["Kindred","Sorcery"],"subtypes":["Goblin"],"oracleText":"Choose two —\n• Create a token that's a copy of target Goblin you control.\n• Creatures target player controls get +1/+1 and gain haste until end of turn.\n• Destroy target artifact or creature.\n• Target player mills five cards, then puts each Goblin card milled this way into their hand.","colors":["B","R"],"colorIdentity":["B","R"],"keywords":["Mill"],"layout":"normal"}) as CardDef;
const gideon = (): CardDef => ({"oracleId":"5843bf12-27db-4e7d-81ee-98874bea72c7","name":"Gideon, Champion of Justice","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Legendary Planeswalker — Gideon","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Gideon"],"oracleText":"+1: Put a loyalty counter on Gideon for each creature target opponent controls.\n0: Until end of turn, Gideon becomes a Human Soldier creature with power and toughness each equal to the number of loyalty counters on him and gains indestructible. He's still a planeswalker. Prevent all damage that would be dealt to him this turn.\n−15: Exile all other permanents.","loyalty":"4","colors":["W"],"colorIdentity":["W"],"keywords":[],"layout":"normal"}) as CardDef;
const chandra = (): CardDef => ({"oracleId":"68e12748-9a7b-4e99-a6de-be097a269342","name":"Chandra, Pyromaster","manaCost":"{2}{R}{R}","cmc":4,"typeLine":"Legendary Planeswalker — Chandra","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Chandra"],"oracleText":"+1: Chandra deals 1 damage to target player or planeswalker and 1 damage to up to one target creature that player or that planeswalker's controller controls. That creature can't block this turn.\n0: Exile the top card of your library. You may play it this turn.\n−7: Exile the top ten cards of your library. Choose an instant or sorcery card exiled this way and copy it three times. You may cast the copies without paying their mana costs.","loyalty":"4","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const jaya = (): CardDef => ({"oracleId":"2458aa66-5b20-4811-a4a4-8375ad0a6498","name":"Jaya, Fiery Negotiator","manaCost":"{2}{R}{R}","cmc":4,"typeLine":"Legendary Planeswalker — Jaya","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Jaya"],"oracleText":"+1: Create a 1/1 red Monk creature token with prowess.\n−1: Exile the top two cards of your library. Choose one of them. You may play that card this turn.\n−2: Choose target creature an opponent controls. Whenever you attack this turn, Jaya deals damage equal to the number of attacking creatures to that creature.\n−8: You get an emblem with \"Whenever you cast a red instant or sorcery spell, copy it twice. You may choose new targets for the copies.\"","loyalty":"4","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const wallOfNets = (): CardDef => ({"oracleId":"cd112962-b297-403c-bede-c8b587f379b3","name":"Wall of Nets","manaCost":"{1}{W}{W}","cmc":3,"typeLine":"Creature — Wall","supertypes":[],"types":["Creature"],"subtypes":["Wall"],"oracleText":"Defender (This creature can't attack.)\nAt end of combat, exile all creatures blocked by this creature.\nWhen this creature leaves the battlefield, return all cards exiled with it to the battlefield under their owners' control.","power":"0","toughness":"7","colors":["W"],"colorIdentity":["W"],"keywords":["Defender"],"layout":"normal"}) as CardDef;
// Supported along the way: the same "that player or that planeswalker's controller" and "red instant or sorcery" targets.
const huntmaster = (): CardDef => ({"oracleId":"582328cd-660d-47a4-bb23-e91e80b9a907","name":"Huntmaster of the Fells // Ravager of the Fells","manaCost":"{2}{R}{G}","cmc":4,"typeLine":"Creature — Human Werewolf // Creature — Werewolf","supertypes":[],"types":["Creature"],"subtypes":["Human","Werewolf"],"oracleText":"Whenever this creature enters or transforms into Huntmaster of the Fells, create a 2/2 green Wolf creature token and you gain 2 life.\nAt the beginning of each upkeep, if no spells were cast last turn, transform this creature.","power":"2","toughness":"2","colors":["G","R"],"colorIdentity":["G","R"],"keywords":["Transform","Trample"],"layout":"transform","faces":[{"name":"Huntmaster of the Fells","manaCost":"{2}{R}{G}","typeLine":"Creature — Human Werewolf","supertypes":[],"types":["Creature"],"subtypes":["Human","Werewolf"],"oracleText":"Whenever this creature enters or transforms into Huntmaster of the Fells, create a 2/2 green Wolf creature token and you gain 2 life.\nAt the beginning of each upkeep, if no spells were cast last turn, transform this creature.","power":"2","toughness":"2","colors":["G","R"]},{"name":"Ravager of the Fells","manaCost":"","typeLine":"Creature — Werewolf","supertypes":[],"types":["Creature"],"subtypes":["Werewolf"],"oracleText":"Trample\nWhenever this creature transforms into Ravager of the Fells, it deals 2 damage to target opponent or planeswalker and 2 damage to up to one target creature that player or that planeswalker's controller controls.\nAt the beginning of each upkeep, if a player cast two or more spells last turn, transform this creature.","power":"4","toughness":"4","colors":["G","R"],"colorIndicator":["G","R"]}]}) as CardDef;
const soul = (): CardDef => ({"oracleId":"ac96d27c-dbae-4094-9209-3ef143f64713","name":"Soul of Shandalar","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Creature — Avatar","supertypes":[],"types":["Creature"],"subtypes":["Avatar"],"oracleText":"First strike\n{3}{R}{R}: This creature deals 3 damage to target player or planeswalker and 3 damage to up to one target creature that player or that planeswalker's controller controls.\n{3}{R}{R}, Exile this card from your graveyard: It deals 3 damage to target player or planeswalker and 3 damage to up to one target creature that player or that planeswalker's controller controls.","power":"6","toughness":"6","colors":["R"],"colorIdentity":["R"],"keywords":["First strike"],"layout":"normal"}) as CardDef;
const griffin = (): CardDef => ({"oracleId":"27d80a75-688e-4f68-9622-54484dd3bd91","name":"Unyaro Griffin","manaCost":"{3}{W}","cmc":4,"typeLine":"Creature — Griffin","supertypes":[],"types":["Creature"],"subtypes":["Griffin"],"oracleText":"Flying\nSacrifice this creature: Counter target red instant or sorcery spell.","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["Flying"],"layout":"normal"}) as CardDef;

const ping = card("Test Ping", "Instant", "{R}", { cmc: 1, oracleText: "Test Ping deals 1 damage to any target." });
const pebble = card("Test Pebble", "Instant", "{1}", { cmc: 1, oracleText: "You gain 2 life." });
const insight = card("Test Insight", "Sorcery", "{U}", { cmc: 1, oracleText: "Draw a card." });
const goblin = card("Test Goblin", "Creature — Goblin", "{R}", { cmc: 1, power: "1", toughness: "1" });
const ogre = card("Test Ogre", "Creature — Ogre", "{2}{B}", { cmc: 3, power: "3", toughness: "3" });

describe("round 234: parse", () => {
  it("every card of the round is fully supported", () => supported(shiko(), horus(), chest(), bretagard(), triad(), yidaro(), grubs(), gideon(), chandra(), jaya(), wallOfNets(), huntmaster(), soul(), griffin()));
});

describe("round 234: Shiko and Narset, Unified", () => {
  it("copies your second spell if it targets a permanent or player", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, shiko());
    const b1 = putOnBattlefield(s, opp, bear());
    const p1 = into(s, ap, pebble, "hand");
    const p2 = into(s, ap, ping, "hand");
    s = settle(run(s, planCast(s, ap, p1)));
    const b2 = putOnBattlefield(s, opp, bear());
    s = run(s, planCast(s, ap, p2, [tgt(b1)]));
    const hand = s.players[ap]!.hand.length;
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: ap, copyOf: "Test Ping" });
    s = settle(act(s, { type: "copyTargets", player: ap, targets: [tgt(b2)] }));
    // The original and its copy each deal 1 damage, the copy to the new target; no card is drawn.
    expect(s.objects[b1]!.damage).toBe(1);
    expect(s.objects[b2]!.damage).toBe(1);
    expect(s.players[ap]!.hand.length).toBe(hand);
  });

  it("a second spell without a permanent or player target draws a card instead", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, shiko());
    const p1 = into(s, ap, pebble, "hand");
    const p2 = into(s, ap, pebble, "hand");
    s = settle(run(s, planCast(s, ap, p1)));
    const life = s.players[ap]!.life;
    s = run(s, planCast(s, ap, p2));
    const hand = s.players[ap]!.hand.length;
    s = settle(s);
    expect(s.players[ap]!.life).toBe(life + 2);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("the first spell of the turn does nothing", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, shiko());
    const b1 = putOnBattlefield(s, opp, bear());
    const p1 = into(s, ap, ping, "hand");
    s = run(s, planCast(s, ap, p1, [tgt(b1)]));
    const hand = s.players[ap]!.hand.length;
    s = settle(s);
    expect(s.objects[b1]!.damage).toBe(1);
    expect(s.players[ap]!.hand.length).toBe(hand);
  });
});

/** Puts a lore counter on a Saga of `pid`'s, the way an effect would, so its next chapter triggers (CR 714.2b). */
const lore = (s: GameState, saga: ObjectId) => {
  putCounters(s, s.objects[saga]!, "lore", 1);
  invalidateCharacteristics(s);
  return s;
};

describe("round 234: The Horus Heresy", () => {
  it("I steals up to one creature of each opponent for as long as the Saga remains; II draws for each creature you control but don't own", () => {
    let { s, ap } = setup([horus()]);
    const [o1, o2, o3] = opps(s, ap);
    const b1 = putOnBattlefield(s, o1!, bear());
    const b2 = putOnBattlefield(s, o2!, ogre);
    putOnBattlefield(s, o3!, bear());
    const saga = s.players[ap]!.hand.find((id) => s.cards[s.objects[id]!.cardId]!.name === "The Horus Heresy")!;
    s = run(s, planCast(s, ap, saga));
    for (let i = 0; i < 30 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(b1), tgt(b2), { kind: "none" }] }));
    const ctl = (id: ObjectId) => mine(s, ap, characteristics(s, s.objects[id]!).name).includes(id);
    expect(ctl(b1)).toBe(true);
    expect(ctl(b2)).toBe(true);
    // II: two creatures you control but don't own; your own creature doesn't count.
    putOnBattlefield(s, ap, bear());
    const hand = s.players[ap]!.hand.length;
    s = settle(lore(s, saga));
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    // When the Saga leaves the battlefield, the control effect ends.
    destroyPermanent(s, s.objects[saga]!, "destroyed");
    s = settle(s);
    expect(ctl(b1)).toBe(false);
    expect(ctl(b2)).toBe(false);
  });

  it("III: starting with you, each player chooses a creature (anyone's); each creature chosen this way is destroyed", () => {
    let { s, ap } = setup([]);
    const [o1, o2, o3] = opps(s, ap);
    const saga = putOnBattlefield(s, ap, horus());
    s.objects[saga]!.counters.lore = 2;
    const mineB = putOnBattlefield(s, ap, bear());
    const x1 = putOnBattlefield(s, o1!, ogre);
    const x2 = putOnBattlefield(s, o2!, bear());
    const x3 = putOnBattlefield(s, o3!, bear());
    s = lore(s, saga);
    for (let i = 0; i < 30 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap });
    // You may choose an opponent's creature.
    expect((s.pending as { options: ObjectId[] }).options).toEqual(expect.arrayContaining([mineB, x1, x2, x3]));
    s = act(s, { type: "pickPermanents", player: ap, ids: [x1] });
    for (let i = 0; i < 3; i++) {
      expect(s.pending?.kind).toBe("pickPermanents");
      expect(s.pending?.player).toBe(s.turnOrder[(s.turnOrder.indexOf(ap) + i + 1) % 4]);
      s = act(s, botActions(s, s.pending!.player)[0]!);
    }
    s = settle(s);
    expect(zone(s, x1)).toBe("graveyard");
    // The Saga is sacrificed after III.
    expect(zone(s, saga)).toBe("graveyard");
  });
});

describe("round 234: Dead Man's Chest", () => {
  it("when enchanted creature dies, exiles cards equal to its power from its owner's library; you cast them with mana of any type", () => {
    let { s, ap, opp } = setup([]);
    const o = putOnBattlefield(s, opp, ogre);
    const chestId = putOnBattlefield(s, ap, chest());
    s.objects[chestId]!.attachedTo = o;
    const p = into(s, opp, ping, "library");
    const land = into(s, opp, card("Island", "Basic Land — Island"), "library");
    const b = into(s, opp, bear(), "library");
    const fourth = s.players[opp]!.library[3]!;
    invalidateCharacteristics(s);
    destroyPermanent(s, s.objects[o]!, "destroyed");
    s = settle(s);
    expect([zone(s, p), zone(s, land), zone(s, b)]).toEqual(["exile", "exile", "exile"]);
    expect(zone(s, fourth)).toBe("library");
    // Blue mana pays for the red spell.
    poolOnly(s, ap, { U: 1 });
    const victim = putOnBattlefield(s, opp, bear());
    s = settle(run(s, planCast(s, ap, p, [tgt(victim)])));
    expect(s.objects[victim]!.damage).toBe(1);
    // The card is the opponent's: it goes to their graveyard.
    expect(s.players[opp]!.graveyard).toContain(p);
  });
});

describe("round 234: Battle for Bretagard", () => {
  it("III copies each artifact or creature token you choose; the chosen tokens must have different names", () => {
    let { s, ap } = setup([]);
    const saga = putOnBattlefield(s, ap, bretagard());
    s = settle(lore(s, saga)); // I: a Human Warrior
    s.objects[saga]!.counters.lore = 0;
    s = settle(lore(s, saga)); // I again: a second Human Warrior
    s = settle(lore(s, saga)); // II: an Elf Warrior
    const humans = mine(s, ap, "Human Warrior Token");
    const elves = mine(s, ap, "Elf Warrior Token");
    expect([humans.length, elves.length]).toEqual([2, 1]);
    const real = putOnBattlefield(s, ap, bear());
    s = lore(s, saga);
    for (let i = 0; i < 30 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, differentNames: true });
    const options = (s.pending as { options: ObjectId[] }).options;
    expect(options).not.toContain(real);
    expect(() => act(s, { type: "pickPermanents", player: ap, ids: humans })).toThrow(/different names/);
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [humans[0]!, elves[0]!] }));
    expect(mine(s, ap, "Human Warrior Token")).toHaveLength(3);
    expect(mine(s, ap, "Elf Warrior Token")).toHaveLength(2);
    expect(mine(s, ap, "Grizzly Bears")).toHaveLength(1);
  });

  it("the bot picks one token of each name", () => {
    let { s, ap } = setup([]);
    const saga = putOnBattlefield(s, ap, bretagard());
    s = settle(lore(s, saga));
    s.objects[saga]!.counters.lore = 0;
    s = settle(lore(s, saga));
    s = settle(lore(s, saga));
    s = lore(s, saga);
    for (let i = 0; i < 30 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(act(s, botActions(s, ap)[0]!));
    expect(mine(s, ap, "Human Warrior Token")).toHaveLength(3);
    expect(mine(s, ap, "Elf Warrior Token")).toHaveLength(2);
  });
});

const relic = card("Test Relic", "Artifact", "{8}", { cmc: 8 });
const lord = card("Test Lord", "Legendary Creature — Human", "{9}", { cmc: 9, power: "2", toughness: "2" });
const giant = card("Test Giant", "Creature — Giant", "{9}", { cmc: 9, power: "9", toughness: "9" });

describe("round 234: The Capitoline Triad", () => {
  it("costs {1} less for each historic card in your graveyard", () => {
    const { s, ap, ids } = setup([triad()]);
    into(s, ap, relic, "graveyard");
    into(s, ap, lord, "graveyard");
    into(s, ap, giant, "graveyard");
    poolOnly(s, ap, { C: 8 });
    expect(planCast(s, ap, ids[0]!)).not.toBeNull();
    poolOnly(s, ap, { C: 7 });
    s.players[ap]!.manaPool.C = 7;
    expect(planCast(s, ap, ids[0]!)).toBeNull();
  });

  it("exiles historic cards with total mana value 30 or greater for an emblem: creatures you control have base power and toughness 9/9", () => {
    let { s, ap, opp } = setup([]);
    const t = putOnBattlefield(s, ap, triad());
    const r1 = into(s, ap, relic, "graveyard");
    const r2 = into(s, ap, relic, "graveyard");
    const l1 = into(s, ap, lord, "graveyard");
    const g = into(s, ap, giant, "graveyard");
    // A nonhistoric card can't be exiled for it, and 25 isn't enough.
    expect(abilityProblem(s, ap, t, 0, undefined, undefined, undefined, undefined, { collect: [r1, r2, g] })).not.toBeNull();
    expect(abilityProblem(s, ap, t, 0, undefined, undefined, undefined, undefined, { collect: [r1, r2, l1] })).toMatch(/30/);
    const l2 = into(s, ap, lord, "graveyard");
    s = settle(run(s, planActivate(s, ap, t, 0, undefined, undefined, undefined, undefined, { collect: [r1, r2, l1, l2] })));
    expect([zone(s, r1), zone(s, r2), zone(s, l1), zone(s, l2), zone(s, g)]).toEqual(["exile", "exile", "exile", "exile", "graveyard"]);
    // Exiling the cards isn't collecting evidence.
    expect(s.log.some((l) => /evidence/i.test(l.text))).toBe(false);
    const b = putOnBattlefield(s, ap, bear());
    s.objects[b]!.counters["+1/+1"] = 1;
    const theirs = putOnBattlefield(s, opp, bear());
    invalidateCharacteristics(s);
    expect([power(s, s.objects[t]!), toughness(s, s.objects[t]!)]).toEqual([9, 9]);
    expect([power(s, s.objects[b]!), toughness(s, s.objects[b]!)]).toEqual([10, 10]);
    expect([power(s, s.objects[theirs]!), toughness(s, s.objects[theirs]!)]).toEqual([2, 2]);
  });

  it("left to choose, only historic cards are exiled for it", () => {
    let { s, ap } = setup([]);
    const t = putOnBattlefield(s, ap, triad());
    const g = into(s, ap, giant, "graveyard");
    for (let i = 0; i < 4; i++) into(s, ap, relic, "graveyard");
    expect(planActivate(s, ap, t, 0)).not.toBeNull();
    s = settle(run(s, planActivate(s, ap, t, 0)));
    expect(zone(s, g)).toBe("graveyard");
    expect(s.players[ap]!.graveyard.length).toBeLessThanOrEqual(1);
  });
});

describe("round 234: Yidaro, Wandering Monster", () => {
  it("cycling it shuffles it into your library from your graveyard, before you draw", () => {
    let { s, ap, ids } = setup([yidaro()]);
    const y = ids[0]!;
    const lib = s.players[ap]!.library.length;
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planActivate(s, ap, y, 0)));
    expect(s.players[ap]!.cycledNames?.["Yidaro, Wandering Monster"]).toBe(1);
    expect(s.players[ap]!.library).toContain(y);
    expect(s.players[ap]!.library.length).toBe(lib); // +1 shuffled in, -1 drawn
    expect(s.players[ap]!.hand.length).toBe(hand); // -1 cycled, +1 drawn
  });

  it("the fourth time you cycle a card named Yidaro this game, it's put onto the battlefield instead", () => {
    let { s, ap, ids } = setup([yidaro()]);
    const y = ids[0]!;
    s.players[ap]!.cycledNames = { "Yidaro, Wandering Monster": 3 };
    s = settle(run(s, planActivate(s, ap, y, 0)));
    expect(zone(s, y)).toBe("battlefield");
    expect(controllerOf(s, s.objects[y]!)).toBe(ap);
  });

  it("if it left the graveyard before the trigger resolves, the library is still shuffled and it stays where it is", () => {
    let { s, ap, ids } = setup([yidaro()]);
    const y = ids[0]!;
    s = run(s, planActivate(s, ap, y, 0));
    // Exile it from the graveyard in response.
    const p = s.players[ap]!;
    p.graveyard.splice(p.graveyard.indexOf(y), 1);
    s.objects[y]!.zone = "exile";
    p.exile.push(y);
    s = settle(s);
    expect(zone(s, y)).toBe("exile");
  });
});

describe("round 234: Grub's Command", () => {
  it("target player mills five cards, then puts each Goblin card milled this way into their hand", () => {
    let { s, ap, opp, ids } = setup([grubs()]);
    const victim = putOnBattlefield(s, opp, ogre);
    const g1 = into(s, opp, goblin, "library");
    const o1 = into(s, opp, ogre, "library");
    const g2 = into(s, opp, goblin, "library");
    const deep = s.players[opp]!.library[5]!;
    const hand = s.players[opp]!.hand.length;
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(victim), { kind: "player", id: opp }], [2, 3])));
    expect(zone(s, victim)).toBe("graveyard");
    expect([zone(s, g1), zone(s, g2), zone(s, o1)]).toEqual(["hand", "hand", "graveyard"]);
    expect(s.players[opp]!.hand.length).toBe(hand + 2);
    expect(s.players[opp]!.graveyard.length).toBe(4); // the ogre on the battlefield, the milled ogre and two Forests
    expect(zone(s, deep)).toBe("library");
  });

  it("a Goblin card already in their graveyard stays there", () => {
    let { s, ap, opp, ids } = setup([grubs()]);
    const old = into(s, opp, goblin, "graveyard");
    const b = putOnBattlefield(s, opp, bear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }, { kind: "player", id: opp }], [1, 3])));
    expect(zone(s, old)).toBe("graveyard");
  });
});

describe("round 234: Gideon, Champion of Justice", () => {
  it("+1: a loyalty counter for each creature target opponent controls", () => {
    let { s, ap, opp } = setup([]);
    const g = putOnBattlefield(s, ap, gideon());
    s.objects[g]!.counters.loyalty = 4;
    putOnBattlefield(s, opp, bear());
    putOnBattlefield(s, opp, ogre);
    s = settle(run(s, planActivate(s, ap, g, 0, [{ kind: "player", id: opp }])));
    expect(s.objects[g]!.counters.loyalty).toBe(5 + 2);
  });

  it("0: an indestructible Human Soldier creature, still a planeswalker, with P/T equal to his loyalty as it resolved; damage to him is prevented", () => {
    let { s, ap, opp } = setup([]);
    const g = putOnBattlefield(s, ap, gideon());
    s.objects[g]!.counters.loyalty = 6;
    s = settle(run(s, planActivate(s, ap, g, 1)));
    const c = characteristics(s, s.objects[g]!);
    expect(c.types).toEqual(expect.arrayContaining(["Creature", "Planeswalker"]));
    expect(c.subtypes).toEqual(expect.arrayContaining(["Human", "Soldier", "Gideon"]));
    expect(c.keywords).toContain("Indestructible");
    expect([power(s, s.objects[g]!), toughness(s, s.objects[g]!)]).toEqual([6, 6]);
    // Fixed as the ability resolved (rulings): more loyalty doesn't change it.
    putCounters(s, s.objects[g]!, "loyalty", 2);
    invalidateCharacteristics(s);
    expect(power(s, s.objects[g]!)).toBe(6);
    const p = into(s, opp, ping, "hand");
    Object.assign(s.players[opp]!.manaPool, { R: 1 });
    s = act(s, { type: "passPriority", player: ap });
    s = settle(run(s, planCast(s, opp, p, [tgt(g)])));
    expect(s.objects[g]!.damage).toBe(0);
    expect(s.objects[g]!.counters.loyalty).toBe(8);
  });
});

const jace = card("Test Walker", "Legendary Planeswalker — Jace", "{3}", { cmc: 3, loyalty: "3", oracleText: "+1: Draw a card." });

describe("round 234: Chandra, Pyromaster", () => {
  it("+1: 1 damage to target player and to up to one target creature that player controls, which can't block", () => {
    let { s, ap, opp } = setup([]);
    const c = putOnBattlefield(s, ap, chandra());
    s.objects[c]!.counters.loyalty = 4;
    const theirs = putOnBattlefield(s, opp, bear());
    const other = putOnBattlefield(s, opps(s, ap)[1]!, bear());
    // A creature another player controls isn't a legal second target.
    expect(abilityProblem(s, ap, c, 0, [{ kind: "player", id: opp }, tgt(other)])).not.toBeNull();
    const life = s.players[opp]!.life;
    s = settle(run(s, planActivate(s, ap, c, 0, [{ kind: "player", id: opp }, tgt(theirs)])));
    expect(s.players[opp]!.life).toBe(life - 1);
    expect(s.objects[theirs]!.damage).toBe(1);
    expect(s.objects[other]!.damage).toBe(0);
    expect(s.objects[c]!.counters.loyalty).toBe(5);
    expect(s.effects.some((e) => e.affected?.includes(theirs) && e.mods.some((m) => m.kind === "cantBlock"))).toBe(true);
  });

  it("+1 at a planeswalker: the creature is one that planeswalker's controller controls", () => {
    let { s, ap, opp } = setup([]);
    const c = putOnBattlefield(s, ap, chandra());
    s.objects[c]!.counters.loyalty = 4;
    const w = putOnBattlefield(s, opp, jace);
    s.objects[w]!.counters.loyalty = 3;
    const theirs = putOnBattlefield(s, opp, bear());
    const other = putOnBattlefield(s, opps(s, ap)[1]!, bear());
    expect(abilityProblem(s, ap, c, 0, [tgt(w), tgt(other)])).not.toBeNull();
    s = settle(run(s, planActivate(s, ap, c, 0, [tgt(w), tgt(theirs)])));
    expect(s.objects[w]!.counters.loyalty).toBe(2);
    expect(s.objects[theirs]!.damage).toBe(1);
  });

  it("−7: exile the top ten; one instant or sorcery card exiled this way is copied three times, and you may cast the copies free", () => {
    let { s, ap, opp } = setup([]);
    const c = putOnBattlefield(s, ap, chandra());
    s.objects[c]!.counters.loyalty = 7;
    const p = into(s, ap, ping, "library");
    into(s, ap, insight, "library");
    const victim = putOnBattlefield(s, opp, giant);
    s = run(s, planActivate(s, ap, c, 2));
    for (let i = 0; i < 30 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "castFromAmong" });
    expect((s.pending as { options: string[] }).options).toEqual(expect.arrayContaining([p]));
    const n = s.log.length;
    s = act(s, { type: "chooseOption", player: ap, choice: p });
    for (let k = 0; k < 3; k++) {
      expect(s.pending).toMatchObject({ kind: "castFree", player: ap });
      s = act(s, botActions(s, ap)[0]!);
      if (k < 2) {
        // Only the chosen card's copies are left to cast.
        expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong", options: [p, "none"] });
        s = act(s, { type: "chooseOption", player: ap, choice: p });
      }
    }
    s = settle(s);
    expect(s.log.slice(n).filter((l) => /^B casts Test Ping|casts Test Ping/.test(l.text))).toHaveLength(3);
    expect(s.log.slice(n).filter((l) => /Test Ping deals 1 damage/.test(l.text))).toHaveLength(3);
    // The card itself stays in exile.
    expect(zone(s, p)).toBe("exile");
  });
});

/** Declares attackers, then passes (no blocks) until `me` has a question or combat ends. */
const attack = (s: GameState, me: PlayerId, attacks: { attacker: ObjectId; defender: PlayerId }[]) => {
  s = passUntil(s, "declareAttackers", me);
  s = act(s, { type: "declareAttackers", player: me, attacks });
  for (let i = 0; i < 80 && s.step !== "endCombat" && s.step !== "main2"; i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p && p.player === me) return s;
    else if (p) s = act(s, botActions(s, p.player)[0]!);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};

describe("round 234: Jaya, Fiery Negotiator", () => {
  it("−2: whenever you attack this turn, Jaya deals damage equal to the number of attacking creatures to that creature", () => {
    let { s, ap, opp } = setup([]);
    const j = putOnBattlefield(s, ap, jaya());
    s.objects[j]!.counters.loyalty = 4;
    const giantId = putOnBattlefield(s, opp, giant);
    s = settle(run(s, planActivate(s, ap, j, 2, [tgt(giantId)])));
    expect(s.objects[j]!.counters.loyalty).toBe(2);
    expect(s.objects[giantId]!.damage).toBe(0);
    const a = [putOnBattlefield(s, ap, bear()), putOnBattlefield(s, ap, bear()), putOnBattlefield(s, ap, bear())];
    s = attack(s, ap, a.map((attacker) => ({ attacker, defender: opps(s, ap)[1]! })));
    expect(s.objects[giantId]!.damage).toBe(3);
  });

  it("−8: an emblem that copies each red instant or sorcery spell you cast twice", () => {
    let { s, ap, opp } = setup([]);
    const j = putOnBattlefield(s, ap, jaya());
    s.objects[j]!.counters.loyalty = 8;
    s = settle(run(s, planActivate(s, ap, j, 3)));
    expect(zone(s, j)).toBe("graveyard");
    const b = putOnBattlefield(s, opp, giant);
    const p = into(s, ap, ping, "hand");
    s = run(s, planCast(s, ap, p, [tgt(b)]));
    for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      if (s.pending?.kind === "copyTargets") s = act(s, { type: "copyTargets", player: ap, targets: [tgt(b)] });
      else if (s.pending) break;
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[b]!.damage).toBe(3);
    // A blue sorcery isn't copied.
    const i0 = into(s, ap, insight, "hand");
    s = run(s, planCast(s, ap, i0));
    const hand = s.players[ap]!.hand.length;
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });
});

describe("round 234: Wall of Nets", () => {
  it("at end of combat exiles all creatures it blocked; when it leaves, they return under their owners' control", () => {
    let { s, ap, opp } = setup([]);
    const wall = putOnBattlefield(s, opp, wallOfNets());
    const a1 = putOnBattlefield(s, ap, bear());
    const a2 = putOnBattlefield(s, ap, bear());
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a1, defender: opp }, { attacker: a2, defender: opp }] });
    for (let i = 0; i < 80 && s.step !== "endCombat" && s.step !== "main2"; i++) {
      const p = s.pending;
      if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: p.player === opp ? [{ blocker: wall, attacker: a1 }] : [] });
      else if (p) s = act(s, botActions(s, p.player)[0]!);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    s = settle(s);
    expect(zone(s, a1)).toBe("exile");
    expect(zone(s, a2)).toBe("battlefield");
    destroyPermanent(s, s.objects[wall]!, "destroyed");
    s = settle(s);
    const back = mine(s, ap, "Grizzly Bears");
    expect(back).toHaveLength(2);
  });
});

describe("round 234: the same targets on other cards", () => {
  it("Soul of Shandalar from your graveyard: 3 damage to target player and up to one creature that player controls", () => {
    let { s, ap, opp } = setup([]);
    const soulId = into(s, ap, soul(), "graveyard");
    const theirs = putOnBattlefield(s, opp, ogre);
    const other = putOnBattlefield(s, opps(s, ap)[1]!, ogre);
    expect(abilityProblem(s, ap, soulId, 1, [{ kind: "player", id: opp }, tgt(other)])).not.toBeNull();
    const life = s.players[opp]!.life;
    s = settle(run(s, planActivate(s, ap, soulId, 1, [{ kind: "player", id: opp }, tgt(theirs)])));
    expect(zone(s, soulId)).toBe("exile");
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(zone(s, theirs)).toBe("graveyard");
  });

  it("Unyaro Griffin counters a red instant, not a blue one", () => {
    let { s, ap, opp } = setup([]);
    const g = putOnBattlefield(s, ap, griffin());
    const blue = into(s, opp, card("Test Blue Ping", "Instant", "{U}", { cmc: 1, oracleText: "Test Blue Ping deals 1 damage to any target." }), "hand");
    const red = into(s, opp, ping, "hand");
    Object.assign(s.players[opp]!.manaPool, { U: 1, R: 1 });
    s = act(s, { type: "passPriority", player: ap });
    s = run(s, planCast(s, opp, blue, [{ kind: "player", id: ap }]));
    const blueItem = s.stack[s.stack.length - 1]!.id;
    expect(abilityProblem(s, ap, g, 0, [{ kind: "stack", id: blueItem }])).not.toBeNull();
    s = run(s, planCast(s, opp, red, [{ kind: "player", id: ap }]));
    const redItem = s.stack[s.stack.length - 1]!.id;
    const life = s.players[ap]!.life;
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(run(s, planActivate(s, ap, g, 0, [{ kind: "stack", id: redItem }])));
    expect(s.players[ap]!.life).toBe(life - 1);
    expect(s.players[opp]!.graveyard).toContain(red);
  });

  it("Ravager of the Fells: as it transforms, 2 damage to target opponent and up to one creature that player controls", () => {
    let { s, ap, opp } = setup([]);
    const h = putOnBattlefield(s, ap, huntmaster());
    const theirs = putOnBattlefield(s, opp, bear());
    // No spells this turn: it transforms at the next upkeep.
    for (let i = 0; i < 400 && !(s.pending?.kind === "chooseTargets" && s.pending.player === ap); i++) {
      const p = s.pending;
      if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: p.player, attacks: [] });
      else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
      else if (p) s = act(s, botActions(s, p.player)[0]!);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[h]!.face).toBe(1);
    const life = s.players[opp]!.life;
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }, tgt(theirs)] }));
    expect(s.players[opp]!.life).toBe(life - 2);
    expect(zone(s, theirs)).toBe("graveyard");
  });
});
