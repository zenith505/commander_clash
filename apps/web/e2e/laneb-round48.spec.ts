// Lane B round 48 in the browser: Visions' look at the top five cards of another player's library (no arrows: they
// can't be reordered, rulings), then the offer to have that player shuffle; Drake Familiar's "return an enchantment to
// its owner's hand", any player's enchantment.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, modal, resolveUntil } from "./ui";

const LIB = ["Grizzly Bears", "Hill Giant", "Ornithopter", "Shivan Dragon", "Lightning Bolt"];

test("Visions: look at the top five cards of Ana's library, then leave them in that order", async ({ page }) => {
  const s = scene({ hand: ["Visions"], board: LANDS }, [{ library: LIB }]);
  const top = s.players[1]!.library.slice(0, 5);
  await open(page, s);
  await card(page, "Visions", s).click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "arrangeTop");
  const look = modal(page);
  await expect(look).toContainText("Visions: the top 5 cards of Ana's library");
  for (const id of top) await expect(look.locator(`[data-arrange="${id}"]`)).toHaveCount(1);
  // Only looked at: nothing to reorder.
  await expect(look.getByRole("button", { name: "Move deeper" })).toHaveCount(0);
  await look.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay");
  await controls(page).getByRole("button", { name: "No" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.players[1]!.library.slice(0, 5)).toEqual(top);
  expect(pageErrors(page)).toEqual([]);
});

test("Visions: Yes has Ana shuffle her library", async ({ page }) => {
  const s = scene({ hand: ["Visions"], board: LANDS }, [{ library: LIB }]);
  const top = s.players[1]!.library.slice(0, 5);
  await open(page, s);
  await card(page, "Visions", s).click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "arrangeTop");
  await modal(page).getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay");
  await controls(page).getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.players[1]!.library.slice(0, 5)).not.toEqual(top);
  expect(after.log.some((l) => /shuffles/i.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Drake Familiar: return Ana's Honor of the Pure to her hand, not your Glorious Anthem", async ({ page }) => {
  const s = scene({ hand: ["Drake Familiar"], board: [...LANDS, "Glorious Anthem"] }, [{ board: ["Honor of the Pure"] }]);
  const [drake, mine, theirs] = [one(s, "Drake Familiar"), one(s, "Glorious Anthem"), one(s, "Honor of the Pure")];
  await open(page, s);
  await card(page, "Drake Familiar", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay");
  await controls(page).getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents");
  const bar = controls(page);
  await expect(bar).toContainText("click an enchantment (anyone's) to return to its owner's hand.");
  await page.locator(`[data-obj="${theirs}"]`).click();
  await bar.getByRole("button", { name: "Return" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[theirs]!.zone).toBe("hand");
  expect(after.players[1]!.hand).toContain(theirs);
  expect([after.objects[mine]!.zone, after.objects[drake]!.zone]).toEqual(["battlefield", "battlefield"]);
  expect(pageErrors(page)).toEqual([]);
});
