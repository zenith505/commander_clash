// Lane B round B280: Lich's Mirror ("If you would lose the game, instead shuffle your hand, your graveyard, and all
// permanents you own into your library, then draw seven cards and your life total becomes 20."; CR 104.3a, 104.4b,
// 614.1a, 616.1, 704.3, 903.9b and its rulings).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { botActions } from "../src/bot";
import { applyAction, invalidateCharacteristics, isFullySupported, runStateBasedActions, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const mirror = (): CardDef => ({"oracleId":"e81da4a7-4b03-4107-b7d9-4b635faa615d","name":"Lich's Mirror","manaCost":"{5}","cmc":5,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"If you would lose the game, instead shuffle your hand, your graveyard, and all permanents you own into your library, then draw seven cards and your life total becomes 20.","colors":[],"colorIdentity":[],"keywords":[],"layout":"normal"}) as CardDef;
const throne = (): CardDef => ({"oracleId":"a68f41a2-37ee-46e1-bf3c-164c78b003ca","name":"The Golden Throne","manaCost":"{4}","cmc":4,"typeLine":"Legendary Artifact","supertypes":["Legendary"],"types":["Artifact"],"subtypes":[],"oracleText":"Arcane Life-support — If you would lose the game, instead exile The Golden Throne and your life total becomes 1.\nA Thousand Souls Die Every Day — {T}, Sacrifice a creature: Add three mana in any combination of colors.","colors":[],"colorIdentity":[],"keywords":["Arcane Life-support","A Thousand Souls Die Every Day"],"producedMana":["B","G","R","U","W"],"layout":"normal"}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"layout":"normal"}) as CardDef;

const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));
const owned = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.owner === pid);
/** Put a card into `pid`'s hand or graveyard (from nowhere: a test card). */
const give = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};

describe("Lich's Mirror", () => {
  it("is supported", () => {
    expect(isFullySupported(mirror())).toBe(true);
  });

  it("at 0 life: hand, graveyard and every permanent you own go into your library, you draw seven and your life becomes 20", () => {
    const { s: s0, ap, opp } = setup([]);
    const s = structuredClone(s0);
    const m = putOnBattlefield(s, ap, mirror());
    const elf = putOnBattlefield(s, ap, elves());
    // An Elves you own that the next player controls, and one they own that you control.
    const lent = putOnBattlefield(s, ap, elves());
    s.objects[lent]!.controller = opp;
    const borrowed = putOnBattlefield(s, opp, elves());
    s.objects[borrowed]!.controller = ap;
    const inHand = give(s, ap, elves(), "hand");
    const inYard = give(s, ap, elves(), "graveyard");
    const token = putOnBattlefield(s, ap, elves());
    s.objects[token]!.isToken = true;
    const perms = owned(s, ap).length;
    const cards = s.players[ap]!.library.length + s.players[ap]!.hand.length + s.players[ap]!.graveyard.length;
    s.players[ap]!.life = 0;
    runStateBasedActions(s);
    expect(s.players[ap]!.lost).toBeFalsy();
    expect(s.players[ap]!.life).toBe(20);
    for (const id of [m, elf, lent, inYard]) expect(["library", "hand"]).toContain(zone(s, id));
    // The card in hand went in too (and may have been drawn again).
    expect(["library", "hand"]).toContain(zone(s, inHand));
    expect(s.objects[token]).toBeUndefined();
    expect(zone(s, borrowed)).toBe("battlefield");
    expect(owned(s, ap)).toEqual([]);
    expect(s.players[ap]!.graveyard).toEqual([]);
    expect(s.players[ap]!.hand.length).toBe(7);
    // The token ceased to exist; all the rest are in the library, less the seven drawn.
    expect(s.players[ap]!.library.length).toBe(cards + perms - 1 - 7);
    expect(logged(s, /shuffles their hand, graveyard and permanents into their library instead/)).toBe(true);
  });

  it("with ten poison counters it applies, then you lose at the next check", () => {
    const { s: s0, ap } = setup([]);
    const s = structuredClone(s0);
    putOnBattlefield(s, ap, mirror());
    s.players[ap]!.poison = 10;
    runStateBasedActions(s);
    expect(s.players[ap]!.lost).toBe(true);
    expect(logged(s, /Lich's Mirror/)).toBe(true);
  });

  it("with fewer than seven cards to draw, you lose at the next check", () => {
    const { s: s0, ap } = setup([]);
    const s = structuredClone(s0);
    putOnBattlefield(s, ap, mirror());
    // No lands of your own, a library of three.
    for (const id of owned(s, ap)) if (s.cards[s.objects[id]!.cardId]!.types.includes("Land")) {
      s.battlefield.splice(s.battlefield.indexOf(id), 1);
      delete s.objects[id];
    }
    s.players[ap]!.library = s.players[ap]!.library.slice(0, 2);
    s.players[ap]!.hand = [];
    s.players[ap]!.life = -3;
    runStateBasedActions(s);
    expect(s.players[ap]!.lost).toBe(true);
  });

  it("one you control but don't own stays, so a loss it can't fix repeats forever: the game is a draw (CR 104.4b)", () => {
    const { s: s0, ap, opp } = setup([]);
    const s = structuredClone(s0);
    const m = putOnBattlefield(s, opp, mirror());
    s.objects[m]!.controller = ap;
    invalidateCharacteristics(s);
    s.players[ap]!.poison = 10;
    runStateBasedActions(s);
    expect(s.over).toBe(true);
    expect(s.winner).toBeNull();
    expect(zone(s, m)).toBe("battlefield");
  });

  it("one you don't own that fixes the loss works each time", () => {
    const { s: s0, ap, opp } = setup([]);
    const s = structuredClone(s0);
    const m = putOnBattlefield(s, opp, mirror());
    s.objects[m]!.controller = ap;
    invalidateCharacteristics(s);
    s.players[ap]!.life = 0;
    runStateBasedActions(s);
    expect(s.over).toBeFalsy();
    expect(s.players[ap]!.life).toBe(20);
    expect(zone(s, m)).toBe("battlefield");
  });

  it("a creature you own that dies in the same check: its controller chooses the graveyard or the library", () => {
    const { s: s0, ap } = setup([]);
    const base = structuredClone(s0);
    putOnBattlefield(base, ap, mirror());
    const elf = putOnBattlefield(base, ap, elves());
    base.objects[elf]!.damage = 1;
    base.players[ap]!.life = 0;
    // Graveyard: it dies (and isn't shuffled in).
    let s = structuredClone(base);
    runStateBasedActions(s);
    expect(s.pending?.kind).toBe("pickPermanents");
    const pend = s.pending as Extract<GameState["pending"], { kind: "pickPermanents" }>;
    expect(pend.player).toBe(ap);
    expect(pend.mirrorStay).toBe(ap);
    expect(pend.options).toEqual([elf]);
    s = act(s, { type: "pickPermanents", player: ap, ids: [elf] });
    expect(s.pending).toBeNull();
    expect(zone(s, elf)).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(20);
    expect(logged(s, /Llanowar Elves dies/)).toBe(true);
    // Library: shuffled in with the rest.
    let t = structuredClone(base);
    runStateBasedActions(t);
    t = act(t, { type: "pickPermanents", player: ap, ids: [] });
    expect(["library", "hand"]).toContain(zone(t, elf));
    expect(t.players[ap]!.graveyard).toEqual([]);
  });

  it("with The Golden Throne too, you choose which replacement applies (CR 616.1)", () => {
    const { s: s0, ap } = setup([]);
    let s = structuredClone(s0);
    const m = putOnBattlefield(s, ap, mirror());
    const gt = putOnBattlefield(s, ap, throne());
    s.players[ap]!.life = 0;
    runStateBasedActions(s);
    expect(s.pending?.kind).toBe("chooseOption");
    const pend = s.pending as Extract<GameState["pending"], { kind: "chooseOption" }>;
    expect(pend.options.length).toBe(2);
    expect(pend.options).toContain(`mirror:${m}`);
    expect(pend.options).toContain(gt);
    s = act(s, { type: "chooseOption", player: ap, choice: gt });
    expect(zone(s, gt)).toBe("exile");
    expect(zone(s, m)).toBe("battlefield");
    expect(s.players[ap]!.life).toBe(1);
  });

  it("your commander on the battlefield goes to the command zone instead of your library (CR 903.9b)", () => {
    const { s: s0, ap } = setup([]);
    const s = structuredClone(s0);
    putOnBattlefield(s, ap, mirror());
    const general = putOnBattlefield(s, ap, elves(), { commander: true });
    s.players[ap]!.life = 0;
    runStateBasedActions(s);
    expect(zone(s, general)).toBe("command");
    expect(s.players[ap]!.life).toBe(20);
  });

  it("a dying creature you own that another player controls: that player chooses (a bot sends it to your graveyard)", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = structuredClone(s0);
    s.players[opp]!.isBot = true;
    putOnBattlefield(s, ap, mirror());
    const elf = putOnBattlefield(s, ap, elves());
    s.objects[elf]!.controller = opp;
    s.objects[elf]!.damage = 1;
    invalidateCharacteristics(s);
    s.players[ap]!.life = 0;
    runStateBasedActions(s);
    expect(s.pending?.kind).toBe("pickPermanents");
    expect(s.pending?.player).toBe(opp);
    for (const a of botActions(s, opp)) s = applyAction(s, a);
    expect(zone(s, elf)).toBe("graveyard");
    expect(s.players[ap]!.graveyard).toContain(elf);
    expect(s.players[ap]!.life).toBe(20);
  });

  it("a bot keeps its own dying creature for its library", () => {
    const { s: s0, ap } = setup([]);
    let s = structuredClone(s0);
    s.players[ap]!.isBot = true;
    putOnBattlefield(s, ap, mirror());
    const elf = putOnBattlefield(s, ap, elves());
    s.objects[elf]!.damage = 1;
    s.players[ap]!.life = 0;
    runStateBasedActions(s);
    expect(s.pending?.kind).toBe("pickPermanents");
    for (const a of botActions(s, ap)) s = applyAction(s, a);
    expect(["library", "hand"]).toContain(zone(s, elf));
    expect(s.players[ap]!.life).toBe(20);
  });
});
