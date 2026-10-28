// Round 190: more of the harder cards both lanes skipped, from the most played down: counters of any kind plus one on
// any permanent you control (Pir, Imaginative Rascal), granted fabricate (Cayth, Famed Mechanist), "as long as it was
// cast" (The Tarrasque), a revealed creature put onto the battlefield tapped and attacking (Raph & Mikey), "until you
// reveal X land cards, where X is ..." (The Ring Goes South).

import { describe, expect, it } from "vitest";
import { act, bear, card, commander, mountain, passUntil, putOnBattlefield, scry, setup, swamp } from "./helpers";
import { abilitiesOf, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; "you may" questions get `yes`, copies keep their targets. Stops at any other question. */
const resolveAll = (s: GameState, yes = true) => {
  for (let i = 0; i < 120 && (s.stack.length || s.triggerQueue.length || s.pending?.kind === "chooseMay" || s.pending?.kind === "copyTargets"); i++) {
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes });
    else if (s.pending?.kind === "copyTargets") s = act(s, { type: "copyTargets", player: s.pending.player });
    else if (s.pending) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const choose = (s: GameState, targets: TargetChoice[]) => (s.pending?.kind === "chooseTargets" ? resolveAll(act(s, { type: "chooseTargets", player: s.pending.player, targets })) : s);
const modes = (s: GameState, m: number[]) => {
  if (s.pending?.kind !== "chooseModes") throw new Error(`no modes question: ${s.pending?.kind}`);
  return act(s, { type: "chooseModes", player: s.pending.player, modes: m });
};
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const counters = (s: GameState, id: string, c = "+1/+1") => s.objects[id]!.counters[c] ?? 0;
const pt = (s: GameState, id: ObjectId) => [power(s, s.objects[id]!), toughness(s, s.objects[id]!)];
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && s.cards[s.objects[id]!.cardId]!.name === name);
const lands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).types.includes("Land"));
const tapAllBut = (s: GameState, pid: PlayerId, keep: ObjectId[]) => {
  for (const id of lands(s, pid)) s.objects[id]!.tapped = !keep.includes(id);
  invalidateCharacteristics(s);
};
const next = (s: GameState, pid: PlayerId, k = 1) => s.turnOrder[(s.turnOrder.indexOf(pid) + k) % 4]!;
/** Passes (no blocks, "you may" answered yes) until `step` of `ap`'s turn with an empty stack, or until another question. */
const toStep = (s: GameState, step: GameState["step"], ap: PlayerId) => {
  for (let i = 0; i < 800; i++) {
    if (s.step === step && s.activePlayer === ap && !s.stack.length && !s.triggerQueue.length && !s.pending) return s;
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: p.player, attacks: [] });
    else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: true });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  throw new Error(`never reached ${step}`);
};
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: ObjectId; defender: PlayerId; planeswalker?: ObjectId }[]) => act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks });
const shock = card("Test Shock", "Instant", "{R}", { cmc: 1, oracleText: "This spell deals 2 damage to any target." });
const bolt = card("Test Bolt", "Instant", "{R}", { cmc: 1, oracleText: "This spell deals 3 damage to any target." });
const creature = (name: string, sub: string, p: number, t = p) => card(name, `Creature — ${sub}`, "{G}", { cmc: 1, power: String(p), toughness: String(t) });

// Real oracle text (Scryfall).
const cayth = card("Cayth, Famed Mechanist", "Legendary Creature — Dwarf Artificer", "{1}{U}{R}{W}", {"cmc":4,"power":"3","toughness":"3","keywords":["Proliferate","Fabricate","Populate"],"oracleText":"Fabricate 1 (When this creature enters, put a +1/+1 counter on it or create a 1/1 colorless Servo artifact creature token.)\nOther nontoken creatures you control have fabricate 1.\n{2}, {T}: Choose one —\n• Populate.\n• Proliferate.","colors":["R","U","W"],"layout":"normal"});
const tarrasque = card("The Tarrasque", "Legendary Creature — Dinosaur", "{6}{G}{G}{G}", {"cmc":9,"power":"10","toughness":"10","keywords":["Fight"],"oracleText":"The Tarrasque has haste and ward {10} as long as it was cast.\nWhenever The Tarrasque attacks, it fights target creature defending player controls.","colors":["G"],"layout":"normal"});
const pir = card("Pir, Imaginative Rascal", "Legendary Creature — Human", "{2}{G}", {"cmc":3,"power":"1","toughness":"1","keywords":["Partner with","Partner"],"oracleText":"Partner with Toothy, Imaginary Friend (When this creature enters, target player may put Toothy into their hand from their library, then shuffle.)\nIf one or more counters would be put on a permanent your team controls, that many plus one of each of those kinds of counters are put on that permanent instead.","colors":["G"],"layout":"normal"});
const raphAndMikey = card("Raph & Mikey, Troublemakers", "Legendary Creature — Mutant Ninja Turtle", "{5}{R/G}{R/G}", {"cmc":7,"power":"7","toughness":"7","keywords":["Haste","Trample"],"oracleText":"Trample, haste\nWhenever Raph & Mikey attack, reveal cards from the top of your library until you reveal a creature card. Put that card onto the battlefield tapped and attacking and the rest on the bottom of your library in a random order.","colors":["G","R"],"layout":"normal"});
const ringGoesSouth = card("The Ring Goes South", "Sorcery", "{3}{G}", {"cmc":4,"oracleText":"The Ring tempts you. Then reveal cards from the top of your library until you reveal X land cards, where X is the number of legendary creatures you control. Put those land cards onto the battlefield tapped and the rest on the bottom of your library in a random order.","colors":["G"],"layout":"normal"});

const gut = card("Gut, True Soul Zealot", "Legendary Creature — Goblin Shaman", "{2}{R}", {"cmc":3,"power":"2","toughness":"2","keywords":["Choose a background"],"oracleText":"Whenever you attack, you may sacrifice another creature or an artifact. If you do, create a 4/1 black Skeleton creature token with menace that's tapped and attacking. (It can't be blocked except by two or more creatures.)\nChoose a Background (You can have a Background as a second commander.)","colors":["R"],"layout":"normal"});
const lilyBowen = card("Lily Bowen, Raging Grandma", "Legendary Creature — Mutant Warrior", "{3}{G}", {"cmc":4,"power":"0","toughness":"0","keywords":["Vigilance","Double"],"oracleText":"Vigilance\nLily Bowen enters with two +1/+1 counters on it.\nAt the beginning of your upkeep, double the number of +1/+1 counters on Lily Bowen if its power is 16 or less. Otherwise, remove all but one +1/+1 counter from it, then you gain 1 life for each +1/+1 counter removed this way.","colors":["G"],"layout":"normal"});
const sewerNemesis = card("Sewer Nemesis", "Creature — Horror", "{3}{B}", {"cmc":4,"power":"*","toughness":"*","keywords":["Mill"],"oracleText":"As this creature enters, choose a player.\nSewer Nemesis's power and toughness are each equal to the number of cards in the chosen player's graveyard.\nWhenever the chosen player casts a spell, that player mills a card.","colors":["B"],"layout":"normal"});
const voldarenBloodcaster = scry("transform", [
  { name: "Voldaren Bloodcaster", mana_cost: "{1}{B}", type_line: "Creature — Vampire Wizard", power: "2", toughness: "1", oracle_text: "Flying\nWhenever this creature or another nontoken creature you control dies, create a Blood token. (It's an artifact with \"{1}, {T}, Discard a card, Sacrifice this token: Draw a card.\")\nWhenever you create a Blood token, if you control five or more Blood tokens, transform this creature." },
  { name: "Bloodbat Summoner", type_line: "Creature — Vampire Wizard", color_indicator: ["B"], power: "3", toughness: "3", oracle_text: "Flying\nAt the beginning of combat on your turn, up to one target Blood token you control becomes a 2/2 black Bat creature with flying and haste in addition to its other types." },
], { keywords: ["Flying", "Transform"] });
const arcumDagsson = card("Arcum Dagsson", "Legendary Creature — Human Artificer", "{3}{U}", {"cmc":4,"power":"2","toughness":"2","oracleText":"{T}: Target artifact creature's controller sacrifices it. That player may search their library for a noncreature artifact card, put it onto the battlefield, then shuffle.","colors":["U"],"layout":"normal"});
const scrapMastery = card("Scrap Mastery", "Sorcery", "{3}{R}{R}", {"cmc":5,"oracleText":"Each player exiles all artifact cards from their graveyard, then sacrifices all artifacts they control, then puts all cards they exiled this way onto the battlefield.","colors":["R"],"layout":"normal"});
const oversimplify = card("Oversimplify", "Sorcery", "{3}{G}{U}", {"cmc":5,"oracleText":"Exile all creatures. Each player creates a 0/0 green and blue Fractal creature token and puts a number of +1/+1 counters on it equal to the total power of creatures they controlled that were exiled this way.","colors":["G","U"],"layout":"normal"});

const weddingAnnouncement = scry("transform", [
  { name: "Wedding Announcement", type_line: "Enchantment", mana_cost: "{2}{W}", oracle_text: "At the beginning of your end step, put an invitation counter on this enchantment. If you attacked with two or more creatures this turn, draw a card. Otherwise, create a 1/1 white Human creature token. Then if this enchantment has three or more invitation counters on it, transform it." },
  { name: "Wedding Festivity", type_line: "Enchantment", color_indicator: ["W"], oracle_text: "Creatures you control get +1/+1." },
], { keywords: ["Transform"] });
const hexMagic = card("Hex Magic", "Sorcery — Arcane", "{2}{R}", {"cmc":3,"oracleText":"Exile all the cards from your hand, then draw that many cards. Until the end of your next turn, you may play cards exiled this way.","colors":["R"],"layout":"normal"});
const tanukiTransplanter = card("Tanuki Transplanter", "Artifact Creature — Equipment Dog", "{3}{G}", {"cmc":4,"power":"2","toughness":"4","keywords":["Reconfigure"],"oracleText":"Whenever this creature or equipped creature attacks, add an amount of {G} equal to its power. Until end of turn, you don't lose this mana as steps and phases end.\nReconfigure {3} ({3}: Attach to target creature you control; or unattach from a creature. Reconfigure only as a sorcery. While attached, this isn't a creature.)","colors":["G"],"layout":"normal"});
const thadaAdel = card("Thada Adel, Acquisitor", "Legendary Creature — Merfolk Rogue", "{1}{U}{U}", {"cmc":3,"power":"2","toughness":"2","keywords":["Landwalk","Islandwalk"],"oracleText":"Islandwalk (This creature can't be blocked as long as defending player controls an Island.)\nWhenever Thada Adel deals combat damage to a player, search that player's library for an artifact card and exile it. Then that player shuffles. Until end of turn, you may play that card.","colors":["U"],"layout":"normal"});

const ALL = [cayth, tarrasque, pir, raphAndMikey, ringGoesSouth, gut, lilyBowen, sewerNemesis, voldarenBloodcaster, arcumDagsson, scrapMastery, oversimplify, weddingAnnouncement, hexMagic, tanukiTransplanter, thadaAdel];

describe("round 190", () => {
  it("all compile", () => supported(...ALL));

  it("Pir: one more of each kind of counter put on a permanent you control, not on an opponent's", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, pir);
    const mine = putOnBattlefield(s, ap, creature("Test Mine", "Beast", 2));
    const theirs = putOnBattlefield(s, opp, creature("Test Theirs", "Beast", 2));
    const grow = card("Test Grow", "Instant", "{G}", { cmc: 1, oracleText: "Put a +1/+1 counter and a lore counter on target creature." });
    const growMine = into(s, ap, grow, "hand");
    const growTheirs = into(s, ap, grow, "hand");
    s = resolveAll(run(s, planCast(s, ap, growMine, [tgt(mine)])));
    s = resolveAll(run(s, planCast(s, ap, growTheirs, [tgt(theirs)])));
    expect(counters(s, mine)).toBe(2);
    expect(counters(s, theirs)).toBe(1);
  });

  it("Cayth gives other nontoken creatures you control fabricate 1 as they enter; Pir makes its counter two", () => {
    let { s, ap, ids } = setup([bear(), bear()]);
    putOnBattlefield(s, ap, cayth);
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("chooseMay");
    s = resolveAll(s, true);
    expect(pt(s, ids[0]!)).toEqual([3, 3]);
    // Declined: a Servo, a token, which doesn't get fabricate itself.
    s = run(s, planCast(s, ap, ids[1]!));
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = resolveAll(s, false);
    expect(pt(s, ids[1]!)).toEqual([2, 2]);
    expect(named(s, ap, "Servo Token")).toHaveLength(1);
    expect(s.pending).toBeFalsy();
    expect(s.stack).toHaveLength(0);
  });

  it("The Tarrasque has haste and ward {10} when cast, not when put onto the battlefield", () => {
    let { s, ap, ids } = setup([tarrasque]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    const o = s.objects[ids[0]!]!;
    expect(objHasKeyword(s, o, "Haste")).toBe(true);
    const ward = (id: ObjectId) => abilitiesOf(s, s.objects[id]!).triggers.some((t) => t.event === "becomesTargetOfOpponent");
    expect(ward(ids[0]!)).toBe(true);
    const put = putOnBattlefield(s, ap, tarrasque);
    expect(objHasKeyword(s, s.objects[put]!, "Haste")).toBe(false);
    expect(ward(put)).toBe(false);
  });

  it("Raph & Mikey: the revealed creature enters tapped and attacking whom you choose; the rest go to the bottom", () => {
    let { s, ap, opp } = setup([]);
    const rm = putOnBattlefield(s, ap, raphAndMikey);
    const found = into(s, ap, creature("Test Found", "Beast", 3), "library");
    const land1 = into(s, ap, mountain, "library");
    const other = next(s, ap, 2);
    s = attack(s, ap, [{ attacker: rm, defender: opp }]);
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseOption"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "attackWhom" });
    s = act(s, { type: "chooseOption", player: ap, choice: String(other) });
    const o = s.objects[found]!;
    expect(o.zone).toBe("battlefield");
    expect(o.tapped).toBe(true);
    expect(o.attacking).toBe(other);
    const lib = s.players[ap]!.library;
    expect(lib[lib.length - 1]).toBe(land1);
  });

  it("The Ring Goes South: the Ring tempts first, so a Ring-bearer counts as legendary; X land cards onto the battlefield tapped", () => {
    let { s, ap, ids } = setup([ringGoesSouth]);
    const bearer = putOnBattlefield(s, ap, creature("Test Bearer", "Human", 2));
    putOnBattlefield(s, ap, pir);
    const before = lands(s, ap);
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 20 && s.stack.length && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "ringBearer" });
    s = act(s, { type: "pickPermanents", player: ap, ids: [bearer] });
    s = resolveAll(s);
    const fresh = lands(s, ap).filter((id) => !before.includes(id));
    expect(fresh).toHaveLength(2);
    expect(fresh.every((id) => s.objects[id]!.tapped)).toBe(true);
  });

  it("Gut: sacrifice another creature or an artifact (Gut too while it's an artifact) for a 4/1 Skeleton tapped and attacking", () => {
    let { s, ap, opp } = setup([]);
    const g = putOnBattlefield(s, ap, gut);
    const relic = putOnBattlefield(s, ap, card("Test Relic", "Artifact", "{1}", { cmc: 1 }));
    const attacker = putOnBattlefield(s, ap, creature("Test Attacker", "Beast", 2));
    s = attack(s, ap, [{ attacker, defender: opp }]);
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    // The other creature or the artifact; not Gut, which isn't an artifact.
    expect(s.pending).toMatchObject({ kind: "pickPermanents" });
    const options = (s.pending as { options: string[] }).options;
    expect(options).toContain(relic);
    expect(options).toContain(attacker);
    expect(options).not.toContain(g);
    s = act(s, { type: "pickPermanents", player: ap, ids: [relic] });
    if (s.pending?.kind === "chooseOption") s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
    expect(zone(s, relic)).toBe("graveyard");
    const skel = named(s, ap, "Skeleton Token");
    expect(skel).toHaveLength(1);
    expect(s.objects[skel[0]!]!.tapped).toBe(true);
    expect(s.objects[skel[0]!]!.attacking).toBe(opp);
    expect(pt(s, skel[0]!)).toEqual([4, 1]);
  });

  it("Voldaren Bloodcaster transforms when you create a Blood token with five or more Blood tokens, not for another token", () => {
    let { s, ap } = setup([]);
    const blood = card("Test Blood", "Instant", "{1}", { cmc: 1, oracleText: "Create a Blood token." });
    const treasure = card("Test Treasure", "Instant", "{1}", { cmc: 1, oracleText: "Create a Treasure token." });
    for (let i = 0; i < 4; i++) {
      tapAllBut(s, ap, lands(s, ap));
      s = resolveAll(run(s, planCast(s, ap, into(s, ap, blood, "hand"))));
    }
    const v = putOnBattlefield(s, ap, voldarenBloodcaster);
    // Four Blood tokens: the fifth is created, then it checks (five as it triggers and as it resolves).
    s = resolveAll(run(s, planCast(s, ap, into(s, ap, treasure, "hand"))));
    expect(characteristics(s, s.objects[v]!).name).toBe("Voldaren Bloodcaster");
    tapAllBut(s, ap, lands(s, ap));
    s = resolveAll(run(s, planCast(s, ap, into(s, ap, blood, "hand"))));
    expect(named(s, ap, "Blood Token")).toHaveLength(5);
    expect(characteristics(s, s.objects[v]!).name).toBe("Bloodbat Summoner");
  });

  it("Lily Bowen doubles her +1/+1 counters at 16 power or less; above that, down to one counter and a life for each removed", () => {
    let { s, ap } = setup([]);
    const lily = putOnBattlefield(s, ap, lilyBowen);
    s.objects[lily]!.counters["+1/+1"] = 8;
    invalidateCharacteristics(s);
    const upkeep = (s: GameState) => resolveAll(passUntil(s.step === "upkeep" ? passUntil(s, "draw", ap) : s, "upkeep", ap));
    s = upkeep(s);
    expect(counters(s, lily)).toBe(16);
    const before = life(s, ap);
    s = upkeep(s);
    expect(counters(s, lily)).toBe(32);
    s = upkeep(s);
    expect(counters(s, lily)).toBe(1);
    expect(life(s, ap)).toBe(before + 31);
  });

  it("Sewer Nemesis counts the chosen player's graveyard, and that player mills a card for each spell they cast", () => {
    let { s, ap, ids, opp } = setup([sewerNemesis]);
    for (let i = 0; i < 2; i++) into(s, opp, bear(), "graveyard");
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 10 && s.stack.length && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "player" });
    s = resolveAll(act(s, { type: "chooseOption", player: ap, choice: String(opp) }));
    const nem = ids[0]!;
    expect(pt(s, nem)).toEqual([2, 2]);
    into(s, opp, bear(), "graveyard");
    expect(pt(s, nem)).toEqual([3, 3]);
    // The chosen player casting a spell mills them a card; another player's spell doesn't.
    const spell = card("Test Spell", "Instant", "{1}", { cmc: 1, oracleText: "Draw a card." });
    for (const id of lands(s, opp)) s.objects[id]!.tapped = false;
    putOnBattlefield(s, opp, mountain);
    putOnBattlefield(s, opp, mountain);
    const theirs = into(s, opp, spell, "hand");
    const lib = s.players[opp]!.library.length;
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    s = resolveAll(run(s, planCast(s, opp, theirs)));
    expect(s.players[opp]!.library.length).toBe(lib - 2); // a card milled, a card drawn
    expect(pt(s, nem)).toEqual([5, 5]); // the milled card and the spell
    const mine = into(s, ap, spell, "hand");
    tapAllBut(s, ap, lands(s, ap));
    s = resolveAll(run(s, planCast(s, ap, mine)));
    expect(pt(s, nem)).toEqual([5, 5]);
  });

  it("Oversimplify: each player gets a Fractal with counters equal to the total power their exiled creatures had; none, it dies", () => {
    let { s, ap, ids, opp } = setup([oversimplify]);
    const third = next(s, ap, 2);
    const a = putOnBattlefield(s, ap, creature("Test A", "Beast", 2));
    const b = putOnBattlefield(s, opp, creature("Test B", "Beast", 3));
    const c = putOnBattlefield(s, opp, creature("Test C", "Beast", 4));
    // Pumped on the battlefield: its power as it last existed there counts (rulings).
    s.objects[c]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect([a, b, c].map((id) => zone(s, id))).toEqual(["exile", "exile", "exile"]);
    const fractal = (pid: PlayerId) => named(s, pid, "Fractal Token");
    expect(fractal(ap).map((id) => counters(s, id))).toEqual([2]);
    expect(fractal(opp).map((id) => counters(s, id))).toEqual([8]);
    expect(fractal(third)).toHaveLength(0);
  });

  it("Arcum Dagsson: the artifact creature's controller sacrifices it and may search for a noncreature artifact card onto the battlefield", () => {
    let { s, ap, opp } = setup([]);
    const arcum = putOnBattlefield(s, ap, arcumDagsson);
    const golem = putOnBattlefield(s, opp, card("Test Golem", "Artifact Creature — Golem", "{3}", { cmc: 3, power: "3", toughness: "3" }));
    const relic = into(s, opp, card("Test Relic", "Artifact", "{2}", { cmc: 2 }), "library");
    s = run(s, planActivate(s, ap, arcum, 0, [tgt(golem)]));
    for (let i = 0; i < 10 && s.stack.length && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(zone(s, golem)).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp });
    s = act(s, { type: "chooseMay", player: opp, yes: true });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: opp });
    s = act(s, { type: "searchLibrary", player: opp, found: [relic] });
    expect(zone(s, relic)).toBe("battlefield");
    expect(controllerOf(s, s.objects[relic]!)).toBe(opp);
  });

  it("Scrap Mastery: artifact cards from graveyards come back after every artifact is sacrificed; the sacrificed ones stay", () => {
    let { s, ap, ids, opp } = setup([scrapMastery]);
    const mine = putOnBattlefield(s, ap, card("Test Mine", "Artifact", "{1}", { cmc: 1 }));
    const theirs = putOnBattlefield(s, opp, card("Test Theirs", "Artifact Creature — Golem", "{2}", { cmc: 2, power: "2", toughness: "2" }));
    const back = into(s, opp, card("Test Back", "Artifact", "{3}", { cmc: 3 }), "graveyard");
    const bear0 = into(s, ap, bear(), "graveyard");
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect([zone(s, mine), zone(s, theirs), zone(s, back), zone(s, bear0)]).toEqual(["graveyard", "graveyard", "battlefield", "graveyard"]);
    expect(controllerOf(s, s.objects[back]!)).toBe(opp);
  });
  it("Wedding Announcement: a Human without two attackers, a card with them; at three invitation counters it transforms", () => {
    let { s, ap } = setup([]);
    const wa = putOnBattlefield(s, ap, weddingAnnouncement);
    s = toStep(s, "end", ap);
    expect(counters(s, wa, "invitation")).toBe(1);
    expect(named(s, ap, "Human Token")).toHaveLength(1);
    expect(s.objects[wa]!.face).toBeUndefined();
    // Next turn: two creatures attack (one dies in combat; it still attacked this turn), so a card instead of a Human.
    s = toStep(s, "main1", ap);
    const a = putOnBattlefield(s, ap, creature("Test A", "Beast", 2));
    const b = putOnBattlefield(s, ap, creature("Test B", "Beast", 2));
    s.objects[wa]!.counters["invitation"] = 2;
    s = attack(s, ap, [{ attacker: a, defender: next(s, ap) }, { attacker: b, defender: next(s, ap) }]);
    s = toStep(s, "main2", ap);
    s.objects[b]!.zone = "graveyard";
    s.battlefield.splice(s.battlefield.indexOf(b), 1);
    invalidateCharacteristics(s);
    const hand = s.players[ap]!.hand.length;
    s = toStep(s, "end", ap);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(named(s, ap, "Human Token")).toHaveLength(1);
    expect(counters(s, wa, "invitation")).toBe(3);
    expect(s.objects[wa]!.face).toBe(1);
    expect(pt(s, a)).toEqual([3, 3]);
  });

  it("Hex Magic exiles the whole hand, draws that many, and those cards may be played until the end of your next turn", () => {
    let { s, ap, ids } = setup([hexMagic]);
    const x = into(s, ap, creature("Test X", "Beast", 1), "hand");
    const y = into(s, ap, mountain, "hand");
    const n = s.players[ap]!.hand.length - 1;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect([zone(s, x), zone(s, y)]).toEqual(["exile", "exile"]);
    expect(s.players[ap]!.hand.length).toBe(n);
    expect(s.objects[x]!.mayPlay).toMatchObject({ player: ap });
    s = run(s, planCast(s, ap, x));
    s = resolveAll(s);
    expect(zone(s, x)).toBe("battlefield");
  });

  it("Tanuki Transplanter adds {G} equal to the attacking creature's power, kept through the steps of the turn", () => {
    let { s, ap, opp } = setup([]);
    const tanuki = putOnBattlefield(s, ap, tanukiTransplanter);
    s = attack(s, ap, [{ attacker: tanuki, defender: opp }]);
    s = resolveAll(s);
    expect(s.players[ap]!.manaPool.G).toBe(2);
    s = toStep(s, "main2", ap);
    expect(s.players[ap]!.manaPool.G).toBe(2);
    // Attached: the equipped creature's power.
    let t = setup([]);
    const big = putOnBattlefield(t.s, t.ap, creature("Test Big", "Beast", 5));
    const eq = putOnBattlefield(t.s, t.ap, tanukiTransplanter);
    t.s.objects[eq]!.attachedTo = big;
    invalidateCharacteristics(t.s);
    let s2 = resolveAll(attack(t.s, t.ap, [{ attacker: big, defender: t.opp }]));
    expect(s2.players[t.ap]!.manaPool.G).toBe(5);
  });

  it("Thada Adel: combat damage to a player, you search their library for an artifact card, exile it and may play it this turn", () => {
    let { s, ap, opp } = setup([]);
    const thada = putOnBattlefield(s, ap, thadaAdel);
    const relic = into(s, opp, card("Test Relic", "Artifact", "{2}", { cmc: 2 }), "library");
    s = attack(s, ap, [{ attacker: thada, defender: opp }]);
    for (let i = 0; i < 30 && s.pending?.kind !== "searchLibrary"; i++) {
      if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = act(s, { type: "searchLibrary", player: ap, found: [relic] });
    s = resolveAll(s);
    expect(zone(s, relic)).toBe("exile");
    expect(s.objects[relic]!.mayPlay).toMatchObject({ player: ap, until: "thisTurn" });
    s = toStep(s, "main2", ap);
    s = resolveAll(run(s, planCast(s, ap, relic)));
    expect(zone(s, relic)).toBe("battlefield");
    expect(controllerOf(s, s.objects[relic]!)).toBe(ap);
  });
});
