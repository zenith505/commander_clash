// Round 276 in the browser: Rhys, the Evermore's "{W}, {T}: Remove any number of counters from target creature you
// control": the counters are picked one at a time as it resolves, any kinds, and "That's all" keeps the rest.
import { expect, test } from "@playwright/test";
import { one, open, pageErrors, scene } from "./scene";
import { controls, menu, resolveUntil } from "./ui";

test("Rhys, the Evermore: remove a -1/-1 counter and a stun counter from Hill Giant, then That's all keeps the oil counter", async ({ page }) => {
  const s = scene({ board: ["Plains", "Rhys, the Evermore", "Hill Giant"] });
  const [rhys, giant] = [one(s, "Rhys, the Evermore"), one(s, "Hill Giant")];
  s.objects[giant]!.counters = { "-1/-1": 1, stun: 1, oil: 2 };
  await open(page, s);
  await page.locator(`[data-obj="${rhys}"]`).click();
  await menu(page).getByRole("button", { name: /Remove any number of counters/ }).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption");
  await expect(controls(page)).toContainText("choose a counter to remove from Hill Giant (1 of 4)");
  await expect(controls(page).getByRole("button", { name: "None", exact: true })).toBeVisible();
  await controls(page).getByRole("button", { name: "A -1/-1 counter (1 left)" }).click();
  await expect(controls(page)).toContainText("choose a counter to remove from Hill Giant (2 of 4)");
  await controls(page).getByRole("button", { name: "A stun counter (1 left)" }).click();
  await expect(controls(page)).toContainText("choose a counter to remove from Hill Giant (3 of 4)");
  await controls(page).getByRole("button", { name: "That's all", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.counters.oil === 2 && !st.objects[giant]!.counters.stun);
  expect(after.objects[giant]!.counters["-1/-1"] ?? 0).toBe(0);
  expect(after.objects[giant]!.counters.oil).toBe(2);
  expect(after.objects[rhys]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
