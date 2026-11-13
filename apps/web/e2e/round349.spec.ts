// Round 349's prompts: a spell you must cast "if able" (Omen Machine, Wild Evocation: no Don't button while it can be
// cast), and Gate to the Aether's "may put it onto the battlefield" in your upkeep.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

test("Omen Machine: your draw step exiles Lightning Bolt; you must cast it, so click Cast it and Ana's Grizzly Bears", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Omen Machine"], library: ["Lightning Bolt"] }, [{ board: ["Grizzly Bears"] }]);
  const [bolt, bears] = [one(s0, "Lightning Bolt"), one(s0, "Grizzly Bears")];
  const s = playUntil(s0, (st) => st.pending?.kind === "castFree" && st.pending.player === 0);
  expect(s.step).toBe("draw");
  expect(s.objects[bolt]!.zone).toBe("exile");
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Omen Machine: cast Lightning Bolt from exile without paying its mana cost. You must cast it if you can.");
  // Not optional (rulings): no way to decline while it can be cast.
  await expect(bar.getByRole("button", { name: /^Don't/ })).toHaveCount(0);
  await bar.getByRole("button", { name: "Cast it", exact: true }).click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bolt]!.zone === "graveyard");
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Wild Evocation: your upkeep reveals Grizzly Bears from your hand; click Cast it and it's cast for free", async ({ page }) => {
  // Your hand is just Grizzly Bears when your next upkeep begins (you draw nothing on the way round the table).
  const s0 = scene({ hand: ["Grizzly Bears"], board: [...LANDS, "Wild Evocation"] });
  const s = playUntil(s0, (st) => st.pending?.kind === "castFree" && st.pending.player === 0);
  const b = one(s, "Grizzly Bears");
  expect(s.step).toBe("upkeep");
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Wild Evocation: cast Grizzly Bears from your hand without paying its mana cost. You must cast it if you can.");
  await expect(bar.getByRole("button", { name: /^Don't/ })).toHaveCount(0);
  await bar.getByRole("button", { name: "Cast it", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[b]!.zone === "battlefield");
  expect(after.objects[b]!.controller).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Gate to the Aether: your upkeep reveals Grizzly Bears; click Yes and it enters under your control", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Gate to the Aether"], library: ["Grizzly Bears"] });
  const bears = one(s0, "Grizzly Bears");
  const s = playUntil(s0, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  expect(s.step).toBe("upkeep");
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Gate to the Aether: Put Grizzly Bears onto the battlefield?");
  await bar.getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield");
  expect(after.objects[bears]!.controller).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});
