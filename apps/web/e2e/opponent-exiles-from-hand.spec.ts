// "Each player exiles two cards from their hand" (Mind Swords): you pick yours from your hand, then click Exile.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene, state } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

test("Mind Swords: click two cards in your hand and Exile; they're exiled, not discarded, and each opponent exiles two", async ({ page }) => {
  const s = scene({ hand: ["Mind Swords", "Divination", "Opt", "Shock"], board: LANDS }, [{ hand: ["Ponder", "Preordain"] }]);
  await open(page, s);
  await card(page, "Mind Swords", s).click();
  // Its menu also offers the sacrifice-a-creature alternative cost.
  await menu(page).getByRole("button", { name: /^Cast it 1 B$/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "discard" && st.pending.player === 0);
  await expect(controls(page)).toContainText("click 2 cards in your hand to exile");
  await card(page, "Divination", s).click();
  await card(page, "Opt", s).click();
  await controls(page).getByRole("button", { name: "Exile", exact: true }).click();
  await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  const after = await state(page);
  expect(after.objects[one(s, "Divination")]!.zone).toBe("exile");
  expect(after.objects[one(s, "Opt")]!.zone).toBe("exile");
  expect(after.objects[one(s, "Shock")]!.zone).toBe("hand");
  for (const id of [...idsOf(s, "Ponder"), ...idsOf(s, "Preordain")]) expect(after.objects[id]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});
