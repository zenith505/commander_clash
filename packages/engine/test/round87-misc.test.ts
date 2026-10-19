// Round 87: smaller fixes and cards.

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, pt, putOnBattlefield, setup, target } from "./helpers";
import { characteristics, isFullySupported, waitingOn, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
function settle(s: GameState) {
  for (let i = 0; i < 40 && (s.stack.length || s.resolving) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}

// Real oracle text (Scryfall).
const notDead = card("Not Dead After All", "Instant", "{B}", {
  keywords: ["Role token"],
  oracleText: 'Until end of turn, target creature you control gains "When this creature dies, return it to the battlefield tapped under its owner\'s control, then create a Wicked Role token attached to it." (Enchanted creature gets +1/+1. When this token is put into a graveyard, each opponent loses 1 life.)',
});
const murder = card("Doom Blade", "Instant", "{1}{B}", { oracleText: "Destroy target nonblack creature." });

describe("a quoted ability with ', then' in it is one ability", () => {
  it("Not Dead After All: the creature returns tapped with a Wicked Role attached", () => {
    supported(notDead);
    const { s: s0, ap, ids } = setup([notDead, murder]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = settle(cast(s0, ap, ids[0]!, [target(b)]));
    s = settle(cast(s, ap, ids[1]!, [target(b)]));
    const back = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Grizzly Bears" && s.objects[id]!.controller === ap)!;
    expect(back).toBeDefined();
    expect(s.objects[back]!.tapped).toBe(true);
    const role = s.battlefield.find((id) => characteristics(s, s.objects[id]!).subtypes.includes("Role"));
    expect(role && s.objects[role]!.attachedTo).toBe(back);
    expect(pt(s, back)).toBe("3/3");
  });
});
