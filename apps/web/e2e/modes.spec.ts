// The mode menu's newer choices: the same mode more than once (CR 700.2d), pawprints (700.2i), escalate's cost (702.120a),
// an Inscription's kicker asked before its modes, and a mode that has been chosen already ("choose one that hasn't been
// chosen").
import { expect, test } from "@playwright/test";
import { compileCard } from "@cc/engine";
import { LANDS, def, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, menu, modal, resolveUntil } from "./ui";

const tapped = (st: { battlefield: string[]; objects: Record<string, { tapped: boolean; controller: number }> }) => st.battlefield.filter((id) => st.objects[id]!.tapped && st.objects[id]!.controller === 0).length;

test("Fiery Confluence: a mode chosen twice, one time fewer with −, and each time it happens", async ({ page }) => {
  const s = scene({ hand: ["Fiery Confluence"], board: [...LANDS, "Grizzly Bears"] }, [{ board: ["Llanowar Elves"] }]);
  const [bears, elves] = [one(s, "Grizzly Bears"), one(s, "Llanowar Elves")];
  await open(page, s);
  await card(page, "Fiery Confluence", s).click();
  const modes = page.locator(".mode-menu");
  await expect(modes).toContainText("choose three modes, the same one more than once if you like");
  const burn = modes.getByRole("button", { name: /deals 2 damage to each opponent/ });
  await burn.click();
  await burn.click();
  await burn.click();
  await expect(burn).toContainText("×3");
  await expect(modes.getByRole("button", { name: /deals 1 damage to each creature/ })).toBeDisabled(); // three already
  await modes.getByRole("button", { name: "Choose it one time fewer" }).click();
  await expect(burn).toContainText("×2");
  await modes.getByRole("button", { name: /deals 1 damage to each creature/ }).click();
  await modes.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[one(s, "Fiery Confluence")]!.zone === "graveyard");
  expect(after.players.map((p) => p.life)).toEqual([40, 36, 36, 36]);
  expect(after.objects[elves]!.zone).toBe("graveyard");
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Season of Loss: pawprints count down, and a mode that doesn't fit can't be added", async ({ page }) => {
  const s = scene({ hand: ["Season of Loss"], board: LANDS, yard: ["Grizzly Bears", "Hill Giant"] });
  await open(page, s);
  await card(page, "Season of Loss", s).click();
  const modes = page.locator(".mode-menu");
  await expect(modes).toContainText("choose up to 5 {P} worth of modes (5 left)");
  await modes.getByRole("button", { name: /^\{P\}\{P\}\{P\} — Each opponent loses X life/ }).click();
  await expect(modes).toContainText("(2 left)");
  await expect(modes.getByRole("button", { name: /^\{P\}\{P\}\{P\} — Each opponent/ })).toBeDisabled();
  await modes.getByRole("button", { name: /^\{P\}\{P\} — Draw a card for each creature/ }).click();
  await expect(modes).toContainText("(0 left)");
  await expect(modes.getByRole("button", { name: /^\{P\} — Each player sacrifices/ })).toBeDisabled();
  await modes.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[one(s, "Season of Loss")]!.zone === "graveyard");
  expect(after.players.map((p) => p.life)).toEqual([40, 38, 38, 38]); // two creature cards in your graveyard
  expect(pageErrors(page)).toEqual([]);
});

test("Collective Brutality: escalate is shown, then a card discarded for the second mode", async ({ page }) => {
  const s = scene({ hand: ["Collective Brutality", "Hill Giant", "Llanowar Elves"], board: LANDS }, [{ board: ["Grizzly Bears"] }]);
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Collective Brutality", s).click();
  const modes = page.locator(".mode-menu");
  await expect(modes).toContainText("escalate discard a card for each mode beyond the first");
  await modes.getByRole("button", { name: /Target creature gets -2\/-2/ }).click();
  await modes.getByRole("button", { name: /Target opponent loses 2 life/ }).click();
  await modes.getByRole("button", { name: "Done" }).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  await clickPlayer(page, 1);
  const pick = modal(page);
  await expect(pick).toContainText("Collective Brutality: discard a card");
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[one(s, "Collective Brutality")]!.zone === "graveyard");
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(after.objects[one(s, "Llanowar Elves")]!.zone).toBe("hand");
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.players.map((p) => p.life)).toEqual([42, 38, 40, 40]);
  expect(pageErrors(page)).toEqual([]);
});

test("Inscription of Ruin: kicker first, then any number of modes", async ({ page }) => {
  const s = scene({ hand: ["Inscription of Ruin"], board: LANDS }, [{ hand: ["Hill Giant", "Llanowar Elves"], board: ["Grizzly Bears"] }]);
  const bears = one(s, "Grizzly Bears");
  await open(page, s);
  await card(page, "Inscription of Ruin", s).click();
  await page.getByRole("button", { name: "Kick it" }).click();
  const modes = page.locator(".mode-menu");
  await expect(modes).toContainText("choose one to three modes");
  await modes.getByRole("button", { name: /Target opponent discards two cards/ }).click();
  await modes.getByRole("button", { name: /Destroy target creature with mana value 3 or less/ }).click();
  await modes.getByRole("button", { name: "Done" }).click();
  await clickPlayer(page, 1);
  await page.locator(`[data-obj="${bears}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[one(s, "Inscription of Ruin")]!.zone === "graveyard");
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.players[1]!.hand).toHaveLength(0);
  expect(tapped(after)).toBe(7); // {2}{B} + kicker {2}{B}{B}
  expect(pageErrors(page)).toEqual([]);
});

test("Three Bowls of Porridge: a mode chosen before can't be chosen again", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Three Bowls of Porridge"] }, [{ board: ["Grizzly Bears"] }]);
  const [bowls, bears] = [one(s, "Three Bowls of Porridge"), one(s, "Grizzly Bears")];
  // "Tap target creature" was chosen on an earlier turn.
  const ability = compileCard(def("Three Bowls of Porridge")).activated[0]!.body;
  s.objects[bowls]!.modesChosen = { [ability.text]: { modes: [1], turn: s.turn - 1 } };
  await open(page, s);
  await page.locator(`[data-obj="${bowls}"]`).click();
  const button = menu(page).getByRole("button", { name: /Choose one that hasn't been chosen/ });
  if (await button.count()) await button.click();
  const modes = page.locator(".mode-menu");
  await expect(modes.getByRole("button", { name: /Tap target creature/ })).toBeDisabled();
  await modes.getByRole("button", { name: /deals 2 damage to target creature/ }).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[bears]!.zone === "graveyard");
  expect(after.objects[bowls]!.modesChosen![ability.text]!.modes).toEqual([1, 0]);
  expect(idsOf(s, "Grizzly Bears")).toHaveLength(1);
  expect(pageErrors(page)).toEqual([]);
});
