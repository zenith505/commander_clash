// Round 266: Ward—Blight 2 (Auntie Ool, Cursewretch): Pay, then click the creature of yours to put the two -1/-1 counters
// on, and Auntie Ool's trigger makes that creature's controller lose 1 life.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("ward—blight 2: Pay, then click a creature of yours for the -1/-1 counters, and the spell resolves", async ({ page }) => {
  const s = scene({ hand: ["Shock"], board: [...LANDS, "Grizzly Bears", "Hill Giant"] }, [{ board: ["Auntie Ool, Cursewretch"] }]);
  const [auntie, bears, giant] = [one(s, "Auntie Ool, Cursewretch"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Shock", s).click();
  await page.locator(`[data-obj="${auntie}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "payUnless");
  await expect(controls(page)).toContainText("blight 2 (put 2 -1/-1 counters on a creature you control) or Shock is countered");
  await controls(page).getByRole("button", { name: "Pay", exact: true }).click();
  await expect(controls(page)).toContainText("blight 2: click a creature of yours to put 2 -1/-1 counters on");
  await page.locator(`[data-obj="${giant}"]`).click();
  await controls(page).getByRole("button", { name: "Put counters" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[giant]!.counters["-1/-1"]).toBe(2);
  expect(after.objects[bears]!.counters["-1/-1"] ?? 0).toBe(0);
  expect(after.objects[auntie]!.damage).toBe(2);
  // Auntie Ool's controller doesn't control the Giant: its controller (you) loses 1 life.
  expect(after.players[0]!.life).toBe(39);
  expect(pageErrors(page)).toEqual([]);
});
