import type { TriggeredAbility, CompiledCard, Modification } from "../abilities";
import type { CardDef } from "../types";
import { QUOTED_SOURCE_NAME, compile } from "./compile";
import { textKeywords, isKeywordLine } from "./keyword-abilities";
import { parseKeywordList } from "./targets";
import { layerOf } from "../layers";

/**
 * A quoted ability inside a quoted ability is in single quotes ('... token with 'This token gets +1/+1 ...'', Urza's Saga;
 * '... token with flying and '{R}: This token gets +1/+0 until end of turn.'', Nesting Dragon): double quotes once it's
 * an ability of its own.
 */
export const innerQuotes = (text: string) => text.replace(/ (with|and) '([^']+?\.)'/g, ' $1 "$2"');

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
    // A quoted ability inside the granted one is in single quotes ('... token with 'This token gets +1/+1 ...'', Urza's
    // Saga): double quotes once it's an ability of its own.
    const own = innerQuotes(text);
    // An equip ability given to Equipment (Puresteel Paladin's "Equipment you control have equip {0}"), a crew ability to
    // a Vehicle (Swift Reconfiguration), read ahead to a Saga (Barbara Wright).
    const subtypes = /^Equip \{\d+\}$/.test(text) ? ["Equipment"] : /^Crew \d+$/.test(text) ? ["Vehicle"] : text === "Read ahead" ? ["Saga"] : [];
    hit = compile({ name: "", oracleText: own, types: [], subtypes, supertypes: [], keywords: [], colors: [], colorIdentity: [], manaCost: "", cmc: 0, typeLine: "", oracleId: `granted:${text}` });
    grantedCache.set(text, hit);
  }
  return hit;
}

/**
 * The kinds of static abilities an effect can give an object and the engine runs (see `grantedStatics` in layers.ts and
 * `withGranted` in cards.ts): continuous effects in layer 7 or the rules that apply after abilities are settled in layer
 * 6 (CR 613.1f-g), cost changes, counter and token replacements, "enters with an additional counter" and
 * "room abilities trigger an additional time", a draw replacement (Scion of Halaster), and "you can't lose the game and
 * your opponents can't win the game" (The Book of Exalted Deeds; read by gameEndBlocked in game.ts), and "You have no
 * maximum hand size" (Nerd Rage's; read by hasNoMaxHandSize in game.ts for its controller). Ones that give
 * keywords join layer 6 once granted (computeLayers in layers.ts); ones that change types, colors or other abilities
 * would have to come out of earlier layers than the one that grants them, so they stay out.
 */
const GRANTED_FIELDS = new Set(["costMods", "countMods", "othersEnterWithCounters", "entersWithAdditional", "roomsTwice", "firstDrawLook", "cantLose", "cantWin", "triggersAgain", "exileIfLeavesSelf", "noMaxHandSize", "targetTax"]);
export const grantedStaticOk = (mods: Modification[]) => mods.every((m) => (m.kind === "addKeywords" || !["2", "4", "5", "6"].includes(layerOf(m))) && !(m.kind === "definePT" && (m.power === undefined || m.toughness === undefined)));

/**
 * Can an effect give this quoted ability to an object? It's one ability we can run: triggered, activated or mana
 * ("When this creature enters or leaves the battlefield" compiles to two triggers), or a static ability of the kinds above.
 */
function grantable(text: string): boolean {
  if (text.includes(QUOTED_SOURCE_NAME)) return false;
  const c = compileGranted(text);
  const { triggers, activated, mana, statics, entersTapped, unsupported, textKeywords, ...rest } = c;
  const n = triggers.length + activated.length + mana.length + statics.length + Object.keys(rest).length;
  if (n === 0 || entersTapped || unsupported.length || textKeywords.length) return false;
  if (!Object.keys(rest).every((k) => GRANTED_FIELDS.has(k))) return false;
  // "Players have no maximum hand size" stays a permanent's own.
  if (rest.noMaxHandSize === "all") return false;
  return statics.every((st) => grantedStaticOk(st.mods));
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
    else {
      // A static ability about the creature itself ("This creature can't be blocked by creatures with power 2 or
      // less", "assigns combat damage equal to its toughness"): the same change, on the target until end of turn.
      const st = selfStatic(line);
      if (!st) return null;
      mods.push(...st);
    }
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

/** The modifications of a static ability that changes only the object that has it, with no condition. */
const SELF_ONLY: Modification["kind"][] = ["cantBeBlockedBy", "assignsToughness", "attackDespiteDefender"];
function selfStatic(text: string): Modification[] | null {
  const c = compileGranted(text);
  const { statics, triggers, activated, mana, entersTapped, unsupported, textKeywords, ...rest } = c;
  const st = statics[0];
  if (statics.length !== 1 || triggers.length || activated.length || mana.length || entersTapped || unsupported.length || textKeywords.length || Object.keys(rest).length) return null;
  if (st!.affects.kind !== "self" || st!.condition || !st!.mods.every((m) => SELF_ONLY.includes(m.kind))) return null;
  return st!.mods;
}

const describeGrants = (kws: string[], mods: Modification[]) =>
  [
    ...kws.map((k) => k.toLowerCase()),
    ...mods.flatMap((m) =>
      m.kind === "addAbility"
        ? [`"${m.text.replace(/~/g, "this creature")}"`]
        : m.kind === "cantBeBlockedBy"
          ? [`"can't be blocked by ${m.filter.text}"`]
          : m.kind === "assignsToughness"
            ? ['"assigns combat damage equal to its toughness rather than its power"']
            : m.kind === "attackDespiteDefender"
              ? ['"can attack as though it didn\'t have defender"']
              : [],
    ),
  ].join(" and ");

/**
 * What follows "has", "have" or "gains": keywords, quoted abilities, or both ('flying and "{T}: ..."').
 * Layer 6 either way.
 */
export function parseGrants(text: string): Modification[] | null {
  const out: Modification[] = [];
  // A comma that separates the list can sit inside the quotes: 'flying, deathtouch, "Ward—Pay 3 life," and "..."'.
  // A quoted ability ends with a period even where the sentence around it cuts it ('"{T}: Add {C}" and loses ...').
  const quoted = [...text.matchAll(/"([^"]+)"/g)].map((q) => q[1]!.replace(/,$/, "").replace(/([^.!?])$/, "$1."));
  // "Protection from black and from red" is two protection abilities (CR 702.16g).
  const words = text.replace(/(protection|hexproof) from (\w+) and from (\w+)/gi, "$1 from $2, $1 from $3").replace(/"[^"]+"/g, "\u0000").replace(/\bmobilize X, where X is its power$/i, "\u0001").split(/,\s*(?:and\s+)?|\s+and\s+/).map((x) => x.trim()).filter(Boolean);
  const kws: string[] = [];
  for (const w0 of words) {
    if (w0 === "\u0000") continue;
    // Mobilize is a triggered ability (CR 702.181a), each instance on its own (702.181b): "has menace and mobilize X, where
    // X is its power" (Infantry Shield), the creature's own power as the trigger resolves.
    const w = w0 === "\u0001" ? "mobilize X, where X is ~'s power" : w0;
    if (/^mobilize (?:\d+|X, where X is ~'s power)$/i.test(w)) {
      out.push({ kind: "addAbility", text: `Mobilize ${w.slice("mobilize ".length)}` });
      continue;
    }
    // Keywords that are triggered abilities: each grant is its own instance, which triggers separately (CR 702.121b).
    if (/^melee$/i.test(w)) {
      out.push({ kind: "addAbility", text: "Melee" });
      continue;
    }
    // Annihilator too (CR 702.86b): "has trample and annihilator 2" (Eldrazi Conscription); afflict (CR 702.130b) and
    // bushido (CR 702.45b) the same: "Artifact creatures you control have afflict 3" (Cyberman Patrol). Renown too (CR
    // 702.112c): "Attacking creatures you control have first strike and renown 1" (Aragorn, Hornburg Hero); frenzy (CR
    // 702.68b): "All Sliver creatures have frenzy 1" (Frenzy Sliver).
    if (/^(?:annihilator|afflict|bushido|renown|frenzy) \d+$/i.test(w)) {
      out.push({ kind: "addAbility", text: `${w.charAt(0).toUpperCase()}${w.slice(1).toLowerCase()}` });
      continue;
    }
    // Firebending N too (CR 702.189a): "gains firebending 4 until end of turn" (Fire Nation Palace), each instance
    // triggering on its own (rulings).
    if (/^firebending \d+$/i.test(w)) {
      out.push({ kind: "addAbility", text: `Firebending ${/\d+/.exec(w)![0]}` });
      continue;
    }
    // Myriad too: several instances each trigger (CR 702.116b); prowess the same (CR 702.108b): "Other creatures you
    // control have prowess" (Bria, Riptide Rogue).
    // Dethrone (CR 702.105b) and exalted (702.83b) too: "Other creatures you control have dethrone" (Marchesa, the Black Rose).
    // Exploit (CR 702.110a) is an enters trigger: "Other legendary creatures you control have exploit" (Colonel Autumn)
    // gives it to a creature as it enters, so it triggers (CR 603.6a, 603.10).
    // Evolve (CR 702.100d) and training (702.149b) too: "Creature tokens you control have evolve" (Propagator Drone).
    // Provoke too (CR 702.39b): "All Sliver creatures have provoke" (Hunter Sliver). Extort too, each instance triggering
    // on its own (CR 702.101b): "Other creatures you control have extort" (Pontiff of Blight).
    if (/^(?:myriad|prowess|dethrone|exalted|exploit|evolve|training|provoke|extort)$/i.test(w)) {
      out.push({ kind: "addAbility", text: w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() });
      continue;
    }
    // Flanking is a triggered ability too, each instance triggering on its own (CR 702.25a-b): "Enchanted creature gets
    // +1/+1 and has flanking" (Agility). It's also a keyword, for a blocker's "creature without flanking".
    if (/^flanking$/i.test(w)) {
      out.push({ kind: "addAbility", text: "Flanking" });
      kws.push("Flanking");
      continue;
    }
    // Rampage N the same (CR 702.23a, c): "gains rampage 2 until end of turn" (Rapid Fire), a keyword for "If it doesn't
    // have rampage".
    if (/^rampage \d+$/i.test(w)) {
      out.push({ kind: "addAbility", text: `Rampage ${/\d+/.exec(w)![0]}` });
      kws.push("Rampage");
      continue;
    }
    // Persist and undying are triggered abilities (CR 702.79a, 702.93a): it dies with them, so they look back (603.10a).
    if (/^(?:persist|undying)$/i.test(w)) {
      out.push({ kind: "addAbility", text: w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() });
      continue;
    }
    // Fabricate N is an enters trigger too (CR 702.123a), so one granted to a creature as it enters triggers (CR 603.6a,
    // 603.10): "Other nontoken creatures you control have fabricate 1" (Cayth, Famed Mechanist).
    if (/^fabricate \d+$/i.test(w)) {
      out.push({ kind: "addAbility", text: `Fabricate ${/\d+/.exec(w)![0]}` });
      continue;
    }
    // Afterlife N is one too (CR 702.135a), each instance on its own (702.135b): "Enchanted creature gets +1/+1 and has
    // afterlife 1" (Indebted Spirit). The creature had it as it last existed, with the Aura still attached (CR 603.10a).
    if (/^afterlife \d+$/i.test(w)) {
      out.push({ kind: "addAbility", text: `Afterlife ${/\d+/.exec(w)![0]}` });
      continue;
    }
    // Read ahead (CR 702.155a): how a Saga enters and which chapters trigger the turn it entered; one granted by another
    // permanent applies as it enters (CR 614.12; see finishEntering) and that turn.
    if (/^read ahead$/i.test(w)) {
      out.push({ kind: "addAbility", text: "Read ahead" });
      continue;
    }
    // Riot is a replacement effect for how it enters (CR 702.136a), each instance on its own (702.136b): one granted by
    // another permanent applies as the creature enters (CR 614.12, rulings on Rhythm of the Wild; see finishEntering).
    if (/^riot$/i.test(w)) {
      out.push({ kind: "addAbility", text: "Riot" });
      continue;
    }
    // Ward is a triggered ability too (CR 702.21a); several instances each trigger (CR 702.21b).
    const ward = /^ward ((?:\{(?:\d+|[WUBRGC])\})+)$/i.exec(w) ?? /^ward—pay (\d+) life$/i.exec(w);
    if (ward) {
      out.push({ kind: "addAbility", text: /life$/i.test(w) ? `Ward—Pay ${ward[1]} life` : `Ward ${ward[1]}` });
      continue;
    }
    // "Equipment you control have equip {0}" (Puresteel Paladin): another equip ability (CR 702.6a, 702.6e).
    const equip = /^equip (\{\d+\})$/i.exec(w);
    if (equip) {
      out.push({ kind: "addAbility", text: `Equip ${equip[1]}` });
      continue;
    }
    // "Is a Vehicle artifact with crew 5" (Swift Reconfiguration): a crew ability of its own (CR 702.122a), on top of any
    // it has (rulings).
    const crew = /^crew (\d+)$/i.exec(w);
    if (crew) {
      out.push({ kind: "addAbility", text: `Crew ${crew[1]}` });
      continue;
    }
    // "Gain all creature types" (Mirror Entity): layer 4, in addition to its other types (CR 205.3d, 613.1d); a
    // noncreature keeps none (layers.ts).
    if (/^all creature types$/i.test(w)) {
      out.push({ kind: "addTypes", types: [], subtypes: [], allCreatureTypes: true });
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

/**
 * The events whose triggered abilities work on an emblem in the command zone (CR 114.4): fireEvent looks for them on
 * emblems as well as on permanents.
 */
export const EMBLEM_EVENTS = new Set<TriggeredAbility["event"]>([
  "yourUpkeep", "eachUpkeep", "yourDrawStep", "eachDrawStep", "yourEndStep", "eachEndStep", "yourBeginCombat", "eachBeginCombat",
  "yourEndCombat", "eachEndCombat", "yourFirstMain", "eachFirstMain", "yourPostcombatMain", "eachPostcombatMain",
  "castSpell", "permanentEnters", "anotherCreatureYouControlEnters", "landYouControlEnters", "permanentDies", "youGainLife",
  "playerDraws", "creatureYouControlAttacks", "creatureYouControlDealsCombatDamageToPlayer", "permanentBecomesTapped",
  "creaturesYouControlDealCombatDamageToPlayer",
]);

/**
 * Can an emblem have this ability (CR 114.3), with "this emblem" in it written "~"? A triggered ability for one of
 * EMBLEM_EVENTS, a static ability about the permanents its controller controls or others (applied by the layers),
 * "spells you cast cost less", "you have no maximum hand size", or "you may play lands and cast permanent spells from your
 * graveyard", or "you may cast spells from your hand without paying their mana costs" (Tamiyo, Field Researcher's). The emblem itself is no permanent, so nothing about
 * "~" being tapped, attacking or enchanting something can apply.
 */
export function emblemAbilityOk(text: string): boolean {
  if (text.includes(QUOTED_SOURCE_NAME)) return false;
  const c = compileGranted(text);
  const { triggers, activated, mana, statics, entersTapped, unsupported, textKeywords, costMods, noMaxHandSize, opponentsCantCast, loyaltyAtInstantSpeed, spellsHaveStorm, landsFromGraveyard, graveyardGrants, castFromHandFree, drawsInOpponentsDrawStep, lifeFloor, lifeFloorIf, cantLose, cantWin, gameEndIf, ...rest } = c;
  // Gideon of the Trials': "As long as you control a Gideon planeswalker, you can't lose the game and your opponents can't
  // win the game", for its owner (game.ts gameEndBlocked).
  const gameLock = cantLose === "you" && cantWin === "opponents" && (!gameEndIf || gameEndIf.kind === "control");
  if ((cantLose || cantWin) && !gameLock) return false;
  if (unsupported.length || textKeywords.length || entersTapped || activated.length || mana.length || Object.keys(rest).length) return false;
  if (!triggers.length && !statics.length && !costMods?.length && noMaxHandSize !== true && !opponentsCantCast && !loyaltyAtInstantSpeed && !spellsHaveStorm?.length && !landsFromGraveyard && !graveyardGrants?.length && !castFromHandFree && !drawsInOpponentsDrawStep && !lifeFloor && !gameLock) return false;
  // Serra the Benevolent's: a life floor for its owner (read from emblems in damage.ts), maybe while they control a creature.
  if (lifeFloorIf && lifeFloorIf.kind !== "control") return false;
  // "You may play lands and cast permanent spells from your graveyard" (Wrenn and Realmbreaker's): permissions for its
  // owner's graveyard, read from emblems as well as permanents (game.ts).
  if (graveyardGrants?.some((g) => g.way.kind !== "permission" || g.once || g.yourTurn || g.if)) return false;
  if (noMaxHandSize === "all") return false;
  if (!triggers.every((t) => EMBLEM_EVENTS.has(t.event) && !t.host && !t.zone && !t.activeIf && (!t.ifCond || t.ifCond.kind === "eventPlayerLifeLost") && !t.hostControllersUpkeep && !t.enchantedPlayersTurn)) return false;
  // A damage replacement about you and what you control (Ajani Steadfast's), not about the emblem itself.
  const damageMod = (st: (typeof statics)[number]) => st.affects.kind === "self" && !st.condition && st.mods.every((m) => m.kind === "damageMod" && !m.mod.by?.self && !m.mod.by?.other && !m.mod.to?.self && !m.mod.to?.other);
  if (!statics.every((st) => damageMod(st) || (st.affects.kind === "filter" && !st.affects.other && !st.condition && st.affects.controller !== "enchanted"))) return false;
  return (costMods ?? []).every((m) => !m.if && m.who !== "enchanted");
}
