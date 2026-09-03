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

export function stockholmDate(input: Date | string = new Date()) {
  const parts = Object.fromEntries(dateParts.formatToParts(new Date(input)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function previousDate(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

export function logScheduledDate(log: { takenAt: string; scheduledDate?: string }, boundaryHour = 4) {
  return log.scheduledDate ?? effectiveLogDate(log.takenAt, boundaryHour);
}

export function stockholmDateTimeInput(input: Date | string) {
  const parts = Object.fromEntries(dateParts.formatToParts(new Date(input)).map(part => [part.type, part.value]));
  const minute = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Stockholm", minute: "2-digit" }).format(new Date(input));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${minute}`;
}

export function stockholmLocalToIso(value: string) {
  const [date, time] = value.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  let guess = desired;
  for (let index = 0; index < 2; index += 1) {
    const parts = Object.fromEntries(dateParts.formatToParts(new Date(guess)).map(part => [part.type, part.value]));
    const localMinute = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Stockholm", minute: "2-digit" }).format(new Date(guess)));
    const rendered = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), localMinute);
    guess += desired - rendered;
  }
  return new Date(guess).toISOString();
}

export function stockholmHour(input: Date | string = new Date()) {
  const hour = dateParts.formatToParts(new Date(input)).find(part => part.type === "hour")?.value;
  return Number(hour ?? 0);
}

export function displayLogDate(date: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("sv-SE", { ...options, timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}
