// Round 334 (Lane A): craft with "one or more", "four or more ... cards" and four named creature types (CR 702.167a-b),
// and the back faces that use "the exiled cards used to craft it" (702.167c): Altar of the Wretched // Wretched Bonemass,
// Sunbird Standard // Sunbird Effigy, Master's Guide-Mural // Master's Manufactory, Ore-Rich Stalactite // Cosmium
// Catalyst, Dire Flail // Dire Blunderbuss, Saheeli's Lattice // Mastercraft Raptor, Throne of the Grim Captain // The
// Grim Captain.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, abilityCosts, applyAction, botActions, characteristics, defOf, invalidateCharacteristics, isFullySupported, manaOptions, objHasKeyword, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PendingDecision, type PlayerId, type TargetChoice } from "../src";

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
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
/** Moves a new card for `def` from the battlefield into `pid`'s `zone`. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" = "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const name = (s: GameState, id: string) => defOf(s, s.objects[id]!).name;
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
const pend = <K extends PendingDecision["kind"]>(s: GameState, kind: K) => {
  expect(s.pending?.kind).toBe(kind);
  return s.pending as Extract<PendingDecision, { kind: K }>;
};
const craftIndex = (s: GameState, id: string) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => a.keyword === "Craft");
const craftPlan = (s: GameState, pid: PlayerId, id: string, craft: string[]) => planActivate(s, pid, id, craftIndex(s, id), undefined, undefined, undefined, undefined, { craft } as CostChoices);
const craft = (s: GameState, pid: PlayerId, id: string, materials: string[]) => settle(run(s, craftPlan(s, pid, id, materials)), pid);
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;

// Real oracle text (Scryfall).
const altar = (): CardDef => ({"oracleId":"c551f007-9740-4a2a-8ef5-7be1a7afe14b","name":"Altar of the Wretched // Wretched Bonemass","manaCost":"{2}{B}","cmc":3,"typeLine":"Artifact // Creature — Skeleton Horror","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"When this artifact enters, you may sacrifice a nontoken creature. If you do, draw X cards, then mill X cards, where X is that creature's power.\nCraft with one or more creatures {2}{B}{B}\n{2}{B}: Return this card from your graveyard to your hand.","colors":["B"],"colorIdentity":["B"],"keywords":["Craft","Transform","Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/e/2/e2c812bb-19f8-4a22-bda9-f2a6233cf700.jpg?1783951757","artUrl":"https://cards.scryfall.io/art_crop/front/e/2/e2c812bb-19f8-4a22-bda9-f2a6233cf700.jpg?1783951757","commanderLegal":"legal","set":"lcc","releasedAt":"2023-11-17","rarity":"rare","layout":"transform","gameChanger":false,"faces":[{"name":"Altar of the Wretched","manaCost":"{2}{B}","typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"When this artifact enters, you may sacrifice a nontoken creature. If you do, draw X cards, then mill X cards, where X is that creature's power.\nCraft with one or more creatures {2}{B}{B}\n{2}{B}: Return this card from your graveyard to your hand.","colors":["B"],"imageUrl":"https://cards.scryfall.io/normal/front/e/2/e2c812bb-19f8-4a22-bda9-f2a6233cf700.jpg?1783951757","artUrl":"https://cards.scryfall.io/art_crop/front/e/2/e2c812bb-19f8-4a22-bda9-f2a6233cf700.jpg?1783951757"},{"name":"Wretched Bonemass","manaCost":"","typeLine":"Creature — Skeleton Horror","supertypes":[],"types":["Creature"],"subtypes":["Skeleton","Horror"],"oracleText":"Wretched Bonemass's power and toughness are each equal to the total power of the exiled cards used to craft it.\nThis creature has flying as long as an exiled card used to craft it has flying. The same is true for first strike, double strike, deathtouch, haste, hexproof, indestructible, lifelink, menace, protection, reach, trample, and vigilance.","power":"*","toughness":"*","colors":["B"],"colorIndicator":["B"],"imageUrl":"https://cards.scryfall.io/normal/back/e/2/e2c812bb-19f8-4a22-bda9-f2a6233cf700.jpg?1783951757","artUrl":"https://cards.scryfall.io/art_crop/back/e/2/e2c812bb-19f8-4a22-bda9-f2a6233cf700.jpg?1783951757"}]}) as CardDef;
const sunbird = (): CardDef => ({"oracleId":"c69742bf-f0f5-4216-a602-c21f9c5a6501","name":"Sunbird Standard // Sunbird Effigy","manaCost":"{3}","cmc":3,"typeLine":"Artifact // Artifact Creature — Bird Construct","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add one mana of any color.\nCraft with one or more {5} ({5}, Exile this artifact, Exile one or more other permanents you control and/or cards from your graveyard: Return this card transformed under its owner's control. Craft only as a sorcery.)","colors":[],"colorIdentity":[],"keywords":["Flying","Craft","Vigilance","Transform","Haste"],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/e/0/e0b6d40a-fded-4625-b03c-765c88d75766.jpg?1783913725","artUrl":"https://cards.scryfall.io/art_crop/front/e/0/e0b6d40a-fded-4625-b03c-765c88d75766.jpg?1783913725","commanderLegal":"legal","set":"lci","releasedAt":"2023-11-17","rarity":"uncommon","layout":"transform","gameChanger":false,"faces":[{"name":"Sunbird Standard","manaCost":"{3}","typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add one mana of any color.\nCraft with one or more {5} ({5}, Exile this artifact, Exile one or more other permanents you control and/or cards from your graveyard: Return this card transformed under its owner's control. Craft only as a sorcery.)","colors":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/0/e0b6d40a-fded-4625-b03c-765c88d75766.jpg?1783913725","artUrl":"https://cards.scryfall.io/art_crop/front/e/0/e0b6d40a-fded-4625-b03c-765c88d75766.jpg?1783913725"},{"name":"Sunbird Effigy","manaCost":"","typeLine":"Artifact Creature — Bird Construct","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Bird","Construct"],"oracleText":"Flying, vigilance, haste\nSunbird Effigy's power and toughness are each equal to the number of colors among the exiled cards used to craft it.\n{T}: For each color among the exiled cards used to craft this creature, add one mana of that color.","power":"*","toughness":"*","colors":[],"imageUrl":"https://cards.scryfall.io/normal/back/e/0/e0b6d40a-fded-4625-b03c-765c88d75766.jpg?1783913725","artUrl":"https://cards.scryfall.io/art_crop/back/e/0/e0b6d40a-fded-4625-b03c-765c88d75766.jpg?1783913725"}]}) as CardDef;
const mural = (): CardDef => ({"oracleId":"2dfdd358-e3cd-4bf5-871b-37689b7951e9","name":"Master's Guide-Mural // Master's Manufactory","manaCost":"{3}{W}{U}","cmc":5,"typeLine":"Artifact // Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"When this artifact enters, create a 4/4 white and blue Golem artifact creature token.\nCraft with artifact {4}{W}{W}{U} ({4}{W}{W}{U}, Exile this artifact, Exile another artifact you control or an artifact card from your graveyard: Return this card transformed under its owner's control. Craft only as a sorcery.)","colors":["U","W"],"colorIdentity":["U","W"],"keywords":["Craft","Transform"],"imageUrl":"https://cards.scryfall.io/normal/front/f/7/f7a41343-7cdb-49aa-a9d1-7460195355d8.jpg?1783913735","artUrl":"https://cards.scryfall.io/art_crop/front/f/7/f7a41343-7cdb-49aa-a9d1-7460195355d8.jpg?1783913735","commanderLegal":"legal","set":"lci","releasedAt":"2023-11-17","rarity":"uncommon","layout":"transform","gameChanger":false,"faces":[{"name":"Master's Guide-Mural","manaCost":"{3}{W}{U}","typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"When this artifact enters, create a 4/4 white and blue Golem artifact creature token.\nCraft with artifact {4}{W}{W}{U} ({4}{W}{W}{U}, Exile this artifact, Exile another artifact you control or an artifact card from your graveyard: Return this card transformed under its owner's control. Craft only as a sorcery.)","colors":["U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/f/7/f7a41343-7cdb-49aa-a9d1-7460195355d8.jpg?1783913735","artUrl":"https://cards.scryfall.io/art_crop/front/f/7/f7a41343-7cdb-49aa-a9d1-7460195355d8.jpg?1783913735"},{"name":"Master's Manufactory","manaCost":"","typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Create a 4/4 white and blue Golem artifact creature token. Activate only if this artifact or another artifact entered the battlefield under your control this turn.","colors":["U","W"],"colorIndicator":["U","W"],"imageUrl":"https://cards.scryfall.io/normal/back/f/7/f7a41343-7cdb-49aa-a9d1-7460195355d8.jpg?1783913735","artUrl":"https://cards.scryfall.io/art_crop/back/f/7/f7a41343-7cdb-49aa-a9d1-7460195355d8.jpg?1783913735"}]}) as CardDef;
const stalactite = (): CardDef => ({"oracleId":"e17d8c0e-16e7-477b-830d-0818cedcb354","name":"Ore-Rich Stalactite // Cosmium Catalyst","manaCost":"{1}{R}","cmc":2,"typeLine":"Artifact // Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {R}. Spend this mana only to cast an instant or sorcery spell.\nCraft with four or more red instant and/or sorcery cards {3}{R}{R} ({3}{R}{R}, Exile this artifact, Exile the four or more from your graveyard: Return this card transformed under its owner's control. Craft only as a sorcery.)","colors":["R"],"colorIdentity":["R"],"keywords":["Craft","Transform"],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/c/5/c5f2f5e5-e408-4db1-87c3-b667f21ad509.jpg?1783913938","artUrl":"https://cards.scryfall.io/art_crop/front/c/5/c5f2f5e5-e408-4db1-87c3-b667f21ad509.jpg?1783913938","commanderLegal":"legal","set":"lcc","releasedAt":"2023-11-17","rarity":"rare","layout":"transform","gameChanger":false,"faces":[{"name":"Ore-Rich Stalactite","manaCost":"{1}{R}","typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {R}. Spend this mana only to cast an instant or sorcery spell.\nCraft with four or more red instant and/or sorcery cards {3}{R}{R} ({3}{R}{R}, Exile this artifact, Exile the four or more from your graveyard: Return this card transformed under its owner's control. Craft only as a sorcery.)","colors":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/c/5/c5f2f5e5-e408-4db1-87c3-b667f21ad509.jpg?1783913938","artUrl":"https://cards.scryfall.io/art_crop/front/c/5/c5f2f5e5-e408-4db1-87c3-b667f21ad509.jpg?1783913938"},{"name":"Cosmium Catalyst","manaCost":"","typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{1}{R}, {T}: Choose an exiled card used to craft this artifact at random. You may cast that card without paying its mana cost.","colors":["R"],"colorIndicator":["R"],"imageUrl":"https://cards.scryfall.io/normal/back/c/5/c5f2f5e5-e408-4db1-87c3-b667f21ad509.jpg?1783913938","artUrl":"https://cards.scryfall.io/art_crop/back/c/5/c5f2f5e5-e408-4db1-87c3-b667f21ad509.jpg?1783913938"}]}) as CardDef;
const flail = (): CardDef => ({"oracleId":"5a043512-fa56-4361-bb92-0a0f229f34d3","name":"Dire Flail // Dire Blunderbuss","manaCost":"{R}","cmc":1,"typeLine":"Artifact — Equipment // Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +2/+0.\nEquip {1}\nCraft with artifact {3}{R}{R} ({3}{R}{R}, Exile this artifact, Exile another artifact you control or an artifact card from your graveyard: Return this card transformed under its owner's control. Craft only as a sorcery.)","colors":["R"],"colorIdentity":["R"],"keywords":["Craft","Transform","Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/0/d/0d2d98ae-fe02-4a86-9e80-7b95e08de21c.jpg?1783913768","artUrl":"https://cards.scryfall.io/art_crop/front/0/d/0d2d98ae-fe02-4a86-9e80-7b95e08de21c.jpg?1783913768","commanderLegal":"legal","set":"lci","releasedAt":"2023-11-17","rarity":"rare","layout":"transform","gameChanger":false,"faces":[{"name":"Dire Flail","manaCost":"{R}","typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +2/+0.\nEquip {1}\nCraft with artifact {3}{R}{R} ({3}{R}{R}, Exile this artifact, Exile another artifact you control or an artifact card from your graveyard: Return this card transformed under its owner's control. Craft only as a sorcery.)","colors":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/0/d/0d2d98ae-fe02-4a86-9e80-7b95e08de21c.jpg?1783913768","artUrl":"https://cards.scryfall.io/art_crop/front/0/d/0d2d98ae-fe02-4a86-9e80-7b95e08de21c.jpg?1783913768"},{"name":"Dire Blunderbuss","manaCost":"","typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +3/+0 and has \"Whenever this creature attacks, you may sacrifice an artifact other than Dire Blunderbuss. When you do, this creature deals damage equal to its power to target creature.\"\nEquip {1}","colors":["R"],"colorIndicator":["R"],"imageUrl":"https://cards.scryfall.io/normal/back/0/d/0d2d98ae-fe02-4a86-9e80-7b95e08de21c.jpg?1783913768","artUrl":"https://cards.scryfall.io/art_crop/back/0/d/0d2d98ae-fe02-4a86-9e80-7b95e08de21c.jpg?1783913768"}]}) as CardDef;
const lattice = (): CardDef => ({"oracleId":"ef8df503-6160-4e40-a689-49e97fd56cd0","name":"Saheeli's Lattice // Mastercraft Raptor","manaCost":"{1}{R}","cmc":2,"typeLine":"Artifact // Artifact Creature — Dinosaur","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"When this artifact enters, you may discard a card. If you do, draw two cards.\nCraft with one or more Dinosaurs {4}{R} ({4}{R}, Exile this artifact, Exile one or more Dinosaurs you control and/or Dinosaur cards from your graveyard: Return this card transformed under its owner's control. Craft only as a sorcery.)","colors":["R"],"colorIdentity":["R"],"keywords":["Craft","Transform"],"imageUrl":"https://cards.scryfall.io/normal/front/0/b/0bdc79c6-1193-46bd-931d-2c2a0381e420.jpg?1783913761","artUrl":"https://cards.scryfall.io/art_crop/front/0/b/0bdc79c6-1193-46bd-931d-2c2a0381e420.jpg?1783913761","commanderLegal":"legal","set":"lci","releasedAt":"2023-11-17","rarity":"uncommon","layout":"transform","gameChanger":false,"faces":[{"name":"Saheeli's Lattice","manaCost":"{1}{R}","typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"When this artifact enters, you may discard a card. If you do, draw two cards.\nCraft with one or more Dinosaurs {4}{R} ({4}{R}, Exile this artifact, Exile one or more Dinosaurs you control and/or Dinosaur cards from your graveyard: Return this card transformed under its owner's control. Craft only as a sorcery.)","colors":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/0/b/0bdc79c6-1193-46bd-931d-2c2a0381e420.jpg?1783913761","artUrl":"https://cards.scryfall.io/art_crop/front/0/b/0bdc79c6-1193-46bd-931d-2c2a0381e420.jpg?1783913761"},{"name":"Mastercraft Raptor","manaCost":"","typeLine":"Artifact Creature — Dinosaur","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Dinosaur"],"oracleText":"Mastercraft Raptor's power is equal to the total power of the exiled cards used to craft it.","power":"*","toughness":"4","colors":["R"],"colorIndicator":["R"],"imageUrl":"https://cards.scryfall.io/normal/back/0/b/0bdc79c6-1193-46bd-931d-2c2a0381e420.jpg?1783913761","artUrl":"https://cards.scryfall.io/art_crop/back/0/b/0bdc79c6-1193-46bd-931d-2c2a0381e420.jpg?1783913761"}]}) as CardDef;
const throne = (): CardDef => ({"oracleId":"a7c96442-706b-4fd8-9b38-052872dafe58","name":"Throne of the Grim Captain // The Grim Captain","manaCost":"{2}","cmc":2,"typeLine":"Legendary Artifact // Legendary Creature — Skeleton Spirit Pirate","supertypes":["Legendary"],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Mill two cards.\nCraft with a Dinosaur, a Merfolk, a Pirate, and a Vampire {4} ({4}, Exile this artifact, Exile the four from among permanents you control and/or cards in your graveyard: Return this card transformed under its owner's control. Craft only as a sorcery.)","colors":[],"colorIdentity":["B"],"keywords":["Lifelink","Craft","Transform","Hexproof","Trample","Menace","Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4f7a6892-5f6b-49aa-9b4f-3fcf20236306.jpg?1783913707","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4f7a6892-5f6b-49aa-9b4f-3fcf20236306.jpg?1783913707","commanderLegal":"legal","set":"lci","releasedAt":"2023-11-17","rarity":"rare","layout":"transform","gameChanger":false,"faces":[{"name":"Throne of the Grim Captain","manaCost":"{2}","typeLine":"Legendary Artifact","supertypes":["Legendary"],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Mill two cards.\nCraft with a Dinosaur, a Merfolk, a Pirate, and a Vampire {4} ({4}, Exile this artifact, Exile the four from among permanents you control and/or cards in your graveyard: Return this card transformed under its owner's control. Craft only as a sorcery.)","colors":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4f7a6892-5f6b-49aa-9b4f-3fcf20236306.jpg?1783913707","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4f7a6892-5f6b-49aa-9b4f-3fcf20236306.jpg?1783913707"},{"name":"The Grim Captain","manaCost":"","typeLine":"Legendary Creature — Skeleton Spirit Pirate","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Skeleton","Spirit","Pirate"],"oracleText":"Menace, trample, lifelink, hexproof\nWhenever The Grim Captain attacks, each opponent sacrifices a nonland permanent of their choice. Then you may put an exiled creature card used to craft The Grim Captain onto the battlefield under your control tapped and attacking.","power":"7","toughness":"7","colors":["B"],"colorIndicator":["B"],"imageUrl":"https://cards.scryfall.io/normal/back/4/f/4f7a6892-5f6b-49aa-9b4f-3fcf20236306.jpg?1783913707","artUrl":"https://cards.scryfall.io/art_crop/back/4/f/4f7a6892-5f6b-49aa-9b4f-3fcf20236306.jpg?1783913707"}]}) as CardDef;
const knight = (): CardDef => ({"oracleId":"7b51a979-47e0-4b98-8ec5-8064c83422e1","name":"Knight of Grace","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Human Knight","supertypes":[],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"First strike (This creature deals combat damage before creatures without first strike.)\nHexproof from black (This creature can't be the target of black spells or abilities your opponents control.)\nThis creature gets +1/+0 as long as any player controls a black permanent.","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["Hexproof from","Hexproof","First strike"],"imageUrl":"https://cards.scryfall.io/normal/front/7/b/7bbbddc0-f8b3-4255-bd82-d50f829ca009.jpg?1783935041","artUrl":"https://cards.scryfall.io/art_crop/front/7/b/7bbbddc0-f8b3-4255-bd82-d50f829ca009.jpg?1783935041","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const paladin = (): CardDef => ({"oracleId":"fd8722e1-9c41-4037-ab7e-47e2aa9858a0","name":"Paladin en-Vec","manaCost":"{1}{W}{W}","cmc":3,"typeLine":"Creature — Human Knight","supertypes":[],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"First strike, protection from black and from red (This creature deals combat damage before creatures without first strike. It can't be blocked, targeted, dealt damage, or enchanted by anything black or red.)","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["First strike","Protection"],"imageUrl":"https://cards.scryfall.io/normal/front/a/e/aea1a8e1-35f4-4b4a-aa68-21b5219527a9.jpg?1783943075","artUrl":"https://cards.scryfall.io/art_crop/front/a/e/aea1a8e1-35f4-4b4a-aa68-21b5219527a9.jpg?1783943075","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const serra = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const lavaSpike = (): CardDef => ({"oracleId":"2837888c-bfa8-4955-9334-0605ad409f7e","name":"Lava Spike","manaCost":"{R}","cmc":1,"typeLine":"Sorcery — Arcane","supertypes":[],"types":["Sorcery"],"subtypes":["Arcane"],"oracleText":"Lava Spike deals 3 damage to target player or planeswalker.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/9/79c21c1f-eaa4-454d-a1c7-b41466d0a428.jpg?1783933803","artUrl":"https://cards.scryfall.io/art_crop/front/7/9/79c21c1f-eaa4-454d-a1c7-b41466d0a428.jpg?1783933803","commanderLegal":"legal","set":"uma","releasedAt":"2018-12-07","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bonesplitter = (): CardDef => ({"oracleId":"452e3f5f-ce17-4682-966b-5cc100210aee","name":"Bonesplitter","manaCost":"{1}","cmc":1,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +2/+0.\nEquip {1}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980","artUrl":"https://cards.scryfall.io/art_crop/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980","commanderLegal":"legal","set":"pal03","releasedAt":"2003-01-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const growth = (): CardDef => ({"oracleId":"5748ebf1-24e3-499d-ab7c-c2cebd462a24","name":"Giant Growth","manaCost":"{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature gets +3/+3 until end of turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/d/fd1f95bf-48ea-455a-8a6c-0249b11c8900.jpg?1783902918","artUrl":"https://cards.scryfall.io/art_crop/front/f/d/fd1f95bf-48ea-455a-8a6c-0249b11c8900.jpg?1783902918","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const changeling = (): CardDef => ({"oracleId":"a61ef0cc-1da9-49f9-b0dc-01cf9f6205be","name":"Changeling Outcast","manaCost":"{B}","cmc":1,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"Changeling (This card is every creature type.)\nThis creature can't block and can't be blocked.","power":"1","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Changeling"],"imageUrl":"https://cards.scryfall.io/normal/front/0/8/08151d00-513a-4957-aa16-01c0f0245112.jpg?1783933130","artUrl":"https://cards.scryfall.io/art_crop/front/0/8/08151d00-513a-4957-aa16-01c0f0245112.jpg?1783933130","commanderLegal":"legal","set":"mh1","releasedAt":"2019-06-14","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const dino = (n: string, p = "3") => card(n, "Creature — Dinosaur", "{2}{R}", { power: p, toughness: "3" });
const rock = card("Test Rock", "Artifact", "{2}");

describe("round 334: compiles", () => {
  it("every card of the round", () => supported(altar(), sunbird(), mural(), stalactite(), flail(), lattice(), throne()));
});

describe("round 334: Altar of the Wretched // Wretched Bonemass (craft with one or more creatures)", () => {
  it("one creature is enough, any more too, from the battlefield and the graveyard together", () => {
    for (const n of [1, 3]) {
      const { s: s0, ap } = setup([]);
      let s = s0;
      const a = putOnBattlefield(s, ap, altar());
      const mats = [putOnBattlefield(s, ap, bear()), into(s, ap, bear({ name: "Yard Bear", power: "4", toughness: "4" })), into(s, ap, bear({ name: "Third Bear", power: "1", toughness: "1" }))].slice(0, n);
      s = craft(s, ap, a, mats);
      expect(name(s, a), `${n}`).toBe("Wretched Bonemass");
      for (const m of mats) expect(zone(s, m)).toBe("exile");
      // Its power and toughness are each the total power of those cards (CR 702.167c).
      expect(pt(s, a), `${n}`).toBe(n === 1 ? "2/2" : "7/7");
    }
  });

  it("no materials, or a noncreature, can't pay it", () => {
    const { s, ap } = setup([]);
    const a = putOnBattlefield(s, ap, altar());
    expect(craftPlan(s, ap, a, [])).toBeNull();
    const r = putOnBattlefield(s, ap, rock);
    expect(craftPlan(s, ap, a, [r])).toBeNull();
  });

  it("has the keywords of the exiled cards, protection and hexproof from each quality as their own variants", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const a = putOnBattlefield(s, ap, altar());
    const mats = [into(s, ap, serra()), into(s, ap, knight()), into(s, ap, paladin())];
    s = craft(s, ap, a, mats);
    const kws = characteristics(s, s.objects[a]!).keywords;
    for (const k of ["Flying", "Vigilance", "First strike", "Hexproof from black", "Protection from black", "Protection from red"]) expect(kws, k).toContain(k);
    expect(kws).not.toContain("Hexproof");
    expect(kws).not.toContain("Lifelink");
    // 4 + 2 + 2.
    expect(pt(s, a)).toBe("8/8");
    // Once one of the cards leaves exile, it's no longer used to craft it (CR 702.167c).
    s.objects[mats[0]!]!.zone = "graveyard";
    s.objects[mats[0]!]!.zoneChanges = (s.objects[mats[0]!]!.zoneChanges ?? 0) + 1;
    invalidateCharacteristics(s);
    expect(objHasKeyword(s, s.objects[a]!, "Flying")).toBe(false);
    expect(pt(s, a)).toBe("4/4");
  });

  it("an exiled token isn't a card: it counts for nothing (rulings)", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const a = putOnBattlefield(s, ap, altar());
    const tok = putOnBattlefield(s, ap, bear({ name: "Bear Token", power: "5", toughness: "5" }));
    s.objects[tok]!.isToken = true;
    const b = putOnBattlefield(s, ap, bear());
    s = craft(s, ap, a, [tok, b]);
    expect(name(s, a)).toBe("Wretched Bonemass");
    expect(pt(s, a)).toBe("2/2");
  });
});

describe("round 334: Sunbird Standard // Sunbird Effigy (craft with one or more)", () => {
  it("any other permanents and cards; power, toughness and mana from the colors among them", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const sb = putOnBattlefield(s, ap, sunbird());
    const mats = [into(s, ap, bolt()), into(s, ap, divination()), putOnBattlefield(s, ap, rock), into(s, ap, card("Test Forest", "Land"))];
    // Not itself (it's exiled by the other part of the cost).
    expect(craftPlan(s, ap, sb, [sb])).toBeNull();
    s = craft(s, ap, sb, mats);
    expect(name(s, sb)).toBe("Sunbird Effigy");
    expect(pt(s, sb)).toBe("2/2");
    expect(characteristics(s, s.objects[sb]!).keywords).toEqual(expect.arrayContaining(["Flying", "Vigilance", "Haste"]));
    // One mana of each of those colors.
    const opts = manaOptions(s, s.objects[sb]!);
    expect(opts.length).toBeGreaterThan(0);
    const before = { ...s.players[ap]!.manaPool };
    s = act(s, { type: "activateMana", player: ap, objectId: sb, ability: opts[0]!.ability, mana: opts[0]!.mana });
    expect(s.players[ap]!.manaPool.R).toBe((before.R ?? 0) + 1);
    expect(s.players[ap]!.manaPool.U).toBe((before.U ?? 0) + 1);
    expect(s.players[ap]!.manaPool.G ?? 0).toBe(before.G ?? 0);
  });
});

describe("round 334: Master's Guide-Mural // Master's Manufactory", () => {
  it("makes a Golem only on a turn this or another artifact entered under your control", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const m = putOnBattlefield(s, ap, mural());
    const r = putOnBattlefield(s, ap, rock);
    s = craft(s, ap, m, [r]);
    expect(name(s, m)).toBe("Master's Manufactory");
    // It entered this turn, transformed (CR 702.167a).
    const golems = () => s.battlefield.filter((id) => name(s, id) === "Golem Token").length;
    const n = golems();
    s = settle(run(s, planActivate(s, ap, m, 0)), ap);
    expect(golems()).toBe(n + 1);
    // Its controller's next turn, with nothing entered: it can't.
    s = passUntil(passUntil(s, "upkeep", opp), "main1", ap);
    expect(s.objects[m]!.tapped).toBe(false);
    expect(planActivate(s, ap, m, 0)).toBeNull();
    // Another artifact enters: it can again.
    const r2 = into(s, ap, card("Test Pebble", "Artifact", "{1}"), "hand");
    s = settle(run(s, planCast(s, ap, r2)), ap);
    expect(zone(s, r2)).toBe("battlefield");
    s = settle(run(s, planActivate(s, ap, m, 0)), ap);
    expect(golems()).toBe(n + 2);
  });
});

describe("round 334: Ore-Rich Stalactite // Cosmium Catalyst (craft with four or more red instant and/or sorcery cards)", () => {
  it("four or more red instant or sorcery cards from your graveyard, not fewer, not other colors", () => {
    const { s, ap } = setup([]);
    const o = putOnBattlefield(s, ap, stalactite());
    const red = [into(s, ap, bolt()), into(s, ap, lavaSpike()), into(s, ap, shock()), into(s, ap, bolt())];
    const blue = into(s, ap, divination());
    expect(craftPlan(s, ap, o, red.slice(0, 3))).toBeNull();
    expect(craftPlan(s, ap, o, [...red.slice(0, 3), blue])).toBeNull();
    expect(craftPlan(s, ap, o, red)).not.toBeNull();
    expect(craftPlan(s, ap, o, [...red, into(s, ap, shock())])).not.toBeNull();
  });

  it("Cosmium Catalyst: one of those cards at random, cast without paying its mana cost as the ability resolves", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const o = putOnBattlefield(s, ap, stalactite());
    const red = [into(s, ap, lavaSpike()), into(s, ap, lavaSpike()), into(s, ap, lavaSpike()), into(s, ap, lavaSpike())];
    s = craft(s, ap, o, red);
    expect(name(s, o)).toBe("Cosmium Catalyst");
    for (const id of red) expect(zone(s, id)).toBe("exile");
    const life = s.players[opp]!.life;
    s = settle(run(s, planActivate(s, ap, o, 0)), ap);
    // Only the one chosen at random is offered (River Song's Diary's way).
    expect(pend(s, "chooseOption").what).toBe("castFromAmong");
    const opts = (s.pending as { options: string[] }).options.filter((x) => x !== "none");
    expect(opts).toHaveLength(1);
    expect(red).toContain(opts[0]);
    s = act(s, { type: "chooseOption", player: ap, choice: opts[0]! });
    expect(pend(s, "castFree").objectId).toBe(opts[0]);
    // A sorcery, cast while the ability resolves (rulings: its timing ignored).
    s = settle(run(s, planCast(s, ap, opts[0]!, [{ kind: "player", id: opp }])), ap);
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(zone(s, opts[0]!)).toBe("graveyard");
    // The others are still used to craft it.
    expect(red.filter((id) => zone(s, id) === "exile")).toHaveLength(3);
  });
});

describe("round 334: Saheeli's Lattice // Mastercraft Raptor (craft with one or more Dinosaurs)", () => {
  it("power is the total power of the exiled cards used to craft it; toughness stays 4", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const l = putOnBattlefield(s, ap, lattice());
    const b = putOnBattlefield(s, ap, bear());
    expect(craftPlan(s, ap, l, [b])).toBeNull();
    const mats = [putOnBattlefield(s, ap, dino("Test Raptor", "3")), into(s, ap, dino("Test Rex", "6"))];
    s = craft(s, ap, l, mats);
    expect(name(s, l)).toBe("Mastercraft Raptor");
    expect(pt(s, l)).toBe("9/4");
  });
});

describe("round 334: Dire Flail // Dire Blunderbuss", () => {
  it("equipped: +3/+0, and attacking it may sacrifice another artifact to deal damage equal to its power to a creature", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const f = putOnBattlefield(s, ap, flail());
    const r = putOnBattlefield(s, ap, rock);
    s = craft(s, ap, f, [r]);
    expect(name(s, f)).toBe("Dire Blunderbuss");
    const b = putOnBattlefield(s, ap, bear());
    s.objects[f]!.attachedTo = b;
    invalidateCharacteristics(s);
    expect(pt(s, b)).toBe("5/2");
    const fodder = putOnBattlefield(s, ap, card("Test Trinket", "Artifact", "{1}"));
    const spare = putOnBattlefield(s, ap, card("Test Bauble", "Artifact", "{1}"));
    const foe = putOnBattlefield(s, opp, bear({ name: "Big Bear", power: "4", toughness: "5" }));
    for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    s = settle(s, ap);
    expect(pend(s, "chooseMay").player).toBe(ap);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    // Not Dire Blunderbuss itself: only the other artifact can be sacrificed.
    const p = pend(s, "pickPermanents");
    expect([...p.options].sort()).toEqual([fodder, spare].sort());
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [fodder] }), ap);
    expect(zone(s, fodder)).toBe("graveyard");
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(foe)] }), ap);
    expect(zone(s, foe)).toBe("graveyard");
  });
});

describe("round 334: Throne of the Grim Captain // The Grim Captain (craft with a Dinosaur, a Merfolk, a Pirate, and a Vampire)", () => {
  const merfolk = card("Test Merfolk", "Creature — Merfolk", "{U}", { power: "1", toughness: "1" });
  const pirate = card("Test Pirate", "Creature — Human Pirate", "{R}", { power: "2", toughness: "1" });
  const vampire = card("Test Vampire", "Creature — Vampire", "{B}", { power: "2", toughness: "2" });

  it("four separate objects, one of each type: one changeling isn't enough for two of them", () => {
    const { s, ap } = setup([]);
    const t = putOnBattlefield(s, ap, throne());
    const d = into(s, ap, dino("Test Raptor"));
    const m = into(s, ap, merfolk);
    const p = putOnBattlefield(s, ap, pirate);
    const v = into(s, ap, vampire);
    const ch = putOnBattlefield(s, ap, changeling());
    expect(craftPlan(s, ap, t, [d, m, p])).toBeNull();
    expect(craftPlan(s, ap, t, [d, m, p, p])).toBeNull();
    expect(craftPlan(s, ap, t, [d, m, p, d])).toBeNull();
    expect(craftPlan(s, ap, t, [d, m, p, v])).not.toBeNull();
    // A changeling fills any one slot.
    expect(craftPlan(s, ap, t, [d, m, p, ch])).not.toBeNull();
    expect(craftPlan(s, ap, t, [ch, m, p, v])).not.toBeNull();
  });

  it("attacking: each opponent sacrifices a nonland permanent, then you may put a creature card used to craft it onto the battlefield tapped and attacking", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const t = putOnBattlefield(s, ap, throne());
    const mats = [into(s, ap, dino("Test Rex", "6")), into(s, ap, merfolk), into(s, ap, pirate), into(s, ap, vampire)];
    s = craft(s, ap, t, mats);
    expect(name(s, t)).toBe("The Grim Captain");
    expect(pt(s, t)).toBe("7/7");
    // As if it had been around since the turn began.
    s.objects[t]!.controlledSinceTurn = -1;
    const others = s.turnOrder.filter((p) => p !== ap);
    const theirs = others.map((p) => putOnBattlefield(s, p, rock));
    for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: t, defender: opp }] });
    s = settle(s, ap);
    for (const id of theirs) expect(zone(s, id)).toBe("graveyard");
    expect(pend(s, "chooseMay").player).toBe(ap);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    const pick = pend(s, "searchLibrary");
    expect([...pick.cards].sort()).toEqual([...mats].sort());
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [mats[0]!] }), ap);
    // What it attacks is its controller's choice, not necessarily what the Captain attacks (rulings).
    const third = others[1]!;
    expect(pend(s, "chooseOption").what).toBe("attackWhom");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: String(third) }), ap);
    const rex = s.objects[mats[0]!]!;
    expect(rex.zone).toBe("battlefield");
    expect(rex.controller).toBe(ap);
    expect(rex.tapped).toBe(true);
    expect(rex.attacking).toBe(third);
    // No longer used to craft it.
    expect(s.linkedExile?.[`${t}@${s.objects[t]!.zoneChanges ?? 0}`]?.map((l) => l.id)).not.toContain(mats[0]);
  });
});

describe("round 334: bots", () => {
  it("a bot crafts with every spare graveyard card that fits (one or more)", () => {
    const { s, ap } = setup([]);
    const a = putOnBattlefield(s, ap, altar());
    const yard = [into(s, ap, bear()), into(s, ap, bear({ name: "Other Bear" }))];
    const ab = abilitiesOf(s, s.objects[a]!).activated[craftIndex(s, a)]!;
    const costs = abilityCosts(s, ap, s.objects[a]!, ab, []);
    expect([...(costs?.craft ?? [])].sort()).toEqual([...yard].sort());
  });

  it("a bot finds one material for each of the Throne's four types, a changeling filling the one left", () => {
    const { s, ap } = setup([]);
    const t = putOnBattlefield(s, ap, throne());
    const ab = abilitiesOf(s, s.objects[t]!).activated[craftIndex(s, t)]!;
    const ch = into(s, ap, changeling());
    const m = into(s, ap, card("Test Merfolk", "Creature — Merfolk", "{U}", { power: "1", toughness: "1" }));
    const p = into(s, ap, card("Test Pirate", "Creature — Pirate", "{R}", { power: "2", toughness: "1" }));
    expect(abilityCosts(s, ap, s.objects[t]!, ab, [])).toBeNull();
    const v = into(s, ap, card("Test Vampire", "Creature — Vampire", "{B}", { power: "2", toughness: "2" }));
    expect([...(abilityCosts(s, ap, s.objects[t]!, ab, [])?.craft ?? [])].sort()).toEqual([ch, m, p, v].sort());
  });
});
