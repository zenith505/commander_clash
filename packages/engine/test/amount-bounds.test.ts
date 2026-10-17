// "With mana value less than or equal to the number of Plains you control", "with power less than or equal to this
// creature's power" (TargetSpec.bound): for a target, the amount is worked out as the target is chosen and again as it
// resolves (CR 601.2c, 608.2b; rulings on Beguiler of Wills and Earthshaker Khenra), with the source's last known power if
// it has left (608.2h; rulings on Fiendish Panda). For a group, a search or a free cast it's counted as it resolves. "If its
// mana value is less than or equal to ..." doesn't restrict the target: it's compared as it resolves (rulings on Ghastly
// Demise and Prismatic Ending).

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, island, passAll, plainsCard, putOnBattlefield, setup, target } from "./helpers";
import { applyAction, controllerOf, isFullySupported, planActivate, planCast, waitingOn, type CardDef, type GameState, type TargetChoice } from "../src";
import { moveObject } from "../src/game";
import { nextRandom } from "../src/rng";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Casts without letting it resolve, so the game can change before it does. */
const castOnly = (s: GameState, pid: number, id: string, targets: TargetChoice[]) => {
  for (const a of planCast(s, pid, id, targets)!) s = act(s, a);
  return s;
};
/** The next dice rolled come up `values`, in order (the game's seeded random numbers, CR 706.1b). */
function rig(s: GameState, sides: number, values: number[]) {
  for (let st = 1; st < 50_000_000; st++) {
    const t = { rngState: st };
    if (values.every((v) => 1 + Math.floor(nextRandom(t) * sides) === v)) {
      s.rngState = st;
      return;
    }
  }
  throw new Error("no such seed");
}
const inGraveyard = (s: GameState, pid: number, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  moveObject(s, id, "graveyard");
  return id;
};

// Real oracle text (Scryfall).
const layDownArms = card("Lay Down Arms", "Sorcery", "{W}", { oracleText: "Exile target creature with mana value less than or equal to the number of Plains you control. Its controller gains 3 life." });
const beguiler = card("Beguiler of Wills", "Creature — Human Wizard", "{3}{U}{U}", { power: "1", toughness: "1", oracleText: "{T}: Gain control of target creature with power less than or equal to the number of creatures you control." });
const panda = card("Fiendish Panda", "Creature — Bear Demon", "{2}{W}{B}", { power: "3", toughness: "2", oracleText: "Whenever you gain life, put a +1/+1 counter on this creature.\nWhen this creature dies, return another target non-Bear creature card with mana value less than or equal to this creature's power from your graveyard to the battlefield." });
const valiant = card("Valiant Endeavor", "Sorcery", "{4}{W}{W}", { oracleText: "Roll two d6 and choose one result. Destroy each creature with power greater than or equal to that result. Then create a number of 2/2 white Knight creature tokens with vigilance equal to the other result." });
const arcane = card("Arcane Endeavor", "Sorcery", "{5}{U}{U}", { oracleText: "Roll two d8 and choose one result. Draw cards equal to that result. Then you may cast an instant or sorcery spell with mana value less than or equal to the other result from your hand without paying its mana cost." });
const beseech = card("Beseech the Queen", "Sorcery", "{2/B}{2/B}{2/B}", { oracleText: "({2/B} can be paid with any two mana or with {B}. This card's mana value is 6.)\nSearch your library for a card with mana value less than or equal to the number of lands you control, reveal it, put it into your hand, then shuffle." });
const ghastly = card("Ghastly Demise", "Instant", "{B}", { oracleText: "Destroy target nonblack creature if its toughness is less than or equal to the number of cards in your graveyard." });
const prismatic = card("Prismatic Ending", "Sorcery", "{X}{W}", { keywords: ["Converge"], oracleText: "Converge — Exile target nonland permanent if its mana value is less than or equal to the number of colors of mana spent to cast this spell." });
const dispersal = card("Dispersal Shield", "Instant", "{1}{U}", { oracleText: "Counter target spell if its mana value is less than or equal to the greatest mana value among permanents you control." });
const engulf = card("Engulf the Shore", "Instant", "{3}{U}", { oracleText: "Return to their owners' hands all creatures with toughness less than or equal to the number of Islands you control." });
const aisha = card("Aisha of Sparks and Smoke", "Legendary Creature — Human Warrior", "{1}{R}{R}", { power: "4", toughness: "2", keywords: ["Prowess"], oracleText: "Prowess (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)\n{R/W}: Aisha of Sparks and Smoke gains first strike until end of turn.\nWhenever Aisha deals combat damage, you may cast a sorcery spell from your hand with mana value less than or equal to that damage without paying its mana cost." });
const covert = card("Covert Technician", "Artifact Creature — Human Ninja", "{2}{U}", { power: "2", toughness: "4", keywords: ["Ninjutsu"], oracleText: "Ninjutsu {1}{U} ({1}{U}, Return an unblocked attacker you control to hand: Put this card onto the battlefield from your hand tapped and attacking.)\nWhenever this creature deals combat damage to a player, you may put an artifact card with mana value less than or equal to that damage from your hand onto the battlefield." });
const squirming = card("Squirming Emergence", "Sorcery", "{1}{B}{G}", { keywords: ["Fathomless descent"], oracleText: "Fathomless descent — Return to the battlefield target nonland permanent card in your graveyard with mana value less than or equal to the number of permanent cards in your graveyard." });
const khenra = card("Earthshaker Khenra", "Creature — Jackal Warrior", "{1}{R}", { power: "2", toughness: "1", keywords: ["Haste", "Eternalize"], oracleText: "Haste\nWhen this creature enters, target creature with power less than or equal to this creature's power can't block this turn.\nEternalize {4}{R}{R} ({4}{R}{R}, Exile this card from your graveyard: Create a token that's a copy of it, except it's a 4/4 black Zombie Jackal Warrior with no mana cost. Eternalize only as a sorcery.)" });
const occultist = card("Agadeem Occultist", "Creature — Human Shaman Ally", "{2}{B}", { power: "0", toughness: "2", oracleText: "{T}: Put target creature card from an opponent's graveyard onto the battlefield under your control if its mana value is less than or equal to the number of Allies you control." });
const minn = card("Minn, Wily Illusionist", "Legendary Creature — Gnome Wizard", "{1}{U}{U}", { power: "1", toughness: "3", oracleText: 'Whenever you draw your second card each turn, create a 1/1 blue Illusion creature token with "This token gets +1/+0 for each other Illusion you control."\nWhenever an Illusion you control dies, you may put a permanent card with mana value less than or equal to that creature\'s power from your hand onto the battlefield.' });

const ogre = (extra: Partial<CardDef> = {}) => card(extra.name ?? "Test Ogre", "Creature — Ogre", "{3}{R}", { power: "4", toughness: "4", ...extra });
const giant = card("Test Giant", "Creature — Giant", "{5}{R}", { power: "6", toughness: "6" });

describe("amount bounds", () => {
  it("parse", () => {
    supported(layDownArms, beguiler, panda, valiant, arcane, beseech, ghastly, prismatic, dispersal, engulf, aisha, covert, squirming, khenra, occultist, minn);
  });

  it("Lay Down Arms: only a creature with mana value up to your Plains count can be targeted, and it's checked again as it resolves", () => {
    const { s: s0, ap, ids, opp } = setup([layDownArms]); // three Plains
    const small = putOnBattlefield(s0, opp, bear());
    const big = putOnBattlefield(s0, opp, ogre());
    expect(planCast(s0, ap, ids[0]!, [target(big)])).toBeNull();
    const life = s0.players[opp]!.life;
    const s = cast(s0, ap, ids[0]!, [target(small)]);
    expect(s.objects[small]!.zone).toBe("exile");
    expect(s.players[opp]!.life).toBe(life + 3);
  });

  it("Lay Down Arms: with Plains gone before it resolves, the target is illegal and nothing happens (CR 608.2b)", () => {
    const { s: s0, ap, ids, opp } = setup([layDownArms]);
    putOnBattlefield(s0, ap, plainsCard); // four Plains
    const four = putOnBattlefield(s0, opp, ogre());
    let s = castOnly(s0, ap, ids[0]!, [target(four)]);
    // Two Plains leave in response (untapped ones; the spell's own mana is paid).
    const plains = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Plains" && !s.objects[id]!.tapped).slice(0, 2);
    for (const id of plains) moveObject(s, id, "graveyard");
    const life = s.players[opp]!.life;
    s = passAll(s);
    expect(s.objects[four]!.zone).toBe("battlefield");
    expect(s.players[opp]!.life).toBe(life);
  });

  it("Beguiler of Wills: power up to the number of creatures you control", () => {
    const { s: s0, ap, opp } = setup([]);
    const me = putOnBattlefield(s0, ap, beguiler);
    putOnBattlefield(s0, ap, bear());
    const two = putOnBattlefield(s0, opp, bear());
    const four = putOnBattlefield(s0, opp, ogre());
    expect(() => activate(structuredClone(s0), ap, me, 0, [target(four)])).toThrow();
    const s = activate(s0, ap, me, 0, [target(two)]);
    expect(controllerOf(s, s.objects[two]!)).toBe(ap);
  });

  it("Fiendish Panda: its power as it last existed decides which card it can return (CR 608.2h)", () => {
    const { s: s0, ap } = setup([]);
    const me = putOnBattlefield(s0, ap, panda);
    s0.objects[me]!.counters["+1/+1"] = 1; // 4/3
    const four = inGraveyard(s0, ap, ogre());
    const six = inGraveyard(s0, ap, giant);
    const aBear = inGraveyard(s0, ap, bear());
    moveObject(s0, me, "graveyard");
    let s = settle(passAll(s0));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    expect(() => applyAction(s, { type: "chooseTargets", player: ap, targets: [target(six)] })).toThrow();
    expect(() => applyAction(s, { type: "chooseTargets", player: ap, targets: [target(aBear)] })).toThrow(); // non-Bear
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(four)] }));
    expect(s.objects[four]!.zone).toBe("battlefield");
  });

  it("Earthshaker Khenra: power up to its own as it enters", () => {
    const { s: s0, ap, ids, opp } = setup([khenra]);
    const two = putOnBattlefield(s0, opp, bear());
    const four = putOnBattlefield(s0, opp, ogre());
    let s = settle(cast(s0, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    expect(() => applyAction(s, { type: "chooseTargets", player: ap, targets: [target(four)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(two)] }));
    expect(s.stack).toHaveLength(0);
  });

  it("Valiant Endeavor: destroys each creature with power at least the result chosen", () => {
    const { s: s0, ap, ids, opp } = setup([valiant]);
    const two = putOnBattlefield(s0, opp, bear());
    const four = putOnBattlefield(s0, opp, ogre());
    rig(s0, 6, [3, 5]);
    let s = cast(s0, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "rollResult" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "0" }));
    expect(s.objects[four]!.zone).toBe("graveyard");
    expect(s.objects[two]!.zone).toBe("battlefield");
    const knights = s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap);
    expect(knights).toHaveLength(5);
  });

  it("Arcane Endeavor: a free instant or sorcery with mana value up to the other result", () => {
    const { s: s0, ap, ids, opp } = setup([arcane, beseech, layDownArms]);
    putOnBattlefield(s0, opp, bear()); // something for Lay Down Arms to target
    rig(s0, 8, [2, 1]);
    let s = cast(s0, ap, ids[0]!);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "0" })); // draw 2, mana value up to 1
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromHand" });
    const options = (s.pending as { options: string[] }).options;
    expect(options).toContain(ids[2]);
    expect(options).not.toContain(ids[1]); // Beseech the Queen's mana value is 6
  });

  it("Beseech the Queen: a card with mana value up to the number of lands you control", () => {
    const { s: s0, ap, ids } = setup([beseech]);
    const big = putOnBattlefield(s0, ap, card("Test Colossus", "Creature — Giant", "{15}", { power: "15", toughness: "15" }));
    moveObject(s0, big, "library");
    s0.players[ap]!.library.unshift(big);
    const s = cast(s0, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const cards = (s.pending as { cards: string[] }).cards;
    expect(cards.length).toBeGreaterThan(0);
    expect(cards).not.toContain(big); // 14 lands, mana value 15
  });

  it("Ghastly Demise: any nonblack creature can be targeted; it's destroyed only if its toughness is small enough", () => {
    const { s: s0, ap, ids, opp } = setup([ghastly, ghastly]);
    const two = putOnBattlefield(s0, opp, bear());
    const four = putOnBattlefield(s0, opp, ogre());
    for (let i = 0; i < 3; i++) inGraveyard(s0, ap, bear());
    let s = cast(s0, ap, ids[0]!, [target(four)]); // three cards in your graveyard
    expect(s.objects[four]!.zone).toBe("battlefield");
    s = cast(s, ap, ids[1]!, [target(two)]);
    expect(s.objects[two]!.zone).toBe("graveyard");
  });

  it("Prismatic Ending: the colors of mana spent decide", () => {
    const { s: s0, ap, ids, opp } = setup([prismatic, prismatic]);
    const two = putOnBattlefield(s0, opp, bear());
    // X = 0, paid with {W}: one color, mana value 1 or less.
    let s = cast(s0, ap, ids[0]!, [target(two)]);
    expect(s.objects[two]!.zone).toBe("battlefield");
    // X = 1, {W} and another color: two colors.
    const plan = planCast(s, ap, ids[1]!, [target(two)], undefined, undefined, 1);
    expect(plan).not.toBeNull();
    for (const a of plan!) s = act(s, a);
    const colors = s.objects[ids[1]!]!.colorsSpent?.length ?? 0;
    s = passAll(s);
    expect(colors).toBeGreaterThan(0);
    expect(s.objects[two]!.zone).toBe(colors >= 2 ? "exile" : "battlefield");
  });

  it("Dispersal Shield: counters a spell with mana value up to the greatest among your permanents", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, ogre()); // mana value 4
    const shield = putOnBattlefield(s0, opp, dispersal);
    moveObject(s0, shield, "hand");
    s0.players[opp]!.hand.push(shield);
    for (const l of [island, island]) putOnBattlefield(s0, opp, l);
    const spell = putOnBattlefield(s0, ap, layDownArms);
    moveObject(s0, spell, "hand");
    s0.players[ap]!.hand.push(spell);
    const victim = putOnBattlefield(s0, opp, bear());
    let s = castOnly(s0, ap, spell, [target(victim)]);
    expect(s.stack).toHaveLength(1);
    s = act(s, { type: "passPriority", player: ap });
    const plan = planCast(s, opp, shield, [{ kind: "stack", id: s.stack[0]!.id } as never]);
    expect(plan).not.toBeNull();
    for (const a of plan!) s = act(s, a);
    s = settle(s);
    expect(s.objects[spell]!.zone).toBe("graveyard");
    expect(s.objects[victim]!.zone).toBe("battlefield");
  });

  it("Engulf the Shore: creatures with toughness up to your Islands return to hand", () => {
    const { s: s0, ap, ids, opp } = setup([engulf]); // three Islands
    const two = putOnBattlefield(s0, opp, bear());
    const four = putOnBattlefield(s0, opp, ogre());
    const s = cast(s0, ap, ids[0]!);
    expect(s.objects[two]!.zone).toBe("hand");
    expect(s.objects[four]!.zone).toBe("battlefield");
  });

  it("Squirming Emergence: a nonland permanent card with mana value up to your permanent cards in the graveyard", () => {
    const { s: s0, ap, ids } = setup([squirming]);
    const two = inGraveyard(s0, ap, bear());
    const four = inGraveyard(s0, ap, ogre());
    expect(planCast(s0, ap, ids[0]!, [target(four)])).toBeNull(); // two permanent cards
    const s = cast(s0, ap, ids[0]!, [target(two)]);
    expect(s.objects[two]!.zone).toBe("battlefield");
  });

  it("Agadeem Occultist: compares as it resolves, counting your Allies", () => {
    const { s: s0, ap, opp } = setup([]);
    const me = putOnBattlefield(s0, ap, occultist); // one Ally
    const two = inGraveyard(s0, opp, bear());
    let s = activate(s0, ap, me, 0, [target(two)]);
    expect(s.objects[two]!.zone).toBe("graveyard");
    putOnBattlefield(s, ap, card("Test Ally", "Creature — Human Ally", "{1}", { power: "1", toughness: "1" }));
    s.objects[me]!.tapped = false;
    s = activate(s, ap, me, 0, [target(two)]);
    expect(s.objects[two]!).toMatchObject({ zone: "battlefield", controller: ap });
  });
});

// "With mana value X or less" for a group, a search or a card put from your hand: the X announced (CR 107.3a) or the X
// the text defines (107.3c), compared as it resolves.
const chord = card("Chord of Calling", "Instant", "{X}{G}{G}{G}", { keywords: ["Convoke"], oracleText: "Convoke (Your creatures can help cast this spell. Each creature you tap while casting this spell pays for {1} or one mana of that creature's color.)\nSearch your library for a creature card with mana value X or less, put it onto the battlefield, then shuffle." });
const deed = card("Pernicious Deed", "Enchantment", "{1}{B}{G}", { oracleText: "{X}, Sacrifice this enchantment: Destroy each artifact, creature, and enchantment with mana value X or less." });
const blackSun = card("Day of Black Sun", "Sorcery", "{X}{B}{B}", { oracleText: "Each creature with mana value X or less loses all abilities until end of turn. Destroy those creatures." });
const sprite = card("Spellstutter Sprite", "Creature — Faerie Wizard", "{1}{U}", { power: "1", toughness: "1", keywords: ["Flash", "Flying"], oracleText: "Flash\nFlying\nWhen this creature enters, counter target spell with mana value X or less, where X is the number of Faeries you control." });
const faerie = card("Test Faerie", "Creature — Faerie", "{U}", { power: "1", toughness: "1" });
const scourge = card("Scourge of Fleets", "Creature — Kraken", "{5}{U}{U}", { power: "6", toughness: "6", oracleText: "When this creature enters, return each creature your opponents control with toughness X or less to its owner's hand, where X is the number of Islands you control." });

describe("with mana value X or less", () => {
  it("parse", () => supported(chord, deed, blackSun, scourge, sprite));

  /** Casts Grizzly Bears, then Spellstutter Sprite in response, and lets the Sprite resolve. */
  const sprited = (faeries: number) => {
    const { s: s0, ap, ids } = setup([bear(), sprite]);
    for (let i = 0; i < faeries; i++) putOnBattlefield(s0, ap, faerie);
    let s = castOnly(s0, ap, ids[0]!, []);
    s = castOnly(s, ap, ids[1]!, []);
    for (let i = 0; i < 4 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return { s, ap, bears: ids[0]!, spell: s.stack.find((it) => it.objectId === ids[0])! };
  };

  it("Spellstutter Sprite: X counts your Faeries as the target is chosen", () => {
    let { s, ap, bears, spell } = sprited(1); // two Faeries with the Sprite: Grizzly Bears can be targeted
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "stack", id: spell.id }] }));
    expect(s.objects[bears]!.zone).toBe("graveyard");
  });

  it("Spellstutter Sprite: with only itself, a 2-mana spell isn't a legal target", () => {
    const { s: s0, bears } = sprited(0);
    expect(s0.pending).toBeFalsy();
    const s = settle(s0);
    expect(s.objects[bears]!.zone).toBe("battlefield");
  });

  it("Spellstutter Sprite: a Faerie leaving before it resolves makes the target illegal (CR 608.2b, rulings)", () => {
    let { s, ap, bears, spell } = sprited(1);
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "stack", id: spell.id }] });
    const other = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Test Faerie")!;
    moveObject(s, other, "graveyard");
    s = settle(s);
    expect(s.objects[bears]!.zone).toBe("battlefield");
  });

  it("Chord of Calling: the search offers only creature cards with mana value up to X", () => {
    const { s: s0, ap, ids } = setup([chord]);
    const lib = s0.players[ap]!.library;
    const big = putOnBattlefield(s0, ap, ogre());
    moveObject(s0, big, "library");
    lib.unshift(big);
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!, [], undefined, undefined, 2)!) s = act(s, a);
    s = passAll(s);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const cards = (s.pending as { cards: string[] }).cards;
    expect(cards.length).toBeGreaterThan(0); // Grizzly Bears
    expect(cards).not.toContain(big); // mana value 4
    expect(cards.every((id) => s.cards[s.objects[id]!.cardId]!.typeLine.includes("Creature"))).toBe(true);
  });

  it("Pernicious Deed: the X paid to activate it", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, ap, deed);
    const two = putOnBattlefield(s0, opp, bear());
    const four = putOnBattlefield(s0, opp, ogre());
    let s = s0;
    for (const a of planActivate(s, ap, d, 0, undefined, undefined, undefined, 3)!) s = act(s, a);
    s = passAll(s);
    expect(s.objects[two]!.zone).toBe("graveyard");
    expect(s.objects[four]!.zone).toBe("battlefield");
  });

  it("Day of Black Sun: those creatures lose their abilities, then are destroyed", () => {
    const { s: s0, ap, ids, opp } = setup([blackSun]);
    const two = putOnBattlefield(s0, opp, bear());
    const four = putOnBattlefield(s0, opp, ogre());
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!, [], undefined, undefined, 2)!) s = act(s, a);
    s = passAll(s);
    expect(s.objects[two]!.zone).toBe("graveyard");
    expect(s.objects[four]!.zone).toBe("battlefield");
  });

  it("Scourge of Fleets: X is the number of Islands you control, counted as it resolves", () => {
    const { s: s0, ap, ids, opp } = setup([scourge]); // three Islands
    const two = putOnBattlefield(s0, opp, bear());
    const four = putOnBattlefield(s0, opp, ogre());
    const mine = putOnBattlefield(s0, ap, bear());
    const s = cast(s0, ap, ids[0]!);
    expect(s.objects[two]!.zone).toBe("hand");
    expect(s.objects[four]!.zone).toBe("battlefield");
    expect(s.objects[mine]!.zone).toBe("battlefield");
  });
});
