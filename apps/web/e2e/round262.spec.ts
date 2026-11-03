// Round 262's prompts: Inferno of the Star Mounts (its pump makes its power 20: the reflexive trigger's target, chosen
// then) and Long River Lurker (the creature it made unblockable deals combat damage: exile and return it, or not).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { attack, card, clickPlayer, controls, menu, resolveUntil } from "./ui";

test("Inferno of the Star Mounts: pumping it from 19 to 20 power asks for a target and deals 20 damage to Ana", async ({ page }) => {
  const s = scene({ board: ["Inferno of the Star Mounts", ...LANDS] });
  const inferno = one(s, "Inferno of the Star Mounts");
  s.objects[inferno]!.counters["+1/+1"] = 13;
  await open(page, s);
  await card(page, "Inferno of the Star Mounts", s).click();
  await menu(page).locator("button", { hasText: "gets +1/+0 until end of turn" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await expect(page.locator(".control-pane")).toContainText("choose any target");
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[1]!.life === 20);
  expect(after.players[1]!.life).toBe(20);
  expect(pageErrors(page)).toEqual([]);
});

test("Long River Lurker: Grizzly Bears can't be blocked; after it deals combat damage, Yes exiles and returns it untapped", async ({ page }) => {
  const s = scene({ hand: ["Long River Lurker"], board: ["Grizzly Bears", ...LANDS] });
  const bears = one(s, "Grizzly Bears");
  await open(page, s);
  await card(page, "Long River Lurker", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await card(page, "Grizzly Bears", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  await attack(page, [[bears, 1]]);
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  expect(asked.players[1]!.life).toBe(38);
  const zc = asked.objects[bears]!.zoneChanges ?? 0;
  const bar = controls(page);
  await expect(bar).toContainText("Long River Lurker");
  await bar.getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && (st.objects[bears]!.zoneChanges ?? 0) > zc);
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(after.objects[bears]!.tapped).toBe(false);
  expect(pageErrors(page)).toEqual([]);
});
