// Lane B round B168: a card chosen from a revealed hand and the top card of a library put on the bottom (Psychotic
// Episode; rulings, CR 701.20a, 400.7), a reflexive fight once an Equipment is attached as it enters (Novel Nunchaku;
// CR 603.12, 701.3c, rulings), an Aura's granted ability that its controller resolves for (Hold for Ransom; rulings, CR
// 608.2h), "if you put a counter on ~ this turn" (Fractal Tender; rulings, CR 400.7), exiling your creatures for that many
// Dragons and returning them (Day of the Dragons; rulings, CR 607.2a) and a counter of each kind on either of two tokens
// (Exotic Pets).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type TargetChoice } from "../src";

// Real card data (Scryfall).
const episode = (): CardDef => ({"oracleId":"0ac7bacd-944d-44f4-927b-28e8c0a4371d","name":"Psychotic Episode","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target player reveals their hand and the top card of their library. You choose a card revealed this way. That player puts the chosen card on the bottom of their library.\nMadness {1}{B} (If you discard this card, discard it into exile. When you do, cast it for its madness cost or put it into your graveyard.)","colors":["B"],"colorIdentity":["B"],"keywords":["Madness"],"layout":"normal"}) as CardDef;
const nunchaku = (): CardDef => ({"oracleId":"6d819742-3d02-4d60-9b10-82caa49a9d49","name":"Novel Nunchaku","manaCost":"{2}{G}","cmc":3,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"When this Equipment enters, attach it to target creature you control. When you do, equipped creature fights up to one target creature an opponent controls. (Each deals damage equal to its power to the other.)\nEquipped creature gets +1/+1 and has trample.\nEquip {3} ({3}: Attach to target creature you control. Equip only as a sorcery.)","colors":["G"],"colorIdentity":["G"],"keywords":["Fight","Equip"],"layout":"normal"}) as CardDef;
const ransom = (): CardDef => ({"oracleId":"0c9336c0-c0ec-4fb4-af7c-a7766265e927","name":"Hold for Ransom","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block and has \"{7}: Hold for Ransom's controller sacrifices it and draws a card. Activate only as a sorcery.\"","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"layout":"normal"}) as CardDef;
const tender = (): CardDef => ({"oracleId":"cb45860a-1937-4803-b6d8-331a35be39fd","name":"Fractal Tender","manaCost":"{3}{G}{U}","cmc":5,"typeLine":"Creature — Elf Wizard","supertypes":[],"types":["Creature"],"subtypes":["Elf","Wizard"],"oracleText":"Ward {2}\nIncrement (Whenever you cast a spell, if the amount of mana you spent is greater than this creature's power or toughness, put a +1/+1 counter on this creature.)\nAt the beginning of each end step, if you put a counter on this creature this turn, create a 0/0 green and blue Fractal creature token and put three +1/+1 counters on it.","power":"3","toughness":"3","colors":["G","U"],"colorIdentity":["G","U"],"keywords":["Ward","Increment"],"layout":"normal"}) as CardDef;
const dragons = (): CardDef => ({"oracleId":"c4df259a-cdd4-420a-8e3d-7b69da5c9f6f","name":"Day of the Dragons","manaCost":"{4}{U}{U}{U}","cmc":7,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, exile all creatures you control. Then create that many 5/5 red Dragon creature tokens with flying.\nWhen this enchantment leaves the battlefield, sacrifice all Dragons you control. Then return the exiled cards to the battlefield under your control.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;
const pets = (): CardDef => ({"oracleId":"497cb281-e057-42fc-937d-512855b74159","name":"Exotic Pets","manaCost":"{1}{W}{U}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Create two 1/1 blue Fish creature tokens with \"This token can't be blocked.\" Then for each kind of counter among creatures you control, put a counter of that kind on either of those tokens.","colors":["U","W"],"colorIdentity":["U","W"],"keywords":[],"layout":"normal"}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const pacifism = (): CardDef => ({"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"layout":"normal"}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"layout":"normal"}) as CardDef;
const disenchant = (): CardDef => ({"oracleId":"a7e97fa9-4b72-4548-b854-5be5f18a6f1a","name":"Disenchant","manaCost":"{1}{W}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target artifact or enchantment.","colors":["W"],"colorIdentity":["W"],"keywords":[],"layout":"normal"}) as CardDef;
const shivan = (): CardDef => ({"oracleId":"711eea87-0fa3-46e0-a42b-fa5a86455f04","name":"Shivan Dragon","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying\n{R}: This creature gets +1/+0 until end of turn.","power":"5","toughness":"5","colors":["R"],"colorIdentity":["R"],"keywords":["Flying"],"layout":"normal"}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"layout":"normal"}) as CardDef;
const murder = (): CardDef => ({"oracleId":"938b4e2c-88d9-4637-bc00-e228920c9a78","name":"Murder","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"normal"}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;
const growth = (): CardDef => ({"oracleId":"5748ebf1-24e3-499d-ab7c-c2cebd462a24","name":"Giant Growth","manaCost":"{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature gets +3/+3 until end of turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const wastes = (): CardDef => ({"oracleId":"05d24b0c-904a-46b6-b42a-96a4d91a0dd4","name":"Wastes","manaCost":"","cmc":0,"typeLine":"Basic Land","supertypes":["Basic"],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"layout":"normal"}) as CardDef;
const plainsLand = (): CardDef => ({"oracleId":"bc71ebf6-2056-41f7-be35-b2e5c34afa99","name":"Plains","manaCost":"","cmc":0,"typeLine":"Basic Land — Plains","supertypes":["Basic"],"types":["Land"],"subtypes":["Plains"],"oracleText":"({T}: Add {W}.)","colors":[],"colorIdentity":["W"],"keywords":[],"producedMana":["W"],"layout":"normal"}) as CardDef;
const islandLand = (): CardDef => ({"oracleId":"b2c6aa39-2d2a-459c-a555-fb48ba993373","name":"Island","manaCost":"","cmc":0,"typeLine":"Basic Land — Island","supertypes":["Basic"],"types":["Land"],"subtypes":["Island"],"oracleText":"({T}: Add {U}.)","colors":[],"colorIdentity":["U"],"keywords":[],"producedMana":["U"],"layout":"normal"}) as CardDef;

const growthCounter = (): CardDef => ({"oracleId":"650bf82e-7f83-470c-bf4a-34281bfe9341","name":"Battlegrowth","manaCost":"{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Put a +1/+1 counter on target creature.","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;
const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const tgt = (id: string): TargetChoice => ({ kind: "object", id }) as TargetChoice;
const playerT = (id: number): TargetChoice => ({ kind: "player", id }) as TargetChoice;
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
const named = (s: GameState, name: string) => s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === name);
const nameOf = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;

describe("Psychotic Episode: a card from the revealed hand and top card put on the bottom of the library", () => {
  it("compiles", () => supported(episode()));

  it("you may choose the top card of the library: it goes to the bottom, the same card (CR 400.7)", () => {
    const { s: s0, ap, ids, opp } = setup([episode()]);
    const hand = [...s0.players[opp]!.hand];
    const top = s0.players[opp]!.library[0]!;
    const size = s0.players[opp]!.library.length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [playerT(opp)])));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 1, max: 1 });
    expect([...(s.pending as { cards: string[] }).cards].sort()).toEqual([...hand, top].sort());
    expect(s.log.some((l) => /reveals .* from the top of their library/.test(l.text))).toBe(true);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [top] }));
    const lib = s.players[opp]!.library;
    expect(lib).toHaveLength(size);
    expect(lib[lib.length - 1]).toBe(top);
    expect(s.objects[top]!.zone).toBe("library");
    expect(s.players[opp]!.hand).toEqual(hand);
  });

  it("or a card from the hand, which goes to the bottom of that player's library", () => {
    const { s: s0, ap, ids, opp } = setup([episode()]);
    const pick = s0.players[opp]!.hand[0]!;
    const size = s0.players[opp]!.library.length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [playerT(opp)])));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [pick] }));
    expect(s.players[opp]!.hand).not.toContain(pick);
    const lib = s.players[opp]!.library;
    expect(lib).toHaveLength(size + 1);
    expect(s.objects[lib[lib.length - 1]!]!.zone).toBe("library");
    expect(nameOf(s, lib[lib.length - 1]!)).toBe(nameOf(s0, pick));
  });

  it("a card that isn't the top one or in the hand can't be chosen", () => {
    const { s: s0, ap, ids, opp } = setup([episode()]);
    const second = s0.players[opp]!.library[1]!;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [playerT(opp)])));
    expect((s.pending as { cards: string[] }).cards).not.toContain(second);
  });
});

describe("Novel Nunchaku: attached as it enters; when you do, the equipped creature fights", () => {
  it("compiles", () => supported(nunchaku()));

  it("it's attached, then the reflexive trigger's target is chosen and the equipped creature fights it", () => {
    const { s: s0, ap, ids, opp } = setup([nunchaku()]);
    const mine = putOnBattlefield(s0, ap, giant());
    const theirs = putOnBattlefield(s0, opp, bears());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(mine)] }));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(mine);
    // The reflexive trigger's target is chosen only now (rulings).
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(theirs)] }));
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(pt(s, mine)).toBe("4/4");
    expect(s.objects[mine]!.damage).toBe(2);
    expect(characteristics(s, s.objects[mine]!).keywords).toContain("Trample");
  });

  it("up to one: with no target chosen, nothing fights", () => {
    const { s: s0, ap, ids, opp } = setup([nunchaku()]);
    const mine = putOnBattlefield(s0, ap, giant());
    const theirs = putOnBattlefield(s0, opp, bears());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(mine)] }));
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "none" } as unknown as TargetChoice] }));
    expect(s.objects[theirs]!.zone).toBe("battlefield");
    expect(s.objects[mine]!.damage).toBe(0);
  });

  it("if its target is gone, nothing is attached and there's no reflexive trigger (CR 603.12)", () => {
    const { s: s0, ap, ids, opp } = setup([nunchaku(), murder()]);
    const mine = putOnBattlefield(s0, ap, giant());
    putOnBattlefield(s0, opp, bears());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s);
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(mine)] });
    // With the enters trigger on the stack, the creature dies.
    s = run(s, planCast(s, ap, ids[1]!, [tgt(mine)]));
    s = settle(s);
    expect(s.objects[mine]!.zone).toBe("graveyard");
    expect(s.objects[ids[0]!]!.attachedTo).toBeUndefined();
    expect(s.pending).toBeFalsy();
    expect(s.stack).toHaveLength(0);
  });
});

describe("Hold for Ransom: the creature's controller may pay {7}; the Aura's controller sacrifices it and draws", () => {
  it("compiles", () => supported(ransom()));

  it("the enchanted creature can't attack or block, and its controller's {7} ability frees it and gives the Aura's controller a card", () => {
    const { s: s0, ap, ids, opp } = setup([ransom()]);
    const theirs = putOnBattlefield(s0, opp, bears());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(theirs)])));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(theirs);
    expect(characteristics(s, s.objects[theirs]!)).toMatchObject({ cantAttack: true, cantBlock: true });
    // Only the creature's controller can activate it (rulings), at sorcery speed, on their own turn.
    expect(planActivate(s, ap, theirs, 0)).toBeNull();
    s = passUntil(s, "main1", opp);
    for (let i = 0; i < 9; i++) putOnBattlefield(s, opp, { ...bears(), oracleId: "wastes-test", name: "Wastes", typeLine: "Basic Land", types: ["Land"], subtypes: [], supertypes: ["Basic"], oracleText: "{T}: Add {C}.", manaCost: "", cmc: 0, colors: [], colorIdentity: [], power: undefined, toughness: undefined } as CardDef);
    const handAp = s.players[ap]!.hand.length;
    const handOpp = s.players[opp]!.hand.length;
    s = settle(run(s, planActivate(s, opp, theirs, 0)));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(handAp + 1);
    expect(s.players[opp]!.hand.length).toBe(handOpp);
  });
});

describe("Hold for Ransom: once the Aura is gone", () => {
  it("removed in response, its controller as it last existed still draws (CR 608.2h)", () => {
    const { s: s0, ap, ids, opp } = setup([ransom()]);
    const theirs = putOnBattlefield(s0, opp, bears());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(theirs)])));
    s = passUntil(s, "main1", opp);
    for (let i = 0; i < 9; i++) putOnBattlefield(s, opp, wastes());
    const dis = putOnBattlefield(s, opp, disenchant());
    s.battlefield.splice(s.battlefield.indexOf(dis), 1);
    s.objects[dis]!.zone = "hand";
    s.players[opp]!.hand.push(dis);
    for (let i = 0; i < 2; i++) putOnBattlefield(s, opp, plainsLand());
    const handAp = s.players[ap]!.hand.length;
    s = run(s, planActivate(s, opp, theirs, 0));
    // With the ability on the stack, its controller destroys the Aura.
    s = run(s, planCast(s, opp, dis, [tgt(ids[0]!)]));
    s = settle(s);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(handAp + 1);
    expect(characteristics(s, s.objects[theirs]!).cantAttack).toBe(false);
  });
});

describe("Fractal Tender: a Fractal at each end step if you put a counter on it this turn", () => {
  it("compiles", () => supported(tender()));

  it("its increment counter this turn makes a Fractal with three +1/+1 counters at the end step", () => {
    const { s: s0, ap, ids } = setup([giant()]);
    const t = putOnBattlefield(s0, ap, tender());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[t]!.counters["+1/+1"]).toBe(1);
    s = settle(passUntil(s, "end", ap));
    const fractals = named(s, "Fractal Token");
    expect(fractals).toHaveLength(1);
    expect(pt(s, fractals[0]!)).toBe("3/3");
    expect(characteristics(s, s.objects[fractals[0]!]!).colors.sort()).toEqual(["G", "U"]);
  });

  it("with no counter put on it this turn, no Fractal", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, tender());
    s0.objects[t]!.counters["+1/+1"] = 2; // from an earlier turn
    const s = settle(passUntil(s0, "end", ap));
    expect(named(s, "Fractal Token")).toHaveLength(0);
  });

  it("a counter put on another creature doesn't count", () => {
    const { s: s0, ap, ids } = setup([growthCounter()]);
    putOnBattlefield(s0, ap, tender());
    const b = putOnBattlefield(s0, ap, bears());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
    s = settle(passUntil(s, "end", ap));
    expect(named(s, "Fractal Token")).toHaveLength(0);
  });
});

describe("Day of the Dragons: your creatures exiled for that many Dragons, back when it leaves", () => {
  it("compiles", () => supported(dragons()));

  it("exiles your creatures (tokens count), makes that many 5/5 flying Dragons, and returns the cards under your control", () => {
    const { s: s0, ap, ids, opp } = setup([dragons(), disenchant()]);
    const b1 = putOnBattlefield(s0, ap, bears());
    const b2 = putOnBattlefield(s0, ap, elves());
    // A creature you control but don't own.
    const stolen = putOnBattlefield(s0, opp, giant());
    s0.objects[stolen]!.controller = ap;
    const theirs = putOnBattlefield(s0, opp, bears());
    for (let i = 0; i < 4; i++) putOnBattlefield(s0, ap, islandLand());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect([b1, b2, stolen].map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile", "exile"]);
    expect(s.objects[theirs]!.zone).toBe("battlefield");
    const drakes = named(s, "Dragon Token");
    expect(drakes).toHaveLength(3);
    expect(pt(s, drakes[0]!)).toBe("5/5");
    expect(characteristics(s, s.objects[drakes[0]!]!).keywords).toContain("Flying");
    // Another Dragon you control is sacrificed too.
    const shiv = putOnBattlefield(s, ap, shivan());
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(ids[0]!)])));
    expect(named(s, "Dragon Token")).toHaveLength(0);
    expect(s.objects[shiv]!.zone).toBe("graveyard");
    for (const id of [b1, b2, stolen]) {
      const back = s.battlefield.find((x) => s.objects[x]!.cardId === s.objects[id]!.cardId && s.objects[x]!.owner === s.objects[id]!.owner && x !== theirs);
      expect(back, nameOf(s, id)).toBeDefined();
      expect(s.objects[back!]!.owner === ap || s.objects[back!]!.owner === opp).toBe(true);
    }
    const giantBack = named(s, "Hill Giant")[0]!;
    expect(s.objects[giantBack]!.owner).toBe(opp);
    expect(characteristics(s, s.objects[giantBack]!).controller).toBe(ap);
  });
});

describe("Exotic Pets: a counter of each kind among your creatures on either Fish", () => {
  it("compiles", () => supported(pets()));

  it("asks for each kind which Fish gets it; opponents' counters don't count", () => {
    const { s: s0, ap, ids, opp } = setup([pets()]);
    const b = putOnBattlefield(s0, ap, bears());
    s0.objects[b]!.counters["+1/+1"] = 3;
    s0.objects[b]!.counters.flying = 1;
    const g = putOnBattlefield(s0, opp, giant());
    s0.objects[g]!.counters.stun = 1;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const fish = named(s, "Fish Token");
    expect(fish).toHaveLength(2);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "eitherToken", counterKind: "+1/+1" });
    expect([...(s.pending as { options: string[] }).options].sort()).toEqual([...fish].sort());
    s = act(s, { type: "chooseOption", player: ap, choice: fish[1]! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "eitherToken", counterKind: "flying" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: fish[1]! }));
    expect(s.objects[fish[1]!]!.counters).toMatchObject({ "+1/+1": 1, flying: 1 });
    expect(Object.values(s.objects[fish[0]!]!.counters).filter((n) => n)).toHaveLength(0);
    expect(characteristics(s, s.objects[fish[1]!]!).keywords).toContain("Flying");
    expect(pt(s, fish[1]!)).toBe("2/2");
  });

  it("with no counters among your creatures, just the two Fish", () => {
    const { s: s0, ap, ids } = setup([pets()]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeFalsy();
    expect(named(s, "Fish Token")).toHaveLength(2);
  });
});

describe("B168 bots", () => {
  it("a bot casts Psychotic Episode at an opponent and picks a card", () => {
    const { s: s0, ap, ids } = setup([episode()]);
    let s = s0;
    for (let i = 0; i < 40 && s.objects[ids[0]!]!.zone === "hand"; i++) {
      const who = waitingOn(s)!;
      const acts = botActions(s, who);
      if (!acts.length) break;
      for (const a of acts) s = act(s, a);
    }
    s = settleBots(s);
    const item = s.log.find((l) => /casts Psychotic Episode targeting/.test(l.text));
    expect(item?.text).toBeDefined();
    expect(item!.text).not.toMatch(new RegExp(`targeting ${s.players[ap]!.name}\\.`));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.log.some((l) => /on the bottom of their library/.test(l.text))).toBe(true);
  });

  it("a bot answers which Fish gets each counter", () => {
    const { s: s0, ap, ids } = setup([pets()]);
    const b = putOnBattlefield(s0, ap, bears());
    s0.objects[b]!.counters["+1/+1"] = 1;
    s0.objects[b]!.counters.stun = 1;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settleBots(s);
    const fish = named(s, "Fish Token");
    expect(fish).toHaveLength(2);
    // The +1/+1 counter on one Fish, the stun counter on the other.
    expect(fish.map((f) => Object.entries(s.objects[f]!.counters).filter(([, n]) => n).length).sort()).toEqual([1, 1]);
  });
});

/** Bots answer every question and pass until the stack is empty. */
function settleBots(s: GameState) {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const who = waitingOn(s)!;
    const acts = s.pending ? botActions(s, who) : [{ type: "passPriority", player: who } as Action];
    if (!acts.length) break;
    for (const a of acts) s = act(s, a);
  }
  return s;
}
