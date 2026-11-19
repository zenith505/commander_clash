// Round 418's UI fix: the "Copy" chip says a permanent is a copy of something (CR 707.4, 707.5). A transformed or
// converted permanent showing its back face (CR 712.8e, 701.28), a melded permanent (712.8g) and a Room with an unlocked
// door (709.5) aren't copies, though each has another definition than its card's, and get no "Copy" chip.
import { expect, test } from "@playwright/test";
import { characteristics, invalidateCharacteristics } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, menu, resolveUntil } from "./ui";

const ARCEE = "Arcee, Sharpshooter // Arcee, Acrobatic Coupe";

test("Copy chip: Arcee converted to its back face and an unlocked Room get none; a real copy does", async ({ page }) => {
  const s = scene({ board: [...LANDS, ARCEE, "Charred Foyer // Warped Space", "Grizzly Bears"] }, [{ board: ["Hill Giant"] }]);
  const arcee = one(s, "Arcee, Sharpshooter"), room = one(s, "Charred Foyer // Warped Space"), bears = one(s, "Grizzly Bears"), giant = one(s, "Hill Giant");
  s.objects[arcee]!.face = 1;
  s.objects[room]!.unlocked = [0];
  // Grizzly Bears entered as a copy of Hill Giant (as a Clone would, CR 707.5).
  s.objects[bears]!.copyOf = s.objects[giant]!.cardId;
  invalidateCharacteristics(s);
  expect(characteristics(s, s.objects[arcee]!).name).toBe("Arcee, Acrobatic Coupe");
  expect(characteristics(s, s.objects[bears]!).name).toBe("Hill Giant");
  await open(page, s);
  await expect(page.locator(`[data-obj="${arcee}"]`).first()).toBeVisible();
  await expect(page.locator(`[data-obj="${arcee}"] .chip`, { hasText: /^Copy$/ })).toHaveCount(0);
  await expect(page.locator(`[data-obj="${room}"] .chip`, { hasText: /^Copy$/ })).toHaveCount(0);
  const chip = page.locator(`[data-obj="${bears}"] .chip`, { hasText: /^Copy$/ });
  await expect(chip).toHaveCount(1);
  await expect(chip).toHaveAttribute("title", "Grizzly Bears, a copy of Hill Giant.");
  expect(pageErrors(page)).toEqual([]);
});

test("Copy chip: Hanweir, the Writhing Township, melded, gets the Melded chip and no Copy chip", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Hanweir Battlements", "Hanweir Garrison"] });
  const land = one(s, "Hanweir Battlements"), garrison = one(s, "Hanweir Garrison");
  await open(page, s);
  await card(page, "Hanweir Battlements", s).click();
  await menu(page).locator("button", { hasText: "meld" }).click();
  // Only one Hanweir Garrison: no pick, it melds with that one.
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[land]!.melded !== undefined);
  expect(after.objects[garrison]!.zone).toBe("merged");
  await expect(page.locator(`[data-obj="${land}"] .chip`, { hasText: "Melded" })).toBeVisible();
  await expect(page.locator(`[data-obj="${land}"] .chip`, { hasText: /^Copy$/ })).toHaveCount(0);
  expect(pageErrors(page)).toEqual([]);
});
