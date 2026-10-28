// Round 198: targets "of the chosen type" on a permanent's abilities, the creature type chosen as it entered (Dawn-Blessed
// Pennant, Kindred Boon, From the Rubble), "unless its controller has ~ deal damage to them equal to ~'s power" (Combustion
// Man), "card not named ~" targets and "for each permanent you control but don't own" (Staff of Eden, Vault's Key), "can't
// be blocked as long as its power is 3 or less" (Thieves' Tools), "As ~ enters, roll X d6" for its counters (Neverwinter
// Hydra), "For each creature, its controller sacrifices it unless they pay X life" (Killing Wave), "Then if there are three
// or more collection counters on it, sacrifice it. If you do, draw a card, then you may search ..." (Charitable Levy),
// "Whenever a creature you control but don't own dies" (Edea, Possessed Sorceress), behold (Sarkhan, Dragon Ascendant), a
// mana ability that returns its source to hand, as a sorcery (Grinning Ignus), "Choose creature or land" for the cards
// revealed (Winding Way), "whenever your commander attacks" from the graveyard (Vivi's Persistence),
// "up to twice X target cards" (Erebos's Intervention).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, parseManaCost, planMana, characteristics, defOf, manaOptions, planManaAbility, invalidateCharacteristics, objHasKeyword, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question. */
const resolveAll = (s: GameState) => {
  for (let i = 0; i < 120 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const choose = (s: GameState, targets: TargetChoice[]) => (s.pending?.kind === "chooseTargets" ? act(s, { type: "chooseTargets", player: s.pending.player, targets }) : s);
const pt = (s: GameState, id: ObjectId) => [power(s, s.objects[id]!), toughness(s, s.objects[id]!)];
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
const creature = (name: string, sub: string, p: number, t = p, cost = "{G}") => card(name, `Creature — ${sub}`, cost, { cmc: cost.match(/\{/g)?.length ?? 0, power: String(p), toughness: String(t) });

// Real oracle text (Scryfall).
const combustionMan = card("Combustion Man", "Legendary Creature — Human Assassin", "{3}{R}{R}", {"cmc":5,"power":"4","toughness":"6","keywords":[],"oracleText":"Whenever Combustion Man attacks, destroy target permanent unless its controller has Combustion Man deal damage to them equal to his power.","colors":["R"],"colorIdentity":["R"]});
const dawnblessedPennant = card("Dawn-Blessed Pennant", "Artifact", "{1}", {"cmc":1,"keywords":[],"oracleText":"As this artifact enters, choose Elemental, Elf, Faerie, Giant, Goblin, Kithkin, Merfolk, or Treefolk.\nWhenever a permanent you control of the chosen type enters, you gain 1 life.\n{2}, {T}, Sacrifice this artifact: Return target card of the chosen type from your graveyard to your hand.","colors":[],"colorIdentity":[]});
const kindredBoon = card("Kindred Boon", "Enchantment", "{2}{W}{W}", {"cmc":4,"keywords":[],"oracleText":"As this enchantment enters, choose a creature type.\n{1}{W}: Put a divinity counter on target creature you control of the chosen type.\nEach creature you control with a divinity counter on it has indestructible.","colors":["W"],"colorIdentity":["W"]});
const fromTheRubble = card("From the Rubble", "Enchantment", "{4}{W}{W}", {"cmc":6,"keywords":[],"oracleText":"As this enchantment enters, choose a creature type.\nAt the beginning of your end step, return target creature card of the chosen type from your graveyard to the battlefield with a finality counter on it. (If a creature with a finality counter on it would die, exile it instead.)","colors":["W"],"colorIdentity":["W"]});
const staffOfEdenVaultsKey = card("Staff of Eden, Vault's Key", "Legendary Artifact", "{6}", {"cmc":6,"keywords":[],"oracleText":"When Staff of Eden enters, put target legendary permanent card not named Staff of Eden, Vault's Key from a graveyard onto the battlefield under your control.\n{T}: Draw a card for each permanent you control but don't own.","colors":[],"colorIdentity":[]});
const thievesTools = card("Thieves' Tools", "Artifact — Equipment", "{1}{B}", {"cmc":2,"keywords":["Treasure","Equip"],"oracleText":"When this Equipment enters, create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")\nEquipped creature can't be blocked as long as its power is 3 or less.\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)","colors":["B"],"colorIdentity":["B"]});
const neverwinterHydra = card("Neverwinter Hydra", "Creature — Hydra", "{X}{X}{G}{G}", {"cmc":2,"power":"0","toughness":"0","keywords":["Trample","Ward"],"oracleText":"As this creature enters, roll X d6. It enters with a number of +1/+1 counters on it equal to the total of those results.\nTrample\nWard {4} (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays {4}.)","colors":["G"],"colorIdentity":["G"]});
const killingWave = card("Killing Wave", "Sorcery", "{X}{B}", {"cmc":1,"keywords":[],"oracleText":"For each creature, its controller sacrifices it unless they pay X life.","colors":["B"],"colorIdentity":["B"]});
const charitableLevy = card("Charitable Levy", "Enchantment", "{1}{W}", {"cmc":2,"keywords":[],"oracleText":"Noncreature spells cost {1} more to cast.\nWhenever a player casts a noncreature spell, put a collection counter on this enchantment. Then if there are three or more collection counters on it, sacrifice it. If you do, draw a card, then you may search your library for a Plains card, put it onto the battlefield tapped, then shuffle.","colors":["W"],"colorIdentity":["W"]});
const edeaPossessedSorceress = card("Edea, Possessed Sorceress", "Legendary Creature — Human Warlock", "{2}{U}{B}{R}", {"cmc":5,"power":"2","toughness":"5","keywords":["Ward"],"oracleText":"Ward {2}\nAt the beginning of combat on your turn, gain control of target creature an opponent controls until end of turn. Untap that creature. It gains haste until end of turn.\nWhenever a creature you control but don't own dies, return it to the battlefield under its owner's control and you draw a card.","colors":["B","R","U"],"colorIdentity":["B","R","U"]});
const sarkhanDragonAscendant = card("Sarkhan, Dragon Ascendant", "Legendary Creature — Human Druid", "{1}{R}", {"cmc":2,"power":"2","toughness":"2","keywords":["Behold","Treasure"],"oracleText":"When Sarkhan enters, you may behold a Dragon. If you do, create a Treasure token. (To behold a Dragon, choose a Dragon you control or reveal a Dragon card from your hand.)\nWhenever a Dragon you control enters, put a +1/+1 counter on Sarkhan. Until end of turn, Sarkhan becomes a Dragon in addition to his other types and gains flying.","colors":["R"],"colorIdentity":["R"]});
const grinningIgnus = card("Grinning Ignus", "Creature — Elemental", "{2}{R}", {"cmc":3,"power":"2","toughness":"2","keywords":[],"oracleText":"{R}, Return this creature to its owner's hand: Add {C}{C}{R}. Activate only as a sorcery.","colors":["R"],"colorIdentity":["R"]});
const windingWay = card("Winding Way", "Sorcery", "{1}{G}", {"cmc":2,"keywords":[],"oracleText":"Choose creature or land. Reveal the top four cards of your library. Put all cards of the chosen type revealed this way into your hand and the rest into your graveyard.","colors":["G"],"colorIdentity":["G"]});
const vivisPersistence = card("Vivi's Persistence", "Instant", "{1}{R}", {"cmc":2,"keywords":[],"oracleText":"Create a 0/1 black Wizard creature token with \"Whenever you cast a noncreature spell, this token deals 1 damage to each opponent.\"\nWhenever your commander enters or attacks, you may pay {2}. If you do, return this card from your graveyard to your hand.","colors":["R"],"colorIdentity":["R"]});
const erebossIntervention = card("Erebos's Intervention", "Instant", "{X}{B}", {"cmc":1,"keywords":[],"oracleText":"Choose one —\n• Target creature gets -X/-X until end of turn. You gain X life.\n• Exile up to twice X target cards from graveyards.","colors":["B"],"colorIdentity":["B"]});
const ALL = [combustionMan, dawnblessedPennant, kindredBoon, fromTheRubble, staffOfEdenVaultsKey, thievesTools, neverwinterHydra, killingWave, charitableLevy, edeaPossessedSorceress, sarkhanDragonAscendant, grinningIgnus, windingWay, vivisPersistence, erebossIntervention];

describe("Round 198", () => {
  it("all compile", () => supported(...ALL));

  it("Dawn-Blessed Pennant: the type is chosen as it enters, and only a card of that type can be returned", () => {
    const { s: s0, ap, ids } = setup([dawnblessedPennant]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = resolveAll(s);
    expect(s.pending?.kind).toBe("chooseOption");
    expect(s.pending?.kind === "chooseOption" && s.pending.options).toEqual(["Elemental", "Elf", "Faerie", "Giant", "Goblin", "Kithkin", "Merfolk", "Treefolk"]);
    s = act(s, { type: "chooseOption", player: ap, choice: "Elf" });
    s = resolveAll(s);
    const pennant = ids[0]!;
    expect(s.objects[pennant]!.zone).toBe("battlefield");
    const elf = into(s, ap, creature("Test Elf", "Elf Druid", 1), "graveyard");
    const goblin = into(s, ap, creature("Test Goblin", "Goblin", 1), "graveyard");
    // A Kindred Elf card counts too: a card of that type (CR 205.3d).
    const kindred = into(s, ap, card("Test Elf Kindred", "Kindred Instant — Elf", "{G}", { cmc: 1 }), "graveyard");
    expect(planActivate(s, ap, pennant, 0, [tgt(goblin)])).toBeNull();
    expect(planActivate(s, ap, pennant, 0, [tgt(kindred)])).not.toBeNull();
    s = run(s, planActivate(s, ap, pennant, 0, [tgt(elf)]));
    s = resolveAll(s);
    expect(s.objects[elf]!.zone).toBe("hand");
    expect(s.objects[pennant]!.zone).toBe("graveyard");
  });

  it("Dawn-Blessed Pennant: with no type chosen, its ability can't be activated (rulings on Kindred Boon)", () => {
    const { s, ap } = setup([]);
    const pennant = putOnBattlefield(s, ap, dawnblessedPennant);
    const elf = into(s, ap, creature("Test Elf", "Elf", 1), "graveyard");
    expect(planActivate(s, ap, pennant, 0, [tgt(elf)])).toBeNull();
  });

  it("Kindred Boon: a divinity counter only on a creature you control of the chosen type, and it's indestructible", () => {
    const { s: s0, ap, opp } = setup([]);
    const boon = putOnBattlefield(s0, ap, kindredBoon);
    s0.objects[boon]!.chosen = { type: "Cat" };
    const cat = putOnBattlefield(s0, ap, creature("Test Cat", "Cat", 2));
    const ox = putOnBattlefield(s0, ap, creature("Test Ox", "Ox", 2));
    const theirCat = putOnBattlefield(s0, opp, creature("Test Their Cat", "Cat", 2));
    invalidateCharacteristics(s0);
    expect(planActivate(s0, ap, boon, 0, [tgt(ox)])).toBeNull();
    expect(planActivate(s0, ap, boon, 0, [tgt(theirCat)])).toBeNull();
    let s = run(s0, planActivate(s0, ap, boon, 0, [tgt(cat)]));
    s = resolveAll(s);
    expect(s.objects[cat]!.counters.divinity).toBe(1);
    s.objects[cat]!.damage = 5;
    invalidateCharacteristics(s);
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[cat]!.zone).toBe("battlefield");
  });

  it("From the Rubble: at your end step, a creature card of the chosen type returns with a finality counter", () => {
    const { s: s0, ap } = setup([]);
    const rubble = putOnBattlefield(s0, ap, fromTheRubble);
    s0.objects[rubble]!.chosen = { type: "Soldier" };
    const soldier = into(s0, ap, creature("Test Soldier", "Human Soldier", 2), "graveyard");
    const ox = into(s0, ap, creature("Test Ox", "Ox", 2), "graveyard");
    let s = passUntil(s0, "end", ap);
    expect(s.pending?.kind).toBe("chooseTargets");
    expect(() => choose(s, [tgt(ox)])).toThrow();
    s = choose(s, [tgt(soldier)]);
    s = resolveAll(s);
    expect(s.objects[soldier]!.zone).toBe("battlefield");
    expect(s.objects[soldier]!.counters.finality).toBe(1);
    expect(s.objects[ox]!.zone).toBe("graveyard");
  });
  const combust = (pick: (s: GameState) => GameState) => {
    const { s: s0, ap, opp } = setup([]);
    s0.players[ap]!.hand = [];
    const man = putOnBattlefield(s0, ap, combustionMan);
    const theirs = putOnBattlefield(s0, opp, creature("Test Their Ox", "Ox", 3));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: man, defender: opp }] });
    s = choose(s, [tgt(theirs)]);
    s = resolveAll(s);
    expect(s.pending?.kind === "chooseOption" && s.pending.what === "punisher" && s.pending.player).toBe(opp);
    expect(s.pending?.kind === "chooseOption" && s.pending.labels).toEqual(["Be dealt 4 damage", "Let Combustion Man destroy it"]);
    s = resolveAll(pick(s));
    return { s, ap, opp, man, theirs };
  };

  it("Combustion Man: the permanent's controller takes damage equal to his power to save it", () => {
    const { s, opp, theirs } = combust((s) => act(s, { type: "chooseOption", player: s.pending!.player, choice: "0" }));
    expect(s.players[opp]!.life).toBe(36);
    expect(s.objects[theirs]!.zone).toBe("battlefield");
  });

  it("Combustion Man: or the permanent is destroyed", () => {
    const { s, opp, theirs } = combust((s) => act(s, { type: "chooseOption", player: s.pending!.player, choice: "none" }));
    expect(s.players[opp]!.life).toBe(40);
    expect(s.objects[theirs]!.zone).toBe("graveyard");
  });

  it("Combustion Man: a bot weighs the damage against the permanent", () => {
    const { s: s0, ap, opp } = setup([]);
    s0.players[ap]!.hand = [];
    const man = putOnBattlefield(s0, ap, combustionMan);
    const big = putOnBattlefield(s0, opp, creature("Test Their Wurm", "Wurm", 8));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: man, defender: opp }] });
    s = choose(s, [tgt(big)]);
    s = resolveAll(s);
    expect(s.pending?.kind).toBe("chooseOption");
    for (const a of botActions(s, opp)) s = applyAction(s, a);
    s = resolveAll(s);
    expect(s.objects[big]!.zone).toBe("battlefield");
    expect(s.players[opp]!.life).toBe(36);
  });

  it("Staff of Eden: returns a legendary permanent card not named Staff of Eden from any graveyard, then draws for each permanent you control but don't own", () => {
    const { s: s0, ap, opp, ids } = setup([staffOfEdenVaultsKey]);
    const legend = into(s0, opp, card("Test Legend", "Legendary Creature — Ox", "{2}", { cmc: 2, power: "2", toughness: "2" }), "graveyard");
    const otherStaff = into(s0, ap, staffOfEdenVaultsKey, "graveyard");
    const plain = into(s0, opp, creature("Test Ox", "Ox", 2), "graveyard");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = resolveAll(s);
    expect(s.pending?.kind).toBe("chooseTargets");
    expect(() => choose(s, [tgt(otherStaff)])).toThrow();
    expect(() => choose(s, [tgt(plain)])).toThrow();
    s = choose(s, [tgt(legend)]);
    s = resolveAll(s);
    expect(s.objects[legend]!.zone).toBe("battlefield");
    expect(s.objects[legend]!.controller).toBe(ap);
    expect(s.objects[legend]!.owner).toBe(opp);
    const hand = s.players[ap]!.hand.length;
    s = run(s, planActivate(s, ap, ids[0]!, 0));
    s = resolveAll(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("Thieves' Tools: equipped creature with power 3 or less can't be blocked; with 4 it can", () => {
    for (const big of [false, true]) {
      const { s: s0, ap, opp } = setup([]);
      s0.players[ap]!.hand = [];
      const tools = putOnBattlefield(s0, ap, thievesTools);
      const rogue = putOnBattlefield(s0, ap, creature("Test Rogue", "Human Rogue", 3));
      s0.objects[tools]!.attachedTo = rogue;
      if (big) s0.objects[rogue]!.counters["+1/+1"] = 1;
      const wall = putOnBattlefield(s0, opp, creature("Test Wall", "Wall", 0, 8));
      invalidateCharacteristics(s0);
      let s = passUntil(s0, "declareAttackers", ap);
      s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: rogue, defender: opp }] });
      s = passUntil(s, "declareBlockers");
      const block = () => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: wall, attacker: rogue }] } as Action);
      if (big) expect(block().objects[wall]!.blocking).toBeTruthy();
      else expect(block).toThrow();
    }
  });
  it("Neverwinter Hydra: X d6 rolled as it enters, the total in +1/+1 counters, and the roll is an event", () => {
    const { s: s0, ap, ids } = setup([neverwinterHydra]);
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 3));
    s = resolveAll(s);
    const n = s.objects[ids[0]!]!.counters["+1/+1"] ?? 0;
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(n).toBeGreaterThanOrEqual(3);
    expect(n).toBeLessThanOrEqual(18);
    expect(s.log.some((l) => /rolls 3 d6 for Neverwinter Hydra/.test(l.text))).toBe(true);
  });

  it("Neverwinter Hydra: with X 0 nothing is rolled and it dies as a 0/0", () => {
    const { s: s0, ap, ids } = setup([neverwinterHydra]);
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 0));
    s = resolveAll(s);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("Killing Wave: each player keeps the creatures they pay X life for; the rest are sacrificed at once", () => {
    const { s: s0, ap, opp, ids } = setup([killingWave]);
    s0.players[ap]!.hand = [ids[0]!];
    const mine = [putOnBattlefield(s0, ap, creature("Test Ox", "Ox", 2)), putOnBattlefield(s0, ap, creature("Test Yak", "Yak", 2))];
    const theirs = [putOnBattlefield(s0, opp, creature("Test Elk", "Elk", 2)), putOnBattlefield(s0, opp, creature("Test Emu", "Bird", 2))];
    s0.players[opp]!.life = 5;
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 3));
    s = resolveAll(s);
    // The active player first.
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "keep", payLife: 3, count: 2, min: 0 });
    s = act(s, { type: "pickPermanents", player: ap, ids: [mine[0]!] });
    // An opponent with 5 life can pay for one.
    for (let i = 0; i < 5 && s.pending?.kind === "pickPermanents" && s.pending.player !== opp; i++) s = act(s, { type: "pickPermanents", player: s.pending.player, ids: [] });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: opp, count: 1 });
    expect(() => act(s, { type: "pickPermanents", player: opp, ids: theirs })).toThrow();
    s = act(s, { type: "pickPermanents", player: opp, ids: [theirs[1]!] });
    for (let i = 0; i < 5 && s.pending?.kind === "pickPermanents"; i++) s = act(s, { type: "pickPermanents", player: s.pending.player, ids: [] });
    s = resolveAll(s);
    expect(s.players[ap]!.life).toBe(37);
    expect(s.players[opp]!.life).toBe(2);
    expect(mine.map((id) => s.objects[id]!.zone)).toEqual(["battlefield", "graveyard"]);
    expect(theirs.map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "battlefield"]);
  });

  it("Killing Wave: a bot keeps a creature only when it's worth the life", () => {
    const { s: s0, ap, opp, ids } = setup([killingWave]);
    const small = putOnBattlefield(s0, opp, creature("Test Elk", "Elk", 1));
    const big = putOnBattlefield(s0, opp, creature("Test Wurm", "Wurm", 7, 7, "{5}{G}{G}"));
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 4));
    s = resolveAll(s);
    for (let i = 0; i < 6 && s.pending?.kind === "pickPermanents"; i++) {
      if (s.pending.player === opp) for (const a of botActions(s, opp)) s = applyAction(s, a);
      else s = act(s, { type: "pickPermanents", player: s.pending.player, ids: [] });
    }
    s = resolveAll(s);
    expect(s.objects[big]!.zone).toBe("battlefield");
    expect(s.objects[small]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(36);
  });
  it("Charitable Levy: a collection counter for each noncreature spell; at three it's sacrificed, then a card and a Plains", () => {
    const { s: s0, ap, opp } = setup([]);
    const levy = putOnBattlefield(s0, ap, charitableLevy);
    const plains = into(s0, ap, card("Plains", "Basic Land — Plains"), "library");
    // Not the card it draws.
    s0.players[ap]!.library = [...s0.players[ap]!.library.slice(1), plains];
    const spell = card("Test Ponder", "Sorcery", "{U}", { cmc: 1, oracleText: "Draw a card.", colors: ["U"] });
    let s = s0;
    // Its controller's spells count too ("a player"), each costing {1} more.
    for (let i = 0; i < 3; i++) {
      const id = into(s, ap, spell, "hand");
      s = run(s, planCast(s, ap, id));
      if (i < 2) {
        s = resolveAll(s);
        expect(s.objects[levy]!.counters.collection).toBe(i + 1);
      }
    }
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(s);
    expect(s.pending?.kind).toBe("chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: true } as Action);
    if (s.pending?.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: ap, found: [plains] } as Action);
    s = resolveAll(s);
    expect(s.objects[levy]!.zone).toBe("graveyard");
    // Levy's card, then the spell's (the trigger resolves first, rulings).
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(s.objects[plains]!.zone).toBe("battlefield");
    expect(s.objects[plains]!.tapped).toBe(true);
  });

  it("Edea, Possessed Sorceress: a creature you control but don't own that dies returns to its owner, and you draw", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, edeaPossessedSorceress);
    const stolen = putOnBattlefield(s0, opp, creature("Test Their Ox", "Ox", 2));
    s0.objects[stolen]!.controller = ap;
    const mine = putOnBattlefield(s0, ap, creature("Test Ox", "Ox", 2));
    invalidateCharacteristics(s0);
    const hand = s0.players[ap]!.hand.length;
    s0.objects[stolen]!.damage = 2;
    s0.objects[mine]!.damage = 2;
    invalidateCharacteristics(s0);
    let s = act(s0, { type: "passPriority", player: waitingOn(s0)! });
    s = resolveAll(s);
    expect(s.objects[stolen]!.zone).toBe("battlefield");
    expect(s.objects[stolen]!.controller).toBe(opp);
    expect(s.objects[mine]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  const treasures = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid && characteristics(s, s.objects[id]!).subtypes.includes("Treasure")).length;
  const castSarkhan = (behold: (s: GameState, ap: PlayerId) => ObjectId | undefined) => {
    const { s: s0, ap, ids } = setup([sarkhanDragonAscendant]);
    const pick = behold(s0, ap);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = resolveAll(s);
    return { s, ap, sarkhan: ids[0]!, pick };
  };

  it("Sarkhan, Dragon Ascendant: behold by revealing a Dragon card from your hand (CR 701.4a); the card stays there", () => {
    const { s: s1, ap, pick } = castSarkhan((s, ap) => into(s, ap, creature("Test Dragon", "Dragon", 4, 4, "{4}{R}"), "hand"));
    expect(s1.pending?.kind === "searchLibrary" && s1.pending.behold && s1.pending.cards).toEqual([pick]);
    const s = act(s1, { type: "searchLibrary", player: ap, found: [pick!] });
    expect(treasures(s, ap)).toBe(1);
    expect(s.objects[pick!]!.zone).toBe("hand");
    expect(s.log.some((l) => /beholds Test Dragon from their hand/.test(typeof l === "string" ? l : JSON.stringify(l)))).toBe(true);
  });

  it("Sarkhan, Dragon Ascendant: or by choosing a Dragon you control; an opponent's Dragon or a Goblin card can't be beheld", () => {
    const { s: s1, ap, pick } = castSarkhan((s, ap) => {
      putOnBattlefield(s, s.players.find((p) => p.id !== ap)!.id, creature("Test Their Dragon", "Dragon", 4));
      into(s, ap, creature("Test Goblin", "Goblin", 1), "hand");
      return putOnBattlefield(s, ap, creature("Test Dragon", "Dragon", 4));
    });
    expect(s1.pending?.kind === "searchLibrary" && s1.pending.cards).toEqual([pick]);
    const s = act(s1, { type: "searchLibrary", player: ap, found: [pick!] });
    expect(treasures(s, ap)).toBe(1);
    expect(s.objects[pick!]!.zone).toBe("battlefield");
  });

  it("Sarkhan, Dragon Ascendant: beholding nothing makes no Treasure, and with no Dragon there's no question", () => {
    const { s: s1, ap } = castSarkhan((s, ap) => into(s, ap, creature("Test Dragon", "Dragon", 4), "hand"));
    const s = act(s1, { type: "searchLibrary", player: ap, found: [] });
    expect(treasures(s, ap)).toBe(0);
    const { s: s2, ap: ap2 } = castSarkhan(() => undefined);
    expect(s2.pending ?? undefined).toBeUndefined();
    expect(treasures(s2, ap2)).toBe(0);
  });

  it("Sarkhan, Dragon Ascendant: a Dragon you control entering gives him a +1/+1 counter, and he's a flying Dragon this turn", () => {
    const { s: s0, ap, ids } = setup([creature("Test Dragon", "Dragon", 4, 4, "{R}")]);
    const sarkhan = putOnBattlefield(s0, ap, sarkhanDragonAscendant);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = resolveAll(s);
    const o = s.objects[sarkhan]!;
    expect(pt(s, sarkhan)).toEqual([3, 3]);
    expect(characteristics(s, o).subtypes).toEqual(expect.arrayContaining(["Human", "Druid", "Dragon"]));
    expect(objHasKeyword(s, o, "Flying")).toBe(true);
  });

  it("Sarkhan, Dragon Ascendant: a bot beholds when it can", () => {
    const { s: s1, ap, pick } = castSarkhan((s, ap) => putOnBattlefield(s, ap, creature("Test Dragon", "Dragon", 4)));
    let s = s1;
    for (const a of botActions(s, ap)) s = act(s, a);
    expect(treasures(s, ap)).toBe(1);
    expect(s.objects[pick!]!.zone).toBe("battlefield");
  });

  const poolOf = (s: GameState, pid: PlayerId) => Object.entries(s.players[pid]!.manaPool).filter(([, n]) => n).map(([m, n]) => `${m}${n}`).join(" ");
  it("Grinning Ignus: {R} and returning it to hand add {C}{C}{R}, a mana ability (rulings); then it's cast again from the pool", () => {
    const { s: s0, ap } = setup([]);
    for (const p of Object.values(s0.players)) p.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    const ignus = putOnBattlefield(s0, ap, grinningIgnus);
    const x = manaOptions(s0, s0.objects[ignus]!)[0]!;
    let s = run(s0, planManaAbility(s0, ap, ignus, x.ability, x.mana, undefined, x.extra, x.combo));
    expect(s.objects[ignus]!.zone).toBe("hand");
    expect(poolOf(s, ap)).toBe("R1 C2");
    expect(s.stack.length).toBe(0);
    s = run(s, planCast(s, ap, ignus));
    expect(poolOf(s, ap)).toBe("");
    s = resolveAll(s);
    expect(s.objects[ignus]!.zone).toBe("battlefield");
  });

  it("Grinning Ignus: only as a sorcery, so not with a spell on the stack, and never used to pay automatically", () => {
    const bear = creature("Test Bear", "Bear", 2, 2, "{1}{G}");
    const { s: s0, ap, ids } = setup([bear, creature("Test Cub", "Bear", 2, 2, "{1}{R}")]);
    for (const p of Object.values(s0.players)) p.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    const ignus = putOnBattlefield(s0, ap, grinningIgnus);
    const s = run(s0, planCast(s0, ap, ids[0]!));
    expect(s.stack.length).toBe(1);
    expect(planManaAbility(s, ap, ignus, 0, "C")).toBeNull();
    // One untapped Mountain: {1}{R} only with Ignus's mana, which paying never takes.
    const s1 = structuredClone(s0);
    for (const id of s1.battlefield) if (s1.objects[id]!.controller === ap && id !== ignus) s1.objects[id]!.tapped = true;
    s1.objects[s1.battlefield.find((id) => s1.objects[id]!.controller === ap && defOf(s1, s1.objects[id]!).name === "Mountain")!]!.tapped = false;
    expect(planCast(s1, ap, ids[1]!)).toBeNull();
  });

  it("Winding Way: the card type is chosen as it resolves; all revealed cards of that type go to hand, the rest to the graveyard", () => {
    for (const [pick, want] of [["Creature", ["Test Elf", "Test Ox"]], ["Land", ["Test Land"]]] as const) {
      const { s: s0, ap, ids } = setup([windingWay]);
      const top = [creature("Test Elf", "Elf", 1), card("Test Land", "Land", "", { cmc: 0 }), creature("Test Ox", "Ox", 2), card("Test Bolt", "Instant", "{R}", { cmc: 1 })];
      const tops = [...top].reverse().map((d) => into(s0, ap, d, "library")).reverse();
      let s = run(s0, planCast(s0, ap, ids[0]!));
      s = resolveAll(s);
      expect(s.pending?.kind === "chooseOption" && s.pending.options).toEqual(["Creature", "Land"]);
      s = act(s, { type: "chooseOption", player: ap, choice: pick });
      s = resolveAll(s);
      expect(s.pending ?? undefined).toBeUndefined();
      const zone = (n: string) => s.objects[tops[top.findIndex((d) => d.name === n)]!]!.zone;
      for (const d of top) expect(zone(d.name), `${pick}: ${d.name}`).toBe((want as readonly string[]).includes(d.name) ? "hand" : "graveyard");
    }
  });

  it("Vivi's Persistence: from your graveyard, when your commander enters and when it attacks, pay {2} to return it to hand", () => {
    let { s, ap } = setup([]);
    const vivi = into(s, ap, vivisPersistence, "graveyard");
    const cmd = s.players[ap]!.command[0]!;
    s = run(s, planCast(s, ap, cmd));
    s = resolveAll(s);
    expect(s.objects[cmd]!.zone).toBe("battlefield");
    expect(s.pending?.kind).toBe("chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: false } as Action);
    s = resolveAll(s);
    expect(s.objects[vivi]!.zone).toBe("graveyard");
    // Another creature attacking does nothing; the commander does.
    const other = putOnBattlefield(s, ap, creature("Test Ox", "Ox", 2));
    s.objects[cmd]!.controlledSinceTurn = s.turn - 1;
    s = passUntil(s, "declareAttackers", ap);
    const defender = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % s.turnOrder.length]!;
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: other, defender }, { attacker: cmd, defender }] });
    s = resolveAll(s);
    expect(s.pending?.kind).toBe("chooseMay");
    s = run(s, [...planMana(s, ap, parseManaCost("{2}"))!, { type: "chooseMay", player: ap, yes: true } as Action]);
    s = resolveAll(s);
    expect(s.pending ?? undefined).toBeUndefined();
    expect(s.objects[vivi]!.zone).toBe("hand");
  });

  it("Vivi's Persistence: in hand or on the stack it doesn't trigger", () => {
    let { s, ap } = setup([vivisPersistence]);
    const cmd = s.players[ap]!.command[0]!;
    s = run(s, planCast(s, ap, cmd));
    s = resolveAll(s);
    expect(s.pending ?? undefined).toBeUndefined();
  });

  it("Erebos's Intervention: exile up to twice X target cards from graveyards, no more", () => {
    const { s: s0, ap, opp, ids } = setup([erebossIntervention]);
    const cards = [0, 1, 2, 3, 4].map((i) => into(s0, i % 2 ? opp : ap, creature(`Test Dead ${i}`, "Ox", 1), "graveyard"));
    expect(planCast(s0, ap, ids[0]!, cards.map(tgt), [1], undefined, 2)).toBeNull();
    let s = run(s0, planCast(s0, ap, ids[0]!, cards.slice(0, 4).map(tgt), [1], undefined, 2));
    s = resolveAll(s);
    expect(cards.map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile", "exile", "exile", "graveyard"]);
  });

  it("Erebos's Intervention: or the creature gets -X/-X and you gain X life", () => {
    const { s: s0, ap, opp, ids } = setup([erebossIntervention]);
    const ox = putOnBattlefield(s0, opp, creature("Test Ox", "Ox", 4));
    const life = s0.players[ap]!.life;
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(ox)], [0], undefined, 3));
    s = resolveAll(s);
    expect(pt(s, ox)).toEqual([1, 1]);
    expect(s.players[ap]!.life).toBe(life + 3);
  });
});
