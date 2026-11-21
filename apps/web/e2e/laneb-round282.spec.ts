// Lane B round B282 in the browser: with Shared Fate, each of Divination's two draws asks whose library's top card you
// exile face down instead (a button for each opponent); you see those cards in Ana's exile and cast one from there.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, controls, menu, modal, resolveUntil, seat } from "./ui";
import type { GameState } from "@cc/engine";

/** The state once `done` holds (polled), kept: no second read after it. */
async function settled(page: Parameters<typeof state>[0], done: (s: GameState) => boolean): Promise<GameState> {
  let s: GameState | undefined;
  await expect.poll(async () => done((s = await state(page)))).toBe(true);
  return s!;
}

test("Shared Fate: Divination's draws exile Ana's top cards face down; cast her Grizzly Bears from her exile", async ({ page }) => {
  const s = scene({ hand: ["Divination"], board: [...LANDS, "Shared Fate"] }, [{ library: ["Grizzly Bears", "Llanowar Elves"] }]);
  const [bears, elves] = [one(s, "Grizzly Bears"), one(s, "Llanowar Elves")];
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  await card(page, "Divination", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "drawInstead" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Replace this draw");
  await expect(bar.getByRole("button", { name: "Exile the top card of Ben's library face down instead (Shared Fate)" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Exile the top card of Cy's library face down instead (Shared Fate)" })).toBeVisible();
  await bar.getByRole("button", { name: "Exile the top card of Ana's library face down instead (Shared Fate)" }).click();
  // The second draw asks again; the first card is gone from Ana's library.
  const between = await settled(page, (x) => x.objects[bears]!.zone === "exile" && x.pending?.kind === "drawInstead");
  expect(between.objects[bears]!.hiddenExile?.seen).toEqual([0]);
  await bar.getByRole("button", { name: "Exile the top card of Ana's library face down instead (Shared Fate)" }).click();
  const after = await settled(page, (x) => !x.pending && x.stack.length === 0 && x.objects[elves]!.zone === "exile");
  expect(after.players[0]!.hand.length).toBe(hand - 1);
  // In Ana's exile: you may look at them and cast them.
  const theirs = seat(page, 1).locator(".zone", { hasText: "Exile" });
  await theirs.click();
  await expect(modal(page)).toContainText("Grizzly Bears");
  await modal(page).locator(".card.playable", { hasText: "Grizzly Bears" }).click();
  await menu(page).getByRole("button", { name: /^Cast it/ }).first().click();
  const done = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield");
  expect(done.objects[bears]!.controller).toBe(0);
  expect(done.objects[bears]!.owner).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});
