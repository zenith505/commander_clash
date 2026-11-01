// Lane B, round 71: unsupported cards from the bottom of the popularity list (`npm run popular -- --least`): searches of
// your graveyard, hand and/or library for cards by name (CR 701.23), and "whenever an opponent shuffles their library"
// (CR 701.24).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";
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
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
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
const shuffles = (s: GameState, pid: PlayerId) => s.players[pid]!.shuffles ?? 0;

// Real oracle text (Scryfall).
const supplicant = (): CardDef => ({"oracleId":"dc7929cb-50a9-4662-a106-c415fc03a1a9","name":"Dark Supplicant","manaCost":"{B}","cmc":1,"typeLine":"Creature — Human Cleric","supertypes":[],"types":["Creature"],"subtypes":["Human","Cleric"],"oracleText":"{T}, Sacrifice three Clerics: Search your graveyard, hand, and/or library for a card named Scion of Darkness and put it onto the battlefield. If you search your library this way, shuffle.","power":"1","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/b/eb685932-5df5-4f26-9633-b1daa8925359.jpg?1783944916","artUrl":"https://cards.scryfall.io/art_crop/front/e/b/eb685932-5df5-4f26-9633-b1daa8925359.jpg?1783944916","commanderLegal":"legal","set":"lgn","releasedAt":"2003-02-03","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const scion = (): CardDef => ({"oracleId":"bd940cab-d23a-44bf-ab96-8aa1dcd3f0ff","name":"Scion of Darkness","manaCost":"{5}{B}{B}{B}","cmc":8,"typeLine":"Creature — Avatar","supertypes":[],"types":["Creature"],"subtypes":["Avatar"],"oracleText":"Trample\nWhenever this creature deals combat damage to a player, you may put target creature card from that player's graveyard onto the battlefield under your control.\nCycling {3} ({3}, Discard this card: Draw a card.)","power":"6","toughness":"6","colors":["B"],"colorIdentity":["B"],"keywords":["Trample","Cycling"],"imageUrl":"https://cards.scryfall.io/normal/front/4/9/497c2629-1263-48a4-9c31-7f052808b2b8.jpg?1783944912","artUrl":"https://cards.scryfall.io/art_crop/front/4/9/497c2629-1263-48a4-9c31-7f052808b2b8.jpg?1783944912","commanderLegal":"legal","set":"lgn","releasedAt":"2003-02-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const gate = (): CardDef => ({"oracleId":"5a682ec5-78e6-4238-b5c2-e94b7a8f8066","name":"Gate to the Afterlife","manaCost":"{3}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"Whenever a nontoken creature you control dies, you gain 1 life. Then you may draw a card. If you do, discard a card.\n{2}, {T}, Sacrifice this artifact: Search your graveyard, hand, and/or library for a card named God-Pharaoh's Gift and put it onto the battlefield. If you search your library this way, shuffle. Activate only if there are six or more creature cards in your graveyard.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/b/8b544a59-86b9-447d-b54d-b94a262b6866.jpg?1783936453","artUrl":"https://cards.scryfall.io/art_crop/front/8/b/8b544a59-86b9-447d-b54d-b94a262b6866.jpg?1783936453","commanderLegal":"legal","set":"akh","releasedAt":"2017-04-28","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const gift = (): CardDef => ({"oracleId":"9f2d2fda-f098-4375-8fe9-63f929e3928c","name":"God-Pharaoh's Gift","manaCost":"{7}","cmc":7,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"At the beginning of combat on your turn, you may exile a creature card from your graveyard. If you do, create a token that's a copy of that card, except it's a 4/4 black Zombie. It gains haste until end of turn.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/2/b2e85a9e-4c37-4721-b7ea-de3413ec39df.jpg?1783936002","artUrl":"https://cards.scryfall.io/art_crop/front/b/2/b2e85a9e-4c37-4721-b7ea-de3413ec39df.jpg?1783936002","commanderLegal":"legal","set":"hou","releasedAt":"2017-07-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const outfitter = (): CardDef => ({"oracleId":"23b2de61-a29c-4a32-b38c-408c723727ce","name":"Agency Outfitter","manaCost":"{4}{U}{U}","cmc":6,"typeLine":"Creature — Sphinx Detective","supertypes":[],"types":["Creature"],"subtypes":["Sphinx","Detective"],"oracleText":"Flying\nWhen this creature enters, you may search your graveyard, hand and/or library for a card named Magnifying Glass and/or a card named Thinking Cap and put them onto the battlefield. If you search your library this way, shuffle.","power":"4","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/8/1/8112f133-535e-4264-8357-9cbf97957710.jpg?1783912917","artUrl":"https://cards.scryfall.io/art_crop/front/8/1/8112f133-535e-4264-8357-9cbf97957710.jpg?1783912917","commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const glass = (): CardDef => ({"oracleId":"f2ce9e55-07c0-4f36-a59e-127693fc0f62","name":"Magnifying Glass","manaCost":"{3}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{4}, {T}: Investigate. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")","colors":[],"colorIdentity":[],"keywords":["Investigate"],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/c/6/c606a71f-8fb0-486b-955f-727ebf436946.jpg?1783912827","artUrl":"https://cards.scryfall.io/art_crop/front/c/6/c606a71f-8fb0-486b-955f-727ebf436946.jpg?1783912827","commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const cap = (): CardDef => ({"oracleId":"a54fb3de-0581-461e-be33-dc4f4d16a33e","name":"Thinking Cap","manaCost":"{1}","cmc":1,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +1/+2.\nEquip Detective {1}\nEquip {3} ({3}: Attach to target creature you control. Equip only as a sorcery.)","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/6/d/6d2565e1-dd7b-462b-8270-a17913277793.jpg?1783912825","artUrl":"https://cards.scryfall.io/art_crop/front/6/d/6d2565e1-dd7b-462b-8270-a17913277793.jpg?1783912825","commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const spinner = (): CardDef => ({"oracleId":"8fea91ee-5849-4c46-8198-fd383d9a55e8","name":"Arachnus Spinner","manaCost":"{5}{G}","cmc":6,"typeLine":"Creature — Spider","supertypes":[],"types":["Creature"],"subtypes":["Spider"],"oracleText":"Reach\nTap an untapped Spider you control: Search your graveyard and/or library for a card named Arachnus Web and put it onto the battlefield attached to target creature. If you search your library this way, shuffle.","power":"5","toughness":"7","colors":["G"],"colorIdentity":["G"],"keywords":["Reach"],"imageUrl":"https://cards.scryfall.io/normal/front/2/3/23321b80-d7e7-48fd-985d-1e9dc3adcd35.jpg?1783941063","artUrl":"https://cards.scryfall.io/art_crop/front/2/3/23321b80-d7e7-48fd-985d-1e9dc3adcd35.jpg?1783941063","commanderLegal":"legal","set":"m12","releasedAt":"2011-07-15","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const web = (): CardDef => ({"oracleId":"8b25f353-0798-4a03-a928-6a701a919468","name":"Arachnus Web","manaCost":"{2}{G}","cmc":3,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block, and its activated abilities can't be activated.\nAt the beginning of the end step, if enchanted creature's power is 4 or greater, destroy this Aura.","colors":["G"],"colorIdentity":["G"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/9/e/9e4900b0-f934-42d9-92fb-0bb16d2e8bb1.jpg?1783941063","artUrl":"https://cards.scryfall.io/art_crop/front/9/e/9e4900b0-f934-42d9-92fb-0bb16d2e8bb1.jpg?1783941063","commanderLegal":"legal","set":"m12","releasedAt":"2011-07-15","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const journey = (): CardDef => ({"oracleId":"e87606d5-5a23-4507-aece-8fdd044e7185","name":"Journey for the Elixir","manaCost":"{2}{G}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Search your library and graveyard for a basic land card and a card named Jiang Yanggu, reveal them, put them into your hand, then shuffle.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/d/3da5b115-84b5-4eb3-bbef-e5024601ebc8.jpg?1783934623","artUrl":"https://cards.scryfall.io/art_crop/front/3/d/3da5b115-84b5-4eb3-bbef-e5024601ebc8.jpg?1783934623","commanderLegal":"legal","set":"gs1","releasedAt":"2018-06-22","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const jiang = (): CardDef => ({"oracleId":"b15c8f43-685d-4901-9cad-47bc6dc6346f","name":"Jiang Yanggu","manaCost":"{4}{G}","cmc":5,"typeLine":"Legendary Planeswalker — Yanggu","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Yanggu"],"oracleText":"+1: Target creature gets +2/+2 until end of turn.\n−1: If you don't control a creature named Mowu, create Mowu, a legendary 3/3 green Dog creature token.\n−5: Until end of turn, target creature gains trample and gets +X/+X, where X is the number of lands you control.","loyalty":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/b/eb8dae9a-dac2-4b80-b546-852b989bd8c1.jpg?1783934627","artUrl":"https://cards.scryfall.io/art_crop/front/e/b/eb8dae9a-dac2-4b80-b546-852b989bd8c1.jpg?1783934627","commanderLegal":"legal","set":"gs1","releasedAt":"2018-06-22","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const encouragement = (): CardDef => ({"oracleId":"55e897e9-5c70-4e32-8f24-3e0fefa319cd","name":"Nissa's Encouragement","manaCost":"{4}{G}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Search your library and graveyard for a card named Forest, a card named Brambleweft Behemoth, and a card named Nissa, Genesis Mage. Reveal those cards, put them into your hand, then shuffle.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/4/a489d5c7-ef57-4973-86ac-06234c308c3c.jpg?1783935985","artUrl":"https://cards.scryfall.io/art_crop/front/a/4/a489d5c7-ef57-4973-86ac-06234c308c3c.jpg?1783935985","commanderLegal":"legal","set":"hou","releasedAt":"2017-07-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const behemoth = (): CardDef => ({"oracleId":"f5070528-cc4c-4910-8047-1ed17efd6496","name":"Brambleweft Behemoth","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Creature — Elemental","supertypes":[],"types":["Creature"],"subtypes":["Elemental"],"oracleText":"Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)","power":"6","toughness":"6","colors":["G"],"colorIdentity":["G"],"keywords":["Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/1/c/1c759e94-e437-4dda-af0f-6578c0a50619.jpg?1783935986","artUrl":"https://cards.scryfall.io/art_crop/front/1/c/1c759e94-e437-4dda-af0f-6578c0a50619.jpg?1783935986","commanderLegal":"legal","set":"hou","releasedAt":"2017-07-14","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const nissa = (): CardDef => ({"oracleId":"ac905661-37c4-495a-ac76-96032c23a144","name":"Nissa, Genesis Mage","manaCost":"{5}{G}{G}","cmc":7,"typeLine":"Legendary Planeswalker — Nissa","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Nissa"],"oracleText":"+2: Untap up to two target creatures and up to two target lands.\n−3: Target creature gets +5/+5 until end of turn.\n−10: Look at the top ten cards of your library. You may put any number of creature and/or land cards from among them onto the battlefield. Put the rest on the bottom of your library in a random order.","loyalty":"5","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/9/2923c85a-4022-4cda-bcbb-bb000137f64f.jpg?1783935987","artUrl":"https://cards.scryfall.io/art_crop/front/2/9/2923c85a-4022-4cda-bcbb-bb000137f64f.jpg?1783935987","commanderLegal":"legal","set":"hou","releasedAt":"2017-07-14","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const trickster = (): CardDef => ({"oracleId":"372633d9-ac74-4630-a1ae-a1906bb2aed0","name":"Cosi's Trickster","manaCost":"{U}","cmc":1,"typeLine":"Creature — Merfolk Wizard","supertypes":[],"types":["Creature"],"subtypes":["Merfolk","Wizard"],"oracleText":"Whenever an opponent shuffles their library, you may put a +1/+1 counter on this creature.","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/1/e1eb7372-481a-44a6-937d-21430ee02ff9.jpg?1783942165","artUrl":"https://cards.scryfall.io/art_crop/front/e/1/e1eb7372-481a-44a6-937d-21430ee02ff9.jpg?1783942165","commanderLegal":"legal","set":"zen","releasedAt":"2009-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const surgery = (): CardDef => ({"oracleId":"e5128230-3535-4f77-8b97-20d0791e7b1d","name":"Psychic Surgery","manaCost":"{1}{U}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever an opponent shuffles their library, you may look at the top two cards of that library. You may exile one of those cards. Then put the rest on top of that library in any order.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/1/51ea9a6d-d6ca-48cb-adac-958ad0e7440c.jpg?1783941319","artUrl":"https://cards.scryfall.io/art_crop/front/5/1/51ea9a6d-d6ca-48cb-adac-958ad0e7440c.jpg?1783941319","commanderLegal":"legal","set":"nph","releasedAt":"2011-05-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const gsz = (): CardDef => ({"oracleId":"0d96b60b-a060-48ee-bb83-93f1c4a10669","name":"Green Sun's Zenith","manaCost":"{X}{G}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Search your library for a green creature card with mana value X or less, put it onto the battlefield, then shuffle. Shuffle Green Sun's Zenith into its owner's library.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/2/02335747-54e3-4827-ae19-4e362863da9b.jpg?1783941375","artUrl":"https://cards.scryfall.io/art_crop/front/0/2/02335747-54e3-4827-ae19-4e362863da9b.jpg?1783941375","commanderLegal":"legal","set":"mbs","releasedAt":"2011-02-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const forager = (): CardDef => ({"oracleId":"cef9e0d3-5e28-4c5f-88fc-0d78af5a4db1","name":"Boggart Forager","manaCost":"{R}","cmc":1,"typeLine":"Creature — Goblin Rogue","supertypes":[],"types":["Creature"],"subtypes":["Goblin","Rogue"],"oracleText":"{R}, Sacrifice this creature: Target player shuffles their library.","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/b/fbc26374-d8de-4740-b1ec-ac92cfedbebc.jpg?1783942881","artUrl":"https://cards.scryfall.io/art_crop/front/f/b/fbc26374-d8de-4740-b1ec-ac92cfedbebc.jpg?1783942881","commanderLegal":"legal","set":"lrw","releasedAt":"2007-10-12","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const grizzly = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const cleric = (): CardDef => ({"oracleId":"84a2a592-0e31-434f-b3b4-f2013d86f29d","name":"Cleric of the Forward Order","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Human Cleric","supertypes":[],"types":["Creature"],"subtypes":["Human","Cleric"],"oracleText":"When this creature enters, you gain 2 life for each creature you control named Cleric of the Forward Order.","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/f/cfcea783-e9f0-4d44-ac74-5aee9a07aa69.jpg?1783938363","artUrl":"https://cards.scryfall.io/art_crop/front/c/f/cfcea783-e9f0-4d44-ac74-5aee9a07aa69.jpg?1783938363","commanderLegal":"legal","set":"ori","releasedAt":"2015-07-17","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const stomping = (): CardDef => ({"oracleId":"16052b52-ade1-406f-a06b-ce7ea607fb63","name":"Stomping Ground","manaCost":"","cmc":0,"typeLine":"Land — Mountain Forest","supertypes":[],"types":["Land"],"subtypes":["Mountain","Forest"],"oracleText":"({T}: Add {R} or {G}.)\nAs this land enters, you may pay 2 life. If you don't, it enters tapped.","colors":[],"colorIdentity":["G","R"],"keywords":[],"producedMana":["G","R"],"imageUrl":"https://cards.scryfall.io/normal/front/1/e/1ee8255a-44f6-4faa-9843-15432bf751ea.jpg?1784065855","artUrl":"https://cards.scryfall.io/art_crop/front/1/e/1ee8255a-44f6-4faa-9843-15432bf751ea.jpg?1784065855","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

describe("Lane B round 71", () => {
  it("Dark Supplicant: graveyard and hand only, no shuffle; or the library too (CR 701.23, rulings)", () => {
    const { s: s0, ap } = setup([]);
    supported(supplicant());
    const sup = putOnBattlefield(s0, ap, supplicant());
    const c1 = putOnBattlefield(s0, ap, cleric());
    const c2 = putOnBattlefield(s0, ap, cleric());
    const inHand = toZone(s0, ap, scion(), "hand");
    const before = shuffles(s0, ap);
    let s = run(s0, planActivate(s0, ap, sup, 0, [], undefined, undefined, undefined, { sacrifice: [sup, c1, c2] }));
    expect([zone(s, sup), zone(s, c1), zone(s, c2)]).toEqual(["graveyard", "graveyard", "graveyard"]);
    s = settle(s, { me: ap });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "searchZones", labels: ["Graveyard, hand, and library", "Graveyard and hand only"] });
    s = act(s, { type: "chooseOption", player: ap, choice: "graveyard" });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", cards: [inHand] });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [inHand] }));
    expect(zone(s, inHand)).toBe("battlefield");
    expect(shuffles(s, ap)).toBe(before);
  });

  it("Dark Supplicant: with none in the graveyard or hand, the library is searched and shuffled", () => {
    const { s: s0, ap } = setup([]);
    const sup = putOnBattlefield(s0, ap, supplicant());
    const c1 = putOnBattlefield(s0, ap, cleric());
    const c2 = putOnBattlefield(s0, ap, cleric());
    const inLib = toZone(s0, ap, scion(), "library");
    const before = shuffles(s0, ap);
    let s = run(s0, planActivate(s0, ap, sup, 0, [], undefined, undefined, undefined, { sacrifice: [sup, c1, c2] }));
    s = settle(s, { me: ap });
    if (s.pending?.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: ap, found: [inLib] });
    s = settle(s);
    expect(zone(s, inLib)).toBe("battlefield");
    expect(shuffles(s, ap)).toBe(before + 1);
  });

  it("Gate to the Afterlife: only with six creature cards in the graveyard; finds God-Pharaoh's Gift in the hand", () => {
    const { s: s0, ap } = setup([]);
    supported(gate());
    const g = putOnBattlefield(s0, ap, gate());
    const gift0 = toZone(s0, ap, gift(), "hand");
    for (let i = 0; i < 5; i++) toZone(s0, ap, grizzly(), "graveyard");
    s0.players[ap]!.manaPool = { ...s0.players[ap]!.manaPool, C: 2 };
    expect(abilityProblem(s0, ap, g, 0)).toMatch(/can.t be activated/);
    toZone(s0, ap, grizzly(), "graveyard");
    expect(abilityProblem(s0, ap, g, 0)).toBeNull();
    let s = run(s0, planActivate(s0, ap, g, 0));
    s = settle(s, { me: ap });
    s = act(s, { type: "chooseOption", player: ap, choice: "graveyard" });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [gift0] }));
    expect(zone(s, gift0)).toBe("battlefield");
  });

  it("Agency Outfitter: Magnifying Glass from the graveyard and Thinking Cap from the library, one of each name", () => {
    const { s: s0, ap } = setup([]);
    supported(outfitter());
    const o = toZone(s0, ap, outfitter(), "hand");
    const g1 = toZone(s0, ap, glass(), "graveyard");
    const g2 = toZone(s0, ap, glass(), "graveyard");
    const c = toZone(s0, ap, cap(), "library");
    poolOnly(s0, ap, { U: 2, C: 4 });
    const before = shuffles(s0, ap);
    let s = settle(castNow(s0, ap, o), { me: ap });
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "searchZones" });
    s = act(s, { type: "chooseOption", player: ap, choice: "both" });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", max: 2 });
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [g1, g2] })).toThrow();
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [g1, c] }));
    expect([zone(s, g1), zone(s, g2), zone(s, c)]).toEqual(["battlefield", "graveyard", "battlefield"]);
    expect(shuffles(s, ap)).toBe(before + 1);
  });

  it("Arachnus Spinner: tap a Spider, Arachnus Web from the graveyard enchanting the target creature", () => {
    const { s: s0, ap, opp } = setup([]);
    supported(spinner());
    const sp = putOnBattlefield(s0, ap, spinner());
    const foe = putOnBattlefield(s0, opp, grizzly());
    const w = toZone(s0, ap, web(), "graveyard");
    let s = run(s0, planActivate(s0, ap, sp, 0, [tgt(foe)], undefined, undefined, undefined, { tap: [sp] }));
    expect(s.objects[sp]!.tapped).toBe(true);
    s = settle(s, { me: ap });
    s = act(s, { type: "chooseOption", player: ap, choice: "graveyard" });
    if (s.pending?.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: ap, found: [w] });
    s = settle(s);
    expect(zone(s, w)).toBe("battlefield");
    expect(s.objects[w]!.attachedTo).toBe(foe);
  });

  it("Journey for the Elixir and Nissa's Encouragement: the library and graveyard together, up to one of each; a card named Forest only (rulings)", () => {
    const { s: s0, ap } = setup([]);
    supported(journey(), encouragement());
    const [j] = [toZone(s0, ap, journey(), "hand")];
    const yang = toZone(s0, ap, jiang(), "graveyard");
    poolOnly(s0, ap, { G: 1, C: 2 });
    let s = settle(castNow(s0, ap, j), { me: ap });
    expect(s.pending).toMatchObject({ kind: "searchLibrary" });
    const land = (s.pending as { cards: string[] }).cards.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest")!;
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [land, yang] }));
    expect([zone(s, land), zone(s, yang)]).toEqual(["hand", "hand"]);

    const { s: t0, ap: bp } = setup([]);
    const e = toZone(t0, bp, encouragement(), "hand");
    const beh = toZone(t0, bp, behemoth(), "library");
    const nis = toZone(t0, bp, nissa(), "graveyard");
    const thicket = toZone(t0, bp, stomping(), "library");
    poolOnly(t0, bp, { G: 1, C: 4 });
    let t = settle(castNow(t0, bp, e), { me: bp });
    const cards = (t.pending as { cards: string[] }).cards;
    expect(cards).toContain(beh);
    expect(cards).toContain(nis);
    expect(cards).not.toContain(thicket);
    t = settle(act(t, { type: "searchLibrary", player: bp, found: [beh, nis] }));
    expect([zone(t, beh), zone(t, nis)]).toEqual(["hand", "hand"]);
  });

  it("Cosi's Trickster: an opponent shuffling triggers it, an empty library too; its controller's own shuffle doesn't", () => {
    const { s: s0, ap, opp } = setup([]);
    supported(trickster());
    const tr = putOnBattlefield(s0, ap, trickster());
    const f1 = putOnBattlefield(s0, ap, forager());
    const f2 = putOnBattlefield(s0, ap, forager());
    poolOnly(s0, ap, { R: 2 });
    let s = settle(run(s0, planActivate(s0, ap, f1, 0, [ply(ap)])));
    expect(s.objects[tr]!.counters["+1/+1"] ?? 0).toBe(0);
    s.players[opp]!.library = [];
    s = settle(run(s, planActivate(s, ap, f2, 0, [ply(opp)])));
    expect(s.objects[tr]!.counters["+1/+1"]).toBe(1);
  });

  it("Cosi's Trickster: Green Sun's Zenith shuffles its caster's library twice, so it triggers twice (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const tr = putOnBattlefield(s0, opp, trickster());
    const z = toZone(s0, ap, gsz(), "hand");
    poolOnly(s0, ap, { G: 1 });
    const s = settle(castNow(s0, ap, z, [], {}, 0));
    expect(zone(s, z)).toBe("library");
    expect(s.objects[tr]!.counters["+1/+1"]).toBe(2);
  });

  it("Psychic Surgery: after an opponent shuffles, look at their top two, exile one, the other stays on top", () => {
    const { s: s0, ap, opp } = setup([]);
    supported(surgery());
    putOnBattlefield(s0, ap, surgery());
    const f = putOnBattlefield(s0, ap, forager());
    poolOnly(s0, ap, { R: 1 });
    let s = settle(run(s0, planActivate(s0, ap, f, 0, [ply(opp)])), { me: ap });
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 1 });
    const [a, b] = s.players[opp]!.library.slice(0, 2);
    s = act(s, { type: "searchLibrary", player: ap, found: [a!] });
    s = settle(s);
    expect(zone(s, a!)).toBe("exile");
    expect(s.players[opp]!.library[0]).toBe(b);
  });

  it("Psychic Surgery: none exiled, you put the two back in the order you choose", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, surgery());
    const f = putOnBattlefield(s0, ap, forager());
    poolOnly(s0, ap, { R: 1 });
    let s = settle(run(s0, planActivate(s0, ap, f, 0, [ply(opp)])), { me: ap });
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: ap, yes: true });
    const [a, b] = s.players[opp]!.library.slice(0, 2);
    s = act(s, { type: "searchLibrary", player: ap, found: [] });
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: ap, owner: opp });
    s = settle(act(s, { type: "arrangeTop", player: ap, top: [b!, a!], away: [] }));
    expect(s.players[opp]!.library.slice(0, 2)).toEqual([b, a]);
  });
});
