// Lane B round 29 in the browser: Plow Through Reito's sweep, "return any number of Plains you control to their owner's
// hand" as it resolves (click them, then Return, or Return none), and Devouring Rage's optional additional cost,
// "sacrifice any number of Spirits" (X can be 0).
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Plow Through Reito: return both Plains, the Bears get +2/+2", async ({ page }) => {
  const s = scene({ hand: ["Plow Through Reito"], board: ["Plains", "Snow-Covered Plains", "Island", "Swamp", "Grizzly Bears"] });
  const [plains, snowy, bears] = [idsOf(s, "Plains", "battlefield", 0)[0]!, one(s, "Snow-Covered Plains"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Plow Through Reito", s).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Plow Through Reito: click any number of Plains of yours to return to your hand.");
  await expect(bar.getByRole("button", { name: "Return none" })).toBeEnabled();
  await page.locator(`[data-obj="${plains}"]`).click();
  await page.locator(`[data-obj="${snowy}"]`).click();
  await bar.getByRole("button", { name: "Return", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[snowy]!.zone === "hand");
  expect(after.objects[plains]!.zone).toBe("hand");
  expect(after.players[0]!.hand).toHaveLength(2);
  expect(pageErrors(page)).toEqual([]);
});

test("Devouring Rage: X = 2, the two Spirits sacrificed as it's cast", async ({ page }) => {
  const s = scene({ hand: ["Devouring Rage"], board: [...LANDS, "Grizzly Bears", "Kami of Ancient Law", "Hana Kami"] });
  const [bears, kami, hana] = [one(s, "Grizzly Bears"), one(s, "Kami of Ancient Law"), one(s, "Hana Kami")];
  await open(page, s);
  await card(page, "Devouring Rage", s).click();
  const x = page.locator(".x-pick");
  await expect(x).toContainText("(X can be 0): choose X");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  const costBar = page.locator(".targeting");
  await expect(costBar).toContainText("Devouring Rage (X=2): choose target creature");
  await page.locator(`[data-obj="${bears}"]`).click();
  await expect(costBar).toContainText("Devouring Rage: sacrifice 2 Spirits (click them)");
  await page.locator(`[data-obj="${kami}"]`).click();
  await page.locator(`[data-obj="${hana}"]`).click();
  await costBar.getByRole("button", { name: "Sacrifice and cast" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[kami]!.zone === "graveyard");
  expect(after.objects[hana]!.zone).toBe("graveyard");
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
