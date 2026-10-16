// "As this creature enters, secretly choose an opponent" (Guardian Archon): the prompt names only opponents and the log
// doesn't say who; "Reveal the player you chose" in its ability menu reveals it, and you and the target permanent gain
// protection from that player until end of turn (CR 702.16k), shown next to your name.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, resolveUntil, seat } from "./ui";

test("Guardian Archon: secretly choose an opponent, then reveal it for protection", async ({ page }) => {
  const s = scene({ hand: ["Guardian Archon"], board: [...LANDS, "Grizzly Bears"] });
  const archon = one(s, "Guardian Archon");
  const bears = one(s, "Grizzly Bears");
  await open(page, s);
  await card(page, "Guardian Archon", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption");
  const bar = controls(page);
  await expect(bar).toContainText("Guardian Archon: secretly choose an opponent");
  await expect(bar.getByRole("button", { name: "You (you)", exact: true })).toHaveCount(0);
  await bar.getByRole("button", { name: "Ana", exact: true }).click();
  let now = await resolveUntil(page, (st) => !st.pending && st.objects[archon]?.zone === "battlefield");
  expect(now.objects[archon]!.chosen).toMatchObject({ player: 1, secret: true });
  expect(now.log.some((l) => l.text === "You secretly chooses an opponent for Guardian Archon.")).toBe(true);
  // Its ability: reveal the choice, target the Bears.
  await page.locator(`[data-obj="${archon}"]`).click();
  await menu(page).locator("button", { hasText: "Reveal the player you chose" }).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  now = await resolveUntil(page, (st) => st.stack.length === 0 && !!st.players[0]!.gained?.length);
  expect(now.players[0]!.gained).toEqual(["Protection from player #1"]);
  expect(now.log.some((l) => l.text === "You reveals the player chosen for Guardian Archon: Ana.")).toBe(true);
  await expect(seat(page, 0)).toContainText("Protection from Ana");
  await expect(page.locator(`[data-obj="${bears}"]`)).toContainText("Protection from Ana");
  expect(pageErrors(page)).toEqual([]);
});
