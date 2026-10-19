// The Invasion Sieges of round 86 (CR 310): what each one's enters ability and back face do. Tarkir reveals any number
// of Dragons (CR 701.20a) for a reflexive trigger (603.12); Kaldheim exiles the hand and lets you play it until the end
// of your next turn; Alara exiles until two nonland cards with mana value 4 or less, casts one free and puts one into
// your hand (rulings); Gobakhan's exiled card can be played by its owner for {2} more.

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, passUntil, pt, putOnBattlefield, scry, setup, target } from "./helpers";
import { characteristics, hasConvoke, isFullySupported, objHasKeyword, objIsType, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const invasionOfTheros = scry("transform", [
  { name: "Invasion of Theros", mana_cost: "{2}{W}", type_line: "Battle — Siege", defense: "4", oracle_text: "(As a Siege enters, choose an opponent to protect it. You and others can attack it. When it's defeated, exile it, then cast it transformed.)\nWhen this Siege enters, search your library for an Aura, God, or Demigod card, reveal it, put it into your hand, then shuffle." },
  { name: "Ephara, Ever-Sheltering", type_line: "Legendary Enchantment Creature — God", power: "4", toughness: "4", color_indicator: ["U","W"], oracle_text: "Ephara has lifelink and indestructible as long as you control at least three other enchantments.\nWhenever another enchantment you control enters, draw a card." },
], { keywords: ["Transform"] });
const invasionOfZendikar = scry("transform", [
  { name: "Invasion of Zendikar", mana_cost: "{3}{G}", type_line: "Battle — Siege", defense: "3", oracle_text: "(As a Siege enters, choose an opponent to protect it. You and others can attack it. When it's defeated, exile it, then cast it transformed.)\nWhen this Siege enters, search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle." },
  { name: "Awakened Skyclave", type_line: "Creature — Elemental", power: "4", toughness: "4", color_indicator: ["G"], oracle_text: "Vigilance, haste\nAs long as this creature is on the battlefield, it's a land in addition to its other types.\n{T}: Add one mana of any color." },
], { keywords: ["Vigilance","Transform","Haste"] });
const invasionOfInnistrad = scry("transform", [
  { name: "Invasion of Innistrad", mana_cost: "{2}{B}{B}", type_line: "Battle — Siege", defense: "5", oracle_text: "(As a Siege enters, choose an opponent to protect it. You and others can attack it. When it's defeated, exile it, then cast it transformed.)\nFlash\nWhen this Siege enters, target creature an opponent controls gets -13/-13 until end of turn." },
  { name: "Deluge of the Dead", type_line: "Enchantment", color_indicator: ["B"], oracle_text: "When this enchantment enters, create two 2/2 black Zombie creature tokens.\n{2}{B}: Exile target card from a graveyard. If it was a creature card, create a 2/2 black Zombie creature token." },
], { keywords: ["Transform","Flash"] });
const invasionOfAzgol = scry("transform", [
  { name: "Invasion of Azgol", mana_cost: "{B}{R}", type_line: "Battle — Siege", defense: "4", oracle_text: "(As a Siege enters, choose an opponent to protect it. You and others can attack it. When it's defeated, exile it, then cast it transformed.)\nWhen this Siege enters, target player sacrifices a creature or planeswalker of their choice and loses 1 life." },
  { name: "Ashen Reaper", type_line: "Creature — Zombie Elemental", power: "2", toughness: "1", color_indicator: ["B","R"], oracle_text: "Menace\nAt the beginning of your end step, put a +1/+1 counter on this creature if a permanent was put into a graveyard from the battlefield this turn." },
], { keywords: ["Transform","Menace"] });
const invasionOfFiora = scry("transform", [
  { name: "Invasion of Fiora", mana_cost: "{4}{B}{B}", type_line: "Battle — Siege", defense: "4", oracle_text: "(As a Siege enters, choose an opponent to protect it. You and others can attack it. When it's defeated, exile it, then cast it transformed.)\nWhen this Siege enters, choose one or both —\n• Destroy all legendary creatures.\n• Destroy all nonlegendary creatures." },
  { name: "Marchesa, Resolute Monarch", type_line: "Legendary Creature — Human Noble", power: "3", toughness: "6", color_indicator: ["B"], oracle_text: "Menace, deathtouch\nWhenever Marchesa attacks, remove all counters from up to one target permanent.\nAt the beginning of your upkeep, if you haven't been dealt combat damage since your last turn, you draw a card and you lose 1 life." },
], { keywords: ["Transform","Menace","Deathtouch"] });
const invasionOfKylem = scry("transform", [
  { name: "Invasion of Kylem", mana_cost: "{2}{R}{W}", type_line: "Battle — Siege", defense: "5", oracle_text: "(As a Siege enters, choose an opponent to protect it. You and others can attack it. When it's defeated, exile it, then cast it transformed.)\nWhen this Siege enters, up to two target creatures each get +2/+0 and gain vigilance and haste until end of turn." },
  { name: "Valor's Reach Tag Team", type_line: "Sorcery", color_indicator: ["R","W"], oracle_text: "Create two 3/2 red and white Warrior creature tokens with \"Whenever this token and at least one other creature token attack, put a +1/+1 counter on this token.\"" },
], { keywords: ["Transform"] });
const invasionOfNewCapenna = scry("transform", [
  { name: "Invasion of New Capenna", mana_cost: "{W}{B}", type_line: "Battle — Siege", defense: "4", oracle_text: "(As a Siege enters, choose an opponent to protect it. You and others can attack it. When it's defeated, exile it, then cast it transformed.)\nWhen this Siege enters, you may sacrifice an artifact or creature. When you do, exile target artifact or creature an opponent controls." },
  { name: "Holy Frazzle-Cannon", type_line: "Artifact — Equipment", color_indicator: ["B","W"], oracle_text: "Whenever equipped creature attacks, put a +1/+1 counter on that creature and each other creature you control that shares a creature type with it.\nEquip {1}" },
], { keywords: ["Transform","Equip"] });
const invasionOfPyrulea = scry("transform", [
  { name: "Invasion of Pyrulea", mana_cost: "{G}{U}", type_line: "Battle — Siege", defense: "4", oracle_text: "(As a Siege enters, choose an opponent to protect it. You and others can attack it. When it's defeated, exile it, then cast it transformed.)\nWhen this Siege enters, scry 3, then reveal the top card of your library. If it's a land or double-faced card, draw a card." },
  { name: "Gargantuan Slabhorn", type_line: "Creature — Beast", power: "4", toughness: "4", color_indicator: ["G","U"], oracle_text: "Trample, ward {2}\nOther transformed permanents you control have trample and ward {2}." },
], { keywords: ["Transform","Trample","Ward","Scry"] });
const invasionOfRavnica = scry("transform", [
  { name: "Invasion of Ravnica", mana_cost: "{5}", type_line: "Battle — Siege", defense: "4", oracle_text: "(As a Siege enters, choose an opponent to protect it. You and others can attack it. When it's defeated, exile it, then cast it transformed.)\nWhen this Siege enters, exile target nonland permanent an opponent controls that isn't exactly two colors." },
  { name: "Guildpact Paragon", type_line: "Artifact Creature — Construct", power: "5", toughness: "5", oracle_text: "Whenever you cast a spell that's exactly two colors, look at the top six cards of your library. You may reveal a card that's exactly two colors from among them and put it into your hand. Put the rest on the bottom of your library in a random order." },
], { keywords: ["Transform"] });
const invasionOfSegovia = scry("transform", [
  { name: "Invasion of Segovia", mana_cost: "{2}{U}", type_line: "Battle — Siege", defense: "4", oracle_text: "(As a Siege enters, choose an opponent to protect it. You and others can attack it. When it's defeated, exile it, then cast it transformed.)\nWhen this Siege enters, create two 1/1 blue Kraken creature tokens with trample." },
  { name: "Caetus, Sea Tyrant of Segovia", type_line: "Legendary Creature — Serpent", power: "3", toughness: "3", color_indicator: ["U"], oracle_text: "Noncreature spells you cast have convoke. (Your creatures can help cast those spells. Each creature you tap while casting a noncreature spell pays for {1} or one mana of that creature's color.)\nAt the beginning of your end step, untap up to four target creatures." },
], { keywords: ["Transform"] });
const invasionOfIkoria = scry("transform", [
  { name: "Invasion of Ikoria", mana_cost: "{X}{G}{G}", type_line: "Battle — Siege", defense: "6", oracle_text: "(As a Siege enters, choose an opponent to protect it. You and others can attack it. When it's defeated, exile it, then cast it transformed.)\nWhen this Siege enters, search your library and/or graveyard for a non-Human creature card with mana value X or less and put it onto the battlefield. If you search your library this way, shuffle." },
  { name: "Zilortha, Apex of Ikoria", type_line: "Legendary Creature — Dinosaur", power: "8", toughness: "8", color_indicator: ["G"], oracle_text: "Reach\nFor each non-Human creature you control, you may have that creature assign its combat damage as though it weren't blocked." },
], { keywords: ["Reach","Transform"] });
const invasionOfTarkir = scry("transform", [
  { name: "Invasion of Tarkir", mana_cost: "{1}{R}", type_line: "Battle — Siege", defense: "5", oracle_text: "(As a Siege enters, choose an opponent to protect it. You and others can attack it. When it's defeated, exile it, then cast it transformed.)\nWhen this Siege enters, reveal any number of Dragon cards from your hand. When you do, this Siege deals X plus 2 damage to any other target, where X is the number of cards revealed this way. (X can be 0.)" },
  { name: "Defiant Thundermaw", type_line: "Creature — Dragon", power: "4", toughness: "4", color_indicator: ["R"], oracle_text: "Flying, trample\nWhenever a Dragon you control attacks, it deals 2 damage to any target." },
], { keywords: ["Flying","Transform","Trample"] });
const invasionOfAmonkhet = scry("transform", [
  { name: "Invasion of Amonkhet", mana_cost: "{1}{U}{B}", type_line: "Battle — Siege", defense: "4", oracle_text: "(As a Siege enters, choose an opponent to protect it. You and others can attack it. When it's defeated, exile it, then cast it transformed.)\nWhen this Siege enters, each player mills three cards, then each opponent discards a card and you draw a card. (To mill three cards, a player puts the top three cards of their library into their graveyard.)" },
  { name: "Lazotep Convert", type_line: "Creature — Zombie", power: "4", toughness: "4", color_indicator: ["B","U"], oracle_text: "You may have this creature enter as a copy of any creature card in a graveyard, except it's a 4/4 black Zombie in addition to its other colors and types." },
], { keywords: ["Transform","Mill"] });
const invasionOfArcavios = scry("transform", [
  { name: "Invasion of Arcavios", mana_cost: "{3}{U}{U}", type_line: "Battle — Siege", defense: "7", oracle_text: "(As a Siege enters, choose an opponent to protect it. You and others can attack it. When it's defeated, exile it, then cast it transformed.)\nWhen this Siege enters, search your library, graveyard, and/or outside the game for an instant or sorcery card you own, reveal it, and put it into your hand. If you search your library this way, shuffle." },
  { name: "Invocation of the Founders", type_line: "Enchantment", color_indicator: ["U"], oracle_text: "Whenever you cast an instant or sorcery spell from your hand, you may copy that spell. You may choose new targets for the copy." },
], { keywords: ["Transform"] });
const invasionOfGobakhan = scry("transform", [
  { name: "Invasion of Gobakhan", mana_cost: "{1}{W}", type_line: "Battle — Siege", defense: "3", oracle_text: "(As a Siege enters, choose an opponent to protect it. You and others can attack it. When it's defeated, exile it, then cast it transformed.)\nWhen this Siege enters, look at target opponent's hand. You may exile a nonland card from it. For as long as that card remains exiled, its owner may play it. A spell cast this way costs {2} more to cast." },
  { name: "Lightshield Array", type_line: "Enchantment", color_indicator: ["W"], oracle_text: "At the beginning of your end step, put a +1/+1 counter on each creature that attacked this turn.\nSacrifice this enchantment: Creatures you control gain hexproof and indestructible until end of turn." },
], { keywords: ["Transform"] });
const invasionOfKaldheim = scry("transform", [
  { name: "Invasion of Kaldheim", mana_cost: "{3}{R}", type_line: "Battle — Siege", defense: "4", oracle_text: "(As a Siege enters, choose an opponent to protect it. You and others can attack it. When it's defeated, exile it, then cast it transformed.)\nWhen this Siege enters, exile all cards from your hand, then draw that many cards. Until the end of your next turn, you may play cards exiled this way." },
  { name: "Pyre of the World Tree", type_line: "Enchantment", color_indicator: ["R"], oracle_text: "Discard a land card: This enchantment deals 2 damage to any target.\nWhenever you discard a land card, exile the top card of your library. You may play that card this turn." },
], { keywords: ["Transform"] });
const invasionOfAlara = scry("transform", [
  { name: "Invasion of Alara", mana_cost: "{W}{U}{B}{R}{G}", type_line: "Battle — Siege", defense: "7", oracle_text: "When this Siege enters, exile cards from the top of your library until you exile two nonland cards with mana value 4 or less. You may cast one of those two cards without paying its mana cost. Put one of them into your hand. Then put the other cards exiled this way on the bottom of your library in a random order." },
  { name: "Awaken the Maelstrom", type_line: "Sorcery", color_indicator: ["B","G","R","U","W"], oracle_text: "Awaken the Maelstrom is all colors.\nTarget player draws two cards. You may put an artifact card from your hand onto the battlefield. Create a token that's a copy of a permanent you control. Distribute three +1/+1 counters among one, two, or three creatures you control. Destroy target permanent an opponent controls." },
], { keywords: ["Transform"] });
const fallajiWayfarer = card("Fallaji Wayfarer", "Creature — Human Scout", "{2}{G}", { colors: ["W", "U", "B", "R", "G"], colorIdentity: ["G"], power: "2", toughness: "4", oracleText: "Fallaji Wayfarer is all colors. This ability doesn't affect its color identity. (It can be in any deck whose commander's color identity includes green.)\nMulticolored spells you cast have convoke. (Your creatures can help cast those spells. Each creature you tap while casting a multicolored spell pays for {1} or one mana of a color that creature is.)" });

const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const dragon = (name = "Shivan Dragon") => card(name, "Creature — Dragon", "{4}{R}{R}", { power: "5", toughness: "5", oracleText: "Flying" });
const ALL = [invasionOfTheros, invasionOfZendikar, invasionOfInnistrad, invasionOfAzgol, invasionOfFiora, invasionOfKylem, invasionOfNewCapenna, invasionOfPyrulea, invasionOfRavnica, invasionOfSegovia, invasionOfIkoria, invasionOfTarkir, invasionOfAmonkhet, invasionOfArcavios, invasionOfGobakhan, invasionOfKaldheim, invasionOfAlara, fallajiWayfarer];

const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Cast the Siege and choose its protector; its enters trigger is then waiting or done. */
const castSiege = (s: GameState, ap: PlayerId, id: string, protector: PlayerId) => {
  s = cast(s, ap, id);
  expect(s.pending).toMatchObject({ kind: "chooseOption", what: "protector", player: ap });
  return settle(act(s, { type: "chooseOption", player: ap, choice: String(protector) }));
};
/** A new card on top of a player's library. */
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
};
/** A permanent on the battlefield with its back face up. */
const backUp = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.face = 1;
  return id;
};

describe("Invasion Sieges (round 86)", () => {
  it("compiles all of them, both faces", () => {
    for (const d of ALL) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Invasion of Tarkir: reveal any number of Dragons, then X plus 2 damage to any other target", () => {
    const { s: s0, ap, ids, opp } = setup([invasionOfTarkir, dragon(), dragon("Thundermaw Hellkite"), bear()]);
    let s = castSiege(s0, ap, ids[0]!, opp);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", reveal: true, fromHand: true, min: 0 });
    if (s.pending?.kind !== "searchLibrary") throw new Error();
    // Only the Dragons can be revealed.
    expect([...s.pending.cards].sort()).toEqual([ids[1]!, ids[2]!].sort());
    s = act(s, { type: "searchLibrary", player: ap, found: [ids[1]!, ids[2]!] });
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.players[opp]!.life).toBe(36);
    // Revealing none still deals 2 (X is 0).
    const { s: t0, ap: a2, ids: i2, opp: o2 } = setup([invasionOfTarkir, dragon()]);
    let t = castSiege(t0, a2, i2[0]!, o2);
    t = settle(act(t, { type: "searchLibrary", player: a2, found: [] }));
    t = settle(act(t, { type: "chooseTargets", player: a2, targets: [{ kind: "player", id: o2 }] }));
    expect(t.players[o2]!.life).toBe(38);
  });

  it("Invasion of Kaldheim: exile your hand, draw that many, and play the exiled cards until the end of your next turn", () => {
    const { s: s0, ap, ids, opp } = setup([invasionOfKaldheim, bear(), bear()]);
    const handBefore = s0.players[ap]!.hand.length;
    const s = castSiege(s0, ap, ids[0]!, opp);
    for (const id of [ids[1]!, ids[2]!]) expect(s.objects[id]).toMatchObject({ zone: "exile", mayPlay: { player: ap, until: "nextTurn" } });
    // The Siege left the hand, the two others were exiled and two were drawn.
    expect(s.players[ap]!.hand.length).toBe(handBefore - 1);
    const t = cast(s, ap, ids[1]!);
    expect(t.objects[ids[1]!]!.zone).toBe("battlefield");
  });

  it("Invasion of Alara: exile until two nonland cards with mana value 4 or less, cast one, the other to your hand", () => {
    const { s: s0, ap, ids, opp } = setup([invasionOfAlara]);
    // From the top: a land, a 6-drop, a bear (2), a land, Shock (1), more cards below.
    const sh = onTop(s0, ap, shock);
    const l2 = onTop(s0, ap, card("Wastes", "Basic Land"));
    const b = onTop(s0, ap, bear());
    const big = onTop(s0, ap, dragon());
    const l1 = onTop(s0, ap, card("Wastes", "Basic Land"));
    let s = castSiege(s0, ap, ids[0]!, opp);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong" });
    if (s.pending?.kind !== "chooseOption") throw new Error();
    expect(s.pending.options).toEqual(expect.arrayContaining([b, sh, "none"]));
    expect(s.pending.options).toHaveLength(3);
    s = act(s, { type: "chooseOption", player: ap, choice: b });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: b });
    s = settle(act(s, { type: "castSpell", player: ap, objectId: b }));
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[sh]!.zone).toBe("hand");
    // The others go to the bottom, in a random order.
    const lib = s.players[ap]!.library;
    expect(lib.slice(-3).sort()).toEqual([l1, big, l2].sort());
  });

  it("Invasion of Alara: casting neither, you pick which goes to your hand and the other stays exiled (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([invasionOfAlara]);
    const sh = onTop(s0, ap, shock);
    const b = onTop(s0, ap, bear());
    let s = castSiege(s0, ap, ids[0]!, opp);
    s = act(s, { type: "chooseOption", player: ap, choice: "none" });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong" });
    if (s.pending?.kind !== "chooseOption") throw new Error();
    expect([...s.pending.options].sort()).toEqual([b, sh].sort());
    s = settle(act(s, { type: "chooseOption", player: ap, choice: sh }));
    expect(s.objects[sh]!.zone).toBe("hand");
    expect(s.objects[b]!.zone).toBe("exile");
  });

  it("Invasion of Gobakhan: exile a nonland card from an opponent's hand, or none; its owner may play it for {2} more", () => {
    const { s: s0, ap, ids, opp } = setup([invasionOfGobakhan]);
    const theirs = putOnBattlefield(s0, opp, bear());
    s0.battlefield.splice(s0.battlefield.indexOf(theirs), 1);
    s0.objects[theirs]!.zone = "hand";
    s0.players[opp]!.hand.push(theirs);
    let s = castSiege(s0, ap, ids[0]!, opp);
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", min: 0, max: 1, hand: opp });
    const none = settle(act(structuredClone(s), { type: "searchLibrary", player: ap, found: [] }));
    expect(none.objects[theirs]!.zone).toBe("hand");
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [theirs] }));
    expect(s.objects[theirs]).toMatchObject({ zone: "exile", mayPlay: { player: opp, until: "exiled", more: 2 } });
  });

  it("Awakened Skyclave is a land as well as a creature on the battlefield", () => {
    const { s, ap } = setup([]);
    const id = backUp(s, ap, invasionOfZendikar);
    expect(objIsType(s, s.objects[id]!, "Land")).toBe(true);
    expect(objIsType(s, s.objects[id]!, "Creature")).toBe(true);
  });

  it("Gargantuan Slabhorn: other transformed permanents you control have trample and ward", () => {
    const { s, ap } = setup([]);
    backUp(s, ap, invasionOfPyrulea);
    const sky = backUp(s, ap, invasionOfZendikar);
    const plain = putOnBattlefield(s, ap, bear());
    expect(objHasKeyword(s, s.objects[sky]!, "Trample")).toBe(true);
    expect(objHasKeyword(s, s.objects[plain]!, "Trample")).toBe(false);
  });

  it("Zilortha: only non-Human creatures may assign combat damage as though unblocked", () => {
    const { s, ap } = setup([]);
    backUp(s, ap, invasionOfIkoria);
    const elf = putOnBattlefield(s, ap, bear());
    const human = putOnBattlefield(s, ap, card("Human Soldier", "Creature — Human Soldier", "{W}", { power: "1", toughness: "1" }));
    expect(characteristics(s, s.objects[elf]!).unblockedDamage).toBe(true);
    expect(characteristics(s, s.objects[human]!).unblockedDamage).toBe(false);
  });

  it("Caetus and Fallaji Wayfarer give noncreature or multicolored spells convoke", () => {
    const { s, ap, ids } = setup([shock, bear(), card("Lightning Helix", "Instant", "{R}{W}", { oracleText: "Lightning Helix deals 3 damage to any target and you gain 3 life." })]);
    expect(hasConvoke(s, ap, s.objects[ids[0]!]!)).toBe(false);
    backUp(s, ap, invasionOfSegovia);
    expect(hasConvoke(s, ap, s.objects[ids[0]!]!)).toBe(true);
    expect(hasConvoke(s, ap, s.objects[ids[1]!]!)).toBe(false);
    const { s: t, ap: a2, ids: i2 } = setup([shock, card("Lightning Helix", "Instant", "{R}{W}", { oracleText: "Lightning Helix deals 3 damage to any target and you gain 3 life." })]);
    putOnBattlefield(t, a2, fallajiWayfarer);
    expect(hasConvoke(t, a2, t.objects[i2[0]!]!)).toBe(false);
    expect(hasConvoke(t, a2, t.objects[i2[1]!]!)).toBe(true);
  });

  it("Invasion of Ravnica can't exile a permanent that's exactly two colors", () => {
    const { s: s0, ap, ids, opp } = setup([invasionOfRavnica]);
    const gold = putOnBattlefield(s0, opp, card("Watchwolf", "Creature — Wolf", "{G}{W}", { power: "3", toughness: "3" }));
    const mono = putOnBattlefield(s0, opp, bear());
    let s = castSiege(s0, ap, ids[0]!, opp);
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [target(gold)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(mono)] }));
    expect(s.objects[mono]!.zone).toBe("exile");
  });

  it("Holy Frazzle-Cannon: a counter on the attacker and each other creature you control sharing a creature type with it", () => {
    const { s: s0, ap, opp } = setup([]);
    const cannon = backUp(s0, ap, invasionOfNewCapenna);
    const a = putOnBattlefield(s0, ap, card("Elite Vanguard", "Creature — Human Soldier", "{W}", { power: "2", toughness: "1" }));
    const b = putOnBattlefield(s0, ap, card("Village Bell-Ringer", "Creature — Human Scout", "{2}{W}", { power: "1", toughness: "4" }));
    const c = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, card("Merfolk of the Pearl Trident", "Creature — Human Merfolk", "{U}", { power: "1", toughness: "1" }));
    s0.objects[cannon]!.attachedTo = a;
    let s = passUntil(s0, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] }));
    expect(s.objects[a]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[c]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.objects[theirs]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Valor's Reach Tag Team: its Warriors get a counter when they attack with another creature token", () => {
    const { s: s0, ap, ids, opp } = setup([card("Valor's Reach Tag Team", "Sorcery", "{3}{R}{W}", { oracleText: invasionOfKylem.faces![1]!.oracleText })]);
    let s = cast(s0, ap, ids[0]!);
    const warriors = s.battlefield.filter((id) => s.objects[id]!.isToken);
    expect(warriors).toHaveLength(2);
    for (const w of warriors) s.objects[w]!.controlledSinceTurn = -1;
    const nontoken = putOnBattlefield(s, ap, bear());
    const one = structuredClone(s);
    s = passUntil(s, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: warriors.map((w) => ({ attacker: w, defender: opp })) }));
    for (const w of warriors) expect(pt(s, w)).toBe("4/3");
    // One token and a nontoken creature: no other creature token attacks.
    let t = passUntil(one, "declareAttackers", ap);
    t = settle(act(t, { type: "declareAttackers", player: ap, attacks: [{ attacker: warriors[0]!, defender: opp }, { attacker: nontoken, defender: opp }] }));
    expect(pt(t, warriors[0]!)).toBe("3/2");
  });

  it("Marchesa: a card and 1 life lost each upkeep only if you weren't dealt combat damage since your last turn", () => {
    const { s: s0, ap } = setup([]);
    backUp(s0, ap, invasionOfFiora);
    const life = s0.players[ap]!.life;
    // Its first upkeep comes a full round later; nobody attacks.
    let s = passUntil(passUntil(s0, "end", ap), "upkeep", ap);
    s = settle(s);
    expect(s.players[ap]!.life).toBe(life - 1);
    // Dealt combat damage on an opponent's turn since then: nothing.
    let t = passUntil(passUntil(s, "end", ap), "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    t.players[ap]!.combatDamagedTurn = t.turn;
    t = settle(passUntil(t, "upkeep", ap));
    expect(t.players[ap]!.life).toBe(life - 1);
  });

  it("Ashen Reaper: a counter at your end step only if a permanent went to a graveyard from the battlefield this turn", () => {
    const { s: s0, ap, ids } = setup([shock]);
    const reaper = backUp(s0, ap, invasionOfAzgol);
    const quiet = settle(passUntil(structuredClone(s0), "end", ap));
    expect(quiet.objects[reaper]!.counters["+1/+1"] ?? 0).toBe(0);
    const victim = putOnBattlefield(s0, ap, bear({ power: "1", toughness: "1" }));
    let s = cast(s0, ap, ids[0]!, [target(victim)]);
    expect(s.objects[victim]!.zone).toBe("graveyard");
    s = settle(passUntil(s, "end", ap));
    expect(s.objects[reaper]!.counters["+1/+1"]).toBe(1);
  });

  it("Deluge of the Dead: a Zombie only if the exiled card was a creature card", () => {
    const { s: s0, ap, opp } = setup([]);
    const deluge = backUp(s0, ap, invasionOfInnistrad);
    const yard = (def: CardDef) => {
      const id = putOnBattlefield(s0, opp, def);
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      s0.objects[id]!.zone = "graveyard";
      s0.players[opp]!.graveyard.push(id);
      return id;
    };
    const dead = yard(bear());
    const spell = yard(shock);
    const tokens = (s: GameState) => s.battlefield.filter((id) => s.objects[id]!.isToken).length;
    const t = activate(structuredClone(s0), ap, deluge, 0, [target(spell)]);
    expect(t.objects[spell]!.zone).toBe("exile");
    expect(tokens(t)).toBe(0);
    const u = activate(s0, ap, deluge, 0, [target(dead)]);
    expect(tokens(u)).toBe(1);
  });

  it("Lazotep Convert: may enter as a copy of a creature card in any graveyard, a 4/4 black Zombie as well", () => {
    const { s: s0, ap, ids, opp } = setup([card("Lazotep Convert", "Creature — Zombie", "{1}{U}{B}", { power: "4", toughness: "4", oracleText: invasionOfAmonkhet.faces![1]!.oracleText })]);
    const elf = putOnBattlefield(s0, opp, card("Llanowar Elves", "Creature — Elf Druid", "{G}", { power: "1", toughness: "1", oracleText: "{T}: Add {G}." }));
    s0.battlefield.splice(s0.battlefield.indexOf(elf), 1);
    s0.objects[elf]!.zone = "graveyard";
    s0.players[opp]!.graveyard.push(elf);
    let s = cast(s0, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "copy" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: elf }));
    const c = characteristics(s, s.objects[ids[0]!]!);
    expect(c.name).toBe("Llanowar Elves");
    expect(pt(s, ids[0]!)).toBe("4/4");
    expect(c.subtypes).toEqual(expect.arrayContaining(["Elf", "Zombie"]));
    expect(c.colors).toEqual(expect.arrayContaining(["G", "B"]));
  });

  it("Invocation of the Founders: you may copy an instant cast from your hand, with new targets", () => {
    const { s: s0, ap, ids, opp } = setup([shock]);
    backUp(s0, ap, invasionOfArcavios);
    const x = putOnBattlefield(s0, opp, bear());
    let s = cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: ap, copyOf: "Shock" });
    s = settle(act(s, { type: "copyTargets", player: ap, targets: [target(x)] }));
    expect(s.objects[x]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(38);
  });
});
