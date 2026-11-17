// Round 387: Ashling, Rimebound's mana spendable only on spells with mana value 4 or greater, its X counted (CR 106.6,
// 202.3e) and its trigger on two events (CR 603.2, 701.27e, 505.1a); Oko, Lorwyn Liege's creature types for good (CR
// 611.2a, 205.3d, 613.1d) and Oko, Shadowmoor Scion's emblem of a chosen creature type (CR 114.2, 114.4); Aegis of the
// Legion's "whenever equipped creature mentors a creature" (CR 702.134c); Invisible Woman's pump counted once as it
// resolves, with the same target unblockable (CR 608.2h, 611.2c).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { botActions, characteristics, moveObject, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";
import { transformPermanent } from "../src/effects/run-permanents";

// Real card data (Scryfall).
const ashling = (): CardDef => ({"oracleId":"31fc5d8b-94bc-4688-8a84-f15800e717a8","name":"Ashling, Rekindled // Ashling, Rimebound","manaCost":"{1}{R}","cmc":2,"typeLine":"Legendary Creature — Elemental Sorcerer // Legendary Creature — Elemental Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elemental","Sorcerer"],"oracleText":"Whenever this creature enters or transforms into Ashling, Rekindled, you may discard a card. If you do, draw a card.\nAt the beginning of your first main phase, you may pay {U}. If you do, transform Ashling.","power":"1","toughness":"3","colors":["R"],"colorIdentity":["R","U"],"keywords":["Transform"],"producedMana":["B","G","R","U","W"],"commanderLegal":"legal","set":"ecl","releasedAt":"2026-01-23","rarity":"rare","layout":"transform","gameChanger":false,"faces":[{"name":"Ashling, Rekindled","manaCost":"{1}{R}","typeLine":"Legendary Creature — Elemental Sorcerer","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elemental","Sorcerer"],"oracleText":"Whenever this creature enters or transforms into Ashling, Rekindled, you may discard a card. If you do, draw a card.\nAt the beginning of your first main phase, you may pay {U}. If you do, transform Ashling.","power":"1","toughness":"3","colors":["R"]},{"name":"Ashling, Rimebound","manaCost":"","typeLine":"Legendary Creature — Elemental Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elemental","Wizard"],"oracleText":"Whenever this creature transforms into Ashling, Rimebound and at the beginning of your first main phase, add two mana of any one color. Spend this mana only to cast spells with mana value 4 or greater.\nAt the beginning of your first main phase, you may pay {R}. If you do, transform Ashling.","power":"1","toughness":"3","colors":["U"],"colorIndicator":["U"]}]} as CardDef);
const oko = (): CardDef => ({"oracleId":"a0c956dc-d7de-4f11-b76f-7537fbee1731","name":"Oko, Lorwyn Liege // Oko, Shadowmoor Scion","manaCost":"{2}{U}","cmc":3,"typeLine":"Legendary Planeswalker — Oko // Legendary Planeswalker — Oko","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Oko"],"oracleText":"At the beginning of your first main phase, you may pay {G}. If you do, transform Oko.\n+2: Up to one target creature gains all creature types. (This effect doesn't end.)\n+1: Target creature gets -2/-0 until your next turn.","loyalty":"3","colors":["U"],"colorIdentity":["G","U"],"keywords":["Transform","Mill"],"commanderLegal":"legal","set":"ecl","releasedAt":"2026-01-23","rarity":"mythic","layout":"transform","gameChanger":false,"faces":[{"name":"Oko, Lorwyn Liege","manaCost":"{2}{U}","typeLine":"Legendary Planeswalker — Oko","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Oko"],"oracleText":"At the beginning of your first main phase, you may pay {G}. If you do, transform Oko.\n+2: Up to one target creature gains all creature types. (This effect doesn't end.)\n+1: Target creature gets -2/-0 until your next turn.","loyalty":"3","colors":["U"]},{"name":"Oko, Shadowmoor Scion","manaCost":"","typeLine":"Legendary Planeswalker — Oko","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Oko"],"oracleText":"At the beginning of your first main phase, you may pay {U}. If you do, transform Oko.\n−1: Mill three cards. You may put a permanent card from among them into your hand.\n−3: Create two 3/3 green Elk creature tokens.\n−6: Choose a creature type. You get an emblem with \"Creatures you control of the chosen type get +3/+3 and have vigilance and hexproof.\"","loyalty":"3","colors":["G"],"colorIndicator":["G"]}]} as CardDef);
const woman = (): CardDef => ({"oracleId":"085016ee-4429-453f-b7f3-d61065f1214e","name":"Invisible Woman","manaCost":"{2}{W}","cmc":3,"typeLine":"Legendary Creature — Human Hero","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Hero"],"oracleText":"At the beginning of combat on your turn, if you've cast a noncreature spell this turn, create a 0/3 colorless Wall creature token with defender and reach.\nWhenever you attack, you may pay {R}{G}{W}{U}. When you do, target creature gets +1/+0 until end of turn for each creature you control and can't be blocked this turn.","power":"3","toughness":"3","colors":["W"],"colorIdentity":["G","R","U","W"],"keywords":[],"commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const aegis = (): CardDef => ({"oracleId":"99eb05eb-11ef-456f-9132-166a0691dd04","name":"Aegis of the Legion","manaCost":"{R}{W}","cmc":2,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +1/+1 and has mentor. (Whenever it attacks, put a +1/+1 counter on target attacking creature with lesser power.)\nWhenever equipped creature mentors a creature, put a shield counter on that creature. (If that creature would be dealt damage or destroyed, remove a shield counter from it instead.)\nEquip {3}","colors":["R","W"],"colorIdentity":["R","W"],"keywords":["Equip"],"commanderLegal":"legal","set":"clu","releasedAt":"2024-02-23","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const stalwart = (): CardDef => ({"oracleId":"340d6218-d351-4b2e-80da-7d4afa77190a","name":"Sunhome Stalwart","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Human Soldier","supertypes":[],"types":["Creature"],"subtypes":["Human","Soldier"],"oracleText":"First strike (This creature deals combat damage before creatures without first strike.)\nMentor (Whenever this creature attacks, put a +1/+1 counter on target attacking creature with lesser power.)","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["Mentor","First strike"],"commanderLegal":"legal","set":"grn","releasedAt":"2018-10-05","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const removeLands = (s: GameState, pid: PlayerId, keep: string[]) => {
  for (const id of [...s.battlefield]) {
    const o = s.objects[id]!;
    if (o.controller !== pid || !s.cards[o.cardId]!.types.includes("Land")) continue;
    const name = s.cards[o.cardId]!.name;
    const k = keep.indexOf(name);
    if (k >= 0) {
      keep.splice(k, 1);
      continue;
    }
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    o.zone = "graveyard";
    s.players[pid]!.graveyard.push(id);
  }
  invalidateCharacteristics(s);
};
const inHand = (s: GameState, pid: PlayerId, d: CardDef) => {
  const id = putOnBattlefield(s, pid, d);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
};
const restricted = (s: GameState, pid: PlayerId) => (s.players[pid]!.manaLots ?? []).filter((l) => l.only?.text === "Spend this mana only to cast spells with mana value 4 or greater.").reduce((n, l) => n + l.n, 0);

describe("round 387 cards compile", () => {
  it("Ashling, Rekindled, Oko, Lorwyn Liege, Invisible Woman and Aegis of the Legion are fully supported", () => {
    for (const d of [ashling(), oko(), woman(), aegis()]) expect(isFullySupported(d), d.name).toBe(true);
  });
  it("only that exact pump-and-unblockable sentence is read as two instructions; a keyword after the count isn't", () => {
    const other = card("Pump Test", "Instant", "{1}{W}", { oracleText: "Target creature gets +1/+1 until end of turn for each creature you control and gains trample until end of turn." });
    expect(isFullySupported(other)).toBe(false);
  });
});

describe("Ashling, Rimebound: two mana of one color, spendable only on spells with mana value 4 or greater", () => {
  /** Ashling transformed into Rimebound in main 1, its mana chosen red; only two Mountains left. */
  const rimebound = (color = "Red") => {
    const { s: s0, ap, opp } = setup([]);
    removeLands(s0, ap, ["Mountain", "Mountain"]);
    const a = putOnBattlefield(s0, ap, ashling());
    expect(transformPermanent(s0, s0.objects[a]!)).toBe(true);
    let s = settle(s0);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "color" });
    s = act(s, { type: "chooseOption", player: ap, choice: color });
    s = settle(s);
    return { s, ap, a, opp };
  };

  it("transforming into it adds the two mana (CR 701.27e), with the restriction (CR 106.6)", () => {
    const { s, ap } = rimebound();
    expect(restricted(s, ap)).toBe(2);
    expect(s.players[ap]!.manaPool.R).toBe(2);
  });

  it("pays a mana value 4 spell, not a mana value 3 one", () => {
    const { s, ap } = rimebound();
    const four = inHand(s, ap, card("Four Test", "Sorcery", "{2}{R}{R}", { oracleText: "You gain 1 life." }));
    const three = inHand(s, ap, card("Three Test", "Sorcery", "{1}{R}{R}", { oracleText: "You gain 1 life." }));
    // Three mana needed, two Mountains usable: the restricted mana can't help.
    expect(planCast(s, ap, three)).toBeNull();
    const life = s.players[ap]!.life;
    const after = settle(run(s, planCast(s, ap, four)));
    expect(after.players[ap]!.life).toBe(life + 1);
    expect(restricted(after, ap)).toBe(0);
  });

  it("an {X} spell's mana value counts the X announced (CR 202.3e): X = 2 makes {X}{R}{R} mana value 4, X = 1 doesn't", () => {
    const { s, ap } = rimebound();
    const xs = inHand(s, ap, card("X Test", "Sorcery", "{X}{R}{R}", { oracleText: "You gain X life." }));
    expect(planCast(s, ap, xs, undefined, undefined, undefined, 1)).toBeNull();
    const life = s.players[ap]!.life;
    const after = settle(run(s, planCast(s, ap, xs, undefined, undefined, undefined, 2)));
    expect(after.players[ap]!.life).toBe(life + 2);
    expect(restricted(after, ap)).toBe(0);
  });

  it("at the beginning of its controller's first main phase it adds two more (CR 505.1a), and may turn back for {R}", () => {
    let { s, ap, opp } = rimebound("Blue");
    s = passUntil(s, "upkeep", opp);
    s = passUntil(s, "main1", ap);
    const seen: string[] = [];
    for (let i = 0; i < 40 && (s.pending || s.stack.length || s.triggerQueue.length); i++) {
      const p = s.pending;
      if (p?.kind === "chooseOption" && p.what === "color") {
        seen.push("color");
        s = act(s, { type: "chooseOption", player: ap, choice: "Green" });
      } else if (p) {
        seen.push(p.kind);
        s = run(s, botActions(s, p.player).slice(0, 1));
      } else s = act(s, { type: "passPriority", player: waitingOn(s)! });
      if (s.step !== "main1") break;
    }
    expect(seen).toContain("color");
    expect(restricted(s, ap)).toBe(2);
    expect(s.players[ap]!.manaPool.G).toBeGreaterThanOrEqual(2);
  });

  it("the mana only ever goes to a spell, never an ability", () => {
    const { s, ap } = rimebound();
    const rock = putOnBattlefield(s, ap, card("Rock Test", "Artifact", "{1}", { oracleText: "{2}: You gain 1 life." }));
    removeLands(s, ap, []);
    expect(planActivate(s, ap, rock, 0)).toBeNull();
  });
});

describe("Oko, Lorwyn Liege: +2 gives all creature types for good", () => {
  it("the creature has every creature type after the turn ends and after Oko is gone (CR 611.2a, rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const o = putOnBattlefield(s0, ap, oko());
    s0.objects[o]!.counters = { loyalty: 3 };
    const b = putOnBattlefield(s0, opp, bear());
    let s = settle(run(s0, planActivate(s0, ap, o, 0, [target(b)])));
    expect(s.objects[o]!.counters.loyalty).toBe(5);
    expect(characteristics(s, s.objects[b]!).allCreatureTypes).toBe(true);
    expect(characteristics(s, s.objects[b]!).subtypes).toContain("Bear");
    // Oko leaves; the next turn comes.
    const ok = s.objects[o]!;
    s.battlefield.splice(s.battlefield.indexOf(o), 1);
    ok.zone = "graveyard";
    ok.zoneChanges = (ok.zoneChanges ?? 0) + 1;
    s.players[ap]!.graveyard.push(o);
    invalidateCharacteristics(s);
    s = passUntil(s, "upkeep", opp);
    expect(characteristics(s, s.objects[b]!).allCreatureTypes).toBe(true);
  });

  it("up to one: it may target nothing", () => {
    const { s: s0, ap } = setup([]);
    const o = putOnBattlefield(s0, ap, oko());
    s0.objects[o]!.counters = { loyalty: 3 };
    const s = settle(run(s0, planActivate(s0, ap, o, 0, [{ kind: "none" }])));
    expect(s.objects[o]!.counters.loyalty).toBe(5);
  });

  it("the effect is on that object only: once it leaves and returns it's a new object without it (CR 400.7)", () => {
    const { s: s0, ap } = setup([]);
    const o = putOnBattlefield(s0, ap, oko());
    s0.objects[o]!.counters = { loyalty: 3 };
    const b = putOnBattlefield(s0, ap, bear());
    const s = settle(run(s0, planActivate(s0, ap, o, 0, [target(b)])));
    expect(characteristics(s, s.objects[b]!).allCreatureTypes).toBe(true);
    // Bounced and played again: a new object (CR 400.7).
    moveObject(s, b, "hand");
    moveObject(s, b, "battlefield");
    invalidateCharacteristics(s);
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(characteristics(s, s.objects[b]!).allCreatureTypes).toBe(false);
  });
});

describe("Oko, Shadowmoor Scion: −6 makes an emblem for the creature type chosen as it resolves", () => {
  const scion = () => {
    const { s, ap, opp } = setup([]);
    const o = putOnBattlefield(s, ap, oko());
    transformPermanent(s, s.objects[o]!);
    s.objects[o]!.counters = { loyalty: 6 };
    invalidateCharacteristics(s);
    return { s, ap, opp, o };
  };
  /** Its −6, the third of its loyalty abilities. */
  const MINUS_SIX = 2;
  const emblemsOf = (s: GameState, pid: PlayerId) => (s.emblems ?? []).filter((id) => s.objects[id]!.owner === pid);

  it("its creatures of that type get +3/+3, vigilance and hexproof, from the command zone for good (CR 114.4)", () => {
    let { s, ap, opp, o } = scion();
    const elf = putOnBattlefield(s, ap, bear({ name: "Elf Test", subtypes: ["Elf"] }));
    const bearId = putOnBattlefield(s, ap, bear());
    const theirElf = putOnBattlefield(s, opp, bear({ name: "Their Elf", subtypes: ["Elf"] }));
    s = run(s, planActivate(s, ap, o, MINUS_SIX, []));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "creatureType" });
    s = act(s, { type: "chooseOption", player: ap, choice: "Elf" });
    s = settle(s);
    expect(s.objects[o]!.zone).toBe("graveyard"); // 0 loyalty (CR 704.5i)
    expect(pt(s, elf)).toBe("5/5");
    expect(objHasKeyword(s, s.objects[elf]!, "Vigilance")).toBe(true);
    expect(objHasKeyword(s, s.objects[elf]!, "Hexproof")).toBe(true);
    expect(pt(s, bearId)).toBe("2/2");
    expect(pt(s, theirElf)).toBe("2/2");
    // A creature of that type that comes later gets it too; the emblem is still there next turn.
    const later = putOnBattlefield(s, ap, bear({ name: "Later Elf", subtypes: ["Elf", "Warrior"] }));
    invalidateCharacteristics(s);
    s = passUntil(s, "upkeep", opp);
    expect(pt(s, later)).toBe("5/5");
    expect(emblemsOf(s, ap)).toHaveLength(1);
  });

  it("two emblems with different types each keep their own (CR 114.2)", () => {
    let { s, ap, o } = scion();
    const elf = putOnBattlefield(s, ap, bear({ name: "Elf Test", subtypes: ["Elf"] }));
    const gob = putOnBattlefield(s, ap, bear({ name: "Goblin Test", subtypes: ["Goblin"] }));
    s = settle(run(s, planActivate(s, ap, o, MINUS_SIX, [])));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Elf" }));
    const o2 = putOnBattlefield(s, ap, oko());
    transformPermanent(s, s.objects[o2]!);
    s.objects[o2]!.counters = { loyalty: 6 };
    invalidateCharacteristics(s);
    const plan = planActivate(s, ap, o2, MINUS_SIX, []);
    s = settle(run(s, plan));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Goblin" }));
    expect(pt(s, elf)).toBe("5/5");
    expect(pt(s, gob)).toBe("5/5");
    expect(emblemsOf(s, ap)).toHaveLength(2);
  });
});

describe("Aegis of the Legion: whenever equipped creature mentors a creature, a shield counter on it", () => {
  const attack = (s: GameState, ap: PlayerId, opp: PlayerId, attackers: string[], pick: string) => {
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: attackers.map((attacker) => ({ attacker, defender: opp })) });
    for (let i = 0; i < 40 && s.pending?.kind !== "declareBlockers" && s.step === "declareAttackers"; i++)
      s = s.pending?.kind === "chooseTargets" ? act(s, { type: "chooseTargets", player: ap, targets: [target(pick)] }) : s.pending ? run(s, botActions(s, s.pending.player).slice(0, 1)) : act(s, { type: "passPriority", player: waitingOn(s)! });
    return s;
  };

  it("its granted mentor resolving puts the +1/+1 counter and then a shield counter on that creature (CR 702.134c)", () => {
    const { s: s0, ap, opp } = setup([]);
    const host = putOnBattlefield(s0, ap, bear({ name: "Host", power: "3", toughness: "3" }));
    const small = putOnBattlefield(s0, ap, bear());
    const eq = putOnBattlefield(s0, ap, aegis());
    s0.objects[eq]!.attachedTo = host;
    invalidateCharacteristics(s0);
    const s = attack(s0, ap, opp, [host, small], small);
    expect(s.objects[small]!.counters).toMatchObject({ "+1/+1": 1, shield: 1 });
    expect(s.objects[host]!.counters.shield ?? 0).toBe(0);
  });

  it("the creature's own mentor counts too: any mentor ability of the equipped creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const host = putOnBattlefield(s0, ap, stalwart());
    const small = putOnBattlefield(s0, ap, bear({ name: "Small", power: "1", toughness: "1" }));
    const eq = putOnBattlefield(s0, ap, aegis());
    s0.objects[eq]!.attachedTo = host;
    invalidateCharacteristics(s0);
    // Two mentor abilities (its own and the Aegis's), each resolving with the 1/1 still of lesser power.
    const s = attack(s0, ap, opp, [host, small], small);
    expect(s.objects[small]!.counters).toMatchObject({ "+1/+1": 2, shield: 2 });
  });

  it("a mentor ability whose target is no longer of lesser power doesn't resolve, so nothing triggers (CR 608.2b)", () => {
    const { s: s0, ap, opp } = setup([]);
    // Host 2/2, +1/+1 from the Aegis: 3/3, twice mentor (its own and granted). The 2/2 gets one counter and is 3/3.
    const host = putOnBattlefield(s0, ap, stalwart());
    const small = putOnBattlefield(s0, ap, bear());
    const eq = putOnBattlefield(s0, ap, aegis());
    s0.objects[eq]!.attachedTo = host;
    invalidateCharacteristics(s0);
    const s = attack(s0, ap, opp, [host, small], small);
    expect(s.objects[small]!.counters).toMatchObject({ "+1/+1": 1, shield: 1 });
  });

  it("a mentor ability of a creature without the Aegis doesn't trigger it", () => {
    const { s: s0, ap, opp } = setup([]);
    const host = putOnBattlefield(s0, ap, card("Mentor Test", "Creature — Soldier", "{3}{W}", { power: "4", toughness: "4", oracleText: "Mentor", keywords: ["Mentor"] }));
    const other = putOnBattlefield(s0, ap, bear({ name: "Other", power: "4", toughness: "4" }));
    const small = putOnBattlefield(s0, ap, bear({ name: "Small", power: "1", toughness: "1" }));
    const eq = putOnBattlefield(s0, ap, aegis());
    s0.objects[eq]!.attachedTo = other;
    invalidateCharacteristics(s0);
    // The unequipped 4/4's own mentor and the Aegis-equipped 5/5's granted one both target the 1/1, both resolve; only
    // the second is the equipped creature's.
    const s = attack(s0, ap, opp, [host, other, small], small);
    expect(s.objects[small]!.counters).toMatchObject({ "+1/+1": 2, shield: 1 });
  });
});

describe("Invisible Woman: whenever you attack, you may pay {R}{G}{W}{U}; when you do, a pump and unblockable", () => {
  it("+1/+0 for each creature you control, counted as it resolves (CR 608.2h), and can't be blocked this turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, woman());
    const b = putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, ap, bear({ name: "Third" }));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    const kinds: string[] = [];
    for (let i = 0; i < 60 && s.step === "declareAttackers"; i++) {
      const p = s.pending;
      if (p?.kind === "chooseTargets") {
        kinds.push(p.kind);
        s = act(s, { type: "chooseTargets", player: ap, targets: [target(b)] });
      } else if (p?.kind === "payUnless" || p?.kind === "chooseMay") {
        kinds.push(p.kind);
        // Mana abilities first (CR 605.3a): the four colors in the pool.
        for (const c of ["R", "G", "W", "U"] as const) s.players[ap]!.manaPool[c] += 1;
        s = p.kind === "chooseMay" ? act(s, { type: "chooseMay", player: ap, yes: true }) : act(s, { type: "payUnless", player: ap, pay: true });
      } else if (p) s = run(s, botActions(s, p.player).slice(0, 1));
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(kinds).toContain("chooseTargets");
    // Three creatures: +3/+0.
    expect(pt(s, b)).toBe("5/2");
    // A fourth creature now doesn't change it (counted once).
    putOnBattlefield(s, ap, bear({ name: "Fourth" }));
    invalidateCharacteristics(s);
    expect(pt(s, b)).toBe("5/2");
    expect(characteristics(s, s.objects[b]!).cantBeBlocked).toBeTruthy();
    void w;
  });
});
