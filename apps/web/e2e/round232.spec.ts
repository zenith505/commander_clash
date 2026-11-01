// Round 232: Krenko's Buzzcrusher's "for each player, destroy up to one nonbasic land that player controls": you choose
// for each player in turn, your own first, then each opponent's lands.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Krenko's Buzzcrusher: choose up to one nonbasic land of each player's to destroy", async ({ page }) => {
  const s = scene({ hand: ["Krenko's Buzzcrusher"], board: [...LANDS, "Reliquary Tower"] }, [{ board: ["Command Tower"] }]);
  const [mine, theirs] = [one(s, "Reliquary Tower"), one(s, "Command Tower")];
  await open(page, s);
  await card(page, "Krenko's Buzzcrusher", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0 && st.pending.of === undefined);
  const bar = controls(page);
  await expect(bar).toContainText("Krenko's Buzzcrusher: click up to one nonbasic land of yours. Krenko's Buzzcrusher destroys it.");
  await bar.getByRole("button", { name: "Choose none" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0 && st.pending.of === 1);
  await expect(bar).toContainText("click up to one nonbasic land of Ana's. Krenko's Buzzcrusher destroys it.");
  await page.locator(`[data-obj="${theirs}"]`).click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  // Ana searches for a basic land (her bot), put onto the battlefield tapped.
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[theirs]!.zone === "graveyard" && st.battlefield.some((id) => st.objects[id]!.controller === 1 && st.objects[id]!.tapped));
  expect(after.objects[mine]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
