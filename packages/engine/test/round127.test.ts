// Round 127: round 126's gaps (Hazel of the Rootbloom's mana in autopay, ...), then the most played cards.

import { describe, expect, it } from "vitest";
import { act, addEffect, card, cast, passAll, passUntil, putOnBattlefield, scry, setup, target } from "./helpers";
import { abilitiesOf, altCostsFor, botActions, invalidateCharacteristics, characteristics, power, isFullySupported, manaAbilitiesOn, objHasKeyword, objIsType, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Bots answer every choice and everyone passes until the stack and trigger queue are empty. */
const settleBots = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const who = s.pending ? s.pending.player : waitingOn(s)!;
    const acts = s.pending ? botActions(s, who) : [];
    s = acts.length ? acts.reduce((x, a) => act(x, a), s) : act(s, { type: "passPriority", player: who });
  }
  return s;
};
const logText = (s: GameState) => s.log.map((l) => (typeof l === "string" ? l : l.text)).join("\n");
/** `ap`'s lands are only `lands`. */
const onlyLands = (s: GameState, ap: number, ...lands: CardDef[]) => {
  s.battlefield = s.battlefield.filter((id) => !s.cards[s.objects[id]!.cardId]!.types.includes("Land") || s.objects[id]!.controller !== ap);
  return lands.map((l) => putOnBattlefield(s, ap, l));
};

const hazel = card("Hazel of the Rootbloom", "Legendary Creature — Squirrel Druid", "{2}{B}{G}", {
  power: "3",
  toughness: "5",
  oracleText: "{T}, Pay 2 life, Tap X untapped tokens you control: Add X mana in any combination of colors.\nAt the beginning of your end step, create a token that's a copy of target token you control. If that token is a Squirrel, instead create two tokens that are copies of it.",
});
const squirrel = card("Squirrel", "Token Creature — Squirrel", "", { power: "1", toughness: "1", colors: ["G"] });
const forest = card("Forest", "Basic Land — Forest");

describe("Hazel of the Rootbloom in autopay: only when the other sources can't pay (CR 107.3a, 605.1a)", () => {
  const scene = (lands: number, tokens: number, ...hand: CardDef[]) => {
    const { s, ap, ids } = setup(hand);
    onlyLands(s, ap, ...Array.from({ length: lands }, () => forest));
    const h = putOnBattlefield(s, ap, hazel);
    const toks = Array.from({ length: tokens }, () => {
      const id = putOnBattlefield(s, ap, squirrel);
      s.objects[id]!.isToken = true;
      return id;
    });
    return { s, ap, ids, h, toks };
  };
  const spell = card("Test Spell", "Sorcery", "{2}{B}{G}", { oracleText: "Draw a card." });
  it("two Forests and Hazel tapping two tokens pay {2}{B}{G}: 2 life, the black from Hazel", () => {
    supported(hazel);
    const { s: s0, ap, ids, h, toks } = scene(2, 3, spell);
    const life = s0.players[ap]!.life;
    const plan = planCast(s0, ap, ids[0]!);
    expect(plan?.some((a) => a.type === "activateAbility" && a.objectId === h && a.x === 2)).toBe(true);
    const s = run(s0, plan);
    expect(s.stack.at(-1)?.objectId).toBe(ids[0]);
    expect(s.players[ap]!.life).toBe(life - 2);
    expect(toks.filter((id) => s.objects[id]!.tapped)).toHaveLength(2);
    expect(s.objects[h]!.tapped).toBe(true);
  });
  it("not when the lands can pay; nothing with too few tokens", () => {
    const four = scene(4, 3, card("Green Spell", "Sorcery", "{2}{G}{G}", { oracleText: "Draw a card." }));
    expect(planCast(four.s, four.ap, four.ids[0]!)?.some((a) => a.type === "activateAbility")).toBe(false);
    const short = scene(1, 2, spell);
    expect(planCast(short.s, short.ap, short.ids[0]!)).toBeNull();
  });
  it("not while Hazel is summoning sick", () => {
    const { s, ap, ids, h } = scene(2, 3, spell);
    s.objects[h]!.controlledSinceTurn = s.turn;
    expect(planCast(s, ap, ids[0]!)).toBeNull();
  });
});

const technician = card("Resonance Technician", "Creature — Weird Detective", "{3}{U/R}{U/R}", {
  power: "2",
  toughness: "4",
  keywords: ["Flying"],
  oracleText: "Flying\nWhen this creature enters, you may discard a card. If you do, investigate twice.\n{T}, Tap X untapped artifacts you control: Copy target instant or sorcery spell you control with mana value X. You may choose new targets for the copy.",
});
const clue = card("Clue", "Token Artifact — Clue", "", { oracleText: "{2}, Sacrifice this artifact: Draw a card." });
const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });

describe("Resonance Technician: tap X artifacts, copy a spell of yours with mana value X (CR 107.3a, 707.10)", () => {
  const scene = (clues: number, ...hand: CardDef[]) => {
    const { s, ap, ids } = setup(hand);
    const t = putOnBattlefield(s, ap, technician);
    const arts = Array.from({ length: clues }, () => {
      const id = putOnBattlefield(s, ap, clue);
      s.objects[id]!.isToken = true;
      return id;
    });
    return { s, ap, ids, t, arts };
  };
  it("three Clues copy Divination (mana value 3); two can't", () => {
    supported(technician);
    const { s: s0, ap, ids, t, arts } = scene(3, divination);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    const spell = s.stack.at(-1)!;
    expect(planActivate(s, ap, t, 0, [{ kind: "stack", id: spell.id }], undefined, undefined, 2, { tap: arts.slice(0, 2) })).toBeNull();
    const hand = s.players[ap]!.hand.length;
    s = run(s, planActivate(s, ap, t, 0, [{ kind: "stack", id: spell.id }], undefined, undefined, 3, { tap: arts }));
    expect(arts.every((id) => s.objects[id]!.tapped) && s.objects[t]!.tapped).toBe(true);
    s = settleBots(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 4);
  });
  it("a bot copies its own Divination with three Clues", () => {
    const { s: s0, ap, ids, t } = scene(3, divination);
    const s = run(s0, planCast(s0, ap, ids[0]!));
    const acts = botActions(s, ap);
    expect(acts.some((a) => a.type === "activateAbility" && a.objectId === t && a.x === 3)).toBe(true);
  });
});

const lightPaws = card("Light-Paws, Emperor's Voice", "Legendary Creature — Fox Advisor", "{1}{W}", {
  power: "2",
  toughness: "2",
  oracleText: "Whenever an Aura you control enters, if you cast it, you may search your library for an Aura card with mana value less than or equal to that Aura and with a different name than each Aura you control, put that card onto the battlefield attached to Light-Paws, then shuffle.",
});

describe("Light-Paws' search prompt says the mana value", () => {
  it("a two-mana Aura: \"with mana value 2 or less\"", () => {
    const blessing = card("Test Blessing", "Enchantment — Aura", "{1}{W}", { oracleText: "Enchant creature\nEnchanted creature gets +1/+1." });
    const { s: s0, ap, ids } = setup([blessing]);
    const lp = putOnBattlefield(s0, ap, lightPaws);
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: lp }]));
    for (let i = 0; i < 40 && !s.pending && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    const prompt = s.pending?.kind === "chooseMay" ? s.pending.prompt : "";
    expect(prompt).toContain("with mana value 2 or less and with a different name than each Aura you control");
  });
});

const malcolm = card("Malcolm, Keen-Eyed Navigator", "Legendary Creature — Siren Pirate", "{2}{U}", {
  power: "2",
  toughness: "1",
  keywords: ["Flying", "Partner"],
  oracleText: "Flying\nWhenever one or more Pirates you control deal damage to your opponents, you create a Treasure token for each opponent dealt damage. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")\nPartner (You can have two commanders if both have partner.)",
});
const francisco = card("Francisco, Fowl Marauder", "Legendary Creature — Bird Pirate", "{1}{U}{R}", {
  power: "1",
  toughness: "1",
  keywords: ["Flying", "Partner"],
  oracleText: "Flying\nFrancisco can't block.\nWhenever one or more Pirates you control deal damage to a player, Francisco explores.\nPartner (You can have two commanders if both have partner.)",
});
const pinger = (name: string, type: string) => card(name, `Creature — ${type}`, "{1}{R}", { power: "1", toughness: "1", oracleText: "{T}: This creature deals 1 damage to each opponent." });

describe("Malcolm, Keen-Eyed Navigator: one trigger for the damage Pirates deal at once (CR 603.2c)", () => {
  const treasures = (s: GameState, pid: number) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]?.name === "Treasure Token").length;
  it("a Pirate deals 1 damage to each opponent: one trigger, three Treasures", () => {
    supported(malcolm, francisco);
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, malcolm);
    const p = putOnBattlefield(s0, ap, pinger("Test Corsair", "Human Pirate"));
    const s = settleBots(run(s0, planActivate(s0, ap, p, 0)));
    expect(logText(s).match(/Malcolm, Keen-Eyed Navigator's ability triggers/g)).toHaveLength(1);
    expect(treasures(s, ap)).toBe(3);
  });
  it("two Pirates' combat damage to two opponents: one trigger, two Treasures", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, malcolm);
    const [a, b] = [putOnBattlefield(s0, ap, pinger("Corsair A", "Human Pirate")), putOnBattlefield(s0, ap, pinger("Corsair B", "Human Pirate"))];
    const [o1, o2] = [1, 2].map((n) => s0.turnOrder[(s0.turnOrder.indexOf(ap) + n) % 4]!);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: o1! }, { attacker: b, defender: o2! }] });
    for (let i = 0; i < 60 && s.step !== "end"; i++) {
      const pid = waitingOn(s)!;
      s = s.pending?.kind === "declareBlockers" ? act(s, { type: "declareBlockers", player: pid, blocks: [] }) : s.pending ? botActions(s, pid).reduce((x, y) => act(x, y), s) : act(s, { type: "passPriority", player: pid });
    }
    expect(logText(s).match(/Malcolm, Keen-Eyed Navigator's ability triggers/g)).toHaveLength(1);
    expect(treasures(s, ap)).toBe(2);
  });
  it("not for a source that isn't a Pirate", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, malcolm);
    const p = putOnBattlefield(s0, ap, pinger("Test Goblin", "Goblin"));
    const s = settleBots(run(s0, planActivate(s0, ap, p, 0)));
    expect(treasures(s, ap)).toBe(0);
  });
  it("Francisco explores once for each player dealt damage (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, francisco);
    const p = putOnBattlefield(s0, ap, pinger("Test Corsair", "Human Pirate"));
    const s = settleBots(run(s0, planActivate(s0, ap, p, 0)));
    // Forests on top: each explore puts a land into the hand; nothing else changes Francisco.
    expect(logText(s).match(/Francisco, Fowl Marauder's ability triggers/g)).toHaveLength(3);
    expect(s.objects[f]!.zone).toBe("battlefield");
  });
});

const signpost = card("Misleading Signpost", "Artifact", "{2}{U}", {
  keywords: ["Flash"],
  oracleText: "Flash\nWhen this artifact enters during the declare attackers step, you may reselect which player or permanent target attacking creature is attacking. (It can't attack its controller or their permanents.)\n{T}: Add {U}.",
});

describe("Misleading Signpost: reselect what an attacking creature attacks (rulings)", () => {
  /** `opp` attacks `ap` with a Bear; `ap` has Misleading Signpost in hand, in the declare attackers step. */
  const attacked = () => {
    const { s: s0, ap, ids, opp } = setup([signpost]);
    const bear = putOnBattlefield(s0, opp, card("Test Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    let s = passUntil(s0, "declareAttackers", opp);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: bear, defender: ap }] });
    for (let i = 0; i < 8 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return { s, ap, opp, bear, sp: ids[0]! };
  };
  it("flashed in as Ana's Bear attacks you: it attacks another player now, still declared at you", () => {
    supported(signpost);
    const { s: s0, ap, opp, bear, sp } = attacked();
    let s = run(s0, planCast(s0, ap, sp));
    for (let i = 0; i < 8 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: bear }] } as Action);
    for (let i = 0; i < 8 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "reselectAttack", player: ap });
    const options = s.pending?.kind === "chooseOption" ? s.pending.options : [];
    expect(options).not.toContain(String(opp)); // never its controller
    expect(options).not.toContain(String(ap)); // not what it attacks now
    const other = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    s = act(s, { type: "chooseOption", player: ap, choice: String(other) });
    expect(s.objects[bear]!.attacking).toBe(other);
    expect(s.objects[bear]!.attacked?.players).toEqual([ap]);
  });
  it("outside the declare attackers step it doesn't trigger", () => {
    const { s: s0, ap, ids } = setup([signpost]);
    const s = run(s0, planCast(s0, ap, ids[0]!));
    const after = settleBots(s);
    expect(logText(after)).not.toMatch(/Misleading Signpost's ability triggers/);
  });
  it("a bot turns the attack away from itself", () => {
    const { s: s0, ap, bear, sp } = attacked();
    let s = run(s0, planCast(s0, ap, sp));
    s = settleBots(s);
    expect(s.objects[bear]!.attacking).not.toBe(ap);
  });
});

const oneRing = card("One Ring to Rule Them All", "Legendary Enchantment — Saga", "{2}{B}{B}", {
  oracleText: "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — The Ring tempts you, then each player mills cards equal to your Ring-bearer's power.\nII — Destroy all nonlegendary creatures.\nIII — Each opponent loses 1 life for each creature card in that player's graveyard.",
});

describe("One Ring to Rule Them All", () => {
  it("I: the Ring tempts you, then each player mills cards equal to your Ring-bearer's power", () => {
    supported(oneRing);
    const { s: s0, ap, ids } = setup([oneRing]);
    const giant = putOnBattlefield(s0, ap, card("Test Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" }));
    const yards = (s: GameState) => s.turnOrder.map((p) => s.players[p]!.graveyard.length);
    const before = yards(s0);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settleBots(s);
    expect(s.players[ap]!.ring?.bearer?.id).toBe(giant);
    expect(yards(s)).toEqual(before.map((n) => n + 3));
  });
  it("I without a creature: nobody mills", () => {
    const { s: s0, ap, ids } = setup([oneRing]);
    const before = s0.turnOrder.map((p) => s0.players[p]!.library.length);
    const s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.turnOrder.map((p) => s.players[p]!.library.length)).toEqual(before);
  });
  it("III: each opponent loses 1 life for each creature card in their own graveyard", () => {
    const { s: s0, ap } = setup([]);
    const ring = putOnBattlefield(s0, ap, oneRing);
    s0.objects[ring]!.counters.lore = 2;
    const [o1, o2, o3] = [1, 2, 3].map((n) => s0.turnOrder[(s0.turnOrder.indexOf(ap) + n) % 4]!);
    const bear = card("Yard Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });
    const toYard = (pid: number, k: number) => {
      for (let i = 0; i < k; i++) {
        const id = putOnBattlefield(s0, pid, bear);
        s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
        s0.objects[id]!.zone = "graveyard";
        s0.players[pid]!.graveyard.push(id);
      }
    };
    toYard(o1!, 2);
    toYard(o2!, 0);
    toYard(o3!, 1);
    toYard(ap, 3);
    const order = [ap, o1!, o2!, o3!];
    const life = (s: GameState) => order.map((p) => s.players[p]!.life);
    // On ap's next turn, just before the lore counter is added (after the draw step, CR 714.3b).
    let s = passUntil(passUntil(s0, "main1", o1), "draw", ap);
    const creatures = order.map((p) => s.players[p]!.graveyard.filter((id) => s.cards[s.objects[id]!.cardId]!.types.includes("Creature")).length);
    const start = life(s);
    s = settleBots(passUntil(s, "main1", ap));
    expect(life(s).map((n, i) => start[i]! - n)).toEqual([0, creatures[1], creatures[2], creatures[3]]);
    expect(creatures[1]).toBeGreaterThanOrEqual(2);
  });
});

const infantryShield = card("Infantry Shield", "Artifact — Equipment", "{2}{R}", {
  oracleText: "Equipped creature has menace and mobilize X, where X is its power. (Whenever it attacks, create X tapped and attacking 1/1 red Warrior creature tokens. Sacrifice them at the beginning of the next end step.)\nEquip {2}",
});
const avenger = card("Avenger of the Fallen", "Creature — Human Warrior", "{2}{B}", {
  power: "2",
  toughness: "4",
  keywords: ["Deathtouch", "Mobilize"],
  oracleText: "Deathtouch\nMobilize X, where X is the number of creature cards in your graveyard. (Whenever this creature attacks, create X tapped and attacking 1/1 red Warrior creature tokens. Sacrifice them at the beginning of the next end step.)",
});

describe("Mobilize X (CR 702.181a): Infantry Shield's, X its power; Avenger of the Fallen's, creature cards in your graveyard", () => {
  const warriors = (s: GameState, pid: number) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]?.name === "Warrior Token");
  const attack = (s0: GameState, ap: number, attacker: string) => {
    const opp = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker, defender: opp }] });
    for (let i = 0; i < 20 && (s.stack.length || s.triggerQueue.length || s.pending) && s.step === "declareAttackers"; i++) {
      const who = s.pending ? s.pending.player : waitingOn(s)!;
      s = s.pending ? botActions(s, who).reduce((x, a) => act(x, a), s) : act(s, { type: "passPriority", player: who });
    }
    return { s, opp };
  };
  it("a 3-power creature equipped with Infantry Shield attacks: menace, and three attacking Warriors", () => {
    supported(infantryShield, avenger);
    const { s: s0, ap } = setup([]);
    const giant = putOnBattlefield(s0, ap, card("Test Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" }));
    const shield = putOnBattlefield(s0, ap, infantryShield);
    s0.objects[shield]!.attachedTo = giant;
    const { s, opp } = attack(s0, ap, giant);
    expect(objHasKeyword(s, s.objects[giant]!, "Menace")).toBe(true);
    const ws = warriors(s, ap);
    expect(ws).toHaveLength(3);
    expect(ws.every((id) => s.objects[id]!.tapped && s.objects[id]!.attacking === opp)).toBe(true);
  });
  it("Avenger of the Fallen with two creature cards in your graveyard: two Warriors", () => {
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, avenger);
    for (let i = 0; i < 2; i++) {
      const id = putOnBattlefield(s0, ap, card("Dead Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      s0.objects[id]!.zone = "graveyard";
      s0.players[ap]!.graveyard.push(id);
    }
    const { s } = attack(s0, ap, a);
    expect(warriors(s, ap)).toHaveLength(2);
  });
});

const yedora = card("Yedora, Grave Gardener", "Legendary Creature — Treefolk Druid", "{4}{G}", {
  power: "5",
  toughness: "5",
  oracleText: "Whenever another nontoken creature you control dies, you may return it to the battlefield face down under its owner's control. It's a Forest land. (It has no other types or abilities.)",
});

describe("Yedora, Grave Gardener: the creature comes back face down as a Forest land (CR 708.2a, 305.6)", () => {
  const murder = card("Test Murder", "Instant", "{B}", { oracleText: "Destroy target creature." });
  const bigBear = card("Big Bear", "Creature — Bear", "{3}{G}", { power: "4", toughness: "4", oracleText: "Trample" });
  const kill = (yes: boolean, token = false) => {
    const { s: s0, ap, ids } = setup([murder]);
    putOnBattlefield(s0, ap, yedora);
    const b = putOnBattlefield(s0, ap, bigBear);
    if (token) s0.objects[b]!.isToken = true;
    let s = cast(s0, ap, ids[0]!, [target(b)]);
    const asked = s.pending?.kind === "chooseMay";
    if (asked) s = act(s, { type: "chooseMay", player: ap, yes });
    s = passAll(s);
    return { s, ap, b, asked };
  };
  it("a creature card returns face down: an untapped Forest land with no name, no creature type, tapping for {G}", () => {
    supported(yedora);
    const { s, ap, asked } = kill(true);
    expect(asked).toBe(true);
    const land = s.battlefield.map((id) => s.objects[id]!).find((o) => o.faceDown && o.controller === ap);
    expect(land, logText(s)).toBeDefined();
    const c = characteristics(s, land!);
    expect(c.types).toEqual(["Land"]);
    expect(c.subtypes).toEqual(["Forest"]);
    expect(objIsType(s, land!, "Creature")).toBe(false);
    expect(objHasKeyword(s, land!, "Trample")).toBe(false);
    expect(manaAbilitiesOn(s, land!).map((m) => m.produces)).toEqual([{ kind: "fixed", mana: ["G"] }]);
    expect(s.players[ap]!.graveyard.some((id) => s.cards[s.objects[id]!.cardId]?.name === "Big Bear")).toBe(false);
  });
  it("declining leaves it in the graveyard; a token never triggers", () => {
    const no = kill(false);
    expect(no.asked).toBe(true);
    expect(no.s.players[no.ap]!.graveyard.some((id) => no.s.cards[no.s.objects[id]!.cardId]?.name === "Big Bear")).toBe(true);
    expect(no.s.battlefield.some((id) => no.s.objects[id]!.faceDown)).toBe(false);
    expect(kill(true, true).asked).toBe(false);
  });
});

const truce = card("Tenuous Truce", "Enchantment — Aura", "{1}{W}", {
  oracleText: "Enchant opponent\nAt the beginning of enchanted opponent's end step, you and that player each draw a card.\nWhen you attack enchanted opponent or a planeswalker they control or when they attack you or a planeswalker you control, sacrifice this Aura.",
});

describe("Tenuous Truce: sacrificed when you and the enchanted opponent attack each other (CR 506.2, 508.3a)", () => {
  const scene = () => {
    const { s, ap } = setup([]);
    const others = s.turnOrder.filter((p) => p !== ap);
    const [them, third] = [others[0]!, others[1]!];
    const t = putOnBattlefield(s, ap, truce);
    s.objects[t]!.attachedToPlayer = them;
    const bear = (pid: number) => putOnBattlefield(s, pid, card("Test Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    return { s, ap, them, third, t, bear };
  };
  const declare = (s0: GameState, who: number, attacks: { attacker: string; defender: number }[]) => {
    let s = passUntil(s0, "declareAttackers", who);
    s.battlefield.forEach((id) => (s.objects[id]!.attacking = undefined));
    s = act(s, { type: "declareAttackers", player: who, attacks });
    return settleBots(s);
  };
  const on = (s: GameState, id: string) => s.battlefield.includes(id);
  it("at the enchanted opponent's end step, you and they each draw a card", () => {
    supported(truce);
    const { s: s0, ap, them } = scene();
    let s = passUntil(s0, "end", them);
    const hands = [s.players[ap]!.hand.length, s.players[them]!.hand.length];
    s = settleBots(s);
    expect([s.players[ap]!.hand.length, s.players[them]!.hand.length]).toEqual([hands[0]! + 1, hands[1]! + 1]);
  });
  it("you attack them: sacrificed; you attack someone else: it stays", () => {
    const { s: s0, ap, them, third, t, bear } = scene();
    const b = bear(ap);
    expect(on(declare(structuredClone(s0), ap, [{ attacker: b, defender: third }]), t)).toBe(true);
    expect(on(declare(s0, ap, [{ attacker: b, defender: them }]), t)).toBe(false);
  });
  it("they attack you: sacrificed; they attack someone else: it stays", () => {
    const { s: s0, ap, them, third, t, bear } = scene();
    const b = bear(them);
    expect(on(declare(structuredClone(s0), them, [{ attacker: b, defender: third }]), t)).toBe(true);
    const s = declare(s0, them, [{ attacker: b, defender: ap }]);
    expect(on(s, t)).toBe(false);
    expect(logText(s)).toMatch(/Tenuous Truce/);
  });
});

const demon = card("Demon of Fate's Design", "Enchantment Creature — Demon", "{4}{B}{B}", {
  power: "6",
  toughness: "6",
  oracleText: "Flying, trample\nOnce during each of your turns, you may cast an enchantment spell by paying life equal to its mana value rather than paying its mana cost.\n{2}{B}, Sacrifice another enchantment: This creature gets +X/+0 until end of turn, where X is the sacrificed enchantment's mana value.",
});

describe("Demon of Fate's Design: an enchantment spell for life, once during each of your turns (CR 118.9)", () => {
  const ench = card("Test Omen", "Enchantment", "{2}{W}", { oracleText: "At the beginning of your upkeep, you gain 1 life." });
  const ench2 = card("Test Charm", "Enchantment", "{1}{U}", { oracleText: "At the beginning of your upkeep, you gain 1 life." });
  const sorcery = card("Test Sorcery", "Sorcery", "{2}", { oracleText: "Draw a card." });
  it("pays 3 life and no mana for a 3-mana enchantment; the second one this turn costs mana", () => {
    supported(demon);
    const { s: s0, ap, ids } = setup([ench, ench2, sorcery]);
    putOnBattlefield(s0, ap, demon);
    const life = s0.players[ap]!.life;
    expect(altCostsFor(s0, ap, s0.objects[ids[0]!]!).find((a) => a.kind === "lifeForMv")?.text).toBe("pay 3 life");
    expect(altCostsFor(s0, ap, s0.objects[ids[2]!]!).some((a) => a.kind === "lifeForMv")).toBe(false); // not an enchantment
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "lifeForMv" }));
    expect(s.players[ap]!.life).toBe(life - 3);
    expect(s.battlefield.filter((id) => s.objects[id]!.tapped)).toHaveLength(0);
    s = passAll(s);
    expect(s.battlefield).toContain(ids[0]);
    expect(planCast(s, ap, ids[1]!, undefined, undefined, "auto", undefined, { alt: "lifeForMv" })).toBeNull();
    expect(altCostsFor(s, ap, s.objects[ids[1]!]!).some((a) => a.kind === "lifeForMv")).toBe(false);
  });
  it("not during an opponent's turn", () => {
    const { s: s0, ap, ids, opp } = setup([card("Test Flash Omen", "Enchantment", "{1}{W}", { oracleText: "Flash\nAt the beginning of your upkeep, you gain 1 life." })]);
    putOnBattlefield(s0, ap, demon);
    const s = passUntil(s0, "upkeep", opp);
    expect(altCostsFor(s, ap, s.objects[ids[0]!]!).some((a) => a.kind === "lifeForMv")).toBe(false);
  });
  it("{2}{B}, sacrifice a 3-mana enchantment: +3/+0", () => {
    const { s: s0, ap } = setup([]);
    const d = putOnBattlefield(s0, ap, demon);
    const e = putOnBattlefield(s0, ap, ench);
    const plan = planActivate(s0, ap, d, 0, undefined, undefined, undefined, undefined, { sacrifice: [e] });
    const s = passAll(run(s0, plan));
    expect(s.battlefield).not.toContain(e);
    expect(power(s, s.objects[d]!)).toBe(9);
  });
});

const worldAtWar = card("World at War", "Sorcery", "{3}{R}{R}", {
  oracleText: "After the second main phase this turn, there's an additional combat phase followed by an additional main phase. At the beginning of that combat, untap all creatures that attacked this turn.\nRebound (If you cast this spell from your hand, exile it as it resolves. At the beginning of your next upkeep, you may cast this card from exile without paying its mana cost.)",
});

describe("World at War: a combat and a main phase after the turn's second main phase (CR 500.8)", () => {
  const scene = () => {
    const { s, ap, ids, opp } = setup([worldAtWar]);
    const bear = putOnBattlefield(s, ap, card("Test Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    return { s, ap, ids, opp, bear };
  };
  const attackWith = (s0: GameState, ap: number, bear: string, opp: number) => {
    const s = passUntil(s0, "declareAttackers", ap);
    return act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: bear, defender: opp }] });
  };
  it("cast in the first main phase: the turn's combat, the second main phase, then the new combat, which untaps the attacker", () => {
    supported(worldAtWar);
    const { s: s0, ap, ids, opp, bear } = scene();
    let s = cast(s0, ap, ids[0]!);
    expect(s.players[ap]!.exile).toContain(ids[0]); // rebound
    s = attackWith(s, ap, bear, opp);
    s = passUntil(s, "main2");
    expect(s.mainPhasesThisTurn).toBe(2);
    expect(s.objects[bear]!.tapped).toBe(true);
    s = passUntil(s, "beginCombat");
    expect(s.activePlayer).toBe(ap);
    expect(s.combatsThisTurn).toBe(2);
    s = settleBots(s);
    expect(s.objects[bear]!.tapped).toBe(false);
    s = passUntil(s, "main2");
    expect(s.activePlayer).toBe(ap);
    expect(s.mainPhasesThisTurn).toBe(3);
    s = passUntil(s, "end");
    expect([s.activePlayer, s.combatsThisTurn]).toEqual([ap, 2]);
  });
  it("cast in the second main phase: it still adds them; untapping only creatures that attacked", () => {
    const { s: s0, ap, ids, opp, bear } = scene();
    const idle = putOnBattlefield(s0, ap, card("Idle Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    let s = attackWith(s0, ap, bear, opp);
    s = passUntil(s, "main2");
    s.objects[idle]!.tapped = true;
    s = cast(s, ap, ids[0]!);
    s = passUntil(s, "beginCombat");
    expect([s.activePlayer, s.combatsThisTurn]).toEqual([ap, 2]);
    s = settleBots(s);
    expect([s.objects[bear]!.tapped, s.objects[idle]!.tapped]).toEqual([false, true]);
  });
  it("cast after the second main phase has ended: no new phases", () => {
    const { s: s0, ap, ids } = scene();
    let s = passUntil(s0, "main2");
    s.mainPhasesThisTurn = 3; // as in a third main phase (an earlier extra combat's)
    s = cast(s, ap, ids[0]!);
    s = passUntil(s, "end");
    expect([s.activePlayer, s.combatsThisTurn]).toEqual([ap, 1]);
  });
});

const snoop = card("Conspicuous Snoop", "Creature — Goblin Rogue", "{R}{R}", {
  power: "2",
  toughness: "2",
  oracleText: "Play with the top card of your library revealed.\nYou may cast Goblin spells from the top of your library.\nAs long as the top card of your library is a Goblin card, this creature has all activated abilities of that card.",
});
/** A fresh copy of `def` on top of `pid`'s library. */
const onTop = (s: GameState, pid: number, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  invalidateCharacteristics(s);
  return id;
};

describe("Conspicuous Snoop: the activated abilities of the Goblin card on top of your library", () => {
  const fanatic = card("Mogg Fanatic", "Creature — Goblin", "{R}", { power: "1", toughness: "1", oracleText: "Sacrifice Mogg Fanatic: It deals 1 damage to any target." });
  const prospector = card("Skirk Prospector", "Creature — Goblin", "{R}", { power: "1", toughness: "1", oracleText: "Sacrifice a Goblin: Add {R}." });
  it("Mogg Fanatic on top: Snoop sacrifices itself to deal 1 damage (rulings)", () => {
    supported(snoop);
    const { s: s0, ap, opp } = setup([]);
    const sn = putOnBattlefield(s0, ap, snoop);
    onTop(s0, ap, fanatic);
    const ab = abilitiesOf(s0, s0.objects[sn]!).activated;
    expect(ab).toHaveLength(1);
    const life = s0.players[opp]!.life;
    const s = passAll(run(s0, planActivate(s0, ap, sn, 0, [{ kind: "player", id: opp }])));
    expect(s.battlefield).not.toContain(sn);
    expect(s.players[opp]!.life).toBe(life - 1);
  });
  it("Skirk Prospector's sacrifice-for-mana ability too; nothing while the top card isn't a Goblin", () => {
    const { s, ap } = setup([]);
    const sn = putOnBattlefield(s, ap, snoop);
    onTop(s, ap, prospector);
    expect(abilitiesOf(s, s.objects[sn]!).activated.map((a) => a.body.text)).toEqual(["Add {R}."]);
    onTop(s, ap, card("Test Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2", oracleText: "Sacrifice Test Bear: Draw a card." }));
    expect(abilitiesOf(s, s.objects[sn]!).activated).toHaveLength(0);
    expect(manaAbilitiesOn(s, s.objects[sn]!)).toHaveLength(0);
  });
});

const nautiloid = card("Nautiloid Ship", "Artifact — Vehicle", "{4}", {
  power: "6",
  toughness: "6",
  oracleText: "Flying\nWhen this Vehicle enters, exile target player's graveyard.\nWhenever this Vehicle deals combat damage to a player, you may put a creature card exiled with this Vehicle onto the battlefield under your control.\nCrew 3",
});

describe("Nautiloid Ship: a creature card from the graveyard it exiled (CR 607.2a)", () => {
  it("exiles the graveyard as it enters; on combat damage, you choose one of its creature cards to put onto the battlefield", () => {
    supported(nautiloid);
    const { s: s0, ap, ids, opp } = setup([nautiloid]);
    const victim = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const yard = [card("Dead Giant", "Creature — Giant", "{5}{R}", { power: "5", toughness: "5" }), card("Dead Elf", "Creature — Elf", "{G}", { power: "1", toughness: "1" }), card("Old Spell", "Sorcery", "{R}", { oracleText: "Draw a card." })].map((d) => {
      const id = putOnBattlefield(s0, victim, d);
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      s0.objects[id]!.zone = "graveyard";
      s0.players[victim]!.graveyard.push(id);
      return id;
    });
    const crew = putOnBattlefield(s0, ap, card("Test Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" }));
    let s = cast(s0, ap, ids[0]!);
    s = passAll(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: victim }] }));
    expect(s.players[victim]!.graveyard).toHaveLength(0);
    expect(yard.every((id) => s.objects[id]!.zone === "exile")).toBe(true);
    s.objects[ids[0]!]!.controlledSinceTurn = -1;
    s = passUntil(s, "beginCombat", ap);
    s = passAll(run(s, planActivate(s, ap, ids[0]!, 0, undefined, undefined, [crew])));
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: ids[0]!, defender: opp }] });
    for (let i = 0; i < 40 && s.pending?.kind !== "chooseMay"; i++) {
      if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.pending?.kind).toBe("chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending?.kind).toBe("searchLibrary");
    const pend = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    expect([...pend.cards].sort()).toEqual([yard[0], yard[1]].sort()); // not the sorcery
    s = act(s, { type: "searchLibrary", player: ap, found: [yard[0]!] });
    expect(s.objects[yard[0]!]!.zone).toBe("battlefield");
    expect(s.objects[yard[0]!]!.controller).toBe(ap);
    expect(s.objects[yard[1]!]!.zone).toBe("exile");
  });
});

const jin = scry("transform", [
  { name: "Jin-Gitaxias", type_line: "Legendary Creature — Phyrexian Praetor", mana_cost: "{3}{U}{U}", power: "5", toughness: "5", oracle_text: "Ward {2}\nWhenever you cast a noncreature spell with mana value 3 or greater, draw a card.\n{3}{U}: Exile Jin-Gitaxias, then return it to the battlefield transformed under its owner's control. Activate only as a sorcery and only if you have seven or more cards in hand." },
  { name: "The Great Synthesis", type_line: "Enchantment — Saga", oracle_text: "(As this Saga enters and after your draw step, add a lore counter.)\nI — Draw cards equal to the number of cards in your hand. You have no maximum hand size for as long as you control this Saga.\nII — Return all non-Phyrexian creatures to their owners' hands.\nIII — You may cast any number of spells from your hand without paying their mana costs. Exile this Saga, then return it to the battlefield (front face up)." },
]);
const vorinclex = scry("transform", [
  { name: "Vorinclex", type_line: "Legendary Creature — Phyrexian Praetor", mana_cost: "{3}{G}{G}", power: "6", toughness: "6", oracle_text: "Reach, trample\nWhen Vorinclex enters, search your library for up to two Forest cards, reveal them, put them into your hand, then shuffle.\n{6}{G}{G}: Exile Vorinclex, then return it to the battlefield transformed under its owner's control. Activate only as a sorcery." },
  { name: "The Grand Evolution", type_line: "Enchantment — Saga", oracle_text: "(As this Saga enters and after your draw step, add a lore counter.)\nI — Mill ten cards. Put up to two creature cards from among the milled cards onto the battlefield.\nII — Distribute seven +1/+1 counters among any number of target creatures you control.\nIII — Until end of turn, creatures you control gain \"{1}: This creature fights target creature you don't control.\" Exile this Saga, then return it to the battlefield (front face up)." },
]);

describe("The Great Synthesis and The Grand Evolution (Saga back faces, CR 714)", () => {
  const filler = card("Test Filler", "Sorcery", "{5}{U}", { oracleText: "Draw a card." });
  const bigBear = card("Big Bear", "Creature — Bear", "{4}{G}", { power: "4", toughness: "4" });
  const toMain = (s: GameState, ap: number) => settleBots(passUntil(passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!), "main1", ap));
  it("I draws as many as in hand, with no maximum hand size; II bounces non-Phyrexians; III casts spells free, then Jin-Gitaxias returns", () => {
    supported(jin);
    const { s: s0, ap, ids } = setup(Array.from({ length: 7 }, () => filler));
    const j = putOnBattlefield(s0, ap, jin);
    const bear = putOnBattlefield(s0, ap, card("Test Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    const h0 = s0.players[ap]!.hand.length;
    let s = settleBots(run(s0, planActivate(s0, ap, j, 0)));
    const saga = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId] && characteristics(s, s.objects[id]!).name === "The Great Synthesis")!;
    expect(saga).toBeDefined();
    expect(s.players[ap]!.hand).toHaveLength(2 * h0);
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    expect(s.players[ap]!.hand).toHaveLength(2 * h0); // no discard at cleanup
    s = toMain(s, ap);
    expect(s.objects[bear]!.zone).toBe("hand"); // II
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    s = passUntil(s, "main1", ap);
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseOption"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong" });
    expect((s.pending as { prompt: string }).prompt).toMatch(/from your hand/);
    s = act(s, { type: "chooseOption", player: ap, choice: ids[0]! });
    s = act(s, { type: "castSpell", player: ap, objectId: ids[0]! });
    s = act(s, { type: "chooseOption", player: ap, choice: bear });
    s = act(s, { type: "castSpell", player: ap, objectId: bear });
    s = act(s, { type: "chooseOption", player: ap, choice: "none" });
    expect(s.stack.map((x) => x.objectId)).toEqual(expect.arrayContaining([ids[0], bear]));
    const back = s.battlefield.map((id) => s.objects[id]!).find((o) => characteristics(s, o).name === "Jin-Gitaxias");
    expect(back, logText(s)).toBeDefined();
    expect(s.battlefield.includes(saga) && characteristics(s, s.objects[saga]!).name === "The Great Synthesis").toBe(false);
  });
  it("The Grand Evolution I: mill ten, then up to two creature cards from among them onto the battlefield", () => {
    supported(vorinclex);
    const { s: s0, ap } = setup([]);
    const v = putOnBattlefield(s0, ap, vorinclex);
    const lib = s0.players[ap]!.library;
    lib.splice(0, 10, ...[bigBear, bigBear, bigBear, filler, filler, filler, filler, filler, filler, filler].map((d) => onTop(s0, ap, d)).reverse());
    s0.players[ap]!.library = [...new Set(s0.players[ap]!.library)];
    let s = run(s0, planActivate(s0, ap, v, 0));
    for (let i = 0; i < 30 && s.pending?.kind !== "searchLibrary"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const pend = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    expect(pend).toMatchObject({ max: 2, min: 0 });
    expect(pend.cards.every((id) => s.cards[s.objects[id]!.cardId]!.name === "Big Bear")).toBe(true);
    s = act(s, { type: "searchLibrary", player: ap, found: pend.cards.slice(0, 2) });
    expect(pend.cards.slice(0, 2).every((id) => s.objects[id]!.zone === "battlefield" && s.objects[id]!.controller === ap)).toBe(true);
  });
});

const takeTheBait = card("Take the Bait", "Instant", "{2}{R}{W}", {
  oracleText: "Cast this spell only during combat on an opponent's turn.\nPrevent all combat damage that would be dealt to you and planeswalkers you control this turn. Untap all attacking creatures and goad them. After this phase, there is an additional combat phase.",
});

describe("Take the Bait: the attackers untap, goaded, and attack again in an additional combat (CR 701.15)", () => {
  it("no combat damage to you; in the new combat the goaded creature can't attack you, only someone else", () => {
    supported(takeTheBait);
    const { s: s0, ap, ids, opp } = setup([takeTheBait]);
    const third = s0.turnOrder[(s0.turnOrder.indexOf(opp) + 1) % 4]!;
    const bear = putOnBattlefield(s0, opp, card("Test Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    let s = passUntil(s0, "declareAttackers", opp);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: bear, defender: ap }] });
    for (let i = 0; i < 10 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const life = s.players[ap]!.life;
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 10 && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[bear]!.tapped).toBe(false);
    expect(s.objects[bear]!.attacking).toBe(ap); // still attacking (rulings)
    s = passUntil(s, "endCombat", opp);
    expect(s.players[ap]!.life).toBe(life);
    s = passUntil(s, "declareAttackers", opp);
    expect(s.combatsThisTurn).toBe(2);
    expect(() => act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: bear, defender: ap }] })).toThrow();
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: bear, defender: third }] });
    expect(s.objects[bear]!.attacking).toBe(third);
  });
});

const sisay = card("Sisay, Weatherlight Captain", "Legendary Creature — Human Soldier", "{2}{W}", {
  power: "2",
  toughness: "2",
  oracleText: "Sisay gets +1/+1 for each color among other legendary permanents you control.\n{W}{U}{B}{R}{G}: Search your library for a legendary permanent card with mana value less than Sisay's power, put that card onto the battlefield, then shuffle.",
});

describe("Sisay, Weatherlight Captain: colors among other legendaries; a search for mana value less than its power", () => {
  it("+3/+3 for three colors; the search offers legendary permanent cards with mana value 4 or less", () => {
    supported(sisay);
    const { s: s0, ap } = setup([]);
    const si = putOnBattlefield(s0, ap, sisay);
    putOnBattlefield(s0, ap, card("Test Azorius Legend", "Legendary Creature — Human", "{W}{U}", { power: "2", toughness: "2" }));
    putOnBattlefield(s0, ap, card("Test Black Relic", "Legendary Artifact", "{B}"));
    putOnBattlefield(s0, ap, card("Test Red Bear", "Creature — Bear", "{R}", { power: "1", toughness: "1" })); // not legendary
    expect(power(s0, s0.objects[si]!)).toBe(5);
    const four = onTop(s0, ap, card("Test Four Legend", "Legendary Creature — Elf", "{3}{G}", { power: "4", toughness: "4" }));
    const five = onTop(s0, ap, card("Test Five Legend", "Legendary Creature — Elf", "{4}{G}", { power: "5", toughness: "5" }));
    onTop(s0, ap, card("Test Plain Four", "Creature — Elf", "{3}{G}", { power: "4", toughness: "4" }));
    let s = run(s0, planActivate(s0, ap, si, 0));
    for (let i = 0; i < 10 && s.pending?.kind !== "searchLibrary"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const pend = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    expect(pend.cards).toContain(four);
    expect(pend.cards).not.toContain(five);
    expect(pend.what).toMatch(/mana value 4 or less/);
    s = act(s, { type: "searchLibrary", player: ap, found: [four] });
    expect(s.objects[four]!.zone).toBe("battlefield");
  });
  it("with power 0, nothing can be found (less than 0)", () => {
    const { s: s0, ap } = setup([]);
    const si = putOnBattlefield(s0, ap, sisay);
    addEffect(s0, ap, [si], [{ kind: "modifyPT", power: -2, toughness: 0 }], "game");
    onTop(s0, ap, card("Test Zero Legend", "Legendary Artifact", "{0}"));
    expect(power(s0, s0.objects[si]!)).toBe(0);
    let s = run(s0, planActivate(s0, ap, si, 0));
    for (let i = 0; i < 10 && s.pending?.kind !== "searchLibrary" && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const pend = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }> | null;
    expect(pend?.cards ?? []).toHaveLength(0);
  });
});

const commitMemory = scry(
  "split",
  [
    { name: "Commit", mana_cost: "{3}{U}", type_line: "Instant", oracle_text: "Put target spell or nonland permanent into its owner's library second from the top." },
    { name: "Memory", mana_cost: "{4}{U}{U}", type_line: "Sorcery", oracle_text: "Aftermath (Cast this spell only from your graveyard. Then exile it.)\nEach player shuffles their hand and graveyard into their library, then draws seven cards." },
  ],
  { keywords: ["Aftermath"] },
);

describe("Commit: a spell or nonland permanent goes second from the top of its owner's library", () => {
  const sorcery = card("Test Sorcery", "Sorcery", "{1}{R}", { oracleText: "Draw a card." });
  it("a spell leaves the stack without resolving (not countered)", () => {
    supported(commitMemory);
    const { s: s0, ap, ids } = setup([sorcery, commitMemory]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    const item = s.stack.at(-1)!;
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: item.id }], undefined, "auto", undefined, { face: 0 }));
    s = passAll(s);
    expect(s.stack).toHaveLength(0);
    expect(s.players[ap]!.library[1]).toBe(ids[0]);
  });
  it("a permanent: an opponent's creature goes second from the top of their library", () => {
    const { s: s0, ap, ids, opp } = setup([commitMemory]);
    const bear = putOnBattlefield(s0, opp, card("Test Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    const s = passAll(run(s0, planCast(s0, ap, ids[0]!, [target(bear)], undefined, "auto", undefined, { face: 0 })));
    expect(s.players[opp]!.library[1]).toBe(bear);
  });
});
