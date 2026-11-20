// Lane B round B273 in the browser: Spellweaver Volute (cast it onto Lightning Bolt in Ana's graveyard, then cast
// Divination: cast the free copy of Bolt at Ana and move Volute to Shock in your graveyard rather than
// Cremate in another opponent's) and Bludgeon Brawl (Sol Ring
// and Mind Stone are Equipment: equip them onto Grizzly Bears from their menus).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, menu, modal, resolveUntil } from "./ui";

test("Spellweaver Volute: enchant Ana's Lightning Bolt; casting Divination casts a free copy of it, then Volute moves to Shock", async ({ page }) => {
  const s = scene({ hand: ["Spellweaver Volute", "Divination"], board: LANDS, yard: ["Shock"] }, [{ yard: ["Lightning Bolt"] }, { yard: ["Cremate"] }]);
  const [volute, bolt, shock, cremate] = [one(s, "Spellweaver Volute"), one(s, "Lightning Bolt"), one(s, "Shock"), one(s, "Cremate")];
  await open(page, s);
  await card(page, "Spellweaver Volute", s).click();
  const pick = modal(page);
  // Instant cards in any graveyard: Ana's Lightning Bolt and your Shock.
  await expect(pick.locator(`[data-pick="${bolt}"]`)).toBeVisible();
  await expect(pick.locator(`[data-pick="${shock}"]`)).toBeVisible();
  await pick.locator(`[data-pick="${bolt}"]`).click();
  const on = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[volute]!.zone === "battlefield");
  expect(on.objects[volute]!.attachedTo).toBe(bolt);
  await expect(page.locator(`[data-obj="${volute}"]`)).toContainText("On Lightning Bolt");
  const life = on.players[1]!.life;
  await card(page, "Divination", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.player === 0);
  await expect(controls(page)).toContainText("cast Lightning Bolt without paying its mana cost?");
  await controls(page).getByRole("button", { name: "Cast it" }).click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "enchant");
  const where = page.locator(".controls.enchant-pick");
  await expect(where).toContainText("choose another instant card in a graveyard to attach Spellweaver Volute to");
  // Lightning Bolt was exiled; your Shock and the second opponent's Cremate are left.
  await expect(where.getByRole("button")).toHaveCount(2);
  await expect(where.getByRole("button", { name: /^Cremate/ })).toHaveCount(1);
  await where.getByRole("button", { name: /^Shock/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[volute]!.attachedTo === shock);
  expect(after.objects[bolt]!.zone).toBe("exile");
  expect(after.objects[cremate]!.zone).toBe("graveyard");
  expect(after.players[1]!.life).toBe(life - 3);
  await expect(page.locator(`[data-obj="${volute}"]`)).toContainText("On Shock");
  expect(pageErrors(page)).toEqual([]);
});

test("Bludgeon Brawl: Sol Ring and Mind Stone are Equipment; equip both onto Grizzly Bears for +3/+0", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Bludgeon Brawl", "Sol Ring", "Mind Stone", "Grizzly Bears"] });
  const [ring, stone, bears] = [one(s, "Sol Ring"), one(s, "Mind Stone"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Sol Ring", s).click();
  await menu(page).getByRole("button", { name: "Equip 1" }).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[ring]!.attachedTo === bears);
  await card(page, "Mind Stone", s).click();
  await menu(page).getByRole("button", { name: "Equip 2" }).click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[stone]!.attachedTo === bears);
  expect(after.objects[ring]!.attachedTo).toBe(bears);
  await expect(page.locator(`[data-obj="${bears}"]`).first()).toContainText("5/2");
  expect(pageErrors(page)).toEqual([]);
});
