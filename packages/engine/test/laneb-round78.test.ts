// Lane B, round 78: unsupported cards from the bottom of the popularity list (`npm run popular -- --least`): one-line
// templates (an "instead" pump by supertype, a dies-return that changes the permanent, block triggers about the blocking
// creature, a trigger only when it escaped, and others).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";
import { objHasKeyword } from "../src/cards";
import { destroyPermanent } from "../src/game";

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

const attach = (s: GameState, pid: PlayerId, def: CardDef, to: string) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.attachedTo = to;
  invalidateCharacteristics(s);
  return id;
};

// Real oracle text (Scryfall).
const sereneRemembrance = (): CardDef => ({"oracleId":"f980c8b4-4cd7-42d2-82d5-96e3275b2647","name":"Serene Remembrance","manaCost":"{G}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Shuffle Serene Remembrance and up to three target cards from a single graveyard into their owners' libraries.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/f/0f3da4b8-9dd6-455d-b24a-3d0207ae5ee8.jpg?1783940115","artUrl":"https://cards.scryfall.io/art_crop/front/0/f/0f3da4b8-9dd6-455d-b24a-3d0207ae5ee8.jpg?1783940115","layout":"normal"});
const plagueBoiler = (): CardDef => ({"oracleId":"fef502af-6e79-4c55-a86a-b45adb3fc64a","name":"Plague Boiler","manaCost":"{3}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"At the beginning of your upkeep, put a plague counter on this artifact.\n{1}{B}{G}: Put a plague counter on this artifact or remove a plague counter from it.\nWhen this artifact has three or more plague counters on it, sacrifice it. If you do, destroy all nonland permanents.","colors":[],"colorIdentity":["B","G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/8/889bab2c-d383-4a04-9f93-d507ba1973d9.jpg?1783943595","artUrl":"https://cards.scryfall.io/art_crop/front/8/8/889bab2c-d383-4a04-9f93-d507ba1973d9.jpg?1783943595","layout":"normal"});
const armamentOfNyx = (): CardDef => ({"oracleId":"1a4d16eb-343e-41ca-9363-90dc79da4769","name":"Armament of Nyx","manaCost":"{2}{W}","cmc":3,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature has double strike as long as it's an enchantment. Otherwise, prevent all damage that would be dealt by enchanted creature. (A creature with double strike deals both first-strike and regular combat damage.)","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/2/4203df15-dd44-496b-889a-d7a8fe320330.jpg?1783939463","artUrl":"https://cards.scryfall.io/art_crop/front/4/2/4203df15-dd44-496b-889a-d7a8fe320330.jpg?1783939463","layout":"normal"});
const charisma = (): CardDef => ({"oracleId":"d2abfcd1-c00c-43fa-a9ca-a9577b3c8a60","name":"Charisma","manaCost":"{U}{U}{U}","cmc":3,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nWhenever enchanted creature deals damage to a creature, gain control of the other creature for as long as this Aura remains on the battlefield.","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/6/3/63565b03-28e9-4534-b085-d5803e2623bb.jpg?1783945969","artUrl":"https://cards.scryfall.io/art_crop/front/6/3/63565b03-28e9-4534-b085-d5803e2623bb.jpg?1783945969","layout":"normal"});
const rootwaterThief = (): CardDef => ({"oracleId":"68abaca6-a86a-46e3-b5b8-9860bb6425d2","name":"Rootwater Thief","manaCost":"{1}{U}","cmc":2,"typeLine":"Creature — Merfolk Rogue","supertypes":[],"types":["Creature"],"subtypes":["Merfolk","Rogue"],"oracleText":"{U}: This creature gains flying until end of turn.\nWhenever this creature deals combat damage to a player, you may pay {2}. If you do, search that player's library for a card and exile it, then the player shuffles.","power":"1","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/8/38addef3-1dd7-41a1-9706-3be5c86a58c9.jpg?1783945833","artUrl":"https://cards.scryfall.io/art_crop/front/3/8/38addef3-1dd7-41a1-9706-3be5c86a58c9.jpg?1783945833","layout":"normal"});
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","layout":"normal"});
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","layout":"normal"});
const wallOfWood = (): CardDef => ({"oracleId":"aa5e6894-8c97-46f8-a0fd-07c6db51e9a7","name":"Wall of Wood","manaCost":"{G}","cmc":1,"typeLine":"Creature — Wall","supertypes":[],"types":["Creature"],"subtypes":["Wall"],"oracleText":"Defender (This creature can't attack.)","power":"0","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":["Defender"],"imageUrl":"https://cards.scryfall.io/normal/front/1/8/1864e25e-f940-47e5-9439-ab721049c690.jpg?1783942988","artUrl":"https://cards.scryfall.io/art_crop/front/1/8/1864e25e-f940-47e5-9439-ab721049c690.jpg?1783942988","layout":"normal"});
const regentsAuthority = (): CardDef => ({"oracleId":"54402930-84ea-4c3e-9880-ca631e47485f","name":"Regent's Authority","manaCost":"{W}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature gets +2/+2 until end of turn. If it's an enchantment creature or legendary creature, instead put a +1/+1 counter on it and it gets +1/+1 until end of turn.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/9/79243e97-fe45-4988-b299-f59a7c53ad31.jpg?1783923916","artUrl":"https://cards.scryfall.io/art_crop/front/7/9/79243e97-fe45-4988-b299-f59a7c53ad31.jpg?1783923916","layout":"normal"});
const earthRumbleWrestlers = (): CardDef => ({"oracleId":"1de17747-27e8-40bb-b6f7-6d5402d4705c","name":"Earth Rumble Wrestlers","manaCost":"{3}{R/G}","cmc":4,"typeLine":"Creature — Human Warrior Performer","supertypes":[],"types":["Creature"],"subtypes":["Human","Warrior","Performer"],"oracleText":"Reach\nThis creature gets +1/+0 and has trample as long as you control a land creature or a land entered the battlefield under your control this turn.","power":"3","toughness":"4","colors":["G","R"],"colorIdentity":["G","R"],"keywords":["Reach"],"imageUrl":"https://cards.scryfall.io/normal/front/7/4/74fca0b8-12e1-405f-b999-160d65fe0ade.jpg?1783904928","artUrl":"https://cards.scryfall.io/art_crop/front/7/4/74fca0b8-12e1-405f-b999-160d65fe0ade.jpg?1783904928","layout":"normal"});
const pharikasSpawn = (): CardDef => ({"oracleId":"a44955e7-f1ad-41b9-b93d-0a980ac341d8","name":"Pharika's Spawn","manaCost":"{3}{B}","cmc":4,"typeLine":"Creature — Gorgon","supertypes":[],"types":["Creature"],"subtypes":["Gorgon"],"oracleText":"Escape—{5}{B}, Exile three other cards from your graveyard. (You may cast this card from your graveyard for its escape cost.)\nThis creature escapes with two +1/+1 counters on it. When it enters this way, each opponent sacrifices a non-Gorgon creature of their choice.","power":"3","toughness":"4","colors":["B"],"colorIdentity":["B"],"keywords":["Escape"],"imageUrl":"https://cards.scryfall.io/normal/front/a/2/a2c8244b-7d86-4dff-9419-3945beb2a7b7.jpg?1783931561","artUrl":"https://cards.scryfall.io/art_crop/front/a/2/a2c8244b-7d86-4dff-9419-3945beb2a7b7.jpg?1783931561","layout":"normal"});
const graspingGiant = (): CardDef => ({"oracleId":"d601a28d-a02f-45eb-9dab-a3cf50a87ca4","name":"Grasping Giant","manaCost":"{5}{W}","cmc":6,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"Vigilance\nWhenever this creature becomes blocked by a creature, exile that creature until this creature leaves the battlefield.","power":"5","toughness":"7","colors":["W"],"colorIdentity":["W"],"keywords":["Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/a/2/a238aa9c-661e-449a-8f05-70b7954e544f.jpg?1783931492","artUrl":"https://cards.scryfall.io/art_crop/front/a/2/a238aa9c-661e-449a-8f05-70b7954e544f.jpg?1783931492","layout":"normal"});
const tolarianEntrancer = (): CardDef => ({"oracleId":"50c8c7e2-1b45-44b2-a50b-3b514d4c4c42","name":"Tolarian Entrancer","manaCost":"{1}{U}","cmc":2,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"Whenever this creature becomes blocked by a creature, gain control of that creature at end of combat.","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/2/c29dd04a-b3aa-48b6-beef-3314344b84a6.jpg?1783946737","artUrl":"https://cards.scryfall.io/art_crop/front/c/2/c29dd04a-b3aa-48b6-beef-3314344b84a6.jpg?1783946737","layout":"normal"});
const hezrou = (): CardDef => ({"oracleId":"65d257c2-b3be-4244-a74c-bc4b5d7cedc3","name":"Hezrou // Demonic Stench","manaCost":"{5}{B}{B} // {B}","cmc":7,"typeLine":"Creature — Frog Demon // Instant — Adventure","supertypes":[],"types":["Creature"],"subtypes":["Frog","Demon"],"oracleText":"Whenever one or more creatures you control become blocked, each blocking creature gets -1/-1 until end of turn.","power":"6","toughness":"6","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/c/0c2f40e7-82b0-4847-994d-9326a88c4965.jpg?1783922758","artUrl":"https://cards.scryfall.io/art_crop/front/0/c/0c2f40e7-82b0-4847-994d-9326a88c4965.jpg?1783922758","layout":"adventure","faces":[{"name":"Hezrou","manaCost":"{5}{B}{B}","typeLine":"Creature — Frog Demon","supertypes":[],"types":["Creature"],"subtypes":["Frog","Demon"],"oracleText":"Whenever one or more creatures you control become blocked, each blocking creature gets -1/-1 until end of turn.","power":"6","toughness":"6","colors":["B"]},{"name":"Demonic Stench","manaCost":"{B}","typeLine":"Instant — Adventure","supertypes":[],"types":["Instant"],"subtypes":["Adventure"],"oracleText":"Each creature that blocked this turn gets -1/-1 until end of turn. (Then exile this card. You may cast the creature later from exile.)","colors":["B"]}]});
const hellcatUndyingVigilante = (): CardDef => ({"oracleId":"4c27ba61-6812-4dd7-8efc-65435a8df7b5","name":"Hellcat, Undying Vigilante","manaCost":"{G}{G}","cmc":2,"typeLine":"Legendary Creature — Human Hero","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Hero"],"oracleText":"Haste\nWhen Hellcat dies, return her to the battlefield under her owner's control with a +1/+1 counter on her. She loses all abilities and gains haste.","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":["Haste"],"imageUrl":"https://cards.scryfall.io/normal/front/d/7/d7922c5f-d6ee-4b62-a537-3be5aa280e10.jpg?1783902917","artUrl":"https://cards.scryfall.io/art_crop/front/d/7/d7922c5f-d6ee-4b62-a537-3be5aa280e10.jpg?1783902917","layout":"normal"});
const otherworldlyEscort = (): CardDef => ({"oracleId":"c0ebc1df-51ea-413b-bb88-7666a53ad783","name":"Otherworldly Escort","manaCost":"{3}{W}","cmc":4,"typeLine":"Creature — Human Detective","supertypes":[],"types":["Creature"],"subtypes":["Human","Detective"],"oracleText":"Flash\nWhen this creature dies, if it's not a Spirit, return it to the battlefield under its owner's control with four charge counters on it. It's a Spirit Detective. (It's no longer a Human.)\n{1}{W}, {T}, Remove a charge counter from this creature: Destroy target creature that dealt damage to you this turn.","power":"4","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":["Flash"],"imageUrl":"https://cards.scryfall.io/normal/front/b/5/b50bfde2-6c2d-403e-ab47-c932bcb2116d.jpg?1783913052","artUrl":"https://cards.scryfall.io/art_crop/front/b/5/b50bfde2-6c2d-403e-ab47-c932bcb2116d.jpg?1783913052","layout":"normal"});
const isamaruHoundOfKonda = (): CardDef => ({"oracleId":"cfb756dd-6fe1-430a-8f04-8b10cac62a86","name":"Isamaru, Hound of Konda","manaCost":"{W}","cmc":1,"typeLine":"Legendary Creature — Dog","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Dog"],"oracleText":"","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/e/2e7f9919-0713-4ef9-96eb-3e0c444e47f4.jpg?1783944338","artUrl":"https://cards.scryfall.io/art_crop/front/2/e/2e7f9919-0713-4ef9-96eb-3e0c444e47f4.jpg?1783944338","layout":"normal"});
const dryadArbor = (): CardDef => ({"oracleId":"e996cd67-739c-40f4-b276-0042acf26c71","name":"Dryad Arbor","manaCost":"","cmc":0,"typeLine":"Land Creature — Forest Dryad","supertypes":[],"types":["Land","Creature"],"subtypes":["Forest","Dryad"],"oracleText":"(This land isn't a spell, it's affected by summoning sickness, and it has \"{T}: Add {G}.\")","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/5/c/5c4fb7f9-a551-4253-a46e-f6284d355388.jpg?1783904262","artUrl":"https://cards.scryfall.io/art_crop/front/5/c/5c4fb7f9-a551-4253-a46e-f6284d355388.jpg?1783904262","layout":"normal"});
const murder = (): CardDef => ({"oracleId":"938b4e2c-88d9-4637-bc00-e228920c9a78","name":"Murder","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","artUrl":"https://cards.scryfall.io/art_crop/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","layout":"normal"});
const spiritOfTheLabyrinth = (): CardDef => ({"oracleId":"1463795b-ec0c-44d6-ae1a-55f78d9843ec","name":"Spirit of the Labyrinth","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment Creature — Spirit","supertypes":[],"types":["Enchantment","Creature"],"subtypes":["Spirit"],"oracleText":"Each player can't draw more than one card each turn.","power":"3","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/4/f44e5128-e146-4e46-b313-a40d82719d1d.jpg?1783939575","artUrl":"https://cards.scryfall.io/art_crop/front/f/4/f44e5128-e146-4e46-b313-a40d82719d1d.jpg?1783939575","layout":"normal"});
const forest = (): CardDef => ({"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","layout":"normal"});

const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","layout":"normal"});

describe("Lane B round 78", () => {
  it("all of them are supported", () => {
    supported(regentsAuthority(), earthRumbleWrestlers(), pharikasSpawn(), graspingGiant(), tolarianEntrancer(), hezrou(), hellcatUndyingVigilante(), otherworldlyEscort(), sereneRemembrance(), plagueBoiler(), armamentOfNyx(), charisma(), rootwaterThief());
  });

  it("Regent's Authority: +2/+2, or a +1/+1 counter and +1/+1 on an enchantment creature or a legendary creature (only one counter if both)", () => {
    const { s: s0, ap, ids } = setup([regentsAuthority(), regentsAuthority(), regentsAuthority()]);
    const plain = putOnBattlefield(s0, ap, bears());
    const legend = putOnBattlefield(s0, ap, isamaruHoundOfKonda());
    const ench = putOnBattlefield(s0, ap, spiritOfTheLabyrinth());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(plain)]));
    expect(pt(s, plain)).toBe("4/4");
    expect(s.objects[plain]!.counters["+1/+1"] ?? 0).toBe(0);
    s = settle(castNow(s, ap, ids[1]!, [tgt(legend)]));
    expect(s.objects[legend]!.counters["+1/+1"]).toBe(1);
    expect(pt(s, legend)).toBe("4/4");
    s = settle(castNow(s, ap, ids[2]!, [tgt(ench)]));
    expect(s.objects[ench]!.counters["+1/+1"]).toBe(1);
    expect(pt(s, ench)).toBe("5/3");
  });

  it("Earth Rumble Wrestlers: +1/+0 and trample while you control a land creature", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, earthRumbleWrestlers());
    // setup() put its lands onto the battlefield this turn; on a later turn none has entered yet.
    let s = goUntil(s0, (x) => x.activePlayer === ap && x.step === "main1" && x.turn > s0.turn);
    s.players[ap]!.hand = [];
    expect(pt(s, w)).toBe("3/4");
    expect(objHasKeyword(s, s.objects[w]!, "Trample")).toBe(false);
    // (Put there by the test, not recorded as entering this turn.)
    const arbor = putOnBattlefield(s, ap, dryadArbor());
    invalidateCharacteristics(s);
    expect(pt(s, w)).toBe("4/4");
    expect(objHasKeyword(s, s.objects[w]!, "Trample")).toBe(true);
    destroyPermanent(s, s.objects[arbor]!, "test");
    invalidateCharacteristics(s);
    expect(pt(s, w)).toBe("3/4");
  });

  it("Earth Rumble Wrestlers: a land played this turn counts", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, earthRumbleWrestlers());
    let s = goUntil(s0, (x) => x.activePlayer === ap && x.step === "main1" && x.turn > s0.turn);
    expect(pt(s, w)).toBe("3/4");
    const [land] = handOf(s, ap, [forest()]);
    s = act(s, { type: "playLand", player: ap, objectId: land! });
    expect(pt(s, w)).toBe("4/4");
    expect(objHasKeyword(s, s.objects[w]!, "Trample")).toBe(true);
    // Only this turn.
    s = goUntil(s, (x) => x.activePlayer !== ap);
    expect(pt(s, w)).toBe("3/4");
  });

  it("Pharika's Spawn: escaped, it has two +1/+1 counters and each opponent sacrifices a non-Gorgon creature; cast from the hand, neither", () => {
    const { s: s0, ap, opp, ids } = setup([pharikasSpawn()]);
    const theirs = putOnBattlefield(s0, opp, bears());
    const gorgonOnly = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const gorgon = putOnBattlefield(s0, gorgonOnly, pharikasSpawn());
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(zone(s, theirs)).toBe("battlefield");
    expect(s.objects[ids[0]!]!.counters["+1/+1"] ?? 0).toBe(0);
    // Into the graveyard with three other cards, then escape.
    destroyPermanent(s, s.objects[ids[0]!]!, "test");
    const others = [bears(), bears(), bears()].map((d) => toZone(s, ap, d, "graveyard"));
    invalidateCharacteristics(s);
    s = settle(run(s, planCast(s, ap, ids[0]!, undefined, undefined, undefined, undefined, { via: "escape", exileCards: others })));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(2);
    expect(zone(s, theirs)).toBe("graveyard");
    // A Gorgon isn't sacrificed.
    expect(zone(s, gorgon)).toBe("battlefield");
  });

  it("Grasping Giant: each creature blocking it is exiled until it leaves the battlefield", () => {
    const { s: s0, ap, opp } = setup([]);
    const giant = putOnBattlefield(s0, ap, graspingGiant());
    const b1 = putOnBattlefield(s0, opp, bears());
    const b2 = putOnBattlefield(s0, opp, bears());
    let s = attackWith(s0, [giant], opp);
    s = goUntil(s, (x) => x.pending?.kind === "declareBlockers");
    s = block(s, opp, [{ blocker: b1, attacker: giant }, { blocker: b2, attacker: giant }]);
    s = settle(s);
    expect(zone(s, b1)).toBe("exile");
    expect(zone(s, b2)).toBe("exile");
    // Still blocked: no damage to the player (rulings).
    const life = s.players[opp]!.life;
    s = goUntil(s, (x) => x.step === "main2");
    expect(s.players[opp]!.life).toBe(life);
    destroyPermanent(s, s.objects[giant]!, "test");
    s = settle(s);
    const back = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Grizzly Bears" && controllerOf(s, s.objects[id]!) === opp);
    expect(back.length).toBe(2);
  });

  it("Tolarian Entrancer: you gain control of the blocking creature at end of combat, for good", () => {
    const { s: s0, ap, opp } = setup([]);
    const ent = putOnBattlefield(s0, ap, tolarianEntrancer());
    const b = putOnBattlefield(s0, opp, bears());
    let s = attackWith(s0, [ent], opp);
    s = goUntil(s, (x) => x.pending?.kind === "declareBlockers");
    s = block(s, opp, [{ blocker: b, attacker: ent }]);
    s = settle(s);
    expect(controllerOf(s, s.objects[b]!)).toBe(opp);
    // The Entrancer dies in combat (2 damage to a 1/1); the control change still happens (rulings).
    s = goUntil(s, (x) => x.step === "main2");
    expect(zone(s, ent)).toBe("graveyard");
    expect(controllerOf(s, s.objects[b]!)).toBe(ap);
    s = goUntil(s, (x) => x.turn > s0.turn + 1);
    expect(controllerOf(s, s.objects[b]!)).toBe(ap);
  });

  it("Hezrou: once when your creatures become blocked, each blocking creature gets -1/-1 until end of turn", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, hezrou());
    const a1 = putOnBattlefield(s0, ap, bears());
    const a2 = putOnBattlefield(s0, ap, bears());
    const b1 = putOnBattlefield(s0, opp, spiritOfTheLabyrinth());
    const b2 = putOnBattlefield(s0, opp, isamaruHoundOfKonda());
    const idle = putOnBattlefield(s0, opp, bears());
    let s = attackWith(s0, [a1, a2], opp);
    s = goUntil(s, (x) => x.pending?.kind === "declareBlockers");
    s = block(s, opp, [{ blocker: b1, attacker: a1 }, { blocker: b2, attacker: a2 }]);
    expect(s.triggerQueue.length + s.stack.length).toBe(1);
    s = settle(s);
    // Spirit of the Labyrinth 3/1 dies as a 2/0; Isamaru is a 1/1; the creature not blocking is untouched.
    expect(zone(s, b1)).toBe("graveyard");
    expect(pt(s, b2)).toBe("1/1");
    expect(pt(s, idle)).toBe("2/2");
  });

  it("Hezrou: nothing when none of your creatures is blocked", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, hezrou());
    const a1 = putOnBattlefield(s0, ap, bears());
    putOnBattlefield(s0, opp, bears());
    let s = attackWith(s0, [a1], opp);
    s = goUntil(s, (x) => x.pending?.kind === "declareBlockers");
    s = block(s, opp, []);
    expect(s.triggerQueue.length + s.stack.length).toBe(0);
  });

  it("Hellcat, Undying Vigilante: it returns with a +1/+1 counter, no abilities but haste; dying again it stays dead", () => {
    const { s: s0, ap } = setup([]);
    const cat = putOnBattlefield(s0, ap, hellcatUndyingVigilante());
    destroyPermanent(s0, s0.objects[cat]!, "test");
    let s = settle(s0);
    const back = s.battlefield.find((id) => s.objects[id]!.cardId === s0.objects[cat]!.cardId)!;
    expect(back).toBeDefined();
    expect(s.objects[back]!.counters["+1/+1"]).toBe(1);
    expect(pt(s, back)).toBe("3/3");
    expect(objHasKeyword(s, s.objects[back]!, "Haste")).toBe(true);
    expect(abilitiesOf(s, s.objects[back]!).triggers.length).toBe(0);
    destroyPermanent(s, s.objects[back]!, "test");
    s = settle(s);
    expect(zone(s, back)).toBe("graveyard");
  });

  it("Otherworldly Escort: it returns with four charge counters as a Spirit Detective, not a Human; then it doesn't return again", () => {
    const { s: s0, ap } = setup([]);
    const esc = putOnBattlefield(s0, ap, otherworldlyEscort());
    destroyPermanent(s0, s0.objects[esc]!, "test");
    let s = settle(s0);
    const back = s.battlefield.find((id) => s.objects[id]!.cardId === s0.objects[esc]!.cardId)!;
    expect(back).toBeDefined();
    expect(s.objects[back]!.counters.charge).toBe(4);
    expect([...characteristics(s, s.objects[back]!).subtypes].sort()).toEqual(["Detective", "Spirit"]);
    expect(characteristics(s, s.objects[back]!).types).toContain("Creature");
    destroyPermanent(s, s.objects[back]!, "test");
    s = settle(s);
    expect(zone(s, back)).toBe("graveyard");
  });

  it("Serene Remembrance: up to three cards from a single graveyard and itself into their owners' libraries", () => {
    const { s: s0, ap, opp, ids } = setup([sereneRemembrance()]);
    const cards = [bears(), bears(), bears()].map((d) => toZone(s0, opp, d, "graveyard"));
    const mine = toZone(s0, ap, bears(), "graveyard");
    // Not from two graveyards.
    expect(planCast(s0, ap, ids[0]!, [tgt(cards[0]!), tgt(mine), { kind: "none" }])).toBeNull();
    const s = settle(castNow(s0, ap, ids[0]!, cards.map(tgt)));
    for (const c of cards) expect(zone(s, c)).toBe("library");
    expect(zone(s, ids[0]!)).toBe("library");
    expect(zone(s, mine)).toBe("graveyard");
  });

  it("Serene Remembrance: with no targets only itself; with every target gone it doesn't resolve (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([sereneRemembrance(), sereneRemembrance()]);
    let s = settle(castNow(s0, ap, ids[0]!, [{ kind: "none" }, { kind: "none" }, { kind: "none" }]));
    expect(zone(s, ids[0]!)).toBe("library");
    const c = toZone(s, opp, bears(), "graveyard");
    s = castNow(s, ap, ids[1]!, [tgt(c), { kind: "none" }, { kind: "none" }]);
    // The card leaves the graveyard before it resolves.
    s.players[opp]!.graveyard.splice(s.players[opp]!.graveyard.indexOf(c), 1);
    s.objects[c]!.zone = "exile";
    s.players[opp]!.exile.push(c);
    s = settle(s);
    expect(zone(s, ids[1]!)).toBe("graveyard");
  });

  it("Plague Boiler: put a plague counter on it or remove one, chosen as it resolves; removing only with one there", () => {
    const { s: s0, ap } = setup([]);
    const boiler = putOnBattlefield(s0, ap, plagueBoiler());
    const i = abilitiesOf(s0, s0.objects[boiler]!).activated.findIndex((a) => /or remove/.test(a.body.text));
    // None on it: no question, a counter goes on.
    let s = settle(run(s0, planActivate(s0, ap, boiler, i)), { me: [ap] });
    expect(s.pending).toBeFalsy();
    expect(s.objects[boiler]!.counters.plague).toBe(1);
    s = settle(run(s, planActivate(s, ap, boiler, i)), { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "either", player: ap, labels: ["Put a plague counter on Plague Boiler", "Remove a plague counter from Plague Boiler"] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "1" }), { me: [ap] });
    expect(s.objects[boiler]!.counters.plague ?? 0).toBe(0);
  });

  it("Plague Boiler: at three plague counters it's sacrificed and all nonland permanents are destroyed", () => {
    const { s: s0, ap, opp } = setup([]);
    const boiler = putOnBattlefield(s0, ap, plagueBoiler());
    const theirs = putOnBattlefield(s0, opp, bears());
    const land = s0.battlefield.find((id) => s0.objects[id]!.controller === ap && characteristics(s0, s0.objects[id]!).types.includes("Land"))!;
    s0.objects[boiler]!.counters.plague = 2;
    const i = abilitiesOf(s0, s0.objects[boiler]!).activated.findIndex((a) => /or remove/.test(a.body.text));
    let s = settle(run(s0, planActivate(s0, ap, boiler, i)), { me: [ap] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "0" }));
    expect(zone(s, boiler)).toBe("graveyard");
    expect(zone(s, theirs)).toBe("graveyard");
    expect(zone(s, land)).toBe("battlefield");
  });

  it("Armament of Nyx: double strike on an enchantment creature; otherwise all damage the creature would deal is prevented", () => {
    const { s: s0, ap, opp } = setup([]);
    const plain = putOnBattlefield(s0, ap, bears());
    const ench = putOnBattlefield(s0, ap, spiritOfTheLabyrinth());
    attach(s0, ap, armamentOfNyx(), plain);
    attach(s0, ap, armamentOfNyx(), ench);
    expect(objHasKeyword(s0, s0.objects[ench]!, "Double strike")).toBe(true);
    expect(objHasKeyword(s0, s0.objects[plain]!, "Double strike")).toBe(false);
    const life = s0.players[opp]!.life;
    let s = attackWith(s0, [plain, ench], opp);
    s = goUntil(s, (x) => x.step === "main2");
    // Spirit of the Labyrinth: 3 twice; the Bears' 2 prevented.
    expect(s.players[opp]!.life).toBe(life - 6);
  });

  it("Charisma: gain control of a creature enchanted creature deals damage to, for as long as Charisma remains on the battlefield", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, bears());
    const aura = attach(s0, ap, charisma(), b);
    const wall = putOnBattlefield(s0, opp, wallOfWood());
    let s = attackWith(s0, [b], opp);
    s = goUntil(s, (x) => x.pending?.kind === "declareBlockers");
    s = block(s, opp, [{ blocker: wall, attacker: b }]);
    s = goUntil(s, (x) => x.step === "main2");
    expect(controllerOf(s, s.objects[wall]!)).toBe(ap);
    destroyPermanent(s, s.objects[aura]!, "test");
    invalidateCharacteristics(s);
    expect(controllerOf(s, s.objects[wall]!)).toBe(opp);
  });

  it("Rootwater Thief: dealing combat damage to a player, you may pay {2} to exile a card of your choice from their library", () => {
    const { s: s0, ap, opp } = setup([]);
    const thief = putOnBattlefield(s0, ap, rootwaterThief());
    const wanted = toZone(s0, opp, lightningBolt(), "library");
    s0.players[opp]!.library.push(s0.players[opp]!.library.shift()!);
    let s = attackWith(s0, [thief], opp);
    s = goUntil(s, (x) => x.pending?.kind === "chooseMay");
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, C: 2 };
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    for (let i = 0; i < 10 && s.pending?.kind !== "searchLibrary"; i++) s = s.pending ? s : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [wanted] }));
    expect(zone(s, wanted)).toBe("exile");
  });
});
