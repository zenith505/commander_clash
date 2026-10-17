// Tempting offers ("each opponent may ... For each opponent who does, ..."), airbend (CR 701.65a) and "its owner may
// cast it for as long as it remains exiled", Adeline's "or a planeswalker they control", Nalfeshnee's copies, and
// "if a land card was milled this way".

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { botActions, characteristics, invalidateCharacteristics, planActivate, isFullySupported, objHasKeyword, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";
import { castProblem } from "../src/game";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));

/** Pass, and let bots answer every choice, until the stack and trigger queue are empty; `answer` gives the test's own answer, or null to stop. */
function settle(s: GameState, answer?: (s: GameState) => Action | undefined | null) {
  for (let i = 0; i < 200 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    const mine = answer?.(s);
    if (mine === null) break;
    if (mine) s = act(s, mine);
    else if (s.pending) s = act(s, botActions(s, pid)[0]!);
    else s = act(s, { type: "passPriority", player: pid });
  }
  return s;
}
const castNow = (s: GameState, pid: PlayerId, id: string, targets?: Parameters<typeof planCast>[3], modes?: number[]) => {
  const plan = planCast(s, pid, id, targets, modes);
  if (!plan) throw new Error(`can't cast ${s.cards[s.objects[id]!.cardId]!.name}`);
  return plan.reduce((x, a) => act(x, a), s);
};
function moveTo(s: GameState, id: string, zone: "hand" | "graveyard" | "library") {
  const o = s.objects[id]!;
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  o.zone = zone;
  const p = s.players[o.owner]!;
  if (zone === "library") p.library.unshift(id);
  else p[zone].push(id);
  invalidateCharacteristics(s);
  return id;
}
const named = (s: GameState, name: string, pid?: PlayerId) => s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === name && (pid === undefined || s.objects[id]!.controller === pid));
const opps = (s: GameState, ap: PlayerId) => [1, 2, 3].map((i) => s.turnOrder[(s.turnOrder.indexOf(ap) + i) % 4]!) as [PlayerId, PlayerId, PlayerId];

// Real oracle text (Scryfall).
const temptGlory = card("Tempt with Glory", "Sorcery", "{5}{W}", { keywords: ["Tempting offer"], oracleText: "Tempting offer — Put a +1/+1 counter on each creature you control. Each opponent may put a +1/+1 counter on each creature they control. For each opponent who does, put a +1/+1 counter on each creature you control." });
const temptBunnies = card("Tempt with Bunnies", "Sorcery", "{2}{W}", { keywords: ["Tempting offer"], oracleText: "Tempting Offer — Draw a card and create a 1/1 white Rabbit creature token. Then each opponent may draw a card and create a 1/1 white Rabbit creature token. For each opponent who does, you draw a card and you create a 1/1 white Rabbit creature token." });
const temptImmortality = card("Tempt with Immortality", "Sorcery", "{4}{B}", { keywords: ["Tempting offer"], oracleText: "Tempting offer — Return a creature card from your graveyard to the battlefield. Each opponent may return a creature card from their graveyard to the battlefield. For each opponent who does, return a creature card from your graveyard to the battlefield." });
const temptReflections = card("Tempt with Reflections", "Sorcery", "{3}{U}", { keywords: ["Tempting offer"], oracleText: "Tempting offer — Choose target creature you control. Create a token that's a copy of that creature. Each opponent may create a token that's a copy of that creature. For each opponent who does, create a token that's a copy of that creature." });
const temptVengeance = card("Tempt with Vengeance", "Sorcery", "{X}{R}", { keywords: ["Tempting offer"], oracleText: "Tempting offer — Create X 1/1 red Elemental creature tokens with haste. Each opponent may create X 1/1 red Elemental creature tokens with haste. For each opponent who does, create X 1/1 red Elemental creature tokens with haste." });
const temptingContract = card("Tempting Contract", "Artifact", "{4}", { keywords: ["Treasure"], oracleText: "At the beginning of your upkeep, each opponent may create a Treasure token. For each opponent who does, you create a Treasure token." });
const airbendingLesson = card("Airbending Lesson", "Instant — Lesson", "{2}{W}", { keywords: ["Airbend"], oracleText: "Airbend target nonland permanent. (Exile it. While it's exiled, its owner may cast it for {2} rather than its mana cost.)\nDraw a card." });
const airbendersReversal = card("Airbender's Reversal", "Instant — Lesson", "{1}{W}", { keywords: ["Airbend"], oracleText: "Choose one —\n• Destroy target attacking creature.\n• Airbend target creature you control. (Exile it. While it's exiled, its owner may cast it for {2} rather than its mana cost.)" });
const whirlwind = card("Whirlwind Technique", "Instant — Lesson", "{4}{U}{U}", { keywords: ["Airbend"], oracleText: "Target player draws two cards, then discards a card.\nAirbend up to two target creatures. (To airbend a creature, exile it. While it's exiled, its owner may cast it for {2} rather than its mana cost.)" });
const gliderStaff = card("Glider Staff", "Artifact — Equipment", "{2}{W}", { keywords: ["Airbend", "Equip"], oracleText: "When this Equipment enters, airbend up to one target creature. (Exile it. While it's exiled, its owner may cast it for {2} rather than its mana cost.)\nEquipped creature gets +1/+1 and has flying.\nEquip {2}" });
const releaseToTheWind = card("Release to the Wind", "Instant", "{2}{U}", { oracleText: "Exile target nonland permanent. For as long as that card remains exiled, its owner may cast it without paying its mana cost." });
const soulPartition = card("Soul Partition", "Instant", "{1}{W}", { oracleText: "Exile target nonland permanent. For as long as that card remains exiled, its owner may play it. A spell cast by an opponent this way costs {2} more to cast." });
const aerialExtortionist = card("Aerial Extortionist", "Creature — Bird Soldier", "{3}{W}{W}", { power: "4", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nWhenever this creature enters or deals combat damage to a player, exile up to one target nonland permanent. For as long as that card remains exiled, its owner may cast it.\nWhenever another player casts a spell from anywhere other than their hand, draw a card." });
const adeline = card("Adeline, Resplendent Cathar", "Legendary Creature — Human Knight", "{1}{W}{W}", { power: "*", toughness: "4", keywords: ["Vigilance"], oracleText: "Vigilance\nAdeline's power is equal to the number of creatures you control.\nWhenever you attack, for each opponent, create a 1/1 white Human creature token that's tapped and attacking that player or a planeswalker they control." });
const nalfeshnee = card("Nalfeshnee", "Creature — Demon", "{5}{R}{R}", { power: "6", toughness: "6", keywords: ["Flying"], oracleText: 'Flying\nWhenever you cast a spell from exile, copy it. You may choose new targets for the copy. If it\'s a permanent spell, the copy gains haste and "At the beginning of the end step, sacrifice this permanent." (A copy of a permanent spell becomes a token.)' });
const lorehold = card("Lorehold Excavation", "Enchantment", "{R}{W}", { keywords: ["Mill"], oracleText: "At the beginning of your end step, mill a card. If a land card was milled this way, you gain 1 life. Otherwise, this enchantment deals 1 damage to each opponent. (To mill a card, put the top card of your library into your graveyard.)\n{5}, Exile a creature card from your graveyard: Create a tapped 3/2 red and white Spirit creature token." });
const saprazzan = card("Saprazzan Breaker", "Creature — Beast", "{4}{U}", { power: "3", toughness: "3", keywords: ["Mill"], oracleText: "{U}: Mill a card. If a land card was milled this way, this creature can't be blocked this turn." });

const walker = card("Walker Test", "Legendary Planeswalker — Test", "{3}", { loyalty: "3", oracleText: "+1: You gain 1 life." });
const hydra = card("Hydra Test", "Creature — Hydra", "{X}{G}", { power: "0", toughness: "0", oracleText: "This creature enters with X +1/+1 counters on it." });
const treefolk = card("Treefolk Test", "Creature — Treefolk", "{5}{G}{G}", { power: "6", toughness: "6" });
const shrine = card("Test Shrine", "Enchantment", "{1}", { oracleText: "" });

describe("tempting offers", () => {
  it("compile", () => supported(temptGlory, temptBunnies, temptImmortality, temptReflections, temptVengeance, temptingContract));

  it("Tempt with Glory: every opponent who accepts gets the counters, and you get one more for each", () => {
    const { s: s0, ap, ids } = setup([temptGlory]);
    const mine = putOnBattlefield(s0, ap, bear());
    const [b1, b2, b3] = opps(s0, ap);
    const theirs = [b1, b2, b3].map((p) => putOnBattlefield(s0, p, bear()));
    // b2 declines; the bots accept.
    const s = settle(castNow(s0, ap, ids[0]!), (x) => (x.pending?.kind === "chooseMay" && x.pending.player === b2 ? { type: "chooseMay", player: b2, yes: false } : undefined));
    expect(s.objects[mine]!.counters["+1/+1"]).toBe(3);
    expect(theirs.map((id) => s.objects[id]!.counters["+1/+1"] ?? 0)).toEqual([1, 0, 1]);
  });

  it("Tempt with Bunnies: an opponent who accepts draws and gets a Rabbit; you draw and get one for each", () => {
    const { s: s0, ap, ids } = setup([temptBunnies]);
    const [b1, b2, b3] = opps(s0, ap);
    const hands = [ap, b1, b2, b3].map((p) => s0.players[p]!.hand.length);
    const s = settle(castNow(s0, ap, ids[0]!), (x) => (x.pending?.kind === "chooseMay" && x.pending.player === b3 ? { type: "chooseMay", player: b3, yes: false } : undefined));
    const rabbits = (p: PlayerId) => named(s, "Rabbit Token", p).length;
    expect([ap, b1, b2, b3].map(rabbits)).toEqual([3, 1, 1, 0]);
    // ap: the sorcery left the hand, then three draws.
    expect([ap, b1, b2, b3].map((p) => s.players[p]!.hand.length - hands[[ap, b1, b2, b3].indexOf(p)]!)).toEqual([2, 1, 1, 0]);
  });

  it("Tempt with Immortality: an opponent with no creature card in their graveyard isn't asked", () => {
    const { s: s0, ap, ids } = setup([temptImmortality]);
    const [b1, b2, b3] = opps(s0, ap);
    const mine = [moveTo(s0, putOnBattlefield(s0, ap, bear()), "graveyard"), moveTo(s0, putOnBattlefield(s0, ap, treefolk), "graveyard")];
    const theirs = moveTo(s0, putOnBattlefield(s0, b1, bear()), "graveyard");
    const asked: PlayerId[] = [];
    const s = settle(castNow(s0, ap, ids[0]!), (x) => {
      if (x.pending?.kind === "chooseMay") asked.push(x.pending.player);
      return undefined;
    });
    expect(asked).toEqual([b1]);
    expect(s.objects[theirs]!.zone).toBe("battlefield");
    expect(mine.map((id) => s.objects[id]!.zone)).toEqual(["battlefield", "battlefield"]);
    expect([b2, b3].every((p) => !logged(s, new RegExp(`^${s.players[p]!.name} returns`)))).toBe(true);
  });

  it("Tempt with Reflections: copies of the target creature for each accepting opponent", () => {
    const { s: s0, ap, ids } = setup([temptReflections]);
    const t = putOnBattlefield(s0, ap, treefolk);
    const s = settle(castNow(s0, ap, ids[0]!, [target(t)]));
    expect(named(s, "Treefolk Test", ap)).toHaveLength(5); // the original, one, and one per opponent
    opps(s, ap).forEach((p) => expect(named(s, "Treefolk Test", p)).toHaveLength(1));
  });

  it("Tempting Contract: at your upkeep each opponent may create a Treasure; you create one for each who does", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, temptingContract);
    const [b1] = opps(s0, ap);
    let s = passUntil(s0, "upkeep", b1);
    s = settle(passUntil(s, "upkeep", ap), (x) => (x.pending?.kind === "chooseMay" && x.pending.player === b1 ? { type: "chooseMay", player: b1, yes: false } : undefined));
    expect(named(s, "Treasure Token", ap)).toHaveLength(2);
    expect(named(s, "Treasure Token", b1)).toHaveLength(0);
    expect(named(s, "Treasure Token", opps(s, ap)[1]!)).toHaveLength(1);
  });
});

describe("airbend and owner-may-cast exiles", () => {
  it("compile", () => supported(airbendingLesson, airbendersReversal, whirlwind, gliderStaff, releaseToTheWind, soulPartition, aerialExtortionist));

  it("airbend: exiled, its owner may cast it for {2} rather than its mana cost, but not for an alternative cost", () => {
    const { s: s0, ap, ids } = setup([airbendingLesson]);
    const t = putOnBattlefield(s0, ap, treefolk);
    let s = settle(castNow(s0, ap, ids[0]!, [target(t)]));
    expect(s.objects[t]!.zone).toBe("exile");
    expect(s.objects[t]!.mayPlay).toMatchObject({ player: ap, cost: "{2}" });
    s = settle(castNow(s, ap, t));
    expect(s.objects[t]!.zone).toBe("battlefield");
    expect(s.objects[t]!.manaSpent).toBe(2);
  });

  it("airbend: a card with {X} cast for {2} has X = 0 (CR 107.3b)", () => {
    const { s: s0, ap, ids } = setup([airbendersReversal]);
    const h = putOnBattlefield(s0, ap, hydra);
    s0.objects[h]!.counters["+1/+1"] = 3;
    let s = settle(castNow(s0, ap, ids[0]!, [target(h)], [1]));
    expect(s.objects[h]!.zone).toBe("exile");
    expect(castProblem(s, ap, h, [], undefined, undefined, undefined, 3)).toMatch(/X is 0/);
    expect(planCast(s, ap, h, [], undefined, undefined, 3)).toBeNull();
    s = settle(castNow(s, ap, h));
    expect(logged(s, /Hydra Test resolves/)).toBe(true);
    expect(s.objects[h]!.zone).toBe("graveyard"); // X was 0: a 0/0, put into the graveyard (CR 704.5f)
  });

  it("airbend: an opponent's permanent goes back to its owner, who may cast it", () => {
    const { s: s0, ap, ids } = setup([airbendingLesson]);
    const [b1] = opps(s0, ap);
    const w = putOnBattlefield(s0, b1, shrine);
    const s = settle(castNow(s0, ap, ids[0]!, [target(w)]));
    expect(s.objects[w]!.mayPlay).toMatchObject({ player: b1, cost: "{2}" });
    expect(castProblem(s, ap, w)).not.toBeNull();
  });

  it("Release to the Wind: the owner may cast it without paying its mana cost while it remains exiled", () => {
    const { s: s0, ap, ids } = setup([releaseToTheWind]);
    const t = putOnBattlefield(s0, ap, treefolk);
    let s = settle(castNow(s0, ap, ids[0]!, [target(t)]));
    expect(s.objects[t]!.mayPlay).toMatchObject({ player: ap, until: "exiled", free: true });
    s = settle(castNow(s, ap, t));
    expect(s.objects[t]!.zone).toBe("battlefield");
    expect(s.objects[t]!.manaSpent ?? 0).toBe(0);
  });

  it("Soul Partition: an opponent's spell cast this way costs {2} more; yours doesn't", () => {
    const { s: s0, ap, ids } = setup([soulPartition, soulPartition]);
    const [b1] = opps(s0, ap);
    const mine = putOnBattlefield(s0, ap, shrine);
    const theirs = putOnBattlefield(s0, b1, shrine);
    let s = settle(castNow(s0, ap, ids[0]!, [target(mine)]));
    s = settle(castNow(s, ap, ids[1]!, [target(theirs)]));
    expect(s.objects[mine]!.mayPlay).toMatchObject({ player: ap });
    expect(s.objects[mine]!.mayPlay?.more ?? 0).toBe(0);
    expect(s.objects[theirs]!.mayPlay).toMatchObject({ player: b1, more: 2 });
    s = settle(castNow(s, ap, mine));
    expect(s.objects[mine]!.manaSpent).toBe(1);
  });

  it("Aerial Extortionist: entering exiles up to one nonland permanent; its owner may cast it", () => {
    const { s: s0, ap, ids } = setup([aerialExtortionist]);
    const [b1] = opps(s0, ap);
    const theirs = putOnBattlefield(s0, b1, bear());
    const s = settle(castNow(s0, ap, ids[0]!), (x) => (x.pending?.kind === "chooseTargets" && x.pending.player === ap ? { type: "chooseTargets", player: ap, targets: [target(theirs)] } : undefined));
    expect(s.objects[theirs]!.zone).toBe("exile");
    expect(s.objects[theirs]!.mayPlay).toMatchObject({ player: b1, until: "exiled" });
  });
});

describe("Adeline and Nalfeshnee", () => {
  it("Adeline: the token for an opponent with a planeswalker may attack the planeswalker", () => {
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, adeline);
    const [b1] = opps(s0, ap);
    const w = putOnBattlefield(s0, b1, walker);
    s0.objects[w]!.counters.loyalty = 3;
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: b1 }] });
    let asked = false;
    s = settle(s, (x) => {
      if (x.pending?.kind === "chooseOption" && x.pending.what === "attackWhom") {
        asked = true;
        expect(x.pending.options).toEqual([String(b1), `${b1}:${w}`]);
        return { type: "chooseOption", player: ap, choice: `${b1}:${w}` };
      }
      return undefined;
    });
    expect(asked).toBe(true);
    const humans = named(s, "Human Token", ap);
    expect(humans).toHaveLength(3);
    const toWalker = humans.filter((id) => s.objects[id]!.attackingPermanent?.id === w);
    expect(toWalker).toHaveLength(1);
    expect(s.objects[toWalker[0]!]!.attacking).toBe(b1);
  });

  it("Nalfeshnee: a permanent spell cast from exile is copied; the token has haste and is sacrificed at the end step", () => {
    const { s: s0, ap, ids } = setup([releaseToTheWind]);
    putOnBattlefield(s0, ap, nalfeshnee);
    const t = putOnBattlefield(s0, ap, treefolk);
    let s = settle(castNow(s0, ap, ids[0]!, [target(t)]));
    s = settle(castNow(s, ap, t));
    const trees = named(s, "Treefolk Test", ap);
    expect(trees).toHaveLength(2);
    const token = trees.find((id) => s.objects[id]!.isToken)!;
    expect(objHasKeyword(s, s.objects[token]!, "Haste")).toBe(true);
    expect(objHasKeyword(s, s.objects[t]!, "Haste")).toBe(false);
    s = settle(passUntil(s, "end", ap));
    expect(s.objects[token]).toBeUndefined();
    expect(s.objects[t]!.zone).toBe("battlefield");
  });
});

describe("if a land card was milled this way", () => {
  it("compile", () => supported(lorehold, saprazzan));

  it("Saprazzan Breaker: milling a land makes it unblockable this turn; anything else doesn't", () => {
    const { s: s0, ap } = setup([]);
    const b = putOnBattlefield(s0, ap, saprazzan);
    moveTo(s0, putOnBattlefield(s0, ap, bear()), "library");
    const act1 = (x: GameState) => settle(planActivate(x, ap, b, 0)!.reduce((y, a) => act(y, a), x));
    let s = act1(s0);
    expect(characteristics(s, s.objects[b]!).cantBeBlocked ?? false).toBe(false);
    s = act1(s); // a Forest from the deck
    expect(characteristics(s, s.objects[b]!).cantBeBlocked).toBeTruthy();
  });
});
