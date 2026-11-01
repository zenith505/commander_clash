// Round 227: Greymond, Avacyn's Stalwart, "As Greymond enters, choose two abilities from among first strike, vigilance,
// and lifelink": the keyword bar asks twice, the second time without the first choice.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Greymond: choose first strike, then lifelink; the second bar doesn't offer first strike again", async ({ page }) => {
  const s = scene({ hand: ["Greymond, Avacyn's Stalwart"], board: LANDS });
  const greymond = one(s, "Greymond, Avacyn's Stalwart");
  await open(page, s);
  await card(page, "Greymond, Avacyn's Stalwart", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "keyword");
  const bar = controls(page);
  await expect(bar).toContainText("choose an ability");
  for (const k of ["First strike", "Vigilance", "Lifelink"]) await expect(bar.getByRole("button", { name: k, exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "First strike", exact: true }).click();
  const second = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "keyword" && (st.objects[greymond]!.chosen?.keywords?.length ?? 0) === 1);
  expect(second.pending?.kind === "chooseOption" ? second.pending.options : []).not.toContain("First strike");
  await expect(bar.getByRole("button", { name: "First strike", exact: true })).toHaveCount(0);
  await bar.getByRole("button", { name: "Lifelink", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[greymond]!.zone === "battlefield");
  expect(after.objects[greymond]!.chosen?.keywords).toEqual(["First strike", "Lifelink"]);
  expect(pageErrors(page)).toEqual([]);
});
