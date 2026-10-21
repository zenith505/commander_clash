// Round 103: experience counters (CR 122.1), a kind of counter a player has: Meren of Clan Nel Toth, Kalemne, Mizzix of the
// Izmagnus, Ezuri, Claw of Progress; proliferate gives you another (rulings).

import { describe, expect, it } from "vitest";
import { act, card, cast, passUntil, putOnBattlefield, setup } from "./helpers";
import { characteristics, isFullySupported, spellCost, waitingOn, type GameState } from "../src";
import { proliferate } from "../src/effects/run-permanents";

// Real oracle text (Scryfall).
const meren = card("Meren of Clan Nel Toth", "Legendary Creature — Human Shaman", "{2}{B}{G}", { power: "3", toughness: "4", oracleText: "Whenever another creature you control dies, you get an experience counter.\nAt the beginning of your end step, choose target creature card in your graveyard. If that card's mana value is less than or equal to the number of experience counters you have, return it to the battlefield. Otherwise, put it into your hand." });
const kalemne = card("Kalemne, Disciple of Iroas", "Legendary Creature — Giant Soldier", "{2}{R}{W}", { power: "3", toughness: "3", keywords: ["Vigilance", "Double strike"], oracleText: "Double strike, vigilance\nWhenever you cast a creature spell with mana value 5 or greater, you get an experience counter.\nKalemne gets +1/+1 for each experience counter you have." });
const mizzix = card("Mizzix of the Izmagnus", "Legendary Creature — Goblin Wizard", "{2}{U}{R}", { power: "2", toughness: "2", oracleText: "Whenever you cast an instant or sorcery spell with mana value greater than the number of experience counters you have, you get an experience counter.\nInstant and sorcery spells you cast cost {1} less to cast for each experience counter you have." });
const ezuri = card("Ezuri, Claw of Progress", "Legendary Creature — Phyrexian Elf Warrior", "{2}{G}{U}", { power: "3", toughness: "3", oracleText: "Whenever a creature you control with power 2 or less enters, you get an experience counter.\nAt the beginning of combat on your turn, put X +1/+1 counters on another target creature you control, where X is the number of experience counters you have." });

const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });
const bigOne = (mv: number) => card(`Big ${mv}`, "Creature — Beast", `{${mv - 1}}{G}`, { power: "2", toughness: "2" });
const bear = card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });

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

describe("round 103: experience counters", () => {
  it("parse", () => [meren, kalemne, mizzix, ezuri].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Meren: another creature of yours dying gives an experience counter; not an opponent's", () => {
    const { s: s0, ap, opp, ids } = setup([shock, shock]);
    putOnBattlefield(s0, ap, meren);
    const mine = putOnBattlefield(s0, ap, card("Elf", "Creature — Elf", "{G}", { power: "1", toughness: "1" }));
    const theirs = putOnBattlefield(s0, opp, card("Goblin", "Creature — Goblin", "{R}", { power: "1", toughness: "1" }));
    let s = cast(s0, ap, ids[0]!, [{ kind: "object", id: mine }]);
    s = settle(s);
    expect(s.players[ap]!.experience).toBe(1);
    s = settle(cast(s, ap, ids[1]!, [{ kind: "object", id: theirs }]));
    expect(s.players[ap]!.experience).toBe(1);
  });

  it("Meren: at your end step, a card with mana value up to your experience returns to the battlefield, a higher one to your hand", () => {
    for (const [mv, where] of [[2, "battlefield"], [3, "hand"]] as const) {
      const { s: s0, ap } = setup([]);
      putOnBattlefield(s0, ap, meren);
      s0.players[ap]!.experience = 2;
      const card0 = toYard(s0, ap, bigOne(mv));
      let s = passUntil(s0, "end", ap);
      if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: card0 }] });
      s = settle(s);
      expect(s.objects[card0]!.zone, `mana value ${mv}`).toBe(where);
    }
  });

  it("Kalemne gets +1/+1 for each experience counter; a creature spell with mana value 5 or more gives one", () => {
    const big = bigOne(5);
    const { s: s0, ap, ids } = setup([big]);
    const k = putOnBattlefield(s0, ap, kalemne);
    s0.players[ap]!.experience = 2;
    expect(characteristics(s0, s0.objects[k]!).power).toBe(5);
    const s = settle(cast(s0, ap, ids[0]!));
    expect(s.players[ap]!.experience).toBe(3);
    expect(characteristics(s, s.objects[k]!).power).toBe(6);
  });

  it("Mizzix: instants and sorceries cost {1} less for each experience counter; a spell with greater mana value gives one", () => {
    const { s: s0, ap, ids } = setup([divination, shock]);
    putOnBattlefield(s0, ap, mizzix);
    const extra = (s: GameState) => spellCost(s, ap, s.objects[ids[0]!]!).extra;
    const before = extra(s0);
    s0.players[ap]!.experience = 1;
    expect(before - extra(s0)).toBe(1);
    // Divination's mana value 3 is greater than 1: one more.
    let s = settle(cast(s0, ap, ids[0]!));
    expect(s.players[ap]!.experience).toBe(2);
    // Shock's mana value 1 isn't greater than 2: none.
    const opp = s.turnOrder.find((p) => p !== ap)!;
    s = settle(cast(s, ap, ids[1]!, [{ kind: "player", id: opp }]));
    expect(s.players[ap]!.experience).toBe(2);
  });

  it("Ezuri: a small creature entering gives experience; at combat, that many +1/+1 counters on another creature", () => {
    const { s: s0, ap, ids } = setup([bear]);
    putOnBattlefield(s0, ap, ezuri);
    s0.players[ap]!.experience = 1;
    let s = settle(cast(s0, ap, ids[0]!));
    expect(s.players[ap]!.experience).toBe(2);
    s = passUntil(s, "beginCombat", ap);
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: ids[0]! }] });
    s = settle(s);
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(2);
  });

  it("proliferate gives you another experience counter", () => {
    const { s, ap } = setup([]);
    s.players[ap]!.experience = 1;
    proliferate(s, ap, "Test");
    expect(s.players[ap]!.experience).toBe(2);
  });
});
