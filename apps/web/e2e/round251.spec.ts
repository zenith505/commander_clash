// Round 251: Rowan's Grim Search bargained ("look at the top four cards of your library, then put up to two of them back
// on top of your library in any order and the rest into your graveyard"): pick the two to keep, then order them on top,
// then draw them.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, modal, resolveUntil } from "./ui";

test("Rowan's Grim Search: bargained, keep two of the top four, order them on top, and draw them", async ({ page }) => {
  const s = scene({ hand: ["Rowan's Grim Search"], board: [...LANDS, "Ornithopter"], library: ["Shock", "Opt", "Divination", "Grizzly Bears"] });
  const [thopter, shock, opt, div, bears] = ["Ornithopter", "Shock", "Opt", "Divination", "Grizzly Bears"].map((n) => one(s, n));
  await open(page, s);
  await card(page, "Rowan's Grim Search", s).click();
  const bar = page.locator(".targeting", { hasText: "bargain: you may sacrifice an artifact, enchantment, or token" });
  await expect(bar).toBeVisible();
  await page.locator(`[data-obj="${thopter}"]`).click();
  await bar.getByRole("button", { name: "Sacrifice and cast" }).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  expect(asked.pending?.kind === "searchLibrary" ? [...asked.pending.cards].sort() : []).toEqual([shock!, opt!, div!, bears!].sort());
  expect(asked.pending?.kind === "searchLibrary" && asked.pending.max).toBe(2);
  const pick = modal(page);
  await expect(pick).toContainText("back on top of your library");
  await pick.locator(`[data-pick="${shock}"]`).click();
  await pick.locator(`[data-pick="${div}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const mid = await resolveUntil(page, (st) => st.pending?.kind === "arrangeTop" && st.pending.player === 0);
  expect(mid.pending?.kind === "arrangeTop" && mid.pending.how).toBe("order");
  const order = mid.pending?.kind === "arrangeTop" ? mid.pending.cards : [];
  expect(new Set(order)).toEqual(new Set([shock, div]));
  const arrange = page.locator(".modal.arrange");
  await arrange.locator(".arrange-card", { has: page.locator(`[data-arrange="${order[0]}"]`) }).getByRole("button", { name: "Move deeper" }).click();
  await arrange.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[order[0]!]!.zone === "hand");
  // The one put on top is drawn first.
  expect(after.players[0]!.hand.slice(-2)).toEqual([order[1], order[0]]);
  expect(after.objects[opt!]!.zone).toBe("graveyard");
  expect(after.objects[bears!]!.zone).toBe("graveyard");
  expect(after.objects[thopter!]!.zone).toBe("graveyard");
  expect(after.players[0]!.life).toBe(38);
  expect(pageErrors(page)).toEqual([]);
});
