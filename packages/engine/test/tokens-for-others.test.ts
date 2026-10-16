// Tokens another player creates: "Its controller creates a 3/3 green Beast creature token" (Beast Within), "target
// opponent creates ..." (Hunted Dragon, Baffling End), "target player creates X ..." (Dark Salvation). That player
// creates the tokens and controls them (CR 111.2); "its controller" of something gone is its controller as it last
// existed (CR 608.2h).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passAll, pt, putOnBattlefield, setup, target } from "./helpers";
import { compileCard, isFullySupported, moveObject, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const beastWithin = card("Beast Within", "Instant", "{2}{G}", { oracleText: "Destroy target permanent. Its controller creates a 3/3 green Beast creature token." });
const swanSong = card("Swan Song", "Instant", "{U}", { oracleText: "Counter target enchantment, instant, or sorcery spell. Its controller creates a 2/2 blue Bird creature token with flying." });
const huntedDragon = card("Hunted Dragon", "Creature — Dragon", "{3}{R}{R}", { power: "6", toughness: "6", keywords: ["Flying", "Haste"], oracleText: "Flying, haste\nWhen this creature enters, target opponent creates three 2/2 white Knight creature tokens with first strike." });
const bafflingEnd = card("Baffling End", "Enchantment", "{1}{W}", { oracleText: "When this enchantment enters, exile target creature an opponent controls with mana value 3 or less.\nWhen this enchantment leaves the battlefield, target opponent creates a 3/3 green Dinosaur creature token with trample." });
const darkSalvation = card("Dark Salvation", "Sorcery", "{X}{X}{B}", { oracleText: "Target player creates X 2/2 black Zombie creature tokens, then up to one target creature gets -1/-1 until end of turn for each Zombie that player controls." });
const rootcast = card("Rootcast Apprenticeship", "Sorcery", "{3}{G}", { oracleText: "Choose three. You may choose the same mode more than once.\n• Put two +1/+1 counters on target creature.\n• Create a token that's a copy of target token you control.\n• Target player creates a 1/1 green Squirrel creature token.\n• Target opponent sacrifices a nontoken artifact of their choice." });
const darksteel = card("Darksteel Myr", "Artifact Creature — Myr", "{3}", { power: "0", toughness: "1", keywords: ["Indestructible"], oracleText: 'Indestructible (Damage and effects that say "destroy" don\'t destroy this creature. If its toughness is 0 or less, it still dies.)' });
const ponder = card("Ponder Test", "Sorcery", "{U}", { oracleText: "Draw a card." });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
/** The tokens named `name` that `pid` controls. */
const tokens = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === `${name} Token`);

describe("tokens created by another player", () => {
  it("parses these", () => {
    supported(beastWithin, swanSong, huntedDragon, bafflingEnd, darkSalvation, rootcast);
    expect(compileCard(beastWithin).spell!.effects[1]).toMatchObject({ type: "createToken", who: { ref: "targetController", index: 0 } });
  });

  it("Beast Within: the destroyed permanent's controller gets the Beast, also when it isn't destroyed (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([beastWithin, beastWithin]);
    const b = putOnBattlefield(s0, opp, bear());
    let s = cast(s0, ap, ids[0]!, [target(b)]);
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(tokens(s, opp, "Beast")).toHaveLength(1);
    expect(tokens(s, ap, "Beast")).toHaveLength(0);
    const myr = putOnBattlefield(s, opp, darksteel);
    s = cast(s, ap, ids[1]!, [target(myr)]);
    expect(s.objects[myr]!.zone).toBe("battlefield");
    expect(tokens(s, opp, "Beast")).toHaveLength(2);
  });

  it("Swan Song: the countered spell's controller gets the Bird", () => {
    const { s: s0, ap, opp, ids } = setup([ponder, swanSong]);
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!)!) s = act(s, a);
    // As if an opponent had cast it.
    const item = s.stack.at(-1)!;
    item.controller = opp;
    s.objects[ids[0]!]!.controller = opp;
    for (const a of planCast(s, ap, ids[1]!, [{ kind: "stack", id: item.id }])!) s = act(s, a);
    s = passAll(s);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(tokens(s, opp, "Bird")).toHaveLength(1);
    expect(tokens(s, ap, "Bird")).toHaveLength(0);
  });

  it("Hunted Dragon: the target opponent gets three first strikers", () => {
    const { s: s0, ap, opp, ids } = setup([huntedDragon]);
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!)!) s = act(s, a);
    s = passAll(s);
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] });
    s = passAll(s);
    const knights = tokens(s, opp, "Knight");
    expect(knights).toHaveLength(3);
    expect(s.cards[s.objects[knights[0]!]!.cardId]!.keywords).toContain("First strike");
  });

  it("Baffling End: leaving, the target opponent gets a Dinosaur", () => {
    const { s: s0, ap, opp } = setup([]);
    const end = putOnBattlefield(s0, ap, bafflingEnd);
    let s = s0;
    moveObject(s, end, "graveyard");
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] });
    s = passAll(s);
    expect(tokens(s, opp, "Dinosaur")).toHaveLength(1);
  });

  it("Dark Salvation: X Zombies for the target player, then -1/-1 for each Zombie they control", () => {
    const { s: s0, ap, opp, ids } = setup([darkSalvation]);
    const big = putOnBattlefield(s0, opp, card("Big Test", "Creature — Giant", "{4}", { power: "4", toughness: "4" }));
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!, [{ kind: "player", id: ap }, target(big)], undefined, "auto", 2)!) s = act(s, a);
    s = passAll(s);
    expect(tokens(s, ap, "Zombie")).toHaveLength(2);
    expect(pt(s, big)).toBe("2/2");
  });

  it("Rootcast Apprenticeship: a Squirrel for the target player each time that mode was chosen", () => {
    const { s: s0, ap, opp, ids } = setup([rootcast]);
    const s = cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }, { kind: "player", id: opp }, { kind: "player", id: ap }], [2, 2, 2]);
    expect(tokens(s, opp, "Squirrel")).toHaveLength(2);
    expect(tokens(s, ap, "Squirrel")).toHaveLength(1);
  });
});
