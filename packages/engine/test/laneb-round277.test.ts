// Lane B round B277: Lightning Storm ("Lightning Storm deals X damage to any target, where X is 3 plus the number of charge
// counters on Lightning Storm." / "Discard a land card: Put two charge counters on Lightning Storm. You may choose a new
// target for it. Any player may activate this ability but only if Lightning Storm is on the stack."; CR 113.6, 113.6b,
// 602.2, 113.8, 122.1, 115.7d, rulings) and Sacred Ground ("Whenever a spell or ability an opponent controls causes a land to
// be put into your graveyard from the battlefield, return that card to the battlefield."; CR 608.2, 704.3, 400.7, 110.2a).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup, target } from "./helpers";
import { botActions } from "../src/bot";
import { abilityProblem, applyAction, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const lightningStorm = (): CardDef => ({"oracleId":"2c0fceb6-d92d-4f4a-85a2-0af5be5bba81","name":"Lightning Storm","manaCost":"{1}{R}{R}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Storm deals X damage to any target, where X is 3 plus the number of charge counters on Lightning Storm.\nDiscard a land card: Put two charge counters on Lightning Storm. You may choose a new target for it. Any player may activate this ability but only if Lightning Storm is on the stack.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const sacredGround = (): CardDef => ({"oracleId":"b18e773c-611b-4c18-8b2d-8d3a7e5ddc93","name":"Sacred Ground","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a spell or ability an opponent controls causes a land to be put into your graveyard from the battlefield, return that card to the battlefield.","colors":["W"],"colorIdentity":["W"],"keywords":[],"layout":"normal"}) as CardDef;
const stoneRain = (): CardDef => ({"oracleId":"6e880df6-fc00-43d2-a9c8-f575f40b78c6","name":"Stone Rain","manaCost":"{2}{R}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Destroy target land.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const wildfire = (): CardDef => ({"oracleId":"0da68ca2-07fd-4359-95a9-fb2f815e6ed0","name":"Wildfire","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Each player sacrifices four lands of their choice. Wildfire deals 4 damage to each creature.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const dryadArbor = (): CardDef => ({"oracleId":"e996cd67-739c-40f4-b276-0042acf26c71","name":"Dryad Arbor","manaCost":"","cmc":0,"typeLine":"Land Creature — Forest Dryad","supertypes":[],"types":["Land","Creature"],"subtypes":["Forest","Dryad"],"oracleText":"(This land isn't a spell, it's affected by summoning sickness, and it has \"{T}: Add {G}.\")","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"layout":"normal"}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const restinPeace = (): CardDef => ({"oracleId":"087f9ad7-e74f-40e2-8102-1ed2925d0418","name":"Rest in Peace","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, exile all graveyards.\nIf a card or token would be put into a graveyard from anywhere, exile it instead.","colors":["W"],"colorIdentity":["W"],"keywords":[],"layout":"normal"}) as CardDef;
const mountain = (): CardDef => ({"oracleId":"a3fb7228-e76b-4e96-a40e-20b5fed75685","name":"Mountain","manaCost":"","cmc":0,"typeLine":"Basic Land — Mountain","supertypes":["Basic"],"types":["Land"],"subtypes":["Mountain"],"oracleText":"({T}: Add {R}.)","colors":[],"colorIdentity":["R"],"keywords":[],"producedMana":["R"],"layout":"normal"}) as CardDef;
const forest = (): CardDef => ({"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"layout":"normal"}) as CardDef;
const evolvingWilds = (): CardDef => ({"oracleId":"a75445d3-1303-4bb5-89ad-26ea93fecd48","name":"Evolving Wilds","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.","colors":[],"colorIdentity":[],"keywords":[],"layout":"normal"}) as CardDef;
const cancel = (): CardDef => ({"oracleId":"7d00fb28-ea6c-49a9-b4af-ffb38860a9a7","name":"Cancel","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target spell.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;

const supported = (...ds: CardDef[]) => ds.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 400 && !s.over && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes priority until `pid` has it (a spell or ability stays on the stack). */
const priorityTo = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 8 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(waitingOn(s)).toBe(pid);
  return s;
};
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));
const landInHand = (s: GameState, pid: PlayerId) => s.players[pid]!.hand.find((id) => s.cards[s.objects[id]!.cardId]!.types.includes("Land"))!;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const storm = (s: GameState) => s.stack.find((x) => x.kind === "spell")!;

describe("Lightning Storm", () => {
  it("is supported", () => supported(lightningStorm(), sacredGround()));

  /** You cast Lightning Storm at the next player; it's on the stack. */
  const board = () => {
    const { s: s0, ap, opp, ids } = setup([lightningStorm(), cancel()]);
    const s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    expect(s.stack.length).toBe(1);
    return { s, ap, opp, ls: ids[0]!, cancel: ids[1]! };
  };

  it("works only while it's on the stack", () => {
    const { s, ap, ids } = setup([lightningStorm()]);
    expect(abilityProblem(s, ap, ids[0]!, 0)).toMatch(/only while it's on the stack/);
  });

  it("deals 3 damage with no counters", () => {
    let { s, ap, opp } = board();
    const before = life(s, opp);
    s = settle(s);
    expect(life(s, opp)).toBe(before - 3);
    expect(life(s, ap)).toBe(40);
  });

  it("any player may activate it: the target's player discards a land, adds two counters and moves the damage to the caster", () => {
    let { s, ap, opp, ls } = board();
    s = priorityTo(s, opp);
    const land = landInHand(s, opp);
    s = run(s, planActivate(s, opp, ls, 0, undefined, undefined, undefined, undefined, { discard: [land] }));
    expect(zone(s, land)).toBe("graveyard");
    // The ability is the activator's (CR 113.8), on top of the spell.
    expect(s.stack.length).toBe(2);
    expect(s.stack[1]!.controller).toBe(opp);
    s = settle(s);
    expect(s.objects[ls]!.counters.charge).toBe(2);
    // The activator chooses the new target as the ability resolves (CR 115.7d).
    expect(s.pending).toMatchObject({ kind: "newTargets", player: opp, stackId: storm(s).id });
    s = act(s, { type: "newTargets", player: opp, targets: [{ kind: "player", id: ap }] });
    expect(storm(s).targets).toMatchObject([{ kind: "player", id: ap }]);
    const before = life(s, ap);
    const oppBefore = life(s, opp);
    s = settle(s);
    expect(life(s, ap)).toBe(before - 5);
    expect(life(s, opp)).toBe(oppBefore);
    // Its counters go away when it leaves the stack (rulings).
    expect(zone(s, ls)).toBe("graveyard");
    expect(s.objects[ls]!.counters.charge ?? 0).toBe(0);
  });

  it("keeps its target if the activator chooses none, and two activations add four counters", () => {
    let { s, ap, opp, ls } = board();
    s = run(s, planActivate(s, ap, ls, 0, undefined, undefined, undefined, undefined, { discard: [landInHand(s, ap)] }));
    s = priorityTo(s, opp);
    s = run(s, planActivate(s, opp, ls, 0, undefined, undefined, undefined, undefined, { discard: [landInHand(s, opp)] }));
    expect(s.stack.length).toBe(3);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "newTargets", player: opp });
    s = act(s, { type: "newTargets", player: opp });
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "newTargets", player: ap });
    s = act(s, { type: "newTargets", player: ap });
    expect(s.objects[ls]!.counters.charge).toBe(4);
    const before = life(s, opp);
    s = settle(s);
    expect(life(s, opp)).toBe(before - 7);
  });

  it("its ability does nothing once the spell has left the stack", () => {
    let { s, ap, opp, ls, cancel: cx } = board();
    s = run(s, planActivate(s, ap, ls, 0, undefined, undefined, undefined, undefined, { discard: [landInHand(s, ap)] }));
    s = run(s, planCast(s, ap, cx, [{ kind: "stack", id: storm(s).id }]));
    s = settle(s);
    expect(zone(s, ls)).toBe("graveyard");
    expect(logged(s, /no longer on the stack/)).toBe(true);
    expect(s.pending).toBeFalsy();
    expect(life(s, opp)).toBe(40);
  });

  it("can't be activated without a land card to discard", () => {
    let { s, opp, ls } = board();
    s = priorityTo(s, opp);
    for (const id of [...s.players[opp]!.hand]) if (s.cards[s.objects[id]!.cardId]!.types.includes("Land")) {
      s.players[opp]!.hand.splice(s.players[opp]!.hand.indexOf(id), 1);
      s.objects[id]!.zone = "library";
      s.players[opp]!.library.unshift(id);
    }
    expect(planActivate(s, opp, ls, 0)).toBeNull();
  });

  it("a bot it's aimed at discards a land to send it at someone else", () => {
    let { s, opp, ls } = board();
    s = priorityTo(s, opp);
    const acts = botActions(s, opp);
    expect(acts.some((a) => a.type === "activateAbility" && a.objectId === ls)).toBe(true);
    for (const a of acts) s = act(s, a);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "newTargets", player: opp });
    for (const a of botActions(s, opp)) s = act(s, a);
    const t = storm(s).targets![0]!;
    expect(t.kind === "player" && t.id === opp).toBe(false);
  });
});

describe("Sacred Ground", () => {
  /** The next player has Sacred Ground and two Mountains; you have Stone Rain, Wildfire and Lightning Bolt (and `extra`). */
  const board = (extra: CardDef[] = []) => {
    const { s, ap, opp, ids } = setup([stoneRain(), wildfire(), lightningBolt(), ...extra]);
    const ground = putOnBattlefield(s, opp, sacredGround());
    const m1 = putOnBattlefield(s, opp, mountain());
    const m2 = putOnBattlefield(s, opp, mountain());
    return { s, ap, opp, ground, m1, m2, rain: ids[0]!, fire: ids[1]!, bolt: ids[2]!, ids };
  };
  /** Settles the stack, every question answered by the bot logic of whoever is asked. */
  const settleAll = (s: GameState) => {
    for (let i = 0; i < 60; i++) {
      s = settle(s);
      if (!s.pending) return s;
      for (const a of botActions(s, s.pending.player)) s = act(s, a);
    }
    return s;
  };

  it("returns a land an opponent's spell destroys, under your control", () => {
    let { s, ap, opp, m1, rain } = board();
    s = settle(run(s, planCast(s, ap, rain, [target(m1)])));
    expect(zone(s, m1)).toBe("battlefield");
    expect(s.objects[m1]!.controller).toBe(opp);
    expect(s.objects[m1]!.zoneChanges).toBe(2); // to the graveyard and back: a new object (CR 400.7)
    expect(s.players[opp]!.graveyard.includes(m1)).toBe(false);
  });

  it("returns the lands an opponent's spell makes you sacrifice, not the opponent's own", () => {
    let { s, ap, m1, m2, fire } = board();
    const apLands = s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Land")).length;
    s = settleAll(run(s, planCast(s, ap, fire)));
    expect(zone(s, m1)).toBe("battlefield");
    expect(zone(s, m2)).toBe("battlefield");
    expect(s.objects[m1]!.zoneChanges).toBe(2);
    // Your four sacrificed lands stay in your graveyard: your own spell.
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Land")).length).toBe(apLands - 4);
  });

  it("doesn't return a land creature that dies as a state-based action after damage (CR 704.3)", () => {
    let { s, ap, opp, bolt } = board();
    const arbor = putOnBattlefield(s, opp, dryadArbor());
    s = settle(run(s, planCast(s, ap, bolt, [target(arbor)])));
    expect(zone(s, arbor)).toBe("graveyard");
  });

  it("doesn't return a land you sacrifice for your own ability's cost", () => {
    let { s, ap, opp, bolt } = board();
    const wilds = putOnBattlefield(s, opp, evolvingWilds());
    s = run(s, planCast(s, ap, bolt, [{ kind: "player", id: opp }]));
    s = priorityTo(s, opp);
    s = settleAll(run(s, planActivate(s, opp, wilds, 0)));
    expect(zone(s, wilds)).toBe("graveyard");
  });

  it("returns a land you own that an opponent controls and sacrifices for their ability's cost", () => {
    let { s, ap, opp } = board();
    const wilds = putOnBattlefield(s, opp, evolvingWilds());
    s.objects[wilds]!.controller = ap;
    s = settleAll(run(s, planActivate(s, ap, wilds, 0)));
    expect(zone(s, wilds)).toBe("battlefield");
    expect(s.objects[wilds]!.controller).toBe(opp);
  });

  it("doesn't trigger when the land is exiled instead (Rest in Peace)", () => {
    let { s, ap, m1, rain } = board();
    putOnBattlefield(s, ap, restinPeace());
    s = settle(run(s, planCast(s, ap, rain, [target(m1)])));
    expect(zone(s, m1)).toBe("exile");
  });
});
