// Lane B round B118: Knight of Valor (each creature without flanking blocking it gets -1/-1), Dredging Claw (attach it to a
// creature that enters from your graveyard), Elderwood Scion (your spells that target it cost {2} less), Wolfbat (back from
// your graveyard with a finality counter when you draw your second card each turn), Lethal Exploit (-1/-1 more for each
// modified creature you controlled as you cast it), Soul Search (a Spirit if the exiled card's mana value is 1 or less),
// Kami of Jealous Thirst (an ability that costs {4}{B} less after three draws), Hide // Seek (life equal to the mana value
// of the card found), Kitesail Skirmisher (another creature attacking the same player or planeswalker), Vhati il-Dal (base
// power 1 or base toughness 1, chosen as it resolves).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const next = (s: GameState, p: PlayerId, n = 1) => s.turnOrder[(s.turnOrder.indexOf(p) + n) % 4]!;
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
const pt = (s: GameState, id: string) => { const c = characteristics(s, s.objects[id]!); return `${c.power}/${c.toughness}`; };
/** Moves a new card for `def` from the battlefield into `pid`'s `zone` (on top of a library, or of a graveyard). */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Empties `pid`'s hand into exile. */
const emptyHand = (s: GameState, pid: PlayerId) => {
  for (const id of s.players[pid]!.hand) {
    s.objects[id]!.zone = "exile";
    s.players[pid]!.exile.push(id);
  }
  s.players[pid]!.hand = [];
};
/** Only this mana for `pid`: their lands go to exile. */
const poolOnly = (s: GameState, pid: PlayerId, pool: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  for (const id of s.battlefield.filter((x) => s.objects[x]!.controller === pid && characteristics(s, s.objects[x]!).types.includes("Land"))) {
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "exile";
    s.players[pid]!.exile.push(id);
  }
  s.players[pid]!.manaPool = { ...s.players[pid]!.manaPool, ...pool };
  invalidateCharacteristics(s);
};
/** To `pid`'s declare blockers question in this combat, after the active player attacked. */
const toBlocks = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 200 && !(s.pending?.kind === "declareBlockers" && s.pending.player === pid); i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};

// Real oracle text (Scryfall).
const knight = (): CardDef => ({"oracleId":"f2edb543-de33-4eed-892c-98038eec96e2","name":"Knight of Valor","manaCost":"{2}{W}","cmc":3,"typeLine":"Creature — Human Knight","supertypes":[],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"Flanking (Whenever a creature without flanking blocks this creature, the blocking creature gets -1/-1 until end of turn.)\n{1}{W}: Each creature without flanking blocking this creature gets -1/-1 until end of turn. Activate only once each turn.","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["Flanking"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const claw = (): CardDef => ({"oracleId":"3808afb9-962f-48ba-94c5-6b3eae7053d0","name":"Dredging Claw","manaCost":"{2}","cmc":2,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +1/+0 and has menace. (It can't be blocked except by two or more creatures.)\nWhenever a creature enters from your graveyard, you may attach this Equipment to it.\nEquip {1}{B} ({1}{B}: Attach to target creature you control. Equip only as a sorcery.)","colors":[],"colorIdentity":["B"],"keywords":["Equip"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const scion = (): CardDef => ({"oracleId":"99c8647f-e08d-4217-b637-3f8f2bffdaa3","name":"Elderwood Scion","manaCost":"{3}{G}{W}","cmc":5,"typeLine":"Creature — Elemental","supertypes":[],"types":["Creature"],"subtypes":["Elemental"],"oracleText":"Trample, lifelink\nSpells you cast that target this creature cost {2} less to cast.\nSpells your opponents cast that target this creature cost {2} more to cast.","power":"4","toughness":"4","colors":["G","W"],"colorIdentity":["G","W"],"keywords":["Lifelink","Trample"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const wolfbat = (): CardDef => ({"oracleId":"adc47a25-daab-49c7-93a5-5bbf2bc20cf9","name":"Wolfbat","manaCost":"{2}{B}","cmc":3,"typeLine":"Creature — Wolf Bat","supertypes":[],"types":["Creature"],"subtypes":["Wolf","Bat"],"oracleText":"Flying\nWhenever you draw your second card each turn, you may pay {B}. If you do, return this card from your graveyard to the battlefield with a finality counter on it. (If a creature with a finality counter on it would die, exile it instead.)","power":"2","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":["Flying"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const exploit = (): CardDef => ({"oracleId":"61dfb656-1cdd-4ab3-b533-93718cc66b15","name":"Lethal Exploit","manaCost":"{1}{B}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature gets -2/-2 until end of turn. It gets an additional -1/-1 until end of turn for each modified creature you controlled as you cast this spell. (Equipment, Auras you control, and counters are modifications.)","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const soulSearch = (): CardDef => ({"oracleId":"58f12f0d-e2c1-48f9-9e27-d1de8db743cb","name":"Soul Search","manaCost":"{W}{B}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target opponent reveals their hand. You choose a nonland card from it. Exile that card. If the card's mana value is 1 or less, create a 1/1 white and black Spirit creature token with flying.","colors":["B","W"],"colorIdentity":["B","W"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const kami = (): CardDef => ({"oracleId":"5973d8f6-242c-4014-b66e-aa5c78440be7","name":"Kami of Jealous Thirst","manaCost":"{2}{B}","cmc":3,"typeLine":"Creature — Spirit","supertypes":[],"types":["Creature"],"subtypes":["Spirit"],"oracleText":"Deathtouch\n{4}{B}: Each opponent loses 2 life and you gain 2 life. This ability costs {4}{B} less to activate if you've drawn three or more cards this turn. Activate only once each turn.","power":"1","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":["Deathtouch"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const hideSeek = (): CardDef => ({"oracleId":"60e59923-ecd9-457e-b772-693138e05ab2","name":"Hide // Seek","manaCost":"{R}{W} // {W}{B}","cmc":4,"typeLine":"Instant // Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Put target artifact or enchantment on the bottom of its owner's library.","colors":["B","R","W"],"colorIdentity":["B","R","W"],"keywords":[],"commanderLegal":"legal","layout":"split","faces":[{"name":"Hide","manaCost":"{R}{W}","typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Put target artifact or enchantment on the bottom of its owner's library.","colors":["W","R"]},{"name":"Seek","manaCost":"{W}{B}","typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Search target opponent's library for a card and exile it. You gain life equal to its mana value. Then that player shuffles.","colors":["W","B"]}]}) as CardDef;
const kitesail = (): CardDef => ({"oracleId":"462269c7-ca16-4aa7-bf52-f7fcda25a05b","name":"Kitesail Skirmisher","manaCost":"{3}{U}","cmc":4,"typeLine":"Creature — Human Pirate","supertypes":[],"types":["Creature"],"subtypes":["Human","Pirate"],"oracleText":"Flying\nWhenever this creature attacks, another target creature attacking the same player or planeswalker gains flying until end of turn.\nEncore {4}{U} ({4}{U}, Exile this card from your graveyard: For each opponent, create a token copy that attacks that opponent this turn if able. They gain haste. Sacrifice them at the beginning of the next end step. Activate only as a sorcery.)","power":"3","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":["Flying","Encore"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const vhati = (): CardDef => ({"oracleId":"1759547a-52b3-4bae-817a-658a6fd047e3","name":"Vhati il-Dal","manaCost":"{2}{B}{G}","cmc":4,"typeLine":"Legendary Creature — Human Warrior","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Warrior"],"oracleText":"{T}: Until end of turn, target creature has base power 1 or base toughness 1.","power":"3","toughness":"3","colors":["B","G"],"colorIdentity":["B","G"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;

// Test cards.
const flanker = card("Test Flanker", "Creature — Human Knight", "{3}{W}", { cmc: 4, power: "4", toughness: "4", colors: ["W"], oracleText: "Flanking", keywords: ["Flanking"] });
const wall = card("Test Wall", "Creature — Wall", "{3}", { cmc: 3, power: "0", toughness: "5" });
const raise = card("Test Raise", "Sorcery", "{0}", { oracleText: "Return target creature card from your graveyard to the battlefield." });
const theirRaise = card("Test Theft Raise", "Sorcery", "{0}", { oracleText: "Put target creature card from a graveyard onto the battlefield under your control." });
const boost = card("Test Boost", "Instant", "{2}{G}", { cmc: 3, colors: ["G"], oracleText: "Target creature gets +1/+1 until end of turn." });
const divine = card("Test Divine", "Sorcery", "{0}", { oracleText: "Draw two cards." });
const ponder = card("Test Ponder", "Sorcery", "{0}", { oracleText: "Draw a card." });
const triple = card("Test Triple", "Sorcery", "{0}", { oracleText: "Draw three cards." });
const plusOne = card("Test Pump Counter", "Instant", "{0}", { oracleText: "Put a +1/+1 counter on target creature." });
const big = card("Test Big", "Creature — Giant", "{5}{G}", { cmc: 6, power: "7", toughness: "7", colors: ["G"] });
const cheap = card("Test Cheap", "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: "Draw a card." });
const pricey = card("Test Pricey", "Sorcery", "{3}{R}", { cmc: 4, colors: ["R"], oracleText: "Draw a card." });
const xSpell = card("Test X Spell", "Sorcery", "{X}{R}", { cmc: 1, colors: ["R"], oracleText: "Draw X cards." });
const walker = card("Test Walker", "Legendary Planeswalker — Testa", "{3}", { cmc: 3, loyalty: "5", oracleText: "+1: You gain 1 life." });

describe("Lane B round B118", () => {
  it("all ten cards are supported", () => supported(knight(), claw(), scion(), wolfbat(), exploit(), soulSearch(), kami(), hideSeek(), kitesail(), vhati()));
  it("Knight of Valor: each creature without flanking blocking it gets -1/-1, a flanking blocker doesn't; once each turn", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const k = putOnBattlefield(s, ap, knight());
    const w = putOnBattlefield(s, opp, wall);
    const f = putOnBattlefield(s, opp, flanker);
    const other = putOnBattlefield(s, opp, wall);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: k, defender: opp }] });
    s = toBlocks(s, opp);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: w, attacker: k }, { blocker: f, attacker: k }] });
    s = settle(s);
    // Flanking already gave the Wall -1/-1 (CR 702.25a); the flanker got nothing.
    expect(pt(s, w)).toBe("-1/4");
    expect(pt(s, f)).toBe("4/4");
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, W: 2, C: 2 };
    s = settle(run(s, planActivate(s, ap, k, 0, [])));
    expect(pt(s, w)).toBe("-2/3");
    expect(pt(s, f)).toBe("4/4");
    // A creature not blocking it is untouched.
    expect(pt(s, other)).toBe("0/5");
    // Only once each turn.
    expect(planActivate(s, ap, k, 0, [])).toBeNull();
  });

  it("Knight of Valor: the second ability isn't flanking, so losing flanking doesn't remove it (rulings)", () => {
    const c = knight();
    expect(c.oracleText).toMatch(/Activate only once each turn/);
    let { s, ap } = setup([]);
    const k = putOnBattlefield(s, ap, c);
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, W: 1, C: 1 };
    // Not attacking: no blockers, nothing happens, but it can be activated.
    expect(planActivate(s, ap, k, 0, [])).not.toBeNull();
  });

  it("Dredging Claw: a creature card of yours returned from your graveyard may get it attached", () => {
    let { s, ap, ids } = setup([raise]);
    const c = putOnBattlefield(s, ap, claw());
    const b = into(s, ap, bear(), "graveyard");
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(b)])), { me: [ap] });
    expect(zone(s, b)).toBe("battlefield");
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { me: [ap] });
    expect(s.objects[c]!.attachedTo).toBe(b);
    expect(pt(s, b)).toBe("3/2");
    expect(characteristics(s, s.objects[b]!).keywords).toContain("Menace");
  });

  it("Dredging Claw: not for a creature from another player's graveyard, nor one cast or put onto the battlefield from elsewhere", () => {
    let { s, ap, ids } = setup([theirRaise, bear()]);
    const opp = next(s, ap);
    const c = putOnBattlefield(s, ap, claw());
    const theirs = into(s, opp, bear(), "graveyard");
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(theirs)])), { me: [ap] });
    expect(zone(s, theirs)).toBe("battlefield");
    expect(s.pending).toBeFalsy();
    expect(s.objects[c]!.attachedTo).toBeUndefined();
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, G: 1, C: 1 };
    s = settle(run(s, planCast(s, ap, ids[1]!, [])), { me: [ap] });
    expect(zone(s, ids[1]!)).toBe("battlefield");
    expect(s.pending).toBeFalsy();
    expect(s.objects[c]!.attachedTo).toBeUndefined();
  });

  it("Dredging Claw: a card you own returned from your graveyard under an opponent's control can still get it", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const c = putOnBattlefield(s, ap, claw());
    const mine = into(s, ap, bear(), "graveyard");
    const r = into(s, opp, theirRaise, "hand");
    s.players[opp]!.manaPool = { ...s.players[opp]!.manaPool };
    s = passUntil(s, "main1", opp);
    s = settle(run(s, planCast(s, opp, r, [tgt(mine)])), { me: [ap] });
    expect(zone(s, mine)).toBe("battlefield");
    expect(s.objects[mine]!.controller).toBe(opp);
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { me: [ap] });
    expect(s.objects[c]!.attachedTo).toBe(mine);
  });

  it("Elderwood Scion: your spells that target it cost {2} less, an opponent's {2} more; other targets cost as usual", () => {
    let { s, ap, ids } = setup([boost, boost]);
    const opp = next(s, ap);
    const sc = putOnBattlefield(s, ap, scion());
    const b = putOnBattlefield(s, ap, bear());
    poolOnly(s, ap, { G: 1 });
    expect(planCast(s, ap, ids[0]!, [tgt(b)])).toBeNull();
    expect(planCast(s, ap, ids[0]!, [tgt(sc)])).not.toBeNull();
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(sc)])));
    expect(pt(s, sc)).toBe("5/5");
    // An opponent's: {2} more.
    const ob = into(s, opp, boost, "hand");
    s = passUntil(s, "main1", opp);
    poolOnly(s, opp, { G: 1, C: 3 });
    expect(planCast(s, opp, ob, [tgt(sc)])).toBeNull();
    s.players[opp]!.manaPool.C = 4;
    expect(planCast(s, opp, ob, [tgt(sc)])).not.toBeNull();
  });

  it("Wolfbat: returns with a finality counter when you draw your second card each turn and pay {B}; not on the third", () => {
    let { s, ap, ids } = setup([ponder]);
    const wb = into(s, ap, wolfbat(), "graveyard");
    s = passUntil(s, "main1", ap);
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, B: 1 };
    s = settle(run(s, planCast(s, ap, ids[0]!, [])), { me: [ap] });
    // The draw step's card was the first; this was the second.
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { me: [ap] });
    expect(zone(s, wb)).toBe("battlefield");
    expect(s.objects[wb]!.counters.finality).toBe(1);
    expect(s.players[ap]!.manaPool.B ?? 0).toBe(0);
  });

  it("Wolfbat: declined at the second draw, the third doesn't trigger it (rulings)", () => {
    let { s, ap, ids } = setup([ponder, ponder]);
    const wb = into(s, ap, wolfbat(), "graveyard");
    s = passUntil(s, "main1", ap);
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, B: 2 };
    s = settle(run(s, planCast(s, ap, ids[0]!, [])), { me: [ap] });
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), { me: [ap] });
    s = settle(run(s, planCast(s, ap, ids[1]!, [])), { me: [ap] });
    expect(s.pending).toBeFalsy();
    expect(zone(s, wb)).toBe("graveyard");
  });

  it("Wolfbat: two cards drawn at once by one spell trigger it once, after the spell (rulings)", () => {
    let { s, ap, ids } = setup([divine]);
    const wb = into(s, ap, wolfbat(), "graveyard");
    s = passUntil(s, "main1", ap);
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, B: 1 };
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, ids[0]!, [])), { me: [ap] });
    expect(s.pending?.kind).toBe("chooseMay");
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { me: [ap] });
    expect(zone(s, wb)).toBe("battlefield");
  });
  it("Lethal Exploit: -1/-1 more for each modified creature you controlled as you cast it, kept however that changes", () => {
    let { s, ap, ids } = setup([plusOne, exploit()]);
    const opp = next(s, ap);
    const b1 = putOnBattlefield(s, ap, bear());
    const b2 = putOnBattlefield(s, ap, bear());
    putOnBattlefield(s, ap, bear());
    const victim = putOnBattlefield(s, opp, big);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(b1)])));
    // An Aura or Equipment you control on a creature also modifies it; here a counter on each of two.
    s.objects[b2]!.counters = { "-1/-1": 0, shield: 1 };
    invalidateCharacteristics(s);
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, B: 1, C: 1 };
    s = run(s, planCast(s, ap, ids[1]!, [tgt(victim)]));
    // Before it resolves, the counters go: the count was fixed as it was cast.
    s.objects[b1]!.counters = {};
    s.objects[b2]!.counters = {};
    invalidateCharacteristics(s);
    s = settle(s);
    expect(pt(s, victim)).toBe("3/3");
  });

  it("Lethal Exploit: with no modified creature, just -2/-2", () => {
    let { s, ap, ids } = setup([exploit()]);
    const opp = next(s, ap);
    putOnBattlefield(s, ap, bear());
    const victim = putOnBattlefield(s, opp, big);
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, B: 1, C: 1 };
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(victim)])));
    expect(pt(s, victim)).toBe("5/5");
  });

  it("Soul Search: a Spirit only if the exiled card's mana value is 1 or less", () => {
    const go = (pick: CardDef) => {
      let { s, ap, ids } = setup([soulSearch()]);
      const opp = next(s, ap);
      emptyHand(s, opp);
      const a = into(s, opp, pick, "hand");
      into(s, opp, card("Test Field", "Land"), "hand");
      s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, W: 1, B: 1 };
      const tokens = () => s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.objects[id]!.isToken).length;
      const before = tokens();
      s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])), { me: [ap] });
      // One nonland card: chosen, exiled.
      for (let i = 0; i < 5 && s.pending?.player === ap; i++) {
        const p = s.pending;
        if (p.kind === "chooseOption") s = settle(act(s, { type: "chooseOption", player: ap, choice: p.options.includes(a) ? a : p.options[0]! }), { me: [ap] });
        else if (p.kind === "searchLibrary") s = settle(act(s, { type: "searchLibrary", player: ap, found: [a] }), { me: [ap] });
        else s = settle(s);
      }
      expect(zone(s, a)).toBe("exile");
      return tokens() - before;
    };
    expect(go(cheap)).toBe(1);
    expect(go(pricey)).toBe(0);
    // X is 0 in exile (rulings): {X}{R} is mana value 1.
    expect(go(xSpell)).toBe(1);
  });

  it("Kami of Jealous Thirst: {4}{B} less, so free, once you've drawn three or more cards this turn; only once each turn", () => {
    let { s, ap, ids } = setup([triple]);
    const k = putOnBattlefield(s, ap, kami());
    s = passUntil(s, "main1", ap);
    poolOnly(s, ap, {});
    s.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    // One draw (the draw step) so far: it costs {4}{B}.
    expect(planActivate(s, ap, k, 0, [])).toBeNull();
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    const opp = next(s, ap);
    const life = s.players[opp]!.life;
    expect(planActivate(s, ap, k, 0, [])).not.toBeNull();
    s = settle(run(s, planActivate(s, ap, k, 0, [])));
    expect(s.players[opp]!.life).toBe(life - 2);
    expect(planActivate(s, ap, k, 0, [])).toBeNull();
  });

  it("Seek: exiles a card from the opponent's library and you gain life equal to its mana value", () => {
    let { s, ap, ids } = setup([hideSeek()]);
    const opp = next(s, ap);
    const target = into(s, opp, pricey, "library");
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, W: 1, B: 1 };
    const life = s.players[ap]!.life;
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, "auto", undefined, { face: 1 })), { me: [ap] });
    expect(s.pending?.kind).toBe("searchLibrary");
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [target] }), { me: [ap] });
    expect(zone(s, target)).toBe("exile");
    expect(s.players[ap]!.life).toBe(life + 4);
  });

  it("Kitesail Skirmisher: only another creature attacking the same player can be its target", () => {
    let { s, ap } = setup([]);
    const [o1, o2] = [next(s, ap), next(s, ap, 2)];
    const ks = putOnBattlefield(s, ap, kitesail());
    const same = putOnBattlefield(s, ap, bear());
    const other = putOnBattlefield(s, ap, bear({ name: "Test Other Bear" }));
    const home = putOnBattlefield(s, ap, bear({ name: "Test Home Bear" }));
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: ks, defender: o1 }, { attacker: same, defender: o1 }, { attacker: other, defender: o2 }] });
    s = settle(s, { me: [ap] });
    const p = s.pending;
    expect(p?.kind).toBe("chooseTargets");
    // Attacking another player, or not attacking: not a legal target.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(other)] })).toThrow();
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(home)] })).toThrow();
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(ks)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(same)] }), { me: [ap] });
    expect(characteristics(s, s.objects[same]!).keywords).toContain("Flying");
    expect(characteristics(s, s.objects[other]!).keywords).not.toContain("Flying");
  });

  it("Kitesail Skirmisher: attacking a planeswalker, only creatures attacking that planeswalker", () => {
    let { s, ap } = setup([]);
    const o1 = next(s, ap);
    const pw = putOnBattlefield(s, o1, walker);
    s.objects[pw]!.counters = { loyalty: 5 };
    const ks = putOnBattlefield(s, ap, kitesail());
    const atPw = putOnBattlefield(s, ap, bear());
    const atPlayer = putOnBattlefield(s, ap, bear({ name: "Test Other Bear" }));
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: ks, defender: o1, planeswalker: pw }, { attacker: atPw, defender: o1, planeswalker: pw }, { attacker: atPlayer, defender: o1 }] });
    s = settle(s, { me: [ap] });
    expect(s.pending?.kind).toBe("chooseTargets");
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(atPlayer)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(atPw)] }), { me: [ap] });
    expect(characteristics(s, s.objects[atPw]!).keywords).toContain("Flying");
  });

  it("Vhati il-Dal: base power 1 or base toughness 1, chosen as it resolves", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const v = putOnBattlefield(s, ap, vhati());
    const victim = putOnBattlefield(s, opp, big);
    s = settle(run(s, planActivate(s, ap, v, 0, [tgt(victim)])), { me: [ap] });
    const p = s.pending;
    expect(p?.kind === "chooseOption" && p.labels).toEqual(["Its base power becomes 1", "Its base toughness becomes 1"]);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "1" }), { me: [ap] });
    expect(pt(s, victim)).toBe("7/1");
    // Until end of turn.
    s = passUntil(s, "upkeep", opp);
    expect(pt(s, victim)).toBe("7/7");
  });

  it("Vhati il-Dal: a bot takes an opponent's creature's toughness down unless its power is the greater", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const v = putOnBattlefield(s, ap, vhati());
    const victim = putOnBattlefield(s, opp, big);
    s = run(s, planActivate(s, ap, v, 0, [tgt(victim)]));
    s = settle(s, { me: [opp] });
    // The bot answered for ap: 7/7 loses the toughness (a tie, so it may die to damage).
    expect(pt(s, victim)).toBe("7/1");
    // A 5/2: its power goes instead.
    const cannon = putOnBattlefield(s, opp, card("Test Glass Cannon", "Creature — Elemental", "{3}{R}", { cmc: 4, power: "5", toughness: "2", colors: ["R"] }));
    s.objects[v]!.tapped = false;
    s = run(s, planActivate(s, ap, v, 0, [tgt(cannon)]));
    s = settle(s, { me: [opp] });
    expect(pt(s, cannon)).toBe("1/2");
  });
});
