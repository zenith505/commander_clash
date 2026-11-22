// Round 449 in the browser: Saruman of Many Colors. Its ward (you Shock Ana's Saruman: Pay, then only an enchantment,
// instant or sorcery card can be discarded, picked from two) and its second-spell trigger (Divination then Night's Whisper: each opponent
// mills two, then the reflexive trigger's target, a card with mana value 2 or less in an opponent's graveyard: Ana's
// Lightning Bolt, not her Mind Rot; its copy cast for free at Ana).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, modal, resolveUntil } from "./ui";

const SARUMAN = "Saruman of Many Colors";

test("Saruman's ward: Pay, then discard Opt over Holy Strength (Grizzly Bears can't be), and Shock resolves", async ({ page }) => {
  const s = scene({ hand: ["Shock", "Grizzly Bears", "Opt", "Holy Strength"], board: LANDS }, [{ board: [SARUMAN] }]);
  const [saruman, bears, opt, holy] = [one(s, SARUMAN), one(s, "Grizzly Bears"), one(s, "Opt"), one(s, "Holy Strength")];
  await open(page, s);
  await card(page, "Shock", s).click();
  await page.locator(`[data-obj="${saruman}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "payUnless" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("discard an enchantment, instant, or sorcery card or Shock is countered");
  await bar.getByRole("button", { name: "Pay", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "discard" && st.pending.player === 0);
  await expect(bar).toContainText("click 1 enchantment, instant, or sorcery card in your hand to discard");
  // Grizzly Bears isn't one: Discard stays off.
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await expect(bar.getByRole("button", { name: "Discard" })).toBeDisabled();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await page.locator(`[data-obj="${opt}"]`).first().click();
  await bar.getByRole("button", { name: "Discard" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[opt]!.zone === "graveyard");
  expect(after.objects[saruman]!.damage).toBe(2);
  expect(after.objects[bears]!.zone).toBe("hand");
  expect(after.objects[holy]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("Saruman's second-spell trigger: Ana mills Lightning Bolt and Mind Rot; exile the Bolt and cast its copy at Ana", async ({ page }) => {
  const s = scene({ hand: ["Divination", "Night's Whisper"], board: [...LANDS, SARUMAN] }, [{ library: ["Lightning Bolt", "Mind Rot"] }]);
  const [bolt, rot, whisper, div] = [one(s, "Lightning Bolt"), one(s, "Mind Rot"), one(s, "Night's Whisper"), one(s, "Divination")];
  await open(page, s);
  await card(page, "Divination", s).click();
  const first = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[div]!.zone === "graveyard");
  expect(first.objects[bolt]!.zone).toBe("library");
  await card(page, "Night's Whisper", s).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  expect(asked.objects[bolt]!.zone).toBe("graveyard");
  expect(asked.objects[rot]!.zone).toBe("graveyard");
  expect(asked.objects[whisper]!.zone).toBe("stack");
  // Night's Whisper has mana value 2: Mind Rot (3) can't be the target.
  await expect(modal(page).locator(`[data-pick="${rot}"]`)).toHaveCount(0);
  await modal(page).locator(`[data-pick="${bolt}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong" && st.pending.player === 0);
  const bar = controls(page);
  await bar.getByRole("button", { name: "Lightning Bolt" }).click();
  const offer = await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.player === 0);
  expect(offer.objects[bolt]!.zone).toBe("exile");
  const life = offer.players[1]!.life;
  await bar.getByRole("button", { name: "Cast it" }).click();
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[1]!.life === life - 3);
  expect(after.objects[bolt]!.zone).toBe("exile");
  expect(after.objects[rot]!.zone).toBe("graveyard");
  expect(after.objects[whisper]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
