// Round 282, part two: paying life in rounds (Plague of Vermin), votes for players (Mob Verdict, Círdan the Shipwright),
// stun counters for each vote (Trap the Trespassers), a target the damaged player chooses (Bladegriff Prototype), a lore
// counter put or removed (Sigurd, Jarl of Ravensthorpe) and tapping for each fade counter (Tangle Wire).

import { describe, expect, it } from "vitest";
import { act, bear, cast, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, isFullySupported, planActivate, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
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
/** The players in turn order, starting with `first`. */
const from = (s: GameState, first: PlayerId) => {
  const i = s.turnOrder.indexOf(first);
  return [...s.turnOrder.slice(i), ...s.turnOrder.slice(0, i)];
};
const answer = (s: GameState, what: string, player: PlayerId, choice: string) => {
  expect(s.pending).toMatchObject({ kind: "chooseOption", what, player });
  return act(s, { type: "chooseOption", player, choice });
};
/** Each player in turn order from `first` votes for the next of `choices` (a player id, or an object id). */
const votes = (s: GameState, first: PlayerId, choices: (PlayerId | string)[]) => {
  from(s, first).forEach((pid, i) => {
    const c = choices[i]!;
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "vote", player: pid });
    const options = s.pending!.kind === "chooseOption" ? s.pending.options : [];
    const o = typeof c === "number" ? `p:${c}` : options.find((x) => x.startsWith(`${c}@`));
    expect(options).toContain(o);
    s = act(s, { type: "chooseOption", player: pid, choice: o! });
  });
  return settle(s);
};
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
};
const tokens = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]?.name === name).length;

// Real oracle text (Scryfall).
const plague = (): CardDef => ({"oracleId":"efc12acf-ffef-40a6-b2ce-fe93e89ad840","name":"Plague of Vermin","manaCost":"{6}{B}","cmc":7,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Starting with you, each player may pay any amount of life. Repeat this process until no one pays life. Each player creates a 1/1 black Rat creature token for each 1 life they paid this way.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/3/231613d6-d3b8-4b41-bc93-4d5da3fec5d0.jpg?1783942753","artUrl":"https://cards.scryfall.io/art_crop/front/2/3/231613d6-d3b8-4b41-bc93-4d5da3fec5d0.jpg?1783942753","commanderLegal":"legal","set":"shm","releasedAt":"2008-05-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const mob = (): CardDef => ({"oracleId":"cb91e09e-f7fb-44bc-b78f-de29705bd2d6","name":"Mob Verdict","manaCost":"{2}{R}{R}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Secret council — Each player secretly votes for another player, then those votes are revealed. For each vote an opponent received, Mob Verdict deals 2 damage to that player and each creature that player controls. For each vote you received, draw a card.","colors":["R"],"colorIdentity":["R"],"keywords":["Secret council"],"imageUrl":"https://cards.scryfall.io/normal/front/e/9/e9bdc40b-ab7a-44a4-afb5-41b6fc2dffdc.jpg?1783913043","artUrl":"https://cards.scryfall.io/art_crop/front/e/9/e9bdc40b-ab7a-44a4-afb5-41b6fc2dffdc.jpg?1783913043","commanderLegal":"legal","set":"mkc","releasedAt":"2024-02-09","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const cirdan = (): CardDef => ({"oracleId":"063e05b0-554f-4b55-9feb-e11f3927f3a6","name":"Círdan the Shipwright","manaCost":"{3}{G}{U}","cmc":5,"typeLine":"Legendary Creature — Elf Noble","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elf","Noble"],"oracleText":"Vigilance\nSecret council — Whenever Círdan enters or attacks, each player secretly votes for a player, then those votes are revealed. Each player draws a card for each vote they received. Each player who received no votes may put a permanent card from their hand onto the battlefield.","power":"3","toughness":"4","colors":["G","U"],"colorIdentity":["G","U"],"keywords":["Vigilance","Secret council"],"imageUrl":"https://cards.scryfall.io/normal/front/c/2/c26f61aa-c8e2-4304-ae81-10589bcf799a.jpg?1783915983","artUrl":"https://cards.scryfall.io/art_crop/front/c/2/c26f61aa-c8e2-4304-ae81-10589bcf799a.jpg?1783915983","commanderLegal":"legal","set":"ltc","releasedAt":"2023-06-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const trap = (): CardDef => ({"oracleId":"ef72af33-37fc-48ed-90d8-547c90e1609d","name":"Trap the Trespassers","manaCost":"{2}{U}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Secret council — Each player secretly votes for a creature you don't control, then those votes are revealed. For each creature with one or more votes, put that many stun counters on it, then tap it. (If a permanent with a stun counter would become untapped, remove one from it instead.)","colors":["U"],"colorIdentity":["U"],"keywords":["Secret council"],"imageUrl":"https://cards.scryfall.io/normal/front/a/0/a077a046-300b-41d2-b891-c57ebe983ba2.jpg?1783916030","artUrl":"https://cards.scryfall.io/art_crop/front/a/0/a077a046-300b-41d2-b891-c57ebe983ba2.jpg?1783916030","commanderLegal":"legal","set":"ltc","releasedAt":"2023-06-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bladegriff = (): CardDef => ({"oracleId":"9fff90b6-98ef-4f78-b08d-7e46dfc03403","name":"Bladegriff Prototype","manaCost":"{5}","cmc":5,"typeLine":"Artifact Creature — Griffin","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Griffin"],"oracleText":"Flying\nWhenever this creature deals combat damage to a player, destroy target nonland permanent of that player's choice that one of your opponents controls.","power":"3","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/b/3/b3c9b4fb-cfb6-4e5a-b23a-9aad9f69710e.jpg?1783928763","artUrl":"https://cards.scryfall.io/art_crop/front/b/3/b3c9b4fb-cfb6-4e5a-b23a-9aad9f69710e.jpg?1783928763","commanderLegal":"legal","set":"cmr","releasedAt":"2020-11-20","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const sigurd = (): CardDef => ({"oracleId":"eedd74c4-42d1-41ba-9051-dc518e45ebbb","name":"Sigurd, Jarl of Ravensthorpe","manaCost":"{R}{G}{W}","cmc":3,"typeLine":"Legendary Creature — Human Warrior","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Warrior"],"oracleText":"Vigilance, trample, lifelink\nBoast — {1}: Put a lore counter on target Saga you control or remove one from it. (Activate only if this creature attacked this turn and only once each turn.)\nWhenever you put a lore counter on a Saga you control, put a +1/+1 counter on up to one other target creature.","power":"3","toughness":"3","colors":["G","R","W"],"colorIdentity":["G","R","W"],"keywords":["Lifelink","Vigilance","Boast","Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/2/5/25ceade9-f12a-4724-b198-312fb4b1210b.jpg?1783910967","artUrl":"https://cards.scryfall.io/art_crop/front/2/5/25ceade9-f12a-4724-b198-312fb4b1210b.jpg?1783910967","commanderLegal":"legal","set":"acr","releasedAt":"2024-07-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const tangle = (): CardDef => ({"oracleId":"c4ea0931-43e0-4214-9e0b-213eee3a7e69","name":"Tangle Wire","manaCost":"{3}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"Fading 4 (This artifact enters with four fade counters on it. At the beginning of your upkeep, remove a fade counter from it. If you can't, sacrifice it.)\nAt the beginning of each player's upkeep, that player taps an untapped artifact, creature, or land they control for each fade counter on this artifact.","colors":[],"colorIdentity":[],"keywords":["Fading"],"imageUrl":"https://cards.scryfall.io/normal/front/3/b/3baec9c6-6f10-4e16-b3a0-910a9e1bf09e.jpg?1783926544","artUrl":"https://cards.scryfall.io/art_crop/front/3/b/3baec9c6-6f10-4e16-b3a0-910a9e1bf09e.jpg?1783926544","commanderLegal":"legal","set":"sld","releasedAt":"2021-06-21","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const benalia = (): CardDef => ({"oracleId":"c15bb7eb-aaaa-4468-9641-8f706d6137e8","name":"History of Benalia","manaCost":"{1}{W}{W}","cmc":3,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI, II — Create a 2/2 white Knight creature token with vigilance.\nIII — Knights you control get +2/+1 until end of turn.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/1/d134385d-b01c-41c7-bb2d-30722b44dc5a.jpg?1783935041","artUrl":"https://cards.scryfall.io/art_crop/front/d/1/d134385d-b01c-41c7-bb2d-30722b44dc5a.jpg?1783935041","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"mythic","layout":"saga","gameChanger":false}) as CardDef;

describe("round 282, part two", () => {
  it("every card compiles fully", () => {
    supported(plague(), mob(), cirdan(), trap(), bladegriff(), sigurd(), tangle());
  });
});

describe("Plague of Vermin", () => {
  it("rounds from the caster until a whole round goes by unpaid; a Rat for each 1 life paid, all at once", () => {
    let { s, ap, ids } = setup([plague()]);
    const [, b, c, d] = from(s, ap);
    const life = (p: PlayerId) => s.players[p]!.life;
    const start = [ap, b!, c!, d!].map(life);
    s = cast(s, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "payLifeRound", player: ap, numberRange: { min: 0, max: start[0] } });
    // Round one: you pay 3, C pays 2.
    s = answer(s, "payLifeRound", ap, "3");
    expect(life(ap)).toBe(start[0]! - 3);
    s = answer(s, "payLifeRound", b!, "0");
    s = answer(s, "payLifeRound", c!, "2");
    s = answer(s, "payLifeRound", d!, "0");
    // Round two: only C pays; it doesn't end at the first player who doesn't pay (rulings).
    expect(s.pending).toMatchObject({ player: ap, prompt: expect.stringContaining("paid 3 so far") });
    s = answer(s, "payLifeRound", ap, "0");
    s = answer(s, "payLifeRound", b!, "0");
    s = answer(s, "payLifeRound", c!, "1");
    expect(tokens(s, c!, "Rat Token")).toBe(0);
    s = answer(s, "payLifeRound", d!, "0");
    // Round three: nobody pays, so it's over.
    for (const p of [ap, b!, c!]) s = answer(s, "payLifeRound", p, "0");
    expect(s.pending).toMatchObject({ what: "payLifeRound", player: d });
    s = settle(answer(s, "payLifeRound", d!, "0"));
    expect(s.pending ?? undefined).toBeUndefined();
    expect(tokens(s, ap, "Rat Token")).toBe(3);
    expect(tokens(s, b!, "Rat Token")).toBe(0);
    expect(tokens(s, c!, "Rat Token")).toBe(3);
    expect(tokens(s, d!, "Rat Token")).toBe(0);
    expect(life(c!)).toBe(start[2]! - 3);
    expect(s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]?.name === "Rat Token")).toHaveLength(6);
  });

  it("no one can pay more than their life total, and bots stop paying", () => {
    let { s, ap, ids } = setup([plague()]);
    const [, b] = from(s, ap);
    s.players[b!]!.life = 4;
    s = cast(s, ap, ids[0]!);
    s = answer(s, "payLifeRound", ap, "0");
    expect(s.pending).toMatchObject({ player: b, numberRange: { max: 4 } });
    expect(() => act(s, { type: "chooseOption", player: b!, choice: "5" })).toThrow();
    // Bots answer every question until it's over.
    for (let i = 0; i < 40 && s.pending; i++) s = settle(act(s, botActions(s, waitingOn(s)!)[0]!));
    expect(s.pending ?? undefined).toBeUndefined();
    expect(s.stack).toHaveLength(0);
  });
});

describe("secret council votes for players", () => {
  it("Mob Verdict: 2 damage for each vote to that opponent and each of their creatures; a card for each vote you got", () => {
    let { s, ap, ids } = setup([mob()]);
    const [, b, c, d] = from(s, ap);
    const bBear = putOnBattlefield(s, b!, bear());
    const cBear = putOnBattlefield(s, c!, bear());
    const mine = putOnBattlefield(s, ap, bear());
    const lifeB = s.players[b!]!.life;
    const hand = s.players[ap]!.hand.length;
    s = cast(s, ap, ids[0]!);
    // Each votes for another player: not themselves.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "vote", player: ap, options: expect.arrayContaining([b, c, d].map((p) => `p:${p}`)) });
    expect(s.pending?.kind === "chooseOption" && s.pending.options).toHaveLength(3);
    s = votes(s, ap, [b!, ap, b!, ap]);
    expect(s.players[b!]!.life).toBe(lifeB - 4);
    expect(s.objects[bBear]!.zone).toBe("graveyard");
    expect(s.objects[cBear]!.zone).toBe("battlefield");
    expect(s.objects[mine]!.zone).toBe("battlefield");
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
  });

  it("Mob Verdict: bots vote, never for themselves", () => {
    let { s, ap, ids } = setup([mob()]);
    s = cast(s, ap, ids[0]!);
    for (let i = 0; i < 10 && s.pending; i++) {
      const p = s.pending;
      const a = botActions(s, waitingOn(s)!)[0]!;
      if (p.kind === "chooseOption" && a.type === "chooseOption") expect(a.choice).not.toBe(`p:${p.voter ?? p.player}`);
      s = settle(act(s, a));
    }
    expect(s.pending ?? undefined).toBeUndefined();
    expect(s.stack).toHaveLength(0);
  });

  it("Círdan: draws for votes from the active player, then each player with no votes may put a permanent card onto the battlefield", () => {
    let { s, ap, ids } = setup([cirdan()]);
    const [, b, c, d] = from(s, ap);
    const bCard = inHand(s, b!, bear({ name: "Bear of B" }));
    inHand(s, d!, bear({ name: "Bear of D" }));
    const hands = [ap, b, c, d].map((p) => s.players[p!]!.hand.length);
    s = settle(cast(s, ap, ids[0]!));
    // Its enters trigger: each votes for any player, themselves too.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "vote", player: ap, options: expect.arrayContaining([ap, b, c, d].map((p) => `p:${p}`)) });
    s = votes(s, ap, [ap, ap, c!, ap]);
    expect(s.players[ap]!.hand.length).toBe(hands[0]! - 1 + 3);
    expect(s.players[c!]!.hand.length).toBe(hands[2]! + 1);
    // B, then D: each got no votes.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: b, fromHand: true, min: 0 });
    s = act(s, { type: "searchLibrary", player: b!, found: [bCard] });
    expect(s.objects[bCard]!.zone).toBe("battlefield");
    expect(s.objects[bCard]!.controller).toBe(b);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: d, fromHand: true });
    s = settle(act(s, { type: "searchLibrary", player: d!, found: [] }));
    expect(s.pending ?? undefined).toBeUndefined();
    expect(s.players[d!]!.hand.length).toBe(hands[3]!);
  });
});

describe("Trap the Trespassers", () => {
  it("each creature with votes gets that many stun counters and is tapped; only creatures you don't control", () => {
    let { s, ap, ids } = setup([trap()]);
    const [, b, c] = from(s, ap);
    const x = putOnBattlefield(s, b!, bear({ name: "Bear X" }));
    const y = putOnBattlefield(s, c!, bear({ name: "Bear Y" }));
    const z = putOnBattlefield(s, c!, bear({ name: "Bear Z" }));
    const mine = putOnBattlefield(s, ap, bear());
    s.objects[y]!.tapped = true;
    s = cast(s, ap, ids[0]!);
    const options = s.pending?.kind === "chooseOption" ? s.pending.options : [];
    expect(options.some((o) => o.startsWith(`${mine}@`))).toBe(false);
    s = votes(s, ap, [x, x, y, x]);
    expect(s.objects[x]!.counters.stun).toBe(3);
    expect(s.objects[x]!.tapped).toBe(true);
    expect(s.objects[y]!.counters.stun).toBe(1);
    expect(s.objects[z]!.counters.stun ?? 0).toBe(0);
    expect(s.objects[z]!.tapped).toBe(false);
  });
});

describe("Bladegriff Prototype", () => {
  const hit = () => {
    let { s, ap } = setup([]);
    const [, b, c] = from(s, ap);
    const g = putOnBattlefield(s, ap, bladegriff());
    const myRing = putOnBattlefield(s, ap, tangle());
    const bThing = putOnBattlefield(s, b!, tangle());
    const cThing = putOnBattlefield(s, c!, tangle());
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: g, defender: b! }] });
    return { ...toDamage(s), ap, b: b!, c: c!, myRing, bThing, cThing };
  };
  /** On through blocks (none) to the combat damage trigger's question. */
  const toDamage = (s: GameState) => {
    for (let i = 0; i < 40 && s.pending?.kind !== "chooseTargets" && s.step !== "endCombat"; i++) {
      const w = waitingOn(s)!;
      s = act(s, s.pending?.kind === "declareBlockers" ? { type: "declareBlockers", player: w, blocks: [] } : { type: "passPriority", player: w });
    }
    return { s };
  };

  it("the player dealt damage chooses the target among the permanents your opponents control", () => {
    let { s, b, myRing, bThing, cThing } = hit();
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: b });
    // Not one of yours; it may be another opponent's.
    expect(() => applyAction(s, { type: "chooseTargets", player: b, targets: [{ kind: "object", id: myRing }] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: b, targets: [{ kind: "object", id: cThing }] }));
    expect(s.objects[cThing]!.zone).toBe("graveyard");
    expect(s.objects[bThing]!.zone).toBe("battlefield");
  });

  it("if that player left the game, an opponent the controller chooses picks (CR 800.4g)", () => {
    let { s, ap } = setup([]);
    const [, b, c, d] = from(s, ap);
    const g = putOnBattlefield(s, ap, bladegriff());
    const dThing = putOnBattlefield(s, d!, tangle());
    s.players[b!]!.life = 1;
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: g, defender: b! }] });
    for (let i = 0; i < 40 && !(s.pending?.kind === "chooseOption" || s.pending?.kind === "chooseTargets") && s.step !== "endCombat"; i++) {
      const w = waitingOn(s)!;
      s = act(s, s.pending?.kind === "declareBlockers" ? { type: "declareBlockers", player: w, blocks: [] } : { type: "passPriority", player: w });
    }
    expect(s.players[b!]!.lost).toBe(true);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "targetChooser", player: ap, options: expect.arrayContaining([String(c), String(d)]) });
    expect(s.pending?.kind === "chooseOption" && s.pending.options).toHaveLength(2);
    s = act(s, { type: "chooseOption", player: ap, choice: String(c) });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: c });
    s = settle(act(s, { type: "chooseTargets", player: c!, targets: [{ kind: "object", id: dThing }] }));
    expect(s.objects[dThing]!.zone).toBe("graveyard");
  });
});

describe("Sigurd, Jarl of Ravensthorpe", () => {
  it("boast: a lore counter on target Saga or one removed; each lore counter you put on a Saga puts a +1/+1 counter on up to one other creature", () => {
    let { s, ap } = setup([]);
    const sg = putOnBattlefield(s, ap, sigurd());
    const saga = putOnBattlefield(s, ap, benalia());
    s.objects[saga]!.counters = { lore: 1 };
    const friend = putOnBattlefield(s, ap, bear());
    s = passUntil(s, "declareAttackers", ap);
    const [, b] = from(s, ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: sg, defender: b! }] });
    s = settle(s);
    s = settle(run(s, planActivate(s, ap, sg, 0, [{ kind: "object", id: saga }])));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "either", labels: ["Put a lore counter on it", "Remove a lore counter from it"] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "0" }));
    expect(s.objects[saga]!.counters.lore).toBe(2);
    // Sigurd's trigger (up to one other target creature) and chapter II.
    for (let i = 0; i < 10 && s.pending; i++) s = settle(act(s, botActions(s, waitingOn(s)!)[0]!));
    expect(s.objects[friend]!.counters["+1/+1"]).toBe(1);
    expect(tokens(s, ap, "Knight Token")).toBe(1);
  });
});

describe("Tangle Wire", () => {
  it("each player taps an untapped artifact, creature or land they control for each fade counter on it", () => {
    let { s, ap } = setup([]);
    const [, b] = from(s, ap);
    const tw = putOnBattlefield(s, ap, tangle());
    s.objects[tw]!.counters = { fade: 2 };
    const bb = [bear({ name: "B1" }), bear({ name: "B2" }), bear({ name: "B3" })].map((d) => putOnBattlefield(s, b!, d));
    s = settle(passUntil(s, "upkeep", b));
    expect(s.pending).toMatchObject({ player: b });
    const p = s.pending!;
    expect(JSON.stringify(p)).toContain(bb[0]!);
    s = settle(act(s, botActions(s, b!)[0]!));
    expect(bb.filter((id) => s.objects[id]!.tapped)).toHaveLength(2);
  });
});
