// Round 125: round 124's gaps (Library of Leng, Rottenmouth Viper, ...), then the most played cards.

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { activationCost, abilitiesOf, botActions, castProblem, loseLife, power, characteristics, invalidateCharacteristics, compileCard, isFullySupported, manaValue, planActivate, planCast, spellCost, waitingOn, type Action, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Pass priority until something waits on a choice or the stack is empty. */
const untilChoice = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Bots answer every choice and everyone passes until the stack and trigger queue are empty. */
const settleBots = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const who = s.pending ? s.pending.player : waitingOn(s)!;
    const acts = s.pending ? botActions(s, who) : [];
    s = acts.length ? acts.reduce((x, a) => act(x, a), s) : act(s, { type: "passPriority", player: who });
  }
  return s;
};
const logText = (s: GameState) => s.log.map((l) => (typeof l === "string" ? l : JSON.stringify(l))).join("\n");
/** Put cards named `names` into `pid`'s hand. */
const toHand = (s: GameState, pid: number, ...defs: CardDef[]) =>
  defs.map((d) => {
    const id = putOnBattlefield(s, pid, d);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "hand";
    s.players[pid]!.hand.push(id);
    return id;
  });

// Real oracle text (Scryfall).
const leng = card("Library of Leng", "Artifact", "{1}", {
  oracleText: "You have no maximum hand size.\nIf an effect causes you to discard a card, discard it, but you may put it on top of your library instead of into your graveyard.",
});
const looting = card("Faithless Looting", "Sorcery", "{R}", { keywords: ["Flashback"], oracleText: "Draw two cards, then discard two cards.\nFlashback {2}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.)" });
const hymn = card("Hymn to Tourach", "Sorcery", "{B}{B}", { oracleText: "Target player discards two cards at random." });
const rummage = card("Rummaging Test", "Sorcery", "{R}", { oracleText: "You may discard a card. If you do, draw a card." });
const thrill = card("Thrill of Possibility", "Instant", "{1}{R}", { oracleText: "As an additional cost to cast this spell, discard a card.\nDraw two cards." });
const blank = (name: string) => card(name, "Sorcery", "{5}", { oracleText: "Draw a card." });

describe("Library of Leng (CR 614.1a)", () => {
  it("Faithless Looting: the two discarded cards are offered; the one picked goes on top, the other to the graveyard", () => {
    supported(leng, looting, hymn);
    const { s: s0, ap, ids } = setup([looting]);
    putOnBattlefield(s0, ap, leng);
    const [a, b] = toHand(s0, ap, blank("Card A"), blank("Card B"));
    let s = untilChoice(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, count: 2 });
    s = act(s, { type: "discard", player: ap, objectIds: [a!, b!] });
    expect(s.pending).toMatchObject({ kind: "handToTop", player: ap, upTo: true, discarding: [a, b] });
    s = act(s, { type: "handToTop", player: ap, objectIds: [b!] });
    expect(s.players[ap]!.library[0]).toBe(b);
    expect(s.objects[a!]!.zone).toBe("graveyard");
    expect(logText(s)).toMatch(/puts Card B on top of their library instead \(Library of Leng\)/);
  });

  it("both on top, the first pick ending on top (rulings: the order is the player's)", () => {
    const { s: s0, ap, ids } = setup([looting]);
    putOnBattlefield(s0, ap, leng);
    const [a, b] = toHand(s0, ap, blank("Card A"), blank("Card B"));
    let s = untilChoice(run(s0, planCast(s0, ap, ids[0]!)));
    s = act(s, { type: "discard", player: ap, objectIds: [a!, b!] });
    s = act(s, { type: "handToTop", player: ap, objectIds: [a!, b!] });
    expect(s.players[ap]!.library.slice(0, 2)).toEqual([a, b]);
  });

  it("a card not being discarded can't be picked", () => {
    const { s: s0, ap, ids } = setup([looting]);
    putOnBattlefield(s0, ap, leng);
    const [a, b, c] = toHand(s0, ap, blank("Card A"), blank("Card B"), blank("Card C"));
    let s = untilChoice(run(s0, planCast(s0, ap, ids[0]!)));
    s = act(s, { type: "discard", player: ap, objectIds: [a!, b!] });
    expect(() => act(s, { type: "handToTop", player: ap, objectIds: [c!] })).toThrow(/being discarded/);
  });

  it("Hymn to Tourach on the Library's controller: the random cards are picked first, then offered", () => {
    const { s: s0, ap, ids, opp } = setup([hymn]);
    putOnBattlefield(s0, opp, leng);
    s0.players[opp]!.hand = [];
    const hand = toHand(s0, opp, blank("Card A"), blank("Card B"), blank("Card C"));
    let s = untilChoice(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.pending).toMatchObject({ kind: "handToTop", player: opp });
    const offered = s.pending!.kind === "handToTop" ? s.pending.discarding! : [];
    expect(offered).toHaveLength(2);
    expect(offered.every((id) => s.players[opp]!.hand.includes(id))).toBe(true);
    s = act(s, { type: "handToTop", player: opp, objectIds: [] });
    expect(offered.every((id) => s.objects[id]!.zone === "graveyard")).toBe(true);
    expect(hand.filter((id) => s.objects[id]!.zone === "hand")).toHaveLength(1);
  });

  it("a bot puts the discarded spells back on top", () => {
    const { s: s0, ap, ids, opp } = setup([hymn]);
    putOnBattlefield(s0, opp, leng);
    s0.players[opp]!.hand = [];
    toHand(s0, opp, blank("Card A"), blank("Card B"));
    let s = untilChoice(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    for (const a of botActions(s, opp)) s = act(s, a);
    expect(s.players[opp]!.hand).toHaveLength(0);
    expect(s.players[opp]!.graveyard).toHaveLength(0);
    expect(s.players[opp]!.library.slice(0, 2).map((id) => s.cards[s.objects[id]!.cardId]!.name).sort()).toEqual(["Card A", "Card B"]);
  });

  it("not for a discard that's a cost: \"you may discard a card. If you do, ...\" (CR 118.12)", () => {
    supported(rummage, thrill);
    const { s: s0, ap, ids } = setup([rummage]);
    putOnBattlefield(s0, ap, leng);
    const [a] = toHand(s0, ap, blank("Card A"));
    let s = untilChoice(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseMay" });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    if (s.pending?.kind === "discard") s = act(s, { type: "discard", player: ap, objectIds: [a!] });
    expect(s.pending?.kind).not.toBe("handToTop");
    expect(s.objects[a!]!.zone).toBe("graveyard");
  });
});

const viper = card("Rottenmouth Viper", "Creature — Elemental Snake", "{5}{B}", {
  power: "6",
  toughness: "6",
  oracleText: "As an additional cost to cast this spell, you may sacrifice any number of nonland permanents. This spell costs {1} less to cast for each permanent sacrificed this way.\nWhenever this creature enters or attacks, put a blight counter on it. Then for each blight counter on it, each opponent loses 4 life unless that player sacrifices a nonland permanent of their choice or discards a card.",
});
const torgaar = card("Torgaar, Famine Incarnate", "Legendary Creature — Avatar", "{6}{B}{B}", {
  power: "7",
  toughness: "6",
  oracleText: "As an additional cost to cast this spell, you may sacrifice any number of creatures. This spell costs {2} less to cast for each creature sacrificed this way.\nWhen Torgaar enters, up to one target player's life total becomes half their starting life total, rounded down.",
});
const token = (name: string) => card(name, "Artifact — Clue", "", { oracleText: "{2}, Sacrifice this artifact: Draw a card." });

describe("Rottenmouth Viper: sacrifice any number of nonland permanents, {1} less for each (CR 601.2b, 601.2f)", () => {
  /** Only `lands` lands untapped (a Swamp among them), and `n` Clues. */
  const scene = (lands: number, n: number) => {
    const { s, ap, ids } = setup([viper]);
    // A Swamp first, then other lands.
    const mine = s.battlefield.filter((id) => s.objects[id]!.controller === ap).sort((a, b) => Number(s.cards[s.objects[b]!.cardId]!.name === "Swamp") - Number(s.cards[s.objects[a]!.cardId]!.name === "Swamp"));
    mine.forEach((id, i) => (s.objects[id]!.tapped = i >= lands));
    const clues = Array.from({ length: n }, (_, i) => putOnBattlefield(s, ap, token(`Clue ${i}`)));
    for (const c of clues) s.objects[c]!.isToken = true;
    return { s, ap, id: ids[0]!, clues };
  };

  it("with three lands: three sacrificed make it {2}{B}", () => {
    supported(viper);
    const { s: s0, ap, id, clues } = scene(3, 4);
    expect(spellCost(s0, ap, s0.objects[id]!, 3).extra + manaValue(spellCost(s0, ap, s0.objects[id]!, 3).cost)).toBe(3);
    expect(planCast(s0, ap, id, undefined, undefined, "auto", 2, { sacrifice: clues.slice(0, 2) })).toBeNull();
    const s = run(s0, planCast(s0, ap, id, undefined, undefined, "auto", 3, { sacrifice: clues.slice(0, 3) }));
    expect(clues.filter((c) => s.objects[c]?.zone !== "battlefield")).toHaveLength(3);
    expect(s.stack).toHaveLength(1);
  });

  it("the reduction only takes generic mana: six sacrificed still cost {B}", () => {
    const { s: s0, ap, id, clues } = scene(1, 6);
    const { cost, extra } = spellCost(s0, ap, s0.objects[id]!, 6);
    expect(manaValue(cost) + extra).toBe(1);
    expect(planCast(s0, ap, id, undefined, undefined, "auto", 6, { sacrifice: clues })).not.toBeNull();
  });

  it("none sacrificed: the full {5}{B}", () => {
    const { s: s0, ap, id } = scene(14, 2);
    const s = run(s0, planCast(s0, ap, id, undefined, undefined, "auto", 0));
    expect(s.battlefield.filter((x) => s.objects[x]!.controller === ap && s.cards[s.objects[x]!.cardId]!.name.startsWith("Clue"))).toHaveLength(2);
  });

  it("a bot sacrifices no more tokens than it needs to cast it", () => {
    const { s: s0, ap, id, clues } = scene(4, 4);
    s0.players[ap]!.hand = [id];
    const acts = botActions(s0, ap);
    const cast = acts.find((a) => a.type === "castSpell" && a.objectId === id);
    expect(cast).toBeTruthy();
    const s = acts.reduce((x, a) => act(x, a), s0);
    expect(clues.filter((c) => s.objects[c]?.zone !== "battlefield")).toHaveLength(2);
  });

  it("Torgaar's sacrifice is creatures, {2} each", () => {
    const { s, ap } = setup([torgaar]);
    const id = s.players[ap]!.hand.at(-1)!;
    expect(manaValue(spellCost(s, ap, s.objects[id]!, 2).cost) + spellCost(s, ap, s.objects[id]!, 2).extra).toBe(4);
  });
});

describe("Torgaar and The Endstone: a life total becomes half the starting life total (CR 119.5, 903.7)", () => {
  it("Torgaar's enters trigger: a bot sets the opponent with the most life to 20", () => {
    supported(torgaar);
    const { s: s0, ap, opp } = setup([]);
    s0.players[opp]!.life = 55;
    const t = putOnBattlefield(s0, ap, torgaar);
    let s = s0;
    s.triggerQueue.push({ sourceId: t, sourceCardId: s.objects[t]!.cardId, controller: ap, index: 0, body: compileCard(torgaar).triggers[0]!.body });
    for (let i = 0; i < 30 && (s.triggerQueue.length || s.stack.length || s.pending); i++) {
      const who = s.pending ? s.pending.player : waitingOn(s)!;
      const acts = botActions(s, who);
      s = acts.length ? acts.reduce((x, a) => act(x, a), s) : act(s, { type: "passPriority", player: who });
    }
    expect(s.players[opp]!.life).toBe(20);
  });

  it("The Endstone at your end step: 20", () => {
    const endstone = card("The Endstone", "Legendary Artifact", "{7}", { oracleText: "Whenever you play a land or cast a spell, draw a card.\nAt the beginning of your end step, your life total becomes half your starting life total, rounded up." });
    supported(endstone);
    expect(compileCard(endstone).triggers[1]!.body.effects).toEqual([{ type: "setLife", who: { ref: "you" }, n: 20 }]);
  });
});

const gluntch = card("Gluntch, the Bestower", "Legendary Creature — Jellyfish", "{1}{G}{W}", {
  power: "0",
  toughness: "5",
  keywords: ["Flying"],
  oracleText: "Flying\nAt the beginning of your end step, choose a player. They put two +1/+1 counters on a creature they control. Choose a second player to draw a card. Then choose a third player to create two Treasure tokens.",
});

describe("Gluntch, the Bestower: three different players, chosen in turn (rulings)", () => {
  const atEnd = () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, gluntch);
    let s = passUntil(s0, "end", ap);
    s = untilChoice(s);
    return { s, ap, opp, g };
  };

  it("you choose yourself for the counters (put on Gluntch), an opponent draws, a third player gets the Treasures", () => {
    supported(gluntch);
    const { s: s0, ap, opp, g } = atEnd();
    expect(s0.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "nthPlayer", prompt: "to put two +1/+1 counters on a creature they control" });
    expect((s0.pending as { options: string[] }).options).toHaveLength(4);
    let s = act(s0, { type: "chooseOption", player: ap, choice: String(ap) });
    // Gluntch is our only creature: no choice of which.
    if (s.pending?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: ap, ids: [g] });
    expect(s.objects[g]!.counters["+1/+1"]).toBe(2);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "nthPlayer", prompt: "to draw a card" });
    expect((s.pending as { options: string[] }).options).not.toContain(String(ap));
    const hand = s.players[opp]!.hand.length;
    s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
    expect(s.players[opp]!.hand).toHaveLength(hand + 1);
    expect((s.pending as { options: string[] }).options).toHaveLength(2);
    expect(() => act(s, { type: "chooseOption", player: ap, choice: String(opp) })).toThrow(/isn.t an option/);
    const third = Number((s.pending as { options: string[] }).options[0]);
    s = act(s, { type: "chooseOption", player: ap, choice: String(third) });
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === third && s.cards[s.objects[id]!.cardId]!.name === "Treasure Token")).toHaveLength(2);
  });

  it("with only two players left, there's no third player, and no Treasures (rulings)", () => {
    const { s: s0, ap, opp } = atEnd();
    for (const p of s0.players) if (p.id !== ap && p.id !== opp) p.lost = true;
    let s = act(s0, { type: "chooseOption", player: ap, choice: String(opp) });
    s = settleBots(s);
    expect(s.battlefield.some((id) => s.cards[s.objects[id]!.cardId]!.name === "Treasure Token")).toBe(false);
  });

  it("a bot takes the counters itself, and gives the rest to the opponents with the least power", () => {
    const { s: s0, ap, g } = atEnd();
    const s = settleBots(s0);
    expect(s.objects[g]!.counters["+1/+1"]).toBe(2);
    expect(s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Treasure Token" && s.objects[id]!.controller !== ap)).toHaveLength(2);
    expect(logText(s)).toMatch(/[ACD] creates 2 Treasure tokens \(Gluntch, the Bestower\)\./);
  });
});

const crawling = card("Crawling Sensation", "Enchantment", "{2}{G}", {
  keywords: ["Mill"],
  oracleText: "At the beginning of your upkeep, you may mill two cards. (You may put the top two cards of your library into your graveyard.)\nWhenever one or more land cards are put into your graveyard from anywhere for the first time each turn, create a 1/1 green Insect creature token.",
});
const millSpell = (name: string) => card(name, "Sorcery", "{U}", { oracleText: "Mill four cards." });

describe("Crawling Sensation: \"for the first time each turn\" on a batch of land cards put into your graveyard", () => {
  const insects = (s: GameState, pid: number) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name.startsWith("Insect")).length;
  /** The top four cards of `pid`'s library made Forests. */
  const landsOnTop = (s: GameState, pid: number) => {
    const forest = s.players[pid]!.library.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest")!;
    const forests = s.players[pid]!.library.filter((id) => s.objects[id]!.cardId === s.objects[forest]!.cardId).slice(0, 8);
    s.players[pid]!.library = [...forests, ...s.players[pid]!.library.filter((id) => !forests.includes(id))];
  };

  it("milling four lands makes one Insect; milling more lands that turn makes none", () => {
    supported(crawling);
    const { s: s0, ap, ids } = setup([millSpell("Mill A"), millSpell("Mill B")]);
    putOnBattlefield(s0, ap, crawling);
    landsOnTop(s0, ap);
    let s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    expect(insects(s, ap)).toBe(1);
    s = settleBots(run(s, planCast(s, ap, ids[1]!)));
    expect(insects(s, ap)).toBe(1);
  });

  it("a land put into your graveyard earlier this turn, before it was there, counts as the first time", () => {
    const { s: s0, ap, ids } = setup([millSpell("Mill A"), millSpell("Mill B")]);
    landsOnTop(s0, ap);
    let s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    putOnBattlefield(s, ap, crawling);
    s = settleBots(run(s, planCast(s, ap, ids[1]!)));
    expect(insects(s, ap)).toBe(0);
  });
});

const garna = card("Garna, the Bloodflame", "Legendary Creature — Human Warrior", "{3}{B}{R}", {
  power: "3",
  toughness: "3",
  keywords: ["Flash"],
  oracleText: "Flash\nWhen Garna enters, return to your hand all creature cards in your graveyard that were put there from anywhere this turn.\nOther creatures you control have haste.",
});
const nurse = card("Night Nurse, Healer of Heroes", "Legendary Creature — Human Doctor Hero", "{1}{W}", {
  power: "2",
  toughness: "1",
  keywords: ["Lifelink", "Flash"],
  oracleText: "Flash\nLifelink\nWhen Night Nurse enters, choose target permanent card in your graveyard that was put there from anywhere this turn. Return it to your hand.",
});
const reenact = card("Reenact the Crime", "Instant", "{1}{U}{U}{U}", { oracleText: "Exile target nonland card in a graveyard that was put there from anywhere this turn. Copy it. You may cast the copy without paying its mana cost." });
const myojin = card("Myojin of Grim Betrayal", "Legendary Creature — Spirit", "{5}{B}{B}{B}", {
  power: "5",
  toughness: "2",
  oracleText: "Myojin of Grim Betrayal enters with an indestructible counter on it if you cast it from your hand.\nRemove an indestructible counter from Myojin of Grim Betrayal: Put onto the battlefield under your control all creature cards in all graveyards that were put there from anywhere this turn.",
});

describe("\"a card in a graveyard that was put there from anywhere this turn\"", () => {
  /** A card of `pid`'s in their graveyard, put there on turn `turn`. */
  const inYard = (s: GameState, pid: number, def: CardDef, turn: number) => {
    const id = putOnBattlefield(s, pid, def);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "graveyard";
    s.objects[id]!.toGraveyardTurn = turn;
    s.players[pid]!.graveyard.push(id);
    return id;
  };
  const bears = (n: string) => card(n, "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });

  it("Garna returns only the creature cards put into your graveyard this turn", () => {
    supported(garna, nurse, reenact, myojin);
    const { s: s0, ap, ids } = setup([garna]);
    const now = inYard(s0, ap, bears("Fresh Bear"), s0.turn);
    const old = inYard(s0, ap, bears("Old Bear"), s0.turn - 1);
    const s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[now]!.zone).toBe("hand");
    expect(s.objects[old]!.zone).toBe("graveyard");
  });

  it("Night Nurse can only target a card put there this turn", () => {
    const { s: s0, ap, ids } = setup([nurse]);
    const now = inYard(s0, ap, bears("Fresh Bear"), s0.turn);
    const old = inYard(s0, ap, bears("Old Bear"), s0.turn - 1);
    let s = untilChoice(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: old }] })).toThrow();
    s = settleBots(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: now }] }));
    expect(s.objects[now]!.zone).toBe("hand");
  });

  it("Reenact the Crime: an opponent's creature card put there this turn is exiled and its copy cast for free, a token", () => {
    const { s: s0, ap, ids, opp } = setup([reenact]);
    const giant = inYard(s0, opp, card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" }), s0.turn);
    let s = untilChoice(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: giant }])));
    expect(s.objects[giant]!.zone).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong" });
    s = act(s, { type: "chooseOption", player: ap, choice: giant });
    expect(s.pending).toMatchObject({ kind: "castFree" });
    const copy = (s.pending as { objectId: string }).objectId;
    s = run(s, planCast(s, ap, copy));
    s = settleBots(s);
    expect(s.objects[copy]).toMatchObject({ zone: "battlefield", controller: ap, isToken: true });
    expect(logText(s)).toMatch(/exiles Hill Giant \(.+'s\) from a graveyard/);
  });

  it("Myojin of Grim Betrayal puts this turn's creature cards from all graveyards onto the battlefield under your control", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, myojin);
    s0.objects[m]!.counters.indestructible = 1;
    const theirs = inYard(s0, opp, bears("Their Bear"), s0.turn);
    const old = inYard(s0, opp, bears("Old Bear"), s0.turn - 1);
    const s = settleBots(run(s0, planActivate(s0, ap, m, 0)));
    expect(s.objects[theirs]).toMatchObject({ zone: "battlefield", controller: ap });
    expect(s.objects[old]!.zone).toBe("graveyard");
  });
});

const familiar = card("Biomancer's Familiar", "Creature — Mutant", "{G}{U}", {
  power: "2", toughness: "2",
  oracleText: "Activated abilities of creatures you control cost {2} less to activate. This effect can't reduce the mana in that cost to less than one mana.\n{T}: The next time target creature adapts this turn, it adapts as though it had no +1/+1 counters on it.",
});
const adapter = card("Test Adapter", "Creature — Elf", "{1}{G}", { power: "1", toughness: "1", oracleText: "{3}{G}: Adapt 2. (If this creature has no +1/+1 counters on it, put two +1/+1 counters on it.)" });

describe("Biomancer's Familiar: adapting as though it had no +1/+1 counters (CR 701.46a, rulings)", () => {
  it("the next adapt this turn puts the counters on anyway; the one after does nothing again", () => {
    supported(familiar);
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, familiar);
    const a = putOnBattlefield(s0, ap, adapter);
    for (let i = 0; i < 4; i++) putOnBattlefield(s0, ap, card("Forest", "Basic Land — Forest", "", { oracleText: "({T}: Add {G}.)" }));
    s0.objects[a]!.counters["+1/+1"] = 2;
    // {3}{G} costs {1}{G} (two less).
    let s = settleBots(run(s0, planActivate(s0, ap, a, 0)));
    expect(s.objects[a]!.counters["+1/+1"]).toBe(2);
    expect(logText(s)).toMatch(/already has a \+1\/\+1 counter/);
    s = settleBots(run(s, planActivate(s, ap, f, 0, [{ kind: "object", id: a }])));
    s = settleBots(run(s, planActivate(s, ap, a, 0)));
    expect(s.objects[a]!.counters["+1/+1"]).toBe(4);
    expect(s.objects[a]!.adaptFresh).toBeUndefined();
  });

  it("a bot taps it for its own adapter with counters, then adapts again", () => {
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, familiar);
    const a = putOnBattlefield(s0, ap, adapter);
    for (let i = 0; i < 4; i++) putOnBattlefield(s0, ap, card("Forest", "Basic Land — Forest", "", { oracleText: "({T}: Add {G}.)" }));
    s0.objects[a]!.counters["+1/+1"] = 2;
    // Bots use activated abilities in their second main phase.
    let s = passUntil(s0, "main2");
    s.players[ap]!.command = [];
    for (const c of s.players[ap]!.hand) s.objects[c]!.zone = "library";
    s.players[ap]!.library.push(...s.players[ap]!.hand.splice(0));
    for (let i = 0; i < 6 && !(s.objects[a]!.counters["+1/+1"]! > 2); i++) {
      const acts = botActions(s, ap);
      if (!acts.length || acts[0]!.type === "passPriority") break;
      for (const y of acts) if (waitingOn(s) === ap || s.pending?.player === ap) s = act(s, y);
      s = settleBots(s);
    }
    expect(s.objects[f]!.tapped).toBe(true);
    expect(s.objects[a]!.counters["+1/+1"]).toBe(4);
  });
});

const hollowmurk = card("Hollowmurk Siege", "Enchantment", "{B}{G}", {
  oracleText: "As this enchantment enters, choose Sultai or Abzan.\n• Sultai — Whenever a counter is put on a creature you control, draw a card. This ability triggers only once each turn.\n• Abzan — Whenever you attack, put a +1/+1 counter on target attacking creature. It gains menace until end of turn.",
});
const fallout = card("Nuclear Fallout", "Sorcery", "{X}{B}{B}", { oracleText: "Each creature gets twice -X/-X until end of turn. Each player gets X rad counters." });
const monarch = card("Lost Monarch of Ifnir", "Creature — Zombie Noble", "{3}{B}", {
  power: "4", toughness: "4", keywords: ["Afflict", "Mill"],
  oracleText: "Afflict 3 (Whenever this creature becomes blocked, defending player loses 3 life.)\nOther Zombies you control have afflict 3.\nAt the beginning of your second main phase, if a player was dealt combat damage by a Zombie this turn, mill three cards, then you may return a creature card from your graveyard to your hand.",
});
const ceremonies = card("Master of Ceremonies", "Creature — Rhino Druid", "{3}{W}", {
  power: "3", toughness: "4", keywords: ["Treasure"],
  oracleText: "At the beginning of your upkeep, each opponent chooses money, friends, or secrets. For each player who chose money, you and that player each create a Treasure token. For each player who chose friends, you and that player each create a 1/1 green and white Citizen creature token. For each player who chose secrets, you and that player each draw a card.",
});
const counterOn = card("Test Counter Spell", "Sorcery", "{G}", { oracleText: "Put a +1/+1 counter on target creature." });
const names = (s: GameState, pid: number) => s.battlefield.filter((id) => s.objects[id]!.controller === pid).map((id) => s.cards[s.objects[id]!.cardId]!.name);

describe("Hollowmurk Siege, Sultai: \"whenever a counter is put on a creature you control\", only once each turn", () => {
  it("the first counter draws a card; the second doesn't, nor does one on an opponent's creature", () => {
    supported(hollowmurk);
    const { s: s0, ap, ids, opp } = setup([counterOn, counterOn, counterOn]);
    const siege = putOnBattlefield(s0, ap, hollowmurk);
    s0.objects[siege]!.chosen = { anchor: "Sultai" };
    const mine = putOnBattlefield(s0, ap, card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    const theirs = putOnBattlefield(s0, opp, card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    const hand = s0.players[ap]!.hand.length;
    let s = settleBots(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: theirs }])));
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    s = settleBots(run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: mine }])));
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    s = settleBots(run(s, planCast(s, ap, ids[2]!, [{ kind: "object", id: mine }])));
    expect(s.players[ap]!.hand.length).toBe(hand - 2);
    expect(s.objects[mine]!.counters["+1/+1"]).toBe(2);
  });
});

describe("Nuclear Fallout: twice -X/-X, then X rad counters each", () => {
  it("X = 1: each creature gets -2/-2; every player gets a rad counter", () => {
    supported(fallout);
    const { s: s0, ap, ids, opp } = setup([fallout]);
    const b = putOnBattlefield(s0, opp, card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    const g = putOnBattlefield(s0, ap, card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" }));
    const s = settleBots(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 1)));
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[g]!.zone).toBe("battlefield");
    expect(power(s, s.objects[g]!)).toBe(1);
    expect(s.players.every((p) => p.rad === 1)).toBe(true);
  });
});

describe("Lost Monarch of Ifnir: \"if a player was dealt combat damage by a Zombie this turn\"", () => {
  const swing = (s0: GameState, ap: number, opp: number, attacker: string) => {
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker, defender: opp }] });
    return untilChoice(passUntil(s, "main2"));
  };
  it("after a Zombie's combat damage: mill three, then return a creature card", () => {
    supported(monarch);
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, monarch);
    const bearCard = toHand(s0, ap, card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }))[0]!;
    s0.players[ap]!.hand.splice(s0.players[ap]!.hand.indexOf(bearCard), 1);
    s0.objects[bearCard]!.zone = "graveyard";
    s0.players[ap]!.graveyard.push(bearCard);
    const library = s0.players[ap]!.library.length;
    let s = swing(s0, ap, opp, m);
    expect(s.players[opp]!.life).toBe(s0.players[opp]!.life - 4);
    expect(s.players[ap]!.library.length).toBe(library - 3);
    expect(s.pending?.player).toBe(ap);
    s = settleBots(s);
    expect(s.players[ap]!.hand.some((id) => s.cards[s.objects[id]!.cardId]!.types.includes("Creature"))).toBe(true);
  });
  it("a non-Zombie's combat damage: nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, monarch);
    const hill = putOnBattlefield(s0, ap, card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" }));
    const library = s0.players[ap]!.library.length;
    const s = swing(s0, ap, opp, hill);
    expect(s.players[opp]!.life).toBe(s0.players[opp]!.life - 3);
    expect(s.players[ap]!.library.length).toBe(library);
  });
});

describe("Master of Ceremonies: each opponent chooses money, friends, or secrets", () => {
  it("you and each chooser get what they chose: a Treasure, a Citizen, a card", () => {
    supported(ceremonies);
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, ceremonies);
    const opps = s0.turnOrder.filter((p) => p !== ap);
    const want: Record<number, string> = { [opps[0]!]: "money", [opps[1]!]: "friends", [opps[2]!]: "money" };
    let s = passUntil(s0, "upkeep", ap);
    const hands = s.players.map((p) => p.hand.length);
    for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "chooseOption" && p.what === "word") {
        expect(p.prompt).toBe("choose money, friends, or secrets");
        s = act(s, { type: "chooseOption", player: p.player, choice: want[p.player]! });
      } else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(names(s, ap).filter((n) => n === "Treasure Token")).toHaveLength(2);
    expect(names(s, ap).filter((n) => n === "Citizen Token")).toHaveLength(1);
    expect(names(s, opps[0]!).filter((n) => n === "Treasure Token")).toHaveLength(1);
    expect(names(s, opps[1]!).filter((n) => n === "Citizen Token")).toHaveLength(1);
    expect(names(s, opps[2]!).filter((n) => n === "Treasure Token")).toHaveLength(1);
    expect(s.players[ap]!.hand.length).toBe(hands[ap]);
  });
});

const eluge = card("Eluge, the Shoreless Sea", "Legendary Creature — Elemental Fish", "{1}{U}{U}{U}", {
  power: "*", toughness: "*",
  oracleText: "Eluge's power and toughness are each equal to the number of Islands you control.\nWhenever Eluge enters or attacks, put a flood counter on target land. It's an Island in addition to its other types for as long as it has a flood counter on it.\nThe first instant or sorcery spell you cast each turn costs {U} (or {1}) less to cast for each land you control with a flood counter on it.",
});
const weaving = card("Season of Weaving", "Sorcery", "{4}{U}{U}", { oracleText: "Draw a card." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });

describe("Eluge, the Shoreless Sea: {U} (or {1}) less for each land with a flood counter (rulings)", () => {
  const flooded = (n: number, hand: CardDef[]) => {
    const { s, ap, ids } = setup(hand);
    putOnBattlefield(s, ap, eluge);
    const lands = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.types.includes("Land") && s.objects[id]!.controller === ap);
    for (const l of lands.slice(0, n)) s.objects[l]!.counters.flood = 1;
    invalidateCharacteristics(s);
    return { s, ap, ids };
  };
  const blue = (c: { cost: { symbols: { kind: string; color?: string }[] } }) => c.cost.symbols.filter((y) => y.color === "U").length;
  it("four flood counters: Season of Weaving's {U}{U} first, then {2} generic: {2} left", () => {
    supported(eluge);
    const { s, ap, ids } = flooded(4, [weaving]);
    const c = spellCost(s, ap, s.objects[ids[0]!]!);
    expect(blue(c)).toBe(0);
    expect(manaValue(c.cost) + c.extra).toBe(2);
  });
  it("a spell with no {U} gets {1} less for each; only the first instant or sorcery each turn", () => {
    const { s: s0, ap, ids } = flooded(2, [shock, weaving]);
    const c = spellCost(s0, ap, s0.objects[ids[0]!]!);
    expect(manaValue(c.cost) + c.extra).toBe(1);
    expect(c.cost.symbols.some((y) => (y as { color?: string }).color === "R")).toBe(true);
    const w = spellCost(s0, ap, s0.objects[ids[1]!]!);
    expect(manaValue(w.cost) + w.extra).toBe(4);
    const s = settleBots(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: (ap + 1) % 4 }])));
    const after = spellCost(s, ap, s.objects[ids[1]!]!);
    expect(manaValue(after.cost) + after.extra).toBe(6);
    expect(blue(after)).toBe(2);
  });
  it("entering, it puts a flood counter on a Mountain, now an Island too, and Eluge's power counts it", () => {
    const { s: s0, ap, ids } = setup([eluge]);
    const mountain = s0.battlefield.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Mountain")!;
    let s = untilChoice(run(s0, planCast(s0, ap, ids[0]!)));
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settleBots(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: mountain }] }));
    expect(s.objects[mountain]!.counters.flood).toBe(1);
    expect(characteristics(s, s.objects[mountain]!).subtypes).toContain("Island");
    const islands = s.battlefield.filter((id) => s.objects[id]!.controller === ap && characteristics(s, s.objects[id]!).subtypes.includes("Island")).length;
    expect(power(s, s.objects[ids[0]!]!)).toBe(islands);
  });
});

const meathook2 = card("Meathook Massacre II", "Legendary Enchantment", "{X}{X}{B}{B}{B}{B}", {
  oracleText: "When Meathook Massacre II enters, each player sacrifices X creatures of their choice.\nWhenever a creature you control dies, you may pay 3 life. If you do, return that card under your control with a finality counter on it.\nWhenever a creature an opponent controls dies, they may pay 3 life. If they don't, return that card under your control with a finality counter on it.",
});

describe("Meathook Massacre II: \"return that card under your control\" from the graveyard (rulings)", () => {
  const kill = card("Test Murder", "Instant", "{B}", { oracleText: "Destroy target creature." });
  it("an opponent's creature dies and they don't pay 3 life: it returns under your control with a finality counter", () => {
    supported(meathook2);
    const { s: s0, ap, ids, opp } = setup([kill]);
    putOnBattlefield(s0, ap, meathook2);
    const b = putOnBattlefield(s0, opp, card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    let s = untilChoice(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: b }])));
    for (let i = 0; i < 20 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "payUnless", player: opp, life: 3 });
    s = settleBots(act(s, { type: "payUnless", player: opp, pay: false }));
    expect(s.objects[b]).toMatchObject({ zone: "battlefield", controller: ap });
    expect(s.objects[b]!.counters.finality).toBe(1);
    expect(s.players[opp]!.life).toBe(s0.players[opp]!.life);
  });
  it("your creature dies and you pay 3 life: it returns with a finality counter", () => {
    const { s: s0, ap, ids } = setup([kill]);
    putOnBattlefield(s0, ap, meathook2);
    const b = putOnBattlefield(s0, ap, card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    let s = untilChoice(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: b }])));
    for (let i = 0; i < 20 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, pay: { life: 3 } });
    s = settleBots(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[b]).toMatchObject({ zone: "battlefield", controller: ap });
    expect(s.objects[b]!.counters.finality).toBe(1);
    expect(s.players[ap]!.life).toBe(s0.players[ap]!.life - 3);
  });
});

const ramos = card("Ramos, Dragon Engine", "Legendary Artifact Creature — Dragon", "{6}", {
  power: "4", toughness: "4", keywords: ["Flying"],
  oracleText: "Flying\nWhenever you cast a spell, put a +1/+1 counter on Ramos for each of that spell's colors.\nRemove five +1/+1 counters from Ramos: Add {W}{W}{U}{U}{B}{B}{R}{R}{G}{G}. Activate only once each turn.",
});
const diamondCity = card("Diamond City", "Land", "", {
  oracleText: "This land enters with a shield counter on it. (If it would be dealt damage or destroyed, remove a shield counter from it instead.)\n{T}: Add {C}.\n{T}: Move a shield counter from this land onto target creature. Activate only if two or more creatures entered the battlefield under your control this turn.",
});
const betor = card("Betor, Kin to All", "Legendary Creature — Spirit Dragon", "{2}{W}{B}{G}", {
  power: "5", toughness: "7", keywords: ["Flying"],
  oracleText: "Flying\nAt the beginning of your end step, if creatures you control have total toughness 10 or greater, draw a card. Then if creatures you control have total toughness 20 or greater, untap each creature you control. Then if creatures you control have total toughness 40 or greater, each opponent loses half their life, rounded up.",
});

describe("Ramos, Dragon Engine: a +1/+1 counter for each of that spell's colors (rulings)", () => {
  it("a blue-red spell: two counters; a colorless one: none", () => {
    supported(ramos);
    const izzet = card("Test Izzet Draw", "Sorcery", "{U}{R}", { oracleText: "Draw a card." });
    const rock = card("Test Rock", "Artifact", "{1}", { oracleText: "" });
    const { s: s0, ap, ids } = setup([izzet, rock]);
    const r = putOnBattlefield(s0, ap, ramos);
    let s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[r]!.counters["+1/+1"]).toBe(2);
    s = settleBots(run(s, planCast(s, ap, ids[1]!)));
    expect(s.objects[r]!.counters["+1/+1"] ?? 0).toBe(2);
  });
});

describe("Diamond City: move its shield counter onto a creature once two creatures entered under your control", () => {
  it("not before the second creature; then the counter moves", () => {
    supported(diamondCity);
    const soldier = (n: string) => card(n, "Creature — Soldier", "{W}", { power: "1", toughness: "1" });
    const { s: s0, ap, ids } = setup([soldier("Soldier One"), soldier("Soldier Two")]);
    const city = putOnBattlefield(s0, ap, diamondCity);
    s0.objects[city]!.counters.shield = 1;
    const move = compileCard(diamondCity).activated.findIndex((a) => a.body.effects.some((e) => e.type === "moveCounter"));
    let s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    expect(planActivate(s, ap, city, move, [{ kind: "object", id: ids[0]! }])).toBeNull();
    s = settleBots(run(s, planCast(s, ap, ids[1]!)));
    s = settleBots(run(s, planActivate(s, ap, city, move, [{ kind: "object", id: ids[0]! }])));
    expect(s.objects[city]!.counters.shield ?? 0).toBe(0);
    expect(s.objects[ids[0]!]!.counters.shield).toBe(1);
  });
});

describe("Betor, Kin to All: total toughness 10, 20, 40 (rulings)", () => {
  const wall = (t: number) => card(`Test Wall ${t}`, "Creature — Wall", "{2}", { power: "0", toughness: String(t) });
  it("21 toughness: a card and its creatures untap; 41: each opponent loses half their life, rounded up", () => {
    supported(betor);
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, betor);
    const w = putOnBattlefield(s0, ap, wall(14));
    s0.objects[b]!.tapped = true;
    const hand = s0.players[ap]!.hand.length;
    s0.players[opp]!.life = 39;
    let s = passUntil(s0, "end", ap);
    s = settleBots(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.objects[b]!.tapped).toBe(false);
    expect(s.players[opp]!.life).toBe(39);
    const { s: t0, ap: ap2, opp: opp2 } = setup([]);
    putOnBattlefield(t0, ap2, betor);
    putOnBattlefield(t0, ap2, wall(34));
    t0.players[opp2]!.life = 39;
    const t = settleBots(passUntil(t0, "end", ap2));
    expect(t.players[opp2]!.life).toBe(19);
    void w;
  });
});

const veil = card("Autumn's Veil", "Instant", "{G}", { oracleText: "Spells you control can't be countered by blue or black spells this turn, and creatures you control can't be the targets of blue or black spells this turn." });

describe("Autumn's Veil (rulings)", () => {
  const blackKill = card("Test Black Kill", "Instant", "{B}", { colors: ["B"], oracleText: "Destroy target creature." });
  const greenPump = card("Test Green Pump", "Instant", "{G}", { colors: ["G"], oracleText: "Target creature gets +1/+1 until end of turn." });
  const blueCounter = card("Test Blue Counter", "Instant", "{U}", { colors: ["U"], oracleText: "Counter target spell." });
  const redCounter = card("Test Red Counter", "Instant", "{R}", { colors: ["R"], oracleText: "Counter target spell." });
  it("creatures you control, even ones that come later, can't be the targets of black spells (yours too); green ones are fine", () => {
    supported(veil);
    const { s: s0, ap, ids } = setup([veil, blackKill, greenPump]);
    let s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    const b = putOnBattlefield(s, ap, card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    invalidateCharacteristics(s);
    expect(planCast(s, ap, ids[1]!, [{ kind: "object", id: b }])).toBeNull();
    s = settleBots(run(s, planCast(s, ap, ids[2]!, [{ kind: "object", id: b }])));
    expect(power(s, s.objects[b]!)).toBe(3);
  });
  const counterTest = (counterSpell: CardDef, color: string) => {
    const { s: s0, ap, ids, opp } = setup([veil, card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" })]);
    let s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    putOnBattlefield(s, opp, card(color === "U" ? "Island" : "Mountain", `Basic Land — ${color === "U" ? "Island" : "Mountain"}`, "", { oracleText: `({T}: Add {${color}}.)` }));
    const c = toHand(s, opp, counterSpell)[0]!;
    s = run(s, planCast(s, ap, ids[1]!));
    const spell = s.stack.at(-1)!.id;
    s = act(s, { type: "passPriority", player: ap });
    s = run(s, planCast(s, opp, c, [{ kind: "stack", id: spell }]));
    return { s: settleBots(s), bear: ids[1]! };
  };
  it("a blue spell can't counter your spells this turn; a red one can", () => {
    const blue = counterTest(blueCounter, "U");
    expect(blue.s.objects[blue.bear]!.zone).toBe("battlefield");
    expect(logText(blue.s)).toMatch(/can't be countered/);
    const red = counterTest(redCounter, "R");
    expect(red.s.objects[red.bear]!.zone).toBe("graveyard");
  });
});

const mask = card("Mask of Griselbrand", "Legendary Artifact — Equipment", "{1}{B}{B}", {
  keywords: ["Equip"],
  oracleText: "Equipped creature has flying and lifelink.\nWhenever equipped creature dies, you may pay X life, where X is its power. If you do, draw X cards.\nEquip {3}",
});

describe("Mask of Griselbrand: pay X life, where X is its power, to draw X (rulings)", () => {
  it("a 3/3 dies: pay 3 life, draw 3", () => {
    supported(mask);
    const kill = card("Test Murder", "Instant", "{B}", { oracleText: "Destroy target creature." });
    const { s: s0, ap, ids } = setup([kill]);
    const m = putOnBattlefield(s0, ap, mask);
    const g = putOnBattlefield(s0, ap, card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" }));
    s0.objects[m]!.attachedTo = g;
    invalidateCharacteristics(s0);
    const [life, hand] = [s0.players[ap]!.life, s0.players[ap]!.hand.length];
    let s = untilChoice(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: g }])));
    for (let i = 0; i < 20 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, pay: { life: 3 } });
    s = settleBots(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.players[ap]!.life).toBe(life - 3);
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 3);
  });
});

const endrek = card("Endrek Sahr, Master Breeder", "Legendary Creature — Human Wizard", "{4}{B}", {
  power: "2", toughness: "2",
  oracleText: "Whenever you cast a creature spell, create X 1/1 black Thrull creature tokens, where X is that spell's mana value.\nWhen you control seven or more Thrulls, sacrifice Endrek Sahr.",
});

describe("Endrek Sahr: a state trigger (CR 603.8) at seven Thrulls", () => {
  it("five Thrulls and a 2-drop: seven Thrulls, then Endrek Sahr is sacrificed", () => {
    supported(endrek);
    const { s: s0, ap, ids } = setup([card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" })]);
    const e = putOnBattlefield(s0, ap, endrek);
    for (let i = 0; i < 5; i++) putOnBattlefield(s0, ap, card("Thrull", "Creature — Thrull", "", { power: "1", toughness: "1" }));
    invalidateCharacteristics(s0);
    let s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    const thrulls = s.battlefield.filter((id) => characteristics(s, s.objects[id]!).subtypes.includes("Thrull")).length;
    expect(thrulls).toBe(7);
    expect(s.objects[e]!.zone).toBe("graveyard");
  });
});

const triad = card("The Warring Triad", "Legendary Artifact Creature — God", "{3}", {
  power: "5", toughness: "5", keywords: ["Flying", "Haste", "Trample", "Mill"],
  oracleText: "Flying, trample, haste\nAs long as there are fewer than eight cards in your graveyard, The Warring Triad isn't a creature.\n{T}, Mill a card: Target player adds one mana of any color. (Activate only as an instant.)",
});

describe("The Warring Triad: not a creature with fewer than eight cards in your graveyard", () => {
  it("seven cards: an artifact only; eight: a creature", () => {
    supported(triad);
    const { s, ap } = setup([]);
    const t = putOnBattlefield(s, ap, triad);
    const yard = (n: number) => {
      while (s.players[ap]!.graveyard.length < n) {
        const c = s.players[ap]!.library.shift()!;
        s.objects[c]!.zone = "graveyard";
        s.players[ap]!.graveyard.push(c);
      }
      invalidateCharacteristics(s);
    };
    yard(7);
    expect(characteristics(s, s.objects[t]!).types).toEqual(["Artifact"]);
    yard(8);
    expect(characteristics(s, s.objects[t]!).types).toContain("Creature");
  });
});

const lavinia = card("Lavinia, Azorius Renegade", "Legendary Creature — Human Soldier", "{W}{U}", {
  power: "2", toughness: "2",
  oracleText: "Each opponent can't cast noncreature spells with mana value greater than the number of lands that player controls.\nWhenever an opponent casts a spell, if no mana was spent to cast it, counter that spell.",
});

describe("Lavinia, Azorius Renegade: no noncreature spells with mana value above your land count", () => {
  it("three lands: a 4-mana sorcery can't be cast, a 4-mana creature can; X counts as chosen", () => {
    supported(lavinia);
    const sorcery = card("Test Four Sorcery", "Sorcery", "{3}{R}", { oracleText: "Draw a card." });
    const creature = card("Test Four Creature", "Creature — Giant", "{3}{R}", { power: "4", toughness: "4" });
    const xSpell = card("Test X Sorcery", "Sorcery", "{X}{R}", { oracleText: "Draw X cards." });
    const { s, ap, ids, opp } = setup([sorcery, creature, xSpell]);
    putOnBattlefield(s, opp, lavinia);
    const lands = s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Land"));
    for (const l of lands.slice(3)) {
      s.battlefield.splice(s.battlefield.indexOf(l), 1);
      s.objects[l]!.zone = "graveyard";
      s.players[ap]!.graveyard.push(l);
    }
    s.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 5, G: 0, C: 0 };
    invalidateCharacteristics(s);
    expect(castProblem(s, ap, ids[0]!)).toMatch(/Lavinia/);
    expect(castProblem(s, ap, ids[1]!)).toBeNull();
    expect(castProblem(s, ap, ids[2]!, undefined, undefined, undefined, undefined, 2)).toBeNull();
    expect(castProblem(s, ap, ids[2]!, undefined, undefined, undefined, undefined, 3)).toMatch(/Lavinia/);
  });
});

describe("Windgrace's Judgment: \"for any number of opponents\" is a target for each opponent chosen (CR 601.2c)", () => {
  it("two of three opponents' permanents destroyed", () => {
    const judgment = card("Windgrace's Judgment", "Instant", "{3}{B}{G}", { oracleText: "For any number of opponents, destroy target nonland permanent that player controls." });
    supported(judgment);
    const { s: s0, ap, ids } = setup([judgment]);
    // One target per opponent, in turn order from the caster (CR 601.2c).
    const opps = [1, 2, 3].map((k) => s0.turnOrder[(s0.turnOrder.indexOf(ap) + k) % 4]!);
    const [a, c] = [putOnBattlefield(s0, opps[0]!, card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" })), putOnBattlefield(s0, opps[2]!, card("Test Relic", "Artifact", "{2}"))];
    const s = settleBots(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: a }, { kind: "none" }, { kind: "object", id: c }])));
    expect(s.objects[a]!.zone).toBe("graveyard");
    expect(s.objects[c]!.zone).toBe("graveyard");
  });
});

describe("Forth Eorlingas!: \"whenever one or more creatures you control deal combat damage to one or more players this turn\"", () => {
  it("its Knight connects: you become the monarch", () => {
    const forth = card("Forth Eorlingas!", "Sorcery", "{X}{R}{W}", { oracleText: "Create X 2/2 red Human Knight creature tokens with trample and haste.\nWhenever one or more creatures you control deal combat damage to one or more players this turn, you become the monarch." });
    supported(forth);
    const { s: s0, ap, ids, opp } = setup([forth]);
    let s = settleBots(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 1)));
    const knight = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Human Knight Token")!;
    expect(knight).toBeDefined();
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: knight, defender: opp }] });
    s = settleBots(passUntil(s, "endCombat"));
    expect(s.monarch).toBe(ap);
  });
});

const nextOf = (s: GameState, pid: number, n: number) => s.turnOrder[(s.turnOrder.indexOf(pid) + n) % 4]!;

describe("Ingenious Prodigy: \"you may remove a +1/+1 counter from it\" after an intervening if (CR 603.4)", () => {
  it("two counters at upkeep: one removed, a card drawn", () => {
    const prodigy = card("Ingenious Prodigy", "Creature — Human Wizard", "{X}{U}", {
      power: "0",
      toughness: "1",
      keywords: ["Skulk"],
      oracleText: "Skulk (This creature can't be blocked by creatures with greater power.)\nThis creature enters with X +1/+1 counters on it.\nAt the beginning of your upkeep, if this creature has one or more +1/+1 counters on it, you may remove a +1/+1 counter from it. If you do, draw a card.",
    });
    supported(prodigy);
    const { s: s0, ap } = setup([]);
    const id = putOnBattlefield(s0, ap, prodigy);
    s0.objects[id]!.counters["+1/+1"] = 2;
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "upkeep", nextOf(s0, ap, 1));
    s = passUntil(s, "upkeep", ap);
    const hand = s.players[ap]!.hand.length;
    s = settleBots(s);
    expect(s.objects[id]!.counters["+1/+1"]).toBe(1);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });
});

describe("Court of Ire: \"if you're the monarch, it deals 7 damage instead\" to the same target", () => {
  const court = card("Court of Ire", "Enchantment", "{3}{R}{R}", {
    oracleText: "When this enchantment enters, you become the monarch.\nAt the beginning of your upkeep, this enchantment deals 2 damage to any target. If you're the monarch, it deals 7 damage instead.",
  });
  const lost = (s: GameState, before: GameState, ap: number) => [1, 2, 3].reduce((n, k) => n + before.players[nextOf(s, ap, k)]!.life - s.players[nextOf(s, ap, k)]!.life, 0);
  for (const monarch of [true, false])
    it(monarch ? "the monarch: 7 damage" : "not the monarch: 2 damage", () => {
      supported(court);
      const { s: s0, ap } = setup([]);
      putOnBattlefield(s0, ap, court);
      if (monarch) s0.monarch = ap;
      let s = passUntil(s0, "upkeep", nextOf(s0, ap, 1));
      s = passUntil(s, "upkeep", ap);
      if (monarch) s.monarch = ap;
      const before = JSON.parse(JSON.stringify(s)) as GameState;
      s = settleBots(s);
      expect(lost(s, before, ap)).toBe(monarch ? 7 : 2);
    });
});

describe("Luminarch Ascension: \"if you didn't lose life this turn\" (CR 603.4)", () => {
  const ascension = card("Luminarch Ascension", "Enchantment", "{1}{W}", {
    oracleText: "At the beginning of each opponent's end step, if you didn't lose life this turn, you may put a quest counter on this enchantment. (Damage causes loss of life.)\n{1}{W}: Create a 4/4 white Angel creature token with flying. Activate only if this enchantment has four or more quest counters on it.",
  });
  for (const lose of [false, true])
    it(lose ? "lost life on the opponent's turn: no counter" : "no life lost: a quest counter", () => {
      supported(ascension);
      const { s: s0, ap } = setup([]);
      const id = putOnBattlefield(s0, ap, ascension);
      let s = passUntil(s0, "main1", nextOf(s0, ap, 1));
      if (lose) loseLife(s, ap, 1);
      s = settleBots(passUntil(s, "end", nextOf(s0, ap, 1)));
      expect(s.objects[id]!.counters.quest ?? 0).toBe(lose ? 0 : 1);
    });
});

describe("Extract from Darkness: a creature card from any graveyard, not targeted (rulings)", () => {
  it("each player mills two, then the best creature card in any graveyard enters under your control", () => {
    const extract = card("Extract from Darkness", "Sorcery", "{3}{U}{B}", { oracleText: "Each player mills two cards. Then you put a creature card from a graveyard onto the battlefield under your control." });
    supported(extract);
    const { s: s0, ap, ids, opp } = setup([extract]);
    const bears = card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });
    const big = card("Test Wurm", "Creature — Wurm", "{6}{G}", { power: "6", toughness: "6" });
    for (const [pid, d] of [[ap, bears], [opp, big]] as const) {
      const id = putOnBattlefield(s0, pid, d);
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      s0.objects[id]!.zone = "graveyard";
      s0.players[pid]!.graveyard.push(id);
    }
    const yards = s0.turnOrder.map((p) => s0.players[p]!.graveyard.length);
    s0.players[ap]!.manaPool = { W: 0, U: 3, B: 2, R: 0, G: 0, C: 0 };
    let s = untilChoice(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", fromGraveyard: "battlefield", anyGraveyard: true, player: ap });
    if (s.pending?.kind !== "searchLibrary") throw new Error("no choice");
    // Every creature card in every graveyard, including the milled ones; no noncreature card.
    expect(s.pending.cards.every((id) => s.cards[s.objects[id]!.cardId]!.types.includes("Creature"))).toBe(true);
    expect(s0.turnOrder.map((p) => s.players[p]!.graveyard.length)).toEqual(yards.map((n) => n + 2));
    s = settleBots(s);
    const wurm = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Test Wurm");
    expect(wurm).toBeDefined();
    expect(s.objects[wurm!]!.controller).toBe(ap);
    expect(s.objects[wurm!]!.owner).toBe(opp);
  });
});

describe("Tezzeret, Master of the Bridge", () => {
  const tez = card("Tezzeret, Master of the Bridge", "Legendary Planeswalker — Tezzeret", "{4}{U}{B}", {
    loyalty: "5",
    oracleText: "Creature and planeswalker spells you cast have affinity for artifacts. (They cost {1} less to cast for each artifact you control.)\n+2: Tezzeret deals X damage to each opponent, where X is the number of artifacts you control. You gain X life.\n−3: Return target artifact card from your graveyard to your hand.\n−8: Exile the top ten cards of your library. Put all artifact cards from among them onto the battlefield.",
  });
  const relic = card("Test Relic", "Artifact", "{2}");
  it("affinity for artifacts on creature spells only; +2 deals X and gains X", () => {
    supported(tez);
    const bear = card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });
    const shock = card("Test Shock", "Instant", "{1}{R}", { oracleText: "Test Shock deals 2 damage to any target." });
    const { s: s0, ap, ids, opp } = setup([bear, shock]);
    const t = putOnBattlefield(s0, ap, tez);
    putOnBattlefield(s0, ap, relic);
    invalidateCharacteristics(s0);
    expect(spellCost(s0, ap, s0.objects[ids[0]!]!).extra).toBe(0);
    expect(spellCost(s0, ap, s0.objects[ids[1]!]!).extra).toBe(1);
    const life = s0.players[ap]!.life;
    const oppLife = s0.players[opp]!.life;
    const s = settleBots(run(s0, planActivate(s0, ap, t, 0)));
    expect(s.players[ap]!.life).toBe(life + 1);
    expect(s.players[opp]!.life).toBe(oppLife - 1);
  });
  it("−8: the artifact cards among the top ten enter, the rest stay exiled", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, tez);
    s0.objects[t]!.counters.loyalty = 8;
    const lib = s0.players[ap]!.library;
    const top = lib.slice(0, 10);
    const arts = [0, 4].map((i) => {
      const id = putOnBattlefield(s0, ap, relic);
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      s0.objects[id]!.zone = "library";
      lib.splice(lib.indexOf(top[i]!), 1, id);
      return id;
    });
    const s = settleBots(run(s0, planActivate(s0, ap, t, 2)));
    for (const id of arts) expect(s.objects[id]!.zone).toBe("battlefield");
    expect(s.players[ap]!.exile.length).toBe(8);
  });
});

describe("Fandaniel, Telophoroi Ascian: each opponent may sacrifice a nontoken creature; the others lose life (rulings)", () => {
  it("an opponent with no nontoken creature loses 2 life for each instant and sorcery card in your graveyard", () => {
    const fan = card("Fandaniel, Telophoroi Ascian", "Legendary Creature — Elder Wizard", "{4}{B}", {
      power: "4",
      toughness: "5",
      oracleText: "Whenever you cast an instant or sorcery spell, surveil 1.\nAt the beginning of your end step, each opponent may sacrifice a nontoken creature of their choice. Each opponent who doesn't loses 2 life for each instant and sorcery card in your graveyard.",
    });
    supported(fan);
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, fan);
    for (let i = 0; i < 3; i++) {
      const id = putOnBattlefield(s0, ap, card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target." }));
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      s0.objects[id]!.zone = "graveyard";
      s0.players[ap]!.graveyard.push(id);
    }
    const [o1, o2] = [nextOf(s0, ap, 1), nextOf(s0, ap, 2)];
    const bear = putOnBattlefield(s0, o1, card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    const before = s0.turnOrder.map((p) => s0.players[p]!.life);
    let s = passUntil(s0, "end", ap);
    s = settleBots(s);
    // The bear's controller either sacrifices it or loses the 6, not both.
    const lost = (p: number) => before[s0.turnOrder.indexOf(p)]! - s.players[p]!.life;
    expect(lost(o2)).toBe(6);
    expect(s.objects[bear]!.zone === "graveyard" ? lost(o1) : 6 - lost(o1)).toBe(0);
  });
});

describe("Mjölnir, Storm Hammer: damage to each opponent equal to the tapped creatures that opponent controls", () => {
  it("tap and stun the defending player's creature, then damage by each opponent's tapped creatures", () => {
    const hammer = card("Mjölnir, Storm Hammer", "Legendary Artifact — Equipment", "{4}", {
      keywords: ["Equip"],
      oracleText: "When Mjölnir enters, attach it to target legendary creature you control.\nWhenever equipped creature attacks, tap target creature defending player controls and put a stun counter on it. Then Mjölnir deals damage to each opponent equal to the number of tapped creatures that opponent controls.\nEquip {4}",
    });
    supported(hammer);
    const { s: s0, ap, opp } = setup([]);
    const bear = () => card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });
    const hero = putOnBattlefield(s0, ap, bear());
    const h = putOnBattlefield(s0, ap, hammer);
    s0.objects[h]!.attachedTo = hero;
    const a = putOnBattlefield(s0, opp, bear());
    const other = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const b = putOnBattlefield(s0, other, bear());
    s0.objects[b]!.tapped = true;
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "declareAttackers", ap);
    const [l1, l2] = [s.players[opp]!.life, s.players[other]!.life];
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: hero, defender: opp }] });
    s = settleBots(s);
    expect(s.objects[a]!.tapped).toBe(true);
    expect(s.objects[a]!.counters.stun).toBe(1);
    expect(s.players[opp]!.life).toBe(l1 - 1);
    expect(s.players[other]!.life).toBe(l2 - 1);
  });
});

describe("Strong Back: equip abilities and Aura spells that target enchanted creature cost {3} less (rulings)", () => {
  it("only for the enchanted creature, only generic mana", () => {
    const back = card("Strong Back", "Enchantment — Aura", "{2}{G}", {
      keywords: ["Enchant"],
      oracleText: "Enchant creature\nEquip abilities you activate that target enchanted creature cost {3} less to activate.\nAura spells you cast that target enchanted creature cost {3} less to cast.\nEnchanted creature gets +2/+2 for each Aura and Equipment attached to it.",
    });
    supported(back);
    const aura = card("Test Strength", "Enchantment — Aura", "{3}{G}", { keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature gets +1/+1." });
    const { s, ap, ids } = setup([aura]);
    const bear = () => card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });
    const [x, y] = [putOnBattlefield(s, ap, bear()), putOnBattlefield(s, ap, bear())];
    const sb = putOnBattlefield(s, ap, back);
    s.objects[sb]!.attachedTo = x;
    const sword = putOnBattlefield(s, ap, card("Test Sword", "Artifact — Equipment", "{2}", { keywords: ["Equip"], oracleText: "Equipped creature gets +1/+1.\nEquip {4}" }));
    invalidateCharacteristics(s);
    expect(power(s, s.objects[x]!)).toBe(4);
    const generic = (c: { symbols: { kind: string; amount?: number }[] }) => c.symbols.reduce((n, y) => n + (y.kind === "generic" ? (y.amount ?? 0) : 0), 0);
    const eq = abilitiesOf(s, s.objects[sword]!).activated.find((ab) => ab.equip)!;
    expect(generic(activationCost(s, ap, s.objects[sword]!, eq, [{ kind: "object", id: x }]))).toBe(1);
    expect(generic(activationCost(s, ap, s.objects[sword]!, eq, [{ kind: "object", id: y }]))).toBe(4);
    const o = s.objects[ids[0]!]!;
    expect(spellCost(s, ap, o, 0, [], { targets: [{ kind: "object", id: x }] }).extra).toBe(0);
    expect(spellCost(s, ap, o, 0, [], { targets: [{ kind: "object", id: y }] }).extra).toBe(3);
  });
});

describe("More of the most played cards", () => {
  const bears = () => card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });
  const inLibrary = (s: GameState, pid: number, d: CardDef) => {
    const id = putOnBattlefield(s, pid, d);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "library";
    s.players[pid]!.library.unshift(id);
    return id;
  };
  it("Soul's Majesty: draws cards equal to the target creature's power", () => {
    const majesty = card("Soul's Majesty", "Sorcery", "{4}{G}", { oracleText: "Draw cards equal to the power of target creature you control." });
    supported(majesty);
    const { s: s0, ap, ids } = setup([majesty]);
    const big = putOnBattlefield(s0, ap, card("Test Wurm", "Creature — Wurm", "{6}{G}", { power: "6", toughness: "6" }));
    s0.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 5, C: 0 };
    const hand = s0.players[ap]!.hand.length;
    const s = settleBots(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: big }])));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 6);
  });
  it("Ovika, Enigma Goliath: X tokens for the noncreature spell's mana value, with haste", () => {
    const ovika = card("Ovika, Enigma Goliath", "Legendary Creature — Phyrexian Nightmare", "{5}{U}{R}", {
      power: "6",
      toughness: "6",
      keywords: ["Flying", "Ward"],
      oracleText: "Flying\nWard—{3}, Pay 3 life.\nWhenever you cast a noncreature spell, create X 1/1 red Phyrexian Goblin creature tokens, where X is the mana value of that spell. They gain haste until end of turn.",
    });
    supported(ovika);
    const relic = card("Test Relic", "Artifact", "{3}");
    const { s: s0, ap, ids } = setup([relic]);
    putOnBattlefield(s0, ap, ovika);
    s0.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 3 };
    const s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    const goblins = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Phyrexian Goblin Token");
    expect(goblins.length).toBe(3);
    expect(goblins.every((id) => characteristics(s, s.objects[id]!).keywords.includes("Haste"))).toBe(true);
  });
  it("Rampant Rejuvenator: X is its power as it last existed (rulings)", () => {
    const rejuv = card("Rampant Rejuvenator", "Creature — Plant Hydra", "{3}{G}", {
      power: "0",
      toughness: "0",
      oracleText: "This creature enters with two +1/+1 counters on it.\nWhen this creature dies, search your library for up to X basic land cards, where X is this creature's power, put them onto the battlefield, then shuffle.",
    });
    supported(rejuv);
    const murder = card("Test Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });
    const { s: s0, ap, ids } = setup([murder]);
    const r = putOnBattlefield(s0, ap, rejuv);
    s0.objects[r]!.counters["+1/+1"] = 3;
    const forest = card("Forest", "Basic Land — Forest", "", { supertypes: ["Basic"], oracleText: "({T}: Add {G}.)" } as Partial<CardDef>);
    const lands = [0, 1, 2, 3].map(() => inLibrary(s0, ap, forest));
    s0.players[ap]!.manaPool = { W: 0, U: 0, B: 3, R: 0, G: 0, C: 0 };
    invalidateCharacteristics(s0);
    const s = settleBots(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: r }])));
    expect(s.objects[r]!.zone).toBe("graveyard");
    expect(lands.filter((id) => s.objects[id]!.zone === "battlefield").length).toBe(3);
  });
  it("Canoptek Spyder: a nontoken Vehicle entering draws a card; a token artifact creature doesn't", () => {
    const spyder = card("Canoptek Spyder", "Artifact Creature — Spider", "{5}", { power: "4", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nFabricator Claw Array — Whenever another nontoken artifact creature or Vehicle you control enters, draw a card." });
    supported(spyder);
    const cart = card("Test Cart", "Artifact — Vehicle", "{1}", { power: "3", toughness: "3", oracleText: "Crew 1" });
    const thopter = card("Test Thopter", "Artifact Creature — Thopter", "{1}", { power: "1", toughness: "1", oracleText: "Flying", keywords: ["Flying"] });
    const { s: s0, ap, ids } = setup([cart, thopter]);
    putOnBattlefield(s0, ap, spyder);
    s0.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 };
    const hand = s0.players[ap]!.hand.length;
    let s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
    s = settleBots(run(s, planCast(s, ap, ids[1]!)));
    expect(s.players[ap]!.hand.length).toBe(hand - 2 + 2);
  });
  it("Godo, Bandit Warlord: untaps itself and all Samurai, then an extra combat", () => {
    const godo = card("Godo, Bandit Warlord", "Legendary Creature — Human Barbarian", "{5}{R}", {
      power: "3",
      toughness: "3",
      oracleText: "When Godo enters, you may search your library for an Equipment card, put it onto the battlefield, then shuffle.\nWhenever Godo attacks for the first time each turn, untap it and all Samurai you control. After this phase, there is an additional combat phase.",
    });
    supported(godo);
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, godo);
    const samurai = putOnBattlefield(s0, ap, card("Test Samurai", "Creature — Human Samurai", "{1}{W}", { power: "2", toughness: "2" }));
    const bear = putOnBattlefield(s0, ap, bears());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [g, samurai, bear].map((attacker) => ({ attacker, defender: opp })) });
    s = settleBots(s);
    expect(s.objects[g]!.tapped).toBe(false);
    expect(s.objects[samurai]!.tapped).toBe(false);
    expect(s.objects[bear]!.tapped).toBe(true);
    expect(s.addedPhases).toEqual(["combat"]);
  });
  it("Thought Reflection: every draw is two, the draw step's first too", () => {
    const reflection = card("Thought Reflection", "Enchantment", "{4}{U}{U}{U}", { oracleText: "If you would draw a card, draw two cards instead." });
    supported(reflection);
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, reflection);
    let s = passUntil(s0, "upkeep", nextOf(s0, ap, 1));
    s = passUntil(s, "upkeep", ap);
    const hand = s.players[ap]!.hand.length;
    s = passUntil(s, "main1", ap);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });
});
