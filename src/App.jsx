import React, { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Camera, Moon, Sun, Flame, Dumbbell, ChevronLeft, ChevronRight, X, Loader2, Check, Pencil, Scale,
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
};

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
  { dayKey: "wed", idx: 0, label: "Wyciskanie sztangi" },
  { dayKey: "wed", idx: 1, label: "OHP" },
  { dayKey: "fri", idx: 0, label: "Podciąganie" },
  { dayKey: "fri", idx: 2, label: "Wiosłowanie" },
  { dayKey: "sat", idx: 0, label: "Step-down (ekscentryka)" },
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
const DAY_KEY_BY_DOW = { 3: "wed", 4: "thu", 5: "fri", 6: "sat", 0: "sun" };

function getPhaseForWeek(w) { return w <= 12 ? PHASES[1] : PHASES[2]; }

function buildProgram(week) {
  const p1 = week <= 12;
  const wk = p1 ? week : week - 12;
  return [
    {
      key: "wed", name: "Środa", focus: "Base run + Push", type: "gym",
      warmup: "5 min rower/wiosłowanie + rotacje barków, 1 seria rozgrzewkowa wyciskania",
      note: "Po trzech nockach — zamulenie normalne. Bieg Z1/Z2 spokojnie (40-60 min), potem push. Nic tu nie wymaga ostrości głowy, więc rób mimo zmęczenia. Po ostatniej nocce max 3-4h drzemki, potem normalna noc.",
      exercises: [
        { name: "Wyciskanie sztangi / hantli (garaż: pompki obciążone)", sets: 4, reps: p1 ? 8 : 5 },
        { name: "Wyciskanie nad głowę / OHP", sets: 3, reps: 10 },
        { name: "Incline dumbbell press / pompki incline", sets: 3, reps: 12 },
        { name: "Dips / pompki diamentowe", sets: 3, reps: "max", bw: true },
        { name: "Face pull / rear delt (guma) — balans do push", sets: 3, reps: 15 },
        { name: "Plank", sets: 3, reps: "45s", bw: true },
      ],
    },
    (week <= 4 ? {
      key: "thu", name: "Czwartek", focus: "Baza Z1/Z2 + wspinanie/chwyt", type: "run",
      warmup: "10 min marszobieg, spokojnie",
      note: `Tydzień ${week}/4 czystej bazy — bieg Z1/Z2, płasko, zero podejść/sprintów. ME startuje po tym oknie.`,
      exercises: [
        { name: "Wspinanie 1h — LUB sesja chwytu (dead hang, farmer walk, wiosłowanie)", sets: 1, reps: "60 min", bw: true },
        { name: "Dead bug", sets: 3, reps: 12, bw: true },
        { name: "Pallof press", sets: 3, reps: "12/stronę", bw: true },
      ],
    } : week <= 12 ? {
      key: "thu", name: "Czwartek", focus: "ME (przewyższenie) + wspinanie/chwyt", type: "run",
      warmup: "15 min bieg z narastającą intensywnością, ostatnie 2-3 min na Z3",
      note: "Jedyna sesja jakościowa tygodnia — masz za sobą jedną normalną noc snu, a do soboty jeszcze bufor. Schody/incline, lekki 'piekący' ból nóg, nie zadyszka. Start 2×8-10 min, buduj do ~40 min. Po sesji Hill Sprinty.",
      exercises: [
        { name: "Hill Sprinty (schody/incline, po ME)", sets: 6, reps: "10s", bw: true },
        { name: "Wspinanie 1h — LUB sesja chwytu (dead hang, farmer walk, wiosłowanie)", sets: 1, reps: "60 min", bw: true },
        { name: "Dead bug", sets: 3, reps: 12, bw: true },
        { name: "Pallof press", sets: 3, reps: "12/stronę", bw: true },
      ],
    } : {
      key: "thu", name: "Czwartek", focus: "Z3 + wspinanie/chwyt", type: "run",
      warmup: "15 min bieg z narastającą intensywnością",
      note: "ME zrobiło swoje — dłuższe, ostrzejsze podejścia (Z3). Hill Sprinty 1x/1-2 tyg.",
      exercises: [
        { name: "Wspinanie 1h — LUB sesja chwytu (dead hang, farmer walk, wiosłowanie)", sets: 1, reps: "60 min", bw: true },
        { name: "Dead bug", sets: 3, reps: 12, bw: true },
        { name: "Pallof press", sets: 3, reps: "12/stronę", bw: true },
      ],
    }),
    {
      key: "fri", name: "Piątek", focus: "Pull ciężko — plecy + chwyt", type: "gym",
      warmup: "5 min wiosłowanie/rower + band pull-aparts 2x15",
      note: "Główna sesja pod Twój priorytet (plecy, chwyt, podciąganie). Bieg tylko łatwy Z1 (30-40 min) albo wcale. ZERO pracy na nogi — jutro long i to on jest najważniejszy.",
      exercises: [
        { name: wk <= 2 ? "Negatywy podciągania" : "Podciąganie z gumą", sets: 4, reps: wk <= 2 ? "3-5" : "6-8" },
        { name: "Lat pulldown / wiosłowanie gumą (garaż)", sets: 4, reps: 10 },
        { name: "Wiosłowanie sztangą / hantlą", sets: 4, reps: 10 },
        { name: "Dead hang (otwarta dłoń — chwyt pod wspinanie)", sets: 3, reps: "max czas" },
        { name: "Farmer walk", sets: 3, reps: "40m" },
        { name: "Uginanie ramion (biceps)", sets: 3, reps: 12 },
      ],
    },
    {
      key: "sat", name: "Sobota", focus: "Long Run + prehab nóg", type: "long",
      warmup: "10 min marszobieg + dynamiczne rozciąganie nóg",
      note: "Najważniejsza sesja tygodnia — 4. dzień od ostatniej nocki, najlepiej wypoczęty. Long run 16-24 km, HR cap 135, płasko, tempo bez znaczenia. Ćwicz fueling jak na wyścigu. Prehab PO biegu, lekko.",
      exercises: [
        { name: "Ekscentryczny step-down (3s w dół) — pod zbiegi", sets: 3, reps: "10/noga" },
        { name: "Stabilizacja prawej kostki (balans + guma)", sets: 3, reps: "30s / 15", bw: true },
        { name: "Glute bridge (prawy pośladek)", sets: 3, reps: 15, bw: true },
        { name: "Hollow body hold", sets: 3, reps: "30s", bw: true },
      ],
    },
    {
      key: "sun", name: "Niedziela", focus: "Base run + core (przed nockami)", type: "run",
      warmup: "5-10 min marszu przed truchtem",
      note: "Back-to-back z sobotą — ta sama adaptacja co pod Jurassic Coast. ALE: o 18:00 wchodzisz w trzy nocki. Ma być łatwo (HR cap 120, 8-12 km), nie druga sesja jakościowa. Lepiej skończyć niedosyconym niż wejść w pracę wyczerpanym.",
      exercises: [
        { name: "Side plank", sets: 3, reps: "30s/stronę", bw: true },
        { name: "Leg raises", sets: 3, reps: 15, bw: true },
        { name: "Bird dog", sets: 3, reps: "10/stronę", bw: true },
      ],
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
    `  sen (noc): ${hrs != null ? hrs + "h" : "—"} (spać ${prevBedtime || "?"} → wstał ${data.wakeTime || "?"}) | poszedł spać dziś: ${data.sleepTime || "—"} | waga: ${data.weight || "—"}kg`,
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

async function analyzeMealPhoto(base64, mediaType) {
  const resp = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "photo", base64, mediaType }),
  });
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json();
}

async function analyzeMealText(description) {
  const resp = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "text", description }),
  });
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json();
}

// ---------- storage ----------
const emptyDay = () => ({
  meals: [], burned: "", sleepTime: "", wakeTime: "", weight: "",
  exercises: [], program: { done: false, ex: {}, comment: "" },
  run: { km: "", timeMin: "", elevation: "" },
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

// ---------- small UI atoms ----------
function StampButton({ children, onClick, active }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 text-sm tracking-wide transition-all"
      style={{
        fontFamily: "ui-monospace, monospace",
        border: `1px solid ${active ? C.ink : C.line}`,
        background: active ? C.ink : "transparent",
        color: active ? C.paper : C.inkSoft,
        borderRadius: 2,
      }}
    >
      {children}
    </button>
  );
}
function LogDivider() { return <div style={{ height: 1, background: C.line, margin: "18px 0" }} />; }

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
      <button onClick={handleOpen} className="w-full px-3 py-2 text-xs mb-5" style={{ border: `1px solid ${C.line}`, color: C.paper, borderRadius: 2 }}>
        {label}
      </button>
    );
  }
  return (
    <div className="p-3 mb-5" style={{ background: C.paper, borderRadius: 2 }}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs" style={{ color: C.inkSoft }}>Zaznacz i skopiuj, albo kliknij "Kopiuj"</div>
        <div className="flex gap-2">
          <button onClick={handleCopy} className="px-2 py-1 text-xs" style={{ background: copied ? C.teal : C.amber, color: copied ? C.paper : C.ink, borderRadius: 2 }}>
            {copied ? "Skopiowano" : "Kopiuj"}
          </button>
          <button onClick={() => setOpen(false)} style={{ color: C.rust }}><X size={14} /></button>
        </div>
      </div>
      <textarea
        readOnly value={text} rows={10} onFocus={(e) => e.target.select()}
        className="w-full text-xs font-mono p-2 outline-none"
        style={{ background: C.bg, color: C.paper, borderRadius: 2, border: `1px solid ${C.line}`, resize: "vertical" }}
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
      <div className="h-1.5 w-full" style={{ background: C.paperDim, borderRadius: 2 }}>
        <div className="h-1.5" style={{ width: `${pct}%`, background: color, borderRadius: 2 }} />
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
          <button onClick={() => onSetDietPhase(1)} className="flex-1 py-1 text-xs" style={{ background: (settings?.dietPhase || 1) === 1 ? C.amber : C.bgSoft, color: (settings?.dietPhase || 1) === 1 ? C.ink : C.paper, borderRadius: 2 }}>
            Redukcja
          </button>
          <button onClick={() => onSetDietPhase(2)} className="flex-1 py-1 text-xs" style={{ background: settings?.dietPhase === 2 ? C.amber : C.bgSoft, color: settings?.dietPhase === 2 ? C.ink : C.paper, borderRadius: 2 }}>
            Budowa
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="p-3 mb-4" style={{ background: C.paper, borderRadius: 2 }}>
      <div className="text-xs mb-2" style={{ color: C.inkSoft }}>Data startu programu Silnik (Tydzień 1 = ta środa)</div>
      <div className="flex gap-2">
        <input type="date" value={val} onChange={(e) => setVal(e.target.value)} className="flex-1 text-sm" style={{ color: C.ink }} />
        <button
          onClick={() => { if (val) { onSetStart(val); setEditing(false); } }}
          className="px-3 py-1.5 text-xs" style={{ background: C.amber, color: C.ink, borderRadius: 2 }}
        >
          Zapisz
        </button>
      </div>
    </div>
  );
}

// ---------- Program dnia (Silnik) ----------
function ProgramCard({ dayPlan, program, updateEx, toggleDone, prevSession, onComment }) {
  if (!dayPlan) {
    return (
      <div className="text-sm p-3 mb-5" style={{ color: C.inkSoft, background: C.bgSoft, borderRadius: 2, border: `1px dashed ${C.line}` }}>
        Brak planu Silnik na dziś (dzień poza cyklem trening.).
      </div>
    );
  }
  const exStates = program?.ex || {};
  const commentVal = program?.comment || "";

  return (
    <div className="p-4 mb-5" style={{ background: C.paper, borderRadius: 3 }}>
      <div className="flex items-center justify-between mb-1">
        <div>
          <div className="text-sm font-semibold" style={{ color: C.ink }}>{dayPlan.name} — {dayPlan.focus}</div>
        </div>
        <button
          onClick={toggleDone}
          className="flex items-center gap-1 px-2 py-1 text-xs"
          style={{ background: program?.done ? C.teal : C.paperDim, color: program?.done ? C.paper : C.inkSoft, borderRadius: 2 }}
        >
          <Check size={12} />{program?.done ? "zrobione" : "oznacz"}
        </button>
      </div>
      {dayPlan.warmup && (
        <div className="text-xs mb-2 p-2" style={{ background: C.bg, color: C.paper, borderRadius: 2 }}>
          <span style={{ color: C.amber }}>Rozgrzewka: </span>{dayPlan.warmup}
        </div>
      )}
      {dayPlan.note && (
        <div className="text-xs mb-2 p-2" style={{ background: C.paperDim, color: C.inkSoft, borderRadius: 2 }}>{dayPlan.note}</div>
      )}

      {prevSession && (
        <div className="text-xs mb-3 p-2" style={{ background: C.bg, color: C.paper, borderRadius: 2 }}>
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

      <div className="space-y-3 mt-2">
        {dayPlan.exercises.map((ex, idx) => {
          const st = exStates[idx] || { done: false, sets: "", reps: "", kg: "" };
          return (
            <div key={idx} className="pb-2" style={{ borderBottom: `1px solid ${C.paperDim}` }}>
              <div className="flex items-start gap-2 text-sm mb-1.5">
                <button onClick={() => updateEx(idx, "done", !st.done)} className="mt-0.5 shrink-0" style={{ color: st.done ? C.teal : C.inkSoft }}>
                  <Check size={16} />
                </button>
                <div className="flex-1 leading-snug" style={{ color: C.ink, textDecoration: st.done ? "line-through" : "none" }}>{ex.name}</div>
              </div>
              <div className="flex items-center gap-3 pl-6 text-xs">
                <span className="font-mono shrink-0" style={{ color: C.inkSoft }}>cel {ex.sets}×{ex.reps}</span>
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
          style={{ background: C.bg, color: C.paper, borderRadius: 2, border: `1px solid ${C.line}`, resize: "vertical" }}
        />
      </div>
    </div>
  );
}

// ---------- Day view ----------
function DayView({ date, setDate, data, setData, settings, onSetStart, onSetDietPhase, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [textDesc, setTextDesc] = useState("");
  const [textBusy, setTextBusy] = useState(false);
  const [textError, setTextError] = useState("");

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

  const [prevSession, setPrevSession] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (!dayPlan) { setPrevSession(null); return; }
    (async () => {
      for (let w = 1; w <= 8; w++) {
        const candidate = addDays(date, -7 * w);
        const cd = await loadDay(candidate);
        const hasEx = cd.program?.ex && Object.keys(cd.program.ex).length > 0;
        const hasComment = !!cd.program?.comment;
        if (hasEx || hasComment) {
          if (!cancelled) setPrevSession({ date: candidate, ex: cd.program.ex || {}, comment: cd.program.comment || "", done: !!cd.program.done });
          return;
        }
      }
      if (!cancelled) setPrevSession(null);
    })();
    return () => { cancelled = true; };
  }, [date, dayKey, weekNum]);

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

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setDate(addDays(date, -1))} style={{ color: C.paper }}><ChevronLeft size={22} /></button>
        <div className="text-center">
          <div className="text-xs uppercase tracking-widest" style={{ color: C.amber, fontFamily: "ui-monospace, monospace" }}>Wpis dziennika</div>
          <div className="text-lg font-serif capitalize" style={{ color: C.paper }}>{dayLabel(date)}</div>
        </div>
        <button onClick={() => setDate(addDays(date, 1))} style={{ color: C.paper }}><ChevronRight size={22} /></button>
      </div>

      <ProgramSettingsRow settings={settings} onSetStart={onSetStart} onSetDietPhase={onSetDietPhase} weekNum={weekNum} phase={phase} />

      {race && race.diff <= 10 && (
        <div className="p-3 mb-4 text-xs" style={{ background: race.diff === 0 ? C.teal : C.amber, color: C.ink, borderRadius: 2 }}>
          {race.diff === 0 ? `Dziś: ${race.label}. Powodzenia.` : `Taper: ${race.label} za ${race.diff} ${race.diff === 1 ? "dzień" : "dni"} — zmniejsz objętość siłowni, chroń nogi.`}
        </div>
      )}

      {isDeload && (
        <div className="p-3 mb-4 text-xs" style={{ background: C.bg, color: C.paper, borderRadius: 2, border: `1px solid ${C.line}` }}>
          Tydzień {weekNum} — <span style={{ color: C.amber }}>deload</span>. Zejdź z objętości ~40-50% (krótsze biegi, lżej na garażu/piątku). To część planu, nie lenistwo.
        </div>
      )}

      {/* hero: deficit gauge */}
      <div className="p-5 mb-5" style={{ background: C.paper, borderRadius: 3 }}>
        <div className="flex items-end justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest" style={{ color: C.inkSoft }}>Bilans netto (cel: {TARGET_DEFICIT} kcal deficytu)</div>
            <div className="text-4xl font-serif" style={{ color: net >= 0 ? C.teal : C.rust }}>
              {net >= 0 ? "-" : "+"}{Math.abs(net)} <span className="text-base" style={{ color: C.inkSoft }}>kcal</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <button onClick={handleManualSave} className="flex items-center gap-1 px-3 py-1.5 text-xs"
              style={{ background: dirty || saveError ? C.amber : C.paperDim, color: C.ink, borderRadius: 2, border: saveError ? `1px solid ${C.rust}` : "none" }}>
              <Check size={13} />Zapisz dzień
            </button>
            {savedFlash && <div className="flex items-center gap-1 text-xs" style={{ color: C.teal }}><Check size={14} />zapisano</div>}
            {saveError && <div className="text-xs" style={{ color: C.rust }}>błąd zapisu — spróbuj ponownie</div>}
          </div>
        </div>
        <div className="mt-3 h-2 w-full" style={{ background: C.paperDim, borderRadius: 2 }}>
          <div className="h-2" style={{ width: `${pct}%`, background: net >= 0 ? C.teal : C.rust, borderRadius: 2, transition: "width .3s" }} />
        </div>
        <div className="flex justify-between text-xs mt-2 font-mono" style={{ color: C.inkSoft }}>
          <span>spożyte: {consumed} kcal</span>
          <span>spalone: {burned || "—"} kcal</span>
        </div>
      </div>

      {/* macro adherence, jeśli program aktywny */}
      {phase && (
        <div className="p-4 mb-5 space-y-2" style={{ background: C.paper, borderRadius: 3 }}>
          <div className="text-xs uppercase tracking-widest mb-1" style={{ color: C.inkSoft }}>Cel dnia — {phase.name}</div>
          <MacroBar label="Kcal" value={consumed} target={phase.kcal} color={C.amber} />
          <MacroBar label="Białko (g)" value={cProtein} target={phase.protein} color={C.teal} />
          <MacroBar label="Tłuszcz (g)" value={cFat} target={phase.fat} color={C.rust} />
          <MacroBar label="Węgle (g)" value={cCarbs} target={phase.carbs} color={C.inkSoft} />
        </div>
      )}

      <div className="p-4 mb-5" style={{ background: C.paper, borderRadius: 3 }}>
        <div className="text-xs uppercase tracking-widest mb-2" style={{ color: C.inkSoft }}>Co i kiedy</div>
        <div className="text-xs space-y-1" style={{ color: C.ink }}>
          <div><span style={{ color: C.amber }}>Rano/dzień:</span> słono/białkowo, bez węglowodanów.</div>
          <div><span style={{ color: C.amber }}>Wieczorem:</span> jedyna pora na węglowodany.</div>
          <div><span style={{ color: C.amber }}>Białko:</span> ~4×35-40g co 3-4h, nie 1-2 duże porcje.</div>
          <div><span style={{ color: C.amber }}>Dni jakościowe (czw. ME/Sprinty, sob. long):</span> trochę węgli 60-90 min przed.</div>
        </div>
      </div>

      <div className="p-4 mb-5" style={{ background: C.paper, borderRadius: 3 }}>
        <div className="text-xs uppercase tracking-widest mb-2" style={{ color: C.inkSoft }}>Suplementacja</div>
        <div className="text-xs space-y-1" style={{ color: C.ink }}>
          <div><span style={{ color: C.amber }}>Rano, na czczo:</span> UC-II (stawy)</div>
          <div><span style={{ color: C.amber }}>Ze śniadaniem:</span> wit. D, omega-3, kreatyna</div>
          <div><span style={{ color: C.amber }}>W dzień:</span> multiwitamina (osobno od żelaza/cynku, min. 2h)</div>
          <div><span style={{ color: C.amber }}>Wieczorem:</span> cynk + magnez (osobno od żelaza)</div>
        </div>
      </div>

      {/* meals */}
      <div className="mb-2 flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs uppercase tracking-widest" style={{ color: C.amber, fontFamily: "ui-monospace, monospace" }}>Posiłki</div>
        <button onClick={addManualMeal} className="px-3 py-1.5 text-xs" style={{ border: `1px solid ${C.line}`, color: C.paper, borderRadius: 2 }}>+ dodaj ręcznie</button>
      </div>

      <div className="p-3 mb-2 flex items-center gap-2" style={{ background: C.paper, borderRadius: 2, opacity: busy ? 0.7 : 1 }}>
        <Camera size={16} style={{ color: C.inkSoft, flexShrink: 0 }} />
        <input type="file" accept="image/*" onChange={handlePhoto} disabled={busy} className="flex-1 text-xs" style={{ color: C.ink }} />
        {busy && <Loader2 size={16} className="animate-spin" style={{ color: C.inkSoft, flexShrink: 0 }} />}
      </div>
      {busy && <div className="text-xs mb-2 px-1" style={{ color: C.inkSoft }}>Rozpoznaję zdjęcie…</div>}
      {photoError && <div className="text-xs mb-3 px-1" style={{ color: C.rust }}>{photoError}</div>}

      <div className="p-3 mb-2 flex items-center gap-2" style={{ background: C.paper, borderRadius: 2, opacity: textBusy ? 0.7 : 1 }}>
        <input
          type="text" placeholder="albo opisz posiłek, np. kurczak z ryżem, ok. 400g" value={textDesc}
          onChange={(e) => setTextDesc(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleTextMeal(); }}
          disabled={textBusy}
          className="flex-1 text-sm bg-transparent outline-none" style={{ color: C.ink }}
        />
        <button onClick={handleTextMeal} disabled={textBusy || !textDesc.trim()}
          className="px-3 py-1.5 text-xs flex items-center gap-1" style={{ background: C.amber, color: C.ink, borderRadius: 2, opacity: textDesc.trim() ? 1 : 0.5 }}>
          {textBusy ? <Loader2 size={14} className="animate-spin" /> : "Oblicz"}
        </button>
      </div>
      {textError && <div className="text-xs mb-3 px-1" style={{ color: C.rust }}>{textError}</div>}

      <div className="space-y-2 mb-5">
        {data.meals.length === 0 && (
          <div className="text-sm p-3" style={{ color: C.inkSoft, background: C.bgSoft, borderRadius: 2, border: `1px dashed ${C.line}` }}>
            Brak posiłków. Wybierz zdjęcie, a AI oszacuje kaloryczność i makro.
          </div>
        )}
        {data.meals.map((m) => (
          <div key={m.id} className="p-3" style={{ background: C.paper, borderRadius: 2 }}>
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <input value={m.name} onChange={(e) => updateMeal(m.id, "name", e.target.value)}
                  className="w-full bg-transparent outline-none text-sm font-medium" style={{ color: C.ink }} />
                {m.details && <div className="text-xs mt-0.5 leading-snug" style={{ color: C.inkSoft }}>{m.details}</div>}
              </div>
              <button onClick={() => removeMeal(m.id)} className="shrink-0 p-1" style={{ color: C.rust }}><X size={16} /></button>
            </div>
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-2 text-xs font-mono" style={{ color: C.inkSoft }}>
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

      <LogDivider />

      {/* watch / sleep / weight */}
      <div className="p-3 mb-3" style={{ background: C.paper, borderRadius: 2 }}>
        <div className="text-xs flex items-center gap-1 mb-1" style={{ color: C.inkSoft }}><Flame size={12} /> Spalone (zegarek)</div>
        <input type="number" placeholder="kcal" value={data.burned} onChange={(e) => persist({ ...data, burned: e.target.value })}
          className="w-full bg-transparent outline-none text-lg font-mono" style={{ color: C.ink }} />
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="p-3" style={{ background: C.paper, borderRadius: 2 }}>
          <div className="text-xs flex items-center gap-1 mb-1" style={{ color: C.inkSoft }}><Moon size={12} /> Wstałem (dziś rano)</div>
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
          <div className="text-xs mt-1" style={{ color: hrs != null ? C.teal : C.inkSoft }}>
            {hrs != null ? `sen: ${hrs} h` : "uzupełnij obie godziny, żeby policzyć sen"}
          </div>
        </div>
        <div className="p-3" style={{ background: C.paper, borderRadius: 2 }}>
          <div className="text-xs flex items-center gap-1 mb-1" style={{ color: C.inkSoft }}><Sun size={12} /> Poszedłem spać (dziś wieczorem)</div>
          <input type="time" value={data.sleepTime} onChange={(e) => persist({ ...data, sleepTime: e.target.value })}
            className="w-full bg-transparent outline-none text-lg font-mono" style={{ color: C.ink }} />
          <div className="text-xs mt-1" style={{ color: C.inkSoft }}>policzy się jutro rano</div>
        </div>
      </div>
      <div className="p-3 mb-5" style={{ background: C.paper, borderRadius: 2 }}>
        <div className="text-xs flex items-center gap-1 mb-1" style={{ color: C.inkSoft }}><Scale size={12} /> Waga (kg)</div>
        <input type="number" step="0.1" placeholder="np. 96.4" value={data.weight} onChange={(e) => persist({ ...data, weight: e.target.value })}
          className="w-full bg-transparent outline-none text-lg font-mono" style={{ color: C.ink }} />
      </div>

      <div className="p-3 mb-5" style={{ background: C.paper, borderRadius: 2 }}>
        <div className="text-xs uppercase tracking-widest mb-2" style={{ color: C.inkSoft }}>Bieg dziś</div>
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
          const p = runPace(data.run?.km, data.run?.timeMin);
          const f = formatPace(p);
          return f ? <div className="text-xs mt-2 font-mono" style={{ color: C.teal }}>śr. tempo: {f} /km</div> : null;
        })()}
        <div className="text-xs mt-2 pt-2" style={{ color: C.inkSoft, borderTop: `1px solid ${C.paperDim}` }}>
          <span style={{ color: C.amber }}>Kiedy biegać: </span>
          niedziela — na czczo ok. Czwartek/sobota (jakościowe) — węgle 60-90 min przed.
        </div>
      </div>

      {/* program Silnik */}
      <div className="mb-2 flex items-center gap-1">
        <div className="text-xs uppercase tracking-widest" style={{ color: C.amber, fontFamily: "ui-monospace, monospace" }}>Program Silnik</div>
      </div>

      <div className="p-3 mb-3" style={{ background: C.bg, borderRadius: 2 }}>
        <div className="text-xs mb-1" style={{ color: C.amber }}>Zasady — obecny blok bazy</div>
        <div className="text-xs space-y-1" style={{ color: C.paper }}>
          <div>• Tydz. 1-4 baza, 5-12 ME, 13+ Z3/Z4 — automatycznie wg tygodnia</div>
          <div>• Hill Sprinty: 6-8×10s, więcej powt. zamiast dłuższych</div>
          <div>• Łatwe biegi niżej niż myślisz — chroń regenerację</div>
          <div>• Bieganie ↔ pływanie — możesz zamieniać, przyda się pod DWS</div>
          <div>• Co 4. tydzień = deload (~40-50% objętości), apka pokaże banner</div>
          <div>• Nocki nd 18:00 → śr 06:00. Pon/wt to praca, nie regeneracja</div>
          <div>• Śr i nd zawsze łatwo — jakość tylko czwartek, sobota chroniona</div>
        </div>
      </div>

      <ProgramCard dayPlan={dayPlan} program={data.program} updateEx={updateProgEx} toggleDone={toggleProgDone} prevSession={prevSession} onComment={updateProgComment} />

      {/* dodatkowe ćwiczenia */}
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs uppercase tracking-widest flex items-center gap-1" style={{ color: C.amber, fontFamily: "ui-monospace, monospace" }}>
          <Dumbbell size={12} /> Dodatkowe ćwiczenia
        </div>
        <button onClick={addExercise} className="px-3 py-1.5 text-xs" style={{ border: `1px solid ${C.line}`, color: C.paper, borderRadius: 2 }}>+ dodaj</button>
      </div>
      <div className="space-y-2">
        {data.exercises.length === 0 && (
          <div className="text-sm p-3" style={{ color: C.inkSoft, background: C.bgSoft, borderRadius: 2, border: `1px dashed ${C.line}` }}>Brak dodatkowych wpisów.</div>
        )}
        {data.exercises.map((x) => (
          <div key={x.id} className="p-3 flex items-center gap-2" style={{ background: C.paper, borderRadius: 2 }}>
            <input placeholder="np. spacer z psem" value={x.name} onChange={(e) => updateExercise(x.id, "name", e.target.value)}
              className="flex-1 bg-transparent outline-none text-sm font-medium" style={{ color: C.ink }} />
            <input placeholder="notatka" value={x.note} onChange={(e) => updateExercise(x.id, "note", e.target.value)}
              className="flex-1 bg-transparent outline-none text-xs" style={{ color: C.inkSoft }} />
            <button onClick={() => removeExercise(x.id)} style={{ color: C.rust }}><X size={14} /></button>
          </div>
        ))}
      </div>

      <LogDivider />
      <ExportPanel label="📋 Eksportuj ten dzień" buildText={() => buildDayExportLine(date, data, settings, prevBedtime)} />
    </div>
  );
}
function WeekView({ date, settings }) {
  const [days, setDays] = useState(null);
  const monday = getMonday(date);

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

      <div className="p-4 mb-5" style={{ background: C.paper, borderRadius: 3 }}>
        <div className="text-xs uppercase tracking-widest mb-1" style={{ color: C.inkSoft }}>Licznik redukcji (7700 kcal ≈ 1 kg tłuszczu)</div>
        <div className="flex justify-between items-end mb-1">
          <span className="text-2xl font-serif" style={{ color: totalNet >= 0 ? C.teal : C.rust }}>
            {totalNet >= 0 ? "" : "+"}{totalNet} <span className="text-sm" style={{ color: C.inkSoft }}>/ 7700 kcal</span>
          </span>
          <span className="text-sm font-mono" style={{ color: C.inkSoft }}>≈ {(totalNet / 7700).toFixed(2)} kg</span>
        </div>
        <div className="h-2 w-full" style={{ background: C.paperDim, borderRadius: 2 }}>
          <div className="h-2" style={{ width: `${Math.max(0, Math.min(100, (totalNet / 7700) * 100))}%`, background: totalNet >= 0 ? C.teal : C.rust, borderRadius: 2 }} />
        </div>
      </div>

      <div className="p-5 mb-5" style={{ background: C.paper, borderRadius: 3 }}>
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
        <div className="p-4 mb-5" style={{ background: C.paper, borderRadius: 3 }}>
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

      <div className="p-4 mb-5" style={{ background: C.paper, borderRadius: 3 }}>
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

      <div className="p-4 mb-5" style={{ background: C.paper, borderRadius: 3, height: 260 }}>
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
          <div key={r.date} className="p-3" style={{ background: C.paper, borderRadius: 2 }}>
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

      <div className="p-5 mb-5" style={{ background: C.paper, borderRadius: 3 }}>
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

      <div className="p-4 mb-5" style={{ background: C.paper, borderRadius: 3 }}>
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
        <div className="p-4 mb-5" style={{ background: C.paper, borderRadius: 3, height: 200 }}>
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

      <div className="p-4 mb-5" style={{ background: C.paper, borderRadius: 3 }}>
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

  return (
    <div className="min-h-screen w-full flex justify-center" style={{ background: C.bg }}>
      <div className="w-full max-w-md px-4 py-8">
        <div className="flex justify-center gap-2 mb-6">
          <StampButton active={view === "day"} onClick={() => setView("day")}>DZIEŃ</StampButton>
          <StampButton active={view === "week"} onClick={() => { setView("week"); setRefreshKey((k) => k + 1); }}>TYDZIEŃ</StampButton>
          <StampButton active={view === "month"} onClick={() => { setView("month"); setRefreshKey((k) => k + 1); }}>MIESIĄC</StampButton>
        </div>

        {view === "day" && !loading && (
          <DayView date={date} setDate={setDate} data={data} setData={setData} settings={settings} onSetStart={onSetStart} onSetDietPhase={onSetDietPhase}
            onSaved={() => setRefreshKey((k) => k + 1)} />
        )}
        {view === "day" && loading && <div style={{ color: C.paper }} className="text-sm text-center">Wczytywanie…</div>}
        {view === "week" && <WeekView date={date} settings={settings} key={refreshKey} />}
        {view === "month" && <MonthView monthStr={monthStr} setMonthStr={setMonthStr} settings={settings} key={"m" + refreshKey} />}

        <div className="text-center mt-8 text-xs" style={{ color: C.inkSoft, fontFamily: "ui-monospace, monospace" }}>
          Faza 1 · cel 500 kcal deficytu / dzień · Program Silnik 24 tyg.
        </div>
      </div>
    </div>
  );
}
