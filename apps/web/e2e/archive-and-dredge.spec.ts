// Alhammarret's Archive and dredge on the same draw: you choose which applies first (CR 616.1, Archive ruling).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Alhammarret's Archive and dredge: dredge the first draw before the Archive doubles it, then the Archive doubles the second", async ({ page }) => {
  const s = scene({ hand: ["Divination"], board: [...LANDS, "Alhammarret's Archive"], yard: ["Dakmor Salvage"], library: ["Goblin Piker", "Hill Giant", "Shock", "Lightning Bolt", "Island"] });
  const salvage = one(s, "Dakmor Salvage");
  const top = s.players[0]!.library.slice(0, 4);
  await open(page, s);
  await card(page, "Divination", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "dredge" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Alhammarret's Archive would make this draw two cards");
  await expect(bar.getByRole("button", { name: "Draw two instead (Archive first)" })).toHaveCount(1);
  await bar.getByRole("button", { name: "Dredge Dakmor Salvage (mill 2)" }).click();
  // The Salvage is back in hand, so nothing can dredge the second draw: the Archive makes it two.
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0);
  expect(after.objects[salvage]!.zone).toBe("hand");
  expect(top.map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "hand", "hand"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Alhammarret's Archive and dredge: the Archive first, then dredge one of the two draws", async ({ page }) => {
  const s = scene({ hand: ["Divination"], board: [...LANDS, "Alhammarret's Archive"], yard: ["Dakmor Salvage"], library: ["Goblin Piker", "Hill Giant", "Shock", "Lightning Bolt", "Island", "Forest"] });
  const salvage = one(s, "Dakmor Salvage");
  const top = s.players[0]!.library.slice(0, 5);
  await open(page, s);
  await card(page, "Divination", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "dredge" && st.pending.player === 0);
  const bar = controls(page);
  await bar.getByRole("button", { name: "Draw two instead (Archive first)" }).click();
  // The first of the Archive's two draws, then Divination's second draw.
  await resolveUntil(page, (st) => st.pending?.kind === "dredge" && st.pending.left === 3);
  await expect(bar).toContainText("(3 draws left)");
  await expect(bar.getByRole("button", { name: "Draw", exact: true })).toHaveCount(1);
  await bar.getByRole("button", { name: "Dredge Dakmor Salvage (mill 2)" }).click();
  // Then the Archive's other draw, and Divination's second draw doubled: three cards.
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0);
  expect(after.objects[salvage]!.zone).toBe("hand");
  expect(top.map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "hand", "hand", "hand"]);
  expect(pageErrors(page)).toEqual([]);
});
