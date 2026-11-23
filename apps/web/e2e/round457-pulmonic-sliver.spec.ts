// Round 457: Pulmonic Sliver's granted "If this permanent would be put into a graveyard, you may put it on top of its
// owner's library instead." As a Sliver of yours would die, the game asks you first (the action waits on the answer); two
// of your Slivers put on top at once, you arrange.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Pulmonic Sliver: Lightning Bolt your Muscle Sliver, and put it on top of your library instead", async ({ page }) => {
  const s = scene({ hand: ["Lightning Bolt"], board: [...LANDS, "Pulmonic Sliver", "Muscle Sliver"] });
  const muscle = one(s, "Muscle Sliver");
  await open(page, s);
  await card(page, "Lightning Bolt", s).click();
  await page.locator(`[data-obj="${muscle}"]`).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "moveInstead");
  // The Bolt waits on the stack until it's answered.
  expect(asked.stack.length).toBe(1);
  const bar = controls(page);
  await expect(bar).toContainText("Muscle Sliver: put it on top of your library instead of into your graveyard?");
  await bar.getByRole("button", { name: "Put it on top of your library", exact: true }).click();
  const done = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[muscle]!.zone === "library");
  expect(done.players[0]!.library[0]).toBe(muscle);
  expect(done.log.some((l) => l.text === "Muscle Sliver is put on top of its owner's library instead of into a graveyard.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Pulmonic Sliver: Wrath of God, keep both Slivers, and arrange them on top of your library", async ({ page }) => {
  const s = scene({ hand: ["Wrath of God"], board: [...LANDS, "Pulmonic Sliver", "Muscle Sliver"] });
  const [pulmonic, muscle] = [one(s, "Pulmonic Sliver"), one(s, "Muscle Sliver")];
  await open(page, s);
  await card(page, "Wrath of God", s).click();
  const bar = controls(page);
  for (let i = 0; i < 2; i++) {
    // The question for the next Sliver (the first answer kept while the Wrath is applied again).
    await expect.poll(async () => {
      const st = await state(page);
      return st.pending?.kind === "chooseOption" && st.pending.what === "moveInstead" ? (st.moveAnswers?.length ?? 0) : -1;
    }).toBe(i);
    await bar.getByRole("button", { name: "Put it on top of your library", exact: true }).click();
  }
  const st = await resolveUntil(page, (x) => x.pending?.kind === "orderLibrary");
  const arrange = page.locator(".modal.arrange");
  await expect(arrange).toContainText("put these 2 cards on top of your library in any order");
  const start = st.pending?.kind === "orderLibrary" ? st.pending.cards : [];
  expect(new Set(start)).toEqual(new Set([pulmonic, muscle]));
  const first = start[0]!;
  await arrange.locator(".arrange-card", { has: page.locator(`[data-arrange="${first}"]`) }).getByRole("button", { name: "Move deeper" }).click();
  await arrange.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0);
  expect(after.players[0]!.library.slice(0, 2)).toEqual([start[1]!, first]);
  expect(after.players[0]!.graveyard.map((id) => after.cards[after.objects[id]!.cardId]!.name)).toEqual(["Wrath of God"]);
  expect(pageErrors(page)).toEqual([]);
});
