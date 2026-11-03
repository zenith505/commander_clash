// Lane B, round 93: unsupported cards from the bottom of the popularity list (`npm run popular -- --least`). Cautery
// Sliver ("target player, planeswalker, or Sliver creature"), Time and Tide, Winter's Night, Freyalise's Winds, Remove
// Enchantments, Twist Allegiance, Sands of Time, Kudzu, Steam Vines, Aether Rift, Teferi's Realm, Juxtapose.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, isLegalTarget, objHasKeyword, planCast, tapPermanent, waitingOn, type Action, type CardDef, type GameState, type PendingDecision, type PlayerId, type TargetChoice } from "../src";
import { phaseOut } from "../src/phasing";

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
/** Passes priority until a question of this kind comes up. */
const toPending = (s: GameState, kind: PendingDecision["kind"], max = 300) => {
  for (let i = 0; i < max; i++) {
    if (s.pending?.kind === kind) return s;
    if (s.pending) throw new Error(`asked ${s.pending.kind} first`);
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  throw new Error(`never asked ${kind}`);
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = []) => run(s, planCast(s, pid, id, targets, undefined, "auto"));
/** Moves a new card for `def` into `pid`'s hand. */
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Empties `pid`'s hand (into exile). */
const emptyHand = (s: GameState, pid: PlayerId) => {
  for (const id of [...s.players[pid]!.hand]) {
    s.players[pid]!.hand.splice(s.players[pid]!.hand.indexOf(id), 1);
    s.objects[id]!.zone = "exile";
    s.players[pid]!.exile.push(id);
  }
  invalidateCharacteristics(s);
};
const landOf = (s: GameState, pid: PlayerId, name: string) => s.battlefield.find((id) => characteristics(s, s.objects[id]!).name === name && controllerOf(s, s.objects[id]!) === pid)!;
const pool = (s: GameState, pid: PlayerId) => Object.fromEntries(Object.entries(s.players[pid]!.manaPool).filter(([k, v]) => typeof v === "number" && v > 0 && k.length === 1));
const emptyPool = (s: GameState, pid: PlayerId) => {
  for (const k of ["W", "U", "B", "R", "G", "C"] as const) s.players[pid]!.manaPool[k] = 0;
};
const next = (s: GameState, ap: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % s.turnOrder.length]!;
/** Passes until `pid`'s upkeep has begun (not the current one). */
const toUpkeepOf = (s: GameState, pid: PlayerId) => {
  if (s.step === "upkeep" && s.activePlayer === pid) s = passUntil(s, "draw");
  return passUntil(s, "upkeep", pid);
};

const sliver = (): CardDef => ({"oracleId":"93a9423c-2b1b-41ce-80f4-157140c684ad","name":"Cautery Sliver","manaCost":"{R}{W}","cmc":2,"typeLine":"Creature — Sliver","supertypes":[],"types":["Creature"],"subtypes":["Sliver"],"oracleText":"All Slivers have \"{1}, Sacrifice this permanent: This permanent deals 1 damage to any target.\"\nAll Slivers have \"{1}, Sacrifice this permanent: Prevent the next 1 damage that would be dealt to target player, planeswalker, or Sliver creature this turn.\"","power":"2","toughness":"2","colors":["R","W"],"colorIdentity":["R","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/1/91da31d4-6616-4d61-82b7-52954162fe4d.jpg?1783943135","artUrl":"https://cards.scryfall.io/art_crop/front/9/1/91da31d4-6616-4d61-82b7-52954162fe4d.jpg?1783943135","commanderLegal":"legal","set":"plc","releasedAt":"2007-02-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const tide = (): CardDef => ({"oracleId":"b6fee94a-30b8-415e-8567-ad03ccb1d658","name":"Time and Tide","manaCost":"{U}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Simultaneously, all phased-out creatures phase in and all creatures with phasing phase out.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/5/152b348a-0301-4d45-a2c1-d78802c445ba.jpg?1783946997","artUrl":"https://cards.scryfall.io/art_crop/front/1/5/152b348a-0301-4d45-a2c1-d78802c445ba.jpg?1783946997","commanderLegal":"legal","set":"vis","releasedAt":"1997-02-03","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const winter = (): CardDef => ({"oracleId":"e4f73802-b639-47ab-a6c6-f761afa4e00e","name":"Winter's Night","manaCost":"{R}{G}{W}","cmc":3,"typeLine":"World Enchantment","supertypes":["World"],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a player taps a snow land for mana, that player adds one mana of any type that land produced. That land doesn't untap during its controller's next untap step.","colors":["G","R","W"],"colorIdentity":["G","R","W"],"keywords":[],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/7/f/7f020ebc-4950-4407-8cb8-7630cad226f6.jpg?1783947164","artUrl":"https://cards.scryfall.io/art_crop/front/7/f/7f020ebc-4950-4407-8cb8-7630cad226f6.jpg?1783947164","commanderLegal":"legal","set":"all","releasedAt":"1996-06-10","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const winds = (): CardDef => ({"oracleId":"ffeb792a-6df0-46c1-badc-4deb857f7d48","name":"Freyalise's Winds","manaCost":"{2}{G}{G}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a permanent becomes tapped, put a wind counter on it.\nIf a permanent with a wind counter on it would untap during its controller's untap step, remove all wind counters from it instead.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/1/b11cd2e0-9419-4267-807e-5b73915c748a.jpg?1783947477","artUrl":"https://cards.scryfall.io/art_crop/front/b/1/b11cd2e0-9419-4267-807e-5b73915c748a.jpg?1783947477","commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const removeEnch = (): CardDef => ({"oracleId":"fa879d99-3d2b-4a9a-a17f-d5ac109f8f44","name":"Remove Enchantments","manaCost":"{W}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Return to your hand all enchantments you both own and control, all Auras you own attached to permanents you control, and all Auras you own attached to attacking creatures your opponents control. Then destroy all other enchantments you control, all other Auras attached to permanents you control, and all other Auras attached to attacking creatures your opponents control.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/f/bf2e3a8a-b386-474d-b8e9-4c2d56a2b742.jpg?1783948081","artUrl":"https://cards.scryfall.io/art_crop/front/b/f/bf2e3a8a-b386-474d-b8e9-4c2d56a2b742.jpg?1783948081","commanderLegal":"legal","set":"leg","releasedAt":"1994-06-01","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const twist = (): CardDef => ({"oracleId":"5b33f3f0-80d3-4ea2-b73b-74510c9f6071","name":"Twist Allegiance","manaCost":"{6}{R}","cmc":7,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"You and target opponent each gain control of all creatures the other controls until end of turn. Untap those creatures. Those creatures gain haste until end of turn.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24b6607c-0c34-4ffc-b1b7-154417492766.jpg?1783944187","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24b6607c-0c34-4ffc-b1b7-154417492766.jpg?1783944187","commanderLegal":"legal","set":"bok","releasedAt":"2005-02-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const sands = (): CardDef => ({"oracleId":"c8f69b48-a3b2-4324-852d-11fad19d6432","name":"Sands of Time","manaCost":"{4}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"Each player skips their untap step.\nAt the beginning of each player's upkeep, that player simultaneously untaps each tapped artifact, creature, and land they control and taps each untapped artifact, creature, and land they control.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/7/a782ee95-bde4-41f4-a947-b073cc4c1e7c.jpg?1783946972","artUrl":"https://cards.scryfall.io/art_crop/front/a/7/a782ee95-bde4-41f4-a947-b073cc4c1e7c.jpg?1783946972","commanderLegal":"legal","set":"vis","releasedAt":"1997-02-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const kudzu = (): CardDef => ({"oracleId":"51ca5965-ae39-4e51-8948-9a230a03f906","name":"Kudzu","manaCost":"{1}{G}{G}","cmc":3,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant land\nWhen enchanted land becomes tapped, destroy it. That land's controller may attach this Aura to a land of their choice.","colors":["G"],"colorIdentity":["G"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/b/2/b2b72dcd-9ea1-4729-baae-ecd262fdff67.jpg?1783948675","artUrl":"https://cards.scryfall.io/art_crop/front/b/2/b2b72dcd-9ea1-4729-baae-ecd262fdff67.jpg?1783948675","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const vines = (): CardDef => ({"oracleId":"1e687c04-b573-425d-b2d1-0e0cbe02bb52","name":"Steam Vines","manaCost":"{1}{R}{R}","cmc":3,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant land\nWhen enchanted land becomes tapped, destroy it and this Aura deals 1 damage to that land's controller. That player attaches this Aura to a land of their choice.","colors":["R"],"colorIdentity":["R"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/d/3/d3936053-b2ed-49b8-ab69-fe47a972cfe4.jpg?1783945223","artUrl":"https://cards.scryfall.io/art_crop/front/d/3/d3936053-b2ed-49b8-ab69-fe47a972cfe4.jpg?1783945223","commanderLegal":"legal","set":"ody","releasedAt":"2001-10-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const rift = (): CardDef => ({"oracleId":"2577ef8e-d85e-47af-ac34-629f31992751","name":"Aether Rift","manaCost":"{1}{R}{G}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your upkeep, discard a card at random. If you discard a creature card this way, return it from your graveyard to the battlefield unless any player pays 5 life.","colors":["G","R"],"colorIdentity":["G","R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/9/692c186a-997c-4f7e-a339-bf84884e1019.jpg?1783945667","artUrl":"https://cards.scryfall.io/art_crop/front/6/9/692c186a-997c-4f7e-a339-bf84884e1019.jpg?1783945667","commanderLegal":"legal","set":"inv","releasedAt":"2000-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const realm = (): CardDef => ({"oracleId":"9851d934-2e07-49c8-b08b-15f96d0f3f0c","name":"Teferi's Realm","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"World Enchantment","supertypes":["World"],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of each player's upkeep, that player chooses artifact, creature, land, or non-Aura enchantment. All nontoken permanents of that type phase out. (While they're phased out, they're treated as though they don't exist. Each one phases in before its controller untaps during their next untap step.)","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/b/aba3e4ea-2241-4f1e-a46b-70f512fe729e.jpg?1783946997","artUrl":"https://cards.scryfall.io/art_crop/front/a/b/aba3e4ea-2241-4f1e-a46b-70f512fe729e.jpg?1783946997","commanderLegal":"legal","set":"vis","releasedAt":"1997-02-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const juxtapose = (): CardDef => ({"oracleId":"a52ccb40-e950-4cd0-93ab-50daa52b03f3","name":"Juxtapose","manaCost":"{3}{U}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"You and target player exchange control of the creature you each control with the greatest mana value. Then exchange control of artifacts the same way. If two or more permanents a player controls are tied for greatest, their controller chooses one of them.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/4/c48d78db-d982-4c28-9308-2d57dc2b947e.jpg?1783948074","artUrl":"https://cards.scryfall.io/art_crop/front/c/4/c48d78db-d982-4c28-9308-2d57dc2b947e.jpg?1783948074","commanderLegal":"legal","set":"leg","releasedAt":"1994-06-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const flare = (): CardDef => ({"oracleId":"97159138-c34b-416e-b079-5c952383a243","name":"Mana Flare","manaCost":"{2}{R}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a player taps a land for mana, that player adds one mana of any type that land produced.","colors":["R"],"colorIdentity":["R"],"keywords":[],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/3/f/3f0b8b24-7272-4d1a-af4a-c3a1b89a7e04.jpg?1783914921","artUrl":"https://cards.scryfall.io/art_crop/front/3/f/3f0b8b24-7272-4d1a-af4a-c3a1b89a7e04.jpg?1783914921","commanderLegal":"legal","set":"wot","releasedAt":"2023-09-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const snowForest = (): CardDef => ({"oracleId":"5f0d3be8-e63e-4ade-ae58-6b0c14f2ce6d","name":"Snow-Covered Forest","manaCost":"","cmc":0,"typeLine":"Basic Snow Land — Forest","supertypes":["Basic","Snow"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/ca17acea-f079-4e53-8176-a2f5c5c408a1.jpg?1783928164","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/ca17acea-f079-4e53-8176-a2f5c5c408a1.jpg?1783928164","commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const phaser = (): CardDef => ({"oracleId":"138439ad-76c6-4d75-8025-e68b94f68fa3","name":"Breezekeeper","manaCost":"{3}{U}","cmc":4,"typeLine":"Creature — Djinn","supertypes":[],"types":["Creature"],"subtypes":["Djinn"],"oracleText":"Flying\nPhasing (This phases in or out before you untap during each of your untap steps. While it's phased out, it's treated as though it doesn't exist.)","power":"4","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":["Flying","Phasing"],"imageUrl":"https://cards.scryfall.io/normal/front/b/e/beaefa77-6e4a-4724-a443-fa6b45803db5.jpg?1783947002","artUrl":"https://cards.scryfall.io/art_crop/front/b/e/beaefa77-6e4a-4724-a443-fa6b45803db5.jpg?1783947002","commanderLegal":"legal","set":"vis","releasedAt":"1997-02-03","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const pacifism = (): CardDef => ({"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const shield = (): CardDef => ({"oracleId":"db5380ed-ba28-4ea2-abc3-4998e2022903","name":"Ancestral Mask","manaCost":"{2}{G}","cmc":3,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature gets +2/+2 for each other enchantment on the battlefield.","colors":["G"],"colorIdentity":["G"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7a19fc5-20f3-48d2-8c12-e012d3b302e7.jpg?1783937570","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7a19fc5-20f3-48d2-8c12-e012d3b302e7.jpg?1783937570","commanderLegal":"legal","set":"ema","releasedAt":"2016-06-10","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const myr = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const golem = (): CardDef => ({"oracleId":"f27e5e11-0ad0-448b-8760-75ed1b97e7d8","name":"Bronze Sable","manaCost":"{2}","cmc":2,"typeLine":"Artifact Creature — Sable","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Sable"],"oracleText":"","power":"2","toughness":"1","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/a/ba7e563d-964c-4afd-9e21-9d400f8719d4.jpg?1783939721","artUrl":"https://cards.scryfall.io/art_crop/front/b/a/ba7e563d-964c-4afd-9e21-9d400f8719d4.jpg?1783939721","commanderLegal":"legal","set":"ths","releasedAt":"2013-09-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const anthem = (): CardDef => ({"oracleId":"e3886fe8-9b76-4613-8891-4ec74657c087","name":"Glorious Anthem","manaCost":"{1}{W}{W}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Creatures you control get +1/+1.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/1/61f867c5-0727-4408-b479-b81518daa0ec.jpg?1783946375","artUrl":"https://cards.scryfall.io/art_crop/front/6/1/61f867c5-0727-4408-b479-b81518daa0ec.jpg?1783946375","commanderLegal":"legal","set":"usg","releasedAt":"1998-10-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const sliverBear = (): CardDef => bear({ name: "Muscle Sliver Test", typeLine: "Creature — Sliver", subtypes: ["Sliver"], oracleId: "test-sliver-b93" });
const goblin = (): CardDef => bear({ name: "Hill Giant", oracleId: "test-giant-b93" });
const walker = (): CardDef => card("Test Walker", "Legendary Planeswalker — Jace", "{2}{U}", { loyalty: "3", oracleId: "test-walker-b93" });

describe("round B93: Cautery Sliver", () => {
  it("is supported", () => supported(sliver()));

  it("the prevention ability targets a player, a planeswalker or a Sliver creature, not another creature", () => {
    const { s, ap, opp } = setup([]);
    const me = putOnBattlefield(s, ap, sliver());
    const other = putOnBattlefield(s, opp, sliverBear());
    const nonSliver = putOnBattlefield(s, opp, goblin());
    const pw = putOnBattlefield(s, opp, walker());
    invalidateCharacteristics(s);
    const ab = abilitiesOf(s, s.objects[me]!).activated.find((a) => /Prevent the next 1 damage/.test(a.body.text))!;
    const spec = ab.body.targets[0]!;
    expect(isLegalTarget(s, spec, player(opp), ap)).toBe(true);
    expect(isLegalTarget(s, spec, tgt(pw), ap)).toBe(true);
    expect(isLegalTarget(s, spec, tgt(other), ap)).toBe(true);
    expect(isLegalTarget(s, spec, tgt(me), ap)).toBe(true);
    expect(isLegalTarget(s, spec, tgt(nonSliver), ap)).toBe(false);
  });
});

describe("round B93: Time and Tide", () => {
  it("is supported", () => supported(tide()));

  it("phased-out creatures phase in and creatures with phasing phase out, at once", () => {
    let { s, ap, opp } = setup([tide()]);
    const djinn = putOnBattlefield(s, opp, phaser());
    const gone = putOnBattlefield(s, opp, bear());
    const aura = putOnBattlefield(s, opp, pacifism());
    s.objects[aura]!.attachedTo = gone;
    phaseOut(s, [gone]);
    expect([zone(s, gone), zone(s, aura)]).toEqual(["phasedOut", "phasedOut"]);
    s = settle(castNow(s, ap, s.players[ap]!.hand.find((id) => characteristics(s, s.objects[id]!).name === "Time and Tide")!));
    // The Aura that phased out with it comes back with it (CR 702.26g); the Djinn with phasing goes.
    expect([zone(s, gone), zone(s, aura), zone(s, djinn)]).toEqual(["battlefield", "battlefield", "phasedOut"]);
    expect(s.objects[aura]!.attachedTo).toBe(gone);
  });
});

describe("round B93: Winter's Night", () => {
  it("is supported", () => supported(winter()));

  it("a snow land adds one more mana of a type it made and doesn't untap during its controller's next untap step", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, next(s, ap), winter());
    const snow = putOnBattlefield(s, ap, snowForest());
    emptyPool(s, ap);
    s = act(s, { type: "activateMana", player: ap, objectId: snow, mana: "G" });
    expect(pool(s, ap)).toEqual({ G: 2 });
    expect(s.objects[snow]!.skipNextUntap).toBe(true);
    // A land that isn't snow: nothing.
    const plainForest = landOf(s, ap, "Forest");
    s = act(s, { type: "activateMana", player: ap, objectId: plainForest, mana: "G" });
    expect(pool(s, ap)).toEqual({ G: 3 });
    expect(s.objects[plainForest]!.skipNextUntap).toBeUndefined();
    // Its controller's next untap step: the Forest untaps, the snow land doesn't; it does the one after.
    s = passUntil(passUntil(s, "upkeep", next(s, ap)), "upkeep", ap);
    expect([s.objects[snow]!.tapped, s.objects[plainForest]!.tapped]).toEqual([true, false]);
  });
});

describe("round B93: Freyalise's Winds", () => {
  it("is supported", () => supported(winds()));

  it("a tapped permanent gets a wind counter; instead of untapping it loses all of them, then untaps the next time", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, next(s, ap), winds());
    const b = putOnBattlefield(s, ap, bear());
    tapPermanent(s, s.objects[b]!);
    s = settle(s);
    expect(s.objects[b]!.counters.wind).toBe(1);
    s = passUntil(passUntil(s, "upkeep", next(s, ap)), "upkeep", ap);
    expect(s.objects[b]!.tapped).toBe(true);
    expect(s.objects[b]!.counters.wind ?? 0).toBe(0);
    s = passUntil(passUntil(s, "upkeep", next(s, ap)), "upkeep", ap);
    expect(s.objects[b]!.tapped).toBe(false);
  });

  it("an untapped permanent with a wind counter keeps it (it wouldn't untap)", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, next(s, ap), winds());
    const b = putOnBattlefield(s, ap, bear());
    s.objects[b]!.counters.wind = 2;
    s = passUntil(passUntil(s, "upkeep", next(s, ap)), "upkeep", ap);
    expect(s.objects[b]!.counters.wind).toBe(2);
  });
});

describe("round B93: Remove Enchantments", () => {
  it("is supported", () => supported(removeEnch()));

  it("returns what you own of them, destroys the rest, and leaves other players' other enchantments alone", () => {
    let { s, ap, opp } = setup([removeEnch()]);
    const mine = putOnBattlefield(s, ap, anthem());
    const myBear = putOnBattlefield(s, ap, bear());
    const theirAttacker = putOnBattlefield(s, opp, bear());
    const theirIdle = putOnBattlefield(s, opp, bear());
    s.objects[theirAttacker]!.attacking = ap;
    // My Aura on my creature, their Aura on my creature, my Aura and their Aura on their attacking creature, their Aura on
    // their other creature, and their own Glorious Anthem.
    const auraOn = (owner: PlayerId, host: string) => {
      const id = putOnBattlefield(s, owner, pacifism());
      s.objects[id]!.attachedTo = host;
      return id;
    };
    const [a1, a2, a3, a4, a5] = [auraOn(ap, myBear), auraOn(opp, myBear), auraOn(ap, theirAttacker), auraOn(opp, theirAttacker), auraOn(opp, theirIdle)];
    const theirs = putOnBattlefield(s, opp, anthem());
    invalidateCharacteristics(s);
    const spell = s.players[ap]!.hand.find((id) => characteristics(s, s.objects[id]!).name === "Remove Enchantments")!;
    s = settle(castNow(s, ap, spell));
    expect([zone(s, mine), zone(s, a1), zone(s, a3)]).toEqual(["hand", "hand", "hand"]);
    expect(s.players[ap]!.hand).toEqual(expect.arrayContaining([mine, a1, a3]));
    expect([zone(s, a2), zone(s, a4)]).toEqual(["graveyard", "graveyard"]);
    expect([zone(s, a5), zone(s, theirs)]).toEqual(["battlefield", "battlefield"]);
  });
});

describe("round B93: Twist Allegiance", () => {
  it("is supported", () => supported(twist()));

  it("you and the opponent swap creatures until end of turn, untapped and with haste", () => {
    let { s, ap, opp } = setup([twist()]);
    const mine = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, goblin());
    const third = putOnBattlefield(s, next(s, opp), bear());
    s.objects[mine]!.tapped = true;
    s.objects[theirs]!.tapped = true;
    const spell = s.players[ap]!.hand.find((id) => characteristics(s, s.objects[id]!).name === "Twist Allegiance")!;
    s.players[ap]!.manaPool.R = 7;
    s = settle(castNow(s, ap, spell, [player(opp)]));
    expect([controllerOf(s, s.objects[mine]!), controllerOf(s, s.objects[theirs]!), controllerOf(s, s.objects[third]!)]).toEqual([opp, ap, next(s, opp)]);
    expect([s.objects[mine]!.tapped, s.objects[theirs]!.tapped]).toEqual([false, false]);
    expect([objHasKeyword(s, s.objects[mine]!, "Haste"), objHasKeyword(s, s.objects[theirs]!, "Haste")]).toEqual([true, true]);
    s = passUntil(s, "upkeep", next(s, ap));
    expect([controllerOf(s, s.objects[mine]!), controllerOf(s, s.objects[theirs]!)]).toEqual([ap, opp]);
  });
});

describe("round B93: Sands of Time", () => {
  it("is supported", () => supported(sands()));

  it("players skip their untap steps; at each upkeep that player's tapped and untapped artifacts, creatures and lands swap", () => {
    let { s, ap } = setup([]);
    const b = next(s, ap);
    putOnBattlefield(s, ap, sands());
    const land = putOnBattlefield(s, b, snowForest());
    const tappedBear = putOnBattlefield(s, b, bear());
    const idleBear = putOnBattlefield(s, b, bear());
    const ench = putOnBattlefield(s, b, anthem());
    const myBear = putOnBattlefield(s, ap, bear());
    s.objects[land]!.tapped = true;
    s.objects[tappedBear]!.tapped = true;
    s.objects[ench]!.tapped = true;
    s = settle(passUntil(s, "upkeep", b));
    expect([s.objects[land]!.tapped, s.objects[tappedBear]!.tapped, s.objects[idleBear]!.tapped]).toEqual([false, false, true]);
    // An enchantment isn't one of them; another player's creature isn't either.
    expect([s.objects[ench]!.tapped, s.objects[myBear]!.tapped]).toEqual([true, false]);
  });
});

describe("round B93: Kudzu and Steam Vines", () => {
  it("are supported", () => supported(kudzu(), vines()));

  it("Kudzu: when the land it enchants becomes tapped, it's destroyed and that land's controller may move Kudzu to a land of their choice", () => {
    let { s, ap, opp } = setup([]);
    const theirLand = putOnBattlefield(s, opp, snowForest());
    const theirOther = putOnBattlefield(s, opp, snowForest());
    const k = putOnBattlefield(s, ap, kudzu());
    s.objects[k]!.attachedTo = theirLand;
    invalidateCharacteristics(s);
    tapPermanent(s, s.objects[theirLand]!);
    s = toPending(s, "chooseOption");
    // The land's controller chooses, among every land (not targeted), or none.
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "enchant" });
    const p = s.pending as Extract<PendingDecision, { kind: "chooseOption" }>;
    expect(p.options).toEqual(expect.arrayContaining([theirOther, landOf(s, ap, "Forest"), "none"]));
    expect(zone(s, theirLand)).toBe("graveyard");
    const mine = landOf(s, ap, "Forest");
    s = settle(act(s, { type: "chooseOption", player: opp, choice: mine }));
    expect([zone(s, k), s.objects[k]!.attachedTo, controllerOf(s, s.objects[k]!)]).toEqual(["battlefield", mine, ap]);
  });

  it("Kudzu: if that player attaches it nowhere, it goes to the graveyard", () => {
    let { s, ap, opp } = setup([]);
    const theirLand = putOnBattlefield(s, opp, snowForest());
    const k = putOnBattlefield(s, ap, kudzu());
    s.objects[k]!.attachedTo = theirLand;
    invalidateCharacteristics(s);
    tapPermanent(s, s.objects[theirLand]!);
    s = toPending(s, "chooseOption");
    s = settle(act(s, { type: "chooseOption", player: opp, choice: "none" }));
    expect(zone(s, k)).toBe("graveyard");
  });

  it("Steam Vines: the land is destroyed, its controller is dealt 1 damage and must move it to a land", () => {
    let { s, ap, opp } = setup([]);
    const theirLand = putOnBattlefield(s, opp, snowForest());
    const v = putOnBattlefield(s, ap, vines());
    s.objects[v]!.attachedTo = theirLand;
    invalidateCharacteristics(s);
    const life = s.players[opp]!.life;
    tapPermanent(s, s.objects[theirLand]!);
    s = toPending(s, "chooseOption");
    const p = s.pending as Extract<PendingDecision, { kind: "chooseOption" }>;
    expect(p.player).toBe(opp);
    expect(p.options).not.toContain("none");
    expect(s.players[opp]!.life).toBe(life - 1);
    const mine = landOf(s, ap, "Island");
    s = settle(act(s, { type: "chooseOption", player: opp, choice: mine }));
    expect([zone(s, theirLand), s.objects[v]!.attachedTo]).toEqual(["graveyard", mine]);
  });
});

describe("round B93: Aether Rift", () => {
  it("is supported", () => supported(rift()));

  const upkeep = (payer?: PlayerId) => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, rift());
    emptyHand(s, ap);
    const b = inHand(s, ap, bear());
    s = toUpkeepOf(s, ap);
    for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "chooseOption" && p.what === "punisher") {
        expect(p.labels).toEqual(["Pay 5 life", "Don't"]);
        s = act(s, { type: "chooseOption", player: p.player, choice: p.player === payer ? "0" : "none" });
      } else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    return { s, ap, b };
  };

  it("the creature card discarded at random returns to the battlefield if no player pays 5 life", () => {
    const { s, b } = upkeep();
    expect(zone(s, b)).toBe("battlefield");
  });

  it("a player who pays 5 life keeps it in the graveyard", () => {
    const first = upkeep();
    const other = next(first.s, first.ap);
    const { s, b } = upkeep(other);
    expect(zone(s, b)).toBe("graveyard");
    expect(s.players[other]!.life).toBe(first.s.players[other]!.life - 5);
  });
});

describe("round B93: Teferi's Realm", () => {
  it("is supported", () => supported(realm()));

  const atUpkeep = () => {
    let { s, ap } = setup([]);
    const b = next(s, ap);
    putOnBattlefield(s, ap, realm());
    const ench = putOnBattlefield(s, b, anthem());
    const host = putOnBattlefield(s, b, bear());
    const aura = putOnBattlefield(s, b, pacifism());
    s.objects[aura]!.attachedTo = host;
    const mine = putOnBattlefield(s, ap, bear());
    invalidateCharacteristics(s);
    s = toUpkeepOf(s, b);
    s = toPending(s, "chooseOption");
    return { s, ap, b, ench, host, aura, mine };
  };

  it("that player chooses; non-Aura enchantment phases out the Anthems, not the Aura", () => {
    let { s, b, ench, aura, host } = atUpkeep();
    const p = s.pending as Extract<PendingDecision, { kind: "chooseOption" }>;
    expect(p).toMatchObject({ player: b, what: "cardType", options: ["Artifact", "Creature", "Land", "Non-Aura enchantment"] });
    s = settle(act(s, { type: "chooseOption", player: b, choice: "Non-Aura enchantment" }));
    expect([zone(s, ench), zone(s, aura), zone(s, host)]).toEqual(["phasedOut", "battlefield", "battlefield"]);
    // Teferi's Realm itself is a non-Aura enchantment too (rulings).
    expect(s.battlefield.some((id) => characteristics(s, s.objects[id]!).name === "Teferi's Realm")).toBe(false);
  });

  it("creature: every player's nontoken creatures phase out (with their Auras), tokens stay", () => {
    let { s, b, host, aura, mine } = atUpkeep();
    const token = putOnBattlefield(s, b, bear());
    s.objects[token]!.isToken = true;
    s = settle(act(s, { type: "chooseOption", player: b, choice: "Creature" }));
    expect([zone(s, host), zone(s, aura), zone(s, mine), zone(s, token)]).toEqual(["phasedOut", "phasedOut", "phasedOut", "battlefield"]);
  });
});

describe("round B93: Juxtapose", () => {
  it("is supported", () => supported(juxtapose()));

  it("exchanges the greatest mana value creatures (a tie chosen by its controller), then the artifacts", () => {
    let { s, ap, opp } = setup([juxtapose()]);
    const big = putOnBattlefield(s, ap, card("Big Test", "Creature — Giant", "{3}{G}", { power: "4", toughness: "4", oracleId: "test-big-b93" }));
    const small = putOnBattlefield(s, ap, bear());
    const thopter = putOnBattlefield(s, ap, myr());
    const [g1, g2] = [putOnBattlefield(s, opp, card("Tie One", "Creature — Giant", "{2}{R}", { power: "3", toughness: "3", oracleId: "test-tie1-b93" })), putOnBattlefield(s, opp, card("Tie Two", "Creature — Giant", "{2}{R}", { power: "3", toughness: "3", oracleId: "test-tie2-b93" }))];
    const sable = putOnBattlefield(s, opp, golem());
    const spell = s.players[ap]!.hand.find((id) => characteristics(s, s.objects[id]!).name === "Juxtapose")!;
    s = castNow(s, ap, spell, [player(opp)]);
    s = toPending(s, "chooseOption");
    expect(s.pending).toMatchObject({ player: opp, what: "greatestTie" });
    expect((s.pending as Extract<PendingDecision, { kind: "chooseOption" }>).options.sort()).toEqual([g1, g2].sort());
    s = settle(act(s, { type: "chooseOption", player: opp, choice: g2 }));
    const ctl = (id: string) => controllerOf(s, s.objects[id]!);
    expect([ctl(big), ctl(g2), ctl(g1), ctl(small)]).toEqual([opp, ap, opp, ap]);
    // Artifacts: your Ornithopter (0) for their Bronze Sable (2).
    expect([ctl(thopter), ctl(sable)]).toEqual([opp, ap]);
  });

  it("with no artifact on one side, only the creatures are exchanged", () => {
    let { s, ap, opp } = setup([juxtapose()]);
    const mine = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, golem());
    const spell = s.players[ap]!.hand.find((id) => characteristics(s, s.objects[id]!).name === "Juxtapose")!;
    s = settle(castNow(s, ap, spell, [player(opp)]));
    // Bronze Sable is their only creature and their only artifact; you have no artifact.
    expect([controllerOf(s, s.objects[mine]!), controllerOf(s, s.objects[theirs]!)]).toEqual([opp, ap]);
  });
});
