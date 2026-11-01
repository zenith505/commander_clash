// Round 231: cards from the top of the popularity list. Loot, the Key to Everything ("the number of card types among
// other nonland permanents you control"); Witch-king, Sky Scourge ("Whenever you attack with one or more Wraiths, exile
// the top X cards of your library, where X is their total power"); Kaya, Orzhov Usurper; Shadow of the Enemy; Inside
// Information; Amareth, the Lustrous; Ashiok, Nightmare Weaver; Connecting the Dots (Bomat Courier and Moonring Mirror
// came along); Prowling Geistcatcher; Typhoid Mary, Fractured; Genku, Future Shaper; Unexpected Results; Moment of
// Reckoning.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, applyAction, botActions, castProblem, characteristics, closeZoneBatch, destroyPermanent, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

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
const activatedIndex = (s: GameState, id: ObjectId, re: RegExp) => {
  const i = abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => re.test(a.text));
  if (i < 0) throw new Error(`no ability ${re}`);
  return i;
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

// Real oracle text (Scryfall).
const loot = card("Loot, the Key to Everything", "Legendary Creature — Beast Noble", "{G}{U}{R}", {"power":"1","toughness":"2","keywords":["Ward"],"oracleText":"Ward {1}\nAt the beginning of your upkeep, exile the top X cards of your library, where X is the number of card types among other nonland permanents you control. You may play those cards this turn."});
const witchKing = card("Witch-king, Sky Scourge", "Legendary Creature — Wraith Noble", "{5}{B}{R}", {"power":"5","toughness":"5","keywords":["Flying","Undying"],"oracleText":"Flying\nWhenever you attack with one or more Wraiths, exile the top X cards of your library, where X is their total power. You may play those cards this turn.\nUndying (When this creature dies, if it had no +1/+1 counters on it, return it to the battlefield under its owner's control with a +1/+1 counter on it.)"});
const kaya = card("Kaya, Orzhov Usurper", "Legendary Planeswalker — Kaya", "{1}{W}{B}", {"loyalty":"3","oracleText":"+1: Exile up to two target cards from a single graveyard. You gain 2 life if at least one creature card was exiled this way.\n−1: Exile target nonland permanent with mana value 1 or less.\n−5: Kaya deals damage to target player equal to the number of cards that player owns in exile and you gain that much life."});
const shadow = card("Shadow of the Enemy", "Sorcery", "{3}{B}{B}{B}", {"oracleText":"Exile all creature cards from target player's graveyard. You may cast spells from among those cards for as long as they remain exiled, and mana of any type can be spent to cast them."});
const inside = card("Inside Information", "Sorcery", "{X}{B}{B}", {"oracleText":"Exile the top X cards of target opponent's library. You may play those cards this turn. If you cast a spell this way, pay life equal to its mana value rather than pay its mana cost."});
const amareth = card("Amareth, the Lustrous", "Legendary Creature — Dragon", "{3}{G}{W}{U}", {"power":"6","toughness":"6","keywords":["Flying"],"oracleText":"Flying\nWhenever another permanent you control enters, look at the top card of your library. If it shares a card type with that permanent, you may reveal that card and put it into your hand."});
const ashiok = card("Ashiok, Nightmare Weaver", "Legendary Planeswalker — Ashiok", "{1}{U}{B}", {"loyalty":"3","oracleText":"+2: Exile the top three cards of target opponent's library.\n−X: Put a creature card with mana value X exiled with Ashiok onto the battlefield under your control. That creature is a Nightmare in addition to its other types.\n−10: Exile all cards from all opponents' hands and graveyards."});
const dots = card("Connecting the Dots", "Enchantment", "{1}{R}", {"oracleText":"Whenever a creature you control attacks, exile the top card of your library face down. (You can't look at it.)\n{1}{R}, Discard your hand, Sacrifice this enchantment: Put all cards exiled with this enchantment into their owners' hands."});
const geistcatcher = card("Prowling Geistcatcher", "Creature — Human Rogue", "{3}{B}", {"power":"2","toughness":"4","oracleText":"Whenever you sacrifice another creature, exile it. If that creature was a token, put a +1/+1 counter on this creature.\nWhen this creature leaves the battlefield, return each card exiled with it to the battlefield under your control."});
const typhoid = card("Typhoid Mary, Fractured", "Legendary Creature — Mutant Villain", "{1}{B}{R}", {"power":"3","toughness":"3","keywords":["Mary","Typhoid Mary","Bloody Mary","Treasure"],"oracleText":"Whenever Typhoid Mary attacks, choose one at random. If you discarded a card this turn, you choose one instead.\n• Mary — Create a Treasure token.\n• Typhoid Mary — Draw a card.\n• Bloody Mary — Each opponent loses 2 life and you gain 2 life."});
const genku = card("Genku, Future Shaper", "Legendary Creature — Moonfolk Wizard", "{2}{W}{U}", {"power":"2","toughness":"5","oracleText":"Whenever another nontoken permanent you control leaves the battlefield, choose one that hasn't been chosen this turn. Create a creature token with those characteristics.\n• 2/2 white Fox with vigilance.\n• 1/2 blue Moonfolk with flying.\n• 1/1 black Rat with lifelink.\n{3}{W}{U}: Put a +1/+1 counter on each creature you control."});
const unexpected = card("Unexpected Results", "Sorcery", "{2}{G}{U}", {"oracleText":"Shuffle your library, then reveal the top card. If it's a nonland card, you may cast it without paying its mana cost. If it's a land card, you may put it onto the battlefield and return Unexpected Results to its owner's hand."});
const reckoning = card("Moment of Reckoning", "Sorcery", "{3}{W}{W}{B}{B}", {"oracleText":"Choose up to four. You may choose the same mode more than once.\n• Destroy target nonland permanent.\n• Return target nonland permanent card from your graveyard to the battlefield."});
const bomat = card("Bomat Courier", "Artifact Creature — Construct", "{1}", {"power":"1","toughness":"1","keywords":["Haste"],"oracleText":"Haste\nWhenever this creature attacks, exile the top card of your library face down. (You can't look at it.)\n{R}, Discard your hand, Sacrifice this creature: Put all cards exiled with this creature into their owners' hands."});
const moonring = card("Moonring Mirror", "Artifact", "{5}", {"oracleText":"Whenever you draw a card, exile the top card of your library face down.\nAt the beginning of your upkeep, you may exile all cards from your hand face down. If you do, put all other cards you own exiled with this artifact into your hand."});
// Helpers.
const ornithopter = card("Ornithopter", "Artifact Creature — Thopter", "{0}", { power: "0", toughness: "2", keywords: ["Flying"], oracleText: "Flying" });
const pacifism = card("Test Aura Field", "Enchantment", "{1}{W}", { oracleText: "Creatures can't attack you unless their controller pays {1} for each creature they control that's attacking you." });
const vault = card("Vault of Whispers", "Artifact Land", "", { oracleText: "{T}: Add {B}." });
const wraith = card("Test Wraith", "Creature — Wraith", "{1}{B}", { power: "2", toughness: "2" });
const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });
const outlet = card("Test Altar", "Artifact", "{1}", { oracleText: "Sacrifice a creature: You gain 1 life." });
const murder = card("Test Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });
const bigBear = card("Test Ogre", "Creature — Ogre", "{2}{R}{R}", { power: "4", toughness: "3" });
const wrath = card("Test Wrath", "Sorcery", "{2}{W}{W}", { oracleText: "Destroy all creatures." });
const looting = card("Test Looting", "Sorcery", "{R}", { oracleText: "Draw two cards, then discard two cards." });
/** Replaces a player's library with fresh copies of `def`. */
const libraryOf = (s: GameState, pid: PlayerId, def: CardDef, n: number) => {
  const p = s.players[pid]!;
  for (const id of p.library.splice(0)) {
    s.objects[id]!.zone = "exile";
    p.exile.push(id);
  }
  return Array.from({ length: n }, () => into(s, pid, def, "library"));
};

describe("round 231: parse", () => {
  it("every card of the round is fully supported", () => supported(loot, witchKing, kaya, shadow, inside, amareth, ashiok, dots, geistcatcher, typhoid, genku, unexpected, reckoning, bomat, moonring));
});

describe("round 231: Loot, the Key to Everything", () => {
  it("exiles one card for each card type among its controller's other nonland permanents, to play this turn", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, loot);
    // Artifact and creature; enchantment; an artifact land counts for nothing (rulings); Loot itself isn't counted.
    putOnBattlefield(s, ap, ornithopter);
    putOnBattlefield(s, ap, pacifism);
    putOnBattlefield(s, ap, vault);
    trimHand(s, ap);
    const exiled = s.players[ap]!.exile.length;
    s = passUntil(s, "end", ap);
    s = passUntil(s, "upkeep", ap);
    s = settle(s);
    const now = s.players[ap]!.exile.slice(exiled);
    expect(now.length).toBe(3);
    expect(now.every((id) => s.objects[id]!.mayPlay?.player === ap && s.objects[id]!.mayPlay?.until === "thisTurn")).toBe(true);
  });
});

describe("round 231: Witch-king, Sky Scourge", () => {
  it("attacking with Wraiths exiles cards equal to the Wraiths' total power; other attackers don't count", () => {
    let { s, ap, opp } = setup([]);
    const wk = putOnBattlefield(s, ap, witchKing);
    const w = putOnBattlefield(s, ap, wraith);
    const b = putOnBattlefield(s, ap, bear());
    trimHand(s, ap);
    const exiled = s.players[ap]!.exile.length;
    s = attack(s, ap, [wk, w, b].map((attacker) => ({ attacker, defender: opp })));
    s = settle(s, { me: ap });
    const now = s.players[ap]!.exile.slice(exiled);
    expect(now.length).toBe(7);
    expect(now.every((id) => s.objects[id]!.mayPlay?.player === ap)).toBe(true);
  });

  it("a Wraith gone by the time it resolves counts with its power as it last existed (rulings)", () => {
    let { s, ap, opp } = setup([]);
    const wk = putOnBattlefield(s, ap, witchKing);
    const w = putOnBattlefield(s, ap, wraith);
    trimHand(s, ap);
    const exiled = s.players[ap]!.exile.length;
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [wk, w].map((attacker) => ({ attacker, defender: opp })) });
    for (let i = 0; i < 20 && !s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.stack.length).toBe(1);
    destroyPermanent(s, s.objects[w]!, "Test Wraith is destroyed.");
    closeZoneBatch(s);
    s = settle(s, { me: ap });
    expect(zone(s, w)).toBe("graveyard");
    expect(s.players[ap]!.exile.slice(exiled).length).toBe(7);
  });

  it("doesn't trigger without a Wraith attacking", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, witchKing);
    const b = putOnBattlefield(s, ap, bear());
    trimHand(s, ap);
    const exiled = s.players[ap]!.exile.length;
    s = attack(s, ap, [{ attacker: b, defender: opp }]);
    s = settle(s, { me: ap });
    expect(s.players[ap]!.exile.length).toBe(exiled);
  });
});

describe("round 231: Kaya, Orzhov Usurper", () => {
  it("+1 exiles up to two cards from one graveyard and gains 2 life if a creature card was exiled", () => {
    let { s, ap, opp } = setup([]);
    const k = putOnBattlefield(s, ap, kaya);
    s.objects[k]!.counters.loyalty = 3;
    const c = into(s, opp, bear(), "graveyard");
    const d = into(s, opp, divination, "graveyard");
    const life = s.players[ap]!.life;
    s = settle(run(s, planActivate(s, ap, k, 0, [tgt(c), tgt(d)])));
    expect([zone(s, c), zone(s, d)]).toEqual(["exile", "exile"]);
    expect(s.players[ap]!.life).toBe(life + 2);
    expect(s.objects[k]!.counters.loyalty).toBe(4);
  });

  it("+1 gains no life when no creature card was exiled, and can't take cards from two graveyards", () => {
    let { s, ap, opp } = setup([]);
    const k = putOnBattlefield(s, ap, kaya);
    s.objects[k]!.counters.loyalty = 3;
    const d = into(s, opp, divination, "graveyard");
    const mine = into(s, ap, bear(), "graveyard");
    expect(planActivate(s, ap, k, 0, [tgt(d), tgt(mine)])).toBeNull();
    const life = s.players[ap]!.life;
    s = settle(run(s, planActivate(s, ap, k, 0, [tgt(d), { kind: "none" }])));
    expect(zone(s, d)).toBe("exile");
    expect(s.players[ap]!.life).toBe(life);
  });

  it("−5 deals damage equal to the cards the target player owns in exile, and you gain that much life", () => {
    let { s, ap, opp } = setup([]);
    const k = putOnBattlefield(s, ap, kaya);
    s.objects[k]!.counters.loyalty = 6;
    for (let i = 0; i < 4; i++) into(s, opp, bear(), "exile");
    // A card of yours doesn't count.
    into(s, ap, bear(), "exile");
    const owned = s.players[opp]!.exile.filter((id) => s.objects[id]!.owner === opp).length;
    const [mine, theirs] = [s.players[ap]!.life, s.players[opp]!.life];
    s = settle(run(s, planActivate(s, ap, k, activatedIndex(s, k, /^−5/), [ply(opp)])));
    expect(s.players[opp]!.life).toBe(theirs - owned);
    expect(s.players[ap]!.life).toBe(mine + owned);
  });
});

describe("round 231: Shadow of the Enemy", () => {
  it("exiles the creature cards from the target player's graveyard, castable with any type of mana while exiled", () => {
    let { s, ap, opp, ids } = setup([shadow]);
    const c1 = into(s, opp, bigBear, "graveyard");
    const c2 = into(s, opp, bear(), "graveyard");
    const d = into(s, opp, divination, "graveyard");
    poolOnly(s, ap, { B: 6 });
    s = settle(run(s, planCast(s, ap, ids[0]!, [ply(opp)])));
    expect([zone(s, c1), zone(s, c2), zone(s, d)]).toEqual(["exile", "exile", "graveyard"]);
    expect(s.objects[c1]!.mayPlay).toMatchObject({ player: ap, until: "exiled", castOnly: true, anyType: true });
    // {2}{R}{R} paid with black mana.
    poolOnly(s, ap, { B: 4 });
    s = settle(run(s, planCast(s, ap, c1)));
    expect(zone(s, c1)).toBe("battlefield");
    expect(s.objects[c1]!.controller).toBe(ap);
    // Still castable on a later turn.
    s = passUntil(s, "upkeep", opp);
    expect(s.objects[c2]!.mayPlay?.player).toBe(ap);
  });
});

describe("round 231: Inside Information", () => {
  it("exiles the top X cards of the opponent's library; a spell among them is cast for life equal to its mana value", () => {
    let { s, ap, opp, ids } = setup([inside]);
    const top = into(s, opp, divination, "library");
    poolOnly(s, ap, { B: 4 });
    s = settle(run(s, planCast(s, ap, ids[0]!, [ply(opp)], undefined, undefined, 2)));
    expect(zone(s, top)).toBe("exile");
    expect(s.players[opp]!.exile.filter((id) => s.objects[id]!.mayPlay?.player === ap).length).toBe(2);
    // Only for life (no mana in the pool now).
    expect(castProblem(s, ap, top, undefined, undefined, undefined, undefined, undefined, { alt: "citadel" })).toBeNull();
    const life = s.players[ap]!.life;
    s = settle(run(s, planCast(s, ap, top, undefined, undefined, undefined, undefined, { alt: "citadel" })));
    expect(zone(s, top)).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(life - 3);
  });
});

describe("round 231: Amareth, the Lustrous", () => {
  it("a creature entering finds a creature card on top: you may reveal it and put it into your hand", () => {
    let { s, ap, ids } = setup([bear()]);
    putOnBattlefield(s, ap, amareth);
    const top = into(s, ap, bigBear, "library");
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(zone(s, top)).toBe("hand");
  });

  it("a card sharing no card type stays on top; declining keeps it there too", () => {
    let { s, ap, ids } = setup([bear(), ornithopter]);
    putOnBattlefield(s, ap, amareth);
    const top = into(s, ap, divination, "library");
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(s.players[ap]!.library[0]).toBe(top);
    const top2 = into(s, ap, bigBear, "library");
    s = settle(run(s, planCast(s, ap, ids[1]!)), { may: false });
    expect(s.players[ap]!.library[0]).toBe(top2);
  });
});

describe("round 231: Ashiok, Nightmare Weaver", () => {
  it("+2 exiles the top three of an opponent's library; −X puts a creature card with mana value X from among them onto the battlefield as a Nightmare", () => {
    let { s, ap, opp } = setup([]);
    const a = putOnBattlefield(s, ap, ashiok);
    s.objects[a]!.counters.loyalty = 3;
    const b2 = into(s, opp, bear(), "library");
    const ogre = into(s, opp, bigBear, "library");
    const b1 = into(s, opp, divination, "library");
    s = settle(run(s, planActivate(s, ap, a, 0, [ply(opp)])));
    expect([zone(s, b1), zone(s, ogre), zone(s, b2)]).toEqual(["exile", "exile", "exile"]);
    expect(s.objects[a]!.counters.loyalty).toBe(5);
    // Next turn: −4 for the Ogre (mana value 4).
    s = passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    s = passUntil(s, "main1", ap);
    s = run(s, planActivate(s, ap, a, 1, undefined, undefined, undefined, 4));
    s = settle(s);
    if (s.pending?.kind === "searchLibrary") {
      expect(s.pending.cards).toEqual([ogre]);
      s = settle(act(s, { type: "searchLibrary", player: ap, found: [ogre] }));
    }
    expect(zone(s, ogre)).toBe("battlefield");
    expect(s.objects[ogre]!.controller).toBe(ap);
    expect(characteristics(s, s.objects[ogre]!).subtypes).toEqual(expect.arrayContaining(["Ogre", "Nightmare"]));
    expect(s.objects[a]!.counters.loyalty).toBe(1);
  });

  it("−10's exiled cards, from hands too, are exiled with Ashiok as well (rulings)", () => {
    let { s, ap, opp } = setup([]);
    const a = putOnBattlefield(s, ap, ashiok);
    s.objects[a]!.counters.loyalty = 12;
    const inHand = into(s, opp, bear(), "hand");
    const inYard = into(s, opp, bigBear, "graveyard");
    s = settle(run(s, planActivate(s, ap, a, 2)));
    expect([zone(s, inHand), zone(s, inYard)]).toEqual(["exile", "exile"]);
    expect(s.players[opp]!.hand.length).toBe(0);
    s.objects[a]!.counters.loyalty = 5;
    s = passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    s = passUntil(s, "main1", ap);
    s = settle(run(s, planActivate(s, ap, a, 1, undefined, undefined, undefined, 2)));
    if (s.pending?.kind === "searchLibrary") s = settle(act(s, { type: "searchLibrary", player: ap, found: [inHand] }));
    expect(zone(s, inHand)).toBe("battlefield");
  });
});

describe("round 231: Connecting the Dots", () => {
  it("each attacking creature exiles the top card face down; the sacrifice puts them into your hand after discarding it", () => {
    let { s, ap, opp, ids } = setup([divination]);
    const d = putOnBattlefield(s, ap, dots);
    const b1 = putOnBattlefield(s, ap, bear());
    const b2 = putOnBattlefield(s, ap, bear());
    const tops = s.players[ap]!.library.slice(0, 2);
    s = attack(s, ap, [b1, b2].map((attacker) => ({ attacker, defender: opp })));
    s = settle(s, { me: ap });
    expect(tops.map((id) => zone(s, id))).toEqual(["exile", "exile"]);
    expect(tops.every((id) => s.objects[id]!.hiddenExile?.seen.length === 0)).toBe(true);
    s = passUntil(s, "main2", ap);
    poolOnly(s, ap, { R: 1, C: 1 });
    s = settle(run(s, planActivate(s, ap, d, 0)));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(zone(s, d)).toBe("graveyard");
    expect(tops.map((id) => zone(s, id))).toEqual(["hand", "hand"]);
  });
});

describe("round 231: Prowling Geistcatcher", () => {
  it("exiles each other creature you sacrifice, grows for a token, and returns them all under your control when it leaves", () => {
    let { s, ap, opp, ids } = setup([murder]);
    const g = putOnBattlefield(s, ap, geistcatcher);
    const altar = putOnBattlefield(s, ap, outlet);
    const mine = putOnBattlefield(s, ap, bear());
    // A creature you control but don't own (rulings): returned under your control too.
    const stolen = putOnBattlefield(s, opp, bigBear);
    s.objects[stolen]!.controller = ap;
    const tok = putOnBattlefield(s, ap, card("Spirit Token", "Creature — Spirit", "", { power: "1", toughness: "1" }));
    s.objects[tok]!.isToken = true;
    invalidateCharacteristics(s);
    for (const id of [mine, stolen, tok]) s = settle(run(s, planActivate(s, ap, altar, 0, undefined, undefined, undefined, undefined, { sacrifice: [id] })));
    expect([zone(s, mine), zone(s, stolen)]).toEqual(["exile", "exile"]);
    expect(s.objects[g]!.counters["+1/+1"]).toBe(1);
    expect(`${power(s, s.objects[g]!)}/${toughness(s, s.objects[g]!)}`).toBe("3/5");
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(g)])));
    expect(zone(s, g)).toBe("graveyard");
    expect([zone(s, mine), zone(s, stolen)]).toEqual(["battlefield", "battlefield"]);
    expect([s.objects[mine]!.controller, s.objects[stolen]!.controller]).toEqual([ap, ap]);
  });
});

describe("round 231: Bomat Courier and Moonring Mirror (face-down exile of the top card)", () => {
  it("Bomat Courier exiles the top card face down as it attacks, and its sacrifice puts it into your hand", () => {
    let { s, ap, opp } = setup([]);
    const b = putOnBattlefield(s, ap, bomat);
    const top = s.players[ap]!.library[0]!;
    s = attack(s, ap, [{ attacker: b, defender: opp }]);
    s = settle(s, { me: ap });
    expect(zone(s, top)).toBe("exile");
    s = passUntil(s, "main2", ap);
    poolOnly(s, ap, { R: 1 });
    s = settle(run(s, planActivate(s, ap, b, 0)));
    expect(zone(s, top)).toBe("hand");
  });

  it("Moonring Mirror exiles the top card face down as you draw; at upkeep it trades your hand for those cards", () => {
    let { s, ap, ids } = setup([looting]);
    putOnBattlefield(s, ap, moonring);
    s = settle(run(s, planCast(s, ap, ids[0]!)), { me: ap });
    if (s.pending?.kind === "discard" || s.pending?.kind === "chooseCards") s = settle(act(s, botActions(s, ap)[0]!), { me: ap });
    const hidden = s.players[ap]!.exile.filter((id) => s.objects[id]!.hiddenExile);
    expect(hidden.length).toBe(2);
    trimHand(s, ap);
    const keep = into(s, ap, divination, "hand");
    s = passUntil(s, "end", ap);
    s = passUntil(s, "upkeep", ap);
    s = settle(s, { me: ap });
    expect(zone(s, keep)).toBe("exile");
    expect(hidden.every((id) => zone(s, id) === "hand")).toBe(true);
  });
});

describe("round 231: Typhoid Mary, Fractured", () => {
  it("chooses one mode at random as it attacks", () => {
    let { s, ap, opp } = setup([]);
    const t = putOnBattlefield(s, ap, typhoid);
    trimHand(s, ap);
    const before = { life: s.players[ap]!.life, hand: s.players[ap]!.hand.length, perms: s.battlefield.length };
    s = attack(s, ap, [{ attacker: t, defender: opp }]);
    expect(s.pending?.kind).not.toBe("chooseModes");
    s = settle(s, { me: ap });
    const happened = [s.battlefield.length > before.perms, s.players[ap]!.hand.length > before.hand, s.players[ap]!.life > before.life];
    expect(happened.filter(Boolean).length).toBe(1);
  });

  it("if you discarded a card this turn, you choose the mode instead", () => {
    let { s, ap, opp, ids } = setup([looting, divination, divination]);
    const t = putOnBattlefield(s, ap, typhoid);
    poolOnly(s, ap, { R: 1 });
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s, { me: ap });
    if (s.pending?.kind === "discard" || s.pending?.kind === "chooseCards") s = settle(act(s, botActions(s, ap)[0]!), { me: ap });
    expect(s.players[ap]!.graveyard.length).toBeGreaterThanOrEqual(3);
    s.objects[t]!.tapped = false;
    trimHand(s, ap);
    s = attack(s, ap, [{ attacker: t, defender: opp }]);
    expect(s.pending?.kind).toBe("chooseModes");
    const life = s.players[opp]!.life;
    s = act(s, { type: "chooseModes", player: ap, modes: [2] });
    s = settle(s, { me: ap });
    expect(s.players[opp]!.life).toBe(life - 2);
  });
});

describe("round 231: Genku, Future Shaper", () => {
  it("each other nontoken permanent leaving makes a token of a mode not chosen this turn; a fourth makes none", () => {
    let { s, ap, ids } = setup([wrath]);
    putOnBattlefield(s, ap, genku);
    for (let i = 0; i < 4; i++) putOnBattlefield(s, ap, bear());
    const tokens = () => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap);
    s = settle(run(s, planCast(s, ap, ids[0]!)), { me: ap });
    // Each trigger asks in turn; the first one that can still be chosen each time.
    for (let i = 0; i < 6 && s.pending?.kind === "chooseModes"; i++) {
      const legal = s.pending.legal;
      s = settle(act(s, { type: "chooseModes", player: ap, modes: [legal.indexOf(true)] }), { me: ap });
    }
    // Genku died with them; its triggers still each choose a different mode (rulings).
    const made = tokens().map((id) => characteristics(s, s.objects[id]!).subtypes[0]).sort();
    expect(made).toEqual(["Fox", "Moonfolk", "Rat"]);
  });

  it("a new turn lets the modes be chosen again", () => {
    let { s, ap, opp, ids } = setup([murder, murder]);
    putOnBattlefield(s, ap, genku);
    const b1 = putOnBattlefield(s, ap, bear());
    const b2 = putOnBattlefield(s, ap, bear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(b1)])), { me: ap });
    if (s.pending?.kind === "chooseModes") s = settle(act(s, { type: "chooseModes", player: ap, modes: [0] }), { me: ap });
    s = passUntil(s, "main1", opp);
    s = passUntil(s, "main1", ap);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(b2)])), { me: ap });
    expect(s.pending?.kind).toBe("chooseModes");
    if (s.pending?.kind !== "chooseModes") throw new Error();
    expect(s.pending.legal).toEqual([true, true, true]);
  });
});

describe("round 231: Unexpected Results", () => {
  it("a nonland card on top may be cast for free as it resolves; the spell goes to the graveyard", () => {
    let { s, ap, ids } = setup([unexpected]);
    libraryOf(s, ap, divination, 5);
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s, { me: ap });
    expect(s.pending?.kind).toBe("castFree");
    if (s.pending?.kind !== "castFree") throw new Error();
    const div = s.pending.objectId;
    s = settle(act(s, { type: "castSpell", player: ap, objectId: div, payment: [], targets: [] } as unknown as Action), { me: ap });
    expect(zone(s, div)).toBe("graveyard");
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });

  it("a land card may be put onto the battlefield, returning the spell to its owner's hand; declined, both stay", () => {
    let { s, ap, ids } = setup([unexpected]);
    const lands = libraryOf(s, ap, card("Test Wastes", "Land", "", { oracleText: "{T}: Add {C}." }), 5);
    s = settle(run(s, planCast(s, ap, ids[0]!)), { me: ap, may: true });
    expect(lands.filter((id) => zone(s, id) === "battlefield").length).toBe(1);
    expect(zone(s, ids[0]!)).toBe("hand");
    s = settle(run(s, planCast(s, ap, ids[0]!)), { me: ap, may: false });
    expect(lands.filter((id) => zone(s, id) === "battlefield").length).toBe(1);
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });
});

describe("round 231: Moment of Reckoning", () => {
  it("chooses up to four modes, the same one more than once", () => {
    let { s, ap, opp, ids } = setup([reckoning]);
    const a = putOnBattlefield(s, opp, bear());
    const b = putOnBattlefield(s, opp, pacifism);
    const back = into(s, ap, bigBear, "graveyard");
    poolOnly(s, ap, { W: 2, B: 2, C: 3 });
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(a), tgt(b), tgt(back)], [0, 0, 1])), { me: ap });
    expect([zone(s, a), zone(s, b), zone(s, back)]).toEqual(["graveyard", "graveyard", "battlefield"]);
    // Four is the most.
    const { s: s2, ap: ap2, opp: opp2, ids: ids2 } = setup([reckoning]);
    const xs = Array.from({ length: 5 }, () => putOnBattlefield(s2, opp2, bear()));
    poolOnly(s2, ap2, { W: 2, B: 2, C: 3 });
    expect(planCast(s2, ap2, ids2[0]!, xs.map(tgt), [0, 0, 0, 0, 0])).toBeNull();
    expect(planCast(s2, ap2, ids2[0]!, xs.slice(0, 4).map(tgt), [0, 0, 0, 0])).not.toBeNull();
  });
});
