import type { TriggeredAbility, CompiledCard, Modification } from "../abilities";
import type { CardDef } from "../types";
import { QUOTED_SOURCE_NAME, compile } from "./compile";
import { textKeywords, isKeywordLine } from "./keyword-abilities";
import { parseKeywordList } from "./targets";

/** Can we run an ability given in quotes (a token's or one granted to something)? */
export function compileQuoted(text: string): boolean {
  const c = compile({ name: "Quoted Ability Source", oracleText: text, types: [], subtypes: [], supertypes: [], keywords: [], colors: [], colorIdentity: [], manaCost: "", oracleId: "" } as unknown as CardDef);
  return c.unsupported.length === 0;
}

const grantedCache = new Map<string, CompiledCard>();
/** The compiled form of an ability an effect gave an object (`addAbility`): "~" in it is that object. */
export function compileGranted(text: string): CompiledCard {
  let hit = grantedCache.get(text);
  if (!hit) {
    hit = compile({ name: "", oracleText: text, types: [], subtypes: [], supertypes: [], keywords: [], colors: [], colorIdentity: [], manaCost: "", cmc: 0, typeLine: "", oracleId: `granted:${text}` });
    grantedCache.set(text, hit);
  }
  return hit;
}

/**
 * Can an effect give this quoted ability to an object? It has to be one triggered, activated or mana
 * ability that we can run. Static abilities given this way aren't modeled: their effects would have to
 * come out of the same layer calculation that grants them.
 */
function grantable(text: string): boolean {
  if (text.includes(QUOTED_SOURCE_NAME)) return false;
  const c = compileGranted(text);
  const n = c.triggers.length + c.activated.length + c.mana.length;
  const { triggers, activated, mana, statics, entersTapped, unsupported, textKeywords, ...rest } = c;
  return n === 1 && !statics.length && !entersTapped && !unsupported.length && !textKeywords.length && Object.keys(rest).length === 0;
}

/**
 * Backup N (CR 702.165a): "When this creature enters, put N +1/+1 counters on target creature. If that's
 * another creature, it also gains the non-backup abilities of this creature printed below this one until
 * end of turn." Those are fixed by the card (CR 702.165c-d). Each backup ability triggers separately.
 */
export function backupTriggers(ns: number[], below: string[]): TriggeredAbility[] | null {
  const mods: Modification[] = [];
  const kws: string[] = [];
  for (const raw of below) {
    const line = raw.trim();
    if (!line) continue;
    const k = isKeywordLine(line) ? parseKeywordList(line) : null;
    if (k) kws.push(...k);
    else if (grantable(line)) mods.push({ kind: "addAbility", text: line });
    else return null;
  }
  if (kws.length) mods.unshift({ kind: "addKeywords", keywords: kws });
  if (!mods.length) return null;
  return ns.map((n) => ({
    event: "selfEnters",
    body: {
      targets: [{ kind: "object", types: ["Creature"], text: "target creature" }],
      effects: [
        { type: "counters", what: { ref: "target", index: 0 }, counter: "+1/+1", n },
        { type: "continuous", what: { ref: "target", index: 0 }, mods, duration: "endOfTurn", notSource: true },
      ],
      text: `Backup ${n}: put ${n === 1 ? "a +1/+1 counter" : `${n} +1/+1 counters`} on target creature. If that's another creature, it gains ${describeGrants(kws, mods)} until end of turn.`,
    },
  }));
}

const describeGrants = (kws: string[], mods: Modification[]) =>
  [...kws.map((k) => k.toLowerCase()), ...mods.flatMap((m) => (m.kind === "addAbility" ? [`"${m.text.replace(/~/g, "this creature")}"`] : []))].join(" and ");

/**
 * What follows "has", "have" or "gains": keywords, quoted abilities, or both ('flying and "{T}: ..."').
 * Layer 6 either way.
 */
export function parseGrants(text: string): Modification[] | null {
  const out: Modification[] = [];
  // A comma that separates the list can sit inside the quotes: 'flying, deathtouch, "Ward—Pay 3 life," and "..."'.
  const quoted = [...text.matchAll(/"([^"]+)"/g)].map((q) => q[1]!.replace(/,$/, ""));
  // "Protection from black and from red" is two protection abilities (CR 702.16g).
  const words = text.replace(/protection from (\w+) and from (\w+)/gi, "protection from $1, protection from $2").replace(/"[^"]+"/g, "\u0000").split(/,\s*(?:and\s+)?|\s+and\s+/).map((x) => x.trim()).filter(Boolean);
  const kws: string[] = [];
  for (const w of words) {
    if (w === "\u0000") continue;
    // Keywords that are triggered abilities: each grant is its own instance, which triggers separately (CR 702.121b).
    if (/^melee$/i.test(w)) {
      out.push({ kind: "addAbility", text: "Melee" });
      continue;
    }
    const k = parseKeywordList(w);
    if (!k) return null;
    kws.push(...k);
  }
  if (words.filter((w) => w === "\u0000").length !== quoted.length) return null;
  if (kws.length) out.unshift({ kind: "addKeywords", keywords: kws });
  for (const q of quoted) {
    if (!grantable(q)) return null;
    out.push({ kind: "addAbility", text: q });
  }
  return out.length ? out : null;
}
