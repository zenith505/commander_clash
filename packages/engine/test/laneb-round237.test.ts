// Lane B round B237: draw replacements ordered among the others (CR 616.1): Reed Richards, Smartest Man (the turn's first
// draw but the draw step's becomes four), Chains of Mephistopheles (a discard, then the draw; a mill with an empty hand) and
// Zur's Weirding (the card revealed, and any other player may pay 2 life to put it into the graveyard instead).

import { describe, expect, it } from "vitest";
import { act, forest, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, handRevealed, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const archive = (): CardDef => ({"oracleId":"d5c4d36c-54b3-4149-906b-a57a670260fc","name":"Alhammarret's Archive","manaCost":"{5}","cmc":5,"typeLine":"Legendary Artifact","supertypes":["Legendary"],"types":["Artifact"],"subtypes":[],"oracleText":"If you would gain life, you gain twice that much life instead.\nIf you would draw a card except the first one you draw in each of your draw steps, draw two cards instead.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/0/70afb856-6697-411b-b1aa-e9290a0bfd68.jpg?1783938312","artUrl":"https://cards.scryfall.io/art_crop/front/7/0/70afb856-6697-411b-b1aa-e9290a0bfd68.jpg?1783938312","commanderLegal":"legal","set":"ori","releasedAt":"2015-07-17","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const chains = (): CardDef => ({"oracleId":"eae87919-6322-4bd2-ae9c-b1ce25d686da","name":"Chains of Mephistopheles","manaCost":"{1}{B}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"If a player would draw a card except the first one they draw in each of their draw steps, that player discards a card instead. If the player discards a card this way, they draw a card. If the player doesn't discard a card this way, they mill a card.","colors":["B"],"colorIdentity":["B"],"keywords":["Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/2/b/2bb0e884-5bb4-41f3-b04b-6f638357c166.jpg?1783948068","artUrl":"https://cards.scryfall.io/art_crop/front/2/b/2bb0e884-5bb4-41f3-b04b-6f638357c166.jpg?1783948068","commanderLegal":"legal","set":"leg","releasedAt":"1994-06-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const loam = (): CardDef => ({"oracleId":"ac8fba34-512c-4f24-999a-ab72f1ce4acb","name":"Life from the Loam","manaCost":"{1}{G}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Return up to three target land cards from your graveyard to your hand.\nDredge 3 (If you would draw a card, you may mill three cards instead. If you do, return this card from your graveyard to your hand.)","colors":["G"],"colorIdentity":["G"],"keywords":["Dredge","Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/8/9/899ed197-e434-4f01-a71f-053ae3820d6c.jpg?1783931626","artUrl":"https://cards.scryfall.io/art_crop/front/8/9/899ed197-e434-4f01-a71f-053ae3820d6c.jpg?1783931626","commanderLegal":"legal","set":"sld","releasedAt":"2019-12-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const reedRichards = (): CardDef => ({"oracleId":"51f55021-04e0-49bf-8f1f-de2a578c95fc","name":"Reed Richards, Smartest Man","manaCost":"{5}{U}","cmc":6,"typeLine":"Legendary Creature — Human Scientist Hero","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Scientist","Hero"],"oracleText":"Reach\nYou have no maximum hand size.\nThe first time you would draw a card each turn except the first card you draw during each of your draw steps, you draw four cards instead.","power":"2","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":["Reach"],"imageUrl":"https://cards.scryfall.io/normal/front/0/4/040dfd14-57e1-4f28-a42b-6d8874b44fea.jpg?1783903069","artUrl":"https://cards.scryfall.io/art_crop/front/0/4/040dfd14-57e1-4f28-a42b-6d8874b44fea.jpg?1783903069","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const weirding = (): CardDef => ({"oracleId":"c6eaa147-3566-43a9-999a-d58b877496f5","name":"Zur's Weirding","manaCost":"{3}{U}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Players play with their hands revealed.\nIf a player would draw a card, they reveal it instead. Then any other player may pay 2 life. If a player does, put that card into its owner's graveyard. Otherwise, that player draws a card.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/1/e1f8531f-19ca-48a2-baf2-c5dc6f18d79c.jpg?1783947506","artUrl":"https://cards.scryfall.io/art_crop/front/e/1/e1f8531f-19ca-48a2-baf2-c5dc6f18d79c.jpg?1783947506","commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

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
/** A new card in `pid`'s hand. */
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = onTop(s, pid, def);
  s.players[pid]!.library.shift();
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
};
/** Only these cards stay in `pid`'s hand; the rest go to the bottom of the library. The commander stays out of the way too. */
const onlyInHand = (s: GameState, pid: PlayerId, keep: string[]) => {
  const p = s.players[pid]!;
  for (const id of p.hand.filter((x) => !keep.includes(x))) (s.objects[id]!.zone = "library"), p.library.push(id);
  p.hand = p.hand.filter((x) => keep.includes(x));
  for (const id of p.command) (s.objects[id]!.zone = "exile"), p.exile.push(id);
  p.command = [];
};
/** The other players in turn order after `pid`. */
const after = (s: GameState, pid: PlayerId) => [1, 2, 3].map((k) => s.turnOrder[(s.turnOrder.indexOf(pid) + k) % 4]!);

describe("Lane B round B237", () => {
  it("are fully supported", () => supported(reedRichards(), chains(), weirding()));
});

describe("Lane B round B237: Reed Richards, Smartest Man", () => {
  /** `ap` controls Reed Richards (and `more`), with two Divinations in hand. */
  const game = (more: CardDef[] = []) => {
    const { s, ap, ids, opp } = setup([divination(), divination()]);
    putOnBattlefield(s, ap, reedRichards());
    for (const d of more) putOnBattlefield(s, ap, d);
    return { s, ap, divs: ids, opp };
  };

  it("the turn's first draw becomes four draws; the next ones that turn are ordinary", () => {
    const { s: s0, ap, divs } = game();
    const hand = s0.players[ap]!.hand.length;
    let s = settle(run(s0, planCast(s0, ap, divs[0]!)));
    // Divination left; its first draw became four, its second was one.
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 5);
    expect(s.log.filter((l) => l.text.includes("draws four cards instead of one (Reed Richards, Smartest Man)")).length).toBe(1);
    s = settle(run(s, planCast(s, ap, divs[1]!)));
    expect(s.players[ap]!.hand.length).toBe(hand - 2 + 5 + 2);
  });

  it("the first card drawn in its controller's draw step isn't replaced; an opponent's draws aren't either", () => {
    const { s: s0, ap, opp } = game();
    let s = passUntil(s0, "main1", opp);
    const mine = s.players[ap]!.hand.length;
    s = passUntil(s, "main1", ap);
    // Each opponent's draw step and the controller's own: one card each, nothing replaced.
    expect(s.players[ap]!.hand.length).toBe(mine + 1);
    expect(s.log.some((l) => l.text.includes("draws four cards instead"))).toBe(false);
  });

  it("with Alhammarret's Archive its player chooses the order: Reed first, each of the four draws is doubled", () => {
    const { s: s0, ap, divs } = game([archive()]);
    const hand = s0.players[ap]!.hand.length;
    let s = settle(run(s0, planCast(s0, ap, divs[0]!)), ap);
    const p = s.pending;
    expect(p?.kind).toBe("drawInstead");
    if (p?.kind !== "drawInstead") return;
    expect(p.options).toEqual(expect.arrayContaining(["reed", "archive"]));
    s = settle(act(s, { type: "drawInstead", player: ap, choice: "reed" }), ap);
    // Four draws, each two (8), then Divination's second draw, doubled too (2).
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 8 + 2);
  });

  it("the Archive first: two draws, and Reed's first time is gone", () => {
    const { s: s0, ap, divs } = game([archive()]);
    const hand = s0.players[ap]!.hand.length;
    let s = settle(run(s0, planCast(s0, ap, divs[0]!)), ap);
    s = settle(act(s, { type: "drawInstead", player: ap, choice: "archive" }), ap);
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2 + 2);
  });

  it("a bot takes Reed's four cards before the Archive's two", () => {
    const { s: s0, ap, divs } = game([archive()]);
    const s = settle(run(s0, planCast(s0, ap, divs[0]!)), ap);
    expect(botActions(s, ap)).toEqual([{ type: "drawInstead", player: ap, choice: "reed" }]);
  });
});

describe("Lane B round B237: Chains of Mephistopheles", () => {
  /** An opponent controls `n` Chains of Mephistopheles; `ap` has Divination and `extra` in hand. */
  const game = (extra: CardDef[], n = 1) => {
    const { s, ap, ids, opp } = setup([divination(), ...extra]);
    onlyInHand(s, ap, ids);
    for (let i = 0; i < n; i++) putOnBattlefield(s, opp, chains());
    return { s, ap, div: ids[0]!, rest: ids.slice(1), opp };
  };

  it("each draw is a discard of its player's choice, then a draw", () => {
    const { s: s0, ap, div, rest } = game([grizzlyBears(), lightningBolt(), grizzlyBears()]);
    const top = s0.players[ap]!.library.slice(0, 2);
    let s = settle(run(s0, planCast(s0, ap, div)), ap);
    const p = s.pending;
    expect(p?.kind).toBe("discard");
    if (p?.kind !== "discard") return;
    expect(p.thenDraw).toBeDefined();
    expect(p.source).toBe("Chains of Mephistopheles");
    expect(() => act(s, { type: "discard", player: ap, objectIds: [rest[0]!, rest[1]!] })).toThrow();
    s = settle(act(s, { type: "discard", player: ap, objectIds: [rest[1]!] }), ap);
    expect(zone(s, rest[1]!)).toBe("graveyard");
    expect(zone(s, top[0]!)).toBe("hand");
    // The second draw asks again.
    expect(s.pending?.kind).toBe("discard");
    s = settle(act(s, { type: "discard", player: ap, objectIds: [rest[0]!] }), ap);
    expect(s.pending).toBeNull();
    expect(zone(s, top[1]!)).toBe("hand");
    expect(s.players[ap]!.hand.sort()).toEqual([rest[2]!, ...top].sort());
    expect(s.log.some((l) => l.text.includes("discards Lightning Bolt instead of drawing (Chains of Mephistopheles)"))).toBe(true);
  });

  it("with an empty hand, the player mills a card instead and draws nothing", () => {
    const { s: s0, ap, div } = game([]);
    const top = s0.players[ap]!.library.slice(0, 2);
    const s = settle(run(s0, planCast(s0, ap, div)));
    expect(s.players[ap]!.hand).toEqual([]);
    expect(top.map((id) => zone(s, id))).toEqual(["graveyard", "graveyard"]);
    expect(s.log.filter((l) => l.text.includes("has no card to discard instead of drawing, and mills")).length).toBe(2);
  });

  it("two of them: each discards in turn, and the one that finds no card mills instead (rulings)", () => {
    const { s: s0, ap, div, rest } = game([lightningBolt()], 2);
    const top = s0.players[ap]!.library.slice(0, 3);
    const s = settle(run(s0, planCast(s0, ap, div)));
    // First draw: the Bolt discarded (the first Chains), then the draw it makes finds no card to discard (the second): a mill.
    // Second draw: an empty hand, a mill. Nothing drawn.
    expect(zone(s, rest[0]!)).toBe("graveyard");
    expect(s.players[ap]!.hand).toEqual([]);
    expect(top.map((id) => zone(s, id))).toEqual(["graveyard", "graveyard", "library"]);
  });

  it("the first card its player draws in their draw step isn't replaced", () => {
    const { s: s0, ap, opp } = game([lightningBolt(), grizzlyBears()]);
    let s = passUntil(s0, "main1", opp);
    s = passUntil(s, "main1", ap);
    // Each player's draw step draw, its controller's too: nothing discarded.
    expect(s.players[ap]!.hand.length).toBe(4); // Divination, the Bolt, the Bears and the card drawn
    expect(s.log.some((l) => l.text.includes("instead of drawing (Chains"))).toBe(false);
  });

  it("a bot answers its discard", () => {
    const { s: s0, ap, div } = game([lightningBolt(), grizzlyBears()]);
    const s = settle(run(s0, planCast(s0, ap, div)), ap);
    const a = botActions(s, ap);
    expect(a.length).toBe(1);
    expect(a[0]!.type).toBe("discard");
    const t = settle(act(s, a[0]!));
    expect(t.players[ap]!.hand.length).toBe(2);
    expect(t.players[ap]!.graveyard.length).toBe(3); // Divination and the two cards discarded
  });
});

describe("Lane B round B237: Zur's Weirding", () => {
  /** An opponent controls Zur's Weirding; `ap` has Divination in hand and `top` on top of their library, first on top. */
  const game = (top: CardDef[]) => {
    const { s, ap, ids, opp } = setup([divination()]);
    putOnBattlefield(s, opp, weirding());
    const tops = [...top].reverse().map((d) => onTop(s, ap, d)).reverse();
    return { s, ap, div: ids[0]!, opp, tops };
  };

  it("each draw reveals the card instead; the other players are asked in turn order, and one who pays 2 life bins it", () => {
    const { s: s0, ap, div, tops } = game([lightningBolt(), grizzlyBears()]);
    const [b, c, d] = after(s0, ap);
    let s = run(s0, planCast(s0, ap, div));
    s = settle(s, b);
    let p = s.pending;
    expect(p?.kind).toBe("chooseMay");
    if (p?.kind !== "chooseMay") return;
    expect(p.player).toBe(b);
    expect(p.card).toBe(tops[0]);
    expect(p.pay).toEqual({ life: 2 });
    s = act(s, { type: "chooseMay", player: b!, yes: false });
    p = s.pending;
    expect(p?.kind === "chooseMay" && p.player).toBe(c);
    s = act(s, { type: "chooseMay", player: c!, yes: true });
    expect(zone(s, tops[0]!)).toBe("graveyard");
    expect(s.players[c!]!.life).toBe(s0.players[c!]!.life - 2);
    // The second draw: Grizzly Bears, no one pays, so it's drawn.
    for (const q of [b, c, d]) {
      p = s.pending;
      expect(p?.kind === "chooseMay" && p.player).toBe(q);
      s = act(s, { type: "chooseMay", player: q!, yes: false });
    }
    s = settle(s, ap);
    expect(zone(s, tops[1]!)).toBe("hand");
    expect(s.log.some((l) => l.text.includes("reveals Lightning Bolt instead of drawing it (Zur's Weirding)"))).toBe(true);
    expect(s.log.some((l) => l.text.includes("pays 2 life, and Lightning Bolt goes into"))).toBe(true);
  });

  it("a player who can't pay 2 life isn't asked (CR 119.4)", () => {
    const { s: s0, ap, div } = game([lightningBolt()]);
    const [b, c] = after(s0, ap);
    s0.players[b!]!.life = 1;
    const s = settle(run(s0, planCast(s0, ap, div)), c);
    expect(s.pending?.kind === "chooseMay" && s.pending.player).toBe(c);
    expect(() => act({ ...s, pending: { ...s.pending!, player: b! } as GameState["pending"] }, { type: "chooseMay", player: b!, yes: true })).toThrow();
  });

  it("bots pay to keep an opponent from drawing a nonland card, not a land", () => {
    const { s: s0, ap, div, tops } = game([lightningBolt(), forest]);
    const [b] = after(s0, ap);
    const s = settle(run(s0, planCast(s0, ap, div)));
    expect(zone(s, tops[0]!)).toBe("graveyard");
    expect(s.players[b!]!.life).toBe(s0.players[b!]!.life - 2);
    expect(zone(s, tops[1]!)).toBe("hand");
  });

  it("every player plays with their hand revealed", () => {
    const { s, ap, opp } = game([]);
    expect(handRevealed(s, ap, opp)).toBe(true);
    expect(handRevealed(s, opp, ap)).toBe(true);
  });
});
