// The deck builder: from the main menu, search in Scryfall's syntax, choose a commander (its colors then filter the
// search), add cards, import a list, read the stats, save the deck, and play it from the menu.
import { expect, test, type Page } from "@playwright/test";
import { idsOf, pageErrors, state, watchErrors } from "./scene";
import { controls } from "./ui";

async function search(page: Page, q: string) {
  await page.getByTestId("card-search").fill(q);
  await page.getByTestId("card-search").press("Enter");
}

async function openBuilder(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.getByTestId("open-builder").click();
  // The card pool loads (about 5 MB, unzipped in the browser).
  await expect(page.getByTestId("card-search")).toBeVisible({ timeout: 30_000 });
}

const LIST = `Commander
1 Altanak, the Thrice-Called

Deck
1 Sol Ring (CMR) 263
1x Llanowar Elves
97 Forest
SB: 1 Lightning Bolt`;

test("build a deck: search, commander, color identity filter, add cards, stats", async ({ page }) => {
  watchErrors(page);
  await openBuilder(page);
  await expect(page.getByTestId("result-count")).not.toHaveText(/^0 /);

  await search(page, '!"Altanak, the Thrice-Called"');
  await expect(page.getByTestId("result-count")).toHaveText("1 card");
  await page.locator('[data-result="Altanak, the Thrice-Called"] .tile-image').click();
  await expect(page.getByTestId("card-detail")).toBeVisible();
  await page.getByTestId("make-commander").click();
  await expect(page.getByTestId("commander")).toContainText("Altanak, the Thrice-Called");
  await expect(page.getByTestId("deck-count")).toHaveText("1 / 100");

  // A mono-green commander: red cards are filtered out until the filter is turned off.
  await search(page, '!"Lightning Bolt"');
  await expect(page.getByTestId("result-count")).toHaveText("0 cards");
  await expect(page.getByText("Only green cards")).toBeVisible();
  await page.getByTestId("identity-filter").uncheck();
  // Lightning Bolt, and Emeritus of Conflict // Lightning Bolt (a face's name counts, as on Scryfall).
  await expect(page.locator('[data-result="Lightning Bolt"]')).toBeVisible();
  await expect(page.getByTestId("result-count")).toHaveText("2 cards");
  await page.getByTestId("identity-filter").check();

  // Scryfall syntax: green creatures with mana value 1 are all green (or colorless) and cost 1.
  await search(page, "t:creature c=g mv=1 llanowar");
  await expect(page.locator('[data-result="Llanowar Elves"]')).toBeVisible();
  await page.locator('[data-add="Llanowar Elves"]').click();
  // Singleton: a second copy can't be added.
  await expect(page.locator('[data-add="Llanowar Elves"]')).toBeDisabled();
  await search(page, "sol ring");
  await page.locator('[data-add="Sol Ring"]').click();
  await expect(page.getByTestId("deck-count")).toHaveText("3 / 100");
  // The cards show as images in the deck.
  await expect(page.locator('[data-deck-card="Sol Ring"] img')).toHaveAttribute("src", /scryfall/);

  // A filter it doesn't know is reported.
  await search(page, "usd<5 forest");
  await expect(page.getByTestId("search-problems")).toContainText("usd");

  // Stats: three cards, no lands yet, one creature at 1 mana (Llanowar Elves).
  const stats = page.getByTestId("deck-stats");
  await expect(stats.locator('[data-stat="total"]')).toHaveText("3 / 100");
  await expect(stats.locator('[data-stat="lands"]')).toHaveText("0");
  await expect(stats.locator('[data-curve="1"]')).toHaveAttribute("aria-label", /1 mana: 2 cards \(1 creature, 1 other\)/);
  await expect(page.getByTestId("deck-problems")).toContainText("to fix");
  expect(pageErrors(page)).toEqual([]);
});

test("import a deck list, save it, and play it from the menu", async ({ page }) => {
  watchErrors(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.getByTestId("open-import").click();
  await expect(page.getByTestId("import-dialog")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("import-text").fill(`${LIST}\n1 Not A Real Card`);
  await expect(page.getByTestId("import-summary")).toContainText("99 cards and commander Altanak, the Thrice-Called, 1 sideboard/maybeboard left out");
  await expect(page.getByTestId("import-unknown")).toContainText("Not A Real Card");
  await page.getByTestId("import-confirm").click();
  await expect(page.getByTestId("deck-count")).toHaveText("100 / 100");
  await expect(page.getByTestId("deck-ready")).toBeVisible();

  // Stats for 97 Forests: opening hands are nearly all lands.
  await expect(page.getByTestId("deck-stats").locator('[data-stat="lands"]')).toHaveText("97");
  await expect(page.getByTestId("deck-stats").locator('[data-type-count="Land"]')).toContainText("97");

  await page.getByLabel("Deck name").fill("Forest Friends");
  await page.getByTestId("save-deck").click();
  await expect(page.getByRole("status")).toContainText('Saved "Forest Friends"');
  await page.getByTestId("builder-back").click();

  const saved = page.locator('[data-saved-deck="Forest Friends"]');
  await expect(saved).toBeVisible();
  await expect(saved).toContainText("100 / 100");
  await saved.locator('[data-play="Forest Friends"]').click();
  // The game starts with your deck: the mulligan decision, and your commander in your command zone.
  await expect(controls(page).getByRole("button", { name: "Keep" })).toBeVisible({ timeout: 20_000 });
  const st = await state(page);
  expect(idsOf(st, "Altanak, the Thrice-Called", "command", 0)).toHaveLength(1);
  expect(idsOf(st, "Forest", undefined, 0).length).toBe(97);
  expect(pageErrors(page)).toEqual([]);
});

test("a saved deck can be edited, exported and deleted", async ({ page }) => {
  watchErrors(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.getByTestId("open-import").click();
  await page.getByTestId("import-text").fill("1 Altanak, the Thrice-Called\n1 Sol Ring\n10 Forest");
  // No commander section: pick the commander from the list's legendary creatures.
  await page.locator('[data-pick-commander="Altanak, the Thrice-Called"]').click();
  await page.getByTestId("import-confirm").click();
  await expect(page.getByTestId("commander")).toContainText("Altanak, the Thrice-Called");
  await expect(page.getByTestId("deck-count")).toHaveText("12 / 100");
  await page.getByTestId("save-deck").click();
  await page.getByTestId("builder-back").click();

  // Named after its commander.
  const saved = page.locator('[data-saved-deck="Altanak, the Thrice-Called"]');
  await expect(saved).toContainText("12 / 100");
  // Not 100 cards: it can't be played yet, and says why.
  await expect(saved.locator('[data-play="Altanak, the Thrice-Called"]')).toBeDisabled();
  await expect(saved).toContainText("needs 100");

  await saved.locator('[data-edit="Altanak, the Thrice-Called"]').click();
  await expect(page.getByTestId("deck-count")).toHaveText("12 / 100");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.locator('[data-deck-line="Forest"]')).toContainText("10");
  await page.getByRole("button", { name: "Add another Forest" }).first().click();
  await expect(page.getByTestId("deck-count")).toHaveText("13 / 100");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.getByTestId("export-text")).toHaveValue("Commander\n1 Altanak, the Thrice-Called\n\nDeck\n11 Forest\n1 Sol Ring");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByTestId("save-deck").click();
  await page.getByTestId("builder-back").click();
  await expect(saved).toContainText("13 / 100");

  await saved.locator('[data-delete="Altanak, the Thrice-Called"]').click();
  await saved.locator('[data-confirm-delete="Altanak, the Thrice-Called"]').click();
  await expect(page.locator("[data-saved-deck]")).toHaveCount(0);
  expect(pageErrors(page)).toEqual([]);
});

test("the deck builder fits a phone screen, with tabs for search, deck and stats", async ({ page }) => {
  watchErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openBuilder(page);
  await search(page, "sol ring");
  await page.locator('[data-add="Sol Ring"]').click();
  await page.locator('[data-tab="deck"]').click();
  await expect(page.locator('[data-deck-card="Sol Ring"]')).toBeVisible();
  await expect(page.getByTestId("card-search")).toBeHidden();
  await page.locator('[data-tab="stats"]').click();
  await expect(page.getByTestId("deck-stats").locator('[data-stat="total"]')).toHaveText("1 / 100");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(pageErrors(page)).toEqual([]);
});
