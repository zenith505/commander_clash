// Round 387's whole lines (compile.ts, after round 386's; loyalty lines before the usual loyalty parse) and its sentences
// (read first by round373Sentence): Ashling, Rimebound's mana for spells with mana value 4 or greater, Oko, Lorwyn Liege's
// creature types for good and Oko, Shadowmoor Scion's emblem of a chosen creature type, Aegis of the Legion's "whenever
// equipped creature mentors a creature", Invisible Woman's pump for each creature you control that also makes it unblockable.
import type { CompiledCard, Effect } from "../abilities";
import { parseLoyalty } from "./activated";
import { parseBody, parseOne, type Ctx } from "./body";
import { compileGranted, emblemAbilityOk } from "./grants";
import { parseTrigger } from "./triggers";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

const fail = (out: CompiledCard, raw: string) => {
  out.unsupported.push(raw);
  return true;
};

/** A whole line of round 387's. */
export function round387Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Ashling, Rimebound: "Whenever this creature transforms into Ashling, Rimebound and at the beginning of your first main
  // phase, add two mana of any one color. ...": one ability that triggers on either event, which works like two with the
  // same effect (as "When ~ enters and at the beginning of your upkeep", CR 603.2); its transforming into this face (CR
  // 701.27e), and the first main phase of its controller's turn (CR 505.1a). The mana is restricted (CR 106.6).
  const ashling = /^Whenever ~ transforms into ~ and at the beginning of your first main phase, (.+)$/.exec(line);
  if (ashling) {
    if (isSpell) return fail(out, raw);
    const a = parseTrigger(`Whenever ~ transforms into ~, ${ashling[1]}`);
    const b = parseTrigger(`At the beginning of your first main phase, ${ashling[1]}`);
    if (!a || a === "fail" || !b || b === "fail" || a.event !== "selfTransformsInto" || b.event !== "yourFirstMain") return fail(out, raw);
    out.triggers.push(a, b);
    return true;
  }
  // Oko, Lorwyn Liege's +2: "Up to one target creature gains all creature types. (This effect doesn't end.)": a resolved
  // effect with no duration lasts for the rest of the game (CR 611.2a), on that object only (CR 400.7), in layer 4 (CR
  // 205.3d, 613.1d); it doesn't end as Oko leaves or transforms (rulings).
  const allTypes = /^\+(\d+): Up to one target creature gains all creature types\.$/.exec(line);
  if (allTypes) {
    if (isSpell) return fail(out, raw);
    const ab = parseLoyalty("+", allTypes[1]!, "Up to one target creature gains all creature types until end of turn.", raw);
    const e = ab === "fail" ? undefined : ab.body.effects[0];
    if (ab === "fail" || ab.body.effects.length !== 1 || e?.type !== "continuous" || e.duration !== "endOfTurn" || e.what.ref !== "target" || e.mods.length !== 1 || e.mods[0]!.kind !== "addTypes") return fail(out, raw);
    out.activated.push({ ...ab, body: { ...ab.body, effects: [{ ...e, duration: "game" }], text: "Up to one target creature gains all creature types." } });
    return true;
  }
  // Oko, Shadowmoor Scion's −6: "Choose a creature type. You get an emblem with "Creatures you control of the chosen type
  // get +3/+3 and have vigilance and hexproof."": the type chosen as it resolves (CR 608.2), kept with the emblem (CR 114.2);
  // its static ability works from the command zone for good (CR 114.4), about the creatures its owner controls then.
  const chosenEmblem = /^([+−-]?)(\d+): Choose a creature type\. You get an emblem with "(Creatures you control of the chosen type [^"]+)"$/.exec(line);
  if (chosenEmblem) {
    if (isSpell) return fail(out, raw);
    const text = chosenEmblem[3]!.replace(/([^.])$/, "$1.");
    // The ability is one any emblem may have without the type (emblemAbilityOk), the type only narrowing what it affects.
    const st = compileGranted(text).statics;
    const spec = st.length === 1 && st[0]!.affects.kind === "filter" ? st[0]!.affects.spec : undefined;
    if (!emblemAbilityOk(text.replace(" of the chosen type ", " ")) || spec?.chosen !== "type" || (text.match(/chosen/g) ?? []).length !== 1) return fail(out, raw);
    const ab = parseLoyalty(chosenEmblem[1]!, chosenEmblem[2]!, "Choose a creature type.", raw);
    if (ab === "fail" || ab.body.effects.length !== 1 || ab.body.effects[0]!.type !== "choose" || ab.body.effects[0]!.choice !== "creatureType") return fail(out, raw);
    out.activated.push({ ...ab, body: { ...ab.body, effects: [...ab.body.effects, { type: "emblem", who: { ref: "you" }, abilities: [text], chosenType: true }], text: line.replace(/^[+−-]?\d+: /, "") } });
    return true;
  }
  // Aegis of the Legion: "Whenever equipped creature mentors a creature, put a shield counter on that creature.": a mentor
  // ability whose source is the creature it's attached to as that ability resolves, and whose target is that creature,
  // resolving (CR 702.134c, rulings); "that creature" is the one mentored (event "selfMentors", host "attached").
  const mentors = /^Whenever equipped creature mentors a creature, (.+)$/.exec(line);
  if (mentors) {
    if (isSpell) return fail(out, raw);
    const body = parseBody(mentors[1]!, { subject: true });
    if (!body || body.targets.length || !/\bthat creature\b/.test(mentors[1]!)) return fail(out, raw);
    out.triggers.push({ event: "selfMentors", host: "attached", body });
    return true;
  }
  return false;
}

/** A sentence of round 387's, read before round 373's. */
export function round387Sentence(s: string, _sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Invisible Woman: "target creature gets +1/+0 until end of turn for each creature you control and can't be blocked this
  // turn": the number counted once, as it resolves (CR 608.2h, 611.2c), and the same target both (as Kang Dynasty's III).
  const pump = /^([Tt]arget creature(?: you control)? gets? [+-]\d+\/[+-]\d+ until end of turn for each [^,]+?) and can't be blocked this turn$/.exec(plain(s));
  if (pump) {
    const fx = parseOne(pump[1]!.charAt(0).toUpperCase() + pump[1]!.slice(1), ctx);
    const e = fx?.length === 1 ? fx[0]! : undefined;
    if (e?.type !== "continuous" || e.what.ref !== "target" || e.duration !== "endOfTurn" || e.mods.length !== 1 || e.mods[0]!.kind !== "modifyPT") return "fail";
    effects.push(e);
    return { effect: { type: "continuous", what: e.what, mods: [{ kind: "cantBeBlocked" }], duration: "endOfTurn" }, next: si + 1 };
  }
  return null;
}
