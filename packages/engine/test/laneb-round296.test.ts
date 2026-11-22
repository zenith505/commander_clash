// Lane B round B296: Havengul Laboratory // Havengul Mystery ("When the creature put onto the battlefield with Havengul Mystery
// leaves the battlefield, transform Havengul Mystery.", CR 607.1b, 607.2c, 701.27f) and Taskmaster, Mercenary Mimic (a copy
// of a creature on the battlefield or a creature card in a graveyard, with a set of types, CR 205.1a, 707.9b, 707.9d).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup, swamp, target } from "./helpers";
import { botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const lab = (): CardDef => ({"oracleId":"e71ac446-02a4-4468-8d29-f28b21617665","name":"Havengul Laboratory // Havengul Mystery","manaCost":"","cmc":0,"typeLine":"Legendary Land // Legendary Land","supertypes":["Legendary"],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{4}, {T}: Investigate. (Create a colorless Clue artifact token with \"{2}, Sacrifice this artifact: Draw a card.\")\nAt the beginning of your end step, if you sacrificed three or more Clues this turn, transform Havengul Laboratory.","colors":[],"colorIdentity":["B"],"keywords":["Investigate","Transform"],"producedMana":["B","C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/2/823b019e-10c0-4712-8167-d4f37a71e782.jpg?1783923615","artUrl":"https://cards.scryfall.io/art_crop/front/8/2/823b019e-10c0-4712-8167-d4f37a71e782.jpg?1783923615","commanderLegal":"legal","set":"slx","releasedAt":"2022-03-03","rarity":"rare","layout":"transform","gameChanger":false,"faces":[{"name":"Havengul Laboratory","manaCost":"","typeLine":"Legendary Land","supertypes":["Legendary"],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{4}, {T}: Investigate. (Create a colorless Clue artifact token with \"{2}, Sacrifice this artifact: Draw a card.\")\nAt the beginning of your end step, if you sacrificed three or more Clues this turn, transform Havengul Laboratory.","colors":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/2/823b019e-10c0-4712-8167-d4f37a71e782.jpg?1783923615","artUrl":"https://cards.scryfall.io/art_crop/front/8/2/823b019e-10c0-4712-8167-d4f37a71e782.jpg?1783923615"},{"name":"Havengul Mystery","manaCost":"","typeLine":"Legendary Land","supertypes":["Legendary"],"types":["Land"],"subtypes":[],"oracleText":"When this land transforms into Havengul Mystery, return target creature card from your graveyard to the battlefield.\nWhen the creature put onto the battlefield with Havengul Mystery leaves the battlefield, transform Havengul Mystery.\n{T}, Pay 1 life: Add {B}.","colors":[],"imageUrl":"https://cards.scryfall.io/normal/back/8/2/823b019e-10c0-4712-8167-d4f37a71e782.jpg?1783923615","artUrl":"https://cards.scryfall.io/art_crop/back/8/2/823b019e-10c0-4712-8167-d4f37a71e782.jpg?1783923615"}]}) as CardDef;
const bearsCard = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const murder = (): CardDef => ({"oracleId":"938b4e2c-88d9-4637-bc00-e228920c9a78","name":"Murder","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","artUrl":"https://cards.scryfall.io/art_crop/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const unsummon = (): CardDef => ({"oracleId":"837182db-1bf3-4a2c-bd01-1af9d9873561","name":"Unsummon","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Return target creature to its owner's hand.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddad9f16-52d5-49de-82b0-b1a5294a9c44.jpg?1789556722","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddad9f16-52d5-49de-82b0-b1a5294a9c44.jpg?1789556722","commanderLegal":"legal","set":"fra","releasedAt":"2026-10-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const taskmaster = (): CardDef => ({"oracleId":"dcd97730-b793-4c0c-b158-625ac3656b4a","name":"Taskmaster, Mercenary Mimic","manaCost":"{2}{U}{B}","cmc":4,"typeLine":"Legendary Creature — Human Mercenary Villain","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Mercenary","Villain"],"oracleText":"Photographic Reflexes — At the beginning of your first main phase, until your next turn, Taskmaster becomes a copy of up to one target creature on the battlefield or creature card in a graveyard, except his name is Taskmaster, Mercenary Mimic and he's a legendary Human Mercenary Villain creature.","power":"3","toughness":"5","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Photographic Reflexes"],"imageUrl":"https://cards.scryfall.io/normal/front/0/2/0251766b-ab59-4079-aea7-9968b49f04ef.jpg?1783902828","artUrl":"https://cards.scryfall.io/art_crop/front/0/2/0251766b-ab59-4079-aea7-9968b49f04ef.jpg?1783902828","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const thopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const outcast = (): CardDef => ({"oracleId":"a61ef0cc-1da9-49f9-b0dc-01cf9f6205be","name":"Changeling Outcast","manaCost":"{B}","cmc":1,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"Changeling (This card is every creature type.)\nThis creature can't block and can't be blocked.","power":"1","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Changeling"],"imageUrl":"https://cards.scryfall.io/normal/front/0/8/08151d00-513a-4957-aa16-01c0f0245112.jpg?1783933130","artUrl":"https://cards.scryfall.io/art_crop/front/0/8/08151d00-513a-4957-aa16-01c0f0245112.jpg?1783933130","commanderLegal":"legal","set":"mh1","releasedAt":"2019-06-14","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const druid = (): CardDef => ({"oracleId":"2fcc69ff-8ab5-4e14-afe3-db892049a872","name":"Boreal Druid","manaCost":"{G}","cmc":1,"typeLine":"Snow Creature — Elf Druid","supertypes":["Snow"],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {C}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/4/7/473d3633-6dc7-4026-a50e-3ea76b9e8c20.jpg?1783943332","artUrl":"https://cards.scryfall.io/art_crop/front/4/7/473d3633-6dc7-4026-a50e-3ea76b9e8c20.jpg?1783943332","commanderLegal":"legal","set":"csp","releasedAt":"2006-07-21","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const angel = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Plays on with no attacks or blocks until `done`, stopping at any other question. */
const until = (s: GameState, done: (s: GameState) => boolean, max = 3000) => {
  for (let i = 0; i < max && !s.over; i++) {
    if (done(s)) return s;
    const pid = waitingOn(s)!;
    const p = s.pending;
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (p?.kind === "pickPermanents" && p.action === "keepTapped") s = act(s, { type: "pickPermanents", player: pid, ids: [] });
    else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, p.count) });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: pid });
  }
  return s;
};
/** A copy of `def` in `pid`'s hand, on top of their library, or in their graveyard or exile. */
const put = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "library" | "graveyard" | "exile" = "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const name = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!).name;
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;

describe("Lane B round B296: compiles", () => {
  it("the card and the cards the tests use", () => supported(lab(), bearsCard(), murder(), unsummon(), bolt()));
});

const clue = () => card("Clue", "Artifact — Clue", "", { oracleText: "{2}, Sacrifice this token: Draw a card." });
/**
 * Havengul Laboratory on `ap`'s battlefield with a Grizzly Bears card in their graveyard; three Clues sacrificed, then on
 * to the end step, where it transforms into Havengul Mystery and returns the Bears (the only creature card there).
 */
const mysteryReturns = () => {
  const { s: s0, ap, opp } = setup([]);
  let s = s0;
  const land = putOnBattlefield(s, ap, lab());
  // Black mana left for a Murder afterwards.
  for (let i = 0; i < 3; i++) putOnBattlefield(s, ap, swamp);
  const dead = put(s, ap, bearsCard(), "graveyard");
  for (let i = 0; i < 3; i++) {
    const c = putOnBattlefield(s, ap, clue());
    s.objects[c]!.isToken = true;
    s = settle(run(s, planActivate(s, ap, c, 0)));
  }
  expect(name(s, land)).toBe("Havengul Laboratory");
  s = until(s, (x) => x.step === "end" && x.activePlayer === ap && (!!x.pending || x.stack.length > 0));
  s = settle(s);
  if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(dead)] }));
  expect(name(s, land)).toBe("Havengul Mystery");
  expect(zone(s, dead)).toBe("battlefield");
  return { s, ap, opp, land, bears: dead };
};
/** `ap` casts `def` (an instant) at `who` and everyone passes until the stack is empty. */
const castAt = (s: GameState, ap: PlayerId, def: CardDef, who: ObjectId) => settle(run(s, planCast(s, ap, put(s, ap, def), [target(who)])));
/** Turns the land over by some other effect (CR 701.27a), so `face` is up. */
const turnOver = (s: GameState, land: ObjectId, face: number) => {
  s.objects[land]!.face = face;
  s.objects[land]!.transforms = (s.objects[land]!.transforms ?? 0) + 1;
  invalidateCharacteristics(s);
};

describe("Lane B round B296: Havengul Laboratory // Havengul Mystery", () => {
  it("the creature it returned dies: Havengul Mystery transforms back into Havengul Laboratory", () => {
    let { s, ap, land, bears } = mysteryReturns();
    s = castAt(s, ap, murder(), bears);
    expect(zone(s, bears)).toBe("graveyard");
    expect(name(s, land)).toBe("Havengul Laboratory");
  });

  it("leaving for any zone counts (returned to its owner's hand); another creature leaving doesn't", () => {
    let { s, ap, opp, land, bears } = mysteryReturns();
    const other = putOnBattlefield(s, opp, bearsCard());
    s = castAt(s, ap, bolt(), other);
    expect(zone(s, other)).toBe("graveyard");
    expect(name(s, land)).toBe("Havengul Mystery");
    s = castAt(s, ap, unsummon(), bears);
    expect(zone(s, bears)).toBe("hand");
    expect(name(s, land)).toBe("Havengul Laboratory");
  });

  it("the link holds whichever face is up (CR 607.1b), but only Havengul Mystery's face triggers", () => {
    const a = mysteryReturns();
    let s = a.s;
    // Turned over by something else and back: the same object, so it's still the creature put onto the battlefield with it.
    turnOver(s, a.land, 0);
    turnOver(s, a.land, 1);
    s = castAt(s, a.ap, murder(), a.bears);
    expect(name(s, a.land)).toBe("Havengul Laboratory");
    // With Havengul Laboratory's face up when it leaves, there's no such ability to trigger.
    const b = mysteryReturns();
    s = b.s;
    turnOver(s, b.land, 0);
    s = castAt(s, b.ap, murder(), b.bears);
    expect(zone(s, b.bears)).toBe("graveyard");
    expect(name(s, b.land)).toBe("Havengul Laboratory");
    expect(s.objects[b.land]!.transforms).toBe(2);
  });
});

const ch = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!);
const others = (s: GameState, ap: PlayerId) => s.turnOrder.filter((p) => p !== ap);
/** Taskmaster on the battlefield of the next player, whose first main phase begins: the trigger asks for its target. */
const taskBegins = (more?: (s: GameState, me: PlayerId, ap: PlayerId) => void) => {
  const { s: s0, ap } = setup([]);
  const me = others(s0, ap)[0]!;
  const tm = putOnBattlefield(s0, me, taskmaster());
  more?.(s0, me, ap);
  let s = passUntil(s0, "draw", me);
  for (let i = 0; i < 50 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(s.step).toBe("main1");
  expect(s.pending).toMatchObject({ kind: "chooseTargets", player: me });
  return { s, me, ap, tm };
};
const chooses = (s: GameState, me: PlayerId, id?: ObjectId) => settle(act(s, { type: "chooseTargets", player: me, targets: [id ? target(id) : { kind: "none" }] }));
const pt = (s: GameState, id: ObjectId) => `${ch(s, id).power}/${ch(s, id).toughness}`;

describe("Lane B round B296: Taskmaster, Mercenary Mimic", () => {
  it("compiles, with the cards its tests use", () => supported(taskmaster(), thopter(), outcast(), druid(), angel()));

  it("a copy of an artifact creature on the battlefield: a legendary Human Mercenary Villain creature named Taskmaster, not an artifact (CR 205.1a)", () => {
    let thop = "";
    const { s: s1, me, tm } = taskBegins((s, _me, ap) => { thop = putOnBattlefield(s, ap, thopter()); });
    const s = chooses(s1, me, thop);
    const c = ch(s, tm);
    expect(c.name).toBe("Taskmaster, Mercenary Mimic");
    expect(c.types).toEqual(["Creature"]);
    expect([...c.subtypes].sort()).toEqual(["Human", "Mercenary", "Villain"]);
    expect(c.supertypes).toEqual(["Legendary"]);
    expect(c.keywords).toContain("Flying");
    expect(c.colors).toEqual([]);
    expect(pt(s, tm)).toBe("0/2");
    expect(s.log.some((l) => /becomes a copy of Ornithopter until .*'s next turn/.test(l.text))).toBe(true);
  });

  it("a copy of a creature card in an opponent's graveyard, as printed; the card stays there", () => {
    let dead = "";
    const { s: s1, me, tm } = taskBegins((s, _me, ap) => { dead = put(s, ap, angel(), "graveyard"); });
    const s = chooses(s1, me, dead);
    const c = ch(s, tm);
    expect(c.name).toBe("Taskmaster, Mercenary Mimic");
    expect(c.keywords).toEqual(expect.arrayContaining(["Flying", "Vigilance"]));
    expect(c.colors).toEqual(["W"]);
    expect([...c.subtypes].sort()).toEqual(["Human", "Mercenary", "Villain"]);
    expect(pt(s, tm)).toBe("4/4");
    expect(zone(s, dead)).toBe("graveyard");
  });

  it("keeps the supertypes it copied, legendary as well (CR 205.4b); a changeling's every creature type isn't copied (CR 707.9d)", () => {
    let snow = "", shifter = "";
    const a = taskBegins((s, _me, ap) => { snow = putOnBattlefield(s, ap, druid()); });
    let s = chooses(a.s, a.me, snow);
    expect([...ch(s, a.tm).supertypes].sort()).toEqual(["Legendary", "Snow"]);
    expect([...ch(s, a.tm).subtypes].sort()).toEqual(["Human", "Mercenary", "Villain"]);
    const b = taskBegins((s, _me, ap) => { shifter = putOnBattlefield(s, ap, outcast()); });
    s = chooses(b.s, b.me, shifter);
    expect(ch(s, b.tm).allCreatureTypes).toBe(false);
    expect([...ch(s, b.tm).subtypes].sort()).toEqual(["Human", "Mercenary", "Villain"]);
    expect(ch(s, shifter).allCreatureTypes).toBe(true);
  });

  it("lasts until your next turn, when it's Taskmaster again and its trigger asks once more", () => {
    let thop = "";
    const { s: s1, me, tm } = taskBegins((s, _me, ap) => { thop = putOnBattlefield(s, ap, thopter()); });
    let s = chooses(s1, me, thop);
    s = passUntil(s, "upkeep", others(s, me)[0]!);
    expect(ch(s, tm).keywords).toContain("Flying");
    s = passUntil(s, "upkeep", me);
    expect(ch(s, tm).keywords).not.toContain("Flying");
    expect(pt(s, tm)).toBe("3/5");
    for (let i = 0; i < 50 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.step).toBe("main1");
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: me });
  });

  it("with no target chosen, it stays as it is", () => {
    const { s: s1, me, tm } = taskBegins();
    const s = chooses(s1, me);
    expect(ch(s, tm).name).toBe("Taskmaster, Mercenary Mimic");
    expect(pt(s, tm)).toBe("3/5");
  });

  it("a bot picks its target, from the battlefield or a graveyard", () => {
    let dead = "";
    const { s: s1, me, tm } = taskBegins((s, _me, ap) => { dead = put(s, ap, angel(), "graveyard"); });
    let s = s1;
    for (const a of botActions(s, me)) s = act(s, a);
    s = settle(s);
    expect(pt(s, tm)).toBe("4/4");
    expect(ch(s, tm).keywords).toContain("Flying");
    expect(zone(s, dead)).toBe("graveyard");
  });
});
