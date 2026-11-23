// Round 453: Psychic Battle ("Whenever a player chooses one or more targets, each player reveals the top card of their
// library. The player who reveals the card with the greatest mana value may change the target or targets. If two or more
// cards are tied for greatest, the target or targets remain unchanged. Changing targets this way doesn't trigger
// abilities of permanents named Psychic Battle.").

import { describe, expect, it } from "vitest";
import { act, island, putOnBattlefield, setup, target } from "./helpers";
import { applyAction, botActions, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const psychicBattle = (): CardDef => ({"oracleId":"79f0d763-5a71-470a-867f-86fc72e9db6d","name":"Psychic Battle","manaCost":"{3}{U}{U}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a player chooses one or more targets, each player reveals the top card of their library. The player who reveals the card with the greatest mana value may change the target or targets. If two or more cards are tied for greatest, the target or targets remain unchanged. Changing targets this way doesn't trigger abilities of permanents named Psychic Battle.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/7/8758ca24-e613-43bf-be58-4cf557f82d0c.jpg?1783945706","artUrl":"https://cards.scryfall.io/art_crop/front/8/7/8758ca24-e613-43bf-be58-4cf557f82d0c.jpg?1783945706","layout":"normal"});
const redirect = (): CardDef => ({"oracleId":"74a7d880-5a49-412b-af4d-0b4cdb8453ee","name":"Redirect","manaCost":"{U}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"You may choose new targets for target spell.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/0/60bae44b-c6f2-40bf-a427-aee5cfbdfea9.jpg?1783941822","artUrl":"https://cards.scryfall.io/art_crop/front/6/0/60bae44b-c6f2-40bf-a427-aee5cfbdfea9.jpg?1783941822","layout":"normal"});
const twincast = (): CardDef => ({"oracleId":"8f878efc-850f-43d2-a6fe-5ea8d1dd5afb","name":"Twincast","manaCost":"{U}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Copy target instant or sorcery spell. You may choose new targets for the copy.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/a/1a367559-1d84-4f6f-9e6e-ff90de420389.jpg?1783944159","artUrl":"https://cards.scryfall.io/art_crop/front/1/a/1a367559-1d84-4f6f-9e6e-ff90de420389.jpg?1783944159","layout":"normal"});
const fireIce = (): CardDef => ({"oracleId":"ae92942b-919c-4ea9-b693-85fcef765d5a","name":"Fire // Ice","manaCost":"{1}{R} // {1}{U}","cmc":4,"typeLine":"Instant // Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Fire deals 2 damage divided as you choose among one or two targets.","colors":["R","U"],"colorIdentity":["R","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/b/ab8292ae-9a52-43e7-92f7-0f45f4bb71ec.jpg?1783940411","artUrl":"https://cards.scryfall.io/art_crop/front/a/b/ab8292ae-9a52-43e7-92f7-0f45f4bb71ec.jpg?1783940411","layout":"split","faces":[{"name":"Fire","manaCost":"{1}{R}","typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Fire deals 2 damage divided as you choose among one or two targets.","colors":["R"]},{"name":"Ice","manaCost":"{1}{U}","typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Tap target permanent.\nDraw a card.","colors":["U"]}]});
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","layout":"normal"});
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","layout":"normal"});
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","layout":"normal"});
const prodigalSorcerer = (): CardDef => ({"oracleId":"5e961d15-5972-4e4b-9385-1cd7cd7c6bbe","name":"Prodigal Sorcerer","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Human Wizard Sorcerer","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard","Sorcerer"],"oracleText":"{T}: This creature deals 1 damage to any target.","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/0/50aef269-55f9-4d84-8bc5-29e794297f11.jpg?1783937607","artUrl":"https://cards.scryfall.io/art_crop/front/5/0/50aef269-55f9-4d84-8bc5-29e794297f11.jpg?1783937607","layout":"normal"});
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","layout":"normal"});
const arcTrail = (): CardDef => ({"oracleId":"f1c26b25-371e-4fbf-a43d-7fd59a364d3a","name":"Arc Trail","manaCost":"{1}{R}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Arc Trail deals 2 damage to any target and 1 damage to any other target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/4/445e3a0a-29a7-4dc0-80fe-569b9e751db3.jpg?1783941727","artUrl":"https://cards.scryfall.io/art_crop/front/4/4/445e3a0a-29a7-4dc0-80fe-569b9e751db3.jpg?1783941727","layout":"normal"});
const gripOfChaos = (): CardDef => ({"oracleId":"ca2e0c8f-7ece-465f-9103-ba60712eacf7","name":"Grip of Chaos","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a spell or ability is put onto the stack, if it has a single target, reselect its target at random. (Select from among all legal targets.)","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/e/defbbd3a-0e7d-4af2-b25f-9003ddad0bf5.jpg?1783944873","artUrl":"https://cards.scryfall.io/art_crop/front/d/e/defbbd3a-0e7d-4af2-b25f-9003ddad0bf5.jpg?1783944873","layout":"normal"});
const llanowarElves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","layout":"normal"});
const forest = (): CardDef => ({"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","layout":"normal"});



const flametongueKavu = (): CardDef => ({"oracleId":"b215196a-3716-451f-bdbd-d16c05ace5b4","name":"Flametongue Kavu","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Kavu","supertypes":[],"types":["Creature"],"subtypes":["Kavu"],"oracleText":"When this creature enters, it deals 4 damage to target creature.","power":"4","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/5/150047e1-32f8-4aff-b311-0f6d58ce36fe.jpg?1783918328","artUrl":"https://cards.scryfall.io/art_crop/front/1/5/150047e1-32f8-4aff-b311-0f6d58ce36fe.jpg?1783918328","layout":"normal"});


const supported = (...ds: CardDef[]) => ds.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 400 && !s.over && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes until the stack has `n` items left (or a question comes). */
const downTo = (s: GameState, n: number) => {
  for (let i = 0; i < 100 && s.stack.length > n && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const ptgt = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));
const count = (s: GameState, re: RegExp) => s.log.filter((l) => re.test(l.text)).length;
const battles = (s: GameState) => count(s, /Psychic Battle's ability triggers/);
/** A fresh card on top of `pid`'s library. */
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  invalidateCharacteristics(s);
  return id;
};
/** Each player's top card: `winner` gets Hill Giant (4), the others Grizzly Bears (2). */
const tops = (s: GameState, winner: PlayerId) => {
  for (const pid of s.turnOrder) onTop(s, pid, pid === winner ? hillGiant() : grizzlyBears());
};
/** A fresh copy of `def` in `pid`'s hand. */
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = onTop(s, pid, def);
  s.players[pid]!.library.shift();
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};

describe("Psychic Battle", () => {
  it("is supported", () => supported(psychicBattle()));

  it("a spell cast with a target triggers it; the player revealing the greatest mana value may change the target, here an opponent", () => {
    const { s: s0, ap, ids, opp } = setup([shock()]);
    putOnBattlefield(s0, opp, psychicBattle());
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    tops(s0, opp);
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(bears)]));
    // The trigger goes on the stack above the spell (CR 603.3).
    expect(s.stack.map((x) => x.kind)).toEqual(["spell", "ability"]);
    s = downTo(s, 1);
    expect(logged(s, /reveals Hill Giant \(mana value 4\)/)).toBe(true);
    expect(s.pending).toMatchObject({ kind: "newTargets", player: opp, changeAny: true, noRepeat: true });
    // The opponent sends Shock at its caster.
    s = act(s, { type: "newTargets", player: opp, targets: [ptgt(ap)] });
    expect(s.stack[0]!.targets).toMatchObject([{ kind: "player", id: ap }]);
    const life = s.players[ap]!.life;
    s = settle(s);
    expect(s.players[ap]!.life).toBe(life - 2);
    expect(s.objects[bears]!.zone).toBe("battlefield");
    // Changing targets this way doesn't trigger it again.
    expect(battles(s)).toBe(1);
  });

  it("the winner may keep the targets; a tie for greatest leaves them unchanged without asking", () => {
    const { s: s0, ap, ids, opp } = setup([shock(), shock()]);
    putOnBattlefield(s0, opp, psychicBattle());
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    tops(s0, ap);
    let s = downTo(run(s0, planCast(s0, ap, ids[0]!, [target(bears)])), 1);
    expect(s.pending).toMatchObject({ kind: "newTargets", player: ap });
    s = settle(act(s, { type: "newTargets", player: ap }));
    expect(s.objects[bears]!.zone).toBe("graveyard");
    // Two players reveal Hill Giants: tied.
    const elves = putOnBattlefield(s, opp, llanowarElves());
    s.players[ap]!.library.shift();
    s.players[opp]!.library.shift();
    for (const pid of s.turnOrder) onTop(s, pid, pid === ap || pid === opp ? hillGiant() : forest());
    s = downTo(run(s, planCast(s, ap, ids[1]!, [target(elves)])), 1);
    expect(s.pending).toBeNull();
    expect(logged(s, /are tied for the greatest mana value, so the targets stay the same/)).toBe(true);
    s = settle(s);
    expect(s.objects[elves]!.zone).toBe("graveyard");
  });

  it("a player with an empty library reveals nothing; only the cards revealed are compared (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([shock()]);
    putOnBattlefield(s0, ap, psychicBattle());
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    for (const pid of s0.turnOrder) if (pid !== opp) s0.players[pid]!.library = [];
    onTop(s0, opp, forest());
    let s = downTo(run(s0, planCast(s0, ap, ids[0]!, [target(bears)])), 1);
    expect(count(s, /has no card to reveal/)).toBe(3);
    // A Forest (mana value 0) is the greatest card revealed.
    expect(s.pending).toMatchObject({ kind: "newTargets", player: opp });
  });

  it("a split card's mana value is its halves' together (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([shock()]);
    putOnBattlefield(s0, ap, psychicBattle());
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    // Fire // Ice is 4, beating three Prodigal Sorcerers (3); either half alone would lose.
    for (const pid of s0.turnOrder) onTop(s0, pid, pid === opp ? fireIce() : prodigalSorcerer());
    let s = downTo(run(s0, planCast(s0, ap, ids[0]!, [target(bears)])), 1);
    expect(logged(s, /reveals Fire \/\/ Ice \(mana value 4\)/)).toBe(true);
    expect(logged(s, /reveals Prodigal Sorcerer \(mana value 3\)/)).toBe(true);
    expect(s.pending).toMatchObject({ kind: "newTargets", player: opp });
  });

  it("activated and triggered abilities with targets trigger it; a spell without targets doesn't", () => {
    const { s: s0, ap, ids, opp } = setup([divination(), flametongueKavu()]);
    putOnBattlefield(s0, opp, psychicBattle());
    const sorcerer = putOnBattlefield(s0, ap, prodigalSorcerer());
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(battles(s)).toBe(0);
    tops(s, ap);
    s = act(s, { type: "activateAbility", player: ap, objectId: sorcerer, index: 0, targets: [ptgt(opp)] } as Action);
    expect(s.stack.map((x) => x.kind)).toEqual(["ability", "ability"]);
    s = downTo(s, 1);
    expect(s.pending).toMatchObject({ kind: "newTargets", player: ap });
    s = settle(act(s, { type: "newTargets", player: ap }));
    expect(battles(s)).toBe(1);
    // Flametongue Kavu's enter trigger: its target is chosen as it's put on the stack (CR 603.3d).
    s.players[ap]!.library.shift();
    tops(s, ap);
    s = run(s, planCast(s, ap, ids[1]!));
    s = downTo(s, 0);
    for (let i = 0; i < 10 && s.pending?.kind === "chooseTargets"; i++) s = act(s, { type: "chooseTargets", player: ap, targets: [target(bears)] } as Action);
    expect(battles(s)).toBe(2);
  });

  it("a copy whose targets are kept doesn't trigger it; new targets chosen for a copy do (CR 707.10c)", () => {
    const { s: s0, ap, ids, opp } = setup([shock(), twincast(), twincast()]);
    // Two Twincasts need four blue.
    putOnBattlefield(s0, ap, island);
    putOnBattlefield(s0, ap, island);
    putOnBattlefield(s0, opp, psychicBattle());
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    // Ties everywhere: no one changes anything.
    for (const pid of s0.turnOrder) for (let i = 0; i < 6; i++) onTop(s0, pid, forest());
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(bears)]));
    s = downTo(s, 1);
    const shockId = s.stack[0]!.id;
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: shockId }]));
    s = downTo(s, 1);
    expect(battles(s)).toBe(2);
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: ap });
    s = act(s, { type: "copyTargets", player: ap });
    expect(s.stack).toHaveLength(2);
    expect(battles(s)).toBe(2);
    // The second Twincast: the copy aimed at the opponent instead.
    s = run(s, planCast(s, ap, ids[2]!, [{ kind: "stack", id: shockId }]));
    s = downTo(s, 2);
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: ap });
    s = act(s, { type: "copyTargets", player: ap, targets: [ptgt(opp)] });
    expect(s.stack).toHaveLength(4);
    expect(battles(s)).toBe(4);
  });

  it("an effect letting a player choose new targets triggers it (CR 115.7); Grip of Chaos's random reselection doesn't", () => {
    const { s: s0, ap, ids, opp } = setup([shock(), redirect()]);
    putOnBattlefield(s0, opp, psychicBattle());
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    const elves = putOnBattlefield(s0, opp, llanowarElves());
    for (const pid of s0.turnOrder) for (let i = 0; i < 6; i++) onTop(s0, pid, forest());
    let s = downTo(run(s0, planCast(s0, ap, ids[0]!, [target(bears)])), 1);
    const shockId = s.stack[0]!.id;
    s = downTo(run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: shockId }])), 1);
    expect(battles(s)).toBe(2);
    expect(s.pending).toMatchObject({ kind: "newTargets", player: ap });
    s = act(s, { type: "newTargets", player: ap, targets: [target(elves)] });
    expect(battles(s)).toBe(3);
    s = settle(s);
    expect(s.objects[elves]!.zone).toBe("graveyard");
    expect(s.objects[bears]!.zone).toBe("battlefield");

    const g = setup([shock()]);
    putOnBattlefield(g.s, g.opp, psychicBattle());
    putOnBattlefield(g.s, g.opp, gripOfChaos());
    const b2 = putOnBattlefield(g.s, g.opp, grizzlyBears());
    for (const pid of g.s.turnOrder) for (let i = 0; i < 6; i++) onTop(g.s, pid, forest());
    let t = settle(run(g.s, planCast(g.s, g.ap, g.ids[0]!, [target(b2)])));
    expect(logged(t, /Grip of Chaos reselects the target of Shock at random/)).toBe(true);
    expect(battles(t)).toBe(1);
  });

  it("nothing can become targeted more than once (rulings); the bot answers within that", () => {
    const { s: s0, ap, ids, opp } = setup([arcTrail()]);
    putOnBattlefield(s0, ap, psychicBattle());
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    tops(s0, opp);
    let s = downTo(run(s0, planCast(s0, ap, ids[0]!, [target(bears), ptgt(opp)])), 1);
    expect(s.pending).toMatchObject({ kind: "newTargets", player: opp, noRepeat: true });
    expect(() => act(s, { type: "newTargets", player: opp, targets: [ptgt(opp), ptgt(opp)] })).toThrow();
    expect(() => act(s, { type: "newTargets", player: opp, targets: [target(bears), target(bears)] })).toThrow();
    // The bot moves both away from itself and its own, to different things.
    for (const a of botActions(s, opp)) s = act(s, a);
    const t = s.stack[0]!.targets!;
    expect(t.some((x) => (x.kind === "player" && x.id === opp) || (x.kind === "object" && x.id === bears))).toBe(false);
    expect(JSON.stringify(t[0])).not.toBe(JSON.stringify(t[1]));
    s = settle(s);
    expect(s.objects[bears]!.zone).toBe("battlefield");
  });

  it("two Psychic Battles each trigger; the changes they make trigger neither", () => {
    const { s: s0, ap, ids, opp } = setup([shock()]);
    putOnBattlefield(s0, opp, psychicBattle());
    putOnBattlefield(s0, ap, psychicBattle());
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    for (const pid of s0.turnOrder) for (let i = 0; i < 2; i++) onTop(s0, pid, pid === opp ? hillGiant() : forest());
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(bears)]));
    expect(s.stack.filter((x) => x.kind === "ability")).toHaveLength(2);
    s = downTo(s, 2);
    s = act(s, { type: "newTargets", player: opp, targets: [ptgt(ap)] });
    s = downTo(s, 1);
    s = act(s, { type: "newTargets", player: opp, targets: [target(putOnBattlefield(s, ap, llanowarElves()))] });
    s = settle(s);
    expect(battles(s)).toBe(2);
    expect(s.objects[bears]!.zone).toBe("battlefield");
  });
});
