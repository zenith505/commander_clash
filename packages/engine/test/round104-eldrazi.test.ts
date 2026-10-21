// Round 104: Kozilek, the Great Distortion ("draw cards equal to the difference"; "Discard a card with mana value X:
// counter target spell with mana value X", X announced first, CR 107.3a, 602.2b), Damia and Iymrith (the same draw),
// Ulamog, the Defiler (half a library exiled, rounded up; counters from the greatest mana value in exile; annihilator X),
// Ojer Axonil (noncombat damage raised to its power, CR 614.1a) and Temple of Power's condition, The Grey Havens,
// maximum hand sizes (CR 402.2).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, scry, setup } from "./helpers";
import { abilityProblem, isFullySupported, manaAbilitiesOn, manaChoices, maxHandSize, planActivate, planCast, staticConditionNow, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const kozilek = card("Kozilek, the Great Distortion", "Legendary Creature — Eldrazi", "{8}{C}{C}", { power: "12", toughness: "12", keywords: ["Menace"], oracleText: "When you cast this spell, if you have fewer than seven cards in hand, draw cards equal to the difference.\nMenace\nDiscard a card with mana value X: Counter target spell with mana value X." });
const ulamog = card("Ulamog, the Defiler", "Legendary Creature — Eldrazi", "{10}", { power: "7", toughness: "7", keywords: ["Ward"], oracleText: "When you cast this spell, target opponent exiles the top half of their library, rounded up.\nWard—Sacrifice two permanents.\nUlamog enters with a number of +1/+1 counters on it equal to the greatest mana value among cards in exile.\nUlamog has annihilator X, where X is the number of +1/+1 counters on it." });
const havens = card("The Grey Havens", "Legendary Land", "", { keywords: ["Scry"], oracleText: "When The Grey Havens enters, scry 1.\n{T}: Add {C}.\n{T}: Add one mana of any color among legendary creature cards in your graveyard." });
const damia = card("Damia, Sage of Stone", "Legendary Creature — Gorgon Wizard", "{4}{B}{G}{U}", { power: "4", toughness: "4", keywords: ["Deathtouch"], oracleText: "Deathtouch\nSkip your draw step.\nAt the beginning of your upkeep, if you have fewer than seven cards in hand, draw cards equal to the difference." });
const iymrith = card("Iymrith, Desert Doom", "Legendary Creature — Dragon", "{3}{U}{U}", { power: "5", toughness: "5", keywords: ["Flying"], oracleText: "Flying\nIymrith has ward {4} as long as it's untapped.\nWhenever Iymrith deals combat damage to a player, draw a card. Then if you have fewer than three cards in hand, draw cards equal to the difference." });
const octopus = card("Doctor Octopus, Master Planner", "Legendary Creature — Human Scientist Villain", "{5}{U}{B}", { power: "4", toughness: "8", oracleText: "Other Villains you control get +2/+2.\nYour maximum hand size is eight.\nAt the beginning of your end step, if you have fewer than eight cards in hand, draw cards equal to the difference." });
const jin = card("Jin-Gitaxias, Core Augur", "Legendary Creature — Phyrexian Praetor", "{8}{U}{U}", { power: "5", toughness: "4", keywords: ["Flash"], oracleText: "Flash\nAt the beginning of your end step, draw seven cards.\nEach opponent's maximum hand size is reduced by seven." });
const ojer = scry("transform", [
  { name: "Ojer Axonil, Deepest Might", mana_cost: "{2}{R}{R}", type_line: "Legendary Creature — God", power: "4", toughness: "4", oracle_text: "Trample\nIf a red source you control would deal an amount of noncombat damage less than Ojer Axonil's power to an opponent, that source deals damage equal to Ojer Axonil's power instead.\nWhen Ojer Axonil dies, return it to the battlefield tapped and transformed under its owner's control." },
  { name: "Temple of Power", type_line: "Land", oracle_text: "(Transforms from Ojer Axonil, Deepest Might.)\n{T}: Add {R}.\n{2}{R}, {T}: Transform this land. Activate only if red sources you controlled dealt 4 or more noncombat damage this turn and only as a sorcery." },
], { keywords: ["Transform", "Trample"] });

// Test cards.
const three = (n: string) => card(n, "Sorcery", "{2}{R}", { oracleText: "You gain 1 life." });
const ping = card("Ping", "Sorcery", "{R}", { oracleText: "Ping deals 1 damage to any target." });
const blue = card("Blue Ping", "Sorcery", "{U}", { oracleText: "Blue Ping deals 1 damage to any target." });
const legend = (n: string, cost: string) => card(n, "Legendary Creature — Elf", cost, { power: "1", toughness: "1" });
const wastes = card("Wastes", "Basic Land", "", { oracleText: "{T}: Add {C}." });
const bear = card("Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });

const run = (s: GameState, plan: ReturnType<typeof planCast>) => plan!.reduce((x, a) => act(x, a), s);
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const toZone = (s: GameState, pid: number, def: ReturnType<typeof card>, zone: "hand" | "graveyard" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  s.players[pid]![zone].push(id);
  return id;
};

describe("round 104: Eldrazi and the other starting cards", () => {
  it("parse", () => [kozilek, ulamog, havens, damia, iymrith, octopus, jin, ojer].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Kozilek: casting it draws up to seven cards in hand", () => {
    const { s: s0, ap, ids } = setup([kozilek, bear]);
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, ap, wastes);
    s0.players[ap]!.hand = [...ids];
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    // Kozilek was on the stack; Bear was the one card left, so six more.
    expect(s.players[ap]!.hand.length).toBe(7);
  });

  it("Kozilek: X is announced, then a spell with that mana value is countered by discarding a card with it", () => {
    const { s: s0, ap, opp, ids } = setup([three("Spell")]);
    const k = putOnBattlefield(s0, opp, kozilek);
    const two = toZone(s0, opp, card("Two", "Sorcery", "{1}{U}"), "hand");
    const match = toZone(s0, opp, three("Match"), "hand");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    const top = s.stack[s.stack.length - 1]!;
    // Before X is announced, the ability is usable because X = 3 fits both the cost and a target; not with no card for it.
    expect(abilityProblem(s, opp, k, 0)).toBeNull();
    const hand = s.players[opp]!.hand;
    s.players[opp]!.hand = [two];
    expect(abilityProblem(s, opp, k, 0)).not.toBeNull();
    s.players[opp]!.hand = hand;
    // X = 2: the spell's mana value is 3, so it can't be the target; and the card must have mana value X.
    expect(planActivate(s, opp, k, 0, [{ kind: "stack", id: top.id }], undefined, undefined, 2, { discard: [two] })).toBeNull();
    expect(planActivate(s, opp, k, 0, [{ kind: "stack", id: top.id }], undefined, undefined, 3, { discard: [two] })).toBeNull();
    s = settle(run(s, planActivate(s, opp, k, 0, [{ kind: "stack", id: top.id }], undefined, undefined, 3, { discard: [match] })));
    expect(s.objects[match]!.zone).toBe("graveyard");
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(s0.players[ap]!.life);
  });

  it("Damia: at upkeep, draws up to seven", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, damia);
    s0.players[ap]!.hand = [];
    const s = passUntil(settle(passUntil(s0, "upkeep", ap)), "main1", ap);
    expect(s.players[ap]!.hand.length).toBe(7);
  });

  it("Ulamog: casting it exiles the top half of an opponent's library, rounded up; it enters with counters", () => {
    const { s: s0, ap, opp, ids } = setup([ulamog]);
    const lib = s0.players[opp]!.library.length;
    toZone(s0, ap, card("Big", "Sorcery", "{9}"), "exile");
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined));
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] });
    s = settle(s);
    expect(s.players[opp]!.library.length).toBe(lib - Math.ceil(lib / 2));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    // The greatest mana value among cards in exile: 9.
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(9);
  });

  it("Ulamog: annihilator X is the number of +1/+1 counters on it as it resolves", () => {
    const { s: s0, ap, opp } = setup([]);
    const u = putOnBattlefield(s0, ap, ulamog);
    s0.objects[u]!.counters = { "+1/+1": 3 };
    const before = s0.battlefield.filter((id) => s0.objects[id]!.controller === opp).length;
    for (let i = 0; i < 5; i++) putOnBattlefield(s0, opp, bear);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: u, defender: opp }] });
    s = settle(s);
    if (s.pending?.kind === "pickPermanents") {
      const p = s.pending;
      expect(p.count).toBe(3);
      s = settle(act(s, { type: "pickPermanents", player: p.player, ids: p.options.slice(0, p.count) }));
    }
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === opp).length).toBe(before + 5 - 3);
  });

  it("Ojer Axonil: a red source's noncombat damage to an opponent becomes its power; not to creatures, not blue", () => {
    const { s: s0, ap, opp, ids } = setup([ping, ping, blue]);
    putOnBattlefield(s0, ap, ojer);
    const b = putOnBattlefield(s0, opp, card("Wall", "Creature — Wall", "{1}", { power: "0", toughness: "5" }));
    const life = s0.players[opp]!.life;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(life - 4);
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: b }])));
    expect(s.objects[b]!.damage).toBe(1);
    s = settle(run(s, planCast(s, ap, ids[2]!, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(life - 5);
    // Temple of Power: red sources dealt 4 + 1 noncombat damage this turn.
    expect(staticConditionNow(s, { kind: "noncombatByColor", color: "R", n: 4 }, b, ap)).toBe(true);
    expect(staticConditionNow(s, { kind: "noncombatByColor", color: "U", n: 4 }, b, ap)).toBe(false);
  });

  it("The Grey Havens: any color among legendary creature cards in your graveyard", () => {
    const { s, ap } = setup([]);
    const h = putOnBattlefield(s, ap, havens);
    toZone(s, ap, legend("Green Legend", "{G}"), "graveyard");
    toZone(s, ap, legend("Black Legend", "{B}"), "graveyard");
    toZone(s, ap, card("Red Plain", "Creature — Elf", "{R}", { power: "1", toughness: "1" }), "graveyard");
    const abs = manaAbilitiesOn(s, s.objects[h]!);
    expect(abs.length).toBe(2);
    expect(manaChoices(s, s.objects[h]!, abs[1]!).sort()).toEqual(["B", "G"]);
  });

  it("maximum hand size: Doctor Octopus's eight, Jin-Gitaxias's minus seven for opponents", () => {
    const { s, ap, opp } = setup([]);
    expect(maxHandSize(s, ap)).toBe(7);
    putOnBattlefield(s, ap, octopus);
    expect(maxHandSize(s, ap)).toBe(8);
    putOnBattlefield(s, ap, jin);
    expect(maxHandSize(s, ap)).toBe(8);
    expect(maxHandSize(s, opp)).toBe(0);
  });
});
