// Round 229: unsupported cards from the top of the popularity list. Braid of Fire ("Cumulative upkeep—Add {R}"), Umbra
// Mystic ("Auras attached to permanents you control have umbra armor"), Angel of Jubilation and Yasharn, Implacable Earth
// ("Players can't pay life or sacrifice creatures/nonland permanents to cast spells or activate abilities"), Xenagos, the
// Reveler ("You may put any number of creature and/or land cards from among them onto the battlefield" after exiling),
// Cache Grab ("If you control a Squirrel or returned a Squirrel card to your hand this way"), Karazikar, the Eye Tyrant
// ("Whenever an opponent attacks another one of your opponents") and Calix, Destiny's Hand ("until target enchantment you
// control leaves the battlefield").

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, applyAction, botActions, characteristics, closeZoneBatch, dealDamage, destroyPermanent, discardCards, objectSource, invalidateCharacteristics, isFullySupported, manaAbilityProblem, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

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
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const pt = (s: GameState, id: ObjectId) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const tokensOf = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid);
/** Puts a player's hand on top of their library, so no discard to hand size happens at cleanup. */
const trimHand = (s: GameState, pid: PlayerId) => {
  for (const id of s.players[pid]!.hand.splice(0)) {
    s.objects[id]!.zone = "library";
    s.players[pid]!.library.unshift(id);
  }
};
const attach = (s: GameState, aura: ObjectId, to: ObjectId) => {
  s.objects[aura]!.attachedTo = to;
  invalidateCharacteristics(s);
};

// Real oracle text (Scryfall).
const braid = card("Braid of Fire", "Enchantment", "{1}{R}", {"keywords":["Cumulative upkeep"],"oracleText":"Cumulative upkeep—Add {R}. (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)"});
const mystic = card("Umbra Mystic", "Creature — Human Wizard", "{2}{W}", {"power":"2","toughness":"2","oracleText":"Auras attached to permanents you control have umbra armor. (If an enchanted permanent you control would be destroyed, instead remove all damage from it and destroy an Aura attached to it.)"});
const angel = card("Angel of Jubilation", "Creature — Angel", "{1}{W}{W}{W}", {"power":"3","toughness":"3","keywords":["Flying"],"oracleText":"Flying\nOther nonblack creatures you control get +1/+1.\nPlayers can't pay life or sacrifice creatures to cast spells or activate abilities."});
const yasharn = card("Yasharn, Implacable Earth", "Legendary Creature — Elemental Boar", "{2}{G}{W}", {"power":"4","toughness":"4","oracleText":"When Yasharn enters, search your library for a basic Forest card and a basic Plains card, reveal those cards, put them into your hand, then shuffle.\nPlayers can't pay life or sacrifice nonland permanents to cast spells or activate abilities."});
const xenagos = card("Xenagos, the Reveler", "Legendary Planeswalker — Xenagos", "{2}{R}{G}", {"loyalty":"3","oracleText":"+1: Add X mana in any combination of {R} and/or {G}, where X is the number of creatures you control.\n0: Create a 2/2 red and green Satyr creature token with haste.\n−6: Exile the top seven cards of your library. You may put any number of creature and/or land cards from among them onto the battlefield."});
const cache = card("Cache Grab", "Instant", "{1}{G}", {"keywords":["Food","Mill"],"oracleText":"Mill four cards. You may put a permanent card from among the cards milled this way into your hand. If you control a Squirrel or returned a Squirrel card to your hand this way, create a Food token. (To mill four cards, put the top four cards of your library into your graveyard. A Food token is an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")"});
const karazikar = card("Karazikar, the Eye Tyrant", "Legendary Creature — Beholder", "{3}{B}{R}", {"power":"5","toughness":"5","keywords":["Goad"],"oracleText":"Whenever you attack a player, tap target creature that player controls and goad it. (Until your next turn, that creature attacks each combat if able and attacks a player other than you if able.)\nWhenever an opponent attacks another one of your opponents, you and the attacking player each draw a card and lose 1 life."});
const calix = card("Calix, Destiny's Hand", "Legendary Planeswalker — Calix", "{2}{G}{W}", {"loyalty":"4","oracleText":"+1: Look at the top four cards of your library. You may reveal an enchantment card from among them and put that card into your hand. Put the rest on the bottom of your library in a random order.\n−3: Exile target creature or enchantment you don't control until target enchantment you control leaves the battlefield.\n−7: Return all enchantment cards from your graveyard to the battlefield."});
const howler = card("Captain Howler, Sea Scourge", "Legendary Creature — Shark Pirate", "{2}{U}{R}", {"power":"5","toughness":"4","keywords":["Ward"],"oracleText":"Ward—{2}, Pay 2 life.\nWhenever you discard one or more cards, target creature gets +2/+0 until end of turn for each card discarded this way. Whenever that creature deals combat damage to a player this turn, you draw a card."});
const theorist = card("Conspiracy Theorist", "Creature — Human Shaman", "{1}{R}", {"power":"2","toughness":"2","oracleText":"Whenever this creature attacks, you may pay {1} and discard a card. If you do, draw a card.\nWhenever you discard one or more nonland cards, you may exile one of them from your graveyard. If you do, you may cast it this turn."});
const minthara = card("Minthara, Merciless Soul", "Legendary Creature — Elf Cleric", "{2}{W}{B}", {"power":"2","toughness":"2","keywords":["Ward"],"oracleText":"Minthara has ward {X}, where X is the number of experience counters you have.\nAt the beginning of your end step, if a permanent you controlled left the battlefield this turn, you get an experience counter.\nCreatures you control get +1/+0 for each experience counter you have."});
const torment = card("Everlasting Torment", "Enchantment", "{2}{B/R}", {"oracleText":"Players can't gain life.\nDamage can't be prevented.\nAll damage is dealt as though its source had wither. (A source with wither deals damage to creatures in the form of -1/-1 counters.)"});
// Helpers for the cost rules.
const griselbrand = card("Griselbrand", "Legendary Creature — Demon", "{4}{B}{B}{B}{B}", {"power":"7","toughness":"7","keywords":["Flying","Lifelink"],"oracleText":"Flying, lifelink\nPay 7 life: Draw seven cards."});
const fling = card("Fling", "Instant", "{1}{R}", {"oracleText":"As an additional cost to cast this spell, sacrifice a creature.\nFling deals damage equal to the sacrificed creature's power to any target."});
const elder = card("Sakura-Tribe Elder", "Creature — Snake Shaman", "{1}{G}", {"power":"1","toughness":"1","oracleText":"Sacrifice this creature: Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle."});
const altar = card("Ashnod's Altar", "Artifact", "{3}", {"oracleText":"Sacrifice a creature: Add {C}{C}."});
const karns = card("Karn's Sylex", "Legendary Artifact", "{3}", {"oracleText":"Karn's Sylex enters tapped.\nPlayers can't pay life to cast spells or to activate abilities that aren't mana abilities.\n{X}, {T}, Exile Karn's Sylex: Destroy each nonland permanent with mana value X or less. Activate only as a sorcery."});
const canopy = card("Horizon Canopy", "Land", "", {"oracleText":"{T}, Pay 1 life: Add {G} or {W}.\n{1}, {T}, Sacrifice this land: Draw a card."});
const treasure = card("Treasure Chest Thing", "Artifact — Treasure", "{0}", {"oracleText":"{T}, Sacrifice this artifact: Add one mana of any color."});
const umbra = card("Spider Umbra", "Enchantment — Aura", "{G}", {"keywords":["Umbra armor","Enchant"],"oracleText":"Enchant creature\nEnchanted creature gets +1/+1 and has reach. (It can block creatures with flying.)\nUmbra armor (If enchanted creature would be destroyed, instead remove all damage from it and destroy this Aura.)"});
const aura = card("Holy Strength", "Enchantment — Aura", "{W}", {"keywords":["Enchant"],"oracleText":"Enchant creature\nEnchanted creature gets +1/+2."});
const landAura = card("Fertile Ground", "Enchantment — Aura", "{1}{G}", {"keywords":["Enchant"],"oracleText":"Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional one mana of any color."});
const blackBear = card("Black Bear", "Creature — Bear", "{1}{B}", { power: "2", toughness: "2" });
const squirrelCard = card("Squirrel Mob", "Creature — Squirrel", "{1}{G}{G}", { power: "2", toughness: "2" });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const glorious = card("Glorious Anthem", "Enchantment", "{1}{W}{W}", { oracleText: "Creatures you control get +1/+1." });

describe("round 229 cards are supported", () => {
  it("compiles every line", () => supported(braid, mystic, angel, yasharn, xenagos, cache, karazikar, calix, howler, theorist, minthara, torment));
});

describe("Braid of Fire", () => {
  it("adds {R} for each age counter at your upkeep, mana that empties as the step ends", () => {
    let { s, ap } = setup([]);
    const b = putOnBattlefield(s, ap, braid);
    s = passUntil(s, "upkeep", ap);
    s = settle(s, { may: true, me: ap });
    expect(s.objects[b]!.counters.age).toBe(1);
    expect(s.players[ap]!.manaPool.R).toBe(1);
    s = passUntil(s, "draw", ap);
    expect(s.players[ap]!.manaPool.R ?? 0).toBe(0);
    s = passUntil(s, "upkeep", ap);
    s = settle(s, { may: true, me: ap });
    expect(s.objects[b]!.counters.age).toBe(2);
    expect(s.players[ap]!.manaPool.R).toBe(2);
    expect(zone(s, b)).toBe("battlefield");
  });
  it("is sacrificed when its controller doesn't add the mana", () => {
    let { s, ap } = setup([]);
    const b = putOnBattlefield(s, ap, braid);
    s = passUntil(s, "upkeep", ap);
    s = settle(s, { may: false, me: ap });
    expect(zone(s, b)).toBe("graveyard");
    expect(s.players[ap]!.manaPool.R ?? 0).toBe(0);
  });
  it("a bot keeps it", () => {
    let { s, ap } = setup([]);
    const opp = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    const b = putOnBattlefield(s, opp, braid);
    s = passUntil(s, "upkeep", opp);
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("chooseMay");
    s = act(s, botActions(s, opp)[0]!);
    expect(zone(s, b)).toBe("battlefield");
    expect(s.players[opp]!.manaPool.R).toBe(1);
  });
});

describe("Umbra Mystic", () => {
  it("gives umbra armor to any player's Auras on your permanents, not to your Auras on others' permanents", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, mystic);
    const mine = putOnBattlefield(s, ap, bear());
    const theirAura = putOnBattlefield(s, opp, aura);
    attach(s, theirAura, mine);
    const land = s.battlefield.find((id) => s.objects[id]!.controller === ap && characteristics(s, s.objects[id]!).types.includes("Land"))!;
    const onLand = putOnBattlefield(s, ap, landAura);
    attach(s, onLand, land);
    const theirs = putOnBattlefield(s, opp, bear());
    const myAura = putOnBattlefield(s, ap, aura);
    attach(s, myAura, theirs);
    expect(characteristics(s, s.objects[theirAura]!).keywords).toContain("Umbra armor");
    expect(characteristics(s, s.objects[onLand]!).keywords).toContain("Umbra armor");
    expect(characteristics(s, s.objects[myAura]!).keywords).not.toContain("Umbra armor");
    // The opponent's Aura is destroyed instead of your creature; your Aura doesn't save theirs.
    destroyPermanent(s, s.objects[mine]!, "test");
    expect(zone(s, mine)).toBe("battlefield");
    expect(zone(s, theirAura)).toBe("graveyard");
    destroyPermanent(s, s.objects[theirs]!, "test");
    expect(zone(s, theirs)).toBe("graveyard");
    // The land is saved too.
    destroyPermanent(s, s.objects[land]!, "test");
    expect(zone(s, land)).toBe("battlefield");
    expect(zone(s, onLand)).toBe("graveyard");
  });
  it("Auras that already have umbra armor are unchanged, and it stops when the Mystic leaves", () => {
    const { s, ap } = setup([]);
    const m = putOnBattlefield(s, ap, mystic);
    const b = putOnBattlefield(s, ap, bear());
    const a = putOnBattlefield(s, ap, aura);
    attach(s, a, b);
    expect(characteristics(s, s.objects[a]!).keywords).toContain("Umbra armor");
    destroyPermanent(s, s.objects[m]!, "test");
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[a]!).keywords).not.toContain("Umbra armor");
    const u = putOnBattlefield(s, ap, umbra);
    attach(s, u, b);
    destroyPermanent(s, s.objects[b]!, "test");
    expect(zone(s, b)).toBe("battlefield");
    expect(zone(s, u)).toBe("graveyard");
  });
});

describe("Angel of Jubilation", () => {
  it("gives your other nonblack creatures +1/+1", () => {
    const { s, ap, opp } = setup([]);
    const a = putOnBattlefield(s, ap, angel);
    const b = putOnBattlefield(s, ap, bear());
    const bb = putOnBattlefield(s, ap, blackBear);
    const theirs = putOnBattlefield(s, opp, bear());
    expect(pt(s, a)).toBe("3/3");
    expect(pt(s, b)).toBe("3/3");
    expect(pt(s, bb)).toBe("2/2");
    expect(pt(s, theirs)).toBe("2/2");
  });
  it("stops life and creature sacrifices as costs of spells and abilities, mana abilities too, for every player", () => {
    const { s, ap, opp, ids } = setup([fling]);
    putOnBattlefield(s, opp, angel);
    const g = putOnBattlefield(s, ap, griselbrand);
    const e = putOnBattlefield(s, ap, elder);
    const al = putOnBattlefield(s, ap, altar);
    const can = putOnBattlefield(s, ap, canopy);
    const tr = putOnBattlefield(s, ap, treasure);
    putOnBattlefield(s, ap, bear());
    expect(abilityProblem(s, ap, g, 0)).toMatch(/life/);
    expect(abilityProblem(s, ap, e, 0)).toMatch(/sacrificed/);
    expect(abilityProblem(s, ap, al, 0)).not.toBeNull();
    expect(planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])).toBeNull();
    expect(manaAbilityProblem(s, ap, s.objects[can]!, 0)).toMatch(/life/);
    // A noncreature artifact can still be sacrificed.
    expect(manaAbilityProblem(s, ap, s.objects[tr]!, 0)).toBeNull();
  });
  it("without it, the same costs can be paid; Karn's Sylex still lets mana abilities cost life", () => {
    const { s, ap, opp, ids } = setup([fling]);
    const g = putOnBattlefield(s, ap, griselbrand);
    const e = putOnBattlefield(s, ap, elder);
    const can = putOnBattlefield(s, ap, canopy);
    putOnBattlefield(s, ap, bear());
    expect(abilityProblem(s, ap, e, 0)).toBeNull();
    expect(planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])).not.toBeNull();
    putOnBattlefield(s, opp, karns);
    expect(abilityProblem(s, ap, g, 0)).toMatch(/life/);
    expect(manaAbilityProblem(s, ap, s.objects[can]!, 0)).toBeNull();
  });
  it("doesn't stop a resolving ability from having a player sacrifice a creature", () => {
    let { s, ap, opp, ids } = setup([card("Diabolic Edict", "Instant", "{1}{B}", { oracleText: "Target player sacrifices a creature." })]);
    putOnBattlefield(s, ap, angel);
    const theirs = putOnBattlefield(s, opp, bear());
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }]));
    s = settle(s, { me: ap });
    expect(zone(s, theirs)).toBe("graveyard");
  });
});

describe("Yasharn, Implacable Earth", () => {
  it("stops sacrificing nonland permanents and paying life for costs, but not sacrificing lands", () => {
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, yasharn);
    const tr = putOnBattlefield(s, ap, treasure);
    const e = putOnBattlefield(s, ap, elder);
    const can = putOnBattlefield(s, ap, canopy);
    expect(manaAbilityProblem(s, ap, s.objects[tr]!, 0)).toMatch(/sacrificed/);
    expect(abilityProblem(s, ap, e, 0)).toMatch(/sacrificed/);
    expect(manaAbilityProblem(s, ap, s.objects[can]!, 0)).toMatch(/life/);
    // Horizon Canopy's "{1}, {T}, Sacrifice this land: Draw a card": a land can still be sacrificed.
    s.players[ap]!.manaPool.C = 1;
    expect(abilityProblem(s, ap, can, 0)).toBeNull();
  });
});

describe("Xenagos, the Reveler", () => {
  it("−6 exiles the top seven and puts any number of the creature and land cards among them onto the battlefield", () => {
    let { s, ap } = setup([]);
    const x = putOnBattlefield(s, ap, xenagos);
    s.objects[x]!.counters.loyalty = 7;
    const cards = [bear({ name: "Bear A" }), card("Wastes", "Basic Land"), shock, glorious, bear({ name: "Bear B" }), card("Desert", "Land — Desert"), bear({ name: "Bear C" })];
    const lib = [...cards].reverse().map((c) => into(s, ap, c, "library")); // the first card on top
    lib.reverse();
    s = run(s, planActivate(s, ap, x, 2));
    s = settle(s, { me: ap });
    expect(s.pending?.kind).toBe("searchLibrary");
    const p = s.pending as Extract<typeof s.pending, { kind: "searchLibrary" }>;
    // Only the creature and land cards, all of them exiled already.
    expect([...p.cards].sort()).toEqual([lib[0]!, lib[1]!, lib[4]!, lib[5]!, lib[6]!].sort());
    expect(lib.every((id) => zone(s, id) === "exile")).toBe(true);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [lib[0]!, lib[1]!, lib[4]!] }), { me: ap });
    expect([lib[0], lib[1], lib[4]].map((id) => zone(s, id!))).toEqual(["battlefield", "battlefield", "battlefield"]);
    expect([lib[2], lib[3], lib[5], lib[6]].map((id) => zone(s, id!))).toEqual(["exile", "exile", "exile", "exile"]);
    expect(s.objects[x]!.counters.loyalty).toBe(1);
  });
  it("can't be asked to put a noncreature, nonland card onto the battlefield", () => {
    let { s, ap } = setup([]);
    const x = putOnBattlefield(s, ap, xenagos);
    s.objects[x]!.counters.loyalty = 6;
    const lib = Array.from({ length: 7 }, (_, i) => into(s, ap, i === 0 ? bear({ name: "Only Bear" }) : shock, "library"));
    s = run(s, planActivate(s, ap, x, 2));
    s = settle(s, { me: ap });
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [lib[1]!] })).toThrow();
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }), { me: ap });
    expect(lib.every((id) => zone(s, id) === "exile")).toBe(true);
  });
});

describe("Cache Grab", () => {
  const millSetup = (top: CardDef[]) => {
    const r = setup([cache]);
    const lib = [...top].reverse().map((c) => into(r.s, r.ap, c, "library"));
    lib.reverse();
    return { ...r, lib };
  };
  const castIt = (s: GameState, ap: PlayerId, id: ObjectId) => {
    s = run(s, planCast(s, ap, id, []));
    return settle(s, { me: ap });
  };
  const foods = (s: GameState, pid: PlayerId) => tokensOf(s, pid).filter((id) => characteristics(s, s.objects[id]!).subtypes.includes("Food"));
  it("makes a Food when you return a Squirrel card", () => {
    let { s, ap, ids, lib } = millSetup([squirrelCard, bear(), shock, glorious]);
    s = castIt(s, ap, ids[0]!);
    expect(lib.every((id) => zone(s, id) === "graveyard")).toBe(true);
    expect(s.pending?.kind).toBe("searchLibrary");
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [lib[0]!] }), { me: ap });
    expect(zone(s, lib[0]!)).toBe("hand");
    expect(foods(s, ap).length).toBe(1);
  });
  it("makes no Food for another card without a Squirrel, but does when you control one", () => {
    let { s, ap, ids, lib } = millSetup([squirrelCard, bear(), shock, glorious]);
    s = castIt(s, ap, ids[0]!);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [lib[1]!] }), { me: ap });
    expect(zone(s, lib[1]!)).toBe("hand");
    expect(foods(s, ap).length).toBe(0);
    const r = millSetup([shock, shock, shock, shock]);
    putOnBattlefield(r.s, r.ap, squirrelCard);
    s = castIt(r.s, r.ap, r.ids[0]!);
    expect(foods(s, r.ap).length).toBe(1);
  });
});

describe("Karazikar, the Eye Tyrant", () => {
  it("taps and goads a creature of each player you attack", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, karazikar);
    const atk = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, bear());
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: atk, defender: opp }] });
    expect(s.pending?.kind).toBe("chooseTargets");
    s = settle(s, { targets: [tgt(theirs)], me: ap });
    expect(s.objects[theirs]!.tapped).toBe(true);
    expect(characteristics(s, s.objects[theirs]!).goadedBy).toContain(ap);
  });
  it("draws a card and loses 1 life for you and an opponent who attacks another opponent, not when they attack you", () => {
    let { s, ap } = setup([]);
    const [opp, opp2] = [1, 2].map((k) => s.turnOrder[(s.turnOrder.indexOf(ap) + k) % 4]!);
    putOnBattlefield(s, ap, karazikar);
    const a1 = putOnBattlefield(s, opp!, bear());
    s = passUntil(s, "declareAttackers", opp);
    const [hand, oppHand, life, oppLife] = [s.players[ap]!.hand.length, s.players[opp!]!.hand.length, s.players[ap]!.life, s.players[opp!]!.life];
    s = act(s, { type: "declareAttackers", player: opp!, attacks: [{ attacker: a1, defender: opp2! }] });
    s = settle(s, { me: ap });
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.players[opp!]!.hand.length).toBe(oppHand + 1);
    expect(s.players[ap]!.life).toBe(life - 1);
    expect(s.players[opp!]!.life).toBe(oppLife - 1);
  });
  it("doesn't trigger when an opponent attacks you", () => {
    let { s, ap } = setup([]);
    const opp = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    putOnBattlefield(s, ap, karazikar);
    const a1 = putOnBattlefield(s, opp, bear());
    s = passUntil(s, "declareAttackers", opp);
    const [hand, oppHand] = [s.players[ap]!.hand.length, s.players[opp]!.hand.length];
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: a1, defender: ap }] });
    s = settle(s, { me: ap });
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.players[opp]!.hand.length).toBe(oppHand);
  });
});

describe("Calix, Destiny's Hand", () => {
  it("−3 exiles until the target enchantment leaves, then the card returns", () => {
    let { s, ap, opp } = setup([]);
    const c = putOnBattlefield(s, ap, calix);
    s.objects[c]!.counters.loyalty = 4;
    const anchor = putOnBattlefield(s, ap, glorious);
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    s = run(s, planActivate(s, ap, c, 1, [tgt(theirs), tgt(anchor)]));
    s = settle(s, { me: ap });
    expect(zone(s, theirs)).toBe("exile");
    expect(zone(s, c)).toBe("battlefield");
    destroyPermanent(s, s.objects[anchor]!, "test");
    s = settle(s, { me: ap });
    const back = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Their Bear");
    expect(back).toBeTruthy();
    expect(s.objects[back!]!.controller).toBe(opp);
  });
  it("exiles nothing if the enchantment left before it resolved", () => {
    let { s, ap, opp } = setup([]);
    const c = putOnBattlefield(s, ap, calix);
    s.objects[c]!.counters.loyalty = 4;
    const anchor = putOnBattlefield(s, ap, glorious);
    const theirs = putOnBattlefield(s, opp, bear());
    s = run(s, planActivate(s, ap, c, 1, [tgt(theirs), tgt(anchor)]));
    destroyPermanent(s, s.objects[anchor]!, "test");
    s = settle(s, { me: ap });
    expect(zone(s, theirs)).toBe("battlefield");
  });
});

describe("Captain Howler, Sea Scourge", () => {
  it("gives +2/+0 for each card discarded in the event, then draws when that creature deals combat damage to a player", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, howler);
    const b = putOnBattlefield(s, ap, bear());
    const cards = [shock, glorious, shock].map((c) => into(s, ap, c, "hand"));
    discardCards(s, ap, cards);
    closeZoneBatch(s);
    s = settle(s, { targets: [tgt(b)], me: ap });
    expect(pt(s, b)).toBe("8/2");
    s = passUntil(s, "declareAttackers", ap);
    const hand = s.players[ap]!.hand.length;
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    s = passUntil(s, "main2", ap);
    s = settle(s, { me: ap });
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    // It wore off at the end of the turn.
    trimHand(s, ap);
    s = passUntil(s, "upkeep", opp);
    expect(pt(s, b)).toBe("2/2");
  });
});

describe("Conspiracy Theorist", () => {
  it("exiles one of the discarded nonland cards, which may be cast this turn", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, theorist);
    const [sh, land] = [into(s, ap, shock, "hand"), into(s, ap, card("Wastes", "Basic Land"), "hand")];
    const old = into(s, ap, glorious, "graveyard");
    discardCards(s, ap, [sh, land]);
    closeZoneBatch(s);
    s = settle(s, { may: true, me: ap });
    expect(s.pending?.kind).toBe("searchLibrary");
    const p = s.pending as Extract<typeof s.pending, { kind: "searchLibrary" }>;
    // Only the nonland card that event discarded, not the land or an older card.
    expect(p.cards).toEqual([sh]);
    expect(p.cards).not.toContain(old);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [sh] }), { me: ap });
    expect(zone(s, sh)).toBe("exile");
    expect(zone(s, land)).toBe("graveyard");
    const opp = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    expect(planCast(s, ap, sh, [{ kind: "player", id: opp }])).not.toBeNull();
    // Not after this turn.
    trimHand(s, ap);
    s = passUntil(s, "upkeep", opp);
    expect(planCast(s, ap, sh, [{ kind: "player", id: opp }])).toBeNull();
  });
  it("doesn't trigger for lands alone", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, theorist);
    const land = into(s, ap, card("Wastes", "Basic Land"), "hand");
    discardCards(s, ap, [land]);
    closeZoneBatch(s);
    expect(s.triggerQueue.length + s.stack.length).toBe(0);
  });
});

describe("Minthara, Merciless Soul", () => {
  const targetIt = (exp: number) => {
    let { s, ap, opp } = setup([]);
    const m = putOnBattlefield(s, ap, minthara);
    s.players[ap]!.experience = exp;
    const sh = into(s, opp, shock, "hand");
    s.players[opp]!.manaPool.R = 1;
    s = act(s, { type: "passPriority", player: ap });
    while (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = run(s, planCast(s, opp, sh, [tgt(m)]));
    s = settle(s, { me: ap });
    return { s, m, sh };
  };
  it("has ward {X} for its controller's experience counters", () => {
    const { s, m, sh } = targetIt(2);
    expect(zone(s, sh)).toBe("graveyard");
    expect(zone(s, m)).toBe("battlefield");
    expect(s.objects[m]!.damage).toBe(0);
  });
  it("with no experience counters, ward {0} is paid", () => {
    const { s, m } = targetIt(0);
    expect(zone(s, m)).toBe("graveyard");
  });
});

describe("Everlasting Torment", () => {
  it("makes all damage to creatures -1/-1 counters, not to players", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, opp, torment);
    const src = putOnBattlefield(s, ap, bear({ name: "Pinger" }));
    const big = putOnBattlefield(s, opp, card("Big Bear", "Creature — Bear", "{3}", { power: "3", toughness: "3" }));
    dealDamage(s, objectSource(s, s.objects[src]!), { object: s.objects[big]! }, 2);
    expect(s.objects[big]!.counters["-1/-1"]).toBe(2);
    expect(s.objects[big]!.damage).toBe(0);
    invalidateCharacteristics(s);
    expect(pt(s, big)).toBe("1/1");
    const life = s.players[opp]!.life;
    dealDamage(s, objectSource(s, s.objects[src]!), { player: opp }, 2);
    expect(s.players[opp]!.life).toBe(life - 2);
  });
});
