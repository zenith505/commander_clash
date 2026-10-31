// Lane B round 62 in the browser: Ruthless Radrat's squad cost that isn't mana ("Squad—Exile four cards from your
// graveyard"): pay it twice, then pick the eight cards to exile; two token copies enter.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, modal, resolveUntil } from "./ui";

test("Ruthless Radrat: squad twice (a third time can't be paid), exile eight graveyard cards, two token copies", async ({ page }) => {
  const yard = ["Grizzly Bears", "Hill Giant", "Shock", "Llanowar Elves", "Grizzly Bears", "Hill Giant", "Shock", "Llanowar Elves", "Grizzly Bears"];
  const s = scene({ hand: ["Ruthless Radrat"], board: LANDS, yard });
  const radrat = one(s, "Ruthless Radrat");
  const cards = [...s.players[0]!.graveyard];
  await open(page, s);
  await card(page, "Ruthless Radrat", s).click();
  const bar = page.locator(".targeting", { hasText: "squad (exile four cards from your graveyard), how many times?" });
  await expect(bar).toBeVisible();
  await bar.getByRole("button", { name: "Kick one more time" }).click();
  await bar.getByRole("button", { name: "Kick one more time" }).click();
  // Nine cards: a third payment would need twelve.
  await expect(bar.getByRole("button", { name: "Kick one more time" })).toBeDisabled();
  await bar.getByRole("button", { name: "Pay 2 times" }).click();
  const pick = modal(page);
  await expect(pick).toContainText("exile from your graveyard 8 cards");
  for (const id of cards.slice(0, 8)) await pick.locator(`[data-pick="${id}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[radrat]!.zone === "battlefield" && st.battlefield.filter((id) => st.objects[id]!.isToken && st.cards[st.objects[id]!.cardId]!.name === "Ruthless Radrat").length === 2);
  for (const id of cards.slice(0, 8)) expect(after.objects[id]!.zone).toBe("exile");
  expect(after.objects[cards[8]!]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
