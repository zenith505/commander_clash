// Round 96: Eldritch Evolution ("a creature card with mana value X or less, where X is 2 plus the sacrificed creature's
// mana value"), Kaya's Ghostform ("When enchanted permanent dies or is put into exile, return that card", CR 603.10a),
// Bloodchief Ascension ("an opponent lost 2 or more life this turn", "a card is put into an opponent's graveyard from
// anywhere"), Isochron Scepter (imprint; "You may copy the exiled card. If you do, you may cast the copy", CR 707.12,
// 704.5e), Mockingbird ("mana value less than or equal to the amount of mana spent to cast this creature", CR 707.9) and
// Springheart Nantuko (bestow; "If you didn't create a token this way").

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, putOnBattlefield, setup, target } from "./helpers";
import { characteristics, isFullySupported, nameOf, planActivate, planCast, runStateBasedActions, waitingOn, type CardDef, type GameState, type PendingDecision, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const evolution = card("Eldritch Evolution", "Sorcery", "{1}{G}{G}", {
  oracleText:
    "As an additional cost to cast this spell, sacrifice a creature.\nSearch your library for a creature card with mana value X or less, where X is 2 plus the sacrificed creature's mana value. Put that card onto the battlefield, then shuffle. Exile Eldritch Evolution.",
});
const ghostform = card("Kaya's Ghostform", "Enchantment — Aura", "{B}", {
  oracleText: "Enchant creature or planeswalker you control\nWhen enchanted permanent dies or is put into exile, return that card to the battlefield under your control.",
});
const ascension = card("Bloodchief Ascension", "Enchantment", "{B}", {
  oracleText:
    "At the beginning of each end step, if an opponent lost 2 or more life this turn, you may put a quest counter on this enchantment. (Damage causes loss of life.)\nWhenever a card is put into an opponent's graveyard from anywhere, if this enchantment has three or more quest counters on it, you may have that player lose 2 life. If you do, you gain 2 life.",
});
const scepter = card("Isochron Scepter", "Artifact", "{2}", {
  oracleText:
    "Imprint — When this artifact enters, you may exile an instant card with mana value 2 or less from your hand.\n{2}, {T}: You may copy the exiled card. If you do, you may cast the copy without paying its mana cost.",
});
const mockingbird = card("Mockingbird", "Creature — Bird Bard", "{X}{U}", {
  power: "1",
  toughness: "1",
  keywords: ["Flying"],
  oracleText:
    "Flying\nYou may have this creature enter as a copy of any creature on the battlefield with mana value less than or equal to the amount of mana spent to cast this creature, except it's a Bird in addition to its other types and it has flying.",
});
const nantuko = card("Springheart Nantuko", "Enchantment Creature — Insect Monk", "{1}{G}", {
  power: "1",
  toughness: "1",
  keywords: ["Bestow"],
  oracleText:
    "Bestow {1}{G} (If you cast this card for its bestow cost, it's an Aura spell with enchant creature. It becomes a creature again if it's not attached to a creature.)\nEnchanted creature gets +1/+1.\nLandfall — Whenever a land you control enters, you may pay {1}{G} if this permanent is attached to a creature you control. If you do, create a token that's a copy of that creature. If you didn't create a token this way, create a 1/1 green Insect creature token.",
});
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const sting = card("Sting Test", "Instant", "{R}", { oracleText: "Sting Test deals 1 damage to any target." });
const exileIt = card("Exile Test", "Instant", "{W}", { oracleText: "Exile target creature." });
const bigBolt = card("Lava Axe", "Sorcery", "{4}{R}", { oracleText: "Lava Axe deals 5 damage to target player or planeswalker." });
const giant = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });
const ogre = card("Gray Ogre", "Creature — Ogre", "{2}{R}", { power: "2", toughness: "2" });
const dragon = card("Shivan Dragon", "Creature — Dragon", "{4}{R}{R}", { power: "5", toughness: "5" });
const forestCard = card("Forest", "Basic Land — Forest");

const nextAfter = (s: GameState, p: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(p) + 1) % 4]!;
/** Pass priority until the stack and trigger queue are empty, answering what comes up with `answer`. */
function settle(s: GameState, answer: (p: PendingDecision) => Parameters<typeof act>[1] | undefined = () => undefined) {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const a = s.pending ? answer(s.pending) : undefined;
    if (s.pending && !a) return s;
    s = act(s, a ?? { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
}
function inLibrary(s: GameState, pid: PlayerId, def: CardDef) {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
}
const run = (s: GameState, plan: Parameters<typeof act>[1][] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return s;
};

describe("round 96 zone cards", () => {
  it("parse", () => {
    for (const d of [evolution, ghostform, ascension, scepter, mockingbird, nantuko]) expect(isFullySupported(d), d.name).toBe(true);
  });
});

describe("Eldritch Evolution", () => {
  it("finds a creature card with mana value up to 2 plus the sacrificed creature's, and exiles itself", () => {
    const { s: s0, ap, ids } = setup([evolution]);
    const fodder = putOnBattlefield(s0, ap, bear());
    const four = inLibrary(s0, ap, giant);
    const six = inLibrary(s0, ap, dragon);
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { sacrifice: [fodder] }));
    expect(s.objects[fodder]!.zone).toBe("graveyard");
    s = settle(s);
    expect(s.pending?.kind).toBe("searchLibrary");
    const offered = (s.pending as Extract<PendingDecision, { kind: "searchLibrary" }>).cards;
    expect(offered).toContain(four);
    expect(offered).not.toContain(six);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [four] }));
    expect(s.objects[four]!.zone).toBe("battlefield");
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
  });
});

describe("Kaya's Ghostform", () => {
  const enchant = (s: GameState, ap: PlayerId, host: string) => {
    const g = putOnBattlefield(s, ap, ghostform);
    s.objects[g]!.attachedTo = host;
    return g;
  };

  it("the enchanted creature dies: it comes back under your control", () => {
    const { s: s0, ap } = setup([]);
    const b = putOnBattlefield(s0, ap, bear());
    const g = enchant(s0, ap, b);
    s0.objects[b]!.damage = 5;
    runStateBasedActions(s0);
    const s = settle(s0);
    expect(s.objects[g]!.zone).toBe("graveyard");
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[b]!.controller).toBe(ap);
  });

  it("the enchanted creature is exiled: it comes back too", () => {
    const { s: s0, ap, ids } = setup([exileIt]);
    const b = putOnBattlefield(s0, ap, bear());
    enchant(s0, ap, b);
    const s = settle(cast(s0, ap, ids[0]!, [target(b)]));
    expect(s.objects[b]!.zone).toBe("battlefield");
  });

  it("returned to the hand: it stays there", () => {
    const { s: s0, ap } = setup([]);
    const b = putOnBattlefield(s0, ap, bear());
    enchant(s0, ap, b);
    s0.battlefield.splice(s0.battlefield.indexOf(b), 1);
    s0.objects[b]!.zone = "hand";
    s0.players[ap]!.hand.push(b);
    runStateBasedActions(s0);
    const s = settle(s0);
    expect(s.objects[b]!.zone).toBe("hand");
  });
});

describe("Bloodchief Ascension", () => {
  const yes = (pid: PlayerId) => (p: PendingDecision) => (p.kind === "chooseMay" && p.player === pid ? ({ type: "chooseMay", player: pid, yes: true } as const) : undefined);
  const toEnd = (s: GameState, ap: PlayerId) => {
    for (let i = 0; i < 400 && !(s.step === "end" && !s.stack.length && !s.triggerQueue.length && !s.pending); i++) {
      if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes: true });
      else if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: ap, attacks: [] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    return s;
  };

  it("a quest counter at the end step only if an opponent lost 2 or more life this turn", () => {
    const { s: s0, ap, ids } = setup([sting, shock]);
    const a = putOnBattlefield(s0, ap, ascension);
    let s = settle(cast(s0, ap, ids[0]!, [{ kind: "player", id: nextAfter(s0, ap) }]));
    const t1 = toEnd(structuredClone(s), ap);
    expect(t1.objects[a]!.counters.quest ?? 0).toBe(0);
    s = settle(cast(s, ap, ids[1]!, [{ kind: "player", id: nextAfter(s0, ap) }]));
    s = toEnd(s, ap);
    expect(s.objects[a]!.counters.quest).toBe(1);
  });

  it("with three quest counters: a card put into an opponent's graveyard drains them for 2", () => {
    const { s: s0, ap, ids } = setup([shock]);
    const a = putOnBattlefield(s0, ap, ascension);
    s0.objects[a]!.counters.quest = 3;
    const opp = nextAfter(s0, ap);
    const theirs = putOnBattlefield(s0, opp, bear());
    const s = settle(cast(s0, ap, ids[0]!, [target(theirs)]), yes(ap));
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(38);
    expect(s.players[ap]!.life).toBe(42);
  });

  it("with two quest counters, or a card into your own graveyard: nothing", () => {
    const { s: s0, ap, ids } = setup([shock, bigBolt]);
    const a = putOnBattlefield(s0, ap, ascension);
    s0.objects[a]!.counters.quest = 2;
    const opp = nextAfter(s0, ap);
    const theirs = putOnBattlefield(s0, opp, bear());
    let s = settle(cast(s0, ap, ids[0]!, [target(theirs)]), yes(ap));
    expect(s.players[opp]!.life).toBe(40);
    s.objects[a]!.counters.quest = 3;
    // My own Lava Axe goes to my graveyard.
    s = settle(cast(s, ap, ids[1]!, [{ kind: "player", id: opp }]), yes(ap));
    expect(s.players[opp]!.life).toBe(35);
    expect(s.players[ap]!.life).toBe(40);
  });
});

describe("Isochron Scepter", () => {
  const imprint = (s: GameState, ap: PlayerId, sc: string, instant: string) =>
    settle(s, (p) =>
      p.kind === "chooseMay" ? { type: "chooseMay", player: ap, yes: true } : p.kind === "searchLibrary" ? { type: "searchLibrary", player: ap, found: [instant] } : undefined,
    );

  it("imprints an instant; {2},{T}: cast a copy of it free; the copy ceases to exist after it resolves", () => {
    const { s: s0, ap, ids } = setup([scepter, shock]);
    let s = imprint(cast(s0, ap, ids[0]!), ap, ids[0]!, ids[1]!);
    expect(s.objects[ids[1]!]!.zone).toBe("exile");
    const opp = nextAfter(s, ap);
    s = run(s, planActivate(s, ap, ids[0]!, 0));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap });
    const copy = (s.pending as Extract<PendingDecision, { kind: "castFree" }>).objectId;
    expect(copy).not.toBe(ids[1]!);
    s = settle(run(s, planCast(s, ap, copy, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(38);
    expect(s.objects[copy]).toBeUndefined();
    expect(s.objects[ids[1]!]!.zone).toBe("exile");
    expect(s.players[ap]!.graveyard).not.toContain(copy);
  });

  it("declining to cast the copy: it ceases to exist", () => {
    const { s: s0, ap, ids } = setup([scepter, shock]);
    let s = imprint(cast(s0, ap, ids[0]!), ap, ids[0]!, ids[1]!);
    s = settle(run(s, planActivate(s, ap, ids[0]!, 0)));
    const copy = (s.pending as Extract<PendingDecision, { kind: "castFree" }>).objectId;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.objects[copy]).toBeUndefined();
    expect(s.players[ap]!.exile).toEqual([ids[1]!]);
  });

  it("only an instant with mana value 2 or less can be imprinted", () => {
    const { s: s0, ap, ids } = setup([scepter, bigBolt]);
    const s = settle(cast(s0, ap, ids[0]!), (p) => (p.kind === "chooseMay" ? { type: "chooseMay", player: ap, yes: true } : undefined));
    if (s.pending?.kind === "searchLibrary") expect(s.pending.cards).not.toContain(ids[1]!);
    expect(s.objects[ids[1]!]!.zone).toBe("hand");
  });
});

describe("Mockingbird", () => {
  it("copies a creature with mana value up to the mana spent on it, and is a Bird with flying", () => {
    const { s: s0, ap, ids } = setup([mockingbird]);
    const opp = nextAfter(s0, ap);
    const two = putOnBattlefield(s0, opp, bear());
    const three = putOnBattlefield(s0, opp, ogre);
    const four = putOnBattlefield(s0, opp, giant);
    // X = 2: three mana spent.
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 2));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "copy" });
    const options = (s.pending as Extract<PendingDecision, { kind: "chooseOption" }>).options;
    expect(options).toEqual(expect.arrayContaining([two, three, "none"]));
    expect(options).not.toContain(four);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: three }));
    const me = s.objects[ids[0]!]!;
    expect(nameOf(s, ids[0]!)).toBe("Gray Ogre");
    expect(characteristics(s, me).subtypes).toEqual(expect.arrayContaining(["Ogre", "Bird"]));
    expect(characteristics(s, me).keywords).toContain("Flying");
  });

  it("X = 0: only mana value 1 or less", () => {
    const { s: s0, ap, ids } = setup([mockingbird]);
    putOnBattlefield(s0, nextAfter(s0, ap), bear());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 0)));
    expect(s.pending).toBeFalsy();
    expect(nameOf(s, ids[0]!)).toBe("Mockingbird");
  });
});

describe("Springheart Nantuko", () => {
  const tokens = (s: GameState, pid: PlayerId) => s.battlefield.map((id) => s.objects[id]!).filter((o) => o.isToken && o.controller === pid);

  it("bestowed: landfall, pay {1}{G} for a token copy of the enchanted creature", () => {
    const { s: s0, ap, ids } = setup([nantuko, forestCard]);
    const b = putOnBattlefield(s0, ap, giant);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(b)], undefined, undefined, undefined, { alt: "bestow" })));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(b);
    s = settle(act(s, { type: "playLand", player: ap, objectId: ids[1]! }));
    expect(s.pending).toMatchObject({ kind: "chooseMay", pay: { mana: "{1}{G}" } });
    // Mana first, then yes.
    const untapped = (name: string) => s.battlefield.find((id) => nameOf(s, id) === name && !s.objects[id]!.tapped && s.objects[id]!.controller === ap)!;
    s = act(s, { type: "activateMana", player: ap, objectId: untapped("Forest"), mana: "G" });
    s = act(s, { type: "activateMana", player: ap, objectId: untapped("Mountain"), mana: "R" });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    const made = tokens(s, ap);
    expect(made.map((o) => nameOf(s, o.id))).toEqual(["Hill Giant"]);
  });

  it("bestowed but not paying: an Insect token", () => {
    const { s: s0, ap, ids } = setup([nantuko, forestCard]);
    const b = putOnBattlefield(s0, ap, giant);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(b)], undefined, undefined, undefined, { alt: "bestow" })));
    s = act(s, { type: "playLand", player: ap, objectId: ids[1]! });
    s = settle(s, (p) => (p.kind === "chooseMay" ? { type: "chooseMay", player: ap, yes: false } : undefined));
    expect(tokens(s, ap).map((o) => nameOf(s, o.id))).toEqual(["Insect Token"]);
  });

  it("a creature, not attached: an Insect token, no offer to pay", () => {
    const { s: s0, ap, ids } = setup([forestCard]);
    putOnBattlefield(s0, ap, nantuko);
    let s = act(s0, { type: "playLand", player: ap, objectId: ids[0]! });
    s = settle(s);
    expect(s.pending).toBeFalsy();
    expect(tokens(s, ap).map((o) => nameOf(s, o.id))).toEqual(["Insect Token"]);
  });
});
