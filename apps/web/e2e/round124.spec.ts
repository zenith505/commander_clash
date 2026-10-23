// Round 124's prompts: ward—waterbend asks the targeting player to pay, and the Pay button taps their artifacts and
// creatures for what their mana can't pay (CR 701.67a).
import { expect, test } from "@playwright/test";
import { one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("The Unagi of Kyoshi Island: Lightning Bolt at it, ward—waterbend {4} paid by tapping four creatures", async ({ page }) => {
  const s = scene({ hand: ["Lightning Bolt"], board: ["Mountain", "Grizzly Bears", "Grizzly Bears", "Grizzly Bears", "Grizzly Bears"] }, [{ board: ["The Unagi of Kyoshi Island"] }]);
  const unagi = one(s, "The Unagi of Kyoshi Island");
  await open(page, s);
  await card(page, "Lightning Bolt", s).click();
  await card(page, "The Unagi of Kyoshi Island", s, 0, 1).click();
  await resolveUntil(page, (st) => st.pending?.kind === "payUnless");
  const bar = controls(page);
  await expect(bar).toContainText("waterbend: your artifacts and creatures can each pay {1} of up to 4");
  await bar.getByRole("button", { name: "Pay, tapping 4 artifacts or creatures", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[unagi]!.damage).toBe(3);
  expect(after.battlefield.filter((id) => after.cards[after.objects[id]!.cardId]!.name === "Grizzly Bears").every((id) => after.objects[id]!.tapped)).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
