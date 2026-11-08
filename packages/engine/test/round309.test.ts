// Round 309 (Lane A, skip-list cards): Wall of Stolen Identity (a clone whose "When you do" taps the copied creature and
// keeps it tapped while you control the Wall), Activated Sleeper (a copy of a creature card put into a graveyard from the
// battlefield this turn), Valentin, Dean of the Vein (an exile-instead-of-dying replacement whose reflexive trigger pays
// {2}), Thieving Amalgam (you manifest the top card of each opponent's library on their upkeep), Split Decision (a vote to
// counter or copy the target spell), Cybership (the top two cards of a library onto the battlefield face down as 2/2
// Cyberman artifact creatures), God-Pharaoh's Gift (a 4/4 black Zombie token copy of a card exiled from your graveyard),
// Deepfathom Echo (explores, then may become a copy of another creature you control until end of turn).

import { describe, expect, it } from "vitest";
import { act, addEffect, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { endWhileTapped, moveObject } from "../src/game";
import { applyAction, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
    if (p && p.player !== me) s = act(s, botActions(s, p.player)[0]!);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const leftOf = (s: GameState, pid: PlayerId, n = 1) => s.turnOrder[(s.turnOrder.indexOf(pid) + n) % s.turnOrder.length]!;
const ctl = (s: GameState, id: string) => controllerOf(s, s.objects[id]!);
const ch = (s: GameState, id: string) => characteristics(s, s.objects[id]!);
const t = (id: string): TargetChoice => ({ kind: "object", id });

// Real oracle text (Scryfall).
const wall = (): CardDef => ({"oracleId":"92c58354-e106-402f-8348-6c7cdb67c6df","name":"Wall of Stolen Identity","manaCost":"{3}{U}","cmc":4,"typeLine":"Creature — Shapeshifter Wall","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter","Wall"],"oracleText":"You may have this creature enter as a copy of any creature on the battlefield, except it's a Wall in addition to its other types and has defender. When you do, tap the copied creature and it doesn't untap during its controller's untap step for as long as you control this creature.","power":"0","toughness":"0","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/5/359cc32c-ba90-43e0-b584-09efd321a672.jpg?1783932811","artUrl":"https://cards.scryfall.io/art_crop/front/3/5/359cc32c-ba90-43e0-b584-09efd321a672.jpg?1783932811","layout":"normal"});
const sleeper = (): CardDef => ({"oracleId":"e12da2a1-e390-4487-b154-69e439cb7b05","name":"Activated Sleeper","manaCost":"{2}{B}","cmc":3,"typeLine":"Creature — Phyrexian Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Phyrexian","Shapeshifter"],"oracleText":"Flash\nYou may have this creature enter as a copy of any creature card in a graveyard that was put there from the battlefield this turn, except it's a Phyrexian in addition to its other types.","power":"0","toughness":"0","colors":["B"],"colorIdentity":["B"],"keywords":["Flash"],"imageUrl":"https://cards.scryfall.io/normal/front/3/4/343d01cf-9806-4c2d-a993-ddc9ed248d7f.jpg?1783921470","artUrl":"https://cards.scryfall.io/art_crop/front/3/4/343d01cf-9806-4c2d-a993-ddc9ed248d7f.jpg?1783921470","layout":"normal"});
const valentin = (): CardDef => ({"oracleId":"6e1aa07a-5d9b-4daf-8dc4-c1717360855f","name":"Valentin, Dean of the Vein // Lisette, Dean of the Root","manaCost":"{B}","cmc":1,"typeLine":"Legendary Creature — Vampire Warlock // Legendary Creature — Human Druid","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Vampire","Warlock"],"oracleText":"Menace, lifelink\nIf a nontoken creature an opponent controls would die, exile it instead. When you do, you may pay {2}. If you do, create a 1/1 black and green Pest creature token with \"When this token dies, you gain 1 life.\"","power":"1","toughness":"1","colors":["B"],"colorIdentity":["B","G"],"keywords":["Lifelink","Menace"],"imageUrl":"https://cards.scryfall.io/normal/front/6/5/65008352-bc7e-40b2-a832-b46813e5dc4c.jpg?1783927330","artUrl":"https://cards.scryfall.io/art_crop/front/6/5/65008352-bc7e-40b2-a832-b46813e5dc4c.jpg?1783927330","layout":"modal_dfc","faces":[{"name":"Valentin, Dean of the Vein","manaCost":"{B}","typeLine":"Legendary Creature — Vampire Warlock","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Vampire","Warlock"],"oracleText":"Menace, lifelink\nIf a nontoken creature an opponent controls would die, exile it instead. When you do, you may pay {2}. If you do, create a 1/1 black and green Pest creature token with \"When this token dies, you gain 1 life.\"","power":"1","toughness":"1","colors":["B"],"imageUrl":"https://cards.scryfall.io/normal/front/6/5/65008352-bc7e-40b2-a832-b46813e5dc4c.jpg?1783927330","artUrl":"https://cards.scryfall.io/art_crop/front/6/5/65008352-bc7e-40b2-a832-b46813e5dc4c.jpg?1783927330"},{"name":"Lisette, Dean of the Root","manaCost":"{2}{G}{G}","typeLine":"Legendary Creature — Human Druid","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Druid"],"oracleText":"Whenever you gain life, you may pay {1}. If you do, put a +1/+1 counter on each creature you control and those creatures gain trample until end of turn.","power":"4","toughness":"4","colors":["G"],"imageUrl":"https://cards.scryfall.io/normal/back/6/5/65008352-bc7e-40b2-a832-b46813e5dc4c.jpg?1783927330","artUrl":"https://cards.scryfall.io/art_crop/back/6/5/65008352-bc7e-40b2-a832-b46813e5dc4c.jpg?1783927330"}]});
const amalgam = (): CardDef => ({"oracleId":"f60cd1d8-eeb6-41a3-af32-3e2a54937ca2","name":"Thieving Amalgam","manaCost":"{5}{B}{B}","cmc":7,"typeLine":"Creature — Ape Snake","supertypes":[],"types":["Creature"],"subtypes":["Ape","Snake"],"oracleText":"At the beginning of each opponent's upkeep, you manifest the top card of that player's library. (Put it onto the battlefield face down as a 2/2 creature. Turn it face up any time for its mana cost if it's a creature card.)\nWhenever a creature you control but don't own dies, its owner loses 2 life and you gain 2 life.","power":"6","toughness":"7","colors":["B"],"colorIdentity":["B"],"keywords":["Manifest"],"imageUrl":"https://cards.scryfall.io/normal/front/0/6/06ed7c94-ed3c-427a-b62a-32e91e054671.jpg?1783932807","artUrl":"https://cards.scryfall.io/art_crop/front/0/6/06ed7c94-ed3c-427a-b62a-32e91e054671.jpg?1783932807","layout":"normal"});
const split = (): CardDef => ({"oracleId":"5f725d51-e133-488c-9ca9-1c7b0523b5bd","name":"Split Decision","manaCost":"{1}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Will of the council — Choose target instant or sorcery spell. Starting with you, each player votes for denial or duplication. If denial gets more votes, counter the spell. If duplication gets more votes or the vote is tied, copy the spell. You may choose new targets for the copy.","colors":["U"],"colorIdentity":["U"],"keywords":["Will of the council"],"imageUrl":"https://cards.scryfall.io/normal/front/8/3/83ed7ebe-48be-4e6e-a293-b81484f85142.jpg?1783939376","artUrl":"https://cards.scryfall.io/art_crop/front/8/3/83ed7ebe-48be-4e6e-a293-b81484f85142.jpg?1783939376","layout":"normal"});
const cybership = (): CardDef => ({"oracleId":"9c6ac895-0644-47ea-8a40-8f35cbbeba42","name":"Cybership","manaCost":"{6}","cmc":6,"typeLine":"Artifact — Vehicle","supertypes":[],"types":["Artifact"],"subtypes":["Vehicle"],"oracleText":"Flying\nWhenever this Vehicle deals combat damage to a player, put the top two cards of that player's library onto the battlefield face down under your control. They're 2/2 Cyberman artifact creatures.\nCrew 4","power":"8","toughness":"8","colors":[],"colorIdentity":[],"keywords":["Flying","Crew"],"imageUrl":"https://cards.scryfall.io/normal/front/7/1/71c6fe5d-3964-440a-93ee-0e193263a5b6.jpg?1783914522","artUrl":"https://cards.scryfall.io/art_crop/front/7/1/71c6fe5d-3964-440a-93ee-0e193263a5b6.jpg?1783914522","layout":"normal"});
const deepfathom = (): CardDef => ({"oracleId":"0c0d6c7e-a7cc-49e0-bf84-3fc33dd10b90","name":"Deepfathom Echo","manaCost":"{2}{G}{U}","cmc":4,"typeLine":"Creature — Merfolk Spirit","supertypes":[],"types":["Creature"],"subtypes":["Merfolk","Spirit"],"oracleText":"At the beginning of combat on your turn, this creature explores. Then you may have it become a copy of another creature you control until end of turn. (To have this creature explore, reveal the top card of your library. Put that card into your hand if it's a land. Otherwise, put a +1/+1 counter on this creature, then put the card back or put it into your graveyard.)","power":"4","toughness":"4","colors":["G","U"],"colorIdentity":["G","U"],"keywords":["Explore"],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7c7fb87-8448-49f4-a9ed-db97f6a41d98.jpg?1783913734","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7c7fb87-8448-49f4-a9ed-db97f6a41d98.jpg?1783913734","layout":"normal"});
const gift = (): CardDef => ({"oracleId":"9f2d2fda-f098-4375-8fe9-63f929e3928c","name":"God-Pharaoh's Gift","manaCost":"{7}","cmc":7,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"At the beginning of combat on your turn, you may exile a creature card from your graveyard. If you do, create a token that's a copy of that card, except it's a 4/4 black Zombie. It gains haste until end of turn.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/2/b2e85a9e-4c37-4721-b7ea-de3413ec39df.jpg?1783936002","artUrl":"https://cards.scryfall.io/art_crop/front/b/2/b2e85a9e-4c37-4721-b7ea-de3413ec39df.jpg?1783936002","layout":"normal"});

const shock = () => card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to target creature." });
const doom = () => card("Test Doom", "Sorcery", "{B}", { oracleText: "Destroy target creature." });

describe("round 309", () => {
  it("every card of the round compiles fully", () => supported(wall(), sleeper(), valentin(), amalgam(), split(), cybership(), gift(), deepfathom()));
});

describe("round 309: Wall of Stolen Identity", () => {
  it("enters as a copy that's also a Wall with defender, then taps the copied creature, which stays tapped while you control the Wall", () => {
    const { s: s0, ap, ids } = setup([wall()]);
    const opp = leftOf(s0, ap);
    const big = putOnBattlefield(s0, opp, bear({ name: "Test Big Bear", power: "5", toughness: "5" }));
    let s = run(s0, planCast(s0, ap, ids[0]!, [], undefined, "auto"));
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseOption"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind === "chooseOption" && s.pending.options).toContain(big);
    s = act(s, { type: "chooseOption", player: ap, choice: big });
    const c = ch(s, ids[0]!);
    expect(c.name).toBe("Test Big Bear");
    expect(c.subtypes).toEqual(expect.arrayContaining(["Bear", "Wall"]));
    expect(c.keywords).toContain("Defender");
    // The reflexive trigger: players may act before it taps the creature (rulings).
    expect(s.objects[big]!.tapped).toBe(false);
    s = settle(s, ap);
    expect(s.objects[big]!.tapped).toBe(true);
    // It doesn't untap during its controller's untap step.
    s = passUntil(s, "main1", opp);
    expect(s.objects[big]!.tapped).toBe(true);
  });

  it("the lock ends for good once another player gains control of the Wall", () => {
    const { s: s0, ap, ids } = setup([wall()]);
    const opp = leftOf(s0, ap);
    const big = putOnBattlefield(s0, opp, bear({ name: "Test Big Bear", power: "5", toughness: "5" }));
    let s = run(s0, planCast(s0, ap, ids[0]!, [], undefined, "auto"));
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseOption"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "chooseOption", player: ap, choice: big });
    s = settle(s, ap);
    expect(s.objects[big]!.tapped).toBe(true);
    // Another player gains control of the Wall, then it comes back: the effect has ended (rulings).
    const gain = addEffect(s, opp, [ids[0]!], [{ kind: "control", player: opp } as never], "game");
    expect(ctl(s, ids[0]!)).toBe(opp);
    endWhileTapped(s);
    s.effects = s.effects.filter((e) => e !== gain);
    invalidateCharacteristics(s);
    expect(ctl(s, ids[0]!)).toBe(ap);
    s = passUntil(s, "main1", opp);
    expect(s.objects[big]!.tapped).toBe(false);
  });

  it("entering as nothing taps nothing", () => {
    const { s: s0, ap, ids } = setup([wall()]);
    const opp = leftOf(s0, ap);
    const big = putOnBattlefield(s0, opp, bear({ name: "Test Big Bear", power: "5", toughness: "5" }));
    let s = run(s0, planCast(s0, ap, ids[0]!, [], undefined, "auto"));
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseOption"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "chooseOption", player: ap, choice: "none" });
    s = settle(s, ap);
    expect(s.objects[big]!.tapped).toBe(false);
    expect(ch(s, ids[0]!).name).toBe("Wall of Stolen Identity");
  });
});

describe("round 309: Activated Sleeper", () => {
  it("copies only a creature card put into a graveyard from the battlefield this turn, and is a Phyrexian too", () => {
    const { s: s0, ap, ids } = setup([sleeper(), doom()]);
    const opp = leftOf(s0, ap);
    const victim = putOnBattlefield(s0, opp, bear({ name: "Test Victim", power: "4", toughness: "3" }));
    // A creature card discarded this turn wasn't put there from the battlefield.
    const discarded = putOnBattlefield(s0, opp, bear({ name: "Test Discarded" }));
    moveObject(s0, discarded, "hand");
    moveObject(s0, discarded, "graveyard");
    let s = run(s0, planCast(s0, ap, ids[1]!, [t(victim)], undefined, "auto"));
    s = settle(s, ap);
    expect(s.objects[victim]!.zone).toBe("graveyard");
    s = run(s, planCast(s, ap, ids[0]!, [], undefined, "auto"));
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseOption"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const opts = s.pending?.kind === "chooseOption" ? s.pending.options : [];
    expect(opts).toContain(victim);
    expect(opts).not.toContain(discarded);
    s = act(s, { type: "chooseOption", player: ap, choice: victim });
    const c = ch(s, ids[0]!);
    expect(c.name).toBe("Test Victim");
    expect([c.power, c.toughness]).toEqual([4, 3]);
    expect(c.subtypes).toEqual(expect.arrayContaining(["Bear", "Phyrexian"]));
  });

  it("offers no copy for a creature that died on an earlier turn", () => {
    const { s: s0, ap, ids } = setup([sleeper()]);
    const opp = leftOf(s0, ap);
    const old = putOnBattlefield(s0, opp, bear({ name: "Test Old" }));
    moveObject(s0, old, "graveyard");
    s0.objects[old]!.fromBattlefieldTurn = s0.turn - 1;
    let s = run(s0, planCast(s0, ap, ids[0]!, [], undefined, "auto"));
    s = settle(s, ap);
    // No choice: it enters as itself, a 0/0, and dies.
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });
});

describe("round 309: Valentin, Dean of the Vein", () => {
  it("an opponent's nontoken creature that would die is exiled instead, and you may pay {2} for a Pest", () => {
    const { s: s0, ap, ids } = setup([doom()]);
    const opp = leftOf(s0, ap);
    putOnBattlefield(s0, ap, valentin());
    const victim = putOnBattlefield(s0, opp, bear({ name: "Test Victim" }));
    let s = run(s0, planCast(s0, ap, ids[0]!, [t(victim)], undefined, "auto"));
    s = settle(s, ap);
    expect(s.objects[victim]!.zone).toBe("exile");
    // The reflexive trigger: "you may pay {2}".
    expect(s.pending?.kind).toBe("chooseMay");
    s.players[ap]!.manaPool.C = 2;
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = settle(s, ap);
    const pests = s.battlefield.filter((id) => ch(s, id).name === "Pest Token" && ctl(s, id) === ap);
    expect(pests).toHaveLength(1);
  });

  it("doesn't touch your own creatures or opponents' tokens", () => {
    const { s: s0, ap, ids } = setup([doom(), card("Test Doom Two", "Sorcery", "{B}", { oracleText: "Destroy target creature." })]);
    const opp = leftOf(s0, ap);
    putOnBattlefield(s0, ap, valentin());
    const mine = putOnBattlefield(s0, ap, bear({ name: "Test Mine" }));
    let s = run(s0, planCast(s0, ap, ids[0]!, [t(mine)], undefined, "auto"));
    s = settle(s, ap);
    expect(s.objects[mine]!.zone).toBe("graveyard");
    const tok = putOnBattlefield(s, opp, bear({ name: "Test Token Bear" }));
    s.objects[tok]!.isToken = true;
    s = run(s, planCast(s, ap, ids[1]!, [t(tok)], undefined, "auto"));
    s = settle(s, ap);
    expect(s.objects[tok]?.zone ?? "gone").not.toBe("exile");
    expect(s.pending).toBeFalsy();
  });
});

describe("round 309: Thieving Amalgam", () => {
  it("manifests the top card of the upkeep player's library under your control; its owner loses 2 when it dies", () => {
    const { s: s0, ap } = setup([]);
    const opp = leftOf(s0, ap);
    putOnBattlefield(s0, ap, amalgam());
    const top = s0.players[opp]!.library[0]!;
    let s = passUntil(s0, "upkeep", opp);
    s = settle(s, ap);
    expect(s.objects[top]!.zone).toBe("battlefield");
    expect(s.objects[top]!.faceDown).toBe("manifest");
    expect(s.objects[top]!.owner).toBe(opp);
    expect(ctl(s, top)).toBe(ap);
    expect(ch(s, top).power).toBe(2);
    const [mine, theirs] = [s.players[ap]!.life, s.players[opp]!.life];
    moveObject(s, top, "graveyard");
    s = settle(s, ap);
    expect(s.players[opp]!.life).toBe(theirs - 2);
    expect(s.players[ap]!.life).toBe(mine + 2);
  });

  it("doesn't trigger on your own upkeep", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, amalgam());
    const top = s0.players[ap]!.library[0]!;
    let s = passUntil(s0, "upkeep", ap);
    s = settle(s, ap);
    expect(s.objects[top]!.zone).toBe("library");
  });
});

describe("round 309: Split Decision", () => {
  const voteAll = (s: GameState, choice: (p: PlayerId) => string) => {
    for (let i = 0; i < 300 && (s.stack.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "chooseOption" && p.what === "vote") s = act(s, { type: "chooseOption", player: p.player, choice: choice(p.player) });
      else if (p) s = act(s, botActions(s, p.player)[0]!);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    return s;
  };
  const start = () => {
    const { s: s0, ap, ids } = setup([shock(), split()]);
    const opp = leftOf(s0, ap);
    const bb = putOnBattlefield(s0, opp, bear({ name: "Test Big", power: "3", toughness: "3" }));
    const other = putOnBattlefield(s0, opp, bear({ name: "Test Other", power: "3", toughness: "3" }));
    let s = run(s0, planCast(s0, ap, ids[0]!, [t(bb)], undefined, "auto"));
    const spell = s.stack[s.stack.length - 1]!.id;
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: spell }], undefined, "auto"));
    return { s, ap, bb, other };
  };

  it("counters the target spell when denial gets more votes", () => {
    const { s: s0, bb } = start();
    const s = voteAll(s0, () => "denial");
    expect(s.objects[bb]!.damage ?? 0).toBe(0);
  });

  it("copies it when duplication gets more votes or the vote is tied", () => {
    const { s: s0, ap, bb, other } = start();
    const s = voteAll(s0, (p) => (p === ap || p === leftOf(s0, ap) ? "duplication" : "denial"));
    // 2 votes to 2, a tie: the spell is copied, and its controller chose a new target for the copy.
    expect(s.log.some((l) => /copies Test Shock/.test(typeof l === "string" ? l : (l as { text: string }).text))).toBe(true);
    expect(s.objects[bb]!.damage).toBe(2);
    expect(s.objects[other]!.damage).toBe(2);
  });
});

describe("round 309: Cybership", () => {
  it("combat damage to a player puts the top two cards of their library onto the battlefield face down under your control as 2/2 Cyberman artifact creatures", () => {
    const { s: s0, ap } = setup([]);
    const opp = leftOf(s0, ap);
    const ship = putOnBattlefield(s0, ap, cybership());
    // Crewed: an artifact creature.
    addEffect(s0, ap, [ship], [{ kind: "addTypes", types: ["Creature"], subtypes: [] } as never], "endOfTurn");
    const [top1, top2, third] = s0.players[opp]!.library.slice(0, 3);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: ship, defender: opp }] } as Action);
    s = settle(s, ap);
    for (let i = 0; i < 40 && s.objects[top1!]!.zone === "library"; i++) {
      s = s.pending ? act(s, botActions(s, s.pending.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    for (const id of [top1!, top2!]) {
      const o = s.objects[id]!;
      expect(o.zone).toBe("battlefield");
      expect(o.faceDown).toBe("cyberman");
      expect(o.owner).toBe(opp);
      expect(ctl(s, id)).toBe(ap);
      const c = ch(s, id);
      expect([c.power, c.toughness]).toEqual([2, 2]);
      expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(c.subtypes).toEqual(["Cyberman"]);
      expect(c.colors).toEqual([]);
    }
    expect(s.objects[third!]!.zone).toBe("library");
  });
});

describe("round 309: God-Pharaoh's Gift", () => {
  it("at the beginning of combat, exiles a creature card from your graveyard for a 4/4 black Zombie copy with haste", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, gift());
    const dead = putOnBattlefield(s0, ap, card("Test Flier", "Creature — Bird Soldier", "{2}{W}", { oracleText: "Flying", power: "1", toughness: "1", keywords: ["Flying"], colors: ["W"] }));
    moveObject(s0, dead, "graveyard");
    let s = passUntil(s0, "beginCombat", ap);
    s = settle(s, ap);
    for (let i = 0; i < 20 && s.pending?.player === ap; i++) {
      const p = s.pending!;
      if (p.kind === "chooseOption" && p.options.includes("yes")) s = act(s, { type: "chooseOption", player: ap, choice: "yes" });
      else s = act(s, botActions(s, ap)[0]!);
      s = settle(s, ap);
    }
    expect(s.objects[dead]!.zone).toBe("exile");
    const tok = s.battlefield.find((id) => s.objects[id]!.isToken && ch(s, id).name === "Test Flier")!;
    expect(tok).toBeTruthy();
    const c = ch(s, tok);
    expect([c.power, c.toughness]).toEqual([4, 4]);
    expect(c.colors).toEqual(["B"]);
    expect(c.subtypes).toEqual(["Zombie"]);
    expect(c.types).toContain("Creature");
    expect(c.keywords).toEqual(expect.arrayContaining(["Flying", "Haste"]));
  });
});

describe("round 309: Deepfathom Echo", () => {
  it("explores at the beginning of combat, then may become a copy of another creature you control until end of turn", () => {
    const { s: s0, ap } = setup([]);
    const echo = putOnBattlefield(s0, ap, deepfathom());
    const big = putOnBattlefield(s0, ap, bear({ name: "Test Big Bear", power: "5", toughness: "5" }));
    const theirs = putOnBattlefield(s0, leftOf(s0, ap), bear({ name: "Test Their Bear", power: "7", toughness: "7" }));
    // A nonland card on top: a +1/+1 counter.
    const topId = s0.players[ap]!.library.find((id) => s0.cards[s0.objects[id]!.cardId]!.typeLine.includes("Creature"))!;
    s0.players[ap]!.library = [topId, ...s0.players[ap]!.library.filter((id) => id !== topId)];
    let s = passUntil(s0, "beginCombat", ap);
    for (let i = 0; i < 40 && s.pending?.kind !== "pickPermanents"; i++) s = s.pending ? act(s, botActions(s, s.pending.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[echo]!.counters["+1/+1"]).toBe(1);
    const p = s.pending!;
    expect(p.kind === "pickPermanents" && p.options).toEqual([big]);
    expect(p.kind === "pickPermanents" && p.options).not.toContain(theirs);
    s = act(s, { type: "pickPermanents", player: ap, ids: [big] });
    s = settle(s, ap);
    const c = ch(s, echo);
    expect(c.name).toBe("Test Big Bear");
    // Its counter still counts (rulings).
    expect([c.power, c.toughness]).toEqual([6, 6]);
    s = passUntil(s, "upkeep", leftOf(s, ap));
    expect(ch(s, echo).name).toBe("Deepfathom Echo");
  });

  it("choosing none leaves it as it is", () => {
    const { s: s0, ap } = setup([]);
    const echo = putOnBattlefield(s0, ap, deepfathom());
    putOnBattlefield(s0, ap, bear({ name: "Test Big Bear", power: "5", toughness: "5" }));
    let s = passUntil(s0, "beginCombat", ap);
    for (let i = 0; i < 40 && s.pending?.kind !== "pickPermanents"; i++) s = s.pending ? act(s, botActions(s, s.pending.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "pickPermanents", player: ap, ids: [] });
    s = settle(s, ap);
    expect(ch(s, echo).name).toBe("Deepfathom Echo");
  });
});
