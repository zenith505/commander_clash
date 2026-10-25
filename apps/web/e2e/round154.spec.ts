// Round 154's prompts: Yorion, Sky Nomad's "exile any number of other nonland permanents you own and control" (they
// come back at the beginning of the next end step), and Descendants' Fury's "you may sacrifice one of them", picked
// among the creatures that dealt combat damage.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { attack, card, controls, passTo, resolveUntil } from "./ui";

test("Yorion, Sky Nomad: exile Grizzly Bears and Mind Stone as it enters; they return at the beginning of the end step", async ({ page }) => {
  const s = scene({ hand: ["Yorion, Sky Nomad"], board: [...LANDS, "Grizzly Bears", "Mind Stone"] });
  const [bears, stone] = [one(s, "Grizzly Bears"), one(s, "Mind Stone")];
  await open(page, s);
  await card(page, "Yorion, Sky Nomad", s).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents");
  // Lands aren't nonland permanents.
  expect((asked.pending as { options: string[] }).options.sort()).toEqual([bears, stone].sort());
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "Exile none" })).toBeVisible();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await page.locator(`[data-obj="${stone}"]`).first().click();
  await bar.getByRole("button", { name: "Exile and return 2" }).click();
  const gone = await resolveUntil(page, (st) => st.objects[bears]!.zone === "exile" && !st.pending && st.stack.length === 0);
  expect(gone.objects[stone]!.zone).toBe("exile");
  const back = await resolveUntil(page, (st) => st.objects[bears]!.zone === "battlefield" && st.objects[stone]!.zone === "battlefield", 80);
  expect(back.step === "end" || back.step === "cleanup" || back.activePlayer !== 0).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Descendants' Fury: two Goblins hit, sacrifice Goblin Piker, and Goblin Guide comes off the library", async ({ page }) => {
  const s = scene({ board: ["Descendants' Fury", "Raging Goblin", "Goblin Piker"], library: ["Grizzly Bears", "Goblin Guide"] });
  const [raging, piker, bears, guide] = [one(s, "Raging Goblin"), one(s, "Goblin Piker"), one(s, "Grizzly Bears"), one(s, "Goblin Guide")];
  await open(page, s);
  await passTo(page, "declareAttackers");
  await attack(page, [
    [raging, 1],
    [piker, 1],
  ]);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay");
  const bar = controls(page);
  await expect(bar).toContainText("Sacrifice one of them?");
  await bar.getByRole("button", { name: "Yes" }).click();
  const pick = await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents");
  expect((pick.pending as { options: string[] }).options.sort()).toEqual([raging, piker].sort());
  await page.locator(`[data-obj="${piker}"]`).first().click();
  await bar.getByRole("button", { name: "Sacrifice", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.objects[guide]!.zone === "battlefield" && !st.pending);
  expect(after.objects[piker]!.zone).toBe("graveyard");
  expect(after.objects[raging]!.zone).toBe("battlefield");
  expect(after.objects[bears]!.zone).toBe("library");
  expect(after.players[0]!.library.at(-1)).toBe(bears);
  expect(pageErrors(page)).toEqual([]);
});
