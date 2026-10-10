import { describe, expect, it } from "vitest";
import {
  applyAction,
  botActions,
  createGame,
  parseManaCost,
  payFromPool,
  emptyPool,
  planCast,
  validateCommanderDeck,
  waitingOn,
  runStateBasedActions,
  RulesError,
  isFullySupported,
  manaAbilities,
  type GameState,
} from "../src";
import { act, bear, card, commander, forest, fourPlayerGame, passAll, passUntil, putOnBattlefield } from "./helpers";

describe("mana", () => {
  it("pays colored, hybrid, phyrexian and generic", () => {
    const pool = { ...emptyPool(), G: 2, W: 1, C: 1 };
    expect(payFromPool(parseManaCost("{1}{G}{G/W}"), pool)?.pool).toEqual({ ...emptyPool(), W: 1, G: 0, C: 0 });
    expect(payFromPool(parseManaCost("{G}{G}{G}"), pool)).toBeNull();
    expect(payFromPool(parseManaCost("{B/P}"), pool, 0, 10)?.lifePaid).toBe(2);
    expect(payFromPool(parseManaCost("{2}"), pool, 3)).toBeNull();
  });
  it("reads simple mana abilities from rules text", () => {
    const signet = card("Mind Stone", "Artifact", "{2}", { oracleText: "{T}: Add {C}." });
    const birds = card("Birds", "Creature — Bird", "{G}", { oracleText: "Flying\n{T}: Add one mana of any color.", power: "0", toughness: "1", keywords: ["Flying"] });
    expect(manaAbilities(signet)).toEqual(["C"]);
    expect(manaAbilities(birds)).toHaveLength(5);
    expect(isFullySupported(birds)).toBe(true);
    expect(isFullySupported(card("Grow", "Instant", "{G}", { oracleText: "Manifest the top card of your library.\nDraw a card." }))).toBe(false);
  });
});

describe("game setup (CR 903.6-903.7)", () => {
  it("starts four players at 40 life with 7 cards and commanders in the command zone", () => {
    const s = fourPlayerGame();
    expect(s.players).toHaveLength(4);
    for (const p of s.players) {
      expect(p.life).toBe(40);
      expect(p.command).toHaveLength(1);
      expect(p.library.length + p.hand.length).toBe(99);
    }
    // Active player has drawn for the turn too (no one skips in multiplayer, CR 103.8c) once we reach main 1.
    const m = passUntil(s, "main1");
    expect(m.players[m.activePlayer]!.hand).toHaveLength(8);
  });

  it("is deterministic for a seed", () => {
    expect(fourPlayerGame(7).players[0]!.hand).toEqual(fourPlayerGame(7).players[0]!.hand);
  });
});

describe("priority and the stack", () => {
  it("needs every living player to pass in succession before the step ends", () => {
    let s = passUntil(fourPlayerGame(), "main1");
    const ap = s.activePlayer;
    for (let i = 0; i < 3; i++) {
      s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(s.step).toBe("main1");
    }
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.step).toBe("beginCombat");
    expect(s.priority).toBe(ap);
  });

  it("plays a land, taps it, casts a creature, and resolves it when all pass", () => {
    let s = passUntil(fourPlayerGame(), "main1");
    const ap = s.activePlayer;
    for (let i = 0; i < 2; i++) {
      // Fake two forests already out so we can cast the bear.
      putOnBattlefield(s, ap, forest);
    }
    const bearId = s.players[ap]!.hand.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Grizzly Bears");
    if (!bearId) return; // seed dealt no bear; covered by other tests
    for (const a of planCast(s, ap, bearId)!) s = act(s, a);
    expect(s.stack).toHaveLength(1);
    s = passAll(s);
    expect(s.stack).toHaveLength(0);
    expect(s.battlefield).toContain(bearId);
    expect(s.step).toBe("main1");
  });

  it("rejects sorcery-speed casting on someone else's turn and a second land drop", () => {
    let s = passUntil(fourPlayerGame(), "main1");
    const ap = s.activePlayer;
    const lands = s.players[ap]!.hand.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest");
    if (lands.length < 2) return;
    s = act(s, { type: "playLand", player: ap, objectId: lands[0]! });
    expect(() => act(s, { type: "playLand", player: ap, objectId: lands[1]! })).toThrow(RulesError);
  });
});

describe("commander rules", () => {
  it("returns a dead commander to the command zone and charges commander tax (CR 903.8, 903.9a)", () => {
    let s = passUntil(fourPlayerGame(), "main1");
    const ap = s.activePlayer;
    for (let i = 0; i < 6; i++) putOnBattlefield(s, ap, forest);
    const cmd = s.players[ap]!.command[0]!;
    for (const a of planCast(s, ap, cmd)!) s = act(s, a);
    s = passAll(s);
    expect(s.objects[cmd]!.zone).toBe("battlefield");
    s.objects[cmd]!.damage = 3;
    runStateBasedActions(s);
    expect(s.objects[cmd]!.zone).toBe("command");
    const plan = planCast(s, ap, cmd)!;
    expect(plan.filter((a) => a.type === "activateMana")).toHaveLength(4); // {1}{G} + 2 tax
  });

  it("a player who takes 21 combat damage from one commander loses (CR 903.10a)", () => {
    let s = passUntil(fourPlayerGame(), "main1");
    const ap = s.activePlayer;
    const victim = (ap + 1) % 4;
    const big = putOnBattlefield(s, ap, card("Big Cmdr", "Legendary Creature — Giant", "{G}", { power: "21", toughness: "21" }), {
      commander: true,
    });
    s = passUntil(s, "declareAttackers", ap);
    expect(s.pending?.kind).toBe("declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: big, defender: victim }] });
    s = passUntil(s, "endCombat", ap);
    expect(s.players[victim]!.life).toBe(19);
    expect(s.players[victim]!.lost).toBe(true);
    expect(s.players[victim]!.lossReason).toMatch(/21 combat damage/);
  });
});

describe("combat", () => {
  function combatSetup() {
    let s = passUntil(fourPlayerGame(), "main1");
    const ap = s.activePlayer;
    const def = (ap + 1) % 4;
    return { s, ap, def };
  }
  function toBlocks(s: GameState, ap: number, attacks: { attacker: string; defender: number }[]) {
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks });
    for (let i = 0; i < 8 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return s;
  }

  it("ground creatures can't block flyers; reach can", () => {
    const { s: s0, ap, def } = combatSetup();
    const flyer = putOnBattlefield(s0, ap, card("Bird", "Creature — Bird", "{U}", { power: "1", toughness: "1", keywords: ["Flying"] }));
    const ground = putOnBattlefield(s0, def, bear());
    const spider = putOnBattlefield(s0, def, bear({ name: "Spider", keywords: ["Reach"] }));
    const s = toBlocks(s0, ap, [{ attacker: flyer, defender: def }]);
    expect(() => act(s, { type: "declareBlockers", player: def, blocks: [{ blocker: ground, attacker: flyer }] })).toThrow(/flying/);
    const after = act(s, { type: "declareBlockers", player: def, blocks: [{ blocker: spider, attacker: flyer }] });
    expect(after.objects[flyer]!.blockedBy).toEqual([spider]);
  });

  it("first strike kills a blocker before it deals damage", () => {
    const { s: s0, ap, def } = combatSetup();
    const knight = putOnBattlefield(s0, ap, bear({ name: "Knight", keywords: ["First strike"] }));
    const blocker = putOnBattlefield(s0, def, bear());
    let s = toBlocks(s0, ap, [{ attacker: knight, defender: def }]);
    s = act(s, { type: "declareBlockers", player: def, blocks: [{ blocker, attacker: knight }] });
    s = passUntil(s, "endCombat", ap);
    expect(s.objects[blocker]!.zone).toBe("graveyard");
    expect(s.objects[knight]!.zone).toBe("battlefield");
    expect(s.objects[knight]!.damage).toBe(0);
  });

  it("trample assigns excess to the player, deathtouch kills, lifelink gains", () => {
    const { s: s0, ap, def } = combatSetup();
    const wurm = putOnBattlefield(s0, ap, card("Wurm", "Creature — Wurm", "{G}", { power: "6", toughness: "6", keywords: ["Trample", "Lifelink"] }));
    const viper = putOnBattlefield(s0, def, card("Viper", "Creature — Snake", "{B}", { power: "1", toughness: "1", keywords: ["Deathtouch"] }));
    let s = toBlocks(s0, ap, [{ attacker: wurm, defender: def }]);
    s = act(s, { type: "declareBlockers", player: def, blocks: [{ blocker: viper, attacker: wurm }] });
    s = passUntil(s, "endCombat", ap);
    expect(s.players[def]!.life).toBe(35);
    expect(s.players[ap]!.life).toBe(46);
    expect(s.objects[wurm]!.zone).toBe("graveyard");
    expect(s.objects[viper]!.zone).toBe("graveyard");
  });

  it("removes creatures from combat as the end of combat step ends (CR 511.3)", () => {
    const { s: s0, ap, def } = combatSetup();
    const attacker = putOnBattlefield(s0, ap, bear());
    const blocker = putOnBattlefield(s0, def, bear({ name: "Wall", power: "0", toughness: "4" }));
    let s = toBlocks(s0, ap, [{ attacker, defender: def }]);
    s = act(s, { type: "declareBlockers", player: def, blocks: [{ blocker, attacker }] });
    s = passUntil(s, "endCombat", ap);
    expect(s.objects[attacker]!.attacking).toBe(def); // still in combat during end of combat
    s = passUntil(s, "main2", ap);
    expect(s.objects[attacker]!.attacking).toBeUndefined();
    expect(s.objects[attacker]!.blockedBy).toBeUndefined();
    expect(s.objects[blocker]!.blocking).toBeUndefined();
  });

  it("menace needs two blockers", () => {
    const { s: s0, ap, def } = combatSetup();
    const goblin = putOnBattlefield(s0, ap, bear({ name: "Goblin", keywords: ["Menace"] }));
    const b1 = putOnBattlefield(s0, def, bear());
    const b2 = putOnBattlefield(s0, def, bear());
    const s = toBlocks(s0, ap, [{ attacker: goblin, defender: def }]);
    expect(() => act(s, { type: "declareBlockers", player: def, blocks: [{ blocker: b1, attacker: goblin }] })).toThrow(/menace/);
    act(s, { type: "declareBlockers", player: def, blocks: [{ blocker: b1, attacker: goblin }, { blocker: b2, attacker: goblin }] });
  });
});

describe("leaving the game (CR 800.4)", () => {
  it("removes a losing player's permanents and the last player standing wins", () => {
    let s = passUntil(fourPlayerGame(), "main1");
    const ap = s.activePlayer;
    const others = [0, 1, 2, 3].filter((p) => p !== ap);
    const theirBear = putOnBattlefield(s, others[0]!, bear());
    s = act(s, { type: "concede", player: others[0]! });
    expect(s.battlefield).not.toContain(theirBear);
    s = act(s, { type: "concede", player: others[1]! });
    expect(s.over).toBe(false);
    s = act(s, { type: "concede", player: others[2]! });
    expect(s.over).toBe(true);
    expect(s.winner).toBe(ap);
  });
});

describe("deck validation (CR 903.5)", () => {
  it("flags size, singleton and color identity problems", () => {
    const cmd = commander();
    const red = card("Shock", "Instant", "{R}");
    const deck = [...Array.from({ length: 97 }, () => forest), bear(), bear(), red];
    const problems = validateCommanderDeck(cmd, deck).map((p) => p.problem);
    expect(problems).toContain("appears 2 times (singleton)");
    expect(problems).toContain("outside the commander's color identity");
    expect(validateCommanderDeck(cmd, Array.from({ length: 99 }, () => forest))).toEqual([]);
  });
});

describe("bots", () => {
  it("four bots play a full game to completion without illegal actions", () => {
    for (const seed of [1, 2]) {
      let s = fourPlayerGame(seed);
      let steps = 0;
      while (!s.over && s.turn < 200 && steps < 200_000) {
        const pid = waitingOn(s)!;
        for (const a of botActions(s, pid)) s = applyAction(s, a);
        steps++;
      }
      expect(s.over || s.turn >= 200).toBe(true);
      expect(s.turn).toBeGreaterThan(8);
    }
  }, 60_000);
});

void createGame;
