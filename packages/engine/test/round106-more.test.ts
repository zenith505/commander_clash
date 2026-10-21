// Round 106, more popular cards: Illusionist's Bracers (copy an ability of the equipped creature), Druid Class (a land
// whose granted ability sets its power and toughness), Parting Gust (an exile, or with no gift a blink with a counter),
// Grenzo, Havoc Raiser ("you may spend mana as though it were mana of any color"), Open the Way ("X can't be greater
// than the number of players"; "until you reveal X land cards"), Lively Dirge ("total mana value 4 or less").

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, forest, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { castProblem, characteristics, isFullySupported, objHasKeyword, planActivate, planCast, power, toughness, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const bracers = card("Illusionist's Bracers", "Artifact — Equipment", "{2}", { oracleText: "Whenever an ability of equipped creature is activated, if it isn't a mana ability, copy that ability. You may choose new targets for the copy.\nEquip {3}" });
const druid = card("Druid Class", "Enchantment — Class", "{1}{G}", { oracleText: "(Gain the next level as a sorcery to add its ability.)\nLandfall — Whenever a land you control enters, you gain 1 life.\n{2}{G}: Level 2\nYou may play an additional land on each of your turns.\n{4}{G}: Level 3\nWhen this Class becomes level 3, target land you control becomes a creature with haste and \"This creature's power and toughness are each equal to the number of lands you control.\" It's still a land." });
const gust = card("Parting Gust", "Instant", "{W}{W}", { keywords: ["Gift"], oracleText: "Gift a tapped Fish (You may promise an opponent a gift as you cast this spell. If you do, they create a tapped 1/1 blue Fish creature token before its other effects.)\nExile target nontoken creature. If the gift wasn't promised, return that card to the battlefield under its owner's control with a +1/+1 counter on it at the beginning of the next end step." });
const grenzo = card("Grenzo, Havoc Raiser", "Legendary Creature — Goblin Rogue", "{R}{R}", { power: "2", toughness: "2", oracleText: "Whenever a creature you control deals combat damage to a player, choose one —\n• Goad target creature that player controls.\n• Exile the top card of that player's library. Until end of turn, you may cast that card and you may spend mana as though it were mana of any color to cast that spell." });
const openWay = card("Open the Way", "Sorcery", "{X}{G}{G}", { oracleText: "X can't be greater than the number of players in the game.\nReveal cards from the top of your library until you reveal X land cards. Put those land cards onto the battlefield tapped and the rest on the bottom of your library in a random order." });
const dirge = card("Lively Dirge", "Sorcery", "{1}{B}", { keywords: ["Spree"], oracleText: "Spree (Choose one or more additional costs.)\n+ {1} — Search your library for a card, put it into your graveyard, then shuffle.\n+ {2} — Return up to two creature cards with total mana value 4 or less from your graveyard to the battlefield." });

// Test cards.
const pinger = card("Test Pinger", "Creature — Human Wizard", "{1}{R}", { power: "1", toughness: "1", oracleText: "{T}: This creature deals 1 damage to any target." });
const blueSpell = card("Test Insight", "Sorcery", "{U}{U}", { oracleText: "Draw a card." });

const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  if (!plan) throw new Error("can't cast");
  for (const a of plan) s = act(s, a);
  return settle(s);
};
const toYard = (s: GameState, pid: PlayerId, d: CardDef) => {
  const id = putOnBattlefield(s, pid, d);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
};
const onTop = (s: GameState, pid: PlayerId, d: CardDef) => {
  const id = toYard(s, pid, d);
  s.players[pid]!.graveyard.pop();
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
};
const lands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land"));

describe("round 106: more popular cards", () => {
  it("parse", () => [bracers, druid, gust, grenzo, openWay, dirge].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Illusionist's Bracers: an ability of the equipped creature is copied; not another creature's", () => {
    const { s: s0, ap, opp } = setup([]);
    const p = putOnBattlefield(s0, ap, pinger);
    const other = putOnBattlefield(s0, ap, pinger);
    const b = putOnBattlefield(s0, ap, bracers);
    s0.objects[b]!.attachedTo = p;
    const life = s0.players[opp]!.life;
    let s = activate(s0, ap, p, 0, [{ kind: "player", id: opp }]);
    if (s.pending?.kind === "copyTargets") s = act(s, { type: "copyTargets", player: ap, targets: [{ kind: "player", id: opp }] } as never);
    s = settle(s);
    expect(s.players[opp]!.life).toBe(life - 2);
    s = settle(activate(s, ap, other, 0, [{ kind: "player", id: opp }]));
    expect(s.players[opp]!.life).toBe(life - 3);
  });

  it("Druid Class: at level 3 the target land is a creature as big as your land count, with haste, still a land", () => {
    const { s: s0, ap } = setup([]);
    const d = putOnBattlefield(s0, ap, druid);
    s0.objects[d]!.classLevel = 2;
    const land = lands(s0, ap)[0]!;
    const n = lands(s0, ap).length;
    let s = activate(s0, ap, d, 1);
    // The level 3 trigger: target land you control.
    expect(s.pending?.kind).toBe("chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(land)] }));
    expect(s.objects[d]!.classLevel).toBe(3);
    const animated = land;
    expect(characteristics(s, s.objects[land]!).types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    expect(objHasKeyword(s, s.objects[land]!, "Haste")).toBe(true);
    expect(power(s, s.objects[animated]!)).toBe(n);
    expect(toughness(s, s.objects[animated]!)).toBe(n);
    // It grows with your lands.
    putOnBattlefield(s, ap, forest);
    expect(power(s, s.objects[animated]!)).toBe(n + 1);
  });

  it("Parting Gust: without the gift, the creature comes back at the next end step with a +1/+1 counter", () => {
    const { s: s0, ap, opp, ids } = setup([gust]);
    const victim = putOnBattlefield(s0, opp, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(victim)]));
    expect(s.objects[victim]!.zone).toBe("exile");
    s = settle(passUntil(s, "end", ap));
    s = settle(s);
    const back = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Grizzly Bears" && s.objects[id]!.owner === opp);
    expect(back).toBeDefined();
    expect(s.objects[back!]!.counters["+1/+1"]).toBe(1);
  });

  it("Parting Gust: with the gift promised, the opponent gets a tapped Fish and the creature stays exiled", () => {
    const { s: s0, ap, opp, ids } = setup([gust]);
    const victim = putOnBattlefield(s0, opp, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(victim)], undefined, "auto", undefined, { gift: opp }));
    const fish = s.battlefield.find((id) => s.objects[id]!.isToken && s.objects[id]!.controller === opp);
    expect(fish).toBeDefined();
    expect(s.objects[fish!]!.tapped).toBe(true);
    s = settle(passUntil(s, "end", ap));
    expect(s.objects[victim]!.zone).toBe("exile");
    expect(s.battlefield.some((id) => s.cards[s.objects[id]!.cardId]!.name === "Grizzly Bears" && s.objects[id]!.owner === opp)).toBe(false);
  });

  it("Grenzo: the exiled card can be cast with mana of any color this turn", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, grenzo);
    putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    const attacker = putOnBattlefield(s0, ap, bear({ name: "Attacker" }));
    const top = onTop(s0, opp, blueSpell);
    // Only red mana: the Islands are tapped.
    for (const id of lands(s0, ap)) if (s0.cards[s0.objects[id]!.cardId]!.subtypes.includes("Island")) s0.objects[id]!.tapped = true;
    let s = s0;
    while (s.pending?.kind !== "declareAttackers") s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker, defender: opp }] });
    for (let i = 0; i < 60 && s.pending?.kind !== "chooseModes"; i++) s = s.pending?.kind === "declareBlockers" ? act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] }) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("chooseModes");
    s = settle(act(s, { type: "chooseModes", player: ap, modes: [1] }));
    expect(s.objects[top]!.zone).toBe("exile");
    s = passUntil(s, "main2", ap);
    // {U}{U} with no blue mana: paid with any color (CR 609.4b).
    s = run(s, planCast(s, ap, top));
    expect(s.objects[top]!.zone).toBe("graveyard");
  });

  it("Open the Way: X is at most the number of players; X land cards go onto the battlefield tapped", () => {
    const { s: s0, ap, ids } = setup([openWay]);
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, 5)).toMatch(/number of players/);
    expect(planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 5)).toBeNull();
    expect(planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 4)).not.toBeNull();
    const before = lands(s0, ap).length;
    const lib = s0.players[ap]!.library.length;
    const s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 2));
    const now = lands(s, ap);
    expect(now.length).toBe(before + 2);
    expect(now.filter((id) => s.objects[id]!.tapped).length).toBeGreaterThanOrEqual(2);
    expect(s.players[ap]!.library.length).toBe(lib - 2);
  });

  it("Lively Dirge: both modes; the cards returned have total mana value 4 or less", () => {
    const { s: s0, ap, ids } = setup([dirge]);
    const three = toYard(s0, ap, card("Three Drop", "Creature — Ox", "{2}{B}", { power: "3", toughness: "3" }));
    const two = toYard(s0, ap, card("Two Drop", "Creature — Rat", "{1}{B}", { power: "2", toughness: "2" }));
    const one = toYard(s0, ap, card("One Drop", "Creature — Rat", "{B}", { power: "1", toughness: "1" }));
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, [1]));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", totalMv: 4 });
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [three, two] })).toThrow(/total mana value 4/);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [three, one] }));
    expect(s.objects[three]!.zone).toBe("battlefield");
    expect(s.objects[one]!.zone).toBe("battlefield");
    expect(s.objects[two]!.zone).toBe("graveyard");
  });

  it("Lively Dirge: casting it needs a mode's cost; the first mode puts a card into the graveyard", () => {
    const { s: s0, ap, ids } = setup([dirge]);
    expect(castProblem(s0, ap, ids[0]!, undefined, [])).not.toBeNull();
    const yard = s0.players[ap]!.graveyard.length;
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, [0]));
    if (s.pending?.kind === "searchLibrary") s = settle(act(s, { type: "searchLibrary", player: ap, found: [s.pending.cards[0]!] }));
    expect(s.players[ap]!.graveyard.length).toBe(yard + 2); // the card found, and Lively Dirge
  });

  it("Bracers' ability isn't copied once the equipped creature has left (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const p = putOnBattlefield(s0, ap, card("Test Sacrificer", "Creature — Human", "{1}", { power: "1", toughness: "1", oracleText: "Sacrifice this creature: You gain 3 life." }));
    const b = putOnBattlefield(s0, ap, bracers);
    s0.objects[b]!.attachedTo = p;
    const life = s0.players[ap]!.life;
    const plan = planActivate(s0, ap, p, 0);
    let s = s0;
    for (const a of plan!) s = act(s, a);
    s = settle(s);
    expect(s.players[ap]!.life).toBe(life + 3);
  });
});
