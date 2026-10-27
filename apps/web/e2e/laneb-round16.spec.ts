// Lane B round 16's choices in the browser: looking at the top card of another player's library and putting it into
// their graveyard (Eye Spy), and crewing a Vehicle while one creature can't crew (Revoke Privileges).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, menu, modal, resolveUntil } from "./ui";

test("Eye Spy: target a player, then put the top card of their library into their graveyard", async ({ page }) => {
  const s = scene({ hand: ["Eye Spy"], board: LANDS }, [{ library: ["Hill Giant", "Grizzly Bears"] }]);
  const top = s.players[1]!.library[0]!;
  await open(page, s);
  await card(page, "Eye Spy", s).click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await expect(pick).toContainText("Ana's graveyard");
  await pick.locator(`[data-pick="${top}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[top]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Revoke Privileges: the enchanted creature can't be picked to crew; another one crews", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Smuggler's Copter", "Grizzly Bears", "Hill Giant", "Revoke Privileges"] });
  const [copter, bears, giant, revoke] = [one(s, "Smuggler's Copter"), one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Revoke Privileges")];
  s.objects[revoke]!.attachedTo = bears;
  await open(page, s);
  await page.locator(`[data-obj="${copter}"]`).first().click();
  if (await menu(page).isVisible()) await menu(page).getByRole("button", { name: /Crew 1/ }).click();
  const bar = page.locator(".targeting");
  await expect(bar).toContainText("Crew Smuggler's Copter");
  await expect(bar).toContainText("(now 3)");
  // Clicking the enchanted Bears adds nothing.
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await expect(bar).toContainText("(now 3)");
  await bar.getByRole("button", { name: "Crew" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.tapped === true);
  expect(after.objects[bears]!.tapped).toBe(false);
  expect(pageErrors(page)).toEqual([]);
});
