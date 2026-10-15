// "Becomes the target" triggers (first time each turn, valiant, "that player"), targets from a single graveyard, targets
// that share a creature type (CR 115.3), and "each opponent sacrifices ... unless they pay" (CR 101.4).

import { describe, expect, it } from "vitest";
import { act, card, cast, pt, putOnBattlefield, setup, target } from "./helpers";
import { botActions, castProblem, isFullySupported, moveObject, waitingOn, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const glyphKeeper = card("Glyph Keeper", "Creature — Sphinx", "{3}{U}{U}", {
  power: "5",
  toughness: "3",
  keywords: ["Flying", "Embalm"],
  oracleText:
    "Flying\nWhenever this creature becomes the target of a spell or ability for the first time each turn, counter that spell or ability.\nEmbalm {5}{U}{U} ({5}{U}{U}, Exile this card from your graveyard: Create a token that's a copy of it, except it's a white Zombie Sphinx with no mana cost. Embalm only as a sorcery.)",
});
const kira = card("Kira, Great Glass-Spinner", "Legendary Creature — Spirit", "{1}{U}{U}", {
  power: "2",
  toughness: "2",
  keywords: ["Flying"],
  oracleText: 'Flying\nCreatures you control have "Whenever this creature becomes the target of a spell or ability for the first time each turn, counter that spell or ability."',
});
const nettleGuard = card("Nettle Guard", "Creature — Mouse Soldier", "{1}{W}", {
  power: "3",
  toughness: "1",
  keywords: ["Valiant"],
  oracleText: "Valiant — Whenever this creature becomes the target of a spell or ability you control for the first time each turn, it gets +0/+2 until end of turn.\n{1}, Sacrifice this creature: Destroy target artifact or enchantment.",
});
const liege = card("Ashenmoor Liege", "Creature — Elemental Knight", "{1}{B/R}{B/R}{B/R}", {
  power: "4",
  toughness: "1",
  oracleText: "Other black creatures you control get +1/+1.\nOther red creatures you control get +1/+1.\nWhenever this creature becomes the target of a spell or ability an opponent controls, that player loses 4 life.",
});
const draugr = card("Raise the Draugr", "Instant", "{1}{B}", {
  oracleText: "Choose one —\n• Return target creature card from your graveyard to your hand.\n• Return two target creature cards that share a creature type from your graveyard to your hand.",
});
const decompose = card("Decompose", "Sorcery", "{1}{B}", { oracleText: "Exile up to three target cards from a single graveyard." });
const footpad = card("Rishadan Footpad", "Creature — Human Pirate", "{3}{U}", {
  power: "2",
  toughness: "2",
  oracleText: "When this creature enters, each opponent sacrifices a permanent of their choice unless they pay {2}.",
});
const shock = () => card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const pump = () => card("Pump", "Instant", "{G}", { oracleText: "Target creature gets +1/+0 until end of turn." });
const elf = card("Llanowar Elves", "Creature — Elf Druid", "{G}", { power: "1", toughness: "1", oracleText: "{T}: Add {G}." });
const bearCard = (name = "Bear") => card(name, "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });

const settle = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Put a card into `pid`'s graveyard. */
function inYard(s: GameState, pid: PlayerId, def: ReturnType<typeof card>) {
  const id = putOnBattlefield(s, pid, def);
  moveObject(s, id, "graveyard");
  return id;
}

describe("becomes the target for the first time each turn", () => {
  it("compiles", () => {
    for (const c of [glyphKeeper, kira, nettleGuard, liege, draugr, decompose, footpad]) expect(isFullySupported(c), c.name).toBe(true);
  });

  it("Glyph Keeper counters the first spell that targets it each turn, not the second", () => {
    const { s: s0, ap, opp, ids } = setup([shock(), shock()]);
    const g = putOnBattlefield(s0, opp, glyphKeeper);
    let s = settle(cast(s0, ap, ids[0]!, [target(g)]));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.objects[g]!.damage).toBe(0);
    expect(s.log.some((l) => /Glyph Keeper counters Shock/.test(l.text))).toBe(true);
    s = settle(cast(s, ap, ids[1]!, [target(g)]));
    expect(s.objects[g]!.damage).toBe(2);
  });

  it("Kira gives each creature its own first time", () => {
    const { s: s0, ap, opp, ids } = setup([shock(), shock()]);
    putOnBattlefield(s0, opp, kira);
    const a = putOnBattlefield(s0, opp, bearCard());
    const b = putOnBattlefield(s0, opp, bearCard());
    let s = settle(cast(s0, ap, ids[0]!, [target(a)]));
    s = settle(cast(s, ap, ids[1]!, [target(b)]));
    expect(s.objects[a]!.zone).toBe("battlefield");
    expect(s.objects[b]!.zone).toBe("battlefield");
  });

  it("valiant counts only your own spells and abilities", () => {
    const { s: s0, ap, opp, ids } = setup([pump(), pump(), pump()]);
    const mine = putOnBattlefield(s0, ap, nettleGuard);
    const theirs = putOnBattlefield(s0, opp, nettleGuard);
    // Your spell on the opponent's Nettle Guard: not one its controller controls.
    let s = settle(cast(s0, ap, ids[0]!, [target(theirs)]));
    expect(pt(s, theirs)).toBe("4/1");
    s = settle(cast(s, ap, ids[1]!, [target(mine)]));
    expect(pt(s, mine)).toBe("4/3");
    s = settle(cast(s, ap, ids[2]!, [target(mine)]));
    expect(pt(s, mine)).toBe("5/3");
  });

  it("Ashenmoor Liege: the opponent whose spell targets it loses 4 life", () => {
    const { s: s0, ap, opp, ids } = setup([pump()]);
    const l = putOnBattlefield(s0, opp, liege);
    const s = settle(cast(s0, ap, ids[0]!, [target(l)]));
    expect(s.players[ap]!.life).toBe(36);
    expect(s.players[opp]!.life).toBe(40);
  });
});

describe("targets that relate to each other", () => {
  it("Raise the Draugr's second mode needs two creature cards that share a creature type", () => {
    const { s: s0, ap, ids } = setup([draugr]);
    const e = inYard(s0, ap, elf);
    const b1 = inYard(s0, ap, bearCard());
    const b2 = inYard(s0, ap, bearCard("Other Bear"));
    expect(castProblem(s0, ap, ids[0]!, [target(e), target(b1)], [1])).toMatch(/illegal target/);
    const s = settle(cast(s0, ap, ids[0]!, [target(b1), target(b2)], [1]));
    expect(s.objects[b1]!.zone).toBe("hand");
    expect(s.objects[b2]!.zone).toBe("hand");
    expect(s.objects[e]!.zone).toBe("graveyard");
  });

  it("Decompose takes cards from one graveyard only", () => {
    const { s: s0, ap, opp, ids } = setup([decompose]);
    const a = inYard(s0, opp, bearCard());
    const b = inYard(s0, opp, elf);
    const c = inYard(s0, ap, bearCard());
    expect(castProblem(s0, ap, ids[0]!, [target(a), target(c), { kind: "none" }])).toMatch(/illegal target/);
    const s = settle(cast(s0, ap, ids[0]!, [target(a), target(b), { kind: "none" }]));
    expect(s.objects[a]!.zone).toBe("exile");
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.objects[c]!.zone).toBe("graveyard");
  });
});

describe("each opponent sacrifices a permanent unless they pay", () => {
  it("each opponent with a permanent chooses whether to pay; those who don't, sacrifice", () => {
    const { s: s0, ap, ids } = setup([footpad]);
    const [o1, o2, o3] = s0.turnOrder.filter((p) => p !== ap).sort((x, y) => ((s0.turnOrder.indexOf(x) - s0.turnOrder.indexOf(ap) + 4) % 4) - ((s0.turnOrder.indexOf(y) - s0.turnOrder.indexOf(ap) + 4) % 4));
    const bear1 = putOnBattlefield(s0, o1!, bearCard());
    const bear2 = putOnBattlefield(s0, o2!, bearCard());
    // o2 can pay with two Forests; o3 has nothing to sacrifice and isn't asked.
    putOnBattlefield(s0, o2!, card("Forest", "Basic Land — Forest"));
    putOnBattlefield(s0, o2!, card("Forest", "Basic Land — Forest"));
    let s = cast(s0, ap, ids[0]!);
    s = settle(s);
    // Turn order from the active player (CR 101.4).
    expect(s.pending).toMatchObject({ kind: "payUnless", player: o1, cost: "{2}", otherwise: "you sacrifice a permanent" });
    s = act(s, { type: "payUnless", player: o1!, pay: false });
    expect(s.pending).toMatchObject({ kind: "payUnless", player: o2 });
    for (const a of botActions(s, o2!)) s = act(s, a);
    s = settle(s);
    expect(s.pending).toBeNull();
    expect(s.objects[bear1]!.zone).toBe("graveyard");
    expect(s.objects[bear2]!.zone).toBe("battlefield");
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === o2 && s.objects[id]!.tapped)).toHaveLength(2);
    expect(o3).toBeDefined();
  });
});
