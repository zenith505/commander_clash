// "Whenever an artifact is put into a graveyard from the battlefield": that's what "dies" means, for any permanent
// (CR 700.4), and the trigger looks back at the permanent as it last existed (CR 603.10a), so "that land's controller"
// and "that player" are who controlled it. "Sacrifice ~ unless you sacrifice a land" (The Gitrog Monster): sacrificing one
// keeps it; with none, or choosing not to, it's sacrificed.

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, forest, passAll, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, waitingOn, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const apprentice = card("Marionette Apprentice", "Creature — Human Artificer", "{1}{B}", { power: "1", toughness: "2", oracleText: "Fabricate 1 (When this creature enters, put a +1/+1 counter on it or create a 1/1 colorless Servo artifact creature token.)\nWhenever another creature or artifact you control is put into a graveyard from the battlefield, each opponent loses 1 life." });
const dingus = card("Dingus Egg", "Artifact", "{4}", { oracleText: "Whenever a land is put into a graveyard from the battlefield, this artifact deals 2 damage to that land's controller." });
const mine = card("Magnetic Mine", "Artifact", "{4}", { oracleText: "Whenever another artifact is put into a graveyard from the battlefield, this artifact deals 2 damage to that artifact's controller." });
const avenger = card("Sardian Avenger", "Creature — Goblin Warrior", "{1}{R}", { power: "1", toughness: "1", keywords: ["First strike", "Trample"], oracleText: "First strike, trample\nWhenever this creature attacks, it gets +X/+0 until end of turn, where X is the number of artifacts your opponents control.\nWhenever an artifact an opponent controls is put into a graveyard from the battlefield, this creature deals 1 damage to that player." });
const gitrog = card("The Gitrog Monster", "Legendary Creature — Frog Horror", "{3}{B}{G}", { power: "6", toughness: "6", keywords: ["Deathtouch"], oracleText: "Deathtouch\nAt the beginning of your upkeep, sacrifice The Gitrog Monster unless you sacrifice a land.\nYou may play an additional land on each of your turns.\nWhenever one or more land cards are put into your graveyard from anywhere, draw a card." });
const bogElemental = card("Bog Elemental", "Creature — Elemental", "{3}{B}{B}", { power: "5", toughness: "4", keywords: ["Protection"], oracleText: "Protection from white\nAt the beginning of your upkeep, sacrifice this creature unless you sacrifice a land." });

const shatter = card("Shatter", "Instant", "{1}{R}", { oracleText: "Destroy target artifact." });
const stoneRain = card("Stone Rain", "Sorcery", "{2}{R}", { oracleText: "Destroy target land." });
const relic = card("Mind Stone", "Artifact", "{2}", { oracleText: "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card." });

/** On to `pid`'s next upkeep, where their upkeep triggers wait on the stack. */
function nextUpkeep(s: GameState, pid: number) {
  s = passUntil(passUntil(s, "end", pid), "upkeep", pid);
  for (let i = 0; i < 10 && !s.pending && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}

describe("put into a graveyard from the battlefield", () => {
  it("compiles them", () => supported(apprentice, dingus, mine, avenger, gitrog, bogElemental));

  it("Marionette Apprentice: an artifact you control counts, an opponent's doesn't", () => {
    let { s, ap, ids, opp } = setup([shatter, shatter]);
    putOnBattlefield(s, ap, apprentice);
    const mineStone = putOnBattlefield(s, ap, relic);
    const theirs = putOnBattlefield(s, opp, relic);
    const life = s.players[opp]!.life;
    s = cast(s, ap, ids[0]!, [target(mineStone)]);
    expect(s.players[opp]!.life).toBe(life - 1);
    s = cast(s, ap, ids[1]!, [target(theirs)]);
    expect(s.players[opp]!.life).toBe(life - 1);
  });

  it("Dingus Egg and Sardian Avenger hit whoever controlled it", () => {
    let { s, ap, ids, opp } = setup([stoneRain, shatter]);
    putOnBattlefield(s, ap, dingus);
    putOnBattlefield(s, ap, avenger);
    const land = putOnBattlefield(s, opp, forest);
    const stone = putOnBattlefield(s, opp, relic);
    const life = s.players[opp]!.life;
    s = cast(s, ap, ids[0]!, [target(land)]);
    expect(s.players[opp]!.life).toBe(life - 2);
    s = cast(s, ap, ids[1]!, [target(stone)]);
    expect(s.players[opp]!.life).toBe(life - 3);
  });

  it("Magnetic Mine: another artifact, not itself", () => {
    let { s, ap, ids, opp } = setup([shatter, shatter]);
    const m = putOnBattlefield(s, ap, mine);
    const stone = putOnBattlefield(s, opp, relic);
    const [mine0, opp0] = [s.players[ap]!.life, s.players[opp]!.life];
    s = cast(s, ap, ids[0]!, [target(stone)]);
    expect(s.players[opp]!.life).toBe(opp0 - 2);
    s = cast(s, ap, ids[1]!, [target(m)]);
    expect(s.players[ap]!.life).toBe(mine0);
  });

  it("The Gitrog Monster: sacrifice a land to keep it, and draw for the land", () => {
    let { s, ap } = setup([]);
    const g = putOnBattlefield(s, ap, gitrog);
    s = nextUpkeep(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "sacrifice" });
    const land = (s.pending as { options: string[] }).options[0]!;
    expect((s.pending as { options: string[] }).options).not.toContain(g);
    const hand = s.players[ap]!.hand.length;
    s = act(s, { type: "pickPermanents", player: ap, ids: [land] });
    s = passAll(s);
    expect(s.objects[land]!.zone).toBe("graveyard");
    expect(s.objects[g]!.zone).toBe("battlefield");
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("Bog Elemental: without a land it's sacrificed", () => {
    let { s, ap } = setup([]);
    // No lands: the scene's lands go to exile.
    for (const id of [...s.battlefield])
      if (s.objects[id]!.controller === ap) {
        s.battlefield.splice(s.battlefield.indexOf(id), 1);
        s.objects[id]!.zone = "exile";
        s.players[ap]!.exile.push(id);
      }
    const b = putOnBattlefield(s, ap, bogElemental);
    putOnBattlefield(s, ap, bear());
    s = nextUpkeep(s, ap);
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = passAll(s);
    expect(s.objects[b]!.zone).toBe("graveyard");
  });
});
