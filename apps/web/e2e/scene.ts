// Builds game states for the browser tests with the engine, and opens the app on them.

import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { applyAction, createGame, meldResultsFor, registerMeldResults, invalidateCharacteristics, newObject, PREDEFINED_TOKENS, tokenDef, waitingOn, type CardDef, type GameState, type PlayerId, type Step, type ZoneName } from "@cc/engine";

/** Real card definitions, written by `npm run e2e:cards` from every card name quoted in these files. */
const CARDS: CardDef[] = JSON.parse(readFileSync(new URL("./cards.json", import.meta.url), "utf8"));
const byName = new Map(CARDS.map((c) => [c.name, c]));
registerMeldResults(CARDS);

export function def(name: string): CardDef {
  const d = byName.get(name);
  if (!d) throw new Error(`${name} isn't in e2e/cards.json: quote its name in a test and run \`npm run e2e:cards\``);
  return d;
}

/** Where a player's cards start. Library cards go on top, the first one topmost. */
export interface Seat {
  hand?: string[];
  board?: string[];
  yard?: string[];
  library?: string[];
  exile?: string[];
  commander?: string;
  life?: number;
  /** Predefined tokens on the battlefield: "Treasure", "Clue", "Food". */
  tokens?: string[];
}

/** Ten of each basic land: enough mana for anything a test casts. */
export const LANDS = ["Plains", "Island", "Swamp", "Mountain", "Forest"].flatMap((l) => [l, l, l]);

/**
 * A four-player game in your (seat 0's) first main phase of turn `turn`, with nothing in any hand and only basic
 * lands in every library, then each seat's cards put where `seats` says. Opponents are seats 1 to 3, in turn order
 * after you. Opponents' commanders are vanilla creatures they can't afford, so bots stay quiet unless given cards.
 */
export function scene(you: Seat, opps: Seat[] = [], opts: { step?: Step; seed?: number; mulligans?: boolean } = {}): GameState {
  const seats = [you, ...opps];
  const basics = () => Array.from({ length: 40 }, (_, i) => def(["Plains", "Island", "Swamp", "Mountain", "Forest"][i % 5]!));
  let s = createGame(
    ["You", "Ana", "Ben", "Cy"].map((name, i) => ({ name, commander: def(seats[i]?.commander ?? "Krosan Cloudscraper"), deck: basics(), isBot: i > 0 })),
    opts.seed ?? 7,
    { mulligans: !!opts.mulligans },
  );
  if (opts.mulligans) {
    // Your opening hand is exactly `you.hand` (plus lands to make seven); nothing else moves.
    place(s, 0, you, true);
    return s;
  }
  s.turnOrder = [0, 1, 2, 3];
  s = passUntil(s, opts.step ?? "main1", 0);
  for (let pid = 0; pid < 4; pid++) place(s, pid, seats[pid] ?? {}, false);
  // The combined back faces the meld cards here meld into (CR 712.4), part of the game's cards as in a game built from decks.
  for (const r of meldResultsFor(Object.values(s.cards))) s.cards[r.oracleId] ??= r;
  invalidateCharacteristics(s);
  return s;
}

function place(s: GameState, pid: PlayerId, seat: Seat, keepHandSize: boolean) {
  const p = s.players[pid]!;
  if (seat.life !== undefined) p.life = seat.life;
  // Empty the hand back into the library.
  const hand = keepHandSize ? p.hand.splice(0, (seat.hand ?? []).length) : p.hand.splice(0);
  for (const id of hand) {
    s.objects[id]!.zone = "library";
    p.library.push(id);
  }
  const add = (name: string, zone: ZoneName) => {
    const o = newObject(s, def(name), pid, zone);
    o.controlledSinceTurn = -1;
    return o;
  };
  for (const n of seat.hand ?? []) p.hand.unshift(add(n, "hand").id);
  for (const n of seat.yard ?? []) p.graveyard.push(add(n, "graveyard").id);
  for (const n of seat.exile ?? []) p.exile.push(add(n, "exile").id);
  for (const n of [...(seat.library ?? [])].reverse()) p.library.unshift(add(n, "library").id);
  for (const n of seat.board ?? []) s.battlefield.push(add(n, "battlefield").id);
  for (const n of seat.tokens ?? []) {
    const o = newObject(s, tokenDef(PREDEFINED_TOKENS[n]!), pid, "battlefield");
    o.isToken = true;
    o.controlledSinceTurn = -1;
    s.battlefield.push(o.id);
  }
}

/** Everyone passes (declaring no attacks or blocks) until `step` of `active`'s turn. */
function passUntil(s: GameState, step: Step, active: PlayerId): GameState {
  for (let i = 0; i < 2000; i++) {
    if (s.step === step && s.activePlayer === active && !s.pending) return s;
    const pid = waitingOn(s)!;
    const pend = s.pending;
    if (pend?.kind === "declareAttackers") s = applyAction(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (pend?.kind === "declareBlockers") s = applyAction(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (pend?.kind === "discardToHandSize") s = applyAction(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, pend.count) });
    else s = applyAction(s, { type: "passPriority", player: pid });
  }
  throw new Error(`never reached ${step}`);
}

/** Opens the app on `s`. Bots act as in a real game; the human always holds priority ("hold" mode). */
export async function open(page: Page, s: GameState) {
  watchErrors(page);
  await page.addInitScript((json) => {
    (window as unknown as { __ccTestState: unknown }).__ccTestState = JSON.parse(json);
  }, JSON.stringify(s));
  await page.goto("/");
  await expect(page.locator(".table, .board, main").first()).toBeVisible();
}

/** Collect the page's uncaught errors and console errors, for `pageErrors`. */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // React's warnings (duplicate keys, bad nesting, ...) count too; a missing image or favicon doesn't.
  page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(m.text()));
  (page as Page & { ccErrors?: string[] }).ccErrors = errors;
}

/** The engine state the page is showing. */
export function state(page: Page): Promise<GameState> {
  return page.evaluate(() => (window as unknown as { __ccState: GameState }).__ccState);
}

/** The ids of `pid`'s cards named `name` in `zone` (in zone order). */
export function idsOf(s: GameState, name: string, zone?: ZoneName, pid?: PlayerId): string[] {
  return Object.values(s.objects)
    .filter((o) => s.cards[o.cardId]?.name === name && (zone === undefined || o.zone === zone) && (pid === undefined || o.owner === pid))
    .map((o) => o.id);
}

/** The id of the (first) card named `name`. */
export function one(s: GameState, name: string): string {
  const id = idsOf(s, name)[0];
  if (!id) throw new Error(`no ${name} in the scene`);
  return id;
}

/** Uncaught errors and console errors in the page so far: a test fails if the UI threw or React complained. */
export function pageErrors(page: Page): string[] {
  return (page as Page & { ccErrors?: string[] }).ccErrors ?? [];
}
