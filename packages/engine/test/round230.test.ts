// Round 230: cards from the top of the popularity list that earlier rounds left out. Myr Welder, Dark Impostor and
// Patchwork Crawler ("~ has all activated abilities of all cards exiled with it", linked to its exile ability, CR
// 607.2a); Stenn, Paranoid Partisan ("choose a card type other than creature or land"); Bring to Light (converge, then
// "exile that card, then shuffle. You may cast that card without paying its mana cost"); and the planeswalker Talents
// (Elspeth's, Liliana's, Rowan's, Teferi's, Vivien's: "Enchanted planeswalker has "[+1]: ..."", "Whenever you activate a
// loyalty ability of enchanted planeswalker", "Whenever a creature deals damage to enchanted planeswalker").

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, scry, setup } from "./helpers";
import { abilitiesOf, applyAction, botActions, characteristics, dealDamage, invalidateCharacteristics, isFullySupported, objectSource, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";
import { manaAbilitiesOn } from "../src/manaabilities";
import { gainLife } from "../src/game";

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
const attach = (s: GameState, aura: ObjectId, to: ObjectId) => {
  s.objects[aura]!.attachedTo = to;
  invalidateCharacteristics(s);
};
const activatedIndex = (s: GameState, id: ObjectId, re: RegExp) => {
  const i = abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => re.test(a.text));
  if (i < 0) throw new Error(`no ability ${re}`);
  return i;
};
/** Taps everything a player controls, then gives them exactly this mana. */
const poolOnly = (s: GameState, pid: PlayerId, mana: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  for (const id of s.battlefield) if (s.objects[id]!.controller === pid) s.objects[id]!.tapped = true;
  Object.assign(s.players[pid]!.manaPool, mana);
};

// Real oracle text (Scryfall).
const welder = card("Myr Welder", "Artifact Creature — Myr", "{3}", {"power":"1","toughness":"4","keywords":["Imprint"],"oracleText":"Imprint — {T}: Exile target artifact card from a graveyard.\nThis creature has all activated abilities of all cards exiled with it."});
const impostor = card("Dark Impostor", "Creature — Vampire Assassin", "{2}{B}", {"power":"2","toughness":"2","oracleText":"{4}{B}{B}: Exile target creature and put a +1/+1 counter on this creature.\nThis creature has all activated abilities of all creature cards exiled with it."});
const crawler = card("Patchwork Crawler", "Creature — Zombie Horror", "{1}{U}", {"power":"1","toughness":"2","oracleText":"{2}{U}: Exile target creature card from your graveyard and put a +1/+1 counter on this creature.\nThis creature has all activated abilities of all creature cards exiled with it."});
const stenn = card("Stenn, Paranoid Partisan", "Legendary Creature — Human Wizard", "{W}{U}", {"power":"2","toughness":"2","oracleText":"As Stenn enters, choose a card type other than creature or land.\nSpells you cast of the chosen type cost {1} less to cast.\n{1}{W}{U}: Exile Stenn. Return it to the battlefield under its owner's control at the beginning of the next end step."});
const bringToLight = card("Bring to Light", "Sorcery", "{3}{G}{U}", {"keywords":["Converge"],"oracleText":"Converge — Search your library for a creature, instant, or sorcery card with mana value less than or equal to the number of colors of mana spent to cast this spell, exile that card, then shuffle. You may cast that card without paying its mana cost."});
const elspeths = card("Elspeth's Talent", "Enchantment — Aura", "{2}{W}{W}", {"keywords":["Enchant"],"oracleText":"Enchant planeswalker\nEnchanted planeswalker has \"[+1]: Create three 1/1 white Soldier creature tokens.\"\nWhenever you activate a loyalty ability of enchanted planeswalker, creatures you control get +2/+2 and gain vigilance until end of turn."});
const lilianas = card("Liliana's Talent", "Enchantment — Aura", "{B}{B}", {"keywords":["Enchant"],"oracleText":"Enchant planeswalker\nEnchanted planeswalker has \"[−8]: Put all creature cards from all graveyards onto the battlefield under your control.\"\nWhenever a creature deals damage to enchanted planeswalker, destroy that creature."});
const rowans = card("Rowan's Talent", "Enchantment — Aura", "{2}{R}{R}", {"keywords":["Enchant"],"oracleText":"Enchant planeswalker\nEnchanted planeswalker has \"[+1]: Up to one target creature gets +2/+0 and gains first strike and trample until end of turn.\"\nWhenever you activate a loyalty ability of enchanted planeswalker, copy that ability. You may choose new targets for the copy."});
const teferis = card("Teferi's Talent", "Enchantment — Aura", "{3}{U}{U}", {"keywords":["Enchant"],"oracleText":"Enchant planeswalker\nEnchanted planeswalker has \"[−12]: You get an emblem with 'You may activate loyalty abilities of planeswalkers you control on any player's turn any time you could cast an instant.'\"\nWhenever you draw a card, put a loyalty counter on enchanted planeswalker."});
const viviens = card("Vivien's Talent", "Enchantment — Aura", "{1}{G}{G}", {"keywords":["Enchant"],"oracleText":"Enchant planeswalker\nEnchanted planeswalker has \"[+1]: Look at the top four cards of your library. You may reveal a creature or land card from among them and put it into your hand. Put the rest on the bottom of your library in a random order.\"\nWhenever a nontoken creature you control enters, put a loyalty counter on enchanted planeswalker."});
const ratchet = scry("transform", [
  { name: "Ratchet, Field Medic", mana_cost: "{2}{W}", type_line: "Legendary Artifact Creature — Robot", oracle_text: "More Than Meets the Eye {1}{W} (You may cast this card converted for {1}{W}.)\nLifelink\nWhenever you gain life, you may convert Ratchet. When you do, return target artifact card with mana value less than or equal to the amount of life you gained this turn from your graveyard to the battlefield tapped.", power: "2", toughness: "4" },
  { name: "Ratchet, Rescue Racer", type_line: "Legendary Artifact — Vehicle", oracle_text: "Living metal (During your turn, this Vehicle is also a creature.)\nLifelink\nWhenever one or more nontoken artifacts you control are put into a graveyard from the battlefield, convert Ratchet. This ability triggers only once each turn.", power: "1", toughness: "4", color_indicator: ["W"] },
], { keywords: ["Lifelink", "Living metal", "Convert", "More Than Meets the Eye"] });
const soulSeizer = scry("transform", [
  { name: "Soul Seizer", mana_cost: "{3}{U}{U}", type_line: "Creature — Spirit", oracle_text: "Flying\nWhen this creature deals combat damage to a player, you may transform it. If you do, attach it to target creature that player controls.", power: "1", toughness: "3" },
  { name: "Ghastly Haunting", type_line: "Enchantment — Aura", oracle_text: "Enchant creature\nYou control enchanted creature.", color_indicator: ["U"] },
], { keywords: ["Flying", "Enchant", "Transform"] });
// Helpers.
const solRing = card("Sol Ring", "Artifact", "{1}", {"oracleText":"{T}: Add {C}{C}."});
const luxCannon = card("Lux Cannon", "Artifact", "{4}", {"oracleText":"{T}: Put a charge counter on this artifact.\n{T}, Remove three charge counters from this artifact: Destroy target permanent."});
const pyromancer = card("Prodigal Pyromancer", "Creature — Human Wizard", "{2}{R}", {"power":"1","toughness":"1","oracleText":"{T}: This creature deals 1 damage to any target."});
const elves = card("Llanowar Elves", "Creature — Elf Druid", "{G}", {"power":"1","toughness":"1","oracleText":"{T}: Add {G}."});
const jace = card("Jace Beleren", "Legendary Planeswalker — Jace", "{1}{U}{U}", {"loyalty":"3","oracleText":"+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards."});
const ajani = card("Ajani Goldmane", "Legendary Planeswalker — Ajani", "{2}{W}{W}", {"loyalty":"4","oracleText":"+1: You gain 2 life.\n−1: Put a +1/+1 counter on each creature you control. Those creatures gain vigilance until end of turn.\n−6: Create a white Avatar creature token. It has \"This token's power and toughness are each equal to your life total.\""});
const opt = card("Opt", "Instant", "{U}", {"oracleText":"Scry 1.\nDraw a card."});
const divination = card("Divination", "Sorcery", "{2}{U}", {"oracleText":"Draw two cards."});
const mindRot = card("Mind Rot", "Sorcery", "{2}{B}", {"oracleText":"Target player discards two cards."});
const ponder = card("Ponder", "Sorcery", "{U}", {"oracleText":"Look at the top three cards of your library, then put them back in any order. You may shuffle.\nDraw a card."});
const arcane = card("Arcane Signet", "Artifact", "{2}", {"oracleText":"{T}: Add one mana of any color in your commander's color identity."});

describe("round 230: parse", () => {
  it("every card of the round is fully supported", () =>
    supported(welder, impostor, crawler, stenn, bringToLight, elspeths, lilianas, rowans, teferis, viviens, ratchet, soulSeizer));
});

describe("round 230: Myr Welder, Dark Impostor, Patchwork Crawler", () => {
  it("Myr Welder exiles an artifact card from a graveyard and has its activated abilities, mana abilities too", () => {
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, welder);
    const ring = into(s0, opp, solRing, "graveyard");
    const cannon = into(s0, ap, luxCannon, "graveyard");
    let s = settle(run(s0, planActivate(s0, ap, w, 0, [tgt(ring)])));
    expect(zone(s, ring)).toBe("exile");
    // Sol Ring's mana ability is Myr Welder's now (CR 605.1a: activated mana abilities are activated abilities).
    expect(manaAbilitiesOn(s, s.objects[w]!).map((m) => m.text)).toContain("{T}: Add {C}{C}.");
    s.objects[w]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, w, 0, [tgt(cannon)])));
    // Lux Cannon's "{T}: Put a charge counter on this artifact": on Myr Welder (rulings).
    const i = activatedIndex(s, w, /^\{T\}: Put a charge counter/);
    s.objects[w]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, w, i)));
    expect(s.objects[w]!.counters.charge).toBe(1);
  });

  it("the abilities are only of the cards it exiled itself, as the object it is now (CR 607.2a, 400.7)", () => {
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, welder);
    const other = putOnBattlefield(s0, ap, welder);
    const ring = into(s0, opp, solRing, "graveyard");
    let s = settle(run(s0, planActivate(s0, ap, w, 0, [tgt(ring)])));
    expect(manaAbilitiesOn(s, s.objects[other]!).map((m) => m.text)).not.toContain("{T}: Add {C}{C}.");
    // Flickered: a new object, nothing exiled with it.
    s.objects[w]!.zoneChanges = (s.objects[w]!.zoneChanges ?? 0) + 1;
    invalidateCharacteristics(s);
    expect(manaAbilitiesOn(s, s.objects[w]!).map((m) => m.text)).not.toContain("{T}: Add {C}{C}.");
  });

  it("Dark Impostor exiles a creature from the battlefield, gets a counter and its activated abilities", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, ap, impostor);
    const pyro = putOnBattlefield(s0, opp, pyromancer);
    poolOnly(s0, ap, { B: 2, C: 4 });
    let s = settle(run(s0, planActivate(s0, ap, d, 0, [tgt(pyro)])));
    expect(zone(s, pyro)).toBe("exile");
    expect(s.objects[d]!.counters["+1/+1"]).toBe(1);
    const i = activatedIndex(s, d, /deals 1 damage to any target/);
    const life = s.players[opp]!.life;
    s.objects[d]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, d, i, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(life - 1);
    // Its own exile ability and the Pyromancer's.
    expect(abilitiesOf(s, s.objects[d]!).activated.length).toBe(2);
  });

  it("Patchwork Crawler exiles a creature card from your graveyard only, and has its mana ability", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, crawler);
    const mine = into(s0, ap, elves, "graveyard");
    const theirs = into(s0, opp, pyromancer, "graveyard");
    poolOnly(s0, ap, { U: 2, C: 4 });
    expect(planActivate(s0, ap, c, 0, [tgt(theirs)])).toBeNull();
    const s = settle(run(s0, planActivate(s0, ap, c, 0, [tgt(mine)])));
    expect(zone(s, mine)).toBe("exile");
    expect(pt(s, c)).toBe("2/3");
    expect(manaAbilitiesOn(s, s.objects[c]!).map((m) => m.text)).toContain("{T}: Add {G}.");
  });
});

describe("round 230: Stenn, Paranoid Partisan", () => {
  it("chooses a card type other than creature or land; spells of it cost {1} less", () => {
    const { s: s0, ap, ids } = setup([stenn, divination, mindRot]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s);
    const p = s.pending;
    expect(p?.kind).toBe("chooseOption");
    if (p?.kind !== "chooseOption") throw new Error();
    // Artifact, battle, enchantment, instant, planeswalker, sorcery; not creature or land.
    expect([...p.options].sort()).toEqual(["Artifact", "Battle", "Enchantment", "Instant", "Planeswalker", "Sorcery"]);
    s = act(s, { type: "chooseOption", player: ap, choice: "Sorcery" });
    s = settle(s);
    expect(zone(s, ids[0]!)).toBe("battlefield");
    // Divination ({2}{U}) for {1}{U}.
    poolOnly(s, ap, { U: 1, C: 1 });
    expect(planCast(s, ap, ids[1]!)).not.toBeNull();
  });

  it("the bot answers the choice", () => {
    const { s: s0, ap, ids } = setup([stenn]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s);
    expect(s.pending?.kind).toBe("chooseOption");
    s = act(s, botActions(s, ap)[0]!);
    s = settle(s);
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.objects[ids[0]!]!.chosen?.cardType).toBeDefined();
    expect(["Creature", "Land"]).not.toContain(s.objects[ids[0]!]!.chosen?.cardType);
  });
});

describe("round 230: Bring to Light", () => {
  it("finds a card with mana value up to the colors spent, exiles it, and it may be cast for free now", () => {
    const { s: s0, ap, ids } = setup([bringToLight]);
    const div = into(s0, ap, divination, "library");
    const big = into(s0, ap, card("Big Sorcery", "Sorcery", "{4}{U}{U}", { oracleText: "Draw three cards." }), "library");
    // Three colors: {G}{U}{R} and two generic paid with {G}{U}.
    poolOnly(s0, ap, { G: 2, U: 2, R: 1 });
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s);
    expect(s.pending?.kind).toBe("searchLibrary");
    const p = s.pending!;
    if (p.kind !== "searchLibrary") throw new Error();
    // Mana value 6 is more than 3 colors.
    expect(p.cards).toContain(div);
    expect(p.cards).not.toContain(big);
    const hand = s.players[ap]!.hand.length;
    s = act(s, { type: "searchLibrary", player: ap, found: [div] });
    expect(s.pending?.kind).toBe("castFree");
    expect(zone(s, div)).toBe("exile");
    s = run(s, planCast(s, ap, div));
    s = settle(s);
    expect(zone(s, div)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });

  it("not cast: the card stays exiled (rulings)", () => {
    const { s: s0, ap, ids } = setup([bringToLight]);
    const div = into(s0, ap, divination, "library");
    poolOnly(s0, ap, { G: 2, U: 2, R: 1 });
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = act(s, { type: "searchLibrary", player: ap, found: [div] });
    expect(s.pending?.kind).toBe("castFree");
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    s = settle(s);
    expect(zone(s, div)).toBe("exile");
    expect(s.objects[div]!.mayPlay).toBeUndefined();
  });
});

/** A planeswalker of `pid`'s with `loyalty` counters, enchanted by `talent`. */
const walkerWith = (s: GameState, pid: PlayerId, talent: CardDef, walker: CardDef = jace, loyalty = 3) => {
  const w = putOnBattlefield(s, pid, walker);
  s.objects[w]!.counters.loyalty = loyalty;
  const a = putOnBattlefield(s, pid, talent);
  attach(s, a, w);
  return { w, a };
};

describe("round 230: the planeswalker Talents", () => {
  it("Elspeth's Talent: the granted [+1] is a loyalty ability; activating one triggers +2/+2 and vigilance first (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const { w } = walkerWith(s0, ap, elspeths);
    const b = putOnBattlefield(s0, ap, bear());
    const i = activatedIndex(s0, w, /^\[\+1\]: Create three/);
    let s = run(s0, planActivate(s0, ap, w, i));
    // Loyalty paid as it's activated (CR 606.4).
    expect(s.objects[w]!.counters.loyalty).toBe(4);
    s = settle(s);
    expect(tokensOf(s, ap)).toHaveLength(3);
    expect(pt(s, b)).toBe("4/4");
    expect(characteristics(s, s.objects[b]!).keywords).toContain("Vigilance");
    // The trigger resolved before the tokens were made: they don't get it (rulings).
    expect(pt(s, tokensOf(s, ap)[0]!)).toBe("1/1");
    // One loyalty ability of each planeswalker each turn, the granted one included (CR 606.3, rulings).
    expect(planActivate(s, ap, w, 0)).toBeNull();
  });

  it("Elspeth's Talent: the planeswalker's own loyalty abilities trigger it too; another planeswalker's don't", () => {
    const { s: s0, ap } = setup([]);
    const { w } = walkerWith(s0, ap, elspeths);
    const other = putOnBattlefield(s0, ap, ajani);
    s0.objects[other]!.counters.loyalty = 4;
    const b = putOnBattlefield(s0, ap, bear());
    let s = settle(run(s0, planActivate(s0, ap, other, 0)));
    expect(pt(s, b)).toBe("2/2");
    s = settle(run(s, planActivate(s, ap, w, 0)));
    expect(pt(s, b)).toBe("4/4");
  });

  it("Rowan's Talent: the loyalty ability is copied, with new targets; the copy adds no loyalty (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const { w } = walkerWith(s0, ap, rowans);
    const b1 = putOnBattlefield(s0, ap, bear());
    const b2 = putOnBattlefield(s0, ap, bear({ name: "Other Bear" }));
    const i = activatedIndex(s0, w, /^\[\+1\]: Up to one target creature/);
    let s = run(s0, planActivate(s0, ap, w, i, [tgt(b1)]));
    expect(s.objects[w]!.counters.loyalty).toBe(4);
    for (let k = 0; k < 50 && s.pending?.kind !== "copyTargets" && (s.stack.length || s.triggerQueue.length || s.pending); k++) s = s.pending ? act(s, botActions(s, s.pending.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("copyTargets");
    s = act(s, { type: "copyTargets", player: ap, targets: [tgt(b2)] });
    s = settle(s);
    expect(pt(s, b1)).toBe("4/2");
    expect(pt(s, b2)).toBe("4/2");
    expect(characteristics(s, s.objects[b2]!).keywords).toEqual(expect.arrayContaining(["First strike", "Trample"]));
    expect(s.objects[w]!.counters.loyalty).toBe(4);
  });

  it("Vivien's Talent: a nontoken creature entering adds a loyalty counter; a token doesn't", () => {
    const { s: s0, ap, ids } = setup([bear()]);
    const { w } = walkerWith(s0, ap, viviens);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.objects[w]!.counters.loyalty).toBe(4);
    // Jace's +2 is fine; the granted +1 looks at the top four and may take a creature or land card.
    const i = activatedIndex(s, w, /^\[\+1\]: Look at the top four/);
    const top = into(s, ap, bear({ name: "Top Bear" }), "library");
    s = run(s, planActivate(s, ap, w, i));
    s = settle(s);
    expect(s.objects[w]!.counters.loyalty).toBe(5);
    const p = s.pending;
    expect(p?.kind).toBe("searchLibrary");
    if (p?.kind !== "searchLibrary") throw new Error();
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [top] }));
    expect(zone(s, top)).toBe("hand");
  });

  it("Teferi's Talent: each card drawn adds a loyalty counter; the emblem lets loyalty abilities be activated at instant speed on any turn", () => {
    const { s: s0, ap, opp, ids } = setup([opt]);
    const { w } = walkerWith(s0, ap, teferis, jace, 12);
    poolOnly(s0, ap, { U: 1 });
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: ap });
    while (s.pending?.kind === "arrangeTop") s = act(s, botActions(s, ap)[0]!);
    s = settle(s);
    expect(s.objects[w]!.counters.loyalty).toBe(13);
    const i = activatedIndex(s, w, /^\[−12\]: You get an emblem/);
    s = settle(run(s, planActivate(s, ap, w, i)));
    expect(s.objects[w]!.counters.loyalty).toBe(1);
    expect(s.emblems?.some((id) => s.objects[id]!.owner === ap)).toBe(true);
    // The opponent's turn: Jace's +2 while the opponent's spell... any time ap has priority.
    s = passUntil(s, "upkeep", opp);
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const plan = planActivate(s, ap, w, 0);
    expect(plan).not.toBeNull();
    s = settle(run(s, plan));
    // Each player drew a card: three more counters for ap's draw only.
    expect(s.objects[w]!.counters.loyalty).toBe(4);
  });

  it("Liliana's Talent: a creature dealing it damage, combat or not, is destroyed (rulings); a spell isn't a creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const { w } = walkerWith(s0, ap, lilianas, jace, 5);
    const pyro = putOnBattlefield(s0, opp, pyromancer);
    const b = putOnBattlefield(s0, opp, bear());
    // Noncombat: the Pyromancer's ping.
    dealDamage(s0, objectSource(s0, s0.objects[pyro]!), { object: s0.objects[w]! }, 1);
    let s = settle(s0);
    expect(zone(s, pyro)).toBe("graveyard");
    expect(s.objects[w]!.counters.loyalty).toBe(4);
    // A Lightning Bolt's damage: it isn't a creature, so no trigger.
    const bolt = into(s, opp, card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." }), "hand");
    dealDamage(s, objectSource(s, s.objects[bolt]!), { object: s.objects[w]! }, 1);
    expect(s.triggerQueue).toHaveLength(0);
    s = settle(s);
    expect(s.objects[w]!.counters.loyalty).toBe(3);
    // Combat: the bear attacks Jace on its controller's turn.
    s = passUntil(s, "declareAttackers", opp);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: b, defender: ap, planeswalker: w }] });
    for (let k = 0; k < 40 && s.step !== "combatDamage"; k++) s = s.pending?.kind === "declareBlockers" ? act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] }) : act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(s, { me: ap });
    expect(s.objects[w]!.counters.loyalty).toBe(1);
    expect(zone(s, b)).toBe("graveyard");
  });

  it("Liliana's Talent: the [−8] puts every creature card from all graveyards onto the battlefield under your control", () => {
    const { s: s0, ap, opp } = setup([]);
    const { w } = walkerWith(s0, ap, lilianas, jace, 9);
    const mine = into(s0, ap, bear({ name: "My Bear" }), "graveyard");
    const theirs = into(s0, opp, bear({ name: "Their Bear" }), "graveyard");
    const notCreature = into(s0, opp, opt, "graveyard");
    const i = activatedIndex(s0, w, /^\[−8\]: Put all creature cards/);
    let s = settle(run(s0, planActivate(s0, ap, w, i)));
    expect(zone(s, mine)).toBe("battlefield");
    expect(zone(s, theirs)).toBe("battlefield");
    expect(s.objects[theirs]!.controller).toBe(ap);
    expect(zone(s, notCreature)).toBe("graveyard");
    expect(s.objects[w]!.counters.loyalty).toBe(1);
  });
});

describe("round 230: Ratchet, Field Medic", () => {
  it("gaining life: convert it, and when you do, return an artifact card with mana value up to the life gained this turn, tapped", () => {
    const { s: s0, ap } = setup([]);
    const r = putOnBattlefield(s0, ap, ratchet);
    const ring = into(s0, ap, solRing, "graveyard");
    const cannon = into(s0, ap, luxCannon, "graveyard");
    gainLife(s0, ap, 3);
    let s = s0;
    for (let k = 0; k < 50 && s.pending?.kind !== "chooseTargets" && (s.stack.length || s.triggerQueue.length || s.pending); k++) s = s.pending?.kind === "chooseMay" ? act(s, { type: "chooseMay", player: ap, yes: true }) : act(s, { type: "passPriority", player: waitingOn(s)! });
    // Converted as the first ability resolved; the reflexive one targets now (rulings).
    expect(characteristics(s, s.objects[r]!).name).toBe("Ratchet, Rescue Racer");
    const p = s.pending;
    expect(p?.kind).toBe("chooseTargets");
    // Lux Cannon's mana value 4 is more than the 3 life gained this turn.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(cannon)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(ring)] }));
    expect(zone(s, ring)).toBe("battlefield");
    expect(s.objects[ring]!.tapped).toBe(true);
    expect(zone(s, cannon)).toBe("graveyard");
  });

  it("not converted: no reflexive trigger; two at once convert it only once and the second does nothing (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const r = putOnBattlefield(s0, ap, ratchet);
    const ring = into(s0, ap, solRing, "graveyard");
    gainLife(s0, ap, 2);
    let s = settle(s0, { may: false });
    expect(characteristics(s, s.objects[r]!).name).toBe("Ratchet, Field Medic");
    expect(s.pending).toBeNull();
    // Two life gains at once: two triggers.
    gainLife(s, ap, 1);
    gainLife(s, ap, 1);
    let asked = 0;
    for (let k = 0; k < 80 && (s.stack.length || s.triggerQueue.length || s.pending); k++) {
      const pd = s.pending;
      if (pd?.kind === "chooseMay") {
        asked++;
        s = act(s, { type: "chooseMay", player: ap, yes: true });
      } else if (pd?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(ring)] });
      else if (pd) throw new Error(pd.kind);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(characteristics(s, s.objects[r]!).name).toBe("Ratchet, Rescue Racer");
    expect(s.objects[r]!.transforms).toBe(1);
    // The second ability found it converted already: no question, nothing done.
    expect(asked).toBe(1);
    expect(zone(s, ring)).toBe("battlefield");
  });
});

describe("round 230: Soul Seizer (\"you may transform it. If you do, ...\" now checks it can)", () => {
  const hit = (s0: GameState, ap: PlayerId, opp: PlayerId, seizer: ObjectId, victim: ObjectId, yes: boolean) => {
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: seizer, defender: opp }] });
    for (let k = 0; k < 60 && s.pending?.kind !== "chooseTargets"; k++) s = s.pending?.kind === "declareBlockers" ? act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] }) : act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(victim)] });
    return settle(s, { may: yes, me: ap });
  };

  it("transformed, it becomes an Aura attached to the target, and you control that creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const seizer = putOnBattlefield(s0, ap, soulSeizer);
    const victim = putOnBattlefield(s0, opp, bear());
    const s = hit(s0, ap, opp, seizer, victim, true);
    expect(characteristics(s, s.objects[seizer]!).name).toBe("Ghastly Haunting");
    expect(s.objects[seizer]!.attachedTo).toBe(victim);
    expect(characteristics(s, s.objects[victim]!).controller).toBe(ap);
  });

  it("not transformed: nothing is attached", () => {
    const { s: s0, ap, opp } = setup([]);
    const seizer = putOnBattlefield(s0, ap, soulSeizer);
    const victim = putOnBattlefield(s0, opp, bear());
    const s = hit(s0, ap, opp, seizer, victim, false);
    expect(characteristics(s, s.objects[seizer]!).name).toBe("Soul Seizer");
    expect(s.objects[seizer]!.attachedTo).toBeUndefined();
    expect(characteristics(s, s.objects[victim]!).controller).toBe(opp);
  });
});
