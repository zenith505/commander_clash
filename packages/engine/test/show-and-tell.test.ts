// "Each player may put an artifact, creature, enchantment, or land card from their hand onto the battlefield" (Show and
// Tell): the active player chooses first, then each other player in turn order, without revealing the card; then all
// the chosen cards enter at the same time (CR 101.4, 101.4a, rulings). Choices those cards need as they enter are made
// after everyone has chosen (rulings). Iwamori and Tempting Wurm offer it to opponents only; Kynaios and Tiro's
// opponents who put no land draw a card.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, waitingOn, type CardDef, type GameState, type ManaType, type PlayerId } from "../src";
import { addMana } from "../src/spend";

// Real oracle text (Scryfall).
const showAndTell = card("Show and Tell", "Sorcery", "{2}{U}", { oracleText: "Each player may put an artifact, creature, enchantment, or land card from their hand onto the battlefield." });
const iwamori = card("Iwamori of the Open Fist", "Legendary Creature — Human Monk", "{2}{G}{G}", { power: "5", toughness: "5", keywords: ["Trample"], oracleText: "Trample\nWhen Iwamori enters, each opponent may put a legendary creature card from their hand onto the battlefield." });
const wurm = card("Tempting Wurm", "Creature — Wurm", "{1}{G}", { power: "5", toughness: "5", oracleText: "When this creature enters, each opponent may put any number of artifact, creature, enchantment, and/or land cards from their hand onto the battlefield." });
const kynaios = card("Kynaios and Tiro of Meletis", "Legendary Creature — Human Soldier", "{R}{G}{W}{U}", { power: "2", toughness: "8", oracleText: "At the beginning of your end step, draw a card. Each player may put a land card from their hand onto the battlefield, then each opponent who didn't draws a card." });
const pacifism = card("Pacifism", "Enchantment — Aura", "{1}{W}", { keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature can't attack or block." });
const giant = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });
const legend = card("Isamaru, Hound of Konda", "Legendary Creature — Dog", "{W}", { power: "2", toughness: "2" });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const wastes = card("Wastes", "Basic Land");

/** A card in `pid`'s hand. */
function inHand(s: GameState, pid: PlayerId, def: CardDef): string {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
}
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const others = (s: GameState, ap: PlayerId) => [1, 2, 3].map((i) => s.turnOrder[(s.turnOrder.indexOf(ap) + i) % 4]!);
const choose = (s: GameState, pid: PlayerId, found: string[]) => settle(act(s, { type: "searchLibrary", player: pid, found }));
/** Empty every hand but for the cards a test gives (`keep`), so only those are there. */
const clearHands = (s: GameState, keep: string[] = []) => {
  for (const p of s.players) {
    const away = p.hand.filter((id) => !keep.includes(id));
    for (const id of away) s.objects[id]!.zone = "library";
    p.library.push(...away);
    p.hand = p.hand.filter((id) => keep.includes(id));
  }
};

describe("each player may put a card from their hand onto the battlefield", () => {
  it("parses", () => [showAndTell, iwamori, wurm, kynaios].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Show and Tell: each chooses in turn order without revealing it, then all the cards enter together", () => {
    let { s, ap, ids } = setup([showAndTell, giant, shock]);
    clearHands(s, ids);
    const [p1, p2, p3] = others(s, ap);
    const theirs = inHand(s, p1!, bear());
    inHand(s, p1!, shock);
    const land = inHand(s, p2!, wastes);
    inHand(s, p3!, shock);
    addMana(s, ap, ["U", "C", "C"] as ManaType[], {});
    s = act(s, { type: "castSpell", player: ap, objectId: ids[0]! });
    s = settle(s);
    // The caster is the active player: first. Only the permanent cards are offered, and none is required.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, fromHand: true, min: 0, max: 1 });
    expect((s.pending as { cards: string[] }).cards).toEqual([ids[1]]);
    s = choose(s, ap, [ids[1]!]);
    // Nothing has entered, and the log doesn't say which card was chosen.
    expect(s.objects[ids[1]!]!.zone).toBe("hand");
    expect(s.log.slice(-3).join(" ")).not.toContain("Hill Giant");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: p1, cards: [theirs] });
    s = choose(s, p1!, [theirs]);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: p2, cards: [land] });
    s = choose(s, p2!, []);
    // p3 has only an instant: not asked. Then the chosen cards enter, each under its owner's control.
    expect(s.pending).toBeFalsy();
    expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
    expect(s.objects[theirs]!).toMatchObject({ zone: "battlefield", controller: p1 });
    expect(s.objects[land]!.zone).toBe("hand");
    expect(s.objects[ids[2]!]!.zone).toBe("hand");
  });

  it("Show and Tell: an Aura's host is chosen after everyone has chosen, and can't be a creature entering with it", () => {
    let { s, ap, ids } = setup([showAndTell, pacifism]);
    clearHands(s, ids);
    const [p1] = others(s, ap);
    const mine = putOnBattlefield(s, ap, bear());
    const foe = putOnBattlefield(s, p1!, giant);
    const entering = inHand(s, p1!, bear());
    addMana(s, ap, ["U", "C", "C"] as ManaType[], {});
    s = act(s, { type: "castSpell", player: ap, objectId: ids[0]! });
    s = settle(s);
    s = choose(s, ap, [ids[1]!]);
    s = choose(s, p1!, [entering]);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "enchant" });
    const options = (s.pending as { options: string[] }).options.join(" ");
    expect(options).toContain(mine);
    expect(options).toContain(foe);
    expect(options).not.toContain(entering);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: (s.pending as { options: string[] }).options.find((o) => o.includes(foe))! }));
    expect(s.objects[ids[1]!]!).toMatchObject({ zone: "battlefield", attachedTo: foe });
    expect(s.objects[entering]!.zone).toBe("battlefield");
  });

  it("Iwamori: only opponents, and only legendary creature cards", () => {
    let { s, ap, ids } = setup([iwamori, legend]);
    clearHands(s, ids);
    const [p1, p2] = others(s, ap);
    const dog = inHand(s, p1!, legend);
    inHand(s, p2!, giant);
    addMana(s, ap, ["G", "G", "C", "C"] as ManaType[], {});
    s = act(s, { type: "castSpell", player: ap, objectId: ids[0]! });
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: p1, cards: [dog] });
    s = choose(s, p1!, [dog]);
    expect(s.pending).toBeFalsy();
    expect(s.objects[dog]!).toMatchObject({ zone: "battlefield", controller: p1 });
    expect(s.objects[ids[1]!]!.zone).toBe("hand");
  });

  it("Tempting Wurm: any number of them", () => {
    let { s, ap, ids } = setup([wurm]);
    clearHands(s, ids);
    const [p1] = others(s, ap);
    const cards = [inHand(s, p1!, bear()), inHand(s, p1!, wastes), inHand(s, p1!, giant)];
    inHand(s, p1!, shock);
    addMana(s, ap, ["G", "C"] as ManaType[], {});
    s = act(s, { type: "castSpell", player: ap, objectId: ids[0]! });
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: p1, min: 0, max: 3 });
    expect((s.pending as { cards: string[] }).cards.sort()).toEqual([...cards].sort());
    s = choose(s, p1!, cards.slice(0, 2));
    expect(cards.map((id) => s.objects[id]!.zone)).toEqual(["battlefield", "battlefield", "hand"]);
  });

  it("Kynaios and Tiro: each opponent who put no land draws a card, and the controller doesn't", () => {
    let { s, ap } = setup([]);
    clearHands(s);
    const [p1, p2, p3] = others(s, ap);
    putOnBattlefield(s, ap, kynaios);
    const land = inHand(s, p1!, wastes);
    inHand(s, p2!, wastes);
    const hands = () => s.players.map((p) => p.hand.length);
    const before = hands();
    s = settle(passUntil(s, "end", ap));
    // The controller drew first; its new card may be a land (Forest): offered too.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = choose(s, ap, []);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: p1, cards: [land] });
    s = choose(s, p1!, [land]);
    s = choose(s, p2!, []);
    expect(s.objects[land]!.zone).toBe("battlefield");
    const after = hands();
    expect(after[ap]).toBe(before[ap]! + 1);
    // p1 put a land (one fewer in hand); p2 and p3 put none and drew.
    expect(after[p1!]).toBe(before[p1!]! - 1);
    expect(after[p2!]).toBe(before[p2!]! + 1);
    expect(after[p3!]).toBe(before[p3!]! + 1);
  });
});
