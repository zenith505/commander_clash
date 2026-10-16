// "Punisher" effects: "[players] lose N life unless they [discard / sacrifice / pay]". Each player in APNAP order
// chooses (the card to discard isn't revealed), then the discards and sacrifices happen at once, then those who did
// neither take the penalty (rulings on Torment of Hailfire and Court of Ambition). Also "sacrifices an artifact and a
// land" (different permanents, Structural Collapse's rulings) and "X unless [condition]".

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passUntil, putOnBattlefield, setup, swamp } from "./helpers";
import { abilitiesOf, botActions, isFullySupported, parseManaCost, planActivate, planCast, planMana, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

/** Pass priority and let bots answer every choice until the stack and the trigger queue are empty; `answer` gives
 * the test's own answer, or null to stop. */
function settle(s: GameState, answer?: (s: GameState) => Action | undefined | null) {
  for (let i = 0; i < 200 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    const mine = answer?.(s);
    if (mine === null) break; // stop here
    if (mine) s = act(s, mine);
    else if (s.pending) s = act(s, botActions(s, pid)[0]!);
    else s = act(s, { type: "passPriority", player: pid });
  }
  return s;
}
/** Answer every punisher prompt with `choose(player, labels)`: the label of the option to take. */
const punish = (choose: (pid: PlayerId, labels: string[]) => string, seen?: { pid: PlayerId; labels: string[] }[]) => (s: GameState): Action | undefined => {
  if (s.pending?.kind !== "chooseOption" || s.pending.what !== "punisher") return undefined;
  const labels = s.pending.labels ?? [];
  seen?.push({ pid: s.pending.player, labels });
  const label = choose(s.pending.player, labels);
  expect(labels).toContain(label);
  return { type: "chooseOption", player: s.pending.player, choice: s.pending.options[labels.indexOf(label)]! };
};
/** The penalty's button, always last. */
const none = (labels: string[]) => labels[labels.length - 1]!;
/** In turn order after `ap`, so in APNAP order on `ap`'s turn. */
const opponents = (s: GameState, ap: PlayerId) => [1, 2, 3].map((i) => s.turnOrder[(s.turnOrder.indexOf(ap) + i) % 4]!);
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return s;
};

// Real oracle text (Scryfall).
const tormentOfHailfire = card("Torment of Hailfire", "Sorcery", "{X}{B}{B}", { oracleText: "Repeat the following process X times. Each opponent loses 3 life unless that player sacrifices a nonland permanent of their choice or discards a card." });
const courtOfAmbition = card("Court of Ambition", "Enchantment", "{2}{B}{B}", { oracleText: "When this enchantment enters, you become the monarch.\nAt the beginning of your upkeep, each opponent loses 3 life unless they discard a card. If you're the monarch, instead each opponent loses 6 life unless they discard two cards." });
const painfulQuandary = card("Painful Quandary", "Enchantment", "{3}{B}{B}", { oracleText: "Whenever an opponent casts a spell, that player loses 5 life unless they discard a card." });
const phyrexianTyranny = card("Phyrexian Tyranny", "Enchantment", "{U}{B}{R}", { oracleText: "Whenever a player draws a card, that player loses 2 life unless they pay {2}." });
const bellowingMauler = card("Bellowing Mauler", "Creature — Ogre Warrior", "{4}{B}", { power: "4", toughness: "6", oracleText: "At the beginning of your end step, each player loses 4 life unless they sacrifice a nontoken creature of their choice." });
const remorselessPunishment = card("Remorseless Punishment", "Sorcery", "{3}{B}{B}", { oracleText: "Target opponent loses 5 life unless that player discards two cards or sacrifices a creature or planeswalker of their choice. Repeat this process once." });
const structuralCollapse = card("Structural Collapse", "Sorcery", "{5}{R}", { oracleText: "Target player sacrifices an artifact and a land of their choice. Structural Collapse deals 2 damage to that player." });
const nicolBolas = card("Nicol Bolas, the Deceiver", "Legendary Planeswalker — Bolas", "{5}{U}{B}{R}", { loyalty: "5", oracleText: "+3: Each opponent loses 3 life unless that player sacrifices a nonland permanent of their choice or discards a card.\n−3: Destroy target creature. Draw a card.\n−11: Nicol Bolas deals 7 damage to each opponent. You draw seven cards." });
const fathomFleetBoarder = card("Fathom Fleet Boarder", "Creature — Orc Pirate", "{2}{B}", { power: "3", toughness: "3", oracleText: "When this creature enters, you lose 2 life unless you control another Pirate." });
const chartACourse = card("Chart a Course", "Sorcery", "{1}{U}", { oracleText: "Draw two cards. Then discard a card unless you attacked this turn." });
const shorelineLooter = card("Shoreline Looter", "Creature — Rat Rogue", "{1}{U}", { power: "1", toughness: "1", keywords: ["Threshold"], oracleText: "This creature can't be blocked.\nThreshold — Whenever this creature deals combat damage to a player, draw a card. Then discard a card unless there are seven or more cards in your graveyard." });
const seatOfTheSynod = card("Seat of the Synod", "Artifact Land", "", { oracleText: "{T}: Add {U}." });
const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const pirate = card("Deckhand", "Creature — Human Pirate", "{U}", { power: "1", toughness: "1" });

describe("punishers", () => {
  it("parse", () =>
    supported(tormentOfHailfire, courtOfAmbition, painfulQuandary, phyrexianTyranny, bellowingMauler, remorselessPunishment, structuralCollapse, nicolBolas, fathomFleetBoarder, chartACourse, shorelineLooter));

  it("Torment of Hailfire: X rounds; each round every opponent chooses, and can always choose to lose 3 life", () => {
    const { s: s0, ap, ids } = setup([tormentOfHailfire]);
    const [o1, o2, o3] = opponents(s0, ap) as [PlayerId, PlayerId, PlayerId];
    const b = putOnBattlefield(s0, o3, bear());
    const hand2 = s0.players[o2]!.hand.length;
    const seen: { pid: PlayerId; labels: string[] }[] = [];
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 2));
    s = settle(s, punish((pid, labels) => (pid === o2 ? "Discard a card" : pid === o3 && labels[0]!.startsWith("Sacrifice") ? labels[0]! : none(labels)), seen));
    expect(seen.map((x) => x.pid)).toEqual([o1, o2, o3, o1, o2, o3]);
    // An opponent with no nonland permanent isn't offered the sacrifice.
    expect(seen[0]!.labels).toEqual(["Discard a card", "Lose 3 life"]);
    expect(seen[2]!.labels).toEqual(["Sacrifice a nonland permanent", "Discard a card", "Lose 3 life"]);
    expect(s.players[o1]!.life).toBe(34);
    expect(s.players[o2]!.life).toBe(40);
    expect(s.players[o2]!.hand.length).toBe(hand2 - 2);
    // The bear the first time; nothing left to sacrifice the second, so the penalty.
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.players[o3]!.life).toBe(37);
  });

  it("Torment of Hailfire with X = 0 does nothing", () => {
    const { s: s0, ap, ids } = setup([tormentOfHailfire]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 0)), (x) => {
      expect(x.pending).toBeFalsy();
      return undefined;
    });
    for (const p of opponents(s, ap)) expect(s.players[p]!.life).toBe(40);
  });

  it("Remorseless Punishment: the same opponent goes through the process twice", () => {
    const { s: s0, ap, ids, opp } = setup([remorselessPunishment]);
    const hand = s0.players[opp]!.hand.length;
    let n = 0;
    const s = settle(cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]), punish((pid, labels) => {
      expect(pid).toBe(opp);
      expect(labels).toEqual(["Discard 2 cards", "Lose 5 life"]);
      return n++ === 0 ? labels[0]! : none(labels);
    }));
    expect(n).toBe(2);
    expect(s.players[opp]!.hand.length).toBe(hand - 2);
    expect(s.players[opp]!.life).toBe(35);
  });

  it("Court of Ambition: 3 life or a card; as the monarch, instead 6 life or two cards", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, courtOfAmbition);
    const [o1] = opponents(s0, ap) as [PlayerId];
    let s = passUntil(s0, "upkeep", ap, 4000);
    const seen: { pid: PlayerId; labels: string[] }[] = [];
    s = settle(s, punish((_, l) => none(l), seen));
    expect(seen[0]!.labels).toEqual(["Discard a card", "Lose 3 life"]);
    expect(s.players[o1]!.life).toBe(37);

    const { s: s1, ap: ap1 } = setup([]);
    putOnBattlefield(s1, ap1, courtOfAmbition);
    s1.monarch = ap1;
    const [p1, p2] = opponents(s1, ap1) as [PlayerId, PlayerId];
    const hand = s1.players[p2]!.hand.length;
    s = passUntil(s1, "upkeep", ap1, 4000);
    const seen1: { pid: PlayerId; labels: string[] }[] = [];
    const before = s.players[p2]!.hand.length;
    s = settle(s, punish((pid, l) => (pid === p2 ? l[0]! : none(l)), seen1));
    expect(seen1).toHaveLength(3);
    expect(seen1[0]!.labels).toEqual(["Discard 2 cards", "Lose 6 life"]);
    expect(s.players[p1]!.life).toBe(34);
    expect(s.players[p2]!.life).toBe(40);
    expect(s.players[p2]!.hand.length).toBe(before - 2);
    expect(hand).toBeGreaterThan(0);
  });

  it("Painful Quandary: the opponent who cast the spell chooses", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, painfulQuandary);
    // The opponent casts Shock at ap during ap's turn.
    const sh = putOnBattlefield(s0, opp, shock);
    s0.battlefield.splice(s0.battlefield.indexOf(sh), 1);
    s0.objects[sh]!.zone = "hand";
    s0.players[opp]!.hand.push(sh);
    putOnBattlefield(s0, opp, card("Mountain", "Basic Land — Mountain"));
    let s = act(s0, { type: "passPriority", player: ap });
    s = run(s, planCast(s, opp, sh, [{ kind: "player", id: ap }]));
    s = settle(s, punish((pid, l) => {
      expect(pid).toBe(opp);
      return none(l);
    }));
    expect(s.players[opp]!.life).toBe(35);
    expect(s.players[ap]!.life).toBe(38);
  });

  it("Phyrexian Tyranny: once per card drawn, pay {2} or lose 2 life", () => {
    const { s: s0, ap, ids } = setup([divination]);
    putOnBattlefield(s0, ap, phyrexianTyranny);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    const untapped = () => s.battlefield.filter((id) => s.objects[id]!.controller === ap && !s.objects[id]!.tapped).length;
    const payUnless = (x: GameState) => (x.pending?.kind === "payUnless" ? null : undefined);
    s = settle(s, payUnless);
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap, cost: "{2}" });
    const before = untapped();
    s = run(s, [...planMana(s, ap, parseManaCost("{2}"))!, { type: "payUnless", player: ap, pay: true }]);
    expect(untapped()).toBe(before - 2);
    s = settle(s, payUnless);
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap, cost: "{2}" });
    s = settle(act(s, { type: "payUnless", player: ap, pay: false }));
    expect(s.players[ap]!.life).toBe(38);
  });

  it("Bellowing Mauler: each player, its controller too, sacrifices a nontoken creature or loses 4 life", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, bellowingMauler);
    const b = putOnBattlefield(s0, opp, bear());
    const seen: { pid: PlayerId; labels: string[] }[] = [];
    const s = settle(passUntil(s0, "end", ap), punish((_, l) => l[0]!, seen));
    // Players with no nontoken creature aren't asked: they lose 4 life.
    expect(seen.map((x) => x.pid)).toEqual([ap, opp]);
    expect(seen[0]!.labels).toEqual(["Sacrifice a nontoken creature", "Lose 4 life"]);
    expect(s.objects[m]!.zone).toBe("graveyard");
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(40);
    for (const p of opponents(s, ap).filter((p) => p !== opp)) expect(s.players[p]!.life).toBe(36);
  });

  it("Nicol Bolas, the Deceiver's +3", () => {
    const { s: s0, ap } = setup([]);
    const nb = putOnBattlefield(s0, ap, nicolBolas);
    s0.objects[nb]!.counters = { loyalty: 5 };
    const i = abilitiesOf(s0, s0.objects[nb]!).activated.findIndex((a) => /^\+3/.test(a.body.text) || /loses 3 life/.test(a.body.text));
    const s = settle(run(s0, planActivate(s0, ap, nb, i)), punish((_, l) => none(l)));
    for (const p of opponents(s, ap)) expect(s.players[p]!.life).toBe(37);
    expect(s.objects[nb]!.counters.loyalty).toBe(8);
  });
});

describe("sacrifice an artifact and a land (Structural Collapse's rulings)", () => {
  it("an artifact land can't be both: it's the artifact, and another land is the land", () => {
    const { s: s0, ap, ids, opp } = setup([structuralCollapse]);
    const seat = putOnBattlefield(s0, opp, seatOfTheSynod);
    const f = putOnBattlefield(s0, opp, card("Forest", "Basic Land — Forest"));
    const s = settle(cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    expect(s.objects[seat]!.zone).toBe("graveyard");
    expect(s.objects[f]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(38);
  });

  it("if it's the only artifact and the only land, just that permanent", () => {
    const { s: s0, ap, ids, opp } = setup([structuralCollapse]);
    const seat = putOnBattlefield(s0, opp, seatOfTheSynod);
    const s = settle(cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    expect(s.objects[seat]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(38);
  });

  it("with several lands, the player picks which", () => {
    const { s: s0, ap, ids } = setup([structuralCollapse]);
    const seat = putOnBattlefield(s0, ap, seatOfTheSynod);
    let s = cast(s0, ap, ids[0]!, [{ kind: "player", id: ap }]);
    s = settle(s, (x) => {
      if (x.pending?.kind !== "pickPermanents") return undefined;
      // The artifact is the artifact land, auto-picked; then any other land.
      expect(x.pending.options).not.toContain(seat);
      return { type: "pickPermanents", player: ap, ids: [x.pending.options[0]!] };
    });
    expect(s.objects[seat]!.zone).toBe("graveyard");
  });
});

describe("X unless [condition]", () => {
  it("Fathom Fleet Boarder: lose 2 life unless you control another Pirate", () => {
    const { s: s0, ap, ids } = setup([fathomFleetBoarder, fathomFleetBoarder]);
    putOnBattlefield(s0, ap, swamp);
    putOnBattlefield(s0, ap, swamp);
    let s = settle(cast(s0, ap, ids[0]!));
    expect(s.players[ap]!.life).toBe(38);
    // The second one sees the first, another Pirate.
    s = settle(cast(s, ap, ids[1]!));
    expect(s.players[ap]!.life).toBe(38);
  });

  it("Fathom Fleet Boarder with another Pirate already out", () => {
    const { s: s0, ap, ids } = setup([fathomFleetBoarder]);
    putOnBattlefield(s0, ap, pirate);
    const s = settle(cast(s0, ap, ids[0]!));
    expect(s.players[ap]!.life).toBe(40);
  });

  it("Chart a Course: discard unless you attacked this turn", () => {
    const { s: s0, ap, ids } = setup([chartACourse]);
    const hand = s0.players[ap]!.hand.length;
    const s = settle(cast(s0, ap, ids[0]!));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2 - 1);

    const { s: s1, ap: ap1, ids: ids1, opp } = setup([chartACourse]);
    const b = putOnBattlefield(s1, ap1, bear());
    let t = passUntil(s1, "declareAttackers", ap1);
    t = act(t, { type: "declareAttackers", player: ap1, attacks: [{ attacker: b, defender: opp }] });
    t = settle(passUntil(t, "main2", ap1));
    const hand1 = t.players[ap1]!.hand.length;
    t = settle(cast(t, ap1, ids1[0]!));
    expect(t.players[ap1]!.hand.length).toBe(hand1 - 1 + 2);
  });

  it("parses the unless clause onto the right sentence", () => {
    // Shoreline Looter discards only when its graveyard has fewer than seven cards.
    const { s: s0, ap, opp } = setup([]);
    const l = putOnBattlefield(s0, ap, shorelineLooter);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: l, defender: opp }] });
    const hand = s.players[ap]!.hand.length;
    s = settle(passUntil(s, "combatDamage", ap));
    expect(s.players[ap]!.hand.length).toBe(hand + 1 - 1);
  });
});
