// Round 438: Falco Spara, Pactweaver (cast the top card of your library, removing a counter from a creature you control:
// the counter picker) and Dawnhand Dissident (exile a creature card from your graveyard, blighting 2, then cast it from
// exile, removing three counters from among creatures you control).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, menu, modal, resolveUntil, seat } from "./ui";

test("Falco Spara: cast Hill Giant from the top of your library, removing Falco's shield counter", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Falco Spara, Pactweaver"], library: ["Hill Giant"] });
  const [falco, giant] = [one(s, "Falco Spara, Pactweaver"), one(s, "Hill Giant")];
  s.objects[falco]!.counters.shield = 1;
  await open(page, s);
  const library = seat(page, 0).locator(".zone", { hasText: "Library" });
  await library.locator(`[data-obj="${giant}"]`).click();
  const pick = page.locator(".counter-pick");
  await expect(pick).toContainText("Hill Giant: remove 1 counter from among creatures you control");
  await expect(pick).toContainText("0 of 1 chosen");
  await pick.locator(`[data-counter="${falco}:shield"]`).getByRole("button", { name: "+" }).click();
  await expect(pick).toContainText("1 of 1 chosen");
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "battlefield");
  expect(after.objects[falco]!.counters.shield ?? 0).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Dawnhand Dissident: blight 2 to exile Hill Giant from your graveyard, then cast it removing three counters", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Dawnhand Dissident", "Craw Wurm", "Grizzly Bears"], yard: ["Hill Giant"] });
  const [dissident, wurm, bears, giant] = [one(s, "Dawnhand Dissident"), one(s, "Craw Wurm"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  s.objects[bears]!.counters["+1/+1"] = 2;
  await open(page, s);
  await card(page, "Dawnhand Dissident", s).click();
  await menu(page).getByRole("button", { name: /Exile target card from a graveyard/ }).click();
  await modal(page).locator(`[data-pick="${giant}"]`).click();
  const bar = page.locator(".targeting", { hasText: "blight 2" });
  await page.locator(`[data-obj="${wurm}"]`).click();
  await bar.getByRole("button", { name: "Blight and activate" }).click();
  const exiled = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "exile");
  expect(exiled.objects[wurm]!.counters["-1/-1"]).toBe(2);
  expect(exiled.objects[dissident]!.tapped).toBe(true);
  const exile = seat(page, 0).locator(".zone", { hasText: "Exile" });
  await expect(exile.locator(".zone-title")).toHaveText("Exile ✦");
  await exile.click();
  await modal(page).locator(".card.playable", { hasText: "Hill Giant" }).click();
  const item = menu(page).getByRole("button", { name: /^Cast/ });
  if (await item.count()) await item.first().click();
  const pick = page.locator(".counter-pick");
  await expect(pick).toContainText("Hill Giant: remove 3 counters from among creatures you control");
  for (let i = 0; i < 2; i++) await pick.locator(`[data-counter="${wurm}:-1/-1"]`).getByRole("button", { name: "+" }).click();
  await pick.locator(`[data-counter="${bears}:+1/+1"]`).getByRole("button", { name: "+" }).click();
  await expect(pick).toContainText("3 of 3 chosen");
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "battlefield");
  expect(after.objects[wurm]!.counters["-1/-1"] ?? 0).toBe(0);
  expect(after.objects[bears]!.counters["+1/+1"]).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});
