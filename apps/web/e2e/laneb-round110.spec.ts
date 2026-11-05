// Lane B round B110 in the browser: a target chosen by another player. The Abyss (Ana's) asks you which of your
// nonartifact creatures it destroys on your upkeep; your Mausoleum Turnkey asks which opponent chooses the card it
// returns, and that opponent picks.
import { expect, test } from "@playwright/test";
import { applyAction, planCast } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("The Abyss: on your upkeep you choose for Ana's ability; your artifact creature can't be chosen, Craw Wurm is destroyed", async ({ page }) => {
  const s0 = scene({ board: ["Grizzly Bears", "Craw Wurm", "Ornithopter"] }, [{ board: ["The Abyss"] }]);
  const [bears, wurm, thopter] = [one(s0, "Grizzly Bears"), one(s0, "Craw Wurm"), one(s0, "Ornithopter")];
  const s = playUntil(s0, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  expect(s.pending).toMatchObject({ kind: "chooseTargets", player: 0, controller: 1 });
  await open(page, s);
  const bar = page.locator(".targeting");
  await expect(bar).toContainText("You choose the target for Ana's ability: The Abyss");
  await expect(bar).toContainText("choose target nonartifact creature you control (1/1)");
  // Ornithopter is an artifact: clicking it chooses nothing.
  await card(page, "Ornithopter", s).click();
  await expect(bar).toBeVisible();
  await card(page, "Craw Wurm", s).click();
  const after = await resolveUntil(page, (st) => st.objects[wurm]!.zone === "graveyard" && st.stack.length === 0);
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(after.objects[thopter]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Mausoleum Turnkey: you pick Ben to choose, and Ben returns your cheapest creature card, Grizzly Bears", async ({ page }) => {
  const s0 = scene({ hand: ["Mausoleum Turnkey"], board: LANDS, yard: ["Grizzly Bears", "Craw Wurm"] });
  const [turnkey, bears, wurm] = [one(s0, "Mausoleum Turnkey"), one(s0, "Grizzly Bears"), one(s0, "Craw Wurm")];
  let s = s0;
  for (const a of planCast(s, 0, turnkey)!) s = applyAction(s, a);
  s = playUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.player === 0);
  expect(s.pending).toMatchObject({ kind: "chooseOption", what: "targetChooser", options: ["1", "2", "3"] });
  await open(page, s);
  await expect(controls(page)).toContainText("Mausoleum Turnkey: which opponent chooses target creature card from your graveyard?");
  await controls(page).getByRole("button", { name: "Ben", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.objects[bears]!.zone === "hand" && st.stack.length === 0);
  expect(after.objects[wurm]!.zone).toBe("graveyard");
  expect(after.log.some((l) => l.text === "Ben chooses the target of Mausoleum Turnkey's ability (picked by You).")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
