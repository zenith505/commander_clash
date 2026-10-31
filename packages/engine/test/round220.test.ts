// Round 220: fresh cards from EDHREC rank 5,800 on: Depala, Pilot Exemplar (Vehicle creatures, a paid reveal of X),
// The Invincible Iron Man (an Equipment put from your hand attached to it), Ratonhnhaké꞉ton (a reflexive trigger about
// the token created), Lizard, Connors's Curse, Mathas, Fiend Seeker (an ability granted while a counter stays), One with
// the Kami (enchanted creature or another modified creature), Bumi, King of Three Trials ("choose up to X"),
// Sensational Spider-Man (remove up to three stun counters from among all permanents), Zimone and Dina ("repeat this
// process once"), Boxing Ring (a fight with the same mana value, "a creature that fought this turn").

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, scry, setup } from "./helpers";
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

// Second batch: Karai, Future of the Foot ("if her sneak cost was paid this turn, instead"), In Search of Greatness
// ("If you don't" after a free cast from hand), Tolsimir, Midnight's Light ("if ~ attacked this combat", "blocks that
// Wolf this combat if able").
const karaiFutureoft = card("Karai, Future of the Foot", "Legendary Creature — Human Ninja", "{1}{W}{B}", {"cmc":3,"oracleText":"Sneak {2}{W}{B} (You may cast this spell for {2}{W}{B} if you also return an unblocked attacker you control to hand during the declare blockers step. She enters tapped and attacking.)\nWhenever Karai deals combat damage to a player, return target creature card from your graveyard to your hand. If her sneak cost was paid this turn, instead return that card to the battlefield.","power":"3","toughness":"3","keywords":["Sneak"],"layout":"normal"});
const inSearchofGrea = card("In Search of Greatness", "Enchantment", "{G}{G}", {"cmc":2,"oracleText":"At the beginning of your upkeep, you may cast a permanent spell from your hand with mana value equal to 1 plus the greatest mana value among other permanents you control without paying its mana cost. If you don't, scry 1.","keywords":["Scry"],"layout":"normal"});
const tolsimirMidnig = card("Tolsimir, Midnight's Light", "Legendary Creature — Elf Scout", "{2}{G}{W}{W}", {"cmc":5,"oracleText":"Lifelink\nWhen Tolsimir enters, create Voja Fenstalker, a legendary 5/5 green and white Wolf creature token with trample.\nWhenever a Wolf you control attacks, if Tolsimir attacked this combat, target creature an opponent controls blocks that Wolf this combat if able.","power":"3","toughness":"2","keywords":["Lifelink"],"layout":"normal"});
const fighterClass = card("Fighter Class", "Enchantment — Class", "{R}{W}", {"cmc":2,"oracleText":"(Gain the next level as a sorcery to add its ability.)\nWhen this Class enters, search your library for an Equipment card, reveal it, put it into your hand, then shuffle.\n{1}{R}{W}: Level 2\nEquip abilities you activate cost {2} less to activate.\n{3}{R}{W}: Level 3\nWhenever a creature you control attacks, up to one target creature blocks it this combat if able.","keywords":[],"layout":"class"});

/** Passes through combat to the second main phase, answering `me`'s trigger targets with `targets`. */
const throughCombat = (s: GameState, me: PlayerId, targets: TargetChoice[]) => {
  for (let i = 0; i < 200 && s.step !== "main2"; i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p?.kind === "chooseTargets" && p.player === me) s = act(s, { type: "chooseTargets", player: me, targets });
    else if (p) s = act(s, botActions(s, p.player)[0]!);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return settle(s, { me });
};

describe("Karai, Future of the Foot", () => {
  it("are fully supported", () => supported(karaiFutureoft, inSearchofGrea, tolsimirMidnig, fighterClass));

  it("cast normally: the creature card comes back to hand", () => {
    const { s: s0, ap, opp } = setup([]);
    const karai = putOnBattlefield(s0, ap, karaiFutureoft);
    const dead = into(s0, ap, bear({ name: "Dead Bear" }), "graveyard");
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: karai, defender: opp }] });
    s = throughCombat(s, ap, [tgt(dead)]);
    expect(zone(s, dead)).toBe("hand");
  });

  it("sneaked in this turn: the card returns to the battlefield instead", () => {
    const { s: s0, ap, opp, ids } = setup([karaiFutureoft]);
    const b = putOnBattlefield(s0, ap, bear());
    const dead = into(s0, ap, bear({ name: "Dead Bear" }), "graveyard");
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    for (let i = 0; i < 40 && s.step !== "declareBlockers"; i++) {
      const p = s.pending;
      if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
      else if (p) s = act(s, botActions(s, p.player)[0]!);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    while (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
    s = run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "sneak", returnToHand: [b] }));
    s = settle(s, { me: ap });
    expect(s.objects[ids[0]!]!.attacking).toBe(opp);
    s = throughCombat(s, ap, [tgt(dead)]);
    expect(zone(s, dead)).toBe("battlefield");
  });
});

describe("In Search of Greatness", () => {
  const upkeep = (s0: GameState, ap: PlayerId) => {
    let s = passUntil(s0, "upkeep", s0.turnOrder.find((p) => p !== ap));
    return untilAsked(passUntil(s, "upkeep", ap), ap);
  };

  it("offers only permanent spells with mana value 1 plus the greatest among other permanents you control, and casts it free", () => {
    const three = card("Three Drop", "Creature — Ox", "{2}{G}", { power: "3", toughness: "3" });
    const four = card("Four Drop", "Creature — Ox", "{3}{G}", { power: "4", toughness: "4" });
    const bolt = card("Three Mana Sorcery", "Sorcery", "{2}{R}", { oracleText: "Draw a card." });
    const { s: s0, ap, ids } = setup([three, four, bolt]);
    putOnBattlefield(s0, ap, inSearchofGrea);
    putOnBattlefield(s0, ap, bear());
    let s = upkeep(s0, ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromHand" });
    const options = s.pending?.kind === "chooseOption" ? s.pending.options : [];
    // In Search of Greatness itself doesn't count (other permanents): the greatest is the Bear's 2.
    expect(options).toContain(ids[0]);
    expect(options).not.toContain(ids[1]);
    expect(options).not.toContain(ids[2]);
    s = act(s, { type: "chooseOption", player: ap, choice: ids[0]! });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: ids[0] });
    s = run(s, planCast(s, ap, ids[0]!));
    // Cast: no scry.
    s = settle(s, { me: ap });
    expect(s.pending).toBeFalsy();
    expect(zone(s, ids[0]!)).toBe("battlefield");
  });

  it("if you don't cast one, scry 1", () => {
    const three = card("Three Drop", "Creature — Ox", "{2}{G}", { power: "3", toughness: "3" });
    const { s: s0, ap, ids } = setup([three]);
    putOnBattlefield(s0, ap, inSearchofGrea);
    putOnBattlefield(s0, ap, bear());
    let s = upkeep(s0, ap);
    s = act(s, { type: "chooseOption", player: ap, choice: "none" });
    s = settle(s, { me: ap });
    expect(s.pending?.kind).toBe("arrangeTop");
    expect(zone(s, ids[0]!)).toBe("hand");
  });
});

describe("Tolsimir, Midnight's Light", () => {
  const toBlocks = (s0: GameState, ap: PlayerId, attackers: ObjectId[], opp: PlayerId, targets: TargetChoice[]) => {
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: attackers.map((attacker) => ({ attacker, defender: opp })) });
    let asked = 0;
    for (let i = 0; i < 40 && !(s.pending?.kind === "declareBlockers" && s.pending.player === opp); i++) {
      const p = s.pending;
      if (p?.kind === "chooseTargets" && p.player === ap) (asked++, (s = act(s, { type: "chooseTargets", player: ap, targets })));
      else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
      else if (p) s = act(s, botActions(s, p.player)[0]!);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    return { s, asked };
  };

  it("enters with Voja Fenstalker; when both attack, the target must block the Wolf", () => {
    const { s: s0, ap, opp, ids } = setup([tolsimirMidnig]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: ap });
    const voja = s.battlefield.find((id) => nameOf(s, id) === "Voja Fenstalker")!;
    expect(voja).toBeTruthy();
    const c = characteristics(s, s.objects[voja]!);
    expect(c.subtypes).toContain("Wolf");
    expect(c.supertypes).toContain("Legendary");
    expect(objHasKeyword(s, s.objects[voja]!, "Trample")).toBe(true);
    s.objects[voja]!.controlledSinceTurn = -1;
    s.objects[ids[0]!]!.controlledSinceTurn = -1;
    const blocker = putOnBattlefield(s, opp, bear({ name: "Blocker" }));
    const r = toBlocks(s, ap, [ids[0]!, voja], opp, [tgt(blocker)]);
    expect(r.asked).toBe(1);
    expect(() => act(r.s, { type: "declareBlockers", player: opp, blocks: [] })).toThrow(/must block/);
    expect(() => act(r.s, { type: "declareBlockers", player: opp, blocks: [{ blocker, attacker: ids[0]! }] })).toThrow(/must block/);
    expect(act(r.s, { type: "declareBlockers", player: opp, blocks: [{ blocker, attacker: voja }] }).objects[blocker]!.blocking).toEqual([voja]);
  });

  it("a Wolf attacking without Tolsimir doesn't trigger", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, tolsimirMidnig);
    const wolf = putOnBattlefield(s0, ap, card("Test Wolf", "Creature — Wolf", "{1}{G}", { power: "2", toughness: "2" }));
    putOnBattlefield(s0, opp, bear({ name: "Blocker" }));
    const r = toBlocks(s0, ap, [wolf], opp, []);
    expect(r.asked).toBe(0);
    expect(r.s.pending).toMatchObject({ kind: "declareBlockers", player: opp });
    expect(() => act(r.s, { type: "declareBlockers", player: opp, blocks: [] })).not.toThrow();
  });
});

// Third batch: O-Kagachi, Vengeful Kami ("if that player attacked you during their last turn"), Vannifar, Evolved Enigma
// ("cloak a card from your hand"), Thrasta, Tempest's Roar (trample over planeswalkers, CR 702.19c), Reality Scramble
// (reveal until a card that shares a card type with that permanent).
const oKagachiVengef = card("O-Kagachi, Vengeful Kami", "Legendary Creature — Dragon Spirit", "{1}{W}{U}{B}{R}{G}", {"cmc":6,"oracleText":"Flying, trample\nWhenever O-Kagachi deals combat damage to a player, if that player attacked you during their last turn, exile target nonland permanent that player controls.","power":"6","toughness":"6","keywords":["Flying","Trample"],"layout":"normal"});
const vannifarEvolve = card("Vannifar, Evolved Enigma", "Legendary Creature — Elf Ooze Wizard", "{2}{G}{U}", {"cmc":4,"oracleText":"At the beginning of combat on your turn, choose one —\n• Cloak a card from your hand. (Put it onto the battlefield face down as a 2/2 creature with ward {2}. Turn it face up any time for its mana cost if it's a creature card.)\n• Put a +1/+1 counter on each colorless creature you control.","power":"3","toughness":"4","keywords":["Cloak"],"layout":"normal"});
const thrastaTempest = card("Thrasta, Tempest's Roar", "Legendary Creature — Dinosaur", "{10}{G}{G}", {"cmc":12,"oracleText":"This spell costs {3} less to cast for each other spell cast this turn.\nTrample, haste\nTrample over planeswalkers (This creature can deal excess combat damage to the controller of the planeswalker it's attacking.)\nThrasta has hexproof as long as it entered this turn.","power":"7","toughness":"7","keywords":["Haste","Trample"],"layout":"normal"});
const realityScrambl = card("Reality Scramble", "Sorcery", "{2}{R}{R}", {"cmc":4,"oracleText":"Put target permanent you own on the bottom of your library. Reveal cards from the top of your library until you reveal a card that shares a card type with that permanent. Put that card onto the battlefield and the rest on the bottom of your library in a random order.\nRetrace (You may cast this card from your graveyard by discarding a land card in addition to paying its other costs.)","keywords":["Retrace"],"layout":"normal"});
const walker = (name = "Test Walker") => card(name, "Legendary Planeswalker — Jace", "{3}", { loyalty: "3", oracleText: "+1: Draw a card." });

describe("O-Kagachi, Vengeful Kami", () => {
  it("are fully supported", () => supported(oKagachiVengef, vannifarEvolve, thrastaTempest, realityScrambl));

  it("exiles a nonland permanent of a player who attacked you during their last turn, not of one who didn't", () => {
    const { s: s0, ap, opp } = setup([]);
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    const ok = putOnBattlefield(s0, ap, oKagachiVengef);
    const raider = putOnBattlefield(s0, opp, bear({ name: "Raider" }));
    const rock = putOnBattlefield(s0, opp, card("Opp Rock", "Artifact", "{1}", { oracleText: "" }));
    const rock3 = putOnBattlefield(s0, third, card("Third Rock", "Artifact", "{1}", { oracleText: "" }));
    // The opponent attacks you on their turn; the third player doesn't attack.
    let s = act(passUntil(s0, "declareAttackers", opp), { type: "declareAttackers", player: opp, attacks: [{ attacker: raider, defender: ap }] });
    s = passUntil(s, "declareAttackers", ap);
    const asked = { n: 0 };
    let t = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: ok, defender: opp }] });
    for (let i = 0; i < 200 && t.step !== "main2"; i++) {
      const p = t.pending;
      if (p?.kind === "declareBlockers") t = act(t, { type: "declareBlockers", player: p.player, blocks: [] });
      else if (p?.kind === "chooseTargets" && p.player === ap) (asked.n++, (t = act(t, { type: "chooseTargets", player: ap, targets: [tgt(rock)] })));
      else if (p) t = act(t, botActions(t, p.player)[0]!);
      else t = act(t, { type: "passPriority", player: waitingOn(t)! });
    }
    expect(asked.n).toBe(1);
    expect(zone(t, rock)).toBe("exile");
    // Against the third player: no trigger.
    asked.n = 0;
    t = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: ok, defender: third }] });
    for (let i = 0; i < 200 && t.step !== "main2"; i++) {
      const p = t.pending;
      if (p?.kind === "declareBlockers") t = act(t, { type: "declareBlockers", player: p.player, blocks: [] });
      else if (p?.kind === "chooseTargets" && p.player === ap) (asked.n++, (t = act(t, { type: "chooseTargets", player: ap, targets: [tgt(rock3)] })));
      else if (p) t = act(t, botActions(t, p.player)[0]!);
      else t = act(t, { type: "passPriority", player: waitingOn(t)! });
    }
    expect(asked.n).toBe(0);
    expect(zone(t, rock3)).toBe("battlefield");
  });
});

describe("Vannifar, Evolved Enigma", () => {
  it("cloaks the card you pick from your hand: a face-down 2/2 with ward {2}", () => {
    const sorcery = card("Hand Sorcery", "Sorcery", "{1}{R}", { oracleText: "Draw a card." });
    const { s: s0, ap, ids } = setup([bear({ name: "Hand Bear" }), sorcery]);
    emptyHand(s0, ap);
    s0.players[ap]!.hand.push(...ids);
    for (const id of ids) s0.objects[id]!.zone = "hand";
    putOnBattlefield(s0, ap, vannifarEvolve);
    let s = untilAsked(passUntil(s0, "beginCombat", ap), ap);
    expect(s.pending?.kind).toBe("chooseModes");
    s = untilAsked(act(s, { type: "chooseModes", player: ap, modes: [0] }), ap);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", fromHand: true, manifest: true, cloak: true });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [ids[1]!] }), { me: ap });
    const o = s.objects[ids[1]!]!;
    expect([o.zone, o.faceDown]).toEqual(["battlefield", "cloak"]);
    expect(pt(s, ids[1]!)).toBe("2/2");
    expect(characteristics(s, o).keywords.some((k) => /^Ward/.test(k))).toBe(true);
    expect(zone(s, ids[0]!)).toBe("hand");
  });

  it("or a +1/+1 counter on each colorless creature you control", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, vannifarEvolve);
    const golem = putOnBattlefield(s0, ap, card("Test Golem", "Artifact Creature — Golem", "{3}", { power: "3", toughness: "3" }));
    const b = putOnBattlefield(s0, ap, bear());
    let s = untilAsked(passUntil(s0, "beginCombat", ap), ap);
    s = settle(act(s, { type: "chooseModes", player: ap, modes: [1] }), { me: ap });
    expect(s.objects[golem]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[b]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});

describe("Thrasta, Tempest's Roar: trample over planeswalkers", () => {
  const combat = (s: GameState, ap: PlayerId, attacks: { attacker: ObjectId; defender: PlayerId; planeswalker?: ObjectId }[] | null, blocks: { blocker: ObjectId; attacker: ObjectId }[] = []) => {
    if (attacks) s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks });
    for (let i = 0; i < 200 && s.step !== "main2"; i++) {
      const p = s.pending;
      if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: blocks.filter((b) => s.objects[b.blocker]!.controller === p.player) });
      else if (p) s = act(s, botActions(s, p.player)[0]!);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    return s;
  };

  it("unblocked at a planeswalker: its loyalty less what others assign it, the rest to its controller (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const th = putOnBattlefield(s0, ap, thrastaTempest);
    const cub = putOnBattlefield(s0, ap, bear({ name: "Bear Cub" }));
    const w = putOnBattlefield(s0, opp, walker());
    s0.objects[w]!.counters.loyalty = 3;
    const life = s0.players[opp]!.life;
    const s = combat(s0, ap, [{ attacker: cub, defender: opp, planeswalker: w }, { attacker: th, defender: opp, planeswalker: w }]);
    expect(zone(s, w)).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life - 6);
  });

  it("blocked by a 3/3 at a two-loyalty planeswalker: 3 to the blocker, 2 to the planeswalker, 2 to the player (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const th = putOnBattlefield(s0, ap, thrastaTempest);
    const w = putOnBattlefield(s0, opp, walker());
    s0.objects[w]!.counters.loyalty = 2;
    const blocker = putOnBattlefield(s0, opp, card("Three Blocker", "Creature — Ox", "{2}{G}", { power: "3", toughness: "3" }));
    const life = s0.players[opp]!.life;
    const s = combat(s0, ap, [{ attacker: th, defender: opp, planeswalker: w }], [{ blocker, attacker: th }]);
    expect(zone(s, blocker)).toBe("graveyard");
    expect(zone(s, w)).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life - 2);
  });

  it("plain trample at a planeswalker never reaches the player (CR 702.19f)", () => {
    const { s: s0, ap, opp } = setup([]);
    const big = putOnBattlefield(s0, ap, card("Plain Trampler", "Creature — Beast", "{5}{G}", { power: "7", toughness: "7", keywords: ["Trample"], oracleText: "Trample" }));
    const w = putOnBattlefield(s0, opp, walker());
    s0.objects[w]!.counters.loyalty = 3;
    const life = s0.players[opp]!.life;
    const s = combat(s0, ap, [{ attacker: big, defender: opp, planeswalker: w }]);
    expect(zone(s, w)).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life);
  });

  it("with the planeswalker gone before damage, all of it goes to the defending player (CR 702.19e)", () => {
    const { s: s0, ap, opp } = setup([]);
    const th = putOnBattlefield(s0, ap, thrastaTempest);
    const w = putOnBattlefield(s0, opp, walker());
    s0.objects[w]!.counters.loyalty = 3;
    const life = s0.players[opp]!.life;
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: th, defender: opp, planeswalker: w }] });
    // The planeswalker leaves the battlefield before damage.
    s.objects[w]!.counters.loyalty = 0;
    s = combat(s, ap, null);
    expect(zone(s, w)).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life - 7);
  });
});

describe("Reality Scramble", () => {
  it("puts the target on the bottom, reveals until a card sharing a card type with it, and puts that onto the battlefield", () => {
    const { s: s0, ap, ids } = setup([realityScrambl]);
    const rock = putOnBattlefield(s0, ap, card("Old Rock", "Artifact", "{1}", { oracleText: "" }));
    const lib = s0.players[ap]!.library;
    const relic = into(s0, ap, card("Found Relic", "Artifact", "{4}", { oracleText: "" }), "library");
    const b = into(s0, ap, bear({ name: "Top Bear" }), "library");
    expect(lib.slice(0, 2)).toEqual([b, relic]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(rock)])), { me: ap });
    expect(zone(s, relic)).toBe("battlefield");
    expect(zone(s, rock)).toBe("library");
    expect(zone(s, b)).toBe("library");
    const l = s.players[ap]!.library;
    expect(l.indexOf(b)).toBeGreaterThan(l.length - 3);
    expect(l.includes(rock)).toBe(true);
  });
});
