// Alternative costs that aren't mana (CR 118.9): Force of Will's card exiled from your hand, Daze's Island returned to
// your hand, Orim's Cure's creature tapped. Each is cast from the card's menu, "Cast it: <cost>".
import { expect, test } from "@playwright/test";
import { idsOf, one, open, pageErrors, scene, state } from "./scene";
import { card, clickPlayer, controls, menu, modal, resolveUntil } from "./ui";

test("Force of Will: pay 1 life and exile a blue card from your hand, then counter a spell", async ({ page }) => {
  const s = scene({ hand: ["Divination", "Force of Will", "Opt", "Shock"], board: ["Island", "Island", "Island"] });
  const [divination, fow, opt, shock] = [one(s, "Divination"), one(s, "Force of Will"), one(s, "Opt"), one(s, "Shock")];
  await open(page, s);
  await card(page, "Divination", s).click();
  await expect.poll(async () => (await state(page)).stack.length).toBe(1);
  await card(page, "Force of Will", s).click();
  await menu(page).getByRole("button", { name: "Cast it: pay 1 life and exile a blue card from your hand" }).click();
  // The target first (CR 601.2c), then the cost (601.2h).
  const top = (await state(page)).stack[0]!.id;
  await page.locator(`[data-stack="${top}"]`).click();
  const pick = modal(page);
  await expect(pick).toContainText("Force of Will: exile from your hand a blue card");
  // Only another blue card: not Force of Will itself, not Shock.
  await expect(pick.locator(`[data-pick="${shock}"]`)).toHaveCount(0);
  await expect(pick.locator(`[data-pick="${fow}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${opt}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[fow]!.zone === "graveyard");
  expect(after.objects[divination]!.zone).toBe("graveyard");
  expect(after.objects[opt]!.zone).toBe("exile");
  expect(after.players[0]!.life).toBe(39);
  expect(pageErrors(page)).toEqual([]);
});

test("Daze: return an Island you control to your hand, clicked on the battlefield", async ({ page }) => {
  const s = scene({ hand: ["Divination", "Daze"], board: ["Island", "Island", "Island", "Island"] });
  const [divination, daze] = [one(s, "Divination"), one(s, "Daze")];
  await open(page, s);
  await card(page, "Divination", s).click();
  await expect.poll(async () => (await state(page)).stack.length).toBe(1);
  await card(page, "Daze", s).click();
  await menu(page).getByRole("button", { name: "Cast it: return an Island you control to its owner's hand" }).click();
  const top = (await state(page)).stack[0]!.id;
  await page.locator(`[data-stack="${top}"]`).click();
  const bar = page.locator(".targeting", { hasText: "Island" });
  await expect(bar.getByRole("button", { name: "Return and cast" })).toBeDisabled();
  const st = await state(page);
  const back = idsOf(s, "Island", "battlefield", 0).find((id) => !st.objects[id]!.tapped)!;
  await page.locator(`[data-obj="${back}"]`).click();
  await bar.getByRole("button", { name: "Return and cast" }).click();
  // The untapped Island is back in your hand: you can't pay {1} for Divination, and it's countered.
  await resolveUntil(page, (x) => x.pending?.kind === "payUnless");
  await expect(controls(page).getByRole("button", { name: "Pay", exact: true })).toBeDisabled();
  await controls(page).getByRole("button", { name: "Don't pay" }).click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && x.objects[daze]!.zone === "graveyard");
  expect(after.objects[back]!.zone).toBe("hand");
  expect(after.objects[divination]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Orim's Cure: tap an untapped creature you control instead of paying {1}{W}", async ({ page }) => {
  const s = scene({ hand: ["Orim's Cure"], board: ["Plains", "Grizzly Bears", "Llanowar Elves"] });
  const [cure, bears, elves] = [one(s, "Orim's Cure"), one(s, "Grizzly Bears"), one(s, "Llanowar Elves")];
  await open(page, s);
  await card(page, "Orim's Cure", s).click();
  await menu(page).getByRole("button", { name: "Cast it: tap an untapped creature you control" }).click();
  await clickPlayer(page, 0);
  const bar = page.locator(".targeting", { hasText: "tap" });
  await expect(bar.getByRole("button", { name: "Tap and cast" })).toBeDisabled();
  await page.locator(`[data-obj="${bears}"]`).click();
  await bar.getByRole("button", { name: "Tap and cast" }).click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && x.objects[cure]!.zone === "graveyard");
  expect(after.objects[bears]!.tapped).toBe(true);
  expect(after.objects[elves]!.tapped).toBe(false);
  expect(after.objects[one(s, "Plains")]!.tapped).toBe(false);
  expect(pageErrors(page)).toEqual([]);
});
