// PR #14: ward—discard a card, and the Leylines' opening-hand prompt.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, controls, modal, resolveUntil, seat } from "./ui";

test("ward—discard: pay by discarding a card, and the spell resolves", async ({ page }) => {
  const s = scene({ hand: ["Shock", "Divination", "Opt"], board: LANDS }, [{ board: ["Westgate Regent"] }]);
  const regent = one(s, "Westgate Regent");
  await open(page, s);
  await card(page, "Shock", s).click();
  await page.locator(`[data-obj="${regent}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "payUnless");
  await expect(controls(page)).toContainText("discard a card or Shock is countered");
  await controls(page).getByRole("button", { name: "Pay", exact: true }).click();
  await expect(controls(page)).toContainText("click 1 card in your hand to discard");
  await card(page, "Divination", s).click();
  await controls(page).getByRole("button", { name: "Discard" }).click();
  await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  const after = await state(page);
  expect(after.objects[regent]!.damage).toBe(2);
  expect(after.objects[one(s, "Divination")]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("ward—discard: not paying counters the spell", async ({ page }) => {
  const s = scene({ hand: ["Shock", "Divination"], board: LANDS }, [{ board: ["Westgate Regent"] }]);
  const regent = one(s, "Westgate Regent");
  await open(page, s);
  await card(page, "Shock", s).click();
  await page.locator(`[data-obj="${regent}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "payUnless");
  await controls(page).getByRole("button", { name: "Don't pay" }).click();
  await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  const after = await state(page);
  expect(after.objects[regent]!.damage).toBe(0);
  expect(after.objects[one(s, "Shock")]!.zone).toBe("graveyard");
  expect(after.players[0]!.hand).toHaveLength(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Leyline in the opening hand: keep, then choose to begin the game with it on the battlefield", async ({ page }) => {
  const s = scene({ hand: ["Leyline of Sanctity"] }, [], { mulligans: true });
  const leyline = one(s, "Leyline of Sanctity");
  await open(page, s);
  await expect(controls(page)).toContainText("Opening hand.");
  await controls(page).getByRole("button", { name: "Keep" }).click();
  const search = modal(page);
  await expect(search).toContainText("Opening hand: you may put these cards from your hand onto the battlefield");
  await search.locator(`[data-pick="${leyline}"]`).click();
  await search.getByRole("button", { name: "Done" }).click();
  await expect(search).toHaveCount(0);
  const after = await state(page);
  expect(after.objects[leyline]!.zone).toBe("battlefield");
  await expect(seat(page, 0).locator(`[data-obj="${leyline}"]`)).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});
