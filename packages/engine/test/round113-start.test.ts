// Round 113, the first of the most played cards: bots and Food Chain, ...

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, putOnBattlefield, setup } from "./helpers";
import { botActions, waitingOn, type Action, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const foodChain = card("Food Chain", "Enchantment", "{2}{G}", {
  oracleText: "Exile a creature you control: Add X mana of any one color, where X is 1 plus the exiled creature's mana value. Spend this mana only to cast creature spells.",
});
const wurm = card("Craw Wurm", "Creature — Wurm", "{4}{G}{G}", { power: "6", toughness: "4" });

/** Only these cards in the player's hand (the rest back on top of the library), and no commander to cast. */
const onlyInHand = (s: GameState, pid: PlayerId, ids: string[]) => {
  const p = s.players[pid]!;
  for (const id of p.hand.filter((x) => !ids.includes(x))) {
    s.objects[id]!.zone = "library";
    p.library.unshift(id);
  }
  p.hand = [...ids];
  p.command = [];
};
/** All of the player's lands tapped but `untapped` of them. */
const tapLands = (s: GameState, pid: PlayerId, untapped: number) => {
  const lands = s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land") && /Forest/.test(s.cards[s.objects[id]!.cardId]!.name));
  const others = s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land") && !lands.includes(id));
  [...lands.slice(untapped), ...others].forEach((id) => (s.objects[id]!.tapped = true));
};

/** The bot's actions in its main phase until it passes, as taken. */
function botMain(s: GameState, pid: PlayerId, max = 20): { s: GameState; taken: Action[] } {
  const taken: Action[] = [];
  for (let i = 0; i < max && waitingOn(s) === pid; i++) {
    const acts = botActions(s, pid);
    if (acts.length === 1 && acts[0]!.type === "passPriority" && !s.stack.length) break;
    for (const a of acts) {
      taken.push(a);
      s = act(s, a);
    }
  }
  return { s, taken };
}

describe("bots and Food Chain", () => {
  it("a bot exiles a cheaper creature to cast a creature card it couldn't pay for", () => {
    const { s: s0, ap, ids } = setup([wurm]);
    const fc = putOnBattlefield(s0, ap, foodChain);
    const b = putOnBattlefield(s0, ap, bear());
    onlyInHand(s0, ap, ids);
    tapLands(s0, ap, 3);
    const { s, taken } = botMain(s0, ap);
    expect(taken.some((a) => a.type === "activateAbility" && a.objectId === fc && a.costs?.sacrifice?.[0] === b)).toBe(true);
    // Green, for the Wurm: three from Food Chain, three from the Forests.
    expect(taken.some((a) => a.type === "chooseOption" && /green/i.test(a.choice))).toBe(true);
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.objects[ids[0]!]!.zone).toBe("stack");
    expect(passAll(s).objects[ids[0]!]!.zone).toBe("battlefield");
  });

  it("not when the mana still doesn't pay for anything", () => {
    const { s: s0, ap, ids } = setup([wurm]);
    const fc = putOnBattlefield(s0, ap, foodChain);
    const b = putOnBattlefield(s0, ap, bear());
    onlyInHand(s0, ap, ids);
    tapLands(s0, ap, 1);
    const { s, taken } = botMain(s0, ap);
    expect(taken.some((a) => a.type === "activateAbility" && a.objectId === fc)).toBe(false);
    expect(s.objects[b]!.zone).toBe("battlefield");
  });

  it("not a creature worth about as much as the card, nor a commander", () => {
    const { s: s0, ap, ids } = setup([card("Hill Giant", "Creature — Giant", "{3}{G}", { power: "3", toughness: "3" })]);
    const fc = putOnBattlefield(s0, ap, foodChain);
    const b = putOnBattlefield(s0, ap, card("Centaur Courser", "Creature — Centaur", "{2}{G}", { power: "3", toughness: "3" }));
    const cmdr = putOnBattlefield(s0, ap, card("Big Commander", "Legendary Creature — Elf", "{1}{G}", { power: "3", toughness: "3" }), { commander: true });
    onlyInHand(s0, ap, ids);
    tapLands(s0, ap, 0);
    const { s, taken } = botMain(s0, ap);
    expect(taken.some((a) => a.type === "activateAbility" && a.objectId === fc)).toBe(false);
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[cmdr]!.zone).toBe("battlefield");
  });
});
