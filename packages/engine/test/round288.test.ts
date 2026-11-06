// Round 288: from the top of the popularity list.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, isFullySupported, legalTargets, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";
import { moveObject } from "../src/game";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
const answer = (s: GameState, choice: string) => act(s, { type: "chooseOption", player: s.pending!.player, choice } as Action);
const peek = (name = "Peek") => card(name, "Instant", "{U}", { cmc: 1, oracleText: "Draw a card." });
void passUntil; void moveObject;

// Real oracle text (Scryfall).
const detour = (): CardDef => ({"oracleId":"d65728cf-e9ce-46d8-a890-e1295b18cfbe","name":"Endless Detour","manaCost":"{G}{W}{U}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"The owner of target spell, nonland permanent, or card in a graveyard puts it on their choice of the top or bottom of their library.","colors":["G","U","W"],"colorIdentity":["G","U","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/3/33a37435-bd6c-4330-8138-98a2afa36e54.jpg?1783906250","artUrl":"https://cards.scryfall.io/art_crop/front/3/3/33a37435-bd6c-4330-8138-98a2afa36e54.jpg?1783906250","set":"fic","releasedAt":"2025-06-13","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const clockspinning = (): CardDef => ({"oracleId":"3e1b32a9-27a4-4550-a644-ebe254e1f512","name":"Clockspinning","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Buyback {3} (You may pay an additional {3} as you cast this spell. If you do, put this card into your hand as it resolves.)\nChoose a counter on target permanent or suspended card. Remove that counter from that permanent or card or put another of those counters on it.","colors":["U"],"colorIdentity":["U"],"keywords":["Buyback"],"imageUrl":"https://cards.scryfall.io/normal/front/0/1/01aeee52-1fb0-4eeb-8fd8-455fdd91db15.jpg?1783914602","artUrl":"https://cards.scryfall.io/art_crop/front/0/1/01aeee52-1fb0-4eeb-8fd8-455fdd91db15.jpg?1783914602","set":"who","releasedAt":"2023-10-13","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const timecrafting = (): CardDef => ({"oracleId":"57939644-6f9a-4653-920b-f2d28559a9ca","name":"Timecrafting","manaCost":"{X}{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose one —\n• Remove X time counters from target permanent or suspended card.\n• Put X time counters on target permanent with a time counter on it or suspended card.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/d/fd6da5ef-7e5b-4536-ad28-6fe66f3e0438.jpg?1783943146","artUrl":"https://cards.scryfall.io/art_crop/front/f/d/fd6da5ef-7e5b-4536-ad28-6fe66f3e0438.jpg?1783943146","set":"plc","releasedAt":"2007-02-02","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const timebug = (): CardDef => ({"oracleId":"afe11d79-1edd-4175-9cdd-11e475240e7a","name":"Jhoira's Timebug","manaCost":"{2}","cmc":2,"typeLine":"Artifact Creature — Insect","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Insect"],"oracleText":"{T}: Choose target permanent you control or suspended card you own. If that permanent or card has a time counter on it, you may remove a time counter from it or put another time counter on it.","power":"1","toughness":"2","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/c/9ce2c6d7-505b-490b-9c6f-b5166c9ff71d.jpg?1783943198","artUrl":"https://cards.scryfall.io/art_crop/front/9/c/9ce2c6d7-505b-490b-9c6f-b5166c9ff71d.jpg?1783943198","set":"tsp","releasedAt":"2006-10-06","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const furyCharm = (): CardDef => ({"oracleId":"b86b1878-65a9-48df-9727-1e80683d7e86","name":"Fury Charm","manaCost":"{1}{R}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose one —\n• Destroy target artifact.\n• Target creature gets +1/+1 and gains trample until end of turn.\n• Remove two time counters from target permanent or suspended card.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/5/25e891f1-79fa-43dc-817b-c7838cd03d5f.jpg?1783943147","artUrl":"https://cards.scryfall.io/art_crop/front/2/5/25e891f1-79fa-43dc-817b-c7838cd03d5f.jpg?1783943147","set":"plc","releasedAt":"2007-02-02","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const timebender = (): CardDef => ({"oracleId":"efa3e524-1591-4036-81ec-74199cee25aa","name":"Timebender","manaCost":"{U}","cmc":1,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"Morph {U}\nWhen this creature is turned face up, choose one —\n• Remove two time counters from target permanent or suspended card.\n• Put two time counters on target permanent with a time counter on it or suspended card.","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":["Morph"],"imageUrl":"https://cards.scryfall.io/normal/front/6/2/62fdf8bd-a069-41ca-9cbb-deb7f53cbcbe.jpg?1783943159","artUrl":"https://cards.scryfall.io/art_crop/front/6/2/62fdf8bd-a069-41ca-9cbb-deb7f53cbcbe.jpg?1783943159","set":"plc","releasedAt":"2007-02-02","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const racket = (): CardDef => ({"oracleId":"4b51edb1-37cc-4993-a8a5-2eb5f79fa191","name":"Protection Racket","manaCost":"{2}{B}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your upkeep, repeat the following process for each opponent in turn order. Reveal the top card of your library. That player may pay life equal to that card's mana value. If they do, exile that card. Otherwise, put it into your hand.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/7/7723cf0b-de49-44f6-a52e-6e339a080457.jpg?1783923364","artUrl":"https://cards.scryfall.io/art_crop/front/7/7/7723cf0b-de49-44f6-a52e-6e339a080457.jpg?1783923364","set":"ncc","releasedAt":"2022-04-29","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const mist = (): CardDef => ({"oracleId":"afc9e1d3-b012-49e9-8d22-89abbee03c22","name":"Primordial Mist","manaCost":"{4}{U}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your end step, you may manifest the top card of your library. (Put it onto the battlefield face down as a 2/2 creature. Turn it face up any time for its mana cost if it's a creature card.)\nExile a face-down permanent you control face up: You may play that card this turn. (You still pay its costs. Timing rules still apply.)","colors":["U"],"colorIdentity":["U"],"keywords":["Manifest"],"imageUrl":"https://cards.scryfall.io/normal/front/e/6/e6e8229f-a47e-4492-8f4b-10de141eb821.jpg?1783934341","artUrl":"https://cards.scryfall.io/art_crop/front/e/6/e6e8229f-a47e-4492-8f4b-10de141eb821.jpg?1783934341","set":"c18","releasedAt":"2018-08-10","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const kethis = (): CardDef => ({"oracleId":"1bf08ba0-4235-4dea-9722-ed991a3b6044","name":"Kethis, the Hidden Hand","manaCost":"{W}{B}{G}","cmc":3,"typeLine":"Legendary Creature — Elf Advisor","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elf","Advisor"],"oracleText":"Legendary spells you cast cost {1} less to cast.\nExile two legendary cards from your graveyard: Until end of turn, each legendary card in your graveyard gains \"You may play this card from your graveyard.\"","power":"3","toughness":"4","colors":["B","G","W"],"colorIdentity":["B","G","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/e/fe28de73-76f3-4a9e-a020-dbe5921b9be5.jpg?1783932951","artUrl":"https://cards.scryfall.io/art_crop/front/f/e/fe28de73-76f3-4a9e-a020-dbe5921b9be5.jpg?1783932951","set":"m20","releasedAt":"2019-07-12","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const yuna = (): CardDef => ({"oracleId":"77dd6ce0-91fc-4e71-99ff-47cdf3359067","name":"Yuna's Decision","manaCost":"{3}{G}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose one —\n• Continue the Pilgrimage — Sacrifice a creature. If you do, draw a card, then you may put a creature card and/or a land card from your hand onto the battlefield.\n• Find Another Way — Return one or two target permanent cards from your graveyard to your hand.","colors":["G"],"colorIdentity":["G"],"keywords":["Find Another Way","Continue the Pilgrimage"],"imageUrl":"https://cards.scryfall.io/normal/front/5/0/5044eedb-f7d9-4b65-aa5b-fb494d00facd.jpg?1783906349","artUrl":"https://cards.scryfall.io/art_crop/front/5/0/5044eedb-f7d9-4b65-aa5b-fb494d00facd.jpg?1783906349","set":"fic","releasedAt":"2025-06-13","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const immolation = (): CardDef => ({"oracleId":"338747e8-bed8-4e60-8b19-5c2b80799477","name":"Soul Immolation","manaCost":"{3}{R}{R}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"As an additional cost to cast this spell, blight X. X can't be greater than the greatest toughness among creatures you control. (Put X -1/-1 counters on a creature you control.)\nSoul Immolation deals X damage to each opponent and each creature they control.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/3/234b70df-8c34-4da7-946e-b8b55a8df390.jpg?1783904438","artUrl":"https://cards.scryfall.io/art_crop/front/2/3/234b70df-8c34-4da7-946e-b8b55a8df390.jpg?1783904438","set":"ecl","releasedAt":"2026-01-23","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const outOfTime = (): CardDef => ({"oracleId":"8491de1e-dc37-4a89-b4f7-56a2c668f0fc","name":"Out of Time","manaCost":"{1}{W}{W}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, untap all creatures, then those creatures phase out until this enchantment leaves the battlefield. Put a time counter on this enchantment for each creature that phased out this way.\nVanishing (At the beginning of your upkeep, remove a time counter from this enchantment. When the last is removed, sacrifice it.)","colors":["W"],"colorIdentity":["W"],"keywords":["Vanishing"],"imageUrl":"https://cards.scryfall.io/normal/front/4/4/44b0c372-bc10-49f6-9fd4-a482790846e4.jpg?1783914602","artUrl":"https://cards.scryfall.io/art_crop/front/4/4/44b0c372-bc10-49f6-9fd4-a482790846e4.jpg?1783914602","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const diffusion = (): CardDef => ({"oracleId":"048f4bb9-c5da-42d4-9af0-bd8754afce1a","name":"Venser's Diffusion","manaCost":"{2}{U}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Return target nonland permanent or suspended card to its owner's hand.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/b/fbedfc40-7c2f-4a6e-8157-219cafca3548.jpg?1783943119","artUrl":"https://cards.scryfall.io/art_crop/front/f/b/fbedfc40-7c2f-4a6e-8157-219cafca3548.jpg?1783943119","commanderLegal":"legal","set":"fut","releasedAt":"2007-05-04","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const sandMage = (): CardDef => ({"oracleId":"3afe854a-7daa-4745-a5d9-04879e5d940a","name":"Shivan Sand-Mage","manaCost":"{2}{R}{R}","cmc":4,"typeLine":"Creature — Lizard Shaman","supertypes":[],"types":["Creature"],"subtypes":["Lizard","Shaman"],"oracleText":"When this creature enters, choose one —\n• Remove two time counters from target permanent or suspended card.\n• Put two time counters on target permanent with a time counter on it or suspended card.\nSuspend 4—{R}","power":"3","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":["Suspend"],"imageUrl":"https://cards.scryfall.io/normal/front/7/5/75d3e0ff-7738-4f5e-b35a-b9494095ab9f.jpg?1783943104","artUrl":"https://cards.scryfall.io/art_crop/front/7/5/75d3e0ff-7738-4f5e-b35a-b9494095ab9f.jpg?1783943104","commanderLegal":"legal","set":"fut","releasedAt":"2007-05-04","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);

describe("round 288", () => {
  it("every card of the round compiles fully", () => {
    supported(detour(), clockspinning(), timecrafting(), timebug(), furyCharm(), timebender(), racket(), mist(), kethis(), yuna(), immolation(), outOfTime(), diffusion(), sandMage());
  });
});

describe("Endless Detour", () => {
  it("a card in a graveyard: its owner puts it on the bottom of their library", () => {
    const { s: s0, ap, ids, opp } = setup([detour()]);
    const b = putOnBattlefield(s0, opp, bear());
    moveObject(s0, b, "graveyard");
    expect(legalTargets(s0, { kind: "spell", types: [], notTypes: [], notColors: [], orPermanent: { kind: "object", types: [], notTypes: ["Land"], notColors: [], text: "", orCard: { kind: "card", types: [], notTypes: [], notColors: [], text: "" } }, text: "" }, ap).some((t) => t.kind === "object" && t.id === b)).toBe(true);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "topOrBottom" });
    s = settle(answer(s, "bottom"));
    expect(zone(s, b)).toBe("library");
    expect(s.players[opp]!.library.at(-1)).toBe(b);
  });

  it("a nonland permanent goes on top of its owner's library; a spell leaves the stack without being countered (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([detour(), detour()]);
    const b = putOnBattlefield(s0, opp, bear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    s = settle(answer(s, "top"));
    expect(zone(s, b)).toBe("library");
    expect(s.players[opp]!.library[0]).toBe(b);
    // A spell of your own: cast Peek, then Detour it in response; you choose.
    const p = putOnBattlefield(s, ap, peek());
    s.battlefield.splice(s.battlefield.indexOf(p), 1);
    s.objects[p]!.zone = "hand";
    s.players[ap]!.hand.push(p);
    s = run(s, planCast(s, ap, p));
    const item = s.stack.at(-1)!;
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: item.id }]));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "topOrBottom" });
    s = settle(answer(s, "top"));
    expect(zone(s, p)).toBe("library");
    expect(s.players[ap]!.library[0]).toBe(p);
  });
});

/** A card with suspend in `pid`'s exile with `n` time counters: suspended (CR 702.62b). */
const vision = () => card("Ancestral Vision", "Sorcery", "", { oracleText: "Suspend 4—{U}\nTarget player draws three cards." });
function suspended(s: GameState, pid: PlayerId, n: number, def = vision()) {
  const id = putOnBattlefield(s, pid, def);
  moveObject(s, id, "exile");
  s.objects[id]!.counters.time = n;
  return id;
}
const vanisher = () => card("Keldon Marauders", "Creature — Human Warrior", "{1}{R}{R}", { power: "3", toughness: "3", oracleText: "Vanishing 2" });

describe("Clockspinning", () => {
  it("the last time counter off a suspended card: its suspend lets you cast it (rulings)", () => {
    const { s: s0, ap, ids } = setup([clockspinning()]);
    const v = suspended(s0, ap, 1);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(v)])));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "addOrRemoveCounter", about: v, counterKind: "time" });
    s = settle(answer(s, "remove"));
    expect(s.objects[v]!.counters.time ?? 0).toBe(0);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: v });
  });

  it("one kind of counter on a permanent, chosen as it resolves, then another of it; a permanent with none is left alone", () => {
    const { s: s0, ap, ids, opp } = setup([clockspinning(), clockspinning()]);
    const b = putOnBattlefield(s0, opp, bear());
    s0.objects[b]!.counters = { "+1/+1": 2, stun: 1 };
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "counterKind", options: ["+1/+1", "stun"] });
    s = settle(answer(s, "stun"));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "addOrRemoveCounter", counterKind: "stun", options: ["add", "remove"] });
    s = settle(answer(s, "add"));
    expect(s.objects[b]!.counters).toEqual({ "+1/+1": 2, stun: 2 });
    const plain = putOnBattlefield(s, opp, bear());
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(plain)])));
    expect(s.pending).toBeFalsy();
    expect(s.objects[plain]!.counters).toEqual({});
  });

  it("only a suspended card in exile can be its target: not one with no time counter (CR 702.62b)", () => {
    const { s: s0, ap, ids } = setup([clockspinning()]);
    const v = suspended(s0, ap, 2);
    const spent = suspended(s0, ap, 0);
    const plainExiled = suspended(s0, ap, 2, peek("Exiled Peek"));
    const spec = { kind: "object" as const, types: [], notTypes: [], notColors: [], text: "", orSuspended: "any" as const };
    const ok = legalTargets(s0, spec, ap).map((t) => t.id);
    expect(ok).toContain(v);
    expect(ok).not.toContain(spent);
    expect(ok).not.toContain(plainExiled);
    void ids;
  });
});

describe("Timecrafting", () => {
  it("removes X time counters from a suspended card, or puts X on a permanent with a time counter", () => {
    const { s: s0, ap, ids, opp } = setup([timecrafting(), timecrafting()]);
    const v = suspended(s0, opp, 4);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(v)], [0], undefined, 2)));
    expect(s.objects[v]!.counters.time).toBe(2);
    const m = putOnBattlefield(s, opp, vanisher());
    s.objects[m]!.counters.time = 1;
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(m)], [1], undefined, 3)));
    expect(s.objects[m]!.counters.time).toBe(4);
  });
});

describe("Fury Charm", () => {
  it("removes two time counters from a suspended card", () => {
    const { s: s0, ap, ids } = setup([furyCharm()]);
    const v = suspended(s0, ap, 3);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(v)], [2])));
    expect(s.objects[v]!.counters.time).toBe(1);
  });
});

describe("Jhoira's Timebug", () => {
  it("you may put another time counter on a permanent you control, remove one, or do neither; only your own suspended cards", () => {
    const { s: s0, ap, opp } = setup([]);
    const bug = putOnBattlefield(s0, ap, timebug());
    const m = putOnBattlefield(s0, ap, vanisher());
    s0.objects[m]!.counters.time = 1;
    const theirs = suspended(s0, opp, 2);
    const mine = suspended(s0, ap, 2);
    const spec = { kind: "object" as const, types: [], notTypes: [], notColors: [], controller: "you" as const, text: "", orSuspended: "you" as const };
    const ok = legalTargets(s0, spec, ap).map((t) => t.id);
    expect(ok).toContain(mine);
    expect(ok).not.toContain(theirs);
    let s = settle(run(s0, planActivate(s0, ap, bug, 0, [tgt(m)])));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "addOrRemoveCounter", options: ["add", "remove", "none"] });
    s = settle(answer(s, "add"));
    expect(s.objects[m]!.counters.time).toBe(2);
    s.objects[bug]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, bug, 0, [tgt(mine)])));
    s = settle(answer(s, "none"));
    expect(s.objects[mine]!.counters.time).toBe(2);
  });
});

describe("Protection Racket", () => {
  it("each opponent in turn order, after you: a new top card each; paying its mana value in life exiles it, else it goes to your hand", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, racket());
    const order = [1, 2, 3].map((k) => s0.turnOrder[(s0.turnOrder.indexOf(ap) + k) % 4]!);
    // Your top three cards: a 3-drop, a 2-drop, a land.
    const tops = [card("Wastes", "Basic Land"), bear(), card("Three Drop", "Creature — Ox", "{2}{G}", { cmc: 3, power: "3", toughness: "3" })].map((d) => {
      const id = putOnBattlefield(s0, ap, d);
      moveObject(s0, id, "library", { top: true });
      return id;
    }).reverse();
    expect(s0.players[ap]!.library.slice(0, 3)).toEqual(tops);
    let s = passUntil(s0, "upkeep", ap);
    s = settle(s);
    // The first opponent: pays 3 life, the card is exiled.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "punisher", player: order[0], labels: ["Pay 3 life", "Don't"] });
    const life0 = s.players[order[0]!]!.life;
    s = settle(answer(s, "0"));
    expect(s.players[order[0]!]!.life).toBe(life0 - 3);
    expect(zone(s, tops[0]!)).toBe("exile");
    // The second: doesn't pay, the 2-drop goes to your hand.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "punisher", player: order[1], labels: ["Pay 2 life", "Don't"] });
    s = settle(answer(s, "none"));
    expect(zone(s, tops[1]!)).toBe("hand");
    // The third: the land's mana value is 0, so paying 0 life exiles it.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "punisher", player: order[2], labels: ["Pay 0 life", "Don't"] });
    const life2 = s.players[order[2]!]!.life;
    s = settle(answer(s, "0"));
    expect(zone(s, tops[2]!)).toBe("exile");
    expect(s.players[order[2]!]!.life).toBe(life2);
    expect(s.pending).toBeFalsy();
  });

  it("an opponent with less life than the mana value can't pay (CR 119.4)", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, racket());
    const first = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    const id = putOnBattlefield(s0, ap, card("Three Drop", "Creature — Ox", "{2}{G}", { cmc: 3, power: "3", toughness: "3" }));
    moveObject(s0, id, "library", { top: true });
    s0.players[first]!.life = 2;
    let s = settle(passUntil(s0, "upkeep", ap));
    expect(zone(s, id)).toBe("hand");
    expect(s.pending?.player).not.toBe(first);
  });
});

describe("Primordial Mist", () => {
  it("exiles a face-down permanent you control face up as its cost; you may play that card this turn, paying its costs (rulings)", () => {
    const morph = () => card("Hidden Beast", "Creature — Beast", "{3}{G}", { cmc: 4, power: "4", toughness: "4", oracleText: "Morph {2}{G}" });
    const { s: s0, ap, ids } = setup([morph()]);
    const mistId = putOnBattlefield(s0, ap, mist());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { faceDown: true })));
    expect(s.objects[ids[0]!]!.faceDown).toBeTruthy();
    expect(zone(s, ids[0]!)).toBe("battlefield");
    s = settle(run(s, planActivate(s, ap, mistId, 0, undefined, undefined, undefined, undefined, { sacrifice: [ids[0]!] })));
    const o = s.objects[ids[0]!]!;
    expect(o.zone).toBe("exile");
    expect(o.faceDown).toBeFalsy();
    expect(o.mayPlay).toMatchObject({ player: ap, until: "thisTurn" });
    // Cast from exile for its mana cost.
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.objects[ids[0]!]!.faceDown).toBeFalsy();
  });

  it("the permission ends with the turn: the card stays exiled (rulings)", () => {
    const morph = () => card("Hidden Beast", "Creature — Beast", "{3}{G}", { cmc: 4, power: "4", toughness: "4", oracleText: "Morph {2}{G}" });
    const { s: s0, ap, ids } = setup([morph()]);
    const mistId = putOnBattlefield(s0, ap, mist());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { faceDown: true })));
    s = settle(run(s, planActivate(s, ap, mistId, 0, undefined, undefined, undefined, undefined, { sacrifice: [ids[0]!] })));
    s = passUntil(s, "end", ap);
    s = settle(s);
    if (s.pending?.kind === "chooseMay") s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    const next = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    s = passUntil(s, "upkeep", next);
    expect(zone(s, ids[0]!)).toBe("exile");
    expect(planCast(s, ap, ids[0]!)).toBeNull();
  });
});

describe("Kethis, the Hidden Hand", () => {
  const legend = (name: string) => card(name, "Legendary Creature — Human", "{1}{G}", { cmc: 2, power: "2", toughness: "2", supertypes: ["Legendary"] });
  const yard = (s: GameState, pid: PlayerId, def: CardDef) => {
    const id = putOnBattlefield(s, pid, def);
    moveObject(s, id, "graveyard");
    return id;
  };
  it("the legendary cards in your graveyard as it resolves may be played this turn; one put there later can't (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const k = putOnBattlefield(s0, ap, kethis());
    const fodder = [yard(s0, ap, legend("Old One")), yard(s0, ap, legend("Old Two"))];
    const hero = yard(s0, ap, legend("Hero"));
    const land = yard(s0, ap, card("Legendary Vale", "Legendary Land", "", { supertypes: ["Legendary"] }));
    const plain = yard(s0, ap, bear());
    let s = settle(run(s0, planActivate(s0, ap, k, 0, undefined, undefined, undefined, undefined, { exileCards: fodder } as never)));
    expect(fodder.map((id) => zone(s, id))).toEqual(["exile", "exile"]);
    expect(s.objects[hero]!.mayPlay).toMatchObject({ player: ap, until: "thisTurn" });
    expect(s.objects[plain]!.mayPlay).toBeUndefined();
    const late = yard(s, ap, legend("Latecomer"));
    expect(planCast(s, ap, late, undefined, undefined, undefined, undefined, { via: "permission" })).toBeNull();
    // Cast for its cost less Kethis's {1}; the land with the turn's land play.
    s = settle(run(s, planCast(s, ap, hero, undefined, undefined, undefined, undefined, { via: "permission" })));
    expect(zone(s, hero)).toBe("battlefield");
    s = act(s, { type: "playLand", player: ap, objectId: land } as Action);
    expect(zone(s, land)).toBe("battlefield");
  });
});

describe("Yuna's Decision", () => {
  const toHand = (s: GameState, pid: PlayerId, def: CardDef) => {
    const id = putOnBattlefield(s, pid, def);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "hand";
    s.players[pid]!.hand.push(id);
    return id;
  };
  it("sacrifice a creature, draw, then a creature card and a land card from your hand at once, not as your land play (rulings)", () => {
    const { s: s0, ap, ids } = setup([yuna()]);
    const victim = putOnBattlefield(s0, ap, bear());
    const big = toHand(s0, ap, card("Big Ox", "Creature — Ox", "{5}{G}", { cmc: 6, power: "6", toughness: "6" }));
    const other = toHand(s0, ap, card("Other Ox", "Creature — Ox", "{5}{G}", { cmc: 6, power: "6", toughness: "6" }));
    const land = toHand(s0, ap, card("Wastes", "Basic Land"));
    s0.players[ap]!.landsPlayedThisTurn = 1;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, [0])));
    if (s.pending?.kind === "pickPermanents") s = settle(act(s, { type: "pickPermanents", player: ap, ids: [victim] }));
    expect(zone(s, victim)).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", fromHand: true, max: 2 });
    expect((s.pending as { oneOfEach?: unknown[] }).oneOfEach).toHaveLength(2);
    // Two creature cards don't fit "a creature card and/or a land card".
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [big, other] } as Action)).toThrow();
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [big, land] } as Action));
    expect(zone(s, big)).toBe("battlefield");
    expect(zone(s, land)).toBe("battlefield");
    expect(zone(s, other)).toBe("hand");
  });

  it("returns one or two target permanent cards from your graveyard to your hand", () => {
    const { s: s0, ap, ids } = setup([yuna()]);
    const a = putOnBattlefield(s0, ap, bear());
    moveObject(s0, a, "graveyard");
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(a), { kind: "none" }], [1])));
    expect(zone(s, a)).toBe("hand");
  });
});

describe("Soul Immolation", () => {
  it("blight X as it's cast, X no more than your greatest toughness; X damage to each opponent and each creature they control", () => {
    const { s: s0, ap, ids, opp } = setup([immolation()]);
    const big = putOnBattlefield(s0, ap, card("Wall Ox", "Creature — Ox", "{3}", { power: "1", toughness: "4" }));
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, card("Hill Ox", "Creature — Ox", "{3}", { power: "3", toughness: "3" }));
    // X = 5 is more than the greatest toughness (4).
    expect(planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 5, { counterOn: [big] })).toBeNull();
    const lifeBefore = s0.players[opp]!.life;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 3, { counterOn: [big] })));
    expect(s.objects[big]!.counters["-1/-1"]).toBe(3);
    expect(s.players[opp]!.life).toBe(lifeBefore - 3);
    expect(zone(s, theirs)).toBe("graveyard");
    expect(zone(s, mine)).toBe("battlefield");
    expect(s.players[ap]!.life).toBe(40);
  });

  it("can't be cast with no creature to blight (rulings)", () => {
    const { s, ap, ids } = setup([immolation()]);
    expect(planCast(s, ap, ids[0]!, undefined, undefined, undefined, 0)).toBeNull();
  });
});

describe("Out of Time", () => {
  it("untaps every creature, phases them out with a time counter for each; they come back untapped when it leaves (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([outOfTime()]);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, opp, bear());
    s0.objects[b]!.tapped = true;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[a]!.phased).toBeTruthy();
    expect(s.objects[b]!.phased).toBeTruthy();
    expect(s.objects[b]!.tapped).toBe(false);
    expect(s.objects[ids[0]!]!.counters.time).toBe(2);
    // Not in the next untap step (rulings).
    s = passUntil(s, "main1", opp);
    expect(s.objects[b]!.phased).toBeTruthy();
    // It leaves: they phase in, untapped.
    s.objects[b]!.tapped = false;
    moveObject(s, ids[0]!, "graveyard");
    expect(s.objects[a]!.phased).toBeFalsy();
    expect(s.objects[b]!.phased).toBeFalsy();
    expect(s.objects[a]!.tapped).toBe(false);
  });

  it("with no creatures, no time counter: it stays (rulings)", () => {
    const { s: s0, ap, ids } = setup([outOfTime()]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.objects[ids[0]!]!.counters.time ?? 0).toBe(0);
  });
});

describe("Venser's Diffusion", () => {
  it("returns a suspended card from exile to its owner's hand", () => {
    const { s: s0, ap, ids, opp } = setup([diffusion()]);
    const v = suspended(s0, opp, 3);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(v)])));
    expect(zone(s, v)).toBe("hand");
    expect(s.players[opp]!.hand).toContain(v);
  });
});

describe("Shivan Sand-Mage", () => {
  it("as it enters, puts two time counters on a suspended card", () => {
    const { s: s0, ap, ids, opp } = setup([sandMage()]);
    const v = suspended(s0, opp, 1);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseModes" });
    s = act(s, { type: "chooseModes", player: ap, modes: [1] } as Action);
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(v)] } as Action);
    s = settle(s);
    expect(s.objects[v]!.counters.time).toBe(3);
  });
});
