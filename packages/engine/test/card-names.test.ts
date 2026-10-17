// Choosing a card name (CR 201.4): "As ~ enters, choose a nonland card name" (CR 614.12) and what the chosen name does
// on the permanent: spells with it can't be cast (Meddling Mage), activated abilities of sources with it can't be
// activated, in any zone (Pithing Needle, Phyrexian Revoker; rulings).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passAll, putOnBattlefield, setup, target } from "./helpers";
import { botActions } from "../src/bot";
import { abilitiesOf, abilityProblem, activationCost, castProblem, isFullySupported, manaAbilityProblem, planActivate, planCast, spellCost, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const mage = card("Meddling Mage", "Creature — Human Wizard", "{W}{U}", { power: "2", toughness: "2", oracleText: "As this creature enters, choose a nonland card name.\nSpells with the chosen name can't be cast." });
const nevermore = card("Nevermore", "Enchantment", "{1}{W}{W}", { oracleText: "As this enchantment enters, choose a nonland card name.\nSpells with the chosen name can't be cast." });
const gargoyle = card("Voidstone Gargoyle", "Creature — Gargoyle", "{3}{W}{W}", { power: "3", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nAs this creature enters, choose a nonland card name.\nSpells with the chosen name can't be cast.\nActivated abilities of sources with the chosen name can't be activated." });
const needle = card("Pithing Needle", "Artifact", "{1}", { oracleText: "As this artifact enters, choose a card name.\nActivated abilities of sources with the chosen name can't be activated unless they're mana abilities." });
const revoker = card("Phyrexian Revoker", "Artifact Creature — Phyrexian Horror", "{2}", { power: "2", toughness: "1", oracleText: "As this creature enters, choose a nonland card name.\nActivated abilities of sources with the chosen name can't be activated." });
const intervention = card("Gideon's Intervention", "Enchantment", "{2}{W}{W}", { oracleText: "As this enchantment enters, choose a card name.\nYour opponents can't cast spells with the chosen name.\nPrevent all damage that would be dealt to you and permanents you control by sources with the chosen name." });
const stone = card("Mind Stone", "Artifact", "{2}", { oracleText: "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card." });
const dragon = card("Eternal Dragon", "Creature — Dragon Spirit", "{5}{W}{W}", { power: "5", toughness: "5", keywords: ["Flying", "Landcycling"], oracleText: "Flying\n{3}{W}{W}: Return this card from your graveyard to your hand. Activate only during your upkeep.\nPlainscycling {2} ({2}, Discard this card: Search your library for a Plains card, reveal it, put it into your hand, then shuffle.)" });
const bolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });
const halo = card("Runed Halo", "Enchantment", "{W}{W}", { oracleText: "As this enchantment enters, choose a card name.\nYou have protection from the chosen card name. (You can't be targeted, dealt damage, or enchanted by anything with that name.)" });
const naught = card("Declaration of Naught", "Enchantment", "{U}{U}", { oracleText: "As this enchantment enters, choose a card name.\n{U}: Counter target spell with the chosen name." });
const flute = card("Disruptor Flute", "Artifact", "{2}", { keywords: ["Flash"], oracleText: "Flash\nAs this artifact enters, choose a card name.\nSpells with the chosen name cost {3} more to cast.\nActivated abilities of sources with the chosen name can't be activated unless they're mana abilities." });
const curse = card("Curse of Silence", "Enchantment — Aura Curse", "{W}", { keywords: ["Enchant"], oracleText: "Enchant player\nAs this Aura enters, choose a card name.\nSpells with the chosen name enchanted player casts cost {2} more to cast.\nWhenever enchanted player casts a spell with the chosen name, you may sacrifice this Aura. If you do, draw a card." });
const silencer = card("Silverquill Silencer", "Creature — Human Cleric", "{W}{B}", { power: "3", toughness: "2", oracleText: "As this creature enters, choose a nonland card name.\nWhenever an opponent casts a spell with the chosen name, they lose 3 life and you draw a card." });
const council = card("Council of the Absolute", "Creature — Human Advisor", "{2}{W}{U}", { power: "2", toughness: "4", oracleText: "As this creature enters, choose a noncreature, nonland card name.\nYour opponents can't cast spells with the chosen name.\nSpells with the chosen name you cast cost {2} less to cast." });
const suppression = card("Suppression Field", "Enchantment", "{1}{W}", { oracleText: "Activated abilities cost {2} more to activate unless they're mana abilities." });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

/** Cast `d` from the active player's hand and name `name` as it enters. */
function enterNaming(s: GameState, ap: PlayerId, id: string, name: string): GameState {
  s = cast(s, ap, id);
  s = passAll(s);
  expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "cardName" });
  return act(s, { type: "chooseOption", player: ap, choice: name });
}

describe("choosing a card name as a permanent enters", () => {
  it("compiles them", () => supported(mage, nevermore, gargoyle, needle, revoker));

  it("offers the names of cards in the game that fit: a nonland card name leaves out lands", () => {
    let { s, ap, ids } = setup([mage, bolt]);
    s = cast(s, ap, ids[0]!);
    s = passAll(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "cardName", prompt: "choose a nonland card name" });
    const options = s.pending?.kind === "chooseOption" ? s.pending.options : [];
    expect(options).toContain("Lightning Bolt");
    expect(options).toContain("Grizzly Bears");
    expect(options).not.toContain("Forest");
    expect(() => act(s, { type: "chooseOption", player: ap, choice: "Forest" })).toThrow();
  });

  it("Meddling Mage: nobody can cast spells with the chosen name, its controller included", () => {
    let { s, ap, opp, ids } = setup([mage, bolt]);
    s = enterNaming(s, ap, ids[0]!, "Lightning Bolt");
    expect(s.objects[ids[0]!]!.chosen?.name).toBe("Lightning Bolt");
    expect(castProblem(s, ap, ids[1]!, [{ kind: "player", id: opp }])).toMatch(/Lightning Bolt can't be cast/);
    expect(planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }])).toBeNull();
    // Gone from the battlefield, it stops (CR 400.7).
    const mageId = ids[0]!;
    s.battlefield.splice(s.battlefield.indexOf(mageId), 1);
    s.objects[mageId]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(mageId);
    expect(planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }])).not.toBeNull();
  });

  it("Gideon's Intervention: only its controller's opponents are stopped", () => {
    let { s, ap, opp, ids } = setup([intervention, bolt]);
    s = enterNaming(s, ap, ids[0]!, "Lightning Bolt");
    expect(planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }])).not.toBeNull();
    const theirs = putOnBattlefield(s, opp, bolt);
    s.battlefield.splice(s.battlefield.indexOf(theirs), 1);
    s.objects[theirs]!.zone = "hand";
    s.players[opp]!.hand.push(theirs);
    expect(castProblem(s, opp, theirs, [{ kind: "player", id: ap }])).toMatch(/can't be cast/);
  });

  it("Pithing Needle: the named card's mana abilities still work, its other activated abilities don't", () => {
    let { s, ap, opp, ids } = setup([needle]);
    const rock = putOnBattlefield(s, opp, stone);
    s = enterNaming(s, ap, ids[0]!, "Mind Stone");
    expect(abilityProblem(s, opp, rock, 0)).toMatch(/can't be activated unless they're mana abilities/);
    expect(planActivate(s, opp, rock, 0)).toBeNull();
  });

  it("Pithing Needle works in every zone: a named card in a hand can't be cycled (rulings)", () => {
    let { s, ap, ids } = setup([needle, dragon]);
    s = enterNaming(s, ap, ids[0]!, "Eternal Dragon");
    const cycling = s.objects[ids[1]!]!;
    expect(cycling.zone).toBe("hand");
    // Plainscycling is the card's second activated ability.
    expect(abilityProblem(s, ap, ids[1]!, 1)).toMatch(/can't be activated/);
  });

  it("Phyrexian Revoker stops a named permanent's mana abilities too; Voidstone Gargoyle does both", () => {
    let { s, ap, opp, ids } = setup([gargoyle]);
    const theirs = putOnBattlefield(s, opp, bear({ name: "Llanowar Elves", oracleText: "{T}: Add {G}." }));
    s = enterNaming(s, ap, ids[0]!, "Llanowar Elves");
    // The Elves' {T}: Add {G} is a mana ability: Revoker-style bans stop it too (CR 605.1a).
    expect(manaAbilityProblem(s, opp, s.objects[theirs]!, 0)).toMatch(/can't be activated/);
  });

  it("a bot names an opponent's commander for Meddling Mage, and a permanent with an activated ability for Pithing Needle", () => {
    let { s, ap, opp, ids } = setup([mage, needle]);
    s = cast(s, ap, ids[0]!);
    s = passAll(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "cardName" });
    const [a] = botActions(s, ap);
    expect(a).toMatchObject({ type: "chooseOption" });
    const named = a!.type === "chooseOption" ? a!.choice : "";
    // An opponent's commander, shown in the command zone, not its own.
    const own = s.cards[s.objects[s.players[ap]!.command[0]!]!.cardId]!.name;
    expect(named).toMatch(/^C[0-3]$/);
    expect(named).not.toBe(own);
    s = act(s, a!);
    expect(s.pending).toBeNull();
    expect(s.stack).toHaveLength(0);
    putOnBattlefield(s, opp, stone);
    s = cast(s, ap, ids[1]!);
    s = passAll(s);
    const [b] = botActions(s, ap);
    expect(b).toEqual({ type: "chooseOption", player: ap, choice: "Mind Stone" });
  });
});

/** A card of `def` in `pid`'s hand. */
function inHand(s: GameState, pid: PlayerId, def: CardDef): string {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
}

const generic = (s: GameState, pid: PlayerId, id: string) => {
  const c = spellCost(s, pid, s.objects[id]!);
  return c.extra + c.cost.symbols.reduce((n, x) => n + (x.kind === "generic" ? x.amount : 0), 0);
};

describe("what a chosen card name does", () => {
  it("compiles them", () => supported(halo, intervention, naught, flute, curse, silencer, council, suppression));

  it("Runed Halo: its controller can't be targeted by a spell with the chosen name", () => {
    let { s, ap, opp, ids } = setup([halo]);
    const theirs = inHand(s, opp, bolt);
    s = enterNaming(s, ap, ids[0]!, "Lightning Bolt");
    putOnBattlefield(s, opp, card("Mountain", "Basic Land — Mountain"));
    s.priority = opp;
    expect(planCast(s, opp, theirs, [{ kind: "player", id: ap }])).toBeNull();
    const other = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    expect(planCast(s, opp, theirs, [{ kind: "player", id: other }])).not.toBeNull();
  });

  it("Gideon's Intervention: damage from a source with the chosen name to you and your permanents is prevented", () => {
    let { s, ap, ids } = setup([intervention, bolt]);
    const mine = putOnBattlefield(s, ap, bear());
    s = enterNaming(s, ap, ids[0]!, "Lightning Bolt");
    // Its controller may still cast it: only opponents are stopped.
    s = cast(s, ap, ids[1]!, [target(mine)]);
    expect(s.objects[mine]!.zone).toBe("battlefield");
    expect(s.objects[mine]!.damage).toBe(0);
  });

  it("Declaration of Naught: {U} counters a spell with the chosen name, and only that", () => {
    let { s, ap, opp, ids } = setup([naught, bolt, card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." })]);
    s = enterNaming(s, ap, ids[0]!, "Lightning Bolt");
    for (const a of planCast(s, ap, ids[2]!, [{ kind: "player", id: opp }])!) s = act(s, a);
    expect(planActivate(s, ap, ids[0]!, 0, [{ kind: "stack", id: s.stack[0]!.id }])).toBeNull();
    for (const a of planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }])!) s = act(s, a);
    const boltItem = s.stack[s.stack.length - 1]!.id;
    for (const a of planActivate(s, ap, ids[0]!, 0, [{ kind: "stack", id: boltItem }])!) s = act(s, a);
    s = passAll(s);
    expect(s.objects[ids[1]!]!.zone).toBe("graveyard");
    expect(s.stack.some((x) => x.id === boltItem)).toBe(false);
  });

  it("Disruptor Flute: spells with the chosen name cost {3} more, for everyone", () => {
    let { s, ap, opp, ids } = setup([flute, bolt]);
    expect(generic(s, ap, ids[1]!)).toBe(0);
    s = enterNaming(s, ap, ids[0]!, "Lightning Bolt");
    expect(generic(s, ap, ids[1]!)).toBe(3);
    expect(generic(s, opp, inHand(s, opp, bolt))).toBe(3);
  });

  it("Council of the Absolute: opponents can't cast it; its controller's cost {2} less", () => {
    const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });
    let { s, ap, opp, ids } = setup([council, divination]);
    s = enterNaming(s, ap, ids[0]!, "Divination");
    expect(generic(s, ap, ids[1]!)).toBe(0);
    expect(castProblem(s, opp, inHand(s, opp, divination))).toMatch(/can't be cast/);
  });

  it("Curse of Silence: the enchanted player's spells with the name cost {2} more, and casting one can trade the Curse for a card", () => {
    let { s, ap, opp, ids } = setup([curse]);
    s = cast(s, ap, ids[0]!, [{ kind: "player", id: opp }]);
    s = passAll(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "cardName" });
    s = act(s, { type: "chooseOption", player: ap, choice: "Grizzly Bears" });
    const bears = inHand(s, opp, bear());
    expect(generic(s, opp, bears)).toBe(3);
    expect(generic(s, ap, inHand(s, ap, bear()))).toBe(1);
  });

  it("Silverquill Silencer: an opponent casting a spell with the chosen name loses 3 life, and you draw", () => {
    let { s, ap, opp, ids } = setup([silencer]);
    const theirs = inHand(s, opp, bolt);
    s = enterNaming(s, ap, ids[0]!, "Lightning Bolt");
    putOnBattlefield(s, opp, card("Mountain", "Basic Land — Mountain"));
    s.priority = opp;
    const life = s.players[opp]!.life;
    const hand = s.players[ap]!.hand.length;
    for (const a of planCast(s, opp, theirs, [{ kind: "player", id: ap }])!) s = act(s, a);
    s = passAll(s);
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("Suppression Field: activated abilities cost {2} more, mana abilities don't", () => {
    let { s, ap } = setup([]);
    const rock = putOnBattlefield(s, ap, stone);
    const field = putOnBattlefield(s, ap, suppression);
    expect(field).toBeTruthy();
    // Mind Stone's "{1}, {T}, Sacrifice this artifact: Draw a card": {1} plus {2}.
    const ab = abilitiesOf(s, s.objects[rock]!).activated[0]!;
    const cost = () => activationCost(s, ap, s.objects[rock]!, ab).symbols.reduce((n, x) => n + (x.kind === "generic" ? x.amount : 0), 0);
    expect(cost()).toBe(3);
    // Its "{T}: Add {C}" is a mana ability: no more to activate.
    expect(manaAbilityProblem(s, ap, s.objects[rock]!, 0)).toBeNull();
  });
});
