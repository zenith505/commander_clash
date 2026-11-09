// Lane B round B161: banding's special form "bands with other [quality]" (CR 702.22b-c, j-k): the lands that give it to
// legendary creatures of a color (Seafarer's Quay, Unholy Citadel, Adventurers' Guildhouse, Cathedral of Serra, Mountain
// Stronghold), Master of the Hunt's Wolves of the Hunt, losing it (Shelkin Brownie, Tolaria), and "creatures banded with ~"
// (Icatian Skirmishers, Urza's Engine, Camel), and Wall of Caltrops (banding when only Walls block the creature it blocks).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { characteristics, isFullySupported, objHasKeyword, planActivate, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const quay = (): CardDef => ({"oracleId":"f71f01bc-caae-426b-a25a-bfbfeb9feb67","name":"Seafarer's Quay","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"Blue legendary creatures you control have \"bands with other legendary creatures.\" (Any legendary creatures can attack in a band as long as at least one has \"bands with other legendary creatures.\" Bands are blocked as a group. If at least two legendary creatures you control, one of which has \"bands with other legendary creatures,\" are blocking or being blocked by the same creature, you divide that creature's combat damage, not its controller, among any of the creatures it's being blocked by or is blocking.)","colors":[],"colorIdentity":[],"keywords":[]});
const citadel = (): CardDef => ({"oracleId":"d410027b-1c22-461e-939d-06a2c851352e","name":"Unholy Citadel","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"Black legendary creatures you control have \"bands with other legendary creatures.\" (Any legendary creatures can attack in a band as long as at least one has \"bands with other legendary creatures.\" Bands are blocked as a group. If at least two legendary creatures you control, one of which has \"bands with other legendary creatures,\" are blocking or being blocked by the same creature, you divide that creature's combat damage, not its controller, among any of the creatures it's being blocked by or is blocking.)","colors":[],"colorIdentity":[],"keywords":[]});
const guildhouse = (): CardDef => ({"oracleId":"bf29b215-d4f5-4641-97ef-b65d4c463e72","name":"Adventurers' Guildhouse","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"Green legendary creatures you control have \"bands with other legendary creatures.\" (Any legendary creatures can attack in a band as long as at least one has \"bands with other legendary creatures.\" Bands are blocked as a group. If at least two legendary creatures you control, one of which has \"bands with other legendary creatures,\" are blocking or being blocked by the same creature, you divide that creature's combat damage, not its controller, among any of the creatures it's being blocked by or is blocking.)","colors":[],"colorIdentity":[],"keywords":[]});
const cathedral = (): CardDef => ({"oracleId":"4b9922b9-c5b5-467e-8a5b-1e45e862194d","name":"Cathedral of Serra","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"White legendary creatures you control have \"bands with other legendary creatures.\" (Any legendary creatures can attack in a band as long as at least one has \"bands with other legendary creatures.\" Bands are blocked as a group. If at least two legendary creatures you control, one of which has \"bands with other legendary creatures,\" are blocking or being blocked by the same creature, you divide that creature's combat damage, not its controller, among any of the creatures it's being blocked by or is blocking.)","colors":[],"colorIdentity":[],"keywords":[]});
const stronghold = (): CardDef => ({"oracleId":"af147bb6-aa46-4fc9-af96-de3740c19fd5","name":"Mountain Stronghold","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"Red legendary creatures you control have \"bands with other legendary creatures.\" (Any legendary creatures can attack in a band as long as at least one has \"bands with other legendary creatures.\" Bands are blocked as a group. If at least two legendary creatures you control, one of which has \"bands with other legendary creatures,\" are blocking or being blocked by the same creature, you divide that creature's combat damage, not its controller, among any of the creatures it's being blocked by or is blocking.)","colors":[],"colorIdentity":[],"keywords":[]});
const master = (): CardDef => ({"oracleId":"cdf89ad2-ce08-4708-88c2-8acdc861526d","name":"Master of the Hunt","manaCost":"{2}{G}{G}","cmc":4,"typeLine":"Creature — Human","supertypes":[],"types":["Creature"],"subtypes":["Human"],"oracleText":"{2}{G}{G}: Create a 1/1 green Wolf creature token named Wolves of the Hunt. It has \"bands with other creatures named Wolves of the Hunt.\" (Any creatures named Wolves of the Hunt can attack in a band as long as at least one has \"bands with other creatures named Wolves of the Hunt.\" Bands are blocked as a group. If at least two creatures named Wolves of the Hunt you control, one of which has \"bands with other creatures named Wolves of the Hunt,\" are blocking or being blocked by the same creature, you divide that creature's combat damage, not its controller, among any of the creatures it's being blocked by or is blocking.)","colors":["G"],"colorIdentity":["G"],"keywords":[],"power":"2","toughness":"2"});
const brownie = (): CardDef => ({"oracleId":"507ce455-bd02-49f9-bf64-4b2d21ffe0ea","name":"Shelkin Brownie","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Ouphe","supertypes":[],"types":["Creature"],"subtypes":["Ouphe"],"oracleText":"{T}: Target creature loses all \"bands with other\" abilities until end of turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"power":"1","toughness":"1"});
const tolaria = (): CardDef => ({"oracleId":"9879a4f3-3b9c-45cf-af03-7f2ae4c689b4","name":"Tolaria","manaCost":"","cmc":0,"typeLine":"Legendary Land","supertypes":["Legendary"],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {U}.\n{T}: Target creature loses banding and all \"bands with other\" abilities until end of turn. Activate only during any upkeep step.","colors":[],"colorIdentity":["U"],"keywords":[]});
const skirmishers = (): CardDef => ({"oracleId":"8ddbe82b-7fc9-4b2c-85de-dc747adbb3ca","name":"Icatian Skirmishers","manaCost":"{3}{W}","cmc":4,"typeLine":"Creature — Human Soldier","supertypes":[],"types":["Creature"],"subtypes":["Human","Soldier"],"oracleText":"First strike; banding (Any creatures with banding, and up to one without, can attack in a band. Bands are blocked as a group. If any creatures with banding you control are blocking or being blocked by a creature, you divide that creature's combat damage, not its controller, among any of the creatures it's being blocked by or is blocking.)\nWhenever this creature attacks, all creatures banded with it gain first strike until end of turn.","colors":["W"],"colorIdentity":["W"],"keywords":["First strike","Banding"],"power":"1","toughness":"1"});
const engine = (): CardDef => ({"oracleId":"bf6ea878-044b-40a8-a21b-0191a948a69a","name":"Urza's Engine","manaCost":"{5}","cmc":5,"typeLine":"Artifact Creature — Juggernaut","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Juggernaut"],"oracleText":"Trample\n{3}: This creature gains banding until end of turn. (Any creatures with banding, and up to one without, can attack in a band. Bands are blocked as a group. If any creatures with banding you control are blocking or being blocked by a creature, you divide that creature's combat damage, not its controller, among any of the creatures it's being blocked by or is blocking.)\n{3}: Attacking creatures banded with this creature gain trample until end of turn.","colors":[],"colorIdentity":[],"keywords":["Trample"],"power":"1","toughness":"5"});
const camel = (): CardDef => ({"oracleId":"d33b3591-c01f-4ac4-8626-7cbfdabaf90d","name":"Camel","manaCost":"{W}","cmc":1,"typeLine":"Creature — Camel","supertypes":[],"types":["Creature"],"subtypes":["Camel"],"oracleText":"Banding (Any creatures with banding, and up to one without, can attack in a band. Bands are blocked as a group. If any creatures with banding you control are blocking or being blocked by a creature, you divide that creature's combat damage, not its controller, among any of the creatures it's being blocked by or is blocking.)\nAs long as this creature is attacking, prevent all damage Deserts would deal to this creature and to creatures banded with this creature.","colors":["W"],"colorIdentity":["W"],"keywords":["Banding"],"power":"0","toughness":"1"});
const desert = (): CardDef => ({"oracleId":"195107ad-879d-4b02-a44a-a3ba70fedf88","name":"Desert","manaCost":"","cmc":0,"typeLine":"Land — Desert","supertypes":[],"types":["Land"],"subtypes":["Desert"],"oracleText":"{T}: Add {C}.\n{T}: This land deals 1 damage to target attacking creature. Activate only during the end of combat step.","colors":[],"colorIdentity":[],"keywords":[]});
const hero = (): CardDef => ({"oracleId":"4c81cfb7-8765-4e28-ae33-4287fa9a86cc","name":"Benalish Hero","manaCost":"{W}","cmc":1,"typeLine":"Creature — Human Soldier","supertypes":[],"types":["Creature"],"subtypes":["Human","Soldier"],"oracleText":"Banding (Any creatures with banding, and up to one without, can attack in a band. Bands are blocked as a group. If any creatures with banding you control are blocking or being blocked by a creature, you divide that creature's combat damage, not its controller, among any of the creatures it's being blocked by or is blocking.)","colors":["W"],"colorIdentity":["W"],"keywords":["Banding"],"power":"1","toughness":"1"});
const caltrops = (): CardDef => ({"oracleId":"20fa17d4-9c3e-470b-9993-a4a2799e33d1","name":"Wall of Caltrops","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Wall","supertypes":[],"types":["Creature"],"subtypes":["Wall"],"oracleText":"Defender (This creature can't attack.)\nWhenever this creature blocks a creature, if at least one other Wall creature is blocking that creature and no non-Wall creatures are blocking that creature, this creature gains banding until end of turn. (If any creatures with banding you control are blocking a creature, you divide that creature's combat damage, not its controller, among any of the creatures it's being blocked by.)","colors":["W"],"colorIdentity":["W"],"keywords":["Defender"],"power":"2","toughness":"1"});

const BWO = "Bands with other legendary creatures";
const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const tgt = (id: string): TargetChoice => ({ kind: "object", id }) as TargetChoice;
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
const kw = (s: GameState, id: string) => characteristics(s, s.objects[id]!).keywords;
const legend = (name: string, cost: string, pt = "2/2") => card(name, "Legendary Creature — Human Warrior", cost, { power: pt.split("/")[0], toughness: pt.split("/")[1] });

/** From main 1: declare these attacks; answer the band picker with `bands` (in order), then none. */
function attack(s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[], bands: string[][] = []) {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks });
  for (const b of bands) {
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "band" });
    s = act(s, { type: "pickPermanents", player: ap, ids: b });
  }
  if (s.pending?.kind === "pickPermanents" && s.pending.action === "band") s = act(s, { type: "pickPermanents", player: ap, ids: [] });
  return s;
}
/** Then blocks, and everyone passes to the end of combat. */
function finishCombat(s: GameState, blocks: { blocker: string; attacker: string }[] = []) {
  for (let i = 0; i < 300 && !(s.step === "endCombat" && !s.pending && !s.stack.length); i++) {
    const pend = s.pending;
    if (pend?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pend.player, blocks: blocks.filter((b) => s.objects[b.blocker]!.controller === pend.player) });
    else if (pend) throw new Error(`unexpected ${pend.kind}`);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
}

describe("the \"bands with other legendary creatures\" lands (CR 702.22b)", () => {
  it("give it to legendary creatures of their color you control, not to others", () => {
    supported(quay(), citadel(), guildhouse(), cathedral(), stronghold());
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, stronghold());
    putOnBattlefield(s, ap, quay());
    const red = putOnBattlefield(s, ap, legend("Red Legend", "{1}{R}"));
    const blue = putOnBattlefield(s, ap, legend("Blue Legend", "{1}{U}"));
    const green = putOnBattlefield(s, ap, legend("Green Legend", "{1}{G}"));
    const redBear = putOnBattlefield(s, ap, bear({ name: "Red Bear", manaCost: "{1}{R}", colors: ["R"] }));
    const theirs = putOnBattlefield(s, opp, legend("Their Red Legend", "{1}{R}"));
    expect(kw(s, red)).toContain(BWO);
    expect(kw(s, blue)).toContain(BWO);
    expect(kw(s, green)).not.toContain(BWO);
    expect(kw(s, redBear)).not.toContain(BWO);
    expect(kw(s, theirs)).not.toContain(BWO);
  });

  it("let legendary creatures attack in a band with one that has it, and nothing else", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, stronghold());
    const red = putOnBattlefield(s0, ap, legend("Red Legend", "{1}{R}"));
    const green = putOnBattlefield(s0, ap, legend("Green Legend", "{1}{G}"));
    const white = putOnBattlefield(s0, ap, legend("White Legend", "{1}{W}"));
    const b = putOnBattlefield(s0, ap, bear());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [red, green, white, b].map((attacker) => ({ attacker, defender: opp })) });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "band" });
    const options = (s.pending as { options: string[] }).options;
    expect([...options].sort()).toEqual([red, green, white].sort());
    // A creature that isn't legendary can't join (CR 702.22c), and legendary creatures need one with the ability.
    expect(() => act(s, { type: "pickPermanents", player: ap, ids: [red, b] })).toThrow();
    expect(() => act(s, { type: "pickPermanents", player: ap, ids: [green, white] })).toThrow();
    s = act(s, { type: "pickPermanents", player: ap, ids: [red, green, white] });
    expect(s.objects[red]!.band).toBeDefined();
    expect(s.objects[green]!.band).toBe(s.objects[red]!.band);
    expect(s.objects[white]!.band).toBe(s.objects[red]!.band);
    expect(s.objects[b]!.band).toBeUndefined();
    expect(s.pending).toBeNull();
  });

  it("don't make a band with banding take more than one creature without banding", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, stronghold());
    const h = putOnBattlefield(s0, ap, hero());
    const r1 = putOnBattlefield(s0, ap, legend("Red Legend", "{1}{R}"));
    const r2 = putOnBattlefield(s0, ap, legend("Other Red Legend", "{1}{R}"));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [h, r1, r2].map((attacker) => ({ attacker, defender: opp })) });
    expect(() => act(s, { type: "pickPermanents", player: ap, ids: [h, r1, r2] })).toThrow(/only one creature without banding/);
    s = act(s, { type: "pickPermanents", player: ap, ids: [h, r1] });
    expect(s.objects[h]!.band).toBe(s.objects[r1]!.band);
  });

  it("a creature blocking the band blocks them all, and the attacking player divides its damage (CR 702.22h, k)", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, stronghold());
    const red = putOnBattlefield(s0, ap, legend("Red Legend", "{1}{R}"));
    const green = putOnBattlefield(s0, ap, legend("Green Legend", "{1}{G}"));
    const wall = putOnBattlefield(s0, opp, bear({ name: "Blocking Bear", power: "2", toughness: "5" }));
    let s = attack(s0, ap, [red, green].map((attacker) => ({ attacker, defender: opp })), [[red, green]]);
    s = finishCombat(s, [{ blocker: wall, attacker: green }]);
    expect(s.objects[wall]!.blocking).toEqual(expect.arrayContaining([red, green]));
    // Its 2 damage split 1 and 1: both 2/2s survive (the defending player would have killed one).
    expect(s.objects[red]!.zone).toBe("battlefield");
    expect(s.objects[green]!.zone).toBe("battlefield");
  });

  it("blocked by two legendary creatures, one with the ability, the defending player divides the attacker's damage (CR 702.22j)", () => {
    const { s: s0, ap, opp } = setup([]);
    const big = putOnBattlefield(s0, ap, bear({ name: "Big Bear", power: "4", toughness: "4" }));
    putOnBattlefield(s0, opp, citadel());
    const black = putOnBattlefield(s0, opp, legend("Black Legend", "{1}{B}", "2/3"));
    const green = putOnBattlefield(s0, opp, legend("Green Legend", "{1}{G}", "2/3"));
    let s = attack(s0, ap, [{ attacker: big, defender: opp }]);
    s = finishCombat(s, [{ blocker: black, attacker: big }, { blocker: green, attacker: big }]);
    // 4 damage split 2 and 2: neither 2/3 dies (the attacker would have killed one).
    expect(s.objects[black]!.zone).toBe("battlefield");
    expect(s.objects[green]!.zone).toBe("battlefield");
  });

  it("but not when the other blocker isn't legendary", () => {
    const { s: s0, ap, opp } = setup([]);
    const big = putOnBattlefield(s0, ap, bear({ name: "Big Bear", power: "4", toughness: "4" }));
    putOnBattlefield(s0, opp, citadel());
    const black = putOnBattlefield(s0, opp, legend("Black Legend", "{1}{B}", "2/3"));
    const other = putOnBattlefield(s0, opp, bear({ name: "Plain Bear", power: "2", toughness: "3" }));
    let s = attack(s0, ap, [{ attacker: big, defender: opp }]);
    s = finishCombat(s, [{ blocker: black, attacker: big }, { blocker: other, attacker: big }]);
    expect([s.objects[black]!.zone, s.objects[other]!.zone]).toContain("graveyard");
  });
});

describe("Master of the Hunt's Wolves of the Hunt", () => {
  it("have \"bands with other creatures named Wolves of the Hunt\" and band only with each other", () => {
    supported(master());
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, master());
    s0.players[ap]!.manaPool.G = 8;
    let s = run(s0, planActivate(s0, ap, m, 0));
    s = settle(s);
    s = run(s, planActivate(s, ap, m, 0));
    s = settle(s);
    const wolves = s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).name === "Wolves of the Hunt");
    expect(wolves).toHaveLength(2);
    for (const w of wolves) {
      expect(kw(s, w)).toEqual(["Bands with other creatures named Wolves of the Hunt"]);
      expect(characteristics(s, s.objects[w]!).subtypes).toEqual(["Wolf"]);
      s.objects[w]!.controlledSinceTurn = -1;
    }
    const b = putOnBattlefield(s, ap, bear());
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [...wolves, b].map((attacker) => ({ attacker, defender: opp })) });
    expect([...(s.pending as { options: string[] }).options].sort()).toEqual([...wolves].sort());
    expect(() => act(s, { type: "pickPermanents", player: ap, ids: [wolves[0]!, b] })).toThrow();
    s = act(s, { type: "pickPermanents", player: ap, ids: wolves });
    expect(s.objects[wolves[0]!]!.band).toBe(s.objects[wolves[1]!]!.band);
  });
});

describe("losing \"bands with other\"", () => {
  it("Shelkin Brownie: a creature loses its \"bands with other\" abilities until end of turn, not banding (rulings)", () => {
    supported(brownie());
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, stronghold());
    const sb = putOnBattlefield(s0, ap, brownie());
    const red = putOnBattlefield(s0, ap, legend("Red Legend", "{1}{R}"));
    const h = putOnBattlefield(s0, ap, hero());
    let s = settle(run(s0, planActivate(s0, ap, sb, 0, [tgt(red)])));
    expect(kw(s, red)).not.toContain(BWO);
    s.objects[sb]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, sb, 0, [tgt(h)])));
    expect(objHasKeyword(s, s.objects[h]!, "Banding")).toBe(true);
    // Until end of turn: back on the next turn.
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    expect(kw(s, red)).toContain(BWO);
  });

  it("Tolaria: banding and every \"bands with other\", only during an upkeep step", () => {
    supported(tolaria());
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, stronghold());
    const t = putOnBattlefield(s0, ap, tolaria());
    const red = putOnBattlefield(s0, ap, legend("Red Legend", "{1}{R}"));
    const h = putOnBattlefield(s0, opp, hero());
    expect(planActivate(s0, ap, t, 0, [tgt(red)])).toBeNull(); // not in a main phase
    let s = passUntil(s0, "upkeep", opp);
    s = act(s, { type: "passPriority", player: opp });
    expect(waitingOn(s)).not.toBe(opp);
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.step).toBe("upkeep");
    s = run(s, planActivate(s, ap, t, 0, [tgt(h)]));
    s = settle(s);
    expect(objHasKeyword(s, s.objects[h]!, "Banding")).toBe(false);
    expect(kw(s, red)).toContain(BWO);
  });
});

describe("creatures banded with ~", () => {
  it("Icatian Skirmishers: the creatures in its band gain first strike as it attacks", () => {
    supported(skirmishers());
    const { s: s0, ap, opp } = setup([]);
    const sk = putOnBattlefield(s0, ap, skirmishers());
    const b = putOnBattlefield(s0, ap, bear());
    const other = putOnBattlefield(s0, ap, bear({ name: "Other Bear" }));
    let s = attack(s0, ap, [sk, b, other].map((attacker) => ({ attacker, defender: opp })), [[sk, b]]);
    s = settle(s);
    expect(objHasKeyword(s, s.objects[b]!, "First strike")).toBe(true);
    expect(objHasKeyword(s, s.objects[other]!, "First strike")).toBe(false);
  });

  it("Icatian Skirmishers: none when it attacks alone", () => {
    const { s: s0, ap, opp } = setup([]);
    const sk = putOnBattlefield(s0, ap, skirmishers());
    const b = putOnBattlefield(s0, ap, bear());
    let s = attack(s0, ap, [sk, b].map((attacker) => ({ attacker, defender: opp })));
    s = settle(s);
    expect(objHasKeyword(s, s.objects[b]!, "First strike")).toBe(false);
  });

  it("Urza's Engine: attacking creatures in its band gain trample", () => {
    supported(engine());
    const { s: s0, ap, opp } = setup([]);
    const e = putOnBattlefield(s0, ap, engine());
    const b = putOnBattlefield(s0, ap, bear());
    const other = putOnBattlefield(s0, ap, bear({ name: "Other Bear" }));
    s0.players[ap]!.manaPool.C = 6;
    let s = settle(run(s0, planActivate(s0, ap, e, 0)));
    expect(objHasKeyword(s, s.objects[e]!, "Banding")).toBe(true);
    s = attack(s, ap, [e, b, other].map((attacker) => ({ attacker, defender: opp })), [[e, b]]);
    s = settle(s);
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s.players[ap]!.manaPool.C = 3;
    s = settle(run(s, planActivate(s, ap, e, 1)));
    expect(objHasKeyword(s, s.objects[b]!, "Trample")).toBe(true);
    expect(objHasKeyword(s, s.objects[other]!, "Trample")).toBe(false);
  });

  it("Camel: while it attacks, damage from Deserts to it and to the creatures in its band is prevented", () => {
    supported(camel(), desert());
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, camel());
    const b = putOnBattlefield(s0, ap, bear());
    const other = putOnBattlefield(s0, ap, bear({ name: "Other Bear" }));
    const d1 = putOnBattlefield(s0, opp, desert());
    const d2 = putOnBattlefield(s0, opp, { ...desert(), oracleId: "desert-2", name: "Desert" });
    const d3 = putOnBattlefield(s0, opp, { ...desert(), oracleId: "desert-3", name: "Desert" });
    let s = attack(s0, ap, [c, b, other].map((attacker) => ({ attacker, defender: opp })), [[c, b]]);
    s = finishCombat(s);
    expect(s.step).toBe("endCombat");
    for (const [d, t] of [[d1, b], [d2, other], [d3, c]] as const) {
      while (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      s = run(s, planActivate(s, opp, d, 0, [tgt(t)]));
      for (let i = 0; i < 20 && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[b]!.damage).toBe(0);
    expect(s.objects[c]!.damage).toBe(0);
    expect(s.objects[other]!.damage).toBe(1);
  });
});

describe("Wall of Caltrops", () => {
  const wall = () => card("Stone Wall", "Creature — Wall", "{2}", { power: "0", toughness: "5", keywords: ["Defender"], oracleText: "Defender" });

  it("blocking with another Wall and nothing else, it gains banding: the defending player divides the attacker's damage", () => {
    supported(caltrops());
    const { s: s0, ap, opp } = setup([]);
    const big = putOnBattlefield(s0, ap, bear({ name: "Big Bear", power: "4", toughness: "4" }));
    const c = putOnBattlefield(s0, opp, caltrops());
    const w = putOnBattlefield(s0, opp, wall());
    let s = attack(s0, ap, [{ attacker: big, defender: opp }]);
    s = finishCombat(s, [{ blocker: c, attacker: big }, { blocker: w, attacker: big }]);
    expect(objHasKeyword(s, s.objects[c]!, "Banding")).toBe(true);
    // All 4 to the 0/5 Wall: the 2/1 Caltrops lives (the attacker would have killed it first).
    expect(s.objects[c]!.zone).toBe("battlefield");
    expect(s.objects[w]!.damage).toBe(4);
  });

  it("not with a non-Wall creature blocking that creature too, nor with the other Wall blocking another attacker", () => {
    const { s: s0, ap, opp } = setup([]);
    const big = putOnBattlefield(s0, ap, bear({ name: "Big Bear", power: "4", toughness: "4" }));
    const c = putOnBattlefield(s0, opp, caltrops());
    const w = putOnBattlefield(s0, opp, wall());
    const b = putOnBattlefield(s0, opp, bear({ name: "Plain Bear", power: "0", toughness: "5" }));
    let s = attack(s0, ap, [{ attacker: big, defender: opp }]);
    s = finishCombat(s, [{ blocker: c, attacker: big }, { blocker: w, attacker: big }, { blocker: b, attacker: big }]);
    // No banding: the attacker assigns lethal damage to the Caltrops first.
    expect(s.objects[c]!.zone).toBe("graveyard");
    const { s: t0, ap: ap2, opp: opp2 } = setup([]);
    const small = putOnBattlefield(t0, ap2, bear({ name: "Small Bear", power: "0", toughness: "4" }));
    const other = putOnBattlefield(t0, ap2, bear({ name: "Other Bear", power: "0", toughness: "4" }));
    const c2 = putOnBattlefield(t0, opp2, caltrops());
    const w2 = putOnBattlefield(t0, opp2, wall());
    let t = attack(t0, ap2, [small, other].map((attacker) => ({ attacker, defender: opp2 })));
    t = finishCombat(t, [{ blocker: c2, attacker: small }, { blocker: w2, attacker: other }]);
    expect(t.objects[c2]!.zone).toBe("battlefield");
    expect(objHasKeyword(t, t.objects[c2]!, "Banding")).toBe(false);
  });
});
