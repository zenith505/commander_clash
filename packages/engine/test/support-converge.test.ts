// Support (CR 701.41), converge (CR 207.2c) and "put them back in any order".

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup, target } from "./helpers";
import { botActions, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, actions: Action[] | null) => {
  if (!actions) throw new Error("no plan");
  return actions.reduce((x, a) => act(x, a), s);
};
const castNow = (s: GameState, pid: PlayerId, id: string, targets?: TargetChoice[]) => run(s, planCast(s, pid, id, targets, undefined, "auto"));
const pickTriggerTargets = (s: GameState, targets: TargetChoice[]) => {
  if (s.pending?.kind !== "chooseTargets") return s;
  return act(s, { type: "chooseTargets", player: s.pending.player, targets });
};

// Real oracle text (Scryfall).
const expeditionRaptor = card("Expedition Raptor", "Creature — Bird", "{3}{W}{W}", { power: "2", toughness: "2", keywords: ["Flying", "Support"], oracleText: "Flying\nWhen this creature enters, support 2. (Put a +1/+1 counter on each of up to two other target creatures.)" });
const leadByExample = card("Lead by Example", "Instant", "{1}{G}", { keywords: ["Support"], oracleText: "Support 2. (Put a +1/+1 counter on each of up to two target creatures.)" });
const joragaAuxiliary = card("Joraga Auxiliary", "Creature — Elf Soldier Ally", "{1}{G}{W}", { power: "2", toughness: "3", keywords: ["Support"], oracleText: "{4}{G}{W}: Support 2. (Put a +1/+1 counter on each of up to two other target creatures.)" });
const jubilantMascot = card("Jubilant Mascot", "Creature — Homunculus", "{2}{W}", { power: "1", toughness: "1", keywords: ["Support"], oracleText: "At the beginning of combat on your turn, you may pay {3}{W}. If you do, support 2. (Put a +1/+1 counter on each of up to two other target creatures.)" });
const crowdGoesWild = card("The Crowd Goes Wild", "Sorcery", "{X}{G}", { keywords: ["Support", "Assist"], oracleText: "Assist (Another player can pay up to {X} of this spell's cost. You choose the value of X.)\nSupport X. (Put a +1/+1 counter on each of up to X target creatures.)\nEach creature with a +1/+1 counter on it gains trample until end of turn." });

const unifiedFront = card("Unified Front", "Sorcery", "{3}{W}", { keywords: ["Converge"], oracleText: "Converge — Create a 1/1 white Kor Ally creature token for each color of mana spent to cast this spell." });
const brilliantSpectrum = card("Brilliant Spectrum", "Sorcery", "{3}{U}", { keywords: ["Converge"], oracleText: "Converge — Draw X cards, where X is the number of colors of mana spent to cast this spell. Then discard two cards." });
const tajuruStalwart = card("Tajuru Stalwart", "Creature — Elf Scout Ally", "{2}{G}", { power: "0", toughness: "1", keywords: ["Converge"], oracleText: "Converge — This creature enters with a +1/+1 counter on it for each color of mana spent to cast it." });
const radiantEpicure = card("Radiant Epicure", "Creature — Vampire Wizard", "{4}{B}", { power: "5", toughness: "5", keywords: ["Converge"], oracleText: "Converge — When this creature enters, each opponent loses X life and you gain X life, where X is the number of colors of mana spent to cast this spell." });
const magmabloodArchaic = card("Magmablood Archaic", "Creature — Avatar", "{2/R}{2/R}{2/R}", { power: "2", toughness: "2", keywords: ["Reach", "Converge", "Trample"], oracleText: "Reach, trample\nConverge — This creature enters with a +1/+1 counter on it for each color of mana spent to cast it.\nWhenever you cast an instant or sorcery spell, creatures you control get +1/+0 until end of turn for each color of mana spent to cast that spell." });

const index = card("Index", "Sorcery", "{U}", { oracleText: "Look at the top five cards of your library, then put them back in any order." });
const omen = card("Omen", "Sorcery", "{1}{U}", { oracleText: "Look at the top three cards of your library, then put them back in any order. You may shuffle.\nDraw a card." });
const architects = card("Architects of Will", "Artifact Creature — Human Wizard", "{2}{U}{B}", { power: "3", toughness: "3", keywords: ["Cycling"], oracleText: "When this creature enters, look at the top three cards of target player's library, then put them back in any order.\nCycling {U/B} ({U/B}, Discard this card: Draw a card.)" });

describe("support", () => {
  it("puts a +1/+1 counter on each of up to N other target creatures; never the permanent itself (CR 701.41a)", () => {
    supported(expeditionRaptor, joragaAuxiliary, jubilantMascot);
    const { s: s0, ap, ids, opp } = setup([expeditionRaptor]);
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, bear());
    let s = castNow(s0, ap, ids[0]!);
    s = settle(s);
    if (s.pending?.kind === "chooseTargets") {
      // It can't target itself ("other").
      expect(() => act(s, { type: "chooseTargets", player: ap, targets: [target(ids[0]!), target(mine)] })).toThrow();
      s = pickTriggerTargets(s, [target(mine), target(theirs)]);
    }
    s = settle(s);
    expect(s.objects[mine]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[theirs]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBeUndefined();
  });

  it("on an instant, any target creatures (CR 701.41a); support X on a sorcery since Lane B round B157", () => {
    supported(leadByExample);
    // The Crowd Goes Wild: up to the spell's X targets (laneb-round157.test.ts).
    expect(isFullySupported(crowdGoesWild)).toBe(true);
    const { s: s0, ap, ids } = setup([leadByExample]);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear());
    const s = settle(castNow(s0, ap, ids[0]!, [target(a), target(b)]));
    expect(s.objects[a]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
  });
});

describe("converge", () => {
  it("counts the colors of mana spent to cast the spell (CR 207.2c); the auto-payer spends as many colors as it can", () => {
    supported(unifiedFront, brilliantSpectrum, tajuruStalwart, radiantEpicure);
    const { s: s0, ap, ids } = setup([unifiedFront, brilliantSpectrum]);
    const tokens = (s: GameState) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap).length;
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(tokens(s)).toBe(4);
    const hand = s.players[ap]!.hand.length;
    s = settle(castNow(s, ap, ids[1]!));
    if (s.pending?.kind === "discard") s = run(s, botActions(s, ap));
    // Four colors: draw four, discard two.
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 4 - 2);
  });

  it("a permanent's own: enters with counters, and an enters trigger uses the colors spent on the spell it was", () => {
    const { s: s0, ap, ids, opp } = setup([tajuruStalwart, radiantEpicure]);
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(3);
    const before = s.players[opp]!.life;
    const life = s.players[ap]!.life;
    s = settle(castNow(s, ap, ids[1]!));
    expect(s.players[opp]!.life).toBe(before - 5);
    expect(s.players[ap]!.life).toBe(life + 5);
  });

  it("put onto the battlefield without being cast, no mana was spent: 0", () => {
    const { s, ap } = setup([]);
    const id = putOnBattlefield(s, ap, tajuruStalwart);
    expect(s.objects[id]!.counters["+1/+1"]).toBeUndefined();
  });

  it("'that spell' in a cast trigger is the spell cast, counted as it was cast (Lane B round B157)", () => {
    // Magmablood Archaic: laneb-round157.test.ts.
    expect(isFullySupported(magmabloodArchaic)).toBe(true);
  });
});

describe("put them back in any order", () => {
  it("the player looking orders the top cards of their library", () => {
    supported(index, omen, architects);
    const { s: s0, ap, ids } = setup([index]);
    const top = s0.players[ap]!.library.slice(0, 5);
    let s = castNow(s0, ap, ids[0]!);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "arrangeTop", how: "order", player: ap, cards: top });
    // Nothing may go to the bottom.
    expect(() => act(s, { type: "arrangeTop", player: ap, top: top.slice(1), away: [top[0]!] })).toThrow();
    const order = [...top].reverse();
    s = act(s, { type: "arrangeTop", player: ap, top: order, away: [] });
    expect(s.players[ap]!.library.slice(0, 5)).toEqual(order);
  });

  it("another player's library: the ability's controller orders them; the bot answers too", () => {
    const { s: s0, ap, ids, opp } = setup([architects]);
    const top = s0.players[opp]!.library.slice(0, 3);
    let s = castNow(s0, ap, ids[0]!);
    s = settle(s);
    s = pickTriggerTargets(s, [{ kind: "player", id: opp }]);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "arrangeTop", how: "order", player: ap, owner: opp });
    const bot = botActions(s, ap);
    expect(bot[0]).toMatchObject({ type: "arrangeTop", away: [] });
    s = run(s, bot);
    expect([...s.players[opp]!.library.slice(0, 3)].sort()).toEqual([...top].sort());
  });

  it("Omen: then you may shuffle, then draw", () => {
    const { s: s0, ap, ids } = setup([omen]);
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(s.pending?.kind).toBe("arrangeTop");
    s = run(s, botActions(s, ap));
    expect(s.pending?.kind).toBe("chooseMay");
    const hand = s.players[ap]!.hand.length;
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.log.some((e) => /shuffles their library/.test(e.text))).toBe(true);
  });
});
