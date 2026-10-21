// Round 104, more popular cards: Desynchronization ("that's not historic"), The Gaffer and Resplendent Angel ("if you
// gained N or more life this turn"), Runaway Steam-Kin ("fewer than three +1/+1 counters"), Oversold Cemetery ("four or
// more creature cards in your graveyard"), Gift of the Viper (a list of counters), Fathom Mage (once per counter put),
// Gwenna (counter and untap), Twenty-Toed Toad (counters of any kind or cards in hand).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, planCast, waitingOn, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const desync = card("Desynchronization", "Instant", "{2}{U}{U}", { oracleText: "Return each nonland permanent that's not historic to its owner's hand. (Artifacts, legendaries, and Sagas are historic.)" });
const gaffer = card("The Gaffer", "Legendary Creature — Halfling Peasant", "{2}{W}", { power: "2", toughness: "3", oracleText: "At the beginning of each end step, if you gained 3 or more life this turn, draw a card." });
const kin = card("Runaway Steam-Kin", "Creature — Elemental", "{1}{R}", { power: "1", toughness: "1", oracleText: "Whenever you cast a red spell, if this creature has fewer than three +1/+1 counters on it, put a +1/+1 counter on this creature.\nRemove three +1/+1 counters from this creature: Add {R}{R}{R}." });
const cem = card("Oversold Cemetery", "Enchantment", "{1}{B}", { oracleText: "At the beginning of your upkeep, if you have four or more creature cards in your graveyard, you may return target creature card from your graveyard to your hand." });
const viper = card("Gift of the Viper", "Instant", "{G}", { oracleText: "Put a +1/+1 counter, a reach counter, and a deathtouch counter on target creature. Untap it." });
const mage = card("Fathom Mage", "Creature — Human Wizard", "{2}{G}{U}", { power: "1", toughness: "1", keywords: ["Evolve"], oracleText: "Evolve (Whenever a creature you control enters, if that creature has greater power or toughness than this creature, put a +1/+1 counter on this creature.)\nWhenever a +1/+1 counter is put on this creature, you may draw a card." });
const gwenna = card("Gwenna, Eyes of Gaea", "Legendary Creature — Elf Druid Scout", "{2}{G}", { power: "2", toughness: "3", oracleText: "{T}: Add two mana in any combination of colors. Spend this mana only to cast creature spells or activate abilities of creature sources.\nWhenever you cast a creature spell with power 5 or greater, put a +1/+1 counter on Gwenna and untap it." });
const toad = card("Twenty-Toed Toad", "Creature — Frog Wizard", "{3}{U}", { power: "3", toughness: "3", oracleText: "Your maximum hand size is twenty.\nWhenever you attack with two or more creatures, put a +1/+1 counter on this creature and draw a card.\nWhenever this creature attacks, you win the game if there are twenty or more counters on it or you have twenty or more cards in hand." });
const angel = card("Resplendent Angel", "Creature — Angel", "{1}{W}{W}", { power: "3", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nAt the beginning of each end step, if you gained 5 or more life this turn, create a 4/4 white Angel creature token with flying and vigilance.\n{3}{W}{W}{W}: Until end of turn, this creature gets +2/+2 and gains lifelink." });

// Test cards.
const heal = (n: number) => card(`Heal ${n}`, "Sorcery", "{W}", { oracleText: `You gain ${n} life.` });
const shock = card("Red Ping", "Instant", "{R}", { oracleText: "Red Ping deals 1 damage to any target." });
const giant = card("Big Giant", "Creature — Giant", "{4}{G}", { power: "5", toughness: "5" });
const relic = card("Old Relic", "Artifact", "{1}");
const hero = card("Old Hero", "Legendary Creature — Human", "{1}{W}", { power: "1", toughness: "1" });
const aura = card("Plain Charm", "Enchantment", "{1}{W}");
const grunt = (n = "Grunt") => card(n, "Creature — Human", "{1}{W}", { power: "1", toughness: "1" });

const run = (s: GameState, plan: ReturnType<typeof planCast>) => plan!.reduce((x, a) => act(x, a), s);
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const answerMay = (s: GameState, yes: boolean) => {
  for (let i = 0; i < 10 && s.pending?.kind === "chooseMay"; i++) s = settle(act(s, { type: "chooseMay", player: s.pending.player, yes }));
  return s;
};
const toYard = (s: GameState, pid: PlayerId, def: Parameters<typeof putOnBattlefield>[2]) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
};

describe("round 104: more popular cards", () => {
  it("parse", () => [desync, gaffer, kin, cem, viper, mage, gwenna, toad, angel].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Desynchronization returns nonland permanents that aren't artifacts, legendary or Sagas", () => {
    const { s: s0, ap, opp, ids } = setup([desync]);
    const r = putOnBattlefield(s0, opp, relic);
    const h = putOnBattlefield(s0, opp, hero);
    const a = putOnBattlefield(s0, opp, aura);
    const g = putOnBattlefield(s0, ap, grunt());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[r]!.zone).toBe("battlefield");
    expect(s.objects[h]!.zone).toBe("battlefield");
    expect(s.objects[a]!.zone).toBe("hand");
    expect(s.objects[g]!.zone).toBe("hand");
  });

  it("The Gaffer draws at the end step after 3 life gained; Resplendent Angel needs 5", () => {
    for (const [n, draws, angels] of [[3, 1, 0], [5, 1, 1], [2, 0, 0]] as const) {
      const { s: s0, ap, ids } = setup([heal(n)]);
      putOnBattlefield(s0, ap, gaffer);
      putOnBattlefield(s0, ap, angel);
      let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
      const hand = s.players[ap]!.hand.length;
      const bf = s.battlefield.length;
      s = passUntil(s, "end");
      s = settle(s);
      expect(s.players[ap]!.hand.length - hand, `gain ${n}`).toBe(draws);
      expect(s.battlefield.length - bf, `gain ${n}`).toBe(angels);
    }
  });

  it("Runaway Steam-Kin stops at three counters, and removing them adds RRR", () => {
    const { s: s0, ap, opp, ids } = setup([shock, shock, shock, shock]);
    const k = putOnBattlefield(s0, ap, kin);
    let s = s0;
    for (const id of ids.slice(0, 3)) s = settle(run(s, planCast(s, ap, id, [{ kind: "player", id: opp }])));
    expect(s.objects[k]!.counters["+1/+1"]).toBe(3);
    // The three Mountains are spent: the fourth is paid by removing the three counters, then the trigger adds one.
    s = settle(run(s, planCast(s, ap, ids[3]!, [{ kind: "player", id: opp }])));
    expect(s.objects[k]!.counters["+1/+1"]).toBe(1);
  });

  it("Oversold Cemetery returns a creature card only with four creature cards in the graveyard", () => {
    for (const [n, returns] of [[4, true], [3, false]] as const) {
      const { s: s0, ap } = setup([]);
      // Go round to the last player's end step (your cleanup discards went to your graveyard), then start clean.
      let s = passUntil(s0, "end", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 3) % 4]);
      for (const id of s.players[ap]!.graveyard) s.objects[id]!.zone = "exile";
      s.players[ap]!.graveyard = [];
      putOnBattlefield(s, ap, cem);
      const dead = Array.from({ length: n }, (_, i) => toYard(s, ap, grunt(`Dead ${i}`)));
      s = passUntil(s, "upkeep", ap);
      if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: dead[0]! }] });
      s = settle(s);
      s = answerMay(s, true);
      expect(dead.some((id) => s.objects[id]!.zone === "hand"), `${n} creature cards`).toBe(returns);
    }
  });

  it("Gift of the Viper puts three kinds of counters on the creature and untaps it", () => {
    const { s: s0, ap, ids } = setup([viper]);
    const g = putOnBattlefield(s0, ap, grunt());
    s0.objects[g]!.tapped = true;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: g }])));
    expect(s.objects[g]!.counters).toMatchObject({ "+1/+1": 1, reach: 1, deathtouch: 1 });
    expect(s.objects[g]!.tapped).toBe(false);
  });

  it("Fathom Mage draws once for each +1/+1 counter put on it", () => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, mage);
    const twice = card("Double Feed", "Sorcery", "{G}", { oracleText: "Put two +1/+1 counters on target creature." });
    const id = putOnBattlefield(s0, ap, twice);
    s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
    s0.objects[id]!.zone = "hand";
    s0.players[ap]!.hand.push(id);
    const hand = s0.players[ap]!.hand.length - 1;
    let s = settle(run(s0, planCast(s0, ap, id, [{ kind: "object", id: m }])));
    s = answerMay(s, true);
    expect(s.objects[m]!.counters["+1/+1"]).toBe(2);
    expect(s.players[ap]!.hand.length - hand).toBe(2);
  });

  it("Gwenna gets a counter and untaps when you cast a creature spell with power 5 or greater", () => {
    const { s: s0, ap, ids } = setup([giant, grunt()]);
    const g = putOnBattlefield(s0, ap, gwenna);
    s0.objects[g]!.tapped = true;
    let s = settle(run(s0, planCast(s0, ap, ids[1]!)));
    expect(s.objects[g]!.tapped).toBe(true);
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(s.objects[g]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[g]!.tapped).toBe(false);
  });

  it("Twenty-Toed Toad wins when it attacks with twenty counters of any kinds", () => {
    for (const [counters, wins] of [[{ "+1/+1": 15, oil: 5 }, true], [{ "+1/+1": 19 }, false]] as const) {
      const { s: s0, ap, opp } = setup([]);
      const t = putOnBattlefield(s0, ap, toad);
      s0.objects[t]!.counters = { ...counters };
      let s = s0;
      while (s.pending?.kind !== "declareAttackers") s = act(s, { type: "passPriority", player: waitingOn(s)! });
      s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: t, defender: opp }] }));
      expect(s.winner === ap, JSON.stringify(counters)).toBe(wins);
    }
  });
});
