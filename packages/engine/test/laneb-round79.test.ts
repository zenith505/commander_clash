// Lane B, round 79: unsupported cards from the bottom of the popularity list (`npm run popular -- --least`): one-line
// templates (a target rule only as an Aura spell is cast, an equip cost by its target's color, a cost reduction by the
// target's controller's graveyard, morph triggers, echo payment, a paid look at the top card, and others).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, botActions, castProblem, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, planTurnFaceUp, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";
import { objHasKeyword } from "../src/cards";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/**
 * Everyone passes until the stack is empty. "You may" is answered with `may`, trigger targets with the next of `targets`;
 * other questions as the bots would, except those of the players in `me` (it stops there).
 */
const settle = (s: GameState, opts: { may?: boolean; me?: PlayerId[]; targets?: TargetChoice[][] } = {}) => {
  const queue = [...(opts.targets ?? [])];
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.may ?? true });
    else if (p?.kind === "chooseTargets" && queue.length) s = act(s, { type: "chooseTargets", player: p.player, targets: queue.shift()! });
    else if (p && opts.me?.includes(p.player)) return s;
    else if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: [] });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Plays on (no attacks or blocks, the bots answering other questions) until `stop`. */
const goUntil = (s: GameState, stop: (s: GameState) => boolean) => {
  for (let i = 0; i < 3000; i++) {
    if (stop(s)) return s;
    const p = s.pending;
    const pid = waitingOn(s)!;
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, p.count) });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error("never got there");
};
const attackWith = (s: GameState, attackers: string[], defender: PlayerId) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return act(s, { type: "declareAttackers", player: s.activePlayer, attacks: attackers.map((attacker) => ({ attacker, defender })) });
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices: CostChoices = {}, x?: number) => run(s, planCast(s, pid, id, targets, undefined, "auto", x, choices));
/** Moves a new card for `def` into `pid`'s hand, library (on top) or graveyard. */
const toZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "library" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Takes `pid`'s lands off the battlefield and leaves exactly `pool` to pay with. */
const poolOnly = (s: GameState, pid: PlayerId, pool: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  for (const id of s.battlefield.filter((x) => s.objects[x]!.controller === pid && characteristics(s, s.objects[x]!).types.includes("Land"))) {
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "exile";
    s.players[pid]!.exile.push(id);
  }
  s.players[pid]!.manaPool = { ...s.players[pid]!.manaPool, ...pool };
  invalidateCharacteristics(s);
};
/** Empties `pid`'s hand (into exile), then gives them `defs`. */
const handOf = (s: GameState, pid: PlayerId, defs: CardDef[]) => {
  for (const id of [...s.players[pid]!.hand]) {
    s.players[pid]!.hand.splice(s.players[pid]!.hand.indexOf(id), 1);
    s.objects[id]!.zone = "exile";
    s.players[pid]!.exile.push(id);
  }
  invalidateCharacteristics(s);
  return defs.map((d) => toZone(s, pid, d, "hand"));
};
const hand = (s: GameState, pid: PlayerId) => s.players[pid]!.hand;
const yard = (s: GameState, pid: PlayerId) => s.players[pid]!.graveyard;
/** Blocks declared by `opp`; every other defending player declares none. */
const block = (s: GameState, opp: PlayerId, blocks: { blocker: string; attacker: string }[]) => {
  s = act(s, { type: "declareBlockers", player: opp, blocks });
  for (let i = 0; i < 10 && s.pending?.kind === "declareBlockers"; i++) s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
  return s;
};

// (helpers above)
const attach = (s: GameState, pid: PlayerId, def: CardDef, to: string) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.attachedTo = to;
  invalidateCharacteristics(s);
  return id;
};
/** A face-down 2/2 (morph) for `pid`, put there by the test. */
const faceDownFor = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.faceDown = "morph";
  invalidateCharacteristics(s);
  return id;
};
const up = (s: GameState, pid: PlayerId, id: string) => run(s, planTurnFaceUp(s, pid, id));

// Real oracle text (Scryfall).
const ghostfireBlade = (): CardDef => ({"oracleId": "093b1d8d-c836-4e9b-855b-4020361aa6ac", "name": "Ghostfire Blade", "manaCost": "{1}", "cmc": 1, "typeLine": "Artifact — Equipment", "supertypes": [], "types": ["Artifact"], "subtypes": ["Equipment"], "oracleText": "Equipped creature gets +2/+2.\nEquip {3}\nThis Equipment's equip ability costs {2} less to activate if it targets a colorless creature.", "colors": [], "colorIdentity": [], "keywords": ["Equip"], "layout": "normal"});
const dreamLeash = (): CardDef => ({"oracleId": "b7fde102-7b89-48c7-818c-bdf0eb33c2ee", "name": "Dream Leash", "manaCost": "{3}{U}{U}", "cmc": 5, "typeLine": "Enchantment — Aura", "supertypes": [], "types": ["Enchantment"], "subtypes": ["Aura"], "oracleText": "Enchant permanent\nYou can't choose an untapped permanent as this spell's target as you cast it.\nYou control enchanted permanent.", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Enchant"], "layout": "normal"});
const enthrallingHold = (): CardDef => ({"oracleId": "2f94cb83-1f48-4293-b219-67830c074aeb", "name": "Enthralling Hold", "manaCost": "{3}{U}{U}", "cmc": 5, "typeLine": "Enchantment — Aura", "supertypes": [], "types": ["Enchantment"], "subtypes": ["Aura"], "oracleText": "Enchant creature\nYou can't choose an untapped creature as this spell's target as you cast it.\nYou control enchanted creature.", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Enchant"], "layout": "normal"});
const lullmagesDomination = (): CardDef => ({"oracleId": "fdac480b-03b5-4ece-b42a-e6928b609419", "name": "Lullmage's Domination", "manaCost": "{X}{U}{U}{U}", "cmc": 3, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "This spell costs {3} less to cast if it targets a creature whose controller has eight or more cards in their graveyard.\nGain control of target creature with mana value X.", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "layout": "normal"});
const frontlineStrategist = (): CardDef => ({"oracleId": "6e202114-48f3-46d2-bc54-df766d149d9d", "name": "Frontline Strategist", "manaCost": "{W}", "cmc": 1, "typeLine": "Creature — Human Soldier", "supertypes": [], "types": ["Creature"], "subtypes": ["Human", "Soldier"], "oracleText": "Morph {W} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)\nWhen this creature is turned face up, prevent all combat damage non-Soldier creatures would deal this turn.", "power": "1", "toughness": "1", "colors": ["W"], "colorIdentity": ["W"], "keywords": ["Morph"], "layout": "normal"});
const shaperParasite = (): CardDef => ({"oracleId": "0f5da28f-b97c-45d5-87d4-b8ba8638ca8f", "name": "Shaper Parasite", "manaCost": "{1}{U}{U}", "cmc": 3, "typeLine": "Creature — Illusion", "supertypes": [], "types": ["Creature"], "subtypes": ["Illusion"], "oracleText": "Morph {2}{U} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)\nWhen this creature is turned face up, target creature gets +2/-2 or -2/+2 until end of turn.", "power": "2", "toughness": "3", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Morph"], "layout": "normal"});
const maelstromDjinn = (): CardDef => ({"oracleId": "351988f0-59c6-492d-8a39-efa0329e1447", "name": "Maelstrom Djinn", "manaCost": "{7}{U}", "cmc": 8, "typeLine": "Creature — Djinn", "supertypes": [], "types": ["Creature"], "subtypes": ["Djinn"], "oracleText": "Flying\nMorph {2}{U} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)\nWhen this creature is turned face up, put two time counters on it and it gains vanishing. (At the beginning of your upkeep, remove a time counter from it. When the last is removed, sacrifice it.)", "power": "5", "toughness": "6", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Flying", "Morph"], "layout": "normal"});
const wandOfDenial = (): CardDef => ({"oracleId": "9d32da71-60e5-4eb3-97ca-ae76e2f5df57", "name": "Wand of Denial", "manaCost": "{2}", "cmc": 2, "typeLine": "Artifact", "supertypes": [], "types": ["Artifact"], "subtypes": [], "oracleText": "{T}: Look at the top card of target player's library. If it's a nonland card, you may pay 2 life. If you do, put it into that player's graveyard.", "colors": [], "colorIdentity": [], "keywords": [], "layout": "normal"});
const burrogBarrage = (): CardDef => ({"oracleId": "c47caa45-e7fc-414a-8a5d-59b58f1751f3", "name": "Burrog Barrage", "manaCost": "{1}{G}", "cmc": 2, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Target creature you control gets +1/+0 until end of turn if you've cast another instant or sorcery spell this turn. Then it deals damage equal to its power to up to one target creature an opponent controls.", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "layout": "normal"});
const cadaverousBloom = (): CardDef => ({"oracleId": "fbb0f73b-5e30-4632-99c1-e49582e41f8d", "name": "Cadaverous Bloom", "manaCost": "{3}{B}{G}", "cmc": 5, "typeLine": "Enchantment", "supertypes": [], "types": ["Enchantment"], "subtypes": [], "oracleText": "Exile a card from your hand: Add {B}{B} or {G}{G}.", "colors": ["B", "G"], "colorIdentity": ["B", "G"], "keywords": [], "producedMana": ["B", "G"], "layout": "normal"});
const energyStorm = (): CardDef => ({"oracleId": "567d3de7-8d56-4b6d-a59a-f8674172f595", "name": "Energy Storm", "manaCost": "{1}{W}", "cmc": 2, "typeLine": "Enchantment", "supertypes": [], "types": ["Enchantment"], "subtypes": [], "oracleText": "Cumulative upkeep {1} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nPrevent all damage that would be dealt by instant and sorcery spells.\nCreatures with flying don't untap during their controllers' untap steps.", "colors": ["W"], "colorIdentity": ["W"], "keywords": ["Cumulative upkeep"], "layout": "normal"});
const artifactWard = (): CardDef => ({"oracleId": "9bd3a4bb-cc12-4e5f-a33f-77ab0c7788db", "name": "Artifact Ward", "manaCost": "{W}", "cmc": 1, "typeLine": "Enchantment — Aura", "supertypes": [], "types": ["Enchantment"], "subtypes": ["Aura"], "oracleText": "Enchant creature\nEnchanted creature can't be blocked by artifact creatures.\nPrevent all damage that would be dealt to enchanted creature by artifact sources.\nEnchanted creature can't be the target of abilities from artifact sources.", "colors": ["W"], "colorIdentity": ["W"], "keywords": ["Enchant"], "layout": "normal"});
const caughtInTheBrights = (): CardDef => ({"oracleId": "fa131186-d730-460b-b9e5-b97d89857e24", "name": "Caught in the Brights", "manaCost": "{2}{W}", "cmc": 3, "typeLine": "Enchantment — Aura", "supertypes": [], "types": ["Enchantment"], "subtypes": ["Aura"], "oracleText": "Enchant creature\nEnchanted creature can't attack or block.\nWhen a Vehicle you control attacks, exile enchanted creature.", "colors": ["W"], "colorIdentity": ["W"], "keywords": ["Enchant"], "layout": "normal"});
const shahOfNaarIsle = (): CardDef => ({"oracleId": "31c978b4-06d7-4e9d-82da-bfa4ef16f470", "name": "Shah of Naar Isle", "manaCost": "{3}{R}", "cmc": 4, "typeLine": "Creature — Efreet", "supertypes": [], "types": ["Creature"], "subtypes": ["Efreet"], "oracleText": "Trample\nEcho {0} (At the beginning of your upkeep, if this came under your control since the beginning of your last upkeep, sacrifice it unless you pay its echo cost.)\nWhen this creature's echo cost is paid, each opponent may draw up to three cards.", "power": "6", "toughness": "6", "colors": ["R"], "colorIdentity": ["R"], "keywords": ["Trample", "Echo"], "layout": "normal"});
const ornateKanzashi = (): CardDef => ({"oracleId": "3c41c666-5cf4-4f35-9cb8-c41f1f78f31e", "name": "Ornate Kanzashi", "manaCost": "{5}", "cmc": 5, "typeLine": "Artifact", "supertypes": [], "types": ["Artifact"], "subtypes": [], "oracleText": "{2}, {T}: Target opponent exiles the top card of their library. You may play that card this turn.", "colors": [], "colorIdentity": [], "keywords": [], "layout": "normal"});
const meldwebStrider = (): CardDef => ({"oracleId": "b66dd751-fef7-4310-9c09-8d1b1fc78fef", "name": "Meldweb Strider", "manaCost": "{4}{U}", "cmc": 5, "typeLine": "Artifact — Vehicle", "supertypes": [], "types": ["Artifact"], "subtypes": ["Vehicle"], "oracleText": "Vigilance\nThis Vehicle enters with an oil counter on it.\nRemove an oil counter from this Vehicle: It becomes an artifact creature until end of turn.\nCrew 3 (Tap any number of creatures you control with total power 3 or more: This Vehicle becomes an artifact creature until end of turn.)", "power": "5", "toughness": "5", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Vigilance", "Crew"], "layout": "normal"});
const dormantGomazoa = (): CardDef => ({"oracleId": "bc5a7015-c13b-4d92-8afe-50b7956c14dd", "name": "Dormant Gomazoa", "manaCost": "{1}{U}{U}", "cmc": 3, "typeLine": "Creature — Jellyfish", "supertypes": [], "types": ["Creature"], "subtypes": ["Jellyfish"], "oracleText": "Flying\nThis creature enters tapped.\nThis creature doesn't untap during your untap step.\nWhenever you become the target of a spell, you may untap this creature.", "power": "5", "toughness": "5", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Flying"], "layout": "normal"});
const lightningBolt = (): CardDef => ({"oracleId": "4457ed35-7c10-48c8-9776-456485fdf070", "name": "Lightning Bolt", "manaCost": "{R}", "cmc": 1, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Lightning Bolt deals 3 damage to any target.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "layout": "normal"});
const shock = (): CardDef => ({"oracleId": "a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d", "name": "Shock", "manaCost": "{R}", "cmc": 1, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Shock deals 2 damage to any target.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "layout": "normal"});
const bears = (): CardDef => ({"oracleId": "14c8f55d-d177-4c25-a931-ebeb9e6062a0", "name": "Grizzly Bears", "manaCost": "{1}{G}", "cmc": 2, "typeLine": "Creature — Bear", "supertypes": [], "types": ["Creature"], "subtypes": ["Bear"], "oracleText": "", "power": "2", "toughness": "2", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "layout": "normal"});
const ornithopter = (): CardDef => ({"oracleId": "a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba", "name": "Ornithopter", "manaCost": "{0}", "cmc": 0, "typeLine": "Artifact Creature — Thopter", "supertypes": [], "types": ["Artifact", "Creature"], "subtypes": ["Thopter"], "oracleText": "Flying", "power": "0", "toughness": "2", "colors": [], "colorIdentity": [], "keywords": ["Flying"], "layout": "normal"});
const rodOfRuin = (): CardDef => ({"oracleId": "c29a04ab-4e14-45d8-a993-3fffd0e2f6eb", "name": "Rod of Ruin", "manaCost": "{4}", "cmc": 4, "typeLine": "Artifact", "supertypes": [], "types": ["Artifact"], "subtypes": [], "oracleText": "{3}, {T}: This artifact deals 1 damage to any target.", "colors": [], "colorIdentity": [], "keywords": [], "layout": "normal"});
const opt = (): CardDef => ({"oracleId": "713332c1-5bd8-400f-bfff-c1ca0697a043", "name": "Opt", "manaCost": "{U}", "cmc": 1, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Scry"], "layout": "normal"});
const solRing = (): CardDef => ({"oracleId": "6ad8011d-3471-4369-9d68-b264cc027487", "name": "Sol Ring", "manaCost": "{1}", "cmc": 1, "typeLine": "Artifact", "supertypes": [], "types": ["Artifact"], "subtypes": [], "oracleText": "{T}: Add {C}{C}.", "colors": [], "colorIdentity": [], "keywords": [], "producedMana": ["C"], "layout": "normal"});
const eliteVanguard = (): CardDef => ({"oracleId": "b3b9a87d-cb95-435c-90b6-037406cab32e", "name": "Elite Vanguard", "manaCost": "{W}", "cmc": 1, "typeLine": "Creature — Human Soldier", "supertypes": [], "types": ["Creature"], "subtypes": ["Human", "Soldier"], "oracleText": "", "power": "2", "toughness": "1", "colors": ["W"], "colorIdentity": ["W"], "keywords": [], "layout": "normal"});
const smugglersCopter = (): CardDef => ({"oracleId": "49136bdc-bc50-49a2-999a-1ef9c16ea130", "name": "Smuggler's Copter", "manaCost": "{2}", "cmc": 2, "typeLine": "Artifact — Vehicle", "supertypes": [], "types": ["Artifact"], "subtypes": ["Vehicle"], "oracleText": "Flying\nWhenever this Vehicle attacks or blocks, you may draw a card. If you do, discard a card.\nCrew 1 (Tap any number of creatures you control with total power 1 or more: This Vehicle becomes an artifact creature until end of turn.)", "power": "3", "toughness": "3", "colors": [], "colorIdentity": [], "keywords": ["Flying", "Crew"], "layout": "normal"});
const prodigalSorcerer = (): CardDef => ({"oracleId": "5e961d15-5972-4e4b-9385-1cd7cd7c6bbe", "name": "Prodigal Sorcerer", "manaCost": "{2}{U}", "cmc": 3, "typeLine": "Creature — Human Wizard Sorcerer", "supertypes": [], "types": ["Creature"], "subtypes": ["Human", "Wizard", "Sorcerer"], "oracleText": "{T}: This creature deals 1 damage to any target.", "power": "1", "toughness": "1", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "layout": "normal"});
const divination = (): CardDef => ({"oracleId": "273b339c-964b-4a18-8eb5-ceb8abcdfd9e", "name": "Divination", "manaCost": "{2}{U}", "cmc": 3, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Draw two cards.", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "layout": "normal"});
const giantGrowth = (): CardDef => ({"oracleId": "5748ebf1-24e3-499d-ab7c-c2cebd462a24", "name": "Giant Growth", "manaCost": "{G}", "cmc": 1, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Target creature gets +3/+3 until end of turn.", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "layout": "normal"});

const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(typeof l === "string" ? l : l.text));
/** Plays on to `pid`'s next upkeep, its triggers on the stack or asking. */
const toNextUpkeep = (s: GameState, pid: PlayerId) => {
  const turn = s.turn;
  return goUntil(s, (x) => x.turn > turn && x.activePlayer === pid && x.step === "upkeep" && (x.stack.length > 0 || !!x.pending));
};

describe("Lane B round 79", () => {
  it("all of them are supported", () => {
    supported(ghostfireBlade(), dreamLeash(), enthrallingHold(), lullmagesDomination(), frontlineStrategist(), shaperParasite(), maelstromDjinn(), wandOfDenial(), burrogBarrage(), cadaverousBloom(), energyStorm(), artifactWard(), caughtInTheBrights(), shahOfNaarIsle(), ornateKanzashi(), meldwebStrider(), dormantGomazoa());
  });

  it("Ghostfire Blade: its equip costs {1} if it targets a colorless creature, {3} otherwise", () => {
    const { s: s0, ap } = setup([]);
    const blade = putOnBattlefield(s0, ap, ghostfireBlade());
    const bear = putOnBattlefield(s0, ap, bears());
    const thopter = putOnBattlefield(s0, ap, ornithopter());
    poolOnly(s0, ap, { C: 1 });
    const equip = abilitiesOf(s0, s0.objects[blade]!).activated.findIndex((a) => !!a.equip);
    expect(planActivate(s0, ap, blade, equip, [tgt(bear)])).toBeNull();
    let s = settle(run(s0, planActivate(s0, ap, blade, equip, [tgt(thopter)])));
    expect(s.objects[blade]!.attachedTo).toBe(thopter);
    expect(pt(s, thopter)).toBe("2/4");
    // With three, it can move to the colored creature.
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, C: 3 };
    s = settle(run(s, planActivate(s, ap, blade, equip, [tgt(bear)])));
    expect(s.objects[blade]!.attachedTo).toBe(bear);
    expect(s.players[ap]!.manaPool.C ?? 0).toBe(0);
  });

  it("Dream Leash: only a tapped permanent can be chosen as it's cast; it still resolves if that permanent untaps", () => {
    const { s: s0, ap, opp, ids } = setup([dreamLeash()]);
    const rock = putOnBattlefield(s0, opp, solRing());
    expect(planCast(s0, ap, ids[0]!, [tgt(rock)])).toBeNull();
    expect(castProblem(s0, ap, ids[0]!, [tgt(rock)])).toBeTruthy();
    s0.objects[rock]!.tapped = true;
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(rock)]));
    expect(s.stack.length).toBe(1);
    // It untaps before Dream Leash resolves: it still resolves (rulings).
    s.objects[rock]!.tapped = false;
    s = settle(s);
    expect(s.objects[ids[0]!]!.attachedTo).toBe(rock);
    expect(controllerOf(s, s.objects[rock]!)).toBe(ap);
  });

  it("Enthralling Hold: a tapped creature only, then you control it", () => {
    const { s: s0, ap, opp, ids } = setup([enthrallingHold()]);
    const theirs = putOnBattlefield(s0, opp, bears());
    expect(planCast(s0, ap, ids[0]!, [tgt(theirs)])).toBeNull();
    s0.objects[theirs]!.tapped = true;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(theirs)])));
    expect(controllerOf(s, s.objects[theirs]!)).toBe(ap);
  });

  it("Enthralling Hold: a bot casts it only on a tapped creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const [hold] = handOf(s0, ap, [enthrallingHold()]);
    const untapped = putOnBattlefield(s0, opp, bears());
    const tapped = putOnBattlefield(s0, opp, bears());
    s0.objects[tapped]!.tapped = true;
    const cast = botActions(s0, ap).find((a) => a.type === "castSpell" && a.objectId === hold);
    expect(cast).toBeDefined();
    expect((cast as Extract<Action, { type: "castSpell" }>).targets).toEqual([tgt(tapped)]);
    expect(untapped).toBeTruthy();
  });

  it("Lullmage's Domination: {3} less if its target's controller has eight or more cards in their graveyard", () => {
    const { s: s0, ap, opp, ids } = setup([lullmagesDomination()]);
    const theirs = putOnBattlefield(s0, opp, bears());
    poolOnly(s0, ap, { U: 3 });
    // X = 2 (Grizzly Bears' mana value): {2}{U}{U}{U} with seven cards there, {U}{U}{U} with eight.
    for (let i = 0; i < 7; i++) toZone(s0, opp, bears(), "graveyard");
    expect(planCast(s0, ap, ids[0]!, [tgt(theirs)], undefined, "auto", 2)).toBeNull();
    toZone(s0, opp, bears(), "graveyard");
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(theirs)], {}, 2));
    expect(controllerOf(s, s.objects[theirs]!)).toBe(ap);
  });

  it("Frontline Strategist: turned face up, combat damage from non-Soldier creatures is prevented this turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const fs = faceDownFor(s0, ap, frontlineStrategist());
    const bear = putOnBattlefield(s0, ap, bears());
    const soldier = putOnBattlefield(s0, ap, eliteVanguard());
    let s = settle(up(s0, ap, fs));
    expect(characteristics(s, s.objects[fs]!).name).toBe("Frontline Strategist");
    const life = s.players[opp]!.life;
    s = attackWith(s, [bear, soldier], opp);
    s = goUntil(s, (x) => x.step === "endCombat" || x.step === "main2");
    // The Bear's 2 is prevented, the Soldier's 2 isn't.
    expect(s.players[opp]!.life).toBe(life - 2);
  });

  it("Shaper Parasite: turned face up, target creature gets +2/-2 or -2/+2, chosen as it resolves", () => {
    const { s: s0, ap, opp } = setup([]);
    const sp = faceDownFor(s0, ap, shaperParasite());
    const theirs = putOnBattlefield(s0, opp, bears());
    let s = up(s0, ap, sp);
    s = settle(s, { me: [ap], targets: [[tgt(theirs)]] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap });
    const opts = (s.pending as { labels?: string[] }).labels ?? [];
    expect(opts.some((l) => /\+2\/-2/.test(l))).toBe(true);
    const p = s.pending as Extract<NonNullable<GameState["pending"]>, { kind: "chooseOption" }>;
    s = act(s, { type: "chooseOption", player: ap, choice: p.options[opts.findIndex((l) => /\+2\/-2/.test(l))]! });
    s = settle(s);
    expect(zone(s, theirs)).toBe("graveyard");
  });

  it("Maelstrom Djinn: turned face up, two time counters and vanishing; sacrificed when the last is removed", () => {
    const { s: s0, ap } = setup([]);
    const dj = faceDownFor(s0, ap, maelstromDjinn());
    let s = settle(up(s0, ap, dj));
    expect(s.objects[dj]!.counters.time).toBe(2);
    expect(objHasKeyword(s, s.objects[dj]!, "Vanishing")).toBe(true);
    s.players[ap]!.hand = [];
    s = settle(toNextUpkeep(s, ap));
    expect(s.objects[dj]!.counters.time).toBe(1);
    s.players[ap]!.hand = [];
    s = settle(toNextUpkeep(s, ap));
    expect(zone(s, dj)).toBe("graveyard");
  });

  it("Wand of Denial: a nonland card on top of their library can be put into their graveyard for 2 life", () => {
    const { s: s0, ap, opp, ids: _ } = setup([]);
    const wand = putOnBattlefield(s0, ap, wandOfDenial());
    const top = toZone(s0, opp, opt(), "library");
    const life = s0.players[ap]!.life;
    let s = run(s0, planActivate(s0, ap, wand, 0, [player(opp)]));
    s = settle(s, { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, cards: [top], min: 0, max: 1, dig: { payLife: 2 } });
    s = act(s, { type: "searchLibrary", player: ap, found: [top] });
    s = settle(s);
    expect(zone(s, top)).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(life - 2);
  });

  it("Wand of Denial: a land stays on top, and nothing is paid; declining pays nothing either", () => {
    const { s: s0, ap, opp } = setup([]);
    const wand = putOnBattlefield(s0, ap, wandOfDenial());
    const land = s0.players[opp]!.library[0]!;
    expect(characteristics(s0, s0.objects[land]!).types).toContain("Land");
    const life = s0.players[ap]!.life;
    let s = settle(run(s0, planActivate(s0, ap, wand, 0, [player(opp)])), { me: [ap] });
    expect(s.pending).toBeNull();
    expect(s.players[opp]!.library[0]).toBe(land);
    expect(s.players[ap]!.life).toBe(life);
    // A nonland card, declined.
    const top = toZone(s, opp, opt(), "library");
    s.objects[wand]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, wand, 0, [player(opp)])), { me: [ap] });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }));
    expect(s.players[opp]!.library[0]).toBe(top);
    expect(s.players[ap]!.life).toBe(life);
  });

  it("Wand of Denial: with less than 2 life it can't be paid (CR 119.4)", () => {
    const { s: s0, ap, opp } = setup([]);
    const wand = putOnBattlefield(s0, ap, wandOfDenial());
    const top = toZone(s0, opp, opt(), "library");
    s0.players[ap]!.life = 1;
    const s = settle(run(s0, planActivate(s0, ap, wand, 0, [player(opp)])), { me: [ap] });
    expect(s.pending).toBeNull();
    expect(s.players[opp]!.library[0]).toBe(top);
    expect(s.players[ap]!.life).toBe(1);
  });

  it("Burrog Barrage: +1/+0 only if you've cast another instant or sorcery this turn, then it bites", () => {
    const { s: s0, ap, opp, ids } = setup([burrogBarrage(), burrogBarrage()]);
    const mine = putOnBattlefield(s0, ap, bears());
    const a = putOnBattlefield(s0, opp, prodigalSorcerer());
    const b = putOnBattlefield(s0, opp, eliteVanguard());
    // First one: none cast before it, so 2 damage to a 1/1.
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(mine), tgt(a)]));
    expect(pt(s, mine)).toBe("2/2");
    expect(zone(s, a)).toBe("graveyard");
    // Second one: the first counts, so the Bear is 3/2 and deals 3 to the 2/1.
    s = settle(castNow(s, ap, ids[1]!, [tgt(mine), tgt(b)]));
    expect(pt(s, mine)).toBe("3/2");
    expect(zone(s, b)).toBe("graveyard");
  });

  it("Burrog Barrage: with no second target it only pumps", () => {
    const { s: s0, ap, ids } = setup([opt(), burrogBarrage()]);
    const mine = putOnBattlefield(s0, ap, bears());
    let s = settle(castNow(s0, ap, ids[0]!));
    s = settle(castNow(s, ap, ids[1]!, [tgt(mine), { kind: "none" }]));
    expect(pt(s, mine)).toBe("3/2");
  });

  it("Cadaverous Bloom: exile a card from your hand: {B}{B} or {G}{G}, not one of each", () => {
    const { s: s0, ap } = setup([bears(), bears()]);
    const bloom = putOnBattlefield(s0, ap, cadaverousBloom());
    const [h1] = s0.players[ap]!.hand;
    const ab = abilitiesOf(s0, s0.objects[bloom]!).activated.findIndex((a) => /Add \{B\}\{B\} or \{G\}\{G\}/.test(a.text));
    expect(ab).toBeGreaterThanOrEqual(0);
    const before = { ...s0.players[ap]!.manaPool };
    let s = run(s0, planActivate(s0, ap, bloom, ab, [], undefined, undefined, undefined, { exileFromHand: [h1!] } as CostChoices));
    s = settle(s, { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "color" });
    s = act(s, { type: "chooseOption", player: ap, choice: "Green" });
    s = settle(s, { me: [ap] });
    expect(zone(s, h1!)).toBe("exile");
    expect((s.players[ap]!.manaPool.G ?? 0) - (before.G ?? 0)).toBe(2);
    expect((s.players[ap]!.manaPool.B ?? 0) - (before.B ?? 0)).toBe(0);
  });

  it("Energy Storm: damage from instant and sorcery spells is prevented, not from creatures' abilities", () => {
    const { s: s0, ap, opp, ids } = setup([lightningBolt()]);
    putOnBattlefield(s0, ap, energyStorm());
    const sorc = putOnBattlefield(s0, ap, prodigalSorcerer());
    const life = s0.players[opp]!.life;
    let s = settle(castNow(s0, ap, ids[0]!, [player(opp)]));
    expect(s.players[opp]!.life).toBe(life);
    s = settle(run(s, planActivate(s, ap, sorc, 0, [player(opp)])));
    expect(s.players[opp]!.life).toBe(life - 1);
  });

  it("Artifact Ward: enchanted creature can't be the target of an artifact's ability, but can be of a creature's or a spell", () => {
    const { s: s0, ap, opp, ids } = setup([shock()]);
    const theirs = putOnBattlefield(s0, opp, bears());
    attach(s0, opp, artifactWard(), theirs);
    const rod = putOnBattlefield(s0, ap, rodOfRuin());
    const sorc = putOnBattlefield(s0, ap, prodigalSorcerer());
    expect(planActivate(s0, ap, rod, 0, [tgt(theirs)])).toBeNull();
    expect(planActivate(s0, ap, sorc, 0, [tgt(theirs)])).not.toBeNull();
    expect(planCast(s0, ap, ids[0]!, [tgt(theirs)])).not.toBeNull();
    // It can't be blocked by artifact creatures either (already supported).
    expect(isFullySupported(artifactWard())).toBe(true);
  });

  it("Caught in the Brights: enchanted creature can't attack or block; when a Vehicle you control attacks, it's exiled", () => {
    const { s: s0, ap, opp } = setup([]);
    const theirs = putOnBattlefield(s0, opp, bears());
    attach(s0, ap, caughtInTheBrights(), theirs);
    const copter = putOnBattlefield(s0, ap, smugglersCopter());
    const crew = putOnBattlefield(s0, ap, bears());
    const crewIdx = abilitiesOf(s0, s0.objects[copter]!).activated.findIndex((a) => /^Crew/.test(a.text));
    let s = settle(act(s0, { type: "activateAbility", player: ap, objectId: copter, index: crewIdx, tapCreatures: [crew] }));
    expect(characteristics(s, s.objects[copter]!).types).toContain("Creature");
    s = attackWith(s, [copter], opp);
    s = settle(s, { may: false });
    expect(zone(s, theirs)).toBe("exile");
  });

  it("Shah of Naar Isle: when its echo cost is paid, each opponent may draw up to three cards", () => {
    const { s: s0, ap, ids } = setup([shahOfNaarIsle()]);
    let s = settle(castNow(s0, ap, ids[0]!));
    s.players[ap]!.hand = [];
    // In turn order from you (CR 101.4).
    const opps = [1, 2, 3].map((i) => s.turnOrder[(s.turnOrder.indexOf(ap) + i) % 4]!) as PlayerId[];
    s = toNextUpkeep(s, ap);
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, keep: true, pay: { mana: "{0}" } });
    const hands = opps.map((p) => s.players[p]!.hand.length);
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(zone(s, ids[0]!)).toBe("battlefield");
    // The echo-paid trigger: each opponent is asked, in turn order.
    for (const p of opps) {
      s = settle(s, { me: opps });
      expect(s.pending).toMatchObject({ kind: "chooseOption", player: p, what: "drawUpTo" });
      s = act(s, { type: "chooseOption", player: p, choice: p === opps[0] ? "3" : "0" });
    }
    s = settle(s, { me: [ap] });
    expect(s.players[opps[0]!]!.hand.length).toBe(hands[0]! + 3);
    expect(s.players[opps[1]!]!.hand.length).toBe(hands[1]!);
  });

  it("Shah of Naar Isle: not paying its echo sacrifices it, and nobody draws", () => {
    const { s: s0, ap, ids } = setup([shahOfNaarIsle()]);
    let s = settle(castNow(s0, ap, ids[0]!));
    s.players[ap]!.hand = [];
    s = settle(toNextUpkeep(s, ap), { may: false });
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(logged(s, /draw up to/)).toBe(false);
  });

  it("Ornate Kanzashi: target opponent exiles their top card; you may play it this turn only", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, ornateKanzashi());
    const top = toZone(s0, opp, opt(), "library");
    let s = settle(run(s0, planActivate(s0, ap, k, 0, [player(opp)])));
    expect(zone(s, top)).toBe("exile");
    expect(s.objects[top]!.mayPlay).toMatchObject({ player: ap, until: "thisTurn" });
    s = settle(castNow(s, ap, top));
    expect(zone(s, top)).toBe("graveyard");
  });

  it("Meldweb Strider: enters with an oil counter; removing it makes it a 5/5 artifact creature until end of turn", () => {
    const { s: s0, ap, ids } = setup([meldwebStrider()]);
    let s = settle(castNow(s0, ap, ids[0]!));
    const ms = ids[0]!;
    expect(s.objects[ms]!.counters.oil).toBe(1);
    expect(characteristics(s, s.objects[ms]!).types).not.toContain("Creature");
    const idx = abilitiesOf(s, s.objects[ms]!).activated.findIndex((a) => /oil counter/.test(a.text));
    s = settle(run(s, planActivate(s, ap, ms, idx, [])));
    expect(s.objects[ms]!.counters.oil ?? 0).toBe(0);
    expect(characteristics(s, s.objects[ms]!).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(pt(s, ms)).toBe("5/5");
    s = goUntil(s, (x) => x.activePlayer !== ap);
    expect(characteristics(s, s.objects[ms]!).types).not.toContain("Creature");
  });

  it("Dormant Gomazoa: when you become the target of a spell (anyone's), you may untap it; not of an ability", () => {
    const { s: s0, ap, opp, ids } = setup([]);
    const g = putOnBattlefield(s0, ap, dormantGomazoa());
    s0.objects[g]!.tapped = true;
    // An opponent's ability targeting you: nothing.
    const sorc = putOnBattlefield(s0, opp, prodigalSorcerer());
    let s = s0;
    s.priority = opp;
    const plan = planActivate(s, opp, sorc, 0, [player(ap)]);
    expect(plan).not.toBeNull();
    s = settle(run(s, plan), { may: true });
    expect(s.objects[g]!.tapped).toBe(true);
    // A spell targeting you: untap.
    const bolt = toZone(s, opp, lightningBolt(), "hand");
    s.players[opp]!.manaPool = { ...s.players[opp]!.manaPool, R: 1 };
    s.priority = opp;
    s = run(s, planCast(s, opp, bolt, [player(ap)]));
    s = settle(s, { may: true });
    expect(s.objects[g]!.tapped).toBe(false);
    expect(ids).toEqual([]);
  });
});
