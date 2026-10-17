// "That ability triggers an additional time" (CR 603.2d): Panharmonicon, Yarok, Elesh Norn, Teysa Karlov, Isshin, Annie
// Joins Up and others. The ability triggers that many times (each instance with its own targets and choices); each such
// effect adds one; it never applies to delayed or reflexive triggers; only abilities of permanents the effect's controller
// controls (rulings on Panharmonicon, Teysa Karlov, Isshin, Annie Joins Up).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";
import { defOf } from "../src/cards";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return s;
};
const castIt = (s: GameState, pid: PlayerId, id: string) => settle(run(s, planCast(s, pid, id)));
const named = (s: GameState, re: RegExp) => s.battlefield.filter((id) => re.test(defOf(s, s.objects[id]!).name));

// Real oracle text (Scryfall).
const panharmonicon = card("Panharmonicon", "Artifact", "{4}", { oracleText: "If an artifact or creature entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time." });
const yarok = card("Yarok, the Desecrated", "Legendary Creature — Elemental Horror", "{2}{B}{G}{U}", { power: "3", toughness: "5", keywords: ["Deathtouch", "Lifelink"], oracleText: "Deathtouch, lifelink\nIf a permanent entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time." });
const eleshNorn = card("Elesh Norn, Mother of Machines", "Legendary Creature — Phyrexian Praetor", "{4}{W}", { power: "4", toughness: "7", keywords: ["Vigilance"], oracleText: "Vigilance\nIf a permanent entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.\nPermanents entering don't cause abilities of permanents your opponents control to trigger." });
const teysa = card("Teysa Karlov", "Legendary Creature — Human Advisor", "{2}{W}{B}", { power: "2", toughness: "4", oracleText: "If a creature dying causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.\nCreature tokens you control have vigilance and lifelink." });
const isshin = card("Isshin, Two Heavens as One", "Legendary Creature — Human Samurai", "{R}{W}{B}", { power: "3", toughness: "4", oracleText: "If a creature attacking causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time." });
const annie = card("Annie Joins Up", "Legendary Enchantment", "{1}{R}{G}{W}", { oracleText: "When Annie Joins Up enters, it deals 5 damage to target creature or planeswalker an opponent controls.\nIf a triggered ability of a legendary creature you control triggers, that ability triggers an additional time." });
const harmonic = card("Harmonic Prodigy", "Creature — Human Wizard", "{1}{R}", { power: "1", toughness: "3", keywords: ["Prowess"], oracleText: "Prowess (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)\nIf a triggered ability of a Shaman or another Wizard you control triggers, that ability triggers an additional time." });
const delney = card("Delney, Streetwise Lookout", "Legendary Creature — Human Scout", "{2}{W}", { power: "2", toughness: "2", oracleText: "Creatures you control with power 2 or less can't be blocked by creatures with power 3 or greater.\nIf a triggered ability of a creature you control with power 2 or less triggers, that ability triggers an additional time." });
const others = [
  card("Ancient Greenwarden", "Creature — Elemental", "{4}{G}{G}", { power: "5", toughness: "7", keywords: ["Reach"], oracleText: "Reach (This creature can block creatures with flying.)\nYou may play lands from your graveyard.\nIf a land entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time." }),
  card("Chief of the Wilds", "Legendary Creature — Wolf", "{2}{G}{G}", { power: "4", toughness: "4", keywords: ["Menace"], oracleText: "Menace\nWhenever another Wolf you control enters, put two +1/+1 counters on Chief of the Wilds.\nIf a triggered ability of another Wolf or battle you control triggers, that ability triggers an additional time." }),
  card("Felix Five-Boots", "Legendary Creature — Ooze Rogue", "{2}{B}{G}{U}", { power: "5", toughness: "4", keywords: ["Menace", "Ward"], oracleText: "Menace, ward {2}\nIf a creature you control dealing combat damage to a player causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time." }),
  card("Naban, Dean of Iteration", "Legendary Creature — Human Wizard", "{1}{U}", { power: "2", toughness: "1", oracleText: "If a Wizard you control entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time." }),
  card("Traveling Chocobo", "Creature — Bird", "{2}{G}", { power: "3", toughness: "2", oracleText: "You may look at the top card of your library any time.\nYou may play lands and cast Bird spells from the top of your library.\nIf a land or Bird you control entering the battlefield causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time." }),
  card("Twinflame Travelers", "Creature — Elemental Sorcerer", "{2}{U}{R}", { power: "3", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nIf a triggered ability of another Elemental you control triggers, it triggers an additional time." }),
  card("Wulfgar of Icewind Dale", "Legendary Creature — Human Barbarian", "{2}{R}{G}", { power: "4", toughness: "4", keywords: ["Melee"], oracleText: "Melee (Whenever this creature attacks, it gets +1/+1 until end of turn for each opponent you attacked this combat.)\nIf a creature you control attacking causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time." }),
];
const strix = card("Baleful Strix", "Artifact Creature — Bird", "{U}{B}", { power: "1", toughness: "1", keywords: ["Flying", "Deathtouch"], oracleText: "Flying, deathtouch\nWhen this creature enters, draw a card." });
const courser = card("Courser of Kruphix", "Enchantment Creature — Centaur", "{1}{G}{G}", { power: "2", toughness: "4", oracleText: "Play with the top card of your library revealed.\nYou may play lands from the top of your library.\nLandfall — Whenever a land you control enters, you gain 1 life." });
const traveler = card("Doomed Traveler", "Creature — Human Soldier", "{W}", { power: "1", toughness: "1", oracleText: "When this creature dies, create a 1/1 white Spirit creature token with flying." });
const zulaport = card("Zulaport Cutthroat", "Creature — Human Rogue Ally", "{1}{B}", { power: "1", toughness: "1", oracleText: "Whenever this creature or another creature you control dies, each opponent loses 1 life and you gain 1 life." });
const juri = card("Juri, Master of the Revue", "Legendary Creature — Human Shaman", "{B}{R}", { power: "1", toughness: "1", oracleText: "Whenever you sacrifice a permanent, put a +1/+1 counter on Juri.\nWhen Juri dies, it deals damage equal to its power to any target." });
const villageRites = card("Village Rites", "Instant", "{B}", { oracleText: "As an additional cost to cast this spell, sacrifice a creature.\nDraw two cards." });
const wrath = card("Wrath of God", "Sorcery", "{2}{W}{W}", { oracleText: "Destroy all creatures. They can't be regenerated." });
const herald = card("Herald of Faith", "Creature — Angel", "{3}{W}{W}", { power: "4", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nWhenever this creature attacks, you gain 2 life." });
const sunscribe = card("Attentive Sunscribe", "Artifact Creature — Gnome", "{1}{W}", { power: "2", toughness: "2", oracleText: "Whenever this creature becomes tapped, scry 1. (Look at the top card of your library. You may put that card on the bottom.)" });
const sparktongue = card("Sparktongue Dragon", "Creature — Dragon", "{3}{R}{R}", { power: "3", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nWhen this creature enters, you may pay {2}{R}. When you do, it deals 3 damage to any target." });
const legendaryHerald = card("Aurelia's Herald", "Legendary Creature — Angel", "{3}{W}{W}", { power: "4", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nWhenever this creature attacks, you gain 2 life." });

const hand = (s: GameState, pid: PlayerId) => s.players[pid]!.hand.length;

describe("triggers an additional time: parse", () => {
  it("the new lines compile", () => supported(panharmonicon, yarok, eleshNorn, teysa, isshin, annie, harmonic, delney, ...others));
});

describe('"If an artifact or creature / a permanent entering causes ..."', () => {
  it("Panharmonicon: a creature's own enters trigger triggers twice; two Panharmonicons, three times", () => {
    const { s: s0, ap, ids } = setup([strix, strix]);
    putOnBattlefield(s0, ap, panharmonicon);
    let s = s0;
    let before = hand(s, ap);
    s = castIt(s, ap, ids[0]!);
    expect(hand(s, ap)).toBe(before - 1 + 2);
    putOnBattlefield(s, ap, panharmonicon);
    before = hand(s, ap);
    s = castIt(s, ap, ids[1]!);
    expect(hand(s, ap)).toBe(before - 1 + 3);
  });

  it("Panharmonicon: a land entering isn't an artifact or creature; Yarok counts any permanent", () => {
    for (const [doubler, gain] of [[panharmonicon, 1], [yarok, 2]] as const) {
      const { s: s0, ap } = setup([]);
      putOnBattlefield(s0, ap, courser);
      putOnBattlefield(s0, ap, doubler);
      const life = s0.players[ap]!.life;
      const land = s0.players[ap]!.hand.find((id) => defOf(s0, s0.objects[id]!).types.includes("Land"))!;
      const s = settle(act(s0, { type: "playLand", player: ap, objectId: land }));
      expect(s.players[ap]!.life, doubler.name).toBe(life + gain);
    }
  });

  it("Panharmonicon: an opponent's doesn't affect your abilities", () => {
    const { s: s0, ap, ids, opp } = setup([strix]);
    putOnBattlefield(s0, opp, panharmonicon);
    const before = hand(s0, ap);
    const s = castIt(s0, ap, ids[0]!);
    expect(hand(s, ap)).toBe(before - 1 + 1);
  });

  it("Elesh Norn: your abilities trigger twice, an opponent's not at all", () => {
    const { s: s0, ap, ids, opp } = setup([strix]);
    putOnBattlefield(s0, ap, eleshNorn);
    const watcher = putOnBattlefield(s0, opp, card("Soul Warden", "Creature — Human Cleric", "{W}", { power: "1", toughness: "1", oracleText: "Whenever another creature enters, you gain 1 life." }));
    const life = s0.players[opp]!.life;
    const before = hand(s0, ap);
    const s = castIt(s0, ap, ids[0]!);
    expect(hand(s, ap)).toBe(before - 1 + 2);
    expect(s.objects[watcher]!.zone).toBe("battlefield");
    expect(s.players[opp]!.life).toBe(life);
  });

  it("not a reflexive trigger (CR 603.2d): Sparktongue Dragon's enters trigger twice, each payment once", () => {
    const { s: s0, ap, ids } = setup([sparktongue]);
    putOnBattlefield(s0, ap, panharmonicon);
    let s = castIt(s0, ap, ids[0]!);
    expect(s.triggerQueue.length + s.stack.length + (s.pending ? 1 : 0)).toBeGreaterThan(0);
    let asked = 0;
    for (let i = 0; i < 10 && s.pending?.kind === "chooseMay"; i++) {
      asked++;
      s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    }
    expect(asked).toBe(2);
    expect(s.stack).toHaveLength(0);
  });
});

describe('"If a creature dying causes ..."', () => {
  it("Teysa Karlov: dies triggers twice, a sacrifice trigger once", () => {
    const { s: s0, ap, ids } = setup([villageRites]);
    putOnBattlefield(s0, ap, teysa);
    const t = putOnBattlefield(s0, ap, traveler);
    const j = putOnBattlefield(s0, ap, juri);
    let s = run(s0, planCast(s0, ap, ids[0]!, [], undefined, undefined, undefined, { sacrifice: [t] }));
    s = settle(s);
    expect(s.objects[t]!.zone).toBe("graveyard");
    expect(named(s, /Spirit/)).toHaveLength(2);
    expect(s.objects[j]!.counters["+1/+1"] ?? 0).toBe(1);
  });

  it("Teysa Karlov: dying at the same time as another creature still doubles its triggers", () => {
    const { s: s0, ap, ids, opp } = setup([wrath]);
    putOnBattlefield(s0, ap, teysa);
    putOnBattlefield(s0, ap, zulaport);
    putOnBattlefield(s0, ap, traveler);
    const life = s0.players[opp]!.life;
    const s = castIt(s0, ap, ids[0]!);
    // Zulaport sees three creatures of yours die (itself included), each twice.
    expect(s.players[opp]!.life).toBe(life - 6);
    // The Spirit tokens: Doomed Traveler's trigger, twice.
    expect(named(s, /Spirit/)).toHaveLength(2);
  });
});

describe('"If a creature attacking causes ..." and "a triggered ability of a ... you control"', () => {
  const attack = (s: GameState, ap: PlayerId, opp: PlayerId, ...ids: string[]) => {
    s = passUntil(s, "declareAttackers", ap);
    return settle(act(s, { type: "declareAttackers", player: ap, attacks: ids.map((attacker) => ({ attacker, defender: opp })) }));
  };

  it("Isshin: an attack trigger twice, a becomes-tapped trigger once", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, isshin);
    const h = putOnBattlefield(s0, ap, herald);
    const g = putOnBattlefield(s0, ap, sunscribe);
    const life = s0.players[ap]!.life;
    let s = attack(s0, ap, opp, h, g);
    let scries = 0;
    for (let i = 0; i < 10 && s.pending?.kind === "arrangeTop"; i++) {
      scries++;
      s = settle(act(s, { type: "arrangeTop", player: ap, top: s.pending.cards, away: [] }));
    }
    expect(s.players[ap]!.life).toBe(life + 4);
    expect(scries).toBe(1);
  });

  it("Annie Joins Up: a legendary creature's trigger twice, a nonlegendary one's once", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, annie);
    const a = putOnBattlefield(s0, ap, legendaryHerald);
    const h = putOnBattlefield(s0, ap, herald);
    const life = s0.players[ap]!.life;
    const s = attack(s0, ap, opp, a, h);
    expect(s.players[ap]!.life).toBe(life + 4 + 2);
  });

  it("Delney: only creatures with power 2 or less; Harmonic Prodigy: not its own prowess", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, delney);
    const small = putOnBattlefield(s0, ap, card("Moonrise Cleric", "Creature — Bat Cleric", "{1}{W/B}{W/B}", { power: "2", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nWhenever this creature attacks, you gain 1 life." }));
    const h = putOnBattlefield(s0, ap, herald);
    const life = s0.players[ap]!.life;
    const s = attack(s0, ap, opp, small, h);
    expect(s.players[ap]!.life).toBe(life + 2 + 2);
  });

  it("Harmonic Prodigy: its own prowess triggers once (it's not another Wizard)", () => {
    const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
    const { s: s0, ap, ids, opp } = setup([shock]);
    const p = putOnBattlefield(s0, ap, harmonic);
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    s = settle(s);
    expect(defOf(s, s.objects[p]!).name).toBe("Harmonic Prodigy");
    expect(s.log.filter((l) => /Harmonic Prodigy's ability triggers/.test(l.text))).toHaveLength(1);
  });
});
