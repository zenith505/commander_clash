// Round 113, the first of the most played cards: bots and Food Chain, ...

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passAll, passUntil, putOnBattlefield, setup } from "./helpers";
import { blockCost, botActions, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, parseManaCost, planActivate, planMana, power, toughness, waitingOn, type Action, type GameState, type PlayerId } from "../src";

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
