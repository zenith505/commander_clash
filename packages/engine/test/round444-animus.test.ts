// Round 444 (Lane A): The Animus ("At the beginning of your end step, exile up to one target legendary creature card from a
// graveyard with a memory counter on it." and "{T}: Until your next turn, target legendary creature you control becomes a
// copy of target creature card in exile with a memory counter on it. Activate only as a sorcery.": CR 122.1, 406.3, 707.2,
// 611.2a; rulings).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, compileCard, invalidateCharacteristics, isFullySupported, planActivate, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const altair = (): CardDef => ({"oracleId":"43dc4b0c-e437-4abc-a3fb-48bd3098de88","name":"Altaïr Ibn-La'Ahad","manaCost":"{R}{W}{B}","cmc":3,"typeLine":"Legendary Creature — Human Assassin","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Assassin"],"oracleText":"First strike\nWhenever Altaïr attacks, exile up to one target Assassin creature card from your graveyard with a memory counter on it. Then for each creature card you own in exile with a memory counter on it, create a tapped and attacking token that's a copy of it. Exile those tokens at end of combat.","power":"3","toughness":"3","colors":["B","R","W"],"colorIdentity":["B","R","W"],"keywords":["First strike"],"imageUrl":"https://cards.scryfall.io/normal/front/3/5/358026de-ab7c-4a17-8cac-cfbee391b127.jpg?1783910975","artUrl":"https://cards.scryfall.io/art_crop/front/3/5/358026de-ab7c-4a17-8cac-cfbee391b127.jpg?1783910975","commanderLegal":"legal","set":"acr","releasedAt":"2024-07-05","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const animus = (): CardDef => ({"oracleId":"7e0062fb-aff8-4c41-96eb-1af656d8b195","name":"The Animus","manaCost":"{2}","cmc":2,"typeLine":"Legendary Artifact","supertypes":["Legendary"],"types":["Artifact"],"subtypes":[],"oracleText":"At the beginning of your end step, exile up to one target legendary creature card from a graveyard with a memory counter on it.\n{T}: Until your next turn, target legendary creature you control becomes a copy of target creature card in exile with a memory counter on it. Activate only as a sorcery.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/d/ad574010-01ee-4bbc-87c5-4b04338b6ef6.jpg?1783910966","artUrl":"https://cards.scryfall.io/art_crop/front/a/d/ad574010-01ee-4bbc-87c5-4b04338b6ef6.jpg?1783910966","commanderLegal":"legal","set":"acr","releasedAt":"2024-07-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const isamaru = (): CardDef => ({"oracleId":"cfb756dd-6fe1-430a-8f04-8b10cac62a86","name":"Isamaru, Hound of Konda","manaCost":"{W}","cmc":1,"typeLine":"Legendary Creature — Dog","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Dog"],"oracleText":"","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/e/2e7f9919-0713-4ef9-96eb-3e0c444e47f4.jpg?1783944338","artUrl":"https://cards.scryfall.io/art_crop/front/2/e/2e7f9919-0713-4ef9-96eb-3e0c444e47f4.jpg?1783944338","commanderLegal":"legal","set":"chk","releasedAt":"2004-10-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const visionary = (): CardDef => ({"oracleId":"c6a3a882-a127-4590-93d7-679ef4313efe","name":"Elvish Visionary","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Elf Shaman","supertypes":[],"types":["Creature"],"subtypes":["Elf","Shaman"],"oracleText":"When this creature enters, draw a card.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/9/69f570b5-1629-4b10-8f66-ed9b4355a0a4.jpg?1783908825","artUrl":"https://cards.scryfall.io/art_crop/front/6/9/69f570b5-1629-4b10-8f66-ed9b4355a0a4.jpg?1783908825","commanderLegal":"legal","set":"j25","releasedAt":"2024-11-15","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** A new card for `def` in `pid`'s graveyard. */
const inYard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** A new card for `def` in `pid`'s exile, with these counters on it. */
const inExile = (s: GameState, pid: PlayerId, def: CardDef, counters: Record<string, number>, faceDown = false) => {
  const id = inYard(s, pid, def);
  s.players[pid]!.graveyard.splice(s.players[pid]!.graveyard.indexOf(id), 1);
  s.objects[id]!.zone = "exile";
  s.objects[id]!.counters = { ...counters };
  if (faceDown) s.objects[id]!.faceDown = "morph";
  s.players[pid]!.exile.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Everyone passes until the stack is empty or `me` is asked something; bots answer the others. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const obj = (id: ObjectId): TargetChoice => ({ kind: "object", id });
const nameNow = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!).name;
const board = () => {
  const { s, ap, opp } = setup([]);
  const an = putOnBattlefield(s, ap, animus());
  const isa = putOnBattlefield(s, ap, isamaru());
  return { s, ap, opp, an, isa };
};
const COPY = 0;
/** Whether The Animus's ability can be activated with these targets. */
const canCopy = (s: GameState, pid: PlayerId, an: ObjectId, targets: TargetChoice[]) => {
  try {
    const plan = planActivate(s, pid, an, COPY, targets);
    if (!plan) return false;
    run(structuredClone(s), plan);
    return true;
  } catch {
    return false;
  }
};

describe("round 444: The Animus", () => {
  it("is fully supported", () => {
    expect(isFullySupported(animus())).toBe(true);
    const c = compileCard(animus());
    expect(c.triggers[0]!.event).toBe("yourEndStep");
    expect(c.triggers[0]!.body.targets[0]).toMatchObject({ kind: "card", supertypes: ["Legendary"], types: ["Creature"], optional: true });
    expect(c.triggers[0]!.body.effects[0]).toMatchObject({ type: "exile", counters: { memory: 1 } });
    expect(c.activated[COPY]!.sorcerySpeed).toBe(true);
    expect(c.activated[COPY]!.body.targets[1]).toMatchObject({ kind: "card", inExile: true, exiledWithCounter: "memory", types: ["Creature"] });
    expect(c.activated[COPY]!.body.effects[0]).toMatchObject({ type: "becomeCopy", duration: "yourNextTurn", of: { ref: "target", index: 1, card: true } });
  });

  it("at your end step, exiles a legendary creature card from an opponent's graveyard with a memory counter", () => {
    const { s: s0, ap, opp } = board();
    const theirs = inYard(s0, opp, altair());
    const bear = inYard(s0, opp, bears());
    let s = settle(passUntil(s0, "end", ap), ap);
    expect(s.pending?.kind).toBe("chooseTargets");
    // Grizzly Bears isn't legendary.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [obj(bear)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [obj(theirs)] }), ap);
    expect(s.objects[theirs]!.zone).toBe("exile");
    expect(s.objects[theirs]!.counters.memory).toBe(1);
    expect(s.objects[bear]!.zone).toBe("graveyard");
  });

  it("{T}: Isamaru becomes a copy of the exiled Grizzly Bears until your next turn", () => {
    const { s: s0, ap, opp, an, isa } = board();
    const card = inExile(s0, opp, bears(), { memory: 1 });
    let s = settle(run(s0, planActivate(s0, ap, an, COPY, [obj(isa), obj(card)])), ap);
    expect(s.objects[an]!.tapped).toBe(true);
    const c = characteristics(s, s.objects[isa]!);
    expect(c.name).toBe("Grizzly Bears");
    expect(c.supertypes).not.toContain("Legendary");
    expect(c.subtypes).toEqual(["Bear"]);
    // Still a copy through the other players' turns (its end step trigger finds no legendary creature card).
    s = settle(passUntil(s, "end", ap), ap);
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "none" }] }), ap);
    s = passUntil(s, "main1", opp);
    expect(nameNow(s, isa)).toBe("Grizzly Bears");
    // Over as your next turn begins.
    s = passUntil(s, "upkeep", ap);
    expect(nameNow(s, isa)).toBe("Isamaru, Hound of Konda");
  });

  it("copies exactly what's printed (rulings): an Elvish Visionary copy's enters ability doesn't trigger, and its card stays in exile", () => {
    const { s: s0, ap, opp, an, isa } = board();
    const card = inExile(s0, ap, visionary(), { memory: 1 });
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planActivate(s0, ap, an, COPY, [obj(isa), obj(card)])), ap);
    expect(nameNow(s, isa)).toBe("Elvish Visionary");
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.objects[card]!.zone).toBe("exile");
    void opp;
  });

  it("targets: a legendary creature you control, and a face-up creature card in exile with a memory counter", () => {
    const { s, ap, opp, an, isa } = board();
    const bear = putOnBattlefield(s, ap, bears());
    const theirIsa = putOnBattlefield(s, opp, isamaru());
    const good = inExile(s, opp, bears(), { memory: 1 });
    const noCounter = inExile(s, opp, bears(), { time: 1 });
    const faceDown = inExile(s, opp, bears(), { memory: 1 }, true);
    const notCreature = inExile(s, opp, animus(), { memory: 1 });
    const inGrave = inYard(s, opp, bears());
    s.objects[inGrave]!.counters = { memory: 1 };
    expect(canCopy(s, ap, an, [obj(isa), obj(good)])).toBe(true);
    for (const t of [bear, theirIsa]) expect(canCopy(s, ap, an, [obj(t), obj(good)])).toBe(false);
    for (const t of [noCounter, faceDown, notCreature, inGrave]) expect(canCopy(s, ap, an, [obj(isa), obj(t)])).toBe(false);
  });

  it("only as a sorcery: not in combat", () => {
    const { s: s0, ap, opp, an, isa } = board();
    const card = inExile(s0, opp, bears(), { memory: 1 });
    const s = passUntil(s0, "beginCombat", ap);
    expect(canCopy(s, ap, an, [obj(isa), obj(card)])).toBe(false);
    expect(canCopy(passUntil(s, "main2", ap), ap, an, [obj(isa), obj(card)])).toBe(true);
  });

  it("the exiled card gone before it resolves (rulings): nothing happens", () => {
    const { s: s0, ap, opp, an, isa } = board();
    const card = inExile(s0, opp, bears(), { memory: 1 });
    let s = run(s0, planActivate(s0, ap, an, COPY, [obj(isa), obj(card)]));
    // The memory counter comes off with the ability on the stack: no longer a legal target.
    s.objects[card]!.counters = {};
    s = settle(s, ap);
    expect(nameNow(s, isa)).toBe("Isamaru, Hound of Konda");
  });

  it("a bot uses its Animus on its legendary creature in its second main phase", () => {
    const { s: s0, ap, opp, an, isa } = board();
    inExile(s0, opp, altair(), { memory: 1 });
    let s = passUntil(s0, "main2", ap);
    // The bot acts until it passes priority with the stack empty (a land first).
    for (let i = 0; i < 30 && s.step === "main2" && !s.objects[an]!.tapped; i++) {
      const p = s.pending;
      s = settle(run(s, botActions(s, p ? p.player : waitingOn(s)!)));
    }
    s = settle(s);
    expect(s.objects[an]!.tapped).toBe(true);
    expect(nameNow(s, isa)).toBe("Altaïr Ibn-La'Ahad");
  });
  it("a bot doesn't make its legendary creature a copy of something worse: Llanowar Elves", () => {
    const { s: s0, ap, opp, an, isa } = board();
    inExile(s0, opp, elves(), { memory: 1 });
    let s = passUntil(s0, "main2", ap);
    for (let i = 0; i < 30 && s.step === "main2" && !s.objects[an]!.tapped; i++) {
      const p = s.pending;
      s = settle(run(s, botActions(s, p ? p.player : waitingOn(s)!)));
    }
    expect(nameNow(s, isa)).toBe("Isamaru, Hound of Konda");
  });
});
