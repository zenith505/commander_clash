// Lane B round 60 in the browser: Mesmeric Sliver's "you may fateseal 1" (Yes, then the opponent whose library, then
// that player's top card to the bottom), and Clergy of the Holy Nimbus's "Only your opponents may activate this
// ability": you can use it on Ana's Clergy, not on your own.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Mesmeric Sliver: fateseal 1, choosing Ben, and his top card goes to the bottom", async ({ page }) => {
  const s = scene({ hand: ["Mesmeric Sliver"], board: LANDS }, [{ library: ["Grizzly Bears"] }, { library: ["Hill Giant"] }]);
  const [sliver, giant] = [one(s, "Mesmeric Sliver"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Mesmeric Sliver", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay");
  await expect(controls(page)).toContainText("Fateseal 1?");
  await controls(page).getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption");
  await expect(controls(page)).toContainText("choose an opponent whose library to fateseal");
  await controls(page).getByRole("button", { name: "Ben", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "arrangeTop");
  const arrange = modal(page);
  await expect(arrange).toContainText("the top card of Ben's library: leave it on top or put it on the bottom");
  await arrange.locator(`[data-arrange="${giant}"]`).click();
  await arrange.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.players[2]!.library.at(-1)).toBe(giant);
  expect(after.objects[sliver]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Clergy of the Holy Nimbus: you activate Ana's Clergy's ability, then Doom Blade destroys it", async ({ page }) => {
  const s = scene({ hand: ["Doom Blade"], board: LANDS }, [{ board: ["Clergy of the Holy Nimbus"] }]);
  const clergy = one(s, "Clergy of the Holy Nimbus");
  await open(page, s);
  await page.locator(`[data-obj="${clergy}"]`).click();
  const ability = menu(page).getByRole("button", { name: /can't be regenerated this turn/ });
  await expect(ability).toBeEnabled();
  await ability.click();
  const done = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[clergy]!.noRegenTurn === st.turn);
  expect(done.objects[clergy]!.zone).toBe("battlefield");
  await card(page, "Doom Blade", s).click();
  await page.locator(`[data-obj="${clergy}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[one(s, "Doom Blade")]!.zone === "graveyard");
  expect(after.objects[clergy]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Clergy of the Holy Nimbus: your own Clergy's ability is off, and Doom Blade only taps it as it regenerates", async ({ page }) => {
  const s = scene({ hand: ["Doom Blade"], board: [...LANDS, "Clergy of the Holy Nimbus"] });
  const clergy = one(s, "Clergy of the Holy Nimbus");
  await open(page, s);
  await page.locator(`[data-obj="${clergy}"]`).click();
  const ability = menu(page).getByRole("button", { name: /can't be regenerated this turn/ });
  await expect(ability).toBeDisabled();
  await expect(ability).toHaveAttribute("title", /only Clergy of the Holy Nimbus's controller's opponents may activate that ability/);
  await menu(page).getByRole("button", { name: /Cancel|Close/ }).click();
  await card(page, "Doom Blade", s).click();
  await page.locator(`[data-obj="${clergy}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[one(s, "Doom Blade")]!.zone === "graveyard");
  expect(after.objects[clergy]!.zone).toBe("battlefield");
  expect(after.objects[clergy]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Spin into Myth: Ana's creature goes on top of her library, then fateseal 2 puts it on the bottom", async ({ page }) => {
  const s = scene({ hand: ["Spin into Myth"], board: LANDS }, [{ board: ["Hill Giant"], library: ["Grizzly Bears"] }]);
  const [giant, bears] = [one(s, "Hill Giant"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Spin into Myth", s).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption");
  await expect(controls(page)).toContainText("choose an opponent whose library to fateseal");
  await controls(page).getByRole("button", { name: "Ana", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "arrangeTop");
  const arrange = modal(page);
  await expect(arrange).toContainText("the top 2 cards of Ana's library: leave any on top and put the rest on the bottom, in any order");
  await arrange.locator(`[data-arrange="${giant}"]`).click();
  await arrange.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.players[1]!.library[0]).toBe(bears);
  expect(after.players[1]!.library.at(-1)).toBe(giant);
  expect(pageErrors(page)).toEqual([]);
});
