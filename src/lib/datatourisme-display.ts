import type { ExternalDiscoveryResultDto } from '../../functions/src/discovery-search-contract';

function frenchDay(day: string): string {
  const formatted = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${day}T12:00:00.000Z`));
  return formatted.charAt(0).toLocaleUpperCase('fr-FR') + formatted.slice(1);
}

function frenchTime(time: string): string {
  const [hour, minute, second] = time.split(':');
  return `${Number(hour)} h ${minute}${second && second !== '00' ? ` min ${second} s` : ''}`;
}

function localParts(date: Date, timezone: string): { day: string; time: string } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}:${parts.second}` };
}

export function datatourismePeriodLabel(event: ExternalDiscoveryResultDto): string {
  if (event.timePrecision === 'date') {
    const days = event.startDay === event.endDay
      ? frenchDay(event.startDay) : `${frenchDay(event.startDay)} – ${frenchDay(event.endDay)}`;
    return event.startTime ? `${days} · À ${frenchTime(event.startTime)}` : days;
  }
  const start = localParts(new Date(event.windowStartAt.seconds * 1000 + event.windowStartAt.nanoseconds / 1_000_000), event.timezone);
  const end = localParts(new Date(event.windowEndAt.seconds * 1000 + event.windowEndAt.nanoseconds / 1_000_000), event.timezone);
  return start.day === end.day
    ? `${frenchDay(start.day)} · De ${frenchTime(start.time)} à ${frenchTime(end.time)}`
    : `${frenchDay(start.day)} à ${frenchTime(start.time)} – ${frenchDay(end.day)} à ${frenchTime(end.time)}`;
}

export function datatourismeSourceUpdatedLabel(value: string): string {
  const day = value.length === 10 ? value : localParts(new Date(value), 'Europe/Paris').day;
  return frenchDay(day);
}
