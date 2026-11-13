// Round 353 (Lane A): copies of a spell for other players, each deciding and copying in turn (Hive Mind, Curse of Echoes,
// Tempt with Mayhem), copies that gain wither (Spinerock Tyrant), and the next spell or ability with {X} copied (Magus
// Lucea Kane).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/**
 * Everyone passes until the stack is empty; copies keep their targets, "may copy" questions are answered by `copy` (by
 * player, yes if left out), other questions as the bots would. Stops at any other question of `me`'s.
 */
const settle = (s: GameState, me?: PlayerId, copy: Partial<Record<PlayerId, boolean>> = {}) => {
  for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "copyTargets") s = act(s, { type: "copyTargets", player: p.player, targets: p.current });
    else if (p?.kind === "chooseMay" && /^copy /.test(p.prompt)) s = act(s, { type: "chooseMay", player: p.player, yes: copy[p.player] ?? true });
    else if (p && p.player === me) return s;
    else if (p) s = act(s, botActions(s, p.player)[0]!);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const toHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
};
/** The players in turn order after `pid`. */
const after = (s: GameState, pid: PlayerId) => [1, 2, 3].map((k) => s.turnOrder[(s.turnOrder.indexOf(pid) + k) % 4]!);

// Real oracle text (Scryfall).
const magus = (): CardDef => ({"oracleId":"ae9f5c80-bc96-4ab3-bb5b-e8bd470e9eab","name":"Magus Lucea Kane","manaCost":"{1}{G}{U}{R}","cmc":4,"typeLine":"Legendary Creature — Human Tyranid Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Tyranid","Wizard"],"oracleText":"Spiritual Leader — At the beginning of combat on your turn, put a +1/+1 counter on target creature.\nPsychic Stimulus — {T}: Add {C}{C}. When you next cast a spell with {X} in its mana cost or activate an ability with {X} in its activation cost this turn, copy that spell or ability. You may choose new targets for the copy. (A copy of a permanent spell becomes a token.)","power":"1","toughness":"1","colors":["G","R","U"],"colorIdentity":["G","R","U"],"keywords":["Spiritual Leader","Psychic Stimulus"],"producedMana":["C"],"commanderLegal":"legal","set":"40k","releasedAt":"2022-10-07","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const tyrant = (): CardDef => ({"oracleId":"e35d4c62-5211-4785-b683-a83719195d87","name":"Spinerock Tyrant","manaCost":"{3}{R}{R}","cmc":5,"typeLine":"Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying\nWither (This deals damage to creatures in the form of -1/-1 counters.)\nWhenever you cast an instant or sorcery spell with a single target, you may copy it. If you do, those spells gain wither. You may choose new targets for the copy.","power":"6","toughness":"6","colors":["R"],"colorIdentity":["R"],"keywords":["Flying","Wither"],"commanderLegal":"legal","set":"ecl","releasedAt":"2026-01-23","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const hiveMind = (): CardDef => ({"oracleId":"f97e405d-4c24-4d4d-9e19-e349c073113c","name":"Hive Mind","manaCost":"{5}{U}","cmc":6,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a player casts an instant or sorcery spell, each other player copies that spell. Each of those players may choose new targets for their copy.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"sld","releasedAt":"2024-07-29","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const curse = (): CardDef => ({"oracleId":"c99bac4b-7eec-4fdf-b344-0cf9639ff073","name":"Curse of Echoes","manaCost":"{4}{U}","cmc":5,"typeLine":"Enchantment — Aura Curse","supertypes":[],"types":["Enchantment"],"subtypes":["Aura","Curse"],"oracleText":"Enchant player\nWhenever enchanted player casts an instant or sorcery spell, each other player may copy that spell and may choose new targets for the copy they control.","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant"],"commanderLegal":"legal","set":"dka","releasedAt":"2012-02-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const tempt = (): CardDef => ({"oracleId":"cbf64c58-664f-431f-987e-08ae70d23f2b","name":"Tempt with Mayhem","manaCost":"{1}{R}{R}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Tempting offer — Choose target instant or sorcery spell. Each opponent may copy that spell and may choose new targets for the copy they control. You copy that spell once plus an additional time for each opponent who copied the spell this way. You may choose new targets for the copies you control.","colors":["R"],"colorIdentity":["R"],"keywords":["Tempting offer"],"commanderLegal":"legal","set":"m3c","releasedAt":"2024-06-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const blaze = (): CardDef => ({"oracleId":"0596920f-9946-42f4-a03b-24aab67f9f1b","name":"Blaze","manaCost":"{X}{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Blaze deals X damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"p02","releasedAt":"1998-06-24","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const pinnacle = (): CardDef => ({"oracleId":"9ddc5a06-b4e1-459a-9e39-7cd1aa994fe1","name":"Helix Pinnacle","manaCost":"{G}","cmc":1,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Shroud (This enchantment can't be the target of spells or abilities.)\n{X}: Put X tower counters on this enchantment.\nAt the beginning of your upkeep, if there are 100 or more tower counters on this enchantment, you win the game.","colors":["G"],"colorIdentity":["G"],"keywords":["Shroud"],"commanderLegal":"legal","set":"spg","releasedAt":"2026-01-23","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const wurm = (): CardDef => ({"oracleId":"6a462a69-3e42-41de-a3aa-a488d9f38d69","name":"Craw Wurm","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Creature — Wurm","supertypes":[],"types":["Creature"],"subtypes":["Wurm"],"oracleText":"","power":"6","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

describe("round 353: compiles", () => {
  it("every card of the round", () => supported(hiveMind(), curse(), tempt(), tyrant(), magus()));
});

describe("Hive Mind", () => {
  it("each other player copies an instant or sorcery spell, in turn order from the active player, the last copy resolving first", () => {
    const { s: s0, ap, ids } = setup([divination()]);
    putOnBattlefield(s0, ap, hiveMind());
    const [b, c, d] = after(s0, ap);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    // Hive Mind's trigger, then the copies, before Divination resolves.
    for (let i = 0; i < 20 && !(s.stack.length === 4 && !s.triggerQueue.length && !s.pending); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.stack.map((x) => x.controller)).toEqual([ap, b, c, d]);
    expect(s.stack.slice(1).every((x) => x.copy)).toBe(true);
    const hands = s.turnOrder.map((p) => s.players[p]!.hand.length);
    s = settle(s);
    expect(s.turnOrder.map((p) => s.players[p]!.hand.length)).toEqual(hands.map((n) => n + 2));
  });

  it("it isn't optional and isn't about who controls it: the caster doesn't copy, Hive Mind's controller does", () => {
    const { s: s0, ap, ids } = setup([bolt()]);
    const [b, c, d] = after(s0, ap);
    putOnBattlefield(s0, b, hiveMind());
    const giant0 = putOnBattlefield(s0, d, giant());
    const life = s0.players[c]!.life;
    // The copies keep the target: Lightning Bolt four times at C.
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: c }])), undefined, { [b]: false, [c]: false, [d]: false });
    expect(s.players[c]!.life).toBe(life - 12);
    expect(s.objects[giant0]!.zone).toBe("battlefield");
  });

  it("a copy's controller may aim it elsewhere", () => {
    const { s: s0, ap, opp, ids } = setup([bolt()]);
    putOnBattlefield(s0, ap, hiveMind());
    const g = putOnBattlefield(s0, ap, giant());
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    for (let i = 0; i < 20 && s.pending?.kind !== "copyTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind === "copyTargets" && s.pending.player).toBe(opp);
    s = act(s, { type: "copyTargets", player: opp, targets: [{ kind: "object", id: g }] });
    s = settle(s);
    expect(s.objects[g]!.zone).toBe("graveyard");
  });
});

describe("Curse of Echoes", () => {
  it("when the enchanted player casts an instant, each other player may copy it, asked in turn order", () => {
    const { s: s0, ap, ids } = setup([bolt()]);
    const [b, c, d] = after(s0, ap);
    const cu = putOnBattlefield(s0, b, curse());
    s0.objects[cu]!.attachedToPlayer = ap;
    invalidateCharacteristics(s0);
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: d }]));
    const asked: PlayerId[] = [];
    for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "chooseMay") {
        asked.push(p.player);
        s = act(s, { type: "chooseMay", player: p.player, yes: p.player !== c });
      } else if (p?.kind === "copyTargets") s = act(s, { type: "copyTargets", player: p.player, targets: p.current });
      else if (p) s = act(s, botActions(s, p.player)[0]!);
      else if (s.stack.length === 3 && !s.triggerQueue.length) break;
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(asked).toEqual([b, c, d]);
    expect(s.stack.map((x) => x.controller)).toEqual([ap, b, d]);
    const life = s.players[d]!.life;
    s = settle(s);
    expect(s.players[d]!.life).toBe(life - 9);
  });

  it("the enchanted player's creature spells don't trigger it, nor another player's instants", () => {
    const { s: s0, ap, opp, ids } = setup([bears(), bolt()]);
    const cu = putOnBattlefield(s0, opp, curse());
    s0.objects[cu]!.attachedToPlayer = opp;
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.log.some((e) => /copies Lightning Bolt/.test(e.text))).toBe(false);
  });
});

describe("Tempt with Mayhem", () => {
  it("each opponent who copies the spell gives you another copy: two of three, so you copy it three times", () => {
    const { s: s0, ap, ids } = setup([bolt(), tempt()]);
    const [b, c, d] = after(s0, ap);
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: d }]));
    const boltItem = s.stack[s.stack.length - 1]!.id;
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: boltItem }]));
    const asked: PlayerId[] = [];
    const life = s.players[d]!.life;
    for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "chooseMay") {
        asked.push(p.player);
        s = act(s, { type: "chooseMay", player: p.player, yes: p.player !== c });
      } else if (p?.kind === "copyTargets") s = act(s, { type: "copyTargets", player: p.player, targets: p.current });
      else if (p) s = act(s, botActions(s, p.player)[0]!);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(asked).toEqual([b, c, d]);
    // B's and D's copies, then three of yours (put on the stack last, so resolving first), and the original: six
    // Lightning Bolts at D.
    const names = [b, d, ap, ap, ap].map((p) => s.players[p]!.name);
    expect(s.log.filter((e) => /copies Lightning Bolt/.test(e.text)).map((e) => e.text.split(" copies")[0])).toEqual(names);
    expect(s.players[d]!.life).toBe(life - 18);
  });

  it("with no opponent copying it, you copy it once; your copies are put on the stack last", () => {
    const { s: s0, ap, ids } = setup([bolt(), tempt()]);
    const d = after(s0, ap)[2]!;
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: d }]));
    const boltItem = s.stack[s.stack.length - 1]!.id;
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: boltItem }]));
    const life = s.players[d]!.life;
    s = settle(s, undefined, Object.fromEntries(after(s0, ap).map((p) => [p, false])));
    expect(s.log.filter((e) => /copies Lightning Bolt/.test(e.text)).map((e) => e.text)).toEqual([`${s.players[ap]!.name} copies Lightning Bolt targeting ${s.players[d]!.name}.`]);
    expect(s.players[d]!.life).toBe(life - 6);
  });
});

describe("Spinerock Tyrant", () => {
  it("an instant with a single target copied: both gain wither, dealing -1/-1 counters", () => {
    const { s: s0, ap, opp, ids } = setup([bolt()]);
    putOnBattlefield(s0, ap, tyrant());
    const w = putOnBattlefield(s0, opp, wurm());
    const g = putOnBattlefield(s0, opp, giant());
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: w }]));
    for (let i = 0; i < 20 && s.pending?.kind !== "copyTargets"; i++) s = s.pending?.kind === "chooseMay" ? act(s, { type: "chooseMay", player: ap, yes: true }) : act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "copyTargets", player: ap, targets: [{ kind: "object", id: g }] });
    s = settle(s);
    expect(s.objects[w]!.counters["-1/-1"]).toBe(3);
    expect(s.objects[w]!.damage).toBe(0);
    expect(s.objects[w]!.zone).toBe("battlefield");
    expect(s.objects[g]!.zone).toBe("graveyard");
  });

  it("not copied, the spell has no wither", () => {
    const { s: s0, ap, opp, ids } = setup([bolt()]);
    putOnBattlefield(s0, ap, tyrant());
    const w = putOnBattlefield(s0, opp, wurm());
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: w }]));
    s = settle(s, undefined, { [ap]: false });
    expect(s.objects[w]!.counters["-1/-1"] ?? 0).toBe(0);
    expect(s.objects[w]!.damage).toBe(3);
  });

  it("a spell with no target doesn't trigger it", () => {
    const { s: s0, ap, ids } = setup([divination()]);
    putOnBattlefield(s0, ap, tyrant());
    const s = run(s0, planCast(s0, ap, ids[0]!));
    expect(s.triggerQueue.length + s.stack.filter((x) => x.kind !== "spell").length).toBe(0);
  });
});

describe("Magus Lucea Kane", () => {
  it("its mana, then the next spell with {X} in its mana cost is copied with the same X", () => {
    const { s: s0, ap, opp, ids } = setup([bolt(), blaze()]);
    const m = putOnBattlefield(s0, ap, magus());
    let s = act(s0, { type: "activateMana", player: ap, objectId: m, mana: "C" });
    expect(s.players[ap]!.manaPool.C).toBe(2);
    expect(s.nextCast?.some((d) => d.xAbility)).toBe(true);
    // Lightning Bolt has no {X}: it isn't copied and doesn't use it up.
    let life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.nextCast?.some((d) => d.xAbility)).toBe(true);
    life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }], undefined, undefined, 4)));
    expect(s.players[opp]!.life).toBe(life - 8);
    expect(s.nextCast?.some((d) => d.xAbility) ?? false).toBe(false);
  });

  it("or the next activated ability with {X} in its activation cost, its X kept", () => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, magus());
    const h = putOnBattlefield(s0, ap, pinnacle());
    let s = act(s0, { type: "activateMana", player: ap, objectId: m, mana: "C" });
    s = settle(run(s, planActivate(s, ap, h, 0, undefined, undefined, undefined, 3)));
    expect(s.objects[h]!.counters.tower).toBe(6);
    expect(s.nextCast?.some((d) => d.xAbility) ?? false).toBe(false);
    s = settle(run(s, planActivate(s, ap, h, 0, undefined, undefined, undefined, 1)));
    expect(s.objects[h]!.counters.tower).toBe(7);
  });

  it("it lasts only this turn", () => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, magus());
    const s = act(s0, { type: "activateMana", player: ap, objectId: m, mana: "C" });
    const d = s.nextCast!.find((x) => x.xAbility)!;
    expect(d.turn).toBe(s.turn);
  });
});
