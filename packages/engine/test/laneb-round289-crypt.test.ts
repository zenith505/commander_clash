// Lane B round B289: Breathstealer's Crypt's draw replacement (CR 614.1a): every player's draws become a draw and a reveal,
// and a creature card drawn this way is discarded unless its player pays 3 life (CR 119.4); ordered among the other
// replacements by the drawing player (CR 616.1), once in each chain of draws it made (CR 614.5).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const crypt = (): CardDef => ({"oracleId":"c9a9550c-e6bb-4fe3-930f-6266024dbead","name":"Breathstealer's Crypt","manaCost":"{2}{U}{B}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"If a player would draw a card, instead they draw a card and reveal it. If it's a creature card, that player discards it unless they pay 3 life.","colors":["B","U"],"colorIdentity":["B","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/8/f87ace53-d77c-4df5-b200-4be2ac2b7fdb.jpg?1783946979","artUrl":"https://cards.scryfall.io/art_crop/front/f/8/f87ace53-d77c-4df5-b200-4be2ac2b7fdb.jpg?1783946979","commanderLegal":"legal","set":"vis","releasedAt":"1997-02-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const archive = (): CardDef => ({"oracleId":"d5c4d36c-54b3-4149-906b-a57a670260fc","name":"Alhammarret's Archive","manaCost":"{5}","cmc":5,"typeLine":"Legendary Artifact","supertypes":["Legendary"],"types":["Artifact"],"subtypes":[],"oracleText":"If you would gain life, you gain twice that much life instead.\nIf you would draw a card except the first one you draw in each of your draw steps, draw two cards instead.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/0/70afb856-6697-411b-b1aa-e9290a0bfd68.jpg?1783938312","artUrl":"https://cards.scryfall.io/art_crop/front/7/0/70afb856-6697-411b-b1aa-e9290a0bfd68.jpg?1783938312","commanderLegal":"legal","set":"ori","releasedAt":"2015-07-17","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const serraAngel = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const loam = (): CardDef => ({"oracleId":"ac8fba34-512c-4f24-999a-ab72f1ce4acb","name":"Life from the Loam","manaCost":"{1}{G}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Return up to three target land cards from your graveyard to your hand.\nDredge 3 (If you would draw a card, you may mill three cards instead. If you do, return this card from your graveyard to your hand.)","colors":["G"],"colorIdentity":["G"],"keywords":["Dredge","Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/8/9/899ed197-e434-4f01-a71f-053ae3820d6c.jpg?1783931626","artUrl":"https://cards.scryfall.io/art_crop/front/8/9/899ed197-e434-4f01-a71f-053ae3820d6c.jpg?1783931626","commanderLegal":"legal","set":"sld","releasedAt":"2019-12-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const tamiyo = (): CardDef => ({"oracleId":"75d56a0a-2f64-4e80-b83e-85942d3e6dd7","name":"Tamiyo, Collector of Tales","manaCost":"{2}{G}{U}","cmc":4,"typeLine":"Legendary Planeswalker — Tamiyo","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Tamiyo"],"oracleText":"Spells and abilities your opponents control can't cause you to discard cards or sacrifice permanents.\n+1: Choose a nonland card name, then reveal the top four cards of your library. Put all cards with the chosen name from among them into your hand and the rest into your graveyard.\n−3: Return target card from your graveyard to your hand.","loyalty":"5","colors":["G","U"],"colorIdentity":["G","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/6/f6b45d79-4526-490d-9771-9445e45307a7.jpg?1783931614","artUrl":"https://cards.scryfall.io/art_crop/front/f/6/f6b45d79-4526-490d-9771-9445e45307a7.jpg?1783931614","commanderLegal":"legal","set":"sld","releasedAt":"2019-12-16","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

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
/** A new card in `pid`'s graveyard. */
const inYard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = onTop(s, pid, def);
  s.players[pid]!.library.shift();
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
};
const revealed = (s: GameState, name: string) => s.log.filter((l) => l.text.includes(`reveals ${name}`) && l.text.includes("(Breathstealer's Crypt)")).length;

describe("Lane B round B289: Breathstealer's Crypt", () => {
  /** An opponent controls Breathstealer's Crypt; `ap` has Divination in hand and `top` on top of their library, first on top. */
  const game = (top: CardDef[], more: CardDef[] = []) => {
    const { s, ap, ids, opp } = setup([divination()]);
    putOnBattlefield(s, opp, crypt());
    for (const d of more) putOnBattlefield(s, ap, d);
    const tops = [...top].reverse().map((d) => onTop(s, ap, d)).reverse();
    return { s, ap, div: ids[0]!, opp, tops };
  };

  it("is fully supported", () => supported(crypt()));

  it("a noncreature card drawn is revealed and kept; a creature card asks: pay 3 life to keep it", () => {
    const { s: s0, ap, div, tops } = game([lightningBolt(), serraAngel()]);
    let s = settle(run(s0, planCast(s0, ap, div)), ap);
    expect(zone(s, tops[0]!)).toBe("hand");
    expect(revealed(s, "Lightning Bolt")).toBe(1);
    const p = s.pending;
    expect(p?.kind).toBe("chooseMay");
    if (p?.kind !== "chooseMay") return;
    expect(p.player).toBe(ap);
    expect(p.card).toBe(tops[1]);
    expect(p.pay).toEqual({ life: 3 });
    expect(zone(s, tops[1]!)).toBe("hand");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = settle(s, ap);
    expect(zone(s, tops[1]!)).toBe("hand");
    expect(s.players[ap]!.life).toBe(s0.players[ap]!.life - 3);
    expect(zone(s, div)).toBe("graveyard");
    expect(s.stack.length).toBe(0);
  });

  it("not paying discards the creature card, and the next draw goes on after the question", () => {
    const { s: s0, ap, div, tops } = game([grizzlyBears(), serraAngel()]);
    let s = settle(run(s0, planCast(s0, ap, div)), ap);
    expect(s.pending?.kind === "chooseMay" && s.pending.card).toBe(tops[0]);
    // The second card isn't drawn yet.
    expect(zone(s, tops[1]!)).toBe("library");
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    expect(zone(s, tops[0]!)).toBe("graveyard");
    expect(s.pending?.kind === "chooseMay" && s.pending.card).toBe(tops[1]);
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    s = settle(s, ap);
    expect(zone(s, tops[1]!)).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(s0.players[ap]!.life);
    expect(s.log.some((l) => l.text.includes("discards Grizzly Bears (Breathstealer's Crypt)"))).toBe(true);
  });

  it("a player who can't pay 3 life discards it without being asked (CR 119.4)", () => {
    const { s: s0, ap, div, tops } = game([serraAngel(), lightningBolt()]);
    s0.players[ap]!.life = 2;
    const s = settle(run(s0, planCast(s0, ap, div)), ap);
    expect(s.pending).toBeNull();
    expect(zone(s, tops[0]!)).toBe("graveyard");
    expect(zone(s, tops[1]!)).toBe("hand");
    expect(() => act({ ...s, pending: { kind: "chooseMay", player: ap, prompt: "", source: "Breathstealer's Crypt", card: tops[0]!, pay: { life: 3 }, breathstealer: { left: 0, made: [], by: ap } } }, { type: "chooseMay", player: ap, yes: true })).toThrow();
  });

  it("the draw step's draw is replaced too, for every player", () => {
    const { s: s0, ap, opp } = game([]);
    const next = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    expect(next).toBe(opp);
    // Next turn: the Crypt's controller draws Serra Angel in their own draw step.
    let s = passUntil(s0, "upkeep", next);
    const top = onTop(s, next, serraAngel());
    s = passUntil(s, "draw", next);
    for (let i = 0; i < 5 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind === "chooseMay" && s.pending.player === next && s.pending.card).toBe(top);
    s = act(s, { type: "chooseMay", player: next, yes: true });
    expect(zone(s, top)).toBe("hand");
    s = passUntil(s, "main1", next);
    expect(s.players[next]!.life).toBe(s0.players[next]!.life - 3);
  });

  it("with Alhammarret's Archive the drawing player orders them: the Crypt first makes a draw the Archive replaces, so nothing is revealed", () => {
    const { s: s0, ap, div, tops } = game([serraAngel(), grizzlyBears(), lightningBolt(), lightningBolt()], [archive()]);
    let s = settle(run(s0, planCast(s0, ap, div)), ap);
    let p = s.pending;
    expect(p?.kind).toBe("drawInstead");
    if (p?.kind !== "drawInstead") return;
    expect(p.options).toEqual(expect.arrayContaining(["breath", "archive"]));
    s = act(s, { type: "drawInstead", player: ap, choice: "breath" });
    // The Crypt's draw: the Archive (and not the Crypt again) can replace it, and does: two cards, neither revealed (Sindbad
    // rulings: a replaced draw, even by another draw, isn't the draw the rest is about).
    p = s.pending;
    expect(p?.kind === "chooseMay").toBe(false);
    expect(zone(s, tops[0]!)).toBe("hand");
    expect(zone(s, tops[1]!)).toBe("hand");
    expect(revealed(s, "Serra Angel")).toBe(0);
  });

  it("with the Archive first, each of its two draws is the Crypt's to replace", () => {
    const { s: s0, ap, div, tops } = game([serraAngel(), lightningBolt(), lightningBolt(), lightningBolt()], [archive()]);
    let s = settle(run(s0, planCast(s0, ap, div)), ap);
    s = act(s, { type: "drawInstead", player: ap, choice: "archive" });
    // Each of the two: only the Crypt can replace it now (the Archive already replaced the draw they were made of).
    let p = s.pending;
    expect(p?.kind === "chooseMay" && p.card).toBe(tops[0]);
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    expect(zone(s, tops[0]!)).toBe("graveyard");
    expect(zone(s, tops[1]!)).toBe("hand");
    expect(revealed(s, "Lightning Bolt")).toBe(1);
    // Then Divination's second draw: the choice again.
    p = s.pending;
    expect(p?.kind).toBe("drawInstead");
  });

  it("two Crypts: the second replaces the first one's draw, and the card is revealed once", () => {
    const { s: s0, ap, div, tops, opp } = game([serraAngel(), lightningBolt()]);
    putOnBattlefield(s0, opp, crypt());
    let s = settle(run(s0, planCast(s0, ap, div)), ap);
    expect(s.pending?.kind === "chooseMay" && s.pending.card).toBe(tops[0]);
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = settle(s, ap);
    expect(revealed(s, "Serra Angel")).toBe(1);
    expect(revealed(s, "Lightning Bolt")).toBe(1);
    expect(s.log.filter((l) => l.text.includes("draws a card and reveals it instead")).length).toBe(4);
    expect(s.players[ap]!.life).toBe(s0.players[ap]!.life - 3);
  });

  it("a card that could dredge is offered for the Crypt's draw; not dredging draws and reveals it", () => {
    const { s: s0, ap, div, tops } = game([serraAngel(), lightningBolt()]);
    inYard(s0, ap, loam());
    let s = settle(run(s0, planCast(s0, ap, div)), ap);
    let p = s.pending;
    expect(p?.kind).toBe("drawInstead");
    if (p?.kind !== "drawInstead") return;
    // The Crypt or dredge for the draw itself: the Crypt.
    s = act(s, { type: "drawInstead", player: ap, choice: "breath" });
    p = s.pending;
    expect(p?.kind).toBe("dredge");
    s = act(s, { type: "dredge", player: ap });
    p = s.pending;
    expect(p?.kind === "chooseMay" && p.card).toBe(tops[0]);
  });

  it("an opponent's Crypt can't make a Tamiyo, Collector of Tales player discard; their own can", () => {
    const { s: s0, ap, div, tops } = game([serraAngel(), grizzlyBears()]);
    s0.objects[putOnBattlefield(s0, ap, tamiyo())]!.counters.loyalty = 2;
    s0.players[ap]!.life = 2;
    const s = settle(run(s0, planCast(s0, ap, div)), ap);
    expect(zone(s, tops[0]!)).toBe("hand");
    expect(zone(s, tops[1]!)).toBe("hand");
    expect(s.log.some((l) => l.text.includes("can't be made to discard Serra Angel by another player's Breathstealer's Crypt"))).toBe(true);
    // Their own Crypt can.
    const { s: t0, ap: me, div: div2, tops: tops2 } = game([serraAngel()]);
    const theirs = t0.battlefield.find((id) => t0.cards[t0.objects[id]!.cardId]!.name === "Breathstealer's Crypt")!;
    t0.objects[theirs]!.controller = me;
    t0.objects[theirs]!.owner = me;
    t0.objects[putOnBattlefield(t0, me, tamiyo())]!.counters.loyalty = 2;
    invalidateCharacteristics(t0);
    t0.players[me]!.life = 2;
    const t = settle(run(t0, planCast(t0, me, div2)), me);
    expect(zone(t, tops2[0]!)).toBe("graveyard");
  });

  it("bots pay 3 life for a creature card costing 3 or more while they keep 10 life, and discard the rest", () => {
    const { s: s0, ap, div, tops } = game([serraAngel(), grizzlyBears()]);
    const s = settle(run(s0, planCast(s0, ap, div)));
    expect(zone(s, tops[0]!)).toBe("hand");
    expect(zone(s, tops[1]!)).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(s0.players[ap]!.life - 3);
  });
});
