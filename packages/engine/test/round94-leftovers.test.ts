// Round 94, left over from round 93: Iroh, Grand Lotus ("each non-Lesson instant and sorcery card": the leading "non-"
// word is for both types; flashback for its mana cost, CR 702.34a, and Lessons for {1}), The Master of Keys ("mill twice
// X cards"), Szarekh, the Silent King and Rick Jones, Destined Sidekick ("an artifact creature card or Vehicle card",
// "a Hero or enchantment card" from among the milled cards: a card that's either one). Bots move Forgotten Ancient's
// counters onto their strongest evasive creature.

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, graveyardWays, isFullySupported, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const iroh = card("Iroh, Grand Lotus", "Legendary Creature — Human Noble Ally", "{3}{G}{U}{R}", { power: "5", toughness: "5", keywords: ["Firebending"], oracleText: "Firebending 2\nDuring your turn, each non-Lesson instant and sorcery card in your graveyard has flashback. The flashback cost is equal to that card's mana cost. (You may cast a card from your graveyard for its flashback cost. Then exile it.)\nDuring your turn, each Lesson card in your graveyard has flashback {1}." });
const keys = card("The Master of Keys", "Legendary Enchantment Creature — Horror", "{X}{W}{U}{B}", { power: "3", toughness: "3", keywords: ["Flying", "Mill"], oracleText: "Flying\nWhen The Master of Keys enters, put X +1/+1 counters on it and mill twice X cards.\nEach enchantment card in your graveyard has escape. The escape cost is equal to the card's mana cost plus exile three other cards from your graveyard. (You may cast cards from your graveyard for their escape cost.)" });
const szarekh = card("Szarekh, the Silent King", "Legendary Artifact Creature — Necron", "{1}{B}{B}{B}", { power: "3", toughness: "4", keywords: ["Flying", "My Will Be Done", "Mill"], oracleText: "Flying\nMy Will Be Done — Whenever Szarekh attacks, mill three cards. You may put an artifact creature card or Vehicle card from among the cards milled this way into your hand." });
const rick = card("Rick Jones, Destined Sidekick", "Legendary Creature — Human Advisor", "{G}", { power: "0", toughness: "3", keywords: ["Mill"], oracleText: "{3}, {T}: Mill four cards. You may put a Hero or enchantment card from among those cards into your hand. (To mill four cards, put the top four cards of your library into your graveyard.)" });

const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const lesson = card("Firebending Lesson", "Instant — Lesson", "{R}", { keywords: ["Kicker"], oracleText: "Kicker {4}\nFirebending Lesson deals 2 damage to target creature. If this spell was kicked, it deals 5 damage to that creature instead." });
const myr = card("Alpha Myr", "Artifact Creature — Myr", "{2}", { power: "2", toughness: "1" });
const cart = card("Smuggler's Copter", "Artifact — Vehicle", "{2}", { power: "3", toughness: "3", keywords: ["Flying", "Crew"], oracleText: "Flying\nCrew 1" });
const hero = card("Captain Hero", "Creature — Human Hero", "{1}{W}", { power: "2", toughness: "2" });
const pacifism = card("Pacifism", "Enchantment — Aura", "{1}{W}", { keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature can't attack or block." });

/** Puts `defs` on top of `pid`'s library, the first one on top. */
function onTop(s: GameState, pid: PlayerId, defs: CardDef[]) {
  const ids = defs.map((def) => {
    const id = putOnBattlefield(s, pid, def);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "library";
    return id;
  });
  s.players[pid]!.library.unshift(...ids);
  return ids;
}
const toYard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
};
const step = (s: GameState) => act(s, { type: "passPriority", player: waitingOn(s)! });
const untilPending = (s: GameState) => {
  for (let i = 0; i < 30 && !s.pending; i++) s = step(s);
  return s;
};

describe("round 93 leftovers", () => {
  it("parse", () => {
    for (const d of [iroh, keys, szarekh, rick]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Iroh: on your turn, non-Lesson instants and sorceries have flashback for their mana cost and Lessons for {1}", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, iroh);
    const sh = toYard(s, ap, shock);
    const ls = toYard(s, ap, lesson);
    const b = toYard(s, ap, bear());
    expect(graveyardWays(s, s.objects[sh]!)).toEqual([expect.objectContaining({ kind: "grantedFlashback" })]);
    expect(graveyardWays(s, s.objects[sh]!)[0]).toMatchObject({ mana: "{R}" });
    // The Lesson gets only its own {1}: it isn't a non-Lesson card.
    expect(graveyardWays(s, s.objects[ls]!)).toEqual([expect.objectContaining({ kind: "grantedFlashback", mana: "{1}" })]);
    expect(graveyardWays(s, s.objects[b]!)).toEqual([]);
    // Not during another player's turn.
    s.activePlayer = opp;
    expect(graveyardWays(s, s.objects[sh]!)).toEqual([]);
    expect(graveyardWays(s, s.objects[ls]!)).toEqual([]);
  });

  it("The Master of Keys: X +1/+1 counters and mills twice X cards", () => {
    const { s: s0, ap, ids } = setup([keys]);
    const before = s0.players[ap]!.library.length;
    let s = planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 2)!.reduce((x, a) => act(x, a), s0);
    for (let i = 0; i < 30 && (s.stack.length || s.triggerQueue.length); i++) s = step(s);
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(2);
    expect(s.players[ap]!.library.length).toBe(before - 4);
    expect(s.players[ap]!.graveyard.length).toBe(4);
  });

  it("Szarekh: only a milled artifact creature card or Vehicle card is offered", () => {
    const { s: s0, ap, opp } = setup([]);
    const sz = putOnBattlefield(s0, ap, szarekh);
    const older = toYard(s0, ap, myr);
    const [m, v] = onTop(s0, ap, [myr, cart, bear()]) as [string, string, string];
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: sz, defender: opp }] });
    s = untilPending(s);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", fromGraveyard: "hand", max: 1, min: 0 });
    expect([...(s.pending as { cards: string[] }).cards].sort()).toEqual([m, v].sort());
    s = act(s, { type: "searchLibrary", player: ap, found: [v] });
    expect(s.objects[v]!.zone).toBe("hand");
    expect(s.objects[older]!.zone).toBe("graveyard");
  });

  it("Rick Jones: a milled Hero or enchantment card to your hand", () => {
    const { s: s0, ap } = setup([]);
    const r = putOnBattlefield(s0, ap, rick);
    const [h, , e] = onTop(s0, ap, [hero, bear(), pacifism, bear()]) as [string, string, string, string];
    let s = untilPending(activate(s0, ap, r, 0));
    expect([...(s.pending as { cards: string[] }).cards].sort()).toEqual([h, e].sort());
    s = act(s, { type: "searchLibrary", player: ap, found: [h] });
    expect(s.objects[h]!.zone).toBe("hand");
    expect(s.objects[e]!.zone).toBe("graveyard");
  });
});

const ancient = card("Forgotten Ancient", "Creature — Elemental", "{3}{G}", { power: "0", toughness: "3", oracleText: "Whenever a player casts a spell, you may put a +1/+1 counter on this creature.\nAt the beginning of your upkeep, you may move any number of +1/+1 counters from this creature onto other creatures." });
const drake = card("Wind Drake", "Creature — Drake", "{2}{U}", { power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying" });

describe("bots and Forgotten Ancient", () => {
  for (const flyer of [true, false])
    it(flyer ? "move all its counters onto their best evasive creature" : "keep them on it without an evasive creature", () => {
      const { s: s0, ap, opp } = setup([]);
      const a = putOnBattlefield(s0, ap, ancient);
      const b = putOnBattlefield(s0, ap, bear());
      const d = flyer ? putOnBattlefield(s0, ap, drake) : undefined;
      putOnBattlefield(s0, opp, drake);
      s0.objects[a]!.counters = { "+1/+1": 3 };
      let s = passUntil(s0, "upkeep", ap);
      for (let i = 0; i < 400 && !(s.pending?.kind === "chooseMay" && s.activePlayer === ap && s.step === "upkeep"); i++) s = s.pending?.kind === "chooseMay" ? act(s, { type: "chooseMay", player: s.pending.player, yes: false }) : step(passUntil(s, "upkeep", ap));
      // The bot says yes to "you may move", then picks.
      for (const x of botActions(s, ap)) s = act(s, x);
      expect(s.pending).toMatchObject({ kind: "distribute", move: true });
      for (const x of botActions(s, ap)) s = act(s, x);
      expect(s.objects[a]!.counters["+1/+1"] ?? 0).toBe(flyer ? 0 : 3);
      if (d) expect(s.objects[d]!.counters["+1/+1"]).toBe(3);
      expect(s.objects[b]!.counters["+1/+1"] ?? 0).toBe(0);
    });
});
