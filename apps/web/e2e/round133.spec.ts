// Round 133's prompts: Sower of Discord's two players chosen as it enters, one after the other; Aang, Swift Savior's
// enters trigger targeting a spell on the stack (airbend); Inspirit, Flagship Vessel's "your choice of a +1/+1 counter or
// two charge counters".
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Sower of Discord: choose Ana, then Ben, who isn't Ana", async ({ page }) => {
  const s = scene({ hand: ["Sower of Discord"], board: LANDS });
  const sower = one(s, "Sower of Discord");
  await open(page, s);
  await card(page, "Sower of Discord", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "player");
  const bar = controls(page);
  await expect(bar).toContainText("Sower of Discord: choose two players: the first");
  for (const name of ["You (you)", "Ana", "Ben", "Cy"]) await expect(bar.getByRole("button", { name, exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "Ana", exact: true }).click();
  await expect(bar).toContainText("Sower of Discord: choose the second of two players");
  await expect(bar.getByRole("button", { name: "Ana", exact: true })).toHaveCount(0);
  await bar.getByRole("button", { name: "Ben", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.objects[sower]?.zone === "battlefield");
  expect(after.objects[sower]!.chosen?.players).toEqual([1, 2]);
  expect(pageErrors(page)).toEqual([]);
});

test("Aang, Swift Savior: flashed in, he airbends our own Divination off the stack", async ({ page }) => {
  const s = scene({ hand: ["Divination", "Aang, Swift Savior // Aang and La, Ocean's Fury"], board: LANDS });
  const [div, aang] = [one(s, "Divination"), one(s, "Aang, Swift Savior")];
  await open(page, s);
  await card(page, "Divination", s).click();
  await expect.poll(async () => (await state(page)).stack.length).toBe(1);
  await card(page, "Aang, Swift Savior", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.objects[aang]!.zone === "battlefield");
  const item = (await state(page)).stack.find((x) => x.objectId === div)!.id;
  await page.locator(`[data-stack="${item}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[div]!.zone).toBe("exile");
  expect(after.objects[div]!.mayPlay).toMatchObject({ player: 0, cost: "{2}" });
  expect(pageErrors(page)).toEqual([]);
});

test("Inspirit, Flagship Vessel: two charge counters on Sol Ring at the beginning of combat", async ({ page }) => {
  const s = scene({ board: ["Inspirit, Flagship Vessel", "Sol Ring"] });
  const [inspirit, ring] = [one(s, "Inspirit, Flagship Vessel"), one(s, "Sol Ring")];
  s.objects[inspirit]!.counters.charge = 1;
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets");
  await page.locator(`[data-obj="${ring}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "either");
  const bar = controls(page);
  await expect(bar).toContainText("Inspirit, Flagship Vessel");
  await expect(bar.getByRole("button", { name: "Put a +1/+1 counter" })).toBeVisible();
  await bar.getByRole("button", { name: "Put two charge counters" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[ring]!.counters).toEqual({ charge: 2 });
  expect(pageErrors(page)).toEqual([]);
});
