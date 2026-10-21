// Round 98, down the popularity list: "historic" (artifacts, legendaries and Sagas, CR 700.6) for spells, permanents and
// cards (Jhoira's Familiar, Jhoira, Raff Capashen, Samwise Gamgee, Arbaaz Mir), Syphon Mind ("for each card discarded this
// way"), Wurmcoil Engine (two kinds of tokens at once, CR 608.2f), Noxious Gearhulk ("if a creature is destroyed this
// way", its toughness as it last existed), Mirror Entity ("gain all creature types", CR 205.3d), Portal to Phyrexia ("It's
// a Phyrexian in addition"), Destiny Spinner ("creature and enchantment spells"), Archon of Cruelty (three instructions in
// the order listed) and Pest Infestation ("twice X").

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { castProblem, characteristics, compileCard, isFullySupported, legalTargets, objHasKeyword, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const familiar = card("Jhoira's Familiar", "Artifact Creature — Bird", "{4}", { power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying\nHistoric spells you cast cost {1} less to cast. (Artifacts, legendaries, and Sagas are historic.)" });
const jhoira = card("Jhoira, Weatherlight Captain", "Legendary Creature — Human Artificer", "{2}{U}{R}", { power: "3", toughness: "3", oracleText: "Whenever you cast a historic spell, draw a card. (Artifacts, legendaries, and Sagas are historic.)" });
const syphonMind = card("Syphon Mind", "Sorcery", "{3}{B}", { oracleText: "Each other player discards a card. You draw a card for each card discarded this way." });
const wurmcoil = card("Wurmcoil Engine", "Artifact Creature — Phyrexian Wurm", "{6}", { power: "6", toughness: "6", keywords: ["Lifelink", "Deathtouch"], oracleText: "Deathtouch, lifelink\nWhen this creature dies, create a 3/3 colorless Phyrexian Wurm artifact creature token with deathtouch and a 3/3 colorless Phyrexian Wurm artifact creature token with lifelink." });
const gearhulk = card("Noxious Gearhulk", "Artifact Creature — Construct", "{4}{B}{B}", { power: "5", toughness: "4", keywords: ["Menace"], oracleText: "Menace\nWhen this creature enters, you may destroy another target creature. If a creature is destroyed this way, you gain life equal to its toughness." });
const mirrorEntity = card("Mirror Entity", "Creature — Shapeshifter", "{2}{W}", { power: "1", toughness: "1", keywords: ["Changeling"], oracleText: "Changeling (This card is every creature type.)\n{X}: Until end of turn, creatures you control have base power and toughness X/X and gain all creature types." });
const portal = card("Portal to Phyrexia", "Artifact", "{9}", { oracleText: "When this artifact enters, each opponent sacrifices three creatures of their choice.\nAt the beginning of your upkeep, put target creature card from a graveyard onto the battlefield under your control. It's a Phyrexian in addition to its other types." });
const spinner = card("Destiny Spinner", "Enchantment Creature — Human", "{1}{G}", { power: "2", toughness: "3", oracleText: "Creature and enchantment spells you control can't be countered.\n{3}{G}: Target land you control becomes an X/X Elemental creature with trample and haste until end of turn, where X is the number of enchantments you control. It's still a land." });
const archon = card("Archon of Cruelty", "Creature — Archon", "{6}{B}{B}", { power: "6", toughness: "6", keywords: ["Flying"], oracleText: "Flying\nWhenever this creature enters or attacks, target opponent sacrifices a creature or planeswalker of their choice, discards a card, and loses 3 life. You draw a card and gain 3 life." });
const pests = card("Pest Infestation", "Sorcery", "{X}{X}{G}", { oracleText: "Destroy up to X target artifacts and/or enchantments. Create twice X 1/1 black and green Pest creature tokens with \"When this token dies, you gain 1 life.\"" });
const raff = card("Raff Capashen, Ship's Mage", "Legendary Creature — Human Wizard", "{2}{W}{U}", { power: "3", toughness: "3", keywords: ["Flying", "Flash"], oracleText: "Flash\nFlying\nYou may cast historic spells as though they had flash. (Artifacts, legendaries, and Sagas are historic.)" });
const samwise = card("Samwise Gamgee", "Legendary Creature — Halfling Peasant", "{G}{W}", { power: "2", toughness: "2", keywords: ["Food"], oracleText: "Whenever another nontoken creature you control enters, create a Food token. (It's an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")\nSacrifice three Foods: Return target historic card from your graveyard to your hand. (Artifacts, legendaries, and Sagas are historic.)" });
const arbaaz = card("Arbaaz Mir", "Legendary Creature — Human Assassin", "{R}{W}", { power: "2", toughness: "2", oracleText: "Whenever Arbaaz Mir or another nontoken historic permanent you control enters, Arbaaz Mir deals 1 damage to each opponent and you gain 1 life. (Artifacts, legendaries, and Sagas are historic.)" });

const legend = card("Old Legend", "Legendary Creature — Human", "{2}{G}", { power: "3", toughness: "3" });
const plainBear = card("Plain Beast", "Creature — Beast", "{2}{G}", { power: "3", toughness: "3" });
const trinket = card("Trinket", "Artifact", "{1}");
const saga = card("Little Saga", "Enchantment — Saga", "{1}", { oracleText: "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after I.)\nI — You gain 1 life." });
const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });
const food = card("Food", "Artifact — Food", "", { oracleText: "{2}, {T}, Sacrifice this token: You gain 3 life." });
const giant = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });
const ward = card("Glow Ward", "Enchantment", "{W}");
const counterspell = card("Counterspell", "Instant", "{U}{U}", { oracleText: "Counter target spell." });
const island = card("Island", "Basic Land — Island");

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const nextAfter = (s: GameState, p: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(p) + 1) % 4]!;
function to(s: GameState, pid: PlayerId, zone: "graveyard" | "hand", def: CardDef) {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  s.players[pid]![zone].push(id);
  return id;
}
const tapAllBut = (s: GameState, pid: PlayerId, keep: number) => {
  let left = keep;
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    if (o.controller !== pid || !s.cards[o.cardId]!.types.includes("Land")) continue;
    if (left > 0 && s.cards[o.cardId]!.name === "Forest") left--;
    else o.tapped = true;
  }
};
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === name);

describe("round 98, down the popularity list", () => {
  it("parse", () => {
    supported(familiar, jhoira, syphonMind, wurmcoil, gearhulk, mirrorEntity, portal, spinner, archon, pests, raff, samwise, arbaaz);
  });

  it("Jhoira's Familiar: historic spells cost {1} less, others don't", () => {
    const { s: s0, ap, ids } = setup([legend, plainBear, trinket]);
    putOnBattlefield(s0, ap, familiar);
    tapAllBut(s0, ap, 2);
    expect(planCast(s0, ap, ids[1]!)).toBeNull();
    expect(planCast(s0, ap, ids[0]!)).not.toBeNull();
    // An artifact for {1} costs nothing.
    tapAllBut(s0, ap, 0);
    expect(planCast(s0, ap, ids[2]!)).not.toBeNull();
  });

  it("Jhoira: casting an artifact, a legendary or a Saga draws a card; a sorcery doesn't", () => {
    const { s: s0, ap, ids } = setup([trinket, saga, divination]);
    putOnBattlefield(s0, ap, jhoira);
    const hand = s0.players[ap]!.hand.length;
    let s = settle(cast(s0, ap, ids[0]!));
    s = settle(cast(s, ap, ids[1]!));
    expect(s.players[ap]!.hand.length).toBe(hand - 2 + 2);
    s = settle(cast(s, ap, ids[2]!));
    expect(s.players[ap]!.hand.length).toBe(hand - 3 + 2 + 2);
  });

  it("Raff Capashen: historic spells as though they had flash", () => {
    const { s: s0, ap, ids } = setup([trinket, divination]);
    putOnBattlefield(s0, ap, raff);
    let s = passUntil(s0, "beginCombat", ap);
    // Mana isn't in the pool yet, so the only problem left for the Trinket is paying for it.
    expect(castProblem(s, ap, ids[0]!)).toMatch(/^not enough mana/);
    expect(castProblem(s, ap, ids[1]!)).not.toMatch(/^not enough mana/);
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
  });

  it("Samwise Gamgee: three Foods return a historic card, not another one", () => {
    const { s: s0, ap } = setup([]);
    const sam = putOnBattlefield(s0, ap, samwise);
    const foods = [0, 1, 2].map(() => putOnBattlefield(s0, ap, food));
    const old = to(s0, ap, "graveyard", legend);
    const beast = to(s0, ap, "graveyard", plainBear);
    const spec = compileCard(samwise).activated[0]!.body.targets[0]!;
    const legal = legalTargets(s0, spec, ap).map((t) => (t.kind === "object" ? t.id : ""));
    expect(legal).toContain(old);
    expect(legal).not.toContain(beast);
    const s = settle(run(s0, planActivate(s0, ap, sam, 0, [target(old)], undefined, undefined, undefined, { sacrifice: foods })));
    expect(s.objects[old]!.zone).toBe("hand");
  });

  it("Arbaaz Mir: a nontoken historic permanent entering pings each opponent", () => {
    const { s: s0, ap, ids } = setup([trinket, plainBear]);
    putOnBattlefield(s0, ap, arbaaz);
    const opp = nextAfter(s0, ap);
    const life = s0.players[opp]!.life;
    let s = settle(cast(s0, ap, ids[0]!));
    expect(s.players[opp]!.life).toBe(life - 1);
    s = settle(cast(s, ap, ids[1]!));
    expect(s.players[opp]!.life).toBe(life - 1);
  });

  it("Syphon Mind: each other player discards a card, and you draw one for each", () => {
    const { s: s0, ap, ids } = setup([syphonMind]);
    const others = s0.turnOrder.filter((p) => p !== ap);
    for (const p of others) to(s0, p, "hand", bear());
    const hands = others.map((p) => s0.players[p]!.hand.length);
    const mine = s0.players[ap]!.hand.length;
    let s = cast(s0, ap, ids[0]!);
    for (let i = 0; i < 8 && s.pending?.kind === "discard"; i++) s = act(s, { type: "discard", player: s.pending.player, objectIds: s.players[s.pending.player]!.hand.slice(0, 1) });
    s = settle(s);
    others.forEach((p, i) => expect(s.players[p]!.hand.length).toBe(hands[i]! - 1));
    expect(s.players[ap]!.hand.length).toBe(mine - 1 + 3);
  });

  it("Wurmcoil Engine: dies into a deathtouch Wurm and a lifelink Wurm", () => {
    const { s: s0, ap, ids } = setup([card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." })]);
    putOnBattlefield(s0, ap, card("Swamp", "Basic Land — Swamp"));
    const w = putOnBattlefield(s0, ap, wurmcoil);
    const s = settle(cast(s0, ap, ids[0]!, [target(w)]));
    const wurms = s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap);
    expect(wurms).toHaveLength(2);
    expect(wurms.map((id) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`)).toEqual(["3/3", "3/3"]);
    expect(wurms.filter((id) => objHasKeyword(s, s.objects[id]!, "Deathtouch"))).toHaveLength(1);
    expect(wurms.filter((id) => objHasKeyword(s, s.objects[id]!, "Lifelink"))).toHaveLength(1);
  });

  it("Noxious Gearhulk: gain life equal to the destroyed creature's toughness as it last existed; nothing if it survives", () => {
    const { s: s0, ap, ids } = setup([gearhulk, gearhulk]);
    putOnBattlefield(s0, ap, card("Swamp", "Basic Land — Swamp"));
    putOnBattlefield(s0, ap, card("Swamp", "Basic Land — Swamp"));
    const opp = nextAfter(s0, ap);
    const g = putOnBattlefield(s0, opp, giant);
    s0.objects[g]!.counters["+1/+1"] = 2;
    const life = s0.players[ap]!.life;
    let s = cast(s0, ap, ids[0]!);
    s = settle(s);
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(g)] }));
    if (s.pending?.kind === "chooseMay") s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[g]!.zone).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(life + 5);
  });

  it("Mirror Entity: creatures you control become X/X and gain all creature types until end of turn", () => {
    const { s: s0, ap } = setup([]);
    const me = putOnBattlefield(s0, ap, mirrorEntity);
    const b = putOnBattlefield(s0, ap, bear());
    const s = settle(run(s0, planActivate(s0, ap, me, 0, undefined, undefined, undefined, 4)));
    expect(`${power(s, s.objects[b]!)}/${toughness(s, s.objects[b]!)}`).toBe("4/4");
    expect(characteristics(s, s.objects[b]!).allCreatureTypes).toBe(true);
  });

  it("Portal to Phyrexia: at your upkeep a creature card from a graveyard enters under your control as a Phyrexian", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, portal);
    const opp = nextAfter(s0, ap);
    const theirs = to(s0, opp, "graveyard", giant);
    let s = passUntil(s0, "upkeep", ap);
    for (let i = 0; i < 20 && s.objects[theirs]!.zone !== "battlefield"; i++) {
      const pend = s.pending;
      if (pend?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: pend.player, targets: [target(theirs)] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[theirs]!.controller).toBe(ap);
    expect(characteristics(s, s.objects[theirs]!).subtypes).toEqual(expect.arrayContaining(["Giant", "Phyrexian"]));
  });

  it("Destiny Spinner: your creature and enchantment spells can't be countered, other spells can", () => {
    const { s: s0, ap, ids, opp } = setup([ward, divination]);
    putOnBattlefield(s0, ap, spinner);
    for (let i = 0; i < 4; i++) putOnBattlefield(s0, opp, island);
    const c1 = to(s0, opp, "hand", counterspell);
    const c2 = to(s0, opp, "hand", counterspell);
    const toOpp = (x: GameState) => {
      for (let i = 0; i < 4 && waitingOn(x) !== opp; i++) x = act(x, { type: "passPriority", player: waitingOn(x)! });
      return x;
    };
    let s = toOpp(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(run(s, planCast(s, opp, c1, [{ kind: "stack", id: s.stack[0]!.id }])));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    s = toOpp(run(s, planCast(s, ap, ids[1]!)));
    s = settle(run(s, planCast(s, opp, c2, [{ kind: "stack", id: s.stack[0]!.id }])));
    expect(s.objects[ids[1]!]!.zone).toBe("graveyard");
  });

  it("Archon of Cruelty: the opponent sacrifices, discards and loses 3 life; you draw and gain 3", () => {
    const { s: s0, ap, ids } = setup([archon]);
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, ap, card("Swamp", "Basic Land — Swamp"));
    const opp = nextAfter(s0, ap);
    const b = putOnBattlefield(s0, opp, bear());
    to(s0, opp, "hand", giant);
    const [life, theirLife, theirHand, hand] = [s0.players[ap]!.life, s0.players[opp]!.life, s0.players[opp]!.hand.length, s0.players[ap]!.hand.length];
    let s = settle(cast(s0, ap, ids[0]!));
    for (let i = 0; i < 10 && s.pending; i++) {
      const pend = s.pending;
      if (pend.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: pend.player, targets: [{ kind: "player", id: opp }] });
      else if (pend.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: pend.player, ids: pend.options.slice(0, 1) });
      else if (pend.kind === "discard") s = act(s, { type: "discard", player: pend.player, objectIds: s.players[pend.player]!.hand.slice(0, 1) });
      else break;
      s = settle(s);
    }
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.players[opp]!.hand.length).toBe(theirHand - 1);
    expect(s.players[opp]!.life).toBe(theirLife - 3);
    expect(s.players[ap]!.life).toBe(life + 3);
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
  });

  it("Pest Infestation: X = 2 destroys up to two artifacts and makes four Pests", () => {
    const { s: s0, ap, ids } = setup([pests]);
    const opp = nextAfter(s0, ap);
    const arts = [putOnBattlefield(s0, opp, trinket), putOnBattlefield(s0, opp, ward)];
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, arts.map(target), undefined, "auto", 2)));
    for (const id of arts) expect(s.objects[id]!.zone).toBe("graveyard");
    expect(named(s, ap, "Pest Token")).toHaveLength(4);
  });
});
