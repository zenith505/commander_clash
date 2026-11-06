// Lane B round B125: Lichenthrope and Phytohydra (damage replaced by counters, CR 614.1a, ordered with prevention by
// their controller, CR 616.1), Emberwilde Djinn (pay {R}{R} or 2 life to gain control of it),
// Purgatory (the creature cards its trigger exiled, one returned at upkeep for {4} and 2 life).

import { describe, expect, it } from "vitest";
import { act, bear, card, mountain, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, controllerOf, moveObject, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type Step, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; questions of the players in `me` stop it, others the bots answer. */
const settle = (s: GameState, opts: { me?: PlayerId[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me?.includes(p.player)) return s;
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes priority, bots answering every question (no attacks or blocks), until `step` of `active`'s turn. */
const goTo = (s: GameState, step: Step, active: PlayerId) => {
  for (let i = 0; i < 3000 && !(s.step === step && s.activePlayer === active); i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: p.player, attacks: [] });
    else if (p) s = run(s, botActions(s, p.player));
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  if (!(s.step === step && s.activePlayer === active)) throw new Error(`never reached ${step}`);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ptOf = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const pool = (s: GameState, pid: PlayerId, mana: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  s.players[pid]!.manaPool = { ...s.players[pid]!.manaPool, ...mana };
};
const pick = (s: GameState, pid: PlayerId, label: RegExp) => {
  const p = s.pending;
  if (p?.kind !== "chooseOption" || p.player !== pid) throw new Error(`no choice for ${pid}: ${JSON.stringify(p)}`);
  const i = (p.labels ?? p.options).findIndex((l) => label.test(l));
  if (i < 0) throw new Error(`no option ${label}: ${JSON.stringify(p.labels ?? p.options)}`);
  return act(s, { type: "chooseOption", player: pid, choice: p.options[i]! });
};

// Real oracle text (Scryfall).
const lichen = (): CardDef => ({"oracleId":"ee7f698d-55c5-4a7a-803d-304febe6a758","name":"Lichenthrope","manaCost":"{3}{G}{G}","cmc":5,"typeLine":"Creature — Plant Fungus","supertypes":[],"types":["Creature"],"subtypes":["Plant","Fungus"],"oracleText":"If damage would be dealt to this creature, put that many -1/-1 counters on it instead.\nAt the beginning of your upkeep, remove a -1/-1 counter from this creature.","power":"5","toughness":"5","colors":["G"],"colorIdentity":["G"],"keywords":[],"artUrl":"https://cards.scryfall.io/art_crop/front/7/6/76f0c356-a81d-41d4-a8b7-8c159146a8b8.jpg?1783946982","commanderLegal":"legal","set":"vis","rarity":"rare","layout":"normal"}) as CardDef;
const phyto = (): CardDef => ({"oracleId":"4f5a7b65-b7f4-4bad-acfd-35edfb8f86a7","name":"Phytohydra","manaCost":"{2}{G}{W}{W}","cmc":5,"typeLine":"Creature — Plant Hydra","supertypes":[],"types":["Creature"],"subtypes":["Plant","Hydra"],"oracleText":"If damage would be dealt to this creature, put that many +1/+1 counters on it instead.","power":"1","toughness":"1","colors":["G","W"],"colorIdentity":["G","W"],"keywords":[],"artUrl":"https://cards.scryfall.io/art_crop/front/8/6/86c336d2-cc14-4b74-a6f9-aab7a084d0de.jpg?1783943615","commanderLegal":"legal","set":"rav","rarity":"rare","layout":"normal"}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","commanderLegal":"legal","set":"spm","rarity":"common","layout":"normal"}) as CardDef;
const djinn = (): CardDef => ({"oracleId":"3e1a7146-75d5-499f-8718-303bc6ea139b","name":"Emberwilde Djinn","manaCost":"{2}{R}{R}","cmc":4,"typeLine":"Creature — Djinn","supertypes":[],"types":["Creature"],"subtypes":["Djinn"],"oracleText":"Flying\nAt the beginning of each player's upkeep, that player may pay {R}{R} or 2 life. If the player does, they gain control of this creature.","power":"5","toughness":"4","colors":["R"],"colorIdentity":["R"],"keywords":["Flying"],"artUrl":"https://cards.scryfall.io/art_crop/front/c/9/c9e8c9f5-61dd-4dcc-bd40-8f366374ea18.jpg?1783947081","commanderLegal":"legal","set":"mir","rarity":"rare","layout":"normal"}) as CardDef;
const purg = (): CardDef => ({"oracleId":"2fb8e100-58a1-4dc6-bc38-ad7f115e3e46","name":"Purgatory","manaCost":"{2}{W}{B}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a nontoken creature is put into your graveyard from the battlefield, exile that card.\nAt the beginning of your upkeep, you may pay {4} and 2 life. If you do, return a card exiled with this enchantment to the battlefield.","colors":["B","W"],"colorIdentity":["B","W"],"keywords":[],"artUrl":"https://cards.scryfall.io/art_crop/front/9/e/9ed5e58b-46f3-437c-89ac-24235a65bd1f.jpg?1783947051","commanderLegal":"legal","set":"mir","rarity":"rare","layout":"normal"}) as CardDef;

describe("Lichenthrope and Phytohydra: damage replaced by counters", () => {
  it("compile", () => supported(lichen(), phyto()));

  it("Shock on Lichenthrope puts two -1/-1 counters on it and deals no damage", () => {
    const { s: s0, ap, ids } = setup([shock()]);
    const l = putOnBattlefield(s0, ap, lichen());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(l)])));
    expect(s.objects[l]!.counters["-1/-1"]).toBe(2);
    expect(s.objects[l]!.damage ?? 0).toBe(0);
    expect(ptOf(s, l)).toBe("3/3");
  });

  it("Shock on Phytohydra puts two +1/+1 counters on it instead", () => {
    const { s: s0, ap, ids } = setup([shock()]);
    const p = putOnBattlefield(s0, ap, phyto());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(p)])));
    expect(s.objects[p]!.counters["+1/+1"]).toBe(2);
    expect(s.objects[p]!.damage ?? 0).toBe(0);
    expect(ptOf(s, p)).toBe("3/3");
  });

  it("with a shield counter on Phytohydra, its controller chooses: counters first keeps the shield counter", () => {
    const { s: s0, ap, ids } = setup([shock(), shock()]);
    const p = putOnBattlefield(s0, ap, phyto());
    s0.objects[p]!.counters.shield = 1;
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(p)])), { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "damageShield" });
    expect((s.pending as { labels: string[] }).labels).toEqual(["Put the +1/+1 counters on it (Phytohydra)", "Prevent the damage"]);
    s = settle(pick(s, ap, /^Put the/), { me: [ap] });
    expect(s.objects[p]!.counters["+1/+1"]).toBe(2);
    expect(s.objects[p]!.counters.shield).toBe(1);
    // Preventing it first uses up the shield counter and puts no counters.
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(p)])), { me: [ap] });
    s = settle(pick(s, ap, /^Prevent/), { me: [ap] });
    expect(s.objects[p]!.counters["+1/+1"]).toBe(2);
    expect(s.objects[p]!.counters.shield ?? 0).toBe(0);
  });

  it("a bot's Lichenthrope with a shield counter has the damage prevented rather than take -1/-1 counters", () => {
    const { s: s0, ap, opp, ids } = setup([shock()]);
    const l = putOnBattlefield(s0, opp, lichen());
    s0.objects[l]!.counters.shield = 1;
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(l)])));
    expect(s.objects[l]!.counters["-1/-1"] ?? 0).toBe(0);
    expect(s.objects[l]!.counters.shield ?? 0).toBe(0);
    expect(ptOf(s, l)).toBe("5/5");
  });

  it("a deathtouch blocker's damage becomes a -1/-1 counter and destroys nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    const l = putOnBattlefield(s0, ap, lichen());
    const dt = putOnBattlefield(s0, opp, card("Deathtouch Rat", "Creature — Rat", "{B}", { power: "1", toughness: "1", oracleText: "Deathtouch", keywords: ["Deathtouch"] }));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: l, defender: opp }] });
    for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    while (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: s.pending.player === opp ? [{ blocker: dt, attacker: l }] : [] });
    s = settle(s);
    for (let i = 0; i < 50 && s.step !== "endCombat" && s.step !== "main2"; i++) s = s.pending ? settle(s) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[l]!.zone).toBe("battlefield");
    expect(s.objects[l]!.counters["-1/-1"]).toBe(1);
    expect(s.objects[dt]!.zone).toBe("graveyard");
  });
});

describe("Emberwilde Djinn: each upkeep, that player may pay {R}{R} or 2 life to gain control of it", () => {
  it("compile", () => supported(djinn()));

  it("the next player is asked at their upkeep and pays 2 life for it", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, ap, djinn());
    let s = settle(passUntil(s0, "upkeep", opp), { me: [opp] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "punisher" });
    expect((s.pending as { labels: string[] }).labels).toEqual(["Pay {R}{R}", "Pay 2 life", "Don't"]);
    s = settle(pick(s, opp, /^Pay 2 life/), { me: [opp] });
    expect(s.players[opp]!.life).toBe(38);
    expect(controllerOf(s, s.objects[d]!)).toBe(opp);
  });

  it("paying {R}{R} instead", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, ap, djinn());
    let s = settle(passUntil(s0, "upkeep", opp), { me: [opp] });
    pool(s, opp, { R: 2 });
    s = pick(s, opp, /^Pay \{R\}\{R\}/);
    expect(s.pending).toMatchObject({ kind: "payUnless", player: opp, cost: "{R}{R}" });
    s = act(s, { type: "payUnless", player: opp, pay: true });
    s = settle(s, { me: [opp] });
    expect(s.players[opp]!.life).toBe(40);
    expect(s.players[opp]!.manaPool.R ?? 0).toBe(0);
    expect(controllerOf(s, s.objects[d]!)).toBe(opp);
  });

  it("declining leaves it where it is; a bot opponent pays 2 life for it; its controller doesn't pay", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, ap, djinn());
    let s = settle(passUntil(s0, "upkeep", opp), { me: [opp] });
    s = settle(pick(s, opp, /^Don't/), { me: [opp] });
    expect(controllerOf(s, s.objects[d]!)).toBe(ap);
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const d1 = putOnBattlefield(s1, ap1, djinn());
    s = settle(passUntil(s1, "upkeep", opp1));
    expect(controllerOf(s, s.objects[d1]!)).toBe(opp1);
    expect(s.players[opp1]!.life).toBe(38);
    // At its new controller's next upkeep nothing changes hands (they already control it).
    s = passUntil(s, "draw", opp1);
    expect(controllerOf(s, s.objects[d1]!)).toBe(opp1);
  });
});

describe("Purgatory: dying nontoken creatures exiled, one returned at upkeep for {4} and 2 life", () => {
  it("compile", () => supported(purg()));

  it("its controller's creature that dies is exiled with it; at their upkeep they may pay {4} and 2 life to return it", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, purg());
    for (let i = 0; i < 4; i++) putOnBattlefield(s0, opp, mountain);
    const b = putOnBattlefield(s0, opp, bear());
    const tok = putOnBattlefield(s0, opp, bear({ name: "Bear Token" }));
    s0.objects[tok]!.isToken = true;
    moveObject(s0, b, "graveyard");
    moveObject(s0, tok, "graveyard");
    let s = settle(s0);
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.players[opp]!.exile).toContain(b);
    s = settle(passUntil(s, "upkeep", opp), { me: [opp] });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp });
    pool(s, opp, { C: 4 });
    s = act(s, { type: "chooseMay", player: opp, yes: true });
    s = settle(s, { me: [opp] });
    // The pick of which one (here the only one).
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: opp, cards: [b] });
    s = settle(act(s, { type: "searchLibrary", player: opp, found: [b] }), { me: [opp] });
    const back = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Grizzly Bears" && s.objects[id]!.owner === opp);
    expect(back).toBeTruthy();
    expect(controllerOf(s, s.objects[back!]!)).toBe(opp);
    expect(s.players[opp]!.life).toBe(38);
  });

  it("a bot pays to get its creature back; with nothing exiled it keeps its mana and life", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, purg());
    for (let i = 0; i < 4; i++) putOnBattlefield(s0, opp, mountain);
    const b = putOnBattlefield(s0, opp, bear());
    let s = goTo(s0, "draw", opp);
    expect(s.players[opp]!.life).toBe(40);
    moveObject(s, b, "graveyard");
    s = settle(s);
    expect(s.objects[b]!.zone).toBe("exile");
    s = goTo(goTo(s, "main1", ap), "draw", opp);
    expect(s.players[opp]!.life).toBe(38);
    expect(s.battlefield.some((id) => s.cards[s.objects[id]!.cardId]!.name === "Grizzly Bears" && controllerOf(s, s.objects[id]!) === opp)).toBe(true);
  });

  it("a creature that died before Purgatory was there, or one of another player's, isn't exiled", () => {
    const { s: s0, ap, opp } = setup([]);
    const mine = putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, opp, purg());
    moveObject(s0, mine, "graveyard");
    const s = settle(s0);
    expect(s.objects[mine]!.zone).toBe("graveyard");
  });
});
