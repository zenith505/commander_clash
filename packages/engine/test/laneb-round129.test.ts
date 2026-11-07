// Lane B round B129: Groffskithur ("target card named ~" in your graveyard), Mindblaze (a card name and a number chosen,
// the library revealed), Rite of Ruin (an order for artifacts, creatures and lands, then sacrifices in it), Eye of
// Singularity (permanents sharing a name destroyed), Cornered Market (no casting or nonbasic land playing with a nontoken
// permanent's name), Sengir Nosferatu (a Bat returning an exiled card named Sengir Nosferatu), Knowledge Vault (cards
// exiled face down, then into the hand as it's sacrificed), Odds // Ends (an uncalled coin flip: counter or copy),
// Spellshift (the countered spell's controller reveals until an instant or sorcery and may cast it), Shorecrasher
// Elemental (exiled and returned face down, then turned face up for its megamorph cost).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { botActions, canPlayLandNow, castProblem, characteristics, compileCard, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type Step, type TargetChoice } from "../src";
import { legalTargets } from "../src/effects/targeting";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; questions of the players in `me` stop it, others the bots answer. */
const settle = (s: GameState, opts: { me?: PlayerId[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me?.includes(p.player)) return s;
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes priority (answering other questions as bots, no attacks or blocks) until `step` of `active`'s turn, stopping at a question of `me`. */
const goTo = (s: GameState, step: Step, active: PlayerId, me?: PlayerId) => {
  for (let i = 0; i < 3000 && !(s.step === step && s.activePlayer === active); i++) {
    const p = s.pending;
    if (p && p.player === me) return s;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: p.player, attacks: [] });
    else if (p) s = run(s, botActions(s, p.player));
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const plr = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const ptOf = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
/** A card of `def` put into `pid`'s graveyard, hand, exile or library (on top). */
const putIn = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
const nameOf = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;
const mine = (s: GameState, pid: PlayerId, type: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && characteristics(s, s.objects[id]!).types.includes(type));

// Real oracle text (Scryfall).
const groffskithur = (): CardDef => ({"oracleId":"32a8ca5f-0170-4f5d-97cd-63e2b74fd653","name":"Groffskithur","manaCost":"{5}{G}","cmc":6,"typeLine":"Creature — Beast","supertypes":[],"types":["Creature"],"subtypes":["Beast"],"oracleText":"Whenever this creature becomes blocked, you may return target card named Groffskithur from your graveyard to your hand.","power":"3","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/5/75e84098-c15c-40f4-9d8a-3fa5da26a268.jpg?1783944533","artUrl":"https://cards.scryfall.io/art_crop/front/7/5/75e84098-c15c-40f4-9d8a-3fa5da26a268.jpg?1783944533","commanderLegal":"legal","set":"mrd","releasedAt":"2003-10-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const mindblaze = (): CardDef => ({"oracleId":"31f3a9f3-881e-4dc9-b71d-5d1fc86477bf","name":"Mindblaze","manaCost":"{5}{R}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose a nonland card name and a number greater than 0. Target player reveals their library. If that library contains exactly the chosen number of cards with the chosen name, Mindblaze deals 8 damage to that player. Then that player shuffles.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/9/59418766-5567-4ec4-af1f-1cb2db2958d0.jpg?1783944297","artUrl":"https://cards.scryfall.io/art_crop/front/5/9/59418766-5567-4ec4-af1f-1cb2db2958d0.jpg?1783944297","commanderLegal":"legal","set":"chk","releasedAt":"2004-10-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const riteOfRuin = (): CardDef => ({"oracleId":"d0dd0586-d89e-40e9-863d-9c390bee117a","name":"Rite of Ruin","manaCost":"{5}{R}{R}","cmc":7,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose an order for artifacts, creatures, and lands. Each player sacrifices one permanent of their choice of the first type, sacrifices two of their choice of the second type, then sacrifices three of their choice of the third type.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/9/89e7fec3-94b5-411e-aeb0-44a64f517986.jpg?1783940677","artUrl":"https://cards.scryfall.io/art_crop/front/8/9/89e7fec3-94b5-411e-aeb0-44a64f517986.jpg?1783940677","commanderLegal":"legal","set":"avr","releasedAt":"2012-05-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const eyeOfSingularity = (): CardDef => ({"oracleId":"e13edf92-cdba-4c24-b81b-088b1554fde6","name":"Eye of Singularity","manaCost":"{3}{W}","cmc":4,"typeLine":"World Enchantment","supertypes":["World"],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, destroy each permanent with the same name as another permanent, except for basic lands. They can't be regenerated.\nWhenever a permanent other than a basic land enters, destroy all other permanents with that name. They can't be regenerated.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/a/fa84e4ad-738a-4d23-a84c-06c39ff4200b.jpg?1783947007","artUrl":"https://cards.scryfall.io/art_crop/front/f/a/fa84e4ad-738a-4d23-a84c-06c39ff4200b.jpg?1783947007","commanderLegal":"legal","set":"vis","releasedAt":"1997-02-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const corneredMarket = (): CardDef => ({"oracleId":"1784bbaa-67b1-4bd1-bf77-53da2bfbf7fc","name":"Cornered Market","manaCost":"{2}{W}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Players can't cast spells with the same name as a nontoken permanent.\nPlayers can't play nonbasic lands with the same name as a nontoken permanent.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/d/0d4f3c1d-d25e-4263-ab2b-19534c852678.jpg?1783945982","artUrl":"https://cards.scryfall.io/art_crop/front/0/d/0d4f3c1d-d25e-4263-ab2b-19534c852678.jpg?1783945982","commanderLegal":"legal","set":"mmq","releasedAt":"1999-10-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const sengirNosferatu = (): CardDef => ({"oracleId":"2efdfcae-c3ad-4c6b-8a60-45a203bd14c6","name":"Sengir Nosferatu","manaCost":"{3}{B}{B}","cmc":5,"typeLine":"Creature — Vampire","supertypes":[],"types":["Creature"],"subtypes":["Vampire"],"oracleText":"Flying\n{1}{B}, Exile this creature: Create a 1/2 black Bat creature token with flying. It has \"{1}{B}, Sacrifice this token: Return an exiled card named Sengir Nosferatu to the battlefield under its owner's control.\"","power":"4","toughness":"4","colors":["B"],"colorIdentity":["B"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/3/c/3cd9cc4c-708b-41cb-9cac-fd6d8ce9922d.jpg?1783943228","artUrl":"https://cards.scryfall.io/art_crop/front/3/c/3cd9cc4c-708b-41cb-9cac-fd6d8ce9922d.jpg?1783943228","commanderLegal":"legal","set":"tsp","releasedAt":"2006-10-06","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const knowledgeVault = (): CardDef => ({"oracleId":"77d3cc31-837a-408a-b7f8-5aa9de78e1b7","name":"Knowledge Vault","manaCost":"{4}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{2}, {T}: Exile the top card of your library face down.\n{0}: Sacrifice this artifact. If you do, discard your hand, then put all cards exiled with this artifact into their owner's hand.\nWhen this artifact leaves the battlefield, put all cards exiled with it into their owner's graveyard.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/5/65947312-75c2-4baa-805c-238a154156ef.jpg?1783948028","artUrl":"https://cards.scryfall.io/art_crop/front/6/5/65947312-75c2-4baa-805c-238a154156ef.jpg?1783948028","commanderLegal":"legal","set":"leg","releasedAt":"1994-06-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const oddsEnds = (): CardDef => ({"oracleId":"82922f3a-a444-49cf-b136-f30a3c85f791","name":"Odds // Ends","manaCost":"{U}{R} // {3}{R}{W}","cmc":7,"typeLine":"Instant // Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Flip a coin. If it comes up heads, counter target instant or sorcery spell. If it comes up tails, copy that spell and you may choose new targets for the copy.","colors":["R","U","W"],"colorIdentity":["R","U","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/b/4bb07091-86d6-4735-82b6-6e71e26710f4.jpg?1783943385","artUrl":"https://cards.scryfall.io/art_crop/front/4/b/4bb07091-86d6-4735-82b6-6e71e26710f4.jpg?1783943385","commanderLegal":"legal","set":"dis","releasedAt":"2006-05-05","rarity":"rare","layout":"split","gameChanger":false,"faces":[{"name":"Odds","manaCost":"{U}{R}","typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Flip a coin. If it comes up heads, counter target instant or sorcery spell. If it comes up tails, copy that spell and you may choose new targets for the copy.","colors":["U","R"]},{"name":"Ends","manaCost":"{3}{R}{W}","typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target player sacrifices two attacking creatures of their choice.","colors":["W","R"]}]}) as CardDef;
const spellshift = (): CardDef => ({"oracleId":"640fc475-5708-4ee6-a1a9-8f0722e22b48","name":"Spellshift","manaCost":"{3}{U}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target instant or sorcery spell. Its controller reveals cards from the top of their library until they reveal an instant or sorcery card. That player may cast that card without paying its mana cost. Then the player shuffles.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/5/f5c897a6-5835-42ac-8cc7-e8d9fc1e7c77.jpg?1783943160","artUrl":"https://cards.scryfall.io/art_crop/front/f/5/f5c897a6-5835-42ac-8cc7-e8d9fc1e7c77.jpg?1783943160","commanderLegal":"legal","set":"plc","releasedAt":"2007-02-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const shorecrasherElemental = (): CardDef => ({"oracleId":"5eb0d8dc-be4b-4a20-b480-f70514ffb299","name":"Shorecrasher Elemental","manaCost":"{U}{U}{U}","cmc":3,"typeLine":"Creature — Elemental","supertypes":[],"types":["Creature"],"subtypes":["Elemental"],"oracleText":"{U}: Exile this creature, then return it to the battlefield face down under its owner's control.\n{1}: This creature gets +1/-1 or -1/+1 until end of turn.\nMegamorph {4}{U} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its megamorph cost and put a +1/+1 counter on it.)","power":"3","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Megamorph"],"imageUrl":"https://cards.scryfall.io/normal/front/e/8/e8890fc6-45e9-443d-ae86-f1acb1ebd0aa.jpg?1783938604","artUrl":"https://cards.scryfall.io/art_crop/front/e/8/e8890fc6-45e9-443d-ae86-f1acb1ebd0aa.jpg?1783938604","commanderLegal":"legal","set":"dtk","releasedAt":"2015-03-27","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const unsummon = (): CardDef => ({"oracleId":"837182db-1bf3-4a2c-bd01-1af9d9873561","name":"Unsummon","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Return target creature to its owner's hand.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddad9f16-52d5-49de-82b0-b1a5294a9c44.jpg?1789556722","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddad9f16-52d5-49de-82b0-b1a5294a9c44.jpg?1789556722","commanderLegal":"legal","set":"fra","releasedAt":"2026-10-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const krarksThumb = (): CardDef => ({"oracleId":"a97c8482-775c-4f11-9872-25b4f9bfcb1a","name":"Krark's Thumb","manaCost":"{2}","cmc":2,"typeLine":"Legendary Artifact","supertypes":["Legendary"],"types":["Artifact"],"subtypes":[],"oracleText":"If you would flip a coin, instead flip two coins and ignore one.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/8/78a5d49a-747e-4ec8-a20a-ca917c315774.jpg?1783944517","artUrl":"https://cards.scryfall.io/art_crop/front/7/8/78a5d49a-747e-4ec8-a20a-ca917c315774.jpg?1783944517","commanderLegal":"legal","set":"mrd","releasedAt":"2003-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const clone = (): CardDef => ({"oracleId":"42226b87-0746-4ebf-9fd0-108d508462af","name":"Clone","manaCost":"{3}{U}","cmc":4,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"You may have this creature enter as a copy of any creature on the battlefield.","power":"0","toughness":"0","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/8/48c2e9e2-f679-451d-a700-18104af08988.jpg?1784013893","artUrl":"https://cards.scryfall.io/art_crop/front/4/8/48c2e9e2-f679-451d-a700-18104af08988.jpg?1784013893","commanderLegal":"legal","set":"sld","releasedAt":"2026-06-15","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const llanowarElves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const counterspell = (): CardDef => ({"oracleId":"cc187110-1148-4090-bbb8-e205694a39f5","name":"Counterspell","manaCost":"{U}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target spell.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/c/0c9a7cb0-5bff-48ff-b620-2838816ac9b5.jpg?1783937618","artUrl":"https://cards.scryfall.io/art_crop/front/0/c/0c9a7cb0-5bff-48ff-b620-2838816ac9b5.jpg?1783937618","commanderLegal":"legal","set":"ema","releasedAt":"2016-06-10","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const duress = (): CardDef => ({"oracleId":"33d405ea-7a9a-4970-b70f-9c05d90dd6f0","name":"Duress","manaCost":"{B}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target opponent reveals their hand. You choose a noncreature, nonland card from it. That player discards that card.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/5/3557e601-9b71-4ce9-9047-1a8baa72e574.jpg?1783918048","artUrl":"https://cards.scryfall.io/art_crop/front/3/5/3557e601-9b71-4ce9-9047-1a8baa72e574.jpg?1783918048","commanderLegal":"legal","set":"one","releasedAt":"2023-02-10","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const swordsToPlowshares = (): CardDef => ({"oracleId":"b1544f21-7e98-461b-aed5-e748b0168c52","name":"Swords to Plowshares","manaCost":"{W}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Exile target creature. Its controller gains life equal to its power.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/4/84a4a532-538e-428c-bd62-d0b997895c31.jpg?1790743598","artUrl":"https://cards.scryfall.io/art_crop/front/8/4/84a4a532-538e-428c-bd62-d0b997895c31.jpg?1790743598","commanderLegal":"legal","set":"sld","releasedAt":"2026-09-28","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const mindStone = (): CardDef => ({"oracleId":"c97361b5-af16-4a7b-af85-a429dbaf4ad2","name":"Mind Stone","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/7/f/7fdef0b6-a3b9-4752-bce6-53c0140a1693.jpg?1783906237","artUrl":"https://cards.scryfall.io/art_crop/front/7/f/7fdef0b6-a3b9-4752-bce6-53c0140a1693.jpg?1783906237","commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const realForest = (): CardDef => ({"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const realIsland = (): CardDef => ({"oracleId":"b2c6aa39-2d2a-459c-a555-fb48ba993373","name":"Island","manaCost":"","cmc":0,"typeLine":"Basic Land — Island","supertypes":["Basic"],"types":["Land"],"subtypes":["Island"],"oracleText":"({T}: Add {U}.)","colors":[],"colorIdentity":["U"],"keywords":[],"producedMana":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646","artUrl":"https://cards.scryfall.io/art_crop/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const wastes = (): CardDef => ({"oracleId":"05d24b0c-904a-46b6-b42a-96a4d91a0dd4","name":"Wastes","manaCost":"","cmc":0,"typeLine":"Basic Land","supertypes":["Basic"],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/6/0/60682c00-c661-4a9d-8326-f3f014a04e3e.jpg?1783937888","artUrl":"https://cards.scryfall.io/art_crop/front/6/0/60682c00-c661-4a9d-8326-f3f014a04e3e.jpg?1783937888","commanderLegal":"legal","set":"ogw","releasedAt":"2016-01-22","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const shatter = (): CardDef => ({"oracleId":"84d32e68-72b9-432d-a023-7bc6a26b8ad0","name":"Shatter","manaCost":"{1}{R}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target artifact.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/2/929a41f7-f52d-4190-a80c-5ceb3e368a31.jpg?1783935294","artUrl":"https://cards.scryfall.io/art_crop/front/9/2/929a41f7-f52d-4190-a80c-5ceb3e368a31.jpg?1783935294","commanderLegal":"legal","set":"rix","releasedAt":"2018-01-19","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const ancientDen = (): CardDef => ({"oracleId":"02f16726-f2f6-4943-b71a-93f8e26251d3","name":"Ancient Den","manaCost":"","cmc":0,"typeLine":"Artifact Land","supertypes":[],"types":["Artifact","Land"],"subtypes":[],"oracleText":"{T}: Add {W}.","colors":[],"colorIdentity":["W"],"keywords":[],"producedMana":["W"],"imageUrl":"https://cards.scryfall.io/normal/front/d/1/d1f4c301-6015-456a-8989-e0055402809e.jpg?1783925175","artUrl":"https://cards.scryfall.io/art_crop/front/d/1/d1f4c301-6015-456a-8989-e0055402809e.jpg?1783925175","commanderLegal":"legal","set":"sld","releasedAt":"2021-10-15","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

describe("Groffskithur: return target card named ~ from your graveyard as it becomes blocked", () => {
  it("compile", () => supported(groffskithur()));

  it("only a card with its name is a legal target, and it can come back to your hand", () => {
    const { s: s0, ap, opp } = setup([]);
    const groff = putOnBattlefield(s0, ap, groffskithur());
    const other = putIn(s0, ap, groffskithur(), "graveyard");
    const bears = putIn(s0, ap, grizzlyBears(), "graveyard");
    const spec = compileCard(groffskithur()).triggers[0]!.body.targets[0]!;
    expect(legalTargets(s0, spec, ap, undefined, undefined, groff).map((t) => (t.kind === "object" ? t.id : ""))).toEqual([other]);
    expect(bears).toBeTruthy();
    // It attacks and an opponent's creature blocks it.
    const blocker = putOnBattlefield(s0, opp, grizzlyBears());
    let s = goTo(s0, "declareAttackers", ap, ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: groff, defender: opp }] });
    for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = s.pending ? run(s, botActions(s, s.pending.player)) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("declareBlockers");
    s = act(s, { type: "declareBlockers", player: s.pending!.player, blocks: s.pending!.player === opp ? [{ blocker, attacker: groff }] : [] });
    for (let i = 0; i < 10 && s.pending?.kind === "declareBlockers"; i++) s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: s.pending.player === opp ? [{ blocker, attacker: groff }] : [] });
    s = settle(s);
    expect(s.objects[other]!.zone).toBe("hand");
    expect(s.objects[bears]!.zone).toBe("graveyard");
  });
});

describe("Mindblaze: a nonland card name and a number, then the target player's library is revealed", () => {
  it("compile", () => supported(mindblaze()));

  it("exactly the chosen number of cards with that name: 8 damage, and that player shuffles", () => {
    const { s: s0, ap, ids, opp } = setup([mindblaze()]);
    const n = s0.players[opp]!.library.filter((id) => nameOf(s0, id) === "Grizzly Bears").length;
    expect(n).toBeGreaterThan(1);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [plr(opp)])), { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "cardName" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Grizzly Bears" }), { me: [ap] });
    // Up to the cards in that library.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "number", numberRange: { min: 1, max: s.players[opp]!.library.length } });
    const life = s.players[opp]!.life;
    s = settle(act(s, { type: "chooseOption", player: ap, choice: String(n) }));
    expect(s.players[opp]!.life).toBe(life - 8);
    expect(s.log.some((l) => /reveals their library/.test(l.text ?? String(l)))).toBe(true);
  });

  it("any other number: no damage", () => {
    const { s: s0, ap, ids, opp } = setup([mindblaze()]);
    const n = s0.players[opp]!.library.filter((id) => nameOf(s0, id) === "Grizzly Bears").length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [plr(opp)])), { me: [ap] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Grizzly Bears" }), { me: [ap] });
    const life = s.players[opp]!.life;
    s = settle(act(s, { type: "chooseOption", player: ap, choice: String(n - 1) }));
    expect(s.players[opp]!.life).toBe(life);
  });

  it("a bot names a card and the number one", () => {
    const { s: s0, ap, ids, opp } = setup([mindblaze()]);
    let s = run(s0, planCast(s0, ap, ids[0]!, [plr(opp)]));
    s = settle(s);
    expect(s.stack.length).toBe(0);
    expect(s.log.some((l) => /reveals their library/.test(l.text ?? String(l)))).toBe(true);
  });
});

describe("Rite of Ruin: an order for artifacts, creatures and lands; one, two, then three sacrificed", () => {
  it("compile", () => supported(riteOfRuin()));

  it("each player sacrifices one of the first type, two of the second, three of the third", () => {
    const { s: s0, ap, ids, opp } = setup([riteOfRuin()]);
    // The opponent: an artifact creature, two more creatures, three lands, a Sol Ring.
    const thopter = putOnBattlefield(s0, opp, ornithopter());
    const ring = putOnBattlefield(s0, opp, solRing());
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, opp, grizzlyBears());
    for (let i = 0; i < 4; i++) putOnBattlefield(s0, opp, realForest());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "typeOrder" });
    if (s.pending?.kind !== "chooseOption") return;
    expect(s.pending.options).toHaveLength(6);
    const myLands = mine(s, ap, "Land").length;
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Creature,Artifact,Land" }));
    expect(s.stack.length).toBe(0);
    // One creature, then two artifacts, then three lands.
    expect(mine(s, opp, "Creature").length).toBe(2);
    expect(mine(s, opp, "Artifact").length).toBe(3 - 1 - 2 + (s.objects[thopter]!.zone === "battlefield" ? 0 : 0));
    expect(mine(s, opp, "Land").length).toBe(1);
    expect(mine(s, ap, "Land").length).toBe(myLands - 3);
    expect(s.objects[ring]!.zone).toBe("graveyard");
  });

  it("the order matters: an artifact creature sacrificed as the artifact isn't there for the creatures", () => {
    const { s: s0, ap, ids, opp } = setup([riteOfRuin()]);
    const thopter = putOnBattlefield(s0, opp, ornithopter());
    const bears = [putOnBattlefield(s0, opp, grizzlyBears()), putOnBattlefield(s0, opp, grizzlyBears())];
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: [ap] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Artifact,Creature,Land" }));
    expect(s.objects[thopter]!.zone).toBe("graveyard");
    for (const b of bears) expect(s.objects[b]!.zone).toBe("graveyard");
  });

  it("a bot chooses an order that costs its opponents more than itself", () => {
    const { s: s0, ap, ids, opp } = setup([riteOfRuin()]);
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, opp, grizzlyBears());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, { me: [ap] });
    if (s.pending?.kind !== "chooseOption") throw new Error("no order asked");
    const pick = botActions(s, ap)[0];
    // We have only lands: lands go first (one), creatures (theirs) last (three).
    expect(pick).toMatchObject({ type: "chooseOption", choice: "Land,Artifact,Creature" });
  });
});

describe("Eye of Singularity: permanents sharing a name are destroyed", () => {
  it("compile", () => {
    supported(eyeOfSingularity());
    expect(JSON.stringify(compileCard(eyeOfSingularity()).triggers)).toContain('"noRegen":true');
  });

  it("as it enters, each permanent with another's name but basic lands; then each one entering destroys the others with its name", () => {
    const { s: s0, ap, ids, opp } = setup([eyeOfSingularity(), solRing()]);
    const rings = [putOnBattlefield(s0, ap, solRing()), putOnBattlefield(s0, opp, solRing())];
    const stone = putOnBattlefield(s0, opp, mindStone());
    const islands = mine(s0, ap, "Land");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    for (const r of rings) expect(s.objects[r]!.zone).toBe("graveyard");
    expect(s.objects[stone]!.zone).toBe("battlefield");
    for (const l of islands) expect(s.objects[l]!.zone).toBe("battlefield");
    // A Mind Stone entering destroys the other one, not itself.
    const second = putIn(s, ap, mindStone(), "hand");
    s.players[ap]!.manaPool.C = 2;
    s = settle(run(s, planCast(s, ap, second)));
    expect(s.objects[second]!.zone).toBe("battlefield");
    expect(s.objects[stone]!.zone).toBe("graveyard");
    // A Sol Ring entering alone: nothing else has its name.
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
  });

  it("a basic land entering doesn't trigger it", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, eyeOfSingularity());
    const land = putIn(s0, opp, realIsland(), "hand");
    expect(land).toBeTruthy();
    const mine0 = putIn(s0, ap, realIsland(), "hand");
    s0.players[ap]!.landsPlayedThisTurn = 0;
    const s = settle(act(s0, { type: "playLand", player: ap, objectId: mine0 }));
    expect(s.triggerQueue.length + s.stack.length).toBe(0);
    expect(mine(s, ap, "Land").filter((id) => nameOf(s, id) === "Island").length).toBeGreaterThan(1);
  });
});

describe("Cornered Market: no spell or nonbasic land with a nontoken permanent's name", () => {
  it("compile", () => supported(corneredMarket()));

  it("a spell named like a permanent can't be cast; a land like a nonbasic one can't be played; basics and face-down spells can", () => {
    const { s, ap, ids, opp } = setup([solRing(), ancientDen(), realIsland(), shorecrasherElemental(), grizzlyBears()]);
    putOnBattlefield(s, opp, corneredMarket());
    putOnBattlefield(s, opp, solRing());
    putOnBattlefield(s, opp, ancientDen());
    putOnBattlefield(s, opp, shorecrasherElemental());
    expect(castProblem(s, ap, ids[0]!)).toMatch(/same name as a nontoken permanent/);
    expect(planCast(s, ap, ids[0]!)).toBeNull();
    expect(canPlayLandNow(s, ap, ids[1]!)).toBe(false);
    expect(canPlayLandNow(s, ap, ids[2]!)).toBe(true);
    // Face up it has the name; face down it has none (CR 708.2a).
    expect(planCast(s, ap, ids[3]!)).toBeNull();
    expect(planCast(s, ap, ids[3]!, undefined, undefined, undefined, undefined, { faceDown: true })).not.toBeNull();
    expect(planCast(s, ap, ids[4]!)).not.toBeNull();
  });
});

describe("Sengir Nosferatu: a Bat that returns an exiled card named Sengir Nosferatu", () => {
  it("compile", () => supported(sengirNosferatu()));

  it("exiled for a Bat, then the Bat brings it back; with two exiled, you choose which, under its owner's control", () => {
    const { s: s0, ap, opp } = setup([]);
    const vamp = putOnBattlefield(s0, ap, sengirNosferatu());
    let s = settle(run(s0, planActivate(s0, ap, vamp, 0)));
    expect(s.objects[vamp]!.zone).toBe("exile");
    const bat = s.battlefield.find((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap)!;
    expect(nameOf(s, bat)).toMatch(/Bat/);
    // Another player's Nosferatu, exiled too.
    const theirs = putIn(s, opp, sengirNosferatu(), "exile");
    s = settle(run(s, planActivate(s, ap, bat, 0)), { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "searchLibrary" });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [theirs] }));
    expect(s.objects[theirs]!.zone).toBe("battlefield");
    expect(s.objects[theirs]!.controller).toBe(opp);
    expect(s.objects[vamp]!.zone).toBe("exile");
    expect(s.objects[bat]?.zone ?? "gone").not.toBe("battlefield");
  });
});

describe("Knowledge Vault: cards exiled face down, into their owners' hands as it's sacrificed", () => {
  it("compile", () => supported(knowledgeVault()));

  it("{0}: sacrificed, the hand discarded, then the exiled cards put into the hand; its leaves trigger finds none", () => {
    const { s: s0, ap, ids } = setup([grizzlyBears()]);
    const vault = putOnBattlefield(s0, ap, knowledgeVault());
    const top = s0.players[ap]!.library.slice(0, 2);
    let s = settle(run(s0, planActivate(s0, ap, vault, 0)));
    s.objects[vault]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, vault, 0)));
    for (const id of top) expect(s.objects[id]!).toMatchObject({ zone: "exile" });
    expect(s.objects[top[0]!]!.hiddenExile || s.objects[top[0]!]!.faceDown).toBeTruthy();
    s = settle(run(s, planActivate(s, ap, vault, 1)));
    expect(s.objects[vault]!.zone).toBe("graveyard");
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    for (const id of top) expect(s.objects[id]!.zone).toBe("hand");
  });

  it("activated twice in response: only the first sacrifices it and gives the cards (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const vault = putOnBattlefield(s0, ap, knowledgeVault());
    const top = s0.players[ap]!.library[0]!;
    let s = settle(run(s0, planActivate(s0, ap, vault, 0)));
    s = run(s, planActivate(s, ap, vault, 1));
    s = run(s, planActivate(s, ap, vault, 1));
    s = settle(s);
    expect(s.objects[top]!.zone).toBe("hand");
  });

  it("leaving the battlefield another way, the exiled cards go to their owners' graveyards", () => {
    const { s: s0, ap, ids } = setup([shatter()]);
    const vault = putOnBattlefield(s0, ap, knowledgeVault());
    const top = s0.players[ap]!.library[0]!;
    let s = settle(run(s0, planActivate(s0, ap, vault, 0)));
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(vault)])));
    expect(s.objects[vault]!.zone).toBe("graveyard");
    expect(s.objects[top]!.zone).toBe("graveyard");
  });
});

describe("Odds // Ends: a coin no one calls: heads counters the spell, tails copies it", () => {
  it("compile", () => supported(oddsEnds()));

  it("heads: Divination is countered; tails: it's copied and both resolve", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed < 40 && seen.size < 2; seed++) {
      const { s: s0, ap, ids } = setup([divination(), oddsEnds()], seed);
      let s = run(s0, planCast(s0, ap, ids[0]!));
      const spell = s.stack[s.stack.length - 1]!;
      const hand = s.players[ap]!.hand.length - 1;
      s = run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: spell.id }], undefined, undefined, undefined, { face: 0 }));
      s = settle(s);
      const heads = s.log.some((l) => /comes up heads/.test(l.text ?? String(l)));
      const tails = s.log.some((l) => /comes up tails/.test(l.text ?? String(l)));
      expect(heads !== tails).toBe(true);
      expect(s.players[ap]!.hand.length).toBe(hand + (heads ? 0 : 4));
      expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
      seen.add(heads ? "heads" : "tails");
    }
    expect([...seen].sort()).toEqual(["heads", "tails"]);
  });

  it("with Krark's Thumb, heads and tails: its controller keeps the one they choose", () => {
    for (let seed = 1; seed < 60; seed++) {
      const { s: s0, ap, ids } = setup([divination(), oddsEnds()], seed);
      putOnBattlefield(s0, ap, krarksThumb());
      let s = run(s0, planCast(s0, ap, ids[0]!));
      const spell = s.stack[s.stack.length - 1]!;
      const hand = s.players[ap]!.hand.length - 1;
      s = run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: spell.id }], undefined, undefined, undefined, { face: 0 }));
      s = settle(s, { me: [ap] });
      if (s.pending?.kind !== "chooseMay") continue;
      expect(s.pending.prompt).toMatch(/keep heads/);
      // Keep tails: the copy.
      s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
      expect(s.log.some((l) => /keeps tails/.test(l.text ?? String(l)))).toBe(true);
      expect(s.players[ap]!.hand.length).toBe(hand + 4);
      return;
    }
    throw new Error("never flipped heads and tails");
  });
});

describe("Spellshift: counter it; its controller reveals until an instant or sorcery and may cast it", () => {
  it("compile", () => supported(spellshift()));

  it("an opponent's Spellshift on your Divination: you reveal until an instant or sorcery and cast it free; the rest are shuffled back", () => {
    const { s: s0, ap, ids, opp } = setup([divination()]);
    const theirs = putIn(s0, opp, spellshift(), "hand");
    // Your library: two lands, then a Divination (no targets to choose).
    const found = putIn(s0, ap, divination(), "library");
    putIn(s0, ap, realForest(), "library");
    putIn(s0, ap, realForest(), "library");
    const size = s0.players[ap]!.library.length;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    const spell = s.stack[s.stack.length - 1]!;
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    s.players[opp]!.manaPool = { W: 0, U: 4, B: 0, R: 0, G: 0, C: 0 };
    s = run(s, planCast(s, opp, theirs, [{ kind: "stack", id: spell.id }]));
    s = settle(s, { me: [ap] });
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: found });
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "castSpell", player: ap, objectId: found }));
    expect(s.objects[found]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(s.players[ap]!.library.length).toBe(size - 1 - 2);
  });

  it("not cast, the card is shuffled back into the library", () => {
    const { s: s0, ap, ids } = setup([divination(), spellshift()]);
    const found = putIn(s0, ap, divination(), "library");
    putIn(s0, ap, realForest(), "library");
    const size = s0.players[ap]!.library.length;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    const spell = s.stack[s.stack.length - 1]!;
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: spell.id }]));
    s = settle(s, { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: found });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.objects[found]!.zone).toBe("library");
    expect(s.players[ap]!.library.length).toBe(size);
  });
});

describe("Shorecrasher Elemental: exiled and returned face down, then turned face up for its megamorph cost", () => {
  it("compile", () => supported(shorecrasherElemental()));

  it("{U}: back face down as a new 2/2 under its owner's control; megamorph turns it up with a +1/+1 counter", () => {
    const { s: s0, ap } = setup([]);
    const sc = putOnBattlefield(s0, ap, shorecrasherElemental());
    s0.objects[sc]!.counters["+1/+1"] = 1;
    let s = settle(run(s0, planActivate(s0, ap, sc, 0)));
    expect(s.objects[sc]!.zone).toBe("battlefield");
    expect(s.objects[sc]!.faceDown).toBeTruthy();
    expect(ptOf(s, sc)).toBe("2/2");
    expect(s.objects[sc]!.counters["+1/+1"] ?? 0).toBe(0);
    // No name or text face down (CR 708.2a).
    expect(characteristics(s, s.objects[sc]!).name).not.toBe("Shorecrasher Elemental");
    s.players[ap]!.manaPool = { W: 0, U: 1, B: 0, R: 0, G: 0, C: 4 };
    s = act(s, { type: "turnFaceUp", player: ap, objectId: sc });
    expect(s.objects[sc]!.faceDown).toBeFalsy();
    expect(ptOf(s, sc)).toBe("4/4");
  });
});
