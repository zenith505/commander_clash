// Jester's Scepter: "{2}, {T}, Put a card exiled with this artifact into its owner's graveyard: Counter target spell if it
// has the same name as that card." Its menu entry, the spell on the stack as the target, then a picker of the cards
// exiled with it (you may look at them) for the cost (CR 607.2a).
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene, state } from "./scene";
import { card, menu, modal, resolveUntil } from "./ui";

test("Jester's Scepter: pick the exiled Divination to counter Divination", async ({ page }) => {
  const s = scene({ hand: ["Divination"], board: [...LANDS, "Jester's Scepter"], exile: ["Divination", "Grizzly Bears"] });
  const scepter = one(s, "Jester's Scepter");
  const [inHand, exiled] = [idsOf(s, "Divination", "hand")[0]!, idsOf(s, "Divination", "exile")[0]!];
  const bears = one(s, "Grizzly Bears");
  for (const id of [exiled, bears]) s.objects[id]!.hiddenExile = { by: scepter, seen: [0], label: "Face down" };
  s.linkedExile = { [`${scepter}@0`]: [{ id: exiled, zc: 0 }, { id: bears, zc: 0 }] };
  await open(page, s);
  await card(page, "Divination", s).click();
  await expect.poll(async () => (await state(page)).stack.length).toBe(1);
  await page.locator(`[data-obj="${scepter}"]`).click();
  await menu(page).getByRole("button", { name: /Counter target spell if it has the same name as that card/ }).click();
  const top = (await state(page)).stack[0]!.id;
  await page.locator(`[data-stack="${top}"]`).click();
  const pick = modal(page);
  await expect(pick).toContainText("put a card exiled with Jester's Scepter into its owner's graveyard");
  await expect(pick.locator(`[data-pick="${bears}"]`)).toBeVisible();
  await pick.locator(`[data-pick="${exiled}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[inHand]!.zone === "graveyard");
  expect(after.objects[exiled]!.zone).toBe("graveyard");
  expect(after.objects[bears]!.zone).toBe("exile");
  expect(after.log.some((l) => / counters? /.test(l.text) && l.text.includes("Divination"))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
