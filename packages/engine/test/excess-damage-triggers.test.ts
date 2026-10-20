// Abilities that trigger on, or check for, excess damage (CR 120.10): after one or more sources dealt a permanent
// damage at the same time, the damage beyond what was lethal just before (toughness minus damage already marked, or 1
// from a source with deathtouch; loyalty; defense). The permanent is the one it was then (Rith rulings).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passAll, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { cardSource, dealDamage, isFullySupported, planCast, waitingOn, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
function settle(s: GameState) {
  for (let i = 0; i < 60 && (s.stack.length || s.resolving || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}
const named = (s: GameState, name: string) => s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name.replace(/ Token$/, "") === name);

// Real oracle text (Scryfall).
const preyUpon = card("Prey Upon", "Sorcery", "{G}", { keywords: ["Fight"], oracleText: "Target creature you control fights target creature you don't control. (Each deals damage equal to its power to the other.)" });
const lightningBolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });
const angerOfTheGods = card("Anger of the Gods", "Sorcery", "{1}{R}{R}", { oracleText: "Anger of the Gods deals 3 damage to each creature. If a creature dealt damage this way would die this turn, exile it instead." });
const typhoidRats = card("Typhoid Rats", "Creature — Rat", "{B}", { power: "1", toughness: "1", keywords: ["Deathtouch"], oracleText: "Deathtouch (Any amount of damage this deals to a creature is enough to destroy it.)" });
const fallOfCairAndros = card("Fall of Cair Andros", "Enchantment", "{2}{R}", { keywords: ["Amass"], oracleText: "Whenever a creature an opponent controls is dealt excess noncombat damage, amass Orcs X, where X is that excess damage. (Put X +1/+1 counters on an Army you control. It's also an Orc. If you don't control an Army, create a 0/0 black Orc Army creature token first.)\n{7}{R}: This enchantment deals 7 damage to target creature." });
const magmaticGalleon = card("Magmatic Galleon", "Artifact — Vehicle", "{3}{R}{R}", { power: "5", toughness: "5", keywords: ["Treasure", "Crew"], oracleText: "When this Vehicle enters, it deals 5 damage to target creature an opponent controls.\nWhenever one or more creatures your opponents control are dealt excess noncombat damage, create a Treasure token.\nCrew 2" });
const maarika = card("Maarika, Brutal Gladiator", "Legendary Creature — Human Warrior", "{2}{B}{R}{G}", { power: "7", toughness: "4", oracleText: "Maarika, Brutal Gladiator must be blocked if able.\nAs long as it's your turn, Maarika has indestructible.\nWhenever Maarika deals damage to a creature, if that creature was dealt excess damage this turn, that creature's controller sacrifices a noncreature, nonland permanent." });
const electromancer = card("Overclocked Electromancer", "Creature — Lizard Wizard", "{2}{R}", { power: "2", toughness: "2", keywords: ["Double"], oracleText: "At the beginning of combat on your turn, you may pay {E}{E}{E}. If you do, put a +1/+1 counter on this creature.\nWhenever this creature attacks, double its power until end of turn.\nWhenever this creature deals combat damage to a creature, if that creature was dealt excess damage this turn, you get X {E}, where X is that excess damage." });
const rith = card("Rith, Liberated Primeval", "Legendary Creature — Dragon", "{2}{R}{G}{W}", { power: "5", toughness: "5", keywords: ["Flying", "Ward"], oracleText: "Flying, ward {2}\nOther Dragons you control have ward {2}.\nAt the beginning of your end step, if a creature or planeswalker an opponent controlled was dealt excess damage this turn, create a 4/4 red Dragon creature token with flying." });
const aegar = card("Aegar, the Freezing Flame", "Legendary Creature — Giant Wizard", "{1}{U}{R}", { power: "3", toughness: "3", oracleText: "Whenever a creature or planeswalker an opponent controls is dealt excess damage, if a Giant, Wizard, or spell you controlled dealt damage to it this turn, draw a card." });
const mindStone = card("Mind Stone", "Artifact", "{2}", { oracleText: "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card." });
const torch = card("Torch the Witness", "Sorcery", "{X}{R}", { keywords: ["Investigate"], oracleText: "Torch the Witness deals twice X damage to target creature. If excess damage was dealt to that creature this way, investigate. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")" });
const agony = card("Archaic's Agony", "Sorcery", "{4}{R}", { keywords: ["Converge"], oracleText: "Converge — Archaic's Agony deals X damage to target creature, where X is the number of colors of mana spent to cast this spell. Exile cards from the top of your library equal to the excess damage dealt to that creature this way. You may play those cards until the end of your next turn." });
const unleash = card("Unleash the Inferno", "Instant", "{1}{B}{R}{G}", { oracleText: "Unleash the Inferno deals 7 damage to target creature or planeswalker. When it deals excess damage this way, destroy target artifact or enchantment an opponent controls with mana value less than or equal to that amount of excess damage." });
const warcrafting = card("Nahiri's Warcrafting", "Sorcery", "{1}{R}{R}", { oracleText: "Nahiri's Warcrafting deals 5 damage to target creature, planeswalker, or battle. Look at the top X cards of your library, where X is the excess damage dealt this way. You may exile one of those cards. Put the rest on the bottom of your library in a random order. You may play the exiled card this turn." });
const rampage = card("Rhino's Rampage", "Sorcery", "{R/G}", { keywords: ["Fight"], oracleText: "Target creature you control gets +1/+0 until end of turn. It fights target creature an opponent controls. When excess damage is dealt to the creature an opponent controls this way, destroy up to one target noncreature artifact with mana value 3 or less." });
const agniKai = card("The Last Agni Kai", "Instant", "{1}{R}", { keywords: ["Fight"], oracleText: "Target creature you control fights target creature an opponent controls. If the creature the opponent controls is dealt excess damage this way, add that much {R}.\nUntil end of turn, you don't lose unspent red mana as steps and phases end." });
const florian = card("Florian, Voldaren Scion", "Legendary Creature — Vampire Noble", "{1}{B}{R}", { power: "3", toughness: "3", keywords: ["First strike"], oracleText: "First strike\nAt the beginning of each of your postcombat main phases, look at the top X cards of your library, where X is the total amount of life your opponents lost this turn. Exile one of those cards and put the rest on the bottom of your library in a random order. You may play the exiled card this turn." });
const solRing = card("Sol Ring", "Artifact", "{1}", { cmc: 1, oracleText: "{T}: Add {C}{C}." });
const ghostlyPrison = card("Ghostly Prison", "Enchantment", "{2}{W}", { cmc: 3, oracleText: "Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you." });
const big = (p: string, t: string) => bear({ power: p, toughness: t });

describe("excess damage triggers (CR 120.10)", () => {
  it("compile", () => supported(fallOfCairAndros, magmaticGalleon, maarika, electromancer, rith, aegar));

  it("Fall of Cair Andros: amass Orcs equal to the excess noncombat damage", () => {
    const { s: s0, ap, opp, ids } = setup([lightningBolt]);
    putOnBattlefield(s0, ap, fallOfCairAndros);
    const b = putOnBattlefield(s0, opp, big("1", "1"));
    s0.objects[b]!.damage = 0;
    const s = settle(cast(s0, ap, ids[0]!, [target(b)]));
    expect(s.objects[b]!.zone).toBe("graveyard");
    const army = named(s, "Orc Army");
    expect(army).toHaveLength(1);
    expect(s.objects[army[0]!]!.counters["+1/+1"]).toBe(2);
  });

  it("Fall of Cair Andros: damage already marked counts; no excess, no trigger; your own creatures don't count", () => {
    const { s: s0, ap, opp, ids } = setup([lightningBolt, lightningBolt]);
    putOnBattlefield(s0, ap, fallOfCairAndros);
    const b = putOnBattlefield(s0, opp, big("2", "4"));
    s0.objects[b]!.damage = 2;
    let s = settle(cast(s0, ap, ids[0]!, [target(b)]));
    // Lethal was 4 - 2 = 2, so 1 of the 3 was excess.
    expect(s.objects[named(s, "Orc Army")[0]!]!.counters["+1/+1"]).toBe(1);
    const mine = putOnBattlefield(s, ap, big("1", "1"));
    s = settle(cast(s, ap, ids[1]!, [target(mine)]));
    expect(s.objects[named(s, "Orc Army")[0]!]!.counters["+1/+1"]).toBe(1);
    const { s: t0, ap: a2, opp: o2, ids: i2 } = setup([lightningBolt]);
    putOnBattlefield(t0, a2, fallOfCairAndros);
    const c = putOnBattlefield(t0, o2, big("3", "3"));
    const t = settle(cast(t0, a2, i2[0]!, [target(c)]));
    expect(t.objects[c]!.zone).toBe("graveyard");
    expect(named(t, "Orc Army")).toHaveLength(0);
  });

  it("deathtouch: any 1 damage is lethal, so the rest is excess (CR 120.4a, 702.2c)", () => {
    const { s: s0, ap, opp, ids } = setup([preyUpon]);
    putOnBattlefield(s0, ap, fallOfCairAndros);
    const rats = putOnBattlefield(s0, ap, { ...typhoidRats, power: "3" });
    const b = putOnBattlefield(s0, opp, big("1", "5"));
    const s = settle(cast(s0, ap, ids[0]!, [target(rats), target(b)]));
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[named(s, "Orc Army")[0]!]!.counters["+1/+1"]).toBe(2);
  });

  it("Fall of Cair Andros: not combat damage", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, fallOfCairAndros);
    const a = putOnBattlefield(s0, ap, big("5", "5"));
    const b = putOnBattlefield(s0, opp, big("1", "1"));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
    while (s.pending?.kind !== "declareBlockers" || s.pending.player !== opp) s = act(s, s.pending?.kind === "declareBlockers" ? { type: "declareBlockers", player: s.pending.player, blocks: [] } : { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: b, attacker: a }] });
    s = settle(passUntil(s, "endCombat"));
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(named(s, "Orc Army")).toHaveLength(0);
  });

  it("Magmatic Galleon: one Treasure however many creatures were dealt excess damage at once", () => {
    const { s: s0, ap, opp, ids } = setup([angerOfTheGods]);
    putOnBattlefield(s0, ap, magmaticGalleon);
    const third = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    for (const pid of [opp, opp, third]) putOnBattlefield(s0, pid, big("1", "1"));
    const s = settle(cast(s0, ap, ids[0]!, []));
    expect(named(s, "Treasure")).toHaveLength(1);
  });

  it("Rith: a Dragon at your end step if an opponent's creature was dealt excess damage this turn, even one now gone", () => {
    const { s: s0, ap, opp, ids } = setup([lightningBolt]);
    putOnBattlefield(s0, ap, rith);
    const b = putOnBattlefield(s0, opp, big("1", "1"));
    let s = settle(cast(s0, ap, ids[0]!, [target(b)]));
    expect(s.objects[b]!.zone).toBe("graveyard");
    s = settle(passUntil(s, "end", ap));
    s = settle(passAll(s));
    expect(named(s, "Dragon")).toHaveLength(1);
    // Without excess damage, nothing.
    const { s: t0, ap: a2, opp: o2, ids: i2 } = setup([lightningBolt]);
    putOnBattlefield(t0, a2, rith);
    const c = putOnBattlefield(t0, o2, big("3", "3"));
    let t = settle(cast(t0, a2, i2[0]!, [target(c)]));
    t = settle(passAll(settle(passUntil(t, "end", a2))));
    expect(named(t, "Dragon")).toHaveLength(0);
  });

  it("Aegar: draws when your spell dealt the excess", () => {
    const { s: s0, ap, opp, ids } = setup([lightningBolt]);
    putOnBattlefield(s0, ap, aegar);
    const b = putOnBattlefield(s0, opp, big("1", "1"));
    const hand = s0.players[ap]!.hand.length;
    const s = settle(cast(s0, ap, ids[0]!, [target(b)]));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
  });

  it("Aegar: your spell's damage earlier this turn counts when another player's spell deals the excess (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([lightningBolt]);
    putOnBattlefield(s0, ap, aegar);
    const b = putOnBattlefield(s0, opp, big("4", "4"));
    const hand = s0.players[ap]!.hand.length;
    let s = settle(cast(s0, ap, ids[0]!, [target(b)]));
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    const third = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    dealDamage(s, { ...cardSource(lightningBolt, third), spell: true }, { object: s.objects[b]! }, 3);
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand);
  });

  it("Aegar: another player's spell alone doesn't count", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, aegar);
    const b = putOnBattlefield(s0, opp, big("1", "1"));
    const third = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const hand = s0.players[ap]!.hand.length;
    dealDamage(s0, { ...cardSource(lightningBolt, third), spell: true }, { object: s0.objects[b]! }, 3);
    const s = settle(s0);
    expect(s.players[ap]!.hand.length).toBe(hand);
  });

  it("Maarika: the creature's controller sacrifices a noncreature, nonland permanent after excess damage", () => {
    const { s: s0, ap, opp, ids } = setup([preyUpon]);
    const m = putOnBattlefield(s0, ap, maarika);
    const b = putOnBattlefield(s0, opp, big("1", "1"));
    const stone = putOnBattlefield(s0, opp, mindStone);
    let s = settle(cast(s0, ap, ids[0]!, [target(m), target(b)]));
    for (let i = 0; i < 5 && s.pending; i++) s = settle(act(s, { type: "pickPermanents", player: s.pending.player, ids: [stone] } as never));
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[stone]!.zone).toBe("graveyard");
  });

  it("Maarika: no excess, no sacrifice", () => {
    const { s: s0, ap, opp, ids } = setup([preyUpon]);
    const m = putOnBattlefield(s0, ap, maarika);
    const b = putOnBattlefield(s0, opp, big("1", "7"));
    const stone = putOnBattlefield(s0, opp, mindStone);
    const s = settle(cast(s0, ap, ids[0]!, [target(m), target(b)]));
    expect(s.objects[stone]!.zone).toBe("battlefield");
  });

  it("Overclocked Electromancer: energy equal to the excess combat damage it dealt", () => {
    const { s: s0, ap, opp } = setup([]);
    const e = putOnBattlefield(s0, ap, electromancer);
    const b = putOnBattlefield(s0, opp, big("1", "1"));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: e, defender: opp }] });
    // Its attack trigger doubles its power to 4.
    while (s.pending?.kind !== "declareBlockers" || s.pending.player !== opp) s = act(s, s.pending?.kind === "declareBlockers" ? { type: "declareBlockers", player: s.pending.player, blocks: [] } : { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: b, attacker: e }] });
    s = settle(passUntil(s, "endCombat"));
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.players[ap]!.energy).toBe(3);
  });
});

describe("excess damage dealt this way (CR 120.10)", () => {
  it("compile", () => supported(torch, agony, unleash, warcrafting, rampage, agniKai, florian));

  it("Torch the Witness: twice X damage, a Clue only with excess", () => {
    const { s: s0, ap, opp, ids } = setup([torch, torch]);
    const b = putOnBattlefield(s0, opp, big("2", "3"));
    let s = settle(passAll(((st) => { for (const a of planCast(st, ap, ids[0]!, [target(b)], undefined, undefined, 1)!) st = act(st, a); return st; })(s0)));
    expect(s.objects[b]!.damage).toBe(2);
    expect(named(s, "Clue")).toHaveLength(0);
    const c = putOnBattlefield(s, opp, big("2", "3"));
    for (const a of planCast(s, ap, ids[1]!, [target(c)], undefined, undefined, 2)!) s = act(s, a);
    s = settle(passAll(s));
    expect(s.objects[c]!.zone).toBe("graveyard");
    expect(named(s, "Clue")).toHaveLength(1);
  });

  it("Archaic's Agony: exiles the excess from the top of your library, playable until the end of your next turn", () => {
    const { s: s0, ap, opp, ids } = setup([agony]);
    const b = putOnBattlefield(s0, opp, big("1", "1"));
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!, [target(b)])!) s = act(s, a);
    const colors = s.objects[ids[0]!]!.colorsSpent?.length ?? 0;
    expect(colors).toBeGreaterThan(1);
    const top = s.players[ap]!.library.slice(0, colors - 1);
    s = settle(passAll(s));
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(top.every((id) => s.objects[id]!.zone === "exile" && s.objects[id]!.mayPlay?.until === "nextTurn")).toBe(true);
    expect(s.objects[s.players[ap]!.library[0]!]!.zone).toBe("library");
  });

  it("Unleash the Inferno: destroys an artifact with mana value up to the excess", () => {
    const { s: s0, ap, opp, ids } = setup([unleash]);
    const b = putOnBattlefield(s0, opp, big("5", "5"));
    const ring = putOnBattlefield(s0, opp, solRing);
    const aura = putOnBattlefield(s0, opp, ghostlyPrison);
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!, [target(b)])!) s = act(s, a);
    s = passAll(s);
    // The reflexive trigger's X is 2: Sol Ring (1) can be chosen, the 3-mana Aura can't.
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets" && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("chooseTargets");
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [target(aura)] } as never)).toThrow();
    s = act(s, { type: "chooseTargets", player: ap, targets: [target(ring)] } as never);
    s = settle(s);
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[ring]!.zone).toBe("graveyard");
    expect(s.objects[aura]!.zone).toBe("battlefield");
  });

  it("Unleash the Inferno: no excess, no trigger", () => {
    const { s: s0, ap, opp, ids } = setup([unleash]);
    const b = putOnBattlefield(s0, opp, big("7", "7"));
    const ring = putOnBattlefield(s0, opp, solRing);
    const s = settle(cast(s0, ap, ids[0]!, [target(b)]));
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[ring]!.zone).toBe("battlefield");
  });

  it("Nahiri's Warcrafting: look at the excess, exile one you may play this turn, the rest on the bottom", () => {
    const { s: s0, ap, opp, ids } = setup([warcrafting]);
    const b = putOnBattlefield(s0, opp, big("2", "2"));
    const top = s0.players[ap]!.library.slice(0, 3);
    let s = settle(cast(s0, ap, ids[0]!, [target(b)]));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 1 });
    expect((s.pending as { cards: string[] }).cards).toEqual(top);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [top[1]!] }));
    expect(s.objects[top[1]!]!.zone).toBe("exile");
    expect(s.objects[top[1]!]!.mayPlay?.until).toBe("thisTurn");
    const lib = s.players[ap]!.library;
    expect(lib.slice(-2).sort()).toEqual([top[0]!, top[2]!].sort());
  });

  it("Rhino's Rampage: the reflexive trigger only with excess damage to the opponent's creature", () => {
    const { s: s0, ap, opp, ids } = setup([rampage]);
    const mine = putOnBattlefield(s0, ap, big("3", "5"));
    const b = putOnBattlefield(s0, opp, big("1", "2"));
    const ring = putOnBattlefield(s0, opp, solRing);
    let s = cast(s0, ap, ids[0]!, [target(mine), target(b)]);
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets" && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [target(ring)] } as never);
    s = settle(s);
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[ring]!.zone).toBe("graveyard");
    const { s: t0, ap: a2, opp: o2, ids: i2 } = setup([rampage]);
    const m2 = putOnBattlefield(t0, a2, big("1", "5"));
    const c = putOnBattlefield(t0, o2, big("1", "2"));
    const r2 = putOnBattlefield(t0, o2, solRing);
    const t = settle(cast(t0, a2, i2[0]!, [target(m2), target(c)]));
    expect(t.objects[c]!.zone).toBe("graveyard");
    expect(t.objects[r2]!.zone).toBe("battlefield");
  });

  it("The Last Agni Kai: red mana equal to the excess, kept as steps end this turn", () => {
    const { s: s0, ap, opp, ids } = setup([agniKai]);
    const mine = putOnBattlefield(s0, ap, big("5", "5"));
    const b = putOnBattlefield(s0, opp, big("1", "2"));
    let s = settle(cast(s0, ap, ids[0]!, [target(mine), target(b)]));
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.players[ap]!.manaPool.R).toBe(3);
    s = passUntil(s, "main2", ap);
    expect(s.players[ap]!.manaPool.R).toBe(3);
    s = passUntil(s, "upkeep");
    expect(s.players[ap]!.manaPool.R).toBe(0);
  });

  it("Florian: at your postcombat main phase, look at as many cards as life your opponents lost", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, florian);
    s0.players[opp]!.life -= 2;
    ((s0.turnLog ??= {}).lifeLost ??= {})[opp] = 2;
    const top = s0.players[ap]!.library.slice(0, 2);
    let s = passUntil(s0, "main2", ap);
    for (let i = 0; i < 10 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 1, max: 1 });
    expect((s.pending as { cards: string[] }).cards).toEqual(top);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [top[0]!] }));
    expect(s.objects[top[0]!]!.zone).toBe("exile");
    expect(s.objects[top[0]!]!.mayPlay?.until).toBe("thisTurn");
  });
});
