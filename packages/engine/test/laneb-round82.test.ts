// Lane B, round 82: unsupported cards from the bottom of the popularity list (`npm run popular -- --least`): one-line
// templates (a death trigger for creatures the enchanted creature damaged, prevention shields for a creature with shadow
// or of the chosen type, a punisher of the defending player, another player ordering your library or choosing your
// discard, damage to a creature and its controller from a random card, a free cast from the graveyard as a trigger
// resolves, a combat ban on instants and activated abilities, an X set by counters, and others).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, botActions, closeZoneBatch, manaAbilityProblem, castProblem, characteristics, controllerOf, destroyPermanent, dealDamage, invalidateCharacteristics, isFullySupported, objectSource, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";
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


const axelrod = (): CardDef => ({"oracleId":"c640350b-16a5-4227-87fa-8b24fdb367c7","name":"Axelrod Gunnarson","manaCost":"{4}{B}{B}{R}{R}","cmc":8,"typeLine":"Legendary Creature — Giant","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Giant"],"oracleText":"Trample\nWhenever a creature dealt damage by Axelrod Gunnarson this turn dies, you gain 1 life and Axelrod Gunnarson deals 1 damage to target player or planeswalker.","power":"5","toughness":"5","colors":["B","R"],"colorIdentity":["B","R"],"keywords":["Trample"],"layout":"normal"}) as CardDef;
const vampiricEmbrace = (): CardDef => ({"oracleId":"c7a50ece-4fe4-4e54-9319-b92a4144445d","name":"Vampiric Embrace","manaCost":"{2}{B}{B}","cmc":4,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature gets +2/+2 and has flying.\nWhenever a creature dealt damage by enchanted creature this turn dies, put a +1/+1 counter on that creature.","colors":["B"],"colorIdentity":["B"],"keywords":["Enchant"],"layout":"normal"}) as CardDef;
const copShadow = (): CardDef => ({"oracleId":"07c42f46-800e-4d2a-b844-c125ab93190d","name":"Circle of Protection: Shadow","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"{1}: The next time a creature of your choice with shadow would deal damage to you this turn, prevent that damage.","colors":["W"],"colorIdentity":["W"],"keywords":[],"layout":"normal"}) as CardDef;
const circleOfSolace = (): CardDef => ({"oracleId":"14ebedd1-7a2d-413b-9b76-8610511292a4","name":"Circle of Solace","manaCost":"{3}{W}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"As this enchantment enters, choose a creature type.\n{1}{W}: The next time a creature of the chosen type would deal damage to you this turn, prevent that damage.","colors":["W"],"colorIdentity":["W"],"keywords":[],"layout":"normal"}) as CardDef;
const ogreMarauder = (): CardDef => ({"oracleId":"d9dafa31-41ea-4f1c-bc63-ec84b01d57fa","name":"Ogre Marauder","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Creature — Ogre Warrior","supertypes":[],"types":["Creature"],"subtypes":["Ogre","Warrior"],"oracleText":"Whenever this creature attacks, it gains \"this creature can't be blocked\" until end of turn unless defending player sacrifices a creature of their choice.","power":"3","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"normal"}) as CardDef;
const glare = (): CardDef => ({"oracleId":"390cbc61-6291-4e7d-b262-4de57c827702","name":"Tahngarth's Glare","manaCost":"{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Look at the top three cards of target opponent's library, then put them back in any order. That player looks at the top three cards of your library, then puts them back in any order.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const augermage = (): CardDef => ({"oracleId":"1e267dbd-b009-4e98-bfef-19f8558cde29","name":"Rakdos Augermage","manaCost":"{B}{B}{R}","cmc":3,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"First strike\n{T}: Reveal your hand and discard a card of target opponent's choice. Then that player reveals their hand and discards a card of your choice. Activate only as a sorcery.","power":"3","toughness":"2","colors":["B","R"],"colorIdentity":["B","R"],"keywords":["First strike"],"layout":"normal"}) as CardDef;
const friendlyFire = (): CardDef => ({"oracleId":"d4ab3e1d-e1c4-43c3-8068-1809938ab094","name":"Friendly Fire","manaCost":"{3}{R}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature's controller reveals a card at random from their hand. Friendly Fire deals damage to that creature and that player equal to the revealed card's mana value.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const spike = (): CardDef => ({"oracleId":"c983644d-6741-4aa1-aa68-a6e680c26bb6","name":"Serpentine Spike","manaCost":"{5}{R}{R}","cmc":7,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Devoid (This card has no color.)\nSerpentine Spike deals 2 damage to target creature, 3 damage to another target creature, and 4 damage to a third target creature. If a creature dealt damage this way would die this turn, exile it instead.","colors":[],"colorIdentity":["R"],"keywords":["Devoid"],"layout":"normal"}) as CardDef;
const thunderblade = (): CardDef => ({"oracleId":"b4f31434-b7c4-489b-9385-70ee0cc3125e","name":"Thunderblade Charge","manaCost":"{1}{R}{R}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Thunderblade Charge deals 3 damage to any target.\nWhenever one or more creatures you control deal combat damage to a player, if this card is in your graveyard, you may pay {2}{R}{R}{R}. If you do, you may cast it without paying its mana cost.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const measure = (): CardDef => ({"oracleId":"8f1d65ae-7ce5-4bb6-8c00-eace25ff837c","name":"Measure of Wickedness","manaCost":"{3}{B}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your end step, sacrifice this enchantment and you lose 8 life.\nWhenever another card is put into your graveyard from anywhere, target opponent gains control of this enchantment.","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"normal"}) as CardDef;
const miter = (): CardDef => ({"oracleId":"57f0c89c-79ad-4786-9497-c7e668620fc0","name":"Urza's Miter","manaCost":"{3}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"Whenever an artifact you control is put into a graveyard from the battlefield, if it wasn't sacrificed, you may pay {3}. If you do, draw a card.","colors":[],"colorIdentity":[],"keywords":[],"layout":"normal"}) as CardDef;
const mindExtraction = (): CardDef => ({"oracleId":"0077740a-528b-4ee3-b331-fac321b95302","name":"Mind Extraction","manaCost":"{2}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"As an additional cost to cast this spell, sacrifice a creature.\nTarget player reveals their hand and discards all cards of each of the sacrificed creature's colors.","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"normal"}) as CardDef;
const handToHand = (): CardDef => ({"oracleId":"bf45f579-539c-4ffe-89df-4896a394158f","name":"Hand to Hand","manaCost":"{2}{R}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"During combat, players can't cast instant spells or activate abilities that aren't mana abilities.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const voodooDoll = (): CardDef => ({"oracleId":"4d330c40-3d72-4528-a254-d036683958d3","name":"Voodoo Doll","manaCost":"{6}","cmc":6,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"At the beginning of your upkeep, put a pin counter on this artifact.\nAt the beginning of your end step, if this artifact is untapped, destroy this artifact and it deals damage to you equal to the number of pin counters on it.\n{X}{X}, {T}: This artifact deals damage equal to the number of pin counters on it to any target. X is the number of pin counters on this artifact.","colors":[],"colorIdentity":[],"keywords":[],"layout":"normal"}) as CardDef;
const dauthi = (): CardDef => ({"oracleId":"c1d0537b-954f-4d3b-b9fe-1dd7ffaa1197","name":"Dauthi Slayer","manaCost":"{B}{B}","cmc":2,"typeLine":"Creature — Dauthi Soldier","supertypes":[],"types":["Creature"],"subtypes":["Dauthi","Soldier"],"oracleText":"Shadow (This creature can block or be blocked by only creatures with shadow.)\nThis creature attacks each combat if able.","power":"2","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":["Shadow"],"layout":"normal"}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const giantGrowth = (): CardDef => ({"oracleId":"5748ebf1-24e3-499d-ab7c-c2cebd462a24","name":"Giant Growth","manaCost":"{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature gets +3/+3 until end of turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;
const goblinGuide = (): CardDef => ({"oracleId":"51d9564b-44fc-4de1-9119-09d7b4089378","name":"Goblin Guide","manaCost":"{R}","cmc":1,"typeLine":"Creature — Goblin Scout","supertypes":[],"types":["Creature"],"subtypes":["Goblin","Scout"],"oracleText":"Haste\nWhenever this creature attacks, defending player reveals the top card of their library. If it's a land card, that player puts it into their hand.","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":["Haste"],"layout":"normal"}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"layout":"normal"}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"layout":"normal"}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const serraAngel = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"layout":"normal"}) as CardDef;
const counterspell = (): CardDef => ({"oracleId":"cc187110-1148-4090-bbb8-e205694a39f5","name":"Counterspell","manaCost":"{U}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target spell.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;
const mindStone = (): CardDef => ({"oracleId":"c97361b5-af16-4a7b-af85-a429dbaf4ad2","name":"Mind Stone","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"layout":"normal"}) as CardDef;
const llanowar = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"layout":"normal"}) as CardDef;
const darkRitual = (): CardDef => ({"oracleId":"53f7c868-b03e-4fc2-8dcf-a75bbfa3272b","name":"Dark Ritual","manaCost":"{B}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Add {B}{B}{B}.","colors":["B"],"colorIdentity":["B"],"keywords":[],"producedMana":["B"],"layout":"normal"}) as CardDef;
const bloodElf = (): CardDef => ({"oracleId":"e05c6c80-a91a-45e0-b991-0014fd5a6472","name":"Blood Pet","manaCost":"{B}","cmc":1,"typeLine":"Creature — Thrull","supertypes":[],"types":["Creature"],"subtypes":["Thrull"],"oracleText":"Sacrifice this creature: Add {B}.","power":"1","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":[],"producedMana":["B"],"layout":"normal"}) as CardDef;

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
  return passUntilThat(s, (x) => x.step === "combatDamage" && (x.stack.length > 0 || x.triggerQueue.length > 0 || !!x.pending));
};

describe("Lane B round 82", () => {
  it("all of them are supported", () => {
    supported(axelrod(), vampiricEmbrace(), copShadow(), circleOfSolace(), ogreMarauder(), glare(), augermage(), friendlyFire(), spike(), thunderblade(), measure(), miter(), mindExtraction(), handToHand(), voodooDoll());
  });

  it("Axelrod Gunnarson: a creature it dealt damage to this turn dies: you gain 1 life and it deals 1 damage to target player", () => {
    const { s: s0, ap, opp } = setup([]);
    const axel = putOnBattlefield(s0, ap, axelrod());
    const bear = putOnBattlefield(s0, opp, bears());
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    const [me, them, other] = [lifeOf(s0, ap), lifeOf(s0, opp), lifeOf(s0, third)];
    let s = fight(s0, [axel], opp, [{ blocker: bear, attacker: axel }]);
    expect(zone(s, bear)).toBe("graveyard");
    s = settle(s, { targets: [[player(third)]] });
    expect(lifeOf(s, ap)).toBe(me + 1);
    expect(lifeOf(s, third)).toBe(other - 1);
    // Trample: the 3 damage beyond lethal went to the defending player.
    expect(lifeOf(s, opp)).toBe(them - 3);
  });

  it("Axelrod Gunnarson: a creature that dies without its damage doesn't trigger it", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, axelrod());
    const bear = putOnBattlefield(s0, opp, bears());
    const me = lifeOf(s0, ap);
    destroyPermanent(s0, s0.objects[bear]!, "test");
    const s = settle(s0);
    expect(zone(s, bear)).toBe("graveyard");
    expect(lifeOf(s, ap)).toBe(me);
  });

  it("Vampiric Embrace: a creature the enchanted creature damaged dies: the enchanted creature gets a +1/+1 counter", () => {
    const { s: s0, ap, opp } = setup([]);
    const bear = putOnBattlefield(s0, ap, bears());
    attach(s0, ap, vampiricEmbrace(), bear);
    expect(pt(s0, bear)).toBe("4/4");
    const thopter = putOnBattlefield(s0, opp, ornithopter());
    let s = fight(s0, [bear], opp, [{ blocker: thopter, attacker: bear }]);
    s = settle(s);
    expect(zone(s, thopter)).toBe("graveyard");
    expect(s.objects[bear]!.counters["+1/+1"]).toBe(1);
    expect(pt(s, bear)).toBe("5/5");
  });

  it("Circle of Protection: Shadow: only a creature with shadow can be chosen, and its next damage to you is prevented", () => {
    const { s: s0, ap, opp } = setup([]);
    const circle = putOnBattlefield(s0, ap, copShadow());
    const slayer = putOnBattlefield(s0, opp, dauthi());
    const bear = putOnBattlefield(s0, opp, bears());
    let s = run(s0, planActivate(s0, ap, circle, 0));
    s = settle(s, { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "damageSource" });
    const options = (s.pending as { options: string[] }).options;
    expect(options.some((o) => o.startsWith(`${slayer}@`))).toBe(true);
    expect(options.some((o) => o.startsWith(`${bear}@`))).toBe(false);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: options.find((o) => o.startsWith(`${slayer}@`))! }));
    const life = lifeOf(s, ap);
    dealDamage(s, objectSource(s, s.objects[slayer]!), { player: ap }, 2);
    expect(lifeOf(s, ap)).toBe(life);
    // Only the next time.
    dealDamage(s, objectSource(s, s.objects[slayer]!), { player: ap }, 2);
    expect(lifeOf(s, ap)).toBe(life - 2);
  });

  it("Circle of Solace: the next damage a creature of the chosen type deals you is prevented, no other creature's", () => {
    const { s: s0, ap, opp } = setup([]);
    const circle = putOnBattlefield(s0, ap, circleOfSolace());
    s0.objects[circle]!.chosen = { type: "Bear" };
    const bear = putOnBattlefield(s0, opp, bears());
    const giant = putOnBattlefield(s0, opp, hillGiant());
    let s = settle(run(s0, planActivate(s0, ap, circle, 0)));
    const life = lifeOf(s, ap);
    dealDamage(s, objectSource(s, s.objects[giant]!), { player: ap }, 3);
    expect(lifeOf(s, ap)).toBe(life - 3);
    dealDamage(s, objectSource(s, s.objects[bear]!), { player: ap }, 2);
    expect(lifeOf(s, ap)).toBe(life - 3);
    dealDamage(s, objectSource(s, s.objects[bear]!), { player: ap }, 2);
    expect(lifeOf(s, ap)).toBe(life - 5);
  });

  it("Ogre Marauder: the defending player sacrifices a creature, or it can't be blocked this turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const ogre = putOnBattlefield(s0, ap, ogreMarauder());
    const bear = putOnBattlefield(s0, opp, bears());
    let s = attackWith(s0, [ogre], opp);
    s = settle(s, { me: [opp] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "punisher" });
    s = settle(act(s, { type: "chooseOption", player: opp, choice: "0" }));
    expect(zone(s, bear)).toBe("graveyard");
    expect(characteristics(s, s.objects[ogre]!).cantBeBlocked).toBeFalsy();
  });

  it("Ogre Marauder: with no creature to sacrifice, it can't be blocked this turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const ogre = putOnBattlefield(s0, ap, ogreMarauder());
    let s = attackWith(s0, [ogre], opp);
    s = settle(s);
    const third = s.turnOrder[(s.turnOrder.indexOf(ap) + 2) % 4]!;
    const blocker = putOnBattlefield(s, opp, bears());
    putOnBattlefield(s, third, bears());
    s = toBlocks(s);
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker, attacker: ogre }] })).toThrow();
  });

  it("Tahngarth's Glare: you order the target opponent's top three, then that player orders yours", () => {
    const { s: s0, ap, opp, ids } = setup([glare()]);
    const theirs = stackLibrary(s0, opp, [hillGiant(), divination(), serraAngel()]);
    const mine = stackLibrary(s0, ap, [bears(), shock(), solRing()]);
    let s = settle(castNow(s0, ap, ids[0]!, [player(opp)]), { me: [ap, opp] });
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: ap, how: "order", owner: opp });
    expect([...(s.pending as { cards: string[] }).cards].sort()).toEqual([...theirs].sort());
    s = settle(act(s, { type: "arrangeTop", player: ap, top: [theirs[2]!, theirs[0]!, theirs[1]!], away: [] }), { me: [ap, opp] });
    expect(s.players[opp]!.library.slice(0, 3)).toEqual([theirs[2]!, theirs[0]!, theirs[1]!]);
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: opp, how: "order", owner: ap });
    expect([...(s.pending as { cards: string[] }).cards].sort()).toEqual([...mine].sort());
    s = settle(act(s, { type: "arrangeTop", player: opp, top: [mine[1]!, mine[2]!, mine[0]!], away: [] }));
    expect(s.players[ap]!.library.slice(0, 3)).toEqual([mine[1]!, mine[2]!, mine[0]!]);
  });

  it("Tahngarth's Glare: a bot ordering your library answers on its own", () => {
    const { s: s0, ap, opp, ids } = setup([glare()]);
    stackLibrary(s0, opp, [hillGiant(), divination(), serraAngel()]);
    const mine = stackLibrary(s0, ap, [bears(), shock(), solRing()]);
    let s = settle(castNow(s0, ap, ids[0]!, [player(opp)]), { me: [ap] });
    s = act(s, { type: "arrangeTop", player: ap, top: [...(s.pending as { cards: string[] }).cards], away: [] });
    s = settle(s);
    expect(s.pending).toBeNull();
    expect([...s.players[ap]!.library.slice(0, 3)].sort()).toEqual([...mine].sort());
  });

  it("Rakdos Augermage: the target opponent picks your discard, then you pick theirs", () => {
    const { s: s0, ap, opp } = setup([]);
    const mage = putOnBattlefield(s0, ap, augermage());
    const [myBolt, myBear] = handOf(s0, ap, [bolt(), bears()]);
    const [theirGiant, theirShock] = handOf(s0, opp, [hillGiant(), shock()]);
    let s = settle(run(s0, planActivate(s0, ap, mage, 0, [player(opp)])), { me: [ap, opp] });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: opp, hand: ap });
    expect([...(s.pending as { cards: string[] }).cards].sort()).toEqual([myBolt!, myBear!].sort());
    s = settle(act(s, { type: "searchLibrary", player: opp, found: [myBolt!] }), { me: [ap, opp] });
    expect(zone(s, myBolt!)).toBe("graveyard");
    expect(zone(s, myBear!)).toBe("hand");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, hand: opp });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [theirGiant!] }));
    expect(zone(s, theirGiant!)).toBe("graveyard");
    expect(zone(s, theirShock!)).toBe("hand");
  });

  it("Rakdos Augermage: the bots answer both picks", () => {
    const { s: s0, ap, opp } = setup([]);
    const mage = putOnBattlefield(s0, ap, augermage());
    handOf(s0, ap, [bolt(), bears()]);
    handOf(s0, opp, [hillGiant(), shock()]);
    const s = settle(run(s0, planActivate(s0, ap, mage, 0, [player(opp)])));
    expect(s.pending).toBeNull();
    expect(hand(s, ap).length).toBe(1);
    expect(hand(s, opp).length).toBe(1);
  });

  it("Rakdos Augermage: only as a sorcery", () => {
    const { s: s0, ap, opp } = setup([]);
    const mage = putOnBattlefield(s0, ap, augermage());
    const s = passUntilThat(s0, (x) => x.step === "beginCombat" && waitingOn(x) === ap);
    expect(abilityProblem(s, ap, mage, 0, [player(opp)])).toMatch(/sorcery/);
  });

  it("Friendly Fire: the creature and its controller are each dealt the random card's mana value", () => {
    const { s: s0, ap, opp, ids } = setup([friendlyFire()]);
    const giant = putOnBattlefield(s0, opp, hillGiant());
    handOf(s0, opp, [serraAngel()]);
    const life = lifeOf(s0, opp);
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(giant)]));
    expect(zone(s, giant)).toBe("graveyard");
    expect(lifeOf(s, opp)).toBe(life - 5);
  });

  it("Friendly Fire: an empty hand reveals nothing, so no damage", () => {
    const { s: s0, ap, opp, ids } = setup([friendlyFire()]);
    const giant = putOnBattlefield(s0, opp, hillGiant());
    handOf(s0, opp, []);
    const life = lifeOf(s0, opp);
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(giant)]));
    expect(zone(s, giant)).toBe("battlefield");
    expect(s.objects[giant]!.damage ?? 0).toBe(0);
    expect(lifeOf(s, opp)).toBe(life);
  });

  it("Serpentine Spike: 2, 3 and 4 damage to three different creatures, and those that die are exiled", () => {
    const { s: s0, ap, opp, ids } = setup([spike()]);
    const bear = putOnBattlefield(s0, opp, bears());
    const giant = putOnBattlefield(s0, opp, hillGiant());
    const big = putOnBattlefield(s0, opp, axelrod());
    expect(planCast(s0, ap, ids[0]!, [tgt(bear), tgt(bear), tgt(giant)])).toBeNull();
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(bear), tgt(giant), tgt(big)]));
    expect(zone(s, bear)).toBe("exile");
    expect(zone(s, giant)).toBe("exile");
    expect(zone(s, big)).toBe("battlefield");
    expect(s.objects[big]!.damage).toBe(4);
  });

  it("Thunderblade Charge: combat damage to a player, pay {2}{R}{R}{R} from the graveyard, then cast it free", () => {
    const { s: s0, ap, opp } = setup([]);
    const charge = toZone(s0, ap, thunderblade(), "graveyard");
    const bear = putOnBattlefield(s0, ap, bears());
    const giant = putOnBattlefield(s0, opp, hillGiant());
    poolOnly(s0, ap, {});
    let s = fight(s0, [bear], opp, []);
    // The mana for the payment, in the pool as the trigger resolves.
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, R: 3, C: 2 };
    // settle says yes to the payment.
    s = settle(s, { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: charge });
    expect((s.players[ap]!.manaPool.R ?? 0) + (s.players[ap]!.manaPool.C ?? 0)).toBe(0);
    s = run(s, planCast(s, ap, charge, [tgt(giant)]));
    s = settle(s);
    expect(zone(s, giant)).toBe("graveyard");
    expect(zone(s, charge)).toBe("graveyard");
  });

  it("Thunderblade Charge: not paying leaves it in the graveyard", () => {
    const { s: s0, ap, opp } = setup([]);
    const charge = toZone(s0, ap, thunderblade(), "graveyard");
    const bear = putOnBattlefield(s0, ap, bears());
    const life = lifeOf(s0, opp);
    let s = fight(s0, [bear], opp, []);
    s = settle(s, { may: false });
    expect(zone(s, charge)).toBe("graveyard");
    expect(lifeOf(s, opp)).toBe(life - 2);
  });

  it("Measure of Wickedness: another card put into your graveyard gives it to the target opponent", () => {
    const { s: s0, ap, opp } = setup([]);
    const measured = putOnBattlefield(s0, ap, measure());
    const bear = putOnBattlefield(s0, ap, bears());
    destroyPermanent(s0, s0.objects[bear]!, "test");
    closeZoneBatch(s0);
    const s = settle(s0, { targets: [[player(opp)]] });
    expect(controllerOf(s, s.objects[measured]!)).toBe(opp);
  });

  it("Measure of Wickedness: at your end step you sacrifice it and lose 8 life", () => {
    const { s: s0, ap } = setup([]);
    const measured = putOnBattlefield(s0, ap, measure());
    handOf(s0, ap, []);
    const life = lifeOf(s0, ap);
    const s = settle(goUntil(s0, (x) => x.step === "end" && x.stack.length > 0));
    expect(zone(s, measured)).toBe("graveyard");
    expect(lifeOf(s, ap)).toBe(life - 8);
  });

  it("Urza's Miter: an artifact destroyed lets you pay {3} to draw; a sacrificed one doesn't", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, miter());
    const ring = putOnBattlefield(s0, ap, solRing());
    const stone = putOnBattlefield(s0, ap, mindStone());
    const n = hand(s0, ap).length;
    s0.players[ap]!.manaPool = { ...s0.players[ap]!.manaPool, C: 4 };
    destroyPermanent(s0, s0.objects[ring]!, "test");
    // settle says yes to paying {3}.
    let s = settle(s0);
    expect(zone(s, ring)).toBe("graveyard");
    expect(hand(s, ap).length).toBe(n + 1);
    expect(s.players[ap]!.manaPool.C).toBe(1);
    s = settle(run(s, planActivate(s, ap, stone, 0)), { me: [ap] });
    expect(zone(s, stone)).toBe("graveyard");
    expect(s.pending).toBeNull();
    expect(hand(s, ap).length).toBe(n + 2);
  });

  it("Mind Extraction: the target player discards every card sharing a color with the sacrificed creature", () => {
    const { s: s0, ap, opp, ids } = setup([mindExtraction()]);
    const giant = putOnBattlefield(s0, ap, hillGiant());
    const [b, sh, angel, ring] = handOf(s0, opp, [bolt(), shock(), serraAngel(), solRing()]);
    const s = settle(castNow(s0, ap, ids[0]!, [player(opp)], { sacrifice: [giant] }));
    expect(zone(s, giant)).toBe("graveyard");
    expect(zone(s, b!)).toBe("graveyard");
    expect(zone(s, sh!)).toBe("graveyard");
    expect(zone(s, angel!)).toBe("hand");
    expect(zone(s, ring!)).toBe("hand");
  });

  it("Mind Extraction: a colorless creature sacrificed discards nothing", () => {
    const { s: s0, ap, opp, ids } = setup([mindExtraction()]);
    const thopter = putOnBattlefield(s0, ap, ornithopter());
    const cards = handOf(s0, opp, [bolt(), solRing()]);
    const s = settle(castNow(s0, ap, ids[0]!, [player(opp)], { sacrifice: [thopter] }));
    expect(zone(s, thopter)).toBe("graveyard");
    for (const id of cards) expect(zone(s, id)).toBe("hand");
  });

  it("Hand to Hand: during combat no instant spells and no abilities that aren't mana abilities; mana abilities still work", () => {
    const { s: s0, ap, ids } = setup([shock(), divination()]);
    putOnBattlefield(s0, ap, handToHand());
    const stone = putOnBattlefield(s0, ap, mindStone());
    expect(castProblem(s0, ap, ids[0]!)).not.toMatch(/Hand to Hand/);
    expect(abilityProblem(s0, ap, stone, 0) ?? "").not.toMatch(/Hand to Hand/);
    const s = passUntilThat(s0, (x) => x.step === "beginCombat" && waitingOn(x) === ap);
    expect(castProblem(s, ap, ids[0]!)).toMatch(/Hand to Hand: players can't cast instant spells during combat/);
    expect(abilityProblem(s, ap, stone, 0)).toMatch(/Hand to Hand/);
    expect(manaAbilityProblem(s, ap, s.objects[stone]!, 0)).toBeNull();
    // After combat, both again.
    const after = passUntilThat(s, (x) => x.step === "main2" && waitingOn(x) === ap);
    expect(castProblem(after, ap, ids[0]!) ?? "").not.toMatch(/Hand to Hand/);
    expect(abilityProblem(after, ap, stone, 0) ?? "").not.toMatch(/Hand to Hand/);
  });

  it("Voodoo Doll: a pin counter each upkeep; X is the pin counters, and it deals that much", () => {
    const { s: s0, ap, opp } = setup([]);
    const doll = putOnBattlefield(s0, ap, voodooDoll());
    s0.objects[doll]!.counters.pin = 2;
    poolOnly(s0, ap, { C: 4 });
    expect(abilityProblem(s0, ap, doll, 0, [player(opp)], undefined, undefined, 3)).toMatch(/X is 2/);
    const life = lifeOf(s0, opp);
    const s = settle(run(s0, planActivate(s0, ap, doll, 0, [player(opp)])));
    expect(lifeOf(s, opp)).toBe(life - 2);
    expect(s.players[ap]!.manaPool.C ?? 0).toBe(0);
  });

  it("Voodoo Doll: untapped at your end step, it's destroyed and deals you its pin counters in damage", () => {
    const { s: s0, ap } = setup([]);
    const doll = putOnBattlefield(s0, ap, voodooDoll());
    s0.objects[doll]!.counters.pin = 3;
    handOf(s0, ap, []);
    const life = lifeOf(s0, ap);
    const s = settle(goUntil(s0, (x) => x.step === "end" && x.stack.length > 0));
    expect(zone(s, doll)).toBe("graveyard");
    expect(lifeOf(s, ap)).toBe(life - 3);
  });

  it("Voodoo Doll: tapped at your end step, nothing happens; the upkeep adds a counter", () => {
    const { s: s0, ap } = setup([]);
    const doll = putOnBattlefield(s0, ap, voodooDoll());
    s0.objects[doll]!.tapped = true;
    handOf(s0, ap, []);
    const life = lifeOf(s0, ap);
    let s = goUntil(s0, (x) => x.step === "cleanup" || (x.step === "end" && x.stack.length > 0));
    expect(s.stack.length).toBe(0);
    s = settle(toNextUpkeep(s, ap));
    expect(s.objects[doll]!.counters.pin).toBe(1);
    expect(lifeOf(s, ap)).toBe(life);
  });
});
