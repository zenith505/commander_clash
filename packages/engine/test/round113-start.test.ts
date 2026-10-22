// Round 113, the first of the most played cards: bots and Food Chain, ...

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, forest, target, passAll, passUntil, putOnBattlefield, scry, setup } from "./helpers";
import { applyAction, blockCost, botActions, moveObject, manaAbilitiesOn, planCast, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, parseManaCost, planActivate, planMana, power, toughness, waitingOn, type Action, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const foodChain = card("Food Chain", "Enchantment", "{2}{G}", {
  oracleText: "Exile a creature you control: Add X mana of any one color, where X is 1 plus the exiled creature's mana value. Spend this mana only to cast creature spells.",
});
const wurm = card("Craw Wurm", "Creature — Wurm", "{4}{G}{G}", { power: "6", toughness: "4" });

/** Only these cards in the player's hand (the rest back on top of the library), and no commander to cast. */
const onlyInHand = (s: GameState, pid: PlayerId, ids: string[]) => {
  const p = s.players[pid]!;
  for (const id of p.hand.filter((x) => !ids.includes(x))) {
    s.objects[id]!.zone = "library";
    p.library.unshift(id);
  }
  p.hand = [...ids];
  p.command = [];
};
/** All of the player's lands tapped but `untapped` of them. */
const tapLands = (s: GameState, pid: PlayerId, untapped: number) => {
  const lands = s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land") && /Forest/.test(s.cards[s.objects[id]!.cardId]!.name));
  const others = s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land") && !lands.includes(id));
  [...lands.slice(untapped), ...others].forEach((id) => (s.objects[id]!.tapped = true));
};

/** The bot's actions in its main phase until it passes, as taken. */
function botMain(s: GameState, pid: PlayerId, max = 20): { s: GameState; taken: Action[] } {
  const taken: Action[] = [];
  for (let i = 0; i < max && waitingOn(s) === pid; i++) {
    const acts = botActions(s, pid);
    if (acts.length === 1 && acts[0]!.type === "passPriority" && !s.stack.length) break;
    for (const a of acts) {
      taken.push(a);
      s = act(s, a);
    }
  }
  return { s, taken };
}

describe("bots and Food Chain", () => {
  it("a bot exiles a cheaper creature to cast a creature card it couldn't pay for", () => {
    const { s: s0, ap, ids } = setup([wurm]);
    const fc = putOnBattlefield(s0, ap, foodChain);
    const b = putOnBattlefield(s0, ap, bear());
    onlyInHand(s0, ap, ids);
    tapLands(s0, ap, 3);
    const { s, taken } = botMain(s0, ap);
    expect(taken.some((a) => a.type === "activateAbility" && a.objectId === fc && a.costs?.sacrifice?.[0] === b)).toBe(true);
    // Green, for the Wurm: three from Food Chain, three from the Forests.
    expect(taken.some((a) => a.type === "chooseOption" && /green/i.test(a.choice))).toBe(true);
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.objects[ids[0]!]!.zone).toBe("stack");
    expect(passAll(s).objects[ids[0]!]!.zone).toBe("battlefield");
  });

  it("not when the mana still doesn't pay for anything", () => {
    const { s: s0, ap, ids } = setup([wurm]);
    const fc = putOnBattlefield(s0, ap, foodChain);
    const b = putOnBattlefield(s0, ap, bear());
    onlyInHand(s0, ap, ids);
    tapLands(s0, ap, 1);
    const { s, taken } = botMain(s0, ap);
    expect(taken.some((a) => a.type === "activateAbility" && a.objectId === fc)).toBe(false);
    expect(s.objects[b]!.zone).toBe("battlefield");
  });

  it("not a creature worth about as much as the card, nor a commander", () => {
    const { s: s0, ap, ids } = setup([card("Hill Giant", "Creature — Giant", "{3}{G}", { power: "3", toughness: "3" })]);
    const fc = putOnBattlefield(s0, ap, foodChain);
    const b = putOnBattlefield(s0, ap, card("Centaur Courser", "Creature — Centaur", "{2}{G}", { power: "3", toughness: "3" }));
    const cmdr = putOnBattlefield(s0, ap, card("Big Commander", "Legendary Creature — Elf", "{1}{G}", { power: "3", toughness: "3" }), { commander: true });
    onlyInHand(s0, ap, ids);
    tapLands(s0, ap, 0);
    const { s, taken } = botMain(s0, ap);
    expect(taken.some((a) => a.type === "activateAbility" && a.objectId === fc)).toBe(false);
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[cmdr]!.zone).toBe("battlefield");
  });
});

const minasMorgul = card("Minas Morgul, Dark Fortress", "Legendary Land", "", {
  oracleText:
    "Minas Morgul enters tapped.\n{T}: Add {B}.\n{3}{B}, {T}: Put a shadow counter on target creature. For as long as that creature has a shadow counter on it, it's a Wraith in addition to its other types. (A creature with shadow can block or be blocked by only creatures with shadow.)",
});

describe("Minas Morgul, Dark Fortress", () => {
  it("is supported", () => expect(isFullySupported(minasMorgul)).toBe(true));

  it("a shadow counter gives shadow, and the creature is a Wraith for as long as it has one", () => {
    let { s, ap, opp } = setup([]);
    const mm = putOnBattlefield(s, ap, minasMorgul);
    const b = putOnBattlefield(s, opp, bear());
    s = passAll(planActivate(s, ap, mm, 0, [{ kind: "object", id: b }])!.reduce(act, s));
    expect(s.objects[b]!.counters.shadow).toBe(1);
    expect(objHasKeyword(s, s.objects[b]!, "Shadow")).toBe(true);
    expect(characteristics(s, s.objects[b]!).subtypes).toEqual(expect.arrayContaining(["Bear", "Wraith"]));
    // The counter gone, the effect ends for good (CR 611.2b): a new shadow counter gives shadow, but no Wraith.
    s.objects[b]!.counters.shadow = 0;
    invalidateCharacteristics(s);
    s = passAll(s);
    expect(characteristics(s, s.objects[b]!).subtypes).not.toContain("Wraith");
    s.objects[b]!.counters.shadow = 1;
    invalidateCharacteristics(s);
    expect(objHasKeyword(s, s.objects[b]!, "Shadow")).toBe(true);
    expect(characteristics(s, s.objects[b]!).subtypes).not.toContain("Wraith");
  });
});

const dragonfireBlade = card("Dragonfire Blade", "Artifact — Equipment", "{1}", {
  oracleText: "Equipped creature gets +2/+2 and has hexproof from monocolored.\nEquip {4}. This ability costs {1} less to activate for each color of the creature it targets.",
});
const warriorsBlades = card("Warrior's Blades", "Artifact — Equipment", "{2}", {
  oracleText: "Equipped creature gets +1/+1.\nEquip {3}. This ability costs {1} less to activate for each +1/+1 counter on the creature it targets.",
});

describe("Dragonfire Blade and Warrior's Blades", () => {
  it("are supported", () => {
    for (const d of [dragonfireBlade, warriorsBlades]) expect(isFullySupported(d), d.name).toBe(true);
  });

  const lands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.objects[id]!.tapped).length;

  it("equip costs {1} less for each color of the creature it targets", () => {
    const { s, ap } = setup([]);
    const blade = putOnBattlefield(s, ap, dragonfireBlade);
    const gold = putOnBattlefield(s, ap, card("Gold One", "Creature — Human", "{W}{U}{B}", { power: "1", toughness: "1" }));
    const artifact = putOnBattlefield(s, ap, card("Steel One", "Artifact Creature — Golem", "{3}", { power: "1", toughness: "1" }));
    const before = lands(s, ap);
    let after = planActivate(s, ap, blade, 0, [{ kind: "object", id: gold }])!.reduce(act, s);
    expect(lands(after, ap) - before).toBe(1);
    after = passAll(after);
    expect(after.objects[blade]!.attachedTo).toBe(gold);
    expect([power(after, after.objects[gold]!), toughness(after, after.objects[gold]!)]).toEqual([3, 3]);
    // Colorless: the full {4}.
    const plain = planActivate(s, ap, blade, 0, [{ kind: "object", id: artifact }])!.reduce(act, s);
    expect(lands(plain, ap) - before).toBe(4);
  });

  it("Warrior's Blades costs {1} less for each +1/+1 counter on it", () => {
    const { s, ap } = setup([]);
    const blades = putOnBattlefield(s, ap, warriorsBlades);
    const b = putOnBattlefield(s, ap, bear());
    s.objects[b]!.counters["+1/+1"] = 2;
    invalidateCharacteristics(s);
    const before = lands(s, ap);
    const after = planActivate(s, ap, blades, 0, [{ kind: "object", id: b }])!.reduce(act, s);
    expect(lands(after, ap) - before).toBe(1);
  });
});

const archangel = card("Archangel of Tithes", "Creature — Angel", "{1}{W}{W}{W}", {
  power: "3",
  toughness: "5",
  keywords: ["Flying"],
  oracleText:
    "Flying\nAs long as this creature is untapped, creatures can't attack you or planeswalkers you control unless their controller pays {1} for each of those creatures.\nAs long as this creature is attacking, creatures can't block unless their controller pays {1} for each of those creatures.",
});

describe("Archangel of Tithes", () => {
  it("is supported", () => expect(isFullySupported(archangel)).toBe(true));

  /** Ap attacks opp with the Archangel and a Bear; opp has two Walls and two Forests. */
  function blocking() {
    const { s: s0, ap, opp } = setup([]);
    const angel = putOnBattlefield(s0, ap, archangel);
    const b = putOnBattlefield(s0, ap, bear());
    const walls = [1, 2].map((i) => putOnBattlefield(s0, opp, card(`Wall ${i}`, "Creature — Wall", "{1}", { power: "0", toughness: "4", keywords: ["Defender", "Reach"], oracleText: "Defender, reach" })));
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, opp, forest);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: angel, defender: opp }, { attacker: b, defender: opp }] });
    for (let i = 0; i < 10 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return { s, ap, opp, angel, b, walls };
  }

  it("while it's attacking, each blocking creature costs {1}, paid as blockers are declared", () => {
    const { s, opp, angel, b, walls } = blocking();
    expect(blockCost(s, 2)).toBe("{2}");
    const blocks = [{ blocker: walls[0]!, attacker: angel }, { blocker: walls[1]!, attacker: b }];
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks })).toThrow(/costs \{2\}/);
    const after = [...planMana(s, opp, parseManaCost("{2}"))!, { type: "declareBlockers", player: opp, blocks } as Action].reduce(act, s);
    expect(after.objects[walls[0]!]!.blocking).toEqual([angel]);
    expect(after.objects[walls[1]!]!.blocking).toEqual([b]);
    expect(after.log.some((l) => /pays \{2\} to block/.test(l.text))).toBe(true);
    // Not blocking costs nothing.
    expect(act(s, { type: "declareBlockers", player: opp, blocks: [] }).pending?.kind).not.toBe("declareBlockers");
  });

  it("a bot blocks only with the creatures it can pay for", () => {
    const { s: s0, opp, walls } = blocking();
    // One Forest left untapped: one blocker at most.
    const forests = s0.battlefield.filter((id) => s0.objects[id]!.controller === opp && s0.cards[s0.objects[id]!.cardId]!.name === "Forest");
    const s = structuredClone(s0);
    s.objects[forests[0]!]!.tapped = true;
    const plan = botActions(s, opp);
    const decl = plan[plan.length - 1] as Extract<Action, { type: "declareBlockers" }>;
    expect(decl.type).toBe("declareBlockers");
    expect(new Set(decl.blocks.map((x) => x.blocker)).size).toBeLessThanOrEqual(1);
    const after = plan.reduce(act, s);
    expect(walls.filter((w) => after.objects[w]!.blocking).length).toBe(new Set(decl.blocks.map((x) => x.blocker)).size);
  });

  it("not while it isn't attacking", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, archangel);
    const b = putOnBattlefield(s0, ap, bear());
    const wall = putOnBattlefield(s0, opp, card("Wall", "Creature — Wall", "{1}", { power: "0", toughness: "4" }));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    for (let i = 0; i < 10 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(blockCost(s, 1)).toBe("");
    const after = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: wall, attacker: b }] });
    expect(after.objects[wall]!.blocking).toEqual([b]);
  });
});

const brudiclad = card("Brudiclad, Telchor Engineer", "Legendary Artifact Creature — Phyrexian Artificer", "{4}{U}{R}", {
  power: "4",
  toughness: "4",
  oracleText:
    "Creature tokens you control have haste.\nAt the beginning of combat on your turn, create a 2/1 blue Phyrexian Myr artifact creature token. Then you may choose a token you control. If you do, each other token you control becomes a copy of that token.",
});

describe("Brudiclad, Telchor Engineer", () => {
  it("is supported", () => expect(isFullySupported(brudiclad)).toBe(true));

  const tokenOn = (s: GameState, pid: PlayerId, name: string, typeLine: string, pt?: [string, string]) => {
    const id = putOnBattlefield(s, pid, card(name, typeLine, "", pt ? { power: pt[0], toughness: pt[1] } : {}));
    s.objects[id]!.isToken = true;
    return id;
  };

  /** Ap's beginning of combat with Brudiclad, a 4/4 Angel token and a Treasure; an opponent has a token too. */
  function atCombat() {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, brudiclad);
    const angel = tokenOn(s0, ap, "Angel", "Creature — Angel", ["4", "4"]);
    const treasure = tokenOn(s0, ap, "Treasure", "Artifact — Treasure");
    const theirs = tokenOn(s0, opp, "Soldier", "Creature — Soldier", ["1", "1"]);
    let s = act(s0, { type: "passPriority", player: ap });
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return { s, ap, opp, angel, treasure, theirs };
  }

  it("each other token you control becomes a copy of the chosen one, the new Myr too; others' tokens don't", () => {
    let { s, ap, angel, treasure, theirs } = atCombat();
    expect(s.pending?.kind).toBe("chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending?.kind).toBe("pickPermanents");
    if (s.pending?.kind !== "pickPermanents") return;
    // Only our tokens can be chosen: the Angel, the Treasure and the Myr.
    expect(s.pending.options).toHaveLength(3);
    expect(s.pending.options).not.toContain(theirs);
    s = act(s, { type: "pickPermanents", player: ap, ids: [angel] });
    const myr = s.battlefield.find((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap && ![angel, treasure].includes(id))!;
    for (const id of [treasure, myr]) {
      const c = characteristics(s, s.objects[id]!);
      expect(c.name, id).toBe("Angel");
      expect([power(s, s.objects[id]!), toughness(s, s.objects[id]!)]).toEqual([4, 4]);
    }
    expect(characteristics(s, s.objects[theirs]!).name).toBe("Soldier");
    expect(characteristics(s, s.objects[angel]!).name).toBe("Angel");
  });

  it("choosing nothing leaves them as they are", () => {
    let { s, ap, treasure } = atCombat();
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    expect(characteristics(s, s.objects[treasure]!).name).toBe("Treasure");
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap)).toHaveLength(3);
  });
});

const goggles = card("Pyromancer's Goggles", "Legendary Artifact", "{5}", {
  oracleText: "{T}: Add {R}. When that mana is spent to cast a red instant or sorcery spell, copy that spell and you may choose new targets for the copy.",
});
const amulet = scry("transform", [
  { name: "Primal Amulet", mana_cost: "{4}", type_line: "Artifact", oracle_text: "Instant and sorcery spells you cast cost {1} less to cast.\nWhenever you cast an instant or sorcery spell, put a charge counter on Primal Amulet. Then if there are four or more charge counters on it, you may remove those counters and transform it." },
  { name: "Primal Wellspring", type_line: "Land", oracle_text: "(Transforms from Primal Amulet.)\n{T}: Add one mana of any color. When that mana is spent to cast an instant or sorcery spell, copy that spell and you may choose new targets for the copy." },
], { keywords: ["Transform"] });
const bolt = (name = "Lightning Bolt") => card(name, "Instant", "{R}", { oracleText: `${name} deals 3 damage to any target.` });
const growth = card("Giant Growth", "Instant", "{G}", { oracleText: "Target creature gets +3/+3 until end of turn." });

/** Every land of the player's tapped, so only `keep` can make mana. */
const onlyMana = (s: GameState, pid: PlayerId, keep: string) => {
  for (const id of s.battlefield) if (id !== keep && s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land")) s.objects[id]!.tapped = true;
};
/** Pass, keeping the old targets of each copy, until the stack is empty. */
const settleCopies = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    s = s.pending?.kind === "copyTargets" ? act(s, { type: "copyTargets", player: pid }) : act(s, { type: "passPriority", player: pid });
  }
  return s;
};

describe("Pyromancer's Goggles and Primal Amulet // Primal Wellspring", () => {
  it("are supported", () => {
    for (const d of [goggles, amulet]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Goggles' mana spent on a red instant copies it", () => {
    const { s: s0, ap, opp, ids } = setup([bolt()]);
    const g = putOnBattlefield(s0, ap, goggles);
    onlyMana(s0, ap, g);
    const life = s0.players[opp]!.life;
    let s = planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])!.reduce(act, s0);
    expect(s.objects[g]!.tapped).toBe(true);
    s = settleCopies(s);
    expect(s.players[opp]!.life).toBe(life - 6);
  });

  it("not on a spell that isn't red, nor on a creature spell", () => {
    const { s: s0, ap, ids } = setup([card("Blue Bolt", "Instant", "{1}", { colors: ["U"], oracleText: "Blue Bolt deals 3 damage to any target." }), bear()]);
    const g = putOnBattlefield(s0, ap, goggles);
    const target = putOnBattlefield(s0, ap, bear({ name: "Target Bear" }));
    onlyMana(s0, ap, g);
    let s = planCast(s0, ap, ids[0]!, [{ kind: "object", id: target }])!.reduce(act, s0);
    expect(s.objects[g]!.tapped).toBe(true);
    expect(s.triggerQueue).toHaveLength(0);
    s = settleCopies(s);
    expect(s.objects[target]!.zone).toBe("graveyard");
  });

  it("Primal Amulet: instants cost {1} less; the fourth charge counter may transform it", () => {
    const shock = (name: string) => card(name, "Instant", "{1}{R}", { oracleText: `${name} deals 2 damage to any target.` });
    const { s: s0, ap, ids } = setup([shock("Shock A"), shock("Shock B")]);
    const a = putOnBattlefield(s0, ap, amulet);
    s0.objects[a]!.counters.charge = 2;
    const opp = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    let s = planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])!.reduce(act, s0);
    // {1}{R} less {1}: one land tapped.
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.objects[id]!.tapped)).toHaveLength(1);
    for (let i = 0; i < 20 && !s.pending && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[a]!.counters.charge).toBe(3);
    s = planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }])!.reduce(act, s);
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.objects[a]!.counters.charge ?? 0).toBe(0);
    expect(s.objects[a]!.face).toBe(1);
    expect(characteristics(s, s.objects[a]!).types).toEqual(["Land"]);
  });

  it("Primal Wellspring: its mana copies an instant or sorcery, any color", () => {
    const { s: s0, ap, ids } = setup([growth]);
    const w = putOnBattlefield(s0, ap, amulet);
    s0.objects[w]!.face = 1;
    invalidateCharacteristics(s0);
    const b = putOnBattlefield(s0, ap, bear());
    onlyMana(s0, ap, w);
    let s = planCast(s0, ap, ids[0]!, [{ kind: "object", id: b }])!.reduce(act, s0);
    expect(s.objects[w]!.tapped).toBe(true);
    // The copy resolves first, then the spell: +6/+6.
    for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      const pid = waitingOn(s)!;
      if (s.pending?.kind === "copyTargets") s = act(s, { type: "copyTargets", player: pid });
      else s = act(s, { type: "passPriority", player: pid });
    }
    expect(power(s, s.objects[b]!)).toBe(8);
  });
});

const glimpse = card("Glimpse the Impossible", "Sorcery", "{2}{R}", {
  oracleText:
    'Exile the top three cards of your library. You may play those cards this turn. At the beginning of the next end step, if any of those cards remain exiled, put them into your graveyard, then create a 0/1 colorless Eldrazi Spawn creature token for each card put into your graveyard this way. Those tokens have "Sacrifice this token: Add {C}."',
});

describe("Glimpse the Impossible", () => {
  it("is supported", () => expect(isFullySupported(glimpse)).toBe(true));

  const spawns = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && characteristics(s, s.objects[id]!).subtypes.includes("Spawn"));

  it("the cards not played go to the graveyard at the next end step, a Spawn for each", () => {
    const { s: s0, ap, ids } = setup([glimpse]);
    let s = passAll(planCast(s0, ap, ids[0]!)!.reduce(act, s0));
    const exiled = s.players[ap]!.exile.filter((id) => s.objects[id]!.mayPlay);
    expect(exiled).toHaveLength(3);
    // Play one of them (a land if there is one, else cast it), leaving two.
    const land = exiled.find((id) => s.cards[s.objects[id]!.cardId]!.types.includes("Land"));
    if (land) s = act(s, { type: "playLand", player: ap, objectId: land });
    else s = passAll(planCast(s, ap, exiled[0]!)!.reduce(act, s));
    const left = exiled.filter((id) => s.objects[id]!.zone === "exile");
    expect(left).toHaveLength(2);
    s = passUntil(s, "end", ap);
    for (let i = 0; i < 20 && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (const id of left) expect(s.objects[id]!.zone).toBe("graveyard");
    const made = spawns(s, ap);
    expect(made).toHaveLength(2);
    expect([power(s, s.objects[made[0]!]!), toughness(s, s.objects[made[0]!]!)]).toEqual([0, 1]);
    // "Sacrifice this token: Add {C}."
    expect(s.objects[made[0]!]!.isToken).toBe(true);
    expect(manaAbilitiesOn(s, s.objects[made[0]!]!).some((m) => m.sacrificeSelf)).toBe(true);
  });

  it("no trigger when none of them remain exiled", () => {
    const { s: s0, ap, ids } = setup([glimpse]);
    let s = passAll(planCast(s0, ap, ids[0]!)!.reduce(act, s0));
    for (const id of s.players[ap]!.exile.filter((x) => s.objects[x]!.mayPlay)) {
      s.players[ap]!.exile.splice(s.players[ap]!.exile.indexOf(id), 1);
      s.objects[id]!.zone = "hand";
      s.objects[id]!.zoneChanges = (s.objects[id]!.zoneChanges ?? 0) + 1;
      s.players[ap]!.hand.push(id);
    }
    s = passUntil(s, "end", ap);
    expect(s.stack.some((x) => /Glimpse/.test(x.description))).toBe(false);
    expect(s.triggerQueue).toHaveLength(0);
    expect(spawns(s, ap)).toHaveLength(0);
  });
});

const risenReef = card("Risen Reef", "Creature — Elemental", "{1}{G}{U}", {
  power: "1",
  toughness: "1",
  oracleText:
    "Whenever this creature or another Elemental you control enters, look at the top card of your library. If it's a land card, you may put it onto the battlefield tapped. If you don't put the card onto the battlefield, put it into your hand.",
});

describe("Risen Reef", () => {
  it("is supported", () => expect(isFullySupported(risenReef)).toBe(true));

  /** Cast Risen Reef with a land (or not) on top of the library; answer its "may" with `yes`. */
  function reef(landOnTop: boolean, yes?: boolean) {
    const { s: s0, ap, ids } = setup([risenReef]);
    const lib = s0.players[ap]!.library;
    const top = lib.find((id) => s0.cards[s0.objects[id]!.cardId]!.types.includes("Land") === landOnTop)!;
    lib.splice(lib.indexOf(top), 1);
    lib.unshift(top);
    let s = planCast(s0, ap, ids[0]!)!.reduce(act, s0);
    for (let i = 0; i < 20 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    if (yes !== undefined) {
      expect(s.pending?.kind).toBe("chooseMay");
      s = act(s, { type: "chooseMay", player: ap, yes });
    }
    return { s, top };
  }

  it("a land on top may go onto the battlefield tapped", () => {
    const { s, top } = reef(true, true);
    expect(s.objects[top]!.zone).toBe("battlefield");
    expect(s.objects[top]!.tapped).toBe(true);
  });

  it("a land not put onto the battlefield goes into your hand", () => {
    const { s, top } = reef(true, false);
    expect(s.objects[top]!.zone).toBe("hand");
  });

  it("a nonland card goes into your hand, nothing asked", () => {
    const { s, top } = reef(false);
    expect(s.pending).toBeNull();
    expect(s.objects[top]!.zone).toBe("hand");
  });
});

const earthbenderAscension = card("Earthbender Ascension", "Enchantment", "{2}{G}", {
  oracleText:
    "When this enchantment enters, earthbend 2. Then search your library for a basic land card, put it onto the battlefield tapped, then shuffle.\nLandfall — Whenever a land you control enters, put a quest counter on this enchantment. When you do, if it has four or more quest counters on it, put a +1/+1 counter on target creature you control. It gains trample until end of turn.",
});

describe("Earthbender Ascension", () => {
  it("is supported", () => expect(isFullySupported(earthbenderAscension)).toBe(true));

  /** Play a land with the Ascension at `counters` quest counters; the reflexive ability, if any, targets the Bear. */
  function landfall(counters: number) {
    const { s: s0, ap, ids } = setup([forest]);
    const asc = putOnBattlefield(s0, ap, earthbenderAscension);
    s0.objects[asc]!.counters.quest = counters;
    const b = putOnBattlefield(s0, ap, bear());
    let s = act(s0, { type: "playLand", player: ap, objectId: ids[0]! });
    for (let i = 0; i < 20 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: b }] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    return { s, asc, b };
  }

  it("the fourth quest counter puts a +1/+1 counter on target creature you control, which gains trample", () => {
    const { s, asc, b } = landfall(3);
    expect(s.objects[asc]!.counters.quest).toBe(4);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
    expect(objHasKeyword(s, s.objects[b]!, "Trample")).toBe(true);
  });

  it("with fewer than four, only the quest counter", () => {
    const { s, asc, b } = landfall(1);
    expect(s.objects[asc]!.counters.quest).toBe(2);
    expect(s.objects[b]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(objHasKeyword(s, s.objects[b]!, "Trample")).toBe(false);
  });
});

describe("whenever you play a land or cast a spell (Prosper, Infernal Sovereign, Shanid, Reki)", () => {
  const prosper = card("Prosper, Tome-Bound", "Legendary Creature — Tiefling Warlock", "{2}{B}{R}", {
    power: "1",
    toughness: "4",
    keywords: ["Deathtouch"],
    oracleText: "Deathtouch\nMystic Arcanum — At the beginning of your end step, exile the top card of your library. Until the end of your next turn, you may play that card.\nPact Boon — Whenever you play a card from exile, create a Treasure token.",
  });
  const sovereign = card("Infernal Sovereign", "Creature — Demon", "{4}{B}{B}", {
    power: "6",
    toughness: "6",
    keywords: ["Flying", "Trample"],
    oracleText: "Flying, trample\nSkip your draw step.\nWhenever you play a land or cast a spell, you draw a card and you lose 1 life.",
  });
  const shanid = card("Shanid, Sleepers' Scourge", "Legendary Creature — Human Knight", "{1}{R}{W}{B}", {
    power: "2",
    toughness: "4",
    keywords: ["Menace"],
    oracleText: "Menace\nOther legendary creatures you control have menace.\nWhenever you play a legendary land or cast a legendary spell, you draw a card and you lose 1 life.",
  });
  const reki = card("Reki, the History of Kamigawa", "Legendary Creature — Human Shaman", "{2}{G}", { power: "1", toughness: "2", oracleText: "Whenever you cast a legendary spell, draw a card." });
  const legendLand = card("Minamo, School at Water's Edge", "Legendary Land", "", { oracleText: "{T}: Add {U}.\n{U}, {T}: Untap target legendary permanent." });
  const legendBear = card("Legend Bear", "Legendary Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });
  const treasures = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.subtypes.includes("Treasure")).length;
  /** Plays the land, and resolves what that triggered. */
  const play = (s: GameState, pid: PlayerId, id: string) => {
    const t = act(s, { type: "playLand", player: pid, objectId: id });
    return t.stack.length ? passAll(t) : t;
  };
  const toExile = (s: GameState, pid: PlayerId, id: string) => {
    moveObject(s, id, "exile");
    s.objects[id]!.mayPlay = { player: pid, zc: s.objects[id]!.zoneChanges ?? 0, until: "thisTurn", turn: s.turn };
  };

  it("supports the cards", () => {
    for (const c of [prosper, sovereign, shanid, reki]) expect(isFullySupported(c)).toBe(true);
  });

  it("Prosper: a land played from exile and a spell cast from exile each make a Treasure, not one from the hand", () => {
    const { s: s0, ap, ids } = setup([forest, bear(), bear()]);
    putOnBattlefield(s0, ap, prosper);
    s0.players[ap]!.landsPlayedThisTurn = 0;
    toExile(s0, ap, ids[0]!);
    toExile(s0, ap, ids[1]!);
    let s = play(s0, ap, ids[0]!);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(treasures(s, ap)).toBe(1);
    s = cast(s, ap, ids[1]!);
    while (s.stack.length) s = passAll(s);
    expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
    expect(treasures(s, ap)).toBe(2);
    s = cast(s, ap, ids[2]!);
    while (s.stack.length) s = passAll(s);
    expect(treasures(s, ap)).toBe(2);
  });

  it("Infernal Sovereign: a land from the hand and a spell each draw a card and lose 1 life", () => {
    const { s: s0, ap, ids } = setup([forest, bear()]);
    putOnBattlefield(s0, ap, sovereign);
    s0.players[ap]!.landsPlayedThisTurn = 0;
    const hand = s0.players[ap]!.hand.length;
    const life = s0.players[ap]!.life;
    let s = play(s0, ap, ids[0]!);
    expect(s.players[ap]!.hand.length).toBe(hand); // played one, drew one
    expect(s.players[ap]!.life).toBe(life - 1);
    s = cast(s, ap, ids[1]!);
    expect(s.players[ap]!.life).toBe(life - 2);
  });

  it("Shanid: only a legendary land or a legendary spell; Reki: only a legendary spell", () => {
    const { s: s0, ap, ids } = setup([forest, legendLand, bear(), legendBear]);
    putOnBattlefield(s0, ap, shanid);
    putOnBattlefield(s0, ap, reki);
    s0.players[ap]!.landsPlayedThisTurn = 0;
    const life = s0.players[ap]!.life;
    let s = play(s0, ap, ids[0]!);
    expect(s.players[ap]!.life).toBe(life);
    s.players[ap]!.landsPlayedThisTurn = 0;
    s = play(s, ap, ids[1]!);
    expect(s.players[ap]!.life).toBe(life - 1);
    const hand = s.players[ap]!.hand.length;
    s = cast(s, ap, ids[2]!);
    expect(s.players[ap]!.life).toBe(life - 1);
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    s = cast(s, ap, ids[3]!);
    while (s.stack.length) s = passAll(s);
    expect(s.players[ap]!.life).toBe(life - 2);
    expect(s.players[ap]!.hand.length).toBe(hand); // cast one, drew two (Shanid and Reki)
  });
});

describe("legendary spells (Serah Farron)", () => {
  const serah = scry("transform", [
    { name: "Serah Farron", mana_cost: "{1}{G}{W}", type_line: "Legendary Creature — Human Citizen", oracle_text: "The first legendary creature spell you cast each turn costs {2} less to cast.\nAt the beginning of combat on your turn, if you control two or more other legendary creatures, you may transform Serah Farron.", power: "2", toughness: "2" },
    { name: "Crystallized Serah", mana_cost: "", type_line: "Legendary Artifact", oracle_text: "The first legendary creature spell you cast each turn costs {2} less to cast.\nLegendary creatures you control get +2/+2." },
  ]);
  const legend = (n: number) => card(`Legend ${n}`, "Legendary Creature — Bear", "{3}{G}", { power: "2", toughness: "2" });
  it("the first legendary creature spell costs {2} less, not a nonlegendary one or the second", () => {
    expect(isFullySupported(serah)).toBe(true);
    const { s: s0, ap, ids } = setup([card("Plain Bear", "Creature — Bear", "{3}{G}", { power: "2", toughness: "2" }), legend(1), legend(2)]);
    putOnBattlefield(s0, ap, serah);
    const generic = (s: GameState, id: string) => planCast(s, ap, id)!.filter((a) => a.type === "activateMana").length;
    expect(generic(s0, ids[0]!)).toBe(4);
    expect(generic(s0, ids[1]!)).toBe(2);
    const s = cast(s0, ap, ids[1]!);
    expect(generic(s, ids[2]!)).toBe(4);
  });
});

describe("Sepulchral Primordial", () => {
  const primordial = card("Sepulchral Primordial", "Creature — Avatar", "{5}{B}{B}", {
    power: "5",
    toughness: "4",
    keywords: ["Intimidate"],
    oracleText: "Intimidate (This creature can't be blocked except by artifact creatures and/or creatures that share a color with it.)\nWhen this creature enters, for each opponent, you may put up to one target creature card from that player's graveyard onto the battlefield under your control.",
  });
  const settle = (s: GameState) => {
    for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return s;
  };
  it("one creature card from each opponent's graveyard, under your control", () => {
    expect(isFullySupported(primordial)).toBe(true);
    const { s: s0, ap, ids } = setup([primordial]);
    const i = s0.turnOrder.indexOf(ap);
    const [b, c, d] = [1, 2, 3].map((k) => s0.turnOrder[(i + k) % 4]!) as [PlayerId, PlayerId, PlayerId];
    const yard = (pid: PlayerId, name: string) => {
      const id = putOnBattlefield(s0, pid, bear({ name }));
      moveObject(s0, id, "graveyard");
      return id;
    };
    const b1 = yard(b, "Bear B1");
    const b2 = yard(b, "Bear B2");
    const d1 = yard(d, "Bear D1");
    const mine = yard(ap, "My Bear");
    let s = settle(passAll(cast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    if (s.pending?.kind !== "chooseTargets") throw new Error("no targets");
    expect(s.pending.specs.map((t) => t.controlledBy)).toEqual([b, c, d]);
    // Two from one graveyard, or your own card, can't be chosen.
    expect(() => applyAction(s, { type: "chooseTargets", player: ap, targets: [target(b1), target(b2), { kind: "none" }] })).toThrow();
    expect(() => applyAction(s, { type: "chooseTargets", player: ap, targets: [target(mine), { kind: "none" }, { kind: "none" }] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(b1), { kind: "none" }, target(d1)] }));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    for (const id of [b1, d1]) {
      expect(s.objects[id]!.zone).toBe("battlefield");
      expect(s.objects[id]!.controller).toBe(ap);
    }
    expect(s.objects[b2]!.zone).toBe("graveyard");
    expect(s.objects[mine]!.zone).toBe("graveyard");
    void c;
  });
});

describe("Forge of Heroes", () => {
  const forge = card("Forge of Heroes", "Land", "", {
    oracleText: "{T}: Add {C}.\n{T}: Choose target commander that entered this turn. Put a +1/+1 counter on it if it's a creature and a loyalty counter on it if it's a planeswalker.",
  });
  const gideon = card("Gideon Commander", "Legendary Planeswalker Creature — Gideon", "{3}{W}", { power: "4", toughness: "4", loyalty: "4" });
  it("a commander that entered this turn: +1/+1 if a creature, loyalty if a planeswalker, both if both (rulings)", () => {
    expect(isFullySupported(forge)).toBe(true);
    const { s: s0, ap, opp } = setup([]);
    const f = putOnBattlefield(s0, ap, forge);
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Commander" }), { commander: true });
    const theirs = putOnBattlefield(s0, opp, gideon, { commander: true });
    const old = putOnBattlefield(s0, opp, bear({ name: "Old Commander" }), { commander: true });
    const plain = putOnBattlefield(s0, ap, bear());
    for (const id of [mine, theirs, plain]) s0.objects[id]!.enteredTurn = s0.turn;
    s0.objects[old]!.enteredTurn = s0.turn - 1;
    s0.objects[theirs]!.counters.loyalty = 4;
    expect(planActivate(s0, ap, f, 0, [target(old)])).toBeNull();
    expect(planActivate(s0, ap, f, 0, [target(plain)])).toBeNull();
    let s = passAll(planActivate(s0, ap, f, 0, [target(mine)])!.reduce(act, s0));
    expect(s.objects[mine]!.counters["+1/+1"]).toBe(1);
    s.objects[f]!.tapped = false;
    s = passAll(planActivate(s, ap, f, 0, [target(theirs)])!.reduce(act, s));
    expect(s.objects[theirs]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[theirs]!.counters.loyalty).toBe(5);
  });
});

describe("Swarmyard Massacre", () => {
  const massacre = card("Swarmyard Massacre", "Sorcery", "{2}{B}{B}", {
    oracleText: "Create two 1/1 green Squirrel creature tokens. Then each creature that isn't an Insect, Rat, Spider, or Squirrel gets -1/-1 until end of turn for each creature you control that's an Insect, Rat, Spider, or Squirrel.",
  });
  it("-1/-1 to each creature that isn't one of those types for each of yours that is, changelings counted and spared", () => {
    expect(isFullySupported(massacre)).toBe(true);
    const { s: s0, ap, ids, opp } = setup([massacre]);
    const rat = putOnBattlefield(s0, ap, card("Our Rat", "Creature — Rat", "{1}{B}", { power: "2", toughness: "2" }));
    const shifter = card("Shapeshifter", "Creature — Shapeshifter", "{2}", { power: "2", toughness: "2", oracleText: "Changeling (This card is every creature type.)", keywords: ["Changeling"] });
    const changeling = putOnBattlefield(s0, opp, shifter);
    const big = putOnBattlefield(s0, opp, card("Big Wurm", "Creature — Wurm", "{6}", { power: "6", toughness: "6" }));
    const theirSquirrel = putOnBattlefield(s0, opp, card("Their Squirrel", "Creature — Squirrel", "{1}", { power: "1", toughness: "1" }));
    invalidateCharacteristics(s0);
    const s = cast(s0, ap, ids[0]!);
    // Ours: the Rat and two Squirrels, so -3/-3.
    expect(power(s, s.objects[big]!)).toBe(3);
    expect(toughness(s, s.objects[big]!)).toBe(3);
    expect(s.objects[changeling]!.zone).toBe("battlefield");
    expect(toughness(s, s.objects[changeling]!)).toBe(2);
    expect(toughness(s, s.objects[theirSquirrel]!)).toBe(1);
    expect(toughness(s, s.objects[rat]!)).toBe(2);
  });
});

describe("creature you control that's a Wolf or a Werewolf", () => {
  it("Howlpack Resurgence: only those types, a changeling too", () => {
    const resurgence = card("Howlpack Resurgence", "Enchantment", "{2}{G}", { keywords: ["Flash"], oracleText: "Flash\nEach creature you control that's a Wolf or a Werewolf gets +1/+1 and has trample." });
    expect(isFullySupported(resurgence)).toBe(true);
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, resurgence);
    const wolf = putOnBattlefield(s, ap, card("Wolf", "Creature — Wolf", "{1}{G}", { power: "2", toughness: "2" }));
    const shifter = putOnBattlefield(s, ap, card("Shapeshifter", "Creature — Shapeshifter", "{2}", { power: "2", toughness: "2", oracleText: "Changeling (This card is every creature type.)", keywords: ["Changeling"] }));
    const b = putOnBattlefield(s, ap, bear());
    invalidateCharacteristics(s);
    expect(power(s, s.objects[wolf]!)).toBe(3);
    expect(objHasKeyword(s, s.objects[wolf]!, "Trample")).toBe(true);
    expect(power(s, s.objects[shifter]!)).toBe(3);
    expect(power(s, s.objects[b]!)).toBe(2);
  });
});

describe("the number of creatures they control (the target player's)", () => {
  it("Pact of the Serpent: the targeted player's creatures of the chosen type", () => {
    const pact = card("Pact of the Serpent", "Sorcery — Arcane", "{1}{B}{B}", { oracleText: "Choose a creature type. Target player draws X cards and loses X life, where X is the number of creatures they control of the chosen type." });
    expect(isFullySupported(pact)).toBe(true);
    const { s: s0, ap, ids, opp } = setup([pact]);
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, opp, bear());
    putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, opp, card("Wurm", "Creature — Wurm", "{6}", { power: "6", toughness: "6" }));
    let s = cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap });
    const hand = s.players[opp]!.hand.length;
    const life = s.players[opp]!.life;
    s = passAll(act(s, { type: "chooseOption", player: ap, choice: "Bear" }));
    expect(s.players[opp]!.hand.length).toBe(hand + 2);
    expect(s.players[opp]!.life).toBe(life - 2);
  });

  it("Villainous Wrath: the target opponent loses life for each creature they control, then all creatures are destroyed", () => {
    const wrath = card("Villainous Wrath", "Sorcery", "{3}{B}{B}", { oracleText: "Target opponent loses life equal to the number of creatures they control. Then destroy all creatures." });
    expect(isFullySupported(wrath)).toBe(true);
    const { s: s0, ap, ids, opp } = setup([wrath]);
    const theirs = [0, 1, 2].map(() => putOnBattlefield(s0, opp, bear()));
    const mine = putOnBattlefield(s0, ap, bear());
    const life = s0.players[opp]!.life;
    const s = cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    expect(s.players[opp]!.life).toBe(life - 3);
    for (const id of [...theirs, mine]) expect(s.objects[id]!.zone).toBe("graveyard");
  });
});

describe("Descendants' Path", () => {
  const path = card("Descendants' Path", "Enchantment", "{2}{G}", {
    oracleText: "At the beginning of your upkeep, reveal the top card of your library. If it's a creature card that shares a creature type with a creature you control, you may cast it without paying its mana cost. If you don't cast it, put it on the bottom of your library.",
  });
  const elf = (name: string, cost = "{G}") => card(name, "Creature — Elf Druid", cost, { power: "1", toughness: "1" });
  const toUpkeep = (s0: GameState, ap: PlayerId, top: ReturnType<typeof card>) => {
    const id = putOnBattlefield(s0, ap, top);
    moveObject(s0, id, "library");
    const lib = s0.players[ap]!.library;
    lib.splice(lib.indexOf(id), 1);
    lib.unshift(id);
    let s = passUntil(passUntil(s0, "upkeep", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]), "upkeep", ap);
    for (let i = 0; i < 10 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return { s, id };
  };

  it("a creature card that shares a type with one of yours: cast free from the library", () => {
    expect(isFullySupported(path)).toBe(true);
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, path);
    putOnBattlefield(s0, ap, elf("Llanowar Elves"));
    const { s: s1, id } = toUpkeep(s0, ap, elf("Big Elf", "{5}{G}{G}"));
    expect(s1.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong", options: [id, "none"] });
    let s = act(s1, { type: "chooseOption", player: ap, choice: id });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: id });
    s = planCast(s, ap, id)!.reduce(act, s);
    expect(s.objects[id]!.zone).toBe("stack");
    s = passAll(s);
    expect(s.objects[id]!.zone).toBe("battlefield");
  });

  it("not cast, or not sharing a type: it goes to the bottom", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, path);
    putOnBattlefield(s0, ap, elf("Llanowar Elves"));
    const declined = toUpkeep(structuredClone(s0), ap, elf("Big Elf", "{5}{G}{G}"));
    const s = act(declined.s, { type: "chooseOption", player: ap, choice: "none" });
    expect(s.players[ap]!.library.at(-1)).toBe(declined.id);
    const other = toUpkeep(s0, ap, bear({ name: "Not an Elf" }));
    expect(other.s.pending).toBeNull();
    expect(other.s.players[ap]!.library.at(-1)).toBe(other.id);
  });
});

describe("Giggling Skitterspike", () => {
  it("attacks, blocks, or becomes the target of a spell: its power to each opponent", () => {
    const spike = card("Giggling Skitterspike", "Artifact Creature — Toy", "{4}", {
      power: "1",
      toughness: "1",
      keywords: ["Indestructible"],
      oracleText: "Indestructible\nWhenever this creature attacks, blocks, or becomes the target of a spell, it deals damage equal to its power to each opponent.\n{5}: Monstrosity 5. (If this creature isn't monstrous, put five +1/+1 counters on it and it becomes monstrous.)",
    });
    expect(isFullySupported(spike)).toBe(true);
    const growth = card("Giant Growth", "Instant", "{G}", { oracleText: "Target creature gets +3/+3 until end of turn." });
    const { s: s0, ap, ids } = setup([growth]);
    const id = putOnBattlefield(s0, ap, spike);
    s0.objects[id]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s0);
    const opps = s0.turnOrder.filter((p) => p !== ap);
    const life = s0.players[opps[0]!]!.life;
    let s = planCast(s0, ap, ids[0]!, [target(id)])!.reduce(act, s0);
    s = passAll(s); // the trigger, above Giant Growth
    for (const p of opps) expect(s.players[p]!.life).toBe(life - 2);
    s = passAll(s);
    expect(power(s, s.objects[id]!)).toBe(5);
  });
});

describe("Jetmir, Nexus of Revels", () => {
  it("+1/+0 and vigilance at three, also +1/+0 and trample at six, also double strike at nine", () => {
    const jetmir = card("Jetmir, Nexus of Revels", "Legendary Creature — Cat Demon", "{1}{R}{G}{W}", {
      power: "5",
      toughness: "4",
      oracleText: "Creatures you control get +1/+0 and have vigilance as long as you control three or more creatures.\nCreatures you control also get +1/+0 and have trample as long as you control six or more creatures.\nCreatures you control also get +1/+0 and have double strike as long as you control nine or more creatures.",
    });
    expect(isFullySupported(jetmir)).toBe(true);
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, jetmir);
    const b = putOnBattlefield(s, ap, bear());
    putOnBattlefield(s, ap, bear());
    invalidateCharacteristics(s);
    expect(power(s, s.objects[b]!)).toBe(3);
    expect(objHasKeyword(s, s.objects[b]!, "Vigilance")).toBe(true);
    expect(objHasKeyword(s, s.objects[b]!, "Trample")).toBe(false);
    for (let i = 0; i < 3; i++) putOnBattlefield(s, ap, bear());
    invalidateCharacteristics(s);
    expect(power(s, s.objects[b]!)).toBe(4);
    expect(objHasKeyword(s, s.objects[b]!, "Trample")).toBe(true);
    for (let i = 0; i < 3; i++) putOnBattlefield(s, ap, bear());
    invalidateCharacteristics(s);
    expect(power(s, s.objects[b]!)).toBe(5);
    expect(objHasKeyword(s, s.objects[b]!, "Double strike")).toBe(true);
  });
});

describe("Planar Incision", () => {
  it("exiled and back under its owner's control with a +1/+1 counter, a new object", () => {
    const incision = card("Planar Incision", "Instant", "{1}{W}", { oracleText: "Exile target artifact or creature, then return it to the battlefield under its owner's control with a +1/+1 counter on it." });
    expect(isFullySupported(incision)).toBe(true);
    const { s: s0, ap, ids, opp } = setup([incision]);
    const b = putOnBattlefield(s0, opp, bear());
    s0.objects[b]!.controller = ap;
    s0.objects[b]!.counters["-1/-1"] = 1;
    invalidateCharacteristics(s0);
    const s = cast(s0, ap, ids[0]!, [target(b)]);
    const back = s.battlefield.find((id) => s.objects[id]!.cardId === s0.objects[b]!.cardId)!;
    expect(back).toBeDefined();
    expect(s.objects[back]!.controller).toBe(opp);
    expect(s.objects[back]!.counters).toEqual({ "+1/+1": 1 });
    expect(power(s, s.objects[back]!)).toBe(3);
  });
});

describe("Sword of Light and Shadow", () => {
  it("combat damage to a player: gain 3 life, then you may return up to one target creature card", () => {
    const sword = card("Sword of Light and Shadow", "Artifact — Equipment", "{3}", {
      oracleText: "Equipped creature gets +2/+2 and has protection from white and from black.\nWhenever equipped creature deals combat damage to a player, you gain 3 life and you may return up to one target creature card from your graveyard to your hand.\nEquip {2}",
    });
    expect(isFullySupported(sword)).toBe(true);
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, bear());
    const sw = putOnBattlefield(s0, ap, sword);
    s0.objects[sw]!.attachedTo = b;
    const dead = putOnBattlefield(s0, ap, bear({ name: "Dead Bear" }));
    moveObject(s0, dead, "graveyard");
    invalidateCharacteristics(s0);
    const life = s0.players[ap]!.life;
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    for (let i = 0; i < 100 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, s.pending?.kind === "declareBlockers" ? { type: "declareBlockers", player: s.pending.player, blocks: [] } : { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[opp]!.life).toBe(40 - 4);
    s = act(s, { type: "chooseTargets", player: ap, targets: [target(dead)] });
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[ap]!.life).toBe(life + 3);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.objects[dead]!.zone).toBe("hand");
  });
});

describe("Stuffy Doll", () => {
  it("damage dealt to it is dealt to the chosen player; {T}: 1 damage to itself", () => {
    const doll = card("Stuffy Doll", "Artifact Creature — Construct", "{5}", {
      power: "0",
      toughness: "1",
      keywords: ["Indestructible"],
      oracleText: "Indestructible\nAs this creature enters, choose a player.\nWhenever this creature is dealt damage, it deals that much damage to the chosen player.\n{T}: This creature deals 1 damage to itself.",
    });
    expect(isFullySupported(doll)).toBe(true);
    // Without a player chosen as it enters, "the chosen player" means nothing.
    expect(isFullySupported(card("Not a Doll", "Artifact Creature — Construct", "{5}", { power: "0", toughness: "1", oracleText: "Whenever this creature is dealt damage, it deals that much damage to the chosen player." }))).toBe(false);
    const { s: s0, ap, ids, opp } = setup([card("Lava Spike", "Sorcery", "{R}", { oracleText: "Lava Spike deals 3 damage to target creature." })]);
    const d = putOnBattlefield(s0, ap, doll);
    s0.objects[d]!.chosen = { player: opp };
    const life = s0.players[opp]!.life;
    const settle = (x: GameState) => {
      for (let i = 0; i < 20 && (x.stack.length || x.triggerQueue.length); i++) x = passAll(x);
      return x;
    };
    let s = settle(planActivate(s0, ap, d, 0)!.reduce(act, s0));
    expect(s.players[opp]!.life).toBe(life - 1);
    expect(s.objects[d]!.zone).toBe("battlefield");
    s = settle(cast(s, ap, ids[0]!, [target(d)]));
    expect(s.players[opp]!.life).toBe(life - 4);
  });
});

describe("Saskia the Unyielding", () => {
  it("combat damage to a player is dealt again to the chosen player, by that creature, even once Saskia is gone (CR 608.2h)", () => {
    const saskia = card("Saskia the Unyielding", "Legendary Creature — Human Soldier", "{B}{R}{G}{W}", {
      power: "3",
      toughness: "4",
      keywords: ["Vigilance", "Haste"],
      oracleText: "Vigilance, haste\nAs Saskia enters, choose a player.\nWhenever a creature you control deals combat damage to a player, it deals that much damage to the chosen player.",
    });
    expect(isFullySupported(saskia)).toBe(true);
    const { s: s0, ap, opp } = setup([]);
    const other = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const sk = putOnBattlefield(s0, ap, saskia);
    s0.objects[sk]!.chosen = { player: other };
    const b = putOnBattlefield(s0, ap, bear());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    for (let i = 0; i < 100 && !s.stack.length; i++) s = act(s, s.pending?.kind === "declareBlockers" ? { type: "declareBlockers", player: s.pending.player, blocks: [] } : { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[opp]!.life).toBe(38);
    moveObject(s, sk, "graveyard");
    invalidateCharacteristics(s);
    s = passAll(s);
    expect(s.players[other]!.life).toBe(38);
  });
});

describe("each opponent and what they control", () => {
  it("End the Festivities: 1 damage to each opponent and each creature and planeswalker they control, not yours", () => {
    const end = card("End the Festivities", "Instant", "{R}", { oracleText: "End the Festivities deals 1 damage to each opponent and each creature and planeswalker they control." });
    expect(isFullySupported(end)).toBe(true);
    const { s: s0, ap, ids, opp } = setup([end]);
    const elf = putOnBattlefield(s0, opp, card("Elf", "Creature — Elf", "{G}", { power: "1", toughness: "1" }));
    const mine = putOnBattlefield(s0, ap, card("My Elf", "Creature — Elf", "{G}", { power: "1", toughness: "1" }));
    const s = cast(s0, ap, ids[0]!, []);
    expect(s.objects[elf]!.zone).toBe("graveyard");
    expect(s.objects[mine]!.zone).toBe("battlefield");
    for (const p of s.turnOrder.filter((p) => p !== ap)) expect(s.players[p]!.life).toBe(39);
    expect(s.players[ap]!.life).toBe(40);
  });

  it("Vraska's Fall: each opponent sacrifices a creature or planeswalker and gets a poison counter", () => {
    const fall = card("Vraska's Fall", "Instant", "{2}{B}", { oracleText: "Each opponent sacrifices a creature or planeswalker of their choice and gets a poison counter." });
    expect(isFullySupported(fall)).toBe(true);
    const { s: s0, ap, ids, opp } = setup([fall]);
    const b = putOnBattlefield(s0, opp, bear());
    let s = cast(s0, ap, ids[0]!, []);
    for (let i = 0; i < 10 && s.pending; i++) s = act(s, botActions(s, s.pending.player)[0]!);
    expect(s.objects[b]!.zone).toBe("graveyard");
    for (const p of s.turnOrder.filter((p) => p !== ap)) expect(s.players[p]!.poison).toBe(1);
  });
});
