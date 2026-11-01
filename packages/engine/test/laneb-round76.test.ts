// Lane B, round 76: unsupported cards from the bottom of the popularity list (`npm run popular -- --least`): look-at-the-top
// filters ("a blue or artifact card", "a card with a kicker ability", "a card with {X} in its mana cost"), base power and
// toughness set from another creature (CR 613.4b), "for as long as ~ remains on the battlefield" animations (CR 611.2b),
// land types added (CR 305.7), an Aura returned from a graveyard (CR 303.4f), one-line spells.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";
import { controllerOf } from "../src/layers";
import { objHasKeyword } from "../src/cards";
import { destroyPermanent } from "../src/game";
import { manaAbilitiesOn } from "../src/manaabilities";
const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty, answering "you may" with `may`; other questions are answered as the bots would, except `me`'s (it stops there). */
const settle = (s: GameState, opts: { may?: boolean; me?: PlayerId } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me !== undefined && p.player === opts.me) return s;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.may ?? true });
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
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const shuffles = (s: GameState, pid: PlayerId) => s.players[pid]!.shuffles ?? 0;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices: CostChoices = {}) => run(s, planCast(s, pid, id, targets, undefined, "auto", undefined, choices));
const activateNow = (s: GameState, pid: PlayerId, id: string, index: number, targets: TargetChoice[] = [], costs?: CostChoices) => run(s, planActivate(s, pid, id, index, targets, undefined, undefined, undefined, costs));
/** Moves a new card for `def` into `pid`'s hand, library (on top), graveyard or exile. */
const toZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "library" | "graveyard" | "exile") => {
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
const emptyHand = (s: GameState, pid: PlayerId) => {
  for (const id of [...s.players[pid]!.hand]) {
    s.players[pid]!.hand.splice(s.players[pid]!.hand.indexOf(id), 1);
    s.objects[id]!.zone = "exile";
    s.players[pid]!.exile.push(id);
  }
  invalidateCharacteristics(s);
};
const others = (s: GameState, ap: PlayerId) => [1, 2, 3].map((i) => s.turnOrder[(s.turnOrder.indexOf(ap) + i) % 4]!);
const abIndex = (s: GameState, id: string, re: RegExp) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => re.test(a.text));

/** Puts `defs` on top of `pid`'s library, the first one on top. */
const stackTop = (s: GameState, pid: PlayerId, defs: CardDef[]) => {
  const ids = [...defs].reverse().map((d) => toZone(s, pid, d, "library"));
  return ids.reverse();
};
const types = (s: GameState, id: string) => characteristics(s, s.objects[id]!);
/** Destroys a permanent outside any spell (for "for as long as ~ remains on the battlefield"). */
const kill = (s: GameState, id: string) => {
  destroyPermanent(s, s.objects[id]!, "test");
  invalidateCharacteristics(s);
  return s;
};

// Real oracle text (Scryfall).
const tezzeretsGatebreaker = (): CardDef => ({"oracleId":"eb35d7e5-eddd-4e02-99ac-1a42cd575041","name":"Tezzeret's Gatebreaker","manaCost":"{4}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"When this artifact enters, look at the top five cards of your library. You may reveal a blue or artifact card from among them and put it into your hand. Put the rest on the bottom of your library in a random order.\n{5}{U}, {T}, Sacrifice this artifact: Creatures you control can't be blocked this turn.","colors":[],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/8/584e0528-01c2-49fb-aa4a-098172bb17a7.jpg?1783934487","artUrl":"https://cards.scryfall.io/art_crop/front/5/8/584e0528-01c2-49fb-aa4a-098172bb17a7.jpg?1783934487","commanderLegal":"legal","set":"m19","releasedAt":"2018-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const coralhelmChronicler = (): CardDef => ({"oracleId":"621fc513-b16a-4c09-93f8-424e688471e2","name":"Coralhelm Chronicler","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Merfolk Wizard","supertypes":[],"types":["Creature"],"subtypes":["Merfolk","Wizard"],"oracleText":"Whenever you cast a kicked spell, draw a card, then discard a card.\nWhen this creature enters, look at the top five cards of your library. You may reveal a card with a kicker ability from among them and put it into your hand. Put the rest on the bottom of your library in a random order.","power":"2","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/0/50b54524-8345-4b47-913f-d883a1cbe3a1.jpg?1783929399","artUrl":"https://cards.scryfall.io/art_crop/front/5/0/50b54524-8345-4b47-913f-d883a1cbe3a1.jpg?1783929399","commanderLegal":"legal","set":"znr","releasedAt":"2020-09-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const paradoxSurveyor = (): CardDef => ({"oracleId":"247cc471-fed5-41e3-8b6a-a10bbc129b36","name":"Paradox Surveyor","manaCost":"{G}{G/U}{U}","cmc":3,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"Reach\nWhen this creature enters, look at the top five cards of your library. You may reveal a land card or a card with {X} in its mana cost from among them and put it into your hand. Put the rest on the bottom of your library in a random order.","power":"3","toughness":"3","colors":["G","U"],"colorIdentity":["G","U"],"keywords":["Reach"],"imageUrl":"https://cards.scryfall.io/normal/front/d/7/d7cb1af2-0302-46ff-8303-ae9d07541a01.jpg?1783903636","artUrl":"https://cards.scryfall.io/art_crop/front/d/7/d7cb1af2-0302-46ff-8303-ae9d07541a01.jpg?1783903636","commanderLegal":"legal","set":"sos","releasedAt":"2026-04-24","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const sandstalkerMoloch = (): CardDef => ({"oracleId":"f2a6dc8d-3c98-44ae-aff0-b838d7aee0b7","name":"Sandstalker Moloch","manaCost":"{1}{G}{G}","cmc":3,"typeLine":"Creature — Lizard","supertypes":[],"types":["Creature"],"subtypes":["Lizard"],"oracleText":"Flash\nWhen this creature enters, if an opponent cast a blue and/or black spell this turn, look at the top four cards of your library. You may reveal a permanent card from among them and put it into your hand. Put the rest on the bottom of your library in a random order.","power":"4","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":["Flash"],"imageUrl":"https://cards.scryfall.io/normal/front/e/b/eb17b083-413b-4a09-a935-ac27594e3bd6.jpg?1783916962","artUrl":"https://cards.scryfall.io/art_crop/front/e/b/eb17b083-413b-4a09-a935-ac27594e3bd6.jpg?1783916962","commanderLegal":"legal","set":"mom","releasedAt":"2023-04-21","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const skilledAnimator = (): CardDef => ({"oracleId":"6e51a0b2-e07f-4c9d-b055-dd1dcd2e29d4","name":"Skilled Animator","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Human Artificer","supertypes":[],"types":["Creature"],"subtypes":["Human","Artificer"],"oracleText":"When this creature enters, target artifact you control becomes an artifact creature with base power and toughness 5/5 for as long as this creature remains on the battlefield.","power":"1","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/8/586d5000-1fdb-4bfe-aa34-63b25ee94bb9.jpg?1783934583","artUrl":"https://cards.scryfall.io/art_crop/front/5/8/586d5000-1fdb-4bfe-aa34-63b25ee94bb9.jpg?1783934583","commanderLegal":"legal","set":"m19","releasedAt":"2018-07-13","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const unctussRetrofitter = (): CardDef => ({"oracleId":"998d8d8a-743d-43f9-8e9b-42460f170243","name":"Unctus's Retrofitter","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Phyrexian Artificer","supertypes":[],"types":["Creature"],"subtypes":["Phyrexian","Artificer"],"oracleText":"Toxic 1 (Players dealt combat damage by this creature also get a poison counter.)\nWhen this creature enters, up to one target artifact you control becomes an artifact creature with base power and toughness 4/4 for as long as this creature remains on the battlefield.","power":"2","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Toxic"],"imageUrl":"https://cards.scryfall.io/normal/front/3/0/30225e40-4bde-4e2e-b0f0-48ed16aebafd.jpg?1783918055","artUrl":"https://cards.scryfall.io/art_crop/front/3/0/30225e40-4bde-4e2e-b0f0-48ed16aebafd.jpg?1783918055","commanderLegal":"legal","set":"one","releasedAt":"2023-02-10","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const awakenerDruid = (): CardDef => ({"oracleId":"7e8f5b34-fd16-4307-9104-17b584b25b14","name":"Awakener Druid","manaCost":"{2}{G}","cmc":3,"typeLine":"Creature — Human Druid","supertypes":[],"types":["Creature"],"subtypes":["Human","Druid"],"oracleText":"When this creature enters, target Forest becomes a 4/5 green Treefolk creature for as long as this creature remains on the battlefield. It's still a land.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/2/821bd93c-e25e-4a8d-b4ec-b459ef37f6c8.jpg?1783942366","artUrl":"https://cards.scryfall.io/art_crop/front/8/2/821bd93c-e25e-4a8d-b4ec-b459ef37f6c8.jpg?1783942366","commanderLegal":"legal","set":"m10","releasedAt":"2009-07-17","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const sealockMonster = (): CardDef => ({"oracleId":"351c4f85-8792-4710-8cc9-d3e36657f6db","name":"Sealock Monster","manaCost":"{3}{U}{U}","cmc":5,"typeLine":"Creature — Octopus","supertypes":[],"types":["Creature"],"subtypes":["Octopus"],"oracleText":"This creature can't attack unless defending player controls an Island.\n{5}{U}{U}: Monstrosity 3. (If this creature isn't monstrous, put three +1/+1 counters on it and it becomes monstrous.)\nWhen this creature becomes monstrous, target land becomes an Island in addition to its other types.","power":"5","toughness":"5","colors":["U"],"colorIdentity":["U"],"keywords":["Monstrosity"],"imageUrl":"https://cards.scryfall.io/normal/front/3/f/3f942075-b285-495c-941e-6f1da48d7948.jpg?1783939792","artUrl":"https://cards.scryfall.io/art_crop/front/3/f/3f942075-b285-495c-941e-6f1da48d7948.jpg?1783939792","commanderLegal":"legal","set":"ths","releasedAt":"2013-09-27","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const navigatorsCompass = (): CardDef => ({"oracleId":"c994e148-1bb5-4113-a9f2-73e6dab8f72d","name":"Navigator's Compass","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"When this artifact enters, you gain 3 life.\n{T}: Until end of turn, target land you control becomes the basic land type of your choice in addition to its other types.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/a/6a283135-7a51-4cf7-82a6-7e50894e64a5.jpg?1783934955","artUrl":"https://cards.scryfall.io/art_crop/front/6/a/6a283135-7a51-4cf7-82a6-7e50894e64a5.jpg?1783934955","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const galionElvenkingsButler = (): CardDef => ({"oracleId":"9efb3aa4-0023-4e0e-8bd4-f4dff1b3be66","name":"Galion, Elvenking's Butler","manaCost":"{2}{G}{G}","cmc":4,"typeLine":"Legendary Creature — Elf Advisor","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elf","Advisor"],"oracleText":"Whenever Galion attacks, choose up to one other target creature you control. Its base power and toughness become equal to Galion's power and toughness until end of turn.","power":"4","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/8/985bd676-58c4-42c7-a570-1b413e9aa94c.jpg?1785152142","artUrl":"https://cards.scryfall.io/art_crop/front/9/8/985bd676-58c4-42c7-a570-1b413e9aa94c.jpg?1785152142","commanderLegal":"legal","set":"hob","releasedAt":"2026-08-14","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const exuberantWolfbear = (): CardDef => ({"oracleId":"40f5f8b9-5c2c-41d4-8b83-55a2e51ced64","name":"Exuberant Wolfbear","manaCost":"{3}{G}","cmc":4,"typeLine":"Creature — Wolf Bear","supertypes":[],"types":["Creature"],"subtypes":["Wolf","Bear"],"oracleText":"Whenever this creature attacks, you may have the base power and toughness of target Human you control become equal to this creature's power and toughness until end of turn.","power":"4","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/c/8c8ff0da-fbe3-4c95-bc39-c975c55b6aea.jpg?1783931038","artUrl":"https://cards.scryfall.io/art_crop/front/8/c/8c8ff0da-fbe3-4c95-bc39-c975c55b6aea.jpg?1783931038","commanderLegal":"legal","set":"iko","releasedAt":"2020-04-24","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const unrulyKrasis = (): CardDef => ({"oracleId":"8420f73d-fdcf-4425-b9a7-c9d359fc028d","name":"Unruly Krasis","manaCost":"{1}{G}{U}","cmc":3,"typeLine":"Creature — Shark Octopus Lizard","supertypes":[],"types":["Creature"],"subtypes":["Shark","Octopus","Lizard"],"oracleText":"Trample\nWhenever this creature attacks, you may have the base power and toughness of another target creature you control become X/X until end of turn, where X is this creature's power.\n{3}{G}{U}: Adapt 3. (If this creature has no +1/+1 counters on it, put three +1/+1 counters on it.)","power":"4","toughness":"4","colors":["G","U"],"colorIdentity":["G","U"],"keywords":["Adapt","Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/a/3/a3b1b58d-b7f1-404f-aec6-b19cef4bebbd.jpg?1783912568","artUrl":"https://cards.scryfall.io/art_crop/front/a/3/a3b1b58d-b7f1-404f-aec6-b19cef4bebbd.jpg?1783912568","commanderLegal":"legal","set":"clu","releasedAt":"2024-02-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const masterOfWinds = (): CardDef => ({"oracleId":"7accdc91-3140-4096-a71f-0cee38d29e96","name":"Master of Winds","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Creature — Sphinx Wizard","supertypes":[],"types":["Creature"],"subtypes":["Sphinx","Wizard"],"oracleText":"Flying\nWhen this creature enters, draw two cards, then discard a card.\nWhenever you cast an instant, sorcery, or Wizard spell, you may have this creature's base power and toughness become 4/1 or 1/4 until end of turn.","power":"1","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/0/c/0caaf92a-3d9d-4c52-acff-cf960ec55e47.jpg?1783929392","artUrl":"https://cards.scryfall.io/art_crop/front/0/c/0caaf92a-3d9d-4c52-acff-cf960ec55e47.jpg?1783929392","commanderLegal":"legal","set":"znr","releasedAt":"2020-09-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const precognition = (): CardDef => ({"oracleId":"6d1a9d06-028f-487a-b490-27100c128ea3","name":"Precognition","manaCost":"{4}{U}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your upkeep, you may look at the top card of target opponent's library. If you do, you may put that card on the bottom of that player's library.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/76a0e317-5a76-4eac-a903-b0e3f0a45873.jpg?1783946653","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/76a0e317-5a76-4eac-a903-b0e3f0a45873.jpg?1783946653","commanderLegal":"legal","set":"tmp","releasedAt":"1997-10-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const elementalAppeal = (): CardDef => ({"oracleId":"3bcfc82c-3523-40e3-b236-78ece8a8d69f","name":"Elemental Appeal","manaCost":"{R}{R}{R}{R}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Kicker {5} (You may pay an additional {5} as you cast this spell.)\nCreate a 7/1 red Elemental creature token with trample and haste. Exile it at the beginning of the next end step. If this spell was kicked, that creature gets +7/+0 until end of turn.","colors":["R"],"colorIdentity":["R"],"keywords":["Kicker"],"imageUrl":"https://cards.scryfall.io/normal/front/3/a/3a583f30-a3e0-4c4f-81b3-01452edaf22c.jpg?1783942145","artUrl":"https://cards.scryfall.io/art_crop/front/3/a/3a583f30-a3e0-4c4f-81b3-01452edaf22c.jpg?1783942145","commanderLegal":"legal","set":"zen","releasedAt":"2009-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const armTheCathars = (): CardDef => ({"oracleId":"c6a1a91f-46b9-4e41-a3d3-3423b02c42a5","name":"Arm the Cathars","manaCost":"{1}{W}{W}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Until end of turn, target creature gets +3/+3, up to one other target creature gets +2/+2, and up to one other target creature gets +1/+1. Those creatures gain vigilance until end of turn.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8eb05c76-3b23-4a12-be3f-010978ac1dd6.jpg?1783924314","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8eb05c76-3b23-4a12-be3f-010978ac1dd6.jpg?1783924314","commanderLegal":"legal","set":"dbl","releasedAt":"2022-01-28","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const nightcreep = (): CardDef => ({"oracleId":"8b4b677e-3b18-454c-b385-b3ffb65f916e","name":"Nightcreep","manaCost":"{B}{B}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Until end of turn, all creatures become black and all lands become Swamps.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/5/55f7f7f7-c7eb-466c-bfe6-0ef586284ee9.jpg?1783943427","artUrl":"https://cards.scryfall.io/art_crop/front/5/5/55f7f7f7-c7eb-466c-bfe6-0ef586284ee9.jpg?1783943427","commanderLegal":"legal","set":"dis","releasedAt":"2006-05-05","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const concussiveBolt = (): CardDef => ({"oracleId":"e99958bf-458c-403b-aae2-91d60c055ee2","name":"Concussive Bolt","manaCost":"{3}{R}{R}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Concussive Bolt deals 4 damage to target player or planeswalker.\nMetalcraft — If you control three or more artifacts, creatures controlled by that player or by that planeswalker's controller can't block this turn.","colors":["R"],"colorIdentity":["R"],"keywords":["Metalcraft"],"imageUrl":"https://cards.scryfall.io/normal/front/4/1/41b68e85-a381-441d-aa18-491f9e202a10.jpg?1783941380","artUrl":"https://cards.scryfall.io/art_crop/front/4/1/41b68e85-a381-441d-aa18-491f9e202a10.jpg?1783941380","commanderLegal":"legal","set":"mbs","releasedAt":"2011-02-04","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const vindictiveTriumph = (): CardDef => ({"oracleId":"d6b478d1-5015-49ba-b1aa-cbc2b08107a6","name":"Vindictive Triumph","manaCost":"{W}{B}{B}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Exile target creature or planeswalker. If that permanent's mana value was 3 or less, return it to the battlefield tapped under your control. Exile it at the beginning of the next end step.","colors":["B","W"],"colorIdentity":["B","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/8/a803dbe7-153a-4e92-ad4d-c2babebe003d.jpg?1790558815","artUrl":"https://cards.scryfall.io/art_crop/front/a/8/a803dbe7-153a-4e92-ad4d-c2babebe003d.jpg?1790558815","commanderLegal":"legal","set":"fra","releasedAt":"2026-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const phantasmalForm = (): CardDef => ({"oracleId":"d21facb6-27c2-49cb-9f13-7d6079096eda","name":"Phantasmal Form","manaCost":"{2}{U}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Until end of turn, up to two target creatures each have base power and toughness 3/3, gain flying, and become blue Illusions in addition to their other colors and types.\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/1/f106e515-511a-48c7-b7a7-3ca820950122.jpg?1783933140","artUrl":"https://cards.scryfall.io/art_crop/front/f/1/f106e515-511a-48c7-b7a7-3ca820950122.jpg?1783933140","commanderLegal":"legal","set":"mh1","releasedAt":"2019-06-14","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const riseToGlory = (): CardDef => ({"oracleId":"a41297c4-5c2d-475d-b1f5-439df30fbad7","name":"Rise to Glory","manaCost":"{3}{W}{B}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose one or both —\n• Return target creature card from your graveyard to the battlefield.\n• Return target Aura card from your graveyard to the battlefield.","colors":["B","W"],"colorIdentity":["B","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/f/cf6c11c8-64a1-46a4-979c-56a6d5b873d3.jpg?1783931519","artUrl":"https://cards.scryfall.io/art_crop/front/c/f/cf6c11c8-64a1-46a4-979c-56a6d5b873d3.jpg?1783931519","commanderLegal":"legal","set":"thb","releasedAt":"2020-01-24","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const brotherhoodOutcast = (): CardDef => ({"oracleId":"79d0cdc1-2e27-48c5-8840-430490068f68","name":"Brotherhood Outcast","manaCost":"{2}{W}","cmc":3,"typeLine":"Creature — Human Soldier","supertypes":[],"types":["Creature"],"subtypes":["Human","Soldier"],"oracleText":"When this creature enters, choose one —\n• Return target Aura or Equipment card with mana value 3 or less from your graveyard to the battlefield.\n• Put a shield counter on target creature. (If it would be dealt damage or destroyed, remove a shield counter from it instead.)","power":"3","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/9/0949fcab-5aa2-4277-bf4d-f5855a863cb6.jpg?1783912225","artUrl":"https://cards.scryfall.io/art_crop/front/0/9/0949fcab-5aa2-4277-bf4d-f5855a863cb6.jpg?1783912225","commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const cabalConditioning = (): CardDef => ({"oracleId":"37a04d5a-9272-42bd-b448-c658375bbbc3","name":"Cabal Conditioning","manaCost":"{6}{B}","cmc":7,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Any number of target players each discard a number of cards equal to the greatest mana value among permanents you control.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/b/eb81c6e6-fded-4cd3-a6fa-486419a5408a.jpg?1783944882","artUrl":"https://cards.scryfall.io/art_crop/front/e/b/eb81c6e6-fded-4cd3-a6fa-486419a5408a.jpg?1783944882","commanderLegal":"legal","set":"scg","releasedAt":"2003-05-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const dizzyingGaze = (): CardDef => ({"oracleId":"e04f46d9-43e7-45ef-b59c-1810f30bec72","name":"Dizzying Gaze","manaCost":"{R}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature you control\n{R}: Enchanted creature deals 1 damage to target creature with flying.","colors":["R"],"colorIdentity":["R"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/7/1/71a482cf-a1cd-47b5-a76a-08e03965c679.jpg?1783946512","artUrl":"https://cards.scryfall.io/art_crop/front/7/1/71a482cf-a1cd-47b5-a76a-08e03965c679.jpg?1783946512","commanderLegal":"legal","set":"exo","releasedAt":"1998-06-15","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const opt = (): CardDef => ({"oracleId":"713332c1-5bd8-400f-bfff-c1ca0697a043","name":"Opt","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","artUrl":"https://cards.scryfall.io/art_crop/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","commanderLegal":"legal","set":"sld","releasedAt":"2025-07-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const fireball = (): CardDef => ({"oracleId":"aa7714b0-2bfb-458a-8ebf-37ec2c53383e","name":"Fireball","manaCost":"{X}{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"This spell costs {1} more to cast for each target beyond the first.\nFireball deals X damage divided evenly, rounded down, among any number of targets.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/2/82a97aae-d8a7-4451-a47e-ea878dea6e4c.jpg?1783922638","artUrl":"https://cards.scryfall.io/art_crop/front/8/2/82a97aae-d8a7-4451-a47e-ea878dea6e4c.jpg?1783922638","commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const burstLightning = (): CardDef => ({"oracleId":"ac2086fe-98ee-4280-9c7c-c5c2d6548a8b","name":"Burst Lightning","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Kicker {4} (You may pay an additional {4} as you cast this spell.)\nBurst Lightning deals 2 damage to any target. If this spell was kicked, it deals 4 damage instead.","colors":["R"],"colorIdentity":["R"],"keywords":["Kicker"],"imageUrl":"https://cards.scryfall.io/normal/front/f/9/f98b402a-ecdb-432f-a050-65945c8c415d.jpg?1783903920","artUrl":"https://cards.scryfall.io/art_crop/front/f/9/f98b402a-ecdb-432f-a050-65945c8c415d.jpg?1783903920","commanderLegal":"legal","set":"soa","releasedAt":"2026-04-24","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const gnarlidPack = (): CardDef => ({"oracleId":"be6e835c-822e-45ff-a992-249d4d9781dc","name":"Gnarlid Pack","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Beast","supertypes":[],"types":["Creature"],"subtypes":["Beast"],"oracleText":"Multikicker {1}{G} (You may pay an additional {1}{G} any number of times as you cast this spell.)\nThis creature enters with a +1/+1 counter on it for each time it was kicked.","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":["Multikicker"],"imageUrl":"https://cards.scryfall.io/normal/front/6/8/68716387-c5ec-4967-be5f-723783722c64.jpg?1783942046","artUrl":"https://cards.scryfall.io/art_crop/front/6/8/68716387-c5ec-4967-be5f-723783722c64.jpg?1783942046","commanderLegal":"legal","set":"wwk","releasedAt":"2010-02-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const trainOfThought = (): CardDef => ({"oracleId":"90ba0366-57ff-4dc4-a290-3925548129ce","name":"Train of Thought","manaCost":"{1}{U}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Replicate {1}{U} (When you cast this spell, copy it for each time you paid its replicate cost.)\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":["Replicate"],"imageUrl":"https://cards.scryfall.io/normal/front/e/9/e98f5890-a494-4609-acae-f9e9bacd991d.jpg?1783943514","artUrl":"https://cards.scryfall.io/art_crop/front/e/9/e98f5890-a494-4609-acae-f9e9bacd991d.jpg?1783943514","commanderLegal":"legal","set":"gpt","releasedAt":"2006-02-03","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const windDrake = (): CardDef => ({"oracleId":"d6ffdaf0-ac08-4de9-bbce-2eab2f86bcca","name":"Wind Drake","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Drake","supertypes":[],"types":["Creature"],"subtypes":["Drake"],"oracleText":"Flying","power":"2","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/5/e/5e227a63-abea-494e-9d66-6ff0a3da14ca.jpg?1783937211","artUrl":"https://cards.scryfall.io/art_crop/front/5/e/5e227a63-abea-494e-9d66-6ff0a3da14ca.jpg?1783937211","commanderLegal":"legal","set":"kld","releasedAt":"2016-09-30","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const eliteVanguard = (): CardDef => ({"oracleId":"b3b9a87d-cb95-435c-90b6-037406cab32e","name":"Elite Vanguard","manaCost":"{W}","cmc":1,"typeLine":"Creature — Human Soldier","supertypes":[],"types":["Creature"],"subtypes":["Human","Soldier"],"oracleText":"","power":"2","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/b/6bda0b4b-ab5a-4d91-9dd1-7a5a145b67f5.jpg?1783942403","artUrl":"https://cards.scryfall.io/art_crop/front/6/b/6bda0b4b-ab5a-4d91-9dd1-7a5a145b67f5.jpg?1783942403","commanderLegal":"legal","set":"m10","releasedAt":"2009-07-17","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const shivanDragon = (): CardDef => ({"oracleId":"711eea87-0fa3-46e0-a42b-fa5a86455f04","name":"Shivan Dragon","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying\n{R}: This creature gets +1/+0 until end of turn.","power":"5","toughness":"5","colors":["R"],"colorIdentity":["R"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/2/9/294ca89d-549a-4302-9284-df5b4e833a69.jpg?1789446860","artUrl":"https://cards.scryfall.io/art_crop/front/2/9/294ca89d-549a-4302-9284-df5b4e833a69.jpg?1789446860","commanderLegal":"legal","set":"sld","releasedAt":"2026-08-31","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const holyStrength = (): CardDef => ({"oracleId":"9357de36-f8be-4f49-b2c8-9fe9eaf82b07","name":"Holy Strength","manaCost":"{W}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature gets +1/+2.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/e/2/e21264cb-d915-4431-92fd-b0aa32a715fc.jpg?1783943078","artUrl":"https://cards.scryfall.io/art_crop/front/e/2/e21264cb-d915-4431-92fd-b0aa32a715fc.jpg?1783943078","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const jaceBeleren = (): CardDef => ({"oracleId":"cc2b6e58-2d6f-495e-95f3-9496105c4cba","name":"Jace Beleren","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Legendary Planeswalker — Jace","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Jace"],"oracleText":"+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards.","loyalty":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/b/c/bc836203-4bb9-4bfa-89ab-0ad49f916c92.jpg?1783942523","artUrl":"https://cards.scryfall.io/art_crop/front/b/c/bc836203-4bb9-4bfa-89ab-0ad49f916c92.jpg?1783942523","commanderLegal":"legal","set":"dd2","releasedAt":"2008-11-07","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

describe("Lane B round 76", () => {
  it("all of them are supported", () => {
    supported(tezzeretsGatebreaker(), coralhelmChronicler(), paradoxSurveyor(), sandstalkerMoloch(), skilledAnimator(), unctussRetrofitter(), awakenerDruid(), sealockMonster(), navigatorsCompass(), galionElvenkingsButler(), exuberantWolfbear(), unrulyKrasis(), masterOfWinds(), precognition(), elementalAppeal(), armTheCathars(), nightcreep(), concussiveBolt(), vindictiveTriumph(), phantasmalForm(), riseToGlory(), brotherhoodOutcast(), cabalConditioning(), dizzyingGaze());
  });

  it("Tezzeret's Gatebreaker: a blue or artifact card from among the top five, a blue creature too, not a green one", () => {
    const { s: s0, ap, ids } = setup([tezzeretsGatebreaker()]);
    const top = stackTop(s0, ap, [opt(), solRing(), bear(), windDrake(), card("Forest", "Basic Land — Forest")]);
    const s = settle(castNow(s0, ap, ids[0]!), { me: ap });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", min: 0, max: 1 });
    expect(new Set((s.pending as { cards: string[] }).cards)).toEqual(new Set([top[0], top[1], top[3]]));
    const t = settle(act(s, { type: "searchLibrary", player: ap, found: [top[1]!] }));
    expect(zone(t, top[1]!)).toBe("hand");
    expect(t.players[ap]!.library.slice(-4).sort()).toEqual([top[0], top[2], top[3], top[4]].sort());
  });

  it("Coralhelm Chronicler: a card with a kicker ability, multikicker too (rulings), not replicate", () => {
    const { s: s0, ap, ids } = setup([coralhelmChronicler()]);
    const top = stackTop(s0, ap, [burstLightning(), gnarlidPack(), trainOfThought(), opt(), bear()]);
    const s = settle(castNow(s0, ap, ids[0]!), { me: ap });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", min: 0, max: 1 });
    expect(new Set((s.pending as { cards: string[] }).cards)).toEqual(new Set([top[0], top[1]]));
  });

  it("Paradox Surveyor: a land card or a card with {X} in its mana cost", () => {
    const { s: s0, ap, ids } = setup([paradoxSurveyor()]);
    const top = stackTop(s0, ap, [fireball(), opt(), card("Forest", "Basic Land — Forest"), bear(), solRing()]);
    const s = settle(castNow(s0, ap, ids[0]!), { me: ap });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", min: 0, max: 1 });
    expect(new Set((s.pending as { cards: string[] }).cards)).toEqual(new Set([top[0], top[2]]));
  });

  it("Sandstalker Moloch: only if an opponent cast a blue and/or black spell this turn (CR 603.4); a permanent card from the top four", () => {
    const { s: s0, ap, opp, ids } = setup([sandstalkerMoloch(), sandstalkerMoloch()]);
    stackTop(s0, ap, [opt(), bear(), solRing(), opt()]);
    // No such spell: nothing to look at.
    let s = settle(castNow(s0, ap, ids[0]!), { me: ap });
    expect(s.pending).toBeFalsy();
    // An opponent's blue spell earlier this turn, countered or not (rulings).
    const optCard = toZone(s, opp, opt(), "graveyard");
    (s.castThisTurn ??= []).push({ player: opp, card: optCard, colors: ["U"], types: ["Instant"], from: "hand", mv: 1 });
    const lib = s.players[ap]!.library;
    s.players[ap]!.manaPool.G = 3;
    s = settle(castNow(s, ap, ids[1]!), { me: ap });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", min: 0, max: 1 });
    expect(new Set((s.pending as { cards: string[] }).cards)).toEqual(new Set([lib[1], lib[2]]));
  });

  it("Skilled Animator: target artifact becomes a 5/5 artifact creature, keeping its abilities, until Animator leaves (CR 611.2b)", () => {
    const { s: s0, ap, ids } = setup([skilledAnimator()]);
    const ring = putOnBattlefield(s0, ap, solRing());
    let s = settle(castNow(s0, ap, ids[0]!), { me: ap });
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(ring)] }), { me: ap });
    expect(types(s, ring).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(pt(s, ring)).toBe("5/5");
    expect(abilitiesOf(s, s.objects[ring]!).mana.length).toBeGreaterThan(0);
    // Animator leaves: Sol Ring is just an artifact again.
    kill(s, ids[0]!);
    expect(types(s, ring).types).not.toContain("Creature");
  });

  it("Unctus's Retrofitter: up to one target artifact becomes a 4/4 artifact creature; counters still apply (rulings); none chosen, nothing", () => {
    const { s: s0, ap, ids } = setup([unctussRetrofitter(), unctussRetrofitter()]);
    const thopter = putOnBattlefield(s0, ap, ornithopter());
    s0.objects[thopter]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s0);
    let s = settle(castNow(s0, ap, ids[0]!), { me: ap });
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(thopter)] }), { me: ap });
    expect(pt(s, thopter)).toBe("5/5");
    expect(objHasKeyword(s, s.objects[thopter]!, "Flying")).toBe(true);
    s = settle(castNow(s, ap, ids[1]!), { me: ap });
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "none" }] }), { me: ap });
    expect(s.stack).toHaveLength(0);
    kill(s, ids[0]!);
    expect(pt(s, thopter)).toBe("1/3");
  });

  it("Awakener Druid: target Forest becomes a 4/5 green Treefolk creature that's still a land (a Forest), until Druid leaves", () => {
    const { s: s0, ap, ids } = setup([awakenerDruid()]);
    const forestId = s0.battlefield.find((x) => s0.objects[x]!.controller === ap && characteristics(s0, s0.objects[x]!).subtypes.includes("Forest") && !s0.objects[x]!.tapped)!;
    let s = settle(castNow(s0, ap, ids[0]!), { me: ap });
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(forestId)] }), { me: ap });
    const c = types(s, forestId);
    expect(c.types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    expect(c.subtypes).toEqual(expect.arrayContaining(["Forest", "Treefolk"]));
    expect(c.colors).toEqual(["G"]);
    expect(pt(s, forestId)).toBe("4/5");
    kill(s, ids[0]!);
    expect(types(s, forestId).types).toEqual(["Land"]);
  });

  it("Sealock Monster: when it becomes monstrous, target land becomes an Island in addition to its other types, for good (rulings)", () => {
    const { s: s0, ap, ids } = setup([]);
    void ids;
    const monster = putOnBattlefield(s0, ap, sealockMonster());
    const plainsId = s0.battlefield.find((x) => s0.objects[x]!.controller === ap && characteristics(s0, s0.objects[x]!).subtypes.includes("Plains"))!;
    s0.players[ap]!.manaPool = { ...s0.players[ap]!.manaPool, U: 2, C: 5 };
    let s = settle(activateNow(s0, ap, monster, abIndex(s0, monster, /Monstrosity/)), { me: ap });
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(plainsId)] }), { me: ap });
    expect(pt(s, monster)).toBe("8/8");
    expect(types(s, plainsId).subtypes).toEqual(expect.arrayContaining(["Plains", "Island"]));
    kill(s, monster);
    s = passUntil(s, "upkeep", others(s, ap)[0]);
    expect(types(s, plainsId).subtypes).toEqual(expect.arrayContaining(["Plains", "Island"]));
  });

  it("Navigator's Compass: target land you control becomes the basic land type of your choice in addition to its other types until end of turn", () => {
    const { s: s0, ap, ids } = setup([]);
    void ids;
    const compass = putOnBattlefield(s0, ap, navigatorsCompass());
    const plainsId = s0.battlefield.find((x) => s0.objects[x]!.controller === ap && characteristics(s0, s0.objects[x]!).subtypes.includes("Plains"))!;
    let s = settle(activateNow(s0, ap, compass, 0, [tgt(plainsId)]), { me: ap });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Island" }), { me: ap });
    expect(types(s, plainsId).subtypes).toEqual(["Plains", "Island"]);
    // It taps for {U} now, and still for {W} (CR 305.6).
    const mana = manaAbilitiesOn(s, s.objects[plainsId]!).map((m) => JSON.stringify(m));
    expect(mana.some((m) => m.includes('"U"'))).toBe(true);
    expect(mana.some((m) => m.includes('"W"'))).toBe(true);
    s = passUntil(s, "upkeep", others(s, ap)[0]);
    expect(types(s, plainsId).subtypes).toEqual(["Plains"]);
  });

  it("Galion, Elvenking's Butler: up to one other creature's base power and toughness become Galion's actual ones, locked in (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const galion = putOnBattlefield(s0, ap, galionElvenkingsButler());
    s0.objects[galion]!.counters["+1/+1"] = 1;
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[b]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s0);
    let s = goUntil(s0, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: galion, defender: opp }] });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    // Not Galion itself.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(galion)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(b)] }), { me: ap });
    // Galion is 5/5: the Bear's base becomes 5/5, its counter on top (CR 613.4b, c).
    expect(pt(s, b)).toBe("6/6");
    s.objects[galion]!.counters["+1/+1"] = 3;
    invalidateCharacteristics(s);
    expect(pt(s, b)).toBe("6/6");
  });

  it("Exuberant Wolfbear: you may have target Human's base power and toughness become its own, chosen as it resolves (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const wolfbear = putOnBattlefield(s0, ap, exuberantWolfbear());
    const human = putOnBattlefield(s0, ap, eliteVanguard());
    const b = putOnBattlefield(s0, ap, bear());
    let s = goUntil(s0, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: wolfbear, defender: opp }] });
    // Only a Human you control.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(b)] })).toThrow();
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(human)] });
    const yes = settle(s, { may: true });
    expect(pt(yes, human)).toBe("4/4");
    const no = settle(s, { may: false });
    expect(pt(no, human)).toBe("2/1");
  });

  it("Unruly Krasis: another target creature you control has base power and toughness X/X, X its power as it resolves", () => {
    const { s: s0, ap, opp } = setup([]);
    const krasis = putOnBattlefield(s0, ap, unrulyKrasis());
    s0.objects[krasis]!.counters["+1/+1"] = 3;
    const b = putOnBattlefield(s0, ap, bear());
    invalidateCharacteristics(s0);
    let s = goUntil(s0, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: krasis, defender: opp }] });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(krasis)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(b)] }), { may: true });
    expect(pt(s, b)).toBe("7/7");
    s = passUntil(s, "upkeep", others(s, ap)[0]);
    expect(pt(s, b)).toBe("2/2");
  });

  it("Master of Winds: whenever you cast an instant, sorcery, or Wizard spell, you may have it become 4/1 or 1/4, or neither (rulings)", () => {
    const { s: s0, ap, ids } = setup([opt(), opt(), opt()]);
    const master = putOnBattlefield(s0, ap, masterOfWinds());
    let s = settle(castNow(s0, ap, ids[0]!), { me: ap });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { me: ap });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "either", player: ap });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "0" }), { me: ap });
    while (s.pending?.kind === "arrangeTop") s = settle(act(s, { type: "arrangeTop", player: ap, top: s.players[ap]!.library.slice(0, 1), away: [] }), { me: ap });
    expect(pt(s, master)).toBe("4/1");
    s = settle(castNow(s, ap, ids[1]!), { me: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { me: ap });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "1" }), { me: ap });
    while (s.pending?.kind === "arrangeTop") s = settle(act(s, { type: "arrangeTop", player: ap, top: s.players[ap]!.library.slice(0, 1), away: [] }), { me: ap });
    expect(pt(s, master)).toBe("1/4");
    s = settle(castNow(s, ap, ids[2]!), { me: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), { me: ap });
    while (s.pending?.kind === "arrangeTop") s = settle(act(s, { type: "arrangeTop", player: ap, top: s.players[ap]!.library.slice(0, 1), away: [] }), { me: ap });
    expect(pt(s, master)).toBe("1/4");
  });

  it("Precognition: at your upkeep, look at the top card of target opponent's library and you may put it on the bottom", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, precognition());
    emptyHand(s0, ap);
    let s = goUntil(s0, (x) => x.step === "upkeep" && x.activePlayer === ap && (!!x.pending || x.stack.length > 0 || x.triggerQueue.length > 0));
    const top = s.players[opp]!.library[0]!;
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] });
    s = settle(s, { may: true });
    expect(s.players[opp]!.library[s.players[opp]!.library.length - 1]).toBe(top);
  });

  it("Elemental Appeal: a 7/1 trample haste token exiled at the next end step; kicked, it gets +7/+0 until end of turn (the token stays 7/1, rulings)", () => {
    const { s: s0, ap, ids } = setup([elementalAppeal(), elementalAppeal()]);
    poolOnly(s0, ap, { R: 4 });
    let s = settle(castNow(s0, ap, ids[0]!));
    const token = s.battlefield.find((x) => s.objects[x]!.isToken && s.objects[x]!.controller === ap)!;
    expect(pt(s, token)).toBe("7/1");
    expect(objHasKeyword(s, s.objects[token]!, "Trample") && objHasKeyword(s, s.objects[token]!, "Haste")).toBe(true);
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, R: 4, C: 5 };
    s = settle(castNow(s, ap, ids[1]!, [], { kicks: [0] }));
    const kicked = s.battlefield.find((x) => s.objects[x]!.isToken && x !== token)!;
    expect(pt(s, kicked)).toBe("14/1");
    s = goUntil(s, (x) => x.step === "cleanup" || x.activePlayer !== ap);
    expect(zone(s, token)).not.toBe("battlefield");
    expect(zone(s, kicked)).not.toBe("battlefield");
  });

  it("Arm the Cathars: +3/+3, +2/+2 and +1/+1 to three different creatures, all with vigilance; the same creature twice isn't allowed (rulings)", () => {
    const { s: s0, ap, ids } = setup([armTheCathars()]);
    const [a, b, c] = [putOnBattlefield(s0, ap, bear()), putOnBattlefield(s0, ap, bear()), putOnBattlefield(s0, ap, bear())];
    expect(planCast(s0, ap, ids[0]!, [tgt(a), tgt(a), { kind: "none" }])).toBeNull();
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(a), tgt(b), tgt(c)]));
    expect([pt(s, a), pt(s, b), pt(s, c)]).toEqual(["5/5", "4/4", "3/3"]);
    expect([a, b, c].every((x) => objHasKeyword(s, s.objects[x]!, "Vigilance"))).toBe(true);
    // Just one target: still fine.
    const one = settle(castNow(s0, ap, ids[0]!, [tgt(a), { kind: "none" }, { kind: "none" }]));
    expect(pt(one, a)).toBe("5/5");
  });

  it("Nightcreep: creatures become black and lands become Swamps until end of turn; one entering later isn't affected (rulings)", () => {
    const { s: s0, ap, ids } = setup([nightcreep()]);
    const b = putOnBattlefield(s0, ap, bear());
    const plainsId = s0.battlefield.find((x) => s0.objects[x]!.controller === ap && characteristics(s0, s0.objects[x]!).subtypes.includes("Plains"))!;
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(types(s, b).colors).toEqual(["B"]);
    expect(types(s, plainsId).subtypes).toEqual(["Swamp"]);
    const later = putOnBattlefield(s, ap, bear());
    expect(types(s, later).colors).toEqual(["G"]);
    s = passUntil(s, "upkeep", others(s, ap)[0]);
    expect(types(s, b).colors).toEqual(["G"]);
    expect(types(s, plainsId).subtypes).toEqual(["Plains"]);
  });

  it("Concussive Bolt: 4 damage; with three artifacts, creatures that player controls can't block this turn, later ones too (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([concussiveBolt(), concussiveBolt()]);
    const blocker = putOnBattlefield(s0, opp, bear());
    // Fewer than three artifacts: they can block.
    let s = settle(castNow(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    expect(life(s, opp)).toBe(36);
    expect(s.cantBlockThisTurn ?? []).toHaveLength(0);
    for (let i = 0; i < 3; i++) putOnBattlefield(s, ap, ornithopter());
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, R: 2, C: 3 };
    s = settle(castNow(s, ap, ids[1]!, [{ kind: "player", id: opp }]));
    expect(life(s, opp)).toBe(32);
    const attacker = putOnBattlefield(s, ap, bear());
    const late = putOnBattlefield(s, opp, bear());
    s = goUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker, defender: opp }] });
    s = goUntil(s, (x) => x.pending?.kind === "declareBlockers");
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker, attacker }] })).toThrow();
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: late, attacker }] })).toThrow();
  });

  it("Concussive Bolt: at a planeswalker, its controller's creatures can't block", () => {
    const { s: s0, ap, opp, ids } = setup([concussiveBolt()]);
    const jace = putOnBattlefield(s0, opp, jaceBeleren());
    s0.objects[jace]!.counters.loyalty = 4;
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, ap, ornithopter());
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(jace)]));
    expect(zone(s, jace)).toBe("graveyard");
    expect(s.cantBlockThisTurn?.[0]?.filter).toMatchObject({ controlledBy: opp });
  });

  it("Vindictive Triumph: mana value 3 or less comes back tapped under your control and is exiled at the next end step; more stays exiled", () => {
    const { s: s0, ap, opp, ids } = setup([vindictiveTriumph(), vindictiveTriumph()]);
    const b = putOnBattlefield(s0, opp, bear());
    const dragon = putOnBattlefield(s0, opp, shivanDragon());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(dragon)]));
    expect(zone(s, dragon)).toBe("exile");
    expect(s.battlefield.some((x) => s.cards[s.objects[x]!.cardId]!.name === "Shivan Dragon")).toBe(false);
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, W: 1, B: 2 };
    s = settle(castNow(s, ap, ids[1]!, [tgt(b)]));
    const back = s.battlefield.find((x) => s.cards[s.objects[x]!.cardId]!.name === "Grizzly Bears" && s.objects[x]!.owner === opp)!;
    expect(back).toBeDefined();
    expect(controllerOf(s, s.objects[back]!)).toBe(ap);
    expect(s.objects[back]!.tapped).toBe(true);
    s = goUntil(s, (x) => x.activePlayer !== ap);
    expect(s.battlefield.includes(back)).toBe(false);
    expect(s.players[opp]!.exile.length).toBeGreaterThan(0);
  });

  it("Phantasmal Form: up to two creatures become 3/3 flying blue Illusions in addition, then draw; with no targets, just the draw (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([phantasmalForm(), phantasmalForm()]);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, opp, bear());
    const hand = s0.players[ap]!.hand.length;
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(a), tgt(b)]));
    for (const x of [a, b]) {
      expect(pt(s, x)).toBe("3/3");
      expect(objHasKeyword(s, s.objects[x]!, "Flying")).toBe(true);
      expect(types(s, x).colors.sort()).toEqual(["G", "U"]);
      expect(types(s, x).subtypes).toEqual(expect.arrayContaining(["Bear", "Illusion"]));
    }
    expect(s.players[ap]!.hand.length).toBe(hand);
    s = settle(castNow(s, ap, ids[1]!, [{ kind: "none" }, { kind: "none" }]));
    expect(s.players[ap]!.hand.length).toBe(hand);
    s = passUntil(s, "upkeep", others(s, ap)[0]);
    expect(pt(s, a)).toBe("2/2");
  });

  it("Rise to Glory: a creature card, then an Aura card that can enchant the creature returned first (rulings, CR 303.4f)", () => {
    const { s: s0, ap, ids } = setup([riseToGlory()]);
    const b = toZone(s0, ap, bear({ name: "Glory Bear" }), "graveyard");
    const aura = toZone(s0, ap, holyStrength(), "graveyard");
    putOnBattlefield(s0, others(s0, ap)[0]!, bear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(b), tgt(aura)], [0, 1])), { me: ap });
    const bear2 = s.battlefield.find((x) => s.cards[s.objects[x]!.cardId]!.name === "Glory Bear")!;
    expect(bear2).toBeDefined();
    // Its controller chooses what it enchants as it enters (CR 303.4f): the Bear that just returned is one choice.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "enchant", player: ap });
    expect((s.pending as { options: string[] }).options).toContain(bear2);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: bear2 }));
    const holy = s.battlefield.find((x) => s.cards[s.objects[x]!.cardId]!.name === "Holy Strength")!;
    expect(s.objects[holy]!.attachedTo).toBe(bear2);
    expect(pt(s, bear2)).toBe("3/4");
  });

  it("Brotherhood Outcast: return an Aura card with mana value 3 or less from your graveyard to the battlefield, attached to what you choose", () => {
    const { s: s0, ap, ids } = setup([brotherhoodOutcast()]);
    const b = putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, others(s0, ap)[0]!, bear());
    const aura = toZone(s0, ap, holyStrength(), "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: ap });
    if (s.pending?.kind === "chooseModes" || s.pending?.kind === "chooseOption") {
      const p = s.pending as { kind: string };
      if (p.kind === "chooseModes") s = settle(act(s, { type: "chooseModes", player: ap, modes: [0] } as Action), { me: ap });
    }
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(aura)] }), { me: ap });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "enchant", player: ap });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: b }));
    expect(pt(s, b)).toBe("3/4");
  });

  it("Cabal Conditioning: any number of target players each discard cards equal to the greatest mana value among permanents you control", () => {
    const { s: s0, ap, ids } = setup([cabalConditioning()]);
    putOnBattlefield(s0, ap, solRing());
    putOnBattlefield(s0, ap, shivanDragon());
    const [o1, o2] = others(s0, ap);
    for (const o of [o1!, o2!]) for (let i = 0; i < 8; i++) toZone(s0, o, bear(), "hand");
    const before = [o1!, o2!].map((o) => s0.players[o]!.hand.length);
    const s = settle(castNow(s0, ap, ids[0]!, [{ kind: "player", id: o1! }, { kind: "player", id: o2! }]));
    expect([o1!, o2!].map((o) => s.players[o]!.hand.length)).toEqual(before.map((n) => n - 6));
  });

  it("Dizzying Gaze: the enchanted creature deals the damage, only to a creature with flying", () => {
    const { s: s0, ap, opp, ids } = setup([dizzyingGaze()]);
    const b = putOnBattlefield(s0, ap, bear({ name: "Deadly Bear", keywords: ["Deathtouch"], oracleText: "Deathtouch" }));
    const drake = putOnBattlefield(s0, opp, shivanDragon());
    const walker = putOnBattlefield(s0, opp, bear());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(b)]));
    const gaze = ids[0]!;
    expect(s.objects[gaze]!.attachedTo).toBe(b);
    expect(planActivate(s, ap, gaze, 0, [tgt(walker)])).toBeNull();
    s = settle(activateNow(s, ap, gaze, 0, [tgt(drake)]));
    // 1 damage from a creature with deathtouch: the Dragon dies (CR 702.2b).
    expect(zone(s, drake)).toBe("graveyard");
  });
});
