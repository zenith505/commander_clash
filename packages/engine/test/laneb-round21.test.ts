// Lane B, round 21: the cards the earlier rounds skipped, least played first (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, forest, island, passUntil, plains, putOnBattlefield, setup, swamp } from "./helpers";
import { abilityProblem, botActions, characteristics, invalidateCharacteristics, isFullySupported, isSnowSource, objHasKeyword, parseManaCost, planActivate, planCast, planMana, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty, answering "choose an opponent" with `options`, in order. Stops at any other question. */
const settle = (s: GameState, options: string[] = []) => {
  options = [...options];
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseOption" && options.length) s = act(s, { type: "chooseOption", player: p.player, choice: options.shift()! });
    else if (p?.kind === "chooseMay") s = run(s, [...(p.pay?.mana ? planMana(s, p.player, parseManaCost(p.pay.mana))! : []), { type: "chooseMay", player: p.player, yes: true }]);
    else if (p) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const creature = (name: string, typeLine: string, manaCost: string, p: number, t: number, extra: Partial<CardDef> = {}) =>
  card(name, typeLine, manaCost, { power: String(p), toughness: String(t), ...extra });
const greenBear = () => creature("Green Bear", "Creature — Bear", "{1}{G}", 2, 2, { cmc: 2 });
const whiteKnight = () => creature("White Knight", "Creature — Human Knight", "{1}{W}", 2, 2, { cmc: 2 });
const stoneWall = () => creature("Stone Wall", "Creature — Wall", "{1}{W}", 0, 7, { cmc: 2, keywords: ["Defender"], oracleText: "Defender" });
const bigBeast = () => creature("Big Beast", "Creature — Beast", "{3}{G}", 4, 5, { cmc: 4 });
const fencer = () => creature("First Fencer", "Creature — Human Soldier", "{1}{W}", 2, 2, { cmc: 2, keywords: ["First strike"], oracleText: "First strike" });
const nightVampire = () => creature("Night Vampire", "Creature — Vampire", "{1}{B}", 2, 2, { cmc: 2, oracleText: "{B}: Regenerate this creature." });
const holyStrength = card("Holy Strength", "Enchantment — Aura", "{W}", { cmc: 1, keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature gets +1/+2." });
const into = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard" | "library" = "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = []) => run(s, planCast(s, pid, id, targets));
const activateNow = (s: GameState, pid: PlayerId, id: string, index: number, targets: TargetChoice[] = [], costs?: CostChoices) =>
  run(s, planActivate(s, pid, id, index, targets, undefined, undefined, undefined, costs));
/** Puts an Aura or Equipment `def` onto the battlefield under `pid`, attached to `host`. */
const attach = (s: GameState, pid: PlayerId, def: CardDef, host: string) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.attachedTo = host;
  invalidateCharacteristics(s);
  return id;
};
/** Everyone passes until `pid`'s next upkeep (their lands untap on the way). */
const toUpkeep = (s: GameState, pid: PlayerId) => passUntil(passUntil(s, "end", pid), "upkeep", pid);
/** Passes to the declare attackers step of the active player's turn and declares `attackers` at `defender`. */
const attackWith = (s: GameState, attackers: string[], defender: PlayerId) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return settle(act(s, { type: "declareAttackers", player: s.activePlayer, attacks: attackers.map((attacker) => ({ attacker, defender })) }));
};
/** Passes to the declare blockers step and has the defending player declare `blocks` (blocker, attacker). */
const blockWith = (s: GameState, blocks: [string, string][]) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  const p = s.pending!;
  return settle(act(s, { type: "declareBlockers", player: p.player, blocks: blocks.map(([blocker, attacker]) => ({ blocker, attacker })) }));
};
/** Everyone passes on to the second main phase, through combat damage and end of combat. */
const afterCombat = (s: GameState) => settle(passUntil(s, "main2"));

// Real oracle text (Scryfall).
const sewerNemesis = card("Sewer Nemesis", "Creature — Horror", "{3}{B}", {"cmc":4,"power":"*","toughness":"*","keywords":["Mill"],"oracleText":"As this creature enters, choose a player.\nSewer Nemesis's power and toughness are each equal to the number of cards in the chosen player's graveyard.\nWhenever the chosen player casts a spell, that player mills a card."});
const nyxathid = card("Nyxathid", "Creature — Elemental", "{1}{B}{B}", {"cmc":3,"power":"7","toughness":"7","oracleText":"As this creature enters, choose an opponent.\nThis creature gets -1/-1 for each card in the chosen player's hand."});
const entropicSpecter = card("Entropic Specter", "Creature — Specter Spirit", "{3}{B}{B}", {"cmc":5,"power":"*","toughness":"*","keywords":["Flying"],"oracleText":"Flying\nAs this creature enters, choose an opponent.\nEntropic Specter's power and toughness are each equal to the number of cards in the chosen player's hand.\nWhenever this creature deals damage to a player, that player discards a card."});
const skyshroudWarBeast = card("Skyshroud War Beast", "Creature — Beast", "{1}{G}", {"cmc":2,"power":"*","toughness":"*","keywords":["Trample"],"oracleText":"Trample\nAs this creature enters, choose an opponent.\nSkyshroud War Beast's power and toughness are each equal to the number of nonbasic lands the chosen player controls."});
const lostOrderOfJarkeld = card("Lost Order of Jarkeld", "Creature — Human Knight", "{2}{W}{W}", {"cmc":4,"power":"1+*","toughness":"1+*","oracleText":"As this creature enters, choose an opponent.\nLost Order of Jarkeld's power and toughness are each equal to 1 plus the number of creatures the chosen player controls."});
const pallimud = card("Pallimud", "Creature — Beast", "{2}{R}", {"cmc":3,"power":"*","toughness":"3","oracleText":"As this creature enters, choose an opponent.\nPallimud's power is equal to the number of tapped lands the chosen player controls."});
const hauntingApparition = card("Haunting Apparition", "Creature — Spirit", "{1}{U}{B}", {"cmc":3,"power":"1+*","toughness":"2","keywords":["Flying"],"oracleText":"Flying\nAs this creature enters, choose an opponent.\nHaunting Apparition's power is equal to 1 plus the number of green creature cards in the chosen player's graveyard."});
const blackVise = card("Black Vise", "Artifact", "{1}", {"cmc":1,"oracleText":"As this artifact enters, choose an opponent.\nAt the beginning of the chosen player's upkeep, this artifact deals X damage to that player, where X is the number of cards in their hand minus 4."});
const theRack = card("The Rack", "Artifact", "{1}", {"cmc":1,"oracleText":"As this artifact enters, choose an opponent.\nAt the beginning of the chosen player's upkeep, this artifact deals X damage to that player, where X is 3 minus the number of cards in their hand."});
const energyVortex = card("Energy Vortex", "Enchantment", "{3}{U}{U}", {"cmc":5,"oracleText":"As this enchantment enters, choose an opponent.\nAt the beginning of your upkeep, remove all vortex counters from this enchantment.\nAt the beginning of the chosen player's upkeep, this enchantment deals 3 damage to that player unless they pay {1} for each vortex counter on this enchantment.\n{X}: Put X vortex counters on this enchantment. Activate only during your upkeep."});
const sawtoothOgre = card("Sawtooth Ogre", "Creature — Ogre", "{2}{R}{R}", {"cmc":4,"power":"3","toughness":"3","oracleText":"Whenever this creature blocks or becomes blocked by a creature, this creature deals 1 damage to that creature at end of combat."});
const mammothHarness = card("Mammoth Harness", "Enchantment — Aura", "{3}{G}", {"cmc":4,"keywords":["Enchant"],"oracleText":"Enchant creature\nEnchanted creature loses flying.\nWhenever enchanted creature blocks or becomes blocked by a creature, the other creature gains first strike until end of turn."});
const treefolkMystic = card("Treefolk Mystic", "Creature — Treefolk", "{3}{G}", {"cmc":4,"power":"2","toughness":"4","oracleText":"Whenever this creature blocks or becomes blocked by a creature, destroy all Auras attached to that creature."});
const dreamFighter = card("Dream Fighter", "Creature — Human Soldier", "{2}{U}", {"cmc":3,"power":"1","toughness":"1","oracleText":"Whenever this creature blocks or becomes blocked by a creature, this creature and that creature phase out. (While they're phased out, they're treated as though they don't exist. Each one phases in before its controller untaps during their next untap step.)"});
const deadironSledge = card("Dead-Iron Sledge", "Artifact — Equipment", "{1}", {"cmc":1,"keywords":["Equip"],"oracleText":"Whenever equipped creature blocks or becomes blocked by a creature, destroy both creatures.\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)"});
const barrowblade = card("Barrow-Blade", "Artifact — Equipment", "{1}", {"cmc":1,"keywords":["Equip"],"oracleText":"Equipped creature gets +1/+1.\nWhenever equipped creature blocks or becomes blocked by a creature, that creature loses all abilities until end of turn.\nEquip {1} ({1}: Attach to target creature you control. Equip only as a sorcery.)"});
const shapeStealer = card("Shape Stealer", "Creature — Shapeshifter Spirit", "{U}{U}", {"cmc":2,"power":"1","toughness":"1","oracleText":"Whenever this creature blocks or becomes blocked by a creature, this creature's base power and toughness become equal to that creature's power and toughness until end of turn."});
const giantShark = card("Giant Shark", "Creature — Shark", "{5}{U}", {"cmc":6,"power":"4","toughness":"4","oracleText":"This creature can't attack unless defending player controls an Island.\nWhenever this creature blocks or becomes blocked by a creature that has been dealt damage this turn, this creature gets +2/+0 and gains trample until end of turn.\nWhen you control no Islands, sacrifice this creature."});
const woodenStake = card("Wooden Stake", "Artifact — Equipment", "{2}", {"cmc":2,"keywords":["Equip"],"oracleText":"Equipped creature gets +1/+0.\nWhenever equipped creature blocks or becomes blocked by a Vampire, destroy that creature. It can't be regenerated.\nEquip {1} ({1}: Attach to target creature you control. Equip only as a sorcery.)"});
const venom = card("Venom", "Enchantment — Aura", "{1}{G}{G}", {"cmc":3,"keywords":["Enchant"],"oracleText":"Enchant creature\nWhenever enchanted creature blocks or becomes blocked by a non-Wall creature, destroy the other creature at end of combat."});
const naturesChosen = card("Nature's Chosen", "Enchantment — Aura", "{G}", {"cmc":1,"keywords":["Enchant"],"oracleText":"Enchant creature you control\n{0}: Untap enchanted creature. Activate only during your turn and only once each turn.\nTap enchanted creature: Untap target artifact, creature, or land. Activate only if enchanted creature is white and untapped and only once each turn."});
const veteransVoice = card("Veteran's Voice", "Enchantment — Aura", "{R}", {"cmc":1,"keywords":["Enchant"],"oracleText":"Enchant creature you control\nTap enchanted creature: Target creature other than the creature tapped this way gets +2/+1 until end of turn. Activate only if enchanted creature is untapped."});
const earthlore = card("Earthlore", "Enchantment — Aura", "{G}", {"cmc":1,"keywords":["Enchant"],"oracleText":"Enchant land you control\nTap enchanted land: Target blocking creature gets +1/+2 until end of turn. Activate only if enchanted land is untapped."});
const krovikanPlague = card("Krovikan Plague", "Enchantment — Aura", "{2}{B}", {"cmc":3,"keywords":["Enchant"],"oracleText":"Enchant non-Wall creature you control\nWhen this Aura enters, draw a card at the beginning of the next turn's upkeep.\nTap enchanted creature: This Aura deals 1 damage to any target. Put a -0/-1 counter on enchanted creature. Activate only if enchanted creature is untapped."});
const tourachsGate = card("Tourach's Gate", "Enchantment — Aura", "{1}{B}{B}", {"cmc":3,"keywords":["Enchant"],"oracleText":"Enchant land you control\nSacrifice a Thrull: Put three time counters on this Aura.\nAt the beginning of your upkeep, remove a time counter from this Aura. If there are no time counters on this Aura, sacrifice it.\nTap enchanted land: Attacking creatures you control get +2/-1 until end of turn. Activate only if enchanted land is untapped."});
const melting = card("Melting", "Enchantment", "{3}{R}", {"cmc":4,"oracleText":"All lands are no longer snow."});
const arcumsWeathervane = card("Arcum's Weathervane", "Artifact", "{2}", {"cmc":2,"oracleText":"{2}, {T}: Target snow land is no longer snow.\n{2}, {T}: Target nonsnow basic land becomes snow."});
const thermalFlux = card("Thermal Flux", "Instant", "{U}", {"cmc":1,"oracleText":"Choose one —\n• Target nonsnow permanent becomes snow until end of turn.\n• Target snow permanent isn't snow until end of turn.\nDraw a card at the beginning of the next turn's upkeep."});
const tek = card("Tek", "Artifact Creature — Dragon", "{5}", {"cmc":5,"power":"2","toughness":"2","oracleText":"This creature gets +0/+2 as long as you control a Plains, has flying as long as you control an Island, gets +2/+0 as long as you control a Swamp, has first strike as long as you control a Mountain, and has trample as long as you control a Forest."});
const tribalGolem = card("Tribal Golem", "Artifact Creature — Golem", "{6}", {"cmc":6,"power":"4","toughness":"4","keywords":["Regenerate"],"oracleText":"This creature has trample as long as you control a Beast, haste as long as you control a Goblin, first strike as long as you control a Soldier, flying as long as you control a Wizard, and \"{B}: Regenerate this creature\" as long as you control a Zombie."});
const smokeTeller = card("Smoke Teller", "Creature — Human Shaman", "{1}{G}", {"cmc":2,"power":"2","toughness":"2","oracleText":"{1}{U}: Look at target face-down creature."});
const avenSoulgazer = card("Aven Soulgazer", "Creature — Bird Cleric", "{3}{W}{W}", {"cmc":5,"power":"3","toughness":"3","keywords":["Flying"],"oracleText":"Flying\n{2}{W}: Look at target face-down creature."});

describe("Lane B round 21", () => {
  it("supports every card of the round", () => {
    supported(sewerNemesis, nyxathid, entropicSpecter, skyshroudWarBeast, lostOrderOfJarkeld, pallimud, hauntingApparition, blackVise, theRack, energyVortex,
      sawtoothOgre, mammothHarness, treefolkMystic, dreamFighter, deadironSledge, barrowblade, shapeStealer, giantShark, woodenStake, venom,
      naturesChosen, veteransVoice, earthlore, krovikanPlague, tourachsGate, melting, arcumsWeathervane, thermalFlux, tek, tribalGolem, smokeTeller, avenSoulgazer);
  });

  describe("as it enters, choose a player: the chosen player's cards", () => {
    it("Nyxathid gets -1/-1 for each card in the chosen opponent's hand, and the bot picks the one with the fewest", () => {
      const { s: s0, ap, ids, opp } = setup([nyxathid]);
      const other = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
      s0.players[other]!.hand.splice(1);
      s0.players[opp]!.hand.splice(3);
      let s = settle(castNow(s0, ap, ids[0]!));
      expect(s.pending).toMatchObject({ kind: "chooseOption", objectId: ids[0]! });
      expect(s.pending?.kind === "chooseOption" && s.pending.options).not.toContain(String(ap));
      expect(botActions(s, ap)).toEqual([{ type: "chooseOption", player: ap, choice: String(other) }]);
      s = settle(s, [String(opp)]);
      expect(pt(s, ids[0]!)).toBe("4/4");
      s.players[opp]!.hand.splice(0, 2);
      invalidateCharacteristics(s);
      expect(pt(s, ids[0]!)).toBe("6/6");
    });

    it("Sewer Nemesis counts the chosen player's graveyard and mills them whenever they cast a spell", () => {
      const { s: s0, ap, ids, opp } = setup([sewerNemesis]);
      into(s0, opp, greenBear(), "graveyard");
      into(s0, opp, greenBear(), "graveyard");
      const bolt = into(s0, opp, card("Shock", "Instant", "{R}", { cmc: 1, oracleText: "Shock deals 2 damage to any target." }));
      putOnBattlefield(s0, opp, card("Mountain", "Basic Land — Mountain"));
      let s = settle(settle(castNow(s0, ap, ids[0]!)), [String(opp)]);
      expect(s.objects[ids[0]!]!.chosen?.player).toBe(opp);
      expect(pt(s, ids[0]!)).toBe("2/2");
      // The chosen player casts a spell: the trigger mills one card; then Shock resolves too.
      s = act(s, { type: "passPriority", player: ap });
      const lib = s.players[opp]!.library.length;
      s = castNow(s, opp, bolt, [{ kind: "player", id: ap }]);
      s = settle(s);
      expect(s.players[opp]!.library.length).toBe(lib - 1);
      expect(pt(s, ids[0]!)).toBe("4/4"); // two Bears, the milled card and Shock
    });

    it("the other counting creatures read the chosen opponent's hand, lands, creatures and graveyard; a chosen player who left counts as nothing", () => {
      const { s, ap, opp } = setup([]);
      const other = s.turnOrder.find((p) => p !== ap && p !== opp)!;
      const chosen = (def: CardDef, who: PlayerId = opp) => {
        const id = putOnBattlefield(s, ap, def);
        s.objects[id]!.chosen = { player: who };
        return id;
      };
      s.players[opp]!.hand.splice(3);
      const specter = chosen(entropicSpecter);
      const beast = chosen(skyshroudWarBeast);
      const order = chosen(lostOrderOfJarkeld);
      const mud = chosen(pallimud);
      const ghost = chosen(hauntingApparition);
      const nemesis = chosen(sewerNemesis, other);
      putOnBattlefield(s, opp, card("Ancient Tomb", "Land", "", {}));
      const m1 = putOnBattlefield(s, opp, card("Mountain", "Basic Land — Mountain"));
      putOnBattlefield(s, opp, card("Mountain", "Basic Land — Mountain"));
      s.objects[m1]!.tapped = true;
      putOnBattlefield(s, opp, greenBear());
      putOnBattlefield(s, opp, whiteKnight());
      into(s, opp, greenBear(), "graveyard");
      into(s, opp, greenBear(), "graveyard");
      into(s, opp, whiteKnight(), "graveyard");
      into(s, other, whiteKnight(), "graveyard");
      invalidateCharacteristics(s);
      expect(pt(s, specter)).toBe("3/3");
      expect(pt(s, beast)).toBe("1/1"); // Ancient Tomb only: Mountains are basic
      expect(pt(s, order)).toBe("3/3");
      expect(pt(s, mud)).toBe("1/3");
      expect(pt(s, ghost)).toBe("3/2");
      expect(pt(s, nemesis)).toBe("1/1");
      // Sewer Nemesis's ruling: if the chosen player leaves the game, its power and toughness become 0.
      s.players[other]!.lost = true;
      invalidateCharacteristics(s);
      expect(pt(s, nemesis)).toBe("0/0");
    });

    it("Black Vise and The Rack deal damage only on the chosen player's upkeep, by the cards in their hand", () => {
      const { s: s0, ap, opp } = setup([]);
      const other = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
      const vise = putOnBattlefield(s0, ap, blackVise);
      s0.objects[vise]!.chosen = { player: opp };
      const rack = putOnBattlefield(s0, ap, theRack);
      s0.objects[rack]!.chosen = { player: other };
      s0.players[opp]!.hand.splice(5); // the trigger resolves in the upkeep, before the draw
      s0.players[other]!.hand.splice(1);
      const [l1, l2, l3] = [life(s0, ap), life(s0, opp), life(s0, other)];
      let s = settle(passUntil(s0, "upkeep", opp));
      expect(life(s, opp)).toBe(l2 - 1); // 5 cards: 5 - 4
      expect(life(s, other)).toBe(l3);
      expect(life(s, ap)).toBe(l1);
      s = settle(passUntil(s, "upkeep", other));
      expect(life(s, other)).toBe(l3 - 2); // 1 card: 3 - 1
      expect(life(s, opp)).toBe(l2 - 1);
    });

    it("the bot points Black Vise at the opponent with the most cards in hand and The Rack at the one with the fewest", () => {
      const { s: s0, ap, ids, opp } = setup([blackVise, theRack]);
      const [o1, o2] = s0.turnOrder.filter((p) => p !== ap && p !== opp);
      s0.players[opp]!.hand.splice(4);
      s0.players[o1!]!.hand.splice(1);
      for (let i = 0; i < 3; i++) into(s0, o2!, greenBear());
      let s = settle(castNow(s0, ap, ids[0]!));
      expect(botActions(s, ap)).toEqual([{ type: "chooseOption", player: ap, choice: String(o2) }]);
      s = settle(act(s, botActions(s, ap)[0]!));
      s = settle(castNow(s, ap, ids[1]!));
      expect(botActions(s, ap)).toEqual([{ type: "chooseOption", player: ap, choice: String(o1) }]);
    });

    it("Energy Vortex deals 3 damage on the chosen player's upkeep unless they pay {1} for each vortex counter", () => {
      const { s: s0, ap, opp } = setup([]);
      const vortex = putOnBattlefield(s0, ap, energyVortex);
      s0.objects[vortex]!.chosen = { player: opp };
      s0.objects[vortex]!.counters = { vortex: 2 };
      const l = life(s0, opp);
      let s = settle(passUntil(s0, "upkeep", opp));
      expect(s.pending).toMatchObject({ kind: "payUnless", player: opp, cost: "{2}" });
      s = settle(act(s, { type: "payUnless", player: opp, pay: false }));
      expect(life(s, opp)).toBe(l - 3);
      // Its controller's upkeep removes the counters; with none, paying {0} is free (CR 118.5).
      s = settle(passUntil(s, "upkeep", ap));
      expect(s.objects[vortex]!.counters.vortex ?? 0).toBe(0);
      s = settle(passUntil(s, "upkeep", opp));
      expect(s.pending).toBeNull();
      expect(life(s, opp)).toBe(l - 3);
      // With two counters again (put on after its controller's upkeep) and two lands, they pay.
      s = settle(passUntil(s, "upkeep", ap));
      s.objects[vortex]!.counters = { vortex: 2 };
      putOnBattlefield(s, opp, card("Mountain", "Basic Land — Mountain"));
      putOnBattlefield(s, opp, card("Mountain", "Basic Land — Mountain"));
      s = settle(passUntil(s, "upkeep", opp));
      expect(s.pending).toMatchObject({ kind: "payUnless", player: opp, cost: "{2}" });
      s = settle(run(s, [...planMana(s, opp, parseManaCost("{2}"))!, { type: "payUnless", player: opp, pay: true }]));
      expect(life(s, opp)).toBe(l - 3);
    });
  });

  describe("whenever it, or enchanted or equipped creature, blocks or becomes blocked by a creature", () => {
    it("Sawtooth Ogre deals 1 damage to each creature blocking it at end of combat, even if it died in the combat", () => {
      const { s: s0, ap, opp } = setup([]);
      const ogre = putOnBattlefield(s0, ap, sawtoothOgre);
      const b1 = putOnBattlefield(s0, opp, bigBeast());
      const b2 = putOnBattlefield(s0, opp, stoneWall());
      let s = blockWith(attackWith(s0, [ogre], opp), [[b1, ogre], [b2, ogre]]);
      s = afterCombat(s);
      expect(zone(s, ogre)).toBe("graveyard");
      // The Ogre's 3 combat damage went to the first blocker, then 1 more to each at end of combat.
      expect(s.objects[b1]!.damage + s.objects[b2]!.damage).toBe(5);
      expect(s.objects[b2]!.damage).toBeGreaterThanOrEqual(1);
      expect(s.objects[b1]!.damage).toBeGreaterThanOrEqual(1);
    });

    it("Mammoth Harness: enchanted creature loses flying, and the creature fighting it gains first strike", () => {
      const { s: s0, ap, opp } = setup([]);
      const bird = putOnBattlefield(s0, ap, creature("Blue Bird", "Creature — Bird", "{1}{U}", 2, 2, { cmc: 2, keywords: ["Flying"], oracleText: "Flying" }));
      attach(s0, opp, mammothHarness, bird);
      expect(objHasKeyword(s0, s0.objects[bird]!, "Flying")).toBe(false);
      const knight = putOnBattlefield(s0, opp, whiteKnight());
      let s = blockWith(attackWith(s0, [bird], opp), [[knight, bird]]);
      expect(objHasKeyword(s, s.objects[knight]!, "First strike")).toBe(true);
      s = afterCombat(s);
      expect(zone(s, bird)).toBe("graveyard");
      expect(zone(s, knight)).toBe("battlefield");
    });

    it("Treefolk Mystic destroys the Auras on the creature that blocks it", () => {
      const { s: s0, ap, opp } = setup([]);
      const mystic = putOnBattlefield(s0, ap, treefolkMystic);
      const wall = putOnBattlefield(s0, opp, stoneWall());
      const aura = attach(s0, opp, holyStrength, wall);
      const other = attach(s0, ap, holyStrength, mystic);
      const s = blockWith(attackWith(s0, [mystic], opp), [[wall, mystic]]);
      expect(zone(s, aura)).toBe("graveyard");
      expect(zone(s, other)).toBe("battlefield");
    });

    it("Dream Fighter and the creature blocking it phase out", () => {
      const { s: s0, ap, opp } = setup([]);
      const fighter = putOnBattlefield(s0, ap, dreamFighter);
      const beast = putOnBattlefield(s0, opp, bigBeast());
      let s = blockWith(attackWith(s0, [fighter], opp), [[beast, fighter]]);
      expect(zone(s, fighter)).toBe("phasedOut");
      expect(zone(s, beast)).toBe("phasedOut");
      s = afterCombat(s);
      expect(zone(s, fighter)).toBe("phasedOut");
      expect(life(s, opp)).toBe(life(s0, opp));
    });

    it("Dead-Iron Sledge destroys both creatures; Barrow-Blade makes the other creature lose its abilities", () => {
      const { s: s0, ap, opp } = setup([]);
      const bear = putOnBattlefield(s0, ap, greenBear());
      attach(s0, ap, deadironSledge, bear);
      const bear2 = putOnBattlefield(s0, ap, greenBear());
      attach(s0, ap, barrowblade, bear2);
      expect(pt(s0, bear2)).toBe("3/3");
      const wall = putOnBattlefield(s0, opp, stoneWall());
      const fence = putOnBattlefield(s0, opp, fencer());
      let s = blockWith(attackWith(s0, [bear, bear2], opp), [[wall, bear], [fence, bear2]]);
      expect(zone(s, bear)).toBe("graveyard");
      expect(zone(s, wall)).toBe("graveyard");
      expect(objHasKeyword(s, s.objects[fence]!, "First strike")).toBe(false);
      s = afterCombat(s);
      expect(zone(s, fence)).toBe("graveyard");
      expect(zone(s, bear2)).toBe("battlefield"); // 2 damage to a 3/3, dealt at the same time as its own
    });

    it("Shape Stealer's base power and toughness become the blocker's, locked in as the ability resolves", () => {
      const { s: s0, ap, opp } = setup([]);
      const stealer = putOnBattlefield(s0, ap, shapeStealer);
      const beast = putOnBattlefield(s0, opp, bigBeast());
      let s = blockWith(attackWith(s0, [stealer], opp), [[beast, stealer]]);
      expect(pt(s, stealer)).toBe("4/5");
      attach(s, opp, holyStrength, beast);
      expect(pt(s, beast)).toBe("5/7");
      expect(pt(s, stealer)).toBe("4/5");
      s = afterCombat(s);
      expect(zone(s, stealer)).toBe("graveyard"); // 5 damage
    });

    it("Giant Shark gets +2/+0 and trample only when the creature was dealt damage this turn", () => {
      const { s: s0, ap, opp } = setup([]);
      putOnBattlefield(s0, opp, island);
      const shark = putOnBattlefield(s0, opp, giantShark);
      const shark2 = putOnBattlefield(s0, opp, giantShark);
      const hurt = putOnBattlefield(s0, ap, bigBeast());
      const fresh = putOnBattlefield(s0, ap, bigBeast());
      s0.objects[hurt]!.damage = 1;
      s0.objects[hurt]!.wasDealtDamage = true;
      const s = blockWith(attackWith(s0, [hurt, fresh], opp), [[shark, hurt], [shark2, fresh]]);
      expect(pt(s, shark)).toBe("6/4");
      expect(objHasKeyword(s, s.objects[shark]!, "Trample")).toBe(true);
      expect(pt(s, shark2)).toBe("4/4");
    });

    it("Wooden Stake destroys a Vampire fighting equipped creature, and it can't be regenerated", () => {
      const { s: s0, ap, opp } = setup([]);
      const bear = putOnBattlefield(s0, ap, greenBear());
      attach(s0, ap, woodenStake, bear);
      expect(pt(s0, bear)).toBe("3/2");
      const vamp = putOnBattlefield(s0, opp, nightVampire());
      s0.objects[vamp]!.regenShields = 1;
      const s = blockWith(attackWith(s0, [bear], opp), [[vamp, bear]]);
      expect(zone(s, vamp)).toBe("graveyard");
    });

    it("Venom destroys the non-Wall creature fighting enchanted creature at end of combat", () => {
      const { s: s0, ap, opp } = setup([]);
      const bear = putOnBattlefield(s0, ap, greenBear());
      const bear2 = putOnBattlefield(s0, ap, greenBear());
      attach(s0, ap, venom, bear);
      attach(s0, ap, venom, bear2);
      const beast = putOnBattlefield(s0, opp, bigBeast());
      const wall = putOnBattlefield(s0, opp, stoneWall());
      let s = blockWith(attackWith(s0, [bear, bear2], opp), [[beast, bear], [wall, bear2]]);
      expect(zone(s, beast)).toBe("battlefield");
      s = afterCombat(s);
      expect(zone(s, beast)).toBe("graveyard");
      expect(zone(s, wall)).toBe("battlefield");
    });
  });

  describe("tap enchanted creature or land: a cost (CR 602.2b) that ignores summoning sickness (CR 302.6)", () => {
    it("Nature's Chosen untaps enchanted creature for {0} once on your turn, and taps a white one to untap a land", () => {
      const { s: s0, ap } = setup([]);
      const knight = putOnBattlefield(s0, ap, whiteKnight(), { sick: true });
      const chosenAura = attach(s0, ap, naturesChosen, knight);
      const land = s0.battlefield.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Forest")!;
      s0.objects[land]!.tapped = true;
      let s = activateNow(s0, ap, chosenAura, 1, [tgt(land)]);
      expect(s.objects[knight]!.tapped).toBe(true);
      s = settle(s);
      expect(s.objects[land]!.tapped).toBe(false);
      // Only once each turn, and only while it's untapped.
      expect(abilityProblem(s, ap, chosenAura, 1)).toBeTruthy();
      s = settle(activateNow(s, ap, chosenAura, 0));
      expect(s.objects[knight]!.tapped).toBe(false);
      expect(abilityProblem(s, ap, chosenAura, 0)).toBeTruthy();
      expect(abilityProblem(s, ap, chosenAura, 1)).toBeTruthy();
      // A green creature can't use the second ability.
      const bear = putOnBattlefield(s, ap, greenBear());
      const aura2 = attach(s, ap, naturesChosen, bear);
      expect(abilityProblem(s, ap, aura2, 1, [tgt(land)])).toBeTruthy();
    });

    it("Veteran's Voice taps enchanted creature to give another creature +2/+1; not the tapped one, and not while it's tapped", () => {
      const { s: s0, ap } = setup([]);
      const bear = putOnBattlefield(s0, ap, greenBear(), { sick: true });
      const other = putOnBattlefield(s0, ap, greenBear());
      const voice = attach(s0, ap, veteransVoice, bear);
      expect(abilityProblem(s0, ap, voice, 0, [tgt(bear)])).toBeTruthy();
      let s = settle(activateNow(s0, ap, voice, 0, [tgt(other)]));
      expect(pt(s, other)).toBe("4/3");
      expect(s.objects[bear]!.tapped).toBe(true);
      expect(abilityProblem(s, ap, voice, 0, [tgt(other)])).toBeTruthy();
    });

    it("Earthlore taps enchanted land to give a blocking creature +1/+2", () => {
      const { s: s0, ap, opp } = setup([]);
      const land = putOnBattlefield(s0, opp, forest);
      const lore = attach(s0, opp, earthlore, land);
      const attacker = putOnBattlefield(s0, ap, bigBeast());
      const wall = putOnBattlefield(s0, opp, greenBear());
      expect(abilityProblem(s0, opp, lore, 0, [tgt(wall)])).toBeTruthy(); // not blocking yet
      let s = blockWith(attackWith(s0, [attacker], opp), [[wall, attacker]]);
      s = act(s, { type: "passPriority", player: ap });
      s = settle(activateNow(s, opp, lore, 0, [tgt(wall)]));
      expect(s.objects[land]!.tapped).toBe(true);
      expect(pt(s, wall)).toBe("3/4");
    });

    it("Krovikan Plague: tap enchanted creature to deal 1 damage and put a -0/-1 counter on it; draw at the next upkeep", () => {
      const { s: s0, ap, opp, ids } = setup([krovikanPlague]);
      s0.players[ap]!.hand.splice(0, s0.players[ap]!.hand.length - 1); // no discarding to hand size on the way
      const bear = putOnBattlefield(s0, ap, greenBear(), { sick: true });
      let s = settle(castNow(s0, ap, ids[0]!, [tgt(bear)]));
      expect(s.objects[ids[0]!]!.attachedTo).toBe(bear);
      const l = life(s, opp);
      s = settle(activateNow(s, ap, ids[0]!, 0, [{ kind: "player", id: opp }]));
      expect(life(s, opp)).toBe(l - 1);
      expect(pt(s, bear)).toBe("2/1");
      expect(abilityProblem(s, ap, ids[0]!, 0, [{ kind: "player", id: opp }])).toBeTruthy();
      const hand = s.players[ap]!.hand.length;
      s = settle(passUntil(s, "upkeep", opp));
      expect(s.players[ap]!.hand.length).toBe(hand + 1);
    });

    it("Tourach's Gate: a Thrull for three time counters, one off each upkeep, sacrificed when none are left; tap the land to pump attackers", () => {
      const { s: s0, ap, opp } = setup([]);
      const land = putOnBattlefield(s0, ap, swamp);
      const gate = attach(s0, ap, tourachsGate, land);
      const thrull = putOnBattlefield(s0, ap, creature("Basal Thrull", "Creature — Thrull", "{B}", 1, 1, { cmc: 1 }));
      let s = settle(activateNow(s0, ap, gate, 0, [], { sacrifice: [thrull] }));
      expect(zone(s, thrull)).toBe("graveyard");
      expect(s.objects[gate]!.counters.time).toBe(3);
      const beast = putOnBattlefield(s, ap, bigBeast());
      s = attackWith(s, [beast], opp);
      s = settle(activateNow(s, ap, gate, 1));
      expect(pt(s, beast)).toBe("6/4");
      for (const left of [2, 1, 0]) {
        s = settle(toUpkeep(s, ap));
        if (left) expect(s.objects[gate]!.counters.time).toBe(left);
      }
      expect(zone(s, gate)).toBe("graveyard");
    });
  });

  describe("snow", () => {
    it("Melting makes every land nonsnow; Arcum's Weathervane takes snow away from one land or gives it to a basic", () => {
      const { s: s0, ap } = setup([]);
      const snowy = putOnBattlefield(s0, ap, card("Snow-Covered Forest", "Basic Snow Land — Forest"));
      const plain = putOnBattlefield(s0, ap, plains);
      const vane = putOnBattlefield(s0, ap, arcumsWeathervane);
      expect(isSnowSource(s0, s0.objects[snowy]!)).toBe(true);
      expect(abilityProblem(s0, ap, vane, 0, [tgt(plain)])).toBeTruthy();
      expect(abilityProblem(s0, ap, vane, 1, [tgt(snowy)])).toBeTruthy();
      let s = settle(activateNow(s0, ap, vane, 1, [tgt(plain)]));
      expect(isSnowSource(s, s.objects[plain]!)).toBe(true);
      s.objects[vane]!.tapped = false;
      s = settle(activateNow(s, ap, vane, 0, [tgt(snowy)]));
      expect(isSnowSource(s, s.objects[snowy]!)).toBe(false);
      expect(characteristics(s, s.objects[snowy]!).supertypes).toContain("Basic");
      // Still nonsnow next turn (no duration).
      s = settle(toUpkeep(s, ap));
      expect(isSnowSource(s, s.objects[snowy]!)).toBe(false);
      putOnBattlefield(s, ap, melting);
      expect(isSnowSource(s, s.objects[plain]!)).toBe(false);
    });

    it("Thermal Flux makes a permanent snow, or not, until end of turn, and draws a card at the next upkeep", () => {
      const { s: s0, ap, ids } = setup([thermalFlux, thermalFlux]);
      s0.players[ap]!.hand.splice(0, s0.players[ap]!.hand.length - 2); // no discarding to hand size on the way
      const bear = putOnBattlefield(s0, ap, greenBear());
      const snowy = putOnBattlefield(s0, ap, card("Snow-Covered Forest", "Basic Snow Land — Forest"));
      let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(bear)], [0])));
      expect(isSnowSource(s, s.objects[bear]!)).toBe(true);
      s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(snowy)], [1])));
      expect(isSnowSource(s, s.objects[snowy]!)).toBe(false);
      const hand = s.players[ap]!.hand.length;
      s = settle(passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!));
      expect(isSnowSource(s, s.objects[bear]!)).toBe(false);
      expect(isSnowSource(s, s.objects[snowy]!)).toBe(true);
      expect(s.players[ap]!.hand.length).toBe(hand + 2);
    });
  });

  it("Tek and Tribal Golem: each bonus as long as you control the land type or creature type", () => {
    const { s, ap, opp } = setup([]);
    const t = putOnBattlefield(s, opp, tek);
    expect(pt(s, t)).toBe("2/2");
    expect(["Flying", "First strike", "Trample"].map((k) => objHasKeyword(s, s.objects[t]!, k))).toEqual([false, false, false]);
    putOnBattlefield(s, opp, plains);
    putOnBattlefield(s, opp, swamp);
    putOnBattlefield(s, opp, island);
    invalidateCharacteristics(s);
    expect(pt(s, t)).toBe("4/4");
    expect(["Flying", "First strike", "Trample"].map((k) => objHasKeyword(s, s.objects[t]!, k))).toEqual([true, false, false]);
    const golem = putOnBattlefield(s, ap, tribalGolem);
    expect(["Trample", "Haste", "First strike", "Flying"].map((k) => objHasKeyword(s, s.objects[golem]!, k))).toEqual([false, false, false, false]);
    putOnBattlefield(s, ap, creature("Goblin Guide", "Creature — Goblin Scout", "{R}", 2, 2, { cmc: 1 }));
    putOnBattlefield(s, ap, creature("Merfolk Wizard", "Creature — Merfolk Wizard", "{U}", 1, 1, { cmc: 1 }));
    invalidateCharacteristics(s);
    expect(["Trample", "Haste", "First strike", "Flying"].map((k) => objHasKeyword(s, s.objects[golem]!, k))).toEqual([false, true, false, true]);
    expect(planActivate(s, ap, golem, 0)).toBeNull(); // no Zombie: no regeneration ability
    putOnBattlefield(s, ap, creature("Walking Corpse", "Creature — Zombie", "{1}{B}", 2, 2, { cmc: 2 }));
    invalidateCharacteristics(s);
    const regen = settle(activateNow(s, ap, golem, 0));
    expect(regen.objects[golem]!.regenShields).toBe(1);
  });

  it("Smoke Teller and Aven Soulgazer look at a face-down creature: only their controller learns what it is", () => {
    const { s: s0, ap, opp } = setup([]);
    const teller = putOnBattlefield(s0, ap, smokeTeller);
    const gazer = putOnBattlefield(s0, ap, avenSoulgazer);
    const hidden = putOnBattlefield(s0, opp, creature("Secret Beast", "Creature — Beast", "{4}{G}", 5, 5, { cmc: 5, oracleText: "Morph {4}{G}", keywords: ["Morph"] }));
    s0.objects[hidden]!.faceDown = "morph";
    const up = putOnBattlefield(s0, opp, greenBear());
    invalidateCharacteristics(s0);
    expect(abilityProblem(s0, ap, teller, 0, [tgt(up)])).toBeTruthy();
    let s = settle(activateNow(s0, ap, teller, 0, [tgt(hidden)]));
    const seen = s.log.filter((e) => e.text.includes("Secret Beast"));
    expect(seen.length).toBe(1);
    expect(seen[0]!.to).toBe(ap);
    expect(s.objects[hidden]!.faceDown).toBe("morph");
    s = settle(activateNow(s, ap, gazer, 0, [tgt(hidden)]));
    expect(s.log.filter((e) => e.text.includes("Secret Beast") && e.to === ap).length).toBe(2);
  });
});
