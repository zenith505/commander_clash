// Balancing Act, Restore Balance, Magus of the Balance: "Each player chooses a number of lands they control equal to the
// number of lands controlled by the player who controls the fewest, then sacrifices the rest. Players sacrifice
// creatures and discard cards the same way." The steps happen one after another in the order written, each counted
// when its turn comes; in each, the active player chooses first, then the others in turn order, and the rest go at
// the same time; a player with none makes everyone lose them all (rulings, CR 101.4).

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, forest, passAll, putOnBattlefield, setup } from "./helpers";
import { compileCard, isFullySupported, type CardDef, type GameState, type ManaType, type PlayerId } from "../src";
import { addMana } from "../src/spend";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const act_ = card("Balancing Act", "Sorcery", "{2}{W}{W}", { oracleText: "Each player chooses a number of permanents they control equal to the number of permanents controlled by the player who controls the fewest, then sacrifices the rest. Each player discards cards the same way." });
const restore = card("Restore Balance", "Sorcery", "", { keywords: ["Suspend"], oracleText: "Suspend 6—{W}\nEach player chooses a number of lands they control equal to the number of lands controlled by the player who controls the fewest, then sacrifices the rest. Players sacrifice creatures and discard cards the same way." });
const magus = card("Magus of the Balance", "Creature — Human Wizard", "{1}{W}", { power: "2", toughness: "2", oracleText: "{4}{W}, {T}, Sacrifice this creature: Each player chooses a number of lands they control equal to the number of lands controlled by the player who controls the fewest, then sacrifices the rest. Players discard cards and sacrifice creatures the same way." });
const arbor = card("Dryad Arbor", "Land Creature — Forest Dryad", "", { power: "1", toughness: "1", colors: ["G"] });

const zone = (s: GameState, id: string) => s.objects[id]!.zone;
const mine = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid);
const lands = (s: GameState, pid: PlayerId) => mine(s, pid).filter((id) => s.cards[s.objects[id]!.cardId]!.typeLine.includes("Land"));
const pick = (s: GameState, pid: PlayerId, ids: string[]) => passAll(act(s, { type: "pickPermanents", player: pid, ids }));
const discard = (s: GameState, pid: PlayerId) => act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, (s.pending as { count: number }).count) });
/** Leave `pid` with only `n` cards in hand (the rest go to the bottom of the library). */
function handOf(s: GameState, pid: PlayerId, n: number) {
  const p = s.players[pid]!;
  for (const id of p.hand.splice(n)) {
    s.objects[id]!.zone = "library";
    p.library.push(id);
  }
}
/** The other players in turn order, starting after the active player. */
const others = (s: GameState, ap: PlayerId) => [1, 2, 3].map((i) => s.turnOrder[(s.turnOrder.indexOf(ap) + i) % 4]!);

describe("Balancing Act, Restore Balance, Magus of the Balance", () => {
  it("parse, in the order written", () => {
    supported(act_, restore, magus);
    expect(compileCard(restore).spell!.effects.map((e) => e.type)).toEqual(["keepRest", "keepRest", "discard"]);
    expect(compileCard(magus).activated[0]!.body.effects.map((e) => e.type)).toEqual(["keepRest", "discard", "keepRest"]);
  });

  it("Balancing Act: everyone keeps as many permanents as the player with the fewest, then as many cards", () => {
    let { s, ap, ids } = setup([act_]);
    const [p1, p2, p3] = others(s, ap);
    const b1 = [putOnBattlefield(s, p1!, forest), putOnBattlefield(s, p1!, bear()), putOnBattlefield(s, p1!, forest)];
    const b2 = [putOnBattlefield(s, p2!, forest), putOnBattlefield(s, p2!, bear()), putOnBattlefield(s, p2!, forest), putOnBattlefield(s, p2!, forest), putOnBattlefield(s, p2!, bear())];
    const b3 = [putOnBattlefield(s, p3!, forest), putOnBattlefield(s, p3!, forest), putOnBattlefield(s, p3!, forest), putOnBattlefield(s, p3!, forest)];
    handOf(s, p1!, 5);
    handOf(s, p2!, 2);
    addMana(s, ap, ["W", "W", "C", "C"] as ManaType[], {});
    s = passAll(act(s, { type: "castSpell", player: ap, objectId: ids[0]! }));
    // The active player first: 3 of their 14 lands.
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "keep", count: 3 });
    const keep = lands(s, ap).slice(0, 3);
    s = pick(s, ap, keep);
    // p1 has exactly 3 and isn't asked; p2 then p3 choose.
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: p2, count: 3 });
    s = pick(s, p2!, [b2[1]!, b2[4]!, b2[0]!]);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: p3, count: 3 });
    s = pick(s, p3!, b3.slice(1));
    expect(mine(s, ap).sort()).toEqual([...keep].sort());
    expect(b1.every((id) => zone(s, id) === "battlefield")).toBe(true);
    expect([b2[2], b2[3], b3[0]].map((id) => zone(s, id!))).toEqual(["graveyard", "graveyard", "graveyard"]);
    // Then the cards: down to p2's 2 (the active player's hand has 7, Balancing Act having left it).
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, count: s.players[ap]!.hand.length - 2 });
    s = discard(s, ap);
    expect(s.pending).toMatchObject({ kind: "discard", player: p1, count: 3 });
    s = discard(s, p1!);
    expect(s.pending).toMatchObject({ kind: "discard", player: p3 });
    s = passAll(discard(s, p3!));
    expect(s.pending).toBeFalsy();
    expect(s.turnOrder.map((p) => s.players[p]!.hand.length)).toEqual([2, 2, 2, 2]);
  });

  it("a player with no cards in hand makes everyone discard their hand", () => {
    let { s, ap, ids } = setup([act_]);
    for (const p of others(s, ap)) putOnBattlefield(s, p, forest);
    handOf(s, others(s, ap)[0]!, 0);
    addMana(s, ap, ["W", "W", "C", "C"] as ManaType[], {});
    s = passAll(act(s, { type: "castSpell", player: ap, objectId: ids[0]! }));
    s = pick(s, ap, lands(s, ap).slice(0, 1));
    expect(s.pending).toBeFalsy();
    expect(s.turnOrder.map((p) => s.players[p]!.hand.length)).toEqual([0, 0, 0, 0]);
  });

  it("Magus of the Balance: lands, then cards, then creatures, each counted when it comes: a Dryad Arbor sacrificed as a land leaves its controller with no creatures", () => {
    let { s, ap } = setup([]);
    const [p1, p2, p3] = others(s, ap);
    const m = putOnBattlefield(s, ap, magus);
    const myBear = putOnBattlefield(s, ap, bear());
    const f1 = putOnBattlefield(s, p1!, forest);
    const a1 = putOnBattlefield(s, p1!, arbor);
    putOnBattlefield(s, p2!, forest);
    const bears2 = putOnBattlefield(s, p2!, bear());
    const f3 = [putOnBattlefield(s, p3!, forest), putOnBattlefield(s, p3!, forest)];
    const bears3 = [putOnBattlefield(s, p3!, bear()), putOnBattlefield(s, p3!, bear())];
    for (const p of [p1!, p2!, p3!]) handOf(s, p, 3);
    s = activate(s, ap, m, 0);
    expect(zone(s, m)).toBe("graveyard");
    // Lands: everyone keeps one.
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, count: 1 });
    s = pick(s, ap, lands(s, ap).filter((id) => !s.objects[id]!.tapped).slice(0, 1));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: p1, count: 1 });
    expect((s.pending as { options: string[] }).options.sort()).toEqual([f1, a1].sort());
    s = pick(s, p1!, [f1]);
    s = pick(s, p3!, [f3[0]!]);
    expect(zone(s, a1)).toBe("graveyard");
    expect(zone(s, f3[1]!)).toBe("graveyard");
    // Cards, down to 3 each.
    for (const p of [ap, p1!, p2!, p3!]) if (s.pending?.kind === "discard") s = discard(s, (s.pending as { player: PlayerId }).player);
    expect(s.pending).toBeFalsy();
    expect(s.turnOrder.map((p) => s.players[p]!.hand.length)).toEqual([3, 3, 3, 3]);
    // Creatures: p1 has none now, so all of them go.
    expect([myBear, bears2, ...bears3].map((id) => zone(s, id))).toEqual(["graveyard", "graveyard", "graveyard", "graveyard"]);
  });
});
