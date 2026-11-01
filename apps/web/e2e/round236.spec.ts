// Round 236's prompts: Phyrexian Soulgorger's "Cumulative upkeep—Sacrifice a creature": sacrifice a creature for each
// age counter (picked on the battlefield), or don't and it's sacrificed.
import { expect, test } from "@playwright/test";
import { one, open, pageErrors, playUntil, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

/** Your next upkeep, with Soulgorger's cumulative upkeep asking you (two age counters by then). */
function soulgorgerUpkeep() {
  const s0 = scene({ board: ["Phyrexian Soulgorger", "Grizzly Bears", "Hill Giant"] });
  s0.objects[one(s0, "Phyrexian Soulgorger")]!.counters.age = 1;
  return { s0, s: playUntil(s0, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "punisher" && st.pending.player === 0) };
}

test("Phyrexian Soulgorger: sacrifice two creatures for two age counters to keep it", async ({ page }) => {
  const { s0, s } = soulgorgerUpkeep();
  const [gorger, bears, giant] = [one(s0, "Phyrexian Soulgorger"), one(s0, "Grizzly Bears"), one(s0, "Hill Giant")];
  expect(s.objects[gorger]!.counters.age).toBe(2);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Sacrifice 2 creatures? If you don't, sacrifice Phyrexian Soulgorger (cumulative upkeep).");
  await bar.getByRole("button", { name: "Sacrifice 2 creatures" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents");
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await bar.getByRole("button", { name: /^Sacrifice/ }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[bears]!.zone === "graveyard");
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(after.objects[gorger]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Phyrexian Soulgorger: don't pay, and it's sacrificed", async ({ page }) => {
  const { s0, s } = soulgorgerUpkeep();
  const [gorger, bears] = [one(s0, "Phyrexian Soulgorger"), one(s0, "Grizzly Bears")];
  await open(page, s);
  const bar = controls(page);
  await bar.getByRole("button", { name: "Don't" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[gorger]!.zone === "graveyard");
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
