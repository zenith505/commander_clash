// Lane B round B114 in the browser: Planar Overlay asks which land of each basic land type you return, only when you
// have more than one; a dual land can be returned for both of its types.
import { expect, test } from "@playwright/test";
import { idsOf, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Planar Overlay: choose a Swamp and a Forest to return, the Bayou for both; the only Plains, Island and Mountain go too", async ({ page }) => {
  const s = scene({ hand: ["Planar Overlay"], board: ["Plains", "Island", "Swamp", "Mountain", "Forest", "Bayou"] });
  const [plains, island, swamp, mountain, forest, bayou] = ["Plains", "Island", "Swamp", "Mountain", "Forest", "Bayou"].map((n) => idsOf(s, n, "battlefield", 0)[0]!);
  s.players[0]!.manaPool = { ...s.players[0]!.manaPool, U: 1, C: 2 };
  await open(page, s);
  await card(page, "Planar Overlay", s).click();
  const bar = controls(page);
  // Swamp first (the basic land types in order), then Forest.
  for (const type of ["Swamp", "Forest"]) {
    await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0 && st.pending.what === type);
    await expect(bar).toContainText(`click a ${type} of yours to return to its owner's hand.`);
    await expect(bar.getByRole("button", { name: "Return", exact: true })).toBeDisabled();
    await page.locator(`[data-obj="${bayou}"]`).first().click();
    await bar.getByRole("button", { name: "Return", exact: true }).click();
  }
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bayou]!.zone === "hand");
  for (const id of [plains, island, mountain, bayou]) expect(after.objects[id]!.zone).toBe("hand");
  for (const id of [swamp, forest]) expect(after.objects[id]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
