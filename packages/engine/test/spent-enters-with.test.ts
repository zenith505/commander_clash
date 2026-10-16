// "~ enters with two +1/+1 counters on it if it wasn't cast or no mana was spent to cast it" (Freestrider Commando) and
// "... unless two or more colors of mana were spent to cast it" (Steel Exemplar): the mana spent on its total cost
// (CR 601.2h; rulings: mana paid for an additional cost or a cost increase counts), none if it wasn't cast (CR 614.1c).

import { describe, expect, it } from "vitest";
import { act, card, passAll, pt, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, moveObject, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

// Real oracle text (Scryfall).
const commando = card("Freestrider Commando", "Creature — Centaur Mercenary", "{2}{G}", { power: "3", toughness: "3", oracleText: "This creature enters with two +1/+1 counters on it if it wasn't cast or no mana was spent to cast it.\nPlot {3}{G} (You may pay {3}{G} and exile this card from your hand. Cast it as a sorcery on a later turn without paying its mana cost. Plot only as a sorcery.)" });
const exemplar = card("Steel Exemplar", "Artifact Creature — Wizard", "{5}", { power: "4", toughness: "4", keywords: ["Trample"], oracleText: "Trample\nThis creature enters with two +1/+1 counters on it unless two or more colors of mana were spent to cast it." });

function onlyLands(s: GameState, pid: PlayerId, lands: CardDef[]) {
  for (const id of [...s.battlefield]) if (s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.typeLine.includes("Land")) s.battlefield.splice(s.battlefield.indexOf(id), 1);
  lands.forEach((l) => putOnBattlefield(s, pid, l));
}
const island = () => card("Island", "Basic Land — Island");
const plains = () => card("Plains", "Basic Land — Plains");

describe("enters with counters depending on the mana spent", () => {
  it("parses", () => [commando, exemplar].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Freestrider Commando: cast with mana, no counters; put onto the battlefield without being cast, two", () => {
    const { s: s0, ap, ids } = setup([commando, commando]);
    let s = settle(passAll(planCast(s0, ap, ids[0]!)!.reduce((x, a) => act(x, a), s0)));
    expect(pt(s, ids[0]!)).toBe("3/3");
    moveObject(s, ids[1]!, "battlefield");
    s = settle(s);
    expect(pt(s, ids[1]!)).toBe("5/5");
  });

  it("Steel Exemplar: one color (or none) spent, two counters; two colors, none", () => {
    for (const [lands, after] of [[[island(), island(), island(), island(), island()], "6/6"], [[island(), island(), island(), plains(), plains()], "4/4"]] as const) {
      const { s: s0, ap, ids } = setup([exemplar]);
      onlyLands(s0, ap, [...lands]);
      const s = settle(passAll(planCast(s0, ap, ids[0]!)!.reduce((x, a) => act(x, a), s0)));
      expect(pt(s, ids[0]!)).toBe(after);
    }
  });
});
