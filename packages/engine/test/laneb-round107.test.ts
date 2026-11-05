// Lane B round B107: Loyal Sentry, Abu Ja'far, Swat Away, Scrib Nibblers, Grimdancer, Laquatus's Creativity, Garza's
// Assassin, Vexing Sphinx, Polar Kraken, Searing Blood, Credit Voucher, Alluring Siren, Nullmage Advocate, Spurnmage
// Advocate and Public Enemy.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, isFullySupported, mustAttackPlayers, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";
import { invalidateCharacteristics } from "../src";

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
/** `ap` attacks with `attacks`, then `blocker`'s controller blocks with `blocks`, everyone else blocking nothing. */
const combat = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[], defender: PlayerId, blocks: { blocker: string; attacker: string }[]) => {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks });
  for (let i = 0; i < 20 && !(s.pending?.kind === "declareBlockers" && s.pending.player === defender); i++) {
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return act(s, { type: "declareBlockers", player: defender, blocks });
};
/** Puts every card of `pid`'s hand on the bottom of their library. */
const trimHand = (s: GameState, pid: PlayerId) => {
  const p = s.players[pid]!;
  for (const id of p.hand.splice(0)) {
    s.objects[id]!.zone = "library";
    p.library.push(id);
  }
};

// Real oracle text (Scryfall).
const sentry = (): CardDef => ({"oracleId":"54b1a496-1f8e-4581-8260-bad57b25c6e3","name":"Loyal Sentry","manaCost":"{W}","cmc":1,"typeLine":"Creature — Human Soldier","supertypes":[],"types":["Creature"],"subtypes":["Human","Soldier"],"oracleText":"When this creature blocks a creature, destroy that creature and this creature.","power":"1","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/8/8854cc80-6201-4066-80c8-97c0fdc9baa8.jpg?1783935195","artUrl":"https://cards.scryfall.io/art_crop/front/8/8/8854cc80-6201-4066-80c8-97c0fdc9baa8.jpg?1783935195","commanderLegal":"legal","set":"a25","releasedAt":"2018-03-16","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const abu = (): CardDef => ({"oracleId":"a2404d88-0621-49ae-9908-052c23a96ac6","name":"Abu Ja'far","manaCost":"{W}","cmc":1,"typeLine":"Creature — Human","supertypes":[],"types":["Creature"],"subtypes":["Human"],"oracleText":"When this creature dies, destroy all creatures blocking or blocked by it. They can't be regenerated.","power":"0","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/e/0e9ad288-d164-44a6-96ec-4185a1587f1a.jpg?1783948395","artUrl":"https://cards.scryfall.io/art_crop/front/0/e/0e9ad288-d164-44a6-96ec-4185a1587f1a.jpg?1783948395","commanderLegal":"legal","set":"arn","releasedAt":"1993-12-17","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const swat = (): CardDef => ({"oracleId":"79090b00-d920-4134-a838-fb434cf3ee4d","name":"Swat Away","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"This spell costs {2} less to cast if a creature is attacking you.\nThe owner of target spell or creature puts it on their choice of the top or bottom of their library.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/f/2fb0ea3f-2f6d-4b64-a9d7-e822c8854a03.jpg?1783904477","artUrl":"https://cards.scryfall.io/art_crop/front/2/f/2fb0ea3f-2f6d-4b64-a9d7-e822c8854a03.jpg?1783904477","commanderLegal":"legal","set":"ecl","releasedAt":"2026-01-23","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const scrib = (): CardDef => ({"oracleId":"458800d3-47b7-4f28-8371-25c8d1e60011","name":"Scrib Nibblers","manaCost":"{2}{B}","cmc":3,"typeLine":"Creature — Rat","supertypes":[],"types":["Creature"],"subtypes":["Rat"],"oracleText":"{T}: Exile the top card of target player's library. If it's a land card, you gain 1 life.\nLandfall — Whenever a land you control enters, you may untap this creature.","power":"1","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Landfall"],"imageUrl":"https://cards.scryfall.io/normal/front/4/1/4170ddd3-53bd-4ec7-82c0-4fb48f400aa5.jpg?1783942053","artUrl":"https://cards.scryfall.io/art_crop/front/4/1/4170ddd3-53bd-4ec7-82c0-4fb48f400aa5.jpg?1783942053","commanderLegal":"legal","set":"wwk","releasedAt":"2010-02-05","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const grim = (): CardDef => ({"oracleId":"4afd88fa-f8bb-46d4-9ba7-09419e6f858c","name":"Grimdancer","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Creature — Nightmare","supertypes":[],"types":["Creature"],"subtypes":["Nightmare"],"oracleText":"This creature enters with your choice of two different counters on it from among menace, deathtouch, and lifelink.","power":"3","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":["Deathtouch"],"imageUrl":"https://cards.scryfall.io/normal/front/8/1/819257c8-9806-48bd-ba49-e117ca31de54.jpg?1783931060","artUrl":"https://cards.scryfall.io/art_crop/front/8/1/819257c8-9806-48bd-ba49-e117ca31de54.jpg?1783931060","commanderLegal":"legal","set":"iko","releasedAt":"2020-04-24","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const laq = (): CardDef => ({"oracleId":"d4a73cee-659b-4e1a-8821-a8d0a31c749f","name":"Laquatus's Creativity","manaCost":"{4}{U}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target player draws cards equal to the number of cards in their hand, then discards that many cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/c/dcd48c28-bfa3-4eca-8e1a-f72d785b2ab9.jpg?1783945259","artUrl":"https://cards.scryfall.io/art_crop/front/d/c/dcd48c28-bfa3-4eca-8e1a-f72d785b2ab9.jpg?1783945259","commanderLegal":"legal","set":"ody","releasedAt":"2001-10-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const garza = (): CardDef => ({"oracleId":"9660b7c4-7b04-4ec3-b867-299c141f77e6","name":"Garza's Assassin","manaCost":"{B}{B}{B}","cmc":3,"typeLine":"Creature — Human Assassin","supertypes":[],"types":["Creature"],"subtypes":["Human","Assassin"],"oracleText":"Sacrifice this creature: Destroy target nonblack creature.\nRecover—Pay half your life, rounded up. (When another creature is put into your graveyard from the battlefield, you may pay half your life, rounded up. If you do, return this card from your graveyard to your hand. Otherwise, exile this card.)","power":"2","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":["Recover"],"imageUrl":"https://cards.scryfall.io/normal/front/3/4/3407ccbd-788d-4fe3-a039-0497724a94b5.jpg?1783943351","artUrl":"https://cards.scryfall.io/art_crop/front/3/4/3407ccbd-788d-4fe3-a039-0497724a94b5.jpg?1783943351","commanderLegal":"legal","set":"csp","releasedAt":"2006-07-21","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const sphinx = (): CardDef => ({"oracleId":"c2affd47-2404-44b0-a571-e64e948130eb","name":"Vexing Sphinx","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Creature — Sphinx","supertypes":[],"types":["Creature"],"subtypes":["Sphinx"],"oracleText":"Flying\nCumulative upkeep—Discard a card. (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nWhen this creature dies, draw a card for each age counter on it.","power":"4","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":["Cumulative upkeep","Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/8/1/81cc1248-85c8-428f-ba08-96d188167eaa.jpg?1783943353","artUrl":"https://cards.scryfall.io/art_crop/front/8/1/81cc1248-85c8-428f-ba08-96d188167eaa.jpg?1783943353","commanderLegal":"legal","set":"csp","releasedAt":"2006-07-21","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const kraken = (): CardDef => ({"oracleId":"d0ff30c8-ddb7-439d-b14d-c83fe3c8da87","name":"Polar Kraken","manaCost":"{8}{U}{U}{U}","cmc":11,"typeLine":"Creature — Kraken","supertypes":[],"types":["Creature"],"subtypes":["Kraken"],"oracleText":"Trample\nThis creature enters tapped.\nCumulative upkeep—Sacrifice a land. (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)","power":"11","toughness":"11","colors":["U"],"colorIdentity":["U"],"keywords":["Trample","Cumulative upkeep"],"imageUrl":"https://cards.scryfall.io/normal/front/a/e/aee01e9c-0445-4228-a73a-3e5744844ed3.jpg?1783947510","artUrl":"https://cards.scryfall.io/art_crop/front/a/e/aee01e9c-0445-4228-a73a-3e5744844ed3.jpg?1783947510","commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const searing = (): CardDef => ({"oracleId":"902b82fd-bb18-4833-b427-af8c9751f870","name":"Searing Blood","manaCost":"{R}{R}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Searing Blood deals 2 damage to target creature. When that creature dies this turn, Searing Blood deals 3 damage to the creature's controller.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/b/bb43fd07-d281-447d-88bf-c53498c2cf20.jpg?1783939539","artUrl":"https://cards.scryfall.io/art_crop/front/b/b/bb43fd07-d281-447d-88bf-c53498c2cf20.jpg?1783939539","commanderLegal":"legal","set":"bng","releasedAt":"2014-02-07","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const voucher = (): CardDef => ({"oracleId":"8496a8f1-f505-403a-8007-c35aedb90e2d","name":"Credit Voucher","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{2}, {T}, Sacrifice this artifact: Shuffle any number of cards from your hand into your library, then draw that many cards.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/a/1ab65242-17ad-4c22-9c70-aac8076d1b4c.jpg?1783945916","artUrl":"https://cards.scryfall.io/art_crop/front/1/a/1ab65242-17ad-4c22-9c70-aac8076d1b4c.jpg?1783945916","commanderLegal":"legal","set":"mmq","releasedAt":"1999-10-04","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const siren = (): CardDef => ({"oracleId":"5f358544-7319-4f8e-9d60-a410c4feb774","name":"Alluring Siren","manaCost":"{1}{U}","cmc":2,"typeLine":"Creature — Siren","supertypes":[],"types":["Creature"],"subtypes":["Siren"],"oracleText":"{T}: Target creature an opponent controls attacks you this turn if able.","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/f/df4e1cc3-4e47-4eff-9047-c6d1cc84d635.jpg?1783942395","artUrl":"https://cards.scryfall.io/art_crop/front/d/f/df4e1cc3-4e47-4eff-9047-c6d1cc84d635.jpg?1783942395","commanderLegal":"legal","set":"m10","releasedAt":"2009-07-17","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const nullmage = (): CardDef => ({"oracleId":"558568a6-5e22-482f-9096-e76682965c21","name":"Nullmage Advocate","manaCost":"{2}{G}","cmc":3,"typeLine":"Creature — Insect Druid","supertypes":[],"types":["Creature"],"subtypes":["Insect","Druid"],"oracleText":"{T}: Return two target cards from an opponent's graveyard to their hand. Destroy target artifact or enchantment.","power":"2","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/c/1c29991d-82f2-479d-95ca-5c88e9f3f219.jpg?1783945109","artUrl":"https://cards.scryfall.io/art_crop/front/1/c/1c29991d-82f2-479d-95ca-5c88e9f3f219.jpg?1783945109","commanderLegal":"legal","set":"jud","releasedAt":"2002-05-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const spurnmage = (): CardDef => ({"oracleId":"0477b923-9f32-4e7f-ac08-c715cca819a4","name":"Spurnmage Advocate","manaCost":"{W}","cmc":1,"typeLine":"Creature — Human Nomad","supertypes":[],"types":["Creature"],"subtypes":["Human","Nomad"],"oracleText":"{T}: Return two target cards from an opponent's graveyard to their hand. Destroy target attacking creature.","power":"1","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/0/008c8d72-097e-472d-88c8-78bf29e42e32.jpg?1783945132","artUrl":"https://cards.scryfall.io/art_crop/front/0/0/008c8d72-097e-472d-88c8-78bf29e42e32.jpg?1783945132","commanderLegal":"legal","set":"jud","releasedAt":"2002-05-27","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const enemy = (): CardDef => ({"oracleId":"c5f360dc-fe4e-4796-b5c1-468cbd0f6d24","name":"Public Enemy","manaCost":"{2}{U}","cmc":3,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nAll creatures attack enchanted creature's controller each combat if able.\nWhen enchanted creature dies, draw a card.","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/0/e/0e69ba61-8c16-4112-9601-fac978b88667.jpg?1783923141","artUrl":"https://cards.scryfall.io/art_crop/front/0/e/0e69ba61-8c16-4112-9601-fac978b88667.jpg?1783923141","commanderLegal":"legal","set":"snc","releasedAt":"2022-04-29","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const tracker = (): CardDef => ({"oracleId":"26184baf-5d48-4919-8df2-c98ac460b78f","name":"Deadeye Tracker","manaCost":"{B}","cmc":1,"typeLine":"Creature — Human Pirate","supertypes":[],"types":["Creature"],"subtypes":["Human","Pirate"],"oracleText":"{1}{B}, {T}: Exile two target cards from an opponent's graveyard. This creature explores. (Reveal the top card of your library. Put that card into your hand if it's a land. Otherwise, put a +1/+1 counter on this creature, then put the card back or put it into your graveyard.)","power":"1","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Explore"],"imageUrl":"https://cards.scryfall.io/normal/front/8/4/848902db-7a10-4754-b50a-57a9e845705a.jpg?1783935762","artUrl":"https://cards.scryfall.io/art_crop/front/8/4/848902db-7a10-4754-b50a-57a9e845705a.jpg?1783935762","commanderLegal":"legal","set":"xln","releasedAt":"2017-09-29","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3", colors: ["R"] });
const draw = card("Test Draw", "Instant", "{U}", { oracleText: "Draw a card." });
const kill = card("Test Kill", "Instant", "{0}", { oracleText: "Destroy target creature." });
const rock = card("Test Rock", "Artifact", "{1}");
const spell = card("Test Sorcery", "Sorcery", "{1}", { oracleText: "Draw a card." });
const land = card("Test Wastes", "Land", "", { oracleText: "{T}: Add {C}." });

describe("Lane B round B107", () => {
  it("all fifteen cards are supported", () =>
    supported(sentry(), abu(), swat(), scrib(), grim(), laq(), garza(), sphinx(), kraken(), searing(), voucher(), siren(), nullmage(), spurnmage(), enemy()));

  it("Loyal Sentry: when it blocks a creature, that creature and Loyal Sentry are destroyed", () => {
    let { s, ap, opp } = setup([]);
    s.players[ap]!.hand = [];
    const attacker = putOnBattlefield(s, ap, ogre);
    const sentryId = putOnBattlefield(s, opp, sentry());
    s = settle(combat(s, ap, [{ attacker, defender: opp }], opp, [{ blocker: sentryId, attacker }]));
    expect(zone(s, attacker)).toBe("graveyard");
    expect(zone(s, sentryId)).toBe("graveyard");
  });

  it("Abu Ja'far: when it dies, the creatures blocking it are destroyed, and a creature out of combat isn't", () => {
    let { s, ap, opp } = setup([]);
    s.players[ap]!.hand = [];
    const a = putOnBattlefield(s, ap, abu());
    const b1 = putOnBattlefield(s, opp, bear());
    const b2 = putOnBattlefield(s, opp, bear());
    const idle = putOnBattlefield(s, opp, bear());
    s = combat(s, ap, [{ attacker: a, defender: opp }], opp, [{ blocker: b1, attacker: a }, { blocker: b2, attacker: a }]);
    // Combat damage: two 2/2s kill the 0/1; its trigger then destroys both blockers.
    for (let i = 0; i < 40 && zone(s, a) === "battlefield"; i++) s = s.pending ? settle(s) : act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(s);
    expect(zone(s, a)).toBe("graveyard");
    expect(zone(s, b1)).toBe("graveyard");
    expect(zone(s, b2)).toBe("graveyard");
    expect(zone(s, idle)).toBe("battlefield");
  });

  it("Abu Ja'far: when it dies blocking, the creature it blocked is destroyed", () => {
    let { s, ap, opp } = setup([]);
    s.players[ap]!.hand = [];
    const attacker = putOnBattlefield(s, ap, ogre);
    const a = putOnBattlefield(s, opp, abu());
    s = combat(s, ap, [{ attacker, defender: opp }], opp, [{ blocker: a, attacker }]);
    for (let i = 0; i < 40 && zone(s, a) === "battlefield"; i++) s = s.pending ? settle(s) : act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(s);
    expect(zone(s, a)).toBe("graveyard");
    expect(zone(s, attacker)).toBe("graveyard");
  });

  it("Abu Ja'far: dying out of combat destroys nothing", () => {
    let { s, ap, opp, ids } = setup([kill]);
    const a = putOnBattlefield(s, ap, abu());
    const b = putOnBattlefield(s, opp, bear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(a)])));
    expect(zone(s, a)).toBe("graveyard");
    expect(zone(s, b)).toBe("battlefield");
  });

  it("Swat Away: the owner of target creature puts it on the top or bottom of their library, their choice", () => {
    let { s, ap, opp, ids } = setup([swat()]);
    const b = putOnBattlefield(s, opp, bear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(b)])), { me: [opp] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "topOrBottom" });
    s = settle(act(s, { type: "chooseOption", player: opp, choice: "bottom" }));
    expect(zone(s, b)).toBe("library");
    expect(s.players[opp]!.library.at(-1)).toBe(b);
  });

  it("Swat Away: target spell leaves the stack for its owner's library", () => {
    let { s, ap, ids } = setup([draw, swat()]);
    s = run(s, planCast(s, ap, ids[0]!));
    const item = s.stack.at(-1)!;
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: item.id }])), { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "topOrBottom" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "top" }));
    expect(zone(s, ids[0]!)).toBe("library");
    expect(s.players[ap]!.library[0]).toBe(ids[0]);
  });

  it("Scrib Nibblers: exiles the top card of target player's library, and you gain 1 life only if it's a land card", () => {
    for (const top of [land, bear()]) {
      let { s, ap, opp } = setup([]);
      const n = putOnBattlefield(s, ap, scrib());
      const c = into(s, opp, top, "library");
      const life = s.players[ap]!.life;
      s = settle(run(s, planActivate(s, ap, n, 0, [player(opp)])));
      expect(zone(s, c)).toBe("exile");
      expect(s.players[ap]!.life, top.name).toBe(life + (top === land ? 1 : 0));
    }
  });

  it("Grimdancer: enters with your choice of two different counters from among menace, deathtouch and lifelink", () => {
    let { s, ap, ids } = setup([grim()]);
    s = settle(run(s, planCast(s, ap, ids[0]!)), { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "counterChoice", options: ["menace|deathtouch", "menace|lifelink", "deathtouch|lifelink"] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "deathtouch|lifelink" }));
    expect(s.objects[ids[0]!]!.counters).toMatchObject({ deathtouch: 1, lifelink: 1 });
    expect(s.objects[ids[0]!]!.counters.menace ?? 0).toBe(0);
  });

  it("Grimdancer: a bot picks menace and deathtouch", () => {
    let { s, ap, ids } = setup([grim()]);
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.counters).toMatchObject({ menace: 1, deathtouch: 1 });
  });

  it("Laquatus's Creativity: target player draws as many cards as were in their hand, then discards that many", () => {
    let { s, ap, opp, ids } = setup([laq()]);
    trimHand(s, opp);
    for (let i = 0; i < 3; i++) into(s, opp, bear(), "hand");
    const yard = s.players[opp]!.graveyard.length;
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    // Three drawn (six in hand), then three discarded: the count isn't taken again after the draw.
    expect(s.players[opp]!.hand.length).toBe(3);
    expect(s.players[opp]!.graveyard.length).toBe(yard + 3);
  });

  it("Garza's Assassin: recover by paying half your life, rounded up, or it's exiled", () => {
    for (const pay of [true, false]) {
      let { s, ap, ids } = setup([kill]);
      s.players[ap]!.life = 25;
      const g = into(s, ap, garza(), "graveyard");
      const b = putOnBattlefield(s, ap, bear());
      s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(b)])), { may: pay });
      expect(zone(s, g), String(pay)).toBe(pay ? "hand" : "exile");
      expect(s.players[ap]!.life).toBe(pay ? 12 : 25);
    }
  });

  it("Vexing Sphinx: cumulative upkeep of discarding a card for each age counter, or it's sacrificed and you draw for each", () => {
    for (const cards of [2, 1]) {
      let { s, ap } = setup([]);
      const v = putOnBattlefield(s, ap, sphinx());
      s.objects[v]!.counters.age = 1;
      trimHand(s, ap);
      for (let i = 0; i < cards; i++) into(s, ap, spell, "hand");
      s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
      trimHand(s, ap);
      for (let i = 0; i < cards; i++) into(s, ap, spell, "hand");
      s = settle(passUntil(s, "upkeep", ap), { me: [ap] });
      if (cards === 2) {
        // Two age counters: discard two cards, or it's sacrificed.
        expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "punisher", labels: ["Discard 2 cards", "Don't"] });
        s = settle(act(s, { type: "chooseOption", player: ap, choice: "0" }), { me: [ap] });
        if (s.pending) s = act(s, { type: "discard", player: ap, objectIds: s.players[ap]!.hand.slice(0, 2) });
        s = settle(s);
      }
      // With one card in hand, two can't be discarded (CR 701.9b): it's sacrificed, and draws two as it dies.
      expect(zone(s, v), String(cards)).toBe(cards === 2 ? "battlefield" : "graveyard");
      expect(s.players[ap]!.hand.length, String(cards)).toBe(cards === 2 ? 0 : 3);
    }
  });

  it("Polar Kraken: cumulative upkeep of sacrificing a land for each age counter", () => {
    let { s, ap } = setup([]);
    const k = putOnBattlefield(s, ap, kraken());
    const lands = () => s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Land")).length;
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    const before = lands();
    s = settle(passUntil(s, "upkeep", ap));
    expect(zone(s, k)).toBe("battlefield");
    expect(s.objects[k]!.counters.age).toBe(1);
    expect(lands()).toBe(before - 1);
  });

  it("Searing Blood: when the target dies this turn, 3 damage to its controller, whatever kills it", () => {
    for (const target of ["bear", "ogre"] as const) {
      let { s, ap, opp, ids } = setup([searing(), kill]);
      const c = putOnBattlefield(s, opp, target === "bear" ? bear() : ogre);
      const life = s.players[opp]!.life;
      s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(c)])));
      expect(zone(s, c)).toBe(target === "bear" ? "graveyard" : "battlefield");
      expect(s.players[opp]!.life).toBe(target === "bear" ? life - 3 : life);
      if (target === "ogre") {
        // The 3/3 survives the 2 damage; destroyed later this turn, it still triggers (rulings).
        s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(c)])));
        expect(zone(s, c)).toBe("graveyard");
        expect(s.players[opp]!.life).toBe(life - 3);
      }
    }
  });

  it("Searing Blood: the delayed trigger ends with the turn", () => {
    let { s, ap, opp, ids } = setup([searing()]);
    const c = putOnBattlefield(s, opp, ogre);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(c)])));
    s = passUntil(s, "main1", opp);
    const life = s.players[opp]!.life;
    const k = into(s, opp, kill, "hand");
    s = settle(run(s, planCast(s, opp, k, [tgt(c)])));
    expect(zone(s, c)).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life);
  });

  it("Credit Voucher: shuffle any number of cards from your hand into your library, then draw that many", () => {
    let { s, ap } = setup([]);
    trimHand(s, ap);
    const hand = [into(s, ap, spell, "hand"), into(s, ap, spell, "hand"), into(s, ap, spell, "hand")];
    const v = putOnBattlefield(s, ap, voucher());
    const library = s.players[ap]!.library.length;
    s = settle(run(s, planActivate(s, ap, v, 0)), { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", fromHand: true, shuffle: true, min: 0, max: 3 });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: hand.slice(0, 2) }));
    expect(s.players[ap]!.hand.length).toBe(3);
    expect(s.players[ap]!.library.length).toBe(library);
    expect(zone(s, v)).toBe("graveyard");
  });

  it("Credit Voucher: shuffling none draws none", () => {
    let { s, ap } = setup([]);
    trimHand(s, ap);
    into(s, ap, spell, "hand");
    const v = putOnBattlefield(s, ap, voucher());
    s = settle(run(s, planActivate(s, ap, v, 0)), { me: [ap] });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }));
    expect(s.players[ap]!.hand.length).toBe(1);
  });

  it("Alluring Siren: target creature an opponent controls attacks you this turn if able", () => {
    let { s, ap, opp } = setup([]);
    const siren0 = putOnBattlefield(s, ap, siren());
    const b = putOnBattlefield(s, opp, bear());
    expect(planActivate(s, ap, siren0, 0, [tgt(putOnBattlefield(s, ap, bear()))])).toBeNull();
    s = settle(run(s, planActivate(s, ap, siren0, 0, [tgt(b)])));
    expect(mustAttackPlayers(s, s.objects[b]!)).toEqual([ap]);
    s = passUntil(s, "main1", opp);
    expect(mustAttackPlayers(s, s.objects[b]!)).toEqual([]);
  });

  it("Nullmage Advocate: two target cards from one opponent's graveyard go to their hand; target artifact is destroyed", () => {
    let { s, ap, opp } = setup([]);
    const third = s.turnOrder[(s.turnOrder.indexOf(ap) + 2) % 4]!;
    const n = putOnBattlefield(s, ap, nullmage());
    const c1 = into(s, opp, spell, "graveyard");
    const c2 = into(s, opp, bear(), "graveyard");
    const other = into(s, third, spell, "graveyard");
    const r = putOnBattlefield(s, third, rock);
    // Both from the same graveyard (rulings).
    expect(planActivate(s, ap, n, 0, [tgt(c1), tgt(other), tgt(r)])).toBeNull();
    s = settle(run(s, planActivate(s, ap, n, 0, [tgt(c1), tgt(c2), tgt(r)])));
    expect(zone(s, c1)).toBe("hand");
    expect(zone(s, c2)).toBe("hand");
    expect(s.players[opp]!.hand).toContain(c1);
    expect(zone(s, r)).toBe("graveyard");
  });

  it("Deadeye Tracker: its two target cards must be in a single opponent's graveyard (rulings)", () => {
    const { s, ap, opp } = setup([]);
    const third = s.turnOrder[(s.turnOrder.indexOf(ap) + 2) % 4]!;
    const t = putOnBattlefield(s, ap, tracker());
    const c1 = into(s, opp, spell, "graveyard");
    const c2 = into(s, opp, spell, "graveyard");
    const other = into(s, third, spell, "graveyard");
    expect(planActivate(s, ap, t, 0, [tgt(c1), tgt(other)])).toBeNull();
    expect(planActivate(s, ap, t, 0, [tgt(c1), tgt(c2)])).not.toBeNull();
  });

  it("Spurnmage Advocate: destroys target attacking creature even if both cards left the graveyard", () => {
    let { s, ap, opp } = setup([]);
    s.players[ap]!.hand = [];
    const sp = putOnBattlefield(s, opp, spurnmage());
    const attacker = putOnBattlefield(s, ap, ogre);
    const c1 = into(s, ap, spell, "graveyard");
    const c2 = into(s, ap, spell, "graveyard");
    s = combat(s, ap, [{ attacker, defender: opp }], opp, []);
    expect(s.objects[attacker]!.attacking).toBe(opp);
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    // The cards leave the graveyard before it resolves: the attacker is still destroyed (rulings).
    s = run(s, planActivate(s, opp, sp, 0, [tgt(c1), tgt(c2), tgt(attacker)]));
    for (const c of [c1, c2]) {
      s.players[ap]!.graveyard.splice(s.players[ap]!.graveyard.indexOf(c), 1);
      s.objects[c]!.zone = "exile";
      s.players[ap]!.exile.push(c);
      s.objects[c]!.zoneChanges = (s.objects[c]!.zoneChanges ?? 0) + 1;
    }
    s = settle(s);
    expect(zone(s, attacker)).toBe("graveyard");
  });

  it("Public Enemy: every creature attacks the enchanted creature's controller each combat if able, but not their own", () => {
    const { s, ap, opp } = setup([]);
    const third = s.turnOrder[(s.turnOrder.indexOf(ap) + 2) % 4]!;
    const b = putOnBattlefield(s, opp, bear());
    const e = putOnBattlefield(s, ap, enemy());
    s.objects[e]!.attachedTo = b;
    const mine = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, third, bear());
    invalidateCharacteristics(s);
    expect(mustAttackPlayers(s, s.objects[mine]!)).toEqual([opp]);
    expect(mustAttackPlayers(s, s.objects[theirs]!)).toEqual([opp]);
    expect(mustAttackPlayers(s, s.objects[b]!)).toEqual([]);
  });
});
