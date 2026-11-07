// Lane B round B128: the Wormfang cycle (Newt and Turtle exile a land you control, Crab an opponent's choice of your
// permanents, Drake a creature or it's sacrificed; each returns the exiled card when it leaves, CR 607.2a), Ertai's
// Familiar and Spatial Binding ("can't phase out" until your next upkeep; a "phases out or leaves the battlefield"
// trigger), Corpseweft (exile one or more creature cards as a cost, X twice that), Relive the Past (three "up to one"
// graveyard targets that become 5/5 Elementals), Cruel Calculations (cards put into a graveyard from a library this turn),
// Clay Champion and Bladecoil Serpent ("for each {G}{G} spent to cast it").

import { describe, expect, it } from "vitest";
import { act, forest, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type Step, type TargetChoice } from "../src";

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
/** A card of `def` put into `pid`'s graveyard, hand or library (on top). */
const putIn = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Taps every land `pid` controls and gives them exactly this mana, so what's spent is known. */
const onlyPool = (s: GameState, pid: PlayerId, mana: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  for (const id of s.battlefield) if (s.objects[id]!.controller === pid && characteristics(s, s.objects[id]!).types.includes("Land")) s.objects[id]!.tapped = true;
  s.players[pid]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...mana };
};
/** Empties `pid`'s hand into their library's bottom (so whole-turn tests have no cards to discard). */
const clearHand = (s: GameState, pid: PlayerId) => {
  for (const id of s.players[pid]!.hand.splice(0)) {
    s.objects[id]!.zone = "library";
    s.players[pid]!.library.push(id);
  }
};
const lands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && characteristics(s, s.objects[id]!).types.includes("Land"));

// Real oracle text (Scryfall).
const wormfangNewt = (): CardDef => ({"oracleId":"be014a79-5550-4f79-8789-b4d6783d7ec8","name":"Wormfang Newt","manaCost":"{1}{U}","cmc":2,"typeLine":"Creature — Nightmare Salamander Beast","supertypes":[],"types":["Creature"],"subtypes":["Nightmare","Salamander","Beast"],"oracleText":"When this creature enters, exile a land you control.\nWhen this creature leaves the battlefield, return the exiled card to the battlefield under its owner's control.","power":"2","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/f/df8012c1-76ec-4c36-8b38-5bc41ce5e156.jpg?1783945125","artUrl":"https://cards.scryfall.io/art_crop/front/d/f/df8012c1-76ec-4c36-8b38-5bc41ce5e156.jpg?1783945125","commanderLegal":"legal","set":"jud","releasedAt":"2002-05-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const wormfangTurtle = (): CardDef => ({"oracleId":"771f9ba4-6c65-4497-ad48-869994435556","name":"Wormfang Turtle","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Nightmare Turtle Beast","supertypes":[],"types":["Creature"],"subtypes":["Nightmare","Turtle","Beast"],"oracleText":"When this creature enters, exile a land you control.\nWhen this creature leaves the battlefield, return the exiled card to the battlefield under its owner's control.","power":"2","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/8/48404362-7579-4896-a71a-8eb40e5ac416.jpg?1783945125","artUrl":"https://cards.scryfall.io/art_crop/front/4/8/48404362-7579-4896-a71a-8eb40e5ac416.jpg?1783945125","commanderLegal":"legal","set":"jud","releasedAt":"2002-05-27","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const wormfangCrab = (): CardDef => ({"oracleId":"4216f9ce-bdd9-4213-8c3f-e2ef4cd848f9","name":"Wormfang Crab","manaCost":"{3}{U}","cmc":4,"typeLine":"Creature — Nightmare Crab","supertypes":[],"types":["Creature"],"subtypes":["Nightmare","Crab"],"oracleText":"This creature can't be blocked.\nWhen this creature enters, an opponent chooses a permanent you control other than this creature and exiles it.\nWhen this creature leaves the battlefield, return the exiled card to the battlefield under its owner's control.","power":"3","toughness":"6","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/c/dcf56dcf-ec1a-4298-8644-1fe248443b7e.jpg?1783945125","artUrl":"https://cards.scryfall.io/art_crop/front/d/c/dcf56dcf-ec1a-4298-8644-1fe248443b7e.jpg?1783945125","commanderLegal":"legal","set":"jud","releasedAt":"2002-05-27","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const wormfangDrake = (): CardDef => ({"oracleId":"d37c4e77-5023-4d13-9cfe-a43f513364bf","name":"Wormfang Drake","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Nightmare Drake","supertypes":[],"types":["Creature"],"subtypes":["Nightmare","Drake"],"oracleText":"Flying\nWhen this creature enters, sacrifice it unless you exile a creature you control other than this creature.\nWhen this creature leaves the battlefield, return the exiled card to the battlefield under its owner's control.","power":"3","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/b/6/b6afd312-6448-4bd1-8539-0910cefead0d.jpg?1783945125","artUrl":"https://cards.scryfall.io/art_crop/front/b/6/b6afd312-6448-4bd1-8539-0910cefead0d.jpg?1783945125","commanderLegal":"legal","set":"jud","releasedAt":"2002-05-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const ertaisFamiliar = (): CardDef => ({"oracleId":"711cd80d-c58d-4c2a-87db-d2e4c75f60d3","name":"Ertai's Familiar","manaCost":"{1}{U}","cmc":2,"typeLine":"Creature — Illusion","supertypes":[],"types":["Creature"],"subtypes":["Illusion"],"oracleText":"Phasing (This phases in or out before you untap during each of your untap steps. While it's phased out, it's treated as though it doesn't exist.)\nWhen this creature phases out or leaves the battlefield, mill three cards.\n{U}: Until your next upkeep, this creature can't phase out.","power":"2","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":["Mill","Phasing"],"imageUrl":"https://cards.scryfall.io/normal/front/3/5/354c9de7-0cdf-4302-9d1a-ae17eca13053.jpg?1783946742","artUrl":"https://cards.scryfall.io/art_crop/front/3/5/354c9de7-0cdf-4302-9d1a-ae17eca13053.jpg?1783946742","commanderLegal":"legal","set":"wth","releasedAt":"1997-06-09","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const spatialBinding = (): CardDef => ({"oracleId":"52fc8217-5a14-40b5-a8fc-b6fc45af5f33","name":"Spatial Binding","manaCost":"{U}{B}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Pay 1 life: Until your next upkeep, target permanent can't phase out.","colors":["B","U"],"colorIdentity":["B","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/7/176d625f-1410-4ad6-a279-9a184fac6507.jpg?1783947047","artUrl":"https://cards.scryfall.io/art_crop/front/1/7/176d625f-1410-4ad6-a279-9a184fac6507.jpg?1783947047","commanderLegal":"legal","set":"mir","releasedAt":"1996-10-08","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const corpseweft = (): CardDef => ({"oracleId":"9ffb5615-124e-4848-9e0d-120851bd50e5","name":"Corpseweft","manaCost":"{2}{B}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"{1}{B}, Exile one or more creature cards from your graveyard: Create a tapped X/X black Zombie Horror creature token, where X is twice the number of cards exiled this way.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/5/25cf24e7-2e6e-46e0-aedd-89e17953811c.jpg?1783938599","artUrl":"https://cards.scryfall.io/art_crop/front/2/5/25cf24e7-2e6e-46e0-aedd-89e17953811c.jpg?1783938599","commanderLegal":"legal","set":"dtk","releasedAt":"2015-03-27","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const relivethePast = (): CardDef => ({"oracleId":"dcc51bcb-a61e-471f-8a01-7fcbc069fcba","name":"Relive the Past","manaCost":"{5}{G}{W}","cmc":7,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Return up to one target artifact card, up to one target land card, and up to one target non-Aura enchantment card from your graveyard to the battlefield. They are 5/5 Elemental creatures in addition to their other types.","colors":["G","W"],"colorIdentity":["G","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/0/20948cd2-e40c-4648-832f-ab0f1cc21610.jpg?1783912839","artUrl":"https://cards.scryfall.io/art_crop/front/2/0/20948cd2-e40c-4648-832f-ab0f1cc21610.jpg?1783912839","commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const cruelCalculations = (): CardDef => ({"oracleId":"69b96fe5-9733-4b43-bd66-075742e142d9","name":"Cruel Calculations","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw X cards, where X is the number of cards that were put into target player's graveyard from their library this turn.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/7/f76c4d8e-3e1f-4264-99af-1b8adb9a06be.jpg?1789127482","artUrl":"https://cards.scryfall.io/art_crop/front/f/7/f76c4d8e-3e1f-4264-99af-1b8adb9a06be.jpg?1789127482","commanderLegal":"legal","set":"fra","releasedAt":"2026-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const clayChampion = (): CardDef => ({"oracleId":"80920ac0-2bbe-4439-a937-282f63e23141","name":"Clay Champion","manaCost":"{X}{4}","cmc":4,"typeLine":"Artifact Creature — Construct","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Construct"],"oracleText":"This creature enters with three +1/+1 counters on it for each {G}{G} spent to cast it.\nWhen this creature enters, choose up to two other target creatures you control. For each {W}{W} spent to cast this creature, put a +1/+1 counter on each of them.","power":"2","toughness":"2","colors":[],"colorIdentity":["G","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/2/625f3b20-4b9a-4f61-8afe-31a761711b43.jpg?1783920020","artUrl":"https://cards.scryfall.io/art_crop/front/6/2/625f3b20-4b9a-4f61-8afe-31a761711b43.jpg?1783920020","commanderLegal":"legal","set":"bro","releasedAt":"2022-11-18","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const bladecoilSerpent = (): CardDef => ({"oracleId":"e469bb22-57f1-4555-b3c0-9ea108e6cc12","name":"Bladecoil Serpent","manaCost":"{X}{6}","cmc":6,"typeLine":"Artifact Creature — Serpent","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Serpent"],"oracleText":"When this creature enters, for each {U}{U} spent to cast it, draw a card.\nWhen this creature enters, for each {B}{B} spent to cast it, each opponent discards a card.\nWhen this creature enters, for each {R}{R} spent to cast it, it gets +1/+0 and gains trample and haste until end of turn.","power":"5","toughness":"4","colors":[],"colorIdentity":["B","R","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/8/08c5a528-d16d-4cb9-b532-b85648c8395a.jpg?1783920022","artUrl":"https://cards.scryfall.io/art_crop/front/0/8/08c5a528-d16d-4cb9-b532-b85648c8395a.jpg?1783920022","commanderLegal":"legal","set":"bro","releasedAt":"2022-11-18","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const llanowarElves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const teferisProtection = (): CardDef => ({"oracleId":"0d4ecdb1-ec90-497f-a7a4-1c68092b8757","name":"Teferi's Protection","manaCost":"{2}{W}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Until your next turn, your life total can't change and you gain protection from everything. All permanents you control phase out. (While they're phased out, they're treated as though they don't exist. They phase in before you untap during your untap step.)\nExile Teferi's Protection.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/5/e59f4627-58ab-45c8-b31b-eaa52dad33fc.jpg?1783929085","artUrl":"https://cards.scryfall.io/art_crop/front/e/5/e59f4627-58ab-45c8-b31b-eaa52dad33fc.jpg?1783929085","commanderLegal":"legal","set":"sld","releasedAt":"2020-11-06","rarity":"rare","layout":"normal","gameChanger":true}) as CardDef;
const oblivionRing = (): CardDef => ({"oracleId":"bd9b9772-f5f9-4c6b-913e-7193bea5d0a7","name":"Oblivion Ring","manaCost":"{2}{W}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, exile another target nonland permanent.\nWhen this enchantment leaves the battlefield, return the exiled card to the battlefield under its owner's control.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/9/895c270d-84d8-4c7f-9df3-5a595e113dd7.jpg?1783942580","artUrl":"https://cards.scryfall.io/art_crop/front/8/9/895c270d-84d8-4c7f-9df3-5a595e113dd7.jpg?1783942580","commanderLegal":"legal","set":"ala","releasedAt":"2008-10-03","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const pacifism = (): CardDef => ({"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const mesaPegasus = (): CardDef => ({"oracleId":"8161f5b8-6aab-4133-ba2c-2e7b5774153e","name":"Mesa Pegasus","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Pegasus","supertypes":[],"types":["Creature"],"subtypes":["Pegasus"],"oracleText":"Flying; banding (Any creatures with banding, and up to one without, can attack in a band. Bands are blocked as a group. If any creatures with banding you control are blocking or being blocked by a creature, you divide that creature's combat damage, not its controller, among any of the creatures it's being blocked by or is blocking.)","power":"1","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Banding"],"imageUrl":"https://cards.scryfall.io/normal/front/e/a/eaac88da-d19e-4771-944c-3709963d04e7.jpg?1783948712","artUrl":"https://cards.scryfall.io/art_crop/front/e/a/eaac88da-d19e-4771-944c-3709963d04e7.jpg?1783948712","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const mindRot = (): CardDef => ({"oracleId":"ad44cf74-b717-48fb-9fa2-77512024d76a","name":"Mind Rot","manaCost":"{2}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target player discards two cards.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/3/3317ff1a-9104-44e6-acb9-5ee09648138f.jpg?1783937202","artUrl":"https://cards.scryfall.io/art_crop/front/3/3/3317ff1a-9104-44e6-acb9-5ee09648138f.jpg?1783937202","commanderLegal":"legal","set":"kld","releasedAt":"2016-09-30","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const glimpsetheUnthinkable = (): CardDef => ({"oracleId":"552f0163-a19d-4671-888f-044fc0354875","name":"Glimpse the Unthinkable","manaCost":"{U}{B}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target player mills ten cards.","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/6/5/65d6f1ff-7514-4fed-80e9-fd912e21bd26.jpg?1783921762","artUrl":"https://cards.scryfall.io/art_crop/front/6/5/65d6f1ff-7514-4fed-80e9-fd912e21bd26.jpg?1783921762","commanderLegal":"legal","set":"2x2","releasedAt":"2022-07-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const darksteelCitadel = (): CardDef => ({"oracleId":"8dc067bf-f78f-4ac4-b6e7-b305c42cf0bc","name":"Darksteel Citadel","manaCost":"","cmc":0,"typeLine":"Artifact Land","supertypes":[],"types":["Artifact","Land"],"subtypes":[],"oracleText":"Indestructible\n{T}: Add {C}.","colors":[],"colorIdentity":[],"keywords":["Indestructible"],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/c/d/cdfafa38-e7db-4a42-99b8-fc65ab41c572.jpg?1783925163","artUrl":"https://cards.scryfall.io/art_crop/front/c/d/cdfafa38-e7db-4a42-99b8-fc65ab41c572.jpg?1783925163","commanderLegal":"legal","set":"sld","releasedAt":"2021-10-15","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const unsummon = (): CardDef => ({"oracleId":"837182db-1bf3-4a2c-bd01-1af9d9873561","name":"Unsummon","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Return target creature to its owner's hand.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddad9f16-52d5-49de-82b0-b1a5294a9c44.jpg?1789556722","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddad9f16-52d5-49de-82b0-b1a5294a9c44.jpg?1789556722","commanderLegal":"legal","set":"fra","releasedAt":"2026-10-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

describe("Wormfang Newt, Turtle, Crab and Drake: an exile as it enters, returned when it leaves", () => {
  it("compile", () => supported(wormfangNewt(), wormfangTurtle(), wormfangCrab(), wormfangDrake()));

  it("Wormfang Newt: you exile a land you control as it enters; it comes back when the Newt leaves", () => {
    const { s: s0, ap, ids } = setup([wormfangNewt(), unsummon()]);
    const before = lands(s0, ap);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: [ap] });
    expect(s.pending?.kind).toBe("pickPermanents");
    if (s.pending?.kind !== "pickPermanents") return;
    // Only lands you control.
    expect([...s.pending.options].sort()).toEqual([...before].sort());
    const land = before.find((id) => !s.objects[id]!.tapped)!;
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [land] }));
    expect(s.objects[land]!.zone).toBe("exile");
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(ids[0]!)])));
    expect(s.objects[ids[0]!]!.zone).toBe("hand");
    expect(s.objects[land]!.zone).toBe("battlefield");
    expect(s.objects[land]!.controller).toBe(ap);
  });

  it("Wormfang Turtle: gone before its enters ability resolves, the land it then exiles stays exiled", () => {
    const { s: s0, ap, ids } = setup([wormfangTurtle(), unsummon()]);
    const before = lands(s0, ap);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    // Resolve the creature spell, leaving its enters trigger on the stack.
    for (let i = 0; i < 20 && s.objects[ids[0]!]!.zone !== "battlefield"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.stack.length).toBe(1);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(ids[0]!)])), { me: [ap] });
    expect(s.objects[ids[0]!]!.zone).toBe("hand");
    // The enters ability still exiles a land of yours.
    if (s.pending?.kind === "pickPermanents") s = settle(act(s, { type: "pickPermanents", player: ap, ids: [s.pending.options[0]!] }));
    const gone = before.filter((id) => s.objects[id]!.zone === "exile");
    expect(gone.length).toBe(1);
    s = goTo(s, "main2", ap);
    expect(s.objects[gone[0]!]!.zone).toBe("exile");
  });

  it("Wormfang Crab: an opponent chooses one of your other permanents and exiles it; it returns when the Crab leaves", () => {
    const { s: s0, ap, ids, opp } = setup([wormfangCrab(), unsummon()]);
    const ring = putOnBattlefield(s0, ap, solRing());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: [ap] });
    // You choose the opponent, who then chooses (a bot).
    expect(s.pending?.kind).toBe("chooseOption");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: String(opp) }), { me: [ap] });
    expect(s.pending).toBeFalsy();
    const exiled = s.players[ap]!.exile.filter((id) => s.objects[id]!.zone === "exile");
    expect(exiled.length).toBe(1);
    expect(exiled[0]).not.toBe(ids[0]);
    expect(s.objects[exiled[0]!]!.owner).toBe(ap);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(ids[0]!)])));
    expect(s.objects[exiled[0]!]!.zone).toBe("battlefield");
    expect(s.objects[exiled[0]!]!.controller).toBe(ap);
    expect(s.objects[ring]!.zone).toBe("battlefield");
  });

  it("Wormfang Drake: exile another creature you control to keep it; the creature returns when the Drake leaves", () => {
    const { s: s0, ap, ids } = setup([wormfangDrake(), unsummon()]);
    const bears = putOnBattlefield(s0, ap, grizzlyBears());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: [ap] });
    expect(s.pending?.player).toBe(ap);
    s = settle(run(s, botActions(s, ap)), { me: [ap] });
    if (s.pending?.kind === "pickPermanents") s = settle(act(s, { type: "pickPermanents", player: ap, ids: [bears] }));
    expect(s.objects[bears]!.zone).toBe("exile");
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(ids[0]!)])));
    expect(s.objects[bears]!.zone).toBe("battlefield");
  });

  it("Wormfang Drake: with no other creature it's sacrificed", () => {
    const { s: s0, ap, ids } = setup([wormfangDrake()]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });
});

describe("Ertai's Familiar and Spatial Binding: can't phase out until your next upkeep", () => {
  it("compile", () => supported(ertaisFamiliar(), spatialBinding()));

  it("Ertai's Familiar: phasing out at your untap step mills three cards; with {U} paid it doesn't phase out", () => {
    const { s: s0, ap } = setup([]);
    const fam = putOnBattlefield(s0, ap, ertaisFamiliar());
    clearHand(s0, ap);
    for (let i = 0; i < 6; i++) putIn(s0, ap, forest, "library");
    const yard = s0.players[ap]!.graveyard.length;
    // Its controller's next untap step: it phases out, and that mills three.
    let s = goTo(s0, "upkeep", ap);
    s = settle(s);
    expect(s.objects[fam]!.zone).toBe("phasedOut");
    expect(s.players[ap]!.graveyard.length).toBe(yard + 3);
    // It phases in at the next one; then {U}: it stays through the untap step after that.
    s = goTo(s, "main1", ap);
    s = goTo(s, "upkeep", ap);
    s = goTo(s, "main1", ap);
    expect(s.objects[fam]!.zone).toBe("battlefield");
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, U: 1 };
    s = settle(run(s, planActivate(s, ap, fam, 0)));
    const yard2 = s.players[ap]!.graveyard.length;
    s = goTo(s, "upkeep", ap);
    s = settle(s);
    expect(s.objects[fam]!.zone).toBe("battlefield");
    expect(s.players[ap]!.graveyard.length).toBe(yard2);
    // Over now (it lasted until this upkeep): the next untap step phases it out.
    s = goTo(s, "main1", ap);
    s = goTo(s, "upkeep", ap);
    s = settle(s);
    expect(s.objects[fam]!.zone).toBe("phasedOut");
  });

  it("Ertai's Familiar: leaving the battlefield mills three cards too", () => {
    const { s: s0, ap, ids } = setup([unsummon()]);
    const fam = putOnBattlefield(s0, ap, ertaisFamiliar());
    for (let i = 0; i < 4; i++) putIn(s0, ap, forest, "library");
    const yard = s0.players[ap]!.graveyard.length;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(fam)])));
    expect(s.objects[fam]!.zone).toBe("hand");
    // Unsummon itself and the three milled cards.
    expect(s.players[ap]!.graveyard.length).toBe(yard + 4);
  });

  it("Spatial Binding: the bound permanent stays when Teferi's Protection phases out everything else; a bound Aura stays behind and goes to the graveyard", () => {
    const { s: s0, ap, ids } = setup([teferisProtection()]);
    const sb = putOnBattlefield(s0, ap, spatialBinding());
    const bears = putOnBattlefield(s0, ap, grizzlyBears());
    const elves = putOnBattlefield(s0, ap, llanowarElves());
    const aura = putOnBattlefield(s0, ap, pacifism());
    s0.objects[aura]!.attachedTo = elves;
    invalidateCharacteristics(s0);
    const life = s0.players[ap]!.life;
    let s = settle(run(s0, planActivate(s0, ap, sb, 0, [tgt(bears)])));
    s = settle(run(s, planActivate(s, ap, sb, 0, [tgt(aura)])));
    expect(s.players[ap]!.life).toBe(life - 2);
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(s.objects[bears]!.zone).toBe("battlefield");
    expect(s.objects[elves]!.zone).toBe("phasedOut");
    expect(s.objects[sb]!.zone).toBe("phasedOut");
    // The Aura didn't phase out with its creature, so it's attached to nothing and goes (CR 704.5m).
    expect(s.objects[aura]!.zone).toBe("graveyard");
  });
});

describe("Corpseweft: exile one or more creature cards, a tapped Zombie Horror twice that big", () => {
  it("compile", () => supported(corpseweft()));

  it("two creature cards exiled: a tapped 4/4 black Zombie Horror; noncreature cards can't be chosen, and none at all can't", () => {
    const { s: s0, ap } = setup([]);
    const cw = putOnBattlefield(s0, ap, corpseweft());
    const a = putIn(s0, ap, grizzlyBears(), "graveyard");
    const b = putIn(s0, ap, llanowarElves(), "graveyard");
    const ring = putIn(s0, ap, solRing(), "graveyard");
    // Nothing exiled (X 0) isn't allowed, nor a noncreature card.
    expect(planActivate(s0, ap, cw, 0, [], undefined, undefined, 0, { exileCards: [] })).toBeNull();
    expect(planActivate(s0, ap, cw, 0, [], undefined, undefined, 1, { exileCards: [ring] })).toBeNull();
    const before = new Set(s0.battlefield);
    const s = settle(run(s0, planActivate(s0, ap, cw, 0, [], undefined, undefined, 2, { exileCards: [a, b] })));
    expect(s.objects[a]!.zone).toBe("exile");
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.objects[ring]!.zone).toBe("graveyard");
    const tok = s.battlefield.filter((id) => !before.has(id));
    expect(tok.length).toBe(1);
    const ch = characteristics(s, s.objects[tok[0]!]!);
    expect(ch.subtypes).toEqual(["Zombie", "Horror"]);
    expect(ch.colors).toEqual(["B"]);
    expect(ptOf(s, tok[0]!)).toBe("4/4");
    expect(s.objects[tok[0]!]!.tapped).toBe(true);
  });
});

describe("Relive the Past: an artifact, a land and a non-Aura enchantment back as 5/5 Elementals", () => {
  it("compile", () => supported(relivethePast()));

  it("each returned permanent is a 5/5 Elemental creature in addition to its other types; an Aura can't be targeted", () => {
    const { s: s0, ap, ids } = setup([relivethePast()]);
    const ring = putIn(s0, ap, solRing(), "graveyard");
    const land = putIn(s0, ap, darksteelCitadel(), "graveyard");
    const sb = putIn(s0, ap, spatialBinding(), "graveyard");
    const aura = putIn(s0, ap, pacifism(), "graveyard");
    expect(planCast(s0, ap, ids[0]!, [tgt(ring), tgt(land), tgt(aura)])).toBeNull();
    // The same card for two of them isn't offered.
    expect(planCast(s0, ap, ids[0]!, [tgt(land), tgt(land), tgt(sb)])).toBeNull();
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(ring), tgt(land), tgt(sb)])));
    for (const id of [ring, land, sb]) {
      expect(s.objects[id]!.zone).toBe("battlefield");
      const ch = characteristics(s, s.objects[id]!);
      expect(ch.types).toContain("Creature");
      expect(ch.subtypes).toContain("Elemental");
      expect(ptOf(s, id)).toBe("5/5");
    }
    expect(characteristics(s, s.objects[land]!).types).toEqual(expect.arrayContaining(["Artifact", "Land", "Creature"]));
  });

  it("up to one each: only a land", () => {
    const { s: s0, ap, ids } = setup([relivethePast()]);
    const land = putIn(s0, ap, darksteelCitadel(), "graveyard");
    const none: TargetChoice = { kind: "none" } as TargetChoice;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [none, tgt(land), none])));
    expect(s.objects[land]!.zone).toBe("battlefield");
    expect(ptOf(s, land)).toBe("5/5");
  });
});

describe("Cruel Calculations: cards put into the target player's graveyard from their library this turn", () => {
  it("compile", () => supported(cruelCalculations()));

  it("ten milled from the target's library: draw ten; cards discarded or from another library don't count", () => {
    const { s: s0, ap, ids, opp } = setup([glimpsetheUnthinkable(), cruelCalculations(), mindRot()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [plr(opp)])));
    expect(s.players[opp]!.graveyard.length).toBe(10);
    // Mind Rot on the same player: discards aren't from the library.
    s = settle(run(s, planCast(s, ap, ids[2]!, [plr(opp)])));
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, ids[1]!, [plr(opp)])));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 10);
    // Another player, whose library lost nothing to a graveyard: nothing.
    const { s: t0, ap: ap2, ids: ids2 } = setup([glimpsetheUnthinkable(), cruelCalculations()]);
    const opp2 = t0.turnOrder[(t0.turnOrder.indexOf(ap2) + 1) % 4]!;
    const third2 = t0.turnOrder[(t0.turnOrder.indexOf(ap2) + 2) % 4]!;
    let t = settle(run(t0, planCast(t0, ap2, ids2[0]!, [plr(opp2)])));
    const hand2 = t.players[ap2]!.hand.length;
    t = settle(run(t, planCast(t, ap2, ids2[1]!, [plr(third2)])));
    expect(t.players[ap2]!.hand.length).toBe(hand2 - 1);
  });
});

describe("Clay Champion and Bladecoil Serpent: for each pair of one color spent to cast it", () => {
  it("compile", () => supported(clayChampion(), bladecoilSerpent()));

  it("Clay Champion with {G}{G}{G}{G}{W}{W} spent (X 2): six +1/+1 counters, and one on each of two other creatures", () => {
    const { s: s0, ap, ids } = setup([clayChampion()]);
    const bears = putOnBattlefield(s0, ap, grizzlyBears());
    const elves = putOnBattlefield(s0, ap, llanowarElves());
    onlyPool(s0, ap, { G: 4, W: 2 });
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 2));
    s = settle(s, { me: [ap] });
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(bears), tgt(elves)] } as Action));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(6);
    expect(ptOf(s, ids[0]!)).toBe("8/8");
    expect(ptOf(s, bears)).toBe("3/3");
    expect(ptOf(s, elves)).toBe("2/2");
  });

  it("Clay Champion with three {G} (X 1): one pair, three counters; no {W}{W}, none on the others", () => {
    const { s: s0, ap, ids } = setup([clayChampion()]);
    const bears = putOnBattlefield(s0, ap, grizzlyBears());
    onlyPool(s0, ap, { G: 3, W: 1, C: 1 });
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 1));
    s = settle(s, { me: [ap] });
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(bears), { kind: "none" } as TargetChoice] } as Action));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(3);
    expect(ptOf(s, bears)).toBe("2/2");
  });

  it("Bladecoil Serpent with {U}{U}{U}{U}{B}{B}{R}{R} spent (X 2): draw two, each opponent discards one, +1/+0, trample and haste", () => {
    const { s: s0, ap, ids } = setup([bladecoilSerpent()]);
    onlyPool(s0, ap, { U: 4, B: 2, R: 2 });
    const opps = s0.turnOrder.filter((p) => p !== ap);
    const oppHands = opps.map((p) => s0.players[p]!.hand.length);
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 2)));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
    opps.forEach((p, i) => expect(s.players[p]!.hand.length).toBe(oppHands[i]! - 1));
    expect(ptOf(s, ids[0]!)).toBe("6/4");
    expect(characteristics(s, s.objects[ids[0]!]!).keywords).toEqual(expect.arrayContaining(["Trample", "Haste"]));
  });

  it("Bladecoil Serpent with one {R} and generic mana only: nothing", () => {
    const { s: s0, ap, ids } = setup([bladecoilSerpent()]);
    onlyPool(s0, ap, { U: 1, R: 1, C: 4 });
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 0)));
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    expect(ptOf(s, ids[0]!)).toBe("5/4");
    expect(characteristics(s, s.objects[ids[0]!]!).keywords).not.toContain("Haste");
  });
});
