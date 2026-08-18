import { Droplets, Info, MapPin, Navigation, ParkingCircle, Star, Utensils, Volume2 } from 'lucide-react';

import { cn } from '@/lib/utils';

const pois = [
  {
    label: 'Scène principale',
    icon: Volume2,
    className: 'left-[18%] top-[30%] text-violet-500',
  },
  {
    label: 'Food court',
    icon: Utensils,
    selected: true,
    className: 'left-[56%] top-[40%] text-orange-500',
  },
  {
    label: 'Parking',
    icon: ParkingCircle,
    className: 'left-[72%] top-[70%] text-green-500',
  },
  {
    label: "Point d'eau",
    icon: Droplets,
    className: 'left-[30%] top-[68%] text-blue-500',
  },
  {
    label: 'Info',
    icon: Info,
    className: 'left-[78%] top-[25%] text-teal-500',
  },
] as const;

export function SpotlyMapPreview() {
  return (
    <div
      className="relative mx-auto h-[210px] w-full max-w-[520px] overflow-hidden rounded-[2rem] border border-muted bg-card shadow-sm sm:h-[280px] lg:h-[390px]"
      role="img"
      aria-label="Aperçu illustratif d'une carte Spotly avec plusieurs lieux d'événement et un point d'intérêt sélectionné."
    >
      <div className="absolute inset-0 bg-[linear-gradient(120deg,hsl(var(--primary)/0.08),transparent_38%,hsl(var(--accent)/0.08)),linear-gradient(0deg,hsl(var(--muted)/0.45),hsl(var(--card)))]" />

      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 560 420"
        fill="none"
        aria-hidden="true"
        preserveAspectRatio="none"
      >
        <path d="M-20 96 C 90 42, 140 94, 238 72 C 338 49, 428 22, 588 52" stroke="white" strokeWidth="34" strokeLinecap="round" opacity="0.8" />
        <path d="M-24 100 C 90 45, 141 97, 240 75 C 340 52, 428 25, 590 55" stroke="#d8d5df" strokeWidth="3" strokeLinecap="round" opacity="0.85" />
        <path d="M62 446 C 94 330, 180 292, 236 224 C 280 170, 274 102, 326 -18" stroke="white" strokeWidth="28" strokeLinecap="round" opacity="0.8" />
        <path d="M66 446 C 98 332, 184 294, 239 225 C 283 172, 277 103, 328 -18" stroke="#d8d5df" strokeWidth="3" strokeLinecap="round" opacity="0.85" />
        <path d="M-8 326 C 94 304, 172 352, 278 328 C 376 306, 452 242, 584 264" stroke="white" strokeWidth="24" strokeLinecap="round" opacity="0.7" />
        <path d="M-8 329 C 94 307, 173 355, 279 331 C 378 309, 452 245, 584 267" stroke="#d8d5df" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />

        <path d="M372 112 C 430 76, 498 98, 520 154 C 545 216, 488 258, 424 248 C 364 238, 326 174, 372 112Z" fill="#d9f4e3" opacity="0.65" />
        <path d="M64 156 C 118 130, 174 154, 188 206 C 206 270, 150 298, 92 276 C 40 256, 18 180, 64 156Z" fill="#eee9ff" opacity="0.9" />
        <path d="M330 300 C 380 274, 450 296, 466 348 C 482 398, 414 434, 352 410 C 300 390, 280 326, 330 300Z" fill="#fff2d9" opacity="0.8" />

        <path d="M0 206 H560" stroke="#e6e3ec" strokeWidth="1.5" strokeDasharray="7 10" opacity="0.7" />
        <path d="M180 0 V420" stroke="#e6e3ec" strokeWidth="1.5" strokeDasharray="7 10" opacity="0.55" />
        <path d="M418 0 V420" stroke="#e6e3ec" strokeWidth="1.5" strokeDasharray="7 10" opacity="0.55" />
      </svg>

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,transparent_0,hsl(var(--card)/0)_50%,hsl(var(--background)/0.35)_100%)]" />

      <div className="absolute left-4 top-4 rounded-full border bg-white/90 px-3 py-1.5 text-xs font-bold text-primary shadow-sm backdrop-blur-sm sm:left-5 sm:top-5">
        Exemple Spotly
      </div>

      {pois.map((poi) => {
        const Icon = poi.icon;
        const isSelected = 'selected' in poi && poi.selected;

        return (
          <div
            key={poi.label}
            className={cn('absolute -translate-x-1/2 -translate-y-1/2', poi.className)}
            aria-hidden="true"
          >
            <div
              className={cn(
                'relative flex items-center justify-center rounded-full border border-black/10 bg-white p-1.5 shadow-md',
                isSelected && 'scale-110 border-accent ring-2 ring-accent'
              )}
            >
              {isSelected && <span className="absolute h-10 w-10 rounded-full bg-accent/20" />}
              <MapPin className="relative h-5 w-5 drop-shadow-sm sm:h-6 sm:w-6" strokeWidth={2.75} />
              <Icon className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-white p-0.5 shadow-sm" />
            </div>
            <div className="mt-1 hidden max-w-[120px] truncate rounded-full border border-black/10 bg-white px-2.5 py-1 text-center text-[11px] font-semibold leading-none text-slate-950 shadow-sm sm:block">
              {poi.label}
            </div>
          </div>
        );
      })}

      <div className="absolute bottom-3 left-3 right-3 rounded-2xl border bg-white/95 p-2.5 text-left shadow-lg backdrop-blur-sm sm:bottom-5 sm:left-auto sm:right-5 sm:w-[235px] sm:p-4">
        <div className="flex items-center justify-between gap-2 sm:items-start sm:gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-black leading-none text-slate-950 sm:text-base sm:leading-tight">Espace restauration</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] font-bold leading-none text-muted-foreground sm:mt-0.5 sm:block sm:text-xs sm:uppercase sm:tracking-wide sm:text-orange-500">
              <span className="uppercase tracking-wide text-orange-500 sm:tracking-normal">Restauration</span>
              <span className="sm:hidden">·</span>
              <span className="inline-flex items-center gap-0.5 text-amber-700 sm:hidden">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                4,8
              </span>
              <span className="sm:hidden">·</span>
              <span className="sm:hidden">12 avis</span>
            </div>
          </div>
          <div className="hidden shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700 sm:flex">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            4,8
          </div>
        </div>
        <div className="mt-2 flex items-center justify-end gap-3 text-xs font-semibold text-muted-foreground sm:mt-3 sm:justify-between">
          <span className="hidden sm:inline">12 avis</span>
          <span className="inline-flex min-h-9 items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground sm:min-h-0 sm:py-1.5">
            <Navigation className="h-3.5 w-3.5" />
            Itinéraire
          </span>
        </div>
      </div>
    </div>
  );
}
