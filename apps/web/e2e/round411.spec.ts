// Round 411 in the browser: Guff Rewrites History's one target for each player (yours first), the permanents shuffled
// away and your free cast of the nonland card you exiled, and Mysterious Stranger's target in each graveyard with an
// instant or sorcery card and its free cast of a copy of one of them chosen at random.
import { expect, test } from "@playwright/test";
import { controllerOf } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, modal, resolveUntil } from "./ui";

test("Guff Rewrites History: your Hill Giant and one permanent of each opponent; you cast the Giant again for free", async ({ page }) => {
  const s = scene({ hand: ["Guff Rewrites History"], board: [...LANDS, "Hill Giant"] }, [{ board: ["Grizzly Bears"] }, { board: ["Sol Ring"] }, { board: ["Raging Goblin"] }]);
  const [guff, giant, bears, ring, goblin] = ["Guff Rewrites History", "Hill Giant", "Grizzly Bears", "Sol Ring", "Raging Goblin"].map((n) => one(s, n)) as [string, string, string, string, string];
  await open(page, s);
  await card(page, "Guff Rewrites History", s).click();
  const panel = page.locator(".targeting", { hasText: "Guff Rewrites History" });
  await expect(panel).toContainText("choose target nonenchantment, nonland permanent you control (1/4)");
  await page.locator(`[data-obj="${giant}"]`).click();
  await expect(panel).toContainText("choose target nonenchantment, nonland permanent Ana controls (2/4)");
  await page.locator(`[data-obj="${bears}"]`).click();
  await expect(panel).toContainText("Ben controls (3/4)");
  await page.locator(`[data-obj="${ring}"]`).click();
  await expect(panel).toContainText("Cy controls (4/4)");
  await page.locator(`[data-obj="${goblin}"]`).click();
  // Your library is all lands, so the Giant shuffled into it is the nonland card you exile.
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.player === 0);
  expect(asked.pending?.kind === "castFree" && asked.pending.objectId).toBe(giant);
  expect(asked.objects[giant]!.zone).toBe("exile");
  await controls(page).getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "battlefield" && st.objects[guff]!.zone === "graveyard");
  expect(controllerOf(after, after.objects[giant]!)).toBe(0);
  // Each opponent's permanent left the battlefield (and may have been cast again by its bot).
  for (const id of [bears, ring, goblin]) expect(["library", "exile", "battlefield", "stack"]).toContain(after.objects[id]!.zone);
  expect(after.log.map((l) => l.text).join("\n")).toContain("Guff Rewrites History shuffles Sol Ring into its owner's library.");
  expect(pageErrors(page)).toEqual([]);
});

test("Mysterious Stranger: a target in your graveyard and in Ben's; a copy of one of them cast for free", async ({ page }) => {
  const s = scene({ hand: ["Mysterious Stranger"], board: LANDS, yard: ["Divination"] }, [{ yard: ["Mountain"] }, { yard: ["Night's Whisper"] }, {}]);
  const [stranger, div, opt] = ["Mysterious Stranger", "Divination", "Night's Whisper"].map((n) => one(s, n)) as [string, string, string];
  await open(page, s);
  await card(page, "Mysterious Stranger", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  const panel = page.locator(".targeting", { hasText: "Mysterious Stranger" });
  await expect(panel).toContainText("choose target instant or sorcery card from your graveyard (1/2)");
  // The graveyard's cards are offered in a picker.
  await modal(page).locator(`[data-pick="${div}"]`).click();
  await expect(panel).toContainText("choose target instant or sorcery card from Ben's graveyard (2/2)");
  await modal(page).locator(`[data-pick="${opt}"]`).click();
  const offered = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong" && st.pending.player === 0);
  expect([div, opt].map((id) => offered.objects[id]!.zone)).toEqual(["exile", "exile"]);
  const chosen = offered.pending?.kind === "chooseOption" ? offered.pending.options[0]! : "";
  expect([div, opt]).toContain(chosen);
  const name = chosen === div ? "Divination" : "Night's Whisper";
  const hand = offered.players[0]!.hand.length;
  const bar = controls(page);
  await bar.getByRole("button", { name, exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.player === 0);
  await controls(page).getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[0]!.hand.length === hand + 2);
  expect(after.objects[stranger]!.zone).toBe("battlefield");
  // The copy drew two cards (Night's Whisper's for 2 life too); both cards are still exiled.
  expect(after.players[0]!.life).toBe(chosen === div ? 40 : 38);
  expect([div, opt].map((id) => after.objects[id]!.zone)).toEqual(["exile", "exile"]);
  expect(pageErrors(page)).toEqual([]);
});
