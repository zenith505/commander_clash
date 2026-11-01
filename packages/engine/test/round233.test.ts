// Round 233: cards from the top of the popularity list. Pia Nalaar, Chief Mechanic ("you may pay one or more {E}. If you
// do, create an X/X ... Vehicle token"); Winter Soldier, Reborn Avenger ("If a Hero enters this way, it enters with an
// additional +1/+1 counter"); Willie Lumpkin, Postman ("that player may draw a card. If they do, that player can't
// attack you ..."); Daredevil, Man Without Fear ("you may exile the top card ... If that card is a Hero card"); Tamiyo,
// Seasoned Scholar ("If it's a green card, add one mana of any color"); Make Your Own Luck (a look's exile plotted);
// Scourge of Nel Toth (cast from the graveyard for {B}{B} and two creatures); The Grim Captain's Locker (escape for the
// creature cards in your graveyard until end of turn); Falkenrath Gorger (madness for Vampire cards); Reckless Blaze
// (mana when your damaged creatures die); Sunder the Gateway ("then transform an Incubator token you control"); Neriv,
// Crackling Vanguard ("During any turn you attacked with a commander"); Ethereal Valkyrie ("It becomes foretold").

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, applyAction, castProblem, botActions, characteristics, closeZoneBatch, destroyPermanent, discardCards, foretellCostOf, graveyardWays, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/**
 * Everyone passes until the stack is empty, answering "you may" with `may` and trigger targets with `targets`; other
 * players' questions are answered as the bots would. Stops at any other question of `me`'s.
 */
const settle = (s: GameState, opts: { may?: boolean; targets?: TargetChoice[]; me?: PlayerId } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me !== undefined && p.player !== opts.me) s = act(s, botActions(s, p.player)[0]!);
    else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.may ?? true });
    else if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets ?? [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]?.zone;
/** Moves the hand to the library, so cleanup asks for no discards. */
const trimHand = (s: GameState, pid: PlayerId) => {
  const p = s.players[pid]!;
  for (const id of p.hand.splice(0)) {
    s.objects[id]!.zone = "library";
    p.library.push(id);
  }
};
/** Taps everything a player controls, then gives them exactly this mana. */
const poolOnly = (s: GameState, pid: PlayerId, mana: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  for (const id of s.battlefield) if (s.objects[id]!.controller === pid) s.objects[id]!.tapped = true;
  Object.assign(s.players[pid]!.manaPool, mana);
};
/** Declares attackers, then passes (no blocks) until `me` has a question or combat ends. */
const attack = (s: GameState, me: PlayerId, attacks: { attacker: ObjectId; defender: PlayerId }[]) => {
  s = passUntil(s, "declareAttackers", me);
  s = act(s, { type: "declareAttackers", player: me, attacks });
  for (let i = 0; i < 80 && s.step !== "endCombat" && s.step !== "main2"; i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p && p.player === me) return s;
    else if (p) s = act(s, botActions(s, p.player)[0]!);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const mine = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && characteristics(s, s.objects[id]!).name === name);

// Real oracle text (Scryfall).
const pia = (): CardDef => ({"oracleId": "31cb87bf-1020-4fd5-95f7-8ecb197d823b", "name": "Pia Nalaar, Chief Mechanic", "manaCost": "{G}{U}{R}", "cmc": 3, "typeLine": "Legendary Creature — Human Artificer", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Human", "Artificer"], "oracleText": "Whenever one or more artifact creatures you control deal combat damage to a player, you get {E}{E} (two energy counters).\nAt the beginning of your end step, you may pay one or more {E}. If you do, create an X/X colorless Vehicle artifact token named Nalaar Aetherjet with flying and crew 2, where X is the amount of {E} paid this way.", "power": "2", "toughness": "4", "colors": ["G", "R", "U"], "colorIdentity": ["G", "R", "U"], "keywords": [], "layout": "normal"}) as CardDef;
const winter = (): CardDef => ({"oracleId": "df81ecf2-b49e-4be2-8757-ee2050784c9e", "name": "Winter Soldier, Reborn Avenger", "manaCost": "{4}{W}", "cmc": 5, "typeLine": "Legendary Creature — Human Soldier Hero", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Human", "Soldier", "Hero"], "oracleText": "Whenever Winter Soldier attacks, return target creature card with mana value less than or equal to Winter Soldier's power from your graveyard to the battlefield. If a Hero enters this way, it enters with an additional +1/+1 counter on it.", "power": "3", "toughness": "5", "colors": ["W"], "colorIdentity": ["W"], "keywords": [], "layout": "normal"}) as CardDef;
const willie = (): CardDef => ({"oracleId": "b08633e9-7b8f-4f69-a3b7-8d982b17574c", "name": "Willie Lumpkin, Postman", "manaCost": "{W}{U}", "cmc": 2, "typeLine": "Legendary Creature — Human Citizen", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Human", "Citizen"], "oracleText": "Willie Lumpkin can't be blocked.\nWhenever Willie Lumpkin deals combat damage to an opponent, you draw a card and that player may draw a card. If they do, that player can't attack you or permanents you control during their next turn.", "power": "1", "toughness": "3", "colors": ["U", "W"], "colorIdentity": ["U", "W"], "keywords": [], "layout": "normal"}) as CardDef;
const daredevil = (): CardDef => ({"oracleId": "88aadf60-91f9-4932-a2bc-63365a139d36", "name": "Daredevil, Man Without Fear", "manaCost": "{2}{R}{W}", "cmc": 4, "typeLine": "Legendary Creature — Human Hero", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Human", "Hero"], "oracleText": "Vigilance, haste\nRadar Sense — You may look at the top card of your library any time.\nWhenever you attack, you may exile the top card of your library. If that card is a Hero card, Daredevil gets +2/+1 until end of turn. You may play that card this turn.", "power": "3", "toughness": "4", "colors": ["R", "W"], "colorIdentity": ["R", "W"], "keywords": ["Radar Sense", "Vigilance", "Haste"], "layout": "normal"}) as CardDef;
const tamiyo = (): CardDef => ({"oracleId": "1ed9e351-0000-4b75-8ecb-d15bd88df68a", "name": "Tamiyo, Inquisitive Student // Tamiyo, Seasoned Scholar", "manaCost": "{U}", "cmc": 1, "typeLine": "Legendary Creature — Moonfolk Wizard // Legendary Planeswalker — Tamiyo", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Moonfolk", "Wizard"], "oracleText": "Flying\nWhenever Tamiyo attacks, investigate. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")\nWhen you draw your third card in a turn, exile Tamiyo, then return her to the battlefield transformed under her owner's control.", "power": "0", "toughness": "3", "colors": ["U"], "colorIdentity": ["G", "U"], "keywords": ["Flying", "Investigate", "Transform"], "producedMana": ["B", "G", "R", "U", "W"], "layout": "transform", "faces": [{"name": "Tamiyo, Inquisitive Student", "manaCost": "{U}", "typeLine": "Legendary Creature — Moonfolk Wizard", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Moonfolk", "Wizard"], "oracleText": "Flying\nWhenever Tamiyo attacks, investigate. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")\nWhen you draw your third card in a turn, exile Tamiyo, then return her to the battlefield transformed under her owner's control.", "power": "0", "toughness": "3", "colors": ["U"], "imageUrl": "https://cards.scryfall.io/normal/front/2/a/2a717b98-cdac-416d-bf6c-f6b6638e65d1.jpg?1783911236", "artUrl": "https://cards.scryfall.io/art_crop/front/2/a/2a717b98-cdac-416d-bf6c-f6b6638e65d1.jpg?1783911236"}, {"name": "Tamiyo, Seasoned Scholar", "manaCost": "", "typeLine": "Legendary Planeswalker — Tamiyo", "supertypes": ["Legendary"], "types": ["Planeswalker"], "subtypes": ["Tamiyo"], "oracleText": "+2: Until your next turn, whenever a creature attacks you or a planeswalker you control, it gets -1/-0 until end of turn.\n−3: Return target instant or sorcery card from your graveyard to your hand. If it's a green card, add one mana of any color.\n−7: Draw cards equal to half the number of cards in your library, rounded up. You get an emblem with \"You have no maximum hand size.\"", "loyalty": "2", "colors": ["G", "U"], "colorIndicator": ["G", "U"], "imageUrl": "https://cards.scryfall.io/normal/back/2/a/2a717b98-cdac-416d-bf6c-f6b6638e65d1.jpg?1783911236", "artUrl": "https://cards.scryfall.io/art_crop/back/2/a/2a717b98-cdac-416d-bf6c-f6b6638e65d1.jpg?1783911236"}]}) as CardDef;
const luck = (): CardDef => ({"oracleId": "41246140-4b44-40c4-b92b-501e49c50bf7", "name": "Make Your Own Luck", "manaCost": "{3}{G}{U}", "cmc": 5, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Look at the top three cards of your library. You may exile a nonland card from among them. If you do, it becomes plotted. Put the rest into your hand. (You may cast it as a sorcery on a later turn without paying its mana cost.)", "colors": ["G", "U"], "colorIdentity": ["G", "U"], "keywords": ["Plot"], "layout": "normal"}) as CardDef;
const scourge = (): CardDef => ({"oracleId": "32972d7a-c7c6-437c-8e7c-6c7d56b130e4", "name": "Scourge of Nel Toth", "manaCost": "{5}{B}{B}", "cmc": 7, "typeLine": "Creature — Zombie Dragon", "supertypes": [], "types": ["Creature"], "subtypes": ["Zombie", "Dragon"], "oracleText": "Flying\nYou may cast this creature from your graveyard by paying {B}{B} and sacrificing two creatures rather than paying its mana cost.", "power": "6", "toughness": "6", "colors": ["B"], "colorIdentity": ["B"], "keywords": ["Flying"], "layout": "normal"}) as CardDef;
const locker = (): CardDef => ({"oracleId": "29931e18-9dac-46fe-b9a4-72d838d79882", "name": "The Grim Captain's Locker", "manaCost": "{3}{B}", "cmc": 4, "typeLine": "Legendary Artifact", "supertypes": ["Legendary"], "types": ["Artifact"], "subtypes": [], "oracleText": "{T}: Surveil 1. (Look at the top card of your library. You may put it into your graveyard.)\n{T}: Until end of turn, each creature card in your graveyard gains \"Escape—{3}{B}, Exile four other cards from your graveyard.\" (You may cast a card with escape from your graveyard for its escape cost.)", "colors": ["B"], "colorIdentity": ["B"], "keywords": ["Surveil"], "layout": "normal"}) as CardDef;
const gorger = (): CardDef => ({"oracleId": "26aba6fa-830f-4a7f-8618-488d8e00215a", "name": "Falkenrath Gorger", "manaCost": "{R}", "cmc": 1, "typeLine": "Creature — Vampire Berserker", "supertypes": [], "types": ["Creature"], "subtypes": ["Vampire", "Berserker"], "oracleText": "Each Vampire creature card you own that isn't on the battlefield has madness. The madness cost is equal to its mana cost. (If you discard a card with madness, discard it into exile. When you do, cast it for its madness cost or put it into your graveyard.)", "power": "2", "toughness": "1", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "layout": "normal"}) as CardDef;
const blaze = (): CardDef => ({"oracleId": "75137acb-dc8e-439b-8d84-c5cf682ff6bc", "name": "Reckless Blaze", "manaCost": "{3}{R}{R}", "cmc": 5, "typeLine": "Sorcery — Lesson", "supertypes": [], "types": ["Sorcery"], "subtypes": ["Lesson"], "oracleText": "Reckless Blaze deals 5 damage to each creature. Whenever a creature you control dealt damage this way dies this turn, add {R}.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "producedMana": ["R"], "layout": "normal"}) as CardDef;
const sunder = (): CardDef => ({"oracleId": "88d49309-e7d7-486d-8696-cd66bec2fe33", "name": "Sunder the Gateway", "manaCost": "{1}{W}", "cmc": 2, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Choose one —\n• Destroy target nontoken artifact or enchantment an opponent controls. Incubate 2. (Create an Incubator token with two +1/+1 counters on it and \"{2}: Transform this token.\" It transforms into a 0/0 Phyrexian artifact creature.)\n• Incubate 2, then transform an Incubator token you control.", "colors": ["W"], "colorIdentity": ["W"], "keywords": ["Incubate", "Transform"], "layout": "normal"}) as CardDef;
const neriv = (): CardDef => ({"oracleId": "c8f827d7-4740-43c8-b494-c9e0479e0bf7", "name": "Neriv, Crackling Vanguard", "manaCost": "{2}{R}{W}{B}", "cmc": 5, "typeLine": "Legendary Creature — Spirit Dragon", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Spirit", "Dragon"], "oracleText": "Flying, deathtouch\nWhen Neriv enters, create two 1/1 red Goblin creature tokens.\nWhenever Neriv attacks, exile a number of cards from the top of your library equal to the number of differently named tokens you control. During any turn you attacked with a commander, you may play those cards.", "power": "4", "toughness": "4", "colors": ["B", "R", "W"], "colorIdentity": ["B", "R", "W"], "keywords": ["Deathtouch", "Flying"], "layout": "normal"}) as CardDef;
const valkyrie = (): CardDef => ({"oracleId": "f0f7c3df-52f8-4835-a18f-69e56ffa3432", "name": "Ethereal Valkyrie", "manaCost": "{4}{W}{U}", "cmc": 6, "typeLine": "Creature — Spirit Angel", "supertypes": [], "types": ["Creature"], "subtypes": ["Spirit", "Angel"], "oracleText": "Flying\nWhenever this creature enters or attacks, draw a card, then exile a card from your hand face down. It becomes foretold. Its foretell cost is its mana cost reduced by {2}. (On a later turn, you may cast it for its foretell cost, even if this creature has left the battlefield.)", "power": "4", "toughness": "4", "colors": ["U", "W"], "colorIdentity": ["U", "W"], "keywords": ["Flying"], "layout": "normal"}) as CardDef;
// Helpers.
const hero = card("Test Hero", "Creature — Human Hero", "{2}{W}", { power: "2", toughness: "2" });
const knight = card("Test Knight", "Creature — Human Knight", "{2}{W}", { power: "2", toughness: "2" });
const vampire = card("Test Vampire", "Creature — Vampire", "{1}{R}", { power: "2", toughness: "1" });
const greenSpell = card("Test Growth", "Instant", "{G}", { oracleText: "Target creature gets +3/+3 until end of turn." });
const blueSpell = card("Test Insight", "Sorcery", "{U}", { oracleText: "Draw a card." });
const relic = card("Test Relic", "Artifact", "{2}", { oracleText: "{T}: You gain 1 life." });
const idol = card("Test Idol", "Artifact", "{3}", { oracleText: "{T}: Add {C}." });
const ogre = card("Test Ogre", "Creature — Ogre", "{2}{B}", { power: "3", toughness: "3" });
const pebble = card("Test Pebble", "Instant", "{2}", { oracleText: "You gain 2 life." });

describe("round 233: parse", () => {
  it("every card of the round is fully supported", () => supported(pia(), winter(), willie(), daredevil(), tamiyo(), luck(), scourge(), locker(), gorger(), blaze(), sunder(), neriv(), valkyrie()));
});

describe("round 233: Pia Nalaar, Chief Mechanic", () => {
  it("pays the energy chosen at your end step for an X/X flying Vehicle named Nalaar Aetherjet with crew 2", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, pia());
    s.players[ap]!.energy = 3;
    trimHand(s, ap);
    s = passUntil(s, "end", ap);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "payEnergy", numberRange: { min: 0, max: 3 } });
    s = act(s, { type: "chooseOption", player: ap, choice: "2" });
    s = settle(s);
    expect(s.players[ap]!.energy).toBe(1);
    const jet = mine(s, ap, "Nalaar Aetherjet");
    expect(jet).toHaveLength(1);
    const c = characteristics(s, s.objects[jet[0]!]!);
    expect(c.types).toEqual(["Artifact"]);
    expect(c.subtypes).toContain("Vehicle");
    expect(c.keywords).toContain("Flying");
    expect(s.objects[jet[0]!]!.isToken).toBe(true);
    expect(abilitiesOf(s, s.objects[jet[0]!]!).activated.some((a) => /^Crew 2/.test(a.text))).toBe(true);
    expect([power(s, s.objects[jet[0]!]!), toughness(s, s.objects[jet[0]!]!)]).toEqual([2, 2]);
  });

  it("paying no energy is not paying one or more: no token (CR 107.14)", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, pia());
    s.players[ap]!.energy = 2;
    trimHand(s, ap);
    s = passUntil(s, "end", ap);
    s = settle(s);
    s = act(s, { type: "chooseOption", player: ap, choice: "0" });
    s = settle(s);
    expect(s.players[ap]!.energy).toBe(2);
    expect(mine(s, ap, "Nalaar Aetherjet")).toHaveLength(0);
  });
});

describe("round 233: Winter Soldier, Reborn Avenger", () => {
  it("returns a creature card with mana value up to its power; a Hero enters with an additional +1/+1 counter", () => {
    let { s, ap, opp } = setup([]);
    const w = putOnBattlefield(s, ap, winter());
    const h = into(s, ap, hero, "graveyard");
    s = attack(s, ap, [{ attacker: w, defender: opp }]);
    expect(s.pending?.kind).toBe("chooseTargets");
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(h)] });
    s = settle(s, { me: ap });
    expect(zone(s, h)).toBe("battlefield");
    expect(s.objects[h]!.counters["+1/+1"]).toBe(1);
  });

  it("a creature card that isn't a Hero enters with no counter", () => {
    let { s, ap, opp } = setup([]);
    const w = putOnBattlefield(s, ap, winter());
    const k = into(s, ap, knight, "graveyard");
    s = attack(s, ap, [{ attacker: w, defender: opp }]);
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(k)] });
    s = settle(s, { me: ap });
    expect(zone(s, k)).toBe("battlefield");
    expect(s.objects[k]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});

/** Attacks `opp` with Willie, unblocked, until the opponent is asked whether to draw. */
const toTheirMay = (s: GameState, ap: PlayerId, w: ObjectId, opp: PlayerId) => {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: w, defender: opp }] });
  for (let i = 0; i < 80 && !(s.pending?.kind === "chooseMay" && s.pending.player === opp); i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p) s = act(s, botActions(s, p.player)[0]!);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
describe("round 233: Willie Lumpkin, Postman", () => {
  it("you draw; if that player draws too, they can't attack you during their next turn", () => {
    let { s, ap, opp } = setup([]);
    const w = putOnBattlefield(s, ap, willie());
    const hand = s.players[ap]!.hand.length;
    const theirs = s.players[opp]!.hand.length;
    s = toTheirMay(s, ap, w, opp);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp });
    expect((s.pending as { otherwise?: string }).otherwise).toMatch(/can't attack/);
    s = act(s, { type: "chooseMay", player: opp, yes: true });
    s = settle(s, { me: ap });
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.players[opp]!.hand.length).toBe(theirs + 1);
    expect(s.players[opp]!.attackBansNextTurn?.some((b) => b.player === ap)).toBe(true);
  });

  it("if that player doesn't draw, nothing stops them attacking", () => {
    let { s, ap, opp } = setup([]);
    const w = putOnBattlefield(s, ap, willie());
    const theirs = s.players[opp]!.hand.length;
    s = toTheirMay(s, ap, w, opp);
    s = act(s, { type: "chooseMay", player: opp, yes: false });
    s = settle(s, { me: ap });
    expect(s.players[opp]!.hand.length).toBe(theirs);
    expect(s.players[opp]!.attackBansNextTurn ?? []).toHaveLength(0);
  });
});

describe("round 233: Daredevil, Man Without Fear", () => {
  it("exiles the top card when you attack; a Hero card gives +2/+1, and the card may be played this turn", () => {
    let { s, ap, opp } = setup([]);
    const d = putOnBattlefield(s, ap, daredevil());
    const top = into(s, ap, hero, "library");
    s = attack(s, ap, [{ attacker: d, defender: opp }]);
    expect(s.pending?.kind).toBe("chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = settle(s, { me: ap });
    expect(zone(s, top)).toBe("exile");
    expect([power(s, s.objects[d]!), toughness(s, s.objects[d]!)]).toEqual([5, 5]);
    expect(s.objects[top]!.mayPlay).toMatchObject({ player: ap, until: "thisTurn" });
  });

  it("a card that isn't a Hero card: no bonus, still playable; declining exiles nothing", () => {
    let { s, ap, opp } = setup([]);
    const d = putOnBattlefield(s, ap, daredevil());
    const top = into(s, ap, knight, "library");
    s = attack(s, ap, [{ attacker: d, defender: opp }]);
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = settle(s, { me: ap });
    expect(zone(s, top)).toBe("exile");
    expect([power(s, s.objects[d]!), toughness(s, s.objects[d]!)]).toEqual([3, 4]);
    expect(s.objects[top]!.mayPlay).toMatchObject({ player: ap });

    let t = setup([]);
    const d2 = putOnBattlefield(t.s, t.ap, daredevil());
    const top2 = into(t.s, t.ap, hero, "library");
    let s2 = attack(t.s, t.ap, [{ attacker: d2, defender: t.opp }]);
    s2 = act(s2, { type: "chooseMay", player: t.ap, yes: false });
    s2 = settle(s2, { me: t.ap });
    expect(zone(s2, top2)).toBe("library");
    expect([power(s2, s2.objects[d2]!), toughness(s2, s2.objects[d2]!)]).toEqual([3, 4]);
  });
});

describe("round 233: Tamiyo, Seasoned Scholar", () => {
  const scholar = (s: GameState, ap: PlayerId) => {
    const t = putOnBattlefield(s, ap, tamiyo());
    s.objects[t]!.face = 1;
    s.objects[t]!.counters.loyalty = 5;
    invalidateCharacteristics(s);
    return t;
  };
  const minus3 = (s: GameState, t: ObjectId) => abilitiesOf(s, s.objects[t]!).activated.findIndex((a) => /^−3/.test(a.text) || a.loyalty === -3);

  it("−3 returns a green instant to your hand and adds one mana of any color", () => {
    let { s, ap } = setup([]);
    const t = scholar(s, ap);
    const g = into(s, ap, greenSpell, "graveyard");
    s = run(s, planActivate(s, ap, t, minus3(s, t), [tgt(g)]));
    s = settle(s, { me: ap });
    expect(zone(s, g)).toBe("hand");
    expect(s.pending).toMatchObject({ kind: "manaMix", player: ap, n: 1 });
    s = act(s, { type: "manaMix", player: ap, counts: { B: 1 } });
    expect(s.players[ap]!.manaPool.B).toBe(1);
    expect(s.objects[t]!.counters.loyalty).toBe(2);
  });

  it("a card that isn't green adds no mana", () => {
    let { s, ap } = setup([]);
    const t = scholar(s, ap);
    const b = into(s, ap, blueSpell, "graveyard");
    s = run(s, planActivate(s, ap, t, minus3(s, t), [tgt(b)]));
    s = settle(s, { me: ap });
    expect(zone(s, b)).toBe("hand");
    expect(s.pending).toBeNull();
    expect(Object.values(s.players[ap]!.manaPool).reduce((a, n) => a + (n ?? 0), 0)).toBe(0);
  });
});

describe("round 233: Make Your Own Luck", () => {
  it("exiles a nonland card from the top three, plotted (cast free on a later turn); the rest go to your hand", () => {
    let { s, ap, ids } = setup([luck()]);
    const [a, b, c] = [into(s, ap, ogre, "library"), into(s, ap, card("Forest", "Basic Land — Forest"), "library"), into(s, ap, pebble, "library")];
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s, { me: ap });
    expect(s.pending?.kind).toBe("searchLibrary");
    const pend = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    // Only the nonland cards can be exiled.
    expect([...pend.cards!].sort()).toEqual([a, c].sort());
    s = act(s, { type: "searchLibrary", player: ap, found: [a] });
    s = settle(s, { me: ap });
    expect(zone(s, a)).toBe("exile");
    expect(s.objects[a]!.mayPlay).toMatchObject({ player: ap, until: "plot" });
    expect(zone(s, b)).toBe("hand");
    expect(zone(s, c)).toBe("hand");
    // Not this turn (CR 702.170d); on a later turn of yours, without paying its mana cost.
    expect(planCast(s, ap, a)).toBeNull();
    trimHand(s, ap);
    s = passUntil(s, "main1", ap);
    s = passUntil(s, "upkeep");
    s = passUntil(s, "main1", ap);
    poolOnly(s, ap, {});
    s = run(s, planCast(s, ap, a));
    s = settle(s, { me: ap });
    expect(zone(s, a)).toBe("battlefield");
  });
});

describe("round 233: Scourge of Nel Toth", () => {
  it("is cast from your graveyard for {B}{B} and two creatures sacrificed, rather than its mana cost", () => {
    let { s, ap } = setup([]);
    const sc = into(s, ap, scourge(), "graveyard");
    const [x, y] = [putOnBattlefield(s, ap, bear()), putOnBattlefield(s, ap, bear())];
    expect(graveyardWays(s, s.objects[sc]!).map((g) => g.kind)).toEqual(["permission"]);
    poolOnly(s, ap, { B: 2 });
    s = run(s, planCast(s, ap, sc, undefined, undefined, undefined, undefined, { via: "permission", sacrifice: [x, y] }));
    expect(zone(s, x)).toBe("graveyard");
    expect(zone(s, y)).toBe("graveyard");
    expect(s.players[ap]!.manaPool.B ?? 0).toBe(0);
    s = settle(s, { me: ap });
    expect(zone(s, sc)).toBe("battlefield");
  });

  it("can't be cast that way without two creatures to sacrifice", () => {
    const { s, ap } = setup([]);
    const sc = into(s, ap, scourge(), "graveyard");
    putOnBattlefield(s, ap, bear());
    poolOnly(s, ap, { B: 2 });
    expect(planCast(s, ap, sc, undefined, undefined, undefined, undefined, { via: "permission" })).toBeNull();
  });
});

describe("round 233: The Grim Captain's Locker", () => {
  const escapeAbility = (s: GameState, id: ObjectId) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => /Escape/.test(a.text));

  it("until end of turn, each creature card in your graveyard escapes for {3}{B} and four other cards", () => {
    let { s, ap } = setup([]);
    const l = putOnBattlefield(s, ap, locker());
    const o = into(s, ap, ogre, "graveyard");
    const fodder = [pebble, pebble, pebble, pebble].map((d) => into(s, ap, d, "graveyard"));
    expect(graveyardWays(s, s.objects[o]!)).toEqual([]);
    s = run(s, planActivate(s, ap, l, escapeAbility(s, l)));
    s = settle(s, { me: ap });
    const ways = graveyardWays(s, s.objects[o]!);
    expect(ways).toMatchObject([{ kind: "grantedEscape", mana: "{3}{B}", costs: [{ kind: "exileFromGraveyard", n: 4 }] }]);
    // A noncreature card gets nothing.
    expect(graveyardWays(s, s.objects[fodder[0]!]!)).toEqual([]);
    poolOnly(s, ap, { B: 1, C: 3 });
    expect(planCast(s, ap, o, undefined, undefined, undefined, undefined, { via: "grantedEscape", exileCards: fodder.slice(0, 3) })).toBeNull();
    s = run(s, planCast(s, ap, o, undefined, undefined, undefined, undefined, { via: "grantedEscape", exileCards: fodder }));
    expect(fodder.map((id) => zone(s, id))).toEqual(["exile", "exile", "exile", "exile"]);
    s = settle(s, { me: ap });
    expect(zone(s, o)).toBe("battlefield");
    expect(s.objects[o]!.escaped).toBe(true);
  });

  it("only the cards there as it resolves, and only this turn (CR 611.2c, 514.2)", () => {
    let { s, ap } = setup([]);
    const l = putOnBattlefield(s, ap, locker());
    const o = into(s, ap, ogre, "graveyard");
    s = run(s, planActivate(s, ap, l, escapeAbility(s, l)));
    s = settle(s, { me: ap });
    const later = into(s, ap, ogre, "graveyard");
    expect(graveyardWays(s, s.objects[later]!)).toEqual([]);
    expect(graveyardWays(s, s.objects[o]!)).toHaveLength(1);
    trimHand(s, ap);
    s = passUntil(s, "upkeep");
    expect(graveyardWays(s, s.objects[o]!)).toEqual([]);
  });
});

describe("round 233: Falkenrath Gorger", () => {
  it("a Vampire creature card you discard has madness for its mana cost", () => {
    let { s, ap, opp } = setup([vampire, knight]);
    putOnBattlefield(s, ap, gorger());
    const [v, k] = s.players[ap]!.hand.slice(-2) as [string, string];
    discardCards(s, ap, [v, k]);
    closeZoneBatch(s);
    expect(zone(s, v)).toBe("exile");
    expect(zone(s, k)).toBe("graveyard");
    s = settle(s, { me: ap });
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: v, how: "madness" });
    poolOnly(s, ap, { R: 1, C: 1 });
    s = run(s, planCast(s, ap, v));
    expect(zone(s, v)).toBe("stack");
    s = settle(s, { me: ap });
    expect(zone(s, v)).toBe("battlefield");
    // An opponent's Vampire card gets nothing from your Gorger.
    const theirs = into(s, opp, vampire, "hand");
    discardCards(s, opp, [theirs]);
    expect(zone(s, theirs)).toBe("graveyard");
  });

  it("without the Gorger on the battlefield, a Vampire card is discarded as usual", () => {
    const { s, ap } = setup([vampire]);
    const v = s.players[ap]!.hand.at(-1)!;
    discardCards(s, ap, [v]);
    expect(zone(s, v)).toBe("graveyard");
  });
});

describe("round 233: Reckless Blaze", () => {
  it("5 damage to each creature; {R} for each creature of yours dealt damage this way that dies this turn", () => {
    let { s, ap, opp, ids } = setup([blaze()]);
    const mine1 = putOnBattlefield(s, ap, bear());
    const mine2 = putOnBattlefield(s, ap, knight);
    const big = putOnBattlefield(s, ap, card("Test Giant", "Creature — Giant", "{6}", { power: "7", toughness: "7" }));
    const theirs = putOnBattlefield(s, opp, bear());
    poolOnly(s, ap, { R: 2, C: 3 });
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s, { me: ap });
    expect([mine1, mine2, theirs].map((id) => zone(s, id))).toEqual(["graveyard", "graveyard", "graveyard"]);
    expect(zone(s, big)).toBe("battlefield");
    expect(s.players[ap]!.manaPool.R).toBe(2);
    // The Giant was dealt damage this way too: when it dies later this turn, another {R}.
    destroyPermanent(s, s.objects[big]!, "The Giant is destroyed.");
    closeZoneBatch(s);
    s = settle(s, { me: ap });
    expect(s.players[ap]!.manaPool.R).toBe(3);
  });
});

describe("round 233: Sunder the Gateway", () => {
  it("second mode: incubate 2, then transform an Incubator token you control, the new one or another (rulings)", () => {
    let { s, ap, opp, ids } = setup([sunder(), sunder()]);
    const r = putOnBattlefield(s, opp, relic);
    poolOnly(s, ap, { W: 2, C: 2 });
    s = run(s, planCast(s, ap, ids[0]!, [tgt(r)], [0]));
    s = settle(s, { me: ap });
    const [older] = mine(s, ap, "Incubator Token");
    s = run(s, planCast(s, ap, ids[1]!, [], [1]));
    s = settle(s, { me: ap });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap });
    const incubators = mine(s, ap, "Incubator Token");
    expect(incubators).toHaveLength(2);
    // The one it didn't just make.
    s = act(s, { type: "pickPermanents", player: ap, ids: [older!] });
    s = settle(s, { me: ap });
    const it0 = s.objects[older!]!;
    const c = characteristics(s, it0);
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(c.subtypes).toContain("Phyrexian");
    expect([power(s, it0), toughness(s, it0)]).toEqual([2, 2]);
    expect(mine(s, ap, "Incubator Token")).toHaveLength(1);
  });

  it("second mode with only the new Incubator: that one transforms", () => {
    let { s, ap, ids } = setup([sunder()]);
    poolOnly(s, ap, { W: 1, C: 1 });
    s = run(s, planCast(s, ap, ids[0]!, [], [1]));
    s = settle(s, { me: ap });
    expect(mine(s, ap, "Incubator Token")).toHaveLength(0);
    const [phy] = mine(s, ap, "Phyrexian Token");
    expect([power(s, s.objects[phy!]!), toughness(s, s.objects[phy!]!)]).toEqual([2, 2]);
  });

  it("first mode: destroys the artifact and incubates, transforming nothing", () => {
    let { s, ap, opp, ids } = setup([sunder()]);
    const r = putOnBattlefield(s, opp, relic);
    poolOnly(s, ap, { W: 1, C: 1 });
    s = run(s, planCast(s, ap, ids[0]!, [tgt(r)], [0]));
    s = settle(s, { me: ap });
    expect(zone(s, r)).toBe("graveyard");
    const inc = mine(s, ap, "Incubator Token");
    expect(inc).toHaveLength(1);
    expect(characteristics(s, s.objects[inc[0]!]!).types).toEqual(["Artifact"]);
  });
});

describe("round 233: Neriv, Crackling Vanguard", () => {
  const tok = (s: GameState, pid: PlayerId, name: string) => {
    const id = putOnBattlefield(s, pid, card(name, `Creature — ${name.replace(/ Token$/, "")}`, "", { power: "1", toughness: "1" }));
    s.objects[id]!.isToken = true;
    return id;
  };

  it("exiles a card for each differently named token; playable only during a turn you attacked with a commander", () => {
    let { s, ap, opp } = setup([]);
    const n = putOnBattlefield(s, ap, neriv());
    tok(s, ap, "Goblin Token");
    tok(s, ap, "Goblin Token");
    tok(s, ap, "Elf Token");
    const cmdr = putOnBattlefield(s, ap, card("Test Leader", "Legendary Creature — Human", "{1}{W}", { power: "2", toughness: "2" }), { commander: true });
    const [a, b] = [into(s, ap, pebble, "library"), into(s, ap, ogre, "library")];
    s = attack(s, ap, [{ attacker: n, defender: opp }, { attacker: cmdr, defender: opp }]);
    s = settle(s, { me: ap });
    expect([zone(s, a), zone(s, b)]).toEqual(["exile", "exile"]);
    expect(s.objects[a]!.mayPlay).toMatchObject({ player: ap, until: "exiled", attackedWithCommander: true });
    // This turn they attacked with a commander: Test Pebble (an instant) can be cast now.
    poolOnly(s, ap, { C: 2 });
    expect(planCast(s, ap, a)).not.toBeNull();
  });

  it("not in a turn you attacked without a commander", () => {
    let { s, ap, opp } = setup([]);
    const n = putOnBattlefield(s, ap, neriv());
    tok(s, ap, "Goblin Token");
    const a = into(s, ap, pebble, "library");
    s = attack(s, ap, [{ attacker: n, defender: opp }]);
    s = settle(s, { me: ap });
    expect(zone(s, a)).toBe("exile");
    poolOnly(s, ap, { C: 2 });
    expect(planCast(s, ap, a)).toBeNull();
  });
});

describe("round 233: Ethereal Valkyrie", () => {
  it("draws, then exiles a card from your hand face down, foretold for its mana cost less {2}, cast on a later turn", () => {
    let { s, ap, ids } = setup([valkyrie(), ogre]);
    const o = ids[1]!;
    poolOnly(s, ap, { W: 1, U: 1, C: 4 });
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s, { me: ap });
    expect(s.pending?.kind).toBe("searchLibrary");
    s = act(s, { type: "searchLibrary", player: ap, found: [o] });
    s = settle(s, { me: ap });
    expect(zone(s, o)).toBe("exile");
    expect(s.objects[o]!.foretold).toBe(true);
    expect(s.objects[o]!.mayPlay).toMatchObject({ player: ap, until: "foretell", foretellReduce: 2 });
    expect(foretellCostOf(s, s.objects[o]!)).toBe("{B}");
    // Not the turn it was foretold (CR 702.143a).
    poolOnly(s, ap, { B: 1 });
    expect(castProblem(s, ap, o, undefined, undefined, undefined, undefined, undefined, { alt: "foretell" })).toBeTruthy();
    trimHand(s, ap);
    s = passUntil(s, "upkeep");
    s = passUntil(s, "main1", ap);
    poolOnly(s, ap, { B: 1 });
    s = run(s, planCast(s, ap, o, undefined, undefined, undefined, undefined, { alt: "foretell" }));
    s = settle(s, { me: ap });
    expect(zone(s, o)).toBe("battlefield");
  });

  it("a card with foretell of its own has both costs: the cheaper one is used (rulings)", () => {
    const own = card("Test Foretold", "Creature — Spirit", "{4}{U}", { power: "3", toughness: "3", keywords: ["Foretell"], oracleText: "Foretell {3}{U}" });
    const cheap = card("Test Cheap Foretold", "Creature — Spirit", "{4}{U}", { power: "3", toughness: "3", keywords: ["Foretell"], oracleText: "Foretell {U}" });
    const { s, ap } = setup([own, cheap]);
    const [a, b] = s.players[ap]!.hand.slice(-2) as [string, string];
    for (const id of [a, b]) {
      const p = s.players[ap]!;
      p.hand.splice(p.hand.indexOf(id), 1);
      p.exile.push(id);
      s.objects[id]!.zone = "exile";
      s.objects[id]!.foretold = true;
      s.objects[id]!.mayPlay = { player: ap, zc: s.objects[id]!.zoneChanges ?? 0, until: "foretell", turn: s.turn, foretellReduce: 2 };
    }
    expect(foretellCostOf(s, s.objects[a]!)).toBe("{2}{U}");
    expect(foretellCostOf(s, s.objects[b]!)).toBe("{U}");
  });
});
