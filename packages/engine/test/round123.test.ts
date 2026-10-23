// Round 123: round 122's gaps (the order of two redirections of the same damage, Sheoldred's "nontoken creature or
// planeswalker", protection from a mana value), then the most played cards.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, scry, setup } from "./helpers";
import { botActions, castProblem, moveObject, planActivate, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState } from "../src";
import { characteristics, invalidateCharacteristics } from "../src/layers";
import { defOf, power, toughness } from "../src/cards";
import { manaAbilitiesOn } from "../src/manaabilities";
import { abilityProblem } from "../src/game";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState, yes = true) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes });
    else if (p) s = botActions(s, p.player).reduce((x, a) => act(x, a), s);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Pass priority until something waits on a choice or the stack is empty. */
const untilChoice = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Answer a damage shield question with the option whose label contains `text`. */
const answerShield = (s: GameState, text: string) => {
  const p = s.pending;
  if (p?.kind !== "chooseOption" || p.what !== "damageShield") throw new Error(`no shield question: ${JSON.stringify(p)}`);
  const i = p.labels!.findIndex((l) => l.includes(text));
  if (i < 0) throw new Error(`no "${text}" in ${p.labels!.join(" | ")}`);
  return act(s, { type: "chooseOption", player: p.player, choice: p.options[i]! });
};

// Real oracle text (Scryfall).
const bolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });
const pariah = card("Pariah", "Enchantment — Aura", "{2}{W}", { oracleText: "Enchant creature\nAll damage that would be dealt to you is dealt to enchanted creature instead." });
const giant = card("Palisade Giant", "Creature — Giant Soldier", "{4}{W}{W}", { power: "2", toughness: "7", oracleText: "All damage that would be dealt to you and other permanents you control is dealt to this creature instead." });

describe("two redirections of the same damage: the player being dealt it chooses which applies (CR 616.1)", () => {
  const scene = () => {
    const { s: s0, ap, ids, opp } = setup([bolt]);
    const b = putOnBattlefield(s0, opp, bear());
    const p = putOnBattlefield(s0, opp, pariah);
    s0.objects[p]!.attachedTo = b;
    const g = putOnBattlefield(s0, opp, giant);
    invalidateCharacteristics(s0);
    const s = untilChoice(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    return { s, opp, b, g };
  };

  it("Lightning Bolt at a player with Pariah and Palisade Giant: they're asked, and the Giant takes it", () => {
    const { s: s0, opp, b, g } = scene();
    expect(s0.pending).toMatchObject({ kind: "chooseOption", what: "damageShield", player: opp, source: "Lightning Bolt" });
    const s = settle(answerShield(s0, "Palisade Giant instead"));
    expect(s.objects[g]!.damage).toBe(3);
    expect(s.objects[b]!.damage).toBe(0);
    expect(s.players[opp]!.life).toBe(40);
  });

  it("choosing Pariah: the enchanted creature is dealt it, and the Giant doesn't take it from there (rulings)", () => {
    const { s: s0, opp, b, g } = scene();
    const s = settle(answerShield(s0, "Grizzly Bears instead"));
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[g]!.damage).toBe(0);
    expect(s.players[opp]!.life).toBe(40);
  });

  it("two Palisade Giants: the damage is dealt to either one, as its player chooses (rulings on Palisade Giant)", () => {
    supported(pariah, giant);
    const { s: s0, ap, ids, opp } = setup([bolt]);
    const g1 = putOnBattlefield(s0, opp, giant);
    const g2 = putOnBattlefield(s0, opp, { ...giant, oracleId: `${giant.oracleId}-2` });
    invalidateCharacteristics(s0);
    let s = untilChoice(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    const p = s.pending;
    if (p?.kind !== "chooseOption") throw new Error("no question");
    s = settle(act(s, { type: "chooseOption", player: opp, choice: p.options[1]! }));
    expect([s.objects[g1]!.damage, s.objects[g2]!.damage].sort()).toEqual([0, 3]);
    expect(s.players[opp]!.life).toBe(40);
  });

  it("a bot answers the question itself", () => {
    const { s: s0, opp } = scene();
    const s = settle(s0);
    expect(s.players[opp]!.life).toBe(40);
    expect(s.pending).toBeNull();
  });
});

const sheoldred = scry("transform", [
  { name: "Sheoldred", mana_cost: "{3}{B}{B}", type_line: "Legendary Creature — Phyrexian Praetor", power: "4", toughness: "5", oracle_text: "Menace\nWhen Sheoldred enters, each opponent sacrifices a nontoken creature or planeswalker of their choice.\n{4}{B}: Exile Sheoldred, then return it to the battlefield transformed under its owner's control. Activate only as a sorcery and only if an opponent has eight or more cards in their graveyard." },
  { name: "The True Scriptures", type_line: "Enchantment — Saga", oracle_text: "(As this Saga enters and after your draw step, add a lore counter.)\nI — For each opponent, destroy up to one target creature or planeswalker that player controls.\nII — Each opponent discards three cards, then mills three cards.\nIII — Put all creature cards from all graveyards onto the battlefield under your control. Exile this Saga, then return it to the battlefield (front face up)." },
], { keywords: ["Transform", "Menace", "Mill"] });

describe("Sheoldred // The True Scriptures", () => {
  it("each opponent sacrifices a nontoken creature or planeswalker: \"nontoken\" is for both (CR 205.4e); tokens stay", () => {
    supported(sheoldred);
    const { s: s0, ap } = setup([]);
    const [a, b] = s0.turnOrder.filter((p) => p !== ap);
    const tokenA = putOnBattlefield(s0, a!, bear({ name: "Test Token" }));
    s0.objects[tokenA]!.isToken = true;
    const realA = putOnBattlefield(s0, a!, bear());
    const tokenB = putOnBattlefield(s0, b!, bear({ name: "Test Token B" }));
    s0.objects[tokenB]!.isToken = true;
    const sh = putOnBattlefield(s0, ap, sheoldred);
    s0.battlefield.splice(s0.battlefield.indexOf(sh), 1);
    s0.objects[sh]!.zone = "hand";
    s0.players[ap]!.hand.push(sh);
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planCast(s0, ap, sh)));
    expect(s.objects[sh]!.zone).toBe("battlefield");
    expect(s.objects[realA]!.zone).toBe("graveyard");
    expect(s.objects[tokenA]?.zone).toBe("battlefield");
    expect(s.objects[tokenB]?.zone).toBe("battlefield");
  });
});

const titan = card("Reaver Titan", "Artifact — Vehicle", "{7}", { power: "10", toughness: "10", keywords: ["Gatling Blaster", "Void Shields", "Protection", "Crew"], oracleText: "Void Shields — Protection from mana value 3 or less\nGatling Blaster — Whenever this Vehicle attacks, it deals 5 damage to each opponent.\nCrew 4 (Tap any number of creatures you control with total power 4 or more: This Vehicle becomes an artifact creature until end of turn.)" });
const skulk = card("Mistmeadow Skulk", "Creature — Kithkin Rogue", "{1}{W}", { power: "1", toughness: "1", keywords: ["Lifelink", "Protection"], oracleText: "Lifelink, protection from mana value 3 or greater" });
const lightUp = card("Test X Burn", "Sorcery", "{X}{R}", { oracleText: "Test X Burn deals X damage to target creature." });
const flametongue = card("Test Three Drop", "Creature — Elemental", "{2}{R}", { power: "3", toughness: "1" });

/** The Vehicle is an artifact creature until end of turn, as crewing makes it (CR 702.122a). */
const crewed = (s: GameState, id: string) => {
  s.effects.push({ id: `crewed-${id}`, timestamp: s.nextTimestamp++, controller: s.objects[id]!.controller, sourceName: "test", duration: "endOfTurn", affected: [id], mods: [{ kind: "addTypes", types: ["Creature"], subtypes: [] }] });
  invalidateCharacteristics(s);
};

describe("protection from a mana value (CR 702.16a)", () => {
  it("Reaver Titan: Lightning Bolt can't target it; an X spell can when its mana value with X is 4 or more (rulings)", () => {
    supported(titan, skulk);
    const { s: s0, ap, ids } = setup([bolt, lightUp]);
    const t = putOnBattlefield(s0, ap, titan);
    crewed(s0, t);
    expect(castProblem(s0, ap, ids[0]!, [{ kind: "object", id: t }])).toBeTruthy();
    expect(planCast(s0, ap, ids[1]!, [{ kind: "object", id: t }], undefined, "auto", 2)).toBeNull();
    const s = settle(run(s0, planCast(s0, ap, ids[1]!, [{ kind: "object", id: t }], undefined, "auto", 3)));
    expect(s.objects[t]!.damage).toBe(3);
  });

  it("Reaver Titan, crewed and attacking, can't be blocked by a 3-mana creature; a 4-mana one can", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, ap, titan);
    crewed(s0, t);
    const three = putOnBattlefield(s0, opp, flametongue);
    const four = putOnBattlefield(s0, opp, card("Test Four Drop", "Creature — Giant", "{3}{R}", { power: "4", toughness: "4" }));
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: t, defender: opp }] });
    s = untilChoice(s);
    s = passUntil(s, "declareBlockers");
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: three, attacker: t }] })).toThrow(/protection/);
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: four, attacker: t }] })).not.toThrow();
  });

  it("Mistmeadow Skulk: blocking a 3-mana creature, its damage is prevented; Lightning Bolt's isn't", () => {
    const { s: s0, ap, ids, opp } = setup([bolt]);
    const att = putOnBattlefield(s0, ap, flametongue);
    const sk = putOnBattlefield(s0, opp, { ...skulk, toughness: "5" });
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: att, defender: opp }] });
    s = passUntil(s, "declareBlockers");
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: sk, attacker: att }] });
    s = passUntil(s, "endCombat");
    expect(s.objects[sk]!.damage).toBe(0);
    expect(s.objects[att]!.zone).toBe("graveyard");
    s = passUntil(s, "main2");
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: sk }])));
    expect(s.objects[sk]!.damage).toBe(3);
  });
});

const wyll = card("Wyll's Reversal", "Instant", "{2}{R}", { oracleText: "Choose target spell or ability with one or more targets. Roll a d20 and add the greatest power among creatures you control.\n1—14 | You may choose new targets for that spell or ability.\n15+ | You may choose new targets for that spell or ability. Then copy it. You may choose new targets for the copy." });
const giantPower = card("Test Colossus", "Creature — Giant", "{8}", { power: "20", toughness: "20" });
const spellOnStack = (s: GameState, name: string) => ({ kind: "stack" as const, id: s.stack.find((x) => x.description.startsWith(name))!.id });

describe("Wyll's Reversal", () => {
  it("15+: new targets for the spell, then a copy with new targets of its own", () => {
    supported(wyll);
    const { s: s0, ap, ids, opp } = setup([bolt, wyll]);
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    putOnBattlefield(s0, ap, giantPower);
    invalidateCharacteristics(s0);
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: mine }]));
    // A spell with no targets can't be chosen.
    s = run(s, planCast(s, ap, ids[1]!, [spellOnStack(s, "Lightning Bolt")]));
    s = untilChoice(s);
    expect(s.pending).toMatchObject({ kind: "newTargets", player: ap, source: "Wyll's Reversal" });
    s = act(s, { type: "newTargets", player: ap, targets: [{ kind: "object", id: theirs }] });
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: ap });
    s = settle(act(s, { type: "copyTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.objects[mine]!.zone).toBe("battlefield");
    expect(s.players[opp]!.life).toBe(37);
  });

  it("1—14: only new targets, no copy; a spell without targets can't be chosen", () => {
    const counsel = card("Test Draw", "Sorcery", "{U}", { oracleText: "Draw a card." });
    for (let seed = 1; seed < 40; seed++) {
      const { s: s0, ap, ids, opp } = setup([bolt, wyll, counsel], seed);
      const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear", power: "0" }));
      const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
      let s = run(s0, planCast(s0, ap, ids[2]!));
      expect(castProblem(s, ap, ids[1]!, [spellOnStack(s, "Test Draw")])).toBeTruthy();
      s = settle(s);
      s = run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: mine }]));
      s = untilChoice(run(s, planCast(s, ap, ids[1]!, [spellOnStack(s, "Lightning Bolt")])));
      if (s.resolving!.rolled!.result > 14) continue;
      s = act(s, { type: "newTargets", player: ap, targets: [{ kind: "object", id: theirs }] });
      expect(s.pending?.kind).not.toBe("copyTargets");
      s = settle(s);
      expect(s.objects[theirs]!.zone).toBe("graveyard");
      expect(s.players[opp]!.life).toBe(40);
      return;
    }
    throw new Error("no low roll in 40 seeds");
  });
});

const hero = card("Hero of Bladehold", "Creature — Human Knight", "{2}{W}{W}", { power: "3", toughness: "4", keywords: ["Battle cry"], oracleText: "Battle cry (Whenever this creature attacks, each other attacking creature gets +1/+0 until end of turn.)\nWhenever this creature attacks, create two 1/1 white Soldier creature tokens that are tapped and attacking." });

describe("tokens entering attacking: \"All attack\" answers for every token at once (CR 508.4)", () => {
  it("Hero of Bladehold: the first question offers \"All 2 attack\" each choice; one answer sends both", () => {
    const { s: s0, ap } = setup([]);
    const h = putOnBattlefield(s0, ap, hero);
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    const opp = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: h, defender: opp }] });
    s = untilChoice(s);
    const p = s.pending;
    if (p?.kind !== "chooseOption" || p.what !== "attackWhom") throw new Error(`no attack question: ${JSON.stringify(p)}`);
    const i = p.labels!.indexOf(`All 2 attack ${s.players[third]!.name}`);
    expect(i).toBeGreaterThan(-1);
    s = act(s, { type: "chooseOption", player: ap, choice: p.options[i]! });
    expect(s.pending?.kind === "chooseOption" && s.pending.what === "attackWhom").toBe(false);
    s = settle(s);
    const tokens = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Soldier Token");
    expect(tokens.map((id) => s.objects[id]!.attacking)).toEqual([third, third]);
  });

  it("the last token's question has no \"All\" option", () => {
    const { s: s0, ap } = setup([]);
    const h = putOnBattlefield(s0, ap, hero);
    const opp = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: h, defender: opp }] });
    s = untilChoice(s);
    s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
    const p = s.pending;
    if (p?.kind !== "chooseOption") throw new Error("no second question");
    expect(p.labels!.some((l) => l.startsWith("All"))).toBe(false);
  });
});

const oni = card("Silent-Blade Oni", "Creature — Demon Ninja", "{3}{U}{U}{B}{B}", { power: "6", toughness: "5", keywords: ["Ninjutsu"], oracleText: "Ninjutsu {4}{U}{B} ({4}{U}{B}, Return an unblocked attacker you control to hand: Put this card onto the battlefield from your hand tapped and attacking.)\nWhenever this creature deals combat damage to a player, look at that player's hand. You may cast a spell from among those cards without paying its mana cost." });
const mindclaw = card("Mindclaw Shaman", "Creature — Viashino Shaman", "{4}{R}", { power: "2", toughness: "2", oracleText: "When this creature enters, target opponent reveals their hand. You may cast an instant or sorcery spell from among those cards without paying its mana cost." });

describe("casting a spell from another player's hand (Silent-Blade Oni, Mindclaw Shaman)", () => {
  it("Silent-Blade Oni: you cast their Lightning Bolt free, from their hand, as your spell; lands aren't offered", () => {
    supported(oni, mindclaw);
    const { s: s0, ap, opp } = setup([]);
    const o = putOnBattlefield(s0, ap, oni);
    for (const id of [...s0.players[opp]!.hand]) {
      s0.objects[id]!.zone = "library";
      s0.players[opp]!.library.push(id);
    }
    s0.players[opp]!.hand = [];
    const [theirBolt, theirLand] = [bolt, card("Forest", "Basic Land — Forest")].map((d) => {
      const id = putOnBattlefield(s0, opp, d);
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      s0.objects[id]!.zone = "hand";
      s0.players[opp]!.hand.push(id);
      return id;
    }) as [string, string];
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: o, defender: opp }] });
    s = passUntil(s, "combatDamage");
    s = untilChoice(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong", player: ap, options: [theirBolt, "none"] });
    expect(theirLand).toBeTruthy();
    s = act(s, { type: "chooseOption", player: ap, choice: theirBolt });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: theirBolt });
    s = run(s, planCast(s, ap, theirBolt, [{ kind: "player", id: opp }]));
    expect(s.stack.find((x) => x.objectId === theirBolt)?.controller).toBe(ap);
    s = settle(s);
    expect(s.players[opp]!.life).toBe(40 - 6 - 3);
    // An instant cast this way goes to its owner's graveyard (rulings).
    expect(s.players[opp]!.graveyard).toContain(theirBolt);
  });

  it("Mindclaw Shaman offers only instants and sorceries", () => {
    const { s: s0, ap, ids, opp } = setup([mindclaw]);
    const theirs = [bolt, bear()].map((d) => {
      const id = putOnBattlefield(s0, opp, d);
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      s0.objects[id]!.zone = "hand";
      s0.players[opp]!.hand.push(id);
      return id;
    });
    invalidateCharacteristics(s0);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 20 && !(s.pending?.kind === "chooseOption"); i++)
      s = s.pending?.kind === "chooseTargets" ? act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }) : act(s, { type: "passPriority", player: waitingOn(s)! });
    const p = s.pending;
    if (p?.kind !== "chooseOption") throw new Error("no pick");
    expect(p.options).toContain(theirs[0]);
    expect(p.options).not.toContain(theirs[1]);
  });
});

const toph = card("Toph, Hardheaded Teacher", "Legendary Creature — Human Warrior Ally", "{2}{R}{G}", { power: "3", toughness: "4", keywords: ["Earthbend"], oracleText: "When Toph enters, you may discard a card. If you do, return target instant or sorcery card from your graveyard to your hand.\nWhenever you cast a spell, earthbend 1. If that spell is a Lesson, put an additional +1/+1 counter on that land. (Target land you control becomes a 0/0 creature with haste that's still a land. Put a +1/+1 counter on it. When it dies or is exiled, return it to the battlefield tapped.)" });
const lesson = card("Test Lesson", "Sorcery — Lesson", "{1}", { oracleText: "Draw a card." });
const plain = card("Test Sorcery", "Sorcery", "{1}", { oracleText: "Draw a card." });

describe("Toph, Hardheaded Teacher", () => {
  for (const [spell, n] of [[lesson, 2], [plain, 1]] as const)
    it(`casting ${spell.name}: earthbend 1${n === 2 ? ", and an additional +1/+1 counter on that land for a Lesson" : " only"}`, () => {
      supported(toph);
      const { s: s0, ap, ids } = setup([spell]);
      putOnBattlefield(s0, ap, toph);
      invalidateCharacteristics(s0);
      const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
      const lands = s.battlefield.filter((id) => s.objects[id]!.counters["+1/+1"]);
      expect(lands).toHaveLength(1);
      expect(s.objects[lands[0]!]!.counters["+1/+1"]).toBe(n);
    });
});

const duplicant = card("Duplicant", "Artifact Creature — Shapeshifter", "{6}", { power: "2", toughness: "4", oracleText: "Imprint — When this creature enters, you may exile target nontoken creature.\nAs long as a card exiled with this creature is a creature card, this creature has the power, toughness, and creature types of the last creature card exiled with it. It's still a Shapeshifter." });
const wurm = card("Craw Wurm", "Creature — Wurm", "{4}{G}{G}", { power: "6", toughness: "4" });
const crusader = card("Crusader of Odric", "Creature — Human Soldier", "{2}{W}", { power: "*", toughness: "*", oracleText: "Crusader of Odric's power and toughness are each equal to the number of creatures you control." });

describe("Duplicant", () => {
  const imprint = (victim: CardDef, extra = 0) => {
    supported(duplicant, crusader);
    const { s: s0, ap, ids, opp } = setup([duplicant]);
    const v = putOnBattlefield(s0, opp, victim);
    for (let i = 0; i < extra; i++) putOnBattlefield(s0, opp, bear());
    invalidateCharacteristics(s0);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 30 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: v }] });
      else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: true });
      else if (p) throw new Error(JSON.stringify(p));
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[v]!.zone).toBe("exile");
    return { s, d: ids[0]!, opp };
  };

  it("exiling Craw Wurm: a 6/4 Wurm Shapeshifter; a +1/+1 counter still counts (rulings)", () => {
    const { s, d } = imprint(wurm);
    expect([power(s, s.objects[d]!), toughness(s, s.objects[d]!)]).toEqual([6, 4]);
    expect(characteristics(s, s.objects[d]!).subtypes.sort()).toEqual(["Shapeshifter", "Wurm"]);
    s.objects[d]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s);
    expect([power(s, s.objects[d]!), toughness(s, s.objects[d]!)]).toEqual([7, 5]);
  });

  it("exiling Crusader of Odric: its */* ability works in exile, counting its owner's creatures (rulings)", () => {
    const { s, d, opp } = imprint(crusader, 2);
    expect([power(s, s.objects[d]!), toughness(s, s.objects[d]!)]).toEqual([2, 2]);
    expect(characteristics(s, s.objects[d]!).subtypes.sort()).toEqual(["Human", "Shapeshifter", "Soldier"]);
    putOnBattlefield(s, opp, bear());
    invalidateCharacteristics(s);
    expect([power(s, s.objects[d]!), toughness(s, s.objects[d]!)]).toEqual([3, 3]);
  });

  it("once the card leaves exile, it's a 2/4 Shapeshifter again", () => {
    const { s, d } = imprint(wurm);
    const card = Object.values(s.objects).find((o) => o.zone === "exile")!;
    card.zone = "graveyard";
    card.zoneChanges = (card.zoneChanges ?? 0) + 1;
    invalidateCharacteristics(s);
    expect([power(s, s.objects[d]!), toughness(s, s.objects[d]!)]).toEqual([2, 4]);
    expect(characteristics(s, s.objects[d]!).subtypes).toEqual(["Shapeshifter"]);
  });
});

const effigy = card("Machine God's Effigy", "Artifact", "{4}", { oracleText: "You may have this artifact enter as a copy of any creature on the battlefield, except it's an artifact and it has \"{T}: Add {U}.\" (It's not a creature.)\n{T}: Add {U}." });
const elves = card("Llanowar Elves", "Creature — Elf Druid", "{G}", { power: "1", toughness: "1", oracleText: "{T}: Add {G}." });
const treasureCreature = card("Test Treasure Golem", "Legendary Artifact Creature — Treasure Golem", "{3}", { power: "3", toughness: "3" });

describe("Machine God's Effigy", () => {
  const enter = (victim: CardDef) => {
    supported(effigy);
    const { s: s0, ap, ids, opp } = setup([effigy]);
    const v = putOnBattlefield(s0, opp, victim);
    invalidateCharacteristics(s0);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 40 && !(s.pending?.kind === "chooseOption" && s.pending.what === "copy"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "copy" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: v }));
    return { s, e: s.objects[ids[0]!]! };
  };

  it("copying Llanowar Elves: an artifact named Llanowar Elves, not a creature or an Elf, with both mana abilities (rulings)", () => {
    const { s, e } = enter(elves);
    const c = characteristics(s, e);
    expect(c.name).toBe("Llanowar Elves");
    expect(c.types).toEqual(["Artifact"]);
    expect(c.subtypes).toEqual([]);
    expect(manaAbilitiesOn(s, e).map((m) => m.produces)).toEqual([{ kind: "fixed", mana: ["G"] }, { kind: "fixed", mana: ["U"] }]);
  });

  it("it keeps supertypes and artifact subtypes: a legendary Treasure artifact, no Golem (rulings)", () => {
    const { s, e } = enter(treasureCreature);
    const c = characteristics(s, e);
    expect(c.types).toEqual(["Artifact"]);
    expect(c.supertypes).toEqual(["Legendary"]);
    expect(c.subtypes).toEqual(["Treasure"]);
  });
});

const zellix = card("Zellix, Sanity Flayer", "Legendary Creature — Horror", "{2}{U}", { power: "2", toughness: "3", oracleText: "Hive Mind — Whenever a player mills one or more creature cards, you create a 1/1 black Horror creature token.\n{1}, {T}: Target player mills three cards.\nChoose a Background (You can have a Background as a second commander.)" });
const eachMills = card("Test Mill", "Sorcery", "{1}", { oracleText: "Each player mills three cards." });

describe("Zellix, Sanity Flayer", () => {
  it("each player mills three: one Horror for each player who milled a creature card; lands only, none (CR 701.17a)", () => {
    supported(zellix);
    const { s: s0, ap, ids } = setup([eachMills]);
    putOnBattlefield(s0, ap, zellix);
    // Creature cards on top for two players, lands for the other two.
    const isCreature = (id: string) => defOf(s0, s0.objects[id]!).types.includes("Creature");
    s0.players.forEach((p, i) => {
      const pick = p.library.filter((id) => isCreature(id) === i < 2).slice(0, 3);
      p.library = [...pick, ...p.library.filter((id) => !pick.includes(id))];
    });
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const horrors = s.battlefield.filter((id) => s.objects[id]!.isToken && defOf(s, s.objects[id]!).name === "Horror Token");
    expect(horrors).toHaveLength(2);
  });
});

const lich = card("Underrealm Lich", "Creature — Zombie Elf Shaman", "{3}{B}{G}", { power: "4", toughness: "3", oracleText: "If you would draw a card, instead look at the top three cards of your library, then put one into your hand and the rest into your graveyard.\nPay 4 life: This creature gains indestructible until end of turn. Tap it." });
const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });
const dredger = card("Darkblast", "Instant", "{B}", { oracleText: "Target creature gets -1/-1 until end of turn.\nDredge 3 (If you would draw a card, you may mill 3 cards instead. If you do, return this card from your graveyard to your hand.)" });

describe("Underrealm Lich", () => {
  const cast = (spell: CardDef, prep?: (s: GameState, ap: number) => void) => {
    supported(lich, dredger);
    const { s: s0, ap, ids } = setup([spell]);
    putOnBattlefield(s0, ap, lich);
    prep?.(s0, ap);
    invalidateCharacteristics(s0);
    return { s: untilChoice(run(s0, planCast(s0, ap, ids[0]!))), ap };
  };

  it("drawing two: each draw is three cards looked at, one kept, two binned, one at a time (rulings)", () => {
    let { s, ap } = cast(divination);
    const p = () => s.players.find((x) => x.id === ap)!;
    const hand = p().hand.length;
    const yard = p().graveyard.length;
    for (let k = 0; k < 2; k++) {
      const pend = s.pending;
      if (pend?.kind !== "drawLook" || !pend.keep) throw new Error(JSON.stringify(pend));
      expect(pend.cards).toEqual(p().library.slice(0, 3));
      s = act(s, { type: "drawLook", player: ap, objectId: pend.cards[1] });
      expect(p().hand).toContain(pend.cards[1]);
      expect(p().graveyard).toEqual(expect.arrayContaining([pend.cards[0], pend.cards[2]]));
    }
    s = settle(s);
    expect(p().hand.length).toBe(hand + 2);
    expect(p().graveyard.length).toBe(yard + 4 + 1); // and Divination
  });

  it("an empty library: nothing happens, and no loss for drawing from it (rulings)", () => {
    let { s, ap } = cast(divination, (s0, pid) => {
      const p = s0.players.find((x) => x.id === pid)!;
      for (const id of [...p.library]) moveObject(s0, id, "exile");
    });
    s = settle(s);
    expect(s.players.find((x) => x.id === ap)!.lost).toBeFalsy();
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players.find((x) => x.id === ap)!.lost).toBeFalsy();
  });

  it("with a dredge card in the graveyard, the player may dredge instead (CR 616.1)", () => {
    let dark = "";
    let { s, ap } = cast(divination, (s0, pid) => {
      dark = putOnBattlefield(s0, pid, dredger);
      s0.battlefield.splice(s0.battlefield.indexOf(dark), 1);
      s0.objects[dark]!.zone = "graveyard";
      s0.players.find((x) => x.id === pid)!.graveyard.push(dark);
    });
    const pend = s.pending;
    if (pend?.kind !== "drawLook" || !pend.keep) throw new Error(JSON.stringify(pend));
    expect(pend.instead?.dredge).toEqual([dark]);
    s = act(s, { type: "drawLook", player: ap, instead: { dredge: dark } });
    expect(s.objects[dark]!.zone).toBe("hand");
    // The second draw is the Lich's look again.
    expect(s.pending).toMatchObject({ kind: "drawLook", keep: true });
  });

  it("a bot keeps one and goes on", () => {
    let { s, ap } = cast(divination);
    const hand = s.players.find((x) => x.id === ap)!.hand.length;
    for (let i = 0; i < 4 && s.pending; i++) s = botActions(s, ap).reduce((x, a) => act(x, a), s);
    s = settle(s);
    expect(s.players.find((x) => x.id === ap)!.hand.length).toBe(hand + 2);
  });
});

const tiamat = card("Tiamat", "Legendary Creature — Dragon God", "{2}{W}{U}{B}{R}{G}", { power: "7", toughness: "7", keywords: ["Flying"], oracleText: "Flying\nWhen Tiamat enters, if you cast it, search your library for up to five Dragon cards not named Tiamat that each have different names, reveal them, put them into your hand, then shuffle." });

describe("Tiamat", () => {
  it("finds up to five Dragons, no Tiamat, no two with the same name", () => {
    supported(tiamat);
    const { s: s0, ap, ids } = setup([tiamat]);
    const p = s0.players.find((x) => x.id === ap)!;
    const dragons = [tiamat, ...["Shivan Dragon", "Shivan Dragon", "Dragon A", "Dragon B", "Dragon C", "Dragon D", "Dragon E"].map((n) => card(n, "Creature — Dragon", "{4}{R}{R}", { power: "5", toughness: "5" }))];
    for (const d of dragons) {
      const id = putOnBattlefield(s0, ap, d);
      moveObject(s0, id, "library");
    }
    const sp = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const found = sp.players.find((x) => x.id === ap)!.hand.filter((id) => !p.hand.includes(id)).map((id) => defOf(sp, sp.objects[id]!).name);
    expect(found).toHaveLength(5);
    expect(found).not.toContain("Tiamat");
    expect(new Set(found).size).toBe(5);
  });
});

const doppelgang = card("Doppelgang", "Sorcery", "{X}{X}{X}{G}{U}", { oracleText: "For each of X target permanents, create X tokens that are copies of that permanent." });

describe("Doppelgang", () => {
  it("X=2: two copies of each of the two targets", () => {
    supported(doppelgang);
    const { s: s0, ap, ids, opp } = setup([doppelgang]);
    const a = putOnBattlefield(s0, opp, wurm);
    const b = putOnBattlefield(s0, ap, elves);
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: a }, { kind: "object", id: b }], undefined, "auto", 2)));
    const tokens = s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap).map((id) => defOf(s, s.objects[id]!).name).sort();
    expect(tokens).toEqual(["Craw Wurm", "Craw Wurm", "Llanowar Elves", "Llanowar Elves"]);
  });
});

const yenna = card("Yenna, Redtooth Regent", "Legendary Creature — Elf Noble", "{2}{G}{W}", { power: "4", toughness: "4", oracleText: "{2}, {T}: Choose target enchantment you control that doesn't have the same name as another permanent you control. Create a token that's a copy of it, except it isn't legendary. If the token is an Aura, untap Yenna, then scry 2. Activate only as a sorcery." });
const anthem = card("Glorious Anthem", "Enchantment", "{1}{W}{W}", { oracleText: "Creatures you control get +1/+1." });
const rancor = card("Rancor", "Enchantment — Aura", "{G}", { oracleText: "Enchant creature\nEnchanted creature gets +2/+0 and has trample.\nWhen Rancor is put into a graveyard from the battlefield, return Rancor to its owner's hand." });

describe("Yenna, Redtooth Regent", () => {
  const scene = () => {
    supported(yenna, rancor);
    const { s, ap } = setup([]);
    const y = putOnBattlefield(s, ap, yenna);
    const g = putOnBattlefield(s, ap, anthem);
    const b = putOnBattlefield(s, ap, bear());
    const r = putOnBattlefield(s, ap, rancor);
    s.objects[r]!.attachedTo = b;
    invalidateCharacteristics(s);
    return { s, ap, y, g, r, b };
  };

  it("copies a nonlegendary token of Glorious Anthem; Yenna stays tapped", () => {
    const { s: s0, ap, y, g } = scene();
    const s = settle(run(s0, planActivate(s0, ap, y, 0, [{ kind: "object", id: g }])));
    expect(s.battlefield.filter((id) => defOf(s, s.objects[id]!).name === "Glorious Anthem")).toHaveLength(2);
    expect(s.objects[y]!.tapped).toBe(true);
    // Now two permanents share the name: neither can be chosen.
    expect(planActivate(s, ap, y, 0, [{ kind: "object", id: g }])).toBeNull();
  });

  it("an Aura token: Yenna untaps, then you scry 2", () => {
    const { s: s0, ap, y, r } = scene();
    let s = untilChoice(run(s0, planActivate(s0, ap, y, 0, [{ kind: "object", id: r }])));
    // What the token enchants is chosen as it enters (CR 303.4f): Yenna, not the Bears.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "enchant" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: y }));
    const copy = s.battlefield.find((id) => s.objects[id]!.isToken && defOf(s, s.objects[id]!).name === "Rancor")!;
    expect(s.objects[copy]!.attachedTo).toBe(y);
    expect(s.battlefield.filter((id) => defOf(s, s.objects[id]!).name === "Rancor")).toHaveLength(2);
    expect(s.objects[y]!.tapped).toBe(false);
    expect(s.log.some((l) => /scr(y|ies) 2/.test(l.text))).toBe(true);
  });
});

describe("The Legend of Kyoshi, chapter II", () => {
  it("earthbend X (cards in hand), and that land becomes an Island in addition to its other types (CR 305.6)", () => {
    const chapter = card("Test Kyoshi II", "Sorcery", "{1}", { oracleText: "Earthbend X, where X is the number of cards in your hand. That land becomes an Island in addition to its other types." });
    supported(chapter);
    const { s: s0, ap, ids } = setup([chapter, bear(), bear()]);
    const forest = putOnBattlefield(s0, ap, card("Forest", "Basic Land — Forest"));
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: forest }])));
    const f = s.objects[forest]!;
    expect(characteristics(s, f).subtypes.sort()).toEqual(["Forest", "Island"]);
    expect(f.counters["+1/+1"]).toBe(s.players.find((x) => x.id === ap)!.hand.length);
    expect(manaAbilitiesOn(s, f).map((m) => m.produces)).toEqual(expect.arrayContaining([{ kind: "fixed", mana: ["U"] }, { kind: "fixed", mana: ["G"] }]));
  });
});

const rivaz = card("Rivaz of the Claw", "Legendary Creature — Lizard Warlock", "{1}{B}{R}", { power: "3", toughness: "3", keywords: ["Menace"], oracleText: "Menace\n{T}: Add two mana in any combination of colors. Spend this mana only to cast Dragon creature spells.\nOnce during each of your turns, you may cast a Dragon creature spell from your graveyard.\nWhenever you cast a Dragon creature spell from your graveyard, it gains \"When this creature dies, exile it.\"" });

describe("Rivaz of the Claw", () => {
  it("a Dragon cast from the graveyard gains \"When this creature dies, exile it\"; dying, it's exiled", () => {
    supported(rivaz);
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, rivaz);
    const dragon = putOnBattlefield(s0, ap, card("Shivan Dragon", "Creature — Dragon", "{4}{R}{R}", { power: "5", toughness: "5", keywords: ["Flying"], oracleText: "Flying" }));
    moveObject(s0, dragon, "graveyard");
    s0.triggerQueue = [];
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planCast(s0, ap, dragon, undefined, undefined, undefined, undefined, { via: "turnPermission" })));
    expect(s.objects[dragon]!.zone).toBe("battlefield");
    expect(characteristics(s, s.objects[dragon]!).grantedAbilities).toEqual(["When ~ dies, exile it."]);
    moveObject(s, dragon, "graveyard");
    s = settle(s);
    expect(s.objects[dragon]!.zone).toBe("exile");
  });
});

const comeuppance = card("Comeuppance", "Instant", "{3}{W}", { oracleText: "Prevent all damage that would be dealt to you and planeswalkers you control this turn by sources you don't control. If damage from a creature source is prevented this way, Comeuppance deals that much damage to that creature. If damage from a noncreature source is prevented this way, Comeuppance deals that much damage to the source's controller." });

describe("Comeuppance", () => {
  it("a creature's damage to you is prevented and dealt to that creature; a noncreature source's goes to its controller", async () => {
    supported(comeuppance);
    const { dealDamage, objectSource } = await import("../src/damage");
    const { s: s0, ap, ids, opp } = setup([comeuppance]);
    const w = putOnBattlefield(s0, opp, wurm);
    const rock = putOnBattlefield(s0, opp, card("Test Rock", "Artifact", "{1}"));
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const life = (pid: number) => s.players.find((x) => x.id === pid)!.life;
    const [mine, theirs] = [life(ap), life(opp)];
    dealDamage(s, objectSource(s, s.objects[w]!), { player: ap }, 6);
    expect(life(ap)).toBe(mine);
    expect(s.objects[w]!.zone === "graveyard" || s.objects[w]!.damage === 6).toBe(true);
    dealDamage(s, objectSource(s, s.objects[rock]!), { player: ap }, 2);
    expect(life(ap)).toBe(mine);
    expect(life(opp)).toBe(theirs - 2);
  });
});

const ultima = card("Ultima, Origin of Oblivion", "Legendary Creature — Avatar", "{5}", { power: "4", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nWhenever Ultima attacks, put a blight counter on target land. For as long as that land has a blight counter on it, it loses all land types and abilities and has \"{T}: Add {C}.\"\nWhenever you tap a land for {C}, add an additional {C}." });

describe("Ultima, Origin of Oblivion", () => {
  it("attacking, a blight counter on a Forest: no land types, only {T}: Add {C}, while the counter stays (CR 305.7)", () => {
    supported(ultima);
    const { s: s0, ap } = setup([]);
    const u = putOnBattlefield(s0, ap, ultima);
    const opp = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    const forest = putOnBattlefield(s0, opp, card("Snow-Covered Forest", "Basic Snow Land — Forest"));
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: u, defender: opp }] });
    for (let i = 0; i < 20 && (s.stack.length || s.triggerQueue.length || s.pending); i++)
      s = s.pending?.kind === "chooseTargets" ? act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: forest }] }) : act(s, { type: "passPriority", player: waitingOn(s)! });
    const f = s.objects[forest]!;
    expect(f.counters.blight).toBe(1);
    const c = characteristics(s, f);
    expect(c.subtypes).toEqual([]);
    expect(c.supertypes.sort()).toEqual(["Basic", "Snow"]);
    expect(manaAbilitiesOn(s, f).map((m) => m.produces)).toEqual([{ kind: "fixed", mana: ["C"] }]);
    f.counters.blight = 0;
    invalidateCharacteristics(s);
    expect(characteristics(s, f).subtypes).toEqual(["Forest"]);
    expect(manaAbilitiesOn(s, f).map((m) => m.produces)).toEqual([{ kind: "fixed", mana: ["G"] }]);
  });
});

const biophagus = card("Biophagus", "Creature — Tyranid", "{1}{G}", { power: "1", toughness: "1", oracleText: "Genomic Enhancement — {T}: Add one mana of any color. If this mana is spent to cast a creature spell, that creature enters with an additional +1/+1 counter on it." });

describe("Biophagus", () => {
  it("its mana spent on a creature spell: that creature enters with an additional +1/+1 counter", () => {
    supported(biophagus);
    const { s: s0, ap, ids } = setup([bear()]);
    const b = putOnBattlefield(s0, ap, biophagus);
    // Only Biophagus and one Forest to pay for the Bears.
    for (const id of [...s0.battlefield]) if (id !== b && s0.objects[id]!.controller === ap) s0.objects[id]!.tapped = true;
    const f = putOnBattlefield(s0, ap, card("Forest", "Basic Land — Forest"));
    invalidateCharacteristics(s0);
    const plan = planCast(s0, ap, ids[0]!);
    expect(plan?.some((a) => a.type === "activateMana" && a.objectId === b)).toBe(true);
    const s = settle(run(s0, plan));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(1);
    expect(f).toBeDefined();
  });
});

const REMIND = " (While paying a waterbend cost, you can tap your artifacts and creatures to help. Each one pays for {1}.)";
const geyserLeaper = card("Geyser Leaper", "Creature — Human Warrior Ally", "{4}{U}", { power: "4", toughness: "3", keywords: ["Flying", "Waterbend"], oracleText: `Flying\nWaterbend {4}: Draw a card, then discard a card.${REMIND}` });
const northPolePatrol = card("North Pole Patrol", "Creature — Human Soldier Ally", "{2}{U}", { power: "2", toughness: "3", keywords: ["Waterbend"], oracleText: `{T}: Untap another target permanent you control.\nWaterbend {3}, {T}: Tap target creature an opponent controls.${REMIND}` });
const kataraHope = card("Katara, Water Tribe's Hope", "Legendary Creature — Human Warrior Ally", "{2}{W}{U}{U}", { power: "3", toughness: "3", keywords: ["Vigilance", "Waterbend"], oracleText: `Vigilance\nWhen Katara enters, create a 1/1 white Ally creature token.\nWaterbend {X}: Creatures you control have base power and toughness X/X until end of turn. X can't be 0. Activate only during your turn.${REMIND}` });

describe("Waterbend (CR 701.67)", () => {
  /** `ap` with only `lands` untapped lands and the given permanents. */
  const board = (lands: number, ...defs: CardDef[]) => {
    const { s, ap, opp } = setup([]);
    const mine = s.battlefield.filter((id) => s.objects[id]!.controller === ap);
    mine.slice(lands).forEach((id) => (s.objects[id]!.tapped = true));
    const ids = defs.map((d) => putOnBattlefield(s, ap, d));
    invalidateCharacteristics(s);
    return { s, ap, opp, ids };
  };

  it("tapped artifacts and creatures each pay {1} of the waterbend cost; mana pays the rest", () => {
    supported(geyserLeaper, northPolePatrol, kataraHope);
    const { s: s0, ap, ids } = board(2, geyserLeaper, bear(), bear());
    const [leaper, b1, b2] = ids as [string, string, string];
    const plan = planActivate(s0, ap, leaper, 0);
    const a = plan?.find((x) => x.type === "activateAbility");
    expect(a?.type === "activateAbility" && a.tapCreatures?.length).toBe(2);
    let s = run(s0, plan);
    expect(s.objects[b1]!.tapped && s.objects[b2]!.tapped).toBe(true);
    expect(s.log.some((l) => /to waterbend/.test(l.text))).toBe(true);
    const hand = s.players[ap]!.hand.length;
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand); // drew one, discarded one
  });

  it("no more than the waterbend cost's generic mana, and only untapped artifacts and creatures you control", () => {
    const { s, ap, opp, ids } = board(0, geyserLeaper, bear(), bear(), bear(), bear(), bear());
    const [leaper, ...bears] = ids as string[];
    expect(abilityProblem(s, ap, leaper!, 0, undefined, undefined, bears)).toMatch(/no more than 4/);
    expect(abilityProblem(s, ap, leaper!, 0, undefined, undefined, bears.slice(0, 4))).toBeNull();
    expect(abilityProblem(s, ap, leaper!, 0, undefined, undefined, bears.slice(0, 3))).toMatch(/not enough mana/);
    const land = s.battlefield.find((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.name === "Forest")!;
    expect(abilityProblem(s, ap, leaper!, 0, undefined, undefined, [land])).toMatch(/only artifacts and creatures/);
    const theirs = putOnBattlefield(s, opp, bear());
    expect(abilityProblem(s, ap, leaper!, 0, undefined, undefined, [theirs])).toMatch(/only artifacts and creatures/);
  });

  it("the source tapped by its own {T} cost can't also be tapped to waterbend", () => {
    const { s: s0, ap, opp, ids } = board(0, northPolePatrol, bear(), bear(), bear());
    const [patrol, ...bears] = ids as string[];
    const target = putOnBattlefield(s0, opp, bear());
    const t = [{ kind: "object" as const, id: target }];
    expect(abilityProblem(s0, ap, patrol!, 1, t, undefined, [patrol!, bears[0]!, bears[1]!])).toMatch(/already tapped/);
    const plan = planActivate(s0, ap, patrol!, 1, t);
    const a = plan?.find((x) => x.type === "activateAbility");
    expect(a?.type === "activateAbility" && [...(a.tapCreatures ?? [])].sort()).toEqual([...bears].sort());
    const s = settle(run(s0, plan));
    expect(s.objects[target]!.tapped).toBe(true);
  });

  it("Waterbend {X}: up to X of them, X chosen as it's activated", () => {
    const { s: s0, ap, ids } = board(0, kataraHope, bear(), bear(), bear(), bear());
    const [katara, ...bears] = ids as string[];
    expect(abilityProblem(s0, ap, katara!, 0, undefined, undefined, bears, 3)).toMatch(/no more than 3/);
    let s = act(s0, { type: "activateAbility", player: ap, objectId: katara!, index: 0, tapCreatures: bears.slice(0, 3), x: 3 });
    s = settle(s);
    expect(power(s, s.objects[katara!]!)).toBe(3);
    expect(toughness(s, s.objects[bears[3]!]!)).toBe(3);
  });
});
