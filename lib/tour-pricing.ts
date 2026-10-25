// Server-side excursion pricing and request validation.
// Mirrors tourSeasons / tourSeason / tourOffer in public/user-app.js so the
// operator sees the price the catalogue actually defines, not the price the
// browser sent. Keep both in sync when the season model changes.

type Departure = { city?: string; enabled?: boolean; adult?: number | string; child?: number | string; individualPrice?: number | string | null; times?: string[] | string; days?: Record<string, boolean>; maxPeople?: number | string };
type Season = { id?: string; name?: string; start?: string; end?: string; mode?: string; departures?: Departure[] };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const lines = (v: unknown) => Array.isArray(v) ? v.map(String) : String(v || '').split('\n').map(s => s.trim()).filter(Boolean);

export function tourSeasons(t: any): Season[] {
  if (Array.isArray(t.seasons) && t.seasons.length) return t.seasons;
  const cities: [string, any][] = Object.entries(t.cities || {}).filter(([, p]) => p && typeof p === 'object') as [string, any][];
  if (!cities.length) cities.push(['Сухум', { adult: t.price, child: t.kid }]);
  return ['summer', 'winter'].map((id, i) => ({
    id, name: i ? 'Зимний сезон' : 'Летний сезон', start: i ? '11-01' : '05-01',
    mode: t[id] === false ? 'closed' : (/индивидуаль/i.test(t.format || '') ? 'individual' : 'group'),
    departures: cities.map(([city, p]) => ({ city, enabled: true, adult: Number(p.adult ?? t.price) || 0, child: Number(p.child ?? t.kid) || 0, times: String(t[id + 'Times'] || t.times?.join(',') || '').split(/[,\n]/).map(x => x.trim()).filter(Boolean), days: { 0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true }, individualPrice: null, maxPeople: 6 })),
  }));
}

function seasonEnd(seasons: Season[], season: Season) {
  if (season.end) return String(season.end).slice(-5);
  const starts = seasons.map(s => String(s.start).slice(-5)).sort(), start = String(season.start).slice(-5), next = starts.find(s => s > start) || starts[0];
  const date = new Date('2000-' + next + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(5, 10);
}

export function tourSeason(t: any, date: string): Season | null {
  const md = date.slice(-5), seasons = tourSeasons(t);
  const active = seasons.filter(s => { const start = String(s.start).slice(-5), end = seasonEnd(seasons, s); return start <= end ? md >= start && md <= end : md >= start || md <= end; })
    .sort((a, b) => String(a.start).slice(-5).localeCompare(String(b.start).slice(-5)));
  return active.filter(s => String(s.start).slice(-5) <= md).at(-1) || active.at(-1) || null;
}

export function tourOffer(t: any, date: string, city = '', format = '') {
  const season = tourSeason(t, date), mode = season?.mode || 'closed';
  const departures = (season?.departures || []).filter(d => d.enabled !== false && d.city?.trim());
  const departure = city ? departures.find(d => d.city === city) : departures[0];
  const kind = mode === 'individual' ? 'individual' : mode === 'both' && format === 'individual' ? 'individual' : 'group';
  const [y, m, d] = date.split('-').map(Number), weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const dayOK = !departure?.days || departure.days[weekday] === true;
  const times = kind === 'individual' ? ['По согласованию'] : lines(departure?.times).filter(x => TIME.test(x));
  const available = !t.hidden && mode !== 'closed' && !!departure && dayOK && times.length > 0;
  const price = kind === 'individual'
    ? (departure?.individualPrice == null || departure.individualPrice === '' ? null : Number(departure.individualPrice))
    : Number(departure?.adult ?? t.price ?? 0);
  return { season, mode, kind, departure, available, times: available ? times : [], price, kid: Number(departure?.child ?? t.kid ?? 0), maxPeople: kind === 'individual' ? Math.max(1, Number(departure?.maxPeople) || 6) : 30 };
}

const moscowToday = (now = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));

/** Validates a new excursion request and replaces its price fields with the catalogue's. Returns an error message or ''. */
export function priceBooking(data: any, content: any, now = Date.now()): string {
  const tour = (content.tours || []).find((t: any) => t.id === data.tour);
  if (!tour || tour.hidden) return 'Экскурсия сейчас недоступна. Обновите страницу и выберите другую.';
  const date = String(data.date || '');
  if (!/^\d{4}-\d\d-\d\d$/.test(date) || new Date(date + 'T12:00:00Z').toISOString().slice(0, 10) !== date) return 'Выберите дату экскурсии';
  if (date < moscowToday(now)) return 'Выберите будущую дату';
  const adults = Number(data.adults), kids = Number(data.kids || 0);
  if (!Number.isInteger(adults) || adults < 1 || !Number.isInteger(kids) || kids < 0) return 'Проверьте количество гостей';
  const offer = tourOffer(tour, date, String(data.city || ''), String(data.format || ''));
  if (!offer.available) return 'На эту дату экскурсия из выбранного города не проводится';
  if (offer.kind === 'group' && !offer.times.includes(String(data.time || ''))) return 'Выберите время выезда';
  if (adults + kids > offer.maxPeople) return 'Слишком много гостей для этого формата';
  if (String(data.name || '').trim().length < 2 || String(data.phone || '').replace(/\D/g, '').length < 10) return 'Укажите имя и телефон';
  const total = offer.kind === 'individual' ? offer.price : adults * (offer.price ?? 0) + kids * offer.kid;
  if (data.total !== undefined && Number(data.total) !== total) data.clientTotal = data.total;
  data.format = offer.kind;
  data.total = total;
  data.priceUnit = offer.kind === 'individual' ? 'group' : 'person';
  data.season = offer.season?.name || data.season || '';
  data.priceSource = 'server';
  return '';
}
