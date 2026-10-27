// Round 185: Wand of the Worldsoul's "the next spell you cast this turn has convoke" brings up the convoke bar for a
// spell without convoke, and only for that one spell.
import { expect, test } from "@playwright/test";
import { one, open, pageErrors, scene } from "./scene";
import { card, menu, resolveUntil } from "./ui";

test("Wand of the Worldsoul: the next spell is cast by tapping a creature for convoke", async ({ page }) => {
  const s = scene({ hand: ["Llanowar Elves"], board: ["Wand of the Worldsoul", "Grizzly Bears"] });
  const [wand, bears, elves] = [one(s, "Wand of the Worldsoul"), one(s, "Grizzly Bears"), one(s, "Llanowar Elves")];
  await open(page, s);
  await card(page, "Wand of the Worldsoul", s).click();
  await menu(page).locator("button", { hasText: "convoke" }).click();
  await resolveUntil(page, (st) => st.stack.length === 0 && st.players[0]!.nextSpellConvoke === st.turn);
  await card(page, "Llanowar Elves", s).click();
  const bar = page.locator(".targeting", { hasText: "Convoke Llanowar Elves" });
  await expect(bar).toBeVisible();
  // With no mana to pay, the Bears are picked to tap already.
  await bar.getByRole("button", { name: "Cast, tapping 1" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[elves]!.zone === "battlefield");
  expect(after.objects[bears]!.tapped).toBe(true);
  expect(after.objects[wand]!.tapped).toBe(true);
  expect(after.players[0]!.nextSpellConvoke).toBeUndefined();
  expect(pageErrors(page)).toEqual([]);
});
