// Round 268's prompt: Sorcerous Squall's "cast an instant or sorcery spell from that player's graveyard without paying
// its mana cost": a button for each such card in that opponent's graveyard (not only the milled ones), then the spell
// is exiled instead of going to a graveyard.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, resolveUntil } from "./ui";

test("Sorcerous Squall: mill nine, then cast Divination from that opponent's graveyard; it's exiled after", async ({ page }) => {
  const s = scene({ hand: ["Sorcerous Squall"], board: LANDS }, [{ yard: ["Divination", "Grizzly Bears"] }]);
  const [div, bears] = [one(s, "Divination"), one(s, "Grizzly Bears")];
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  await card(page, "Sorcerous Squall", s).click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("cast an instant or sorcery spell from Ana's graveyard without paying its mana cost?");
  await expect(bar.getByRole("button", { name: /^Grizzly Bears/ })).toHaveCount(0);
  await bar.getByRole("button", { name: /^Divination/ }).click();
  await bar.getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[div]!.zone === "exile");
  // Squall left the hand; Divination drew two.
  expect(after.players[0]!.hand.length).toBe(hand - 1 + 2);
  expect(after.players[1]!.graveyard.length).toBeGreaterThanOrEqual(10);
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
