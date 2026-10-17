// Voting (CR 701.38): each player, starting with the controller and in turn order, votes for a word or an object; what
// happens depends on which choice gets more votes (will of the council) or on each vote (council's dilemma). Extra votes
// (Brago's Representative, Ballot Broker, 701.38d) and Illusion of Choice.

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passAll, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { botActions } from "../src/bot";
import { invalidateCharacteristics, isFullySupported, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const judgment = card("Council's Judgment", "Sorcery", "{1}{W}{W}", { keywords: ["Will of the council"], oracleText: "Will of the council — Starting with you, each player votes for a nonland permanent you don't control. Exile each permanent with the most votes or tied for most votes." });
const brago = card("Brago's Representative", "Creature — Human Advisor", "{2}{W}", { power: "1", toughness: "4", oracleText: "While voting, you get an additional vote. (The votes can be for different choices or for the same choice.)" });
const broker = card("Ballot Broker", "Creature — Human Advisor", "{2}{W}", { power: "2", toughness: "3", oracleText: "While voting, you may vote an additional time. (The votes can be for different choices or for the same choice.)" });
const punishment = card("Capital Punishment", "Sorcery", "{4}{B}{B}", { keywords: ["Council's dilemma"], oracleText: "Council's dilemma — Starting with you, each player votes for death or taxes. Each opponent sacrifices a creature of their choice for each death vote and discards a card for each taxes vote." });
const portal = card("Coercive Portal", "Artifact", "{4}", { keywords: ["Will of the council"], oracleText: "Will of the council — At the beginning of your upkeep, starting with you, each player votes for carnage or homage. If carnage gets more votes, sacrifice this artifact and destroy all nonland permanents. If homage gets more votes or the vote is tied, draw a card." });
const squire = card("Custodi Squire", "Creature — Spirit Cleric", "{4}{W}", { power: "3", toughness: "3", keywords: ["Flying", "Will of the council"], oracleText: "Flying\nWill of the council — When this creature enters, starting with you, each player votes for an artifact, creature, or enchantment card in your graveyard. Return each card with the most votes or tied for most votes to your hand." });
const emissary = card("Emissary Green", "Legendary Creature — Human Advisor", "{4}{G}", { power: "3", toughness: "3", keywords: ["Treasure"], oracleText: "Whenever Emissary Green attacks, starting with you, each player votes for profit or security. You create a number of Treasure tokens equal to twice the number of profit votes. Put a number of +1/+1 counters on each creature you control equal to the number of security votes." });
const lieutenants = card("Lieutenants of the Guard", "Creature — Human Soldier", "{4}{W}", { power: "2", toughness: "2", keywords: ["Council's dilemma"], oracleText: "Council's dilemma — When this creature enters, starting with you, each player votes for strength or numbers. Put a +1/+1 counter on this creature for each strength vote and create a 1/1 white Soldier creature token for each numbers vote." });
const magister = card("Magister of Worth", "Creature — Angel", "{4}{W}{B}", { power: "4", toughness: "4", keywords: ["Flying", "Will of the council"], oracleText: "Flying\nWill of the council — When this creature enters, starting with you, each player votes for grace or condemnation. If grace gets more votes, each player returns each creature card from their graveyard to the battlefield. If condemnation gets more votes or the vote is tied, destroy all creatures other than this creature." });
const orchard = card("Orchard Elemental", "Creature — Elemental", "{5}{G}", { power: "2", toughness: "2", keywords: ["Council's dilemma"], oracleText: "Council's dilemma — When this creature enters, starting with you, each player votes for sprout or harvest. Put two +1/+1 counters on this creature for each sprout vote. You gain 3 life for each harvest vote." });
const plea = card("Plea for Power", "Sorcery", "{3}{U}", { keywords: ["Will of the council"], oracleText: "Will of the council — Starting with you, each player votes for time or knowledge. If time gets more votes, take an extra turn after this one. If knowledge gets more votes or the vote is tied, draw three cards." });
const tyrant = card("Tyrant's Choice", "Sorcery", "{1}{B}", { keywords: ["Will of the council"], oracleText: "Will of the council — Starting with you, each player votes for death or torture. If death gets more votes, each opponent sacrifices a creature of their choice. If torture gets more votes or the vote is tied, each opponent loses 4 life." });
const bite = card("Bite of the Black Rose", "Sorcery", "{3}{B}", { keywords: ["Will of the council"], oracleText: "Will of the council — Starting with you, each player votes for sickness or psychosis. If sickness gets more votes, creatures your opponents control get -2/-2 until end of turn. If psychosis gets more votes or the vote is tied, each opponent discards two cards." });
const illusion = card("Illusion of Choice", "Instant", "{U}", { oracleText: "You choose how each player votes this turn.\nDraw a card." });
const ring = card("Sol Ring", "Artifact", "{1}", { oracleText: "{T}: Add {C}{C}." });

/** The players in turn order, starting with `first`. */
const from = (s: GameState, first: PlayerId) => {
  const i = s.turnOrder.indexOf(first);
  return [...s.turnOrder.slice(i), ...s.turnOrder.slice(0, i)];
};

/** `pid` votes for `choice`: a word, or an object's id (the option is "id@zc"). */
function vote(s: GameState, pid: PlayerId, choice: string): GameState {
  expect(s.pending).toMatchObject({ kind: "chooseOption", what: "vote", player: pid });
  const options = s.pending!.kind === "chooseOption" ? s.pending.options : [];
  const o = options.includes(choice) ? choice : options.find((x) => x.startsWith(`${choice}@`));
  expect(o, `${choice} in ${options.join(", ")}`).toBeDefined();
  return act(s, { type: "chooseOption", player: pid, choice: o! });
}

/** Each player in turn order from `first` votes the next of `choices`. */
function votes(s: GameState, first: PlayerId, choices: string[]): GameState {
  from(s, first).slice(0, choices.length).forEach((pid, i) => (s = vote(s, pid, choices[i]!)));
  return s;
}

function toGraveyard(s: GameState, pid: PlayerId, def: CardDef): string {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  invalidateCharacteristics(s);
  return id;
}

describe("voting", () => {
  it("compiles them", () => {
    for (const d of [judgment, brago, broker, punishment, portal, squire, emissary, lieutenants, magister, orchard, plea, tyrant, bite, illusion]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Council's Judgment: players vote in turn order from the caster, seeing earlier votes; the most-voted permanent is exiled", () => {
    let { s, ap, ids } = setup([judgment]);
    const [, b, c, d] = from(s, ap);
    const ringB = putOnBattlefield(s, b!, ring);
    const bearC = putOnBattlefield(s, c!, bear());
    const mine = putOnBattlefield(s, ap, bear());
    s = cast(s, ap, ids[0]!);
    // Only nonland permanents the caster doesn't control: not the caster's own bear, not lands.
    const pend = s.pending!.kind === "chooseOption" ? s.pending : null;
    expect(pend?.options.some((o) => o.startsWith(`${mine}@`))).toBe(false);
    expect(pend?.options.some((o) => o.startsWith(`${ringB}@`))).toBe(true);
    expect(pend?.labels?.find((l) => l.startsWith("Sol Ring"))).toBe(`Sol Ring (${s.players[b!]!.name})`);
    s = vote(s, ap, ringB);
    // The next voter sees the vote before theirs.
    expect(s.pending).toMatchObject({ player: b, prompt: expect.stringContaining(`${s.players[ap]!.name}: Sol Ring`) });
    s = vote(s, b!, bearC);
    s = vote(s, c!, ringB);
    s = vote(s, d!, ringB);
    expect(s.objects[ringB]!.zone).toBe("exile");
    expect(s.objects[bearC]!.zone).toBe("battlefield");
  });

  it("Council's Judgment: every permanent tied for the most votes is exiled", () => {
    let { s, ap, ids } = setup([judgment]);
    const [, b, c] = from(s, ap);
    const x = putOnBattlefield(s, b!, ring);
    const y = putOnBattlefield(s, c!, bear());
    s = cast(s, ap, ids[0]!);
    s = votes(s, ap, [x, y, x, y]);
    expect([s.objects[x]!.zone, s.objects[y]!.zone]).toEqual(["exile", "exile"]);
  });

  it("Tyrant's Choice: more votes decides; a tie goes to the 'or the vote is tied' choice", () => {
    let { s, ap, ids } = setup([tyrant, tyrant]);
    const opps = from(s, ap).slice(1);
    const life = opps.map((p) => s.players[p]!.life);
    s = cast(s, ap, ids[0]!);
    s = votes(s, ap, ["death", "death", "torture", "torture"]);
    expect(opps.map((p) => s.players[p]!.life)).toEqual(life.map((l) => l - 4));
    s = cast(s, ap, ids[1]!);
    s = votes(s, ap, ["death", "death", "death", "torture"]);
    // Each opponent sacrifices a creature (they have none here): no life lost this time.
    expect(opps.map((p) => s.players[p]!.life)).toEqual(life.map((l) => l - 4));
  });

  it("Capital Punishment: each opponent sacrifices a creature for each death vote and discards a card for each taxes vote", () => {
    let { s, ap, ids } = setup([punishment]);
    const opps = from(s, ap).slice(1);
    const bears = opps.map((p) => [putOnBattlefield(s, p, bear()), putOnBattlefield(s, p, bear()), putOnBattlefield(s, p, bear())]);
    const hands = opps.map((p) => s.players[p]!.hand.length);
    s = cast(s, ap, ids[0]!);
    s = votes(s, ap, ["death", "death", "taxes", "death"]);
    // Bots answer their own sacrifices and discards.
    for (let i = 0; i < 20 && s.pending && s.pending.kind !== "declareAttackers"; i++) {
      const pid = "player" in s.pending ? (s.pending.player as PlayerId) : ap;
      if (s.pending.kind === "chooseOption" && s.pending.what === "vote") break;
      const a = botActions(s, pid);
      if (!a.length) break;
      for (const x of a) s = act(s, x);
    }
    expect(bears.map((bs) => bs.filter((id) => s.objects[id]!.zone === "battlefield").length)).toEqual([0, 0, 0]);
    expect(opps.map((p) => s.players[p]!.hand.length)).toEqual(hands.map((n) => Math.max(0, n - 1)));
  });

  it("Lieutenants of the Guard: a +1/+1 counter for each strength vote and a Soldier for each numbers vote", () => {
    let { s, ap, ids } = setup([lieutenants]);
    s = cast(s, ap, ids[0]!);
    s = passAll(s); // the enters trigger
    s = votes(s, ap, ["strength", "numbers", "strength", "strength"]);
    expect(pt(s, ids[0]!)).toBe("5/5");
    const soldiers = s.battlefield.filter((id) => s.objects[id]!.isToken && s.cards[s.objects[id]!.cardId]!.typeLine.includes("Soldier"));
    expect(soldiers.length).toBe(1);
  });

  it("Brago's Representative: its controller votes twice, both at the time they'd vote (CR 701.38d)", () => {
    let { s, ap, ids } = setup([tyrant]);
    putOnBattlefield(s, ap, brago);
    const opps = from(s, ap).slice(1);
    const life = opps.map((p) => s.players[p]!.life);
    s = cast(s, ap, ids[0]!);
    s = vote(s, ap, "torture");
    expect(s.pending).toMatchObject({ player: ap, prompt: expect.stringContaining("vote an additional time") });
    s = vote(s, ap, "torture");
    // 2 torture to 2 death after the others: tied, so torture.
    s = votes(s, opps[0]!, ["death", "death", "torture"]);
    expect(opps.map((p) => s.players[p]!.life)).toEqual(life.map((l) => l - 4));
  });

  it("Ballot Broker: the additional vote may be left out", () => {
    let { s, ap, ids } = setup([orchard]);
    putOnBattlefield(s, ap, broker);
    const life = s.players[ap]!.life;
    s = cast(s, ap, ids[0]!);
    s = passAll(s);
    s = vote(s, ap, "sprout");
    expect(s.pending).toMatchObject({ player: ap, options: ["sprout", "harvest", "none"] });
    s = act(s, { type: "chooseOption", player: ap, choice: "none" });
    s = votes(s, from(s, ap)[1]!, ["harvest", "harvest", "sprout"]);
    expect(pt(s, ids[0]!)).toBe("6/6");
    expect(s.players[ap]!.life).toBe(life + 6);
  });

  it("Illusion of Choice: its controller makes every vote this turn", () => {
    let { s, ap, ids } = setup([illusion, plea]);
    const [, b, c, d] = from(s, ap);
    s = cast(s, ap, ids[0]!);
    const hand = s.players[ap]!.hand.length;
    s = cast(s, ap, ids[1]!);
    s = vote(s, ap, "knowledge");
    for (const voter of [b, c, d]) {
      expect(s.pending).toMatchObject({ kind: "chooseOption", what: "vote", player: ap, voter, prompt: expect.stringContaining(`vote for ${s.players[voter!]!.name}`) });
      s = act(s, { type: "chooseOption", player: ap, choice: "knowledge" });
    }
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 3);
  });

  it("Custodi Squire: the card with the most votes returns from your graveyard to your hand", () => {
    let { s, ap, ids } = setup([squire]);
    const a = toGraveyard(s, ap, ring);
    const b = toGraveyard(s, ap, bear());
    s = cast(s, ap, ids[0]!);
    s = passAll(s);
    s = votes(s, ap, [a, b, a, a]);
    expect(s.objects[a]!.zone).toBe("hand");
    expect(s.objects[b]!.zone).toBe("graveyard");
  });

  it("Magister of Worth: condemnation destroys all other creatures", () => {
    let { s, ap, ids } = setup([magister]);
    const [, b] = from(s, ap);
    const other = putOnBattlefield(s, b!, bear());
    s = cast(s, ap, ids[0]!);
    s = passAll(s);
    s = votes(s, ap, ["condemnation", "grace", "condemnation", "grace"]);
    expect(s.objects[other]!.zone).toBe("graveyard");
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
  });

  it("Coercive Portal: votes at the beginning of its controller's upkeep", () => {
    let { s, ap } = setup([]);
    const p = putOnBattlefield(s, ap, portal);
    s = passUntil(s, "upkeep", ap, 4000);
    s = passAll(s);
    const hand = s.players[ap]!.hand.length;
    s = votes(s, ap, ["homage", "carnage", "homage", "carnage"]);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.objects[p]!.zone).toBe("battlefield");
  });

  it("bots vote for an opponent's best permanent, never their own", () => {
    let { s, ap, ids } = setup([judgment]);
    const [, b, c] = from(s, ap);
    const small = putOnBattlefield(s, b!, bear());
    const big = putOnBattlefield(s, c!, card("Colossal Dreadmaw", "Creature — Dinosaur", "{4}{G}{G}", { power: "6", toughness: "6", keywords: ["Trample"], oracleText: "Trample" }));
    s = cast(s, ap, ids[0]!);
    s = vote(s, ap, big);
    // B's own bear is a candidate, but B votes for C's Dreadmaw.
    const [a] = botActions(s, b!);
    expect(a).toMatchObject({ type: "chooseOption", choice: expect.stringMatching(new RegExp(`^${big}@`)) });
    expect(small).toBeTruthy();
  });

  it("bots on the losing end vote for what hurts them least (Tyrant's Choice)", () => {
    let { s, ap, ids } = setup([tyrant]);
    const [, b, c] = from(s, ap);
    putOnBattlefield(s, c!, card("Colossal Dreadmaw", "Creature — Dinosaur", "{4}{G}{G}", { power: "6", toughness: "6", keywords: ["Trample"], oracleText: "Trample" }));
    s = cast(s, ap, ids[0]!);
    s = vote(s, ap, "torture");
    // B has no creature to sacrifice; C would lose its Dreadmaw.
    expect(botActions(s, b!)).toMatchObject([{ type: "chooseOption", choice: "death" }]);
    s = vote(s, b!, "death");
    expect(botActions(s, c!)).toMatchObject([{ type: "chooseOption", choice: "torture" }]);
  });
});
