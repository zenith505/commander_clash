// Choosing "a source of your choice" (CR 609.7a) for a prevention effect, as it resolves: Pay No Heed from your hand,
// and Circle of Protection: Red's ability, which offers only red sources.
import { expect, test } from "@playwright/test";
import { one, open, pageErrors, scene, state } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

test("Pay No Heed: pick the opponent's creature as the source", async ({ page }) => {
  const s = scene({ hand: ["Pay No Heed"], board: ["Plains", "Grizzly Bears"] }, [{ board: ["Gray Ogre"] }]);
  const [heed, ogre] = [one(s, "Pay No Heed"), one(s, "Gray Ogre")];
  await open(page, s);
  await card(page, "Pay No Heed", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption");
  const bar = controls(page);
  await expect(bar).toContainText("Pay No Heed: choose a source of damage");
  await expect(bar.getByRole("button", { name: "Grizzly Bears, You's" })).toBeVisible();
  await bar.getByRole("button", { name: "Gray Ogre, Ana's" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.objects[heed]!.zone === "graveyard");
  expect(after.damageRules?.[0]?.by?.chosen?.id).toBe(ogre);
  expect(after.log.some((e) => /You chooses Gray Ogre as the source for Pay No Heed/.test(e.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Circle of Protection: Red: only red sources are offered", async ({ page }) => {
  const s = scene({ board: ["Circle of Protection: Red", "Mountain", "Grizzly Bears"] }, [{ board: ["Gray Ogre"] }]);
  const [circle, ogre] = [one(s, "Circle of Protection: Red"), one(s, "Gray Ogre")];
  await open(page, s);
  await page.locator(`[data-obj="${circle}"]`).click();
  const item = menu(page).getByRole("button", { name: /red source of your choice/ });
  if (await item.count()) await item.click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption");
  const bar = controls(page);
  await expect(bar.getByRole("button")).toHaveCount(1);
  await bar.getByRole("button", { name: "Gray Ogre, Ana's" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && !!st.damageRules?.length);
  expect(after.damageRules![0]!.by?.chosen?.id).toBe(ogre);
  expect(after.damageRules![0]!.nextTime).toBe(true);
  expect(pageErrors(page)).toEqual([]);
  expect((await state(page)).players[0]!.life).toBe(40);
});
