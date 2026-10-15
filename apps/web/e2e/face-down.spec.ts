// PR #22: turning a manifested card face up from its menu, and manifest dread's pick of the top two cards.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, menu, modal, resolveUntil } from "./ui";

test("Soul Summons: the manifested creature card turns face up for its mana cost", async ({ page }) => {
  const s = scene({ hand: ["Soul Summons"], board: LANDS, library: ["Grizzly Bears"] });
  const bears = one(s, "Grizzly Bears");
  await open(page, s);
  await card(page, "Soul Summons", s).click();
  await resolveUntil(page, (st) => st.objects[bears]!.zone === "battlefield" && st.stack.length === 0);
  const down = page.locator(`[data-obj="${bears}"]`);
  // Only you can see what it is.
  await expect(down.locator(".face-down-face")).toContainText("Grizzly Bears");
  await down.click();
  const up = menu(page).getByRole("button", { name: /Turn face up: mana cost/ });
  await expect(up).toBeEnabled();
  await up.click();
  await expect(down.locator(".face-down-face")).toHaveCount(0);
  const after = await state(page);
  expect(after.objects[bears]!.faceDown).toBeFalsy();
  expect(pageErrors(page)).toEqual([]);
});

test("Manifest Dread: pick which of the top two goes onto the battlefield face down", async ({ page }) => {
  const s = scene({ hand: ["Manifest Dread"], board: LANDS, library: ["Grizzly Bears", "Hill Giant"] });
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Manifest Dread", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await expect(pick.locator(`[data-pick="${bears}"]`)).toBeVisible();
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[giant]).toMatchObject({ zone: "battlefield", faceDown: "manifest" });
  expect(after.objects[bears]!.zone).toBe("graveyard");
  await page.locator(`[data-obj="${giant}"]`).click();
  await expect(menu(page).getByRole("button", { name: /Turn face up: mana cost/ })).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});
