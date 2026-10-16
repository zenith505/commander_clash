// "You may cast this card from your graveyard" (Skaab Ruinator), "... as long as you control a Zombie" (Gravecrawler),
// "... by discarding two cards in addition to paying its other costs" (Rona): a permission to cast it from there for its
// mana cost, with timing rules as usual. The card is on the stack while its costs are paid, so it can't be exiled to
// pay for itself (CR 601.2a, 601.2h; rulings on Skaab Ruinator); the condition only matters as you start to cast it
// (rulings on Gravecrawler). Countered or dead, it's back in the graveyard and can be cast again (rulings on Rona).

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, putOnBattlefield, setup } from "./helpers";
import { castProblem, compileCard, isFullySupported, planCast, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const toGraveyard = (s: GameState, pid: PlayerId, id: string) => {
  const p = s.players[pid]!;
  p.hand.splice(p.hand.indexOf(id), 1);
  p.graveyard.push(id);
  s.objects[id]!.zone = "graveyard";
};

// Real oracle text (Scryfall).
const gravecrawler = card("Gravecrawler", "Creature — Zombie", "{B}", { power: "2", toughness: "1", oracleText: "This creature can't block.\nYou may cast this card from your graveyard as long as you control a Zombie." });
const skaab = card("Skaab Ruinator", "Creature — Zombie Horror", "{1}{U}{U}", { power: "5", toughness: "6", keywords: ["Flying"], oracleText: "As an additional cost to cast this spell, exile three creature cards from your graveyard.\nFlying\nYou may cast this card from your graveyard." });
const rona = card("Rona, Sheoldred's Faithful", "Legendary Creature — Human Wizard", "{1}{U}{B}{B}", { power: "3", toughness: "4", oracleText: "Whenever you cast an instant or sorcery spell, each opponent loses 1 life.\nYou may cast this card from your graveyard by discarding two cards in addition to paying its other costs." });
const embrace = card("Demonic Embrace", "Enchantment — Aura", "{1}{B}{B}", { keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature gets +3/+1, has flying, and is a Demon in addition to its other types.\nYou may cast this card from your graveyard by paying 3 life and discarding a card in addition to paying its other costs." });
const zombie = card("Walking Corpse", "Creature — Zombie", "{1}{B}", { power: "2", toughness: "2" });

describe("you may cast this card from your graveyard", () => {
  it("compiles them", () => {
    supported(gravecrawler, skaab, rona, embrace);
    expect(compileCard(gravecrawler).fromGraveyard).toEqual([{ kind: "permission", costs: [], exile: false, if: expect.anything() }]);
    expect(compileCard(rona).fromGraveyard![0]!.costs).toEqual([{ kind: "discard", n: 2 }]);
  });

  it("Gravecrawler: only while you control a Zombie, and not from the hand that way", () => {
    const { s, ap, ids } = setup([gravecrawler]);
    expect(castProblem(s, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { via: "permission" })).toMatch(/only from your graveyard/);
    toGraveyard(s, ap, ids[0]!);
    expect(castProblem(s, ap, ids[0]!)).toMatch(/choose how to cast/);
    expect(planCast(s, ap, ids[0]!, undefined, undefined, undefined, undefined, { via: "permission" })).toBeNull();
    putOnBattlefield(s, ap, zombie);
    let t = s;
    for (const a of planCast(t, ap, ids[0]!, undefined, undefined, undefined, undefined, { via: "permission" })!) t = act(t, a);
    t = passAll(t);
    expect(t.objects[ids[0]!]!.zone).toBe("battlefield");
  });

  it("Skaab Ruinator can't exile itself to pay for itself", () => {
    const { s, ap, ids } = setup([skaab, bear(), bear({ name: "Bear Two" }), bear({ name: "Bear Three" })]);
    for (const id of ids) toGraveyard(s, ap, id);
    const [sk, b1, b2, b3] = ids as [string, string, string, string];
    expect(planCast(s, ap, sk, undefined, undefined, undefined, undefined, { via: "permission", exileCards: [sk, b1, b2] })).toBeNull();
    let t = s;
    for (const a of planCast(t, ap, sk, undefined, undefined, undefined, undefined, { via: "permission", exileCards: [b1, b2, b3] })!) t = act(t, a);
    t = passAll(t);
    expect(t.objects[sk]!.zone).toBe("battlefield");
    expect([b1, b2, b3].map((id) => t.objects[id]!.zone)).toEqual(["exile", "exile", "exile"]);
  });

  it("Rona: discard two cards in addition to its mana cost", () => {
    const { s, ap, ids } = setup([rona, bear(), bear({ name: "Bear Two" })]);
    toGraveyard(s, ap, ids[0]!);
    let t = s;
    for (const a of planCast(t, ap, ids[0]!, undefined, undefined, undefined, undefined, { via: "permission", discard: [ids[1]!, ids[2]!] })!) t = act(t, a);
    t = passAll(t);
    expect(t.objects[ids[0]!]!.zone).toBe("battlefield");
    expect([ids[1], ids[2]].map((id) => t.objects[id!]!.zone)).toEqual(["graveyard", "graveyard"]);
  });
});
