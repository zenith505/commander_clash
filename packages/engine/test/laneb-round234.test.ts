// Lane B round B234: Fight or Flight and Stand or Fall (you separate a player's creatures into two piles, they choose one,
// only its creatures can attack or block this turn), Decaying Soil (a threshold-granted dies trigger that looks back in
// time) and Soul Burn (black and/or red mana on X, life gained no more than the {B} spent on X).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup, swamp, mountain, forest } from "./helpers";
import { blockProblem, botActions, invalidateCharacteristics, isFullySupported, planCast, potentialAttackers, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const fightOrFlight = (): CardDef => ({"oracleId":"2fc42640-983a-49ca-9020-7756135077b4","name":"Fight or Flight","manaCost":"{3}{W}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of combat on each opponent's turn, separate all creatures that player controls into two piles. Only creatures in the pile of their choice can attack this turn.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/6/46bde162-3737-4b93-a27a-63b909a4183d.jpg?1783945717","artUrl":"https://cards.scryfall.io/art_crop/front/4/6/46bde162-3737-4b93-a27a-63b909a4183d.jpg?1783945717","commanderLegal":"legal","set":"inv","releasedAt":"2000-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const standOrFall = (): CardDef => ({"oracleId":"927d0085-9bd9-4454-8ac5-0e374237ed35","name":"Stand or Fall","manaCost":"{3}{R}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of combat on your turn, for each defending player, separate all creatures that player controls into two piles and that player chooses one. Only creatures in the chosen piles can block this turn.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/0/60c34970-a106-490c-ac37-6156eb7f34ce.jpg?1783945679","artUrl":"https://cards.scryfall.io/art_crop/front/6/0/60c34970-a106-490c-ac37-6156eb7f34ce.jpg?1783945679","commanderLegal":"legal","set":"inv","releasedAt":"2000-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const decayingSoil = (): CardDef => ({"oracleId":"3a58d68c-7683-4543-a929-8ef12641a564","name":"Decaying Soil","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your upkeep, exile a card from your graveyard.\nThreshold — As long as there are seven or more cards in your graveyard, this enchantment has \"Whenever a nontoken creature is put into your graveyard from the battlefield, you may pay {1}. If you do, return that card to your hand.\"","colors":["B"],"colorIdentity":["B"],"keywords":["Threshold"],"imageUrl":"https://cards.scryfall.io/normal/front/f/2/f2bea0ec-52e0-4f45-a445-8805dc6ed596.jpg?1783945248","artUrl":"https://cards.scryfall.io/art_crop/front/f/2/f2bea0ec-52e0-4f45-a445-8805dc6ed596.jpg?1783945248","commanderLegal":"legal","set":"ody","releasedAt":"2001-10-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const soulBurn = (): CardDef => ({"oracleId":"063b0f5d-af27-4681-87b9-b553f6887061","name":"Soul Burn","manaCost":"{X}{2}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Spend only black and/or red mana on X.\nSoul Burn deals X damage to any target. You gain life equal to the damage dealt, but not more than the amount of {B} spent on X, the player's life total before the damage was dealt, the planeswalker's loyalty before the damage was dealt, or the creature's toughness.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/0/70515cd2-97d5-4491-a758-bc7188fdc6dc.jpg?1783945691","artUrl":"https://cards.scryfall.io/art_crop/front/7/0/70515cd2-97d5-4491-a758-bc7188fdc6dc.jpg?1783945691","commanderLegal":"legal","set":"inv","releasedAt":"2000-10-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const pyroclasm = (): CardDef => ({"oracleId":"e4bcd4ea-e7cd-4471-8f3b-18bb51d3d70c","name":"Pyroclasm","manaCost":"{1}{R}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Pyroclasm deals 2 damage to each creature.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/4391b0af-2f26-4a45-9e2a-5bd8e9838107.jpg?1783909464","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/4391b0af-2f26-4a45-9e2a-5bd8e9838107.jpg?1783909464","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty or a question is asked; bots answer the questions of anyone but `me`. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && me !== undefined && p.player === me) return s;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes until a question is asked, or `step` of `active`'s turn is reached. */
const toQuestion = (s: GameState, step: GameState["step"], active: PlayerId) => {
  for (let i = 0; i < 400 && !s.pending && !(s.step === step && s.activePlayer === active); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const nextOf = (s: GameState, p: PlayerId, n = 1) => s.turnOrder[(s.turnOrder.indexOf(p) + n) % s.turnOrder.length]!;
/** A fresh copy of `def` in `pid`'s graveyard or hand. */
const inZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** `hand` in hand and only these lands on the battlefield for the active player. */
const withLands = (hand: CardDef[], lands: CardDef[]) => {
  const { s, ap, ids, opp } = setup(hand);
  for (const id of [...s.battlefield]) if (s.objects[id]!.controller === ap) s.battlefield.splice(s.battlefield.indexOf(id), 1), delete s.objects[id];
  for (const l of lands) putOnBattlefield(s, ap, l);
  invalidateCharacteristics(s);
  return { s, ap, ids, opp };
};
const lands = (b: number, r: number, g = 0) => [...Array.from({ length: b }, () => swamp), ...Array.from({ length: r }, () => mountain), ...Array.from({ length: g }, () => forest)];

describe("Lane B round B234", () => {
  it("are fully supported", () => supported(fightOrFlight(), standOrFall(), decayingSoil(), soulBurn()));
});

describe("Lane B round B234: Fight or Flight", () => {
  /** `ap` controls Fight or Flight; `opp` has three Grizzly Bears; on to the trigger's question in `opp`'s beginning of combat. */
  const atCombat = (bears = 3, extra?: (s: GameState, ap: PlayerId) => void, until: GameState["step"] = "declareAttackers") => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, fightOrFlight());
    extra?.(s0, ap);
    const ids = Array.from({ length: bears }, () => putOnBattlefield(s0, opp, grizzlyBears()));
    let s = passUntil(s0, "main1", opp);
    s = toQuestion(s, until, opp);
    return { s, ap, opp, bears: ids };
  };

  it("at the beginning of combat on an opponent's turn you separate their creatures, they choose a pile, and only that pile can attack", () => {
    const { s: s0, ap, opp, bears } = atCombat();
    expect(s0.step).toBe("beginCombat");
    const p = s0.pending;
    if (p?.kind !== "pickPermanents" || p.action !== "pile") throw new Error(JSON.stringify(p));
    expect(p.player).toBe(ap);
    expect([...p.options].sort()).toEqual([...bears].sort());
    expect(p.prompt).toContain("only the creatures in it can attack this turn");
    let s = act(s0, { type: "pickPermanents", player: ap, ids: [bears[0]!] });
    const c = s.pending;
    if (c?.kind !== "chooseOption" || c.what !== "pile") throw new Error(JSON.stringify(c));
    expect(c).toMatchObject({ player: opp, pileMode: "canAttack" });
    expect(c.piles!.map((pile) => [...pile].sort())).toEqual([[bears[0]], [bears[1], bears[2]].sort()]);
    s = act(s, { type: "chooseOption", player: opp, choice: "1" });
    s = toQuestion(s, "declareAttackers", opp);
    expect(s.step).toBe("declareAttackers");
    expect(potentialAttackers(s, opp).map((o) => o.id).sort()).toEqual([bears[1]!, bears[2]!].sort());
    expect(() => act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: bears[0]!, defender: ap }] })).toThrow();
    // A creature that enters later wasn't in either pile, so it can't attack either (rulings).
    const late = putOnBattlefield(s, opp, grizzlyBears());
    invalidateCharacteristics(s);
    expect(potentialAttackers(s, opp).map((o) => o.id)).not.toContain(late);
    const x = act(s, { type: "declareAttackers", player: opp, attacks: bears.slice(1).map((attacker) => ({ attacker, defender: ap })) });
    expect(x.objects[bears[1]!]!.attacking).toBe(ap);
    // Over at the end of the turn.
    const later = passUntil(x, "upkeep", nextOf(x, opp));
    expect(later.pilesOnlyThisTurn).toBeUndefined();
  });

  it("with no creatures there is nothing to separate, and creatures that arrive later still can't attack that turn", () => {
    const { s: s0, opp } = atCombat(0, undefined, "main2");
    const s = s0;
    expect(s.pending).toBeNull();
    expect(s.step).toBe("main2");
    expect(s.pilesOnlyThisTurn).toEqual([{ kind: "attack", ids: [], source: "Fight or Flight" }]);
    const late = putOnBattlefield(s, opp, grizzlyBears());
    invalidateCharacteristics(s);
    expect(potentialAttackers(s, opp).map((o) => o.id)).not.toContain(late);
  });

  it("with two of them, only creatures in both chosen piles can attack (rulings)", () => {
    const { s: s0, ap, opp, bears } = atCombat(3, (s, ap) => putOnBattlefield(s, ap, fightOrFlight()));
    let s = act(s0, { type: "pickPermanents", player: ap, ids: [bears[0]!, bears[1]!] });
    s = act(s, { type: "chooseOption", player: opp, choice: "0" });
    s = toQuestion(s, "declareAttackers", opp);
    if (s.pending?.kind !== "pickPermanents") throw new Error(JSON.stringify(s.pending));
    s = act(s, { type: "pickPermanents", player: ap, ids: [bears[1]!, bears[2]!] });
    s = act(s, { type: "chooseOption", player: opp, choice: "0" });
    s = toQuestion(s, "declareAttackers", opp);
    expect(potentialAttackers(s, opp).map((o) => o.id)).toEqual([bears[1]]);
  });

  it("bots: the separator splits the creatures, the chooser keeps the pile worth more", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, fightOrFlight());
    const giant = putOnBattlefield(s0, opp, hillGiant());
    const bear = putOnBattlefield(s0, opp, grizzlyBears());
    let s = toQuestion(passUntil(s0, "main1", opp), "declareAttackers", opp);
    const sep = botActions(s, ap)[0];
    if (sep?.type !== "pickPermanents") throw new Error(JSON.stringify(sep));
    expect(sep.ids.length).toBe(1);
    s = act(s, sep);
    const pick = botActions(s, opp)[0];
    if (pick?.type !== "chooseOption") throw new Error(JSON.stringify(pick));
    const piles = (s.pending as Extract<GameState["pending"], { kind: "chooseOption" }>).piles!;
    expect(piles[Number(pick.choice)]).toEqual([giant]);
    expect(bear).toBeDefined();
  });
});

describe("Lane B round B234: Stand or Fall", () => {
  it("at the beginning of combat on your turn, each defending player's creatures are separated; only the chosen piles can block", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, standOrFall());
    const attacker = putOnBattlefield(s0, ap, hillGiant());
    const [o1, o2, o3] = [nextOf(s0, ap), nextOf(s0, ap, 2), nextOf(s0, ap, 3)];
    const b1 = [putOnBattlefield(s0, o1, grizzlyBears()), putOnBattlefield(s0, o1, grizzlyBears())];
    const b2 = [putOnBattlefield(s0, o2, grizzlyBears())];
    // The third opponent has none: two empty piles, no question.
    let s = toQuestion(s0, "declareAttackers", ap);
    // In turn order (CR 101.4): the next player first; you separate, they choose.
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "pile", pickFor: o1 });
    s = act(s, { type: "pickPermanents", player: ap, ids: [b1[0]!] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: o1, what: "pile", pileMode: "canBlock", piles: [[b1[0]], [b1[1]]] });
    s = act(s, { type: "chooseOption", player: o1, choice: "0" });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "pile", pickFor: o2 });
    s = act(s, { type: "pickPermanents", player: ap, ids: [] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: o2, piles: [[], [b2[0]]] });
    s = act(s, { type: "chooseOption", player: o2, choice: "0" });
    s = toQuestion(s, "declareAttackers", ap);
    expect(s.pending?.kind ?? null).not.toBe("pickPermanents");
    expect(s.pilesOnlyThisTurn).toEqual([{ kind: "block", ids: [`${b1[0]}@${s.objects[b1[0]!]!.zoneChanges ?? 0}`], source: "Stand or Fall" }]);
    const a = s.objects[attacker]!;
    expect(blockProblem(s, s.objects[b1[0]!]!, a, o1)).toBeNull();
    expect(blockProblem(s, s.objects[b1[1]!]!, a, o1)).not.toBeNull();
    expect(blockProblem(s, s.objects[b2[0]!]!, a, o2)).not.toBeNull();
    // A creature the third opponent gets later can't block either.
    const late = putOnBattlefield(s, o3, grizzlyBears());
    invalidateCharacteristics(s);
    expect(blockProblem(s, s.objects[late]!, a, o3)).not.toBeNull();
  });

  it("bots separate and choose for themselves", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, standOrFall());
    const o1 = nextOf(s0, ap);
    const giant = putOnBattlefield(s0, o1, hillGiant());
    putOnBattlefield(s0, o1, grizzlyBears());
    let s = toQuestion(s0, "declareAttackers", ap);
    s = settle(s);
    expect(s.pending).toBeNull();
    expect(s.pilesOnlyThisTurn?.[0]?.ids).toEqual([`${giant}@${s.objects[giant]!.zoneChanges ?? 0}`]);
  });
});

describe("Lane B round B234: Decaying Soil", () => {
  /** `ap` controls Decaying Soil with `n` cards in their graveyard and two Grizzly Bears; `opp` has {R}{R}{R} to Bolt them. */
  const board = (n: number) => {
    const { s, ap, opp, ids } = setup([pyroclasm()]);
    putOnBattlefield(s, ap, decayingSoil());
    s.players[ap]!.graveyard = [];
    for (let i = 0; i < n; i++) inZone(s, ap, hillGiant(), "graveyard");
    const bears = [putOnBattlefield(s, ap, grizzlyBears()), putOnBattlefield(s, ap, grizzlyBears())];
    const bolts = [inZone(s, opp, lightningBolt(), "hand"), inZone(s, opp, lightningBolt(), "hand")];
    s.players[opp]!.manaPool.R = 2;
    return { s, ap, opp, bears, bolts, clasm: ids[0]! };
  };
  /** Yes to "you may pay {1}", paid with an untapped Swamp's mana. */
  const payOne = (s: GameState, pid: PlayerId) => {
    const land = s.battlefield.find((id) => s.objects[id]!.controller === pid && !s.objects[id]!.tapped && s.cards[s.objects[id]!.cardId]!.name === "Swamp")!;
    return act(act(s, { type: "activateMana", player: pid, objectId: land, mana: "B" }), { type: "chooseMay", player: pid, yes: true });
  };
  /** `opp` Bolts `target` while `ap` has priority in their main phase; on until a question. */
  const bolt = (s: GameState, ap: PlayerId, opp: PlayerId, card: string, target: string) => {
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    s = run(s, planCast(s, opp, card, [tgt(target)]));
    return settle(s, ap);
  };

  it("the creature that makes seven doesn't trigger it (it looks back in time); the next one does, and {1} returns it", () => {
    const { s: s0, ap, opp, bears, bolts } = board(6);
    let s = bolt(s0, ap, opp, bolts[0]!, bears[0]!);
    expect(zone(s, bears[0]!)).toBe("graveyard");
    expect(s.players[ap]!.graveyard.length).toBe(7);
    expect(s.pending).toBeNull();
    s = bolt(s, ap, opp, bolts[1]!, bears[1]!);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(payOne(s, ap), ap);
    expect(zone(s, bears[1]!)).toBe("hand");
  });

  it("creatures dying at the same time all trigger it or none do, by the graveyard just before (rulings)", () => {
    // Six cards, then Pyroclasm's own card goes there as it finishes resolving (CR 608.2n), before the creatures die.
    const seven = board(6);
    let s = settle(run(seven.s, planCast(seven.s, seven.ap, seven.clasm)), seven.ap);
    expect(s.players[seven.ap]!.graveyard).toContain(seven.clasm);
    let asked = 0;
    for (let i = 0; i < 4 && s.pending?.kind === "chooseMay"; i++) {
      asked++;
      s = settle(payOne(s, seven.ap), seven.ap);
    }
    expect(asked).toBe(2);
    expect(seven.bears.map((id) => zone(s, id))).toEqual(["hand", "hand"]);
    // Five and Pyroclasm make six: the two Bears make eight, but neither triggers it.
    const six = board(5);
    s = settle(run(six.s, planCast(six.s, six.ap, six.clasm)), six.ap);
    expect(s.pending).toBeNull();
    expect(six.bears.map((id) => zone(s, id))).toEqual(["graveyard", "graveyard"]);
    expect(s.players[six.ap]!.graveyard.length).toBe(8);
  });

  it("once it has triggered it resolves even if threshold is gone; a token doesn't trigger it", () => {
    const { s: s0, ap, opp, bears, bolts } = board(7);
    s0.objects[bears[0]!]!.isToken = true;
    let s = bolt(s0, ap, opp, bolts[0]!, bears[0]!);
    expect(s.pending).toBeNull();
    s = act(s, { type: "passPriority", player: ap });
    s = run(s, planCast(s, opp, bolts[1]!, [tgt(bears[1]!)]));
    for (let i = 0; i < 20 && !s.pending && !s.stack.some((it) => it.kind === "ability"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.stack.map((it) => (it.sourceId ? s.cards[s.objects[it.sourceId]!.cardId]!.name : ""))).toEqual(["Decaying Soil"]);
    // The trigger is waiting; empty the graveyard but the Bear.
    s.players[ap]!.graveyard = s.players[ap]!.graveyard.filter((id) => id === bears[1]);
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(payOne(s, ap), ap);
    expect(zone(s, bears[1]!)).toBe("hand");
  });
});

describe("Lane B round B234: Soul Burn", () => {
  const p = (id: PlayerId): TargetChoice => ({ kind: "player", id });

  it("X is paid with black and/or red mana only", () => {
    const { s, ap, ids, opp } = withLands([soulBurn()], lands(1, 1, 3));
    // {X}{2}{B}: X 1 is the Mountain, the {B} the Swamp, {2} two Forests.
    expect(planCast(s, ap, ids[0]!, [p(opp)], undefined, undefined, 1)).not.toBeNull();
    // X 2 needs a second black or red mana: Forests can't pay X.
    expect(planCast(s, ap, ids[0]!, [p(opp)], undefined, undefined, 2)).toBeNull();
    const more = withLands([soulBurn()], lands(2, 1, 2));
    expect(planCast(more.s, more.ap, more.ids[0]!, [p(more.opp)], undefined, undefined, 2)).not.toBeNull();
  });

  it("you gain life equal to the damage, no more than the {B} that could have gone to X", () => {
    // Four Swamps and two Mountains, X 3: three black mana can go to X, beside the {B}.
    let a = withLands([soulBurn()], lands(4, 2));
    let before = a.s.players[a.ap]!.life;
    let s = settle(run(a.s, planCast(a.s, a.ap, a.ids[0]!, [p(a.opp)], undefined, undefined, 3)));
    expect(s.players[a.opp]!.life).toBe(37);
    expect(s.players[a.ap]!.life).toBe(before + 3);
    // Two Swamps and four Mountains: one black mana for X beside the {B}.
    a = withLands([soulBurn()], lands(2, 4));
    before = a.s.players[a.ap]!.life;
    s = settle(run(a.s, planCast(a.s, a.ap, a.ids[0]!, [p(a.opp)], undefined, undefined, 3)));
    expect(s.players[a.opp]!.life).toBe(37);
    expect(s.players[a.ap]!.life).toBe(before + 1);
    // One Swamp: it pays the {B}, so no {B} is spent on X and no life is gained.
    a = withLands([soulBurn()], lands(1, 3, 2));
    before = a.s.players[a.ap]!.life;
    s = settle(run(a.s, planCast(a.s, a.ap, a.ids[0]!, [p(a.opp)], undefined, undefined, 3)));
    expect(s.players[a.opp]!.life).toBe(37);
    expect(s.players[a.ap]!.life).toBe(before);
  });

  it("still no more than the creature's toughness or the player's life total (rulings on Drain Life)", () => {
    let a = withLands([soulBurn()], lands(8, 0));
    const b = putOnBattlefield(a.s, a.opp, grizzlyBears());
    let before = a.s.players[a.ap]!.life;
    let s = settle(run(a.s, planCast(a.s, a.ap, a.ids[0]!, [tgt(b)], undefined, undefined, 5)));
    expect(zone(s, b)).toBe("graveyard");
    expect(s.players[a.ap]!.life).toBe(before + 2);
    a = withLands([soulBurn()], lands(8, 0));
    a.s.players[a.opp]!.life = 3;
    before = a.s.players[a.ap]!.life;
    s = settle(run(a.s, planCast(a.s, a.ap, a.ids[0]!, [p(a.opp)], undefined, undefined, 5)));
    expect(s.players[a.ap]!.life).toBe(before + 3);
  });
});
