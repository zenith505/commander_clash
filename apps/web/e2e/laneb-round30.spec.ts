// Lane B round 30 in the browser: Assembly Hall's "Reveal a creature card in your hand" must reveal one when there is
// one (the picker offers only creature cards and can't reveal none), then the search offers only the cards with that
// name (CR 201.2); Doubling Chant's search finds one creature card for each creature you control, by name.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, menu, modal, resolveUntil } from "./ui";

test("Assembly Hall: reveal Grizzly Bears, find the other Grizzly Bears", async ({ page }) => {
  const s = scene({ hand: ["Grizzly Bears", "Shock"], board: [...LANDS, "Assembly Hall"], library: ["Grizzly Bears", "Llanowar Elves"] });
  const hall = one(s, "Assembly Hall");
  const [inHand, inLibrary] = [idsOf(s, "Grizzly Bears", "hand")[0]!, idsOf(s, "Grizzly Bears", "library")[0]!];
  const [shock, elves] = [one(s, "Shock"), one(s, "Llanowar Elves")];
  await open(page, s);
  await page.locator(`[data-obj="${hall}"]`).click();
  await menu(page).getByRole("button", { name: /Reveal a creature card in your hand/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && !!st.pending.fromHand);
  const reveal = modal(page);
  await expect(reveal).toContainText("Assembly Hall: reveal a creature card from your hand");
  await expect(reveal.locator(`[data-pick="${shock}"]`)).toHaveCount(0);
  await expect(reveal.getByRole("button", { name: "Reveal none" })).toBeDisabled();
  await reveal.locator(`[data-pick="${inHand}"]`).click();
  await reveal.getByRole("button", { name: "Reveal", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && !st.pending.fromHand);
  const find = modal(page);
  await expect(find).toContainText("Assembly Hall: search your library for");
  await expect(find).toContainText("Grizzly Bears");
  await expect(find.locator(`[data-pick="${elves}"]`)).toHaveCount(0);
  await find.locator(`[data-pick="${inLibrary}"]`).click();
  await find.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[inLibrary]!.zone === "hand");
  expect(after.objects[inHand]!.zone).toBe("hand");
  expect(after.objects[elves]!.zone).toBe("library");
  expect(pageErrors(page)).toEqual([]);
});

test("Doubling Chant: one Grizzly Bears and one Llanowar Elves onto the battlefield", async ({ page }) => {
  const s = scene({ hand: ["Doubling Chant"], board: [...LANDS, "Grizzly Bears", "Llanowar Elves"], library: ["Grizzly Bears", "Llanowar Elves", "Shock"] });
  const [bears, elves] = [idsOf(s, "Grizzly Bears", "library")[0]!, idsOf(s, "Llanowar Elves", "library")[0]!];
  const shock = one(s, "Shock");
  await open(page, s);
  await card(page, "Doubling Chant", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const find = modal(page);
  await expect(find).toContainText("Doubling Chant: search your library for up to one creature card for each of these names: Grizzly Bears, Llanowar Elves");
  await expect(find).toContainText("Found 0 of 2: one for each of creature card named Grizzly Bears and creature card named Llanowar Elves.");
  await expect(find.locator(`[data-pick="${shock}"]`)).toHaveCount(0);
  await find.locator(`[data-pick="${bears}"]`).click();
  await find.locator(`[data-pick="${elves}"]`).click();
  await find.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[elves]!.zone === "battlefield");
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(after.objects[shock]!.zone).toBe("library");
  expect(pageErrors(page)).toEqual([]);
});
