export function localDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function weekStartString(date = new Date()): string {
  const monday = new Date(date);
  const daysSinceMonday = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - daysSinceMonday);
  return localDateString(monday);
}

export function formatShortDate(dateString: string): string {
  return new Date(`${dateString}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
