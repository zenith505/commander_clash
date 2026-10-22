// Round 121: round 120's gaps (bots ending the turn, Fatal Push's targets for bots, "if cast using web-slinging"), then
// the most played cards.

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passUntil, putOnBattlefield, scry, setup } from "./helpers";
import { botActions, castProblem, characteristics, chooseTargets, compileCard, isFullySupported, manaOptions, planActivate, planCast, spellCost, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";
import { invalidateCharacteristics } from "../src/layers";
import { abilitiesOf } from "../src/cards";
import { activationCost, moveObject, unlockCost } from "../src/game";
import { createEmblem } from "../src/emblems";

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
const toHand = (s: GameState, pid: PlayerId, d: CardDef) => {
  const id = putOnBattlefield(s, pid, d);
  moveObject(s, id, "hand");
  return id;
};
const named = (s: GameState, name: string) => s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === name);
/** The bot's actions, one plan after another, until one of them does what `want` looks for (or it passes). */
const botUntil = (s: GameState, pid: PlayerId, want: (a: Action) => boolean) => {
  for (let i = 0; i < 12; i++) {
    const plan = botActions(s, pid);
    if (plan.some(want)) return { s, plan };
    if (plan.length === 1 && plan[0]!.type === "passPriority") {
      if (!s.stack.length) break;
      s = settle(s); // what it cast resolves
      continue;
    }
    s = run(s, plan);
  }
  return { s, plan: null };
};
/** Pass priority until `pid` has it (or nothing's waiting). */
const passTo = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 8 && waitingOn(s) !== pid && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

// Real oracle text (Scryfall).
const timeStop = card("Time Stop", "Instant", "{4}{U}{U}", { oracleText: "End the turn. (Exile all spells and abilities, including this spell. The player whose turn it is discards down to their maximum hand size. Damage heals and \"this turn\" and \"until end of turn\" effects end.)" });
const gloriousEnd = card("Glorious End", "Instant", "{2}{R}", { oracleText: "End the turn. (Exile all spells and abilities from the stack, including this card. The player whose turn it is discards down to their maximum hand size. Damage wears off, and \"this turn\" and \"until end of turn\" effects end.)\nAt the beginning of your next end step, you lose the game." });
const ultima = card("Ultima", "Sorcery", "{3}{W}{W}", { oracleText: "Destroy all artifacts and creatures. End the turn. (Exile all spells and abilities from the stack, including this card. The player whose turn it is discards down to their maximum hand size. Damage wears off, and \"this turn\" and \"until end of turn\" effects end.)" });
const sundial = card("Sundial of the Infinite", "Artifact", "{2}", { oracleText: "{1}, {T}: End the turn. Activate only during your turn. (Exile all spells and abilities from the stack. Discard down to your maximum hand size. Damage wears off, and \"this turn\" and \"until end of turn\" effects end.)" });
const sneak = card("Sneak Attack", "Enchantment", "{3}{R}", { oracleText: "{R}: You may put a creature card from your hand onto the battlefield. That creature gains haste. Sacrifice the creature at the beginning of the next end step." });
const giant = card("Test Giant", "Creature — Giant", "{4}{R}{R}", { power: "6", toughness: "6", oracleText: "" });
const push = card("Fatal Push", "Instant", "{B}", { oracleText: "Destroy target creature if it has mana value 2 or less.\nRevolt — Destroy that creature if it has mana value 4 or less instead if a permanent left the battlefield under your control this turn." });
const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3", oracleText: "" });

describe("bots end the turn", () => {
  it("a bot casts Time Stop at an opponent's big spell, which is exiled, and the turn ends", () => {
    supported(timeStop);
    const { s: s0, ap, ids, opp } = setup([giant]);
    // The bot (the next player) has Time Stop and six Islands.
    const stop = toHand(s0, opp, timeStop);
    const island = card("Island", "Basic Land — Island");
    for (let i = 0; i < 6; i++) putOnBattlefield(s0, opp, island);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = passTo(s, opp);
    const plan = botActions(s, opp);
    expect(plan.some((a) => a.type === "castSpell" && a.objectId === stop)).toBe(true);
    s = settle(run(s, plan));
    expect(s.objects[ids[0]!]!.zone).toBe("exile"); // CR 724.1b
    expect(s.objects[stop]!.zone).toBe("exile");
    expect(s.activePlayer).not.toBe(ap);
  });

  it("a bot doesn't end the turn while something of its own is on the stack, and never casts Glorious End", () => {
    const { s: s0, ap, ids, opp } = setup([giant]);
    const stop = toHand(s0, opp, timeStop);
    const end = toHand(s0, opp, gloriousEnd);
    const island = card("Island", "Basic Land — Island");
    for (let i = 0; i < 6; i++) putOnBattlefield(s0, opp, island);
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, opp, card("Mountain", "Basic Land — Mountain"));
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = passTo(s, opp);
    // A spell of the bot's own under the giant: ending the turn would exile it too.
    s.stack.unshift({ ...s.stack[0]!, id: "mine", controller: opp, kind: "ability", objectId: undefined });
    expect(botActions(s, opp).some((a) => a.type === "castSpell" && (a.objectId === stop || a.objectId === end))).toBe(false);
    s.stack = s.stack.filter((x) => x.id !== "mine");
    s.players[opp]!.hand = s.players[opp]!.hand.filter((x) => x !== stop);
    expect(botActions(s, opp).some((a) => a.type === "castSpell" && a.objectId === end)).toBe(false);
  });

  it("a bot casts Ultima as the last thing in its second main phase, when it hurts the opponents more", () => {
    supported(ultima);
    const { s: s0, ap, ids, opp } = setup([ultima]);
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, opp, giant);
    // Not in the first main phase.
    expect(botActions(s0, ap).some((a) => a.type === "castSpell" && a.objectId === ids[0])).toBe(false);
    const found = botUntil(passUntil(s0, "main2", ap), ap, (a) => a.type === "castSpell" && a.objectId === ids[0]);
    expect(found.plan).not.toBeNull();
    const s = settle(run(found.s, found.plan));
    expect(named(s, "Test Giant").length).toBe(0);
    expect(s.activePlayer).not.toBe(ap);
    // With only its own creatures around, it keeps Ultima.
    const { s: t0, ap: me, ids: mine } = setup([ultima]);
    for (let i = 0; i < 3; i++) putOnBattlefield(t0, me, giant);
    expect(botUntil(passUntil(t0, "main2", me), me, (a) => a.type === "castSpell" && a.objectId === mine[0]).plan).toBeNull();
  });

  it("a bot activates Sundial of the Infinite in its end step to keep a creature Sneak Attack would sacrifice", () => {
    supported(sundial, sneak);
    const { s: s0, ap } = setup([]);
    const dial = putOnBattlefield(s0, ap, sundial);
    const sa = putOnBattlefield(s0, ap, sneak);
    const g = toHand(s0, ap, giant);
    let s = run(s0, planActivate(s0, ap, sa, 0));
    for (let i = 0; i < 10 && s.objects[g]!.zone !== "battlefield"; i++) {
      const p = s.pending;
      if (p?.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: ap, found: [g] });
      else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: true });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[g]!.zone).toBe("battlefield");
    // Nothing to escape yet: the bot doesn't end its turn in the second main phase.
    s = passUntil(s, "main2", ap);
    expect(botActions(s, ap).some((a) => a.type === "activateAbility" && a.objectId === dial)).toBe(false);
    s = passUntil(s, "end", ap);
    for (let i = 0; i < 6 && !s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.stack.length).toBe(1);
    const plan = botActions(s, ap);
    expect(plan.some((a) => a.type === "activateAbility" && a.objectId === dial)).toBe(true);
    s = settle(run(s, plan));
    expect(s.objects[g]!.zone).toBe("battlefield");
    expect(s.activePlayer).not.toBe(ap);
  });
});

describe("Fatal Push's targets for bots", () => {
  it("only a creature it would destroy: mana value 2 or less, or 4 or less with revolt", () => {
    const { s, ap, ids, opp } = setup([push]);
    const o = putOnBattlefield(s, opp, ogre);
    const body = compileCard(push).spell!;
    expect(chooseTargets(s, ap, body, false, ids[0])).toBeNull();
    const b = putOnBattlefield(s, opp, bear());
    expect(chooseTargets(s, ap, body, false, ids[0])).toEqual([{ kind: "object", id: b }]);
    moveObject(s, b, "graveyard");
    expect(chooseTargets(s, ap, body, false, ids[0])).toBeNull();
    // Revolt: a permanent of ours left the battlefield.
    const leaver = putOnBattlefield(s, ap, bear({ name: "Leaver" }));
    moveObject(s, leaver, "graveyard");
    invalidateCharacteristics(s);
    expect(chooseTargets(s, ap, body, false, ids[0])).toEqual([{ kind: "object", id: o }]);
  });
});

const spidersMan = card("Spiders-Man, Heroic Horde", "Legendary Creature — Spider Hero", "{1}{G}", { power: "1", toughness: "1", oracleText: "Web-slinging {4}{G}{G} (You may cast this spell for {4}{G}{G} if you also return a tapped creature you control to its owner's hand.)\nWhen Spiders-Man enters, if they were cast using web-slinging, you gain 3 life and create two 2/1 green Spider creature tokens with reach." });
const scarlet = card("Scarlet Spider, Ben Reilly", "Legendary Creature — Spider Human Hero", "{1}{R}{G}", { power: "4", toughness: "3", keywords: ["Trample", "Web-slinging"], oracleText: "Web-slinging {R}{G} (You may cast this spell for {R}{G} if you also return a tapped creature you control to its owner's hand.)\nTrample\nSensational Save — If Scarlet Spider was cast using web-slinging, he enters with X +1/+1 counters on him, where X is the mana value of the returned creature." });
const spiderUK = card("Spider-UK", "Legendary Creature — Spider Human Hero", "{3}{W}", { power: "3", toughness: "4", oracleText: "Web-slinging {2}{W} (You may cast this spell for {2}{W} if you also return a tapped creature you control to its owner's hand.)\nAt the beginning of your end step, if two or more creatures entered the battlefield under your control this turn, you draw a card and gain 2 life." });
const arachne = card("Arachne, Psionic Weaver", "Legendary Creature — Spider Human Hero", "{2}{W}", { power: "3", toughness: "3", oracleText: "Web-slinging {W} (You may cast this spell for {W} if you also return a tapped creature you control to its owner's hand.)\nAs Arachne enters, look at an opponent's hand, then choose a card type other than creature.\nSpells of the chosen type cost {1} more to cast." });

describe("web-slinging", () => {
  it("Spiders-Man's enters trigger only when cast using web-slinging", () => {
    supported(spidersMan);
    for (const slung of [true, false]) {
      const { s: s0, ap, ids } = setup([spidersMan]);
      const tired = putOnBattlefield(s0, ap, ogre);
      s0.objects[tired]!.tapped = true;
      const life = s0.players[ap]!.life;
      const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, slung ? { alt: "alternative", returnToHand: [tired] } : {})));
      expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
      expect(s.objects[tired]!.zone).toBe(slung ? "hand" : "battlefield");
      expect(s.players[ap]!.life, `slung ${slung}`).toBe(life + (slung ? 3 : 0));
      expect(s.battlefield.filter((id) => s.objects[id]!.isToken).length).toBe(slung ? 2 : 0);
    }
  });

  it("Scarlet Spider enters with +1/+1 counters equal to the returned creature's mana value, only cast using web-slinging", () => {
    supported(scarlet);
    for (const slung of [true, false]) {
      const { s: s0, ap, ids } = setup([scarlet]);
      const tired = putOnBattlefield(s0, ap, ogre); // mana value 3
      s0.objects[tired]!.tapped = true;
      const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, slung ? { alt: "alternative", returnToHand: [tired] } : {})));
      expect(s.objects[ids[0]!]!.counters["+1/+1"] ?? 0, `slung ${slung}`).toBe(slung ? 3 : 0);
    }
  });

  it("Spider-UK draws and gains life at your end step if two or more creatures entered under your control this turn", () => {
    supported(spiderUK);
    for (const n of [1, 2]) {
      const { s: s0, ap } = setup([]);
      putOnBattlefield(s0, ap, spiderUK);
      // Creatures that entered this turn count even if they left since.
      for (let i = 0; i < n; i++) {
        const b = toHand(s0, ap, bear());
        s0.players[ap]!.hand = s0.players[ap]!.hand.filter((x) => x !== b);
        moveObject(s0, b, "battlefield");
        if (i === 0) moveObject(s0, b, "graveyard");
      }
      // An opponent's creature doesn't count.
      const theirs = putOnBattlefield(s0, s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!, bear());
      moveObject(s0, theirs, "hand");
      moveObject(s0, theirs, "battlefield");
      const life = s0.players[ap]!.life;
      const hand = s0.players[ap]!.hand.length;
      let s = passUntil(s0, "end", ap);
      s = settle(s);
      expect(s.players[ap]!.life, `${n} entered`).toBe(life + (n === 2 ? 2 : 0));
      expect(s.players[ap]!.hand.length).toBe(hand + (n === 2 ? 1 : 0));
    }
  });

  it("Arachne: choose an opponent, see their hand, then a card type other than creature; those spells cost {1} more", () => {
    supported(arachne);
    const { s: s0, ap, ids, opp } = setup([arachne]);
    const secret = toHand(s0, opp, card("Secret Plan", "Sorcery", "{1}{U}", { oracleText: "Draw a card." }));
    const before = spellCost(s0, opp, s0.objects[secret]!).extra;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = passTo(s, ap);
    for (let i = 0; i < 8 && s.pending?.kind !== "chooseOption"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "player" });
    expect((s.pending as { options: string[] }).options).not.toContain(String(ap));
    s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
    expect(s.log.some((l) => l.text.startsWith(`${s.players[opp]!.name}'s hand: `) && l.text.includes("Secret Plan") && l.to === ap)).toBe(true);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "cardType" });
    expect((s.pending as { options: string[] }).options).not.toContain("Creature");
    s = act(s, { type: "chooseOption", player: ap, choice: "Sorcery" });
    s = settle(s);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(spellCost(s, opp, s.objects[secret]!).extra).toBe(before + 1);
  });
});

const camellia = card("Camellia, the Seedmiser", "Legendary Creature — Squirrel Warlock", "{1}{B}{G}", { power: "3", toughness: "3", keywords: ["Forage", "Menace"], oracleText: "Menace\nOther Squirrels you control have menace.\nWhenever you sacrifice one or more Foods, create a 1/1 green Squirrel creature token.\n{2}, Forage: Put a +1/+1 counter on each other Squirrel you control. (To forage, exile three cards from your graveyard or sacrifice a Food.)" });
const thornvault = card("Thornvault Forager", "Creature — Squirrel Ranger", "{1}{G}", { power: "2", toughness: "2", keywords: ["Forage"], oracleText: "{T}: Add {G}.\n{T}, Forage: Add two mana in any combination of colors. (To forage, exile three cards from your graveyard or sacrifice a Food.)\n{3}{G}, {T}: Search your library for a Squirrel card, reveal it, put it into your hand, then shuffle." });
const feed = card("Feed the Cycle", "Instant", "{1}{B}", { keywords: ["Forage"], oracleText: "As an additional cost to cast this spell, forage or pay {B}. (To forage, exile three cards from your graveyard or sacrifice a Food.)\nDestroy target creature or planeswalker." });
const food = card("Test Food", "Artifact — Food", "{1}", { oracleText: "{2}, {T}, Sacrifice this artifact: You gain 3 life." });
const squirrel = card("Test Squirrel", "Creature — Squirrel", "{G}", { power: "1", toughness: "1", oracleText: "" });
const ygra = card("Ygra, Eater of All", "Legendary Creature — Elemental Cat", "{3}{B}{G}", { power: "6", toughness: "6", keywords: ["Ward"], oracleText: "Ward—Sacrifice a Food.\nOther creatures are Food artifacts in addition to their other types and have \"{2}, {T}, Sacrifice this permanent: You gain 3 life.\"\nWhenever a Food is put into a graveyard from the battlefield, put two +1/+1 counters on Ygra." });
const toYard = (s: GameState, pid: PlayerId, d: CardDef) => {
  const id = putOnBattlefield(s, pid, d);
  moveObject(s, id, "graveyard");
  return id;
};

describe("forage (CR 701.61a)", () => {
  it("Camellia: forage by sacrificing a Food, which also makes a Squirrel; the ability then counts it", () => {
    supported(camellia, thornvault, feed);
    const { s: s0, ap } = setup([]);
    const cam = putOnBattlefield(s0, ap, camellia);
    const sq = putOnBattlefield(s0, ap, squirrel);
    const f = putOnBattlefield(s0, ap, food);
    invalidateCharacteristics(s0);
    // "Other Squirrels you control have menace."
    expect(characteristics(s0, s0.objects[sq]!).keywords).toContain("Menace");
    // Forage is a cost: no way chosen, no activation.
    expect(() => run(s0, planActivate(s0, ap, cam, 0))).toThrow(/forage/);
    let s = run(s0, planActivate(s0, ap, cam, 0, undefined, undefined, undefined, undefined, { sacrifice: [f] }));
    expect(s.objects[f]!.zone).toBe("graveyard");
    s = settle(s);
    const tokens = named(s, "Squirrel Token");
    expect(tokens).toHaveLength(1);
    // The token came from the sacrifice trigger, above the ability on the stack, so it got a counter too.
    expect(s.objects[sq]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[tokens[0]!]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[cam]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Camellia: forage by exiling three cards from your graveyard; no Food sacrificed, no Squirrel", () => {
    const { s: s0, ap } = setup([]);
    const cam = putOnBattlefield(s0, ap, camellia);
    putOnBattlefield(s0, ap, food);
    const yard = [toYard(s0, ap, bear()), toYard(s0, ap, bear()), toYard(s0, ap, ogre)];
    invalidateCharacteristics(s0);
    expect(planActivate(s0, ap, cam, 0, undefined, undefined, undefined, undefined, { exileCards: yard.slice(0, 2) })).toBeNull();
    let s = settle(run(s0, planActivate(s0, ap, cam, 0, undefined, undefined, undefined, undefined, { exileCards: yard })));
    expect(yard.every((id) => s.objects[id]!.zone === "exile")).toBe(true);
    expect(named(s, "Squirrel Token")).toHaveLength(0);
  });

  it("Feed the Cycle: forage or pay {B} more; a bot forages with cards that do nothing in its graveyard", () => {
    const { s: s0, ap, ids, opp } = setup([feed]);
    const victim = putOnBattlefield(s0, opp, ogre);
    const yard = [toYard(s0, ap, bear()), toYard(s0, ap, bear()), toYard(s0, ap, bear())];
    invalidateCharacteristics(s0);
    const tgt = [{ kind: "object" as const, id: victim }];
    expect(() => run(s0, planCast(s0, ap, ids[0]!, tgt))).toThrow(/forage or pay \{B\}/); // which way not chosen
    const blacks = (costOr: number) => spellCost(s0, ap, s0.objects[ids[0]!]!, 0, [], { costOr }).cost.symbols.filter((x) => x.kind === "colored" && x.color === "B").length;
    expect([blacks(0), blacks(1)]).toEqual([1, 2]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, tgt, undefined, "auto", undefined, { costOr: 0, exileCards: yard })));
    expect(s.objects[victim]!.zone).toBe("graveyard");
    expect(yard.every((id) => s.objects[id]!.zone === "exile")).toBe(true);
  });
});

describe("Ygra, Eater of All", () => {
  it("other creatures are Food artifacts with the Food ability; when one dies Ygra gets two +1/+1 counters", () => {
    supported(ygra);
    const { s: s0, ap, ids, opp } = setup([feed]);
    const y = putOnBattlefield(s0, ap, ygra);
    const victim = putOnBattlefield(s0, opp, ogre);
    invalidateCharacteristics(s0);
    const c = characteristics(s0, s0.objects[victim]!);
    expect(c.types).toEqual(expect.arrayContaining(["Creature", "Artifact"]));
    expect(c.subtypes).toEqual(expect.arrayContaining(["Ogre", "Food"]));
    expect(characteristics(s0, s0.objects[y]!).subtypes).not.toContain("Food");
    expect(abilitiesOf(s0, s0.objects[victim]!).activated.some((a) => a.sacrificeSelf && a.tap && a.manaCost === "{2}")).toBe(true);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: victim }], undefined, "auto", undefined, { costOr: 1 })));
    expect(s.objects[victim]!.zone).toBe("graveyard");
    expect(s.objects[y]!.counters["+1/+1"]).toBe(2);
  });
});

const glimmer = card("Inquisitive Glimmer", "Enchantment Creature — Fox Glimmer", "{W}{U}", { power: "2", toughness: "3", oracleText: "Enchantment spells you cast cost {1} less to cast.\nUnlock costs you pay cost {1} less." });
const ROOM = "\n(You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it.)";
const pool = scry("split", [
  { name: "Bottomless Pool", mana_cost: "{U}", type_line: "Enchantment — Room", oracle_text: `When you unlock this door, return up to one target creature to its owner's hand.${ROOM}` },
  { name: "Locker Room", mana_cost: "{4}{U}", type_line: "Enchantment — Room", oracle_text: `Whenever one or more creatures you control deal combat damage to a player, draw a card.${ROOM}` },
]);

describe("Inquisitive Glimmer", () => {
  it("unlock costs you pay cost {1} less (CR 709.5e), and only yours", () => {
    supported(glimmer);
    const { s: s0, ap, opp } = setup([]);
    const room = putOnBattlefield(s0, ap, pool);
    const theirs = putOnBattlefield(s0, opp, pool);
    s0.objects[room]!.unlocked = [0];
    s0.objects[theirs]!.unlocked = [0];
    invalidateCharacteristics(s0);
    expect(unlockCost(s0, s0.objects[room]!, 1)).toBe("{4}{U}");
    putOnBattlefield(s0, ap, glimmer);
    invalidateCharacteristics(s0);
    expect(unlockCost(s0, s0.objects[room]!, 1)).toBe("{3}{U}");
    expect(unlockCost(s0, s0.objects[theirs]!, 1)).toBe("{4}{U}");
  });
});

const insight = scry("modal_dfc", [
  { name: "Bloodsoaked Insight", mana_cost: "{5}{B/R}{B/R}", type_line: "Sorcery", oracle_text: "This spell costs {1} less to cast for each 1 life your opponents have lost this turn.\nTarget opponent exiles the top three cards of their library. Until the end of your next turn, you may play those cards. If you cast a spell this way, mana of any type can be spent to cast it." },
  { name: "Sanguine Morass", type_line: "Land", oracle_text: "This land enters tapped.\n{T}: Add {B} or {R}." },
]);

describe("Bloodsoaked Insight", () => {
  it("costs less for life the opponents lost; exiles their top three, which you may play until the end of your next turn", () => {
    supported(insight);
    const { s: s0, ap, ids, opp } = setup([insight]);
    const generic = () => spellCost(s0, ap, s0.objects[ids[0]!]!).extra;
    expect(generic()).toBe(5);
    (s0.turnLog ??= {}).lifeLost = { [opp]: 2 };
    expect(generic()).toBe(3);
    // A creature card on top, the rest lands.
    const lib = s0.players[opp]!.library;
    const bearAt = lib.findIndex((id) => s0.cards[s0.objects[id]!.cardId]!.types.includes("Creature"));
    lib.unshift(...lib.splice(bearAt, 1));
    const top = lib.slice(0, 3);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(top.every((id) => s.objects[id]!.zone === "exile")).toBe(true);
    const bearId = top.find((id) => s.cards[s.objects[id]!.cardId]!.types.includes("Creature"));
    expect(bearId).toBeDefined();
    expect(planCast(s, ap, bearId!)).not.toBeNull();
    expect(castProblem(s, opp, bearId!)).not.toMatch(/mana/);
  });
});

const wrenn = card("Wrenn and Realmbreaker", "Legendary Planeswalker — Wrenn", "{1}{G}{G}", { loyalty: "4", keywords: ["Mill"], oracleText: "Lands you control have \"{T}: Add one mana of any color.\"\n+1: Up to one target land you control becomes a 3/3 Elemental creature with vigilance, hexproof, and haste until your next turn. It's still a land.\n−2: Mill three cards. You may put a permanent card from among the milled cards into your hand.\n−7: You get an emblem with \"You may play lands and cast permanent spells from your graveyard.\"" });
const forestCard = card("Test Forest", "Basic Land — Forest", "", { oracleText: "({T}: Add {G}.)" });
const shock = card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target." });

describe("Wrenn and Realmbreaker's emblem", () => {
  it("you may play lands and cast permanent spells (not instants) from your graveyard; an opponent's graveyard isn't yours", () => {
    supported(wrenn);
    const { s: s0, ap, opp } = setup([]);
    const b = toYard(s0, ap, bear());
    const l = toYard(s0, ap, forestCard);
    const i = toYard(s0, ap, shock);
    const theirs = toYard(s0, opp, bear());
    const yardCast = (id: string, t?: TargetChoice[]) => castProblem(s0, ap, id, t, undefined, undefined, undefined, undefined, { via: "permission" });
    expect(yardCast(b)).not.toMatch(/mana/);
    createEmblem(s0, ap, ["You may play lands and cast permanent spells from your graveyard."], "Wrenn and Realmbreaker");
    invalidateCharacteristics(s0);
    expect(yardCast(b)).toMatch(/not enough mana/);
    expect(yardCast(i, [{ kind: "player", id: opp }])).not.toMatch(/mana/);
    expect(yardCast(theirs)).not.toMatch(/mana/);
    let s = run(s0, planCast(s0, ap, b, undefined, undefined, undefined, undefined, { via: "permission" }));
    s = settle(s);
    expect(s.objects[b]!.zone).toBe("battlefield");
    s = act(s, { type: "playLand", player: ap, objectId: l });
    expect(s.objects[l]!.zone).toBe("battlefield");
  });
});

const guest = card("Grand Ball Guest", "Creature — Human Peasant", "{1}{R}", { power: "2", toughness: "2", keywords: ["Celebration"], oracleText: "Celebration — This creature gets +1/+1 and has trample as long as two or more nonland permanents entered the battlefield under your control this turn." });

describe("celebration", () => {
  it("Grand Ball Guest gets +1/+1 and trample once two nonland permanents entered under your control this turn", () => {
    supported(guest);
    const { s: s0, ap, ids, opp } = setup([guest, bear()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const g = ids[0]!;
    expect(characteristics(s, s.objects[g]!).power).toBe(2);
    // An opponent's permanent doesn't count.
    putOnBattlefield(s, opp, bear());
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[g]!).power).toBe(2);
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(characteristics(s, s.objects[g]!).power).toBe(3);
    expect(characteristics(s, s.objects[g]!).keywords).toContain("Trample");
  });
});

const virtue = scry("adventure", [
  { name: "Virtue of Strength", mana_cost: "{5}{G}{G}", type_line: "Enchantment", oracle_text: "If you tap a basic land for mana, it produces three times as much of that mana instead." },
  { name: "Garenbrig Growth", mana_cost: "{G}", type_line: "Sorcery — Adventure", oracle_text: "Return target creature or land card from your graveyard to your hand. (Then exile this card. You may cast the enchantment later from exile.)" },
]);
const grove = card("Test Grove", "Land", "", { oracleText: "{T}: Add {G}." });
const manaPool = (s: GameState, pid: PlayerId) => Object.entries(s.players[pid]!.manaPool).flatMap(([m, n]) => Array<string>(n).fill(m)).join("");

describe("Virtue of Strength", () => {
  it("a basic land you tap for mana produces three times as much; a nonbasic land doesn't, nor an opponent's basic", () => {
    supported(virtue);
    const { s: s0, ap, opp } = setup([]);
    for (const id of s0.battlefield) s0.objects[id]!.tapped = true;
    putOnBattlefield(s0, ap, virtue);
    const f = putOnBattlefield(s0, ap, forest);
    const g = putOnBattlefield(s0, ap, grove);
    const theirs = putOnBattlefield(s0, opp, forest);
    expect(manaOptions(s0, s0.objects[f]!).map((x) => x.adds.join(""))).toEqual(["GGG"]);
    let s = act(s0, { type: "activateMana", player: ap, objectId: f, mana: "G" });
    expect(manaPool(s, ap)).toBe("GGG");
    s = act(s, { type: "activateMana", player: ap, objectId: g, mana: "G" });
    expect(manaPool(s, ap)).toBe("GGGG");
    expect(manaOptions(s0, s0.objects[theirs]!).map((x) => x.adds.join(""))).toEqual(["G"]);
  });
});

const nowhere = card("Nowhere to Run", "Enchantment", "{1}{B}", { keywords: ["Flash"], oracleText: "Flash\nWhen this enchantment enters, target creature an opponent controls gets -3/-3 until end of turn.\nCreatures your opponents control can be the targets of spells and abilities as though they didn't have hexproof. Ward abilities of those creatures don't trigger." });
const hexBear = card("Hexproof Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2", keywords: ["Hexproof"], oracleText: "Hexproof" });
const wardBear = card("Ward Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2", keywords: ["Ward"], oracleText: "Ward {2}" });
const bolt = card("Test Bolt", "Instant", "{R}", { oracleText: "Test Bolt deals 3 damage to any target." });

describe("Nowhere to Run", () => {
  it("your opponents' creatures can be targeted as though they didn't have hexproof, and their ward doesn't trigger", () => {
    supported(nowhere);
    const { s: s0, ap, ids, opp } = setup([bolt, bolt]);
    const hex = putOnBattlefield(s0, opp, hexBear);
    const ward = putOnBattlefield(s0, opp, wardBear);
    invalidateCharacteristics(s0);
    expect(castProblem(s0, ap, ids[0]!, [{ kind: "object", id: hex }])).toMatch(/target/);
    // Without it, ward triggers.
    const warded = run(s0, planCast(s0, ap, ids[1]!, [{ kind: "object", id: ward }]));
    expect(warded.triggerQueue.length + warded.stack.filter((x) => x.kind !== "spell").length).toBe(1);
    putOnBattlefield(s0, ap, nowhere);
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: hex }])));
    expect(s.objects[hex]!.zone).toBe("graveyard");
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: ward }]));
    expect(s.triggerQueue.length + s.stack.filter((x) => x.kind !== "spell").length).toBe(0);
    s = settle(s);
    expect(s.objects[ward]!.zone).toBe("graveyard");
  });
});

const haze = card("Paradox Haze", "Enchantment — Aura", "{2}{U}", { keywords: ["Enchant"], oracleText: "Enchant player\nAt the beginning of enchanted player's first upkeep each turn, that player gets an additional upkeep step after this step." });
const upkeepDrain = card("Test Upkeeper", "Enchantment", "{1}{B}", { oracleText: "At the beginning of your upkeep, you lose 1 life." });

describe("Paradox Haze", () => {
  it("the enchanted player gets one additional upkeep after their first, so their upkeep triggers happen twice", () => {
    supported(haze);
    const { s: s0, ap, opp } = setup([]);
    const h = putOnBattlefield(s0, ap, haze);
    s0.objects[h]!.attachedToPlayer = opp;
    putOnBattlefield(s0, opp, upkeepDrain);
    invalidateCharacteristics(s0);
    const life = s0.players[opp]!.life;
    let s = s0;
    for (let i = 0; i < 400 && !(s.activePlayer === opp && s.step === "draw"); i++) s = s.pending ? botActions(s, s.pending.player).reduce((x, a) => act(x, a), s) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.activePlayer).toBe(opp);
    expect(s.turnLog?.upkeeps).toBe(2);
    expect(s.players[opp]!.life).toBe(life - 2);
    expect(s.log.filter((l) => l.text === "An additional upkeep step begins.").length).toBe(1);
  });
});

const okinec = card("Sovereign Okinec Ahau", "Legendary Creature — Cat Noble", "{2}{G}{W}", { power: "3", toughness: "4", keywords: ["Ward"], oracleText: "Ward {2}\nWhenever Sovereign Okinec Ahau attacks, for each creature you control with power greater than that creature's base power, put a number of +1/+1 counters on that creature equal to the difference." });

describe("Sovereign Okinec Ahau", () => {
  it("when it attacks, each creature you control above its base power gets counters equal to the difference", () => {
    supported(okinec);
    const { s: s0, ap, opp } = setup([]);
    const ok = putOnBattlefield(s0, ap, okinec);
    const big = putOnBattlefield(s0, ap, bear());
    const plain = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, bear());
    s0.objects[big]!.counters["+1/+1"] = 2;
    s0.objects[theirs]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: ok, defender: opp }] });
    s = settle(s);
    expect(s.objects[big]!.counters["+1/+1"]).toBe(4);
    expect(s.objects[plain]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.objects[ok]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.objects[theirs]!.counters["+1/+1"]).toBe(1);
  });
});

const silverFur = card("Silver-Fur Master", "Creature — Rat Ninja", "{U}{B}", { power: "2", toughness: "2", keywords: ["Ninjutsu"], oracleText: "Ninjutsu {U}{B} ({U}{B}, Return an unblocked attacker you control to hand: Put this card onto the battlefield from your hand tapped and attacking.)\nNinjutsu abilities you activate cost {1} less to activate.\nOther Ninja and Rogue creatures you control get +1/+1." });
const infiltrator = card("Ingenious Infiltrator", "Creature — Vedalken Ninja", "{2}{U}{B}", { power: "2", toughness: "3", keywords: ["Ninjutsu"], oracleText: "Ninjutsu {U}{B} ({U}{B}, Return an unblocked attacker you control to hand: Put this card onto the battlefield from your hand tapped and attacking.)\nWhenever a Ninja you control deals combat damage to a player, draw a card." });
const rogue = card("Test Rogue", "Creature — Human Rogue", "{1}{B}", { power: "2", toughness: "2", oracleText: "" });

describe("Silver-Fur Master", () => {
  it("other Ninjas and Rogues get +1/+1 (a Ninja Rogue once); ninjutsu costs {1} less, only generic mana", () => {
    supported(silverFur, infiltrator);
    const { s: s0, ap, ids } = setup([infiltrator, silverFur]);
    const r = putOnBattlefield(s0, ap, rogue);
    const b = putOnBattlefield(s0, ap, bear());
    const ninjutsu = (s: GameState, id: string) => activationCost(s, ap, s.objects[id]!, abilitiesOf(s, s.objects[id]!).activated.find((a) => a.keyword === "Ninjutsu")!).symbols;
    const before = ninjutsu(s0, ids[0]!);
    const sf = putOnBattlefield(s0, ap, silverFur);
    invalidateCharacteristics(s0);
    expect(characteristics(s0, s0.objects[r]!).power).toBe(3);
    expect(characteristics(s0, s0.objects[b]!).power).toBe(2);
    expect(characteristics(s0, s0.objects[sf]!).power).toBe(2);
    // {U}{B} has no generic mana to take off.
    expect(ninjutsu(s0, ids[0]!)).toEqual(before);
    const pricey = card("Test Ninja", "Creature — Human Ninja", "{3}{U}", { power: "3", toughness: "3", keywords: ["Ninjutsu"], oracleText: "Ninjutsu {2}{U} ({2}{U}, Return an unblocked attacker you control to hand: Put this card onto the battlefield from your hand tapped and attacking.)" });
    const pn = toHand(s0, ap, pricey);
    expect(ninjutsu(s0, pn)).toEqual(expect.arrayContaining([{ kind: "generic", amount: 1 }]));
  });
});

const lumberjack = card("Orcish Lumberjack", "Creature — Orc", "{R}", { power: "1", toughness: "1", oracleText: "{T}, Sacrifice a Forest: Add three mana in any combination of {R} and/or {G}." });

describe("Orcish Lumberjack", () => {
  it("sacrifice a Forest: three mana, as much {R} and {G} as you choose", () => {
    supported(lumberjack);
    const { s: s0, ap } = setup([]);
    const lj = putOnBattlefield(s0, ap, lumberjack);
    const f = s0.battlefield.find((id) => s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.name === "Forest")!;
    invalidateCharacteristics(s0);
    const before = manaPool(s0, ap);
    let s = run(s0, planActivate(s0, ap, lj, 0, undefined, undefined, undefined, undefined, { sacrifice: [f] }));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "either" });
    s = act(s, { type: "chooseOption", player: ap, choice: "1" });
    expect(s.objects[f]!.zone).toBe("graveyard");
    expect(manaPool(s, ap).length - before.length).toBe(3);
    expect(s.players[ap]!.manaPool.R).toBe(1);
    expect(s.players[ap]!.manaPool.G).toBe(2);
  });
});

const winterMoon = card("Winter Moon", "Artifact", "{2}", { oracleText: "Players can't untap more than one nonbasic land during their untap steps." });
const winterOrb = card("Winter Orb", "Artifact", "{2}", { oracleText: "As long as this artifact is untapped, players can't untap more than one land during their untap steps." });
const staticOrb = card("Static Orb", "Artifact", "{3}", { oracleText: "As long as this artifact is untapped, players can't untap more than two permanents during their untap steps." });
const nonbasic = (n: number) => card(`Test Vale ${n}`, "Land", "", { oracleText: "{T}: Add {G}." });

describe("untap limits (Winter Moon, Winter Orb, Static Orb)", () => {
  const nextUntap = (s: GameState, pid: PlayerId) => {
    for (let i = 0; i < 2000 && !(s.pending?.kind === "pickPermanents" && s.pending.action === "untapLimited") && !(s.activePlayer === pid && s.step === "upkeep"); i++)
      s = s.pending ? botActions(s, s.pending.player).reduce((x, a) => act(x, a), s) : act(s, { type: "passPriority", player: waitingOn(s)! });
    return s;
  };

  it("Winter Moon: the active player untaps one nonbasic land of their choice; basics untap as usual", () => {
    supported(winterMoon, winterOrb, staticOrb);
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, winterMoon);
    const vales = [nonbasic(1), nonbasic(2), nonbasic(3)].map((d) => putOnBattlefield(s0, ap, d));
    for (const id of s0.battlefield) if (s0.objects[id]!.controller === ap) s0.objects[id]!.tapped = true;
    s0.objects[s0.battlefield.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Winter Moon")!]!.tapped = false;
    // Passed around to ap's next untap step, where it asks.
    let s = nextUntap(s0, ap);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "untapLimited", player: ap, what: "one nonbasic land" });
    expect([...(s.pending as { options: string[] }).options].sort()).toEqual([...vales].sort());
    expect(() => act(s, { type: "pickPermanents", player: ap, ids: vales.slice(0, 2) })).toThrow(/can't untap more than one nonbasic land/);
    expect(() => act(s, { type: "pickPermanents", player: ap, ids: [] })).toThrow(/can untap too/);
    s = act(s, { type: "pickPermanents", player: ap, ids: [vales[1]!] });
    expect(vales.map((id) => s.objects[id]!.tapped)).toEqual([true, false, true]);
    const basics = s.battlefield.filter((id) => s.objects[id]!.controller === ap && /Basic/.test(s.cards[s.objects[id]!.cardId]!.typeLine));
    expect(basics.every((id) => !s.objects[id]!.tapped)).toBe(true);
  });

  it("Winter Orb only while untapped (as the step begins); Static Orb's two permanents and Winter Orb's one land at once", () => {
    const { s: s0, ap } = setup([]);
    const orb = putOnBattlefield(s0, ap, winterOrb);
    for (const id of s0.battlefield) if (s0.objects[id]!.controller === ap) s0.objects[id]!.tapped = true;
    // Tapped: everything untaps (rulings).
    let s = nextUntap(s0, ap);
    expect(s.pending).toBeNull();
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap).every((id) => !s.objects[id]!.tapped)).toBe(true);
    // Untapped Winter Orb and Static Orb: two permanents, at most one a land; the bot keeps to both.
    const { s: t0, ap: bp } = setup([]);
    putOnBattlefield(t0, bp, winterOrb);
    putOnBattlefield(t0, bp, staticOrb);
    const b1 = putOnBattlefield(t0, bp, bear());
    for (const id of t0.battlefield) if (t0.objects[id]!.controller === bp && t0.cards[t0.objects[id]!.cardId]!.name !== "Winter Orb" && t0.cards[t0.objects[id]!.cardId]!.name !== "Static Orb") t0.objects[id]!.tapped = true;
    let t = nextUntap(t0, bp);
    expect(t.pending).toMatchObject({ action: "untapLimited" });
    expect((t.pending as { what: string }).what.split(" and ").sort()).toEqual(["one land", "two permanents"]);
    const pick = botActions(t, bp);
    t = pick.reduce((x, a) => act(x, a), t);
    const untapped = t.battlefield.filter((id) => t.objects[id]!.controller === bp && !t.objects[id]!.tapped && !/Orb/.test(t.cards[t.objects[id]!.cardId]!.name));
    expect(untapped.length).toBe(2);
    expect(untapped.filter((id) => /Land/.test(t.cards[t.objects[id]!.cardId]!.typeLine)).length).toBe(1);
    expect(untapped).toContain(b1);
    expect(s.objects[orb]!.tapped).toBe(false);
  });
});
