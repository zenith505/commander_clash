// Round 388: copies of spells that gain abilities, going on applying to the token a copy of a permanent spell becomes (CR
// 400.7a, 608.3f, 707.10f): Spider-Verse's "you may copy it. If you do, you may choose new targets for the copy. If the copy
// is a permanent spell, it gains haste. Do this only once each turn." (CR 603.2h), Mizzix, Replica Rider's paid copy with
// haste and "At the beginning of your end step, sacrifice this permanent.", Choreographed Sparks's copy of a creature spell
// with haste and an end step sacrifice; and The Brothers' War's chapter II, two target players whose creatures attack each
// other each combat until your next turn (CR 115.3, 508.1d, 611.2c).

import { describe, expect, it } from "vitest";
import { act, bear, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, parseManaCost, planCast, planMana, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const spiderVerse = (): CardDef => ({"oracleId":"7ef7d902-1f05-40b3-8997-dec197b0b678","name":"Spider-Verse","manaCost":"{3}{R}{R}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"The \"legend rule\" doesn't apply to Spiders you control.\nWhenever you cast a spell from anywhere other than your hand, you may copy it. If you do, you may choose new targets for the copy. If the copy is a permanent spell, it gains haste. Do this only once each turn.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const mizzix = (): CardDef => ({"oracleId":"24a7e1d2-0bc9-40a9-a606-f0017bde3dab","name":"Mizzix, Replica Rider","manaCost":"{4}{R}","cmc":5,"typeLine":"Legendary Creature — Goblin Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Goblin","Wizard"],"oracleText":"Flying\nWhenever you cast a spell from anywhere other than your hand, you may pay {1}{U/R}. If you do, copy that spell and you may choose new targets for the copy. If the copy is a permanent spell, it gains haste and \"At the beginning of your end step, sacrifice this permanent.\" (A copy of a permanent spell becomes a token.)","power":"4","toughness":"5","colors":["R"],"colorIdentity":["R","U"],"keywords":["Flying"],"commanderLegal":"legal","set":"j22","releasedAt":"2022-12-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const sparks = (): CardDef => ({"oracleId":"61495793-b0c7-40a5-ad3e-9df8e2b8096b","name":"Choreographed Sparks","manaCost":"{R}{R}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"This spell can't be copied.\nChoose one or both —\n• Copy target instant or sorcery spell you control. You may choose new targets for the copy.\n• Copy target creature spell you control. The copy gains haste and \"At the beginning of the end step, sacrifice this token.\"","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"sos","releasedAt":"2026-04-24","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const brothersWar = (): CardDef => ({"oracleId":"43040c34-acad-4d62-893d-fd606fa9d8fe","name":"The Brothers' War","manaCost":"{3}{R}","cmc":4,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Create two tapped Powerstone tokens.\nII — Choose two target players. Until your next turn, each creature they control attacks the other chosen player each combat if able.\nIII — This Saga deals X damage to any target and X damage to any other target, where X is the number of artifacts you control.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"brc","releasedAt":"2022-11-18","rarity":"rare","layout":"saga","gameChanger":false}) as CardDef;
const release = (): CardDef => ({"oracleId":"49d6a9be-1d10-4ce4-afa3-aa637f39b898","name":"Release to the Wind","manaCost":"{2}{U}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Exile target nonland permanent. For as long as that card remains exiled, its owner may cast it without paying its mana cost.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"rix","releasedAt":"2018-01-19","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const firebolt = (): CardDef => ({"oracleId":"7aa31280-12c3-479d-a6dd-f1c669043083","name":"Firebolt","manaCost":"{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Firebolt deals 2 damage to any target.\nFlashback {4}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.)","colors":["R"],"colorIdentity":["R"],"keywords":["Flashback"],"commanderLegal":"legal","set":"ema","releasedAt":"2016-06-10","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const thinkTwice = (): CardDef => ({"oracleId":"fa85c5a2-8e83-4624-a35a-a0bbf17ecbb4","name":"Think Twice","manaCost":"{1}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Draw a card.\nFlashback {2}{U} (You may cast this card from your graveyard for its flashback cost. Then exile it.)","colors":["U"],"colorIdentity":["U"],"keywords":["Flashback"],"commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const crawWurm = (): CardDef => ({"oracleId":"6a462a69-3e42-41de-a3aa-a488d9f38d69","name":"Craw Wurm","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Creature — Wurm","supertypes":[],"types":["Creature"],"subtypes":["Wurm"],"oracleText":"","power":"6","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Pass, and let bots answer every other choice, until the stack and trigger queue are empty; `answer` gives the test's own answer. */
function settle(s: GameState, answer?: (s: GameState) => Action | Action[] | undefined) {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    const mine = answer?.(s);
    if (mine) for (const a of Array.isArray(mine) ? mine : [mine]) s = act(s, a);
    else if (s.pending) s = act(s, botActions(s, pid)[0]!);
    else s = act(s, { type: "passPriority", player: pid });
  }
  return s;
}
/** A card of `pid`'s in `zone`. */
function cardIn(s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard") {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  s.players[pid]!.hand.includes(id) || s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
}
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const named = (s: GameState, name: string, pid?: PlayerId) => s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === name && (pid === undefined || s.objects[id]!.controller === pid));
const opps = (s: GameState, ap: PlayerId) => [1, 2, 3].map((i) => s.turnOrder[(s.turnOrder.indexOf(ap) + i) % 4]!) as [PlayerId, PlayerId, PlayerId];
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
/** Answers each "you may" from `source` with `yes` (tapping lands for its mana cost first), counting how many were asked. */
const mayFrom = (source: string, yes: boolean, asked: { n: number }, then?: (s: GameState) => Action | undefined) => (s: GameState): Action[] | Action | undefined => {
  const p = s.pending;
  if (p?.kind === "chooseMay" && p.source === source) {
    asked.n++;
    const mana = yes && p.pay?.mana ? planMana(s, p.player, parseManaCost(p.pay.mana)) : [];
    if (!mana) throw new Error(`can't pay ${p.pay?.mana}`);
    return [...mana, { type: "chooseMay", player: p.player, yes }];
  }
  return then?.(s);
};

describe("round 388 cards compile", () => {
  it("Spider-Verse, Mizzix, Replica Rider, Choreographed Sparks and The Brothers' War are fully supported", () => {
    for (const d of [spiderVerse(), mizzix(), sparks(), brothersWar()]) expect(isFullySupported(d), d.name).toBe(true);
  });
});

describe("Spider-Verse", () => {
  it("a spell cast from a graveyard may be copied, with new targets; then not again this turn (CR 603.2h)", () => {
    const { s: s0, ap } = setup([]);
    const [b1, b2] = opps(s0, ap);
    putOnBattlefield(s0, ap, spiderVerse());
    const fb = cardIn(s0, ap, firebolt(), "graveyard");
    const tt = cardIn(s0, ap, thinkTwice(), "graveyard");
    const asked = { n: 0 };
    let retarget = 0;
    let s = settle(run(s0, planCast(s0, ap, fb, [player(b1)], undefined, undefined, undefined, { via: "flashback" })), mayFrom("Spider-Verse", true, asked, (x) => {
      if (x.pending?.kind !== "copyTargets") return undefined;
      retarget++;
      return { type: "copyTargets", player: ap, targets: [player(b2)] };
    }));
    expect(asked.n).toBe(1);
    expect(retarget).toBe(1);
    expect(life(s, b1)).toBe(38);
    expect(life(s, b2)).toBe(38);
    // Think Twice from the graveyard too: it doesn't trigger again this turn.
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, tt, undefined, undefined, undefined, undefined, { via: "flashback" })), mayFrom("Spider-Verse", true, asked));
    expect(asked.n).toBe(1);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("declining to copy doesn't use it up: the next spell cast from anywhere other than a hand still triggers it", () => {
    const { s: s0, ap } = setup([]);
    const [b1] = opps(s0, ap);
    putOnBattlefield(s0, ap, spiderVerse());
    const fb = cardIn(s0, ap, firebolt(), "graveyard");
    const tt = cardIn(s0, ap, thinkTwice(), "graveyard");
    const no = { n: 0 };
    let s = settle(run(s0, planCast(s0, ap, fb, [player(b1)], undefined, undefined, undefined, { via: "flashback" })), mayFrom("Spider-Verse", false, no));
    expect(no.n).toBe(1);
    expect(life(s, b1)).toBe(38);
    const yes = { n: 0 };
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, tt, undefined, undefined, undefined, undefined, { via: "flashback" })), mayFrom("Spider-Verse", true, yes));
    expect(yes.n).toBe(1);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });

  it("a commander cast from the command zone is copied: the copy is a legendary token with haste, not a commander", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, spiderVerse());
    const cmd = Object.values(s0.objects).find((o) => o.owner === ap && o.zone === "command")!.id;
    const asked = { n: 0 };
    let token: string | undefined;
    // The legend rule applies to the commander and the copy (they're Elves, not Spiders): keep the token.
    const s = settle(run(s0, planCast(s0, ap, cmd)), mayFrom("Spider-Verse", true, asked, (x) => {
      const p = x.pending;
      if (p?.kind !== "chooseOption" || p.what !== "legend") return undefined;
      token = p.options.find((id) => x.objects[id]?.isToken);
      expect(p.options).toContain(cmd);
      return { type: "chooseOption", player: ap, choice: token! };
    }));
    expect(asked.n).toBe(1);
    expect(token).toBeDefined();
    expect(s.objects[token!]!.zone).toBe("battlefield");
    expect(s.objects[token!]!.isCommander).toBe(false);
    expect(objHasKeyword(s, s.objects[token!]!, "Haste")).toBe(true);
  });

  it("a spell cast from its owner's hand doesn't trigger it", () => {
    const { s: s0, ap, ids } = setup([bolt()]);
    const [b1] = opps(s0, ap);
    putOnBattlefield(s0, ap, spiderVerse());
    const asked = { n: 0 };
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [player(b1)])), mayFrom("Spider-Verse", true, asked));
    expect(asked.n).toBe(0);
    expect(life(s, b1)).toBe(37);
  });

  it("a copy of a permanent spell becomes a token with haste; the spell copied doesn't gain it", () => {
    const { s: s0, ap, ids } = setup([release()]);
    putOnBattlefield(s0, ap, spiderVerse());
    const wurm = putOnBattlefield(s0, ap, crawWurm());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: wurm }])));
    expect(s.objects[wurm]!.zone).toBe("exile");
    const asked = { n: 0 };
    s = settle(run(s, planCast(s, ap, wurm)), mayFrom("Spider-Verse", true, asked));
    expect(asked.n).toBe(1);
    const wurms = named(s, "Craw Wurm", ap);
    expect(wurms).toHaveLength(2);
    const token = wurms.find((id) => s.objects[id]!.isToken)!;
    expect(token).toBeDefined();
    expect(objHasKeyword(s, s.objects[token]!, "Haste")).toBe(true);
    expect(objHasKeyword(s, s.objects[wurm]!, "Haste")).toBe(false);
  });

  it("once a spell is copied, an instance already on the stack does nothing (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const [b1] = opps(s0, ap);
    putOnBattlefield(s0, ap, spiderVerse());
    const fb = cardIn(s0, ap, firebolt(), "graveyard");
    const tt = cardIn(s0, ap, thinkTwice(), "graveyard");
    let s = run(s0, planCast(s0, ap, fb, [player(b1)], undefined, undefined, undefined, { via: "flashback" }));
    // Firebolt's trigger goes on the stack; with priority, Think Twice from the graveyard, whose trigger goes on top.
    for (let i = 0; i < 5 && s.triggerQueue.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.stack.filter((x) => x.kind === "ability")).toHaveLength(1);
    s = run(s, planCast(s, ap, tt, undefined, undefined, undefined, undefined, { via: "flashback" }));
    const asked = { n: 0 };
    const hand = s.players[ap]!.hand.length;
    s = settle(s, mayFrom("Spider-Verse", true, asked));
    expect(asked.n).toBe(1);
    expect(s.players[ap]!.hand.length).toBe(hand + 2); // Think Twice and its copy
    expect(life(s, b1)).toBe(38); // Firebolt alone
  });
});

describe("Mizzix, Replica Rider", () => {
  it("paying {1}{U/R} copies a spell cast from a graveyard", () => {
    const { s: s0, ap } = setup([]);
    const [b1] = opps(s0, ap);
    putOnBattlefield(s0, ap, mizzix());
    const fb = cardIn(s0, ap, firebolt(), "graveyard");
    const asked = { n: 0 };
    const s = settle(run(s0, planCast(s0, ap, fb, [player(b1)], undefined, undefined, undefined, { via: "flashback" })), mayFrom("Mizzix, Replica Rider", true, asked, (x) => (x.pending?.kind === "copyTargets" ? { type: "copyTargets", player: ap } : undefined)));
    expect(asked.n).toBe(1);
    expect(life(s, b1)).toBe(36);
    // Firebolt's flashback (5) and Mizzix's cost (2) tapped seven of the fourteen lands.
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.objects[id]!.tapped)).toHaveLength(7);
  });

  it("not paying makes no copy", () => {
    const { s: s0, ap } = setup([]);
    const [b1] = opps(s0, ap);
    putOnBattlefield(s0, ap, mizzix());
    const fb = cardIn(s0, ap, firebolt(), "graveyard");
    const asked = { n: 0 };
    const s = settle(run(s0, planCast(s0, ap, fb, [player(b1)], undefined, undefined, undefined, { via: "flashback" })), mayFrom("Mizzix, Replica Rider", false, asked));
    expect(asked.n).toBe(1);
    expect(life(s, b1)).toBe(38);
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.objects[id]!.tapped)).toHaveLength(5);
  });

  it("a copy of a permanent spell is a token with haste, sacrificed at the beginning of your end step", () => {
    const { s: s0, ap, ids } = setup([release()]);
    putOnBattlefield(s0, ap, mizzix());
    const wurm = putOnBattlefield(s0, ap, crawWurm());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: wurm }])));
    const asked = { n: 0 };
    s = settle(run(s, planCast(s, ap, wurm)), mayFrom("Mizzix, Replica Rider", true, asked));
    expect(asked.n).toBe(1);
    const token = named(s, "Craw Wurm", ap).find((id) => s.objects[id]!.isToken)!;
    expect(token).toBeDefined();
    expect(objHasKeyword(s, s.objects[token]!, "Haste")).toBe(true);
    s = settle(passUntil(s, "end", ap));
    expect(s.objects[token]).toBeUndefined();
    expect(named(s, "Craw Wurm", ap)).toEqual([wurm]);
  });
});

describe("Choreographed Sparks", () => {
  it("copies a creature spell you control: the token has haste and is sacrificed at the beginning of the end step", () => {
    const { s: s0, ap, ids } = setup([crawWurm(), sparks()]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    const spell = s.stack.find((x) => x.objectId === ids[0])!;
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: spell.id }], [1])));
    const wurms = named(s, "Craw Wurm", ap);
    expect(wurms).toHaveLength(2);
    const token = wurms.find((id) => s.objects[id]!.isToken)!;
    expect(objHasKeyword(s, s.objects[token]!, "Haste")).toBe(true);
    expect(objHasKeyword(s, s.objects[ids[0]!]!, "Haste")).toBe(false);
    s = settle(passUntil(s, "end", ap));
    expect(s.objects[token]).toBeUndefined();
    expect(named(s, "Craw Wurm", ap)).toEqual([ids[0]]);
  });

  it("copies an instant you control, with new targets", () => {
    const { s: s0, ap, ids } = setup([bolt(), sparks()]);
    const [b1, b2] = opps(s0, ap);
    let s = run(s0, planCast(s0, ap, ids[0]!, [player(b1)]));
    const spell = s.stack.find((x) => x.objectId === ids[0])!;
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: spell.id }], [0])), (x) => (x.pending?.kind === "copyTargets" ? { type: "copyTargets", player: ap, targets: [player(b2)] } : undefined));
    expect(life(s, b1)).toBe(37);
    expect(life(s, b2)).toBe(37);
  });

  it("only a creature spell you control is a legal target for its second mode", () => {
    const { s: s0, ap, ids } = setup([sparks(), bolt()]);
    const [b1] = opps(s0, ap);
    // With only an instant of yours on the stack, the second mode has no legal target.
    const s = run(s0, planCast(s0, ap, ids[1]!, [player(b1)]));
    const spell = s.stack.find((x) => x.objectId === ids[1])!;
    expect(planCast(s, ap, ids[0]!, [{ kind: "stack", id: spell.id }], [1])).toBeNull();
    expect(planCast(s, ap, ids[0]!, [{ kind: "stack", id: spell.id }], [0])).not.toBeNull();
  });
});

/** As passUntil, but every declaration of attackers is a bot's (obeying any attack requirement). */
function passObeying(s: GameState, step: GameState["step"], active: PlayerId) {
  for (let i = 0; i < 3000; i++) {
    if (s.step === step && s.activePlayer === active && !s.pending) return s;
    const pid = waitingOn(s)!;
    if (s.pending?.kind === "declareAttackers" || s.pending?.kind === "declareBlockers") s = act(s, botActions(s, pid)[0]!);
    else if (s.pending) s = act(s, botActions(s, pid)[0]!);
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error(`never reached ${step}`);
}

describe("The Brothers' War", () => {
  /** The Saga with one lore counter, a Bear for each of the next two players; on to its controller's next draw step, then chapter II's targets. */
  const ready = () => {
    const { s: s0, ap } = setup([]);
    const [b1, b2, b3] = opps(s0, ap);
    const saga = putOnBattlefield(s0, ap, brothersWar());
    s0.objects[saga]!.counters.lore = 1;
    const bear1 = putOnBattlefield(s0, b1, bear());
    const bear2 = putOnBattlefield(s0, b2, bear());
    const bear3 = putOnBattlefield(s0, b3, bear());
    let s = passUntil(s0, "draw", ap);
    s = passUntil(s, "main1", ap, 50);
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    return { s, ap, b1, b2, b3, bear1, bear2, bear3 };
  };

  it("chapter II: each creature the two players control attacks the other one each combat if able", () => {
    const r = ready();
    let s = settle(act(r.s, { type: "chooseTargets", player: r.ap, targets: [player(r.b1), player(r.b2)] }));
    expect(characteristics(s, s.objects[r.bear1]!).mustAttack).toEqual([r.b2]);
    expect(characteristics(s, s.objects[r.bear2]!).mustAttack).toEqual([r.b1]);
    expect(characteristics(s, s.objects[r.bear3]!).mustAttack).toEqual([]);
    // The first player's turn: its Bear must attack the second player.
    s = passUntil(s, "declareAttackers", r.b1);
    expect(() => act(s, { type: "declareAttackers", player: r.b1, attacks: [] })).toThrow();
    expect(() => act(s, { type: "declareAttackers", player: r.b1, attacks: [{ attacker: r.bear1, defender: r.ap }] })).toThrow();
    expect(() => act(s, { type: "declareAttackers", player: r.b1, attacks: [{ attacker: r.bear1, defender: r.b2 }] })).not.toThrow();
    // A bot obeys it.
    const decl = botActions(s, r.b1).find((a) => a.type === "declareAttackers");
    expect(decl?.type === "declareAttackers" && decl.attacks.find((a) => a.attacker === r.bear1)?.defender).toBe(r.b2);
  });

  it("chapter II: the creatures are those they control as it resolves (CR 611.2c), and it ends as your next turn begins", () => {
    const r = ready();
    let s = settle(act(r.s, { type: "chooseTargets", player: r.ap, targets: [player(r.b1), player(r.b2)] }));
    const later = putOnBattlefield(s, r.b1, bear());
    expect(characteristics(s, s.objects[later]!).mustAttack).toEqual([]);
    s = passObeying(s, "upkeep", r.ap);
    expect(characteristics(s, s.objects[r.bear1]!).mustAttack).toEqual([]);
    expect(characteristics(s, s.objects[r.bear2]!).mustAttack).toEqual([]);
  });

  it("chapter II's targets are two different players (CR 115.3), you among them if you like", () => {
    const r = ready();
    expect(() => act(r.s, { type: "chooseTargets", player: r.ap, targets: [player(r.b1), player(r.b1)] })).toThrow();
    const mine = putOnBattlefield(r.s, r.ap, bear());
    const s = settle(act(r.s, { type: "chooseTargets", player: r.ap, targets: [player(r.ap), player(r.b3)] }));
    expect(characteristics(s, s.objects[mine]!).mustAttack).toEqual([r.b3]);
    expect(characteristics(s, s.objects[r.bear3]!).mustAttack).toEqual([r.ap]);
  });
});

describe("round 388 bots", () => {
  it("a bot copies its spell with Spider-Verse and pays for Mizzix's copy", () => {
    for (const [copier, source] of [[spiderVerse, "Spider-Verse"], [mizzix, "Mizzix, Replica Rider"]] as const) {
      const { s: s0, ap } = setup([]);
      const [b1] = opps(s0, ap);
      putOnBattlefield(s0, ap, copier());
      const fb = cardIn(s0, ap, firebolt(), "graveyard");
      let asked = 0;
      const s = settle(run(s0, planCast(s0, ap, fb, [player(b1)], undefined, undefined, undefined, { via: "flashback" })), (x) => {
        if (x.pending?.kind === "chooseMay" && x.pending.source === source) asked++;
        return undefined;
      });
      expect(asked, source).toBeGreaterThan(0); // (a bot taps its lands one action at a time while it is asked)
      expect(life(s, b1) + life(s, opps(s, ap)[1]) + life(s, opps(s, ap)[2]) + life(s, ap), source).toBe(156);
    }
  });
});
