// Round 423 in the browser: Dermotaxi exiling Ana's Serra Angel (another player's graveyard) as it enters, then tapping two
// creatures to become a copy of it; Verrak, Warped Sengir paying Greed's 2 life again to copy its ability; Mirror of the
// Forebears becoming a copy of an Elf of its chosen type.
import { expect, test } from "@playwright/test";
import { characteristics } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

test("Dermotaxi: exile Ana's Serra Angel as it enters, then tap two creatures: it's a 4/4 flying Angel until end of turn", async ({ page }) => {
  const s = scene({ hand: ["Dermotaxi"], board: [...LANDS, "Grizzly Bears", "Llanowar Elves"], yard: ["Hill Giant"] }, [{ yard: ["Serra Angel"] }]);
  const taxi = one(s, "Dermotaxi");
  const [angel, giant] = [idsOf(s, "Serra Angel", "graveyard", 1)[0]!, idsOf(s, "Hill Giant", "graveyard", 0)[0]!];
  const [bears, elves] = [one(s, "Grizzly Bears"), one(s, "Llanowar Elves")];
  await open(page, s);
  await card(page, "Dermotaxi", s).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "exileFromYard");
  expect([...(asked.pending as { options: string[] }).options].sort()).toEqual([angel, giant].sort());
  const c = controls(page);
  await expect(c).toContainText("exile a creature card from a graveyard as it enters");
  await c.getByRole("button", { name: /^Exile Serra Angel \(.+'s graveyard\)$/ }).click();
  const entered = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[taxi]!.zone === "battlefield");
  expect(entered.objects[angel]!.zone).toBe("exile");
  expect(entered.objects[giant]!.zone).toBe("graveyard");
  await page.locator(`[data-obj="${taxi}"]`).first().click();
  const item = menu(page).locator("button", { hasText: "becomes a copy" });
  if (await item.count()) await item.first().click();
  const bar = page.locator(".targeting", { hasText: "tap 2 untapped creatures you control" });
  await expect(bar).toHaveCount(1);
  await page.locator(`[data-obj="${bears}"]`).click();
  await page.locator(`[data-obj="${elves}"]`).click();
  await bar.getByRole("button", { name: "Tap and activate" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && characteristics(st, st.objects[taxi]!).name === "Serra Angel");
  expect(characteristics(after, after.objects[taxi]!).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
  expect([bears, elves].map((id) => after.objects[id]!.tapped)).toEqual([true, true]);
  await expect(page.locator(`[data-obj="${taxi}"]`).first()).toContainText("4/4");
  expect(pageErrors(page)).toEqual([]);
});

test("Verrak, Warped Sengir: Greed's 2 life paid again copies it; two cards drawn, 4 life paid", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Verrak, Warped Sengir", "Greed"], library: ["Plains", "Plains", "Plains"] });
  const greed = one(s, "Greed");
  const life = s.players[0]!.life;
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  await page.locator(`[data-obj="${greed}"]`).first().click();
  const item = menu(page).locator("button", { hasText: "Draw a card" });
  if (await item.count()) await item.first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await expect(controls(page)).toContainText("Pay that much life again. If you do, copy that ability (2 life)?");
  await controls(page).getByRole("button", { name: "Pay", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[0]!.hand.length === hand + 2);
  expect(after.players[0]!.life).toBe(life - 4);
  expect(pageErrors(page)).toEqual([]);
});

test("Mirror of the Forebears (Elf chosen): it becomes a copy of Elvish Archdruid, and the Llanowar Elves are 3/3", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Mirror of the Forebears", "Elvish Archdruid", "Llanowar Elves"] });
  const [mirror, druid, elves] = [one(s, "Mirror of the Forebears"), one(s, "Elvish Archdruid"), one(s, "Llanowar Elves")];
  s.objects[mirror]!.chosen = { type: "Elf" };
  await open(page, s);
  await page.locator(`[data-obj="${mirror}"]`).first().click();
  const item = menu(page).locator("button", { hasText: "becomes a copy" });
  if (await item.count()) await item.first().click();
  await page.locator(`[data-obj="${druid}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && characteristics(st, st.objects[mirror]!).name === "Elvish Archdruid");
  expect(characteristics(after, after.objects[mirror]!).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
  await expect(page.locator(`[data-obj="${elves}"]`).first()).toContainText("3/3");
  expect(pageErrors(page)).toEqual([]);
});
