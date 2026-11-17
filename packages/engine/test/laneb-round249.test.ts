// Lane B round B249: creatures entering as copies (CR 614.1c, 707.5). Essence of the Wild ("Creatures you control enter as
// a copy of ~.") and Infinite Reflection ("When ~ enters attached to a creature, each other nontoken creature you control
// becomes a copy of that creature. Nontoken creatures you control enter as a copy of enchanted creature."): copy effects
// applied after control-changing replacements and before every other one (CR 616.1, rulings), so the entering creature's
// own "enters" replacements and triggers don't apply; with several that differ, its controller chooses which applies last.

import { describe, expect, it } from "vitest";
import { act, bear, commander, forest, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, commanderIdentity, compileCard, createGame, defOf, validateCommanderDeck, invalidateCharacteristics, isFullySupported, moveObject, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const essence = (): CardDef => ({"oracleId":"9d105f83-583d-438b-8f26-b39e818ed295","name":"Essence of the Wild","manaCost":"{3}{G}{G}{G}","cmc":6,"typeLine":"Creature — Avatar","supertypes":[],"types":["Creature"],"subtypes":["Avatar"],"oracleText":"Creatures you control enter as a copy of this creature.","power":"6","toughness":"6","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/e/dec48cba-1b5d-44e7-9e25-16922dedb67d.jpg?1783940920","artUrl":"https://cards.scryfall.io/art_crop/front/d/e/dec48cba-1b5d-44e7-9e25-16922dedb67d.jpg?1783940920","layout":"normal"});
const reflection = (): CardDef => ({"oracleId":"5bbcfb73-cccc-47b0-81ae-17eb7c33ff5e","name":"Infinite Reflection","manaCost":"{5}{U}","cmc":6,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nWhen this Aura enters attached to a creature, each other nontoken creature you control becomes a copy of that creature.\nNontoken creatures you control enter as a copy of enchanted creature.","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/2/42506c54-e9bf-4d0f-8dd5-8b218668c925.jpg?1783940717","artUrl":"https://cards.scryfall.io/art_crop/front/4/2/42506c54-e9bf-4d0f-8dd5-8b218668c925.jpg?1783940717","layout":"normal"});
const clone = (): CardDef => ({"oracleId":"42226b87-0746-4ebf-9fd0-108d508462af","name":"Clone","manaCost":"{3}{U}","cmc":4,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"You may have this creature enter as a copy of any creature on the battlefield.","power":"0","toughness":"0","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/8/48c2e9e2-f679-451d-a700-18104af08988.jpg?1784013893","artUrl":"https://cards.scryfall.io/art_crop/front/4/8/48c2e9e2-f679-451d-a700-18104af08988.jpg?1784013893","layout":"normal"});
const visionary = (): CardDef => ({"oracleId":"c6a3a882-a127-4590-93d7-679ef4313efe","name":"Elvish Visionary","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Elf Shaman","supertypes":[],"types":["Creature"],"subtypes":["Elf","Shaman"],"oracleText":"When this creature enters, draw a card.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/9/69f570b5-1629-4b10-8f66-ed9b4355a0a4.jpg?1783908825","artUrl":"https://cards.scryfall.io/art_crop/front/6/9/69f570b5-1629-4b10-8f66-ed9b4355a0a4.jpg?1783908825","layout":"normal"});
const alarm = (): CardDef => ({"oracleId":"5b2364d7-a811-4595-a1b4-224c70555ffa","name":"Raise the Alarm","manaCost":"{1}{W}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Create two 1/1 white Soldier creature tokens.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/1/81d3e5c5-6531-48e7-9dd6-2db519dd61b1.jpg?1783908838","artUrl":"https://cards.scryfall.io/art_crop/front/8/1/81d3e5c5-6531-48e7-9dd6-2db519dd61b1.jpg?1783908838","layout":"normal"});
const xantcha = (): CardDef => ({"oracleId":"0f0f3712-8d13-41a5-b332-2ab34e48d79d","name":"Xantcha, Sleeper Agent","manaCost":"{1}{B}{R}","cmc":3,"typeLine":"Legendary Creature — Phyrexian Minion","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Phyrexian","Minion"],"oracleText":"Xantcha enters under the control of an opponent of your choice.\nXantcha attacks each combat if able and can't attack its owner or planeswalkers its owner controls.\n{3}: Xantcha's controller loses 2 life and you draw a card. Any player may activate this ability.","power":"5","toughness":"5","colors":["B","R"],"colorIdentity":["B","R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/9/89b03b9a-7e20-47cb-bc64-23513acea855.jpg?1783934325","artUrl":"https://cards.scryfall.io/art_crop/front/8/9/89b03b9a-7e20-47cb-bc64-23513acea855.jpg?1783934325","layout":"normal"});
const hydra = (): CardDef => ({"oracleId":"7bd36106-04fe-481f-b16e-e076dcbb183b","name":"Kalonian Hydra","manaCost":"{3}{G}{G}","cmc":5,"typeLine":"Creature — Hydra","supertypes":[],"types":["Creature"],"subtypes":["Hydra"],"oracleText":"Trample\nThis creature enters with four +1/+1 counters on it.\nWhenever this creature attacks, double the number of +1/+1 counters on each creature you control.","power":"0","toughness":"0","colors":["G"],"colorIdentity":["G"],"keywords":["Trample","Double"],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/438bd3c1-98f2-4fcc-8521-995c6c5c1a79.jpg?1783939903","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/438bd3c1-98f2-4fcc-8521-995c6c5c1a79.jpg?1783939903","layout":"normal"});
const shivan = (): CardDef => ({"oracleId":"711eea87-0fa3-46e0-a42b-fa5a86455f04","name":"Shivan Dragon","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying\n{R}: This creature gets +1/+0 until end of turn.","power":"5","toughness":"5","colors":["R"],"colorIdentity":["R"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/2/9/294ca89d-549a-4302-9284-df5b4e833a69.jpg?1789446860","artUrl":"https://cards.scryfall.io/art_crop/front/2/9/294ca89d-549a-4302-9284-df5b4e833a69.jpg?1789446860","layout":"normal"});
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","layout":"normal"});
const mystic = (): CardDef => ({"oracleId":"491dc110-b459-412e-8a0b-45e5744ee8d1","name":"Mystic Reflection","manaCost":"{1}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose target nonlegendary creature. The next time one or more creatures or planeswalkers enter this turn, they enter as copies of the chosen creature.\nForetell {U} (During your turn, you may pay {2} and exile this card from your hand face down. Cast it on a later turn for its foretell cost.)","colors":["U"],"colorIdentity":["U"],"keywords":["Foretell"],"imageUrl":"https://cards.scryfall.io/normal/front/f/7/f7b877e2-60eb-46cd-acd7-8555b9e7e993.jpg?1783928260","artUrl":"https://cards.scryfall.io/art_crop/front/f/7/f7b877e2-60eb-46cd-acd7-8555b9e7e993.jpg?1783928260","layout":"normal"});
const piper = (): CardDef => ({"oracleId":"b2aeee90-7b8d-47a6-9167-cc21f7fbfd43","name":"The Prismatic Piper","manaCost":"{5}","cmc":5,"typeLine":"Legendary Creature — Shapeshifter","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"If The Prismatic Piper is your commander, choose a color before the game begins. The Prismatic Piper is the chosen color.\nPartner (You can have two commanders if both have partner.)","power":"3","toughness":"3","colors":[],"colorIdentity":[],"keywords":["Partner"],"imageUrl":"https://cards.scryfall.io/normal/front/a/6/a69e6d8f-f742-4508-a83a-38ae84be228c.jpg?1783928894","artUrl":"https://cards.scryfall.io/art_crop/front/a/6/a69e6d8f-f742-4508-a83a-38ae84be228c.jpg?1783928894","layout":"normal"});
const faceless = (): CardDef => ({"oracleId":"ef220170-c01a-4ca5-b887-f248c50227ee","name":"Faceless One","manaCost":"{5}","cmc":5,"typeLine":"Legendary Enchantment Creature — Background","supertypes":["Legendary"],"types":["Enchantment","Creature"],"subtypes":["Background"],"oracleText":"If Faceless One is your commander, choose a color before the game begins. Faceless One is the chosen color.\nChoose a Background (You can have a Background as a second commander.)","power":"3","toughness":"3","colors":[],"colorIdentity":[],"keywords":["Choose a background"],"imageUrl":"https://cards.scryfall.io/normal/front/2/5/25564fba-5765-457b-8dd3-f26b877221b8.jpg?1783922822","artUrl":"https://cards.scryfall.io/art_crop/front/2/5/25564fba-5765-457b-8dd3-f26b877221b8.jpg?1783922822","layout":"normal"});
const kraum = (): CardDef => ({"oracleId":"5f694f2d-9349-4988-b2b4-788136d4293e","name":"Kraum, Ludevic's Opus","manaCost":"{3}{U}{R}","cmc":5,"typeLine":"Legendary Creature — Zombie Horror","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Zombie","Horror"],"oracleText":"Flying, haste\nWhenever an opponent casts their second spell each turn, draw a card.\nPartner (You can have two commanders if both have partner.)","power":"4","toughness":"4","colors":["R","U"],"colorIdentity":["R","U"],"keywords":["Flying","Haste","Partner"],"imageUrl":"https://cards.scryfall.io/normal/front/5/5/557fcd17-6cb3-414a-b2b1-ea9ae32e5aec.jpg?1783937084","artUrl":"https://cards.scryfall.io/art_crop/front/5/5/557fcd17-6cb3-414a-b2b1-ea9ae32e5aec.jpg?1783937084","layout":"normal"});
const sage = (): CardDef => ({"oracleId":"f9516b60-36dd-4f8a-bebb-ac1bc0961f07","name":"Candlekeep Sage","manaCost":"{2}{U}","cmc":3,"typeLine":"Legendary Enchantment — Background","supertypes":["Legendary"],"types":["Enchantment"],"subtypes":["Background"],"oracleText":"Commander creatures you own have \"When this creature enters or leaves the battlefield, draw a card.\"","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/f/6f706ac3-0ad8-44ac-a99e-21c04075951d.jpg?1783922794","artUrl":"https://cards.scryfall.io/art_crop/front/6/f/6f706ac3-0ad8-44ac-a99e-21c04075951d.jpg?1783922794","layout":"normal"});
const counterspell = (): CardDef => ({"oracleId":"cc187110-1148-4090-bbb8-e205694a39f5","name":"Counterspell","manaCost":"{U}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target spell.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/c/0c9a7cb0-5bff-48ff-b620-2838816ac9b5.jpg?1783937618","artUrl":"https://cards.scryfall.io/art_crop/front/0/c/0c9a7cb0-5bff-48ff-b620-2838816ac9b5.jpg?1783937618","layout":"normal"});
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","layout":"normal"});
const clara = (): CardDef => ({"oracleId":"542eae01-058d-4959-92a8-49d6b1e33ecd","name":"Clara Oswald","manaCost":"{6}","cmc":6,"typeLine":"Legendary Creature — Human Advisor","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Advisor"],"oracleText":"Impossible Girl — If Clara Oswald is your commander, choose a color before the game begins. Clara Oswald is the chosen color.\nIf a triggered ability of a Doctor you control triggers, that ability triggers an additional time.\nDoctor's companion (You can have two commanders if the other is the Doctor.)","power":"2","toughness":"6","colors":[],"colorIdentity":[],"keywords":["Impossible Girl","Doctor's companion"],"imageUrl":"https://cards.scryfall.io/normal/front/9/a/9a1ee042-6713-4e9e-9901-9b94d99d33f1.jpg?1783914685","artUrl":"https://cards.scryfall.io/art_crop/front/9/a/9a1ee042-6713-4e9e-9901-9b94d99d33f1.jpg?1783914685","layout":"normal"});

const supported = (...ds: CardDef[]) => ds.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes and lets bots answer until the stack is empty or one of `me` has a question. */
const settle = (s: GameState, me: PlayerId[] = []) => {
  for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && !me.includes(p.player)) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const name = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const yours = (s: GameState, pid: PlayerId, n: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && name(s, id) === n);

describe("Lane B round B249", () => {
  it("are fully supported, and Infinite Reflection's enters trigger is about the creature it entered attached to", () => {
    supported(essence(), reflection());
    expect(compileCard(essence()).creaturesEnterAsCopy).toEqual([{ of: "self", text: "Creatures you control enter as a copy of ~." }]);
    const c = compileCard(reflection());
    expect(c.creaturesEnterAsCopy?.map((g) => [g.of, g.nontoken])).toEqual([["enchanted", true]]);
    expect(c.triggers.map((t) => [t.event, t.ifEnteredAttachedCreature])).toEqual([["selfEnters", true]]);
  });
});

describe("Lane B round B249: Essence of the Wild", () => {
  it("a creature spell you cast enters as a copy of it: its own enters trigger never triggers", () => {
    const { s: s0, ap, ids } = setup([visionary(), giant()]);
    const e = putOnBattlefield(s0, ap, essence());
    invalidateCharacteristics(s0);
    const hand = s0.players[ap]!.hand.length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(name(s, ids[0]!)).toBe("Essence of the Wild");
    expect(pt(s, ids[0]!)).toBe("6/6");
    // Elvish Visionary's "When this creature enters, draw a card" isn't Essence of the Wild's.
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    expect(s.log.some((l) => l.text === "Elvish Visionary enters as a copy of Essence of the Wild.")).toBe(true);
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(name(s, ids[1]!)).toBe("Essence of the Wild");
    expect(yours(s, ap, "Essence of the Wild").sort()).toEqual([e, ids[0]!, ids[1]!].sort());
  });

  it("copies only its copiable values: not its counters or other effects; an opponent's creatures enter as themselves", () => {
    const { s: s0, ap, opp, ids } = setup([giant()]);
    const e = putOnBattlefield(s0, ap, essence());
    s0.objects[e]!.counters["+1/+1"] = 2;
    invalidateCharacteristics(s0);
    expect(pt(s0, e)).toBe("8/8");
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(pt(s, ids[0]!)).toBe("6/6");
    expect(s.objects[ids[0]!]!.counters["+1/+1"] ?? 0).toBe(0);
    const theirs = putOnBattlefield(s, opp, giant());
    moveObject(s, theirs, "graveyard");
    moveObject(s, theirs, "battlefield", { controller: opp });
    invalidateCharacteristics(s);
    expect(name(s, theirs)).toBe("Hill Giant");
  });

  it("tokens you create enter as copies too; they stay tokens", () => {
    const { s: s0, ap, ids } = setup([alarm()]);
    putOnBattlefield(s0, ap, essence());
    invalidateCharacteristics(s0);
    const before = new Set(s0.battlefield);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const made = s.battlefield.filter((id) => !before.has(id));
    expect(made.length).toBe(2);
    for (const id of made) {
      expect(s.objects[id]!.isToken).toBe(true);
      expect(name(s, id)).toBe("Essence of the Wild");
      expect(pt(s, id)).toBe("6/6");
    }
  });

  it("the entering creature's own replacements don't apply: Kalonian Hydra enters with no counters", () => {
    const { s: s0, ap, ids } = setup([hydra()]);
    putOnBattlefield(s0, ap, essence());
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(name(s, ids[0]!)).toBe("Essence of the Wild");
    expect(s.objects[ids[0]!]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(pt(s, ids[0]!)).toBe("6/6");
  });

  it("a Clone becomes a copy of it whatever order the two copy effects are applied in: nothing is asked", () => {
    const { s: s0, ap, opp, ids } = setup([clone()]);
    putOnBattlefield(s0, ap, essence());
    putOnBattlefield(s0, opp, shivan());
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), [ap]);
    expect(s.pending).toBeNull();
    expect(name(s, ids[0]!)).toBe("Essence of the Wild");
  });

  it("Xantcha's control change comes first: it enters under the opponent you choose, as itself unless they have one", () => {
    const { s: s0, ap, opp, ids } = setup([xantcha()]);
    putOnBattlefield(s0, ap, essence());
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), [ap]);
    expect(s.pending?.kind === "chooseOption" && s.pending.what).toBe("controlOpponent");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: String(opp) }), [ap]);
    expect(s.objects[ids[0]!]!.controller).toBe(opp);
    expect(name(s, ids[0]!)).toBe("Xantcha, Sleeper Agent");

    const { s: t0, ap: ap2, opp: opp2, ids: ids2 } = setup([xantcha()]);
    putOnBattlefield(t0, opp2, essence());
    invalidateCharacteristics(t0);
    let t = settle(run(t0, planCast(t0, ap2, ids2[0]!)), [ap2]);
    t = settle(act(t, { type: "chooseOption", player: ap2, choice: String(opp2) }), [ap2]);
    expect(t.objects[ids2[0]!]!.controller).toBe(opp2);
    expect(name(t, ids2[0]!)).toBe("Essence of the Wild");
  });
});

describe("Lane B round B249: Infinite Reflection", () => {
  it("as it enters attached to a creature, your other nontoken creatures become copies of it; nontoken creatures then enter as copies", () => {
    const { s: s0, ap, opp, ids } = setup([reflection(), visionary(), alarm()]);
    const dragon = putOnBattlefield(s0, opp, shivan());
    const mine = putOnBattlefield(s0, ap, giant());
    const token = putOnBattlefield(s0, ap, giant());
    s0.objects[token]!.isToken = true;
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(dragon)])));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(dragon);
    expect(name(s, mine)).toBe("Shivan Dragon");
    expect(name(s, token)).toBe("Hill Giant");
    expect(name(s, dragon)).toBe("Shivan Dragon");
    expect(s.objects[dragon]!.copyOf).toBeUndefined();
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(name(s, ids[1]!)).toBe("Shivan Dragon");
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    // Tokens enter as themselves.
    const before = new Set(s.battlefield);
    s = settle(run(s, planCast(s, ap, ids[2]!)));
    const made = s.battlefield.filter((id) => !before.has(id));
    expect(made.length).toBe(2);
    expect(made.every((id) => /Soldier/.test(name(s, id)) && pt(s, id) === "1/1")).toBe(true);
  });

  it("\"that creature\" is the one it entered attached to, even if the Aura is moved before the trigger resolves", () => {
    const { s: s0, ap, opp, ids } = setup([reflection(), giant()]);
    const dragon = putOnBattlefield(s0, opp, shivan());
    const other = putOnBattlefield(s0, opp, visionary());
    const mine = putOnBattlefield(s0, ap, giant());
    invalidateCharacteristics(s0);
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(dragon)]));
    for (let i = 0; i < 20 && !s.stack.some((x) => x.kind === "ability"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.stack.at(-1)?.kind).toBe("ability");
    s.objects[ids[0]!]!.attachedTo = other;
    invalidateCharacteristics(s);
    s = settle(s);
    expect(name(s, mine)).toBe("Shivan Dragon");
    // Creatures entering now copy what it enchants now.
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(name(s, ids[1]!)).toBe("Elvish Visionary");
  });

  it("enchanting Kalonian Hydra, an entering creature is a copy of it and enters with its four counters", () => {
    const { s: s0, ap, opp, ids } = setup([reflection(), giant()]);
    const h = putOnBattlefield(s0, opp, hydra());
    s0.objects[h]!.counters["+1/+1"] = 4;
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(h)])));
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(name(s, ids[1]!)).toBe("Kalonian Hydra");
    expect(s.objects[ids[1]!]!.counters["+1/+1"]).toBe(4);
  });
});

describe("Lane B round B249: several copy effects", () => {
  it("with Essence of the Wild and Infinite Reflection both applying, its controller chooses which applies last", () => {
    const { s: s0, ap, opp, ids } = setup([reflection(), giant()]);
    const dragon = putOnBattlefield(s0, opp, shivan());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(dragon)])));
    // (Essence of the Wild already there would have become a Shivan Dragon too.)
    putOnBattlefield(s, ap, essence());
    invalidateCharacteristics(s);
    s = settle(run(s, planCast(s, ap, ids[1]!)), [ap]);
    const p = s.pending;
    expect(p?.kind === "chooseOption" && p.what).toBe("copyLast");
    if (p?.kind !== "chooseOption") throw new Error("no choice");
    expect(p.labels).toEqual(["A copy of Essence of the Wild (Essence of the Wild)", "A copy of Shivan Dragon (Infinite Reflection)"]);
    // How it enters waits for the choice.
    expect(s.objects[ids[1]!]!.copyOf).toBeUndefined();
    s = settle(act(s, { type: "chooseOption", player: ap, choice: p.options[1]! }), [ap]);
    expect(name(s, ids[1]!)).toBe("Shivan Dragon");
    expect(s.pending).toBeNull();
  });

  it("a bot picks the copy with the highest mana value", () => {
    const { s: s0, ap, opp, ids } = setup([reflection(), giant()]);
    const dragon = putOnBattlefield(s0, opp, giant());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(dragon)])));
    putOnBattlefield(s, ap, essence());
    invalidateCharacteristics(s);
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(name(s, ids[1]!)).toBe("Essence of the Wild");
  });

  it("Mystic Reflection's copy doesn't get the entering creature's own counters either (CR 616.1, rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([mystic(), hydra()]);
    const dragon = putOnBattlefield(s0, opp, shivan());
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(dragon)])));
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(name(s, ids[1]!)).toBe("Shivan Dragon");
    expect(s.objects[ids[1]!]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});

describe("Lane B round B249: The Prismatic Piper and Faceless One", () => {
  const deck = (n = 99) => [...Array.from({ length: n - 39 }, () => forest), ...Array.from({ length: 39 }, () => bear())];
  const game = (p: CardDef, color?: "W" | "U" | "B" | "R" | "G") =>
    createGame(["A", "B", "C", "D"].map((name, i) => (i === 0 ? { name, commander: p, ...(color ? { commanderColor: color } : {}), deck: deck() } : { name, commander: commander(`C${i}`), deck: deck() })), 7);

  it("as your commander, it's the color chosen before the game in every zone, and that color is its color identity", () => {
    supported(piper(), faceless(), clara());
    const s = game(piper(), "U");
    const id = s.players[0]!.command[0]!;
    expect(s.objects[id]!.pregameColor).toBe("U");
    expect(defOf(s, s.objects[id]!).colors).toEqual(["U"]);
    expect(commanderIdentity(s, 0)).toEqual(["U"]);
    moveObject(s, id, "hand");
    expect(defOf(s, s.objects[id]!).colors).toEqual(["U"]);
    moveObject(s, id, "battlefield");
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[id]!).colors).toEqual(["U"]);
    moveObject(s, id, "graveyard");
    expect(defOf(s, s.objects[id]!).colors).toEqual(["U"]);
    expect(s.objects[id]!.pregameColor).toBe("U");
  });

  it("Clara Oswald's Impossible Girl works the same way", () => {
    const s = game(clara(), "R");
    const id = s.players[0]!.command[0]!;
    expect(defOf(s, s.objects[id]!).colors).toEqual(["R"]);
    expect(commanderIdentity(s, 0)).toEqual(["R"]);
  });

  it("not your commander, or a copy of it, it's colorless", () => {
    const s = game(faceless(), "G");
    const other = putOnBattlefield(s, 1, piper());
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[other]!).colors).toEqual([]);
    const cmd = s.players[0]!.command[0]!;
    moveObject(s, cmd, "battlefield");
    const copy = putOnBattlefield(s, 0, bear({ name: "Copier" }));
    s.objects[copy]!.copyOf = s.objects[cmd]!.cardId;
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[cmd]!).colors).toEqual(["G"]);
    expect(characteristics(s, s.objects[copy]!).name).toBe("Faceless One");
    expect(characteristics(s, s.objects[copy]!).colors).toEqual([]);
  });

  it("a game can't start without the color chosen, nor with one for a commander that doesn't choose", () => {
    expect(() => game(piper())).toThrow(/choose its color/);
    expect(() => createGame(["A", "B", "C", "D"].map((name, i) => ({ name, commander: commander(`C${i}`), ...(i === 0 ? { commanderColor: "R" as const } : {}), deck: deck() })), 7)).toThrow(/doesn't have you choose a color/);
  });

  it("the chosen color is part of the deck's color identity, beside a partner or a Background", () => {
    const red = [...Array.from({ length: 98 }, () => forest), bolt()];
    expect(validateCommanderDeck(piper(), red, new Set(), undefined, ["R"])).toEqual([]);
    expect(validateCommanderDeck(piper(), red, new Set(), undefined, ["U"]).map((p) => p.problem)).toEqual(["outside the commander's color identity"]);
    expect(validateCommanderDeck(piper(), red).map((p) => p.problem)).toContain("needs its color chosen before the game begins (CR 903.4b)");
    // Partner with Kraum (blue and red): a black card needs black chosen for the Piper.
    const pair = [...Array.from({ length: 97 }, () => forest), counterspell()];
    expect(validateCommanderDeck(piper(), pair, new Set(), kraum(), ["B"])).toEqual([]);
    // Faceless One as the Background beside... it can choose a Background itself, so beside Candlekeep Sage.
    expect(validateCommanderDeck(faceless(), pair, new Set(), sage(), ["W"])).toEqual([]);
    const s = createGame(["A", "B", "C", "D"].map((name, i) => (i === 0 ? { name, commander: kraum(), secondCommander: piper(), secondCommanderColor: "B" as const, deck: deck(98) } : { name, commander: commander(`C${i}`), deck: deck() })), 7);
    expect(commanderIdentity(s, 0)).toEqual(["U", "B", "R"]);
  });
});
