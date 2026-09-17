// Funkcja serwerowa Vercel. Trzyma klucz API po stronie serwera —
// przeglądarka nigdy go nie widzi. Wywoływana z App.jsx pod /api/analyze.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Ten sam token co /api/garmin — bez niego każdy, kto zna URL, pali Twoje kredyty
  const appToken = process.env.APP_TOKEN;
  if (appToken && req.headers["x-app-token"] !== appToken) {
    return res.status(401).json({ error: "Brak lub zły token aplikacji" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Brak ANTHROPIC_API_KEY w zmiennych środowiskowych Vercel" });
  }

  const { type, base64, mediaType, description } = req.body || {};

  let content;
  if (type === "photo") {
    if (!base64) return res.status(400).json({ error: "Brak zdjęcia" });
    content = [
      { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: base64 } },
      {
        type: "text",
        text: "Jesteś dietetykiem. Oszacuj wartości odżywcze posiłku na zdjęciu. Odpowiedz WYŁĄCZNIE obiektem JSON, bez markdown, w formacie: {\"name\": \"krótka nazwa posiłku po polsku\", \"kcal\": liczba_całkowita, \"protein\": liczba_całkowita_gramy, \"fat\": liczba_całkowita_gramy, \"carbs\": liczba_całkowita_gramy, \"details\": \"krótki opis składników i porcji\"}. Bądź realistyczny, licz całą widoczną porcję.",
      },
    ];
  } else if (type === "text") {
    if (!description) return res.status(400).json({ error: "Brak opisu" });
    content = `Jesteś dietetykiem. Na podstawie opisu posiłku oszacuj jego wartości odżywcze: "${description}". Odpowiedz WYŁĄCZNIE obiektem JSON, bez markdown, w formacie: {"name": "krótka nazwa posiłku po polsku", "kcal": liczba_całkowita, "protein": liczba_całkowita_gramy, "fat": liczba_całkowita_gramy, "carbs": liczba_całkowita_gramy, "details": "krótki opis przyjętych założeń co do porcji"}. Jeśli opis jest niejasny co do ilości, przyjmij typową porcję i wspomnij o tym w details. Bądź realistyczny.`;
  } else if (type === "review") {
    const { current, history, garmin } = req.body;
    let garminBlock = "brak danych z zegarka";
    if (Array.isArray(garmin) && garmin.length) {
      garminBlock = garmin
        .map((w) => `${w.date}: HRV ${w.hrv ?? "—"}, tętno spoczynkowe ${w.restingHr ?? "—"}, sen ${w.sleepHours ?? "—"}h (score ${w.sleepScore ?? "—"}), gotowość ${w.readiness ?? "—"}, VO2max ${w.vo2max ?? "—"}, CTL ${w.ctl ?? "—"}, ATL ${w.atl ?? "—"}, ramp ${w.rampRate ?? "—"}`)
        .join("\n");
    }
    content = `Jesteś doświadczonym trenerem biegów górskich i ultra. Oceniasz tydzień swojego zawodnika.

ZAWODNIK
193 cm, ~97 kg, cel wagowy 89-90 kg. Bardzo wysoka baza tlenowa. Za sobą ukończone 109 km.
Przerwa lipiec-sierpień 2026 spowodowała spadek formy około 20%. Wraca ostrożnie.
Praca na nocki: niedziela 18:00 do środy 06:00, trzy noce z rzędu. Trenuje środa-sobota, cztery dni.
Znane problemy: prawa noga krótsza o 2,5 cm, ból nad prawym kolanem, słaby prawy pośladek, słaba prawa kostka.
Cele: 100 km ultra 15.05.2027, Mont Blanc 07.07.2027, Snowdonia 80 km 04.09.2027. Wspinanie z 5c na 6a-c.

ZASADY, KTÓRE OBOWIĄZUJĄ (egzekwuj je, nie powtarzaj)
1. Sen jest warunkiem wstępnym, nie dodatkiem. Objętość ma się zmieścić w dostępnym śnie. Historycznie spał 6h05 przy potrzebie 8h i to był główny limiter, nie dieta i nie trening.
2. W bloku bazy: HR pod 135, zero jakości. Jeśli dane ze stref pokazują czas w Z3+, to jest złamanie zasady.
3. Deload co 4. tydzień: objętość w dół o 40-50%. Deload to inwestycja, nie strata.
4. Blok ME wymaga 4 tygodni bazy przed sobą. Raz został włączony po przerwie i trzeba było go cofnąć.
5. Kolizja sobotnia: ciężkie dźwiganie i długi bieg Z2 nie stoją obok siebie. Góra idzie PO biegu, nigdy przed.
6. Siłownia wspiera bieganie, nigdy odwrotnie. Długi bieg jest ważniejszy od każdej innej sesji.
7. Ciągłość ponad perfekcję. Trenuj pod ostatnie 40 km wyścigu, nie pod pierwsze 20.

BIEŻĄCY TYDZIEŃ
${current}

DANE Z ZEGARKA, DZIEŃ PO DNIU
${garminBlock}

HISTORIA
${history || "brak danych historycznych"}

ZADANIE
Napisz ocenę po polsku, maksymalnie 250 słów, w tej strukturze:

1. WERDYKT. Jedno zdanie.
2. WYKONANIE VS PLAN. Czy tydzień zgadza się z blokiem periodyzacji i jego zasadą? Jeśli to deload, czy objętość faktycznie spadła? Jeśli to baza, czy HR i strefy się trzymają?
3. TREND. Porównaj z poprzednim tygodniem konkretnymi liczbami: HRV, tętno spoczynkowe, sen, CTL, kilometry. Powiedz co rośnie, co spada i czy to jest to, co powinno.
4. RYZYKO. Bądź szczery, nie łagodź. Reaguj na: HRV spadające przez kilka dni, tętno spoczynkowe w górę, rampRate powyżej 8 na tydzień, sen poniżej 7h, deficyt kaloryczny przy rosnącej objętości, czas w Z3+ w bloku bazy, ból prawej strony w komentarzach. Jeśli danych brakuje, powiedz czego brakuje, nie zmyślaj.
5. JEDNA ZMIANA na przyszły tydzień. Konkretna, wykonalna, nie lista.

Dane z zegarka są ważniejsze niż wpisy ręczne. Jeśli obie liczby są w komplecie i się różnią, wierz zegarkowi i powiedz o rozbieżności.
Bez wstępów. Zacznij od werdyktu. Krótkie zdania. Nie używaj myślników em.`;
  } else {
    return res.status(400).json({ error: "Nieznany typ żądania" });
  }

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: type === "review" ? 1000 : 1000,
        messages: [{ role: "user", content }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      let hint = "";
      if (resp.status === 401) hint = "Klucz API nieprawidłowy lub nie ustawiony w Vercel.";
      else if (resp.status === 400 && errText.includes("credit")) hint = "Brak środków na koncie Anthropic — doładuj w console.anthropic.com (Billing).";
      else if (resp.status === 429) hint = "Limit zapytań przekroczony, spróbuj za chwilę.";
      else if (resp.status === 404) hint = "Model niedostępny dla tego klucza.";
      return res.status(resp.status).json({ error: `${resp.status}: ${hint} ${errText}`.slice(0, 400) });
    }

    const data = await resp.json();
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    if (type === "review") {
      return res.status(200).json({ text: text.trim() });
    }
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
