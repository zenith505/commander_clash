// Lane B round B165 in the browser: Null Chamber asks you for an opponent, then you and that opponent each name a card,
// you first (the active player, CR 101.4); spells and lands with either name are banned.
import { expect, test } from "@playwright/test";
import { castProblem } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, modal, resolveUntil } from "./ui";

test("Null Chamber: choose Ana, name Mind Stone; Ana names one of yours; Mind Stone can't be cast", async ({ page }) => {
  const s = scene({ hand: ["Null Chamber", "Lightning Bolt"], board: LANDS }, [{ hand: ["Mind Stone"] }]);
  const [chamber, stone] = [one(s, "Null Chamber"), one(s, "Mind Stone")];
  await open(page, s);
  await card(page, "Null Chamber", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "player" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "You (you)", exact: true })).toHaveCount(0);
  await bar.getByRole("button", { name: "Ana", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "cardName" && st.pending.player === 0);
  const pick = modal(page);
  await expect(pick).toContainText("Null Chamber: choose a card other than a basic land card name: spells with it can't be cast and lands with it can't be played");
  await expect(pick.locator('[data-name="Forest"]')).toHaveCount(0);
  // Mind Stone is in Ana's hand, unseen: typed.
  await pick.getByPlaceholder("Type a card name…").fill("Mind Stone");
  await pick.getByPlaceholder("Type a card name…").press("Enter");
  // Ana, a bot, names hers next.
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[chamber]!.chosen?.opponentName !== undefined);
  const chosen = after.objects[chamber]!.chosen!;
  expect(chosen.name).toBe("Mind Stone");
  expect(chosen.player).toBe(1);
  expect(after.log.some((l) => l.text.includes(`Ana chooses ${chosen.opponentName} for Null Chamber`))).toBe(true);
  after.players[1]!.manaPool.C = 2;
  expect(castProblem(after, 1, stone)).toMatch(/can't be cast/);
  expect(pageErrors(page)).toEqual([]);
});
