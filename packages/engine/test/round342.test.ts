// Round 342 (Lane A): Iron Man, Titan of Innovation ("you may sacrifice a noncreature artifact. If you do, ... 1 plus the
// sacrificed artifact's mana value"), Petrified Hamlet ("When this land enters, choose a land card name", kept on the
// land), Orvar, the All-Form ("if it targets one or more other permanents you control, create a token that's a copy of
// one of those permanents"), Sin, Unending Cataclysm ("As ~ enters, remove all counters from any number of artifacts,
// creatures, and enchantments", "put its counters on target creature you control, then shuffle ~ into its owner's
// library") and Moxite Refinery ("Remove X counters from an artifact or creature you control").

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, applyAction, botActions, characteristics, compileCard, invalidateCharacteristics, isFullySupported, abilitiesOf, moveObject, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PendingDecision, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const pend = <K extends PendingDecision["kind"]>(s: GameState, kind: K) => {
  expect(s.pending?.kind).toBe(kind);
  return s.pending as Extract<PendingDecision, { kind: K }>;
};
const name = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;
const treasures = (s: GameState) => Object.values(s.objects).filter((o) => o.zone === "battlefield" && o.isToken && characteristics(s, o).subtypes.includes("Treasure")).map((o) => o.id);
const named = (s: GameState, n: string, zone = "battlefield") => Object.values(s.objects).filter((o) => o.zone === zone && name(s, o.id) === n).map((o) => o.id);
/** A copy of `def` in `pid`'s `zone` (hand, graveyard or library, on top). */
const put = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "hand") s.players[pid]!.hand.push(id);
  else if (zone === "graveyard") s.players[pid]!.graveyard.push(id);
  else s.players[pid]!.library.unshift(id);
  invalidateCharacteristics(s);
  return id;
};
/** Everyone passes, other questions as the bots would answer them, until a triggered ability is on the stack. */
const untilAbility = (s: GameState) => {
  for (let i = 0; i < 100 && !s.stack.some((x) => x.kind === "ability"); i++) {
    const p = s.pending;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** `ap` attacks `defender` with `attackers`, nobody blocks; stops at a question of `me`'s or once the attack trigger is done. */
const attack = (s: GameState, ap: PlayerId, attackers: string[], defender: PlayerId, me?: PlayerId) => {
  s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: attackers.map((attacker) => ({ attacker, defender })) });
  return settle(s, me);
};

// Real oracle text (Scryfall).
const ironMan = (): CardDef => ({"oracleId":"67ab82de-1167-42f5-90bd-21c63edcc712","name":"Iron Man, Titan of Innovation","manaCost":"{3}{U}{R}","cmc":5,"typeLine":"Legendary Artifact Creature — Human Hero","supertypes":["Legendary"],"types":["Artifact","Creature"],"subtypes":["Human","Hero"],"oracleText":"Flying, haste\nGenius Industrialist — Whenever Iron Man attacks, create a Treasure token, then you may sacrifice a noncreature artifact. If you do, search your library for an artifact card with mana value equal to 1 plus the sacrificed artifact's mana value, put it onto the battlefield tapped, then shuffle.","power":"4","toughness":"4","colors":["R","U"],"colorIdentity":["R","U"],"keywords":["Flying","Genius Industrialist","Treasure","Haste"],"imageUrl":"https://cards.scryfall.io/normal/front/7/5/7542b1d1-e34d-46dc-af24-1b718034c0e4.jpg?1783909140","artUrl":"https://cards.scryfall.io/art_crop/front/7/5/7542b1d1-e34d-46dc-af24-1b718034c0e4.jpg?1783909140","commanderLegal":"legal","set":"sld","releasedAt":"2024-11-04","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const petrifiedHamlet = (): CardDef => ({"oracleId":"78a2972c-14f4-41f3-99f9-167948bdd73a","name":"Petrified Hamlet","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"When this land enters, choose a land card name.\nActivated abilities of sources with the chosen name can't be activated unless they're mana abilities.\nLands with the chosen name have \"{T}: Add {C}.\"\n{T}: Add {C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/3/5/355dd460-b0e9-41f2-a058-b7f7e39ac387.jpg?1783903620","artUrl":"https://cards.scryfall.io/art_crop/front/3/5/355dd460-b0e9-41f2-a058-b7f7e39ac387.jpg?1783903620","commanderLegal":"legal","set":"sos","releasedAt":"2026-04-24","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const orvar = (): CardDef => ({"oracleId":"276c4643-13ad-43bf-840b-08c025ebc065","name":"Orvar, the All-Form","manaCost":"{3}{U}","cmc":4,"typeLine":"Legendary Creature — Shapeshifter","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"Changeling\nWhenever you cast an instant or sorcery spell, if it targets one or more other permanents you control, create a token that's a copy of one of those permanents.\nWhen a spell or ability an opponent controls causes you to discard this card, create a token that's a copy of target permanent.","power":"3","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Changeling"],"imageUrl":"https://cards.scryfall.io/normal/front/7/f/7f36775e-9e48-49cc-a771-d58481712edc.jpg?1783928258","artUrl":"https://cards.scryfall.io/art_crop/front/7/f/7f36775e-9e48-49cc-a771-d58481712edc.jpg?1783928258","commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const sin = (): CardDef => ({"oracleId":"48534bbf-06b6-46a0-8a86-b14f38caee58","name":"Sin, Unending Cataclysm","manaCost":"{5}{G}{U}","cmc":7,"typeLine":"Legendary Creature — Leviathan Avatar","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Leviathan","Avatar"],"oracleText":"Flying, trample\nAs Sin enters, remove all counters from any number of artifacts, creatures, and enchantments. Sin enters with X +1/+1 counters on it, where X is twice the number of counters removed this way.\nWhen Sin dies, put its counters on target creature you control, then shuffle this card into its owner's library.","power":"5","toughness":"5","colors":["G","U"],"colorIdentity":["G","U"],"keywords":["Flying","Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/f/c/fc0474b7-3d32-49b4-80c7-822de6cdbfa6.jpg?1783906341","artUrl":"https://cards.scryfall.io/art_crop/front/f/c/fc0474b7-3d32-49b4-80c7-822de6cdbfa6.jpg?1783906341","commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const moxiteRefinery = (): CardDef => ({"oracleId":"3fe9367b-def1-4820-9e23-92ce3d7a4afc","name":"Moxite Refinery","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{2}, {T}, Remove X counters from an artifact or creature you control: Choose one. Activate only as a sorcery.\n• Put X charge counters on target artifact.\n• Put X +1/+1 counters on target creature.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/d/ad617991-21c0-47c6-bc84-6e7c33edf7ee.jpg?1783906062","artUrl":"https://cards.scryfall.io/art_crop/front/a/d/ad617991-21c0-47c6-bc84-6e7c33edf7ee.jpg?1783906062","commanderLegal":"legal","set":"eoc","releasedAt":"2025-08-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const giantGrowth = (): CardDef => ({"oracleId":"5748ebf1-24e3-499d-ab7c-c2cebd462a24","name":"Giant Growth","manaCost":"{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature gets +3/+3 until end of turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/d/fd1f95bf-48ea-455a-8a6c-0249b11c8900.jpg?1783902918","artUrl":"https://cards.scryfall.io/art_crop/front/f/d/fd1f95bf-48ea-455a-8a6c-0249b11c8900.jpg?1783902918","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const mindStone = (): CardDef => ({"oracleId":"c97361b5-af16-4a7b-af85-a429dbaf4ad2","name":"Mind Stone","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/7/f/7fdef0b6-a3b9-4752-bce6-53c0140a1693.jpg?1783906237","artUrl":"https://cards.scryfall.io/art_crop/front/7/f/7fdef0b6-a3b9-4752-bce6-53c0140a1693.jpg?1783906237","commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const wayfarersBauble = (): CardDef => ({"oracleId":"31f15274-301b-47c5-ba19-0ced04520878","name":"Wayfarer's Bauble","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{2}, {T}, Sacrifice this artifact: Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/9/69dd3fa7-5498-4b88-bc98-6de8ca5fe007.jpg?1783906229","artUrl":"https://cards.scryfall.io/art_crop/front/6/9/69dd3fa7-5498-4b88-bc98-6de8ca5fe007.jpg?1783906229","commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const mishrasFactory = (): CardDef => ({"oracleId":"5963e0ef-e0bc-4611-ad4f-813a4c0eacfb","name":"Mishra's Factory","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{1}: This land becomes a 2/2 Assembly-Worker artifact creature until end of turn. It's still a land.\n{T}: Target Assembly-Worker creature gets +1/+1 until end of turn.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/c/9/c9eb1309-5e60-4b8f-b63c-ebe62030db5c.jpg?1783920232","artUrl":"https://cards.scryfall.io/art_crop/front/c/9/c9eb1309-5e60-4b8f-b63c-ebe62030db5c.jpg?1783920232","commanderLegal":"legal","set":"slc","releasedAt":"2022-11-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const roguesPassage = (): CardDef => ({"oracleId":"f29dc596-2121-4421-8463-15f6c2e8b9b3","name":"Rogue's Passage","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{4}, {T}: Target creature can't be blocked this turn.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/b/8/b8cd0293-d140-4f80-804c-019957c1f49a.jpg?1783906211","artUrl":"https://cards.scryfall.io/art_crop/front/b/8/b8cd0293-d140-4f80-804c-019957c1f49a.jpg?1783906211","commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const pithingNeedle = (): CardDef => ({"oracleId":"a188fe7e-68de-4c7c-806c-bfe8fc7b44bf","name":"Pithing Needle","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"As this artifact enters, choose a card name.\nActivated abilities of sources with the chosen name can't be activated unless they're mana abilities.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/8/98044438-7534-41a9-944b-ea2e2d80fe9d.jpg?1783924323","artUrl":"https://cards.scryfall.io/art_crop/front/9/8/98044438-7534-41a9-944b-ea2e2d80fe9d.jpg?1783924323","commanderLegal":"legal","set":"dbl","releasedAt":"2022-01-28","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const fling = (): CardDef => ({"oracleId":"24227761-b50e-4b9e-93a2-e82d053b3e3d","name":"Fling","manaCost":"{1}{R}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"As an additional cost to cast this spell, sacrifice a creature.\nFling deals damage equal to the sacrificed creature's power to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/b/cb28fe03-8269-41de-b766-42c3421aeaef.jpg?1783932623","artUrl":"https://cards.scryfall.io/art_crop/front/c/b/cb28fe03-8269-41de-b766-42c3421aeaef.jpg?1783932623","commanderLegal":"legal","set":"eld","releasedAt":"2019-10-04","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const cancel = (): CardDef => ({"oracleId":"7d00fb28-ea6c-49a9-b4af-ffb38860a9a7","name":"Cancel","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target spell.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/f/cf6e5ad6-ffe2-4588-b357-c415c33fbc11.jpg?1783935790","artUrl":"https://cards.scryfall.io/art_crop/front/c/f/cf6e5ad6-ffe2-4588-b357-c415c33fbc11.jpg?1783935790","commanderLegal":"legal","set":"xln","releasedAt":"2017-09-29","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const weddingRing = (): CardDef => ({"oracleId":"0c34e962-99d9-4163-b852-4f61886546aa","name":"Wedding Ring","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"When this artifact enters, if it was cast, target opponent creates a token that's a copy of it.\nWhenever an opponent who controls an artifact named Wedding Ring draws a card during their turn, you draw a card.\nWhenever an opponent who controls an artifact named Wedding Ring gains life during their turn, you gain that much life.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/d/6d8fd9a7-d1bd-43bd-a136-49dc26621e4d.jpg?1783914602","artUrl":"https://cards.scryfall.io/art_crop/front/6/d/6d8fd9a7-d1bd-43bd-a136-49dc26621e4d.jpg?1783914602","commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const hedronArchive = (): CardDef => ({"oracleId":"32263baa-d3f0-463f-92b3-4e9938476add","name":"Hedron Archive","manaCost":"{4}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.\n{2}, {T}, Sacrifice this artifact: Draw two cards.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/2/f/2feb16d2-7406-45ab-9595-e6c48fc47bf5.jpg?1783920752","artUrl":"https://cards.scryfall.io/art_crop/front/2/f/2feb16d2-7406-45ab-9595-e6c48fc47bf5.jpg?1783920752","commanderLegal":"legal","set":"40k","releasedAt":"2022-10-07","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const simicSignet = (): CardDef => ({"oracleId":"44503105-3e13-408d-a44f-37d503c61d72","name":"Simic Signet","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{1}, {T}: Add {G}{U}.","colors":[],"colorIdentity":["G","U"],"keywords":[],"producedMana":["G","U"],"imageUrl":"https://cards.scryfall.io/normal/front/b/5/b58e931a-d4dd-4705-ae31-89c0aecbf192.jpg?1783926552","artUrl":"https://cards.scryfall.io/art_crop/front/b/5/b58e931a-d4dd-4705-ae31-89c0aecbf192.jpg?1783926552","commanderLegal":"legal","set":"sld","releasedAt":"2021-06-21","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const thranDynamo = (): CardDef => ({"oracleId":"a699c663-8131-4045-9265-a83e86609374","name":"Thran Dynamo","manaCost":"{4}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/7/873d52a8-f10e-4116-8511-bf63aeb2e413.jpg?1783903185","artUrl":"https://cards.scryfall.io/art_crop/front/8/7/873d52a8-f10e-4116-8511-bf63aeb2e413.jpg?1783903185","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const seedsOfStrength = (): CardDef => ({"oracleId":"dd3d4d96-1e88-49e1-8276-7f62c22ad91a","name":"Seeds of Strength","manaCost":"{G}{W}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature gets +1/+1 until end of turn.\nTarget creature gets +1/+1 until end of turn.\nTarget creature gets +1/+1 until end of turn.","colors":["G","W"],"colorIdentity":["G","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/f/bfa1ac13-adbd-439a-90b2-9c506aec0836.jpg?1783943613","artUrl":"https://cards.scryfall.io/art_crop/front/b/f/bfa1ac13-adbd-439a-90b2-9c506aec0836.jpg?1783943613","commanderLegal":"legal","set":"rav","releasedAt":"2005-10-07","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const llanowarElves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const forestCard = (): CardDef => ({"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const murder = (): CardDef => ({"oracleId":"938b4e2c-88d9-4637-bc00-e228920c9a78","name":"Murder","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","artUrl":"https://cards.scryfall.io/art_crop/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

describe("round 342: compiles", () => {
  it("every card of the round", () => supported(ironMan(), petrifiedHamlet(), orvar(), sin(), moxiteRefinery()));
});

describe("round 342: Iron Man, Titan of Innovation", () => {
  it("a Treasure, then a sacrificed noncreature artifact finds an artifact with 1 more mana value, tapped", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const iron = putOnBattlefield(s, ap, ironMan());
    const ring = putOnBattlefield(s, ap, solRing());
    const stone = put(s, ap, mindStone(), "library");
    const archive = put(s, ap, hedronArchive(), "library");
    s = attack(s, ap, [iron], opp, ap);
    expect(treasures(s)).toHaveLength(1);
    pend(s, "chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    // Sol Ring or the new Treasure: both noncreature artifacts (CR 205.2a).
    const p = pend(s, "pickPermanents");
    expect(p.options).toEqual(expect.arrayContaining([ring, treasures(s)[0]!]));
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [ring] }), ap);
    expect(s.objects[ring]!.zone).toBe("graveyard");
    // Mana value 2: Mind Stone, not Hedron Archive.
    const search = pend(s, "searchLibrary");
    expect(search.cards).toContain(stone);
    expect(search.cards).not.toContain(archive);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [stone] }), ap);
    expect(s.objects[stone]!.zone).toBe("battlefield");
    expect(s.objects[stone]!.tapped).toBe(true);
  });

  it("the Treasure itself has mana value 0, so it finds a mana value 1 artifact; declining finds nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const iron = putOnBattlefield(s, ap, ironMan());
    const ring = put(s, ap, solRing(), "library");
    s = attack(s, ap, [iron], opp, ap);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    const treasure = treasures(s)[0]!;
    // Only the Treasure: the one noncreature artifact, chosen without a question, or picked.
    if (s.pending?.kind === "pickPermanents") s = settle(act(s, { type: "pickPermanents", player: ap, ids: [treasure] }), ap);
    expect(s.objects[treasure]?.zone ?? "gone").not.toBe("battlefield");
    const search = pend(s, "searchLibrary");
    expect(search.cards).toContain(ring);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [ring] }), ap);
    expect(s.objects[ring]!.zone).toBe("battlefield");

    const { s: t0, ap: ap2, opp: opp2 } = setup([]);
    let t = t0;
    const iron2 = putOnBattlefield(t, ap2, ironMan());
    put(t, ap2, solRing(), "library");
    t = attack(t, ap2, [iron2], opp2, ap2);
    t = settle(act(t, { type: "chooseMay", player: ap2, yes: false }), ap2);
    expect(t.pending?.kind).not.toBe("searchLibrary");
    expect(treasures(t)).toHaveLength(1);
  });
});

describe("round 342: Petrified Hamlet", () => {
  /** `ap` plays Hamlet and names `n` as its trigger resolves. */
  const playNaming = (s: GameState, ap: PlayerId, hamlet: string, n: string) => {
    s = act(s, { type: "playLand", player: ap, objectId: hamlet });
    s = settle(s, ap);
    const p = pend(s, "chooseOption");
    expect(p.what).toBe("cardName");
    expect(p.options).toContain(n);
    return settle(act(s, { type: "chooseOption", player: ap, choice: n }), ap);
  };

  it("the name chosen as its trigger resolves stops that land's other activated abilities, not its mana abilities", () => {
    const { s: s0, ap, opp, ids } = setup([petrifiedHamlet()]);
    let s = s0;
    const factory = putOnBattlefield(s, opp, mishrasFactory());
    // Before the trigger resolves, no name is chosen: nothing is banned yet.
    expect(abilityProblem(s, opp, factory, 0)).not.toMatch(/can't be activated/);
    s = playNaming(s, ap, ids[0]!, "Mishra's Factory");
    expect(s.objects[ids[0]!]!.chosen?.name).toBe("Mishra's Factory");
    expect(abilityProblem(s, opp, factory, 0)).toMatch(/can't be activated unless they're mana abilities/);
    expect(abilitiesOf(s, s.objects[factory]!).mana.length).toBeGreaterThan(0);
  });

  it("lands with the chosen name have {T}: Add {C}", () => {
    const { s: s0, ap, opp, ids } = setup([petrifiedHamlet()]);
    let s = s0;
    const forest = putOnBattlefield(s, opp, forestCard());
    const before = abilitiesOf(s, s.objects[forest]!).mana.length;
    s = playNaming(s, ap, ids[0]!, "Forest");
    const mana = abilitiesOf(s, s.objects[forest]!).mana;
    expect(mana.length).toBe(before + 1);
    expect(mana.some((m) => m.text === "{T}: Add {C}.")).toBe(true);
  });

  it("a bot names a land card", () => {
    const { s: s0, ap, ids } = setup([petrifiedHamlet()]);
    let s = act(s0, { type: "playLand", player: ap, objectId: ids[0]! });
    s = settle(s, ap);
    const p = pend(s, "chooseOption");
    const [a] = botActions(s, ap);
    expect(a?.type).toBe("chooseOption");
    expect(p.options).toContain(a!.type === "chooseOption" ? a!.choice : "");
  });
});

describe("round 342: Orvar, the All-Form", () => {
  it("an instant targeting another creature you control makes a token copy of it, before the spell resolves", () => {
    const { s: s0, ap, ids } = setup([giantGrowth()]);
    let s = s0;
    putOnBattlefield(s, ap, orvar());
    const bears = putOnBattlefield(s, ap, grizzlyBears());
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: bears }]));
    s = settle(s, ap);
    const copies = named(s, "Grizzly Bears").filter((id) => s.objects[id]!.isToken);
    expect(copies).toHaveLength(1);
    // The copy doesn't copy the +3/+3 (CR 707.2, rulings).
    expect(characteristics(s, s.objects[copies[0]!]!).power).toBe(2);
    expect(characteristics(s, s.objects[bears]!).power).toBe(5);
  });

  it("no trigger for a spell targeting only Orvar, or only an opponent's permanent", () => {
    const { s: s0, ap, opp, ids } = setup([giantGrowth(), lightningBolt()]);
    let s = s0;
    const me = putOnBattlefield(s, ap, orvar());
    const theirs = putOnBattlefield(s, opp, grizzlyBears());
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: me }])), ap);
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: theirs }])), ap);
    expect(Object.values(s.objects).filter((o) => o.isToken && o.zone === "battlefield")).toHaveLength(0);
  });

  it("with several of yours targeted you choose which to copy; one that left before it resolves can't be", () => {
    const { s: s0, ap, ids } = setup([seedsOfStrength()]);
    let s = s0;
    putOnBattlefield(s, ap, orvar());
    const bears = putOnBattlefield(s, ap, grizzlyBears());
    const elves = putOnBattlefield(s, ap, llanowarElves());
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: bears }, { kind: "object", id: elves }, { kind: "object", id: elves }]));
    // Orvar's trigger on the stack: the Elves leave.
    s = untilAbility(s);
    const t = structuredClone(s);
    moveObject(t, elves, "graveyard");
    const t2 = settle(t, ap);
    // Only the Bears are left to copy: no question.
    expect(t2.pending?.kind).not.toBe("pickPermanents");
    expect(named(t2, "Grizzly Bears").filter((id) => t2.objects[id]!.isToken)).toHaveLength(1);
    expect(named(t2, "Llanowar Elves").filter((id) => t2.objects[id]!.isToken)).toHaveLength(0);
    // Both still there: a choice between them.
    s = settle(s, ap);
    const p = pend(s, "pickPermanents");
    expect(p.options.sort()).toEqual([bears, elves].sort());
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [elves] }), ap);
    expect(named(s, "Llanowar Elves").filter((id) => s.objects[id]!.isToken)).toHaveLength(1);
  });
});

describe("round 342: Sin, Unending Cataclysm", () => {
  it("removes all counters from the permanents chosen as it enters, anyone's, and enters with twice that many +1/+1 counters", () => {
    const { s: s0, ap, opp, ids } = setup([sin()]);
    let s = s0;
    const mine = putOnBattlefield(s, ap, grizzlyBears());
    const theirs = putOnBattlefield(s, opp, grizzlyBears());
    const archive = putOnBattlefield(s, opp, hedronArchive());
    const kept = putOnBattlefield(s, opp, llanowarElves());
    s.objects[mine]!.counters["-1/-1"] = 1;
    s.objects[theirs]!.counters["+1/+1"] = 2;
    s.objects[theirs]!.counters.shield = 1;
    s.objects[archive]!.counters.charge = 3;
    s.objects[kept]!.counters["+1/+1"] = 4;
    invalidateCharacteristics(s);
    s = settle(run(s, planCast(s, ap, ids[0]!)), ap);
    const p = pend(s, "pickPermanents");
    expect(p.objectId).toBe(ids[0]);
    expect(p.min).toBe(0);
    // Only those with counters; not Sin itself.
    expect(p.options.sort()).toEqual([mine, theirs, archive, kept].sort());
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [mine, theirs, archive] }), ap);
    expect(s.objects[mine]!.counters["-1/-1"] ?? 0).toBe(0);
    expect(s.objects[theirs]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.objects[theirs]!.counters.shield ?? 0).toBe(0);
    expect(s.objects[archive]!.counters.charge ?? 0).toBe(0);
    expect(s.objects[kept]!.counters["+1/+1"]).toBe(4);
    // 1 + 3 + 3 removed: 14 +1/+1 counters.
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(14);
  });

  it("choosing nothing, it enters with none", () => {
    const { s: s0, ap, opp, ids } = setup([sin()]);
    let s = s0;
    const theirs = putOnBattlefield(s, opp, grizzlyBears());
    s.objects[theirs]!.counters["+1/+1"] = 2;
    s = settle(run(s, planCast(s, ap, ids[0]!)), ap);
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [] }), ap);
    expect(s.objects[ids[0]!]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.objects[theirs]!.counters["+1/+1"]).toBe(2);
  });

  it("a bot takes its opponents' counters and keeps its own +1/+1 counters", () => {
    const { s: s0, ap, opp, ids } = setup([sin()]);
    let s = s0;
    const mine = putOnBattlefield(s, ap, grizzlyBears());
    const sick = putOnBattlefield(s, ap, grizzlyBears());
    const theirs = putOnBattlefield(s, opp, grizzlyBears());
    s.objects[mine]!.counters["+1/+1"] = 2;
    s.objects[sick]!.counters["-1/-1"] = 1;
    s.objects[theirs]!.counters["+1/+1"] = 1;
    s = settle(run(s, planCast(s, ap, ids[0]!)), ap);
    pend(s, "pickPermanents");
    const [a] = botActions(s, ap);
    expect(a?.type === "pickPermanents" ? [...a.ids].sort() : []).toEqual([sick, theirs].sort());
  });

  it("when it dies, every kind of counter it had goes on target creature you control, then it's shuffled into its owner's library", () => {
    const { s: s0, ap, ids } = setup([murder()]);
    let s = s0;
    const me = putOnBattlefield(s, ap, sin());
    const bears = putOnBattlefield(s, ap, grizzlyBears());
    s.objects[me]!.counters["+1/+1"] = 6;
    s.objects[me]!.counters.flying = 1;
    invalidateCharacteristics(s);
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: me }]));
    s = settle(s, ap);
    // The dies trigger's one target: the Bears, without a question, or chosen.
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: bears }] }), ap);
    expect(s.objects[bears]!.counters["+1/+1"]).toBe(6);
    expect(s.objects[bears]!.counters.flying).toBe(1);
    expect(s.objects[me]!.zone).toBe("library");
  });

  it("with its target gone as the trigger resolves, it does nothing: Sin stays in the graveyard (rulings)", () => {
    const { s: s0, ap, ids } = setup([murder()]);
    let s = s0;
    const me = putOnBattlefield(s, ap, sin());
    const bears = putOnBattlefield(s, ap, grizzlyBears());
    s.objects[me]!.counters["+1/+1"] = 2;
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: me }]));
    s = untilAbility(s);
    expect(s.stack.some((x) => x.kind === "ability")).toBe(true);
    moveObject(s, bears, "graveyard");
    s = settle(s, ap);
    expect(s.objects[me]!.zone).toBe("graveyard");
  });
});

describe("round 342: Moxite Refinery", () => {
  it("X counters of any kinds from one artifact or creature you control, then X counters of the mode's kind", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const refinery = putOnBattlefield(s, ap, moxiteRefinery());
    const bears = putOnBattlefield(s, ap, grizzlyBears());
    const elves = putOnBattlefield(s, ap, llanowarElves());
    const archive = putOnBattlefield(s, ap, hedronArchive());
    // (+1/+1 and -1/-1 counters would cancel out, CR 704.5q.)
    s.objects[bears]!.counters["+1/+1"] = 2;
    s.objects[bears]!.counters.shield = 1;
    s.objects[elves]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s);
    // Counters from two permanents: refused.
    expect(abilityProblem(s, ap, refinery, 0, [{ kind: "object", id: archive }], [0], undefined, 3, { counters: [{ id: bears, kind: "+1/+1" }, { id: bears, kind: "shield" }, { id: elves, kind: "+1/+1" }] })).toMatch(/same permanent/);
    // More than any one of them has: refused.
    expect(abilityProblem(s, ap, refinery, 0, [{ kind: "object", id: archive }], [0], undefined, 4)).toMatch(/you need to remove 4 counters/);
    s = settle(run(s, planActivate(s, ap, refinery, 0, [{ kind: "object", id: archive }], [0], undefined, 3, { counters: [{ id: bears, kind: "+1/+1" }, { id: bears, kind: "+1/+1" }, { id: bears, kind: "shield" }] })), ap);
    expect(s.pending).toBeNull();
    expect(s.objects[bears]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.objects[bears]!.counters.shield ?? 0).toBe(0);
    expect(s.objects[elves]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[archive]!.counters.charge).toBe(3);
    expect(s.objects[refinery]!.tapped).toBe(true);
  });

  it("X can be 0, and the second mode puts +1/+1 counters on a creature; only as a sorcery", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const refinery = putOnBattlefield(s, ap, moxiteRefinery());
    const bears = putOnBattlefield(s, ap, grizzlyBears());
    const plan = planActivate(s, ap, refinery, 0, [{ kind: "object", id: bears }], [1], undefined, 0);
    expect(plan).not.toBeNull();
    s = settle(run(s, plan), ap);
    expect(s.objects[bears]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(compileCard(moxiteRefinery()).activated[0]!.sorcerySpeed).toBe(true);
  });
});
const enigmaticIncarnation = (): CardDef => ({"oracleId":"915091d5-3f58-4429-8f3a-0fd7aef87afe","name":"Enigmatic Incarnation","manaCost":"{2}{G}{U}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your end step, you may sacrifice another enchantment. If you do, search your library for a creature card with mana value equal to 1 plus the sacrificed enchantment's mana value, put that card onto the battlefield, then shuffle.","colors":["G","U"],"colorIdentity":["G","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/dd116c0b-0404-42ba-978f-7044b1a03d90.jpg?1783931521","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/dd116c0b-0404-42ba-978f-7044b1a03d90.jpg?1783931521","commanderLegal":"legal","set":"thb","releasedAt":"2020-01-24","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const phyrexianArena = (): CardDef => ({"oracleId":"ee579a32-a048-4335-b966-231ba731cdea","name":"Phyrexian Arena","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your upkeep, you draw a card and lose 1 life.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/4/54f69d43-de01-46a8-b102-b47e23e0e947.jpg?1783918042","artUrl":"https://cards.scryfall.io/art_crop/front/5/4/54f69d43-de01-46a8-b102-b47e23e0e947.jpg?1783918042","commanderLegal":"legal","set":"one","releasedAt":"2023-02-10","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

describe("round 342: Enigmatic Incarnation (the same optional sacrifice as Iron Man's)", () => {
  it("sacrifices another enchantment at your end step for a creature with 1 more mana value", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    supported(enigmaticIncarnation());
    const me = putOnBattlefield(s, ap, enigmaticIncarnation());
    const arena = putOnBattlefield(s, ap, phyrexianArena());
    const giant = put(s, ap, hillGiant(), "library");
    const bears = put(s, ap, grizzlyBears(), "library");
    s = passUntil(s, "end", ap);
    s = settle(s, ap);
    pend(s, "chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    // Only the Arena: not the Incarnation itself ("another").
    if (s.pending?.kind === "pickPermanents") {
      expect(s.pending.options).toEqual([arena]);
      s = settle(act(s, { type: "pickPermanents", player: ap, ids: [arena] }), ap);
    }
    expect(s.objects[arena]!.zone).toBe("graveyard");
    expect(s.objects[me]!.zone).toBe("battlefield");
    const search = pend(s, "searchLibrary");
    expect(search.cards).toContain(giant);
    expect(search.cards).not.toContain(bears);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [giant] }), ap);
    expect(s.objects[giant]!.zone).toBe("battlefield");
  });
});
