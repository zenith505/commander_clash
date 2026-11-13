// Round 354 (Lane A): tiered modes that set a base power and toughness (Vincent's Limit Break), a dying creature's
// token copy that's a Spirit linked to the card exiled for it (Hofri Ghostforge), a reflexive trigger aimed at a card
// exiled this way (Espers to Magicite), a Food copy of a creature dealt damage by a Spider you controlled (Shelob, Child
// of Ungoliant), and each opponent's land search, one of the lands yours (Rootweaver Druid).

import { describe, expect, it } from "vitest";
import { act, pt, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, dealDamage, invalidateCharacteristics, isFullySupported, moveObject, objectSource, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; questions are answered as the bots would, except `me`'s (it stops there). */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player === me) return s;
    if (p) s = act(s, botActions(s, p.player)[0]!);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** One pass of priority, so state-based actions and triggers happen. */
const pass = (s: GameState) => act(s, { type: "passPriority", player: waitingOn(s)! });
const toYard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
};
/** The players in turn order after `pid`. */
const after = (s: GameState, pid: PlayerId): [PlayerId, PlayerId, PlayerId] => {
  const at = (k: number) => s.turnOrder[(s.turnOrder.indexOf(pid) + k) % 4]!;
  return [at(1), at(2), at(3)];
};
const types = (s: GameState, id: string) => characteristics(s, s.objects[id]!);

// Real oracle text (Scryfall).
const vincent = (): CardDef => ({"oracleId":"814679b4-51bd-4b07-a7b8-d3375d36ff45","name":"Vincent's Limit Break","manaCost":"{1}{B}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Tiered (Choose one additional cost.)\nUntil end of turn, target creature you control gains \"When this creature dies, return it to the battlefield tapped under its owner's control\" and has the chosen base power and toughness.\n• Galian Beast — {0} — 3/2.\n• Death Gigas — {1} — 5/2.\n• Hellmasker — {3} — 7/2.","colors":["B"],"colorIdentity":["B"],"keywords":["Hellmasker","Death Gigas","Tiered","Galian Beast"],"commanderLegal":"legal","set":"fin","releasedAt":"2025-06-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const hofri = (): CardDef => ({"oracleId":"663d451b-f848-41cc-b541-0c6fe37d3d54","name":"Hofri Ghostforge","manaCost":"{3}{R}{W}","cmc":5,"typeLine":"Legendary Creature — Dwarf Cleric","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Dwarf","Cleric"],"oracleText":"Spirits you control get +1/+1 and have trample and haste.\nWhenever another nontoken creature you control dies, exile it. If you do, create a token that's a copy of that creature, except it's a Spirit in addition to its other types and it has \"When this token leaves the battlefield, return the exiled card to its owner's graveyard.\"","power":"4","toughness":"5","colors":["R","W"],"colorIdentity":["R","W"],"keywords":[],"commanderLegal":"legal","set":"stx","releasedAt":"2021-04-23","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const espers = (): CardDef => ({"oracleId":"06f7ec6d-d70e-44d8-bf43-ae667d244ab4","name":"Espers to Magicite","manaCost":"{3}{B}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Exile each opponent's graveyard. When you do, choose up to one target creature card exiled this way. Create a token that's a copy of that card, except it's an artifact and it loses all other card types.","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const shelob = (): CardDef => ({"oracleId":"8372115d-c963-4a41-8759-72f7f6a8935a","name":"Shelob, Child of Ungoliant","manaCost":"{4}{B}{G}","cmc":6,"typeLine":"Legendary Creature — Spider Demon","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Spider","Demon"],"oracleText":"Deathtouch, ward {2}\nOther Spiders you control have deathtouch and ward {2}.\nWhenever another creature dealt damage this turn by a Spider you controlled dies, create a token that's a copy of that creature, except it's a Food artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life,\" and it loses all other card types.","power":"8","toughness":"8","colors":["B","G"],"colorIdentity":["B","G"],"keywords":["Food","Ward","Deathtouch"],"commanderLegal":"legal","set":"ltr","releasedAt":"2023-11-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const rootweaver = (): CardDef => ({"oracleId":"6c2e6447-c32b-4b92-a3e6-4d770e3dd250","name":"Rootweaver Druid","manaCost":"{2}{G}","cmc":3,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"When this creature enters, each opponent may search their library for up to three basic land cards. They each put one of those cards onto the battlefield tapped under your control and the rest onto the battlefield tapped under their control. Then each player who searched their library this way shuffles.","power":"2","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"cmr","releasedAt":"2020-11-20","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const spider = (): CardDef => ({"oracleId":"e740ce2f-2134-473c-afa1-1b6d2d1e38ef","name":"Giant Spider","manaCost":"{3}{G}","cmc":4,"typeLine":"Creature — Spider","supertypes":[],"types":["Creature"],"subtypes":["Spider"],"oracleText":"Reach (This creature can block creatures with flying.)","power":"2","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":["Reach"],"commanderLegal":"legal","set":"gs1","releasedAt":"2018-06-22","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const murder = (): CardDef => ({"oracleId":"938b4e2c-88d9-4637-bc00-e228920c9a78","name":"Murder","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

describe("round 354: compiles", () => {
  it("every card of the round", () => supported(vincent(), hofri(), espers(), shelob(), rootweaver()));
});

describe("Vincent's Limit Break", () => {
  it("the chosen tier sets the base power and toughness until end of turn; counters still apply (CR 613.4b, 613.4c)", () => {
    const { s: s0, ap, ids } = setup([vincent()]);
    const b = putOnBattlefield(s0, ap, bears());
    s0.objects[b]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: b }], [2])));
    expect(pt(s, b)).toBe("8/3");
  });

  it("the tier's cost is an additional cost: Death Gigas costs {1} more", () => {
    const { s: s0, ap, ids } = setup([vincent()]);
    const b = putOnBattlefield(s0, ap, bears());
    const plan = planCast(s0, ap, ids[0]!, [{ kind: "object", id: b }], [1])!;
    const s = settle(run(s0, plan));
    expect(pt(s, b)).toBe("5/2");
    const tapped = s.battlefield.filter((id) => s.objects[id]!.tapped && characteristics(s, s.objects[id]!).types.includes("Land")).length;
    expect(tapped).toBe(3);
  });

  it("when the creature dies this turn it returns to the battlefield tapped under its owner's control, as a new object", () => {
    const { s: s0, ap, ids } = setup([vincent(), bolt()]);
    const b = putOnBattlefield(s0, ap, bears());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: b }], [0])));
    expect(pt(s, b)).toBe("3/2");
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: b }])));
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[b]!.tapped).toBe(true);
    expect(pt(s, b)).toBe("2/2");
  });

  it("a token dies and isn't returned (rulings)", () => {
    const { s: s0, ap, ids } = setup([vincent(), bolt()]);
    const b = putOnBattlefield(s0, ap, bears());
    s0.objects[b]!.isToken = true;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: b }], [0])));
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: b }])));
    expect(s.battlefield.includes(b)).toBe(false);
  });
});

describe("Hofri Ghostforge", () => {
  it("another nontoken creature of yours dies: its card is exiled and a Spirit token copy of it gets Hofri's bonus", () => {
    const { s: s0, ap, ids } = setup([murder()]);
    putOnBattlefield(s0, ap, hofri());
    const b = putOnBattlefield(s0, ap, bears());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: b }])));
    expect(s.objects[b]!.zone).toBe("exile");
    const tok = s.battlefield.find((id) => s.objects[id]!.isToken)!;
    expect(tok).toBeDefined();
    const c = types(s, tok);
    expect(c.name).toBe("Grizzly Bears");
    expect(c.subtypes).toEqual(expect.arrayContaining(["Bear", "Spirit"]));
    expect(c.keywords).toEqual(expect.arrayContaining(["Trample", "Haste"]));
    expect(pt(s, tok)).toBe("3/3");
  });

  it("when the Spirit leaves the battlefield, the exiled card goes back to its owner's graveyard", () => {
    const { s: s0, ap, ids } = setup([murder(), bolt()]);
    putOnBattlefield(s0, ap, hofri());
    const b = putOnBattlefield(s0, ap, bears());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: b }])));
    const tok = s.battlefield.find((id) => s.objects[id]!.isToken)!;
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: tok }])));
    expect(s.battlefield.includes(tok)).toBe(false);
    expect(s.objects[b]!.zone).toBe("graveyard");
    // The Spirit token dying doesn't make another one (it's a token).
    expect(s.battlefield.some((id) => s.objects[id]!.isToken)).toBe(false);
  });

  it("only the card exiled for that token comes back, and not if it has left exile", () => {
    const { s: s0, ap, ids } = setup([shock(), bolt(), bolt()]);
    putOnBattlefield(s0, ap, hofri());
    const b = putOnBattlefield(s0, ap, bears());
    const g = putOnBattlefield(s0, ap, giant());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: b }])));
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: g }])));
    const bearTok = s.battlefield.find((id) => s.objects[id]!.isToken && types(s, id).name === "Grizzly Bears")!;
    s = settle(run(s, planCast(s, ap, ids[2]!, [{ kind: "object", id: bearTok }])));
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[g]!.zone).toBe("exile");
  });

  it("no exile, no token: the card left the graveyard before the trigger resolved (rulings)", () => {
    const { s: s0, ap, ids } = setup([murder()]);
    putOnBattlefield(s0, ap, hofri());
    const b = putOnBattlefield(s0, ap, bears());
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: b }]));
    for (let i = 0; i < 20 && !(s.objects[b]!.zone === "graveyard" && s.stack.length === 1 && !s.triggerQueue.length); i++) s = pass(s);
    expect(s.stack.length).toBe(1);
    // The card goes elsewhere in response (as if by another effect): a new object (CR 400.7).
    const p = s.players[ap]!;
    p.graveyard.splice(p.graveyard.indexOf(b), 1);
    p.hand.push(b);
    s.objects[b]!.zone = "hand";
    s.objects[b]!.zoneChanges = (s.objects[b]!.zoneChanges ?? 0) + 1;
    s = settle(s);
    expect(s.battlefield.some((id) => s.objects[id]!.isToken)).toBe(false);
    expect(s.objects[b]!.zone).toBe("hand");
  });

  it("Hofri itself, an opponent's creature and a token don't trigger it", () => {
    const { s: s0, ap, opp, ids } = setup([shock(), murder()]);
    const h = putOnBattlefield(s0, ap, hofri());
    const ob = putOnBattlefield(s0, opp, bears());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: ob }])));
    expect(s.objects[ob]!.zone).toBe("graveyard");
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: h }])));
    expect(s.objects[h]!.zone).toBe("graveyard");
    expect(s.battlefield.some((id) => s.objects[id]!.isToken)).toBe(false);
  });
});

describe("Espers to Magicite", () => {
  it("exiles each opponent's graveyard, then a token copy of a creature card exiled this way, an artifact only", () => {
    const { s: s0, ap, ids } = setup([espers()]);
    const [b, c] = after(s0, ap);
    const mine = toYard(s0, ap, giant());
    const gb = toYard(s0, b, giant());
    const cb = toYard(s0, c, bolt());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, ap);
    expect(s.objects[gb]!.zone).toBe("exile");
    expect(s.objects[cb]!.zone).toBe("exile");
    expect(s.objects[mine]!.zone).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    // Only a creature card exiled this way: not the instant, not your own graveyard's.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: cb }] })).toThrow();
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: mine }] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: gb }] }));
    const tok = s.battlefield.find((id) => s.objects[id]!.isToken)!;
    const ch = types(s, tok);
    expect(ch.name).toBe("Hill Giant");
    expect(ch.types).toEqual(["Artifact"]);
    expect(ch.subtypes).toEqual([]);
    expect(characteristics(s, s.objects[tok]!).controller).toBe(ap);
  });

  it("a creature card exiled earlier isn't one exiled this way", () => {
    const { s: s0, ap, ids } = setup([espers()]);
    const [b] = after(s0, ap);
    const old = toYard(s0, b, giant());
    const p = s0.players[b]!;
    p.graveyard.splice(p.graveyard.indexOf(old), 1);
    p.exile.push(old);
    s0.objects[old]!.zone = "exile";
    const gb = toYard(s0, b, bears());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: old }] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: gb }] }));
    expect(s.battlefield.some((id) => s.objects[id]!.isToken && types(s, id).name === "Grizzly Bears")).toBe(true);
  });

  it("a bot copies the costliest creature card it exiled", () => {
    const { s: s0, ap, ids } = setup([espers()]);
    const [b, c] = after(s0, ap);
    toYard(s0, b, bears());
    toYard(s0, c, giant());
    toYard(s0, c, hofri());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken).map((id) => types(s, id).name)).toEqual(["Hofri Ghostforge"]);
  });

  it("with no card exiled, nothing triggers", () => {
    const { s: s0, ap, ids } = setup([espers()]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(s.pending).toBeNull();
    expect(s.battlefield.some((id) => s.objects[id]!.isToken)).toBe(false);
  });
});

describe("Shelob, Child of Ungoliant", () => {
  it("a creature dealt damage this turn by a Spider you controlled dies: a Food copy of it that's no longer a creature", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, shelob());
    const sp = putOnBattlefield(s0, ap, spider());
    const ob = putOnBattlefield(s0, opp, bears());
    dealDamage(s0, objectSource(s0, s0.objects[sp]!), { object: s0.objects[ob]! }, 2);
    const s = settle(pass(s0));
    expect(s.objects[ob]!.zone).toBe("graveyard");
    const tok = s.battlefield.find((id) => s.objects[id]!.isToken)!;
    const ch = types(s, tok);
    expect(ch.name).toBe("Grizzly Bears");
    expect(ch.types).toEqual(["Artifact"]);
    expect(ch.subtypes).toEqual(["Food"]);
    expect(ch.controller).toBe(ap);
  });

  it("the Spider dying at the same time doesn't matter: it was a Spider you controlled as it dealt the damage", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, shelob());
    const sp = putOnBattlefield(s0, ap, spider());
    const g = putOnBattlefield(s0, opp, giant());
    const ob = putOnBattlefield(s0, opp, bears());
    // Deathtouch from Shelob: 1 is enough.
    dealDamage(s0, objectSource(s0, s0.objects[sp]!), { object: s0.objects[ob]! }, 1);
    dealDamage(s0, objectSource(s0, s0.objects[g]!), { object: s0.objects[sp]! }, 4);
    const s = settle(pass(s0));
    expect(s.objects[sp]!.zone).toBe("graveyard");
    expect(s.objects[ob]!.zone).toBe("graveyard");
    // One Food: the bears' (the Spider was dealt damage by a Giant).
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken).map((id) => types(s, id).name)).toEqual(["Grizzly Bears"]);
  });

  it("not damage from an opponent's Spider or from a creature that isn't a Spider", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, shelob());
    const theirs = putOnBattlefield(s0, opp, spider());
    const g = putOnBattlefield(s0, ap, giant());
    const b1 = putOnBattlefield(s0, opp, bears());
    const b2 = putOnBattlefield(s0, opp, bears());
    dealDamage(s0, objectSource(s0, s0.objects[theirs]!), { object: s0.objects[b1]! }, 2);
    dealDamage(s0, objectSource(s0, s0.objects[g]!), { object: s0.objects[b2]! }, 3);
    const s = settle(pass(s0));
    expect(s.objects[b1]!.zone).toBe("graveyard");
    expect(s.objects[b2]!.zone).toBe("graveyard");
    expect(s.battlefield.some((id) => s.objects[id]!.isToken)).toBe(false);
  });

  it("Shelob's own damage counts (it's a Spider), and other Spiders have deathtouch and ward {2}", () => {
    const { s: s0, ap, opp } = setup([]);
    const sh = putOnBattlefield(s0, ap, shelob());
    const sp = putOnBattlefield(s0, ap, spider());
    expect(types(s0, sp).keywords).toEqual(expect.arrayContaining(["Deathtouch"]));
    const ob = putOnBattlefield(s0, opp, giant());
    dealDamage(s0, objectSource(s0, s0.objects[sh]!), { object: s0.objects[ob]! }, 1);
    const s = settle(pass(s0));
    expect(s.objects[ob]!.zone).toBe("graveyard");
    expect(s.battlefield.some((id) => s.objects[id]!.isToken && types(s, id).name === "Hill Giant")).toBe(true);
  });
});

describe("Rootweaver Druid", () => {
  it("each opponent in turn may search for up to three basic lands, one under your control and the rest under theirs, tapped", () => {
    const { s: s0, ap, ids } = setup([rootweaver()]);
    const [b, c, d] = after(s0, ap);
    const lands = (s: GameState, controller: PlayerId, owner: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.owner === owner && characteristics(s, s.objects[id]!).controller === controller && s.objects[id]!.tapped && types(s, id).types.includes("Land")).length;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    const asked: PlayerId[] = [];
    for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "chooseMay") {
        asked.push(p.player);
        s = act(s, { type: "chooseMay", player: p.player, yes: p.player !== c });
      } else if (p?.kind === "searchLibrary") {
        expect(p.max).toBe(3);
        expect(p.firstTo).toBe(`onto the battlefield tapped under ${s.players[ap]!.name}'s control`);
        expect(p.othersTo).toBe("onto the battlefield tapped under your control");
        s = act(s, { type: "searchLibrary", player: p.player, found: p.cards.slice(0, p.player === b ? 3 : 1) });
      } else if (p) s = act(s, botActions(s, p.player)[0]!);
      else s = pass(s);
    }
    expect(asked).toEqual([b, c, d]);
    expect(lands(s, ap, b)).toBe(1);
    expect(lands(s, b, b)).toBe(2);
    expect(lands(s, ap, c) + lands(s, c, c)).toBe(0);
    // Finding only one, it's yours (rulings).
    expect(lands(s, ap, d)).toBe(1);
    expect(lands(s, d, d)).toBe(0);
  });

  it("another player's Rootweaver on your turn: you decide first, then the others in turn order", () => {
    const { s: s0, ap } = setup([]);
    const [b, c, d] = after(s0, ap);
    const r = putOnBattlefield(s0, b, rootweaver());
    s0.battlefield.splice(s0.battlefield.indexOf(r), 1);
    s0.objects[r]!.zone = "hand";
    s0.players[b]!.hand.push(r);
    moveObject(s0, r, "battlefield", { controller: b });
    let s = s0;
    const asked: PlayerId[] = [];
    for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "chooseMay") {
        asked.push(p.player);
        s = act(s, { type: "chooseMay", player: p.player, yes: false });
      } else if (p) s = act(s, botActions(s, p.player)[0]!);
      else s = pass(s);
    }
    expect(asked).toEqual([ap, c, d]);
  });
});
