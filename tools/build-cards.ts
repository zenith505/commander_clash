// Builds the game's card database from Scryfall bulk data.
//
//   npm run build:cards                    (uses the newest files in data/raw/)
//   npm run build:cards -- <cards.jsonl> <rulings.jsonl> [--cards-only]
//
// Accepts "unique-artwork", "all-cards" or "default-cards" bulk files, or the much smaller extract that
// tools/scryfall-extract.mjs makes from one (scryfall-oracle-cards.jsonl.gz; .gz files are read as they are).
// all-cards is ~3 GB and includes every language, so it is streamed and filtered to English.
//
// Outputs (data/generated/):
//   cards.json         one entry per English oracle card: CardDef + legality + printing info, with every face
//   rulings.json       oracle_id -> rulings
//   sample-decks.json  four 100-card decks built only from cards the engine fully supports
// and copies the deck bundle to apps/web/public/data/ for the UI. --cards-only leaves the decks as they are.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  canBeCommander,
  allEffects,
  cardFromScryfall,
  castingBody,
  compileCard,
  modsAreHarmful,
  isFullySupported,
  meldResultsFor,
  registerMeldResults,
  validateCommanderDeck,
  type CardRecord,
  type Color,
} from "../packages/engine/src";
import { bestPrintings, lines, newest } from "./scryfall-extract.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const RAW = join(ROOT, "data", "raw");
const OUT = join(ROOT, "data", "generated");
const WEB = join(ROOT, "apps", "web", "public", "data");

async function buildCards(path: string) {
  const { seen, cards: printings } = await bestPrintings(path, (n: number) => console.log(`  ...${n.toLocaleString()} lines`));
  const cards = printings.map(cardFromScryfall).sort((a, b) => a.name.localeCompare(b.name));
  console.log(`Read ${seen.toLocaleString()} printings -> ${cards.length.toLocaleString()} English oracle cards`);
  return cards;
}

async function buildRulings(path: string) {
  const out: Record<string, { date: string; source: string; text: string }[]> = {};
  for await (const line of lines(path)) {
    const r = JSON.parse(line);
    (out[r.oracle_id] ??= []).push({ date: r.published_at, source: r.source, text: r.comment });
  }
  return out;
}

const BASICS: Record<Color, string> = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest" };

/**
 * Four mono-colored decks using only fully supported cards, so every card in them actually
 * works: creatures (favoring ones with abilities), plus a suite of instants and sorceries.
 */
function buildSampleDecks(cards: CardRecord[]) {
  const legal = cards.filter((c) => c.commanderLegal === "legal" && !c.gameChanger && isFullySupported(c));
  const byName = new Map(cards.map((c) => [c.name, c]));
  const abilityCount = (c: CardRecord) => {
    const k = compileCard(c);
    return k.triggers.length + k.activated.length;
  };
  const creatureScore = (c: CardRecord) =>
    c.keywords.length * 2 + abilityCount(c) * 4 + Number(c.power ?? 0) + Number(c.toughness ?? 0) - c.cmc - (c.keywords.includes("Defender") ? 6 : 0);
  const spellScore = (c: CardRecord) => {
    const body = compileCard(c).spell;
    if (!body) return -99;
    const value: Record<string, number> = { destroy: 6, exile: 7, damage: 5, counterSpell: 5, draw: 4, createToken: 4, bounce: 3, counters: 3, pump: 2 };
    // Removal that can only hit artifacts, enchantments or lands is mostly dead in these decks.
    const hitsCreatures = body.targets.every((t) => t.kind !== "object" || !t.types?.length || t.types.includes("Creature"));
    const raw = body.effects.reduce((n, e) => n + (value[e.type] ?? 1), 0);
    return (hitsCreatures ? raw : raw * 0.2) * 2 - c.cmc;
  };
  // Auras, Equipment and anthems: score what their static abilities do.
  const supportScore = (c: CardRecord) => {
    const k = compileCard(c);
    if (!k.statics.length) return -99;
    let n = 0;
    for (const st of k.statics)
      for (const m of st.mods) {
        if (m.kind === "modifyPT") n += (m.power + m.toughness) * (st.affects.kind === "filter" ? 2 : 1);
        if (m.kind === "addKeywords") n += 2 * m.keywords.length;
        if (m.kind === "control") n += 12;
        if (m.kind === "cantAttack" || m.kind === "cantBlock") n += 4;
      }
    const body = castingBody(c);
    if (body?.effects.some((e) => e.type === "continuous" && modsAreHarmful(e.mods))) n = Math.max(n, 8); // removal Auras
    return n - c.cmc;
  };
  const decks = [];
  for (const color of ["W", "U", "R", "G", "B"] as Color[]) {
    const pool = legal.filter((c) => c.colorIdentity.length <= 1 && (c.colorIdentity.length === 0 || c.colorIdentity[0] === color));
    const commander = pool
      .filter((c) => canBeCommander(c) && c.colorIdentity[0] === color && c.cmc >= 3 && c.cmc <= 5)
      .sort((a, b) => creatureScore(b) - creatureScore(a))[0];
    if (!commander) continue;
    const spells = pool
      .filter((c) => c.types.includes("Instant") || c.types.includes("Sorcery"))
      .filter((c) => c.colorIdentity.length === 1)
      .sort((a, b) => spellScore(b) - spellScore(a))
      .slice(0, 14);
    // A few modal cards ("Choose one —"), so the mode picker gets used.
    const isModal = (c: CardRecord) => {
      const k = compileCard(c);
      return !!k.spell?.modal || k.triggers.some((x) => x.body.modal) || k.activated.some((x) => x.body.modal);
    };
    const modal = pool
      .filter((c) => isModal(c) && !spells.includes(c) && c.colorIdentity.length === 1 && c.cmc <= 6)
      .sort((a, b) => a.cmc - b.cmc)
      .slice(0, 4);
    // And a few that use newer mechanics: graveyard targets, "you may", Treasure/Food/Clue,
    // discard, scry, surveil and fight, so those screens come up in play.
    const NEW = new Set(["putOntoBattlefield", "putInLibrary", "exileGraveyard", "may", "discard", "scry", "surveil", "fight", "bite"]);
    const usesNew = (c: CardRecord) => {
      const k = compileCard(c);
      const bodies = [k.spell, ...k.triggers.map((x) => x.body), ...k.activated.map((x) => x.body)].filter((b) => !!b);
      const all = bodies.flatMap((b) => [b!, ...(b!.modal?.modes ?? [])]);
      return all.some(
        (b) => b.targets.some((x) => x.kind === "card") || allEffects(b.effects).some((e) => NEW.has(e.type) || (e.type === "createToken" && !!e.token.abilities)),
      );
    };
    const showcase: CardRecord[] = pool
      .filter((c) => usesNew(c) && !spells.includes(c) && !modal.includes(c) && c.colorIdentity.length === 1 && c.cmc >= 1 && c.cmc <= 5)
      .sort((a, b) => a.cmc - b.cmc || a.name.localeCompare(b.name))
      .slice(0, 6);
    // One card each for the mechanics added in each round (cycling, crew, convoke, ward, ...), so they come up in games too.
    const MECHANICS: ((k: ReturnType<typeof compileCard>, c: CardRecord) => boolean)[] = [
      (k) => k.activated.some((a) => a.zone === "hand"),
      (k) => k.activated.some((a) => a.crew !== undefined),
      (k) => !!k.convoke,
      (k) => k.triggers.some((x) => x.event === "becomesTargetOfOpponent"),
      (k) => k.triggers.some((x) => x.event === "castSpell"),
      (k) => k.triggers.some((x) => x.event === "castSpell"),
      // Protection, infect/wither/toxic, exalted, landfall, regeneration, "attacks each combat if able"
      (k) => k.textKeywords.some((x) => x.startsWith("Protection")),
      (_k, c) => c.keywords.some((x) => x === "Infect" || x === "Wither" || x === "Toxic"),
      (k) => k.triggers.some((x) => x.event === "creatureYouControlAttacksAlone"),
      (k) => k.triggers.some((x) => x.event === "landYouControlEnters"),
      (k) => k.activated.some((a) => a.body.effects.some((e) => e.type === "regenerate")),
      (k) => k.statics.some((x) => x.mods.some((m) => m.kind === "attacksIfAble")),
      // Block triggers (bushido, flanking, rampage...), persist/undying/soulshift, life-gain triggers,
      // damage prevention, once-each-turn pumps, threshold, "can't be blocked by ..."
      (k) => k.triggers.some((x) => /^self(Blocks|BecomesBlocked|BlockedBy)/.test(x.event)),
      (k) => k.triggers.some((x) => /^self(Blocks|BecomesBlocked|BlockedBy)/.test(x.event)),
      (k) => k.triggers.some((x) => x.ifNoCounter !== undefined || x.body.text.startsWith("Soulshift")),
      (k) => k.triggers.some((x) => x.event === "youGainLife"),
      (k) => k.activated.some((a) => a.body.effects.some((e) => e.type === "preventNext")),
      (k) => k.activated.some((a) => a.oncePerTurn),
      (k) => k.statics.some((x) => !!x.condition),
      (k) => k.statics.some((x) => x.mods.some((m) => m.kind === "cantBeBlockedBy" || m.kind === "maxOneBlocker")),
      // Mana abilities that cost mana or make more than one, explore, renown, fabricate/modular/evolve,
      // battle cry, bloodthirst, cascade, affinity, improvise
      (k) => k.mana.some((m) => !!m.manaCost || (m.produces.kind === "fixed" && m.produces.mana.length > 1) || !!m.selfDamage),
      (k) => k.triggers.some((x) => x.body.effects.some((e) => e.type === "explore")),
      (k) => k.triggers.some((x) => x.ifNotRenowned || x.ifEvolves || x.body.text.startsWith("Fabricate") || x.body.text.startsWith("Modular")),
      (k) => k.triggers.some((x) => x.body.text.startsWith("Battle cry")) || !!k.bloodthirst,
      (k) => k.triggers.some((x) => x.event === "selfCast"),
      (k) => !!k.costLess?.length || !!k.improvise,
    ];
    const mechanicCards: CardRecord[] = [];
    for (const has of MECHANICS) {
      const pick = pool
        .filter((c) => c !== commander && has(compileCard(c), c) && ![...spells, ...modal, ...showcase, ...mechanicCards].includes(c) && c.cmc >= 1 && c.cmc <= 5)
        .sort((a, b) => creatureScore(b) - creatureScore(a) || a.name.localeCompare(b.name))[0];
      if (pick) mechanicCards.push(pick);
    }
    showcase.push(...mechanicCards);
    const support = pool
      .filter((c) => !c.types.includes("Creature") && !c.types.includes("Land") && (c.subtypes.includes("Aura") || c.subtypes.includes("Equipment") || c.types.includes("Enchantment")))
      .filter((c) => c.colorIdentity.length === 1 || c.subtypes.includes("Equipment"))
      .sort((a, b) => supportScore(b) - supportScore(a))
      .slice(0, 6);
    const others = pool
      .filter((c) => c !== commander && !c.types.includes("Land") && !spells.includes(c) && !support.includes(c) && !modal.includes(c) && !showcase.includes(c) && !c.types.includes("Instant") && !c.types.includes("Sorcery"))
      .filter((c) => c.cmc >= 1 && c.cmc <= 7)
      .filter((c) => !c.subtypes.includes("Vehicle")) // they need crew; the mechanics pick above adds one
      .sort((a, b) => creatureScore(b) - creatureScore(a));
    // A rough curve for the permanents.
    const curve: Record<number, number> = { 1: 5, 2: 12, 3: 11, 4: 9, 5: 7, 6: 3, 7: 2 };
    const chosen: CardRecord[] = [...spells, ...modal, ...showcase, ...support];
    for (const [mv, n] of Object.entries(curve)) chosen.push(...others.filter((c) => c.cmc === Number(mv)).slice(0, n));
    const basic = byName.get(BASICS[color]);
    if (!basic) throw new Error(`missing basic ${BASICS[color]}`);
    const deck = [...chosen.slice(0, 63), ...Array.from({ length: 99 - Math.min(63, chosen.length) }, () => basic)];
    const problems = validateCommanderDeck(commander, deck);
    if (problems.length) throw new Error(`sample deck ${color}: ${JSON.stringify(problems.slice(0, 3))}`);
    decks.push({ name: `${commander.name} (${color})`, commander: commander.name, cards: deck.map((c) => c.name) });
  }
  return decks;
}

async function main() {
  const args = process.argv.slice(2);
  const cardsOnly = args.includes("--cards-only");
  const [cardsArg, rulingsArg] = args.filter((a) => !a.startsWith("--"));
  const cardsPath = cardsArg ?? newest(RAW, "unique-artwork") ?? newest(RAW, "default-cards") ?? newest(RAW, "all-cards") ?? newest(RAW, "scryfall-oracle-cards");
  const rulingsPath = rulingsArg ?? newest(RAW, "rulings") ?? newest(RAW, "scryfall-rulings");
  if (!cardsPath && existsSync(join(OUT, "cards.json"))) {
    // No raw Scryfall files: rebuild the decks from the card database built last time.
    console.log("No Scryfall files in data/raw; rebuilding sample decks from data/generated/cards.json");
    return writeDecks(JSON.parse(readFileSync(join(OUT, "cards.json"), "utf8")));
  }
  if (!cardsPath) throw new Error(`No card data found. Put a Scryfall bulk .jsonl file in ${RAW}`);
  console.log(`Cards:   ${cardsPath}\nRulings: ${rulingsPath ?? "(none)"}`);

  mkdirSync(OUT, { recursive: true });
  const cards = await buildCards(cardsPath);
  writeFileSync(join(OUT, "cards.json"), JSON.stringify(cards));
  console.log(`Cards with more than one face: ${cards.filter((c) => c.faces).length.toLocaleString()}`);

  if (rulingsPath) {
    const rulings = await buildRulings(rulingsPath);
    writeFileSync(join(OUT, "rulings.json"), JSON.stringify(rulings));
    console.log(`Rulings for ${Object.keys(rulings).length.toLocaleString()} cards`);
  }

  registerMeldResults(cards);
  if (cardsOnly) console.log(`Fully supported by the engine today: ${cards.filter((c) => c.commanderLegal === "legal" && isFullySupported(c)).length.toLocaleString()} of ${cards.length.toLocaleString()}`);
  else writeDecks(cards);
}

function writeDecks(cards: CardRecord[]) {
  // The combined back faces of the meld pairs, for their meld cards (CR 712.4).
  registerMeldResults(cards);
  mkdirSync(OUT, { recursive: true });
  mkdirSync(WEB, { recursive: true });
  const supported = cards.filter((c) => c.commanderLegal === "legal" && isFullySupported(c)).length;
  console.log(`Fully supported by the engine today: ${supported.toLocaleString()} of ${cards.length.toLocaleString()}`);

  const decks = buildSampleDecks(cards);
  writeFileSync(join(OUT, "sample-decks.json"), JSON.stringify(decks, null, 2));
  // The UI gets the decks plus just the card definitions they use.
  // A meld card's combined back face comes along: it's never in a deck (CR 712.4b), but the game needs it.
  const used = new Set(decks.flatMap((d) => [d.commander, ...d.cards]));
  for (const r of meldResultsFor(cards.filter((c) => used.has(c.name)))) used.add(r.name);
  const bundle = { decks, cards: cards.filter((c) => used.has(c.name)) };
  writeFileSync(join(WEB, "sample-decks.json"), JSON.stringify(bundle));
  for (const d of decks) console.log(`Deck: ${d.name}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
