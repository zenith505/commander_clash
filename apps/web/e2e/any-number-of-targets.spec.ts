// "Any number of target ..." (CR 601.2c): one "up to" target for each there could be, and Done when you have enough.
// Strive charges for each target beyond the first.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, resolveUntil } from "./ui";

test("Consign to Dust: pick two of three artifacts, Done, and strive's {2}{G} is paid for the second", async ({ page }) => {
  const s = scene({ hand: ["Consign to Dust"], board: LANDS }, [{ board: ["Sol Ring", "Mind Stone", "Ornithopter"] }]);
  const [ring, stone, thopter] = [one(s, "Sol Ring"), one(s, "Mind Stone"), one(s, "Ornithopter")];
  await open(page, s);
  await card(page, "Consign to Dust", s).click();
  const bar = page.locator(".targeting");
  await expect(bar).toContainText("(optional, up to 3 more)");
  await expect(bar.getByRole("button", { name: "Choose none" })).toBeVisible();
  await page.locator(`[data-obj="${ring}"]`).click();
  await page.locator(`[data-obj="${stone}"]`).click();
  await bar.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[one(s, "Consign to Dust")]!.zone === "graveyard");
  expect([ring, stone, thopter].map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "battlefield"]);
  expect(after.battlefield.filter((id) => after.objects[id]!.controller === 0 && after.objects[id]!.tapped)).toHaveLength(6);
  expect(pageErrors(page)).toEqual([]);
});

test("Guardian of Faith: its enters trigger offers each of your other creatures; it phases out the ones picked", async ({ page }) => {
  const s = scene({ hand: ["Guardian of Faith"], board: [...LANDS, "Grizzly Bears", "Hill Giant", "Llanowar Elves"] });
  const [bears, giant, elves, guardian] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Llanowar Elves"), one(s, "Guardian of Faith")];
  await open(page, s);
  await card(page, "Guardian of Faith", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets");
  const bar = page.locator(".targeting");
  await expect(bar).toContainText("(optional, up to 3 more)");
  await page.locator(`[data-obj="${bears}"]`).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  await bar.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "phasedOut");
  expect([bears, giant, elves, guardian].map((id) => after.objects[id]!.zone)).toEqual(["phasedOut", "phasedOut", "battlefield", "battlefield"]);
  expect((await state(page)).pending).toBeNull();
  expect(pageErrors(page)).toEqual([]);
});
