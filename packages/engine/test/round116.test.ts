// Round 116, most played cards: Lim-Dûl's Vault, Mimic Vat (imprint and a token copy of the exiled card), Regal Behemoth
// (a triggered mana ability while you're the monarch), Icon of Ancestry ("of the chosen type"), Emrakul, the World Anew
// (protection from spells and from permanents that were cast this turn, CR 702.16) and Gonti, Night Minister.

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, forest, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { botActions, compileCard, isFullySupported, planActivate, planCast, waitingOn, type Action, type GameState, type ManaType, type PlayerId } from "../src";
import { blockProblem, moveObject } from "../src/game";
import { wasCastThisTurn } from "../src/cards";
import { characteristics } from "../src/layers";

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const toHand = (s: GameState, pid: PlayerId, def: ReturnType<typeof card>) => {
  const id = putOnBattlefield(s, pid, def);
  moveObject(s, id, "hand");
  return id;
};
/** Put these cards on top of `pid`'s library, the first on top. */
const stack = (s: GameState, pid: PlayerId, defs: ReturnType<typeof card>[]) => {
  const ids = defs.map((d) => {
    const id = putOnBattlefield(s, pid, d);
    moveObject(s, id, "library");
    return id;
  });
  const p = s.players[pid]!;
  p.library = [...ids, ...p.library.filter((id) => !ids.includes(id))];
  return ids;
};
const name = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;

// Real oracle text (Scryfall).
const vault = card("Lim-Dûl's Vault", "Instant", "{U}{B}", {
  oracleText:
    "Look at the top five cards of your library. As many times as you choose, you may pay 1 life, put those cards on the bottom of your library in any order, then look at the top five cards of your library. Then shuffle and put the last cards you looked at this way on top in any order.",
});
const mimicVat = card("Mimic Vat", "Artifact", "{3}", {
  oracleText:
    "Imprint — Whenever a nontoken creature dies, you may exile that card. If you do, return each other card exiled with this artifact to its owner's graveyard.\n{3}, {T}: Create a token that's a copy of a card exiled with this artifact. It gains haste. Exile it at the beginning of the next end step.",
});
const behemoth = card("Regal Behemoth", "Creature — Lizard", "{5}{G}", {
  power: "5",
  toughness: "5",
  keywords: ["Trample"],
  oracleText: "Trample\nWhen this creature enters, you become the monarch.\nWhenever you tap a land for mana while you're the monarch, add an additional one mana of any color.",
});
const icon = card("Icon of Ancestry", "Artifact", "{3}", {
  oracleText:
    "As this artifact enters, choose a creature type.\nCreatures you control of the chosen type get +1/+1.\n{3}, {T}: Look at the top three cards of your library. You may reveal a creature card of the chosen type from among them and put it into your hand. Put the rest on the bottom of your library in a random order.",
});
const emrakul = card("Emrakul, the World Anew", "Legendary Creature — Eldrazi", "{12}", {
  power: "12",
  toughness: "12",
  keywords: ["Flying", "Madness", "Protection"],
  oracleText:
    "When you cast this spell, gain control of all creatures target player controls.\nFlying, protection from spells and from permanents that were cast this turn\nWhen Emrakul leaves the battlefield, sacrifice all creatures you control.\nMadness—Pay six {C}.",
});
const gonti = card("Gonti, Night Minister", "Legendary Creature — Aetherborn Rogue", "{2}{B}{B}", {
  power: "3",
  toughness: "4",
  oracleText:
    "Whenever a player casts a spell they don't own, that player creates a Treasure token.\nWhenever a creature deals combat damage to one of your opponents, its controller looks at the top card of that opponent's library and exiles it face down. They may play that card for as long as it remains exiled. Mana of any type can be spent to cast a spell this way.",
});
const doomBlade = card("Doom Blade", "Instant", "{1}{B}", { oracleText: "Destroy target nonblack creature." });
const pyroclasm = card("Pyroclasm", "Sorcery", "{1}{R}", { oracleText: "Pyroclasm deals 2 damage to each creature." });
const elf = card("Llanowar Elves", "Creature — Elf Druid", "{G}", { power: "1", toughness: "1", oracleText: "{T}: Add {G}." });
const dragon = card("Shivan Dragon", "Creature — Dragon", "{4}{R}{R}", { power: "5", toughness: "5", keywords: ["Flying"], oracleText: "Flying" });
const opt = card("Quick Study", "Instant", "{U}", { oracleText: "Draw a card." });

describe("Lim-Dûl's Vault", () => {
  const five = () => ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"].map((n) => card(`Card ${n}`, "Sorcery", "{1}"));
  it("keeping the first five: the rest is shuffled and the five go back on top in the order chosen", () => {
    expect(isFullySupported(vault)).toBe(true);
    const { s: s0, ap, ids } = setup([vault]);
    let s = s0;
    const top = stack(s, ap, five()).slice(0, 5);
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, pay: { life: 1 }, vault: top });
    const life = s.players[ap]!.life;
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    expect(s.pending).toMatchObject({ kind: "arrangeTop", how: "order", cards: top });
    const order = [top[4]!, top[2]!, top[0]!, top[1]!, top[3]!];
    s = act(s, { type: "arrangeTop", player: ap, top: order, away: [] });
    expect(s.players[ap]!.library.slice(0, 5)).toEqual(order);
    expect(s.players[ap]!.life).toBe(life);
  });

  it("paying 1 life puts them on the bottom in any order and shows the next five", () => {
    const { s: s0, ap, ids } = setup([vault]);
    let s = s0;
    const cards = stack(s, ap, five());
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    const life = s.players[ap]!.life;
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.players[ap]!.life).toBe(life - 1);
    expect(s.pending).toMatchObject({ kind: "arrangeTop", how: "bottom" });
    s = act(s, { type: "arrangeTop", player: ap, top: cards.slice(0, 5), away: [] });
    expect(s.players[ap]!.library.slice(-5)).toEqual(cards.slice(0, 5));
    expect(s.pending).toMatchObject({ kind: "chooseMay", vault: cards.slice(5, 10) });
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    s = act(s, { type: "arrangeTop", player: ap, top: cards.slice(5, 10), away: [] });
    expect(s.players[ap]!.library.slice(0, 5)).toEqual(cards.slice(5, 10));
    expect(s.stack).toHaveLength(0);
  });

  it("a bot keeps five cards it wants and digs past five it doesn't", () => {
    const { s: s0, ap, ids } = setup([vault]);
    let s = s0;
    stack(s, ap, [dragon, dragon, dragon, dragon, dragon, forest, bear(), bear(), forest, bear()]);
    // Fourteen lands: a 6-drop is one we'd draw, so these five are kept.
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(botActions(s, ap)).toEqual([{ type: "chooseMay", player: ap, yes: false }]);
    // With only two lands, five 6-drops aren't.
    for (const id of s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Land")).slice(2)) moveObject(s, id, "graveyard");
    expect(botActions(s, ap)).toEqual([{ type: "chooseMay", player: ap, yes: true }]);
  });
});

describe("Mimic Vat", () => {
  it("exiles a creature card that died, sending the card exiled before it to its owner's graveyard", () => {
    expect(isFullySupported(mimicVat)).toBe(true);
    const { s: s0, ap, opp, ids } = setup([doomBlade, doomBlade]);
    let s = s0;
    const v = putOnBattlefield(s, ap, mimicVat);
    const b1 = putOnBattlefield(s, opp, bear({ name: "First Bear" }));
    const b2 = putOnBattlefield(s, opp, dragon);
    s = settle(run(s, planCast(s, ap, ids[0]!, [target(b1)])));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    const first = s.players[opp]!.graveyard.length;
    const exiled1 = Object.values(s.objects).find((o) => o.zone === "exile" && s.cards[o.cardId]!.name === "First Bear")!;
    expect(exiled1).toBeTruthy();
    s = settle(run(s, planCast(s, ap, ids[1]!, [target(b2)])));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[exiled1.id]!.zone).toBe("graveyard");
    expect(s.players[opp]!.graveyard.length).toBe(first + 1);
    // The token copy of the exiled Shivan Dragon has haste and is exiled at the next end step.
    s = run(s, planActivate(s, ap, v, 0));
    s = settle(s);
    const tok = s.battlefield.map((id) => s.objects[id]!).find((o) => o.isToken && name(s, o.id) === "Shivan Dragon")!;
    expect(tok.controller).toBe(ap);
    expect(compileCard(s.cards[tok.cardId]!).unsupported).toEqual([]);
    s = settle(passUntil(s, "end", ap));
    expect(s.objects[tok.id]?.zone === "battlefield").toBe(false);
  });

  it("declining keeps the card exiled before; with nothing exiled, no token", () => {
    const { s: s0, ap, opp, ids } = setup([doomBlade]);
    let s = s0;
    const v = putOnBattlefield(s, ap, mimicVat);
    s = run(s, planActivate(s, ap, v, 0));
    s = settle(s);
    expect(s.battlefield.some((id) => s.objects[id]!.isToken)).toBe(false);
    const b1 = putOnBattlefield(s, opp, bear());
    s.objects[v]!.tapped = false;
    s = settle(run(s, planCast(s, ap, ids[0]!, [target(b1)])));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.objects[b1]!.zone).toBe("graveyard");
  });
});

describe("Regal Behemoth", () => {
  const pool = (s: GameState, pid: number) => Object.fromEntries(Object.entries(s.players[pid]!.manaPool).filter(([, n]) => n > 0));
  it("tapping a land for mana while you're the monarch adds one more mana of any color", () => {
    expect(isFullySupported(behemoth)).toBe(true);
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, behemoth);
    const f = putOnBattlefield(s0, ap, forest);
    // Not the monarch: just {G}.
    let s = act(s0, { type: "activateMana", player: ap, objectId: f, mana: "G" });
    expect(pool(s, ap)).toEqual({ G: 1 });
    const t0 = structuredClone(s0);
    t0.monarch = ap;
    const t = act(t0, { type: "activateMana", player: ap, objectId: f, mana: "G", extra: ["R" as ManaType] });
    expect(pool(t, ap)).toEqual({ G: 1, R: 1 });
    // Another player as the monarch: nothing extra.
    const u0 = structuredClone(s0);
    u0.monarch = opp;
    expect(pool(act(u0, { type: "activateMana", player: ap, objectId: f, mana: "G" }), ap)).toEqual({ G: 1 });
  });
});

describe("Icon of Ancestry", () => {
  it("reveals a creature card of the chosen type from the top three", () => {
    expect(isFullySupported(icon)).toBe(true);
    const { s: s0, ap } = setup([]);
    let s = s0;
    const i = putOnBattlefield(s, ap, icon);
    s.objects[i]!.chosen = { type: "Elf" };
    const [e, b, f] = stack(s, ap, [elf, bear(), forest]);
    s = settle(run(s, planActivate(s, ap, i, 0)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 1 });
    // Only the Elf can be taken.
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [b!] })).toThrow();
    s = act(s, { type: "searchLibrary", player: ap, found: [e!] });
    expect(s.objects[e!]!.zone).toBe("hand");
    expect(s.players[ap]!.library.slice(-2).sort()).toEqual([b!, f!].sort());
  });
});

describe("Emrakul, the World Anew", () => {
  it("compiles: protection from spells and from permanents cast this turn, madness for six {C}", () => {
    expect(isFullySupported(emrakul)).toBe(true);
    const c = compileCard(emrakul);
    expect(c.madness).toBe("{C}{C}{C}{C}{C}{C}");
    expect(c.textKeywords).toEqual(expect.arrayContaining(["Protection from spells", "Protection from permanents that were cast this turn"]));
  });

  it("spells can't target it or damage it", () => {
    const { s: s0, ap, opp, ids } = setup([doomBlade, pyroclasm]);
    let s = s0;
    const e = putOnBattlefield(s, opp, emrakul);
    const b = putOnBattlefield(s, opp, bear());
    expect(planCast(s, ap, ids[0]!, [target(e)])).toBeNull();
    s = cast(s, ap, ids[1]!);
    s = settle(s);
    expect(s.objects[e]!.damage).toBe(0);
    expect(s.objects[b]!.zone).toBe("graveyard");
  });

  it("creatures cast this turn can't block it; one put onto the battlefield can", () => {
    const { s: s0, ap, opp } = setup([]);
    const e = putOnBattlefield(s0, ap, emrakul);
    const flyer = putOnBattlefield(s0, opp, card("Wind Drake", "Creature — Drake", "{2}{U}", { power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying" }));
    s0.objects[e]!.attacking = opp;
    expect(blockProblem(s0, s0.objects[flyer]!, s0.objects[e]!)).toBeNull();
    s0.objects[flyer]!.wasCast = true;
    s0.objects[flyer]!.enteredTurn = s0.turn;
    expect(blockProblem(s0, s0.objects[flyer]!, s0.objects[e]!)).toMatch(/protection/);
    // Cast on an earlier turn: it can block.
    s0.objects[flyer]!.enteredTurn = s0.turn - 1;
    expect(blockProblem(s0, s0.objects[flyer]!, s0.objects[e]!)).toBeNull();
  });

  it("a creature spell that resolves was cast this turn", () => {
    const { s: s0, ap, ids } = setup([bear()]);
    const s = cast(s0, ap, ids[0]!);
    expect(wasCastThisTurn(s, s.objects[ids[0]!]!)).toBe(true);
  });

  it("when it leaves the battlefield, its controller sacrifices all creatures they control", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const e = putOnBattlefield(s, ap, emrakul);
    const mine = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, bear());
    moveObject(s, e, "hand");
    s = settle(s);
    expect(s.objects[mine]!.zone).toBe("graveyard");
    expect(s.objects[theirs]!.zone).toBe("battlefield");
  });
});

describe("Gonti, Night Minister", () => {
  it("a player casting a spell they don't own creates a Treasure", () => {
    expect(isFullySupported(gonti)).toBe(true);
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    putOnBattlefield(s, opp, gonti);
    const mine = toHand(s, ap, opt);
    // Opp's card, exiled with a permission for ap to cast it (as Gonti's own exile gives).
    const stolen = toHand(s, opp, opt);
    moveObject(s, stolen, "exile");
    s.objects[stolen]!.mayPlay = { player: ap, zc: s.objects[stolen]!.zoneChanges ?? 0, until: "exiled", turn: s.turn };
    const treasures = (t: GameState) => t.battlefield.filter((id) => t.objects[id]!.isToken && t.objects[id]!.controller === ap).length;
    s = settle(run(s, planCast(s, ap, mine)));
    expect(treasures(s)).toBe(0);
    s = settle(run(s, planCast(s, ap, stolen)));
    expect(treasures(s)).toBe(1);
  });

  it("a creature dealing combat damage to an opponent: its controller exiles that player's top card face down and may play it", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const third = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    putOnBattlefield(s, third, gonti); // ap and opp are both opponents of Gonti's controller
    const b = putOnBattlefield(s, ap, bear());
    const [top] = stack(s, opp, [dragon]);
    s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    s = settle(passUntil(settle(s), "endCombat"));
    const o = s.objects[top!]!;
    expect(o.zone).toBe("exile");
    expect(o.hiddenExile?.seen).toEqual([ap]);
    expect(o.mayPlay).toMatchObject({ player: ap, until: "exiled", anyType: true });
  });
});

describe("bots use Together Forever, Chthonian Nightmare and HELIOS One", () => {
  const together = card("Together Forever", "Enchantment", "{W}{W}", {
    keywords: ["Support"],
    oracleText: "When this enchantment enters, support 2. (Put a +1/+1 counter on each of up to two target creatures.)\n{1}: Choose target creature with a counter on it. When that creature dies this turn, return that card to its owner's hand.",
  });
  const nightmare = card("Chthonian Nightmare", "Enchantment", "{1}{B}", {
    oracleText:
      "When this enchantment enters, you get {E}{E}{E} (three energy counters).\nPay X {E}, Sacrifice a creature, Return this enchantment to its owner's hand: Return target creature card with mana value X from your graveyard to the battlefield. Activate only as a sorcery.",
  });
  const helios = card("HELIOS One", "Land", "", {
    oracleText: "{T}: Add {C}.\n{1}, {T}: You get {E} (an energy counter).\n{3}, {T}, Pay X {E}, Sacrifice this land: Destroy target nonland permanent with mana value X. Activate only as a sorcery.",
  });
  const relic = card("Big Relic", "Artifact", "{4}", { oracleText: "" });

  it("Together Forever: when an opponent's spell would destroy a creature with a counter on it", () => {
    expect([together, nightmare, helios].every((d) => isFullySupported(d))).toBe(true);
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const tf = putOnBattlefield(s, opp, together);
    const b = putOnBattlefield(s, opp, bear());
    s.objects[b]!.counters["+1/+1"] = 1;
    for (let i = 0; i < 3; i++) putOnBattlefield(s, opp, card("Plains", "Basic Land — Plains"));
    // Nothing threatens it: no activation.
    expect(botActions(s, opp).some((a) => a.type === "activateAbility" && a.objectId === tf)).toBe(false);
    const blade = toHand(s, ap, doomBlade);
    s = run(s, planCast(s, ap, blade, [target(b)]));
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    const plan = botActions(s, opp);
    expect(plan.find((a) => a.type === "activateAbility")).toMatchObject({ objectId: tf, targets: [target(b)] });
    s = settle(run(s, plan));
    expect(s.objects[b]!.zone).toBe("hand");
  });

  it("HELIOS One: destroys an opponent's permanent with mana value X, X paid in energy", () => {
    const { s: s0, ap, opp } = setup([]);
    const s = s0;
    for (const id of [...s.players[ap]!.hand]) moveObject(s, id, "library");
    s.players[ap]!.command = []; // nothing to cast
    const h = putOnBattlefield(s, ap, helios);
    s.players[ap]!.energy = 4;
    putOnBattlefield(s, opp, relic);
    s.step = "main2"; // bots use activated abilities once they're done casting spells
    const plan = botActions(s, ap);
    expect(plan.find((a) => a.type === "activateAbility" && a.objectId === h)).toMatchObject({ x: 4 });
  });

  it("Chthonian Nightmare: returns a creature card with mana value X, sacrificing a lesser creature", () => {
    const { s: s0, ap } = setup([]);
    const s = s0;
    for (const id of [...s.players[ap]!.hand]) moveObject(s, id, "library");
    s.players[ap]!.command = []; // nothing to cast
    const n = putOnBattlefield(s, ap, nightmare);
    s.players[ap]!.energy = 6;
    const big = putOnBattlefield(s, ap, dragon);
    moveObject(s, big, "graveyard");
    // Bots sacrifice only a small token for a cost.
    const sap = putOnBattlefield(s, ap, card("Saproling", "Creature — Saproling", "", { power: "1", toughness: "1" }));
    s.objects[sap]!.isToken = true;
    s.step = "main2";
    const plan = botActions(s, ap);
    expect(plan.find((a) => a.type === "activateAbility" && a.objectId === n)).toMatchObject({ x: 6, targets: [target(big)] });
  });
});

describe("more of the most played: Murkfiend Liege, Zenith Chronicler, Tifa Lockhart, Sword of War and Peace, Planar Nexus, Final Parting", () => {
  const liege = card("Murkfiend Liege", "Creature — Horror", "{2}{G/U}{G/U}{G/U}", {
    power: "4",
    toughness: "4",
    oracleText: "Other green creatures you control get +1/+1.\nOther blue creatures you control get +1/+1.\nUntap all green and/or blue creatures you control during each other player's untap step.",
  });
  const chronicler = card("Zenith Chronicler", "Artifact Creature — Phyrexian Construct", "{2}", { power: "3", toughness: "1", oracleText: "Whenever a player casts their first multicolored spell each turn, each other player draws a card." });
  const tifa = card("Tifa Lockhart", "Legendary Creature — Human Monk", "{1}{G}", { power: "1", toughness: "2", keywords: ["Trample", "Landfall"], oracleText: "Trample\nLandfall — Whenever a land you control enters, double Tifa Lockhart's power until end of turn." });
  const sword = card("Sword of War and Peace", "Artifact — Equipment", "{3}", {
    keywords: ["Equip"],
    oracleText: "Equipped creature gets +2/+2 and has protection from red and from white.\nWhenever equipped creature deals combat damage to a player, this Equipment deals damage to that player equal to the number of cards in their hand and you gain 1 life for each card in your hand.\nEquip {2}",
  });
  const nexus = card("Planar Nexus", "Land", "", { oracleText: "This land is every nonbasic land type. (Nonbasic land types include Cave, Desert, Gate, Lair, Locus, Mine, Power-Plant, Sphere, Tower, and Urza's.)\n{T}: Add {C}.\n{1}, {T}: Add one mana of any color." });
  const tower = card("Urza's Tower", "Land — Urza's Tower", "", { oracleText: "{T}: Add {C}. If you control an Urza's Mine and an Urza's Power-Plant, add {C}{C}{C} instead." });
  const parting = card("Final Parting", "Sorcery", "{3}{B}{B}", { oracleText: "Search your library for two cards. Put one into your hand and the other into your graveyard. Then shuffle." });
  const gold = card("Gold Insight", "Instant", "{U}{B}", { colors: ["U", "B"], oracleText: "Draw a card." });

  it("all six compile", () => {
    for (const c of [liege, chronicler, tifa, sword, nexus, parting]) expect(isFullySupported(c), c.name).toBe(true);
  });

  it("Murkfiend Liege: green and blue creatures get +1/+1 (both colors +2/+2), and untap in each other player's untap step", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    putOnBattlefield(s, ap, liege);
    const g = putOnBattlefield(s, ap, bear({ colors: ["G"] }));
    const gu = putOnBattlefield(s, ap, bear({ name: "Hybrid Bear", colors: ["G", "U"] }));
    const r = putOnBattlefield(s, ap, bear({ name: "Red Bear", colors: ["R"] }));
    expect([pt(s, g), pt(s, gu), pt(s, r)]).toEqual(["3/3", "4/4", "2/2"]);
    for (const id of [g, r]) s.objects[id]!.tapped = true;
    const next = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    s = passUntil(s, "upkeep", next);
    expect(s.objects[g]!.tapped).toBe(false);
    expect(s.objects[r]!.tapped).toBe(true);
  });

  it("Zenith Chronicler: a player's first multicolored spell each turn makes each other player draw", () => {
    const { s: s0, ap, ids } = setup([gold, gold]);
    let s = s0;
    putOnBattlefield(s, ap, chronicler);
    const hands = (t: GameState) => t.turnOrder.map((p) => t.players[p]!.hand.length);
    const before = hands(s);
    s = settle(cast(s, ap, ids[0]!));
    // ap: cast one, drew one from the spell; everyone else: one from the trigger.
    expect(hands(s)).toEqual(s.turnOrder.map((p, i) => before[i]! + (p === ap ? 0 : 1)));
    const mid = hands(s);
    s = settle(cast(s, ap, ids[1]!));
    expect(hands(s)).toEqual(mid);
  });

  it("Tifa Lockhart: each land doubles its power until end of turn", () => {
    const { s: s0, ap, ids } = setup([forest]);
    let s = s0;
    const t = putOnBattlefield(s, ap, tifa);
    s.objects[ids[0]!]!.zone = "hand";
    s = settle(act(s, { type: "playLand", player: ap, objectId: ids[0]! }));
    expect(pt(s, t)).toBe("2/2");
    // A land put onto the battlefield by an effect is landfall too.
    moveObject(s, toHand(s, ap, forest), "battlefield");
    s = settle(s);
    expect(pt(s, t)).toBe("4/2");
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    expect(pt(s, t)).toBe("1/2");
  });

  it("Sword of War and Peace: damage equal to the cards in that player's hand, life for each card in yours", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const b = putOnBattlefield(s, ap, bear());
    const sw = putOnBattlefield(s, ap, sword);
    s.objects[sw]!.attachedTo = b;
    for (let i = 0; i < 3; i++) toHand(s, ap, bear());
    while (s.players[opp]!.hand.length < 5) toHand(s, opp, bear());
    const oppHand = s.players[opp]!.hand.length;
    const myHand = s.players[ap]!.hand.length;
    const [lifeA, lifeO] = [s.players[ap]!.life, s.players[opp]!.life];
    s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    s = settle(passUntil(settle(s), "endCombat"));
    expect(s.players[opp]!.life).toBe(lifeO - 4 - oppHand);
    expect(s.players[ap]!.life).toBe(lifeA + myHand);
  });

  it("Planar Nexus: every nonbasic land type, so Urza's Tower makes {C}{C}{C}", () => {
    const { s: s0, ap } = setup([]);
    const n = putOnBattlefield(s0, ap, nexus);
    const sub = characteristics(s0, s0.objects[n]!).subtypes;
    expect(sub).toEqual(expect.arrayContaining(["Cave", "Desert", "Gate", "Lair", "Locus", "Mine", "Planet", "Power-Plant", "Sphere", "Tower", "Town", "Urza's"]));
    expect(sub).not.toContain("Forest");
    const t = putOnBattlefield(s0, ap, tower);
    const s = act(s0, { type: "activateMana", player: ap, objectId: t, mana: "C" });
    expect(s.players[ap]!.manaPool.C).toBe(3);
  });

  it("Final Parting: two cards, one to hand and the other to the graveyard", () => {
    const { s: s0, ap, ids } = setup([parting]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", min: 2, max: 2 });
    const lib = s.players[ap]!.library;
    const [a, b] = [lib[10]!, lib[20]!];
    s = act(s, { type: "searchLibrary", player: ap, found: [a, b] });
    expect(s.objects[a]!.zone).toBe("hand");
    expect(s.objects[b]!.zone).toBe("graveyard");
  });
});

describe("more of the most played: Lair of the Hydra, PuPu UFO, Alandra, Tinder Wall, Nine-Lives Familiar", () => {
  const lair = card("Lair of the Hydra", "Land", "", { oracleText: "If you control two or more other lands, this land enters tapped.\n{T}: Add {G}.\n{X}{G}: Until end of turn, this land becomes an X/X green Hydra creature. It's still a land. X can't be 0." });
  const pupu = card("PuPu UFO", "Artifact Creature — Construct Alien", "{2}", { power: "0", toughness: "4", keywords: ["Flying"], oracleText: "Flying\n{T}: You may put a land card from your hand onto the battlefield.\n{3}: Until end of turn, this creature's base power becomes equal to the number of Towns you control." });
  const alandra = card("Alandra, Sky Dreamer", "Legendary Creature — Merfolk Wizard", "{2}{U}{U}", {
    power: "2",
    toughness: "4",
    oracleText: "Whenever you draw your second card each turn, create a 2/2 blue Drake creature token with flying.\nWhenever you draw your fifth card each turn, Alandra and Drakes you control each get +X/+X until end of turn, where X is the number of cards in your hand.",
  });
  const tinder = card("Tinder Wall", "Creature — Plant Wall", "{G}", { power: "0", toughness: "3", keywords: ["Defender"], oracleText: "Defender (This creature can't attack.)\nSacrifice this creature: Add {R}{R}.\n{R}, Sacrifice this creature: It deals 2 damage to target creature it's blocking." });
  const familiar = card("Nine-Lives Familiar", "Creature — Cat", "{1}{B}{B}", { power: "1", toughness: "1", oracleText: "This creature enters with eight revival counters on it if you cast it.\nWhen this creature dies, if it had a revival counter on it, return it to the battlefield with one fewer revival counter on it at the beginning of the next end step." });
  const town = card("Market Town", "Land — Town", "", { oracleText: "{T}: Add {C}." });
  const drawFive = card("Big Draw", "Sorcery", "{U}", { oracleText: "Draw five cards." });

  it("all five compile", () => {
    for (const c of [lair, pupu, alandra, tinder, familiar]) expect(isFullySupported(c), c.name).toBe(true);
  });

  it("Lair of the Hydra: becomes an X/X Hydra; X can't be 0", () => {
    const { s: s0, ap } = setup([]);
    const l = putOnBattlefield(s0, ap, lair);
    s0.objects[l]!.tapped = false;
    expect(planActivate(s0, ap, l, 0, undefined, undefined, undefined, 0)).toBeNull();
    const s = settle(run(s0, planActivate(s0, ap, l, 0, undefined, undefined, undefined, 3)));
    expect(characteristics(s, s.objects[l]!).types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    expect(pt(s, l)).toBe("3/3");
  });

  it("PuPu UFO: base power becomes the number of Towns you control", () => {
    const { s: s0, ap } = setup([]);
    const u = putOnBattlefield(s0, ap, pupu);
    putOnBattlefield(s0, ap, town);
    putOnBattlefield(s0, ap, town);
    const s = settle(run(s0, planActivate(s0, ap, u, 1)));
    expect(pt(s, u)).toBe("2/4");
  });

  it("Alandra: a Drake for the second card drawn, then +X/+X for the fifth", () => {
    const { s: s0, ap, ids } = setup([drawFive]);
    let s = s0;
    const a = putOnBattlefield(s, ap, alandra);
    const drake = putOnBattlefield(s, ap, card("Wind Drake", "Creature — Drake", "{2}{U}", { power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying" }));
    const b = putOnBattlefield(s, ap, bear());
    s = settle(cast(s, ap, ids[0]!));
    // Both trigger as the spell resolves; whichever order they resolve in, there's one Drake token.
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap)).toHaveLength(1);
    const x = s.players[ap]!.hand.length;
    expect(pt(s, a)).toBe(`${2 + x}/${4 + x}`);
    expect(pt(s, drake)).toBe(`${2 + x}/${2 + x}`);
    expect(pt(s, b)).toBe("2/2");
  });

  it("Tinder Wall: 2 damage to a creature it's blocking, and only that one", () => {
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, tinder);
    const blocked = putOnBattlefield(s0, opp, bear());
    const other = putOnBattlefield(s0, opp, bear({ name: "Other Bear" }));
    for (const b of [blocked, other]) s0.objects[b]!.attacking = ap;
    s0.objects[w]!.blocking = [blocked];
    s0.objects[blocked]!.blockedBy = [w];
    expect(planActivate(s0, ap, w, 0, [target(other)])).toBeNull();
    const s = settle(run(s0, planActivate(s0, ap, w, 0, [target(blocked)])));
    expect(s.objects[w]!.zone).toBe("graveyard");
    expect(s.objects[blocked]!.zone).toBe("graveyard");
    expect(s.objects[other]!.zone).toBe("battlefield");
  });

  it("Nine-Lives Familiar: eight revival counters if cast; back with one fewer at the next end step", () => {
    const { s: s0, ap, ids } = setup([familiar]);
    let s = settle(cast(s0, ap, ids[0]!));
    const f = ids[0]!;
    expect(s.objects[f]!.counters?.revival).toBe(8);
    moveObject(s, f, "graveyard");
    s = settle(s);
    expect(s.objects[f]!.zone).toBe("graveyard");
    s = settle(passUntil(s, "end", ap));
    expect(s.objects[f]!.zone).toBe("battlefield");
    expect(s.objects[f]!.counters?.revival).toBe(7);
  });

  it("Nine-Lives Familiar: not cast, no counters, so it stays dead", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const f = putOnBattlefield(s, ap, familiar);
    expect(s.objects[f]!.counters?.revival ?? 0).toBe(0);
    moveObject(s, f, "graveyard");
    s = settle(passUntil(settle(s), "end", ap));
    expect(s.objects[f]!.zone).toBe("graveyard");
  });
});

describe("more of the most played: Ascend from Avernus, Urabrask's Forge, Karn, Pemmin's Aura, The Immortal Sun, Transpose, Twinferno, Temple of the Dragon Queen", () => {
  const ascend = card("Ascend from Avernus", "Sorcery", "{X}{W}{W}{W}", { oracleText: "Return all creature and planeswalker cards with mana value X or less from your graveyard to the battlefield. Exile Ascend from Avernus." });
  const forge = card("Urabrask's Forge", "Artifact", "{2}{R}", {
    oracleText: "At the beginning of combat on your turn, put an oil counter on this artifact, then create an X/1 red Phyrexian Horror creature token with trample and haste, where X is the number of oil counters on this artifact. Sacrifice that token at the beginning of the next end step.",
  });
  const karn = card("Karn, Legacy Reforged", "Legendary Artifact Creature — Golem", "{5}", {
    power: "*",
    toughness: "*",
    oracleText: "Karn's power and toughness are each equal to the greatest mana value among artifacts you control.\nAt the beginning of your upkeep, add {C} for each artifact you control. This mana can't be spent to cast nonartifact spells. Until end of turn, you don't lose this mana as steps and phases end.",
  });
  const pemmin = card("Pemmin's Aura", "Enchantment — Aura", "{1}{U}{U}", {
    keywords: ["Enchant"],
    oracleText: "Enchant creature\n{U}: Untap enchanted creature.\n{U}: Enchanted creature gains flying until end of turn.\n{U}: Enchanted creature gains shroud until end of turn. (It can't be the target of spells or abilities.)\n{1}: Enchanted creature gets +1/-1 or -1/+1 until end of turn.",
  });
  const sun = card("The Immortal Sun", "Legendary Artifact", "{6}", { oracleText: "Players can't activate planeswalkers' loyalty abilities.\nAt the beginning of your draw step, draw an additional card.\nSpells you cast cost {1} less to cast.\nCreatures you control get +1/+1." });
  const transpose = card("Transpose", "Instant", "{2}{B}", {
    keywords: ["Rebound"],
    oracleText:
      'Draw a card, then discard a card. You lose 1 life. If this spell was cast from your hand, create a 0/1 black Wizard creature token with "Whenever you cast a noncreature spell, this token deals 1 damage to each opponent."\nRebound (If you cast this spell from your hand, exile it as it resolves. At the beginning of your next upkeep, you may cast this card from exile without paying its mana cost.)',
  });
  const twinferno = card("Twinferno", "Instant", "{1}{R}", {
    oracleText: "Choose one —\n• When you cast your next instant or sorcery spell this turn, copy that spell. You may choose new targets for the copy.\n• Target creature you control gains double strike until end of turn. (It deals both first-strike and regular combat damage.)",
  });
  const temple = card("Temple of the Dragon Queen", "Land", "", { oracleText: "As this land enters, you may reveal a Dragon card from your hand. This land enters tapped unless you revealed a Dragon card this way or you control a Dragon.\nAs this land enters, choose a color.\n{T}: Add one mana of the chosen color." });
  const walker = card("Walker Test", "Legendary Planeswalker — Test", "{3}", { loyalty: "3", oracleText: "+1: You gain 1 life." });
  const dragon = card("Shivan Dragon", "Creature — Dragon", "{4}{R}{R}", { power: "5", toughness: "5", keywords: ["Flying"], oracleText: "Flying" });
  const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });

  it("all eight compile", () => {
    for (const c of [ascend, forge, karn, pemmin, sun, transpose, twinferno, temple]) expect(isFullySupported(c), c.name).toBe(true);
  });

  it("Ascend from Avernus: creatures and planeswalkers with mana value X or less come back; it's exiled", () => {
    const { s: s0, ap, ids } = setup([ascend]);
    const small = toHand(s0, ap, bear());
    const pw = toHand(s0, ap, walker);
    const big = toHand(s0, ap, dragon);
    for (const id of [small, pw, big]) moveObject(s0, id, "graveyard");
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 3)));
    expect(s.objects[small]!.zone).toBe("battlefield");
    expect(s.objects[pw]!.zone).toBe("battlefield");
    expect(s.objects[big]!.zone).toBe("graveyard");
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
  });

  it("Urabrask's Forge: an X/1 Horror, X the oil counters, sacrificed at the next end step", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const f = putOnBattlefield(s, ap, forge);
    s.objects[f]!.counters.oil = 2;
    s = settle(passUntil(s, "beginCombat", ap));
    expect(s.objects[f]!.counters.oil).toBe(3);
    const tok = s.battlefield.find((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap)!;
    expect(pt(s, tok)).toBe("3/1");
    s = settle(passUntil(s, "end", ap));
    expect(s.objects[tok]?.zone === "battlefield").toBe(false);
  });

  it("Karn, Legacy Reforged: {C} for each artifact at upkeep, kept for the turn, only for artifact spells", () => {
    expect(compileCard(karn).triggers[0]!.body.effects[0]).toMatchObject({ type: "addMana", keep: "turn", only: { other: true, spells: { types: ["Artifact"] } } });
    const { s: s0, ap } = setup([]);
    let s = s0;
    putOnBattlefield(s, ap, karn);
    putOnBattlefield(s, ap, forge);
    s = settle(passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!));
    s = settle(passUntil(s, "upkeep", ap));
    s = settle(passUntil(s, "draw", ap));
    const lots = s.players[ap]!.manaLots ?? [];
    expect(lots.reduce((a, l) => a + (l.mana === "C" ? l.n : 0), 0)).toBe(2);
    expect(lots.every((l) => l.keep === "turn" && l.only?.other)).toBe(true);
  });

  it("Pemmin's Aura: +1/-1 or -1/+1, chosen as it resolves", () => {
    const { s: s0, ap } = setup([]);
    const b = putOnBattlefield(s0, ap, bear());
    const a = putOnBattlefield(s0, ap, pemmin);
    s0.objects[a]!.attachedTo = b;
    let s = settle(run(s0, planActivate(s0, ap, a, 3)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "either", labels: ["It gets +1/-1 until end of turn", "It gets -1/+1 until end of turn"] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "1" }));
    expect(pt(s, b)).toBe("1/3");
  });

  it("The Immortal Sun: no loyalty abilities while it's on the battlefield", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, walker);
    s0.objects[w]!.counters.loyalty = 3;
    expect(planActivate(s0, ap, w, 0)).not.toBeNull();
    putOnBattlefield(s0, ap, sun);
    expect(planActivate(s0, ap, w, 0)).toBeNull();
  });

  it("Transpose: the Wizard only when cast from your hand", () => {
    const { s: s0, ap, ids } = setup([transpose]);
    let s = settle(cast(s0, ap, ids[0]!));
    if (s.pending?.kind === "discard") s = settle(act(s, { type: "discard", player: ap, objectIds: [s.players[ap]!.hand[0]!] }));
    const wizards = (t: GameState) => t.battlefield.filter((id) => t.objects[id]!.isToken && t.cards[t.objects[id]!.cardId]!.name.includes("Wizard")).length;
    expect(wizards(s)).toBe(1);
    // Rebound: cast again from exile at the next upkeep, not from the hand, so no second Wizard.
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
  });

  it("Twinferno: the next instant or sorcery this turn is copied", () => {
    const { s: s0, ap, opp, ids } = setup([twinferno, shock]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, [0])));
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }])));
    // Keep the copy's target.
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: ap, copyOf: "Shock" });
    s = settle(act(s, { type: "copyTargets", player: ap }));
    expect(s.players[opp]!.life).toBe(life - 4);
  });

  it("Temple of the Dragon Queen: untapped if you reveal a Dragon or control one, tapped otherwise", () => {
    const one = (setupFn: (s: GameState, ap: PlayerId) => void, untapped?: boolean) => {
      const { s: s0, ap, ids } = setup([temple]);
      setupFn(s0, ap);
      let s = act(s0, { type: "playLand", player: ap, objectId: ids[0]!, ...(untapped ? { untapped } : {}) });
      if (s.pending?.kind === "chooseOption") s = act(s, { type: "chooseOption", player: ap, choice: s.pending.options[0]! });
      return s.objects[ids[0]!]!.tapped;
    };
    expect(one(() => {})).toBe(true);
    expect(one((s, ap) => void toHand(s, ap, dragon), true)).toBe(false);
    expect(one((s, ap) => void putOnBattlefield(s, ap, dragon))).toBe(false);
  });
});
