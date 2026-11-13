export function getGuatemalaDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Guatemala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function guatemalaDateToIso(date: string, endOfDay = false): string {
  const time = endOfDay ? "23:59:59.999" : "00:00:00";
  return new Date(`${date}T${time}-06:00`).toISOString();
}
