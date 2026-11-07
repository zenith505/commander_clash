// Round 294's prompts: Struggle for Sanity's turns at exiling a card from the target opponent's revealed hand; Giant
// Albatross's "destroy that creature unless its controller pays 2 life", asked of each creature's controller.
import { expect, test } from "@playwright/test";
import { applyAction, planActivate, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Struggle for Sanity: Ana exiles a card from her hand, then you exile one of hers; hers go back, yours to her graveyard", async ({ page }) => {
  const s = scene({ hand: ["Struggle for Sanity"], board: LANDS }, [{ hand: ["Grizzly Bears", "Hill Giant", "Craw Wurm"] }]);
  const [bears, giant, wurm] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Craw Wurm")];
  await open(page, s);
  await card(page, "Struggle for Sanity", s).click();
  await page.locator(`[data-player="1"]`).first().click();
  const at = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "struggleExile" && st.pending.player === 0);
  // Ana exiled first the card she most wants back, the one she can cast soonest (a bot's pick).
  const kept = [bears, giant, wurm].find((id) => at.objects[id]!.zone === "exile")!;
  expect(kept).toBe(bears);
  const bar = controls(page);
  await expect(bar).toContainText("exile a card from Ana's hand (it goes to their graveyard afterwards)");
  await bar.getByRole("button", { name: "Hill Giant", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[giant]!.zone === "graveyard");
  // The last card was hers to exile, without a choice; both of hers are back in her hand.
  expect(after.objects[wurm]!.zone).toBe("hand");
  expect(after.objects[bears]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("Giant Albatross: it dies after Prodigal Pyromancer pinged it; pay 2 life so the Pyromancer isn't destroyed", async ({ page }) => {
  let s: GameState = scene({ board: [...LANDS, "Giant Albatross", "Prodigal Pyromancer"] });
  const [bird, pyro] = [one(s, "Giant Albatross"), one(s, "Prodigal Pyromancer")];
  for (const a of planActivate(s, 0, pyro, 0, [{ kind: "object", id: bird }])!) s = applyAction(s, a);
  s = playUntil(s, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  s.players[0]!.manaPool.U = 2;
  s = applyAction(s, { type: "chooseMay", player: 0, yes: true });
  const at: GameState = s;
  expect(at.objects[bird]!.zone).toBe("graveyard");
  expect(at.pending).toMatchObject({ kind: "chooseOption", what: "payLifeOrDestroy", player: 0, about: pyro });
  const life = at.players[0]!.life;
  await open(page, at);
  const bar = controls(page);
  await expect(bar).toContainText("pay 2 life, or Prodigal Pyromancer is destroyed (it can't be regenerated)?");
  await expect(bar.getByRole("button", { name: "Let Prodigal Pyromancer be destroyed" })).toBeVisible();
  await bar.getByRole("button", { name: "Pay 2 life", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.players[0]!.life === life - 2);
  expect(after.objects[pyro]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
