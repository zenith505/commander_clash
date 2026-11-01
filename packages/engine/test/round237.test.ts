// Round 237: cards from the top of the popularity list. Twists and Turns ("instead you scry 1, then that creature
// explores"); Zabaz, the Glimmerwasp ("If a modular triggered ability would put one or more +1/+1 counters"); Obosh, the
// Preypiercer ("a source you control with an odd mana value"); Zimone, All-Questioning ("you control a prime number of
// lands"); Asmoranomardicadaistinaculdacar ("As long as you've discarded a card this turn, you may pay {B/R} to cast" and
// "Target creature deals 6 damage to itself"); Flourishing Bloom-Kin ("search ... up to two Forest cards and reveal them.
// Put one of them onto the battlefield tapped and the other into your hand"); Call to the Kindred ("a creature card that
// shares a creature type with enchanted creature"); Niv-Mizzet, Guildpact ("different color pairs among permanents you
// control", X checked once); Wernog, Rider's Chaplain ("each opponent may investigate ... one plus the number of opponents
// who investigated this way"); Web of Inertia and Jace, Multiverse Architect ("creatures they control can't attack you /
// Jaces you control this turn").

import { describe, expect, it } from "vitest";
import { act, bear, card, forest as forestCard, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, planTurnFaceUp, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";
import { attackProblem, destroyPermanent } from "../src/game";
import { discardCards } from "../src/effects/run-library";
import { closeZoneBatch } from "../src/effects";
import { dealDamage, objectSource } from "../src/damage";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Everyone passes until the stack is empty, answering "you may" with `may`; other players' questions as the bots would. Stops at any other question of `me`'s. */
const settle = (s: GameState, opts: { may?: boolean; targets?: TargetChoice[]; me?: PlayerId } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me !== undefined && p.player !== opts.me) s = act(s, botActions(s, p.player)[0]!);
    else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.may ?? true });
    else if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets ?? [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Taps everything a player controls, then gives them exactly this mana. */
const poolOnly = (s: GameState, pid: PlayerId, mana: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  for (const id of s.battlefield) if (s.objects[id]!.controller === pid) s.objects[id]!.tapped = true;
  Object.assign(s.players[pid]!.manaPool, mana);
};
const tokensNamed = (s: GameState, name: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).name === name);

// Real oracle text (Scryfall).
const twists = (): CardDef => ({"oracleId":"740aa9d9-91a9-431e-8bf9-1344e5273e27","name":"Twists and Turns // Mycoid Maze","manaCost":"{G}","cmc":1,"typeLine":"Enchantment // Land — Cave","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"If a creature you control would explore, instead you scry 1, then that creature explores.\nWhen this enchantment enters, target creature you control explores.\nWhen a land you control enters, if you control seven or more lands, transform this enchantment.","colors":["G"],"colorIdentity":["G"],"keywords":["Transform","Explore","Scry"],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/3/c/3cdf691e-96a5-45c7-9b94-6f04af81c8e4.jpg?1783913741","artUrl":"https://cards.scryfall.io/art_crop/front/3/c/3cdf691e-96a5-45c7-9b94-6f04af81c8e4.jpg?1783913741","commanderLegal":"legal","set":"lci","releasedAt":"2023-11-17","rarity":"uncommon","layout":"transform","gameChanger":false,"faces":[{"name":"Twists and Turns","manaCost":"{G}","typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"If a creature you control would explore, instead you scry 1, then that creature explores.\nWhen this enchantment enters, target creature you control explores.\nWhen a land you control enters, if you control seven or more lands, transform this enchantment.","colors":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/3/c/3cdf691e-96a5-45c7-9b94-6f04af81c8e4.jpg?1783913741","artUrl":"https://cards.scryfall.io/art_crop/front/3/c/3cdf691e-96a5-45c7-9b94-6f04af81c8e4.jpg?1783913741"},{"name":"Mycoid Maze","manaCost":"","typeLine":"Land — Cave","supertypes":[],"types":["Land"],"subtypes":["Cave"],"oracleText":"(Transforms from Twists and Turns.)\n{T}: Add {G}.\n{3}{G}, {T}: Look at the top four cards of your library. You may reveal a creature card from among them and put that card into your hand. Put the rest on the bottom of your library in a random order.","colors":[],"imageUrl":"https://cards.scryfall.io/normal/back/3/c/3cdf691e-96a5-45c7-9b94-6f04af81c8e4.jpg?1783913741","artUrl":"https://cards.scryfall.io/art_crop/back/3/c/3cdf691e-96a5-45c7-9b94-6f04af81c8e4.jpg?1783913741"}]}) as CardDef;
const zabaz = (): CardDef => ({"oracleId":"549dc9f3-1fda-4ad3-87bc-8a990800380b","name":"Zabaz, the Glimmerwasp","manaCost":"{1}","cmc":1,"typeLine":"Legendary Artifact Creature — Insect","supertypes":["Legendary"],"types":["Artifact","Creature"],"subtypes":["Insect"],"oracleText":"Modular 1\nIf a modular triggered ability would put one or more +1/+1 counters on a creature you control, that many plus one +1/+1 counters are put on it instead.\n{R}: Destroy target artifact you control.\n{W}: Zabaz gains flying until end of turn.","power":"0","toughness":"0","colors":[],"colorIdentity":["R","W"],"keywords":["Modular"],"imageUrl":"https://cards.scryfall.io/normal/front/8/c/8c1cce91-7c81-45d9-bbec-b085e794791d.jpg?1783926799","artUrl":"https://cards.scryfall.io/art_crop/front/8/c/8c1cce91-7c81-45d9-bbec-b085e794791d.jpg?1783926799","commanderLegal":"legal","set":"mh2","releasedAt":"2021-06-18","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const obosh = (): CardDef => ({"oracleId":"6985c8a9-9299-461b-8bef-bd2b2c739c11","name":"Obosh, the Preypiercer","manaCost":"{3}{B/R}{B/R}","cmc":5,"typeLine":"Legendary Creature — Hellion Horror","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Hellion","Horror"],"oracleText":"Companion — Your starting deck contains only cards with odd mana values and land cards. (If this card is your chosen companion, you may put it into your hand from outside the game for {3} as a sorcery.)\nIf a source you control with an odd mana value would deal damage to a permanent or player, it deals double that damage to that permanent or player instead.","power":"3","toughness":"5","colors":["B","R"],"colorIdentity":["B","R"],"keywords":["Companion","Double"],"imageUrl":"https://cards.scryfall.io/normal/front/4/5/451507de-9c42-43ee-b9ba-1f69e9aa29d2.jpg?1783931009","artUrl":"https://cards.scryfall.io/art_crop/front/4/5/451507de-9c42-43ee-b9ba-1f69e9aa29d2.jpg?1783931009","commanderLegal":"legal","set":"iko","releasedAt":"2020-04-24","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const zimone = (): CardDef => ({"oracleId":"6c044dd1-8938-4d62-a7b2-e2298de08f70","name":"Zimone, All-Questioning","manaCost":"{1}{G}{U}","cmc":3,"typeLine":"Legendary Creature — Human Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"At the beginning of your end step, if a land entered the battlefield under your control this turn and you control a prime number of lands, create Primo, the Indivisible, a legendary 0/0 green and blue Fractal creature token, then put that many +1/+1 counters on it. (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, and 31 are prime numbers.)","power":"1","toughness":"1","colors":["G","U"],"colorIdentity":["G","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/7/7722f4f7-fe38-4107-a715-7b27b6a4e341.jpg?1783909434","artUrl":"https://cards.scryfall.io/art_crop/front/7/7/7722f4f7-fe38-4107-a715-7b27b6a4e341.jpg?1783909434","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const asmor = (): CardDef => ({"oracleId":"1f74e26f-5cf3-4b0e-bcc6-f858599474fc","name":"Asmoranomardicadaistinaculdacar","manaCost":"","cmc":0,"typeLine":"Legendary Creature — Human Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"As long as you've discarded a card this turn, you may pay {B/R} to cast this spell.\nWhen Asmoranomardicadaistinaculdacar enters, you may search your library for a card named The Underworld Cookbook, reveal it, put it into your hand, then shuffle.\nSacrifice two Foods: Target creature deals 6 damage to itself.","power":"3","toughness":"3","colors":["B","R"],"colorIdentity":["B","R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/9/d99a9a7d-d9ca-4c11-80ab-e39d5943a315.jpg?1783926821","artUrl":"https://cards.scryfall.io/art_crop/front/d/9/d99a9a7d-d9ca-4c11-80ab-e39d5943a315.jpg?1783926821","commanderLegal":"legal","set":"mh2","releasedAt":"2021-06-18","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bloomkin = (): CardDef => ({"oracleId":"66e74e8f-036e-4b26-a4a8-2365891765bc","name":"Flourishing Bloom-Kin","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Plant Elemental","supertypes":[],"types":["Creature"],"subtypes":["Plant","Elemental"],"oracleText":"This creature gets +1/+1 for each Forest you control.\nDisguise {4}{G}\nWhen this creature is turned face up, search your library for up to two Forest cards and reveal them. Put one of them onto the battlefield tapped and the other into your hand, then shuffle.","power":"0","toughness":"0","colors":["G"],"colorIdentity":["G"],"keywords":["Disguise"],"imageUrl":"https://cards.scryfall.io/normal/front/5/d/5ddcb31e-9301-44f1-b138-0573fbf56a47.jpg?1783912867","artUrl":"https://cards.scryfall.io/art_crop/front/5/d/5ddcb31e-9301-44f1-b138-0573fbf56a47.jpg?1783912867","commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const kindred = (): CardDef => ({"oracleId":"c2fb8d4c-b973-42a0-9e9c-7abd5cc2c22e","name":"Call to the Kindred","manaCost":"{3}{U}","cmc":4,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nAt the beginning of your upkeep, you may look at the top five cards of your library. If you do, you may put a creature card that shares a creature type with enchanted creature from among them onto the battlefield, then you put the rest of those cards on the bottom of your library in any order.","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee35f96c-6060-4456-897e-27b74c8c2137.jpg?1783940846","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee35f96c-6060-4456-897e-27b74c8c2137.jpg?1783940846","commanderLegal":"legal","set":"dka","releasedAt":"2012-02-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const niv = (): CardDef => ({"oracleId":"46570366-5e58-40b7-b725-833321a3b7b1","name":"Niv-Mizzet, Guildpact","manaCost":"{W}{U}{B}{R}{G}","cmc":5,"typeLine":"Legendary Creature — Dragon Avatar","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Dragon","Avatar"],"oracleText":"Flying, hexproof from multicolored\nWhenever Niv-Mizzet deals combat damage to a player, it deals X damage to any target, target player draws X cards, and you gain X life, where X is the number of different color pairs among permanents you control that are exactly two colors.","power":"6","toughness":"6","colors":["B","G","R","U","W"],"colorIdentity":["B","G","R","U","W"],"keywords":["Flying","Hexproof from","Hexproof"],"imageUrl":"https://cards.scryfall.io/normal/front/0/2/02f2fcaf-97d6-441a-bdde-fb105ffad1c5.jpg?1783912785","artUrl":"https://cards.scryfall.io/art_crop/front/0/2/02f2fcaf-97d6-441a-bdde-fb105ffad1c5.jpg?1783912785","commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const wernog = (): CardDef => ({"oracleId":"6cd03270-54cc-43e1-9b86-70c76960c841","name":"Wernog, Rider's Chaplain","manaCost":"{W}{B}","cmc":2,"typeLine":"Legendary Creature — Human","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human"],"oracleText":"When Wernog, Rider's Chaplain enters or leaves the battlefield, each opponent may investigate. Each opponent who doesn't loses 1 life. You investigate X times, where X is one plus the number of opponents who investigated this way.\nPartner—Friends forever (You can have two commanders if both have this ability.)","power":"1","toughness":"2","colors":["B","W"],"colorIdentity":["B","W"],"keywords":["Investigate","Partner"],"imageUrl":"https://cards.scryfall.io/normal/front/3/9/39491011-bdf6-4e61-8534-fe26c1571f8f.jpg?1783923608","artUrl":"https://cards.scryfall.io/art_crop/front/3/9/39491011-bdf6-4e61-8534-fe26c1571f8f.jpg?1783923608","commanderLegal":"legal","set":"slx","releasedAt":"2022-03-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const web = (): CardDef => ({"oracleId":"a96d24f1-7670-4cb2-9971-5dd1b4c67957","name":"Web of Inertia","manaCost":"{2}{U}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of combat on each opponent's turn, that player may exile a card from their graveyard. If the player doesn't, creatures they control can't attack you this turn.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/e/0e6d2721-1dfc-4f4f-a914-9352ca6981c0.jpg?1783945126","artUrl":"https://cards.scryfall.io/art_crop/front/0/e/0e6d2721-1dfc-4f4f-a914-9352ca6981c0.jpg?1783945126","commanderLegal":"legal","set":"jud","releasedAt":"2002-05-27","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const jace = (): CardDef => ({"oracleId":"3321c134-bf5b-4f63-8035-fca0bbdfa86b","name":"Jace, Multiverse Architect","manaCost":"{1}{W}{U}{B}{R}","cmc":5,"typeLine":"Legendary Planeswalker — Jace","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Jace"],"oracleText":"At the beginning of combat on each opponent's turn, they may pay {2}. If they don't, creatures they control can't attack Jaces you control this turn.\n+1: Draw two cards, then put a card from your hand on the bottom of your library.\n−3: Exile another target planeswalker or creature you control. Reveal cards from the top of your library until you reveal a creature or planeswalker card. Put that card onto the battlefield and the rest on the bottom of your library in a random order.\nJace, Multiverse Architect can be your commander.","loyalty":"4","colors":["B","R","U","W"],"colorIdentity":["B","R","U","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/5/55cd03d9-2535-4cf3-a8b2-1418e1190f4a.jpg?1789644316","artUrl":"https://cards.scryfall.io/art_crop/front/5/5/55cd03d9-2535-4cf3-a8b2-1418e1190f4a.jpg?1789644316","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;

const scout = () => card("Test Scout", "Sorcery", "{G}", { cmc: 1, oracleText: "Target creature you control explores." });

describe("round 237: Twists and Turns", () => {
  it("is supported", () => supported(twists()));

  it("you scry 1, then the creature explores (the card scried away isn't revealed)", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, twists());
    const b = putOnBattlefield(s, ap, bear());
    const land = into(s, ap, forestCard, "library");
    const top = into(s, ap, bear({ name: "Test Top Bear" }), "library");
    s = settle(run(s, planCast(s, ap, into(s, ap, scout(), "hand"), [tgt(b)])));
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: ap, how: "scry", cards: [top] });
    s = settle(act(s, { type: "arrangeTop", player: ap, top: [], away: [top] }));
    expect(s.objects[land]!.zone).toBe("hand");
    expect(s.players[ap]!.library.at(-1)).toBe(top);
    expect(s.objects[b]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("two of them: scry 1 twice, then it explores once", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, twists());
    putOnBattlefield(s, ap, twists());
    const b = putOnBattlefield(s, ap, bear());
    const top = into(s, ap, bear({ name: "Test Top Bear" }), "library");
    s = settle(run(s, planCast(s, ap, into(s, ap, scout(), "hand"), [tgt(b)])));
    expect(s.pending).toMatchObject({ kind: "arrangeTop", how: "scry", cards: [top] });
    s = settle(act(s, { type: "arrangeTop", player: ap, top: [top], away: [] }));
    expect(s.pending).toMatchObject({ kind: "arrangeTop", how: "scry", cards: [top] });
    s = settle(act(s, { type: "arrangeTop", player: ap, top: [top], away: [] }), { may: false });
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
    expect(s.players[ap]!.library[0]).toBe(top);
  });
});

describe("round 237: Zabaz, the Glimmerwasp", () => {
  it("is supported", () => supported(zabaz()));

  const modular = () => card("Test Modular", "Artifact Creature — Construct", "{2}", { cmc: 2, power: "0", toughness: "0", oracleText: "Modular 2" });

  it("a modular trigger puts one more +1/+1 counter on a creature you control", () => {
    let { s, ap } = setup([]);
    const z = putOnBattlefield(s, ap, zabaz());
    s.objects[z]!.counters["+1/+1"] = 1;
    const m = putOnBattlefield(s, ap, modular());
    s.objects[m]!.counters["+1/+1"] = 2;
    const t = putOnBattlefield(s, ap, card("Test Golem", "Artifact Creature — Golem", "{3}", { cmc: 3, power: "3", toughness: "3" }));
    invalidateCharacteristics(s);
    destroyPermanent(s, s.objects[m]!, "Test destroys it.");
    s = settle(s, { targets: [tgt(t)] });
    expect(s.objects[t]!.counters["+1/+1"]).toBe(3);
  });

  it("not its own modular: it's gone by then (rulings)", () => {
    let { s, ap } = setup([]);
    const z = putOnBattlefield(s, ap, zabaz());
    s.objects[z]!.counters["+1/+1"] = 2;
    const t = putOnBattlefield(s, ap, card("Test Golem", "Artifact Creature — Golem", "{3}", { cmc: 3, power: "3", toughness: "3" }));
    invalidateCharacteristics(s);
    destroyPermanent(s, s.objects[z]!, "Test destroys it.");
    s = settle(s, { targets: [tgt(t)] });
    expect(s.objects[t]!.counters["+1/+1"]).toBe(2);
  });
});

describe("round 237: Obosh, the Preypiercer", () => {
  it("is supported", () => supported(obosh()));

  const bolt = (name: string, cost: string, cmc: number) => card(name, "Instant", cost, { cmc, oracleText: "~ deals 2 damage to any target." });

  it("doubles the damage of your sources with an odd mana value, not even ones", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, obosh());
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, into(s, ap, bolt("Test Odd Bolt", "{R}", 1), "hand"), [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(life - 4);
    s = settle(run(s, planCast(s, ap, into(s, ap, bolt("Test Even Bolt", "{1}{R}", 2), "hand"), [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(life - 6);
  });

  it("a spell's X counts in its mana value; an opponent's odd source isn't yours", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, obosh());
    const x = card("Test X Bolt", "Instant", "{X}{R}", { cmc: 1, oracleText: "~ deals X damage to any target." });
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, into(s, ap, x, "hand"), [{ kind: "player", id: opp }], undefined, "auto", 2)));
    expect(s.players[opp]!.life).toBe(life - 4); // mana value 3: odd, doubled
    const theirs = putOnBattlefield(s, opp, card("Test Pinger", "Creature — Goblin", "{R}", { cmc: 1, power: "1", toughness: "1" }));
    const mine = s.players[ap]!.life;
    dealDamage(s, objectSource(s, s.objects[theirs]!), { player: ap }, 1);
    expect(s.players[ap]!.life).toBe(mine - 1);
  });
});

describe("round 237: Zimone, All-Questioning", () => {
  it("is supported", () => supported(zimone()));

  /** Play `n` more lands from the hand this turn (one land play allowed, so the others just go there). */
  const playLand = (s: GameState, ap: PlayerId) => {
    const id = into(s, ap, card("Test Wastes", "Land", "", {}), "hand");
    return act(s, { type: "playLand", player: ap, objectId: id });
  };

  it("with a land entered this turn and a prime number of lands: Primo with that many +1/+1 counters", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, zimone());
    putOnBattlefield(s, ap, card("Test Wastes", "Land", "", {}));
    putOnBattlefield(s, ap, card("Test Wastes", "Land", "", {}));
    s = playLand(s, ap); // 17 lands
    s = settle(passUntil(s, "end", ap));
    const primo = tokensNamed(s, "Primo, the Indivisible");
    expect(primo).toHaveLength(1);
    const c = characteristics(s, s.objects[primo[0]!]!);
    expect(c.supertypes).toContain("Legendary");
    expect(s.objects[primo[0]!]!.counters["+1/+1"]).toBe(17);
  });

  it("not with a number of lands that isn't prime, nor without a land entering this turn", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, zimone());
    s = playLand(s, ap); // 15 lands
    s = settle(passUntil(s, "end", ap));
    expect(tokensNamed(s, "Primo, the Indivisible")).toHaveLength(0);
    let t = setup([]);
    putOnBattlefield(t.s, t.ap, zimone());
    for (let i = 0; i < 3; i++) putOnBattlefield(t.s, t.ap, card("Test Wastes", "Land", "", {})); // 17, none entered this turn
    t.s = settle(passUntil(t.s, "end", t.ap));
    expect(tokensNamed(t.s, "Primo, the Indivisible")).toHaveLength(0);
  });
});

describe("round 237: Asmoranomardicadaistinaculdacar", () => {
  it("is supported", () => supported(asmor()));

  it("castable only for {B/R} once you've discarded a card this turn", () => {
    let { s, ap } = setup([]);
    const id = into(s, ap, asmor(), "hand");
    expect(planCast(s, ap, id, [], undefined, "auto", undefined, { alt: "alternative" })).toBeNull();
    discardCards(s, ap, [into(s, ap, bear(), "hand")]);
    closeZoneBatch(s);
    poolOnly(s, ap, { B: 1 });
    s = settle(run(s, planCast(s, ap, id, [], undefined, "auto", undefined, { alt: "alternative" })), { may: false });
    expect(s.objects[id]!.zone).toBe("battlefield");
  });

  it("Sacrifice two Foods: the target creature deals 6 damage to itself (its lifelink gains its controller life)", () => {
    let { s, ap, opp } = setup([]);
    const a = putOnBattlefield(s, ap, asmor());
    const food = () => card("Food", "Artifact — Food", "", { oracleText: "{2}, {T}, Sacrifice this artifact: You gain 3 life." });
    const f1 = putOnBattlefield(s, ap, food());
    const f2 = putOnBattlefield(s, ap, food());
    const big = putOnBattlefield(s, opp, card("Test Lifelinker", "Creature — Cleric", "{3}{W}", { cmc: 4, power: "2", toughness: "8", oracleText: "Lifelink", keywords: ["Lifelink"] }));
    const life = s.players[opp]!.life;
    s = settle(run(s, planActivate(s, ap, a, 0, [tgt(big)], undefined, undefined, undefined, { sacrifice: [f1, f2] })));
    expect(s.objects[f1]!.zone).not.toBe("battlefield");
    expect(s.objects[f2]!.zone).not.toBe("battlefield");
    expect(s.objects[big]!.damage).toBe(6);
    expect(s.players[opp]!.life).toBe(life + 6);
  });
});

describe("round 237: Flourishing Bloom-Kin", () => {
  it("is supported", () => supported(bloomkin()));

  it("turned face up: two Forest cards, one onto the battlefield tapped and the other into your hand", () => {
    let { s, ap } = setup([]);
    const id = into(s, ap, bloomkin(), "hand");
    const f1 = into(s, ap, card("Test Forest One", "Basic Land — Forest", ""), "library");
    const f2 = into(s, ap, card("Test Forest Two", "Basic Land — Forest", ""), "library");
    s = settle(run(s, planCast(s, ap, id, undefined, undefined, "auto", undefined, { faceDown: true })));
    for (const l of s.battlefield) if (s.objects[l]!.controller === ap) s.objects[l]!.tapped = false;
    s = run(s, planTurnFaceUp(s, ap, id));
    for (let i = 0; i < 20 && (s.stack.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: ap, found: p.cards.filter((c) => c === f1 || c === f2).slice(0, p.max) });
      else if (p) s = act(s, botActions(s, p.player)[0]!);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    const zones = [f1, f2].map((x) => s.objects[x]!.zone).sort();
    expect(zones).toEqual(["battlefield", "hand"]);
    const onField = [f1, f2].find((x) => s.objects[x]!.zone === "battlefield")!;
    expect(s.objects[onField]!.tapped).toBe(true);
  });
});

describe("round 237: Call to the Kindred", () => {
  it("is supported", () => supported(kindred()));

  const nextUpkeep = (s: GameState, ap: PlayerId) => passUntil(passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!), "upkeep", ap);

  it("may look at the top five; only a creature card sharing a creature type with the enchanted creature can be put onto the battlefield", () => {
    let { s, ap } = setup([]);
    s.players[ap]!.hand = [];
    const elf = putOnBattlefield(s, ap, card("Test Elf", "Creature — Elf Warrior", "{G}", { cmc: 1, power: "1", toughness: "1" }));
    const aura = putOnBattlefield(s, ap, kindred());
    s.objects[aura]!.attachedTo = elf;
    const other = into(s, ap, bear(), "library");
    const kin = into(s, ap, card("Test Elf Druid", "Creature — Elf Druid", "{1}{G}", { cmc: 2, power: "1", toughness: "1" }), "library");
    const shifter = into(s, ap, card("Test Shifter", "Creature — Shapeshifter", "{2}", { cmc: 2, power: "1", toughness: "1", oracleText: "Changeling", keywords: ["Changeling"] }), "library");
    invalidateCharacteristics(s);
    s = nextUpkeep(s, ap);
    s = settle(s, { me: ap });
    expect(s.pending?.kind).toBe("searchLibrary");
    const p = s.pending as Extract<NonNullable<GameState["pending"]>, { kind: "searchLibrary" }>;
    expect(p.cards).toEqual(expect.arrayContaining([kin, shifter]));
    expect(p.cards).not.toContain(other);
    s = act(s, { type: "searchLibrary", player: ap, found: [kin] });
    s = settle(s, { me: ap });
    if (s.pending?.kind === "arrangeTop") s = settle(act(s, { type: "arrangeTop", player: ap, top: s.pending.cards, away: [] }), { me: ap });
    expect(s.objects[kin]!.zone).toBe("battlefield");
    expect(s.objects[other]!.zone).toBe("library");
    expect(s.players[ap]!.library.slice(-4)).toContain(other);
  });
});

describe("round 237: Niv-Mizzet, Guildpact", () => {
  it("is supported", () => supported(niv()));

  it("X is the number of different color pairs among your two-color permanents, for the damage, the draw and the life", () => {
    let { s, ap, opp } = setup([]);
    s.players[ap]!.hand = [];
    const n = putOnBattlefield(s, ap, niv());
    putOnBattlefield(s, ap, card("Test Azorius Sign", "Artifact", "{W}{U}"));
    putOnBattlefield(s, ap, card("Test Azorius Sign Again", "Artifact", "{U}{W}"));
    putOnBattlefield(s, ap, card("Test Rakdos Sign", "Artifact", "{B}{R}"));
    putOnBattlefield(s, ap, card("Test Red Sign", "Artifact", "{R}"));
    putOnBattlefield(s, opp, card("Test Golgari Sign", "Artifact", "{B}{G}"));
    invalidateCharacteristics(s);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: n, defender: opp }] });
    const oppLife = s.players[opp]!.life;
    const myLife = s.players[ap]!.life;
    for (let i = 0; i < 200 && s.pending?.kind !== "chooseTargets"; i++) {
      const p = s.pending;
      if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
      else if (p) s = act(s, botActions(s, p.player)[0]!);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.players[opp]!.life).toBe(oppLife - 6);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }, { kind: "player", id: ap }] }));
    expect(s.players[opp]!.life).toBe(oppLife - 8);
    expect(s.players[ap]!.hand.length).toBe(2);
    expect(s.players[ap]!.life).toBe(myLife + 2);
  });
});

describe("round 237: Wernog, Rider's Chaplain", () => {
  it("is supported", () => supported(wernog()));

  it("each opponent may investigate; those who don't lose 1 life; you investigate one plus that many times", () => {
    let { s, ap } = setup([]);
    const id = into(s, ap, wernog(), "hand");
    const i0 = s.turnOrder.indexOf(ap);
    const opps = [1, 2, 3].map((k) => s.turnOrder[(i0 + k) % 4]!); // APNAP order from you
    const lives = opps.map((p) => s.players[p]!.life);
    s = run(s, planCast(s, ap, id));
    const asked: PlayerId[] = [];
    for (let i = 0; i < 200 && (s.stack.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "chooseMay") {
        asked.push(p.player);
        s = act(s, { type: "chooseMay", player: p.player, yes: p.player === opps[0] });
      } else if (p) s = act(s, botActions(s, p.player)[0]!);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(asked).toEqual(opps);
    const clues = (pid: PlayerId) => s.battlefield.filter((t) => s.objects[t]!.isToken && characteristics(s, s.objects[t]!).subtypes.includes("Clue") && s.objects[t]!.controller === pid).length;
    expect(clues(opps[0]!)).toBe(1);
    expect(clues(opps[1]!)).toBe(0);
    expect(clues(ap)).toBe(2);
    expect(opps.map((p) => s.players[p]!.life)).toEqual([lives[0], lives[1]! - 1, lives[2]! - 1]);
  });
});

describe("round 237: Web of Inertia and Jace, Multiverse Architect", () => {
  it("is supported", () => supported(web(), jace()));

  /** To the beginning of combat on `who`'s turn, its trigger answered by `yes`. */
  const combatOf = (s: GameState, who: PlayerId, yes: boolean) => {
    s = passUntil(s, "main1", who);
    s = passUntil(s, "beginCombat", who);
    for (let i = 0; i < 100 && (s.stack.length || s.pending || s.triggerQueue.length) && s.step === "beginCombat"; i++) {
      const p = s.pending;
      if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes });
      else if (p) s = act(s, botActions(s, p.player)[0]!);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    return s;
  };

  it("Web: with an empty graveyard (or declining), that player's creatures can't attack you this turn; others they can", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, web());
    const c = putOnBattlefield(s, opp, bear());
    s.players[opp]!.graveyard = [];
    s = combatOf(s, opp, true);
    expect(attackProblem(s, s.objects[c]!, ap)).toMatch(/can't attack/);
    const third = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    expect(attackProblem(s, s.objects[c]!, third)).toBeNull();
  });

  it("Web: exiling a card from their graveyard lets them attack you", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, web());
    const c = putOnBattlefield(s, opp, bear());
    const g = into(s, opp, bear({ name: "Test Dead Bear" }), "graveyard");
    s = combatOf(s, opp, true);
    expect(s.objects[g]!.zone).toBe("exile");
    expect(attackProblem(s, s.objects[c]!, ap)).toBeNull();
  });

  it("Jace: not paying {2} keeps their creatures off Jaces you control, not off you", () => {
    let { s, ap, opp } = setup([]);
    const j = putOnBattlefield(s, ap, jace());
    s.objects[j]!.counters.loyalty = 5;
    const c = putOnBattlefield(s, opp, bear());
    s = combatOf(s, opp, false);
    expect(attackProblem(s, s.objects[c]!, ap, true, j)).toMatch(/Jaces/);
    expect(attackProblem(s, s.objects[c]!, ap)).toBeNull();
  });
});
