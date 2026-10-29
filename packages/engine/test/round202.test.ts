// Round 202: "Whenever a creature you control connives" (Iron Monger, Ultron, CR 701.50f), "you may have it connive. Do
// this only once each turn" (Baron Strucker), "Whenever ~ or another Dwarf you control enters and whenever an Equipment
// you control enters" (Giott, one trigger for a permanent that's both, CR 603.2c), "copy the next spell you cast this turn
// when you cast it" (Flamehold Grappler, Tzaangor Shaman), "copy it for each other instant and sorcery spell you've cast
// this turn" (Show of Confidence), "a noncreature spell with one or more blue mana symbols in its mana cost, create that
// many" (Namor), "a colorless artifact token named Scrap" (Farid), "create The Blackjack, a legendary 3/3 colorless Vehicle
// artifact token" (Setzer), "one or more goaded creatures deal combat damage to one of your opponents" (Puppet Master),
// "Whenever you activate an ability of a creature", mana abilities too (Elrond), "Vehicles you control become artifact
// creatures until end of turn. Creatures you control get +2/+0" (Start Your Engines), "When this token deals damage,
// sacrifice it" (Vrondiss), "each creature that entered the battlefield under your control this turn" (Shaile), "Whenever
// you turn a permanent face up" (Growing Dread), "can't cast instant or sorcery spells during that player's next turn"
// (Azor), "Whenever an opponent becomes the monarch, if you were the monarch as the turn began" (Knights of the Black
// Rose), "Whenever another player loses the game ... that player's life total as the turn began" (Sengir).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, castProblem, characteristics, compileCard, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, playerLoses, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Everyone passes until the stack is empty, answering "you may" with `may`, keeping copies' targets; stops at any other question. */
const settle = (s: GameState, may = true) => {
  for (let i = 0; i < 200 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: may });
    else if (p?.kind === "copyTargets") s = act(s, { type: "copyTargets", player: p.player });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const name = (s: GameState, id: ObjectId) => s.cards[s.objects[id]!.cardId]!.name;
const named = (s: GameState, n: string) => s.battlefield.filter((id) => characteristics(s, s.objects[id]!).name === n);
const creature = (n: string, sub: string, p: number, t = p, cost = "{G}") => card(n, `Creature — ${sub}`, cost, { cmc: cost.match(/\{/g)?.length ?? 0, power: String(p), toughness: String(t) });
const ping = card("Test Ping", "Instant", "{R}", { cmc: 1, oracleText: "This spell deals 1 damage to any target." });
const conniveSpell = card("Test Connive", "Instant", "{U}", { cmc: 1, oracleText: "Target creature you control connives." });

// Real oracle text (Scryfall).
const ironMongerSadisticTycoon = card("Iron Monger, Sadistic Tycoon", "Legendary Artifact Creature — Human Villain", "{2}{B}", {"cmc":3,"power":"2","toughness":"2","keywords":["Flying","Connive"],"oracleText":"Flying\nWhenever a creature you control connives, put a +1/+1 counter on each Villain you control.","colors":["B"],"colorIdentity":["B"],"layout":"normal"});
const ultronUnlimited = card("Ultron, Unlimited", "Legendary Artifact Creature — Robot Villain", "{1}{U}{B}", {"cmc":3,"power":"2","toughness":"2","keywords":["Flying","Connive"],"oracleText":"Flying\nWhenever Ultron attacks, he connives. (Draw a card, then discard a card. If you discarded a nonland card, put a +1/+1 counter on this creature.)\nWhenever a creature you control connives, you may pay {1}. If you do, create a 2/2 colorless Robot Villain artifact creature token.","colors":["B","U"],"colorIdentity":["B","U"],"layout":"normal"});
const baronStruckerHYDRAOverlord = card("Baron Strucker, HYDRA Overlord", "Legendary Creature — Human Villain", "{2}{B}", {"cmc":3,"power":"2","toughness":"2","keywords":["Connive"],"oracleText":"Villain spells you cast cost {1} less to cast.\nWhenever another Villain you control enters, you may have it connive. Do this only once each turn. (Draw a card, then discard a card. If you discarded a nonland card, put a +1/+1 counter on that creature.)","colors":["B"],"colorIdentity":["B"],"layout":"normal"});
const giottKingOfTheDwarves = card("Giott, King of the Dwarves", "Legendary Creature — Dwarf Noble", "{R}{W}", {"cmc":2,"power":"1","toughness":"1","keywords":["Double strike"],"oracleText":"Double strike\nWhenever Giott or another Dwarf you control enters and whenever an Equipment you control enters, you may discard a card. If you do, draw a card.","colors":["R","W"],"colorIdentity":["R","W"],"layout":"normal"});
const flameholdGrappler = card("Flamehold Grappler", "Creature — Human Monk", "{U}{R}{W}", {"cmc":3,"power":"3","toughness":"3","keywords":["First strike"],"oracleText":"First strike\nWhen this creature enters, copy the next spell you cast this turn when you cast it. You may choose new targets for the copy. (A copy of a permanent spell becomes a token.)","colors":["R","U","W"],"colorIdentity":["R","U","W"],"layout":"normal"});
const tzaangorShaman = card("Tzaangor Shaman", "Creature — Mutant Shaman", "{2}{U}{R}", {"cmc":4,"power":"3","toughness":"3","keywords":["Flying","Sorcerous Elixir"],"oracleText":"Flying\nSorcerous Elixir — Whenever this creature deals combat damage to a player, copy the next instant or sorcery spell you cast this turn when you cast it. You may choose new targets for the copy.","colors":["R","U"],"colorIdentity":["R","U"],"layout":"normal"});
const showOfConfidence = card("Show of Confidence", "Instant", "{1}{W}", {"cmc":2,"keywords":[],"oracleText":"When you cast this spell, copy it for each other instant and sorcery spell you've cast this turn. You may choose new targets for the copies.\nPut a +1/+1 counter on target creature. It gains vigilance until end of turn.","colors":["W"],"colorIdentity":["W"],"layout":"normal"});
const namorTheSubMariner = card("Namor the Sub-Mariner", "Legendary Creature — Mutant Merfolk Villain", "{1}{U}{U}", {"cmc":3,"power":"*","toughness":"4","keywords":["Flying"],"oracleText":"Flying\nNamor's power is equal to the number of Merfolk you control.\nWhenever you cast a noncreature spell with one or more blue mana symbols in its mana cost, create that many 1/1 blue Merfolk creature tokens.","colors":["U"],"colorIdentity":["U"],"layout":"normal"});
const faridEnterprisingSalvager = card("Farid, Enterprising Salvager", "Legendary Creature — Human Soldier", "{2}{R}", {"cmc":3,"power":"3","toughness":"3","keywords":["Goad"],"oracleText":"Whenever a nontoken artifact you control is put into a graveyard from the battlefield, create a colorless artifact token named Scrap.\n{1}{R}, Sacrifice an artifact: Choose one —\n• Put a +1/+1 counter on Farid. It gains menace until end of turn.\n• Goad target creature.\n• Discard a card, then draw a card.","colors":["R"],"colorIdentity":["R"],"layout":"normal"});
const setzerWanderingGambler = card("Setzer, Wandering Gambler", "Legendary Creature — Human Rogue Pilot", "{1}{B}{R}", {"cmc":3,"power":"2","toughness":"2","keywords":["Treasure"],"oracleText":"When Setzer enters, create The Blackjack, a legendary 3/3 colorless Vehicle artifact token with flying and crew 2.\nWhenever a Vehicle you control deals combat damage to a player, flip a coin.\nWhenever you win a coin flip, create two tapped Treasure tokens.","colors":["B","R"],"colorIdentity":["B","R"],"layout":"normal"});
const puppetMasterStringPuller = card("Puppet Master, String Puller", "Legendary Creature — Human Artificer Villain", "{2}{R}", {"cmc":3,"power":"2","toughness":"4","keywords":["Goad","Treasure"],"oracleText":"Whenever you attack, goad target creature an opponent controls. It can't block this turn. (Until your next turn, that creature attacks each combat if able and attacks a player other than you if able.)\nWhenever one or more goaded creatures deal combat damage to one of your opponents, create a Treasure token.","colors":["R"],"colorIdentity":["R"],"layout":"normal"});
const elrondMoonReader = card("Elrond, Moon-Reader", "Legendary Creature — Elf Noble", "{2}{U}", {"cmc":3,"power":"3","toughness":"3","keywords":[],"oracleText":"Whenever you activate an ability of a creature, draw a card. This ability triggers only once each turn.\n{5}{U}{U}: Exile up to two other target nonland permanents you control. Return those cards to the battlefield under their owner's control at the beginning of the next end step.","colors":["U"],"colorIdentity":["U"],"layout":"normal"});
const startYourEngines = card("Start Your Engines", "Sorcery", "{3}{R}", {"cmc":4,"keywords":[],"oracleText":"Vehicles you control become artifact creatures until end of turn. Creatures you control get +2/+0 until end of turn.","colors":["R"],"colorIdentity":["R"],"layout":"normal"});
const vrondissRageOfAncients = card("Vrondiss, Rage of Ancients", "Legendary Creature — Dragon Barbarian", "{3}{R}{G}", {"cmc":5,"power":"5","toughness":"4","keywords":["Enrage"],"oracleText":"Enrage — Whenever Vrondiss is dealt damage, you may create a 5/4 red and green Dragon Spirit creature token with \"When this token deals damage, sacrifice it.\"\nWhenever you roll one or more dice, you may have Vrondiss deal 1 damage to itself.","colors":["G","R"],"colorIdentity":["G","R"],"layout":"normal"});
const growingDread = card("Growing Dread", "Enchantment", "{G}{U}", {"cmc":2,"keywords":["Manifest","Manifest dread","Flash"],"oracleText":"Flash\nWhen this enchantment enters, manifest dread. (Look at the top two cards of your library. Put one onto the battlefield face down as a 2/2 creature and the other into your graveyard. Turn it face up any time for its mana cost if it's a creature card.)\nWhenever you turn a permanent face up, put a +1/+1 counter on it.","colors":["G","U"],"colorIdentity":["G","U"],"layout":"normal"});
const azorTheLawbringer = card("Azor, the Lawbringer", "Legendary Creature — Sphinx", "{2}{W}{W}{U}{U}", {"cmc":6,"power":"6","toughness":"6","keywords":["Flying"],"oracleText":"Flying\nWhen Azor enters, each opponent can't cast instant or sorcery spells during that player's next turn.\nWhenever Azor attacks, you may pay {X}{W}{U}{U}. If you do, you gain X life and draw X cards.","colors":["U","W"],"colorIdentity":["U","W"],"layout":"normal"});
const knightsOfTheBlackRose = card("Knights of the Black Rose", "Creature — Human Knight", "{3}{W}{B}", {"cmc":5,"power":"4","toughness":"4","keywords":[],"oracleText":"When this creature enters, you become the monarch.\nWhenever an opponent becomes the monarch, if you were the monarch as the turn began, that player loses 2 life and you gain 2 life.","colors":["B","W"],"colorIdentity":["B","W"],"layout":"normal"});
const sengirTheDarkBaron = card("Sengir, the Dark Baron", "Legendary Creature — Vampire Noble", "{4}{B}{B}", {"cmc":6,"power":"4","toughness":"4","keywords":["Flying","Partner"],"oracleText":"Flying\nWhenever another creature dies, put two +1/+1 counters on Sengir.\nWhenever another player loses the game, you gain life equal to that player's life total as the turn began.\nPartner (You can have two commanders if both have partner.)","colors":["B"],"colorIdentity":["B"],"layout":"normal"});
const shaileDeanOfRadiance = card("Shaile, Dean of Radiance", "Legendary Creature — Bird Cleric", "{1}{W}", {"cmc":2,"power":"1","toughness":"1","keywords":["Flying","Vigilance"],"oracleText":"Flying, vigilance\n{T}: Put a +1/+1 counter on each creature that entered the battlefield under your control this turn.","colors":["W"],"colorIdentity":["B","W"]});
const sphinxsDecree = card("Sphinx's Decree", "Sorcery", "{1}{W}", {"cmc":2,"keywords":[],"oracleText":"Each opponent can't cast instant or sorcery spells during that player's next turn.","colors":["W"],"colorIdentity":["W"]});
const shaileFull = card("Shaile, Dean of Radiance // Embrose, Dean of Shadow", "Legendary Creature — Bird Cleric // Legendary Creature — Human Warlock", "{1}{W}", {"cmc":2,"power":"1","toughness":"1","keywords":["Flying","Vigilance"],"oracleText":"Flying, vigilance\n{T}: Put a +1/+1 counter on each creature that entered the battlefield under your control this turn.","colors":["W"],"colorIdentity":["B","W"],"faces":[{"name":"Shaile, Dean of Radiance","manaCost":"{1}{W}","typeLine":"Legendary Creature — Bird Cleric","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Bird","Cleric"],"oracleText":"Flying, vigilance\n{T}: Put a +1/+1 counter on each creature that entered the battlefield under your control this turn.","power":"1","toughness":"1","colors":["W"],"imageUrl":"https://cards.scryfall.io/normal/front/9/3/938cee8f-ac2c-49a5-9ff7-1367d0edfabe.jpg?1783927332","artUrl":"https://cards.scryfall.io/art_crop/front/9/3/938cee8f-ac2c-49a5-9ff7-1367d0edfabe.jpg?1783927332"},{"name":"Embrose, Dean of Shadow","manaCost":"{2}{B}{B}","typeLine":"Legendary Creature — Human Warlock","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Warlock"],"oracleText":"{T}: Put a +1/+1 counter on another target creature, then Embrose deals 2 damage to that creature.\nWhenever a creature you control with a +1/+1 counter on it dies, draw a card.","power":"4","toughness":"4","colors":["B"],"imageUrl":"https://cards.scryfall.io/normal/back/9/3/938cee8f-ac2c-49a5-9ff7-1367d0edfabe.jpg?1783927332","artUrl":"https://cards.scryfall.io/art_crop/back/9/3/938cee8f-ac2c-49a5-9ff7-1367d0edfabe.jpg?1783927332"}],"layout":"modal_dfc"});

describe("round 202", () => {
  it("compiles every card of the round", () => {
    supported(ironMongerSadisticTycoon, ultronUnlimited, baronStruckerHYDRAOverlord, giottKingOfTheDwarves, flameholdGrappler, tzaangorShaman, showOfConfidence, namorTheSubMariner, faridEnterprisingSalvager, setzerWanderingGambler, puppetMasterStringPuller, elrondMoonReader, startYourEngines, vrondissRageOfAncients, shaileDeanOfRadiance, shaileFull, growingDread, azorTheLawbringer, sphinxsDecree, knightsOfTheBlackRose, sengirTheDarkBaron);
  });

  it("Iron Monger and Ultron: a creature you control conniving triggers both, after its counter (CR 701.50f)", () => {
    const villain = creature("Test Hench", "Human Villain", 1);
    let { s, ap, ids } = setup([conniveSpell, villain]);
    s.players[ap]!.hand = s.players[ap]!.hand.filter((id) => ids.includes(id));
    const monger = putOnBattlefield(s, ap, ironMongerSadisticTycoon);
    const ultron = putOnBattlefield(s, ap, ultronUnlimited);
    s.players[ap]!.manaPool.C = 1; // for Ultron's {1}
    s = run(s, planCast(s, ap, ids[0]!, [tgt(ultron)]));
    s = settle(s);
    // Connive: draw, then discard; the hand is the villain and the card drawn.
    expect(s.pending?.kind).toBe("discard");
    s = act(s, { type: "discard", player: ap, objectIds: [ids[1]!] });
    expect(s.objects[ultron]!.counters["+1/+1"]).toBe(1);
    s = settle(s);
    // Iron Monger: a +1/+1 counter on each Villain you control (both are Villains); Ultron: pay {1} for a Robot Villain.
    expect(s.objects[monger]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[ultron]!.counters["+1/+1"]).toBe(2);
    expect(named(s, "Robot Villain Token").length + named(s, "Robot Villain").length).toBe(1);
  });

  it("Baron Strucker: another Villain entering may connive, only once each turn (a no lets it ask again)", () => {
    const v1 = creature("Test Hench A", "Human Villain", 1);
    const v2 = creature("Test Hench B", "Human Villain", 1);
    const v3 = creature("Test Hench C", "Human Villain", 1);
    let { s, ap, ids } = setup([v1, v2, v3]);
    putOnBattlefield(s, ap, baronStruckerHYDRAOverlord);
    // The first one: say no; the second: yes (connive, discard the third); the third would not ask again this turn.
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s, false);
    expect(s.pending).toBeFalsy();
    s = run(s, planCast(s, ap, ids[1]!));
    s = settle(s, true);
    expect(s.pending?.kind).toBe("discard");
    s = act(s, { type: "discard", player: ap, objectIds: [s.players[ap]!.hand.find((id) => name(s, id) === "Bear" || name(s, id) === "Grizzly Bears" || name(s, id) === "Forest")!] });
    s = settle(s);
    const third = into(s, ap, v3, "hand");
    s = run(s, planCast(s, ap, third));
    s = settle(s, true);
    expect(s.pending).toBeFalsy(); // done once this turn: it doesn't trigger
    expect(s.stack.length).toBe(0);
  });

  it("Giott: a Dwarf or an Equipment entering triggers it; one that's both triggers it once (CR 603.2c)", () => {
    const dwarf = creature("Test Dwarf", "Dwarf Warrior", 1, 1, "{R}");
    const gear = card("Test Gear", "Artifact — Equipment", "{1}", { cmc: 1, oracleText: "Equipped creature gets +1/+0.\nEquip {1}" });
    const both = card("Test Dwarf Gear", "Artifact Creature — Equipment Dwarf", "{1}", { cmc: 1, power: "1", toughness: "1" });
    let { s, ap, ids } = setup([dwarf, gear, both]);
    putOnBattlefield(s, ap, giottKingOfTheDwarves);
    for (const id of ids) {
      s = run(s, planCast(s, ap, id));
      for (let i = 0; i < 20 && s.stack.length && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(s.pending?.kind, name(s, id)).toBe("chooseMay");
      s = act(s, { type: "chooseMay", player: ap, yes: false });
      expect(s.triggerQueue.length + s.stack.length, name(s, id)).toBe(0);
      expect(s.pending, name(s, id)).toBeFalsy();
    }
  });

  it("Flamehold Grappler: the next spell you cast this turn is copied as it's cast", () => {
    let { s, ap, ids, opp } = setup([flameholdGrappler, ping, ping]);
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s);
    const life = s.players[opp]!.life;
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }]));
    s = settle(s);
    expect(s.players[opp]!.life).toBe(life - 2);
    // Only the next one.
    s = run(s, planCast(s, ap, ids[2]!, [{ kind: "player", id: opp }]));
    s = settle(s);
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(JSON.stringify(compileCard(tzaangorShaman).triggers[0]!.body.effects)).toContain('"nextCast"');
  });

  it("Show of Confidence: a copy for each other instant and sorcery spell you've cast this turn, counted as the trigger resolves", () => {
    const bear = creature("Test Bear", "Bear", 2);
    let { s, ap, ids } = setup([ping, ping, showOfConfidence]);
    const b = putOnBattlefield(s, ap, bear);
    const dummy = putOnBattlefield(s, ap, creature("Test Dummy", "Wall", 0, 9));
    s = run(s, planCast(s, ap, ids[0]!, [tgt(dummy)]));
    s = settle(s);
    s = run(s, planCast(s, ap, ids[1]!, [tgt(dummy)]));
    s = settle(s);
    s = run(s, planCast(s, ap, ids[2]!, [tgt(b)]));
    s = settle(s);
    // Two copies and the spell: three counters, vigilance.
    expect(s.objects[b]!.counters["+1/+1"]).toBe(3);
    expect(objHasKeyword(s, s.objects[b]!, "Vigilance")).toBe(true);
  });

  it("Namor: a noncreature spell with blue mana symbols makes that many Merfolk; its power counts Merfolk", () => {
    const blue = card("Test Blue", "Sorcery", "{U}{U/R}{1}", { cmc: 3, oracleText: "Draw a card." });
    const red = card("Test Red", "Sorcery", "{R}", { cmc: 1, oracleText: "Draw a card." });
    const fish = creature("Test Fish", "Merfolk", 1, 1, "{U}");
    let { s, ap, ids } = setup([blue, red, fish]);
    const namor = putOnBattlefield(s, ap, namorTheSubMariner);
    expect(power(s, s.objects[namor]!)).toBe(1); // a Merfolk itself
    s = run(s, planCast(s, ap, ids[1]!));
    expect(s.triggerQueue.length + s.stack.filter((x) => x.kind === "ability").length).toBe(0);
    s = settle(s);
    s = run(s, planCast(s, ap, ids[2]!)); // a creature spell: no trigger
    s = settle(s);
    expect(power(s, s.objects[namor]!)).toBe(2);
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s);
    // {U} and the hybrid {U/R}: two blue mana symbols (CR 107.4e).
    expect(named(s, "Merfolk Token").length + named(s, "Merfolk").length).toBe(2);
    expect(power(s, s.objects[namor]!)).toBe(4);
  });

  it("Farid: a nontoken artifact you control put into a graveyard makes Scrap, a colorless artifact token with no abilities", () => {
    const shatter = card("Test Shatter", "Instant", "{R}", { cmc: 1, oracleText: "Destroy target artifact." });
    const rock = card("Test Rock", "Artifact", "{1}", { cmc: 1 });
    let { s, ap, ids } = setup([shatter, shatter]);
    putOnBattlefield(s, ap, faridEnterprisingSalvager);
    const r = putOnBattlefield(s, ap, rock);
    s = run(s, planCast(s, ap, ids[0]!, [tgt(r)]));
    s = settle(s);
    const scrap = named(s, "Scrap");
    expect(scrap.length).toBe(1);
    const c = characteristics(s, s.objects[scrap[0]!]!);
    expect([c.types, c.subtypes, c.colors]).toEqual([["Artifact"], [], []]);
    expect(compileCard(s.cards[s.objects[scrap[0]!]!.cardId]!).activated.length).toBe(0);
    // A token dying doesn't trigger it.
    s = run(s, planCast(s, ap, ids[1]!, [tgt(scrap[0]!)]));
    s = settle(s);
    expect(named(s, "Scrap").length).toBe(0);
  });

  it("Setzer: The Blackjack is a legendary 3/3 colorless Vehicle artifact token with flying and crew 2", () => {
    let { s, ap, ids } = setup([setzerWanderingGambler]);
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s);
    const [bj] = named(s, "The Blackjack");
    expect(bj).toBeTruthy();
    const c = characteristics(s, s.objects[bj!]!);
    expect(c.supertypes).toContain("Legendary");
    expect([c.types, c.subtypes, c.colors, c.power, c.toughness]).toEqual([["Artifact"], ["Vehicle"], [], 3, 3]);
    expect(objHasKeyword(s, s.objects[bj!]!, "Flying")).toBe(true);
    expect(s.objects[bj!]!.isToken).toBe(true);
    expect(s.cards[s.objects[bj!]!.cardId]!.oracleText).toContain("Crew 2");
  });

  it("Puppet Master: a goaded creature dealing combat damage to one of your opponents makes a Treasure", () => {
    let { s, ap, opp } = setup([]);
    const third = s.turnOrder[(s.turnOrder.indexOf(opp) + 1) % 4]!;
    putOnBattlefield(s, ap, puppetMasterStringPuller);
    const theirs = putOnBattlefield(s, opp, creature("Test Ox", "Ox", 3));
    const plain = putOnBattlefield(s, opp, creature("Test Yak", "Ox", 2));
    s.effects.push({ id: "g", timestamp: s.nextTimestamp++, controller: ap, sourceName: "Goad", duration: "yourNextTurn", turnOf: ap, affected: [theirs], mods: [{ kind: "goad" }] });
    invalidateCharacteristics(s);
    s = passUntil(s, "declareAttackers", opp);
    expect(s.pending?.kind).toBe("declareAttackers");
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: theirs, defender: third }, { attacker: plain, defender: third }] });
    const treasures = () => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === ap && characteristics(s, s.objects[id]!).subtypes.includes("Treasure")).length;
    for (let i = 0; i < 60 && s.step !== "end"; i++) {
      const p = s.pending;
      if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    // One Treasure: once for that opponent, though two creatures dealt damage (only one goaded).
    expect(s.players[third]!.life).toBe(35);
    expect(treasures()).toBe(1);
  });

  it("Elrond: activating an ability of a creature, a mana ability too, draws a card, once each turn", () => {
    const elf = card("Test Elf", "Creature — Elf Druid", "{G}", { cmc: 1, power: "1", toughness: "1", oracleText: "{T}: Add {G}." });
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, elrondMoonReader);
    const e1 = putOnBattlefield(s, ap, elf);
    const e2 = putOnBattlefield(s, ap, elf);
    const land = s.battlefield.find((id) => name(s, id) === "Forest" && controllerOf(s, s.objects[id]!) === ap)!;
    const hand = () => s.players[ap]!.hand.length;
    const h0 = hand();
    s = act(s, { type: "activateMana", player: ap, objectId: land, mana: "G" });
    s = settle(s);
    expect(hand()).toBe(h0); // a land's ability: no
    s = act(s, { type: "activateMana", player: ap, objectId: e1, mana: "G" });
    s = settle(s);
    expect(hand()).toBe(h0 + 1);
    s = act(s, { type: "activateMana", player: ap, objectId: e2, mana: "G" });
    s = settle(s);
    expect(hand()).toBe(h0 + 1); // only once each turn
  });

  it("Start Your Engines: Vehicles become artifact creatures, then all your creatures get +2/+0, until end of turn", () => {
    const wagon = card("Test Wagon", "Artifact — Vehicle", "{2}", { cmc: 2, power: "3", toughness: "3", oracleText: "Crew 1" });
    let { s, ap, ids } = setup([startYourEngines]);
    const v = putOnBattlefield(s, ap, wagon);
    const b = putOnBattlefield(s, ap, creature("Test Bear", "Bear", 2));
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s);
    const cv = characteristics(s, s.objects[v]!);
    expect(cv.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect([power(s, s.objects[v]!), toughness(s, s.objects[v]!)]).toEqual([5, 3]);
    expect([power(s, s.objects[b]!), toughness(s, s.objects[b]!)]).toEqual([4, 2]);
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    expect(characteristics(s, s.objects[v]!).types).toEqual(["Artifact"]);
    expect(power(s, s.objects[b]!)).toBe(2);
  });

  it("Vrondiss: its Dragon Spirit token is sacrificed when it deals damage", () => {
    const bite = card("Test Bite", "Sorcery", "{G}", { cmc: 1, oracleText: "Target creature you control deals damage equal to its power to target creature you don't control." });
    let { s, ap, ids, opp } = setup([ping, bite]);
    const v = putOnBattlefield(s, ap, vrondissRageOfAncients);
    const wall = putOnBattlefield(s, opp, creature("Test Wall", "Wall", 0, 9));
    s = run(s, planCast(s, ap, ids[0]!, [tgt(v)]));
    s = settle(s, true);
    const [dragon] = named(s, "Dragon Spirit Token").concat(named(s, "Dragon Spirit"));
    expect(dragon).toBeTruthy();
    expect([power(s, s.objects[dragon!]!), toughness(s, s.objects[dragon!]!)]).toEqual([5, 4]);
    s = run(s, planCast(s, ap, ids[1]!, [tgt(dragon!), tgt(wall)]));
    s = settle(s);
    expect(s.objects[wall]!.damage).toBe(5);
    expect(s.objects[dragon!]?.zone === "battlefield").toBe(false);
  });

  it("Shaile: a counter on each creature that entered the battlefield under your control this turn", () => {
    let { s, ap, ids } = setup([creature("Test Cub", "Bear", 2, 2, "{1}{G}")]);
    const shaile = putOnBattlefield(s, ap, shaileDeanOfRadiance);
    const old = putOnBattlefield(s, ap, creature("Test Old", "Bear", 2));
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s);
    s = run(s, planActivate(s, ap, shaile, 0));
    s = settle(s);
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[old]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.objects[shaile]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Growing Dread: turning a permanent face up puts a +1/+1 counter on it", () => {
    const cub = creature("Test Cub", "Bear", 2, 2, "{1}{G}");
    let { s, ap, ids } = setup([growingDread]);
    const top = [into(s, ap, cub, "library"), into(s, ap, cub, "library")];
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s);
    expect(s.pending?.kind).toBe("searchLibrary");
    s = act(s, { type: "searchLibrary", player: ap, found: [top[0]!] });
    s = settle(s);
    const fd = s.objects[top[0]!]!;
    expect([fd.zone, fd.faceDown]).toEqual(["battlefield", "manifest"]);
    s.players[ap]!.manaPool.G = 2;
    s = act(s, { type: "turnFaceUp", player: ap, objectId: top[0]! });
    s = settle(s);
    expect(s.objects[top[0]!]!.faceDown).toBeFalsy();
    expect(s.objects[top[0]!]!.counters["+1/+1"]).toBe(1);
  });

  it("Azor and Sphinx's Decree: opponents can't cast instants or sorceries during their next turn, only then", () => {
    let { s, ap, ids, opp } = setup([sphinxsDecree]);
    const zap = into(s, opp, ping, "hand");
    const banned = (st: GameState) => /can't cast/.test(castProblem(st, opp, zap, [{ kind: "player", id: ap }]) ?? "");
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s);
    s.players[opp]!.manaPool.R = 1;
    expect(banned(s)).toBe(false); // not their turn yet
    s = passUntil(s, "main1", opp);
    s.players[opp]!.manaPool.R = 1;
    expect(banned(s)).toBe(true);
    const next = s.turnOrder[(s.turnOrder.indexOf(opp) + 1) % 4]!;
    s = passUntil(s, "main1", next);
    s.players[opp]!.manaPool.R = 1;
    expect(banned(s)).toBe(false);
    expect(JSON.stringify(compileCard(azorTheLawbringer).triggers[0]!.body.effects)).toContain('"duringTheirNextTurn":true');
  });

  it("Knights of the Black Rose: an opponent becoming the monarch drains 2 only if you were the monarch as the turn began", () => {
    const crown = card("Test Crown", "Sorcery", "{1}", { cmc: 1, oracleText: "Target player becomes the monarch." });
    let { s, ap, ids, opp } = setup([crown, crown]);
    putOnBattlefield(s, ap, knightsOfTheBlackRose);
    s.monarch = ap;
    s.monarchAsTurnBegan = ap;
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }]));
    s = settle(s);
    expect(s.monarch).toBe(opp);
    expect([s.players[opp]!.life, s.players[ap]!.life]).toEqual([38, 42]);
    // Not the monarch as the turn began: nothing.
    s.monarch = ap;
    s.monarchAsTurnBegan = opp;
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }]));
    s = settle(s);
    expect([s.players[opp]!.life, s.players[ap]!.life]).toEqual([38, 42]);
  });

  it("Sengir: another player losing the game gains you their life total as the turn began", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, sengirTheDarkBaron);
    expect(s.lifeAsTurnBegan?.[opp]).toBe(40);
    s.players[opp]!.life = 3;
    playerLoses(s, opp, "test");
    s = settle(s);
    expect(s.players[ap]!.life).toBe(80);
  });
});
