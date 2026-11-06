// Round 281's prompts: a text change's two words (CR 612). Mind Bend: buttons for the word to replace (color words and
// basic land types), then for the new one; Artificial Evolution: the creature type picker for both words, Wall never
// offered as the new one.
import { expect, test } from "@playwright/test";
import { characteristics } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, modal, resolveUntil } from "./ui";

test("Mind Bend: choose Swamp, then Island; Bog Wraith has islandwalk", async ({ page }) => {
  const s = scene({ hand: ["Mind Bend"], board: LANDS }, [{ board: ["Bog Wraith"] }]);
  const wraith = one(s, "Bog Wraith");
  await open(page, s);
  await card(page, "Mind Bend", s).click();
  await card(page, "Bog Wraith", s).click();
  await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "textFrom" && x.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Mind Bend: replace all instances of which color word or basic land type in Bog Wraith's text?");
  // Both kinds of word are offered.
  await expect(bar.getByRole("button", { name: "White", exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "Swamp", exact: true }).click();
  // Then only basic land types, and not Swamp itself.
  const next = await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "textTo");
  expect((next.pending as { options: string[] }).options).toEqual(["Plains", "Island", "Mountain", "Forest"]);
  await expect(bar).toContainText("replace Swamp in Bog Wraith's text with which basic land type?");
  await expect(bar.getByRole("button", { name: "White", exact: true })).toHaveCount(0);
  await bar.getByRole("button", { name: "Island", exact: true }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0);
  const kw = characteristics(after, after.objects[wraith]!).keywords;
  expect(kw).toContain("Islandwalk");
  expect(kw).not.toContain("Swampwalk");
  expect(after.log.some((l) => /changes the text of Bog Wraith: Swamp becomes Island/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Artificial Evolution: Goblin to Elf in the creature type picker; the other Goblin loses Goblin King's bonus", async ({ page }) => {
  const s = scene({ hand: ["Artificial Evolution"], board: LANDS }, [{ board: ["Goblin King", "Raging Goblin"] }]);
  const king = one(s, "Goblin King");
  const goblin = one(s, "Raging Goblin");
  await open(page, s);
  await card(page, "Artificial Evolution", s).click();
  await card(page, "Goblin King", s).click();
  await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "textFrom" && x.pending.player === 0);
  const pick = modal(page);
  await expect(pick).toContainText("Artificial Evolution: replace all instances of which creature type in Goblin King's text?");
  await pick.getByPlaceholder("Type to search…").fill("Goblin");
  await pick.locator('button[data-type="Goblin"]').click();
  const next = await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "textTo");
  const options = (next.pending as { options: string[] }).options;
  expect(options).not.toContain("Wall");
  expect(options).not.toContain("Goblin");
  await expect(pick).toContainText("replace Goblin in Goblin King's text with which creature type?");
  await pick.getByPlaceholder("Type to search…").fill("Wall");
  await expect(pick.locator('button[data-type="Wall"]')).toHaveCount(0);
  await pick.getByPlaceholder("Type to search…").fill("Elf");
  await pick.locator('button[data-type="Elf"]').click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0);
  expect(characteristics(after, after.objects[king]!).subtypes).toEqual(["Elf"]);
  expect(characteristics(after, after.objects[goblin]!).power).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});
