// Power-up (CR 702.193): "Power-up — [Cost]: [Effect]" means "[Cost]: [Effect]. If this permanent entered this turn,
// this ability's cost is reduced by this permanent's mana cost. Activate this ability only once." Colored mana in the
// mana cost takes off mana of its type, the excess off generic mana (702.193b, 118.7); a hybrid symbol picks a half
// (118.7e, Morophon rulings). Legendary characters call themselves "he" or "she" ("He fights ...").

import { describe, expect, it } from "vitest";
import { act, card, passAll, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { activationCost, compileCard, isFullySupported, parseManaCost, reduceByManaCost, type CardDef, type GameState, type ManaType, type ParsedCost, type PlayerId, type TargetChoice } from "../src";
import { addMana } from "../src/spend";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const brawler = card("Brave Brawler", "Creature — Human Warrior Hero", "{1}{W}", { power: "2", toughness: "1", keywords: ["Power-up", "Lifelink"], oracleText: "Lifelink\nPower-up — {4}{W}: Put two +1/+1 counters on this creature. (Activate each power-up ability only once. Reduce the cost by its mana cost if it entered this turn.)" });
const abomination = card("Abomination, Terrifying Titan", "Legendary Creature — Gamma Villain", "{3}{R/G}", { power: "4", toughness: "4", keywords: ["Power-up", "Trample", "Fight"], oracleText: "Trample\nPower-up — {5}{R/G}{R/G}: Put a +1/+1 counter on Abomination. He fights up to one target creature an opponent controls. (Activate each power-up ability only once. Reduce the cost by his mana cost if he entered this turn.)" });
const brawn = card("Brawn, Amadeus Cho", "Legendary Creature — Gamma Scientist Hero", "{1}{G/U}", { power: "1", toughness: "1", keywords: ["Power-up"], oracleText: "When Brawn enters, draw a card.\nPower-up — {4}{G/U}: Put a +1/+1 counter on Brawn for each card in your hand. (Activate each power-up ability only once. Reduce the cost by his mana cost if he entered this turn.)" });
const hulk = card("Hulk, Gamma Goliath", "Legendary Creature — Gamma Berserker Hero", "{3}{R}{G}", { power: "6", toughness: "5", keywords: ["Power-up", "Reach", "Trample"], oracleText: "Reach, trample\nPower-up abilities of other creatures you control cost {3} less to activate.\nPower-up — {6}{R}{G}: Put five +1/+1 counters on Hulk. (Activate each power-up ability only once. Reduce the cost by his mana cost if he entered this turn.)" });
const wonderMan = card("Wonder Man, Hollywood Hero", "Legendary Creature — Human Performer Hero", "{3}{R}{R}", { power: "4", toughness: "4", keywords: ["Flying", "Power-up"], oracleText: "Flying\nEach power-up ability of permanents you control can be activated an additional time.\nPower-up — {5}{R}{R}: Put two +1/+1 counters on Wonder Man. (Activate each power-up ability only . . . once? Reduce the cost by his mana cost if he entered this turn.)" });
const captainMarvel = card("Captain Marvel, Earth's Protector", "Legendary Creature — Human Kree Hero", "{3}{W}{W}", { power: "5", toughness: "4", keywords: ["Flying", "Power-up", "Lifelink", "Flash"], oracleText: "Flash\nFlying, lifelink\nPower-up — {5}{W}{W}: Put a +1/+1 counter and an indestructible counter on Captain Marvel. (Activate each power-up ability only once. Reduce the cost by her mana cost if she entered this turn.)" });
const extremis = card("Extremis Elite", "Creature — Human Mercenary Villain", "{1}{R}", { power: "2", toughness: "2", keywords: ["Power-up"], oracleText: "Power-up — {4}{R}: Put two +1/+1 counters on this creature. It deals 1 damage to any target. (Activate each power-up ability only once. Reduce the cost by its mana cost if it entered this turn.)" });
const grotesque = card("Gamma Grotesque", "Creature — Gamma Horror Villain", "{2}{G}", { power: "3", toughness: "3", keywords: ["Power-up", "Vigilance"], oracleText: "Vigilance (Attacking doesn't cause this creature to tap.)\nPower-up — {4}{G}{G}: Put three +1/+1 counters on this creature. Then draw a card for each creature you control with a counter on it. (Activate each power-up ability only once. Reduce the cost by its mana cost if it entered this turn.)" });
const ironFist = card("Iron Fist, Hero for Hire", "Legendary Creature — Human Mercenary Hero", "{1}{R}", { power: "2", toughness: "2", keywords: ["Power-up", "Prowess", "Trample"], oracleText: "Trample\nProwess (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)\nPower-up — {7}{R}: Iron Fist deals 5 damage divided as you choose among up to five targets. Put five +1/+1 counters on Iron Fist. (Activate each power-up ability only once. Reduce the cost by his mana cost if he entered this turn.)" });
const hercules = card("Hercules, Prince of Power", "Legendary Creature — Demigod Warrior Hero", "{2}{G}", { power: "3", toughness: "3", keywords: ["Power-up"], oracleText: "Power-up — {4}{G}: Put a +1/+1 counter on Hercules. He gains vigilance, indestructible, and haste until end of turn. (Activate each power-up ability only once. Reduce the cost by his mana cost if he entered this turn.)" });
const drone = card("Ultron Drone", "Artifact Creature — Robot Villain", "{3}", { power: "2", toughness: "3", keywords: ["Power-up"], oracleText: "Power-up — {6}: Put two +1/+1 counters on this creature and create a 2/2 colorless Robot Villain artifact creature token. (Activate each power-up ability only once. Reduce the cost by its mana cost if it entered this turn.)" });

/** A cost written back as mana symbols, generic first. */
function text(c: ParsedCost): string {
  return c.symbols
    .map((sym) => (sym.kind === "generic" ? `{${sym.amount}}` : sym.kind === "colored" ? `{${sym.color}}` : sym.kind === "hybrid" ? `{${sym.options.join("/")}}` : sym.kind === "x" ? "{X}" : `{${sym.kind}}`))
    .join("") || "{0}";
}
const reduce = (cost: string, by: string) => text(reduceByManaCost(parseManaCost(cost), parseManaCost(by)));
const cost = (s: GameState, pid: PlayerId, id: string, index = 0) => text(activationCost(s, pid, s.objects[id]!, compileCard(s.cards[s.objects[id]!.cardId]!).activated[index]!));
const clear = (s: GameState, pid: PlayerId) => {
  s.players[pid]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  s.players[pid]!.manaLots = [];
};
function use(s: GameState, pid: PlayerId, id: string, mana: ManaType[], targets: TargetChoice[] = [], index = 0): GameState {
  addMana(s, pid, mana, {});
  s = passAll(act(s, { type: "activateAbility", player: pid, objectId: id, index, targets }));
  clear(s, pid);
  return s;
}
const tryUse = (s: GameState, pid: PlayerId, id: string, mana: ManaType[]) => () => {
  addMana(s, pid, mana, {});
  act(s, { type: "activateAbility", player: pid, objectId: id, index: 0, targets: [] });
};
/** On the battlefield as if it entered this turn. */
const enteredNow = (s: GameState, pid: PlayerId, d: CardDef) => {
  const id = putOnBattlefield(s, pid, d);
  s.objects[id]!.enteredTurn = s.turn;
  return id;
};

describe("power-up", () => {
  it("parse", () => {
    supported(brawler, abomination, brawn, hulk, wonderMan, captainMarvel, extremis, grotesque, ironFist, hercules, drone);
    expect(compileCard(brawler).activated[0]).toMatchObject({ keyword: "Power-up", onceEver: true, manaCost: "{4}{W}" });
    expect(compileCard(hulk).powerUpLess).toBe(3);
    expect(compileCard(wonderMan).powerUpAgain).toBe(true);
    // "He fights" is Abomination fighting.
    expect(JSON.stringify(compileCard(abomination).activated[0]!.body)).toContain('"fight"');
  });

  it("reducing a cost by a mana cost (CR 118.7)", () => {
    expect(reduce("{4}{W}", "{1}{W}")).toBe("{3}");
    // Colored mana the cost doesn't have takes off generic (118.7b-c).
    expect(reduce("{6}", "{3}")).toBe("{3}");
    expect(reduce("{4}{G}", "{1}{R}")).toBe("{2}{G}");
    expect(reduce("{4}{G}", "{6}{R}")).toBe("{G}");
    // A hybrid symbol pays for a half the cost has (118.7e), either way round.
    expect(reduce("{5}{R/G}{R/G}", "{3}{R/G}")).toBe("{2}{R/G}");
    expect(reduce("{4}{G/U}", "{1}{G/U}")).toBe("{3}");
    expect(reduce("{4}{G}", "{1}{G/U}")).toBe("{3}");
    // X stays; {U} off {X}{U}{U}.
    expect(reduce("{X}{U}{U}", "{U}")).toBe("{X}{U}");
  });

  it("Brave Brawler: {4}{W} costs {3} the turn it entered and {4}{W} later; only once", () => {
    const { s: s0, ap } = setup([]);
    const b = enteredNow(s0, ap, brawler);
    expect(cost(s0, ap, b)).toBe("{3}");
    let s = use(s0, ap, b, ["C", "C", "C"]);
    expect(pt(s, b)).toBe("4/3");
    expect(tryUse(s, ap, b, ["W", "W", "W", "W", "W"])).toThrow(/only once/);
    clear(s, ap);
    const old = putOnBattlefield(s, ap, brawler);
    expect(cost(s, ap, old)).toBe("{4}{W}");
    expect(tryUse(s, ap, old, ["C", "C", "C"])).toThrow(/not enough mana/);
  });

  it("cast from hand, then powered up for the rest the same turn", () => {
    const { s: s0, ap, ids } = setup([brawler]);
    addMana(s0, ap, ["W", "C"], {});
    let s = passAll(act(s0, { type: "castSpell", player: ap, objectId: ids[0]! }));
    clear(s, ap);
    const b = s.battlefield.find((id) => s.objects[id]!.cardId === brawler.oracleId)!;
    expect(cost(s, ap, b)).toBe("{3}");
    s = passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    expect(cost(s, ap, b)).toBe("{4}{W}");
  });

  it("Abomination: {2}{R/G} after entering; he gets a counter and fights", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = enteredNow(s0, ap, abomination);
    const foe = putOnBattlefield(s0, opp, card("Big Bear", "Creature — Bear", "{3}{G}", { power: "3", toughness: "3" }));
    expect(cost(s0, ap, a)).toBe("{2}{R/G}");
    const s = use(s0, ap, a, ["C", "C", "G"], [target(foe)]);
    expect(pt(s, a)).toBe("5/5");
    expect(s.objects[a]!.damage).toBe(3);
    expect(s.objects[foe]!.zone).not.toBe("battlefield");
  });

  it("Hulk: other creatures' power-up costs {3} less, not his own", () => {
    const { s, ap } = setup([]);
    const h = putOnBattlefield(s, ap, hulk);
    const b = putOnBattlefield(s, ap, brawler);
    expect(cost(s, ap, b)).toBe("{1}{W}");
    expect(cost(s, ap, h)).toBe("{6}{R}{G}");
    s.objects[b]!.enteredTurn = s.turn;
    expect(cost(s, ap, b)).toBe("{0}");
  });

  it("Wonder Man: each power-up ability can be activated twice", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, wonderMan);
    const b = putOnBattlefield(s0, ap, brawler);
    let s = use(s0, ap, b, ["C", "C", "C", "C", "W"]);
    s = use(s, ap, b, ["C", "C", "C", "C", "W"]);
    expect(pt(s, b)).toBe("6/5");
    expect(tryUse(s, ap, b, ["C", "C", "C", "C", "W"])).toThrow(/only once/);
  });

  it("Captain Marvel: a +1/+1 counter and an indestructible counter", () => {
    const { s: s0, ap } = setup([]);
    const c = enteredNow(s0, ap, captainMarvel);
    expect(cost(s0, ap, c)).toBe("{2}");
    const s = use(s0, ap, c, ["C", "C"]);
    expect(s.objects[c]!.counters).toMatchObject({ "+1/+1": 1, indestructible: 1 });
  });

  it("Extremis Elite: two counters, then it deals 1 damage", () => {
    const { s: s0, ap, opp } = setup([]);
    const e = putOnBattlefield(s0, ap, extremis);
    const life = s0.players[opp]!.life;
    const s = use(s0, ap, e, ["C", "C", "C", "C", "R"], [{ kind: "player", id: opp }]);
    expect(pt(s, e)).toBe("4/4");
    expect(s.players[opp]!.life).toBe(life - 1);
  });

  it("Gamma Grotesque: a card for each creature you control with a counter of any kind on it", () => {
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, grotesque);
    const other = putOnBattlefield(s0, ap, card("Shield Bearer", "Creature — Human", "{W}", { power: "1", toughness: "1" }));
    s0.objects[other]!.counters = { shield: 1 };
    putOnBattlefield(s0, ap, card("Plain Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    const hand = s0.players[ap]!.hand.length;
    const s = use(s0, ap, g, ["C", "C", "C", "C", "G", "G"]);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });

  it("Iron Fist: 5 damage divided among up to five targets", () => {
    const { s: s0, ap, opp } = setup([]);
    const i = putOnBattlefield(s0, ap, ironFist);
    const ab = compileCard(ironFist).activated[0]!;
    expect(ab.body.targets.length).toBe(5);
    const foe = putOnBattlefield(s0, opp, card("Big Bear", "Creature — Bear", "{3}{G}", { power: "3", toughness: "3" }));
    const life = s0.players[opp]!.life;
    addMana(s0, ap, ["C", "C", "C", "C", "C", "C", "C", "R"], {});
    let s = act(s0, { type: "activateAbility", player: ap, objectId: i, index: 0, targets: [{ kind: "object", id: foe, amount: 3 }, { kind: "player", id: opp, amount: 2 }, { kind: "none" }, { kind: "none" }, { kind: "none" }] });
    s = passAll(s);
    expect(s.objects[foe]!.zone).not.toBe("battlefield");
    expect(s.players[opp]!.life).toBe(life - 2);
    expect(pt(s, i)).toBe("7/7");
  });

  it("Hercules: he gains vigilance, indestructible and haste", () => {
    const { s: s0, ap } = setup([]);
    const h = enteredNow(s0, ap, hercules);
    expect(cost(s0, ap, h)).toBe("{2}");
    const s = use(s0, ap, h, ["C", "C"]);
    expect(pt(s, h)).toBe("4/4");
    expect(compileCard(hercules).activated[0]!.body.text).toContain("~ gains vigilance");
  });

  it("Ultron Drone: a colorless {3} takes {3} off {6}", () => {
    const { s, ap } = setup([]);
    const d = enteredNow(s, ap, drone);
    expect(cost(s, ap, d)).toBe("{3}");
  });
});
