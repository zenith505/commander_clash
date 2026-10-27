// Lane B round 17's choices in the browser: "the color or colors of your choice" (Prismatic Lace), and a Licid that
// becomes an Aura and is made a creature again by paying to end its effect (Gliding Licid).
import { expect, test } from "@playwright/test";
import { characteristics } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

test("Prismatic Lace: pick White and Blue, then Done; the Hill Giant is white and blue, not red", async ({ page }) => {
  const s = scene({ hand: ["Prismatic Lace"], board: LANDS }, [{ board: ["Hill Giant"] }]);
  const giant = one(s, "Hill Giant");
  await open(page, s);
  await card(page, "Prismatic Lace", s).click();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "colors" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("choose one or more colors");
  await expect(bar.getByRole("button", { name: "Done" })).toBeDisabled();
  await bar.getByRole("button", { name: "Blue" }).click();
  await bar.getByRole("button", { name: "Red" }).click();
  await bar.getByRole("button", { name: "White" }).click();
  // A second click takes a color back off.
  await bar.getByRole("button", { name: "Red" }).click();
  await bar.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(characteristics(after, after.objects[giant]!).colors).toEqual(["W", "U"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Gliding Licid: it becomes an Aura on Grizzly Bears; its menu then pays {U} to make it a creature again", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Gliding Licid", "Grizzly Bears"] });
  const [licid, bears] = [one(s, "Gliding Licid"), one(s, "Grizzly Bears")];
  await open(page, s);
  await page.locator(`[data-obj="${licid}"]`).first().click();
  await menu(page).getByRole("button", { name: /loses this ability/ }).click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  const aura = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[licid]!.attachedTo === bears);
  expect(characteristics(aura, aura.objects[licid]!).types).toEqual(["Enchantment"]);
  expect(characteristics(aura, aura.objects[bears]!).keywords).toContain("Flying");
  // The Aura is tucked behind the Bears: click the edge of it that shows.
  await page.locator(`[data-obj="${licid}"]`).first().click({ position: { x: 6, y: 6 } });
  await expect(menu(page).getByRole("button", { name: /loses this ability/ })).toHaveCount(0);
  await menu(page).getByRole("button", { name: /^End Gliding Licid's effect/ }).click();
  const after = await resolveUntil(page, (st) => st.objects[licid]!.attachedTo === undefined && !st.pending);
  expect(characteristics(after, after.objects[licid]!).types).toEqual(["Creature"]);
  expect(characteristics(after, after.objects[bears]!).keywords).not.toContain("Flying");
  expect(after.objects[licid]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
