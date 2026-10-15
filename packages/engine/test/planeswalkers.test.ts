// Planeswalkers (CR 306): loyalty (306.5), loyalty abilities (CR 606), damage to planeswalkers (CR 120.3c, 306.8), the
// state-based action for 0 loyalty (704.5i), and attacking planeswalkers (CR 506.2, 506.4c, 508.1b, 802.3).

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { abilityProblem, botActions, isFullySupported, planActivate, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const garruk = card("Garruk Wildspeaker", "Legendary Planeswalker — Garruk", "{2}{G}{G}", {
  loyalty: "3",
  oracleText: "+1: Untap two target lands.\n−1: Create a 3/3 green Beast creature token.\n−4: Creatures you control get +3/+3 and gain trample until end of turn.",
});
const vraska = card("Vraska, Regal Gorgon", "Legendary Planeswalker — Vraska", "{5}{B}{G}", {
  loyalty: "5",
  oracleText: "+2: Put a +1/+1 counter on up to one target creature. That creature gains menace until end of turn.\n−3: Destroy target creature.\n−10: For each creature card in your graveyard, put a +1/+1 counter on each creature you control.",
});
const freyalise = card("Freyalise, Llanowar's Fury", "Legendary Planeswalker — Freyalise", "{3}{G}{G}", {
  loyalty: "3",
  oracleText: "+2: Create a 1/1 green Elf Druid creature token with \"{T}: Add {G}.\"\n−2: Destroy target artifact or enchantment.\n−6: Draw a card for each green creature you control.\nFreyalise, Llanowar's Fury can be your commander.",
});
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const trampler = card("Craw Wurm", "Creature — Wurm", "{4}{G}{G}", { power: "6", toughness: "4", keywords: ["Trample"], oracleText: "Trample" });
const flyer = card("Wind Drake", "Creature — Drake", "{2}{U}", { power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying" });
const dethroner = card("Marchesa's Emissary", "Creature — Human Rogue", "{3}{U}", { power: "2", toughness: "2", keywords: ["Hexproof", "Dethrone"], oracleText: "Hexproof\nDethrone (Whenever this creature attacks the player with the most life or tied for most life, put a +1/+1 counter on it.)" });

const bot = (s: GameState): Action => botActions(s, waitingOn(s)!)[0]!;
/** Everyone passes to the end of combat; bots of `bots` act; pending choices go to the bot logic. */
function toEndOfCombat(s: GameState, bots: PlayerId[] = []) {
  for (let i = 0; i < 300 && !(s.step === "endCombat" && !s.pending && !s.stack.length); i++) {
    const pend = s.pending;
    if (pend?.kind === "declareBlockers" && !bots.includes(pend.player)) s = act(s, { type: "declareBlockers", player: pend.player, blocks: [] });
    else if (pend) s = act(s, bot(s));
    else if (bots.includes(waitingOn(s)!)) s = act(s, bot(s));
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
}
const loyalty = (s: GameState, id: string) => s.objects[id]!.counters.loyalty ?? 0;

describe("planeswalkers (CR 306)", () => {
  it("compile, with loyalty abilities; 'can be your commander' is deck construction", () => {
    supported(garruk, vraska, freyalise);
  });

  it("enter with their printed loyalty, and a loyalty ability costs loyalty counters (CR 306.5b, 606.4)", () => {
    const { s: s0, ap, ids } = setup([garruk]);
    let s = cast(s0, ap, ids[0]!);
    const g = ids[0]!;
    expect(s.objects[g]!.zone).toBe("battlefield");
    expect(loyalty(s, g)).toBe(3);
    // −1: a 3/3 Beast.
    s = activate(s, ap, g, 1);
    expect(loyalty(s, g)).toBe(2);
    expect(s.battlefield.some((id) => s.cards[s.objects[id]!.cardId]!.name === "Beast Token")).toBe(true);
    // Only one loyalty ability per planeswalker each turn (CR 606.3).
    expect(abilityProblem(s, ap, g, 0)).toMatch(/already activated this turn/);
    // Not at instant speed: not on another player's turn, nor in combat.
    s = passUntil(s, "upkeep");
    expect(abilityProblem(s, s.activePlayer, g, 0)).not.toBeNull();
  });

  it("a negative cost needs that many loyalty counters (CR 606.6); +N adds them", () => {
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, garruk);
    s0.objects[g]!.counters.loyalty = 3;
    expect(abilityProblem(s0, ap, g, 2)).toMatch(/doesn't have 4 loyalty/);
    const lands = s0.battlefield.filter((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Forest").slice(0, 2);
    for (const l of lands) s0.objects[l]!.tapped = true;
    const s = activate(s0, ap, g, 0, lands.map(target));
    expect(loyalty(s, g)).toBe(4);
    expect(lands.every((l) => !s.objects[l]!.tapped)).toBe(true);
  });

  it("damage removes loyalty (CR 120.3c), and with none left it's put into the graveyard (704.5i)", () => {
    const { s: s0, ap, opp, ids } = setup([shock, shock]);
    const v = putOnBattlefield(s0, opp, vraska);
    s0.objects[v]!.counters.loyalty = 4;
    let s = cast(s0, ap, ids[0]!, [target(v)]);
    expect(loyalty(s, v)).toBe(2);
    expect(s.objects[v]!.damage).toBe(0);
    s = cast(s, ap, ids[1]!, [target(v)]);
    expect(s.objects[v]!.zone).toBe("graveyard");
  });

  it("can be attacked: unblocked damage goes to the planeswalker, not its controller, and isn't commander damage", () => {
    const { s: s0, ap, opp } = setup([]);
    const v = putOnBattlefield(s0, opp, vraska);
    s0.objects[v]!.counters.loyalty = 5;
    const cmdr = putOnBattlefield(s0, ap, bear({ name: "Bear Commander", power: "3", toughness: "3" }), { commander: true });
    const d = putOnBattlefield(s0, ap, dethroner);
    let s = passUntil(s0, "declareAttackers", ap);
    // Only a planeswalker the defending player controls (CR 508.1b).
    const other = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: cmdr, defender: other, planeswalker: v }] })).toThrow(/planeswalker that player controls/);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: cmdr, defender: opp, planeswalker: v }, { attacker: d, defender: opp, planeswalker: v }] });
    expect(s.objects[cmdr]!.attacking).toBe(opp); // the defending player is the planeswalker's controller (CR 506.2)
    const life = s.players[opp]!.life;
    s = toEndOfCombat(s);
    expect(s.players[opp]!.life).toBe(life);
    expect(s.objects[v]!.zone).toBe("graveyard"); // 3 + 2 damage, 5 loyalty
    expect(s.players[opp]!.commanderDamage[cmdr]).toBeUndefined();
    // Dethrone doesn't trigger when it attacks a planeswalker (rulings).
    expect(s.objects[d]!.counters["+1/+1"]).toBeUndefined();
  });

  it("trample over a blocker hits the planeswalker; one removed from combat takes nothing (CR 702.19c, 506.4c)", () => {
    const { s: s0, ap, opp, ids } = setup([shock, shock]);
    const v = putOnBattlefield(s0, opp, vraska);
    s0.objects[v]!.counters.loyalty = 5;
    const w = putOnBattlefield(s0, ap, trampler);
    const b = putOnBattlefield(s0, opp, bear());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: w, defender: opp, planeswalker: v }] });
    for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: b, attacker: w }] });
    const t = structuredClone(s);
    s = toEndOfCombat(s);
    expect(loyalty(s, v)).toBe(1); // 2 to the Bears, 4 to Vraska
    // Shock Vraska out of combat before damage: the Wurm, still blocked, deals all 6 to the Bears.
    let u = t;
    u.objects[v]!.counters.loyalty = 4;
    while (waitingOn(u) !== ap) u = act(u, { type: "passPriority", player: waitingOn(u)! });
    u = cast(u, ap, ids[0]!, [target(v)]);
    u = cast(u, ap, ids[1]!, [target(v)]);
    expect(u.objects[v]!.zone).toBe("graveyard");
    expect(u.objects[w]!.attacking).toBe(opp); // still attacking (CR 506.4c)
    const life = u.players[opp]!.life;
    u = toEndOfCombat(u);
    expect(u.players[opp]!.life).toBe(life);
  });

  it("a goaded creature attacks a player other than the goader rather than a planeswalker (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const v = putOnBattlefield(s0, opp, vraska);
    s0.objects[v]!.counters.loyalty = 5;
    const mine = putOnBattlefield(s0, ap, bear());
    s0.effects.push({ id: "g", timestamp: s0.nextTimestamp++, controller: opp, sourceName: "Goad", duration: "yourNextTurn", turnOf: opp, affected: [mine], mods: [{ kind: "goad" }] });
    const s = passUntil(s0, "declareAttackers", ap);
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: mine, defender: opp, planeswalker: v }] })).toThrow(/goaded/);
    const other = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: mine, defender: other }] })).not.toThrow();
  });

  it("bots use loyalty abilities, and attack a planeswalker they can kill when the player isn't in reach", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, garruk);
    s0.objects[g]!.counters.loyalty = 3;
    let s = s0;
    const before = s.battlefield.length;
    for (let i = 0; i < 40 && loyalty(s, g) === 3; i++) s = act(s, waitingOn(s) === ap ? bot(s) : { type: "passPriority", player: waitingOn(s)! });
    expect(loyalty(s, g)).not.toBe(3);
    expect(s.battlefield.length).toBeGreaterThanOrEqual(before);

    const { s: t0, ap: ap2, opp: opp2 } = setup([]);
    const v = putOnBattlefield(t0, opp2, vraska);
    t0.objects[v]!.counters.loyalty = 2;
    const f = putOnBattlefield(t0, ap2, flyer);
    putOnBattlefield(t0, opp2, bear());
    const t = passUntil(t0, "declareAttackers", ap2);
    const decl = bot(t) as Extract<Action, { type: "declareAttackers" }>;
    expect(decl.attacks).toContainEqual({ attacker: f, defender: opp2, planeswalker: v });
    void planActivate;
  });
});
