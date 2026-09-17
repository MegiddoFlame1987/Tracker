// Funkcja serwerowa Vercel — most do danych z Garmina przez intervals.icu.
//
// Przepływ: zegarek → Garmin Connect → intervals.icu (oficjalne OAuth Garmina)
// → ta funkcja → aplikacja. Klucz intervals.icu nigdy nie trafia do przeglądarki.
//
// Zmienne środowiskowe w Vercel:
//   INTERVALS_API_KEY     — Settings → Developer na intervals.icu (wymagane)
//   INTERVALS_ATHLETE_ID  — np. i123456, ten sam ekran (opcjonalne, domyślnie "0" = ja)
//   APP_TOKEN             — dowolny losowy ciąg, blokuje obcych (opcjonalne, ale zalecane)
//
// Wywołanie: GET /api/garmin?days=7

const BASE = "https://intervals.icu/api/v1";

const pad = (n) => String(n).padStart(2, "0");
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const num = (v, digits = 0) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

// intervals.icu zwraca start_date_local jako ISO bez strefy — bierzemy samą datę
const dayOf = (iso) => (typeof iso === "string" ? iso.slice(0, 10) : null);

async function icu(path, auth) {
  const resp = await fetch(`${BASE}${path}`, {
    headers: { Authorization: auth, Accept: "application/json" },
  });
  if (!resp.ok) {
    const body = (await resp.text()).slice(0, 300);
    const err = new Error(body);
    err.status = resp.status;
    throw err;
  }
  return resp.json();
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const appToken = process.env.APP_TOKEN;
  if (appToken) {
    const given = req.headers["x-app-token"];
    if (given !== appToken) {
      return res.status(401).json({ error: "Brak lub zły token aplikacji" });
    }
  }

  const apiKey = process.env.INTERVALS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Brak INTERVALS_API_KEY w zmiennych środowiskowych Vercel" });
  }
  const athlete = process.env.INTERVALS_ATHLETE_ID || "0";

  // Basic auth: login jest literalnie API_KEY, hasłem jest klucz
  const auth = "Basic " + Buffer.from(`API_KEY:${apiKey}`).toString("base64");

  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 7, 1), 60);
  const newest = fmt(new Date());
  const oldestDate = new Date();
  oldestDate.setDate(oldestDate.getDate() - (days - 1));
  const oldest = fmt(oldestDate);

  const range = `?oldest=${oldest}&newest=${newest}`;

  try {
    const [rawActivities, rawWellness] = await Promise.all([
      icu(`/athlete/${athlete}/activities${range}`, auth),
      icu(`/athlete/${athlete}/wellness${range}`, auth),
    ]);

    const activities = (Array.isArray(rawActivities) ? rawActivities : []).map((a) => {
      const km = num((a.distance || 0) / 1000, 2);
      const timeMin = num((a.moving_time || a.elapsed_time || 0) / 60, 0);
      return {
        id: a.id ?? null,
        date: dayOf(a.start_date_local || a.start_date),
        name: a.name || null,
        type: a.type || null,
        km,
        timeMin,
        elevation: num(a.total_elevation_gain, 0),
        avgHr: num(a.average_heartrate, 0),
        maxHr: num(a.max_heartrate, 0),
        kcal: num(a.calories, 0),
        load: num(a.icu_training_load, 0),
        intensity: num(a.icu_intensity, 0),
        rpe: num(a.icu_rpe, 0),
        // minuty w strefach HR — weryfikacja zasady "HR pod 135, zero jakości"
        hrZoneMin: Array.isArray(a.icu_hr_zone_times)
          ? a.icu_hr_zone_times.map((sec) => num((sec || 0) / 60, 0))
          : null,
        paceMinPerKm: km && timeMin ? num(timeMin / km, 2) : null,
      };
    });

    const wellness = (Array.isArray(rawWellness) ? rawWellness : []).map((w) => ({
      date: w.id || null, // intervals.icu trzyma datę w polu id
      hrv: num(w.hrv, 0),
      restingHr: num(w.restingHR, 0),
      sleepHours: w.sleepSecs != null ? num(w.sleepSecs / 3600, 2) : null,
      sleepScore: num(w.sleepScore, 0),
      sleepQuality: num(w.sleepQuality, 0),
      avgSleepingHr: num(w.avgSleepingHR, 0),
      hrvSDNN: num(w.hrvSDNN, 0),
      vo2max: num(w.vo2max, 1),
      spO2: num(w.spO2, 0),
      // ctl = forma, atl = zmęczenie, rampRate = tempo narastania obciążenia
      ctl: num(w.ctl, 1),
      atl: num(w.atl, 1),
      rampRate: num(w.rampRate, 2),
      weight: num(w.weight, 1),
      bodyFat: num(w.bodyFat, 1),
      steps: num(w.steps, 0),
      // subiektywne, wpisywane ręcznie na intervals.icu — zwykle puste
      fatigue: num(w.fatigue, 0),
      soreness: num(w.soreness, 0),
      stress: num(w.stress, 0),
      // niepewne: zależy czy Garmin je przepuszcza. null = brak
      readiness: num(w.readiness, 0),
      bodyBattery: num(w.bodyBattery ?? w.body_battery, 0),
    }));

    // ?raw=1 — surowe nazwy pól, żeby zobaczyć co Garmin faktycznie przepuszcza
    if (req.query.raw) {
      const keysOf = (arr) => {
        const set = new Set();
        (Array.isArray(arr) ? arr : []).forEach((o) => Object.entries(o || {}).forEach(([k, v]) => {
          if (v !== null && v !== undefined && v !== "") set.add(k);
        }));
        return [...set].sort();
      };
      return res.status(200).json({
        range: { oldest, newest },
        wellnessCount: (rawWellness || []).length,
        activityCount: (rawActivities || []).length,
        wellnessFieldsWithData: keysOf(rawWellness),
        activityFieldsWithData: keysOf(rawActivities),
        sampleWellness: (rawWellness || [])[0] || null,
        sampleActivity: (rawActivities || [])[0] || null,
      });
    }

    // najnowsze pierwsze — apka zwykle pyta o dziś
    activities.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    wellness.sort((a, b) => String(b.date).localeCompare(String(a.date)));

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ range: { oldest, newest }, activities, wellness });
  } catch (err) {
    const status = err.status || 500;
    let hint = "";
    if (status === 401 || status === 403) hint = "Klucz intervals.icu nieprawidłowy albo zły athlete ID. Sprawdź INTERVALS_API_KEY i INTERVALS_ATHLETE_ID w Vercel.";
    else if (status === 404) hint = "Nie znaleziono zawodnika. Ustaw INTERVALS_ATHLETE_ID (format iXXXXXX).";
    else if (status === 429) hint = "Limit zapytań intervals.icu, spróbuj za chwilę.";
    return res.status(status).json({ error: `${status}: ${hint} ${String(err.message || err)}`.slice(0, 400) });
  }
}
