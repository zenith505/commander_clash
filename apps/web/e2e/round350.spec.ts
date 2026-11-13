// Round 350's prompts: Breathkeeper Seraph's "you may return it ... at the beginning of your next upkeep" (a Yes in that
// upkeep) and Timothar, Baron of Bats's "you may pay {1} and exile it" (Pay, then a Bat token).
import { expect, test } from "@playwright/test";
import { moveObject, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

test("Breathkeeper Seraph: the paired Grizzly Bears dies; in your next upkeep click Yes and it returns", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Breathkeeper Seraph", "Grizzly Bears"] });
  const [seraph, bears] = [one(s0, "Breathkeeper Seraph"), one(s0, "Grizzly Bears")];
  s0.objects[seraph]!.paired = { id: bears, zc: s0.objects[bears]!.zoneChanges ?? 0, by: 0 };
  s0.objects[bears]!.paired = { id: seraph, zc: s0.objects[seraph]!.zoneChanges ?? 0, by: 0 };
  moveObject(s0, bears, "graveyard");
  const s = playUntil(s0, (st: GameState) => st.pending?.kind === "chooseMay" && st.pending.player === 0 && st.step === "upkeep" && st.activePlayer === 0);
  expect(s.objects[bears]!.zone).toBe("graveyard");
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Grizzly Bears");
  await bar.getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[bears]!.zone === "battlefield");
  expect(after.objects[bears]!.controller).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Timothar, Baron of Bats: your Vampire Nighthawk dies; click Pay and it's exiled for a 1/1 flying Bat", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Timothar, Baron of Bats", "Vampire Nighthawk"] });
  const hawk = one(s0, "Vampire Nighthawk");
  moveObject(s0, hawk, "graveyard");
  const s = playUntil(s0, (st: GameState) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  expect(s.pending).toMatchObject({ kind: "chooseMay", player: 0, pay: { mana: "{1}" } });
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Timothar, Baron of Bats:");
  await bar.getByRole("button", { name: "Pay", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[hawk]!.zone === "exile");
  const bats = after.battlefield.filter((id) => after.objects[id]!.isToken && after.objects[id]!.controller === 0);
  expect(bats.length).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});
