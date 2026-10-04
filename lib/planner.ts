export type CalendarDay = {
  date: string;
  day: number;
  currentMonth: boolean;
  isToday: boolean;
};

export function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function dateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDateKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function isPastDateTime(date: string, time: string, now = new Date()) {
  const [hour, minute] = time.split(":").map(Number);
  const target = parseDateKey(date);
  target.setHours(hour, minute, 0, 0);
  return target.getTime() <= now.getTime();
}

export function removeTaskById<T extends { id: string }>(tasks: T[], id: string) {
  return tasks.filter((task) => task.id !== id);
}

export function isTaskExpired(date: string, time: string, now = new Date()) {
  const [hour, minute] = time.split(":").map(Number);
  const expiry = parseDateKey(date);
  expiry.setHours(hour, minute, 0, 0);
  expiry.setDate(expiry.getDate() + 1);
  return expiry.getTime() <= now.getTime();
}

export function buildCalendarDays(month: Date, todayKey: string): CalendarDay[] {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const totalCells = Math.ceil((mondayOffset + daysInMonth) / 7) * 7;

  return Array.from({ length: totalCells }, (_, index) => {
    const date = new Date(month.getFullYear(), month.getMonth(), index - mondayOffset + 1);
    return {
      date: dateKey(date),
      day: date.getDate(),
      currentMonth: date.getMonth() === month.getMonth(),
      isToday: dateKey(date) === todayKey,
    };
  });
}
