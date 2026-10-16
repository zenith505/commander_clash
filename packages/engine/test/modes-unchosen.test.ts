// "Choose one that hasn't been chosen" (Demonic Pact), "... this turn" (Gala Greeters, Three Bowls of Porridge), and
// "choose one at random" (Umaro): modes chosen as the ability is put on the stack or activated (CR 700.2a-b, 603.3c).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passAll, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { botActions, compileCard, isFullySupported, legalModes, moveObject, planActivate, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const pact = card("Demonic Pact", "Enchantment", "{2}{B}{B}", { oracleText: "At the beginning of your upkeep, choose one that hasn't been chosen —\n• This enchantment deals 4 damage to any target and you gain 4 life.\n• Target opponent discards two cards.\n• Draw two cards.\n• You lose the game." });
const gala = card("Gala Greeters", "Creature — Elf Druid", "{1}{G}", { power: "1", toughness: "1", keywords: ["Alliance", "Treasure"], oracleText: "Alliance — Whenever another creature you control enters, choose one that hasn't been chosen this turn —\n• Put a +1/+1 counter on this creature.\n• Create a tapped Treasure token.\n• You gain 2 life." });
const bowls = card("Three Bowls of Porridge", "Artifact — Food", "{2}", { oracleText: "{2}, {T}: Choose one that hasn't been chosen —\n• This artifact deals 2 damage to target creature.\n• Tap target creature.\n• Sacrifice this artifact. You gain 3 life." });
const lita = card("Lita, Little Orphan Amphibian", "Legendary Creature — Mutant Ninja Turtle", "{1}{W}", { power: "2", toughness: "1", keywords: ["Alliance", "Food", "Scry"], oracleText: "Alliance — Whenever another creature you control enters, choose one that hasn't been chosen this turn.\n• Put a +1/+1 counter on Lita.\n• Create a Food token. (It's an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")\n• Scry 1." });
const kimoyo = card("Kimoyo Beads", "Artifact", "{4}", { keywords: ["AV Bead", "Prime Bead", "Communication Bead"], oracleText: "At the beginning of your end step, choose one that hasn't been chosen —\n• AV Bead — Draw a card.\n• Communication Bead — Create two 1/1 white Soldier creature tokens.\n• Prime Bead — You gain 3 life. Exile this artifact, then return it to the battlefield under its owner's control." });
const monument = card("Monument to Endurance", "Artifact", "{3}", { keywords: ["Treasure"], oracleText: "Whenever you discard a card, choose one that hasn't been chosen this turn —\n• Draw a card.\n• Create a Treasure token.\n• Each opponent loses 3 life." });
const vision = card("The Vision", "Legendary Artifact Creature — Robot Hero", "{4}", { power: "2", toughness: "5", keywords: ["Density Control", "Flying", "Vigilance", "Technopathy", "Solar Beam"], oracleText: "Flying, vigilance\nWhenever you cast a noncreature spell, choose one that hasn't been chosen this turn —\n• Solar Beam — The Vision gains double strike until end of turn.\n• Density Control — The Vision gains indestructible until end of turn.\n• Technopathy — Draw a card." });
const hallcreeper = card("Silent Hallcreeper", "Enchantment Creature — Horror", "{1}{U}", { power: "1", toughness: "1", oracleText: "This creature can't be blocked.\nWhenever this creature deals combat damage to a player, choose one that hasn't been chosen —\n• Put two +1/+1 counters on this creature.\n• Draw a card.\n• This creature becomes a copy of another target creature you control." });
const galadriel = card("Galadriel, Light of Valinor", "Legendary Creature — Elf Noble", "{2}{G}{W}{U}", { power: "3", toughness: "3", keywords: ["Alliance", "Scry"], oracleText: "Alliance — Whenever another creature you control enters, choose one that hasn't been chosen this turn —\n• Add {G}{G}{G}.\n• Put a +1/+1 counter on each creature you control.\n• Scry 2, then draw a card." });
const umaro = card("Umaro, Raging Yeti", "Legendary Creature — Yeti Berserker", "{5}{R}", { power: "6", toughness: "6", keywords: ["Trample"], oracleText: "Trample\nAt the beginning of combat on your turn, choose one at random —\n• Other creatures you control get +3/+0 and gain trample until end of turn.\n• Discard your hand, then draw four cards.\n• Umaro deals 5 damage to any target." });
const skaro = card("Cult of Skaro", "Legendary Artifact Creature — Dalek", "{1}{U}{B}{R}", { power: "4", toughness: "4", keywords: ["Sec", "Caan", "Jast", "Thay"], oracleText: "Whenever Cult of Skaro attacks, choose one at random —\n• Thay — Put a +1/+1 counter on each artifact creature you control.\n• Caan — Draw two cards.\n• Sec — Create a 3/3 black Dalek artifact creature token with menace.\n• Jast — Each opponent loses 4 life." });
const sisters = card("Summon: Magus Sisters", "Enchantment Creature — Saga Faerie", "{4}{G}", { power: "5", toughness: "5", keywords: ["Combine Powers!", "Haste", "Fight", "Defense!"], oracleText: "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI, II, III — Choose one at random —\n• Combine Powers! — Put three +1/+1 counters on target creature.\n• Defense! — Put a shield counter on target creature. You gain 3 life.\n• Fight! — This creature fights up to one target creature an opponent controls.\nHaste" });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

/** Pass priority until `pid` has a decision to make or the turn reaches `step` of `pid`'s next turn. */
function untilChoice(s: GameState, pid: PlayerId, max = 400): GameState {
  for (let i = 0; i < max; i++) {
    if (s.pending?.player === pid && (s.pending.kind === "chooseModes" || s.pending.kind === "chooseTargets")) return s;
    const who = waitingOn(s)!;
    if (s.pending && who !== pid) for (const a of botActions(s, who)) s = act(s, a);
    else if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: who, attacks: [] });
    else if (s.pending?.kind === "discardToHandSize") s = act(s, { type: "discard", player: who, objectIds: s.players[who]!.hand.slice(0, s.pending.count) });
    else s = act(s, { type: "passPriority", player: who });
  }
  throw new Error("no choice came up");
}

describe("choose one that hasn't been chosen", () => {
  it("parses these abilities", () => {
    supported(pact, gala, bowls, lita, kimoyo, monument, vision, hallcreeper, galadriel);
    expect(compileCard(pact).triggers[0]!.body.modal).toMatchObject({ min: 1, max: 1, unchosen: "ever" });
    expect(compileCard(gala).triggers[0]!.body.modal).toMatchObject({ unchosen: "turn" });
    expect(compileCard(lita).triggers[0]!.body.modal).toMatchObject({ unchosen: "turn" });
    expect(compileCard(bowls).activated[0]!.body.modal).toMatchObject({ unchosen: "ever" });
  });

  it("Demonic Pact: each upkeep a mode not chosen before, until only losing the game is left", () => {
    const { s: s0, ap } = setup([]);
    const pactId = putOnBattlefield(s0, ap, pact);
    let s = passUntil(s0, "upkeep", (ap + 1) % 4);
    s = untilChoice(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseModes", legal: [true, true, true, true] });
    s = act(s, { type: "chooseModes", player: ap, modes: [2] });
    expect(s.objects[pactId]!.modesChosen).toBeTruthy();
    s = untilChoice(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseModes", legal: [true, true, false, true] });
    expect(() => act(s, { type: "chooseModes", player: ap, modes: [2] })).toThrow(/already been chosen/);
    s = act(s, { type: "chooseModes", player: ap, modes: [1] });
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: (ap + 1) % 4 }] });
    s = untilChoice(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseModes", legal: [true, false, false, true] });
    s = act(s, { type: "chooseModes", player: ap, modes: [0] });
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: (ap + 1) % 4 }] });
    // Only "You lose the game" is left: chosen without asking (rulings: you must choose it).
    for (let i = 0; i < 600 && !s.players[ap]!.lost; i++) {
      const who = waitingOn(s);
      if (who === null) break;
      if (s.pending && who !== ap) for (const a of botActions(s, who)) s = act(s, a);
      else if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: who, attacks: [] });
      else if (s.pending?.kind === "discardToHandSize") s = act(s, { type: "discard", player: who, objectIds: s.players[who]!.hand.slice(0, s.pending.count) });
      else if (s.pending) throw new Error(`unexpected ${s.pending.kind}`);
      else s = act(s, { type: "passPriority", player: who });
    }
    expect(s.players[ap]!.lost).toBe(true);
  });

  it("a new object starts over (CR 400.7), and another Pact has its own choices (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, pact);
    const b = putOnBattlefield(s0, ap, pact);
    let s = passUntil(s0, "upkeep", (ap + 1) % 4);
    s = untilChoice(s, ap);
    const first = s.pending!.kind === "chooseModes" ? s.pending.sourceId : "";
    s = act(s, { type: "chooseModes", player: ap, modes: [2] });
    s = untilChoice(s, ap);
    // The other Pact can still choose the third mode.
    expect(s.pending).toMatchObject({ kind: "chooseModes", legal: [true, true, true, true] });
    expect(s.pending!.kind === "chooseModes" && s.pending.sourceId).not.toBe(first);
    expect(s.objects[first]!.modesChosen).toBeTruthy();
    moveObject(s, first, "exile");
    expect(s.objects[first]!.modesChosen).toBeUndefined();
    expect([a, b]).toContain(first);
  });

  it("Gala Greeters: creatures entering the same turn get different modes; the next turn starts over", () => {
    const { s: s0, ap, ids } = setup([bear(), bear(), bear()]);
    const greeter = putOnBattlefield(s0, ap, gala);
    let s = cast(s0, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "chooseModes", legal: [true, true, true] });
    s = passAll(act(s, { type: "chooseModes", player: ap, modes: [0] }));
    expect(s.objects[greeter]!.counters["+1/+1"]).toBe(1);
    s = cast(s, ap, ids[1]!);
    expect(s.pending).toMatchObject({ kind: "chooseModes", legal: [false, true, true] });
    s = passAll(act(s, { type: "chooseModes", player: ap, modes: [2] }));
    s = cast(s, ap, ids[2]!);
    // Only one is left: chosen without asking.
    expect(s.pending).toBeNull();
    s = passAll(s);
    expect(s.log.at(-1)!.text).toBe("Gala Greeters creates a tapped Treasure token.");
    // A turn later, all three again.
    s.turn++;
    expect(s.objects[greeter]!.modesChosen).toBeTruthy();
    expect(legalModes(s, compileCard(gala).triggers[0]!.body, ap, undefined, greeter)).toEqual([true, true, true]);
  });

  it("Three Bowls of Porridge: each activation a mode not chosen before", () => {
    const { s: s0, ap, opp } = setup([]);
    const pot = putOnBattlefield(s0, ap, bowls);
    const b = putOnBattlefield(s0, opp, bear());
    let s = s0;
    for (const a of planActivate(s, ap, pot, 0, [target(b)], [1])!) s = act(s, a);
    s = passAll(s);
    expect(s.objects[b]!.tapped).toBe(true);
    s.objects[pot]!.tapped = false;
    expect(planActivate(s, ap, pot, 0, [target(b)], [1])).toBeNull();
    for (const a of planActivate(s, ap, pot, 0, [target(b)], [0])!) s = act(s, a);
    s = passAll(s);
    expect(s.objects[b]!.zone).toBe("graveyard");
  });
});

describe("choose one at random", () => {
  it("parses these abilities", () => {
    supported(umaro, skaro, sisters);
    expect(compileCard(umaro).triggers[0]!.body.modal).toMatchObject({ random: true });
  });

  it("the game chooses as it's put on the stack, the same way for the same seed", () => {
    const run = () => {
      const { s: s0, ap } = setup([]);
      putOnBattlefield(s0, ap, umaro);
      let s = s0;
      for (let i = 0; i < 60 && !s.log.some((e) => /chooses at random/.test(e.text)); i++) {
        const who = waitingOn(s)!;
        if (s.pending?.kind === "chooseModes") throw new Error("asked for a mode");
        if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: who, targets: [{ kind: "player", id: (ap + 1) % 4 }] });
        else if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: who, attacks: [] });
        else s = act(s, { type: "passPriority", player: who });
      }
      return s.log.find((e) => /chooses at random/.test(e.text))!.text;
    };
    const one = run();
    expect(one).toMatch(/Umaro, Raging Yeti's ability chooses at random: /);
    expect(run()).toBe(one);
  });
});
