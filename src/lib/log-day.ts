const dateParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Stockholm",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

export function effectiveLogDate(input: Date | string = new Date(), boundaryHour = 4) {
  const parts = Object.fromEntries(dateParts.formatToParts(new Date(input)).map(part => [part.type, part.value]));
  const date = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 12));
  if (Number(parts.hour) < boundaryHour) date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function stockholmHour(input: Date | string = new Date()) {
  const hour = dateParts.formatToParts(new Date(input)).find(part => part.type === "hour")?.value;
  return Number(hour ?? 0);
}

export function displayLogDate(date: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("sv-SE", { ...options, timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}
