// Lane B round B276: Secret Invasion ("When this Aura enters, exile up to one target creature other than enchanted creature
// until this Aura leaves the battlefield. Enchanted creature becomes a copy of that creature until this Aura leaves the
// battlefield."; CR 610.3, 610.3b, 608.2h, 707.2, 611.2b) and Runesword ("{3}, {T}: Target attacking creature gets +2/+0
// until end of turn. When that creature leaves the battlefield this turn, sacrifice this artifact. If the creature deals
// damage to a creature this turn, the creature dealt damage can't be regenerated this turn. If a creature dealt damage by
// the targeted creature would die this turn, exile that creature instead."; CR 603.7c, 400.7, 701.19c, 614.1a, 608.2h).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup, swamp, target } from "./helpers";
import { botActions, wardCosts } from "../src/bot";
import { applyAction, characteristics, isFullySupported, moveObject, objHasKeyword, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const invasion = (): CardDef => ({"oracleId":"25443ea4-3177-4e29-a2b1-f3fee60b3205","name":"Secret Invasion","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature you control\nWhen this Aura enters, exile up to one target creature other than enchanted creature until this Aura leaves the battlefield. Enchanted creature becomes a copy of that creature until this Aura leaves the battlefield.\nEnchanted creature has ward {2}.","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant"],"layout":"normal"}) as CardDef;
const runesword = (): CardDef => ({"oracleId":"964c2003-cef0-4ac7-9f66-4e20893c8e50","name":"Runesword","manaCost":"{6}","cmc":6,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{3}, {T}: Target attacking creature gets +2/+0 until end of turn. When that creature leaves the battlefield this turn, sacrifice this artifact. If the creature deals damage to a creature this turn, the creature dealt damage can't be regenerated this turn. If a creature dealt damage by the targeted creature would die this turn, exile that creature instead.","colors":[],"colorIdentity":[],"keywords":[],"layout":"normal"}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;
const serraAngel = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"layout":"normal"}) as CardDef;
const disenchant = (): CardDef => ({"oracleId":"a7e97fa9-4b72-4548-b854-5be5f18a6f1a","name":"Disenchant","manaCost":"{1}{W}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target artifact or enchantment.","colors":["W"],"colorIdentity":["W"],"keywords":[],"layout":"normal"}) as CardDef;
const drudgeSkeletons = (): CardDef => ({"oracleId":"c180ed02-07f4-4538-9bea-8c249234a8e2","name":"Drudge Skeletons","manaCost":"{1}{B}","cmc":2,"typeLine":"Creature — Skeleton","supertypes":[],"types":["Creature"],"subtypes":["Skeleton"],"oracleText":"{B}: Regenerate this creature. (The next time this creature would be destroyed this turn, instead tap it, remove it from combat, and heal all damage on it.)","power":"1","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Heal","Regenerate"],"layout":"normal"}) as CardDef;
const moggFanatic = (): CardDef => ({"oracleId":"7efd5d62-6da2-428a-98e3-5b842f668656","name":"Mogg Fanatic","manaCost":"{R}","cmc":1,"typeLine":"Creature — Goblin","supertypes":[],"types":["Creature"],"subtypes":["Goblin"],"oracleText":"Sacrifice this creature: It deals 1 damage to any target.","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const prodigalSorcerer = (): CardDef => ({"oracleId":"5e961d15-5972-4e4b-9385-1cd7cd7c6bbe","name":"Prodigal Sorcerer","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Human Wizard Sorcerer","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard","Sorcerer"],"oracleText":"{T}: This creature deals 1 damage to any target.","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;
const unsummon = (): CardDef => ({"oracleId":"837182db-1bf3-4a2c-bd01-1af9d9873561","name":"Unsummon","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Return target creature to its owner's hand.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;
const llanowarElves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"layout":"normal"}) as CardDef;

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
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const name = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));
/** Only the cards the test put in `pid`'s hand stay there; the drawn ones go back on top of the library. */
const onlyHand = (s: GameState, pid: PlayerId, keep: string[]) => {
  for (const id of s.players[pid]!.hand.filter((h) => !keep.includes(h))) {
    s.players[pid]!.hand.splice(s.players[pid]!.hand.indexOf(id), 1);
    s.objects[id]!.zone = "library";
    s.players[pid]!.library.unshift(id);
  }
};

describe("Secret Invasion", () => {
  it("is supported", () => supported(invasion(), runesword()));

  /** Your Grizzly Bears and the next player's Serra Angel; Secret Invasion and Disenchant in your hand. */
  const board = () => {
    const { s, ap, opp, ids } = setup([invasion(), disenchant()]);
    onlyHand(s, ap, ids);
    const bears = putOnBattlefield(s, ap, grizzlyBears());
    const angel = putOnBattlefield(s, opp, serraAngel());
    return { s, ap, opp, bears, angel, aura: ids[0]!, dis: ids[1]! };
  };
  /** Casts Secret Invasion on `host` and stops at its enters trigger's target choice. */
  const castOn = (s: GameState, ap: PlayerId, aura: string, host: string) => {
    s = settle(run(s, planCast(s, ap, aura, [target(host)])));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    return s;
  };

  it("exiles the target, and the enchanted creature is a copy of it until the Aura leaves; then both are as they were", () => {
    let { s, ap, opp, bears, angel, aura, dis } = board();
    s = castOn(s, ap, aura, bears);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(angel)] }));
    expect(zone(s, angel)).toBe("exile");
    expect(name(s, bears)).toBe("Serra Angel");
    expect(pt(s, bears)).toBe("4/4");
    expect(objHasKeyword(s, s.objects[bears]!, "Flying")).toBe(true);
    // The Aura's own static still applies to the copy (layer 6 after layer 1, CR 613.1a, 613.1f).
    expect(wardCosts(s, opp, [target(bears)])).toEqual(["{2}"]);
    expect(s.objects[bears]!.controller).toBe(ap);
    expect(logged(s, /Grizzly Bears becomes a copy of Serra Angel until Secret Invasion leaves the battlefield/)).toBe(true);
    // Destroying the Aura ends the copy and returns the exiled card under its owner's control (CR 610.3, 610.3c).
    s = settle(run(s, planCast(s, ap, dis, [target(aura)])));
    expect(zone(s, aura)).toBe("graveyard");
    expect(name(s, bears)).toBe("Grizzly Bears");
    expect(pt(s, bears)).toBe("2/2");
    const back = s.battlefield.find((id) => name(s, id) === "Serra Angel");
    expect(back).toBeDefined();
    expect(s.objects[back!]!.controller).toBe(opp);
  });

  it("can't target the creature it enchants", () => {
    let { s, ap, bears, aura } = board();
    s = castOn(s, ap, aura, bears);
    expect(() => applyAction(s, { type: "chooseTargets", player: ap, targets: [target(bears)] })).toThrow();
  });

  it("with no target chosen, nothing is exiled and the creature stays itself", () => {
    let { s, ap, bears, angel, aura } = board();
    s = castOn(s, ap, aura, bears);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "none" }] }));
    expect(zone(s, angel)).toBe("battlefield");
    expect(name(s, bears)).toBe("Grizzly Bears");
    expect(zone(s, aura)).toBe("battlefield");
  });

  it("does nothing if the Aura has left the battlefield before its trigger resolves (CR 610.3b, 611.2b)", () => {
    let { s, ap, bears, angel, aura } = board();
    s = castOn(s, ap, aura, bears);
    s = act(s, { type: "chooseTargets", player: ap, targets: [target(angel)] });
    expect(s.stack.length).toBe(1);
    moveObject(s, aura, "graveyard");
    s = settle(s);
    expect(zone(s, angel)).toBe("battlefield");
    expect(name(s, bears)).toBe("Grizzly Bears");
  });

  it("copies the creature as it last existed on the battlefield (CR 608.2h): a token too, which doesn't come back", () => {
    let { s, ap, opp, bears, aura, dis } = board();
    const token = putOnBattlefield(s, opp, serraAngel());
    s.objects[token]!.isToken = true;
    s = castOn(s, ap, aura, bears);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(token)] }));
    expect(s.battlefield.includes(token)).toBe(false);
    expect(name(s, bears)).toBe("Serra Angel");
    s = settle(run(s, planCast(s, ap, dis, [target(aura)])));
    expect(name(s, bears)).toBe("Grizzly Bears");
    expect(s.battlefield.filter((id) => name(s, id) === "Serra Angel").length).toBe(1); // the opponent's card one only
  });

  it("the copy lasts while the enchanted creature is itself; the exiled card returns if the creature leaves and the Aura goes", () => {
    let { s, ap, opp, bears, angel, aura } = board();
    s = castOn(s, ap, aura, bears);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(angel)] }));
    // The Bears (now Serra Angel) dies: the Aura goes to the graveyard as a state-based action, and the Angel comes back.
    moveObject(s, bears, "graveyard");
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(zone(s, aura)).toBe("graveyard");
    const back = s.battlefield.find((id) => name(s, id) === "Serra Angel" && s.objects[id]!.controller === opp);
    expect(back).toBeDefined();
  });

  it("bots aim its enters trigger at an opponent's creature", () => {
    let { s, ap, bears, angel, aura } = board();
    s = castOn(s, ap, aura, bears);
    for (const a of botActions(s, ap)) s = act(s, a);
    s = settle(s);
    expect(zone(s, angel)).toBe("exile");
    expect(name(s, bears)).toBe("Serra Angel");
  });
});

describe("Runesword", () => {
  /** Your Runesword and an untapped attacker; the next player's creatures; to declare blockers. */
  const board = (attackerDef: CardDef = grizzlyBears()) => {
    const { s, ap, opp, ids } = setup([unsummon()]);
    onlyHand(s, ap, ids);
    const sword = putOnBattlefield(s, ap, runesword());
    const attacker = putOnBattlefield(s, ap, attackerDef);
    return { s, ap, opp, sword, attacker, unsummon: ids[0]! };
  };
  const attackWith = (s: GameState, attackers: string[], defender: PlayerId) => {
    for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return settle(act(s, { type: "declareAttackers", player: s.activePlayer, attacks: attackers.map((attacker) => ({ attacker, defender })) }));
  };
  const blockWith = (s: GameState, blocks: [string, string][]) => {
    for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const p = s.pending!;
    return settle(act(s, { type: "declareBlockers", player: p.player, blocks: blocks.map(([blocker, attacker]) => ({ blocker, attacker })) }));
  };
  const swordOn = (s: GameState, ap: PlayerId, sword: string, t: string) => settle(run(s, planActivate(s, ap, sword, 0, [target(t)])));
  /** Passes priority until combat damage is dealt and its state-based actions are done (the end of combat step). */
  const toEndOfCombat = (s: GameState) => {
    for (let i = 0; i < 50 && s.step !== "endCombat" && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return s;
  };

  it("targets only an attacking creature, and gives it +2/+0", () => {
    let { s, ap, opp, sword, attacker } = board();
    expect(planActivate(s, ap, sword, 0, [target(attacker)])).toBeNull();
    s = attackWith(s, [attacker], opp);
    s = swordOn(s, ap, sword, attacker);
    expect(pt(s, attacker)).toBe("4/2");
  });

  it("a creature it deals damage to can't be regenerated, and is exiled instead of dying", () => {
    let { s, ap, opp, sword, attacker } = board();
    const skel = putOnBattlefield(s, opp, drudgeSkeletons());
    putOnBattlefield(s, opp, swamp);
    s = attackWith(s, [attacker], opp);
    s = blockWith(s, [[skel, attacker]]);
    s = swordOn(s, ap, sword, attacker);
    // The Skeletons' controller regenerates it anyway: the shield can't be used (CR 701.19c).
    for (let i = 0; i < 5 && waitingOn(s) !== opp; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(run(s, planActivate(s, opp, skel, 0)));
    expect(s.objects[skel]!.regenShields).toBe(1);
    s = toEndOfCombat(s);
    expect(zone(s, skel)).toBe("exile");
    expect(zone(s, attacker)).toBe("battlefield"); // a 4/2 dealt 1 damage
  });

  it("without it, the same block lets the Skeletons regenerate", () => {
    let { s, ap, opp, attacker } = board();
    const skel = putOnBattlefield(s, opp, drudgeSkeletons());
    putOnBattlefield(s, opp, swamp);
    s = attackWith(s, [attacker], opp);
    s = blockWith(s, [[skel, attacker]]);
    for (let i = 0; i < 5 && waitingOn(s) !== opp; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(run(s, planActivate(s, opp, skel, 0)));
    s = toEndOfCombat(s);
    expect(zone(s, skel)).toBe("battlefield");
    expect(s.objects[skel]!.tapped).toBe(true);
  });

  it("damage the creature dealt earlier this turn counts too", () => {
    let { s, ap, opp, sword } = board();
    const sorcerer = putOnBattlefield(s, ap, prodigalSorcerer());
    const giant = putOnBattlefield(s, opp, { ...grizzlyBears(), oracleId: "test-big-bears", name: "Big Bears", toughness: "3" } as CardDef);
    s = settle(run(s, planActivate(s, ap, sorcerer, 0, [target(giant)])));
    expect(s.objects[giant]!.damage).toBe(1);
    // The Sorcerer is tapped; untap it so it can attack (as if by vigilance-like help).
    s.objects[sorcerer]!.tapped = false;
    s = attackWith(s, [sorcerer], opp);
    s = swordOn(s, ap, sword, sorcerer);
    moveObject(s, giant, "graveyard");
    expect(zone(s, giant)).toBe("exile");
  });

  it("only the targeted creature's damage counts: another source's lethal damage lets it regenerate and die normally", () => {
    let { s, ap, opp, sword, attacker } = board();
    const elves = putOnBattlefield(s, opp, llanowarElves());
    const pinger = putOnBattlefield(s, ap, prodigalSorcerer());
    s = attackWith(s, [attacker], opp);
    s = swordOn(s, ap, sword, attacker);
    s = settle(run(s, planActivate(s, ap, pinger, 0, [target(elves)])));
    expect(zone(s, elves)).toBe("graveyard");
  });

  it("damage from the targeted creature's ability as it leaves counts (CR 608.2h), and ~ is sacrificed as it leaves", () => {
    let { s, ap, opp, sword, attacker } = board(moggFanatic());
    const elves = putOnBattlefield(s, opp, llanowarElves());
    s = attackWith(s, [attacker], opp);
    s = swordOn(s, ap, sword, attacker);
    s = settle(run(s, planActivate(s, ap, attacker, 0, [target(elves)])));
    expect(zone(s, attacker)).toBe("graveyard");
    expect(zone(s, elves)).toBe("exile");
    expect(zone(s, sword)).toBe("graveyard");
  });

  it("is sacrificed when the creature leaves the battlefield this turn; what it damaged earlier is still exiled", () => {
    let { s, ap, opp, sword, attacker, unsummon } = board();
    s = attackWith(s, [attacker], opp);
    s = swordOn(s, ap, sword, attacker);
    expect(zone(s, sword)).toBe("battlefield");
    s = settle(run(s, planCast(s, ap, unsummon, [target(attacker)])));
    expect(zone(s, attacker)).toBe("hand");
    expect(zone(s, sword)).toBe("graveyard");
  });

  it("the marks last only this turn, and a new object of the same card doesn't carry them (CR 400.7)", () => {
    let { s, ap, opp, sword, attacker } = board();
    s = attackWith(s, [attacker], opp);
    s = swordOn(s, ap, sword, attacker);
    expect(s.turnLog?.runesword).toEqual([`${attacker}@${s.objects[attacker]!.zoneChanges ?? 0}`]);
    for (let i = 0; i < 400 && s.turn === s.turn && s.activePlayer === ap; i++) {
      if (s.pending) {
        for (const a of botActions(s, s.pending.player)) s = act(s, a);
        continue;
      }
      s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.turnLog?.runesword).toBeUndefined();
  });
});
