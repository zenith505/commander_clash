// "Target opponent chooses one" (Intuition): when an opponent's spell has you choose among the cards they revealed,
// the prompt shows them and says where the chosen card and the rest go.
import { expect, test } from "@playwright/test";
import { applyAction, botActions, planCast, waitingOn, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { modal, resolveUntil } from "./ui";

test("Intuition cast at you: pick one of Ana's three cards for her hand; the other two go to her graveyard", async ({ page }) => {
  let s: GameState = scene({}, [{ hand: ["Intuition"], board: LANDS, library: ["Lightning Bolt", "Sol Ring", "Mind Stone"] }]);
  // You pass in your main phase; Ana casts Intuition targeting you, and her bot searches.
  s = applyAction(s, { type: "passPriority", player: 0 });
  for (const a of planCast(s, 1, one(s, "Intuition"), [{ kind: "player", id: 0 }])!) s = applyAction(s, a);
  for (let i = 0; i < 20 && !(s.pending?.kind === "searchLibrary" && s.pending.player === 0); i++) {
    const pid = waitingOn(s)!;
    s = applyAction(s, pid === 0 ? { type: "passPriority", player: 0 } : botActions(s, pid)[0]!);
  }
  const pend = s.pending as Extract<NonNullable<GameState["pending"]>, { kind: "searchLibrary" }>;
  expect(pend).toMatchObject({ kind: "searchLibrary", player: 0, forPlayer: 1, min: 1, max: 1 });
  const three = pend.dig!.looked;
  await open(page, s);
  await expect(modal(page)).toContainText("Intuition: choose one to put into Ana's hand");
  await expect(modal(page)).toContainText("The rest go into Ana's graveyard.");
  await expect(modal(page)).toContainText("The cards Ana revealed");
  await modal(page).locator(`[data-pick="${three[1]}"]`).click();
  await modal(page).getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.objects[three[1]!]?.zone === "hand");
  expect([three[0]!, three[2]!].map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "graveyard"]);
  expect(pageErrors(page)).toEqual([]);
});
