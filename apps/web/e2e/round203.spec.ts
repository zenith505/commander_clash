// Round 203's prompt: time travel (CR 701.56a) asks about each permanent you control with a time counter and each
// suspended card you own, one at a time (put a counter on, take one off, or leave it), then changes them all at once.
// And the enduring story (CR 702.195b) a storied permanent gives shows by its player's name.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil, seat } from "./ui";

test("Wibbly-wobbly, Timey-wimey: the time travel prompt adds to one and takes from another", async ({ page }) => {
  const s = scene({ hand: ["Wibbly-wobbly, Timey-wimey"], board: [...LANDS, "Rotating Fireplace"], exile: ["Rift Bolt"] });
  const fire = one(s, "Rotating Fireplace");
  const bolt = one(s, "Rift Bolt");
  s.objects[fire]!.counters.time = 1;
  s.objects[bolt]!.counters.time = 2;
  await open(page, s);
  await card(page, "Wibbly-wobbly, Timey-wimey", s).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption");
  expect(asked.pending).toMatchObject({ what: "timeTravel", about: fire });
  await expect(controls(page)).toContainText("Rotating Fireplace has 1 time counter");
  await controls(page).getByRole("button", { name: "Put a time counter on Rotating Fireplace" }).click();
  await expect(controls(page)).toContainText("Rift Bolt (suspended) has 2 time counters");
  await expect(controls(page).getByRole("button", { name: "Leave it" })).toBeVisible();
  await controls(page).getByRole("button", { name: "Remove a time counter from Rift Bolt" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[one(s, "Wibbly-wobbly, Timey-wimey")]!.zone === "graveyard");
  expect(after.objects[fire]!.counters.time).toBe(2);
  expect(after.objects[bolt]!.counters.time).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Thorin Oakenshield with two artifacts: you have an enduring story, shown by your name", async ({ page }) => {
  const s = scene({ hand: ["Thorin Oakenshield"], board: [...LANDS, "Sol Ring", "Mind Stone"] });
  await open(page, s);
  await expect(seat(page, 0)).not.toContainText("Enduring story");
  await card(page, "Thorin Oakenshield", s).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[one(s, "Thorin Oakenshield")]!.zone === "battlefield");
  expect(after.players[0]!.enduringStory).toBe(true);
  await expect(seat(page, 0)).toContainText("Enduring story");
  expect(pageErrors(page)).toEqual([]);
});
