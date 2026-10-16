// "You may cast any number of spells with mana value X or less from among them without paying their mana costs"
// (Villainous Wealth): a button for each card that can be cast now, one at a time, and Done to stop.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, resolveUntil } from "./ui";

test("Villainous Wealth: cast spells from among an opponent's exiled cards, then stop", async ({ page }) => {
  const s = scene({ hand: ["Villainous Wealth"], board: LANDS }, [{ library: ["Grizzly Bears", "Hill Giant", "Llanowar Elves"] }]);
  const [bears, giant, elves] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Llanowar Elves")];
  await open(page, s);
  await card(page, "Villainous Wealth", s).click();
  const x = page.locator(".x-pick");
  await x.getByLabel("X", { exact: true }).fill("3");
  await x.getByRole("button", { name: "X = 3" }).click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong");
  const bar = controls(page);
  await expect(bar).toContainText("cast a spell from among the exiled cards without paying its mana cost?");
  // Hill Giant's mana value is 4, more than X.
  await expect(bar.getByRole("button", { name: "Hill Giant" })).toHaveCount(0);
  await bar.getByRole("button", { name: "Grizzly Bears" }).click();
  await bar.getByRole("button", { name: "Cast it" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong" && !st.pending.options.includes(bears));
  await expect(bar.getByRole("button", { name: "Llanowar Elves" })).toBeVisible();
  await bar.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[bears]!.zone === "battlefield");
  expect(after.objects[bears]!.controller).toBe(0);
  expect([giant, elves].map((id) => after.objects[id]!.zone)).toEqual(["exile", "exile"]);
  expect(pageErrors(page)).toEqual([]);
});
