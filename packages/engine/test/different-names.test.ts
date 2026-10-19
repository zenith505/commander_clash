// "Search your library for up to three Aura cards with different names" (CR 701.23): no two of the cards found may
// have the same name. Cards of one name in a library are alike, so one of each name is offered.

import { describe, expect, it } from "vitest";
import { act, card, cast, passAll, putOnBattlefield, scry, setup } from "./helpers";
import { isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
function settle(s: GameState) {
  for (let i = 0; i < 60 && (s.stack.length || s.resolving || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return settle(passAll(s));
};

// Real oracle text (Scryfall).
const threeDreams = card("Three Dreams", "Sorcery", "{4}{W}", { oracleText: "Search your library for up to three Aura cards with different names, reveal them, put them into your hand, then shuffle." });
const begin = card("Begin the Invasion", "Sorcery", "{X}{W}{U}{B}{R}{G}", { oracleText: "Search your library for up to X battle cards with different names, put them onto the battlefield, then shuffle." });
const aura = (name: string) => card(name, "Enchantment — Aura", "{W}", { oracleText: "Enchant creature\nEnchanted creature gets +1/+1." });
const siege = (name: string) =>
  scry("transform", [
    { name, mana_cost: "{2}{W}", type_line: "Battle — Siege", defense: "4", oracle_text: "(As a Siege enters, choose an opponent to protect it. You and others can attack it. When it's defeated, exile it, then cast it transformed.)" },
    { name: `${name} Back`, type_line: "Enchantment", color_indicator: ["W"], oracle_text: "" },
  ]);

describe("searching for cards with different names", () => {
  it("compile", () => supported(threeDreams, begin));

  it("Three Dreams: one of each name is offered, and the search says so", () => {
    const { s: s0, ap, ids } = setup([threeDreams]);
    const a1 = onTop(s0, ap, aura("Holy Strength"));
    const a2 = onTop(s0, ap, aura("Holy Strength"));
    const b = onTop(s0, ap, aura("Pacifism"));
    let s = settle(cast(s0, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", what: "up to 3 Aura cards with different names", max: 2 });
    if (s.pending?.kind !== "searchLibrary") throw new Error();
    expect(s.pending.cards).toContain(b);
    expect(s.pending.cards.filter((id) => id === a1 || id === a2)).toHaveLength(1);
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [a1, a2] })).toThrow();
    s = settle(act(s, { type: "searchLibrary", player: ap, found: s.pending.cards }));
    expect(s.objects[b]!.zone).toBe("hand");
    expect([a1, a2].filter((id) => s.objects[id]!.zone === "hand")).toHaveLength(1);
  });

  it("Begin the Invasion: up to X battles of different names onto the battlefield, each with a protector chosen", () => {
    const { s: s0, ap, ids } = setup([begin]);
    const x = onTop(s0, ap, siege("Invasion of Testia"));
    const y = onTop(s0, ap, siege("Invasion of Probia"));
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 2));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", max: 2 });
    s = act(s, { type: "searchLibrary", player: ap, found: [x, y] });
    for (let i = 0; i < 4 && s.pending?.kind === "chooseOption"; i++) {
      expect(s.pending).toMatchObject({ what: "protector", player: ap });
      s = act(s, { type: "chooseOption", player: ap, choice: s.pending.options[0]! });
    }
    s = settle(s);
    expect([s.objects[x]!.zone, s.objects[y]!.zone]).toEqual(["battlefield", "battlefield"]);
    expect(s.objects[x]!.counters.defense).toBe(4);
  });
});
