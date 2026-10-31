// Round 227: unsupported cards from the top of the popularity list. Roshan, Hidden Magister ("Other creatures you control
// are Assassins ... The same is true for creature spells you control and creature cards you own that aren't on the
// battlefield"), Tale of Katara and Toph ("becomes tapped for the first time during each of your turns"), Behemoth of
// Vault 0 ("pay an amount of {E} equal to target nonland permanent's mana value. When you do, destroy that permanent"),
// Siona, Captain of the Pyleas ("Whenever an Aura you control becomes attached to a creature you control"), Glissa's
// Retriever ("exile it. When you do, ... where X is the number of opponents who have three or more poison counters") and
// Xu-Ifit, Osteoharmonist ("It's a Skeleton in addition to its other types and has no abilities"), Lorehold, the
// Historian ("Each instant and sorcery card in your hand has miracle {2}") and Dune Chanter ("Lands you control and land
// cards you own that aren't on the battlefield are Deserts in addition to their other types"), among others.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, applyAction, defOf, draw, madnessCastOf, botActions, characteristics, compileCard, destroyPermanent, invalidateCharacteristics, isFullySupported, legalActions, objIsType, planActivate, planCast, tapPermanent, untapPermanent, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

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
/** Passes (bots answer their own questions) until `me` is asked for targets. */
const untilTargets = (s: GameState, me: PlayerId) => {
  for (let i = 0; i < 300 && s.pending?.kind !== "chooseTargets"; i++) {
    const p = s.pending;
    if (p && p.player !== me) s = act(s, botActions(s, p.player)[0]!);
    else if (p) throw new Error(`unexpected ${p.kind}`);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tokensOf = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid);

// Real oracle text (Scryfall).
const roshan = card("Roshan, Hidden Magister", "Legendary Creature — Human Assassin", "{3}{B}", {"power":"4","toughness":"4","oracleText":"Other creatures you control are Assassins in addition to their other types. The same is true for creature spells you control and creature cards you own that aren't on the battlefield.\nFace-down creatures you control have menace.\nWhenever a permanent you control is turned face up, you draw a card and you lose 1 life."});
const tale = card("Tale of Katara and Toph", "Enchantment", "{2}{G}", {"oracleText":"Creatures you control have \"Whenever this creature becomes tapped for the first time during each of your turns, put a +1/+1 counter on it.\""});
const behemoth = card("Behemoth of Vault 0", "Artifact Creature — Robot", "{6}", {"power":"6","toughness":"6","keywords":["Trample"],"oracleText":"Trample\nWhen this creature enters, you get {E}{E}{E}{E} (four energy counters).\nWhen this creature dies, you may pay an amount of {E} equal to target nonland permanent's mana value. When you do, destroy that permanent."});
const siona = card("Siona, Captain of the Pyleas", "Legendary Creature — Human Soldier", "{1}{G}{W}", {"power":"2","toughness":"2","oracleText":"When Siona enters, look at the top seven cards of your library. You may reveal an Aura card from among them and put it into your hand. Put the rest on the bottom of your library in a random order.\nWhenever an Aura you control becomes attached to a creature you control, create a 1/1 white Human Soldier creature token."});
const glissa = card("Glissa's Retriever", "Creature — Phyrexian Beast", "{5}{G}", {"power":"6","toughness":"6","keywords":["Toxic","Haste","Corrupted"],"oracleText":"Haste, toxic 3 (Players dealt combat damage by this creature also get three poison counters.)\nThis creature can't be blocked by creatures with power 2 or less.\nCorrupted — When this creature dies, exile it. When you do, return up to X target cards from your graveyard to your hand, where X is the number of opponents who have three or more poison counters."});
const xu = card("Xu-Ifit, Osteoharmonist", "Legendary Creature — Human Wizard", "{1}{B}{B}", {"power":"2","toughness":"3","oracleText":"{T}: Return target creature card from your graveyard to the battlefield. It's a Skeleton in addition to its other types and has no abilities. Activate only as a sorcery."});
const call = card("Call of the Death-Dweller", "Sorcery", "{2}{B}", {"oracleText":"Return up to two target creature cards with total mana value 3 or less from your graveyard to the battlefield. Put a deathtouch counter on either of them. Then put a menace counter on either of them."});
const greymond = card("Greymond, Avacyn's Stalwart", "Legendary Creature — Human Soldier", "{2}{W}{W}", {"power":"3","toughness":"4","oracleText":"As Greymond, Avacyn's Stalwart enters, choose two abilities from among first strike, vigilance, and lifelink.\nHumans you control have each of the chosen abilities.\nAs long as you control four or more Humans, Humans you control get +2/+2."});
const edgar = card("Edgar, King of Figaro", "Legendary Creature — Human Artificer Noble", "{4}{U}{U}", {"power":"4","toughness":"5","keywords":["Two-Headed Coin"],"oracleText":"When Edgar enters, draw a card for each artifact you control.\nTwo-Headed Coin — The first time you flip one or more coins each turn, those coins come up heads and you win those flips."});
const clash = card("Mana Clash", "Sorcery", "{R}", {"oracleText":"You and target opponent each flip a coin. Mana Clash deals 1 damage to each player whose coin comes up tails. Repeat this process until both players' coins come up heads on the same flip."});
const chance = card("Chance Encounter", "Enchantment", "{2}{R}{R}", {"oracleText":"Whenever you win a coin flip, put a luck counter on this enchantment.\nAt the beginning of your upkeep, if this enchantment has ten or more luck counters on it, you win the game."});
const ral = card("Ral Zarek", "Legendary Planeswalker — Ral", "{2}{U}{R}", {"loyalty":"4","oracleText":"+1: Tap target permanent, then untap another target permanent.\n−2: Ral Zarek deals 3 damage to any target.\n−7: Flip five coins. Take an extra turn after this one for each coin that comes up heads."});
const kaito = card("Kaito, Bane of Nightmares", "Legendary Planeswalker — Kaito", "{2}{U}{B}", {"loyalty":"4","keywords":["Surveil","Ninjutsu"],"oracleText":"Ninjutsu {1}{U}{B} ({1}{U}{B}, Return an unblocked attacker you control to hand: Put this card onto the battlefield from your hand tapped and attacking.)\nDuring your turn, as long as Kaito has one or more loyalty counters on him, he's a 3/4 Ninja creature and has hexproof.\n+1: You get an emblem with \"Ninjas you control get +1/+1.\"\n0: Surveil 2. Then draw a card for each opponent who lost life this turn.\n−2: Tap target creature. Put two stun counters on it."});
const narset = card("Narset of the Ancient Way", "Legendary Planeswalker — Narset", "{1}{U}{R}{W}", {"loyalty":"4","oracleText":"+1: You gain 2 life. Add {U}, {R}, or {W}. Spend this mana only to cast a noncreature spell.\n−2: Draw a card, then you may discard a card. When you discard a nonland card this way, Narset deals damage equal to that card's mana value to target creature or planeswalker.\n−6: You get an emblem with \"Whenever you cast a noncreature spell, this emblem deals 2 damage to any target.\""});
const jace = card("Jace, Mirror Mage", "Legendary Planeswalker — Jace", "{1}{U}{U}", {"loyalty":"4","keywords":["Kicker","Scry"],"oracleText":"Kicker {2}\nWhen Jace enters, if Jace was kicked, create a token that's a copy of Jace, except it's not legendary and its starting loyalty is 1.\n+1: Scry 2.\n0: Draw a card and reveal it. Remove a number of loyalty counters equal to that card's mana value from Jace."});
const rancor = card("Rancor", "Enchantment — Aura", "{G}", {"keywords":["Enchant"],"oracleText":"Enchant creature\nEnchanted creature gets +2/+0 and has trample.\nWhen this Aura is put into a graveyard from the battlefield, return it to its owner's hand."});
const elvish = card("Elvish Visionary", "Creature — Elf Shaman", "{1}{G}", {"power":"1","toughness":"1","oracleText":"When this creature enters, draw a card."});
const lorehold = card("Lorehold, the Historian", "Legendary Creature — Elder Dragon", "{3}{R}{W}", {"power":"5","toughness":"5","keywords":["Flying","Haste","Miracle"],"oracleText":"Flying, haste\nEach instant and sorcery card in your hand has miracle {2}. (You may cast a card for its miracle cost when you draw it if it's the first card you drew this turn.)\nAt the beginning of each opponent's upkeep, you may discard a card. If you do, draw a card."});
const chanter = card("Dune Chanter", "Creature — Plant Druid", "{2}{G}", {"power":"2","toughness":"3","keywords":["Reach"],"oracleText":"Reach\nLands you control and land cards you own that aren't on the battlefield are Deserts in addition to their other types.\nLands you control have \"{T}: Add one mana of any color.\"\n{T}: Mill two cards. You gain 1 life for each land card milled this way."});
const bolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });
const wrath = card("Thunderous Wrath", "Instant", "{4}{R}{R}", { keywords: ["Miracle"], oracleText: "Thunderous Wrath deals 5 damage to any target.\nMiracle {R} (You may cast this card for its miracle cost when you draw it if it's the first card you drew this turn.)" });
const ornithopter = card("Ornithopter", "Artifact Creature — Thopter", "{0}", { power: "0", toughness: "2", keywords: ["Flying"], oracleText: "Flying" });

describe("round 227 cards are supported", () => {
  it("compiles every line", () => supported(roshan, tale, behemoth, siona, glissa, xu, call, greymond, edgar, clash, kaito, narset, jace, lorehold, chanter));
});

describe("Roshan, Hidden Magister", () => {
  it("makes your other creatures, your creature spells and your creature cards elsewhere Assassins", () => {
    const { s, ap, opp } = setup([]);
    const r = putOnBattlefield(s, ap, roshan);
    const b = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, bear());
    const inYard = into(s, ap, bear(), "graveyard");
    const inHand = into(s, ap, bear(), "hand");
    const theirYard = into(s, opp, bear(), "graveyard");
    const notCreature = into(s, ap, rancor, "hand");
    expect(characteristics(s, s.objects[b]!).subtypes).toContain("Assassin");
    expect(characteristics(s, s.objects[r]!).subtypes).toEqual(["Human", "Assassin"]);
    expect(characteristics(s, s.objects[theirs]!).subtypes).not.toContain("Assassin");
    expect(characteristics(s, s.objects[inYard]!).subtypes).toContain("Assassin");
    expect(characteristics(s, s.objects[inHand]!).subtypes).toContain("Assassin");
    expect(characteristics(s, s.objects[theirYard]!).subtypes).not.toContain("Assassin");
    expect(characteristics(s, s.objects[notCreature]!).subtypes).not.toContain("Assassin");
  });
  it("stops once it leaves", () => {
    const { s, ap } = setup([]);
    const r = putOnBattlefield(s, ap, roshan);
    const inYard = into(s, ap, bear(), "graveyard");
    expect(characteristics(s, s.objects[inYard]!).subtypes).toContain("Assassin");
    destroyPermanent(s, s.objects[r]!, "test");
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[inYard]!).subtypes).not.toContain("Assassin");
  });
});

describe("Tale of Katara and Toph", () => {
  it("puts a counter on a creature the first time it becomes tapped during your turn only", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, tale);
    const b = putOnBattlefield(s, ap, bear());
    tapPermanent(s, s.objects[b]!);
    s = settle(s);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
    untapPermanent(s, s.objects[b]!);
    tapPermanent(s, s.objects[b]!);
    s = settle(s);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
    // Not on another player's turn.
    const theirs = putOnBattlefield(s, opp, tale);
    const ob = putOnBattlefield(s, opp, bear());
    tapPermanent(s, s.objects[ob]!);
    s = settle(s);
    expect(s.objects[ob]!.counters["+1/+1"]).toBeUndefined();
    expect(theirs).toBeTruthy();
  });
});

describe("Behemoth of Vault 0", () => {
  it("pays energy equal to the target's mana value, then a reflexive trigger destroys it", () => {
    let { s, ap, opp } = setup([]);
    const beh = putOnBattlefield(s, ap, behemoth);
    const victim = putOnBattlefield(s, opp, card("Big Thing", "Artifact", "{3}"));
    s.players[ap]!.energy = 4;
    destroyPermanent(s, s.objects[beh]!, "test");
    s = settle(s, { targets: [tgt(victim)], may: true, me: ap });
    expect(zone(s, victim)).toBe("graveyard");
    expect(s.players[ap]!.energy).toBe(1);
  });
  it("can't pay with too little energy, and declining keeps the permanent", () => {
    let { s, ap, opp } = setup([]);
    const beh = putOnBattlefield(s, ap, behemoth);
    const victim = putOnBattlefield(s, opp, card("Big Thing", "Artifact", "{3}"));
    s.players[ap]!.energy = 2;
    destroyPermanent(s, s.objects[beh]!, "test");
    s = settle(s, { targets: [tgt(victim)], may: true, me: ap });
    expect(zone(s, victim)).toBe("battlefield");
    expect(s.players[ap]!.energy).toBe(2);
    const beh2 = putOnBattlefield(s, ap, card("Behemoth of Vault 0", behemoth.typeLine, "{6}", { ...behemoth, oracleId: "b2" }));
    s.players[ap]!.energy = 5;
    destroyPermanent(s, s.objects[beh2]!, "test");
    s = settle(s, { targets: [tgt(victim)], may: false, me: ap });
    expect(zone(s, victim)).toBe("battlefield");
    expect(s.players[ap]!.energy).toBe(5);
  });
});

describe("Siona, Captain of the Pyleas", () => {
  it("makes a Soldier when your Aura enters attached to your creature, not to an opponent's", () => {
    let { s, ap, ids, opp } = setup([rancor, rancor]);
    putOnBattlefield(s, ap, siona);
    const b = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, bear());
    const before = tokensOf(s, ap).length;
    s = run(s, planCast(s, ap, ids[0]!, [tgt(b)]));
    s = settle(s);
    expect(s.objects[ids[0]!]!.attachedTo).toBe(b);
    expect(tokensOf(s, ap).length).toBe(before + 1);
    s = run(s, planCast(s, ap, ids[1]!, [tgt(theirs)]));
    s = settle(s);
    expect(s.objects[ids[1]!]!.attachedTo).toBe(theirs);
    expect(tokensOf(s, ap).length).toBe(before + 1);
  });
});

describe("Glissa's Retriever", () => {
  it("exiles itself and returns up to one card for each opponent with three or more poison counters", () => {
    let { s, ap } = setup([]);
    const others = s.turnOrder.filter((p) => p !== ap);
    s.players[others[0]!]!.poison = 3;
    s.players[others[1]!]!.poison = 5;
    s.players[others[2]!]!.poison = 2;
    const g = putOnBattlefield(s, ap, glissa);
    const c1 = into(s, ap, bear(), "graveyard");
    const c2 = into(s, ap, elvish, "graveyard");
    const c3 = into(s, ap, rancor, "graveyard");
    destroyPermanent(s, s.objects[g]!, "test");
    s = untilTargets(s, ap);
    expect(s.pending?.kind).toBe("chooseTargets");
    // Three targets is one too many.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(c1), tgt(c2), tgt(c3)] })).toThrow();
    s = settle(s, { targets: [tgt(c1), tgt(c3)], me: ap });
    expect(zone(s, g)).toBe("exile");
    expect(zone(s, c1)).toBe("hand");
    expect(zone(s, c3)).toBe("hand");
    expect(zone(s, c2)).toBe("graveyard");
  });
  it("doesn't trigger the reflexive ability if it's no longer in the graveyard", () => {
    let { s, ap } = setup([]);
    s.players[s.turnOrder.find((p) => p !== ap)!]!.poison = 3;
    const g = putOnBattlefield(s, ap, glissa);
    const c1 = into(s, ap, bear(), "graveyard");
    destroyPermanent(s, s.objects[g]!, "test");
    // It leaves the graveyard before the trigger resolves.
    const yard = s.players[ap]!.graveyard;
    yard.splice(yard.indexOf(g), 1);
    s.players[ap]!.hand.push(g);
    s.objects[g]!.zone = "hand";
    s.objects[g]!.zoneChanges = (s.objects[g]!.zoneChanges ?? 0) + 1;
    s = settle(s, { targets: [tgt(c1)], me: ap });
    expect(zone(s, g)).toBe("hand");
    expect(zone(s, c1)).toBe("graveyard");
  });
});

describe("Xu-Ifit, Osteoharmonist", () => {
  it("returns a creature card as a Skeleton with no abilities, so its enters trigger never happens", () => {
    let { s, ap } = setup([]);
    const x = putOnBattlefield(s, ap, xu);
    const e = into(s, ap, elvish, "graveyard");
    const hand = s.players[ap]!.hand.length;
    s = run(s, planActivate(s, ap, x, 0, [tgt(e)]));
    s = settle(s);
    expect(zone(s, e)).toBe("battlefield");
    const c = characteristics(s, s.objects[e]!);
    expect(c.subtypes).toEqual(["Elf", "Shaman", "Skeleton"]);
    expect(compileCard(elvish).triggers.length).toBe(1);
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(objIsType(s, s.objects[e]!, "Creature")).toBe(true);
  });
  it("only as a sorcery", () => {
    let { s, ap } = setup([]);
    const x = putOnBattlefield(s, ap, xu);
    into(s, ap, elvish, "graveyard");
    s.stack.push({ id: "fake", kind: "ability", controller: ap, targets: [], text: "x" } as never);
    expect(legalActions(s, ap).some((a) => a.type === "activateAbility" && a.objectId === x)).toBe(false);
    s.stack.pop();
  });
});

describe("Call of the Death-Dweller", () => {
  const two = card("Two Drop", "Creature — Zombie", "{1}{B}", { power: "2", toughness: "2" });
  const one = card("One Drop", "Creature — Rat", "{B}", { power: "1", toughness: "1" });
  it("returns two cards with total mana value 3 or less and puts both counters where you choose", () => {
    let { s, ap, ids } = setup([call]);
    const a = into(s, ap, two, "graveyard");
    const b = into(s, ap, one, "graveyard");
    const c = into(s, ap, card("Big One", "Creature — Ogre", "{2}{B}", { power: "3", toughness: "3" }), "graveyard");
    // Total mana value 5 is too much.
    expect(planCast(s, ap, ids[0]!, [tgt(a), tgt(c)])).toBeNull();
    s = run(s, planCast(s, ap, ids[0]!, [tgt(a), tgt(b)]));
    s = settle(s, { me: ap });
    expect(zone(s, a)).toBe("battlefield");
    expect(zone(s, b)).toBe("battlefield");
    expect(s.pending?.kind).toBe("pickPermanents");
    s = act(s, { type: "pickPermanents", player: ap, ids: [b] });
    expect(s.pending?.kind).toBe("pickPermanents");
    s = act(s, { type: "pickPermanents", player: ap, ids: [b] });
    s = settle(s, { me: ap });
    expect(s.objects[b]!.counters).toEqual({ deathtouch: 1, menace: 1 });
    expect(s.objects[a]!.counters).toEqual({});
  });
  it("with one card, it gets both counters without a question", () => {
    let { s, ap, ids } = setup([call]);
    const a = into(s, ap, two, "graveyard");
    s = run(s, planCast(s, ap, ids[0]!, [tgt(a), { kind: "none" }]));
    s = settle(s, { me: ap });
    expect(s.objects[a]!.counters).toEqual({ deathtouch: 1, menace: 1 });
  });
});

describe("Greymond, Avacyn's Stalwart", () => {
  it("asks for two different abilities as it enters and gives them to your Humans", () => {
    let { s, ap, ids, opp } = setup([greymond]);
    const human = putOnBattlefield(s, ap, card("Village Human", "Creature — Human Peasant", "{W}", { power: "1", toughness: "1" }));
    const elf = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, card("Their Human", "Creature — Human", "{W}", { power: "1", toughness: "1" }));
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s, { me: ap });
    expect(s.pending?.kind).toBe("chooseOption");
    expect(s.pending?.kind === "chooseOption" && s.pending.options).toEqual(["First strike", "Vigilance", "Lifelink"]);
    s = act(s, { type: "chooseOption", player: ap, choice: "Lifelink" });
    expect(s.pending?.kind === "chooseOption" && s.pending.options).toEqual(["First strike", "Vigilance"]);
    expect(() => act(s, { type: "chooseOption", player: ap, choice: "Lifelink" })).toThrow();
    s = act(s, { type: "chooseOption", player: ap, choice: "First strike" });
    s = settle(s, { me: ap });
    const kw = (id: ObjectId) => characteristics(s, s.objects[id]!).keywords;
    expect(kw(human)).toEqual(expect.arrayContaining(["Lifelink", "First strike"]));
    expect(kw(human)).not.toContain("Vigilance");
    expect(kw(ids[0]!)).toEqual(expect.arrayContaining(["Lifelink", "First strike"]));
    expect(kw(elf)).not.toContain("Lifelink");
    expect(kw(theirs)).not.toContain("Lifelink");
  });
  it("the bot picks two of them", () => {
    let { s, ap, ids } = setup([greymond]);
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 100 && (s.stack.length || s.pending); i++) s = act(s, s.pending ? botActions(s, s.pending.player)[0]! : { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[ids[0]!]!.chosen?.keywords?.length).toBe(2);
    expect(new Set(s.objects[ids[0]!]!.chosen!.keywords).size).toBe(2);
  });
});

describe("Mana Clash", () => {
  it("flips until both coins come up heads, 1 damage to each player whose coin is tails, and no one wins those flips", () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      let { s, ap, ids, opp } = setup([clash], seed);
      const ch = putOnBattlefield(s, ap, chance);
      const lives = [s.players[ap]!.life, s.players[opp]!.life];
      s = run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }]));
      s = settle(s, { me: ap });
      expect(zone(s, ids[0]!)).toBe("graveyard");
      const line = s.log.find((l) => /flip coins for Mana Clash/.test(l.text))!.text;
      const m = /(\d+) times?: \S+ is dealt (\d+) damage, \S+ (\d+)/.exec(line)!;
      expect(m).toBeTruthy();
      expect(lives[0]! - s.players[ap]!.life).toBe(Number(m[2]));
      expect(lives[1]! - s.players[opp]!.life).toBe(Number(m[3]));
      expect(s.objects[ch]!.counters.luck).toBeUndefined();
    }
  });
});

describe("Edgar, King of Figaro", () => {
  it("makes the first set of coins you flip each turn come up heads, and won: Ral Zarek's five coins", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, edgar);
    const ch = putOnBattlefield(s, ap, chance);
    const r = putOnBattlefield(s, ap, ral);
    s.objects[r]!.counters.loyalty = 7;
    s = run(s, planActivate(s, ap, r, 2));
    s = settle(s, { me: ap });
    expect(s.extraTurns?.filter((t) => t.player === ap).length).toBe(5);
    expect(s.objects[ch]!.counters.luck).toBe(5);
    expect(s.turnLog?.coinsFlipped).toContain(ap);
  });
  it("only the first time: Mana Clash's first flip of yours is heads and won, the later ones aren't", () => {
    let { s, ap, ids, opp } = setup([clash], 3);
    putOnBattlefield(s, ap, edgar);
    const ch = putOnBattlefield(s, ap, chance);
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }]));
    s = settle(s, { me: ap });
    expect(s.objects[ch]!.counters.luck).toBe(1);
  });
  it("not if you already flipped a coin this turn", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, edgar);
    const ch = putOnBattlefield(s, ap, chance);
    const r = putOnBattlefield(s, ap, ral);
    s.objects[r]!.counters.loyalty = 7;
    s.turnLog = { ...s.turnLog, coinsFlipped: [ap] };
    s = run(s, planActivate(s, ap, r, 2));
    s = settle(s, { me: ap });
    // No one wins Ral Zarek's flips without Edgar's ability.
    expect(s.objects[ch]!.counters.luck).toBeUndefined();
  });
});

describe("Narset of the Ancient Way", () => {
  it("+1: you gain 2 life and add one of {U}, {R} or {W}, only for noncreature spells", () => {
    let { s, ap } = setup([]);
    const n = putOnBattlefield(s, ap, narset);
    s.objects[n]!.counters.loyalty = 4;
    const life = s.players[ap]!.life;
    s = run(s, planActivate(s, ap, n, 0));
    s = settle(s, { me: ap });
    expect(s.pending?.kind === "chooseOption" && s.pending.options).toEqual(["Blue", "Red", "White"]);
    s = act(s, { type: "chooseOption", player: ap, choice: "Red" });
    expect(s.players[ap]!.life).toBe(life + 2);
    expect(s.objects[n]!.counters.loyalty).toBe(5);
    const lots = JSON.stringify(s.players[ap]!.manaLots);
    expect(lots).toMatch(/"R"/);
    expect(lots).toMatch(/noncreature/);
  });
});

describe("Kaito, Bane of Nightmares", () => {
  it("is a 3/4 Ninja creature with hexproof, not a planeswalker, during your turn while he has loyalty", () => {
    let { s, ap, opp } = setup([]);
    const k = putOnBattlefield(s, ap, kaito);
    s.objects[k]!.counters.loyalty = 4;
    invalidateCharacteristics(s);
    const c = characteristics(s, s.objects[k]!);
    expect(c.types).toEqual(["Creature"]);
    expect(c.subtypes).toEqual(["Ninja"]);
    expect([c.power, c.toughness]).toEqual([3, 4]);
    expect(c.keywords).toContain("Hexproof");
    // His loyalty abilities still work (rulings).
    expect(abilityProblem(s, ap, k, 1)).toBeNull();
    s = run(s, planActivate(s, ap, k, 1));
    s = settle(s, { me: ap });
    expect(s.objects[k]!.counters.loyalty).toBe(5);
    // On another player's turn he's a planeswalker.
    s = passUntil(s, "upkeep", opp);
    const d = characteristics(s, s.objects[k]!);
    expect(d.types).toEqual(["Planeswalker"]);
    expect(d.subtypes).toEqual(["Kaito"]);
    expect(d.keywords).not.toContain("Hexproof");
  });
  it("damage to him as a creature removes no loyalty counters", () => {
    let { s, ap, opp } = setup([]);
    const k = putOnBattlefield(s, ap, kaito);
    s.objects[k]!.counters.loyalty = 4;
    invalidateCharacteristics(s);
    const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
    const theirs = putOnBattlefield(s, opp, bear());
    s = settle(s);
    expect(theirs).toBeTruthy();
    s.objects[k]!.damage = 0;
    // Damage dealt by an ability of his own controller's: hexproof doesn't stop that.
    const id = into(s, ap, shock, "hand");
    s = run(s, planCast(s, ap, id, [tgt(k)]));
    s = settle(s, { me: ap });
    expect(s.objects[k]!.damage).toBe(2);
    expect(s.objects[k]!.counters.loyalty).toBe(4);
    expect(zone(s, k)).toBe("battlefield");
  });
  it("ninjutsu puts him onto the battlefield tapped and attacking, as a creature", () => {
    let { s, ap, opp, ids } = setup([kaito]);
    for (const p of s.turnOrder) if (p !== ap) s.players[p]!.hand.splice(0).forEach((x) => (s.objects[x]!.zone = "exile"));
    const b = putOnBattlefield(s, ap, bear());
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    for (let i = 0; i < 40 && s.step !== "declareBlockers"; i++) s = s.pending?.kind === "declareBlockers" ? act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] }) : act(s, { type: "passPriority", player: waitingOn(s)! });
    while (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
    const plan = planActivate(s, ap, ids[0]!, 0, undefined, undefined, undefined, undefined, { returnToHand: [b] });
    expect(plan).toBeTruthy();
    s = settle(run(s, plan), { me: ap });
    const k = s.objects[ids[0]!]!;
    expect(k.zone).toBe("battlefield");
    expect(k.counters.loyalty).toBe(4);
    expect(k.tapped).toBe(true);
    expect(k.attacking).toBe(opp);
    expect(objIsType(s, k, "Creature")).toBe(true);
    const life = s.players[opp]!.life;
    s = passUntil(s, "main2", ap);
    expect(s.players[opp]!.life).toBe(life - 3);
  });
});

describe("Jace, Mirror Mage", () => {
  it("kicked, makes a token copy that isn't legendary and starts with 1 loyalty", () => {
    let { s, ap, ids } = setup([jace]);
    s = run(s, planCast(s, ap, ids[0]!, undefined, undefined, undefined, undefined, { kicks: [0] }));
    s = settle(s, { me: ap });
    const jaces = s.battlefield.filter((id) => characteristics(s, s.objects[id]!).name === "Jace, Mirror Mage");
    expect(jaces.length).toBe(2);
    const token = jaces.find((id) => s.objects[id]!.isToken)!;
    expect(s.objects[token]!.counters.loyalty).toBe(1);
    expect(characteristics(s, s.objects[token]!).supertypes).not.toContain("Legendary");
    expect(s.objects[ids[0]!]!.counters.loyalty).toBe(4);
  });
  it("not kicked, no token", () => {
    let { s, ap, ids } = setup([jace]);
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s, { me: ap });
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken).length).toBe(0);
  });
  it("0: draws and reveals a card, then removes loyalty equal to its mana value", () => {
    let { s, ap } = setup([]);
    const j = putOnBattlefield(s, ap, jace);
    s.objects[j]!.counters.loyalty = 4;
    into(s, ap, card("Three Drop", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3" }), "library");
    s = run(s, planActivate(s, ap, j, 1));
    s = settle(s, { me: ap });
    expect(s.objects[j]!.counters.loyalty).toBe(1);
    expect(s.log.some((l) => /reveals Three Drop/.test(l.text))).toBe(true);
    into(s, ap, card("Five Drop", "Creature — Ogre", "{4}{R}", { power: "5", toughness: "5" }), "library");
    const j2 = putOnBattlefield(s, ap, card("Jace, Mirror Mage", jace.typeLine, jace.manaCost, { ...jace, oracleId: "jace-2", supertypes: [] }));
    s.objects[j2]!.counters.loyalty = 2;
    expect(abilityProblem(s, ap, j2, 1)).toBeNull();
    s = run(s, planActivate(s, ap, j2, 1));
    s = settle(s, { me: ap });
    expect(zone(s, j2)).toBe("graveyard");
  });
});

describe("Lorehold, the Historian", () => {
  /** `pid` draws `def` as their first card this turn. */
  const drawFirst = (s: GameState, pid: PlayerId, def: CardDef) => {
    const id = into(s, pid, def, "library");
    s.players[pid]!.draws = undefined;
    draw(s, pid, 1);
    return id;
  };
  const untapped = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && !s.objects[id]!.tapped).length;

  it("an instant drawn first this turn may be cast for {2}", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, lorehold);
    const b = drawFirst(s0, ap, bolt);
    expect(s0.triggerQueue).toHaveLength(1);
    let s = settle(s0);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: b, how: "miracle", miracleCost: "{2}" });
    expect(madnessCastOf(s, ap, b)).toBe("{2}");
    const before = untapped(s, ap), life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, b, [{ kind: "player", id: opp }])));
    expect(untapped(s, ap)).toBe(before - 2);
    expect(s.players[opp]!.life).toBe(life - 3);
  });

  it("not for a creature card, a second card drawn, or an opponent's Lorehold", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, lorehold);
    drawFirst(s0, ap, bear());
    expect(s0.triggerQueue).toHaveLength(0);
    into(s0, ap, bolt, "library");
    draw(s0, ap, 1);
    expect(s0.triggerQueue).toHaveLength(0);
    const { s: s1 } = setup([]);
    putOnBattlefield(s1, opp, lorehold);
    drawFirst(s1, ap, bolt);
    expect(s1.triggerQueue).toHaveLength(0);
  });

  it("a card with its own miracle has both: two triggers, the first cast uses one and the other finds it gone", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, lorehold);
    const w = drawFirst(s0, ap, wrath);
    expect(s0.triggerQueue).toHaveLength(2);
    let s = settle(s0);
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: w, how: "miracle" });
    const cost = madnessCastOf(s, ap, w);
    expect(["{R}", "{2}"]).toContain(cost);
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, w, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(life - 5);
    expect(s.pending).toBeFalsy();
  });

  it("bots cast it for {2}", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, lorehold);
    drawFirst(s0, ap, bolt);
    const s = settle(s0);
    expect(s.pending).toMatchObject({ kind: "castFree", how: "miracle" });
    expect(botActions(s, ap).some((a) => a.type === "castSpell")).toBe(true);
  });
});

describe("Dune Chanter", () => {
  const subtypes = (s: GameState, id: ObjectId) => (zone(s, id) === "battlefield" ? characteristics(s, s.objects[id]!).subtypes : defOf(s, s.objects[id]!).subtypes);

  it("your lands and your land cards elsewhere are Deserts; others' aren't; and it stops when it leaves", () => {
    const { s, ap, opp } = setup([]);
    const dc = putOnBattlefield(s, ap, chanter);
    const mine = s.battlefield.find((id) => s.objects[id]!.controller === ap && objIsType(s, s.objects[id]!, "Land"))!;
    const theirs = putOnBattlefield(s, opp, card("Forest", "Basic Land — Forest"));
    const yard = into(s, ap, card("Forest", "Basic Land — Forest"), "graveyard");
    const hand = into(s, ap, card("Forest", "Basic Land — Forest"), "hand");
    const lib = into(s, ap, card("Forest", "Basic Land — Forest"), "library");
    const oppYard = into(s, opp, card("Forest", "Basic Land — Forest"), "graveyard");
    const creatureCard = into(s, ap, bear(), "graveyard");
    invalidateCharacteristics(s);
    for (const id of [mine, yard, hand, lib]) expect(subtypes(s, id), id).toContain("Desert");
    for (const id of [theirs, oppYard, creatureCard]) expect(subtypes(s, id), id).not.toContain("Desert");
    expect(subtypes(s, mine)).toContain(defOf(s, s.objects[mine]!).subtypes[0]);
    destroyPermanent(s, s.objects[dc]!, "test");
    invalidateCharacteristics(s);
    for (const id of [mine, yard, hand]) expect(subtypes(s, id)).not.toContain("Desert");
  });

  it("its tap ability mills two and gains 1 life for each land card milled", () => {
    const { s: s0, ap } = setup([]);
    const dc = putOnBattlefield(s0, ap, chanter);
    into(s0, ap, bear(), "library");
    into(s0, ap, card("Forest", "Basic Land — Forest"), "library");
    const life = s0.players[ap]!.life;
    const s = settle(run(s0, planActivate(s0, ap, dc, compileCard(chanter).activated.findIndex((a) => /Mill two/.test(a.text ?? "")))));
    expect(s.players[ap]!.life).toBe(life + 1);
  });
});
