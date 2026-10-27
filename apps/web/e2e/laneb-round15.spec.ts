// Lane B round 15's prompts: choosing several cards from a player's hand (Extortion), putting the chosen one on top of
// their library (Painful Memories), and a player target that must have more life than you (Keeper of the Light).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, menu, modal, resolveUntil } from "./ui";

test("Extortion: target a player, then pick two cards from their hand for them to discard", async ({ page }) => {
  const s = scene({ hand: ["Extortion"], board: LANDS }, [{ hand: ["Grizzly Bears", "Hill Giant", "Shock"] }]);
  const [bears, giant, shock] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Shock")];
  await open(page, s);
  await card(page, "Extortion", s).click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await expect(pick).toContainText("Ana's hand");
  await expect(pick).toContainText("up to 2 cards");
  await pick.locator(`[data-pick="${bears}"]`).click();
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(after.objects[shock]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("Painful Memories: the card picked from their hand goes on top of their library", async ({ page }) => {
  const s = scene({ hand: ["Painful Memories"], board: LANDS }, [{ hand: ["Grizzly Bears", "Hill Giant"] }]);
  const giant = one(s, "Hill Giant");
  await open(page, s);
  await card(page, "Painful Memories", s).click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await expect(pick).toContainText("on top of Ana's library");
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[giant]!.zone).toBe("library");
  expect(after.players[1]!.library[0]).toBe(giant);
  expect(pageErrors(page)).toEqual([]);
});

test("Keeper of the Light: only an opponent with more life than you can be clicked; you gain 3 life", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Keeper of the Light"] });
  s.players[1]!.life = 45;
  const keeper = one(s, "Keeper of the Light");
  await open(page, s);
  await page.locator(`[data-obj="${keeper}"]`).first().click();
  if (await menu(page).isVisible()) await menu(page).getByRole("button").first().click();
  // Ben has 40 life, the same as you: clicking him does nothing.
  await clickPlayer(page, 2);
  await expect(page.locator(".targeting")).toBeVisible();
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[0]!.life === 43);
  expect(after.objects[keeper]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
