// Triggered abilities of Auras and Equipment about the creature they're attached to: "Whenever enchanted creature
// deals damage", "whenever equipped creature attacks", "~ or equipped creature" (CR 603.2, 603.10). "Whenever ~ deals
// damage to a player / an opponent" triggers once for each player dealt damage (CR 603.2c).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { invalidateCharacteristics, isFullySupported, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) =>
  settle(act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks }));
const blocks = (s: GameState, b: { blocker: string; attacker: string }[] = []) => {
  for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  while (s.pending?.kind === "declareBlockers") {
    const pid = s.pending.player;
    s = act(s, { type: "declareBlockers", player: pid, blocks: b.filter((x) => s.objects[x.blocker]!.controller === pid) });
  }
  return settle(s);
};
const attach = (s: GameState, pid: PlayerId, def: CardDef, to: string) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.attachedTo = to;
  invalidateCharacteristics(s);
  return id;
};
/** Answer every "you may" with yes until nothing is waiting. */
const yes = (s: GameState) => {
  for (let i = 0; i < 20; i++) {
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes: true });
    else if (s.stack.length || s.triggerQueue.length) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    else break;
  }
  return s;
};

// Real oracle text (Scryfall).
const spiritLink = card("Spirit Link", "Enchantment — Aura", "{W}", { keywords: ["Enchant"], oracleText: "Enchant creature (Target a creature as you cast this. This card enters attached to that creature.)\nWhenever enchanted creature deals damage, you gain that much life." });
const curiosity = card("Curiosity", "Enchantment — Aura", "{U}", { keywords: ["Enchant"], oracleText: "Enchant creature\nWhenever enchanted creature deals damage to an opponent, you may draw a card." });
const jitte = card("Umezawa's Jitte", "Legendary Artifact — Equipment", "{2}", {
  keywords: ["Equip"],
  oracleText: "Whenever equipped creature deals combat damage, put two charge counters on Umezawa's Jitte.\nRemove a charge counter from Umezawa's Jitte: Choose one —\n• Equipped creature gets +2/+2 until end of turn.\n• Target creature gets -1/-1 until end of turn.\n• You gain 2 life.\nEquip {2}",
});
const armory = card("Armory of Iroas", "Artifact — Equipment", "{2}", { keywords: ["Equip"], oracleText: "Whenever equipped creature attacks, put a +1/+1 counter on it.\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)" });
const fangs = card("Venomous Fangs", "Enchantment — Aura", "{2}{G}", { keywords: ["Enchant"], oracleText: "Enchant creature\nWhenever enchanted creature deals damage to a creature, destroy the other creature." });
const armor = card("Illusionary Armor", "Enchantment — Aura", "{4}{U}", { keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature gets +4/+4.\nWhen enchanted creature becomes the target of a spell or ability, sacrifice this Aura." });
const specter = card("Abyssal Specter", "Creature — Specter", "{2}{B}{B}", { power: "2", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nWhenever this creature deals damage to a player, that player discards a card." });
const octopus = card("Acquisition Octopus", "Artifact Creature — Equipment Octopus", "{2}{U}", {
  power: "2",
  toughness: "2",
  keywords: ["Reconfigure"],
  oracleText: "Whenever this creature or equipped creature deals combat damage to a player, draw a card.\nReconfigure {2} ({2}: Attach to target creature you control; or unattach from a creature. Reconfigure only as a sorcery. While attached, this isn't a creature.)",
});
const fury = card("Bestial Fury", "Enchantment — Aura", "{2}{R}", { keywords: ["Enchant"], oracleText: "Enchant creature\nWhen this Aura enters, draw a card at the beginning of the next turn's upkeep.\nWhenever enchanted creature becomes blocked, it gets +4/+0 and gains trample until end of turn." });
const visions = card("Visions of Brutality", "Enchantment — Aura", "{1}{B}", { keywords: ["Devoid", "Enchant"], oracleText: "Devoid (This card has no color.)\nEnchant creature\nEnchanted creature can't block.\nWhenever enchanted creature deals damage, its controller loses that much life." });
const sorcerer = card("Prodigal Sorcerer", "Creature — Human Wizard Sorcerer", "{2}{U}", { power: "1", toughness: "1", oracleText: "{T}: This creature deals 1 damage to any target." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });

describe("Aura and Equipment triggers about the creature they're attached to", () => {
  it("are supported", () => supported(spiritLink, curiosity, jitte, armory, fangs, armor, specter, octopus, fury, visions));

  it("Spirit Link: the Aura's controller gains what the enchanted creature deals, combat or not, even on an opponent's creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const sorc = putOnBattlefield(s0, opp, sorcerer);
    attach(s0, ap, spiritLink, sorc);
    const life = s0.players[ap]!.life;
    let s = act(s0, { type: "passPriority", player: ap }); // the opponent gets priority
    s = settle(act(s, { type: "activateAbility", player: opp, objectId: sorc, index: 0, targets: [{ kind: "player", id: ap }] }));
    // The Aura's controller is dealt 1 and gains 1: it's a trigger, not lifelink.
    expect(s.players[ap]!.life).toBe(life);
    expect(s.log.some((e) => /Spirit Link's ability triggers/.test(e.text))).toBe(true);
  });

  it("Umezawa's Jitte gets two counters once per combat damage step, however many things the creature hit", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, bear({ power: "4", toughness: "4", keywords: ["Trample"], oracleText: "Trample" }));
    const j = attach(s0, ap, jitte, b);
    const blocker = putOnBattlefield(s0, opp, bear());
    let s = attack(s0, ap, [{ attacker: b, defender: opp }]);
    s = blocks(s, [{ blocker, attacker: b }]);
    s = settle(passUntil(s, "endCombat", ap));
    expect(s.objects[j]!.counters.charge).toBe(2);
  });

  it("Armory of Iroas puts the counter on the attacking creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, bear());
    attach(s0, ap, armory, b);
    const s = attack(s0, ap, [{ attacker: b, defender: opp }]);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
  });

  it("an Equipment's trigger doesn't fire for its own events, nor an unattached one", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, ap, armory); // not attached
    const s = attack(s0, ap, [{ attacker: b, defender: opp }]);
    expect(s.objects[b]!.counters["+1/+1"]).toBeUndefined();
  });

  it("Venomous Fangs destroys the creature dealt damage, not the enchanted one", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, bear({ power: "1", toughness: "5" }));
    attach(s0, ap, fangs, b);
    const big = putOnBattlefield(s0, opp, bear({ power: "0", toughness: "6" }));
    let s = attack(s0, ap, [{ attacker: b, defender: opp }]);
    s = blocks(s, [{ blocker: big, attacker: b }]);
    s = settle(passUntil(s, "endCombat", ap));
    expect(s.objects[big]!.zone).toBe("graveyard");
    expect(s.objects[b]!.zone).toBe("battlefield");
  });

  it("Bestial Fury pumps the enchanted creature as it becomes blocked", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, bear());
    attach(s0, ap, fury, b);
    const blocker = putOnBattlefield(s0, opp, bear());
    let s = attack(s0, ap, [{ attacker: b, defender: opp }]);
    s = blocks(s, [{ blocker, attacker: b }]);
    const life = s.players[opp]!.life;
    s = settle(passUntil(s, "endCombat", ap));
    // 6 power with trample: 2 to the 2/2 blocker, 4 to the player.
    expect(s.players[opp]!.life).toBe(life - 4);
  });

  it("Visions of Brutality: the enchanted creature's controller loses that much life", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, opp, bear({ power: "3", toughness: "3" }));
    attach(s0, ap, visions, b);
    const life = s0.players[opp]!.life;
    const s = settle(passUntil(attack(passUntil(s0, "upkeep", opp), opp, [{ attacker: b, defender: ap }]), "endCombat", opp));
    expect(s.players[opp]!.life).toBe(life - 3);
  });

  it("Illusionary Armor is sacrificed when the creature becomes a target", () => {
    const { s: s0, ap, ids } = setup([shock]);
    const b = putOnBattlefield(s0, ap, bear());
    const a = attach(s0, ap, armor, b);
    const s = settle(cast(s0, ap, ids[0]!, [target(b)]));
    expect(s.objects[a]!.zone).toBe("graveyard");
    expect(s.objects[b]!.zone).toBe("graveyard"); // 2 damage to a 2/2 once the +4/+4 is gone
  });

  it("Curiosity: only damage to an opponent of the Aura's controller, once per opponent", () => {
    const { s: s0, ap, opp } = setup([]);
    const sorc = putOnBattlefield(s0, opp, sorcerer);
    attach(s0, ap, curiosity, sorc);
    const hand = s0.players[ap]!.hand.length;
    // The enchanted creature (an opponent's) deals damage to the Aura's controller: no trigger.
    let s = act(s0, { type: "passPriority", player: ap });
    s = settle(act(s, { type: "activateAbility", player: opp, objectId: sorc, index: 0, targets: [{ kind: "player", id: ap }] }));
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.hand.length).toBe(hand);
    // To another player: the Aura's controller may draw.
    const third = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    s.objects[sorc]!.tapped = false;
    s = act(s, { type: "passPriority", player: ap });
    s = yes(act(s, { type: "activateAbility", player: opp, objectId: sorc, index: 0, targets: [{ kind: "player", id: third }] }));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("Abyssal Specter: whenever it deals damage to a player, that player discards", () => {
    const { s: s0, ap, opp } = setup([]);
    const sp = putOnBattlefield(s0, ap, specter);
    let s = attack(s0, ap, [{ attacker: sp, defender: opp }]);
    s = blocks(s);
    const hand = s.players[opp]!.hand.length;
    s = passUntil(s, "combatDamage", ap);
    for (let i = 0; i < 10 && s.pending?.kind !== "discard"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "discard", player: opp, count: 1 });
    s = act(s, { type: "discard", player: opp, objectIds: [s.players[opp]!.hand[0]!] });
    expect(s.players[opp]!.hand.length).toBe(hand - 1);
  });

  it("Acquisition Octopus draws when it or the creature it equips deals combat damage to a player", () => {
    const { s: s0, ap, opp } = setup([]);
    const o = putOnBattlefield(s0, ap, octopus);
    const b = putOnBattlefield(s0, ap, bear());
    const hand = s0.players[ap]!.hand.length;
    let s = attack(s0, ap, [{ attacker: o, defender: opp }]);
    s = settle(passUntil(blocks(s), "endCombat", ap));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    // Attached to the bear (reconfigured), the bear's damage draws instead.
    s = passUntil(s, "main1", ap);
    s = passUntil(passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!), "main1", ap);
    s.objects[o]!.attachedTo = b;
    invalidateCharacteristics(s);
    const before = s.players[ap]!.hand.length;
    s = attack(s, ap, [{ attacker: b, defender: opp }]);
    s = settle(passUntil(blocks(s), "endCombat", ap));
    expect(s.players[ap]!.hand.length).toBe(before + 1);
  });
});
