// Round 451 in the browser: Ulalek, Fused Atrocity. Two Prodigal Sorcerers' abilities (at Ana and at Cy) and Lightning
// Bolt (at Ana) on the stack, then Dimensional Infiltrator (an Eldrazi spell, with flash): Ulalek's trigger asks to pay
// {C}{C} (Wastes), then which spell the next copy is of (the Infiltrator first), Bolt's copy gets a new target (Ben), then
// which Sorcerer ability is copied next, each ability's copy keeping its target. Ana takes 5, Ben 3, Cy 2, and a token
// Infiltrator enters.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene, state } from "./scene";
import { card, clickPlayer, controls, menu, resolveUntil } from "./ui";

test("Ulalek: pay {C}{C}, order the spells' copies, aim Bolt's copy anew, then order the abilities' copies", async ({ page }) => {
  const s = scene({ hand: ["Lightning Bolt", "Dimensional Infiltrator"], board: [...LANDS, "Ulalek, Fused Atrocity", "Prodigal Sorcerer", "Prodigal Sorcerer", "Wastes", "Wastes", "Wastes"] });
  const [bolt, inf] = [one(s, "Lightning Bolt"), one(s, "Dimensional Infiltrator")];
  const stack = async () => (await state(page)).stack.length;
  await open(page, s);
  // I hold priority after each (CR 117.3c).
  await card(page, "Prodigal Sorcerer", s, 0).click();
  await menu(page).locator("button", { hasText: "deals 1 damage to any target" }).click();
  await clickPlayer(page, 1);
  await expect.poll(stack).toBe(1);
  await card(page, "Prodigal Sorcerer", s, 1).click();
  await menu(page).locator("button", { hasText: "deals 1 damage to any target" }).click();
  await clickPlayer(page, 3);
  await expect.poll(stack).toBe(2);
  await card(page, "Lightning Bolt", s).click();
  await clickPlayer(page, 1);
  await expect.poll(stack).toBe(3);
  await card(page, "Dimensional Infiltrator", s).click();
  const bar = controls(page);
  const ask = await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.source === "Ulalek, Fused Atrocity");
  const life = [1, 2, 3].map((p) => ask.players[p]!.life);
  await expect(bar).toContainText(". If you do, copy all spells you control, then copy all other activated and triggered abilities you control?");
  await bar.getByRole("button", { name: "Pay", exact: true }).click();
  const order = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "copyNextOf");
  const items = order.stack.map((i) => i.id);
  expect(order.pending?.kind === "chooseOption" && order.pending.options).toEqual([items[2], items[3]]);
  await expect(bar).toContainText("choose the spell the next copy is of (copies put on the stack later resolve first)");
  await bar.getByRole("button", { name: /^Dimensional Infiltrator/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "copyTargets" && st.pending.copyOf === "Lightning Bolt");
  await clickPlayer(page, 2);
  // The two Sorcerer abilities: which is copied first. The second one's (at Cy) first, so the first one's ends on top.
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "copyNextOf");
  await expect(bar).toContainText("choose the ability the next copy is of (copies put on the stack later resolve first)");
  await bar.getByRole("button", { name: /^Prodigal Sorcerer.*#2/ }).click();
  for (let i = 0; i < 2; i++) {
    await resolveUntil(page, (st) => st.pending?.kind === "copyTargets" && st.stack.length === 6 + i);
    await page.locator(".targeting").getByRole("button", { name: /^Keep target/ }).click();
  }
  const full = await resolveUntil(page, (st) => st.stack.length === 8 && !st.pending);
  const copies = full.stack.slice(6).map((i) => i.targets?.[0]);
  expect(copies).toEqual([{ kind: "player", id: 3 }, { kind: "player", id: 1 }]);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending, 80);
  expect([1, 2, 3].map((p) => life[p - 1]! - after.players[p]!.life)).toEqual([5, 3, 2]);
  const infs = idsOf(after, "Dimensional Infiltrator", "battlefield", 0);
  expect(infs).toHaveLength(2);
  expect(infs.filter((id) => after.objects[id]!.isToken)).toHaveLength(1);
  expect(after.objects[bolt]!.zone).toBe("graveyard");
  expect(after.objects[inf]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
