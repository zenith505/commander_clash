// Lane B, round 83: unsupported cards from the bottom of the popularity list (`npm run popular -- --least`): one-line
// templates (changing the target of a spell that targets only one thing, a legendary permanent's death trigger, an upkeep
// trigger that needs its source still there, an ability that triggers only once, a tap cost with flying, an exchange
// bounded by the first target's power, a token for each destroyed target's controller, prevention except for enchanted
// creatures, a delayed trigger for combat damage dealt to you, a creature of your choice's combat damage prevented, a
// delayed "becomes blocked by a creature of that color" trigger, cards put into exile, "no longer goaded", and an X that
// counts the ability's resolutions this turn).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { runStateBasedActions, abilitiesOf, abilityProblem, botActions, closeZoneBatch, manaAbilityProblem, castProblem, characteristics, controllerOf, destroyPermanent, dealDamage, invalidateCharacteristics, isFullySupported, objectSource, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";
const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
const abilitiesIndex = (s: GameState, id: string, re: RegExp) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => re.test(a.text ?? ""));
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


/** Plays on to `pid`'s next upkeep, its triggers on the stack or asking. */
const toNextUpkeep = (s: GameState, pid: PlayerId) => {
  const turn = s.turn;
  return goUntil(s, (x) => x.turn > turn && x.activePlayer === pid && x.step === "upkeep" && (x.stack.length > 0 || !!x.pending));
};
const attach = (s: GameState, pid: PlayerId, def: CardDef, to: string) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.attachedTo = to;
  invalidateCharacteristics(s);
  return id;
};
/** Passes (resolving what's on the stack the way settle does) until `pid` is asked to declare blockers. */
const toBlocks = (s: GameState, opts: { targets?: TargetChoice[][] } = {}) => {
  for (let i = 0; i < 100 && s.pending?.kind !== "declareBlockers"; i++) {
    if (s.stack.length || s.pending) s = settle(s, opts);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const lifeOf = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
/** A creature card on top of `pid`'s library, the first of `defs` ending on top. */
const stackLibrary = (s: GameState, pid: PlayerId, defs: CardDef[]) => [...defs].reverse().map((d) => toZone(s, pid, d, "library")).reverse();


const named = (s: GameState, pid: PlayerId, zoneName: "graveyard" | "hand" | "exile" | "library", name: string) => s.players[pid]![zoneName].filter((id) => s.cards[s.objects[id]!.cardId]!.name === name);
const onField = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).name === name);
/** Passes priority (the bots answering questions, triggers resolving) until `stop`. */
const passUntilThat = (s: GameState, stop: (s: GameState) => boolean) => {
  for (let i = 0; i < 400; i++) {
    if (stop(s)) return s;
    const p = s.pending;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  throw new Error("never got there");
};
/** Attacks `defender` with `attackers`, `opp` blocks as given, then plays on to the combat damage step's end. */
const fight = (s: GameState, attackers: string[], defender: PlayerId, blocks: { blocker: string; attacker: string }[], opts: { targets?: TargetChoice[][]; may?: boolean; me?: PlayerId[] } = {}) => {
  s = attackWith(s, attackers, defender);
  s = toBlocks(s);
  s = block(s, defender, blocks);
  return passUntilThat(s, (x) => x.step === "main2" || (x.step === "combatDamage" && (x.stack.length > 0 || x.triggerQueue.length > 0 || !!x.pending)));
};


const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const giantGrowth = (): CardDef => ({"oracleId":"5748ebf1-24e3-499d-ab7c-c2cebd462a24","name":"Giant Growth","manaCost":"{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature gets +3/+3 until end of turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"layout":"normal"}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"layout":"normal"}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const serraAngel = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"layout":"normal"}) as CardDef;
const yomiji = (): CardDef => ({"oracleId":"438be2fa-5f8d-42ff-894a-671ba4221196","name":"Yomiji, Who Bars the Way","manaCost":"{5}{W}{W}","cmc":7,"typeLine":"Legendary Creature — Spirit","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Spirit"],"oracleText":"Whenever a legendary permanent other than Yomiji is put into a graveyard from the battlefield, return that card to its owner's hand.","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":[],"layout":"normal"}) as CardDef;
const myrServitor = (): CardDef => ({"oracleId":"b6a50858-a013-4703-a9d7-5b69ef9bd9ae","name":"Myr Servitor","manaCost":"{1}","cmc":1,"typeLine":"Artifact Creature — Myr","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Myr"],"oracleText":"At the beginning of your upkeep, if this creature is on the battlefield, each player returns all cards named Myr Servitor from their graveyard to the battlefield.","power":"1","toughness":"1","colors":[],"colorIdentity":[],"keywords":[],"layout":"normal"}) as CardDef;
const cheerleader = (): CardDef => ({"oracleId":"d8ce3f18-26fe-47e8-be8b-0d89d7de7038","name":"Acrobatic Cheerleader","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Human Survivor","supertypes":[],"types":["Creature"],"subtypes":["Human","Survivor"],"oracleText":"Survival — At the beginning of your second main phase, if this creature is tapped, put a flying counter on it. This ability triggers only once.","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["Survival"],"layout":"normal"}) as CardDef;
const radiant = (): CardDef => ({"oracleId":"4a8227ff-0ae4-4405-8e44-1f5187a7f9f5","name":"Radiant, Serra Archangel","manaCost":"{6}{W}","cmc":7,"typeLine":"Legendary Creature — Angel","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nTap another untapped creature you control with flying: Radiant gains protection from the color of your choice until end of turn.\nPartner (You can have two commanders if both have partner.)","power":"6","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Partner"],"layout":"normal"}) as CardDef;
const shrewd = (): CardDef => ({"oracleId":"d36fea45-d8aa-469a-bcfc-5c0e4a0e807b","name":"Shrewd Negotiation","manaCost":"{4}{U}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Exchange control of target artifact you control and target artifact or creature you don't control.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;
const spawnbroker = (): CardDef => ({"oracleId":"ae050bc8-f289-4484-a07f-dfe0f0a962dc","name":"Spawnbroker","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"When this creature enters, you may exchange control of target creature you control and target creature with power less than or equal to that creature's power an opponent controls.","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;
const soulEmancipation = (): CardDef => ({"oracleId":"e9666fd2-3ebf-4f57-a51d-a80e625f39fa","name":"Soul of Emancipation","manaCost":"{4}{G}{W}{U}","cmc":7,"typeLine":"Creature — Avatar","supertypes":[],"types":["Creature"],"subtypes":["Avatar"],"oracleText":"When this creature enters, destroy up to three other target nonland permanents. For each of those permanents, its controller creates a 3/3 white Angel creature token with flying.","power":"5","toughness":"7","colors":["G","U","W"],"colorIdentity":["G","U","W"],"keywords":[],"layout":"normal"}) as CardDef;
const rebound = (): CardDef => ({"oracleId":"9769ed80-b546-49f5-9329-689e619dabdd","name":"Rebound","manaCost":"{1}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Change the target of target spell that targets only a player. The new target must be a player.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;
const torchling = (): CardDef => ({"oracleId":"769748a8-d861-46f9-8fcd-18c3f0585bd6","name":"Torchling","manaCost":"{3}{R}{R}","cmc":5,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"{R}: Untap this creature.\n{R}: Target creature blocks this creature this turn if able.\n{R}: Change the target of target spell that targets only this creature.\n{1}: This creature gets +1/-1 until end of turn.\n{1}: This creature gets -1/+1 until end of turn.","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const silverWyvern = (): CardDef => ({"oracleId":"4baa8f05-1ef8-4770-8c66-ef5f0f02a717","name":"Silver Wyvern","manaCost":"{3}{U}{U}","cmc":5,"typeLine":"Creature — Drake","supertypes":[],"types":["Creature"],"subtypes":["Drake"],"oracleText":"Flying\n{U}: Change the target of target spell or ability that targets only this creature. The new target must be a creature.","power":"4","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Flying"],"layout":"normal"}) as CardDef;
const inspireAwe = (): CardDef => ({"oracleId":"9ca539cd-9876-4c13-b220-d553c17f2378","name":"Inspire Awe","manaCost":"{3}{G}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Prevent all combat damage that would be dealt this turn except combat damage that would be dealt by enchanted creatures and enchantment creatures. Scry 2.","colors":["G"],"colorIdentity":["G"],"keywords":["Scry"],"layout":"normal"}) as CardDef;
const harshJustice = (): CardDef => ({"oracleId":"fe4bee2c-f03f-44a4-94a4-55a06bcd0ad8","name":"Harsh Justice","manaCost":"{2}{W}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Cast this spell only during the declare attackers step and only if you've been attacked this step.\nThis turn, whenever an attacking creature deals combat damage to you, it deals that much damage to its controller.","colors":["W"],"colorIdentity":["W"],"keywords":[],"layout":"normal"}) as CardDef;
const ajanisAid = (): CardDef => ({"oracleId":"b3779fbe-7701-433b-afad-bebd6096a3c8","name":"Ajani's Aid","manaCost":"{2}{G}{W}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, you may search your library and/or graveyard for a card named Ajani, Valiant Protector, reveal it, and put it into your hand. If you search your library this way, shuffle.\nSacrifice this enchantment: Prevent all combat damage a creature of your choice would deal this turn.","colors":["G","W"],"colorIdentity":["G","W"],"keywords":[],"layout":"normal"}) as CardDef;
const zombieBoa = (): CardDef => ({"oracleId":"c4949d62-c2f9-4425-a77e-444824955ecc","name":"Zombie Boa","manaCost":"{4}{B}","cmc":5,"typeLine":"Creature — Zombie Snake","supertypes":[],"types":["Creature"],"subtypes":["Zombie","Snake"],"oracleText":"{1}{B}: Choose a color. Whenever this creature becomes blocked by a creature of that color this turn, destroy that creature. Activate only as a sorcery.","power":"3","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"normal"}) as CardDef;
const stonebinder = (): CardDef => ({"oracleId":"87266dec-ac03-4f21-b235-67c14c3024db","name":"Stonebinder's Familiar","manaCost":"{W}","cmc":1,"typeLine":"Creature — Spirit Dog","supertypes":[],"types":["Creature"],"subtypes":["Spirit","Dog"],"oracleText":"Whenever one or more cards are put into exile during your turn, put a +1/+1 counter on this creature. This ability triggers only once each turn.","power":"1","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":[],"layout":"normal"}) as CardDef;
const sereneSleuth = (): CardDef => ({"oracleId":"b0d639cb-71d4-454f-9dd6-89cd7a59b702","name":"Serene Sleuth","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Human Detective","supertypes":[],"types":["Creature"],"subtypes":["Human","Detective"],"oracleText":"When this creature enters, investigate. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")\nAt the beginning of combat on your turn, investigate for each goaded creature you control. Then each creature you control is no longer goaded.","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["Investigate"],"layout":"normal"}) as CardDef;
const bronzeCudgels = (): CardDef => ({"oracleId":"82ebd4fa-9db1-4723-8305-8b8a9ce958e2","name":"Bronze Cudgels","manaCost":"{1}","cmc":1,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"{2}: Until end of turn, equipped creature gets +X/+0, where X is the number of times this ability has resolved this turn.\nEquip {1} ({1}: Attach to target creature you control. Equip only as a sorcery.)","colors":[],"colorIdentity":[],"keywords":["Equip"],"layout":"normal"}) as CardDef;
const pacifism = (): CardDef => ({"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"layout":"normal"}) as CardDef;
const divineVerdict = (): CardDef => ({"oracleId":"3070f997-24f2-471d-af96-a2f3b588198e","name":"Divine Verdict","manaCost":"{3}{W}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target attacking or blocking creature.","colors":["W"],"colorIdentity":["W"],"keywords":[],"layout":"normal"}) as CardDef;
const swordsToPlowshares = (): CardDef => ({"oracleId":"b1544f21-7e98-461b-aed5-e748b0168c52","name":"Swords to Plowshares","manaCost":"{W}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Exile target creature. Its controller gains life equal to its power.","colors":["W"],"colorIdentity":["W"],"keywords":[],"layout":"normal"}) as CardDef;
const banisher = (): CardDef => ({"oracleId":"f28b21a6-f7ce-437a-8c5b-0423cb55cefb","name":"Banishing Light","manaCost":"{2}{W}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, exile target nonland permanent an opponent controls until this enchantment leaves the battlefield.","colors":["W"],"colorIdentity":["W"],"keywords":[],"layout":"normal"}) as CardDef;
const seedsOfStrength = (): CardDef => ({"oracleId":"dd3d4d96-1e88-49e1-8276-7f62c22ad91a","name":"Seeds of Strength","manaCost":"{G}{W}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature gets +1/+1 until end of turn.\nTarget creature gets +1/+1 until end of turn.\nTarget creature gets +1/+1 until end of turn.","colors":["G","W"],"colorIdentity":["G","W"],"keywords":[],"layout":"normal"}) as CardDef;
const lavaAxe = (): CardDef => ({"oracleId":"387b6b07-a283-412d-94c3-f7f1dc76e858","name":"Lava Axe","manaCost":"{4}{R}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Lava Axe deals 5 damage to target player or planeswalker.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const flametongue = (): CardDef => ({"oracleId":"b215196a-3716-451f-bdbd-d16c05ace5b4","name":"Flametongue Kavu","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Kavu","supertypes":[],"types":["Creature"],"subtypes":["Kavu"],"oracleText":"When this creature enters, it deals 4 damage to target creature.","power":"4","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const heraldOfHadar = (): CardDef => ({"oracleId":"9b084cd4-cc21-4f3a-9ac5-1e1160a31aa6","name":"Disrupt Decorum","manaCost":"{2}{R}{R}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Goad all creatures you don't control. (Until your next turn, those creatures attack each combat if able and attack a player other than you if able.)","colors":["R"],"colorIdentity":["R"],"keywords":["Goad"],"layout":"normal"}) as CardDef;
const legendBear = (): CardDef => ({"oracleId":"cfb756dd-6fe1-430a-8f04-8b10cac62a86","name":"Isamaru, Hound of Konda","manaCost":"{W}","cmc":1,"typeLine":"Legendary Creature — Dog","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Dog"],"oracleText":"","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":[],"layout":"normal"}) as CardDef;

const third = (s: GameState, ap: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(ap) + 2) % 4]!;
const auraCard = (): CardDef => ({ oracleId: "b83-test-aura", name: "Test Aura", manaCost: "{W}", cmc: 1, typeLine: "Enchantment — Aura", supertypes: [], types: ["Enchantment"], subtypes: ["Aura"], oracleText: "Enchant creature", colors: ["W"], colorIdentity: ["W"], keywords: ["Enchant"], layout: "normal" }) as CardDef;
const counters = (s: GameState, id: string, kind: string) => s.objects[id]!.counters?.[kind] ?? 0;
/** Passes priority until the stack is empty, the bots answering their own questions and choosing their own actions. */
const botsPlay = (s: GameState, me: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.pending); i++) {
    const p = s.pending;
    if (p) {
      s = p.player === me && p.kind === "chooseMay" ? act(s, { type: "chooseMay", player: me, yes: true }) : botActions(s, p.player).reduce((x, a) => act(x, a), s);
      continue;
    }
    const pid = waitingOn(s)!;
    s = pid === me ? act(s, { type: "passPriority", player: pid }) : botActions(s, pid).reduce((x, a) => act(x, a), s);
  }
  return s;
};

describe("Lane B round 83", () => {
  it("all of them are supported", () => {
    supported(yomiji(), myrServitor(), cheerleader(), radiant(), shrewd(), spawnbroker(), soulEmancipation(), rebound(), torchling(), silverWyvern(), inspireAwe(), harshJustice(), ajanisAid(), zombieBoa(), stonebinder(), sereneSleuth(), bronzeCudgels());
  });

  it("Yomiji, Who Bars the Way: another legendary permanent put into a graveyard from the battlefield returns to its owner's hand", () => {
    const { s: s0, ap, opp } = setup([]);
    const yo = putOnBattlefield(s0, ap, yomiji());
    const isamaru = putOnBattlefield(s0, opp, legendBear());
    const bear = putOnBattlefield(s0, opp, bears());
    destroyPermanent(s0, s0.objects[isamaru]!, "test");
    destroyPermanent(s0, s0.objects[bear]!, "test");
    let s = settle(s0);
    expect(zone(s, isamaru)).toBe("hand");
    expect(hand(s, opp)).toContain(isamaru);
    // A nonlegendary one stays.
    expect(zone(s, bear)).toBe("graveyard");
    // Yomiji itself isn't "other than ~".
    destroyPermanent(s, s.objects[yo]!, "test");
    s = settle(s);
    expect(zone(s, yo)).toBe("graveyard");
  });

  it("Yomiji, Who Bars the Way: it sees a legendary permanent that dies at the same time as itself", () => {
    const { s: s0, ap } = setup([]);
    const yo = putOnBattlefield(s0, ap, yomiji());
    const isamaru = putOnBattlefield(s0, ap, legendBear());
    s0.objects[yo]!.damage = 10;
    s0.objects[isamaru]!.damage = 10;
    invalidateCharacteristics(s0);
    runStateBasedActions(s0);
    const s = settle(s0);
    expect(zone(s, yo)).toBe("graveyard");
    expect(zone(s, isamaru)).toBe("hand");
  });

  it("Myr Servitor: at your upkeep each player returns all cards named Myr Servitor from their graveyard to the battlefield", () => {
    const { s: s0, ap, opp } = setup([]);
    const servitor = putOnBattlefield(s0, ap, myrServitor());
    const mine = toZone(s0, ap, myrServitor(), "graveyard");
    const theirs = toZone(s0, opp, myrServitor(), "graveyard");
    const other = toZone(s0, opp, bears(), "graveyard");
    let s = toNextUpkeep(s0, ap);
    s = settle(s);
    expect(zone(s, servitor)).toBe("battlefield");
    expect(zone(s, mine)).toBe("battlefield");
    expect(zone(s, theirs)).toBe("battlefield");
    expect(controllerOf(s, s.objects[theirs]!)).toBe(opp);
    expect(zone(s, other)).toBe("graveyard");
  });

  it("Myr Servitor: if it has left the battlefield by the time its trigger resolves, none return", () => {
    const { s: s0, ap } = setup([]);
    const servitor = putOnBattlefield(s0, ap, myrServitor());
    const mine = toZone(s0, ap, myrServitor(), "graveyard");
    let s = toNextUpkeep(s0, ap);
    expect(s.stack.length).toBe(1);
    destroyPermanent(s, s.objects[servitor]!, "test");
    s = settle(s);
    expect(zone(s, servitor)).toBe("graveyard");
    expect(zone(s, mine)).toBe("graveyard");
  });

  it("Acrobatic Cheerleader: tapped at your second main phase, it gets a flying counter, and the ability triggers only once", () => {
    const { s: s0, ap } = setup([]);
    handOf(s0, ap, []);
    const cheer = putOnBattlefield(s0, ap, cheerleader());
    s0.objects[cheer]!.tapped = true;
    let s = goUntil(s0, (x) => x.activePlayer === ap && x.step === "main2" && (x.stack.length > 0 || !!x.pending));
    s = settle(s);
    expect(counters(s, cheer, "flying")).toBe(1);
    expect(characteristics(s, s.objects[cheer]!).keywords).toContain("Flying");
    // Next turn, tapped again at the second main phase: no second trigger.
    const turn = s.turn;
    s = goUntil(s, (x) => x.turn > turn && x.activePlayer === ap && x.step === "main1");
    s.objects[cheer]!.tapped = true;
    s = goUntil(s, (x) => x.activePlayer === ap && x.step === "main2");
    expect(s.stack.length + s.triggerQueue.length).toBe(0);
    expect(counters(s, cheer, "flying")).toBe(1);
  });

  it("Acrobatic Cheerleader: untapped at your second main phase, nothing triggers", () => {
    const { s: s0, ap } = setup([]);
    handOf(s0, ap, []);
    const cheer = putOnBattlefield(s0, ap, cheerleader());
    const s = goUntil(s0, (x) => x.activePlayer === ap && x.step === "main2");
    expect(s.stack.length + s.triggerQueue.length).toBe(0);
    expect(counters(s, cheer, "flying")).toBe(0);
  });

  it("Radiant, Serra Archangel: tapping another untapped creature you control with flying gives it protection from a color", () => {
    const { s: s0, ap } = setup([]);
    const angel = putOnBattlefield(s0, ap, radiant());
    const bear = putOnBattlefield(s0, ap, bears());
    const flier = putOnBattlefield(s0, ap, serraAngel());
    expect(planActivate(s0, ap, angel, abilitiesIndex(s0, angel, /protection/), [], undefined, undefined, undefined, { tap: [bear] })).toBeNull();
    let s = run(s0, planActivate(s0, ap, angel, abilitiesIndex(s0, angel, /protection/), [], undefined, undefined, undefined, { tap: [flier] }));
    expect(s.objects[flier]!.tapped).toBe(true);
    s = settle(s, { me: [ap] });
    expect(s.pending?.kind).toBe("chooseOption");
    const p = s.pending as Extract<NonNullable<GameState["pending"]>, { kind: "chooseOption" }>;
    const red = p.options.find((o) => /^(R|red)$/i.test(o))!;
    s = act(s, { type: "chooseOption", player: ap, choice: red });
    s = settle(s);
    expect(characteristics(s, s.objects[angel]!).keywords.some((k) => /^Protection from red$/i.test(k))).toBe(true);
  });

  it("Shrewd Negotiation: exchange control of your artifact and an opponent's creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const [deal] = handOf(s0, ap, [shrewd()]);
    const ring = putOnBattlefield(s0, ap, solRing());
    const bear = putOnBattlefield(s0, opp, bears());
    poolOnly(s0, ap, { U: 1, C: 4 });
    let s = castNow(s0, ap, deal!, [tgt(ring), tgt(bear)]);
    s = settle(s);
    expect(controllerOf(s, s.objects[ring]!)).toBe(opp);
    expect(controllerOf(s, s.objects[bear]!)).toBe(ap);
  });

  it("Spawnbroker: exchange your creature for an opponent's creature with power no greater than it", () => {
    const { s: s0, ap, opp } = setup([]);
    const [broker] = handOf(s0, ap, [spawnbroker()]);
    const giant = putOnBattlefield(s0, ap, hillGiant());
    const bear = putOnBattlefield(s0, opp, bears());
    const angel = putOnBattlefield(s0, opp, serraAngel());
    poolOnly(s0, ap, { U: 1, C: 2 });
    let s = castNow(s0, ap, broker!);
    s = settle(s, { me: [ap] });
    expect(s.pending?.kind).toBe("chooseTargets");
    // Serra Angel's power is greater than Hill Giant's.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(giant), tgt(angel)] })).toThrow();
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(giant), tgt(bear)] });
    s = settle(s, { may: true });
    expect(controllerOf(s, s.objects[giant]!)).toBe(opp);
    expect(controllerOf(s, s.objects[bear]!)).toBe(ap);
  });

  it("Spawnbroker: if your creature's power has dropped below the other's as it resolves, the exchange doesn't happen", () => {
    const { s: s0, ap, opp } = setup([]);
    const [broker] = handOf(s0, ap, [spawnbroker()]);
    const giant = putOnBattlefield(s0, ap, hillGiant());
    const bear = putOnBattlefield(s0, opp, bears());
    poolOnly(s0, ap, { U: 1, C: 2 });
    let s = castNow(s0, ap, broker!);
    s = settle(s, { me: [ap] });
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(giant), tgt(bear)] });
    s.effects.push({ id: "e-b83", timestamp: s.nextTimestamp++, controller: opp, sourceName: "test", duration: "endOfTurn", affected: [giant], mods: [{ kind: "modifyPT", power: -2, toughness: 0 }] });
    invalidateCharacteristics(s);
    s = settle(s, { may: true });
    expect(controllerOf(s, s.objects[giant]!)).toBe(ap);
    expect(controllerOf(s, s.objects[bear]!)).toBe(opp);
  });

  it("Soul of Emancipation: each destroyed target's controller creates a 3/3 Angel", () => {
    const { s: s0, ap, opp } = setup([]);
    const [soul] = handOf(s0, ap, [soulEmancipation()]);
    const other = third(s0, ap);
    const bear = putOnBattlefield(s0, opp, bears());
    const ring = putOnBattlefield(s0, opp, solRing());
    const giant = putOnBattlefield(s0, other, hillGiant());
    poolOnly(s0, ap, { G: 1, W: 1, U: 1, C: 4 });
    let s = castNow(s0, ap, soul!);
    s = settle(s, { targets: [[tgt(bear), tgt(ring), tgt(giant)]] });
    for (const id of [bear, ring, giant]) expect(zone(s, id)).toBe("graveyard");
    expect(onField(s, opp, "Angel Token").length).toBe(2);
    expect(onField(s, other, "Angel Token").length).toBe(1);
    expect(onField(s, ap, "Angel Token").length).toBe(0);
    const angel = onField(s, opp, "Angel Token")[0]!;
    expect(pt(s, angel)).toBe("3/3");
    expect(characteristics(s, s.objects[angel]!).keywords).toContain("Flying");
  });

  it("Soul of Emancipation: a target that's gone as it resolves makes no Angel; fewer targets make fewer", () => {
    const { s: s0, ap, opp } = setup([]);
    const [soul] = handOf(s0, ap, [soulEmancipation()]);
    const bear = putOnBattlefield(s0, opp, bears());
    const ring = putOnBattlefield(s0, opp, solRing());
    poolOnly(s0, ap, { G: 1, W: 1, U: 1, C: 4 });
    let s = castNow(s0, ap, soul!);
    s = settle(s, { me: [ap] });
    expect(s.pending?.kind).toBe("chooseTargets");
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(bear), tgt(ring), { kind: "none" }] });
    destroyPermanent(s, s.objects[ring]!, "test");
    s = settle(s);
    expect(zone(s, bear)).toBe("graveyard");
    expect(onField(s, opp, "Angel Token").length).toBe(1);
  });

  it("Rebound: a spell that targets only a player gets a new player target", () => {
    const { s: s0, ap, opp } = setup([]);
    const [zap, bounce] = handOf(s0, ap, [shock(), rebound()]);
    const other = third(s0, ap);
    const bear = putOnBattlefield(s0, opp, bears());
    poolOnly(s0, ap, { R: 1, U: 1, C: 1 });
    const [them, they] = [lifeOf(s0, opp), lifeOf(s0, other)];
    let s = castNow(s0, ap, zap!, [player(opp)]);
    const item = s.stack[s.stack.length - 1]!.id;
    s = castNow(s, ap, bounce!, [{ kind: "stack", id: item }]);
    s = settle(s, { me: [ap] });
    expect(s.pending?.kind).toBe("changeTarget");
    const p = s.pending as Extract<NonNullable<GameState["pending"]>, { kind: "changeTarget" }>;
    // The new target must be a player: not a creature or planeswalker.
    expect(p.options.every((t) => t.kind === "player")).toBe(true);
    expect(p.options.some((t) => t.kind === "player" && t.id === opp)).toBe(false);
    s = act(s, { type: "changeTarget", player: ap, target: player(other) });
    s = settle(s);
    expect(lifeOf(s, opp)).toBe(them);
    expect(lifeOf(s, other)).toBe(they - 2);
    expect(zone(s, bear)).toBe("battlefield");
  });

  it("Rebound: a spell that targets a creature can't be its target", () => {
    const { s: s0, ap, opp } = setup([]);
    const [zap, bounce] = handOf(s0, ap, [shock(), rebound()]);
    const bear = putOnBattlefield(s0, opp, bears());
    poolOnly(s0, ap, { R: 1, U: 1, C: 1 });
    const s = castNow(s0, ap, zap!, [tgt(bear)]);
    const item = s.stack[s.stack.length - 1]!.id;
    expect(planCast(s, ap, bounce!, [{ kind: "stack", id: item }], undefined, "auto")).toBeNull();
  });

  it("Torchling: every target of a spell aimed only at it changes to one new target (Seeds of Strength three times)", () => {
    const { s: s0, ap, opp } = setup([]);
    const [seeds] = handOf(s0, ap, [seedsOfStrength()]);
    const torch = putOnBattlefield(s0, ap, torchling());
    const bear = putOnBattlefield(s0, ap, bears());
    putOnBattlefield(s0, opp, hillGiant());
    poolOnly(s0, ap, { G: 1, W: 1, R: 1 });
    let s = castNow(s0, ap, seeds!, [tgt(torch), tgt(torch), tgt(torch)]);
    const item = s.stack[s.stack.length - 1]!.id;
    const ability = abilitiesIndex(s, torch, /targets only/);
    s = run(s, planActivate(s, ap, torch, ability, [{ kind: "stack", id: item }]));
    s = settle(s, { me: [ap] });
    expect(s.pending?.kind).toBe("changeTarget");
    s = act(s, { type: "changeTarget", player: ap, target: tgt(bear) });
    s = settle(s);
    expect(pt(s, bear)).toBe("5/5");
    expect(pt(s, torch)).toBe("3/3");
  });

  it("Torchling: a spell with another target too can't be targeted", () => {
    const { s: s0, ap } = setup([]);
    const [seeds] = handOf(s0, ap, [seedsOfStrength()]);
    const torch = putOnBattlefield(s0, ap, torchling());
    const bear = putOnBattlefield(s0, ap, bears());
    poolOnly(s0, ap, { G: 1, W: 1, R: 1 });
    const s = castNow(s0, ap, seeds!, [tgt(torch), tgt(torch), tgt(bear)]);
    const item = s.stack[s.stack.length - 1]!.id;
    expect(planActivate(s, ap, torch, abilitiesIndex(s, torch, /targets only/), [{ kind: "stack", id: item }])).toBeNull();
  });

  it("Torchling: a bot turns a burn spell aimed at its Torchling onto one of its opponents' creatures", () => {
    const { s: s0, ap, opp } = setup([]);
    const [burn] = handOf(s0, ap, [bolt()]);
    handOf(s0, opp, []);
    const torch = putOnBattlefield(s0, opp, torchling());
    const bear = putOnBattlefield(s0, ap, bears());
    poolOnly(s0, ap, { R: 1 });
    s0.players[opp]!.manaPool = { ...s0.players[opp]!.manaPool, R: 3 };
    let s = castNow(s0, ap, burn!, [tgt(torch)]);
    s = botsPlay(s, ap);
    expect(zone(s, torch)).toBe("battlefield");
    expect(s.objects[torch]!.damage ?? 0).toBe(0);
  });

  it("Silver Wyvern: the new target must be a creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const [zap] = handOf(s0, ap, [shock()]);
    const wyvern = putOnBattlefield(s0, ap, silverWyvern());
    const bear = putOnBattlefield(s0, opp, bears());
    const giant = putOnBattlefield(s0, opp, hillGiant());
    poolOnly(s0, ap, { R: 1, U: 1 });
    let s = castNow(s0, ap, zap!, [tgt(wyvern)]);
    const item = s.stack[s.stack.length - 1]!.id;
    s = run(s, planActivate(s, ap, wyvern, abilitiesIndex(s, wyvern, /targets only/), [{ kind: "stack", id: item }]));
    s = settle(s, { me: [ap] });
    expect(s.pending?.kind).toBe("changeTarget");
    const p = s.pending as Extract<NonNullable<GameState["pending"]>, { kind: "changeTarget" }>;
    expect(p.options.length).toBeGreaterThan(0);
    expect(p.options.every((t) => t.kind === "object" && characteristics(s, s.objects[t.id]!).types.includes("Creature"))).toBe(true);
    expect(p.options.map((t) => (t.kind === "object" ? t.id : ""))).toEqual(expect.arrayContaining([bear, giant]));
    s = act(s, { type: "changeTarget", player: ap, target: tgt(bear) });
    s = settle(s);
    expect(zone(s, bear)).toBe("graveyard");
    expect(s.objects[wyvern]!.damage ?? 0).toBe(0);
  });

  it("Inspire Awe: only enchanted creatures and enchantment creatures deal combat damage this turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const [awe] = handOf(s0, ap, [inspireAwe()]);
    const plain = putOnBattlefield(s0, ap, bears());
    const dressed = putOnBattlefield(s0, ap, hillGiant());
    attach(s0, ap, auraCard(), dressed);
    poolOnly(s0, ap, { G: 1, C: 3 });
    const them = lifeOf(s0, opp);
    let s = castNow(s0, ap, awe!);
    s = settle(s);
    s = fight(s, [plain, dressed], opp, []);
    s = settle(s);
    expect(lifeOf(s, opp)).toBe(them - 3);
  });

  it("Harsh Justice: castable only in the declare attackers step after you're attacked; attackers that damage you hit their controller", () => {
    const { s: s0, ap, opp } = setup([]);
    handOf(s0, opp, []);
    const [justice] = handOf(s0, ap, [harshJustice()]);
    const bear = putOnBattlefield(s0, opp, bears());
    expect(planCast(s0, ap, justice!, [], undefined, "auto")).toBeNull();
    let s = goUntil(s0, (x) => x.activePlayer === opp && x.pending?.kind === "declareAttackers");
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: bear, defender: ap }] });
    for (let i = 0; i < 20 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.step).toBe("declareAttackers");
    poolOnly(s, ap, { W: 1, C: 2 });
    const [me, them] = [lifeOf(s, ap), lifeOf(s, opp)];
    s = castNow(s, ap, justice!);
    s = settle(s);
    s = passUntilThat(s, (x) => x.step === "combatDamage" && (x.stack.length > 0 || x.triggerQueue.length > 0));
    s = settle(s);
    expect(lifeOf(s, ap)).toBe(me - 2);
    expect(lifeOf(s, opp)).toBe(them - 2);
  });

  it("Ajani's Aid: the combat damage of a creature of your choice is prevented; only creatures on the battlefield are offered", () => {
    const { s: s0, ap, opp } = setup([]);
    const aid = putOnBattlefield(s0, ap, ajanisAid());
    const bear = putOnBattlefield(s0, ap, bears());
    const giant = putOnBattlefield(s0, ap, hillGiant());
    putOnBattlefield(s0, opp, solRing());
    const them = lifeOf(s0, opp);
    let s = run(s0, planActivate(s0, ap, aid, 0, []));
    s = settle(s, { me: [ap] });
    expect(s.pending?.kind).toBe("chooseOption");
    const p = s.pending as Extract<NonNullable<GameState["pending"]>, { kind: "chooseOption" }>;
    expect(p.options.map((o) => o.split("@")[0])).toEqual(expect.arrayContaining([bear, giant]));
    expect(p.options.every((o) => characteristics(s, s.objects[o.split("@")[0]!]!).types.includes("Creature"))).toBe(true);
    s = act(s, { type: "chooseOption", player: ap, choice: p.options.find((o) => o.startsWith(`${giant}@`))! });
    s = settle(s);
    expect(zone(s, aid)).toBe("graveyard");
    s = fight(s, [bear, giant], opp, []);
    s = settle(s);
    expect(lifeOf(s, opp)).toBe(them - 2);
  });

  it("Zombie Boa: blocked by a creature of the chosen color this turn, that creature is destroyed", () => {
    const { s: s0, ap, opp } = setup([]);
    const boa = putOnBattlefield(s0, ap, zombieBoa());
    const bear = putOnBattlefield(s0, opp, bears());
    poolOnly(s0, ap, { B: 1, C: 1 });
    let s = run(s0, planActivate(s0, ap, boa, 0, []));
    s = settle(s, { me: [ap] });
    expect(s.pending?.kind).toBe("chooseOption");
    const p = s.pending as Extract<NonNullable<GameState["pending"]>, { kind: "chooseOption" }>;
    s = act(s, { type: "chooseOption", player: ap, choice: p.options.find((o) => /^(G|green)$/i.test(o))! });
    s = settle(s);
    s = fight(s, [boa], opp, [{ blocker: bear, attacker: boa }]);
    expect(zone(s, bear)).toBe("graveyard");
  });

  it("Zombie Boa: a blocker of another color isn't destroyed", () => {
    const { s: s0, ap, opp } = setup([]);
    const boa = putOnBattlefield(s0, ap, zombieBoa());
    const giant = putOnBattlefield(s0, opp, hillGiant());
    s0.objects[giant]!.damage = 0;
    poolOnly(s0, ap, { B: 1, C: 1 });
    let s = run(s0, planActivate(s0, ap, boa, 0, []));
    s = settle(s, { me: [ap] });
    const p = s.pending as Extract<NonNullable<GameState["pending"]>, { kind: "chooseOption" }>;
    s = act(s, { type: "chooseOption", player: ap, choice: p.options.find((o) => /^(G|green)$/i.test(o))! });
    s = settle(s);
    const turn = s.turn;
    s = attackWith(s, [boa], opp);
    s = toBlocks(s);
    s = block(s, opp, [{ blocker: giant, attacker: boa }]);
    expect(s.stack.length + s.triggerQueue.length).toBe(0);
    expect(s.turn).toBe(turn);
    expect(zone(s, giant)).toBe("battlefield");
  });

  it("Stonebinder's Familiar: cards put into exile during your turn give one +1/+1 counter, once each turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const [swords] = handOf(s0, ap, [swordsToPlowshares()]);
    const dog = putOnBattlefield(s0, ap, stonebinder());
    const bear = putOnBattlefield(s0, opp, bears());
    poolOnly(s0, ap, { W: 1 });
    let s = castNow(s0, ap, swords!, [tgt(bear)]);
    s = settle(s);
    expect(zone(s, bear)).toBe("exile");
    expect(counters(s, dog, "+1/+1")).toBe(1);
    // A second exile this turn: no more.
    const card = toZone(s, opp, bears(), "graveyard");
    s.objects[card]!.zone = "graveyard";
    const giant = putOnBattlefield(s, opp, hillGiant());
    destroyPermanent(s, s.objects[giant]!, "test");
    s = settle(s);
    expect(counters(s, dog, "+1/+1")).toBe(1);
  });

  it("Stonebinder's Familiar: an exile during another player's turn does nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    handOf(s0, ap, []);
    const dog = putOnBattlefield(s0, opp, stonebinder());
    const [swords] = handOf(s0, ap, [swordsToPlowshares()]);
    const bear = putOnBattlefield(s0, ap, bears());
    poolOnly(s0, ap, { W: 1 });
    let s = castNow(s0, ap, swords!, [tgt(bear)]);
    s = settle(s);
    expect(zone(s, bear)).toBe("exile");
    expect(counters(s, dog, "+1/+1")).toBe(0);
  });

  it("Serene Sleuth: at your beginning of combat, investigate for each goaded creature you control, then they're no longer goaded", () => {
    const { s: s0, ap, opp } = setup([]);
    handOf(s0, ap, []);
    const sleuth = putOnBattlefield(s0, ap, sereneSleuth());
    const bear = putOnBattlefield(s0, ap, bears());
    const giant = putOnBattlefield(s0, ap, hillGiant());
    s0.effects.push({ id: "e-goad", timestamp: s0.nextTimestamp++, controller: opp, sourceName: "test", duration: "game", affected: [bear, giant], mods: [{ kind: "goad" }] });
    invalidateCharacteristics(s0);
    expect(characteristics(s0, s0.objects[bear]!).goaded).toBe(true);
    let s = goUntil(s0, (x) => x.activePlayer === ap && x.step === "beginCombat" && (x.stack.length > 0 || !!x.pending));
    s = settle(s);
    expect(onField(s, ap, "Clue Token").length).toBe(2);
    expect(characteristics(s, s.objects[bear]!).goaded).toBeFalsy();
    expect(characteristics(s, s.objects[giant]!).goaded).toBeFalsy();
    expect(zone(s, sleuth)).toBe("battlefield");
  });

  it("Bronze Cudgels: each resolution this turn gives +X/+0, X the times it has resolved this turn", () => {
    const { s: s0, ap } = setup([]);
    const bear = putOnBattlefield(s0, ap, bears());
    const cudgels = attach(s0, ap, bronzeCudgels(), bear);
    poolOnly(s0, ap, { C: 6 });
    let s = s0;
    for (const want of ["3/2", "5/2", "8/2"]) {
      s = run(s, planActivate(s, ap, cudgels, 0, []));
      s = settle(s);
      expect(pt(s, bear)).toBe(want);
    }
  });
});
