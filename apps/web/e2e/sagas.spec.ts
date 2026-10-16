// Sagas (CR 714): chapter I as the Saga enters with its lore counter; read ahead's chapter choice (CR 702.155).
import { expect, test } from "@playwright/test";
import { one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("History of Benalia: enters with a lore counter, and chapter I makes a Knight", async ({ page }) => {
  const s = scene({ hand: ["History of Benalia"], board: ["Plains", "Plains", "Plains"] });
  const saga = one(s, "History of Benalia");
  await open(page, s);
  await card(page, "History of Benalia", s).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.triggerQueue.length === 0 && st.battlefield.some((id) => st.cards[st.objects[id]!.cardId]!.name === "Knight Token"));
  expect(after.objects[saga]!.counters.lore).toBe(1);
  await expect(page.locator(`[data-obj="${saga}"]`)).toContainText("1 lore");
  expect(pageErrors(page)).toEqual([]);
});

test("The Weatherseed Treaty: read ahead to chapter II, so only its Saproling comes", async ({ page }) => {
  const s = scene({ hand: ["The Weatherseed Treaty"], board: ["Forest", "Forest", "Forest"] });
  const saga = one(s, "The Weatherseed Treaty");
  await open(page, s);
  await card(page, "The Weatherseed Treaty", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption");
  await expect(controls(page)).toContainText("read ahead: choose the chapter to start on");
  await expect(controls(page).getByRole("button", { name: "Chapter III" })).toBeVisible();
  await controls(page).getByRole("button", { name: "Chapter II", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.triggerQueue.length === 0 && !st.pending && st.battlefield.some((id) => st.cards[st.objects[id]!.cardId]!.name === "Saproling Token"));
  expect(after.objects[saga]!.counters.lore).toBe(2);
  expect(after.log.some((e) => /chooses chapter II/.test(e.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
