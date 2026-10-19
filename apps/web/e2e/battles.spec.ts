// Battles (CR 310): a Siege's protector is chosen as it enters, a button for each opponent (310.12a), and the battle
// shows its defense and protector. You attack your own Siege by clicking a creature and then the Siege; defeated, it's
// exiled and you're asked to cast its back face for free (310.12b), with no button to cast the front face.
import { expect, test } from "@playwright/test";
import { characteristics, invalidateCharacteristics } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Invasion of Belenon: choose the opponent who protects it as it enters", async ({ page }) => {
  const s = scene({ hand: ["Invasion of Belenon // Belenon War Anthem"], board: [...LANDS] });
  const siege = one(s, "Invasion of Belenon");
  await open(page, s);
  await card(page, "Invasion of Belenon", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "protector");
  const bar = controls(page);
  await expect(bar).toContainText("Invasion of Belenon: choose an opponent to protect it; you and the others can attack it");
  await expect(bar.getByRole("button")).toHaveText(["Ana", "Ben", "Cy"]);
  await bar.getByRole("button", { name: "Ben", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[siege]?.protector !== undefined);
  expect(after.objects[siege]!.protector).toBe(2);
  expect(after.objects[siege]!.counters.defense).toBe(5);
  await expect(page.locator(`[data-obj="${siege}"] .chip.protector`)).toHaveText("Protected by Ben");
  await expect(page.locator(`[data-obj="${siege}"] .pt.defense`)).toHaveText("5");
  expect(pageErrors(page)).toEqual([]);
});

test("Invasion of Belenon: attack your own Siege, defeat it, and cast Belenon War Anthem", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Invasion of Belenon // Belenon War Anthem", "Hill Giant"] });
  const [siege, giant] = [one(s, "Invasion of Belenon"), one(s, "Hill Giant")];
  s.objects[siege]!.counters.defense = 3;
  s.objects[siege]!.protector = 1;
  await open(page, s);
  await controls(page).getByRole("button", { name: "Pass" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  await expect(controls(page)).toContainText("Click a creature, then the player it attacks");
  await page.locator(`[data-obj="${giant}"]`).click();
  await page.locator(`[data-obj="${siege}"]`).click();
  await controls(page).getByRole("button", { name: "Attack with 1" }).click();
  const defeated = await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.player === 0, 60);
  expect(defeated.objects[siege]!.zone).toBe("exile");
  expect(defeated.log.some((l) => l.text === "Hill Giant attacks Invasion of Belenon (protected by Ana).")).toBe(true);
  const bar = controls(page);
  await expect(bar).toContainText("it's defeated. Cast Belenon War Anthem transformed without paying its mana cost? If you don't, it stays in exile.");
  await expect(bar.getByRole("button", { name: "Cast it", exact: true })).toHaveCount(0);
  await bar.getByRole("button", { name: "Cast Belenon War Anthem" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[siege]?.zone === "battlefield", 60);
  invalidateCharacteristics(after);
  expect(characteristics(after, after.objects[siege]!).name).toBe("Belenon War Anthem");
  expect(characteristics(after, after.objects[giant]!).power).toBe(4); // Creatures you control get +1/+1.
  expect(pageErrors(page)).toEqual([]);
});
