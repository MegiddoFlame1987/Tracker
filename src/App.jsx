import React, { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Camera, Moon, Flame, Dumbbell, ChevronLeft, ChevronRight, ChevronDown, X, Loader2, Check,
  Pencil, Scale, Target, ListChecks, CalendarDays, Calendar, BarChart3, Map, Plus, Utensils, Zap, Heart,
} from "lucide-react";
import { installStorageShim } from "./storage.js";

installStorageShim();

// ---------- palette / tokens ----------
const C = {
  bg: "#14181A",
  bgSoft: "#1D2224",
  paper: "#EDE7D9",
  paperDim: "#E2DBC9",
  ink: "#23211D",
  inkSoft: "#5B5648",
  amber: "#E3A73C",
  teal: "#2E7268",
  rust: "#A8442B",
  line: "#C9C0A8",
  mute: "#8E8771",      // tekst drugoplanowy NA ciemnym tle (inkSoft jest za ciemny)
  hair: "#2A2F31",      // delikatna kreska na ciemnym
};

// promienie i cienie — jeden zestaw na cala aplikacje
const R = { card: 14, soft: 10, chip: 999 };
const SHADOW = "0 1px 2px rgba(0,0,0,.20), 0 6px 18px rgba(0,0,0,.10)";

const pad = (n) => String(n).padStart(2, "0");
const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return fmtDate(d); };
const getMonday = (s) => { const d = parseDate(s); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return fmtDate(d); };
const dayLabel = (s) => parseDate(s).toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" });
const shortLabel = (s) => parseDate(s).toLocaleDateString("pl-PL", { weekday: "short", day: "numeric" });
const fmtMonth = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const monthLabel = (s) => { const [y, m] = s.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("pl-PL", { month: "long", year: "numeric" }); };
const addMonths = (s, n) => { const [y, m] = s.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return fmtMonth(d); };
function getMonthDates(monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  return Array.from({ length: days }, (_, i) => `${y}-${pad(m)}-${pad(i + 1)}`);
}
// pozycje kluczowych ćwiczeń (dayKey, idx) — stabilne w całym cyklu, do śledzenia progresu obciążeń
const KEY_LIFTS = [
  { dayKey: "wed", idx: 0, label: "Podciąganie (garaż)" },
  { dayKey: "thu", idx: 0, label: "Przysiad" },
  { dayKey: "thu", idx: 1, label: "RDL" },
  { dayKey: "thu", idx: 2, label: "Step-up z plecakiem" },
  { dayKey: "fri", idx: 2, label: "Wiosłowanie sztangą" },
  { dayKey: "sat", idx: 0, label: "Wyciskanie sztangi" },
];

// najbliższe wyścigi 2027: 100km 15.05, Mont Blanc 07.07, Snowdonia 80km 04.09
const RACES = [
  { date: "2027-05-15", label: "100km ultra #1" },
  { date: "2027-07-07", label: "Mont Blanc" },
  { date: "2027-09-04", label: "Snowdonia 80 km" },
];
function nextRaceInfo(dateStr) {
  const d = parseDate(dateStr);
  let best = null;
  for (const r of RACES) {
    const diff = Math.round((parseDate(r.date) - d) / 86400000);
    if (diff >= 0 && (best === null || diff < best.diff)) best = { ...r, diff };
  }
  return best;
}

const TARGET_DEFICIT = 500; // kcal/dzień, Faza 1

// ---------- Silnik 24-tygodniowy program (przeniesiony) ----------
const PHASES = {
  1: { name: "Faza 1 · Redukcja", weeks: [1, 12], kcal: 2500, protein: 210, fat: 95, carbs: 270 },
  2: { name: "Faza 2 · Budowa", weeks: [13, 24], kcal: 3100, protein: 180, fat: 90, carbs: 400 },
};
const TOTAL_WEEKS = 24;
const DAY_KEY_BY_DOW = { 0: "sun", 3: "wed", 4: "thu", 5: "fri", 6: "sat" };

function getPhaseForWeek(w) { return w <= 12 ? PHASES[1] : PHASES[2]; }

// tydzień 1-2 = restart po przerwie lipiec-sierpień 2026
const RESTART_WEEKS = 2;

// Jeden etap dla całego planu: każda lista ćwiczeń czyta z tego samego źródła.
// 1-2 restart -> 3-6 baza -> 7-12 ME -> 13+ specyfika wyscigowa
function etapFor(week) {
  if (!week || week <= RESTART_WEEKS) return "restart";
  if (week <= 6) return "baza";
  if (week <= 12) return "me";
  return "spec";
}
const ETAP_LABEL = { restart: "restart", baza: "baza", me: "ME", spec: "specyfika" };
const pick = (week, map) => map[etapFor(week)];

// ---------- biegi, dystanse rosna z etapem ----------
function runPlan(week, day) {
  const e = etapFor(week);
  const t = {
    wed: {
      restart: { txt: `Bieg ${week === 1 ? 8 : 9} km Z2, HR cap 130`, hint: "Wracamy po przerwie. Tempo bez znaczenia." },
      baza: { txt: "Bieg 10 km Z2, HR cap 135", hint: "Czysta baza, zero jakości." },
      me: { txt: "Bieg 10 km z podbiegami w srodku, HR cap 145", hint: "Podbiegi w bloku ME, reszta Z2." },
      spec: { txt: "Bieg 10-12 km, koncowka Z3", hint: "Ostatnie 3 km w tempie docelowym." },
    },
    thu: {
      restart: { txt: "Bieg 5 km Z1 przed siłownia", hint: "Bardzo lekko, to rozgrzewka pod nogi." },
      baza: { txt: "Bieg 6 km Z1/Z2 przed siłownia", hint: "Wegle 60-90 min przed. Nigdy na czczo w ten dzień." },
      me: { txt: "Hill sprinty 6-8 x 10s PRZED nogami", hint: "Na świeżych nogach albo wcale. Pełna przerwa między powtórzeniami." },
      spec: { txt: "Hill sprinty 8-10 x 12s PRZED nogami", hint: "Jakość, nie objętość. Jeśli tempo spada, kończysz." },
    },
    fri: {
      restart: { txt: "Bieg 5-6 km Z1", hint: "Lekko, jutro long." },
      baza: { txt: "Bieg 6-8 km Z1/Z2", hint: "Lekko, jutro long." },
      me: { txt: "Bieg 8 km Z2", hint: "Bez jakości, nogi mają być świeże na sobotę." },
      spec: { txt: "Bieg 8 km Z2", hint: "Bez jakości, sobota jest ważniejsza." },
    },
    sat: {
      restart: { txt: `Long run ${week === 1 ? "12-14" : "14-16"} km, HR cap 130`, hint: "Odbudowa dystansu. Gora PO biegu, RPE do 6." },
      baza: { txt: "Long run 18-22 km, HR cap 135", hint: "Najwazniejsza sesja tygodnia. Elektrolity co 45-60 min." },
      me: { txt: "Long run 24-28 km z przewyzszeniem, HR cap 140", hint: "Ćwicz fueling jak na wyscigu. Plecak z obciążeniem raz na 2 tyg." },
      spec: { txt: "Long run 28-34 km, symulacja wyscigu", hint: "Buty, plecak i jedzenie dokladnie te, co na starcie." },
    },
    sun: {
      restart: { txt: "Recovery 5-6 km Z1, HR cap 120", hint: "Można na czczo." },
      baza: { txt: "Recovery 6-8 km Z1, HR cap 120", hint: "Można na czczo. Przed nockami: krótki sen = spacer zamiast biegu." },
      me: { txt: "Recovery 8 km Z1, HR cap 120", hint: "To nie jest dzień na nadrabianie. Przed nockami: krótki sen = spacer." },
      spec: { txt: "Recovery 8-10 km Z1, HR cap 120", hint: "Regeneracja, nie objętość." },
    },
  };
  return t[day][e];
}

// ---------- core, pełen zakres: środa, piątek, niedziela ----------
// Kolejnosc stala, zmienia sie wariant i czas.
function buildCore(week) {
  return pick(week, {
    restart: [
      { name: "CORE: Plank", sets: 3, reps: "40s", rest: "45s", bw: true },
      { name: "CORE: Hanging knee raises", sets: 3, reps: 10, rest: "45s", bw: true },
      { name: "CORE: Pallof press (guma)", sets: 3, reps: "12/stronę", rest: "30s", bw: true },
      { name: "CORE: Side plank", sets: 3, reps: "30s/stronę", rest: "30s", bw: true },
      { name: "CORE: Dead bug", sets: 3, reps: 12, rest: "30s", bw: true },
    ],
    baza: [
      { name: "CORE: Plank", sets: 3, reps: "60s", rest: "45s", bw: true },
      { name: "CORE: Hanging leg raises (nogi proste)", sets: 3, reps: 10, rest: "45s", bw: true },
      { name: "CORE: Pallof press (mocniejsza guma)", sets: 3, reps: "12/stronę", rest: "30s", bw: true },
      { name: "CORE: Side plank z unoszeniem bioder", sets: 3, reps: "12/stronę", rest: "30s", bw: true },
      { name: "CORE: Hollow body hold", sets: 3, reps: "30s", rest: "30s", bw: true },
    ],
    me: [
      { name: "CORE: RKC plank (pełne napięcie)", sets: 3, reps: "30s", rest: "45s", bw: true },
      { name: "CORE: Hanging leg raises z pauza", sets: 4, reps: 10, rest: "45s", bw: true },
      { name: "CORE: Pallof press w polprzysiadzie", sets: 3, reps: "12/stronę", rest: "30s", bw: true },
      { name: "CORE: Side plank z obciążeniem", sets: 3, reps: "30s/stronę", rest: "30s" },
      { name: "CORE: Hollow rocks", sets: 3, reps: 15, rest: "30s", bw: true },
    ],
    spec: [
      { name: "CORE: Plank z plecakiem", sets: 3, reps: "60s", rest: "45s" },
      { name: "CORE: Toes to bar", sets: 4, reps: 8, rest: "60s", bw: true },
      { name: "CORE: Pallof press + wykrok", sets: 3, reps: "12/stronę", rest: "30s", bw: true },
      { name: "CORE: Side plank z obciążeniem", sets: 3, reps: "40s/stronę", rest: "30s" },
      { name: "CORE: Hollow rocks", sets: 4, reps: 20, rest: "30s", bw: true },
    ],
  });
}

// ---------- środa: garaż push/pull ----------
function buildGarage(week) {
  return pick(week, {
    restart: [
      { name: "Podciąganie (negatywy 4s)", sets: 4, reps: "3-5", rest: "90s", bw: true },
      { name: "Pompki, nogi wyżej", sets: 4, reps: "8-10", rest: "60s", bw: true },
      { name: "Dipsy na poręczach", sets: 3, reps: "6-8", rest: "90s", bw: true },
      { name: "Wiosłowanie australijskie (gumy)", sets: 4, reps: 10, rest: "60s", bw: true },
      { name: "Pike push-up (barki)", sets: 3, reps: 8, rest: "60s", bw: true },
      { name: "Dead hang", sets: 3, reps: "30s", rest: "60s", bw: true },
    ],
    baza: [
      { name: "Podciąganie (z gumą / pełne)", sets: 5, reps: "5-6", rest: "90s", bw: true },
      { name: "Pompki diamentowe", sets: 4, reps: "10-12", rest: "60s", bw: true },
      { name: "Dipsy na poręczach", sets: 4, reps: "8-10", rest: "90s", bw: true },
      { name: "Wiosłowanie australijskie (nogi wyżej)", sets: 4, reps: 12, rest: "60s", bw: true },
      { name: "Pike push-up", sets: 3, reps: 10, rest: "60s", bw: true },
      { name: "Dead hang", sets: 3, reps: "45s", rest: "60s", bw: true },
    ],
    me: [
      { name: "Podciąganie pełne", sets: 5, reps: "6-8", rest: "90s", bw: true },
      { name: "Pompki archer / z plecakiem 8 kg", sets: 4, reps: "8/stronę", rest: "75s" },
      { name: "Dipsy z plecakiem", sets: 4, reps: "8-10", rest: "90s" },
      { name: "Wiosłowanie australijskie z plecakiem", sets: 4, reps: 12, rest: "60s" },
      { name: "Pike push-up nogi na ścianie", sets: 3, reps: 8, rest: "75s", bw: true },
      { name: "Dead hang jednorecz (na zmiane)", sets: 3, reps: "20s/reka", rest: "75s", bw: true },
    ],
    spec: [
      { name: "Podciąganie z obciążeniem", sets: 5, reps: 5, rest: "120s" },
      { name: "Pompki z plecakiem 15 kg", sets: 4, reps: 10, rest: "75s" },
      { name: "Dipsy z obciążeniem", sets: 4, reps: 8, rest: "90s" },
      { name: "Wiosłowanie australijskie z plecakiem", sets: 4, reps: 15, rest: "60s" },
      { name: "Pike push-up / handstand przy ścianie", sets: 3, reps: "8-10", rest: "75s", bw: true },
      { name: "Dead hang jednorecz", sets: 3, reps: "25s/reka", rest: "75s", bw: true },
    ],
  });
}

// ---------- piątek: plecy + chwyt ----------
function buildBackGrip(week) {
  return pick(week, {
    restart: [
      { name: "Podciąganie (negatywy)", sets: 4, reps: "3-5", rest: "90s", bw: true },
      { name: "Lat pulldown", sets: 4, reps: 10, rest: "75s" },
      { name: "Wiosłowanie sztanga", sets: 4, reps: 10, rest: "90s" },
      { name: "Face pull (tyl barku)", sets: 3, reps: 15, rest: "45s" },
      { name: "Dead hang", sets: 3, reps: "30s", rest: "60s", bw: true },
      { name: "Farmer walk", sets: 3, reps: "30m", rest: "90s" },
    ],
    baza: [
      { name: "Podciąganie (z gumą / pełne)", sets: 4, reps: "6-8", rest: "90s", bw: true },
      { name: "Lat pulldown", sets: 4, reps: 10, rest: "75s" },
      { name: "Wiosłowanie sztanga", sets: 4, reps: 10, rest: "90s" },
      { name: "Face pull", sets: 3, reps: 15, rest: "45s" },
      { name: "Dead hang / wiszenie na listwie", sets: 3, reps: "45s", rest: "60s", bw: true },
      { name: "Farmer walk", sets: 3, reps: "40m", rest: "90s" },
    ],
    me: [
      { name: "Podciąganie z obciążeniem", sets: 5, reps: 5, rest: "120s" },
      { name: "Lat pulldown ciezki", sets: 4, reps: 8, rest: "90s" },
      { name: "Wiosłowanie sztanga", sets: 4, reps: 8, rest: "90s" },
      { name: "Face pull", sets: 3, reps: 15, rest: "45s" },
      { name: "Hangboard: zwis na listwie 20 mm", sets: 5, reps: "10s", rest: "90s", bw: true },
      { name: "Farmer walk ciezki", sets: 3, reps: "40m", rest: "120s" },
    ],
    spec: [
      { name: "Podciąganie z obciążeniem", sets: 5, reps: 5, rest: "120s" },
      { name: "Lat pulldown ciezki", sets: 4, reps: 6, rest: "90s" },
      { name: "Wiosłowanie sztanga", sets: 4, reps: 6, rest: "90s" },
      { name: "Face pull", sets: 3, reps: 15, rest: "45s" },
      { name: "Hangboard: listwa 15 mm / jednorecz z asysta", sets: 6, reps: "10s", rest: "120s", bw: true },
      { name: "Farmer walk ciezki", sets: 4, reps: "40m", rest: "120s" },
    ],
  });
}

// ---------- sobota: gora po biegu ----------
function buildChest(week) {
  return pick(week, {
    restart: [
      { name: "Wyciskanie sztangi", sets: 3, reps: 8, rest: "120s" },
      { name: "Wyciskanie hantli skos", sets: 3, reps: 10, rest: "75s" },
      { name: "Wyciskanie nad glowa (OHP)", sets: 3, reps: 8, rest: "90s" },
      { name: "Dipsy / pompki na poręczach", sets: 3, reps: "max", rest: "90s", bw: true },
      { name: "Drills po biegu: skip A/B, wysokie kolana", sets: 2, reps: "30m kazde", rest: "30s", bw: true },
    ],
    baza: [
      { name: "Wyciskanie sztangi", sets: 4, reps: "6-8", rest: "120s" },
      { name: "Wyciskanie hantli skos", sets: 3, reps: 10, rest: "75s" },
      { name: "Wyciskanie nad glowa (OHP)", sets: 3, reps: "6-8", rest: "90s" },
      { name: "Dipsy / pompki na poręczach", sets: 3, reps: "max", rest: "90s", bw: true },
      { name: "Drills po biegu: skip A/B, wysokie kolana", sets: 2, reps: "30m kazde", rest: "30s", bw: true },
    ],
    me: [
      { name: "Wyciskanie sztangi", sets: 4, reps: 5, rest: "120s" },
      { name: "Wyciskanie hantli skos", sets: 3, reps: 8, rest: "75s" },
      { name: "Wyciskanie nad glowa (OHP)", sets: 4, reps: 6, rest: "90s" },
      { name: "Dipsy z obciążeniem", sets: 3, reps: 8, rest: "90s" },
      { name: "Drills po biegu: skip A/B, wysokie kolana", sets: 2, reps: "30m kazde", rest: "30s", bw: true },
    ],
    spec: [
      { name: "Wyciskanie sztangi (utrzymanie)", sets: 3, reps: 5, rest: "120s" },
      { name: "Wyciskanie hantli skos", sets: 3, reps: 8, rest: "75s" },
      { name: "Wyciskanie nad glowa (OHP)", sets: 3, reps: 6, rest: "90s" },
      { name: "Dipsy z obciążeniem", sets: 3, reps: 8, rest: "90s" },
      { name: "Drills po biegu: skip A/B, wysokie kolana", sets: 2, reps: "30m kazde", rest: "30s", bw: true },
    ],
  });
}

// Progresja stabilizacji kostki, kolana i prawego pośladka. Nic nie znika,
// zmienia sie wariant: wzorzec ruchu -> niestabilne podloze -> obciazenie -> dynamika.
function buildStabilityWarmup(week) {
  return pick(week, {
    restart: [
      { name: "Stabilizacja prawej kostki (balans + guma)", sets: 3, reps: "30s", rest: "30s", bw: true,
        howto: "Stoj na prawej nodze, guma wokol obu stop. Kostka nie ucieka do srodka ani na zewnatrz." },
      { name: "Glute bridge jednonoz (prawy pośladek)", sets: 3, reps: 12, rest: "45s" },
      { name: "Monster walk z guma", sets: 2, reps: "12 krokow/kierunek", rest: "30s", bw: true },
      { name: "Clamshells (aktywacja pośladka)", sets: 3, reps: "15/stronę", rest: "30s", bw: true },
    ],
    baza: [
      { name: "Stabilizacja kostki, niestabilne podloze", sets: 3, reps: "40s", rest: "30s", bw: true },
      { name: "Glute bridge jednonoz", sets: 3, reps: 15, rest: "45s" },
      { name: "Monster walk z guma", sets: 3, reps: "15 krokow/kierunek", rest: "30s", bw: true },
      { name: "Copenhagen plank (kolano zgiete)", sets: 2, reps: "20s/stronę", rest: "45s", bw: true },
    ],
    me: [
      { name: "Stabilizacja kostki na poduszce", sets: 3, reps: "30s", rest: "30s", bw: true },
      { name: "Single-leg RDL z hantla", sets: 3, reps: "10/noga", rest: "45s" },
      { name: "Hip thrust jednonoz z obciążeniem", sets: 3, reps: 12, rest: "45s" },
      { name: "Copenhagen plank (noga prosta)", sets: 3, reps: "25s/stronę", rest: "45s", bw: true },
    ],
    spec: [
      { name: "Stabilizacja kostki: poduszka + rzut pilka", sets: 3, reps: "30s", rest: "30s", bw: true },
      { name: "Skoki jednonoz ze stabilizacja", sets: 3, reps: "8/noga", rest: "60s", bw: true },
      { name: "Hip thrust jednonoz, pauza 2s", sets: 3, reps: 10, rest: "45s" },
      { name: "Copenhagen plank + unoszenie", sets: 3, reps: "30s/stronę", rest: "45s", bw: true },
    ],
  });
}

// Dzień nóg. Kolejnosc stala przez caly plan, zeby historia obciazen
// i "poprzednia sesja" dawaly sie porownac.
function buildLegs(week) {
  const pct = week === 1 ? "60-70%" : "75-80%";
  return pick(week, {
    restart: [
      { name: `Przysiad ze sztanga (${pct} majowych)`, sets: 4, reps: 5, rest: "120s" },
      { name: `Martwy ciąg rumunski (${pct})`, sets: 3, reps: 6, rest: "120s" },
      { name: "Step-up z plecakiem (8 kg)", sets: 4, reps: "10/noga", rest: "75s" },
      { name: "Ekscentryczny step-down (3s w dol)", sets: 3, reps: "8/noga", rest: "60s" },
      { name: "Nordic curl (negatywy, 3s)", sets: 3, reps: 5, rest: "90s", bw: true },
      { name: "Wspiecia na palce", sets: 3, reps: 12, rest: "45s" },
    ],
    baza: [
      { name: "Przysiad ze sztanga (80-85%)", sets: 4, reps: 5, rest: "120s" },
      { name: "Martwy ciąg rumunski (80%)", sets: 3, reps: 6, rest: "120s" },
      { name: "Step-up z plecakiem (12-15 kg)", sets: 4, reps: "12/noga", rest: "75s" },
      { name: "Ekscentryczny step-down (3s w dol)", sets: 3, reps: "10/noga", rest: "60s" },
      { name: "Nordic curl (negatywy, 4s)", sets: 3, reps: 6, rest: "90s", bw: true },
      { name: "Wspiecia na palce", sets: 3, reps: 15, rest: "45s" },
    ],
    me: [
      { name: "Przysiad ze sztanga (87-92%)", sets: 4, reps: 5, rest: "120s" },
      { name: "Martwy ciąg rumunski (85%)", sets: 4, reps: 6, rest: "120s" },
      { name: "Step-up z plecakiem (18-20 kg)", sets: 5, reps: "12/noga", rest: "75s" },
      { name: "Ekscentryczny step-down (4s) + 5 kg", sets: 3, reps: "10/noga", rest: "60s" },
      { name: "Nordic curl (negatywy, 5s)", sets: 3, reps: 6, rest: "90s", bw: true },
      { name: "Wspiecia na palce z obciążeniem", sets: 4, reps: 15, rest: "45s" },
    ],
    spec: [
      { name: "Przysiad ze sztanga (utrzymanie)", sets: 3, reps: 5, rest: "120s" },
      { name: "Martwy ciąg rumunski (utrzymanie)", sets: 3, reps: 6, rest: "120s" },
      { name: "Step-up z plecakiem (20 kg, tempo)", sets: 4, reps: "15/noga", rest: "75s" },
      { name: "Ekscentryczny step-down (4s) + 10 kg", sets: 4, reps: "10/noga", rest: "60s" },
      { name: "Nordic curl (pełne, asysta minimalna)", sets: 3, reps: 5, rest: "90s", bw: true },
      { name: "Wspiecia jednonoz", sets: 4, reps: 20, rest: "45s" },
    ],
  });
}

function buildProgram(week) {
  const e = etapFor(week);
  const lab = ETAP_LABEL[e];
  const r = (day) => runPlan(week, day);
  const stab = week <= 3 ? "etap 1 · wzorzec ruchu"
    : week <= 6 ? "etap 2 · niestabilne podloze"
    : week <= 12 ? "etap 3 · obciazenie zewnetrzne"
    : "etap 4 · dynamika";

  return [
    {
      key: "wed", name: "Środa", focus: `Garaż push/pull + bieg · ${lab}`, type: "run",
      note: `${r("wed").txt}. ${r("wed").hint} Alternatywa: sesja na ścianie wspinaczkowej zamiast garażu, bieg zostaje. Core pełen zakres na końcu.`,
      exercises: [...buildGarage(week), ...buildCore(week)],
    },
    {
      key: "thu", name: "Czwartek", focus: `Bieg + nogi · ${lab}`, type: "gym",
      warmup: buildStabilityWarmup(week),
      stabPhase: stab,
      note: `${r("thu").txt}. ${r("thu").hint} Prehab przed seriami, zawsze. Jeśli prawy pośladek nie odpala na glute bridge, reszte dnia robisz lzej. Step-up z plecakiem, nie z hantlami: obciazenie ma siedziec na plecach jak na podejsciu.`,
      exercises: buildLegs(week),
    },
    {
      key: "fri", name: "Piątek", focus: `Plecy + chwyt + bieg · ${lab}`, type: "gym",
      note: `${r("fri").txt}. ${r("fri").hint} Zero nóg, ten dzień chroni sobotni long. Core pełen zakres na końcu.`,
      exercises: [...buildBackGrip(week), ...buildCore(week)],
    },
    {
      key: "sat", name: "Sobota", focus: `Long run + klatka · ${lab}`, type: "long",
      note: `${r("sat").txt}. ${r("sat").hint} Gora PO biegu, nigdy przed.`,
      exercises: buildChest(week),
    },
    {
      key: "sun", name: "Niedziela", focus: `Recovery + core · ${lab}`, type: "run",
      note: `${r("sun").txt}. ${r("sun").hint}`,
      exercises: buildCore(week),
    },
  ];
}

function computeWeek(dateStr, startDateStr) {
  if (!startDateStr) return null;
  const diffDays = Math.round((parseDate(dateStr) - parseDate(startDateStr)) / 86400000);
  if (diffDays < 0) return null;
  return Math.min(TOTAL_WEEKS, Math.floor(diffDays / 7) + 1);
}

function sleepHours(sleepTime, wakeTime) {
  if (!sleepTime || !wakeTime) return null;
  const [sh, sm] = sleepTime.split(":").map(Number);
  const [wh, wm] = wakeTime.split(":").map(Number);
  let mins = (wh * 60 + wm) - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  return Math.round((mins / 60) * 10) / 10;
}

function formatPace(minPerKm) {
  if (minPerKm == null || !isFinite(minPerKm) || minPerKm <= 0) return null;
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  return `${m}:${pad(s)}`;
}
function runPace(km, timeMin) {
  const k = Number(km), t = Number(timeMin);
  if (!k || !t) return null;
  return t / k;
}

function mealTotals(meals) {
  return meals.reduce((acc, m) => ({
    kcal: acc.kcal + (Number(m.kcal) || 0),
    protein: acc.protein + (Number(m.protein) || 0),
    fat: acc.fat + (Number(m.fat) || 0),
    carbs: acc.carbs + (Number(m.carbs) || 0),
  }), { kcal: 0, protein: 0, fat: 0, carbs: 0 });
}

function programSummaryForDate(dateStr, settings, programData) {
  const wk = computeWeek(dateStr, settings?.startDate);
  if (!wk) return null;
  const dayKey = DAY_KEY_BY_DOW[parseDate(dateStr).getDay()];
  if (!dayKey) return null;
  const plan = buildProgram(wk).find((d) => d.key === dayKey);
  if (!plan) return null;
  const ex = programData?.ex || {};
  const items = plan.exercises.map((e, idx) => {
    const st = ex[idx] || {};
    const kg = st.kg ? ` @${st.kg}kg` : "";
    const sets = st.sets || "";
    const reps = st.reps || "";
    const sr = sets || reps ? ` ${sets || e.sets}x${reps || e.reps}` : ` (cel ${e.sets}x${e.reps})`;
    return `${e.name}${sr}${kg}${st.done ? " ✓" : ""}`;
  }).join("; ");
  return `${plan.name} — ${plan.focus}${plan.warmup ? ` | rozgrzewka: ${plan.warmup}` : ""}: ${items}${programData?.comment ? ` | komentarz: ${programData.comment}` : ""}`;
}

function buildDayExportLine(dateStr, data, settings, prevBedtime) {
  const t = mealTotals(data.meals);
  const burned = Number(data.burned) || 0;
  const net = burned - t.kcal;
  const hrs = sleepHours(prevBedtime, data.wakeTime);

  const progSummary = programSummaryForDate(dateStr, settings, data.program);
  const mealsStr = data.meals.length
    ? data.meals.map((m) => `${m.time} ${m.name} (${m.kcal}kcal B${m.protein}/T${m.fat}/W${m.carbs})`).join(" | ")
    : "brak";
  const exStr = data.exercises.filter((x) => x.name).map((x) => `${x.name}${x.note ? ` (${x.note})` : ""}`).join(" | ") || "brak";
  const runKm = Number(data.run?.km) || 0;
  const runPaceVal = runPace(data.run?.km, data.run?.timeMin);
  const runStr = runKm ? `${runKm} km${data.run.timeMin ? `, ${data.run.timeMin} min` : ""}${formatPace(runPaceVal) ? `, tempo ${formatPace(runPaceVal)}/km` : ""}${data.run.elevation ? `, +${data.run.elevation}m` : ""}` : "brak";
  return [
    `${dateStr} (${dayLabel(dateStr)})`,
    `  bilans: spożyte ${t.kcal}kcal (B${t.protein}/T${t.fat}/W${t.carbs}) | spalone ${burned || "—"} | netto ${net >= 0 ? "-" : "+"}${Math.abs(net)}`,
    `  sen (noc): ${hrs != null ? hrs + "h" : "—"} (spać ${prevBedtime || "?"} → wstał ${data.wakeTime || "?"}) | poszedł spać dziś: ${data.sleepTime || "—"} | waga: ${data.weight || "—"}kg${data.bodyComp?.fat ? `, tłuszcz ${data.bodyComp.fat}%` : ""}${data.bodyComp?.muscle ? `, mięśnie ${data.bodyComp.muscle}kg` : ""}${data.bodyComp?.bone ? `, kości ${data.bodyComp.bone}kg` : ""}${data.bodyComp?.water ? `, woda ${data.bodyComp.water}%` : ""}`,
    `  bieg: ${runStr}`,
    `  posiłki: ${mealsStr}`,
    `  program: ${progSummary ? progSummary + (data.program?.done ? " [dzień oznaczony jako zrobiony]" : "") : "brak planu na ten dzień"}`,
    `  dodatkowe ćwiczenia: ${exStr}`,
  ].join("\n");
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = () => rej(new Error("read failed"));
    r.readAsDataURL(file);
  });
}

// Token aplikacji — ustawiasz raz w konsoli przeglądarki:
//   localStorage.setItem("appToken", "TWÓJ_CIĄG")
// Musi zgadzać się z APP_TOKEN w Vercel. Bez APP_TOKEN po stronie serwera działa też pusty.
function apiHeaders(json = true) {
  const h = json ? { "Content-Type": "application/json" } : {};
  try {
    const t = localStorage.getItem("appToken");
    if (t) h["x-app-token"] = t;
  } catch { /* prywatne okno — trudno */ }
  return h;
}

// ---------- Garmin przez intervals.icu ----------
async function fetchGarmin(days = 7) {
  const resp = await fetch(`/api/garmin?days=${days}`, { headers: apiHeaders(false) });
  if (!resp.ok) {
    let msg = await resp.text();
    try { msg = JSON.parse(msg).error || msg; } catch { /* zostaw tekst */ }
    throw new Error(msg);
  }
  return resp.json();
}

// typy z intervals.icu, które traktujemy jako bieg
const RUN_TYPES = ["Run", "TrailRun", "VirtualRun", "Hike", "Walk"];

function pickRunForDate(activities, date) {
  const same = (activities || []).filter((a) => a.date === date);
  const runs = same.filter((a) => RUN_TYPES.includes(a.type));
  const pool = runs.length ? runs : same;
  if (!pool.length) return null;
  // najdłuższy dystans tego dnia
  return pool.reduce((best, a) => ((a.km || 0) > (best.km || 0) ? a : best), pool[0]);
}

function pickWellnessForDate(wellness, date) {
  return (wellness || []).find((w) => w.date === date) || null;
}

async function analyzeMealPhoto(base64, mediaType) {
  const resp = await fetch("/api/analyze", {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({ type: "photo", base64, mediaType }),
  });
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json();
}

async function analyzeMealText(description) {
  const resp = await fetch("/api/analyze", {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({ type: "text", description }),
  });
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json();
}

async function fetchWeekReview(current, history, garmin) {
  const resp = await fetch("/api/analyze", {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({ type: "review", current, history, garmin }),
  });
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json();
}

// ---------- storage ----------
const emptyDay = () => ({
  meals: [], burned: "", sleepTime: "", wakeTime: "", weight: "",
  exercises: [], program: { done: false, ex: {}, comment: "" },
  run: { km: "", timeMin: "", elevation: "", avgHr: "", kcal: "", hrZoneMin: null, load: null, type: "" },
  garmin: null, // migawka wellness z intervals.icu: hrv, sen, RHR, gotowość
  bodyComp: { fat: "", muscle: "", bone: "", water: "" },
  amrap: { dips: "", pushups: "" },
});

async function loadDay(date) {
  try {
    const r = await window.storage.get(`day:${date}`, false);
    return r ? { ...emptyDay(), ...JSON.parse(r.value) } : emptyDay();
  } catch { return emptyDay(); }
}
async function saveDay(date, data) {
  try { await window.storage.set(`day:${date}`, JSON.stringify(data), false); return true; }
  catch { return false; }
}
async function loadSettings() {
  try {
    const r = await window.storage.get("settings:program", false);
    return r ? JSON.parse(r.value) : null;
  } catch { return null; }
}
async function saveSettings(obj) {
  try { await window.storage.set("settings:program", JSON.stringify(obj), false); return true; }
  catch { return false; }
}

// ---------- priorytety i cele ----------
// Osobne klucze, zeby nie ruszac istniejacych wpisow dnia (day:<data>).
const emptyPrio = () => ({ items: [], note: "" });
const emptyWeekGoals = () => ({ items: [], focus: "" });

async function loadJson(key, fallback) {
  try {
    const r = await window.storage.get(key, false);
    return r ? { ...fallback(), ...JSON.parse(r.value) } : fallback();
  } catch { return fallback(); }
}
async function saveJson(key, obj) {
  try { await window.storage.set(key, JSON.stringify(obj), false); return true; }
  catch { return false; }
}
const loadPrio = (date) => loadJson(`prio:${date}`, emptyPrio);
const savePrio = (date, obj) => saveJson(`prio:${date}`, obj);
const loadWeekGoals = (monday) => loadJson(`goals:week:${monday}`, emptyWeekGoals);
const saveWeekGoals = (monday, obj) => saveJson(`goals:week:${monday}`, obj);
const loadLongGoals = () => loadJson("goals:long", () => ({ items: [] }));
const saveLongGoals = (obj) => saveJson("goals:long", obj);

const newItem = (text = "") => ({ id: Date.now() + Math.random(), text, done: false });

// cele dlugoterminowe wyciagniete z planu — propozycja na start, do edycji
const SEED_LONG_GOALS = [
  { title: "Waga 89-90 kg", due: "2027-05-01", note: "Z ~97 kg. Tempo 0,3-0,5 kg/tydzień, bez cięcia białka." },
  ...RACES.map((r) => ({ title: r.label, due: r.date, note: "" })),
  { title: "Wspinanie 6a-6c", due: "2027-07-01", note: "Z 5c. Chwyt i core robią robotę też w górach." },
];

// ---------- small UI atoms ----------

// ---------- warstwa wizualna: jeden zestaw klockow na cala aplikacje ----------
function Card({ children, tone = "paper", className = "", style = {}, pad = true }) {
  const bg = tone === "paper" ? C.paper : tone === "dim" ? C.paperDim : C.bgSoft;
  return (
    <div
      className={`mb-3 ${pad ? "p-4" : ""} ${className}`}
      style={{
        background: bg,
        borderRadius: R.card,
        border: tone === "dark" ? `1px solid ${C.hair}` : "none",
        boxShadow: tone === "dark" ? "none" : SHADOW,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// etykieta sekcji na ciemnym tle
function SectionLabel({ children, right, icon }) {
  return (
    <div className="flex items-center justify-between mt-6 mb-2 px-1">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em]" style={{ color: C.mute, fontFamily: "ui-monospace, monospace" }}>
        {icon}{children}
      </div>
      {right}
    </div>
  );
}

function Chip({ children, tone = "mute" }) {
  const map = { mute: [C.hair, C.mute], amber: ["#E3A73C22", C.amber], teal: ["#2E726833", "#7FC2B6"], rust: ["#A8442B33", "#E0876E"] };
  const [bg, fg] = map[tone] || map.mute;
  return (
    <span className="px-2 py-0.5 text-[11px] font-mono" style={{ background: bg, color: fg, borderRadius: R.chip }}>{children}</span>
  );
}

// zwijana sekcja; stan zapamietany per urzadzenie
function Collapsible({ title, hint, icon, defaultOpen = false, storageKey, badge, children }) {
  const [open, setOpen] = useState(() => {
    if (!storageKey) return defaultOpen;
    try { const v = localStorage.getItem("ui:open:" + storageKey); return v === null ? defaultOpen : v === "1"; } catch { return defaultOpen; }
  });
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try { if (storageKey) localStorage.setItem("ui:open:" + storageKey, next ? "1" : "0"); } catch { /* prywatne okno */ }
  };
  return (
    <Card pad={false}>
      <button onClick={toggle} className="w-full flex items-center gap-2.5 px-4 py-3 text-left">
        {icon && <span style={{ color: C.inkSoft, display: "flex" }}>{icon}</span>}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium" style={{ color: C.ink }}>{title}</div>
          {hint && <div className="text-xs truncate" style={{ color: C.inkSoft }}>{hint}</div>}
        </div>
        {badge}
        <ChevronDown size={16} style={{ color: C.inkSoft, transform: open ? "rotate(180deg)" : "none", transition: "transform .18s" }} />
      </button>
      {open && <div className="px-4 pb-4 pt-1">{children}</div>}
    </Card>
  );
}

// kafelek liczbowy na ciemnym tle
function StatTile({ label, value, unit, sub, tone = "paper" }) {
  const color = tone === "teal" ? "#7FC2B6" : tone === "rust" ? "#E0876E" : tone === "amber" ? C.amber : C.paper;
  return (
    <div className="px-3 py-2.5" style={{ background: C.bgSoft, borderRadius: R.soft, border: `1px solid ${C.hair}` }}>
      <div className="text-[10px] uppercase tracking-[0.14em] mb-0.5" style={{ color: C.mute, fontFamily: "ui-monospace, monospace" }}>{label}</div>
      <div className="font-serif leading-none" style={{ color, fontSize: 22 }}>
        {value}{unit && <span className="text-xs ml-0.5" style={{ color: C.mute }}>{unit}</span>}
      </div>
      {sub && <div className="text-[11px] mt-1 font-mono" style={{ color: C.mute }}>{sub}</div>}
    </div>
  );
}

function ExportPanel({ label, buildText }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);

  const handleOpen = () => { setText(buildText()); setOpen(true); setCopied(false); };
  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { setCopied(false); }
  };

  if (!open) {
    return (
      <button onClick={handleOpen} className="w-full px-3 py-2 text-xs mb-5" style={{ border: `1px solid ${C.line}`, color: C.paper, borderRadius: R.soft }}>
        {label}
      </button>
    );
  }
  return (
    <div className="p-3 mb-5" style={{ background: C.paper, borderRadius: R.soft }}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs" style={{ color: C.inkSoft }}>Zaznacz i skopiuj, albo kliknij "Kopiuj"</div>
        <div className="flex gap-2">
          <button onClick={handleCopy} className="px-2 py-1 text-xs" style={{ background: copied ? C.teal : C.amber, color: copied ? C.paper : C.ink, borderRadius: R.soft }}>
            {copied ? "Skopiowano" : "Kopiuj"}
          </button>
          <button onClick={() => setOpen(false)} style={{ color: C.rust }}><X size={14} /></button>
        </div>
      </div>
      <textarea
        readOnly value={text} rows={10} onFocus={(e) => e.target.select()}
        className="w-full text-xs font-mono p-2 outline-none"
        style={{ background: C.bg, color: C.paper, borderRadius: R.soft, border: `1px solid ${C.line}`, resize: "vertical" }}
      />
    </div>
  );
}

function MacroBar({ label, value, target, color }) {
  const pct = target ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1" style={{ color: C.inkSoft }}>
        <span>{label}</span><span className="font-mono">{value} / {target}</span>
      </div>
      <div className="h-1.5 w-full" style={{ background: C.paperDim, borderRadius: R.soft }}>
        <div className="h-1.5" style={{ width: `${pct}%`, background: color, borderRadius: R.soft }} />
      </div>
    </div>
  );
}

// ---------- Start-date settings row ----------
function ProgramSettingsRow({ settings, onSetStart, onSetDietPhase, weekNum, phase }) {
  const [editing, setEditing] = useState(!settings?.startDate);
  const [val, setVal] = useState(settings?.startDate || "");

  if (!editing && settings?.startDate) {
    return (
      <div className="mb-4 px-1">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-mono" style={{ color: C.paper }}>
            {weekNum ? `Tydzień ${weekNum}` : "Program jeszcze się nie zaczął"}
          </div>
          <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-xs" style={{ color: C.amber }}>
            <Pencil size={12} />zmień start
          </button>
        </div>
        <div className="flex gap-2">
          <button onClick={() => onSetDietPhase(1)} className="flex-1 py-1 text-xs" style={{ background: (settings?.dietPhase || 1) === 1 ? C.amber : C.bgSoft, color: (settings?.dietPhase || 1) === 1 ? C.ink : C.paper, borderRadius: R.soft }}>
            Redukcja
          </button>
          <button onClick={() => onSetDietPhase(2)} className="flex-1 py-1 text-xs" style={{ background: settings?.dietPhase === 2 ? C.amber : C.bgSoft, color: settings?.dietPhase === 2 ? C.ink : C.paper, borderRadius: R.soft }}>
            Budowa
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="p-3 mb-4" style={{ background: C.paper, borderRadius: R.soft }}>
      <div className="text-xs mb-2" style={{ color: C.inkSoft }}>Data startu programu Silnik (Tydzień 1 = ta środa)</div>
      <div className="flex gap-2">
        <input type="date" value={val} onChange={(e) => setVal(e.target.value)} className="flex-1 text-sm" style={{ color: C.ink }} />
        <button
          onClick={() => { if (val) { onSetStart(val); setEditing(false); } }}
          className="px-3 py-1.5 text-xs" style={{ background: C.amber, color: C.ink, borderRadius: R.soft }}
        >
          Zapisz
        </button>
      </div>
    </div>
  );
}

// ---------- Program dnia (Silnik) ----------
// ---------- silnik progresji: deterministyczny, liczony lokalnie ----------
// Zasada: progresujemy CIĘŻAR, nie objętość. Siłownia ma wspierać bieganie,
// a nie zjadać długi bieg w sobotę. Warunek podwyżki: dwie sesje z rzędu
// na tym samym ciezarze z trafionym gornym zakresem powtórzeń.
// Blokady: tydzień deload, sen ponizej 6h, świeży komentarz o bolu.

function parseRepTarget(reps) {
  const nums = String(reps ?? "").match(/\d+/g);
  if (!nums || !nums.length) return null;
  const v = nums.map(Number);
  return { min: Math.min(...v), max: Math.max(...v) };
}

const round25 = (x) => Math.round(x / 2.5) * 2.5;
const fmtKg = (x) => (Number.isInteger(x) ? String(x) : String(x).replace(".", ","));

// dol ciala i zawiasy biodrowe ida po 5 kg, reszta po 2,5 kg
function stepForExercise(name = "") {
  return /przysiad|rdl|martwy|step-?up|hip thrust|wykrok|zakrocz|wejscia|wejścia/i.test(name) ? 5 : 2.5;
}

// sessions: lista poprzednich sesji tego samego dnia tygodnia, od najnowszej
function suggestLoads(dayPlan, sessions, ctx = {}) {
  if (!dayPlan) return null;
  const { isDeload = false, lowSleep = false } = ctx;
  const items = dayPlan.exercises.map((ex, idx) => {
    const hist = (sessions || [])
      .map((ses) => ({ date: ses.date, st: ses.ex?.[idx] }))
      .filter((h) => h.st && (h.st.kg || h.st.reps));
    const last = hist[0];
    const prev = hist[1];
    const target = parseRepTarget(ex.reps);
    const lastKg = Number(last?.st?.kg) || null;
    const prevKg = Number(prev?.st?.kg) || null;
    const lastReps = Number(last?.st?.reps) || null;
    const base = { idx, name: ex.name, bw: !!ex.bw, targetReps: ex.reps, lastKg, lastReps, lastDate: last?.date || null };

    if (isDeload) {
      return { ...base, action: "deload", kg: lastKg, reps: target ? target.min : null,
        why: "deload — ten sam ciężar, o serię mniej" };
    }
    if (!last) {
      return { ...base, action: "start", kg: null, reps: target ? target.max : null,
        why: "brak historii — dobierz ciężar na RPE 7 i zapisz go" };
    }
    if (ex.bw) {
      const up = lastReps && target && lastReps >= target.max;
      return { ...base, action: up ? "up" : "hold", kg: null, reps: up ? (lastReps + 1) : (target ? target.max : lastReps),
        why: up ? `ostatnio ${lastReps} powt. — dołóż jedno` : `utrzymaj ${target ? target.max : lastReps} powt.` };
    }
    if (!lastKg) {
      return { ...base, action: "hold", kg: null, reps: target ? target.max : null,
        why: "ostatnio bez zapisanego ciężaru — wpisz go dziś" };
    }
    const hitTop = target ? (lastReps != null && lastReps >= target.max) : false;
    const underMin = target ? (lastReps != null && lastReps < target.min) : false;
    if (underMin) {
      return { ...base, action: "down", kg: round25(lastKg * 0.9), reps: target.max,
        why: `ostatnio ${lastReps} powt. poniżej celu — zejdź ~10%` };
    }
    if (hitTop && prevKg === lastKg) {
      if (lowSleep) {
        return { ...base, action: "hold", kg: lastKg, reps: target.max,
          why: "ciężar zasłużony, ale sen poniżej 6 h — podwyżka następnym razem" };
      }
      const step = stepForExercise(ex.name);
      return { ...base, action: "up", kg: round25(lastKg + step), reps: target.min,
        why: `dwie sesje po ${fmtKg(lastKg)} kg z trafionym celem — +${fmtKg(step)} kg` };
    }
    if (hitTop) {
      return { ...base, action: "hold", kg: lastKg, reps: target.max,
        why: "cel trafiony raz — powtórz ten sam ciężar, potem podwyżka" };
    }
    return { ...base, action: "hold", kg: lastKg, reps: target ? target.max : lastReps,
      why: `trzymaj ${fmtKg(lastKg)} kg i dobij górny zakres` };
  });
  return { items, ups: items.filter((i) => i.action === "up").length };
}

// ---------- podpowiedz trenera na dzis ----------
function coachTip({ dayPlan, isDeload, race, sleepH, garmin, weekNum, suggest, netDeficit }) {
  const lines = [];
  let tone = "teal";
  let title;

  const readiness = Number(garmin?.readiness) || null;
  const low = sleepH != null && sleepH < 6;

  if (race && race.diff <= 10) {
    tone = "amber";
    title = race.diff === 0 ? `Dzis start: ${race.label}` : `Taper — ${race.label} za ${race.diff} dni`;
    lines.push("Tnij objętość siłowni, chroń nogi. Nic nowego w jedzeniu i butach.");
  } else if (low) {
    tone = "rust";
    title = `Sen ${sleepH} h — dziś bez jakości`;
    lines.push("Objętość ma się zmieścić w śnie, nie odwrotnie. Z2 do końca, zero progresji ciężaru.");
  } else if (readiness != null && readiness < 40) {
    tone = "rust";
    title = `Gotowość ${readiness}/100 — zejdź z gazu`;
    lines.push("Dziś łatwy Z2 albo spacer. Trening zrobisz jutro, długu snu nie odrobisz.");
  } else if (isDeload) {
    tone = "amber";
    title = `Tydzień ${weekNum} — deload`;
    lines.push("Objętość −40/50%: krótsze biegi, o serię mniej. Ciężar bez zmian. To inwestycja, nie strata.");
  } else if (dayPlan) {
    title = `${dayPlan.name}: ${dayPlan.focus}`;
    if (suggest?.ups) lines.push(`Progresja dziś: ${suggest.ups} ${suggest.ups === 1 ? "ćwiczenie" : "ćwiczenia"} w górę. Reszta bez zmian.`);
    else lines.push("Dziś bez podwyżek — domknij górny zakres powtórzeń na tym samym ciężarze.");
  } else {
    tone = "amber";
    title = "Dzień poza cyklem treningowym";
    lines.push("Chodzenie, mobilność prawego pośladka i kostki. Sen priorytetem.");
  }

  if (netDeficit != null && netDeficit < 0) lines.push(`Bilans dnia na plusie (${Math.abs(netDeficit)} kcal) — wieczorem węglowodany złożone, nie proste.`);
  return { tone, title, lines };
}

function ProgramCard({ dayPlan, program, updateEx, toggleDone, prevSession, onComment, suggest }) {
  const [showSug, setShowSug] = useState(false);
  if (!dayPlan) {
    return (
      <div className="text-sm p-3 mb-5" style={{ color: C.inkSoft, background: C.bgSoft, borderRadius: R.soft, border: `1px dashed ${C.line}` }}>
        Brak planu Silnik na dziś (dzień poza cyklem trening.).
      </div>
    );
  }
  const exStates = program?.ex || {};
  const commentVal = program?.comment || "";

  return (
    <div className="p-4 mb-5" style={{ background: C.paper, borderRadius: R.card }}>
      <div className="flex items-center justify-between mb-1">
        <div>
          <div className="text-sm font-semibold" style={{ color: C.ink }}>{dayPlan.name} — {dayPlan.focus}</div>
        </div>
        <button
          onClick={toggleDone}
          className="flex items-center gap-1 px-2 py-1 text-xs"
          style={{ background: program?.done ? C.teal : C.paperDim, color: program?.done ? C.paper : C.inkSoft, borderRadius: R.soft }}
        >
          <Check size={12} />{program?.done ? "zrobione" : "oznacz"}
        </button>
      </div>
      {typeof dayPlan.warmup === "string" && dayPlan.warmup && (
        <div className="text-xs mb-2 p-2" style={{ background: C.bg, color: C.paper, borderRadius: R.soft }}>
          <span style={{ color: C.amber }}>Rozgrzewka: </span>{dayPlan.warmup}
        </div>
      )}
      {Array.isArray(dayPlan.warmup) && dayPlan.warmup.length > 0 && (
        <div className="mb-3">
          <div className="text-xs uppercase tracking-widest mb-2 pb-1" style={{ color: C.amber, borderBottom: `1px solid ${C.paperDim}` }}>
            Stabilizacja · {dayPlan.stabPhase}
          </div>
          <div className="space-y-2">
            {dayPlan.warmup.map((ex, wi) => {
              const key = "w" + wi;
              const st = exStates[key] || { done: false, sets: "", reps: "", kg: "" };
              return (
                <div key={key} className="pb-1.5" style={{ borderBottom: `1px dashed ${C.paperDim}` }}>
                  <div className="flex items-start gap-2 text-sm mb-1">
                    <button onClick={() => updateEx(key, "done", !st.done)} className="mt-0.5 shrink-0" style={{ color: st.done ? C.teal : C.inkSoft }}>
                      <Check size={16} />
                    </button>
                    <div className="flex-1 leading-snug" style={{ color: C.ink, textDecoration: st.done ? "line-through" : "none" }}>{ex.name}</div>
                  </div>
                  {ex.howto && <div className="text-xs pl-6 mb-1 italic" style={{ color: C.inkSoft }}>{ex.howto}</div>}
                  <div className="flex items-center flex-wrap gap-x-3 gap-y-1 pl-6 text-xs">
                    <span className="font-mono shrink-0" style={{ color: C.inkSoft }}>
                      cel {ex.sets}×{ex.reps}{ex.rest ? ` · przerwa ${ex.rest}` : ""}
                    </span>
                    <label className="flex items-center gap-1" style={{ color: C.inkSoft }}>
                      ser.
                      <input value={st.sets} onChange={(e) => updateEx(key, "sets", e.target.value)}
                        className="w-10 text-center font-mono bg-transparent outline-none" style={{ color: C.ink, borderBottom: `1px solid ${C.line}` }} />
                    </label>
                    {!ex.bw && (
                      <label className="flex items-center gap-1" style={{ color: C.inkSoft }}>
                        kg
                        <input value={st.kg} onChange={(e) => updateEx(key, "kg", e.target.value)}
                          className="w-12 text-center font-mono bg-transparent outline-none" style={{ color: C.ink, borderBottom: `1px solid ${C.amber}` }} />
                      </label>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="text-xs uppercase tracking-widest mt-3 mb-1 pb-1" style={{ color: C.amber, borderBottom: `1px solid ${C.paperDim}` }}>
            Główny trening
          </div>
        </div>
      )}
      {dayPlan.note && (
        <div className="text-xs mb-2 p-2" style={{ background: C.paperDim, color: C.inkSoft, borderRadius: R.soft }}>{dayPlan.note}</div>
      )}

      {prevSession && (
        <div className="text-xs mb-3 p-2" style={{ background: C.bg, color: C.paper, borderRadius: R.soft }}>
          <div className="mb-1" style={{ color: C.amber }}>Poprzednia sesja ({dayLabel(prevSession.date)}){prevSession.done ? " ✓" : ""}:</div>
          <div className="space-y-0.5">
            {dayPlan.exercises.map((e, idx) => {
              const st = prevSession.ex[idx];
              if (!st || (!st.sets && !st.reps && !st.kg)) return null;
              return (
                <div key={idx}>
                  {e.name}: {st.sets || e.sets}×{st.reps || e.reps}{!e.bw && st.kg ? ` @${st.kg}kg` : ""}
                </div>
              );
            })}
          </div>
          {prevSession.comment && (
            <div className="mt-1 pt-1" style={{ borderTop: `1px solid ${C.inkSoft}` }}>
              <span style={{ color: C.amber }}>Komentarz: </span>{prevSession.comment}
            </div>
          )}
        </div>
      )}

      {suggest && (
        <div className="mb-3">
          <button
            onClick={() => setShowSug((v) => !v)}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-medium"
            style={{ background: showSug ? C.paperDim : C.ink, color: showSug ? C.ink : C.paper, borderRadius: R.soft }}
          >
            <Zap size={14} />{showSug ? "Ukryj propozycje" : "Generuj ciężary na dziś"}
          </button>
          {showSug && (
            <div className="text-[11px] mt-2 px-1 leading-snug" style={{ color: C.inkSoft }}>
              Liczone z Twoich ostatnich sesji tego dnia tygodnia. Podwyżka tylko po dwóch sesjach
              na tym samym ciężarze z trafionym górnym zakresem powtórzeń.
            </div>
          )}
        </div>
      )}

      <div className="space-y-3 mt-2">
        {dayPlan.exercises.map((ex, idx) => {
          const st = exStates[idx] || { done: false, sets: "", reps: "", kg: "" };
          const sug = showSug ? suggest?.items?.find((i) => i.idx === idx) : null;
          return (
            <div key={idx} className="pb-2" style={{ borderBottom: `1px solid ${C.paperDim}` }}>
              <div className="flex items-start gap-2 text-sm mb-1.5">
                <button onClick={() => updateEx(idx, "done", !st.done)} className="mt-0.5 shrink-0" style={{ color: st.done ? C.teal : C.inkSoft }}>
                  <Check size={16} />
                </button>
                <div className="flex-1 leading-snug" style={{ color: C.ink, textDecoration: st.done ? "line-through" : "none" }}>{ex.name}</div>
              </div>
              <div className="flex items-center flex-wrap gap-x-3 gap-y-1 pl-6 text-xs">
                <span className="font-mono shrink-0" style={{ color: C.inkSoft }}>cel {ex.sets}×{ex.reps}{ex.rest ? ` · przerwa ${ex.rest}` : ""}</span>
                <label className="flex items-center gap-1" style={{ color: C.inkSoft }}>
                  ser.
                  <input value={st.sets} onChange={(e) => updateEx(idx, "sets", e.target.value)}
                    className="w-10 text-center font-mono bg-transparent outline-none" style={{ color: C.ink, borderBottom: `1px solid ${C.line}` }} />
                </label>
                <label className="flex items-center gap-1" style={{ color: C.inkSoft }}>
                  pow.
                  <input value={st.reps} onChange={(e) => updateEx(idx, "reps", e.target.value)}
                    className="w-10 text-center font-mono bg-transparent outline-none" style={{ color: C.ink, borderBottom: `1px solid ${C.line}` }} />
                </label>
                {!ex.bw && (
                  <label className="flex items-center gap-1" style={{ color: C.inkSoft }}>
                    kg
                    <input value={st.kg} onChange={(e) => updateEx(idx, "kg", e.target.value)}
                      className="w-12 text-center font-mono bg-transparent outline-none" style={{ color: C.ink, borderBottom: `1px solid ${C.amber}` }} />
                  </label>
                )}
              </div>
              {sug && (
                <div className="flex items-start gap-2 mt-2 ml-6 px-2 py-1.5" style={{ background: C.bg, borderRadius: R.soft }}>
                  <span className="shrink-0" style={{ color: sug.action === "up" ? C.amber : sug.action === "down" ? "#E0876E" : C.mute }}>
                    {sug.action === "up" ? "▲" : sug.action === "down" ? "▼" : "="}
                  </span>
                  <div className="flex-1 min-w-0 text-[11px] leading-snug" style={{ color: C.paper }}>
                    <span className="font-mono">
                      {sug.kg ? `${fmtKg(sug.kg)} kg` : "ciężar własny"}{sug.reps ? ` × ${sug.reps}` : ""}
                    </span>
                    <span style={{ color: C.mute }}> — {sug.why}</span>
                  </div>
                  {(sug.kg || sug.reps) && (
                    <button
                      onClick={() => { if (sug.kg) updateEx(idx, "kg", String(sug.kg)); if (sug.reps) updateEx(idx, "reps", String(sug.reps)); }}
                      className="shrink-0 px-2 py-0.5 text-[11px]"
                      style={{ background: C.amber, color: C.ink, borderRadius: R.chip }}
                    >
                      wpisz
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3">
        <div className="text-xs mb-1" style={{ color: C.inkSoft }}>Komentarz do tej sesji (zobaczysz go tu za tydzień)</div>
        <textarea
          value={commentVal}
          onChange={(e) => onComment(e.target.value)}
          placeholder="np. kolano trochę dawało znać na ostatniej serii przysiadu"
          rows={2}
          className="w-full text-xs p-2 outline-none"
          style={{ background: C.bg, color: C.paper, borderRadius: R.soft, border: `1px solid ${C.line}`, resize: "vertical" }}
        />
      </div>
    </div>
  );
}

// ---------- Day view ----------
// ---------- Garmin: import biegu i wellness dla wybranego dnia ----------
function GarminPanel({ date, data, persist }) {
  const [state, setState] = useState("idle"); // idle | loading | ok | empty | error
  const [msg, setMsg] = useState("");

  const g = data.garmin || null;

  const importDay = async () => {
    setState("loading"); setMsg("");
    try {
      // 3 dni zapasu: sync z zegarka bywa opóźniony, nocka przesuwa datę
      const res = await fetchGarmin(3);
      const act = pickRunForDate(res.activities, date);
      const wel = pickWellnessForDate(res.wellness, date);
      if (!act && !wel) { setState("empty"); return; }

      const next = { ...data };
      if (act) {
        next.run = {
          ...(data.run || {}),
          km: act.km != null ? String(act.km) : (data.run?.km || ""),
          timeMin: act.timeMin != null ? String(act.timeMin) : (data.run?.timeMin || ""),
          elevation: act.elevation != null ? String(act.elevation) : (data.run?.elevation || ""),
          avgHr: act.avgHr != null ? String(act.avgHr) : (data.run?.avgHr || ""),
          kcal: act.kcal != null ? String(act.kcal) : (data.run?.kcal || ""),
          hrZoneMin: act.hrZoneMin || (data.run?.hrZoneMin || null),
          load: act.load ?? (data.run?.load ?? null),
          type: act.type || (data.run?.type || ""),
        };
        // spalone uzupełniamy tylko gdy pole puste — ręczny wpis ma pierwszeństwo
        if (!next.burned && act.kcal) next.burned = String(act.kcal);
      }
      if (wel) {
        next.garmin = wel;
        if (!next.weight && wel.weight) next.weight = String(wel.weight);
      }
      persist(next);
      setState("ok");
      setMsg(act ? `${act.name || "trening"}${act.type ? ` (${act.type})` : ""}` : "sam wellness, bez treningu");
    } catch (e) {
      setState("error");
      setMsg(String(e.message || e).slice(0, 180));
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-widest" style={{ color: C.inkSoft }}>Bieg dziś</div>
        <button onClick={importDay} disabled={state === "loading"}
          className="text-xs px-2 py-1 flex items-center gap-1"
          style={{ color: C.teal, border: `1px solid ${C.line}`, borderRadius: R.soft, opacity: state === "loading" ? 0.5 : 1 }}>
          {state === "loading" ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          {state === "loading" ? "pobieram" : "z Garmina"}
        </button>
      </div>
      {state === "empty" && <div className="text-xs mb-2" style={{ color: C.inkSoft }}>Brak danych na ten dzień. Zegarek zsynchronizowany? intervals.icu ciągnie z Garmina w ~5 min.</div>}
      {state === "error" && <div className="text-xs mb-2" style={{ color: C.rust }}>{msg}</div>}
      {state === "ok" && <div className="text-xs mb-2" style={{ color: C.teal }}>Pobrano: {msg}</div>}
      {g && (
        <div className="text-xs mb-3 pb-2 grid grid-cols-4 gap-y-1 gap-x-2 font-mono" style={{ color: C.ink, borderBottom: `1px solid ${C.paperDim}` }}>
          <div><span style={{ color: C.inkSoft }}>HRV </span>{g.hrv ?? "—"}</div>
          <div><span style={{ color: C.inkSoft }}>RHR </span>{g.restingHr ?? "—"}</div>
          <div><span style={{ color: C.inkSoft }}>sen </span>{g.sleepHours != null ? `${g.sleepHours}h` : "—"}</div>
          <div><span style={{ color: C.inkSoft }}>gotow. </span>{g.readiness ?? g.bodyBattery ?? "—"}</div>
          <div><span style={{ color: C.inkSoft }}>VO2 </span>{g.vo2max ?? "—"}</div>
          <div><span style={{ color: C.inkSoft }}>forma </span>{g.ctl ?? "—"}</div>
          <div><span style={{ color: C.inkSoft }}>zmęcz. </span>{g.atl ?? "—"}</div>
          <div><span style={{ color: C.inkSoft }}>ramp </span>{g.rampRate ?? "—"}</div>
        </div>
      )}
    </>
  );
}

function DayView({ date, setDate, data, setData, settings, onSetStart, onSetDietPhase, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [textDesc, setTextDesc] = useState("");
  const [textBusy, setTextBusy] = useState(false);
  const [textError, setTextError] = useState("");
  const [labelName, setLabelName] = useState("");
  const [labelP, setLabelP] = useState("");
  const [labelF, setLabelF] = useState("");
  const [labelC, setLabelC] = useState("");

  const persist = useCallback(async (next, opts = {}) => {
    setData(next);
    setDirty(true);
    const ok = await saveDay(date, next);
    if (ok) {
      setDirty(false); setSaveError(false);
      if (!opts.silent) { setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1200); }
      onSaved && onSaved();
    } else setSaveError(true);
  }, [date, setData, onSaved]);

  const handleManualSave = () => persist(data);

  const handleLabelMeal = () => {
    const p = Number(labelP) || 0, f = Number(labelF) || 0, c = Number(labelC) || 0;
    if (!p && !f && !c) return;
    const kcal = Math.round(p * 4 + f * 9 + c * 4);
    const meal = {
      id: Date.now(),
      time: `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`,
      name: labelName.trim() || "Z etykiety",
      kcal, protein: p, fat: f, carbs: c, details: "",
    };
    persist({ ...data, meals: [...data.meals, meal] });
    setLabelName(""); setLabelP(""); setLabelF(""); setLabelC("");
  };

  const handleTextMeal = async () => {
    if (!textDesc.trim()) return;
    setTextBusy(true); setTextError("");
    try {
      const result = await analyzeMealText(textDesc.trim());
      const meal = {
        id: Date.now(),
        time: `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`,
        name: result.name || textDesc.trim(),
        kcal: Math.round(result.kcal) || 0,
        protein: Math.round(result.protein) || 0,
        fat: Math.round(result.fat) || 0,
        carbs: Math.round(result.carbs) || 0,
        details: result.details || "",
      };
      await persist({ ...data, meals: [...data.meals, meal] });
      setTextDesc("");
    } catch (err) {
      console.error(err);
      setTextError("Błąd: " + (err?.message || String(err)).slice(0, 300));
    } finally { setTextBusy(false); }
  };

  const handlePhoto = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true); setPhotoError("");
    try {
      const base64 = await fileToBase64(file);
      const result = await analyzeMealPhoto(base64, file.type || "image/jpeg");
      const meal = {
        id: Date.now(),
        time: `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`,
        name: result.name || "Posiłek",
        kcal: Math.round(result.kcal) || 0,
        protein: Math.round(result.protein) || 0,
        fat: Math.round(result.fat) || 0,
        carbs: Math.round(result.carbs) || 0,
        details: result.details || "",
      };
      await persist({ ...data, meals: [...data.meals, meal] });
    } catch (err) {
      console.error(err);
      setPhotoError("Błąd: " + (err?.message || String(err)).slice(0, 300));
    } finally { setBusy(false); }
  };

  const updateMeal = (id, field, value) => {
    const numeric = ["kcal", "protein", "fat", "carbs"].includes(field);
    const meals = data.meals.map((m) => (m.id === id ? { ...m, [field]: numeric ? Number(value) || 0 : value } : m));
    persist({ ...data, meals });
  };
  const removeMeal = (id) => persist({ ...data, meals: data.meals.filter((m) => m.id !== id) });
  const addManualMeal = () => {
    const meal = { id: Date.now(), time: `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`, name: "Nowy posiłek", kcal: 0, protein: 0, fat: 0, carbs: 0, details: "" };
    persist({ ...data, meals: [...data.meals, meal] });
  };

  const addExercise = () => persist({ ...data, exercises: [...data.exercises, { id: Date.now(), name: "", note: "" }] });
  const updateExercise = (id, field, value) => persist({ ...data, exercises: data.exercises.map((x) => (x.id === id ? { ...x, [field]: value } : x)) });
  const removeExercise = (id) => persist({ ...data, exercises: data.exercises.filter((x) => x.id !== id) });

  const weekNum = computeWeek(date, settings?.startDate);
  const phase = PHASES[settings?.dietPhase || 1];
  const program = weekNum ? buildProgram(weekNum) : null;
  const dayKey = DAY_KEY_BY_DOW[parseDate(date).getDay()];
  const dayPlan = program && dayKey ? program.find((d) => d.key === dayKey) : null;
  const race = nextRaceInfo(date);
  const isDeload = weekNum != null && weekNum % 4 === 0;

  // ostatnie sesje tego samego dnia tygodnia — potrzebne i do podgladu, i do progresji
  const [prevSessions, setPrevSessions] = useState([]);
  useEffect(() => {
    let cancelled = false;
    if (!dayPlan) { setPrevSessions([]); return; }
    (async () => {
      const found = [];
      for (let w = 1; w <= 10 && found.length < 3; w++) {
        const candidate = addDays(date, -7 * w);
        const cd = await loadDay(candidate);
        const hasEx = cd.program?.ex && Object.keys(cd.program.ex).length > 0;
        const hasComment = !!cd.program?.comment;
        if (hasEx || hasComment) {
          found.push({ date: candidate, ex: cd.program.ex || {}, comment: cd.program.comment || "", done: !!cd.program.done });
        }
      }
      if (!cancelled) setPrevSessions(found);
    })();
    return () => { cancelled = true; };
  }, [date, dayKey, weekNum]);
  const prevSession = prevSessions[0] || null;

  // ostatni test AMRAP — zeby nie pokazywac go codziennie bez sensu
  const [lastAmrap, setLastAmrap] = useState(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (let off = 1; off <= 56; off++) {
        const cand = addDays(date, -off);
        const cd = await loadDay(cand);
        if (cd.amrap?.dips || cd.amrap?.pushups) {
          if (!cancelled) setLastAmrap({ date: cand, off, ...cd.amrap });
          return;
        }
      }
      if (!cancelled) setLastAmrap(null);
    })();
    return () => { cancelled = true; };
  }, [date]);

  const updateProgEx = (idx, field, value) => {
    const prog = data.program || { done: false, ex: {} };
    const cur = prog.ex[idx] || { done: false, sets: "", reps: "" };
    const nextEx = { ...cur, [field]: field === "done" ? value : value };
    persist({ ...data, program: { ...prog, ex: { ...prog.ex, [idx]: nextEx } } }, { silent: true });
  };
  const toggleProgDone = () => {
    const prog = data.program || { done: false, ex: {} };
    persist({ ...data, program: { ...prog, done: !prog.done } });
  };
  const updateProgComment = (value) => {
    const prog = data.program || { done: false, ex: {} };
    persist({ ...data, program: { ...prog, comment: value } }, { silent: true });
  };

  const consumed = data.meals.reduce((s, m) => s + (Number(m.kcal) || 0), 0);
  const cProtein = data.meals.reduce((s, m) => s + (Number(m.protein) || 0), 0);
  const cFat = data.meals.reduce((s, m) => s + (Number(m.fat) || 0), 0);
  const cCarbs = data.meals.reduce((s, m) => s + (Number(m.carbs) || 0), 0);
  const burned = Number(data.burned) || 0;
  const net = burned - consumed;
  const pct = Math.max(0, Math.min(100, (net / TARGET_DEFICIT) * 100));

  const [prevBedtime, setPrevBedtime] = useState("");
  useEffect(() => {
    let cancelled = false;
    loadDay(addDays(date, -1)).then((cd) => { if (!cancelled) setPrevBedtime(cd.sleepTime || ""); });
    return () => { cancelled = true; };
  }, [date]);
  const hrs = sleepHours(prevBedtime, data.wakeTime);

  // propozycje ciężarów i podpowiedź trenera na dziś — liczone lokalnie, bez API
  const suggest = suggestLoads(dayPlan, prevSessions, { isDeload, lowSleep: hrs != null && hrs < 6 });
  const tip = coachTip({ dayPlan, isDeload, race, sleepH: hrs, garmin: data.garmin, weekNum, suggest, netDeficit: net });

  const [lastWeighIn, setLastWeighIn] = useState(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // celujemy dokładnie w -7 dni (ten sam dzień tygodnia, realny progres tydzień-do-tygodnia),
      // z marginesem ±3 dni gdyby akurat wtedy nie było wpisu — bliżej 7 ma pierwszeństwo
      const offsets = [7, 6, 8, 5, 9, 4, 10];
      for (const off of offsets) {
        const cand = addDays(date, -off);
        const cd = await loadDay(cand);
        if (cd.weight || cd.bodyComp?.fat || cd.bodyComp?.muscle || cd.bodyComp?.bone || cd.bodyComp?.water) {
          if (!cancelled) setLastWeighIn({ date: cand, offset: off, weight: cd.weight, ...cd.bodyComp });
          return;
        }
      }
      if (!cancelled) setLastWeighIn(null);
    })();
    return () => { cancelled = true; };
  }, [date]);

  return (
    <div>
      {/* nawigacja po dniach */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setDate(addDays(date, -1))} className="p-1" style={{ color: C.mute }}><ChevronLeft size={22} /></button>
        <div className="text-center">
          <div className="text-[11px] uppercase tracking-[0.2em]" style={{ color: C.amber, fontFamily: "ui-monospace, monospace" }}>Dziennik</div>
          <div className="text-lg font-serif capitalize" style={{ color: C.paper }}>{dayLabel(date)}</div>
        </div>
        <button onClick={() => setDate(addDays(date, 1))} className="p-1" style={{ color: C.mute }}><ChevronRight size={22} /></button>
      </div>

      {/* 1. ZASADY — na samej gorze, bo o nich sie zapomina */}
      <Card tone="dark">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] uppercase tracking-[0.2em]" style={{ color: C.amber, fontFamily: "ui-monospace, monospace" }}>Zasady Silnika</div>
          <div className="flex gap-1.5">
            {weekNum != null && <Chip tone="amber">tydz. {weekNum}/{TOTAL_WEEKS}</Chip>}
            {isDeload && <Chip tone="rust">deload</Chip>}
          </div>
        </div>
        <div className="text-[11.5px] space-y-1" style={{ color: C.paper, lineHeight: 1.35 }}>
          <div><span style={{ color: C.amber }}>Sen jest limitem.</span> Objętość ma się zmieścić w śnie, nie odwrotnie.</div>
          <div><span style={{ color: C.amber }}>Baza = HR pod 135.</span> Zero jakości, Z1/Z2 do końca bloku.</div>
          <div><span style={{ color: C.amber }}>Co 4. tydzień deload</span> −40/50% objętości. Nieodpuszczalny przy deficycie snu.</div>
          <div><span style={{ color: C.amber }}>Siłownia wspiera bieganie,</span> nigdy odwrotnie. Długi bieg jest ważniejszy.</div>
          <div><span style={{ color: C.amber }}>Sobota:</span> góra idzie PO biegu, nigdy przed.</div>
          <div><span style={{ color: C.amber }}>Ciągłość ponad perfekcję.</span> Trenuj pod ostatnie 40 km, nie pierwsze 20.</div>
        </div>
      </Card>

      {/* 2. podpowiedz na dzis */}
      <Card style={{ borderLeft: `3px solid ${tip.tone === "rust" ? C.rust : tip.tone === "amber" ? C.amber : C.teal}` }}>
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] mb-1" style={{ color: C.inkSoft, fontFamily: "ui-monospace, monospace" }}>
          <Zap size={12} /> Na dziś
        </div>
        <div className="text-base font-serif mb-1" style={{ color: C.ink }}>{tip.title}</div>
        {tip.lines.map((l, i) => (
          <div key={i} className="text-xs leading-snug" style={{ color: C.inkSoft }}>{l}</div>
        ))}
      </Card>

      {/* 3. priorytety dnia */}
      <TodayPriorities date={date} compact />

      {/* 4. liczby dnia */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <StatTile
          label="Bilans netto"
          value={consumed || burned ? `${net >= 0 ? "−" : "+"}${Math.abs(net)}` : "—"}
          unit={consumed || burned ? "kcal" : ""}
          tone={!consumed && !burned ? "paper" : net >= 0 ? "teal" : "rust"}
          sub={consumed || burned ? `cel −${TARGET_DEFICIT} · zjedzone ${consumed}` : `cel −${TARGET_DEFICIT} kcal`}
        />
        <StatTile
          label="Sen" value={hrs != null ? hrs : "—"} unit={hrs != null ? "h" : ""}
          tone={hrs == null ? "paper" : hrs < 6 ? "rust" : hrs >= 7 ? "teal" : "amber"}
          sub={hrs == null ? "uzupełnij godziny" : hrs < 6 ? "poniżej minimum" : "ok"}
        />
        <StatTile
          label="Waga" value={data.weight || lastWeighIn?.weight || "—"} unit="kg"
          sub={data.weight && lastWeighIn?.weight ? `${(Number(data.weight) - Number(lastWeighIn.weight)).toFixed(1)} kg od ${lastWeighIn.date.slice(5)}` : "cel 89-90 kg"}
        />
        <StatTile
          label="Gotowość" value={data.garmin?.readiness ?? "—"}
          tone={data.garmin?.readiness == null ? "paper" : data.garmin.readiness < 40 ? "rust" : "teal"}
          sub={data.garmin?.hrv ? `HRV ${data.garmin.hrv} · RHR ${data.garmin.restingHr ?? "—"}` : "pobierz z zegarka niżej"}
        />
      </div>

      {/* pasek deficytu + zapis */}
      <Card>
        <div className="h-2 w-full mb-2" style={{ background: C.paperDim, borderRadius: R.chip }}>
          <div className="h-2" style={{ width: `${pct}%`, background: net >= 0 ? C.teal : C.rust, borderRadius: R.chip, transition: "width .3s" }} />
        </div>
        <div className="flex items-center justify-between">
          <div className="text-xs font-mono" style={{ color: C.inkSoft }}>spożyte {consumed} · spalone {burned || "—"}</div>
          <div className="flex items-center gap-2">
            {savedFlash && <span className="text-xs flex items-center gap-1" style={{ color: C.teal }}><Check size={13} />zapisano</span>}
            {saveError && <span className="text-xs" style={{ color: C.rust }}>błąd zapisu</span>}
            <button onClick={handleManualSave} className="flex items-center gap-1 px-3 py-1.5 text-xs"
              style={{ background: dirty || saveError ? C.amber : C.ink, color: dirty || saveError ? C.ink : C.paper, borderRadius: R.soft }}>
              <Check size={13} />Zapisz dzień
            </button>
          </div>
        </div>
      </Card>

      <ProgramSettingsRow settings={settings} onSetStart={onSetStart} onSetDietPhase={onSetDietPhase} weekNum={weekNum} phase={phase} />

      {/* 5. TRENING */}
      <SectionLabel icon={<Dumbbell size={12} />}>Trening</SectionLabel>
      <ProgramCard dayPlan={dayPlan} program={data.program} updateEx={updateProgEx} toggleDone={toggleProgDone} prevSession={prevSession} onComment={updateProgComment} suggest={suggest} />

      <Card>
        <GarminPanel date={date} data={data} persist={persist} />
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="text-xs mb-1" style={{ color: C.inkSoft }}>Dystans (km)</div>
            <input type="number" step="0.1" placeholder="np. 12" value={data.run?.km || ""} onChange={(e) => persist({ ...data, run: { ...(data.run || {}), km: e.target.value } })}
              className="w-full bg-transparent outline-none text-lg font-mono" style={{ color: C.ink }} />
          </div>
          <div>
            <div className="text-xs mb-1" style={{ color: C.inkSoft }}>Czas (min)</div>
            <input type="number" placeholder="np. 65" value={data.run?.timeMin || ""} onChange={(e) => persist({ ...data, run: { ...(data.run || {}), timeMin: e.target.value } })}
              className="w-full bg-transparent outline-none text-lg font-mono" style={{ color: C.ink }} />
          </div>
          <div>
            <div className="text-xs mb-1" style={{ color: C.inkSoft }}>Przewyższenie (m)</div>
            <input type="number" placeholder="np. 450" value={data.run?.elevation || ""} onChange={(e) => persist({ ...data, run: { ...(data.run || {}), elevation: e.target.value } })}
              className="w-full bg-transparent outline-none text-lg font-mono" style={{ color: C.ink }} />
          </div>
        </div>
        {(() => {
          const pce = runPace(data.run?.km, data.run?.timeMin);
          const f = formatPace(pce);
          const extra = [
            f ? `śr. tempo: ${f} /km` : null,
            data.run?.avgHr ? `śr. HR ${data.run.avgHr}` : null,
            data.run?.kcal ? `${data.run.kcal} kcal` : null,
          ].filter(Boolean).join("  ·  ");
          return extra ? <div className="text-xs mt-2 font-mono" style={{ color: C.teal }}>{extra}</div> : null;
        })()}
      </Card>

      {/* AMRAP tylko w deloadzie; poza nim zwiniety z data ostatniego testu */}
      {isDeload ? (
        <Card style={{ borderLeft: `3px solid ${C.amber}` }}>
          <div className="text-xs uppercase tracking-[0.18em] mb-1" style={{ color: C.inkSoft, fontFamily: "ui-monospace, monospace" }}>AMRAP — tydzień testowy</div>
          <div className="text-xs mb-3" style={{ color: C.inkSoft }}>
            Deload to moment na test. Jedna seria na maksimum powtórzeń.
            {lastAmrap ? ` Ostatni raz ${lastAmrap.off} dni temu: dipsy ${lastAmrap.dips || "—"}, pompki ${lastAmrap.pushups || "—"}.` : " Pierwszy pomiar — zapisz punkt odniesienia."}
          </div>
          <AmrapInputs data={data} persist={persist} />
        </Card>
      ) : (
        <Collapsible
          storageKey="amrap"
          icon={<Heart size={15} />}
          title="AMRAP — test dipsy / pompki"
          hint={lastAmrap ? `ostatnio ${lastAmrap.off} dni temu: ${lastAmrap.dips || "—"} / ${lastAmrap.pushups || "—"}` : "jeszcze nie testowane"}
        >
          <div className="text-xs mb-3" style={{ color: C.inkSoft }}>
            Test robi się w tygodniu deload (co 4.), nie codziennie — częściej nie pokaże progresu, a kosztuje regenerację.
            Następny deload: tydzień {weekNum != null ? Math.ceil(weekNum / 4) * 4 : "—"}.
          </div>
          <AmrapInputs data={data} persist={persist} />
        </Collapsible>
      )}

      {/* 6. POMIARY */}
      <SectionLabel icon={<Scale size={12} />}>Pomiary i sen</SectionLabel>
      <Collapsible
        storageKey="sleep" defaultOpen icon={<Moon size={15} />}
        title="Sen i spalone kcal"
        hint={hrs != null ? `${hrs} h snu · ${data.burned || "—"} kcal spalone` : "uzupełnij godziny"}
      >
        <div className="mb-3">
          <div className="text-xs mb-1" style={{ color: C.inkSoft }}>Wstałem (dziś rano)</div>
          <input type="time" value={data.wakeTime} onChange={(e) => persist({ ...data, wakeTime: e.target.value })}
            className="w-full bg-transparent outline-none text-lg font-mono" style={{ color: C.ink }} />
          <div className="text-xs mt-1 flex items-center gap-1 flex-wrap" style={{ color: C.inkSoft }}>
            <span>wczoraj poszedł spać:</span>
            <input type="time" value={prevBedtime} onChange={async (e) => {
              const v = e.target.value; setPrevBedtime(v);
              const yData = await loadDay(addDays(date, -1));
              await saveDay(addDays(date, -1), { ...yData, sleepTime: v });
            }} className="bg-transparent outline-none font-mono" style={{ color: C.ink, borderBottom: `1px solid ${C.line}` }} />
          </div>
        </div>
        <div>
          <div className="text-xs flex items-center gap-1 mb-1" style={{ color: C.inkSoft }}><Flame size={12} /> Spalone (zegarek)</div>
          <input type="number" placeholder="kcal" value={data.burned} onChange={(e) => persist({ ...data, burned: e.target.value })}
            className="w-full bg-transparent outline-none text-lg font-mono" style={{ color: C.ink }} />
        </div>
      </Collapsible>

      <Collapsible
        storageKey="body" icon={<Scale size={15} />}
        title="Waga i skład ciała"
        hint={data.weight ? `${data.weight} kg dzisiaj` : lastWeighIn ? `ostatnio ${lastWeighIn.weight || "—"} kg (${lastWeighIn.date.slice(5)})` : "brak pomiaru"}
      >
        <div className="grid grid-cols-2 gap-3 mb-2">
          {[
            ["Waga (kg)", "weight", "np. 96.4"],
            ["Tłuszcz (%)", "fat", "np. 22.0"],
            ["Mięśnie (kg)", "muscle", "np. 40.0"],
            ["Kości (kg)", "bone", "np. 3.2"],
            ["Woda (%)", "water", "np. 55.0"],
          ].map(([label, key, ph]) => (
            <div key={key}>
              <div className="text-xs mb-1" style={{ color: C.inkSoft }}>{label}</div>
              <input
                type="number" step="0.1" placeholder={ph}
                value={key === "weight" ? data.weight : data.bodyComp?.[key] || ""}
                onChange={(e) => persist(key === "weight"
                  ? { ...data, weight: e.target.value }
                  : { ...data, bodyComp: { ...(data.bodyComp || {}), [key]: e.target.value } })}
                className="w-full bg-transparent outline-none text-lg font-mono" style={{ color: C.ink }}
              />
            </div>
          ))}
        </div>
        {lastWeighIn && (
          <div className="text-xs pt-2 mt-1" style={{ color: C.inkSoft, borderTop: `1px solid ${C.paperDim}` }}>
            {lastWeighIn.offset === 7 ? "Tydzień temu" : `Sprzed ${lastWeighIn.offset} dni`} ({lastWeighIn.date}): {lastWeighIn.weight || "—"}kg
            {lastWeighIn.fat ? ` · tłuszcz ${lastWeighIn.fat}%` : ""}
            {lastWeighIn.muscle ? ` · mięśnie ${lastWeighIn.muscle}kg` : ""}
            {lastWeighIn.water ? ` · woda ${lastWeighIn.water}%` : ""}
          </div>
        )}
      </Collapsible>

      {/* 7. JEDZENIE — na dole, zwiniete */}
      <SectionLabel icon={<Utensils size={12} />}>Jedzenie</SectionLabel>
      <Collapsible
        storageKey="meals" icon={<Utensils size={15} />}
        title="Posiłki"
        hint={data.meals.length ? `${consumed} kcal · B ${cProtein} / T ${cFat} / W ${cCarbs} g` : "nic jeszcze nie zapisane"}
        badge={<Chip tone={data.meals.length ? "teal" : "mute"}>{data.meals.length}</Chip>}
      >
        {phase && (
          <div className="space-y-2 mb-3 pb-3" style={{ borderBottom: `1px solid ${C.paperDim}` }}>
            <div className="text-xs uppercase tracking-widest mb-1" style={{ color: C.inkSoft }}>Cel dnia — {phase.name}</div>
            <MacroBar label="Kcal" value={consumed} target={phase.kcal} color={C.amber} />
            <MacroBar label="Białko (g)" value={cProtein} target={phase.protein} color={C.teal} />
            <MacroBar label="Tłuszcz (g)" value={cFat} target={phase.fat} color={C.rust} />
            <MacroBar label="Węgle (g)" value={cCarbs} target={phase.carbs} color={C.inkSoft} />
          </div>
        )}

        <div className="flex items-center gap-2 mb-2" style={{ opacity: busy ? 0.7 : 1 }}>
          <Camera size={16} style={{ color: C.inkSoft, flexShrink: 0 }} />
          <input type="file" accept="image/*" onChange={handlePhoto} disabled={busy} className="flex-1 text-xs" style={{ color: C.ink }} />
          {busy && <Loader2 size={16} className="animate-spin" style={{ color: C.inkSoft, flexShrink: 0 }} />}
        </div>
        {photoError && <div className="text-xs mb-2" style={{ color: C.rust }}>{photoError}</div>}

        <div className="flex items-center gap-2 mb-2 px-2 py-1.5" style={{ background: C.paperDim, borderRadius: R.soft, opacity: textBusy ? 0.7 : 1 }}>
          <input
            type="text" placeholder="opisz posiłek, np. kurczak z ryżem 400g" value={textDesc}
            onChange={(e) => setTextDesc(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleTextMeal(); }}
            disabled={textBusy}
            className="flex-1 min-w-0 text-sm bg-transparent outline-none" style={{ color: C.ink }}
          />
          <button onClick={handleTextMeal} disabled={textBusy || !textDesc.trim()}
            className="px-3 py-1 text-xs shrink-0" style={{ background: C.amber, color: C.ink, borderRadius: R.chip, opacity: textDesc.trim() ? 1 : 0.5 }}>
            {textBusy ? <Loader2 size={14} className="animate-spin" /> : "Oblicz"}
          </button>
        </div>
        {textError && <div className="text-xs mb-2" style={{ color: C.rust }}>{textError}</div>}

        <div className="mb-3 pt-2" style={{ borderTop: `1px solid ${C.paperDim}` }}>
          <div className="text-xs mb-2" style={{ color: C.inkSoft }}>albo z etykiety (B/T/W) — bez AI</div>
          <input
            type="text" placeholder="nazwa (opcjonalnie)" value={labelName}
            onChange={(e) => setLabelName(e.target.value)}
            className="w-full text-sm bg-transparent outline-none mb-2 pb-1" style={{ color: C.ink, borderBottom: `1px solid ${C.paperDim}` }}
          />
          <div className="grid grid-cols-3 gap-2 mb-2">
            {[["Białko (g)", labelP, setLabelP], ["Tłuszcz (g)", labelF, setLabelF], ["Węgle (g)", labelC, setLabelC]].map(([lab, val, setter]) => (
              <div key={lab}>
                <div className="text-xs mb-1" style={{ color: C.inkSoft }}>{lab}</div>
                <input type="number" placeholder="0" value={val} onChange={(e) => setter(e.target.value)}
                  className="w-full bg-transparent outline-none text-lg font-mono" style={{ color: C.ink }} />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono" style={{ color: C.inkSoft }}>
              = {Math.round((Number(labelP) || 0) * 4 + (Number(labelF) || 0) * 9 + (Number(labelC) || 0) * 4)} kcal
            </span>
            <div className="flex gap-2">
              <button onClick={addManualMeal} className="px-3 py-1 text-xs" style={{ border: `1px solid ${C.line}`, color: C.ink, borderRadius: R.chip }}>pusty wpis</button>
              <button onClick={handleLabelMeal} disabled={!labelP && !labelF && !labelC}
                className="px-3 py-1 text-xs" style={{ background: C.amber, color: C.ink, borderRadius: R.chip, opacity: (labelP || labelF || labelC) ? 1 : 0.5 }}>
                Dodaj
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {data.meals.length === 0 && (
            <div className="text-xs p-3" style={{ color: C.inkSoft, background: C.paperDim, borderRadius: R.soft }}>
              Brak posiłków. Zdjęcie albo opis — AI oszacuje makro.
            </div>
          )}
          {data.meals.map((m) => (
            <div key={m.id} className="p-2.5" style={{ background: C.paperDim, borderRadius: R.soft }}>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <input value={m.name} onChange={(e) => updateMeal(m.id, "name", e.target.value)}
                    className="w-full bg-transparent outline-none text-sm font-medium" style={{ color: C.ink }} />
                  {m.details && <div className="text-xs mt-0.5 leading-snug" style={{ color: C.inkSoft }}>{m.details}</div>}
                </div>
                <button onClick={() => removeMeal(m.id)} className="shrink-0 p-1" style={{ color: C.rust }}><X size={15} /></button>
              </div>
              <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs font-mono" style={{ color: C.inkSoft }}>
                <input value={m.time} onChange={(e) => updateMeal(m.id, "time", e.target.value)}
                  className="w-12 bg-transparent outline-none" style={{ color: C.inkSoft }} />
                <span>
                  <input type="number" value={m.kcal} onChange={(e) => updateMeal(m.id, "kcal", e.target.value)}
                    className="w-12 text-right bg-transparent outline-none font-semibold" style={{ color: C.ink }} /> kcal
                </span>
                <span>B <input type="number" value={m.protein} onChange={(e) => updateMeal(m.id, "protein", e.target.value)} className="w-9 bg-transparent outline-none" style={{ color: C.ink }} />g</span>
                <span>T <input type="number" value={m.fat} onChange={(e) => updateMeal(m.id, "fat", e.target.value)} className="w-9 bg-transparent outline-none" style={{ color: C.ink }} />g</span>
                <span>W <input type="number" value={m.carbs} onChange={(e) => updateMeal(m.id, "carbs", e.target.value)} className="w-9 bg-transparent outline-none" style={{ color: C.ink }} />g</span>
              </div>
            </div>
          ))}
        </div>
      </Collapsible>

      <Collapsible storageKey="ref-timing" icon={<Utensils size={15} />} title="Co i kiedy jeść" hint="zasady rozkładu makro w ciągu dnia">
        <div className="text-xs space-y-1.5" style={{ color: C.ink, lineHeight: 1.45 }}>
          <div><span style={{ color: C.amber }}>Rano/dzień:</span> białko + tłuszcz sycą, nie sól. Słone posiłki działają, bo są białkowe — słodkie z tym samym białkiem sycą tak samo.</div>
          <div><span style={{ color: C.amber }}>Wieczorem:</span> jedyna pora na węglowodany — złożone (owies, ryż brązowy, kasza), nie proste. Stabilny cukier, nie budzi w nocy.</div>
          <div><span style={{ color: C.amber }}>Wyjątek — proste:</span> pre-workout (60-90 min przed czw/sob) i zaraz po długim biegu — banan, miód, biały ryż.</div>
          <div><span style={{ color: C.amber }}>Białko:</span> ~4×35-40 g co 3-4 h, nie 1-2 duże porcje.</div>
          <div><span style={{ color: C.amber }}>Dni jakościowe:</span> trochę węgli 60-90 min przed.</div>
        </div>
      </Collapsible>

      <Collapsible storageKey="ref-supp" icon={<Plus size={15} />} title="Suplementacja" hint="co, kiedy i czego nie łączyć">
        <div className="text-xs space-y-1.5" style={{ color: C.ink, lineHeight: 1.45 }}>
          <div><span style={{ color: C.amber }}>Rano, na czczo:</span> UC-II (stawy), tart cherry 30 ml</div>
          <div><span style={{ color: C.amber }}>Ze śniadaniem:</span> wit. D, omega-3, kreatyna</div>
          <div><span style={{ color: C.amber }}>W dzień:</span> multiwitamina (osobno od żelaza/cynku, min. 2 h)</div>
          <div><span style={{ color: C.amber }}>Wieczorem:</span> cynk + magnez, tart cherry 30 ml (30-60 min przed snem)</div>
          <div className="pt-1.5 mt-1" style={{ color: C.inkSoft, borderTop: `1px solid ${C.paperDim}` }}>
            <span style={{ color: C.rust }}>Tylko wyścigi:</span> Beet It Sport — ładowanie 4-6 dni przed, + shot 90 min-2,5 h przed startem. Nie na treningach.
          </div>
          <div style={{ color: C.inkSoft }}>
            <span style={{ color: C.rust }}>Długi bieg:</span> elektrolity w płynie co 45-60 min — sód, nie sama woda. Twój pot: ~2,9 L/3 h.
          </div>
        </div>
      </Collapsible>

      <Collapsible
        storageKey="extra" icon={<Dumbbell size={15} />} title="Dodatkowe ćwiczenia"
        hint={data.exercises.length ? `${data.exercises.length} wpisów` : "spacer, mobilność, cokolwiek poza planem"}
      >
        <div className="space-y-2">
          {data.exercises.map((x) => (
            <div key={x.id} className="p-2 flex items-center gap-2" style={{ background: C.paperDim, borderRadius: R.soft }}>
              <input placeholder="np. spacer z psem" value={x.name} onChange={(e) => updateExercise(x.id, "name", e.target.value)}
                className="flex-1 min-w-0 bg-transparent outline-none text-sm" style={{ color: C.ink }} />
              <input placeholder="notatka" value={x.note} onChange={(e) => updateExercise(x.id, "note", e.target.value)}
                className="flex-1 min-w-0 bg-transparent outline-none text-xs" style={{ color: C.inkSoft }} />
              <button onClick={() => removeExercise(x.id)} style={{ color: C.rust }}><X size={14} /></button>
            </div>
          ))}
          <button onClick={addExercise} className="flex items-center gap-1 text-xs" style={{ color: C.inkSoft }}><Plus size={13} /> dodaj</button>
        </div>
      </Collapsible>

      <ExportPanel label="📋 Eksportuj ten dzień" buildText={() => buildDayExportLine(date, data, settings, prevBedtime)} />
    </div>
  );
}

// wspólne pola testu AMRAP
function AmrapInputs({ data, persist }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <div className="text-xs mb-1" style={{ color: C.inkSoft }}>Dipsy (powt.)</div>
        <input type="number" placeholder="np. 18" value={data.amrap?.dips || ""} onChange={(e) => persist({ ...data, amrap: { ...(data.amrap || {}), dips: e.target.value } })}
          className="w-full bg-transparent outline-none text-lg font-mono" style={{ color: C.ink }} />
      </div>
      <div>
        <div className="text-xs mb-1" style={{ color: C.inkSoft }}>Pompki (powt.)</div>
        <input type="number" placeholder="np. 35" value={data.amrap?.pushups || ""} onChange={(e) => persist({ ...data, amrap: { ...(data.amrap || {}), pushups: e.target.value } })}
          className="w-full bg-transparent outline-none text-lg font-mono" style={{ color: C.ink }} />
      </div>
    </div>
  );
}
// ---------- kontekst planu: blok periodyzacji, deload, wyścig ----------
// Baza 6 tyg -> ME 6 -> Baza 6 -> ME 6, deload co 4. tydzień przez cały plan.
function blockForWeek(w) {
  if (!w) return { name: "poza planem", weekInBlock: null, rule: "" };
  const idx = Math.floor((w - 1) / 6);
  const weekInBlock = ((w - 1) % 6) + 1;
  const defs = [
    { name: "Baza 1", rule: "Czysta Z1/Z2, HR pod 135, zero jakości. Objętość rośnie, intensywność nie." },
    { name: "ME 1", rule: "Muscular Endurance: schody/podbiegi, ciężar w plecaku. Wymaga 4 tyg. bazy za sobą." },
    { name: "Baza 2", rule: "Powrót do Z1/Z2, konsolidacja po ME. HR pod kontrolą." },
    { name: "ME 2", rule: "Drugi blok ME, wyżej objętość. W środku wyjazd lodowy (Słowacja, luty)." },
  ];
  const d = defs[Math.min(idx, defs.length - 1)];
  return { ...d, weekInBlock };
}

function planContextText(monday, weekNum) {
  const b = blockForWeek(weekNum);
  const isDeload = weekNum != null && weekNum % 4 === 0;
  const race = nextRaceInfo(monday);
  return [
    `Tydzień ${weekNum ?? "—"}/${TOTAL_WEEKS} planu, blok ${b.name} (tydz. ${b.weekInBlock ?? "—"}/6)`,
    `Zasada bloku: ${b.rule}`,
    `Status: ${isDeload ? "DELOAD — objętość ma spaść o 40-50%, to część planu" : "tydzień roboczy"}`,
    race ? `Następny cel: ${race.label}, za ${race.diff} dni` : "",
    `Struktura tygodnia: śr garaż push/pull + bieg, czw nogi + prehab prawej strony + wspinanie, pt plecy/chwyt (zero nóg), sob long run + lekka góra po biegu`,
  ].filter(Boolean).join("\n");
}

// ---------- agregaty z Garmina dla tygodnia ----------
function garminWeekAgg(days) {
  const w = days.map((d) => d.data?.garmin).filter(Boolean);
  const avg = (key) => {
    const v = w.map((x) => x?.[key]).filter((x) => x != null);
    return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
  };
  const last = (key) => {
    for (let i = w.length - 1; i >= 0; i--) if (w[i]?.[key] != null) return w[i][key];
    return null;
  };
  const first = (key) => {
    for (let i = 0; i < w.length; i++) if (w[i]?.[key] != null) return w[i][key];
    return null;
  };
  // minuty w strefach z wszystkich biegów tygodnia
  const zones = [0, 0, 0, 0, 0, 0, 0];
  let hasZones = false;
  days.forEach((d) => {
    const z = d.data?.run?.hrZoneMin;
    if (Array.isArray(z)) { hasZones = true; z.forEach((m, i) => { zones[i] = (zones[i] || 0) + (Number(m) || 0); }); }
  });
  const easy = zones[0] + zones[1];
  const hard = zones.slice(2).reduce((a, b) => a + b, 0);
  return {
    count: w.length,
    hrv: avg("hrv"), restingHr: avg("restingHr"), sleep: avg("sleepHours"),
    sleepScore: avg("sleepScore"), avgSleepingHr: avg("avgSleepingHr"),
    vo2max: last("vo2max"),
    ctlStart: first("ctl"), ctlEnd: last("ctl"), atlEnd: last("atl"), rampRate: last("rampRate"),
    steps: avg("steps"),
    zones: hasZones ? { easy: Math.round(easy), hard: Math.round(hard), pct: easy + hard ? Math.round((easy / (easy + hard)) * 100) : null } : null,
  };
}

function garminAggText(g) {
  if (!g || !g.count) return "brak danych z zegarka w tym tygodniu";
  const l = [
    `HRV śr. ${g.hrv ?? "—"} | tętno spoczynkowe śr. ${g.restingHr ?? "—"} | tętno podczas snu śr. ${g.avgSleepingHr ?? "—"}`,
    `Sen śr. ${g.sleep ?? "—"} h (score ${g.sleepScore ?? "—"}), dni z danymi: ${g.count}/7`,
    `VO2max: ${g.vo2max ?? "—"}`,
    `Forma CTL ${g.ctlStart ?? "—"} -> ${g.ctlEnd ?? "—"} | zmęczenie ATL ${g.atlEnd ?? "—"} | rampRate ${g.rampRate ?? "—"}`,
    `Kroki śr./dzień: ${g.steps ?? "—"} (obciążenie z pracy, nie z treningu)`,
  ];
  if (g.zones) l.push(`Strefy HR w bieganiu: ${g.zones.easy} min Z1-Z2, ${g.zones.hard} min Z3+, czyli ${g.zones.pct ?? "—"}% łatwo`);
  return l.join("\n");
}

function buildWeekSummaryText(monday, days, rows, agg) {
  const g = garminWeekAgg(days);
  const lines = [
    "=== PLAN ===",
    planContextText(monday, agg.weekNum),
    "",
    "=== TYDZIEŃ " + monday + " — WYKONANIE ===",
    `Bieganie: ${agg.totalKm} km, ${agg.totalElev} m przewyższenia, śr. tempo ${agg.avgPaceWeek || "—"}/km`,
    `Treningi zaliczone: ${agg.doneCount}/${agg.trainDays}`,
    `Obciążenia kluczowe: ${agg.weekLifts.map((l) => `${l.label} ${l.kg ? l.kg + "kg" : "—"}`).join(", ")}`,
    `Bilans kaloryczny: ${agg.totalNet} kcal (cel tygodnia ${TARGET_DEFICIT * 7})`,
    `Sen wpisany ręcznie śr. ${agg.avgSleep ?? "—"} h | białko śr. ${agg.avgProtein} g (cel 180)`,
    `Waga ostatni wpis: ${agg.lastWeight || "—"} kg`,
    "",
    "=== ZEGAREK (obiektywne, ważniejsze od wpisów ręcznych) ===",
    garminAggText(g),
    "",
    "=== DZIEŃ PO DNIU ===",
  ];
  rows.forEach((r) => {
    const d = days.find((x) => x.date === r.date);
    const w = d?.data?.garmin || null;
    const comment = d?.data?.program?.comment;
    const run = r.runKm
      ? `${r.runKm}km${r.runElev ? " +" + r.runElev + "m" : ""}${d?.data?.run?.avgHr ? ", śr. HR " + d.data.run.avgHr : ""}`
      : "bez biegu";
    const wellness = w
      ? `HRV ${w.hrv ?? "—"}, RHR ${w.restingHr ?? "—"}, sen ${w.sleepHours ?? "—"}h`
      : "brak danych z zegarka";
    lines.push(
      `  ${shortLabel(r.date)}: ${run} | ${wellness} | spożyte ${r.consumed}kcal, spalone ${r.burned || "—"} | ` +
      `${r.isTrainDay ? (r.progDone ? "trening zrobiony" : "trening NIEzrobiony") : "wolne"}` +
      (comment ? ` | komentarz: ${comment}` : "")
    );
  });
  return lines.join("\n");
}

// pełny blok poprzedniego tygodnia — do porównania, nie jednolinijkowiec
function buildPrevWeekText(monday, days, agg) {
  const g = garminWeekAgg(days);
  return [
    `=== POPRZEDNI TYDZIEŃ (${monday}) ===`,
    `Bieganie: ${agg.totalKm} km, ${agg.totalElev} m+, treningi ${agg.doneCount}/${agg.trainDays}`,
    `Bilans ${agg.totalNet} kcal, waga ${agg.lastWeight || "—"} kg`,
    garminAggText(g),
  ].join("\n");
}

// ---------- lista zadan wielokrotnego uzytku ----------
function CheckList({ items, onChange, placeholder, max = 8, accent = C.teal }) {
  const update = (id, patch) => onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const remove = (id) => onChange(items.filter((i) => i.id !== id));
  return (
    <div className="space-y-1.5">
      {items.map((it) => (
        <div key={it.id} className="flex items-center gap-2">
          <button onClick={() => update(it.id, { done: !it.done })} className="shrink-0"
            style={{ color: it.done ? accent : C.inkSoft }}>
            <Check size={16} />
          </button>
          <input
            value={it.text}
            onChange={(e) => update(it.id, { text: e.target.value })}
            placeholder={placeholder}
            className="flex-1 min-w-0 bg-transparent outline-none text-sm py-1"
            style={{ color: C.ink, textDecoration: it.done ? "line-through" : "none", opacity: it.done ? 0.55 : 1, borderBottom: `1px solid ${C.paperDim}` }}
          />
          <button onClick={() => remove(it.id)} className="shrink-0" style={{ color: C.rust }}><X size={14} /></button>
        </div>
      ))}
      {items.length < max && (
        <button onClick={() => onChange([...items, newItem()])}
          className="flex items-center gap-1 text-xs pt-1" style={{ color: C.inkSoft }}>
          <Plus size={13} /> dodaj
        </button>
      )}
    </div>
  );
}

// ---------- priorytety dnia: skrót na gorze widoku DZIEŃ ----------
function TodayPriorities({ date, compact = false }) {
  const [prio, setPrio] = useState(null);
  const [carryCount, setCarryCount] = useState(0);

  useEffect(() => {
    let off = false;
    loadPrio(date).then((p) => { if (!off) setPrio(p); });
    loadPrio(addDays(date, -1)).then((p) => {
      if (!off) setCarryCount((p.items || []).filter((i) => !i.done && i.text.trim()).length);
    });
    return () => { off = true; };
  }, [date]);

  const write = (next) => { setPrio(next); savePrio(date, next); };
  const carry = async () => {
    const y = await loadPrio(addDays(date, -1));
    const pending = (y.items || []).filter((i) => !i.done && i.text.trim()).map((i) => newItem(i.text));
    if (!pending.length) return;
    write({ ...prio, items: [...(prio?.items || []), ...pending] });
    setCarryCount(0);
  };

  if (!prio) return null;
  const items = prio.items || [];
  const doneCount = items.filter((i) => i.done).length;

  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em]" style={{ color: C.inkSoft, fontFamily: "ui-monospace, monospace" }}>
          <Target size={12} /> Priorytety dnia
        </div>
        {items.length > 0 && <span className="text-xs font-mono" style={{ color: doneCount === items.length ? C.teal : C.inkSoft }}>{doneCount}/{items.length}</span>}
      </div>
      {items.length === 0 && (
        <div className="text-xs mb-2" style={{ color: C.inkSoft }}>
          Trzy rzeczy, które dzisiaj mają się wydarzyć. Nie więcej.
        </div>
      )}
      <CheckList items={items} onChange={(next) => write({ ...prio, items: next })} placeholder="np. zadzwonić w sprawie butów" max={compact ? 5 : 8} />
      {carryCount > 0 && (
        <button onClick={carry} className="mt-2 text-xs px-2 py-1" style={{ color: C.ink, background: C.paperDim, borderRadius: R.chip }}>
          przenieś {carryCount} niezrobione z wczoraj
        </button>
      )}
    </Card>
  );
}

// ---------- widok CELE ----------
function GoalsView({ date }) {
  const monday = getMonday(date);
  const [week, setWeek] = useState(null);
  const [long, setLong] = useState(null);

  useEffect(() => { let off = false; loadWeekGoals(monday).then((w) => { if (!off) setWeek(w); }); return () => { off = true; }; }, [monday]);
  useEffect(() => { let off = false; loadLongGoals().then((g) => { if (!off) setLong(g); }); return () => { off = true; }; }, []);

  const writeWeek = (next) => { setWeek(next); saveWeekGoals(monday, next); };
  const writeLong = (next) => { setLong(next); saveLongGoals(next); };

  const seed = () => writeLong({ items: SEED_LONG_GOALS.map((g, i) => ({ id: Date.now() + i, ...g })) });
  const daysTo = (due) => {
    if (!due) return null;
    return Math.round((parseDate(due) - parseDate(fmtDate(new Date()))) / 86400000);
  };

  const weekItems = week?.items || [];
  const weekDone = weekItems.filter((i) => i.done).length;

  return (
    <div>
      <div className="text-center mb-5">
        <div className="text-xs uppercase tracking-widest" style={{ color: C.amber, fontFamily: "ui-monospace, monospace" }}>Cele i priorytety</div>
        <div className="text-lg font-serif" style={{ color: C.paper }}>Co ma się wydarzyć</div>
      </div>

      <TodayPriorities date={date} />

      <SectionLabel icon={<ListChecks size={12} />}>Tydzień {shortLabel(monday)} — {shortLabel(addDays(monday, 6))}</SectionLabel>
      <Card>
        <div className="text-xs mb-1" style={{ color: C.inkSoft }}>Jedna rzecz, która zrobi ten tydzień</div>
        <input
          value={week?.focus || ""}
          onChange={(e) => writeWeek({ ...week, focus: e.target.value })}
          placeholder="np. cztery treningi i trzy noce po 7h snu"
          className="w-full bg-transparent outline-none text-base font-serif mb-3 pb-1"
          style={{ color: C.ink, borderBottom: `1px solid ${C.paperDim}` }}
        />
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] uppercase tracking-[0.18em]" style={{ color: C.inkSoft, fontFamily: "ui-monospace, monospace" }}>Zadania tygodnia</div>
          {weekItems.length > 0 && <span className="text-xs font-mono" style={{ color: weekDone === weekItems.length ? C.teal : C.inkSoft }}>{weekDone}/{weekItems.length}</span>}
        </div>
        <CheckList items={weekItems} onChange={(next) => writeWeek({ ...week, items: next })} placeholder="np. zrobić przegląd butów na długi bieg" />
      </Card>

      <SectionLabel icon={<Target size={12} />}>Cele długie</SectionLabel>
      {!long?.items?.length && (
        <Card>
          <div className="text-sm mb-2" style={{ color: C.ink }}>Brak celów długich.</div>
          <div className="text-xs mb-3" style={{ color: C.inkSoft }}>Mogę wstawić te, które wynikają z Twojego planu — wyścigi, waga, wspinanie. Potem edytujesz.</div>
          <button onClick={seed} className="px-3 py-1.5 text-xs" style={{ background: C.ink, color: C.paper, borderRadius: R.soft }}>Wstaw cele z planu</button>
        </Card>
      )}
      {(long?.items || []).map((g, gi) => {
        const d = daysTo(g.due);
        return (
          <Card key={g.id}>
            <div className="flex items-start gap-2">
              <input
                value={g.title}
                onChange={(e) => writeLong({ items: long.items.map((x, i) => (i === gi ? { ...x, title: e.target.value } : x)) })}
                className="flex-1 min-w-0 bg-transparent outline-none text-base font-serif"
                style={{ color: C.ink }}
              />
              <button onClick={() => writeLong({ items: long.items.filter((_, i) => i !== gi) })} style={{ color: C.rust }}><X size={15} /></button>
            </div>
            <div className="flex items-center gap-3 mt-2 text-xs">
              <input
                type="date" value={g.due || ""}
                onChange={(e) => writeLong({ items: long.items.map((x, i) => (i === gi ? { ...x, due: e.target.value } : x)) })}
                className="bg-transparent outline-none font-mono" style={{ color: C.inkSoft }}
              />
              {d != null && <Chip tone={d < 0 ? "mute" : d < 60 ? "amber" : "teal"}>{d < 0 ? "po terminie" : `za ${d} dni`}</Chip>}
            </div>
            <input
              value={g.note || ""}
              onChange={(e) => writeLong({ items: long.items.map((x, i) => (i === gi ? { ...x, note: e.target.value } : x)) })}
              placeholder="jak to mierzysz"
              className="w-full bg-transparent outline-none text-xs mt-2" style={{ color: C.inkSoft }}
            />
          </Card>
        );
      })}
      {!!long?.items?.length && (
        <button
          onClick={() => writeLong({ items: [...long.items, { id: Date.now(), title: "", due: "", note: "" }] })}
          className="flex items-center gap-1 text-xs px-1 mb-4" style={{ color: C.mute }}
        >
          <Plus size={13} /> dodaj cel
        </button>
      )}
    </div>
  );
}

function WeekView({ date, settings }) {
  const [days, setDays] = useState(null);
  const [review, setReview] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewErr, setReviewErr] = useState("");
  const monday = getMonday(date);

  // wczytaj zapisaną ocenę dla tego tygodnia
  useEffect(() => {
    let cancelled = false;
    setReview(""); setReviewErr("");
    (async () => {
      try {
        const r = await window.storage.get(`review:${monday}`, false);
        if (r && !cancelled) setReview(JSON.parse(r.value).text || "");
      } catch { /* brak oceny */ }
    })();
    return () => { cancelled = true; };
  }, [monday]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const dates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
      const prevDate = addDays(monday, -1);
      const [prevDay, ...rest] = await Promise.all([
        loadDay(prevDate),
        ...dates.map((d) => loadDay(d)),
      ]);
      const results = dates.map((d, i) => ({ date: d, data: rest[i] }));
      if (!cancelled) setDays(results.map((r, i) => ({ ...r, bedtime: i === 0 ? prevDay.sleepTime : results[i - 1].data.sleepTime })));
    })();
    return () => { cancelled = true; };
  }, [monday]);

  if (!days) return <div style={{ color: C.paper }} className="text-sm">Wczytywanie tygodnia…</div>;

  const weekNum = computeWeek(monday, settings?.startDate);
  const phase = PHASES[settings?.dietPhase || 1];

  const rows = days.map(({ date: d, data, bedtime }) => {
    const consumed = data.meals.reduce((s, m) => s + (Number(m.kcal) || 0), 0);
    const protein = data.meals.reduce((s, m) => s + (Number(m.protein) || 0), 0);
    const burned = Number(data.burned) || 0;
    const net = burned - consumed;
    const hrs = sleepHours(bedtime, data.wakeTime);
    const dKey = DAY_KEY_BY_DOW[parseDate(d).getDay()];
    const runKm = Number(data.run?.km) || 0;
    const runTime = Number(data.run?.timeMin) || 0;
    const runElev = Number(data.run?.elevation) || 0;
    return { date: d, consumed, protein, burned, net, hrs, exCount: data.exercises.filter((x) => x.name).length, isTrainDay: !!dKey, progDone: !!data.program?.done, weight: data.weight, runKm, runTime, runElev };
  });

  const totalConsumed = rows.reduce((s, r) => s + r.consumed, 0);
  const totalBurned = rows.reduce((s, r) => s + r.burned, 0);
  const totalNet = totalBurned - totalConsumed;
  const avgProtein = Math.round(rows.reduce((s, r) => s + r.protein, 0) / 7);
  const sleepVals = rows.map((r) => r.hrs).filter((h) => h != null);
  const avgSleep = sleepVals.length ? Math.round((sleepVals.reduce((a, b) => a + b, 0) / sleepVals.length) * 10) / 10 : null;
  const trainDays = rows.filter((r) => r.isTrainDay);
  const doneCount = trainDays.filter((r) => r.progDone).length;
  const weights = rows.map((r) => r.weight).filter((w) => w);
  const lastWeight = weights.length ? weights[weights.length - 1] : null;
  const totalKm = Math.round(rows.reduce((s, r) => s + r.runKm, 0) * 10) / 10;
  const totalElev = Math.round(rows.reduce((s, r) => s + r.runElev, 0));
  const totalRunTime = rows.reduce((s, r) => s + r.runTime, 0);
  const avgPaceWeek = formatPace(runPace(totalKm, totalRunTime));

  const chartData = rows.map((r) => ({ day: shortLabel(r.date), Spożyte: r.consumed, Spalone: r.burned }));

  const weekLifts = KEY_LIFTS.map((lift) => {
    const hit = days.find(({ date: d, data }) => DAY_KEY_BY_DOW[parseDate(d).getDay()] === lift.dayKey && data.program?.ex?.[lift.idx]?.kg);
    return { ...lift, kg: hit ? hit.data.program.ex[lift.idx].kg : null };
  });


  return (
    <div>
      <div className="text-center mb-5">
        <div className="text-xs uppercase tracking-widest" style={{ color: C.amber, fontFamily: "ui-monospace, monospace" }}>
          Podsumowanie tygodnia · {phase.name}{weekNum ? ` · Tydz. ${weekNum}` : ""}
        </div>
        <div className="text-lg font-serif capitalize" style={{ color: C.paper }}>
          {dayLabel(monday)} — {dayLabel(addDays(monday, 6))}
        </div>
      </div>

      <div className="p-4 mb-5" style={{ background: C.paper, borderRadius: R.card }}>
        <div className="text-xs uppercase tracking-widest mb-1" style={{ color: C.inkSoft }}>Licznik redukcji (7700 kcal ≈ 1 kg tłuszczu)</div>
        <div className="flex justify-between items-end mb-1">
          <span className="text-2xl font-serif" style={{ color: totalNet >= 0 ? C.teal : C.rust }}>
            {totalNet >= 0 ? "" : "+"}{totalNet} <span className="text-sm" style={{ color: C.inkSoft }}>/ 7700 kcal</span>
          </span>
          <span className="text-sm font-mono" style={{ color: C.inkSoft }}>≈ {(totalNet / 7700).toFixed(2)} kg</span>
        </div>
        <div className="h-2 w-full" style={{ background: C.paperDim, borderRadius: R.soft }}>
          <div className="h-2" style={{ width: `${Math.max(0, Math.min(100, (totalNet / 7700) * 100))}%`, background: totalNet >= 0 ? C.teal : C.rust, borderRadius: R.soft }} />
        </div>
      </div>

      <div className="p-5 mb-5" style={{ background: C.paper, borderRadius: R.card }}>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-serif" style={{ color: totalNet >= 0 ? C.teal : C.rust }}>
              {totalNet >= 0 ? "-" : "+"}{Math.abs(totalNet)}
            </div>
            <div className="text-xs" style={{ color: C.inkSoft }}>kcal bilans (cel {TARGET_DEFICIT * 7})</div>
          </div>
          <div>
            <div className="text-2xl font-serif" style={{ color: C.ink }}>{avgSleep != null ? avgSleep : "—"}</div>
            <div className="text-xs" style={{ color: C.inkSoft }}>śr. godz. snu</div>
          </div>
          <div>
            <div className="text-2xl font-serif" style={{ color: C.ink }}>{doneCount}/{trainDays.length}</div>
            <div className="text-xs" style={{ color: C.inkSoft }}>plan Silnik zaliczony</div>
          </div>
        </div>
        <div className="flex justify-center gap-6 mt-3 text-xs font-mono" style={{ color: C.inkSoft }}>
          <span>śr. białko: {avgProtein}g</span>
          {lastWeight && <span>ostatnia waga: {lastWeight} kg</span>}
        </div>
      </div>

      {totalKm > 0 && (
        <div className="p-4 mb-5" style={{ background: C.paper, borderRadius: R.card }}>
          <div className="text-xs uppercase tracking-widest mb-2" style={{ color: C.inkSoft }}>Bieganie — ten tydzień</div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-xl font-serif" style={{ color: C.ink }}>{totalKm}</div>
              <div className="text-xs" style={{ color: C.inkSoft }}>km</div>
            </div>
            <div>
              <div className="text-xl font-serif" style={{ color: C.ink }}>{avgPaceWeek || "—"}</div>
              <div className="text-xs" style={{ color: C.inkSoft }}>śr. tempo /km</div>
            </div>
            <div>
              <div className="text-xl font-serif" style={{ color: C.ink }}>{totalElev}</div>
              <div className="text-xs" style={{ color: C.inkSoft }}>m przewyższenia</div>
            </div>
          </div>
        </div>
      )}

      <div className="p-4 mb-5" style={{ background: C.paper, borderRadius: R.card }}>
        <div className="text-xs uppercase tracking-widest mb-2" style={{ color: C.inkSoft }}>Obciążenia — ten tydzień</div>
        <div className="space-y-1">
          {weekLifts.map((l) => (
            <div key={l.dayKey + l.idx} className="flex justify-between text-sm">
              <span style={{ color: C.ink }}>{l.label}</span>
              <span className="font-mono" style={{ color: l.kg ? C.teal : C.inkSoft }}>{l.kg ? `${l.kg} kg` : "—"}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 mb-5" style={{ background: C.paper, borderRadius: R.card, height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <CartesianGrid stroke={C.paperDim} vertical={false} />
            <XAxis dataKey="day" tick={{ fontSize: 11, fill: C.inkSoft }} axisLine={{ stroke: C.line }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: C.inkSoft }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 4 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Spożyte" fill={C.rust} radius={[2, 2, 0, 0]} />
            <Bar dataKey="Spalone" fill={C.teal} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.date} className="p-3" style={{ background: C.paper, borderRadius: R.soft }}>
            <div className="flex items-center justify-between mb-1">
              <span className="capitalize font-medium text-sm" style={{ color: C.ink }}>{shortLabel(r.date)}</span>
              <span className="text-xs" style={{ color: r.isTrainDay ? (r.progDone ? C.teal : C.rust) : C.inkSoft }}>
                {r.isTrainDay ? (r.progDone ? "✓ trening" : "— trening") : "odpoczynek"}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono" style={{ color: C.inkSoft }}>
              <span>{r.consumed}/{r.burned || "—"} kcal</span>
              <span style={{ color: r.net >= 0 ? C.teal : C.rust }}>
                {r.consumed || r.burned ? `${r.net >= 0 ? "-" : "+"}${Math.abs(r.net)}` : "—"}
              </span>
              <span>{r.hrs != null ? `${r.hrs}h snu` : "— snu"}</span>
              {r.runKm > 0 && <span>{r.runKm} km</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 mb-5" style={{ background: C.paper, borderRadius: R.card }}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-widest" style={{ color: C.inkSoft }}>Ocena trenera</div>
          <button
            onClick={async () => {
              setReviewBusy(true); setReviewErr("");
              try {
                const cur = buildWeekSummaryText(monday, days, rows, {
                  totalNet, avgSleep, avgProtein, doneCount, trainDays: trainDays.length,
                  lastWeight, totalKm, totalElev, avgPaceWeek, weekLifts, weekNum,
                });
                // poprzedni tydzień w pełnej formie, dwa wcześniejsze skrótowo
                const hist = [];
                for (let w = 1; w <= 3; w++) {
                  const m = addDays(monday, -7 * w);
                  const ds = await Promise.all(
                    Array.from({ length: 7 }, (_, i) => loadDay(addDays(m, i)))
                  );
                  const wrapped = ds.map((data, i) => ({ date: addDays(m, i), data }));
                  const km = ds.reduce((a, d) => a + (Number(d.run?.km) || 0), 0);
                  const elev = ds.reduce((a, d) => a + (Number(d.run?.elevation) || 0), 0);
                  const kcal = ds.reduce((a, d) => a + d.meals.reduce((x, m2) => x + (Number(m2.kcal) || 0), 0), 0);
                  const burn = ds.reduce((a, d) => a + (Number(d.burned) || 0), 0);
                  const wts = ds.map((d) => d.weight).filter(Boolean);
                  const done = ds.filter((d) => d.program?.done).length;
                  if (!(km || kcal || wts.length || done)) continue;
                  if (w === 1) {
                    hist.push(buildPrevWeekText(m, wrapped, {
                      totalKm: Math.round(km * 10) / 10,
                      totalElev: Math.round(elev),
                      doneCount: done,
                      trainDays: 4,
                      totalNet: burn - kcal,
                      lastWeight: wts[wts.length - 1] || null,
                    }));
                  } else {
                    hist.push(`Tydzień od ${m}: ${Math.round(km * 10) / 10} km, ${Math.round(elev)} m+, bilans ${burn - kcal} kcal, waga ${wts[wts.length - 1] || "—"} kg, treningi ${done}/4`);
                  }
                }
                const res = await fetchWeekReview(cur, hist.join("\n"), garminWeek.length ? garminWeek : null);
                setReview(res.text);
                await window.storage.set(`review:${monday}`, JSON.stringify({ text: res.text }), false);
              } catch (err) {
                setReviewErr("Błąd: " + (err?.message || String(err)).slice(0, 200));
              } finally { setReviewBusy(false); }
            }}
            disabled={reviewBusy}
            className="px-3 py-1.5 text-xs flex items-center gap-1"
            style={{ background: C.amber, color: C.ink, borderRadius: R.soft, opacity: reviewBusy ? 0.6 : 1 }}
          >
            {reviewBusy ? <Loader2 size={13} className="animate-spin" /> : null}
            {reviewBusy ? "Analizuję…" : review ? "Odśwież ocenę" : "Oceń tydzień"}
          </button>
        </div>
        {reviewErr && <div className="text-xs mb-2" style={{ color: C.rust }}>{reviewErr}</div>}
        {review ? (
          <div className="text-sm whitespace-pre-wrap" style={{ color: C.ink, lineHeight: 1.5 }}>{review}</div>
        ) : (
          <div className="text-xs" style={{ color: C.inkSoft }}>
            Kliknij, żeby dostać ocenę tygodnia i porównanie z poprzednimi trzema.
          </div>
        )}
      </div>

      <div className="mt-5">
        <ExportPanel
          label="📋 Eksportuj cały tydzień"
          buildText={() => {
            const header = `TYDZIEŃ ${weekNum || "?"} · ${phase.name} — ${dayLabel(monday)} … ${dayLabel(addDays(monday, 6))}\n` +
              `Bilans: ${totalNet >= 0 ? "-" : "+"}${Math.abs(totalNet)}kcal (cel ${TARGET_DEFICIT * 7}) | śr. sen ${avgSleep ?? "—"}h | śr. białko ${avgProtein}g | plan zaliczony ${doneCount}/${trainDays.length}${lastWeight ? ` | ostatnia waga ${lastWeight}kg` : ""}\n` +
              `Obciążenia w tygodniu: ${weekLifts.map((l) => `${l.label} ${l.kg ? l.kg + "kg" : "—"}`).join(", ")}\n`;
            const dayLines = days.map(({ date: d, data, bedtime }) => buildDayExportLine(d, data, settings, bedtime)).join("\n\n");
            return `${header}\n${dayLines}`;
          }}
        />
      </div>
    </div>
  );
}

// ---------- Month view ----------
// ---------- PLAN: os periodyzacji z datami ----------
function PlanView({ date, settings }) {
  const start = settings?.startDate;
  if (!start) {
    return (
      <div className="text-sm p-4" style={{ color: C.inkSoft, background: C.paper, borderRadius: R.card }}>
        Ustaw datę startu programu w zakładce DZIEŃ (pasek nad Programem Silnik). Bez niej nie ma od czego liczyć tygodni.
      </div>
    );
  }
  const mon0 = getMonday(start);
  const todayWeek = computeWeek(date, start);

  // os ciagnie sie poza 24 tydzień az do pierwszego wyscigu: to jest blok specyfiki,
  // rozpisywany szczegolowo 6-8 tygodni przed startem
  const firstRace = RACES.map((r) => r.date).sort()[0];
  let lastWeek = TOTAL_WEEKS;
  while (addDays(mon0, lastWeek * 7 - 1) < firstRace && lastWeek < 80) lastWeek += 1;

  const rows = [];
  for (let w = 1; w <= lastWeek; w++) {
    const from = addDays(mon0, (w - 1) * 7);
    const to = addDays(from, 6);
    const spec = w > TOTAL_WEEKS;
    const b = spec
      ? { name: "Specyfika wyścigowa", weekInBlock: w - TOTAL_WEEKS, rule: "" }
      : blockForWeek(w);
    const deload = w % 4 === 0;
    const racesHere = RACES.filter((r) => r.date >= from && r.date <= to);
    rows.push({ w, from, to, block: b, deload, spec, racesHere, current: w === todayWeek });
  }

  const short = (d) => parseDate(d).toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
  const raceRows = RACES.map((r) => ({ ...r, diff: Math.round((parseDate(r.date) - parseDate(date)) / 86400000) }));
  const planEnd = addDays(mon0, lastWeek * 7 - 1);

  const blockColor = (name) => (name.startsWith("Baza") ? C.teal : name.startsWith("Specyfika") ? C.line : C.rust);

  return (
    <div>
      <div className="text-center mb-5">
        <div className="text-xs uppercase tracking-widest" style={{ color: C.amber, fontFamily: "ui-monospace, monospace" }}>
          Oś periodyzacji
        </div>
        <div className="text-lg font-serif" style={{ color: C.paper }}>
          {short(mon0)} … {short(planEnd)}
        </div>
      </div>

      <div className="p-4 mb-5" style={{ background: C.paper, borderRadius: R.card }}>
        <div className="text-xs uppercase tracking-widest mb-2" style={{ color: C.inkSoft }}>Cele</div>
        <div className="space-y-1">
          {raceRows.map((r) => (
            <div key={r.date} className="flex justify-between text-sm" style={{ color: C.ink }}>
              <span>{r.label}</span>
              <span className="font-mono text-xs" style={{ color: r.diff < 0 ? C.inkSoft : C.rust }}>
                {short(r.date)} · {r.diff < 0 ? "za nami" : `za ${r.diff} dni`}
              </span>
            </div>
          ))}
        </div>
        <div className="text-xs mt-2 pt-2" style={{ color: C.inkSoft, borderTop: `1px solid ${C.paperDim}` }}>
          Bloki po pierwszym wyścigu rozpisujemy 6-8 tygodni przed każdym, nie teraz.
        </div>
      </div>

      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.w} className="p-2 flex items-center gap-3"
            style={{
              background: r.current ? C.paperDim : C.paper,
              borderRadius: R.soft,
              borderLeft: `3px solid ${r.deload ? C.amber : blockColor(r.block.name)}`,
            }}>
            <div className="font-mono text-xs w-7 shrink-0" style={{ color: r.current ? C.rust : C.inkSoft }}>
              {r.w}
            </div>
            <div className="font-mono text-xs w-24 shrink-0" style={{ color: C.inkSoft }}>
              {short(r.from)}–{short(r.to)}
            </div>
            <div className="text-xs flex-1" style={{ color: C.ink }}>
              {r.block.name}
              <span style={{ color: C.inkSoft }}>{r.spec ? ` · tydz. ${r.block.weekInBlock}` : ` · tydz. ${r.block.weekInBlock}/6`}</span>
              {r.deload && <span style={{ color: C.amber }}> · DELOAD</span>}
              {r.current && <span style={{ color: C.rust }}> · TU JESTEŚ</span>}
            </div>
            {r.racesHere.map((rc) => (
              <div key={rc.date} className="text-xs px-1 shrink-0" style={{ background: C.rust, color: C.paper, borderRadius: R.soft }}>
                {rc.label}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="p-3 mt-4 text-xs" style={{ background: C.paper, borderRadius: R.soft, color: C.inkSoft }}>
        <div className="mb-1" style={{ color: C.amber }}>Zasady osi</div>
        <div>Deload co 4. tydzień, objętość w dół o 40-50%. To część planu, nie lenistwo.</div>
        <div>Blok ME wymaga 4 tygodni bazy za sobą. Nie skracamy tego.</div>
        <div>Wyjazd lodowy (Słowacja, luty) mieści się w bloku ME, nie jest osobnym blokiem.</div>
        <div>Po tygodniu {TOTAL_WEEKS} wchodzi specyfika wyścigowa pod 100 km, rozpisywana osobno.</div>
      </div>
    </div>
  );
}

function MonthView({ monthStr, setMonthStr, settings }) {
  const [days, setDays] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setDays(null);
    (async () => {
      const dates = getMonthDates(monthStr);
      const prevDate = addDays(dates[0], -1);
      const [prevDay, ...rest] = await Promise.all([loadDay(prevDate), ...dates.map((d) => loadDay(d))]);
      const results = dates.map((d, i) => ({ date: d, data: rest[i] }));
      const withBedtime = results.map((r, i) => ({ ...r, bedtime: i === 0 ? prevDay.sleepTime : results[i - 1].data.sleepTime }));
      if (!cancelled) setDays(withBedtime);
    })();
    return () => { cancelled = true; };
  }, [monthStr]);

  if (!days) return <div style={{ color: C.paper }} className="text-sm">Wczytywanie miesiąca…</div>;

  const withProgram = days.map((d) => ({ ...d, dKey: DAY_KEY_BY_DOW[parseDate(d.date).getDay()] }));
  const trainDays = withProgram.filter((d) => d.dKey);
  const doneDays = trainDays.filter((d) => d.data.program?.done);
  const adherence = trainDays.length ? Math.round((doneDays.length / trainDays.length) * 100) : 0;

  const daysWithData = days.filter((d) => d.data.meals.length || Number(d.data.burned));
  const nets = daysWithData.map((d) => (Number(d.data.burned) || 0) - d.data.meals.reduce((s, m) => s + (Number(m.kcal) || 0), 0));
  const avgNet = nets.length ? Math.round(nets.reduce((a, b) => a + b, 0) / nets.length) : null;
  const totalNetMonth = nets.reduce((a, b) => a + b, 0);
  const predictedKg = Math.round((totalNetMonth / 7700) * 100) / 100;

  const sleepVals = days.map((d) => sleepHours(d.bedtime, d.data.wakeTime)).filter((h) => h != null);
  const avgSleep = sleepVals.length ? Math.round((sleepVals.reduce((a, b) => a + b, 0) / sleepVals.length) * 10) / 10 : null;

  const weightEntries = days.filter((d) => d.data.weight).map((d) => ({ date: d.date, w: Number(d.data.weight) }));
  const weightDelta = weightEntries.length >= 2 ? Math.round((weightEntries[weightEntries.length - 1].w - weightEntries[0].w) * 10) / 10 : null;

  const liftProgress = KEY_LIFTS.map((lift) => {
    const entries = withProgram
      .filter((d) => d.dKey === lift.dayKey && d.data.program?.ex?.[lift.idx]?.kg)
      .map((d) => Number(d.data.program.ex[lift.idx].kg));
    if (!entries.length) return { ...lift, first: null, last: null, delta: null };
    const first = entries[0], last = entries[entries.length - 1];
    return { ...lift, first, last, delta: Math.round((last - first) * 10) / 10 };
  });

  const weightChart = weightEntries.map((w) => ({ day: parseDate(w.date).getDate(), Waga: w.w }));

  const amrapEntries = days.filter((d) => d.data.amrap?.dips || d.data.amrap?.pushups)
    .map((d) => ({ date: d.date, dips: d.data.amrap?.dips || null, pushups: d.data.amrap?.pushups || null }));
  const amrapFirst = amrapEntries[0], amrapLast = amrapEntries[amrapEntries.length - 1];

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <button onClick={() => setMonthStr(addMonths(monthStr, -1))} style={{ color: C.paper }}><ChevronLeft size={22} /></button>
        <div className="text-center">
          <div className="text-xs uppercase tracking-widest" style={{ color: C.amber, fontFamily: "ui-monospace, monospace" }}>Podsumowanie miesiąca</div>
          <div className="text-lg font-serif capitalize" style={{ color: C.paper }}>{monthLabel(monthStr)}</div>
        </div>
        <button onClick={() => setMonthStr(addMonths(monthStr, 1))} style={{ color: C.paper }}><ChevronRight size={22} /></button>
      </div>

      <div className="p-5 mb-5" style={{ background: C.paper, borderRadius: R.card }}>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-serif" style={{ color: adherence >= 80 ? C.teal : adherence >= 50 ? C.amber : C.rust }}>{adherence}%</div>
            <div className="text-xs" style={{ color: C.inkSoft }}>egzekucja planu ({doneDays.length}/{trainDays.length})</div>
          </div>
          <div>
            <div className="text-2xl font-serif" style={{ color: avgNet != null && avgNet >= 0 ? C.teal : C.rust }}>{avgNet != null ? `${avgNet >= 0 ? "-" : "+"}${Math.abs(avgNet)}` : "—"}</div>
            <div className="text-xs" style={{ color: C.inkSoft }}>śr. bilans kcal</div>
          </div>
          <div>
            <div className="text-2xl font-serif" style={{ color: weightDelta != null && weightDelta <= 0 ? C.teal : C.rust }}>{weightDelta != null ? `${weightDelta > 0 ? "+" : ""}${weightDelta}` : "—"}</div>
            <div className="text-xs" style={{ color: C.inkSoft }}>zmiana wagi (kg)</div>
          </div>
        </div>
        <div className="text-center mt-3 text-xs font-mono" style={{ color: C.inkSoft }}>śr. sen: {avgSleep != null ? `${avgSleep} h` : "—"}</div>
      </div>

      <div className="p-4 mb-5" style={{ background: C.paper, borderRadius: R.card }}>
        <div className="text-xs uppercase tracking-widest mb-2" style={{ color: C.inkSoft }}>Licznik redukcji — przewidywane vs rzeczywiste (7700 kcal ≈ 1 kg)</div>
        <div className="flex justify-between text-sm">
          <span style={{ color: C.inkSoft }}>Bilans miesiąca: {totalNetMonth} kcal</span>
          <span className="font-mono" style={{ color: predictedKg >= 0 ? C.teal : C.rust }}>przewidywane: {predictedKg > 0 ? "-" : predictedKg < 0 ? "+" : ""}{Math.abs(predictedKg)} kg</span>
        </div>
        {weightDelta != null && (
          <div className="flex justify-between text-sm mt-1">
            <span style={{ color: C.inkSoft }}>Rzeczywista zmiana wagi</span>
            <span className="font-mono" style={{ color: weightDelta <= 0 ? C.teal : C.rust }}>{weightDelta > 0 ? "+" : ""}{weightDelta} kg</span>
          </div>
        )}
      </div>

      {weightChart.length >= 2 && (
        <div className="p-4 mb-5" style={{ background: C.paper, borderRadius: R.card, height: 200 }}>
          <div className="text-xs uppercase tracking-widest mb-2" style={{ color: C.inkSoft }}>Waga w miesiącu</div>
          <ResponsiveContainer width="100%" height="85%">
            <BarChart data={weightChart} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid stroke={C.paperDim} vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: C.inkSoft }} axisLine={{ stroke: C.line }} tickLine={false} />
              <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={{ fontSize: 10, fill: C.inkSoft }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 4 }} />
              <Bar dataKey="Waga" fill={C.teal} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="p-4 mb-5" style={{ background: C.paper, borderRadius: R.card }}>
        <div className="text-xs uppercase tracking-widest mb-2" style={{ color: C.inkSoft }}>Progres obciążeń — początek vs koniec miesiąca</div>
        <div className="space-y-2">
          {liftProgress.map((l) => (
            <div key={l.dayKey + l.idx} className="flex items-center justify-between text-sm">
              <span style={{ color: C.ink }}>{l.label}</span>
              {l.first != null ? (
                <span className="font-mono text-xs" style={{ color: C.inkSoft }}>
                  {l.first}kg → <span style={{ color: l.delta > 0 ? C.teal : l.delta < 0 ? C.rust : C.inkSoft, fontWeight: 600 }}>{l.last}kg</span>
                  {l.delta !== 0 && <span style={{ color: l.delta > 0 ? C.teal : C.rust }}> ({l.delta > 0 ? "+" : ""}{l.delta})</span>}
                </span>
              ) : <span className="text-xs" style={{ color: C.inkSoft }}>brak danych</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 mb-5" style={{ background: C.paper, borderRadius: R.card }}>
        <div className="text-xs uppercase tracking-widest mb-2" style={{ color: C.inkSoft }}>AMRAP — dipsy / pompki</div>
        {amrapEntries.length === 0 ? (
          <div className="text-xs" style={{ color: C.inkSoft }}>Brak testów w tym miesiącu.</div>
        ) : amrapEntries.length === 1 ? (
          <div className="text-sm" style={{ color: C.ink }}>
            {amrapFirst.date}: dipsy {amrapFirst.dips || "—"}, pompki {amrapFirst.pushups || "—"}
          </div>
        ) : (
          <div className="space-y-1 text-sm">
            <div style={{ color: C.ink }}>
              Dipsy: {amrapFirst.dips || "—"} → <span style={{ color: C.teal, fontWeight: 600 }}>{amrapLast.dips || "—"}</span>
            </div>
            <div style={{ color: C.ink }}>
              Pompki: {amrapFirst.pushups || "—"} → <span style={{ color: C.teal, fontWeight: 600 }}>{amrapLast.pushups || "—"}</span>
            </div>
          </div>
        )}
      </div>

      <ExportPanel
        label="📋 Eksportuj cały miesiąc"
        buildText={() => {
          const header = `MIESIĄC: ${monthLabel(monthStr)}\n` +
            `Egzekucja planu: ${adherence}% (${doneDays.length}/${trainDays.length}) | śr. bilans ${avgNet != null ? `${avgNet >= 0 ? "-" : "+"}${Math.abs(avgNet)}kcal` : "—"} | śr. sen ${avgSleep ?? "—"}h | zmiana wagi ${weightDelta != null ? `${weightDelta > 0 ? "+" : ""}${weightDelta}kg` : "—"}\n` +
            `Progres obciążeń: ${liftProgress.map((l) => `${l.label} ${l.first != null ? `${l.first}→${l.last}kg (${l.delta > 0 ? "+" : ""}${l.delta})` : "brak danych"}`).join(" | ")}\n`;
          const dayLines = days
            .filter((d) => d.data.meals.length || d.data.program?.done || d.data.weight || Number(d.data.burned))
            .map(({ date: d, data, bedtime }) => buildDayExportLine(d, data, settings, bedtime))
            .join("\n\n");
          return `${header}\n${dayLines || "(brak wpisów w tym miesiącu)"}`;
        }}
      />
    </div>
  );
}

// ---------- root ----------
export default function CalorieLogbook() {
  const [date, setDate] = useState(fmtDate(new Date()));
  const [monthStr, setMonthStr] = useState(fmtMonth(new Date()));
  const [view, setView] = useState("day");
  const [data, setData] = useState(emptyDay());
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => { loadSettings().then(setSettings); }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadDay(date).then((d) => { if (!cancelled) { setData(d); setLoading(false); } });
    return () => { cancelled = true; };
  }, [date]);

  const onSetStart = async (startDate) => {
    const next = { ...(settings || {}), startDate };
    setSettings(next);
    await saveSettings(next);
  };

  const onSetDietPhase = async (dietPhase) => {
    const next = { ...(settings || {}), dietPhase };
    setSettings(next);
    await saveSettings(next);
  };

  const NAV = [
    { id: "day", label: "Dzień", icon: CalendarDays },
    { id: "goals", label: "Cele", icon: Target },
    { id: "week", label: "Tydzień", icon: BarChart3 },
    { id: "month", label: "Miesiąc", icon: Calendar },
    { id: "plan", label: "Plan", icon: Map },
  ];
  const go = (id) => { setView(id); if (id === "week" || id === "month") setRefreshKey((k) => k + 1); };

  return (
    <div className="min-h-screen w-full flex justify-center" style={{ background: C.bg }}>
      <div className="w-full max-w-md px-4 pt-5" style={{ paddingBottom: "calc(84px + env(safe-area-inset-bottom))" }}>
        {view === "day" && !loading && (
          <DayView date={date} setDate={setDate} data={data} setData={setData} settings={settings} onSetStart={onSetStart} onSetDietPhase={onSetDietPhase}
            onSaved={() => setRefreshKey((k) => k + 1)} />
        )}
        {view === "day" && loading && <div style={{ color: C.mute }} className="text-sm text-center py-10">Wczytywanie…</div>}
        {view === "goals" && <GoalsView date={date} />}
        {view === "week" && <WeekView date={date} settings={settings} key={refreshKey} />}
        {view === "plan" && <PlanView date={date} settings={settings} />}
        {view === "month" && <MonthView monthStr={monthStr} setMonthStr={setMonthStr} settings={settings} key={"m" + refreshKey} />}

        <div className="text-center mt-8 text-[11px]" style={{ color: "#4A4F50", fontFamily: "ui-monospace, monospace" }}>
          Program Silnik · 24 tygodnie
        </div>
      </div>

      {/* dolna nawigacja — kciuk sięga, nic nie zasłania */}
      <nav
        className="fixed bottom-0 left-0 right-0 flex justify-center"
        style={{ background: "rgba(20,24,26,.94)", backdropFilter: "blur(10px)", borderTop: `1px solid ${C.hair}`, paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="w-full max-w-md flex">
          {NAV.map(({ id, label, icon: Icon }) => {
            const on = view === id;
            return (
              <button key={id} onClick={() => go(id)} className="flex-1 flex flex-col items-center gap-1 py-2.5"
                style={{ color: on ? C.amber : C.mute }}>
                <Icon size={19} strokeWidth={on ? 2.2 : 1.6} />
                <span className="text-[10px] tracking-wide" style={{ fontFamily: "ui-monospace, monospace" }}>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
