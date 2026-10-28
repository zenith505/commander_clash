// Lane B, round 19: the cards the earlier rounds skipped, least played first (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { blockProblem, controllerOf, moveObject, invalidateCharacteristics, isFullySupported, isLegalTarget, objHasKeyword, parseManaCost, planActivate, planCast, planMana, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
interface Answers {
  /** "You may" questions (not a clash's top-or-bottom): yes unless false. */
  yes?: boolean;
  /** The opponent to clash with. */
  clashWith?: PlayerId;
  /** A clash's question: put the revealed card on the bottom? No unless true. */
  bottom?: boolean;
  targets?: TargetChoice[];
  pick?: string[];
}
/** Everyone passes until the stack is empty, answering questions with `opts`. Stops at any other question. */
const settle = (s: GameState, opts: Answers = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseOption" && p.what === "clash") s = act(s, { type: "chooseOption", player: p.player, choice: String(opts.clashWith ?? p.options[0]) });
    else if (p?.kind === "chooseMay" && p.clash) s = act(s, { type: "chooseMay", player: p.player, yes: !!opts.bottom });
    else if (p?.kind === "chooseMay") s = run(s, [...((opts.yes ?? true) && p.pay?.mana ? planMana(s, p.player, parseManaCost(p.pay.mana))! : []), { type: "chooseMay", player: p.player, yes: opts.yes ?? true }]);
    else if (p?.kind === "chooseTargets" && opts.targets) s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets } as Action);
    else if (p?.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: p.player, found: p.cards.slice(0, p.min) });
    else if (p?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: p.player, ids: opts.pick ?? p.options.slice(0, p.count) });
    else if (p) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const creature = (name: string, typeLine: string, manaCost: string, p: number, t: number, extra: Partial<CardDef> = {}) =>
  card(name, typeLine, manaCost, { power: String(p), toughness: String(t), ...extra });
const greenBear = () => creature("Green Bear", "Creature — Bear", "{1}{G}", 2, 2, { cmc: 2 });
/** A card with mana value 7 for the top of a library: it wins a clash against anything cheaper. */
const big = () => creature("Big Wurm", "Creature — Wurm", "{6}{G}", 7, 7, { cmc: 7 });
const cheap = () => card("Cheap Land", "Land");
const into = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard" | "library" = "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** The tops of two libraries for a clash: `winner`'s card has the greater mana value. */
const stack = (s: GameState, winner: PlayerId, loser: PlayerId) => ({ high: into(s, winner, big(), "library"), low: into(s, loser, cheap(), "library") });
const attach = (s: GameState, pid: PlayerId, def: CardDef, to: string) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.attachedTo = to;
  invalidateCharacteristics(s);
  return id;
};
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = []) => run(s, planCast(s, pid, id, targets));

// Real oracle text (Scryfall).
const entanglingTrap = card("Entangling Trap", "Enchantment", "{1}{W}", {cmc: 2,oracleText: "Whenever you clash, tap target creature an opponent controls. If you won, that creature doesn't untap during its controller's next untap step. (This ability triggers after the clash ends.)"});
const rebellion = card("Rebellion of the Flamekin", "Kindred Enchantment — Elemental", "{3}{R}", {cmc: 4,oracleText: "Whenever you clash, you may pay {1}. If you do, create a 3/1 red Elemental Shaman creature token. If you won, that token gains haste until end of turn. (This ability triggers after the clash ends.)"});
const sylvanEchoes = card("Sylvan Echoes", "Enchantment", "{G}", {cmc: 1,oracleText: "Whenever you clash and win, you may draw a card. (This ability triggers after the clash ends.)"});
const marvo = card("Marvo, Deep Operative", "Legendary Creature — Octopus Rogue", "{3}{U}{B}", {cmc: 5,power: "1",toughness: "8",keywords: ["Clash"],oracleText: "Whenever Marvo attacks, clash with defending player. (Each clashing player reveals the top card of their library, then puts that card on their choice of the top or bottom. A player wins if their card had a greater mana value.)\nWhenever you win a clash, draw a card. Then you may cast a spell from your hand with mana value 8 or less without paying its mana cost."});
const fistful = card("Fistful of Force", "Instant", "{1}{G}", {cmc: 2,keywords: ["Clash"],oracleText: "Target creature gets +2/+2 until end of turn. Clash with an opponent. If you win, that creature gets an additional +2/+2 and gains trample until end of turn. (Each clashing player reveals the top card of their library, then puts that card on their choice of the top or bottom. A player wins if their card had a greater mana value.)"});
const pollenLullaby = card("Pollen Lullaby", "Instant", "{1}{W}", {cmc: 2,keywords: ["Clash"],oracleText: "Prevent all combat damage that would be dealt this turn. Clash with an opponent. If you win, creatures that player controls don't untap during the player's next untap step. (Each clashing player reveals the top card of their library, then puts that card on their choice of the top or bottom. A player wins if their card had a greater mana value.)"});
const whirlpoolWhelm = card("Whirlpool Whelm", "Instant", "{1}{U}", {cmc: 2,keywords: ["Clash"],oracleText: "Clash with an opponent, then return target creature to its owner's hand. If you win, you may put that creature on top of its owner's library instead. (Each clashing player reveals the top card of their library, then puts that card on their choice of the top or bottom. A player wins if their card had a greater mana value.)"});
const hoardersGreed = card("Hoarder's Greed", "Sorcery", "{3}{B}", {cmc: 4,keywords: ["Clash"],oracleText: "You lose 2 life and draw two cards, then clash with an opponent. If you win, repeat this process. (Each clashing player reveals the top card of their library, then puts that card on their choice of the top or bottom. A player wins if their card had a greater mana value.)"});
const captivatingGlance = card("Captivating Glance", "Enchantment — Aura", "{2}{U}", {cmc: 3,keywords: ["Enchant","Clash"],oracleText: "Enchant creature\nAt the beginning of your end step, clash with an opponent. If you win, gain control of enchanted creature. Otherwise, that player gains control of enchanted creature. (Each clashing player reveals the top card of their library, then puts that card on their choice of the top or bottom. A player wins if their card had a greater mana value.)"});
const giltLeafAmbush = card("Gilt-Leaf Ambush", "Kindred Instant — Elf", "{2}{G}", {cmc: 3,keywords: ["Clash"],oracleText: "Create two 1/1 green Elf Warrior creature tokens. Clash with an opponent. If you win, those creatures gain deathtouch until end of turn. (Each clashing player reveals the top card of their library, then puts that card on their choice of the top or bottom. A player wins if their card had a greater mana value. Any amount of damage a creature with deathtouch deals to a creature is enough to destroy it.)"});

const whirlingDervish = card("Whirling Dervish", "Creature — Human Monk", "{G}{G}", {"cmc":2,"power":"1","toughness":"1","keywords":["Protection"],"oracleText":"Protection from black\nAt the beginning of each end step, if this creature dealt damage to an opponent this turn, put a +1/+1 counter on it."});
const duneriderOutlaw = card("Dunerider Outlaw", "Creature — Human Rebel Rogue", "{B}{B}", {"cmc":2,"power":"1","toughness":"1","keywords":["Protection"],"oracleText":"Protection from green\nAt the beginning of each end step, if this creature dealt damage to an opponent this turn, put a +1/+1 counter on it."});
const yawgmothDemon = card("Yawgmoth Demon", "Creature — Phyrexian Demon", "{4}{B}{B}", {"cmc":6,"power":"6","toughness":"6","keywords":["Flying","First strike"],"oracleText":"Flying (This creature can't be blocked except by creatures with flying or reach.)\nFirst strike (This creature deals combat damage before creatures without first strike.)\nAt the beginning of your upkeep, you may sacrifice an artifact. If you don't, tap this creature and it deals 2 damage to you."});
const wallOfVipers = card("Wall of Vipers", "Creature — Snake Wall", "{2}{B}", {"cmc":3,"power":"2","toughness":"4","keywords":["Defender"],"oracleText":"Defender (This creature can't attack.)\n{3}: Destroy this creature and target creature it's blocking. Any player may activate this ability."});
const huntingKavu = card("Hunting Kavu", "Creature — Kavu", "{1}{R}{G}", {"cmc":3,"power":"2","toughness":"3","oracleText":"{1}{R}{G}, {T}: Exile this creature and target creature without flying that's attacking you."});
const giantTrapDoorSpider = card("Giant Trap Door Spider", "Creature — Spider", "{1}{R}{G}", {"cmc":3,"power":"2","toughness":"3","oracleText":"{1}{R}{G}, {T}: Exile this creature and target creature without flying that's attacking you."});
const flayingTendrils = card("Flaying Tendrils", "Sorcery", "{1}{B}{B}", {"cmc":3,"keywords":["Devoid"],"oracleText":"Devoid (This card has no color.)\nAll creatures get -2/-2 until end of turn. If a creature would die this turn, exile it instead."});
const maliciousMalfunction = card("Malicious Malfunction", "Sorcery", "{1}{B}{B}", {"cmc":3,"oracleText":"All creatures get -2/-2 until end of turn. If a creature would die this turn, exile it instead."});
const sindbad = card("Sindbad", "Creature — Human", "{1}{U}", {"cmc":2,"power":"1","toughness":"1","oracleText":"{T}: Draw a card and reveal it. If it isn't a land card, discard it."});
const faadiyahSeer = card("Fa'adiyah Seer", "Creature — Human Shaman", "{1}{G}", {"cmc":2,"power":"1","toughness":"1","oracleText":"{T}: Draw a card and reveal it. If it isn't a land card, discard it."});
const truce = card("Truce", "Instant", "{2}{W}", {"cmc":3,"oracleText":"Each player may draw up to two cards. For each card less than two a player draws this way, that player gains 2 life."});
const temporaryTruce = card("Temporary Truce", "Sorcery", "{1}{W}", {"cmc":2,"oracleText":"Each player may draw up to two cards. For each card less than two a player draws this way, that player gains 2 life."});
const eunuchsIntrigues = card("Eunuchs' Intrigues", "Sorcery", "{2}{R}", {"cmc":3,"oracleText":"Target opponent chooses a creature they control. Other creatures they control can't block this turn."});
const goblinWarCry = card("Goblin War Cry", "Sorcery", "{2}{R}", {"cmc":3,"oracleText":"Target opponent chooses a creature they control. Other creatures they control can't block this turn."});
const karakykGuardian = card("Karakyk Guardian", "Creature — Dragon", "{3}{G}{U}{R}", {"cmc":6,"power":"6","toughness":"5","keywords":["Flying","Vigilance","Trample"],"oracleText":"Flying, vigilance, trample\nThis creature has hexproof as long as it hasn't dealt damage yet. (It can't be the target of spells or abilities your opponents control.)"});
const palladiamorsTheRuiner = card("Palladia-Mors, the Ruiner", "Legendary Creature — Elder Dragon", "{3}{R}{G}{W}", {"cmc":6,"power":"6","toughness":"6","keywords":["Flying","Vigilance","Trample"],"oracleText":"Flying, vigilance, trample\nPalladia-Mors has hexproof as long as it hasn't dealt damage yet."});
const inventiveWingsmith = card("Inventive Wingsmith", "Creature — Dwarf Artificer", "{2}{W}", {"cmc": 3, "power": "2", "toughness": "4", "oracleText": "At the beginning of your end step, if you haven't cast a spell from your hand this turn and this creature doesn't have a flying counter on it, put a flying counter on it."});
const touchOfTheEternal = card("Touch of the Eternal", "Enchantment", "{5}{W}{W}", {"cmc": 7, "oracleText": "At the beginning of your upkeep, count the number of permanents you control. Your life total becomes that number."});
const buddingInsurgent = card("Budding Insurgent", "Creature — Dryad Scout", "{2}{G}", {"cmc": 3, "power": "3", "toughness": "3", "keywords": ["Vigilance"], "oracleText": "Vigilance\nSacrifice this creature: Destroy target artifact or enchantment. If that permanent was a legendary enchantment, draw a card. Activate only as a sorcery."});
const skullknockerOgre = card("Skullknocker Ogre", "Creature — Ogre", "{3}{R}", {"cmc": 4, "power": "4", "toughness": "3", "oracleText": "Whenever this creature deals damage to an opponent, that player discards a card at random. If the player does, they draw a card."});
const charnelTroll = card("Charnel Troll", "Creature — Troll", "{1}{B}{G}", {"cmc": 3, "power": "4", "toughness": "4", "keywords": ["Trample"], "oracleText": "Trample\nAt the beginning of your upkeep, exile a creature card from your graveyard. If you do, put a +1/+1 counter on this creature. Otherwise, sacrifice it.\n{B}{G}, Discard a creature card: Put a +1/+1 counter on this creature."});
const etherWell = card("Ether Well", "Instant", "{3}{U}", {"cmc": 4, "oracleText": "Put target creature on top of its owner's library. If that creature is red, you may put it on the bottom of its owner's library instead."});
const goreVassal = card("Gore Vassal", "Creature — Phyrexian Dog", "{2}{W}", {"cmc": 3, "power": "2", "toughness": "1", "keywords": ["Regenerate"], "oracleText": "Sacrifice this creature: Put a -1/-1 counter on target creature. Then if that creature's toughness is 1 or greater, regenerate it."});
const kjeldoranHomeGuard = card("Kjeldoran Home Guard", "Creature — Human Soldier", "{3}{W}", {"cmc": 4, "power": "1", "toughness": "6", "oracleText": "At end of combat, if this creature attacked or blocked this combat, put a -0/-1 counter on this creature and create a 0/1 white Deserter creature token."});
const snowFortress = card("Snow Fortress", "Artifact Creature — Wall", "{5}", {"cmc": 5, "power": "0", "toughness": "4", "keywords": ["Defender"], "oracleText": "Defender (This creature can't attack.)\n{1}: This creature gets +1/+0 until end of turn.\n{1}: This creature gets +0/+1 until end of turn.\n{3}: This creature deals 1 damage to target creature without flying that's attacking you."});
const iceFloe = card("Ice Floe", "Land", "", {"cmc": 0, "oracleText": "You may choose not to untap this land during your untap step.\n{T}: Tap target creature without flying that's attacking you. It doesn't untap during its controller's untap step for as long as this land remains tapped."});
const mangara = card("Mangara of Corondor", "Legendary Creature — Human Wizard", "{1}{W}{W}", {"cmc": 3, "power": "1", "toughness": "1", "oracleText": "{T}: Exile Mangara and target permanent."});
const ravenousDemon = card("Ravenous Demon // Archdemon of Greed", "Creature — Demon // Creature — Demon", "{3}{B}{B}", {
  cmc: 5,
  power: "4",
  toughness: "4",
  layout: "transform",
  oracleText: "Sacrifice a Human: Transform this creature. Activate only as a sorcery.",
  faces: [
    { name: "Ravenous Demon", manaCost: "{3}{B}{B}", typeLine: "Creature — Demon", supertypes: [], types: ["Creature"], subtypes: ["Demon"], oracleText: "Sacrifice a Human: Transform this creature. Activate only as a sorcery.", power: "4", toughness: "4", colors: ["B"] },
    { name: "Archdemon of Greed", manaCost: "", typeLine: "Creature — Demon", supertypes: [], types: ["Creature"], subtypes: ["Demon"], oracleText: "Flying, trample\nAt the beginning of your upkeep, sacrifice a Human. If you can't, tap this creature and it deals 9 damage to you.", power: "9", toughness: "9", colors: ["B"] },
  ],
});

describe("clash (CR 701.30): \"whenever you clash\" and \"if you win\"", () => {
  it("compiles them", () => supported(entanglingTrap, rebellion, sylvanEchoes, marvo, fistful, pollenLullaby, whirlpoolWhelm, hoardersGreed, captivatingGlance, giltLeafAmbush));

  it("Fistful of Force: +2/+2, and another +2/+2 and trample on a won clash", () => {
    const { s: s0, ap, ids, opp } = setup([fistful]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    stack(s0, ap, opp);
    let s = castNow(s0, ap, ids[0]!, [tgt(bear)]);
    s = settle(s, { clashWith: opp });
    expect(pt(s, bear)).toBe("6/6");
    expect(objHasKeyword(s, s.objects[bear]!, "Trample")).toBe(true);

    const { s: t0, ap: bp, ids: tids, opp: bopp } = setup([fistful]);
    const b2 = putOnBattlefield(t0, bp, greenBear());
    stack(t0, bopp, bp);
    let t = castNow(t0, bp, tids[0]!, [tgt(b2)]);
    t = settle(t, { clashWith: bopp });
    expect(pt(t, b2)).toBe("4/4");
    expect(objHasKeyword(t, t.objects[b2]!, "Trample")).toBe(false);
  });

  it("a tie isn't a win (CR 701.30d), and the clash card can go to the bottom", () => {
    const { s: s0, ap, ids, opp } = setup([fistful]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    const mine = into(s0, ap, big(), "library");
    into(s0, opp, big(), "library");
    let s = castNow(s0, ap, ids[0]!, [tgt(bear)]);
    s = settle(s, { clashWith: opp, bottom: true });
    expect(pt(s, bear)).toBe("4/4");
    expect(s.players[ap]!.library.at(-1)).toBe(mine);
  });

  it("Entangling Trap and Sylvan Echoes trigger on a clash an opponent's spell started; the opponent can win it (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([fistful]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    const theirBear = putOnBattlefield(s0, ap, greenBear());
    // The opponent's enchantments: they clash because of ap's spell, and win.
    putOnBattlefield(s0, opp, entanglingTrap);
    putOnBattlefield(s0, opp, sylvanEchoes);
    s0.objects[theirBear]!.controller = ap;
    stack(s0, opp, ap);
    const handBefore = s0.players[opp]!.hand.length;
    let s = castNow(s0, ap, ids[0]!, [tgt(bear)]);
    s = settle(s, { clashWith: opp, targets: [tgt(theirBear)] });
    expect(pt(s, bear)).toBe("4/4");
    expect(s.objects[theirBear]!.tapped).toBe(true);
    expect(s.players[opp]!.hand.length).toBe(handBefore + 1);
    // Won: it stays tapped through ap's next untap step.
    s = passUntil(s, "upkeep", ap);
    expect(s.objects[theirBear]!.tapped).toBe(true);
  });

  it("Entangling Trap after a lost clash: tapped, but it untaps as usual; Sylvan Echoes doesn't trigger", () => {
    const { s: s0, ap, ids, opp } = setup([fistful]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    const victim = putOnBattlefield(s0, opp, greenBear());
    putOnBattlefield(s0, ap, entanglingTrap);
    putOnBattlefield(s0, ap, sylvanEchoes);
    stack(s0, opp, ap);
    const handBefore = s0.players[ap]!.hand.length;
    let s = castNow(s0, ap, ids[0]!, [tgt(bear)]);
    s = settle(s, { clashWith: opp, targets: [tgt(victim)] });
    expect(s.objects[victim]!.tapped).toBe(true);
    expect(s.players[ap]!.hand.length).toBe(handBefore - 1);
    s = passUntil(s, "upkeep", opp);
    expect(s.objects[victim]!.tapped).toBe(false);
  });

  it("Rebellion of the Flamekin: pay {1} for a 3/1 that has haste only if you won", () => {
    const { s: s0, ap, ids, opp } = setup([fistful]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    putOnBattlefield(s0, ap, rebellion);
    stack(s0, ap, opp);
    let s = castNow(s0, ap, ids[0]!, [tgt(bear)]);
    s = settle(s, { clashWith: opp });
    const tokens = s.battlefield.filter((id) => s.objects[id]!.isToken && controllerOf(s, s.objects[id]!) === ap);
    expect(tokens.length).toBe(1);
    expect(pt(s, tokens[0]!)).toBe("3/1");
    expect(objHasKeyword(s, s.objects[tokens[0]!]!, "Haste")).toBe(true);

    const { s: t0, ap: bp, ids: tids, opp: bopp } = setup([fistful]);
    const b2 = putOnBattlefield(t0, bp, greenBear());
    putOnBattlefield(t0, bp, rebellion);
    stack(t0, bopp, bp);
    let t = castNow(t0, bp, tids[0]!, [tgt(b2)]);
    t = settle(t, { clashWith: bopp });
    const lost = t.battlefield.filter((id) => t.objects[id]!.isToken && controllerOf(t, t.objects[id]!) === bp);
    expect(lost.length).toBe(1);
    expect(objHasKeyword(t, t.objects[lost[0]!]!, "Haste")).toBe(false);

    // Declining the payment makes no token.
    const { s: u0, ap: cp, ids: uids, opp: copp } = setup([fistful]);
    const b3 = putOnBattlefield(u0, cp, greenBear());
    putOnBattlefield(u0, cp, rebellion);
    stack(u0, cp, copp);
    let u = castNow(u0, cp, uids[0]!, [tgt(b3)]);
    u = settle(u, { clashWith: copp, yes: false });
    expect(u.battlefield.some((id) => u.objects[id]!.isToken)).toBe(false);
  });

  it("Gilt-Leaf Ambush: the two tokens gain deathtouch on a won clash", () => {
    const { s: s0, ap, ids, opp } = setup([giltLeafAmbush]);
    stack(s0, ap, opp);
    let s = castNow(s0, ap, ids[0]!);
    s = settle(s, { clashWith: opp });
    const tokens = s.battlefield.filter((id) => s.objects[id]!.isToken);
    expect(tokens.length).toBe(2);
    expect(tokens.every((id) => objHasKeyword(s, s.objects[id]!, "Deathtouch"))).toBe(true);

    const { s: t0, ap: bp, ids: tids, opp: bopp } = setup([giltLeafAmbush]);
    stack(t0, bopp, bp);
    let t = castNow(t0, bp, tids[0]!);
    t = settle(t, { clashWith: bopp });
    const lost = t.battlefield.filter((id) => t.objects[id]!.isToken);
    expect(lost.length).toBe(2);
    expect(lost.some((id) => objHasKeyword(t, t.objects[id]!, "Deathtouch"))).toBe(false);
  });

  it("Pollen Lullaby: the creatures of the opponent clashed with don't untap during that player's next untap step", () => {
    const { s: s0, ap, ids, opp } = setup([pollenLullaby]);
    const other = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const theirs = putOnBattlefield(s0, other, greenBear());
    const notThem = putOnBattlefield(s0, opp, greenBear());
    s0.objects[theirs]!.tapped = true;
    s0.objects[notThem]!.tapped = true;
    stack(s0, ap, other);
    let s = castNow(s0, ap, ids[0]!);
    s = settle(s, { clashWith: other });
    s = passUntil(s, "upkeep", opp);
    expect(s.objects[notThem]!.tapped).toBe(false);
    s = passUntil(s, "upkeep", other);
    expect(s.objects[theirs]!.tapped).toBe(true);
  });

  it("Whirlpool Whelm: won, you may put the creature on top of its owner's library; lost, it goes to the hand", () => {
    const { s: s0, ap, ids, opp } = setup([whirlpoolWhelm]);
    const victim = putOnBattlefield(s0, opp, greenBear());
    stack(s0, ap, opp);
    let s = castNow(s0, ap, ids[0]!, [tgt(victim)]);
    s = settle(s, { clashWith: opp, yes: true });
    const card0 = s.players[opp]!.library[0]!;
    expect(s.cards[s.objects[card0]!.cardId]!.name).toBe("Green Bear");

    const { s: t0, ap: bp, ids: tids, opp: bopp } = setup([whirlpoolWhelm]);
    const v2 = putOnBattlefield(t0, bopp, greenBear());
    stack(t0, bp, bopp);
    let t = castNow(t0, bp, tids[0]!, [tgt(v2)]);
    t = settle(t, { clashWith: bopp, yes: false });
    expect(t.players[bopp]!.hand.some((id) => t.cards[t.objects[id]!.cardId]!.name === "Green Bear")).toBe(true);

    const { s: u0, ap: cp, ids: uids, opp: copp } = setup([whirlpoolWhelm]);
    const v3 = putOnBattlefield(u0, copp, greenBear());
    stack(u0, copp, cp);
    let u = castNow(u0, cp, uids[0]!, [tgt(v3)]);
    u = settle(u, { clashWith: copp, yes: true });
    expect(u.players[copp]!.hand.some((id) => u.cards[u.objects[id]!.cardId]!.name === "Green Bear")).toBe(true);
  });

  it("Hoarder's Greed: again and again until a clash isn't won (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([hoardersGreed]);
    // Library tops: two to draw, then a 7 revealed (a win, kept on top), drawn with the next card, then another 7 (a
    // win), then a land (0 against 0: not a win). Three times in all.
    const lib = s0.players[ap]!.library;
    const top = [cheap(), cheap(), big(), cheap(), big(), cheap(), cheap()].map((d) => into(s0, ap, d, "library"));
    s0.players[ap]!.library = [...top, ...lib.filter((id) => !top.includes(id))];
    for (let i = 0; i < 3; i++) into(s0, opp, cheap(), "library");
    const lifeBefore = life(s0, ap);
    const handBefore = s0.players[ap]!.hand.length;
    let s = castNow(s0, ap, ids[0]!);
    s = settle(s, { clashWith: opp });
    expect(life(s, ap)).toBe(lifeBefore - 6);
    expect(s.players[ap]!.hand.length).toBe(handBefore - 1 + 6);
  });

  it("Captivating Glance: won, you gain control of the creature; lost, the opponent clashed with does", () => {
    const { s: s0, ap, opp } = setup([]);
    const other = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const victim = putOnBattlefield(s0, opp, greenBear());
    attach(s0, ap, captivatingGlance, victim);
    stack(s0, ap, opp);
    let s = passUntil(s0, "end", ap);
    s = settle(s, { clashWith: opp });
    expect(controllerOf(s, s.objects[victim]!)).toBe(ap);

    const { s: t0, ap: bp, opp: bopp } = setup([]);
    const bother = t0.turnOrder.find((p) => p !== bp && p !== bopp)!;
    const v2 = putOnBattlefield(t0, bopp, greenBear());
    attach(t0, bp, captivatingGlance, v2);
    stack(t0, bother, bp);
    let t = passUntil(t0, "end", bp);
    t = settle(t, { clashWith: bother });
    expect(controllerOf(t, t.objects[v2]!)).toBe(bother);
    expect(other).not.toBe(ap);
  });

  it("Marvo: clashes with the defending player as it attacks; a won clash draws and may cast a spell free", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, marvo);
    const { high } = stack(s0, ap, opp);
    s0.players[ap]!.command = [];
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: m, defender: opp }] });
    s = settle(s, { yes: true });
    // It drew the 7-drop it revealed, and casts it for free.
    expect(s.pending?.kind === "chooseOption" && s.pending.what === "castFromHand" && s.pending.options.includes(high)).toBe(true);
    s = act(s, { type: "chooseOption", player: ap, choice: high });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: high });
    s = act(s, { type: "castSpell", player: ap, objectId: high });
    s = settle(s);
    expect(zone(s, high)).toBe("battlefield");
  });
});

describe("more of the skipped cards", () => {
  it("compiles them", () => supported(whirlingDervish, duneriderOutlaw, yawgmothDemon, wallOfVipers, huntingKavu, giantTrapDoorSpider, flayingTendrils, maliciousMalfunction, sindbad, faadiyahSeer, truce, temporaryTruce, eunuchsIntrigues, goblinWarCry, karakykGuardian, palladiamorsTheRuiner));

  it("Whirling Dervish: a +1/+1 counter at the end step only if it dealt damage to an opponent this turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, ap, whirlingDervish);
    const idle = putOnBattlefield(s0, ap, duneriderOutlaw);
    s0.players[ap]!.command = [];
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: d, defender: opp }] });
    s = passUntil(s, "end", ap);
    s = settle(s);
    expect(s.objects[d]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[idle]!.counters["+1/+1"]).toBeUndefined();
    // Another end step, with no damage that turn: no counter.
    s = passUntil(s, "end", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    s = settle(s);
    expect(s.objects[d]!.counters["+1/+1"]).toBe(1);
  });

  it("Yawgmoth Demon: sacrifice an artifact, or it taps and deals 2 damage to you", () => {
    const { s: s0, ap } = setup([]);
    const demon = putOnBattlefield(s0, ap, yawgmothDemon);
    const art = putOnBattlefield(s0, ap, card("Trinket", "Artifact", "{1}", { cmc: 1 }));
    let s = passUntil(passUntil(s0, "end", ap), "upkeep", ap);
    s = settle(s, { yes: true });
    expect(zone(s, art)).toBe("graveyard");
    expect(s.objects[demon]!.tapped).toBe(false);
    const before = life(s, ap);
    s = passUntil(passUntil(s, "end", ap), "upkeep", ap);
    s = settle(s, { yes: true });
    expect(s.objects[demon]!.tapped).toBe(true);
    expect(life(s, ap)).toBe(before - 2);
  });

  it("Wall of Vipers: any player may pay {3} to destroy it and the creature it's blocking", () => {
    const { s: s0, ap, opp } = setup([]);
    const attacker = putOnBattlefield(s0, ap, greenBear());
    const wall = putOnBattlefield(s0, opp, wallOfVipers);
    s0.players[ap]!.command = [];
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker, defender: opp }] });
    for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: wall, attacker }] });
    // The attacking player activates the wall's ability.
    s = run(s, planActivate(s, ap, wall, 0, [tgt(attacker)]));
    s = settle(s);
    expect([zone(s, wall), zone(s, attacker)]).toEqual(["graveyard", "graveyard"]);
  });

  it("Giant Trap Door Spider: exiles itself and a creature without flying attacking you", () => {
    const { s: s0, ap, opp } = setup([]);
    const walker = putOnBattlefield(s0, ap, greenBear());
    const flier = putOnBattlefield(s0, ap, creature("Bird", "Creature — Bird", "{1}{U}", 1, 1, { keywords: ["Flying"] }));
    const spider = putOnBattlefield(s0, opp, giantTrapDoorSpider);
    for (const l of ["Mountain", "Forest", "Forest"]) putOnBattlefield(s0, opp, card(l, `Basic Land — ${l}`));
    s0.players[ap]!.command = [];
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: walker, defender: opp }, { attacker: flier, defender: opp }] });
    for (let i = 0; i < 20 && waitingOn(s) !== opp; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(planActivate(s, opp, spider, 0, [tgt(flier)])).toBeNull();
    s = run(s, planActivate(s, opp, spider, 0, [tgt(walker)]));
    s = settle(s);
    expect([zone(s, spider), zone(s, walker), zone(s, flier)]).toEqual(["exile", "exile", "battlefield"]);
  });

  it("Malicious Malfunction: -2/-2, and every creature that would die this turn is exiled, later ones too (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([maliciousMalfunction]);
    const small = putOnBattlefield(s0, opp, greenBear());
    const big0 = putOnBattlefield(s0, opp, creature("Ogre", "Creature — Ogre", "{2}{R}", 3, 3));
    let s = castNow(s0, ap, ids[0]!);
    s = settle(s);
    expect(zone(s, small)).toBe("exile");
    expect(pt(s, big0)).toBe("1/1");
    // A creature that enters later this turn and dies is exiled too.
    const later = putOnBattlefield(s, opp, greenBear());
    s.objects[later]!.damage = 2;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(zone(s, later)).toBe("exile");
  });

  it("Sindbad: a land card drawn stays; anything else is discarded", () => {
    const { s: s0, ap } = setup([]);
    const sb = putOnBattlefield(s0, ap, sindbad);
    const land = into(s0, ap, cheap(), "library");
    let s = run(s0, planActivate(s0, ap, sb, 0));
    s = settle(s);
    expect(zone(s, land)).toBe("hand");
    s.objects[sb]!.tapped = false;
    const spell = into(s, ap, greenBear(), "library");
    s = run(s, planActivate(s, ap, sb, 0));
    s = settle(s);
    expect(zone(s, spell)).toBe("graveyard");
  });

  it("Truce: each player draws up to two, and gains 2 life for each card fewer", () => {
    const { s: s0, ap, ids } = setup([truce]);
    let s = castNow(s0, ap, ids[0]!);
    const hands = Object.fromEntries(s.turnOrder.map((p) => [p, s.players[p]!.hand.length]));
    const lives = Object.fromEntries(s.turnOrder.map((p) => [p, life(s, p)]));
    const pick: Record<number, string> = Object.fromEntries(s.turnOrder.map((p, i) => [p, String(i % 3)]));
    for (let i = 0; i < 40 && (s.stack.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "chooseOption" && p.what === "drawUpTo") s = act(s, { type: "chooseOption", player: p.player, choice: pick[p.player]! });
      else if (p) break;
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    for (const p of s.turnOrder) {
      const n = Number(pick[p]);
      expect(s.players[p]!.hand.length).toBe(hands[p]! + n);
      expect(life(s, p)).toBe(lives[p]! + (2 - n) * 2);
    }
  });

  it("Eunuchs' Intrigues: the creature the opponent chose can block; their others can't this turn", () => {
    const { s: s0, ap, ids, opp } = setup([eunuchsIntrigues]);
    const attacker = putOnBattlefield(s0, ap, greenBear());
    const chosen = putOnBattlefield(s0, opp, greenBear());
    const other = putOnBattlefield(s0, opp, greenBear());
    s0.players[ap]!.command = [];
    let s = castNow(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    s = settle(s, { pick: [chosen] });
    // One that comes under their control later this turn can't block either.
    const later = putOnBattlefield(s, opp, greenBear());
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker, defender: opp }] });
    expect(blockProblem(s, s.objects[chosen]!, s.objects[attacker]!)).toBeNull();
    expect(blockProblem(s, s.objects[other]!, s.objects[attacker]!)).toMatch(/can't block/);
    expect(blockProblem(s, s.objects[later]!, s.objects[attacker]!)).toMatch(/can't block/);
  });

  it("Karakyk Guardian: hexproof until it has dealt damage, and again as a new object", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, karakykGuardian);
    const spec = { kind: "object" as const, types: ["Creature"], text: "target creature" };
    expect(isLegalTarget(s0, spec, tgt(g), opp)).toBe(false);
    s0.players[ap]!.command = [];
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: g, defender: opp }] });
    s = passUntil(s, "end", ap);
    expect(isLegalTarget(s, spec, tgt(g), opp)).toBe(true);
  });
});

describe("and a few more", () => {
  it("compiles them", () => supported(inventiveWingsmith, touchOfTheEternal, buddingInsurgent, skullknockerOgre, charnelTroll, etherWell, goreVassal, kjeldoranHomeGuard));

  const nextTurn = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % 4]!;
  /** On to `pid`'s next turn's `step`, settling the stack on the way. */
  const toOwn = (s: GameState, pid: PlayerId, step: Parameters<typeof passUntil>[1]) => settle(passUntil(settle(passUntil(s, "end", nextTurn(s, pid))), step, pid));
  const toHandless = (s: GameState, pid: PlayerId) => {
    for (const id of s.players[pid]!.hand) {
      s.objects[id]!.zone = "library";
      s.players[pid]!.library.push(id);
    }
    s.players[pid]!.hand = [];
    invalidateCharacteristics(s);
  };

  it("Inventive Wingsmith: a flying counter at your end step, not after a spell from your hand, and only one", () => {
    const trinket = card("Zero Trinket", "Artifact", "{0}", { cmc: 0 });
    const { s: s0, ap, ids } = setup([trinket]);
    const w = putOnBattlefield(s0, ap, inventiveWingsmith);
    // A spell cast from your hand this turn: no counter.
    let s = castNow(s0, ap, ids[0]!);
    s = settle(passUntil(settle(s), "end", ap));
    expect(s.objects[w]!.counters.flying).toBeUndefined();
    s = toOwn(s, ap, "end");
    expect(s.objects[w]!.counters.flying).toBe(1);
    expect(objHasKeyword(s, s.objects[w]!, "Flying")).toBe(true);
    // It has one now: no second.
    s = toOwn(s, ap, "end");
    expect(s.objects[w]!.counters.flying).toBe(1);
  });

  it("Touch of the Eternal: your life total becomes the number of permanents you control", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, touchOfTheEternal);
    const s = toOwn(s0, ap, "draw");
    const mine = s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === ap).length;
    expect(life(s, ap)).toBe(mine);
  });

  it("Budding Insurgent: destroys an artifact or enchantment, and draws a card if it was a legendary enchantment", () => {
    const { s: s0, ap, opp } = setup([]);
    const legend = putOnBattlefield(s0, opp, card("Old Shrine", "Legendary Enchantment", "{2}", { cmc: 2 }));
    const plain = putOnBattlefield(s0, opp, card("New Shrine", "Enchantment", "{2}", { cmc: 2 }));
    const a = putOnBattlefield(s0, ap, buddingInsurgent);
    const b = putOnBattlefield(s0, ap, buddingInsurgent);
    const hand = s0.players[ap]!.hand.length;
    let s = settle(run(s0, planActivate(s0, ap, a, 0, [tgt(legend)])));
    expect(zone(s, legend)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    s = settle(run(s, planActivate(s, ap, b, 0, [tgt(plain)])));
    expect(zone(s, plain)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("Skullknocker Ogre: the player discards at random and draws, but not with an empty hand", () => {
    const { s: s0, ap, opp } = setup([]);
    const ogre = putOnBattlefield(s0, ap, skullknockerOgre);
    s0.players[ap]!.command = [];
    toHandless(s0, opp);
    const only = into(s0, opp, greenBear());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: ogre, defender: opp }] });
    s = settle(passUntil(s, "end", ap));
    expect(zone(s, only)).toBe("graveyard");
    expect(s.players[opp]!.hand.length).toBe(1);
    // An empty hand: nothing discarded, so no card drawn.
    s = toOwn(s, ap, "declareAttackers");
    toHandless(s, opp);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: ogre, defender: opp }] });
    s = settle(passUntil(s, "end", ap));
    expect(s.players[opp]!.hand.length).toBe(0);
  });

  it("Charnel Troll: exiles a creature card for a counter, and is sacrificed when there's none", () => {
    const { s: s0, ap } = setup([]);
    const troll = putOnBattlefield(s0, ap, charnelTroll);
    const dead = into(s0, ap, greenBear(), "graveyard");
    let s = toOwn(s0, ap, "upkeep");
    expect(zone(s, dead)).toBe("exile");
    expect(s.objects[troll]!.counters["+1/+1"]).toBe(1);
    // No creature card in the graveyard next time (and none discarded at cleanup with a full hand).
    for (const id of s.players[ap]!.graveyard.filter((g) => s.cards[s.objects[g]!.cardId]!.types.includes("Creature"))) {
      s.objects[id]!.zone = "library";
      s.players[ap]!.library.push(id);
    }
    s.players[ap]!.graveyard = s.players[ap]!.graveyard.filter((g) => s.objects[g]!.zone === "graveyard");
    toHandless(s, ap);
    s = toOwn(s, ap, "upkeep");
    expect(zone(s, troll)).toBe("graveyard");
  });

  it("Ether Well: a red creature may go on the bottom instead; another goes on top", () => {
    const { s: s0, ap, ids, opp } = setup([etherWell, etherWell]);
    const red = putOnBattlefield(s0, opp, creature("Red Bear", "Creature — Bear", "{1}{R}", 2, 2, { cmc: 2, colors: ["R"] }));
    const green = putOnBattlefield(s0, opp, greenBear());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(red)]), { yes: true });
    expect(s.players[opp]!.library.at(-1)).toBe(red);
    s = settle(castNow(s, ap, ids[1]!, [tgt(green)]));
    expect(s.players[opp]!.library[0]).toBe(green);
  });

  it("Gore Vassal: a -1/-1 counter, then a regeneration shield only if it still has toughness 1 or more", () => {
    const { s: s0, ap, opp } = setup([]);
    const v1 = putOnBattlefield(s0, ap, goreVassal);
    const v2 = putOnBattlefield(s0, ap, goreVassal);
    const bear = putOnBattlefield(s0, opp, greenBear());
    const small = putOnBattlefield(s0, opp, creature("Small Bird", "Creature — Bird", "{W}", 1, 1, { cmc: 1 }));
    let s = settle(run(s0, planActivate(s0, ap, v1, 0, [tgt(bear)])));
    expect(pt(s, bear)).toBe("1/1");
    expect(s.objects[bear]!.regenShields).toBe(1);
    s = settle(run(s, planActivate(s, ap, v2, 0, [tgt(small)])));
    expect(zone(s, small)).toBe("graveyard");
  });

  it("Kjeldoran Home Guard: after a combat it attacked in, a -0/-1 counter and a Deserter", () => {
    const { s: s0, ap, opp } = setup([]);
    const guard = putOnBattlefield(s0, ap, kjeldoranHomeGuard);
    const home = putOnBattlefield(s0, ap, kjeldoranHomeGuard);
    s0.players[ap]!.command = [];
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: guard, defender: opp }] });
    s = settle(passUntil(s, "main2", ap));
    expect(pt(s, guard)).toBe("1/5");
    expect(pt(s, home)).toBe("1/6");
    const deserters = s.battlefield.filter((id) => s.objects[id]!.isToken && s.cards[s.objects[id]!.cardId]!.name.startsWith("Deserter"));
    expect(deserters.length).toBe(1);
  });
});

describe("against creatures without flying attacking you, and exiling itself with another", () => {
  it("compiles them", () => supported(snowFortress, iceFloe, mangara, ravenousDemon));

  /** `opp` attacks `ap` with a 2/2 bear and a 2/2 flier; priority in the declare attackers step. */
  const attackedBy = (s0: GameState, ap: PlayerId, opp: PlayerId) => {
    const walker = putOnBattlefield(s0, opp, greenBear());
    const flier = putOnBattlefield(s0, opp, creature("Blue Bird", "Creature — Bird", "{1}{U}", 2, 2, { cmc: 2, keywords: ["Flying"] }));
    s0.players[opp]!.command = [];
    let s = passUntil(s0, "declareAttackers", opp);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: walker, defender: ap }, { attacker: flier, defender: ap }] });
    for (let i = 0; i < 10 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return { s, walker, flier };
  };

  it("Snow Fortress: 1 damage to a creature without flying that's attacking you, not to a flier", () => {
    const { s: s0, ap, opp } = setup([]);
    const wall = putOnBattlefield(s0, ap, snowFortress);
    const { s: s1, walker, flier } = attackedBy(s0, ap, opp);
    expect(planActivate(s1, ap, wall, 2, [tgt(flier)])).toBeNull();
    const s = settle(run(s1, planActivate(s1, ap, wall, 2, [tgt(walker)])));
    expect(s.objects[walker]!.damage).toBe(1);
  });

  it("Ice Floe: taps a creature without flying that's attacking you, not a flier", () => {
    const { s: s0, ap, opp } = setup([]);
    const floe = putOnBattlefield(s0, ap, iceFloe);
    const { s: s1, walker, flier } = attackedBy(s0, ap, opp);
    expect(planActivate(s1, ap, floe, 0, [tgt(flier)])).toBeNull();
    const s = settle(run(s1, planActivate(s1, ap, floe, 0, [tgt(walker)])));
    expect(s.objects[floe]!.tapped).toBe(true);
    expect(s.objects[walker]!.tapped).toBe(true);
  });

  it("Mangara of Corondor: exiles itself and the target; gone already, only the target (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const m1 = putOnBattlefield(s0, ap, mangara);
    const t1 = putOnBattlefield(s0, opp, greenBear());
    const t2 = putOnBattlefield(s0, opp, greenBear());
    let s = settle(run(s0, planActivate(s0, ap, m1, 0, [tgt(t1)])));
    expect([zone(s, m1), zone(s, t1)]).toEqual(["exile", "exile"]);
    const m2 = putOnBattlefield(s, ap, mangara);
    s = run(s, planActivate(s, ap, m2, 0, [tgt(t2)]));
    moveObject(s, m2, "graveyard");
    s = settle(s);
    expect(zone(s, t2)).toBe("exile");
    expect(zone(s, m2)).toBe("graveyard");
  });

  it("Ravenous Demon: sacrifice a Human to transform; Archdemon of Greed eats a Human each upkeep, or taps and deals 9 damage to you", () => {
    const { s: s0, ap } = setup([]);
    const demon = putOnBattlefield(s0, ap, ravenousDemon);
    const human = () => creature("Some Human", "Creature — Human", "{W}", 1, 1, { cmc: 1 });
    const h1 = putOnBattlefield(s0, ap, human());
    const h2 = putOnBattlefield(s0, ap, human());
    let s = settle(run(s0, planActivate(s0, ap, demon, 0, undefined, undefined, undefined, undefined, { sacrifice: [h1] })));
    expect(zone(s, h1)).toBe("graveyard");
    expect(pt(s, demon)).toBe("9/9");
    const nextTurn = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    s = settle(passUntil(settle(passUntil(passUntil(s, "end", nextTurn), "upkeep", ap)), "upkeep", ap));
    expect(zone(s, h2)).toBe("graveyard");
    expect(s.objects[demon]!.tapped).toBe(false);
    const before = life(s, ap);
    s = settle(passUntil(settle(passUntil(passUntil(s, "end", nextTurn), "upkeep", ap)), "upkeep", ap));
    expect(s.objects[demon]!.tapped).toBe(true);
    expect(life(s, ap)).toBe(before - 9);
  });
});
