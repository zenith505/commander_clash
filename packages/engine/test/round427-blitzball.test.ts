// Round 427 (Lane A): Sidequest: Play Blitzball // World Champion, Celestial Weapon: "At the end of combat on your turn, if
// a player was dealt 6 or more combat damage this turn, transform this enchantment, then attach it to a creature you
// control." (an intervening "if", CR 603.4; the combat damage one player was dealt this turn in all, CR 510.4; transform
// CR 701.27; attached as it resolves, not targeted, CR 701.3a).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { characteristics, isFullySupported, waitingOn, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const blitzball = (): CardDef => ({"oracleId":"9c0255ff-6579-4ce4-810d-01df9922ab33","name":"Sidequest: Play Blitzball // World Champion, Celestial Weapon","manaCost":"{2}{R}","cmc":3,"typeLine":"Enchantment // Legendary Artifact — Equipment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of combat on your turn, target creature you control gets +2/+0 until end of turn.\nAt the end of combat on your turn, if a player was dealt 6 or more combat damage this turn, transform this enchantment, then attach it to a creature you control.","colors":["R"],"colorIdentity":["R"],"keywords":["Double Overdrive","Transform","Equip","Double"],"commanderLegal":"legal","layout":"transform","faces":[{"name":"Sidequest: Play Blitzball","manaCost":"{2}{R}","typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of combat on your turn, target creature you control gets +2/+0 until end of turn.\nAt the end of combat on your turn, if a player was dealt 6 or more combat damage this turn, transform this enchantment, then attach it to a creature you control.","colors":["R"]},{"name":"World Champion, Celestial Weapon","manaCost":"","typeLine":"Legendary Artifact — Equipment","supertypes":["Legendary"],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Double Overdrive — Equipped creature gets +2/+0 and has double strike.\nEquip {3} ({3}: Attach to target creature you control. Equip only as a sorcery.)","colors":["R"],"colorIndicator":["R"]}]} as unknown as CardDef);
const crawWurm = (): CardDef => ({"oracleId":"6a462a69-3e42-41de-a3aa-a488d9f38d69","name":"Craw Wurm","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Creature — Wurm","supertypes":[],"types":["Creature"],"subtypes":["Wurm"],"oracleText":"","power":"6","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","layout":"normal"} as unknown as CardDef);
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","layout":"normal"} as unknown as CardDef);
const swiftblade = (): CardDef => ({"oracleId":"377e4dad-866b-4e02-8c10-072bf7f000be","name":"Boros Swiftblade","manaCost":"{R}{W}","cmc":2,"typeLine":"Creature — Human Soldier","supertypes":[],"types":["Creature"],"subtypes":["Human","Soldier"],"oracleText":"Double strike","power":"1","toughness":"2","colors":["R","W"],"colorIdentity":["R","W"],"keywords":["Double strike"],"commanderLegal":"legal","layout":"normal"} as unknown as CardDef);

const nameOf = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!).name;

/**
 * Blitzball and `creatures` for the active player, on to their combat: the beginning of combat trigger's +2/+0 on
 * `pump`, then `attacks` (attacker index -> defending player), then on until the end of combat trigger has resolved, or
 * stops at its attach question (returned as `asked`).
 */
function combat(creatures: CardDef[], pump: number, attacks: (opps: PlayerId[]) => [number, PlayerId][]) {
  const { s: s0, ap } = setup([]);
  const b = putOnBattlefield(s0, ap, blitzball());
  const ids = creatures.map((c) => putOnBattlefield(s0, ap, c));
  const opps = s0.turnOrder.filter((p) => p !== ap);
  let s = s0;
  let declared = false;
  for (let i = 0; i < 400; i++) {
    const p = s.pending;
    if (p?.kind === "chooseTargets" && p.player === ap) s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: ids[pump]! }] });
    else if (p?.kind === "declareAttackers") {
      s = act(s, { type: "declareAttackers", player: ap, attacks: declared ? [] : attacks(opps).map(([i, d]) => ({ attacker: ids[i]!, defender: d })) });
      declared = true;
    } else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p?.kind === "chooseOption" && p.what === "enchant") return { s, ap, b, ids, asked: p };
    else if (p) throw new Error(`unexpected ${p.kind}`);
    else if (s.step === "main2" && declared) return { s, ap, b, ids, asked: undefined };
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  throw new Error("never got there");
}

describe("round 427: Blitzball compiles", () => {
  it("both faces", () => {
    expect(isFullySupported(blitzball())).toBe(true);
  });
});

describe("Sidequest: Play Blitzball", () => {
  it("6 combat damage to one player: it transforms, then is attached to the creature you choose", () => {
    const { s: s1, ap, b, ids, asked } = combat([crawWurm(), hillGiant()], 1, (o) => [[0, o[0]!]]);
    expect(asked).toBeDefined();
    expect(asked!.options.sort()).toEqual([...ids].sort());
    expect(nameOf(s1, b)).toBe("World Champion, Celestial Weapon");
    const s = act(s1, { type: "chooseOption", player: ap, choice: ids[1]! });
    expect(s.objects[b]!.attachedTo).toBe(ids[1]);
    const giant = characteristics(s, s.objects[ids[1]!]!);
    // +2/+0 from the beginning of combat trigger and +2/+0 from the Equipment.
    expect(giant.power).toBe(7);
    expect(giant.keywords).toContain("Double strike");
  });

  it("with one creature, it is attached to that one without asking", () => {
    const { s, b, ids, asked } = combat([crawWurm()], 0, (o) => [[0, o[0]!]]);
    expect(asked).toBeUndefined();
    expect(nameOf(s, b)).toBe("World Champion, Celestial Weapon");
    expect(s.objects[b]!.attachedTo).toBe(ids[0]);
  });

  it("5 combat damage: no trigger, it stays a Sidequest", () => {
    const { s, b, asked } = combat([hillGiant()], 0, (o) => [[0, o[0]!]]);
    expect(asked).toBeUndefined();
    expect(s.turnLog?.combatDamage).toBeDefined();
    expect(nameOf(s, b)).toBe("Sidequest: Play Blitzball");
    expect(s.objects[b]!.attachedTo).toBeUndefined();
  });

  it("combat damage to two players isn't added up across them (5 to one, 2 to another)", () => {
    // Hill Giant pumped to 5 at one opponent, Boros Swiftblade (1 double strike) at another: 5 and 2.
    const { s, b, asked } = combat([hillGiant(), swiftblade()], 0, (o) => [[0, o[0]!], [1, o[1]!]]);
    expect(asked).toBeUndefined();
    expect(nameOf(s, b)).toBe("Sidequest: Play Blitzball");
  });

  it("combat damage from several creatures and both combat damage steps adds up for one player", () => {
    // Boros Swiftblade pumped to 3 with double strike: 3 + 3 = 6, in two combat damage steps (CR 510.4).
    const { s, b, asked } = combat([swiftblade()], 0, (o) => [[0, o[0]!]]);
    expect(asked).toBeUndefined();
    expect(nameOf(s, b)).toBe("World Champion, Celestial Weapon");
  });
});
