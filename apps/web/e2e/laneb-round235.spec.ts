// Lane B round B235 in the browser: Reflecting Mirror's X is set by the spell you target (no X to choose), then you pick
// the spell's new target, a player; Blood Scrivener's "draw two cards and lose 1 life instead" is offered beside dredge
// when you would draw with no cards in hand.
import { expect, test } from "@playwright/test";
import { one, open, pageErrors, playUntil, scene, state } from "./scene";
import { card, clickPlayer, controls, menu, resolveUntil } from "./ui";

test("Reflecting Mirror: X is twice the target spell's mana value, and the spell aimed at you goes to the player you pick", async ({ page }) => {
  const s = scene({ hand: ["Lightning Bolt"], board: ["Reflecting Mirror", "Mountain", "Mountain", "Mountain"] });
  const mirror = one(s, "Reflecting Mirror");
  await open(page, s);
  // Lightning Bolt aimed at yourself, then the Mirror's ability at it while it's on the stack.
  await card(page, "Lightning Bolt", s).click();
  await clickPlayer(page, 0);
  await expect.poll(async () => (await state(page)).stack.length).toBe(1);
  const bolt = (await state(page)).stack[0]!.id;
  await page.locator(`[data-obj="${mirror}"]`).first().click();
  await menu(page).getByRole("button", { name: /Change the target of target spell with a single target if that target is you/ }).click();
  await page.locator(`[data-stack="${bolt}"]`).click();
  // The state the poll saw (the page moves on by itself).
  let act = s;
  await expect.poll(async () => (act = await state(page)).stack.length).toBe(2);
  const ability = act.stack[1]!;
  // Bolt's mana value is 1: X is 2, set by the target (CR 107.3c), so two more Mountains are tapped.
  expect(ability.x).toBe(2);
  expect(act.objects[mirror]!.tapped).toBe(true);
  expect(act.battlefield.filter((id) => act.objects[id]!.controller === 0 && act.objects[id]!.tapped).length).toBe(4);
  // As it resolves, you pick the new target: a player, not you.
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "changeTarget");
  const pend = asked.pending as Extract<NonNullable<typeof asked.pending>, { kind: "changeTarget" }>;
  expect(pend.options.every((o) => o.kind === "player" && o.id !== 0)).toBe(true);
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[one(s, "Lightning Bolt")]!.zone === "graveyard");
  expect(after.players[1]!.life).toBe(37);
  expect(after.players[0]!.life).toBe(40);
  expect(pageErrors(page)).toEqual([]);
});

test("Blood Scrivener: with no cards in hand your draw can be two cards and 1 life instead, or a dredge", async ({ page }) => {
  let s = scene({ board: ["Blood Scrivener"], yard: ["Golgari Thug"] }, [], { step: "upkeep" });
  const thug = one(s, "Golgari Thug");
  s = playUntil(s, (st) => st.pending?.kind === "drawInstead" && st.pending.player === 0);
  expect(s.step).toBe("draw");
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Replace this draw");
  await expect(bar.getByRole("button", { name: "Dredge Golgari Thug: mill 4 and return it to your hand", exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "Draw two cards and lose 1 life instead (Blood Scrivener)", exact: true }).click();
  // The two new draws: the Scrivener doesn't apply to them again (CR 614.5), but dredge still could. Draw both.
  await expect(bar).toContainText("Dredge:");
  await expect.poll(async () => (await state(page)).players[0]!.life).toBe(39);
  await bar.getByRole("button", { name: "Draw", exact: true }).click();
  await expect.poll(async () => (await state(page)).players[0]!.hand.length).toBe(1);
  await expect(bar).toContainText("Dredge:");
  await bar.getByRole("button", { name: "Draw", exact: true }).click();
  let after = s;
  await expect.poll(async () => (after = await state(page)).players[0]!.hand.length).toBe(2);
  expect(after.players[0]!.life).toBe(39);
  expect(after.objects[thug]!.zone).toBe("graveyard");
  expect(after.log.some((l) => l.text.startsWith("You draws two cards and loses 1 life instead of drawing one (Blood Scrivener)."))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
