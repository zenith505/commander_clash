// Lane B round B135 in the browser: Grave Consequences' "any number of cards" from your graveyard (two of three picked,
// then 1 life lost for the one left) and Void's number, chosen as it resolves (0 to 20).
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, modal, resolveUntil } from "./ui";

test("Grave Consequences: exile two of the three cards in your graveyard, lose 1 life for the one left", async ({ page }) => {
  const s = scene({ hand: ["Grave Consequences"], board: ["Swamp", "Swamp"], yard: ["Hill Giant", "Shock", "Wind Drake"] });
  const [giant, shock, drake] = [one(s, "Hill Giant"), one(s, "Shock"), one(s, "Wind Drake")];
  await open(page, s);
  await card(page, "Grave Consequences", s).click();
  const st = await resolveUntil(page, (x) => x.pending?.kind === "searchLibrary" && x.pending.player === 0);
  expect(st.pending?.kind === "searchLibrary" && [st.pending.min, st.pending.max]).toEqual([0, 3]);
  const pick = modal(page);
  await expect(pick).toContainText("Grave Consequences: you may exile any number of cards from your graveyard");
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.locator(`[data-pick="${shock}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending && x.objects[one(s, "Grave Consequences")]!.zone === "graveyard");
  expect([giant, shock, drake].map((id) => after.objects[id]!.zone)).toEqual(["exile", "exile", "graveyard"]);
  expect(after.players[0]!.life).toBe(39);
  expect(pageErrors(page)).toEqual([]);
});

test("Void: choose 2 as it resolves; Ana's Grizzly Bears are destroyed and her Counterspell discarded", async ({ page }) => {
  const s = scene({ hand: ["Void"], board: LANDS }, [{ board: ["Grizzly Bears", "Hill Giant"], hand: ["Llanowar Elves", "Counterspell"] }]);
  const [bears, giant, elves, counter] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Llanowar Elves"), one(s, "Counterspell")];
  expect(idsOf(s, "Grizzly Bears", "battlefield", 1)).toEqual([bears]);
  await open(page, s);
  await card(page, "Void", s).click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "number");
  const bar = controls(page);
  await expect(bar).toContainText("choose a number between 0 and 20");
  await bar.getByRole("button", { name: "Number plus one" }).click();
  await bar.getByRole("button", { name: "Number plus one" }).click();
  await bar.getByRole("button", { name: "Choose 2" }).click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending && x.objects[one(s, "Void")]!.zone === "graveyard");
  expect([bears, giant].map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "battlefield"]);
  // Counterspell has mana value 2, Llanowar Elves 1.
  expect([counter, elves].map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "hand"]);
  expect(pageErrors(page)).toEqual([]);
});
