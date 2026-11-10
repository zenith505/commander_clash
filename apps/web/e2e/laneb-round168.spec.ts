// Lane B round B168 in the browser: Psychotic Episode's picker offers the revealed hand and the top card of the library,
// and Exotic Pets asks, for each kind of counter among your creatures, which Fish gets one.
import { expect, test } from "@playwright/test";
import { invalidateCharacteristics } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, modal, resolveUntil } from "./ui";

test("Psychotic Episode: pick the top card of Ana's library from among her revealed cards; it goes to the bottom", async ({ page }) => {
  const s = scene({ hand: ["Psychotic Episode"], board: LANDS }, [{ hand: ["Grizzly Bears", "Hill Giant"], library: ["Shock"] }]);
  const [bears, giant, shock] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Shock")];
  await open(page, s);
  await card(page, "Psychotic Episode", s).click();
  await clickPlayer(page, 1);
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  expect([...(asked.pending as { cards: string[] }).cards].sort()).toEqual([bears, giant, shock].sort());
  const pick = modal(page);
  for (const id of [bears, giant, shock]) await expect(pick.locator(`[data-pick="${id}"]`)).toBeVisible();
  await pick.locator(`[data-pick="${shock}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[1]!.library.at(-1) === shock);
  expect(after.objects[shock]!.zone).toBe("library");
  expect(after.players[1]!.hand.sort()).toEqual([bears, giant].sort());
  expect(pageErrors(page)).toEqual([]);
});

test("Exotic Pets: each kind of counter among your creatures goes on the Fish you choose", async ({ page }) => {
  const s = scene({ hand: ["Exotic Pets"], board: ["Hill Giant", ...LANDS] });
  const giant = one(s, "Hill Giant");
  s.objects[giant]!.counters = { "+1/+1": 2, flying: 1 };
  invalidateCharacteristics(s);
  await open(page, s);
  await card(page, "Exotic Pets", s).click();
  let st = await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "eitherToken" && x.pending.counterKind === "+1/+1");
  const fish = (st.pending as { options: string[] }).options;
  expect(fish).toHaveLength(2);
  const bar = controls(page);
  await expect(bar).toContainText("choose the token that gets a +1/+1 counter");
  await bar.getByRole("button", { name: "Fish Token 2", exact: true }).click();
  st = await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "eitherToken" && x.pending.counterKind === "flying");
  await bar.getByRole("button", { name: "Fish Token 1", exact: true }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && (x.objects[fish[0]!]?.counters.flying ?? 0) > 0);
  expect(after.objects[fish[1]!]!.counters).toEqual({ "+1/+1": 1 });
  expect(after.objects[fish[0]!]!.counters).toEqual({ flying: 1 });
  expect(st.pending?.kind).toBe("chooseOption");
  expect(pageErrors(page)).toEqual([]);
});
