// Lane B round 105 in the browser: Arashin Sovereign's "When this creature dies, you may put it on your choice of the
// top or bottom of its owner's library": after Murder, you say Yes, then choose Bottom.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Arashin Sovereign: Murder it, then you put it on the bottom of your library", async ({ page }) => {
  const s = scene({ hand: ["Murder"], board: [...LANDS, "Arashin Sovereign"] });
  const sovereign = one(s, "Arashin Sovereign");
  await open(page, s);
  await card(page, "Murder", s).click();
  await expect(page.locator(".targeting")).toBeVisible();
  await page.locator(`[data-obj="${sovereign}"]`).click();
  await resolveUntil(page, (x) => x.pending?.kind === "chooseMay" && x.pending.player === 0);
  const bar = controls(page);
  await bar.getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "topOrBottom");
  await expect(bar).toContainText("put Arashin Sovereign on the top or bottom of your library?");
  await bar.getByRole("button", { name: "Bottom" }).click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending && x.objects[sovereign]!.zone === "library");
  expect(after.players[0]!.library.at(-1)).toBe(sovereign);
  expect(after.objects[one(s, "Murder")]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
