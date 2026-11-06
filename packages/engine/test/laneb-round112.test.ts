// Lane B round B112: Ancient Hellkite ("target creature defending player controls" while it's attacking), Encumbered
// Reejerey (a trigger only while it has a -1/-1 counter), Warren Weirding ("if a Goblin is sacrificed this way"),
// Bloodfire Infusion and Betrothed of Fire ("Sacrifice enchanted creature" as a cost), Artificer's Hex (the creature the
// enchanted Equipment is attached to), Mind Roots (a land card among the cards discarded), Serene Sunset (X target
// creatures), Apathy (that player may discard a card at random), Entrails Feaster ("a creature card from a graveyard"),
// Lurebound Scarecrow ("no permanents of the chosen color"), Empty-Shrine Kannushi and Pledge of Loyalty (protection from
// each color among permanents you control).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, botActions, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
const next = (s: GameState, p: PlayerId, n = 1) => s.turnOrder[(s.turnOrder.indexOf(p) + n) % 4]!;
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
/** Moves a new card for `def` from the battlefield into `pid`'s `zone` (on top of a library). */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const attach = (s: GameState, aura: string, to: string) => {
  s.objects[aura]!.attachedTo = to;
  invalidateCharacteristics(s);
};
/** To the next upkeep of `pid`, from wherever the game is now. */
const toUpkeep = (s: GameState, pid: PlayerId) => passUntil(passUntil(s, "end", s.activePlayer), "upkeep", pid);

// Real oracle text (Scryfall).
const hellkite = (): CardDef => ({"oracleId":"de672a4b-07eb-4be8-a03f-23dfbb7ac0fa","name":"Ancient Hellkite","manaCost":"{4}{R}{R}{R}","cmc":7,"typeLine":"Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying\n{R}: This creature deals 1 damage to target creature defending player controls. Activate only if this creature is attacking.","power":"6","toughness":"6","colors":["R"],"colorIdentity":["R"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/9/6/96cede38-0f02-4ce0-b947-ce3d7d7c2882.jpg?1783941809","artUrl":"https://cards.scryfall.io/art_crop/front/9/6/96cede38-0f02-4ce0-b947-ce3d7d7c2882.jpg?1783941809","commanderLegal":"legal","set":"m11","releasedAt":"2010-07-16","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const apathy = (): CardDef => ({"oracleId":"09ac5adf-f722-417e-b0fc-7ed0d8c9abd6","name":"Apathy","manaCost":"{U}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature doesn't untap during its controller's untap step.\nAt the beginning of the upkeep of enchanted creature's controller, that player may discard a card at random. If the player does, untap that creature.","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/a/d/adf3a6fe-e234-4c3f-96fc-3eb5eb22c0b8.jpg?1783946743","artUrl":"https://cards.scryfall.io/art_crop/front/a/d/adf3a6fe-e234-4c3f-96fc-3eb5eb22c0b8.jpg?1783946743","commanderLegal":"legal","set":"wth","releasedAt":"1997-06-09","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const hex = (): CardDef => ({"oracleId":"d14d9f44-9cff-4a11-be86-0cea5fe9b551","name":"Artificer's Hex","manaCost":"{B}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant Equipment\nAt the beginning of your upkeep, if enchanted Equipment is attached to a creature, destroy that creature.","colors":["B"],"colorIdentity":["B"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/3/a/3a5cd9a1-da2e-44ef-9f2e-352dc9f92c50.jpg?1783939927","artUrl":"https://cards.scryfall.io/art_crop/front/3/a/3a5cd9a1-da2e-44ef-9f2e-352dc9f92c50.jpg?1783939927","commanderLegal":"legal","set":"m14","releasedAt":"2013-07-19","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const betrothed = (): CardDef => ({"oracleId":"77849657-c872-4d54-9149-a08bbe90f787","name":"Betrothed of Fire","manaCost":"{1}{R}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nSacrifice an untapped creature: Enchanted creature gets +2/+0 until end of turn.\nSacrifice enchanted creature: Creatures you control get +2/+0 until end of turn.","colors":["R"],"colorIdentity":["R"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/5/e/5e517aa4-d8ba-4a49-bf9f-172bf029fa52.jpg?1783946729","artUrl":"https://cards.scryfall.io/art_crop/front/5/e/5e517aa4-d8ba-4a49-bf9f-172bf029fa52.jpg?1783946729","commanderLegal":"legal","set":"wth","releasedAt":"1997-06-09","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const infusion = (): CardDef => ({"oracleId":"d5bd7c0b-c412-47ed-afb8-1a9ba04be77c","name":"Bloodfire Infusion","manaCost":"{2}{R}","cmc":3,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature you control\n{R}, Sacrifice enchanted creature: This Aura deals damage equal to the sacrificed creature's power to each creature.","colors":["R"],"colorIdentity":["R"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/2/6/2639e9b7-ed8c-48fd-a8b7-b99d8dad4bc0.jpg?1783945345","artUrl":"https://cards.scryfall.io/art_crop/front/2/6/2639e9b7-ed8c-48fd-a8b7-b99d8dad4bc0.jpg?1783945345","commanderLegal":"legal","set":"apc","releasedAt":"2001-06-04","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const kannushi = (): CardDef => ({"oracleId":"39a32629-8b05-4539-9ce7-1a6e467d0064","name":"Empty-Shrine Kannushi","manaCost":"{W}","cmc":1,"typeLine":"Creature — Human Cleric","supertypes":[],"types":["Creature"],"subtypes":["Human","Cleric"],"oracleText":"This creature has protection from each color among permanents you control.","power":"1","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/6/86c2e405-afe2-4de2-9e45-c5f357d788ac.jpg?1783944216","artUrl":"https://cards.scryfall.io/art_crop/front/8/6/86c2e405-afe2-4de2-9e45-c5f357d788ac.jpg?1783944216","commanderLegal":"legal","set":"bok","releasedAt":"2005-02-04","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const reejerey = (): CardDef => ({"oracleId":"7668f7bc-9a43-4024-87c3-995aa0a65aaa","name":"Encumbered Reejerey","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Merfolk Soldier","supertypes":[],"types":["Creature"],"subtypes":["Merfolk","Soldier"],"oracleText":"This creature enters with three -1/-1 counters on it.\nWhenever this creature becomes tapped while it has a -1/-1 counter on it, remove a -1/-1 counter from it.","power":"5","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/5/15ff6797-f59c-4333-98ea-5711150fd5b8.jpg?1783904507","artUrl":"https://cards.scryfall.io/art_crop/front/1/5/15ff6797-f59c-4333-98ea-5711150fd5b8.jpg?1783904507","commanderLegal":"legal","set":"ecl","releasedAt":"2026-01-23","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const feaster = (): CardDef => ({"oracleId":"a1ef35fe-46a7-4456-b194-24779b8fde68","name":"Entrails Feaster","manaCost":"{B}","cmc":1,"typeLine":"Creature — Zombie Cat","supertypes":[],"types":["Creature"],"subtypes":["Zombie","Cat"],"oracleText":"At the beginning of your upkeep, you may exile a creature card from a graveyard. If you do, put a +1/+1 counter on this creature. If you don't, tap this creature.","power":"1","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/d/cdddab92-3e1f-49dc-afd0-8c84d0d952c2.jpg?1783945069","artUrl":"https://cards.scryfall.io/art_crop/front/c/d/cdddab92-3e1f-49dc-afd0-8c84d0d952c2.jpg?1783945069","commanderLegal":"legal","set":"ons","releasedAt":"2002-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const scarecrow = (): CardDef => ({"oracleId":"8353f834-678a-4fa1-857a-8bfdfb8d6378","name":"Lurebound Scarecrow","manaCost":"{3}","cmc":3,"typeLine":"Artifact Creature — Scarecrow","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Scarecrow"],"oracleText":"As this creature enters, choose a color.\nWhen you control no permanents of the chosen color, sacrifice this creature.","power":"4","toughness":"4","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/9/89503bf6-d720-4fd5-b2cf-fc1197bf0f16.jpg?1783942711","artUrl":"https://cards.scryfall.io/art_crop/front/8/9/89503bf6-d720-4fd5-b2cf-fc1197bf0f16.jpg?1783942711","commanderLegal":"legal","set":"shm","releasedAt":"2008-05-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const roots = (): CardDef => ({"oracleId":"5d32dbf3-c157-4543-8813-da88f463de0e","name":"Mind Roots","manaCost":"{1}{B}{G}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target player discards two cards. Put up to one land card discarded this way onto the battlefield tapped under your control.","colors":["B","G"],"colorIdentity":["B","G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/d/9d5fdbda-ebbe-45d6-a668-5ddee057a063.jpg?1783903639","artUrl":"https://cards.scryfall.io/art_crop/front/9/d/9d5fdbda-ebbe-45d6-a668-5ddee057a063.jpg?1783903639","commanderLegal":"legal","set":"sos","releasedAt":"2026-04-24","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const pledge = (): CardDef => ({"oracleId":"e88b3066-eb10-4ade-8207-af4de40facec","name":"Pledge of Loyalty","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature has protection from each color among permanents you control. This effect doesn't remove this Aura.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/d/6/d6f98c26-5b30-400c-8af1-8c6c43065f63.jpg?1783945714","artUrl":"https://cards.scryfall.io/art_crop/front/d/6/d6f98c26-5b30-400c-8af1-8c6c43065f63.jpg?1783945714","commanderLegal":"legal","set":"inv","releasedAt":"2000-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const sunset = (): CardDef => ({"oracleId":"e2ef027d-0ef7-4c8b-a594-3918290b02d9","name":"Serene Sunset","manaCost":"{X}{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Prevent all combat damage X target creatures would deal this turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/a/0a6ded26-b748-406d-8740-9b8590be2bb1.jpg?1783945107","artUrl":"https://cards.scryfall.io/art_crop/front/0/a/0a6ded26-b748-406d-8740-9b8590be2bb1.jpg?1783945107","commanderLegal":"legal","set":"jud","releasedAt":"2002-05-27","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const weirding = (): CardDef => ({"oracleId":"d9c1c4d5-cc60-4762-9fc1-c768a1f61539","name":"Warren Weirding","manaCost":"{1}{B}","cmc":2,"typeLine":"Kindred Sorcery — Goblin","supertypes":[],"types":["Kindred","Sorcery"],"subtypes":["Goblin"],"oracleText":"Target player sacrifices a creature of their choice. If a Goblin is sacrificed this way, that player creates two 1/1 black Goblin Rogue creature tokens, and those tokens gain haste until end of turn.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/0/b0c1288b-5515-497f-b15d-520a29322f5b.jpg?1783942788","artUrl":"https://cards.scryfall.io/art_crop/front/b/0/b0c1288b-5515-497f-b15d-520a29322f5b.jpg?1783942788","commanderLegal":"legal","set":"mor","releasedAt":"2008-02-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

// Test cards.
const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { cmc: 3, power: "3", toughness: "3", colors: ["R"] });
const giant = card("Test Giant", "Creature — Giant", "{4}{G}", { cmc: 5, power: "6", toughness: "6", colors: ["G"] });
const goblin = card("Test Goblin", "Creature — Goblin", "{R}", { cmc: 1, power: "1", toughness: "1", colors: ["R"] });
const shifter = card("Test Shifter", "Creature — Shapeshifter", "{1}", { cmc: 1, power: "1", toughness: "1", keywords: ["Changeling"], oracleText: "Changeling (This card is every creature type.)" });
const tapper = card("Test Tapper", "Instant", "{0}", { oracleText: "Tap target creature." });
const untapper = card("Test Untapper", "Instant", "{0}", { oracleText: "Untap target creature." });
const bolt = card("Test Bolt", "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: "Test Bolt deals 3 damage to any target." });
const kill = card("Test Kill", "Instant", "{0}", { oracleText: "Destroy target creature." });
const sword = card("Test Sword", "Artifact — Equipment", "{1}", { cmc: 1, oracleText: "Equipped creature gets +1/+0.\nEquip {1}" });
const land = card("Test Wastes", "Land", "", { oracleText: "{T}: Add {C}." });
const glory = card("Test Glory", "Enchantment", "{W}", { cmc: 1, colors: ["W"] });

describe("Lane B round B112", () => {
  it("all thirteen cards are supported", () =>
    supported(hellkite(), reejerey(), weirding(), infusion(), betrothed(), hex(), roots(), sunset(), apathy(), feaster(), scarecrow(), kannushi(), pledge()));

  it("Ancient Hellkite: only while it's attacking, and only at a creature the player it's attacking controls", () => {
    let { s, ap, opp } = setup([]);
    const other = next(s, ap, 2);
    const hk = putOnBattlefield(s, ap, hellkite());
    const theirs = putOnBattlefield(s, opp, bear());
    const elsewhere = putOnBattlefield(s, other, bear());
    const mine = putOnBattlefield(s, ap, bear());
    // Not attacking: it can't be activated.
    expect(planActivate(s, ap, hk, 0, [tgt(theirs)])).toBeNull();
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: hk, defender: opp }] });
    // Defending player is the player it's attacking (CR 506.2): not another opponent's creature, not yours.
    expect(planActivate(s, ap, hk, 0, [tgt(elsewhere)])).toBeNull();
    expect(planActivate(s, ap, hk, 0, [tgt(mine)])).toBeNull();
    s = settle(run(s, planActivate(s, ap, hk, 0, [tgt(theirs)])));
    expect(s.objects[theirs]!.damage).toBe(1);
  });

  it("Ancient Hellkite: the target stops being legal once it's no longer attacking", () => {
    let { s, ap, opp } = setup([]);
    const hk = putOnBattlefield(s, ap, hellkite());
    const theirs = putOnBattlefield(s, opp, bear());
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: hk, defender: opp }] });
    s = run(s, planActivate(s, ap, hk, 0, [tgt(theirs)]));
    // Removed from combat in response: no defending player any more, so the ability's target is illegal (CR 608.2b).
    s.objects[hk]!.attacking = undefined;
    invalidateCharacteristics(s);
    s = settle(s);
    expect(s.objects[theirs]!.damage).toBe(0);
  });

  it("Encumbered Reejerey: becoming tapped removes a -1/-1 counter, only while it has one", () => {
    let { s, ap, ids } = setup([tapper, untapper, tapper, untapper, tapper]);
    const r = putOnBattlefield(s, ap, reejerey());
    s.objects[r]!.counters["-1/-1"] = 1;
    invalidateCharacteristics(s);
    const before = pt(s, r);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(r)])));
    expect(s.objects[r]!.tapped).toBe(true);
    expect(s.objects[r]!.counters["-1/-1"] ?? 0).toBe(0);
    expect(pt(s, r)).not.toBe(before);
    expect(s.log.some((l) => /^Encumbered Reejerey's ability triggers/.test(l.text))).toBe(true);
    // With no -1/-1 counter as it becomes tapped, it doesn't trigger at all.
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(r)])));
    const log = s.log.length;
    s = settle(run(s, planCast(s, ap, ids[2]!, [tgt(r)])));
    expect(s.objects[r]!.tapped).toBe(true);
    expect(s.log.slice(log).some((l) => /^Encumbered Reejerey's ability triggers/.test(l.text))).toBe(false);
  });

  it("Warren Weirding: a Goblin sacrificed this way gives its controller two hasty 1/1 Goblin Rogues; another creature doesn't", () => {
    for (const [def, tokens] of [[goblin, 2], [shifter, 2], [bear(), 0]] as const) {
      let { s, ap, opp, ids } = setup([weirding()]);
      putOnBattlefield(s, opp, def);
      s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])));
      const made = s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === opp);
      expect(made.length, def.name).toBe(tokens);
      for (const id of made) {
        expect(characteristics(s, s.objects[id]!).subtypes).toEqual(["Goblin", "Rogue"]);
        expect(objHasKeyword(s, s.objects[id]!, "Haste")).toBe(true);
      }
      expect(s.battlefield.some((id) => !s.objects[id]!.isToken && s.cards[s.objects[id]!.cardId]!.name === def.name)).toBe(false);
    }
  });

  it("Bloodfire Infusion: sacrificing the enchanted creature deals its power to each creature", () => {
    let { s, ap, opp } = setup([]);
    const o = putOnBattlefield(s, ap, ogre);
    const g = putOnBattlefield(s, ap, giant);
    const theirs = putOnBattlefield(s, opp, bear());
    const aura = putOnBattlefield(s, ap, infusion());
    attach(s, aura, o);
    // Only the enchanted creature can pay the cost.
    expect(planActivate(s, ap, aura, 0, [], undefined, undefined, undefined, { sacrifice: [g] })).toBeNull();
    s = settle(run(s, planActivate(s, ap, aura, 0, [], undefined, undefined, undefined, { sacrifice: [o] })));
    expect(zone(s, o)).toBe("graveyard");
    expect(zone(s, aura)).toBe("graveyard");
    expect(zone(s, theirs)).toBe("graveyard");
    expect(s.objects[g]!.damage).toBe(3);
  });

  it("Bloodfire Infusion: on a creature you don't control, nobody can activate it", () => {
    let { s, ap, opp } = setup([]);
    const theirs = putOnBattlefield(s, opp, ogre);
    const aura = putOnBattlefield(s, ap, infusion());
    attach(s, aura, theirs);
    expect(planActivate(s, ap, aura, 0, [])).toBeNull();
    expect(planActivate(s, ap, aura, 0, [], undefined, undefined, undefined, { sacrifice: [theirs] })).toBeNull();
  });

  it("Betrothed of Fire: sacrificing the enchanted creature pumps your other creatures; an untapped creature pumps it", () => {
    let { s, ap } = setup([]);
    const b = putOnBattlefield(s, ap, bear());
    const g = putOnBattlefield(s, ap, giant);
    const o = putOnBattlefield(s, ap, ogre);
    const aura = putOnBattlefield(s, ap, betrothed());
    attach(s, aura, b);
    s = settle(run(s, planActivate(s, ap, aura, 0, [], undefined, undefined, undefined, { sacrifice: [o] })));
    expect(pt(s, b)).toBe("4/2");
    expect(planActivate(s, ap, aura, 1, [], undefined, undefined, undefined, { sacrifice: [g] })).toBeNull();
    s = settle(run(s, planActivate(s, ap, aura, 1, [], undefined, undefined, undefined, { sacrifice: [b] })));
    expect(zone(s, b)).toBe("graveyard");
    expect(pt(s, g)).toBe("8/6");
  });

  it("Artificer's Hex: at your upkeep, destroys the creature the enchanted Equipment is attached to", () => {
    let { s, ap, opp } = setup([]);
    const b = putOnBattlefield(s, opp, bear());
    const eq = putOnBattlefield(s, opp, sword);
    attach(s, eq, b);
    const aura = putOnBattlefield(s, ap, hex());
    attach(s, aura, eq);
    // Not at the Equipment's controller's upkeep: its own controller's.
    s = settle(passUntil(s, "upkeep", opp));
    expect(zone(s, b)).toBe("battlefield");
    s = settle(toUpkeep(s, ap));
    expect(zone(s, b)).toBe("graveyard");
    expect(zone(s, eq)).toBe("battlefield");
  });

  it("Artificer's Hex: checked again as it resolves; an unattached Equipment doesn't trigger it", () => {
    let { s, ap, opp } = setup([]);
    const b = putOnBattlefield(s, opp, bear());
    const eq = putOnBattlefield(s, opp, sword);
    const aura = putOnBattlefield(s, ap, hex());
    attach(s, aura, eq);
    s = toUpkeep(s, ap);
    expect(s.triggerQueue.length + s.stack.length).toBe(0);
    s = settle(s);
    // Attached as the upkeep begins, unattached before it resolves: nothing is destroyed (rulings).
    attach(s, eq, b);
    s = toUpkeep(s, ap);
    expect(s.triggerQueue.length + s.stack.length).toBeGreaterThan(0);
    s.objects[eq]!.attachedTo = undefined;
    invalidateCharacteristics(s);
    s = settle(s);
    expect(zone(s, b)).toBe("battlefield");
  });

  it("Mind Roots: you may put one land card the target player discarded onto the battlefield tapped under your control", () => {
    let { s, ap, opp, ids } = setup([roots()]);
    s.players[opp]!.hand = [];
    const old = into(s, opp, land, "graveyard");
    const l = into(s, opp, land, "hand");
    const b = into(s, opp, bear(), "hand");
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])), { me: [ap] });
    expect(zone(s, b)).toBe("graveyard");
    // Only the land card discarded this way, not one already there.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 1, cards: [l] });
    expect((s.pending as { cards: string[] }).cards).not.toContain(old);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [l] }));
    expect(zone(s, l)).toBe("battlefield");
    expect(s.objects[l]!.tapped).toBe(true);
    expect(characteristics(s, s.objects[l]!).controller).toBe(ap);
    expect(s.objects[l]!.owner).toBe(opp);
  });

  it("Serene Sunset: prevents the combat damage X target creatures would deal this turn, not the others'", () => {
    let { s, ap, opp, ids } = setup([sunset()]);
    const a = putOnBattlefield(s, ap, bear());
    const b = putOnBattlefield(s, ap, bear());
    const c = putOnBattlefield(s, ap, ogre);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [a, b, c].map((x) => ({ attacker: x, defender: opp })) });
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(a), tgt(c)], undefined, undefined, 2)));
    for (let i = 0; i < 80 && s.step !== "main2"; i++) {
      const p = s.pending;
      if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
      else if (p) for (const x of botActions(s, p.player)) s = act(s, x);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.players[opp]!.life).toBe(life - 2);
  });

  it("Apathy: the enchanted creature stays tapped unless its controller discards a card at random at their upkeep", () => {
    let { s, ap, opp } = setup([]);
    const b = putOnBattlefield(s, opp, bear());
    s.objects[b]!.tapped = true;
    const aura = putOnBattlefield(s, ap, apathy());
    attach(s, aura, b);
    s.players[opp]!.hand = [];
    const card1 = into(s, opp, land, "hand");
    s = settle(passUntil(s, "upkeep", opp), { me: [opp] });
    // It didn't untap in the untap step; its controller is asked at their upkeep.
    expect(s.objects[b]!.tapped).toBe(true);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp });
    s = settle(act(s, { type: "chooseMay", player: opp, yes: true }), { me: [opp] });
    expect(zone(s, card1)).toBe("graveyard");
    expect(s.objects[b]!.tapped).toBe(false);
  });

  it("Apathy: declining, or having no card to discard, leaves the creature tapped", () => {
    let { s, ap, opp } = setup([]);
    const b = putOnBattlefield(s, opp, bear());
    s.objects[b]!.tapped = true;
    const aura = putOnBattlefield(s, ap, apathy());
    attach(s, aura, b);
    s.players[opp]!.hand = [];
    const card1 = into(s, opp, land, "hand");
    s = settle(passUntil(s, "upkeep", opp), { me: [opp] });
    s = settle(act(s, { type: "chooseMay", player: opp, yes: false }), { me: [opp] });
    expect(zone(s, card1)).toBe("hand");
    expect(s.objects[b]!.tapped).toBe(true);
    // An empty hand: nothing to ask.
    s = passUntil(s, "end", opp);
    s.players[opp]!.hand = [];
    s = settle(passUntil(s, "upkeep", opp), { me: [opp] });
    expect(s.pending?.kind).not.toBe("chooseMay");
    expect(s.objects[b]!.tapped).toBe(true);
  });

  it("Entrails Feaster: exiling a creature card from any graveyard gives it a +1/+1 counter; otherwise it taps", () => {
    let { s, ap, opp } = setup([]);
    const f = putOnBattlefield(s, ap, feaster());
    const theirs = into(s, opp, bear(), "graveyard");
    into(s, opp, land, "graveyard");
    s = settle(toUpkeep(s, ap), { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, anyGraveyard: true });
    expect((s.pending as { cards: string[] }).cards).toContain(theirs);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [theirs] }), { me: [ap] });
    expect(zone(s, theirs)).toBe("exile");
    expect(s.objects[f]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[f]!.tapped).toBe(false);
    // No creature card in any graveyard: it can't, so it taps.
    s = toUpkeep(s, ap);
    for (const p of s.turnOrder) s.players[p]!.graveyard = s.players[p]!.graveyard.filter((id) => !s.cards[s.objects[id]!.cardId]!.types.includes("Creature"));
    s = settle(s, { me: [ap] });
    expect(s.pending?.kind).not.toBe("chooseMay");
    expect(s.objects[f]!.tapped).toBe(true);
    expect(s.objects[f]!.counters["+1/+1"]).toBe(1);
  });

  it("Lurebound Scarecrow: sacrificed when you control no permanents of the chosen color; never with no color chosen", () => {
    let { s, ap, ids } = setup([kill]);
    const sc = putOnBattlefield(s, ap, scarecrow());
    s.objects[sc]!.chosen = { color: "R" };
    const o = putOnBattlefield(s, ap, ogre);
    invalidateCharacteristics(s);
    s = settle(s);
    expect(zone(s, sc)).toBe("battlefield");
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(o)])));
    expect(zone(s, o)).toBe("graveyard");
    expect(zone(s, sc)).toBe("graveyard");
    // No color chosen: the condition is undefined and it never triggers (rulings).
    const other = putOnBattlefield(s, ap, scarecrow());
    s = settle(passUntil(s, "end", ap));
    expect(zone(s, other)).toBe("battlefield");
  });

  it("Empty-Shrine Kannushi: protection from each color among permanents you control, its own white too", () => {
    let { s, ap, opp, ids } = setup([bolt]);
    const k = putOnBattlefield(s, ap, kannushi());
    const keys = () => characteristics(s, s.objects[k]!).keywords.filter((x) => /^Protection from/.test(x)).sort();
    expect(keys()).toEqual(["Protection from white"]);
    // A red permanent of yours: protection from red, so your own red spell can't target it.
    const o = putOnBattlefield(s, ap, ogre);
    expect(keys()).toEqual(["Protection from red", "Protection from white"]);
    expect(planCast(s, ap, ids[0]!, [tgt(k)])).toBeNull();
    // An opponent's permanents don't count.
    putOnBattlefield(s, opp, giant);
    expect(keys()).toEqual(["Protection from red", "Protection from white"]);
    s.objects[o]!.controller = opp;
    invalidateCharacteristics(s);
    expect(keys()).toEqual(["Protection from white"]);
  });

  it("Pledge of Loyalty: protection from your permanents' colors, and the Aura stays on", () => {
    let { s, ap } = setup([]);
    const b = putOnBattlefield(s, ap, bear());
    const aura = putOnBattlefield(s, ap, pledge());
    attach(s, aura, b);
    putOnBattlefield(s, ap, glory);
    s = settle(s);
    const keys = characteristics(s, s.objects[b]!).keywords.filter((x) => /^Protection from/.test(x)).sort();
    // The Aura is white, the bear and the lands' colorless: green (the bear) and white.
    expect(keys).toEqual(["Protection from green", "Protection from white"]);
    expect(zone(s, aura)).toBe("battlefield");
    expect(s.objects[aura]!.attachedTo).toBe(b);
  });
});
