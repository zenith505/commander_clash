// Lane B round B138: Ruin in Their Wake (a "may" onto the battlefield while you control Wastes), Brothers Yamazaki (an
// exception to the legend rule, CR 704.5j), Kindle the Carnage (a random discard repeated at will), Invoke the Ancients (a
// counter choice for each token created), Miasma Demon (any number discarded, then up to that many targets, CR 603.12),
// Calibrated Blast (a reflexive trigger after the revealed cards go to the bottom), Tajuru Paragon (a card sharing a
// creature type with it), Batroc the Leaper (up to X targets, X the times it was kicked) and Expel the Unworthy (a kicker
// that changes the target, CR 702.33g).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const ruin = card("Ruin in Their Wake", "Sorcery", "{1}{G}", { cmc: 2, colors: [], keywords: ["Devoid"], oracleText: "Devoid (This card has no color.)\nSearch your library for a basic land card and reveal it. You may put that card onto the battlefield tapped if you control a land named Wastes. Otherwise, put that card into your hand. Then shuffle." });
const wastes = card("Wastes", "Basic Land", "", { oracleText: "{T}: Add {C}." });
const brothers = card("Brothers Yamazaki", "Legendary Creature — Human Samurai", "{2}{R}", { cmc: 3, power: "2", toughness: "1", keywords: ["Bushido"], oracleText: 'Bushido 1 (Whenever this creature blocks or becomes blocked, it gets +1/+1 until end of turn.)\nIf there are exactly two permanents named Brothers Yamazaki on the battlefield, the "legend rule" doesn\'t apply to them.\nEach other creature named Brothers Yamazaki gets +2/+2 and has haste.' });
const kindle = card("Kindle the Carnage", "Sorcery", "{1}{R}{R}", { cmc: 3, oracleText: "Discard a card at random. If you do, Kindle the Carnage deals damage equal to that card's mana value to each creature. You may repeat this process any number of times." });
const invoke = card("Invoke the Ancients", "Sorcery", "{1}{G}{G}{G}{G}", { cmc: 5, oracleText: "Create two 4/5 green Spirit creature tokens. For each of them, put your choice of a reach counter, a vigilance counter, or a trample counter on it." });
const miasma = card("Miasma Demon", "Creature — Demon", "{4}{B}{B}", { cmc: 6, power: "5", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nWhen this creature enters, you may discard any number of cards. When you do, up to that many target creatures each get -2/-2 until end of turn." });
const blast = card("Calibrated Blast", "Instant", "{2}{R}", { cmc: 3, keywords: ["Flashback"], oracleText: "Reveal cards from the top of your library until you reveal a nonland card. Put the revealed cards on the bottom of your library in a random order. When you reveal a nonland card this way, Calibrated Blast deals damage equal to that card's mana value to any target.\nFlashback {3}{R}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.)" });
const paragon = card("Tajuru Paragon", "Creature — Elf", "{1}{G}", { cmc: 2, power: "3", toughness: "2", keywords: ["Kicker"], oracleText: "Tajuru Paragon is also a Cleric, Rogue, Warrior, and Wizard.\nKicker {3}\nWhen this creature enters, if it was kicked, reveal the top six cards of your library. You may put a card that shares a creature type with it from among them into your hand. Put the rest on the bottom of your library in a random order." });
const batroc = card("Batroc the Leaper", "Legendary Creature — Human Villain", "{1}{R}", { cmc: 2, power: "2", toughness: "2", keywords: ["Multikicker"], oracleText: "Multikicker {2} (You may pay an additional {2} any number of times as you cast this spell.)\nBatroc enters with a +1/+1 counter on him for each time he was kicked.\nWhen Batroc enters, he deals damage equal to his power to each of up to X targets, where X is the number of times he was kicked." });
const expel = card("Expel the Unworthy", "Sorcery", "{1}{W}", { cmc: 2, keywords: ["Kicker"], oracleText: "Kicker {2}{W} (You may pay an additional {2}{W} as you cast this spell.)\nChoose target creature with mana value 3 or less. If this spell was kicked, instead choose target creature. Exile the chosen creature, then its controller gains life equal to its mana value." });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; "you may" gets `may`, trigger targets `targets`; any other question stops it. */
const settle = (s: GameState, opts: { may?: boolean; targets?: TargetChoice[]; bots?: PlayerId[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.bots?.includes(p.player)) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p?.kind === "chooseMay" && opts.may !== undefined) s = act(s, { type: "chooseMay", player: p.player, yes: opts.may });
    else if (p?.kind === "chooseTargets" && opts.targets) s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
const emptyHand = (s: GameState, pid: PlayerId) => {
  for (const id of s.players[pid]!.hand.splice(0)) {
    s.objects[id]!.zone = "library";
    s.players[pid]!.library.push(id);
  }
};
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const named = (s: GameState, name: string) => s.battlefield.filter((id) => characteristics(s, s.objects[id]!).name === name);
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;

describe("Ruin in Their Wake: onto the battlefield tapped only while you control Wastes", () => {
  it("parses", () => supported(ruin));

  const cast = (withWastes: boolean) => {
    const { s: s0, ap, ids } = setup([ruin]);
    if (withWastes) putOnBattlefield(s0, ap, wastes);
    const pl = into(s0, ap, card("Plains", "Basic Land — Plains"), "library");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = act(s, { type: "searchLibrary", player: ap, found: [pl] });
    return { s, ap, pl };
  };

  it("with Wastes: you may put it onto the battlefield tapped", () => {
    let { s, ap, pl } = cast(true);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(zone(s, pl)).toBe("battlefield");
    expect(s.objects[pl]!.tapped).toBe(true);
  });

  it("with Wastes but declined, or without Wastes: into your hand", () => {
    let { s, ap, pl } = cast(true);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(zone(s, pl)).toBe("hand");
    ({ s, ap, pl } = cast(false));
    s = settle(s);
    expect(s.pending).toBeNull();
    expect(zone(s, pl)).toBe("hand");
  });
});

describe("Brothers Yamazaki: the legend rule doesn't apply to exactly two (CR 704.5j)", () => {
  it("parses", () => supported(brothers));

  it("two Brothers stay, each giving the other +2/+2 and haste", () => {
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, brothers);
    const b = putOnBattlefield(s0, ap, brothers);
    const s = settle(act(s0, { type: "passPriority", player: waitingOn(s0)! }));
    expect(zone(s, a)).toBe("battlefield");
    expect(zone(s, b)).toBe("battlefield");
    expect(pt(s, a)).toBe("4/3");
    expect(pt(s, b)).toBe("4/3");
    expect(objHasKeyword(s, s.objects[a]!, "Haste")).toBe(true);
  });

  it("one alone gets nothing from itself", () => {
    const { s, ap } = setup([]);
    const a = putOnBattlefield(s, ap, brothers);
    expect(pt(s, a)).toBe("2/1");
    expect(objHasKeyword(s, s.objects[a]!, "Haste")).toBe(false);
  });

  it("a third one: the legend rule applies again (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const ids = [putOnBattlefield(s0, ap, brothers), putOnBattlefield(s0, ap, brothers), putOnBattlefield(s0, ap, brothers)];
    let s = act(s0, { type: "passPriority", player: waitingOn(s0)! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "legend" });
    s = act(s, { type: "chooseOption", player: ap, choice: ids[0]! });
    expect(ids.filter((id) => zone(s, id) === "battlefield")).toEqual([ids[0]]);
  });

  it("two controlled by different players both stay; one other legend with its own name still goes", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, brothers);
    const b = putOnBattlefield(s0, opp, brothers);
    const other = card("Other Legend", "Legendary Creature — Human", "{1}", { power: "1", toughness: "1" });
    putOnBattlefield(s0, ap, other);
    putOnBattlefield(s0, ap, other);
    const s = act(s0, { type: "passPriority", player: waitingOn(s0)! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "legend" });
    expect((s.pending as { options: string[] }).options).not.toContain(a);
    expect(zone(s, a)).toBe("battlefield");
    expect(zone(s, b)).toBe("battlefield");
    expect(pt(s, b)).toBe("4/3");
  });
});

describe("Kindle the Carnage: a random discard, damage by its mana value, again as you choose", () => {
  it("parses", () => supported(kindle));

  it("each pass deals the discarded card's mana value to each creature; the creatures die once it's done", () => {
    const { s: s0, ap, ids, opp } = setup([kindle]);
    emptyHand(s0, ap);
    s0.players[ap]!.library = s0.players[ap]!.library.filter((id) => id !== ids[0]);
    s0.players[ap]!.hand.push(ids[0]!);
    s0.objects[ids[0]!]!.zone = "hand";
    const two = into(s0, ap, card("Two Drop", "Sorcery", "{1}{R}", { cmc: 2 }), "hand");
    const three = into(s0, ap, card("Three Drop", "Sorcery", "{2}{R}", { cmc: 3 }), "hand");
    const big = putOnBattlefield(s0, opp, bear({ name: "Big One", power: "4", toughness: "4" }));
    const small = putOnBattlefield(s0, opp, bear({ name: "Small One", power: "1", toughness: "2" }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, repeat: true });
    const first = [two, three].find((id) => zone(s, id) === "graveyard")!;
    const firstMv = first === two ? 2 : 3;
    expect(s.objects[big]!.damage).toBe(firstMv);
    // Lethal damage stays until the spell is done (rulings).
    expect(zone(s, small)).toBe("battlefield");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    // The hand is empty now: it isn't offered again.
    expect(zone(s, two)).toBe("graveyard");
    expect(zone(s, three)).toBe("graveyard");
    expect(zone(s, big)).toBe("graveyard");
    expect(zone(s, small)).toBe("graveyard");
  });

  it("stopping after one pass", () => {
    const { s: s0, ap, ids, opp } = setup([kindle]);
    emptyHand(s0, ap);
    s0.players[ap]!.library = s0.players[ap]!.library.filter((id) => id !== ids[0]);
    s0.players[ap]!.hand.push(ids[0]!);
    s0.objects[ids[0]!]!.zone = "hand";
    const cards = [into(s0, ap, card("One A", "Sorcery", "{R}", { cmc: 1 }), "hand"), into(s0, ap, card("One B", "Sorcery", "{R}", { cmc: 1 }), "hand")];
    const b = putOnBattlefield(s0, opp, bear({ power: "2", toughness: "3" }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(cards.filter((id) => zone(s, id) === "graveyard").length).toBe(1);
    expect(s.objects[b]!.damage).toBe(1);
  });

  it("with no card in hand it does nothing and isn't offered again", () => {
    const { s: s0, ap, ids, opp } = setup([kindle]);
    emptyHand(s0, ap);
    s0.players[ap]!.library = s0.players[ap]!.library.filter((id) => id !== ids[0]);
    s0.players[ap]!.hand.push(ids[0]!);
    s0.objects[ids[0]!]!.zone = "hand";
    const b = putOnBattlefield(s0, opp, bear());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeNull();
    expect(s.objects[b]!.damage).toBe(0);
  });
});

describe("Invoke the Ancients: a counter chosen for each token", () => {
  it("parses", () => supported(invoke));

  it("two choices, one for each Spirit", () => {
    const { s: s0, ap, ids } = setup([invoke]);
    s0.players[ap]!.manaPool.G = 4;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "either", labels: ["Put a reach counter", "Put a vigilance counter", "Put a trample counter"] });
    const first = (s.pending as { about: string }).about;
    s = act(s, { type: "chooseOption", player: ap, choice: "0" });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "either" });
    const second = (s.pending as { about: string }).about;
    expect(second).not.toBe(first);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "2" }));
    const spirits = named(s, "Spirit Token");
    expect(spirits.sort()).toEqual([first, second].sort());
    expect(s.objects[first]!.counters).toEqual({ reach: 1 });
    expect(s.objects[second]!.counters).toEqual({ trample: 1 });
    expect(objHasKeyword(s, s.objects[first]!, "Reach")).toBe(true);
    expect(objHasKeyword(s, s.objects[second]!, "Trample")).toBe(true);
    expect(pt(s, first)).toBe("4/5");
  });

  it("a bot answers each choice", () => {
    const { s: s0, ap, ids } = setup([invoke]);
    s0.players[ap]!.manaPool.G = 4;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), { bots: [ap] });
    const spirits = named(s, "Spirit Token");
    expect(spirits.length).toBe(2);
    for (const id of spirits) expect(Object.values(s.objects[id]!.counters).reduce((a, b) => a + b, 0)).toBe(1);
  });
});

describe("Miasma Demon: discard any number, then up to that many targets get -2/-2 (CR 603.12)", () => {
  it("parses", () => supported(miasma));

  it("two discarded: two targets", () => {
    const { s: s0, ap, ids, opp } = setup([miasma]);
    emptyHand(s0, ap);
    s0.players[ap]!.library = s0.players[ap]!.library.filter((id) => id !== ids[0]);
    s0.players[ap]!.hand.push(ids[0]!);
    s0.objects[ids[0]!]!.zone = "hand";
    const cards = [into(s0, ap, bear({ name: "Fodder One" }), "hand"), into(s0, ap, bear({ name: "Fodder Two" }), "hand"), into(s0, ap, bear({ name: "Kept" }), "hand")];
    const t1 = putOnBattlefield(s0, opp, bear({ name: "Victim One" }));
    const t2 = putOnBattlefield(s0, opp, bear({ name: "Victim Two", power: "3", toughness: "3" }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, upTo: true });
    s = act(s, { type: "discard", player: ap, objectIds: cards.slice(0, 2) });
    s = settle(s, { targets: [tgt(t1), tgt(t2)] });
    expect(zone(s, cards[0]!)).toBe("graveyard");
    expect(zone(s, cards[2]!)).toBe("hand");
    expect(zone(s, t1)).toBe("graveyard");
    expect(pt(s, t2)).toBe("1/1");
  });

  it("none discarded: no trigger", () => {
    const { s: s0, ap, ids, opp } = setup([miasma]);
    const t1 = putOnBattlefield(s0, opp, bear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "discard", player: ap, objectIds: [] }));
    expect(s.pending).toBeNull();
    expect(pt(s, t1)).toBe("2/2");
  });
});

describe("Calibrated Blast: reveal until a nonland card, all to the bottom, then damage by its mana value", () => {
  it("parses", () => supported(blast));

  it("the nonland card's mana value to the target chosen after, everything revealed at the bottom", () => {
    const { s: s0, ap, ids, opp } = setup([blast]);
    const four = into(s0, ap, card("Four Drop", "Sorcery", "{3}{R}", { cmc: 4 }), "library");
    const land = into(s0, ap, card("Plains", "Basic Land — Plains"), "library");
    const victim = putOnBattlefield(s0, opp, bear({ power: "4", toughness: "4" }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    // No targets as it's cast: the reflexive trigger asks for one.
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    const lib = s.players[ap]!.library;
    expect(lib.slice(-2).sort()).toEqual([four, land].sort());
    s = settle(s, { targets: [tgt(victim)] });
    expect(zone(s, victim)).toBe("graveyard");
  });

  it("no nonland card: no trigger", () => {
    const { s: s0, ap, ids } = setup([blast]);
    const lib = s0.players[ap]!.library;
    for (const id of lib) s0.objects[id]!.zone = "exile";
    s0.players[ap]!.library = [];
    into(s0, ap, card("Plains", "Basic Land — Plains"), "library");
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeNull();
    expect(s.stack.length).toBe(0);
  });
});

describe("Tajuru Paragon: kicked, a card sharing a creature type with it", () => {
  it("parses", () => supported(paragon));

  it("only a card sharing a type (its added Wizard counts); the rest to the bottom", () => {
    const { s: s0, ap, ids } = setup([paragon]);
    const wizard = into(s0, ap, card("Some Wizard", "Creature — Human Wizard", "{1}{U}", { power: "1", toughness: "1" }), "library");
    const goblin = into(s0, ap, card("Some Goblin", "Creature — Goblin", "{R}", { power: "1", toughness: "1" }), "library");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { kicks: [0] })));
    expect(s.pending, JSON.stringify(s.log.slice(-6))).toMatchObject({ kind: "searchLibrary" });
    const q = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    expect(q.cards).toContain(wizard);
    expect(q.cards).not.toContain(goblin);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [wizard] }));
    expect(zone(s, wizard)).toBe("hand");
    expect(zone(s, goblin)).toBe("library");
  });

  it("not kicked: nothing happens", () => {
    const { s: s0, ap, ids } = setup([paragon]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeNull();
  });
});

describe("Batroc the Leaper: up to X targets, X the times it was kicked", () => {
  it("parses", () => supported(batroc));

  it("kicked twice: a 4/4 dealing 4 damage to each of two targets", () => {
    const { s: s0, ap, ids, opp } = setup([batroc]);
    const v = putOnBattlefield(s0, opp, bear({ power: "4", toughness: "4" }));
    const life = s0.players[opp]!.life;
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { kicks: [0, 0] }));
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(s, { targets: [tgt(v), { kind: "player", id: opp }] });
    const b = named(s, "Batroc the Leaper")[0]!;
    expect(pt(s, b)).toBe("4/4");
    expect(zone(s, v)).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life - 4);
  });

  it("not kicked: no targets, nothing dealt", () => {
    const { s: s0, ap, ids, opp } = setup([batroc]);
    const v = putOnBattlefield(s0, opp, bear());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeNull();
    expect(s.objects[v]!.damage).toBe(0);
  });
});

describe("Expel the Unworthy: the kicker lets it choose any creature (CR 702.33g)", () => {
  it("parses", () => supported(expel));

  it("unkicked: only mana value 3 or less; its controller gains that much life", () => {
    const { s: s0, ap, ids, opp } = setup([expel]);
    const small = putOnBattlefield(s0, opp, bear({ name: "Small", cmc: 2 }));
    const big = putOnBattlefield(s0, opp, card("Big", "Creature — Giant", "{4}{G}", { cmc: 5, power: "5", toughness: "5" }));
    expect(planCast(s0, ap, ids[0]!, [tgt(big)])).toBeNull();
    const life = s0.players[opp]!.life;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(small)]) ?? planCast(s0, ap, ids[0]!, [tgt(small), { kind: "none" }])));
    expect(zone(s, small)).toBe("exile");
    expect(s.players[opp]!.life).toBe(life + 2);
  });

  it("kicked: any creature", () => {
    const { s: s0, ap, ids, opp } = setup([expel]);
    const big = putOnBattlefield(s0, opp, card("Big", "Creature — Giant", "{4}{G}", { cmc: 5, power: "5", toughness: "5" }));
    const life = s0.players[opp]!.life;
    const plan = planCast(s0, ap, ids[0]!, [{ kind: "none" }, tgt(big)], undefined, "auto", undefined, { kicks: [0] }) ?? planCast(s0, ap, ids[0]!, [tgt(big)], undefined, "auto", undefined, { kicks: [0] });
    const s = settle(run(s0, plan));
    expect(zone(s, big)).toBe("exile");
    expect(s.players[opp]!.life).toBe(life + 5);
    expect(controllerOf).toBeDefined();
  });

  it("with only a mana value 5 creature around it can still be cast, kicked (CR 601.2b, 702.33g)", () => {
    const { s: s0, ap, ids, opp } = setup([expel]);
    putOnBattlefield(s0, opp, card("Big", "Creature — Giant", "{4}{G}", { cmc: 5, power: "5", toughness: "5" }));
    expect(planCast(s0, ap, ids[0]!)).not.toBeNull();
    expect(planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { kicks: [] })).toBeNull();
  });
});
