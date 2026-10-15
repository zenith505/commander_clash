// Auras with "enchant player" (CR 702.5d, 303.4): Curses. The Aura spell targets a player and enters attached to them;
// it's put into its owner's graveyard if that player leaves the game or it can't legally enchant them (CR 704.5m).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { invalidateCharacteristics } from "../src/layers";
import { botActions, castProblem, isFullySupported, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** A Curse already on the battlefield under `controller`, enchanting `on`. */
const curse = (s: GameState, controller: PlayerId, def: CardDef, on: PlayerId) => {
  const id = putOnBattlefield(s, controller, def);
  s.objects[id]!.attachedToPlayer = on;
  invalidateCharacteristics(s);
  return id;
};
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) =>
  settle(act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks }));
const golds = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === "Gold Token").length;

// Real oracle text (Scryfall).
const tome = card("Curse of the Bloody Tome", "Enchantment — Aura Curse", "{2}{U}", { keywords: ["Enchant", "Mill"], oracleText: "Enchant player\nAt the beginning of enchanted player's upkeep, that player mills two cards." });
const possession = card("Psychic Possession", "Enchantment — Aura", "{2}{U}{U}", { keywords: ["Enchant"], oracleText: "Enchant opponent\nSkip your draw step.\nWhenever enchanted opponent draws a card, you may draw a card." });
const deathsHold = card("Curse of Death's Hold", "Enchantment — Aura Curse", "{3}{B}{B}", { keywords: ["Enchant"], oracleText: "Enchant player\nCreatures enchanted player controls get -1/-1." });
const opulence = card("Curse of Opulence", "Enchantment — Aura Curse", "{R}", { keywords: ["Enchant"], oracleText: 'Enchant player\nWhenever enchanted player is attacked, create a Gold token. Each opponent attacking that player does the same. (A Gold token is an artifact with "Sacrifice this token: Add one mana of any color.")' });
const predation = card("Curse of Predation", "Enchantment — Aura Curse", "{2}{G}", { keywords: ["Enchant"], oracleText: "Enchant player\nWhenever a creature attacks enchanted player, put a +1/+1 counter on it." });
const exhaustion = card("Curse of Exhaustion", "Enchantment — Aura Curse", "{2}{W}{W}", { keywords: ["Enchant"], oracleText: "Enchant player\nEnchanted player can't cast more than one spell each turn." });
const foolsWisdom = card("Curse of Fool's Wisdom", "Enchantment — Aura Curse", "{4}{B}{B}", { keywords: ["Madness", "Enchant"], oracleText: "Enchant player\nWhenever enchanted player draws a card, they lose 2 life and you gain 2 life.\nMadness {3}{B} (If you discard this card, discard it into exile. When you do, cast it for its madness cost or put it into your graveyard.)" });
const trespasser = card("Trespasser's Curse", "Enchantment — Aura Curse", "{1}{B}", { keywords: ["Enchant"], oracleText: "Enchant player\nWhenever a creature enchanted player controls enters, that player loses 1 life and you gain 1 life." });

describe("enchant player", () => {
  it("an Aura spell targets a player and enters attached to them; it triggers only on their turn", () => {
    supported(tome, possession, deathsHold, opulence, predation, exhaustion, foolsWisdom, trespasser);
    const { s: s0, ap, ids, opp } = setup([tome]);
    let s = cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    const o = s.objects[ids[0]!]!;
    expect(o.zone).toBe("battlefield");
    expect(o.attachedToPlayer).toBe(opp);
    expect(o.attachedTo).toBeUndefined();
    const lib = s.players[opp]!.library.length;
    const mine = s.players[ap]!.library.length;
    s = settle(passUntil(s, "upkeep", opp));
    expect(s.players[opp]!.library.length).toBe(lib - 2);
    s = settle(passUntil(s, "draw", ap));
    expect(s.players[ap]!.library.length).toBe(mine - 1); // its draw only, no mill
  });

  it("enchant opponent: can't target yourself; it goes to the graveyard once it can't enchant that player (CR 704.5m)", () => {
    const { s: s0, ap, ids, opp } = setup([possession]);
    expect(castProblem(s0, ap, ids[0]!, [{ kind: "player", id: ap }])).toBeTruthy();
    let s = cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    expect(s.objects[ids[0]!]!.attachedToPlayer).toBe(opp);
    // Its controller changes to the enchanted player, who isn't their own opponent.
    s.objects[ids[0]!]!.controller = opp;
    invalidateCharacteristics(s);
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("a Curse on a player who has lost the game goes to the graveyard", () => {
    const { s: s0, ap, opp } = setup([]);
    const id = curse(s0, ap, deathsHold, opp);
    s0.players[opp]!.life = 0;
    const s = act(s0, { type: "passPriority", player: waitingOn(s0)! });
    expect(s.players[opp]!.lost).toBe(true);
    expect(s.objects[id]!.zone).toBe("graveyard");
  });

  it("Curse of Death's Hold: only creatures the enchanted player controls", () => {
    const { s, ap, opp } = setup([]);
    const theirs = putOnBattlefield(s, opp, bear());
    const mine = putOnBattlefield(s, ap, bear());
    curse(s, ap, deathsHold, opp);
    expect(pt(s, theirs)).toBe("1/1");
    expect(pt(s, mine)).toBe("2/2");
  });

  it("Curse of Opulence: once however many attack; the Curse's controller and each opponent of theirs attacking that player (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear());
    const third = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    curse(s0, third, opulence, opp);
    const s = attack(s0, ap, [
      { attacker: a, defender: opp },
      { attacker: b, defender: opp },
    ]);
    expect(golds(s, third)).toBe(1);
    expect(golds(s, ap)).toBe(1);
    // Its controller attacking: they make one, and they aren't their own opponent.
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const c = putOnBattlefield(s1, ap1, bear());
    curse(s1, ap1, opulence, opp1);
    const t = attack(s1, ap1, [{ attacker: c, defender: opp1 }]);
    expect(golds(t, ap1)).toBe(1);
  });

  it("Curse of Predation: a creature attacking the enchanted player, not another one", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear());
    const other = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    curse(s0, other, predation, opp);
    const s = attack(s0, ap, [
      { attacker: a, defender: opp },
      { attacker: b, defender: other },
    ]);
    expect(s.objects[a]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[b]!.counters["+1/+1"]).toBeUndefined();
  });

  it("Curse of Exhaustion: the enchanted player can't cast a second spell in a turn", () => {
    const { s: s0, ap, ids } = setup([bear({ name: "Bear One" }), bear({ name: "Bear Two" })]);
    const other = s0.turnOrder.find((p) => p !== ap)!;
    curse(s0, other, exhaustion, ap);
    const s = cast(s0, ap, ids[0]!);
    expect(castProblem(s, ap, ids[1]!)).toMatch(/more than one spell/);
  });

  it("Curse of Fool's Wisdom and Trespasser's Curse: what the enchanted player does", () => {
    const { s: s0, ap, ids } = setup([bear()]);
    const other = s0.turnOrder.find((p) => p !== ap)!;
    curse(s0, other, trespasser, ap);
    let s = cast(s0, ap, ids[0]!);
    s = settle(s);
    expect(s.players[ap]!.life).toBe(39);
    expect(s.players[other]!.life).toBe(41);
    curse(s, other, foolsWisdom, ap);
    s = settle(passUntil(s, "draw", ap, 4000));
    s = settle(passUntil(s, "main1", ap));
    expect(s.players[ap]!.life).toBe(37);
    expect(s.players[other]!.life).toBe(43);
  });

  it("a bot casts its Curse on an opponent", () => {
    const { s: s0, ap, ids } = setup([deathsHold]);
    s0.players[ap]!.hand = [ids[0]!];
    s0.players[ap]!.landsPlayedThisTurn = 1;
    let s = s0;
    for (let i = 0; i < 200 && s.objects[ids[0]!]!.zone === "hand" && s.activePlayer === ap; i++) s = botActions(s, waitingOn(s)!).reduce((x, a) => act(x, a), s);
    s = settle(s);
    const on = s.objects[ids[0]!]!.attachedToPlayer;
    expect(on).toBeDefined();
    expect(on).not.toBe(ap);
  });
});
