// Lane B round B239: Silhouette (damage prevented when a spell or ability that targets the creature causes it), Bell Borca,
// Spectral Sergeant (the mana value of each card put into exile noted, its power the greatest this turn) and Charmed Pendant
// (a mana ability that mills a card and adds one mana for each colored mana symbol in its mana cost).

import { describe, expect, it } from "vitest";
import { moveObject } from "../src/game";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, isFullySupported, manaAbilityProblem, manaOptions, planActivate, planCast, power, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const silhouette = (): CardDef => ({"oracleId":"5a074b0a-3a4d-4c6f-b161-5d1281f6136d","name":"Silhouette","manaCost":"{1}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose target creature. If a spell or ability that targets that creature would cause a source to deal damage to that creature this turn, prevent that damage.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/6/e6d6fac6-9a23-465f-a813-92e1ed1cd742.jpg?1783948071","artUrl":"https://cards.scryfall.io/art_crop/front/e/6/e6d6fac6-9a23-465f-a813-92e1ed1cd742.jpg?1783948071","commanderLegal":"legal","set":"leg","releasedAt":"1994-06-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bellBorca = (): CardDef => ({"oracleId":"5e29aea1-06e3-49ef-8a22-e3acff1fb679","name":"Bell Borca, Spectral Sergeant","manaCost":"{2}{R}{W}","cmc":4,"typeLine":"Legendary Creature — Spirit Soldier","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Spirit","Soldier"],"oracleText":"Note the mana value of each card as it's put into exile.\nBell Borca's power is equal to the greatest number noted for it this turn.\nAt the beginning of your upkeep, exile the top card of your library. You may play that card this turn.","power":"*","toughness":"5","colors":["R","W"],"colorIdentity":["R","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/6/5602cf54-3c34-4f86-8440-13ac28ace68c.jpg?1783928777","artUrl":"https://cards.scryfall.io/art_crop/front/5/6/5602cf54-3c34-4f86-8440-13ac28ace68c.jpg?1783928777","commanderLegal":"legal","set":"cmr","releasedAt":"2020-11-20","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const charmedPendant = (): CardDef => ({"oracleId":"12469cb5-a383-47ab-84cd-414b9ced8a8c","name":"Charmed Pendant","manaCost":"{4}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}, Mill a card: For each colored mana symbol in the milled card's mana cost, add one mana of that color. (Activate only as an instant. For example, if the card's mana cost is {3}{U}{U}{B}, you add {U}{U}{B}.)","colors":[],"colorIdentity":[],"keywords":["Mill"],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/7/0/701942dd-7777-436f-8076-194584be8285.jpg?1789989102","artUrl":"https://cards.scryfall.io/art_crop/front/7/0/701942dd-7777-436f-8076-194584be8285.jpg?1789989102","commanderLegal":"legal","set":"ody","releasedAt":"2001-10-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const pyroclasm = (): CardDef => ({"oracleId":"e4bcd4ea-e7cd-4471-8f3b-18bb51d3d70c","name":"Pyroclasm","manaCost":"{1}{R}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Pyroclasm deals 2 damage to each creature.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/4391b0af-2f26-4a45-9e2a-5bd8e9838107.jpg?1783909464","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/4391b0af-2f26-4a45-9e2a-5bd8e9838107.jpg?1783909464","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const preyUpon = (): CardDef => ({"oracleId":"b3c12848-528d-4005-878f-4f950a07240a","name":"Prey Upon","manaCost":"{G}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target creature you control fights target creature you don't control. (Each deals damage equal to its power to the other.)","colors":["G"],"colorIdentity":["G"],"keywords":["Fight"],"imageUrl":"https://cards.scryfall.io/normal/front/1/6/16979827-4011-454a-9886-18326cfa3e77.jpg?1783934147","artUrl":"https://cards.scryfall.io/art_crop/front/1/6/16979827-4011-454a-9886-18326cfa3e77.jpg?1783934147","commanderLegal":"legal","set":"grn","releasedAt":"2018-10-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const arcTrail = (): CardDef => ({"oracleId":"f1c26b25-371e-4fbf-a43d-7fd59a364d3a","name":"Arc Trail","manaCost":"{1}{R}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Arc Trail deals 2 damage to any target and 1 damage to any other target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/4/445e3a0a-29a7-4dc0-80fe-569b9e751db3.jpg?1783941727","artUrl":"https://cards.scryfall.io/art_crop/front/4/4/445e3a0a-29a7-4dc0-80fe-569b9e751db3.jpg?1783941727","commanderLegal":"legal","set":"som","releasedAt":"2010-10-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const swordsToPlowshares = (): CardDef => ({"oracleId":"b1544f21-7e98-461b-aed5-e748b0168c52","name":"Swords to Plowshares","manaCost":"{W}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Exile target creature. Its controller gains life equal to its power.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/4/84a4a532-538e-428c-bd62-d0b997895c31.jpg?1790743598","artUrl":"https://cards.scryfall.io/art_crop/front/8/4/84a4a532-538e-428c-bd62-d0b997895c31.jpg?1790743598","commanderLegal":"legal","set":"sld","releasedAt":"2026-09-28","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const kitchenFinks = (): CardDef => ({"oracleId":"5470dcfa-4eff-43da-abf7-19922841f719","name":"Kitchen Finks","manaCost":"{1}{G/W}{G/W}","cmc":3,"typeLine":"Creature — Ouphe","supertypes":[],"types":["Creature"],"subtypes":["Ouphe"],"oracleText":"When this creature enters, you gain 2 life.\nPersist (When this creature dies, if it had no -1/-1 counters on it, return it to the battlefield under its owner's control with a -1/-1 counter on it.)","power":"3","toughness":"2","colors":["G","W"],"colorIdentity":["G","W"],"keywords":["Persist"],"imageUrl":"https://cards.scryfall.io/normal/front/7/d/7d203208-8a21-4c68-afa2-4efd8726f026.jpg?1783942717","artUrl":"https://cards.scryfall.io/art_crop/front/7/d/7d203208-8a21-4c68-afa2-4efd8726f026.jpg?1783942717","commanderLegal":"legal","set":"shm","releasedAt":"2008-05-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const spectralProcession = (): CardDef => ({"oracleId":"376271a6-80f0-47a6-990a-5ec5517aae42","name":"Spectral Procession","manaCost":"{2/W}{2/W}{2/W}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Create three 1/1 white Spirit creature tokens with flying.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/4/74e91e61-f1e8-4028-9bcd-c1ea25694d20.jpg?1783940078","artUrl":"https://cards.scryfall.io/art_crop/front/7/4/74e91e61-f1e8-4028-9bcd-c1ea25694d20.jpg?1783940078","commanderLegal":"legal","set":"ddk","releasedAt":"2013-03-15","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const fireIce = (): CardDef => ({"oracleId":"ae92942b-919c-4ea9-b693-85fcef765d5a","name":"Fire // Ice","manaCost":"{1}{R} // {1}{U}","cmc":4,"typeLine":"Instant // Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Fire deals 2 damage divided as you choose among one or two targets.","colors":["R","U"],"colorIdentity":["R","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/b/ab8292ae-9a52-43e7-92f7-0f45f4bb71ec.jpg?1783940411","artUrl":"https://cards.scryfall.io/art_crop/front/a/b/ab8292ae-9a52-43e7-92f7-0f45f4bb71ec.jpg?1783940411","commanderLegal":"legal","set":"ddj","releasedAt":"2012-09-07","rarity":"uncommon","layout":"split","gameChanger":false,"faces":[{"name":"Fire","manaCost":"{1}{R}","typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Fire deals 2 damage divided as you choose among one or two targets.","colors":["R"]},{"name":"Ice","manaCost":"{1}{U}","typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Tap target permanent.\nDraw a card.","colors":["U"]}]}) as CardDef;
const bonecrusher = (): CardDef => ({"oracleId":"d6d72f5f-8f5d-4180-b514-f22ff5482902","name":"Bonecrusher Giant // Stomp","manaCost":"{2}{R} // {1}{R}","cmc":3,"typeLine":"Creature — Giant // Instant — Adventure","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"Whenever this creature becomes the target of a spell, this creature deals 2 damage to that spell's controller.","power":"4","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/9/09fd2d9c-1793-4beb-a3fb-7a869f660cd4.jpg?1783932628","artUrl":"https://cards.scryfall.io/art_crop/front/0/9/09fd2d9c-1793-4beb-a3fb-7a869f660cd4.jpg?1783932628","commanderLegal":"legal","set":"eld","releasedAt":"2019-10-04","rarity":"rare","layout":"adventure","gameChanger":false,"faces":[{"name":"Bonecrusher Giant","manaCost":"{2}{R}","typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"Whenever this creature becomes the target of a spell, this creature deals 2 damage to that spell's controller.","power":"4","toughness":"3","colors":["R"]},{"name":"Stomp","manaCost":"{1}{R}","typeLine":"Instant — Adventure","supertypes":[],"types":["Instant"],"subtypes":["Adventure"],"oracleText":"Damage can't be prevented this turn. Stomp deals 2 damage to any target.","colors":["R"]}]}) as CardDef;
const fireball = (): CardDef => ({"oracleId":"aa7714b0-2bfb-458a-8ebf-37ec2c53383e","name":"Fireball","manaCost":"{X}{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"This spell costs {1} more to cast for each target beyond the first.\nFireball deals X damage divided evenly, rounded down, among any number of targets.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/2/82a97aae-d8a7-4451-a47e-ea878dea6e4c.jpg?1783922638","artUrl":"https://cards.scryfall.io/art_crop/front/8/2/82a97aae-d8a7-4451-a47e-ea878dea6e4c.jpg?1783922638","commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const birthingPod = (): CardDef => ({"oracleId":"f8b9dd54-0837-47f4-ad14-7a0322d46d5f","name":"Birthing Pod","manaCost":"{3}{G/P}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"({G/P} can be paid with either {G} or 2 life.)\n{1}{G/P}, {T}, Sacrifice a creature: Search your library for a creature card with mana value equal to 1 plus the sacrificed creature's mana value, put that card onto the battlefield, then shuffle. Activate only as a sorcery.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/6/36df0c13-b7cb-44d6-85e1-17f2967a0f55.jpg?1783920226","artUrl":"https://cards.scryfall.io/art_crop/front/3/6/36df0c13-b7cb-44d6-85e1-17f2967a0f55.jpg?1783920226","commanderLegal":"legal","set":"slc","releasedAt":"2022-11-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const manaReflection = (): CardDef => ({"oracleId":"a3a8a044-283d-443e-bc40-c2f826d70c22","name":"Mana Reflection","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"If you tap a permanent for mana, it produces twice as much of that mana instead.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/1/81e0d739-990f-4ba5-b456-165c033014cf.jpg?1783930143","artUrl":"https://cards.scryfall.io/art_crop/front/8/1/81e0d739-990f-4ba5-b456-165c033014cf.jpg?1783930143","commanderLegal":"legal","set":"2xm","releasedAt":"2020-08-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const restInPeace = (): CardDef => ({"oracleId":"087f9ad7-e74f-40e2-8102-1ed2925d0418","name":"Rest in Peace","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, exile all graveyards.\nIf a card or token would be put into a graveyard from anywhere, exile it instead.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/8/98040e14-8182-4a94-9322-bbd967dc4dfe.jpg?1783910962","artUrl":"https://cards.scryfall.io/art_crop/front/9/8/98040e14-8182-4a94-9322-bbd967dc4dfe.jpg?1783910962","commanderLegal":"legal","set":"acr","releasedAt":"2024-07-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const prodigalPyromancer = (): CardDef => ({"oracleId":"29b3cb3e-aeb1-43eb-8095-9f7881aa34bd","name":"Prodigal Pyromancer","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"{T}: This creature deals 1 damage to any target.","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/7/97787109-408e-42d3-acc5-300f5f5bf2ff.jpg?1783943143","artUrl":"https://cards.scryfall.io/art_crop/front/9/7/97787109-408e-42d3-acc5-300f5f5bf2ff.jpg?1783943143","commanderLegal":"legal","set":"plc","releasedAt":"2007-02-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const ancestralRecall = (): CardDef => ({"oracleId":"550c74d4-1fcb-406a-b02a-639a760a4380","name":"Ancestral Recall","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target player draws three cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/0/70e7ddf2-5604-41e7-bb9d-ddd03d3e9d0b.jpg?1783948708","artUrl":"https://cards.scryfall.io/art_crop/front/7/0/70e7ddf2-5604-41e7-bb9d-ddd03d3e9d0b.jpg?1783948708","commanderLegal":"banned","set":"lea","releasedAt":"1993-08-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bojukaBog = (): CardDef => ({"oracleId":"04b7362d-0490-4cb0-b5d7-2a7732f659ce","name":"Bojuka Bog","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"This land enters tapped.\nWhen this land enters, exile target player's graveyard.\n{T}: Add {B}.","colors":[],"colorIdentity":["B"],"keywords":[],"producedMana":["B"],"imageUrl":"https://cards.scryfall.io/normal/front/6/f/6f730eba-fef1-4d2c-bcaf-9fe51f6bf270.jpg?1783912029","artUrl":"https://cards.scryfall.io/art_crop/front/6/f/6f730eba-fef1-4d2c-bcaf-9fe51f6bf270.jpg?1783912029","commanderLegal":"legal","set":"sld","releasedAt":"2024-04-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const relic = (): CardDef => ({"oracleId":"6a9c3401-570c-41cb-a605-75dfa57d6ab7","name":"Relic of Progenitus","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Target player exiles a card from their graveyard.\n{1}, Exile this artifact: Exile all graveyards. Draw a card.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/0/90c41192-64ef-43aa-9af0-75f0d3f56688.jpg?1783942534","artUrl":"https://cards.scryfall.io/art_crop/front/9/0/90c41192-64ef-43aa-9af0-75f0d3f56688.jpg?1783942534","commanderLegal":"legal","set":"ala","releasedAt":"2008-10-03","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty or a question is asked; bots answer the questions of anyone but `me`. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && me !== undefined && p.player === me) return s;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
/** A card in `pid`'s hand. */
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
};
/** A card on top of `pid`'s library. */
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
};
/** A card in `pid`'s graveyard. */
const inYard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
};
const pool = (s: GameState, pid: PlayerId) => Object.entries(s.players[pid]!.manaPool).filter(([, n]) => n > 0).map(([m, n]) => `${m}${n}`).sort().join(" ");

describe("Lane B round B239", () => {
  it("are fully supported", () => supported(silhouette(), bellBorca(), charmedPendant()));
});

describe("Lane B round B239: Silhouette", () => {
  /** Your Bears, with Silhouette cast on them and resolved; the next player has Bears too. */
  const game = () => {
    const { s: s0, ap, opp } = setup([]);
    const bears = putOnBattlefield(s0, ap, grizzlyBears());
    const theirs = putOnBattlefield(s0, opp, grizzlyBears());
    const sil = inHand(s0, ap, silhouette());
    const s = settle(run(s0, planCast(s0, ap, sil, [tgt(bears)])));
    expect(zone(s, sil)).toBe("graveyard");
    return { s, ap, opp, bears, theirs };
  };

  it("prevents a Lightning Bolt's damage to the creature it targets", () => {
    const { s: s0, ap, bears } = game();
    const bolt = inHand(s0, ap, lightningBolt());
    const s = settle(run(s0, planCast(s0, ap, bolt, [tgt(bears)])));
    expect(zone(s, bolt)).toBe("graveyard");
    expect(zone(s, bears)).toBe("battlefield");
    expect(s.objects[bears]!.damage).toBe(0);
  });

  it("doesn't prevent a spell's damage that doesn't target it (Pyroclasm)", () => {
    const { s: s0, ap, bears, theirs } = game();
    const clasm = inHand(s0, ap, pyroclasm());
    const s = settle(run(s0, planCast(s0, ap, clasm)));
    expect(zone(s, bears)).toBe("graveyard");
    expect(zone(s, theirs)).toBe("graveyard");
  });

  it("Arc Trail: the creature it targets is dealt none, the other target is still dealt its damage", () => {
    const { s: s0, ap, opp, bears } = game();
    const arc = inHand(s0, ap, arcTrail());
    const life = s0.players[opp]!.life;
    const s = settle(run(s0, planCast(s0, ap, arc, [tgt(bears), { kind: "player", id: opp }])));
    expect(zone(s, bears)).toBe("battlefield");
    expect(s.objects[bears]!.damage).toBe(0);
    expect(s.players[opp]!.life).toBe(life - 1);
  });

  it("a fight: the other creature's damage to it is prevented (the spell targets it), its own damage isn't", () => {
    const { s: s0, ap, bears, theirs } = game();
    const prey = inHand(s0, ap, preyUpon());
    const s = settle(run(s0, planCast(s0, ap, prey, [tgt(bears), tgt(theirs)])));
    expect(zone(s, bears)).toBe("battlefield");
    expect(s.objects[bears]!.damage).toBe(0);
    expect(zone(s, theirs)).toBe("graveyard");
  });

  it("an activated ability that targets it (Prodigal Pyromancer) is prevented too", () => {
    const { s: s0, ap, bears } = game();
    const pyro = putOnBattlefield(s0, ap, prodigalPyromancer());
    const s = settle(run(s0, planActivate(s0, ap, pyro, 0, [tgt(bears)])));
    expect(s.objects[pyro]!.tapped).toBe(true);
    expect(s.objects[bears]!.damage).toBe(0);
  });

  it("lasts only this turn", () => {
    const { s: s0, ap, bears } = game();
    let s = passUntil(s0, "main1", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]);
    s = passUntil(s, "main1", ap);
    const bolt = inHand(s, ap, lightningBolt());
    s = settle(run(s, planCast(s, ap, bolt, [tgt(bears)])));
    expect(zone(s, bears)).toBe("graveyard");
  });
});

describe("Lane B round B239: Bell Borca, Spectral Sergeant", () => {
  const game = () => {
    const { s, ap, opp } = setup([]);
    const borca = putOnBattlefield(s, ap, bellBorca());
    return { s, ap, opp, borca };
  };

  it("its power is 0 before any card is exiled this turn", () => {
    const { s, borca } = game();
    expect(power(s, s.objects[borca]!)).toBe(0);
  });

  it("notes each card's mana value as it's put into exile, its power the greatest this turn", () => {
    const { s: s0, ap, opp, borca } = game();
    const theirs = putOnBattlefield(s0, opp, grizzlyBears());
    const swords = inHand(s0, ap, swordsToPlowshares());
    let s = settle(run(s0, planCast(s0, ap, swords, [tgt(theirs)])));
    expect(zone(s, theirs)).toBe("exile");
    // Swords to Plowshares itself goes to the graveyard, not exile: only the Bears' 2 is noted.
    expect(power(s, s.objects[borca]!)).toBe(2);
    const finks = inYard(s, opp, kitchenFinks());
    moveObject(s, finks, "exile");
    expect(power(s, s.objects[borca]!)).toBe(3);
    const bolt = inYard(s, opp, lightningBolt());
    moveObject(s, bolt, "exile");
    expect(power(s, s.objects[borca]!)).toBe(3);
    expect(s.objects[borca]!.exiledMvNoted?.max).toBe(3);
  });

  it("an {X} card's X is 0 in exile; a split card's mana value is both halves'", () => {
    const { s, opp, borca } = game();
    const ball = inYard(s, opp, fireball());
    moveObject(s, ball, "exile");
    expect(power(s, s.objects[borca]!)).toBe(1);
    const fi = inYard(s, opp, fireIce());
    moveObject(s, fi, "exile");
    expect(power(s, s.objects[borca]!)).toBe(4);
  });

  it("the notes are for this turn only", () => {
    const { s: s0, ap, opp, borca } = game();
    const finks = inYard(s0, opp, kitchenFinks());
    moveObject(s0, finks, "exile");
    expect(power(s0, s0.objects[borca]!)).toBe(3);
    const s = passUntil(s0, "main1", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]);
    expect(power(s, s.objects[borca]!)).toBe(0);
  });

  it("a card exiled while it isn't on the battlefield isn't noted for it", () => {
    const { s, opp, borca } = game();
    moveObject(s, borca, "hand");
    const finks = inYard(s, opp, kitchenFinks());
    moveObject(s, finks, "exile");
    expect(s.objects[borca]!.exiledMvNoted).toBeUndefined();
    expect(power(s, s.objects[borca]!)).toBe(0);
  });

  it("its upkeep trigger exiles the top card, which is noted", () => {
    const { s: s0, ap, borca } = game();
    const next = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    let s = passUntil(s0, "main1", next);
    s = passUntil(s, "upkeep", ap);
    const top = onTop(s, ap, kitchenFinks());
    s = settle(s);
    expect(zone(s, top)).toBe("exile");
    expect(power(s, s.objects[borca]!)).toBe(3);
  });
});

describe("Lane B round B239: Charmed Pendant", () => {
  const game = () => {
    const { s, ap, opp } = setup([]);
    const pendant = putOnBattlefield(s, ap, charmedPendant());
    return { s, ap, opp, pendant };
  };
  const tap = (s: GameState, pid: PlayerId, pendant: string) => act(s, { type: "activateMana", player: pid, objectId: pendant, mana: "C", ability: 0 });

  it("mills a card and adds one mana for each of its colored symbols", () => {
    const { s: s0, ap, pendant } = game();
    const bolt = onTop(s0, ap, lightningBolt());
    expect(manaOptions(s0, s0.objects[pendant]!)).toMatchObject([{ ability: 0, adds: [], mills: true }]);
    const s = tap(s0, ap, pendant);
    expect(zone(s, bolt)).toBe("graveyard");
    expect(s.objects[pendant]!.tapped).toBe(true);
    expect(pool(s, ap)).toBe("R1");
    expect(s.stack.length).toBe(0);
  });

  it("a hybrid card: its controller chooses the colors (Kitchen Finks)", () => {
    const { s: s0, ap, pendant } = game();
    onTop(s0, ap, kitchenFinks());
    let s = tap(s0, ap, pendant);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "pendantMana", options: ["WG", "GG", "WW"].sort() });
    s = act(s, { type: "chooseOption", player: ap, choice: "WG" });
    expect(s.pending).toBeNull();
    expect(pool(s, ap)).toBe("G1 W1");
  });

  it("{2/W} and Phyrexian symbols are colored symbols of their color; a split card has both halves, an adventurer only its own cost", () => {
    for (const [def, want] of [[spectralProcession(), "W3"], [birthingPod(), "G1"], [fireIce(), "R1 U1"], [bonecrusher(), "R1"], [grizzlyBears(), "G1"]] as const) {
      const { s: s0, ap, pendant } = game();
      onTop(s0, ap, def);
      const s = tap(s0, ap, pendant);
      expect(pool(s, ap), def.name).toBe(want);
    }
  });

  it("a colorless card adds nothing", () => {
    const { s: s0, ap, pendant } = game();
    const top = onTop(s0, ap, charmedPendant());
    const s = tap(s0, ap, pendant);
    expect(zone(s, top)).toBe("graveyard");
    expect(pool(s, ap)).toBe("");
  });

  it("Mana Reflection doubles it; with Rest in Peace the milled card is read in exile (and Bell Borca notes it)", () => {
    const { s: s0, ap, pendant } = game();
    putOnBattlefield(s0, ap, manaReflection());
    putOnBattlefield(s0, ap, restInPeace());
    const borca = putOnBattlefield(s0, ap, bellBorca());
    const top = onTop(s0, ap, fireIce());
    const s = tap(s0, ap, pendant);
    expect(zone(s, top)).toBe("exile");
    expect(pool(s, ap)).toBe("R2 U2");
    expect(power(s, s.objects[borca]!)).toBe(4);
  });

  it("only when its controller could cast an instant, and not with an empty library", () => {
    const { s, ap, opp, pendant } = game();
    expect(manaAbilityProblem(s, ap, s.objects[pendant]!, 0)).toBeNull();
    const s1 = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s1)).toBe(opp);
    expect(manaAbilityProblem(s1, ap, s1.objects[pendant]!, 0)).toMatch(/instant/);
    s.players[ap]!.library = [];
    expect(manaAbilityProblem(s, ap, s.objects[pendant]!, 0)).toMatch(/no card to mill/);
  });

  it("isn't used to pay for a spell automatically", () => {
    const { s: s0, ap, pendant } = game();
    // Only the Pendant could pay for it: none of the other lands.
    for (const id of [...s0.battlefield]) if (id !== pendant && s0.objects[id]!.controller === ap) s0.objects[id]!.tapped = true;
    const bolt = inHand(s0, ap, lightningBolt());
    expect(planCast(s0, ap, bolt, [{ kind: "player", id: ap }])).toBeNull();
  });

  it("a bot answers the hybrid choice", () => {
    const { s: s0, ap, pendant } = game();
    onTop(s0, ap, kitchenFinks());
    let s = tap(s0, ap, pendant);
    for (const a of botActions(s, ap)) s = act(s, a);
    expect(s.pending).toBeNull();
    expect(Object.values(s.players[ap]!.manaPool).reduce((a, n) => a + n, 0)).toBe(2);
  });
});
