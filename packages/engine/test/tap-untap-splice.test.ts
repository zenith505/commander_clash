// "Tap or untap target permanent" (chosen as it resolves, CR 608.2d), buyback costs that aren't mana (CR 702.27a,
// 118.8), undaunted (702.125a-b), gravestorm (702.69a: tokens and anyone's permanents count, rulings) and splice onto
// Arcane / instant or sorcery (702.47a-e: the spliced card stays in hand, its text is added after the spell's, the spell
// keeps its own characteristics, so Glacial Ray spliced onto a green spell can target a creature with protection from red).

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, putOnBattlefield, setup, target } from "./helpers";
import { botActions, castProblem, manaValue, isFullySupported, planActivate, planCast, spellCost, spliceCandidates, type Action, type CardDef, type GameState } from "../src";

// Real oracle text (Scryfall).
const twiddle = card("Twiddle", "Instant", "{U}", { oracleText: "You may tap or untap target artifact, creature, or land." });
const jolt = card("Jolt", "Instant", "{2}{U}", { oracleText: "You may tap or untap target artifact, creature, or land.\nDraw a card at the beginning of the next turn's upkeep." });
const pestermite = card("Pestermite", "Creature — Faerie Rogue", "{2}{U}", { power: "2", toughness: "1", keywords: ["Flying", "Flash"], oracleText: "Flash\nFlying\nWhen this creature enters, you may tap or untap target permanent." });
const puppeteer = card("Puppeteer", "Creature — Human Wizard", "{2}{U}", { power: "1", toughness: "2", oracleText: "{U}, {T}: You may tap or untap target creature." });
const hiddenStrings = card("Hidden Strings", "Sorcery", "{1}{U}", { keywords: ["Cipher"], oracleText: "You may tap or untap target permanent, then you may tap or untap another target permanent.\nCipher (Then you may exile this spell card encoded on a creature you control. Whenever that creature deals combat damage to a player, its controller may cast a copy of the encoded card without paying its mana cost.)" });
const mists = card("Constant Mists", "Instant", "{1}{G}", { keywords: ["Buyback"], oracleText: "Buyback—Sacrifice a land. (You may sacrifice a land in addition to any other costs as you cast this spell. If you do, put this card into your hand as it resolves.)\nPrevent all combat damage that would be dealt this turn." });
const slaughter = card("Slaughter", "Instant", "{2}{B}{B}", { keywords: ["Buyback"], oracleText: "Buyback—Pay 4 life. (You may pay 4 life in addition to any other costs as you cast this spell. If you do, put this card into your hand as it resolves.)\nDestroy target nonblack creature. It can't be regenerated." });
const forbid = card("Forbid", "Instant", "{1}{U}{U}", { keywords: ["Buyback"], oracleText: "Buyback—Discard two cards. (You may discard two cards in addition to any other costs as you cast this spell. If you do, put this card into your hand as it resolves.)\nCounter target spell." });
const flood = card("Flowstone Flood", "Sorcery", "{3}{R}", { keywords: ["Buyback"], oracleText: "Buyback—Pay 3 life, Discard a card at random. (You may pay 3 life and discard a card at random in addition to any other costs as you cast this spell. If you do, put this card into your hand as it resolves.)\nDestroy target land." });
const breach = card("Coastal Breach", "Sorcery", "{6}{U}", { keywords: ["Undaunted"], oracleText: "Undaunted (This spell costs {1} less to cast for each opponent.)\nReturn all nonland permanents to their owners' hands." });
const harvest = card("Ominous Harvest", "Sorcery", "{2}{B}", { keywords: ["Gravestorm"], oracleText: "Gravestorm (When you cast this spell, copy it for each permanent put into a graveyard from the battlefield this turn.)\nTarget player draws a card and loses 1 life." });
const bodies = card("Follow the Bodies", "Sorcery", "{2}{U}", { keywords: ["Gravestorm", "Investigate"], oracleText: 'Gravestorm (When you cast this spell, copy it for each permanent put into a graveyard from the battlefield this turn.)\nInvestigate. (Create a Clue token. It\'s an artifact with "{2}, Sacrifice this token: Draw a card.")' });
const might = card("Kodama's Might", "Instant — Arcane", "{G}", { keywords: ["Splice"], oracleText: "Target creature gets +2/+2 until end of turn.\nSplice onto Arcane {G} (As you cast an Arcane spell, you may reveal this card from your hand and pay its splice cost. If you do, add this card's effects to that spell.)" });
const ray = card("Glacial Ray", "Instant — Arcane", "{1}{R}", { keywords: ["Splice"], oracleText: "Glacial Ray deals 2 damage to any target.\nSplice onto Arcane {1}{R} (As you cast an Arcane spell, you may reveal this card from your hand and pay its splice cost. If you do, add this card's effects to that spell.)" });
const visit = card("Spiritual Visit", "Instant — Arcane", "{W}", { keywords: ["Splice"], oracleText: "Create a 1/1 colorless Spirit creature token.\nSplice onto Arcane {W} (As you cast an Arcane spell, you may reveal this card from your hand and pay its splice cost. If you do, add this card's effects to that spell.)" });
const everdream = card("Everdream", "Instant", "{1}{U}", { keywords: ["Splice"], oracleText: "Draw a card.\nSplice onto instant or sorcery {2}{U} (As you cast an instant or sorcery spell, you may reveal this card from your hand and pay its splice cost. If you do, add this card's effects to that spell.)" });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const proRed = bear({ name: "Red-Warded Bear", keywords: ["Protection"], oracleText: "Protection from red" });

const total = (c: { cost: Parameters<typeof manaValue>[0]; extra: number }) => manaValue(c.cost) + c.extra;
const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return s;
};
const choose = (s: GameState, choice: string) => {
  expect(s.pending?.kind === "chooseOption" && s.pending.what).toBe("tapOrUntap");
  return act(s, { type: "chooseOption", player: s.pending!.player, choice });
};

describe("tap or untap target permanent", () => {
  it("parses", () => supported(twiddle, jolt, pestermite, puppeteer, hiddenStrings));

  it("Twiddle: tap, untap or neither, chosen as it resolves", () => {
    const { s: s0, ap, ids, opp } = setup([twiddle, twiddle, twiddle]);
    const theirs = putOnBattlefield(s0, opp, bear());
    let s = passAll(run(s0, planCast(s0, ap, ids[0]!, [target(theirs)])));
    expect(s.pending?.kind === "chooseOption" && s.pending.options).toEqual(["tap", "untap", "neither"]);
    s = choose(s, "tap");
    expect(s.objects[theirs]!.tapped).toBe(true);
    s = choose(passAll(run(s, planCast(s, ap, ids[1]!, [target(theirs)]))), "untap");
    expect(s.objects[theirs]!.tapped).toBe(false);
    s = choose(passAll(run(s, planCast(s, ap, ids[2]!, [target(theirs)]))), "neither");
    expect(s.objects[theirs]!.tapped).toBe(false);
    expect(s.stack).toHaveLength(0);
  });

  it("Hidden Strings: one question for each of two different targets", () => {
    const { s: s0, ap, ids, opp } = setup([hiddenStrings]);
    const a = putOnBattlefield(s0, opp, bear()), b = putOnBattlefield(s0, opp, bear());
    s0.objects[b]!.tapped = true;
    expect(castProblem(s0, ap, ids[0]!, [target(a), target(a)])).not.toBeNull();
    let s = passAll(run(s0, planCast(s0, ap, ids[0]!, [target(a), target(b)])));
    s = choose(s, "tap");
    s = choose(s, "untap");
    expect([s.objects[a]!.tapped, s.objects[b]!.tapped]).toEqual([true, false]);
  });

  it("Puppeteer's ability, and a bot taps an opponent's creature and untaps its own", () => {
    const { s: s0, ap, opp } = setup([]);
    const pup = putOnBattlefield(s0, ap, puppeteer);
    const theirs = putOnBattlefield(s0, opp, bear());
    let s = passAll(run(s0, planActivate(s0, ap, pup, 0, [target(theirs)])));
    expect(s.pending?.kind === "chooseOption" && s.pending.what).toBe("tapOrUntap");
    s = run(s, botActions(s, ap));
    expect(s.objects[theirs]!.tapped).toBe(true);
    const mine = putOnBattlefield(s, ap, bear());
    s.objects[mine]!.tapped = true;
    s.objects[pup]!.tapped = false;
    s = passAll(run(s, planActivate(s, ap, pup, 0, [target(mine)])));
    s = run(s, botActions(s, ap));
    expect(s.objects[mine]!.tapped).toBe(false);
  });
});

describe("buyback costs that aren't mana", () => {
  it("parses", () => supported(mists, slaughter, forbid, flood));

  it("Constant Mists: sacrifice a land to buy it back", () => {
    const { s: s0, ap, ids } = setup([mists]);
    const land = s0.battlefield.find((id) => s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.name === "Forest")!;
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { buyback: true, sacrifice: [land] }));
    expect(s.battlefield).not.toContain(land);
    s = passAll(s);
    expect(s.players[ap]!.hand).toContain(ids[0]);
  });

  it("Slaughter: pay 4 life to buy it back; without buyback it goes to the graveyard", () => {
    const { s: s0, ap, ids, opp } = setup([slaughter]);
    const a = putOnBattlefield(s0, opp, bear()), b = putOnBattlefield(s0, opp, bear());
    const life = s0.players[ap]!.life;
    let s = passAll(run(s0, planCast(s0, ap, ids[0]!, [target(a)], undefined, "auto", undefined, { buyback: true })));
    expect(s.players[ap]!.life).toBe(life - 4);
    expect(s.battlefield).not.toContain(a);
    expect(s.players[ap]!.hand).toContain(ids[0]);
    for (const id of s.battlefield) s.objects[id]!.tapped = false;
    s = passAll(run(s, planCast(s, ap, ids[0]!, [target(b)])));
    expect(s.players[ap]!.graveyard).toContain(ids[0]);
    expect(s.players[ap]!.life).toBe(life - 4);
  });

  it("Forbid can't be bought back without two other cards to discard", () => {
    const { s, ap, ids } = setup([forbid, shock]);
    s.players[ap]!.hand = [...ids];
    const bolt = run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: s.turnOrder[1]! }]));
    const spell = [{ kind: "stack" as const, id: bolt.stack[0]!.id }];
    expect(planCast(bolt, ap, ids[0]!, spell, undefined, "auto", undefined, { buyback: true })).toBeNull();
    expect(planCast(bolt, ap, ids[0]!, spell)).not.toBeNull();
  });
});

describe("undaunted", () => {
  it("Coastal Breach costs {1} less for each opponent still in the game", () => {
    supported(breach);
    const { s, ap, ids } = setup([breach]);
    expect(total(spellCost(s, ap, s.objects[ids[0]!]!))).toBe(4); // {6}{U} minus 3: {3}{U}
    s.players[s.turnOrder.find((p) => p !== ap)!]!.lost = true;
    expect(total(spellCost(s, ap, s.objects[ids[0]!]!))).toBe(5); // two opponents left: {4}{U}
  });
});

describe("gravestorm", () => {
  it("copies it for each permanent put into a graveyard from the battlefield this turn, tokens and others' included", () => {
    supported(harvest, bodies);
    const { s: s0, ap, ids, opp } = setup([harvest]);
    s0.toGraveyardThisTurn = 3;
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    const hand = s.players[opp]!.hand.length;
    s = passAll(s);
    // Keep the original target for each copy.
    while (s.pending?.kind === "copyTargets") s = passAll(act(s, { type: "copyTargets", player: ap }));
    for (let i = 0; i < 6 && s.stack.length; i++) s = passAll(s);
    expect(s.players[opp]!.hand.length).toBe(hand + 4);
  });
});

describe("splice onto Arcane", () => {
  it("parses", () => supported(might, ray, visit, everdream));

  it("Kodama's Might with Glacial Ray spliced: both effects, the ray stays in hand, and a pro-red creature can be its target", () => {
    const { s: s0, ap, ids, opp } = setup([might, ray]);
    const mine = putOnBattlefield(s0, ap, bear()), warded = putOnBattlefield(s0, opp, proRed);
    expect(spliceCandidates(s0, ap, ids[0]!)).toEqual([ids[1]]);
    // Glacial Ray alone can't target it: it's red.
    expect(castProblem(s0, ap, ids[1]!, [target(warded)])).not.toBeNull();
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(mine), target(warded)], undefined, "auto", undefined, { splice: [ids[1]!] }));
    expect(s.players[ap]!.hand).toContain(ids[1]);
    s = passAll(s);
    expect(s.battlefield).not.toContain(warded); // 2 damage from a green spell
    expect(s.objects[mine]!.damage).toBe(0);
    expect(s.players[ap]!.hand).toContain(ids[1]);
    expect(s.players[ap]!.graveyard).toContain(ids[0]);
  });

  it("the splice cost is paid too, and only onto a spell it fits, once", () => {
    const { s, ap, ids } = setup([might, ray, shock, everdream]);
    const mine = putOnBattlefield(s, ap, bear());
    expect(total(spellCost(s, ap, s.objects[ids[0]!]!))).toBe(1);
    expect(total(spellCost(s, ap, s.objects[ids[0]!]!, 0, [], { splice: [ids[1]!] }))).toBe(3); // {G} plus {1}{R}
    expect(castProblem(s, ap, ids[2]!, [{ kind: "player", id: s.turnOrder[1]! }], undefined, undefined, undefined, undefined, { splice: [ids[1]!] })).toMatch(/can't be spliced/);
    expect(castProblem(s, ap, ids[0]!, [target(mine), target(mine), target(mine)], undefined, undefined, undefined, undefined, { splice: [ids[1]!, ids[1]!] })).toMatch(/only once/);
    // Everdream: onto any instant or sorcery.
    expect(spliceCandidates(s, ap, ids[2]!)).toEqual([ids[3]]);
    const hand = s.players[ap]!.hand.length;
    const after = passAll(run(s, planCast(s, ap, ids[2]!, [{ kind: "player", id: s.turnOrder[1]! }], undefined, "auto", undefined, { splice: [ids[3]!] })));
    expect(after.players[ap]!.hand.length).toBe(hand - 1 + 1); // Shock left, Everdream's draw came in
  });

  it("a bot splices Spiritual Visit onto its Arcane spell", () => {
    const { s, ap, ids, opp } = setup([ray, visit]);
    s.players[ap]!.hand = [...ids];
    s.players[ap]!.command = [];
    putOnBattlefield(s, opp, bear());
    const castRay = botActions(s, ap).find((a) => a.type === "castSpell" && a.objectId === ids[0]);
    expect(castRay?.type === "castSpell" && castRay.splice).toEqual([ids[1]]);
  });
});
