// Round 146's prompts: Invoke Calamity casts up to two instants and sorceries from your hand and graveyard for free,
// one at a time, each button naming the card's zone; Afterlife from the Loam targets up to one creature card in each
// player's graveyard.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, modal, resolveUntil } from "./ui";

test("Invoke Calamity: cast Divination from your graveyard, then Lightning Bolt from your hand; both are exiled", async ({ page }) => {
  const s = scene({ hand: ["Invoke Calamity", "Lightning Bolt", "Concentrate"], board: [...LANDS, "Mountain", "Mountain"], yard: ["Divination"] });
  const [bolt, concentrate, divination] = [one(s, "Lightning Bolt"), one(s, "Concentrate"), one(s, "Divination")];
  await open(page, s);
  await card(page, "Invoke Calamity", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong");
  const bar = controls(page);
  await expect(bar).toContainText("cast a spell from your hand or graveyard without paying its mana cost");
  await expect(bar.getByRole("button", { name: "Concentrate (hand)" })).toBeVisible();
  await bar.getByRole("button", { name: "Divination (graveyard)" }).click();
  await bar.getByRole("button", { name: "Cast it" }).click();
  // Divination's mana value 3 leaves 3: Concentrate's 4 is too much.
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong" && !st.pending.options.includes(divination));
  await expect(bar.getByRole("button", { name: "Concentrate (hand)" })).toHaveCount(0);
  await bar.getByRole("button", { name: "Lightning Bolt (hand)" }).click();
  await bar.getByRole("button", { name: "Cast it" }).click();
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bolt]!.zone === "exile" && st.objects[divination]!.zone === "exile");
  expect(after.players[1]!.life).toBe(37);
  expect(after.objects[concentrate]!.zone).toBe("hand");
  expect(after.objects[one(s, "Invoke Calamity")]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});

test("Afterlife from the Loam: Grizzly Bears from your graveyard and Hill Giant from Ana's enter under your control", async ({ page }) => {
  const s = scene({ hand: ["Afterlife from the Loam"], board: LANDS, yard: ["Grizzly Bears"] }, [{ yard: ["Hill Giant"] }]);
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Afterlife from the Loam", s).click();
  await modal(page).locator(`[data-pick="${bears}"]`).click();
  await modal(page).locator(`[data-pick="${giant}"]`).click();
  const panel = page.locator(".targeting", { hasText: "one for each player" });
  await expect(panel).toContainText("one for each player: You Grizzly Bears, Ana Hill Giant, Ben —, Cy —");
  await modal(page).getByRole("button", { name: "Done" }).click();
  // Delve could exile Grizzly Bears too (targets come before costs, CR 601.2c); exile nothing.
  await expect(modal(page)).toContainText("delve, exile up to 1 card from your graveyard");
  await modal(page).getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "battlefield");
  for (const id of [bears, giant]) {
    expect(after.objects[id]!.zone).toBe("battlefield");
    expect(after.objects[id]!.controller).toBe(0);
  }
  expect(pageErrors(page)).toEqual([]);
});
