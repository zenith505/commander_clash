// Lane B round B141: "target ... of an opponent's choice" in spells and activated abilities (Evangelize, Preacher, Arena,
// Magus of the Arena, Cuombajj Witches, Diaochan, Echo Chamber, Volcanic Offering, Nova Pentacle). The controller chooses
// an opponent and that opponent chooses the target, as it's cast or activated (CR 601.2c, 602.2b; rulings).

import { describe, expect, it } from "vitest";
import { act, addEffect, bear, card, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const evangelize = card("Evangelize", "Sorcery", "{4}{W}", { keywords: ["Buyback"], oracleText: "Buyback {2}{W}{W} (You may pay an additional {2}{W}{W} as you cast this spell. If you do, put this card into your hand as it resolves.)\nGain control of target creature of an opponent's choice they control." });
const magus = card("Magus of the Arena", "Creature — Human Wizard", "{4}{R}{R}", { power: "5", toughness: "5", keywords: ["Fight"], oracleText: "{3}, {T}: Tap target creature you control and target creature of an opponent's choice they control. Those creatures fight each other. (Each deals damage equal to its power to the other.)" });
const arena = card("Arena", "Land", "", { keywords: ["Fight"], oracleText: "{3}, {T}: Tap target creature you control and target creature of an opponent's choice they control. Those creatures fight each other. (Each deals damage equal to its power to the other.)" });
const preacher = card("Preacher", "Creature — Human Cleric", "{1}{W}{W}", { power: "1", toughness: "1", oracleText: "You may choose not to untap this creature during your untap step.\n{T}: For as long as this creature remains tapped, gain control of target creature of an opponent's choice they control." });
const witches = card("Cuombajj Witches", "Creature — Human Wizard", "{B}{B}", { power: "1", toughness: "3", oracleText: "{T}: This creature deals 1 damage to any target and 1 damage to any target of an opponent's choice." });
const diaochan = card("Diaochan, Artful Beauty", "Legendary Creature — Human Advisor", "{3}{R}", { power: "1", toughness: "1", supertypes: ["Legendary"], oracleText: "{T}: Destroy target creature of your choice, then destroy target creature of an opponent's choice. Activate only during your turn, before attackers are declared." });
const echo = card("Echo Chamber", "Artifact", "{4}", { oracleText: "{4}, {T}: An opponent chooses target creature they control. Create a token that's a copy of that creature. That token gains haste until end of turn. Exile the token at the beginning of the next end step. Activate only as a sorcery." });
const offering = card("Volcanic Offering", "Instant", "{4}{R}", { oracleText: "Destroy target nonbasic land you don't control and target nonbasic land of an opponent's choice you don't control.\nVolcanic Offering deals 7 damage to target creature you don't control and 7 damage to target creature of an opponent's choice you don't control." });
const pentacle = card("Nova Pentacle", "Artifact", "{4}", { oracleText: "{3}, {T}: The next time a source of your choice would deal damage to you this turn, that damage is dealt to target creature of an opponent's choice instead." });

const giant = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });
const ogre = card("Gray Ogre", "Creature — Ogre", "{2}{R}", { power: "2", toughness: "2" });
const troll = card("Hexproof Troll", "Creature — Troll", "{2}{G}", { power: "4", toughness: "4", keywords: ["Hexproof"], oracleText: "Hexproof" });
const dual = card("Taiga", "Land — Mountain Forest", "", { oracleText: "({T}: Add {R} or {G}.)" });
const dual2 = card("Savannah", "Land — Forest Plains", "", { oracleText: "({T}: Add {G} or {W}.)" });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const NONE: TargetChoice = { kind: "none" };
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const opps = (s: GameState, ap: PlayerId) => s.turnOrder.filter((p) => p !== ap);
/** Everyone passes until the stack is empty; questions of the players in `me` stop it, others the bots answer. */
const settle = (s: GameState, opts: { me?: PlayerId[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me?.includes(p.player)) return s;
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Mana in `pid`'s pool. */
const pool = (s: GameState, pid: PlayerId, mana: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  for (const [k, n] of Object.entries(mana)) s.players[pid]!.manaPool[k as "W"] += n!;
};

describe("parsing", () => {
  it("all nine cards are supported", () => supported(evangelize, magus, arena, preacher, witches, diaochan, echo, offering, pentacle));
});

describe("Evangelize: gain control of target creature of an opponent's choice they control", () => {
  it("its caster chooses an opponent who has a creature, that opponent chooses one of theirs, and it's gained", () => {
    const { s: s0, ap, ids } = setup([evangelize]);
    const [b, c, d] = opps(s0, ap);
    const bGiant = putOnBattlefield(s0, b!, giant);
    const bOgre = putOnBattlefield(s0, b!, ogre);
    putOnBattlefield(s0, c!, giant);
    invalidateCharacteristics(s0);
    let s = run(s0, planCast(s0, ap, ids[0]!, [NONE]));
    // D has no creature, so isn't offered (choosing them would make it illegal to cast).
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "targetChooser", options: [String(b), String(c)] });
    expect(s.stack.length).toBe(0);
    expect(zone(s, ids[0]!)).toBe("hand");
    s = act(s, { type: "chooseOption", player: ap, choice: String(b) });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: b, controller: ap });
    // Only one of B's own: not C's creature.
    expect(() => act(s, { type: "chooseTargets", player: b!, targets: [tgt(s.battlefield.find((id) => controllerOf(s, s.objects[id]!) === c)!)] })).toThrow();
    s = act(s, { type: "chooseTargets", player: b!, targets: [tgt(bOgre)] });
    expect(s.pending).toBeNull();
    expect(s.stack.at(-1)?.targets).toMatchObject([tgt(bOgre)]);
    expect(zone(s, ids[0]!)).toBe("stack");
    s = settle(s);
    expect(controllerOf(s, s.objects[bOgre]!)).toBe(ap);
    expect(controllerOf(s, s.objects[bGiant]!)).toBe(b);
    void d;
  });
});

const cannon = card("Test Cannon", "Creature — Construct", "{5}", { power: "1", toughness: "1", oracleText: "{T}: This creature deals 5 damage to any target." });
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const resolve = (s: GameState) => {
  for (let i = 0; i < 40 && s.stack.length && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("Evangelize: who chooses, and what", () => {
  it("with one opponent who has a creature, that one chooses at once; its caster can't choose the target", () => {
    const { s: s0, ap, ids } = setup([evangelize]);
    const [b] = opps(s0, ap);
    const bOgre = putOnBattlefield(s0, b!, ogre);
    invalidateCharacteristics(s0);
    const plan = planCast(s0, ap, ids[0]!, [NONE])!;
    const castAct = plan.at(-1)!;
    expect(castAct.type).toBe("castSpell");
    // Naming the target itself: no.
    expect(() => run(s0, [...plan.slice(0, -1), { ...castAct, targets: [tgt(bOgre)] } as Action])).toThrow(/an opponent chooses/);
    const s = run(s0, plan);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: b, controller: ap });
    expect(s.log.map((l) => l.text)).toContain(`${s.players[ap]!.name} asks ${s.players[b!]!.name} to choose target creature they control for Evangelize.`);
  });

  it("can't be cast when no opponent controls a creature", () => {
    const { s: s0, ap, ids } = setup([evangelize]);
    expect(planCast(s0, ap, ids[0]!, [NONE])).toBeNull();
  });

  it("the opponent can't choose a hexproof creature of theirs: it's legal for the caster that counts (rulings)", () => {
    const { s: s0, ap, ids } = setup([evangelize]);
    const [b] = opps(s0, ap);
    const hex = putOnBattlefield(s0, b!, troll);
    const bOgre = putOnBattlefield(s0, b!, ogre);
    invalidateCharacteristics(s0);
    let s = run(s0, planCast(s0, ap, ids[0]!, [NONE]));
    expect(() => act(s, { type: "chooseTargets", player: b!, targets: [tgt(hex)] })).toThrow();
    s = act(s, { type: "chooseTargets", player: b!, targets: [tgt(bOgre)] });
    expect(s.stack.length).toBe(1);
  });

  it("doesn't resolve if the target is no longer controlled by the chosen opponent (rulings)", () => {
    const { s: s0, ap, ids } = setup([evangelize]);
    const [b, c] = opps(s0, ap);
    const bOgre = putOnBattlefield(s0, b!, ogre);
    invalidateCharacteristics(s0);
    let s = run(s0, planCast(s0, ap, ids[0]!, [NONE]));
    s = act(s, { type: "chooseTargets", player: b!, targets: [tgt(bOgre)] });
    // C takes it in response.
    addEffect(s, c!, [bOgre], [{ kind: "control" }], "game");
    expect(controllerOf(s, s.objects[bOgre]!)).toBe(c);
    s = settle(s);
    expect(controllerOf(s, s.objects[bOgre]!)).toBe(c);
  });

  it("buyback is still paid as it's cast, and the card returns to its owner's hand", () => {
    const { s: s0, ap, ids } = setup([evangelize]);
    const [b] = opps(s0, ap);
    const bOgre = putOnBattlefield(s0, b!, ogre);
    invalidateCharacteristics(s0);
    const plan = planCast(s0, ap, ids[0]!, [NONE], undefined, "auto", undefined, { buyback: true } as never);
    let s = run(s0, plan);
    s = act(s, { type: "chooseTargets", player: b!, targets: [tgt(bOgre)] });
    s = settle(s);
    expect(controllerOf(s, s.objects[bOgre]!)).toBe(ap);
    expect(zone(s, ids[0]!)).toBe("hand");
  });

  it("a bot chooses the least valuable creature it has", () => {
    const { s: s0, ap, ids } = setup([evangelize]);
    const [b] = opps(s0, ap);
    putOnBattlefield(s0, b!, giant);
    const bOgre = putOnBattlefield(s0, b!, ogre);
    invalidateCharacteristics(s0);
    let s = run(s0, planCast(s0, ap, ids[0]!, [NONE]));
    s = run(s, botActions(s, b!));
    expect(s.stack.at(-1)?.targets).toMatchObject([tgt(bOgre)]);
  });
});

describe("Magus of the Arena and Arena: tap and fight, the second creature an opponent's choice of theirs", () => {
  it("its controller chooses their own creature first, then the opponent chooses theirs; they fight", () => {
    const { s: s0, ap } = setup([]);
    const [b] = opps(s0, ap);
    const m = putOnBattlefield(s0, ap, magus);
    const bGiant = putOnBattlefield(s0, b!, giant);
    invalidateCharacteristics(s0);
    let s = run(s0, planActivate(s0, ap, m, 0, [tgt(m), NONE]));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: b, controller: ap });
    s = act(s, { type: "chooseTargets", player: b!, targets: [tgt(bGiant)] });
    expect(s.objects[m]!.tapped).toBe(true);
    s = settle(s);
    expect(zone(s, bGiant)).toBe("graveyard");
    expect(s.objects[m]!.damage).toBe(3);
  });

  it("Arena: the land's ability, the same way", () => {
    const { s: s0, ap } = setup([]);
    const [b] = opps(s0, ap);
    const a = putOnBattlefield(s0, ap, arena);
    const mine = putOnBattlefield(s0, ap, giant);
    const bOgre = putOnBattlefield(s0, b!, ogre);
    invalidateCharacteristics(s0);
    let s = run(s0, planActivate(s0, ap, a, 0, [tgt(mine), NONE]));
    s = act(s, { type: "chooseTargets", player: b!, targets: [tgt(bOgre)] });
    s = settle(s);
    expect(zone(s, bOgre)).toBe("graveyard");
    expect(s.objects[mine]!.tapped).toBe(true);
    expect(s.objects[mine]!.damage).toBe(2);
  });
});

describe("Cuombajj Witches: 1 damage to any target and 1 to any target of an opponent's choice", () => {
  it("the opponent may choose anything, the Witches themselves included (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const [b, c] = opps(s0, ap);
    const w = putOnBattlefield(s0, ap, witches);
    putOnBattlefield(s0, b!, ogre);
    invalidateCharacteristics(s0);
    const before = life(s0, c!);
    let s = run(s0, planActivate(s0, ap, w, 0, [{ kind: "player", id: c! }, NONE]));
    // Any opponent can choose it: the controller is asked which.
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "targetChooser" });
    s = act(s, { type: "chooseOption", player: ap, choice: String(b) });
    s = act(s, { type: "chooseTargets", player: b!, targets: [tgt(w)] });
    s = settle(s);
    expect(life(s, c!)).toBe(before - 1);
    expect(s.objects[w]!.damage).toBe(1);
  });
});

describe("Diaochan, Artful Beauty: destroy target creature of your choice, then one of an opponent's choice", () => {
  it("both are destroyed; a bot opponent picks the best creature that isn't its own", () => {
    const { s: s0, ap } = setup([]);
    const [b, c] = opps(s0, ap);
    const dc = putOnBattlefield(s0, ap, diaochan);
    const mine = putOnBattlefield(s0, ap, giant);
    const cOgre = putOnBattlefield(s0, c!, ogre);
    const bOgre = putOnBattlefield(s0, b!, ogre);
    invalidateCharacteristics(s0);
    let s = run(s0, planActivate(s0, ap, dc, 0, [tgt(cOgre), NONE]));
    s = act(s, { type: "chooseOption", player: ap, choice: String(b) });
    s = run(s, botActions(s, b!));
    expect(s.stack.at(-1)?.targets).toMatchObject([tgt(cOgre), tgt(mine)]);
    s = settle(s);
    expect(zone(s, cOgre)).toBe("graveyard");
    expect(zone(s, mine)).toBe("graveyard");
    expect(zone(s, bOgre)).toBe("battlefield");
  });
});

describe("Echo Chamber: an opponent chooses target creature they control; a token copy with haste", () => {
  it("a hasty token copy of the creature they chose, exiled at the beginning of the next end step", () => {
    const { s: s0, ap } = setup([]);
    const [b] = opps(s0, ap);
    const e = putOnBattlefield(s0, ap, echo);
    const bGiant = putOnBattlefield(s0, b!, giant);
    invalidateCharacteristics(s0);
    let s = run(s0, planActivate(s0, ap, e, 0, [NONE]));
    s = act(s, { type: "chooseTargets", player: b!, targets: [tgt(bGiant)] });
    s = settle(s);
    const tok = s.battlefield.find((id) => s.objects[id]!.isToken)!;
    expect(characteristics(s, s.objects[tok]!).name).toBe("Hill Giant");
    expect(controllerOf(s, s.objects[tok]!)).toBe(ap);
    expect(objHasKeyword(s, s.objects[tok]!, "Haste")).toBe(true);
    for (let i = 0; i < 200 && !(s.step === "end" && !s.stack.length && !s.triggerQueue.length); i++) {
      const p = s.pending;
      if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: p.player, attacks: [] });
      else if (p) s = run(s, botActions(s, p.player));
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[tok]).toBeUndefined();
  });

  it("only as a sorcery", () => {
    const { s: s0, ap } = setup([]);
    const [b] = opps(s0, ap);
    const e = putOnBattlefield(s0, ap, echo);
    putOnBattlefield(s0, b!, giant);
    invalidateCharacteristics(s0);
    s0.step = "upkeep";
    expect(planActivate(s0, ap, e, 0, [NONE])).toBeNull();
  });
});

describe("Volcanic Offering: two targets of an opponent's choice, each opponent chosen as it's cast", () => {
  it("each chosen opponent picks a land and a creature its caster doesn't control, possibly the same ones (rulings)", () => {
    const { s: s0, ap, ids } = setup([offering]);
    const [b, c] = opps(s0, ap);
    const bLand = putOnBattlefield(s0, b!, dual);
    const cLand = putOnBattlefield(s0, c!, dual2);
    const myLand = putOnBattlefield(s0, ap, dual);
    const bGiant = putOnBattlefield(s0, b!, giant);
    const cGiant = putOnBattlefield(s0, c!, giant);
    const mine = putOnBattlefield(s0, ap, ogre);
    invalidateCharacteristics(s0);
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(bLand), NONE, tgt(bGiant), NONE]));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "targetChooser", player: ap });
    s = act(s, { type: "chooseOption", player: ap, choice: String(c) });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: c });
    // Not a land its caster controls.
    expect(() => act(s, { type: "chooseTargets", player: c!, targets: [tgt(myLand)] })).toThrow();
    s = act(s, { type: "chooseTargets", player: c!, targets: [tgt(cLand)] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "targetChooser", player: ap });
    s = act(s, { type: "chooseOption", player: ap, choice: String(b) });
    expect(() => act(s, { type: "chooseTargets", player: b!, targets: [tgt(mine)] })).toThrow();
    // B chooses the Giant its caster already targeted: 14 damage to it.
    s = act(s, { type: "chooseTargets", player: b!, targets: [tgt(bGiant)] });
    expect(s.stack.at(-1)?.targets).toMatchObject([tgt(bLand), tgt(cLand), tgt(bGiant), tgt(bGiant)]);
    s = settle(s);
    expect(zone(s, bLand)).toBe("graveyard");
    expect(zone(s, cLand)).toBe("graveyard");
    expect(zone(s, bGiant)).toBe("graveyard");
    expect(zone(s, cGiant)).toBe("battlefield");
    expect(zone(s, myLand)).toBe("battlefield");
  });
});

describe("Nova Pentacle: that damage is dealt to target creature of an opponent's choice instead", () => {
  it("the opponent chooses any creature, the source is chosen as it resolves, and its next damage to you goes there", () => {
    const { s: s0, ap } = setup([]);
    const [b] = opps(s0, ap);
    const np = putOnBattlefield(s0, ap, pentacle);
    const gun = putOnBattlefield(s0, b!, cannon);
    const mine = putOnBattlefield(s0, ap, giant);
    const bGiant = putOnBattlefield(s0, b!, giant);
    invalidateCharacteristics(s0);
    let s = run(s0, planActivate(s0, ap, np, 0, [NONE]));
    // It doesn't have to be theirs (rulings): B picks ours.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "targetChooser" });
    s = act(s, { type: "chooseOption", player: ap, choice: String(b) });
    s = act(s, { type: "chooseTargets", player: b!, targets: [tgt(mine)] });
    s = resolve(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "damageSource", player: ap });
    const key = s.pending!.kind === "chooseOption" ? s.pending!.options.find((k) => k.startsWith(`${gun}@`))! : "";
    s = act(s, { type: "chooseOption", player: ap, choice: key });
    s = act(s, { type: "passPriority", player: ap });
    while (waitingOn(s) !== b) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const before = life(s, ap);
    s = resolve(run(s, planActivate(s, b!, gun, 0, [{ kind: "player", id: ap }])));
    expect(life(s, ap)).toBe(before);
    expect(zone(s, mine)).toBe("graveyard");
    expect(zone(s, bGiant)).toBe("battlefield");
  });
});

describe("Preacher: for as long as it remains tapped, gain control of target creature of an opponent's choice they control", () => {
  it("the creature an opponent chose is ours while Preacher stays tapped, and goes back when it untaps", () => {
    const { s: s0, ap } = setup([]);
    const [b] = opps(s0, ap);
    const pr = putOnBattlefield(s0, ap, preacher);
    const bGiant = putOnBattlefield(s0, b!, giant);
    invalidateCharacteristics(s0);
    let s = run(s0, planActivate(s0, ap, pr, 0, [NONE]));
    s = act(s, { type: "chooseTargets", player: b!, targets: [tgt(bGiant)] });
    s = settle(s);
    expect(controllerOf(s, s.objects[bGiant]!)).toBe(ap);
    // Still tapped as the turn goes on: still ours. Untapped: the effect ends (checked as the game goes on).
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(controllerOf(s, s.objects[bGiant]!)).toBe(ap);
    s.objects[pr]!.tapped = false;
    s.objects[pr]!.untaps = (s.objects[pr]!.untaps ?? 0) + 1;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(controllerOf(s, s.objects[bGiant]!)).toBe(b);
  });
});

describe("bots casting and activating them", () => {
  it("a bot casts Evangelize, asking the opponent whose least valuable creature is worth the most", () => {
    const { s: s0, ap, ids } = setup([evangelize]);
    const [b, c] = opps(s0, ap);
    putOnBattlefield(s0, b!, ogre);
    putOnBattlefield(s0, c!, giant);
    const cBig = putOnBattlefield(s0, c!, card("Craw Wurm", "Creature — Wurm", "{4}{G}{G}", { power: "6", toughness: "4" }));
    invalidateCharacteristics(s0);
    let s = s0;
    for (let i = 0; i < 30 && zone(s, ids[0]!) === "hand"; i++) s = run(s, botActions(s, waitingOn(s)!));
    expect(zone(s, ids[0]!)).not.toBe("hand");
    s = settle(s);
    // C's least valuable is the Giant, better than B's Ogre.
    const taken = s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === ap && characteristics(s, s.objects[id]!).types.includes("Creature"));
    expect(taken.map((id) => characteristics(s, s.objects[id]!).name)).toEqual(["Hill Giant"]);
    expect(controllerOf(s, s.objects[cBig]!)).toBe(c);
  });

  it("a bot doesn't activate Magus of the Arena or Diaochan, whose opponent-chosen target can hurt it", () => {
    const { s: s0, ap } = setup([]);
    const [b] = opps(s0, ap);
    const m = putOnBattlefield(s0, ap, magus);
    const dc = putOnBattlefield(s0, ap, diaochan);
    putOnBattlefield(s0, b!, ogre);
    invalidateCharacteristics(s0);
    const acts = botActions(s0, ap);
    expect(acts.some((a) => a.type === "activateAbility" && (a.objectId === m || a.objectId === dc))).toBe(false);
  });
});

describe("cast without paying its mana cost as an ability resolves", () => {
  it("cascade into Evangelize: the opponent chooses, then the cascade finishes resolving", () => {
    const cascader = card("Cascade Angel", "Creature — Angel", "{5}{W}{W}", { power: "4", toughness: "4", keywords: ["Cascade"], oracleText: "Cascade (When you cast this spell, exile cards from the top of your library until you exile a nonland card that costs less. You may cast it without paying its mana cost. Put the exiled cards on the bottom in a random order.)" });
    const { s: s0, ap, ids } = setup([cascader]);
    const [b] = opps(s0, ap);
    const bOgre = putOnBattlefield(s0, b!, ogre);
    const ev = putOnBattlefield(s0, ap, evangelize);
    s0.battlefield.splice(s0.battlefield.indexOf(ev), 1);
    s0.objects[ev]!.zone = "library";
    s0.players[ap]!.library.unshift(ev);
    invalidateCharacteristics(s0);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 20 && s.pending?.kind !== "castFree" && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: ev });
    s = act(s, { type: "castSpell", player: ap, objectId: ev, targets: [NONE] });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: b, controller: ap });
    s = act(s, { type: "chooseTargets", player: b!, targets: [tgt(bOgre)] });
    expect(s.pending).toBeNull();
    expect(s.stack.at(-1)).toMatchObject({ kind: "spell", objectId: ev });
    s = settle(s);
    expect(controllerOf(s, s.objects[bOgre]!)).toBe(ap);
    expect(zone(s, ids[0]!)).toBe("battlefield");
  });
});
