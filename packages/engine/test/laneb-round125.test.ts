// Lane B round B125: Lichenthrope and Phytohydra (damage replaced by counters, CR 614.1a, ordered with prevention by
// their controller, CR 616.1), Emberwilde Djinn (pay {R}{R} or 2 life to gain control of it),
// Purgatory (the creature cards its trigger exiled, one returned at upkeep for {4} and 2 life), Jandor's Ring (discard
// the last card you drew this turn), Phyrexian Grimoire (an opponent picks which of your top two graveyard cards is exiled).

import { describe, expect, it } from "vitest";
import { act, bear, card, mountain, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, botActions, characteristics, controllerOf, draw, moveObject, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type Step, type TargetChoice } from "../src";

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
const ring = (): CardDef => ({"oracleId":"737db899-dcdb-48f9-8d30-cbbce3ae3434","name":"Jandor's Ring","manaCost":"{6}","cmc":6,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{2}, {T}, Discard the last card you drew this turn: Draw a card.","colors":[],"colorIdentity":[],"keywords":[],"artUrl":"https://cards.scryfall.io/art_crop/front/7/1/71504078-a16f-4dc4-9626-0ecc42b1e93b.jpg?1783948378","commanderLegal":"legal","set":"arn","rarity":"rare","layout":"normal"}) as CardDef;
const grimoire = (): CardDef => ({"oracleId":"090052a8-9e5b-4024-881f-5f8b65db7aa7","name":"Phyrexian Grimoire","manaCost":"{3}","cmc":3,"typeLine":"Artifact — Book","supertypes":[],"types":["Artifact"],"subtypes":["Book"],"oracleText":"{4}, {T}: Target opponent chooses one of the top two cards of your graveyard. Exile that card and put the other one into your hand.","colors":[],"colorIdentity":[],"keywords":[],"artUrl":"https://cards.scryfall.io/art_crop/front/2/f/2fcf5b8a-563b-48d7-a874-e9c226192320.jpg?1783946602","commanderLegal":"legal","set":"tmp","rarity":"rare","layout":"normal"}) as CardDef;
const shifter = (): CardDef => ({"oracleId":"82a6d89d-9215-4540-b7d5-26cdd6afb05b","name":"Shapeshifter","manaCost":"{6}","cmc":6,"typeLine":"Artifact Creature — Shapeshifter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Shapeshifter"],"oracleText":"As this creature enters, choose a number between 0 and 7.\nAt the beginning of your upkeep, you may choose a number between 0 and 7.\nShapeshifter's power is equal to the last chosen number and its toughness is equal to 7 minus that number.","power":"*","toughness":"7-*","colors":[],"colorIdentity":[],"keywords":[],"artUrl":"https://cards.scryfall.io/art_crop/front/c/c/cc278af4-b60d-41b7-b9d7-36c8aefca1a7.jpg?1783948358","commanderLegal":"legal","set":"atq","rarity":"rare","layout":"normal"}) as CardDef;
const halfdane = (): CardDef => ({"oracleId":"2ee13155-a3b8-4cad-8e68-5d2c5aba3bb4","name":"Halfdane","manaCost":"{1}{W}{U}{B}","cmc":4,"typeLine":"Legendary Creature — Shapeshifter","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"At the beginning of your upkeep, Halfdane's base power and toughness become equal to the power and toughness of target creature other than Halfdane until the end of your next upkeep.","power":"3","toughness":"3","colors":["B","U","W"],"colorIdentity":["B","U","W"],"keywords":[],"artUrl":"https://cards.scryfall.io/art_crop/front/2/e/2e939761-3542-4044-9038-d1d30c6a38fc.jpg?1783948039","commanderLegal":"legal","set":"leg","rarity":"rare","layout":"normal"}) as CardDef;
const glass = (): CardDef => ({"oracleId":"ca16b32c-3f1e-4f8d-821a-064f922c45d8","name":"Scrying Glass","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{3}, {T}: Choose a number greater than 0 and a color. Target opponent reveals their hand. If that opponent reveals exactly the chosen number of cards of the chosen color, you draw a card.","colors":[],"colorIdentity":[],"keywords":[],"artUrl":"https://cards.scryfall.io/art_crop/front/7/2/7286819f-6c57-4503-898c-528786ad86e9.jpg?1783946055","commanderLegal":"legal","set":"uds","rarity":"rare","layout":"normal"}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","rarity":"uncommon","layout":"normal"}) as CardDef;
const llanowar = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","rarity":"rare","layout":"normal"}) as CardDef;

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

describe("Jandor's Ring: discard the last card you drew this turn", () => {
  it("compile", () => supported(ring()));

  it("discards the last of the cards drawn this turn, then draws", () => {
    const { s, ap } = setup([]);
    const r = putOnBattlefield(s, ap, ring());
    s.players[ap]!.hand = [];
    draw(s, ap, 2);
    const [first, second] = s.players[ap]!.hand;
    pool(s, ap, { C: 2 });
    const after = settle(run(s, planActivate(s, ap, r, 0, [])));
    expect(after.objects[second!]!.zone).toBe("graveyard");
    expect(after.objects[first!]!.zone).toBe("hand");
    expect(after.players[ap]!.hand.length).toBe(2);
  });

  it("can't be activated once that card has left the hand, or for a card drawn in an earlier turn", () => {
    const { s, ap } = setup([]);
    const r = putOnBattlefield(s, ap, ring());
    s.players[ap]!.hand = [];
    draw(s, ap, 1);
    const drawn = s.players[ap]!.hand[0]!;
    pool(s, ap, { C: 2 });
    // Another card in hand that wasn't drawn can't be discarded for it.
    const other = putOnBattlefield(s, ap, bear());
    moveObject(s, other, "hand");
    expect(abilityProblem(s, ap, r, 0, [], undefined, undefined, undefined, { discard: [drawn] })).toBeNull();
    expect(abilityProblem(s, ap, r, 0, [], undefined, undefined, undefined, { discard: [other] })).toMatch(/not a card of your choice/);
    moveObject(s, drawn, "graveyard");
    expect(abilityProblem(s, ap, r, 0, [])).toMatch(/last card you drew this turn/);
    s.players[ap]!.lastDrawn = { turn: s.turn - 1, id: drawn, zc: s.objects[drawn]!.zoneChanges ?? 0 };
    expect(abilityProblem(s, ap, r, 0, [])).toMatch(/last card you drew this turn/);
  });

  it("a bot cycles a land it just drew once it has five lands", () => {
    const { s, ap } = setup([]);
    const r = putOnBattlefield(s, ap, ring());
    s.players[ap]!.hand = [];
    s.players[ap]!.command = [];
    s.players[ap]!.landsPlayedThisTurn = 1;
    draw(s, ap, 1);
    const drawn = s.players[ap]!.hand[0]!;
    expect(s.cards[s.objects[drawn]!.cardId]!.typeLine).toMatch(/Land/);
    let t = s;
    for (let i = 0; i < 400 && t.objects[drawn]!.zone === "hand" && t.step !== "end"; i++) {
      const p = t.pending;
      if (p?.kind === "declareAttackers") t = act(t, { type: "declareAttackers", player: p.player, attacks: [] });
      else if (p?.kind === "declareBlockers") t = act(t, { type: "declareBlockers", player: p.player, blocks: [] });
      else if (p) t = run(t, botActions(t, p.player));
      else t = run(t, botActions(t, waitingOn(t)!));
    }
    expect(t.objects[drawn]!.zone).toBe("graveyard");
    expect(t.objects[r]!.tapped).toBe(true);
  });
});

describe("Phyrexian Grimoire: the target opponent chooses which of your top two graveyard cards is exiled", () => {
  it("compile", () => supported(grimoire()));

  const yard = (s: GameState, pid: PlayerId, defs: CardDef[]) => defs.map((d) => {
    const id = putOnBattlefield(s, pid, d);
    moveObject(s, id, "graveyard");
    return id;
  });

  it("the opponent picks: that card is exiled, the other goes to your hand; older cards stay", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, grimoire());
    const [old, a, b] = yard(s0, ap, [bear({ name: "Old Bear" }), bear({ name: "Bear A" }), bear({ name: "Bear B" })]);
    pool(s0, ap, { C: 4 });
    let s = settle(run(s0, planActivate(s0, ap, g, 0, [{ kind: "player", id: opp }])), { me: [opp] });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: opp, min: 1, max: 1 });
    expect([...(s.pending as { cards: string[] }).cards].sort()).toEqual([a, b].sort());
    s = settle(act(s, { type: "searchLibrary", player: opp, found: [a!] }), { me: [opp] });
    expect(s.objects[a!]!.zone).toBe("exile");
    expect(s.objects[b!]!.zone).toBe("hand");
    expect(s.objects[old!]!.zone).toBe("graveyard");
  });

  it("a bot opponent exiles the better card", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, grimoire());
    const [land, big] = yard(s0, ap, [card("Plains", "Basic Land — Plains"), bear({ name: "Big Bear", manaCost: "{5}{G}{G}", cmc: 7, power: "7", toughness: "7" })]);
    pool(s0, ap, { C: 4 });
    const s = settle(run(s0, planActivate(s0, ap, g, 0, [{ kind: "player", id: opp }])));
    expect(s.objects[big!]!.zone).toBe("exile");
    expect(s.objects[land!]!.zone).toBe("hand");
  });

  it("with one card in the graveyard it's exiled and nothing goes to your hand", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, grimoire());
    const [only] = yard(s0, ap, [bear()]);
    const hand = s0.players[ap]!.hand.length;
    pool(s0, ap, { C: 4 });
    const s = settle(run(s0, planActivate(s0, ap, g, 0, [{ kind: "player", id: opp }])), { me: [opp] });
    expect(s.pending).toBeFalsy();
    expect(s.objects[only!]!.zone).toBe("exile");
    expect(s.players[ap]!.hand.length).toBe(hand);
  });
});

describe("Shapeshifter: power the last chosen number, toughness 7 minus it", () => {
  it("compile", () => supported(shifter()));

  it("the number chosen as it enters sets its power and toughness; off the battlefield it's 0/7", () => {
    const { s: s0, ap, ids } = setup([shifter()]);
    expect(ptOf(s0, ids[0]!)).toBe("0/7");
    pool(s0, ap, { C: 6 });
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [])), { me: [ap] });
    const p = s.pending;
    expect(p?.kind === "chooseOption" && p.what === "number" && p.numberRange).toEqual({ min: 0, max: 7 });
    s = act(s, { type: "chooseOption", player: ap, choice: "5" });
    s = settle(s);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(ptOf(s, ids[0]!)).toBe("5/2");
  });

  it("at its controller's upkeep a new number may be chosen; 7 makes it 7/0 and it dies", () => {
    const { s: s0, ap, ids } = setup([shifter()]);
    pool(s0, ap, { C: 6 });
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [])), { me: [ap] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "2" }));
    expect(ptOf(s, ids[0]!)).toBe("2/5");
    const next = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % s.turnOrder.length]!;
    s = goTo(s, "main1", next);
    expect(ptOf(s, ids[0]!)).toBe("2/5");
    // Ken's upkeep: the trigger asks.
    for (let i = 0; i < 3000 && !(s.pending?.kind === "chooseMay" && s.pending.player === ap); i++) {
      const q = s.pending;
      if (q?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: q.player, blocks: [] });
      else if (q?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: q.player, attacks: [] });
      else if (q) s = run(s, botActions(s, q.player));
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.activePlayer).toBe(ap);
    expect(s.step).toBe("upkeep");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { me: [ap] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "7" }));
    // 7/0: toughness 0: put into the graveyard (CR 704.5f), where it's 0/7 again.
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(ptOf(s, ids[0]!)).toBe("0/7");
  });

  it("returned to the battlefield it's a new object with a new number (CR 400.7)", () => {
    const { s: s0, ap, ids } = setup([shifter()]);
    pool(s0, ap, { C: 6 });
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [])), { me: [ap] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "6" }));
    expect(ptOf(s, ids[0]!)).toBe("6/1");
    moveObject(s, ids[0]!, "hand");
    invalidateCharacteristics(s);
    expect(ptOf(s, ids[0]!)).toBe("0/7");
  });

  it("a bot picks 4/3, or 3/4 facing a creature with 3 or more power", () => {
    const { s: s0, ap, ids } = setup([shifter()]);
    const bot = s0.turnOrder.find((x) => x !== ap)!;
    pool(s0, ap, { C: 6 });
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [])), { me: [ap] });
    let answer = botActions(s, ap)[0];
    expect(answer).toMatchObject({ type: "chooseOption", choice: "4" });
    putOnBattlefield(s, bot, bear());
    putOnBattlefield(s, bot, { ...bear(), name: "Big Bear", power: "3", oracleId: "big-bear" });
    invalidateCharacteristics(s);
    answer = botActions(s, ap)[0];
    expect(answer).toMatchObject({ type: "chooseOption", choice: "3" });
  });
});

describe("Halfdane: base power and toughness of another creature until the end of your next upkeep", () => {
  it("compile", () => supported(halfdane()));
  const bigBear = (): CardDef => ({ ...bear(), name: "Big Bear", oracleId: "big-bear", power: "5", toughness: "4" });
  /** Passes (bots answering, no attacks) until `pid` is asked a question; their target choices are what it waits for. */
  const untilAsked = (s: GameState, pid: PlayerId) => {
    for (let i = 0; i < 3000; i++) {
      const q = s.pending;
      if (q?.player === pid && q.kind === "chooseTargets") return s;
      if (q?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: q.player, blocks: [] });
      else if (q?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: q.player, attacks: [] });
      else if (q) s = run(s, botActions(s, q.player));
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    throw new Error("never asked");
  };

  it("copies the target's power and toughness as it resolves, until the end of the next upkeep, which a new copy outlasts", () => {
    const { s: s0, ap } = setup([]);
    const opp = s0.turnOrder.find((x) => x !== ap)!;
    const h = putOnBattlefield(s0, ap, halfdane());
    const big = putOnBattlefield(s0, opp, bigBear());
    const small = putOnBattlefield(s0, opp, bear());
    let s = untilAsked(s0, ap);
    expect(s.activePlayer).toBe(ap);
    expect(s.step).toBe("upkeep");
    expect(ptOf(s, h)).toBe("3/3");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(big)] }), { me: [ap] });
    expect(ptOf(s, h)).toBe("5/4");
    // Locked in as it resolved (CR 608.2h): a counter on the Big Bear later doesn't change it.
    s.objects[big]!.counters["+1/+1"] = 2;
    invalidateCharacteristics(s);
    expect(ptOf(s, h)).toBe("5/4");
    s = goTo(s, "draw", ap);
    expect(ptOf(s, h)).toBe("5/4");
    // Through the other players' turns, to the next upkeep: the new copy is the newer effect (CR 613.7).
    s = untilAsked(s, ap);
    expect(s.step).toBe("upkeep");
    expect(ptOf(s, h)).toBe("5/4");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(small)] }), { me: [ap] });
    expect(ptOf(s, h)).toBe("2/2");
    s = goTo(s, "draw", ap);
    expect(ptOf(s, h)).toBe("2/2");
  });

  it("with no other creature at the next upkeep, the last copy lasts through that upkeep, then it's 3/3 (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const opp = s0.turnOrder.find((x) => x !== ap)!;
    const h = putOnBattlefield(s0, ap, halfdane());
    const big = putOnBattlefield(s0, opp, bigBear());
    let s = untilAsked(s0, ap);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(big)] }), { me: [ap] });
    expect(ptOf(s, h)).toBe("5/4");
    moveObject(s, big, "graveyard");
    invalidateCharacteristics(s);
    const next = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % s.turnOrder.length]!;
    s = goTo(s, "main1", next);
    s = goTo(s, "upkeep", ap);
    expect(s.stack.length).toBe(0);
    expect(ptOf(s, h)).toBe("5/4");
    s = goTo(s, "draw", ap);
    expect(ptOf(s, h)).toBe("3/3");
  });

  it("a bot copies the biggest creature", () => {
    const { s: s0, ap } = setup([]);
    const bot = s0.turnOrder.find((x) => x !== ap)!;
    const h = putOnBattlefield(s0, bot, halfdane());
    const big = putOnBattlefield(s0, ap, bigBear());
    putOnBattlefield(s0, bot, bear());
    let s = untilAsked(s0, bot);
    const answer = botActions(s, bot)[0];
    expect(answer).toMatchObject({ type: "chooseTargets", targets: [tgt(big)] });
    s = settle(act(s, answer!));
    expect(ptOf(s, h)).toBe("5/4");
  });
});

describe("Scrying Glass: a number and a color; draw if the target opponent's hand has exactly that many of that color", () => {
  it("compile", () => supported(glass()));
  /** The opponent's hand: the cards given, and nothing else. */
  const handOf = (s: GameState, pid: PlayerId, defs: CardDef[]) => {
    for (const id of [...s.players[pid]!.hand]) moveObject(s, id, "library");
    return defs.map((d) => {
      const id = putOnBattlefield(s, pid, d);
      moveObject(s, id, "hand");
      return id;
    });
  };
  const use = (s0: GameState, ap: PlayerId, opp: PlayerId, n: string, color: string) => {
    const g = putOnBattlefield(s0, ap, glass());
    pool(s0, ap, { C: 3 });
    let s = settle(run(s0, planActivate(s0, ap, g, 0, [{ kind: "player", id: opp }])), { me: [ap] });
    const p = s.pending;
    if (p?.kind !== "chooseOption" || p.what !== "number") throw new Error(JSON.stringify(p));
    const range = p.numberRange;
    s = settle(act(s, { type: "chooseOption", player: ap, choice: n }), { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "color" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: color }));
    return { s, range };
  };

  it("exactly two red cards of three: choosing 2 and red draws a card, offered 1 to 3", () => {
    const { s: s0, ap, opp } = setup([]);
    handOf(s0, opp, [bolt(), bolt(), llanowar()]);
    const before = s0.players[ap]!.hand.length;
    const { s, range } = use(s0, ap, opp, "2", "Red");
    expect(range).toEqual({ min: 1, max: 3 });
    expect(s.players[ap]!.hand.length).toBe(before + 1);
  });

  it("not exactly: 1 and red, or 2 and green, draws nothing", () => {
    for (const [n, color] of [["1", "Red"], ["2", "Green"]] as const) {
      const { s: s0, ap, opp } = setup([]);
      handOf(s0, opp, [bolt(), bolt(), llanowar()]);
      const before = s0.players[ap]!.hand.length;
      const { s } = use(s0, ap, opp, n, color);
      expect(s.players[ap]!.hand.length).toBe(before);
    }
  });

  it("an empty hand: only 1 is offered, and nothing is drawn", () => {
    const { s: s0, ap, opp } = setup([]);
    handOf(s0, opp, []);
    const before = s0.players[ap]!.hand.length;
    const { s, range } = use(s0, ap, opp, "1", "Blue");
    expect(range).toEqual({ min: 1, max: 1 });
    expect(s.players[ap]!.hand.length).toBe(before);
  });

  it("a bot chooses 1 and the color the opponent has shown most", () => {
    const { s: s0, ap, opp } = setup([]);
    handOf(s0, opp, [bolt()]);
    putOnBattlefield(s0, opp, llanowar());
    putOnBattlefield(s0, opp, llanowar());
    const g = putOnBattlefield(s0, ap, glass());
    pool(s0, ap, { C: 3 });
    let s = settle(run(s0, planActivate(s0, ap, g, 0, [{ kind: "player", id: opp }])), { me: [ap] });
    const num = botActions(s, ap)[0]!;
    expect(num).toMatchObject({ type: "chooseOption", choice: "1" });
    s = act(s, num);
    expect(botActions(s, ap)[0]).toMatchObject({ type: "chooseOption", choice: "Green" });
  });
});
