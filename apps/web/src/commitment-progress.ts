import type { Commitment, CommitmentPeriod } from "./api";

export function isoDateFromUtc(date: Date) { return date.toISOString().slice(0, 10); }
const dateLabel = (on: string) => new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(date(on));
const dayMs = 86_400_000;
const date = (on: string) => new Date(`${on}T00:00:00.000Z`);
const addDays = (start: Date, days: number) => new Date(start.getTime() + days * dayMs);

// Anchor every month to the original start day; Jan 31 -> Feb 28 -> Mar 31.
function monthBoundary(start: Date, offset: number) {
  const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + offset, 1));
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(start.getUTCDate(), lastDay));
  return next;
}

export function getCommitmentIntervalBuckets(
  commitment: Pick<Commitment, "targetCount" | "trackingInterval" | "checkins">,
  period: Pick<CommitmentPeriod, "periodStartOn" | "closureOn"> | null,
  today = isoDateFromUtc(new Date())
) {
  const targetCount = Math.max(1, commitment.targetCount ?? 1);
  const start = date(period?.periodStartOn ?? today);
  // Closure is inclusive, consistent with the task lookback and existing periods.
  const end = addDays(date(period?.closureOn ?? today), 1);
  const buckets: Array<{
    amount: number; checkins: Commitment["checkins"]; endOn: string;
    isCurrent: boolean; label: string; startOn: string; targetCount: number;
  }> = [];
  let cursor = start;
  let index = 1;
  while (cursor < end) {
    const next = commitment.trackingInterval === "monthly" ? monthBoundary(start, index)
      : commitment.trackingInterval === "weekly" ? addDays(cursor, 7)
      : commitment.trackingInterval === "daily" ? addDays(cursor, 1) : end;
    const bounded = next > end ? end : next;
    const startOn = isoDateFromUtc(cursor);
    const endOn = isoDateFromUtc(addDays(bounded, -1));
    const checkins = commitment.checkins.filter((entry) => entry.checkinOn >= startOn && entry.checkinOn <= endOn);
    buckets.push({
      amount: checkins.reduce((sum, entry) => sum + entry.amount, 0), checkins, startOn, endOn,
      isCurrent: today >= startOn && today <= endOn,
      label: startOn === endOn ? dateLabel(startOn) : `${dateLabel(startOn)} – ${dateLabel(endOn)}`,
      targetCount: Math.ceil(targetCount * ((bounded.getTime() - cursor.getTime()) / (next.getTime() - cursor.getTime())))
    });
    cursor = bounded;
    index += 1;
  }
  const currentBucket = buckets.find((bucket) => bucket.isCurrent)
    ?? buckets.find((bucket) => today < bucket.startOn) ?? buckets.at(-1)
    ?? { amount: 0, checkins: [], startOn: today, endOn: today, isCurrent: false, label: today, targetCount };
  return { buckets, currentBucket, targetCount,
    periodTarget: buckets.reduce((sum, bucket) => sum + bucket.targetCount, 0),
    periodTotal: buckets.reduce((sum, bucket) => sum + bucket.amount, 0) };
}
