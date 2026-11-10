// Round 328's sentences, triggers and whole texts (after round 329's, oracle/round329.ts), read before round 327's
// (round327Sentence, round327Trigger and round327WholeText in oracle/round327.ts).
import type { AbilityBody, Effect, TargetSpec, TriggeredAbility } from "../abilities";
import type { Ctx } from "./body";
import { pickFilter } from "./targets";
import { parseTrigger } from "./triggers";
import { counterKind, num } from "./words";
import { round329Sentence, round329Trigger, round329WholeText } from "./round329";

type Found = { effect: Effect; next: number } | "fail" | null;

export function round328Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Round 329's sentences first (oracle/round329.ts).
  const r329 = round329Sentence(s, sentences, si, ctx, effects);
  if (r329 !== null) return r329;
  // Crashing Wave: "Tap up to X target creatures, then distribute three stun counters among any number of tapped creatures
  // your opponents control." (after the tap, its own sentence by now): the counters are divided as it resolves (CR
  // 608.2d), among every tapped creature an opponent controls then, those it just tapped or any other (rulings),
  // untargeted.
  const wave = /^Distribute (one|two|three|four|five) ([a-z]+) counters among any number of tapped creatures your opponents control$/.exec(s);
  if (wave && effects.at(-1)?.type === "tap") {
    const filter: TargetSpec = { kind: "object", types: ["Creature"], notTypes: [], notColors: [], tapped: true, text: "tapped creatures your opponents control" };
    return { effect: { type: "distribute", counter: counterKind(wave[2]!), n: num(wave[1]!), filter, of: { ref: "eachOpponent" } }, next: si + 1 };
  }
  // Unstable Glyphbridge: "for each player, choose a creature with power 2 or less that player controls. Then destroy all
  // creatures except creatures chosen this way.": you choose for every player, yourself included, one if they have one
  // (rulings), not targeting; then every other creature is destroyed at once (the same as The Eternal Wanderer's, with
  // "destroy").
  const keep = /^[Ff]or each player, choose an? (creature with power \d+ or less) that player controls$/.exec(s);
  if (keep && /^Then destroy all creatures except creatures chosen this way\.?$/.test(sentences[si + 1] ?? "")) {
    const filter = pickFilter(keep[1]!);
    const among = pickFilter("creature");
    if (filter?.kind !== "object" || among?.kind !== "object" || !filter.power) return "fail";
    return { effect: { type: "keepRest", who: { ref: "eachPlayer" }, keep: [{ filter: { ...filter, text: keep[1]! }, n: 1 }], among: { ...among, text: "creature" }, youChoose: true, destroy: true }, next: si + 2 };
  }
  return null;
}

export function round328Trigger(raw: string): TriggeredAbility | "fail" | null {
  // Round 329's triggers first (oracle/round329.ts).
  const r329 = round329Trigger(raw);
  if (r329 !== null) return r329;
  // Sandswirl Wanderglyph: "Whenever an opponent casts a spell during their turn, they can't attack you or planeswalkers you
  // control this turn.": only while the caster is the active player; once it resolves, that holds for the turn even if
  // this leaves the battlefield, and battles you protect aren't covered (rulings).
  if (raw === "Whenever an opponent casts a spell during their turn, they can't attack you or planeswalkers you control this turn.") {
    const t = parseTrigger("Whenever an opponent casts a spell, creatures they control can't attack you this turn.");
    const ban = t && t !== "fail" && t.body.effects.length === 1 ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || !t.cast || t.cast.ownTurn || ban?.type !== "attackBanThisTurn" || ban.who.ref !== "eventPlayer" || ban.subtype || ban.combat || ban.protects) return "fail";
    return { ...t, cast: { ...t.cast, ownTurn: true }, body: { ...t.body, effects: [{ ...ban, walkers: true }], text: "they can't attack you or planeswalkers you control this turn." } };
  }
  return null;
}

/** A whole ability's text read another way (a string), or null. */
export function round328WholeText(text: string, parse: (t: string) => AbilityBody | null): AbilityBody | string | null {
  // Round 329's whole texts first (oracle/round329.ts).
  const r329 = round329WholeText(text, parse);
  if (r329 && typeof r329 !== "string") return r329;
  if (typeof r329 === "string") text = r329;
  const t = text.trim();
  // Geth's Summons: "Corrupted — For each opponent who has three or more poison counters as you cast ~, put up to one target
  // creature card from that player's graveyard onto the battlefield under your control." (the ability word gone by now):
  // one "up to one" target for each opponent with that many poison counters as its targets are chosen while it's cast
  // (CR 601.2c), none for the others; each card enters under your control.
  const corrupted = /^(.+\.) For each opponent who has (one|two|three|four|five|six|seven|eight|nine|ten) or more poison counters as you cast ~, (put up to one target creature card from that player's graveyard onto the battlefield under your control\.)$/.exec(t);
  if (corrupted) {
    const body = parse(`${corrupted[1]!} For each opponent, ${corrupted[3]!}`);
    const per = body?.targets.filter((x) => x.perOpponent) ?? [];
    const spec = per[0];
    if (!body || per.length !== 1 || !spec || spec.perPlayer || spec.perOpponentRequired || body.targets.at(-1) !== spec) return null;
    return { ...body, targets: [...body.targets.slice(0, -1), { ...spec, perOpponentPoison: num(corrupted[2]!), text: `${spec.text} (an opponent with ${corrupted[2]!} or more poison counters)` }], text: t };
  }
  // Master of the Wild Hunt: "Tap all untapped Wolf creatures you control. Each Wolf tapped this way deals damage equal to
  // its power to target creature. That creature deals damage equal to its power divided as its controller chooses among any
  // number of those Wolves.": the Wolves are tapped by the effect, not as a cost, then each one tapped deals its damage at
  // once; then the creature deals damage equal to its power now, divided as it resolves among only those Wolves (they aren't
  // targets), with nothing in between (rulings). With the target illegal, nothing happens (rulings, CR 608.2b).
  const hunt = /^(Tap all untapped ([A-Z][a-z]+) creatures you control\.) Each ([A-Z][a-z]+) tapped this way deals damage equal to its power to (target creature)\. That creature deals damage equal to its power divided as its controller chooses among any number of those ([A-Z][a-z]+)\.$/.exec(t);
  // The plural of the creature type: "those Wolves".
  const plural = (x: string) => (x.endsWith("f") ? `${x.slice(0, -1)}ves` : `${x}s`);
  if (hunt && hunt[2] === hunt[3] && plural(hunt[3]!) === hunt[5]) {
    const tap = parse(hunt[1]!);
    const target = parse(`Destroy ${hunt[4]!}.`);
    const fx = tap?.effects.length === 1 ? tap.effects[0] : undefined;
    if (!tap || tap.targets.length || fx?.type !== "tap" || fx.what.ref !== "each" || target?.targets.length !== 1) return null;
    const it = { ref: "target", index: 0 } as const;
    return {
      targets: target.targets,
      effects: [
        { ...fx, noteTapped: true },
        { type: "bite", a: { ref: "tappedThisWay" }, b: it },
        { type: "dividedDamageBack", from: it, among: { ref: "tappedThisWay" } },
      ],
      text: t,
    };
  }
  return null;
}
