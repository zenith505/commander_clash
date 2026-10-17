// Choices a Season's modes make as they resolve: "Choose artifact or enchantment" is a button per card type, asked
// again for each time the mode was chosen (CR 700.2i); "Choose an artifact or creature you control" is a click on one
// of yours, then Choose (no target, so it's picked as the spell resolves).
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Season of Gathering: choose a card type each time the mode was chosen", async ({ page }) => {
  const s = scene({ hand: ["Season of Gathering"], board: [...LANDS, "Grizzly Bears"] }, [{ board: ["Mind Stone", "Glorious Anthem"] }]);
  const [stone, anthem, bears] = [one(s, "Mind Stone"), one(s, "Glorious Anthem"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Season of Gathering", s).click();
  const modes = page.locator(".mode-menu");
  await modes.getByRole("button", { name: /^\{P\}\{P\} — Choose artifact or enchantment/ }).click();
  await modes.getByRole("button", { name: /^\{P\}\{P\} — Choose artifact or enchantment/ }).click();
  await modes.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption");
  const bar = controls(page);
  await expect(bar).toContainText("Season of Gathering: choose a card type");
  await bar.getByRole("button", { name: "Artifact", exact: true }).click();
  // The second {P}{P} asks again.
  const mid = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.objects[stone]!.zone === "graveyard");
  expect(mid.objects[anthem]!.zone).toBe("battlefield");
  await controls(page).getByRole("button", { name: "Enchantment", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect([stone, anthem, bears].map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "battlefield"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Season of Weaving: click a creature of yours to choose, and it's copied", async ({ page }) => {
  const s = scene({ hand: ["Season of Weaving"], board: [...LANDS, "Grizzly Bears", "Hill Giant"] });
  const giant = one(s, "Hill Giant");
  await open(page, s);
  await card(page, "Season of Weaving", s).click();
  const modes = page.locator(".mode-menu");
  await modes.getByRole("button", { name: /^\{P\}\{P\} — Choose an artifact or creature you control/ }).click();
  await modes.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents");
  const bar = controls(page);
  await expect(bar).toContainText("Season of Weaving: click an artifact or creature of yours to choose.");
  await expect(bar.getByRole("button", { name: "Choose" })).toBeDisabled();
  await page.locator(`[data-obj="${giant}"]`).click();
  await bar.getByRole("button", { name: "Choose" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  const tokens = after.battlefield.filter((id) => after.objects[id]!.isToken);
  expect(tokens.map((id) => after.cards[after.objects[id]!.cardId]!.name)).toEqual(["Hill Giant"]);
  expect(idsOf(s, "Grizzly Bears").map((id) => after.objects[id]!.zone)).toEqual(["battlefield"]);
  expect(pageErrors(page)).toEqual([]);
});
