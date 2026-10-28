// Lane B, round 27: the cards the earlier rounds skipped, least played first (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, potentialAttackers, castProblem, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty, answering choices as the bots would; the choices a test makes stop it. */
const settle = (s: GameState, stopAt: (s: GameState) => boolean = () => false) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (stopAt(s)) break;
    const p = s.pending;
    if (p?.kind === "discard" || p?.kind === "declareAttackers" || p?.kind === "declareBlockers") break;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Stops at a decision of this kind for `pid`. */
const at = (kind: string, pid: PlayerId) => (s: GameState) => s.pending?.kind === kind && s.pending.player === pid;
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const creature = (name: string, typeLine: string, manaCost: string, p: number, t: number, extra: Partial<CardDef> = {}) =>
  card(name, typeLine, manaCost, { power: String(p), toughness: String(t), ...extra });
const bigBeast = () => creature("Big Beast", "Creature — Beast", "{3}{G}", 4, 5, { cmc: 4 });
const greenBear = () => creature("Green Bear", "Creature — Bear", "{1}{G}", 2, 2, { cmc: 2 });
const whiteKnight = () => creature("White Knight", "Creature — Human Knight", "{1}{W}", 2, 2, { cmc: 2 });
const blueDrake = () => creature("Blue Drake", "Creature — Drake", "{2}{U}{U}", 2, 3, { cmc: 4, colors: ["U"] });
const whiteCharm = () => card("White Charm", "Instant", "{W}", { cmc: 1, oracleText: "You gain 1 life." });
const shock = () => card("Shock", "Instant", "{R}", { cmc: 1, oracleText: "Shock deals 2 damage to any target." });
const ironRing = () => card("Iron Ring", "Artifact", "{3}", { cmc: 3 });
const murder = () => card("Murder", "Instant", "{1}{B}{B}", { cmc: 3, oracleText: "Destroy target creature." });
const goodOmen = () => card("Good Omen", "Enchantment", "{1}{W}", { cmc: 2 });
/** Moves a new card for `def` into `pid`'s hand, graveyard or library (on top). */
const into = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard" | "library" = "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
const pool = (s: GameState, pid: PlayerId, mana: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  s.players[pid]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...mana };
};
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices: CostChoices = {}) => run(s, planCast(s, pid, id, targets, undefined, "auto", undefined, choices));
const activateNow = (s: GameState, pid: PlayerId, id: string, index: number, targets: TargetChoice[] = [], x?: number, costs?: CostChoices) => run(s, planActivate(s, pid, id, index, targets, undefined, undefined, x, costs));
/** Passes priority (empty stack) until `pid` has it. */
const priorityTo = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 8 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Passes to the declare attackers step of the active player's turn and declares `attackers` at `defender`. */
const attackWith = (s: GameState, attackers: string[], defender: PlayerId) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return settle(act(s, { type: "declareAttackers", player: s.activePlayer, attacks: attackers.map((attacker) => ({ attacker, defender })) }));
};
/** Passes through combat damage (no blocks). */
const throughDamage = (s: GameState) => {
  for (let i = 0; i < 80 && s.step !== "main2"; i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const mine = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === name);
/** Taps every land `pid` controls, so only the mana pool pays. */
const tapLands = (s: GameState, pid: PlayerId) => {
  for (const id of s.battlefield) if (s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.typeLine.includes("Land")) s.objects[id]!.tapped = true;
};
const handOf = (s: GameState, pid: PlayerId) => s.players[pid]!.hand.length;

// Real oracle text (Scryfall).
const charrumbler = card("Char-Rumbler", "Creature — Elemental", "{2}{R}{R}", {"cmc":4,"power":"-1","toughness":"3","oracleText":"Double strike\n{R}: This creature gets +1/+0 until end of turn.","colors":["R"],"colorIdentity":["R"],"keywords":["Double strike"]});
const spinalParasite = card("Spinal Parasite", "Artifact Creature — Insect", "{5}", {"cmc":5,"power":"-1","toughness":"-1","oracleText":"Sunburst (This creature enters with a +1/+1 counter on it for each color of mana spent to cast it.)\nRemove two +1/+1 counters from this creature: Remove a counter from target permanent.","colors":[],"colorIdentity":[],"keywords":["Sunburst"]});
const lootTheAnomaly = card("Loot, the Anomaly", "Legendary Creature — Beast Horror", "{2}{B}", {"cmc":3,"power":"-2","toughness":"4","oracleText":"If Loot's power is negative, he assigns combat damage as though his power were positive.\nThreshold — Sacrifice another creature or planeswalker: Loot gets -2/-0 until end of turn. Activate only if there are seven or more cards in your graveyard.","colors":["B"],"colorIdentity":["B"],"keywords":["Threshold"]});
const fieryBombardment = card("Fiery Bombardment", "Enchantment", "{1}{R}", {"cmc":2,"oracleText":"Chroma — {2}, Sacrifice a creature: This enchantment deals damage to any target equal to the number of red mana symbols in the sacrificed creature's mana cost.","colors":["R"],"colorIdentity":["R"],"keywords":["Chroma"]});
const heartlashCinder = card("Heartlash Cinder", "Creature — Elemental Warrior", "{1}{R}", {"cmc":2,"power":"1","toughness":"1","oracleText":"Haste\nChroma — When this creature enters, it gets +X/+0 until end of turn, where X is the number of red mana symbols in the mana costs of permanents you control.","colors":["R"],"colorIdentity":["R"],"keywords":["Haste","Chroma"]});
const lightFromWithin = card("Light from Within", "Enchantment", "{2}{W}{W}", {"cmc":4,"oracleText":"Chroma — Each creature you control gets +1/+1 for each white mana symbol in its mana cost.","colors":["W"],"colorIdentity":["W"],"keywords":["Chroma"]});
const outrageShaman = card("Outrage Shaman", "Creature — Goblin Shaman", "{3}{R}{R}", {"cmc":5,"power":"2","toughness":"2","oracleText":"Chroma — When this creature enters, it deals damage to target creature equal to the number of red mana symbols in the mana costs of permanents you control.","colors":["R"],"colorIdentity":["R"],"keywords":["Chroma"]});
const phosphorescentFeast = card("Phosphorescent Feast", "Sorcery", "{2}{G}{G}{G}", {"cmc":5,"oracleText":"Chroma — Reveal any number of cards in your hand. You gain 2 life for each green mana symbol in those cards' mana costs.","colors":["G"],"colorIdentity":["G"],"keywords":["Chroma"]});
const primalcrux = card("Primalcrux", "Creature — Elemental", "{G}{G}{G}{G}{G}{G}", {"cmc":6,"power":"*","toughness":"*","oracleText":"Trample\nChroma — This creature's power and toughness are each equal to the number of green mana symbols in the mana costs of permanents you control.","colors":["G"],"colorIdentity":["G"],"keywords":["Trample","Chroma"]});
const sanityGrinding = card("Sanity Grinding", "Sorcery", "{U}{U}{U}", {"cmc":3,"oracleText":"Chroma — Reveal the top ten cards of your library. For each blue mana symbol in the mana costs of the revealed cards, target opponent mills a card. Then put the cards you revealed this way on the bottom of your library in any order.","colors":["U"],"colorIdentity":["U"],"keywords":["Chroma","Mill"]});
const springjackShepherd = card("Springjack Shepherd", "Creature — Kithkin Wizard", "{3}{W}", {"cmc":4,"power":"1","toughness":"2","oracleText":"Chroma — When this creature enters, create a 0/1 white Goat creature token for each white mana symbol in the mana costs of permanents you control.","colors":["W"],"colorIdentity":["W"],"keywords":["Chroma"]});
const umbraStalker = card("Umbra Stalker", "Creature — Elemental", "{4}{B}{B}{B}", {"cmc":7,"power":"*","toughness":"*","oracleText":"Chroma — Umbra Stalker's power and toughness are each equal to the number of black mana symbols in the mana costs of cards in your graveyard.","colors":["B"],"colorIdentity":["B"],"keywords":["Chroma"]});
const baruFistOfKrosa = card("Baru, Fist of Krosa", "Legendary Creature — Human Druid", "{3}{G}{G}", {"cmc":5,"power":"4","toughness":"4","oracleText":"Whenever a Forest enters, green creatures you control get +1/+1 and gain trample until end of turn.\nGrandeur — Discard another card named Baru, Fist of Krosa: Create an X/X green Wurm creature token, where X is the number of lands you control.","colors":["G"],"colorIdentity":["G"],"keywords":["Grandeur"]});
const korlashHeirToBlackblade = card("Korlash, Heir to Blackblade", "Legendary Creature — Zombie Warrior", "{2}{B}{B}", {"cmc":4,"power":"*","toughness":"*","oracleText":"Korlash's power and toughness are each equal to the number of Swamps you control.\n{1}{B}: Regenerate Korlash.\nGrandeur — Discard another card named Korlash, Heir to Blackblade: Search your library for up to two Swamp cards, put them onto the battlefield tapped, then shuffle.","colors":["B"],"colorIdentity":["B"],"keywords":["Grandeur","Regenerate"]});
const linessaZephyrMage = card("Linessa, Zephyr Mage", "Legendary Creature — Human Wizard", "{3}{U}", {"cmc":4,"power":"3","toughness":"3","oracleText":"{X}{U}{U}, {T}: Return target creature with mana value X to its owner's hand.\nGrandeur — Discard another card named Linessa, Zephyr Mage: Target player returns a creature they control to its owner's hand, then repeats this process for an artifact, an enchantment, and a land.","colors":["U"],"colorIdentity":["U"],"keywords":["Grandeur"]});
const orissSamiteGuardian = card("Oriss, Samite Guardian", "Legendary Creature — Human Cleric", "{1}{W}{W}", {"cmc":3,"power":"1","toughness":"3","oracleText":"{T}: Prevent all damage that would be dealt to target creature this turn.\nGrandeur — Discard another card named Oriss, Samite Guardian: Target player can't cast spells this turn, and creatures that player controls can't attack this turn.","colors":["W"],"colorIdentity":["W"],"keywords":["Grandeur"]});
const pageLooseLeaf = card("Page, Loose Leaf", "Legendary Artifact Creature — Construct", "{2}", {"cmc":2,"power":"0","toughness":"2","oracleText":"{T}: Add {C}.\nGrandeur — Discard another card named Page, Loose Leaf: Reveal cards from the top of your library until you reveal an instant or sorcery card. Put that card into your hand and the rest on the bottom of your library in a random order.","colors":[],"colorIdentity":[],"keywords":["Grandeur"]});
const skoaEmbermage = card("Skoa, Embermage", "Legendary Creature — Goblin Wizard", "{4}{R}{R}", {"cmc":6,"power":"4","toughness":"4","oracleText":"When Skoa enters, it deals 4 damage to any target.\nGrandeur — Discard another card named Skoa, Embermage, Sacrifice two Mountains: Skoa deals 4 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":["Grandeur"]});
const taroxBladewing = card("Tarox Bladewing", "Legendary Creature — Dragon", "{2}{R}{R}{R}", {"cmc":5,"power":"4","toughness":"3","oracleText":"Flying, haste\nGrandeur — Discard another card named Tarox Bladewing: Tarox Bladewing gets +X/+X until end of turn, where X is its power.","colors":["R"],"colorIdentity":["R"],"keywords":["Flying","Grandeur","Haste"]});
const stompingSlabs = card("Stomping Slabs", "Sorcery", "{2}{R}", {"cmc":3,"oracleText":"Reveal the top seven cards of your library, then put those cards on the bottom of your library in any order. If a card named Stomping Slabs was revealed this way, Stomping Slabs deals 7 damage to any target.","colors":["R"],"colorIdentity":["R"]});
const lammastideWeave = card("Lammastide Weave", "Instant", "{1}{G}", {"cmc":2,"oracleText":"Choose a card name, then target player mills a card. If a card with the chosen name was milled this way, you gain life equal to its mana value.\nDraw a card.","colors":["G"],"colorIdentity":["G"],"keywords":["Mill"]});
const vigeanIntuition = card("Vigean Intuition", "Instant", "{3}{G}{U}", {"cmc":5,"oracleText":"Choose a card type, then reveal the top four cards of your library. Put all cards of the chosen type revealed this way into your hand and the rest into your graveyard. (Artifact, battle, creature, enchantment, instant, kindred, land, planeswalker, and sorcery are card types.)","colors":["G","U"],"colorIdentity":["G","U"]});
const thoughtHemorrhage = card("Thought Hemorrhage", "Sorcery", "{2}{B}{R}", {"cmc":4,"oracleText":"Choose a nonland card name. Target player reveals their hand. Thought Hemorrhage deals 3 damage to that player for each card with the chosen name revealed this way. Search that player's graveyard, hand, and library for all cards with that name and exile them. Then that player shuffles.","colors":["B","R"],"colorIdentity":["B","R"]});
const corpseLunge = card("Corpse Lunge", "Instant", "{2}{B}", {"cmc":3,"oracleText":"As an additional cost to cast this spell, exile a creature card from your graveyard.\nCorpse Lunge deals damage equal to the exiled card's power to target creature.","colors":["B"],"colorIdentity":["B"]});
const galliaTragicHost = card("Gallia, Tragic Host", "Legendary Creature — Zombie Satyr", "{1}{B}", {"cmc":2,"power":"2","toughness":"1","oracleText":"Menace (This creature can't be blocked except by two or more creatures.)\n{4}{B}, Exile another creature card from your graveyard: Return this card from your graveyard to the battlefield tapped with a +1/+1 counter on her.","colors":["B"],"colorIdentity":["B"],"keywords":["Menace"]});
const wormfangBehemoth = card("Wormfang Behemoth", "Creature — Nightmare Fish Beast", "{3}{U}{U}", {"cmc":5,"power":"5","toughness":"5","oracleText":"When this creature enters, exile all cards from your hand.\nWhen this creature leaves the battlefield, return the exiled cards to their owner's hand.","colors":["U"],"colorIdentity":["U"]});
const soulScourge = card("Soul Scourge", "Creature — Nightmare Horror", "{4}{B}", {"cmc":5,"power":"3","toughness":"2","oracleText":"Flying\nWhen this creature enters, target player loses 3 life.\nWhen this creature leaves the battlefield, that player gains 3 life.","colors":["B"],"colorIdentity":["B"],"keywords":["Flying"]});
const laquatussChampion = card("Laquatus's Champion", "Creature — Nightmare Horror", "{4}{B}{B}", {"cmc":6,"power":"6","toughness":"3","oracleText":"When this creature enters, target player loses 6 life.\nWhen this creature leaves the battlefield, that player gains 6 life.\n{B}: Regenerate this creature.","colors":["B"],"colorIdentity":["B"],"keywords":["Regenerate"]});
const saprazzanBailiff = card("Saprazzan Bailiff", "Creature — Merfolk", "{3}{U}{U}", {"cmc":5,"power":"2","toughness":"2","oracleText":"When this creature enters, exile all artifact and enchantment cards from all graveyards.\nWhen this creature leaves the battlefield, return all artifact and enchantment cards from all graveyards to their owners' hands.","colors":["U"],"colorIdentity":["U"]});
const junglePatrol = card("Jungle Patrol", "Creature — Human Soldier", "{3}{G}", {"cmc":4,"power":"3","toughness":"2","oracleText":"{1}{G}, {T}: Create a 0/1 green Wall creature token with defender named Wood.\nSacrifice a token named Wood: Add {R}.","colors":["G"],"colorIdentity":["G","R"]});
const kookus = card("Kookus", "Creature — Djinn", "{3}{R}{R}", {"cmc":5,"power":"3","toughness":"5","oracleText":"Trample\nAt the beginning of your upkeep, if you don't control a creature named Keeper of Kookus, this creature deals 3 damage to you and attacks this turn if able.\n{R}: This creature gets +1/+0 until end of turn.","colors":["R"],"colorIdentity":["R"],"keywords":["Trample"]});
const bubblingCauldron = card("Bubbling Cauldron", "Artifact", "{2}", {"cmc":2,"oracleText":"{1}, {T}, Sacrifice a creature: You gain 4 life.\n{1}, {T}, Sacrifice a creature named Festering Newt: Each opponent loses 4 life. You gain life equal to the life lost this way.","colors":[],"colorIdentity":[]});
const corpseExplosion = card("Corpse Explosion", "Sorcery", "{1}{B}{R}", {"cmc":3,"oracleText":"As an additional cost to cast this spell, exile a creature card from your graveyard.\nCorpse Explosion deals damage equal to the exiled card's power to each creature and each planeswalker.","colors":["B","R"],"colorIdentity":["B","R"]});
const draconicIntervention = card("Draconic Intervention", "Sorcery", "{2}{R}{R}", {"cmc":4,"oracleText":"As an additional cost to cast this spell, exile an instant or sorcery card from your graveyard.\nDraconic Intervention deals X damage to each non-Dragon creature, where X is the exiled card's mana value. If a creature dealt damage this way would die this turn, exile it instead.\nExile Draconic Intervention.","colors":["R"],"colorIdentity":["R"]});
const dreadDefiler = card("Dread Defiler", "Creature — Eldrazi", "{6}{B}", {"cmc":7,"power":"6","toughness":"8","oracleText":"Devoid (This card has no color.)\n{3}{C}, Exile a creature card from your graveyard: Target opponent loses life equal to the exiled card's power. ({C} represents colorless mana.)","colors":[],"colorIdentity":["B"],"keywords":["Devoid"]});
const helbrute = card("Helbrute", "Artifact Creature — Astartes Dreadnought", "{3}{B}{R}", {"cmc":5,"power":"5","toughness":"4","oracleText":"Haste\nSarcophagus — You may cast this card from your graveyard by exiling another creature card from your graveyard in addition to paying its other costs.","colors":["B","R"],"colorIdentity":["B","R"],"keywords":["Haste","Sarcophagus"]});
const kyscuDrake = card("Kyscu Drake", "Creature — Drake", "{3}{G}", {"cmc":4,"power":"2","toughness":"2","oracleText":"Flying\n{G}: This creature gets +0/+1 until end of turn. Activate only once each turn.\nSacrifice this creature and a creature named Spitting Drake: Search your library for a card named Viashivan Dragon, put that card onto the battlefield, then shuffle.","colors":["G"],"colorIdentity":["G"],"keywords":["Flying"]});
const necropolis = card("Necropolis", "Artifact Creature — Wall", "{5}", {"cmc":5,"power":"0","toughness":"1","oracleText":"Defender (This creature can't attack.)\nExile a creature card from your graveyard: Put X +0/+1 counters on this creature, where X is the exiled card's mana value.","colors":[],"colorIdentity":[],"keywords":["Defender"]});
const scrapheapScrounger = card("Scrapheap Scrounger", "Artifact Creature — Construct", "{2}", {"cmc":2,"power":"3","toughness":"2","oracleText":"This creature can't block.\n{1}{B}, Exile another creature card from your graveyard: Return this card from your graveyard to the battlefield.","colors":[],"colorIdentity":["B"]});

const all = [charrumbler, spinalParasite, lootTheAnomaly, fieryBombardment, heartlashCinder, lightFromWithin, outrageShaman, phosphorescentFeast, primalcrux, sanityGrinding, springjackShepherd, umbraStalker, baruFistOfKrosa, korlashHeirToBlackblade, linessaZephyrMage, orissSamiteGuardian, pageLooseLeaf, skoaEmbermage, taroxBladewing, stompingSlabs, lammastideWeave, vigeanIntuition, thoughtHemorrhage, corpseLunge, galliaTragicHost, wormfangBehemoth, soulScourge, laquatussChampion, saprazzanBailiff, junglePatrol, kookus, bubblingCauldron, corpseExplosion, draconicIntervention, dreadDefiler, helbrute, kyscuDrake, necropolis, scrapheapScrounger];

describe("Lane B round 27", () => {
  it("supports every card of the round", () => {
    supported(...all);
  });

  it("Char-Rumbler: a negative power deals no combat damage (CR 510.1a); pumped to 1 it deals 1 twice", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, charrumbler);
    expect(pt(s0, c)).toBe("-1/3");
    let s = throughDamage(attackWith(s0, [c], opp));
    expect(life(s, opp)).toBe(40);
    // Next turn of this player: pump twice, then attack.
    s = passUntil(s, "main1", ap);
    s = activateNow(s, ap, c, 0);
    s = settle(s);
    s = activateNow(s, ap, c, 0);
    s = settle(s);
    expect(pt(s, c)).toBe("1/3");
    s = throughDamage(attackWith(s, [c], opp));
    expect(life(s, opp)).toBe(38);
  });

  it("Loot, the Anomaly assigns combat damage as though its negative power were positive, and its threshold ability makes it bigger", () => {
    const { s: s0, ap, opp } = setup([]);
    const loot = putOnBattlefield(s0, ap, lootTheAnomaly);
    const bear = putOnBattlefield(s0, ap, greenBear());
    expect(pt(s0, loot)).toBe("-2/4");
    // Threshold: not with six cards in the graveyard.
    for (let i = 0; i < 6; i++) into(s0, ap, whiteCharm(), "graveyard");
    expect(planActivate(s0, ap, loot, 0, [])).toBeNull();
    into(s0, ap, whiteCharm(), "graveyard");
    let s = settle(activateNow(s0, ap, loot, 0, [], undefined, { sacrifice: [bear] }));
    expect(zone(s, bear)).toBe("graveyard");
    expect(pt(s, loot)).toBe("-4/4");
    s = throughDamage(attackWith(s, [loot], opp));
    expect(life(s, opp)).toBe(36);
  });

  it("Spinal Parasite: -1/-1 with a +1/+1 counter for each color spent (sunburst)", () => {
    const { s: s0, ap, ids } = setup([spinalParasite, spinalParasite]);
    tapLands(s0, ap);
    pool(s0, ap, { W: 1, U: 1, B: 1, C: 2 });
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [])));
    expect(pt(s, ids[0]!)).toBe("2/2");
    // Paid with colorless mana only: no counters, so it dies (CR 704.5f).
    s = priorityTo(s, ap);
    pool(s, ap, { C: 5 });
    s = settle(run(s, planCast(s, ap, ids[1]!, [])));
    expect(zone(s, ids[1]!)).toBe("graveyard");
  });

  it("Fiery Bombardment: damage equal to the red mana symbols in the sacrificed creature's mana cost, as it last existed", () => {
    const { s: s0, ap, opp } = setup([]);
    const fb = putOnBattlefield(s0, ap, fieryBombardment);
    const rumbler = putOnBattlefield(s0, ap, charrumbler);
    const s = settle(activateNow(s0, ap, fb, 0, [ply(opp)], undefined, { sacrifice: [rumbler] }));
    expect(zone(s, rumbler)).toBe("graveyard");
    expect(life(s, opp)).toBe(38);
  });

  it("Heartlash Cinder and Outrage Shaman count the red mana symbols among permanents you control (CR 700.5's way)", () => {
    const { s: s0, ap, ids, opp } = setup([heartlashCinder, outrageShaman]);
    putOnBattlefield(s0, ap, charrumbler); // {2}{R}{R}
    putOnBattlefield(s0, opp, creature("Opposing Goblin", "Creature — Goblin", "{R}{R}{R}", 1, 1, { cmc: 3 })); // not yours
    let s = settle(castNow(s0, ap, ids[0]!));
    // Its own {R} and Char-Rumbler's two: +3/+0, locked in as it resolves.
    expect(pt(s, ids[0]!)).toBe("4/1");
    const big = putOnBattlefield(s, opp, creature("Huge Wall", "Creature — Wall", "{4}", 0, 6, { cmc: 4 }));
    s = priorityTo(s, ap);
    s = settle(castNow(s, ap, ids[1]!), at("chooseTargets", ap));
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(big)] } as Action);
    s = settle(s);
    // {R}{R} + {R}{R} + {R}: five damage.
    expect(s.objects[big]!.damage).toBe(5);
  });

  it("Light from Within: +1/+1 for each white mana symbol in each creature's own mana cost", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, lightFromWithin);
    const knight = putOnBattlefield(s0, ap, whiteKnight());
    const oriss = putOnBattlefield(s0, ap, orissSamiteGuardian);
    const bear = putOnBattlefield(s0, ap, greenBear());
    expect(pt(s0, knight)).toBe("3/3");
    expect(pt(s0, oriss)).toBe("3/5");
    expect(pt(s0, bear)).toBe("2/2");
  });

  it("Primalcrux counts the green mana symbols among your permanents; Umbra Stalker the black ones among cards in your graveyard", () => {
    const { s: s0, ap, opp } = setup([]);
    const crux = putOnBattlefield(s0, ap, primalcrux);
    expect(pt(s0, crux)).toBe("6/6");
    putOnBattlefield(s0, ap, greenBear());
    putOnBattlefield(s0, opp, greenBear());
    invalidateCharacteristics(s0);
    expect(pt(s0, crux)).toBe("7/7");
    const stalker = putOnBattlefield(s0, ap, umbraStalker);
    // No black symbols in the graveyard: 0/0, so it dies.
    expect(pt(s0, stalker)).toBe("0/0");
    let s = act(s0, { type: "passPriority", player: waitingOn(s0)! });
    expect(zone(s, stalker)).toBe("graveyard");
    // Only your graveyard: its own {B}{B}{B} (it's there now) and Laquatus's Champion's {B}{B}.
    into(s, ap, laquatussChampion, "graveyard");
    into(s, opp, laquatussChampion, "graveyard");
    const other = putOnBattlefield(s, ap, umbraStalker);
    expect(pt(s, other)).toBe("5/5");
  });

  it("Springjack Shepherd: a Goat for each white mana symbol among your permanents", () => {
    const { s: s0, ap, ids } = setup([springjackShepherd]);
    putOnBattlefield(s0, ap, lightFromWithin);
    const s = settle(castNow(s0, ap, ids[0]!));
    expect(mine(s, ap, "Goat Token")).toHaveLength(3);
  });

  it("Phosphorescent Feast: 2 life for each green mana symbol in the revealed cards' mana costs", () => {
    const { s: s0, ap, ids } = setup([phosphorescentFeast, primalcrux, greenBear(), whiteKnight()]);
    let s = settle(castNow(s0, ap, ids[0]!), (x) => !!x.pending && x.pending.player === ap);
    expect(s.pending?.kind).toBe("searchLibrary");
    s = act(s, { type: "searchLibrary", player: ap, found: [ids[1]!, ids[2]!, ids[3]!] });
    s = settle(s);
    expect(life(s, ap)).toBe(40 + 2 * 7);
    expect(zone(s, ids[1]!)).toBe("hand");
  });

  it("Sanity Grinding: target opponent mills a card for each blue mana symbol among the top ten, which then go to the bottom", () => {
    const { s: s0, ap, ids, opp } = setup([sanityGrinding]);
    const top = [blueDrake(), blueDrake(), greenBear()].map((d) => into(s0, ap, d, "library"));
    const oppLib = s0.players[opp]!.library.length;
    let s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]));
    // Two Blue Drakes ({2}{U}{U}) and the rest without blue: four cards.
    expect(oppLib - s.players[opp]!.library.length).toBe(4);
    const lib = s.players[ap]!.library;
    for (const id of top) expect(lib.indexOf(id)).toBeGreaterThanOrEqual(lib.length - 10);
    expect(s.players[ap]!.library.slice(0, lib.length - 10).some((id) => top.includes(id))).toBe(false);
  });

  it("Grandeur: only another card with this name pays (Tarox Bladewing gets +X/+X where X is its power as it resolves)", () => {
    const { s: s0, ap, ids } = setup([taroxBladewing, greenBear()]);
    const tarox = putOnBattlefield(s0, ap, taroxBladewing);
    // A differently named card doesn't pay.
    expect(planActivate(s0, ap, tarox, 0, [], undefined, undefined, undefined, { discard: [ids[1]!] })).toBeNull();
    let s = settle(activateNow(s0, ap, tarox, 0, [], undefined, { discard: [ids[0]!] }));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(pt(s, tarox)).toBe("8/7");
    // With none left in hand, it can't be activated.
    expect(planActivate(s, ap, tarox, 0, [])).toBeNull();
  });

  it("Baru: a Forest entering pumps green creatures; grandeur makes an X/X Wurm, X the lands you control", () => {
    const { s: s0, ap, ids, opp } = setup([baruFistOfKrosa]);
    const baru = putOnBattlefield(s0, ap, baruFistOfKrosa);
    const bear = putOnBattlefield(s0, ap, greenBear());
    const knight = putOnBattlefield(s0, ap, whiteKnight());
    const theirs = putOnBattlefield(s0, opp, greenBear());
    let s = settle(activateNow(s0, ap, baru, 0, [], undefined, { discard: [ids[0]!] }));
    const wurm = mine(s, ap, "Wurm Token")[0]!;
    expect(pt(s, wurm)).toBe("14/14");
    // Another land later doesn't change it (X is locked as it resolves, CR 608.2h); the Forest pumps the green creatures.
    const forest = into(s, ap, card("Forest", "Basic Land — Forest"));
    s = settle(act(priorityTo(s, ap), { type: "playLand", player: ap, objectId: forest }));
    expect(pt(s, wurm)).toBe("15/15");
    expect(pt(s, bear)).toBe("3/3");
    expect(pt(s, knight)).toBe("2/2");
    expect(pt(s, theirs)).toBe("2/2");
  });

  it("Korlash: as big as your Swamps; grandeur fetches up to two Swamps tapped", () => {
    const { s: s0, ap, ids } = setup([korlashHeirToBlackblade]);
    const k = putOnBattlefield(s0, ap, korlashHeirToBlackblade);
    expect(pt(s0, k)).toBe("2/2");
    const swamps = [0, 1, 2].map(() => into(s0, ap, card("Swamp", "Basic Land — Swamp"), "library"));
    let s = settle(activateNow(s0, ap, k, 1, [], undefined, { discard: [ids[0]!] }), at("searchLibrary", ap));
    s = act(s, { type: "searchLibrary", player: ap, found: swamps.slice(0, 2) });
    s = settle(s);
    expect(swamps.slice(0, 2).every((id) => zone(s, id) === "battlefield" && s.objects[id]!.tapped)).toBe(true);
    expect(zone(s, swamps[2]!)).toBe("library");
    expect(pt(s, k)).toBe("4/4");
  });

  it("Linessa: X returns a creature with mana value X; grandeur has the player return a creature, an artifact, an enchantment and a land, in turn", () => {
    const { s: s0, ap, ids, opp } = setup([linessaZephyrMage]);
    const lin = putOnBattlefield(s0, ap, linessaZephyrMage);
    const bear = putOnBattlefield(s0, opp, greenBear());
    const drake = putOnBattlefield(s0, opp, blueDrake());
    // X = 2: Green Bear yes, Blue Drake (4) no.
    expect(planActivate(s0, ap, lin, 0, [tgt(drake)], undefined, undefined, 2)).toBeNull();
    let s = settle(activateNow(s0, ap, lin, 0, [tgt(bear)], 2));
    expect(zone(s, bear)).toBe("hand");
    // Untap and use grandeur on the opponent, who returns an artifact creature as the creature: it can't also be the artifact.
    s.objects[lin]!.tapped = false;
    const golem = putOnBattlefield(s, opp, creature("Iron Golem", "Artifact Creature — Golem", "{4}", 3, 3, { cmc: 4 }));
    const omen = putOnBattlefield(s, opp, goodOmen());
    const lands = s.battlefield.filter((id) => s.objects[id]!.controller === opp && s.cards[s.objects[id]!.cardId]!.typeLine.includes("Land"));
    s = settle(activateNow(s, ap, lin, 1, [ply(opp)], undefined, { discard: [ids[0]!] }), at("pickPermanents", opp));
    expect(s.pending?.kind).toBe("pickPermanents");
    s = settle(act(s, { type: "pickPermanents", player: opp, ids: [golem] }), at("pickPermanents", opp));
    s = settle(s);
    expect(zone(s, golem)).toBe("hand");
    expect(zone(s, drake)).toBe("battlefield");
    expect(zone(s, omen)).toBe("hand");
    expect(lands.filter((id) => zone(s, id) === "hand")).toHaveLength(lands.length ? 1 : 0);
  });

  it("Oriss: grandeur stops the player's spells and attacks for the turn, even for creatures that arrive later", () => {
    const { s: s0, ap, ids, opp } = setup([orissSamiteGuardian]);
    const oriss = putOnBattlefield(s0, ap, orissSamiteGuardian);
    const bolt = into(s0, opp, shock());
    const before = putOnBattlefield(s0, opp, greenBear());
    const ownBear = putOnBattlefield(s0, ap, greenBear());
    expect(potentialAttackers(s0, opp).map((o) => o.id)).toContain(before);
    let s = settle(activateNow(s0, ap, oriss, 1, [ply(opp)], undefined, { discard: [ids[0]!] }));
    pool(s, opp, { R: 1 });
    expect(castProblem(s, opp, bolt)).toBeTruthy();
    // The prevention ability: damage to the target creature this turn is prevented.
    s.objects[oriss]!.tapped = false;
    s = settle(activateNow(s, ap, oriss, 0, [tgt(oriss)]));
    expect(s.objects[oriss]!.damage).toBe(0);
    const late = putOnBattlefield(s, opp, greenBear());
    expect(potentialAttackers(s, opp).map((o) => o.id)).not.toContain(late);
    expect(potentialAttackers(s, opp).map((o) => o.id)).not.toContain(before);
    // Not the activating player's creatures.
    expect(potentialAttackers(s, ap).map((o) => o.id)).toContain(ownBear);
  });

  it("Page, Loose Leaf: grandeur finds the first instant or sorcery and bottoms the rest", () => {
    const { s: s0, ap, ids } = setup([pageLooseLeaf]);
    const page = putOnBattlefield(s0, ap, pageLooseLeaf);
    const charm = into(s0, ap, whiteCharm(), "library");
    const above = [greenBear(), whiteKnight()].map((d) => into(s0, ap, d, "library"));
    const s = settle(activateNow(s0, ap, page, 0, [], undefined, { discard: [ids[0]!] }));
    expect(zone(s, charm)).toBe("hand");
    const lib = s.players[ap]!.library;
    expect(above.every((id) => lib.indexOf(id) >= lib.length - 2)).toBe(true);
  });

  it("Skoa: 4 damage as it enters; grandeur also sacrifices two Mountains", () => {
    const { s: s0, ap, ids, opp } = setup([skoaEmbermage, skoaEmbermage]);
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseTargets", ap));
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [ply(opp)] } as Action);
    s = settle(s);
    expect(life(s, opp)).toBe(36);
    s = priorityTo(s, ap);
    const mountains = s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.name === "Mountain");
    s = settle(activateNow(s, ap, ids[0]!, 0, [ply(opp)], undefined, { discard: [ids[1]!], sacrifice: mountains.slice(0, 2) }));
    expect(life(s, opp)).toBe(32);
    expect(mountains.slice(0, 2).every((id) => zone(s, id) === "graveyard")).toBe(true);
  });

  it("Stomping Slabs: 7 damage only if another Stomping Slabs was among the seven revealed; all seven go to the bottom", () => {
    const { s: s0, ap, ids, opp } = setup([stompingSlabs, stompingSlabs]);
    const top = [greenBear(), stompingSlabs].map((d) => into(s0, ap, d, "library"));
    let s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]));
    expect(life(s, opp)).toBe(33);
    const lib = s.players[ap]!.library;
    expect(top.every((id) => lib.indexOf(id) >= lib.length - 7)).toBe(true);
    // The rest of the library has no Stomping Slabs on top now: no damage.
    s = priorityTo(s, ap);
    s = settle(castNow(s, ap, ids[1]!, [ply(opp)]));
    expect(life(s, opp)).toBe(33);
  });

  it("Lammastide Weave: life equal to the milled card's mana value only if it has the chosen name", () => {
    const { s: s0, ap, ids, opp } = setup([lammastideWeave, lammastideWeave]);
    into(s0, opp, blueDrake(), "library");
    let s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]), at("chooseOption", ap));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Blue Drake" }));
    expect(life(s, ap)).toBe(44);
    into(s, opp, blueDrake(), "library");
    s = priorityTo(s, ap);
    const hand = handOf(s, ap);
    s = settle(castNow(s, ap, ids[1]!, [ply(opp)]), at("chooseOption", ap));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Grizzly Bears" }));
    expect(life(s, ap)).toBe(44);
    expect(handOf(s, ap)).toBe(hand); // cast one, drew one
  });

  it("Vigean Intuition: the cards of the chosen type go to your hand, the rest to your graveyard", () => {
    const { s: s0, ap, ids } = setup([vigeanIntuition]);
    const top = [greenBear(), whiteCharm(), ironRing(), creature("Iron Golem", "Artifact Creature — Golem", "{4}", 3, 3, { cmc: 4 })].map((d) => into(s0, ap, d, "library"));
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseOption", ap));
    expect(s.pending?.kind === "chooseOption" && s.pending.options).toContain("Artifact");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Artifact" }));
    expect(top.map((id) => zone(s, id))).toEqual(["graveyard", "graveyard", "hand", "hand"]);
  });

  it("Thought Hemorrhage: 3 damage for each card with the chosen name in the hand, then all of them are exiled", () => {
    const { s: s0, ap, ids, opp } = setup([thoughtHemorrhage]);
    const inHand = [shock(), shock(), greenBear()].map((d) => into(s0, opp, d));
    const inYard = into(s0, opp, shock(), "graveyard");
    let s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]), at("chooseOption", ap));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Shock" }), at("searchLibrary", ap));
    // The library and hand's cards with that name are found by searching (CR 701.23b); the graveyard's are all exiled.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", cards: [inHand[0], inHand[1]], also: [inYard] });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [inHand[0]!, inHand[1]!] }));
    expect(life(s, opp)).toBe(34);
    expect([inHand[0], inHand[1], inYard].map((id) => zone(s, id!))).toEqual(["exile", "exile", "exile"]);
    expect(zone(s, inHand[2]!)).toBe("hand");
  });

  it("Corpse Lunge: damage equal to the exiled card's power, a \"*\" by its characteristic-defining ability (CR 604.3)", () => {
    const { s: s0, ap, ids, opp } = setup([corpseLunge, corpseLunge]);
    const beast = into(s0, ap, bigBeast(), "graveyard");
    const stalker = into(s0, ap, umbraStalker, "graveyard");
    const wall = putOnBattlefield(s0, opp, creature("Huge Wall", "Creature — Wall", "{4}", 0, 9, { cmc: 4 }));
    // Without a creature card chosen, there's no way to cast it with only a noncreature card there.
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(wall)], { exileCards: [beast] }));
    expect(zone(s, beast)).toBe("exile");
    expect(s.objects[wall]!.damage).toBe(4);
    // Umbra Stalker in the graveyard: the black mana symbols there, its own {B}{B}{B} and Corpse Lunge's {B}.
    s = priorityTo(s, ap);
    s = settle(castNow(s, ap, ids[1]!, [tgt(wall)], { exileCards: [stalker] }));
    expect(s.objects[wall]!.damage).toBe(8);
  });

  it("Corpse Lunge needs a creature card in your graveyard to exile", () => {
    const { s, ap, ids, opp } = setup([corpseLunge]);
    into(s, ap, whiteCharm(), "graveyard");
    const wall = putOnBattlefield(s, opp, greenBear());
    expect(planCast(s, ap, ids[0]!, [tgt(wall)])).toBeNull();
  });

  it("Gallia, Tragic Host returns from the graveyard tapped with a +1/+1 counter by exiling another creature card", () => {
    const { s: s0, ap } = setup([]);
    const gallia = into(s0, ap, galliaTragicHost, "graveyard");
    // Only Gallia itself there: no other creature card to exile.
    expect(planActivate(s0, ap, gallia, 0, [])).toBeNull();
    const bear = into(s0, ap, greenBear(), "graveyard");
    const s = settle(activateNow(s0, ap, gallia, 0, [], undefined, { exileCards: [bear] }));
    expect(zone(s, bear)).toBe("exile");
    expect(zone(s, gallia)).toBe("battlefield");
    expect(s.objects[gallia]!.tapped).toBe(true);
    expect(pt(s, gallia)).toBe("3/2");
  });

  it("Scrapheap Scrounger returns from the graveyard by exiling another creature card; Helbrute is cast from there the same way", () => {
    const { s: s0, ap } = setup([]);
    const scr = into(s0, ap, scrapheapScrounger, "graveyard");
    const helb = into(s0, ap, helbrute, "graveyard");
    expect(planActivate(s0, ap, scr, 0, [], undefined, undefined, undefined, { exileCards: [scr] })).toBeNull();
    let s = settle(activateNow(s0, ap, scr, 0, [], undefined, { exileCards: [helb] }));
    expect(zone(s, scr)).toBe("battlefield");
    expect(zone(s, helb)).toBe("exile");
    // Helbrute: with only itself in the graveyard, it can't be cast from there.
    s = priorityTo(s, ap);
    const h2 = into(s, ap, helbrute, "graveyard");
    expect(planCast(s, ap, h2, [], undefined, undefined, undefined, { via: "permission" })).toBeNull();
    const bear = into(s, ap, greenBear(), "graveyard");
    s = settle(run(s, planCast(s, ap, h2, [], undefined, undefined, undefined, { via: "permission", exileCards: [bear] })));
    expect(zone(s, h2)).toBe("battlefield");
    expect(zone(s, bear)).toBe("exile");
  });

  it("Wormfang Behemoth exiles your hand and gives those cards back when it leaves", () => {
    const { s: s0, ap, ids, opp } = setup([wormfangBehemoth, greenBear(), whiteCharm(), murder()]);
    let s = settle(castNow(s0, ap, ids[0]!));
    expect([ids[1], ids[2], ids[3]].map((id) => zone(s, id!))).toEqual(["exile", "exile", "exile"]);
    // A card exiled some other way doesn't come back.
    const other = into(s, ap, whiteKnight(), "graveyard");
    s.objects[other]!.zone = "exile";
    const kill = into(s, opp, murder());
    s = priorityTo(s, opp);
    pool(s, opp, { B: 3 });
    s = settle(castNow(s, opp, kill, [tgt(ids[0]!)]));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect([ids[1], ids[2], ids[3]].map((id) => zone(s, id!))).toEqual(["hand", "hand", "hand"]);
    expect(zone(s, other)).toBe("exile");
  });

  it("Soul Scourge and Laquatus's Champion: the player who lost the life gets it back when it leaves", () => {
    const { s: s0, ap, ids, opp } = setup([soulScourge, laquatussChampion, murder()]);
    const third = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseTargets", ap));
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [ply(opp)] } as Action);
    s = settle(s);
    expect(life(s, opp)).toBe(37);
    s = priorityTo(s, ap);
    pool(s, ap, { B: 2 });
    s = settle(castNow(s, ap, ids[1]!), at("chooseTargets", ap));
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [ply(third)] } as Action);
    s = settle(s);
    expect(life(s, third)).toBe(34);
    s = priorityTo(s, ap);
    pool(s, ap, { B: 3 });
    s = settle(castNow(s, ap, ids[2]!, [tgt(ids[0]!)]));
    expect(life(s, opp)).toBe(40);
    expect(life(s, third)).toBe(34);
  });

  it("Saprazzan Bailiff exiles the artifact and enchantment cards in graveyards, then returns those in graveyards when it leaves", () => {
    const { s: s0, ap, ids, opp } = setup([saprazzanBailiff, murder()]);
    const ring = into(s0, opp, ironRing(), "graveyard");
    const omen = into(s0, ap, goodOmen(), "graveyard");
    const bear = into(s0, opp, greenBear(), "graveyard");
    let s = settle(castNow(s0, ap, ids[0]!));
    expect([ring, omen, bear].map((id) => zone(s, id))).toEqual(["exile", "exile", "graveyard"]);
    const later = into(s, opp, ironRing(), "graveyard");
    s = priorityTo(s, ap);
    pool(s, ap, { B: 3 });
    s = settle(castNow(s, ap, ids[1]!, [tgt(ids[0]!)]));
    expect(zone(s, later)).toBe("hand");
    expect(s.players[opp]!.hand).toContain(later);
    expect(zone(s, ring)).toBe("exile");
  });

  it("Jungle Patrol makes Wood, which only sacrifices for {R} when asked", () => {
    const { s: s0, ap, ids, opp } = setup([shock()]);
    const jp = putOnBattlefield(s0, ap, junglePatrol);
    let s = settle(activateNow(s0, ap, jp, 0));
    const wood = mine(s, ap, "Wood")[0] ?? mine(s, ap, "Wood Token")[0];
    expect(wood).toBeDefined();
    expect(pt(s, wood!)).toBe("0/1");
    // Paying for Shock with lands left: the Wood stays.
    s = priorityTo(s, ap);
    s = settle(castNow(s, ap, ids[0]!, [ply(opp)]));
    expect(zone(s, wood!)).toBe("battlefield");
    s = act(s, { type: "activateAbility", player: ap, objectId: jp, index: 1, costs: { sacrifice: [wood!] } } as Action);
    expect(s.players[ap]!.manaPool.R).toBe(1);
    expect(zone(s, wood!)).not.toBe("battlefield");
  });

  it("chroma counts a hybrid symbol for each of its colors (Sanity Grinding rulings)", () => {
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, lightFromWithin);
    const hybrid = putOnBattlefield(s, ap, creature("Hybrid Spirit", "Creature — Spirit", "{2}{W/U}{W/U}", 1, 1, { cmc: 4 }));
    expect(pt(s, hybrid)).toBe("3/3");
  });

  it("Kookus: without a Keeper of Kookus, 3 damage to you at upkeep and it must attack; with one, nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, kookus);
    let s = passUntil(s0, "upkeep", ap);
    s = settle(s);
    expect(life(s, ap)).toBe(37);
    for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [] })).toThrow();
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: k, defender: opp }] });
    expect(s.objects[k]!.attacking).toBeDefined();
    putOnBattlefield(s, ap, creature("Keeper of Kookus", "Creature — Goblin", "{R}", 1, 1, { cmc: 1 }));
    s = settle(passUntil(s, "upkeep", ap));
    expect(life(s, ap)).toBe(37);
  });

  it("Bubbling Cauldron: a Festering Newt drains each opponent for 4; any creature gains 4", () => {
    const { s: s0, ap } = setup([]);
    const bc = putOnBattlefield(s0, ap, bubblingCauldron);
    const bear = putOnBattlefield(s0, ap, greenBear());
    expect(planActivate(s0, ap, bc, 1, [], undefined, undefined, undefined, { sacrifice: [bear] })).toBeNull();
    const newt = putOnBattlefield(s0, ap, creature("Festering Newt", "Creature — Salamander", "{B}", 1, 1, { cmc: 1 }));
    const s = settle(activateNow(s0, ap, bc, 1, [], undefined, { sacrifice: [newt] }));
    expect(s.turnOrder.filter((p) => p !== ap).map((p) => life(s, p))).toEqual([36, 36, 36]);
    expect(life(s, ap)).toBe(52);
  });

  it("Corpse Explosion and Draconic Intervention: the exiled card sets the damage", () => {
    const { s: s0, ap, ids, opp } = setup([corpseExplosion, draconicIntervention]);
    const beast = into(s0, ap, bigBeast(), "graveyard");
    const oppBear = putOnBattlefield(s0, opp, greenBear());
    const wall = putOnBattlefield(s0, opp, creature("Huge Wall", "Creature — Wall", "{4}", 0, 9, { cmc: 4 }));
    let s = settle(castNow(s0, ap, ids[0]!, [], { exileCards: [beast] }));
    expect(zone(s, oppBear)).toBe("graveyard");
    expect(s.objects[wall]!.damage).toBe(4);
    // Draconic Intervention: the instant's mana value, 1; a dying creature is exiled instead.
    const charm = into(s, ap, shock(), "graveyard");
    const elf = putOnBattlefield(s, opp, creature("Small Elf", "Creature — Elf", "{G}", 1, 1, { cmc: 1 }));
    const dragon = putOnBattlefield(s, opp, creature("Small Dragon", "Creature — Dragon", "{R}", 1, 1, { cmc: 1 }));
    s = priorityTo(s, ap);
    pool(s, ap, { R: 2, C: 2 });
    s = settle(castNow(s, ap, ids[1]!, [], { exileCards: [charm] }));
    expect(zone(s, elf)).toBe("exile");
    expect(zone(s, dragon)).toBe("battlefield");
    expect(zone(s, ids[1]!)).toBe("exile");
  });

  it("Dread Defiler: the opponent loses life equal to the exiled card's power; Necropolis gets +0/+1 counters for its mana value", () => {
    const { s: s0, ap, opp } = setup([]);
    const dd = putOnBattlefield(s0, ap, dreadDefiler);
    const necro = putOnBattlefield(s0, ap, necropolis);
    const beast = into(s0, ap, bigBeast(), "graveyard");
    const bear = into(s0, ap, greenBear(), "graveyard");
    pool(s0, ap, { C: 1 });
    let s = settle(activateNow(s0, ap, dd, 0, [ply(opp)], undefined, { exileCards: [beast] }));
    expect(life(s, opp)).toBe(36);
    s = settle(activateNow(s, ap, necro, 0, [], undefined, { exileCards: [bear] }));
    expect(pt(s, necro)).toBe("0/3");
  });

  it("Kyscu Drake: sacrificing it and a Spitting Drake fetches Viashivan Dragon", () => {
    const { s: s0, ap } = setup([]);
    const kd = putOnBattlefield(s0, ap, kyscuDrake);
    const dragon = into(s0, ap, creature("Viashivan Dragon", "Creature — Dragon", "{2}{R}{R}{G}{G}", 4, 4, { cmc: 6 }), "library");
    expect(planActivate(s0, ap, kd, 1, [])).toBeNull();
    const sd = putOnBattlefield(s0, ap, creature("Spitting Drake", "Creature — Drake", "{3}{R}{R}", 2, 2, { cmc: 5 }));
    let s = settle(activateNow(s0, ap, kd, 1, [], undefined, { sacrifice: [sd] }), at("searchLibrary", ap));
    if (s.pending?.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: ap, found: [dragon] });
    s = settle(s);
    expect([kd, sd].map((id) => zone(s, id))).toEqual(["graveyard", "graveyard"]);
    expect(zone(s, dragon)).toBe("battlefield");
  });
});
