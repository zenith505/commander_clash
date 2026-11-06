// Lane B round B119: Sivvi's Valor (damage to a target creature dealt to you instead), Treacherous Link (damage to the
// enchanted creature dealt to its controller instead).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; questions of the players in `me` stop it, others the bots answer. */
const settle = (s: GameState, opts: { me?: PlayerId[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me?.includes(p.player)) return s;
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const next = (s: GameState, p: PlayerId, n = 1) => s.turnOrder[(s.turnOrder.indexOf(p) + n) % 4]!;
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
const pt = (s: GameState, id: string) => { const c = characteristics(s, s.objects[id]!); return `${c.power}/${c.toughness}`; };
/** Moves a new card for `def` from the battlefield into `pid`'s `zone` (on top of a library, or of a graveyard). */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Empties `pid`'s hand into exile. */
const emptyHand = (s: GameState, pid: PlayerId) => {
  for (const id of s.players[pid]!.hand) {
    s.objects[id]!.zone = "exile";
    s.players[pid]!.exile.push(id);
  }
  s.players[pid]!.hand = [];
};
/** Only this mana for `pid`: their lands go to exile. */
const poolOnly = (s: GameState, pid: PlayerId, pool: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  for (const id of s.battlefield.filter((x) => s.objects[x]!.controller === pid && characteristics(s, s.objects[x]!).types.includes("Land"))) {
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "exile";
    s.players[pid]!.exile.push(id);
  }
  s.players[pid]!.manaPool = { ...s.players[pid]!.manaPool, ...pool };
  invalidateCharacteristics(s);
};
/** To `pid`'s declare blockers question in this combat, after the active player attacked. */
const toBlocks = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 200 && !(s.pending?.kind === "declareBlockers" && s.pending.player === pid); i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};

// Real oracle text (Scryfall).
const valor = (): CardDef => ({"oracleId":"e02164ba-34f8-4a5f-a05b-dd3ef3f8ceae","name":"Sivvi's Valor","manaCost":"{2}{W}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"If you control a Plains, you may tap an untapped creature you control rather than pay this spell's mana cost.\nAll damage that would be dealt to target creature this turn is dealt to you instead.","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const link = (): CardDef => ({"oracleId":"b7902113-9ddf-4d81-a76a-b54b8a36c154","name":"Treacherous Link","manaCost":"{1}{B}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nAll damage that would be dealt to enchanted creature is dealt to its controller instead.","colors":["B"],"colorIdentity":["B"],"keywords":["Enchant"],"commanderLegal":"legal","layout":"normal"}) as CardDef;

const hauler = (): CardDef => ({"oracleId":"a55bdb73-e17a-414d-b27f-dc53af2f345c","name":"Quarry Hauler","manaCost":"{3}{G}","cmc":4,"typeLine":"Creature — Camel","supertypes":[],"types":["Creature"],"subtypes":["Camel"],"oracleText":"When this creature enters, for each kind of counter on target permanent, put another counter of that kind on it or remove one from it.","power":"4","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const puppet = (): CardDef => ({"oracleId":"e3473ed5-f2b2-4a41-aed9-ee37caa9d7be","name":"Dramatist's Puppet","manaCost":"{4}","cmc":4,"typeLine":"Artifact Creature — Construct","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Construct"],"oracleText":"When this creature enters, for each kind of counter on target permanent, put another counter of that kind on it or remove one from it.","power":"2","toughness":"4","colors":[],"colorIdentity":[],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const magemark = (): CardDef => ({"oracleId":"dffa7c06-096a-47f8-9645-1ba7306ba5b0","name":"Necromancer's Magemark","manaCost":"{2}{B}","cmc":3,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nCreatures you control that are enchanted get +1/+1.\nIf a creature you control that's enchanted would die, return it to its owner's hand instead.","colors":["B"],"colorIdentity":["B"],"keywords":["Enchant"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const fellowship = (): CardDef => ({"oracleId":"26f87a39-29ed-4649-b5d8-204f6a40a41d","name":"Earnest Fellowship","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Each creature has protection from each of its colors.","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const crystal = (): CardDef => ({"oracleId":"f5fd3141-6fd9-4491-9f29-7fd81209bd57","name":"Memory Crystal","manaCost":"{3}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"Buyback costs cost {2} less.","colors":[],"colorIdentity":[],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const warbringer = (): CardDef => ({"oracleId":"0636090b-49e0-45b4-a68d-48b1cdc0c54d","name":"Warbringer","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Orc Berserker","supertypes":[],"types":["Creature"],"subtypes":["Orc","Berserker"],"oracleText":"Dash costs you pay cost {2} less (as long as this creature is on the battlefield).\nDash {2}{R} (You may cast this spell for its dash cost. If you do, it gains haste, and it's returned from the battlefield to its owner's hand at the beginning of the next end step.)","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":["Dash"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const goblin = (): CardDef => ({"oracleId":"e7436973-9ac8-45b2-9d79-769bfacef4b9","name":"Thick-Skinned Goblin","manaCost":"{1}{R}","cmc":2,"typeLine":"Creature — Goblin Shaman","supertypes":[],"types":["Creature"],"subtypes":["Goblin","Shaman"],"oracleText":"You may pay {0} rather than pay the echo cost for permanents you control.\n{R}: This creature gains protection from red until end of turn.","power":"2","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const kenku = (): CardDef => ({"oracleId":"e262b226-9463-40a9-95b2-fe2c3eafc043","name":"Kenku Artificer","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Bird Artificer","supertypes":[],"types":["Creature"],"subtypes":["Bird","Artificer"],"oracleText":"Homunculus Servant — When this creature enters, put three +1/+1 counters on up to one target noncreature artifact. That artifact becomes a 0/0 Homunculus artifact creature with flying.","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":["Homunculus Servant"],"commanderLegal":"legal","layout":"normal"}) as CardDef;

// Test cards.
const shock = card("Test Shock", "Instant", "{0}", { oracleText: "Test Shock deals 3 damage to target creature." });
const walker = card("Test Walker", "Legendary Planeswalker — Testa", "{3}", { cmc: 3, loyalty: "5", oracleText: "+1: You gain 1 life." });
const whiteShock = card("Test White Shock", "Instant", "{0}", { colors: ["W"], oracleText: "Test White Shock deals 3 damage to target creature." });
const redShock = card("Test Red Shock", "Instant", "{0}", { colors: ["R"], oracleText: "Test Red Shock deals 3 damage to target creature." });
const capsize = card("Test Capsize", "Instant", "{1}{U}{U}", { cmc: 3, colors: ["U"], oracleText: "Buyback {3} (You may pay an additional {3} as you cast this spell. If you do, put this card into your hand as it resolves.)\nReturn target permanent to its owner's hand." });
const dasher = card("Test Dasher", "Creature — Orc", "{3}{R}", { cmc: 4, power: "3", toughness: "3", colors: ["R"], oracleText: "Dash {2}{R} (You may cast this spell for its dash cost. If you do, it gains haste, and it's returned from the battlefield to its owner's hand at the beginning of the next end step.)" });
const echoer = card("Test Echoer", "Creature — Goblin", "{2}{R}", { cmc: 3, power: "3", toughness: "3", colors: ["R"], keywords: ["Echo"], oracleText: "Echo {2}{R} (At the beginning of your upkeep, if this came under your control since the beginning of your last upkeep, sacrifice it unless you pay its echo cost.)" });
const discardEchoer = card("Test Discard Echoer", "Creature — Goblin", "{1}{R}", { cmc: 2, power: "2", toughness: "2", colors: ["R"], keywords: ["Echo"], oracleText: "Echo—Discard a card. (At the beginning of your upkeep, if this came under your control since the beginning of your last upkeep, sacrifice it unless you pay its echo cost.)" });
const big = card("Test Big", "Creature — Giant", "{5}{G}", { cmc: 6, power: "5", toughness: "5", colors: ["G"] });

describe("Lane B round B119", () => {
  it("all the cards are supported", () => supported(valor(), link(), hauler(), puppet(), magemark(), fellowship(), crystal(), warbringer(), goblin(), kenku()));

  it("Sivvi's Valor: all damage to the target creature this turn is dealt to you instead", () => {
    let { s, ap, ids } = setup([valor(), shock, shock]);
    const b = putOnBattlefield(s, ap, bear());
    const life = s.players[ap]!.life;
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(b)])));
    expect(s.players[ap]!.life).toBe(life - 3);
    expect(s.objects[b]!.damage ?? 0).toBe(0);
    expect(zone(s, b)).toBe("battlefield");
    s = settle(run(s, planCast(s, ap, ids[2]!, [tgt(b)])));
    expect(s.players[ap]!.life).toBe(life - 6);
    expect(zone(s, b)).toBe("battlefield");
  });

  it("Sivvi's Valor: cast by tapping an untapped creature you control while you control a Plains; combat damage too", () => {
    let { s, ap, ids } = setup([valor()]);
    const opp = next(s, ap);
    s.battlefield.forEach((id) => s.objects[id]!.controller === ap && (s.objects[id]!.tapped = true));
    const b = putOnBattlefield(s, ap, bear());
    const tapper = putOnBattlefield(s, ap, bear({ name: "Test Tapper" }));
    const g = putOnBattlefield(s, opp, big);
    s = run(s, planCast(s, ap, ids[0]!, [tgt(b)], undefined, "auto", undefined, { alt: "alternative", tap: [tapper] }));
    expect(s.objects[tapper]!.tapped).toBe(true);
    s = settle(s);
    const life = s.players[ap]!.life;
    // The Bear attacks into the 5/5: the blocker's 5 combat damage goes to the Bear's controller, the Bear lives.
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    s = toBlocks(s, opp);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: g, attacker: b }] });
    s = passUntil(s, "endCombat", ap);
    expect(s.players[ap]!.life).toBe(life - 5);
    expect(zone(s, b)).toBe("battlefield");
    expect(s.objects[g]!.damage).toBe(2);
  });

  it("Treacherous Link: damage to the enchanted creature is dealt to its controller instead", () => {
    let { s, ap, ids } = setup([link(), shock]);
    const opp = next(s, ap);
    const g = putOnBattlefield(s, opp, big);
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(g)])));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(g);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(g)])));
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.objects[g]!.damage ?? 0).toBe(0);
  });

  it("Quarry Hauler: each kind of counter on the target, one more or one fewer, chosen kind by kind", () => {
    let { s, ap, ids } = setup([hauler()]);
    const b = putOnBattlefield(s, ap, bear());
    s.objects[b]!.counters = { "+1/+1": 2, charge: 1, stun: 1 };
    invalidateCharacteristics(s);
    s = run(s, planCast(s, ap, ids[0]!, []));
    s = settle(s, { me: [ap] });
    expect(s.pending?.kind).toBe("chooseTargets");
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(b)] } as Action);
    s = settle(s, { me: [ap] });
    const asked: string[] = [];
    const answers: Record<string, string> = { "+1/+1": "add", charge: "remove", stun: "remove" };
    while (s.pending?.kind === "chooseOption" && s.pending.what === "addOrRemoveCounter") {
      const k = s.pending.counterKind!;
      asked.push(k);
      // Nothing changes until every kind is chosen.
      expect(s.objects[b]!.counters).toEqual({ "+1/+1": 2, charge: 1, stun: 1 });
      s = settle(act(s, { type: "chooseOption", player: ap, choice: answers[k]! }), { me: [ap] });
    }
    expect(asked.sort()).toEqual(["+1/+1", "charge", "stun"]);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(3);
    expect(s.objects[b]!.counters.charge ?? 0).toBe(0);
    expect(s.objects[b]!.counters.stun ?? 0).toBe(0);
    expect(pt(s, b)).toBe("5/5");
  });

  it("Dramatist's Puppet: a permanent with no counters, nothing to choose; a planeswalker's loyalty up", () => {
    let { s, ap, ids } = setup([puppet(), puppet()]);
    const b = putOnBattlefield(s, ap, bear());
    const w = putOnBattlefield(s, ap, walker);
    s.objects[w]!.counters = { loyalty: 3 };
    s = run(s, planCast(s, ap, ids[0]!, []));
    s = settle(s, { me: [ap] });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(b)] } as Action), { me: [ap] });
    expect(s.pending).toBeFalsy();
    expect(s.objects[b]!.counters).toEqual({});
    s = run(s, planCast(s, ap, ids[1]!, []));
    s = settle(s, { me: [ap] });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(w)] } as Action), { me: [ap] });
    expect(s.pending?.kind === "chooseOption" && s.pending.what).toBe("addOrRemoveCounter");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "add" }));
    expect(s.objects[w]!.counters.loyalty).toBe(4);
  });

  it("Quarry Hauler: a bot adds helpful counters to its own permanent and takes them off an opponent's", () => {
    let { s, ap, ids } = setup([]);
    const opp = next(s, ap);
    const mine = putOnBattlefield(s, opp, bear());
    s.objects[mine]!.counters = { "+1/+1": 1, stun: 1 };
    const theirs = putOnBattlefield(s, ap, bear());
    s.objects[theirs]!.counters = { "+1/+1": 1, stun: 1 };
    invalidateCharacteristics(s);
    const h = into(s, opp, hauler(), "hand");
    // The bot answers its own question about its own Bear.
    s.players[opp]!.manaPool = { ...s.players[opp]!.manaPool, G: 4 };
    s.activePlayer = opp;
    s.priority = opp;
    s = run(s, planCast(s, opp, h, []));
    for (let i = 0; i < 100 && (s.stack.length || s.pending || s.triggerQueue.length); i++) {
      const p = s.pending;
      if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: [tgt(mine)] } as Action);
      else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[mine]!.counters["+1/+1"]).toBe(2);
    expect(s.objects[mine]!.counters.stun ?? 0).toBe(0);
    expect(s.objects[theirs]!.counters).toEqual({ "+1/+1": 1, stun: 1 });
  });

  it("Necromancer's Magemark: an enchanted creature you control returns to its owner's hand instead of dying; its Auras go", () => {
    let { s, ap, ids } = setup([magemark(), shock, shock]);
    const opp = next(s, ap);
    const b = putOnBattlefield(s, ap, bear());
    const plain = putOnBattlefield(s, ap, bear({ name: "Test Plain Bear" }));
    const theirs = putOnBattlefield(s, opp, bear({ name: "Test Their Bear" }));
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(b);
    // "Creatures you control that are enchanted get +1/+1."
    expect(pt(s, b)).toBe("3/3");
    expect(pt(s, plain)).toBe("2/2");
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(b)])));
    expect(zone(s, b)).toBe("hand");
    expect(s.players[ap]!.graveyard).not.toContain(b);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    // Not enchanted: it dies.
    s = settle(run(s, planCast(s, ap, ids[2]!, [tgt(plain)])));
    expect(zone(s, plain)).toBe("graveyard");
    expect(zone(s, theirs)).toBe("battlefield");
  });

  it("Necromancer's Magemark: another Aura counts, and an opponent's enchanted creature still dies", () => {
    let { s, ap, ids } = setup([shock, shock]);
    const opp = next(s, ap);
    const mm = putOnBattlefield(s, ap, magemark());
    const host = putOnBattlefield(s, opp, bear({ name: "Test Host" }));
    s.objects[mm]!.attachedTo = host;
    const b = putOnBattlefield(s, ap, bear());
    const aura = putOnBattlefield(s, ap, card("Test Aura", "Enchantment — Aura", "{W}", { oracleText: "Enchant creature" }));
    s.objects[aura]!.attachedTo = b;
    invalidateCharacteristics(s);
    expect(pt(s, b)).toBe("3/3");
    // The opponent's creature isn't one you control.
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(host)])));
    expect(zone(s, host)).toBe("graveyard");
    expect(zone(s, mm)).toBe("graveyard");
    expect(zone(s, b)).toBe("battlefield");
  });

  it("Earnest Fellowship: each creature has protection from each of its own colors, none if colorless", () => {
    let { s, ap, ids } = setup([whiteShock, redShock, redShock]);
    const opp = next(s, ap);
    putOnBattlefield(s, ap, fellowship());
    const w = putOnBattlefield(s, opp, bear({ name: "Test White Bear", colors: ["W"] }));
    const r = putOnBattlefield(s, opp, bear({ name: "Test Red Bear", colors: ["R"] }));
    const c = putOnBattlefield(s, opp, card("Test Golem", "Artifact Creature — Golem", "{2}", { power: "2", toughness: "2" }));
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[w]!).keywords).toContain("Protection from white");
    expect(characteristics(s, s.objects[r]!).keywords).toContain("Protection from red");
    expect(characteristics(s, s.objects[c]!).keywords.filter((k) => /^Protection/.test(k))).toEqual([]);
    // A white spell can't target the white creature (CR 702.16b); a red one can, and its damage to a red creature is
    // prevented (CR 702.16e).
    expect(planCast(s, ap, ids[0]!, [tgt(w)])).toBeNull();
    expect(planCast(s, ap, ids[1]!, [tgt(r)])).toBeNull();
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(w)])));
    expect(zone(s, w)).toBe("graveyard");
    s = settle(run(s, planCast(s, ap, ids[2]!, [tgt(c)])));
    expect(zone(s, c)).toBe("graveyard");
  });

  it("Memory Crystal: buyback costs cost {2} less, anyone's, only the generic mana of the buyback cost", () => {
    const { s, ap, ids } = setup([capsize]);
    const opp = next(s, ap);
    const b = putOnBattlefield(s, opp, bear());
    putOnBattlefield(s, opp, crystal());
    poolOnly(s, ap, { U: 2, C: 2 });
    const bb = { buyback: true };
    // {1}{U}{U} plus {3}, less {2}: {2}{U}{U}.
    expect(planCast(s, ap, ids[0]!, [tgt(b)], undefined, undefined, undefined, bb)).not.toBeNull();
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, C: 1 };
    expect(planCast(s, ap, ids[0]!, [tgt(b)], undefined, undefined, undefined, bb)).toBeNull();
    // Two of them take off {3} at most, the buyback cost's generic mana, not the spell's {1} (rulings).
    putOnBattlefield(s, ap, crystal());
    expect(planCast(s, ap, ids[0]!, [tgt(b)], undefined, undefined, undefined, bb)).not.toBeNull();
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, C: 0 };
    expect(planCast(s, ap, ids[0]!, [tgt(b)], undefined, undefined, undefined, bb)).toBeNull();
    // Without buyback it costs its mana cost.
    expect(planCast(s, ap, ids[0]!, [tgt(b)])).toBeNull();
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, C: 1 };
    let s2 = settle(run(s, planCast(s, ap, ids[0]!, [tgt(b)], undefined, undefined, undefined, bb)!));
    expect(zone(s2, b)).toBe("hand");
    expect(zone(s2, ids[0]!)).toBe("hand");
  });

  it("Warbringer: dash costs you pay cost {2} less while it's on the battlefield; not its own, not an opponent's", () => {
    const { s, ap, ids } = setup([dasher, warbringer()]);
    const opp = next(s, ap);
    poolOnly(s, ap, { R: 1 });
    const dash = { alt: "dash" as const };
    expect(planCast(s, ap, ids[0]!, [], undefined, undefined, undefined, dash)).toBeNull();
    putOnBattlefield(s, opp, warbringer());
    expect(planCast(s, ap, ids[0]!, [], undefined, undefined, undefined, dash)).toBeNull();
    putOnBattlefield(s, ap, warbringer());
    // {2}{R} less {2}: {R}. Its normal cost isn't reduced.
    expect(planCast(s, ap, ids[0]!, [], undefined, undefined, undefined, dash)).not.toBeNull();
    expect(planCast(s, ap, ids[0]!, [])).toBeNull();
    // The Warbringer in hand: its dash {2}{R} is reduced by the one on the battlefield, not by itself.
    expect(planCast(s, ap, ids[1]!, [], undefined, undefined, undefined, dash)).not.toBeNull();
    let s2 = settle(run(s, planCast(s, ap, ids[0]!, [], undefined, undefined, undefined, dash)!));
    expect(zone(s2, ids[0]!)).toBe("battlefield");
    expect(characteristics(s2, s2.objects[ids[0]!]!).keywords).toContain("Haste");
  });

  it("Thick-Skinned Goblin: {0} rather than the echo cost of a permanent you control, mana or not", () => {
    let { s, ap, ids } = setup([echoer, discardEchoer, bear()]);
    const opp = next(s, ap);
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    s = settle(run(s, planCast(s, ap, ids[1]!, [])));
    putOnBattlefield(s, ap, goblin());
    const theirs = putOnBattlefield(s, opp, echoer);
    s.players[ap]!.hand = [ids[2]!];
    s = passUntil(s, "upkeep", opp);
    // The opponent's echo still costs {2}{R}: with no mana they keep it only by paying it, so it's sacrificed.
    s.battlefield.filter((id) => s.objects[id]!.controller === opp && characteristics(s, s.objects[id]!).types.includes("Land")).forEach((id) => (s.objects[id]!.tapped = true));
    s = settle(s);
    expect(zone(s, theirs)).toBe("graveyard");
    s = passUntil(s, "upkeep", ap);
    s.battlefield.filter((id) => s.objects[id]!.controller === ap && characteristics(s, s.objects[id]!).types.includes("Land")).forEach((id) => (s.objects[id]!.tapped = true));
    const asked: string[] = [];
    for (let i = 0; i < 100 && (s.stack.length || s.pending || s.triggerQueue.length); i++) {
      const p = s.pending;
      if (p?.kind === "chooseMay" && p.player === ap) {
        asked.push(p.prompt);
        expect(p.pay?.mana).toBe("{0}");
        s = act(s, { type: "chooseMay", player: ap, yes: true } as Action);
      } else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(asked.length).toBe(2);
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(zone(s, ids[1]!)).toBe("battlefield");
    // Nothing was discarded for the second one's echo.
    expect(s.players[ap]!.hand).toContain(ids[2]!);
  });

  it("Kenku Artificer: three +1/+1 counters on up to one target noncreature artifact, which becomes a 0/0 Homunculus artifact creature with flying", () => {
    let { s, ap, ids } = setup([kenku(), kenku()]);
    const rock = putOnBattlefield(s, ap, card("Test Sword", "Artifact — Equipment", "{1}", { oracleText: "Equipped creature gets +1/+1.\nEquip {1}" }));
    s = run(s, planCast(s, ap, ids[0]!, []));
    s = settle(s, { me: [ap] });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(rock)] } as Action), { me: [ap] });
    const c = characteristics(s, s.objects[rock]!);
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    // It keeps its other subtypes (CR 205.1b, rulings).
    expect(c.subtypes).toEqual(expect.arrayContaining(["Equipment", "Homunculus"]));
    expect(c.keywords).toContain("Flying");
    expect(pt(s, rock)).toBe("3/3");
    // Up to one: with no target it does nothing.
    s = run(s, planCast(s, ap, ids[1]!, []));
    s = settle(s, { me: [ap] });
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "none" }] } as Action));
    expect(zone(s, ids[1]!)).toBe("battlefield");
  });
});
