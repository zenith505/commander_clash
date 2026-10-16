// Snow spells that count the snow mana spent to cast them (CR 107.4h, 601.2h): Blood on the Snow's last paragraph is
// done whichever mode was chosen, and returns a card it may just have destroyed, with mana value up to the snow mana
// spent (0 with none, rulings); Search for Glory finds a snow permanent card, a legendary card, or a Saga card, and
// gains 1 life for each snow mana spent.

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, type CardDef, type GameState, type ManaType, type PlayerId } from "../src";
import { addMana } from "../src/spend";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const toGraveyard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
};

// Real oracle text (Scryfall).
const blood = card("Blood on the Snow", "Snow Sorcery", "{4}{B}{B}", { oracleText: "Choose one —\n• Destroy all creatures.\n• Destroy all planeswalkers.\nThen return a creature or planeswalker card with mana value X or less from your graveyard to the battlefield, where X is the amount of {S} spent to cast this spell. ({S} is mana from a snow source.)" });
const glory = card("Search for Glory", "Snow Sorcery", "{2}{W}", { oracleText: "Search your library for a snow permanent card, a legendary card, or a Saga card, reveal it, put it into your hand, then shuffle. You gain 1 life for each {S} spent to cast this spell. ({S} is mana from a snow source.)" });
const giant = card("Hill Giant Test", "Creature — Giant", "{2}{R}", { power: "3", toughness: "3" });
const big = card("Big Test", "Creature — Wurm", "{4}{G}", { power: "5", toughness: "5" });

/** Cast it from a pool of this mana, the first `snow` of it from snow sources. */
function castFrom(s: GameState, pid: PlayerId, id: string, mana: ManaType[], snow: number, modes?: number[]): GameState {
  if (snow) addMana(s, pid, mana.slice(0, snow), { from: ["snow"] });
  addMana(s, pid, mana.slice(snow), {});
  return passAll(act(s, { type: "castSpell", player: pid, objectId: id, ...(modes ? { modes } : {}) }));
}

describe("snow spells that count snow mana", () => {
  it("parses", () => supported(blood, glory));

  it("Blood on the Snow: destroy all creatures, then return one with mana value up to the snow mana spent", () => {
    let { s, ap, ids } = setup([blood]);
    const g = putOnBattlefield(s, ap, giant);
    const b = toGraveyard(s, ap, big);
    const small = toGraveyard(s, ap, bear());
    s = castFrom(s, ap, ids[0]!, ["B", "B", "C", "C", "C", "C"], 3, [0]);
    expect(zone(s, g)).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", fromGraveyard: "battlefield", min: 1, what: "a creature or planeswalker card with mana value 3 or less" });
    const offered = (s.pending as { cards: string[] }).cards;
    // The Giant it just destroyed is one of them; the 5-mana Wurm isn't.
    expect(offered.sort()).toEqual([g, small].sort());
    expect(offered).not.toContain(b);
    s = passAll(act(s, { type: "searchLibrary", player: ap, found: [g] }));
    expect(zone(s, g)).toBe("battlefield");
  });

  it("Blood on the Snow without snow mana: only mana value 0, so nothing here", () => {
    let { s, ap, ids } = setup([blood]);
    const p = putOnBattlefield(s, ap, giant);
    toGraveyard(s, ap, bear());
    s = castFrom(s, ap, ids[0]!, ["B", "B", "C", "C", "C", "C"], 0, [1]);
    expect(s.pending).toBeFalsy();
    expect(zone(s, p)).toBe("battlefield");
  });

  it("Search for Glory: any of the three kinds, and 1 life for each snow mana spent", () => {
    let { s, ap, ids } = setup([glory]);
    const lib = s.players[ap]!.library;
    const saga = putOnBattlefield(s, ap, card("The Test Saga", "Enchantment — Saga", "{2}{W}", { oracleText: "(As this Saga enters and after your draw step, add a lore counter.)\nI — You gain 1 life." }));
    const legend = putOnBattlefield(s, ap, card("Legend Test", "Legendary Creature — Human", "{2}", { power: "2", toughness: "2" }));
    for (const id of [saga, legend]) {
      s.battlefield.splice(s.battlefield.indexOf(id), 1);
      s.objects[id]!.zone = "library";
      lib.push(id);
    }
    const life = s.players[ap]!.life;
    s = castFrom(s, ap, ids[0]!, ["W", "C", "C"], 2);
    expect(s.players[ap]!.life).toBe(life);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", what: "a snow permanent card, a legendary card, or a Saga card" });
    expect((s.pending as { cards: string[] }).cards.sort()).toEqual([saga, legend].sort());
    s = passAll(act(s, { type: "searchLibrary", player: ap, found: [saga] }));
    expect(zone(s, saga)).toBe("hand");
    expect(s.players[ap]!.life).toBe(life + 2);
  });
});

function zone(s: GameState, id: string) {
  return s.objects[id]!.zone;
}
