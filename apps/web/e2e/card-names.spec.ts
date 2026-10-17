// Choosing a card name (CR 201.4): a picker with the cards you've seen and a search box. Pithing Needle names one as it
// enters; Memoricide names one as it resolves, then you search the target's graveyard, hand and library for them.
import { expect, test } from "@playwright/test";
import { idsOf, LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, modal, resolveUntil } from "./ui";

test("Pithing Needle: name a card you've seen on an opponent's battlefield", async ({ page }) => {
  const s = scene({ hand: ["Pithing Needle"], board: LANDS }, [{ board: ["Mind Stone"] }]);
  const needle = one(s, "Pithing Needle");
  await open(page, s);
  await card(page, "Pithing Needle", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "cardName");
  const pick = modal(page);
  await expect(pick).toContainText("Pithing Needle: choose a card name");
  await expect(pick.locator('[data-name="Mind Stone"]')).toContainText("battlefield");
  await pick.locator('[data-name="Mind Stone"]').click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0);
  expect(after.objects[needle]!.chosen?.name).toBe("Mind Stone");
  expect(pageErrors(page)).toEqual([]);
});

test("Memoricide: type the name, then exile the ones you find in the target's hand and library", async ({ page }) => {
  const s = scene({ hand: ["Memoricide"], board: LANDS }, [{ hand: ["Lightning Bolt"], yard: ["Lightning Bolt"], library: ["Lightning Bolt"] }]);
  const [yard, hand, lib] = (["graveyard", "hand", "library"] as const).map((z) => idsOf(s, "Lightning Bolt", z, 1)[0]!) as [string, string, string];
  await open(page, s);
  await card(page, "Memoricide", s).click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "cardName");
  const pick = modal(page);
  await expect(pick).toContainText("Memoricide: choose a nonland card name");
  await pick.locator("input").fill("bolt");
  await pick.locator('[data-name="Lightning Bolt"]').click();
  const search = modal(page);
  await expect(search).toContainText("search Ana's graveyard, hand and library for cards named Lightning Bolt to exile");
  await search.locator(`[data-pick="${hand}"]`).click();
  await search.locator(`[data-pick="${lib}"]`).click();
  await search.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0);
  expect([yard, hand, lib].map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "exile", "exile"]);
  expect(pageErrors(page)).toEqual([]);
});
