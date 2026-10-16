// This round's prompts and menu entries: discover's "cast it free, or it goes to your hand" (Hidden Volcano, CR
// 701.57a), Field of Ruin's library search for each player (you pick your basic land), Relic of Progenitus' "{1},
// Exile this artifact" menu entry, and Bloodthorn Flail's two equip costs (pay {3} or discard a card).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Hidden Volcano: discover 4, don't cast the card and it goes to your hand", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Hidden Volcano"], library: ["Hill Giant"] });
  const giant = one(s, "Hill Giant");
  await open(page, s);
  await card(page, "Hidden Volcano", s).click();
  await menu(page).locator("button", { hasText: "Discover 4" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree");
  const bar = controls(page);
  await expect(bar).toContainText("Cast Hill Giant without paying its mana cost? If you don't, it goes to your hand.");
  await bar.getByRole("button", { name: "Don't" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[giant]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("Hidden Volcano: discover 4 and cast the card for free", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Hidden Volcano"], library: ["Forest", "Hill Giant"] });
  const giant = one(s, "Hill Giant");
  await open(page, s);
  await card(page, "Hidden Volcano", s).click();
  await menu(page).locator("button", { hasText: "Discover 4" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree");
  await controls(page).getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "battlefield");
  expect(after.objects[giant]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Field of Ruin: destroy an opponent's nonbasic land, then you pick a basic land from your library", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Field of Ruin"], library: ["Wastes"] }, [{ board: ["Command Tower"] }]);
  const tower = one(s, "Command Tower");
  await open(page, s);
  await card(page, "Field of Ruin", s).click();
  await menu(page).locator("button", { hasText: "Destroy target nonbasic land" }).click();
  await page.locator(`[data-obj="${tower}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  await expect(pick).toContainText("a basic land card");
  const st = await state(page);
  const basic = st.pending?.kind === "searchLibrary" ? st.pending.cards[0]! : "";
  await pick.locator(`[data-pick="${basic}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending);
  expect(after.objects[tower]!.zone).toBe("graveyard");
  expect(after.objects[basic]).toMatchObject({ zone: "battlefield", controller: 0 });
  // Every opponent searched too, and got a basic land.
  for (const pid of [1, 2, 3]) expect(after.log.some((l) => l.text.startsWith(`${after.players[pid]!.name} searches their library, finds a card`))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Relic of Progenitus: {1}, exile it, exile all graveyards and draw a card", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Relic of Progenitus"], yard: ["Grizzly Bears"] }, [{ yard: ["Hill Giant"] }]);
  const [relic, bears, giant] = [one(s, "Relic of Progenitus"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Relic of Progenitus", s).click();
  await menu(page).locator("button", { hasText: "Exile all graveyards" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "exile");
  expect([relic, bears, giant].map((id) => after.objects[id]!.zone)).toEqual(["exile", "exile", "exile"]);
  expect(after.players[0]!.hand).toHaveLength(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Bloodthorn Flail: its menu has both equip costs; equip by discarding a card", async ({ page }) => {
  const s = scene({ board: ["Bloodthorn Flail", "Grizzly Bears"], hand: ["Shock"] });
  const [flail, bears, shock] = [one(s, "Bloodthorn Flail"), one(s, "Grizzly Bears"), one(s, "Shock")];
  await open(page, s);
  await card(page, "Bloodthorn Flail", s).click();
  await expect(menu(page).locator("button", { hasText: "Equip—Pay" })).toHaveCount(1);
  await menu(page).locator("button", { hasText: "Equip—Discard a card" }).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  const pick = modal(page);
  await expect(pick).toContainText("Bloodthorn Flail: discard a card");
  await expect(pick.getByRole("button", { name: "Done" })).toBeDisabled();
  await pick.locator(`[data-pick="${shock}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[flail]!.attachedTo === bears);
  expect(after.objects[shock]!.zone).toBe("graveyard");
  await expect(page.locator(`[data-obj="${bears}"]`)).toContainText("4/3");
  expect(pageErrors(page)).toEqual([]);
});
