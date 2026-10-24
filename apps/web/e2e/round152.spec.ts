// Round 152's prompts: Siphon Insight's pick of one of the top two cards to exile face down, Animation Module's choice
// of a kind of counter a player has, Luxior's "Equip planeswalker" menu entry, Kastral's modes after combat damage (a
// Bird from the graveyard), and Vizkopa Guildmage's second ability in its menu.
import { expect, test } from "@playwright/test";
import { objIsType } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { attack, card, clickPlayer, controls, menu, modal, passTo, resolveUntil } from "./ui";

test("Siphon Insight: look at Ana's top two, exile Hill Giant face down, the other goes to the bottom", async ({ page }) => {
  const s = scene({ hand: ["Siphon Insight"], board: LANDS }, [{ library: ["Grizzly Bears", "Hill Giant"] }]);
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Siphon Insight", s).click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await expect(pick.locator(`[data-pick="${bears}"]`)).toHaveCount(1);
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "exile");
  expect(after.objects[giant]!.hiddenExile?.seen).toEqual([0]);
  expect(after.objects[giant]!.mayPlay).toMatchObject({ player: 0 });
  expect(after.players[1]!.library.at(-1)).toBe(bears);
  expect(pageErrors(page)).toEqual([]);
});

test("Animation Module: Ana has poison and energy counters; give her another poison counter", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Animation Module"] });
  s.players[1]!.poison = 2;
  s.players[1]!.energy = 3;
  const mod = one(s, "Animation Module");
  await open(page, s);
  await page.locator(`[data-obj="${mod}"]`).click();
  await menu(page).locator("button", { hasText: "another counter of that kind" }).click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "counterKind");
  const bar = controls(page);
  await expect(bar.getByRole("button")).toHaveText(["A poison counter", "A energy counter"]);
  await bar.getByRole("button", { name: "A poison counter" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[1]!.poison === 3);
  expect(after.players[1]!.energy).toBe(3);
  expect(pageErrors(page)).toEqual([]);
});

test("Luxior, Giada's Gift: Equip planeswalker attaches it to Jace Beleren, who becomes a creature", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Luxior, Giada's Gift", "Jace Beleren"] });
  const [luxior, jace] = [one(s, "Luxior, Giada's Gift"), one(s, "Jace Beleren")];
  s.objects[jace]!.counters.loyalty = 3;
  await open(page, s);
  await page.locator(`[data-obj="${luxior}"]`).click();
  await expect(menu(page).locator("button", { hasText: "Equip planeswalker" })).toHaveCount(1);
  await menu(page).locator("button", { hasText: "Equip planeswalker" }).click();
  await page.locator(`[data-obj="${jace}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[luxior]!.attachedTo === jace);
  expect(objIsType(after, after.objects[jace]!, "Creature")).toBe(true);
  expect(objIsType(after, after.objects[jace]!, "Planeswalker")).toBe(false);
  expect(pageErrors(page)).toEqual([]);
});

test("Kastral, the Windcrested: hits Ana, first mode; Birds of Paradise from the graveyard with a finality counter", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Kastral, the Windcrested"], yard: ["Birds of Paradise"] });
  const [kastral, birds] = [one(s, "Kastral, the Windcrested"), one(s, "Birds of Paradise")];
  await open(page, s);
  await passTo(page, "declareAttackers");
  await attack(page, [[kastral, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseModes");
  await page.locator(".mode-menu").getByRole("button", { name: /Bird creature card from your hand or graveyard/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  await modal(page).locator(`[data-pick="${birds}"]`).click();
  await modal(page).getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.objects[birds]!.zone === "battlefield");
  expect(after.objects[birds]!.counters.finality).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Vizkopa Guildmage: its second ability, then 3 life gained makes each opponent lose 3", async ({ page }) => {
  const s = scene({ hand: ["Revitalize"], board: [...LANDS, "Vizkopa Guildmage"] });
  const mage = one(s, "Vizkopa Guildmage");
  await open(page, s);
  await page.locator(`[data-obj="${mage}"]`).click();
  await expect(menu(page).locator("button", { hasText: "Target creature gains lifelink" })).toHaveCount(1);
  await menu(page).locator("button", { hasText: "Whenever you gain life this turn" }).click();
  const mid = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && (st.floatingTriggers?.length ?? 0) === 1);
  const life = mid.players[1]!.life;
  await card(page, "Revitalize", s).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[1]!.life < life);
  expect([1, 2, 3].map((p) => after.players[p]!.life)).toEqual([life - 3, life - 3, life - 3]);
  expect(pageErrors(page)).toEqual([]);
});
