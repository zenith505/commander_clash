// Lane B round B176 in the browser: Thelon of Havenwood's "Exile a Fungus card from a graveyard" cost (picked from any
// player's graveyard), Emrakul's Evangel's "Sacrifice this creature and any number of other non-Eldrazi creatures" (how many
// is chosen like an X, then you click them) and the outlast {G/W} Arcus Acolyte gives your other creatures.
import { expect, test } from "@playwright/test";
import { characteristics } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, menu, modal, resolveUntil } from "./ui";

test("Thelon of Havenwood: exile Ana's Thallid card from her graveyard, a spore counter on each Fungus", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Thelon of Havenwood", "Thallid"], yard: ["Grizzly Bears"] }, [{ board: ["Deathspore Thallid"], yard: ["Thallid"] }]);
  const thallids = s.battlefield.filter((id) => characteristics(s, s.objects[id]!).subtypes.includes("Fungus"));
  const theirCard = s.players[1]!.graveyard.find((id) => characteristics(s, s.objects[id]!).name === "Thallid")!;
  const bears = one(s, "Grizzly Bears");
  await open(page, s);
  await card(page, "Thelon of Havenwood", s).click();
  await menu(page).locator("button", { hasText: "Exile a Fungus card from a graveyard" }).click();
  const pick = modal(page);
  await expect(pick).toContainText("exile 1 Fungus card");
  await expect(pick.locator(`[data-pick="${theirCard}"]`)).toContainText("Ana's graveyard");
  await expect(pick.locator(`[data-pick="${bears}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${theirCard}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[theirCard]!.zone === "exile");
  expect(thallids.length).toBe(2);
  for (const id of thallids) expect(after.objects[id]!.counters.spore).toBe(1);
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Emrakul's Evangel: X = 1, click Grizzly Bears, two Eldrazi Horror tokens; Hill Giant stays", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Emrakul's Evangel", "Grizzly Bears", "Hill Giant"] });
  const [evangel, bears, giant] = [one(s, "Emrakul's Evangel"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await page.locator(`[data-obj="${evangel}"]`).first().click();
  await menu(page).getByRole("button", { name: /Sacrifice Emrakul's Evangel and any number of other non-Eldrazi creatures/ }).click();
  const x = page.locator(".x-pick");
  await expect(x).toContainText("sacrifice X non-Eldrazi creatures");
  await x.getByLabel("X", { exact: true }).fill("1");
  await x.getByRole("button", { name: "X = 1" }).click();
  const costBar = page.locator(".targeting");
  await expect(costBar).toContainText("Emrakul's Evangel: sacrifice");
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await costBar.getByRole("button", { name: /^Sacrifice/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.battlefield.some((id) => characteristics(st, st.objects[id]!).name === "Eldrazi Horror Token"));
  expect(after.battlefield.filter((id) => characteristics(after, after.objects[id]!).name === "Eldrazi Horror Token")).toHaveLength(2);
  expect(after.objects[evangel]!.zone).toBe("graveyard");
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.objects[giant]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Arcus Acolyte: Grizzly Bears has Outlast {G/W}; clicking it taps the Bears and puts a +1/+1 counter on them", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Arcus Acolyte", "Grizzly Bears"] });
  const bears = one(s, "Grizzly Bears");
  await open(page, s);
  await page.locator(`[data-obj="${bears}"]`).first().click();
  const outlast = menu(page).getByRole("button", { name: /^Outlast/ });
  await expect(outlast).toContainText("Outlast");
  await outlast.click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && (st.objects[bears]!.counters["+1/+1"] ?? 0) === 1);
  expect(after.objects[bears]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
