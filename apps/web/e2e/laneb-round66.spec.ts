// Lane B round 66 in the browser: Kentaro, the Smiling Cat's alternative cost. A Samurai spell is cast for generic
// mana equal to its mana value from its menu ("Cast it for"), paid with lands that can't pay its colored cost.
import { expect, test } from "@playwright/test";
import { one, open, pageErrors, scene } from "./scene";
import { card, menu, resolveUntil } from "./ui";

test("Kentaro, the Smiling Cat: cast Hand of Honor ({W}{W}) for {2} with an Island and a Mountain", async ({ page }) => {
  const s = scene({ hand: ["Hand of Honor"], board: ["Island", "Mountain", "Kentaro, the Smiling Cat"] });
  const hand = one(s, "Hand of Honor");
  await open(page, s);
  await card(page, "Hand of Honor", s).click();
  const alt = menu(page).locator("button", { hasText: "Cast it for" });
  await expect(alt).toBeEnabled();
  await alt.click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[hand]!.zone === "battlefield");
  const tapped = after.battlefield.filter((id) => after.objects[id]!.tapped).map((id) => after.cards[after.objects[id]!.cardId]!.name).sort();
  expect(tapped).toEqual(["Island", "Mountain"]);
  expect(pageErrors(page)).toEqual([]);
});
