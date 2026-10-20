// The battle cards left out of round 87 (CR 310): Bilbo's "Exile Bilbo" cost, Bloodfeather Phoenix's "an instant or
// sorcery spell you control deals damage to an opponent or battle" from the graveyard, Rankle and Torbran's "choose any
// number" (zero allowed, CR 700.2) and "a player or battle" damage boost (CR 614.1a), and Zurgo and Ojutai's "one or more
// Dragons ... deal combat damage to a player or battle" (once per player or battle, CR 603.2c) with "one of those Dragons".

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, forest, mountain, passUntil, plains, putOnBattlefield, scry, setup, swamp, target } from "./helpers";
import { addMana } from "../src/spend";
import { abilityProblem, isFullySupported, objHasKeyword, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const bilbo = card("Bilbo, Birthday Celebrant", "Legendary Creature — Halfling Rogue", "{W}{B}{G}", { power: "2", toughness: "3", oracleText: "If you would gain life, you gain that much life plus 1 instead.\n{2}{W}{B}{G}, {T}, Exile Bilbo: Search your library for any number of creature cards, put them onto the battlefield, then shuffle. Activate only if you have 111 or more life." });
const phoenix = card("Bloodfeather Phoenix", "Creature — Phoenix", "{1}{R}", { power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying\nThis creature can't block.\nWhenever an instant or sorcery spell you control deals damage to an opponent or battle, you may pay {R}. If you do, return this card from your graveyard to the battlefield. It gains haste until end of turn." });
const rankle = card("Rankle and Torbran", "Legendary Creature — Faerie Dwarf", "{1}{B}{B}{R}{R}", { power: "3", toughness: "4", keywords: ["Flying", "First strike", "Haste"], oracleText: "Flying, first strike, haste\nWhenever Rankle and Torbran deals combat damage to a player or battle, choose any number —\n• Each player creates a Treasure token.\n• Each player sacrifices a creature of their choice.\n• If a source would deal damage to a player or battle this turn, it deals that much damage plus 2 instead." });
const zurgo = card("Zurgo and Ojutai", "Legendary Creature — Orc Dragon", "{2}{U}{R}{W}", { power: "4", toughness: "4", keywords: ["Flying", "Haste"], oracleText: "Flying, haste\nZurgo and Ojutai has hexproof as long as it entered this turn.\nWhenever one or more Dragons you control deal combat damage to a player or battle, look at the top three cards of your library. Put one of them into your hand and the rest on the bottom of your library in any order. You may return one of those Dragons to its owner's hand." });
const shivan = card("Shivan Dragon", "Creature — Dragon", "{4}{R}{R}", { power: "5", toughness: "5", keywords: ["Flying"], oracleText: "Flying\n{R}: Shivan Dragon gets +1/+0 until end of turn." });
const bolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });
const SIEGE = "(As a Siege enters, choose an opponent to protect it. You and others can attack it. When it's defeated, exile it, then cast it transformed.)\n";
const belenon = scry("transform", [
  { name: "Invasion of Belenon", mana_cost: "{2}{W}", type_line: "Battle — Siege", defense: "5", oracle_text: `${SIEGE}When this Siege enters, create a 2/2 white and blue Knight creature token with vigilance.` },
  { name: "Belenon War Anthem", type_line: "Enchantment", color_indicator: ["W"], oracle_text: "Creatures you control get +1/+1." },
]);

const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.resolving) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const battleFor = (s: GameState, pid: PlayerId, protector: PlayerId, defense = 9) => {
  const id = putOnBattlefield(s, pid, belenon);
  s.objects[id]!.counters.defense = defense;
  s.objects[id]!.protector = protector;
  return id;
};
const inZone = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  return id;
};
/** Attack with no blocks; stops at the first decision other than blocks, or at end of combat. */
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId; planeswalker?: string }[]) => {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks });
  for (let i = 0; i < 200 && s.step !== "endCombat" && !(s.pending && s.pending.kind !== "declareBlockers"); i++) {
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const other = (s: GameState, ap: PlayerId, k: number) => s.turnOrder[(s.turnOrder.indexOf(ap) + k) % 4]!;

describe("battle cards left from round 87", () => {
  it("compile", () => {
    for (const d of [bilbo, phoenix, rankle, zurgo]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Bilbo: only at 111 or more life, exile him to put any number of creature cards onto the battlefield", () => {
    const { s: s0, ap } = setup([]);
    const b = putOnBattlefield(s0, ap, bilbo);
    for (const l of [plains, swamp, forest, forest, forest, forest]) putOnBattlefield(s0, ap, l);
    const bears = [inZone(s0, ap, bear(), "library"), inZone(s0, ap, bear({ name: "Runeclaw Bear" }), "library")];
    s0.players[ap]!.life = 110;
    expect(abilityProblem(s0, ap, b, 0)).toMatch(/can.t be activated now/);
    s0.players[ap]!.life = 111;
    let s = settle(activate(s0, ap, b, 0));
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: bears }));
    for (const id of bears) expect(s.objects[id]!.zone).toBe("battlefield");
  });

  it("Bloodfeather Phoenix: a Bolt at an opponent lets you pay {R} to return it with haste", () => {
    const { s: s0, ap, opp } = setup([bolt]);
    const ph = inZone(s0, ap, phoenix, "graveyard");
    putOnBattlefield(s0, ap, mountain);
    putOnBattlefield(s0, ap, mountain);
    const b = s0.players[ap]!.hand[s0.players[ap]!.hand.length - 1]!;
    let s = settle(cast(s0, ap, b, [{ kind: "player", id: opp }]));
    expect(s.players[opp]!.life).toBe(37);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, pay: expect.anything() });
    addMana(s, ap, ["R"], {});
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[ph]!.zone).toBe("battlefield");
    expect(s.objects[ph]!.controller).toBe(ap);
    expect(objHasKeyword(s, s.objects[ph]!, "Haste")).toBe(true);
  });

  it("Bloodfeather Phoenix: damage to a battle counts; damage to you or to a creature doesn't", () => {
    const { s: s0, ap, opp } = setup([bolt]);
    inZone(s0, ap, phoenix, "graveyard");
    putOnBattlefield(s0, ap, mountain);
    putOnBattlefield(s0, ap, mountain);
    const bt = battleFor(s0, ap, opp);
    const b = s0.players[ap]!.hand[s0.players[ap]!.hand.length - 1]!;
    const toBattle = settle(cast(structuredClone(s0), ap, b, [target(bt)]));
    expect(toBattle.objects[bt]!.counters.defense).toBe(6);
    expect(toBattle.pending).toMatchObject({ kind: "chooseMay", player: ap });
    const toMe = settle(cast(structuredClone(s0), ap, b, [{ kind: "player", id: ap }]));
    expect(toMe.players[ap]!.life).toBe(37);
    expect(toMe.pending).toBeNull();
    const bearId = putOnBattlefield(s0, opp, bear());
    const toBear = settle(cast(structuredClone(s0), ap, b, [target(bearId)]));
    expect(toBear.objects[bearId]!.zone).toBe("graveyard");
    expect(toBear.pending).toBeNull();
  });

  it("Bloodfeather Phoenix: declining leaves it in the graveyard", () => {
    const { s: s0, ap, opp } = setup([bolt]);
    const ph = inZone(s0, ap, phoenix, "graveyard");
    putOnBattlefield(s0, ap, mountain);
    putOnBattlefield(s0, ap, mountain);
    const b = s0.players[ap]!.hand[s0.players[ap]!.hand.length - 1]!;
    let s = settle(cast(s0, ap, b, [{ kind: "player", id: opp }]));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.objects[ph]!.zone).toBe("graveyard");
  });

  it("Rankle and Torbran: choose any number of modes, including none", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, rankle);
    const s1 = attack(s0, ap, [{ attacker: r, defender: opp }]);
    expect(s1.players[opp]!.life).toBe(37);
    expect(s1.pending).toMatchObject({ kind: "chooseModes", player: ap, min: 0, max: 3 });
    // No modes: nothing happens.
    const tokens = (st: GameState) => st.battlefield.filter((id) => st.objects[id]!.isToken).length;
    const none = settle(act(structuredClone(s1), { type: "chooseModes", player: ap, modes: [] }));
    expect(none.pending).toBeNull();
    expect(tokens(none)).toBe(0);
    // A Treasure for every player, and each player sacrifices a creature (Rankle and Torbran is ours only creature).
    const two = settle(act(structuredClone(s1), { type: "chooseModes", player: ap, modes: [0, 1] }));
    expect(tokens(two)).toBe(4);
    expect(two.objects[r]!.zone).toBe("graveyard");
  });

  it("Rankle and Torbran: the third mode adds 2 to damage dealt to players and battles this turn, not to creatures", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, rankle);
    const bt = battleFor(s0, ap, opp, 9);
    const big = putOnBattlefield(s0, opp, card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" }));
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, ap, mountain);
    let s = attack(s0, ap, [{ attacker: r, defender: opp }]);
    s = settle(act(s, { type: "chooseModes", player: ap, modes: [2] }));
    s = passUntil(s, "main2", ap);
    const third = other(s, ap, 2);
    s = settle(cast(s, ap, inZone(s, ap, bolt, "hand"), [{ kind: "player", id: third }]));
    expect(s.players[third]!.life).toBe(35);
    s = settle(cast(s, ap, inZone(s, ap, bolt, "hand"), [target(bt)]));
    expect(s.objects[bt]!.counters.defense).toBe(4);
    s = settle(cast(s, ap, inZone(s, ap, bolt, "hand"), [target(big)]));
    expect(s.objects[big]!.zone).toBe("graveyard");
    expect(s.objects[big]!.damage ?? 0).toBeLessThanOrEqual(3);
  });

  it("Rankle and Torbran: combat damage to a battle triggers it too", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, rankle);
    const bt = battleFor(s0, ap, opp, 9);
    const s = attack(s0, ap, [{ attacker: r, defender: opp, planeswalker: bt }]);
    expect(s.objects[bt]!.counters.defense).toBe(6);
    expect(s.pending).toMatchObject({ kind: "chooseModes", player: ap });
  });

  it("Zurgo and Ojutai: one trigger per player or battle; return one of the Dragons that dealt damage", () => {
    const { s: s0, ap, opp } = setup([]);
    const z = putOnBattlefield(s0, ap, zurgo);
    const sh = putOnBattlefield(s0, ap, shivan);
    const bt = battleFor(s0, ap, opp, 20);
    const top = [inZone(s0, ap, bear(), "library"), inZone(s0, ap, bear({ name: "Runeclaw Bear" }), "library"), inZone(s0, ap, bolt, "library")];
    let s = attack(s0, ap, [{ attacker: z, defender: opp }, { attacker: sh, defender: opp, planeswalker: bt }]);
    expect(s.players[opp]!.life).toBe(36);
    expect(s.objects[bt]!.counters.defense).toBe(15);
    // Two triggers, one for the player and one for the battle: each looks at three cards and offers to return the one
    // Dragon that dealt that damage.
    const looked: string[] = [];
    const offered: number[] = [];
    let mays = 0;
    for (let i = 0; i < 100 && (s.pending || s.stack.length || s.triggerQueue.length || s.resolving); i++) {
      const p = s.pending;
      if (p?.kind === "searchLibrary") {
        expect(p.dig?.looked.length).toBe(3);
        looked.push(p.dig!.looked[0]!);
        s = act(s, { type: "searchLibrary", player: ap, found: [p.dig!.looked[0]!] });
      } else if (p?.kind === "arrangeTop") s = act(s, { type: "arrangeTop", player: ap, top: p.cards, away: [] });
      else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: ap, yes: mays++ === 0 });
      else if (p?.kind === "pickPermanents") {
        offered.push(p.options.length);
        s = act(s, { type: "pickPermanents", player: ap, ids: p.options.slice(0, 1) });
      } else if (p) throw new Error(`unexpected ${p.kind}`);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(looked.length).toBe(2);
    expect(mays).toBe(2);
    // Only the Dragon that dealt that damage is offered, so the pick needs no prompt.
    expect(offered).toEqual([]);
    expect(looked.every((id) => s.objects[id]!.zone === "hand")).toBe(true);
    expect([z, sh].filter((id) => s.objects[id]!.zone === "hand").length).toBe(1);
    void top;
  });
});
