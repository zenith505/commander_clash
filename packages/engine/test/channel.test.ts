// Channel and other "[cost], Discard this card: ..." abilities (CR 602.2b, 701.9a): they work only while the card is in
// your hand, and discarding it is part of the cost; with a target, one must be chosen (rulings on Boseiju). "This ability
// costs {1} less to activate for each legendary creature you control" reduces only generic mana (CR 601.2f, 118.7a).
// With them: "its controller may search their library" (Path to Exile: no search, no shuffle, rulings), targets like
// "artifact, enchantment, or nonbasic land", and "return a creature card from your graveyard to your hand", which is
// chosen as it resolves, not targeted (CR 608.2c).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, forest, passAll, putOnBattlefield, setup, target } from "./helpers";
import { activationCost, compileCard, characteristics, isFullySupported, planActivate, planCast, manaValue, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const channel = (d: CardDef) => compileCard(d).activated.findIndex((a) => a.zone === "hand");
const untapped = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && !s.objects[id]!.tapped).length;
/** Put a copy of `def` on top of `pid`'s library. */
function onTop(s: GameState, pid: PlayerId, def: CardDef) {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
}

// Real oracle text (Scryfall).
const boseiju = card("Boseiju, Who Endures", "Legendary Land", "", { oracleText: "{T}: Add {G}.\nChannel — {1}{G}, Discard this card: Destroy target artifact, enchantment, or nonbasic land an opponent controls. That player may search their library for a land card with a basic land type, put it onto the battlefield, then shuffle. This ability costs {1} less to activate for each legendary creature you control." });
const otawara = card("Otawara, Soaring City", "Legendary Land", "", { oracleText: "{T}: Add {U}.\nChannel — {3}{U}, Discard this card: Return target artifact, creature, enchantment, or planeswalker to its owner's hand. This ability costs {1} less to activate for each legendary creature you control." });
const takenuma = card("Takenuma, Abandoned Mire", "Legendary Land", "", { oracleText: "{T}: Add {B}.\nChannel — {3}{B}, Discard this card: Mill three cards, then return a creature or planeswalker card from your graveyard to your hand. This ability costs {1} less to activate for each legendary creature you control." });
const sokenzan = card("Sokenzan, Crucible of Defiance", "Legendary Land", "", { oracleText: "{T}: Add {R}.\nChannel — {3}{R}, Discard this card: Create two 1/1 colorless Spirit creature tokens. They gain haste until end of turn. This ability costs {1} less to activate for each legendary creature you control." });
const sniper = card("Twinshot Sniper", "Artifact Creature — Goblin Archer", "{3}{R}", { power: "2", toughness: "3", oracleText: "Reach\nWhen this creature enters, it deals 2 damage to any target.\nChannel — {1}{R}, Discard this card: It deals 2 damage to any target." });
const outburst = card("Creative Outburst", "Instant", "{3}{U}{U}{R}{R}", { oracleText: "Creative Outburst deals 5 damage to any target. Look at the top five cards of your library. Put one of them into your hand and the rest on the bottom of your library in a random order.\n{U/R}{U/R}, Discard this card: Create a Treasure token." });
const path = card("Path to Exile", "Instant", "{W}", { oracleText: "Exile target creature. Its controller may search their library for a basic land card, put that card onto the battlefield tapped, then shuffle." });
const churn = card("Corpse Churn", "Instant", "{1}{B}", { oracleText: "Mill three cards, then you may return a creature card from your graveyard to your hand. (To mill three cards, put the top three cards of your library into your graveyard.)" });
const befoul = card("Befoul", "Sorcery", "{2}{B}{B}", { oracleText: "Destroy target land or nonblack creature. It can't be regenerated." });

const legend = card("Isamaru, Hound of Konda", "Legendary Creature — Dog", "{W}", { power: "2", toughness: "2" });
const tower = card("Command Tower", "Land", "", { oracleText: "{T}: Add one mana of any color in your commander's color identity." });
const relic = card("Mind Stone", "Artifact", "{2}", { oracleText: "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card." });

describe("channel", () => {
  it("compiles them", () => {
    supported(boseiju, otawara, takenuma, sokenzan, sniper, outburst, path, churn, befoul);
    expect(compileCard(boseiju).activated[channel(boseiju)]).toMatchObject({ zone: "hand", discardSelf: true, manaCost: "{1}{G}", costLess: expect.anything() });
  });

  it("works only from the hand, discarding the card as a cost", () => {
    let { s, ap, ids, opp } = setup([outburst]);
    const i = channel(outburst);
    for (const a of planActivate(s, ap, ids[0]!, i)!) s = act(s, a);
    expect(s.players[ap]!.graveyard).toContain(ids[0]);
    expect(s.players[ap]!.hand).not.toContain(ids[0]);
    s = passAll(s);
    expect(s.battlefield.some((id) => s.cards[s.objects[id]!.cardId]!.name === "Treasure Token" && s.objects[id]!.controller === ap)).toBe(true);
    // A land on the battlefield can't use it.
    const b = putOnBattlefield(s, ap, boseiju);
    const tgt = putOnBattlefield(s, opp, tower);
    expect(planActivate(s, ap, b, channel(boseiju), [target(tgt)])).toBeNull();
  });

  it("Boseiju destroys a nonbasic land, its controller may search for a land with a basic land type, and it costs less with a legend", () => {
    let { s, ap, ids, opp } = setup([boseiju]);
    const i = channel(boseiju);
    const basic = putOnBattlefield(s, opp, forest);
    const towerId = putOnBattlefield(s, opp, tower);
    const stone = putOnBattlefield(s, opp, relic);
    const mine = putOnBattlefield(s, ap, tower);
    const theirBear = putOnBattlefield(s, opp, bear());
    // Artifact, enchantment, or nonbasic land an opponent controls.
    expect(planActivate(s, ap, ids[0]!, i, [target(basic)])).toBeNull();
    expect(planActivate(s, ap, ids[0]!, i, [target(mine)])).toBeNull();
    expect(planActivate(s, ap, ids[0]!, i, [target(theirBear)])).toBeNull();
    expect(planActivate(s, ap, ids[0]!, i, [target(stone)])).not.toBeNull();
    const o = s.objects[ids[0]!]!;
    const ab = compileCard(boseiju).activated[i]!;
    expect(manaValue(activationCost(s, ap, o, ab))).toBe(2);
    putOnBattlefield(s, ap, legend);
    putOnBattlefield(s, ap, card("Other Legend", "Legendary Creature — Human", "{W}", { power: "1", toughness: "1" }));
    // Two legends take off the {1} but never the {G}.
    expect(manaValue(activationCost(s, ap, o, ab))).toBe(1);
    const before = untapped(s, ap);
    for (const a of planActivate(s, ap, ids[0]!, i, [target(towerId)])!) s = act(s, a);
    expect(before - untapped(s, ap)).toBe(1);
    s = passAll(s);
    expect(s.objects[towerId]!.zone).toBe("graveyard");
    // "That player" is the land's controller: they choose to search, and find a Forest.
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp });
    s = act(s, { type: "chooseMay", player: opp, yes: true });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: opp });
    const lands = (s.pending as { cards: string[] }).cards;
    expect(lands.length).toBeGreaterThan(0);
    s = act(s, { type: "searchLibrary", player: opp, found: [lands[0]!] });
    expect(s.objects[lands[0]!]).toMatchObject({ zone: "battlefield", controller: opp });
  });

  it("Path to Exile: the creature's controller may search for a tapped basic land; if they don't, no shuffle", () => {
    let { s, ap, ids, opp } = setup([path, path]);
    const b1 = putOnBattlefield(s, opp, bear());
    const b2 = putOnBattlefield(s, opp, bear());
    for (const a of planCast(s, ap, ids[0]!, [target(b1)])!) s = act(s, a);
    s = passAll(s);
    expect(s.objects[b1]!.zone).toBe("exile");
    s = act(s, { type: "chooseMay", player: opp, yes: true });
    const lands = (s.pending as { cards: string[] }).cards;
    s = act(s, { type: "searchLibrary", player: opp, found: [lands[0]!] });
    expect(s.objects[lands[0]!]).toMatchObject({ zone: "battlefield", controller: opp, tapped: true });
    for (const a of planCast(s, ap, ids[1]!, [target(b2)])!) s = act(s, a);
    s = passAll(s);
    const library = [...s.players[opp]!.library];
    s = act(s, { type: "chooseMay", player: opp, yes: false });
    expect(s.pending).toBeNull();
    expect(s.players[opp]!.library).toEqual(library);
  });

  it("Takenuma mills three, then returns a creature card it chooses as it resolves", () => {
    let { s, ap, ids } = setup([takenuma]);
    const top = [onTop(s, ap, forest), onTop(s, ap, bear()), onTop(s, ap, forest)];
    for (const a of planActivate(s, ap, ids[0]!, channel(takenuma))!) s = act(s, a);
    s = passAll(s);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, fromGraveyard: true, min: 1, max: 1, cards: [top[1]] });
    s = act(s, { type: "searchLibrary", player: ap, found: [top[1]!] });
    expect(s.players[ap]!.hand).toContain(top[1]);
  });

  it("Corpse Churn may return none", () => {
    let { s, ap, ids } = setup([churn]);
    const b = onTop(s, ap, bear());
    s = cast(s, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", fromGraveyard: true, min: 0, max: 1 });
    s = act(s, { type: "searchLibrary", player: ap, found: [] });
    expect(s.objects[b]!.zone).toBe("graveyard");
  });

  it("Sokenzan's Spirits gain haste; Twinshot Sniper's card deals the damage from the graveyard", () => {
    let { s, ap, ids, opp } = setup([sokenzan, sniper]);
    for (const a of planActivate(s, ap, ids[0]!, channel(sokenzan))!) s = act(s, a);
    s = passAll(s);
    const spirits = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Spirit Token");
    expect(spirits).toHaveLength(2);
    for (const id of spirits) expect(characteristics(s, s.objects[id]!).keywords).toContain("Haste");
    const life = s.players[opp]!.life;
    for (const a of planActivate(s, ap, ids[1]!, channel(sniper), [{ kind: "player", id: opp }])!) s = act(s, a);
    s = passAll(s);
    expect(s.players[opp]!.life).toBe(life - 2);
  });

  it("Befoul: any land, or a nonblack creature", () => {
    const { s, ap, ids, opp } = setup([befoul]);
    const blackBear = putOnBattlefield(s, opp, bear({ name: "Black Bear", colors: ["B"] }));
    const swampLand = putOnBattlefield(s, opp, card("Swamp", "Basic Land — Swamp"));
    const green = putOnBattlefield(s, opp, bear());
    expect(planCast(s, ap, ids[0]!, [target(blackBear)])).toBeNull();
    expect(planCast(s, ap, ids[0]!, [target(swampLand)])).not.toBeNull();
    expect(planCast(s, ap, ids[0]!, [target(green)])).not.toBeNull();
  });
});
