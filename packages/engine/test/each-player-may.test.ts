// "Each player may search their library ..." (Veteran Explorer, Old-Growth Dryads, Boldwyr Heavyweights, New Frontiers):
// the active player searches or chooses not to, then each other player in turn order; then those who searched shuffle
// (rulings on Veteran Explorer and Noble Benefactor). "Each player may scry 1" (Eager Construct, Myr Custodian): each
// decides in turn order, then those who do scry, in turn order (rulings). "Each player may draw a card, then each player
// who drew a card this way gains 1 life" (Kwain).

import { describe, expect, it } from "vitest";
import { act, card, forest, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, waitingOn, type GameState, type ManaType, type PlayerId } from "../src";
import { addMana } from "../src/spend";

// Real oracle text (Scryfall).
const explorer = card("Veteran Explorer", "Creature — Human Soldier Scout", "{G}", { power: "1", toughness: "1", oracleText: "When this creature dies, each player may search their library for up to two basic land cards, put them onto the battlefield, then shuffle." });
const dryads = card("Old-Growth Dryads", "Creature — Dryad", "{G}", { power: "3", toughness: "3", oracleText: "When this creature enters, each opponent may search their library for a basic land card, put it onto the battlefield tapped, then shuffle." });
const wayfinder = card("Jungle Wayfinder", "Creature — Elf Warrior", "{2}{G}", { power: "3", toughness: "3", oracleText: "When this creature enters, each player may search their library for a basic land card, reveal it, put it into their hand, then shuffle." });
const benefactor = card("Noble Benefactor", "Creature — Human Cleric", "{2}{U}", { power: "2", toughness: "2", oracleText: "When this creature dies, each player may search their library for a card and put that card into their hand. Then each player who searched their library this way shuffles." });
const frontiers = card("New Frontiers", "Sorcery", "{X}{G}", { oracleText: "Each player may search their library for up to X basic land cards and put them onto the battlefield tapped. Then each player who searched their library this way shuffles." });
const harvest = card("Weird Harvest", "Sorcery", "{X}{G}{G}", { oracleText: "Each player may search their library for up to X creature cards, reveal those cards, put them into their hand, then shuffle." });
const heavyweights = card("Boldwyr Heavyweights", "Creature — Giant Warrior", "{2}{R}{R}", { power: "8", toughness: "8", keywords: ["Trample"], oracleText: "Trample\nWhen this creature enters, each opponent may search their library for a creature card and put it onto the battlefield. Then each player who searched their library this way shuffles." });
const construct = card("Eager Construct", "Artifact Creature — Construct", "{2}", { power: "2", toughness: "2", keywords: ["Scry"], oracleText: "When this creature enters, each player may scry 1. (To scry 1, look at the top card of your library, then you may put that card on the bottom.)" });
const custodian = card("Myr Custodian", "Artifact Creature — Myr", "{3}", { power: "2", toughness: "3", keywords: ["Scry"], oracleText: "When this creature enters, scry 2. Then each opponent may scry 1. (To scry X, a player looks at the top X cards of their library, then puts any number of them on the bottom and the rest on top in any order.)" });
const kwain = card("Kwain, Itinerant Meddler", "Legendary Creature — Rabbit Wizard", "{W}{U}", { power: "1", toughness: "3", oracleText: "{T}: Each player may draw a card, then each player who drew a card this way gains 1 life." });

const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const others = (s: GameState, ap: PlayerId) => [1, 2, 3].map((i) => s.turnOrder[(s.turnOrder.indexOf(ap) + i) % 4]!);
const may = (s: GameState, pid: PlayerId, yes: boolean) => settle(act(s, { type: "chooseMay", player: pid, yes }));
const find = (s: GameState, pid: PlayerId, found: string[]) => settle(act(s, { type: "searchLibrary", player: pid, found }));
const forestsIn = (s: GameState, pid: PlayerId) => s.players[pid]!.library.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest");
const landsOf = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === "Forest").length;

describe("each player may search, scry or draw", () => {
  it("parses", () => [explorer, dryads, wayfinder, benefactor, frontiers, harvest, heavyweights, construct, custodian, kwain].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Old-Growth Dryads: each opponent in turn order searches or declines; only those who search shuffle", () => {
    let { s, ap, ids } = setup([dryads]);
    const [p1, p2, p3] = others(s, ap);
    const before = landsOf(s, ap);
    addMana(s, ap, ["G"] as ManaType[], {});
    s = settle(act(s, { type: "castSpell", player: ap, objectId: ids[0]! }));
    // Not the controller: the next player in turn order is asked first.
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: p1 });
    s = may(s, p1!, true);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: p1, max: 1 });
    const f1 = forestsIn(s, p1!)[0]!;
    s = find(s, p1!, [f1]);
    // p2 declines: their library isn't searched, nor shuffled.
    const lib2 = [...s.players[p2!]!.library];
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: p2 });
    s = may(s, p2!, false);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: p3 });
    s = may(s, p3!, true);
    s = find(s, p3!, [forestsIn(s, p3!)[0]!]);
    expect(s.pending).toBeFalsy();
    expect(s.objects[f1]!).toMatchObject({ zone: "battlefield", controller: p1, tapped: true });
    expect(landsOf(s, p3!)).toBe(1);
    expect(landsOf(s, ap)).toBe(before);
    expect(s.players[p2!]!.library).toEqual(lib2);
    expect(s.turnLog?.searched ?? []).not.toContain(p2);
  });

  it("New Frontiers: up to X, and \"then each player who searched shuffles\" is the search's own shuffle", () => {
    let { s, ap, ids } = setup([frontiers]);
    const [p1, p2, p3] = others(s, ap);
    addMana(s, ap, ["G", "C", "C"] as ManaType[], {});
    s = settle(act(s, { type: "castSpell", player: ap, objectId: ids[0]!, x: 2 }));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = may(s, ap, true);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 2 });
    const mine = forestsIn(s, ap).slice(0, 2);
    s = find(s, ap, mine);
    for (const p of [p1, p2, p3]) s = may(s, p!, false);
    expect(s.pending).toBeFalsy();
    expect(mine.map((id) => s.objects[id]!.zone)).toEqual(["battlefield", "battlefield"]);
    expect(s.objects[mine[0]!]!.tapped).toBe(true);
  });

  it("Boldwyr Heavyweights: an opponent's creature enters under their control", () => {
    let { s, ap, ids } = setup([heavyweights]);
    const [p1, p2, p3] = others(s, ap);
    addMana(s, ap, ["R", "R", "C", "C"] as ManaType[], {});
    s = settle(act(s, { type: "castSpell", player: ap, objectId: ids[0]! }));
    s = may(s, p1!, true);
    const bearId = s.players[p1!]!.library.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Grizzly Bears")!;
    s = find(s, p1!, [bearId]);
    s = may(s, p2!, false);
    s = may(s, p3!, false);
    expect(s.objects[bearId]!).toMatchObject({ zone: "battlefield", controller: p1 });
  });

  it("Eager Construct: each player decides in turn order, then those who do scry 1", () => {
    let { s, ap, ids } = setup([construct]);
    const [p1, p2, p3] = others(s, ap);
    addMana(s, ap, ["C", "C"] as ManaType[], {});
    s = settle(act(s, { type: "castSpell", player: ap, objectId: ids[0]! }));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = may(s, ap, true);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: p1 });
    s = may(s, p1!, false);
    s = may(s, p2!, true);
    s = may(s, p3!, false);
    // Now the scries, in turn order: the controller, then p2.
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: ap, how: "scry" });
    const top = s.players[ap]!.library[0]!;
    s = settle(act(s, { type: "arrangeTop", player: ap, top: [], away: [top] }));
    expect(s.players[ap]!.library[s.players[ap]!.library.length - 1]).toBe(top);
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: p2, how: "scry" });
    const top2 = s.players[p2!]!.library[0]!;
    s = settle(act(s, { type: "arrangeTop", player: p2!, top: [top2], away: [] }));
    expect(s.pending).toBeFalsy();
    expect(s.players[p2!]!.library[0]).toBe(top2);
  });

  it("Myr Custodian: its controller scries 2, then only opponents may scry 1", () => {
    let { s, ap, ids } = setup([custodian]);
    const [p1] = others(s, ap);
    addMana(s, ap, ["C", "C", "C"] as ManaType[], {});
    s = settle(act(s, { type: "castSpell", player: ap, objectId: ids[0]! }));
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: ap, how: "scry" });
    expect((s.pending as { cards: string[] }).cards).toHaveLength(2);
    const two = (s.pending as { cards: string[] }).cards;
    s = settle(act(s, { type: "arrangeTop", player: ap, top: two, away: [] }));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: p1 });
  });

  it("Kwain: those who draw gain 1 life, the others neither draw nor gain", () => {
    let { s, ap } = setup([]);
    const [p1, p2, p3] = others(s, ap);
    const k = putOnBattlefield(s, ap, kwain);
    putOnBattlefield(s, ap, forest);
    const hands = () => s.players.map((p) => p.hand.length);
    const lives = () => s.players.map((p) => p.life);
    const [h0, l0] = [hands(), lives()];
    s = settle(act(s, { type: "activateAbility", player: ap, objectId: k, index: 0 }));
    s = may(s, ap, true);
    s = may(s, p1!, false);
    s = may(s, p2!, true);
    s = may(s, p3!, false);
    expect(s.pending).toBeFalsy();
    const [h1, l1] = [hands(), lives()];
    expect([ap, p1, p2, p3].map((p) => h1[p!]! - h0[p!]!)).toEqual([1, 0, 1, 0]);
    expect([ap, p1, p2, p3].map((p) => l1[p!]! - l0[p!]!)).toEqual([1, 0, 1, 0]);
  });

  it("Veteran Explorer and Noble Benefactor: their dies triggers ask each player", () => {
    let { s, ap } = setup([]);
    const vet = putOnBattlefield(s, ap, explorer);
    putOnBattlefield(s, ap, benefactor);
    // Dies: put into the graveyard from the battlefield (CR 700.4).
    s.objects[vet]!.damage = 5;
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    expect((s.pending as { prompt: string }).prompt).toContain("up to 2 basic land cards");
  });
});
