// Lane B round B244: Ms. Marvel, Kamala Khan (a granted "base power is equal to the number of cards in your hand", set in
// layer 7b and counted continuously, CR 604.3a, 613.4b, 611.3a), Domri, Chaos Bringer (a loyalty ability's mana, not a
// mana ability, CR 605.1a; a creature spell it's spent on gains riot, CR 702.136a, and the permanent keeps it, CR 400.7a)
// and Nihilith (a suspended card's trigger in exile for each card put into an opponent's graveyard, CR 113.6, 603.4).

import { describe, expect, it } from "vitest";
import { act, bear, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const marvel = (): CardDef => ({"oracleId":"ebedff30-ae43-4861-aab2-afe1fc88337e","name":"Ms. Marvel, Kamala Khan","manaCost":"{2}{U}","cmc":3,"typeLine":"Legendary Creature — Mutant Inhuman Hero","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Mutant","Inhuman","Hero"],"oracleText":"Reach, vigilance\nYou have no maximum hand size.\nEmbiggen Fist — Whenever you cast a spell that targets a creature you control, draw a card. Until end of turn, Ms. Marvel gains \"Ms. Marvel's base power is equal to the number of cards in your hand.\"","power":"1","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":["Reach","Vigilance","Embiggen Fist"],"imageUrl":"https://cards.scryfall.io/normal/front/9/d/9dd2d627-10fc-4045-8545-03bcf75e60ca.jpg?1783902954","artUrl":"https://cards.scryfall.io/art_crop/front/9/d/9dd2d627-10fc-4045-8545-03bcf75e60ca.jpg?1783902954","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const domri = (): CardDef => ({"oracleId":"2a5408ed-8b47-4896-97e4-aa102a4b85c9","name":"Domri, Chaos Bringer","manaCost":"{2}{R}{G}","cmc":4,"typeLine":"Legendary Planeswalker — Domri","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Domri"],"oracleText":"+1: Add {R} or {G}. If that mana is spent on a creature spell, it gains riot. (It enters with your choice of a +1/+1 counter or haste.)\n−3: Look at the top four cards of your library. You may reveal up to two creature cards from among them and put them into your hand. Put the rest on the bottom of your library in a random order.\n−8: You get an emblem with \"At the beginning of each end step, create a 4/4 red and green Beast creature token with trample.\"","loyalty":"5","colors":["G","R"],"colorIdentity":["G","R"],"keywords":[],"producedMana":["G","R"],"imageUrl":"https://cards.scryfall.io/normal/front/1/f/1f56bbf3-3884-495a-b9cd-6585d86f76f1.jpg?1783933653","artUrl":"https://cards.scryfall.io/art_crop/front/1/f/1f56bbf3-3884-495a-b9cd-6585d86f76f1.jpg?1783933653","commanderLegal":"legal","set":"rna","releasedAt":"2019-01-25","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const nihilith = (): CardDef => ({"oracleId":"c235fda2-1a8d-4ac7-9a23-784529a520f0","name":"Nihilith","manaCost":"{4}{B}{B}","cmc":6,"typeLine":"Creature — Horror","supertypes":[],"types":["Creature"],"subtypes":["Horror"],"oracleText":"Fear (This creature can't be blocked except by artifact creatures and/or black creatures.)\nSuspend 7—{1}{B} (Rather than cast this card from your hand, you may pay {1}{B} and exile it with seven time counters on it. At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost. It has haste.)\nWhenever a card is put into an opponent's graveyard from anywhere, if this card is suspended, you may remove a time counter from this card.","power":"4","toughness":"4","colors":["B"],"colorIdentity":["B"],"keywords":["Suspend","Fear"],"imageUrl":"https://cards.scryfall.io/normal/front/1/1/11a431fa-e98c-434a-9138-b4bcc86edde8.jpg?1783943112","artUrl":"https://cards.scryfall.io/art_crop/front/1/1/11a431fa-e98c-434a-9138-b4bcc86edde8.jpg?1783943112","commanderLegal":"legal","set":"fut","releasedAt":"2007-05-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const giantGrowth = (): CardDef => ({"oracleId":"5748ebf1-24e3-499d-ab7c-c2cebd462a24","name":"Giant Growth","manaCost":"{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature gets +3/+3 until end of turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/d/fd1f95bf-48ea-455a-8a6c-0249b11c8900.jpg?1783902918","artUrl":"https://cards.scryfall.io/art_crop/front/f/d/fd1f95bf-48ea-455a-8a6c-0249b11c8900.jpg?1783902918","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const mindRot = (): CardDef => ({"oracleId":"ad44cf74-b717-48fb-9fa2-77512024d76a","name":"Mind Rot","manaCost":"{2}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target player discards two cards.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/3/3317ff1a-9104-44e6-acb9-5ee09648138f.jpg?1783937202","artUrl":"https://cards.scryfall.io/art_crop/front/3/3/3317ff1a-9104-44e6-acb9-5ee09648138f.jpg?1783937202","commanderLegal":"legal","set":"kld","releasedAt":"2016-09-30","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...ds: CardDef[]) => ds.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes and lets bots answer until the stack is empty or one of `me` has a question. */
const settle = (s: GameState, me: PlayerId[] = []) => {
  for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && !me.includes(p.player)) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const toZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "library" | "exile" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
/** `setup` with only `hand` in the active player's hand (the opening hand put back into the library). */
const only = (hand: CardDef[]) => {
  const r = setup([]);
  const p = r.s.players[r.ap]!;
  for (const id of p.hand) r.s.objects[id]!.zone = "library";
  p.library.push(...p.hand);
  p.hand = [];
  const ids = hand.map((d) => toZone(r.s, r.ap, d, "hand"));
  return { ...r, ids };
};
/** Removes `pid`'s lands, so only the mana pool pays. */
const noLands = (s: GameState, pid: PlayerId) => {
  for (const id of [...s.battlefield])
    if (s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land")) {
      s.battlefield.splice(s.battlefield.indexOf(id), 1);
      delete s.objects[id];
    }
  invalidateCharacteristics(s);
};

describe("Lane B round B244", () => {
  it("are fully supported", () => {
    supported(marvel(), domri(), nihilith());
  });
});

describe("Lane B round B244: Ms. Marvel, Kamala Khan", () => {
  it("a spell of yours targeting a creature you control: draw, then her base power is the number of cards in your hand until end of turn, counted continuously", () => {
    const { s: s0, ap, ids } = only([giantGrowth(), bolt(), bolt(), bolt()]);
    const mm = putOnBattlefield(s0, ap, marvel());
    expect(pt(s0, mm)).toBe("1/4");
    // Giant Growth on her: the trigger resolves first. Three cards left in hand, then the draw: four.
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(mm)], undefined, "auto"));
    expect(s.triggerQueue.length + s.stack.length).toBeGreaterThanOrEqual(2);
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (let i = 0; i < 10 && s.stack.length === 2; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[ap]!.hand).toHaveLength(4);
    // Base 4 (layer 7b), Giant Growth still on the stack.
    expect(pt(s, mm)).toBe("4/4");
    s = settle(s);
    // Then +3/+3 on top (layer 7c, CR 613.4c).
    expect(pt(s, mm)).toBe("7/7");
    // Casting a Bolt (not at her) leaves one card fewer in hand: her power follows (CR 611.3a), and no new trigger.
    const opp = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }], undefined, "auto")));
    expect(s.players[ap]!.hand).toHaveLength(3);
    expect(pt(s, mm)).toBe("6/7");
    // Until end of turn only: at the next turn she's 1/4 again.
    s = passUntil(s, "upkeep", opp);
    expect(pt(s, mm)).toBe("1/4");
  });

  it("a later base-power effect overrides it (layer 7b, timestamp order, CR 613.7a)", () => {
    const { s: s0, ap, ids } = only([giantGrowth(), bolt()]);
    const mm = putOnBattlefield(s0, ap, marvel());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(mm)], undefined, "auto")));
    // One Bolt plus the drawn card in hand: base 2, +3/+3.
    expect(s.players[ap]!.hand).toHaveLength(2);
    expect(pt(s, mm)).toBe("5/7");
    s.effects.push({ id: `x${s.nextId++}`, timestamp: s.nextTimestamp++, controller: ap, sourceName: "test", duration: "endOfTurn", affected: [mm], mods: [{ kind: "setPT", power: 0, toughness: 1 }] });
    invalidateCharacteristics(s);
    expect(pt(s, mm)).toBe("3/4");
  });

  it("a spell targeting only an opponent's creature doesn't trigger it", () => {
    const { s: s0, ap, ids, opp } = only([giantGrowth()]);
    const mm = putOnBattlefield(s0, ap, marvel());
    const theirs = putOnBattlefield(s0, opp, bear());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(theirs)], undefined, "auto")));
    expect(s.players[ap]!.hand).toHaveLength(0);
    expect(pt(s, mm)).toBe("1/4");
    expect(characteristics(s, s.objects[mm]!).keywords).toEqual(expect.arrayContaining(["Reach", "Vigilance"]));
  });
});

describe("Lane B round B244: Domri, Chaos Bringer", () => {
  const withDomri = (hand: CardDef[]) => {
    const r = only(hand);
    const d = putOnBattlefield(r.s, r.ap, domri());
    r.s.objects[d]!.counters.loyalty = 5;
    invalidateCharacteristics(r.s);
    return { ...r, d };
  };

  it("+1 uses the stack (not a mana ability) and adds {R} or {G}, chosen as it resolves", () => {
    const { s: s0, ap, d } = withDomri([]);
    let s = run(s0, planActivate(s0, ap, d, 0));
    expect(s.stack).toHaveLength(1);
    expect(s.objects[d]!.counters.loyalty).toBe(6);
    s = settle(s, [ap]);
    const p = s.pending;
    expect(p?.kind === "chooseOption" && p.what).toBe("either");
    // "0" of {R}: {G}.
    s = act(s, { type: "chooseOption", player: ap, choice: "0" });
    expect(s.players[ap]!.manaPool.G).toBe(1);
    expect(s.players[ap]!.manaLots?.[0]).toMatchObject({ mana: "G", n: 1, riot: "Domri, Chaos Bringer" });
  });

  it("spent on a creature spell: the creature enters with riot, a +1/+1 counter or haste", () => {
    for (const pick of ["counter", "haste"] as const) {
      const { s: s0, ap, d, ids } = withDomri([elves()]);
      noLands(s0, ap);
      let s = settle(run(s0, planActivate(s0, ap, d, 0)), [ap]);
      s = act(s, { type: "chooseOption", player: ap, choice: "0" });
      s = run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto"));
      expect(s.players[ap]!.manaPool.G).toBe(0);
      s = settle(s, [ap]);
      const p = s.pending;
      expect(p?.kind === "chooseOption" && p.what).toBe("riot");
      if (p?.kind !== "chooseOption") throw new Error("no riot choice");
      s = act(s, { type: "chooseOption", player: ap, choice: pick === "counter" ? "+1/+1 counter" : "Haste" });
      s = settle(s);
      const el = s.objects[ids[0]!]!;
      expect(el.zone).toBe("battlefield");
      if (pick === "counter") {
        expect(pt(s, el.id)).toBe("2/2");
        expect(characteristics(s, el).keywords).not.toContain("Haste");
      } else {
        expect(pt(s, el.id)).toBe("1/1");
        expect(characteristics(s, el).keywords).toContain("Haste");
      }
    }
  });

  it("spent on a noncreature spell: nothing gains riot; other mana for a creature spell gives none", () => {
    const { s: s0, ap, d, ids } = withDomri([bolt(), elves()]);
    noLands(s0, ap);
    let s = settle(run(s0, planActivate(s0, ap, d, 0)), [ap]);
    // {R} this time: spent on Lightning Bolt.
    s = act(s, { type: "chooseOption", player: ap, choice: "1" });
    expect(s.players[ap]!.manaPool.R).toBe(1);
    const opp = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, "auto")));
    expect(s.players[opp]!.life).toBe(37);
    // A Forest's {G} for Llanowar Elves: no riot choice.
    putOnBattlefield(s, ap, { ...s.cards[Object.keys(s.cards).find((k) => s.cards[k]!.name === "Forest")!]! });
    s = settle(run(s, planCast(s, ap, ids[1]!, undefined, undefined, "auto")), [ap]);
    expect(s.pending).toBeFalsy();
    expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
    expect(pt(s, ids[1]!)).toBe("1/1");
  });
});

describe("Lane B round B244: Nihilith", () => {
  it("while suspended, each card put into an opponent's graveyard lets its owner remove a time counter", () => {
    const { s: s0, ap, ids, opp } = setup([mindRot()]);
    const nih = toZone(s0, ap, nihilith(), "exile");
    s0.objects[nih]!.counters.time = 7;
    toZone(s0, opp, bear(), "hand");
    toZone(s0, opp, bear(), "hand");
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, "auto"));
    s = settle(s, [ap]);
    // Two cards discarded: two triggers, each a "may" for Nihilith's owner. Mind Rot itself goes to its owner's (our) graveyard: no trigger.
    let asked = 0;
    for (let i = 0; i < 4 && s.pending?.kind === "chooseMay" && s.pending.player === ap; i++) {
      asked++;
      s = settle(act(s, { type: "chooseMay", player: ap, yes: i === 0 }), [ap]);
    }
    expect(asked).toBe(2);
    expect(s.objects[nih]!.counters.time).toBe(6);
  });

  it("not suspended (no time counters): no trigger", () => {
    const { s: s0, ap, ids, opp } = setup([mindRot()]);
    const nih = toZone(s0, ap, nihilith(), "exile");
    toZone(s0, opp, bear(), "hand");
    toZone(s0, opp, bear(), "hand");
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, "auto")), [ap]);
    expect(s.pending).toBeFalsy();
    expect(s.objects[nih]!.counters.time ?? 0).toBe(0);
  });

  it("on the battlefield it doesn't trigger; removing the last counter lets its owner cast it", () => {
    const { s: s0, ap, ids, opp } = setup([mindRot()]);
    const onField = putOnBattlefield(s0, ap, nihilith());
    const nih = toZone(s0, ap, nihilith(), "exile");
    s0.objects[nih]!.counters.time = 1;
    toZone(s0, opp, bear(), "hand");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, "auto")), [ap]);
    // One discard: one question (only the suspended card's ability).
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), [ap]);
    expect(s.objects[nih]!.counters.time ?? 0).toBe(0);
    // Suspend's last-counter trigger: cast it without paying its mana cost (CR 702.62a).
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: nih, how: "suspend" });
    s = settle(run(s, planCast(s, ap, nih)), [ap]);
    expect(s.objects[nih]!.zone).toBe("battlefield");
    expect(characteristics(s, s.objects[nih]!).keywords).toContain("Haste");
    expect(s.objects[onField]!.zone).toBe("battlefield");
  });
});
