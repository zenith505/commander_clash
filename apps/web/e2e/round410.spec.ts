// Round 410 in the browser: keyword costs given to the spells you cast. Zinnia, Valley's Voice gives Grizzly Bears
// offspring {2}: the cast asks whether to pay it, and paid, a 1/1 token copy enters with it (CR 702.175a). Ashling, the
// Limitless gives Air Elemental in your hand evoke {4}: cast for it, it's sacrificed as it enters and Ashling makes a hasty
// token copy, kept at your end step by paying {W}{U}{B}{R}{G} (CR 702.74a).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, passTo, resolveUntil } from "./ui";

test("Zinnia: Grizzly Bears cast paying offspring {2} from Zinnia, and a 1/1 token copy enters too", async ({ page }) => {
  const s = scene({ hand: ["Grizzly Bears"], board: [...LANDS, "Zinnia, Valley's Voice"] });
  const bears = one(s, "Grizzly Bears");
  await open(page, s);
  await card(page, "Grizzly Bears", s).click();
  const cast = menu(page).getByRole("button", { name: /^Cast it/ });
  if (await cast.count()) await cast.click();
  const bar = page.locator("[data-offspring-pick]");
  await expect(bar).toContainText("Grizzly Bears: offspring (pay to create a 1/1 token copy of it as it enters)?");
  await expect(bar).toContainText("(Zinnia, Valley's Voice)");
  await expect(bar.getByRole("button", { name: "Don't pay offspring" })).toBeVisible();
  await bar.getByRole("checkbox", { name: "Pay offspring from Zinnia, Valley's Voice" }).check();
  await bar.getByRole("button", { name: "Pay offspring" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield" && st.battlefield.some((id) => st.objects[id]!.isToken));
  const token = after.battlefield.find((id) => after.objects[id]!.isToken)!;
  expect(after.cards[after.objects[token]!.cardId]!.name).toBe("Grizzly Bears");
  expect(after.battlefield.filter((id) => after.objects[id]!.controller === 0 && after.objects[id]!.tapped).length).toBe(4);
  expect(after.log.some((l) => /You casts? Grizzly Bears, paying offspring \{2\} \(from Zinnia, Valley's Voice\)/.test(l.text))).toBe(true);
  await expect(page.locator(`[data-obj="${token}"]`).first()).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test("Ashling: Air Elemental evoked for {4}, sacrificed, copied as a hasty token, kept at the end step for {W}{U}{B}{R}{G}", async ({ page }) => {
  // Six of each basic: {4} leaves every color to pay {W}{U}{B}{R}{G} with.
  const s = scene({ hand: ["Air Elemental"], board: [...LANDS, ...LANDS, "Ashling, the Limitless"] });
  const elemental = one(s, "Air Elemental");
  await open(page, s);
  await card(page, "Air Elemental", s).click();
  const evoke = menu(page).getByRole("button", { name: /^Evoke/ });
  await expect(evoke).toHaveAttribute("title", "it's sacrificed as it enters (evoke from Ashling, the Limitless)");
  await evoke.click();
  const copied = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[elemental]!.zone === "graveyard" && st.battlefield.some((id) => st.objects[id]!.isToken));
  const token = copied.battlefield.find((id) => copied.objects[id]!.isToken)!;
  expect(copied.cards[copied.objects[token]!.cardId]!.name).toBe("Air Elemental");
  expect(copied.battlefield.filter((id) => copied.objects[id]!.controller === 0 && copied.objects[id]!.tapped).length).toBe(4);
  await expect(page.locator(`[data-obj="${token}"]`).first()).toBeVisible();
  await passTo(page, "end");
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await expect(controls(page)).toContainText("Pay WUBRG to keep Air Elemental?");
  await controls(page).getByRole("button", { name: "Pay", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[token]!.zone).toBe("battlefield");
  expect(after.battlefield.filter((id) => after.objects[id]!.controller === 0 && after.objects[id]!.tapped).length).toBe(9);
  expect(pageErrors(page)).toEqual([]);
});
