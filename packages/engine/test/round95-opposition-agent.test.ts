// Round 95: Opposition Agent. "You control your opponents while they're searching their libraries." (CR 723.2) "While an
// opponent is searching their library, they exile each card they find. You may play those cards for as long as they
// remain exiled, and you may spend mana as though it were mana of any color to cast them." (rulings)

import { describe, expect, it } from "vitest";
import { act, bear, card, mountain, passAll, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, controllerOf, isFullySupported, planCast, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const agent = card("Opposition Agent", "Creature — Human Rogue", "{2}{B}", {
  power: "3",
  toughness: "2",
  keywords: ["Flash"],
  oracleText:
    "Flash\nYou control your opponents while they're searching their libraries.\nWhile an opponent is searching their library, they exile each card they find. You may play those cards for as long as they remain exiled, and you may spend mana as though it were mana of any color to cast them.",
});
const ramp = card("Rampant Growth", "Sorcery", "{1}{G}", { oracleText: "Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle." });
const tutor = card("Demonic Tutor", "Sorcery", "{1}{B}", { oracleText: "Search your library for a card, put that card into your hand, then shuffle." });
const gifts = card("Gifts Ungiven", "Instant", "{3}{U}", {
  oracleText: "Search your library for up to four cards with different names and reveal them. Target opponent chooses two of those cards. Put the chosen cards into your graveyard and the rest into your hand. Then shuffle.",
});

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return passAll(s);
};
function toLibrary(s: GameState, pid: PlayerId, def: CardDef) {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
}

describe("Opposition Agent", () => {
  it("parse", () => {
    expect(isFullySupported(agent)).toBe(true);
    expect(isFullySupported(gifts)).toBe(true);
  });

  it("its controller makes the search's choice, and the land found is exiled for them to play (CR 723.5)", () => {
    const { s: s0, ap, ids, opp } = setup([ramp]);
    putOnBattlefield(s0, opp, agent);
    const forest = s0.players[ap]!.library.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Forest")!;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: opp, controlling: ap, foundExiled: true, min: 0, max: 1 });
    // Only cards the search asks for (rulings): no Grizzly Bears.
    expect(s.pending?.kind === "searchLibrary" && s.pending.cards.every((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest")).toBe(true);
    // The searching player can't answer for themselves.
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [forest] })).toThrow();
    s = passAll(act(s, { type: "searchLibrary", player: opp, found: [forest] }));
    expect(s.objects[forest]!.zone).toBe("exile");
    expect(s.objects[forest]!.mayPlay).toMatchObject({ player: opp, until: "exiled" });
    expect(s.log.some((l) => /finds a card \(Forest\) and exiles it for/.test(l.text))).toBe(true);
    // On its controller's turn they may play it as their land (normal timing rules).
    s = passUntil(s, "main1", opp);
    s = act(s, { type: "playLand", player: opp, objectId: forest });
    expect(s.objects[forest]!.zone).toBe("battlefield");
    expect(controllerOf(s, s.objects[forest]!)).toBe(opp);
  });

  it("a found spell is cast with mana as though it were any color", () => {
    const { s: s0, ap, ids, opp } = setup([tutor]);
    putOnBattlefield(s0, opp, agent);
    const b = toLibrary(s0, ap, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: opp, controlling: ap, min: 1, max: 1 });
    s = passAll(act(s, { type: "searchLibrary", player: opp, found: [b] }));
    expect(s.objects[b]!.zone).toBe("exile");
    s = passUntil(s, "main1", opp);
    // Only red mana: Grizzly Bears' {G} can be paid with it.
    for (let i = 0; i < 2; i++) putOnBattlefield(s, opp, mountain);
    s = run(s, planCast(s, opp, b));
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(controllerOf(s, s.objects[b]!)).toBe(opp);
  });

  it("not its controller's own searches, and nothing seen by the rest of the effect (Gifts Ungiven)", () => {
    const { s: s0, ap, ids, opp } = setup([tutor]);
    putOnBattlefield(s0, ap, agent);
    const s = run(s0, planCast(s0, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    expect(s.pending?.kind === "searchLibrary" && s.pending.controlling).toBeUndefined();

    const g = setup([gifts]);
    putOnBattlefield(g.s, g.opp, agent);
    let t = run(g.s, planCast(g.s, g.ap, g.ids[0]!, [{ kind: "player", id: g.opp }]));
    expect(t.pending).toMatchObject({ kind: "searchLibrary", player: g.opp, controlling: g.ap });
    const pick = t.players[g.ap]!.library.slice(0, 1);
    t = passAll(act(t, { type: "searchLibrary", player: g.opp, found: pick }));
    // No opponent's choice of those cards: they're exiled already.
    expect(t.pending).toBeNull();
    expect(t.objects[pick[0]!]!.zone).toBe("exile");
    void opp;
  });

  it("with two Agents, the one that entered last controls the search; a bot takes the card it wants", () => {
    const { s: s0, ap, ids, opp } = setup([tutor]);
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    putOnBattlefield(s0, opp, agent);
    putOnBattlefield(s0, third, agent);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: third, controlling: ap });
    const [a] = botActions(s, third);
    s = passAll(act(s, a!));
    const found = Object.values(s.objects).find((o) => o.zone === "exile" && o.mayPlay?.player === third);
    expect(found).toBeDefined();
  });
});
