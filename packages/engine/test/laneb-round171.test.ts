// Lane B round B171: "As ~ enters, exile ... from your graveyard" (CR 614.1c, 614.12a), the cards it exiled linked to its
// other abilities (CR 607.2b): Sutured Ghoul's power and toughness, their total (a characteristic-defining ability, CR
// 604.3); Living Lore's, the exiled card's mana value, and its "you may cast the exiled card without paying its mana cost";
// Frankenstein's Monster's X creature cards, a counter chosen for each, or the graveyard instead with too few (CR 609.3).
// Tetravus's +1/+1 counters made into Tetravite tokens and the tokens it created exiled for counters again (rulings), the
// tokens' "This token can't be enchanted" (CR 303.4).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup, swamp } from "./helpers";
import { botActions, characteristics, invalidateCharacteristics, isFullySupported, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const suturedGhoul = (): CardDef => ({"oracleId":"8b4715b0-63d9-4ff8-a667-21a762518687","name":"Sutured Ghoul","manaCost":"{4}{B}{B}{B}","cmc":7,"typeLine":"Creature — Zombie","supertypes":[],"types":["Creature"],"subtypes":["Zombie"],"oracleText":"Trample\nAs this creature enters, exile any number of creature cards from your graveyard.\nSutured Ghoul's power is equal to the total power of the exiled cards and its toughness is equal to their total toughness.","power":"*","toughness":"*","colors":["B"],"colorIdentity":["B"],"keywords":["Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/f/7/f769536f-def1-40b8-863f-ba12c7cb0d87.jpg?1783945121","artUrl":"https://cards.scryfall.io/art_crop/front/f/7/f769536f-def1-40b8-863f-ba12c7cb0d87.jpg?1783945121","commanderLegal":"legal","set":"jud","releasedAt":"2002-05-27","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const livingLore = (): CardDef => ({"oracleId":"7c48c341-1d56-4210-9d86-181ebb206098","name":"Living Lore","manaCost":"{3}{U}","cmc":4,"typeLine":"Creature — Avatar","supertypes":[],"types":["Creature"],"subtypes":["Avatar"],"oracleText":"As this creature enters, exile an instant or sorcery card from your graveyard.\nLiving Lore's power and toughness are each equal to the exiled card's mana value.\nWhenever this creature deals combat damage, you may sacrifice it. If you do, you may cast the exiled card without paying its mana cost.","power":"*","toughness":"*","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/f/8f658281-1c6c-4450-8d75-81714dbd0472.jpg?1783938606","artUrl":"https://cards.scryfall.io/art_crop/front/8/f/8f658281-1c6c-4450-8d75-81714dbd0472.jpg?1783938606","commanderLegal":"legal","set":"dtk","releasedAt":"2015-03-27","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const frankensteinsM = (): CardDef => ({"oracleId":"100218ce-1572-4bce-bb00-d2df5f68705c","name":"Frankenstein's Monster","manaCost":"{X}{B}{B}","cmc":2,"typeLine":"Creature — Zombie","supertypes":[],"types":["Creature"],"subtypes":["Zombie"],"oracleText":"As this creature enters, exile X creature cards from your graveyard. If you can't, put this creature into its owner's graveyard instead of onto the battlefield. For each creature card exiled this way, this creature enters with a +2/+0, +1/+1, or +0/+2 counter on it.","power":"0","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/f/8f99894d-5ece-44f1-acce-474494ae2084.jpg?1783947939","artUrl":"https://cards.scryfall.io/art_crop/front/8/f/8f99894d-5ece-44f1-acce-474494ae2084.jpg?1783947939","commanderLegal":"legal","set":"drk","releasedAt":"1994-08-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const dungroveElder = (): CardDef => ({"oracleId":"32083c9f-04c6-4b6f-9e24-cc8f3cae3e3e","name":"Dungrove Elder","manaCost":"{2}{G}","cmc":3,"typeLine":"Creature — Treefolk","supertypes":[],"types":["Creature"],"subtypes":["Treefolk"],"oracleText":"Hexproof (This creature can't be the target of spells or abilities your opponents control.)\nDungrove Elder's power and toughness are each equal to the number of Forests you control.","power":"*","toughness":"*","colors":["G"],"colorIdentity":["G"],"keywords":["Hexproof"],"imageUrl":"https://cards.scryfall.io/normal/front/b/8/b8b4ebbf-1613-42a0-97ff-2f36dc8d984a.jpg?1783941061","artUrl":"https://cards.scryfall.io/art_crop/front/b/8/b8b4ebbf-1613-42a0-97ff-2f36dc8d984a.jpg?1783941061","commanderLegal":"legal","set":"m12","releasedAt":"2011-07-15","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const unsummon = (): CardDef => ({"oracleId":"837182db-1bf3-4a2c-bd01-1af9d9873561","name":"Unsummon","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Return target creature to its owner's hand.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddad9f16-52d5-49de-82b0-b1a5294a9c44.jpg?1789556722","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddad9f16-52d5-49de-82b0-b1a5294a9c44.jpg?1789556722","commanderLegal":"legal","set":"fra","releasedAt":"2026-10-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const murder = (): CardDef => ({"oracleId":"938b4e2c-88d9-4637-bc00-e228920c9a78","name":"Murder","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","artUrl":"https://cards.scryfall.io/art_crop/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const tetravus = (): CardDef => ({"oracleId":"85255c26-4e74-4cf0-91a6-78ddba5abdc6","name":"Tetravus","manaCost":"{6}","cmc":6,"typeLine":"Artifact Creature — Construct","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Construct"],"oracleText":"Flying\nThis creature enters with three +1/+1 counters on it.\nAt the beginning of your upkeep, you may remove any number of +1/+1 counters from this creature. If you do, create that many 1/1 colorless Tetravite artifact creature tokens. They each have flying and \"This token can't be enchanted.\"\nAt the beginning of your upkeep, you may exile any number of tokens created with this creature. If you do, put that many +1/+1 counters on this creature.","power":"1","toughness":"1","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/2/3/23eb19f9-2e8f-4bf0-9bf8-868e6da70e2d.jpg?1783948357","artUrl":"https://cards.scryfall.io/art_crop/front/2/3/23eb19f9-2e8f-4bf0-9bf8-868e6da70e2d.jpg?1783948357","commanderLegal":"legal","set":"atq","releasedAt":"1994-03-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const pacifism = (): CardDef => ({"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const tgt = (id: string): TargetChoice => ({ kind: "object", id }) as TargetChoice;
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
/** A fresh copy of `def` in `zone` of `pid`. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const choose = (s: GameState, pid: PlayerId, choice: string) => settle(act(s, { type: "chooseOption", player: pid, choice }));
/** setup, with enough black mana for Sutured Ghoul. */
const ghoulSetup = (hand: CardDef[]) => {
  const r = setup(hand);
  for (let i = 0; i < 3; i++) putOnBattlefield(r.s, r.ap, swamp);
  return r;
};
/** Passes (no blocks) until `stop`. */
const combatUntil = (s: GameState, stop: (s: GameState) => boolean) => {
  for (let i = 0; i < 300 && !stop(s); i++) s = act(s, s.pending?.kind === "declareBlockers" ? { type: "declareBlockers", player: s.pending.player, blocks: [] } : { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("Sutured Ghoul: exile any number of creature cards from your graveyard as it enters; their total power and toughness", () => {
  it("compiles", () => supported(suturedGhoul()));

  it("asks one creature card at a time (not the instant), and is the total of those exiled", () => {
    const { s: s0, ap, ids } = ghoulSetup([suturedGhoul()]);
    const [b, g, l] = [into(s0, ap, grizzlyBears(), "graveyard"), into(s0, ap, hillGiant(), "graveyard"), into(s0, ap, lightningBolt(), "graveyard")];
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "exileFromYard", objectId: ids[0] });
    expect([...(s.pending as { options: string[] }).options].sort()).toEqual([b, g, "done"].sort());
    s = choose(s, ap, b);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "exileFromYard", options: [g, "done"] });
    s = choose(s, ap, g);
    // Nothing left to choose: both exiled together.
    expect(s.pending).toBeFalsy();
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.objects[g]!.zone).toBe("exile");
    expect(s.objects[l]!.zone).toBe("graveyard");
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(pt(s, ids[0]!)).toBe("5/5");
  });

  it("stops when you say so: only the cards chosen are exiled", () => {
    const { s: s0, ap, ids } = ghoulSetup([suturedGhoul()]);
    const [b, g] = [into(s0, ap, grizzlyBears(), "graveyard"), into(s0, ap, hillGiant(), "graveyard")];
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = choose(s, ap, g);
    s = choose(s, ap, "done");
    expect(s.pending).toBeFalsy();
    expect(s.objects[g]!.zone).toBe("exile");
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(pt(s, ids[0]!)).toBe("3/3");
  });

  it("exiling none, or with no creature cards there, it's 0/0 and dies (CR 704.5f)", () => {
    const { s: s0, ap, ids } = ghoulSetup([suturedGhoul()]);
    const b = into(s0, ap, grizzlyBears(), "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = choose(s, ap, "done");
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    const { s: t0, ap: ap2, ids: ids2 } = ghoulSetup([suturedGhoul()]);
    const t = settle(run(t0, planCast(t0, ap2, ids2[0]!)));
    expect(t.pending).toBeFalsy();
    expect(t.objects[ids2[0]!]!.zone).toBe("graveyard");
  });

  it("an exiled card's own characteristic-defining ability applies in exile (rulings: Dungrove Elder counts your Forests)", () => {
    const { s: s0, ap, ids } = ghoulSetup([suturedGhoul()]);
    const e = into(s0, ap, dungroveElder(), "graveyard");
    const forests = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.name === "Forest").length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = choose(s, ap, e);
    expect(s.objects[e]!.zone).toBe("exile");
    expect(pt(s, ids[0]!)).toBe(`${forests}/${forests}`);
  });

  it("once it leaves the battlefield it's a new object with nothing linked: 0/0 in your hand, the cards stay exiled (rulings)", () => {
    const { s: s0, ap, ids } = ghoulSetup([suturedGhoul(), unsummon()]);
    const g = into(s0, ap, hillGiant(), "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = choose(s, ap, g);
    expect(pt(s, ids[0]!)).toBe("3/3");
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(ids[0]!)])));
    expect(s.objects[ids[0]!]!.zone).toBe("hand");
    expect(pt(s, ids[0]!)).toBe("0/0");
    expect(s.objects[g]!.zone).toBe("exile");
  });

  it("the bot exiles every creature card that adds to it, and doesn't cast it with none in its graveyard", () => {
    const { s: s0, ap, ids } = ghoulSetup([suturedGhoul()]);
    expect(botActions(s0, ap).some((a) => a.type === "castSpell" && a.objectId === ids[0])).toBe(false);
    const [b, g] = [into(s0, ap, grizzlyBears(), "graveyard"), into(s0, ap, hillGiant(), "graveyard")];
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    for (let i = 0; i < 5 && s.pending; i++) {
      const acts = botActions(s, ap);
      for (const a of acts) s = act(s, a);
      s = settle(s);
    }
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.objects[g]!.zone).toBe("exile");
    expect(pt(s, ids[0]!)).toBe("5/5");
  });
});

describe("Living Lore: exile an instant or sorcery card from your graveyard as it enters; its mana value, and cast it for free", () => {
  it("compiles", () => supported(livingLore()));

  it("only instant and sorcery cards are offered; it's as big as the one exiled's mana value", () => {
    const { s: s0, ap, ids } = setup([livingLore()]);
    const [d, l, b] = [into(s0, ap, divination(), "graveyard"), into(s0, ap, lightningBolt(), "graveyard"), into(s0, ap, grizzlyBears(), "graveyard")];
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "exileFromYard" });
    // One must be exiled, so no "none".
    expect([...(s.pending as { options: string[] }).options].sort()).toEqual([d, l].sort());
    s = choose(s, ap, d);
    expect(s.pending).toBeFalsy();
    expect(s.objects[d]!.zone).toBe("exile");
    expect(s.objects[l]!.zone).toBe("graveyard");
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(pt(s, ids[0]!)).toBe("3/3");
  });

  it("with only one, that one; with none, it's 0/0 and dies (rulings)", () => {
    const { s: s0, ap, ids } = setup([livingLore()]);
    const l = into(s0, ap, lightningBolt(), "graveyard");
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeFalsy();
    expect(s.objects[l]!.zone).toBe("exile");
    expect(pt(s, ids[0]!)).toBe("1/1");
    const { s: t0, ap: ap2, ids: ids2 } = setup([livingLore()]);
    const t = settle(run(t0, planCast(t0, ap2, ids2[0]!)));
    expect(t.objects[ids2[0]!]!.zone).toBe("graveyard");
  });

  it("when it deals combat damage you may sacrifice it, then cast the exiled card without paying its mana cost", () => {
    const { s: s0, ap, ids } = setup([livingLore()]);
    const d = into(s0, ap, divination(), "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(pt(s, ids[0]!)).toBe("3/3");
    s.objects[ids[0]!]!.summoningSick = false;
    const opp = s.turnOrder.find((p) => p !== ap)!;
    s = passUntil(s, "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: ids[0]!, defender: opp }] });
    s = combatUntil(s, (x) => x.pending?.kind === "chooseMay");
    expect(s.players[opp]!.life).toBe(37);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: d });
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "castSpell", player: ap, objectId: d }));
    expect(s.objects[d]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand).toHaveLength(hand + 2);
  });

  it("not sacrificing it, nothing is cast and the card stays exiled", () => {
    const { s: s0, ap, ids } = setup([livingLore()]);
    const d = into(s0, ap, divination(), "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s.objects[ids[0]!]!.summoningSick = false;
    const opp = s.turnOrder.find((p) => p !== ap)!;
    s = passUntil(s, "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: ids[0]!, defender: opp }] });
    s = combatUntil(s, (x) => x.pending?.kind === "chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.objects[d]!.zone).toBe("exile");
  });
});

describe("Frankenstein's Monster: exile X creature cards as it enters, a +2/+0, +1/+1 or +0/+2 counter for each, or the graveyard", () => {
  it("compiles", () => supported(frankensteinsM()));

  it("X 2 of three creature cards: two chosen, then a counter for each", () => {
    const { s: s0, ap, ids } = setup([frankensteinsM()]);
    const [b, g, e] = [into(s0, ap, grizzlyBears(), "graveyard"), into(s0, ap, hillGiant(), "graveyard"), into(s0, ap, dungroveElder(), "graveyard")];
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 2)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "exileFromYard" });
    // Exactly two, so no "none".
    expect([...(s.pending as { options: string[] }).options].sort()).toEqual([b, g, e].sort());
    s = choose(s, ap, b);
    s = choose(s, ap, g);
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.objects[g]!.zone).toBe("exile");
    expect(s.objects[e]!.zone).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "counterChoice", options: ["+2/+0", "+1/+1", "+0/+2"] });
    s = choose(s, ap, "+2/+0");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "counterChoice" });
    s = choose(s, ap, "+0/+2");
    expect(s.pending).toBeFalsy();
    expect(s.objects[ids[0]!]!.counters).toMatchObject({ "+2/+0": 1, "+0/+2": 1 });
    expect(pt(s, ids[0]!)).toBe("2/3");
  });

  it("with exactly X there's nothing to choose but the counters", () => {
    const { s: s0, ap, ids } = setup([frankensteinsM()]);
    const b = into(s0, ap, grizzlyBears(), "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 1)));
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "counterChoice" });
    s = choose(s, ap, "+1/+1");
    expect(pt(s, ids[0]!)).toBe("1/2");
  });

  it("with fewer creature cards than X, those there are exiled (CR 609.3) and it goes to the graveyard instead", () => {
    const { s: s0, ap, ids } = setup([frankensteinsM()]);
    const [b, g] = [into(s0, ap, grizzlyBears(), "graveyard"), into(s0, ap, hillGiant(), "graveyard")];
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 3)));
    expect(s.pending).toBeFalsy();
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.battlefield).not.toContain(ids[0]);
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.objects[g]!.zone).toBe("exile");
  });

  it("X 0 exiles nothing: a 0/1", () => {
    const { s: s0, ap, ids } = setup([frankensteinsM()]);
    const b = into(s0, ap, grizzlyBears(), "graveyard");
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 0)));
    expect(s.pending).toBeFalsy();
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(pt(s, ids[0]!)).toBe("0/1");
  });

  it("the bot casts it with no more X than its creature cards in the graveyard", () => {
    const { s: s0, ap, ids } = setup([frankensteinsM()]);
    // Only it to cast (no commander either).
    s0.players[ap]!.hand = [ids[0]!];
    s0.players[ap]!.command = [];
    expect(botActions(s0, ap).some((a) => a.type === "castSpell" && a.objectId === ids[0])).toBe(false);
    into(s0, ap, grizzlyBears(), "graveyard");
    into(s0, ap, hillGiant(), "graveyard");
    const acts = botActions(s0, ap);
    const cast = acts.find((a) => a.type === "castSpell" && a.objectId === ids[0]);
    expect(cast).toBeDefined();
    expect((cast as { x?: number }).x).toBe(2);
    let s = s0;
    for (const a of acts) s = act(s, a);
    s = settle(s);
    for (let i = 0; i < 6 && s.pending; i++) {
      for (const a of botActions(s, ap)) s = act(s, a);
      s = settle(s);
    }
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(pt(s, ids[0]!)).toBe("2/3");
  });
});

/** To `pid`'s next upkeep, its triggers resolved as far as they go without a question. */
const nextUpkeep = (s: GameState, pid: PlayerId) => {
  if (s.step === "upkeep" && s.activePlayer === pid) s = passUntil(s, "draw", pid);
  return settle(passUntil(s, "upkeep", pid));
};
const tokensOf = (s: GameState, src: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.createdWith?.id === src);

describe("Tetravus: +1/+1 counters into Tetravite tokens at your upkeep, and the tokens it created exiled for counters", () => {
  it("compiles, its Tetravites too", () => supported(tetravus()));

  it("remove two of its three counters: two 1/1 flying Tetravites; next upkeep, exile one of them for a counter back", () => {
    const { s: s0, opp } = setup([]);
    const t = putOnBattlefield(s0, opp, tetravus());
    s0.objects[t]!.counters["+1/+1"] = 3;
    invalidateCharacteristics(s0);
    let s = nextUpkeep(s0, opp);
    // No tokens yet, so its other upkeep ability had nothing to exile; now the counters.
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "removeCounter", about: t, options: ["+1/+1", "done"] });
    s = choose(s, opp, "+1/+1");
    s = choose(s, opp, "+1/+1");
    s = choose(s, opp, "done");
    expect(s.pending).toBeFalsy();
    expect(s.objects[t]!.counters["+1/+1"]).toBe(1);
    const made = tokensOf(s, t);
    expect(made).toHaveLength(2);
    for (const id of made) {
      expect(s.cards[s.objects[id]!.cardId]!.name).toMatch(/^Tetravite/);
      expect(pt(s, id)).toBe("1/1");
      expect(characteristics(s, s.objects[id]!).keywords).toContain("Flying");
      expect(characteristics(s, s.objects[id]!).types).toEqual(["Artifact", "Creature"]);
    }
    s = nextUpkeep(s, opp);
    for (let i = 0; i < 4 && s.pending?.kind === "chooseOption"; i++) s = choose(s, opp, "done");
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: opp, action: "exile", min: 0 });
    expect([...(s.pending as { options: string[] }).options].sort()).toEqual([...made].sort());
    s = settle(act(s, { type: "pickPermanents", player: opp, ids: [made[0]!] }));
    for (let i = 0; i < 4 && s.pending?.kind === "chooseOption"; i++) s = choose(s, opp, "done");
    expect(s.pending).toBeFalsy();
    expect(s.battlefield).not.toContain(made[0]);
    expect(s.battlefield).toContain(made[1]);
    expect(s.objects[t]!.counters["+1/+1"]).toBe(2);
  });

  it("removing none makes no tokens; another Tetravus's tokens aren't offered (rulings)", () => {
    const { s: s0, opp } = setup([]);
    const [a, b] = [putOnBattlefield(s0, opp, tetravus()), putOnBattlefield(s0, opp, tetravus())];
    s0.objects[a]!.counters["+1/+1"] = 1;
    s0.objects[b]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s0);
    let s = nextUpkeep(s0, opp);
    // Each Tetravus asks about its own counter: A's makes a token, B's doesn't.
    for (let i = 0; i < 6 && s.pending; i++) {
      const p = s.pending as { kind: string; about?: string; options: string[] };
      if (p.kind !== "chooseOption") break;
      s = choose(s, opp, p.about === a && s.objects[a]!.counters["+1/+1"] === 1 ? "+1/+1" : "done");
    }
    expect(s.pending).toBeFalsy();
    expect(tokensOf(s, a)).toHaveLength(1);
    expect(tokensOf(s, b)).toHaveLength(0);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
    s = nextUpkeep(s, opp);
    // Only A's exile ability has a token to offer.
    const asked: string[][] = [];
    for (let i = 0; i < 8 && s.pending; i++) {
      if (s.pending.kind === "pickPermanents") {
        asked.push([...s.pending.options]);
        s = settle(act(s, { type: "pickPermanents", player: opp, ids: [] }));
      } else if (s.pending.kind === "chooseOption") s = choose(s, opp, "done");
      else break;
    }
    expect(asked).toEqual([tokensOf(s, a)]);
  });

  it("a Tetravite can't be enchanted: Pacifism cast on it goes to the graveyard instead (CR 303.4i)", () => {
    const { s: s0, ap } = setup([pacifism()]);
    const t = putOnBattlefield(s0, ap, tetravus());
    s0.objects[t]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s0);
    let s = nextUpkeep(s0, ap);
    for (let i = 0; i < 4 && s.pending?.kind === "chooseOption"; i++) s = choose(s, ap, s.pending.what === "removeCounter" && s.pending.options.includes("+1/+1") && s.objects[t]!.counters["+1/+1"] === 1 ? "+1/+1" : "done");
    s = passUntil(settle(s), "main1", ap);
    const [tok] = tokensOf(s, t);
    expect(tok).toBeDefined();
    const pac = s.players[ap]!.hand.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Pacifism")!;
    // Its enchant ability allows the target (CR 115.1b); it can't become attached, so it goes to the graveyard (CR 303.4i).
    s = settle(run(s, planCast(s, ap, pac, [tgt(tok!)])));
    expect(s.battlefield.some((id) => s.objects[id]!.attachedTo === tok)).toBe(false);
    expect(s.objects[pac]!.zone).toBe("graveyard");
    expect(s.objects[tok!]!.zone).toBe("battlefield");
  });
});
