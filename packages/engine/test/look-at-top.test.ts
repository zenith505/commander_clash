// "You may look at the top card of your library any time" (Vizier of the Menagerie), more permissions to play the top
// card (Sigarda, Realmwalker, Johann's "once each turn", conditional ones: coven, Verge Rangers, Summoning Materia), Mystic
// Forge's "exile the top card of your library", and the coven and "an opponent controls more lands than you" conditions.

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, forest, passUntil, putOnBattlefield, setup } from "./helpers";
import { castProblem, isFullySupported, objHasKeyword, legalActions, planCast, topPlayable, topRevealed, topVisible, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Put a fresh copy of `def` on top of `pid`'s library. */
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
};

// Real oracle text (Scryfall).
const chorus = card("Elven Chorus", "Enchantment", "{3}{G}", { oracleText: 'You may look at the top card of your library any time.\nYou may cast creature spells from the top of your library.\nCreatures you control have "{T}: Add one mana of any color."' });
const johann = card("Johann, Apprentice Sorcerer", "Legendary Creature — Human Wizard Sorcerer", "{2}{U}{R}", { power: "2", toughness: "5", oracleText: "You may look at the top card of your library any time.\nOnce each turn, you may cast an instant or sorcery spell from the top of your library. (You still pay its costs. Timing rules still apply.)" });
const sigarda = card("Sigarda, Font of Blessings", "Legendary Creature — Angel", "{2}{G}{W}", { power: "4", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nOther permanents you control have hexproof.\nYou may look at the top card of your library any time.\nYou may cast Angel spells and Human spells from the top of your library." });
const realmwalker = card("Realmwalker", "Creature — Shapeshifter", "{2}{G}", { power: "2", toughness: "3", keywords: ["Changeling"], oracleText: "Changeling (This card is every creature type.)\nAs this creature enters, choose a creature type.\nYou may look at the top card of your library any time.\nYou may cast creature spells of the chosen type from the top of your library." });
const augur = card("Augur of Autumn", "Creature — Human Druid", "{1}{G}{G}", { power: "2", toughness: "3", keywords: ["Coven"], oracleText: "You may look at the top card of your library any time.\nYou may play lands from the top of your library.\nCoven — As long as you control three or more creatures with different powers, you may cast creature spells from the top of your library." });
const rangers = card("Verge Rangers", "Creature — Human Scout Ranger", "{2}{W}", { power: "3", toughness: "3", keywords: ["First strike"], oracleText: "First strike\nYou may look at the top card of your library any time.\nAs long as an opponent controls more lands than you, you may play lands from the top of your library. (You can play a land this way only if you have an available land play remaining.)" });
const materia = card("Summoning Materia", "Artifact — Equipment", "{2}{G}", { keywords: ["Equip"], oracleText: 'You may look at the top card of your library any time.\nAs long as this Equipment is attached to a creature, you may cast creature spells from the top of your library.\nEquipped creature gets +2/+2 and has vigilance and "{T}: Add {G}."\nEquip {2}' });
const forge = card("Mystic Forge", "Artifact", "{4}", { oracleText: "You may look at the top card of your library any time.\nYou may cast artifact spells and colorless spells from the top of your library.\n{T}, Pay 1 life: Exile the top card of your library." });
const radha = card("Radha, Heart of Keld", "Legendary Creature — Elf Warrior", "{1}{R}{G}", { power: "3", toughness: "3", oracleText: "During your turn, Radha has first strike.\nYou may look at the top card of your library any time, and you may play lands from the top of your library.\n{4}{R}{G}: Radha gets +X/+X until end of turn, where X is the number of lands you control." });
const whale = card("The Lunar Whale", "Legendary Artifact — Vehicle", "{3}{U}", { power: "3", toughness: "5", keywords: ["Flying", "Crew"], oracleText: "Flying\nYou may look at the top card of your library any time.\nAs long as The Lunar Whale attacked this turn, you may play the top card of your library.\nCrew 1" });
const witch = card("Candlegrove Witch", "Creature — Human Warlock", "{1}{W}", { power: "2", toughness: "2", keywords: ["Coven"], oracleText: "Coven — At the beginning of combat on your turn, if you control three or more creatures with different powers, this creature gains flying until end of turn." });
const estates = card("Gift of Estates", "Sorcery", "{1}{W}", { oracleText: "If an opponent controls more lands than you, search your library for up to three Plains cards, reveal them, put them into your hand, then shuffle." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const human = card("Human Test", "Creature — Human Soldier", "{W}", { power: "1", toughness: "1" });
const elf = card("Elf Test", "Creature — Elf", "{G}", { power: "1", toughness: "1" });
const ornithopter = card("Ornithopter", "Artifact Creature — Thopter", "{0}", { power: "0", toughness: "2", keywords: ["Flying"], oracleText: "Flying" });

describe("looking at the top card any time", () => {
  it("only its controller sees the top card, and nobody else (rulings on Vizier of the Menagerie)", () => {
    supported(chorus, johann, sigarda, realmwalker, augur, rangers, materia, forge, radha, whale, witch, estates);
    const { s, ap, opp } = setup([]);
    expect(topVisible(s, ap, ap)).toBe(false);
    putOnBattlefield(s, ap, chorus);
    expect(topVisible(s, ap, ap)).toBe(true);
    expect(topVisible(s, ap, opp)).toBe(false);
    expect(topRevealed(s, ap)).toBe(false);
    expect(topVisible(s, opp, opp)).toBe(false);
    // Elven Chorus casts creature spells from the top.
    const b = onTop(s, ap, bear());
    expect(topPlayable(s, ap)).toEqual([b]);
  });

  it("Radha: the same line also lets you play lands from the top", () => {
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, radha);
    const land = onTop(s, ap, forest);
    expect(topVisible(s, ap, ap)).toBe(true);
    expect(legalActions(s, ap).some((a) => a.type === "playLand" && a.objectId === land)).toBe(true);
  });
});

describe("playing the top card", () => {
  it("Johann: one instant or sorcery from the top each turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const j = putOnBattlefield(s0, ap, johann);
    const first = onTop(s0, ap, shock);
    const b = onTop(s0, ap, bear());
    expect(topPlayable(s0, ap)).toEqual([]); // a creature isn't an instant or sorcery
    s0.players[ap]!.library.shift();
    s0.players[ap]!.library.push(b);
    expect(topPlayable(s0, ap)).toEqual([first]);
    let s = settle(planCast(s0, ap, first, [{ kind: "player", id: opp }])!.reduce((x, a) => act(x, a), s0));
    expect(s.players[opp]!.life).toBe(38);
    expect(s.objects[j]!.topUsedTurn).toBe(s.turn);
    const second = onTop(s, ap, shock);
    expect(castProblem(s, ap, second, [{ kind: "player", id: opp }])).toBeTruthy();
    // Each turn, any player's: on the next player's turn, as an instant.
    s = passUntil(s, "upkeep", opp);
    expect(topPlayable(s, ap)).toEqual([second]);
  });

  it("Sigarda: Angel spells and Human spells; Realmwalker: creature spells of the chosen type", () => {
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, sigarda);
    const h = onTop(s, ap, human);
    expect(topPlayable(s, ap)).toEqual([h]);
    s.players[ap]!.library.shift();
    onTop(s, ap, elf);
    expect(topPlayable(s, ap)).toEqual([]);
    const { s: s1, ap: ap1 } = setup([]);
    const r = putOnBattlefield(s1, ap1, realmwalker);
    const e = onTop(s1, ap1, elf);
    expect(topPlayable(s1, ap1)).toEqual([]); // no type chosen
    s1.objects[r]!.chosen = { type: "Elf" };
    expect(topPlayable(s1, ap1)).toEqual([e]);
    s1.objects[r]!.chosen = { type: "Human" };
    expect(topPlayable(s1, ap1)).toEqual([]);
  });

  it("Augur of Autumn: lands always, creature spells only with coven", () => {
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, augur); // power 2
    const land = onTop(s, ap, forest);
    expect(topPlayable(s, ap)).toEqual([land]);
    s.players[ap]!.library.shift();
    const b = onTop(s, ap, bear());
    expect(topPlayable(s, ap)).toEqual([]);
    putOnBattlefield(s, ap, human); // power 1
    putOnBattlefield(s, ap, bear()); // power 2 again: still two different powers
    expect(topPlayable(s, ap)).toEqual([]);
    putOnBattlefield(s, ap, card("Big Test", "Creature — Giant", "{3}", { power: "3", toughness: "3" }));
    expect(topPlayable(s, ap)).toEqual([b]);
  });

  it("Verge Rangers: lands from the top while an opponent controls more lands than you", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, rangers);
    const land = onTop(s, ap, forest);
    expect(topPlayable(s, ap)).toEqual([]);
    for (let i = 0; i < 15; i++) putOnBattlefield(s, opp, forest);
    expect(topPlayable(s, ap)).toEqual([land]);
  });

  it("Summoning Materia: only while attached to a creature", () => {
    const { s, ap } = setup([]);
    const m = putOnBattlefield(s, ap, materia);
    const b = onTop(s, ap, bear());
    expect(topPlayable(s, ap)).toEqual([]);
    const c = putOnBattlefield(s, ap, human);
    s.objects[m]!.attachedTo = c;
    expect(topPlayable(s, ap)).toEqual([b]);
  });

  it("The Lunar Whale: the top card once it has attacked this turn", () => {
    const { s, ap } = setup([]);
    const w = putOnBattlefield(s, ap, whale);
    const land = onTop(s, ap, forest);
    expect(topPlayable(s, ap)).toEqual([]);
    s.objects[w]!.attacked = { turn: s.turn, n: 1 };
    expect(topPlayable(s, ap)).toEqual([land]);
  });

  it("Mystic Forge: artifact and colorless spells from the top; its ability exiles the top card", () => {
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, forge);
    const o = onTop(s0, ap, ornithopter);
    expect(topPlayable(s0, ap)).toEqual([o]);
    s0.players[ap]!.library.shift();
    const b = onTop(s0, ap, bear());
    expect(topPlayable(s0, ap)).toEqual([]);
    const life = s0.players[ap]!.life;
    const s = settle(activate(s0, ap, f, 0));
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.players[ap]!.life).toBe(life - 1);
  });
});

describe("coven and 'more lands than you'", () => {
  it("Candlegrove Witch gains flying at the beginning of combat only with three different powers", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, witch);
    putOnBattlefield(s0, ap, human);
    let s = settle(passUntil(s0, "beginCombat", ap));
    expect(isFlying(s, w)).toBe(false);
    const { s: s1, ap: ap1 } = setup([]);
    const w1 = putOnBattlefield(s1, ap1, witch);
    putOnBattlefield(s1, ap1, human);
    putOnBattlefield(s1, ap1, card("Big Test", "Creature — Giant", "{3}", { power: "3", toughness: "3" }));
    s = settle(passUntil(s1, "beginCombat", ap1));
    expect(isFlying(s, w1)).toBe(true);
  });
});

const isFlying = (s: GameState, id: string) => objHasKeyword(s, s.objects[id]!, "Flying");
