export type CalendarTaskInput = {
  description: string;
  dueOn: string | null;
  dueTime: string | null;
  title: string;
};

function compactDate(value: string) {
  return value.replaceAll("-", "");
}

function compactDateTime(dueOn: string, dueTime: string) {
  return `${compactDate(dueOn)}T${dueTime.replaceAll(":", "")}00`;
}

export function buildGoogleCalendarUrl(
  task: CalendarTaskInput,
  timezone: string
) {
  if (!task.dueOn) {
    return null;
  }

  const url = new URL("https://calendar.google.com/calendar/render");

  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", task.title);
  url.searchParams.set("details", task.description);
  url.searchParams.set("ctz", timezone);

  if (task.dueTime) {
    const start = compactDateTime(task.dueOn, task.dueTime);
    const endHour = String(Number(task.dueTime.slice(0, 2)) + 1).padStart(2, "0");
    const end = compactDateTime(task.dueOn, `${endHour}:${task.dueTime.slice(3, 5)}`);

    url.searchParams.set("dates", `${start}/${end}`);
  } else {
    const start = compactDate(task.dueOn);
    const endDate = new Date(`${task.dueOn}T00:00:00.000Z`);

    endDate.setUTCDate(endDate.getUTCDate() + 1);
    url.searchParams.set("dates", `${start}/${compactDate(endDate.toISOString().slice(0, 10))}`);
  }

  return url.toString();
}

export function buildIcsContent(task: CalendarTaskInput, timezone: string) {
  if (!task.dueOn) {
    return null;
  }

  const uid = `${task.title}-${task.dueOn}`.replaceAll(/\s+/g, "-");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SWNTD//Household Ledger//EN",
    "BEGIN:VEVENT",
    `UID:${uid}@swntd`,
    `SUMMARY:${task.title}`,
    `DESCRIPTION:${task.description.replaceAll("\n", "\\n")}`
  ];

  if (task.dueTime) {
    const start = compactDateTime(task.dueOn, task.dueTime);
    const endHour = String(Number(task.dueTime.slice(0, 2)) + 1).padStart(2, "0");
    const end = compactDateTime(task.dueOn, `${endHour}:${task.dueTime.slice(3, 5)}`);

    lines.push(`DTSTART;TZID=${timezone}:${start}`);
    lines.push(`DTEND;TZID=${timezone}:${end}`);
  } else {
    const endDate = new Date(`${task.dueOn}T00:00:00.000Z`);

    endDate.setUTCDate(endDate.getUTCDate() + 1);
    lines.push(`DTSTART;VALUE=DATE:${compactDate(task.dueOn)}`);
    lines.push(`DTEND;VALUE=DATE:${compactDate(endDate.toISOString().slice(0, 10))}`);
  }

  lines.push("END:VEVENT", "END:VCALENDAR");

  return lines.join("\r\n");
}

export function downloadIcsFile(task: CalendarTaskInput, timezone: string) {
  const content = buildIcsContent(task, timezone);

  if (!content) {
    return;
  }

  const blob = new Blob([content], { type: "text/calendar" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = objectUrl;
  anchor.download = `${task.title || "task"}.ics`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
