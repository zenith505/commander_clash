// Lane B round B294 in the browser: Yavimaya Bloomsage // Channel (the end step trigger makes Craw Wurm 7/5 and prepares the
// Bloomsage; next turn its Channel copy is cast from exile, then "Pay 1 life: add {C}" three times pays for Commander's
// Sphere) and False Dawn (with only Plains and Mountains left, Divination's {U} is paid with Mountains' white mana).
import { expect, test, type Page } from "@playwright/test";
import { applyAction, type GameState } from "@cc/engine";
import { idsOf, one, open, pageErrors, playUntil, scene, state } from "./scene";
import { card, menu, modal, resolveUntil, seat } from "./ui";

/** The first state the page shows that `done` holds for (kept: no second read after it, which could race). */
async function seen(page: Page, done: (s: GameState) => boolean): Promise<GameState> {
  for (let i = 0; i < 100; i++) {
    const s = await state(page);
    if (done(s)) return s;
    await page.waitForTimeout(100);
  }
  throw new Error("the page never showed that state");
}

test("Channel: Bloomsage's prepare spell cast from exile, then pay 1 life for {C} three times to cast Commander's Sphere", async ({ page }) => {
  const s0 = scene({ board: ["Forest", "Forest", "Yavimaya Bloomsage // Channel", "Craw Wurm"], hand: ["Commander's Sphere"] });
  const [sage, wurm, sphere] = [one(s0, "Yavimaya Bloomsage"), one(s0, "Craw Wurm"), one(s0, "Commander's Sphere")];
  // Your end step: the trigger targets the Wurm, which gets to 7 power, so the Bloomsage becomes prepared.
  let s = playUntil(s0, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  s = applyAction(s, { type: "chooseTargets", player: 0, targets: [{ kind: "object", id: wurm }] });
  const turn = s.turn;
  s = playUntil(s, (st) => st.turn > turn && st.activePlayer === 0 && st.step === "main1" && !st.pending && st.stack.length === 0);
  expect(s.objects[sage]!.prepared?.copy).toBeTruthy();
  await open(page, s);
  // No Channel yet: no button.
  await expect(page.locator("[data-channel]")).toHaveCount(0);
  await seat(page, 0).locator(".zone", { hasText: "Exile" }).click();
  await modal(page).locator(".card.playable").click();
  if (await menu(page).isVisible()) await menu(page).getByRole("button", { name: /^Cast/ }).first().click();
  let now = await resolveUntil(page, (st) => st.stack.length === 0 && !!st.turnRules?.some((r) => r.rule === "channel" && r.player === 0));
  const life = now.players[0]!.life;
  const button = page.locator("[data-channel]");
  for (let i = 1; i <= 3; i++) {
    await button.click();
    now = await seen(page, (st) => st.players[0]!.manaPool.C === i);
  }
  expect(now.players[0]!.life).toBe(life - 3);
  expect(now.log.filter((l) => l.text.endsWith("pays 1 life for {C} (Channel).")).length).toBe(3);
  await card(page, "Commander's Sphere", s).click();
  if (await menu(page).isVisible()) await menu(page).getByRole("button", { name: /^Cast/ }).first().click();
  const done = await resolveUntil(page, (st) => st.objects[sphere]!.zone === "battlefield" && st.stack.length === 0);
  expect(done.players[0]!.manaPool.C).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("False Dawn: Mountains add white mana, which pays Divination's {U}", async ({ page }) => {
  const s = scene({ board: ["Plains", "Plains", "Mountain", "Mountain", "Mountain"], hand: ["False Dawn", "Divination"] });
  const [dawn, div] = [one(s, "False Dawn"), one(s, "Divination")];
  await open(page, s);
  await card(page, "False Dawn", s).click();
  if (await menu(page).isVisible()) await menu(page).getByRole("button", { name: /^Cast/ }).first().click();
  const cast = await resolveUntil(page, (st) => st.objects[dawn]!.zone === "graveyard" && st.stack.length === 0);
  expect(cast.turnRules?.some((r) => r.rule === "whiteAnyColor" && r.player === 0)).toBe(true);
  const hand = cast.players[0]!.hand.length;
  // No land of yours makes blue mana, but Divination can be cast.
  await expect(page.locator(`[data-obj="${div}"]`).first()).toHaveClass(/playable/);
  await card(page, "Divination", s).click();
  if (await menu(page).isVisible()) await menu(page).getByRole("button", { name: /^Cast/ }).first().click();
  const after = await resolveUntil(page, (st) => st.objects[div]!.zone === "graveyard" && st.stack.length === 0);
  expect(after.players[0]!.hand.length).toBe(hand + 1);
  expect(idsOf(after, "Mountain", "battlefield", 0).filter((id) => after.objects[id]!.tapped).length).toBeGreaterThan(0);
  expect(after.log.some((l) => /add that much white mana instead/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
