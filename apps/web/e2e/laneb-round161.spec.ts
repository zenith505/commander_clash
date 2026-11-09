// Lane B round B161 in the browser: the band picker for "bands with other legendary creatures" (Cathedral of Serra): two
// legendary creatures attack in a band, a creature that isn't legendary can't join them.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, playUntil, scene, state } from "./scene";
import { attack, controls, passTo } from "./ui";

test("Cathedral of Serra: Isamaru and Sir Shandlar attack in a band; Grizzly Bears can't join", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Cathedral of Serra", "Isamaru, Hound of Konda", "Sir Shandlar of Eberyn", "Grizzly Bears"] });
  const [isamaru, shandlar, bears] = [one(s, "Isamaru, Hound of Konda"), one(s, "Sir Shandlar of Eberyn"), one(s, "Grizzly Bears")];
  await open(page, playUntil(s, (st) => st.pending?.kind === "declareAttackers"));
  await attack(page, [[isamaru, 1], [shandlar, 1], [bears, 1]]);
  await expect(controls(page)).toContainText("put attacking creatures in a band if you want");
  const picking = await state(page);
  expect(picking.pending).toMatchObject({ kind: "pickPermanents", action: "band" });
  expect([...(picking.pending as { options: string[] }).options].sort()).toEqual([isamaru, shandlar].sort());
  await expect(controls(page).getByRole("button", { name: "No band" })).toBeVisible();
  await page.locator(`[data-obj="${isamaru}"]`).click();
  await page.locator(`[data-obj="${shandlar}"]`).click();
  await controls(page).getByRole("button", { name: "Band 2" }).click();
  await passTo(page, "main2");
  const after = await state(page);
  expect(after.objects[isamaru]!.band).toBeUndefined(); // bands last only for the combat (CR 702.22e)
  expect(after.log.some((l) => /Isamaru, Hound of Konda, Sir Shandlar of Eberyn attack in a band|Sir Shandlar of Eberyn, Isamaru, Hound of Konda attack in a band/.test(l.text))).toBe(true);
  expect(after.players[1]!.life).toBe(32); // 2 + 4 + 2
  expect(pageErrors(page)).toEqual([]);
});
