// Round 134: round 133's gaps (bots use Doubling Cube when it saves mana, and Detection Tower), then the most played cards.

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, island, mountain, passUntil, putOnBattlefield, scry, setup, target } from "./helpers";
import { invalidateCharacteristics } from "../src/layers";
import { setFace } from "../src/faces";
import { botActions, characteristics, isFullySupported, planActivate, planCast, planForetell, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Only these cards stay in `pid`'s hand; the others go to the bottom of the library. */
const onlyInHand = (s: GameState, pid: PlayerId, keep: string[]) => {
  const p = s.players[pid]!;
  for (const x of p.hand.filter((x) => !keep.includes(x))) {
    s.objects[x]!.zone = "library";
    p.library.push(x);
  }
  p.hand = p.hand.filter((x) => keep.includes(x));
};
/** Everyone passes until something asks a player to choose (or the stack is empty). */
const passToPending = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Puts `def` on top of `pid`'s library. */
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  invalidateCharacteristics(s);
  return id;
};
const nextOf = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % 4]!;
const emptyPools = (s: GameState) => {
  for (const p of Object.values(s.players)) p.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
};

describe("Doubling Cube: a bot uses it when it saves mana, not only when nothing else pays", () => {
  const cube = card("Doubling Cube", "Artifact", "{2}", { oracleText: "{3}, {T}: Double the amount of each type of unspent mana you have." });
  const titan = card("Test Titan", "Creature — Giant", "{8}{G}{G}", { power: "10", toughness: "10" });
  /** The Titan in hand and `untapped` of our lands untapped, Forests first. */
  const scene = (withCube: boolean, untapped = 14) => {
    const { s, ap, ids } = setup([titan]);
    emptyPools(s);
    onlyInHand(s, ap, ids);
    s.players[ap]!.landsPlayedThisTurn = 1;
    const lands = s.battlefield.filter((id) => s.objects[id]!.controller === ap).sort((a, b) => Number(s.objects[b]!.cardId.includes("Forest")) - Number(s.objects[a]!.cardId.includes("Forest")));
    lands.forEach((id, i) => (s.objects[id]!.tapped = i >= untapped));
    const cubeId = withCube ? putOnBattlefield(s, ap, cube) : undefined;
    return { s, ap, titan: ids[0]!, cubeId, lands };
  };
  const untappedLands = (s: GameState, lands: string[]) => lands.filter((id) => !s.objects[id]!.tapped).length;

  it("a ten-mana spell: five lands and the Cube's three, doubled, instead of ten lands", () => {
    supported(cube);
    const { s: s0, ap, titan: id, cubeId, lands } = scene(true);
    const acts = botActions(s0, ap);
    expect(acts.some((a) => a.type === "activateMana" && a.objectId === cubeId)).toBe(true);
    const s = run(s0, acts);
    expect(s.stack.map((x) => x.objectId)).toContain(id);
    // 14 lands: 8 tapped (5 + 3), 6 left, where paying from the lands alone leaves 4.
    expect(untappedLands(s, lands)).toBe(6);
  });

  it("without the Cube it's ten lands", () => {
    const { s: s0, ap, titan: id, lands } = scene(false);
    const s = run(s0, botActions(s0, ap));
    expect(s.stack.map((x) => x.objectId)).toContain(id);
    expect(untappedLands(s, lands)).toBe(4);
  });
});

describe("Detection Tower: a bot activates it to target what has hexproof", () => {
  const tower = card("Detection Tower", "Land", "", { oracleText: "{T}: Add {C}.\n{1}, {T}: Until end of turn, your opponents and creatures your opponents control with hexproof can be the targets of spells and abilities you control as though they didn't have hexproof." });
  const troll = card("Test Troll", "Creature — Troll", "{2}{G}", { power: "3", toughness: "3", keywords: ["Hexproof"], oracleText: "Hexproof" });
  const murder = card("Test Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });
  const scene = () => {
    const { s, ap, ids } = setup([murder]);
    emptyPools(s);
    onlyInHand(s, ap, ids);
    s.players[ap]!.landsPlayedThisTurn = 1;
    const opp = nextOf(s, ap);
    // The only creature on the battlefield: the opponent's hexproof Troll.
    for (const id of s.battlefield.filter((x) => s.cards[s.objects[x]!.cardId]!.types.includes("Creature"))) s.battlefield.splice(s.battlefield.indexOf(id), 1);
    const t = putOnBattlefield(s, opp, troll);
    return { s, ap, opp, t, murderId: ids[0]! };
  };

  it("the Tower first, then the spell at the hexproof creature", () => {
    supported(tower);
    const { s: s0, ap, t, murderId } = scene();
    const tw = putOnBattlefield(s0, ap, tower);
    const first = botActions(s0, ap);
    expect(first.some((a) => a.type === "activateAbility" && a.objectId === tw)).toBe(true);
    let s = run(s0, first);
    for (let i = 0; i < 12 && s.stack.length; i++) s = act(s, { type: "passPriority", player: s.priority });
    expect(s.turnRules?.some((r) => r.player === ap && r.rule === "seeHexproof")).toBe(true);
    const next = botActions(s, ap);
    const cast = next.find((a) => a.type === "castSpell");
    expect(cast?.type === "castSpell" && cast.objectId === murderId && cast.targets).toEqual([{ kind: "object", id: t }]);
  });

  it("not when nothing in hand would target it", () => {
    const { s, ap, murderId } = scene();
    const tw = putOnBattlefield(s, ap, tower);
    onlyInHand(s, ap, []);
    expect(murderId).toBeDefined();
    expect(botActions(s, ap).some((a) => a.type === "activateAbility" && a.objectId === tw)).toBe(false);
  });
});

describe("Edgar Markov's Coffin: a Vampire and a bloodline counter each upkeep; three counters transform it", () => {
  const edgar = scry(
    "transform",
    [
      { name: "Edgar, Charmed Groom", mana_cost: "{2}{W}{B}", type_line: "Legendary Creature — Vampire Noble", oracle_text: "Other Vampires you control get +1/+1.\nWhen Edgar dies, return it to the battlefield transformed under its owner's control.", power: "4", toughness: "4" },
      { name: "Edgar Markov's Coffin", type_line: "Legendary Artifact", oracle_text: "At the beginning of your upkeep, create a 1/1 white and black Vampire creature token with lifelink and put a bloodline counter on Edgar Markov's Coffin. Then if there are three or more bloodline counters on it, remove those counters and transform it." },
    ],
  );
  const atUpkeep = (counters: number) => {
    const { s: s0, ap } = setup([]);
    const id = putOnBattlefield(s0, ap, edgar);
    setFace(s0, s0.objects[id]!, 1);
    if (counters) s0.objects[id]!.counters.bloodline = counters;
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "upkeep", nextOf(s0, ap));
    s = passUntil(s, "upkeep", ap);
    s = passToPending(s);
    const tokens = s.battlefield.filter((x) => s.objects[x]!.isToken && s.objects[x]!.controller === ap);
    return { s, id, tokens };
  };

  it("with two counters already: the third makes it Edgar again, the counters gone", () => {
    supported(edgar);
    const { s, id, tokens } = atUpkeep(2);
    expect(tokens).toHaveLength(1);
    const vamp = characteristics(s, s.objects[tokens[0]!]!);
    expect(vamp.subtypes).toContain("Vampire");
    expect(vamp.keywords).toContain("Lifelink");
    // Edgar's +1/+1 for other Vampires now applies to it.
    expect(vamp.power).toBe(2);
    expect(characteristics(s, s.objects[id]!).name).toBe("Edgar, Charmed Groom");
    expect(s.objects[id]!.counters.bloodline ?? 0).toBe(0);
  });

  it("with none: a token and one counter, still the Coffin", () => {
    const { s, id, tokens } = atUpkeep(0);
    expect(tokens).toHaveLength(1);
    expect(characteristics(s, s.objects[id]!).name).toBe("Edgar Markov's Coffin");
    expect(s.objects[id]!.counters.bloodline).toBe(1);
  });
});

describe("Prisoner's Dilemma: each opponent secretly chooses silence or snitch", () => {
  const dilemma = card("Prisoner's Dilemma", "Sorcery", "{3}{R}{R}", { oracleText: "Each opponent secretly chooses silence or snitch, then the choices are revealed. If each opponent chose silence, Prisoner's Dilemma deals 4 damage to each of them. If each opponent chose snitch, Prisoner's Dilemma deals 8 damage to each of them. Otherwise, Prisoner's Dilemma deals 12 damage to each opponent who chose silence.\nFlashback {5}{R}{R}" });
  /** Cast it; the opponents answer in turn order with `words` (by default, as bots). */
  const play = (words?: string[]) => {
    const { s: s0, ap, ids } = setup([dilemma]);
    const opps = [1, 2, 3].map((k) => s0.turnOrder[(s0.turnOrder.indexOf(ap) + k) % 4]!);
    const life = opps.map((p) => s0.players[p]!.life);
    let s = passToPending(run(s0, planCast(s0, ap, ids[0]!)));
    const asked: PlayerId[] = [];
    for (let i = 0; i < 3; i++) {
      expect(s.pending).toMatchObject({ kind: "chooseOption", what: "word", options: ["silence", "snitch"], prompt: "secretly choose silence or snitch" });
      const pid = s.pending!.player;
      asked.push(pid);
      // Nobody sees an earlier choice.
      expect(s.log.slice(-3).map((l) => l.text).join(" ")).not.toMatch(/chooses (silence|snitch)/);
      s = passToPending(words ? act(s, { type: "chooseOption", player: pid, choice: words[i]! }) : run(s, botActions(s, pid)));
    }
    expect(asked).toEqual(opps);
    return { s, lost: opps.map((p, i) => life[i]! - s.players[p]!.life) };
  };

  it("all silence: 4 each", () => {
    supported(dilemma);
    expect(play(["silence", "silence", "silence"]).lost).toEqual([4, 4, 4]);
  });
  it("all snitch: 8 each", () => {
    const { s, lost } = play(["snitch", "snitch", "snitch"]);
    expect(lost).toEqual([8, 8, 8]);
    expect(s.log.some((l) => /The choices are revealed: .*snitch/.test(l.text))).toBe(true);
  });
  it("otherwise: 12 to each who chose silence, none to the others", () => {
    expect(play(["silence", "snitch", "silence"]).lost).toEqual([12, 0, 12]);
  });
  it("bots snitch (it costs less whatever the others choose)", () => {
    expect(play().lost).toEqual([8, 8, 8]);
  });
});

describe("High Perfect Morcant: each opponent blights 1 when it or another Elf enters", () => {
  const morcant = card("High Perfect Morcant", "Legendary Creature — Elf Noble", "{2}{B}{G}", { power: "4", toughness: "4", oracleText: "Whenever High Perfect Morcant or another Elf you control enters, each opponent blights 1. (They each put a -1/-1 counter on a creature they control.)\nTap three untapped Elves you control: Proliferate. Activate only as a sorcery. (Choose any number of permanents and/or players, then give each another counter of each kind already there.)" });
  const elf = card("Llanowar Elves", "Creature — Elf Druid", "{G}", { power: "1", toughness: "1", oracleText: "{T}: Add {G}." });

  it("one -1/-1 counter on a creature of each opponent's choice; none for one with no creature", () => {
    supported(morcant);
    const { s: s0, ap, ids } = setup([morcant, elf]);
    const [a, b, c] = [1, 2, 3].map((k) => s0.turnOrder[(s0.turnOrder.indexOf(ap) + k) % 4]!) as [PlayerId, PlayerId, PlayerId];
    const aBear = putOnBattlefield(s0, a, bear());
    const [b1, b2] = [putOnBattlefield(s0, b, bear()), putOnBattlefield(s0, b, bear({ name: "Big Bear", power: "4", toughness: "4" }))];
    let s = passToPending(run(s0, planCast(s0, ap, ids[0]!)));
    // B has two creatures: B chooses (as a bot, the one it values least).
    for (let i = 0; i < 4 && s.pending; i++) {
      expect(s.pending).toMatchObject({ kind: "pickPermanents", player: b, counter: "-1/-1" });
      s = passToPending(act(s, { type: "pickPermanents", player: b, ids: [b2] }));
    }
    expect(s.objects[aBear]!.counters["-1/-1"]).toBe(1);
    expect(s.objects[b2]!.counters["-1/-1"]).toBe(1);
    expect(s.objects[b1]!.counters["-1/-1"]).toBeUndefined();
    expect(s.players[c]!.life).toBe(40);
    // Another Elf: again (the Bears die to the second counter's state-based action only if 1/1s; these are 2/2 with one).
    s = passToPending(run(s, planCast(s, ap, ids[1]!)));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: b });
    s = passToPending(run(s, botActions(s, b)));
    expect(s.objects[aBear]!.zone).toBe("graveyard");
  });
});

describe("Fetch Quest: mill seven, then a creature, enchantment or land card from among them onto the battlefield", () => {
  const familiar = scry("adventure", [
    { name: "Bramble Familiar", mana_cost: "{1}{G}", type_line: "Creature — Elemental Raccoon", oracle_text: "{T}: Add {G}.\n{1}{G}, {T}, Discard a card: Return this creature to its owner's hand.", power: "2", toughness: "2" },
    { name: "Fetch Quest", mana_cost: "{5}{G}{G}", type_line: "Sorcery — Adventure", oracle_text: "Mill seven cards. Then put a creature, enchantment, or land card from among the milled cards onto the battlefield." },
  ]);
  const glorious = card("Test Anthem", "Enchantment", "{2}{W}", { oracleText: "Creatures you control get +1/+1." });
  const instant = card("Test Instant", "Instant", "{U}", { oracleText: "Draw a card." });

  it("one of them, not optional; the others stay in the graveyard", () => {
    supported(familiar);
    const { s: s0, ap, ids } = setup([familiar]);
    for (let i = 0; i < 5; i++) onTop(s0, ap, instant);
    const anthem = onTop(s0, ap, glorious);
    onTop(s0, ap, instant);
    let s = passToPending(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { face: 1 })));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 1, max: 1, fromGraveyard: "battlefield" });
    expect(s.pending?.kind === "searchLibrary" && s.pending.cards).toEqual([anthem]);
    s = passToPending(act(s, { type: "searchLibrary", player: ap, found: [anthem] }));
    expect(s.objects[anthem]!.zone).toBe("battlefield");
    expect(s.players[ap]!.graveyard).toHaveLength(6);
    // The Adventure went on to exile (CR 715.4).
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
  });
});

describe("Rise and Shine: noncreature artifacts become 0/0 artifact creatures with four +1/+1 counters", () => {
  const rise = card("Rise and Shine", "Sorcery", "{1}{U}", { oracleText: "Target noncreature artifact you control becomes a 0/0 artifact creature. Put four +1/+1 counters on each artifact that became a creature this way.\nOverload {4}{U}{U} (You may cast this spell for its overload cost. If you do, change \"target\" in its text to \"each.\")" });
  const ring = card("Sol Ring", "Artifact", "{1}", { oracleText: "{T}: Add {C}{C}." });
  const signet = card("Test Signet", "Artifact", "{2}", { oracleText: "{1}, {T}: Add {U}{B}." });

  it("the target: a 4/4 for good", () => {
    supported(rise);
    const { s: s0, ap, ids } = setup([rise]);
    const r = putOnBattlefield(s0, ap, ring);
    const other = putOnBattlefield(s0, ap, signet);
    let s = passToPending(run(s0, planCast(s0, ap, ids[0]!, [target(r)])));
    const c = characteristics(s, s.objects[r]!);
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect([c.power, c.toughness]).toEqual([4, 4]);
    expect(s.objects[r]!.counters["+1/+1"]).toBe(4);
    expect(characteristics(s, s.objects[other]!).types).not.toContain("Creature");
    s = passUntil(s, "upkeep", nextOf(s, ap));
    expect(characteristics(s, s.objects[r]!).types).toContain("Creature");
  });

  it("overloaded: each noncreature artifact you control, not an opponent's", () => {
    const { s: s0, ap, ids } = setup([rise]);
    const [r, g] = [putOnBattlefield(s0, ap, ring), putOnBattlefield(s0, ap, signet)];
    const theirs = putOnBattlefield(s0, nextOf(s0, ap), ring);
    const s = passToPending(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "overload" })));
    for (const id of [r, g]) expect(s.objects[id]!.counters["+1/+1"]).toBe(4);
    expect(characteristics(s, s.objects[theirs]!).types).not.toContain("Creature");
    expect(s.objects[theirs]!.counters["+1/+1"]).toBeUndefined();
  });
});

describe("Storm of Saruman: the second spell each turn is copied, the copy not legendary", () => {
  const storm = card("Storm of Saruman", "Enchantment", "{4}{U}{U}", { keywords: ["Ward"], oracleText: "Ward {3}\nWhenever you cast your second spell each turn, copy it, except the copy isn't legendary. You may choose new targets for the copy. (A copy of a permanent spell becomes a token.)" });
  const legend = card("Test Legend", "Legendary Creature — Human", "{1}{W}", { power: "2", toughness: "2" });
  const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });

  it("a legendary creature spell second: a nonlegendary token copy too", () => {
    supported(storm);
    const { s: s0, ap, ids } = setup([divination, legend]);
    putOnBattlefield(s0, ap, storm);
    let s = passToPending(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.stack).toHaveLength(0);
    s = passToPending(run(s, planCast(s, ap, ids[1]!)));
    for (let i = 0; i < 4 && s.pending; i++) s = passToPending(run(s, s.pending.kind === "chooseMay" ? [{ type: "chooseMay", player: ap, yes: false }] : botActions(s, ap)));
    const legends = s.battlefield.filter((x) => characteristics(s, s.objects[x]!).name === "Test Legend");
    expect(legends).toHaveLength(2);
    const token = legends.find((x) => s.objects[x]!.isToken)!;
    expect(characteristics(s, s.objects[token]!).supertypes).not.toContain("Legendary");
    expect(characteristics(s, s.objects[ids[1]!]!).supertypes).toContain("Legendary");
  });

  it("the first spell isn't copied", () => {
    const { s: s0, ap, ids } = setup([divination]);
    putOnBattlefield(s0, ap, storm);
    const hand = s0.players[ap]!.hand.length;
    const s = passToPending(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
  });
});

describe("Elanor Gardner: a basic land at your end step if you sacrificed a Food this turn", () => {
  const elanor = card("Elanor Gardner", "Legendary Creature — Halfling Scout", "{3}{G}", { power: "2", toughness: "4", keywords: ["Food"], oracleText: "When Elanor enters, create a Food token.\nAt the beginning of your end step, if you sacrificed a Food this turn, you may search your library for a basic land card, put that card onto the battlefield tapped, then shuffle." });

  it("after eating the Food: a tapped basic land; it doesn't trigger without one", () => {
    supported(elanor);
    const { s: s0, ap, ids } = setup([elanor]);
    onlyInHand(s0, ap, ids);
    let s = passToPending(run(s0, planCast(s0, ap, ids[0]!)));
    const food = s.battlefield.find((x) => characteristics(s, s.objects[x]!).subtypes.includes("Food"))!;
    expect(food).toBeDefined();
    // Not this turn: nothing sacrificed.
    const lands = () => s.battlefield.filter((x) => s.objects[x]!.controller === ap && characteristics(s, s.objects[x]!).types.includes("Land")).length;
    const before = lands();
    s = passUntil(s, "end", ap);
    expect(s.stack).toHaveLength(0);
    for (let i = 0; i < 8 && s.step === "end"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(lands()).toBe(before);
    // Next turn of ours: eat the Food, then the end step.
    s = passUntil(passUntil(s, "upkeep", nextOf(s, ap)), "main1", ap);
    s = passToPending(run(s, planActivate(s, ap, food, 0)));
    expect(s.objects[food]).toBeUndefined();
    s = passToPending(passUntil(s, "end", ap));
    expect(s.pending?.player).toBe(ap);
    for (let i = 0; i < 4 && s.pending; i++) s = passToPending(run(s, botActions(s, ap)));
    expect(lands()).toBe(before + 1);
    const fresh = s.battlefield.filter((x) => s.objects[x]!.controller === ap && s.objects[x]!.tapped && characteristics(s, s.objects[x]!).name === "Forest");
    expect(fresh.length).toBeGreaterThan(0);
  });
});

describe("Hobgoblin Bandit Lord: damage equal to the Goblins that entered under your control this turn", () => {
  const lord = card("Hobgoblin Bandit Lord", "Creature — Goblin Rogue", "{1}{R}{R}", { power: "2", toughness: "3", oracleText: "Other Goblins you control get +1/+1.\n{R}, {T}: This creature deals damage equal to the number of Goblins that entered the battlefield under your control this turn to any target." });
  const goblin = card("Test Goblin", "Creature — Goblin", "{R}", { power: "1", toughness: "1" });
  const shock = card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to target creature." });

  const party = card("Test Party", "Sorcery", "{2}", { oracleText: "Each player creates a 1/1 red Goblin creature token." });

  it("a Goblin cast and a token entered (the cast one since died): 2 damage; opponents' Goblins and the lord don't count", () => {
    supported(lord, party);
    const { s: s0, ap, opp, ids } = setup([goblin, party, shock]);
    const l = putOnBattlefield(s0, ap, lord);
    putOnBattlefield(s0, ap, mountain);
    let s = passToPending(run(s0, planCast(s0, ap, ids[0]!)));
    s = passToPending(run(s, planCast(s, ap, ids[1]!)));
    expect(s.battlefield.filter((x) => s.objects[x]!.isToken).length).toBe(4);
    // The cast one dies; it still counts (rulings).
    s = passToPending(run(s, planCast(s, ap, ids[2]!, [target(ids[0]!)])));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    s = passToPending(run(s, planActivate(s, ap, l, 0, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(38);
  });
});

describe("Fire Lord Azula: spells cast while it's attacking are copied", () => {
  const azula = card("Fire Lord Azula", "Legendary Creature — Human Noble", "{1}{U}{B}{R}", { power: "4", toughness: "4", keywords: ["Firebending"], oracleText: "Firebending 2 (Whenever this creature attacks, add {R}{R}. This mana lasts until end of combat.)\nWhenever you cast a spell while Fire Lord Azula is attacking, copy that spell. You may choose new targets for the copy. (A copy of a permanent spell becomes a token.)" });
  const bolt = card("Test Bolt", "Instant", "{R}", { oracleText: "Test Bolt deals 3 damage to any target." });

  it("while attacking: copied (6 damage); before combat: not", () => {
    supported(azula);
    const { s: s0, ap, opp, ids } = setup([bolt, bolt]);
    putOnBattlefield(s0, ap, azula);
    let s = passToPending(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(37);
    s = passUntil(s, "declareAttackers", ap);
    const az = s.battlefield.find((x) => characteristics(s, s.objects[x]!).name === "Fire Lord Azula")!;
    s = passToPending(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: az, defender: opp }] }));
    expect(s.players[ap]!.manaPool.R).toBeGreaterThanOrEqual(2);
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }]));
    s = passToPending(s);
    for (let i = 0; i < 4 && s.pending; i++) s = passToPending(run(s, s.pending.kind === "chooseMay" ? [{ type: "chooseMay", player: ap, yes: false }] : botActions(s, ap)));
    expect(s.players[opp]!.life).toBe(31);
  });
});

describe("Famished Worldsire: devour land, then lands from among the top X cards, X its power", () => {
  const worldsire = card("Famished Worldsire", "Creature — Leviathan", "{5}{G}{G}{G}", { power: "0", toughness: "0", keywords: ["Ward", "Devour"], oracleText: "Ward {3}\nDevour land 3 (As this creature enters, you may sacrifice any number of lands. It enters with three times that many +1/+1 counters on it.)\nWhen this creature enters, look at the top X cards of your library, where X is this creature's power. Put any number of land cards from among them onto the battlefield tapped, then shuffle." });

  it("two lands devoured: a 6/6 that looks at six cards and puts the lands among them onto the battlefield", () => {
    supported(worldsire);
    const { s: s0, ap, ids } = setup([worldsire]);
    const top = [onTop(s0, ap, forest), onTop(s0, ap, bear()), onTop(s0, ap, forest), onTop(s0, ap, bear()), onTop(s0, ap, bear()), onTop(s0, ap, forest), onTop(s0, ap, island)];
    let s = passToPending(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "sacrifice", min: 0 });
    const eaten = s.pending?.kind === "pickPermanents" ? s.pending.options.slice(0, 2) : [];
    s = passToPending(act(s, { type: "pickPermanents", player: ap, ids: eaten }));
    const w = ids[0]!;
    expect(s.objects[w]!.counters["+1/+1"]).toBe(6);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    // The top six (the Island on top): its three lands, not the Forest seventh down.
    const offered = s.pending?.kind === "searchLibrary" ? s.pending.cards : [];
    expect([...offered].sort()).toEqual([top[6]!, top[5]!, top[2]!].sort());
    s = passToPending(act(s, { type: "searchLibrary", player: ap, found: offered }));
    for (const id of offered) expect([s.objects[id]!.zone, s.objects[id]!.tapped]).toEqual(["battlefield", true]);
    expect(s.objects[top[0]!]!.zone).toBe("library");
  });
});

describe("Dread Summons: a tapped Zombie for each creature card milled this way", () => {
  const summons = card("Dread Summons", "Sorcery", "{X}{B}{B}", { oracleText: "Each player mills X cards. For each creature card put into a graveyard this way, you create a tapped 2/2 black Zombie creature token. (To mill a card, a player puts the top card of their library into their graveyard.)" });

  it("X=2: every player's creature cards count", () => {
    supported(summons);
    const { s: s0, ap, ids } = setup([summons]);
    const [a, b, c] = [1, 2, 3].map((k) => s0.turnOrder[(s0.turnOrder.indexOf(ap) + k) % 4]!) as [PlayerId, PlayerId, PlayerId];
    onTop(s0, ap, forest); onTop(s0, ap, bear());
    onTop(s0, a, bear()); onTop(s0, a, bear());
    onTop(s0, b, forest); onTop(s0, b, forest);
    onTop(s0, c, forest); onTop(s0, c, bear());
    const s = passToPending(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 2)));
    const zombies = s.battlefield.filter((x) => s.objects[x]!.isToken && characteristics(s, s.objects[x]!).subtypes.includes("Zombie"));
    expect(zombies).toHaveLength(4);
    for (const z of zombies) expect([s.objects[z]!.tapped, s.objects[z]!.controller]).toEqual([true, ap]);
  });
});

/** Puts `def` into `pid`'s graveyard. */
const inYard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = onTop(s, pid, def);
  s.players[pid]!.library.shift();
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
};

describe("Skullwinder: return target card from your graveyard, then an opponent you choose returns one of theirs", () => {
  const skullwinder = card("Skullwinder", "Creature — Snake", "{2}{G}", { power: "1", toughness: "3", keywords: ["Deathtouch"], oracleText: "Deathtouch\nWhen this creature enters, return target card from your graveyard to your hand, then choose an opponent. That player returns a card from their graveyard to their hand." });

  it("our card, then the chosen opponent picks one of theirs", () => {
    supported(skullwinder);
    const { s: s0, ap, ids } = setup([skullwinder]);
    const [a, b] = [nextOf(s0, ap), nextOf(s0, nextOf(s0, ap))];
    const mine = inYard(s0, ap, bear({ name: "My Bear" }));
    const theirs = [inYard(s0, b, bear({ name: "Their Bear" })), inYard(s0, b, forest)];
    let s = passToPending(run(s0, planCast(s0, ap, ids[0]!)));
    // The trigger targets our card.
    s = passToPending(run(s, s.pending?.kind === "chooseTargets" ? [{ type: "chooseTargets", player: ap, targets: [target(mine)] } as Action] : []));
    expect(s.objects[mine]!.zone).toBe("hand");
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "opponent" });
    s = passToPending(act(s, { type: "chooseOption", player: ap, choice: String(b) }));
    // That player chooses which (rulings).
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: b, fromGraveyard: "hand" });
    s = passToPending(act(s, { type: "searchLibrary", player: b, found: [theirs[1]!] }));
    expect(s.objects[theirs[1]!]!.zone).toBe("hand");
    expect(s.objects[theirs[0]!]!.zone).toBe("graveyard");
    expect(s.players[a]!.hand.length).toBe(s0.players[a]!.hand.length);
  });

  it("a bot chooses an opponent with an empty graveyard", () => {
    const { s: s0, ap, ids } = setup([skullwinder]);
    const mine = inYard(s0, ap, bear({ name: "My Bear" }));
    const [a, b, c] = [1, 2, 3].map((k) => s0.turnOrder[(s0.turnOrder.indexOf(ap) + k) % 4]!) as [PlayerId, PlayerId, PlayerId];
    inYard(s0, a, bear());
    inYard(s0, c, bear());
    let s = passToPending(run(s0, planCast(s0, ap, ids[0]!)));
    for (let i = 0; i < 6 && s.pending?.player === ap; i++) {
      if (s.pending.kind === "chooseOption") expect(s.pending.what === "opponent" && botActions(s, ap)[0]).toMatchObject({ choice: String(b) });
      s = passToPending(run(s, botActions(s, ap)));
    }
    expect(s.objects[mine]!.zone).toBe("hand");
    expect([s.players[a]!.graveyard.length, s.players[c]!.graveyard.length]).toEqual([1, 1]);
    expect(s.log.some((l) => l.text.includes(`chooses ${s.players[b]!.name}`))).toBe(true);
  });
});

describe("Screaming Nemesis: the damage it's dealt goes on; a player it hits can't gain life again", () => {
  const nemesis = card("Screaming Nemesis", "Creature — Spirit", "{2}{R}", { power: "3", toughness: "3", keywords: ["Haste"], oracleText: "Haste\nWhenever this creature is dealt damage, it deals that much damage to any other target. If a player is dealt damage this way, they can't gain life for the rest of the game." });
  const bolt = card("Test Bolt", "Instant", "{R}", { oracleText: "Test Bolt deals 3 damage to any target." });
  const salve = card("Test Salve", "Instant", "{W}", { oracleText: "You gain 5 life." });

  it("dies to 3 damage and still deals 3 to the player, who then can't gain life (the Nemesis gone)", () => {
    supported(nemesis);
    const { s: s0, ap, opp, ids } = setup([bolt]);
    const n = putOnBattlefield(s0, ap, nemesis);
    const oppSalve = putOnBattlefield(s0, opp, salve);
    s0.battlefield.splice(s0.battlefield.indexOf(oppSalve), 1);
    s0.objects[oppSalve]!.zone = "hand";
    s0.players[opp]!.hand.push(oppSalve);
    putOnBattlefield(s0, opp, card("Plains", "Basic Land — Plains"));
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(n)]));
    s = passToPending(s);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    // Not itself ("any other target", CR 115.4).
    s = passToPending(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] } as Action));
    expect(s.objects[n]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(37);
    expect(s.players[opp]!.cantGainLifeForGame).toBe(true);
    // Their turn: the salve does nothing.
    s = passUntil(s, "main1", opp);
    s = passToPending(run(s, planCast(s, opp, oppSalve)));
    expect(s.players[opp]!.life).toBe(37);
  });

  it("damage to a creature this way: no one is stopped from gaining life", () => {
    const { s: s0, ap, opp, ids } = setup([bolt]);
    const n = putOnBattlefield(s0, ap, nemesis);
    const theirs = putOnBattlefield(s0, opp, bear());
    let s = passToPending(run(s0, planCast(s0, ap, ids[0]!, [target(n)])));
    s = passToPending(act(s, { type: "chooseTargets", player: ap, targets: [target(theirs)] } as Action));
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.players.every((p) => !p.cantGainLifeForGame)).toBe(true);
  });
});

describe("Haunting Voyage: up to two creature cards of the chosen type; foretold, all of them", () => {
  const voyage = card("Haunting Voyage", "Sorcery", "{4}{B}{B}", { keywords: ["Foretell"], oracleText: "Choose a creature type. Return up to two creature cards of that type from your graveyard to the battlefield. If this spell was foretold, return all creature cards of that type from your graveyard to the battlefield instead.\nForetell {5}{B}{B} (During your turn, you may pay {2} and exile this card from your hand face down. Cast it on a later turn for its foretell cost.)" });
  const zombie = (name: string) => card(name, "Creature — Zombie", "{1}{B}", { power: "2", toughness: "2" });

  it("two Zombies of three, not the Bear", () => {
    supported(voyage);
    const { s: s0, ap, ids } = setup([voyage]);
    const zs = ["Z1", "Z2", "Z3"].map((x) => inYard(s0, ap, zombie(x)));
    const b = inYard(s0, ap, bear());
    let s = passToPending(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "creatureType" });
    // A bot would name the type in its graveyard.
    expect(botActions(s, ap)[0]).toMatchObject({ choice: "Zombie" });
    s = passToPending(act(s, { type: "chooseOption", player: ap, choice: "Zombie" }));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 2, fromGraveyard: "battlefield" });
    expect(s.pending?.kind === "searchLibrary" && [...s.pending.cards].sort()).toEqual([...zs].sort());
    s = passToPending(act(s, { type: "searchLibrary", player: ap, found: zs.slice(0, 2) }));
    expect(zs.map((z) => s.objects[z]!.zone)).toEqual(["battlefield", "battlefield", "graveyard"]);
    expect(s.objects[b]!.zone).toBe("graveyard");
  });

  it("foretold: all three", () => {
    const { s: s0, ap, ids } = setup([voyage]);
    const zs = ["Z1", "Z2", "Z3"].map((x) => inYard(s0, ap, zombie(x)));
    let s = run(s0, planForetell(s0, ap, ids[0]!));
    expect(s.objects[ids[0]!]!.foretold).toBe(true);
    s = passUntil(passUntil(s, "upkeep", nextOf(s, ap)), "main1", ap);
    s = passToPending(run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "foretell" })));
    s = passToPending(act(s, { type: "chooseOption", player: ap, choice: "Zombie" }));
    expect(zs.map((z) => s.objects[z]!.zone)).toEqual(["battlefield", "battlefield", "battlefield"]);
  });
});

describe("Astarion's Thirst: exile a creature, its power in +1/+1 counters on a commander creature you control", () => {
  const thirst = card("Astarion's Thirst", "Instant", "{3}{B}", { oracleText: "Exile target creature. Put X +1/+1 counters on a commander creature you control, where X is the power of the creature exiled this way." });

  it("its power as it last existed, counters included", () => {
    supported(thirst);
    const { s: s0, ap, opp, ids } = setup([thirst]);
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Commander" }), { commander: true });
    const plain = putOnBattlefield(s0, ap, bear());
    const big = putOnBattlefield(s0, opp, bear({ name: "Big Bear", power: "4", toughness: "4" }));
    s0.objects[big]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s0);
    let s = passToPending(run(s0, planCast(s0, ap, ids[0]!, [target(big)])));
    for (let i = 0; i < 3 && s.pending; i++) s = passToPending(run(s, botActions(s, ap)));
    expect(s.objects[big]!.zone).toBe("exile");
    expect(s.objects[mine]!.counters["+1/+1"]).toBe(5);
    expect(s.objects[plain]!.counters["+1/+1"]).toBeUndefined();
  });

  it("no commander creature: just the exile", () => {
    const { s: s0, ap, opp, ids } = setup([thirst]);
    const plain = putOnBattlefield(s0, ap, bear());
    const big = putOnBattlefield(s0, opp, bear({ name: "Big Bear", power: "4", toughness: "4" }));
    const s = passToPending(run(s0, planCast(s0, ap, ids[0]!, [target(big)])));
    expect(s.objects[big]!.zone).toBe("exile");
    expect(s.objects[plain]!.counters["+1/+1"]).toBeUndefined();
  });
});
