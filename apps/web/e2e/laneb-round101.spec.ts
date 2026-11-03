// Lane B round 101 in the browser: Fugitive of the Judoon's chapter III, "You may exile a Human you control and an
// artifact you control": Yes, then the Human picked must leave an artifact to go with it, then the Doctor search.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { controls, modal, resolveUntil } from "./ui";

test("Fugitive of the Judoon III: Yes, click the artifact Human (Ornithopter is the artifact), then pick the Doctor", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Fugitive of the Judoon", "Esper Sentinel", "Elite Vanguard", "Ornithopter"], library: ["The Second Doctor"] });
  const [saga, sentinel, vanguard, thopter, doctor] = [one(s, "Fugitive of the Judoon"), one(s, "Esper Sentinel"), one(s, "Elite Vanguard"), one(s, "Ornithopter"), one(s, "The Second Doctor")];
  s.objects[saga]!.counters = { lore: 2 };
  // Its third lore counter comes as the precombat main phase begins (CR 714.3b).
  s.step = "draw";
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await controls(page).getByRole("button", { name: "Yes" }).click();
  const st = await resolveUntil(page, (x) => x.pending?.kind === "pickPermanents" && x.pending.player === 0);
  // Both Humans leave an artifact: Esper Sentinel leaves Ornithopter, Elite Vanguard leaves either.
  expect([...(st.pending as { options: string[] }).options].sort()).toEqual([sentinel, vanguard].sort());
  const bar = controls(page);
  await expect(bar).toContainText("to exile");
  await page.locator(`[data-obj="${sentinel}"]`).click();
  await bar.getByRole("button", { name: "Exile", exact: true }).click();
  // The artifact: only Ornithopter is left, so it's exiled without asking.
  await resolveUntil(page, (x) => x.pending?.kind === "searchLibrary" && x.pending.player === 0);
  await modal(page).locator(`[data-pick="${doctor}"]`).click();
  await modal(page).getByRole("button", { name: "Done", exact: true }).click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending && x.objects[doctor]!.zone === "battlefield");
  expect([after.objects[sentinel]!.zone, after.objects[thopter]!.zone, after.objects[vanguard]!.zone]).toEqual(["exile", "exile", "battlefield"]);
  expect(pageErrors(page)).toEqual([]);
});
