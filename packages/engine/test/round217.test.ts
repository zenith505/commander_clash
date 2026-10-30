// Round 217: Contagious Vorrac, Borrowed Knowledge, Everything Pizza, Embermouth Sentinel, Thought-Stalker Warlock, Duel for
// Dominance, Mortarion, Zaffai, Gor Muldrak, Wail of the Forgotten, Ill-Gotten Gains, Lagorin, Ogre-Head Helm, Farideh, Full
// Bore, Waking the Trolls, Glorfindel, Auriok Steelshaper, Voyager Glidecar, Renegade Bull, Startled Awake (the "next fresh
// candidates" after round 215 and fresh cards from EDHREC rank 14,000 on).

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passUntil, putOnBattlefield, setup } from "./helpers";
import { rollDice } from "../src/effects/run-dice";
import { putCounters } from "../src/counters";
import { abilitiesOf, applyAction, botActions, characteristics, controllerOf, dealDamage, invalidateCharacteristics, isFullySupported, isLegalTarget, objectSource, objHasKeyword, planActivate, planCast, power, runStateBasedActions, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
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
/** Like settle, but goes on passing until `step` (answering what settle answers). */
const settleTo = (s: GameState, step: GameState["step"], opts: { may?: boolean; targets?: TargetChoice[]; me?: PlayerId } = {}) => {
  for (let i = 0; i < 300 && s.step !== step; i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p) {
      s = settle(s, opts);
      if (s.pending) return s;
    } else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return settle(s, opts);
};
const pt = (s: GameState, id: ObjectId) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const emptyHand = (s: GameState, pid: PlayerId) => s.players[pid]!.hand.splice(0).forEach((id) => (s.objects[id]!.zone = "exile"));
const handOf = (s: GameState, pid: PlayerId, n: number) => Array.from({ length: n }, (_, i) => into(s, pid, bear({ name: `Hand Bear ${i}` }), "hand"));

// Real oracle text (Scryfall).
const contagiousVorr = card("Contagious Vorrac", "Creature — Phyrexian Boar Beast", "{2}{G}", {"cmc":3,"oracleText":"When this creature enters, look at the top four cards of your library. You may reveal a land card from among them and put it into your hand. Put the rest on the bottom of your library in a random order. If you didn't put a card into your hand this way, proliferate. (Choose any number of permanents and/or players, then give each another counter of each kind already there.)","power":"3","toughness":"3","keywords":["Proliferate"],"layout":"normal"});
const borrowedKnowle = card("Borrowed Knowledge", "Sorcery", "{2}{R}{W}", {"cmc":4,"oracleText":"Choose one —\n• Discard your hand, then draw cards equal to the number of cards in target opponent's hand.\n• Discard your hand, then draw cards equal to the number of cards discarded this way.","keywords":[],"layout":"normal"});
const everythingPizz = card("Everything Pizza", "Artifact — Food", "{2}", {"cmc":2,"oracleText":"When this artifact enters, search your library for a basic land card, reveal it, put it into your hand, then shuffle.\n{2}{W}{U}{B}{R}{G}, {T}, Sacrifice this artifact: Target player gains 3 life and draws a card. Each of your opponents discards a card. This artifact deals 3 damage to any target. Put three +1/+1 counters on up to one target creature.","keywords":[],"layout":"normal"});
const embermouthSent = card("Embermouth Sentinel", "Artifact Creature — Chimera", "{2}", {"cmc":2,"oracleText":"When this creature enters, you may search your library for a basic land card, reveal it, then shuffle and put that card on top. If you control a Dragon, put that card onto the battlefield tapped instead.","power":"2","toughness":"1","keywords":[],"layout":"normal"});
const thoughtstalker = card("Thought-Stalker Warlock", "Creature — Lizard Warlock", "{2}{B}", {"cmc":3,"oracleText":"Menace (This creature can't be blocked except by two or more creatures.)\nWhen this creature enters, choose target opponent. If they lost life this turn, they reveal their hand, you choose a nonland card from it, and they discard that card. Otherwise, they discard a card.","power":"2","toughness":"2","keywords":["Menace"],"layout":"normal"});
const duelForDominan = card("Duel for Dominance", "Instant", "{1}{G}", {"cmc":2,"oracleText":"Coven — Choose target creature you control and target creature you don't control. If you control three or more creatures with different powers, put a +1/+1 counter on the chosen creature you control. Then the chosen creatures fight each other. (Each deals damage equal to its power to the other.)","keywords":["Fight","Coven"],"layout":"normal"});
const mortarionDaemo = card("Mortarion, Daemon Primarch", "Legendary Creature — Demon Primarch", "{5}{B}", {"cmc":6,"oracleText":"Flying\nPrimarch of the Death Guard — At the beginning of your end step, you may pay {X}. If you do, create X 2/2 black Astartes Warrior creature tokens with menace. X can't be greater than the amount of life you lost this turn.","power":"5","toughness":"6","keywords":["Flying","Primarch of the Death Guard"],"layout":"normal"});
const zaffaiThunderC = card("Zaffai, Thunder Conductor", "Legendary Creature — Human Shaman", "{2}{U}{R}", {"cmc":4,"oracleText":"Magecraft — Whenever you cast or copy an instant or sorcery spell, scry 1. If that spell's mana value is 5 or greater, create a 4/4 blue and red Elemental creature token. If that spell's mana value is 10 or greater, Zaffai deals 10 damage to an opponent chosen at random.","power":"1","toughness":"4","keywords":["Magecraft","Scry"],"layout":"normal"});
const gorMuldrakAmph = card("Gor Muldrak, Amphinologist", "Legendary Creature — Human Scout", "{1}{G}{U}", {"cmc":3,"oracleText":"You and permanents you control have protection from Salamanders.\nAt the beginning of your end step, each player who controls the fewest creatures creates a 4/3 blue Salamander Warrior creature token.","power":"3","toughness":"2","keywords":[],"layout":"normal"});
const wailOfTheForgo = card("Wail of the Forgotten", "Sorcery", "{U}{B}", {"cmc":2,"oracleText":"Descend 8 — Choose one. If there are eight or more permanent cards in your graveyard as you cast this spell, choose one or more instead.\n• Return target nonland permanent to its owner's hand.\n• Target opponent discards a card.\n• Look at the top three cards of your library. Put one of them into your hand and the rest into your graveyard.","keywords":["Descend"],"layout":"normal"});
const illgottenGains = card("Ill-Gotten Gains", "Sorcery", "{2}{B}{B}", {"cmc":4,"oracleText":"Exile Ill-Gotten Gains. Each player discards their hand, then returns up to three cards from their graveyard to their hand.","keywords":[],"layout":"normal"});
const lagorinSoulOfA = card("Lagorin, Soul of Alacria", "Legendary Creature — Beast Mount", "{G}{W}", {"cmc":2,"oracleText":"Flying\nWhenever Lagorin attacks while saddled, put a +1/+1 counter on each of up to two target Mounts and/or Vehicles.\nSaddle 1 (Tap any number of other creatures you control with total power 1 or more: This Mount becomes saddled until end of turn. Saddle only as a sorcery.)","power":"1","toughness":"1","keywords":["Flying","Saddle"],"layout":"normal"});
const ogreheadHelm = card("Ogre-Head Helm", "Artifact Creature — Equipment Ogre", "{1}{R}", {"cmc":2,"oracleText":"Equipped creature gets +2/+2.\nWhenever this creature or equipped creature deals combat damage to a player, you may sacrifice it. If you do, discard your hand, then draw three cards.\nReconfigure {3} ({3}: Attach to target creature you control; or unattach from a creature. Reconfigure only as a sorcery. While attached, this isn't a creature.)","power":"2","toughness":"2","keywords":["Reconfigure"],"layout":"normal"});
const faridehDevilsC = card("Farideh, Devil's Chosen", "Legendary Creature — Tiefling Warlock", "{2}{U}{R}", {"cmc":4,"oracleText":"Dark One's Own Luck — Whenever you roll one or more dice, Farideh gains flying and menace until end of turn. If any of those results was 10 or higher, draw a card.","power":"3","toughness":"3","keywords":[],"layout":"normal"});
const fullBore = card("Full Bore", "Instant", "{R}", {"cmc":1,"oracleText":"Target creature you control gets +3/+2 until end of turn. If that creature was cast for its warp cost, it also gains trample and haste until end of turn.","keywords":[],"layout":"normal"});
const wakingTheTroll = card("Waking the Trolls", "Enchantment — Saga", "{4}{R}{G}", {"cmc":6,"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Destroy target land.\nII — Put target land card from a graveyard onto the battlefield under your control.\nIII — Choose target opponent. If they control fewer lands than you, create a number of 4/4 green Troll Warrior creature tokens with trample equal to the difference.","keywords":[],"layout":"saga"});
const glorfindelDaun = card("Glorfindel, Dauntless Rescuer", "Legendary Creature — Elf Noble", "{2}{G}", {"cmc":3,"oracleText":"Whenever you scry, choose one and Glorfindel gets +1/+1 until end of turn.\n• Glorfindel must be blocked this turn if able.\n• Glorfindel can't be blocked by more than one creature each combat this turn.","power":"3","toughness":"2","keywords":[],"layout":"normal"});
const auriokSteelsha = card("Auriok Steelshaper", "Creature — Human Soldier", "{1}{W}", {"cmc":2,"oracleText":"Equip costs you pay cost {1} less.\nAs long as this creature is equipped, each creature you control that's a Soldier or a Knight gets +1/+1.","power":"1","toughness":"1","keywords":[],"layout":"normal"});
const voyagerGlideca = card("Voyager Glidecar", "Artifact — Vehicle", "{W}", {"cmc":1,"oracleText":"When this Vehicle enters, scry 1.\nTap three other untapped creatures you control: Until end of turn, this Vehicle becomes an artifact creature and gains flying. Put a +1/+1 counter on it.\nCrew 1","power":"2","toughness":"3","keywords":["Crew","Scry"],"layout":"normal"});
const renegadeBull = card("Renegade Bull", "Creature — Ox", "{4}{R}", {"cmc":5,"oracleText":"Trample\nWhenever you cast an instant or sorcery spell, this creature gets +X/+0 until end of turn, where X is that spell's mana value.\nWhenever this creature attacks, exile up to one target instant or sorcery card from your graveyard and copy it. You may cast the copy without paying its mana cost.","power":"0","toughness":"5","keywords":["Trample"],"layout":"normal"});
const startledAwakeu = card("Startled Awake // Persistent Nightmare", "Sorcery // Creature — Nightmare", "{2}{U}{U}", {"cmc":4,"oracleText":"Target opponent mills thirteen cards.\n{3}{U}{U}: Put this card from your graveyard onto the battlefield transformed. Activate only as a sorcery.","keywords":["Skulk","Transform","Mill"],"faces":[{"name":"Startled Awake","manaCost":"{2}{U}{U}","typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target opponent mills thirteen cards.\n{3}{U}{U}: Put this card from your graveyard onto the battlefield transformed. Activate only as a sorcery.","colors":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/e/6/e630fc56-a96f-4abf-be8d-f0f40d5a9edf.jpg?1783937793","artUrl":"https://cards.scryfall.io/art_crop/front/e/6/e630fc56-a96f-4abf-be8d-f0f40d5a9edf.jpg?1783937793"},{"name":"Persistent Nightmare","manaCost":"","typeLine":"Creature — Nightmare","supertypes":[],"types":["Creature"],"subtypes":["Nightmare"],"oracleText":"Skulk (This creature can't be blocked by creatures with greater power.)\nWhen this creature deals combat damage to a player, return it to its owner's hand.","power":"1","toughness":"1","colors":["U"],"colorIndicator":["U"],"imageUrl":"https://cards.scryfall.io/normal/back/e/6/e630fc56-a96f-4abf-be8d-f0f40d5a9edf.jpg?1783937793","artUrl":"https://cards.scryfall.io/art_crop/back/e/6/e630fc56-a96f-4abf-be8d-f0f40d5a9edf.jpg?1783937793"}],"layout":"transform"});

describe("round 217 cards", () => {
  it("compile", () =>
    supported(contagiousVorr, borrowedKnowle, everythingPizz, embermouthSent, thoughtstalker, duelForDominan, mortarionDaemo, zaffaiThunderC, gorMuldrakAmph, wailOfTheForgo, illgottenGains, lagorinSoulOfA, ogreheadHelm, faridehDevilsC, fullBore, wakingTheTroll, glorfindelDaun, auriokSteelsha, voyagerGlideca, renegadeBull, startledAwakeu));
});

describe("Contagious Vorrac", () => {
  it("proliferates only if you didn't put a land card into your hand", () => {
    for (const take of [true, false]) {
      const { s: s0, ap, ids } = setup([contagiousVorr]);
      const b = putOnBattlefield(s0, ap, bear({ name: "Counter Bear" }));
      s0.objects[b]!.counters["+1/+1"] = 1;
      for (let i = 0; i < 3; i++) into(s0, ap, bear({ name: `Top Bear ${i}` }), "library");
      const land = into(s0, ap, card("Top Forest", "Basic Land — Forest"), "library");
      let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: ap });
      expect(s.pending?.kind).toBe("searchLibrary");
      s = settle(act(s, { type: "searchLibrary", player: ap, found: take ? [land] : [] }), { me: ap });
      expect(zone(s, land)).toBe(take ? "hand" : "library");
      expect(s.objects[b]!.counters["+1/+1"]).toBe(take ? 1 : 2);
    }
  });
});

describe("Borrowed Knowledge", () => {
  it("discards your hand, then draws as many as the target opponent's hand or as you discarded", () => {
    for (const mode of [0, 1]) {
      const { s: s0, ap, ids, opp } = setup([borrowedKnowle]);
      const spell = ids[0]!;
      s0.players[ap]!.hand.filter((id) => id !== spell).forEach((id) => (s0.objects[id]!.zone = "exile"));
      s0.players[ap]!.hand = [spell];
      const mine = handOf(s0, ap, 3);
      emptyHand(s0, opp);
      handOf(s0, opp, 5);
      const before = s0.players[ap]!.library.length;
      const s = settle(run(s0, planCast(s0, ap, spell, mode === 0 ? [ply(opp)] : [], [mode])), { me: ap });
      expect(mine.every((id) => zone(s, id) === "graveyard")).toBe(true);
      expect(s.players[ap]!.hand.length).toBe(mode === 0 ? 5 : 3);
      expect(before - s.players[ap]!.library.length).toBe(mode === 0 ? 5 : 3);
    }
  });
});

describe("Everything Pizza", () => {
  it("gains and draws for target player, makes each opponent discard, deals 3 damage and puts counters on up to one creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const pizza = putOnBattlefield(s0, ap, everythingPizz);
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const opps = s0.turnOrder.filter((p) => p !== ap);
    const hands = opps.map((p) => s0.players[p]!.hand.length);
    const life = s0.players[ap]!.life;
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planActivate(s0, ap, pizza, 0, [ply(ap), tgt(theirs), tgt(mine)])), { me: ap });
    expect(zone(s, pizza)).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(life + 3);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    opps.forEach((p, i) => expect(s.players[p]!.hand.length).toBe(hands[i]! - 1));
    expect(zone(s, theirs)).toBe("graveyard");
    expect(s.objects[mine]!.counters["+1/+1"]).toBe(3);
  });
});

describe("Embermouth Sentinel", () => {
  it("puts the basic land on top, or onto the battlefield tapped if you control a Dragon", () => {
    for (const dragon of [false, true]) {
      const { s: s0, ap, ids } = setup([embermouthSent]);
      if (dragon) putOnBattlefield(s0, ap, card("My Dragon", "Creature — Dragon", "{4}{R}", { power: "4", toughness: "4" }));
      const land = s0.players[ap]!.library.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Forest")!;
      let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: ap });
      expect(s.pending?.kind).toBe("searchLibrary");
      s = settle(act(s, { type: "searchLibrary", player: ap, found: [land] }), { me: ap });
      if (dragon) {
        expect(zone(s, land)).toBe("battlefield");
        expect(s.objects[land]!.tapped).toBe(true);
      } else expect(s.players[ap]!.library[0]).toBe(land);
    }
  });
});

describe("Thought-Stalker Warlock", () => {
  it("you choose a nonland card if they lost life this turn; otherwise they discard a card of their choice", () => {
    for (const lost of [true, false]) {
      const { s: s0, ap, ids, opp } = setup([thoughtstalker]);
      emptyHand(s0, opp);
      const [b1, b2] = handOf(s0, opp, 2);
      const land = into(s0, opp, forest, "hand");
      if (lost) s0.lostLifeThisTurn = [opp];
      let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: ap, targets: [ply(opp)] });
      if (lost) {
        expect(s.pending?.player).toBe(ap);
        s = settle(act(s, { type: "searchLibrary", player: ap, found: [b2!] }), { me: ap });
        expect(zone(s, b2!)).toBe("graveyard");
        expect(zone(s, b1!)).toBe("hand");
        expect(zone(s, land)).toBe("hand");
      } else {
        expect(s.players[opp]!.hand.length).toBe(2);
        expect(s.players[opp]!.graveyard.length).toBe(1);
      }
    }
  });
});

describe("Duel for Dominance", () => {
  it("puts a +1/+1 counter on your creature with coven, then the two fight", () => {
    for (const coven of [false, true]) {
      const { s: s0, ap, ids, opp } = setup([duelForDominan]);
      const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
      const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear", power: "2", toughness: "3" }));
      if (coven) {
        putOnBattlefield(s0, ap, bear({ name: "One", power: "1", toughness: "1" }));
        putOnBattlefield(s0, ap, bear({ name: "Three", power: "3", toughness: "3" }));
      }
      const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(mine), tgt(theirs)])), { me: ap });
      expect(s.objects[mine]!.counters["+1/+1"] ?? 0).toBe(coven ? 1 : 0);
      expect(zone(s, theirs)).toBe(coven ? "graveyard" : "battlefield");
      expect(zone(s, mine)).toBe(coven ? "battlefield" : "graveyard");
    }
  });
});

describe("Mortarion, Daemon Primarch", () => {
  it("pays X up to the life you lost this turn for X tokens", () => {
    const { s: s0, ap } = setup([]);
    emptyHand(s0, ap);
    const m = putOnBattlefield(s0, ap, mortarionDaemo);
    s0.players[ap]!.life -= 3;
    s0.turnLog = { ...(s0.turnLog ?? {}), lifeLost: { [ap]: 3 } } as GameState["turnLog"];
    let s = passUntil(s0, "end", ap);
    s = settle(s, { me: ap });
    expect(s.pending?.kind).toBe("chooseOption");
    const p = s.pending as Extract<GameState["pending"], { kind: "chooseOption" }>;
    expect(p.options).toEqual(["none", "0", "1", "2", "3"]);
    s.players[ap]!.manaPool.C = 2;
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "2" }), { me: ap });
    const tokens = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Astartes Warrior Token");
    expect(tokens.length).toBe(2);
    expect(objHasKeyword(s, s.objects[tokens[0]!]!, "Menace")).toBe(true);
    expect(m).toBeDefined();
  });
});

describe("Zaffai, Thunder Conductor", () => {
  const spell = (mv: number) => card(`Big Spell ${mv}`, "Sorcery", `{${mv}}`, { cmc: mv, oracleText: "You gain 1 life." });
  it("scries 1, makes an Elemental for mana value 5 or more and deals 10 damage to one opponent at random for 10 or more", () => {
    for (const mv of [4, 5, 10]) {
      const { s: s0, ap, ids } = setup([spell(mv)]);
      putOnBattlefield(s0, ap, zaffaiThunderC);
      s0.players[ap]!.manaPool.C = mv;
      const opps = s0.turnOrder.filter((p) => p !== ap);
      const life = opps.map((p) => s0.players[p]!.life);
      let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: ap });
      expect(s.pending?.kind).toBe("arrangeTop");
      const top = s.players[ap]!.library[0]!;
      s = settle(act(s, { type: "arrangeTop", player: ap, top: [top], away: [] }), { me: ap });
      const elementals = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Elemental Token");
      expect(elementals.length).toBe(mv >= 5 ? 1 : 0);
      const lost = opps.map((p, i) => life[i]! - s.players[p]!.life);
      expect(lost.filter((n) => n === 10).length).toBe(mv >= 10 ? 1 : 0);
      expect(lost.filter((n) => n !== 0 && n !== 10).length).toBe(0);
    }
  });
});

describe("Gor Muldrak, Amphinologist", () => {
  it("you and your permanents have protection from Salamanders; the players with the fewest creatures get a Salamander", () => {
    const { s: s0, ap, opp } = setup([]);
    emptyHand(s0, ap);
    const gor = putOnBattlefield(s0, ap, gorMuldrakAmph);
    const salamander = putOnBattlefield(s0, opp, card("Shock Salamander", "Creature — Salamander", "{R}", { power: "1", toughness: "1", oracleText: "{T}: This creature deals 1 damage to any target." }));
    const goblin = putOnBattlefield(s0, opp, card("Shock Goblin", "Creature — Goblin", "{R}", { power: "1", toughness: "1", oracleText: "{T}: This creature deals 1 damage to any target." }));
    // Not targetable by a Salamander's ability, you or your permanents; a Goblin's is fine.
    const any = abilitiesOf(s0, s0.objects[salamander]!).activated[0]!.body.targets[0]!;
    const from = (id: ObjectId) => objectSource(s0, s0.objects[id]!);
    expect(isLegalTarget(s0, any, ply(ap), opp, from(salamander))).toBe(false);
    expect(isLegalTarget(s0, any, tgt(gor), opp, from(salamander))).toBe(false);
    expect(isLegalTarget(s0, any, ply(ap), opp, from(goblin))).toBe(true);
    expect(isLegalTarget(s0, any, tgt(gor), opp, from(goblin))).toBe(true);
    // Damage from a Salamander to you is prevented, from others it isn't.
    const life = s0.players[ap]!.life;
    dealDamage(s0, objectSource(s0, s0.objects[salamander]!), { player: ap }, 3);
    expect(s0.players[ap]!.life).toBe(life);
    dealDamage(s0, objectSource(s0, s0.objects[goblin]!), { player: ap }, 1);
    expect(s0.players[ap]!.life).toBe(life - 1);
    // At your end step: you control one creature, the opponent two, the others none.
    const s = settle(passUntil(s0, "end", ap), { me: ap });
    const salamanders = (p: PlayerId) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === p && s.cards[s.objects[id]!.cardId]!.name === "Salamander Warrior Token").length;
    const others = s.turnOrder.filter((p) => p !== ap && p !== opp);
    expect(salamanders(ap)).toBe(0);
    expect(salamanders(opp)).toBe(0);
    others.forEach((p) => expect(salamanders(p)).toBe(1));
  });
});

describe("Wail of the Forgotten", () => {
  it("is choose one, or one or more with eight or more permanent cards in your graveyard as you cast it", () => {
    for (const eight of [false, true]) {
      const { s: s0, ap, ids, opp } = setup([wailOfTheForgo]);
      for (let i = 0; i < (eight ? 8 : 7); i++) into(s0, ap, bear({ name: `Dead Bear ${i}` }), "graveyard");
      into(s0, ap, card("Dead Bolt", "Instant", "{R}"), "graveyard");
      const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
      const oppHand = s0.players[opp]!.hand.length;
      const plan = planCast(s0, ap, ids[0]!, [tgt(theirs), ply(opp)], [0, 1]);
      if (!eight) {
        expect(plan).toBeNull();
        continue;
      }
      const s = settle(run(s0, plan), { me: ap });
      expect(zone(s, theirs)).toBe("hand");
      expect(s.players[opp]!.hand.length).toBe(oppHand);
      expect(s.players[opp]!.graveyard.length).toBe(1);
    }
  });
});

describe("Ill-Gotten Gains", () => {
  it("exiles itself; each player discards their hand, then returns up to three cards from their graveyard", () => {
    const { s: s0, ap, ids, opp } = setup([illgottenGains]);
    const spell = ids[0]!;
    s0.players[ap]!.hand.filter((id) => id !== spell).forEach((id) => (s0.objects[id]!.zone = "exile"));
    s0.players[ap]!.hand = [spell];
    const mine = handOf(s0, ap, 4);
    const old = into(s0, ap, bear({ name: "Old Bear" }), "graveyard");
    let s = settle(run(s0, planCast(s0, ap, spell)), { me: ap });
    expect(zone(s, spell)).toBe("exile");
    expect(s.pending?.kind).toBe("searchLibrary");
    const p = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    expect(p.max).toBe(3);
    expect(p.min).toBe(0);
    expect(p.cards).toContain(old);
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [old, mine[0]!, mine[1]!, mine[2]!] })).toThrow();
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [old, mine[0]!] }), { me: ap });
    expect(zone(s, old)).toBe("hand");
    expect(zone(s, mine[0]!)).toBe("hand");
    expect(zone(s, mine[3]!)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(2);
    // The opponents discarded their hands and took some back (the bots), at most three each.
    expect(s.players[opp]!.hand.length).toBeLessThanOrEqual(3);
  });
});

describe("Lagorin, Soul of Alacria", () => {
  it("while saddled, its attack puts a +1/+1 counter on each of up to two target Mounts and/or Vehicles", () => {
    const { s: s0, ap, opp } = setup([]);
    emptyHand(s0, ap);
    const lag = putOnBattlefield(s0, ap, lagorinSoulOfA);
    const mount = putOnBattlefield(s0, ap, card("My Mount", "Creature — Horse Mount", "{G}", { power: "2", toughness: "2" }));
    const vehicle = putOnBattlefield(s0, ap, card("My Vehicle", "Artifact — Vehicle", "{2}", { power: "3", toughness: "3" }));
    const b = putOnBattlefield(s0, ap, bear());
    // A bear is neither.
    const spec = abilitiesOf(s0, s0.objects[lag]!).triggers[0]!.body.targets[0]!;
    expect(isLegalTarget(s0, spec, tgt(b), ap)).toBe(false);
    expect(isLegalTarget(s0, spec, tgt(vehicle), ap)).toBe(true);
    expect(isLegalTarget(s0, spec, tgt(mount), ap)).toBe(true);
    s0.objects[lag]!.saddled = true;
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: lag, defender: opp }] });
    s = settle(s, { me: ap, targets: [tgt(mount), tgt(vehicle)] });
    expect(s.objects[mount]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[vehicle]!.counters["+1/+1"]).toBe(1);
  });
});

describe("Ogre-Head Helm", () => {
  it("may sacrifice the equipped creature that dealt the damage, not the Helm, to discard your hand and draw three", () => {
    const { s: s0, ap, opp } = setup([]);
    emptyHand(s0, ap);
    handOf(s0, ap, 2);
    const helm = putOnBattlefield(s0, ap, ogreheadHelm);
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[helm]!.attachedTo = b;
    invalidateCharacteristics(s0);
    expect(pt(s0, b)).toBe("4/4");
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    s = settleTo(s, "endCombat", { me: ap, may: true });
    expect(zone(s, b)).toBe("graveyard");
    expect(zone(s, helm)).toBe("battlefield");
    expect(s.players[ap]!.hand.length).toBe(3);
    expect(s.players[ap]!.graveyard.length).toBe(3);
  });

  it("sacrifices itself when it deals the damage as a creature", () => {
    const { s: s0, ap, opp } = setup([]);
    emptyHand(s0, ap);
    const helm = putOnBattlefield(s0, ap, ogreheadHelm);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: helm, defender: opp }] });
    s = settleTo(s, "endCombat", { me: ap, may: true });
    expect(zone(s, helm)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(3);
  });
});

describe("Farideh, Devil's Chosen", () => {
  it("gains flying and menace whenever you roll, and draws if any result was 10 or higher", () => {
    const seen = new Set<boolean>();
    for (let seed = 1; seed < 40 && seen.size < 2; seed++) {
      const { s: s0, ap } = setup([], seed);
      const f = putOnBattlefield(s0, ap, faridehDevilsC);
      const hand = s0.players[ap]!.hand.length;
      const { kept } = rollDice(s0, ap, 20, 2, "Test");
      const s = settle(s0, { me: ap });
      const high = Math.max(...kept) >= 10;
      seen.add(high);
      expect(objHasKeyword(s, s.objects[f]!, "Flying")).toBe(true);
      expect(objHasKeyword(s, s.objects[f]!, "Menace")).toBe(true);
      expect(s.players[ap]!.hand.length).toBe(hand + (high ? 1 : 0));
    }
    expect(seen.size).toBe(2);
  });
});

describe("Full Bore", () => {
  it("gives +3/+2, and trample and haste only to a creature cast for its warp cost", () => {
    for (const warped of [false, true]) {
      const { s: s0, ap, ids } = setup([fullBore]);
      const b = putOnBattlefield(s0, ap, bear());
      if (warped) s0.objects[b]!.castAlt = "warp";
      const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])), { me: ap });
      expect(pt(s, b)).toBe("5/4");
      expect(objHasKeyword(s, s.objects[b]!, "Trample")).toBe(warped);
      expect(objHasKeyword(s, s.objects[b]!, "Haste")).toBe(warped);
    }
  });
});

describe("Waking the Trolls", () => {
  it("III makes as many Trolls as you control more lands than the target opponent, none otherwise", () => {
    for (const fewer of [true, false]) {
      const { s: s0, ap, opp } = setup([]);
      for (let i = 0; i < (fewer ? 11 : 15); i++) putOnBattlefield(s0, opp, forest);
      const saga = putOnBattlefield(s0, ap, wakingTheTroll);
      s0.objects[saga]!.counters.lore = 2;
      putCounters(s0, s0.objects[saga]!, "lore", 1);
      const s = settle(s0, { me: ap, targets: [ply(opp)] });
      const trolls = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Troll Warrior Token");
      // You control 14 lands.
      expect(trolls.length).toBe(fewer ? 3 : 0);
      if (fewer) expect(objHasKeyword(s, s.objects[trolls[0]!]!, "Trample")).toBe(true);
    }
  });
});

describe("Glorfindel, Dauntless Rescuer", () => {
  it("whenever you scry, gets +1/+1 and the chosen mode", () => {
    for (const mode of [0, 1]) {
      const { s: s0, ap } = setup([card("Scry Spell", "Sorcery", "{U}", { oracleText: "Scry 1." })]);
      const g = putOnBattlefield(s0, ap, glorfindelDaun);
      let s = run(s0, planCast(s0, ap, s0.players[ap]!.hand.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Scry Spell")!));
      for (let i = 0; i < 50 && s.pending?.kind !== "arrangeTop"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      s = act(s, { type: "arrangeTop", player: ap, top: [s.players[ap]!.library[0]!], away: [] });
      for (let i = 0; i < 50 && s.pending?.kind !== "chooseModes"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      s = settle(act(s, { type: "chooseModes", player: ap, modes: [mode] }), { me: ap });
      expect(pt(s, g)).toBe("4/3");
      const c = characteristics(s, s.objects[g]!);
      expect(!!c.mustBeBlocked).toBe(mode === 0);
      expect(!!c.maxOneBlocker).toBe(mode === 1);
    }
  });
});

describe("Auriok Steelshaper", () => {
  it("makes equip abilities you activate cost {1} less", () => {
    const { s: s0, ap } = setup([]);
    emptyHand(s0, ap);
    const sword = putOnBattlefield(s0, ap, card("Test Sword", "Artifact — Equipment", "{1}", { oracleText: "Equipped creature gets +1/+1.\nEquip {2}" }));
    const b = putOnBattlefield(s0, ap, bear());
    const without = planActivate(s0, ap, sword, 0, [tgt(b)])!.filter((a) => a.type === "activateMana").length;
    putOnBattlefield(s0, ap, auriokSteelsha);
    const withIt = planActivate(s0, ap, sword, 0, [tgt(b)])!.filter((a) => a.type === "activateMana").length;
    expect(without).toBe(2);
    expect(withIt).toBe(1);
  });
});

describe("Voyager Glidecar", () => {
  it("tapping three other untapped creatures makes it a flying artifact creature with a +1/+1 counter", () => {
    const { s: s0, ap } = setup([]);
    emptyHand(s0, ap);
    const car = putOnBattlefield(s0, ap, voyagerGlideca);
    const crew = [0, 1, 2].map((i) => putOnBattlefield(s0, ap, bear({ name: `Crew Bear ${i}` })));
    const s = settle(run(s0, planActivate(s0, ap, car, 0, [], undefined, undefined, undefined, { tap: crew })), { me: ap });
    expect(crew.every((id) => s.objects[id]!.tapped)).toBe(true);
    expect(characteristics(s, s.objects[car]!).types).toContain("Creature");
    expect(objHasKeyword(s, s.objects[car]!, "Flying")).toBe(true);
    expect(s.objects[car]!.counters["+1/+1"]).toBe(1);
    expect(pt(s, car)).toBe("3/4");
  });
});

describe("Renegade Bull", () => {
  it("exiles up to one target instant or sorcery card from your graveyard and you may cast a copy of it free", () => {
    const { s: s0, ap, opp } = setup([]);
    emptyHand(s0, ap);
    const bull = putOnBattlefield(s0, ap, renegadeBull);
    const draw = into(s0, ap, card("Old Draw", "Sorcery", "{3}{U}", { oracleText: "Draw two cards." }), "graveyard");
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: bull, defender: opp }] });
    s = settle(s, { me: ap, targets: [tgt(draw)] });
    expect(s.pending?.kind).toBe("chooseOption");
    s = act(s, { type: "chooseOption", player: ap, choice: draw });
    if (s.pending?.kind === "castFree") s = act(s, { type: "castSpell", player: ap, objectId: (s.pending as { objectId: ObjectId }).objectId, targets: [] } as Action);
    s = settle(s, { me: ap });
    expect(zone(s, draw)).toBe("exile");
    expect(s.players[ap]!.hand.length).toBe(2);
  });

  it("does nothing with no target chosen", () => {
    const { s: s0, ap, opp } = setup([]);
    emptyHand(s0, ap);
    const bull = putOnBattlefield(s0, ap, renegadeBull);
    const draw = into(s0, ap, card("Old Draw", "Sorcery", "{3}{U}", { oracleText: "Draw two cards." }), "graveyard");
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: bull, defender: opp }] });
    s = settle(s, { me: ap, targets: [{ kind: "none" }] });
    expect(s.pending).toBeFalsy();
    expect(zone(s, draw)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(0);
  });
});

describe("Startled Awake", () => {
  it("puts itself from your graveyard onto the battlefield transformed, as a sorcery", () => {
    const { s: s0, ap } = setup([]);
    const sa = into(s0, ap, startledAwakeu, "graveyard");
    const s = settle(run(s0, planActivate(s0, ap, sa, 0)), { me: ap });
    expect(zone(s, sa)).toBe("battlefield");
    expect(characteristics(s, s.objects[sa]!).name).toBe("Persistent Nightmare");
    expect(objHasKeyword(s, s.objects[sa]!, "Skulk")).toBe(true);
  });
});
