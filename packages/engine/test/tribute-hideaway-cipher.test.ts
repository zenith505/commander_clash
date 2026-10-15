// Tribute (CR 702.104): "As this creature enters, choose an opponent. That player may put an additional N +1/+1
// counters on it as it enters", and "if tribute wasn't paid" (702.104b).
// Hideaway N (CR 702.75): "When this permanent enters, look at the top N cards of your library. Exile one of them face
// down and put the rest on the bottom of your library in a random order." The exiled card is linked to the permanent:
// "the exiled card" (702.75b, 607.2a); its owner may look at it (406.3b).
// Cipher (CR 702.99): "Then you may exile this spell card encoded on a creature you control" and the encoded creature
// has "Whenever this creature deals combat damage to a player, you may copy the encoded card and you may cast the copy
// without paying its mana cost" (702.99a-b, 707.12).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { abilitiesOf, botActions, isFullySupported, moveObject, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("can't do that");
  for (const a of plan) s = act(s, a);
  return s;
};
function settle(s: GameState) {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}
/** Exile cards from the top of `pid`'s library until `left` remain. */
function shrinkLibrary(s: GameState, pid: PlayerId, left: number) {
  const lib = s.players[pid]!.library;
  for (const id of lib.splice(0, lib.length - left)) {
    s.objects[id]!.zone = "exile";
    s.players[pid]!.exile.push(id);
  }
}

// Real oracle text (Scryfall).
const tribute = (n: string, k: number) => `Tribute ${k} (As this creature enters, an opponent of your choice may put ${n} +1/+1 counter${k === 1 ? "" : "s"} on it.)`;
const fanatic = card("Fanatic of Xenagos", "Creature — Centaur Warrior", "{1}{R}{G}", { power: "3", toughness: "3", keywords: ["Trample", "Tribute"], oracleText: `Trample\n${tribute("a", 1)}\nWhen this creature enters, if tribute wasn't paid, it gets +1/+1 and gains haste until end of turn.` });
const demolok = card("Nessian Demolok", "Creature — Beast", "{3}{G}{G}", { power: "3", toughness: "3", keywords: ["Tribute"], oracleText: `${tribute("three", 3)}\nWhen this creature enters, if tribute wasn't paid, destroy target noncreature permanent.` });
const harpy = card("Shrike Harpy", "Creature — Harpy", "{3}{B}{B}", { power: "2", toughness: "2", keywords: ["Flying", "Tribute"], oracleText: `Flying\n${tribute("two", 2)}\nWhen this creature enters, if tribute wasn't paid, target opponent sacrifices a creature of their choice.` });
const hideaway = (n: string, k: number, what: string) => `Hideaway ${k} (When this ${what} enters, look at the top ${n} cards of your library, exile one face down, then put the rest on the bottom in a random order.)`;
const shelldock = card("Shelldock Isle", "Land", "", { keywords: ["Hideaway"], oracleText: `${hideaway("four", 4, "land")}\nThis land enters tapped.\n{T}: Add {U}.\n{U}, {T}: You may play the exiled card without paying its mana cost if a library has twenty or fewer cards in it.` });
const mosswort = card("Mosswort Bridge", "Land", "", { keywords: ["Hideaway"], oracleText: `${hideaway("four", 4, "land")}\nThis land enters tapped.\n{T}: Add {G}.\n{G}, {T}: You may play the exiled card without paying its mana cost if creatures you control have total power 10 or greater.` });
const howltooth = card("Howltooth Hollow", "Land", "", { keywords: ["Hideaway"], oracleText: `${hideaway("four", 4, "land")}\nThis land enters tapped.\n{T}: Add {B}.\n{B}, {T}: You may play the exiled card without paying its mana cost if each player has no cards in hand.` });
const watcher = card("Watcher for Tomorrow", "Creature — Human Wizard", "{1}{U}", { power: "2", toughness: "1", keywords: ["Hideaway"], oracleText: `${hideaway("four", 4, "creature")}\nThis creature enters tapped.\nWhen this creature leaves the battlefield, put the exiled card into its owner's hand.` });
const cipher = "Cipher (Then you may exile this spell card encoded on a creature you control. Whenever that creature deals combat damage to a player, its controller may cast a copy of the encoded card without paying its mana cost.)";
const lastThoughts = card("Last Thoughts", "Sorcery", "{3}{U}", { keywords: ["Cipher"], oracleText: `Draw a card.\n${cipher}` });
const hands = card("Hands of Binding", "Sorcery", "{1}{U}", { keywords: ["Cipher"], oracleText: `Tap target creature an opponent controls. That creature doesn't untap during its controller's next untap step.\n${cipher}` });
const relic = card("Relic Test", "Artifact", "{2}");

describe("tribute", () => {
  it("parses", () => {
    supported(fanatic, demolok, harpy);
  });

  it("you choose an opponent, who may put the counters on it; then its ability doesn't trigger", () => {
    const { s: s0, ap, opp, ids } = setup([fanatic]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "tribute" });
    expect(s.pending?.kind === "chooseOption" && s.pending.options).toHaveLength(3);
    s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "tributePay", options: ["pay", "no"] });
    s = settle(act(s, { type: "chooseOption", player: opp, choice: "pay" }));
    expect(pt(s, ids[0]!)).toBe("4/4");
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(1);
    expect(objHasKeyword(s, s.objects[ids[0]!]!, "Haste")).toBe(false);
  });

  it("'if tribute wasn't paid'", () => {
    const { s: s0, ap, opp, ids } = setup([fanatic]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
    s = settle(act(s, { type: "chooseOption", player: opp, choice: "no" }));
    expect(pt(s, ids[0]!)).toBe("4/4");
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBeUndefined();
    expect(objHasKeyword(s, s.objects[ids[0]!]!, "Haste")).toBe(true);
  });

  it("only the chosen opponent decides", () => {
    const { s: s0, ap, opp, ids } = setup([demolok]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
    const other = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    expect(() => act(s, { type: "chooseOption", player: other, choice: "pay" })).toThrow();
  });

  it("a bot pays tribute rather than lose its best noncreature permanent", () => {
    const { s: s0, ap, opp, ids } = setup([demolok]);
    putOnBattlefield(s0, opp, relic);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
    const [answer] = botActions(s, opp);
    expect(answer).toMatchObject({ type: "chooseOption", choice: "pay" });
  });
});

describe("hideaway", () => {
  it("parses", () => {
    supported(shelldock, mosswort, howltooth, watcher);
  });

  it("exiles one of the top cards face down, the rest go to the bottom; the land plays it later", () => {
    const { s: s0, ap, opp } = setup([shelldock]);
    const land = s0.players[ap]!.hand.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Shelldock Isle")!;
    s0.players[ap]!.landsPlayedThisTurn = 0;
    const top = s0.players[ap]!.library.slice(0, 4);
    const lib = s0.players[ap]!.library.length;
    let s = settle(act(s0, { type: "playLand", player: ap, objectId: land }));
    expect(s.objects[land]!.tapped).toBe(true);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 1 });
    const creature = top.find((id) => s.cards[s.objects[id]!.cardId]!.typeLine.includes("Creature"))!;
    expect(creature).toBeDefined();
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [creature] }));
    expect(s.objects[creature]!.zone).toBe("exile");
    expect(s.objects[creature]!.hiddenExile).toMatchObject({ by: land, seen: [ap] });
    expect(s.players[ap]!.library.length).toBe(lib - 1);
    expect(s.players[ap]!.library.slice(-3).sort()).toEqual(top.filter((id) => id !== creature).sort());
    // The log names the card only for its owner.
    expect(s.log.some((l) => l.to === ap && /Grizzly Bears/.test(l.text))).toBe(true);
    expect(s.log.some((l) => l.to === undefined && /Grizzly Bears/.test(l.text))).toBe(false);

    // Untapped next turn; no library has 20 or fewer cards yet: nothing happens.
    s.objects[land]!.tapped = false;
    const index = abilitiesOf(s, s.objects[land]!).activated.findIndex((a) => JSON.stringify(a.body).includes("playLinked"));
    s = settle(run(s, planActivate(s, ap, land, index)));
    expect(s.pending).toBeFalsy();
    expect(s.objects[creature]!.zone).toBe("exile");

    // Then with an opponent's library down to 20.
    shrinkLibrary(s, opp, 20);
    s.objects[land]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, land, index)));
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: creature });
    s = settle(act(s, { type: "castSpell", player: ap, objectId: creature }));
    expect(s.objects[creature]!.zone).toBe("battlefield");
    expect(s.objects[creature]!.hiddenExile).toBeUndefined();
  });

  it("a land hidden away is played only with a land play left, on your turn", () => {
    const { s: s0, ap, opp } = setup([shelldock]);
    const land = s0.players[ap]!.hand.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Shelldock Isle")!;
    s0.players[ap]!.landsPlayedThisTurn = 0;
    const forest = s0.players[ap]!.library.slice(0, 4).find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Forest")!;
    let s = settle(act(s0, { type: "playLand", player: ap, objectId: land }));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [forest] }));
    shrinkLibrary(s, opp, 20);
    s.objects[land]!.tapped = false;
    const index = abilitiesOf(s, s.objects[land]!).activated.findIndex((a) => JSON.stringify(a.body).includes("playLinked"));
    // The land play is used (Shelldock Isle itself).
    s = settle(run(s, planActivate(s, ap, land, index)));
    expect(s.pending).toBeFalsy();
    expect(s.objects[forest]!.zone).toBe("exile");
    s.players[ap]!.landsPlayedThisTurn = 0;
    s.objects[land]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, land, index)));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[forest]!.zone).toBe("battlefield");
    expect(s.players[ap]!.landsPlayedThisTurn).toBe(1);
  });

  it("Watcher for Tomorrow: the exiled card goes to its owner's hand when it leaves", () => {
    const { s: s0, ap, ids } = setup([watcher]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const pick = s.pending?.kind === "searchLibrary" ? s.pending.cards[0]! : "";
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [pick] }));
    expect(s.objects[pick]!.zone).toBe("exile");
    expect(s.objects[ids[0]!]!.tapped).toBe(true);
    moveObject(s, ids[0]!, "graveyard");
    s = settle(s);
    expect(s.objects[pick]!.zone).toBe("hand");
    expect(s.players[ap]!.hand).toContain(pick);
  });

  it("a bot hides away its most expensive card", () => {
    const { s: s0, ap, ids } = setup([watcher]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const [answer] = botActions(s, ap);
    const cards = s.pending?.kind === "searchLibrary" ? s.pending.cards : [];
    const best = Math.max(...cards.map((id) => s.cards[s.objects[id]!.cardId]!.cmc));
    expect(answer).toMatchObject({ type: "searchLibrary" });
    const found = (answer as Extract<Action, { type: "searchLibrary" }>).found;
    expect(found).toHaveLength(1);
    expect(s.cards[s.objects[found[0]!]!.cardId]!.cmc).toBe(best);
  });
});

describe("cipher", () => {
  it("parses", () => {
    supported(lastThoughts, hands);
  });

  it("encoded on a creature, it casts a copy whenever that creature deals combat damage to a player", () => {
    const { s: s0, ap, opp, ids } = setup([lastThoughts]);
    const b = putOnBattlefield(s0, ap, bear());
    const hand = s0.players[ap]!.hand.length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.hand.length).toBe(hand); // cast one, drew one
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "encode", options: [b], min: 0 });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [b] }));
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    expect(s.objects[b]!.encoded).toEqual([{ id: ids[0], zc: s.objects[ids[0]!]!.zoneChanges ?? 0 }]);

    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    const drawn = s.players[ap]!.hand.length;
    for (let i = 0; i < 60 && s.pending?.kind !== "castFree"; i++) {
      const pid = waitingOn(s)!;
      s = s.pending?.kind === "declareBlockers" ? act(s, { type: "declareBlockers", player: pid, blocks: [] }) : act(s, { type: "passPriority", player: pid });
    }
    expect(s.players[opp]!.life).toBe(38);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap });
    const copy = s.pending?.kind === "castFree" ? s.pending.objectId : "";
    expect(copy).not.toBe(ids[0]);
    s = settle(act(s, { type: "castSpell", player: ap, objectId: copy }));
    expect(s.players[ap]!.hand.length).toBe(drawn + 1);
    expect(s.objects[copy]).toBeUndefined(); // the copy ceased to exist (CR 704.5e)
    expect(s.objects[ids[0]!]!.zone).toBe("exile"); // still encoded
    expect(s.pending).toBeFalsy(); // a copy isn't encoded again
  });

  it("not encoded: to the graveyard as usual", () => {
    const { s: s0, ap, ids } = setup([lastThoughts]);
    putOnBattlefield(s0, ap, bear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [] }));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("no creature: nothing to encode on", () => {
    const { s: s0, ap, opp, ids } = setup([hands]);
    const theirs = putOnBattlefield(s0, opp, bear());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(theirs)])));
    expect(s.pending).toBeFalsy();
    expect(s.objects[theirs]!.tapped).toBe(true);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("the encoding ends when the creature leaves the battlefield", () => {
    const { s: s0, ap, ids } = setup([lastThoughts]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [b] }));
    moveObject(s, b, "hand");
    expect(s.objects[b]!.encoded).toBeUndefined();
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
  });

  it("a bot encodes on a creature", () => {
    const { s: s0, ap, ids } = setup([lastThoughts]);
    const b = putOnBattlefield(s0, ap, bear());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(botActions(s, ap)[0]).toMatchObject({ type: "pickPermanents", ids: [b] });
  });
});
