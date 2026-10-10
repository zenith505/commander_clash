// "Look at the top N cards of your library. Put one of them into your hand and the rest ...": the
// player picks from the cards looked at; the rest go to the graveyard or the bottom of the library.

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, setup } from "./helpers";
import { isFullySupported, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.oracleText).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const castIt = (s: GameState, pid: PlayerId, id: string) => {
  const plan = planCast(s, pid, id);
  expect(plan).not.toBeNull();
  return settle(plan!.reduce((x, a) => act(x, a), s));
};
const spell = (name: string, text: string) => card(name, "Sorcery", "{1}", { oracleText: text });
/** Put these cards on top of the active player's library, first on top. */
const stack = (s: GameState, pid: PlayerId, defs: CardDef[]) => {
  const p = s.players[pid]!;
  const ids = p.library.slice(0, defs.length);
  ids.forEach((id, i) => {
    const o = s.objects[id]!;
    const cid = `dig${i}`;
    s.cards[cid] = { ...defs[i]!, id: cid } as never;
    o.cardId = cid;
  });
  return ids;
};

describe("look at the top N cards", () => {
  it("put one into your hand and the rest into your graveyard", () => {
    const dig = spell("Dig Test", "Look at the top three cards of your library. Put one of them into your hand and the rest into your graveyard.");
    supported(dig);
    const { s, ap, ids } = setup([dig]);
    const top = s.players[ap]!.library.slice(0, 3);
    let t = castIt(s, ap, ids[0]!);
    expect(t.pending).toMatchObject({ kind: "searchLibrary", min: 1, max: 1, dig: { looked: top } });
    expect(() => act(t, { type: "searchLibrary", player: ap, found: [t.players[ap]!.library[3]!] })).toThrow();
    t = settle(act(t, { type: "searchLibrary", player: ap, found: [top[1]!] }));
    expect(t.objects[top[1]!]!.zone).toBe("hand");
    expect(t.objects[top[0]!]!.zone).toBe("graveyard");
    expect(t.objects[top[2]!]!.zone).toBe("graveyard");
  });

  it("an optional filtered pick: only matching cards can be taken, the rest go to the bottom", () => {
    const dig = spell("Seek Test", "Look at the top four cards of your library. You may reveal a creature card from among them and put it into your hand. Put the rest on the bottom of your library in a random order.");
    supported(dig);
    const { s, ap, ids } = setup([dig]);
    const top = stack(s, ap, [forest, bear({ name: "Found Bear" }), forest, forest]);
    const size = s.players[ap]!.library.length;
    let t = castIt(s, ap, ids[0]!);
    expect(t.pending).toMatchObject({ kind: "searchLibrary", min: 0, max: 1, cards: [top[1]] });
    t = settle(act(t, { type: "searchLibrary", player: ap, found: [top[1]!] }));
    expect(t.objects[top[1]!]!.zone).toBe("hand");
    const lib = t.players[ap]!.library;
    expect(lib).toHaveLength(size - 1);
    expect(new Set(lib.slice(-3))).toEqual(new Set([top[0], top[2], top[3]]));
  });

  it("taking none puts them all on the bottom", () => {
    const dig = spell("Seek Test", "Look at the top two cards of your library. You may reveal a land card from among them and put it into your hand. Put the rest on the bottom of your library in any order.");
    const { s, ap, ids } = setup([dig]);
    const top = stack(s, ap, [forest, forest]);
    let t = castIt(s, ap, ids[0]!);
    t = settle(act(t, { type: "searchLibrary", player: ap, found: [] }));
    expect(new Set(t.players[ap]!.library.slice(-2))).toEqual(new Set(top));
  });

  it("no matching card: nothing to pick, everything goes to the bottom without a prompt", () => {
    const dig = spell("Seek Test", "Look at the top two cards of your library. You may reveal a creature card from among them and put it into your hand. Put the rest on the bottom of your library in any order.");
    const { s, ap, ids } = setup([dig]);
    const top = stack(s, ap, [forest, forest]);
    const t = castIt(s, ap, ids[0]!);
    expect(t.pending).toBeNull();
    expect(new Set(t.players[ap]!.library.slice(-2))).toEqual(new Set(top));
  });

  it("put one back on top and the rest into your graveyard", () => {
    const dig = spell("Top Test", "Look at the top three cards of your library. You may put one of those cards back on top of your library. Put the rest into your graveyard.");
    supported(dig);
    const { s, ap, ids } = setup([dig]);
    const top = s.players[ap]!.library.slice(0, 3);
    let t = castIt(s, ap, ids[0]!);
    t = settle(act(t, { type: "searchLibrary", player: ap, found: [top[2]!] }));
    expect(t.players[ap]!.library[0]).toBe(top[2]);
    expect(t.objects[top[0]!]!.zone).toBe("graveyard");
    expect(t.objects[top[1]!]!.zone).toBe("graveyard");
  });

  it("put two of seven into your hand", () => {
    const dig = spell("Many Test", "Look at the top seven cards of your library. Put two of them into your hand and the rest into your graveyard.");
    supported(dig);
    const { s, ap, ids } = setup([dig]);
    const top = s.players[ap]!.library.slice(0, 7);
    let t = castIt(s, ap, ids[0]!);
    expect(t.pending).toMatchObject({ min: 2, max: 2 });
    t = settle(act(t, { type: "searchLibrary", player: ap, found: [top[0]!, top[6]!] }));
    expect(top.filter((id) => t.objects[id]!.zone === "hand")).toEqual([top[0], top[6]]);
    expect(top.filter((id) => t.objects[id]!.zone === "graveyard")).toHaveLength(5);
  });
});
