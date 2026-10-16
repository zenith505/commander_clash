// "Gains your choice of flying, deathtouch, or lifelink" (Assassin Initiate): the keyword is chosen as the ability
// resolves (CR 608.2d), on a bar with one button per keyword.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

test("Assassin Initiate: choose deathtouch as its ability resolves", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Assassin Initiate"] });
  const initiate = one(s, "Assassin Initiate");
  await open(page, s);
  await card(page, "Assassin Initiate", s).click();
  await menu(page).locator("button", { hasText: "gains your choice of" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "keyword");
  const bar = controls(page);
  await expect(bar).toContainText("Assassin Initiate: choose an ability");
  for (const k of ["Flying", "Deathtouch", "Lifelink"]) await expect(bar.getByRole("button", { name: k })).toBeVisible();
  await bar.getByRole("button", { name: "Deathtouch" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  const gained = after.effects.filter((e) => e.affected.includes(initiate)).flatMap((e) => e.mods);
  expect(gained).toContainEqual({ kind: "addKeywords", keywords: ["Deathtouch"] });
  expect(gained).not.toContainEqual({ kind: "addKeywords", keywords: ["Flying"] });
  expect(pageErrors(page)).toEqual([]);
});
