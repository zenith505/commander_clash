// PR #28: keeping a permanent tapped in your untap step, the entwine button in the mode menu, distributing counters
// (from a spell and from an enters trigger), a job select Equipment's Hero, and the bargain sacrifice as you cast.
import { expect, test, type Page } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene, state } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

const plusOnes = (s: Awaited<ReturnType<typeof state>>, id: string) => {
  const o = s.objects[id]!;
  return (o.counters["+1/+1"] ?? 0) as number;
};

/** Activates Tawnos's Weaponry on the Bears and goes round the table to your next untap step's keep-tapped choice. */
async function weaponryToUntap(page: Page) {
  const s = scene({ board: [...LANDS, "Tawnos's Weaponry", "Grizzly Bears"] });
  const [weaponry, bears] = [one(s, "Tawnos's Weaponry"), one(s, "Grizzly Bears")];
  await open(page, s);
  await page.locator(`[data-obj="${weaponry}"]`).click();
  await menu(page).getByRole("button", { name: /gets \+1\/\+1/ }).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  let now = await resolveUntil(page, (st) => st.stack.length === 0 && st.effects.length === 1);
  expect(now.effects[0]!.whileTapped?.id).toBe(weaponry);
  await expect(page.locator(`[data-obj="${bears}"]`)).toContainText("3/3");
  // Round the table to your next untap step, where you choose what stays tapped.
  now = await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.action === "keepTapped", 200);
  await expect(controls(page)).toContainText("Untap step: click the permanents you want to keep tapped");
  await expect(controls(page).getByRole("button", { name: "Untap all" })).toBeEnabled();
  return { s, weaponry, bears, now };
}

// Split in two (one trip round the table each) to stay well inside the per-test timeout.
test("Tawnos's Weaponry: keep it tapped in the untap step and the bonus lasts", async ({ page }) => {
  test.setTimeout(120_000); // a trip round the table
  const { s, weaponry, bears } = await weaponryToUntap(page);
  await page.locator(`[data-obj="${weaponry}"]`).click();
  await controls(page).getByRole("button", { name: "Keep 1 tapped" }).click();
  const now = await resolveUntil(page, (st) => st.step === "main1" && st.activePlayer === 0);
  expect(now.objects[weaponry]!.tapped).toBe(true);
  expect(now.objects[idsOf(s, "Forest", "battlefield").at(-1)!]!.tapped).toBe(false); // the rest untapped
  await expect(page.locator(`[data-obj="${bears}"]`)).toContainText("3/3");
  expect(now.effects).toHaveLength(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Tawnos's Weaponry: untap it in the untap step and the bonus ends", async ({ page }) => {
  test.setTimeout(120_000); // a trip round the table
  const { weaponry, bears } = await weaponryToUntap(page);
  await controls(page).getByRole("button", { name: "Untap all" }).click();
  const now = await resolveUntil(page, (st) => st.step === "main1" && st.activePlayer === 0 && !st.objects[weaponry]!.tapped);
  expect(now.effects).toHaveLength(0);
  await expect(page.locator(`[data-obj="${bears}"]`)).toContainText("2/2");
  expect(pageErrors(page)).toEqual([]);
});

test("Rain of Rust: the mode menu's entwine button chooses both modes and adds the entwine cost", async ({ page }) => {
  const s = scene({ hand: ["Rain of Rust"], board: LANDS }, [{ board: ["Fist of Suns", "Wastes"] }]);
  const [fist, wastes] = [one(s, "Fist of Suns"), one(s, "Wastes")];
  await open(page, s);
  await card(page, "Rain of Rust", s).click();
  const modes = page.locator(".mode-menu");
  await expect(modes).toContainText("choose one mode");
  const entwine = modes.getByRole("button", { name: /^Entwine .*all of them/ });
  await expect(entwine).toBeEnabled();
  await entwine.click();
  await page.locator(`[data-obj="${fist}"]`).click();
  await page.locator(`[data-obj="${wastes}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[fist]!.zone).toBe("graveyard");
  expect(after.objects[wastes]!.zone).toBe("graveyard");
  expect(after.battlefield.filter((id) => after.objects[id]!.tapped && after.objects[id]!.controller === 0)).toHaveLength(9); // {3}{R}{R} + {3}{R}
  expect(pageErrors(page)).toEqual([]);
});

test("Elven Rite: two targets, then the counters are split one each and can be moved with − and +", async ({ page }) => {
  const s = scene({ hand: ["Elven Rite"], board: [...LANDS, "Grizzly Bears", "Llanowar Elves"] });
  const [bears, elves] = [one(s, "Grizzly Bears"), one(s, "Llanowar Elves")];
  await open(page, s);
  await card(page, "Elven Rite", s).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  await page.locator(`[data-obj="${elves}"]`).click();
  const panel = page.locator(".targeting", { hasText: "distribute the +1/+1 counters" });
  await expect(panel).toBeVisible();
  const bearsRow = panel.locator(".divide", { hasText: "Grizzly Bears" });
  const elvesRow = panel.locator(".divide", { hasText: "Llanowar Elves" });
  await expect(bearsRow.locator("strong")).toHaveText("1");
  await expect(elvesRow.locator("strong")).toHaveText("1");
  await bearsRow.getByRole("button", { name: "+" }).click();
  await expect(panel.getByRole("button", { name: "Done" })).toHaveCount(0); // three is too many
  await bearsRow.getByRole("button", { name: "−" }).click();
  await panel.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect([plusOnes(after, bears), plusOnes(after, elves)]).toEqual([1, 1]);
  expect(pageErrors(page)).toEqual([]);
});

test("Verdurous Gearhulk: its enters trigger distributes four counters among the creatures you click", async ({ page }) => {
  const s = scene({ hand: ["Verdurous Gearhulk"], board: [...LANDS, "Grizzly Bears"] });
  const [hulk, bears] = [one(s, "Verdurous Gearhulk"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Verdurous Gearhulk", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets");
  await page.locator(`[data-obj="${bears}"]`).click();
  await page.locator(`[data-obj="${hulk}"]`).click();
  await page.locator(".targeting").getByRole("button", { name: "Done" }).click();
  const panel = page.locator(".targeting", { hasText: "distribute the +1/+1 counters" });
  const bearsRow = panel.locator(".divide", { hasText: "Grizzly Bears" });
  const hulkRow = panel.locator(".divide", { hasText: "Verdurous Gearhulk" });
  await expect(bearsRow.locator("strong")).toHaveText("2");
  await hulkRow.getByRole("button", { name: "−" }).click();
  await bearsRow.getByRole("button", { name: "+" }).click();
  await panel.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect([plusOnes(after, bears), plusOnes(after, hulk)]).toEqual([3, 1]);
  expect(pageErrors(page)).toEqual([]);
});

test("Monk's Fist: job select makes a Hero token wearing it", async ({ page }) => {
  const s = scene({ hand: ["Monk's Fist"], board: LANDS });
  const fist = one(s, "Monk's Fist");
  await open(page, s);
  await card(page, "Monk's Fist", s).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !!st.objects[fist]!.attachedTo);
  const hero = after.objects[after.objects[fist]!.attachedTo!]!;
  expect(after.cards[hero.cardId]!.name).toBe("Hero Token");
  await expect(page.locator(`[data-obj="${hero.id}"]`)).toContainText("2/1");
  expect(pageErrors(page)).toEqual([]);
});

test("Candy Grapple: bargain offers your artifact to sacrifice as you cast it, for -5/-5 instead of -3/-3", async ({ page }) => {
  const s = scene({ hand: ["Candy Grapple"], board: [...LANDS, "Ornithopter", "Grizzly Bears"] }, [{ board: ["Hill Giant"] }]);
  const [thopter, bears, giant] = [one(s, "Ornithopter"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Candy Grapple", s).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  const bar = page.locator(".targeting", { hasText: "bargain: you may sacrifice an artifact, enchantment, or token" });
  await expect(bar).toBeVisible();
  await expect(bar.getByRole("button", { name: "Cast without" })).toBeVisible();
  await page.locator(`[data-obj="${bears}"]`).click(); // not an artifact, enchantment, or token: nothing happens
  await expect(bar.getByRole("button", { name: "Sacrifice and cast" })).toBeDisabled();
  await page.locator(`[data-obj="${thopter}"]`).click();
  await bar.getByRole("button", { name: "Sacrifice and cast" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[thopter]!.zone).toBe("graveyard");
  expect(after.objects[giant]!.zone).toBe("graveyard"); // a 3/3 with -5/-5
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
