// Lane B round B163: a Words' shield that deals damage to a target chosen as it's activated (Words of War; CR 115.1c,
// 608.2b, 614.6, 614.11), control for as long as ~ stays tapped and the creature's power stays no greater than ~'s
// (Old Man of the Sea; CR 611.2b, rulings), a permanent giving itself to an opponent (Sol'Kanar the Tainted; CR 400.7,
// 110.2a), becoming saddled for the first time each turn (Stubborn Burrowfiend; CR 702.171b), "If it was kicked, choose
// both instead" on a cast trigger (Depth Defiler; CR 603.3c, 702.33d), and permanents that transform or enter
// transformed (Corruption of Towashi; CR 701.27a, 712.14a, 603.2h).

import { describe, expect, it } from "vitest";
import { act, bear, passAll, passUntil, putOnBattlefield, scry, setup } from "./helpers";
import { botActions, controllerOf, draw, isFullySupported, planActivate, planCast, power, runStateBasedActions, untapPermanent, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const wordsOfWar = (): CardDef => ({"oracleId":"76d6d4cc-607f-4a33-a964-a38b5dbfe710","name":"Words of War","manaCost":"{2}{R}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"{1}: The next time you would draw a card this turn, this enchantment deals 2 damage to any target instead.","colors":["R"],"colorIdentity":["R"],"keywords":[]});
const oldMan = (): CardDef => ({"oracleId":"cce84cf1-5574-43b0-9d75-72e6451403a7","name":"Old Man of the Sea","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Creature — Djinn","supertypes":[],"types":["Creature"],"subtypes":["Djinn"],"oracleText":"You may choose not to untap this creature during your untap step.\n{T}: Gain control of target creature with power less than or equal to this creature's power for as long as this creature remains tapped and that creature's power remains less than or equal to this creature's power.","power":"2","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":[]});
const solKanar = (): CardDef => ({"oracleId":"4efcdefc-e49d-4bce-8581-69037bb48c0a","name":"Sol'Kanar the Tainted","manaCost":"{2}{U}{B}{R}","cmc":5,"typeLine":"Legendary Creature — Elemental Demon","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elemental","Demon"],"oracleText":"At the beginning of your end step, choose one that hasn't been chosen —\n• Draw a card.\n• Each opponent loses 2 life and you gain 2 life.\n• Sol'Kanar deals 3 damage to up to one other target creature or planeswalker.\n• Exile Sol'Kanar, then return it to the battlefield under an opponent's control.","power":"5","toughness":"5","colors":["B","R","U"],"colorIdentity":["B","R","U"],"keywords":[]});
const burrowfiend = (): CardDef => ({"oracleId":"24bc7bd5-f262-45a2-8e94-377fef2ba5d5","name":"Stubborn Burrowfiend","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Badger Beast Mount","supertypes":[],"types":["Creature"],"subtypes":["Badger","Beast","Mount"],"oracleText":"Whenever this creature becomes saddled for the first time each turn, mill two cards, then this creature gets +X/+X until end of turn, where X is the number of creature cards in your graveyard.\nSaddle 2 (Tap any number of other creatures you control with total power 2 or more: This Mount becomes saddled until end of turn. Saddle only as a sorcery.)","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":["Saddle","Mill"]});
const depthDefiler = (): CardDef => ({"oracleId":"8ca4ca66-30b1-4074-a2e3-545b7682381b","name":"Depth Defiler","manaCost":"{3}{U}{U}","cmc":5,"typeLine":"Creature — Eldrazi","supertypes":[],"types":["Creature"],"subtypes":["Eldrazi"],"oracleText":"Devoid (This card has no color.)\nKicker {C} (You may pay an additional {C} as you cast this spell.)\nWhen you cast this spell, choose one. If it was kicked, choose both instead.\n• Return target creature to its owner's hand.\n• Target player draws two cards, then discards a card.","power":"3","toughness":"5","colors":[],"colorIdentity":["U"],"keywords":["Devoid","Kicker"]});
const corruption = (): CardDef => ({"oracleId":"242c39b4-5ef0-469a-a852-738f79d93bd6","name":"Corruption of Towashi","manaCost":"{4}{U}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, incubate 4. (Create an Incubator token with four +1/+1 counters on it and \"{2}: Transform this token.\" It transforms into a 0/0 Phyrexian artifact creature.)\nWhenever a permanent you control transforms or a permanent you control enters transformed, you may draw a card. Do this only once each turn.","colors":["U"],"colorIdentity":["U"],"keywords":["Incubate","Transform"]});
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[]});
const giantGrowth = (): CardDef => ({"oracleId":"5748ebf1-24e3-499d-ab7c-c2cebd462a24","name":"Giant Growth","manaCost":"{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature gets +3/+3 until end of turn.","colors":["G"],"colorIdentity":["G"],"keywords":[]});
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[]});

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const tgt = (id: string): TargetChoice => ({ kind: "object", id }) as TargetChoice;
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const inZone = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  (zone === "hand" ? s.players[pid]!.hand : zone === "library" ? s.players[pid]!.library : s.players[pid]!.graveyard).unshift(id);
  return id;
};

describe("Words of War: the next draw this turn deals 2 damage to a target chosen as it's activated", () => {
  it("compiles", () => supported(wordsOfWar()));

  it("the draw is replaced: no card is drawn, and the creature targeted as it was activated is dealt 2 damage", () => {
    const { s: s0, ap, opp } = setup([]);
    const words = putOnBattlefield(s0, ap, wordsOfWar());
    const victim = putOnBattlefield(s0, opp, bear());
    let s = settle(run(s0, planActivate(s0, ap, words, 0, [tgt(victim)])));
    expect(s.players[ap]!.nextDrawInstead).toHaveLength(1);
    // Nothing happens until the draw.
    expect(s.objects[victim]!.zone).toBe("battlefield");
    const hand = s.players[ap]!.hand.length;
    const top = s.players[ap]!.library[0]!;
    draw(s, ap, 1);
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.objects[top]!.zone).toBe("library");
    expect(s.objects[victim]!.damage).toBe(2);
    runStateBasedActions(s);
    expect(s.objects[victim]!.zone).toBe("graveyard");
    expect(s.players[ap]!.nextDrawInstead).toBeUndefined();
  });

  it("a player target; only the next draw is replaced, the second card of two is drawn (CR 614.11a)", () => {
    const { s: s0, ap, opp } = setup([]);
    const words = putOnBattlefield(s0, ap, wordsOfWar());
    let s = settle(run(s0, planActivate(s0, ap, words, 0, [{ kind: "player", id: opp }])));
    const life = s.players[opp]!.life;
    const hand = s.players[ap]!.hand.length;
    draw(s, ap, 2);
    s = settle(s);
    expect(s.players[opp]!.life).toBe(life - 2);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("a target that has left the battlefield still uses the shield up: nothing is drawn and no damage is dealt", () => {
    const { s: s0, ap, opp } = setup([]);
    const words = putOnBattlefield(s0, ap, wordsOfWar());
    const victim = putOnBattlefield(s0, opp, bear());
    let s = settle(run(s0, planActivate(s0, ap, words, 0, [tgt(victim)])));
    // The bear leaves and comes back: a new object (CR 400.7), not the target.
    s.battlefield.splice(s.battlefield.indexOf(victim), 1);
    s.objects[victim]!.zone = "graveyard";
    s.objects[victim]!.zoneChanges = (s.objects[victim]!.zoneChanges ?? 0) + 1;
    s.players[opp]!.graveyard.push(victim);
    const hand = s.players[ap]!.hand.length;
    draw(s, ap, 1);
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.players[ap]!.nextDrawInstead).toBeUndefined();
    expect(s.log.some((l) => /its target is gone/.test(l.text))).toBe(true);
  });

  it("with the Words gone, the shield still deals the damage, from the Words as it last existed", () => {
    const { s: s0, ap, opp } = setup([]);
    const words = putOnBattlefield(s0, ap, wordsOfWar());
    let s = settle(run(s0, planActivate(s0, ap, words, 0, [{ kind: "player", id: opp }])));
    // Destroy the Words: its shield is a resolved ability's effect (CR 610.1), which stays.
    s.battlefield.splice(s.battlefield.indexOf(words), 1);
    s.objects[words]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(words);
    const life = s.players[opp]!.life;
    draw(s, ap, 1);
    s = settle(s);
    expect(s.players[opp]!.life).toBe(life - 2);
  });

  it("two shields with different targets: the drawing player chooses which applies (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const words = putOnBattlefield(s0, ap, wordsOfWar());
    const victim = putOnBattlefield(s0, opp, bear());
    let s = settle(run(s0, planActivate(s0, ap, words, 0, [tgt(victim)])));
    s = settle(run(s, planActivate(s, ap, words, 0, [{ kind: "player", id: opp }])));
    expect(s.players[ap]!.nextDrawInstead).toHaveLength(2);
    draw(s, ap, 1);
    expect(s.pending).toMatchObject({ kind: "drawInstead", player: ap });
    const pend = s.pending as { options: string[]; labels: string[] };
    expect(pend.labels.some((l) => l.includes("Grizzly Bears"))).toBe(true);
    expect(pend.labels.some((l) => l.includes(s.players[opp]!.name))).toBe(true);
    const life = s.players[opp]!.life;
    s = act(s, { type: "drawInstead", player: ap, choice: pend.options[pend.labels.findIndex((l) => l.includes(s.players[opp]!.name))]! });
    s = settle(s);
    expect(s.players[opp]!.life).toBe(life - 2);
    expect(s.objects[victim]!.zone).toBe("battlefield");
    expect(s.players[ap]!.nextDrawInstead).toHaveLength(1);
  });
});

describe("Old Man of the Sea: for as long as ~ remains tapped and that creature's power remains no greater than ~'s", () => {
  it("compiles", () => supported(oldMan()));

  it("gains control of a creature with power no greater than its own; loses it once that creature's power is greater", () => {
    const { s: s0, ap, opp, ids } = setup([giantGrowth()]);
    const man = putOnBattlefield(s0, ap, oldMan());
    const victim = putOnBattlefield(s0, opp, bear());
    let s = settle(run(s0, planActivate(s0, ap, man, 0, [tgt(victim)])));
    expect(controllerOf(s, s.objects[victim]!)).toBe(ap);
    // Giant Growth: 5/5, more than Old Man's 2: the effect ends (CR 611.2b), and its owner gets it back.
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(victim)])));
    expect(power(s, s.objects[victim]!)).toBe(5);
    expect(controllerOf(s, s.objects[victim]!)).toBe(opp);
    expect(s.effects.some((e) => e.powerAtMost)).toBe(false);
  });

  it("Old Man's own power going up keeps the control; untapping it ends it", () => {
    const { s: s0, ap, opp, ids } = setup([giantGrowth()]);
    const man = putOnBattlefield(s0, ap, oldMan());
    const victim = putOnBattlefield(s0, opp, bear());
    let s = settle(run(s0, planActivate(s0, ap, man, 0, [tgt(victim)])));
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(man)])));
    expect(controllerOf(s, s.objects[victim]!)).toBe(ap);
    untapPermanent(s, s.objects[man]!);
    runStateBasedActions(s);
    expect(controllerOf(s, s.objects[victim]!)).toBe(opp);
  });

  it("a target whose power became greater before the ability resolves is illegal: no control (rulings, CR 608.2b)", () => {
    const { s: s0, ap, opp, ids } = setup([giantGrowth()]);
    const man = putOnBattlefield(s0, ap, oldMan());
    const victim = putOnBattlefield(s0, opp, bear());
    let s = run(s0, planActivate(s0, ap, man, 0, [tgt(victim)]));
    s = run(s, planCast(s, ap, ids[0]!, [tgt(victim)]));
    s = settle(s);
    expect(controllerOf(s, s.objects[victim]!)).toBe(opp);
  });

  it("a creature that stops being a creature counts as power 0 and stays (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const man = putOnBattlefield(s0, ap, oldMan());
    const victim = putOnBattlefield(s0, opp, bear());
    let s = settle(run(s0, planActivate(s0, ap, man, 0, [tgt(victim)])));
    // It becomes a noncreature artifact with power 9 printed on nothing: its power is 0 for Old Man (rulings).
    s.effects.push({ id: "x1", timestamp: s.nextTimestamp++, controller: opp, sourceName: "test", duration: "endOfTurn", affected: [victim], mods: [{ kind: "setTypes", types: ["Artifact"], subtypes: [] } as never, { kind: "setPT", power: 9, toughness: 9 } as never] });
    runStateBasedActions(s);
    expect(controllerOf(s, s.objects[victim]!)).toBe(ap);
  });
});

/** Pass priority (bots answering their own questions) until `pid` has a question to answer. */
function untilAsked(s: GameState, pid: PlayerId, max = 600): GameState {
  for (let i = 0; i < max; i++) {
    if (s.pending?.player === pid && s.pending.kind !== "declareAttackers" && s.pending.kind !== "discardToHandSize") return s;
    const who = waitingOn(s)!;
    if (s.pending && who !== pid) for (const a of botActions(s, who)) s = act(s, a);
    else if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: who, attacks: [] });
    else if (s.pending?.kind === "discardToHandSize") s = act(s, { type: "discard", player: who, objectIds: s.players[who]!.hand.slice(0, s.pending.count) });
    else s = act(s, { type: "passPriority", player: who });
  }
  throw new Error("no question came up");
}

/** Everyone passes until the stack is empty, the bots answering every question. */
const botsSettle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const who = waitingOn(s)!;
    if (s.pending) for (const a of botActions(s, who)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: who });
  }
  return s;
};

describe("Sol'Kanar the Tainted: exile ~, then return it to the battlefield under an opponent's control", () => {
  it("compiles", () => supported(solKanar()));

  it("the last mode: you choose an opponent, and ~ comes back under their control as a new object whose modes start over", () => {
    const { s: s0, ap, opp } = setup([]);
    s0.players[ap]!.hand = [];
    const sol = putOnBattlefield(s0, ap, solKanar());
    let s = passUntil(s0, "end", ap);
    s = untilAsked(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseModes", legal: [true, true, true, true] });
    s = act(s, { type: "chooseModes", player: ap, modes: [3] });
    s = untilAsked(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "opponent" });
    expect((s.pending as { options: string[] }).options).not.toContain(String(ap));
    s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
    s = settle(s);
    expect(s.objects[sol]!.zone).toBe("battlefield");
    expect(controllerOf(s, s.objects[sol]!)).toBe(opp);
    expect(s.objects[sol]!.owner).toBe(ap);
    expect(s.objects[sol]!.modesChosen).toBeUndefined();
  });

  it("each mode once for an object (rulings); the bot gives it away only when nothing else is left", () => {
    const { s: s0, ap, opp } = setup([]);
    // The bot's own Sol'Kanar, with three modes already chosen for it.
    const sol = putOnBattlefield(s0, opp, solKanar());
    let s = botsSettle(passUntil(s0, "end", opp));
    expect(controllerOf(s, s.objects[sol]!)).toBe(opp);
    const first = Object.values(s.objects[sol]!.modesChosen ?? {})[0]!.modes;
    expect(first).toHaveLength(1);
    expect(first).not.toContain(3);
    s.objects[sol]!.modesChosen = { [Object.keys(s.objects[sol]!.modesChosen!)[0]!]: { modes: [0, 1, 2], turn: s.turn } };
    s = botsSettle(passUntil(passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(opp) + 1) % 4]!), "end", opp));
    expect(s.objects[sol]!.zone).toBe("battlefield");
    expect(controllerOf(s, s.objects[sol]!)).not.toBe(opp);
  });
});

describe("Stubborn Burrowfiend: whenever ~ becomes saddled for the first time each turn", () => {
  it("compiles", () => supported(burrowfiend()));

  it("the first saddle this turn mills two and pumps by the creature cards in the graveyard; a second saddle doesn't trigger", () => {
    const { s: s0, ap } = setup([]);
    const fiend = putOnBattlefield(s0, ap, burrowfiend());
    const riderA = putOnBattlefield(s0, ap, bear());
    const riderB = putOnBattlefield(s0, ap, bear({ name: "Runeclaw Bear" }));
    inZone(s0, ap, bear(), "library");
    inZone(s0, ap, bear(), "library");
    const yard = s0.players[ap]!.graveyard.length;
    const base = power(s0, s0.objects[fiend]!);
    let s = settle(run(s0, planActivate(s0, ap, fiend, 0, undefined, undefined, [riderA])));
    expect(s.objects[fiend]!.saddled).toBe(true);
    expect(s.players[ap]!.graveyard.length).toBe(yard + 2);
    expect(power(s, s.objects[fiend]!)).toBe(base + 2);
    // Saddled again this turn (rulings: allowed while saddled): it becomes saddled again, but not for the first time.
    s = settle(run(s, planActivate(s, ap, fiend, 0, undefined, undefined, [riderB])));
    expect(s.objects[riderB]!.tapped).toBe(true);
    expect(s.players[ap]!.graveyard.length).toBe(yard + 2);
    expect(power(s, s.objects[fiend]!)).toBe(base + 2);
  });
});

describe("Depth Defiler: when you cast ~, choose one; if it was kicked, choose both instead", () => {
  it("compiles", () => supported(depthDefiler()));

  it("not kicked: one mode", () => {
    const { s: s0, ap, opp, ids } = setup([depthDefiler()]);
    const victim = putOnBattlefield(s0, opp, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = untilAsked(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseModes", min: 1, max: 1 });
    expect(() => act(s, { type: "chooseModes", player: ap, modes: [0, 1] })).toThrow();
    s = act(s, { type: "chooseModes", player: ap, modes: [0] });
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(victim)] });
    s = settle(s);
    expect(s.objects[victim]!.zone).toBe("hand");
  });

  it("kicked with {C}: both modes, in the order printed (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([depthDefiler()]);
    s0.players[ap]!.manaPool.C = 1;
    const victim = putOnBattlefield(s0, opp, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { kicks: [0] }));
    expect(s.objects[ids[0]!]!.kicked).toEqual([0]);
    s = untilAsked(s, ap);
    // Both modes, so only their targets are asked for.
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    expect((s.pending as { specs: unknown[] }).specs).toHaveLength(2);
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(victim), { kind: "player", id: ap }] });
    const hand = s.players[ap]!.hand.length;
    s = untilAsked(s, ap);
    expect(s.objects[victim]!.zone).toBe("hand");
    expect(s.pending).toMatchObject({ kind: "discard", player: ap });
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });
});

// Real oracle text (Scryfall), as in face-gaps.test.ts.
const gargoyle = () =>
  scry(
    "transform",
    [
      { name: "Thraben Gargoyle", mana_cost: "{1}", type_line: "Artifact Creature — Gargoyle", oracle_text: "Defender\n{6}: Transform this creature.", power: "2", toughness: "2" },
      { name: "Stonewing Antagonizer", type_line: "Artifact Creature — Gargoyle Horror", oracle_text: "Flying", power: "4", toughness: "2" },
    ],
    { keywords: ["Flying", "Transform", "Defender"] },
  );
const beggar = () =>
  scry(
    "transform",
    [
      { name: "Beloved Beggar", mana_cost: "{1}{W}", type_line: "Creature — Human Peasant", oracle_text: "Disturb {4}{W}{W} (You may cast this card from your graveyard transformed for its disturb cost.)", power: "0", toughness: "4" },
      { name: "Generous Soul", type_line: "Creature — Spirit", oracle_text: "Flying, vigilance\nIf Generous Soul would be put into a graveyard from anywhere, exile it instead.", power: "4", toughness: "4" },
    ],
    { keywords: ["Flying", "Vigilance", "Transform", "Disturb"] },
  );
const cleric = () =>
  scry("modal_dfc", [
    { name: "Skyclave Cleric", mana_cost: "{1}{W}", type_line: "Creature — Kor Cleric", oracle_text: "When this creature enters, you gain 2 life.", power: "1", toughness: "3" },
    { name: "Skyclave Basilica", type_line: "Land", oracle_text: "This land enters tapped.\n{T}: Add {W}." },
  ]);

describe("Corruption of Towashi: whenever a permanent you control transforms or enters transformed, you may draw (once each turn)", () => {
  it("compiles", () => supported(corruption(), gargoyle(), beggar()));

  it("its Incubator transforming triggers it; once you draw, no more this turn (CR 603.2h)", () => {
    const { s: s0, ap, ids } = setup([corruption()]);
    const garg = putOnBattlefield(s0, ap, gargoyle());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const incubator = s.battlefield.find((id) => s.objects[id]!.isToken && s.cards[s.objects[id]!.cardId]!.name.startsWith("Incubator"))!;
    expect(incubator).toBeTruthy();
    s = run(s, planActivate(s, ap, incubator, 0));
    s = untilAsked(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    // The Gargoyle transforms too: no trigger, the draw was done this turn.
    s = settle(run(s, planActivate(s, ap, garg, 0)));
    expect(s.objects[garg]!.face).toBe(1);
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("declining doesn't count: the next transform triggers it again", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, corruption());
    const garg = putOnBattlefield(s0, ap, gargoyle());
    s0.players[ap]!.manaPool.C = 12;
    let s = run(s0, planActivate(s0, ap, garg, 0));
    s = untilAsked(s, ap);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    // Its back face can't transform by itself: put the Gargoyle back front face up as a new one to transform again.
    const garg2 = putOnBattlefield(s, ap, gargoyle());
    s = run(s, planActivate(s, ap, garg2, 0));
    s = untilAsked(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
  });

  it("a transforming double-faced card entering with its back face up (disturb) triggers it; a modal double-faced card's back face doesn't", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, corruption());
    const b = inZone(s0, ap, beggar(), "graveyard");
    const c = inZone(s0, ap, cleric(), "hand");
    let s = run(s0, planCast(s0, ap, b, undefined, undefined, "auto", undefined, { face: 1, via: "disturb" }));
    s = untilAsked(s, ap);
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[b]!.face).toBe(1);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    s = settle(act(s, { type: "playLand", player: ap, objectId: c, face: 1 }));
    expect(s.objects[c]!.zone).toBe("battlefield");
    expect(s.pending).toBeNull();
  });
});
