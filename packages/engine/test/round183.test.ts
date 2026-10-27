// Round 183: the lanes have met, so these are the harder cards both lanes skipped, from the most played down, and the
// cards that share their templates.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { characteristics, controllerOf, invalidateCharacteristics, isFullySupported, parseManaCost, planActivate, planCast, planMana, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Says yes (or no) to a "you may" question, paying its mana first. */
const may = (s: GameState, yes: boolean) => {
  if (s.pending?.kind !== "chooseMay") throw new Error("no question");
  const pid = s.pending.player;
  if (yes && s.pending.pay?.mana) for (const a of planMana(s, pid, parseManaCost(s.pending.pay.mana))!) s = act(s, a);
  return act(s, { type: "chooseMay", player: pid, yes });
};
/** Everyone passes until the stack is empty; "you may" questions get `yes`. Stops at any other question. */
const resolveAll = (s: GameState, yes = true) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending?.kind === "chooseMay"); i++) {
    if (s.pending?.kind === "chooseMay") s = may(s, yes);
    else if (s.pending) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** A card put straight into a zone, not from the battlefield. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const counters = (s: GameState, id: string, c = "+1/+1") => s.objects[id]!.counters[c] ?? 0;
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && [name, `${name} Token`].includes(characteristics(s, s.objects[id]!).name));
/** Attacks with `attackers`; `blocks` are declared by the defending player. */
const combat = (s: GameState, ap: PlayerId, opp: PlayerId, attackers: string[], blocks: { blocker: string; attacker: string }[] = []) => {
  s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: attackers.map((attacker) => ({ attacker, defender: opp })) });
  s = resolveAll(s);
  s = passUntil(s, "declareBlockers", ap);
  if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: opp, blocks });
  return resolveAll(passUntil(resolveAll(s), "combatDamage", ap));
};
/** Answers a target question for a trigger, if one is asked. */
const choose = (s: GameState, targets: TargetChoice[]) => (s.pending?.kind === "chooseTargets" ? resolveAll(act(s, { type: "chooseTargets", player: s.pending.player, targets })) : s);
const shock = card("Test Shock", "Instant", "{R}", { cmc: 1, oracleText: "This spell deals 2 damage to any target." });
const robot = card("Test Robot", "Artifact Creature — Robot", "{2}", { cmc: 2, power: "1", toughness: "1" });
const relic = card("Test Relic", "Artifact", "{1}", { cmc: 1 });
const big = card("Test Giant", "Creature — Giant", "{4}{G}", { cmc: 5, power: "5", toughness: "5" });
const elk = card("Test Elk", "Creature — Elk", "{3}{R}", { cmc: 4, power: "1", toughness: "1" });
const four = card("Test Ritual", "Sorcery", "{3}{W}", { cmc: 4, oracleText: "You gain 1 life." });
const three = card("Test Prayer", "Sorcery", "{2}{W}", { cmc: 3, oracleText: "You gain 1 life." });
const growth = card("Test Growth", "Instant", "{G}", { cmc: 1, oracleText: "Put a +1/+1 counter on target creature." });
const shield = card("Test Shield", "Instant", "{W}", { cmc: 1, oracleText: "Put a shield counter on target creature." });
const scout = bear({ name: "Test Scout", cmc: 2, oracleText: "When this creature enters, it explores." });
const cheap = card("Test Ghoul", "Creature — Zombie", "{4}{B}", { cmc: 5, power: "3", toughness: "3", oracleText: "This spell costs {1} less to cast for each creature card in your graveyard." });
const islandCard = card("Island", "Basic Land — Island");
const mountainCard = card("Mountain", "Basic Land — Mountain");
const forestCard = card("Forest", "Basic Land — Forest");

// Real oracle text (Scryfall).
const rhinoBarrelingBrute = card("Rhino, Barreling Brute", "Legendary Creature — Human Villain", "{3}{R}{R}{G}{G}", {cmc: 7,"power":"6","toughness":"7","keywords":["Vigilance","Haste","Trample"],"oracleText":"Vigilance, trample, haste\nWhenever Rhino attacks, if you've cast a spell with mana value 4 or greater this turn, draw a card.","colors":["G","R"]});
const wildgrowthWalker = card("Wildgrowth Walker", "Creature — Elemental", "{1}{G}", {cmc: 2,"power":"1","toughness":"3","keywords":["Explore"],"oracleText":"Whenever a creature you control explores, put a +1/+1 counter on this creature and you gain 3 life."});
const glacialDragonhunt = card("Glacial Dragonhunt", "Sorcery", "{U}{R}", {cmc: 2,"keywords":["Harmonize"],"oracleText":"Draw a card, then you may discard a card. When you discard a nonland card this way, Glacial Dragonhunt deals 3 damage to target creature.\nHarmonize {4}{U}{R} (You may cast this card from your graveyard for its harmonize cost. You may tap a creature you control to reduce that cost by {X}, where X is its power. Then exile this spell.)","colors":["R","U"]});
const pyreticRebirth = card("Pyretic Rebirth", "Instant", "{2}{B}{R}", {cmc: 4,"oracleText":"Return target artifact or creature card from your graveyard to your hand. Pyretic Rebirth deals damage equal to that card's mana value to up to one target creature or planeswalker.","colors":["B","R"]});
const guardianOfTazeem = card("Guardian of Tazeem", "Creature — Sphinx", "{3}{U}{U}", {cmc: 5,"power":"4","toughness":"5","keywords":["Landfall","Flying"],"oracleText":"Flying\nLandfall — Whenever a land you control enters, tap target creature an opponent controls. If that land is an Island, that creature doesn't untap during its controller's next untap step."});
const kothTheGeomancer = card("Koth, the Geomancer", "Legendary Creature — Human Warrior", "{2}{R}", {cmc: 3,"power":"3","toughness":"2","keywords":["Reach","Landfall"],"oracleText":"Reach\nLandfall — Whenever a land you control enters, Koth deals 1 damage to each opponent. If that land is a Mountain, add {R}."});
const duskmantleSeer = card("Duskmantle Seer", "Creature — Vampire Wizard", "{2}{U}{B}", {cmc: 4,"power":"4","toughness":"4","keywords":["Flying"],"oracleText":"Flying\nAt the beginning of your upkeep, each player reveals the top card of their library, loses life equal to that card's mana value, then puts it into their hand.","colors":["B","U"]});
const axgardArtisan = card("Axgard Artisan", "Creature — Dwarf Artificer", "{1}{R}", {cmc: 2,"power":"2","toughness":"1","keywords":["Treasure"],"oracleText":"Whenever one or more +1/+1 counters are put on this creature for the first time each turn, create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")"});
const ludevicNecroalchemist = card("Ludevic, Necro-Alchemist", "Legendary Creature — Human Wizard", "{1}{U}{R}", {cmc: 3,"power":"1","toughness":"4","keywords":["Partner"],"oracleText":"At the beginning of each player's end step, that player may draw a card if a player other than you lost life this turn.\nPartner (You can have two commanders if both have partner.)","colors":["R","U"]});
const unravel = card("Unravel", "Instant", "{1}{U}{U}", {cmc: 3,"oracleText":"Counter target spell. If the amount of mana spent to cast that spell was less than its mana value, you draw a card."});
const virulentWound = card("Virulent Wound", "Instant", "{B}", {cmc: 1,"oracleText":"Put a -1/-1 counter on target creature. When that creature dies this turn, its controller gets a poison counter."});
const ashlingTheExtinguisher = card("Ashling, the Extinguisher", "Legendary Creature — Elemental Shaman", "{2}{B}{B}", {cmc: 4,"power":"4","toughness":"4","oracleText":"Whenever Ashling deals combat damage to a player, choose target creature that player controls. The player sacrifices that creature."});
const blotOut = card("Blot Out", "Instant", "{2}{B}", {cmc: 3,"oracleText":"Target opponent exiles a creature or planeswalker they control with the greatest mana value among creatures and planeswalkers they control."});
const predatoryImpetus = card("Predatory Impetus", "Enchantment — Aura", "{4}{G}", {cmc: 5,"keywords":["Goad","Enchant"],"oracleText":"Enchant creature\nEnchanted creature gets +3/+3, must be blocked if able, and is goaded. (It attacks each combat if able and attacks a player other than you if able.)"});
const crackInTime = card("Crack in Time", "Enchantment", "{3}{W}", {cmc: 4,"keywords":["Vanishing"],"oracleText":"Vanishing 3 (This enchantment enters with three time counters on it. At the beginning of your upkeep, remove a time counter from it. When the last is removed, sacrifice it.)\nWhen this enchantment enters and at the beginning of your first main phase, exile target creature an opponent controls until this enchantment leaves the battlefield."});
const longFengGrandSecretariat = card("Long Feng, Grand Secretariat", "Legendary Creature — Human Advisor", "{1}{B/G}{B/G}", {cmc: 3,"power":"2","toughness":"3","oracleText":"Whenever another creature you control or a land you control is put into a graveyard from the battlefield, put a +1/+1 counter on target creature you control.","colors":["B","G"]});
const risonaAsariCommander = card("Risona, Asari Commander", "Legendary Creature — Human Samurai", "{1}{R}{W}", {cmc: 3,"power":"3","toughness":"3","keywords":["Haste"],"oracleText":"Haste\nWhenever Risona deals combat damage to a player, if it doesn't have an indestructible counter on it, put an indestructible counter on it.\nWhenever combat damage is dealt to you, remove an indestructible counter from Risona.","colors":["R","W"]});
const structuralAssault = card("Structural Assault", "Sorcery", "{3}{R}{R}", {cmc: 5,"oracleText":"Destroy all artifacts, then Structural Assault deals damage to each creature equal to the number of artifacts that were put into graveyards from the battlefield this turn."});

const thrillingDiscovery = card("Thrilling Discovery", "Sorcery", "{R}{W}", {cmc: 2,"oracleText":"You gain 2 life. Then you may discard two cards. If you do, draw three cards.","colors":["R","W"]});
const lanternOfInsight = card("Lantern of Insight", "Artifact", "{1}", {cmc: 1,"oracleText":"Players play with the top card of their libraries revealed.\n{T}, Sacrifice this artifact: Target player shuffles."});
const mathemagics = card("Mathemagics", "Sorcery", "{X}{X}{U}{U}", {cmc: 2,"oracleText":"Target player draws 2ˣ cards. (2⁰ = 1, 2¹ = 2, 2² = 4, 2³ = 8, 2⁴ = 16, 2⁵ = 32, and so on.)"});
const spiritOfTheLabyrinth = card("Spirit of the Labyrinth", "Enchantment Creature — Spirit", "{1}{W}", {cmc: 2,"power":"3","toughness":"1","oracleText":"Each player can't draw more than one card each turn."});
const dosanTheFallingLeaf = card("Dosan the Falling Leaf", "Legendary Creature — Human Monk", "{1}{G}{G}", {cmc: 3,"power":"2","toughness":"2","oracleText":"Players can cast spells only during their own turns."});
const skyfisherSpider = card("Skyfisher Spider", "Creature — Spider", "{2}{B}{G}", {cmc: 4,"power":"3","toughness":"3","keywords":["Reach"],"oracleText":"Reach\nWhen this creature enters, you may sacrifice another creature. When you do, destroy target nonland permanent.\nWhen this creature dies, you may gain 1 life for each creature card in your graveyard. If you do, exile this card from your graveyard.","colors":["B","G"]});
const sirensRuse = card("Siren's Ruse", "Instant", "{1}{U}", {cmc: 2,"oracleText":"Exile target creature you control, then return that card to the battlefield under its owner's control. If a Pirate was exiled this way, draw a card."});
const getawayGlamer = card("Getaway Glamer", "Instant", "{W}", {cmc: 1,"keywords":["Spree"],"oracleText":"Spree (Choose one or more additional costs.)\n+ {1} — Exile target nontoken creature. Return it to the battlefield under its owner's control at the beginning of the next end step.\n+ {2} — Destroy target creature if no other creature has greater power."});

const shadowedCaravel = card("Shadowed Caravel", "Artifact — Vehicle", "{2}", {cmc: 2,"power":"2","toughness":"2","keywords":["Crew","Explore"],"oracleText":"Whenever a creature you control explores, put a +1/+1 counter on this Vehicle.\nCrew 2 (Tap any number of creatures you control with total power 2 or more: This Vehicle becomes an artifact creature until end of turn.)"});
const merfolkCavediver = card("Merfolk Cave-Diver", "Creature — Merfolk Scout", "{2}{U}", {cmc: 3,"power":"2","toughness":"4","keywords":["Explore"],"oracleText":"Whenever a creature you control explores, this creature gets +1/+0 until end of turn and can't be blocked this turn."});
const lurkingChupacabra = card("Lurking Chupacabra", "Creature — Beast Horror", "{3}{B}", {cmc: 4,"power":"2","toughness":"3","keywords":["Explore"],"oracleText":"Whenever a creature you control explores, target creature an opponent controls gets -2/-2 until end of turn."});
const lieInWait = card("Lie in Wait", "Sorcery", "{B}{G}{U}", {cmc: 3,"oracleText":"Return target creature card from your graveyard to your hand. Lie in Wait deals damage equal to that card's power to target creature.","colors":["B","G","U"]});
const evieFrye = card("Evie Frye", "Legendary Creature — Human Assassin", "{1}{U}", {cmc: 2,"power":"2","toughness":"1","keywords":["Partner with","Partner"],"oracleText":"Partner with Jacob Frye (When this creature enters, target player may put Jacob into their hand from their library, then shuffle.)\n{1}, {T}: Draw a card, then discard a card. When you discard a creature card this way, target creature you control can't be blocked this turn."});
const endOfTheHunt = card("End of the Hunt", "Sorcery", "{1}{B}", {cmc: 2,"oracleText":"Target opponent exiles a creature or planeswalker they control with the greatest mana value among creatures and planeswalkers they control."});

describe("round 183", () => {
  it("all compile", () => supported(rhinoBarrelingBrute, wildgrowthWalker, glacialDragonhunt, pyreticRebirth, guardianOfTazeem, kothTheGeomancer, duskmantleSeer, axgardArtisan, ludevicNecroalchemist, unravel, virulentWound, ashlingTheExtinguisher, blotOut, predatoryImpetus, crackInTime, longFengGrandSecretariat, risonaAsariCommander, structuralAssault, thrillingDiscovery, lanternOfInsight, mathemagics, spiritOfTheLabyrinth, dosanTheFallingLeaf, skyfisherSpider, sirensRuse, getawayGlamer, shadowedCaravel, merfolkCavediver, lurkingChupacabra, lieInWait, evieFrye, endOfTheHunt));

  it("Rhino, Barreling Brute: draws on attack only after a spell with mana value 4 or greater this turn", () => {
    for (const [spell, draws] of [[three, 0], [four, 1]] as const) {
      const { s: s0, ap, ids, opp } = setup([spell]);
      const r = putOnBattlefield(s0, ap, rhinoBarrelingBrute);
      let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
      const hand = s.players[ap]!.hand.length;
      s = combat(s, ap, opp, [r]);
      expect(s.players[ap]!.hand.length, spell.name).toBe(hand + draws);
    }
  });

  it("Wildgrowth Walker: a creature you control explores, a counter and 3 life", () => {
    const { s: s0, ap, ids } = setup([scout]);
    const w = putOnBattlefield(s0, ap, wildgrowthWalker);
    into(s0, ap, forestCard, "library");
    const life = s0.players[ap]!.life;
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(counters(s, w)).toBe(1);
    expect(s.players[ap]!.life).toBe(life + 3);
  });

  it("Wildgrowth Walker: a nonland revealed, kept on top or not, still explores", () => {
    const { s: s0, ap, ids } = setup([scout]);
    const w = putOnBattlefield(s0, ap, wildgrowthWalker);
    into(s0, ap, bear(), "library");
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)), false);
    expect(counters(s, w)).toBe(1);
    expect(counters(s, named(s, ap, "Test Scout")[0]!)).toBe(1);
  });

  it("Glacial Dragonhunt: 3 damage only when the discarded card is a nonland card", () => {
    for (const [discard, dies] of [[forestCard, false], [shock, true]] as const) {
      const { s: s0, ap, ids, opp } = setup([glacialDragonhunt]);
      const b = putOnBattlefield(s0, opp, card("Test Wall", "Creature — Wall", "{2}", { cmc: 2, power: "0", toughness: "3" }));
      const d = into(s0, ap, discard, "hand");
      let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
      expect(s.pending?.kind, discard.name).toBe("discard");
      s = resolveAll(act(s, { type: "discard", player: ap, objectIds: [d] }));
      s = choose(s, [tgt(b)]);
      expect(zone(s, d)).toBe("graveyard");
      expect(zone(s, b), discard.name).toBe(dies ? "graveyard" : "battlefield");
    }
  });

  it("Pyretic Rebirth: returns the card and deals its mana value; no damage if the card is gone", () => {
    for (const gone of [false, true]) {
      const { s: s0, ap, ids, opp } = setup([pyreticRebirth]);
      const r = into(s0, ap, big, "graveyard");
      const g = putOnBattlefield(s0, opp, card("Test Wall", "Creature — Wall", "{2}", { cmc: 2, power: "0", toughness: "5" }));
      let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(r), tgt(g)]));
      if (gone) {
        // The card leaves the graveyard before the spell resolves: an illegal target, so no damage (rulings).
        s.players[ap]!.graveyard.splice(s.players[ap]!.graveyard.indexOf(r), 1);
        s.objects[r]!.zone = "exile";
        s.objects[r]!.zoneChanges = (s.objects[r]!.zoneChanges ?? 0) + 1;
        s.players[ap]!.exile.push(r);
      }
      s = resolveAll(s);
      expect(zone(s, r)).toBe(gone ? "exile" : "hand");
      expect(zone(s, g)).toBe(gone ? "battlefield" : "graveyard");
    }
  });

  it("Guardian of Tazeem: taps on landfall; an Island also keeps it tapped", () => {
    for (const [land, stays] of [[forestCard, false], [islandCard, true]] as const) {
      const { s: s0, ap, ids, opp } = setup([land]);
      putOnBattlefield(s0, ap, guardianOfTazeem);
      const b = putOnBattlefield(s0, opp, bear());
      let s = choose(resolveAll(act(s0, { type: "playLand", player: ap, objectId: ids[0]! })), [tgt(b)]);
      s = resolveAll(s);
      expect(s.objects[b]!.tapped).toBe(true);
      s = passUntil(s, "main1", opp);
      expect(s.objects[b]!.tapped, land.name).toBe(stays);
    }
  });

  it("Koth, the Geomancer: 1 damage to each opponent; a Mountain also adds {R}", () => {
    for (const [land, red] of [[forestCard, 0], [mountainCard, 1]] as const) {
      const { s: s0, ap, ids, opp } = setup([land]);
      putOnBattlefield(s0, ap, kothTheGeomancer);
      const life = s0.players[opp]!.life;
      const s = resolveAll(act(s0, { type: "playLand", player: ap, objectId: ids[0]! }));
      expect(s.players[opp]!.life).toBe(life - 1);
      expect(s.players[ap]!.manaPool.R ?? 0, land.name).toBe(red);
    }
  });

  it("Duskmantle Seer: each player reveals their top card, loses its mana value and puts it into their hand", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, duskmantleSeer);
    const prev = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 3) % 4]!;
    let s = passUntil(s0, "end", prev);
    const tops = s.turnOrder.map((pid, i) => into(s, pid, i % 2 ? big : forestCard, "library"));
    const life = s.turnOrder.map((pid) => s.players[pid]!.life);
    s = resolveAll(passUntil(s, "upkeep", ap));
    s.turnOrder.forEach((pid, i) => {
      expect(zone(s, tops[i]!)).toBe("hand");
      expect(s.players[pid]!.hand).toContain(tops[i]);
      expect(s.players[pid]!.life).toBe(life[i]! - (i % 2 ? 5 : 0));
    });
  });

  it("Axgard Artisan: a Treasure the first time +1/+1 counters are put on it each turn, not for other counters", () => {
    const { s: s0, ap, ids } = setup([shield, growth, growth]);
    const a = putOnBattlefield(s0, ap, axgardArtisan);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(a)])));
    expect(named(s, ap, "Treasure")).toHaveLength(0);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(a)])));
    expect(named(s, ap, "Treasure")).toHaveLength(1);
    s = resolveAll(run(s, planCast(s, ap, ids[2]!, [tgt(a)])));
    expect(named(s, ap, "Treasure")).toHaveLength(1);
  });

  it("Ludevic, Necro-Alchemist: the active player may draw only if a player other than you lost life this turn", () => {
    for (const hurt of [false, true]) {
      const { s: s0, ap, ids, opp } = setup([shock]);
      putOnBattlefield(s0, ap, ludevicNecroalchemist);
      let s = hurt ? resolveAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]))) : s0;
      s = passUntil(s, "end", ap);
      const hand = s.players[ap]!.hand.length;
      s = resolveAll(s);
      expect(s.players[ap]!.hand.length, String(hurt)).toBe(hand + (hurt ? 1 : 0));
    }
  });

  it("Unravel: counters the spell; draws only if less mana than its mana value was spent on it", () => {
    for (const reduced of [false, true]) {
      const { s: s0, ap, ids } = setup([cheap, unravel]);
      if (reduced) into(s0, ap, bear(), "graveyard");
      let s = run(s0, planCast(s0, ap, ids[0]!));
      for (let i = 0; i < 3; i++) putOnBattlefield(s, ap, islandCard);
      s = run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: s.stack.at(-1)!.id }]));
      const hand = s.players[ap]!.hand.length;
      s = resolveAll(s);
      expect(zone(s, ids[0]!)).toBe("graveyard");
      expect(s.players[ap]!.hand.length, String(reduced)).toBe(hand + (reduced ? 1 : 0));
    }
  });

  it("Virulent Wound: a -1/-1 counter, and a poison counter for its controller if it dies this turn", () => {
    const { s: s0, ap, ids, opp } = setup([virulentWound, virulentWound, shock]);
    const one = putOnBattlefield(s0, opp, card("Test Elf", "Creature — Elf", "{G}", { cmc: 1, power: "1", toughness: "1" }));
    const two = putOnBattlefield(s0, opp, bear());
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(one)])));
    expect(zone(s, one)).toBe("graveyard");
    expect(s.players[opp]!.poison ?? 0).toBe(1);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(two)])));
    expect(counters(s, two, "-1/-1")).toBe(1);
    expect(s.players[opp]!.poison ?? 0).toBe(1);
    s = resolveAll(run(s, planCast(s, ap, ids[2]!, [tgt(two)])));
    expect(zone(s, two)).toBe("graveyard");
    expect(s.players[opp]!.poison ?? 0).toBe(2);
  });

  it("Ashling, the Extinguisher: the player dealt combat damage sacrifices the creature chosen", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, ashlingTheExtinguisher);
    const b = putOnBattlefield(s0, opp, bear());
    const c = putOnBattlefield(s0, opp, big);
    let s = combat(s0, ap, opp, [a]);
    s = choose(s, [tgt(c)]);
    s = resolveAll(s);
    expect(zone(s, c)).toBe("graveyard");
    expect(zone(s, b)).toBe("battlefield");
  });

  it("Blot Out: the opponent exiles their creature or planeswalker with the greatest mana value", () => {
    const { s: s0, ap, ids, opp } = setup([blotOut]);
    const b = putOnBattlefield(s0, opp, bear());
    const c = putOnBattlefield(s0, opp, big);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(zone(s, c)).toBe("exile");
    expect(zone(s, b)).toBe("battlefield");
  });

  it("Predatory Impetus: +3/+3, must be blocked if able, and goaded", () => {
    const { s: s0, ap, ids, opp } = setup([predatoryImpetus]);
    const b = putOnBattlefield(s0, opp, bear());
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(pt(s, b)).toBe("5/5");
    const ch = characteristics(s, s.objects[b]!);
    expect(ch.mustBeBlocked).toBe(true);
    expect(ch.goadedBy).toContain(ap);
  });

  it("Crack in Time: exiles a creature as it enters and at each of your first main phases until it leaves", () => {
    const { s: s0, ap, ids, opp } = setup([crackInTime, card("Test Disenchant", "Instant", "{W}", { cmc: 1, oracleText: "Destroy target enchantment." })]);
    const b = putOnBattlefield(s0, opp, bear());
    const c = putOnBattlefield(s0, opp, big);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    s = choose(s, [tgt(b)]);
    expect(zone(s, b)).toBe("exile");
    const crack = named(s, ap, "Crack in Time")[0]!;
    expect(counters(s, crack, "time")).toBe(3);
    s = passUntil(s, "main1", ap === s.turnOrder[0] ? s.turnOrder[1] : s.turnOrder[0]);
    s = resolveAll(passUntil(s, "main1", ap));
    s = choose(s, [tgt(c)]);
    expect(zone(s, c)).toBe("exile");
    expect(counters(s, crack, "time")).toBe(2);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(crack)])));
    expect(named(s, opp, "Grizzly Bears")).toHaveLength(1);
    expect(named(s, opp, "Test Giant")).toHaveLength(1);
  });

  it("Long Feng, Grand Secretariat: a counter when another creature or a land of yours goes to a graveyard", () => {
    const { s: s0, ap, ids, opp } = setup([shock, card("Test Stone Rain", "Sorcery", "{2}{R}", { cmc: 3, oracleText: "Destroy target land." }), shock]);
    const l = putOnBattlefield(s0, ap, longFengGrandSecretariat);
    const g = putOnBattlefield(s0, ap, robot);
    const land = putOnBattlefield(s0, ap, forestCard);
    const theirs = putOnBattlefield(s0, opp, robot);
    let s = choose(resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(g)]))), [tgt(l)]);
    expect(counters(s, l)).toBe(1);
    s = choose(resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(land)]))), [tgt(l)]);
    expect(counters(s, l)).toBe(2);
    s = resolveAll(run(s, planCast(s, ap, ids[2]!, [tgt(theirs)])));
    expect(zone(s, theirs)).toBe("graveyard");
    expect(counters(s, l)).toBe(2);
  });

  it("Risona, Asari Commander: an indestructible counter on combat damage, lost when you're dealt combat damage", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, risonaAsariCommander);
    let s = combat(s0, ap, opp, [r]);
    expect(counters(s, r, "indestructible")).toBe(1);
    const theirs = putOnBattlefield(s, opp, bear());
    s = passUntil(s, "main1", opp);
    s = act(passUntil(s, "declareAttackers", opp), { type: "declareAttackers", player: opp, attacks: [{ attacker: theirs, defender: ap }] });
    s = resolveAll(passUntil(resolveAll(s), "combatDamage", opp));
    s = resolveAll(passUntil(s, "endCombat", opp));
    expect(counters(s, r, "indestructible")).toBe(0);
  });

  it("Structural Assault: destroys all artifacts, then damage equal to the artifacts put into graveyards from the battlefield this turn", () => {
    const { s: s0, ap, ids, opp } = setup([shock, structuralAssault]);
    const a = putOnBattlefield(s0, opp, robot);
    putOnBattlefield(s0, opp, relic);
    putOnBattlefield(s0, ap, relic);
    const w = putOnBattlefield(s0, opp, card("Test Wall", "Creature — Wall", "{2}", { cmc: 2, power: "0", toughness: "4" }));
    const b = putOnBattlefield(s0, opp, card("Test Ox", "Creature — Ox", "{2}", { cmc: 2, power: "0", toughness: "5" }));
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(a)])));
    expect(zone(s, a)).toBe("graveyard");
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    // The robot this turn and two relics now: 3 damage.
    expect(zone(s, w)).toBe("battlefield");
    expect(s.objects[w]!.damage).toBe(3);
    expect(s.objects[b]!.damage).toBe(3);
  });

  it("Thrilling Discovery: 2 life, then discarding two cards draws three; with fewer than two cards it can't be done", () => {
    for (const cards of [2, 1]) {
      const { s: s0, ap, ids } = setup([thrillingDiscovery]);
      const p = s0.players[ap]!;
      p.hand.filter((id) => id !== ids[0]).forEach((id) => {
        p.hand.splice(p.hand.indexOf(id), 1);
        s0.objects[id]!.zone = "graveyard";
        p.graveyard.push(id);
      });
      const kept = Array.from({ length: cards }, () => into(s0, ap, bear(), "hand"));
      const life = p.life;
      let s = run(s0, planCast(s0, ap, ids[0]!));
      s = resolveAll(s);
      if (cards === 2) {
        if (s.pending?.kind === "discard") s = resolveAll(act(s, { type: "discard", player: ap, objectIds: kept }));
        expect(kept.map((id) => zone(s, id))).toEqual(["graveyard", "graveyard"]);
        expect(s.players[ap]!.hand).toHaveLength(3);
      } else {
        expect(s.pending).toBeNull();
        expect(s.players[ap]!.hand).toEqual(kept);
      }
      expect(s.players[ap]!.life).toBe(life + 2);
    }
  });

  it("Lantern of Insight: target player shuffles", () => {
    const { s: s0, ap, opp } = setup([]);
    const l = putOnBattlefield(s0, ap, lanternOfInsight);
    const before = [...s0.players[opp]!.library];
    const s = resolveAll(run(s0, planActivate(s0, ap, l, 0, [{ kind: "player", id: opp }])));
    expect(zone(s, l)).toBe("graveyard");
    expect([...s.players[opp]!.library].sort()).toEqual([...before].sort());
    expect(s.players[opp]!.library).not.toEqual(before);
  });

  it("Mathemagics: draws two to the power of X cards", () => {
    for (const [x, n] of [[0, 1], [2, 4], [3, 8]] as const) {
      const { s: s0, ap, ids, opp } = setup([mathemagics]);
      const hand = s0.players[opp]!.hand.length;
      const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, undefined, x)));
      expect(s.players[opp]!.hand.length, String(x)).toBe(hand + n);
    }
  });

  it("Spirit of the Labyrinth: no player draws more than one card each turn, its controller included", () => {
    const { s: s0, ap, ids, opp } = setup([mathemagics, mathemagics]);
    putOnBattlefield(s0, opp, spiritOfTheLabyrinth);
    // The active player drew for the turn already.
    const hand = s0.players[ap]!.hand.length;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: ap }], undefined, undefined, 2)));
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    for (let i = 0; i < 3; i++) putOnBattlefield(s, ap, islandCard);
    const theirs = s.players[opp]!.hand.length;
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }], undefined, undefined, 2)));
    expect(s.players[opp]!.hand.length).toBe(theirs + 1);
  });

  it("Dosan the Falling Leaf: spells only during their caster's own turn", () => {
    const { s: s0, ap, ids, opp } = setup([shock]);
    putOnBattlefield(s0, ap, dosanTheFallingLeaf);
    expect(planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])).not.toBeNull();
    const s = passUntil(s0, "upkeep", opp);
    expect(waitingOn(s)).toBe(opp);
    let t = s;
    for (let i = 0; i < 8 && waitingOn(t) !== ap; i++) t = act(t, { type: "passPriority", player: waitingOn(t)! });
    expect(t.activePlayer).toBe(opp);
    expect(waitingOn(t)).toBe(ap);
    expect(planCast(t, ap, ids[0]!, [{ kind: "player", id: opp }])).toBeNull();
  });

  it("Skyfisher Spider: may gain life for each creature card in your graveyard, then it's exiled", () => {
    for (const yes of [true, false]) {
      const { s: s0, ap, ids } = setup([card("Test Bolt", "Instant", "{R}", { cmc: 1, oracleText: "This spell deals 3 damage to any target." })]);
      const sp = putOnBattlefield(s0, ap, skyfisherSpider);
      into(s0, ap, bear(), "graveyard");
      const life = s0.players[ap]!.life;
      const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(sp)])), yes);
      expect(zone(s, sp)).toBe(yes ? "exile" : "graveyard");
      expect(s.players[ap]!.life).toBe(life + (yes ? 2 : 0));
    }
  });

  it("Siren's Ruse: a blink that draws only if a Pirate was exiled", () => {
    for (const [def, draws] of [[bear(), 0], [card("Test Pirate", "Creature — Human Pirate", "{1}{U}", { cmc: 2, power: "2", toughness: "2" }), 1]] as const) {
      const { s: s0, ap, ids } = setup([sirensRuse]);
      const c = putOnBattlefield(s0, ap, def);
      s0.objects[c]!.tapped = true;
      const hand = s0.players[ap]!.hand.length;
      const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(c)])));
      const back = named(s, ap, def.name)[0]!;
      expect(back).toBeDefined();
      expect(s.objects[back]!.tapped).toBe(false);
      expect(s.players[ap]!.hand.length, def.name).toBe(hand - 1 + draws);
    }
  });

  it("Getaway Glamer: destroys the target only if no other creature has greater power", () => {
    for (const [bigger, dies] of [[true, false], [false, true]] as const) {
      const { s: s0, ap, ids, opp } = setup([getawayGlamer]);
      const b = putOnBattlefield(s0, opp, bear());
      if (bigger) putOnBattlefield(s0, ap, big);
      else putOnBattlefield(s0, ap, bear());
      const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)], [1])));
      expect(zone(s, b), String(bigger)).toBe(dies ? "graveyard" : "battlefield");
    }
  });

  it("Lie in Wait: returns the card, then damage equal to its power", () => {
    const { s: s0, ap, ids, opp } = setup([lieInWait]);
    const r = into(s0, ap, big, "graveyard");
    const g = putOnBattlefield(s0, opp, card("Test Wall", "Creature — Wall", "{2}", { cmc: 2, power: "0", toughness: "5" }));
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(r), tgt(g)])));
    expect(zone(s, r)).toBe("hand");
    expect(zone(s, g)).toBe("graveyard");
  });

  it("Lurking Chupacabra: a creature you control explores, -2/-2 to an opponent's creature", () => {
    const { s: s0, ap, ids, opp } = setup([scout]);
    putOnBattlefield(s0, ap, lurkingChupacabra);
    const b = putOnBattlefield(s0, opp, bear());
    into(s0, ap, forestCard, "library");
    const s = choose(resolveAll(run(s0, planCast(s0, ap, ids[0]!))), [tgt(b)]);
    expect(zone(s, b)).toBe("graveyard");
  });
});
