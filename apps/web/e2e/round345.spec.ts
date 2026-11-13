// Round 345's prompts: Extract Brain cast by you (the cards Ana chose from her hand, one of them cast from there) and cast
// at you (choose X cards from your hand for Ana to look at, CR 608.2d).
import { expect, test } from "@playwright/test";
import { applyAction, botActions, characteristics, planCast, waitingOn, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, clickPlayer, controls, modal, resolveUntil } from "./ui";

test("Extract Brain with X = 2: Ana chooses two cards from her hand and you cast one of them for free", async ({ page }) => {
  const s = scene({ hand: ["Extract Brain"], board: LANDS }, [{ hand: ["Grizzly Bears", "Hill Giant", "Llanowar Elves"] }]);
  const theirs = ["Grizzly Bears", "Hill Giant", "Llanowar Elves"].map((n) => one(s, n));
  await open(page, s);
  await card(page, "Extract Brain", s).click();
  const x = page.locator(".x-pick");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  await clickPlayer(page, 1);
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong" && st.pending.player === 0);
  const pend = asked.pending as Extract<NonNullable<GameState["pending"]>, { kind: "chooseOption" }>;
  const offered = pend.options.filter((o) => o !== "none");
  expect(offered).toHaveLength(2);
  expect(offered.every((id) => theirs.includes(id))).toBe(true);
  const bar = controls(page);
  await expect(bar).toContainText("cast a spell from among the cards in Ana's hand without paying its mana cost");
  const pick = offered[0]!;
  const name = characteristics(asked, asked.objects[pick]!).name;
  await bar.getByRole("button", { name, exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.player === 0);
  await expect(bar).toContainText(`cast ${name}`);
  await bar.getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[pick]!.zone === "battlefield");
  expect(after.objects[pick]!.owner).toBe(1);
  expect(characteristics(after, after.objects[pick]!).controller).toBe(0);
  expect(theirs.filter((id) => id !== pick).map((id) => after.objects[id]!.zone)).toEqual(["hand", "hand"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Ana's Extract Brain with X = 1 at you: choose the card from your hand she looks at", async ({ page }) => {
  let s: GameState = scene({ hand: ["Grizzly Bears", "Hill Giant", "Llanowar Elves"] }, [{ hand: ["Extract Brain"], board: LANDS }]);
  const [bears, giant, elves] = ["Grizzly Bears", "Hill Giant", "Llanowar Elves"].map((n) => one(s, n)) as [string, string, string];
  const brain = one(s, "Extract Brain");
  s = playUntil(s, (st) => st.activePlayer === 1 && st.step === "main1" && st.stack.length === 0 && !st.pending && st.priority === 1);
  for (const a of planCast(s, 1, brain, [{ kind: "player", id: 0 }], undefined, "auto", 1)!) s = applyAction(s, a);
  for (let i = 0; i < 20 && !(s.pending?.kind === "searchLibrary" && s.pending.player === 0); i++) {
    const pid = waitingOn(s)!;
    s = applyAction(s, pid === 0 ? { type: "passPriority", player: 0 } : botActions(s, pid)[0]!);
  }
  expect(s.pending).toMatchObject({ kind: "searchLibrary", player: 0, min: 1, max: 1, fromHand: true, handFor: 1 });
  await open(page, s);
  await expect(modal(page)).toContainText("Extract Brain: choose a card from your hand for Ana to look at");
  await modal(page).locator(`[data-pick="${elves}"]`).click();
  await modal(page).getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[brain]!.zone === "graveyard");
  // Only the Elves could be cast: the other two stay in your hand.
  expect([bears, giant].map((id) => after.objects[id]!.zone)).toEqual(["hand", "hand"]);
  expect(["hand", "battlefield"]).toContain(after.objects[elves]!.zone);
  if (after.objects[elves]!.zone === "battlefield") expect(characteristics(after, after.objects[elves]!).controller).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});
