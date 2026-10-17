// "Partner with [name]" is also "When this permanent enters, target player may search their library for a card named
// [name], reveal it, put it into their hand, then shuffle" (CR 702.124j). "Each other creature you control enters with
// an additional +1/+1 counter on it" (Renata) is a replacement effect of permanents already on the battlefield, not of
// ones entering with it (CR 614.1c; rulings on Renata, Grumgully, Dragonstorm Globe); the counters a permanent enters
// with are put on at once, so Hardened Scales adds one (CR 616.1: its controller orders the effects for the most).
// Apocalypse Hydra: "If X is 5 or more, it enters with an additional X". Vision Quest: the card found enters with X more
// counters, and "it gains haste" is that card.

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passAll, putOnBattlefield, setup } from "./helpers";
import { botActions, isFullySupported, objHasKeyword, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";
import { enterTogether, moveObject } from "../src/game";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const toZone = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "library" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "hand") s.players[pid]!.hand.push(id);
  else if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]!.graveyard.push(id);
  return id;
};
/** Passes priority until something needs an answer or the stack is empty. */
const untilChoice = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return untilChoice(s);
};
const plus = (s: GameState, id: string) => s.objects[id]!.counters["+1/+1"] ?? 0;

// Real oracle text (Scryfall).
const khorvath = card("Khorvath Brightflame", "Legendary Creature — Dragon", "{4}{R}", { power: "3", toughness: "3", keywords: ["Partner with", "Flying", "Haste"], oracleText: "Partner with Sylvia Brightspear (When this creature enters, target player may put Sylvia into their hand from their library, then shuffle.)\nFlying, haste\nKnights your team controls have flying and haste." });
const sylvia = card("Sylvia Brightspear", "Legendary Creature — Human Knight", "{2}{W}", { power: "2", toughness: "2", keywords: ["Partner with", "Double strike"], oracleText: "Partner with Khorvath Brightflame (When this creature enters, target player may put Khorvath into their hand from their library, then shuffle.)\nDouble strike\nDragons your team controls have double strike." });
const renata = card("Renata, Called to the Hunt", "Legendary Enchantment Creature — Demigod", "{2}{G}{G}", { power: "*", toughness: "4", oracleText: "Renata's power is equal to your devotion to green. (Each {G} in the mana costs of permanents you control counts toward your devotion to green.)\nEach other creature you control enters with an additional +1/+1 counter on it." });
const grumgully = card("Grumgully, the Generous", "Legendary Creature — Goblin Shaman", "{1}{R}{G}", { power: "3", toughness: "3", oracleText: "Each other non-Human creature you control enters with an additional +1/+1 counter on it." });
const oath = card("Oath of Gideon", "Legendary Enchantment", "{2}{W}", { oracleText: "When Oath of Gideon enters, create two 1/1 white Kor Ally creature tokens.\nEach planeswalker you control enters with an additional loyalty counter on it." });
const globe = card("Dragonstorm Globe", "Artifact", "{3}", { oracleText: "Each Dragon you control enters with an additional +1/+1 counter on it.\n{T}: Add one mana of any color." });
const arlinn = card("Arlinn, Voice of the Pack", "Legendary Planeswalker — Arlinn", "{4}{G}{G}", { loyalty: "7", oracleText: "Each creature you control that's a Wolf or a Werewolf enters with an additional +1/+1 counter on it.\n−2: Create a 2/2 green Wolf creature token." });
const scales = card("Hardened Scales", "Enchantment", "{G}", { oracleText: "If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead." });
const hydra = card("Apocalypse Hydra", "Creature — Hydra", "{X}{R}{G}", { power: "0", toughness: "0", oracleText: "This creature enters with X +1/+1 counters on it. If X is 5 or more, it enters with an additional X +1/+1 counters on it.\n{1}{R}, Remove a +1/+1 counter from this creature: It deals 1 damage to any target." });
const quest = card("Vision Quest", "Sorcery", "{X}{U}{R}", { oracleText: "Search your library and/or graveyard for an artifact creature card with mana value X or less and put it onto the battlefield with X additional +1/+1 counters on it. If X is 4 or greater, it gains haste until end of turn. If you search your library this way, shuffle." });

const human = card("Test Human", "Creature — Human", "{1}{W}", { power: "2", toughness: "2" });
const walker = card("Test Walker", "Legendary Planeswalker — Test", "{2}{W}", { loyalty: "3" });
const golem = (mv: number) => card(`Golem ${mv}`, "Artifact Creature — Golem", `{${mv}}`, { power: "2", toughness: "2" });

describe("Partner with, and entering with additional counters", () => {
  it("parse", () => {
    supported(khorvath, sylvia, renata, grumgully, oath, globe, arlinn, hydra, quest);
    // "Each creature you control" on a creature: whether it counts itself isn't worked out.
    expect(isFullySupported(card("Test Herald", "Creature — Elf", "{G}", { power: "1", toughness: "1", oracleText: "Each creature you control enters with an additional +1/+1 counter on it." }))).toBe(false);
  });

  it("Partner with: the targeted player may search for the partner", () => {
    const { s: s0, ap, ids } = setup([khorvath]);
    const sy = toZone(s0, ap, sylvia, "library");
    let s = untilChoice(cast(s0, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = untilChoice(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: ap }] }));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = untilChoice(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, cards: [sy] });
    s = untilChoice(act(s, { type: "searchLibrary", player: ap, found: [sy] }));
    expect(s.objects[sy]!.zone).toBe("hand");
  });

  it("Partner with: the bot targets itself", () => {
    const { s: s0, ap, ids } = setup([khorvath]);
    const sy = toZone(s0, ap, sylvia, "library");
    let s = untilChoice(cast(s0, ap, ids[0]!));
    for (let i = 0; i < 6 && s.pending; i++) {
      for (const a of botActions(s, ap)) s = act(s, a);
      s = untilChoice(s);
    }
    expect(s.objects[sy]!.zone).toBe("hand");
  });

  it("Renata: other creatures get a counter; not one entering with it; Hardened Scales adds one to the lot", () => {
    const { s: s0, ap, ids } = setup([bear(), hydra]);
    putOnBattlefield(s0, ap, renata);
    let s = untilChoice(cast(s0, ap, ids[0]!));
    expect(plus(s, ids[0]!)).toBe(1);
    putOnBattlefield(s, ap, scales);
    s = run(s, planCast(s, ap, ids[1]!, undefined, undefined, "auto", 3));
    expect(plus(s, ids[1]!)).toBe(5); // 3, +1 from Renata, +1 from Hardened Scales once
    // Entering at the same time as Renata (rulings).
    const { s: s1, ap: p1 } = setup([]);
    const r = toZone(s1, p1, renata, "graveyard");
    const b = toZone(s1, p1, bear(), "graveyard");
    enterTogether(s1, () => {
      moveObject(s1, r, "battlefield");
      moveObject(s1, b, "battlefield");
    });
    expect(plus(s1, b)).toBe(0);
  });

  it("Grumgully counts non-Humans only; Dragonstorm Globe, Dragons; Arlinn, Wolves", () => {
    const { s: s0, ap, ids } = setup([human, bear(), khorvath]);
    putOnBattlefield(s0, ap, grumgully);
    putOnBattlefield(s0, ap, globe);
    s0.objects[putOnBattlefield(s0, ap, arlinn)]!.counters.loyalty = 7;
    let s = untilChoice(cast(s0, ap, ids[0]!));
    expect(plus(s, ids[0]!)).toBe(0);
    s = untilChoice(cast(s, ap, ids[1]!));
    expect(plus(s, ids[1]!)).toBe(1);
    s = untilChoice(cast(s, ap, ids[2]!));
    expect(plus(s, ids[2]!)).toBe(2); // a Dragon, not a Human
    const w = toZone(s, ap, card("Test Wolf", "Creature — Wolf", "{1}{G}", { power: "2", toughness: "2" }), "graveyard");
    moveObject(s, w, "battlefield");
    expect(plus(s, w)).toBe(2); // Grumgully and Arlinn
  });

  it("Oath of Gideon: a planeswalker enters with one more loyalty counter", () => {
    const { s: s0, ap, ids } = setup([walker]);
    putOnBattlefield(s0, ap, oath);
    const s = untilChoice(cast(s0, ap, ids[0]!));
    expect(s.objects[ids[0]!]!.counters.loyalty).toBe(4);
  });

  it("Apocalypse Hydra: X counters, twice as many if X is 5 or more (rulings)", () => {
    const { s: s0, ap, ids } = setup([hydra, hydra]);
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 4));
    expect(plus(s, ids[0]!)).toBe(4);
    for (const id of s.battlefield) s.objects[id]!.tapped = false;
    s = run(s, planCast(s, ap, ids[1]!, undefined, undefined, "auto", 5));
    expect(plus(s, ids[1]!)).toBe(10);
  });

  it("Vision Quest: from the library or graveyard, with X more counters, and haste if X is 4 or more", () => {
    const { s: s0, ap, ids } = setup([quest, quest]);
    const big = toZone(s0, ap, golem(4), "library");
    const yard = toZone(s0, ap, golem(2), "graveyard");
    const tooBig = toZone(s0, ap, golem(5), "library");
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 4));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "searchZones" });
    s = act(s, { type: "chooseOption", player: ap, choice: "both" });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    if (s.pending?.kind !== "searchLibrary") throw new Error("no search");
    expect(s.pending.cards).toEqual(expect.arrayContaining([big, yard]));
    expect(s.pending.cards).not.toContain(tooBig);
    s = untilChoice(act(s, { type: "searchLibrary", player: ap, found: [big] }));
    expect(s.objects[big]!.zone).toBe("battlefield");
    expect(plus(s, big)).toBe(4);
    expect(objHasKeyword(s, s.objects[big]!, "Haste")).toBe(true);
    // X = 2: no haste.
    for (const id of s.battlefield) s.objects[id]!.tapped = false;
    s = run(s, planCast(s, ap, ids[1]!, undefined, undefined, "auto", 2));
    s = act(s, { type: "chooseOption", player: ap, choice: "graveyard" });
    s = passAll(act(s, { type: "searchLibrary", player: ap, found: [yard] }));
    expect(plus(s, yard)).toBe(2);
    expect(objHasKeyword(s, s.objects[yard]!, "Haste")).toBe(false);
  });
});
