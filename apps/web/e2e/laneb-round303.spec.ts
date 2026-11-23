// Lane B round B303 in the browser: Turtles Forever's search takes exactly four legendary creature cards with different
// names or none (Done stays off with three; one of two Isamarus and no nonlegendary creature is offered), then you choose
// the opponent who picks the two for your hand; the other two are shuffled back into your library.
import { expect, test } from "@playwright/test";
import { LANDS, open, pageErrors, scene } from "./scene";
import { card, controls, modal, resolveUntil } from "./ui";

test("Turtles Forever: three found isn't enough, four are; Ben picks the two for your hand, the rest go back", async ({ page }) => {
  const legends = ["Isamaru, Hound of Konda", "Thalia, Guardian of Thraben", "Adeline, Resplendent Cathar", "Ragavan, Nimble Pilferer"];
  const s = scene({ hand: ["Turtles Forever"], board: LANDS, library: [...legends, "Isamaru, Hound of Konda", "Mother of Runes"] });
  const lib = s.players[0]!.library;
  const named = (n: string) => lib.filter((id) => s.cards[s.objects[id]!.cardId]!.name === n);
  const isamarus = named("Isamaru, Hound of Konda");
  const [mother] = named("Mother of Runes");
  await open(page, s);
  await card(page, "Turtles Forever", s).click();
  const at = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const offered = (at.pending as { cards: string[] }).cards;
  const picks = legends.map((n) => offered.find((id) => named(n).includes(id))!);
  const search = modal(page);
  // One of the two Isamarus is offered (cards with the same name in a library are alike); Mother of Runes isn't legendary.
  expect(offered.filter((id) => isamarus.includes(id))).toHaveLength(1);
  await expect(search.locator(`[data-pick="${mother}"]`)).toHaveCount(0);
  for (const id of picks.slice(0, 3)) await search.locator(`[data-pick="${id}"]`).click();
  await expect(search).toContainText("Found 3: exactly 4 or none.");
  await expect(search.getByRole("button", { name: "Done" })).toBeDisabled();
  await search.locator(`[data-pick="${picks[3]}"]`).click();
  await search.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "opponent");
  await controls(page).getByRole("button", { name: "Ben", exact: true }).click();
  // Ben (a bot) chooses two of the four for your hand; the other two are shuffled back into your library.
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && picks.some((id) => st.objects[id]!.zone === "hand"));
  expect(picks.filter((id) => after.objects[id]!.zone === "hand")).toHaveLength(2);
  expect(picks.filter((id) => after.objects[id]!.zone === "library")).toHaveLength(2);
  expect(after.log.some((l) => /shuffles the rest into their library/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
