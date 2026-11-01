// Lane B round 67: Lens of Clarity (and Found Footage, Keeper of the Lens) shows you what another player's face-down
// creatures are (rulings: not their face-down spells), and the top card of your library.
import { expect, test } from "@playwright/test";
import { invalidateCharacteristics } from "@cc/engine";
import { idsOf, open, pageErrors, scene } from "./scene";

test("Lens of Clarity: an opponent's face-down creature shows what it is, and your library's top card shows", async ({ page }) => {
  const s = scene({ board: ["Lens of Clarity"], library: ["Hill Giant"] }, [{ board: ["Grizzly Bears"] }]);
  const bears = idsOf(s, "Grizzly Bears", "battlefield", 1)[0]!;
  s.objects[bears]!.faceDown = "manifest";
  invalidateCharacteristics(s);
  await open(page, s);
  const down = page.locator(`[data-obj="${bears}"]`);
  await expect(down.locator(".face-down-face")).toBeVisible();
  await expect(down.locator(".ct-peek")).toHaveText("Grizzly Bears");
  // The top card of your library is shown too.
  const giant = idsOf(s, "Hill Giant", "library", 0)[0]!;
  await expect(page.locator(`[data-obj="${giant}"]`)).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test("Without Lens of Clarity, an opponent's face-down creature stays a mystery", async ({ page }) => {
  const s = scene({ board: ["Plains"], library: ["Hill Giant"] }, [{ board: ["Grizzly Bears"] }]);
  const bears = idsOf(s, "Grizzly Bears", "battlefield", 1)[0]!;
  s.objects[bears]!.faceDown = "manifest";
  invalidateCharacteristics(s);
  await open(page, s);
  const down = page.locator(`[data-obj="${bears}"]`);
  await expect(down.locator(".face-down-face")).toBeVisible();
  await expect(down.locator(".ct-peek")).toHaveCount(0);
  const giant = idsOf(s, "Hill Giant", "library", 0)[0]!;
  await expect(page.locator(`[data-obj="${giant}"]`)).toHaveCount(0);
  expect(pageErrors(page)).toEqual([]);
});
