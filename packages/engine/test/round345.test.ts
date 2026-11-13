// Round 345 (Lane A): Last Night Together (an additional combat phase only the chosen creatures can attack in), Enduring
// Angel (a replacement of the life total being reduced to 0 or less), Extract Brain (an opponent chooses X cards from
// their hand; you may cast one of them), The Aesir Escape Valhalla (chapters linked by "the exiled card").

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, invalidateCharacteristics, isFullySupported, planCast, potentialAttackers, waitingOn, type Action, type CardDef, type GameState, type PendingDecision, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const pend = <K extends PendingDecision["kind"]>(s: GameState, kind: K) => {
  expect(s.pending?.kind).toBe(kind);
  return s.pending as Extract<PendingDecision, { kind: K }>;
};
const name = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;
/** A copy of `def` in `pid`'s `zone` (hand, graveyard or library, on top). */
const put = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "hand") s.players[pid]!.hand.push(id);
  else if (zone === "graveyard") s.players[pid]!.graveyard.push(id);
  else s.players[pid]!.library.unshift(id);
  invalidateCharacteristics(s);
  return id;
};
const tgt = (id: string) => ({ kind: "object" as const, id });

// Real oracle text (Scryfall).
const together = (): CardDef => ({"oracleId":"0ad48edf-49e2-4f3a-b50e-11231a616752","name":"Last Night Together","manaCost":"{3}{R}{G}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose two target creatures. Untap them. Put two +1/+1 counters on each of them. They gain vigilance, indestructible, and haste until end of turn. After this main phase, there is an additional combat phase. Only the chosen creatures can attack during that combat phase.","colors":["G","R"],"colorIdentity":["G","R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/8/08fbaf77-8afa-41c7-804b-ba7b740fffe8.jpg?1783914390","artUrl":"https://cards.scryfall.io/art_crop/front/0/8/08fbaf77-8afa-41c7-804b-ba7b740fffe8.jpg?1783914390","commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const angel = (): CardDef => ({"oracleId":"93d1e21b-7326-4aad-9f6e-e0e391845a18","name":"Enduring Angel // Angelic Enforcer","manaCost":"{2}{W}{W}{W}","cmc":5,"typeLine":"Creature — Angel // Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying, double strike\nYou have hexproof.\nIf your life total would be reduced to 0 or less, instead transform this creature and your life total becomes 3. Then if this creature didn't transform this way, you lose the game.","power":"3","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Transform","Double strike","Double"],"imageUrl":"https://cards.scryfall.io/normal/front/9/7/97a12555-b587-4028-ae23-8085052f0aeb.jpg?1783924476","artUrl":"https://cards.scryfall.io/art_crop/front/9/7/97a12555-b587-4028-ae23-8085052f0aeb.jpg?1783924476","commanderLegal":"legal","set":"dbl","releasedAt":"2022-01-28","rarity":"mythic","layout":"transform","gameChanger":false,"faces":[{"name":"Enduring Angel","manaCost":"{2}{W}{W}{W}","typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying, double strike\nYou have hexproof.\nIf your life total would be reduced to 0 or less, instead transform this creature and your life total becomes 3. Then if this creature didn't transform this way, you lose the game.","power":"3","toughness":"3","colors":["W"],"imageUrl":"https://cards.scryfall.io/normal/front/9/7/97a12555-b587-4028-ae23-8085052f0aeb.jpg?1783924476","artUrl":"https://cards.scryfall.io/art_crop/front/9/7/97a12555-b587-4028-ae23-8085052f0aeb.jpg?1783924476"},{"name":"Angelic Enforcer","manaCost":"","typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nYou have hexproof.\nAngelic Enforcer's power and toughness are each equal to your life total.\nWhenever this creature attacks, double your life total.","power":"*","toughness":"*","colors":["W"],"colorIndicator":["W"],"imageUrl":"https://cards.scryfall.io/normal/back/9/7/97a12555-b587-4028-ae23-8085052f0aeb.jpg?1783924476","artUrl":"https://cards.scryfall.io/art_crop/back/9/7/97a12555-b587-4028-ae23-8085052f0aeb.jpg?1783924476"}]}) as CardDef;
const brain = (): CardDef => ({"oracleId":"bb0eb9c2-c26d-452d-9e02-fc0bec2655c4","name":"Extract Brain","manaCost":"{X}{U}{B}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target opponent chooses X cards from their hand. Look at those cards. You may cast a spell from among them without paying its mana cost.","colors":["B","U"],"colorIdentity":["B","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/c/8c3a4a44-5e75-42a4-8140-2105c2becff9.jpg?1783911901","artUrl":"https://cards.scryfall.io/art_crop/front/8/c/8c3a4a44-5e75-42a4-8140-2105c2becff9.jpg?1783911901","commanderLegal":"legal","set":"otc","releasedAt":"2024-04-19","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const watchwolf = (): CardDef => ({"oracleId":"a35c2e20-eb90-4132-b65f-be1fcb569819","name":"Watchwolf","manaCost":"{G}{W}","cmc":2,"typeLine":"Creature — Wolf","supertypes":[],"types":["Creature"],"subtypes":["Wolf"],"oracleText":"","power":"3","toughness":"3","colors":["G","W"],"colorIdentity":["G","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/5/95e5828a-3e54-4b9c-9e84-21880930f2d5.jpg?1783943608","artUrl":"https://cards.scryfall.io/art_crop/front/9/5/95e5828a-3e54-4b9c-9e84-21880930f2d5.jpg?1783943608","commanderLegal":"legal","set":"rav","releasedAt":"2005-10-07","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const forest = (): CardDef => ({"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const cloneCard = (): CardDef => ({"oracleId":"42226b87-0746-4ebf-9fd0-108d508462af","name":"Clone","manaCost":"{3}{U}","cmc":4,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"You may have this creature enter as a copy of any creature on the battlefield.","power":"0","toughness":"0","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/8/48c2e9e2-f679-451d-a700-18104af08988.jpg?1784013893","artUrl":"https://cards.scryfall.io/art_crop/front/4/8/48c2e9e2-f679-451d-a700-18104af08988.jpg?1784013893","commanderLegal":"legal","set":"sld","releasedAt":"2026-06-15","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const aesir = (): CardDef => ({"oracleId":"6afe197b-0779-4284-a192-357a3c89b7e3","name":"The Aesir Escape Valhalla","manaCost":"{2}{G}","cmc":3,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter.)\nI — Exile a permanent card from your graveyard. You gain life equal to its mana value.\nII — Put a number of +1/+1 counters on target creature you control equal to the mana value of the exiled card.\nIII — Return this Saga and the exiled card to their owner's hand.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/e/2efbcea0-53ba-444d-b2e0-6d184f945f92.jpg?1783910976","artUrl":"https://cards.scryfall.io/art_crop/front/2/e/2efbcea0-53ba-444d-b2e0-6d184f945f92.jpg?1783910976","commanderLegal":"legal","set":"acr","releasedAt":"2024-07-05","rarity":"uncommon","layout":"saga","gameChanger":false}) as CardDef;
/** Enduring Angel's rules text on a single-faced card: what a single-faced permanent copying it has (rulings). */
const flatAngel = (): CardDef => ({ ...angel(), name: "Test Flat Angel", layout: "normal", faces: undefined, oracleText: angel().faces![0]!.oracleText, keywords: ["Flying", "Double strike"] }) as CardDef;

describe("round 345: compiles", () => {
  it("every card of the round", () => supported(together(), angel(), brain(), aesir()));
});

describe("round 345: Last Night Together", () => {
  it("untaps two target creatures, makes them bigger, and adds a combat phase after this main phase only they can attack in", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const a = putOnBattlefield(s, ap, bears());
    const b = putOnBattlefield(s, ap, watchwolf());
    const other = putOnBattlefield(s, ap, bears());
    s.objects[a]!.tapped = true;
    const spell = put(s, ap, together(), "hand");
    s = settle(run(s, planCast(s, ap, spell, [tgt(a), tgt(b)])), ap);
    expect(s.objects[a]!.tapped).toBe(false);
    for (const id of [a, b]) {
      expect(s.objects[id]!.counters["+1/+1"]).toBe(2);
      const kw = characteristics(s, s.objects[id]!).keywords;
      expect(kw).toEqual(expect.arrayContaining(["Vigilance", "Indestructible", "Haste"]));
    }
    expect(s.objects[other]!.counters["+1/+1"]).toBeUndefined();
    // The added combat phase comes right after this main phase (CR 500.8): only the chosen creatures can attack in it.
    s = passUntil(s, "declareAttackers", ap);
    expect(s.thatCombat).toBeDefined();
    const ids = potentialAttackers(s, ap).map((o) => o.id);
    expect(ids).toEqual(expect.arrayContaining([a, b]));
    expect(ids).not.toContain(other);
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: other, defender: opp }] })).toThrow();
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
    // The turn's own combat phase afterwards has no such rule.
    for (let i = 0; i < 200 && !(s.step === "declareAttackers" && s.thatCombat === undefined && s.pending?.kind === "declareAttackers"); i++) s = s.pending ? (s.pending.player === ap && s.pending.kind === "declareAttackers" ? act(s, { type: "declareAttackers", player: ap, attacks: [] }) : run(s, botActions(s, s.pending.player))) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.step).toBe("declareAttackers");
    expect(s.thatCombat).toBeUndefined();
    expect(potentialAttackers(s, ap).map((o) => o.id)).toContain(other);
  });
});

describe("round 345: Enduring Angel", () => {
  it("life that would go to 0 or less: instead it transforms and the life total becomes 3", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const me = putOnBattlefield(s, ap, angel());
    s.players[ap]!.life = 2;
    const b = put(s, ap, bolt(), "hand");
    s = settle(run(s, planCast(s, ap, b, [{ kind: "player", id: ap }])), ap);
    expect(s.players[ap]!.lost).toBeFalsy();
    expect(s.players[ap]!.life).toBe(3);
    expect(name(s, me)).toBe("Angelic Enforcer");
    // Angelic Enforcer: power and toughness equal to your life total.
    expect(characteristics(s, s.objects[me]!).power).toBe(3);
    // Transformed, it has no such ability: the next lethal loss is lethal.
    const b2 = put(s, ap, bolt(), "hand");
    s = settle(run(s, planCast(s, ap, b2, [{ kind: "player", id: ap }])), ap);
    expect(s.players[ap]!.lost).toBe(true);
  });

  it("from more than 3 life, the life total goes down to 3; life loss that leaves more than 0 isn't replaced", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const me = putOnBattlefield(s, ap, angel());
    s.players[ap]!.life = 4;
    const b = put(s, ap, bolt(), "hand");
    s = settle(run(s, planCast(s, ap, b, [{ kind: "player", id: ap }])), ap);
    expect(s.players[ap]!.life).toBe(1);
    expect(name(s, me)).toBe("Enduring Angel");
    s.players[ap]!.life = 9;
    const b2 = put(s, ap, bolt(), "hand");
    s.players[ap]!.life = 3;
    s = settle(run(s, planCast(s, ap, b2, [{ kind: "player", id: ap }])), ap);
    expect(s.players[ap]!.life).toBe(3);
    expect(name(s, me)).toBe("Angelic Enforcer");
  });

  it("combat damage from several creatures at once is one event, replaced once", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const me = putOnBattlefield(s, ap, angel());
    s.objects[me]!.tapped = true;
    const w1 = putOnBattlefield(s, opp, watchwolf());
    const w2 = putOnBattlefield(s, opp, watchwolf());
    s = passUntil(s, "declareAttackers", opp);
    s.players[ap]!.life = 3;
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: w1, defender: ap }, { attacker: w2, defender: ap }] });
    for (let i = 0; i < 200 && s.step !== "end"; i++) s = s.pending ? (s.pending.player === ap && s.pending.kind === "declareBlockers" ? act(s, { type: "declareBlockers", player: ap, blocks: [] }) : run(s, botActions(s, s.pending.player))) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[ap]!.lost).toBeFalsy();
    expect(s.players[ap]!.life).toBe(3);
    expect(name(s, me)).toBe("Angelic Enforcer");
  });

  it("a permanent with the ability that can't transform: its controller loses the game (rulings)", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    supported(flatAngel());
    putOnBattlefield(s, ap, flatAngel());
    s.players[ap]!.life = 2;
    const b = put(s, ap, bolt(), "hand");
    s = settle(run(s, planCast(s, ap, b, [{ kind: "player", id: ap }])), ap);
    expect(s.players[ap]!.lost).toBe(true);
  });
});

describe("round 345: Extract Brain", () => {
  it("with X at least the hand size, every card is chosen; you may cast one of them from that hand, for free", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    for (const id of [...s.players[opp]!.hand]) {
      s.players[opp]!.hand.splice(s.players[opp]!.hand.indexOf(id), 1);
      s.players[opp]!.library.push(id);
      s.objects[id]!.zone = "library";
    }
    const bear = put(s, opp, bears(), "hand");
    const div = put(s, opp, divination(), "hand");
    const spell = put(s, ap, brain(), "hand");
    s = run(s, planCast(s, ap, spell, [{ kind: "player", id: opp }], undefined, undefined, 3));
    s = settle(s, ap);
    const p = pend(s, "chooseOption");
    expect(p.player).toBe(ap);
    expect(p.options).toEqual(expect.arrayContaining([bear, div, "none"]));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: bear }), ap);
    if (s.pending?.player === ap) s = settle(run(s, botActions(s, ap)), ap);
    expect(s.objects[bear]!.zone).toBe("battlefield");
    expect(s.objects[bear]!.owner).toBe(opp);
    expect(characteristics(s, s.objects[bear]!).controller).toBe(ap);
    expect(s.objects[div]!.zone).toBe("hand");
  });

  it("with fewer, the opponent chooses which; only those can be cast", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const bear = put(s, opp, bears(), "hand");
    const div = put(s, opp, divination(), "hand");
    const spell = put(s, ap, brain(), "hand");
    const handSize = s.players[opp]!.hand.length;
    s = run(s, planCast(s, ap, spell, [{ kind: "player", id: opp }], undefined, undefined, 1));
    s = settle(s, opp);
    const p = pend(s, "searchLibrary");
    expect(p.player).toBe(opp);
    expect(p.min).toBe(1);
    expect(p.max).toBe(1);
    expect(p.cards.length).toBe(handSize);
    s = settle(act(s, { type: "searchLibrary", player: opp, found: [div] }), ap);
    const c = pend(s, "chooseOption");
    expect(c.options).toEqual([div, "none"]);
    expect(c.options).not.toContain(bear);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "none" }), ap);
    expect(s.objects[div]!.zone).toBe("hand");
    expect(s.objects[spell]!.zone).toBe("graveyard");
  });

  it("X of 0 chooses nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    put(s, opp, bears(), "hand");
    const spell = put(s, ap, brain(), "hand");
    s = settle(run(s, planCast(s, ap, spell, [{ kind: "player", id: opp }], undefined, undefined, 0)), ap);
    expect(s.pending).toBeNull();
    expect(s.objects[spell]!.zone).toBe("graveyard");
    expect(s.log.some((l) => /chooses no cards/.test(l.text))).toBe(true);
  });
});

describe("round 345: The Aesir Escape Valhalla", () => {
  it("I exiles a permanent card from your graveyard and gains its mana value; II counts it; III returns the Saga and that card to hand", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const wolf = put(s, ap, watchwolf(), "graveyard");
    const div = put(s, ap, divination(), "graveyard");
    const target = putOnBattlefield(s, ap, bears());
    const saga = put(s, ap, aesir(), "hand");
    const life = s.players[ap]!.life;
    s = settle(run(s, planCast(s, ap, saga)), ap);
    const p = pend(s, "searchLibrary");
    expect(p.cards).toContain(wolf);
    expect(p.cards).not.toContain(div);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [wolf] }), ap);
    expect(s.objects[wolf]!.zone).toBe("exile");
    expect(s.players[ap]!.life).toBe(life + 2);
    // Chapter II on its controller's next turn: counters equal to the exiled card's mana value.
    s = passUntil(s, "main1", opp);
    s = settle(passUntil(s, "main1", ap), ap);
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(target)] }), ap);
    expect(s.objects[saga]!.counters.lore).toBe(2);
    expect(s.objects[target]!.counters["+1/+1"]).toBe(2);
    // Chapter III: both go back to their owner's hand.
    s = passUntil(s, "main1", opp);
    s = settle(passUntil(s, "main1", ap), ap);
    expect(s.objects[saga]!.zone).toBe("hand");
    expect(s.objects[wolf]!.zone).toBe("hand");
    expect(s.players[ap]!.hand).toEqual(expect.arrayContaining([saga, wolf]));
  });

  it("with no permanent card in the graveyard, nothing is exiled, no life is gained and chapter II puts no counters", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    put(s, ap, divination(), "graveyard");
    const target = putOnBattlefield(s, ap, bears());
    const saga = put(s, ap, aesir(), "hand");
    const life = s.players[ap]!.life;
    s = settle(run(s, planCast(s, ap, saga)), ap);
    if (s.pending?.kind === "searchLibrary") s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }), ap);
    expect(s.players[ap]!.life).toBe(life);
    s = passUntil(s, "main1", opp);
    s = settle(passUntil(s, "main1", ap), ap);
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(target)] }), ap);
    expect(s.objects[target]!.counters["+1/+1"]).toBeUndefined();
  });
});
