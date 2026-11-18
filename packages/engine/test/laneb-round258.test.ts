// Lane B round B258: Sorrow's Path (two blockers of one opponent swap what they block if each could block what the other
// blocks: removed from combat, then blocking, CR 506.4, 509.1b, 509.3, rulings), General Jarkeld (two blocked attackers swap
// their blockers if each could be blocked by the other's, no new blocks, rulings) and Worms of the Earth (lands can't enter
// the battlefield, CR 111.5, 608.3e, rulings; an upkeep choice in turn order, as Vexing Devil's rulings).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, compileCard, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const sorrowsPath = (): CardDef => ({"oracleId":"5419eae0-3c12-4748-9cf8-d927752e527e","name":"Sorrow's Path","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}: Choose two target blocking creatures controlled by the same opponent. If each of those creatures could block all creatures that the other is blocking, remove both of them from combat. Each one then blocks all creatures the other was blocking.\nWhenever this land becomes tapped, it deals 2 damage to you and each creature you control.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/f/6f75946b-1690-43cc-993c-d4e451a1a41c.jpg?1783947922","artUrl":"https://cards.scryfall.io/art_crop/front/6/f/6f75946b-1690-43cc-993c-d4e451a1a41c.jpg?1783947922","layout":"normal"});
const generalJarkeld = (): CardDef => ({"oracleId":"64df77f6-4f7e-442a-971c-8ad3f7d1c979","name":"General Jarkeld","manaCost":"{3}{W}","cmc":4,"typeLine":"Legendary Creature — Human Soldier","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Soldier"],"oracleText":"{T}: Choose two target blocked attacking creatures. If each of those creatures could be blocked by all creatures that the other is blocked by, each creature that's blocking exactly one of those attacking creatures stops blocking it and is blocking the other attacking creature. Activate only during the declare blockers step.","power":"1","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/a/6a4f5a28-0bd2-4cc4-b67f-324e89193caa.jpg?1783947525","artUrl":"https://cards.scryfall.io/art_crop/front/6/a/6a4f5a28-0bd2-4cc4-b67f-324e89193caa.jpg?1783947525","layout":"normal"});
const wormsOfTheEarth = (): CardDef => ({"oracleId":"9638ec0c-c8bf-4aa5-a7ca-8677e4b9f241","name":"Worms of the Earth","manaCost":"{2}{B}{B}{B}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Players can't play lands.\nLands can't enter the battlefield.\nAt the beginning of each upkeep, any player may sacrifice two lands of their choice or have this enchantment deal 5 damage to that player. If a player does either, destroy this enchantment.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/5/65a97821-ca5b-46fb-af08-86de81d0daac.jpg?1783947937","artUrl":"https://cards.scryfall.io/art_crop/front/6/5/65a97821-ca5b-46fb-af08-86de81d0daac.jpg?1783947937","layout":"normal"});
const dryadArbor = (): CardDef => ({"oracleId":"e996cd67-739c-40f4-b276-0042acf26c71","name":"Dryad Arbor","manaCost":"","cmc":0,"typeLine":"Land Creature — Forest Dryad","supertypes":[],"types":["Land","Creature"],"subtypes":["Forest","Dryad"],"oracleText":"(This land isn't a spell, it's affected by summoning sickness, and it has \"{T}: Add {G}.\")","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/5/c/5c4fb7f9-a551-4253-a46e-f6284d355388.jpg?1783904262","artUrl":"https://cards.scryfall.io/art_crop/front/5/c/5c4fb7f9-a551-4253-a46e-f6284d355388.jpg?1783904262","layout":"normal"});
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","layout":"normal"});
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","layout":"normal"});
const giantBadger = (): CardDef => ({"oracleId":"a4109138-5d69-4510-a228-7c1f88c0c8c0","name":"Giant Badger","manaCost":"{1}{G}{G}","cmc":3,"typeLine":"Creature — Badger","supertypes":[],"types":["Creature"],"subtypes":["Badger"],"oracleText":"Whenever this creature blocks, it gets +2/+2 until end of turn.","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/0/10e9dd66-8580-4c96-9ab9-cc392dc6ee74.jpg?1783944676","artUrl":"https://cards.scryfall.io/art_crop/front/1/0/10e9dd66-8580-4c96-9ab9-cc392dc6ee74.jpg?1783944676","layout":"normal"});
const serraAngel = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","layout":"normal"});
const rampantGrowth = (): CardDef => ({"oracleId":"8539f295-5d58-4436-a73a-b9277c4c7795","name":"Rampant Growth","manaCost":"{1}{G}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/3/f3b48473-b53d-4c85-b970-7ee09a1eefd2.jpg?1783906256","artUrl":"https://cards.scryfall.io/art_crop/front/f/3/f3b48473-b53d-4c85-b970-7ee09a1eefd2.jpg?1783906256","layout":"normal"});
const clone = (): CardDef => ({"oracleId":"42226b87-0746-4ebf-9fd0-108d508462af","name":"Clone","manaCost":"{3}{U}","cmc":4,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"You may have this creature enter as a copy of any creature on the battlefield.","power":"0","toughness":"0","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/8/48c2e9e2-f679-451d-a700-18104af08988.jpg?1784013893","artUrl":"https://cards.scryfall.io/art_crop/front/4/8/48c2e9e2-f679-451d-a700-18104af08988.jpg?1784013893","layout":"normal"});
const boggartBrute = (): CardDef => ({"oracleId":"880793a2-84b0-4ae1-9bb8-6e942e3dc723","name":"Boggart Brute","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Goblin Warrior","supertypes":[],"types":["Creature"],"subtypes":["Goblin","Warrior"],"oracleText":"Menace (This creature can't be blocked except by two or more creatures.)","power":"3","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":["Menace"],"imageUrl":"https://cards.scryfall.io/normal/front/9/d/9d735ebf-61a4-4507-9399-6d32c8903ded.jpg?1783938333","artUrl":"https://cards.scryfall.io/art_crop/front/9/d/9d735ebf-61a4-4507-9399-6d32c8903ded.jpg?1783938333","layout":"normal"});
const crawWurm = (): CardDef => ({"oracleId":"6a462a69-3e42-41de-a3aa-a488d9f38d69","name":"Craw Wurm","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Creature — Wurm","supertypes":[],"types":["Creature"],"subtypes":["Wurm"],"oracleText":"","power":"6","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","artUrl":"https://cards.scryfall.io/art_crop/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","layout":"normal"});
const awakenTheWoods = (): CardDef => ({"oracleId":"3cc79d36-1a24-4395-8ad1-915a65db8a60","name":"Awaken the Woods","manaCost":"{X}{G}{G}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Create X 1/1 green Forest Dryad land creature tokens. (They're affected by summoning sickness.)","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/6/d661aa8e-46fd-4f47-ade7-99c9142f3733.jpg?1783919973","artUrl":"https://cards.scryfall.io/art_crop/front/d/6/d661aa8e-46fd-4f47-ade7-99c9142f3733.jpg?1783919973","layout":"normal"});
const ashaya = (): CardDef => ({"oracleId":"162572f2-1757-42e9-bd97-e6bd9a762c0e","name":"Ashaya, Soul of the Wild","manaCost":"{3}{G}{G}","cmc":5,"typeLine":"Legendary Creature — Elemental","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elemental"],"oracleText":"Ashaya's power and toughness are each equal to the number of lands you control.\nNontoken creatures you control are Forest lands in addition to their other types. (They're still affected by summoning sickness.)","power":"*","toughness":"*","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/4/74943390-d25f-47cb-90bb-cbf70c87f4a2.jpg?1783929342","artUrl":"https://cards.scryfall.io/art_crop/front/7/4/74943390-d25f-47cb-90bb-cbf70c87f4a2.jpg?1783929342","layout":"normal"});

const supported = (...ds: CardDef[]) => ds.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes priority (no attacks or blocks) until `done`. */
const until = (s: GameState, done: (s: GameState) => boolean, max = 600) => {
  for (let i = 0; i < max; i++) {
    if (done(s)) return s;
    const pid = waitingOn(s)!;
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (s.pending?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, s.pending.count) });
    else if (s.pending) for (const a of botActions(s, s.pending.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error("never done");
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const leftOf = (s: GameState, pid: PlayerId, n = 1) => s.turnOrder[(s.turnOrder.indexOf(pid) + n) % s.turnOrder.length]!;
/** A fresh copy of `def` in `pid`'s hand. */
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};

/**
 * `ap` attacks `opp` with its two attackers; `opp` blocks the first with its first blocker and the second with its second.
 * `ap`'s priority in the declare blockers step, with `board` (ap's) on the battlefield.
 */
const combat = (attackers: CardDef[], blockers: CardDef[], board: CardDef[] = [], blocks?: [number, number][]) => {
  const { s: s0, ap } = setup([]);
  const opp = leftOf(s0, ap);
  const at = attackers.map((d) => putOnBattlefield(s0, ap, d));
  const bl = blockers.map((d) => putOnBattlefield(s0, opp, d));
  const mine = board.map((d) => putOnBattlefield(s0, ap, d));
  let s = passUntil(s0, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: at.map((a) => ({ attacker: a, defender: opp })) } as Action);
  s = until(s, (x) => x.pending?.kind === "declareBlockers" && x.pending.player === opp);
  s = act(s, { type: "declareBlockers", player: opp, blocks: (blocks ?? bl.map((_, i) => [i, i] as [number, number])).map(([b, a]) => ({ blocker: bl[b]!, attacker: at[a]! })) } as Action);
  s = until(s, (x) => !x.pending && !x.stack.length && !x.triggerQueue.length && x.step === "declareBlockers" && waitingOn(x) === ap);
  return { s, ap, opp, at, bl, mine };
};

describe("Lane B round B258", () => {
  it("are fully supported", () => {
    supported(sorrowsPath(), generalJarkeld(), wormsOfTheEarth());
    const path = compileCard(sorrowsPath());
    expect(path.activated[0]!.body.effects).toEqual([{ type: "swapBlockers", a: { ref: "target", index: 0 }, b: { ref: "target", index: 1 } }]);
    expect(path.activated[0]!.body.targets[1]).toEqual(expect.objectContaining({ combat: "blocking", controller: "opponent", sameControllerAs: [0], distinctFrom: [0] }));
    expect(path.triggers[0]!.event).toBe("selfBecomesTapped");
    const jarkeld = compileCard(generalJarkeld()).activated[0]!;
    expect(jarkeld.body.effects).toEqual([{ type: "swapBlocked", a: { ref: "target", index: 0 }, b: { ref: "target", index: 1 } }]);
    expect(jarkeld.body.targets.map((t) => t.kind === "object" && t.combat)).toEqual(["blocked", "blocked"]);
    expect(jarkeld.activateIf).toEqual(expect.objectContaining({ kind: "during" }));
    const worms = compileCard(wormsOfTheEarth());
    expect(worms.playersCantPlayLands).toBe(true);
    expect(worms.landsCantEnter).toBe(true);
    expect(worms.triggers[0]!.body.effects).toEqual([expect.objectContaining({ type: "punisher", who: { ref: "eachPlayer" }, mode: "ifAny", options: [expect.objectContaining({ n: 2 }), { damage: 5 }] })]);
  });
});

describe("Sorrow's Path", () => {
  it("swaps two blockers: each removed from combat and blocking what the other blocked; its tap deals 2 damage to you and your creatures", () => {
    const { s: s0, ap, at, bl, mine } = combat([hillGiant(), crawWurm()], [giantBadger(), grizzlyBears()], [sorrowsPath()]);
    const [giant, wurm] = at;
    const [badger, bears] = bl;
    const path = mine[0]!;
    // The Badger's "blocks" trigger made it 4/4 as blocks were declared.
    expect(power(s0, s0.objects[badger!]!)).toBe(4);
    let s = run(s0, planActivate(s0, ap, path, 0, [tgt(badger!), tgt(bears!)]));
    s = settle(s);
    expect(s.objects[badger!]!.blocking).toEqual([wurm]);
    expect(s.objects[bears!]!.blocking).toEqual([giant]);
    expect(s.objects[giant!]!.blockedBy).toEqual([bears]);
    expect(s.objects[wurm!]!.blockedBy).toEqual([badger]);
    // It blocked again, so its "blocks" ability triggered again (rulings).
    expect(power(s, s.objects[badger!]!)).toBe(6);
    expect(s.players[ap]!.life).toBe(38);
    expect(s.objects[giant!]!.damage).toBe(2);
    expect(logged(s, /Sorrow's Path removes Giant Badger and Grizzly Bears from combat/)).toBe(true);
  });

  it("does nothing if one of them couldn't block what the other blocks (flying)", () => {
    const { s: s0, ap, at, bl, mine } = combat([hillGiant(), serraAngel()], [giantBadger(), serraAngel()], [sorrowsPath()]);
    const [giant, angel] = at;
    const [badger, theirAngel] = bl;
    let s = run(s0, planActivate(s0, ap, mine[0]!, 0, [tgt(badger!), tgt(theirAngel!)]));
    s = settle(s);
    expect(s.objects[badger!]!.blocking).toEqual([giant]);
    expect(s.objects[theirAngel!]!.blocking).toEqual([angel]);
    expect(logged(s, /Sorrow's Path does nothing: Giant Badger and Serra Angel can't each block/)).toBe(true);
  });

  it("does nothing if one of them is tapped (rulings: tapped status counts, not costs)", () => {
    const { s: s0, ap, at, bl, mine } = combat([hillGiant(), crawWurm()], [giantBadger(), grizzlyBears()], [sorrowsPath()]);
    s0.objects[bl[1]!]!.tapped = true;
    let s = run(s0, planActivate(s0, ap, mine[0]!, 0, [tgt(bl[0]!), tgt(bl[1]!)]));
    s = settle(s);
    expect(s.objects[bl[0]!]!.blocking).toEqual([at[0]]);
    expect(s.objects[bl[1]!]!.blocking).toEqual([at[1]]);
  });

  it("with what one was blocking gone, that one is removed from combat and blocks nothing (rulings)", () => {
    const { s: s0, ap, at, bl, mine } = combat([hillGiant(), crawWurm()], [giantBadger(), grizzlyBears()], [sorrowsPath()]);
    const [giant, wurm] = at;
    const [badger, bears] = bl;
    // The Wurm leaves the battlefield; the Bears are still a blocking creature, blocking nothing.
    s0.battlefield.splice(s0.battlefield.indexOf(wurm!), 1);
    s0.objects[wurm!]!.zone = "graveyard";
    s0.players[ap]!.graveyard.push(wurm!);
    s0.objects[bears!]!.blocking = [];
    invalidateCharacteristics(s0);
    let s = run(s0, planActivate(s0, ap, mine[0]!, 0, [tgt(badger!), tgt(bears!)]));
    s = settle(s);
    expect(s.objects[badger!]!.blocking).toBeUndefined();
    expect(s.objects[bears!]!.blocking).toEqual([giant]);
    expect(s.objects[giant!]!.blockedBy).toEqual([bears]);
  });

  it("targets only blockers controlled by the same opponent", () => {
    const { s: s0, ap } = setup([]);
    const [opp, opp2] = [leftOf(s0, ap), leftOf(s0, ap, 2)];
    const giant = putOnBattlefield(s0, ap, hillGiant());
    const wurm = putOnBattlefield(s0, ap, crawWurm());
    const path = putOnBattlefield(s0, ap, sorrowsPath());
    const badger = putOnBattlefield(s0, opp, giantBadger());
    const bears = putOnBattlefield(s0, opp2, grizzlyBears());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: giant, defender: opp }, { attacker: wurm, defender: opp2 }] } as Action);
    s = until(s, (x) => x.pending?.kind === "declareBlockers" && x.pending.player === opp);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: badger, attacker: giant }] } as Action);
    s = until(s, (x) => x.pending?.kind === "declareBlockers" && x.pending.player === opp2);
    s = act(s, { type: "declareBlockers", player: opp2, blocks: [{ blocker: bears, attacker: wurm }] } as Action);
    s = until(s, (x) => !x.pending && !x.stack.length && !x.triggerQueue.length && x.step === "declareBlockers" && waitingOn(x) === ap);
    expect(planActivate(s, ap, path, 0, [tgt(badger), tgt(bears)])).toBeNull();
  });

  it("a bot uses it only when the swap wins it a fight", () => {
    // The Wurm's 6 power kills the Badger either way; the Giant (3/3) dies to the 4/4 Badger, but kills the Bears after the swap.
    const { s: s0, ap, mine } = combat([hillGiant(), crawWurm()], [giantBadger(), grizzlyBears()], [sorrowsPath()]);
    expect(botActions(s0, ap).some((a) => a.type === "activateAbility" && a.objectId === mine[0])).toBe(true);
    // A swap that can't be done (the Badger can't block the flying Angel) isn't tried.
    const b = combat([hillGiant(), serraAngel()], [giantBadger(), serraAngel()], [sorrowsPath()]);
    expect(botActions(b.s, b.ap).some((a) => a.type === "activateAbility" && a.objectId === b.mine[0])).toBe(false);
  });
});

describe("General Jarkeld", () => {
  it("swaps the blockers of two blocked attackers, without new blocks triggering (rulings)", () => {
    const { s: s0, ap, at, bl, mine } = combat([hillGiant(), crawWurm()], [giantBadger(), grizzlyBears()], [generalJarkeld()]);
    const [giant, wurm] = at;
    const [badger, bears] = bl;
    let s = run(s0, planActivate(s0, ap, mine[0]!, 0, [tgt(giant!), tgt(wurm!)]));
    s = settle(s);
    expect(s.objects[badger!]!.blocking).toEqual([wurm]);
    expect(s.objects[bears!]!.blocking).toEqual([giant]);
    expect(s.objects[giant!]!.blockedBy).toEqual([bears]);
    expect(s.objects[wurm!]!.blockedBy).toEqual([badger]);
    // The Badger's "blocks" trigger doesn't trigger again.
    expect(power(s, s.objects[badger!]!)).toBe(4);
    expect(s.objects[mine[0]!]!.tapped).toBe(true);
  });

  it("does nothing if an attacker couldn't be blocked by the other's blockers (flying, menace)", () => {
    // Serra Angel can't be blocked by the Bears.
    const a = combat([serraAngel(), hillGiant()], [serraAngel(), grizzlyBears()], [generalJarkeld()]);
    let s = run(a.s, planActivate(a.s, a.ap, a.mine[0]!, 0, [tgt(a.at[0]!), tgt(a.at[1]!)]));
    s = settle(s);
    expect(s.objects[a.at[0]!]!.blockedBy).toEqual([a.bl[0]]);
    expect(s.objects[a.at[1]!]!.blockedBy).toEqual([a.bl[1]]);
    // Boggart Brute (menace) blocked by two; the Giant by one: the Brute can't be blocked by one creature alone.
    const b = combat([boggartBrute(), hillGiant()], [giantBadger(), grizzlyBears(), grizzlyBears()], [generalJarkeld()], [[0, 0], [1, 0], [2, 1]]);
    let t = run(b.s, planActivate(b.s, b.ap, b.mine[0]!, 0, [tgt(b.at[0]!), tgt(b.at[1]!)]));
    t = settle(t);
    expect(t.objects[b.at[0]!]!.blockedBy).toEqual([b.bl[0], b.bl[1]]);
    expect(t.objects[b.at[1]!]!.blockedBy).toEqual([b.bl[2]]);
    expect(logged(t, /General Jarkeld does nothing/)).toBe(true);
  });

  it("a bot swaps the blockers when the fights come out better for it", () => {
    const { s, ap, mine } = combat([hillGiant(), crawWurm()], [giantBadger(), grizzlyBears()], [generalJarkeld()]);
    expect(botActions(s, ap).some((a) => a.type === "activateAbility" && a.objectId === mine[0])).toBe(true);
  });

  it("can be activated only during the declare blockers step", () => {
    const { s, ap } = setup([]);
    const jarkeld = putOnBattlefield(s, ap, generalJarkeld());
    expect(planActivate(s, ap, jarkeld, 0, [])).toBeNull();
  });
});

describe("Worms of the Earth", () => {
  const worms = () => {
    const { s, ap, opp } = setup([]);
    const w = putOnBattlefield(s, ap, wormsOfTheEarth());
    return { s, ap, opp, w };
  };

  it("players can't play lands", () => {
    const { s, ap } = worms();
    const forest = s.players[ap]!.library.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest")!;
    s.players[ap]!.library.splice(s.players[ap]!.library.indexOf(forest), 1);
    s.objects[forest]!.zone = "hand";
    s.players[ap]!.hand.push(forest);
    expect(() => applyAction(s, { type: "playLand", player: ap, objectId: forest })).toThrow();
  });

  it("a land put onto the battlefield by an effect stays in the library (rulings)", () => {
    const { s: s0, ap } = worms();
    const growth = inHand(s0, ap, rampantGrowth());
    const lands = s0.battlefield.length;
    let s = run(s0, planCast(s0, ap, growth, []));
    s = settle(s);
    if (s.pending?.kind === "searchLibrary") {
      const forest = s.pending.cards.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest")!;
      s = act(s, { type: "searchLibrary", player: ap, found: [forest] } as Action);
      s = settle(s);
      expect(zone(s, forest)).toBe("library");
    }
    expect(s.battlefield.length).toBe(lands);
    expect(logged(s, /can't enter the battlefield \(Worms of the Earth\)/)).toBe(true);
    expect(zone(s, growth)).toBe("graveyard");
  });

  it("a land token isn't created (CR 111.5)", () => {
    const { s: s0, ap } = worms();
    const awaken = inHand(s0, ap, awakenTheWoods());
    const before = Object.keys(s0.objects).length;
    let s = run(s0, planCast(s0, ap, awaken, [], undefined, "auto", 2));
    s = settle(s);
    expect(s.battlefield.some((id) => s.objects[id]!.isToken)).toBe(false);
    expect(Object.values(s.objects).some((o) => o.isToken)).toBe(false);
    expect(Object.keys(s.objects).length).toBe(before);
    expect(logged(s, /The Forest Dryad token isn't created/)).toBe(true);
  });

  it("a creature spell that would enter as a land is put into its owner's graveyard (CR 608.3e; Ashaya's rulings)", () => {
    const { s: s0, ap } = worms();
    putOnBattlefield(s0, ap, ashaya());
    const bears = inHand(s0, ap, grizzlyBears());
    let s = run(s0, planCast(s0, ap, bears, []));
    s = settle(s);
    expect(zone(s, bears)).toBe("graveyard");
    expect(logged(s, /Grizzly Bears can't enter the battlefield \(Worms of the Earth\), so it's put into/)).toBe(true);
  });

  it("Clone isn't offered a land to copy (it couldn't enter as one)", () => {
    const { s: s0, ap } = worms();
    const arbor = putOnBattlefield(s0, ap, dryadArbor());
    const giant = putOnBattlefield(s0, ap, hillGiant());
    const c = inHand(s0, ap, clone());
    let s = run(s0, planCast(s0, ap, c, []));
    s = settle(s);
    const p = s.pending;
    expect(p?.kind).toBe("chooseOption");
    if (p?.kind === "chooseOption") {
      expect(p.options).toContain(giant);
      expect(p.options).not.toContain(arbor);
    }
  });

  it("each upkeep, each player in turn order may sacrifice two lands or take 5 damage; if anyone does, it's destroyed", () => {
    const { s: s0, ap, w } = worms();
    let s = until(s0, (x) => x.step === "upkeep" && x.activePlayer !== ap && (x.stack.length > 0 || !!x.pending));
    const next = s.activePlayer;
    s = settle(s);
    // The active player is asked first; they have no lands, so only the damage.
    expect(s.pending).toEqual(expect.objectContaining({ kind: "chooseOption", player: next, what: "punisher" }));
    if (s.pending?.kind !== "chooseOption") throw new Error("no question");
    expect(s.pending.options).toEqual(["1", "none"]);
    s = act(s, { type: "chooseOption", player: next, choice: "none" } as Action);
    // Then the next players in turn order; `ap` (with lands) may sacrifice two of them.
    for (let i = 0; i < 4 && s.pending?.kind === "chooseOption" && s.pending.player !== ap; i++) s = act(s, { type: "chooseOption", player: s.pending.player, choice: "none" } as Action);
    expect(s.pending).toEqual(expect.objectContaining({ kind: "chooseOption", player: ap }));
    if (s.pending?.kind !== "chooseOption") throw new Error("no question");
    expect(s.pending.options).toEqual(["0", "1", "none"]);
    const lands = s.battlefield.filter((id) => s.objects[id]!.controller === ap && characteristics(s, s.objects[id]!).types.includes("Land")).length;
    s = act(s, { type: "chooseOption", player: ap, choice: "0" } as Action);
    if (s.pending?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: ap, ids: s.pending.options.slice(0, 2) } as Action);
    s = settle(s);
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && characteristics(s, s.objects[id]!).types.includes("Land")).length).toBe(lands - 2);
    expect(zone(s, w)).toBe("graveyard");
  });

  it("with no one choosing either, it stays; the damage counts even if prevented (Vexing Devil's rulings)", () => {
    const { s: s0, ap, w } = worms();
    let s = until(s0, (x) => x.step === "upkeep" && x.activePlayer !== ap && (x.stack.length > 0 || !!x.pending));
    s = settle(s);
    for (let i = 0; i < 4 && s.pending?.kind === "chooseOption"; i++) s = act(s, { type: "chooseOption", player: s.pending.player, choice: "none" } as Action);
    s = settle(s);
    expect(zone(s, w)).toBe("battlefield");
    // Next upkeep: the active player takes the 5 damage.
    s = until(s, (x) => x.step === "upkeep" && x.activePlayer !== s.activePlayer && (x.stack.length > 0 || !!x.pending));
    const who = s.activePlayer;
    s = settle(s);
    if (s.pending?.kind !== "chooseOption" || s.pending.player !== who) throw new Error("no question");
    s = act(s, { type: "chooseOption", player: who, choice: "1" } as Action);
    for (let i = 0; i < 4 && s.pending?.kind === "chooseOption"; i++) s = act(s, { type: "chooseOption", player: s.pending.player, choice: "none" } as Action);
    s = settle(s);
    expect(s.players[who]!.life).toBe(35);
    expect(zone(s, w)).toBe("graveyard");
  });
});
