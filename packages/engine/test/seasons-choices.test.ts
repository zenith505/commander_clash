// Season of Gathering and Season of Weaving: "Choose artifact or enchantment. Destroy all permanents of the chosen
// type." asks each time the mode is chosen, since each instance of a repeated mode makes its own choices (CR 700.2i);
// "Choose a creature you control. ..." picks one as it resolves, without targeting, and "it" is that one.

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passAll, putOnBattlefield, setup, target } from "./helpers";
import { botActions } from "../src/bot";
import { isFullySupported, objHasKeyword, power, type CardDef, type GameState } from "../src";

// Real oracle text (Scryfall).
const gathering = card("Season of Gathering", "Sorcery", "{4}{G}{G}", { oracleText: "Choose up to five {P} worth of modes. You may choose the same mode more than once.\n{P} — Put a +1/+1 counter on a creature you control. It gains vigilance and trample until end of turn.\n{P}{P} — Choose artifact or enchantment. Destroy all permanents of the chosen type.\n{P}{P}{P} — Draw cards equal to the greatest power among creatures you control." });
const weaving = card("Season of Weaving", "Sorcery", "{4}{U}{U}", { oracleText: "Choose up to five {P} worth of modes. You may choose the same mode more than once.\n{P} — Draw a card.\n{P}{P} — Choose an artifact or creature you control. Create a token that's a copy of it.\n{P}{P}{P} — Return each nonland, nontoken permanent to its owner's hand." });
const showdown = card("Final Showdown", "Instant", "{W}", { keywords: ["Spree"], oracleText: "Spree (Choose one or more additional costs.)\n+ {1} — All creatures lose all abilities until end of turn.\n+ {1} — Choose a creature you control. It gains indestructible until end of turn.\n+ {3}{W}{W} — Destroy all creatures." });
const elderspell = card("The Elderspell", "Sorcery", "{B}{B}", { oracleText: "Destroy any number of target planeswalkers. Choose a planeswalker you control. Put two loyalty counters on it for each planeswalker destroyed this way." });
const rock = card("Mind Stone", "Artifact", "{2}", { oracleText: "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card." });
const pacifism = card("Pacifism", "Enchantment — Aura", "{1}{W}", { oracleText: "Enchant creature\nEnchanted creature can't attack or block." });
const rancor = card("Glorious Anthem", "Enchantment", "{1}{W}{W}", { oracleText: "Creatures you control get +1/+1." });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const onField = (s: GameState, id: string) => s.battlefield.includes(id);

describe("Seasons: choices made as a mode resolves", () => {
  it("compiles them", () => supported(gathering, weaving, showdown, elderspell));

  it("Season of Gathering: the counter, vigilance and trample go on the creature you pick", () => {
    let { s, ap, ids } = setup([gathering]);
    const a = putOnBattlefield(s, ap, bear({ name: "Bear A" }));
    const b = putOnBattlefield(s, ap, bear({ name: "Bear B" }));
    s = cast(s, ap, ids[0]!, undefined, [0]);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, count: 1 });
    expect(s.pending?.kind === "pickPermanents" && s.pending.options).toEqual(expect.arrayContaining([a, b]));
    s = passAll(act(s, { type: "pickPermanents", player: ap, ids: [b] }));
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
    expect(objHasKeyword(s, s.objects[b]!, "Vigilance")).toBe(true);
    expect(objHasKeyword(s, s.objects[b]!, "Trample")).toBe(true);
    expect(s.objects[a]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(objHasKeyword(s, s.objects[a]!, "Trample")).toBe(false);
  });

  it("Season of Gathering: the card type is chosen again for each time the mode was chosen", () => {
    let { s, ap, opp, ids } = setup([gathering]);
    const stone = putOnBattlefield(s, opp, rock);
    const anthem = putOnBattlefield(s, opp, rancor);
    const mine = putOnBattlefield(s, ap, bear());
    s = cast(s, ap, ids[0]!, undefined, [1, 1]);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "cardType", options: ["Artifact", "Enchantment"] });
    s = act(s, { type: "chooseOption", player: ap, choice: "Artifact" });
    expect(onField(s, stone)).toBe(false);
    expect(onField(s, anthem)).toBe(true);
    // The second {P}{P} asks again, rather than reusing "artifact".
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "cardType" });
    s = passAll(act(s, { type: "chooseOption", player: ap, choice: "Enchantment" }));
    expect(onField(s, anthem)).toBe(false);
    expect(onField(s, mine)).toBe(true);
    expect(s.stack).toHaveLength(0);
  });

  it("a bot picks the type that hurts its opponents most", () => {
    let { s, ap, opp, ids } = setup([gathering]);
    putOnBattlefield(s, opp, rock);
    putOnBattlefield(s, opp, rock);
    putOnBattlefield(s, ap, pacifism);
    s = cast(s, ap, ids[0]!, undefined, [1]);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "cardType" });
    const [answer] = botActions(s, ap);
    expect(answer).toEqual({ type: "chooseOption", player: ap, choice: "Artifact" });
  });

  it("Season of Weaving: copies the artifact or creature you choose, then bounces each nonland, nontoken permanent", () => {
    let { s, ap, opp, ids } = setup([weaving]);
    const big = putOnBattlefield(s, ap, bear({ name: "Big Bear", power: "5", toughness: "5" }));
    putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, rock);
    s = cast(s, ap, ids[0]!, undefined, [1, 2]);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "choose", count: 1 });
    // Only your own artifacts and creatures.
    expect(s.pending?.kind === "pickPermanents" && s.pending.options).not.toContain(theirs);
    s = passAll(act(s, { type: "pickPermanents", player: ap, ids: [big] }));
    expect(s.stack).toHaveLength(0);
    // The token copy stays; the original and the opponent's artifact go to their owners' hands; lands stay.
    const tokens = s.battlefield.filter((id) => s.objects[id]!.isToken);
    expect(tokens).toHaveLength(1);
    expect(s.cards[s.objects[tokens[0]!]!.cardId]!.name).toBe("Big Bear");
    expect(power(s, s.objects[tokens[0]!]!)).toBe(5);
    expect(s.objects[big]?.zone ?? "gone").not.toBe("battlefield");
    expect(s.players[opp]!.hand.some((id) => s.cards[s.objects[id]!.cardId]!.name === "Mind Stone")).toBe(true);
    expect(s.battlefield.filter((id) => !s.objects[id]!.isToken).every((id) => s.cards[s.objects[id]!.cardId]!.typeLine.includes("Land"))).toBe(true);
  });

  it("The Elderspell: two loyalty counters on the planeswalker you choose for each one destroyed", () => {
    let { s, ap, opp, ids } = setup([elderspell]);
    const walker = (name: string) => card(name, "Legendary Planeswalker — Test", "{3}", { loyalty: "3", oracleText: "+1: You gain 1 life." });
    const mine = putOnBattlefield(s, ap, walker("Mine"));
    const a = putOnBattlefield(s, opp, walker("Theirs A"));
    const b = putOnBattlefield(s, opp, walker("Theirs B"));
    s.objects[mine]!.counters.loyalty = 3;
    s.objects[a]!.counters.loyalty = 3;
    s.objects[b]!.counters.loyalty = 3;
    s = cast(s, ap, ids[0]!, [target(a), target(b)]);
    if (s.pending?.kind === "pickPermanents") s = passAll(act(s, { type: "pickPermanents", player: ap, ids: [mine] }));
    expect(onField(s, a) || onField(s, b)).toBe(false);
    expect(s.objects[mine]!.counters.loyalty).toBe(7);
  });

  it("Final Showdown: the creature you choose gains indestructible, then all creatures are destroyed", () => {
    let { s, ap, opp, ids } = setup([showdown]);
    const keep = putOnBattlefield(s, ap, bear({ name: "Keeper" }));
    const other = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, bear());
    s = cast(s, ap, ids[0]!, undefined, [1, 2]);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "choose" });
    s = passAll(act(s, { type: "pickPermanents", player: ap, ids: [keep] }));
    expect(onField(s, keep)).toBe(true);
    expect(onField(s, other) || onField(s, theirs)).toBe(false);
  });
});
