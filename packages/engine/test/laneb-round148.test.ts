// Lane B round B148: Courier of Comestibles ("you may search ... If you don't put a card into your hand this way, create
// a Food token"), Haktos the Unscarred (a number chosen at random as it enters, CR 614.12, and protection from every
// other mana value, CR 702.16a), Archangel of Strife (each player chooses war or peace as it enters, the active player
// first, rulings; their creatures get +3/+0 or +0/+3), Council Guardian (protection from each color with the most votes or
// tied, CR 701.38), Xathrid Demon ("sacrifice a creature other than ~, then ... If you can't sacrifice a creature, ..."),
// Torment of Venom (a punisher whose sacrifice is "another nonland permanent": not the creature targeted), Celestial
// Judgment (one creature of each power chosen, the rest destroyed) and Borderland Explorer ("each player may discard a
// card. Each player who discarded a card this way may search ...") and Mana Maze (no spell sharing a color with the last spell
// cast this turn).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, dealDamage, objectSource, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const courier = (): CardDef => ({"oracleId":"049d8b06-db90-4b9c-8195-d987b3ef1005","name":"Courier of Comestibles","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Human Citizen","supertypes":[],"types":["Creature"],"subtypes":["Human","Citizen"],"oracleText":"When this creature enters, you may search your library for a Food card, reveal it, put it into your hand, then shuffle. If you don't put a card into your hand this way, create a Food token. (It's an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")","power":"1","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":["Food"],"imageUrl":"https://cards.scryfall.io/normal/front/5/3/53f5f704-2265-42bb-bff5-fd9d85bc2bfb.jpg?1783904089","artUrl":"https://cards.scryfall.io/art_crop/front/5/3/53f5f704-2265-42bb-bff5-fd9d85bc2bfb.jpg?1783904089","commanderLegal":"legal","set":"tmt","releasedAt":"2026-03-06","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const haktos = (): CardDef => ({"oracleId":"932a86e5-9640-4ef5-8264-2ce97bde33e2","name":"Haktos the Unscarred","manaCost":"{R}{R}{W}{W}","cmc":4,"typeLine":"Legendary Creature — Human Warrior","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Warrior"],"oracleText":"Haktos attacks each combat if able.\nAs Haktos enters, choose 2, 3, or 4 at random.\nHaktos has protection from each mana value other than the chosen number.","power":"6","toughness":"1","colors":["R","W"],"colorIdentity":["R","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/f/6fe5cbef-0f4e-4d05-9a94-4739e09d7a9c.jpg?1783931521","artUrl":"https://cards.scryfall.io/art_crop/front/6/f/6fe5cbef-0f4e-4d05-9a94-4739e09d7a9c.jpg?1783931521","commanderLegal":"legal","set":"thb","releasedAt":"2020-01-24","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const archangel = (): CardDef => ({"oracleId":"19e302f8-6ddb-4a43-98bc-ee71a456ac5a","name":"Archangel of Strife","manaCost":"{5}{W}{W}","cmc":7,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nAs this creature enters, each player chooses war or peace.\nCreatures controlled by players who chose war get +3/+0.\nCreatures controlled by players who chose peace get +0/+3.","power":"6","toughness":"6","colors":["W"],"colorIdentity":["W"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/5/1/51104596-ffb3-49e3-a1d5-fa294da0d758.jpg?1783941257","artUrl":"https://cards.scryfall.io/art_crop/front/5/1/51104596-ffb3-49e3-a1d5-fa294da0d758.jpg?1783941257","commanderLegal":"legal","set":"cmd","releasedAt":"2011-06-17","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const foodCard = (): CardDef => ({"oracleId":"1389c9fa-fec2-4212-a7aa-6dfb318dc202","name":"Bagel and Schmear","manaCost":"{1}","cmc":1,"typeLine":"Artifact — Food","supertypes":[],"types":["Artifact"],"subtypes":["Food"],"oracleText":"Share — {W}, {T}, Sacrifice this artifact: Put a +1/+1 counter on up to one target creature. Draw a card. Activate only as a sorcery.\nNosh — {2}, {T}, Sacrifice this artifact: You gain 3 life and draw a card.","colors":[],"colorIdentity":["W"],"keywords":["Nosh","Share"],"imageUrl":"https://cards.scryfall.io/normal/front/7/f/7f927f72-fc9b-444f-9e0e-78a5e8e7bcaa.jpg?1783905307","artUrl":"https://cards.scryfall.io/art_crop/front/7/f/7f927f72-fc9b-444f-9e0e-78a5e8e7bcaa.jpg?1783905307","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const council = (): CardDef => ({"oracleId":"4f212675-e34d-4387-a125-e17b25757083","name":"Council Guardian","manaCost":"{5}{W}","cmc":6,"typeLine":"Creature — Giant Soldier","supertypes":[],"types":["Creature"],"subtypes":["Giant","Soldier"],"oracleText":"Will of the council — When this creature enters, starting with you, each player votes for blue, black, red, or green. This creature gains protection from each color with the most votes or tied for most votes.","power":"5","toughness":"5","colors":["W"],"colorIdentity":["W"],"keywords":["Will of the council"],"imageUrl":"https://cards.scryfall.io/normal/front/3/3/3394ecc3-3b37-4e4a-880b-3aa62b288900.jpg?1783939378","artUrl":"https://cards.scryfall.io/art_crop/front/3/3/3394ecc3-3b37-4e4a-880b-3aa62b288900.jpg?1783939378","commanderLegal":"legal","set":"cns","releasedAt":"2014-06-06","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const xathrid = (): CardDef => ({"oracleId":"dd2bbc90-0474-42b7-afe4-3655a120ab02","name":"Xathrid Demon","manaCost":"{3}{B}{B}{B}","cmc":6,"typeLine":"Creature — Demon","supertypes":[],"types":["Creature"],"subtypes":["Demon"],"oracleText":"Flying, trample\nAt the beginning of your upkeep, sacrifice a creature other than this creature, then each opponent loses life equal to the sacrificed creature's power. If you can't sacrifice a creature, tap this creature and you lose 7 life.","power":"7","toughness":"7","colors":["B"],"colorIdentity":["B"],"keywords":["Flying","Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/0/5/059e8ead-f295-4ca7-a309-6768e6e765cf.jpg?1783942376","artUrl":"https://cards.scryfall.io/art_crop/front/0/5/059e8ead-f295-4ca7-a309-6768e6e765cf.jpg?1783942376","commanderLegal":"legal","set":"m10","releasedAt":"2009-07-17","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const torment = (): CardDef => ({"oracleId":"9e9a7f0b-ffba-43d6-892a-95fd0b8b39f8","name":"Torment of Venom","manaCost":"{2}{B}{B}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Put three -1/-1 counters on target creature. Its controller loses 3 life unless they sacrifice another nonland permanent of their choice or discard a card.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/f/2f66410b-67a3-4f6a-b3ae-dcad9858a5da.jpg?1783936034","artUrl":"https://cards.scryfall.io/art_crop/front/2/f/2f66410b-67a3-4f6a-b3ae-dcad9858a5da.jpg?1783936034","commanderLegal":"legal","set":"hou","releasedAt":"2017-07-14","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const judgment = (): CardDef => ({"oracleId":"d18c40cd-0f38-498b-8882-10381a831751","name":"Celestial Judgment","manaCost":"{4}{W}{W}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"For each different power among creatures on the battlefield, choose a creature with that power. Destroy each creature not chosen this way.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/f/5fd29cd7-9950-49c0-9e71-d6b0f944292c.jpg?1783925382","artUrl":"https://cards.scryfall.io/art_crop/front/5/f/5fd29cd7-9950-49c0-9e71-d6b0f944292c.jpg?1783925382","commanderLegal":"legal","set":"mic","releasedAt":"2021-09-24","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const explorer = (): CardDef => ({"oracleId":"65bc4f8a-3226-4648-862b-3f62736ff1ae","name":"Borderland Explorer","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Elf Scout","supertypes":[],"types":["Creature"],"subtypes":["Elf","Scout"],"oracleText":"When this creature enters, each player may discard a card. Each player who discarded a card this way may search their library for a basic land card, reveal it, put it into their hand, then shuffle.","power":"3","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/e/dec6181f-c8bc-4858-912a-181b423185cd.jpg?1783937345","artUrl":"https://cards.scryfall.io/art_crop/front/d/e/dec6181f-c8bc-4858-912a-181b423185cd.jpg?1783937345","commanderLegal":"legal","set":"cn2","releasedAt":"2016-08-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const maze = (): CardDef => ({"oracleId":"5b6f9d55-eae8-48fd-a1d1-d56939adaf3a","name":"Mana Maze","manaCost":"{1}{U}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Players can't cast spells that share a color with the spell most recently cast this turn.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/d/0d62cc17-8fa3-495c-a098-ffbbec89fa53.jpg?1783945707","artUrl":"https://cards.scryfall.io/art_crop/front/0/d/0d62cc17-8fa3-495c-a098-ffbbec89fa53.jpg?1783945707","commanderLegal":"legal","set":"inv","releasedAt":"2000-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const next = (s: GameState, p: PlayerId, n = 1) => s.turnOrder[(s.turnOrder.indexOf(p) + n) % 4]!;
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
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
/** As settle, but bots answer every question. */
const settleBots = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Pass to `step` of `pid`'s next turn (answering what whole turns ask with nothing). */
const passTo = (s: GameState, pid: PlayerId, step: "upkeep") => {
  s = passUntil(s, "end", s.activePlayer);
  return passUntil(s, step, pid);
};
const foods = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid && characteristics(s, s.objects[id]!).subtypes.includes("Food"));
/** A test instant with this mana value that deals 1 damage to any target. */
const pinger = (mv: number) => card(`Test Ping ${mv}`, "Instant", `${mv > 1 ? `{${mv - 1}}` : ""}{R}`, { cmc: mv, oracleText: `Test Ping ${mv} deals 1 damage to any target.` });

describe("Lane B round B148", () => {
  it("compiles the cards", () => supported(courier(), haktos(), archangel(), council(), xathrid(), torment(), judgment(), explorer(), maze()));

  it("Courier of Comestibles: a Food card found goes to the hand and no token is made", () => {
    const { s: s0, ap, ids } = setup([courier()]);
    const food = into(s0, ap, foodCard(), "library");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.pending?.kind).toBe("searchLibrary");
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [food] }));
    expect(s.objects[food]!.zone).toBe("hand");
    expect(foods(s, ap)).toHaveLength(0);
  });

  it("Courier of Comestibles: declining the search, or finding nothing, makes a Food token", () => {
    {
      const { s: s0, ap, ids } = setup([courier()]);
      into(s0, ap, foodCard(), "library");
      let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
      s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
      expect(foods(s, ap)).toHaveLength(1);
    }
    {
      const { s: s0, ap, ids } = setup([courier()]);
      let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
      s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
      if (s.pending?.kind === "searchLibrary") s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }));
      expect(foods(s, ap)).toHaveLength(1);
    }
  });

  it("Haktos the Unscarred: 2, 3 or 4 is chosen at random as it enters, no one asked", () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 15; seed++) {
      const { s: s0, ap, ids } = setup([haktos()], seed);
      const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
      expect(s.pending).toBeFalsy();
      const n = s.objects[ids[0]!]!.chosen?.number;
      expect([2, 3, 4]).toContain(n);
      expect(s.log.some((l) => l.text.includes(`number is chosen at random: ${n}`))).toBe(true);
      seen.add(n!);
    }
    expect(seen.size).toBe(3);
  });

  it("Haktos the Unscarred: protection from each mana value but the chosen one (spells of other mana values can't target it)", () => {
    const { s: s0, ap, ids } = setup([haktos(), pinger(1), pinger(2), pinger(3), pinger(4), pinger(5)]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const n = s.objects[ids[0]!]!.chosen!.number!;
    for (let mv = 1; mv <= 5; mv++) {
      const plan = planCast(s, ap, ids[mv]!, [tgt(ids[0]!)]);
      expect(!!plan, `mana value ${mv} with ${n} chosen`).toBe(mv === n);
    }
  });

  it("Haktos the Unscarred: damage from a token (mana value 0) is prevented; with no number chosen it has no protection", () => {
    const { s: s0, ap, ids } = setup([haktos(), pinger(1)]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const h = ids[0]!;
    expect(characteristics(s, s.objects[h]!).keywords).toContain(`Protection from mana values other than ${s.objects[h]!.chosen!.number}`);
    // A token that isn't a copy has mana value 0 (rulings): its damage is prevented; a creature of the chosen mana value's isn't.
    const token = putOnBattlefield(s, ap, bear({ name: "Test Token Bear", manaCost: "", cmc: 0 }));
    s.objects[token]!.isToken = true;
    const same = putOnBattlefield(s, ap, bear({ name: "Test Same", cmc: s.objects[h]!.chosen!.number!, manaCost: `{${s.objects[h]!.chosen!.number! - 1}}{G}` }));
    invalidateCharacteristics(s);
    expect(dealDamage(s, objectSource(s, s.objects[token]!), { object: s.objects[h]! }, 1)).toBe(0);
    expect(planCast(s, ap, ids[1]!, [tgt(h)])).toBeNull();
    // No choice made: no protection (rulings).
    s.objects[h]!.chosen = undefined;
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[h]!).keywords.some((k) => k.startsWith("Protection"))).toBe(false);
    s = run(s, planCast(s, ap, ids[1]!, [tgt(h)]));
    expect(s.stack).toHaveLength(1);
    // Its toughness is 1: the creature of the chosen mana value's damage, dealt before, would have killed it.
    s.objects[h]!.chosen = { number: characteristics(s, s.objects[same]!).manaValue };
    invalidateCharacteristics(s);
    expect(dealDamage(s, objectSource(s, s.objects[same]!), { object: s.objects[h]! }, 1)).toBe(1);
  });

  it("Archangel of Strife: each player chooses war or peace, the active player first, then in turn order", () => {
    const { s: s0, ap, ids } = setup([archangel()]);
    const b1 = putOnBattlefield(s0, next(s0, ap, 1), bear());
    const b2 = putOnBattlefield(s0, next(s0, ap, 2), bear());
    const b3 = putOnBattlefield(s0, next(s0, ap, 3), bear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const words = ["war", "peace", "war", "peace"];
    for (let i = 0; i < 4; i++) {
      expect(s.pending).toMatchObject({ kind: "chooseOption", what: "playerWord", player: next(s, ap, i), options: ["war", "peace"] });
      s = settle(act(s, { type: "chooseOption", player: next(s, ap, i), choice: words[i]! }));
    }
    expect(s.pending).toBeFalsy();
    expect(pt(s, ids[0]!)).toBe("9/6");
    expect(pt(s, b1)).toBe("2/5");
    expect(pt(s, b2)).toBe("5/2");
    expect(pt(s, b3)).toBe("2/5");
    // A creature that changes control gets the bonus of its new controller's choice.
    s.objects[b1]!.controller = next(s, ap, 2);
    invalidateCharacteristics(s);
    expect(pt(s, b1)).toBe("5/2");
  });

  it("Archangel of Strife: the bonus stops when it leaves; two Archangels with war and peace give +3/+3", () => {
    const { s: s0, ap, ids } = setup([archangel()]);
    let s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    const chosen = s.objects[ids[0]!]!.chosen!.byPlayer!;
    expect(Object.keys(chosen).map(Number).sort()).toEqual([...s.turnOrder].sort());
    const mine = putOnBattlefield(s, ap, bear());
    invalidateCharacteristics(s);
    expect(pt(s, mine)).toBe(chosen[ap] === "war" ? "5/2" : "2/5");
    // A second one where this player chose the other word.
    const second = putOnBattlefield(s, ap, archangel());
    s.objects[second]!.chosen = { byPlayer: { [ap]: chosen[ap] === "war" ? "peace" : "war" } };
    invalidateCharacteristics(s);
    expect(pt(s, mine)).toBe("5/5");
    // Both leave: back to a 2/2.
    for (const id of [ids[0]!, second]) {
      s.battlefield.splice(s.battlefield.indexOf(id), 1);
      s.objects[id]!.zone = "graveyard";
    }
    invalidateCharacteristics(s);
    expect(pt(s, mine)).toBe("2/2");
  });

  it("Council Guardian: protection from each color with the most votes, ties included", () => {
    const { s: s0, ap, ids } = setup([council()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const votes = ["blue", "red", "blue", "red"];
    for (let i = 0; i < 4; i++) {
      expect(s.pending).toMatchObject({ kind: "chooseOption", what: "vote", player: next(s, ap, i) });
      s = settle(act(s, { type: "chooseOption", player: next(s, ap, i), choice: votes[i]! }));
    }
    const kw = characteristics(s, s.objects[ids[0]!]!).keywords;
    expect(kw).toContain("Protection from blue");
    expect(kw).toContain("Protection from red");
    expect(kw).not.toContain("Protection from black");
    expect(kw).not.toContain("Protection from green");
  });

  it("Council Guardian: a 3-1 vote gives protection from that color only; bots vote and it resolves", () => {
    {
      const { s: s0, ap, ids } = setup([council()]);
      let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
      for (const [i, c] of ["green", "green", "black", "green"].entries()) s = settle(act(s, { type: "chooseOption", player: next(s, ap, i), choice: c }));
      const kw = characteristics(s, s.objects[ids[0]!]!).keywords.filter((k) => k.startsWith("Protection"));
      expect(kw).toEqual(["Protection from green"]);
    }
    {
      const { s: s0, ap, ids } = setup([council()]);
      // An opponent with red creatures: the Guardian's controller wants protection from red.
      for (let i = 0; i < 2; i++) putOnBattlefield(s0, next(s0, ap, 1), bear({ name: `Test Red Bear ${i}`, manaCost: "{1}{R}", colors: ["R"], colorIdentity: ["R"] }));
      invalidateCharacteristics(s0);
      const s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
      expect(s.resolving).toBeFalsy();
      // Its controller votes red; the red player doesn't.
      expect(s.log.some((l) => l.text === `${s.players[ap]!.name} votes for red.`)).toBe(true);
      expect(s.log.some((l) => l.text === `${s.players[next(s, ap, 1)]!.name} votes for red.`)).toBe(false);
    }
  });

  it("Xathrid Demon: sacrifice another creature, each opponent loses its power; with none, tap it and lose 7", () => {
    {
      const { s: s0, ap } = setup([]);
      const demon = putOnBattlefield(s0, ap, xathrid());
      const ogre = putOnBattlefield(s0, ap, bear({ name: "Test Ogre", power: "4", toughness: "4" }));
      let s = passTo(s0, ap, "upkeep");
      s = settle(s);
      if (s.pending?.kind === "pickPermanents") s = settle(act(s, { type: "pickPermanents", player: ap, ids: [ogre] }));
      expect(s.objects[ogre]!.zone).toBe("graveyard");
      for (let i = 1; i < 4; i++) expect(s.players[next(s, ap, i)]!.life).toBe(36);
      expect(s.players[ap]!.life).toBe(40);
      expect(s.objects[demon]!.tapped).toBeFalsy();
    }
    {
      const { s: s0, ap } = setup([]);
      const demon = putOnBattlefield(s0, ap, xathrid());
      let s = settle(passTo(s0, ap, "upkeep"));
      expect(s.objects[demon]!.zone).toBe("battlefield");
      expect(s.objects[demon]!.tapped).toBe(true);
      expect(s.players[ap]!.life).toBe(33);
      for (let i = 1; i < 4; i++) expect(s.players[next(s, ap, i)]!.life).toBe(40);
    }
  });

  it("Torment of Venom: the creature's controller may sacrifice another nonland permanent, not that creature", () => {
    const { s: s0, ap, ids } = setup([torment()]);
    const opp = next(s0, ap, 1);
    const victim = putOnBattlefield(s0, opp, bear({ name: "Test Big", power: "5", toughness: "5" }));
    const other = putOnBattlefield(s0, opp, bear());
    s0.players[opp]!.hand = [];
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(victim)])));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "punisher", player: opp, options: ["0", "none"] });
    s = settle(act(s, { type: "chooseOption", player: opp, choice: "0" }));
    if (s.pending?.kind === "pickPermanents") {
      expect(s.pending.options).toEqual([other]);
      s = settle(act(s, { type: "pickPermanents", player: opp, ids: [other] }));
    }
    expect(s.objects[other]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(40);
    expect(pt(s, victim)).toBe("2/2");
  });

  it("Torment of Venom: with only the target as a nonland permanent and no cards, the controller loses 3 life", () => {
    const { s: s0, ap, ids } = setup([torment()]);
    const opp = next(s0, ap, 1);
    const victim = putOnBattlefield(s0, opp, bear({ name: "Test Big", power: "5", toughness: "5" }));
    s0.players[opp]!.hand = [];
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(victim)])));
    expect(s.pending).toBeFalsy();
    expect(s.players[opp]!.life).toBe(37);
  });

  it("Celestial Judgment: one creature of each power stays, the rest are destroyed", () => {
    const { s: s0, ap, ids } = setup([judgment()]);
    const opp = next(s0, ap, 1);
    const a2 = putOnBattlefield(s0, ap, bear());
    const b2 = putOnBattlefield(s0, opp, bear());
    const c2 = putOnBattlefield(s0, opp, bear());
    const d4 = putOnBattlefield(s0, opp, bear({ name: "Test Four", power: "4", toughness: "4" }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, count: 2, differentPowers: true });
    expect(() => act(s, { type: "pickPermanents", player: ap, ids: [a2, b2] })).toThrow();
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [b2, d4] }));
    expect(s.objects[b2]!.zone).toBe("battlefield");
    expect(s.objects[d4]!.zone).toBe("battlefield");
    expect(s.objects[a2]!.zone).toBe("graveyard");
    expect(s.objects[c2]!.zone).toBe("graveyard");
  });

  it("Celestial Judgment: a bot keeps one of each power", () => {
    const { s: s0, ap, ids } = setup([judgment()]);
    const made = [bear(), bear(), bear({ name: "Test Four", power: "4", toughness: "4" }), bear({ name: "Test One", power: "1", toughness: "1" })].map((d, i) => putOnBattlefield(s0, next(s0, ap, i), d));
    const s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    const left = made.filter((id) => s.objects[id]!.zone === "battlefield");
    expect(left).toHaveLength(3);
    expect(new Set(left.map((id) => pt(s, id))).size).toBe(3);
  });

  it("Borderland Explorer: each player may discard a card; those who did may search for a basic land", () => {
    const { s: s0, ap, ids } = setup([explorer()]);
    const opp = next(s0, ap, 1);
    s0.players[opp]!.hand = [into(s0, opp, bear(), "hand")].slice(-1);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    // In turn order: you, then the others; only those with a card in hand are asked.
    const asked: PlayerId[] = [];
    for (let i = 0; i < 4 && s.pending?.kind === "chooseMay"; i++) {
      const p = s.pending.player;
      asked.push(p);
      s = settle(act(s, { type: "chooseMay", player: p, yes: p === opp }));
    }
    expect(asked).toEqual([0, 1, 2, 3].map((i) => next(s, ap, i)).filter((p) => s.players[p]!.hand.length > 0 || p === opp));
    expect(s.players[opp]!.graveyard.length).toBe(1);
    // The one who discarded may search.
    for (let i = 0; i < 4 && s.pending; i++) {
      const p = s.pending;
      if (p.kind === "chooseMay") s = settle(act(s, { type: "chooseMay", player: p.player, yes: true }));
      else if (p.kind === "searchLibrary") {
        expect(p.player).toBe(opp);
        const land = s.players[opp]!.library.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest")!;
        s = settle(act(s, { type: "searchLibrary", player: opp, found: [land] }));
      } else break;
    }
    expect(s.players[opp]!.hand.map((id) => s.cards[s.objects[id]!.cardId]!.name)).toEqual(["Forest"]);
    for (const p of s.turnOrder.filter((x) => x !== opp)) expect(s.log.some((l) => l.text.startsWith(s.players[p]!.name) && /searches/.test(l.text))).toBe(false);
  });

  it("Mana Maze: no spell sharing a color with the spell most recently cast this turn; the first one and colorless ones are fine", () => {
    const red = card("Test Red Ping", "Instant", "{R}", { oracleText: "Test Red Ping deals 1 damage to any target." });
    const red2 = card("Test Red Ping Two", "Instant", "{R}", { oracleText: "Test Red Ping Two deals 1 damage to any target." });
    const gold = card("Test Gold Ping", "Instant", "{R}{G}", { oracleText: "Test Gold Ping deals 1 damage to any target." });
    const green = card("Test Green Ping", "Instant", "{G}", { oracleText: "Test Green Ping deals 1 damage to any target." });
    const grey = card("Test Grey Ping", "Artifact", "{1}");
    const { s: s0, ap, ids } = setup([red, red2, gold, green, grey]);
    putOnBattlefield(s0, next(s0, ap, 1), maze());
    invalidateCharacteristics(s0);
    const opp: TargetChoice = { kind: "player", id: next(s0, ap, 1) };
    // The first spell of the turn: nothing was cast before it.
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [opp])));
    expect(planCast(s, ap, ids[1]!, [opp])).toBeNull();
    expect(planCast(s, ap, ids[2]!, [opp])).toBeNull();
    s = settle(run(s, planCast(s, ap, ids[3]!, [opp])));
    // Now green was last: red is fine again, the red-green one isn't.
    expect(planCast(s, ap, ids[1]!, [opp])).not.toBeNull();
    expect(planCast(s, ap, ids[2]!, [opp])).toBeNull();
    // A colorless spell shares no color, and after it anything goes.
    s = settle(run(s, planCast(s, ap, ids[4]!)));
    expect(planCast(s, ap, ids[2]!, [opp])).not.toBeNull();
  });
});
