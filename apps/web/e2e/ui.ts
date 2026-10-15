// Small helpers for finding things on the table and moving the game along.
import { expect, type Locator, type Page } from "@playwright/test";
import { waitingOn, type GameState, type PlayerId } from "@cc/engine";
import { idsOf, state } from "./scene";

/** The bar under the phase track with the current prompt's text and buttons. */
export const controls = (page: Page): Locator => page.locator(".control-pane .controls");

/** The `n`th card named `name` (any zone) as `s` placed it. */
export function card(page: Page, name: string, s: GameState, n = 0, pid?: PlayerId): Locator {
  const id = idsOf(s, name, undefined, pid)[n];
  if (!id) throw new Error(`no ${name} in the scene`);
  return page.locator(`[data-obj="${id}"]`).first();
}

/** A seat's area (0 is you). */
export const seat = (page: Page, pid: PlayerId): Locator => page.locator(`section.seat[data-seat="${pid}"]`);

/**
 * Click Pass / Resolve (and declare no attacks or blocks) whenever it's yours to click, until `done` holds for the
 * engine state (bots act on their own). Fails if the game stops somewhere else, waiting on you for a different prompt.
 */
export async function resolveUntil(page: Page, done: (s: GameState) => boolean, max = 40) {
  const mark = (s: GameState) => `${s.log.length}:${s.turn}:${s.step}:${s.priority}:${s.stack.length}:${s.pending?.kind}`;
  for (let clicks = 0; clicks < max; ) {
    const s = await state(page);
    if (done(s)) return s;
    if (s.pending?.player === 0 && !["chooseTargets", "declareAttackers", "declareBlockers"].includes(s.pending.kind)) throw new Error(`stopped on a ${s.pending.kind} prompt`);
    // Only click once the game has settled on you: an auto-pass or a bot could be about to move it on.
    await page.waitForTimeout(150);
    const now = await state(page);
    if (done(now)) return now;
    if (mark(now) !== mark(s) || waitingOn(now) !== 0) continue;
    const pass = controls(page).getByRole("button", { name: /^(Pass|Resolve|No attacks|No blocks)$/ });
    if (now.pending?.kind === "chooseTargets" || !(await pass.count())) continue;
    await pass.click({ timeout: 2000 }).catch(() => undefined);
    clicks++;
  }
  const s = await state(page);
  expect(done(s), `game state never got there (step ${s.step}, turn ${s.turn}, pending ${s.pending?.kind})`).toBe(true);
  return s;
}

/** Click a player's name, as when choosing them as a target or the player a creature attacks. */
export const clickPlayer = (page: Page, pid: PlayerId) => page.locator(`[data-player="${pid}"]`).first().click();

/** The menu that opens on clicking a card with choices (abilities, alternative costs, ...). */
export const menu = (page: Page): Locator => page.locator(".ability-menu");

/** The pop-up window for picking cards (searches, digs, opponents' hands, ...). */
export const modal = (page: Page): Locator => page.locator(".modal");

/** Pass priority until it's your `step` with nothing on the stack, on turn `turn` if given. */
export const passTo = (page: Page, step: GameState["step"], turn?: number) =>
  resolveUntil(page, (st) => st.step === step && st.activePlayer === 0 && st.stack.length === 0 && (turn === undefined || st.turn === turn) && (!st.pending || st.pending.player === 0), 200);

/** Declare attacks: each creature (by id) at a player. */
export async function attack(page: Page, attacks: [string, PlayerId][]) {
  await expect(controls(page)).toContainText("Click a creature, then the player it attacks");
  for (const [id, pid] of attacks) {
    await page.locator(`[data-obj="${id}"]`).click();
    await clickPlayer(page, pid);
  }
  await controls(page).getByRole("button", { name: `Attack with ${attacks.length}` }).click();
}
