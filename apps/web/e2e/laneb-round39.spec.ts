// Lane B round 39 in the browser: the Eldrazi processors' "put a card an opponent owns from exile into that player's
// graveyard", as an activated ability's cost (Void Attendant) and as a cast trigger's choice (Ruin Processor). A card
// exiled face down that you may not look at shows its back (CR 406.3).
import { expect, test } from "@playwright/test";
import { applyAction, planCast, waitingOn, type Action, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { controls, menu, modal, resolveUntil } from "./ui";

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => applyAction(x, a), s);
};
/** Everyone passes until there's a prompt (or nothing left to resolve). */
const passToPrompt = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = applyAction(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

test("Void Attendant: its cost picks a card an opponent owns in exile, a face-down one by its back", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Void Attendant"] }, [{ exile: ["Hill Giant", "Grizzly Bears"] }]);
  const [attendant, giant, bears] = [one(s, "Void Attendant"), one(s, "Hill Giant"), one(s, "Grizzly Bears")];
  s.objects[bears]!.hiddenExile = { by: giant, seen: [1], label: "Face down" };
  await open(page, s);
  await page.locator(`[data-obj="${attendant}"]`).click();
  await menu(page).getByRole("button", { name: /Eldrazi Scion/ }).click();
  const pick = modal(page);
  await expect(pick).toContainText("put a card an opponent owns from exile into that player's graveyard");
  await expect(pick.locator(`[data-pick="${giant}"]`)).toContainText("Hill Giant");
  const back = pick.locator(`[data-pick="${bears}"]`);
  await expect(back).toHaveClass(/back/);
  await expect(back).toContainText("Ana's, face down");
  await expect(pick).not.toContainText("Grizzly Bears");
  await back.click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "graveyard");
  expect(after.objects[giant]!.zone).toBe("exile");
  expect(after.battlefield.filter((id) => after.objects[id]!.controller === 0 && after.cards[after.objects[id]!.cardId]!.name.includes("Scion"))).toHaveLength(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Ruin Processor: as it's cast, Yes, then pick the card to put into its owner's graveyard, and gain 5 life", async ({ page }) => {
  const s0 = scene({ board: LANDS, hand: ["Ruin Processor"] }, [{ exile: ["Hill Giant", "Grizzly Bears"] }]);
  const [processor, giant, bears] = [one(s0, "Ruin Processor"), one(s0, "Hill Giant"), one(s0, "Grizzly Bears")];
  const s = passToPrompt(run(s0, planCast(s0, 0, processor)));
  expect(s.pending).toMatchObject({ kind: "chooseMay", player: 0 });
  await open(page, s);
  await controls(page).getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await expect(pick).toContainText("Ruin Processor: choose a card an opponent owns to put into its owner's graveyard");
  await expect(pick.locator(`[data-pick="${bears}"]`)).toContainText("Grizzly Bears");
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[processor]!.zone === "battlefield");
  expect([after.objects[giant]!.zone, after.objects[bears]!.zone, after.players[0]!.life]).toEqual(["graveyard", "exile", 45]);
  expect(pageErrors(page)).toEqual([]);
});
