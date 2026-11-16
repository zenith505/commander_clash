// Round 387: Oko, Shadowmoor Scion's −6, choosing a creature type for its emblem, which shows that type.
import { expect, test } from "@playwright/test";
import { invalidateCharacteristics, power, setFace } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { menu, modal, resolveUntil } from "./ui";

test("Oko, Shadowmoor Scion's −6: choose Elf; the emblem shows Elf and your Llanowar Elves (not your Grizzly Bears) get +3/+3", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Oko, Lorwyn Liege // Oko, Shadowmoor Scion", "Llanowar Elves", "Grizzly Bears"] });
  const oko = one(s, "Oko, Lorwyn Liege");
  const elves = one(s, "Llanowar Elves");
  const bears = one(s, "Grizzly Bears");
  setFace(s, s.objects[oko]!, 1);
  s.objects[oko]!.counters = { loyalty: 6 };
  invalidateCharacteristics(s);
  await open(page, s);
  await page.locator(`[data-obj="${oko}"]`).first().click();
  await menu(page).locator("button", { hasText: "Choose a creature type. You get an emblem" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "creatureType" && st.pending.player === 0);
  await modal(page).locator('[data-type="Elf"]').first().click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && (st.emblems ?? []).length === 1);
  const emblem = after.emblems![0]!;
  expect(after.objects[emblem]!.chosen?.type).toBe("Elf");
  expect(after.objects[oko]!.zone).toBe("graveyard");
  await expect(page.locator(`[data-emblem="${emblem}"]`)).toContainText("Oko (Elf)");
  expect(power(after, after.objects[elves]!)).toBe(4);
  expect(power(after, after.objects[bears]!)).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});
