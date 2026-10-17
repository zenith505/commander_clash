// "Whenever a creature you control leaves the battlefield" (CR 603.6c): for each one, wherever it went, looking back in
// time at it as it last existed (CR 603.10a); "without dying" and "if it didn't die" only when it went anywhere but a
// graveyard (CR 700.4); "if it had a counter on it" from its last known information.

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup } from "./helpers";
import { compileCard, isFullySupported, waitingOn, type CardDef, type GameState } from "../src";
import { destroyPermanent, moveObject } from "../src/game";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

// Real oracle text (Scryfall).
const officer = card("Flaming Fist Officer", "Creature — Gnome Soldier", "{2}{W}", { power: "2", toughness: "2", oracleText: "Whenever another creature you control leaves the battlefield, put a +1/+1 counter on this creature." });
const cosmographer = card("Imperial Cosmographer", "Creature — Kree Scientist", "{2}{U}", { power: "2", toughness: "3", keywords: ["Vigilance"], oracleText: "Vigilance\nWhenever another creature you control leaves the battlefield without dying, put two +1/+1 counters on this creature." });
const outpost = card("Outpost Siege", "Enchantment", "{3}{R}", { oracleText: "As this enchantment enters, choose Khans or Dragons.\n• Khans — At the beginning of your upkeep, exile the top card of your library. Until end of turn, you may play that card.\n• Dragons — Whenever a creature you control leaves the battlefield, this enchantment deals 1 damage to any target." });
const talent = card("Leader's Talent", "Enchantment — Class", "{1}{W}", { oracleText: "(Gain the next level as a sorcery to add its ability.)\nWhenever you attack, put a +1/+1 counter on target attacking creature.\n{2}{W}: Level 2\nWhenever a creature you control leaves the battlefield, if it had a counter on it, you gain 2 life.\n{3}{W}: Level 3\nWhenever you cast a spell, put a +1/+1 counter on each creature you control." });
const tokka = card("Tokka & Rahzar, Unsupervised", "Legendary Creature — Turtle Wolf Mutant", "{2}{R}", { power: "3", toughness: "3", keywords: ["First strike", "Treasure"], oracleText: "First strike\nWhenever another nontoken creature you control leaves the battlefield, put a +1/+1 counter on Tokka & Rahzar and create a Treasure token. This ability triggers only once each turn." });
const patrol = card("Ninth Bridge Patrol", "Creature — Dwarf Soldier", "{1}{W}", { power: "1", toughness: "1", oracleText: "Whenever another creature you control leaves the battlefield, put a +1/+1 counter on this creature." });

describe("whenever a creature you control leaves the battlefield", () => {
  it("parse", () => {
    supported(officer, cosmographer, outpost, talent, tokka, patrol);
    expect(compileCard(officer).triggers[0]).toMatchObject({ event: "permanentDies", dies: { leaves: true, other: true } });
    expect(compileCard(cosmographer).triggers[0]!.dies).toMatchObject({ leaves: true, notDies: true });
  });

  it("dying, bounced or exiled: each triggers Flaming Fist Officer; only the ones that didn't die trigger Imperial Cosmographer", () => {
    const { s: s0, ap, opp } = setup([]);
    const off = putOnBattlefield(s0, ap, officer);
    const cos = putOnBattlefield(s0, ap, cosmographer);
    const [a, b, c] = [putOnBattlefield(s0, ap, bear()), putOnBattlefield(s0, ap, bear()), putOnBattlefield(s0, ap, bear())];
    const theirs = putOnBattlefield(s0, opp, bear());
    destroyPermanent(s0, s0.objects[a]!, "destroyed");
    moveObject(s0, b, "hand");
    moveObject(s0, c, "exile");
    moveObject(s0, theirs, "hand"); // not yours
    const s = settle(s0);
    expect(s.objects[off]!.counters["+1/+1"]).toBe(3); // the three bears, not the opponent's
    expect(s.objects[cos]!.counters["+1/+1"]).toBe(4); // the bounced and the exiled one
  });

  it("not for itself (\"another\"), and looking back in time: leaving together, each sees the other", () => {
    const { s: s0, ap } = setup([]);
    const p1 = putOnBattlefield(s0, ap, patrol);
    const p2 = putOnBattlefield(s0, ap, patrol);
    moveObject(s0, p1, "hand");
    moveObject(s0, p2, "hand");
    const s = settle(s0);
    // Both triggered (CR 603.10a) but there's nothing to put a counter on now.
    expect(s.log.filter((l) => /Ninth Bridge Patrol's ability triggers/.test(l.text))).toHaveLength(2);
  });

  it("Outpost Siege, Dragons: 1 damage to any target for each", () => {
    const { s: s0, ap, opp } = setup([]);
    const siege = putOnBattlefield(s0, ap, outpost);
    s0.objects[siege]!.chosen = { anchor: "Dragons" };
    const b = putOnBattlefield(s0, ap, bear());
    const life = s0.players[opp]!.life;
    moveObject(s0, b, "exile");
    let s = settle(s0);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.players[opp]!.life).toBe(life - 1);
  });

  it("Outpost Siege, Khans: no such ability", () => {
    const { s: s0, ap } = setup([]);
    const siege = putOnBattlefield(s0, ap, outpost);
    s0.objects[siege]!.chosen = { anchor: "Khans" };
    const b = putOnBattlefield(s0, ap, bear());
    moveObject(s0, b, "exile");
    const s = settle(s0);
    expect(s.pending).toBeNull();
    expect(s.log.some((l) => /Outpost Siege's ability triggers/.test(l.text))).toBe(false);
  });

  it("Leader's Talent level 2: only a creature that had a counter on it", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, talent);
    s0.objects[t]!.classLevel = 2;
    const plain = putOnBattlefield(s0, ap, bear());
    const countered = putOnBattlefield(s0, ap, bear());
    s0.objects[countered]!.counters["+1/+1"] = 1;
    const life = s0.players[ap]!.life;
    moveObject(s0, plain, "graveyard");
    moveObject(s0, countered, "hand");
    const s = settle(s0);
    expect(s.players[ap]!.life).toBe(life + 2);
  });

  it("Tokka & Rahzar: nontoken only, once each turn", () => {
    const { s: s0, ap } = setup([]);
    const tr = putOnBattlefield(s0, ap, tokka);
    const [a, b] = [putOnBattlefield(s0, ap, bear()), putOnBattlefield(s0, ap, bear())];
    moveObject(s0, a, "hand");
    let s = settle(s0);
    moveObject(s, b, "hand");
    s = settle(s);
    expect(s.objects[tr]!.counters["+1/+1"]).toBe(1);
  });
});
