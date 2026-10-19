// "Target opponent chooses two of those cards" (Gifts Ungiven), "An opponent chooses one of them" (Murmurs from
// Beyond): the cards found or revealed are shown to an opponent, who chooses which go where. "An opponent" is one the
// caster chooses as it resolves (rulings on Steam Augury); with no more cards than the opponent chooses there's nothing
// to choose: they're all chosen (rulings on Gifts Ungiven and Realms Uncharted).

import { describe, expect, it } from "vitest";
import { act, activate, card, cast, putOnBattlefield, setup } from "./helpers";
import { botActions, isFullySupported, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
function settle(s: GameState) {
  for (let i = 0; i < 60 && (s.stack.length || s.resolving || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}
const nameOf = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;
const names = (s: GameState, ids: string[]) => ids.map((id) => nameOf(s, id)).sort();
/** A fresh copy of `def` on top of `pid`'s library. */
function toLibrary(s: GameState, pid: PlayerId, def: CardDef) {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
}

// Real oracle text (Scryfall).
const giftsUngiven = card("Gifts Ungiven", "Instant", "{3}{U}", { oracleText: "Search your library for up to four cards with different names and reveal them. Target opponent chooses two of those cards. Put the chosen cards into your graveyard and the rest into your hand. Then shuffle." });
const realmsUncharted = card("Realms Uncharted", "Instant", "{2}{G}", { oracleText: "Search your library for up to four land cards with different names and reveal them. An opponent chooses two of those cards. Put the chosen cards into your graveyard and the rest into your hand. Then shuffle." });
const elementalTeachings = card("Elemental Teachings", "Instant — Lesson", "{4}{G}", { oracleText: "Search your library for up to four land cards with different names and reveal them. An opponent chooses two of those cards. Put the chosen cards into your graveyard and the rest onto the battlefield tapped, then shuffle." });
const intuition = card("Intuition", "Instant", "{2}{U}", { oracleText: "Search your library for three cards and reveal them. Target opponent chooses one. Put that card into your hand and the rest into your graveyard. Then shuffle." });
const murmursFromBeyond = card("Murmurs from Beyond", "Instant — Arcane", "{2}{U}", { oracleText: "Reveal the top three cards of your library. An opponent chooses one of them. Put that card into your graveyard and the rest into your hand." });
const thranTome = card("Thran Tome", "Artifact", "{4}", { oracleText: "{5}, {T}: Reveal the top three cards of your library. Target opponent chooses one of those cards. Put that card into your graveyard, then draw two cards." });
const animalMagnetism = card("Animal Magnetism", "Sorcery", "{4}{G}", { oracleText: "Reveal the top five cards of your library. An opponent chooses a creature card from among them. Put that card onto the battlefield and the rest into your graveyard." });
const bolt = card("Lightning Bolt", "Instant", "{R}", { cmc: 1, oracleText: "Lightning Bolt deals 3 damage to any target." });
const solRing = card("Sol Ring", "Artifact", "{1}", { cmc: 1, oracleText: "{T}: Add {C}{C}." });
const mindStone = card("Mind Stone", "Artifact", "{2}", { cmc: 2, oracleText: "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card." });
const shivan = card("Shivan Dragon", "Creature — Dragon", "{4}{R}{R}", { cmc: 6, power: "5", toughness: "5", keywords: ["Flying"], oracleText: "Flying\n{R}: This creature gets +1/+0 until end of turn." });
const elves = card("Llanowar Elves", "Creature — Elf Druid", "{G}", { cmc: 1, power: "1", toughness: "1", oracleText: "{T}: Add {G}." });
const island = card("Island", "Basic Land — Island");
const swamp = card("Swamp", "Basic Land — Swamp");
const mountain = card("Mountain", "Basic Land — Mountain");
const desert = card("Barren Desert", "Land — Desert");

describe("an opponent chooses among revealed cards", () => {
  it("compile", () => supported(giftsUngiven, realmsUncharted, elementalTeachings, intuition, murmursFromBeyond, thranTome, animalMagnetism));

  it("Gifts Ungiven: the target opponent chooses two of the four for the graveyard; the rest go to the hand", () => {
    const { s: s0, ap, opp, ids } = setup([giftsUngiven]);
    const four = [bolt, solRing, mindStone, island].map((d) => toLibrary(s0, ap, d));
    let s = settle(cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 4, min: 0 });
    // One of each name: four copies of Forest in the library are offered once.
    const offered = (s.pending as { cards: string[] }).cards;
    expect(offered.filter((id) => nameOf(s, id) === "Forest")).toHaveLength(1);
    s = act(s, { type: "searchLibrary", player: ap, found: four });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: opp, min: 2, max: 2, forPlayer: ap, dig: { looked: four } });
    // Into the graveyard, where the rest go into the hand: the hand is better for its owner.
    expect((s.pending as { helps?: true }).helps).toBeUndefined();
    s = settle(act(s, { type: "searchLibrary", player: opp, found: [four[0]!, four[2]!] }));
    expect(s.pending).toBeNull();
    expect(names(s, s.players[ap]!.graveyard.filter((id) => four.includes(id)))).toEqual(["Lightning Bolt", "Mind Stone"]);
    expect(names(s, s.players[ap]!.hand.filter((id) => four.includes(id)))).toEqual(["Island", "Sol Ring"]);
  });

  it("Gifts Ungiven: two cards found are both put into the graveyard, with no choice", () => {
    const { s: s0, ap, opp, ids } = setup([giftsUngiven]);
    const two = [bolt, solRing].map((d) => toLibrary(s0, ap, d));
    let s = settle(cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: two }));
    expect(s.pending).toBeNull();
    expect(two.map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard"]);
  });

  it("Intuition: three cards must be found; the opponent's one goes to the hand, the rest to the graveyard", () => {
    const { s: s0, ap, opp, ids } = setup([intuition]);
    const three = [bolt, solRing, mindStone].map((d) => toLibrary(s0, ap, d));
    let s = settle(cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 3, max: 3 });
    s = act(s, { type: "searchLibrary", player: ap, found: three });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: opp, min: 1, max: 1, helps: true });
    // The bot gives the card its owner would want least.
    const [pick] = botActions(s, opp);
    expect(pick).toMatchObject({ type: "searchLibrary", found: [expect.any(String)] });
    s = settle(act(s, pick!));
    const chosen = (pick as { found: string[] }).found[0]!;
    expect(s.objects[chosen]!.zone).toBe("hand");
    expect(three.filter((id) => id !== chosen).map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard"]);
  });

  it("Realms Uncharted: the caster chooses which opponent chooses, as it resolves", () => {
    const { s: s0, ap, ids } = setup([realmsUncharted]);
    const lands = [island, swamp, mountain, desert].map((d) => toLibrary(s0, ap, d));
    let s = settle(cast(s0, ap, ids[0]!));
    s = act(s, { type: "searchLibrary", player: ap, found: lands });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "opponent" });
    const third = s.turnOrder[(s.turnOrder.indexOf(ap) + 2) % 4]!;
    s = act(s, { type: "chooseOption", player: ap, choice: String(third) });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: third, min: 2, max: 2, forPlayer: ap });
    s = settle(act(s, { type: "searchLibrary", player: third, found: [lands[1]!, lands[3]!] }));
    expect(names(s, s.players[ap]!.graveyard.filter((id) => lands.includes(id)))).toEqual(["Barren Desert", "Swamp"]);
    expect(names(s, s.players[ap]!.hand.filter((id) => lands.includes(id)))).toEqual(["Island", "Mountain"]);
  });

  it("Elemental Teachings: the two not chosen enter tapped", () => {
    const { s: s0, ap, ids } = setup([elementalTeachings]);
    const lands = [island, swamp, mountain].map((d) => toLibrary(s0, ap, d));
    let s = settle(cast(s0, ap, ids[0]!));
    s = act(s, { type: "searchLibrary", player: ap, found: lands });
    if (s.pending?.kind === "chooseOption") s = act(s, { type: "chooseOption", player: ap, choice: s.pending.options[0]! });
    const chooser = s.pending!.player;
    expect(s.pending).toMatchObject({ kind: "searchLibrary", min: 2, max: 2, forPlayer: ap });
    s = settle(act(s, { type: "searchLibrary", player: chooser, found: [lands[0]!, lands[1]!] }));
    expect(s.objects[lands[2]!]).toMatchObject({ zone: "battlefield", tapped: true });
    expect([lands[0]!, lands[1]!].map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard"]);
  });

  it("Murmurs from Beyond: the opponent's one of the top three goes to the graveyard, the rest to the hand", () => {
    const { s: s0, ap, ids } = setup([murmursFromBeyond]);
    const top = [bolt, solRing, mindStone].map((d) => toLibrary(s0, ap, d));
    let s = settle(cast(s0, ap, ids[0]!));
    if (s.pending?.kind === "chooseOption") s = act(s, { type: "chooseOption", player: ap, choice: s.pending.options[0]! });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", min: 1, max: 1, forPlayer: ap });
    const chooser = s.pending!.player;
    expect(chooser).not.toBe(ap);
    s = settle(act(s, { type: "searchLibrary", player: chooser, found: [top[1]!] }));
    expect(s.objects[top[1]!]!.zone).toBe("graveyard");
    expect([top[0]!, top[2]!].map((id) => s.objects[id]!.zone)).toEqual(["hand", "hand"]);
  });

  it("Thran Tome: the chosen card goes to the graveyard, the other two stay on top, then two are drawn", () => {
    const { s: s0, ap, opp } = setup([]);
    const tome = putOnBattlefield(s0, ap, thranTome);
    const top = [bolt, solRing, mindStone].map((d) => toLibrary(s0, ap, d));
    let s = settle(activate(s0, ap, tome, 0, [{ kind: "player", id: opp }]));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: opp, min: 1, max: 1, forPlayer: ap });
    s = settle(act(s, { type: "searchLibrary", player: opp, found: [top[0]!] }));
    expect(s.objects[top[0]!]!.zone).toBe("graveyard");
    expect([top[1]!, top[2]!].map((id) => s.objects[id]!.zone)).toEqual(["hand", "hand"]);
  });

  it("Animal Magnetism: only creature cards can be chosen; one creature is put onto the battlefield with no choice", () => {
    const { s: s0, ap, ids } = setup([animalMagnetism]);
    const top = [bolt, shivan, solRing, mindStone, island].map((d) => toLibrary(s0, ap, d));
    const s = settle(cast(s0, ap, ids[0]!));
    expect(s.pending).toBeNull();
    expect(s.objects[top[1]!]).toMatchObject({ zone: "battlefield", controller: ap });
    expect([top[0]!, top[2]!, top[3]!, top[4]!].map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "graveyard", "graveyard"]);
  });

  it("Animal Magnetism: with two creatures, the bot opponent puts the weaker one onto the battlefield", () => {
    const { s: s0, ap, ids } = setup([animalMagnetism]);
    const top = [bolt, shivan, elves, mindStone, island].map((d) => toLibrary(s0, ap, d));
    let s = settle(cast(s0, ap, ids[0]!));
    if (s.pending?.kind === "chooseOption") s = act(s, { type: "chooseOption", player: ap, choice: s.pending.options[0]! });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", min: 1, max: 1, helps: true });
    expect((s.pending as { cards: string[] }).cards.sort()).toEqual([top[1]!, top[2]!].sort());
    const [pick] = botActions(s, s.pending!.player);
    s = settle(act(s, pick!));
    expect(s.objects[top[2]!]!.zone).toBe("battlefield");
    expect(s.objects[top[1]!]!.zone).toBe("graveyard");
  });
});
