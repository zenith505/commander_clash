// Lane B, round 89: unsupported cards from the bottom of the popularity list (`npm run popular -- --least`): one-line
// templates.

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, blockProblem, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, tapPermanent, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PendingDecision, type PlayerId, type TargetChoice } from "../src";
import { nextRandom } from "../src/rng";
import { pt } from "./helpers";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; questions of the players in `me` stop it, others the bots answer. */
const settle = (s: GameState, opts: { may?: boolean; me?: PlayerId[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay" && !opts.me?.includes(p.player)) s = act(s, { type: "chooseMay", player: p.player, yes: opts.may ?? true });
    else if (p && opts.me?.includes(p.player)) return s;
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes priority until a question of this kind comes up. */
const toPending = (s: GameState, kind: PendingDecision["kind"]) => {
  for (let i = 0; i < 100; i++) {
    if (s.pending?.kind === kind) return s;
    if (s.pending) throw new Error(`asked ${s.pending.kind} first`);
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  throw new Error(`never asked ${kind}`);
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices: CostChoices = {}, x?: number) => run(s, planCast(s, pid, id, targets, undefined, "auto", x, choices));
/** Moves a new card for `def` into `pid`'s hand, library (on top) or graveyard. */
const toZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "library" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Empties `pid`'s hand (into exile), then gives them `defs`. */
const handOf = (s: GameState, pid: PlayerId, defs: CardDef[]) => {
  for (const id of [...s.players[pid]!.hand]) {
    s.players[pid]!.hand.splice(s.players[pid]!.hand.indexOf(id), 1);
    s.objects[id]!.zone = "exile";
    s.players[pid]!.exile.push(id);
  }
  invalidateCharacteristics(s);
  return defs.map((d) => toZone(s, pid, d, "hand"));
};
const hand = (s: GameState, pid: PlayerId) => s.players[pid]!.hand;
const lifeOf = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const counters = (s: GameState, id: string, kind: string) => (s.objects[id]!.counters as Record<string, number>)[kind] ?? 0;
const onField = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).name === name);
const opponentsOf = (s: GameState, ap: PlayerId) => [1, 2, 3].map((i) => s.turnOrder[(s.turnOrder.indexOf(ap) + i) % 4]!);
const abilityIndex = (s: GameState, id: string, re: RegExp) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => re.test(a.text ?? ""));
/** An Aura put onto the battlefield attached to `host`. */
const attached = (s: GameState, pid: PlayerId, def: CardDef, host: string) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.attachedTo = host;
  invalidateCharacteristics(s);
  return id;
};
/** Sets the game's random state so the next flips come out as `wins` (true: won). */
function rig(s: GameState, ...wins: boolean[]) {
  for (let x = 1; x < 1_000_000; x++) {
    const r = { rngState: x };
    if (wins.every((w) => nextRandom(r) < 0.5 === w)) {
      s.rngState = x;
      return;
    }
  }
  throw new Error("no such state");
}
/** `pid` gets priority with the stack as it is: the players before them pass. */
const priorityTo = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 4 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(waitingOn(s)).toBe(pid);
  return s;
};

// Real oracle text (Scryfall).
const hakim = (): CardDef => ({"oracleId": "43e99cba-a6e3-4abc-a92b-aaf5839c72d2", "name": "Hakim, Loreweaver", "manaCost": "{3}{U}{U}", "cmc": 5, "typeLine": "Legendary Creature — Human Wizard", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Human", "Wizard"], "oracleText": "Flying\n{U}{U}: Return target Aura card from your graveyard to the battlefield attached to Hakim. Activate only during your upkeep and only if Hakim isn't enchanted.\n{U}{U}, {T}: Destroy all Auras attached to Hakim.", "power": "2", "toughness": "4", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Flying"], "layout": "normal"}) as CardDef;
const hive = (): CardDef => ({"oracleId": "846bedc3-a1e0-4f11-a095-85b60ad482da", "name": "Wirefly Hive", "manaCost": "{3}", "cmc": 3, "typeLine": "Artifact", "supertypes": [], "types": ["Artifact"], "subtypes": [], "oracleText": "{3}, {T}: Flip a coin. If you win the flip, create a 2/2 colorless Insect artifact creature token with flying named Wirefly. If you lose the flip, destroy all permanents named Wirefly.", "colors": [], "colorIdentity": [], "keywords": [], "layout": "normal"}) as CardDef;
const kites = (): CardDef => ({"oracleId": "6efd11c8-be8a-4d44-a776-66d058638ad1", "name": "Goblin Kites", "manaCost": "{1}{R}", "cmc": 2, "typeLine": "Enchantment", "supertypes": [], "types": ["Enchantment"], "subtypes": [], "oracleText": "{R}: Target creature you control with toughness 2 or less gains flying until end of turn. Flip a coin at the beginning of the next end step. If you lose the flip, sacrifice that creature.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "layout": "normal"}) as CardDef;
const guildmage = (): CardDef => ({"oracleId": "8b70d296-2756-4bda-b51e-f93be395fce7", "name": "Simic Guildmage", "manaCost": "{G/U}{G/U}", "cmc": 2, "typeLine": "Creature — Elf Wizard", "supertypes": [], "types": ["Creature"], "subtypes": ["Elf", "Wizard"], "oracleText": "({G/U} can be paid with either {G} or {U}.)\n{1}{G}: Move a +1/+1 counter from target creature onto another target creature with the same controller.\n{1}{U}: Attach target Aura attached to a permanent to another permanent with the same controller.", "power": "2", "toughness": "2", "colors": ["G", "U"], "colorIdentity": ["G", "U"], "keywords": [], "layout": "normal"}) as CardDef;
const alteration = (): CardDef => ({"oracleId": "c80935bf-c17f-4940-ad9f-3f4e3e8f71bc", "name": "Enchantment Alteration", "manaCost": "{U}", "cmc": 1, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Attach target Aura attached to a creature or land to another permanent of that type.", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "layout": "normal"}) as CardDef;
const spinners = (): CardDef => ({"oracleId": "b881abd7-1fe7-4404-b9ba-fb64869126fc", "name": "Glamer Spinners", "manaCost": "{4}{W/U}", "cmc": 5, "typeLine": "Creature — Faerie Wizard", "supertypes": [], "types": ["Creature"], "subtypes": ["Faerie", "Wizard"], "oracleText": "Flash\nFlying\nWhen this creature enters, attach all Auras enchanting target permanent to another permanent with the same controller.", "power": "2", "toughness": "4", "colors": ["U", "W"], "colorIdentity": ["U", "W"], "keywords": ["Flying", "Flash"], "layout": "normal"}) as CardDef;
const tanglewalker = (): CardDef => ({"oracleId": "00e9c357-5d0b-45cc-a5fd-70ac1f327d28", "name": "Tanglewalker", "manaCost": "{2}{G}", "cmc": 3, "typeLine": "Creature — Dryad", "supertypes": [], "types": ["Creature"], "subtypes": ["Dryad"], "oracleText": "Each creature you control can't be blocked as long as defending player controls an artifact land.", "power": "2", "toughness": "2", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "layout": "normal"}) as CardDef;
const raker = (): CardDef => ({"oracleId": "e0a95a8e-5867-481b-9e85-e2d5386362b8", "name": "Glint Raker", "manaCost": "{3}{U}", "cmc": 4, "typeLine": "Creature — Drake", "supertypes": [], "types": ["Creature"], "subtypes": ["Drake"], "oracleText": "Flying\nThis creature gets +X/+0, where X is the greatest mana value among artifacts you control.\nWhenever this creature deals combat damage to a player, you may reveal that many cards from the top of your library. Put an artifact card revealed this way into your hand and the rest into your graveyard.", "power": "1", "toughness": "3", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Flying"], "layout": "normal"}) as CardDef;
const rayne = (): CardDef => ({"oracleId": "6933a7bf-10ed-46c8-a49c-ce200bce3eea", "name": "Rayne, Academy Chancellor", "manaCost": "{2}{U}", "cmc": 3, "typeLine": "Legendary Creature — Human Wizard", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Human", "Wizard"], "oracleText": "Whenever you or a permanent you control becomes the target of a spell or ability an opponent controls, you may draw a card. You may draw an additional card if Rayne is enchanted.", "power": "1", "toughness": "1", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "layout": "normal"}) as CardDef;
const torch = (): CardDef => ({"oracleId": "c629feae-084c-452f-9c09-4b9716331498", "name": "Kaervek's Torch", "manaCost": "{X}{R}", "cmc": 1, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "As long as Kaervek's Torch is on the stack, spells that target it cost {2} more to cast.\nKaervek's Torch deals X damage to any target.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "layout": "normal"}) as CardDef;
const purge = (): CardDef => ({"oracleId": "df032801-fccf-4bff-aa88-d01650b6c81e", "name": "Phyrexian Purge", "manaCost": "{2}{B}{R}", "cmc": 4, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "This spell costs 3 life more to cast for each target.\nDestroy any number of target creatures.", "colors": ["B", "R"], "colorIdentity": ["B", "R"], "keywords": [], "layout": "normal"}) as CardDef;
const distortion = (): CardDef => ({"oracleId": "b0a16783-31c2-4b2a-835d-774dc385f99a", "name": "Temporal Distortion", "manaCost": "{3}{U}{U}", "cmc": 5, "typeLine": "Enchantment", "supertypes": [], "types": ["Enchantment"], "subtypes": [], "oracleText": "Whenever a creature or land becomes tapped, put an hourglass counter on it.\nEach permanent with an hourglass counter on it doesn't untap during its controller's untap step.\nAt the beginning of each player's upkeep, remove all hourglass counters from permanents that player controls.", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "layout": "normal"}) as CardDef;
const leovold = (): CardDef => ({"oracleId": "d5d91377-fd66-4dbe-a092-07f2ea379ca7", "name": "Leovold, Emissary of Trest", "manaCost": "{B}{G}{U}", "cmc": 3, "typeLine": "Legendary Creature — Elf Advisor", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Elf", "Advisor"], "oracleText": "Each opponent can't draw more than one card each turn.\nWhenever you or a permanent you control becomes the target of a spell or ability an opponent controls, you may draw a card.", "power": "3", "toughness": "3", "colors": ["B", "G", "U"], "colorIdentity": ["B", "G", "U"], "keywords": [], "layout": "normal"}) as CardDef;
const pacifism = (): CardDef => ({"oracleId": "5f5e0b10-c8cf-450c-bfd3-bcb0528ec330", "name": "Pacifism", "manaCost": "{1}{W}", "cmc": 2, "typeLine": "Enchantment — Aura", "supertypes": [], "types": ["Enchantment"], "subtypes": ["Aura"], "oracleText": "Enchant creature\nEnchanted creature can't attack or block.", "colors": ["W"], "colorIdentity": ["W"], "keywords": ["Enchant"], "layout": "normal"}) as CardDef;
const shock = (): CardDef => ({"oracleId": "a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d", "name": "Shock", "manaCost": "{R}", "cmc": 1, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Shock deals 2 damage to any target.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "layout": "normal"}) as CardDef;
const cancel = (): CardDef => ({"oracleId": "7d00fb28-ea6c-49a9-b4af-ffb38860a9a7", "name": "Cancel", "manaCost": "{1}{U}{U}", "cmc": 3, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Counter target spell.", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "layout": "normal"}) as CardDef;
const holy = (): CardDef => ({"oracleId": "9357de36-f8be-4f49-b2c8-9fe9eaf82b07", "name": "Holy Strength", "manaCost": "{W}", "cmc": 1, "typeLine": "Enchantment — Aura", "supertypes": [], "types": ["Enchantment"], "subtypes": ["Aura"], "oracleText": "Enchant creature\nEnchanted creature gets +1/+2.", "colors": ["W"], "colorIdentity": ["W"], "keywords": ["Enchant"], "layout": "normal"}) as CardDef;
const darksteel = (): CardDef => ({"oracleId": "8dc067bf-f78f-4ac4-b6e7-b305c42cf0bc", "name": "Darksteel Citadel", "manaCost": "", "cmc": 0, "typeLine": "Artifact Land", "supertypes": [], "types": ["Artifact", "Land"], "subtypes": [], "oracleText": "Indestructible\n{T}: Add {C}.", "colors": [], "colorIdentity": [], "keywords": ["Indestructible"], "producedMana": ["C"], "layout": "normal"}) as CardDef;
const wildGrowth = (): CardDef => ({"oracleId": "706ae742-1807-44b7-a4fa-f2e26f61519a", "name": "Wild Growth", "manaCost": "{G}", "cmc": 1, "typeLine": "Enchantment — Aura", "supertypes": [], "types": ["Enchantment"], "subtypes": ["Aura"], "oracleText": "Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional {G}.", "colors": ["G"], "colorIdentity": ["G"], "keywords": ["Enchant"], "producedMana": ["G"], "layout": "normal"}) as CardDef;
const bears = () => card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });
const giant = () => card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });
const relic = () => card("Test Relic", "Artifact", "{2}", { cmc: 2 });
const wastes = () => card("Test Wastes", "Land", "", { oracleText: "{T}: Add {C}." });

describe("Lane B round 89", () => {
  it("all of them are supported", () => {
    supported(hakim(), hive(), kites(), guildmage(), alteration(), spinners(), tanglewalker(), raker(), rayne(), torch(), purge(), distortion(), leovold());
  });

  it("Hakim, Loreweaver: returns an Aura card attached to him, only during your upkeep and only while he isn't enchanted", () => {
    const { s: s0, ap } = setup([]);
    handOf(s0, ap, []);
    const h = putOnBattlefield(s0, ap, hakim());
    const aura = toZone(s0, ap, holy(), "graveyard");
    const ix = abilityIndex(s0, h, /^\{U\}\{U\}: Return/);
    // Not during the main phase.
    expect(planActivate(s0, ap, h, ix, [tgt(aura)])).toBeNull();
    let s = passUntil(act(s0, { type: "passPriority", player: waitingOn(s0)! }), "upkeep", ap);
    s = settle(s);
    expect(s.step).toBe("upkeep");
    s.players[ap]!.manaPool.U = 4;
    s = settle(run(s, planActivate(s, ap, h, ix, [tgt(aura)])));
    expect(zone(s, aura)).toBe("battlefield");
    expect(s.objects[aura]!.attachedTo).toBe(h);
    expect(pt(s, h)).toBe("3/6");
    // Enchanted now: not again.
    const other = toZone(s, ap, pacifism(), "graveyard");
    expect(planActivate(s, ap, h, ix, [tgt(other)])).toBeNull();
  });

  it("Hakim, Loreweaver: destroys all Auras attached to him, not Auras on other permanents", () => {
    const { s: s0, ap } = setup([]);
    const h = putOnBattlefield(s0, ap, hakim());
    const b = putOnBattlefield(s0, ap, bears());
    const one = attached(s0, ap, holy(), h);
    const two = attached(s0, ap, pacifism(), h);
    const elsewhere = attached(s0, ap, holy(), b);
    const s = settle(run(s0, planActivate(s0, ap, h, abilityIndex(s0, h, /Destroy all Auras/), [])));
    expect(zone(s, one)).toBe("graveyard");
    expect(zone(s, two)).toBe("graveyard");
    expect(zone(s, elsewhere)).toBe("battlefield");
    expect(s.objects[h]!.tapped).toBe(true);
  });

  for (const won of [true, false])
    it(`Wirefly Hive: ${won ? "won, a 2/2 flying Insect named Wirefly" : "lost, every permanent named Wirefly is destroyed"}`, () => {
      const { s: s0, ap } = setup([]);
      const [b] = opponentsOf(s0, ap);
      const hiveId = putOnBattlefield(s0, ap, hive());
      // Earlier Wireflies, yours and another player's (CR 201.2: the same name), and a creature with another name.
      const mine = putOnBattlefield(s0, ap, card("Wirefly", "Artifact Creature — Insect", "", { power: "2", toughness: "2" }));
      const theirs = putOnBattlefield(s0, b!, card("Wirefly", "Artifact Creature — Insect", "", { power: "2", toughness: "2" }));
      const bear = putOnBattlefield(s0, ap, bears());
      let s = run(s0, planActivate(s0, ap, hiveId, 0, []));
      rig(s, won);
      s = settle(s);
      const tokens = onField(s, ap, "Wirefly").filter((id) => id !== mine);
      if (won) {
        expect(tokens.length).toBe(1);
        const c = characteristics(s, s.objects[tokens[0]!]!);
        expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
        expect(c.subtypes).toContain("Insect");
        expect(c.keywords).toContain("Flying");
        expect(pt(s, tokens[0]!)).toBe("2/2");
        expect(zone(s, mine)).toBe("battlefield");
      } else {
        expect(tokens.length).toBe(0);
        expect(zone(s, mine)).toBe("graveyard");
        expect(zone(s, theirs)).toBe("graveyard");
        expect(zone(s, bear)).toBe("battlefield");
      }
    });

  for (const won of [true, false])
    it(`Goblin Kites: flying now, and a flip at the next end step (${won ? "won: it stays" : "lost: it's sacrificed"})`, () => {
      const { s: s0, ap } = setup([]);
      handOf(s0, ap, []);
      const k = putOnBattlefield(s0, ap, kites());
      const b = putOnBattlefield(s0, ap, bears());
      const big = putOnBattlefield(s0, ap, giant());
      // Toughness 2 or less only.
      expect(planActivate(s0, ap, k, 0, [tgt(big)])).toBeNull();
      let s = settle(run(s0, planActivate(s0, ap, k, 0, [tgt(b)])));
      expect(characteristics(s, s.objects[b]!).keywords).toContain("Flying");
      expect(zone(s, b)).toBe("battlefield");
      s = passUntil(s, "end", ap);
      rig(s, won);
      s = settle(s);
      expect(zone(s, b)).toBe(won ? "battlefield" : "graveyard");
    });

  it("Simic Guildmage: moves a +1/+1 counter between two creatures with the same controller, anyone's", () => {
    const { s: s0, ap } = setup([]);
    const [b, c] = opponentsOf(s0, ap);
    const g = putOnBattlefield(s0, ap, guildmage());
    const from = putOnBattlefield(s0, b!, bears());
    const to = putOnBattlefield(s0, b!, giant());
    const other = putOnBattlefield(s0, c!, bears());
    s0.objects[from]!.counters["+1/+1"] = 2;
    const ix = abilityIndex(s0, g, /Move a \+1\/\+1 counter/);
    // A second target with another controller isn't allowed.
    expect(planActivate(s0, ap, g, ix, [tgt(from), tgt(other)])).toBeNull();
    const s = settle(run(s0, planActivate(s0, ap, g, ix, [tgt(from), tgt(to)])));
    expect(counters(s, from, "+1/+1")).toBe(1);
    expect(counters(s, to, "+1/+1")).toBe(1);
  });

  it("Simic Guildmage: does nothing if the two creatures no longer share a controller as it resolves", () => {
    const { s: s0, ap } = setup([]);
    const [b] = opponentsOf(s0, ap);
    const g = putOnBattlefield(s0, ap, guildmage());
    const from = putOnBattlefield(s0, ap, bears());
    const to = putOnBattlefield(s0, ap, giant());
    s0.objects[from]!.counters["+1/+1"] = 1;
    let s = run(s0, planActivate(s0, ap, g, abilityIndex(s0, g, /Move a \+1\/\+1 counter/), [tgt(from), tgt(to)]));
    s.objects[to]!.controller = b!;
    invalidateCharacteristics(s);
    s = settle(s);
    expect(counters(s, from, "+1/+1")).toBe(1);
    expect(counters(s, to, "+1/+1")).toBe(0);
  });

  it("Simic Guildmage: moves an Aura to another permanent of the same controller, chosen as it resolves", () => {
    const { s: s0, ap } = setup([]);
    const [b] = opponentsOf(s0, ap);
    const g = putOnBattlefield(s0, ap, guildmage());
    const host = putOnBattlefield(s0, b!, bears());
    const second = putOnBattlefield(s0, b!, giant());
    const third = putOnBattlefield(s0, b!, bears());
    const mine = putOnBattlefield(s0, ap, bears());
    const aura = attached(s0, b!, pacifism(), host);
    let s = run(s0, planActivate(s0, ap, g, abilityIndex(s0, g, /Attach target Aura/), [tgt(aura)]));
    s = settle(s, { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "enchant" });
    const options = (s.pending as { options: string[] }).options;
    expect(options.sort()).toEqual([second, third].sort());
    expect(options).not.toContain(mine);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: second }));
    expect(s.objects[aura]!.attachedTo).toBe(second);
  });

  it("Enchantment Alteration: an Aura on a creature goes to another creature (anyone's), an Aura on a land to another land", () => {
    const { s: s0, ap } = setup([]);
    const [b] = opponentsOf(s0, ap);
    const [ea, ea2] = handOf(s0, ap, [alteration(), alteration()]);
    const host = putOnBattlefield(s0, ap, bears());
    const theirs = putOnBattlefield(s0, b!, giant());
    const aura = attached(s0, ap, pacifism(), host);
    let s = settle(castNow(s0, ap, ea!, [tgt(aura)]), { me: [ap] });
    // Only one other creature: no question.
    expect(s.objects[aura]!.attachedTo).toBe(theirs);
    // Wild Growth on a land: to another land, not a creature.
    const land = putOnBattlefield(s, b!, wastes());
    const otherLand = putOnBattlefield(s, b!, wastes());
    const growth = attached(s, b!, wildGrowth(), land);
    s.players[ap]!.manaPool.U = 1;
    s = settle(castNow(s, ap, ea2!, [tgt(growth)]), { me: [ap] });
    if (s.pending?.kind === "chooseOption") {
      expect((s.pending as { options: string[] }).options).not.toContain(theirs);
      s = settle(act(s, { type: "chooseOption", player: ap, choice: otherLand }));
    }
    expect(characteristics(s, s.objects[s.objects[growth]!.attachedTo!]!).types).toContain("Land");
    expect(s.objects[growth]!.attachedTo).not.toBe(land);
  });

  it("Glamer Spinners: every Aura on the target goes to one other permanent of its controller", () => {
    const { s: s0, ap } = setup([]);
    const [b] = opponentsOf(s0, ap);
    const [sp] = handOf(s0, ap, [spinners()]);
    const host = putOnBattlefield(s0, b!, bears());
    const dest = putOnBattlefield(s0, b!, giant());
    putOnBattlefield(s0, ap, bears());
    const a1 = attached(s0, ap, pacifism(), host);
    const a2 = attached(s0, b!, holy(), host);
    let s = castNow(s0, ap, sp!);
    s = toPending(s, "chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(host)] }), { me: [ap] });
    expect(s.objects[a1]!.attachedTo).toBe(dest);
    expect(s.objects[a2]!.attachedTo).toBe(dest);
  });

  it("Glamer Spinners: none move when no other permanent of that player could take all of them", () => {
    const { s: s0, ap } = setup([]);
    const [b] = opponentsOf(s0, ap);
    const [sp] = handOf(s0, ap, [spinners()]);
    const host = putOnBattlefield(s0, b!, bears());
    putOnBattlefield(s0, b!, wastes());
    const a1 = attached(s0, b!, holy(), host);
    let s = castNow(s0, ap, sp!);
    s = toPending(s, "chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(host)] }), { me: [ap] });
    expect(s.objects[a1]!.attachedTo).toBe(host);
  });

  it("Glamer Spinners: with two choices, you pick the permanent as it resolves", () => {
    const { s: s0, ap } = setup([]);
    const [b] = opponentsOf(s0, ap);
    const [sp] = handOf(s0, ap, [spinners()]);
    const host = putOnBattlefield(s0, b!, bears());
    const d1 = putOnBattlefield(s0, b!, giant());
    const d2 = putOnBattlefield(s0, b!, bears());
    const a1 = attached(s0, b!, pacifism(), host);
    let s = castNow(s0, ap, sp!);
    s = toPending(s, "chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(host)] }), { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "enchant" });
    expect((s.pending as { options: string[] }).options.sort()).toEqual([d1, d2].sort());
    s = settle(act(s, { type: "chooseOption", player: ap, choice: d2 }));
    expect(s.objects[a1]!.attachedTo).toBe(d2);
  });

  it("Tanglewalker: your creatures can't be blocked by a player who controls an artifact land, by others they can", () => {
    const { s: s0, ap } = setup([]);
    const [b, c] = opponentsOf(s0, ap);
    putOnBattlefield(s0, ap, tanglewalker());
    const att = putOnBattlefield(s0, ap, bears());
    putOnBattlefield(s0, b!, darksteel());
    const bBlocker = putOnBattlefield(s0, b!, bears());
    const cBlocker = putOnBattlefield(s0, c!, bears());
    const s = s0;
    expect(blockProblem(s, s.objects[bBlocker]!, s.objects[att]!, b)).toMatch(/can't be blocked/);
    expect(blockProblem(s, s.objects[cBlocker]!, s.objects[att]!, c)).toBeNull();
    // An opponent's creatures aren't helped.
    const theirs = putOnBattlefield(s, c!, bears());
    const myBlocker = putOnBattlefield(s, ap, bears());
    putOnBattlefield(s, ap, darksteel());
    expect(blockProblem(s, s.objects[myBlocker]!, s.objects[theirs]!, ap)).toBeNull();
  });

  it("Glint Raker: on combat damage you may reveal that many cards, an artifact card among them to your hand and the rest to your graveyard", () => {
    const { s: s0, ap } = setup([]);
    const [b] = opponentsOf(s0, ap);
    handOf(s0, ap, []);
    const r = putOnBattlefield(s0, ap, raker());
    putOnBattlefield(s0, ap, relic());
    expect(pt(s0, r)).toBe("3/3");
    const bottom = toZone(s0, ap, bears(), "library");
    const art = toZone(s0, ap, relic(), "library");
    const top = toZone(s0, ap, bears(), "library");
    let s = s0;
    for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: r, defender: b! }] });
    for (let i = 0; i < 200 && !(s.step === "combatDamage" && (s.stack.length || s.pending)); i++) {
      if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
      else if (s.pending) for (const a of botActions(s, s.pending.player)) s = act(s, a);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    s = settle(s, { may: true });
    expect(zone(s, art)).toBe("hand");
    expect(zone(s, top)).toBe("graveyard");
    expect(zone(s, bottom)).toBe("graveyard");
  });

  it("Glint Raker: not revealing leaves the library alone", () => {
    const { s: s0, ap } = setup([]);
    const [b] = opponentsOf(s0, ap);
    handOf(s0, ap, []);
    const r = putOnBattlefield(s0, ap, raker());
    const art = toZone(s0, ap, relic(), "library");
    let s = s0;
    for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: r, defender: b! }] });
    for (let i = 0; i < 200 && !(s.step === "combatDamage" && (s.stack.length || s.pending)); i++) {
      if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
      else if (s.pending) for (const a of botActions(s, s.pending.player)) s = act(s, a);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    s = settle(s, { may: false });
    expect(zone(s, art)).toBe("library");
    expect(s.players[ap]!.library[0]).toBe(art);
  });

  for (const enchanted of [false, true])
    it(`Rayne, Academy Chancellor: an opponent's spell targeting her draws you ${enchanted ? "two cards (she's enchanted)" : "a card"}`, () => {
      const { s: s0, ap } = setup([]);
      const [b] = opponentsOf(s0, ap);
      handOf(s0, ap, []);
      const r = putOnBattlefield(s0, ap, rayne());
      if (enchanted) attached(s0, ap, holy(), r);
      const [sh] = handOf(s0, b!, [shock()]);
      s0.players[b!]!.manaPool.R = 1;
      let s = priorityTo(s0, b!);
      s = settle(castNow(s, b!, sh!, [tgt(r)]), { may: true });
      expect(hand(s, ap).length).toBe(enchanted ? 2 : 1);
    });

  it("Rayne, Academy Chancellor: you being the target triggers it too; your own spells don't", () => {
    const { s: s0, ap } = setup([]);
    const [b] = opponentsOf(s0, ap);
    const [mine] = handOf(s0, ap, [shock()]);
    const r = putOnBattlefield(s0, ap, rayne());
    void r;
    let s = settle(castNow(s0, ap, mine!, [player(b!)]), { may: true });
    expect(hand(s, ap).length).toBe(0);
    const [sh] = handOf(s, b!, [shock()]);
    s.players[b!]!.manaPool.R = 1;
    s = priorityTo(s, b!);
    s = settle(castNow(s, b!, sh!, [player(ap)]), { may: true });
    expect(hand(s, ap).length).toBe(1);
  });

  it("Leovold, Emissary of Trest: you may draw when an opponent's spell targets a permanent you control", () => {
    const { s: s0, ap } = setup([]);
    const [b] = opponentsOf(s0, ap);
    handOf(s0, ap, []);
    const bear = putOnBattlefield(s0, ap, bears());
    putOnBattlefield(s0, ap, leovold());
    const [sh] = handOf(s0, b!, [shock()]);
    s0.players[b!]!.manaPool.R = 1;
    let s = priorityTo(s0, b!);
    s = settle(castNow(s, b!, sh!, [tgt(bear)]), { may: true });
    expect(hand(s, ap).length).toBe(1);
  });

  it("Kaervek's Torch: a spell targeting it on the stack costs {2} more", () => {
    const { s: s0, ap } = setup([]);
    const [b] = opponentsOf(s0, ap);
    const [t] = handOf(s0, ap, [torch()]);
    let s = castNow(s0, ap, t!, [player(b!)], {}, 2);
    const item = s.stack.find((x) => x.kind === "spell" && x.objectId === t)!;
    expect(item).toBeDefined();
    const [c1] = handOf(s, b!, [cancel()]);
    s = priorityTo(s, b!);
    // Cancel's {1}{U}{U} and {2} more: three blue and one other isn't enough.
    s.players[b!]!.manaPool = { ...s.players[b!]!.manaPool, U: 3, C: 1 };
    expect(planCast(s, b!, c1!, [{ kind: "stack", id: item.id }])).toBeNull();
    s.players[b!]!.manaPool = { ...s.players[b!]!.manaPool, U: 3, C: 2 };
    s = run(s, planCast(s, b!, c1!, [{ kind: "stack", id: item.id }]));
    expect(s.players[b!]!.manaPool.U ?? 0).toBe(0);
    expect(s.players[b!]!.manaPool.C ?? 0).toBe(0);
    s = settle(s);
    expect(zone(s, t!)).toBe("graveyard");
    expect(lifeOf(s, b!)).toBe(40);
  });

  it("Kaervek's Torch: deals X damage; spells not targeting it cost the same", () => {
    const { s: s0, ap } = setup([]);
    const [b] = opponentsOf(s0, ap);
    const [t] = handOf(s0, ap, [torch()]);
    let s = castNow(s0, ap, t!, [player(b!)], {}, 3);
    const [sh] = handOf(s, b!, [shock()]);
    s = priorityTo(s, b!);
    s.players[b!]!.manaPool = { ...s.players[b!]!.manaPool, R: 1 };
    s = run(s, planCast(s, b!, sh!, [player(ap)]));
    s = settle(s);
    expect(lifeOf(s, b!)).toBe(37);
    expect(lifeOf(s, ap)).toBe(38);
  });

  it("Phyrexian Purge: 3 life for each target, paid as it's cast; no targets, no life", () => {
    const { s: s0, ap } = setup([]);
    const [b, c] = opponentsOf(s0, ap);
    const [p1, p2] = handOf(s0, ap, [purge(), purge()]);
    const x = putOnBattlefield(s0, b!, bears());
    const y = putOnBattlefield(s0, c!, giant());
    let s = castNow(s0, ap, p1!, [tgt(x), tgt(y)]);
    expect(lifeOf(s, ap)).toBe(34);
    s = settle(s);
    expect(zone(s, x)).toBe("graveyard");
    expect(zone(s, y)).toBe("graveyard");
    s = settle(castNow(s, ap, p2!, []));
    expect(lifeOf(s, ap)).toBe(34);
  });

  it("Phyrexian Purge: the life isn't given back if a target is gone", () => {
    const { s: s0, ap } = setup([]);
    const [b] = opponentsOf(s0, ap);
    const [p1] = handOf(s0, ap, [purge()]);
    const x = putOnBattlefield(s0, b!, bears());
    let s = castNow(s0, ap, p1!, [tgt(x)]);
    expect(lifeOf(s, ap)).toBe(37);
    s.battlefield.splice(s.battlefield.indexOf(x), 1);
    s.objects[x]!.zone = "exile";
    invalidateCharacteristics(s);
    s = settle(s);
    expect(lifeOf(s, ap)).toBe(37);
  });

  it("Temporal Distortion: what becomes tapped gets an hourglass counter and skips its controller's next untap step; the counters go at that player's upkeep", () => {
    const { s: s0, ap } = setup([]);
    handOf(s0, ap, []);
    putOnBattlefield(s0, ap, distortion());
    const b = putOnBattlefield(s0, ap, bears());
    let s = s0;
    tapPermanent(s, s.objects[b]!);
    s = settle(s);
    expect(counters(s, b, "hourglass")).toBe(1);
    // Your next untap step: it stays tapped; at your upkeep the counter goes.
    s = passUntil(act(s, { type: "passPriority", player: waitingOn(s)! }), "upkeep", ap);
    expect(s.objects[b]!.tapped).toBe(true);
    s = settle(s);
    expect(counters(s, b, "hourglass")).toBe(0);
    // The untap step after that untaps it.
    s = passUntil(act(s, { type: "passPriority", player: waitingOn(s)! }), "main1", ap);
    s = passUntil(act(s, { type: "passPriority", player: waitingOn(s)! }), "upkeep", ap);
    expect(s.objects[b]!.tapped).toBe(false);
  });
});
