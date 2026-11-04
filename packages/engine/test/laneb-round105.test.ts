// Lane B round B105: Sarkhan's Whelp, Avalanche of Sector 7, Avatar of Discord, Bebop & Rocksteady, Centaur Omenreader,
// Graveyard Shift, Mindshrieker, West Wind Avatar, Mana Short, Transcendence, Flesh Reaver, Horrid Shadowspinner, Arashin
// Sovereign, Leitmotif Composer, Enslave, Curse of Oblivion, Kraken of the Straits, Fall from Favor and Old Man Willow.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { dealDamage, objectSource } from "../src/damage";
import { blockProblem, botActions, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; questions of the players in `me` stop it, others the bots answer. */
const settle = (s: GameState, opts: { me?: PlayerId[]; may?: boolean } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay" && opts.may !== undefined) s = act(s, { type: "chooseMay", player: p.player, yes: opts.may });
    else if (p && opts.me?.includes(p.player)) return s;
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (pid: PlayerId): TargetChoice => ({ kind: "player", id: pid });
/** Moves a new card for `def` from the battlefield into `pid`'s `zone`. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
/** Taps everything a player controls, then gives them exactly this mana. */
const poolOnly = (s: GameState, pid: PlayerId, mana: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  for (const id of s.battlefield) if (s.objects[id]!.controller === pid) s.objects[id]!.tapped = true;
  Object.assign(s.players[pid]!.manaPool, mana);
};
/** Puts every card of `pid`'s hand on the bottom of their library. */
const trimHand = (s: GameState, pid: PlayerId) => {
  const p = s.players[pid]!;
  for (const id of p.hand.splice(0)) {
    s.objects[id]!.zone = "library";
    p.library.push(id);
  }
};
const next = (s: GameState, pid: PlayerId, n = 1) => s.turnOrder[(s.turnOrder.indexOf(pid) + n) % s.turnOrder.length]!;
const ptOf = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const attach = (s: GameState, pid: PlayerId, def: CardDef, to: string) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.attachedTo = to;
  invalidateCharacteristics(s);
  return id;
};
/** Attackers declared and every defending player's blocks none, with the attack triggers waiting. */
const attackWith = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) => {
  s = passUntil(s, "declareAttackers", ap);
  return act(s, { type: "declareAttackers", player: ap, attacks });
};

// Real oracle text (Scryfall).
const whelp = (): CardDef => ({"oracleId":"482f5fc8-ca3b-4280-8cf7-a1c55f8b9f12","name":"Sarkhan's Whelp","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying (This creature can't be blocked except by creatures with flying or reach.)\nWhenever you activate an ability of a Sarkhan planeswalker, this creature deals 1 damage to any target.","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/0/7/07135c4d-b4de-4054-800a-11090ed32692.jpg?1783934487","artUrl":"https://cards.scryfall.io/art_crop/front/0/7/07135c4d-b4de-4054-800a-11090ed32692.jpg?1783934487","commanderLegal":"legal","set":"m19","releasedAt":"2018-07-13","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const avalanche = (): CardDef => ({"oracleId":"4eb1414c-ba12-4bae-b410-79d51925d6fa","name":"Avalanche of Sector 7","manaCost":"{2}{R}","cmc":3,"typeLine":"Legendary Creature — Human Rebel","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Rebel"],"oracleText":"Menace\nAvalanche of Sector 7's power is equal to the number of artifacts your opponents control.\nWhenever an opponent activates an ability of an artifact they control, Avalanche of Sector 7 deals 1 damage to that player.","power":"*","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":["Menace"],"imageUrl":"https://cards.scryfall.io/normal/front/2/0/20a87dbc-5deb-42ae-9097-806e9a27466f.jpg?1783906357","artUrl":"https://cards.scryfall.io/art_crop/front/2/0/20a87dbc-5deb-42ae-9097-806e9a27466f.jpg?1783906357","commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const discord = (): CardDef => ({"oracleId":"3f806353-592e-431c-a7dd-a4c64034f94d","name":"Avatar of Discord","manaCost":"{B/R}{B/R}{B/R}","cmc":3,"typeLine":"Creature — Avatar","supertypes":[],"types":["Creature"],"subtypes":["Avatar"],"oracleText":"({B/R} can be paid with either {B} or {R}.)\nFlying\nWhen this creature enters, sacrifice it unless you discard two cards.","power":"5","toughness":"3","colors":["B","R"],"colorIdentity":["B","R"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/a/d/adf2a1fd-eb1e-46aa-b715-6e6fb5195e42.jpg?1783941899","artUrl":"https://cards.scryfall.io/art_crop/front/a/d/adf2a1fd-eb1e-46aa-b715-6e6fb5195e42.jpg?1783941899","commanderLegal":"legal","set":"arc","releasedAt":"2010-06-18","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bebop = (): CardDef => ({"oracleId":"a08b0a07-6da2-4ff6-88e5-88355dd84589","name":"Bebop & Rocksteady","manaCost":"{1}{B/G}{B/G}","cmc":3,"typeLine":"Legendary Creature — Boar Rhino Mutant","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Boar","Rhino","Mutant"],"oracleText":"Whenever Bebop & Rocksteady attack or block, sacrifice a permanent unless you discard a card.","power":"7","toughness":"5","colors":["B","G"],"colorIdentity":["B","G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/3/535461bd-f763-408b-816f-64b7bfb9210d.jpg?1783904078","artUrl":"https://cards.scryfall.io/art_crop/front/5/3/535461bd-f763-408b-816f-64b7bfb9210d.jpg?1783904078","commanderLegal":"legal","set":"tmt","releasedAt":"2026-03-06","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const omenreader = (): CardDef => ({"oracleId":"76b65b2a-9905-4857-806a-6dbcf195fc81","name":"Centaur Omenreader","manaCost":"{3}{G}","cmc":4,"typeLine":"Snow Creature — Centaur Shaman","supertypes":["Snow"],"types":["Creature"],"subtypes":["Centaur","Shaman"],"oracleText":"As long as this creature is tapped, creature spells you cast cost {2} less to cast.","power":"3","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/8/5807814f-7b18-431a-8031-898ff70ad69f.jpg?1783943096","artUrl":"https://cards.scryfall.io/art_crop/front/5/8/5807814f-7b18-431a-8031-898ff70ad69f.jpg?1783943096","commanderLegal":"legal","set":"fut","releasedAt":"2007-05-04","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const shift = (): CardDef => ({"oracleId":"da8a93c6-66e2-492d-8894-397ba9ec5a87","name":"Graveyard Shift","manaCost":"{4}{B}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"This spell has flash as long as there are five or more mana values among cards in your graveyard.\nReturn target creature card from your graveyard to the battlefield.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/9/394d7fb3-44ee-409f-a992-27e5aabd9c2b.jpg?1783923129","artUrl":"https://cards.scryfall.io/art_crop/front/3/9/394d7fb3-44ee-409f-a992-27e5aabd9c2b.jpg?1783923129","commanderLegal":"legal","set":"snc","releasedAt":"2022-04-29","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const shrieker = (): CardDef => ({"oracleId":"f638ceaf-6b44-4d99-95f3-0aa97b1738fe","name":"Mindshrieker","manaCost":"{1}{U}","cmc":2,"typeLine":"Creature — Spirit Bird","supertypes":[],"types":["Creature"],"subtypes":["Spirit","Bird"],"oracleText":"Flying\n{2}: Target player mills a card. This creature gets +X/+X until end of turn, where X is the milled card's mana value.","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":["Flying","Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/a/b/ab1e52af-6746-4ec6-afbf-008594c874f8.jpg?1783940971","artUrl":"https://cards.scryfall.io/art_crop/front/a/b/ab1e52af-6746-4ec6-afbf-008594c874f8.jpg?1783940971","commanderLegal":"legal","set":"isd","releasedAt":"2011-09-30","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const westWind = (): CardDef => ({"oracleId":"92e45a8f-c582-45e1-9b7f-def219023ebf","name":"West Wind Avatar","manaCost":"{5}{G}{G}","cmc":7,"typeLine":"Creature — Cat Spirit Avatar","supertypes":[],"types":["Creature"],"subtypes":["Cat","Spirit","Avatar"],"oracleText":"Trample\nWhenever this creature enters or attacks, you may sacrifice a token or a land. If you do, you gain 3 life.\nDisappear — At the beginning of your end step, if a permanent left the battlefield under your control this turn, draw a card.","power":"7","toughness":"7","colors":["G"],"colorIdentity":["G"],"keywords":["Disappear","Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/f/4/f4b8f7e6-9bff-430b-b2f5-4308d57d1194.jpg?1783904081","artUrl":"https://cards.scryfall.io/art_crop/front/f/4/f4b8f7e6-9bff-430b-b2f5-4308d57d1194.jpg?1783904081","commanderLegal":"legal","set":"tmt","releasedAt":"2026-03-06","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const manaShort = (): CardDef => ({"oracleId":"48207d1c-448a-4e1b-974a-642dfea75933","name":"Mana Short","manaCost":"{2}{U}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Tap all lands target player controls and that player loses all unspent mana.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/3/73e3e0b3-5284-464f-8c62-0f7801c966f5.jpg?1783948704","artUrl":"https://cards.scryfall.io/art_crop/front/7/3/73e3e0b3-5284-464f-8c62-0f7801c966f5.jpg?1783948704","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const transcendence = (): CardDef => ({"oracleId":"f9279f8f-3d19-4f5b-b194-cb8c65313b7e","name":"Transcendence","manaCost":"{3}{W}{W}{W}","cmc":6,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"You don't lose the game for having 0 or less life.\nWhen you have 20 or more life, you lose the game.\nWhenever you lose life, you gain 2 life for each 1 life you lost. (Damage dealt to you causes you to lose life.)","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/4/84e8bee2-9e3d-493c-a937-645bf3dcf0db.jpg?1783945166","artUrl":"https://cards.scryfall.io/art_crop/front/8/4/84e8bee2-9e3d-493c-a937-645bf3dcf0db.jpg?1783945166","commanderLegal":"legal","set":"tor","releasedAt":"2002-02-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const reaver = (): CardDef => ({"oracleId":"a143fdfe-f1aa-4eab-8c81-8c72a4dc1695","name":"Flesh Reaver","manaCost":"{1}{B}","cmc":2,"typeLine":"Creature — Phyrexian Horror","supertypes":[],"types":["Creature"],"subtypes":["Phyrexian","Horror"],"oracleText":"Whenever this creature deals damage to a creature or opponent, this creature deals that much damage to you.","power":"4","toughness":"4","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/3/e3dc6a91-ca13-45da-ba65-8fbb16c159c0.jpg?1783946344","artUrl":"https://cards.scryfall.io/art_crop/front/e/3/e3dc6a91-ca13-45da-ba65-8fbb16c159c0.jpg?1783946344","commanderLegal":"legal","set":"usg","releasedAt":"1998-10-12","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const spinner = (): CardDef => ({"oracleId":"5fcbb5d3-71d1-4946-b806-ba6376338eba","name":"Horrid Shadowspinner","manaCost":"{1}{U}{B}","cmc":3,"typeLine":"Creature — Horror","supertypes":[],"types":["Creature"],"subtypes":["Horror"],"oracleText":"Lifelink\nWhenever this creature attacks, you may draw cards equal to its power. If you do, discard that many cards.","power":"2","toughness":"3","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Lifelink"],"imageUrl":"https://cards.scryfall.io/normal/front/6/2/62b69aaf-0aae-4f6e-a27f-0129882dfe1d.jpg?1783911250","artUrl":"https://cards.scryfall.io/art_crop/front/6/2/62b69aaf-0aae-4f6e-a27f-0129882dfe1d.jpg?1783911250","commanderLegal":"legal","set":"mh3","releasedAt":"2024-06-14","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const sovereign = (): CardDef => ({"oracleId":"cb58055f-8190-4bc7-ad32-844ca66fd2b0","name":"Arashin Sovereign","manaCost":"{5}{G}{W}","cmc":7,"typeLine":"Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying\nWhen this creature dies, you may put it on your choice of the top or bottom of its owner's library.","power":"6","toughness":"6","colors":["G","W"],"colorIdentity":["G","W"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/b/db7fbf78-8cb6-4fbf-b925-5543bcb64b45.jpg?1783938575","artUrl":"https://cards.scryfall.io/art_crop/front/d/b/db7fbf78-8cb6-4fbf-b925-5543bcb64b45.jpg?1783938575","commanderLegal":"legal","set":"dtk","releasedAt":"2015-03-27","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const composer = (): CardDef => ({"oracleId":"61816f98-9d1a-4b16-9194-cb7249880710","name":"Leitmotif Composer","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Human Bard","supertypes":[],"types":["Creature"],"subtypes":["Human","Bard"],"oracleText":"Whenever this creature deals combat damage to a player, draw a card.\nWhenever you cast an instant or sorcery spell with mana value 5 or greater, create a token that's a copy of this creature.\n{2}{U}: Creatures named Leitmotif Composer can't be blocked this turn.","power":"2","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/5/2511b281-f822-427c-ac5f-d376b64fa6cf.jpg?1783903861","artUrl":"https://cards.scryfall.io/art_crop/front/2/5/2511b281-f822-427c-ac5f-d376b64fa6cf.jpg?1783903861","commanderLegal":"legal","set":"soc","releasedAt":"2026-04-24","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const enslave = (): CardDef => ({"oracleId":"879ba7c4-4557-4166-adb0-b52454816e5a","name":"Enslave","manaCost":"{4}{B}{B}","cmc":6,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nYou control enchanted creature.\nAt the beginning of your upkeep, enchanted creature deals 1 damage to its owner.","colors":["B"],"colorIdentity":["B"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/1/7/17c2f5f0-1f37-4f51-9c10-c02e2ef7d4ee.jpg?1783941313","artUrl":"https://cards.scryfall.io/art_crop/front/1/7/17c2f5f0-1f37-4f51-9c10-c02e2ef7d4ee.jpg?1783941313","commanderLegal":"legal","set":"nph","releasedAt":"2011-05-13","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const oblivion = (): CardDef => ({"oracleId":"10b16b2b-7d7c-4f6f-932a-1f3bd30d33f1","name":"Curse of Oblivion","manaCost":"{3}{B}","cmc":4,"typeLine":"Enchantment — Aura Curse","supertypes":[],"types":["Enchantment"],"subtypes":["Aura","Curse"],"oracleText":"Enchant player\nAt the beginning of enchanted player's upkeep, that player exiles two cards from their graveyard.","colors":["B"],"colorIdentity":["B"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/c/1/c15cbd2f-8bbf-423a-81fe-521fd99bc8bf.jpg?1783940957","artUrl":"https://cards.scryfall.io/art_crop/front/c/1/c15cbd2f-8bbf-423a-81fe-521fd99bc8bf.jpg?1783940957","commanderLegal":"legal","set":"isd","releasedAt":"2011-09-30","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const kraken = (): CardDef => ({"oracleId":"c282581f-3d77-47ce-ac92-ed6217754e38","name":"Kraken of the Straits","manaCost":"{5}{U}{U}","cmc":7,"typeLine":"Creature — Kraken","supertypes":[],"types":["Creature"],"subtypes":["Kraken"],"oracleText":"Creatures with power less than the number of Islands you control can't block this creature.","power":"6","toughness":"6","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/2/12ae69b3-afa5-4763-a0c8-c3d9d96f6ddc.jpg?1783939569","artUrl":"https://cards.scryfall.io/art_crop/front/1/2/12ae69b3-afa5-4763-a0c8-c3d9d96f6ddc.jpg?1783939569","commanderLegal":"legal","set":"bng","releasedAt":"2014-02-07","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const favor = (): CardDef => ({"oracleId":"e89e1fae-bac3-4cc0-a233-24b9e08a5290","name":"Fall from Favor","manaCost":"{2}{U}","cmc":3,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nWhen this Aura enters, tap enchanted creature and you become the monarch.\nEnchanted creature doesn't untap during its controller's untap step unless that player is the monarch.","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/e/7/e709a18f-b99d-4fa1-ae5c-7f22abd02c0a.jpg?1783928863","artUrl":"https://cards.scryfall.io/art_crop/front/e/7/e709a18f-b99d-4fa1-ae5c-7f22abd02c0a.jpg?1783928863","commanderLegal":"legal","set":"cmr","releasedAt":"2020-11-20","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const willow = (): CardDef => ({"oracleId":"96c96842-42c2-4aa3-95e2-6186d4ab5693","name":"Old Man Willow","manaCost":"{2}{B}{G}","cmc":4,"typeLine":"Legendary Creature — Treefolk","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Treefolk"],"oracleText":"Old Man Willow's power and toughness are each equal to the number of lands you control.\nWhenever Old Man Willow attacks, you may sacrifice another creature or a token. When you do, target creature an opponent controls gets -2/-2 until end of turn.","power":"*","toughness":"*","colors":["B","G"],"colorIdentity":["B","G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/3/0362b7c4-fff5-4bc2-b32d-913f85c23cc4.jpg?1783916248","artUrl":"https://cards.scryfall.io/art_crop/front/0/3/0362b7c4-fff5-4bc2-b32d-913f85c23cc4.jpg?1783916248","commanderLegal":"legal","set":"ltr","releasedAt":"2023-06-23","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const sarkhan = card("Test Sarkhan", "Legendary Planeswalker — Sarkhan", "{2}{R}", { oracleText: "+1: Draw a card.", loyalty: "3", colors: ["R"] });
const jace = card("Test Jace", "Legendary Planeswalker — Jace", "{2}{U}", { oracleText: "+1: Draw a card.", loyalty: "3", colors: ["U"] });
const rock = card("Test Rock", "Artifact", "{1}", { oracleText: "{T}: Add {C}." });
const lamp = card("Test Lamp", "Artifact", "{1}", { oracleText: "{1}, {T}: Draw a card." });
const elf = card("Test Elf", "Creature — Elf", "{G}", { oracleText: "{T}: Add {G}.", power: "1", toughness: "1", colors: ["G"] });
const golem = card("Test Golem", "Artifact Creature — Golem", "{5}", { power: "4", toughness: "4" });
const shock = card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target.", colors: ["R"] });
const token = card("Test Thopter", "Token Artifact Creature — Thopter", "", { power: "1", toughness: "1" });
const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3", colors: ["R"] });

describe("Lane B round B105", () => {
  it("all nineteen cards are supported", () =>
    supported(whelp(), avalanche(), discord(), bebop(), omenreader(), shift(), shrieker(), westWind(), manaShort(), transcendence(), reaver(), spinner(), sovereign(), composer(), enslave(), oblivion(), kraken(), favor(), willow()));
  it("Sarkhan's Whelp: activating a Sarkhan planeswalker's ability deals 1 damage to any target; another planeswalker's doesn't", () => {
    for (const walkerDef of [sarkhan, jace]) {
      let { s, ap } = setup([]);
      putOnBattlefield(s, ap, whelp());
      const w = putOnBattlefield(s, ap, walkerDef);
      s.objects[w]!.counters.loyalty = 3;
      const lives = () => s.turnOrder.filter((p) => p !== ap).reduce((a, p) => a + s.players[p]!.life, 0);
      const before = lives();
      s = settle(run(s, planActivate(s, ap, w, 0)));
      expect(s.objects[w]!.counters.loyalty).toBe(4);
      expect(lives()).toBe(walkerDef === sarkhan ? before - 1 : before);
    }
  });

  it("Avalanche of Sector 7: power is the artifacts your opponents control; an opponent activating their artifact's ability, mana abilities too, takes 1", () => {
    let { s, ap, opp } = setup([]);
    const a = putOnBattlefield(s, opp, avalanche());
    expect(ptOf(s, a)).toBe("0/3");
    const r = putOnBattlefield(s, ap, rock);
    const l = putOnBattlefield(s, ap, lamp);
    putOnBattlefield(s, opp, golem);
    expect(ptOf(s, a)).toBe("2/3");
    const life = s.players[ap]!.life;
    // A mana ability of an artifact the activating opponent controls.
    s = settle(act(s, { type: "activateMana", player: ap, objectId: r, mana: "C" }));
    expect(s.players[ap]!.life).toBe(life - 1);
    // An ability that isn't a mana ability.
    s = settle(run(s, planActivate(s, ap, l, 0)));
    expect(s.players[ap]!.life).toBe(life - 2);
    // A creature's ability isn't an artifact's.
    const e = putOnBattlefield(s, ap, elf);
    s = settle(act(s, { type: "activateMana", player: ap, objectId: e, mana: "G" }));
    expect(s.players[ap]!.life).toBe(life - 2);
    // Its controller's own artifacts don't count.
    let t = setup([]);
    putOnBattlefield(t.s, t.ap, avalanche());
    const mine = putOnBattlefield(t.s, t.ap, rock);
    const mylife = t.s.players[t.ap]!.life;
    t.s = settle(act(t.s, { type: "activateMana", player: t.ap, objectId: mine, mana: "C" }));
    expect(t.s.players[t.ap]!.life).toBe(mylife);
  });

  it("Avatar of Discord: discard two cards or sacrifice it; with only one card in hand it's sacrificed", () => {
    for (const cards of [2, 1]) {
      let { s, ap, ids } = setup([discord()]);
      trimHand(s, ap);
      s.players[ap]!.library.splice(s.players[ap]!.library.indexOf(ids[0]!), 1);
      s.objects[ids[0]!]!.zone = "hand";
      s.players[ap]!.hand.push(ids[0]!);
      const others = Array.from({ length: cards }, () => into(s, ap, bear(), "hand"));
      s = settle(run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto")), { me: [ap] });
      if (cards === 2) {
        expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
        s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { me: [ap] });
        if (s.pending?.kind === "discard") s = settle(act(s, { type: "discard", player: ap, objectIds: others }));
        expect(zone(s, ids[0]!)).toBe("battlefield");
        for (const id of others) expect(zone(s, id)).toBe("graveyard");
      } else {
        expect(s.pending).toBeFalsy();
        expect(zone(s, ids[0]!)).toBe("graveyard");
        expect(zone(s, others[0]!)).toBe("hand");
      }
    }
  });

  it("Bebop & Rocksteady: as they attack, discard a card or sacrifice a permanent; with an empty hand, a permanent", () => {
    for (const discardIt of [true, false]) {
      let { s, ap, opp } = setup([]);
      const b = putOnBattlefield(s, ap, bebop());
      trimHand(s, ap);
      const c = into(s, ap, bear(), "hand");
      if (!discardIt) {
        s.players[ap]!.hand.splice(0);
        s.objects[c]!.zone = "library";
        s.players[ap]!.library.push(c);
      }
      const permanents = s.battlefield.filter((id) => s.objects[id]!.controller === ap).length;
      s = attackWith(s, ap, [{ attacker: b, defender: opp }]);
      s = settle(s, { me: [ap] });
      if (discardIt) {
        expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
        s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { me: [ap] });
        expect(zone(s, c)).toBe("graveyard");
        expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap).length).toBe(permanents);
      } else {
        // No card to discard: a permanent of your choice is sacrificed.
        for (let i = 0; i < 5 && s.pending && s.pending.player === ap; i++) for (const a of botActions(s, ap)) s = act(s, a);
        s = settle(s);
        expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap).length).toBe(permanents - 1);
      }
    }
  });

  it("Centaur Omenreader: creature spells you cast cost {2} less only while it's tapped", () => {
    let { s, ap } = setup([]);
    const c = putOnBattlefield(s, ap, omenreader());
    const big = into(s, ap, golem, "hand");
    poolOnly(s, ap, { C: 3 });
    s.objects[c]!.tapped = false;
    invalidateCharacteristics(s);
    expect(planCast(s, ap, big, undefined, undefined, "auto")).toBeNull();
    s.objects[c]!.tapped = true;
    invalidateCharacteristics(s);
    s = settle(run(s, planCast(s, ap, big, undefined, undefined, "auto")));
    expect(zone(s, big)).toBe("battlefield");
    // A noncreature spell doesn't cost less.
    const sh = into(s, ap, shock, "hand");
    expect(planCast(s, ap, sh, [player(next(s, ap))], undefined, "auto")).toBeNull();
  });

  it("Graveyard Shift: flash while five or more mana values are among cards in your graveyard (a land's 0 counts)", () => {
    let { s, ap, opp, ids } = setup([shift()]);
    const dead = into(s, ap, ogre, "graveyard");
    for (const d of [card("Mv0", "Land", ""), card("Mv1", "Artifact", "{1}"), card("Mv2", "Artifact", "{2}")]) into(s, ap, d, "graveyard");
    // Four mana values (0, 1, 2, 3), on an opponent's turn: not castable.
    s = passUntil(s, "upkeep", opp);
    poolOnly(s, ap, { B: 1, C: 4 });
    expect(planCast(s, ap, ids[0]!, [tgt(dead)], undefined, "auto")).toBeNull();
    into(s, ap, card("Mv4", "Artifact", "{4}"), "graveyard");
    // Priority: the upkeep is the opponent's, who passes first.
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(dead)], undefined, "auto")));
    expect(zone(s, dead)).toBe("battlefield");
    expect(controllerOf(s, s.objects[dead]!)).toBe(ap);
  });

  it("Mindshrieker: target player mills a card, and it gets +X/+X for that card's mana value", () => {
    let { s, ap, opp } = setup([]);
    const m = putOnBattlefield(s, ap, shrieker());
    into(s, opp, golem, "library");
    s = settle(run(s, planActivate(s, ap, m, 0, [player(opp)])));
    expect(s.players[opp]!.graveyard.length).toBe(1);
    expect(ptOf(s, m)).toBe("6/6");
    // A land: +0/+0.
    into(s, opp, card("Test Land", "Land", ""), "library");
    s = settle(run(s, planActivate(s, ap, m, 0, [player(opp)])));
    expect(ptOf(s, m)).toBe("6/6");
  });

  it("Mindshrieker: a milled card exiled instead still counts (CR 701.17c)", () => {
    let { s, ap, opp } = setup([]);
    const m = putOnBattlefield(s, ap, shrieker());
    putOnBattlefield(s, ap, card("Test Rest", "Enchantment", "{1}{W}", { oracleText: "If a card or token would be put into a graveyard from anywhere, exile it instead." }));
    const g = into(s, opp, golem, "library");
    s = settle(run(s, planActivate(s, ap, m, 0, [player(opp)])));
    expect(zone(s, g)).toBe("exile");
    expect(ptOf(s, m)).toBe("6/6");
  });

  it("West Wind Avatar: as it enters, you may sacrifice a token or a land to gain 3 life; a nontoken nonland creature can't be", () => {
    let { s, ap, ids } = setup([westWind()]);
    const t = putOnBattlefield(s, ap, token);
    s.objects[t]!.isToken = true;
    const b = putOnBattlefield(s, ap, bear());
    invalidateCharacteristics(s);
    const life = s.players[ap]!.life;
    s = settle(run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto")), { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { me: [ap] });
    const p = s.pending as { kind: string; options?: string[]; candidates?: string[] } | undefined;
    const offered = JSON.stringify(p);
    expect(offered).toContain(t);
    expect(offered).not.toContain(b);
    for (let i = 0; i < 5 && s.pending?.player === ap; i++) for (const a of botActions(s, ap)) s = act(s, a);
    s = settle(s);
    expect(s.players[ap]!.life).toBe(life + 3);
    expect(zone(s, b)).toBe("battlefield");
  });

  it("Mana Short: taps all lands target player controls and empties their mana pool", () => {
    let { s, ap, opp, ids } = setup([manaShort()]);
    const lands = [putOnBattlefield(s, opp, card("Land A", "Land", "")), putOnBattlefield(s, opp, card("Land B", "Land", ""))];
    s.players[opp]!.manaPool.R = 2;
    s.players[opp]!.manaPool.C = 1;
    const mine = putOnBattlefield(s, ap, card("Land C", "Land", ""));
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)], undefined, "auto")));
    for (const l of lands) expect(s.objects[l]!.tapped).toBe(true);
    expect(s.objects[mine]!.tapped).toBe(false);
    expect(Object.values(s.players[opp]!.manaPool).every((n) => n === 0)).toBe(true);
  });

  it("Transcendence: whenever you lose life, you gain twice that much", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, transcendence());
    const o = putOnBattlefield(s, opp, ogre);
    // With 20 or more life you lose the game (its own state trigger).
    s.players[ap]!.life = 10;
    const life = s.players[ap]!.life;
    dealDamage(s, objectSource(s, s.objects[o]!), { player: ap }, 3);
    s = settle(s);
    expect(s.players[ap]!.life).toBe(life + 3);
  });

  it("Flesh Reaver: damage it deals to a creature or an opponent is dealt to you too", () => {
    let { s, ap, opp } = setup([]);
    const r = putOnBattlefield(s, ap, reaver());
    const b = putOnBattlefield(s, opp, golem);
    const life = s.players[ap]!.life;
    dealDamage(s, objectSource(s, s.objects[r]!), { object: s.objects[b]! }, 3);
    s = settle(s);
    expect(s.players[ap]!.life).toBe(life - 3);
    dealDamage(s, objectSource(s, s.objects[r]!), { player: opp }, 2);
    s = settle(s);
    expect(s.players[ap]!.life).toBe(life - 5);
  });

  it("Horrid Shadowspinner: as it attacks, you may draw cards equal to its power, then discard that many", () => {
    let { s, ap, opp } = setup([]);
    const h = putOnBattlefield(s, ap, spinner());
    trimHand(s, ap);
    const kept = into(s, ap, ogre, "hand");
    const hand = s.players[ap]!.hand.length;
    const yard = s.players[ap]!.graveyard.length;
    s = attackWith(s, ap, [{ attacker: h, defender: opp }]);
    s = settle(s, { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { me: [ap] });
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, count: 2 });
    s = settle(act(s, { type: "discard", player: ap, objectIds: s.players[ap]!.hand.filter((id) => id !== kept) }));
    expect(s.players[ap]!.hand).toEqual([kept]);
    expect(s.players[ap]!.graveyard.length).toBe(yard + 2);
  });

  it("Arashin Sovereign: when it dies, you may put it on the top or bottom of its owner's library, your choice", () => {
    for (const where of ["top", "bottom"] as const) {
      let { s, ap, opp } = setup([]);
      // Owned by an opponent, controlled by you: you choose, into its owner's library.
      const a = putOnBattlefield(s, opp, sovereign());
      s.objects[a]!.controller = ap;
      invalidateCharacteristics(s);
      s = settle(run(s, planCast(s, ap, into(s, ap, card("Test Doom", "Instant", "{B}", { oracleText: "Destroy target creature.", colors: ["B"] }), "hand"), [tgt(a)], undefined, "auto")), { me: [ap] });
      expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
      s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { me: [ap] });
      expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "topOrBottom" });
      s = settle(act(s, { type: "chooseOption", player: ap, choice: where }));
      const lib = s.players[opp]!.library;
      expect(where === "top" ? lib[0] : lib[lib.length - 1]).toBe(a);
    }
  });

  it("Leitmotif Composer: creatures named Leitmotif Composer can't be blocked this turn, ones that arrive later too", () => {
    let { s, ap, opp } = setup([]);
    const c = putOnBattlefield(s, ap, composer());
    const theirs = putOnBattlefield(s, opp, composer());
    const other = putOnBattlefield(s, ap, bear());
    const blocker = putOnBattlefield(s, opp, golem);
    s = settle(run(s, planActivate(s, ap, c, 0)));
    const later = putOnBattlefield(s, ap, composer());
    for (const id of [c, theirs, later]) {
      s.objects[id]!.attacking = opp;
      expect(blockProblem(s, s.objects[blocker]!, s.objects[id]!)).not.toBeNull();
    }
    s.objects[other]!.attacking = opp;
    expect(blockProblem(s, s.objects[blocker]!, s.objects[other]!)).toBeNull();
  });

  it("Enslave: you control the creature; at your upkeep it deals 1 damage to its owner", () => {
    let { s, ap, opp } = setup([]);
    const o = putOnBattlefield(s, opp, ogre);
    attach(s, ap, enslave(), o);
    expect(controllerOf(s, s.objects[o]!)).toBe(ap);
    for (let n = 1; n < 4; n++) trimHand(s, next(s, ap, n));
    s = passUntil(s, "upkeep", next(s, ap));
    s = settle(s);
    s = passUntil(s, "upkeep", ap);
    const [theirs, mine] = [s.players[opp]!.life, s.players[ap]!.life];
    s = settle(s);
    expect(s.players[opp]!.life).toBe(theirs - 1);
    expect(s.players[ap]!.life).toBe(mine);
  });

  it("Curse of Oblivion: at the enchanted player's upkeep they exile two cards from their graveyard (one if that's all)", () => {
    let { s, ap, opp } = setup([]);
    const curse = putOnBattlefield(s, ap, oblivion());
    s.objects[curse]!.attachedToPlayer = opp;
    invalidateCharacteristics(s);
    const g = [into(s, opp, bear(), "graveyard"), into(s, opp, ogre, "graveyard"), into(s, opp, golem, "graveyard")];
    trimHand(s, ap);
    s = passUntil(s, "upkeep", opp);
    s = settle(s);
    expect(g.filter((id) => zone(s, id) === "exile").length).toBe(2);
  });

  it("Kraken of the Straits: creatures with power less than the number of Islands you control can't block it", () => {
    const { s, ap, opp } = setup([]);
    const k = putOnBattlefield(s, ap, kraken());
    s.objects[k]!.attacking = opp;
    const islands = s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.name === "Island").length;
    expect(islands).toBe(3);
    const small = putOnBattlefield(s, opp, bear());
    const big = putOnBattlefield(s, opp, ogre);
    invalidateCharacteristics(s);
    expect(blockProblem(s, s.objects[small]!, s.objects[k]!)).toMatch(/power less than 3/);
    expect(blockProblem(s, s.objects[big]!, s.objects[k]!)).toBeNull();
  });

  it("Fall from Favor: taps the creature, you become the monarch; it doesn't untap unless its controller is the monarch", () => {
    let { s, ap, opp, ids } = setup([favor()]);
    const o = putOnBattlefield(s, opp, ogre);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(o)], undefined, "auto")));
    expect(s.objects[o]!.tapped).toBe(true);
    expect(s.monarch).toBe(ap);
    for (let n = 0; n < 4; n++) trimHand(s, next(s, ap, n));
    s = passUntil(s, "upkeep", opp);
    expect(s.objects[o]!.tapped).toBe(true);
    // Its controller the monarch: it untaps as usual.
    s.monarch = opp;
    invalidateCharacteristics(s);
    s = passUntil(s, "upkeep", next(s, opp));
    s = passUntil(s, "upkeep", opp);
    expect(s.objects[o]!.tapped).toBe(false);
  });

  it("Old Man Willow: as it attacks, you may sacrifice another creature or a token; when you do, target creature an opponent controls gets -2/-2", () => {
    let { s, ap, opp } = setup([]);
    const w = putOnBattlefield(s, ap, willow());
    const t = putOnBattlefield(s, ap, card("Test Treasure", "Token Artifact — Treasure", ""));
    s.objects[t]!.isToken = true;
    const victim = putOnBattlefield(s, opp, ogre);
    invalidateCharacteristics(s);
    // Its power and toughness: the lands you control (fourteen from setup).
    expect(ptOf(s, w)).toBe("14/14");
    s = attackWith(s, ap, [{ attacker: w, defender: opp }]);
    s = settle(s, { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { me: [ap] });
    // The token is the only choice (a land isn't a creature or a token; Willow itself isn't "another" creature), so it's
    // sacrificed, and the reflexive trigger asks for its target.
    // A token ceases to exist once it's left the battlefield (CR 111.7).
    expect(s.battlefield).not.toContain(t);
    expect(zone(s, w)).toBe("battlefield");
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(s);
    expect(ptOf(s, victim)).toBe("1/1");
  });
});
