// Ken's playtest notes (Oct 19 2026): the log by phase with hoverable card names, sliding along the hand on a smaller
// screen, the window at the end of the game, and holding priority while tapped out.
import { expect, test } from "@playwright/test";
import { waitingOn } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, clickPlayer, controls, passTo, resolveUntil } from "./ui";

test("the log groups a turn by phase, and a card named in it shows the card when hovered", async ({ page }) => {
  const s = scene({ hand: ["Savannah Lions", "Raging Goblin"], board: LANDS });
  await open(page, s);
  await card(page, "Savannah Lions", s).click();
  await resolveUntil(page, (st) => st.stack.length === 0 && st.battlefield.includes(one(s, "Savannah Lions")));
  await passTo(page, "main2", s.turn);
  await card(page, "Raging Goblin", s).click();
  await resolveUntil(page, (st) => st.stack.length === 0 && st.battlefield.includes(one(s, "Raging Goblin")));

  // Newest first: this turn on top, its second main phase above its first.
  const turn = page.locator(".log .log-turn").first();
  await expect(turn.locator(".turn-line")).toContainText(`Turn ${s.turn}`);
  const phases = turn.locator(".log-phase");
  await expect(phases.first()).toHaveAttribute("data-phase", "Main 2");
  await expect(phases.first()).toContainText("Raging Goblin");
  const main1 = turn.locator('.log-phase[data-phase="Main 1"]');
  await expect(main1.locator(".phase-line")).toHaveText("Main 1");
  await expect(main1).toContainText("You cast Savannah Lions");

  // The name is underlined, and hovering it pops the card up.
  const ref = main1.locator('.card-ref[data-card-ref="Savannah Lions"]').first();
  expect(await ref.evaluate((el) => getComputedStyle(el).textDecorationLine)).toContain("underline");
  await ref.hover();
  await expect(page.locator(".hover-card")).toContainText("Savannah Lions");
  await page.mouse.move(5, 5);
  await expect(page.locator(".hover-card")).toHaveCount(0);
  expect(pageErrors(page)).toEqual([]);
});

test("on a smaller screen the mouse slides along the hand from card to card, with the preview above the hand", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  const hand = ["Savannah Lions", "Raging Goblin", "Ornithopter", "Llanowar Elves", "Soul Warden", "Birds of Paradise", "Isamaru, Hound of Konda"];
  const s = scene({ hand, board: LANDS });
  await open(page, s);
  const slots = page.locator(".hand .fan-slot");
  await expect(slots).toHaveCount(7);
  // Where each card's own strip shows (between its left edge and the next card's), low down in the hand.
  const boxes = await slots.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON() as DOMRect));
  const y = 700 - 12;
  const stripX = (i: number) => (boxes[i]!.left + boxes[i + 1]!.left) / 2;
  const ids = await slots.evaluateAll((els) => els.map((el) => el.querySelector("[data-obj]")!.getAttribute("data-obj")!));
  const nameOf = (i: number) => s.cards[s.objects[ids[i]!]!.cardId]!.name;
  const preview = page.locator(".hover-card");

  await page.mouse.move(stripX(1), y);
  await expect(preview).toContainText(nameOf(1));
  // Straight on to the next cards, never leaving the hand.
  for (const i of [2, 3, 4]) {
    await page.mouse.move(stripX(i), y, { steps: 8 });
    await expect(preview).toContainText(nameOf(i));
  }
  // And back again.
  await page.mouse.move(stripX(2), y, { steps: 12 });
  await expect(preview).toContainText(nameOf(2));
  // The preview sits above the hand, clear of it.
  const fanTop = await page.locator(".hand .fan").evaluate((el) => el.getBoundingClientRect().top);
  const shown = await preview.evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);
  expect(shown.bottom).toBeLessThanOrEqual(fanTop);
  expect(shown.top).toBeGreaterThanOrEqual(0);
  expect(pageErrors(page)).toEqual([]);
});

test("winning the game opens a window saying so, with the way back to the lobby", async ({ page }) => {
  const s = scene({ hand: ["Shock"], board: LANDS }, [{ life: 2 }]);
  // Ben and Cy are already out of the game: Ana is the last one left.
  s.players[2]!.lost = true;
  s.players[3]!.lost = true;
  await open(page, s);
  await expect(page.locator(".game-end")).toHaveCount(0);
  await card(page, "Shock", s).click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.over);
  const popup = page.locator(".game-end");
  await expect(popup.locator("h2")).toHaveText("You won!");
  await expect(popup.getByRole("button", { name: "Back to lobby" })).toBeVisible();
  // Closing it leaves the table to look at, with the way out still there.
  await popup.getByRole("button", { name: "Look at the table" }).click();
  await expect(popup).toHaveCount(0);
  await expect(page.locator(".game-over").getByRole("button", { name: "Back to lobby" })).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test("losing opens a window saying so, and you can watch the others play on", async ({ page }) => {
  const s = scene({ life: 0 });
  await open(page, s);
  // State-based actions are checked as the next player would get priority (CR 704.3): you're out at 0 life.
  await controls(page).getByRole("button", { name: "Pass" }).click();
  const popup = page.locator(".game-end");
  await expect(popup.locator("h2")).toHaveText("You lost.");
  await expect(popup).toContainText("The others play on without you.");
  await expect(popup.getByRole("button", { name: "Back to lobby" })).toBeVisible();
  await popup.getByRole("button", { name: "Watch the rest" }).click();
  await expect(popup).toHaveCount(0);
  expect((await state(page)).players[0]!.lost).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("holding priority stops for an opponent's spell even when you're tapped out with nothing to play", async ({ page }) => {
  const s = scene({}, [{ hand: ["Llanowar Elves"], board: ["Forest"] }]);
  await open(page, s);
  const elves = one(s, "Llanowar Elves");
  const stopped = (st: Awaited<ReturnType<typeof state>>) => st.stack.some((it) => it.objectId === elves) && waitingOn(st) === 0;
  await resolveUntil(page, stopped, 60);
  // It stays stopped: nothing passes for you.
  await page.waitForTimeout(800);
  expect(stopped(await state(page))).toBe(true);
  await expect(controls(page).getByRole("button", { name: "Resolve" })).toBeEnabled();
  await controls(page).getByRole("button", { name: "Resolve" }).click();
  await resolveUntil(page, (st) => st.battlefield.includes(elves));
  expect(pageErrors(page)).toEqual([]);
});
