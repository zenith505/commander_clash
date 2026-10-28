// Round 192: more of the harder cards both lanes skipped, from the most played down: "at the beginning of your next first
// main phase, add X mana in any combination of colors" (Plasm Capture), "the total power of creatures goaded this way"
// (Havoc Eater), "choose one or more. Each mode must target a different player" (Vindictive Lich), "or a creature spell
// you control becomes the target" (Surrak, Elusive Hunter), "until you reveal two land cards" (Skyserpent Seeker), "any
// number of them phase out" (Change of Plans), "each Sliver card in each player's hand" (Homing Sliver), Fear of Burning
// Alive, distributed X counters (Grove's Bounty, Broodlord), Deep-Cavern Bat, Shark Shredder, Undergrowth Champion and
// the Phantom creatures, Hurl Through Hell.

import { describe, expect, it } from "vitest";
import { act, bear, card, commander, island, mountain, passUntil, putOnBattlefield, scry, setup, swamp } from "./helpers";
import { abilitiesOf, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, legalTargets, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; "you may" questions get `yes`, copies keep their targets. Stops at any other question. */
const resolveAll = (s: GameState, yes = true) => {
  for (let i = 0; i < 120 && (s.stack.length || s.triggerQueue.length || s.pending?.kind === "chooseMay" || s.pending?.kind === "copyTargets"); i++) {
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes });
    else if (s.pending?.kind === "copyTargets") s = act(s, { type: "copyTargets", player: s.pending.player });
    else if (s.pending) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const choose = (s: GameState, targets: TargetChoice[]) => (s.pending?.kind === "chooseTargets" ? resolveAll(act(s, { type: "chooseTargets", player: s.pending.player, targets })) : s);
const modes = (s: GameState, m: number[]) => {
  if (s.pending?.kind !== "chooseModes") throw new Error(`no modes question: ${s.pending?.kind}`);
  return act(s, { type: "chooseModes", player: s.pending.player, modes: m });
};
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const counters = (s: GameState, id: string, c = "+1/+1") => s.objects[id]!.counters[c] ?? 0;
const pt = (s: GameState, id: ObjectId) => [power(s, s.objects[id]!), toughness(s, s.objects[id]!)];
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && s.cards[s.objects[id]!.cardId]!.name === name);
const lands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).types.includes("Land"));
const tapAllBut = (s: GameState, pid: PlayerId, keep: ObjectId[]) => {
  for (const id of lands(s, pid)) s.objects[id]!.tapped = !keep.includes(id);
  invalidateCharacteristics(s);
};
const next = (s: GameState, pid: PlayerId, k = 1) => s.turnOrder[(s.turnOrder.indexOf(pid) + k) % 4]!;
/** Passes (no blocks, "you may" answered yes) until `step` of `ap`'s turn with an empty stack, or until another question. */
const toStep = (s: GameState, step: GameState["step"], ap: PlayerId) => {
  for (let i = 0; i < 800; i++) {
    if (s.step === step && s.activePlayer === ap && !s.stack.length && !s.triggerQueue.length && !s.pending) return s;
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: p.player, attacks: [] });
    else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: true });
    else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  throw new Error(`never reached ${step}`);
};
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: ObjectId; defender: PlayerId; planeswalker?: ObjectId }[]) => act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks });
const shock = card("Test Shock", "Instant", "{R}", { cmc: 1, oracleText: "This spell deals 2 damage to any target." });
const bolt = card("Test Bolt", "Instant", "{R}", { cmc: 1, oracleText: "This spell deals 3 damage to any target." });
const creature = (name: string, sub: string, p: number, t = p) => card(name, `Creature — ${sub}`, "{G}", { cmc: 1, power: String(p), toughness: String(t) });


// Real oracle text (Scryfall).
const plasmCapture = card("Plasm Capture", "Instant", "{G}{G}{U}{U}", {"cmc":4,"keywords":[],"oracleText":"Counter target spell. At the beginning of your next first main phase, add X mana in any combination of colors, where X is that spell's mana value.","colors":["G","U"],"layout":"normal"});
const havocEater = card("Havoc Eater", "Creature — Elemental", "{5}{R}{R}", {"cmc":7,"power":"3","toughness":"3","keywords":["Flying","Goad"],"oracleText":"Flying\nWhen this creature enters, for each opponent, goad up to one target creature that opponent controls. Put X +1/+1 counters on this creature, where X is the total power of creatures goaded this way.","colors":["R"],"layout":"normal"});
const lich = card("Vindictive Lich", "Creature — Zombie Wizard", "{3}{B}", {"cmc":4,"power":"4","toughness":"1","keywords":[],"oracleText":"When this creature dies, choose one or more. Each mode must target a different player.\n• Target opponent sacrifices a creature of their choice.\n• Target opponent discards two cards.\n• Target opponent loses 5 life.","colors":["B"],"layout":"normal"});
const surrak = card("Surrak, Elusive Hunter", "Legendary Creature — Human Warrior", "{2}{G}", {"cmc":3,"power":"4","toughness":"3","keywords":["Trample"],"oracleText":"This spell can't be countered.\nTrample\nWhenever a creature you control or a creature spell you control becomes the target of a spell or ability an opponent controls, draw a card.","colors":["G"],"layout":"normal"});

const skyserpent = card("Skyserpent Seeker", "Creature — Snake", "{G}{U}", {"cmc":2,"power":"1","toughness":"1","keywords":["Deathtouch","Flying","Exhaust"],"oracleText":"Flying, deathtouch\nExhaust — {4}: Reveal cards from the top of your library until you reveal two land cards. Put those land cards onto the battlefield tapped and the rest on the bottom of your library in a random order. Put a +1/+1 counter on this creature. (Activate each exhaust ability only once.)","colors":["G","U"],"layout":"normal"});
const changeOfPlans = card("Change of Plans", "Instant", "{X}{1}{U}", {"cmc":2,"keywords":["Connive"],"oracleText":"Each of X target creatures you control connive. You may have any number of them phase out. (To have a creature connive, draw a card, then discard a card. If you discarded a nonland card, put a +1/+1 counter on that creature. Treat phased-out permanents and anything attached to them as though they don't exist until their controller's next turn.)","colors":["U"],"layout":"normal"});
const homing = card("Homing Sliver", "Creature — Sliver", "{2}{R}", {"cmc":3,"power":"2","toughness":"2","keywords":["Typecycling","Cycling","Slivercycling"],"oracleText":"Each Sliver card in each player's hand has slivercycling {3}.\nSlivercycling {3} ({3}, Discard this card: Search your library for a Sliver card, reveal it, put it into your hand, then shuffle.)","colors":["R"],"layout":"normal"});
const fear = card("Fear of Burning Alive", "Enchantment Creature — Nightmare", "{4}{R}{R}", {"cmc":6,"power":"4","toughness":"4","keywords":["Delirium"],"oracleText":"When this creature enters, it deals 4 damage to each opponent.\nDelirium — Whenever a source you control deals noncombat damage to an opponent, if there are four or more card types among cards in your graveyard, this creature deals that amount of damage to target creature that player controls.","colors":["R"],"layout":"normal"});
const otter = scry("adventure", [
  { name: "Elusive Otter", mana_cost: "{U}", type_line: "Creature — Otter", oracle_text: "Prowess (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)\nCreatures with power less than this creature's power can't block it.", power: "1", toughness: "1" },
  { name: "Grove's Bounty", mana_cost: "{X}{G}", type_line: "Sorcery — Adventure", oracle_text: "Distribute X +1/+1 counters among any number of target creatures you control. (Then exile this card. You may cast the creature later from exile.)" },
], { keywords: ["Prowess"] });

const broodlord = card("Broodlord", "Creature — Tyranid", "{X}{3}{G}", {"cmc":4,"power":"3","toughness":"3","keywords":["Ravenous","Brood Telepathy"],"oracleText":"Ravenous (This creature enters with X +1/+1 counters on it. If X is 5 or more, draw a card when it enters.)\nBrood Telepathy — When this creature enters, distribute X +1/+1 counters among any number of other target creatures you control.","colors":["G"],"layout":"normal"});
const bat = card("Deep-Cavern Bat", "Creature — Bat", "{1}{B}", {"cmc":2,"power":"1","toughness":"1","keywords":["Flying","Lifelink"],"oracleText":"Flying, lifelink\nWhen this creature enters, look at target opponent's hand. You may exile a nonland card from it until this creature leaves the battlefield.","colors":["B"],"layout":"normal"});
const shark = card("Shark Shredder, Killer Clone", "Legendary Creature — Shark Octopus Ninja", "{2}{B}{B}", {"cmc":4,"power":"4","toughness":"4","keywords":["First strike","Sneak"],"oracleText":"Sneak {3}{B}{B}\nFirst strike\nWhenever Shark Shredder deals combat damage to a player, put up to one target creature card from that player's graveyard onto the battlefield under your control. It enters tapped and attacking that player.","colors":["B"],"layout":"normal"});

const undergrowth = card("Undergrowth Champion", "Creature — Elemental", "{1}{G}{G}", {"cmc":3,"power":"2","toughness":"2","keywords":["Landfall"],"oracleText":"If damage would be dealt to this creature while it has a +1/+1 counter on it, prevent that damage and remove a +1/+1 counter from this creature.\nLandfall — Whenever a land you control enters, put a +1/+1 counter on this creature."});
const centaur = card("Phantom Centaur", "Creature — Centaur Spirit", "{2}{G}{G}", {"cmc":4,"power":"2","toughness":"0","keywords":["Protection"],"oracleText":"Protection from black\nThis creature enters with three +1/+1 counters on it.\nIf damage would be dealt to this creature, prevent that damage. Remove a +1/+1 counter from this creature.","colors":["G"],"layout":"normal"});
const leyline = card("Leyline of Punishment", "Enchantment", "{2}{R}{R}", { oracleText: "If this card is in your opening hand, you may begin the game with it on the battlefield.\nPlayers can't gain life.\nDamage can't be prevented." });

const hurl = card("Hurl Through Hell", "Instant", "{2}{B}{R}", {"cmc":4,"keywords":[],"oracleText":"Exile target creature. Until the end of your next turn, you may cast that card and you may spend mana as though it were mana of any color to cast that spell.","colors":["B","R"],"layout":"normal"});

const ALL = [plasmCapture, havocEater, lich, surrak, skyserpent, changeOfPlans, homing, fear, otter, broodlord, bat, shark, undergrowth, hurl];
const hand = (s: GameState, pid: PlayerId) => s.players[pid]!.hand;
const pass = (s: GameState, until: (s: GameState) => boolean) => {
  for (let i = 0; i < 20 && !until(s); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const goaded = (s: GameState, id: ObjectId) => s.effects.some((e) => e.affected?.includes(id) && e.mods.some((m) => m.kind === "goad"));
const pool = (s: GameState, pid: PlayerId) => s.players[pid]!.manaPool;

describe("round 192", () => {
  it("all compile", () => supported(...ALL));

  it("Plasm Capture: counters the spell; at your next first main phase you add its mana value (X included) in any mix of colors", () => {
    let { s, ap, ids } = setup([card("Test Fireball", "Sorcery", "{X}{R}", { cmc: 1, oracleText: "This spell deals X damage to any target." }), plasmCapture]);
    const opp = next(s, ap);
    s = run(s, planCast(s, ap, ids[0]!, [player(opp)], undefined, undefined, 3));
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: s.stack[0]!.id }]));
    s = resolveAll(s);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(life(s, opp)).toBe(40);
    // This main phase had already begun: the next first main phase is in your next turn.
    s = toStep(s, "main2", ap);
    expect(s.pending).toBeNull();
    s = toStep(s, "upkeep", next(s, ap));
    s = toStep(s, "main1", ap);
    s = pass(s, (x) => !!x.pending);
    expect(s.step).toBe("main1");
    expect(s.pending).toMatchObject({ kind: "manaMix", player: ap, n: 4 });
    s = act(s, { type: "manaMix", player: ap, counts: { G: 1, U: 3 } });
    s = resolveAll(s);
    expect(pool(s, ap)).toMatchObject({ G: 1, U: 3 });
  });

  it("Vindictive Lich: one or more modes, each targeting a different opponent", () => {
    let { s, ap, ids } = setup([shock]);
    const [b, c, d] = [next(s, ap), next(s, ap, 2), next(s, ap, 3)];
    const l = putOnBattlefield(s, ap, lich);
    const victim = putOnBattlefield(s, b, creature("Test Victim", "Beast", 2));
    for (const i of [0, 1, 2]) into(s, c, creature(`Test Card ${i}`, "Beast", 1), "hand");
    const handBefore = hand(s, c).length;
    s = run(s, planCast(s, ap, ids[0]!, [tgt(l)]));
    s = pass(s, (x) => x.pending?.kind === "chooseModes");
    expect(s.pending).toMatchObject({ kind: "chooseModes", player: ap, min: 1, max: 3 });
    s = modes(s, [0, 1, 2]);
    expect(s.pending?.kind).toBe("chooseTargets");
    // The same opponent can't be the target of two modes.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [player(b), player(b), player(d)] })).toThrow();
    s = act(s, { type: "chooseTargets", player: ap, targets: [player(b), player(c), player(d)] });
    for (let i = 0; i < 40 && (s.stack.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "discard") s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, 2) });
      else if (p) break;
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.pending).toBeNull();
    expect(zone(s, victim)).toBe("graveyard");
    expect(hand(s, c).length).toBe(handBefore - 2);
    expect(life(s, d)).toBe(35);
  });

  it("Vindictive Lich: no more modes than there are opponents to target", () => {
    let { s, ap, ids } = setup([shock]);
    const [b, c, d] = [next(s, ap), next(s, ap, 2), next(s, ap, 3)];
    s.players[c]!.lost = true;
    const l = putOnBattlefield(s, ap, lich);
    s = run(s, planCast(s, ap, ids[0]!, [tgt(l)]));
    s = pass(s, (x) => x.pending?.kind === "chooseModes");
    expect(s.pending).toMatchObject({ kind: "chooseModes", min: 1, max: 2 });
    expect(() => modes(s, [0, 1, 2])).toThrow();
    s = modes(s, [2]);
    s = choose(s, [player(d)]);
    expect(life(s, d)).toBe(35);
    expect(life(s, b)).toBe(40);
  });

  it("Vindictive Lich: the bot chooses modes for different opponents", () => {
    let { s, ap, ids } = setup([shock]);
    const l = putOnBattlefield(s, ap, lich);
    s = run(s, planCast(s, ap, ids[0]!, [tgt(l)]));
    s = pass(s, (x) => x.pending?.kind === "chooseModes");
    for (let i = 0; i < 60 && (s.stack.length || s.pending || s.triggerQueue.length); i++) {
      const pid = s.pending?.player ?? waitingOn(s)!;
      const a = botActions(s, pid);
      s = a.length ? a.reduce((x, y) => act(x, y), s) : act(s, { type: "passPriority", player: pid });
    }
    const opps = [1, 2, 3].map((k) => next(s, ap, k));
    expect(opps.filter((o) => life(s, o) === 35).length).toBeLessThanOrEqual(1);
    const text = s.log.map((l) => l.text).join("\n");
    expect(text).toMatch(/targeting [A-D], [A-D], [A-D]\./);
    expect(text).toMatch(/loses 5 life/);
  });

  it("Surrak: draws when an opponent targets a creature you control or a creature spell you control, not when you do", () => {
    let { s, ap, ids } = setup([bear(), shock]);
    const opp = next(s, ap);
    putOnBattlefield(s, ap, surrak);
    const mine = putOnBattlefield(s, ap, creature("Test Mine", "Beast", 3, 5));
    putOnBattlefield(s, opp, mountain);
    putOnBattlefield(s, opp, island);
    const scatter = into(s, opp, card("Test Scatter", "Instant", "{U}", { cmc: 1, oracleText: "Counter target creature spell." }), "hand");
    const oppBolt = into(s, opp, bolt, "hand");
    const n0 = hand(s, ap).length;
    // Your own spell targeting your creature: no draw.
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(mine)])));
    expect(hand(s, ap).length).toBe(n0 - 1);
    // A creature spell you control, targeted by an opponent's spell.
    s = run(s, planCast(s, ap, ids[0]!));
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    s = run(s, planCast(s, opp, scatter, [{ kind: "stack", id: s.stack[0]!.id }]));
    s = resolveAll(s);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(hand(s, ap).length).toBe(n0 - 1);
    // A creature you control, targeted by an opponent: the draw.
    const n1 = hand(s, ap).length;
    s = run(s, planCast(s, ap, into(s, ap, card("Test Draw", "Sorcery", "{1}", { cmc: 1, oracleText: "Draw a card." }), "hand")));
    s = act(s, { type: "passPriority", player: ap });
    s = run(s, planCast(s, opp, oppBolt, [tgt(mine)]));
    s = resolveAll(s);
    expect(hand(s, ap).length).toBe(n1 + 2);
  });

  it("Skyserpent Seeker: exhaust reveals until two land cards, puts them onto the battlefield tapped, the rest on the bottom, and a counter on it", () => {
    let { s, ap } = setup([]);
    const seeker = putOnBattlefield(s, ap, skyserpent);
    const order = [creature("Test A", "Beast", 1), card("Test Land One", "Land"), creature("Test B", "Beast", 1), card("Test Land Two", "Land"), creature("Test C", "Beast", 1)];
    const ids = [...order].reverse().map((d) => into(s, ap, d, "library")).reverse();
    s = run(s, planActivate(s, ap, seeker, 0));
    s = resolveAll(s);
    expect(zone(s, ids[1]!)).toBe("battlefield");
    expect(zone(s, ids[3]!)).toBe("battlefield");
    expect(s.objects[ids[1]!]!.tapped && s.objects[ids[3]!]!.tapped).toBe(true);
    expect(zone(s, ids[4]!)).toBe("library");
    expect(s.players[ap]!.library[0]).toBe(ids[4]);
    expect(s.players[ap]!.library.slice(-2).sort()).toEqual([ids[0]!, ids[2]!].sort());
    expect(counters(s, seeker)).toBe(1);
    // Exhaust: only once.
    expect(planActivate(s, ap, seeker, 0)).toBeNull();
  });

  it("Change of Plans: each of X target creatures connives, then you choose which of them phase out", () => {
    let { s, ap, ids } = setup([changeOfPlans]);
    const a = putOnBattlefield(s, ap, creature("Test A", "Beast", 2));
    const b = putOnBattlefield(s, ap, creature("Test B", "Beast", 2));
    const nonland = into(s, ap, bolt, "hand");
    s = run(s, planCast(s, ap, ids[0]!, [tgt(a), tgt(b)], undefined, undefined, 2));
    for (let i = 0; i < 40 && (s.stack.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "discard") s = act(s, { type: "discard", player: p.player, objectIds: [hand(s, ap).includes(nonland) ? nonland : hand(s, ap)[0]!] });
      else if (p?.kind === "pickPermanents") break;
      else if (p) throw new Error(`unexpected ${p.kind}`);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "phaseOut", min: 0 });
    expect((s.pending as { options: ObjectId[] }).options.sort()).toEqual([a, b].sort());
    expect(counters(s, a) + counters(s, b)).toBeGreaterThanOrEqual(1);
    s = resolveAll(act(s, { type: "pickPermanents", player: ap, ids: [b] }));
    expect(s.objects[b]!.phased).toBeTruthy();
    expect(s.objects[a]!.phased).toBeFalsy();
  });

  it("Homing Sliver: Sliver cards in every player's hand have slivercycling {3}; others don't", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    putOnBattlefield(s, ap, homing);
    const sliver = card("Test Sliver", "Creature — Sliver", "{1}{R}", { cmc: 2, power: "2", toughness: "2" });
    const theirs = into(s, opp, sliver, "hand");
    const mine = into(s, ap, sliver, "hand");
    const other = into(s, opp, creature("Test Beast", "Beast", 2), "hand");
    const found = into(s, opp, sliver, "library");
    const cycling = (id: ObjectId) => abilitiesOf(s, s.objects[id]!).activated.filter((a) => a.text === "Slivercycling {3}");
    expect(cycling(theirs)).toHaveLength(1);
    expect(cycling(mine)).toHaveLength(1);
    expect(cycling(other)).toHaveLength(0);
    for (const l of [mountain, mountain, mountain]) putOnBattlefield(s, opp, l);
    const idx = abilitiesOf(s, s.objects[theirs]!).activated.indexOf(cycling(theirs)[0]!);
    s = act(s, { type: "passPriority", player: ap });
    s = run(s, planActivate(s, opp, theirs, idx));
    s = pass(s, (x) => x.pending?.kind === "searchLibrary");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: opp });
    s = resolveAll(act(s, { type: "searchLibrary", player: opp, found: [found] }));
    expect(zone(s, theirs)).toBe("graveyard");
    expect(zone(s, found)).toBe("hand");
  });

  it("Fear of Burning Alive: with delirium, noncombat damage to an opponent is dealt again to a creature of theirs", () => {
    let { s, ap, ids } = setup([shock, shock]);
    const opp = next(s, ap);
    putOnBattlefield(s, ap, fear);
    const victim = putOnBattlefield(s, opp, creature("Test Victim", "Beast", 3, 2));
    // Without delirium: nothing.
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect(life(s, opp)).toBe(38);
    expect(s.stack).toHaveLength(0);
    expect(zone(s, victim)).toBe("battlefield");
    // Instant (the first Shock), plus a land, a creature and a sorcery: four card types.
    into(s, ap, mountain, "graveyard");
    into(s, ap, creature("Test Dead", "Beast", 1), "graveyard");
    into(s, ap, card("Test Sorcery", "Sorcery", "{1}", { cmc: 1, oracleText: "Draw a card." }), "graveyard");
    s = run(s, planCast(s, ap, ids[1]!, [player(opp)]));
    s = pass(s, (x) => x.pending?.kind === "chooseTargets");
    expect(s.pending?.kind).toBe("chooseTargets");
    s = choose(s, [tgt(victim)]);
    expect(life(s, opp)).toBe(36);
    expect(zone(s, victim)).toBe("graveyard");
  });

  it("Grove's Bounty: X +1/+1 counters divided among any number of target creatures you control, at least one each", () => {
    let { s, ap, ids } = setup([otter]);
    const a = putOnBattlefield(s, ap, creature("Test A", "Beast", 2));
    const b = putOnBattlefield(s, ap, creature("Test B", "Beast", 2));
    expect(planCast(s, ap, ids[0]!, [{ kind: "object", id: a, amount: 2 }, { kind: "object", id: b, amount: 2 }], undefined, "auto", 3, { face: 1 })).toBeNull();
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: a, amount: 2 }, { kind: "object", id: b, amount: 1 }], undefined, "auto", 3, { face: 1 }));
    s = resolveAll(s);
    expect(counters(s, a)).toBe(2);
    expect(counters(s, b)).toBe(1);
    expect(zone(s, ids[0]!)).toBe("exile");
  });

  it("Broodlord: enters with X counters and distributes X more among other creatures you control as the trigger is put on the stack", () => {
    let { s, ap, ids } = setup([broodlord]);
    const a = putOnBattlefield(s, ap, creature("Test A", "Beast", 2));
    const b = putOnBattlefield(s, ap, creature("Test B", "Beast", 2));
    s = run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto", 3));
    s = pass(s, (x) => x.pending?.kind === "chooseTargets");
    expect(s.pending?.kind).toBe("chooseTargets");
    expect(counters(s, ids[0]!)).toBe(3);
    // Not Broodlord itself, and the parts must add up to 3.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: ids[0]!, amount: 1 }, { kind: "object", id: a, amount: 2 }] })).toThrow();
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: a, amount: 1 }, { kind: "object", id: b, amount: 1 }] })).toThrow();
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: a, amount: 1 }, { kind: "object", id: b, amount: 2 }] }));
    expect(counters(s, a)).toBe(1);
    expect(counters(s, b)).toBe(2);
    expect(counters(s, ids[0]!)).toBe(3);
  });

  it("Deep-Cavern Bat: you may exile a nonland card from the opponent's hand until it leaves; then it returns to their hand", () => {
    let { s, ap, ids } = setup([bat, shock]);
    const opp = next(s, ap);
    const land = into(s, opp, mountain, "hand");
    const spell = into(s, opp, bolt, "hand");
    s = run(s, planCast(s, ap, ids[0]!));
    s = pass(s, (x) => !!x.pending);
    s = act(s, { type: "chooseTargets", player: ap, targets: [player(opp)] });
    s = pass(s, (x) => x.pending?.kind === "searchLibrary");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0 });
    const offered = (s.pending as { cards: ObjectId[] }).cards;
    expect(offered).toContain(spell);
    expect(offered).not.toContain(land);
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [spell] }));
    expect(zone(s, spell)).toBe("exile");
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(ids[0]!)])));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(hand(s, opp)).toContain(spell);
  });

  it("Shark Shredder: the creature card from the damaged player's graveyard enters tapped and attacking that player", () => {
    let { s, ap } = setup([]);
    const [b, c] = [next(s, ap), next(s, ap, 2)];
    const sh = putOnBattlefield(s, ap, shark);
    const dead = into(s, b, creature("Test Dead", "Beast", 3), "graveyard");
    into(s, c, creature("Test Other", "Beast", 5), "graveyard");
    s = attack(s, ap, [{ attacker: sh, defender: b }]);
    for (let i = 0; i < 40 && s.pending?.kind !== "chooseTargets"; i++) {
      const p = s.pending;
      if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.step).toBe("firstStrikeDamage");
    const spec = (s.pending as { specs: Parameters<typeof legalTargets>[1][] }).specs[0]!;
    expect(legalTargets(s, spec, ap).map((x) => (x as { id?: string }).id)).toEqual([dead]);
    s = choose(s, [tgt(dead)]);
    expect(zone(s, dead)).toBe("battlefield");
    expect(controllerOf(s, s.objects[dead]!)).toBe(ap);
    expect(s.objects[dead]!.tapped).toBe(true);
    expect(s.objects[dead]!.attacking).toBe(b);
    s = toStep(s, "endCombat", ap);
    expect(life(s, b)).toBe(33);
  });

  it("Havoc Eater: goads up to one creature of each opponent and gets counters equal to the total power of those goaded", () => {
    let { s, ap, ids } = setup([havocEater]);
    const [b, c, d] = [next(s, ap), next(s, ap, 2), next(s, ap, 3)];
    const big = putOnBattlefield(s, b, creature("Test Big", "Beast", 4));
    const small = putOnBattlefield(s, c, creature("Test Small", "Beast", 2));
    putOnBattlefield(s, d, creature("Test Other", "Beast", 5));
    s = run(s, planCast(s, ap, ids[0]!));
    s = pass(s, (x) => x.pending?.kind === "chooseTargets");
    expect(s.pending?.kind).toBe("chooseTargets");
    s = choose(s, [tgt(big), tgt(small), { kind: "none" }]);
    expect(goaded(s, big)).toBe(true);
    expect(goaded(s, small)).toBe(true);
    expect(counters(s, ids[0]!)).toBe(6);
    expect(pt(s, ids[0]!)).toEqual([9, 9]);
  });

  it("Havoc Eater: a target gone before it resolves isn't goaded and doesn't count", () => {
    let { s, ap, ids } = setup([havocEater, bolt]);
    const [b, c] = [next(s, ap), next(s, ap, 2)];
    const big = putOnBattlefield(s, b, creature("Test Big", "Beast", 4, 3));
    const small = putOnBattlefield(s, c, creature("Test Small", "Beast", 2));
    s = run(s, planCast(s, ap, ids[0]!));
    s = pass(s, (x) => x.pending?.kind === "chooseTargets");
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(big), tgt(small), { kind: "none" }] });
    s = run(s, planCast(s, ap, ids[1]!, [tgt(big)]));
    s = resolveAll(s);
    expect(zone(s, big)).toBe("graveyard");
    expect(goaded(s, small)).toBe(true);
    expect(counters(s, ids[0]!)).toBe(2);
  });

  it("Undergrowth Champion: prevents damage only while it has a +1/+1 counter, removing one each time", () => {
    let { s, ap, ids } = setup([shock, shock, shock]);
    const u = putOnBattlefield(s, ap, undergrowth);
    s.objects[u]!.counters["+1/+1"] = 2;
    invalidateCharacteristics(s);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(u)])));
    expect([counters(s, u), s.objects[u]!.damage ?? 0]).toEqual([1, 0]);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(u)])));
    expect([counters(s, u), s.objects[u]!.damage ?? 0]).toEqual([0, 0]);
    expect(pt(s, u)).toEqual([2, 2]);
    // No counter left: the third Shock is dealt and kills it.
    s = resolveAll(run(s, planCast(s, ap, ids[2]!, [tgt(u)])));
    expect(zone(s, u)).toBe("graveyard");
  });

  it("Undergrowth Champion: combat damage from two blockers is one event, so one counter goes and all of it is prevented (rulings)", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const u = putOnBattlefield(s, ap, undergrowth);
    s.objects[u]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s);
    const b1 = putOnBattlefield(s, opp, bear());
    const b2 = putOnBattlefield(s, opp, bear());
    s = attack(s, ap, [{ attacker: u, defender: opp }]);
    for (let i = 0; i < 40 && s.step !== "endCombat"; i++) {
      const p = s.pending;
      if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: p.player === opp ? [{ blocker: b1, attacker: u }, { blocker: b2, attacker: u }] : [] });
      else if (p) break;
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    if (s.pending) s = resolveAll(s);
    expect(zone(s, u)).toBe("battlefield");
    expect([counters(s, u), s.objects[u]!.damage ?? 0]).toEqual([0, 0]);
  });

  it("Phantom creatures: damage that can't be prevented is dealt and still removes a counter (rulings)", () => {
    let { s, ap, ids } = setup([shock]);
    putOnBattlefield(s, ap, leyline);
    const c = putOnBattlefield(s, ap, centaur);
    s.objects[c]!.counters["+1/+1"] = 3;
    invalidateCharacteristics(s);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(c)])));
    // A 4/2 after losing a counter, with 2 damage dealt: it dies.
    expect(s.log.some((e) => /counter is removed from Phantom Centaur/.test(e.text))).toBe(true);
    expect(s.log.some((e) => /prevented/.test(e.text))).toBe(false);
    expect(zone(s, c)).toBe("graveyard");
  });

  it("Hurl Through Hell: you may cast the exiled creature card with mana of any color, until the end of your next turn", () => {
    let { s, ap, ids } = setup([hurl]);
    const opp = next(s, ap);
    const big = card("Test Green Giant", "Creature — Giant", "{G}{G}{G}{G}", { cmc: 4, power: "5", toughness: "5" });
    const g = putOnBattlefield(s, opp, big);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(g)])));
    const exiled = () => Object.values(s.objects).find((o) => o.zone === "exile" && s.cards[o.cardId]!.name === "Test Green Giant");
    const card0 = exiled()!;
    expect(card0.mayPlay).toMatchObject({ player: ap, until: "nextTurn", castOnly: true, anyType: true });
    // No green mana left, only Islands and Swamps, and it can still be cast.
    const keep = lands(s, ap).filter((id) => ["Island", "Swamp"].includes(s.cards[s.objects[id]!.cardId]!.name));
    tapAllBut(s, ap, keep);
    expect(planCast(s, ap, card0.id)).not.toBeNull();
    const t = resolveAll(run(structuredClone(s), planCast(s, ap, card0.id)));
    expect([zone(t, card0.id), controllerOf(t, t.objects[card0.id]!)]).toEqual(["battlefield", ap]);
    // The permission lasts through the other players' turns and your next turn, then ends.
    s = toStep(s, "main1", next(s, ap, 2));
    expect(exiled()!.mayPlay).toBeDefined();
    s = toStep(s, "main1", ap);
    expect(exiled()!.mayPlay).toBeDefined();
    s = toStep(s, "upkeep", next(s, ap));
    expect(exiled()!.mayPlay).toBeUndefined();
    // The owner can't cast it either.
    expect(planCast(s, opp, exiled()!.id)).toBeNull();
  });

  it("Hurl Through Hell: a token exiled this way ceases to exist", () => {
    let { s, ap, ids } = setup([hurl]);
    const opp = next(s, ap);
    const tok = putOnBattlefield(s, opp, creature("Test Token", "Beast", 2));
    s.objects[tok]!.isToken = true;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(tok)])));
    expect(Object.values(s.objects).some((o) => o.zone === "exile" && s.cards[o.cardId]!.name === "Test Token" && o.mayPlay)).toBe(false);
  });
});
