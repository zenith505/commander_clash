// Lane B round B179 in the browser: Drain Life's X picker, which allows no more X than black mana pays ("Spend only black
// mana on X"); Countersculpt's "behold a Jace or pay {1}" picked as it's cast, the Jace card then picked from your hand;
// Theorist's Sanctum's "Play it untapped (behold a Jace)"; Counterlash's free cast of a card sharing a type with the spell.
import { expect, test } from "@playwright/test";
import { one, open, pageErrors, scene, state } from "./scene";
import { card, clickPlayer, controls, menu, modal, resolveUntil } from "./ui";
import { applyAction, planCast } from "@cc/engine";

test("Drain Life: with three Swamps and three Mountains, X can be up to 2; X = 2 drains Ana for 2", async ({ page }) => {
  const s = scene({ hand: ["Drain Life"], board: ["Swamp", "Swamp", "Swamp", "Mountain", "Mountain", "Mountain"] });
  const drain = one(s, "Drain Life");
  await open(page, s);
  await card(page, "Drain Life", s).click();
  const x = page.locator(".x-pick");
  await expect(x).toContainText("(up to 2 with your mana)");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[drain]!.zone === "graveyard");
  expect(after.players[1]!.life).toBe(38);
  expect(after.players[0]!.life).toBe(42);
  expect(pageErrors(page)).toEqual([]);
});

test("Countersculpt: behold the Jace Beleren in your hand instead of paying {1}, counter Divination, empower Jace 1", async ({ page }) => {
  const s = scene({ hand: ["Divination", "Countersculpt", "Jace Beleren"], board: ["Island", "Island", "Island", "Island", "Island"] });
  const [divination, sculpt, jace] = [one(s, "Divination"), one(s, "Countersculpt"), one(s, "Jace Beleren")];
  await open(page, s);
  await card(page, "Divination", s).click();
  await expect.poll(async () => (await state(page)).stack.length).toBe(1);
  await card(page, "Countersculpt", s).click();
  const bar = page.locator(".targeting", { hasText: "as an additional cost" });
  // Two Islands left: paying {1} more isn't possible.
  await expect(bar.getByRole("button", { name: "Pay {1}" })).toBeDisabled();
  await bar.getByRole("button", { name: "Behold a Jace" }).click();
  const top = (await state(page)).stack[0]!.id;
  await page.locator(`[data-stack="${top}"]`).click();
  const pick = modal(page);
  await expect(pick).toContainText("Countersculpt: behold a Jace");
  await pick.locator(`[data-pick="${jace}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[sculpt]!.zone === "graveyard");
  expect(after.objects[divination]!.zone).toBe("graveyard");
  expect(after.objects[jace]!.zone).toBe("hand");
  const token = after.battlefield.map((id) => after.objects[id]!).find((o) => o.isToken && o.controller === 0);
  expect(token?.counters.loyalty).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Theorist's Sanctum: play it untapped by beholding Jace Beleren from your hand", async ({ page }) => {
  const s = scene({ hand: ["Theorist's Sanctum", "Jace Beleren"] });
  const land = one(s, "Theorist's Sanctum");
  await open(page, s);
  await card(page, "Theorist's Sanctum", s).click();
  await expect(menu(page).getByRole("button", { name: "Play it tapped" })).toBeVisible();
  await menu(page).getByRole("button", { name: "Play it untapped (behold a Jace)" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.objects[land]!.zone === "battlefield");
  expect(after.objects[land]!.tapped).toBe(false);
  expect(pageErrors(page)).toEqual([]);
});

test("Counterlash: counter your own Divination, then cast Sign in Blood (a sorcery too) for free, not Shock", async ({ page }) => {
  // Your Divination is on the stack; Counterlash counters it, then offers Sign in Blood (a sorcery), not Shock.
  let s = scene({ hand: ["Divination", "Counterlash", "Sign in Blood", "Shock"], board: ["Island", "Island", "Island", "Island", "Island", "Island", "Island", "Island", "Island"] });
  const [divination, lash, sign] = [one(s, "Divination"), one(s, "Counterlash"), one(s, "Sign in Blood")];
  for (const a of planCast(s, 0, divination)!) s = applyAction(s, a);
  await open(page, s);
  await card(page, "Counterlash", s).click();
  const top = (await state(page)).stack[0]!.id;
  await page.locator(`[data-stack="${top}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.player === 0);
  const ctl = controls(page);
  await expect(ctl).toContainText("cast a spell that shares a card type with it from your hand without paying its mana cost?");
  await expect(ctl.getByRole("button", { name: "Shock" })).toHaveCount(0);
  await ctl.getByRole("button", { name: "Sign in Blood" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree");
  await ctl.getByRole("button", { name: "Cast it" }).click();
  await clickPlayer(page, 0);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[sign]!.zone === "graveyard");
  expect(after.objects[divination]!.zone).toBe("graveyard");
  expect(after.objects[lash]!.zone).toBe("graveyard");
  expect(after.players[0]!.life).toBe(38);
  expect(pageErrors(page)).toEqual([]);
});
