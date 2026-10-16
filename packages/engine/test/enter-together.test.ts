// Several cards put onto the battlefield from among the top cards of a library, at the same time: "Put up to two creature
// cards with mana value 3 or less from among them onto the battlefield" (Collected Company), "any number of permanent
// cards with mana value X or less" (Genesis Wave), "all Goblin creature cards" (Muxus). They enter together: each one's
// replacement effects and "enters with" counts don't see the others (CR 614.12), an Aura or a Clone can't pick one entering
// with it (rulings on Genesis Ultimatum and Clone), and each one's enters abilities see the others enter (CR 603.6a).

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, forest, island, passAll, putOnBattlefield, setup, swamp } from "./helpers";
import { botActions, isFullySupported, planActivate, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
/** Resolve everything; a pending choice other than the one we test is answered as a bot would. */
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending) && s.pending?.kind !== "searchLibrary" && !(s.pending?.kind === "chooseOption" && s.pending.what === "copy"); i++) {
    const pid = waitingOn(s)!;
    s = act(s, s.pending ? botActions(s, pid)[0]! : { type: "passPriority", player: pid });
  }
  return s;
};
/** These cards on top of `pid`'s library, the first one on top. */
const stack = (s: GameState, pid: PlayerId, defs: CardDef[]) => {
  const ids = defs.map((def) => {
    const id = putOnBattlefield(s, pid, def);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "library";
    return id;
  });
  s.players[pid]!.library = [...ids, ...s.players[pid]!.library];
  return ids;
};
const castX = (s: GameState, pid: PlayerId, id: string, x: number) => {
  const plan = planCast(s, pid, id, undefined, undefined, undefined, x);
  if (!plan) throw new Error("can't cast");
  for (const a of plan) s = act(s, a);
  return passAll(s);
};
const pick = (s: GameState, pid: PlayerId, found: string[]) => settle(act(s, { type: "searchLibrary", player: pid, found }));
const zone = (s: GameState, id: string) => s.objects[id]!.zone;

// Real oracle text (Scryfall).
const company = card("Collected Company", "Instant", "{3}{G}", { oracleText: "Look at the top six cards of your library. Put up to two creature cards with mana value 3 or less from among them onto the battlefield. Put the rest on the bottom of your library in any order." });
const survey = card("Cartographer's Survey", "Sorcery", "{3}{G}", { oracleText: "Look at the top seven cards of your library. Put up to two land cards from among them onto the battlefield tapped. Put the rest on the bottom of your library in a random order." });
const gatewatch = card("Deploy the Gatewatch", "Sorcery", "{4}{W}{W}", { oracleText: "Look at the top seven cards of your library. Put up to two planeswalker cards from among them onto the battlefield. Put the rest on the bottom of your library in a random order." });
const ultimatum = card("Genesis Ultimatum", "Sorcery", "{G}{G}{U}{U}{U}{R}{R}", { oracleText: "Look at the top five cards of your library. Put any number of permanent cards from among them onto the battlefield and the rest into your hand. Exile Genesis Ultimatum." });
const wave = card("Genesis Wave", "Sorcery", "{X}{G}{G}{G}", { oracleText: "Reveal the top X cards of your library. You may put any number of permanent cards with mana value X or less from among them onto the battlefield. Then put all cards revealed this way that weren't put onto the battlefield into your graveyard." });
const muxus = card("Muxus, Goblin Grandee", "Legendary Creature — Goblin Noble", "{4}{R}{R}", { power: "4", toughness: "4", supertypes: ["Legendary"], oracleText: "When Muxus enters, reveal the top six cards of your library. Put all Goblin creature cards with mana value 5 or less from among them onto the battlefield and the rest on the bottom of your library in a random order.\nWhenever Muxus attacks, it gets +1/+1 until end of turn for each other Goblin you control." });
const nissa = card("Nissa, Nature's Artisan", "Legendary Planeswalker — Nissa", "{4}{G}{G}", { loyalty: "5", supertypes: ["Legendary"], oracleText: "+3: You gain 3 life.\n−4: Reveal the top two cards of your library. Put all land cards from among them onto the battlefield and the rest into your hand.\n−12: Creatures you control get +5/+5 and gain trample until end of turn." });
const directive = card("Saheeli's Directive", "Sorcery", "{X}{R}{R}{R}", { keywords: ["Improvise"], oracleText: "Improvise (Each artifact you tap after you're done activating mana abilities pays for {1}.)\nReveal the top X cards of your library. You may put any number of artifact cards with mana value X or less from among them onto the battlefield. Then put all cards revealed this way that weren't put onto the battlefield into your graveyard." });
const festival = card("Storm the Festival", "Sorcery", "{3}{G}{G}{G}", { keywords: ["Flashback"], oracleText: "Look at the top five cards of your library. You may put up to two permanent cards with mana value 5 or less from among them onto the battlefield. Put the rest on the bottom of your library in a random order.\nFlashback {7}{G}{G}{G} (You may cast this card from your graveyard for its flashback cost. Then exile it.)" });
const battlefront = card("United Battlefront", "Sorcery", "{3}{W}", { oracleText: "Look at the top seven cards of your library. Put up to two noncreature, nonland permanent cards with mana value 3 or less from among them onto the battlefield. Put the rest on the bottom of your library in a random order." });
const arkbow = card("Vivien's Arkbow", "Legendary Artifact", "{1}{G}", { supertypes: ["Legendary"], oracleText: "{X}, {T}, Discard a card: Look at the top X cards of your library. You may put a creature card with mana value X or less from among them onto the battlefield. Put the rest on the bottom of your library in a random order." });
const forestGate = card("Through the Forest Gate", "Sorcery", "{6}{G}{G}", { oracleText: "Look at the top twenty cards of your library, put any number of land cards from among them onto the battlefield tapped, then shuffle. You gain 8 life." });

const warden = () => card("Soul Warden", "Creature — Human Cleric", "{W}", { power: "1", toughness: "1", oracleText: "Whenever another creature enters, you gain 1 life." });
const giant = () => card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });
const goblin = (name: string, cost: string) => card(name, "Creature — Goblin", cost, { power: "1", toughness: "1" });
const chauffeur = card("Boss's Chauffeur", "Creature — Elf Citizen", "{4}{W}", { power: "0", toughness: "0", keywords: ["Alliance"], oracleText: "This creature enters with a number of +1/+1 counters on it equal to one plus the number of other creatures you control.\nAlliance — Whenever another creature you control enters, put a +1/+1 counter on this creature.\nWhen this creature dies, create a 1/1 green and white Citizen creature token for each +1/+1 counter on it." });
const clone = card("Clone", "Creature — Shapeshifter", "{3}{U}", { power: "0", toughness: "0", oracleText: "You may have Clone enter as a copy of any creature on the battlefield." });
const holyStrength = card("Holy Strength", "Enchantment — Aura", "{W}", { oracleText: "Enchant creature\nEnchanted creature gets +1/+2." });

describe("several cards from among them onto the battlefield, at the same time", () => {
  it("compiles them", () => supported(company, survey, gatewatch, ultimatum, wave, muxus, nissa, directive, festival, battlefront, arkbow, forestGate));

  it("Collected Company: two Soul Wardens enter together and each sees the other", () => {
    let { s, ap, ids } = setup([company]);
    const [w1, w2, g] = stack(s, ap, [warden(), warden(), giant(), forest, forest, forest]);
    const life = s.players[ap]!.life;
    s = settle(cast(s, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 2 });
    if (s.pending?.kind === "searchLibrary") expect(s.pending.cards).toEqual([w1, w2]); // not the 4-mana Hill Giant
    s = pick(s, ap, [w1!, w2!]);
    expect([zone(s, w1!), zone(s, w2!), zone(s, g!)]).toEqual(["battlefield", "battlefield", "library"]);
    expect(s.players[ap]!.life).toBe(life + 2);
    expect(s.players[ap]!.library.slice(-4)).toContain(g); // the rest on the bottom
  });

  it("Genesis Wave: mana value X or less; Boss's Chauffeur doesn't count the bear entering with it; the rest to the graveyard", () => {
    let { s, ap, ids } = setup([wave]);
    const [ch, b, g, f] = stack(s, ap, [chauffeur, bear(), giant(), forest, island]);
    s = settle(castX(s, ap, ids[0]!, 5));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", max: 5 });
    s = pick(s, ap, [ch!, b!, f!]);
    expect([zone(s, ch!), zone(s, b!), zone(s, f!), zone(s, g!)]).toEqual(["battlefield", "battlefield", "battlefield", "graveyard"]);
    // One plus the other creatures it saw (none: the bear entered at the same time), then one from alliance, which sees
    // the bear enter with it (CR 603.6a).
    expect(s.objects[ch!]!.counters["+1/+1"]).toBe(2);
    const two = setup([wave]);
    const [g2, f2] = stack(two.s, two.ap, [giant(), forest]);
    s = settle(castX(two.s, two.ap, two.ids[0]!, 2));
    if (s.pending?.kind === "searchLibrary") expect(s.pending.cards).toEqual([f2]);
    s = pick(s, two.ap, []);
    expect([zone(s, g2!), zone(s, f2!)]).toEqual(["graveyard", "graveyard"]);
  });

  it("A Clone entering with Hill Giant can't copy it", () => {
    let { s, ap, opp, ids } = setup([wave]);
    const theirs = putOnBattlefield(s, opp, bear());
    const [c, g] = stack(s, ap, [clone, giant()]);
    s = settle(castX(s, ap, ids[0]!, 4));
    s = pick(s, ap, [c!, g!]);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "copy", options: [theirs, "none"] });
  });

  it("Genesis Ultimatum: an Aura can't enchant a creature entering with it, so it goes to the hand with the rest", () => {
    let { s, ap, ids } = setup([ultimatum]);
    const [b, h, f, i, sw] = stack(s, ap, [bear(), holyStrength, forest, island, swamp]);
    s = settle(cast(s, ap, ids[0]!));
    s = pick(s, ap, [b!, h!, f!]);
    expect([zone(s, b!), zone(s, h!), zone(s, f!), zone(s, i!), zone(s, sw!)]).toEqual(["battlefield", "hand", "battlefield", "hand", "hand"]);
    expect(zone(s, ids[0]!)).toBe("exile");
  });

  it("Genesis Ultimatum: an Aura enchants a creature that was already there", () => {
    let { s, ap, ids } = setup([ultimatum]);
    const mine = putOnBattlefield(s, ap, bear());
    const [h] = stack(s, ap, [holyStrength, forest, forest, forest, forest]);
    s = settle(cast(s, ap, ids[0]!));
    s = pick(s, ap, [h!]);
    expect(zone(s, h!)).toBe("battlefield");
    expect(s.objects[h!]!.attachedTo).toBe(mine);
  });

  it("Muxus puts all the Goblins with mana value 5 or less, without asking", () => {
    let { s, ap, ids } = setup([muxus]);
    const [a, b, big] = stack(s, ap, [goblin("Goblin A", "{1}{R}"), goblin("Goblin B", "{4}{R}"), goblin("Goblin C", "{5}{R}"), forest, forest, forest]);
    s = settle(cast(s, ap, ids[0]!));
    expect(s.pending).toBeNull();
    expect([zone(s, a!), zone(s, b!), zone(s, big!)]).toEqual(["battlefield", "battlefield", "library"]);
  });

  it("Nissa, Nature's Artisan −4: the lands onto the battlefield, the rest into your hand", () => {
    let { s, ap } = setup([]);
    const n = putOnBattlefield(s, ap, nissa);
    s.objects[n]!.counters.loyalty = 5;
    const [f, b] = stack(s, ap, [forest, bear()]);
    s = settle(activate(s, ap, n, 1));
    expect([zone(s, f!), zone(s, b!)]).toEqual(["battlefield", "hand"]);
  });

  it("Through the Forest Gate: any number of lands tapped, then shuffle, then 8 life", () => {
    let { s, ap, ids } = setup([forestGate]);
    const [f1, f2] = stack(s, ap, [forest, forest, bear()]);
    const life = s.players[ap]!.life;
    s = settle(cast(s, ap, ids[0]!));
    s = pick(s, ap, [f1!, f2!]);
    expect([zone(s, f1!), zone(s, f2!)]).toEqual(["battlefield", "battlefield"]);
    expect(s.objects[f1!]!.tapped).toBe(true);
    expect(s.players[ap]!.life).toBe(life + 8);
  });

  it("Vivien's Arkbow: the X it was activated with", () => {
    let { s, ap, ids } = setup([bear()]);
    const bow = putOnBattlefield(s, ap, arkbow);
    const [g, b] = stack(s, ap, [giant(), bear()]);
    const plan = planActivate(s, ap, bow, 0, undefined, undefined, undefined, 2, { discard: [ids[0]!] });
    if (!plan) throw new Error("can't activate");
    for (const a of plan) s = act(s, a);
    s = settle(passAll(s));
    if (s.pending?.kind === "searchLibrary") expect(s.pending.cards).toEqual([b]);
    else throw new Error(`no pick: ${JSON.stringify(s.pending)}`);
    s = pick(s, ap, [b!]);
    expect([zone(s, b!), zone(s, g!)]).toEqual(["battlefield", "library"]);
  });
});
