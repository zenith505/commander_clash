// Lane B, round 84: unsupported cards from the bottom of the popularity list (`npm run popular -- --least`): one-line
// templates.


import { describe, expect, it } from "vitest";
import { act, card, forest, putOnBattlefield, setup } from "./helpers";
import { runStateBasedActions, moveObject, abilitiesOf, abilityProblem, botActions, closeZoneBatch, manaAbilityProblem, castProblem, characteristics, controllerOf, destroyPermanent, dealDamage, invalidateCharacteristics, isFullySupported, objectSource, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";
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
const ruric = (): CardDef => ({"oracleId":"453b2b3c-7df5-4515-9565-82f603cf451b","name":"Ruric Thar, Magecrusher","manaCost":"{5}{G}{G}","cmc":7,"typeLine":"Legendary Creature — Ogre Warrior","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Ogre","Warrior"],"oracleText":"This spell can't be countered.\nReach, vigilance, trample\nRuric Thar has hexproof as long as they haven't dealt combat damage yet. (They can't be the target of spells or abilities your opponents control.)","power":"7","toughness":"7","colors":["G"],"colorIdentity":["G"],"keywords":["Reach","Vigilance","Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/eed83302-dc2c-45f4-a4bd-af9da51edef5.jpg?1789358701","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/eed83302-dc2c-45f4-a4bd-af9da51edef5.jpg?1789358701","commanderLegal":"legal","set":"fra","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const tephraderm = (): CardDef => ({"oracleId":"57d411c6-68d8-441d-885f-17412f6503c2","name":"Tephraderm","manaCost":"{4}{R}","cmc":5,"typeLine":"Creature — Beast","supertypes":[],"types":["Creature"],"subtypes":["Beast"],"oracleText":"Whenever a creature deals damage to this creature, this creature deals that much damage to that creature.\nWhenever a spell deals damage to this creature, this creature deals that much damage to that spell's controller.","power":"4","toughness":"5","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/1/41b65eba-140b-4c1d-b796-8134b7c1ede8.jpg?1783945047","artUrl":"https://cards.scryfall.io/art_crop/front/4/1/41b65eba-140b-4c1d-b796-8134b7c1ede8.jpg?1783945047","commanderLegal":"legal","set":"ons","releasedAt":"2002-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const animateArtifact = (): CardDef => ({"oracleId":"2dd7a4dc-902a-4e85-8a3b-c96a898fba86","name":"Animate Artifact","manaCost":"{3}{U}","cmc":4,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant artifact\nAs long as enchanted artifact isn't a creature, it's an artifact creature with power and toughness each equal to its mana value.","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/6/6/664b46f5-0424-4f4e-9f26-6bd2cf5e0357.jpg?1783948707","artUrl":"https://cards.scryfall.io/art_crop/front/6/6/664b46f5-0424-4f4e-9f26-6bd2cf5e0357.jpg?1783948707","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const imminentDoom = (): CardDef => ({"oracleId":"6ded956d-30ed-49ca-8653-cbaaae676b0c","name":"Imminent Doom","manaCost":"{2}{R}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"This enchantment enters with a doom counter on it.\nWhenever you cast a spell with mana value equal to the number of doom counters on this enchantment, this enchantment deals that much damage to any target. Then put a doom counter on this enchantment.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/5/a51f8207-485e-4a4e-aa62-8e0e69645a0e.jpg?1783936027","artUrl":"https://cards.scryfall.io/art_crop/front/a/5/a51f8207-485e-4a4e-aa62-8e0e69645a0e.jpg?1783936027","commanderLegal":"legal","set":"hou","releasedAt":"2017-07-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const chaosLord = (): CardDef => ({"oracleId":"16d0aea2-4ca4-4a9d-8674-2863e085f514","name":"Chaos Lord","manaCost":"{4}{R}{R}{R}","cmc":7,"typeLine":"Creature — Human","supertypes":[],"types":["Creature"],"subtypes":["Human"],"oracleText":"First strike\nAt the beginning of your upkeep, target opponent gains control of this creature if the number of permanents is even.\nThis creature can attack as though it had haste unless it entered this turn.","power":"7","toughness":"7","colors":["R"],"colorIdentity":["R"],"keywords":["First strike"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee245922-b380-4b2e-a43f-ab1ba8078943.jpg?1783947491","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee245922-b380-4b2e-a43f-ab1ba8078943.jpg?1783947491","commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const mirrorGolem = (): CardDef => ({"oracleId":"3460e86f-c182-4ca9-bd90-7949b0759c98","name":"Mirror Golem","manaCost":"{6}","cmc":6,"typeLine":"Artifact Creature — Golem","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Golem"],"oracleText":"Imprint — When this creature enters, you may exile target card from a graveyard.\nThis creature has protection from each of the exiled card's card types. (Artifact, battle, creature, enchantment, instant, kindred, land, planeswalker, and sorcery are card types.)","power":"3","toughness":"4","colors":[],"colorIdentity":[],"keywords":["Imprint"],"imageUrl":"https://cards.scryfall.io/normal/front/d/9/d9467839-b2a2-4cfe-a60e-12766e2ba983.jpg?1783944513","artUrl":"https://cards.scryfall.io/art_crop/front/d/9/d9467839-b2a2-4cfe-a60e-12766e2ba983.jpg?1783944513","commanderLegal":"legal","set":"mrd","releasedAt":"2003-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const charmedGriffin = (): CardDef => ({"oracleId":"6a58f2a6-ff5e-4823-b3a7-49df14d64ffe","name":"Charmed Griffin","manaCost":"{3}{W}","cmc":4,"typeLine":"Creature — Griffin","supertypes":[],"types":["Creature"],"subtypes":["Griffin"],"oracleText":"Flying\nWhen this creature enters, each other player may put an artifact or enchantment card onto the battlefield from their hand.","power":"3","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/6/6/66d36960-3c78-4032-9325-8002b2a48503.jpg?1783945983","artUrl":"https://cards.scryfall.io/art_crop/front/6/6/66d36960-3c78-4032-9325-8002b2a48503.jpg?1783945983","commanderLegal":"legal","set":"mmq","releasedAt":"1999-10-04","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const reversePolarity = (): CardDef => ({"oracleId":"c7076e2c-81f1-44ad-a4dd-45a01802d364","name":"Reverse Polarity","manaCost":"{W}{W}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"You gain X life, where X is twice the damage dealt to you so far this turn by artifacts.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/a/da7ed8ba-3886-4779-a9b3-6892a7ed3527.jpg?1783948373","artUrl":"https://cards.scryfall.io/art_crop/front/d/a/da7ed8ba-3886-4779-a9b3-6892a7ed3527.jpg?1783948373","commanderLegal":"legal","set":"atq","releasedAt":"1994-03-04","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const circleAffliction = (): CardDef => ({"oracleId":"69658c2c-2c46-4d62-945e-1a5176869b05","name":"Circle of Affliction","manaCost":"{1}{B}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"As this enchantment enters, choose a color.\nWhenever a source of the chosen color deals damage to you, you may pay {1}. If you do, target player loses 1 life and you gain 1 life.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/f/1f059cd0-7924-495e-bac4-021f0e46bb87.jpg?1783943156","artUrl":"https://cards.scryfall.io/art_crop/front/1/f/1f059cd0-7924-495e-bac4-021f0e46bb87.jpg?1783943156","commanderLegal":"legal","set":"plc","releasedAt":"2007-02-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const tornado = (): CardDef => ({"oracleId":"dd283473-6423-4a1f-b5a3-77234cdce643","name":"Tornado","manaCost":"{4}{G}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Cumulative upkeep {G} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\n{2}{G}, Pay 3 life for each velocity counter on this enchantment: Destroy target permanent and put a velocity counter on this enchantment. Activate only once each turn.","colors":["G"],"colorIdentity":["G"],"keywords":["Cumulative upkeep"],"imageUrl":"https://cards.scryfall.io/normal/front/a/2/a2fd58e4-eb9a-4a12-8914-0a9a8300626c.jpg?1783947168","artUrl":"https://cards.scryfall.io/art_crop/front/a/2/a2fd58e4-eb9a-4a12-8914-0a9a8300626c.jpg?1783947168","commanderLegal":"legal","set":"all","releasedAt":"1996-06-10","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const malignantGrowth = (): CardDef => ({"oracleId":"b3235d21-ce52-4a99-a2fe-99b0fe7cc8bc","name":"Malignant Growth","manaCost":"{3}{G}{U}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Cumulative upkeep {1} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nAt the beginning of your upkeep, put a growth counter on this enchantment.\nAt the beginning of each opponent's draw step, that player draws an additional card for each growth counter on this enchantment, then this enchantment deals damage to the player equal to the number of cards they drew this way.","colors":["G","U"],"colorIdentity":["G","U"],"keywords":["Cumulative upkeep"],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b6703-ac92-45f6-8c32-60f760eba866.jpg?1783947051","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b6703-ac92-45f6-8c32-60f760eba866.jpg?1783947051","commanderLegal":"legal","set":"mir","releasedAt":"1996-10-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const scalpelexis = (): CardDef => ({"oracleId":"99eb50ef-352f-47c4-91e3-32813cbe0649","name":"Scalpelexis","manaCost":"{4}{U}","cmc":5,"typeLine":"Creature — Beast","supertypes":[],"types":["Creature"],"subtypes":["Beast"],"oracleText":"Flying (This creature can't be blocked except by creatures with flying or reach.)\nWhenever this creature deals combat damage to a player, that player exiles the top four cards of their library. If two or more of those cards have the same name, repeat this process.","power":"1","toughness":"5","colors":["U"],"colorIdentity":["U"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/2/9/29c3b7fa-78e7-4a0c-bcdc-4b829638e3f6.jpg?1783945127","artUrl":"https://cards.scryfall.io/art_crop/front/2/9/29c3b7fa-78e7-4a0c-bcdc-4b829638e3f6.jpg?1783945127","commanderLegal":"legal","set":"jud","releasedAt":"2002-05-27","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const rallyHorde = (): CardDef => ({"oracleId":"fd9aeda1-9e44-4bc6-aa0d-19d58918d1f4","name":"Rally the Horde","manaCost":"{5}{R}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Exile the top card of your library. Exile the top card of your library. Exile the top card of your library. If the last card exiled isn't a land card, repeat this process. Create a 1/1 red Warrior creature token for each nonland card exiled this way.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/2/b292a8d2-44b1-4c20-8035-0f5912cc09a4.jpg?1783944145","artUrl":"https://cards.scryfall.io/art_crop/front/b/2/b292a8d2-44b1-4c20-8035-0f5912cc09a4.jpg?1783944145","commanderLegal":"legal","set":"sok","releasedAt":"2005-06-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const turtleTracks = (): CardDef => ({"oracleId":"4921dac2-4adf-4ac4-b1f4-d53385afd802","name":"Turtle Tracks","manaCost":"{2}{G}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Any number of target players may each search their library for a basic land card, put it onto the battlefield under their control, then shuffle.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/7/b7e2ece7-8182-4ad8-a266-bffcb4be4522.jpg?1783904133","artUrl":"https://cards.scryfall.io/art_crop/front/b/7/b7e2ece7-8182-4ad8-a266-bffcb4be4522.jpg?1783904133","commanderLegal":"legal","set":"tmc","releasedAt":"2026-03-06","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const orcishLibrarian = (): CardDef => ({"oracleId":"3a05904d-5439-446d-a2a1-1475c9c7371d","name":"Orcish Librarian","manaCost":"{1}{R}","cmc":2,"typeLine":"Creature — Orc","supertypes":[],"types":["Creature"],"subtypes":["Orc"],"oracleText":"{R}, {T}: Look at the top eight cards of your library. Exile four of them at random, then put the rest on top of your library in any order.","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ed908d6-6d06-4ccb-9577-37ef2d01c1a5.jpg?1783947484","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ed908d6-6d06-4ccb-9577-37ef2d01c1a5.jpg?1783947484","commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const erebosTitan = (): CardDef => ({"oracleId":"1341b64e-1f8f-4613-abea-a337cd0169de","name":"Erebos's Titan","manaCost":"{1}{B}{B}{B}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"As long as your opponents control no creatures, this creature has indestructible. (Damage and effects that say \"destroy\" don't destroy it.)\nWhenever a creature card leaves an opponent's graveyard, you may discard a card. If you do, return this card from your graveyard to your hand.","power":"5","toughness":"5","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/5/f5972911-2d41-4a0c-8a8f-b3d35a6594d8.jpg?1783938343","artUrl":"https://cards.scryfall.io/art_crop/front/f/5/f5972911-2d41-4a0c-8a8f-b3d35a6594d8.jpg?1783938343","commanderLegal":"legal","set":"ori","releasedAt":"2015-07-17","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;

const third = (s: GameState, ap: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(ap) + 2) % 4]!;
const auraCard = (): CardDef => ({ oracleId: "b84-test-aura", name: "Test Aura", manaCost: "{W}", cmc: 1, typeLine: "Enchantment — Aura", supertypes: [], types: ["Enchantment"], subtypes: ["Aura"], oracleText: "Enchant creature", colors: ["W"], colorIdentity: ["W"], keywords: ["Enchant"], layout: "normal" }) as CardDef;
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


describe("Lane B round 84", () => {
  it("all of them are supported", () => {
    supported(ruric(), tephraderm(), animateArtifact(), imminentDoom(), chaosLord(), mirrorGolem(), charmedGriffin(), reversePolarity(), circleAffliction(), tornado(), malignantGrowth(), scalpelexis(), rallyHorde(), turtleTracks(), orcishLibrarian(), erebosTitan());
  });

  it("Ruric Thar, Magecrusher: hexproof until they've dealt combat damage, not other damage", () => {
    const { s: s0, ap, opp } = setup([]);
    const ru = putOnBattlefield(s0, ap, ruric());
    const kw = (s: GameState) => characteristics(s, s.objects[ru]!).keywords;
    expect(kw(s0)).toContain("Hexproof");
    // Noncombat damage dealt by it doesn't end it.
    dealDamage(s0, objectSource(s0, s0.objects[ru]!), { player: opp }, 1);
    invalidateCharacteristics(s0);
    expect(kw(s0)).toContain("Hexproof");
    dealDamage(s0, objectSource(s0, s0.objects[ru]!), { player: opp }, 7, { combat: true });
    invalidateCharacteristics(s0);
    expect(kw(s0)).not.toContain("Hexproof");
  });

  it("Tephraderm: a creature dealing it damage is dealt that much back; a spell's controller is dealt the spell's damage", () => {
    const { s: s0, ap, opp } = setup([]);
    const te = putOnBattlefield(s0, opp, tephraderm());
    const wall = putOnBattlefield(s0, ap, card("Test Brute", "Creature — Beast", "{3}", { power: "2", toughness: "10" }));
    let s = fight(s0, [wall], opp, [{ blocker: te, attacker: wall }]);
    s = settle(s);
    // 4 combat damage from Tephraderm, then the 2 it was dealt back.
    expect(s.objects[wall]!.damage).toBe(6);
    expect(s.objects[te]!.damage).toBe(2);
    // A spell: its controller is dealt that much, even when the damage is lethal (rulings).
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const te1 = putOnBattlefield(s1, opp1, tephraderm());
    s1.objects[te1]!.damage = 4;
    const [sh] = handOf(s1, ap1, [shock()]);
    poolOnly(s1, ap1, { R: 1 });
    const life = lifeOf(s1, ap1);
    let t = castNow(s1, ap1, sh!, [tgt(te1)]);
    t = settle(t);
    expect(zone(t, te1)).toBe("graveyard");
    expect(lifeOf(t, ap1)).toBe(life - 2);
  });

  it("Animate Artifact: a noncreature artifact becomes a creature with its mana value as power and toughness; a creature keeps its own", () => {
    const { s: s0, ap } = setup([]);
    const ring = putOnBattlefield(s0, ap, solRing());
    attach(s0, ap, animateArtifact(), ring);
    expect(characteristics(s0, s0.objects[ring]!).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(pt(s0, ring)).toBe("1/1");
    // An artifact that's already a creature keeps its power and toughness (rulings).
    const thopter = putOnBattlefield(s0, ap, ornithopter());
    attach(s0, ap, animateArtifact(), thopter);
    expect(pt(s0, thopter)).toBe("0/2");
  });

  it("Rally the Horde: exiles three at a time until the last is a land card, a Warrior for each nonland card exiled", () => {
    const { s: s0, ap } = setup([]);
    const top = stackLibrary(s0, ap, [bolt(), bears(), shock(), hillGiant(), serraAngel(), forest, ornithopter()]);
    const [rally] = handOf(s0, ap, [rallyHorde()]);
    poolOnly(s0, ap, { R: 1, C: 5 });
    let s = castNow(s0, ap, rally!);
    s = settle(s);
    for (const id of top.slice(0, 6)) expect(zone(s, id)).toBe("exile");
    expect(zone(s, top[6]!)).toBe("library");
    expect(onField(s, ap, "Warrior Token").length).toBe(5);
  });

  it("Turtle Tracks: any number of target players may each search for a basic land card and put it onto the battlefield", () => {
    const { s: s0, ap, opp } = setup([]);
    const t3 = third(s0, ap);
    const [mine] = stackLibrary(s0, ap, [forest]);
    const [theirs] = stackLibrary(s0, opp, [forest]);
    const [notThem] = stackLibrary(s0, t3, [forest]);
    const [tt] = handOf(s0, ap, [turtleTracks()]);
    poolOnly(s0, ap, { G: 1, C: 2 });
    let s = castNow(s0, ap, tt!, [player(ap), player(opp)]);
    s = settle(s);
    expect(zone(s, mine!)).toBe("battlefield");
    expect(controllerOf(s, s.objects[mine!]!)).toBe(ap);
    expect(zone(s, theirs!)).toBe("battlefield");
    expect(controllerOf(s, s.objects[theirs!]!)).toBe(opp);
    // Not a target: no search.
    expect(zone(s, notThem!)).toBe("library");
  });

  it("Orcish Librarian: four of the top eight exiled at random, the other four put back on top in the order you choose", () => {
    const { s: s0, ap } = setup([]);
    const lib = putOnBattlefield(s0, ap, orcishLibrarian());
    const top = stackLibrary(s0, ap, [bolt(), bears(), shock(), hillGiant(), serraAngel(), ornithopter(), solRing(), giantGrowth(), card("Test Sorcery", "Sorcery", "{1}")]);
    poolOnly(s0, ap, { R: 1 });
    let s = run(s0, planActivate(s0, ap, lib, 0));
    s = settle(s, { me: [ap] });
    expect(s.pending?.kind).toBe("arrangeTop");
    const p = s.pending as Extract<NonNullable<GameState["pending"]>, { kind: "arrangeTop" }>;
    expect(p.cards.length).toBe(4);
    const kept = [...p.cards].reverse();
    s = act(s, { type: "arrangeTop", player: ap, top: kept, away: [] });
    s = settle(s);
    const eight = top.slice(0, 8);
    expect(eight.filter((id) => zone(s, id) === "exile").length).toBe(4);
    expect(s.players[ap]!.library.slice(0, 4)).toEqual(kept);
    expect(kept.every((id) => eight.includes(id))).toBe(true);
    expect(zone(s, top[8]!)).toBe("library");
  });

  it("Erebos's Titan: from your graveyard, a creature card leaving an opponent's graveyard lets you discard a card to return it to your hand", () => {
    const { s: s0, ap, opp } = setup([]);
    const titan = toZone(s0, ap, erebosTitan(), "graveyard");
    const [card1] = handOf(s0, ap, [bolt()]);
    const theirBear = toZone(s0, opp, bears(), "graveyard");
    const myBear = toZone(s0, ap, bears(), "graveyard");
    const theirBolt = toZone(s0, opp, bolt(), "graveyard");
    // A noncreature card or a card of yours: nothing.
    moveObject(s0, theirBolt, "exile");
    moveObject(s0, myBear, "exile");
    closeZoneBatch(s0);
    expect(s0.triggerQueue.length).toBe(0);
    moveObject(s0, theirBear, "exile");
    closeZoneBatch(s0);
    let s = settle(s0, { may: true });
    expect(zone(s, titan)).toBe("hand");
    expect(zone(s, card1!)).toBe("graveyard");
  });

  it("Imminent Doom: a spell with mana value equal to its doom counters deals that much damage, then another counter", () => {
    const { s: s0, ap, opp } = setup([]);
    const doom = putOnBattlefield(s0, ap, imminentDoom());
    s0.objects[doom]!.counters = { doom: 1 };
    const [sh, sh2] = handOf(s0, ap, [shock(), shock()]);
    poolOnly(s0, ap, { R: 2 });
    const life = lifeOf(s0, opp);
    let s = castNow(s0, ap, sh!, [player(opp)]);
    s = settle(s, { targets: [[player(opp)]] });
    // 1 from Imminent Doom (the spell's mana value), 2 from Shock.
    expect(lifeOf(s, opp)).toBe(life - 3);
    expect(counters(s, doom, "doom")).toBe(2);
    // Two counters now: a mana value 1 spell doesn't trigger it.
    s = castNow(s, ap, sh2!, [player(opp)]);
    expect(s.triggerQueue.length + s.stack.length).toBe(1);
    s = settle(s);
    expect(lifeOf(s, opp)).toBe(life - 5);
    expect(counters(s, doom, "doom")).toBe(2);
  });

  it("Chaos Lord: an opponent gains control of it at upkeep only if the number of permanents is even; it attacks as though it had haste unless it entered this turn", () => {
    for (const even of [true, false]) {
      const { s: s0, ap, opp } = setup([]);
      const lord = putOnBattlefield(s0, ap, chaosLord());
      handOf(s0, ap, []);
      let s = toNextUpkeep(s0, ap);
      // The number of permanents as the trigger resolves (zero is even).
      if ((s.battlefield.length % 2 === 0) !== even) putOnBattlefield(s, ap, solRing());
      s = settle(s, { targets: [[player(opp)]] });
      expect(controllerOf(s, s.objects[lord]!)).toBe(even ? opp : ap);
    }
    const { s: s1, ap } = setup([]);
    const lord = putOnBattlefield(s1, ap, chaosLord());
    s1.objects[lord]!.enteredTurn = s1.turn;
    invalidateCharacteristics(s1);
    expect(characteristics(s1, s1.objects[lord]!).attackAsThoughHaste).toBe(false);
    s1.objects[lord]!.enteredTurn = s1.turn - 1;
    invalidateCharacteristics(s1);
    expect(characteristics(s1, s1.objects[lord]!).attackAsThoughHaste).toBe(true);
  });

  it("Mirror Golem: protection from each card type of the card its imprint ability exiled, while it's still exiled", () => {
    const { s: s0, ap, opp } = setup([]);
    const orn = toZone(s0, opp, ornithopter(), "graveyard");
    const [golem] = handOf(s0, ap, [mirrorGolem()]);
    poolOnly(s0, ap, { C: 6 });
    let s = castNow(s0, ap, golem!);
    s = settle(s, { targets: [[tgt(orn)]] });
    expect(zone(s, orn)).toBe("exile");
    const kw = (x: GameState) => characteristics(x, x.objects[golem!]!).keywords;
    expect(kw(s)).toEqual(expect.arrayContaining(["Protection from artifacts", "Protection from creatures"]));
    expect(kw(s)).not.toContain("Protection from instants");
    // An instant card exiled with it instead.
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const boltCard = toZone(s1, opp1, bolt(), "graveyard");
    const [golem1] = handOf(s1, ap1, [mirrorGolem()]);
    poolOnly(s1, ap1, { C: 6 });
    let t = castNow(s1, ap1, golem1!);
    t = settle(t, { targets: [[tgt(boltCard)]] });
    expect(characteristics(t, t.objects[golem1!]!).keywords).toContain("Protection from instants");
    // A Shock can't target it.
    const [sh] = handOf(t, ap1, [shock()]);
    t.players[ap1]!.manaPool.R = 1;
    expect(planCast(t, ap1, sh!, [tgt(golem1!)])).toBeNull();
  });

  it("Charmed Griffin: each other player may put an artifact or enchantment card from their hand onto the battlefield", () => {
    const { s: s0, ap, opp } = setup([]);
    const [ring, bearCard] = handOf(s0, opp, [solRing(), bears()]);
    const [griffin] = handOf(s0, ap, [charmedGriffin(), solRing()]);
    poolOnly(s0, ap, { W: 1, C: 3 });
    let s = castNow(s0, ap, griffin!);
    s = settle(s);
    expect(zone(s, ring!)).toBe("battlefield");
    expect(controllerOf(s, s.objects[ring!]!)).toBe(opp);
    // Not a creature card, and not you.
    expect(zone(s, bearCard!)).toBe("hand");
    expect(hand(s, ap).length).toBe(1);
  });

  it("Reverse Polarity: gain twice the damage artifacts dealt you this turn, not other sources'", () => {
    const { s: s0, ap, opp } = setup([]);
    const thopter = putOnBattlefield(s0, opp, ornithopter());
    const bear = putOnBattlefield(s0, opp, bears());
    dealDamage(s0, objectSource(s0, s0.objects[thopter]!), { player: ap }, 3);
    dealDamage(s0, objectSource(s0, s0.objects[bear]!), { player: ap }, 2);
    const life = lifeOf(s0, ap);
    const [rp] = handOf(s0, ap, [reversePolarity()]);
    poolOnly(s0, ap, { W: 2 });
    let s = castNow(s0, ap, rp!);
    s = settle(s);
    expect(lifeOf(s, ap)).toBe(life + 6);
  });

  it("Circle of Affliction: a source of the chosen color dealing you damage, a spell too, lets you pay {1} to drain target player for 1", () => {
    const { s: s0, ap, opp } = setup([]);
    const circle = putOnBattlefield(s0, ap, circleAffliction());
    s0.objects[circle]!.chosen = { color: "R" };
    const third0 = third(s0, ap);
    // A red spell: Shock at you, cast by an opponent (put on the stack as theirs).
    const [sh] = handOf(s0, ap, [shock()]);
    poolOnly(s0, ap, { R: 1 });
    let s = castNow(s0, ap, sh!, [player(ap)]);
    s.stack[s.stack.length - 1]!.controller = opp;
    const life = lifeOf(s, ap);
    const lifeThird = lifeOf(s, third0);
    s.players[ap]!.manaPool.C = 1;
    s = settle(s, { may: true, targets: [[player(third0)]] });
    expect(lifeOf(s, ap)).toBe(life - 2 + 1);
    expect(lifeOf(s, third0)).toBe(lifeThird - 1);
    // A green creature's damage doesn't trigger it.
    const bear = putOnBattlefield(s, opp, bears());
    dealDamage(s, objectSource(s, s.objects[bear]!), { player: ap }, 2);
    expect(s.triggerQueue.length).toBe(0);
    // A red one's does.
    const giant = putOnBattlefield(s, opp, hillGiant());
    dealDamage(s, objectSource(s, s.objects[giant]!), { player: ap }, 3);
    expect(s.triggerQueue.length).toBe(1);
  });

  it("Tornado: pay 3 life for each velocity counter on it to destroy target permanent, then another counter", () => {
    const { s: s0, ap, opp } = setup([]);
    const tor = putOnBattlefield(s0, ap, tornado());
    const ring = putOnBattlefield(s0, opp, solRing());
    const bear = putOnBattlefield(s0, opp, bears());
    poolOnly(s0, ap, { G: 2, C: 4 });
    const ab = abilitiesIndex(s0, tor, /Destroy target permanent/);
    const life = lifeOf(s0, ap);
    let s = run(s0, planActivate(s0, ap, tor, ab, [tgt(ring)]));
    // No velocity counters yet: no life.
    expect(lifeOf(s, ap)).toBe(life);
    s = settle(s);
    expect(zone(s, ring)).toBe("graveyard");
    expect(counters(s, tor, "velocity")).toBe(1);
    // Only once each turn.
    expect(planActivate(s, ap, tor, ab, [tgt(bear)])).toBeNull();
    // With two counters: 6 life, and not with less than that.
    s.objects[tor]!.counters.velocity = 2;
    s.objects[tor]!.activatedThisTurn = undefined;
    s = run(s, planActivate(s, ap, tor, ab, [tgt(bear)]));
    expect(lifeOf(s, ap)).toBe(life - 6);
    s = settle(s);
    expect(zone(s, bear)).toBe("graveyard");
    expect(counters(s, tor, "velocity")).toBe(3);
    s.objects[tor]!.activatedThisTurn = undefined;
    s.players[ap]!.life = 8;
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, G: 1, C: 2 };
    const other = putOnBattlefield(s, opp, bears());
    expect(abilityProblem(s, ap, tor, ab, [tgt(other)])).toMatch(/life/);
  });

  it("Malignant Growth: each opponent draws an additional card for each growth counter at their draw step, and is dealt that much damage", () => {
    const { s: s0, ap } = setup([]);
    const mg = putOnBattlefield(s0, ap, malignantGrowth());
    s0.objects[mg]!.counters = { growth: 2 };
    const next = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    let s = goUntil(s0, (x) => x.activePlayer === next && x.step === "draw" && x.stack.length > 0);
    const handBefore = hand(s, next).length;
    const life = lifeOf(s, next);
    s = settle(s);
    expect(hand(s, next).length).toBe(handBefore + 2);
    expect(lifeOf(s, next)).toBe(life - 2);
    // A player with fewer cards in their library is dealt only what they drew.
    s.objects[mg]!.counters = { growth: 3 };
    const after = s.turnOrder[(s.turnOrder.indexOf(next) + 1) % 4]!;
    const lib = s.players[after]!.library;
    for (const id of lib.splice(1)) { s.objects[id]!.zone = "exile"; s.players[after]!.exile.push(id); }
    invalidateCharacteristics(s);
    s = goUntil(s, (x) => x.activePlayer === after && x.step === "draw" && x.stack.length > 0);
    const life2 = lifeOf(s, after);
    s = settle(s);
    expect(lifeOf(s, after)).toBe(life2);
  });

  it("Scalpelexis: the player it deals combat damage to exiles the top four, again while two of them share a name", () => {
    const { s: s0, ap, opp } = setup([]);
    handOf(s0, ap, []);
    const sc = putOnBattlefield(s0, ap, scalpelexis());
    const top = stackLibrary(s0, opp, [bears(), bears(), hillGiant(), bolt(), bolt(), shock(), hillGiant(), serraAngel(), ornithopter()]);
    let s = fight(s0, [sc], opp, []);
    s = settle(s);
    // The first four have two Grizzly Bears: four more, all different names, and it stops.
    for (const id of top.slice(0, 8)) expect(zone(s, id)).toBe("exile");
    expect(zone(s, top[8]!)).toBe("library");
  });

});
