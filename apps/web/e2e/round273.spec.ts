// Round 273's prompts: Black Cat, Cunning Thief's pick of exactly two of the top nine cards of the target opponent's
// library (exiled face down, the rest to the bottom), and Cruelclaw's Heist's gift bar and pick from the revealed hand,
// after which you may cast the exiled card with mana of any type.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, modal, resolveUntil } from "./ui";
import { mayPlayFromExile } from "@cc/engine";

test("Black Cat, Cunning Thief: target Ana, then exile two of her top nine cards face down", async ({ page }) => {
  const s = scene({ hand: ["Black Cat, Cunning Thief"], board: LANDS }, [{ library: ["Hill Giant", "Grizzly Bears", "Sol Ring"] }]);
  const [giant, bears, ring] = ["Hill Giant", "Grizzly Bears", "Sol Ring"].map((n) => idsOf(s, n, "library", 1)[0]!) as [string, string, string];
  const nine = s.players[1]!.library.slice(0, 9);
  await open(page, s);
  await card(page, "Black Cat, Cunning Thief", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  for (const id of nine) await expect(pick.locator(`[data-pick="${id}"]`)).toHaveCount(1);
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.locator(`[data-pick="${ring}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "exile");
  for (const id of [giant, ring]) {
    expect(after.objects[id]!.zone).toBe("exile");
    expect(after.objects[id]!.hiddenExile?.seen).toEqual([0]);
    expect(mayPlayFromExile(after, after.objects[id]!, 0)).toBe(true);
  }
  expect(after.objects[bears]!.zone).toBe("library");
  expect(after.players[1]!.library.slice(-7)).toContain(bears);
  expect(pageErrors(page)).toEqual([]);
});

test("Cruelclaw's Heist: promise Ana a card, take Hill Giant from her revealed hand; you may cast it from exile", async ({ page }) => {
  const s = scene({ hand: ["Cruelclaw's Heist"], board: LANDS }, [{ hand: ["Hill Giant", "Forest"] }]);
  const giant = one(s, "Hill Giant");
  const forest = idsOf(s, "Forest", "hand", 1)[0]!;
  await open(page, s);
  await card(page, "Cruelclaw's Heist", s).click();
  const bar = page.locator(".gift-pick");
  await expect(bar).toContainText("promise an opponent a gift (a card)");
  await bar.getByRole("button", { name: "Gift Ana" }).click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  // A land can't be taken.
  await expect(pick.locator(`[data-pick="${forest}"]`)).toHaveClass(/dim/);
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "exile");
  expect(after.players[1]!.exile).toContain(giant);
  expect(mayPlayFromExile(after, after.objects[giant]!, 0)).toBe(true);
  // Ana drew the gift card first.
  expect(after.players[1]!.hand).toHaveLength(2);
  expect(pageErrors(page)).toEqual([]);
});
