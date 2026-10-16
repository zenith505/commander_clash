// "Each player chooses up to two creatures they control, then sacrifices the rest" (Covetous Elegy): you click the
// creatures to keep and Keep; the bots choose theirs; then all the rest are sacrificed at once.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Covetous Elegy: click a creature to keep, and the rest are sacrificed", async ({ page }) => {
  const s = scene({ hand: ["Covetous Elegy"], board: [...LANDS, "Grizzly Bears", "Hill Giant", "Serra Angel"] }, [{ board: ["Grizzly Bears", "Hill Giant"] }]);
  const [bears, giant, angel] = [idsOf(s, "Grizzly Bears", undefined, 0)[0]!, idsOf(s, "Hill Giant", undefined, 0)[0]!, one(s, "Serra Angel")];
  const theirs = [...idsOf(s, "Grizzly Bears", undefined, 1), ...idsOf(s, "Hill Giant", undefined, 1)];
  await open(page, s);
  await card(page, "Covetous Elegy", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents");
  const bar = controls(page);
  await expect(bar).toContainText("Covetous Elegy: click up to 2 creatures of yours to keep. The rest are sacrificed.");
  await expect(bar.getByRole("button", { name: "Keep none" })).toBeEnabled();
  await page.locator(`[data-obj="${angel}"]`).click();
  await bar.getByRole("button", { name: "Keep 1" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect([bears, giant, angel].map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "battlefield"]);
  // Ana kept both of hers, so you get two tapped Treasures.
  expect(theirs.map((id) => after.objects[id]!.zone)).toEqual(["battlefield", "battlefield"]);
  expect(after.battlefield.filter((id) => after.objects[id]!.isToken && after.objects[id]!.controller === 0).length).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});
