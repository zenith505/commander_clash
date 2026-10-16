// Playing with the top card of a library revealed (CR 401.5), playing cards from the top of your library
// (Courser of Kruphix, Future Sight), revealed hands (Telepathy), and "for each other attacking Goblin".

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, castProblem, handRevealed, power, isFullySupported, legalActions, planCast, topPlayable, topRevealed, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Put a fresh copy of `def` on top of `pid`'s library. */
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
};

// Real oracle text (Scryfall).
const courser = card("Courser of Kruphix", "Enchantment Creature — Centaur", "{1}{G}{G}", { power: "2", toughness: "4", keywords: ["Landfall"], oracleText: "Play with the top card of your library revealed.\nYou may play lands from the top of your library.\nLandfall — Whenever a land you control enters, you gain 1 life." });
const horde = card("Garruk's Horde", "Creature — Beast", "{5}{G}{G}", { power: "7", toughness: "7", keywords: ["Trample"], oracleText: "Trample\nPlay with the top card of your library revealed.\nYou may cast creature spells from the top of your library. (Do this only any time you could cast that creature spell. You still pay the spell's costs.)" });
const futureSight = card("Future Sight", "Enchantment", "{2}{U}{U}{U}", { oracleText: "Play with the top card of your library revealed.\nYou may play lands and cast spells from the top of your library." });
const telepathy = card("Telepathy", "Enchantment", "{U}", { oracleText: "Your opponents play with their hands revealed." });
const revelation = card("Revelation", "World Enchantment", "{G}", { oracleText: "Players play with their hands revealed." });
const piledriver = card("Goblin Piledriver", "Creature — Goblin Warrior", "{1}{R}", { power: "1", toughness: "2", keywords: ["Protection"], oracleText: "Protection from blue (This creature can't be blocked, targeted, dealt damage, or enchanted by anything blue.)\nWhenever this creature attacks, it gets +2/+0 until end of turn for each other attacking Goblin." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });

describe("the top of your library", () => {
  it("Courser of Kruphix: the top card is revealed and a land there uses your land play", () => {
    supported(courser, horde, futureSight, telepathy, revelation);
    const { s: s0, ap, opp } = setup([]);
    const s = s0;
    expect(topRevealed(s, ap)).toBe(false);
    putOnBattlefield(s, ap, courser);
    expect(topRevealed(s, ap)).toBe(true);
    expect(topRevealed(s, opp)).toBe(false);
    const land = onTop(s, ap, forest);
    expect(topPlayable(s, ap)).toEqual([land]);
    expect(legalActions(s, ap).some((a) => a.type === "playLand" && a.objectId === land)).toBe(true);
    // Only the top card.
    const under = s.players[ap]!.library[1]!;
    expect(legalActions(s, ap).some((a) => a.type === "playLand" && a.objectId === under)).toBe(false);
    const life = s.players[ap]!.life;
    const t = settle(act(s, { type: "playLand", player: ap, objectId: land }));
    expect(t.objects[land]!.zone).toBe("battlefield");
    expect(t.players[ap]!.life).toBe(life + 1); // landfall
    // That was this turn's land play (CR 305.2).
    const next = onTop(t, ap, forest);
    expect(legalActions(t, ap).some((a) => a.type === "playLand" && a.objectId === next)).toBe(false);
    // Spells on top can't be cast with only Courser.
    const { s: s1, ap: ap1 } = setup([]);
    putOnBattlefield(s1, ap1, courser);
    const b = onTop(s1, ap1, bear());
    expect(castProblem(s1, ap1, b)).toBeTruthy();
  });

  it("Garruk's Horde casts creature spells from the top, at their normal timing, paying their costs", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, horde);
    const b = onTop(s, ap, bear());
    expect(topPlayable(s, ap)).toEqual([b]);
    const plan = planCast(s, ap, b)!;
    expect(plan).toBeTruthy();
    let t = settle(plan.reduce((x, a) => act(x, a), s));
    expect(t.objects[b]!.zone).toBe("battlefield");
    // An instant on top isn't a creature spell, and nothing lets an opponent cast from your library.
    const i = onTop(t, ap, shock);
    expect(castProblem(t, ap, i, [{ kind: "player", id: opp }])).toBeTruthy();
    const land = onTop(t, ap, forest);
    expect(legalActions(t, ap).some((a) => a.type === "playLand" && a.objectId === land)).toBe(false);
    // Sorcery timing still applies to the creature (the reminder text): not on an opponent's turn.
    t.players[ap]!.library.shift();
    t.players[ap]!.library.shift();
    const b2 = onTop(t, ap, bear());
    t = passUntil(t, "upkeep", opp);
    expect(castProblem(t, ap, b2)).toBeTruthy();
  });

  it("Future Sight plays lands and casts any spell from the top; bots use it", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, futureSight);
    const i = onTop(s, ap, shock);
    const life = s.players[opp]!.life;
    const shot = settle(planCast(s, ap, i, [{ kind: "player", id: opp }])!.reduce((x, a) => act(x, a), s));
    expect(shot.objects[i]!.zone).toBe("graveyard");
    expect(shot.players[opp]!.life).toBe(life - 2);
    // Each player only plays from their own library.
    expect(topPlayable(s, opp)).toEqual([]);
    const land = onTop(s, ap, forest);
    s.players[ap]!.hand = [];
    const acts = botActions(s, ap);
    expect(acts.some((a) => a.type === "playLand" && a.objectId === land)).toBe(true);
  });
});

describe("revealed hands", () => {
  it("Telepathy shows your opponents' hands to you only; Revelation shows every hand", () => {
    const { s, ap, opp } = setup([]);
    const third = s.turnOrder[(s.turnOrder.indexOf(ap) + 2) % 4]!;
    expect(handRevealed(s, opp, ap)).toBe(false);
    expect(handRevealed(s, ap, ap)).toBe(true);
    const t = putOnBattlefield(s, ap, telepathy);
    expect(handRevealed(s, opp, ap)).toBe(true);
    expect(handRevealed(s, opp, third)).toBe(true); // revealed means everyone sees it
    expect(handRevealed(s, ap, opp)).toBe(false);
    s.battlefield.splice(s.battlefield.indexOf(t), 1);
    s.objects[t]!.zone = "graveyard";
    putOnBattlefield(s, opp, revelation);
    expect(handRevealed(s, ap, opp)).toBe(true);
    expect(handRevealed(s, opp, ap)).toBe(true);
  });
});

describe("for each other attacking Goblin", () => {
  it("Goblin Piledriver counts the other attacking Goblins, not itself or non-Goblins", () => {
    supported(piledriver);
    const { s: s0, ap, opp } = setup([]);
    const p = putOnBattlefield(s0, ap, piledriver);
    const g1 = putOnBattlefield(s0, ap, bear({ name: "Goblin A", typeLine: "Creature — Goblin", subtypes: ["Goblin"] }));
    const g2 = putOnBattlefield(s0, ap, bear({ name: "Goblin B", typeLine: "Creature — Goblin", subtypes: ["Goblin"] }));
    putOnBattlefield(s0, ap, bear({ name: "Goblin home", typeLine: "Creature — Goblin", subtypes: ["Goblin"] }));
    const b = putOnBattlefield(s0, ap, bear());
    let s = passUntil(s0, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [p, g1, g2, b].map((attacker) => ({ attacker, defender: opp })) }));
    expect(power(s, s.objects[p]!)).toBe(1 + 2 * 2);
  });
});
