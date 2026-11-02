// Round 252: the top of the popularity list. The Cyber-Controller and Death in Heaven (creature cards put onto the
// battlefield face down as 2/2 Cyberman artifact creatures with no name or color, rulings, CR 708.2a), Robber of the
// Rich (an exiled card cast during any turn you attacked with a Rogue, mana as though any color; rulings), Summon:
// Brynhildr (a card played during any turn you put a lore counter on the Saga), Azula, Cunning Usurper (the opponent's own
// picks, exiled with Azula, CR 607.2a; cast during your turn as though they had flash, any type of mana), Jacob Frye
// (a copy of an Assassin card or card with freerunning, cast as the trigger resolves paying its costs, rulings), Reno and
// Rude (play the exiled card this turn if you sacrificed) and Author of Shadows (one nonland card chosen among all the
// exiled graveyards).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, castProblem, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

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
/** Cards on top of `pid`'s library, `defs[0]` on top; their ids in the same order. */
const onTop = (s: GameState, pid: PlayerId, defs: CardDef[]) => [...defs].reverse().map((d) => into(s, pid, d, "library")).reverse();
/** Everyone passes until the stack is empty, answering trigger targets with `targets`; stops at any other question. */
const settle = (s: GameState, opts: { targets?: TargetChoice[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseTargets" && opts.targets) s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** As settle, but the bots answer the questions of every player other than `me`. */
const settleOthers = (s: GameState, me: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player === me) return s;
    s = p ? botActions(s, p.player).reduce((x, a) => act(x, a), s) : act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** The bots' answers for every question, whoever is asked, until the stack is empty. */
const settleBots = (s: GameState) => {
  for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    s = s.pending ? botActions(s, pid).reduce((x, a) => act(x, a), s) : act(s, { type: "passPriority", player: pid });
  }
  return s;
};
/** `attacker` attacks `defender`; the game goes on to the combat damage step (no blocks), its triggers waiting. */
const hit = (s: GameState, ap: PlayerId, attacker: ObjectId, defender: PlayerId) =>
  passUntil(act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker, defender }] }), "combatDamage", ap);
/** Moves `pid`'s hand to the bottom of their library. */
const emptyHand = (s: GameState, pid: PlayerId) => {
  for (const id of s.players[pid]!.hand) {
    s.objects[id]!.zone = "library";
    s.players[pid]!.library.push(id);
  }
  s.players[pid]!.hand = [];
  invalidateCharacteristics(s);
};
/** That `pid` has no permission to cast this card from where it is now. */
const noPermission = (s: GameState, pid: PlayerId, id: ObjectId, targets?: TargetChoice[]) => expect(castProblem(s, pid, id, targets)).toMatch(/only cast spells from your hand/);
/** Removes `pid`'s lands, for tests about which mana pays. */
const noLands = (s: GameState, pid: PlayerId) => {
  s.battlefield = s.battlefield.filter((id) => !(controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).types.includes("Land")));
  invalidateCharacteristics(s);
};

// Real oracle text (Scryfall).
const cyber = (): CardDef => ({"oracleId":"06c25d71-f3f4-4089-b9bc-de96fbad73a5","name":"The Cyber-Controller","manaCost":"{X}{U}{U}{B}","cmc":3,"typeLine":"Legendary Artifact Creature — Cyberman","supertypes":["Legendary"],"types":["Artifact","Creature"],"subtypes":["Cyberman"],"oracleText":"When The Cyber-Controller enters, each opponent mills X cards. Put all creature cards milled this way onto the battlefield face down under your control. They're 2/2 Cyberman artifact creatures.\nOther artifact creatures you control get +1/+1.","power":"3","toughness":"3","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/3/c/3cab0df1-d53f-4208-9ff9-d015aac20141.jpg?1783914639","artUrl":"https://cards.scryfall.io/art_crop/front/3/c/3cab0df1-d53f-4208-9ff9-d015aac20141.jpg?1783914639","commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const heaven = (): CardDef => ({"oracleId":"f2bf5014-677a-4880-b926-d93457348bdc","name":"Death in Heaven","manaCost":"{3}{B}","cmc":4,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI, II — Target player mills two cards, then exiles their graveyard.\nIII — Put all creature cards exiled with this enchantment onto the battlefield face down under your control. They're 2/2 Cyberman artifact creatures.","colors":["B"],"colorIdentity":["B"],"keywords":["Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/9/6/96c55c73-eed0-433c-b1a4-c2edae06a77f.jpg?1783914658","artUrl":"https://cards.scryfall.io/art_crop/front/9/6/96c55c73-eed0-433c-b1a4-c2edae06a77f.jpg?1783914658","commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"saga","gameChanger":false}) as CardDef;
const robber = (): CardDef => ({"oracleId":"4df0d381-fc05-4d30-9307-48963aa2ecfd","name":"Robber of the Rich","manaCost":"{1}{R}","cmc":2,"typeLine":"Creature — Human Archer Rogue","supertypes":[],"types":["Creature"],"subtypes":["Human","Archer","Rogue"],"oracleText":"Reach, haste\nWhenever this creature attacks, if defending player has more cards in hand than you, exile the top card of their library. During any turn you attacked with a Rogue, you may cast that card and you may spend mana as though it were mana of any color to cast that spell.","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":["Reach","Haste"],"imageUrl":"https://cards.scryfall.io/normal/front/0/e/0ecbe097-ba51-42e5-957c-382eb66c08f0.jpg?1783932619","artUrl":"https://cards.scryfall.io/art_crop/front/0/e/0ecbe097-ba51-42e5-957c-382eb66c08f0.jpg?1783932619","commanderLegal":"legal","set":"eld","releasedAt":"2019-10-04","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const bryn = (): CardDef => ({"oracleId":"bab5e9ce-6d55-4d1e-a9ac-c2b954191be9","name":"Summon: Brynhildr","manaCost":"{1}{R}","cmc":2,"typeLine":"Enchantment Creature — Saga Knight","supertypes":[],"types":["Enchantment","Creature"],"subtypes":["Saga","Knight"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Chain — Exile the top card of your library. During any turn you put a lore counter on this Saga, you may play that card.\nII, III — Gestalt Mode — When you next cast a creature spell this turn, it gains haste until end of turn.","power":"2","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/a/8ab5429a-1075-49aa-9608-0610080fbf7a.jpg?1784182953","artUrl":"https://cards.scryfall.io/art_crop/front/8/a/8ab5429a-1075-49aa-9608-0610080fbf7a.jpg?1784182953","commanderLegal":"legal","set":"fin","releasedAt":"2025-06-13","rarity":"rare","layout":"saga","gameChanger":false}) as CardDef;
const azula = (): CardDef => ({"oracleId":"7c9e351d-2e6c-4050-9c3d-b15bb9255a4d","name":"Azula, Cunning Usurper","manaCost":"{2}{U}{B}{B}","cmc":5,"typeLine":"Legendary Creature — Human Noble Rogue","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Noble","Rogue"],"oracleText":"Firebending 2 (Whenever this creature attacks, add {R}{R}. This mana lasts until end of combat.)\nWhen Azula enters, target opponent exiles a nontoken creature they control, then they exile a nonland card from their graveyard.\nDuring your turn, you may cast cards exiled with Azula and you may cast them as though they had flash. Mana of any type can be spent to cast those spells.","power":"4","toughness":"4","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Firebending"],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/d/a/daf30e1c-436d-4f23-b1d2-570619a4b7f5.jpg?1783904932","artUrl":"https://cards.scryfall.io/art_crop/front/d/a/daf30e1c-436d-4f23-b1d2-570619a4b7f5.jpg?1783904932","commanderLegal":"legal","set":"tla","releasedAt":"2025-11-21","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const jacob = (): CardDef => ({"oracleId":"31af65c3-602b-4ac9-a25f-dccb88f8f751","name":"Jacob Frye","manaCost":"{2}{B}","cmc":3,"typeLine":"Legendary Creature — Human Assassin","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Assassin"],"oracleText":"Partner with Evie Frye (When this creature enters, target player may put Evie into their hand from their library, then shuffle.)\nWhenever one or more Assassins you control deal combat damage to a player, exile up to one target Assassin card or card with freerunning from your graveyard. If you do, copy it. You may cast the copy.","power":"3","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":["Partner with","Partner"],"imageUrl":"https://cards.scryfall.io/normal/front/2/3/23422e75-e1c7-484b-aa1f-155ef9a998ec.jpg?1783910980","artUrl":"https://cards.scryfall.io/art_crop/front/2/3/23422e75-e1c7-484b-aa1f-155ef9a998ec.jpg?1783910980","commanderLegal":"legal","set":"acr","releasedAt":"2024-07-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const reno = (): CardDef => ({"oracleId":"f749a6d6-2c55-439f-bb02-e95fa54c2ef3","name":"Reno and Rude","manaCost":"{1}{B}","cmc":2,"typeLine":"Legendary Creature — Human Assassin","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Assassin"],"oracleText":"Menace\nWhenever Reno and Rude deals combat damage to a player, exile the top card of that player's library. Then you may sacrifice another creature or artifact. If you do, you may play the exiled card this turn, and mana of any type can be spent to cast it.","power":"2","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Menace"],"imageUrl":"https://cards.scryfall.io/normal/front/b/5/b5eb0064-c7c4-4e3e-add2-b86269de3fb9.jpg?1783906613","artUrl":"https://cards.scryfall.io/art_crop/front/b/5/b5eb0064-c7c4-4e3e-add2-b86269de3fb9.jpg?1783906613","commanderLegal":"legal","set":"fin","releasedAt":"2025-06-13","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const author = (): CardDef => ({"oracleId":"8bad4e43-4375-4e7f-897e-d28be72308d7","name":"Author of Shadows","manaCost":"{4}{B}","cmc":5,"typeLine":"Creature — Shade Warlock","supertypes":[],"types":["Creature"],"subtypes":["Shade","Warlock"],"oracleText":"When this creature enters, exile all opponents' graveyards. Choose a nonland card exiled this way. You may cast that card for as long as it remains exiled, and you may spend mana as though it were mana of any color to cast that spell.","power":"3","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/5/95b5fc08-5c50-4ec9-9788-54f95c4ce916.jpg?1783927602","artUrl":"https://cards.scryfall.io/art_crop/front/9/5/95b5fc08-5c50-4ec9-9788-54f95c4ce916.jpg?1783927602","commanderLegal":"legal","set":"c21","releasedAt":"2021-04-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const bolt = card("Test Bolt", "Instant", "{R}", { oracleText: "Test Bolt deals 3 damage to any target." });
const charm = card("Test Charm", "Enchantment", "{2}{W}");
const ogre = card("Test Ogre", "Creature — Ogre", "{4}{R}", { power: "5", toughness: "5" });
const rock = card("Test Rock", "Artifact", "{3}", { oracleText: "{T}: Add {C}." });
const assassin = card("Test Assassin", "Creature — Human Assassin", "{1}{B}", { power: "2", toughness: "1" });
const rogue = card("Test Rogue", "Creature — Human Rogue", "{1}{B}", { power: "1", toughness: "1" });
const wastes = card("Test Wastes", "Land", "", { oracleText: "{T}: Add {C}." });

describe("round 252", () => {
  it("every card of the round compiles fully", () => {
    supported(cyber(), heaven(), robber(), bryn(), azula(), jacob(), reno(), author());
  });

  it("Robber of the Rich: if the defending player has more cards in hand, exile their top card; cast it during a turn you attacked with a Rogue, any color of mana", () => {
    const { s: s0, ap, opp } = setup([]);
    emptyHand(s0, ap);
    const r = putOnBattlefield(s0, ap, robber());
    const [b] = onTop(s0, opp, [bolt]);
    let s = passUntil(s0, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: r, defender: opp }] }));
    expect(s.objects[b!]!.zone).toBe("exile");
    expect(s.objects[b!]!.owner).toBe(opp);
    // This turn you attacked with a Rogue (Robber itself): castable, with only black mana (as though any color).
    noLands(s, ap);
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, B: 1 };
    expect(castProblem(s, ap, b!, [{ kind: "player", id: opp }])).toBeNull();
    // An opponent's turn: no Rogue attacked, so not castable.
    let s2 = passUntil(s, "upkeep", opp);
    s2.players[ap]!.manaPool = { ...s2.players[ap]!.manaPool, B: 1 };
    noPermission(s2, ap, b!, [{ kind: "player", id: opp }]);
    expect(s2.objects[b!]!.zone).toBe("exile");
  });

  it("Robber of the Rich: a later turn needs another attack with a Rogue; a non-Rogue attack doesn't do", () => {
    const { s: s0, ap, opp } = setup([]);
    emptyHand(s0, ap);
    const r = putOnBattlefield(s0, ap, robber());
    const [b] = onTop(s0, opp, [bolt]);
    let s = passUntil(s0, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: r, defender: opp }] }));
    expect(s.objects[b!]!.zone).toBe("exile");
    // Next turn of yours: before attacking, not castable; after a Rogue attacks, castable (even with Robber gone).
    s = passUntil(passUntil(s, "end", ap), "main1", ap);
    s.battlefield = s.battlefield.filter((id) => id !== r);
    s.objects[r]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(r);
    const g = putOnBattlefield(s, ap, bear());
    const ro = putOnBattlefield(s, ap, rogue);
    noPermission(s, ap, b!, [{ kind: "player", id: opp }]);
    let s1 = passUntil(s, "declareAttackers", ap);
    s1 = settle(act(s1, { type: "declareAttackers", player: ap, attacks: [{ attacker: g, defender: opp }] }));
    noPermission(s1, ap, b!, [{ kind: "player", id: opp }]);
    let s2 = passUntil(s, "declareAttackers", ap);
    s2 = settle(act(s2, { type: "declareAttackers", player: ap, attacks: [{ attacker: ro, defender: opp }] }));
    expect(planCast(s2, ap, b!, [{ kind: "player", id: opp }])).not.toBeNull();
    s2 = settle(run(s2, planCast(s2, ap, b!, [{ kind: "player", id: opp }])));
    expect(s2.objects[b!]!.zone).toBe("graveyard");
  });

  it("Robber of the Rich: no trigger when the defending player doesn't have more cards in hand than you", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, robber());
    while (s0.players[ap]!.hand.length <= s0.players[opp]!.hand.length) into(s0, ap, charm, "hand");
    const [b] = onTop(s0, opp, [bolt]);
    let s = passUntil(s0, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: r, defender: opp }] }));
    expect(s.objects[b!]!.zone).toBe("library");
  });

  it("Summon: Brynhildr: the card exiled by chapter I may be played only during a turn you put a lore counter on it", () => {
    const { s: s0, ap, opp, ids } = setup([bryn()]);
    const [b] = onTop(s0, ap, [bolt]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.counters.lore).toBe(1);
    expect(s.objects[b!]!.zone).toBe("exile");
    // The turn it entered: a lore counter was put on it.
    expect(planCast(s, ap, b!, [{ kind: "player", id: opp }])).not.toBeNull();
    // An opponent's turn: no.
    const s1 = passUntil(s, "upkeep", opp);
    noPermission(s1, ap, b!, [{ kind: "player", id: opp }]);
    // Your next turn: not in the upkeep (no lore counter yet), then after chapter II's counter in the main phase.
    const s2 = passUntil(s1, "upkeep", ap);
    noPermission(s2, ap, b!, [{ kind: "player", id: opp }]);
    let s3 = settle(passUntil(s2, "main1", ap));
    expect(s3.objects[ids[0]!]!.counters.lore).toBe(2);
    expect(planCast(s3, ap, b!, [{ kind: "player", id: opp }])).not.toBeNull();
    s3 = settle(run(s3, planCast(s3, ap, b!, [{ kind: "player", id: opp }])));
    expect(s3.objects[b!]!.zone).toBe("graveyard");
  });

  it("Summon: Brynhildr: a land card exiled may be played as your land play that turn", () => {
    const { s: s0, ap, ids } = setup([bryn()]);
    const [w] = onTop(s0, ap, [wastes]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[w!]!.zone).toBe("exile");
    const s1 = act(s, { type: "playLand", player: ap, objectId: w! });
    expect(s1.objects[w!]!.zone).toBe("battlefield");
  });

  it("Azula, Cunning Usurper: the target opponent exiles a nontoken creature they control, then a nonland card from their graveyard, both exiled with Azula", () => {
    const { s: s0, ap, opp, ids } = setup([azula()]);
    const g = putOnBattlefield(s0, opp, bear());
    const o = putOnBattlefield(s0, opp, ogre);
    const b = into(s0, opp, bolt, "graveyard");
    const w = into(s0, opp, wastes, "graveyard");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, { targets: [{ kind: "player", id: opp }] });
    // The opponent's own choices: a creature, then a nonland card.
    expect(s.pending?.player).toBe(opp);
    s = settleOthers(s, ap);
    expect(s.pending).toBeNull();
    const gone = [g, o].filter((id) => s.objects[id]!.zone === "exile");
    expect(gone.length).toBe(1);
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.objects[w]!.zone).toBe("graveyard");
    const key = `${ids[0]}@${s.objects[ids[0]!]!.zoneChanges ?? 0}`;
    expect((s.linkedExile?.[key] ?? []).map((l) => l.id).sort()).toEqual([gone[0]!, b].sort());
  });

  it("Azula, Cunning Usurper: during your turn, cast the exiled cards as though they had flash with any type of mana; not during an opponent's turn", () => {
    const { s: s0, ap, opp, ids } = setup([azula()]);
    const g = putOnBattlefield(s0, opp, bear());
    const b = into(s0, opp, bolt, "graveyard");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settleOthers(settle(s, { targets: [{ kind: "player", id: opp }] }), ap);
    expect(s.objects[g]!.zone).toBe("exile");
    expect(s.objects[b]!.zone).toBe("exile");
    // A creature card at instant speed (beginning of combat), paid with black mana only.
    s = passUntil(s, "beginCombat", ap);
    noLands(s, ap);
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, B: 2 };
    s = settle(run(s, planCast(s, ap, g)));
    expect(s.objects[g]!.zone).toBe("battlefield");
    expect(controllerOf(s, s.objects[g]!)).toBe(ap);
    // Not during an opponent's turn.
    const s1 = passUntil(s, "upkeep", opp);
    noPermission(s1, ap, b, [{ kind: "player", id: opp }]);
  });

  it("Azula, Cunning Usurper: a bot opponent's picks; a card exiled with Azula can't be cast once Azula is gone", () => {
    const { s: s0, ap, opp, ids } = setup([azula()]);
    const bs = s0.turnOrder.filter((p) => p !== ap).map((p) => (putOnBattlefield(s0, p, bear()), into(s0, p, bolt, "graveyard")));
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settleBots(s);
    const b = bs.find((id) => s.objects[id]!.zone === "exile")!;
    expect(b).toBeDefined();
    s.battlefield = s.battlefield.filter((id) => id !== ids[0]);
    s.objects[ids[0]!]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(ids[0]!);
    invalidateCharacteristics(s);
    noPermission(s, ap, b, [{ kind: "player", id: opp }]);
  });

  it("Jacob Frye: when Assassins deal combat damage, exile an Assassin card from your graveyard, copy it and cast the copy paying its costs", () => {
    const { s: s0, ap, opp } = setup([]);
    const j = putOnBattlefield(s0, ap, jacob());
    const a = into(s0, ap, assassin, "graveyard");
    let s = settle(hit(s0, ap, j, opp), { targets: [tgt(a)] });
    expect(s.objects[a]!.zone).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong", options: [a, "none"] });
    expect(s.pending?.kind === "chooseOption" && s.pending.prompt).not.toMatch(/without paying/);
    s = act(s, { type: "chooseOption", player: ap, choice: a });
    expect(s.pending).toMatchObject({ kind: "castFree", how: "paid" });
    const copy = s.pending?.kind === "castFree" ? s.pending.objectId : "";
    expect(copy).not.toBe(a);
    expect(s.objects[a]!.zone).toBe("exile");
    // Paying {1}{B}: with no mana it can't be cast.
    const broke = structuredClone(s);
    noLands(broke, ap);
    expect(planCast(broke, ap, copy)).toBeNull();
    const plan = planCast(s, ap, copy);
    expect(plan).not.toBeNull();
    s = settle(run(s, plan));
    const token = s.battlefield.find((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).name === "Test Assassin");
    expect(token).toBeDefined();
    expect(s.objects[a]!.zone).toBe("exile");
  });

  it("Jacob Frye: a card with freerunning; declining the cast leaves the card exiled and the copy gone", () => {
    const { s: s0, ap, opp } = setup([]);
    const j = putOnBattlefield(s0, ap, jacob());
    const run1 = card("Test Run", "Instant", "{2}{R}", { oracleText: "Freerunning {R} (You may cast this spell for its freerunning cost if you dealt combat damage to a player this turn with an Assassin or commander.)\nTest Run deals 2 damage to any target.", keywords: ["Freerunning"] });
    const f = into(s0, ap, run1, "graveyard");
    const other = into(s0, ap, bolt, "graveyard");
    let s = hit(s0, ap, j, opp);
    expect(s.pending?.kind).toBe("chooseTargets");
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(other)] })).toThrow();
    s = settle(s, { targets: [tgt(f)] });
    s = act(s, { type: "chooseOption", player: ap, choice: f });
    expect(s.pending).toMatchObject({ kind: "castFree", how: "paid" });
    const copy = s.pending?.kind === "castFree" ? s.pending.objectId : "";
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.objects[f]!.zone).toBe("exile");
    expect(s.objects[copy]?.zone ?? "gone").not.toBe("stack");
    expect(s.players[ap]!.exile.includes(copy)).toBe(false);
  });

  it("Reno and Rude: exile the top card of the damaged player's library; sacrifice another creature or artifact to play it this turn with any type of mana", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, reno());
    const k = putOnBattlefield(s0, ap, rock);
    const [b] = onTop(s0, opp, [bolt]);
    let s = settle(hit(s0, ap, r, opp));
    expect(s.objects[b!]!.zone).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    for (let i = 0; i < 10 && s.pending && s.pending.kind !== "chooseMay"; i++) s = botActions(s, ap).reduce((x, a) => act(x, a), s);
    s = settle(s);
    expect(s.objects[k]!.zone).toBe("graveyard");
    noLands(s, ap);
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, C: 1 };
    expect(planCast(s, ap, b!, [{ kind: "player", id: opp }])).not.toBeNull();
    // Not after this turn.
    const s1 = passUntil(s, "upkeep", opp);
    noPermission(s1, ap, b!, [{ kind: "player", id: opp }]);
  });

  it("Reno and Rude: without the sacrifice the card stays exiled and can't be played", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, reno());
    putOnBattlefield(s0, ap, rock);
    const [b] = onTop(s0, opp, [bolt]);
    let s = settle(hit(s0, ap, r, opp));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.objects[b!]!.zone).toBe("exile");
    noPermission(s, ap, b!, [{ kind: "player", id: opp }]);
  });

  it("Author of Shadows: exile all opponents' graveyards, choose a nonland card among them; only it may be cast, for as long as it stays exiled", () => {
    const { s: s0, ap, ids } = setup([author()]);
    const [o1, o2] = s0.turnOrder.filter((p) => p !== ap);
    const b = into(s0, o1!, bolt, "graveyard");
    const g = into(s0, o1!, bear(), "graveyard");
    const w = into(s0, o1!, wastes, "graveyard");
    const og = into(s0, o2!, ogre, "graveyard");
    const mine = into(s0, ap, charm, "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    for (const id of [b, g, w, og]) expect(s.objects[id]!.zone).toBe("exile");
    expect(s.objects[mine]!.zone).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "impulseChoice", player: ap });
    const p = s.pending!;
    expect(p.kind === "chooseOption" && [...p.options].sort()).toEqual([b, g, og].sort());
    s = settle(act(s, { type: "chooseOption", player: ap, choice: g }));
    // Next turn of yours, with only blue mana: the chosen creature card, as though any color.
    s = passUntil(passUntil(s, "end", ap), "main1", ap);
    noPermission(s, ap, b, [{ kind: "player", id: o1! }]);
    noLands(s, ap);
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, U: 2 };
    s = settle(run(s, planCast(s, ap, g)));
    expect(s.objects[g]!.zone).toBe("battlefield");
  });

  it("Author of Shadows: one nonland card is chosen without a question; none, nothing", () => {
    const { s: s0, ap, ids } = setup([author()]);
    const o1 = s0.turnOrder.find((p) => p !== ap)!;
    const b = into(s0, o1, bolt, "graveyard");
    into(s0, o1, wastes, "graveyard");
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeNull();
    expect(s.objects[b]!.mayPlay?.player).toBe(ap);
    const { s: s1, ap: ap1, ids: ids1 } = setup([author()]);
    const s2 = settle(run(s1, planCast(s1, ap1, ids1[0]!)));
    expect(s2.pending).toBeNull();
  });

  it("Author of Shadows: a bot chooses a card", () => {
    const { s: s0, ap, ids } = setup([author()]);
    const o1 = s0.turnOrder.find((p) => p !== ap)!;
    into(s0, o1, bolt, "graveyard");
    into(s0, o1, ogre, "graveyard");
    const s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeNull();
    expect(Object.values(s.objects).filter((o) => o.mayPlay?.player === ap).length).toBe(1);
  });

  it("The Cyber-Controller: each opponent mills X; the creature cards milled enter face down under your control as 2/2 Cyberman artifact creatures", () => {
    const { s: s0, ap, ids } = setup([cyber()]);
    const opps = s0.turnOrder.filter((p) => p !== ap);
    const tops = opps.map((p) => onTop(s0, p, [ogre, charm, bear()]));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 2)));
    expect(s.pending).toBeNull();
    for (const [i, p] of opps.entries()) {
      const [o, c, b] = tops[i]!;
      const x = s.objects[o!]!;
      expect(x.zone).toBe("battlefield");
      expect(x.faceDown).toBe("cyberman");
      expect(x.owner).toBe(p);
      expect(controllerOf(s, x)).toBe(ap);
      const ch = characteristics(s, x);
      expect(ch.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(ch.subtypes).toEqual(["Cyberman"]);
      expect(ch.colors).toEqual([]);
      // 2/2, and "Other artifact creatures you control get +1/+1".
      expect(pt(s, o!)).toBe("3/3");
      expect(s.objects[c!]!.zone).toBe("graveyard");
      // Only X cards milled: the third stays on top.
      expect(s.objects[b!]!.zone).toBe("library");
    }
    // The Cyber-Controller itself isn't pumped by its own static.
    expect(pt(s, ids[0]!)).toBe("3/3");
  });

  it("The Cyber-Controller: with X 0 nobody mills and nothing enters", () => {
    const { s: s0, ap, ids } = setup([cyber()]);
    const opp = s0.turnOrder.find((p) => p !== ap)!;
    const [o] = onTop(s0, opp, [ogre]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 0)));
    expect(s.objects[o!]!.zone).toBe("library");
    expect(s.battlefield.filter((id) => s.objects[id]!.faceDown).length).toBe(0);
  });

  it("Death in Heaven: chapters I and II mill two and exile the graveyard; chapter III puts the creature cards exiled with it onto the battlefield face down as Cybermen", () => {
    const { s: s0, ap, opp, ids } = setup([heaven()]);
    const old = into(s0, opp, ogre, "graveyard");
    const oldCharm = into(s0, opp, charm, "graveyard");
    const [b1, c1] = onTop(s0, opp, [bear(), charm]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, { targets: [{ kind: "player", id: opp }] });
    expect(s.objects[ids[0]!]!.counters.lore).toBe(1);
    for (const id of [old, oldCharm, b1!, c1!]) expect(s.objects[id]!.zone).toBe("exile");
    expect(s.players[opp]!.graveyard.length).toBe(0);
    // Chapter II on your next turn: two more.
    s = passUntil(passUntil(s, "end", ap), "main1", ap);
    const [b2, c2] = onTop(s, opp, [ogre, charm]);
    s = settle(s, { targets: [{ kind: "player", id: opp }] });
    expect(s.objects[ids[0]!]!.counters.lore).toBe(2);
    expect(s.objects[b2!]!.zone).toBe("exile");
    expect(s.objects[c2!]!.zone).toBe("exile");
    // Chapter III: the creature cards come back face down under your control; the Saga is sacrificed.
    s = passUntil(passUntil(s, "end", ap), "main1", ap);
    s = settle(s);
    for (const id of [old, b1!, b2!]) {
      const x = s.objects[id]!;
      expect(x.zone).toBe("battlefield");
      expect(x.faceDown).toBe("cyberman");
      expect(controllerOf(s, x)).toBe(ap);
      expect(pt(s, id)).toBe("2/2");
      expect(characteristics(s, x).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    }
    for (const id of [oldCharm, c1!, c2!]) expect(s.objects[id]!.zone).toBe("exile");
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });
});
