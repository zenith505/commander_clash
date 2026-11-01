// Lane B, round 70: unsupported cards from the bottom of the popularity list (`npm run popular -- --least`): power-up
// turned off for an extra turn, Equipment moved from another creature, and casting or playing cards exiled with a
// permanent (CR 607.2a) as an ability resolves or for the rest of the turn.

import { describe, expect, it } from "vitest";
import { act, forest, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, botActions, castProblem, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, mayPlayFromExile, planActivate, planCast, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";
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
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error("never got there");
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices: CostChoices = {}) => run(s, planCast(s, pid, id, targets, undefined, "auto", undefined, choices));
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
/** Ready to attack: not summoning sick. */
const ready = (s: GameState, id: string) => {
  s.objects[id]!.controlledSinceTurn = -1;
  return id;
};
/** On to `pid`'s declare attackers step and attacks with `attackers` (at `defender`), then the triggers wait. */
const attack = (s: GameState, pid: PlayerId, attackers: string[], defender: PlayerId) => {
  s = goUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.activePlayer === pid);
  return act(s, { type: "declareAttackers", player: pid, attacks: attackers.map((a) => ({ attacker: a, defender })) });
};

// Real oracle text (Scryfall).
const kang = (): CardDef => ({"oracleId":"da6e24a4-8adc-41a1-b5eb-3e31dc1250c9","name":"Kang the Conqueror","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Legendary Creature — Human Villain","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Villain"],"oracleText":"Flying\nPower-up — {5}{U}{U}{U}: Put a +1/+1 counter on Kang. Take an extra turn after this one. During that turn, power-up abilities can't be activated. (Activate each power-up ability only once. Reduce the cost by his mana cost if he entered this turn.)","power":"4","toughness":"5","colors":["U"],"colorIdentity":["U"],"keywords":["Flying","Power-up"],"imageUrl":"https://cards.scryfall.io/normal/front/7/9/79747b45-fd7b-4023-9a9c-4d9dab2429fe.jpg?1783902956","artUrl":"https://cards.scryfall.io/art_crop/front/7/9/79747b45-fd7b-4023-9a9c-4d9dab2429fe.jpg?1783902956","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const rhuk = (): CardDef => ({"oracleId":"06607cba-76ba-4145-a5b5-24d3428142ac","name":"Rhuk, Hexgold Nabber","manaCost":"{2}{R}","cmc":3,"typeLine":"Legendary Creature — Goblin Rebel","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Goblin","Rebel"],"oracleText":"Trample, haste\nWhenever an equipped creature you control other than Rhuk attacks or dies, you may attach all Equipment attached to that creature to Rhuk.","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":["Haste","Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/9/4/94655928-1f1c-4993-8139-c705be369134.jpg?1783917915","artUrl":"https://cards.scryfall.io/art_crop/front/9/4/94655928-1f1c-4993-8139-c705be369134.jpg?1783917915","commanderLegal":"legal","set":"one","releasedAt":"2023-02-10","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const kaho = (): CardDef => ({"oracleId":"395a7bd6-7c2d-448e-842c-ca53256d7008","name":"Kaho, Minamo Historian","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Legendary Creature — Human Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"When Kaho enters, search your library for up to three instant cards, exile them, then shuffle.\n{X}, {T}: You may cast a spell with mana value X from among cards exiled with Kaho without paying its mana cost.","power":"2","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/8/d85a5f54-9b79-4c3d-b983-021b4b01b122.jpg?1783944163","artUrl":"https://cards.scryfall.io/art_crop/front/d/8/d85a5f54-9b79-4c3d-b983-021b4b01b122.jpg?1783944163","commanderLegal":"legal","set":"sok","releasedAt":"2005-06-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const jeleva = (): CardDef => ({"oracleId":"a014f283-c531-415c-ac00-e6773ea5d64d","name":"Jeleva, Nephalia's Scourge","manaCost":"{1}{U}{B}{R}","cmc":4,"typeLine":"Legendary Creature — Vampire Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Vampire","Wizard"],"oracleText":"Flying\nWhen Jeleva enters, each player exiles the top X cards of their library, where X is the amount of mana spent to cast Jeleva.\nWhenever Jeleva attacks, you may cast an instant or sorcery spell from among cards exiled with Jeleva without paying its mana cost.","power":"1","toughness":"3","colors":["B","R","U"],"colorIdentity":["B","R","U"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/8/3/83f9aeb8-05ba-49d9-a834-62f42fcd295b.jpg?1783939650","artUrl":"https://cards.scryfall.io/art_crop/front/8/3/83f9aeb8-05ba-49d9-a834-62f42fcd295b.jpg?1783939650","commanderLegal":"legal","set":"c13","releasedAt":"2013-11-01","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const raphael = (): CardDef => ({"oracleId":"eaf194a7-d95f-4738-9052-92ad00443a76","name":"Raphael, Most Attitude","manaCost":"{3}{R}","cmc":4,"typeLine":"Legendary Creature — Mutant Ninja Turtle","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Mutant","Ninja","Turtle"],"oracleText":"Menace (This creature can't be blocked except by two or more creatures.)\nAlliance — Whenever another creature you control enters, you may exile the top card of your library.\nWhenever Raphael attacks, until end of turn, you may play a card exiled with Raphael.","power":"4","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":["Alliance","Menace"],"imageUrl":"https://cards.scryfall.io/normal/front/8/8/88385a87-f931-409f-8a21-250f0866d63d.jpg?1783904093","artUrl":"https://cards.scryfall.io/art_crop/front/8/8/88385a87-f931-409f-8a21-250f0866d63d.jpg?1783904093","commanderLegal":"legal","set":"tmt","releasedAt":"2026-03-06","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const soulJar = (): CardDef => ({"oracleId":"5d451958-25f3-4e70-8be2-c832f60f39e9","name":"Serpent's Soul-Jar","manaCost":"{2}{B}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"Whenever an Elf you control dies, exile it.\n{T}, Pay 2 life: Until end of turn, you may cast a creature spell from among cards exiled with this artifact.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/8/08ae371f-ce62-475f-89a2-1f8a17cf950f.jpg?1783928336","artUrl":"https://cards.scryfall.io/art_crop/front/0/8/08ae371f-ce62-475f-89a2-1f8a17cf950f.jpg?1783928336","commanderLegal":"legal","set":"khc","releasedAt":"2021-02-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bonesplitter = (): CardDef => ({"oracleId":"452e3f5f-ce17-4682-966b-5cc100210aee","name":"Bonesplitter","manaCost":"{1}","cmc":1,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +2/+0.\nEquip {1}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980","artUrl":"https://cards.scryfall.io/art_crop/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980","commanderLegal":"legal","set":"pal03","releasedAt":"2003-01-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const opt = (): CardDef => ({"oracleId":"713332c1-5bd8-400f-bfff-c1ca0697a043","name":"Opt","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","artUrl":"https://cards.scryfall.io/art_crop/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","commanderLegal":"legal","set":"sld","releasedAt":"2025-07-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const llanowar = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const brawler = (): CardDef => ({"oracleId":"a1a791be-71e6-4c1f-8717-08ca62d40de2","name":"Brave Brawler","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Human Warrior Hero","supertypes":[],"types":["Creature"],"subtypes":["Human","Warrior","Hero"],"oracleText":"Lifelink\nPower-up — {4}{W}: Put two +1/+1 counters on this creature. (Activate each power-up ability only once. Reduce the cost by its mana cost if it entered this turn.)","power":"2","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":["Power-up","Lifelink"],"imageUrl":"https://cards.scryfall.io/normal/front/2/2/2242b5c3-42ef-4be0-a61f-65c93e56fcab.jpg?1783902978","artUrl":"https://cards.scryfall.io/art_crop/front/2/2/2242b5c3-42ef-4be0-a61f-65c93e56fcab.jpg?1783902978","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const forager = (): CardDef => ({"oracleId":"a3f3a5b5-b931-4961-828c-501a33e5a0a0","name":"Ethereal Forager","manaCost":"{4}{U}{U}","cmc":6,"typeLine":"Creature — Elemental Whale","supertypes":[],"types":["Creature"],"subtypes":["Elemental","Whale"],"oracleText":"Delve (Each card you exile from your graveyard while casting this spell pays for {1}.)\nFlying\nWhenever this creature attacks, you may return an instant or sorcery card exiled with this creature to its owner's hand.","power":"3","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Flying","Delve"],"imageUrl":"https://cards.scryfall.io/normal/front/9/7/97543d69-547e-41f8-9a4f-908e5eb0ee4a.jpg?1783931220","artUrl":"https://cards.scryfall.io/art_crop/front/9/7/97543d69-547e-41f8-9a4f-908e5eb0ee4a.jpg?1783931220","commanderLegal":"legal","set":"c20","releasedAt":"2020-04-17","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const triarch = (): CardDef => ({"oracleId":"1b3ae9c3-1940-4fb8-a47c-2d9e1790f4a3","name":"Triarch Stalker","manaCost":"{3}{B}{B}","cmc":5,"typeLine":"Artifact Creature — Necron","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Necron"],"oracleText":"Targeting Relay — At the beginning of combat on your turn, choose an opponent.\nCreatures attacking the last chosen player have menace.","power":"4","toughness":"5","colors":["B"],"colorIdentity":["B"],"keywords":["Targeting Relay"],"imageUrl":"https://cards.scryfall.io/normal/front/f/b/fbe75aae-727b-4cb0-967c-477d5a08b8f7.jpg?1783920898","artUrl":"https://cards.scryfall.io/art_crop/front/f/b/fbe75aae-727b-4cb0-967c-477d5a08b8f7.jpg?1783920898","commanderLegal":"legal","set":"40k","releasedAt":"2022-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const wisp = (): CardDef => ({"oracleId":"d39df714-bd0b-4de8-b9df-55713bab7f35","name":"Beckoning Will-o'-Wisp","manaCost":"{2}{W}","cmc":3,"typeLine":"Creature — Spirit","supertypes":[],"types":["Creature"],"subtypes":["Spirit"],"oracleText":"Flying\nLure the Unwary — At the beginning of combat on your turn, choose an opponent.\nCreatures attacking the last chosen player get +1/+0.","power":"1","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Lure the Unwary"],"imageUrl":"https://cards.scryfall.io/normal/front/d/c/dc02d647-b95b-4442-a924-64a4c94a4e8d.jpg?1783922818","artUrl":"https://cards.scryfall.io/art_crop/front/d/c/dc02d647-b95b-4442-a924-64a4c94a4e8d.jpg?1783922818","commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const grizzly = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const kayla = (): CardDef => ({"oracleId":"8110f15d-82db-4299-a959-09c22475daec","name":"Kayla's Music Box","manaCost":"{2}","cmc":2,"typeLine":"Legendary Artifact","supertypes":["Legendary"],"types":["Artifact"],"subtypes":[],"oracleText":"{W}, {T}: Look at the top card of your library, then exile it face down. (You may look at it any time.)\n{T}: Until end of turn, you may play cards you own exiled with Kayla's Music Box.","colors":[],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/0/c0e9819f-6bda-4fd3-8d61-3746e1e67418.jpg?1783919719","artUrl":"https://cards.scryfall.io/art_crop/front/c/0/c0e9819f-6bda-4fd3-8d61-3746e1e67418.jpg?1783919719","commanderLegal":"legal","set":"brc","releasedAt":"2022-11-18","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const pact = (): CardDef => ({"oracleId":"3df11e5c-19aa-441c-a889-6b40eb3fdabf","name":"Xander's Pact","manaCost":"{4}{B}{B}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Casualty 2 (As you cast this spell, you may sacrifice a creature with power 2 or greater. When you do, copy this spell.)\nEach opponent exiles the top card of their library. You may cast spells from among those cards this turn. If you cast a spell this way, pay life equal to that spell's mana value rather than pay its mana cost.","colors":["B"],"colorIdentity":["B"],"keywords":["Casualty"],"imageUrl":"https://cards.scryfall.io/normal/front/2/1/2154df0d-9d35-4a67-aeff-c9f224b969a2.jpg?1783923364","artUrl":"https://cards.scryfall.io/art_crop/front/2/1/2154df0d-9d35-4a67-aeff-c9f224b969a2.jpg?1783923364","commanderLegal":"legal","set":"ncc","releasedAt":"2022-04-29","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const circu = (): CardDef => ({"oracleId":"c87d547b-00a4-4fdd-ade4-f3f032e5ea3b","name":"Circu, Dimir Lobotomist","manaCost":"{2}{U}{B}","cmc":4,"typeLine":"Legendary Creature — Human Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"Whenever you cast a blue spell, exile the top card of target player's library.\nWhenever you cast a black spell, exile the top card of target player's library.\nYour opponents can't cast spells with the same name as a card exiled with Circu.","power":"2","toughness":"3","colors":["B","U"],"colorIdentity":["B","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/b/0b19c0f3-68a5-4544-985a-677aa2c2b50b.jpg?1783943626","artUrl":"https://cards.scryfall.io/art_crop/front/0/b/0b19c0f3-68a5-4544-985a-677aa2c2b50b.jpg?1783943626","commanderLegal":"legal","set":"rav","releasedAt":"2005-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

describe("Lane B round 70", () => {
  it("Kang the Conqueror: an extra turn in which no power-up ability can be activated, Kang's or another's (CR 702.193)", () => {
    const { s: s0, ap } = setup([]);
    supported(kang());
    const k = ready(s0, putOnBattlefield(s0, ap, kang()));
    s0.objects[k]!.enteredTurn = -1;
    const b = putOnBattlefield(s0, ap, brawler());
    s0.objects[b]!.enteredTurn = -1;
    poolOnly(s0, ap, { U: 3, C: 5 });
    let s = run(s0, planActivate(s0, ap, k, 0));
    s = settle(s);
    expect(s.objects[k]!.counters["+1/+1"]).toBe(1);
    const turn = s.turn;
    s = goUntil(s, (st) => st.turn > turn && st.step === "main1");
    expect(s.activePlayer).toBe(ap);
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, W: 1, C: 4 };
    expect(abilityProblem(s, ap, b, 0)).toMatch(/power-up abilities can't be activated/);
    // The turn after it, they can be again.
    s = goUntil(s, (st) => st.activePlayer !== ap);
    s = goUntil(s, (st) => st.activePlayer === ap && st.step === "main1");
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, W: 1, C: 4 };
    expect(abilityProblem(s, ap, b, 0)).toBeNull();
  });

  it("Rhuk, Hexgold Nabber: an equipped creature attacks, its Equipment may move to Rhuk", () => {
    const { s: s0, ap, opp } = setup([]);
    supported(rhuk());
    const r = putOnBattlefield(s0, ap, rhuk());
    const g = ready(s0, putOnBattlefield(s0, ap, llanowar()));
    const e1 = putOnBattlefield(s0, ap, bonesplitter());
    const e2 = putOnBattlefield(s0, ap, bonesplitter());
    s0.objects[e1]!.attachedTo = g;
    s0.objects[e2]!.attachedTo = g;
    invalidateCharacteristics(s0);
    let s = attack(s0, ap, [g], opp);
    expect(s.pending?.kind === "chooseMay" || s.stack.length > 0 || s.triggerQueue.length > 0).toBe(true);
    s = settle(s, { may: true });
    // All of them, not some (rulings).
    expect(s.objects[e1]!.attachedTo).toBe(r);
    expect(s.objects[e2]!.attachedTo).toBe(r);
    // Declined: they stay.
    let t = attack(s0, ap, [g], opp);
    t = settle(t, { may: false });
    expect(t.objects[e1]!.attachedTo).toBe(g);
  });

  it("Rhuk: an equipped creature dies, the Equipment that was attached to it may move to Rhuk; Rhuk itself doesn't count", () => {
    const { s: s0, ap } = setup([]);
    const r = putOnBattlefield(s0, ap, rhuk());
    const g = putOnBattlefield(s0, ap, llanowar());
    const e1 = putOnBattlefield(s0, ap, bonesplitter());
    s0.objects[e1]!.attachedTo = g;
    const sh = toZone(s0, ap, shock(), "hand");
    invalidateCharacteristics(s0);
    let s = castNow(s0, ap, sh, [tgt(g)]);
    s = settle(s, { may: true });
    expect(zone(s, g)).toBe("graveyard");
    expect(s.objects[e1]!.attachedTo).toBe(r);
    // Rhuk equipped and dying: "other than Rhuk", no trigger, the Equipment stays unattached.
    const sh2 = toZone(s, ap, shock(), "hand");
    s = castNow(s, ap, sh2, [tgt(r)]);
    s = settle(s, { may: true });
    expect(zone(s, r)).toBe("graveyard");
    expect(s.objects[e1]!.attachedTo).toBeUndefined();
  });

  it("Kaho, Minamo Historian: casts an exiled instant with mana value X, only one its enters ability exiled (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    supported(kaho());
    const sh = toZone(s0, ap, shock(), "library");
    const o = toZone(s0, ap, opt(), "library");
    const other = toZone(s0, ap, shock(), "exile");
    const k0 = toZone(s0, ap, kaho(), "hand");
    poolOnly(s0, ap, { U: 4 });
    let s = castNow(s0, ap, k0, []);
    s = settle(s, { me: ap });
    for (let i = 0; i < 10 && s.pending?.kind !== "searchLibrary"; i++) s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }), { me: ap });
    expect(s.pending?.kind).toBe("searchLibrary");
    s = act(s, { type: "searchLibrary", player: ap, found: [sh, o] });
    s = settle(s);
    expect(zone(s, sh)).toBe("exile");
    expect(zone(s, o)).toBe("exile");
    const k = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Kaho, Minamo Historian")!;
    ready(s, k);
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, C: 2 };
    // X = 1: one of the two, which is chosen; the Shock exiled some other way isn't offered.
    let t = run(s, planActivate(s, ap, k, 0, [], undefined, undefined, 1));
    t = settle(t, { me: ap });
    for (let i = 0; i < 10 && t.pending?.kind !== "chooseOption"; i++) t = settle(act(t, { type: "passPriority", player: waitingOn(t)! }), { me: ap });
    expect(t.pending?.kind).toBe("chooseOption");
    const p = t.pending as Extract<GameState["pending"], { kind: "chooseOption" }>;
    expect(p.options).toEqual(expect.arrayContaining([sh, o]));
    expect(p.options).not.toContain(other);
    t = act(t, { type: "chooseOption", player: ap, choice: sh });
    expect(t.pending?.kind).toBe("castFree");
    t = run(t, planCast(t, ap, sh, [ply(opp)]));
    t = settle(t);
    expect(life(t, opp)).toBe(40 - 2);
    expect(zone(t, o)).toBe("exile");
    // X = 2: neither has that mana value, nothing to cast.
    let u = run(s, planActivate(s, ap, k, 0, [], undefined, undefined, 2));
    u = settle(u, { me: ap });
    for (let i = 0; i < 10 && (u.stack.length || u.pending); i++) u = settle(act(u, { type: "passPriority", player: waitingOn(u)! }), { me: ap });
    expect(u.pending).toBeNull();
    expect(zone(u, sh)).toBe("exile");
    expect(zone(u, o)).toBe("exile");
  });

  it("Jeleva, Nephalia's Scourge: each player exiles X cards for the mana spent; attacking, casts an instant or sorcery among them free", () => {
    const { s: s0, ap, opp } = setup([]);
    supported(jeleva());
    const d = toZone(s0, opp, divination(), "library");
    const j0 = toZone(s0, ap, jeleva(), "hand");
    poolOnly(s0, ap, { U: 1, B: 1, R: 1, C: 1 });
    let s = castNow(s0, ap, j0, []);
    s = settle(s);
    expect(zone(s, d)).toBe("exile");
    for (const pid of s.turnOrder) expect(s.players[pid]!.exile.length).toBeGreaterThanOrEqual(4);
    const j = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Jeleva, Nephalia's Scourge")!;
    ready(s, j);
    const hand = s.players[ap]!.hand.length;
    s = attack(s, ap, [j], opp);
    s = settle(s, { me: ap });
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseOption"; i++) s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }), { me: ap });
    const p = s.pending as Extract<GameState["pending"], { kind: "chooseOption" }>;
    expect(p.kind).toBe("chooseOption");
    // Only the instant or sorcery cards (the rest are Forests and Grizzly Bears).
    expect(p.options.filter((x) => x !== "none")).toEqual([d]);
    s = act(s, { type: "chooseOption", player: ap, choice: d });
    s = run(s, planCast(s, ap, d, []));
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(zone(s, d)).toBe("graveyard");
    expect(s.players[opp]!.graveyard).toContain(d);
  });

  it("Raphael, Most Attitude: alliance exiles the top card; attacking, one card exiled with it may be played this turn, paying for it", () => {
    const { s: s0, ap, opp } = setup([]);
    supported(raphael());
    const r = ready(s0, putOnBattlefield(s0, ap, raphael()));
    const sh1 = toZone(s0, ap, shock(), "library");
    const g = toZone(s0, ap, llanowar(), "hand");
    poolOnly(s0, ap, { G: 1 });
    let s = castNow(s0, ap, g, []);
    s = settle(s, { may: true });
    expect(zone(s, sh1)).toBe("exile");
    const sh2 = toZone(s, ap, shock(), "library");
    const g2 = toZone(s, ap, llanowar(), "hand");
    s.players[ap]!.manaPool.G = 1;
    s = castNow(s, ap, g2, []);
    s = settle(s, { may: true });
    expect(zone(s, sh2)).toBe("exile");
    // Not before it attacks.
    expect(mayPlayFromExile(s, s.objects[sh1]!, ap)).toBe(false);
    s = attack(s, ap, [r], opp);
    s = settle(s);
    expect(mayPlayFromExile(s, s.objects[sh1]!, ap)).toBe(true);
    s.players[ap]!.manaPool.R = 2;
    // Paid for as usual.
    s = castNow(s, ap, sh1, [ply(opp)]);
    s = settle(s);
    expect(life(s, opp)).toBe(40 - 2);
    // One card: the other can't be now.
    expect(mayPlayFromExile(s, s.objects[sh2]!, ap)).toBe(false);
    expect(planCast(s, ap, sh2, [ply(opp)])).toBeNull();
    // Nor in a later turn.
    s = goUntil(s, (st) => st.activePlayer !== ap);
    expect(mayPlayFromExile(s, s.objects[sh2]!, ap)).toBe(false);
  });

  it("Serpent's Soul-Jar: an Elf you control that dies is exiled; {T}, pay 2 life: cast a creature spell from among them this turn", () => {
    const { s: s0, ap } = setup([]);
    supported(soulJar());
    const jar = putOnBattlefield(s0, ap, soulJar());
    const g = putOnBattlefield(s0, ap, llanowar());
    const sh = toZone(s0, ap, shock(), "hand");
    let s = castNow(s0, ap, sh, [tgt(g)]);
    s = settle(s);
    expect(zone(s, g)).toBe("exile");
    expect(mayPlayFromExile(s, s.objects[g]!, ap)).toBe(false);
    const before = life(s, ap);
    s = run(s, planActivate(s, ap, jar, 0));
    s = settle(s);
    expect(life(s, ap)).toBe(before - 2);
    expect(mayPlayFromExile(s, s.objects[g]!, ap)).toBe(true);
    s.players[ap]!.manaPool.G = 1;
    s = castNow(s, ap, g, []);
    s = settle(s);
    expect(zone(s, g)).toBe("battlefield");
    expect(controllerOf(s, s.objects[g]!)).toBe(ap);
  });
  it("Ethereal Forager: the cards its delve exiled are exiled with it; attacking, one instant or sorcery among them may return to the hand (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    supported(forager());
    const o = toZone(s0, ap, opt(), "graveyard");
    const sh = toZone(s0, ap, shock(), "graveyard");
    const g = toZone(s0, ap, grizzly(), "graveyard");
    const elsewhere = toZone(s0, ap, opt(), "exile");
    const f0 = toZone(s0, ap, forager(), "hand");
    poolOnly(s0, ap, { U: 2, C: 1 });
    let s = castNow(s0, ap, f0, [], { delve: [o, sh, g] });
    s = settle(s);
    expect([o, sh, g].map((id) => zone(s, id))).toEqual(["exile", "exile", "exile"]);
    const f = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Ethereal Forager")!;
    ready(s, f);
    s = attack(s, ap, [f], opp);
    s = settle(s, { may: true, me: ap });
    for (let i = 0; i < 10 && s.pending?.kind !== "searchLibrary"; i++) s = settle(act(s, s.pending?.kind === "chooseMay" ? { type: "chooseMay", player: ap, yes: true } : { type: "passPriority", player: waitingOn(s)! }), { me: ap });
    const p = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    expect(p.kind).toBe("searchLibrary");
    // Not the creature card, nor an Opt exiled some other way.
    expect([...(p.cards ?? [])].sort()).toEqual([o, sh].sort());
    expect(p.cards).not.toContain(elsewhere);
    s = act(s, { type: "searchLibrary", player: ap, found: [o] });
    s = settle(s);
    expect(zone(s, o)).toBe("hand");
    expect(zone(s, sh)).toBe("exile");
    expect(zone(s, g)).toBe("exile");
  });

  it("Triarch Stalker and Beckoning Will-o'-Wisp: creatures attacking the opponent chosen last at the beginning of combat have menace or get +1/+0", () => {
    const { s: s0, ap, opp } = setup([]);
    supported(triarch(), wisp());
    const other = s0.turnOrder.find((x) => x !== ap && x !== opp)!;
    putOnBattlefield(s0, ap, triarch());
    putOnBattlefield(s0, ap, wisp());
    const a = ready(s0, putOnBattlefield(s0, ap, grizzly()));
    const b = ready(s0, putOnBattlefield(s0, ap, grizzly()));
    // Nobody chosen yet: nothing.
    let s = goUntil(s0, (st) => st.pending?.kind === "chooseOption" && st.activePlayer === ap);
    for (let i = 0; i < 2 && s.pending?.kind === "chooseOption"; i++) {
      s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
      s = settle(s, { me: ap });
    }
    s = attack(s, ap, [a, b], opp);
    expect(s.objects[a]!.attacking).toBe(opp);
    // Re-declared at another player: only the one attacking the chosen player.
    let t = goUntil(s0, (st) => st.pending?.kind === "chooseOption" && st.activePlayer === ap);
    for (let i = 0; i < 2 && t.pending?.kind === "chooseOption"; i++) {
      t = act(t, { type: "chooseOption", player: ap, choice: String(opp) });
      t = settle(t, { me: ap });
    }
    t = goUntil(t, (st) => st.pending?.kind === "declareAttackers" && st.activePlayer === ap);
    t = act(t, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }, { attacker: b, defender: other }] });
    expect(characteristics(t, t.objects[a]!).keywords).toContain("Menace");
    expect(characteristics(t, t.objects[b]!).keywords).not.toContain("Menace");
    expect(characteristics(t, t.objects[a]!).power).toBe(3);
    expect(characteristics(t, t.objects[b]!).power).toBe(2);
    expect(characteristics(s0, s0.objects[a]!).keywords).not.toContain("Menace");
  });
  it("Kayla's Music Box: exiles the top card face down, seen by its owner only; {T}: until end of turn, play the cards you own exiled with it", () => {
    const { s: s0, ap, opp } = setup([]);
    supported(kayla());
    const box = putOnBattlefield(s0, ap, kayla());
    const sh = toZone(s0, ap, shock(), "library");
    s0.players[ap]!.manaPool.W = 1;
    let s = run(s0, planActivate(s0, ap, box, 0));
    s = settle(s);
    expect(zone(s, sh)).toBe("exile");
    expect(s.objects[sh]!.hiddenExile?.seen).toEqual([ap]);
    expect(mayPlayFromExile(s, s.objects[sh]!, ap)).toBe(false);
    s.objects[box]!.tapped = false;
    s = run(s, planActivate(s, ap, box, 1));
    s = settle(s);
    expect(mayPlayFromExile(s, s.objects[sh]!, ap)).toBe(true);
    expect(mayPlayFromExile(s, s.objects[sh]!, opp)).toBe(false);
    s.players[ap]!.manaPool.R = 1;
    s = castNow(s, ap, sh, [ply(opp)]);
    s = settle(s);
    expect(life(s, opp)).toBe(40 - 2);
    // A card exiled with it later this turn: the grant covers it too, until the turn ends.
    const land = toZone(s, ap, grizzly(), "library");
    s.objects[box]!.tapped = false;
    s.players[ap]!.manaPool.W = 1;
    s = run(s, planActivate(s, ap, box, 0));
    s = settle(s);
    expect(mayPlayFromExile(s, s.objects[land]!, ap)).toBe(true);
    s = goUntil(s, (st) => st.activePlayer !== ap);
    expect(mayPlayFromExile(s, s.objects[land]!, ap)).toBe(false);
  });
  it("Xander's Pact: each opponent exiles their top card; this turn you may cast spells among them, paying life equal to the mana value", () => {
    const { s: s0, ap, opp } = setup([]);
    supported(pact());
    const others = s0.turnOrder.filter((x) => x !== ap && x !== opp);
    const d = toZone(s0, opp, divination(), "library");
    const sh = toZone(s0, others[0]!, shock(), "library");
    const land = toZone(s0, others[1]!, forest, "library");
    const x = toZone(s0, ap, pact(), "hand");
    poolOnly(s0, ap, { B: 2, C: 4 });
    let s = castNow(s0, ap, x, []);
    s = settle(s);
    expect([d, sh, land].map((id) => zone(s, id))).toEqual(["exile", "exile", "exile"]);
    // Not your own library.
    expect(s.players[ap]!.exile.filter((id) => s.objects[id]!.mayPlay?.player === ap).length).toBe(0);
    // Spells only: not the land.
    expect(mayPlayFromExile(s, s.objects[land]!, ap)).toBe(false);
    const before = life(s, ap);
    const hand = s.players[ap]!.hand.length;
    s = castNow(s, ap, d, [], { alt: "citadel" });
    s = settle(s);
    expect(life(s, ap)).toBe(before - 3);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    // Any number of them.
    s = castNow(s, ap, sh, [ply(opp)], { alt: "citadel" });
    s = settle(s);
    expect(life(s, ap)).toBe(before - 4);
    expect(life(s, opp)).toBe(40 - 2);
  });
  it("Circu, Dimir Lobotomist: a blue spell exiles the top card of target player's library; opponents can't cast spells with those names", () => {
    const { s: s0, ap, opp } = setup([]);
    supported(circu());
    putOnBattlefield(s0, ap, circu());
    const theirs = toZone(s0, opp, shock(), "library");
    const o = toZone(s0, ap, opt(), "hand");
    const mine = toZone(s0, ap, shock(), "hand");
    const oppShock = toZone(s0, opp, shock(), "hand");
    let s = castNow(s0, ap, o, []);
    // The bot's choice of target for the trigger: an opponent, not itself.
    s = settle(s, { me: ap });
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets"; i++) s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }), { me: ap });
    expect(s.pending?.kind).toBe("chooseTargets");
    const bot = botActions(s, ap).find((a) => a.type === "chooseTargets");
    expect(bot?.type === "chooseTargets" && bot.targets[0]?.kind === "player" && bot.targets[0].id !== ap).toBe(true);
    s = act(s, { type: "chooseTargets", player: ap, targets: [ply(opp)] });
    s = settle(s);
    expect(zone(s, theirs)).toBe("exile");
    s.players[opp]!.manaPool.R = 1;
    expect(castProblem(s, opp, oppShock)).toMatch(/can't cast spells named Shock/);
    // Its controller still can.
    s.players[ap]!.manaPool.R = 1;
    expect(planCast(s, ap, mine, [ply(opp)])).not.toBeNull();
    // Once that card leaves exile, the name is free again.
    s.players[opp]!.exile.splice(s.players[opp]!.exile.indexOf(theirs), 1);
    s.objects[theirs]!.zone = "graveyard";
    s.players[opp]!.graveyard.push(theirs);
    expect(castProblem(s, opp, oppShock) ?? "").not.toMatch(/can't cast spells named/);
  });
});
