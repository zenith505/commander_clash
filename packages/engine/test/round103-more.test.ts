// Round 103, more popular cards: Planar Genesis (a land onto the battlefield, or else a card into your hand), Urza's
// Ruinous Blast ("that aren't legendary"), Kher Keep (a token named after the card), Golgari Charm ("regenerate each
// creature you control"), Traverse the Outlands ("up to X ..., where X is ..."), Stitch Together (threshold's "instead"),
// Eldrazi Conscription (annihilator granted by an Aura).

import { describe, expect, it } from "vitest";
import { act, card, cast, forest, passUntil, putOnBattlefield, setup } from "./helpers";
import { characteristics, compileCard, isFullySupported, planActivate, planCast, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const genesis = card("Planar Genesis", "Instant", "{G}{U}", { oracleText: "Look at the top four cards of your library. You may put a land card from among them onto the battlefield tapped. If you don't, put a card from among them into your hand. Put the rest on the bottom of your library in a random order." });
const blast = card("Urza's Ruinous Blast", "Legendary Sorcery", "{4}{W}", { oracleText: "(You may cast a legendary sorcery only if you control a legendary creature or planeswalker.)\nExile all nonland permanents that aren't legendary." });
const keep = card("Kher Keep", "Legendary Land", "", { oracleText: "{T}: Add {C}.\n{1}{R}, {T}: Create a 0/1 red Kobold creature token named Kobolds of Kher Keep." });
const charm = card("Golgari Charm", "Instant", "{B}{G}", { keywords: ["Regenerate"], oracleText: "Choose one —\n• All creatures get -1/-1 until end of turn.\n• Destroy target enchantment.\n• Regenerate each creature you control." });
const traverse = card("Traverse the Outlands", "Sorcery", "{4}{G}", { oracleText: "Search your library for up to X basic land cards, where X is the greatest power among creatures you control. Put those cards onto the battlefield tapped, then shuffle." });
const stitch = card("Stitch Together", "Sorcery", "{B}{B}", { keywords: ["Threshold"], oracleText: "Return target creature card from your graveyard to your hand.\nThreshold — Return that card from your graveyard to the battlefield instead if there are seven or more cards in your graveyard." });
const conscription = card("Eldrazi Conscription", "Kindred Enchantment — Eldrazi Aura", "{8}", { keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature gets +10/+10 and has trample and annihilator 2. (Whenever it attacks, defending player sacrifices two permanents of their choice.)" });

const beast = (name: string, p: number, extra: Partial<Parameters<typeof card>[3]> = {}) => card(name, "Creature — Beast", "{1}", { power: String(p), toughness: "2", ...extra });
const plague = card("Pestilence Test", "Sorcery", "{B}", { oracleText: "Destroy all creatures." });

const run = (s: GameState, plan: ReturnType<typeof planCast> | ReturnType<typeof planActivate>) => plan!.reduce((x, a) => act(x, a), s);
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const toYard = (s: GameState, pid: number, def: ReturnType<typeof card>) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
};
const stackLibrary = (s: GameState, pid: number, defs: ReturnType<typeof card>[]) => {
  const ids = defs.map((d) => {
    const id = putOnBattlefield(s, pid, d);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "library";
    return id;
  });
  s.players[pid]!.library.unshift(...ids);
  return ids;
};

describe("round 103: more popular cards", () => {
  it("parse", () => [genesis, blast, keep, charm, traverse, stitch, conscription].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Planar Genesis: a land onto the battlefield tapped, the other three to the bottom", () => {
    const { s: s0, ap, ids } = setup([genesis]);
    const top = stackLibrary(s0, ap, [beast("A", 1), forest, beast("B", 2), beast("C", 3)]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 1, min: 0 });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [top[1]!] }));
    expect(s.objects[top[1]!]!.zone).toBe("battlefield");
    expect(s.objects[top[1]!]!.tapped).toBe(true);
    const lib = s.players[ap]!.library;
    for (const id of [top[0]!, top[2]!, top[3]!]) expect(lib.indexOf(id)).toBeGreaterThanOrEqual(lib.length - 3);
    expect(s.players[ap]!.hand).not.toContain(top[0]!);
  });

  it("Planar Genesis: no land taken, a card into your hand instead, the rest to the bottom", () => {
    const { s: s0, ap, ids } = setup([genesis]);
    const top = stackLibrary(s0, ap, [beast("A", 1), forest, beast("B", 2), beast("C", 3)]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 1, min: 1 });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [top[2]!] }));
    expect(s.players[ap]!.hand).toContain(top[2]!);
    expect(s.objects[top[1]!]!.zone).toBe("library");
    const lib = s.players[ap]!.library;
    for (const id of [top[0]!, top[1]!, top[3]!]) expect(lib.indexOf(id)).toBeGreaterThanOrEqual(lib.length - 3);
  });

  it("Urza's Ruinous Blast exiles the nonland permanents that aren't legendary", () => {
    const { s: s0, ap, opp, ids } = setup([blast]);
    const legend = putOnBattlefield(s0, ap, card("Legend", "Legendary Creature — Human", "{1}", { power: "1", toughness: "1" }));
    const plain = putOnBattlefield(s0, opp, beast("Plain", 2));
    const rock = putOnBattlefield(s0, opp, card("Rock", "Artifact", "{1}"));
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[legend]!.zone).toBe("battlefield");
    expect(s.objects[plain]!.zone).toBe("exile");
    expect(s.objects[rock]!.zone).toBe("exile");
    expect(s.battlefield.some((id) => characteristics(s, s.objects[id]!).types.includes("Land"))).toBe(true);
  });

  it("Kher Keep makes a token named Kobolds of Kher Keep", () => {
    expect(JSON.stringify(compileCard(keep).activated)).toContain(`"name":"Kobolds of Kher Keep"`);
    const { s: s0, ap } = setup([]);
    const k = putOnBattlefield(s0, ap, keep);
    const s = settle(run(s0, planActivate(s0, ap, k, 0)));
    const t = s.battlefield.find((id) => s.objects[id]!.isToken);
    expect(t && characteristics(s, s.objects[t]!).name).toBe("Kobolds of Kher Keep");
  });

  it("Golgari Charm: each creature you control is regenerated, an opponent's isn't", () => {
    const { s: s0, ap, opp, ids } = setup([charm, plague]);
    const mine = putOnBattlefield(s0, ap, beast("Mine", 2));
    const theirs = putOnBattlefield(s0, opp, beast("Theirs", 2));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [], [2])));
    s = settle(cast(s, ap, ids[1]!));
    expect(s.objects[mine]!.zone).toBe("battlefield");
    expect(s.objects[mine]!.tapped).toBe(true);
    expect(s.objects[theirs]!.zone).toBe("graveyard");
  });

  it("Traverse the Outlands: up to the greatest power among your creatures in basic lands", () => {
    const { s: s0, ap, ids } = setup([traverse]);
    putOnBattlefield(s0, ap, beast("Three", 3));
    putOnBattlefield(s0, ap, beast("One", 1));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 3 });
    const pend = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    const lands = s.battlefield.length;
    s = settle(act(s, { type: "searchLibrary", player: ap, found: pend.cards.slice(0, 3) }));
    expect(s.battlefield.length).toBe(lands + 3);
  });

  it("Stitch Together: to your hand, or to the battlefield with seven or more cards in your graveyard", () => {
    for (const [extra, where] of [[0, "hand"], [6, "battlefield"]] as const) {
      const { s: s0, ap, ids } = setup([stitch]);
      const target = toYard(s0, ap, beast("Dead", 2));
      for (let i = 0; i < extra; i++) toYard(s0, ap, forest);
      const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: target }])));
      expect(s.objects[target]!.zone, `${extra + 1} cards`).toBe(where);
    }
  });

  it("Eldrazi Conscription: +10/+10, trample, and annihilator 2 on attack", () => {
    const { s: s0, ap, opp, ids } = setup([conscription]);
    const b = putOnBattlefield(s0, ap, beast("Bear", 2));
    for (const n of ["Victim", "Victim Two", "Victim Three"]) putOnBattlefield(s0, opp, beast(n, 1));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: b }], undefined, "auto")));
    const ch = characteristics(s, s.objects[b]!);
    expect(ch.power).toBe(12);
    expect(ch.keywords).toContain("Trample");
    const before = s.battlefield.filter((id) => s.objects[id]!.controller === opp).length;
    s = passUntil(s, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] }));
    if (s.pending?.kind === "pickPermanents") {
      const p = s.pending;
      s = settle(act(s, { type: "pickPermanents", player: p.player, ids: p.options.slice(0, p.count) }));
    }
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === opp).length).toBe(before - 2);
  });
});

