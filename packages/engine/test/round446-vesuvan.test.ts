// Round 446: Vesuvan Shapeshifter's "As this creature enters or is turned face up, you may choose another creature on the
// battlefield. If you do, until this creature is turned face down, it becomes a copy of that creature, except it has "At the
// beginning of your upkeep, you may turn this creature face down."" (CR 614.1c, 614.1e, 707.9b, 611.2a, 702.37e).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, compileCard, defOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, planTurnFaceUp, turnFaceUpProblem, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const vesuvan = (): CardDef => ({"oracleId":"ec577886-fb25-455b-9c3d-5fd610959436","name":"Vesuvan Shapeshifter","manaCost":"{3}{U}{U}","cmc":5,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"As this creature enters or is turned face up, you may choose another creature on the battlefield. If you do, until this creature is turned face down, it becomes a copy of that creature, except it has \"At the beginning of your upkeep, you may turn this creature face down.\"\nMorph {1}{U}","power":"0","toughness":"0","colors":["U"],"colorIdentity":["U"],"keywords":["Morph"],"imageUrl":"https://cards.scryfall.io/normal/front/1/f/1fe9eaf6-8f48-4b97-a6f8-a22a63225ed6.jpg?1783932773","artUrl":"https://cards.scryfall.io/art_crop/front/1/f/1fe9eaf6-8f48-4b97-a6f8-a22a63225ed6.jpg?1783932773","commanderLegal":"legal","set":"c19","releasedAt":"2019-08-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const visionary = (): CardDef => ({"oracleId":"c6a3a882-a127-4590-93d7-679ef4313efe","name":"Elvish Visionary","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Elf Shaman","supertypes":[],"types":["Creature"],"subtypes":["Elf","Shaman"],"oracleText":"When this creature enters, draw a card.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/9/69f570b5-1629-4b10-8f66-ed9b4355a0a4.jpg?1783908825","artUrl":"https://cards.scryfall.io/art_crop/front/6/9/69f570b5-1629-4b10-8f66-ed9b4355a0a4.jpg?1783908825","commanderLegal":"legal","set":"j25","releasedAt":"2024-11-15","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const denProtector = (): CardDef => ({"oracleId":"59324efc-65b7-4b31-89c5-17aed5c7eeb1","name":"Den Protector","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Human Warrior","supertypes":[],"types":["Creature"],"subtypes":["Human","Warrior"],"oracleText":"Creatures with power less than this creature's power can't block it.\nMegamorph {1}{G} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its megamorph cost and put a +1/+1 counter on it.)\nWhen this creature is turned face up, return target card from your graveyard to your hand.","power":"2","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":["Megamorph"],"imageUrl":"https://cards.scryfall.io/normal/front/b/d/bd90d5ea-c586-4afd-be75-1c821e48df0c.jpg?1783938581","artUrl":"https://cards.scryfall.io/art_crop/front/b/d/bd90d5ea-c586-4afd-be75-1c821e48df0c.jpg?1783938581","commanderLegal":"legal","set":"dtk","releasedAt":"2015-03-27","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const ixidor = (): CardDef => ({"oracleId":"90b98aa7-c8d0-4853-887c-164f8160c3f3","name":"Ixidor, Reality Sculptor","manaCost":"{3}{U}{U}","cmc":5,"typeLine":"Legendary Creature — Human Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"Face-down creatures get +1/+1.\n{2}{U}: Turn target face-down creature face up.","power":"3","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/1/314d5e89-55f7-42b4-af19-d4d0f499a265.jpg?1783945082","artUrl":"https://cards.scryfall.io/art_crop/front/3/1/314d5e89-55f7-42b4-af19-d4d0f499a265.jpg?1783945082","commanderLegal":"legal","set":"ons","releasedAt":"2002-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const clone = (): CardDef => ({"oracleId":"42226b87-0746-4ebf-9fd0-108d508462af","name":"Clone","manaCost":"{3}{U}","cmc":4,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"You may have this creature enter as a copy of any creature on the battlefield.","power":"0","toughness":"0","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/8/48c2e9e2-f679-451d-a700-18104af08988.jpg?1784013893","artUrl":"https://cards.scryfall.io/art_crop/front/4/8/48c2e9e2-f679-451d-a700-18104af08988.jpg?1784013893","commanderLegal":"legal","set":"sld","releasedAt":"2026-06-15","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Pass, and let bots answer every other choice, until the stack and trigger queue are empty; `answer` gives the test's own answer. */
function settle(s: GameState, answer?: (s: GameState) => Action | undefined) {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    const mine = answer?.(s);
    if (mine) s = act(s, mine);
    else if (s.pending) s = act(s, botActions(s, pid)[0]!);
    else s = act(s, { type: "passPriority", player: pid });
  }
  return s;
}
/** Plays on (no attacks or blocks, other questions answered as bots) until `done`. */
function playUntil(s: GameState, done: (s: GameState) => boolean, answer?: (s: GameState) => Action | undefined, max = 3000) {
  for (let i = 0; i < max; i++) {
    if (done(s)) return s;
    const pid = waitingOn(s)!;
    const p = s.pending;
    const mine = answer?.(s);
    if (mine) s = act(s, mine);
    else if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, p.count) });
    else if (p) s = act(s, botActions(s, pid)[0]!);
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error("never done");
}
const ch = (s: GameState, id: string) => characteristics(s, s.objects[id]!);
/** Answers the "copy" question as it enters with `to` (an id or "none"). */
const copyAs = (ap: PlayerId, to: string) => (x: GameState): Action | undefined => {
  const p = x.pending;
  return p?.kind === "chooseOption" && p.what === "copy" && p.player === ap ? { type: "chooseOption", player: ap, choice: to } : undefined;
};
/** `id` on `ap`'s battlefield face down (cast as a morph, CR 702.37c). */
function faceDownOn(s: GameState, ap: PlayerId, def: CardDef) {
  const id = putOnBattlefield(s, ap, def);
  s.objects[id]!.faceDown = "morph";
  invalidateCharacteristics(s);
  return id;
}

describe("round 446: Vesuvan Shapeshifter", () => {
  it("is fully supported, its copy chosen as it enters and as it's turned face up", () => {
    expect(isFullySupported(vesuvan())).toBe(true);
    const c = compileCard(vesuvan());
    expect(c.entersAsCopy).toMatchObject({ untilFaceDown: true, faceUp: true, except: { text: ["At the beginning of your upkeep, you may turn ~ face down."] } });
  });

  it("cast face up, it enters as a copy of the creature chosen, anyone's: that creature's enters trigger, and the upkeep trigger too", () => {
    const { s: s0, ap, ids, opp } = setup([vesuvan()]);
    const vis = putOnBattlefield(s0, opp, visionary());
    putOnBattlefield(s0, ap, bears());
    let asked: string[] = [];
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), (x) => {
      const p = x.pending;
      if (p?.kind === "chooseOption" && p.what === "copy" && p.player === ap) asked = [...p.options];
      return copyAs(ap, vis)(x);
    });
    // Another creature on the battlefield, either player's; or none.
    expect(asked).toContain(vis);
    expect(asked).toContain("none");
    const v = ids[0]!;
    expect(s.objects[v]!.zone).toBe("battlefield");
    expect(ch(s, v).name).toBe("Elvish Visionary");
    expect([ch(s, v).power, ch(s, v).toughness]).toEqual([1, 1]);
    expect(s.objects[v]!.copyEffects?.map((e) => e.until)).toEqual(["faceDown"]);
    // Elvish Visionary's "When this creature enters, draw a card." triggered for it (hand: Vesuvan cast, one card drawn).
    expect(s.players[ap]!.hand.length).toBe(hand);
    // The copy's exception: the upkeep trigger, so a copy of it has it too (rulings).
    expect(compileCard(defOf(s, s.objects[v]!)).triggers.some((t) => t.event === "yourUpkeep")).toBe(true);
  });

  it("with no copy chosen it's a 0/0 and dies (CR 704.5f)", () => {
    const { s: s0, ap, ids } = setup([vesuvan()]);
    putOnBattlefield(s0, ap, bears());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), copyAs(ap, "none"));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("at your upkeep you may turn it face down: the copy ends, it's a 2/2, and its own morph turns it face up as a copy of something else", () => {
    const { s: s0, ap, ids } = setup([vesuvan()]);
    const bear = putOnBattlefield(s0, ap, bears());
    const g = putOnBattlefield(s0, ap, giant());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), copyAs(ap, bear));
    const v = ids[0]!;
    expect(ch(s, v).name).toBe("Grizzly Bears");
    // On to our next upkeep: yes, turn it face down.
    let askedMay = false;
    s = playUntil(s, (x) => x.activePlayer === ap && x.step === "draw" && x.turn > s0.turn, (x) => {
      const p = x.pending;
      if (p?.kind === "chooseMay" && p.player === ap && p.prompt === "turn Grizzly Bears face down") {
        askedMay = true;
        return { type: "chooseMay", player: ap, yes: true };
      }
      return undefined;
    });
    expect(askedMay).toBe(true);
    expect(s.objects[v]!.faceDown).toBe("morph");
    expect(s.objects[v]!.copyEffects).toBeUndefined();
    expect([ch(s, v).power, ch(s, v).toughness]).toEqual([2, 2]);
    expect(ch(s, v).name).toBe("Face-down creature");
    // Face up for its morph {1}{U}: the copy is chosen with it, Hill Giant this time.
    s = passUntil(s, "main1");
    const plan = planTurnFaceUp(s, ap, v, 0, 0, undefined, undefined, undefined, g)!;
    s = run(s, plan.slice(0, -1));
    expect(turnFaceUpProblem(s, ap, v)).toBeNull();
    // Without saying which creature (or none), it can't be done.
    expect(() => act(s, { type: "turnFaceUp", player: ap, objectId: v })).toThrow(/copy/);
    s = act(s, plan[plan.length - 1]!);
    expect(s.objects[v]!.faceDown).toBeFalsy();
    expect(ch(s, v).name).toBe("Hill Giant");
    expect([ch(s, v).power, ch(s, v).toughness]).toEqual([3, 3]);
    expect(s.objects[v]!.copyEffects?.map((e) => e.until)).toEqual(["faceDown"]);
    expect(compileCard(defOf(s, s.objects[v]!)).triggers.some((t) => t.event === "yourUpkeep")).toBe(true);
  });

  it("turned face up as a copy of Den Protector: the copy's \"when turned face up\" trigger triggers (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const den = putOnBattlefield(s0, ap, denProtector());
    const v = faceDownOn(s0, ap, vesuvan());
    // A card in the graveyard for Den Protector's trigger to return.
    const dead = putOnBattlefield(s0, ap, bears());
    s0.battlefield.splice(s0.battlefield.indexOf(dead), 1);
    s0.objects[dead]!.zone = "graveyard";
    s0.players[ap]!.graveyard.push(dead);
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planTurnFaceUp(s0, ap, v, 0, 0, undefined, undefined, undefined, den)));
    expect(ch(s, v).name).toBe("Den Protector");
    expect(s.objects[dead]!.zone).toBe("hand");
  });

  it("turned face up as no copy, it's a 0/0 and dies", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, bears());
    const v = faceDownOn(s0, ap, vesuvan());
    const s = settle(run(s0, planTurnFaceUp(s0, ap, v, 0, 0, undefined, undefined, undefined, "none")));
    expect(s.objects[v]!.zone).toBe("graveyard");
  });

  it("cast face down, nothing is chosen (a face-down spell has no abilities, CR 708.2)", () => {
    const { s: s0, ap, ids } = setup([vesuvan()]);
    putOnBattlefield(s0, ap, bears());
    let askedCopy = false;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { faceDown: true })), (x) => {
      if (x.pending?.kind === "chooseOption" && x.pending.what === "copy") askedCopy = true;
      return undefined;
    });
    expect(askedCopy).toBe(false);
    expect(s.objects[ids[0]!]!.faceDown).toBe("morph");
  });

  it("turned face up by Ixidor's ability: its controller chooses the creature as it's turned face up", () => {
    const { s: s0, ap } = setup([]);
    const ix = putOnBattlefield(s0, ap, ixidor());
    const g = putOnBattlefield(s0, ap, giant());
    const v = faceDownOn(s0, ap, vesuvan());
    let asked: { options: string[]; labels?: string[] } | undefined;
    const s = settle(run(s0, planActivate(s0, ap, ix, 0, [{ kind: "object", id: v }])), (x) => {
      const p = x.pending;
      if (p?.kind === "chooseOption" && p.what === "faceUpCopy" && p.player === ap) {
        asked = { options: [...p.options], labels: p.labels ? [...p.labels] : undefined };
        return { type: "chooseOption", player: ap, choice: g };
      }
      return undefined;
    });
    expect(asked?.options).toContain(g);
    expect(asked?.options).toContain(ix);
    expect(asked?.options).not.toContain(v);
    expect(asked?.labels).toContain("Copy Hill Giant");
    expect(s.objects[v]!.faceDown).toBeFalsy();
    expect(ch(s, v).name).toBe("Hill Giant");
  });

  it("a Clone copying it copies the exception too: it has the upkeep trigger (rulings)", () => {
    const { s: s0, ap, ids } = setup([vesuvan(), clone()]);
    const bear = putOnBattlefield(s0, ap, bears());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), copyAs(ap, bear));
    s = settle(run(s, planCast(s, ap, ids[1]!)), copyAs(ap, ids[0]!));
    const c = ids[1]!;
    expect(ch(s, c).name).toBe("Grizzly Bears");
    expect(compileCard(defOf(s, s.objects[c]!)).triggers.some((t) => t.event === "yourUpkeep")).toBe(true);
  });

  it("bots choose the best creature for it to copy as it's turned face up, and keep their copy at upkeep", () => {
    const { s: s0, ap } = setup([]);
    const ix = putOnBattlefield(s0, ap, ixidor());
    putOnBattlefield(s0, ap, bears());
    const g = putOnBattlefield(s0, ap, giant());
    const v = faceDownOn(s0, ap, vesuvan());
    // Ixidor's ability turns it face up; the bot answers the copy question.
    let s = settle(run(s0, planActivate(s0, ap, ix, 0, [{ kind: "object", id: v }])));
    expect(ch(s, v).name).toBe("Hill Giant");
    expect(s.objects[v]!.copyEffects?.some((e) => e.until === "faceDown")).toBe(true);
    // At its next upkeep the bot keeps it face up, a copy of Hill Giant.
    s = playUntil(s, (x) => x.activePlayer === ap && x.step === "draw" && x.turn > s0.turn);
    expect(s.log.some((l) => l.text === `${s.players[ap]!.name} chooses not to turn Hill Giant face down.`)).toBe(true);
    expect(s.objects[v]!.faceDown).toBeFalsy();
    expect(ch(s, v).name).toBe("Hill Giant");
    expect(g).toBeTruthy();
  });
});
