// Round 302 (Lane A, skip-list cards): Grudge Keeper and Model of Unity ("whenever players finish voting"), Sigarda's
// Vanguard (creatures with different powers), Sivitri, Dragon Master (an attack tax paid in life), Cryptic Gateway
// (shares a creature type with each creature tapped), Osgir, the Reconstructor (exile an artifact card with mana value X),
// Archfiend of Spite (loses that much life unless they sacrifice that many permanents), Stick Together (a party), Lich's
// Mastery (exile something for each 1 life lost) and Plasma Caster (target creature blocking equipped creature).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";
import { objHasKeyword } from "../src/cards";
import { moveObject, removeFromCombat } from "../src/game";
import { dealDamage, objectSource } from "../src/damage";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Everyone passes until the stack is empty, answering "you may" with `may`; other players' questions as the bots would. Stops at any other question of `me`'s. */
const settle = (s: GameState, opts: { may?: boolean; targets?: TargetChoice[]; me?: PlayerId } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me !== undefined && p.player !== opts.me) s = act(s, botActions(s, p.player)[0]!);
    else if (p?.kind === "chooseMay" && opts.may !== undefined) s = act(s, { type: "chooseMay", player: p.player, yes: opts.may });
    else if (p?.kind === "chooseTargets" && opts.targets) s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const order = (s: GameState, ap: PlayerId) => [0, 1, 2, 3].map((i) => s.turnOrder[(s.turnOrder.indexOf(ap) + i) % 4]!) as [PlayerId, PlayerId, PlayerId, PlayerId];

const grudge = (): CardDef => ({"oracleId":"ffbf8459-fda2-4c1d-9841-c001c37d2141","name":"Grudge Keeper","manaCost":"{1}{B}","cmc":2,"typeLine":"Creature — Zombie Wizard","supertypes":[],"types":["Creature"],"subtypes":["Zombie","Wizard"],"oracleText":"Whenever players finish voting, each opponent who voted for a choice you didn't vote for loses 2 life.","power":"2","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/f/cf00b8d3-30bb-44b8-8531-4bfd018acc0c.jpg?1783939375","artUrl":"https://cards.scryfall.io/art_crop/front/c/f/cf00b8d3-30bb-44b8-8531-4bfd018acc0c.jpg?1783939375","layout":"normal"});
const unity = (): CardDef => ({"oracleId":"d7b69fd7-e575-4009-8549-f576249ba641","name":"Model of Unity","manaCost":"{3}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"Whenever players finish voting, you and each opponent who voted for a choice you voted for may scry 2.\n{T}: Add one mana of any color.","colors":[],"colorIdentity":[],"keywords":["Scry"],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/0/d/0d804d47-1f7b-47bd-9eac-aa539eda9af7.jpg?1783916009","artUrl":"https://cards.scryfall.io/art_crop/front/0/d/0d804d47-1f7b-47bd-9eac-aa539eda9af7.jpg?1783916009","layout":"normal"});

const council = () => card("Test Council", "Sorcery", "{W}", { cmc: 1, oracleText: "Will of the council — Starting with you, each player votes for death or taxes. If death gets more votes, each opponent loses 1 life. If taxes gets more votes or the vote is tied, draw a card." });
/** Casts the council with every vote ours to make (as with Illusion of Choice), the votes in turn order. */
const vote = (s: GameState, ap: PlayerId, words: string[]) => {
  const c = into(s, ap, council(), "hand");
  s.votesChosenBy = { player: ap, turn: s.turn };
  s = settle(run(s, planCast(s, ap, c)), { me: ap });
  for (const word of words) {
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "vote" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: word }), { me: ap });
  }
  return s;
};

describe("round 302: Grudge Keeper", () => {
  it("is supported", () => supported(grudge()));

  it("each opponent who voted for a choice you didn't vote for loses 2 life", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, grudge());
    const [, o1, o2, o3] = order(s, ap);
    const life = (p: PlayerId) => s.players[p]!.life;
    const before = [o1, o2, o3].map(life);
    s = vote(s, ap, ["death", "death", "taxes", "taxes"]);
    // Tied: the council draws a card; then Grudge Keeper's trigger.
    expect([o1, o2, o3].map(life)).toEqual([before[0], before[1]! - 2, before[2]! - 2]);
    expect(life(ap)).toBe(40);
  });

  it("only this vote counts, and nobody loses life when everyone agrees", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, grudge());
    const [, o1, o2, o3] = order(s, ap);
    const before = [o1, o2, o3].map((p) => s.players[p]!.life);
    s = vote(s, ap, ["taxes", "taxes", "taxes", "taxes"]);
    expect([o1, o2, o3].map((p) => s.players[p]!.life)).toEqual(before);
  });
});

describe("round 302: Model of Unity", () => {
  it("is supported", () => supported(unity()));

  it("you and each opponent who voted with you may scry 2", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, unity());
    const [, o1] = order(s, ap);
    s = vote(s, ap, ["death", "death", "taxes", "taxes"]);
    // You're asked first (turn order), then the opponent who voted death; the other two aren't asked.
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    const asked: PlayerId[] = [];
    for (let i = 0; i < 20 && s.pending && s.pending.player !== ap; i++) {
      if (s.pending.kind === "chooseMay") asked.push(s.pending.player);
      s = act(s, botActions(s, s.pending.player)[0]!);
    }
    expect(asked).toEqual([o1]);
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: ap, how: "scry" });
    expect((s.pending as { cards: string[] }).cards.length).toBe(2);
  });

  it("declining: no scry for you", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, unity());
    s = vote(s, ap, ["taxes", "death", "death", "death"]);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), { me: ap });
    expect(s.pending).toBeFalsy();
  });
});

const vanguard = (): CardDef => ({"oracleId":"147d8a1f-fe82-4078-a281-29a2eed4c750","name":"Sigarda's Vanguard","manaCost":"{4}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flash\nFlying\nWhenever this creature enters or attacks, choose any number of creatures with different powers. Those creatures gain double strike until end of turn.","power":"3","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Flash"],"imageUrl":"https://cards.scryfall.io/normal/front/d/8/d81da23b-b0c1-4e28-ab87-2aaac9b12bb3.jpg?1783925382","artUrl":"https://cards.scryfall.io/art_crop/front/d/8/d81da23b-b0c1-4e28-ab87-2aaac9b12bb3.jpg?1783925382","layout":"normal"});

describe("round 302: Sigarda's Vanguard", () => {
  it("is supported", () => supported(vanguard()));

  /** Vanguard attacks; its trigger asks which creatures gain double strike. */
  const attack = () => {
    const { s: s0, ap, opp } = setup([]);
    const v = putOnBattlefield(s0, ap, vanguard());
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear({ name: "Test Second Bear" }));
    const big = putOnBattlefield(s0, opp, bear({ name: "Test Big Bear", power: "5", toughness: "5" }));
    let s = passUntil(s0, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: v, defender: opp }] } as Action), { me: ap });
    return { s, ap, opp, v, a, b, big };
  };

  it("any creatures with different powers, anyone's, gain double strike", () => {
    let { s, ap, v, a, b, big } = attack();
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "choose", differentPowers: true, min: 0 });
    expect((s.pending as { options: string[] }).options).toEqual(expect.arrayContaining([v, a, b, big]));
    // Two 2-power Bears can't both be chosen.
    expect(() => act(s, { type: "pickPermanents", player: ap, ids: [a, b] })).toThrow(/different powers/);
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [a, v, big] }), { me: ap });
    for (const id of [a, v, big]) expect(objHasKeyword(s, s.objects[id]!, "Double strike"), id).toBe(true);
    expect(objHasKeyword(s, s.objects[b]!, "Double strike")).toBe(false);
  });

  it("choosing none is fine", () => {
    let { s, ap, v } = attack();
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [] }), { me: ap });
    expect(objHasKeyword(s, s.objects[v]!, "Double strike")).toBe(false);
  });

  it("the bot gives double strike to one creature of its own for each power", () => {
    const { s, ap, v, a, b, big } = attack();
    const [pick] = botActions(s, ap) as { ids: string[] }[];
    expect(pick!.ids).toContain(v);
    expect(pick!.ids).not.toContain(big);
    expect(pick!.ids.filter((id) => id === a || id === b).length).toBe(1);
  });
});

const sivitri = (): CardDef => ({"oracleId":"5cf86603-cc47-4644-890a-0997c694817f","name":"Sivitri, Dragon Master","manaCost":"{2}{U}{B}","cmc":4,"typeLine":"Legendary Planeswalker — Sivitri","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Sivitri"],"oracleText":"+1: Until your next turn, creatures can't attack you or planeswalkers you control unless their controller pays 2 life for each of those creatures.\n−3: Search your library for a Dragon card, reveal it, put it into your hand, then shuffle.\n−7: Destroy all non-Dragon creatures.\nSivitri, Dragon Master can be your commander.","loyalty":"4","colors":["B","U"],"colorIdentity":["B","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/5/55cc167d-b701-444b-9eb9-f0ee1bdfa762.jpg?1783921449","artUrl":"https://cards.scryfall.io/art_crop/front/5/5/55cc167d-b701-444b-9eb9-f0ee1bdfa762.jpg?1783921449","layout":"normal"});

describe("round 302: Sivitri, Dragon Master", () => {
  it("is supported", () => supported(sivitri()));

  /** Sivitri's +1, then the next player's turn up to their declare attackers step, with a 3/3 of theirs ready. */
  const taxed = () => {
    const { s: s0, ap } = setup([]);
    const sv = putOnBattlefield(s0, ap, sivitri());
    s0.objects[sv]!.counters.loyalty = 4;
    let s = settle(run(s0, planActivate(s0, ap, sv, 0)), { me: ap });
    expect(s.objects[sv]!.counters.loyalty).toBe(5);
    const next = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    const att = putOnBattlefield(s, next, bear({ name: "Test Attacker", power: "3", toughness: "3" }));
    const att2 = putOnBattlefield(s, next, bear({ name: "Test Second Attacker" }));
    s = passUntil(s, "declareAttackers", next);
    return { s, ap, next, sv, att, att2 };
  };

  it("attacking you costs 2 life for each creature", () => {
    let { s, ap, next, att, att2 } = taxed();
    const life = s.players[next]!.life;
    s = act(s, { type: "declareAttackers", player: next, attacks: [{ attacker: att, defender: ap }, { attacker: att2, defender: ap }] } as Action);
    expect(s.players[next]!.life).toBe(life - 4);
    expect(s.objects[att]!.attacking).toBe(ap);
  });

  it("attacking your planeswalker costs it too, attacking another player doesn't", () => {
    let { s, ap, next, sv, att, att2 } = taxed();
    const other = s.turnOrder.find((p) => p !== ap && p !== next)!;
    const life = s.players[next]!.life;
    s = act(s, { type: "declareAttackers", player: next, attacks: [{ attacker: att, defender: ap, planeswalker: sv }, { attacker: att2, defender: other }] } as Action);
    expect(s.players[next]!.life).toBe(life - 2);
  });

  it("not with less life than it costs", () => {
    const { s, ap, next, att, att2 } = taxed();
    s.players[next]!.life = 3;
    expect(() => act(s, { type: "declareAttackers", player: next, attacks: [{ attacker: att, defender: ap }, { attacker: att2, defender: ap }] } as Action)).toThrow(/costs 4 life/);
  });

  it("lasts until your next turn", () => {
    let { s, ap, next, att } = taxed();
    s = act(s, { type: "declareAttackers", player: next, attacks: [] } as Action);
    s = passUntil(s, "upkeep", ap);
    const after = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    expect(after).toBe(next);
    s = passUntil(s, "declareAttackers", next);
    const life = s.players[next]!.life;
    s = act(s, { type: "declareAttackers", player: next, attacks: [{ attacker: att, defender: ap }] } as Action);
    expect(s.players[next]!.life).toBe(life);
  });

  it("a bot with plenty of life pays; one at 11 attacks someone else", () => {
    const { s, ap, next } = taxed();
    for (const p of s.turnOrder) if (p !== ap && p !== next) s.players[p]!.life = 50;
    s.players[ap]!.life = 1;
    const declare = (x: GameState) => botActions(x, next).find((a) => a.type === "declareAttackers") as { attacks: { defender: PlayerId }[] } | undefined;
    expect(declare(s)!.attacks.some((a) => a.defender === ap)).toBe(true);
    s.players[next]!.life = 11;
    expect(declare(s)!.attacks.every((a) => a.defender !== ap)).toBe(true);
  });
});

const gateway = (): CardDef => ({"oracleId":"abdc1c92-1434-47d3-abaa-debe047903b9","name":"Cryptic Gateway","manaCost":"{5}","cmc":5,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"Tap two untapped creatures you control: You may put a creature card from your hand that shares a creature type with each creature tapped this way onto the battlefield.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/f/7f379966-6a0a-434c-8682-1cf528a9a4a1.jpg?1783945032","artUrl":"https://cards.scryfall.io/art_crop/front/7/f/7f379966-6a0a-434c-8682-1cf528a9a4a1.jpg?1783945032","layout":"normal"});
const changeling = (): CardDef => ({"oracleId":"a61ef0cc-1da9-49f9-b0dc-01cf9f6205be","name":"Changeling Outcast","manaCost":"{B}","cmc":1,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"Changeling (This card is every creature type.)\nThis creature can't block and can't be blocked.","power":"1","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Changeling"],"imageUrl":"https://cards.scryfall.io/normal/front/0/8/08151d00-513a-4957-aa16-01c0f0245112.jpg?1783933130","artUrl":"https://cards.scryfall.io/art_crop/front/0/8/08151d00-513a-4957-aa16-01c0f0245112.jpg?1783933130","layout":"normal"});

describe("round 302: Cryptic Gateway", () => {
  it("is supported", () => supported(gateway()));

  const kin = (name: string, sub: string) => card(name, `Creature — ${sub}`, "{1}{G}", { cmc: 2, power: "2", toughness: "2" });
  const board = () => {
    const { s, ap } = setup([]);
    const g = putOnBattlefield(s, ap, gateway());
    const wiz = putOnBattlefield(s, ap, kin("Test Elf Wizard", "Elf Wizard"));
    const war = putOnBattlefield(s, ap, kin("Test Human Warrior", "Human Warrior"));
    const both = into(s, ap, kin("Test Elf Warrior", "Elf Warrior"), "hand");
    const elf = into(s, ap, kin("Test Plain Elf", "Elf"), "hand");
    const gob = into(s, ap, kin("Test Goblin", "Goblin"), "hand");
    const ch = into(s, ap, changeling(), "hand");
    return { s, ap, g, wiz, war, both, elf, gob, ch };
  };

  it("a creature card sharing a creature type with each creature tapped, not the same one", () => {
    let { s, ap, g, wiz, war, both, ch } = board();
    s = settle(run(s, planActivate(s, ap, g, 0, undefined, undefined, undefined, undefined, { tap: [wiz, war] })), { me: ap });
    expect(s.objects[wiz]!.tapped && s.objects[war]!.tapped).toBe(true);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, fromHand: true, min: 0 });
    // The Elf Warrior shares Elf with one and Warrior with the other; a changeling shares every type.
    expect([...(s.pending as { cards: string[] }).cards].sort()).toEqual([both, ch].sort());
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [both] }), { me: ap });
    expect(s.objects[both]!.zone).toBe("battlefield");
  });

  it("with the creatures as they last existed once they're gone", () => {
    let { s, ap, g, wiz, war, both, elf, ch } = board();
    s = run(s, planActivate(s, ap, g, 0, undefined, undefined, undefined, undefined, { tap: [wiz, war] }));
    // The Human Warrior leaves before the ability resolves: its types still count.
    moveObject(s, war, "graveyard");
    invalidateCharacteristics(s);
    s = settle(s, { me: ap });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", fromHand: true });
    const cards = (s.pending as { cards: string[] }).cards;
    expect(cards).toContain(both);
    expect(cards).toContain(ch);
    expect(cards).not.toContain(elf);
  });

  it("the bot taps two that share a type with a card in its hand, after combat", () => {
    let { s, ap, g, wiz, war, both, elf, gob, ch } = board();
    s = passUntil(s, "main2", ap);
    // Only the creature cards in hand, and nothing to cast them with.
    s.players[ap]!.hand = [both, elf, gob, ch];
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap && id !== wiz && id !== war && id !== g) s.objects[id]!.tapped = true;
    const plan = botActions(s, ap);
    const act0 = plan.find((a) => a.type === "activateAbility" && a.objectId === g);
    expect(act0?.type === "activateAbility" && act0.costs?.tap ? [...act0.costs.tap].sort() : undefined).toEqual([wiz, war].sort());
    // With only the Goblin in hand, nothing to put: it doesn't tap them for nothing.
    s.players[ap]!.hand = [gob];
    expect(botActions(s, ap).some((a) => a.type === "activateAbility" && a.objectId === g)).toBe(false);
  });
});

const osgir = (): CardDef => ({"oracleId":"add020f8-a6ae-4ce1-8d4e-f48f3fd14767","name":"Osgir, the Reconstructor","manaCost":"{2}{R}{W}","cmc":4,"typeLine":"Legendary Creature — Giant Artificer","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Giant","Artificer"],"oracleText":"Vigilance\n{1}, Sacrifice an artifact: Target creature you control gets +2/+0 until end of turn.\n{X}, {T}, Exile an artifact card with mana value X from your graveyard: Create two tokens that are copies of the exiled card. Activate only as a sorcery.","power":"4","toughness":"4","colors":["R","W"],"colorIdentity":["R","W"],"keywords":["Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/5/8/5815fe6e-e26b-4918-a090-55d6442722c1.jpg?1783927612","artUrl":"https://cards.scryfall.io/art_crop/front/5/8/5815fe6e-e26b-4918-a090-55d6442722c1.jpg?1783927612","layout":"normal"});
const golem = (): CardDef => ({"oracleId":"46334ae3-e496-4f15-8033-0f42ee0ae375","name":"Bottle Golems","manaCost":"{4}","cmc":4,"typeLine":"Artifact Creature — Golem","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Golem"],"oracleText":"Trample\nWhen this creature dies, you gain life equal to its power.","power":"3","toughness":"3","colors":[],"colorIdentity":[],"keywords":["Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/5/1/513a36a1-b2e3-4779-b8a7-66f01c488bf0.jpg?1783926806","artUrl":"https://cards.scryfall.io/art_crop/front/5/1/513a36a1-b2e3-4779-b8a7-66f01c488bf0.jpg?1783926806","layout":"normal"});
const rock = (): CardDef => ({"oracleId":"c97361b5-af16-4a7b-af85-a429dbaf4ad2","name":"Mind Stone","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/7/f/7fdef0b6-a3b9-4752-bce6-53c0140a1693.jpg?1783906237","artUrl":"https://cards.scryfall.io/art_crop/front/7/f/7fdef0b6-a3b9-4752-bce6-53c0140a1693.jpg?1783906237","layout":"normal"});

describe("round 302: Osgir, the Reconstructor", () => {
  it("is supported", () => supported(osgir()));

  const ready = () => {
    const { s: s0, ap } = setup([]);
    const os = putOnBattlefield(s0, ap, osgir());
    const st = into(s0, ap, rock(), "graveyard");
    const gol = into(s0, ap, golem(), "graveyard");
    s0.players[ap]!.hand = [];
    const s = passUntil(s0, "main1", ap);
    return { s, ap, os, st, gol };
  };
  const named = (s: GameState, name: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).name === name);

  it("X is the exiled card's mana value: two token copies of it", () => {
    let { s, ap, os, st } = ready();
    s.players[ap]!.manaPool.C = 2;
    s = settle(run(s, planActivate(s, ap, os, 1, undefined, undefined, undefined, 2, { exileCards: [st] })), { me: ap });
    expect(s.objects[st]!.zone).toBe("exile");
    expect(named(s, "Mind Stone").length).toBe(2);
  });

  it("not a card with another mana value", () => {
    const { s, ap, os, gol } = ready();
    s.players[ap]!.manaPool.C = 2;
    expect(planActivate(s, ap, os, 1, undefined, undefined, undefined, 2, { exileCards: [gol] })).toBeNull();
  });

  it("only as a sorcery", () => {
    const { s, ap, os, st } = ready();
    s.players[ap]!.manaPool.C = 2;
    const s2 = passUntil(s, "beginCombat", ap);
    s2.players[ap]!.manaPool.C = 2;
    expect(planActivate(s2, ap, os, 1, undefined, undefined, undefined, 2, { exileCards: [st] })).toBeNull();
  });

  it("the bot copies the biggest artifact card it can pay for, in its second main phase", () => {
    const { s: s1, ap, os, gol } = ready();
    const s = passUntil(s1, "main2", ap);
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap && id !== os) s.objects[id]!.tapped = true;
    s.players[ap]!.manaPool.C = 4;
    const plan = botActions(s, ap);
    const a = plan.find((x) => x.type === "activateAbility" && x.objectId === os);
    expect(a?.type === "activateAbility" ? a.costs?.exileCards : undefined).toEqual([gol]);
    expect(a?.type === "activateAbility" ? a.x : undefined).toBe(4);
  });
});

const archfiend = (): CardDef => ({"oracleId":"6beec974-891f-4354-8621-ac403c07509a","name":"Archfiend of Spite","manaCost":"{5}{B}{B}","cmc":7,"typeLine":"Creature — Demon","supertypes":[],"types":["Creature"],"subtypes":["Demon"],"oracleText":"Flying\nWhenever a source an opponent controls deals damage to this creature, that source's controller loses that much life unless they sacrifice that many permanents of their choice.\nMadness {3}{B}{B} (If you discard this card, discard it into exile. When you do, cast it for its madness cost or put it into your graveyard.)","power":"6","toughness":"6","colors":["B"],"colorIdentity":["B"],"keywords":["Flying","Madness"],"imageUrl":"https://cards.scryfall.io/normal/front/1/d/1df2ca13-4062-4827-ae2f-c61cf88ba3b3.jpg?1783932810","artUrl":"https://cards.scryfall.io/art_crop/front/1/d/1df2ca13-4062-4827-ae2f-c61cf88ba3b3.jpg?1783932810","layout":"normal"});

describe("round 302: Archfiend of Spite", () => {
  it("is supported", () => supported(archfiend()));

  /** An opponent's 3/3 deals 3 damage to the Archfiend, with `n` other permanents of theirs. */
  const hit = (n: number, dmg = 3, by: "opp" | "ap" = "opp") => {
    const { s, ap, opp } = setup([]);
    const a = putOnBattlefield(s, ap, archfiend());
    const src = putOnBattlefield(s, by === "opp" ? opp : ap, bear({ name: "Test Hitter", power: "3", toughness: "3" }));
    const extra = Array.from({ length: n }, (_, i) => putOnBattlefield(s, opp, bear({ name: `Test Extra ${i}` })));
    for (const id of s.battlefield) if (s.objects[id]!.controller === opp && id !== src && !extra.includes(id)) {
      // Only the hitter and the extras: the opponent's other permanents go away.
      s.battlefield.splice(s.battlefield.indexOf(id), 1);
      delete s.objects[id];
    }
    invalidateCharacteristics(s);
    dealDamage(s, objectSource(s, s.objects[src]!), { object: s.objects[a]! }, dmg);
    return { s, ap, opp, a, src, extra };
  };

  it("the source's controller loses that much life or sacrifices that many permanents, their choice", () => {
    let { s, ap, opp, src, extra } = hit(3);
    s = settle(s, { me: opp });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "punisher", player: opp });
    expect((s.pending as { labels: string[] }).labels).toEqual(["Sacrifice 3 permanents", "Lose 3 life"]);
    s = settle(act(s, { type: "chooseOption", player: opp, choice: "0" }), { me: opp });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "sacrifice", player: opp, count: 3 });
    s = settle(act(s, { type: "pickPermanents", player: opp, ids: [src, extra[0]!, extra[1]!] }), { me: opp });
    expect([src, extra[0]!, extra[1]!].every((id) => s.objects[id]?.zone !== "battlefield")).toBe(true);
    expect(s.objects[extra[2]!]!.zone).toBe("battlefield");
    expect(s.players[opp]!.life).toBe(40);
    expect(ap).toBeDefined();
  });

  it("losing the life instead", () => {
    let { s, opp } = hit(3);
    s = settle(s, { me: opp });
    s = settle(act(s, { type: "chooseOption", player: opp, choice: "none" }), { me: opp });
    expect(s.players[opp]!.life).toBe(37);
  });

  it("with too few permanents to sacrifice, they lose the life", () => {
    let { s, opp } = hit(0);
    s = settle(s, { me: opp });
    expect(s.players[opp]!.life).toBe(37);
  });

  it("triggers on lethal damage too", () => {
    let { s, opp, a } = hit(0, 7);
    s = settle(s, { me: opp });
    expect(s.objects[a]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(33);
  });

  it("its controller's own sources don't trigger it", () => {
    let { s, ap } = hit(0, 3, "ap");
    const life = s.players[ap]!.life;
    s = settle(s, { me: ap });
    expect(s.players[ap]!.life).toBe(life);
    expect(s.pending).toBeFalsy();
  });

  it("the player who controls the source as it resolves: control changed in response", () => {
    let { s, ap, opp, src } = hit(0);
    const other = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    // The trigger waits on the stack; the Hitter changes hands first.
    expect(s.triggerQueue.length + s.stack.length).toBeGreaterThan(0);
    s.objects[src]!.controller = other;
    invalidateCharacteristics(s);
    const before = s.players[other]!.life;
    s = settle(s, { me: other });
    if (s.pending?.kind === "chooseOption" && s.pending.player === other) s = settle(act(s, { type: "chooseOption", player: other, choice: "none" }), { me: other });
    expect(s.players[other]!.life).toBe(before - 3);
    expect(s.players[opp]!.life).toBe(40);
  });
});

const stick = (): CardDef => ({"oracleId":"4abda0ad-0a2b-4bd9-81c7-56329e62311d","name":"Stick Together","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Each player chooses a party from among creatures they control, then sacrifices the rest. (To choose a party, choose up to one each of Cleric, Rogue, Warrior, and Wizard.)","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/d/8d77a57a-e30b-46d7-acb8-1d164c7dff78.jpg?1783922510","artUrl":"https://cards.scryfall.io/art_crop/front/8/d/8d77a57a-e30b-46d7-acb8-1d164c7dff78.jpg?1783922510","layout":"normal"});

describe("round 302: Stick Together", () => {
  it("is supported", () => supported(stick()));

  const cr = (name: string, sub: string) => card(name, `Creature — ${sub}`, "{1}", { cmc: 1, power: "1", toughness: "1" });
  const board = () => {
    const { s, ap, opp } = setup([]);
    const cleric = putOnBattlefield(s, ap, cr("Test Cleric", "Human Cleric"));
    const cw = putOnBattlefield(s, ap, cr("Test Cleric Wizard", "Elf Cleric Wizard"));
    const rogue = putOnBattlefield(s, ap, cr("Test Rogue", "Human Rogue"));
    const gob = putOnBattlefield(s, ap, cr("Test Goblin", "Goblin"));
    const ch = putOnBattlefield(s, ap, changeling());
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    const theirWar = putOnBattlefield(s, opp, cr("Their Warrior", "Human Warrior"));
    const st = into(s, ap, stick(), "hand");
    s.players[ap]!.manaPool.W = 5;
    return { s: settle(run(s, planCast(s, ap, st)), { me: ap }), ap, opp, cleric, cw, rogue, gob, ch, theirs, theirWar };
  };
  const pick = (s: GameState, ap: PlayerId, id: string | null) => settle(act(s, { type: "pickPermanents", player: ap, ids: id ? [id] : [] }), { me: ap });

  it("up to one each of Cleric, Rogue, Warrior and Wizard; the other creatures are sacrificed", () => {
    let { s, ap, cleric, cw, rogue, gob, ch, theirs, theirWar } = board();
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "keep", player: ap, min: 0, count: 1 });
    expect([...(s.pending as { options: string[] }).options].sort()).toEqual([cleric, cw, ch].sort());
    s = pick(s, ap, cleric);
    expect([...(s.pending as { options: string[] }).options].sort()).toEqual([rogue, ch].sort());
    s = pick(s, ap, rogue);
    // Warrior: only the changeling.
    expect((s.pending as { options: string[] }).options).toEqual([ch]);
    s = pick(s, ap, ch);
    expect((s.pending as { options: string[] }).options).toEqual([cw]);
    s = pick(s, ap, cw);
    for (const id of [cleric, cw, rogue, ch]) expect(s.objects[id]!.zone, id).toBe("battlefield");
    expect(s.objects[gob]!.zone).toBe("graveyard");
    // The opponent keeps its Warrior (the bot's choice), and its Bear goes.
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.objects[theirWar]!.zone).toBe("battlefield");
  });

  it("a creature fills only one slot of the party", () => {
    let { s, ap, cw, ch } = board();
    s = pick(s, ap, cw);
    s = pick(s, ap, null);
    s = pick(s, ap, null);
    // Wizard: the Cleric Wizard is in the party already; the changeling still can be.
    expect((s.pending as { options: string[] }).options).toEqual([ch]);
  });

  it("the bot keeps the biggest party it can", () => {
    let { s, ap, cleric, cw, rogue, ch } = board();
    for (let i = 0; i < 4 && s.pending?.kind === "pickPermanents" && s.pending.player === ap; i++) s = settle(act(s, botActions(s, ap)[0]!), { me: ap });
    expect([cleric, cw, rogue, ch].every((id) => s.objects[id]!.zone === "battlefield")).toBe(true);
  });
});

const lich = (): CardDef => ({"oracleId":"785c306c-471c-4699-8ab2-43c253d569cf","name":"Lich's Mastery","manaCost":"{3}{B}{B}{B}","cmc":6,"typeLine":"Legendary Enchantment","supertypes":["Legendary"],"types":["Enchantment"],"subtypes":[],"oracleText":"Hexproof\nYou can't lose the game.\nWhenever you gain life, draw that many cards.\nWhenever you lose life, for each 1 life you lost, exile a permanent you control or a card from your hand or graveyard.\nWhen Lich's Mastery leaves the battlefield, you lose the game.","colors":["B"],"colorIdentity":["B"],"keywords":["Hexproof"],"imageUrl":"https://cards.scryfall.io/normal/front/7/7/77f4c9cb-f364-4556-8673-4b19d52a2cff.jpg?1783935005","artUrl":"https://cards.scryfall.io/art_crop/front/7/7/77f4c9cb-f364-4556-8673-4b19d52a2cff.jpg?1783935005","layout":"normal"});

describe("round 302: Lich's Mastery", () => {
  it("is supported", () => supported(lich()));

  /** Lich's Mastery on `ap`'s side, then an opponent's 1/1 deals `n` damage to them. */
  const hurt = (n: number, clear = false) => {
    const { s, ap, opp } = setup([]);
    if (clear) {
      for (const id of [...s.battlefield]) if (s.objects[id]!.controller === ap) s.battlefield.splice(s.battlefield.indexOf(id), 1);
      s.players[ap]!.hand = [];
      s.players[ap]!.graveyard = [];
    }
    const m = putOnBattlefield(s, ap, lich());
    const src = putOnBattlefield(s, opp, bear({ name: "Test Hitter", power: "1", toughness: "1" }));
    invalidateCharacteristics(s);
    return { s, ap, opp, m, hit: (st: GameState) => (dealDamage(st, objectSource(st, st.objects[src]!), { player: ap }, n), st) };
  };

  it("for each 1 life lost, exile a permanent or a card from your hand or graveyard: any mix", () => {
    let { s, ap, m, hit } = hurt(3);
    const g = into(s, ap, bear({ name: "Test Dead" }), "graveyard");
    const h = into(s, ap, bear({ name: "Test Held" }), "hand");
    const p = putOnBattlefield(s, ap, bear({ name: "Test Kept" }));
    s = settle(hit(s), { me: ap });
    expect(s.players[ap]!.life).toBe(37);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "exileHandOrPermanent", player: ap, prompt: "exile a permanent you control or a card from your hand or graveyard (1 of 3)" });
    expect((s.pending as { options: string[] }).options).toEqual(expect.arrayContaining([g, h, p, m]));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: g }), { me: ap });
    expect(s.pending).toMatchObject({ prompt: "exile a permanent you control or a card from your hand or graveyard (2 of 3)" });
    expect((s.pending as { options: string[] }).options).not.toContain(g);
    // Nothing is exiled until all of them are chosen.
    expect(s.objects[g]!.zone).toBe("graveyard");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: h }), { me: ap });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: p }), { me: ap });
    expect([g, h, p].map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile", "exile"]);
    expect(s.objects[m]!.zone).toBe("battlefield");
    expect(s.pending).toBeFalsy();
  });

  it("you can't lose the game at 0 or less life", () => {
    let { s, ap, hit } = hurt(3);
    s.players[ap]!.life = 2;
    s = settle(hit(s), { me: ap });
    for (let i = 0; i < 3 && s.pending; i++) s = settle(act(s, botActions(s, ap)[0]!), { me: ap });
    expect(s.players[ap]!.life).toBe(-1);
    expect(s.players[ap]!.lost).toBeFalsy();
  });

  it("with too little to exile, everything goes, Lich's Mastery too, and you lose the game", () => {
    let { s, ap, m, hit } = hurt(5, true);
    const h = into(s, ap, bear({ name: "Test Held" }), "hand");
    s = settle(hit(s), { me: ap });
    expect(s.objects[h]!.zone).toBe("exile");
    expect(s.objects[m]!.zone).toBe("exile");
    expect(s.players[ap]!.lost).toBe(true);
  });

  it("whenever you gain life, draw that many cards", () => {
    let { s, ap } = hurt(0);
    const hand = s.players[ap]!.hand.length;
    const gain = into(s, ap, card("Test Heal", "Instant", "{W}", { cmc: 1, oracleText: "You gain 3 life." }), "hand");
    s = settle(run(s, planCast(s, ap, gain)), { me: ap });
    expect(s.players[ap]!.life).toBe(43);
    expect(s.players[ap]!.hand.length).toBe(hand + 3);
  });

  it("the bot exiles graveyard cards first and keeps Lich's Mastery", () => {
    let { s, ap, m, hit } = hurt(2, true);
    const g = into(s, ap, bear({ name: "Test Dead" }), "graveyard");
    const p = putOnBattlefield(s, ap, bear({ name: "Test Kept" }));
    const q = putOnBattlefield(s, ap, bear({ name: "Test Kept Too" }));
    s = settle(hit(s), { me: ap });
    for (let i = 0; i < 3 && s.pending; i++) s = settle(act(s, botActions(s, ap)[0]!), { me: ap });
    expect(s.objects[g]!.zone).toBe("exile");
    expect([p, q].filter((id) => s.objects[id]!.zone === "exile")).toHaveLength(1);
    expect(s.objects[m]!.zone).toBe("battlefield");
    expect(s.players[ap]!.lost).toBeFalsy();
  });
});

const plasma = (): CardDef => ({"oracleId":"1c50c637-750c-4e31-a69c-915430fc3194","name":"Plasma Caster","manaCost":"{1}{R}","cmc":2,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +1/+1.\nWhenever equipped creature attacks, you get {E}{E} (two energy counters).\nPay {E}{E}: Choose target creature that's blocking equipped creature. Flip a coin. If you win the flip, exile the chosen creature. Otherwise, this Equipment deals 1 damage to it.\nEquip {2}","colors":["R"],"colorIdentity":["R"],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/c/1/c1654256-25ea-4467-812d-25f32fe65cdd.jpg?1783912403","artUrl":"https://cards.scryfall.io/art_crop/front/c/1/c1654256-25ea-4467-812d-25f32fe65cdd.jpg?1783912403","layout":"normal"});

describe("round 302: Plasma Caster", () => {
  it("is supported", () => supported(plasma()));

  /** `a` (equipped) and `b` attack the opponent; `x` blocks `a`, `y` blocks `b`. */
  const combat = (seed = 5) => {
    const { s: s0, ap, opp } = setup([], seed);
    s0.players[ap]!.hand = [];
    const c = putOnBattlefield(s0, ap, plasma());
    const a = putOnBattlefield(s0, ap, bear({ name: "Test Striker" }));
    const b = putOnBattlefield(s0, ap, bear({ name: "Test Other" }));
    const x = putOnBattlefield(s0, opp, bear({ name: "Test Wall", power: "0", toughness: "4" }));
    const y = putOnBattlefield(s0, opp, bear({ name: "Test Wall Two", power: "0", toughness: "4" }));
    s0.objects[c]!.attachedTo = a;
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [a, b].map((attacker) => ({ attacker, defender: opp })) } as Action));
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "declareBlockers", player: opp });
    s = settle(act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: x, attacker: a }, { blocker: y, attacker: b }] }));
    const ix = s.objects[c]!.zone === "battlefield" ? 0 : -1;
    return { s, ap, opp, c, a, b, x, y, ix };
  };

  it("an attack gives you {E}{E}; only a creature blocking the equipped creature can be chosen", () => {
    const { s, ap, c, x, y, ix } = combat();
    expect(s.players[ap]!.energy).toBe(2);
    expect(waitingOn(s)).toBe(ap);
    expect(() => run(s, planActivate(s, ap, c, ix, [tgt(y)]))).toThrow();
    expect(() => run(s, planActivate(s, ap, c, ix, [tgt(x)]))).not.toThrow();
  });

  it("flip a coin: win, the creature is exiled; lose, the Equipment deals 1 damage to it", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 12 && seen.size < 2; seed++) {
      const { s: s0, ap, c, x, ix } = combat(seed);
      const s = settle(run(s0, planActivate(s0, ap, c, ix, [tgt(x)])));
      expect(s.players[ap]!.energy).toBe(0);
      const o = s.objects[x]!;
      if (o.zone === "exile") seen.add("won");
      else {
        expect(o.damage).toBe(1);
        seen.add("lost");
      }
      expect(s.log.some((l) => /flips a coin/.test(l.text))).toBe(true);
    }
    expect([...seen].sort()).toEqual(["lost", "won"]);
  });

  it("the Equipment moving after it's activated doesn't matter: the target was blocking the creature it equipped", () => {
    const { s: s0, ap, c, b, x, ix } = combat();
    let s = run(s0, planActivate(s0, ap, c, ix, [tgt(x)]));
    s.objects[c]!.attachedTo = b;
    invalidateCharacteristics(s);
    s = settle(s);
    expect(s.objects[x]!.zone === "exile" || s.objects[x]!.damage === 1).toBe(true);
  });

  it("a target no longer blocking it: the ability doesn't resolve and no coin is flipped", () => {
    const { s: s0, ap, c, x, ix } = combat();
    let s = run(s0, planActivate(s0, ap, c, ix, [tgt(x)]));
    const flips = s.log.filter((l) => /flips a coin/.test(l.text)).length;
    removeFromCombat(s, s.objects[x]!);
    s = settle(s);
    expect(s.objects[x]!.zone).toBe("battlefield");
    expect(s.objects[x]!.damage).toBe(0);
    expect(s.log.filter((l) => /flips a coin/.test(l.text)).length).toBe(flips);
  });
});
