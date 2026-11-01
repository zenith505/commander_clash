// Round 241: cards from the top of the popularity list. Elbrus, the Binding Blade ("unattach ~, then transform it");
// Subterranean Schooner ("target creature that crewed it this turn explores"); Luxurious Locomotive ("a Treasure token
// for each creature that crewed it this turn", "Crew 1. Activate only once each turn."); Rambling Possum ("you may
// return any number of creatures that saddled it this turn"); Fortune, Loyal Steed (at end of combat, exile it and up to
// one creature that saddled it, then return them); Adrestia ("if an Assassin crewed it this turn"); Iroh, Tea Master
// ("you may have target opponent gain control of target permanent you control. When you do, ..."); Zareth San, the
// Trickster (a ninjutsu-like ability for an unblocked Rogue, attacking whom you choose); Slayer's Cleaver and Ace's
// Baseball Bat ("must be blocked by an Eldrazi / a Dalek if able"); Thorin, Mountain-king (attach any number of target
// Equipment to target creature, "When one or more Equipment become attached to that creature this way").

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { planCast } from "../src";
import { abilitiesOf, applyAction, blockRequirementProblem, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, objIsType, planActivate, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library") => {
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
    else if (p?.kind === "chooseTargets" && opts.targets) s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const named = (s: GameState, name: string) => s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === name);
const abilityIndex = (s: GameState, id: ObjectId, re: RegExp) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => re.test(a.text));
/** Attack with `attacks`, nobody blocks; stops at `me`'s first question or once combat is over. */
const attack = (s: GameState, me: PlayerId, attacks: { attacker: ObjectId; defender: PlayerId }[]) => {
  s = act(s, { type: "declareAttackers", player: me, attacks });
  for (let i = 0; i < 120 && s.step !== "main2"; i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p && p.player === me) return s;
    else if (p) s = act(s, botActions(s, p.player)[0]!);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const crewOrSaddle = (s: GameState, pid: PlayerId, v: ObjectId, re: RegExp, tapCreatures: ObjectId[]) => settle(act(s, { type: "activateAbility", player: pid, objectId: v, index: abilityIndex(s, v, re), tapCreatures }), { me: pid });

// Real oracle text (Scryfall).
const elbrus = (): CardDef => ({"oracleId":"da5881ca-b86e-4582-ae0e-1570c59773ae","name":"Elbrus, the Binding Blade // Withengar Unbound","manaCost":"{7}","cmc":7,"typeLine":"Legendary Artifact — Equipment // Legendary Creature — Demon","supertypes":["Legendary"],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +1/+0.\nWhen equipped creature deals combat damage to a player, unattach Elbrus, then transform it.\nEquip {1}","colors":[],"colorIdentity":["B"],"keywords":["Flying","Transform","Trample","Equip","Intimidate"],"commanderLegal":"legal","set":"dka","releasedAt":"2012-02-03","rarity":"mythic","layout":"transform","gameChanger":false,"faces":[{"name":"Elbrus, the Binding Blade","manaCost":"{7}","typeLine":"Legendary Artifact — Equipment","supertypes":["Legendary"],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +1/+0.\nWhen equipped creature deals combat damage to a player, unattach Elbrus, then transform it.\nEquip {1}","colors":[]},{"name":"Withengar Unbound","manaCost":"","typeLine":"Legendary Creature — Demon","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Demon"],"oracleText":"Flying, intimidate, trample (A creature with intimidate can't be blocked except by artifact creatures and/or creatures that share a color with it.)\nWhenever a player loses the game, put thirteen +1/+1 counters on Withengar Unbound.","power":"13","toughness":"13","colors":["B"],"colorIndicator":["B"]}]}) as CardDef;
const schooner = (): CardDef => ({"oracleId":"7f82bae3-feaa-4967-a843-32a4f72806d5","name":"Subterranean Schooner","manaCost":"{1}{U}","cmc":2,"typeLine":"Artifact — Vehicle","supertypes":[],"types":["Artifact"],"subtypes":["Vehicle"],"oracleText":"Whenever this Vehicle attacks, target creature that crewed it this turn explores. (Reveal the top card of your library. Put that card into your hand if it's a land. Otherwise, put a +1/+1 counter on that creature, then put the card back or put it into your graveyard.)\nCrew 1","power":"3","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":["Crew","Explore"],"commanderLegal":"legal","set":"lci","releasedAt":"2023-11-17","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const locomotive = (): CardDef => ({"oracleId":"c68c2a98-9a6d-4199-af3a-78eb92beda48","name":"Luxurious Locomotive","manaCost":"{5}","cmc":5,"typeLine":"Artifact — Vehicle","supertypes":[],"types":["Artifact"],"subtypes":["Vehicle"],"oracleText":"Whenever this Vehicle attacks, create a Treasure token for each creature that crewed it this turn. (They're artifacts with \"{T}, Sacrifice this token: Add one mana of any color.\")\nCrew 1. Activate only once each turn. (Tap any number of creatures you control with total power 1 or more: This Vehicle becomes an artifact creature until end of turn.)","power":"6","toughness":"5","colors":[],"colorIdentity":[],"keywords":["Treasure","Crew"],"producedMana":["B","G","R","U","W"],"commanderLegal":"legal","set":"otj","releasedAt":"2024-04-19","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const possum = (): CardDef => ({"oracleId":"4b100e6f-6c19-49d2-b9c4-613d63d42151","name":"Rambling Possum","manaCost":"{2}{G}","cmc":3,"typeLine":"Creature — Possum Mount","supertypes":[],"types":["Creature"],"subtypes":["Possum","Mount"],"oracleText":"Whenever this creature attacks while saddled, it gets +1/+2 until end of turn. Then you may return any number of creatures that saddled it this turn to their owner's hand.\nSaddle 1 (Tap any number of other creatures you control with total power 1 or more: This Mount becomes saddled until end of turn. Saddle only as a sorcery.)","power":"3","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":["Saddle"],"commanderLegal":"legal","set":"otj","releasedAt":"2024-04-19","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const fortune = (): CardDef => ({"oracleId":"dc440b62-0bf0-4f23-9210-3550ff0a8d4d","name":"Fortune, Loyal Steed","manaCost":"{2}{W}","cmc":3,"typeLine":"Legendary Creature — Beast Mount","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Beast","Mount"],"oracleText":"When Fortune enters, scry 2.\nWhenever Fortune attacks while saddled, at end of combat, exile it and up to one creature that saddled it this turn, then return those cards to the battlefield under their owner's control.\nSaddle 1","power":"2","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Saddle","Scry"],"commanderLegal":"legal","set":"otj","releasedAt":"2024-04-19","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const adrestia = (): CardDef => ({"oracleId":"94779ca4-c202-4163-9c77-1036921a34bc","name":"Adrestia","manaCost":"{3}","cmc":3,"typeLine":"Legendary Artifact — Vehicle","supertypes":["Legendary"],"types":["Artifact"],"subtypes":["Vehicle"],"oracleText":"Islandwalk (This creature can't be blocked as long as defending player controls an Island.)\nWhenever Adrestia attacks, if an Assassin crewed it this turn, draw a card. Adrestia becomes an Assassin in addition to its other types until end of turn.\nCrew 1","power":"4","toughness":"3","colors":[],"colorIdentity":[],"keywords":["Landwalk","Crew","Islandwalk"],"commanderLegal":"legal","set":"acr","releasedAt":"2024-07-05","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const iroh = (): CardDef => ({"oracleId":"87adda41-113b-4126-8978-25a258b31bdd","name":"Iroh, Tea Master","manaCost":"{1}{R}{W}","cmc":3,"typeLine":"Legendary Creature — Human Citizen Ally","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Citizen","Ally"],"oracleText":"When Iroh enters, create a Food token.\nAt the beginning of combat on your turn, you may have target opponent gain control of target permanent you control. When you do, create a 1/1 white Ally creature token. Put a +1/+1 counter on that token for each permanent you own that your opponents control.","power":"2","toughness":"2","colors":["R","W"],"colorIdentity":["R","W"],"keywords":["Food"],"commanderLegal":"legal","set":"tla","releasedAt":"2025-11-21","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const zareth = (): CardDef => ({"oracleId":"a316b0ce-1f63-4a8e-9a6e-bfbe03ca4e9e","name":"Zareth San, the Trickster","manaCost":"{3}{U}{B}","cmc":5,"typeLine":"Legendary Creature — Merfolk Rogue","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Merfolk","Rogue"],"oracleText":"Flash\n{2}{U}{B}, Return an unblocked attacking Rogue you control to its owner's hand: Put this card from your hand onto the battlefield tapped and attacking.\nWhenever Zareth San deals combat damage to a player, you may put target permanent card from that player's graveyard onto the battlefield under your control.","power":"4","toughness":"4","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Flash"],"commanderLegal":"legal","set":"znr","releasedAt":"2020-09-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const cleaver = (): CardDef => ({"oracleId":"e51cbdce-017e-4b14-b3a7-2db50ddd8037","name":"Slayer's Cleaver","manaCost":"{3}","cmc":3,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +3/+1 and must be blocked by an Eldrazi if able.\nEquip {4}","colors":[],"colorIdentity":[],"keywords":["Equip"],"commanderLegal":"legal","set":"emn","releasedAt":"2016-07-22","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bat = (): CardDef => ({"oracleId":"3f47ec32-4ee9-4bc0-96f2-310a939cb973","name":"Ace's Baseball Bat","manaCost":"{2}","cmc":2,"typeLine":"Legendary Artifact — Equipment","supertypes":["Legendary"],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +3/+0.\nAs long as equipped creature is attacking, it has first strike and must be blocked by a Dalek if able.\nEquip legendary creature {1}\nEquip {3}","colors":[],"colorIdentity":[],"keywords":["Equip"],"commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const thorin = (): CardDef => ({"oracleId":"94917b80-ac32-45ab-b4ee-157ade024bcd","name":"Thorin, Mountain-king","manaCost":"{3}{R}","cmc":4,"typeLine":"Legendary Creature — Dwarf Noble","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Dwarf","Noble"],"oracleText":"Trample\nWhen Thorin enters, attach any number of target Equipment you control to target creature you control. When one or more Equipment become attached to that creature this way, that creature deals damage equal to its power to up to one target creature.","power":"3","toughness":"4","colors":["R"],"colorIdentity":["R"],"keywords":["Trample"],"commanderLegal":"legal","set":"hob","releasedAt":"2026-08-14","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;

const assassin = card("Hooded Assassin", "Creature — Human Assassin", "{2}{B}", { power: "1", toughness: "2" });
const rogue = card("Test Rogue", "Creature — Human Rogue", "{1}{U}", { power: "1", toughness: "1" });
const eldrazi = card("Test Eldrazi", "Creature — Eldrazi", "{3}", { power: "3", toughness: "3" });
const dalek = card("Test Dalek", "Artifact Creature — Dalek", "{3}", { power: "3", toughness: "3" });

describe("round 241 cards", () => {
  it("are fully supported", () => supported(elbrus(), schooner(), locomotive(), possum(), fortune(), adrestia(), iroh(), zareth(), cleaver(), bat(), thorin()));
});

describe("Elbrus, the Binding Blade", () => {
  it("when the equipped creature deals combat damage to a player, Elbrus is unattached and transforms into Withengar Unbound", () => {
    const { s: s0, ap, opp } = setup([]);
    const e = putOnBattlefield(s0, ap, elbrus());
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[e]!.attachedTo = b;
    invalidateCharacteristics(s0);
    expect(pt(s0, b)).toBe("3/2");
    let s = passUntil(s0, "declareAttackers", ap);
    s = settle(attack(s, ap, [{ attacker: b, defender: opp }]), { me: ap });
    expect(zone(s, e)).toBe("battlefield");
    expect(s.objects[e]!.attachedTo).toBeUndefined();
    const ch = characteristics(s, s.objects[e]!);
    expect(ch.name).toBe("Withengar Unbound");
    expect(ch.types).toContain("Creature");
    expect(pt(s, e)).toBe("13/13");
    expect(pt(s, b)).toBe("2/2");
  });
});

describe("Subterranean Schooner", () => {
  it("only a creature that crewed it this turn can be the target, and that creature explores", () => {
    const { s: s0, ap, opp } = setup([]);
    const v = putOnBattlefield(s0, ap, schooner());
    const crew = putOnBattlefield(s0, ap, bear({ name: "Crew Bear" }));
    const other = putOnBattlefield(s0, ap, bear({ name: "Other Bear" }));
    const top = into(s0, ap, forest, "library");
    let s = crewOrSaddle(s0, ap, v, /^Crew/, [crew]);
    s = passUntil(s, "declareAttackers", ap);
    s = attack(s, ap, [{ attacker: v, defender: opp }]);
    expect(s.pending?.kind).toBe("chooseTargets");
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(other)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(crew)] }), { me: ap });
    // A land revealed goes to the hand (CR 701.44a).
    expect(zone(s, top)).toBe("hand");
  });
});

describe("Luxurious Locomotive", () => {
  it("makes a Treasure for each creature that crewed it this turn, and crews only once each turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const v = putOnBattlefield(s0, ap, locomotive());
    const a = putOnBattlefield(s0, ap, bear({ name: "Crew A" }));
    const b = putOnBattlefield(s0, ap, bear({ name: "Crew B" }));
    putOnBattlefield(s0, ap, bear({ name: "Crew C" }));
    let s = crewOrSaddle(s0, ap, v, /^Crew/, [a, b]);
    const c = named(s, "Crew C")[0]!;
    expect(() => act(s, { type: "activateAbility", player: ap, objectId: v, index: abilityIndex(s, v, /^Crew/), tapCreatures: [c] })).toThrow(/once each turn/);
    s = passUntil(s, "declareAttackers", ap);
    s = settle(attack(s, ap, [{ attacker: v, defender: opp }]), { me: ap });
    expect(named(s, "Treasure Token").length).toBe(2);
  });

  it("counts a crewing creature that has left the battlefield since (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const v = putOnBattlefield(s0, ap, locomotive());
    const a = putOnBattlefield(s0, ap, bear({ name: "Crew A" }));
    let s = crewOrSaddle(s0, ap, v, /^Crew/, [a]);
    s.objects[a]!.zone = "graveyard";
    s.battlefield.splice(s.battlefield.indexOf(a), 1);
    s.players[ap]!.graveyard.push(a);
    invalidateCharacteristics(s);
    s = passUntil(s, "declareAttackers", ap);
    s = settle(attack(s, ap, [{ attacker: v, defender: opp }]), { me: ap });
    expect(named(s, "Treasure Token").length).toBe(1);
  });
});

describe("Rambling Possum", () => {
  it("attacking while saddled, it gets +1/+2 and you may return any number of creatures that saddled it to their owner's hand", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, possum());
    const a = putOnBattlefield(s0, ap, bear({ name: "Saddler A" }));
    const b = putOnBattlefield(s0, ap, bear({ name: "Saddler B" }));
    const other = putOnBattlefield(s0, ap, bear({ name: "Other Bear" }));
    let s = crewOrSaddle(s0, ap, m, /^Saddle/, [a, b]);
    s = passUntil(s, "declareAttackers", ap);
    s = attack(s, ap, [{ attacker: m, defender: opp }]);
    expect(s.pending?.kind).toBe("pickPermanents");
    if (s.pending?.kind !== "pickPermanents") throw new Error("no pick");
    expect([...s.pending.options].sort()).toEqual([a, b].sort());
    expect(s.pending.options).not.toContain(other);
    expect(pt(s, m)).toBe("4/5");
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [a] }), { me: ap });
    expect(zone(s, a)).toBe("hand");
    expect(zone(s, b)).toBe("battlefield");
  });

  it("attacking unsaddled, nothing triggers", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, possum());
    let s = passUntil(s0, "declareAttackers", ap);
    s = settle(attack(s, ap, [{ attacker: m, defender: opp }]), { me: ap });
    expect(pt(s, m)).toBe("3/3");
  });
});

describe("Fortune, Loyal Steed", () => {
  it("at end of combat it and up to one creature that saddled it are exiled and returned, untapped", () => {
    const { s: s0, ap, opp } = setup([]);
    const f = putOnBattlefield(s0, ap, fortune());
    const a = putOnBattlefield(s0, ap, bear({ name: "Saddler" }));
    const other = putOnBattlefield(s0, ap, bear({ name: "Other Bear" }));
    s0.objects[other]!.tapped = true;
    let s = crewOrSaddle(s0, ap, f, /^Saddle/, [a]);
    expect(s.objects[a]!.tapped).toBe(true);
    s = passUntil(s, "declareAttackers", ap);
    const zf = s.objects[f]!.zoneChanges ?? 0;
    const za = s.objects[a]!.zoneChanges ?? 0;
    s = attack(s, ap, [{ attacker: f, defender: opp }]);
    // The delayed trigger resolves at end of combat: a choice of up to one, among those that saddled it.
    for (let i = 0; i < 50 && s.pending?.kind !== "pickPermanents"; i++) s = s.pending ? act(s, botActions(s, s.pending.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.step).toBe("endCombat");
    if (s.pending?.kind !== "pickPermanents") throw new Error("no pick");
    expect(s.pending.options).toEqual([a]);
    s = act(s, { type: "pickPermanents", player: ap, ids: [a] });
    // Fortune's enters trigger scries 2: arrange the top as it is.
    for (let i = 0; i < 50 && (s.pending || s.stack.length); i++) {
      const p = s.pending;
      if (p?.kind === "arrangeTop") s = act(s, botActions(s, p.player)[0]!);
      else s = p ? act(s, botActions(s, p.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(zone(s, f)).toBe("battlefield");
    expect(zone(s, a)).toBe("battlefield");
    expect(s.objects[f]!.zoneChanges).toBe(zf + 2);
    expect(s.objects[a]!.zoneChanges).toBe(za + 2);
    expect(s.objects[a]!.tapped).toBe(false);
    expect(s.objects[f]!.tapped).toBe(false);
    expect(s.objects[other]!.tapped).toBe(true);
  });

  it("choosing none, only Fortune is exiled and returned", () => {
    const { s: s0, ap, opp } = setup([]);
    const f = putOnBattlefield(s0, ap, fortune());
    const a = putOnBattlefield(s0, ap, bear({ name: "Saddler" }));
    let s = crewOrSaddle(s0, ap, f, /^Saddle/, [a]);
    s = passUntil(s, "declareAttackers", ap);
    const zf = s.objects[f]!.zoneChanges ?? 0;
    s = attack(s, ap, [{ attacker: f, defender: opp }]);
    for (let i = 0; i < 50 && s.pending?.kind !== "pickPermanents"; i++) s = s.pending ? act(s, botActions(s, s.pending.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "pickPermanents", player: ap, ids: [] });
    expect(s.objects[f]!.zoneChanges).toBe(zf + 2);
    expect(s.objects[a]!.tapped).toBe(true);
    expect(zone(s, a)).toBe("battlefield");
  });
});

describe("Adrestia", () => {
  it("crewed by an Assassin, attacking draws a card and makes it an Assassin until end of turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const v = putOnBattlefield(s0, ap, adrestia());
    const k = putOnBattlefield(s0, ap, assassin);
    const hand = s0.players[ap]!.hand.length;
    let s = crewOrSaddle(s0, ap, v, /^Crew/, [k]);
    s = passUntil(s, "declareAttackers", ap);
    s = settle(attack(s, ap, [{ attacker: v, defender: opp }]), { me: ap });
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(characteristics(s, s.objects[v]!).subtypes).toContain("Assassin");
  });

  it("crewed by a creature that isn't an Assassin, it doesn't trigger", () => {
    const { s: s0, ap, opp } = setup([]);
    const v = putOnBattlefield(s0, ap, adrestia());
    const b = putOnBattlefield(s0, ap, bear());
    const hand = s0.players[ap]!.hand.length;
    let s = crewOrSaddle(s0, ap, v, /^Crew/, [b]);
    s = passUntil(s, "declareAttackers", ap);
    s = settle(attack(s, ap, [{ attacker: v, defender: opp }]), { me: ap });
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(characteristics(s, s.objects[v]!).subtypes).not.toContain("Assassin");
  });
});

describe("Iroh, Tea Master", () => {
  it("giving an opponent a permanent makes an Ally token with a +1/+1 counter for each permanent you own that they control", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, iroh());
    const rock = putOnBattlefield(s0, ap, card("Test Rock", "Artifact", "{2}"));
    let s = passUntil(s0, "beginCombat", ap);
    expect(s.pending?.kind).toBe("chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }, tgt(rock)] }), { me: ap, may: true });
    expect(controllerOf(s, s.objects[rock]!)).toBe(opp);
    const ally = named(s, "Ally Token");
    expect(ally.length).toBe(1);
    expect(s.objects[ally[0]!]!.counters["+1/+1"]).toBe(1);
    expect(pt(s, ally[0]!)).toBe("2/2");
  });

  it("declining, nothing changes hands and no token is made", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, iroh());
    const rock = putOnBattlefield(s0, ap, card("Test Rock", "Artifact", "{2}"));
    let s = passUntil(s0, "beginCombat", ap);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }, tgt(rock)] }), { me: ap, may: false });
    expect(controllerOf(s, s.objects[rock]!)).toBe(ap);
    expect(named(s, "Ally Token").length).toBe(0);
  });

  it("a bot gives away only a noncreature token", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, iroh());
    const b = putOnBattlefield(s0, ap, bear());
    let s = passUntil(s0, "beginCombat", ap);
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }, tgt(b)] });
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(botActions(s, ap)).toEqual([{ type: "chooseMay", player: ap, yes: false }]);
  });
});

describe("Zareth San, the Trickster", () => {
  it("returns an unblocked attacking Rogue to put Zareth onto the battlefield tapped and attacking whom you choose", () => {
    const { s: s0, ap, opp, ids } = setup([zareth()]);
    const z = ids[0]!;
    const r = putOnBattlefield(s0, ap, rogue);
    const third = s0.turnOrder[(s0.turnOrder.indexOf(opp) + 1) % 4]!;
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: r, defender: opp }] });
    // Before blockers are declared, a Rogue is neither blocked nor unblocked (rulings).
    expect(planActivate(s, ap, z, 0, undefined, undefined, undefined, undefined, { returnToHand: [r] })).toBeNull();
    for (let i = 0; i < 40 && !(s.step === "declareBlockers" && !s.pending && waitingOn(s) === ap); i++) {
      const p = s.pending;
      if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
      else s = p ? act(s, botActions(s, p.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    s = run(s, planActivate(s, ap, z, 0, undefined, undefined, undefined, undefined, { returnToHand: [r] }));
    expect(zone(s, r)).toBe("hand");
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseOption"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending?.kind !== "chooseOption") throw new Error("no choice");
    expect(s.pending.what).toBe("attackWhom");
    expect(s.pending.options).toContain(String(third));
    s = act(s, { type: "chooseOption", player: ap, choice: String(third) });
    expect(zone(s, z)).toBe("battlefield");
    expect(s.objects[z]!.tapped).toBe(true);
    expect(s.objects[z]!.attacking).toBe(third);
  });

  it("a creature that isn't a Rogue can't be returned for it", () => {
    const { s: s0, ap, opp, ids } = setup([zareth()]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    for (let i = 0; i < 40 && !(s.step === "declareBlockers" && !s.pending && waitingOn(s) === ap); i++) {
      const p = s.pending;
      if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
      else s = p ? act(s, botActions(s, p.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(planActivate(s, ap, ids[0]!, 0, undefined, undefined, undefined, undefined, { returnToHand: [b] })).toBeNull();
  });
});

describe("Slayer's Cleaver and Ace's Baseball Bat", () => {
  /** `ap` attacks `opp` with a creature equipped with `eq`; returns the state at `opp`'s blocks. */
  const atBlocks = (eq: CardDef, blockers: CardDef[]) => {
    const { s: s0, ap, opp } = setup([]);
    const e = putOnBattlefield(s0, ap, eq);
    const b = putOnBattlefield(s0, ap, bear({ name: "Equipped Bear" }));
    s0.objects[e]!.attachedTo = b;
    const mine = blockers.map((d) => putOnBattlefield(s0, opp, d));
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return { s, ap, opp, b, mine };
  };

  it("Slayer's Cleaver: an Eldrazi able to block it must, and one Eldrazi is enough", () => {
    const { s, opp, b, mine } = atBlocks(cleaver(), [eldrazi, bear({ name: "Their Bear" })]);
    const [el, theirs] = mine as [ObjectId, ObjectId];
    expect(pt(s, b)).toBe("5/3");
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [] })).toThrow(/must be blocked by an Eldrazi/);
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: theirs, attacker: b }] })).toThrow(/Eldrazi/);
    const ok = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: el, attacker: b }, { blocker: theirs, attacker: b }] });
    expect(ok.objects[b]!.blockedBy?.length).toBe(2);
    // The bot obeys it.
    const bot = botActions(s, opp)[0]!;
    expect(bot.type === "declareBlockers" && bot.blocks.some((x) => x.blocker === el && x.attacker === b)).toBe(true);
  });

  it("Slayer's Cleaver: with the Eldrazi tapped, nothing has to block", () => {
    const { s, opp, mine } = atBlocks(cleaver(), [eldrazi]);
    s.objects[mine[0]!]!.tapped = true;
    expect(blockRequirementProblem(s, opp, [])).toBeNull();
  });

  it("Ace's Baseball Bat: first strike and the Dalek requirement only while attacking", () => {
    const { s: s0, ap } = setup([]);
    const e = putOnBattlefield(s0, ap, bat());
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[e]!.attachedTo = b;
    invalidateCharacteristics(s0);
    expect(pt(s0, b)).toBe("5/2");
    expect(objHasKeyword(s0, s0.objects[b]!, "First strike")).toBe(false);
    expect(characteristics(s0, s0.objects[b]!).mustBeBlockedBy).toBeUndefined();
    const { s, opp, b: attacker, mine } = atBlocks(bat(), [dalek]);
    expect(objHasKeyword(s, s.objects[attacker]!, "First strike")).toBe(true);
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [] })).toThrow(/Dalek/);
    expect(objIsType(s, s.objects[mine[0]!]!, "Creature")).toBe(true);
    act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: mine[0]!, attacker }] });
  });
});

describe("Thorin, Mountain-king", () => {
  const sword = () => card("Test Sword", "Artifact — Equipment", "{1}", { oracleText: "Equipped creature gets +2/+0.\nEquip {2}" });
  const enter = (attached = false) => {
    const { s: s0, ap, opp, ids } = setup([thorin()]);
    const a = putOnBattlefield(s0, ap, sword());
    const b = putOnBattlefield(s0, ap, { ...sword(), name: "Test Axe" });
    const host = putOnBattlefield(s0, ap, bear({ name: "Host Bear" }));
    const foe = putOnBattlefield(s0, opp, bear({ name: "Their Bear", power: "1", toughness: "7" }));
    if (attached) s0.objects[a]!.attachedTo = host;
    invalidateCharacteristics(s0);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return { s, ap, opp, a, b, host, foe };
  };

  it("attaches the Equipment to the creature, which then deals damage equal to its power to up to one target creature", () => {
    let { s, ap, a, b, host, foe } = enter();
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(a), tgt(b), tgt(host)] });
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[a]!.attachedTo).toBe(host);
    expect(s.objects[b]!.attachedTo).toBe(host);
    expect(pt(s, host)).toBe("6/2");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(foe)] }), { me: ap });
    expect(s.objects[foe]!.damage).toBe(6);
  });

  it("with no Equipment newly attached (none chosen, or the one already on it), there's no damage", () => {
    let { s, ap, host } = enter();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(host)] }), { me: ap });
    expect(s.pending).toBeNull();
    ({ s, ap, host } = enter(true));
    const a = named(s, "Test Sword")[0]!;
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(a), tgt(host)] }), { me: ap });
    expect(s.objects[a]!.attachedTo).toBe(host);
    expect(s.pending).toBeNull();
  });
});
