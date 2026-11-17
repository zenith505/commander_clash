// Round 397 (Lane A): Jeskai Infiltrator (itself and the top card of your library exiled in a face-down pile, shuffled,
// then manifested), The Spot, Living Portal (two exiles as it enters, linked to its dies ability, CR 607.2a), Tetsuo,
// Imperial Champion (the greatest mana value among Equipment attached to it) and Absorbing Man (a copy with exceptions
// until your next turn, CR 707.9b).

import { describe, expect, it } from "vitest";
import { act, forest, island, passUntil, plainsCard, putOnBattlefield, setup, swamp } from "./helpers";
import { applyAction, botActions, characteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";
import { destroyPermanent, runStateBasedActions } from "../src/game";
import { invalidateCharacteristics } from "../src/layers";

// Real card data (Scryfall).
const jeskai = (): CardDef => ({"oracleId":"39b359c1-48b8-43a7-b972-54764eadd2c7","name":"Jeskai Infiltrator","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Human Monk","supertypes":[],"types":["Creature"],"subtypes":["Human","Monk"],"oracleText":"This creature can't be blocked as long as you control no other creatures.\nWhen this creature deals combat damage to a player, exile it and the top card of your library in a face-down pile, shuffle that pile, then manifest those cards. (To manifest a card, put it onto the battlefield face down as a 2/2 creature. Turn it face up any time for its mana cost if it's a creature card.)","power":"2","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Manifest"],"imageUrl":"https://cards.scryfall.io/normal/front/e/a/ea15d083-551b-4c13-92ad-3fc2d5414ab3.jpg?1783938705","artUrl":"https://cards.scryfall.io/art_crop/front/e/a/ea15d083-551b-4c13-92ad-3fc2d5414ab3.jpg?1783938705","commanderLegal":"legal","set":"frf","releasedAt":"2015-01-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const spot = (): CardDef => ({"oracleId":"a5dfa7ad-9637-4da8-9ed2-0ac863617d9a","name":"The Spot, Living Portal","manaCost":"{3}{W}{B}","cmc":5,"typeLine":"Legendary Creature — Human Scientist Villain","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Scientist","Villain"],"oracleText":"When The Spot enters, exile up to one target nonland permanent and up to one target nonland permanent card from a graveyard.\nWhen The Spot dies, put him on the bottom of his owner's library. If you do, return the exiled cards to their owners' hands.","power":"4","toughness":"4","colors":["B","W"],"colorIdentity":["B","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/9/09081740-1180-48ea-b50b-e016d9c3828a.jpg?1783905309","artUrl":"https://cards.scryfall.io/art_crop/front/0/9/09081740-1180-48ea-b50b-e016d9c3828a.jpg?1783905309","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const tetsuo = (): CardDef => ({"oracleId":"1111e042-0bce-4819-ab42-9912aed4d930","name":"Tetsuo, Imperial Champion","manaCost":"{U}{B}{R}","cmc":3,"typeLine":"Legendary Creature — Human Samurai","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Samurai"],"oracleText":"Whenever Tetsuo attacks, if it's equipped, choose one —\n• Tetsuo deals damage equal to the greatest mana value among Equipment attached to it to any target.\n• You may cast an instant or sorcery spell from your hand with mana value less than or equal to the greatest mana value among Equipment attached to Tetsuo without paying its mana cost.","power":"3","toughness":"3","colors":["B","R","U"],"colorIdentity":["B","R","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/1/51c523cd-78b0-438f-bba5-19160f648d5f.jpg?1783921460","artUrl":"https://cards.scryfall.io/art_crop/front/5/1/51c523cd-78b0-438f-bba5-19160f648d5f.jpg?1783921460","commanderLegal":"legal","set":"dmc","releasedAt":"2022-09-09","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const absorbing = (): CardDef => ({"oracleId":"ec8e310f-e871-498f-8d80-c3617c5e1433","name":"Absorbing Man","manaCost":"{1}{G}{U}","cmc":3,"typeLine":"Legendary Creature — Human Villain","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Villain"],"oracleText":"Vigilance\nAt the beginning of your first main phase, until your next turn, Absorbing Man becomes a copy of up to one target artifact, non-Aura enchantment, or land, except his name is Absorbing Man, he's a legendary 4/4 Human Villain creature in addition to his other types, and he has vigilance.","power":"4","toughness":"4","colors":["G","U"],"colorIdentity":["G","U"],"keywords":["Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/7/1/7114ef87-53ff-43e9-864c-9faa455d86ef.jpg?1783902907","artUrl":"https://cards.scryfall.io/art_crop/front/7/1/7114ef87-53ff-43e9-864c-9faa455d86ef.jpg?1783902907","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bonesplitter = (): CardDef => ({"oracleId":"452e3f5f-ce17-4682-966b-5cc100210aee","name":"Bonesplitter","manaCost":"{1}","cmc":1,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +2/+0.\nEquip {1}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980","artUrl":"https://cards.scryfall.io/art_crop/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980","commanderLegal":"legal","set":"pal03","releasedAt":"2003-01-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const warhammer = (): CardDef => ({"oracleId":"dba35ac5-7ad3-488a-a006-6b9a1d54eea5","name":"Loxodon Warhammer","manaCost":"{3}","cmc":3,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +3/+0 and has trample and lifelink.\nEquip {3}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/3/0/30e2117e-fc5f-4783-87e8-8d733c836b0f.jpg?1783919219","artUrl":"https://cards.scryfall.io/art_crop/front/3/0/30e2117e-fc5f-4783-87e8-8d733c836b0f.jpg?1783919219","commanderLegal":"legal","set":"sld","releasedAt":"2022-11-28","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const angel = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const unsummon = (): CardDef => ({"oracleId":"837182db-1bf3-4a2c-bd01-1af9d9873561","name":"Unsummon","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Return target creature to its owner's hand.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddad9f16-52d5-49de-82b0-b1a5294a9c44.jpg?1789556722","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddad9f16-52d5-49de-82b0-b1a5294a9c44.jpg?1789556722","commanderLegal":"legal","set":"fra","releasedAt":"2026-10-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const murder = (): CardDef => ({"oracleId":"938b4e2c-88d9-4637-bc00-e228920c9a78","name":"Murder","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","artUrl":"https://cards.scryfall.io/art_crop/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const oRing = (): CardDef => ({"oracleId":"bd9b9772-f5f9-4c6b-913e-7193bea5d0a7","name":"Oblivion Ring","manaCost":"{2}{W}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, exile another target nonland permanent.\nWhen this enchantment leaves the battlefield, return the exiled card to the battlefield under its owner's control.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/9/895c270d-84d8-4c7f-9df3-5a595e113dd7.jpg?1783942580","artUrl":"https://cards.scryfall.io/art_crop/front/8/9/895c270d-84d8-4c7f-9df3-5a595e113dd7.jpg?1783942580","commanderLegal":"legal","set":"ala","releasedAt":"2008-10-03","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const anthem = (): CardDef => ({"oracleId":"e3886fe8-9b76-4613-8891-4ec74657c087","name":"Glorious Anthem","manaCost":"{1}{W}{W}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Creatures you control get +1/+1.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/1/61f867c5-0727-4408-b479-b81518daa0ec.jpg?1783946375","artUrl":"https://cards.scryfall.io/art_crop/front/6/1/61f867c5-0727-4408-b479-b81518daa0ec.jpg?1783946375","commanderLegal":"legal","set":"usg","releasedAt":"1998-10-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const aura = (): CardDef => ({"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const crypt = (): CardDef => ({"oracleId":"fb868840-09fa-49b1-85cb-b08ad065e972","name":"Bitterblossom","manaCost":"{1}{B}","cmc":2,"typeLine":"Kindred Enchantment — Faerie","supertypes":[],"types":["Kindred","Enchantment"],"subtypes":["Faerie"],"oracleText":"At the beginning of your upkeep, you lose 1 life and create a 1/1 black Faerie Rogue creature token with flying.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/0/80f88df1-4e1a-4557-bb7a-1ac86641043e.jpg?1783931630","artUrl":"https://cards.scryfall.io/art_crop/front/8/0/80f88df1-4e1a-4557-bb7a-1ac86641043e.jpg?1783931630","commanderLegal":"legal","set":"sld","releasedAt":"2019-12-03","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const clone = (): CardDef => ({"oracleId":"42226b87-0746-4ebf-9fd0-108d508462af","name":"Clone","manaCost":"{3}{U}","cmc":4,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"You may have this creature enter as a copy of any creature on the battlefield.","power":"0","toughness":"0","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/8/48c2e9e2-f679-451d-a700-18104af08988.jpg?1784013893","artUrl":"https://cards.scryfall.io/art_crop/front/4/8/48c2e9e2-f679-451d-a700-18104af08988.jpg?1784013893","commanderLegal":"legal","set":"sld","releasedAt":"2026-06-15","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const lavaAxe = (): CardDef => ({"oracleId":"387b6b07-a283-412d-94c3-f7f1dc76e858","name":"Lava Axe","manaCost":"{4}{R}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Lava Axe deals 5 damage to target player or planeswalker.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/1/e11ec278-46f5-4970-ad0b-f6718c73de6c.jpg?1783946235","artUrl":"https://cards.scryfall.io/art_crop/front/e/1/e11ec278-46f5-4970-ad0b-f6718c73de6c.jpg?1783946235","commanderLegal":"legal","set":"ulg","releasedAt":"1999-02-15","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; questions are answered as the bots would, except `me`'s, where it stops. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const ch = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!);
const pt = (s: GameState, id: ObjectId) => `${ch(s, id).power}/${ch(s, id).toughness}`;
const others = (s: GameState, ap: PlayerId) => s.turnOrder.filter((p) => p !== ap);
const play = (s: GameState, pid: PlayerId, def: CardDef) => putOnBattlefield(s, pid, def);
/** A card put into `pid`'s hand. */
const inHand = (s: GameState, pid: PlayerId, def: CardDef): ObjectId => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
};
/** A card put into `pid`'s graveyard. */
const inYard = (s: GameState, pid: PlayerId, def: CardDef): ObjectId => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
};
/** A card put on top of `pid`'s library. */
const onTop = (s: GameState, pid: PlayerId, def: CardDef): ObjectId => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
};
const attach = (s: GameState, eq: ObjectId, to: ObjectId) => {
  s.objects[eq]!.attachedTo = to;
  invalidateCharacteristics(s);
};
const destroy = (s: GameState, id: ObjectId) => {
  destroyPermanent(s, s.objects[id]!, "destroyed");
  runStateBasedActions(s);
  return s;
};

describe("round 397: compiles", () => {
  it("every card of the round is fully supported", () => {
    for (const d of [jeskai(), spot(), tetsuo(), absorbing()]) expect(isFullySupported(d), d.name).toBe(true);
  });
});

describe("Jeskai Infiltrator", () => {
  /** The Infiltrator attacks an opponent and isn't blocked (no other creature of yours, so it can't be). */
  const attack = () => {
    const { s: s0, ap, ids } = setup([unsummon()]);
    const j = play(s0, ap, jeskai());
    const opp = others(s0, ap)[0]!;
    const top = onTop(s0, ap, divination());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: j, defender: opp }] });
    s = passUntil(s, "combatDamage", ap);
    return { s, ap, j, opp, top, unsummon: ids[0]! };
  };

  it("deals combat damage, then it and the top card of your library are exiled face down and manifested", () => {
    const { s: s1, ap, j, opp, top } = attack();
    expect(s1.players[opp]!.life).toBe(38);
    const s = settle(s1, ap);
    for (const id of [j, top]) {
      expect(s.objects[id]!.zone).toBe("battlefield");
      expect(s.objects[id]!.faceDown).toBeTruthy();
      expect(s.objects[id]!.controller).toBe(ap);
      expect(pt(s, id)).toBe("2/2");
    }
    // The Infiltrator is a new object (CR 400.7): a face-down 2/2 with no abilities.
    expect(ch(s, j).types).toEqual(["Creature"]);
    expect(s.players[ap]!.library).not.toContain(top);
  });

  it("with the Infiltrator gone as the trigger resolves, only the top card is manifested (rulings)", () => {
    const { s: s1, ap, j, top, unsummon: u } = attack();
    expect(s1.stack.length + s1.triggerQueue.length).toBeGreaterThan(0);
    let s = s1;
    // In response, the Infiltrator is returned to its owner's hand.
    for (let i = 0; i < 10 && !s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = run(s, planCast(s, ap, u, [{ kind: "object", id: j }]));
    s = settle(s, ap);
    expect(s.objects[j]!.zone).toBe("hand");
    expect(s.objects[top]!.zone).toBe("battlefield");
    expect(s.objects[top]!.faceDown).toBeTruthy();
  });
});

describe("The Spot, Living Portal", () => {
  /** The Spot in hand; an opponent's Oblivion Ring on the battlefield and their Serra Angel in their graveyard. */
  const begin = () => {
    const { s, ap, ids } = setup([spot(), unsummon(), murder(), spot()]);
    const opp = others(s, ap)[0]!;
    for (const l of [swamp, swamp, swamp, swamp, plainsCard, plainsCard, island, island]) play(s, ap, l);
    const ring = play(s, opp, oRing());
    const angelCard = inYard(s, opp, angel());
    return { s, ap, opp, ring, angelCard, spotId: ids[0]!, unsummonId: ids[1]!, murderId: ids[2]!, spot2: ids[3]! };
  };
  const castSpot = (s0: GameState, ap: PlayerId, id: ObjectId, targets: TargetChoice[]) => {
    let s = settle(run(s0, planCast(s0, ap, id)), ap);
    expect(s.pending?.kind).toBe("chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets }), ap);
    return s;
  };

  it("exiles up to one target nonland permanent and up to one target nonland permanent card from a graveyard", () => {
    const { s: s0, ap, ring, angelCard, spotId } = begin();
    const s = castSpot(s0, ap, spotId, [{ kind: "object", id: ring }, { kind: "object", id: angelCard }]);
    expect(s.objects[ring]!.zone).toBe("exile");
    expect(s.objects[angelCard]!.zone).toBe("exile");
  });

  it("a land card in a graveyard isn't a legal second target", () => {
    const { s: s0, ap, ring, opp, spotId } = begin();
    const land = inYard(s0, opp, forest);
    const s = settle(run(s0, planCast(s0, ap, spotId)), ap);
    expect(s.pending?.kind).toBe("chooseTargets");
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: ring }, { kind: "object", id: land }] })).toThrow();
  });

  it("when it dies, it's put on the bottom of its owner's library and the exiled cards return to their owners' hands", () => {
    const { s: s0, ap, opp, ring, angelCard, spotId, murderId } = begin();
    let s = castSpot(s0, ap, spotId, [{ kind: "object", id: ring }, { kind: "object", id: angelCard }]);
    s = settle(run(s, planCast(s, ap, murderId, [{ kind: "object", id: spotId }])), ap);
    const lib = s.players[ap]!.library;
    expect(lib[lib.length - 1]).toBe(spotId);
    expect(s.objects[ring]!.zone).toBe("hand");
    expect(s.objects[angelCard]!.zone).toBe("hand");
    expect(s.players[opp]!.hand).toContain(ring);
    expect(s.players[opp]!.hand).toContain(angelCard);
  });

  it("with only the graveyard card chosen, that one is exiled and comes back", () => {
    const { s: s0, ap, opp, ring, angelCard, spotId, murderId } = begin();
    let s = castSpot(s0, ap, spotId, [{ kind: "none" }, { kind: "object", id: angelCard }]);
    expect(s.objects[ring]!.zone).toBe("battlefield");
    expect(s.objects[angelCard]!.zone).toBe("exile");
    s = settle(run(s, planCast(s, ap, murderId, [{ kind: "object", id: spotId }])), ap);
    expect(s.players[opp]!.hand).toContain(angelCard);
    expect(s.objects[ring]!.zone).toBe("battlefield");
  });

  it("returns only what this object's enters ability exiled, not what it exiled before it left and came back (CR 607.2a, 400.7)", () => {
    const { s: s0, ap, ring, angelCard, spotId, unsummonId, murderId } = begin();
    let s = castSpot(s0, ap, spotId, [{ kind: "object", id: ring }, { kind: "none" }]);
    expect(s.objects[ring]!.zone).toBe("exile");
    s = settle(run(s, planCast(s, ap, unsummonId, [{ kind: "object", id: spotId }])), ap);
    expect(s.objects[spotId]!.zone).toBe("hand");
    s = castSpot(s, ap, spotId, [{ kind: "none" }, { kind: "object", id: angelCard }]);
    expect(s.objects[angelCard]!.zone).toBe("exile");
    s = settle(run(s, planCast(s, ap, murderId, [{ kind: "object", id: spotId }])), ap);
    expect(s.objects[angelCard]!.zone).toBe("hand");
    expect(s.objects[ring]!.zone).toBe("exile");
  });

  it("a token Spot can't be moved from the graveyard, so nothing comes back (rulings)", () => {
    const { s: s0, ap, ring, angelCard, spotId } = begin();
    let s = castSpot(s0, ap, spotId, [{ kind: "object", id: ring }, { kind: "object", id: angelCard }]);
    s.objects[spotId]!.isToken = true;
    s = settle(destroy(s, spotId), ap);
    expect(s.objects[ring]?.zone).toBe("exile");
    expect(s.objects[angelCard]!.zone).toBe("exile");
  });
});

describe("Tetsuo, Imperial Champion", () => {
  /** Tetsuo with Bonesplitter (mana value 1) and Loxodon Warhammer (3) attached, attacking an opponent. */
  const attack = (hand: CardDef[], equip = true) => {
    const { s: s0, ap, ids } = setup(hand);
    const t = play(s0, ap, tetsuo());
    const bs = play(s0, ap, bonesplitter());
    const wh = play(s0, ap, warhammer());
    if (equip) {
      attach(s0, bs, t);
      attach(s0, wh, t);
    }
    const opp = others(s0, ap)[0]!;
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: t, defender: opp }] });
    return { s: settle(s, ap), ap, ids, t, bs, wh, opp };
  };

  it("doesn't trigger while it isn't equipped (intervening if, rulings)", () => {
    const { s } = attack([], false);
    expect(s.pending).toBeNull();
    expect(s.stack.length).toBe(0);
  });

  it("first mode: damage equal to the greatest mana value among Equipment attached to it, to any target", () => {
    const { s: s1, ap, opp } = attack([]);
    expect(s1.pending).toMatchObject({ kind: "chooseModes", player: ap });
    let s = settle(act(s1, { type: "chooseModes", player: ap, modes: [0] }), ap);
    expect(s.pending?.kind).toBe("chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }), ap);
    expect(s.players[opp]!.life).toBe(37);
  });

  it("second mode: an instant or sorcery from your hand with mana value up to that, free", () => {
    const { s: s1, ap, ids } = attack([divination(), bolt(), lavaAxe(), giant()]);
    const [div, lb, axe, hg] = ids;
    let s = settle(act(s1, { type: "chooseModes", player: ap, modes: [1] }), ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "castFromHand" });
    const options = s.pending?.kind === "chooseOption" ? s.pending.options : [];
    expect(options).toContain(div);
    expect(options).toContain(lb);
    expect(options).not.toContain(axe);
    expect(options).not.toContain(hg);
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "chooseOption", player: ap, choice: div! }), ap);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: div });
    const pool = JSON.stringify(s.players[ap]!.manaPool);
    s = settle(run(s, planCast(s, ap, div!)), ap);
    expect(s.objects[div!]!.zone).toBe("graveyard");
    // Divination cast without paying its mana cost: two cards drawn, one card (Divination) gone from the hand.
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(JSON.stringify(s.players[ap]!.manaPool)).toBe(pool);
  });

  it("the greatest mana value is counted as it resolves: an Equipment moved away first lowers it", () => {
    const { s: s1, ap, wh, opp } = attack([]);
    let s = settle(act(s1, { type: "chooseModes", player: ap, modes: [0] }), ap);
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] });
    // In response, the Warhammer is no longer attached to it.
    s.objects[wh]!.attachedTo = undefined;
    invalidateCharacteristics(s);
    s = settle(s, ap);
    expect(s.players[opp]!.life).toBe(39);
  });

  it("unequipped before it resolves, it does nothing (rulings)", () => {
    const { s: s1, ap, bs, wh, opp } = attack([]);
    let s = settle(act(s1, { type: "chooseModes", player: ap, modes: [0] }), ap);
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] });
    for (const id of [bs, wh]) s.objects[id]!.attachedTo = undefined;
    invalidateCharacteristics(s);
    s = settle(s, ap);
    expect(s.players[opp]!.life).toBe(40);
  });

  it("a bot attacking with an equipped Tetsuo picks a mode and finishes the trigger", () => {
    const { s: s0, ap } = setup([bolt()]);
    const t = play(s0, ap, tetsuo());
    const wh = play(s0, ap, warhammer());
    attach(s0, wh, t);
    const opp = others(s0, ap)[0]!;
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: t, defender: opp }] });
    s = settle(s);
    expect(s.pending).toBeNull();
    expect(s.stack.length).toBe(0);
  });
});

describe("Absorbing Man", () => {
  /** Absorbing Man on the battlefield of the next player, whose first main phase begins: the trigger asks for its target. */
  const begin = () => {
    const { s: s0, ap } = setup([]);
    const me = others(s0, ap)[0]!;
    const am = play(s0, me, absorbing());
    const ring = play(s0, ap, solRing());
    const anthemId = play(s0, ap, anthem());
    const auraId = play(s0, ap, aura());
    let s = passUntil(s0, "draw", me);
    for (let i = 0; i < 50 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.step).toBe("main1");
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: me });
    return { s, me, ap, am, ring, anthemId, auraId };
  };

  it("at the beginning of your first main phase, becomes a copy of an artifact, except a legendary 4/4 Human Villain creature named Absorbing Man with vigilance", () => {
    const { s: s1, me, am, ring } = begin();
    const s = settle(act(s1, { type: "chooseTargets", player: me, targets: [{ kind: "object", id: ring }] }), me);
    const c = ch(s, am);
    expect(c.name).toBe("Absorbing Man");
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(c.subtypes).toEqual(expect.arrayContaining(["Human", "Villain"]));
    expect(c.supertypes).toContain("Legendary");
    expect(c.keywords).toContain("Vigilance");
    expect(pt(s, am)).toBe("4/4");
    expect(c.colors).toEqual([]);
  });

  it("the copy lasts until your next turn", () => {
    const { s: s1, me, am, ring } = begin();
    let s = settle(act(s1, { type: "chooseTargets", player: me, targets: [{ kind: "object", id: ring }] }), me);
    s = passUntil(s, "upkeep", others(s, me)[0]!);
    expect(ch(s, am).types).toContain("Artifact");
    s = passUntil(s, "upkeep", me);
    expect(ch(s, am).types).toEqual(["Creature"]);
    expect(ch(s, am).colors).toEqual(expect.arrayContaining(["G", "U"]));
  });

  it("copies a non-Aura enchantment (Glorious Anthem: it pumps the others), but an Aura can't be targeted", () => {
    const { s: s1, me, am, anthemId, auraId } = begin();
    const g = play(s1, me, giant());
    expect(() => act(s1, { type: "chooseTargets", player: me, targets: [{ kind: "object", id: auraId }] })).toThrow();
    const s = settle(act(s1, { type: "chooseTargets", player: me, targets: [{ kind: "object", id: anthemId }] }), me);
    expect(ch(s, am).types).toEqual(expect.arrayContaining(["Enchantment", "Creature"]));
    expect(ch(s, am).name).toBe("Absorbing Man");
    // "Creatures you control get +1/+1": his own creatures, him too (a 4/4 copiable value, then +1/+1 in layer 7c).
    expect(pt(s, g)).toBe("4/4");
    expect(pt(s, am)).toBe("5/5");
  });

  it("with no target chosen, it stays as it is", () => {
    const { s: s1, me, am } = begin();
    const s = settle(act(s1, { type: "chooseTargets", player: me, targets: [{ kind: "none" }] }), me);
    expect(ch(s, am).types).toEqual(["Creature"]);
    expect(pt(s, am)).toBe("4/4");
  });

  it("a bot's Absorbing Man finishes its trigger", () => {
    const { s: s1, me } = begin();
    const s = settle(s1);
    expect(s.pending).toBeNull();
    expect(s.stack.some((x) => x.controller === me)).toBe(false);
  });
});
