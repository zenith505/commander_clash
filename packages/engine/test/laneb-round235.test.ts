// Lane B round B235: Whippoorwill (damage to a creature this turn can't be prevented or redirected, it can't be
// regenerated, and it's exiled if it dies this turn), Reflecting Mirror (X set by the target spell; its target changed from
// you to another player) and Blood Scrivener (a draw with an empty hand replaced by two draws and a life loss).

import { describe, expect, it } from "vitest";
import { act, mountain, putOnBattlefield, setup } from "./helpers";
import { botActions, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const whippoorwill = (): CardDef => ({"oracleId":"84050a10-e1f1-413e-aa21-5c1f47bb2a64","name":"Whippoorwill","manaCost":"{G}","cmc":1,"typeLine":"Creature — Bird","supertypes":[],"types":["Creature"],"subtypes":["Bird"],"oracleText":"{G}{G}, {T}: Target creature can't be regenerated this turn. Damage that would be dealt to that creature this turn can't be prevented or dealt instead to another permanent or player. When the creature dies this turn, exile the creature.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/5/e56146bf-5db0-4bef-83bb-efa5ebec6684.jpg?1783947929","artUrl":"https://cards.scryfall.io/art_crop/front/e/5/e56146bf-5db0-4bef-83bb-efa5ebec6684.jpg?1783947929","commanderLegal":"legal","set":"drk","releasedAt":"1994-08-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const paladinEnVec = (): CardDef => ({"oracleId":"fd8722e1-9c41-4037-ab7e-47e2aa9858a0","name":"Paladin en-Vec","manaCost":"{1}{W}{W}","cmc":3,"typeLine":"Creature — Human Knight","supertypes":[],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"First strike, protection from black and from red (This creature deals combat damage before creatures without first strike. It can't be blocked, targeted, dealt damage, or enchanted by anything black or red.)","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["First strike","Protection"],"imageUrl":"https://cards.scryfall.io/normal/front/a/e/aea1a8e1-35f4-4b4a-aa68-21b5219527a9.jpg?1783943075","artUrl":"https://cards.scryfall.io/art_crop/front/a/e/aea1a8e1-35f4-4b4a-aa68-21b5219527a9.jpg?1783943075","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const shamanEnKor = (): CardDef => ({"oracleId":"4d9d5dbb-25ab-41a5-a277-3ee5f9ef579b","name":"Shaman en-Kor","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Kor Cleric Shaman","supertypes":[],"types":["Creature"],"subtypes":["Kor","Cleric","Shaman"],"oracleText":"{0}: The next 1 damage that would be dealt to this creature this turn is dealt to target creature you control instead.\n{1}{W}: The next time a source of your choice would deal damage to target creature this turn, that damage is dealt to this creature instead.","power":"1","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/9/a9a13c4c-d5c0-4947-bb68-d2e9611bcdea.jpg?1783946573","artUrl":"https://cards.scryfall.io/art_crop/front/a/9/a9a13c4c-d5c0-4947-bb68-d2e9611bcdea.jpg?1783946573","commanderLegal":"legal","set":"sth","releasedAt":"1998-03-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const drudgeSkeletons = (): CardDef => ({"oracleId":"c180ed02-07f4-4538-9bea-8c249234a8e2","name":"Drudge Skeletons","manaCost":"{1}{B}","cmc":2,"typeLine":"Creature — Skeleton","supertypes":[],"types":["Creature"],"subtypes":["Skeleton"],"oracleText":"{B}: Regenerate this creature. (The next time this creature would be destroyed this turn, instead tap it, remove it from combat, and heal all damage on it.)","power":"1","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Heal","Regenerate"],"imageUrl":"https://cards.scryfall.io/normal/front/4/2/425836be-f5cd-4584-a2ff-a8cf166eccc0.jpg?1783942382","artUrl":"https://cards.scryfall.io/art_crop/front/4/2/425836be-f5cd-4584-a2ff-a8cf166eccc0.jpg?1783942382","commanderLegal":"legal","set":"m10","releasedAt":"2009-07-17","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const healingSalve = (): CardDef => ({"oracleId":"8da8644c-75a1-4fe9-8e94-900d948d631c","name":"Healing Salve","manaCost":"{W}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose one —\n• Target player gains 3 life.\n• Prevent the next 3 damage that would be dealt to any target this turn.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/9/89146f6a-583f-4ed1-8b43-75e9a55892c6.jpg?1783946374","artUrl":"https://cards.scryfall.io/art_crop/front/8/9/89146f6a-583f-4ed1-8b43-75e9a55892c6.jpg?1783946374","commanderLegal":"legal","set":"usg","releasedAt":"1998-10-12","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const pyroclasm = (): CardDef => ({"oracleId":"e4bcd4ea-e7cd-4471-8f3b-18bb51d3d70c","name":"Pyroclasm","manaCost":"{1}{R}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Pyroclasm deals 2 damage to each creature.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/4391b0af-2f26-4a45-9e2a-5bd8e9838107.jpg?1783909464","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/4391b0af-2f26-4a45-9e2a-5bd8e9838107.jpg?1783909464","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const reflectingMirror = (): CardDef => ({"oracleId":"2fb505c6-3d28-4b83-9820-4b9db64c8304","name":"Reflecting Mirror","manaCost":"{4}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{X}, {T}: Change the target of target spell with a single target if that target is you. The new target must be a player. X is twice the mana value of that spell.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/5/d551ff93-d8da-4c21-bc3c-6451c0dde07e.jpg?1783947925","artUrl":"https://cards.scryfall.io/art_crop/front/d/5/d551ff93-d8da-4c21-bc3c-6451c0dde07e.jpg?1783947925","commanderLegal":"legal","set":"drk","releasedAt":"1994-08-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const blaze = (): CardDef => ({"oracleId":"0596920f-9946-42f4-a03b-24aab67f9f1b","name":"Blaze","manaCost":"{X}{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Blaze deals X damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/9/3940d0ca-0ca2-4446-9330-a554c3e89824.jpg?1783946468","artUrl":"https://cards.scryfall.io/art_crop/front/3/9/3940d0ca-0ca2-4446-9330-a554c3e89824.jpg?1783946468","commanderLegal":"legal","set":"p02","releasedAt":"1998-06-24","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bloodScrivener = (): CardDef => ({"oracleId":"af66da4b-2f36-4dd2-a5c6-18e6023c5aba","name":"Blood Scrivener","manaCost":"{1}{B}","cmc":2,"typeLine":"Creature — Zombie Wizard","supertypes":[],"types":["Creature"],"subtypes":["Zombie","Wizard"],"oracleText":"If you would draw a card while you have no cards in hand, instead you draw two cards and you lose 1 life.","power":"2","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/e/9ea8179a-d3c9-4cdc-a5b5-68cc73279050.jpg?1783940040","artUrl":"https://cards.scryfall.io/art_crop/front/9/e/9ea8179a-d3c9-4cdc-a5b5-68cc73279050.jpg?1783940040","commanderLegal":"legal","set":"dgm","releasedAt":"2013-05-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const opt = (): CardDef => ({"oracleId":"713332c1-5bd8-400f-bfff-c1ca0697a043","name":"Opt","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","artUrl":"https://cards.scryfall.io/art_crop/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","commanderLegal":"legal","set":"sld","releasedAt":"2025-07-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const golgariThug = (): CardDef => ({"oracleId":"a426a258-fd8b-489c-8642-9868ee47de85","name":"Golgari Thug","manaCost":"{1}{B}","cmc":2,"typeLine":"Creature — Human Warrior","supertypes":[],"types":["Creature"],"subtypes":["Human","Warrior"],"oracleText":"When this creature dies, put target creature card from your graveyard on top of your library.\nDredge 4 (If you would draw a card, you may mill four cards instead. If you do, return this card from your graveyard to your hand.)","power":"1","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Dredge","Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/f/d/fddee704-5315-4b35-9f77-0c12def26ce1.jpg?1783931626","artUrl":"https://cards.scryfall.io/art_crop/front/f/d/fddee704-5315-4b35-9f77-0c12def26ce1.jpg?1783931626","commanderLegal":"legal","set":"sld","releasedAt":"2019-12-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const alhammarretsArchive = (): CardDef => ({"oracleId":"d5c4d36c-54b3-4149-906b-a57a670260fc","name":"Alhammarret's Archive","manaCost":"{5}","cmc":5,"typeLine":"Legendary Artifact","supertypes":["Legendary"],"types":["Artifact"],"subtypes":[],"oracleText":"If you would gain life, you gain twice that much life instead.\nIf you would draw a card except the first one you draw in each of your draw steps, draw two cards instead.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/0/70afb856-6697-411b-b1aa-e9290a0bfd68.jpg?1783938312","artUrl":"https://cards.scryfall.io/art_crop/front/7/0/70afb856-6697-411b-b1aa-e9290a0bfd68.jpg?1783938312","commanderLegal":"legal","set":"ori","releasedAt":"2015-07-17","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;

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

describe("Lane B round B235", () => {
  it("are fully supported", () => supported(whippoorwill(), reflectingMirror(), bloodScrivener()));
});

describe("Lane B round B235: Whippoorwill", () => {
  /** `ap` has Whippoorwill on the battlefield and `hand` in hand; `opp` controls `theirs`. */
  const game = (hand: CardDef[], theirs: CardDef[] = []) => {
    const { s, ap, ids, opp } = setup(hand);
    const bird = putOnBattlefield(s, ap, whippoorwill());
    const others = theirs.map((d) => putOnBattlefield(s, opp, d));
    return { s, ap, ids, opp, bird, others };
  };
  const whip = (s: GameState, ap: PlayerId, bird: string, at: string) => settle(run(s, planActivate(s, ap, bird, 0, [tgt(at)])));

  it("damage to the target can't be prevented by protection, and the creature that dies is exiled", () => {
    const { s: s0, ap, ids, bird, others } = game([pyroclasm()], [paladinEnVec(), paladinEnVec()]);
    let s = whip(s0, ap, bird, others[0]!);
    expect(s.objects[bird]!.tapped).toBe(true);
    expect(s.log.some((l) => /can't be prevented or redirected/.test(l.text ?? String(l)))).toBe(true);
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    // Protection from red prevents Pyroclasm's damage to the other Paladin (CR 702.16e); not to the one Whippoorwill chose.
    expect(zone(s, others[1]!)).toBe("battlefield");
    expect(s.objects[others[1]!]!.damage).toBe(0);
    expect(zone(s, others[0]!)).toBe("exile");
    // Whippoorwill itself (1/1) dies to Pyroclasm, into the graveyard: only the target is exiled.
    expect(zone(s, bird)).toBe("graveyard");
  });

  it("a prevention shield on the target doesn't apply; the creature can't be regenerated", () => {
    const { s: s0, ap, ids, bird } = game([healingSalve(), lightningBolt()]);
    const skel = putOnBattlefield(s0, ap, drudgeSkeletons());
    // Healing Salve's "prevent the next 3 damage" on the Skeletons, and a regeneration shield from its own ability.
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(skel)], [1])));
    expect(s.objects[skel]!.preventNext).toBe(3);
    s = settle(run(s, planActivate(s, ap, skel, 0)));
    expect(s.objects[skel]!.regenShields).toBe(1);
    s = whip(s, ap, bird, skel);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(skel)])));
    expect(zone(s, skel)).toBe("exile");
  });

  it("without Whippoorwill, the same shield prevents the damage", () => {
    const { s: s0, ap, ids, others } = game([healingSalve(), lightningBolt()], [grizzlyBears()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(others[0]!)], [1])));
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(others[0]!)])));
    expect(zone(s, others[0]!)).toBe("battlefield");
  });

  it("damage to the target can't be redirected (Shaman en-Kor's {0})", () => {
    const { s: s0, ap, ids, bird } = game([lightningBolt()]);
    const shaman = putOnBattlefield(s0, ap, shamanEnKor());
    const bears = putOnBattlefield(s0, ap, grizzlyBears());
    // Three times "the next 1 damage that would be dealt to ~ this turn is dealt to target creature you control instead".
    let s = s0;
    for (let i = 0; i < 3; i++) s = settle(run(s, planActivate(s, ap, shaman, 0, [tgt(bears)])));
    s = whip(s, ap, bird, shaman);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(shaman)])));
    expect(zone(s, shaman)).toBe("exile");
    expect(s.objects[bears]!.damage).toBe(0);
    expect(zone(s, bears)).toBe("battlefield");
  });

  it("lasts only this turn", () => {
    const { s: s0, ap, bird, others } = game([], [grizzlyBears()]);
    let s = whip(s0, ap, bird, others[0]!);
    expect(s.objects[others[0]!]!.damageUnalterableTurn).toBe(s.turn);
    const turn = s.turn;
    for (let i = 0; i < 400 && s.turn === turn; i++) {
      const p = s.pending;
      if (p) for (const a of botActions(s, p.player)) s = act(s, a);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.turn).toBe(turn + 1);
    expect(s.objects[others[0]!]!.damageUnalterableTurn).not.toBe(s.turn);
  });
});

describe("Lane B round B235: Reflecting Mirror", () => {
  /** `ap` casts `spell` (in hand) at `at`; `opp`, next in turn order, controls Reflecting Mirror and `lands` Mountains. */
  const game = (spell: CardDef, mana = 8) => {
    const { s, ap, ids, opp } = setup([spell]);
    const mirror = putOnBattlefield(s, opp, reflectingMirror());
    for (let i = 0; i < mana; i++) putOnBattlefield(s, opp, mountain);
    return { s, ap, opp, spell: ids[0]!, mirror };
  };
  /** `ap` casts the spell and passes, so `opp` has priority with it on the stack. */
  const castAt = (s0: GameState, ap: PlayerId, spell: string, at: TargetChoice, x?: number) => {
    let s = run(s0, planCast(s0, ap, spell, [at], undefined, undefined, x));
    s = act(s, { type: "passPriority", player: ap });
    return s;
  };

  it("X is twice the target spell's mana value, its X included; the spell aimed at you goes to the player you choose", () => {
    const { s: s0, ap, opp, spell, mirror } = game(blaze());
    let s = castAt(s0, ap, spell, { kind: "player", id: opp }, 3);
    expect(waitingOn(s)).toBe(opp);
    const item = s.stack[s.stack.length - 1]!;
    const at = [{ kind: "stack" as const, id: item.id }];
    // Blaze with X 3 has mana value 4 (CR 202.3e): X is 8, not chosen (CR 107.3c).
    expect(planActivate(s, opp, mirror, 0, at, undefined, undefined, 7)).toBeNull();
    const plan = planActivate(s, opp, mirror, 0, at);
    expect(plan).not.toBeNull();
    s = run(s, plan);
    expect(s.stack[s.stack.length - 1]!.x).toBe(8);
    expect(Object.values(s.objects).filter((o) => o.controller === opp && o.zone === "battlefield" && o.tapped).length).toBe(9);
    // Everyone passes: the Mirror's ability resolves and its controller picks the new target, a player (not a creature).
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("changeTarget");
    const pend = s.pending as Extract<GameState["pending"], { kind: "changeTarget" }>;
    expect(pend.player).toBe(opp);
    expect(pend.options.every((o) => o.kind === "player" && o.id !== opp)).toBe(true);
    expect(pend.options.length).toBe(3);
    const life = s.players[ap]!.life;
    s = act(s, { type: "changeTarget", player: opp, target: { kind: "player", id: ap } });
    s = settle(s);
    expect(s.players[ap]!.life).toBe(life - 3);
  });

  it("does nothing when the spell's one target isn't you as it resolves", () => {
    const { s: s0, ap, opp, spell, mirror } = game(shock());
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    let s = castAt(s0, ap, spell, tgt(bears));
    const item = s.stack[s.stack.length - 1]!;
    s = run(s, planActivate(s, opp, mirror, 0, [{ kind: "stack", id: item.id }]));
    s = settle(s);
    expect(s.log.some((l) => /doesn't target only/.test(l.text ?? String(l)))).toBe(true);
    expect(zone(s, bears)).toBe("graveyard");
  });

  it("a bot turns a burn spell aimed at it onto another player", () => {
    const { s: s0, ap, opp, spell } = game(shock(), 2);
    let s = castAt(s0, ap, spell, { kind: "player", id: opp });
    const life = s.players[opp]!.life;
    expect(waitingOn(s)).toBe(opp);
    const acts = botActions(s, opp);
    expect(acts.some((a) => a.type === "activateAbility")).toBe(true);
    s = run(s, acts);
    s = settle(s);
    expect(s.players[opp]!.life).toBe(life);
    expect(s.log.some((l) => /Reflecting Mirror/.test(l.text ?? String(l)))).toBe(true);
  });
});

describe("Lane B round B235: Blood Scrivener", () => {
  /** `ap` controls `scriveners` Blood Scriveners (and `extra`), with only `hand` in hand. */
  const game = (hand: CardDef[], scriveners = 1, extra: CardDef[] = []) => {
    const { s, ap, ids } = setup(hand);
    // Only `hand` in hand: the opening hand goes back on top of the library.
    const p = s.players[ap]!;
    for (const id of p.hand.filter((h) => !ids.includes(h))) (s.objects[id]!.zone = "library"), p.library.unshift(id);
    p.hand = [...ids];
    for (let i = 0; i < scriveners; i++) putOnBattlefield(s, ap, bloodScrivener());
    for (const d of extra) putOnBattlefield(s, ap, d);
    return { s, ap, ids };
  };
  /** Casts `id` and answers every question (a scry) the bots' way, until the stack is empty or a draw replacement is asked. */
  const resolve = (s0: GameState, ap: PlayerId, id: string) => {
    let s = run(s0, planCast(s0, ap, id));
    for (let i = 0; i < 100 && (s.stack.length || s.pending); i++) {
      if (s.pending?.kind === "drawInstead" || s.pending?.kind === "dredge") return s;
      if (s.pending) s = run(s, botActions(s, s.pending.player));
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    return s;
  };

  it("a draw with no cards in hand becomes two draws and 1 life lost; a second draw of the same instruction isn't replaced", () => {
    // Opt: one draw, the hand empty once Opt is cast.
    let { s, ap, ids } = game([opt()]);
    const life = s.players[ap]!.life;
    s = resolve(s, ap, ids[0]!);
    expect(s.players[ap]!.hand.length).toBe(2);
    expect(s.players[ap]!.life).toBe(life - 1);
    // Divination: the first draw is replaced, the second isn't (rulings): three cards, 1 life.
    ({ s, ap, ids } = game([divination()]));
    s = resolve(s, ap, ids[0]!);
    expect(s.players[ap]!.hand.length).toBe(3);
    expect(s.players[ap]!.life).toBe(life - 1);
  });

  it("doesn't apply with a card in hand", () => {
    const { s: s0, ap, ids } = game([opt(), grizzlyBears()]);
    const life = s0.players[ap]!.life;
    const s = resolve(s0, ap, ids[0]!);
    expect(s.players[ap]!.hand.length).toBe(2);
    expect(s.players[ap]!.life).toBe(life);
  });

  it("with two, one draw becomes three cards and 2 life (each applies once in the chain, CR 614.5)", () => {
    const { s: s0, ap, ids } = game([opt()], 2);
    const life = s0.players[ap]!.life;
    const s = resolve(s0, ap, ids[0]!);
    expect(s.players[ap]!.hand.length).toBe(3);
    expect(s.players[ap]!.life).toBe(life - 2);
  });

  it("with dredge too, the player chooses which replacement applies (CR 616.1)", () => {
    const { s: s0, ap, ids } = game([opt()]);
    const thug = putOnBattlefield(s0, ap, golgariThug());
    s0.battlefield.splice(s0.battlefield.indexOf(thug), 1);
    s0.objects[thug]!.zone = "graveyard";
    s0.players[ap]!.graveyard.push(thug);
    const life = s0.players[ap]!.life;
    let s = resolve(s0, ap, ids[0]!);
    expect(s.pending?.kind).toBe("drawInstead");
    const pend = s.pending as Extract<GameState["pending"], { kind: "drawInstead" }>;
    expect(pend.options).toContain("scrivener");
    expect(pend.options).toContain(`dredge:${thug}`);
    expect(pend.options).not.toContain("draw");
    s = act(s, { type: "drawInstead", player: ap, choice: `dredge:${thug}` });
    s = settle(s);
    expect(zone(s, thug)).toBe("hand");
    expect(s.players[ap]!.hand.length).toBe(1);
    expect(s.players[ap]!.life).toBe(life);
  });

  it("with Alhammarret's Archive the order matters: the Scrivener first leaves both new draws to the Archive", () => {
    for (const [first, cards] of [["archive", 3], ["scrivener", 4]] as const) {
      const { s: s0, ap, ids } = game([opt()], 1, [alhammarretsArchive()]);
      const life = s0.players[ap]!.life;
      let s = resolve(s0, ap, ids[0]!);
      expect(s.pending?.kind).toBe("drawInstead");
      s = act(s, { type: "drawInstead", player: ap, choice: first });
      for (let i = 0; i < 20 && s.pending; i++) s = run(s, botActions(s, s.pending.player));
      s = settle(s);
      expect(s.players[ap]!.hand.length, first).toBe(cards);
      expect(s.players[ap]!.life).toBe(life - 1);
    }
  });
});
