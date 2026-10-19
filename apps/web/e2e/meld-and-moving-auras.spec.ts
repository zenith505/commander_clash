// Meld (CR 701.42): with two permanents named the meld card's counterpart, you click the one exiled and melded with it,
// and the melded permanent shows a Melded chip. Moving an Aura (Crown of the Ages): the creature it moves to is chosen
// as the ability resolves, with a button for each creature it could enchant.
import { expect, test } from "@playwright/test";
import { characteristics, invalidateCharacteristics } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

test("Hanweir Battlements: click which Hanweir Garrison melds with it into Hanweir, the Writhing Township", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Hanweir Battlements", "Hanweir Garrison", "Hanweir Garrison"] });
  const land = one(s, "Hanweir Battlements");
  const [first, second] = idsOf(s, "Hanweir Garrison") as [string, string];
  await open(page, s);
  await card(page, "Hanweir Battlements", s).click();
  await menu(page).locator("button", { hasText: "meld" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents");
  const bar = controls(page);
  await expect(bar).toContainText("meld: click the creature named Hanweir Garrison to exile with Hanweir Battlements");
  await expect(bar.getByRole("button", { name: "Meld" })).toBeDisabled();
  await page.locator(`[data-obj="${second}"]`).click();
  await bar.getByRole("button", { name: "Meld" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[land]!.melded !== undefined);
  invalidateCharacteristics(after);
  expect(characteristics(after, after.objects[land]!).name).toBe("Hanweir, the Writhing Township");
  expect(after.objects[second]!.zone).toBe("merged");
  expect(after.objects[first]!.zone).toBe("battlefield");
  await expect(page.locator(`[data-obj="${land}"] .chip`, { hasText: "Melded" })).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test("Crown of the Ages: move Pacifism off Hill Giant, choosing the creature as the ability resolves", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Crown of the Ages", "Grizzly Bears"] }, [{ board: ["Hill Giant", "Pacifism", "Ornithopter"] }]);
  const pacifism = one(s, "Pacifism"), giant = one(s, "Hill Giant"), bears = one(s, "Grizzly Bears");
  s.objects[pacifism]!.attachedTo = giant;
  await open(page, s);
  await card(page, "Crown of the Ages", s).click();
  const item = menu(page).locator("button", { hasText: "Attach" });
  if (await item.count()) await item.click();
  // The Aura is tucked behind Hill Giant: click the edge of it that shows.
  await page.locator(`[data-obj="${pacifism}"]`).first().click({ position: { x: 6, y: 6 } });
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption");
  const pick = page.locator(".controls.enchant-pick");
  await expect(pick).toContainText("choose the creature to attach Pacifism to");
  await expect(pick.getByRole("button")).toHaveText(["Grizzly Bears (You)", "Ornithopter (Ana)"]);
  await pick.getByRole("button", { name: "Grizzly Bears (You)" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[pacifism]!.attachedTo === bears);
  expect(after.objects[pacifism]!.attachedTo).toBe(bears);
  expect(pageErrors(page)).toEqual([]);
});
