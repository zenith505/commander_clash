// Lane B round B140 in the browser: Circling Vultures' Discard button (a special action any time you could cast an
// instant, CR 116.2e) and Sword of the Ages' "sacrifice this artifact and any number of creatures you control" (how many
// is chosen like an X, then you click them).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, menu, resolveUntil } from "./ui";

test("Circling Vultures: Discard it from your hand; it goes to your graveyard without using the stack", async ({ page }) => {
  const s = scene({ hand: ["Circling Vultures"], board: LANDS });
  const vultures = one(s, "Circling Vultures");
  await open(page, s);
  await card(page, "Circling Vultures", s).click();
  const discard = menu(page).getByRole("button", { name: "Discard", exact: true });
  await expect(discard).toBeEnabled();
  await discard.click();
  const after = await resolveUntil(page, (st) => st.objects[vultures]!.zone === "graveyard");
  expect(after.stack).toHaveLength(0);
  expect(after.players[0]!.hand).toHaveLength(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Sword of the Ages: X = 2, click Grizzly Bears and Hill Giant, 5 damage to Ana, then the Sword and both cards exiled", async ({ page }) => {
  const s = scene({ board: ["Sword of the Ages", "Grizzly Bears", "Hill Giant", "Wind Drake", ...LANDS] });
  const [sword, bears, giant, drake] = [one(s, "Sword of the Ages"), one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Wind Drake")];
  await open(page, s);
  await page.locator(`[data-obj="${sword}"]`).first().click();
  await menu(page).getByRole("button", { name: /Sacrifice Sword of the Ages and any number of creatures/ }).click();
  const x = page.locator(".x-pick");
  await expect(x).toContainText("sacrifice X creatures");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  await clickPlayer(page, 1);
  const costBar = page.locator(".targeting");
  await expect(costBar).toContainText("Sword of the Ages: sacrifice");
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await costBar.getByRole("button", { name: /^Sacrifice/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[sword]!.zone === "exile");
  expect(after.players[1]!.life).toBe(35);
  expect(after.objects[bears]!.zone).toBe("exile");
  expect(after.objects[giant]!.zone).toBe("exile");
  expect(after.objects[drake]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
