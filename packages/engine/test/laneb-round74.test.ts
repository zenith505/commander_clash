// Lane B, round 74: unsupported cards from the bottom of the popularity list (`npm run popular -- --least`): abilities an
// Equipment or Aura gives that name it ("Sacrifice Blazing Torch", "Unattach Leonin Bola", "Return Trusty Boomerang to its
// owner's hand", "arrow counters on Archery Training"), and one-line templates.

import { describe, expect, it } from "vitest";
import { act, card, forest, pt, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, abilityProblem, blockWithoutCompany, botActions, characteristics, destroyPermanent, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";
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
/** Passes priority (stopping at `me`'s questions) until `me` has a question or everything has resolved. */
const passUntilAsked = (s: GameState, me: PlayerId) => {
  s = settle(s, { me });
  for (let i = 0; i < 20 && !s.pending && s.stack.length; i++) s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }), { me });
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
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error("never got there");
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices: CostChoices = {}, x?: number) => run(s, planCast(s, pid, id, targets, undefined, "auto", x, choices));
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
/** Ready to attack or tap: not summoning sick. */
const ready = (s: GameState, id: string) => {
  s.objects[id]!.controlledSinceTurn = -1;
  return id;
};
const onField = (s: GameState, name: string) => s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === name)!;


// Real oracle text (Scryfall).
const okk = (): CardDef => ({"oracleId":"f835a8d3-e117-4669-9952-6e9ce13b35fa","name":"Okk","manaCost":"{1}{R}","cmc":2,"typeLine":"Creature — Goblin","supertypes":[],"types":["Creature"],"subtypes":["Goblin"],"oracleText":"This creature can't attack unless a creature with greater power also attacks.\nThis creature can't block unless a creature with greater power also blocks.","power":"4","toughness":"4","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/f/5fecbdbc-dcfb-42ee-956c-a508db6eaafa.jpg?1783946326","artUrl":"https://cards.scryfall.io/art_crop/front/5/f/5fecbdbc-dcfb-42ee-956c-a508db6eaafa.jpg?1783946326","commanderLegal":"legal","set":"usg","releasedAt":"1998-10-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const strongarmTactics = (): CardDef => ({"oracleId":"04ec6f72-8b7e-487b-b075-84276cd6ecfd","name":"Strongarm Tactics","manaCost":"{1}{B}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Each player discards a card. Then each player who didn't discard a creature card this way loses 4 life.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/7/57dcf434-5c67-440a-8b67-2df7307e92bd.jpg?1783945062","artUrl":"https://cards.scryfall.io/art_crop/front/5/7/57dcf434-5c67-440a-8b67-2df7307e92bd.jpg?1783945062","commanderLegal":"legal","set":"ons","releasedAt":"2002-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const lifecraftAwakening = (): CardDef => ({"oracleId":"8919c8dd-d3b3-406f-a387-44cc1b6d92f3","name":"Lifecraft Awakening","manaCost":"{X}{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Put X +1/+1 counters on target artifact you control. If it isn't a creature or Vehicle, it becomes a 0/0 Construct artifact creature.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/3/63bc60c8-f0a3-4bbf-b570-7d98d0a3e2b0.jpg?1783936744","artUrl":"https://cards.scryfall.io/art_crop/front/6/3/63bc60c8-f0a3-4bbf-b570-7d98d0a3e2b0.jpg?1783936744","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const pedanticLearning = (): CardDef => ({"oracleId":"194c0ace-4c5d-4698-a924-901bdef99a5f","name":"Pedantic Learning","manaCost":"{U}{U}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a land card is put into your graveyard from your library, you may pay {1}. If you do, draw a card.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/7/67445332-0b56-4fec-8dcd-bb9a87194db5.jpg?1783945259","artUrl":"https://cards.scryfall.io/art_crop/front/6/7/67445332-0b56-4fec-8dcd-bb9a87194db5.jpg?1783945259","commanderLegal":"legal","set":"ody","releasedAt":"2001-10-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const azoriusAethermage = (): CardDef => ({"oracleId":"12971527-aa8e-4517-9b00-71474caebfd0","name":"Azorius Aethermage","manaCost":"{1}{W}{U}","cmc":3,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"Whenever a permanent is returned to your hand, you may pay {1}. If you do, draw a card.","power":"1","toughness":"1","colors":["U","W"],"colorIdentity":["U","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/b/6b640ff8-8baa-4069-b5a9-8a4fb22a056e.jpg?1783943405","artUrl":"https://cards.scryfall.io/art_crop/front/6/b/6b640ff8-8baa-4069-b5a9-8a4fb22a056e.jpg?1783943405","commanderLegal":"legal","set":"dis","releasedAt":"2006-05-05","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const warpedDevotion = (): CardDef => ({"oracleId":"22c49415-e8d2-4b4c-b021-57ee54670f86","name":"Warped Devotion","manaCost":"{2}{B}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a permanent is returned to a player's hand, that player discards a card.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/b/3bce620f-799a-4ad8-9edb-6fb3d9ea1cc6.jpg?1783945618","artUrl":"https://cards.scryfall.io/art_crop/front/3/b/3bce620f-799a-4ad8-9edb-6fb3d9ea1cc6.jpg?1783945618","commanderLegal":"legal","set":"pls","releasedAt":"2001-02-05","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const blazingTorch = (): CardDef => ({"oracleId":"cd3d1e5d-db12-4878-92a2-23eb8d23eaf3","name":"Blazing Torch","manaCost":"{1}","cmc":1,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature can't be blocked by Vampires or Zombies.\nEquipped creature has \"{T}, Sacrifice Blazing Torch: Blazing Torch deals 2 damage to any target.\"\nEquip {1} ({1}: Attach to target creature you control. Equip only as a sorcery.)","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/4/e/4e14fc60-f300-40f0-b712-4e339dc27929.jpg?1783940905","artUrl":"https://cards.scryfall.io/art_crop/front/4/e/4e14fc60-f300-40f0-b712-4e339dc27929.jpg?1783940905","commanderLegal":"legal","set":"isd","releasedAt":"2011-09-30","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const ninjasKunai = (): CardDef => ({"oracleId":"fa5aefaf-432f-41d0-8e54-0e8b7bc7ba98","name":"Ninja's Kunai","manaCost":"{1}","cmc":1,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature has \"{1}, {T}, Sacrifice Ninja's Kunai: Ninja's Kunai deals 3 damage to any target.\"\nEquip {1} ({1}: Attach to target creature you control. Equip only as a sorcery.)","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/a/f/af6ae567-c77a-416a-b609-4df3d0dd2e18.jpg?1783923824","artUrl":"https://cards.scryfall.io/art_crop/front/a/f/af6ae567-c77a-416a-b609-4df3d0dd2e18.jpg?1783923824","commanderLegal":"legal","set":"neo","releasedAt":"2022-02-18","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const deconstructionHammer = (): CardDef => ({"oracleId":"ccc2eb6d-21cf-45cf-b4e4-4b2a2517136a","name":"Deconstruction Hammer","manaCost":"{W}","cmc":1,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +1/+1 and has \"{3}, {T}, Sacrifice Deconstruction Hammer: Destroy target artifact or enchantment.\"\nEquip {1} ({1}: Attach to target creature you control. Equip only as a sorcery.)","colors":["W"],"colorIdentity":["W"],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/0/c/0c7ba382-18c4-4833-b3d2-bd469ae2ad77.jpg?1783913815","artUrl":"https://cards.scryfall.io/art_crop/front/0/c/0c7ba382-18c4-4833-b3d2-bd469ae2ad77.jpg?1783913815","commanderLegal":"legal","set":"lci","releasedAt":"2023-11-17","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const citizensCrowbar = (): CardDef => ({"oracleId":"64c7e03d-ba38-4979-8889-9bf0e7b8c66e","name":"Citizen's Crowbar","manaCost":"{1}{W}","cmc":2,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"When this Equipment enters, create a 1/1 green and white Citizen creature token, then attach this Equipment to it.\nEquipped creature gets +1/+1 and has \"{W}, {T}, Sacrifice Citizen's Crowbar: Destroy target artifact or enchantment.\"\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)","colors":["W"],"colorIdentity":["W"],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/b/6/b68896f5-1e13-400a-a327-b6c6f00858b7.jpg?1783923162","artUrl":"https://cards.scryfall.io/art_crop/front/b/6/b68896f5-1e13-400a-a327-b6c6f00858b7.jpg?1783923162","commanderLegal":"legal","set":"snc","releasedAt":"2022-04-29","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const leoninBola = (): CardDef => ({"oracleId":"d5f72164-441e-4e04-8b2b-0d6ab618d22e","name":"Leonin Bola","manaCost":"{1}","cmc":1,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature has \"{T}, Unattach Leonin Bola: Tap target creature.\"\nEquip {1} ({1}: Attach to target creature you control. Equip only as a sorcery.)","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/a/7/a7eab112-20a6-414f-84c9-678580485420.jpg?1783944422","artUrl":"https://cards.scryfall.io/art_crop/front/a/7/a7eab112-20a6-414f-84c9-678580485420.jpg?1783944422","commanderLegal":"legal","set":"dst","releasedAt":"2004-02-06","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const heartseeker = (): CardDef => ({"oracleId":"9ebd9ceb-05a4-4387-b63e-4c62ead2b98b","name":"Heartseeker","manaCost":"{4}","cmc":4,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +2/+1 and has \"{T}, Unattach Heartseeker: Destroy target creature.\"\nEquip {5} ({5}: Attach to target creature you control. Equip only as a sorcery.)","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/a/4/a4f33c08-f3c3-4015-970d-ac0530f97c9c.jpg?1783944422","artUrl":"https://cards.scryfall.io/art_crop/front/a/4/a4f33c08-f3c3-4015-970d-ac0530f97c9c.jpg?1783944422","commanderLegal":"legal","set":"dst","releasedAt":"2004-02-06","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const surestrikeTrident = (): CardDef => ({"oracleId":"bf09b97b-9387-4b94-a3fc-00080881f052","name":"Surestrike Trident","manaCost":"{2}","cmc":2,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature has first strike and \"{T}, Unattach Surestrike Trident: This creature deals damage equal to its power to target player or planeswalker.\"\nEquip {4} ({4}: Attach to target creature you control. Equip only as a sorcery.)","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/c/f/cfcb621d-5831-4b7c-b3e1-c321a6e10392.jpg?1783944417","artUrl":"https://cards.scryfall.io/art_crop/front/c/f/cfcb621d-5831-4b7c-b3e1-c321a6e10392.jpg?1783944417","commanderLegal":"legal","set":"dst","releasedAt":"2004-02-06","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const blindingPowder = (): CardDef => ({"oracleId":"75e13f7f-aded-405c-97ce-124fa0cb1929","name":"Blinding Powder","manaCost":"{1}","cmc":1,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature has \"Unattach Blinding Powder: Prevent all combat damage that would be dealt to this creature this turn.\"\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/f/0/f097fbb8-0db5-4ceb-8972-dcd21b3fb4d5.jpg?1783944179","artUrl":"https://cards.scryfall.io/art_crop/front/f/0/f097fbb8-0db5-4ceb-8972-dcd21b3fb4d5.jpg?1783944179","commanderLegal":"legal","set":"bok","releasedAt":"2005-02-04","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const trustyBoomerang = (): CardDef => ({"oracleId":"3c032e74-69c6-48ca-95d4-51aa3d894c14","name":"Trusty Boomerang","manaCost":"{1}","cmc":1,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature has \"{1}, {T}: Tap target creature. Return Trusty Boomerang to its owner's hand.\"\nEquip {1} ({1}: Attach to target creature you control. Equip only as a sorcery.)","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/d/f/df99a166-6d58-4d92-9037-2fdfbaf65629.jpg?1783904914","artUrl":"https://cards.scryfall.io/art_crop/front/d/f/df99a166-6d58-4d92-9037-2fdfbaf65629.jpg?1783904914","commanderLegal":"legal","set":"tla","releasedAt":"2025-11-21","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const razorBoomerang = (): CardDef => ({"oracleId":"f2649e48-4252-43f3-bd1e-c4c6fcb0aa3a","name":"Razor Boomerang","manaCost":"{3}","cmc":3,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature has \"{T}, Unattach Razor Boomerang: It deals 1 damage to any target. Return Razor Boomerang to its owner's hand.\"\nEquip {2}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/4/1/41526ad7-730d-44ad-bd19-e1b8a2717cf7.jpg?1783942039","artUrl":"https://cards.scryfall.io/art_crop/front/4/1/41526ad7-730d-44ad-bd19-e1b8a2717cf7.jpg?1783942039","commanderLegal":"legal","set":"wwk","releasedAt":"2010-02-05","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const sunfireTorch = (): CardDef => ({"oracleId":"d2da26d6-b0f7-4af0-9ce8-fb8d82fe2d85","name":"Sunfire Torch","manaCost":"{R}","cmc":1,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +1/+0 and has \"Whenever this creature attacks, you may sacrifice Sunfire Torch. When you do, this creature deals 2 damage to any target.\"\nEquip {1} ({1}: Attach to target creature you control. Equip only as a sorcery.)","colors":["R"],"colorIdentity":["R"],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/b/b/bb040fc7-f728-4482-92af-9a320c03bb54.jpg?1783913755","artUrl":"https://cards.scryfall.io/art_crop/front/b/b/bb040fc7-f728-4482-92af-9a320c03bb54.jpg?1783913755","commanderLegal":"legal","set":"lci","releasedAt":"2023-11-17","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const spareDagger = (): CardDef => ({"oracleId":"d895df97-e7e7-4f15-a79b-0ce8f1a252d3","name":"Spare Dagger","manaCost":"{1}","cmc":1,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +1/+0 and has \"Whenever this creature attacks, you may sacrifice Spare Dagger. When you do, this creature deals 1 damage to any target.\"\nEquip {1} ({1}: Attach to target creature you control. Equip only as a sorcery.)","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/a/b/ab6b0291-00f8-45bf-9f3a-ee43739c2b77.jpg?1783926437","artUrl":"https://cards.scryfall.io/art_crop/front/a/b/ab6b0291-00f8-45bf-9f3a-ee43739c2b77.jpg?1783926437","commanderLegal":"legal","set":"afr","releasedAt":"2021-07-23","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const trickstersTalisman = (): CardDef => ({"oracleId":"17469f58-286e-4410-b717-5908d24eecdd","name":"Trickster's Talisman","manaCost":"{U}","cmc":1,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Invoke Duplicity — Equipped creature gets +1/+1 and has \"Whenever this creature deals combat damage to a player, you may sacrifice Trickster's Talisman. If you do, create a token that's a copy of this creature.\"\nEquip {2}","colors":["U"],"colorIdentity":["U"],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/3/3/33cb9973-c9ce-48f1-9972-651092624751.jpg?1783926505","artUrl":"https://cards.scryfall.io/art_crop/front/3/3/33cb9973-c9ce-48f1-9972-651092624751.jpg?1783926505","commanderLegal":"legal","set":"afr","releasedAt":"2021-07-23","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const rakdosRiteknife = (): CardDef => ({"oracleId":"43a2bd01-3fce-4191-a08a-1e379c7770b0","name":"Rakdos Riteknife","manaCost":"{2}","cmc":2,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +1/+0 for each blood counter on this Equipment and has \"{T}, Sacrifice a creature: Put a blood counter on Rakdos Riteknife.\"\n{B}{R}, Sacrifice this Equipment: Target player sacrifices a permanent of their choice for each blood counter on this Equipment.\nEquip {2}","colors":[],"colorIdentity":["B","R"],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/7/f/7fb6e10a-3df1-4c6f-bf4c-d4a2a0467c60.jpg?1783943382","artUrl":"https://cards.scryfall.io/art_crop/front/7/f/7fb6e10a-3df1-4c6f-bf4c-d4a2a0467c60.jpg?1783943382","commanderLegal":"legal","set":"dis","releasedAt":"2006-05-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const archeryTraining = (): CardDef => ({"oracleId":"acab4fa9-d9ab-4a89-a50f-0cee9d7ca0c3","name":"Archery Training","manaCost":"{W}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nAt the beginning of your upkeep, you may put an arrow counter on this Aura.\nEnchanted creature has \"{T}: This creature deals X damage to target attacking or blocking creature, where X is the number of arrow counters on Archery Training.\"","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/1/5/151232e6-68cc-4cac-a532-9ade8e925961.jpg?1783946086","artUrl":"https://cards.scryfall.io/art_crop/front/1/5/151232e6-68cc-4cac-a532-9ade8e925961.jpg?1783946086","commanderLegal":"legal","set":"uds","releasedAt":"1999-06-07","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const unsummon = (): CardDef => ({"oracleId":"837182db-1bf3-4a2c-bd01-1af9d9873561","name":"Unsummon","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Return target creature to its owner's hand.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddad9f16-52d5-49de-82b0-b1a5294a9c44.jpg?1789556722","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddad9f16-52d5-49de-82b0-b1a5294a9c44.jpg?1789556722","commanderLegal":"legal","set":"fra","releasedAt":"2026-10-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const thoughtScour = (): CardDef => ({"oracleId":"83101ba8-a569-4827-8c53-9ca0dfcd59a7","name":"Thought Scour","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target player mills two cards.\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":["Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/4/a/4afee6b3-55a4-44e5-b08c-85e0c813cd09.jpg?1783921909","artUrl":"https://cards.scryfall.io/art_crop/front/4/a/4afee6b3-55a4-44e5-b08c-85e0c813cd09.jpg?1783921909","commanderLegal":"legal","set":"2x2","releasedAt":"2022-07-08","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const sleekSchooner = (): CardDef => ({"oracleId":"3284010f-aeb2-493e-9252-3b953a192a94","name":"Sleek Schooner","manaCost":"{3}","cmc":3,"typeLine":"Artifact — Vehicle","supertypes":[],"types":["Artifact"],"subtypes":["Vehicle"],"oracleText":"Crew 1 (Tap any number of creatures you control with total power 1 or more: This Vehicle becomes an artifact creature until end of turn.)","power":"4","toughness":"3","colors":[],"colorIdentity":[],"keywords":["Crew"],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/767e2bfb-bcf5-442c-b092-bdb1f4f13561.jpg?1783935700","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/767e2bfb-bcf5-442c-b092-bdb1f4f13561.jpg?1783935700","commanderLegal":"legal","set":"xln","releasedAt":"2017-09-29","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const crawWurm = (): CardDef => ({"oracleId":"6a462a69-3e42-41de-a3aa-a488d9f38d69","name":"Craw Wurm","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Creature — Wurm","supertypes":[],"types":["Creature"],"subtypes":["Wurm"],"oracleText":"","power":"6","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","artUrl":"https://cards.scryfall.io/art_crop/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const telJiladChosen = (): CardDef => ({"oracleId":"de6854d1-bdb0-4b9a-b442-08d4d90a538d","name":"Tel-Jilad Chosen","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Elf Warrior","supertypes":[],"types":["Creature"],"subtypes":["Elf","Warrior"],"oracleText":"Protection from artifacts","power":"2","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":["Protection"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/eefea84f-d657-491d-b60d-63e6a61e9eb2.jpg?1783944532","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/eefea84f-d657-491d-b60d-63e6a61e9eb2.jpg?1783944532","commanderLegal":"legal","set":"mrd","releasedAt":"2003-10-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
/** Clears every player's hand (into exile), so whole-turn and discard tests start from nothing. */
const emptyHands = (s: GameState) => {
  for (const pid of s.turnOrder) {
    const p = s.players[pid]!;
    for (const id of p.hand) {
      s.objects[id]!.zone = "exile";
      p.exile.push(id);
    }
    p.hand = [];
  }
};
/** Puts `def` onto the battlefield under `pid`, attached to `to`. */
const attach = (s: GameState, pid: PlayerId, def: CardDef, to: string) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.attachedTo = to;
  invalidateCharacteristics(s);
  return id;
};
/** The index of `id`'s activated ability whose text matches `re` (a granted one shows its giver by name). */
const abIndex = (s: GameState, id: string, re: RegExp) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => re.test(a.text));
const activateNow = (s: GameState, pid: PlayerId, id: string, index: number, targets: TargetChoice[] = [], costs?: CostChoices) => run(s, planActivate(s, pid, id, index, targets, undefined, undefined, undefined, costs));
/** Declares these attacks for the active player and plays on to the first question for `me` (or until combat ends). */
const attackWith = (s: GameState, attacks: { attacker: string; defender: PlayerId }[], me: PlayerId) => {
  s = goUntil(s, (x) => x.pending?.kind === "declareAttackers");
  s = act(s, { type: "declareAttackers", player: s.activePlayer, attacks });
  for (let i = 0; i < 400; i++) {
    const p = s.pending;
    if (p && p.player === me && p.kind !== "declareBlockers") return s;
    if (s.step === "end") return s;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const handSize = (s: GameState, pid: PlayerId) => s.players[pid]!.hand.length;

describe("Lane B round 74", () => {
  it("all of them are supported", () => {
    supported(okk(), strongarmTactics(), lifecraftAwakening(), pedanticLearning(), azoriusAethermage(), warpedDevotion(), blazingTorch(), ninjasKunai(), deconstructionHammer(), citizensCrowbar(), leoninBola(), heartseeker(), surestrikeTrident(), blindingPowder(), trustyBoomerang(), razorBoomerang(), sunfireTorch(), spareDagger(), trickstersTalisman(), rakdosRiteknife(), archeryTraining());
  });

  it("Okk: attacks only with another attacker of greater power, blocks only with another blocker of greater power (CR 508.1c, 509.1b)", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = ready(s0, putOnBattlefield(s0, ap, okk()));
    const hill = ready(s0, putOnBattlefield(s0, ap, hillGiant()));
    const wurm = ready(s0, putOnBattlefield(s0, ap, crawWurm()));
    const s = goUntil(s0, (x) => x.pending?.kind === "declareAttackers");
    const decl = (ids: string[]) => () => act(s, { type: "declareAttackers", player: ap, attacks: ids.map((attacker) => ({ attacker, defender: opp })) });
    expect(decl([k])).toThrow(/greater power/);
    // A 3/3 isn't greater than Okk's 4.
    expect(decl([k, hill])).toThrow(/greater power/);
    expect(decl([k, wurm])).not.toThrow();
    expect(decl([wurm])).not.toThrow();
    // Blocking: another blocker of greater power, in these blocks or one declared earlier this combat.
    expect(blockWithoutCompany(s, [{ blocker: k }], 0)).toMatch(/greater power/);
    expect(blockWithoutCompany(s, [{ blocker: k }, { blocker: hill }], 0)).toMatch(/greater power/);
    expect(blockWithoutCompany(s, [{ blocker: k }, { blocker: wurm }], 0)).toBeNull();
    s.objects[wurm]!.blocking = [hill];
    expect(blockWithoutCompany(s, [{ blocker: k }], 1)).toBeNull();
  });

  it("Strongarm Tactics: each player discards a card, then each player who didn't discard a creature card loses 4 life, you too", () => {
    const { s: s0, ap } = setup([]);
    emptyHands(s0);
    const [o1, o2, o3] = [1, 2, 3].map((i) => s0.turnOrder[(s0.turnOrder.indexOf(ap) + i) % 4]!);
    const t = toZone(s0, ap, strongarmTactics(), "hand");
    toZone(s0, ap, forest, "hand");
    toZone(s0, o1!, grizzlyBears(), "hand");
    toZone(s0, o2!, forest, "hand");
    const s = settle(castNow(s0, ap, t));
    expect(zone(s, t)).toBe("graveyard");
    for (const pid of s.turnOrder) expect(handSize(s, pid)).toBe(0);
    // A land, a creature, a land, nothing.
    expect(life(s, ap)).toBe(36);
    expect(life(s, o1!)).toBe(40);
    expect(life(s, o2!)).toBe(36);
    expect(life(s, o3!)).toBe(36);
  });

  it("Lifecraft Awakening: X +1/+1 counters, and a noncreature non-Vehicle artifact becomes a 0/0 Construct artifact creature (CR 205.1b)", () => {
    const { s: s0, ap } = setup([]);
    const b = putOnBattlefield(s0, ap, grizzlyBears());
    const torch = attach(s0, ap, blazingTorch(), b);
    const boat = putOnBattlefield(s0, ap, sleekSchooner());
    const thopter = putOnBattlefield(s0, ap, ornithopter());
    let s = s0;
    for (const [what, x] of [[torch, 3], [boat, 2], [thopter, 1]] as const) {
      const l = toZone(s, ap, lifecraftAwakening(), "hand");
      s = settle(castNow(s, ap, l, [tgt(what)], {}, x));
    }
    // The Equipment: a 3/3 Construct, still an Equipment (its other subtypes stay), so it falls off the creature (CR 301.5c).
    const c = characteristics(s, s.objects[torch]!);
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(c.subtypes).toEqual(expect.arrayContaining(["Equipment", "Construct"]));
    expect(pt(s, torch)).toBe("3/3");
    expect(s.objects[torch]!.attachedTo).toBeUndefined();
    // The Vehicle keeps its counters but isn't a creature (rulings); the artifact creature just gets the counters.
    expect(s.objects[boat]!.counters["+1/+1"]).toBe(2);
    expect(characteristics(s, s.objects[boat]!).types).not.toContain("Creature");
    expect(pt(s, thopter)).toBe("1/3");
    expect(characteristics(s, s.objects[thopter]!).subtypes).toContain("Thopter");
  });

  it("Pedantic Learning: each land card put into your graveyard from your library lets you pay {1} to draw a card", () => {
    const { s: s0, ap } = setup([]);
    emptyHands(s0);
    putOnBattlefield(s0, ap, pedanticLearning());
    toZone(s0, ap, forest, "library");
    toZone(s0, ap, forest, "library");
    const scour = toZone(s0, ap, thoughtScour(), "hand");
    s0.players[ap]!.manaPool.C = 2;
    const s = settle(castNow(s0, ap, scour, [ply(ap)]), { may: true });
    // Thought Scour's own card and one for each of the two Forests.
    expect(handSize(s, ap)).toBe(3);
    // Declined: only Thought Scour's card.
    const s1 = settle(castNow(s0, ap, scour, [ply(ap)]), { may: false });
    expect(handSize(s1, ap)).toBe(1);
  });

  it("Azorius Aethermage: a permanent returned to your hand, a token too, lets you pay {1} to draw; not one returned to another player's hand", () => {
    const { s: s0, ap, opp } = setup([]);
    emptyHands(s0);
    putOnBattlefield(s0, ap, azoriusAethermage());
    const mine = putOnBattlefield(s0, ap, grizzlyBears());
    const theirs = putOnBattlefield(s0, opp, grizzlyBears());
    s0.players[ap]!.manaPool.C = 1;
    let s = settle(castNow(s0, ap, toZone(s0, ap, unsummon(), "hand"), [tgt(mine)]), { may: true });
    // The Bears back in hand, and a card drawn.
    expect(handSize(s, ap)).toBe(2);
    s = settle(castNow(s, ap, toZone(s, ap, unsummon(), "hand"), [tgt(theirs)]), { may: true });
    expect(handSize(s, ap)).toBe(2);
    // A token returned to your hand triggers it too, before it ceases to exist (rulings).
    const token = putOnBattlefield(s, ap, grizzlyBears());
    s.objects[token]!.isToken = true;
    s.players[ap]!.manaPool.C = 1;
    s = settle(castNow(s, ap, toZone(s, ap, unsummon(), "hand"), [tgt(token)]), { may: true });
    expect(handSize(s, ap)).toBe(3);
  });

  it("Warped Devotion: whenever a permanent is returned to a player's hand, that player discards a card", () => {
    const { s: s0, ap, opp } = setup([]);
    emptyHands(s0);
    putOnBattlefield(s0, ap, warpedDevotion());
    const theirs = putOnBattlefield(s0, opp, grizzlyBears());
    toZone(s0, opp, forest, "hand");
    const s = settle(castNow(s0, ap, toZone(s0, ap, unsummon(), "hand"), [tgt(theirs)]));
    // They had the Forest and the Bears, and discarded one of them.
    expect(handSize(s, opp)).toBe(1);
    expect(s.players[opp]!.graveyard.length).toBe(1);
  });

  it("Blazing Torch: the creature's ability sacrifices the Torch, which deals the damage (rulings), only one its controller controls", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = ready(s0, putOnBattlefield(s0, ap, grizzlyBears()));
    const torch = attach(s0, ap, blazingTorch(), b);
    const i = abIndex(s0, b, /Sacrifice Blazing Torch/);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(abilitiesOf(s0, s0.objects[b]!).activated[i]!.text).toBe("{T}, Sacrifice Blazing Torch: Blazing Torch deals 2 damage to any target.");
    let s = activateNow(s0, ap, b, i, [ply(opp)]);
    // Sacrificed as the cost, before anything resolves.
    expect(zone(s, torch)).toBe("graveyard");
    expect(s.objects[b]!.tapped).toBe(true);
    s = settle(s);
    expect(life(s, opp)).toBe(38);
    // The Torch is the source: a creature with protection from artifacts can be targeted, but the damage is prevented.
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const b1 = ready(s1, putOnBattlefield(s1, ap1, grizzlyBears()));
    attach(s1, ap1, blazingTorch(), b1);
    const chosen = putOnBattlefield(s1, opp1, telJiladChosen());
    const s2 = settle(activateNow(s1, ap1, b1, abIndex(s1, b1, /Blazing Torch/), [tgt(chosen)]));
    expect(zone(s2, chosen)).toBe("battlefield");
    expect(s2.objects[chosen]!.damage).toBe(0);
  });

  it("Blazing Torch: another player's Torch on your creature can't be sacrificed; two Torches give two abilities, each its own", () => {
    const { s, ap, opp } = setup([]);
    const b = ready(s, putOnBattlefield(s, ap, grizzlyBears()));
    const theirs = attach(s, opp, blazingTorch(), b);
    expect(abilityProblem(s, ap, b, abIndex(s, b, /Blazing Torch/), [ply(opp)])).toMatch(/can't sacrifice/);
    s.objects[theirs]!.controller = ap;
    invalidateCharacteristics(s);
    const second = attach(s, ap, blazingTorch(), b);
    const abs = abilitiesOf(s, s.objects[b]!).activated.map((a, i) => [a, i] as const).filter(([a]) => /Blazing Torch/.test(a.text));
    expect(abs.length).toBe(2);
    const s1 = activateNow(s, ap, b, abs[1]![1], [ply(opp)]);
    expect(zone(s1, second)).toBe("graveyard");
    expect(zone(s1, theirs)).toBe("battlefield");
  });

  it("Ninja's Kunai, Deconstruction Hammer, Citizen's Crowbar: abilities that sacrifice the Equipment that gives them", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = ready(s0, putOnBattlefield(s0, ap, grizzlyBears()));
    const kunai = attach(s0, ap, ninjasKunai(), b);
    let s = settle(activateNow(s0, ap, b, abIndex(s0, b, /Ninja's Kunai/), [ply(opp)]));
    expect(zone(s, kunai)).toBe("graveyard");
    expect(life(s, opp)).toBe(37);
    const b2 = ready(s, putOnBattlefield(s, ap, grizzlyBears()));
    const hammer = attach(s, ap, deconstructionHammer(), b2);
    expect(pt(s, b2)).toBe("3/3");
    const art = putOnBattlefield(s, opp, ornithopter());
    s = settle(activateNow(s, ap, b2, abIndex(s, b2, /Deconstruction Hammer/), [tgt(art)]));
    expect(zone(s, hammer)).toBe("graveyard");
    expect(zone(s, art)).toBe("graveyard");
    expect(pt(s, b2)).toBe("2/2");
    // Citizen's Crowbar comes with a Citizen to carry it.
    const crowbar = toZone(s, ap, citizensCrowbar(), "hand");
    s = settle(castNow(s, ap, crowbar));
    const citizen = s.objects[crowbar]!.attachedTo!;
    expect(s.cards[s.objects[citizen]!.cardId]!.name).toBe("Citizen Token");
    expect(abIndex(s, citizen, /Citizen's Crowbar/)).toBeGreaterThanOrEqual(0);
  });

  it("Leonin Bola and Heartseeker: unattaching the Equipment is the cost; it stays on the battlefield, unattached", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = ready(s0, putOnBattlefield(s0, ap, grizzlyBears()));
    const bola = attach(s0, ap, leoninBola(), b);
    const foe = putOnBattlefield(s0, opp, hillGiant());
    let s = activateNow(s0, ap, b, abIndex(s0, b, /Leonin Bola/), [tgt(foe)]);
    expect(s.objects[bola]!.attachedTo).toBeUndefined();
    expect(zone(s, bola)).toBe("battlefield");
    expect(abIndex(s, b, /Leonin Bola/)).toBe(-1);
    s = settle(s);
    expect(s.objects[foe]!.tapped).toBe(true);
    // Heartseeker: +2/+1, then destroy target creature.
    const b2 = ready(s, putOnBattlefield(s, ap, grizzlyBears()));
    const seeker = attach(s, ap, heartseeker(), b2);
    expect(pt(s, b2)).toBe("4/3");
    s = settle(activateNow(s, ap, b2, abIndex(s, b2, /Heartseeker/), [tgt(foe)]));
    expect(zone(s, foe)).toBe("graveyard");
    expect(zone(s, seeker)).toBe("battlefield");
    expect(pt(s, b2)).toBe("2/2");
    // Only while it's attached to this creature.
    const b3 = ready(s, putOnBattlefield(s, ap, grizzlyBears()));
    attach(s, ap, heartseeker(), b3);
    const i3 = abIndex(s, b3, /Heartseeker/);
    s.objects[s.battlefield.find((id) => s.objects[id]!.attachedTo === b3)!]!.attachedTo = b2;
    expect(abilityProblem(s, ap, b3, i3, [tgt(b2)])).not.toBeNull();
  });

  it("Surestrike Trident and Blinding Powder: the creature deals damage equal to its power; prevent combat damage to it this turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const giant = ready(s0, putOnBattlefield(s0, ap, hillGiant()));
    attach(s0, ap, surestrikeTrident(), giant);
    expect(characteristics(s0, s0.objects[giant]!).keywords).toContain("First strike");
    let s = settle(activateNow(s0, ap, giant, abIndex(s0, giant, /Surestrike Trident/), [ply(opp)]));
    expect(life(s, opp)).toBe(37);
    expect(characteristics(s, s.objects[giant]!).keywords).not.toContain("First strike");
    // Blinding Powder: no {T} in the cost.
    const b = putOnBattlefield(s, ap, grizzlyBears());
    const powder = attach(s, ap, blindingPowder(), b);
    s = settle(activateNow(s, ap, b, abIndex(s, b, /Blinding Powder/)));
    expect(s.objects[powder]!.attachedTo).toBeUndefined();
    expect(s.objects[b]!.tapped).toBe(false);
    expect(characteristics(s, s.objects[b]!).preventDamage?.some((p) => p.to && p.combat === "only")).toBe(true);
  });

  it("Trusty Boomerang and Razor Boomerang: the Equipment returns to its owner's hand, if it's still on the battlefield (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = ready(s0, putOnBattlefield(s0, ap, grizzlyBears()));
    const trusty = attach(s0, ap, trustyBoomerang(), b);
    const foe = putOnBattlefield(s0, opp, hillGiant());
    let s = settle(activateNow(s0, ap, b, abIndex(s0, b, /Trusty Boomerang/), [tgt(foe)]));
    expect(s.objects[foe]!.tapped).toBe(true);
    expect(zone(s, trusty)).toBe("hand");
    // Razor Boomerang: unattached as the cost, it deals the damage and comes back.
    const b2 = ready(s, putOnBattlefield(s, ap, grizzlyBears()));
    const razor = attach(s, ap, razorBoomerang(), b2);
    s = settle(activateNow(s, ap, b2, abIndex(s, b2, /Razor Boomerang/), [ply(opp)]));
    expect(life(s, opp)).toBe(39);
    expect(zone(s, razor)).toBe("hand");
    // Destroyed before the ability resolves: still 1 damage, from the Boomerang as it last existed; nothing returns.
    const b3 = ready(s, putOnBattlefield(s, ap, grizzlyBears()));
    const razor2 = attach(s, ap, razorBoomerang(), b3);
    s = activateNow(s, ap, b3, abIndex(s, b3, /Razor Boomerang/), [ply(opp)]);
    destroyPermanent(s, s.objects[razor2]!, "test");
    s = settle(s);
    expect(life(s, opp)).toBe(38);
    expect(zone(s, razor2)).toBe("graveyard");
  });

  it("Sunfire Torch and Spare Dagger: when the creature attacks, you may sacrifice the Equipment; when you do, the creature deals the damage", () => {
    const { s: s0, ap, opp } = setup([]);
    emptyHands(s0);
    const b = ready(s0, putOnBattlefield(s0, ap, grizzlyBears()));
    const torch = attach(s0, ap, sunfireTorch(), b);
    expect(pt(s0, b)).toBe("3/2");
    let s = attackWith(s0, [{ attacker: b, defender: opp }], ap);
    expect(s.pending?.kind).toBe("chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(zone(s, torch)).toBe("graveyard");
    s = passUntilAsked(s, ap);
    expect(s.pending?.kind).toBe("chooseTargets");
    s = act(s, { type: "chooseTargets", player: ap, targets: [ply(s.turnOrder[(s.turnOrder.indexOf(ap) + 2) % 4]!)] });
    s = settle(s);
    expect(life(s, s.turnOrder[(s.turnOrder.indexOf(ap) + 2) % 4]!)).toBe(38);
    // Spare Dagger: declined, it stays.
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    emptyHands(s1);
    const b1 = ready(s1, putOnBattlefield(s1, ap1, grizzlyBears()));
    const dagger = attach(s1, ap1, spareDagger(), b1);
    let t = attackWith(s1, [{ attacker: b1, defender: opp1 }], ap1);
    expect(t.pending?.kind).toBe("chooseMay");
    t = settle(act(t, { type: "chooseMay", player: ap1, yes: false }));
    expect(zone(t, dagger)).toBe("battlefield");
  });

  it("Trickster's Talisman: combat damage to a player, sacrifice it for a token copy of the creature", () => {
    const { s: s0, ap, opp } = setup([]);
    emptyHands(s0);
    const b = ready(s0, putOnBattlefield(s0, ap, grizzlyBears()));
    const talisman = attach(s0, ap, trickstersTalisman(), b);
    let s = attackWith(s0, [{ attacker: b, defender: opp }], ap);
    expect(s.pending?.kind).toBe("chooseMay");
    expect(life(s, opp)).toBe(37);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(zone(s, talisman)).toBe("graveyard");
    const copies = s.battlefield.filter((id) => s.objects[id]!.isToken && s.cards[s.objects[id]!.cardId]!.name === "Grizzly Bears");
    expect(copies.length).toBe(1);
  });

  it("Rakdos Riteknife: the creature sacrifices a creature to put a blood counter on the Riteknife, +1/+0 for each", () => {
    const { s: s0, ap, opp } = setup([]);
    emptyHands(s0);
    const b = ready(s0, putOnBattlefield(s0, ap, grizzlyBears()));
    const knife = attach(s0, ap, rakdosRiteknife(), b);
    const fodder = putOnBattlefield(s0, ap, ornithopter());
    let s = settle(activateNow(s0, ap, b, abIndex(s0, b, /Rakdos Riteknife/), [], { sacrifice: [fodder] }));
    expect(zone(s, fodder)).toBe("graveyard");
    expect(s.objects[knife]!.counters.blood).toBe(1);
    expect(pt(s, b)).toBe("3/2");
    // "{B}{R}, Sacrifice this Equipment: Target player sacrifices a permanent of their choice for each blood counter".
    const theirs = s.battlefield.filter((id) => s.objects[id]!.controller === opp).length;
    putOnBattlefield(s, opp, grizzlyBears());
    s = settle(activateNow(s, ap, knife, abIndex(s, knife, /Target player sacrifices/), [ply(opp)]));
    expect(zone(s, knife)).toBe("graveyard");
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === opp).length).toBe(theirs);
  });

  it("Archery Training: X is the number of arrow counters on the Aura that gave the ability, each its own (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = ready(s0, putOnBattlefield(s0, ap, grizzlyBears()));
    const one = attach(s0, ap, archeryTraining(), b);
    const three = attach(s0, ap, archeryTraining(), b);
    s0.objects[one]!.counters.arrow = 1;
    s0.objects[three]!.counters.arrow = 3;
    const wurm = putOnBattlefield(s0, opp, crawWurm());
    s0.objects[wurm]!.attacking = ap;
    invalidateCharacteristics(s0);
    const abs = abilitiesOf(s0, s0.objects[b]!).activated.map((a, i) => [a, i] as const).filter(([a]) => /Archery Training/.test(a.text));
    expect(abs.length).toBe(2);
    // The later Aura's ability comes second.
    const s = settle(activateNow(s0, ap, b, abs[1]![1], [tgt(wurm)]));
    expect(s.objects[wurm]!.damage).toBe(3);
    const s1 = settle(activateNow(s0, ap, b, abs[0]![1], [tgt(wurm)]));
    expect(s1.objects[wurm]!.damage).toBe(1);
  });

  it("a granted trigger that sacrifices the Equipment by name: the creature's attack trigger, you may sacrifice it", () => {
    // The text granted-abilities.test.ts used to keep unsupported, now bound to the Equipment as it's granted.
    const dagger = card("Dagger Test", "Artifact — Equipment", "{1}", { oracleText: 'Equipped creature has "Whenever this creature attacks, you may sacrifice Dagger Test."\nEquip {1}' });
    expect(isFullySupported(dagger)).toBe(true);
    const { s: s0, ap, opp } = setup([]);
    emptyHands(s0);
    const b = ready(s0, putOnBattlefield(s0, ap, grizzlyBears()));
    const d = attach(s0, ap, dagger, b);
    let s = attackWith(s0, [{ attacker: b, defender: opp }], ap);
    expect(s.pending?.kind).toBe("chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect([zone(s, d), zone(s, b)]).toEqual(["graveyard", "battlefield"]);
  });
});
