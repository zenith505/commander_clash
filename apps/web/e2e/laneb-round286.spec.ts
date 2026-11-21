// Lane B round B286 in the browser: Galea, Kindler of Hope (cast Bonesplitter from the top of your library; it enters and
// asks for a creature you control to attach to) and Unpredictable Cyclone (cycle Desert Cerodon: Shock and Hill Giant are
// exiled instead of a draw, and you cast Hill Giant free).
import { expect, test } from "@playwright/test";
import type { GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, controls, menu, resolveUntil, seat } from "./ui";

/** The state once `done` holds (polled), kept: no second read after it. */
async function settled(page: Parameters<typeof state>[0], done: (s: GameState) => boolean): Promise<GameState> {
  let s: GameState | undefined;
  await expect.poll(async () => done((s = await state(page)))).toBe(true);
  return s!;
}

test("Galea, Kindler of Hope: Bonesplitter cast from the top of your library enters attached to Grizzly Bears", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Galea, Kindler of Hope", "Grizzly Bears"], library: ["Bonesplitter", "Hill Giant"] });
  const [galea, bears, splitter] = [one(s, "Galea, Kindler of Hope"), one(s, "Grizzly Bears"), one(s, "Bonesplitter")];
  await open(page, s);
  const library = seat(page, 0).locator(".zone", { hasText: "Library" });
  await library.locator(`[data-obj="${splitter}"]`).click();
  // Galea's trigger gives it the enters ability; as it enters, its target: a creature you control.
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0 && st.objects[splitter]!.zone === "battlefield");
  expect(asked.log.some((l) => l.text.includes("Galea, Kindler of Hope"))).toBe(true);
  const bar = page.locator(".targeting");
  await expect(bar).toContainText("target creature you control");
  await page.locator(`[data-obj="${bears}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[splitter]!.attachedTo === bears);
  expect(after.objects[galea]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Unpredictable Cyclone: cycling Desert Cerodon exiles until Hill Giant instead of a draw; cast it free", async ({ page }) => {
  const s = scene({ hand: ["Desert Cerodon"], board: [...LANDS, "Unpredictable Cyclone"], library: ["Shock", "Hill Giant", "Grizzly Bears"] });
  const [cerodon, shock, giant, bears] = [one(s, "Desert Cerodon"), one(s, "Shock"), one(s, "Hill Giant"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Desert Cerodon", s).click();
  await menu(page).getByRole("button", { name: /^Cycling/ }).click();
  const offer = await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.player === 0);
  expect(offer.pending?.kind === "castFree" && offer.pending.objectId).toBe(giant);
  expect(offer.objects[shock]!.zone).toBe("exile");
  const bar = controls(page);
  await expect(bar).toContainText("Unpredictable Cyclone");
  await bar.getByRole("button", { name: "Cast it" }).click();
  const after = await settled(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "battlefield");
  expect(after.objects[cerodon]!.zone).toBe("graveyard");
  // Shock went to the bottom; nothing was drawn, so Grizzly Bears is on top and the hand is empty.
  expect(after.objects[shock]!.zone).toBe("library");
  expect(after.players[0]!.library[0]).toBe(bears);
  expect(after.players[0]!.hand).toHaveLength(0);
  expect(pageErrors(page)).toEqual([]);
});
