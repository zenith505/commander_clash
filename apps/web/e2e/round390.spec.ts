// Round 390 in the browser: Verdant Mastery cast for {3}{G}, Ana chosen, its search telling where the first land, the next
// two and the rest go; and Sanctuary Blade's color, asked as it becomes attached by its equip ability.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";
import { characteristics } from "@cc/engine";

test("Verdant Mastery for {3}{G}: you choose Ana; the first land you find is hers, the next two yours, the last to your hand", async ({ page }) => {
  const s = scene({ hand: ["Verdant Mastery"], board: LANDS });
  await open(page, s);
  await card(page, "Verdant Mastery", s).click();
  await menu(page).getByRole("button", { name: "Cast it for 3 G" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "opponent" && st.pending.player === 0);
  await controls(page).getByRole("button", { name: "Ana" }).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const search = modal(page);
  await expect(search).toContainText("The first you find goes onto the battlefield tapped under Ana's control, the next 2 onto the battlefield tapped under your control, the rest into your hand.");
  const offered = asked.pending?.kind === "searchLibrary" ? asked.pending.cards : [];
  // One of each basic land type, in the order they're found.
  const names = ["Forest", "Island", "Swamp", "Plains"];
  const picks = names.map((n) => offered.find((id) => asked.cards[asked.objects[id]!.cardId]!.name === n)!);
  for (const id of picks) await search.locator(`[data-pick="${id}"]`).first().click();
  await search.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[picks[3]!]!.zone === "hand");
  const [forest, isl, swamp] = picks.map((id) => after.objects[id]!);
  expect([forest!.zone, forest!.controller, forest!.tapped]).toEqual(["battlefield", 1, true]);
  expect([isl!.zone, isl!.controller, isl!.tapped]).toEqual(["battlefield", 0, true]);
  expect([swamp!.zone, swamp!.controller, swamp!.tapped]).toEqual(["battlefield", 0, true]);
  expect(pageErrors(page)).toEqual([]);
});

test("Sanctuary Blade: equipped to your Grizzly Bears, you choose red; the Bears get +2/+0 and protection from red", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Sanctuary Blade", "Grizzly Bears"] });
  const [blade, bears] = [one(s, "Sanctuary Blade"), one(s, "Grizzly Bears")];
  await open(page, s);
  await page.locator(`[data-obj="${blade}"]`).first().click();
  await menu(page).getByRole("button", { name: /Equip/ }).click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "color" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Sanctuary Blade");
  await expect(bar).toContainText("choose a color");
  await bar.getByRole("button", { name: "R Red", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[blade]!.attachedTo === bears);
  const c = characteristics(after, after.objects[bears]!);
  expect([c.power, c.toughness]).toEqual([4, 2]);
  expect(c.keywords.some((k) => /^Protection from red$/i.test(k))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
