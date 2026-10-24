// Round 139: the most played cards, in popularity order.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { blockProblem, botActions, characteristics, controllerOf, isFullySupported, legalActions, moveObject, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty or something asks a player to choose. */
const resolveAll = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const nextOf = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % 4]!;
const prevOf = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 3) % 4]!;
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).name.replace(/ Token$/, "") === name);
const inZone = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  return id;
};
/** `pid` attacks with `attacks` from its first main phase; the attack triggers go on the stack. */
const attack = (s: GameState, pid: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) => act(passUntil(s, "declareAttackers", pid), { type: "declareAttackers", player: pid, attacks });
/** On to combat damage with no blocks; the damage triggers go on the stack. */
const toDamage = (s: GameState) => {
  for (let i = 0; i < 60 && s.step !== "combatDamage"; i++) {
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
    else if (s.pending) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};

describe("Rikku, Resourceful Guardian", () => {
  const rikku = card("Rikku, Resourceful Guardian", "Legendary Creature — Human Artificer", "{2}{U}", { power: "2", toughness: "3", keywords: ["Steal"], oracleText: "Whenever you put one or more counters on a creature, until end of turn, that creature can't be blocked by creatures your opponents control.\nSteal — {1}, {T}: Move a counter from target creature an opponent controls onto target creature you control. Activate only as a sorcery." });
  const growth = card("Test Growth", "Instant", "{G}", { oracleText: "Put a +1/+1 counter on target creature." });

  it("is fully supported", () => supported(rikku, growth));

  it("Steal moves a counter from an opponent's creature onto yours, which then can't be blocked by their creatures", () => {
    const { s: s0, ap } = setup([]);
    const opp = nextOf(s0, ap);
    const r = putOnBattlefield(s0, ap, rikku);
    const mine = putOnBattlefield(s0, ap, bear({ name: "Test Mine" }));
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Test Theirs" }));
    const blocker = putOnBattlefield(s0, opp, bear({ name: "Test Blocker" }));
    s0.objects[theirs]!.counters["+1/+1"] = 2;
    let s = resolveAll(run(s0, planActivate(s0, ap, r, 0, [{ kind: "object", id: theirs }, { kind: "object", id: mine }])));
    expect(s.objects[theirs]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[mine]!.counters["+1/+1"]).toBe(1);
    expect(pt(s, mine)).toBe("3/3");
    expect(s.objects[r]!.tapped).toBe(true);
    s = attack(s, ap, [{ attacker: mine, defender: opp }]);
    expect(blockProblem(s, s.objects[blocker]!, s.objects[mine]!)).toMatch(/can't be blocked by creatures your opponents control/);
    // Only until end of turn.
    s = passUntil(s, "main1", opp);
    expect(characteristics(s, s.objects[mine]!).cantBeBlockedBy).toEqual([]);
  });

  it("not as a sorcery-speed ability on someone else's turn, and not for counters an opponent puts", () => {
    const { s: s0, ap } = setup([]);
    const opp = nextOf(s0, ap);
    const r = putOnBattlefield(s0, ap, rikku);
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Test Theirs" }));
    const growthId = inZone(s0, opp, growth, "hand");
    s0.objects[theirs]!.counters["+1/+1"] = 1;
    let s = passUntil(s0, "main1", opp);
    expect(legalActions(s, ap).some((a) => a.type === "activateAbility" && a.objectId === r)).toBe(false);
    for (const l of [0, 1]) putOnBattlefield(s, opp, card(`Test Forest ${l}`, "Basic Land — Forest"));
    s = resolveAll(run(s, planCast(s, opp, growthId, [{ kind: "object", id: theirs }])));
    expect(s.objects[theirs]!.counters["+1/+1"]).toBe(2);
    expect(characteristics(s, s.objects[theirs]!).cantBeBlockedBy).toEqual([]);
  });

  it("a counter you put on an opponent's creature: only your creatures can block it", () => {
    const { s: s0, ap, ids } = setup([growth]);
    const opp = nextOf(s0, ap);
    const other = nextOf(s0, opp);
    putOnBattlefield(s0, ap, rikku);
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Test Theirs" }));
    const mineBlocker = putOnBattlefield(s0, ap, bear({ name: "Test Mine" }));
    const otherBlocker = putOnBattlefield(s0, other, bear({ name: "Test Other" }));
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: theirs }])));
    expect(s.objects[theirs]!.counters["+1/+1"]).toBe(1);
    s.objects[theirs]!.attacking = other;
    expect(blockProblem(s, s.objects[otherBlocker]!, s.objects[theirs]!, other)).toMatch(/can't be blocked/);
    s.objects[theirs]!.attacking = ap;
    expect(blockProblem(s, s.objects[mineBlocker]!, s.objects[theirs]!, ap)).toBeNull();
  });
});

describe("Rikku, Resourceful Guardian: bots", () => {
  const rikku = card("Rikku, Resourceful Guardian", "Legendary Creature — Human Artificer", "{2}{U}", { power: "2", toughness: "3", keywords: ["Steal"], oracleText: "Whenever you put one or more counters on a creature, until end of turn, that creature can't be blocked by creatures your opponents control.\nSteal — {1}, {T}: Move a counter from target creature an opponent controls onto target creature you control. Activate only as a sorcery." });

  it("a bot steals a +1/+1 counter for one of its creatures, and not from a creature without one", () => {
    const { s: s0, ap } = setup([]);
    const opp = nextOf(s0, ap);
    putOnBattlefield(s0, ap, rikku);
    putOnBattlefield(s0, opp, bear({ name: "Test Theirs" }));
    /** The bot plays out its second main phase; whether it stole. */
    const main2 = (x: GameState) => {
      x = passUntil(x, "main2", ap);
      for (let i = 0; i < 40 && x.step === "main2" && x.activePlayer === ap; i++) x = run(x, botActions(x, waitingOn(x)!));
      return x;
    };
    let s = main2(s0);
    expect(s.log.some((l) => /activates Rikku/.test(l.text))).toBe(false);
    const theirs = named(s0, opp, "Test Theirs")[0]!;
    s0.objects[theirs]!.counters["+1/+1"] = 1;
    s = main2(s0);
    expect(s.log.some((l) => /activates Rikku/.test(l.text))).toBe(true);
    expect(s.objects[theirs]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});

describe("Yes Man, Personal Securitron", () => {
  const yesMan = card("Yes Man, Personal Securitron", "Legendary Artifact Creature — Robot", "{2}{W}", { power: "2", toughness: "2", keywords: ["Wild Card"], oracleText: "{T}: Target opponent gains control of Yes Man. When they do, you draw two cards and put a quest counter on Yes Man. Activate only during your turn.\nWild Card — When Yes Man leaves the battlefield, its owner creates a tapped 1/1 white Soldier creature token for each quest counter on it." });

  it("is fully supported", () => supported(yesMan));

  it("gives itself to an opponent: you draw two and it gets a quest counter; leaving, its owner gets a Soldier per counter", () => {
    const { s: s0, ap } = setup([]);
    const opp = nextOf(s0, ap);
    const y = putOnBattlefield(s0, ap, yesMan);
    const hand = s0.players[ap]!.hand.length;
    let s = resolveAll(run(s0, planActivate(s0, ap, y, 0, [{ kind: "player", id: opp }])));
    expect(controllerOf(s, s.objects[y]!)).toBe(opp);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(s.objects[y]!.counters.quest).toBe(1);
    // It leaves under the opponent's control: its owner creates the tokens, tapped.
    moveObject(s, y, "graveyard");
    s = resolveAll(s);
    const soldiers = named(s, ap, "Soldier");
    expect(soldiers).toHaveLength(1);
    expect(s.objects[soldiers[0]!]!.tapped).toBe(true);
    expect(named(s, opp, "Soldier")).toHaveLength(0);
  });

  it("only during your turn; gone before it resolves, nothing happens (no cards)", () => {
    const { s: s0, ap } = setup([]);
    const opp = nextOf(s0, ap);
    const y = putOnBattlefield(s0, ap, yesMan);
    const hand = s0.players[ap]!.hand.length;
    let s = run(s0, planActivate(s0, ap, y, 0, [{ kind: "player", id: opp }]));
    moveObject(s, y, "graveyard");
    s = resolveAll(s);
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(named(s, ap, "Soldier")).toHaveLength(0);
    // On an opponent's turn it can't be activated.
    const { s: t0, ap: ap2 } = setup([]);
    const opp2 = nextOf(t0, ap2);
    const y2 = putOnBattlefield(t0, ap2, yesMan);
    const t = passUntil(t0, "main1", opp2);
    expect(planActivate(t, ap2, y2, 0, [{ kind: "player", id: opp2 }])).toBeNull();
  });
});

describe("Baldin, Century Herdmaster", () => {
  const baldin = card("Baldin, Century Herdmaster", "Legendary Creature — Human Warrior", "{4}{W}{W}", { power: "0", toughness: "7", oracleText: "During your turn, each creature assigns combat damage equal to its toughness rather than its power.\nWhenever Baldin attacks, up to one hundred target creatures each get +0/+X until end of turn, where X is the number of cards in your hand." });

  it("is fully supported", () => supported(baldin));

  it("any number of target creatures (up to one hundred) get +0/+X, X the cards in your hand", () => {
    const { s: s0, ap } = setup([]);
    const opp = nextOf(s0, ap);
    const b = putOnBattlefield(s0, ap, baldin);
    const mine = [1, 2, 3].map((k) => putOnBattlefield(s0, ap, bear({ name: `Test Bear ${k}` })));
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Test Theirs" }));
    const x = s0.players[ap]!.hand.length;
    let s = attack(s0, ap, [{ attacker: b, defender: opp }]);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = act(s, { type: "chooseTargets", player: ap, targets: [...mine, b].map((id) => ({ kind: "object" as const, id })) });
    s = resolveAll(s);
    for (const id of mine) expect(pt(s, id)).toBe(`2/${2 + x}`);
    expect(pt(s, b)).toBe(`0/${7 + x}`);
    expect(pt(s, theirs)).toBe("2/2");
  });

  it("a bot gives its own creatures the toughness", () => {
    const { s: s0, ap } = setup([]);
    const opp = nextOf(s0, ap);
    const b = putOnBattlefield(s0, ap, baldin);
    const mine = putOnBattlefield(s0, ap, bear({ name: "Test Bear" }));
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Test Theirs" }));
    const s = attack(s0, ap, [{ attacker: b, defender: opp }]);
    const acts = botActions(s, ap);
    const choose = acts.find((a) => a.type === "chooseTargets") as Extract<Action, { type: "chooseTargets" }> | undefined;
    expect(choose).toBeTruthy();
    const ids = choose!.targets.flatMap((t) => (t.kind === "object" ? [t.id] : []));
    expect(ids).toContain(mine);
    expect(ids).not.toContain(theirs);
  });
});

describe("Broodcaller Scourge", () => {
  const scourge = card("Broodcaller Scourge", "Creature — Dragon", "{5}{G}{G}", { power: "5", toughness: "7", keywords: ["Flying"], oracleText: "Flying\nWhenever one or more Dragons you control deal combat damage to a player, you may put a permanent card with mana value less than or equal to that damage from your hand onto the battlefield." });
  const five = bear({ name: "Test Five", manaCost: "{4}{G}" });
  const six = bear({ name: "Test Six", manaCost: "{5}{G}" });
  const xSpell = bear({ name: "Test Hydra", manaCost: "{X}{X}{G}{G}{G}{G}{G}{G}" });

  it("is fully supported", () => supported(scourge));

  it("a permanent card with mana value up to the damage the Dragons dealt", () => {
    const { s: s0, ap } = setup([]);
    const opp = nextOf(s0, ap);
    const d = putOnBattlefield(s0, ap, scourge);
    s0.players[ap]!.hand = [];
    const f = inZone(s0, ap, five, "hand");
    inZone(s0, ap, six, "hand");
    inZone(s0, ap, xSpell, "hand");
    let s = resolveAll(toDamage(attack(s0, ap, [{ attacker: d, defender: opp }])));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, fromHand: true, min: 0, max: 1 });
    // A card with {X} in its cost has mana value counting X as 0 in the hand (rulings): 6 here, too much.
    expect((s.pending as { cards: string[] }).cards).toEqual([f]);
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [f] }));
    expect(s.objects[f]!.zone).toBe("battlefield");
  });
});

describe("Heirloom Blade", () => {
  const blade = card("Heirloom Blade", "Artifact — Equipment", "{3}", { keywords: ["Equip"], oracleText: "Equipped creature gets +3/+1.\nWhenever equipped creature dies, you may reveal cards from the top of your library until you reveal a creature card that shares a creature type with it. Put that card into your hand and the rest on the bottom of your library in a random order.\nEquip {1}" });
  const elf = bear({ name: "Test Elf Warrior", typeLine: "Creature — Elf Warrior", subtypes: ["Elf", "Warrior"] });
  const goblin = bear({ name: "Test Goblin Warrior", typeLine: "Creature — Goblin Warrior", subtypes: ["Goblin", "Warrior"] });
  const giant = bear({ name: "Test Giant", typeLine: "Creature — Giant", subtypes: ["Giant"] });
  const kill = card("Test Murder", "Instant", "{B}", { oracleText: "Destroy target creature." });

  it("is fully supported", () => supported(blade, kill));

  it("the equipped creature dies: reveal until a creature card sharing a creature type with it", () => {
    const { s: s0, ap, ids } = setup([kill]);
    const e = putOnBattlefield(s0, ap, elf);
    const bl = putOnBattlefield(s0, ap, blade);
    s0.objects[bl]!.attachedTo = e;
    const gob = inZone(s0, ap, goblin, "library");
    const gi = inZone(s0, ap, giant, "library");
    // The Giant on top, then the Goblin Warrior.
    expect(s0.players[ap]!.library.slice(0, 2)).toEqual([gi, gob]);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: e }])));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = resolveAll(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[gob]!.zone).toBe("hand");
    expect(s.players[ap]!.library[s.players[ap]!.library.length - 1]).toBe(gi); // at the bottom
  });

  it("with no creature type, nothing shares one: the whole library is revealed and goes to the bottom", () => {
    const { s: s0, ap, ids } = setup([kill]);
    const golem = putOnBattlefield(s0, ap, card("Test Blob", "Creature", "{2}", { power: "1", toughness: "1" }));
    const bl = putOnBattlefield(s0, ap, blade);
    s0.objects[bl]!.attachedTo = golem;
    inZone(s0, ap, goblin, "library");
    const hand = s0.players[ap]!.hand.length;
    const lib = s0.players[ap]!.library.length;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: golem }])));
    s = resolveAll(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    expect(s.players[ap]!.library.length).toBe(lib);
  });
});

describe("Bucknard's Everfull Purse and Hithlain Rope: the player to your right gains control", () => {
  const purse = card("Bucknard's Everfull Purse", "Artifact", "{2}", { keywords: ["Treasure"], oracleText: "{1}, {T}: Roll a d4 and create a number of Treasure tokens equal to the result. The player to your right gains control of this artifact." });
  const rope = card("Hithlain Rope", "Artifact", "{2}", { oracleText: "This artifact can't be sacrificed.\n{1}, {T}: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle. The player to your right gains control of this artifact.\n{2}, {T}: Draw a card. The player to your right gains control of this artifact." });

  it("are fully supported", () => supported(purse, rope));

  it("d4 Treasures, then the purse goes to the player before you in turn order (CR 101.4)", () => {
    const { s: s0, ap } = setup([]);
    const p = putOnBattlefield(s0, ap, purse);
    const s = resolveAll(run(s0, planActivate(s0, ap, p, 0)));
    const n = named(s, ap, "Treasure").length;
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(4);
    expect(s.log.some((l) => /rolls? a d4/i.test(l.text) || /d4/.test(l.text))).toBe(true);
    expect(controllerOf(s, s.objects[p]!)).toBe(prevOf(s, ap));
  });

  it("the player to your right skips a player who has left the game", () => {
    const { s: s0, ap } = setup([]);
    const r = putOnBattlefield(s0, ap, rope);
    s0.players[prevOf(s0, ap)]!.lost = true;
    const s = resolveAll(run(s0, planActivate(s0, ap, r, 1)));
    expect(controllerOf(s, s.objects[r]!)).toBe(prevOf(s0, prevOf(s0, ap)));
  });
});

describe("Gadrak, the Crown-Scourge and Rise of the Dread Marn: nontoken creatures that died this turn", () => {
  const gadrak = card("Gadrak, the Crown-Scourge", "Legendary Creature — Dragon", "{2}{R}", { power: "5", toughness: "4", keywords: ["Flying", "Treasure"], oracleText: "Flying\nGadrak can't attack unless you control four or more artifacts.\nAt the beginning of your end step, create a Treasure token for each nontoken creature that died this turn. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")" });
  const marn = card("Rise of the Dread Marn", "Instant", "{2}{B}", { keywords: ["Foretell"], oracleText: "Create X 2/2 black Zombie Berserker creature tokens, where X is the number of nontoken creatures that died this turn.\nForetell {B} (During your turn, you may pay {2} and exile this card from your hand face down. Cast it on a later turn for its foretell cost.)" });
  const wrath = card("Test Wrath", "Sorcery", "{2}{W}{W}", { oracleText: "Destroy all creatures." });
  const spirits = card("Test Spirits", "Sorcery", "{1}{W}", { oracleText: "Create two 1/1 white Spirit creature tokens." });

  it("are fully supported", () => supported(gadrak, marn, wrath, spirits));

  it("counts the nontoken creatures that died, not the tokens", () => {
    const { s: s0, ap, ids } = setup([spirits, wrath, marn]);
    const opp = nextOf(s0, ap);
    putOnBattlefield(s0, opp, bear({ name: "Test Bear 1" }));
    putOnBattlefield(s0, opp, bear({ name: "Test Bear 2" }));
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(named(s, ap, "Spirit")).toHaveLength(2);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    s = resolveAll(run(s, planCast(s, ap, ids[2]!)));
    expect(named(s, ap, "Zombie Berserker")).toHaveLength(2);
    // Gadrak, put on the battlefield afterwards, still counts the whole turn (rulings).
    putOnBattlefield(s, ap, gadrak);
    s = resolveAll(passUntil(s, "end", ap));
    s = resolveAll(s);
    expect(named(s, ap, "Treasure")).toHaveLength(2);
  });
});

describe("Firespitter Whelp: a noncreature or Dragon spell", () => {
  const whelp = card("Firespitter Whelp", "Creature — Dragon", "{2}{R}", { power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying\nWhenever you cast a noncreature or Dragon spell, this creature deals 1 damage to each opponent." });
  const shock = card("Test Shock", "Instant", "{R}", { oracleText: "Draw a card." });
  const dragon = card("Test Dragon", "Creature — Dragon", "{1}{R}", { power: "2", toughness: "2" });
  const goblin = card("Test Goblin", "Creature — Goblin", "{R}", { power: "1", toughness: "1" });

  it("is fully supported", () => supported(whelp));

  it("triggers on a noncreature spell and on a Dragon creature spell, not on another creature spell", () => {
    const { s: s0, ap, ids } = setup([shock, dragon, goblin]);
    const opp = nextOf(s0, ap);
    putOnBattlefield(s0, ap, whelp);
    const life = s0.players[opp]!.life;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[opp]!.life).toBe(life - 1);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(s.players[opp]!.life).toBe(life - 2);
    s = resolveAll(run(s, planCast(s, ap, ids[2]!)));
    expect(s.players[opp]!.life).toBe(life - 2);
  });
});

describe("Rug of Smothering", () => {
  const rug = card("Rug of Smothering", "Artifact Creature — Construct", "{5}", { power: "4", toughness: "6", oracleText: "Flying\nWhenever a player casts a spell, they lose 1 life for each spell they've cast this turn.", keywords: ["Flying"] });
  const opt = card("Test Opt", "Instant", "{U}", { oracleText: "Draw a card." });

  it("is fully supported", () => supported(rug));

  it("the caster loses 1 life for each spell they've cast this turn, this one included", () => {
    const { s: s0, ap, ids } = setup([opt, opt, opt]);
    putOnBattlefield(s0, nextOf(s0, ap), rug);
    const life = s0.players[ap]!.life;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.life).toBe(life - 1);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(s.players[ap]!.life).toBe(life - 3);
    s = resolveAll(run(s, planCast(s, ap, ids[2]!)));
    expect(s.players[ap]!.life).toBe(life - 6);
  });
});

describe("Hare Apparent", () => {
  const hare = card("Hare Apparent", "Creature — Rabbit Noble", "{1}{W}", { power: "2", toughness: "2", oracleText: "When this creature enters, create a number of 1/1 white Rabbit creature tokens equal to the number of other creatures you control named Hare Apparent.\nA deck can have any number of cards named Hare Apparent." });

  it("is fully supported", () => supported(hare));

  it("a Rabbit for each other creature you control named Hare Apparent", () => {
    const { s: s0, ap, ids } = setup([hare]);
    const opp = nextOf(s0, ap);
    putOnBattlefield(s0, ap, hare);
    putOnBattlefield(s0, ap, hare);
    putOnBattlefield(s0, opp, hare);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(named(s, ap, "Rabbit")).toHaveLength(2);
  });
});

describe("\"For each ..., create\" after a trigger's condition", () => {
  const cadira = card("Cadira, Caller of the Small", "Legendary Creature — Orc Ranger", "{1}{G}{W}", { power: "3", toughness: "3", keywords: ["Trample"], oracleText: "Trample\nWhenever Cadira deals combat damage to a player, for each token you control, create a 1/1 white Rabbit creature token." });
  const captain = card("Captain America, Liberator", "Legendary Creature — Human Soldier Hero", "{3}{W}{W}", { power: "5", toughness: "5", oracleText: "When Captain America enters, you may search your library for an Equipment card with mana value 3 or less, put it onto the battlefield, then shuffle.\nWhenever Captain America attacks, for each Equipment attached to him, create a 1/1 white Soldier creature token." });
  const hatchery = card("Eumidian Hatchery", "Land", "", { oracleText: "{T}, Pay 1 life: Add {B}. Put a hatchling counter on this land.\nWhen this land is put into a graveyard from the battlefield, for each hatchling counter on it, create a 1/1 black Insect creature token with flying." });
  const sword = card("Test Sword", "Artifact — Equipment", "{1}", { keywords: ["Equip"], oracleText: "Equip {1}" });

  it("are fully supported", () => supported(cadira, captain, hatchery));

  it("Cadira: a Rabbit for each token you control", () => {
    const { s: s0, ap } = setup([]);
    const opp = nextOf(s0, ap);
    const c = putOnBattlefield(s0, ap, cadira);
    for (let k = 0; k < 2; k++) s0.objects[putOnBattlefield(s0, ap, bear({ name: "Rabbit" }))]!.isToken = true;
    const s = resolveAll(toDamage(attack(s0, ap, [{ attacker: c, defender: opp }])));
    expect(named(s, ap, "Rabbit")).toHaveLength(4);
  });

  it("Captain America: a Soldier for each Equipment attached to him", () => {
    const { s: s0, ap } = setup([]);
    const opp = nextOf(s0, ap);
    const c = putOnBattlefield(s0, ap, captain);
    for (const k of [1, 2]) s0.objects[putOnBattlefield(s0, ap, { ...sword, oracleId: `${sword.oracleId}-${k}` })]!.attachedTo = c;
    const s = resolveAll(attack(s0, ap, [{ attacker: c, defender: opp }]));
    expect(named(s, ap, "Soldier")).toHaveLength(2);
  });

  it("Eumidian Hatchery: an Insect for each hatchling counter it had", () => {
    const { s: s0, ap } = setup([]);
    const h = putOnBattlefield(s0, ap, hatchery);
    s0.objects[h]!.counters.hatchling = 3;
    moveObject(s0, h, "graveyard");
    const s = resolveAll(s0);
    expect(named(s, ap, "Insect")).toHaveLength(3);
  });
});

describe("Traxos, Scourge of Kroog", () => {
  const traxos = card("Traxos, Scourge of Kroog", "Legendary Artifact Creature — Dragon Construct", "{4}", { power: "7", toughness: "7", keywords: ["Trample"], oracleText: "Trample\nTraxos enters tapped and doesn't untap during your untap step.\nWhenever you cast a historic spell, untap Traxos. (Artifacts, legendaries, and Sagas are historic.)" });

  it("is fully supported", () => supported(traxos));

  it("enters tapped and stays tapped through your untap step", () => {
    const { s: s0, ap, ids } = setup([traxos]);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[0]!]!.tapped).toBe(true);
    s = passUntil(passUntil(s, "upkeep", nextOf(s, ap)), "main1", ap);
    expect(s.objects[ids[0]!]!.tapped).toBe(true);
  });
});

describe("Indulgent Tormentor", () => {
  const tormentor = card("Indulgent Tormentor", "Creature — Demon", "{3}{B}{B}", { power: "5", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nAt the beginning of your upkeep, draw a card unless target opponent sacrifices a creature of their choice or pays 3 life." });

  it("is fully supported", () => supported(tormentor));

  it("the opponent chooses: sacrifice a creature, pay 3 life, or let you draw", () => {
    const { s: s0, ap } = setup([]);
    const opp = nextOf(s0, ap);
    putOnBattlefield(s0, ap, tormentor);
    const b = putOnBattlefield(s0, opp, bear({ name: "Test Bear" }));
    let s = passUntil(passUntil(s0, "draw"), "upkeep", ap);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "punisher" });
    const labels = (s.pending as { labels: string[] }).labels;
    expect(labels).toHaveLength(3);
    const hand = s.players[ap]!.hand.length;
    // They let you draw.
    s = resolveAll(act(s, { type: "chooseOption", player: opp, choice: "none" }));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.objects[b]!.zone).toBe("battlefield");
  });
});
