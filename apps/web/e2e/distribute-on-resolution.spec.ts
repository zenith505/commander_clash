// "Distribute X +1/+1 counters among any number of creatures you control" (Blessing of Frost): no targets, so the
// counters are divided as it resolves, with − and + for each of your creatures, then Done.
import { expect, test } from "@playwright/test";
import { idsOf, one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Blessing of Frost: divide the counters among your creatures as it resolves", async ({ page }) => {
  const snow = Array.from({ length: 4 }, () => "Snow-Covered Forest");
  const s = scene({ hand: ["Blessing of Frost"], board: [...snow, "Grizzly Bears", "Hill Giant"] });
  const [bears, giant] = [idsOf(s, "Grizzly Bears", undefined, 0)[0]!, one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Blessing of Frost", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "distribute");
  const bar = controls(page);
  await expect(bar).toContainText("Blessing of Frost: distribute 4 +1/+1 counters among any number of creatures you control (4 left)");
  const done = bar.getByRole("button", { name: "Done" });
  await expect(done).toBeDisabled();
  await page.locator(`[data-distribute="${giant}"]`).getByRole("button", { name: "+" }).click();
  const plusBears = page.locator(`[data-distribute="${bears}"]`).getByRole("button", { name: "+" });
  for (let i = 0; i < 3; i++) await plusBears.click();
  await expect(bar).toContainText("(0 left)");
  await done.click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[giant]!.counters["+1/+1"]).toBe(1);
  expect(after.objects[bears]!.counters["+1/+1"]).toBe(3);
  // Both have power 4 or greater now: two cards.
  expect(after.players[0]!.hand.length).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});
