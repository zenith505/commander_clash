// Ward costs that aren't mana: sacrifice a creature (Vein Ripper), pay life equal to its power (Phyrexian Fleshgorger),
// and mana plus life together (Gisa, the Hellraiser).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("ward—sacrifice a creature: Pay, then click the creature to sacrifice, and the spell resolves", async ({ page }) => {
  const s = scene({ hand: ["Shock"], board: [...LANDS, "Grizzly Bears", "Hill Giant"] }, [{ board: ["Vein Ripper"] }]);
  const [ripper, bears, giant] = [one(s, "Vein Ripper"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Shock", s).click();
  await page.locator(`[data-obj="${ripper}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "payUnless");
  await expect(controls(page)).toContainText("sacrifice a creature or Shock is countered");
  await controls(page).getByRole("button", { name: "Pay", exact: true }).click();
  await expect(controls(page)).toContainText("click a creature of yours to sacrifice");
  await page.locator(`[data-obj="${bears}"]`).click();
  await controls(page).getByRole("button", { name: "Sacrifice" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.objects[giant]!.zone).toBe("battlefield");
  expect(after.objects[ripper]!.damage).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});

test("ward—pay life equal to its power: the prompt names the life, and paying it lets the spell resolve", async ({ page }) => {
  const s = scene({ hand: ["Murder"], board: LANDS }, [{ board: ["Phyrexian Fleshgorger"] }]);
  const gorger = one(s, "Phyrexian Fleshgorger");
  await open(page, s);
  await card(page, "Murder", s).click();
  await page.locator(`[data-obj="${gorger}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "payUnless");
  await expect(controls(page)).toContainText("pay 7 life or Murder is countered");
  await controls(page).getByRole("button", { name: "Pay", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.players[0]!.life).toBe(33);
  expect(after.objects[gorger]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("ward—{2}, pay 2 life: one Pay button takes both", async ({ page }) => {
  const s = scene({ hand: ["Murder"], board: LANDS }, [{ board: ["Gisa, the Hellraiser"] }]);
  const gisa = one(s, "Gisa, the Hellraiser");
  await open(page, s);
  await card(page, "Murder", s).click();
  await page.locator(`[data-obj="${gisa}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "payUnless");
  await expect(controls(page)).toContainText("and 2 life or Murder is countered");
  await controls(page).getByRole("button", { name: "Pay", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.players[0]!.life).toBe(38);
  expect(after.objects[gisa]!.zone).toBe("graveyard");
  // {1}{B}{B} for Murder and {2} for ward.
  expect((await state(page)).battlefield.filter((id) => after.objects[id]!.tapped && after.objects[id]!.controller === 0)).toHaveLength(5);
  expect(pageErrors(page)).toEqual([]);
});
