// Round 104, the starting cards: Echoes of Eternity (a colorless spell's own triggered abilities trigger again, CR
// 603.2d), The Water Crystal and Bruvac (replacing a mill, CR 614.1a, 701.17), Patriarch's Bidding and Harsh Mercy
// ("each player chooses a creature type", then "a type chosen this way"), Twilight's Call.

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, planCast, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const echoes = card("Echoes of Eternity", "Kindred Enchantment — Eldrazi", "{3}{C}{C}{C}", { oracleText: "If a triggered ability of a colorless spell you control or another colorless permanent you control triggers, that ability triggers an additional time.\nWhenever you cast a colorless spell, copy it. You may choose new targets for the copy. (A copy of a permanent spell becomes a token.)" });
const crystal = card("The Water Crystal", "Legendary Artifact", "{2}{U}{U}", { keywords: ["Mill"], oracleText: "Blue spells you cast cost {1} less to cast.\nIf an opponent would mill one or more cards, they mill that many cards plus four instead.\n{4}{U}{U}, {T}: Each opponent mills cards equal to the number of cards in your hand." });
const bruvac = card("Bruvac the Grandiloquent", "Legendary Creature — Human Advisor", "{2}{U}", { power: "1", toughness: "4", keywords: ["Mill"], oracleText: "If an opponent would mill one or more cards, they mill twice that many cards instead. (To mill a card, a player puts the top card of their library into their graveyard.)" });
const bidding = card("Patriarch's Bidding", "Sorcery", "{3}{B}{B}", { oracleText: "Each player chooses a creature type. Each player returns all creature cards of a type chosen this way from their graveyard to the battlefield." });
const twilight = card("Twilight's Call", "Sorcery", "{4}{B}{B}", { oracleText: "You may cast this spell as though it had flash if you pay {2} more to cast it. (You may cast it any time you could cast an instant.)\nEach player returns all creature cards from their graveyard to the battlefield." });
const mercy = card("Harsh Mercy", "Sorcery", "{2}{W}", { oracleText: "Each player chooses a creature type. Destroy all creatures that aren't of a type chosen this way. They can't be regenerated." });

// Test cards.
const watcher = (colorless: boolean) => card(colorless ? "Gray Watcher" : "Blue Watcher", "Artifact", colorless ? "{2}" : "{1}{U}", { oracleText: "Whenever you cast a spell, you gain 1 life." });
const castLife = card("Life Spawn", "Creature — Eldrazi", "{2}", { power: "1", toughness: "1", oracleText: "When you cast this spell, you gain 1 life." });
const shock = card("Red Thing", "Sorcery", "{R}", { oracleText: "You gain 1 life." });
const millTwo = card("Mill Two", "Sorcery", "{U}", { oracleText: "Target player mills two cards." });
const elf = (n: string) => card(n, "Creature — Elf", "{1}", { power: "1", toughness: "1" });
const goblin = (n: string) => card(n, "Creature — Goblin", "{1}", { power: "1", toughness: "1" });

const run = (s: GameState, plan: ReturnType<typeof planCast>) => plan!.reduce((x, a) => act(x, a), s);
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const toYard = (s: GameState, pid: number, def: ReturnType<typeof card>) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
};

describe("round 104: the starting cards", () => {
  it("parse", () => [echoes, crystal, bruvac, bidding, twilight, mercy].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Echoes of Eternity: another colorless permanent's triggered ability triggers twice, a colored one's once", () => {
    const { s: s0, ap, ids } = setup([shock]);
    putOnBattlefield(s0, ap, echoes);
    putOnBattlefield(s0, ap, watcher(true));
    putOnBattlefield(s0, ap, watcher(false));
    const life = s0.players[ap]!.life;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    // 2 from the colorless watcher, 1 from the blue one, 1 from the spell.
    expect(s.players[ap]!.life - life).toBe(4);
  });

  it("Echoes of Eternity: a colorless spell's cast trigger triggers twice, and the spell is copied", () => {
    const { s: s0, ap, ids } = setup([castLife]);
    putOnBattlefield(s0, ap, echoes);
    const life = s0.players[ap]!.life;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.life - life).toBe(2);
    expect(s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]?.name === "Life Spawn").length).toBe(2);
  });

  it("Echoes of Eternity: two of them copy a colorless spell four times (rulings)", () => {
    const { s: s0, ap, ids } = setup([castLife]);
    putOnBattlefield(s0, ap, echoes);
    putOnBattlefield(s0, ap, echoes);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]?.name === "Life Spawn").length).toBe(5);
  });

  it("The Water Crystal: an opponent mills four more; you don't", () => {
    const { s: s0, ap, opp, ids } = setup([millTwo, millTwo]);
    putOnBattlefield(s0, ap, crystal);
    const [yard, mine] = [s0.players[opp]!.graveyard.length, s0.players[ap]!.graveyard.length];
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.graveyard.length - yard).toBe(6);
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: ap }])));
    // The spells went to the graveyard too.
    expect(s.players[ap]!.graveyard.length - mine).toBe(2 + 2);
  });

  it("The Water Crystal with Bruvac: twice that many, then four more", () => {
    const { s: s0, ap, opp, ids } = setup([millTwo]);
    putOnBattlefield(s0, ap, crystal);
    putOnBattlefield(s0, ap, bruvac);
    const yard = s0.players[opp]!.graveyard.length;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.graveyard.length - yard).toBe(8);
  });

  it("Patriarch's Bidding: each player chooses a type, starting with the active player; all of those types return", () => {
    const { s: s0, ap, opp, ids } = setup([bidding]);
    const myElf = toYard(s0, ap, elf("My Elf"));
    const myGoblin = toYard(s0, ap, goblin("My Goblin"));
    const theirElf = toYard(s0, opp, elf("Their Elf"));
    const theirGoblin = toYard(s0, opp, goblin("Their Goblin"));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const order = [];
    for (let i = 0; i < 4; i++) {
      expect(s.pending).toMatchObject({ kind: "chooseOption", what: "creatureType" });
      const p = (s.pending as { player: number }).player;
      order.push(p);
      s = settle(act(s, { type: "chooseOption", player: p, choice: p === opp ? "Goblin" : "Wizard" }));
    }
    expect(order).toEqual([0, 1, 2, 3].map((i) => s.turnOrder[(s.turnOrder.indexOf(ap) + i) % 4]));
    expect(s.objects[myGoblin]!.zone).toBe("battlefield");
    expect(s.objects[theirGoblin]!.zone).toBe("battlefield");
    expect(s.objects[theirGoblin]!.controller).toBe(opp);
    expect(s.objects[myElf]!.zone).toBe("graveyard");
    expect(s.objects[theirElf]!.zone).toBe("graveyard");
  });

  it("Harsh Mercy: creatures not of a chosen type are destroyed", () => {
    const { s: s0, ap, opp, ids } = setup([mercy]);
    const e = putOnBattlefield(s0, ap, elf("Elf"));
    const g = putOnBattlefield(s0, opp, goblin("Goblin"));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    for (let i = 0; i < 4; i++) {
      const p = (s.pending as { player: number }).player;
      s = settle(act(s, { type: "chooseOption", player: p, choice: p === ap ? "Elf" : "Wizard" }));
    }
    expect(s.objects[e]!.zone).toBe("battlefield");
    expect(s.objects[g]!.zone).toBe("graveyard");
  });

  it("Twilight's Call returns every creature card from every graveyard", () => {
    const { s: s0, ap, opp, ids } = setup([twilight]);
    const a = toYard(s0, ap, elf("Elf"));
    const b = toYard(s0, opp, goblin("Goblin"));
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[a]!.zone).toBe("battlefield");
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[b]!.controller).toBe(opp);
  });
});
