// Lane B round B98: a permanent put onto the battlefield with "it's a ..." has that as it enters (CR 614.12), and the round's cards.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, botActions, characteristics, defOf, foretellProblem, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, turnFaceUpProblem, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
/** Moves a new card for `def` from the battlefield into `pid`'s `zone`. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const brilliance = (): CardDef => ({"oracleId":"b047cd3f-9129-41cc-8b91-b0dc970f5068","name":"Brilliance Unleashed","manaCost":"{4}{U}{R}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose one or both \u2014\n\u2022 Brilliance Unleashed deals 5 damage to target creature.\n\u2022 Choose target artifact card in your graveyard. Return it to the battlefield if it's an artifact creature card. Otherwise, return it to the battlefield and it's a 3/3 Robot artifact creature with flying.","colors":["R","U"],"colorIdentity":["R","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/7/b7ab2110-5aad-46c9-8dc4-1eac24b6f46b.jpg?1783904079","artUrl":"https://cards.scryfall.io/art_crop/front/b/7/b7ab2110-5aad-46c9-8dc4-1eac24b6f46b.jpg?1783904079","commanderLegal":"legal","set":"tmt","releasedAt":"2026-03-06","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const stormOfSouls = (): CardDef => ({"oracleId":"7022ae9a-2589-493b-a050-a230fd02f80b","name":"Storm of Souls","manaCost":"{4}{W}{W}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Return all creature cards from your graveyard to the battlefield. Each of them is a 1/1 Spirit with flying in addition to its other types. Exile Storm of Souls.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/0/30cb1c3f-19d4-47d3-960e-f2de828e6feb.jpg?1783925007","artUrl":"https://cards.scryfall.io/art_crop/front/3/0/30cb1c3f-19d4-47d3-960e-f2de828e6feb.jpg?1783925007","commanderLegal":"legal","set":"voc","releasedAt":"2021-11-19","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const grumgully = (): CardDef => ({"oracleId":"fa4afcf7-9cf7-4f67-95b9-1f7fe66bf332","name":"Grumgully, the Generous","manaCost":"{1}{R}{G}","cmc":3,"typeLine":"Legendary Creature \u2014 Goblin Shaman","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Goblin","Shaman"],"oracleText":"Each other non-Human creature you control enters with an additional +1/+1 counter on it.","power":"3","toughness":"3","colors":["G","R"],"colorIdentity":["G","R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/9/b9d50d26-3c44-4c8f-81bb-9093dacfb804.jpg?1783932596","artUrl":"https://cards.scryfall.io/art_crop/front/b/9/b9d50d26-3c44-4c8f-81bb-9093dacfb804.jpg?1783932596","commanderLegal":"legal","set":"eld","releasedAt":"2019-10-04","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const authority = (): CardDef => ({"oracleId":"55f3c721-e13a-406e-bc8e-d6cdc91ac477","name":"Authority of the Consuls","manaCost":"{W}","cmc":1,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Creatures your opponents control enter tapped.\nWhenever a creature an opponent controls enters, you gain 1 life.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/3/53e3fa87-8de0-4e3a-90bf-780dd0a9fb48.jpg?1783906294","artUrl":"https://cards.scryfall.io/art_crop/front/5/3/53e3fa87-8de0-4e3a-90bf-780dd0a9fb48.jpg?1783906294","commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const soulWarden = (): CardDef => ({"oracleId":"f3fad295-1af2-4ecc-8546-b121ad6be27b","name":"Soul Warden","manaCost":"{W}","cmc":1,"typeLine":"Creature \u2014 Human Cleric","supertypes":[],"types":["Creature"],"subtypes":["Human","Cleric"],"oracleText":"Whenever another creature enters, you gain 1 life.","power":"1","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/3/53b54485-37e2-4ae0-be91-c77ec02c5fe0.jpg?1786456647","artUrl":"https://cards.scryfall.io/art_crop/front/5/3/53b54485-37e2-4ae0-be91-c77ec02c5fe0.jpg?1786456647","commanderLegal":"legal","set":"sld","releasedAt":"2026-08-10","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const priest = (): CardDef => ({"oracleId":"8a76a9b9-3127-45fe-b20f-a8f643276281","name":"Containment Priest","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature \u2014 Human Cleric","supertypes":[],"types":["Creature"],"subtypes":["Human","Cleric"],"oracleText":"Flash\nIf a nontoken creature would enter and it wasn't cast, exile it instead.","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["Flash"],"imageUrl":"https://cards.scryfall.io/normal/front/c/2/c2c794b9-09da-49be-b258-b0e21f1663e3.jpg?1783938874","artUrl":"https://cards.scryfall.io/art_crop/front/c/2/c2c794b9-09da-49be-b258-b0e21f1663e3.jpg?1783938874","commanderLegal":"legal","set":"c14","releasedAt":"2014-11-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const seat = (): CardDef => ({"oracleId":"39451b4d-cd7a-40da-b457-cb51b609173f","name":"Seat of the Synod","manaCost":"","cmc":0,"typeLine":"Artifact Land","supertypes":[],"types":["Artifact","Land"],"subtypes":[],"oracleText":"{T}: Add {U}.","colors":[],"colorIdentity":["U"],"keywords":[],"producedMana":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/e/a/ea58393a-7d69-4f99-90b7-ef6f31e4c80b.jpg?1783925176","artUrl":"https://cards.scryfall.io/art_crop/front/e/a/ea58393a-7d69-4f99-90b7-ef6f31e4c80b.jpg?1783925176","commanderLegal":"legal","set":"sld","releasedAt":"2021-10-15","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const riseFromTheGrave = (): CardDef => ({"oracleId":"4e769107-0f32-4181-9e57-ffebc2228d3a","name":"Rise from the Grave","manaCost":"{4}{B}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Put target creature card from a graveyard onto the battlefield under your control. That creature is a black Zombie in addition to its other colors and types.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/2/d2e5b5d5-691c-44f0-8fab-fdecdd4c721d.jpg?1783937477","artUrl":"https://cards.scryfall.io/art_crop/front/d/2/d2e5b5d5-691c-44f0-8fab-fdecdd4c721d.jpg?1783937477","commanderLegal":"legal","set":"emn","releasedAt":"2016-07-22","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const karlovWatchdog = (): CardDef => ({"oracleId":"73f44500-fe83-40fa-b6f2-ed5673d0edcc","name":"Karlov Watchdog","manaCost":"{3}{W}","cmc":4,"typeLine":"Creature \u2014 Dog","supertypes":[],"types":["Creature"],"subtypes":["Dog"],"oracleText":"Vigilance\nPermanents your opponents control can't be turned face up during your turn.\nWhenever you attack with three or more creatures, creatures you control get +1/+1 until end of turn.","power":"3","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/7/9/79cfb366-ae2a-4b3d-9a80-383a32db1509.jpg?1783912924","artUrl":"https://cards.scryfall.io/art_crop/front/7/9/79cfb366-ae2a-4b3d-9a80-383a32db1509.jpg?1783912924","commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const overlaidTerrain = (): CardDef => ({"oracleId":"e5818ab3-8c37-4063-9e9d-cbe4ae0bba14","name":"Overlaid Terrain","manaCost":"{2}{G}{G}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"As this enchantment enters, sacrifice all lands you control.\nLands you control have \"{T}: Add two mana of any one color.\"","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/2/3/230c7926-9a4b-4ead-b4c8-889f84210545.jpg?1783945814","artUrl":"https://cards.scryfall.io/art_crop/front/2/3/230c7926-9a4b-4ead-b4c8-889f84210545.jpg?1783945814","commanderLegal":"legal","set":"nem","releasedAt":"2000-02-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const henryWu = (): CardDef => ({"oracleId":"d94a792f-a48b-4181-b656-86fe452a4875","name":"Henry Wu, InGen Geneticist","manaCost":"{B}{G}{U}","cmc":3,"typeLine":"Legendary Creature \u2014 Human Scientist","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Scientist"],"oracleText":"Henry Wu and other Human creatures you control have exploit. (When a creature with exploit enters, you may sacrifice a creature.)\nWhenever a creature you control exploits a non-Human creature, draw a card. If the exploited creature had power 3 or greater, create a Treasure token.","power":"1","toughness":"4","colors":["B","G","U"],"colorIdentity":["B","G","U"],"keywords":["Treasure"],"imageUrl":"https://cards.scryfall.io/normal/front/5/b/5b67d302-ddaa-4627-adc8-86bb665f69ad.jpg?1783913636","artUrl":"https://cards.scryfall.io/art_crop/front/5/b/5b67d302-ddaa-4627-adc8-86bb665f69ad.jpg?1783913636","commanderLegal":"legal","set":"rex","releasedAt":"2023-11-17","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ironFist = (): CardDef => ({"oracleId":"bbf873c2-94c1-46b8-912e-e29e48e0212c","name":"Iron Fist, Living Weapon","manaCost":"{2}{R}","cmc":3,"typeLine":"Legendary Creature \u2014 Human Warrior Hero","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Warrior","Hero"],"oracleText":"Whenever you cast a spell that targets a creature you control, Iron Fist gains \"{T}: Iron Fist deals damage equal to his power to any other target\" until end of turn.","power":"2","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/c/5cc2d948-ac8b-4466-b604-3fabc0ab6bb9.jpg?1783902929","artUrl":"https://cards.scryfall.io/art_crop/front/5/c/5cc2d948-ac8b-4466-b604-3fabc0ab6bb9.jpg?1783902929","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const brineComber = (): CardDef => ({"oracleId":"8845ba0d-c2f4-49e4-b06e-54a06a8297e0","name":"Brine Comber // Brinebound Gift","manaCost":"{1}{W}{U}","cmc":3,"typeLine":"Creature \u2014 Spirit // Enchantment \u2014 Aura","supertypes":[],"types":["Creature"],"subtypes":["Spirit"],"oracleText":"Whenever this creature enters or becomes the target of an Aura spell, create a 1/1 white Spirit creature token with flying.\nDisturb {W}{U} (You may cast this card from your graveyard transformed for its disturb cost.)","power":"1","toughness":"1","colors":["U","W"],"colorIdentity":["U","W"],"keywords":["Transform","Enchant","Disturb"],"imageUrl":"https://cards.scryfall.io/normal/front/4/2/4205f8f8-7b18-4999-ac51-860fab376d79.jpg?1783924164","artUrl":"https://cards.scryfall.io/art_crop/front/4/2/4205f8f8-7b18-4999-ac51-860fab376d79.jpg?1783924164","commanderLegal":"legal","set":"dbl","releasedAt":"2022-01-28","rarity":"uncommon","layout":"transform","gameChanger":false,"faces":[{"name":"Brine Comber","manaCost":"{1}{W}{U}","typeLine":"Creature \u2014 Spirit","supertypes":[],"types":["Creature"],"subtypes":["Spirit"],"oracleText":"Whenever this creature enters or becomes the target of an Aura spell, create a 1/1 white Spirit creature token with flying.\nDisturb {W}{U} (You may cast this card from your graveyard transformed for its disturb cost.)","power":"1","toughness":"1","colors":["U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/4/2/4205f8f8-7b18-4999-ac51-860fab376d79.jpg?1783924164","artUrl":"https://cards.scryfall.io/art_crop/front/4/2/4205f8f8-7b18-4999-ac51-860fab376d79.jpg?1783924164"},{"name":"Brinebound Gift","manaCost":"","typeLine":"Enchantment \u2014 Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nWhenever this Aura enters or enchanted creature becomes the target of an Aura spell, create a 1/1 white Spirit creature token with flying.\nIf this Aura would be put into a graveyard from anywhere, exile it instead.","colors":["U","W"],"colorIndicator":["U","W"],"imageUrl":"https://cards.scryfall.io/normal/back/4/2/4205f8f8-7b18-4999-ac51-860fab376d79.jpg?1783924164","artUrl":"https://cards.scryfall.io/art_crop/back/4/2/4205f8f8-7b18-4999-ac51-860fab376d79.jpg?1783924164"}]}) as CardDef;
const jadeSeedstones = (): CardDef => ({"oracleId":"fa2c984a-6bc1-4ec8-93d7-87f9f06b841e","name":"Jade Seedstones // Jadeheart Attendant","manaCost":"{3}{G}","cmc":4,"typeLine":"Artifact // Artifact Creature \u2014 Golem","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"When this artifact enters, distribute three +1/+1 counters among one, two, or three target creatures you control.\nCraft with creature {5}{G}{G} ({5}{G}{G}, Exile this artifact, Exile a creature you control or a creature card from your graveyard: Return this card transformed under its owner's control. Craft only as a sorcery.)","colors":["G"],"colorIdentity":["G"],"keywords":["Craft","Transform"],"imageUrl":"https://cards.scryfall.io/normal/front/b/b/bb95ffc2-ef35-49bf-8211-c5354d176051.jpg?1783913750","artUrl":"https://cards.scryfall.io/art_crop/front/b/b/bb95ffc2-ef35-49bf-8211-c5354d176051.jpg?1783913750","commanderLegal":"legal","set":"lci","releasedAt":"2023-11-17","rarity":"uncommon","layout":"transform","gameChanger":false,"faces":[{"name":"Jade Seedstones","manaCost":"{3}{G}","typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"When this artifact enters, distribute three +1/+1 counters among one, two, or three target creatures you control.\nCraft with creature {5}{G}{G} ({5}{G}{G}, Exile this artifact, Exile a creature you control or a creature card from your graveyard: Return this card transformed under its owner's control. Craft only as a sorcery.)","colors":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/b/b/bb95ffc2-ef35-49bf-8211-c5354d176051.jpg?1783913750","artUrl":"https://cards.scryfall.io/art_crop/front/b/b/bb95ffc2-ef35-49bf-8211-c5354d176051.jpg?1783913750"},{"name":"Jadeheart Attendant","manaCost":"","typeLine":"Artifact Creature \u2014 Golem","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Golem"],"oracleText":"When this creature enters, you gain life equal to the mana value of the exiled card used to craft it.","power":"7","toughness":"7","colors":["G"],"colorIndicator":["G"],"imageUrl":"https://cards.scryfall.io/normal/back/b/b/bb95ffc2-ef35-49bf-8211-c5354d176051.jpg?1783913750","artUrl":"https://cards.scryfall.io/art_crop/back/b/b/bb95ffc2-ef35-49bf-8211-c5354d176051.jpg?1783913750"}]}) as CardDef;
const boundDetermined = (): CardDef => ({"oracleId":"df39fbee-6ddc-4733-a32e-cdaf369ecccf","name":"Bound // Determined","manaCost":"{3}{B}{G} // {G}{U}","cmc":7,"typeLine":"Instant // Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Sacrifice a creature. Return up to X cards from your graveyard to your hand, where X is the number of colors that creature was. Exile this card.","colors":["B","G","U"],"colorIdentity":["B","G","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/d/9dc20e14-e304-4c14-a87b-322a76e214d5.jpg?1783943387","artUrl":"https://cards.scryfall.io/art_crop/front/9/d/9dc20e14-e304-4c14-a87b-322a76e214d5.jpg?1783943387","commanderLegal":"legal","set":"dis","releasedAt":"2006-05-05","rarity":"rare","layout":"split","gameChanger":false,"faces":[{"name":"Bound","manaCost":"{3}{B}{G}","typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Sacrifice a creature. Return up to X cards from your graveyard to your hand, where X is the number of colors that creature was. Exile this card.","colors":["B","G"]},{"name":"Determined","manaCost":"{G}{U}","typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Other spells you control can't be countered this turn.\nDraw a card.","colors":["U","G"]}]}) as CardDef;
const nikoDefiesDestiny = (): CardDef => ({"oracleId":"e79bf038-071e-448e-ad95-234c207a9575","name":"Niko Defies Destiny","manaCost":"{1}{W}{U}","cmc":3,"typeLine":"Enchantment \u2014 Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI \u2014 You gain 2 life for each foretold card you own in exile.\nII \u2014 Add {W}{U}. Spend this mana only to foretell cards or cast spells that have foretell.\nIII \u2014 Return target card with foretell from your graveyard to your hand.","colors":["U","W"],"colorIdentity":["U","W"],"keywords":[],"producedMana":["U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/1/9/19312f53-5b9d-4e76-91e8-65f444bb68c9.jpg?1783928191","artUrl":"https://cards.scryfall.io/art_crop/front/1/9/19312f53-5b9d-4e76-91e8-65f444bb68c9.jpg?1783928191","commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"uncommon","layout":"saga","gameChanger":false}) as CardDef;
const evilsThrall = (): CardDef => ({"oracleId":"d7562f89-4808-44ab-8dc9-fc4078e8a47b","name":"Evil's Thrall","manaCost":"{2}{R}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Gain control of target creature until end of turn. If you control a Villain with greater mana value than that creature, gain control of that creature until the end of your next turn instead. Untap that creature. It gains haste until end of turn.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/1/310e30cd-b8c3-40ea-9d61-57c5c5fc2a0b.jpg?1783902932","artUrl":"https://cards.scryfall.io/art_crop/front/3/1/310e30cd-b8c3-40ea-9d61-57c5c5fc2a0b.jpg?1783902932","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const carrionette = (): CardDef => ({"oracleId":"24315f60-731a-40bb-85ba-eedba1b011ff","name":"Carrionette","manaCost":"{1}{B}","cmc":2,"typeLine":"Creature \u2014 Skeleton","supertypes":[],"types":["Creature"],"subtypes":["Skeleton"],"oracleText":"{2}{B}{B}: Exile this card and target creature unless that creature's controller pays {2}. Activate only if this card is in your graveyard.","power":"1","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/8/884e19fb-67a4-42d8-b163-720a99cb8506.jpg?1783946645","artUrl":"https://cards.scryfall.io/art_crop/front/8/8/884e19fb-67a4-42d8-b163-720a99cb8506.jpg?1783946645","commanderLegal":"legal","set":"tmp","releasedAt":"1997-10-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
/** Removes `pid`'s lands: what's left to pay with is what a test puts there. */
const noLands = (s: GameState, pid: PlayerId) => {
  for (const id of s.battlefield.filter((x) => s.objects[x]!.controller === pid && characteristics(s, s.objects[x]!).types.includes("Land"))) {
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "exile";
    s.players[pid]!.exile.push(id);
  }
  invalidateCharacteristics(s);
};
const named = (s: GameState, name: string) => s.battlefield.filter((id) => defOf(s, s.objects[id]!).name === name);
const morphProp = card("Test Morpher", "Creature — Beast", "{4}{G}", { power: "4", toughness: "4", oracleText: "Morph {2}", keywords: ["Morph"] });
const growth = card("Test Growth", "Instant", "{G}", { oracleText: "Target creature gets +1/+1 until end of turn.", colors: ["G"] });
const auraProp = card("Test Aura", "Enchantment — Aura", "{W}", { oracleText: "Enchant creature\nEnchanted creature gets +1/+1.", colors: ["W"] });
const humanProp = card("Test Human", "Creature — Human Soldier", "{1}{W}", { power: "2", toughness: "2", colors: ["W"] });
const bigHuman = card("Test Big Human", "Creature — Human Warrior", "{3}", { power: "3", toughness: "3" });
const beast = card("Test Beast", "Creature — Beast", "{3}", { power: "3", toughness: "3" });
const smallBeast = card("Test Small Beast", "Creature — Beast", "{1}", { power: "2", toughness: "1" });
const hybrid = card("Test Hybrid", "Creature — Elf", "{B}{G}", { power: "2", toughness: "2", colors: ["B", "G"] });
const foretellProp = card("Test Foretold", "Sorcery", "{1}{U}", { oracleText: "Foretell {U}\nDraw a card.", keywords: ["Foretell"], colors: ["U"] });
const plainBlue = card("Test Plain Blue", "Sorcery", "{1}{U}", { oracleText: "Draw a card.", colors: ["U"] });
const villain = card("Test Villain", "Creature — Human Villain", "{5}", { power: "5", toughness: "5" });
const golem = card("Test Golem", "Artifact Creature — Golem", "{4}", { power: "4", toughness: "4" });
const spiritWatcher = card("Spirit Watcher", "Creature — Human Cleric", "{W}", { power: "1", toughness: "1", oracleText: "Whenever another Spirit you control enters, you gain 1 life." });
const zombieWatcher = card("Zombie Watcher", "Creature — Human Cleric", "{B}", { power: "1", toughness: "1", oracleText: "Whenever another Zombie you control enters, you gain 1 life." });

describe("Lane B round 98", () => {
  it("Brilliance Unleashed: the artifact land is a 3/3 creature as it enters, so Grumgully's counter, Soul Warden and the opponent's Authority of the Consuls see it (CR 614.12)", () => {
    supported(brilliance(), grumgully(), soulWarden(), authority());
    let { s, ap, ids, opp } = setup([brilliance()]);
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, U: 1, R: 1, C: 4 };
    putOnBattlefield(s, ap, grumgully());
    putOnBattlefield(s, ap, soulWarden());
    putOnBattlefield(s, opp, authority());
    const land = into(s, ap, seat(), "graveyard");
    const [myLife, oppLife] = [s.players[ap]!.life, s.players[opp]!.life];
    s = run(s, planCast(s, ap, ids[0]!, [tgt(land)], [1], "auto"));
    s = settle(s);
    const o = s.objects[land]!;
    expect(o.zone).toBe("battlefield");
    expect(characteristics(s, o).types).toContain("Creature");
    // "Each other non-Human creature you control enters with an additional +1/+1 counter on it."
    expect(o.counters["+1/+1"]).toBe(1);
    expect(`${power(s, o)}/${toughness(s, o)}`).toBe("4/4");
    // "Creatures your opponents control enter tapped." and "Whenever a creature an opponent controls enters, you gain 1 life."
    expect(o.tapped).toBe(true);
    expect(s.players[opp]!.life).toBe(oppLife + 1);
    // Soul Warden: "Whenever another creature enters, you gain 1 life."
    expect(s.players[ap]!.life).toBe(myLife + 1);
  });

  it("Brilliance Unleashed: Containment Priest exiles the artifact land, a creature as it would enter that wasn't cast (CR 614.12)", () => {
    supported(priest());
    let { s, ap, ids } = setup([brilliance()]);
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, U: 1, R: 1, C: 4 };
    putOnBattlefield(s, ap, priest());
    const land = into(s, ap, seat(), "graveyard");
    s = run(s, planCast(s, ap, ids[0]!, [tgt(land)], [1], "auto"));
    s = settle(s);
    expect(s.objects[land]!.zone).toBe("exile");
  });

  it("Rise from the Grave: the creature is a Zombie as it enters, so a Zombie enters trigger sees it", () => {
    supported(riseFromTheGrave(), zombieWatcher);
    let { s, ap, ids } = setup([riseFromTheGrave()]);
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, B: 1, C: 4 };
    putOnBattlefield(s, ap, zombieWatcher);
    const b = into(s, ap, bear(), "graveyard");
    const life = s.players[ap]!.life;
    s = run(s, planCast(s, ap, ids[0]!, [tgt(b)], undefined, "auto"));
    s = settle(s);
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(characteristics(s, s.objects[b]!).subtypes).toContain("Zombie");
    expect(s.players[ap]!.life).toBe(life + 1);
  });

  it("Storm of Souls: each card is a 1/1 Spirit with flying as it enters: Spirit triggers see it, and Grumgully's counter goes on the 1/1", () => {
    supported(stormOfSouls(), spiritWatcher);
    let { s, ap, ids } = setup([stormOfSouls()]);
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, W: 2, C: 4 };
    putOnBattlefield(s, ap, spiritWatcher);
    putOnBattlefield(s, ap, grumgully());
    const g = into(s, ap, golem, "graveyard");
    const life = s.players[ap]!.life;
    s = run(s, planCast(s, ap, ids[0]!, [], undefined, "auto"));
    s = settle(s);
    const o = s.objects[g]!;
    expect(o.zone).toBe("battlefield");
    expect(characteristics(s, o).subtypes).toContain("Spirit");
    expect(`${power(s, o)}/${toughness(s, o)}`).toBe("2/2");
    expect(s.players[ap]!.life).toBe(life + 1);
  });

  it("compiles every card of the round fully", () => {
    supported(karlovWatchdog(), overlaidTerrain(), henryWu(), ironFist(), brineComber(), jadeSeedstones(), boundDetermined(), nikoDefiesDestiny(), evilsThrall(), carrionette());
  });

  it("Karlov Watchdog: an opponent's face-down permanent can't be turned face up during your turn; yours can, and theirs on their turn", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, karlovWatchdog());
    const theirs = putOnBattlefield(s, opp, morphProp);
    s.objects[theirs]!.faceDown = "morph";
    const mine = putOnBattlefield(s, ap, morphProp);
    s.objects[mine]!.faceDown = "morph";
    invalidateCharacteristics(s);
    s.players[ap]!.manaPool.C = 2;
    expect(turnFaceUpProblem(s, ap, mine)).toBeNull();
    s.players[opp]!.manaPool.C = 2;
    s.priority = opp;
    expect(turnFaceUpProblem(s, opp, theirs)).toBe("it can't be turned face up");
    // On that opponent's own turn, it can.
    s.priority = ap;
    s.players[ap]!.hand = [];
    s = passUntil(s, "main1", opp);
    s.players[opp]!.manaPool.C = 2;
    expect(s.priority).toBe(opp);
    expect(turnFaceUpProblem(s, opp, theirs)).toBeNull();
  });

  it("Overlaid Terrain: all your lands are sacrificed as it enters, not an opponent's; lands you control later tap for two mana of one color", () => {
    let { s, ap, ids, opp } = setup([overlaidTerrain()]);
    const theirLand = putOnBattlefield(s, opp, card("Their Forest", "Basic Land — Forest"));
    const before = s.players[ap]!.graveyard.length;
    s = settle(run(s, planCast(s, ap, ids[0]!, [], undefined, "auto")));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && characteristics(s, s.objects[id]!).types.includes("Land"))).toEqual([]);
    expect(s.players[ap]!.graveyard.length).toBe(before + 14);
    expect(s.objects[theirLand]!.zone).toBe("battlefield");
    const land = putOnBattlefield(s, ap, card("New Forest", "Basic Land — Forest"));
    expect(abilitiesOf(s, s.objects[land]!).mana.some((m) => /two mana of any one color/.test(m.text ?? ""))).toBe(true);
  });

  it("Henry Wu: a creature you control exploiting a non-Human draws a card, and a Treasure if it had power 3 or more; not a Human", () => {
    for (const [victim, cards, treasures] of [[beast, 1, 1], [smallBeast, 1, 0], [bigHuman, 0, 0]] as const) {
      let { s, ap, ids } = setup([humanProp]);
      putOnBattlefield(s, ap, henryWu());
      const v = putOnBattlefield(s, ap, victim);
      const hand = s.players[ap]!.hand.length - 1;
      s = settle(run(s, planCast(s, ap, ids[0]!, [], undefined, "auto")), { me: [ap] });
      expect(s.pending?.kind, victim.name).toBe("pickPermanents");
      s = settle(act(s, { type: "pickPermanents", player: ap, ids: [v] } as Action), { me: [ap] });
      expect(s.objects[v]!.zone, victim.name).toBe("graveyard");
      expect(s.players[ap]!.hand.length - hand, victim.name).toBe(cards);
      expect(named(s, "Treasure Token").length + named(s, "Treasure").length, victim.name).toBe(treasures);
    }
  });

  it("Iron Fist: a spell you cast targeting a creature you control gives him a tap ability dealing damage equal to his power", () => {
    let { s, ap, ids, opp } = setup([growth]);
    const fist = putOnBattlefield(s, ap, ironFist());
    const bearId = putOnBattlefield(s, ap, bear());
    expect(abilitiesOf(s, s.objects[fist]!).activated.length).toBe(0);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(bearId)], undefined, "auto")));
    const i = abilitiesOf(s, s.objects[fist]!).activated.length - 1;
    expect(i).toBe(0);
    // "Any other target": not Iron Fist himself.
    expect(planActivate(s, ap, fist, i, [tgt(fist)])).toBeNull();
    const life = s.players[opp]!.life;
    const p = power(s, s.objects[fist]!);
    s = settle(run(s, planActivate(s, ap, fist, i, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(life - p);
    // Until end of turn only.
    s = passUntil(s, "upkeep", opp);
    expect(abilitiesOf(s, s.objects[fist]!).activated.length).toBe(0);
  });

  it("Brine Comber: a Spirit when it enters and when it becomes the target of an Aura spell; Brinebound Gift when it enters and when the enchanted creature does", () => {
    let { s, ap, ids } = setup([brineComber(), auraProp, auraProp]);
    s = settle(run(s, planCast(s, ap, ids[0]!, [], undefined, "auto")));
    expect(named(s, "Spirit Token").length).toBe(1);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(ids[0]!)], undefined, "auto")));
    expect(named(s, "Spirit Token").length).toBe(2);
    // An Aura spell targeting another creature doesn't.
    const other = putOnBattlefield(s, ap, bear());
    s = settle(run(s, planCast(s, ap, ids[2]!, [tgt(other)], undefined, "auto")));
    expect(named(s, "Spirit Token").length).toBe(2);
    // Disturb: Brinebound Gift on the bear (a token for it entering), then an Aura spell targeting the bear.
    let t = setup([brineComber(), auraProp]);
    const b = t.s.objects[t.ids[0]!]!;
    t.s.players[t.ap]!.hand.splice(t.s.players[t.ap]!.hand.indexOf(b.id), 1);
    b.zone = "graveyard";
    t.s.players[t.ap]!.graveyard.push(b.id);
    invalidateCharacteristics(t.s);
    const host = putOnBattlefield(t.s, t.ap, bear());
    let s2 = settle(run(t.s, planCast(t.s, t.ap, b.id, [tgt(host)], undefined, "auto", undefined, { face: 1, via: "disturb" })));
    expect(s2.objects[b.id]!.zone).toBe("battlefield");
    expect(named(s2, "Spirit Token").length).toBe(1);
    s2 = settle(run(s2, planCast(s2, t.ap, t.ids[1]!, [tgt(host)], undefined, "auto")));
    expect(named(s2, "Spirit Token").length).toBe(2);
  });

  it("Jadeheart Attendant: you gain life equal to the mana value of the card exiled to craft it", () => {
    let { s, ap } = setup([]);
    const seed = putOnBattlefield(s, ap, jadeSeedstones());
    const dead = into(s, ap, card("Test Wurm", "Creature — Wurm", "{4}{G}{G}", { power: "6", toughness: "6" }), "graveyard");
    const i = abilitiesOf(s, s.objects[seed]!).activated.findIndex((a) => a.keyword === "Craft");
    expect(i).toBeGreaterThanOrEqual(0);
    const life = s.players[ap]!.life;
    s = settle(run(s, planActivate(s, ap, seed, i, undefined, undefined, undefined, undefined, { craft: [dead] })));
    expect(defOf(s, s.objects[seed]!).name).toBe("Jadeheart Attendant");
    expect(s.objects[dead]!.zone).toBe("exile");
    expect(s.players[ap]!.life).toBe(life + 6);
  });

  it("Bound: sacrifice a creature, then return up to as many cards as it had colors; Bound is exiled", () => {
    for (const [victim, n] of [[hybrid, 2], [golem, 0]] as const) {
      let { s, ap, ids } = setup([boundDetermined()]);
      const v = putOnBattlefield(s, ap, victim);
      const yard = [into(s, ap, bear(), "graveyard"), into(s, ap, plainBlue, "graveyard"), into(s, ap, growth, "graveyard")];
      s = settle(run(s, planCast(s, ap, ids[0]!, [], undefined, "auto", undefined, { face: 0 })), { me: [ap] });
      expect(s.objects[v]!.zone, victim.name).toBe("graveyard");
      if (n) {
        expect(s.pending?.kind).toBe("searchLibrary");
        if (s.pending?.kind === "searchLibrary") expect(s.pending.max).toBe(2);
        // The sacrificed creature may be one of them (rulings).
        s = settle(act(s, { type: "searchLibrary", player: ap, found: [v, yard[1]!] }), { me: [ap] });
        expect([s.objects[v]!.zone, s.objects[yard[1]!]!.zone, s.objects[yard[0]!]!.zone]).toEqual(["hand", "hand", "graveyard"]);
      } else expect(s.pending).toBeFalsy();
      expect(s.objects[ids[0]!]!.zone, victim.name).toBe("exile");
    }
  });

  it("Determined: your spells can't be countered this turn, and you draw a card", () => {
    let { s, ap, ids, opp } = setup([boundDetermined(), plainBlue]);
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, ids[0]!, [], undefined, "auto", undefined, { face: 1 })));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
    expect((s.turnRules ?? []).some((r) => r.player === ap && r.rule === "spellsUncounterable" && r.turn === s.turn)).toBe(true);
    // An opponent's counterspell doesn't counter the next one.
    s = run(s, planCast(s, ap, ids[1]!, [], undefined, "auto"));
    const counter = card("Test Counter", "Instant", "{U}", { oracleText: "Counter target spell.", colors: ["U"] });
    const c = putOnBattlefield(s, opp, counter);
    s.battlefield.splice(s.battlefield.indexOf(c), 1);
    s.objects[c]!.zone = "hand";
    s.players[opp]!.hand.push(c);
    s.players[opp]!.manaPool.U = 1;
    s = act(s, { type: "passPriority", player: ap });
    s.priority = opp;
    const item = s.stack[s.stack.length - 1]!;
    s = run(s, planCast(s, opp, c, [{ kind: "stack", id: item.id }], undefined, "auto"));
    s = settle(s);
    expect(s.objects[ids[1]!]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand - 2 + 1 + 1);
  });

  it("Niko Defies Destiny: chapter II's {W}{U} foretells a card or casts a spell with foretell, nothing else", () => {
    let { s, ap, ids } = setup([nikoDefiesDestiny(), foretellProp, plainBlue, foretellProp]);
    s = settle(run(s, planCast(s, ap, ids[0]!, [], undefined, "auto")));
    expect(s.objects[ids[0]!]!.counters.lore).toBe(1);
    noLands(s, ap);
    s.players[ap]!.hand = s.players[ap]!.hand.filter((id) => ids.includes(id));
    s = passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    s = passUntil(s, "main1", ap);
    s = settle(s, { me: [ap] });
    expect(s.objects[ids[0]!]!.counters.lore).toBe(2);
    expect(s.players[ap]!.manaPool.W + s.players[ap]!.manaPool.U).toBe(2);
    // Not a spell without foretell.
    expect(planCast(s, ap, ids[2]!, [], undefined, "auto")).toBeNull();
    // A spell with foretell, cast from the hand for its mana cost.
    expect(planCast(s, ap, ids[1]!, [], undefined, "auto")).not.toBeNull();
    // Foretelling: the {2} special action.
    expect(foretellProblem(s, ap, ids[3]!)).toBeNull();
    s = act(s, { type: "foretell", player: ap, objectId: ids[3]! });
    expect(s.objects[ids[3]!]!.zone).toBe("exile");
    expect(s.players[ap]!.manaPool.W + s.players[ap]!.manaPool.U).toBe(0);
  });

  it("Evil's Thrall: control until end of turn; until the end of your next turn with a Villain of greater mana value", () => {
    for (const withVillain of [false, true]) {
      let { s, ap, ids, opp } = setup([evilsThrall()]);
      if (withVillain) putOnBattlefield(s, ap, villain);
      const theirs = putOnBattlefield(s, opp, beast);
      s.objects[theirs]!.tapped = true;
      s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(theirs)], undefined, "auto")));
      expect(s.objects[theirs]!.tapped).toBe(false);
      expect(characteristics(s, s.objects[theirs]!).controller).toBe(ap);
      expect(characteristics(s, s.objects[theirs]!).keywords).toContain("Haste");
      s.players[ap]!.hand = [];
      s = passUntil(s, "upkeep", opp);
      expect(characteristics(s, s.objects[theirs]!).controller, `villain ${withVillain}`).toBe(withVillain ? ap : opp);
    }
  });

  it("Carrionette: from your graveyard, exiles itself and the target unless that creature's controller pays {2}", () => {
    for (const pays of [false, true]) {
      let { s, ap, opp } = setup([]);
      const c = into(s, ap, carrionette(), "graveyard");
      const theirs = putOnBattlefield(s, opp, beast);
      if (pays) s.players[opp]!.manaPool.C = 2;
      s = run(s, planActivate(s, ap, c, 0, [tgt(theirs)]));
      for (let i = 0; i < 50 && s.pending?.kind !== "payUnless" && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(s.pending?.kind).toBe("payUnless");
      expect(s.pending?.player).toBe(opp);
      s = settle(act(s, { type: "payUnless", player: opp, pay: pays }));
      expect([s.objects[c]!.zone, s.objects[theirs]!.zone], `pays ${pays}`).toEqual(pays ? ["graveyard", "battlefield"] : ["exile", "exile"]);
    }
  });
});
