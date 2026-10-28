// Round 200's prompt: Let's Play a Game's "Choose one. If there are four or more card types among cards in your
// graveyard, choose one or more instead." (the mode menu takes one to three modes with delirium, one without).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, resolveUntil } from "./ui";

test("Let's Play a Game with delirium: the mode menu takes all three modes", async ({ page }) => {
  const s = scene({ hand: ["Let's Play a Game"], board: LANDS, yard: ["Forest", "Grizzly Bears", "Shock", "Ornithopter"] }, [{ hand: ["Hill Giant", "Goblin Piker"], board: ["Llanowar Elves"] }]);
  const elves = one(s, "Llanowar Elves");
  await open(page, s);
  await card(page, "Let's Play a Game", s).click();
  const modes = page.locator(".mode-menu");
  await expect(modes).toContainText("choose one to three modes");
  await modes.getByRole("button", { name: /Creatures your opponents control get -1\/-1/ }).click();
  await modes.getByRole("button", { name: /Each opponent discards two cards/ }).click();
  await modes.getByRole("button", { name: /Each opponent loses 3 life/ }).click();
  await modes.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[one(s, "Let's Play a Game")]!.zone === "graveyard");
  expect(after.objects[elves]!.zone).toBe("graveyard");
  expect(after.players[1]!.hand).toHaveLength(0);
  expect([1, 2, 3].map((p) => after.players[p]!.life)).toEqual([37, 37, 37]);
  expect(after.players[0]!.life).toBe(43);
  expect(pageErrors(page)).toEqual([]);
});

test("Let's Play a Game without delirium: one mode, chosen with one click", async ({ page }) => {
  const s = scene({ hand: ["Let's Play a Game"], board: LANDS, yard: ["Forest", "Grizzly Bears"] }, [{ board: ["Llanowar Elves"] }]);
  await open(page, s);
  await card(page, "Let's Play a Game", s).click();
  const modes = page.locator(".mode-menu");
  await expect(modes).toBeVisible();
  await expect(modes.getByRole("button", { name: "Done" })).toHaveCount(0);
  await modes.getByRole("button", { name: /Each opponent loses 3 life/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[one(s, "Let's Play a Game")]!.zone === "graveyard");
  expect([1, 2, 3].map((p) => after.players[p]!.life)).toEqual([37, 37, 37]);
  expect(after.objects[one(s, "Llanowar Elves")]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
