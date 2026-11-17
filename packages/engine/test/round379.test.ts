// Round 379 (Lane A): attackers chosen by another player (Master Warcraft's "You choose which creatures attack this turn":
// that player chooses the group, the active player what each attacks, rulings), Melee's unblocked attackers untapped and
// removed from combat (CR 506.4, 509.1h), In Too Deep's "Enchant creature, planeswalker, or Clue" and Urza Assembles the
// Titans' "You may activate the loyalty abilities of planeswalkers you control twice this turn rather than only once"
// (CR 606.3).

import { describe, expect, it } from "vitest";
import { act, bear, card, mountain, passUntil, plainsCard, island, putOnBattlefield, setup, target } from "./helpers";
import { abilityProblem, applyAction, botActions, characteristics, chosenAttackersProblem, isFullySupported, objIsType, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty, stopping at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 200 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const nextOf = (s: GameState, pid: PlayerId, n = 1) => s.turnOrder[(s.turnOrder.indexOf(pid) + n) % 4]!;
const lands = (s: GameState, pid: PlayerId) => {
  for (const l of [mountain, mountain, mountain, plainsCard, plainsCard, plainsCard, island, island]) putOnBattlefield(s, pid, l);
};
/** A card in `pid`'s hand. */
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
};

// Real oracle text (Scryfall).
const warcraft = (): CardDef => ({"oracleId":"f9bca7af-29b6-46ba-b847-56715d09d1da","name":"Master Warcraft","manaCost":"{2}{R/W}{R/W}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Cast this spell only before attackers are declared.\nYou choose which creatures attack this turn.\nYou choose which creatures block this turn and how those creatures block.","colors":["R","W"],"colorIdentity":["R","W"],"keywords":[],"commanderLegal":"legal","set":"rav","releasedAt":"2005-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const melee = (): CardDef => ({"oracleId":"93fc1ff8-6ef0-42a2-b090-ba95b6f3c98e","name":"Melee","manaCost":"{4}{R}","cmc":5,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Cast this spell only during combat on your turn before blockers are declared.\nYou choose which creatures block this combat and how those creatures block.\nWhenever a creature attacks and isn't blocked this combat, untap it and remove it from combat.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const tooDeep = (): CardDef => ({"oracleId":"2829ae08-9964-4679-80e8-46d5d33d10b9","name":"In Too Deep","manaCost":"{U}{U}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Split second (As long as this spell is on the stack, players can't cast spells or activate abilities that aren't mana abilities.)\nEnchant creature, planeswalker, or Clue\nEnchanted permanent is a colorless Clue artifact with \"{2}, Sacrifice this artifact: Draw a card\" and loses all other abilities. (It's no longer a creature or planeswalker.)","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant","Split second"],"commanderLegal":"legal","set":"ncc","releasedAt":"2022-04-29","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const urza = (): CardDef => ({"oracleId":"0d406496-e1c3-4e1c-976c-618d5ad67d0b","name":"Urza Assembles the Titans","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"Read ahead (Choose a chapter and start with that many lore counters. Add one after your draw step. Skipped chapters don't trigger. Sacrifice after III.)\nI — Scry 4, then you may reveal the top card of your library. If a planeswalker card is revealed this way, put it into your hand.\nII — You may put a planeswalker card with mana value 6 or less from your hand onto the battlefield.\nIII — You may activate the loyalty abilities of planeswalkers you control twice this turn rather than only once.","colors":["W"],"colorIdentity":["W"],"keywords":["Read Ahead","Scry"],"commanderLegal":"legal","set":"dmu","releasedAt":"2022-09-09","rarity":"rare","layout":"saga","gameChanger":false}) as CardDef;
const prison = (): CardDef => ({"oracleId":"e828b189-0e8f-43b8-b909-4c23e742e028","name":"Ghostly Prison","manaCost":"{2}{W}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you.","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","set":"sld","releasedAt":"2022-02-18","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const oath = (): CardDef => ({"oracleId":"ee00a42d-6ee4-4e46-92d6-62e8e5910880","name":"Oath of Teferi","manaCost":"{3}{W}{U}","cmc":5,"typeLine":"Legendary Enchantment","supertypes":["Legendary"],"types":["Enchantment"],"subtypes":[],"oracleText":"When Oath of Teferi enters, exile another target permanent you control. Return it to the battlefield under its owner's control at the beginning of the next end step.\nYou may activate the loyalty abilities of planeswalkers you control twice each turn rather than only once.","colors":["U","W"],"colorIdentity":["U","W"],"keywords":[],"commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const angel = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const giant = card("Test Giant", "Creature — Giant", "{4}{R}", { power: "5", toughness: "5" });
const brute = card("Test Brute", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3", oracleText: "This creature attacks each combat if able." });
const walker = card("Test Walker", "Legendary Planeswalker — Test", "{2}{W}", { loyalty: "3", oracleText: "+1: You gain 1 life.\n−1: You gain 2 life." });
const clue = card("Clue", "Token Artifact — Clue", "", { oracleText: "{2}, Sacrifice this token: Draw a card." });

describe("round 379: compiles", () => {
  it("Master Warcraft, Melee, In Too Deep and Urza Assembles the Titans", () => {
    for (const def of [warcraft(), melee(), tooDeep(), urza()]) expect(isFullySupported(def), def.name).toBe(true);
  });
});

describe("Urza Assembles the Titans", () => {
  /** Urza Assembles the Titans cast and its chapter III resolved (read ahead from III). */
  const ready = () => {
    const { s: s0, ap, ids } = setup([urza()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "readAhead" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "3" }));
    return { s, ap, saga: ids[0]! };
  };

  it("III: each planeswalker you control activates two loyalty abilities this turn, not three", () => {
    let { s, ap, saga } = ready();
    expect(s.turnRules).toContainEqual(expect.objectContaining({ turn: s.turn, player: ap, rule: "loyaltyTwice" }));
    expect(s.turnRules?.find((r) => r.rule === "loyaltyTwice")?.object).toBeUndefined();
    // Sacrificed after III (read ahead's reminder, CR 714.4).
    expect(s.objects[saga]!.zone).toBe("graveyard");
    const lili = putOnBattlefield(s, ap, walker);
    s.objects[lili]!.counters.loyalty = 3;
    s = settle(run(s, planActivate(s, ap, lili, 0)));
    expect(abilityProblem(s, ap, lili, 0)).toBeNull();
    s = settle(run(s, planActivate(s, ap, lili, 0)));
    expect(s.objects[lili]!.counters.loyalty).toBe(5);
    expect(abilityProblem(s, ap, lili, 0)).toMatch(/two loyalty abilities/);
  });

  it("covers planeswalkers that come later this turn; with Oath of Teferi still only twice (rulings)", () => {
    let { s, ap } = ready();
    putOnBattlefield(s, ap, oath());
    // Entered after the chapter resolved (a rule for the player, CR 611.2c doesn't apply).
    const lili = putOnBattlefield(s, ap, walker);
    s.objects[lili]!.counters.loyalty = 3;
    s = settle(run(s, planActivate(s, ap, lili, 0)));
    s = settle(run(s, planActivate(s, ap, lili, 0)));
    expect(abilityProblem(s, ap, lili, 0)).toMatch(/two loyalty abilities/);
    // An opponent's planeswalker isn't covered.
    const opp = nextOf(s, ap);
    expect(s.turnRules?.some((r) => r.rule === "loyaltyTwice" && r.player === opp)).toBe(false);
  });

  it("without Oath, a later turn of its controller's is back to one", () => {
    let { s, ap } = ready();
    const lili = putOnBattlefield(s, ap, walker);
    s.objects[lili]!.counters.loyalty = 3;
    s = passUntil(s, "main1", nextOf(s, ap));
    s = passUntil(s, "main1", ap);
    s = settle(run(s, planActivate(s, ap, lili, 0)));
    expect(abilityProblem(s, ap, lili, 0)).toMatch(/already activated this turn/);
  });
});

describe("In Too Deep", () => {
  it("makes an opponent's creature a colorless Clue artifact with only the Clue's ability, no longer a creature", () => {
    const { s: s0, ap, opp, ids } = setup([tooDeep()]);
    const flyer = putOnBattlefield(s0, opp, angel());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(flyer)])));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[0]!]!.attachedTo).toBe(flyer);
    const c = characteristics(s, s.objects[flyer]!);
    expect(c.types).toEqual(["Artifact"]);
    expect(c.subtypes).toEqual(["Clue"]);
    expect(c.colors).toEqual([]);
    expect(c.keywords).not.toContain("Flying");
    expect(objIsType(s, s.objects[flyer]!, "Creature")).toBe(false);
    // Its controller can crack it: {2}, sacrifice it, draw a card; the In Too Deep goes to the graveyard (CR 704.5m).
    lands(s, opp);
    s = passUntil(s, "main1", opp);
    const hand = s.players[opp]!.hand.length;
    s = settle(run(s, planActivate(s, opp, flyer, 0)));
    expect(s.players[opp]!.hand.length).toBe(hand + 1);
    expect(s.objects[flyer]!.zone).toBe("graveyard");
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("enchants a planeswalker, which keeps its loyalty counters but is no longer a planeswalker; a Clue too; not another artifact", () => {
    const { s: s0, ap, opp, ids } = setup([tooDeep()]);
    const w = putOnBattlefield(s0, opp, walker);
    s0.objects[w]!.counters.loyalty = 3;
    const ring = putOnBattlefield(s0, opp, solRing());
    const theirClue = putOnBattlefield(s0, opp, clue);
    expect(planCast(s0, ap, ids[0]!, [target(ring)])).toBeNull();
    expect(planCast(s0, ap, ids[0]!, [target(theirClue)])).not.toBeNull();
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(w)])));
    expect(objIsType(s, s.objects[w]!, "Planeswalker")).toBe(false);
    expect(characteristics(s, s.objects[w]!).subtypes).toEqual(["Clue"]);
    expect(s.objects[w]!.zone).toBe("battlefield");
    expect(s.objects[w]!.counters.loyalty).toBe(3);
    // Its loyalty abilities are gone; the Clue ability is the only one (index 0).
    expect(abilityProblem(s, opp, w, 1)).not.toBeNull();
  });
});

describe("Melee", () => {
  const ready = () => {
    const { s: s0, ap, opp, ids } = setup([melee()]);
    let s = s0;
    const big = putOnBattlefield(s, ap, giant);
    const two = putOnBattlefield(s, ap, bear({ name: "My Bear" }));
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    return { s, ap, opp, big, two, theirs, spell: ids[0]! };
  };

  it("only during combat on your turn before blockers are declared", () => {
    let { s, ap, opp, big, spell } = ready();
    expect(planCast(s, ap, spell)).toBeNull();
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: big, defender: opp }] });
    s = settle(s);
    expect(s.step).toBe("declareAttackers");
    expect(planCast(s, ap, spell)).not.toBeNull();
    s = passUntil(s, "declareBlockers", ap);
    expect(planCast(s, ap, spell)).toBeNull();
  });

  it("you choose the blocks; an attacker no creature blocks is untapped and removed from combat, dealing no damage", () => {
    let { s, ap, opp, big, two, theirs, spell } = ready();
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: big, defender: opp }, { attacker: two, defender: opp }] });
    s = settle(s);
    s = settle(run(s, planCast(s, ap, spell)));
    expect(s.objects[spell]!.zone).toBe("graveyard");
    const life = s.players[opp]!.life;
    s = passUntil(s, "declareBlockers", ap);
    expect(s.pending).toMatchObject({ kind: "declareBlockers", player: ap, defender: opp });
    s = act(s, { type: "declareBlockers", player: ap, blocks: [{ blocker: theirs, attacker: two }] });
    // The trigger for the Giant, which no creature blocks (CR 509.1h).
    s = settle(s);
    expect(s.objects[big]!.tapped).toBe(false);
    expect(s.objects[big]!.attacking).toBeUndefined();
    expect(s.objects[two]!.attacking).toBe(opp);
    s = passUntil(s, "endCombat", ap);
    expect(s.players[opp]!.life).toBe(life);
  });

  it("lasts for that combat only", () => {
    let { s, ap, opp, big, spell } = ready();
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: big, defender: opp }] });
    s = settle(run(settle(s), planCast(settle(s), ap, spell)));
    expect(s.floatingTriggers?.length).toBe(1);
    s = passUntil(s, "main2", ap);
    expect(s.floatingTriggers ?? []).toEqual([]);
  });
});

describe("Master Warcraft", () => {
  /** The active player has a Giant and a Bear; the next player casts Master Warcraft in the active player's beginning of combat. */
  const ready = (extra?: (s: GameState, ap: PlayerId, opp: PlayerId) => void) => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const big = putOnBattlefield(s, ap, giant);
    const two = putOnBattlefield(s, ap, bear({ name: "My Bear" }));
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    lands(s, opp);
    const spell = inHand(s, opp, warcraft());
    extra?.(s, ap, opp);
    s = passUntil(s, "beginCombat", ap);
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    s = settle(run(s, planCast(s, opp, spell)));
    expect(s.attacksChosenThisTurn).toEqual([expect.objectContaining({ player: opp, turn: s.turn })]);
    s = passUntil(s, "declareAttackers", ap);
    return { s, ap, opp, big, two, theirs, spell };
  };

  it("only before attackers are declared", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    putOnBattlefield(s, ap, giant);
    lands(s, opp);
    const spell = inHand(s, opp, warcraft());
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [] });
    s = passUntil(s, "main2", ap);
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    expect(planCast(s, opp, spell)).toBeNull();
  });

  it("the caster chooses the group of attackers, then the active player declares exactly those, choosing what each attacks", () => {
    let { s, ap, opp, big, two } = ready();
    expect(s.pending).toEqual({ kind: "chooseAttackers", player: opp, attacker: ap });
    // Only the active player's creatures that could attack.
    expect(chosenAttackersProblem(s, opp, [big])).toBeNull();
    expect(() => act(s, { type: "chooseAttackers", player: ap, attackers: [big] })).toThrow();
    s = act(s, { type: "chooseAttackers", player: opp, attackers: [big] });
    expect(s.pending).toEqual({ kind: "declareAttackers", player: ap, fixed: [big], chooser: opp });
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [] })).toThrow(/declare Test Giant/);
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: big, defender: opp }, { attacker: two, defender: opp }] })).toThrow();
    // Nothing costs anything here, so there's nothing to refuse.
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [], decline: true })).toThrow(/without paying/);
    const third = nextOf(s, ap, 2);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: big, defender: third }] });
    expect(s.objects[big]!.attacking).toBe(third);
    expect(s.objects[two]!.attacking).toBeUndefined();
  });

  it("no attackers, if that's the choice", () => {
    let { s, ap, opp, big } = ready();
    s = act(s, { type: "chooseAttackers", player: opp, attackers: [] });
    expect(s.objects[big]!.attacking).toBeUndefined();
    expect(s.pending?.kind).not.toBe("declareAttackers");
  });

  it("the choice must be legal: a creature that attacks each combat if able is in the group (CR 508.1d, rulings)", () => {
    let brute0 = "";
    let { s, opp, big } = ready((s, ap) => {
      brute0 = putOnBattlefield(s, ap, brute);
    });
    expect(chosenAttackersProblem(s, opp, [])).toMatch(/attacks each combat if able/);
    expect(() => act(s, { type: "chooseAttackers", player: opp, attackers: [big] })).toThrow(/attacks each combat if able/);
    s = act(s, { type: "chooseAttackers", player: opp, attackers: [brute0] });
    expect(s.pending).toMatchObject({ kind: "declareAttackers", fixed: [brute0] });
  });

  it("the active player may refuse to pay when every way to attack with the group costs something; that group can't be chosen again", () => {
    let { s, ap, opp, big } = ready((s, ap) => {
      for (const d of s.turnOrder.filter((x) => x !== ap)) putOnBattlefield(s, d, prison());
    });
    s = act(s, { type: "chooseAttackers", player: opp, attackers: [big] });
    s = act(s, { type: "declareAttackers", player: ap, attacks: [], decline: true });
    expect(s.pending).toEqual({ kind: "chooseAttackers", player: opp, attacker: ap, declined: [big] });
    expect(chosenAttackersProblem(s, opp, [big])).toMatch(/won't pay/);
    s = act(s, { type: "chooseAttackers", player: opp, attackers: [] });
    expect(s.objects[big]!.attacking).toBeUndefined();
  });

  it("they choose the blocks this turn too", () => {
    let { s, ap, opp, big, theirs } = ready();
    const third = nextOf(s, ap, 2);
    const thirds = putOnBattlefield(s, third, bear({ name: "Third Bear" }));
    s = act(s, { type: "chooseAttackers", player: opp, attackers: [big] });
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: big, defender: third }] }));
    s = passUntil(s, "declareBlockers", ap);
    expect(s.pending).toMatchObject({ kind: "declareBlockers", player: opp, defender: third });
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: thirds, attacker: big }] });
    expect(s.objects[thirds]!.blocking).toEqual([big]);
    expect(s.objects[theirs]!.blocking).toBeUndefined();
  });

  it("cast on your own turn, you declare your attacks as usual", () => {
    const { s: s0, ap, ids } = setup([warcraft()]);
    let s = s0;
    putOnBattlefield(s, ap, giant);
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    s = passUntil(s, "declareAttackers", ap);
    expect(s.pending).toEqual({ kind: "declareAttackers", player: ap });
  });

  it("bots: as the chooser, as few attackers as the rules allow; as the active player, the chosen ones at someone, never paying", () => {
    let brute0 = "";
    let { s, ap, opp, big } = ready((s, ap) => {
      brute0 = putOnBattlefield(s, ap, brute);
    });
    const pick = botActions(s, opp);
    expect(pick).toEqual([{ type: "chooseAttackers", player: opp, attackers: [brute0] }]);
    s = act(s, pick[0]!);
    const decl = botActions(s, ap);
    expect(decl).toHaveLength(1);
    expect(decl[0]).toMatchObject({ type: "declareAttackers", player: ap, attacks: [{ attacker: brute0 }] });
    s = act(s, decl[0]!);
    expect(s.objects[brute0]!.attacking).toBeDefined();
    expect(s.objects[big]!.attacking).toBeUndefined();
  });

  it("bots refuse to pay for a group that costs something to attack with", () => {
    let { s, ap, opp, big } = ready((s, ap) => {
      for (const d of s.turnOrder.filter((x) => x !== ap)) putOnBattlefield(s, d, prison());
    });
    s = act(s, { type: "chooseAttackers", player: opp, attackers: [big] });
    expect(botActions(s, ap)).toEqual([{ type: "declareAttackers", player: ap, attacks: [], decline: true }]);
  });
});
