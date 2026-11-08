// Round 312's prompt: Sheltering Ancient's cumulative upkeep, paid by putting a +1/+1 counter on a creature an opponent
// controls for each age counter: "Yes" to pay, then the counters divided among the opponents' creatures (any opponents',
// the same one or different ones).
import { expect, test } from "@playwright/test";
import { one, open, pageErrors, playUntil, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

test("Sheltering Ancient: keep it by putting two +1/+1 counters on Ana's Grizzly Bears and Ben's Hill Giant", async ({ page }) => {
  const s0 = scene({ board: ["Sheltering Ancient"] }, [{ board: ["Grizzly Bears"] }, { board: ["Hill Giant"] }]);
  const [tree, bears, giant] = [one(s0, "Sheltering Ancient"), one(s0, "Grizzly Bears"), one(s0, "Hill Giant")];
  s0.objects[tree]!.counters.age = 1;
  const s = playUntil(s0, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  expect(s.step).toBe("upkeep");
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Put 2 +1/+1 counters on creatures your opponents control to keep Sheltering Ancient");
  await bar.getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "distribute" && st.pending.player === 0);
  await expect(bar).toContainText("distribute 2 +1/+1 counters among any number of creatures your opponents control (2 left)");
  // Only the opponents' creatures are offered.
  await expect(page.locator(`[data-distribute="${tree}"]`)).toHaveCount(0);
  await page.locator(`[data-distribute="${bears}"]`).getByRole("button", { name: "+" }).click();
  await page.locator(`[data-distribute="${giant}"]`).getByRole("button", { name: "+" }).click();
  await expect(bar).toContainText("(0 left)");
  await bar.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.triggerQueue.length === 0);
  expect(after.objects[tree]!.zone).toBe("battlefield");
  expect(after.objects[tree]!.counters.age).toBe(2);
  expect(after.objects[bears]!.counters["+1/+1"]).toBe(1);
  expect(after.objects[giant]!.counters["+1/+1"]).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});
