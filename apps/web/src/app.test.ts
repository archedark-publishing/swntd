import { describe, expect, it } from "vitest";
import { buildGoogleCalendarUrl, buildIcsContent } from "./calendar";

describe("calendar helpers", () => {
  it("builds a Google Calendar link for a timed task", () => {
    const url = buildGoogleCalendarUrl(
      {
        description: "Weekly restock",
        dueOn: "2026-03-20",
        dueTime: "18:30",
        title: "Groceries"
      },
      "America/New_York"
    );

    expect(url).toContain("calendar.google.com");
    expect(url).toContain("Groceries");
    expect(url).toContain("ctz=America%2FNew_York");
  });

  it("builds ICS content for an all-day task", () => {
    const content = buildIcsContent(
      {
        description: "Take old paint cans to the drop-off day.",
        dueOn: "2026-04-10",
        dueTime: null,
        title: "Hazard drop-off"
      },
      "America/New_York"
    );

    expect(content).toContain("BEGIN:VCALENDAR");
    expect(content).toContain("SUMMARY:Hazard drop-off");
    expect(content).toContain("DTSTART;VALUE=DATE:20260410");
  });
});
