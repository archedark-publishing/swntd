import { describe, expect, it } from "vitest";
import { getCommitmentIntervalBuckets } from "./commitment-progress";

describe("commitment interval progress", () => {
  it("prorates a partial week and excludes checkins outside the period", () => {
    const result = getCommitmentIntervalBuckets({ targetCount: 3, trackingInterval: "weekly", checkins: [
      { id: "1", actor: null, amount: 2, checkinOn: "2026-09-01", createdAt: "", updatedAt: "", note: "" },
      { id: "2", actor: null, amount: 99, checkinOn: "2026-08-31", createdAt: "", updatedAt: "", note: "" }
    ] }, { periodStartOn: "2026-09-01", closureOn: "2026-09-10" }, "2026-09-09");
    expect(result.buckets.map((b) => b.targetCount)).toEqual([3, 2]);
    expect(result.periodTotal).toBe(2);
    expect(result.periodTarget).toBe(5);
    expect(result.currentBucket.startOn).toBe("2026-09-08");
  });
  it("clamps month boundaries without losing the original anchor", () => {
    const result = getCommitmentIntervalBuckets({ targetCount: 4, trackingInterval: "monthly", checkins: [] },
      { periodStartOn: "2026-01-31", closureOn: "2026-04-01" });
    expect(result.buckets.map((b) => [b.startOn, b.endOn])).toEqual([
      ["2026-01-31", "2026-02-27"], ["2026-02-28", "2026-03-30"], ["2026-03-31", "2026-04-01"]
    ]);
    expect(result.periodTarget).toBe(9);
  });
  it("includes the closure day and handles a single whole-period target", () => {
    const result = getCommitmentIntervalBuckets({ targetCount: 5, trackingInterval: "none", checkins: [] },
      { periodStartOn: "2026-09-01", closureOn: "2026-09-01" }, "2026-09-01");
    expect(result.buckets).toHaveLength(1);
    expect(result.currentBucket.isCurrent).toBe(true);
    expect(result.periodTarget).toBe(5);
  });
});
