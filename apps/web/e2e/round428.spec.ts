// Round 428: Ninja Teen at level 3 gives the creature cards in your graveyard sneak {3}{B} and lets you cast them from
// there using their sneak abilities: the graveyard view offers the card after blockers, and its menu's sneak entry
// returns an unblocked attacker.
import { expect, test } from "@playwright/test";
import { invalidateCharacteristics } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { attack, card, controls, menu, modal, resolveUntil } from "./ui";

test("Ninja Teen: after blockers, cast a creature card from your graveyard for sneak {3}{B}, returning an unblocked attacker", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Ninja Teen", "Grizzly Bears"], yard: ["Hill Giant"] });
  const [teen, bears, giant] = [one(s, "Ninja Teen"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  s.objects[teen]!.classLevel = 3;
  invalidateCharacteristics(s);
  await open(page, s);
  await expect(card(page, "Ninja Teen", s)).toContainText("Level 3");
  await controls(page).getByRole("button", { name: "Pass" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers");
  await attack(page, [[bears, 1]]);
  // You stop after blocks because you could sneak the Giant in from your graveyard.
  await resolveUntil(page, (st) => st.step === "declareBlockers" && !st.pending && st.priority === 0);
  await page.locator('[data-graveyard="0"]').click();
  await modal(page).locator(".card.playable", { hasText: "Hill Giant" }).click();
  await menu(page).locator('button[data-alt="grantedSneak"]').click();
  const bar = page.locator(".targeting", { hasText: "return" });
  await page.locator(`[data-obj="${bears}"]`).click();
  await bar.getByRole("button", { name: "Return and cast" }).click();
  const after = await resolveUntil(page, (st) => st.objects[giant]!.zone === "battlefield" && st.stack.length === 0);
  expect(after.objects[giant]).toMatchObject({ tapped: true, attacking: 1 });
  expect(after.objects[bears]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});
