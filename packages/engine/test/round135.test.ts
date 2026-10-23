// Round 135: round 134's gaps (bots use Doubling Cube for abilities, {X} and hybrid costs, and Detection Tower for
// abilities), then the most played cards.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { createEmblem } from "../src/emblems";
import { botActions, characteristics, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Only these cards stay in `pid`'s hand; the others go to the bottom of the library. */
const onlyInHand = (s: GameState, pid: PlayerId, keep: string[]) => {
  const p = s.players[pid]!;
  for (const x of p.hand.filter((x) => !keep.includes(x))) {
    s.objects[x]!.zone = "library";
    p.library.push(x);
  }
  p.hand = p.hand.filter((x) => keep.includes(x));
};
const nextOf = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % 4]!;
const emptyPools = (s: GameState) => {
  for (const p of Object.values(s.players)) p.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
};
/** Everyone passes until the stack is empty or something asks a player to choose. */
const resolveAll = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

/** Everyone passes until something asks a player to choose (or the stack and trigger queue are empty). */
const passToPending = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** `attackers` attack `defender` unblocked; everyone passes until a choice is asked or combat is over. */
const attack = (s: GameState, ap: PlayerId, attackers: string[], defender: PlayerId) => {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: attackers.map((attacker) => ({ attacker, defender })) });
  for (let i = 0; i < 200 && !(s.pending && s.pending.kind !== "declareBlockers") && s.step !== "main2"; i++) {
    const pid = waitingOn(s)!;
    s = s.pending?.kind === "declareBlockers" ? act(s, { type: "declareBlockers", player: pid, blocks: [] }) : act(s, { type: "passPriority", player: pid });
  }
  return s;
};
const aura = card("Test Blessing", "Enchantment — Aura", "{W}", { oracleText: "Enchant creature\nEnchanted creature gets +1/+1." });

const cube = card("Doubling Cube", "Artifact", "{2}", { oracleText: "{3}, {T}: Double the amount of each type of unspent mana you have." });

describe("Doubling Cube: bots use it for abilities, hybrid and {X} costs too", () => {
  /** `hand` in hand and our 14 lands untapped, plus the Cube if asked. */
  const scene = (hand: CardDef[], withCube: boolean) => {
    const { s, ap, ids } = setup(hand);
    emptyPools(s);
    onlyInHand(s, ap, ids);
    s.players[ap]!.landsPlayedThisTurn = 1;
    // Not the commander: the spell or ability asked about is what the bot does.
    s.players[ap]!.command = [];
    const lands = s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Land"));
    const cubeId = withCube ? putOnBattlefield(s, ap, cube) : undefined;
    return { s, ap, ids, cubeId, lands };
  };
  const untapped = (s: GameState, lands: string[]) => lands.filter((id) => !s.objects[id]!.tapped).length;

  it("a hybrid cost of eight: the Cube saves land taps", () => {
    const giant = card("Test Hybrid Giant", "Creature — Giant", "{4}{G/W}{G/W}{G/W}{G/W}", { power: "8", toughness: "8" });
    const { s: s0, ap, ids, cubeId, lands } = scene([giant], true);
    const acts = botActions(s0, ap);
    expect(acts.some((a) => a.type === "activateMana" && a.objectId === cubeId)).toBe(true);
    const s = run(s0, acts);
    expect(s.stack.map((x) => x.objectId)).toContain(ids[0]);
    // Four lands and the Cube's three, where the lands alone take eight.
    expect(untapped(s, lands)).toBe(7);
  });

  it("an {X} spell keeps the X the lands alone would pay, with four lands left", () => {
    const blaze = card("Test Blaze", "Sorcery", "{X}{R}", { oracleText: "Test Blaze deals X damage to any target." });
    const xOf = (acts: Action[]) => acts.flatMap((a) => (a.type === "castSpell" ? [a.x] : []))[0];
    const without = scene([blaze], false);
    expect(xOf(botActions(without.s, without.ap))).toBe(13);
    const { s: s0, ap, ids, cubeId, lands } = scene([blaze], true);
    const acts = botActions(s0, ap);
    expect(acts.some((a) => a.type === "activateMana" && a.objectId === cubeId)).toBe(true);
    expect(xOf(acts)).toBe(13);
    const s = run(s0, acts);
    expect(s.stack.map((x) => x.objectId)).toContain(ids[0]);
    // Seven lands and the Cube's three: fourteen.
    expect(untapped(s, lands)).toBe(4);
  });

  it("an activated ability that costs eight, in the second main phase", () => {
    const engine = card("Test Engine", "Artifact", "{1}", { oracleText: "{8}, {T}: Draw three cards." });
    supported(engine);
    const { s: s0, ap, cubeId, lands } = scene([], true);
    const eng = putOnBattlefield(s0, ap, engine);
    s0.step = "main2";
    const acts = botActions(s0, ap);
    expect(acts.some((a) => a.type === "activateAbility" && a.objectId === eng)).toBe(true);
    expect(acts.some((a) => a.type === "activateMana" && a.objectId === cubeId)).toBe(true);
    const s = run(s0, acts);
    expect(s.stack.some((x) => x.sourceId === eng)).toBe(true);
    expect(untapped(s, lands)).toBe(7);
  });
});

describe("Detection Tower: bots activate it for an ability that would target what has hexproof", () => {
  const tower = card("Detection Tower", "Land", "", { oracleText: "{T}: Add {C}.\n{1}, {T}: Until end of turn, your opponents and creatures your opponents control with hexproof can be the targets of spells and abilities you control as though they didn't have hexproof." });
  const troll = card("Test Troll", "Creature — Troll", "{2}{G}", { power: "3", toughness: "3", keywords: ["Hexproof"], oracleText: "Hexproof" });
  const rod = card("Test Rod", "Artifact", "{1}", { oracleText: "{2}, {T}: Destroy target creature." });

  it("the Tower first, then the ability at the hexproof creature", () => {
    supported(tower, rod);
    const { s: s0, ap } = setup([]);
    emptyPools(s0);
    onlyInHand(s0, ap, []);
    s0.players[ap]!.landsPlayedThisTurn = 1;
    s0.players[ap]!.command = [];
    for (const id of s0.battlefield.filter((x) => s0.cards[s0.objects[x]!.cardId]!.types.includes("Creature"))) s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
    const t = putOnBattlefield(s0, nextOf(s0, ap), troll);
    const tw = putOnBattlefield(s0, ap, tower);
    const r = putOnBattlefield(s0, ap, rod);
    s0.step = "main2";
    const first = botActions(s0, ap);
    expect(first.some((a) => a.type === "activateAbility" && a.objectId === tw)).toBe(true);
    let s = resolveAll(run(s0, first));
    expect(s.turnRules?.some((x) => x.player === ap && x.rule === "seeHexproof")).toBe(true);
    const next = botActions(s, ap);
    const use = next.find((a) => a.type === "activateAbility");
    expect(use?.type === "activateAbility" && use.objectId === r && use.targets).toEqual([{ kind: "object", id: t }]);
    s = resolveAll(run(s, next));
    expect(s.battlefield).not.toContain(t);
  });
});

describe("Calix, Guided by Fate: a token copy of a nonlegendary enchantment, once each turn", () => {
  const calix = card("Calix, Guided by Fate", "Legendary Enchantment Creature — Human Druid", "{1}{G}{W}", {
    power: "2",
    toughness: "2",
    oracleText: "Constellation — Whenever Calix or another enchantment you control enters, put a +1/+1 counter on target creature.\nWhenever Calix or an enchanted creature you control deals combat damage to a player, you may create a token that's a copy of a nonlegendary enchantment you control. Do this only once each turn.",
  });
  const anthem = card("Test Anthem", "Enchantment", "{2}{W}", { oracleText: "Creatures you control get +0/+1." });
  const scene = () => {
    const { s, ap, opp } = setup([]);
    const c = putOnBattlefield(s, ap, calix);
    const b = putOnBattlefield(s, ap, bear());
    const a = putOnBattlefield(s, ap, aura);
    s.objects[a]!.attachedTo = b;
    const e = putOnBattlefield(s, ap, anthem);
    return { s, ap, opp, c, b, a, e };
  };
  const tokensOf = (s: GameState, name: string) => s.battlefield.filter((x) => s.objects[x]!.isToken && s.cards[s.objects[x]!.cardId]!.name === name);

  it("Calix and the enchanted Bears both connect: one copy, the second trigger does nothing", () => {
    supported(calix);
    const { s: s0, ap, opp, c, b, e } = scene();
    let s = attack(s0, ap, [c, b], opp);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = passToPending(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.pending?.kind).toBe("pickPermanents");
    const options = s.pending?.kind === "pickPermanents" ? s.pending.options : [];
    // The Aura and the Anthem are nonlegendary enchantments; Calix is legendary.
    expect([...options].sort()).toEqual([e, ...s.battlefield.filter((x) => s.cards[s.objects[x]!.cardId]!.name === "Test Blessing")].sort());
    expect(options).not.toContain(c);
    s = passToPending(act(s, { type: "pickPermanents", player: ap, ids: [e] }));
    // The token entering is an enchantment entering: Calix's constellation asks for a target.
    for (let i = 0; i < 6 && s.pending; i++) s = passToPending(run(s, botActions(s, ap)));
    expect(tokensOf(s, "Test Anthem")).toHaveLength(1);
    expect(s.pending).toBeFalsy();
    expect(tokensOf(s, "Test Anthem")).toHaveLength(1);
  });

  it("an unenchanted creature doesn't trigger it", () => {
    const { s: s0, ap, opp, a } = scene();
    s0.battlefield.splice(s0.battlefield.indexOf(a), 1);
    delete s0.objects[a];
    const other = putOnBattlefield(s0, ap, bear({ name: "Plain Bears" }));
    const s = attack(s0, ap, [other], opp);
    expect(s.pending).toBeFalsy();
  });

  it("declining leaves it free to trigger again (choosing to create is what counts)", () => {
    const { s: s0, ap, opp, c, b } = scene();
    let s = attack(s0, ap, [c, b], opp);
    s = passToPending(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
  });
});

describe("Ghyrson Starn: another source of yours dealing exactly 1 damage makes it deal 2 more there", () => {
  const ghyrson = card("Ghyrson Starn, Kelermorph", "Legendary Creature — Tyranid Human", "{1}{U}{R}", {
    power: "3",
    toughness: "2",
    keywords: ["Ward"],
    oracleText: "Ward {2} (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays {2}.)\nThree Autostubs — Whenever another source you control deals exactly 1 damage to a permanent or player, Ghyrson Starn deals 2 damage to that permanent or player.",
  });
  const pinger = card("Test Pinger", "Creature — Human Wizard", "{1}{R}", { power: "1", toughness: "1", oracleText: "{T}: Test Pinger deals 1 damage to any target." });
  const pulse = card("Test Pulse", "Instant", "{R}", { oracleText: "Test Pulse deals 1 damage to each opponent." });
  const shock = card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target." });
  const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3" });

  it("a ping at a 3/3: 1 then 2 more, and it dies; Ghyrson's own 2 doesn't trigger it again", () => {
    supported(ghyrson, pinger);
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, ghyrson);
    const p = putOnBattlefield(s0, ap, pinger);
    const o = putOnBattlefield(s0, opp, ogre);
    let s = passToPending(run(s0, planActivate(s0, ap, p, 0, [{ kind: "object", id: o }])));
    expect(s.objects[o]!.zone).toBe("graveyard");
    expect(s.stack).toHaveLength(0);
    expect(s.log.filter((l) => /Ghyrson Starn, Kelermorph deals 2 damage to Test Ogre/.test(l.text))).toHaveLength(1);
    // At a player: 3 in all.
    s = passToPending(run(s0, planActivate(s0, ap, p, 0, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(37);
  });

  it("1 damage to each opponent: it triggers once for each of them", () => {
    supported(pulse);
    const { s: s0, ap, ids } = setup([pulse]);
    putOnBattlefield(s0, ap, ghyrson);
    const s = passToPending(run(s0, planCast(s0, ap, ids[0]!)));
    for (const q of s.turnOrder.filter((x) => x !== ap)) expect(s.players[q]!.life).toBe(37);
    expect(s.players[ap]!.life).toBe(40);
  });

  it("2 damage isn't exactly 1; nor is an opponent's source", () => {
    const { s: s0, ap, opp, ids } = setup([shock]);
    putOnBattlefield(s0, ap, ghyrson);
    let s = passToPending(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(38);
    const theirs = putOnBattlefield(s, opp, pinger);
    s.activePlayer = opp;
    s.priority = opp;
    s = passToPending(run(s, planActivate(s, opp, theirs, 0, [{ kind: "player", id: ap }])));
    expect(s.players[ap]!.life).toBe(39);
  });
});

describe("Lux Artillery: artifact creature spells gain sunburst; 10 damage at thirty counters", () => {
  const lux = card("Lux Artillery", "Artifact", "{4}", {
    oracleText: "Whenever you cast an artifact creature spell, it gains sunburst. (It enters with a +1/+1 counter on it for each color of mana spent to cast it.)\nAt the beginning of your end step, if there are thirty or more counters among artifacts and creatures you control, this artifact deals 10 damage to each opponent.",
  });
  const golem = card("Test Golem", "Artifact Creature — Golem", "{5}", { power: "1", toughness: "1" });
  const sunGolem = card("Test Sun Golem", "Artifact Creature — Golem", "{4}", { power: "0", toughness: "0", keywords: ["Sunburst"], oracleText: "Sunburst (This enters with a +1/+1 counter on it for each color of mana spent to cast it.)" });
  const bearSpell = card("Test Bear Spell", "Creature — Bear", "{4}", { power: "2", toughness: "2" });

  it("an artifact creature cast with five colors enters with five +1/+1 counters", () => {
    supported(lux, sunGolem);
    const { s: s0, ap, ids } = setup([golem]);
    emptyPools(s0);
    putOnBattlefield(s0, ap, lux);
    const s = passToPending(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(5);
  });

  it("with sunburst of its own too, each instance puts its counters", () => {
    const { s: s0, ap, ids } = setup([sunGolem]);
    emptyPools(s0);
    putOnBattlefield(s0, ap, lux);
    const s = passToPending(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(8);
  });

  it("a creature that isn't an artifact doesn't gain it", () => {
    const { s: s0, ap, ids } = setup([bearSpell]);
    emptyPools(s0);
    putOnBattlefield(s0, ap, lux);
    const s = passToPending(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  const atEnd = (counters: number) => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, lux);
    const g = putOnBattlefield(s0, ap, golem);
    s0.objects[g]!.counters["+1/+1"] = counters - 2;
    const art = putOnBattlefield(s0, ap, card("Test Battery", "Artifact", "{1}"));
    s0.objects[art]!.counters.charge = 2;
    // Not counted: counters on a land.
    const land = s0.battlefield.find((x) => s0.objects[x]!.controller === ap && s0.cards[s0.objects[x]!.cardId]!.types.includes("Land"))!;
    s0.objects[land]!.counters.charge = 5;
    let s = passUntil(s0, "end", ap);
    s = passToPending(s);
    return { s, ap };
  };

  it("thirty counters among them at the end step: 10 damage to each opponent", () => {
    const { s, ap } = atEnd(30);
    for (const q of s.turnOrder.filter((x) => x !== ap)) expect(s.players[q]!.life).toBe(30);
  });

  it("twenty-nine (and five on a land): nothing", () => {
    const { s, ap } = atEnd(29);
    for (const q of s.turnOrder.filter((x) => x !== ap)) expect(s.players[q]!.life).toBe(40);
  });
});

describe("Shadow of the Second Sun: an additional beginning phase after each of enchanted player's postcombat main phases", () => {
  const shadow = card("Shadow of the Second Sun", "Enchantment — Aura", "{4}{U}{U}", {
    keywords: ["Enchant"],
    oracleText: "Enchant player\nAt the beginning of each of enchanted player's postcombat main phases, there is an additional beginning phase after this phase. (The end step happens after the added untap, upkeep, and draw steps.)",
  });

  it("the enchanted player untaps, has an upkeep and draws again, then goes to the end step", () => {
    supported(shadow);
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, shadow);
    s0.objects[a]!.attachedToPlayer = ap;
    const land = s0.battlefield.find((x) => s0.objects[x]!.controller === ap && s0.cards[s0.objects[x]!.cardId]!.types.includes("Land"))!;
    let s = passUntil(s0, "main2", ap);
    s.objects[land]!.tapped = true;
    const hand = s.players[ap]!.hand.length;
    s = passUntil(s, "draw", ap);
    expect(s.turn).toBe(s0.turn);
    expect(s.objects[land]!.tapped).toBe(false);
    s = passUntil(s, "end", ap);
    expect(s.turn).toBe(s0.turn);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.log.some((l) => /An additional beginning phase begins/.test(l.text))).toBe(true);
  });

  it("not on another player's turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, shadow);
    s0.objects[a]!.attachedToPlayer = ap;
    let s = passUntil(s0, "main2", opp);
    s = passUntil(s, "end", opp);
    // Only the one on its own turn, before this one.
    expect(s.log.filter((l) => /An additional beginning phase begins/.test(l.text))).toHaveLength(1);
  });

  it("a bot enchants itself with it (it helps the player it enchants)", () => {
    const { s: s0, ap, ids } = setup([shadow]);
    emptyPools(s0);
    onlyInHand(s0, ap, ids);
    s0.players[ap]!.command = [];
    const acts = botActions(s0, ap);
    const cast = acts.find((x) => x.type === "castSpell");
    expect(cast?.type === "castSpell" && cast.targets).toEqual([{ kind: "player", id: ap }]);
  });
});

describe("Bello, Bard of the Brambles: during your turn, big noncreature artifacts and enchantments are 4/4 Elementals", () => {
  const bello = card("Bello, Bard of the Brambles", "Legendary Creature — Raccoon Bard", "{1}{R}{G}", {
    power: "3",
    toughness: "3",
    oracleText: 'During your turn, each non-Equipment artifact and non-Aura enchantment you control with mana value 4 or greater is a 4/4 Elemental creature in addition to its other types and has indestructible, haste, and "Whenever this creature deals combat damage to a player, draw a card."',
  });
  const monolith = card("Test Monolith", "Artifact", "{4}", { oracleText: "" });
  const shrine = card("Test Shrine", "Enchantment", "{2}{G}{G}", { oracleText: "" });
  const small = card("Test Trinket", "Artifact", "{3}", { oracleText: "" });
  const sword = card("Test Greatsword", "Artifact — Equipment", "{4}", { oracleText: "Equipped creature gets +1/+1.\nEquip {2}" });
  const bigAura = card("Test Big Aura", "Enchantment — Aura", "{3}{W}", { keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature gets +1/+1." });
  const scene = () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, bello);
    const ids = { m: putOnBattlefield(s, ap, monolith, { sick: true }), e: putOnBattlefield(s, ap, shrine), t: putOnBattlefield(s, ap, small), w: putOnBattlefield(s, ap, sword) };
    const b = putOnBattlefield(s, ap, bear());
    const a = putOnBattlefield(s, ap, bigAura);
    s.objects[a]!.attachedTo = b;
    return { s, ap, opp, a, ...ids };
  };
  const isCreature = (s: GameState, id: string) => characteristics(s, s.objects[id]!).types.includes("Creature");

  it("on your turn: the artifact and the enchantment with mana value 4 are 4/4 Elementals with indestructible and haste", () => {
    supported(bello);
    const { s, m, e, t, w, a } = scene();
    for (const id of [m, e]) {
      expect(isCreature(s, id)).toBe(true);
      expect(pt(s, id)).toBe("4/4");
      expect(characteristics(s, s.objects[id]!).subtypes).toContain("Elemental");
      expect(objHasKeyword(s, s.objects[id]!, "Indestructible")).toBe(true);
      expect(objHasKeyword(s, s.objects[id]!, "Haste")).toBe(true);
    }
    // Mana value 3, an Equipment, an Aura: not.
    for (const id of [t, w, a]) expect(isCreature(s, id)).toBe(false);
  });

  it("not on an opponent's turn", () => {
    const { s: s0, opp, m, e } = scene();
    const s = passUntil(s0, "main1", opp);
    for (const id of [m, e]) expect(isCreature(s, id)).toBe(false);
  });

  it("the Monolith that came in this turn attacks (haste) and draws a card when it connects", () => {
    const { s: s0, ap, opp, m } = scene();
    const hand = s0.players[ap]!.hand.length;
    const s = passToPending(attack(s0, ap, [m], opp));
    expect(s.players[opp]!.life).toBe(36);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });
});

describe("Summon: Leviathan: until end of turn, whenever a Kraken, Leviathan, Merfolk, Octopus, or Serpent attacks, draw a card", () => {
  const leviathan = card("Summon: Leviathan", "Enchantment Creature — Saga Leviathan", "{4}{U}{U}", {
    power: "6",
    toughness: "6",
    keywords: ["Ward"],
    oracleText: "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Return each creature that isn't a Kraken, Leviathan, Merfolk, Octopus, or Serpent to its owner's hand.\nII, III — Until end of turn, whenever a Kraken, Leviathan, Merfolk, Octopus, or Serpent attacks, draw a card.\nWard {2}",
  });
  const merfolk = card("Test Merfolk", "Creature — Merfolk", "{U}", { power: "1", toughness: "1" });

  it("chapter II: the Leviathan and a Merfolk attack, two cards; a Bear attacking draws nothing", () => {
    supported(leviathan);
    const { s: s0, ap, opp } = setup([]);
    const l = putOnBattlefield(s0, ap, leviathan);
    s0.objects[l]!.counters.lore = 1;
    const mf = putOnBattlefield(s0, ap, merfolk);
    const b = putOnBattlefield(s0, ap, bear());
    let s = passUntil(s0, "main1", nextOf(s0, ap));
    s = passUntil(s, "main1", ap);
    s = passToPending(s);
    expect(s.objects[l]!.counters.lore).toBe(2);
    const hand = s.players[ap]!.hand.length;
    s = attack(s, ap, [l, mf, b], opp);
    s = passToPending(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });

  it("it lasts until end of turn: a Merfolk attacking on the next turn draws nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    const l = putOnBattlefield(s0, ap, leviathan);
    s0.objects[l]!.counters.lore = 1;
    const theirs = putOnBattlefield(s0, opp, merfolk);
    let s = passUntil(s0, "main1", nextOf(s0, ap));
    s = passUntil(s, "main1", ap);
    s = passToPending(s);
    expect(s.floatingTriggers?.length).toBe(1);
    // The next turn is the opponent's: the effect ended with this turn.
    s = passUntil(s, "main1", opp);
    expect(s.floatingTriggers?.length ?? 0).toBe(0);
    const hand = s.players[ap]!.hand.length;
    s = attack(s, opp, [theirs], ap);
    expect(s.players[ap]!.hand.length).toBe(hand);
  });
});

describe("The Masamune: first strike and must be blocked while attacking; dying creatures trigger its creature's and your emblems' abilities twice", () => {
  const masamune = card("The Masamune", "Legendary Artifact — Equipment", "{3}", {
    keywords: ["Equip"],
    oracleText: 'As long as equipped creature is attacking, it has first strike and must be blocked if able.\nEquipped creature has "If a creature dying causes a triggered ability of this creature or an emblem you own to trigger, that ability triggers an additional time."\nEquip {2}',
  });
  const mourner = card("Test Mourner", "Creature — Human", "{2}{B}", { power: "2", toughness: "2", oracleText: "Whenever another creature dies, you gain 1 life.\nWhen this creature dies, draw a card." });
  const plainMourner = card("Test Other Mourner", "Creature — Human", "{2}{B}", { power: "2", toughness: "2", oracleText: "Whenever another creature dies, you gain 1 life." });
  const kill = card("Test Kill", "Instant", "{B}", { oracleText: "Destroy target creature." });
  const scene = () => {
    const { s, ap, opp, ids } = setup([kill]);
    const m = putOnBattlefield(s, ap, mourner);
    const sword = putOnBattlefield(s, ap, masamune);
    s.objects[sword]!.attachedTo = m;
    const other = putOnBattlefield(s, ap, plainMourner);
    const victim = putOnBattlefield(s, opp, bear());
    return { s, ap, opp, m, sword, other, victim, killId: ids[0]! };
  };

  it("another creature dies: the equipped creature's trigger twice, the unequipped one's once", () => {
    supported(masamune);
    const { s: s0, ap, victim, killId } = scene();
    const life = s0.players[ap]!.life;
    const s = passToPending(run(s0, planCast(s0, ap, killId, [{ kind: "object", id: victim }])));
    expect(s.objects[victim]!.zone).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(life + 3);
  });

  it("the equipped creature itself dies: its own dies trigger twice", () => {
    const { s: s0, ap, m, killId } = scene();
    const hand = s0.players[ap]!.hand.length;
    const s = passToPending(run(s0, planCast(s0, ap, killId, [{ kind: "object", id: m }])));
    // Kill left the hand; two cards drawn.
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
  });

  it("an emblem you own: its dies trigger twice", () => {
    const { s: s0, ap, m, sword, victim, killId } = scene();
    // Only the emblem now: the equipped creature has no dies triggers of its own.
    s0.objects[sword]!.attachedTo = putOnBattlefield(s0, ap, bear({ name: "Test Bearer" }));
    s0.battlefield = s0.battlefield.filter((x) => x !== m && s0.cards[s0.objects[x]!.cardId]!.name !== "Test Other Mourner");
    createEmblem(s0, ap, ["Whenever a creature dies, you gain 1 life."], "Test");
    const life = s0.players[ap]!.life;
    const s = passToPending(run(s0, planCast(s0, ap, killId, [{ kind: "object", id: victim }])));
    expect(s.players[ap]!.life).toBe(life + 2);
  });

  it("while attacking it has first strike; not otherwise", () => {
    const { s: s0, ap, opp, m } = scene();
    expect(objHasKeyword(s0, s0.objects[m]!, "First strike")).toBe(false);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: m, defender: opp }] });
    expect(objHasKeyword(s, s.objects[m]!, "First strike")).toBe(true);
  });
});
