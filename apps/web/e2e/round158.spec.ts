// Round 158: Garnet, Princess of Alexandria attacks, and you may remove a lore counter from each of any number of
// your Sagas: click them, then choose (or choose none). Garnet gets a +1/+1 counter for each lore counter removed.
import { expect, test } from "@playwright/test";
import { one, open, pageErrors, scene } from "./scene";
import { attack, controls, passTo, resolveUntil } from "./ui";

const ready = () => {
  const s = scene({ board: ["Garnet, Princess of Alexandria", "Phyrexian Scriptures", "Song of Freyalise"] }, [{}]);
  const [garnet, scriptures, song] = [one(s, "Garnet, Princess of Alexandria"), one(s, "Phyrexian Scriptures"), one(s, "Song of Freyalise")];
  s.objects[scriptures]!.counters.lore = 2;
  s.objects[song]!.counters.lore = 1;
  return { s, garnet, scriptures, song };
};

test("Garnet: remove a lore counter from two Sagas for two +1/+1 counters", async ({ page }) => {
  const { s, garnet, scriptures, song } = ready();
  await open(page, s);
  await passTo(page, "declareAttackers");
  await attack(page, [[garnet, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents");
  const bar = controls(page);
  await expect(bar).toContainText("click any number of your Sagas to remove a lore counter from each");
  await expect(bar.getByRole("button", { name: "Choose none" })).toBeVisible();
  await page.locator(`[data-obj="${scriptures}"]`).click();
  await page.locator(`[data-obj="${song}"]`).click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[garnet]!.counters["+1/+1"] === 2);
  expect(after.objects[scriptures]!.counters.lore).toBe(1);
  expect(after.objects[song]!.counters.lore ?? 0).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Garnet: choose none, and the Sagas keep their lore counters", async ({ page }) => {
  const { s, garnet, scriptures, song } = ready();
  await open(page, s);
  await passTo(page, "declareAttackers");
  await attack(page, [[garnet, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents");
  await controls(page).getByRole("button", { name: "Choose none" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.step !== "declareAttackers");
  expect(after.objects[garnet]!.counters["+1/+1"] ?? 0).toBe(0);
  expect(after.objects[scriptures]!.counters.lore).toBe(2);
  expect(after.objects[song]!.counters.lore).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});
