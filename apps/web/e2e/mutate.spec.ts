// Mutate (CR 702.140): the Mutate cast button, then the prompt to put the mutating creature on top or underneath.
import { expect, test } from "@playwright/test";
import { characteristics, invalidateCharacteristics } from "@cc/engine";
import { one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

test("Gemrazer: mutate onto Grizzly Bears, on top, then destroy the opponent's artifact", async ({ page }) => {
  const s = scene({ hand: ["Gemrazer"], board: ["Forest", "Forest", "Forest", "Grizzly Bears"] }, [{ board: ["Ornithopter"] }]);
  const gem = one(s, "Gemrazer");
  const bears = one(s, "Grizzly Bears");
  const thopter = one(s, "Ornithopter");
  await open(page, s);
  await card(page, "Gemrazer", s).click();
  await menu(page).getByRole("button", { name: /^Mutate/ }).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "mutate");
  const bar = controls(page);
  await expect(bar).toContainText("mutate onto Grizzly Bears");
  await bar.getByRole("button", { name: /^On top/ }).click();
  // "Whenever this creature mutates, destroy target artifact or enchantment an opponent controls."
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets");
  await page.locator(`[data-obj="${thopter}"]`).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[thopter]!.zone === "graveyard");
  invalidateCharacteristics(after);
  expect(characteristics(after, after.objects[bears]!).name).toBe("Gemrazer");
  expect(after.objects[gem]!.zone).toBe("merged");
  await expect(page.locator(`[data-obj="${bears}"]`).first()).toContainText("Mutated");
  expect(pageErrors(page)).toEqual([]);
});

test("Gemrazer: mutate under Grizzly Bears, which stays a 2/2 with reach and trample", async ({ page }) => {
  const s = scene({ hand: ["Gemrazer"], board: ["Forest", "Forest", "Forest", "Grizzly Bears"] });
  const bears = one(s, "Grizzly Bears");
  await open(page, s);
  await card(page, "Gemrazer", s).click();
  await menu(page).getByRole("button", { name: /^Mutate/ }).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "mutate");
  await controls(page).getByRole("button", { name: /^Underneath/ }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && !!st.objects[bears]!.merged);
  invalidateCharacteristics(after);
  const c = characteristics(after, after.objects[bears]!);
  expect([c.name, c.power, c.toughness]).toEqual(["Grizzly Bears", 2, 2]);
  expect(c.keywords).toEqual(expect.arrayContaining(["Reach", "Trample"]));
  expect(pageErrors(page)).toEqual([]);
});
