// Round 315 (Lane A, skip-list cards): additional costs of any size that cut the total cost or count for the effect
// (CR 601.2b, 601.2f, 107.3a): Explosive Singularity (tap any number of creatures, {1} less each), Burn at the Stake
// (tap any number, three damage each), Hierophant Bio-Titan (remove any number of +1/+1 counters, {2} less each), Dargo,
// the Shipwrecker (sacrifice any number of artifacts and/or creatures, {2} less each and for each sacrificed earlier this
// turn), and Galloping Lizrog (remove any number of +1/+1 counters as it enters, twice that many on it).

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, moveObject, planActivate, abilityProblem, castProblem, invalidateCharacteristics, isFullySupported, manaValue, planCast, power, spellCost, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

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
/** Only `n` of `pid`'s lands stay untapped, those named in `keep` first. */
const leaveLands = (s: GameState, pid: PlayerId, n: number, keep: string[] = []) => {
  const lands = s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land"));
  lands.sort((a, b) => Number(keep.includes(s.cards[s.objects[b]!.cardId]!.name)) - Number(keep.includes(s.cards[s.objects[a]!.cardId]!.name)));
  lands.forEach((id, i) => (s.objects[id]!.tapped = i >= n));
};
const total = (s: GameState, pid: PlayerId, id: string, x: number) => {
  const { cost, extra } = spellCost(s, pid, s.objects[id]!, x);
  return manaValue(cost) + extra;
};

// Real oracle text (Scryfall).
const singularity = (): CardDef => ({"oracleId":"30d79f61-f9d9-441a-b600-83721af8553b","name":"Explosive Singularity","manaCost":"{8}{R}{R}","cmc":10,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"As an additional cost to cast this spell, you may tap any number of untapped creatures you control. This spell costs {1} less to cast for each creature tapped this way.\nExplosive Singularity deals 10 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"} as CardDef);
const stake = (): CardDef => ({"oracleId":"eb23bbb0-dd12-44f1-8645-d92f46cbe8ff","name":"Burn at the Stake","manaCost":"{2}{R}{R}{R}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"As an additional cost to cast this spell, tap any number of untapped creatures you control.\nBurn at the Stake deals damage to any target equal to three times the number of creatures tapped this way.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"} as CardDef);
const titan = (): CardDef => ({"oracleId":"f334c57b-0a57-4fbd-8798-948371d6589d","name":"Hierophant Bio-Titan","manaCost":"{10}{G}{G}","cmc":12,"typeLine":"Creature — Tyranid","supertypes":[],"types":["Creature"],"subtypes":["Tyranid"],"oracleText":"Frenzied Metabolism — As an additional cost to cast this spell, you may remove any number of +1/+1 counters from among creatures you control. This spell costs {2} less to cast for each counter removed this way.\nReach, vigilance, ward {2}\nTitanic — This creature can't be blocked by creatures with power 2 or less.","power":"12","toughness":"12","colors":["G"],"colorIdentity":["G"],"keywords":["Reach","Vigilance","Ward","Titanic","Frenzied Metabolism"],"layout":"normal"} as CardDef);
const lizrog = (): CardDef => ({"oracleId":"3561cd52-961f-4098-9287-58ee43970f0f","name":"Galloping Lizrog","manaCost":"{3}{G}{U}","cmc":5,"typeLine":"Creature — Frog Lizard","supertypes":[],"types":["Creature"],"subtypes":["Frog","Lizard"],"oracleText":"Trample\nWhen this creature enters, you may remove any number of +1/+1 counters from among creatures you control. If you do, put twice that many +1/+1 counters on this creature.","power":"3","toughness":"3","colors":["G","U"],"colorIdentity":["G","U"],"keywords":["Trample"],"layout":"normal"} as CardDef);
const dargo = (): CardDef => ({"oracleId":"a2414a2d-0fd8-4084-8762-ace48f70c853","name":"Dargo, the Shipwrecker","manaCost":"{6}{R}","cmc":7,"typeLine":"Legendary Creature — Giant Pirate","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Giant","Pirate"],"oracleText":"As an additional cost to cast this spell, you may sacrifice any number of artifacts and/or creatures. This spell costs {2} less to cast for each permanent sacrificed this way and {2} less to cast for each other artifact or creature you've sacrificed this turn.\nTrample\nPartner (You can have two commanders if both have partner.)","power":"7","toughness":"5","colors":["R"],"colorIdentity":["R"],"keywords":["Partner","Trample"],"layout":"normal"} as CardDef);
const flux = (): CardDef => ({"oracleId":"631d0de7-4810-4bc3-b86b-8e2505ed91f4","name":"Ooze Flux","manaCost":"{3}{G}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"{1}{G}, Remove one or more +1/+1 counters from among creatures you control: Create an X/X green Ooze creature token, where X is the number of +1/+1 counters removed this way.","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"} as CardDef);
const antMan = (): CardDef => ({"oracleId":"6c7e4e51-099a-4398-a4b7-e2f0ddd36429","name":"The Astonishing Ant-Man","manaCost":"{G}{U}","cmc":2,"typeLine":"Legendary Creature — Human Scientist Hero","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Scientist","Hero"],"oracleText":"Whenever you draw a card, put a +1/+1 counter on The Astonishing Ant-Man.\n{2}{G}, {T}, Remove any number of +1/+1 counters from The Astonishing Ant-Man: Create that many 1/1 green Insect creature tokens.","power":"1","toughness":"1","colors":["G","U"],"colorIdentity":["G","U"],"keywords":[],"layout":"normal"} as CardDef);
const baba = (): CardDef => ({"oracleId":"d6cd4aa1-ff3a-4453-8735-e5ace5cbe386","name":"Baba Lysaga, Night Witch","manaCost":"{1}{B}{G}","cmc":3,"typeLine":"Legendary Creature — Human Warlock","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Warlock"],"oracleText":"{T}, Sacrifice up to three permanents: If there were three or more card types among the sacrificed permanents, each opponent loses 3 life, you gain 3 life, and you draw three cards.","power":"3","toughness":"3","colors":["B","G"],"colorIdentity":["B","G"],"keywords":[],"layout":"normal"} as CardDef);
const clue = (name: string) => card(name, "Artifact — Clue", "", { oracleText: "{2}, Sacrifice this artifact: Draw a card." });

const bears = (s: GameState, pid: PlayerId, n: number, sick = false) => Array.from({ length: n }, (_, i) => putOnBattlefield(s, pid, bear({ name: `Bear ${i}` }), { sick }));
const lifeOf = (s: GameState, pid: PlayerId) => s.players[pid]!.life;

describe("Explosive Singularity: tap any number of creatures, {1} less each (CR 601.2b, 601.2f)", () => {
  it("six tapped creatures, summoning sick ones too, make it {2}{R}{R}", () => {
    supported(singularity());
    const { s: s0, ap, ids, opp } = setup([singularity()]);
    const crew = bears(s0, ap, 6, true);
    leaveLands(s0, ap, 4, ["Mountain"]);
    expect(total(s0, ap, ids[0]!, 6)).toBe(4);
    expect(planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, "auto", 5, { tap: crew.slice(0, 5) })).toBeNull();
    const s1 = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, "auto", 6, { tap: crew }));
    expect(crew.every((c) => s1.objects[c]!.tapped)).toBe(true);
    const s = settle(s1);
    expect(lifeOf(s, opp)).toBe(lifeOf(s0, opp) - 10);
  });

  it("never below {R}{R}, though more may be tapped (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([singularity()]);
    const crew = bears(s0, ap, 10);
    leaveLands(s0, ap, 2, ["Mountain"]);
    expect(total(s0, ap, ids[0]!, 10)).toBe(2);
    expect(total(s0, ap, ids[0]!, 8)).toBe(2);
    const s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, "auto", 10, { tap: crew }));
    expect(crew.every((c) => s.objects[c]!.tapped)).toBe(true);
  });

  it("none tapped: the full {8}{R}{R}; a tapped creature can't pay it", () => {
    const { s: s0, ap, ids, opp } = setup([singularity()]);
    const crew = bears(s0, ap, 2);
    s0.objects[crew[0]!]!.tapped = true;
    expect(total(s0, ap, ids[0]!, 0)).toBe(10);
    expect(castProblem(s0, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, undefined, undefined, 1, { tap: [crew[0]!] })).not.toBeNull();
    const s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, "auto", 0));
    expect(s.objects[crew[1]!]!.tapped).toBe(false);
  });

  it("a bot taps creatures to cast it with its lands", () => {
    const { s: s0, ap, ids } = setup([singularity()]);
    bears(s0, ap, 6);
    leaveLands(s0, ap, 4, ["Mountain"]);
    s0.players[ap]!.hand = [ids[0]!];
    const acts = botActions(s0, ap);
    expect(acts.some((a) => a.type === "castSpell" && a.objectId === ids[0])).toBe(true);
  });
});

describe("Burn at the Stake: tap any number of creatures, three times that much damage (CR 601.2b, 107.3a)", () => {
  it("three creatures tapped deal 9; untapping them later changes nothing (rulings)", () => {
    supported(stake());
    const { s: s0, ap, ids, opp } = setup([stake()]);
    const crew = bears(s0, ap, 3, true);
    const s1 = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, "auto", 3, { tap: crew }));
    for (const c of crew) s1.objects[c]!.tapped = false;
    const s = settle(s1);
    expect(lifeOf(s, opp)).toBe(lifeOf(s0, opp) - 9);
  });

  it("none tapped deals no damage", () => {
    const { s: s0, ap, ids, opp } = setup([stake()]);
    bears(s0, ap, 2);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, "auto", 0)));
    expect(lifeOf(s, opp)).toBe(lifeOf(s0, opp));
  });

  it("can't tap more creatures than you have untapped", () => {
    const { s: s0, ap, ids, opp } = setup([stake()]);
    bears(s0, ap, 2);
    expect(planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, "auto", 3)).toBeNull();
  });
});

describe("Hierophant Bio-Titan: remove any number of +1/+1 counters, {2} less each (CR 601.2b, 601.2f)", () => {
  it("five counters from two creatures make it {G}{G}", () => {
    supported(titan());
    const { s: s0, ap, ids } = setup([titan()]);
    const [a, b] = bears(s0, ap, 2);
    s0.objects[a!]!.counters["+1/+1"] = 3;
    s0.objects[b!]!.counters["+1/+1"] = 2;
    invalidateCharacteristics(s0);
    leaveLands(s0, ap, 2, ["Forest"]);
    expect(total(s0, ap, ids[0]!, 5)).toBe(2);
    const counters = [...Array(3).fill({ id: a!, kind: "+1/+1" }), ...Array(2).fill({ id: b!, kind: "+1/+1" })];
    expect(planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 4, { counters: counters.slice(0, 4) })).toBeNull();
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 5, { counters })));
    expect(s.objects[a!]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.objects[b!]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.battlefield.some((id) => s.cards[s.objects[id]!.cardId]!.name === "Hierophant Bio-Titan")).toBe(true);
  });

  it("only +1/+1 counters, only on creatures you control", () => {
    const { s: s0, ap, ids, opp } = setup([titan()]);
    const [a] = bears(s0, ap, 1);
    const [theirs] = bears(s0, opp, 1);
    s0.objects[a!]!.counters["-1/-1"] = 1;
    s0.objects[theirs!]!.counters["+1/+1"] = 2;
    invalidateCharacteristics(s0);
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, 1, { counters: [{ id: a!, kind: "-1/-1" }] })).not.toBeNull();
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, 1, { counters: [{ id: theirs!, kind: "+1/+1" }] })).not.toBeNull();
  });
});

describe("Dargo, the Shipwrecker: sacrifices as it's cast and earlier this turn (CR 601.2f)", () => {
  it("two Clues sacrificed for it make it {2}{R}, the ones it sacrificed not counted twice", () => {
    supported(dargo());
    const { s: s0, ap, ids } = setup([dargo()]);
    const clues = [putOnBattlefield(s0, ap, clue("Clue A")), putOnBattlefield(s0, ap, clue("Clue B"))];
    leaveLands(s0, ap, 3, ["Mountain"]);
    expect(total(s0, ap, ids[0]!, 2)).toBe(3);
    expect(planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 1, { sacrifice: clues.slice(0, 1) })).toBeNull();
    const s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 2, { sacrifice: clues }));
    expect(clues.every((c) => s.objects[c]!.zone !== "battlefield")).toBe(true);
    expect(s.stack).toHaveLength(1);
    // The lands it used: three, not one.
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Land") && !s.objects[id]!.tapped)).toHaveLength(0);
  });

  it("an artifact creature sacrificed earlier this turn takes {2} off once, with none sacrificed for it (rulings)", () => {
    const { s: s0, ap, ids } = setup([dargo()]);
    s0.turnLog = { ...(s0.turnLog ?? {}), sacrificed: [{ player: ap, types: ["Artifact", "Creature"], subtypes: [] }, { player: ap, types: ["Land"], subtypes: [] }] } as GameState["turnLog"];
    expect(total(s0, ap, ids[0]!, 0)).toBe(5);
    leaveLands(s0, ap, 5, ["Mountain"]);
    expect(planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 0)).not.toBeNull();
  });

  it("another player's sacrifices don't count", () => {
    const { s: s0, ap, ids, opp } = setup([dargo()]);
    s0.turnLog = { ...(s0.turnLog ?? {}), sacrificed: [{ player: opp, types: ["Creature"], subtypes: [] }] } as GameState["turnLog"];
    expect(total(s0, ap, ids[0]!, 0)).toBe(7);
  });
});

describe("Galloping Lizrog: remove any number of +1/+1 counters, twice that many on it", () => {
  /** Lizrog cast and its trigger waiting on `ap`'s choice. */
  const scene = () => {
    const { s: s0, ap, ids } = setup([lizrog()]);
    const [a] = bears(s0, ap, 1);
    s0.objects[a!]!.counters["+1/+1"] = 2;
    s0.objects[a!]!.counters["-1/-1"] = 0;
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    return { s, ap, bear: a!, liz: ids[0]! };
  };

  it("two removed from a Bear put four on it", () => {
    supported(lizrog());
    let { s, ap, bear: a, liz } = scene();
    expect(s.pending?.kind === "chooseOption" && s.pending.what).toBe("removeCounter");
    s = act(s, { type: "chooseOption", player: ap, choice: `${a}:+1/+1` });
    s = act(s, { type: "chooseOption", player: ap, choice: `${a}:+1/+1` });
    s = settle(s, ap);
    expect(s.objects[a]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.objects[liz]!.counters["+1/+1"]).toBe(4);
    expect(power(s, s.objects[liz]!)).toBe(7);
  });

  it("none removed: none put", () => {
    let { s, ap, bear: a, liz } = scene();
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "done" }), ap);
    expect(s.objects[a]!.counters["+1/+1"]).toBe(2);
    expect(s.objects[liz]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("gone before it resolves: counters may still be removed, none put on it (rulings)", () => {
    let { s, ap, bear: a, liz } = scene();
    moveObject(s, liz, "graveyard");
    invalidateCharacteristics(s);
    s = act(s, { type: "chooseOption", player: ap, choice: `${a}:+1/+1` });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "done" }), ap);
    expect(s.objects[a]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[liz]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(toughness(s, s.objects[a]!)).toBe(3);
  });

  it("a bot moves its creatures' counters onto it", () => {
    let { s, ap, bear: a, liz } = scene();
    s = settle(s);
    expect(s.objects[a]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.objects[liz]!.counters["+1/+1"]).toBe(4);
  });
});

const tokensNamed = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === name);

describe("Ooze Flux: remove one or more +1/+1 counters from among your creatures, an X/X Ooze (CR 107.3a, 602.2b)", () => {
  it("three counters from two creatures make a 3/3", () => {
    supported(flux());
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, flux());
    const [a, b] = bears(s0, ap, 2);
    s0.objects[a!]!.counters["+1/+1"] = 1;
    s0.objects[b!]!.counters["+1/+1"] = 2;
    invalidateCharacteristics(s0);
    const counters = [{ id: a!, kind: "+1/+1" }, { id: b!, kind: "+1/+1" }, { id: b!, kind: "+1/+1" }];
    expect(planActivate(s0, ap, f, 0, [], undefined, undefined, 3, { counters: counters.slice(0, 2) })).toBeNull();
    const s = settle(run(s0, planActivate(s0, ap, f, 0, [], undefined, undefined, 3, { counters })));
    const ooze = tokensNamed(s, ap, "Ooze Token");
    expect(ooze).toHaveLength(1);
    expect([power(s, s.objects[ooze[0]!]!), toughness(s, s.objects[ooze[0]!]!)]).toEqual([3, 3]);
    expect([s.objects[a!]!.counters["+1/+1"] ?? 0, s.objects[b!]!.counters["+1/+1"] ?? 0]).toEqual([0, 0]);
  });

  it("not with none: X can't be 0", () => {
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, flux());
    const [a] = bears(s0, ap, 1);
    s0.objects[a!]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s0);
    expect(abilityProblem(s0, ap, f, 0, [], undefined, undefined, 0, { counters: [] })).not.toBeNull();
    expect(planActivate(s0, ap, f, 0, [], undefined, undefined, 0)).toBeNull();
  });
});

describe("The Astonishing Ant-Man: remove any number of +1/+1 counters from it, that many Insects", () => {
  it("three removed make three 1/1 Insects", () => {
    supported(antMan());
    const { s: s0, ap } = setup([]);
    const ant = putOnBattlefield(s0, ap, antMan());
    s0.objects[ant]!.counters["+1/+1"] = 4;
    invalidateCharacteristics(s0);
    expect(planActivate(s0, ap, ant, 0, [], undefined, undefined, 5)).toBeNull();
    const s = settle(run(s0, planActivate(s0, ap, ant, 0, [], undefined, undefined, 3)));
    expect(tokensNamed(s, ap, "Insect Token")).toHaveLength(3);
    expect(s.objects[ant]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[ant]!.tapped).toBe(true);
  });

  it("none removed: no Insects", () => {
    const { s: s0, ap } = setup([]);
    const ant = putOnBattlefield(s0, ap, antMan());
    s0.objects[ant]!.counters["+1/+1"] = 2;
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planActivate(s0, ap, ant, 0, [], undefined, undefined, 0)));
    expect(tokensNamed(s, ap, "Insect Token")).toHaveLength(0);
    expect(s.objects[ant]!.counters["+1/+1"]).toBe(2);
  });
});

describe("Baba Lysaga, Night Witch: sacrifice up to three permanents, then card types among them (CR 205.2a, 608.2h)", () => {
  const scene = () => {
    const { s, ap, opp } = setup([]);
    const b = putOnBattlefield(s, ap, baba());
    const thing = putOnBattlefield(s, ap, card("Ornithopter", "Artifact Creature — Thopter", "{0}", { power: "0", toughness: "2" }));
    const ench = putOnBattlefield(s, ap, card("Pacifism Test", "Enchantment", "{1}{W}"));
    const land = s.battlefield.find((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.name === "Swamp")!;
    const [bear1] = bears(s, ap, 1);
    return { s, ap, opp, b, thing, ench, land, bear: bear1! };
  };

  it("an artifact creature, an enchantment and a land: four card types, so 3 life drained and three cards", () => {
    supported(baba());
    const { s: s0, ap, opp, b, thing, ench, land } = scene();
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planActivate(s0, ap, b, 0, [], undefined, undefined, 3, { sacrifice: [thing, ench, land] })));
    expect([thing, ench, land].map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "graveyard"]);
    expect(s.players[ap]!.hand.length).toBe(hand + 3);
    expect(s.players[ap]!.life).toBe(s0.players[ap]!.life + 3);
    for (const o of s.turnOrder.filter((p) => p !== ap)) expect(s.players[o]!.life).toBe(s0.players[o]!.life - 3);
    expect(opp).not.toBe(ap);
  });

  it("two creatures and a land are only two card types: nothing happens, though they're sacrificed (rulings)", () => {
    const { s: s0, ap, b, land, bear: bear1 } = scene();
    const [bear2] = bears(s0, ap, 1);
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planActivate(s0, ap, b, 0, [], undefined, undefined, 3, { sacrifice: [bear1, bear2!, land] })));
    expect([bear1, bear2!, land].map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "graveyard"]);
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.players[ap]!.life).toBe(s0.players[ap]!.life);
  });

  it("it can be one of the three, an artifact creature and an enchantment (as they last existed)", () => {
    const { s: s0, ap, b, thing, ench } = scene();
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planActivate(s0, ap, b, 0, [], undefined, undefined, 3, { sacrifice: [b, thing, ench] })));
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 3);
  });

  it("no more than three, and none is allowed", () => {
    const { s: s0, ap, b, thing, ench, land, bear: bear1 } = scene();
    expect(abilityProblem(s0, ap, b, 0, [], undefined, undefined, 4, { sacrifice: [thing, ench, land, bear1] })).toMatch(/at most 3/);
    const s = settle(run(s0, planActivate(s0, ap, b, 0, [], undefined, undefined, 0)));
    expect(s.objects[b]!.tapped).toBe(true);
    expect(s.players[ap]!.life).toBe(s0.players[ap]!.life);
  });
});
