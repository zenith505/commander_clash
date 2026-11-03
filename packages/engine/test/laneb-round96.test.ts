// Lane B, round 96: unsupported cards from the bottom of the popularity list (`npm run popular -- --least`). Life Matrix,
// War Barge, Orcish Mine, Errant Minion, Power Leak, Sacellum Godspeaker and Shambling Swarm.

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, botActions, characteristics, invalidateCharacteristics, isFullySupported, manaOptions, planActivate, planCast, tapPermanent, waitingOn, type Action, type CardDef, type GameState, type PendingDecision, type PlayerId, type TargetChoice } from "../src";

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
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = []) => run(s, planCast(s, pid, id, targets, undefined, "auto"));
const choose = (s: GameState, choice: string) => act(s, { type: "chooseOption", player: s.pending!.player, choice });
const pend = (s: GameState) => s.pending as Extract<PendingDecision, { kind: "chooseOption" }>;
/** Moves a new card for `def` into `pid`'s hand. */
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Empties `pid`'s hand (into exile). */
const emptyHand = (s: GameState, pid: PlayerId) => {
  for (const id of [...s.players[pid]!.hand]) {
    s.players[pid]!.hand.splice(s.players[pid]!.hand.indexOf(id), 1);
    s.objects[id]!.zone = "exile";
    s.players[pid]!.exile.push(id);
  }
  invalidateCharacteristics(s);
};
const shatter = card("Test Shatter", "Instant", "{R}", { oracleText: "Destroy target artifact.", colors: ["R"] });
const murder = card("Test Murder", "Instant", "{B}", { oracleText: "Destroy target creature.", colors: ["B"] });
const glory = card("Test Glory", "Enchantment", "{W}", { oracleText: "", colors: ["W"] });
const titan = card("Test Titan", "Creature — Giant", "{5}{G}", { power: "6", toughness: "6", colors: ["G"] });
const statue = card("Test Statue", "Artifact", "{5}", { oracleText: "" });
const matrix = (): CardDef => ({"oracleId":"0fd1ddc3-65cc-489f-81b9-6c144843fc67","name":"Life Matrix","manaCost":"{4}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{4}, {T}: Put a matrix counter on target creature and that creature gains \"Remove a matrix counter from this creature: Regenerate this creature.\" Activate only during your upkeep.","colors":[],"colorIdentity":[],"keywords":["Regenerate"],"imageUrl":"https://cards.scryfall.io/normal/front/c/9/c99a3abc-e2a3-4eee-8f72-b1b25dcd1d0b.jpg?1783948027","artUrl":"https://cards.scryfall.io/art_crop/front/c/9/c99a3abc-e2a3-4eee-8f72-b1b25dcd1d0b.jpg?1783948027","commanderLegal":"legal","set":"leg","releasedAt":"1994-06-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const barge = (): CardDef => ({"oracleId":"fd57331f-1cfa-4f88-a925-fc171738c3c0","name":"War Barge","manaCost":"{4}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{3}: Target creature gains islandwalk until end of turn. When this artifact leaves the battlefield this turn, destroy that creature. A creature destroyed this way can't be regenerated. (A creature with islandwalk can't be blocked as long as defending player controls an Island.)","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/0/9023c078-4169-498b-8626-a4862e0631f8.jpg?1783947923","artUrl":"https://cards.scryfall.io/art_crop/front/9/0/9023c078-4169-498b-8626-a4862e0631f8.jpg?1783947923","commanderLegal":"legal","set":"drk","releasedAt":"1994-08-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const mine = (): CardDef => ({"oracleId":"a6bfa03e-6317-4550-960b-fbd2a30e521f","name":"Orcish Mine","manaCost":"{1}{R}{R}","cmc":3,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant land\nThis Aura enters with three ore counters on it.\nAt the beginning of your upkeep and whenever enchanted land becomes tapped, remove an ore counter from this Aura.\nWhen the last ore counter is removed from this Aura, destroy enchanted land and this Aura deals 2 damage to that land's controller.","colors":["R"],"colorIdentity":["R"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/3/a/3a630875-b43d-4591-992c-117e1212fa34.jpg?1783947282","artUrl":"https://cards.scryfall.io/art_crop/front/3/a/3a630875-b43d-4591-992c-117e1212fa34.jpg?1783947282","commanderLegal":"legal","set":"hml","releasedAt":"1995-10-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const minion = (): CardDef => ({"oracleId":"80459049-bd89-4736-82f8-03c603644033","name":"Errant Minion","manaCost":"{2}{U}","cmc":3,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nAt the beginning of the upkeep of enchanted creature's controller, that player may pay any amount of mana. This Aura deals 2 damage to that player. Prevent X of that damage, where X is the amount of mana that player paid this way.","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/6/1/61648ddb-6efb-43d0-b2b1-418cc957854c.jpg?1783947515","artUrl":"https://cards.scryfall.io/art_crop/front/6/1/61648ddb-6efb-43d0-b2b1-418cc957854c.jpg?1783947515","commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const leak = (): CardDef => ({"oracleId":"dc2f0000-870b-487f-9623-618fc8eb9765","name":"Power Leak","manaCost":"{1}{U}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant enchantment\nAt the beginning of the upkeep of enchanted enchantment's controller, that player may pay any amount of mana. This Aura deals 2 damage to that player. Prevent X of that damage, where X is the amount of mana that player paid this way.","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/c/c/ccc982b6-35b2-4e33-ace2-86cb79123e4f.jpg?1783948702","artUrl":"https://cards.scryfall.io/art_crop/front/c/c/ccc982b6-35b2-4e33-ace2-86cb79123e4f.jpg?1783948702","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const godspeaker = (): CardDef => ({"oracleId":"891e9a08-35ec-422f-87a8-1f3f5c705699","name":"Sacellum Godspeaker","manaCost":"{2}{G}","cmc":3,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Reveal any number of creature cards with power 5 or greater from your hand. Add {G} for each card revealed this way.","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad80819-22d4-43a8-97b2-7cf20f61bca5.jpg?1783942551","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad80819-22d4-43a8-97b2-7cf20f61bca5.jpg?1783942551","commanderLegal":"legal","set":"ala","releasedAt":"2008-10-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const swarm = (): CardDef => ({"oracleId":"7807122e-917f-4a79-876e-d1c10f7a38ed","name":"Shambling Swarm","manaCost":"{1}{B}{B}{B}","cmc":4,"typeLine":"Creature — Horror","supertypes":[],"types":["Creature"],"subtypes":["Horror"],"oracleText":"When this creature dies, distribute three -1/-1 counters among one, two, or three target creatures. For each -1/-1 counter you put on a creature this way, remove a -1/-1 counter from that creature at the beginning of the next end step.","power":"3","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/5/b5b93715-985f-4719-a3c3-044c2a150e96.jpg?1783945152","artUrl":"https://cards.scryfall.io/art_crop/front/b/5/b5b93715-985f-4719-a3c3-044c2a150e96.jpg?1783945152","commanderLegal":"legal","set":"tor","releasedAt":"2002-02-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const spores = (): CardDef => ({"oracleId":"0e3b7ec1-3760-4ac4-81ef-1ab389392f1b","name":"Mindbender Spores","manaCost":"{2}{G}","cmc":3,"typeLine":"Creature — Fungus Wall","supertypes":[],"types":["Creature"],"subtypes":["Fungus","Wall"],"oracleText":"Defender (This creature can't attack.)\nFlying\nWhenever this creature blocks a creature, put four fungus counters on that creature. The creature gains \"This creature doesn't untap during your untap step if it has a fungus counter on it\" and \"At the beginning of your upkeep, remove a fungus counter from this creature.\"","power":"0","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":["Flying","Defender"],"imageUrl":"https://cards.scryfall.io/normal/front/f/4/f41066eb-be5e-4a6d-9156-64f5e56c7ab3.jpg?1783947062","artUrl":"https://cards.scryfall.io/art_crop/front/f/4/f41066eb-be5e-4a6d-9156-64f5e56c7ab3.jpg?1783947062","commanderLegal":"legal","set":"mir","releasedAt":"1996-10-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const wight = (): CardDef => ({"oracleId":"f9078d79-3250-44e8-aba1-ab52e0ba4425","name":"Dread Wight","manaCost":"{3}{B}{B}","cmc":5,"typeLine":"Creature — Zombie","supertypes":[],"types":["Creature"],"subtypes":["Zombie"],"oracleText":"At end of combat, put a paralyzation counter on each creature blocking or blocked by this creature and tap those creatures. Each of those creatures doesn't untap during its controller's untap step for as long as it has a paralyzation counter on it. Each of those creatures gains \"{4}: Remove a paralyzation counter from this creature.\"","power":"3","toughness":"4","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/5/65d332e2-4b2d-4131-84f7-862cb138c477.jpg?1783947504","artUrl":"https://cards.scryfall.io/art_crop/front/6/5/65d332e2-4b2d-4131-84f7-862cb138c477.jpg?1783947504","commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const gorgon = (): CardDef => ({"oracleId":"ec62aed5-b59b-4ba0-b265-a9c2a798ffb3","name":"Gaze of the Gorgon","manaCost":"{3}{B/G}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"({B/G} can be paid with either {B} or {G}.)\nRegenerate target creature. At this turn's next end of combat, destroy all creatures that blocked or were blocked by it this turn.","colors":["B","G"],"colorIdentity":["B","G"],"keywords":["Regenerate"],"imageUrl":"https://cards.scryfall.io/normal/front/1/6/16c9e772-5213-4c28-9b6c-1cfa6675ee8f.jpg?1783943604","artUrl":"https://cards.scryfall.io/art_crop/front/1/6/16c9e772-5213-4c28-9b6c-1cfa6675ee8f.jpg?1783943604","commanderLegal":"legal","set":"rav","releasedAt":"2005-10-07","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

/** Plays on (no attacks or blocks, the bots answering other questions) until `stop`. */
const goUntil = (s: GameState, stop: (s: GameState) => boolean) => {
  for (let i = 0; i < 3000; i++) {
    if (stop(s)) return s;
    const p = s.pending;
    const pid = waitingOn(s)!;
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, p.count) });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error("never got there");
};
const attackWith = (s: GameState, attackers: string[], defender: PlayerId) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return act(s, { type: "declareAttackers", player: s.activePlayer, attacks: attackers.map((attacker) => ({ attacker, defender })) });
};
/** Blocks declared by `opp`; every other defending player declares none. */
const block = (s: GameState, opp: PlayerId, blocks: { blocker: string; attacker: string }[]) => {
  for (let i = 0; i < 100 && s.pending?.kind !== "declareBlockers"; i++) {
    if (s.stack.length || s.pending) s = settle(s);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  s = act(s, { type: "declareBlockers", player: opp, blocks });
  for (let i = 0; i < 10 && s.pending?.kind === "declareBlockers"; i++) s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
  return s;
};
const sturdy = card("Test Sturdy", "Creature — Ox", "{3}", { power: "1", toughness: "5" });

describe("Lane B round 96", () => {
  it("compiles every card of the round fully", () => {
    supported(matrix(), barge(), mine(), minion(), leak(), godspeaker(), swarm(), spores(), wight(), gorgon());
  });

  it("Life Matrix: only in your upkeep; the creature gets a matrix counter and an ability only its controller can activate", () => {
    let { s, ap, opp } = setup([]);
    emptyHand(s, ap);
    const lm = putOnBattlefield(s, ap, matrix());
    const theirs = putOnBattlefield(s, opp, bear());
    expect(planActivate(s, ap, lm, 0, [tgt(theirs)])).toBeNull();
    s = passUntil(s, "upkeep", opp);
    s = passUntil(s, "upkeep", ap);
    s = settle(s);
    s = run(s, planActivate(s, ap, lm, 0, [tgt(theirs)]));
    s = settle(s);
    expect(s.objects[theirs]!.counters.matrix).toBe(1);
    const i = abilitiesOf(s, s.objects[theirs]!).activated.findIndex((a) => /Regenerate/.test(a.text));
    expect(i).toBeGreaterThanOrEqual(0);
    // Only the creature's controller can activate it (rulings).
    expect(planActivate(s, ap, theirs, i)).toBeNull();
    for (let k = 0; k < 8 && waitingOn(s) !== opp; k++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = run(s, planActivate(s, opp, theirs, i));
    s = settle(s);
    expect(s.objects[theirs]!.counters.matrix ?? 0).toBe(0);
    expect(s.objects[theirs]!.regenShields).toBe(1);
  });

  it("War Barge: islandwalk until end of turn; if War Barge leaves this turn, that creature is destroyed and can't be regenerated", () => {
    let { s, ap, ids, opp } = setup([shatter]);
    const wb = putOnBattlefield(s, ap, barge());
    const theirs = putOnBattlefield(s, opp, bear());
    s = run(s, planActivate(s, ap, wb, 0, [tgt(theirs)]));
    s = settle(s);
    expect(characteristics(s, s.objects[theirs]!).keywords).toContain("Islandwalk");
    s.objects[theirs]!.regenShields = 1;
    s = castNow(s, ap, ids[0]!, [tgt(wb)]);
    s = settle(s);
    expect(zone(s, wb)).toBe("graveyard");
    expect(zone(s, theirs)).toBe("graveyard");
  });

  it("War Barge: only this turn, and about that creature as it was", () => {
    let { s, ap, ids, opp } = setup([shatter]);
    emptyHand(s, opp);
    const wb = putOnBattlefield(s, ap, barge());
    const theirs = putOnBattlefield(s, opp, bear());
    s = run(s, planActivate(s, ap, wb, 0, [tgt(theirs)]));
    s = settle(s);
    s = passUntil(s, "upkeep", opp);
    s = settle(s);
    s = passUntil(s, "main1", opp);
    expect(characteristics(s, s.objects[theirs]!).keywords).not.toContain("Islandwalk");
    for (let i = 0; i < 8 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = castNow(s, ap, ids[0]!, [tgt(wb)]);
    s = settle(s);
    expect(zone(s, wb)).toBe("graveyard");
    expect(zone(s, theirs)).toBe("battlefield");
  });

  it("Orcish Mine: an ore counter off at your upkeep and each time the land becomes tapped; at the last, the land is destroyed and its controller takes 2", () => {
    let { s, ap, ids, opp } = setup([mine()]);
    const land = putOnBattlefield(s, opp, forest);
    s = castNow(s, ap, ids[0]!, [tgt(land)]);
    s = settle(s);
    expect(s.objects[ids[0]!]!.attachedTo).toBe(land);
    expect(s.objects[ids[0]!]!.counters.ore).toBe(3);
    tapPermanent(s, s.objects[land]!);
    s = settle(s);
    expect(s.objects[ids[0]!]!.counters.ore).toBe(2);
    s.objects[land]!.tapped = false;
    tapPermanent(s, s.objects[land]!);
    s = settle(s);
    expect(s.objects[ids[0]!]!.counters.ore).toBe(1);
    const life = s.players[opp]!.life;
    const mine0 = s.players[ap]!.life;
    // Only Ken's upkeep, not the opponent's.
    s = passUntil(s, "upkeep", opp);
    s = settle(s);
    expect(s.objects[ids[0]!]!.counters.ore).toBe(1);
    s = passUntil(s, "upkeep", ap);
    s = settle(s);
    expect(zone(s, land)).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life - 2);
    expect(s.players[ap]!.life).toBe(mine0);
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });

  it("Errant Minion: at the upkeep of the enchanted creature's controller, they may pay any amount of mana; X of the 2 damage is prevented", () => {
    let { s, ap, ids, opp } = setup([minion(), minion()]);
    emptyHand(s, opp);
    const theirs = putOnBattlefield(s, opp, bear());
    const mine0 = putOnBattlefield(s, ap, bear());
    s = castNow(s, ap, ids[0]!, [tgt(theirs)]);
    s = settle(s);
    s = castNow(s, ap, ids[1]!, [tgt(mine0)]);
    s = settle(s);
    // The opponent has no mana: not asked, all 2 dealt.
    const life = s.players[opp]!.life;
    s = passUntil(s, "upkeep", opp);
    s = settle(s);
    expect(s.players[opp]!.life).toBe(life - 2);
    // Ken pays 1 of it: 1 damage.
    const mine1 = s.players[ap]!.life;
    s = passUntil(s, "upkeep", ap);
    s = settle(s, { me: [ap] });
    expect(pend(s).what).toBe("payX");
    expect(pend(s).prompt).not.toMatch(/paid so far/);
    s = choose(s, "1");
    s = settle(s, { me: [ap] });
    expect(s.pending?.kind).toBe("chooseMay");
    // A "may pay" with a mana cost is paid from the pool (the app fills it first).
    s.players[ap]!.manaPool.C = 1;
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = settle(s);
    expect(s.players[ap]!.life).toBe(mine1 - 1);
  });

  it("Power Leak: the enchanted enchantment's controller; a bot pays enough to prevent all of it", () => {
    let { s, ap, ids, opp } = setup([leak()]);
    emptyHand(s, opp);
    const theirs = putOnBattlefield(s, opp, glory);
    s = castNow(s, ap, ids[0]!, [tgt(theirs)]);
    s = settle(s);
    const life = s.players[opp]!.life;
    s = passUntil(s, "upkeep", opp);
    s.players[opp]!.manaPool.C = 5;
    s = settle(s);
    expect(s.players[opp]!.life).toBe(life);
    expect(s.players[opp]!.manaPool.C).toBe(3);
  });

  it("Sacellum Godspeaker: reveal any number of creature cards with power 5 or greater from your hand, {G} for each", () => {
    const { s, ap } = setup([titan, titan, bear(), statue]);
    const gs = putOnBattlefield(s, ap, godspeaker());
    const o = s.objects[gs]!;
    expect(manaOptions(s, o).map((x) => x.adds.length)).toEqual([0, 1, 2]);
    const two = manaOptions(s, o).find((x) => x.adds.length === 2)!;
    const s2 = act(s, { type: "activateMana", player: ap, objectId: gs, mana: two.mana, ability: two.ability, combo: two.combo });
    expect(s2.players[ap]!.manaPool.G).toBe(2);
    expect(s2.objects[gs]!.tapped).toBe(true);
  });

  it("Shambling Swarm: dies, three -1/-1 counters distributed; at the next end step as many removed from each creature", () => {
    let { s, ap, ids, opp } = setup([murder]);
    const sw = putOnBattlefield(s, ap, swarm());
    const a = putOnBattlefield(s, opp, titan);
    const b = putOnBattlefield(s, opp, card("Test Ox", "Creature — Ox", "{3}", { power: "3", toughness: "3" }));
    s = castNow(s, ap, ids[0]!, [tgt(sw)]);
    s = settle(s, { me: [ap] });
    expect(s.pending?.kind).toBe("chooseTargets");
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ ...tgt(a), amount: 2 }, { ...tgt(b), amount: 1 }, { kind: "none" }] } as Action);
    s = settle(s);
    expect(s.objects[a]!.counters["-1/-1"]).toBe(2);
    expect(s.objects[b]!.counters["-1/-1"]).toBe(1);
    // Another -1/-1 counter on the ox: still only one removed (rulings: not necessarily the same counters).
    s.objects[b]!.counters["-1/-1"] = 2;
    invalidateCharacteristics(s);
    s = passUntil(s, "end", ap);
    s = settle(s);
    expect(s.objects[a]!.counters["-1/-1"] ?? 0).toBe(0);
    expect(s.objects[b]!.counters["-1/-1"]).toBe(1);
  });

  it("Mindbender Spores: the creature it blocks gets four fungus counters, doesn't untap while it has one, loses one each upkeep", () => {
    let { s, ap, opp } = setup([]);
    emptyHand(s, ap);
    const sp = putOnBattlefield(s, opp, spores());
    const b = putOnBattlefield(s, ap, bear());
    s = block(attackWith(s, [b], opp), opp, [{ blocker: sp, attacker: b }]);
    s = settle(s);
    expect(s.objects[b]!.counters.fungus).toBe(4);
    expect(abilitiesOf(s, s.objects[b]!).triggers.some((t) => t.event === "eachUpkeep" || t.event === "yourUpkeep")).toBe(true);
    s = goUntil(s, (x) => x.activePlayer === ap && x.step === "upkeep" && x.turn > s.turn);
    s = settle(s);
    // It stayed tapped in Ken's untap step, and lost one counter in his upkeep.
    expect(s.objects[b]!.tapped).toBe(true);
    expect(s.objects[b]!.counters.fungus).toBe(3);
  });

  it("Dread Wight: at end of combat, each creature in combat with it gets a paralyzation counter and is tapped; {4} removes one", () => {
    let { s, ap, opp } = setup([]);
    emptyHand(s, ap);
    const dw = putOnBattlefield(s, opp, wight());
    const ox = putOnBattlefield(s, ap, sturdy);
    const other = putOnBattlefield(s, ap, bear());
    s = block(attackWith(s, [ox, other], opp), opp, [{ blocker: dw, attacker: ox }]);
    s = goUntil(s, (x) => x.step === "main2");
    expect(s.objects[ox]!.counters.paralyzation).toBe(1);
    expect(s.objects[other]!.counters.paralyzation ?? 0).toBe(0);
    expect(characteristics(s, s.objects[ox]!).doesntUntap).toBe(true);
    // Ken's next turn: still tapped; then he pays {4} to remove the counter, and it untaps the turn after.
    s = goUntil(s, (x) => x.activePlayer === ap && x.step === "main1" && x.turn > s.turn);
    expect(s.objects[ox]!.tapped).toBe(true);
    expect(s.objects[other]!.tapped).toBe(false);
    const i = abilitiesOf(s, s.objects[ox]!).activated.findIndex((a) => /Remove a paralyzation counter/.test(a.text));
    s = run(s, planActivate(s, ap, ox, i));
    s = settle(s);
    expect(s.objects[ox]!.counters.paralyzation ?? 0).toBe(0);
    expect(characteristics(s, s.objects[ox]!).doesntUntap).toBe(false);
    // A new counter later doesn't bring the lock back (CR 611.2b).
    s.objects[ox]!.counters.paralyzation = 1;
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[ox]!).doesntUntap).toBe(false);
  });

  it("Gaze of the Gorgon: regenerate the creature; at this turn's next end of combat, destroy the creatures that blocked it", () => {
    let { s, ap, ids, opp } = setup([gorgon()]);
    const b = putOnBattlefield(s, ap, bear());
    const ox = putOnBattlefield(s, opp, card("Test Ox", "Creature — Ox", "{3}", { power: "3", toughness: "3" }));
    const bystander = putOnBattlefield(s, opp, card("Test Goat", "Creature — Goat", "{1}", { power: "0", toughness: "1" }));
    s = block(attackWith(s, [b], opp), opp, [{ blocker: ox, attacker: b }]);
    s = settle(s);
    expect(waitingOn(s)).toBe(ap);
    s = castNow(s, ap, ids[0]!, [tgt(b)]);
    s = settle(s);
    s = goUntil(s, (x) => x.step === "main2");
    // The bear was regenerated (it's still there) and the ox that blocked it was destroyed at end of combat.
    expect(zone(s, b)).toBe("battlefield");
    expect(zone(s, ox)).toBe("graveyard");
    expect(zone(s, bystander)).toBe("battlefield");
  });
});
