// Round 312 (Lane A, skip-list cards): Tom, Bert, and William (back from the graveyard as an artifact only), Fang,
// Roku's Companion (back as a Spirit if it wasn't one), Honor the Past (a creature card back as an artifact), Sheltering
// Ancient (cumulative upkeep in +1/+1 counters on opponents' creatures), Estinien Varlineau (opponents dealt combat damage
// by it or a Dragon), Vulpine Harvester (the attacking Phyrexians' total power), Donna Noble (damage to it or its
// soulbond partner), Mistbind Clique (when a Faerie is championed) and Icingdeath, Frost Tyrant (a named legendary
// Equipment token with two quoted abilities).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { destroyPermanent } from "../src/game";
import { applyAction, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
const t = (id: string): TargetChoice => ({ kind: "object", id });
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
const ptOf = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
/** A copy of `def` in `pid`'s hand or graveyard. */
const inZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
const named = (s: GameState, name: string) => s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]?.name === name || characteristics(s, s.objects[id]!).name === name);

// Real oracle text (Scryfall).
const tom = (): CardDef => ({"oracleId":"0ea58cfe-b37c-49a6-a3be-7e60065b8238","name":"Tom, Bert, and William","manaCost":"{3}{B}{G}","cmc":5,"typeLine":"Legendary Creature — Troll","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Troll"],"oracleText":"{1}, Sacrifice another creature: Draw cards equal to the sacrificed creature's power, then discard a card.\nWhen Tom, Bert, and William die, if they were a creature, return them to the battlefield. They're an artifact. (They're no longer a creature.)","power":"5","toughness":"5","colors":["B","G"],"colorIdentity":["B","G"],"keywords":[],"layout":"normal"});
const fang = (): CardDef => ({"oracleId":"6665bfe2-942c-4b3d-a976-776fe00c99f4","name":"Fang, Roku's Companion","manaCost":"{3}{R}{R}","cmc":5,"typeLine":"Legendary Creature — Dragon","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying\nWhenever Fang attacks, another target legendary creature you control gets +X/+0 until end of turn, where X is Fang's power.\nWhen Fang dies, if he wasn't a Spirit, return this card to the battlefield under your control. He's a Spirit in addition to his other types.","power":"4","toughness":"4","colors":["R"],"colorIdentity":["R"],"keywords":["Flying"],"layout":"normal"});
const honor = (): CardDef => ({"oracleId":"43dc0473-4b80-4844-9ce5-dc29754756a3","name":"Honor the Past","manaCost":"{2}{W}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Return target creature card with mana value 6 or less from your graveyard to the battlefield. It's an artifact. (It's no longer a creature.)","colors":["W"],"colorIdentity":["W"],"keywords":[],"layout":"normal"});
const ancient = (): CardDef => ({"oracleId":"4554ce06-4992-4689-8a40-558a1545b968","name":"Sheltering Ancient","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Treefolk","supertypes":[],"types":["Creature"],"subtypes":["Treefolk"],"oracleText":"Trample\nCumulative upkeep—Put a +1/+1 counter on a creature an opponent controls. (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)","power":"5","toughness":"5","colors":["G"],"colorIdentity":["G"],"keywords":["Trample","Cumulative upkeep"],"layout":"normal"});
const estinien = (): CardDef => ({"oracleId":"29cf1dc2-3a6a-4a8b-8d61-4b6f0e74f271","name":"Estinien Varlineau","manaCost":"{2}{W}{B}","cmc":4,"typeLine":"Legendary Creature — Elf Warrior","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elf","Warrior"],"oracleText":"Whenever you cast a noncreature spell, put a +1/+1 counter on Estinien Varlineau. It gains flying until end of turn.\nAt the beginning of your second main phase, you draw X cards and lose X life, where X is the number of your opponents who were dealt combat damage by Estinien Varlineau or a Dragon this turn.","power":"3","toughness":"3","colors":["B","W"],"colorIdentity":["B","W"],"keywords":[],"layout":"normal"});
const harvester = (): CardDef => ({"oracleId":"cc5e3a21-4911-49f8-8e3c-ab23812c4004","name":"Vulpine Harvester","manaCost":"{3}{W}","cmc":4,"typeLine":"Creature — Phyrexian Fox","supertypes":[],"types":["Creature"],"subtypes":["Phyrexian","Fox"],"oracleText":"Whenever one or more Phyrexians you control attack, return target artifact card from your graveyard to the battlefield if its mana value is less than or equal to their total power.","power":"3","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":[],"layout":"normal"});
const donna = (): CardDef => ({"oracleId":"0d6e76aa-2966-48b7-be4e-2d3e2cc94fc1","name":"Donna Noble","manaCost":"{3}{R}","cmc":4,"typeLine":"Legendary Creature — Human","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human"],"oracleText":"Soulbond (You may pair this creature with another unpaired creature when either enters. They remain paired for as long as you control both of them.)\nWhenever Donna Noble or a creature it's paired with is dealt damage, Donna Noble deals that much damage to target opponent.\nDoctor's companion (You can have two commanders if the other is the Doctor.)","power":"2","toughness":"4","colors":["R"],"colorIdentity":["R"],"keywords":["Soulbond","Doctor's companion"],"layout":"normal"});
const clique = (): CardDef => ({"oracleId":"d1946f91-0653-4647-b3de-95d78b9597c4","name":"Mistbind Clique","manaCost":"{3}{U}","cmc":4,"typeLine":"Creature — Faerie Wizard","supertypes":[],"types":["Creature"],"subtypes":["Faerie","Wizard"],"oracleText":"Flash\nFlying\nChampion a Faerie (When this enters, sacrifice it unless you exile another Faerie you control. When this leaves the battlefield, that card returns to the battlefield.)\nWhen a Faerie is championed with this creature, tap all lands target player controls.","power":"4","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":["Flying","Champion","Flash"],"layout":"normal"});
const icingdeath = (): CardDef => ({"oracleId":"1dc2c213-72f6-4112-96a8-bf6ad553c707","name":"Icingdeath, Frost Tyrant","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Legendary Creature — Dragon","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying, vigilance\nWhen Icingdeath, Frost Tyrant dies, create Icingdeath, Frost Tongue, a legendary white Equipment artifact token with \"Equipped creature gets +2/+0,\" \"Whenever equipped creature attacks, tap target creature defending player controls,\" and equip {2}.","power":"4","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"layout":"normal"});

const shock = card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target." });
const relic = (mv: number) => card(`Test Relic ${mv}`, "Artifact", `{${mv}}`, { cmc: mv });

describe("round 312", () => {
  it("are fully supported", () => supported(tom(), fang(), honor(), ancient(), estinien(), harvester(), donna(), clique(), icingdeath()));
});

describe("round 312: Tom, Bert, and William", () => {
  it("dies and comes back as a legendary artifact with no creature types, its sacrifice ability still working; then it can't die again", () => {
    const { s: s0, ap } = setup([]);
    const trolls = putOnBattlefield(s0, ap, tom());
    destroyPermanent(s0, s0.objects[trolls]!, "test");
    let s = settle(s0);
    expect(zone(s, trolls)).toBe("battlefield");
    const c = characteristics(s, s.objects[trolls]!);
    expect(c.types).toEqual(["Artifact"]);
    expect(c.subtypes).toEqual([]);
    expect(c.supertypes).toContain("Legendary");
    expect(controllerOf(s, s.objects[trolls]!)).toBe(ap);
    // "{1}, Sacrifice another creature: Draw cards equal to the sacrificed creature's power, then discard a card."
    const big = putOnBattlefield(s, ap, bear({ name: "Test Big", power: "3", toughness: "3" }));
    const hand = s.players[ap]!.hand.length;
    s.players[ap]!.manaPool.C = 1;
    s = run(s, planActivate(s, ap, trolls, 0, [], undefined, undefined, undefined, { sacrifice: [big] }));
    s = settle(s, ap);
    if (s.pending?.kind === "discard") s = settle(act(s, { type: "discard", player: ap, objectIds: [s.players[ap]!.hand[0]!] }), ap);
    expect(zone(s, big)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 3 - 1);
    // An artifact isn't destroyed into "dying" (CR 700.4): it stays in the graveyard.
    destroyPermanent(s, s.objects[trolls]!, "test");
    s = settle(s);
    expect(zone(s, trolls)).toBe("graveyard");
  });
});

describe("round 312: Fang, Roku's Companion", () => {
  it("comes back a Dragon Spirit under the control of the trigger's controller, then doesn't come back again", () => {
    const { s: s0, ap, opp } = setup([]);
    // Ken's card, controlled by an opponent: it returns under that opponent's control ("under your control").
    const f = putOnBattlefield(s0, opp, fang());
    s0.objects[f]!.owner = ap;
    destroyPermanent(s0, s0.objects[f]!, "test");
    let s = settle(s0);
    expect(zone(s, f)).toBe("battlefield");
    expect(controllerOf(s, s.objects[f]!)).toBe(opp);
    expect([...characteristics(s, s.objects[f]!).subtypes].sort()).toEqual(["Dragon", "Spirit"]);
    expect(characteristics(s, s.objects[f]!).types).toEqual(["Creature"]);
    destroyPermanent(s, s.objects[f]!, "test");
    s = settle(s);
    expect(zone(s, f)).toBe("graveyard");
    expect(s.players[ap]!.graveyard).toContain(f);
  });
});

describe("round 312: Honor the Past", () => {
  it("returns a creature card with mana value 6 or less as an artifact, without its creature types", () => {
    const { s: s0, ap, ids } = setup([honor()]);
    const dead = inZone(s0, ap, bear({ name: "Test Dead Bear", cmc: 2 }), "graveyard");
    const huge = inZone(s0, ap, bear({ name: "Test Huge", cmc: 7, manaCost: "{6}{G}" }), "graveyard");
    expect(planCast(s0, ap, ids[0]!, [t(huge)])).toBeNull();
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [t(dead)])));
    expect(zone(s, dead)).toBe("battlefield");
    const c = characteristics(s, s.objects[dead]!);
    expect(c.types).toEqual(["Artifact"]);
    expect(c.subtypes).toEqual([]);
    expect(zone(s, huge)).toBe("graveyard");
  });
});

describe("round 312: Sheltering Ancient", () => {
  const toUpkeep = (s: GameState, ap: PlayerId) => {
    s = passUntil(s, "upkeep", ap);
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return s;
  };

  it("pays one +1/+1 counter for each age counter, on creatures of any opponents, the same one or different ones", () => {
    const { s: s0, ap, opp } = setup([]);
    const other = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    const tree = putOnBattlefield(s0, ap, ancient());
    s0.objects[tree]!.counters.age = 1;
    const a = putOnBattlefield(s0, opp, bear({ name: "Test Their Bear" }));
    const b = putOnBattlefield(s0, other, bear({ name: "Test Other Bear" }));
    let s = toUpkeep(s0, ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, keep: true });
    expect(s.pending?.kind === "chooseMay" && s.pending.prompt).toContain("2 +1/+1 counters");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "distribute", player: ap, total: 2 });
    expect(s.pending?.kind === "distribute" && [...s.pending.options].sort()).toEqual([a, b].sort());
    expect(() => act(s, { type: "distribute", player: ap, parts: { [a]: 1 } })).toThrow();
    s = settle(act(s, { type: "distribute", player: ap, parts: { [a]: 1, [b]: 1 } }), ap);
    expect(zone(s, tree)).toBe("battlefield");
    expect(s.objects[tree]!.counters.age).toBe(2);
    expect(s.objects[a]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
  });

  it("is sacrificed when no opponent controls a creature, and when its controller doesn't pay", () => {
    const { s: s0, ap, opp } = setup([]);
    const tree = putOnBattlefield(s0, ap, ancient());
    const mine = putOnBattlefield(s0, ap, bear({ name: "Test Mine" }));
    let s = settle(toUpkeep(s0, ap), ap);
    expect(zone(s, tree)).toBe("graveyard");
    expect(s.objects[mine]!.counters["+1/+1"] ?? 0).toBe(0);

    const { s: s1, ap: ap1 } = setup([]);
    const opp1 = s1.turnOrder[(s1.turnOrder.indexOf(ap1) + 1) % 4]!;
    const tree1 = putOnBattlefield(s1, ap1, ancient());
    const theirs = putOnBattlefield(s1, opp1, bear({ name: "Test Theirs" }));
    s = toUpkeep(s1, ap1);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap1 });
    s = settle(act(s, { type: "chooseMay", player: ap1, yes: false }), ap1);
    expect(zone(s, tree1)).toBe("graveyard");
    expect(s.objects[theirs]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(opp).toBeDefined();
  });

  it("a single opponent creature gets every counter with no picker; the bot keeps it while the cost is small", () => {
    const { s: s0, ap, opp } = setup([]);
    const tree = putOnBattlefield(s0, ap, ancient());
    const a = putOnBattlefield(s0, opp, bear({ name: "Test Their Bear" }));
    let s = toUpkeep(s0, ap);
    expect(botActions(s, ap)[0]).toMatchObject({ type: "chooseMay", yes: true });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(zone(s, tree)).toBe("battlefield");
    expect(s.objects[a]!.counters["+1/+1"]).toBe(1);
  });
});

describe("round 312: Estinien Varlineau", () => {
  it("draws and loses life for each opponent dealt combat damage by it or a Dragon, not by other creatures", () => {
    const { s: s0, ap } = setup([]);
    const [o1, o2, o3] = [1, 2, 3].map((k) => s0.turnOrder[(s0.turnOrder.indexOf(ap) + k) % 4]!);
    const est = putOnBattlefield(s0, ap, estinien());
    const dragon = putOnBattlefield(s0, ap, bear({ name: "Test Dragon", typeLine: "Creature — Dragon", subtypes: ["Dragon"] }));
    const plain = putOnBattlefield(s0, ap, bear({ name: "Test Plain" }));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: est, defender: o1! }, { attacker: dragon, defender: o2! }, { attacker: plain, defender: o3! }] });
    s = passUntil(s, "main2", ap);
    const hand = s.players[ap]!.hand.length;
    const life = s.players[ap]!.life;
    s = settle(s, ap);
    expect(s.players[o3!]!.life).toBe(38);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(s.players[ap]!.life).toBe(life - 2);
  });
});

describe("round 312: Vulpine Harvester", () => {
  const attackWith = (s0: GameState, ap: PlayerId, opp: PlayerId, attackers: string[], relicId: string) => {
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: attackers.map((attacker) => ({ attacker, defender: opp })) });
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = s.pending ? act(s, botActions(s, s.pending.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    return settle(act(s, { type: "chooseTargets", player: ap, targets: [t(relicId)] }), ap);
  };

  it("returns the artifact card if its mana value is at most the attacking Phyrexians' total power", () => {
    const { s: s0, ap, opp } = setup([]);
    const fox = putOnBattlefield(s0, ap, harvester());
    const phyrexian = putOnBattlefield(s0, ap, bear({ name: "Test Phyrexian", typeLine: "Creature — Phyrexian Bear", subtypes: ["Phyrexian", "Bear"] }));
    const five = inZone(s0, ap, relic(5), "graveyard");
    const s = attackWith(s0, ap, opp, [fox, phyrexian], five);
    expect(zone(s, five)).toBe("battlefield");
  });

  it("other attackers' power doesn't count, and a card with greater mana value stays", () => {
    const { s: s0, ap, opp } = setup([]);
    const fox = putOnBattlefield(s0, ap, harvester());
    const big = putOnBattlefield(s0, ap, bear({ name: "Test Big", power: "6", toughness: "6" }));
    const four = inZone(s0, ap, relic(4), "graveyard");
    const s = attackWith(s0, ap, opp, [fox, big], four);
    expect(zone(s, four)).toBe("graveyard");
  });
});

describe("round 312: Donna Noble", () => {
  it("damage to Donna or to its soulbond partner is dealt to a target opponent; an unpaired creature's isn't", () => {
    const { s: s0, ap, ids, opp } = setup([shock, shock, shock]);
    const d = putOnBattlefield(s0, ap, donna());
    const pal = putOnBattlefield(s0, ap, bear({ name: "Test Pal", power: "3", toughness: "3" }));
    const loner = putOnBattlefield(s0, ap, bear({ name: "Test Loner", power: "3", toughness: "3" }));
    s0.objects[d]!.paired = { id: pal, zc: 0, by: ap };
    s0.objects[pal]!.paired = { id: d, zc: 0, by: ap };
    const hit = (s: GameState, id: string, victim: string) => {
      s = settle(run(s, planCast(s, ap, id, [t(victim)])), ap);
      if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }), ap);
      return s;
    };
    let s = hit(s0, ids[0]!, pal);
    expect(s.players[opp]!.life).toBe(38);
    s = hit(s, ids[1]!, d);
    expect(s.players[opp]!.life).toBe(36);
    s = hit(s, ids[2]!, loner);
    expect(s.players[opp]!.life).toBe(36);
    expect(s.objects[loner]!.damage).toBe(2);
  });
});

describe("round 312: Mistbind Clique", () => {
  const faerie = () => card("Test Faerie", "Creature — Faerie", "{U}", { power: "1", toughness: "1" });

  it("championing a Faerie taps all lands the target player controls", () => {
    const { s: s0, ap, ids, opp } = setup([clique()]);
    const fae = putOnBattlefield(s0, ap, faerie());
    const lands = [0, 1, 2].map((i) => putOnBattlefield(s0, opp, card(`Test Land ${i}`, "Land")));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "champion" });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [fae] }), ap);
    expect(zone(s, fae)).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    // A bot taps an opponent's lands, not its own.
    const botPick = botActions(s, ap)[0];
    expect(botPick?.type === "chooseTargets" && botPick.targets[0]).toMatchObject({ kind: "player" });
    expect(botPick?.type === "chooseTargets" && botPick.targets[0]?.kind === "player" && botPick.targets[0].id).not.toBe(ap);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }), ap);
    for (const l of lands) expect(s.objects[l]!.tapped).toBe(true);
    expect(zone(s, ids[0]!)).toBe("battlefield");
  });

  it("no Faerie exiled: it's sacrificed and nothing is tapped", () => {
    const { s: s0, ap, ids, opp } = setup([clique()]);
    putOnBattlefield(s0, ap, faerie());
    const land = putOnBattlefield(s0, opp, card("Test Land", "Land"));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [] }), ap);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.objects[land]!.tapped).toBe(false);
  });
});

describe("round 312: Icingdeath, Frost Tyrant", () => {
  it("dies into Icingdeath, Frost Tongue: a legendary white Equipment giving +2/+0 and tapping a creature of the defending player", () => {
    const { s: s0, ap, opp } = setup([]);
    const dragon = putOnBattlefield(s0, ap, icingdeath());
    const knight = putOnBattlefield(s0, ap, bear({ name: "Test Knight" }));
    const guard = putOnBattlefield(s0, opp, bear({ name: "Test Guard" }));
    destroyPermanent(s0, s0.objects[dragon]!, "test");
    let s = settle(s0);
    const [tongue] = named(s, "Icingdeath, Frost Tongue");
    expect(tongue).toBeDefined();
    const c = characteristics(s, s.objects[tongue!]!);
    expect(c.name).toBe("Icingdeath, Frost Tongue");
    expect(c.supertypes).toContain("Legendary");
    expect(c.colors).toEqual(["W"]);
    expect(c.types).toEqual(["Artifact"]);
    expect(c.subtypes).toEqual(["Equipment"]);
    s.players[ap]!.manaPool.C = 2;
    s = settle(run(s, planActivate(s, ap, tongue!, 0, [t(knight)])), ap);
    expect(s.objects[tongue!]!.attachedTo).toBe(knight);
    expect(ptOf(s, knight)).toBe("4/2");
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: knight, defender: opp }] });
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets" && !s.objects[guard]!.tapped; i++) s = s.pending ? act(s, botActions(s, s.pending.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [t(guard)] });
    s = settle(s, ap);
    expect(s.objects[guard]!.tapped).toBe(true);
  });
});
