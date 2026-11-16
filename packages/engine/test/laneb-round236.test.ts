// Lane B round B236: Primitive Justice (two additional costs, each any number of times, more targets for each), Enduring
// Renewal (draws replaced by a reveal, creatures milled instead), Diabolic Servitude (the creature it returned, tracked) and
// Mana Cache (a mana ability any player may activate).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, handRevealed, invalidateCharacteristics, isFullySupported, manaAbilityProblem, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const primitiveJustice = (): CardDef => ({"oracleId":"cf38ac6e-e370-4ca5-90cd-26a1b812c63a","name":"Primitive Justice","manaCost":"{1}{R}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"As an additional cost to cast this spell, you may pay {1}{R} and/or {1}{G} any number of times.\nDestroy target artifact. For each additional {1}{R} you paid, destroy another target artifact. For each additional {1}{G} you paid, destroy another target artifact, and you gain 1 life.","colors":["R"],"colorIdentity":["G","R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/6/d6b7829b-2a10-47e7-9cf9-8ae49d2b398a.jpg?1783947177","artUrl":"https://cards.scryfall.io/art_crop/front/d/6/d6b7829b-2a10-47e7-9cf9-8ae49d2b398a.jpg?1783947177","commanderLegal":"legal","set":"all","releasedAt":"1996-06-10","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const mindStone = (): CardDef => ({"oracleId":"c97361b5-af16-4a7b-af85-a429dbaf4ad2","name":"Mind Stone","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/7/f/7fdef0b6-a3b9-4752-bce6-53c0140a1693.jpg?1783906237","artUrl":"https://cards.scryfall.io/art_crop/front/7/f/7fdef0b6-a3b9-4752-bce6-53c0140a1693.jpg?1783906237","commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const enduringRenewal = (): CardDef => ({"oracleId":"47a080c4-ff04-4f52-aca0-2b8e4f4d931e","name":"Enduring Renewal","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Play with your hand revealed.\nIf you would draw a card, reveal the top card of your library instead. If it's a creature card, put it into your graveyard. Otherwise, draw a card.\nWhenever a creature is put into your graveyard from the battlefield, return it to your hand.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/e/be77edac-9a8b-4b7f-a859-27df76b10aa6.jpg?1783947526","artUrl":"https://cards.scryfall.io/art_crop/front/b/e/be77edac-9a8b-4b7f-a859-27df76b10aa6.jpg?1783947526","commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bloodScrivener = (): CardDef => ({"oracleId":"af66da4b-2f36-4dd2-a5c6-18e6023c5aba","name":"Blood Scrivener","manaCost":"{1}{B}","cmc":2,"typeLine":"Creature — Zombie Wizard","supertypes":[],"types":["Creature"],"subtypes":["Zombie","Wizard"],"oracleText":"If you would draw a card while you have no cards in hand, instead you draw two cards and you lose 1 life.","power":"2","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/e/9ea8179a-d3c9-4cdc-a5b5-68cc73279050.jpg?1783940040","artUrl":"https://cards.scryfall.io/art_crop/front/9/e/9ea8179a-d3c9-4cdc-a5b5-68cc73279050.jpg?1783940040","commanderLegal":"legal","set":"dgm","releasedAt":"2013-05-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const diabolicServitude = (): CardDef => ({"oracleId":"e275cbfb-3d25-4189-84f0-3162eadc7d65","name":"Diabolic Servitude","manaCost":"{3}{B}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, return target creature card from your graveyard to the battlefield.\nWhen the creature put onto the battlefield with this enchantment dies, exile it and return this enchantment to its owner's hand.\nWhen this enchantment leaves the battlefield, exile the creature put onto the battlefield with this enchantment.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/c/0cb1e0c9-9041-44cd-9e96-87cf14c67068.jpg?1783946346","artUrl":"https://cards.scryfall.io/art_crop/front/0/c/0cb1e0c9-9041-44cd-9e96-87cf14c67068.jpg?1783946346","commanderLegal":"legal","set":"usg","releasedAt":"1998-10-12","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const akromasVengeance = (): CardDef => ({"oracleId":"ae19dce5-c9fc-4fbe-99b5-dc6a12124a68","name":"Akroma's Vengeance","manaCost":"{4}{W}{W}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Destroy all artifacts, creatures, and enchantments.\nCycling {3} ({3}, Discard this card: Draw a card.)","colors":["W"],"colorIdentity":["W"],"keywords":["Cycling"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4f112edd-1d2f-45ad-aaeb-6c0934d24c1f.jpg?1783939877","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4f112edd-1d2f-45ad-aaeb-6c0934d24c1f.jpg?1783939877","commanderLegal":"legal","set":"v13","releasedAt":"2013-08-23","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const disenchant = (): CardDef => ({"oracleId":"a7e97fa9-4b72-4548-b854-5be5f18a6f1a","name":"Disenchant","manaCost":"{1}{W}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target artifact or enchantment.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/5/658c5caa-d739-4d30-a512-43ac4de900cb.jpg?1783920133","artUrl":"https://cards.scryfall.io/art_crop/front/6/5/658c5caa-d739-4d30-a512-43ac4de900cb.jpg?1783920133","commanderLegal":"legal","set":"bro","releasedAt":"2022-11-18","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const unsummon = (): CardDef => ({"oracleId":"837182db-1bf3-4a2c-bd01-1af9d9873561","name":"Unsummon","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Return target creature to its owner's hand.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddad9f16-52d5-49de-82b0-b1a5294a9c44.jpg?1789556722","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddad9f16-52d5-49de-82b0-b1a5294a9c44.jpg?1789556722","commanderLegal":"legal","set":"fra","releasedAt":"2026-10-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const manaCache = (): CardDef => ({"oracleId":"1c09f2d1-413b-4a92-aa39-99c1a2106814","name":"Mana Cache","manaCost":"{1}{R}{R}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of each player's end step, put a charge counter on this enchantment for each untapped land that player controls.\nRemove a charge counter from this enchantment: Add {C}. Any player may activate this ability but only during their turn before the end step.","colors":["R"],"colorIdentity":["R"],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/5/8/583a33b3-7833-48e5-88c3-849a5771ef6e.jpg?1783945818","artUrl":"https://cards.scryfall.io/art_crop/front/5/8/583a33b3-7833-48e5-88c3-849a5771ef6e.jpg?1783945818","commanderLegal":"legal","set":"nem","releasedAt":"2000-02-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

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
/** A new card on top of `pid`'s library. */
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  invalidateCharacteristics(s);
  return id;
};
/** Only these cards stay in `pid`'s hand; the rest go to the bottom of the library. */
const onlyInHand = (s: GameState, pid: PlayerId, keep: string[]) => {
  const p = s.players[pid]!;
  for (const id of p.hand.filter((x) => !keep.includes(x))) (s.objects[id]!.zone = "library"), p.library.push(id);
  p.hand = p.hand.filter((x) => keep.includes(x));
  // The commander stays out of the way too.
  for (const id of p.command) (s.objects[id]!.zone = "exile"), p.exile.push(id);
  p.command = [];
};

describe("Lane B round B236", () => {
  it("are fully supported", () => supported(primitiveJustice(), enduringRenewal(), diabolicServitude(), manaCache()));
});

describe("Lane B round B236: Primitive Justice", () => {
  const game = () => {
    const { s, ap, ids, opp } = setup([primitiveJustice()]);
    const arts = [solRing(), mindStone(), ornithopter(), solRing()].map((d) => putOnBattlefield(s, opp, d));
    return { s, ap, id: ids[0]!, opp, arts };
  };

  it("one target more for each cost paid, all different; 1 life for each {1}{G}", () => {
    const { s: s0, ap, id, arts } = game();
    const kicks = { kicks: [0, 1, 1] };
    // Three costs paid: four targets, no fewer, all different (rulings).
    expect(planCast(s0, ap, id, arts.slice(0, 3).map(tgt), undefined, "auto", undefined, kicks)).toBeNull();
    expect(planCast(s0, ap, id, [arts[0]!, arts[1]!, arts[2]!, arts[0]!].map(tgt), undefined, "auto", undefined, kicks)).toBeNull();
    const life = s0.players[ap]!.life;
    const plan = planCast(s0, ap, id, arts.map(tgt), undefined, "auto", undefined, kicks);
    // {1}{R} plus {1}{R} plus {1}{G} twice: eight lands tapped.
    const s1 = run(s0, plan);
    expect(s1.battlefield.filter((x) => s1.objects[x]!.controller === ap && s1.objects[x]!.tapped).length).toBe(8);
    const s = settle(s1);
    for (const a of arts) expect(zone(s, a)).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(life + 2);
  });

  it("not paid: one target and no life", () => {
    const { s: s0, ap, id, arts } = game();
    expect(planCast(s0, ap, id, arts.slice(0, 2).map(tgt))).toBeNull();
    const life = s0.players[ap]!.life;
    const s = settle(run(s0, planCast(s0, ap, id, [tgt(arts[1]!), { kind: "none" }])));
    expect(zone(s, arts[1]!)).toBe("graveyard");
    expect(zone(s, arts[0]!)).toBe("battlefield");
    expect(s.players[ap]!.life).toBe(life);
  });

  it("an illegal target isn't destroyed, and the {1}{G}'s life is still gained", () => {
    const { s: s0, ap, id, arts } = game();
    const life = s0.players[ap]!.life;
    let s = run(s0, planCast(s0, ap, id, [tgt(arts[0]!), tgt(arts[1]!)], undefined, "auto", undefined, { kicks: [1] }));
    // The second target leaves before it resolves.
    s.objects[arts[1]!]!.zone = "graveyard";
    s.battlefield.splice(s.battlefield.indexOf(arts[1]!), 1);
    s.players[s.objects[arts[1]!]!.owner]!.graveyard.push(arts[1]!);
    s = settle(s);
    expect(zone(s, arts[0]!)).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(life + 1);
  });

  it("a bot pays the costs for more artifacts", () => {
    const { s: s0, ap, id, arts } = game();
    onlyInHand(s0, ap, [id]);
    let s = s0;
    for (let i = 0; i < 5 && s.stack.length === 0; i++) for (const a of botActions(s, ap)) if (s.stack.length === 0) s = act(s, a);
    expect(s.stack.length).toBe(1);
    s = settle(s);
    // The Ornithopter isn't worth a {1}{R} or {1}{G} to it.
    expect(arts.filter((a) => zone(s, a) === "graveyard").length).toBe(3);
    expect(s.players[ap]!.life).toBeGreaterThan(s0.players[ap]!.life);
    expect(s.log.some((l) => l.text.startsWith(`${s.players[ap]!.name} casts Primitive Justice, paying the additional {1}{G} twice targeting`))).toBe(true);
    expect(zone(s, id)).toBe("graveyard");
  });
});

describe("Lane B round B236: Enduring Renewal", () => {
  /** `ap` controls Enduring Renewal (and `more`), with Divination in hand and `top` on top of their library, first on top. */
  const game = (top: CardDef[], more: CardDef[] = []) => {
    const { s, ap, ids, opp } = setup([divination()]);
    const renewal = putOnBattlefield(s, ap, enduringRenewal());
    const others = more.map((d) => putOnBattlefield(s, ap, d));
    const tops = [...top].reverse().map((d) => onTop(s, ap, d)).reverse();
    return { s, ap, div: ids[0]!, opp, renewal, others, tops };
  };

  it("each draw reveals the top card instead: a creature card goes into the graveyard, any other card is drawn", () => {
    const { s: s0, ap, div, tops } = game([grizzlyBears(), lightningBolt(), grizzlyBears()]);
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planCast(s0, ap, div)));
    // Divination's two draws: the Bears milled, then the Bolt revealed and drawn; the second Bears stays on top.
    expect(zone(s, tops[0]!)).toBe("graveyard");
    expect(zone(s, tops[1]!)).toBe("hand");
    expect(s.players[ap]!.library[0]).toBe(tops[2]);
    expect(s.players[ap]!.hand.length).toBe(hand); // Divination left, the Bolt came
    expect(s.log.some((l) => l.text.includes("reveals Grizzly Bears from the top of their library instead of drawing and puts it into their graveyard (Enduring Renewal)"))).toBe(true);
    expect(s.log.some((l) => l.text.includes("reveals Lightning Bolt from the top of their library instead of drawing, then draws a card (Enduring Renewal)"))).toBe(true);
  });

  it("with two of them, the draw the first makes is replaced by the second, and the card is still drawn once", () => {
    const { s: s0, ap, div, tops } = game([lightningBolt(), grizzlyBears(), grizzlyBears()], [enduringRenewal()]);
    const s = settle(run(s0, planCast(s0, ap, div)));
    // First draw: the Bolt, revealed twice and drawn; second draw: the Bears milled.
    expect(zone(s, tops[0]!)).toBe("hand");
    expect(zone(s, tops[1]!)).toBe("graveyard");
    expect(zone(s, tops[2]!)).toBe("library");
    expect(s.log.filter((l) => l.text.includes("reveals Lightning Bolt")).length).toBe(2);
  });

  it("its controller plays with their hand revealed, to every player", () => {
    const { s, ap, opp } = game([]);
    expect(handRevealed(s, ap, opp)).toBe(true);
    expect(handRevealed(s, opp, ap)).toBe(false);
  });

  it("a creature of its controller's that dies returns to their hand", () => {
    const { s: s0, ap } = game([]);
    const bear = putOnBattlefield(s0, ap, grizzlyBears());
    const { s: s1 } = { s: s0 };
    const bolt = onTop(s1, ap, lightningBolt());
    s1.objects[bolt]!.zone = "hand";
    s1.players[ap]!.library.shift();
    s1.players[ap]!.hand.push(bolt);
    const s = settle(run(s1, planCast(s1, ap, bolt, [tgt(bear)])));
    expect(zone(s, bear)).toBe("hand");
  });

  it("from an empty library, no card is revealed and the draw it makes is one the player can't make", () => {
    const { s: s0, ap, div } = game([]);
    const p = s0.players[ap]!;
    for (const id of p.library) s0.objects[id]!.zone = "exile";
    p.exile.push(...p.library);
    p.library = [];
    const s = settle(run(s0, planCast(s0, ap, div)));
    expect(s.log.some((l) => l.text.includes("reveals no card from their empty library instead of drawing, then draws a card (Enduring Renewal)"))).toBe(true);
    expect(s.players[ap]!.lost).toBe(true);
  });

  it("with Blood Scrivener and an empty hand, its player chooses which replaces the draw first", () => {
    const { s: s0, ap, div, tops } = game([grizzlyBears(), lightningBolt(), lightningBolt(), lightningBolt()], [bloodScrivener()]);
    onlyInHand(s0, ap, [div]);
    let s = run(s0, planCast(s0, ap, div));
    s = settle(s, ap);
    // Divination left the hand empty: both replace its first draw.
    const p = s.pending;
    expect(p?.kind).toBe("drawInstead");
    if (p?.kind !== "drawInstead") return;
    expect(p.options).toContain("renewal");
    expect(p.options).toContain("scrivener");
    // The Scrivener first: two draws and 1 life; each still replaced by Enduring Renewal (another replacement, CR 614.5).
    s = act(s, { type: "drawInstead", player: ap, choice: "scrivener" });
    s = settle(s);
    expect(s.players[ap]!.life).toBe(s0.players[ap]!.life - 1);
    expect(zone(s, tops[0]!)).toBe("graveyard");
    expect(zone(s, tops[1]!)).toBe("hand");
  });
});

describe("Lane B round B236: Diabolic Servitude", () => {
  /** `ap` has Diabolic Servitude and `more` in hand and Grizzly Bears in their graveyard; Servitude is cast, returning it. */
  const game = (more: CardDef[] = []) => {
    const { s: s0, ap, ids, opp } = setup([diabolicServitude(), ...more]);
    const bear = onTop(s0, ap, grizzlyBears());
    const p = s0.players[ap]!;
    p.library.shift();
    s0.objects[bear]!.zone = "graveyard";
    p.graveyard.push(bear);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    return { s, ap, opp, servitude: ids[0]!, more: ids.slice(1), bear };
  };

  it("returns the creature card; when that creature dies, it's exiled and Servitude returns to its owner's hand", () => {
    const { s: s0, ap, servitude, bear, more } = game([lightningBolt()]);
    expect(zone(s0, bear)).toBe("battlefield");
    expect(zone(s0, servitude)).toBe("battlefield");
    const s = settle(run(s0, planCast(s0, ap, more[0]!, [tgt(bear)])));
    expect(zone(s, bear)).toBe("exile");
    expect(zone(s, servitude)).toBe("hand");
  });

  it("when Servitude leaves the battlefield, the creature is exiled", () => {
    const { s: s0, ap, servitude, bear, more } = game([disenchant()]);
    const s = settle(run(s0, planCast(s0, ap, more[0]!, [tgt(servitude)])));
    expect(zone(s, servitude)).toBe("graveyard");
    expect(zone(s, bear)).toBe("exile");
  });

  it("a creature returned to its owner's hand is lost track of: it isn't exiled later, and a new one can't be", () => {
    const { s: s0, ap, servitude, bear, more } = game([unsummon(), disenchant()]);
    let s = settle(run(s0, planCast(s0, ap, more[0]!, [tgt(bear)])));
    expect(zone(s, bear)).toBe("hand");
    s = settle(run(s, planCast(s, ap, more[1]!, [tgt(servitude)])));
    expect(zone(s, servitude)).toBe("graveyard");
    expect(zone(s, bear)).toBe("hand");
  });

  it("destroyed together: the creature card is exiled, but Servitude, a new object in the graveyard, stays there", () => {
    const { s: s0, ap, servitude, bear, more } = game([akromasVengeance()]);
    const s = settle(run(s0, planCast(s0, ap, more[0]!)));
    expect(zone(s, bear)).toBe("exile");
    expect(zone(s, servitude)).toBe("graveyard");
  });

  it("gone before its enters ability resolves: the creature returns and stays, and its death later does nothing", () => {
    const { s: s0, ap, ids } = setup([diabolicServitude(), disenchant(), lightningBolt()]);
    const bear = onTop(s0, ap, grizzlyBears());
    const p = s0.players[ap]!;
    p.library.shift();
    s0.objects[bear]!.zone = "graveyard";
    p.graveyard.push(bear);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    // Servitude resolves; its enters ability waits on the stack.
    for (let i = 0; i < 20 && !(s.stack.length === 1 && zone(s, ids[0]!) === "battlefield" && !s.pending); i++)
      s = act(s, s.pending?.kind === "chooseTargets" ? { type: "chooseTargets", player: ap, targets: [tgt(bear)] } : { type: "passPriority", player: waitingOn(s)! });
    expect(s.stack.length).toBe(1);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(ids[0]!)])));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(zone(s, bear)).toBe("battlefield");
    s = settle(run(s, planCast(s, ap, ids[2]!, [tgt(bear)])));
    expect(zone(s, bear)).toBe("graveyard");
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });
});

describe("Lane B round B236: Mana Cache", () => {
  const game = () => {
    const { s, ap, opp } = setup([]);
    const cache = putOnBattlefield(s, ap, manaCache());
    return { s, ap, opp, cache };
  };
  const removeOne = (pid: PlayerId, cache: string): Action => ({ type: "activateMana", player: pid, objectId: cache, mana: "C", ability: 0 });

  it("at each player's end step, a charge counter for each untapped land that player controls", () => {
    const { s: s0, ap, cache } = game();
    // The active player's 14 lands, all untapped.
    const s = passUntil(s0, "cleanup", ap);
    expect(s.objects[cache]!.counters.charge).toBe(14);
  });

  it("its controller removes a counter for {C} during their turn before the end step", () => {
    const { s: s0, ap, cache } = game();
    s0.objects[cache]!.counters.charge = 2;
    const s = act(s0, removeOne(ap, cache));
    expect(s.objects[cache]!.counters.charge).toBe(1);
    expect(s.players[ap]!.manaPool.C).toBe(1);
  });

  it("any other player may activate it during their own turn, getting the mana; not during another player's turn", () => {
    const { s: s0, ap, opp, cache } = game();
    s0.objects[cache]!.counters.charge = 3;
    // Not during the controller's turn.
    expect(manaAbilityProblem(s0, opp, s0.objects[cache]!, 0)).toMatch(/can.t be activated now/);
    let s = passUntil(s0, "main1", opp);
    s.objects[cache]!.counters.charge = 3; // past its controller's end step, which added more
    s = act(s, removeOne(opp, cache));
    expect(s.objects[cache]!.counters.charge).toBe(2);
    expect(s.players[opp]!.manaPool.C).toBe(1);
    expect(s.objects[cache]!.controller).toBe(ap);
    // The controller can't on that turn.
    expect(manaAbilityProblem(s, ap, s.objects[cache]!, 0)).toMatch(/can.t be activated now/);
  });

  it("not during the end step", () => {
    const { s: s0, ap, cache } = game();
    s0.objects[cache]!.counters.charge = 3;
    let s = passUntil(s0, "end", ap);
    // Its own end step trigger puts counters on it; still none can be removed now.
    expect(manaAbilityProblem(s, ap, s.objects[cache]!, 0)).toMatch(/can.t be activated now/);
  });

  it("another player's payment can use it automatically", () => {
    const { s: s0, opp, cache } = game();
    let s = passUntil(s0, "main1", opp);
    s.objects[cache]!.counters.charge = 2;
    // Their lands are all tapped: only the Cache's two counters can pay for Mind Stone.
    for (const id of s.battlefield) if (s.objects[id]!.controller === opp) s.objects[id]!.tapped = true;
    const p = s.players[opp]!;
    const stone = onTop(s, opp, mindStone());
    p.library.shift();
    s.objects[stone]!.zone = "hand";
    p.hand.push(stone);
    const plan = planCast(s, opp, stone);
    // Activated twice, once for each counter it has (no {T} in its cost).
    expect(plan!.filter((a) => a.type === "activateMana" && a.objectId === cache).length).toBe(2);
    expect(plan).not.toBeNull();
    s = settle(run(s, plan));
    expect(zone(s, stone)).toBe("battlefield");
    expect(s.objects[cache]!.counters.charge ?? 0).toBe(0);
  });
});
