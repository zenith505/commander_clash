// Round 220: fresh cards from EDHREC rank 5,800 on: Depala, Pilot Exemplar (Vehicle creatures, a paid reveal of X),
// The Invincible Iron Man (an Equipment put from your hand attached to it), Ratonhnhaké꞉ton (a reflexive trigger about
// the token created), Lizard, Connors's Curse, Mathas, Fiend Seeker (an ability granted while a counter stays), One with
// the Kami (enchanted creature or another modified creature), Bumi, King of Three Trials ("choose up to X"),
// Sensational Spider-Man (remove up to three stun counters from among all permanents), Zimone and Dina ("repeat this
// process once"), Boxing Ring (a fight with the same mana value, "a creature that fought this turn").

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, scry, setup } from "./helpers";
import { applyAction, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, objIsType, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/**
 * Everyone passes until the stack is empty, answering "you may" with `may` and trigger targets with `targets`; other
 * players' questions are answered as the bots would. Stops at any other question of `me`'s.
 */
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
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
/** Passes (bots answer their own questions) until `me` is asked something. */
const untilAsked = (s: GameState, me: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending) && s.pending?.player !== me; i++) s = s.pending ? act(s, botActions(s, s.pending.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const nameOf = (s: GameState, id: ObjectId) => s.cards[s.objects[id]!.cardId]!.name;
const emptyHand = (s: GameState, pid: PlayerId) => s.players[pid]!.hand.splice(0).forEach((id) => (s.objects[id]!.zone = "exile"));
/** Attack with `attacks`, nobody blocks; stops at `me`'s first question or once combat is over. */
const attack = (s: GameState, me: PlayerId, attacks: { attacker: ObjectId; defender: PlayerId }[], stopAtMine = true) => {
  s = act(s, { type: "declareAttackers", player: me, attacks });
  for (let i = 0; i < 80 && s.step !== "endCombat" && s.step !== "main2"; i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p && p.player === me && stopAtMine) return s;
    else if (p) s = act(s, botActions(s, p.player)[0]!);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};

// Real oracle text (Scryfall).
const depalaPilotExe = card("Depala, Pilot Exemplar", "Legendary Creature — Dwarf Pilot", "{1}{R}{W}", {"cmc":3,"oracleText":"Other Dwarves you control get +1/+1.\nEach Vehicle you control gets +1/+1 as long as it's a creature.\nWhenever Depala becomes tapped, you may pay {X}. If you do, reveal the top X cards of your library, put all Dwarf and Vehicle cards from among them into your hand, then put the rest on the bottom of your library in a random order.","power":"3","toughness":"3","keywords":[],"layout":"normal"});
const tonyStarkTheIn = scry("modal_dfc", [{"name":"Tony Stark","mana_cost":"{1}{U}","type_line":"Legendary Creature — Human Artificer Hero","oracle_text":"{1}, {T}: Look at the top four cards of your library. You may reveal an artifact card from among them and put it into your hand. Put the rest on the bottom of your library in a random order.\n{4}{U}{R}: Transform Tony Stark. Activate only as a sorcery.","power":"1","toughness":"3"},{"name":"The Invincible Iron Man","mana_cost":"{4}{U}{R}","type_line":"Legendary Artifact Creature — Human Hero","oracle_text":"Flying, haste\nAt the beginning of combat on your turn, you may put an artifact card from your hand onto the battlefield. If it's an Equipment, attach it to The Invincible Iron Man.","power":"5","toughness":"5"}], { keywords: ["Flying","Transform","Haste"] });
const ratonhnhakton = card("Ratonhnhaké꞉ton", "Legendary Creature — Human Assassin", "{W}{U}{B}", {"cmc":3,"oracleText":"As long as Ratonhnhaké꞉ton hasn't dealt damage yet, it has hexproof and can't be blocked.\nWhenever Ratonhnhaké꞉ton deals combat damage to a player, create a 1/1 black Assassin creature token with menace. When you do, return target Equipment card from your graveyard to the battlefield, then attach it to that token.","power":"3","toughness":"3","keywords":[],"layout":"normal"});
const lizardConnorss = card("Lizard, Connors's Curse", "Legendary Creature — Lizard Villain", "{2}{G}{G}", {"cmc":4,"oracleText":"Trample\nLizard Formula — When Lizard, Connors's Curse enters, up to one other target creature loses all abilities and becomes a green Lizard creature with base power and toughness 4/4.","power":"5","toughness":"5","keywords":["Lizard Formula","Trample"],"layout":"normal"});
const mathasFiendSee = card("Mathas, Fiend Seeker", "Legendary Creature — Vampire", "{R}{W}{B}", {"cmc":3,"oracleText":"Menace\nAt the beginning of your end step, put a bounty counter on target creature an opponent controls. For as long as that creature has a bounty counter on it, it has \"When this creature dies, each opponent draws a card and gains 2 life.\"","power":"3","toughness":"3","keywords":["Menace"],"layout":"normal"});
const onewiththeKami = card("One with the Kami", "Enchantment — Aura", "{3}{G}", {"cmc":4,"oracleText":"Flash\nEnchant creature you control\nWhenever enchanted creature or another modified creature you control dies, create X 1/1 colorless Spirit creature tokens, where X is that creature's power. (Equipment, Auras you control, and counters are modifications.)","keywords":["Enchant","Flash"],"layout":"normal"});
const bumiKingofThre = card("Bumi, King of Three Trials", "Legendary Creature — Human Noble Ally", "{5}{G}", {"cmc":6,"oracleText":"When Bumi enters, choose up to X, where X is the number of Lesson cards in your graveyard —\n• Put three +1/+1 counters on Bumi.\n• Target player scries 3.\n• Earthbend 3. (Target land you control becomes a 0/0 creature with haste that's still a land. Put three +1/+1 counters on it. When it dies or is exiled, return it to the battlefield tapped.)","power":"4","toughness":"4","keywords":["Earthbend","Scry"],"layout":"normal"});
const sensationalSpi = card("Sensational Spider-Man", "Legendary Creature — Spider Human Hero", "{1}{W}{U}", {"cmc":3,"oracleText":"Whenever Sensational Spider-Man attacks, tap target creature defending player controls and put a stun counter on it. Then you may remove up to three stun counters from among all permanents. Draw cards equal to the number of stun counters removed this way.","power":"3","toughness":"3","keywords":[],"layout":"normal"});
const zimoneandDina = card("Zimone and Dina", "Legendary Creature — Human Dryad", "{B}{G}{U}", {"cmc":3,"oracleText":"Whenever you draw your second card each turn, target opponent loses 2 life and you gain 2 life.\n{T}, Sacrifice another creature: Draw a card. You may put a land card from your hand onto the battlefield tapped. If you control eight or more lands, repeat this process once.","power":"3","toughness":"4","keywords":[],"layout":"normal"});
const boxingRing = card("Boxing Ring", "Artifact", "{1}{G}", {"cmc":2,"oracleText":"Whenever a creature you control enters, it fights up to one target creature you don't control with the same mana value.\n{T}: Create a Treasure token. Activate only if you control a creature that fought this turn.","keywords":["Treasure","Fight"],"layout":"normal"});

const vehicle = card("Test Wagon", "Artifact — Vehicle", "{2}", { power: "3", toughness: "3", oracleText: "Crew 1" });
const dwarf = card("Test Dwarf", "Creature — Dwarf", "{R}", { power: "1", toughness: "1" });
const bonesplitter = card("Bonesplitter", "Artifact — Equipment", "{1}", { oracleText: "Equipped creature gets +2/+0.\nEquip {1}" });
const ornament = card("Test Ornament", "Artifact", "{1}", { oracleText: "" });
const ironMan = card("The Invincible Iron Man", "Legendary Artifact Creature — Human Hero", "{4}{U}{R}", { power: "5", toughness: "5", keywords: ["Flying", "Haste"], oracleText: "Flying, haste\nAt the beginning of combat on your turn, you may put an artifact card from your hand onto the battlefield. If it's an Equipment, attach it to The Invincible Iron Man." });

describe("round 220 cards are supported", () => {
  it("compiles every card of the round", () => {
    supported(depalaPilotExe, tonyStarkTheIn, ratonhnhakton, lizardConnorss, mathasFiendSee, onewiththeKami, bumiKingofThre, sensationalSpi, zimoneandDina, boxingRing, ironMan);
  });
});

describe("Depala, Pilot Exemplar", () => {
  it("gives Vehicles +1/+1 only while they're creatures", () => {
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, depalaPilotExe);
    const wagon = putOnBattlefield(s, ap, vehicle);
    const d = putOnBattlefield(s, ap, dwarf);
    expect(power(s, s.objects[d]!)).toBe(2);
    expect(objIsType(s, s.objects[wagon]!, "Creature")).toBe(false);
    expect(power(s, s.objects[wagon]!)).toBe(3);
    s.effects.push({ id: "crewed", timestamp: s.nextTimestamp++, controller: ap, sourceName: "test", duration: "endOfTurn", affected: [wagon], mods: [{ kind: "addTypes", types: ["Creature"], subtypes: [], supertypes: [] }] });
    invalidateCharacteristics(s);
    expect(power(s, s.objects[wagon]!)).toBe(4);
    expect(toughness(s, s.objects[wagon]!)).toBe(4);
  });

  it("when it becomes tapped, pay {X} to reveal the top X and take every Dwarf and Vehicle card", () => {
    const { s: s0, ap, opp } = setup([]);
    const depala = putOnBattlefield(s0, ap, depalaPilotExe);
    const v = into(s0, ap, vehicle, "library");
    const b = into(s0, ap, bear({ name: "Library Bear" }), "library");
    const d = into(s0, ap, dwarf, "library");
    let s = passUntil(s0, "declareAttackers", ap);
    s.players[ap]!.manaPool.C = 3;
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: depala, defender: opp }] });
    for (let i = 0; i < 20 && !(s.pending?.kind === "chooseOption" && s.pending.player === ap); i++) {
      const p = s.pending;
      if (p?.kind === "chooseMay" && p.player === ap) s = act(s, { type: "chooseMay", player: ap, yes: true });
      else if (p) s = act(s, botActions(s, p.player)[0]!);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.pending?.kind === "chooseOption" && s.pending.what).toBe("payX");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "3" }), { me: ap });
    expect(zone(s, d)).toBe("hand");
    expect(zone(s, v)).toBe("hand");
    expect(zone(s, b)).toBe("library");
    expect(s.players[ap]!.library.at(-1)).toBe(b);
    expect(s.players[ap]!.manaPool.C).toBe(0);
  });
});

describe("Tony Stark // The Invincible Iron Man", () => {
  it("at the beginning of combat, puts an Equipment from your hand onto the battlefield attached to it", () => {
    const { s: s0, ap, ids } = setup([bonesplitter]);
    const iron = putOnBattlefield(s0, ap, ironMan);
    let s = passUntil(s0, "beginCombat", ap);
    s = settle(s, { me: ap });
    expect(s.pending?.kind).toBe("searchLibrary");
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [ids[0]!] }), { me: ap });
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.objects[ids[0]!]!.attachedTo).toBe(iron);
    expect(power(s, s.objects[iron]!)).toBe(7);
  });

  it("an artifact that isn't an Equipment just enters", () => {
    const { s: s0, ap, ids } = setup([ornament]);
    putOnBattlefield(s0, ap, ironMan);
    let s = passUntil(s0, "beginCombat", ap);
    s = settle(s, { me: ap });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [ids[0]!] }), { me: ap });
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.objects[ids[0]!]!.attachedTo).toBeUndefined();
  });
});

describe("Ratonhnhaké꞉ton", () => {
  it("combat damage makes an Assassin; then an Equipment from your graveyard returns attached to that token", () => {
    const { s: s0, ap, opp } = setup([]);
    const rat = putOnBattlefield(s0, ap, ratonhnhakton);
    const eq = into(s0, ap, bonesplitter, "graveyard");
    let s = passUntil(s0, "declareAttackers", ap);
    s = attack(s, ap, [{ attacker: rat, defender: opp }]);
    // The reflexive trigger's target is chosen as it's put on the stack.
    expect(s.pending?.kind).toBe("chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(eq)] }), { me: ap });
    const token = s.battlefield.find((id) => nameOf(s, id) === "Assassin Token")!;
    expect(token).toBeDefined();
    expect(objHasKeyword(s, s.objects[token]!, "Menace")).toBe(true);
    expect(zone(s, eq)).toBe("battlefield");
    expect(s.objects[eq]!.attachedTo).toBe(token);
    expect(power(s, s.objects[token]!)).toBe(3);
  });
});

describe("Lizard, Connors's Curse", () => {
  it("up to one other target creature loses all abilities and becomes a green 4/4 Lizard, for good", () => {
    const { s: s0, ap, ids, opp } = setup([lizardConnorss]);
    const flier = putOnBattlefield(s0, opp, card("Test Flier", "Creature — Bird", "{U}", { power: "1", toughness: "1", keywords: ["Flying"], oracleText: "Flying" }));
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, { me: ap, targets: [tgt(flier)] });
    const o = s.objects[flier]!;
    const c = characteristics(s, o);
    expect(c.colors).toEqual(["G"]);
    expect(c.subtypes).toEqual(["Lizard"]);
    expect(objHasKeyword(s, o, "Flying")).toBe(false);
    expect(`${power(s, o)}/${toughness(s, o)}`).toBe("4/4");
    s = passUntil(s, "upkeep", opp);
    expect(`${power(s, s.objects[flier]!)}/${toughness(s, s.objects[flier]!)}`).toBe("4/4");
  });
});

describe("Mathas, Fiend Seeker", () => {
  it("puts a bounty counter at your end step; that creature dying makes each of its controller's opponents draw and gain 2", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, mathasFiendSee);
    const victim = putOnBattlefield(s0, opp, bear({ name: "Bounty Bear" }));
    let s = passUntil(s0, "end", ap);
    s = settle(s, { me: ap, targets: [tgt(victim)] });
    expect(s.objects[victim]!.counters.bounty).toBe(1);
    const others = s.turnOrder.filter((p) => p !== opp);
    const hands = Object.fromEntries(others.map((p) => [p, s.players[p]!.hand.length]));
    const lives = Object.fromEntries(s.turnOrder.map((p) => [p, s.players[p]!.life]));
    // Destroy it with a spell of your own next main phase.
    const kill = card("Test Murder", "Instant", "{B}", { oracleText: "Destroy target creature." });
    const k = into(s, ap, kill, "hand");
    s.players[ap]!.manaPool.B = 1;
    s = settle(run(s, planCast(s, ap, k, [tgt(victim)])), { me: ap });
    expect(zone(s, victim)).toBe("graveyard");
    for (const p of others) {
      expect(s.players[p]!.hand.length).toBe(hands[p]! + 1);
      expect(s.players[p]!.life).toBe(lives[p]! + 2);
    }
    expect(s.players[opp]!.life).toBe(lives[opp]!);
  });

  it("a bounty counter from anything else gives nothing (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, mathasFiendSee);
    const victim = putOnBattlefield(s0, opp, bear({ name: "Plain Bear" }));
    s0.objects[victim]!.counters.bounty = 1;
    const life = s0.players[ap]!.life;
    const kill = card("Test Murder", "Instant", "{B}", { oracleText: "Destroy target creature." });
    const k = into(s0, ap, kill, "hand");
    s0.players[ap]!.manaPool.B = 1;
    const s = settle(run(s0, planCast(s0, ap, k, [tgt(victim)])), { me: ap });
    expect(zone(s, victim)).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(life);
  });
});

describe("One with the Kami", () => {
  const kill = card("Test Murder", "Instant", "{B}", { oracleText: "Destroy target creature." });
  it("enchanted creature dying makes Spirits equal to its power", () => {
    const { s: s0, ap, ids } = setup([kill]);
    const big = putOnBattlefield(s0, ap, card("Test Giant", "Creature — Giant", "{3}", { power: "3", toughness: "3" }));
    const aura = putOnBattlefield(s0, ap, onewiththeKami);
    s0.objects[aura]!.attachedTo = big;
    invalidateCharacteristics(s0);
    s0.players[ap]!.manaPool.B = 1;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(big)])), { me: ap });
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Spirit Token")).toHaveLength(3);
  });

  it("another modified creature you control (a counter on it) counts; an unmodified one doesn't", () => {
    const { s: s0, ap, ids } = setup([kill, kill]);
    const host = putOnBattlefield(s0, ap, bear({ name: "Host Bear" }));
    const aura = putOnBattlefield(s0, ap, onewiththeKami);
    s0.objects[aura]!.attachedTo = host;
    const plain = putOnBattlefield(s0, ap, bear({ name: "Plain Bear" }));
    const pumped = putOnBattlefield(s0, ap, bear({ name: "Pumped Bear" }));
    s0.objects[pumped]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s0);
    s0.players[ap]!.manaPool.B = 2;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(plain)])), { me: ap });
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Spirit Token")).toHaveLength(0);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(pumped)])), { me: ap });
    // Its power as it last existed: 3 with the counter.
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Spirit Token")).toHaveLength(3);
  });
});

describe("Bumi, King of Three Trials", () => {
  const lesson = (n: string) => card(n, "Sorcery — Lesson", "{1}", { oracleText: "Draw a card." });
  it("choose up to X modes, X the Lesson cards in your graveyard as it triggers", () => {
    const { s: s0, ap, ids } = setup([bumiKingofThre]);
    into(s0, ap, lesson("Lesson One"), "graveyard");
    into(s0, ap, lesson("Lesson Two"), "graveyard");
    into(s0, ap, bear({ name: "Not a Lesson" }), "graveyard");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, { me: ap });
    expect(s.pending?.kind).toBe("chooseModes");
    if (s.pending?.kind !== "chooseModes") return;
    expect(s.pending.max).toBe(2);
    expect(() => act(s, { type: "chooseModes", player: ap, modes: [0, 1, 2] })).toThrow();
    s = act(s, { type: "chooseModes", player: ap, modes: [0, 1] });
    s = settle(s, { me: ap, targets: [ply(ap)] });
    if (s.pending?.kind === "arrangeTop") s = settle(act(s, { type: "arrangeTop", player: ap, top: s.pending.cards, away: [] }), { me: ap });
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(3);
  });

  it("with no Lessons, no modes: the ability does nothing", () => {
    const { s: s0, ap, ids } = setup([bumiKingofThre]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, { me: ap });
    expect(s.pending).toBeFalsy();
    expect(s.objects[ids[0]!]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("a bot chooses no more than X", () => {
    const { s: s0, ap, ids } = setup([bumiKingofThre]);
    into(s0, ap, lesson("Lesson One"), "graveyard");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, { me: ap });
    expect(s.pending?.kind).toBe("chooseModes");
    const a = botActions(s, ap)[0]!;
    expect(a.type === "chooseModes" && a.modes.length).toBe(1);
  });
});

describe("Sensational Spider-Man", () => {
  it("taps and stuns the target, then you remove up to three stun counters from anywhere and draw that many", () => {
    const { s: s0, ap, opp } = setup([]);
    const spidey = putOnBattlefield(s0, ap, sensationalSpi);
    const foe = putOnBattlefield(s0, opp, bear({ name: "Foe Bear" }));
    const mine = putOnBattlefield(s0, ap, bear({ name: "Stunned Bear" }));
    s0.objects[mine]!.counters.stun = 2;
    const hand = s0.players[ap]!.hand.length;
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: spidey, defender: opp }] });
    s = settle(s, { me: ap, targets: [tgt(foe)] });
    expect(s.pending?.kind).toBe("distribute");
    if (s.pending?.kind !== "distribute") return;
    expect(s.pending.remove).toBe(true);
    expect(s.pending.has).toEqual({ [foe]: 1, [mine]: 2 });
    expect(() => act(s, { type: "distribute", player: ap, parts: { [foe]: 2 } })).toThrow();
    expect(() => act(s, { type: "distribute", player: ap, parts: { [foe]: 1, [mine]: 2, x: 1 } })).toThrow();
    s = settle(act(s, { type: "distribute", player: ap, parts: { [mine]: 2 } }), { me: ap });
    expect(s.objects[foe]!.tapped).toBe(true);
    expect(s.objects[foe]!.counters.stun).toBe(1);
    expect(s.objects[mine]!.counters.stun ?? 0).toBe(0);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });

  it("removing none draws nothing; the bot takes its own stun counters first", () => {
    const { s: s0, ap, opp } = setup([]);
    const spidey = putOnBattlefield(s0, ap, sensationalSpi);
    const foe = putOnBattlefield(s0, opp, bear({ name: "Foe Bear" }));
    const mine = putOnBattlefield(s0, ap, bear({ name: "Stunned Bear" }));
    s0.objects[mine]!.counters.stun = 1;
    const hand = s0.players[ap]!.hand.length;
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: spidey, defender: opp }] });
    s = settle(s, { me: ap, targets: [tgt(foe)] });
    const bot = botActions(s, ap)[0]!;
    expect(bot.type === "distribute" && bot.parts[mine]).toBe(1);
    s = settle(act(s, { type: "distribute", player: ap, parts: {} }), { me: ap });
    expect(s.players[ap]!.hand.length).toBe(hand);
  });
});

describe("Zimone and Dina", () => {
  it("draws and may put a land; with eight or more lands, does it all once more (not the cost)", () => {
    const { s: s0, ap, opp } = setup([]);
    emptyHand(s0, ap);
    const zd = putOnBattlefield(s0, ap, zimoneandDina);
    const fodder = putOnBattlefield(s0, ap, bear({ name: "Fodder Bear" }));
    // The library's top two: a land each time.
    const l1 = into(s0, ap, card("Top Land A", "Land", "", {}), "library");
    const l2 = into(s0, ap, card("Top Land B", "Land", "", {}), "library");
    const lands = s0.battlefield.filter((id) => objIsType(s0, s0.objects[id]!, "Land")).length;
    let s = run(s0, planActivate(s0, ap, zd, 0, [], undefined, undefined, undefined, { sacrifice: [fodder] }));
    s = settle(s, { me: ap, targets: [ply(opp)] });
    expect(s.pending?.kind).toBe("searchLibrary");
    if (s.pending?.kind !== "searchLibrary") return;
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [l2] }), { me: ap, targets: [ply(opp)] });
    // Fourteen lands: the process repeats.
    expect(lands).toBeGreaterThanOrEqual(8);
    expect(s.pending?.kind).toBe("searchLibrary");
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [l1] }), { me: ap, targets: [ply(opp)] });
    expect(zone(s, l1)).toBe("battlefield");
    expect(zone(s, l2)).toBe("battlefield");
    expect(s.objects[l1]!.tapped && s.objects[l2]!.tapped).toBe(true);
    expect(zone(s, fodder)).toBe("graveyard");
  });

  it("with fewer than eight lands, once", () => {
    const { s: s0, ap, opp } = setup([]);
    for (const id of s0.battlefield.filter((x) => objIsType(s0, s0.objects[x]!, "Land"))) {
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      s0.objects[id]!.zone = "exile";
    }
    emptyHand(s0, ap);
    const zd = putOnBattlefield(s0, ap, zimoneandDina);
    const fodder = putOnBattlefield(s0, ap, bear({ name: "Fodder Bear" }));
    const hand = s0.players[ap]!.hand.length;
    let s = run(s0, planActivate(s0, ap, zd, 0, [], undefined, undefined, undefined, { sacrifice: [fodder] }));
    s = settle(s, { me: ap, may: false, targets: [ply(opp)] });
    if (s.pending?.kind === "searchLibrary") s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }), { me: ap, targets: [ply(opp)] });
    expect(s.pending).toBeFalsy();
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });
});

describe("Boxing Ring", () => {
  it("a creature entering fights a creature you don't control with the same mana value; then the Ring makes a Treasure", () => {
    const { s: s0, ap, ids, opp } = setup([bear({ name: "Entering Bear" })]);
    const ring = putOnBattlefield(s0, ap, boxingRing);
    const two = putOnBattlefield(s0, opp, card("Two Drop", "Creature — Ox", "{1}{W}", { power: "1", toughness: "1" }));
    const three = putOnBattlefield(s0, opp, card("Three Drop", "Creature — Ox", "{2}{W}", { power: "1", toughness: "1" }));
    // Not before anything fought.
    expect(planActivate(s0, ap, ring, 0)).toBeNull();
    let s = untilAsked(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(s.pending?.kind).toBe("chooseTargets");
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(three)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(two)] }), { me: ap });
    expect(zone(s, two)).toBe("graveyard");
    expect(zone(s, ids[0]!)).toBe("battlefield");
    s = run(s, planActivate(s, ap, ring, 0));
    s = settle(s, { me: ap });
    expect(s.battlefield.some((id) => nameOf(s, id) === "Treasure Token")).toBe(true);
  });

  it("only winners get prizes: a creature that died fighting doesn't count (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([bear({ name: "Entering Bear" })]);
    const ring = putOnBattlefield(s0, ap, boxingRing);
    const brute = putOnBattlefield(s0, opp, card("Two Drop Brute", "Creature — Ox", "{1}{W}", { power: "5", toughness: "5" }));
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, { me: ap, targets: [tgt(brute)] });
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(planActivate(s, ap, ring, 0)).toBeNull();
  });
});
