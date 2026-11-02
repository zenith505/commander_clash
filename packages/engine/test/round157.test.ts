// Round 157: the most played cards, in popularity order, starting with Gilgamesh, Master-at-Arms.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, scry, setup } from "./helpers";
import { abilitiesOf, characteristics, invalidateCharacteristics, isFullySupported, manaAbilitiesOn, manaChoices, objHasKeyword, parseManaCost, planActivate, planCast, planMana, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; "you may" questions get `yes`. Stops at any other question. */
const resolveAll = (s: GameState, yes = true) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending?.kind === "chooseMay"); i++) {
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes });
    else if (s.pending) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes until the stack and the trigger queue are empty, stopping at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) => act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks });
/** A card put straight into a zone, not from the battlefield. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const obj = (id: string): TargetChoice => ({ kind: "object", id });
const nameOf = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const indexOf = (s: GameState, id: string, text: RegExp) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => text.test(a.text));
const mine = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && nameOf(s, id) === name);
const others = (s: GameState, ap: PlayerId) => s.turnOrder.filter((p) => p !== ap);

// Real oracle text (Scryfall).
const gilgamesh = card("Gilgamesh, Master-at-Arms", "Legendary Creature — Human Samurai", "{4}{R}{R}", {cmc: 6,power: "6",toughness: "6",oracleText: "Whenever Gilgamesh enters or attacks, look at the top six cards of your library. You may put any number of Equipment cards from among them onto the battlefield. Put the rest on the bottom of your library in a random order. When you put one or more Equipment onto the battlefield this way, you may attach one of them to a Samurai you control."});
const satsuki = card("Satsuki, the Living Lore", "Legendary Creature — Human Druid", "{G}{W}", {cmc: 2,power: "1",toughness: "3",oracleText: "{T}: Put a lore counter on each Saga you control. Activate only as a sorcery.\nWhen Satsuki dies, choose up to one —\n• Return target Saga or enchantment creature you control to its owner's hand.\n• Return target Saga card from your graveyard to your hand."});
const gilraen = card("Gilraen, Dúnedain Protector", "Legendary Creature — Human Noble", "{2}{W}", {cmc: 3,power: "2",toughness: "3",oracleText: "{2}, {T}: Exile another target creature you control. You may return that card to the battlefield under its owner's control. If you don't, at the beginning of the next end step, return that card to the battlefield under its owner's control with a vigilance counter and a lifelink counter on it."});
const rite = card("Rite of Harmony", "Instant", "{G}{W}", {cmc: 2,keywords: ["Flashback"],oracleText: "Whenever a creature or enchantment you control enters this turn, draw a card.\nFlashback {2}{G}{W} (You may cast this card from your graveyard for its flashback cost. Then exile it.)"});
const deathKiss = card("Death Kiss", "Creature — Beholder", "{5}{R}", {cmc: 6,power: "5",toughness: "5",keywords: ["Goad","Monstrosity"],oracleText: "Whenever a creature an opponent controls attacks one of your opponents, double its power until end of turn.\n{X}{X}{R}: Monstrosity X. (If this creature isn't monstrous, put X +1/+1 counters on it and it becomes monstrous.)\nWhen this creature becomes monstrous, goad up to X target creatures your opponents control."});
const grist = scry("transform", [
  { name: "Grist, Voracious Larva", mana_cost: "{G}", type_line: "Legendary Creature — Insect", oracle_text: "Deathtouch\nWhenever Grist or another creature you control enters, if it entered from your graveyard or you cast it from your graveyard, you may pay {G}. If you do, exile Grist, then return it to the battlefield transformed under its owner's control.", power: "1", toughness: "2" },
  { name: "Grist, the Plague Swarm", type_line: "Legendary Planeswalker — Grist", oracle_text: "+1: Create a 1/1 black and green Insect creature token, then mill two cards. Put a deathtouch counter on the token if a black card was milled this way.\n−2: Destroy target artifact or enchantment.\n−6: For each creature card in your graveyard, create a token that's a copy of it, except it's a 1/1 black and green Insect.", loyalty: "3", color_indicator: ["B", "G"] },
], { keywords: ["Deathtouch"], color_identity: ["B", "G"] });
const freya = card("Freya Crescent", "Legendary Creature — Rat Knight", "{R}", {cmc: 1,power: "1",toughness: "1",keywords: ["Jump"],oracleText: "Jump — During your turn, Freya Crescent has flying.\n{T}: Add {R}. Spend this mana only to cast an Equipment spell or activate an equip ability."});
const song = card("Song of Freyalise", "Enchantment — Saga", "{1}{G}", {cmc: 2,oracleText: "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI, II — Until your next turn, creatures you control gain \"{T}: Add one mana of any color.\"\nIII — Put a +1/+1 counter on each creature you control. Those creatures gain vigilance, trample, and indestructible until end of turn."});
const angel = card("Angel of Suffering", "Creature — Nightmare Angel", "{3}{B}{B}", {cmc: 5,power: "5",toughness: "3",keywords: ["Flying"],oracleText: "Flying\nIf damage would be dealt to you, prevent that damage and mill twice that many cards."});

// Supported now too, from the same pieces.
const thunder = card("Thunder of Unity", "Enchantment — Saga", "{R}{W}{B}", {cmc: 3,oracleText: "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — You draw two cards and you lose 2 life.\nII, III — Whenever a creature you control enters this turn, each opponent loses 1 life and you gain 1 life."});
const renegade = card("Renegade Silent", "Creature — Alien Horror", "{3}{U}", {cmc: 4,power: "3",toughness: "3",keywords: ["Goad"],oracleText: "At the beginning of your end step, goad up to one target creature you don't control and put a +1/+1 counter on this creature. This creature phases out. (Treat it and anything attached to it as though they don't exist until your next turn.)"});
const sorin = card("Sorin, Solemn Visitor", "Legendary Planeswalker — Sorin", "{2}{W}{B}", {cmc: 4,loyalty: "4",oracleText: "+1: Until your next turn, creatures you control get +1/+0 and gain lifelink.\n−2: Create a 2/2 black Vampire creature token with flying.\n−6: You get an emblem with \"At the beginning of each opponent's upkeep, that player sacrifices a creature of their choice.\""});
const hunter = card("Vitality Hunter", "Creature — Nightmare", "{3}{W}", {cmc: 4,power: "3",toughness: "4",keywords: ["Lifelink","Monstrosity"],oracleText: "Lifelink\n{X}{W}{W}: Monstrosity X. (If this creature isn't monstrous, put X +1/+1 counters on it and it becomes monstrous.)\nWhen this creature becomes monstrous, put a lifelink counter on each of up to X target creatures."});
const ronin = card("Ronin, Shadow Stalker", "Legendary Creature — Human Rogue Hero", "{2}{B}", {cmc: 3,power: "3",toughness: "3",oracleText: "Pay 2 life: Add two mana of any one color. Spend this mana only to cast Equipment spells or activate equip abilities. Activate only once each turn.\n{T}, Sacrifice an Equipment attached to Ronin: Target creature gets -4/-4 until end of turn. Activate only as a sorcery."});

const sword = card("Test Sword", "Artifact — Equipment", "{2}", { cmc: 2, oracleText: "Equipped creature gets +2/+0.\nEquip {2}" });
const axe = card("Test Axe", "Artifact — Equipment", "{3}", { cmc: 3, oracleText: "Equipped creature gets +1/+1.\nEquip {1}" });
const rock = card("Test Rock", "Artifact", "{2}", { cmc: 2, oracleText: "{T}: Add {C}." });
const samurai = card("Test Samurai", "Creature — Human Samurai", "{1}{W}", { cmc: 2, power: "2", toughness: "2" });
const saga = card("Test Saga", "Enchantment — Saga", "{1}{U}", { cmc: 2, oracleText: "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Draw a card.\nII — Draw a card.\nIII — Draw two cards." });
const glory = card("Test Glory", "Enchantment Creature — Spirit", "{1}{W}", { cmc: 2, power: "2", toughness: "2" });
const charm = card("Test Charm", "Enchantment", "{1}{W}", { cmc: 2 });
const raise = card("Test Raise", "Sorcery", "{B}", { cmc: 1, oracleText: "Return target creature card from your graveyard to the battlefield." });
const murder = card("Test Murder", "Instant", "{B}", { cmc: 1, oracleText: "Destroy target creature." });
const bolt = card("Test Bolt", "Instant", "{R}", { cmc: 1, oracleText: "Test Bolt deals 3 damage to any target." });
const knight = card("Test Black Knight", "Creature — Human Knight", "{B}{B}", { cmc: 2, power: "2", toughness: "2" });
const ogre = card("Test Ogre", "Creature — Ogre", "{3}{R}", { cmc: 4, power: "4", toughness: "4" });

describe("round 157 cards", () => {
  it("are fully supported", () => supported(gilgamesh, satsuki, gilraen, rite, deathKiss, grist, freya, song, angel));
  it("and these, from the same pieces", () => supported(thunder, renegade, sorin, hunter));
  it("and Ronin, Shadow Stalker since round B88 (its sacrifice-an-attached-Equipment cost)", () => expect(isFullySupported(ronin)).toBe(true));
});

describe("Gilgamesh, Master-at-Arms", () => {
  /** Six cards on top: two Equipment, a noncreature artifact and three bears. */
  const stack = (s: GameState, ap: PlayerId) => {
    const ids = [into(s, ap, bear(), "library"), into(s, ap, axe, "library"), into(s, ap, rock, "library"), into(s, ap, bear(), "library"), into(s, ap, sword, "library"), into(s, ap, bear(), "library")];
    return { sw: ids[4]!, ax: ids[1]!, rk: ids[2]! };
  };

  it("puts any number of Equipment among the top six onto the battlefield, then may attach one of them to a Samurai", () => {
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, gilgamesh);
    const sam = putOnBattlefield(s0, ap, samurai);
    const { sw, ax, rk } = stack(s0, ap);
    let s = settle(attack(s0, ap, [{ attacker: g, defender: others(s0, ap)[0]! }]));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const p = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    // Only the Equipment can be picked.
    expect(p.cards).toEqual(expect.arrayContaining([sw, ax]));
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [rk] })).toThrow();
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [sw, ax] }));
    expect(zone(s, sw)).toBe("battlefield");
    expect(zone(s, ax)).toBe("battlefield");
    // The rest go to the bottom.
    expect(s.players[ap]!.library.slice(-4)).toEqual(expect.arrayContaining([rk]));
    // The reflexive trigger: which one, then which Samurai.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "attachWhich", options: expect.arrayContaining([sw, ax, "none"]) });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: sw }));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "enchant", options: expect.arrayContaining([g, sam]) });
    expect((s.pending as { options: string[] }).options).not.toContain("none");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: sam }));
    expect(s.objects[sw]!.attachedTo).toBe(sam);
    expect(s.objects[ax]!.attachedTo).toBeUndefined();
    expect(pt(s, sam)).toBe("4/2");
  });

  it("may attach none of them, and with no Equipment put there's no reflexive trigger", () => {
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, gilgamesh);
    const { sw } = stack(s0, ap);
    let s = settle(attack(structuredClone(s0), ap, [{ attacker: g, defender: others(s0, ap)[0]! }]));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [sw] }));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "none" }));
    expect(zone(s, sw)).toBe("battlefield");
    expect(s.objects[sw]!.attachedTo).toBeUndefined();
    let t = settle(attack(structuredClone(s0), ap, [{ attacker: g, defender: others(s0, ap)[0]! }]));
    t = settle(act(t, { type: "searchLibrary", player: ap, found: [] }));
    expect(t.pending?.kind).not.toBe("chooseOption");
    expect(zone(t, sw)).toBe("library");
  });

  it("triggers as it enters too", () => {
    const { s: s0, ap, ids } = setup([gilgamesh]);
    const { sw } = stack(s0, ap);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [sw] }));
    // One Equipment and Gilgamesh the only Samurai: the question is only "attach it or not".
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "attachWhich", options: [sw, "none"] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: sw }));
    expect(s.objects[sw]!.attachedTo).toBe(ids[0]);
  });
});

describe("Satsuki, the Living Lore", () => {
  it("puts a lore counter on each Saga you control, which triggers its next chapter", () => {
    const { s: s0, ap } = setup([]);
    const sat = putOnBattlefield(s0, ap, satsuki);
    const sg = putOnBattlefield(s0, ap, saga);
    s0.objects[sg]!.counters.lore = 1;
    const hand = s0.players[ap]!.hand.length;
    const s = resolveAll(run(s0, planActivate(s0, ap, sat, indexOf(s0, sat, /lore counter/))));
    expect(s.objects[sg]!.counters.lore).toBe(2);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("when it dies, returns a Saga card from your graveyard to your hand, or an enchantment creature you control", () => {
    const { s: s0, ap, ids } = setup([murder]);
    const sat = putOnBattlefield(s0, ap, satsuki);
    const yardSaga = into(s0, ap, saga, "graveyard");
    const ench = putOnBattlefield(s0, ap, glory);
    putOnBattlefield(s0, ap, charm);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [obj(sat)])));
    expect(s.pending).toMatchObject({ kind: "chooseModes", player: ap, min: 0, max: 1 });
    const pick = structuredClone(s);
    s = act(s, { type: "chooseModes", player: ap, modes: [1] });
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [obj(yardSaga)] }));
    expect(zone(s, yardSaga)).toBe("hand");
    // The first mode: an enchantment creature you control (a plain enchantment isn't a legal target).
    let t = act(pick, { type: "chooseModes", player: ap, modes: [0] });
    const specs = (t.pending as Extract<GameState["pending"], { kind: "chooseTargets" }>).specs;
    expect(specs).toHaveLength(1);
    expect(() => act(t, { type: "chooseTargets", player: ap, targets: [obj(t.battlefield.find((id) => nameOf(t, id) === "Test Charm")!)] })).toThrow();
    t = settle(act(t, { type: "chooseTargets", player: ap, targets: [obj(ench)] }));
    expect(zone(t, ench)).toBe("hand");
  });
});

describe("Gilraen, Dúnedain Protector", () => {
  const ready = () => {
    const { s: s0, ap } = setup([]);
    const gil = putOnBattlefield(s0, ap, gilraen);
    const o = putOnBattlefield(s0, ap, ogre);
    return { s0, ap, gil, o };
  };

  it("returns the exiled card at once if you choose to", () => {
    const { s0, ap, gil, o } = ready();
    let s = run(s0, planActivate(s0, ap, gil, 0, [obj(o)]));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    const back = mine(s, ap, "Test Ogre");
    expect(back).toHaveLength(1);
    expect(s.objects[back[0]!]!.counters.vigilance ?? 0).toBe(0);
    expect(s.delayed?.length ?? 0).toBe(0);
  });

  it("otherwise returns it at the beginning of the next end step with a vigilance counter and a lifelink counter", () => {
    const { s0, ap, gil, o } = ready();
    let s = settle(run(s0, planActivate(s0, ap, gil, 0, [obj(o)])));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(zone(s, o)).toBe("exile");
    s = passUntil(s, "end", ap);
    s = settle(s);
    const back = mine(s, ap, "Test Ogre");
    expect(back).toHaveLength(1);
    const it = s.objects[back[0]!]!;
    expect(it.counters).toMatchObject({ vigilance: 1, lifelink: 1 });
    expect(objHasKeyword(s, it, "Vigilance")).toBe(true);
    expect(objHasKeyword(s, it, "Lifelink")).toBe(true);
  });

  it("can't target itself, and a token exiled this way doesn't come back", () => {
    const { s0, ap, gil } = ready();
    expect(planActivate(s0, ap, gil, 0, [obj(gil)])).toBeNull();
    const tok = putOnBattlefield(s0, ap, bear({ name: "Bear Token" }));
    s0.objects[tok]!.isToken = true;
    let s = settle(run(s0, planActivate(s0, ap, gil, 0, [obj(tok)])));
    if (s.pending?.kind === "chooseMay") s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    s = settle(passUntil(s, "end", ap));
    expect(mine(s, ap, "Bear Token")).toHaveLength(0);
  });
});

describe("Rite of Harmony", () => {
  it("draws a card whenever a creature or enchantment you control enters this turn, not another player's, nor next turn", () => {
    const { s: s0, ap, ids } = setup([rite, bear(), charm, rock]);
    const opp = others(s0, ap)[0]!;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    const hand0 = s.players[ap]!.hand.length;
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(s.players[ap]!.hand.length).toBe(hand0 - 1 + 1);
    s = resolveAll(run(s, planCast(s, ap, ids[2]!)));
    expect(s.players[ap]!.hand.length).toBe(hand0 - 2 + 2);
    // An artifact isn't a creature or enchantment.
    s = resolveAll(run(s, planCast(s, ap, ids[3]!)));
    expect(s.players[ap]!.hand.length).toBe(hand0 - 3 + 2);
    // Nothing for an opponent's creature.
    putOnBattlefield(s, opp, bear());
    expect(s.triggerQueue).toHaveLength(0);
    // Gone at the end of the turn.
    expect(s.floatingTriggers?.length).toBe(1);
    s = passUntil(s, "upkeep", opp);
    expect(s.floatingTriggers).toBeUndefined();
  });

  it("can be cast from the graveyard with flashback", () => {
    const { s: s0, ap } = setup([bear()]);
    const r = into(s0, ap, rite, "graveyard");
    let s = resolveAll(run(s0, planCast(s0, ap, r, undefined, undefined, undefined, undefined, { via: "flashback" })));
    expect(zone(s, r)).toBe("exile");
    const hand0 = s.players[ap]!.hand.length;
    const b = s.players[ap]!.hand.find((id) => nameOf(s, id) === "Grizzly Bears")!;
    s = resolveAll(run(s, planCast(s, ap, b)));
    expect(s.players[ap]!.hand.length).toBe(hand0);
  });
});

describe("Thunder of Unity", () => {
  it("chapter II: each creature you control entering this turn drains each opponent for 1", () => {
    const { s: s0, ap, ids } = setup([bear()]);
    const t = putOnBattlefield(s0, ap, thunder);
    s0.objects[t]!.counters.lore = 1;
    const sat = putOnBattlefield(s0, ap, satsuki);
    let s = resolveAll(run(s0, planActivate(s0, ap, sat, 0)));
    expect(s.objects[t]!.counters.lore).toBe(2);
    const life = s.players[ap]!.life;
    const opp = others(s, ap);
    const theirs = opp.map((p) => s.players[p]!.life);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.players[ap]!.life).toBe(life + 1);
    expect(opp.map((p) => s.players[p]!.life)).toEqual(theirs.map((l) => l - 1));
  });
});

describe("Death Kiss", () => {
  it("doubles the power of an opponent's creature attacking another opponent, not one attacking you", () => {
    const { s: s0, ap } = setup([]);
    const [b, c] = others(s0, ap);
    putOnBattlefield(s0, ap, deathKiss);
    const o = putOnBattlefield(s0, b!, ogre);
    s0.objects[o]!.controlledSinceTurn = -1;
    let s = passUntil(s0, "declareAttackers", b!);
    s = settle(act(s, { type: "declareAttackers", player: b!, attacks: [{ attacker: o, defender: c! }] }));
    expect(pt(s, o)).toBe("8/4");
    // Attacking Death Kiss's controller: no trigger.
    let t = passUntil(s0, "declareAttackers", b!);
    t = settle(act(t, { type: "declareAttackers", player: b!, attacks: [{ attacker: o, defender: ap }] }));
    expect(pt(t, o)).toBe("4/4");
  });

  it("goads up to X target creatures your opponents control when it becomes monstrous", () => {
    const { s: s0, ap } = setup([]);
    const [b, c] = others(s0, ap);
    const dk = putOnBattlefield(s0, ap, deathKiss);
    const o1 = putOnBattlefield(s0, b!, ogre);
    const o2 = putOnBattlefield(s0, c!, ogre);
    const o3 = putOnBattlefield(s0, c!, bear());
    let s = run(s0, planActivate(s0, ap, dk, indexOf(s0, dk, /Monstrosity/), undefined, undefined, undefined, 2));
    s = settle(s);
    expect(s.objects[dk]!.counters["+1/+1"]).toBe(2);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", x: 2 });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [obj(o1), obj(o2), obj(o3)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [obj(o1), obj(o2)] }));
    const goaded = (id: string) => s.effects.some((e) => e.affected?.includes(id) && e.mods.some((m) => m.kind === "goad"));
    expect(goaded(o1)).toBe(true);
    expect(goaded(o2)).toBe(true);
    expect(goaded(o3)).toBe(false);
  });
});

describe("Grist, Voracious Larva", () => {
  it("pays {G} to transform when a creature you control enters from your graveyard", () => {
    const { s: s0, ap, ids } = setup([raise]);
    const g = putOnBattlefield(s0, ap, grist);
    const k = into(s0, ap, knight, "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [obj(k)])));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    for (const a of planMana(s, ap, parseManaCost("{G}"))!) s = act(s, a);
    s = resolveAll(act(s, { type: "chooseMay", player: ap, yes: true }));
    const pw = mine(s, ap, "Grist, the Plague Swarm");
    expect(pw).toHaveLength(1);
    expect(s.objects[pw[0]!]!.counters.loyalty).toBe(3);
    // The same card, exiled and returned with its back face up.
    expect(pw[0]).toBe(g);
    expect(s.objects[g]!.face).toBe(1);
  });

  it("doesn't trigger for a creature cast from your hand", () => {
    const { s: s0, ap, ids } = setup([bear()]);
    putOnBattlefield(s0, ap, grist);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeNull();
    expect(mine(s, ap, "Grist, Voracious Larva")).toHaveLength(1);
  });

  it("the Plague Swarm: +1 makes an Insect with deathtouch if a black card was milled; −6 copies each creature card in your graveyard as a 1/1 black and green Insect", () => {
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, grist);
    s0.objects[g]!.face = 1;
    s0.objects[g]!.counters.loyalty = 7;
    invalidateCharacteristics(s0);
    into(s0, ap, knight, "library");
    into(s0, ap, bear(), "library");
    let s = resolveAll(run(s0, planActivate(s0, ap, g, indexOf(s0, g, /^\+1/))));
    const insects = s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Insect"));
    expect(insects).toHaveLength(1);
    expect(s.objects[insects[0]!]!.counters.deathtouch).toBe(1);
    // Without a black card milled, no counter.
    const t0 = structuredClone(s0);
    into(t0, ap, bear(), "library");
    into(t0, ap, bear(), "library");
    const t = resolveAll(run(t0, planActivate(t0, ap, g, indexOf(t0, g, /^\+1/))));
    const ti = t.battlefield.filter((id) => t.objects[id]!.isToken);
    expect(t.objects[ti[0]!]!.counters.deathtouch ?? 0).toBe(0);
    // −6: two creature cards in the graveyard (the milled ones), one copy each.
    const u0 = structuredClone(s0);
    into(u0, ap, knight, "graveyard");
    into(u0, ap, ogre, "graveyard");
    into(u0, ap, bolt, "graveyard");
    const u = resolveAll(run(u0, planActivate(u0, ap, g, indexOf(u0, g, /^−6/))));
    const copies = u.battlefield.filter((id) => u.objects[id]!.isToken);
    expect(copies.map((id) => nameOf(u, id)).sort()).toEqual(["Test Black Knight", "Test Ogre"]);
    for (const id of copies) {
      const ch = characteristics(u, u.objects[id]!);
      expect(pt(u, id)).toBe("1/1");
      expect(ch.subtypes).toEqual(["Insect"]);
      expect([...ch.colors].sort()).toEqual(["B", "G"]);
      expect(ch.types).toEqual(["Creature"]);
    }
  });
});

describe("Freya Crescent", () => {
  it("makes mana only for Equipment spells and equip abilities", () => {
    const { s: s0, ap, ids } = setup([sword, bear()]);
    const f = putOnBattlefield(s0, ap, freya);
    // Only Freya's mana: tap everything else.
    for (const id of s0.battlefield) if (id !== f) s0.objects[id]!.tapped = true;
    let s = act(s0, { type: "activateMana", player: ap, objectId: f, mana: "R" });
    expect(s.players[ap]!.manaPool.R).toBe(1);
    expect(() => run(s, [{ type: "castSpell", player: ap, objectId: ids[1]! } as Action])).toThrow();
    // An Equipment spell: {2} needs another mana; give one untapped land.
    const land = s.battlefield.find((id) => s.objects[id]!.controller === ap && characteristics(s, s.objects[id]!).types.includes("Land"))!;
    s.objects[land]!.tapped = false;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    // An equip ability.
    s.objects[f]!.tapped = false;
    s.objects[land]!.tapped = false;
    const b = putOnBattlefield(s, ap, bear());
    s = act(s, { type: "activateMana", player: ap, objectId: f, mana: "R" });
    s = resolveAll(run(s, planActivate(s, ap, ids[0]!, indexOf(s, ids[0]!, /Equip/), [obj(b)])));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(b);
  });

  it("has flying only during your turn", () => {
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, freya);
    expect(objHasKeyword(s0, s0.objects[f]!, "Flying")).toBe(true);
    const s = passUntil(s0, "upkeep", others(s0, ap)[0]!);
    expect(objHasKeyword(s, s.objects[f]!, "Flying")).toBe(false);
  });
});

describe("Song of Freyalise", () => {
  it("chapter I: until your next turn, your creatures have \"{T}: Add one mana of any color\"", () => {
    const { s: s0, ap, ids } = setup([song]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(abilitiesOf(s, s.objects[b]!).mana.length).toBeGreaterThan(0);
    s = act(s, { type: "activateMana", player: ap, objectId: b, mana: "U" });
    expect(s.players[ap]!.manaPool.U).toBe(1);
    // Still there on the next player's turn; gone when your next turn starts.
    s = passUntil(s, "upkeep", others(s, ap)[0]!);
    expect(abilitiesOf(s, s.objects[b]!).mana.length).toBeGreaterThan(0);
    s = passUntil(s, "upkeep", ap);
    expect(abilitiesOf(s, s.objects[b]!).mana.length).toBe(0);
  });

  it("chapter III: a +1/+1 counter on each creature you control, and vigilance, trample and indestructible this turn", () => {
    const { s: s0, ap } = setup([]);
    const sg = putOnBattlefield(s0, ap, song);
    s0.objects[sg]!.counters.lore = 2;
    const b = putOnBattlefield(s0, ap, bear());
    const sat = putOnBattlefield(s0, ap, satsuki);
    const s = resolveAll(run(s0, planActivate(s0, ap, sat, 0)));
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
    for (const k of ["Vigilance", "Trample", "Indestructible"]) expect(objHasKeyword(s, s.objects[b]!, k)).toBe(true);
    expect(zone(s, sg)).toBe("graveyard");
  });
});

describe("Angel of Suffering", () => {
  it("prevents damage dealt to you and mills twice that many cards", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, angel);
    const opp = others(s0, ap)[0]!;
    const b = into(s0, opp, bolt, "hand");
    s0.objects[b]!.controller = opp;
    for (const l of [card("Mountain", "Basic Land — Mountain")]) putOnBattlefield(s0, opp, l);
    const life = s0.players[ap]!.life;
    let s = passUntil(s0, "main1", opp);
    const yard = s.players[ap]!.graveyard.length;
    s = resolveAll(run(s, planCast(s, opp, b, [{ kind: "player", id: ap }])));
    expect(s.players[ap]!.life).toBe(life);
    expect(s.players[ap]!.graveyard.length).toBe(yard + 6);
  });

  it("doesn't touch damage to your creatures or to other players", () => {
    const { s: s0, ap, ids } = setup([bolt, bolt]);
    putOnBattlefield(s0, ap, angel);
    const o = putOnBattlefield(s0, ap, ogre);
    const opp = others(s0, ap)[0]!;
    const life = s0.players[opp]!.life;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [obj(o)])));
    expect(s.objects[o]!.damage).toBe(3);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(life - 3);
  });
});

describe("Sorin, Solemn Visitor", () => {
  it("+1: until your next turn, creatures you control get +1/+0 and gain lifelink", () => {
    const { s: s0, ap } = setup([]);
    const so = putOnBattlefield(s0, ap, sorin);
    s0.objects[so]!.counters.loyalty = 4;
    const b = putOnBattlefield(s0, ap, bear());
    let s = resolveAll(run(s0, planActivate(s0, ap, so, 0)));
    expect(pt(s, b)).toBe("3/2");
    expect(objHasKeyword(s, s.objects[b]!, "Lifelink")).toBe(true);
    s = passUntil(s, "upkeep", others(s, ap)[0]!);
    expect(pt(s, b)).toBe("3/2");
    s = passUntil(s, "upkeep", ap);
    expect(pt(s, b)).toBe("2/2");
  });
});

describe("Vitality Hunter", () => {
  it("puts a lifelink counter on each of up to X target creatures when it becomes monstrous", () => {
    const { s: s0, ap } = setup([]);
    const h = putOnBattlefield(s0, ap, hunter);
    const b = putOnBattlefield(s0, ap, bear());
    let s = settle(run(s0, planActivate(s0, ap, h, indexOf(s0, h, /Monstrosity/), undefined, undefined, undefined, 1)));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", x: 1 });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [obj(b)] }));
    expect(s.objects[b]!.counters.lifelink).toBe(1);
  });
});

const jolene = card("Jolene, the Plunder Queen", "Legendary Creature — Human Warrior", "{2}{R}{G}", {cmc: 4,power: "2",toughness: "2",oracleText: "Whenever a player attacks one or more of your opponents, that attacking player creates a Treasure token.\nIf you would create one or more Treasure tokens, instead create those tokens plus an additional Treasure token.\nSacrifice five Treasures: Put five +1/+1 counters on Jolene."});
const preacher = card("Preacher of the Schism", "Creature — Vampire Cleric", "{2}{B}", {cmc: 3,power: "2",toughness: "4",keywords: ["Deathtouch"],oracleText: "Deathtouch\nWhenever this creature attacks the player with the most life or tied for most life, create a 1/1 white Vampire creature token with lifelink.\nWhenever this creature attacks while you have the most life or are tied for most life, you draw a card and you lose 1 life."});
const compass = card("Star Compass", "Artifact", "{2}", {cmc: 2,oracleText: "This artifact enters tapped.\n{T}: Add one mana of any color that a basic land you control could produce."});
const shadow = card("Shadow of Mortality", "Creature — Avatar", "{13}{B}{B}", {cmc: 15,power: "7",toughness: "7",oracleText: "If your life total is less than your starting life total, this spell costs {X} less to cast, where X is the difference."});

describe("Jolene, the Plunder Queen", () => {
  it("compiles", () => supported(jolene, preacher, compass, shadow));

  it("an opponent attacking another opponent gets one Treasure; attacking two of your opponents at once, you get one plus Jolene's extra", () => {
    const { s: s0, ap } = setup([]);
    const [b, c, d] = others(s0, ap);
    putOnBattlefield(s0, ap, jolene);
    const o = putOnBattlefield(s0, b!, ogre);
    s0.objects[o]!.controlledSinceTurn = -1;
    let s = passUntil(structuredClone(s0), "declareAttackers", b!);
    s = settle(act(s, { type: "declareAttackers", player: b!, attacks: [{ attacker: o, defender: c! }] }));
    expect(mine(s, b!, "Treasure Token").length).toBe(1);
    // b attacking Jolene's controller: not one of my opponents.
    let t = passUntil(structuredClone(s0), "declareAttackers", b!);
    t = settle(act(t, { type: "declareAttackers", player: b!, attacks: [{ attacker: o, defender: ap }] }));
    expect(mine(t, b!, "Treasure Token").length).toBe(0);
    // I attack two opponents: one trigger, two Treasures with the replacement.
    const x = putOnBattlefield(s0, ap, ogre);
    const y = putOnBattlefield(s0, ap, bear());
    let u = settle(attack(structuredClone(s0), ap, [{ attacker: x, defender: c! }, { attacker: y, defender: d! }]));
    expect(mine(u, ap, "Treasure Token").length).toBe(2);
  });
});

describe("Preacher of the Schism", () => {
  it("attacking the player with the most life makes a lifelink Vampire; attacking while you have the most life draws and loses 1 life", () => {
    const { s: s0, ap } = setup([]);
    const [b, c] = others(s0, ap);
    const p = putOnBattlefield(s0, ap, preacher);
    s0.players[b!]!.life = 45;
    let s = settle(attack(structuredClone(s0), ap, [{ attacker: p, defender: b! }]));
    expect(mine(s, ap, "Vampire Token").length + mine(s, ap, "Vampire").length).toBe(1);
    const hand = s0.players[ap]!.hand.length;
    expect(s.players[ap]!.hand.length).toBe(hand); // b has more life than me
    // Attacking c (40, not the most) while I'm tied for most: draw and lose 1, no Vampire.
    s0.players[b!]!.life = 30;
    let t = settle(attack(structuredClone(s0), ap, [{ attacker: p, defender: c! }]));
    expect(t.players[ap]!.hand.length).toBe(hand + 1);
    expect(t.players[ap]!.life).toBe(39);
    // c is tied with me for most, so the token too (ruling: both trigger).
    expect(mine(t, ap, "Vampire Token").length + mine(t, ap, "Vampire").length).toBe(1);
    // Attacking b, who has the least life, while I'm not the most: nothing.
    s0.players[c!]!.life = 50;
    let u = settle(attack(structuredClone(s0), ap, [{ attacker: p, defender: b! }]));
    expect(u.players[ap]!.hand.length).toBe(hand);
    expect(mine(u, ap, "Vampire Token").length + mine(u, ap, "Vampire").length).toBe(0);
  });
});

describe("Star Compass", () => {
  it("makes only the colors your basic lands could produce", () => {
    const { s: s0, ap } = setup([]);
    const s = s0;
    for (const id of [...s.battlefield]) s.battlefield.splice(s.battlefield.indexOf(id), 1);
    const sc = putOnBattlefield(s, ap, compass);
    const choices = () => manaAbilitiesOn(s, s.objects[sc]!).flatMap((ab) => manaChoices(s, s.objects[sc]!, ab));
    putOnBattlefield(s, ap, card("Test Plains Land", "Land", "", { oracleText: "{T}: Add {W}." }));
    expect(choices()).toEqual([]);
    putOnBattlefield(s, ap, card("Forest", "Basic Land — Forest"));
    expect(choices()).toEqual(["G"]);
  });
});

describe("Shadow of Mortality", () => {
  it("costs {X} less where X is how far your life is below 40", () => {
    const { s: s0, ap, ids } = setup([shadow]);
    for (const id of [...s0.battlefield]) s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
    for (let i = 0; i < 6; i++) putOnBattlefield(s0, ap, card("Swamp", "Basic Land — Swamp"));
    s0.players[ap]!.life = 40;
    expect(planCast(s0, ap, ids[0]!, [])).toBeNull();
    s0.players[ap]!.life = 30; // {13}{B}{B} less {10}: {3}{B}{B}
    expect(planCast(s0, ap, ids[0]!, [])).not.toBeNull();
    s0.players[ap]!.life = 45; // above starting life: no reduction
    expect(planCast(s0, ap, ids[0]!, [])).toBeNull();
  });
});
