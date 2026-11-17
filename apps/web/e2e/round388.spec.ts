// Round 388 in the browser: Spider-Verse copying Firebolt cast with its flashback (yes to the copy, then the copy's new
// target), and The Brothers' War's chapter II, two target players clicked, whose creatures then must attack each other.
import { expect, test } from "@playwright/test";
import { characteristics } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { clickPlayer, controls, menu, modal, resolveUntil } from "./ui";

test("Spider-Verse: Firebolt cast from your graveyard at Ana is copied, and the copy targets Ben", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Spider-Verse"], yard: ["Firebolt"] });
  const fb = one(s, "Firebolt");
  const [ana, ben] = [s.players[1]!.life, s.players[2]!.life];
  await open(page, s);
  await page.locator('[data-graveyard="0"]').click();
  await modal(page).locator(".card.playable", { hasText: "Firebolt" }).click();
  await menu(page).getByRole("button", { name: /^Flashback/ }).click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.source === "Spider-Verse" && st.pending.player === 0);
  await controls(page).getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "copyTargets" && st.pending.player === 0);
  await clickPlayer(page, 2);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[fb]!.zone === "exile");
  expect(after.players[1]!.life).toBe(ana - 2);
  expect(after.players[2]!.life).toBe(ben - 2);
  expect(pageErrors(page)).toEqual([]);
});

test("The Brothers' War, chapter II: you target Ana and Ben; Ana's Grizzly Bears must attack Ben and Ben's must attack Ana", async ({ page }) => {
  const s0 = scene({ board: ["The Brothers' War"] }, [{ board: ["Grizzly Bears"] }, { board: ["Grizzly Bears"] }]);
  const saga = one(s0, "The Brothers' War");
  s0.objects[saga]!.counters.lore = 1;
  const anaBears = s0.battlefield.find((id) => s0.objects[id]!.controller === 1 && s0.cards[s0.objects[id]!.cardId]!.name === "Grizzly Bears")!;
  const benBears = s0.battlefield.find((id) => s0.objects[id]!.controller === 2 && s0.cards[s0.objects[id]!.cardId]!.name === "Grizzly Bears")!;
  const s = playUntil(s0, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await open(page, s);
  await clickPlayer(page, 1);
  await clickPlayer(page, 2);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[saga]!.counters.lore === 2);
  expect(characteristics(after, after.objects[anaBears]!).mustAttack).toEqual([2]);
  expect(characteristics(after, after.objects[benBears]!).mustAttack).toEqual([1]);
  expect(pageErrors(page)).toEqual([]);
});
