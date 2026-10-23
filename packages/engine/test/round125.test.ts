// Round 125: round 124's gaps (Library of Leng, Rottenmouth Viper, ...), then the most played cards.

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, compileCard, isFullySupported, manaValue, planActivate, planCast, spellCost, waitingOn, type Action, type CardDef, type GameState } from "../src";

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
