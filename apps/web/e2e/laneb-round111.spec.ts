// Lane B round B111 in the browser: Glittering Lion's "{3}: Until end of turn, Glittering Lion loses 'Prevent all damage
// that would be dealt to Glittering Lion.' Any player may activate this ability." You activate it on Ana's Lion from its
// menu, then your Shock kills it.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, menu, resolveUntil } from "./ui";

test("Glittering Lion: you activate Ana's Lion's ability, it loses its prevention, and your Shock kills it", async ({ page }) => {
  const s = scene({ hand: ["Shock"], board: LANDS }, [{ board: ["Glittering Lion"] }]);
  const lion = one(s, "Glittering Lion");
  await open(page, s);
  await card(page, "Glittering Lion", s).click();
  await expect(menu(page)).toContainText("Glittering Lion");
  await menu(page).getByRole("button", { name: /Until end of turn, Glittering Lion loses/ }).click();
  const mid = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && JSON.stringify(st.effects).includes('"loseStatic"'));
  expect(mid.objects[lion]!.zone).toBe("battlefield");
  await card(page, "Shock", mid).click();
  await expect(page.locator(".targeting")).toBeVisible();
  await card(page, "Glittering Lion", mid).click();
  const after = await resolveUntil(page, (st) => st.objects[lion]!.zone === "graveyard");
  expect(after.objects[lion]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
