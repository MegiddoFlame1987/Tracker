// Funkcja serwerowa Vercel. Trzyma klucz API po stronie serwera —
// przeglądarka nigdy go nie widzi. Wywoływana z App.jsx pod /api/analyze.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
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
    const { current, history } = req.body;
    content = `Jesteś doświadczonym trenerem biegów górskich i ultra. Twój zawodnik: 193cm, ~97kg, wraca po 3-tygodniowej przerwie, jest w 8-tygodniowym bloku czystej bazy Z1/Z2 + redukcji wagi. Cele: ultra 100km (maj 2027), Mont Blanc (lipiec 2027), Snowdonia 80km (wrzesień 2027), wspinanie 6a-c i lodowe. Pracuje na nocki (nd 18:00 - śr 06:00), trenuje śr-nd. Znane problemy: prawa noga krótsza o 2,5cm, ból nad prawym kolanem i prawy pośladek, tętno obecnie wysokie przy łatwym wysiłku (oczekuje na wyniki krwi).

DANE BIEŻĄCEGO TYGODNIA:
${current}

POPRZEDNIE TYGODNIE (od najnowszego):
${history || "brak danych historycznych"}

Napisz zwięzłą ocenę tygodnia po polsku, maksymalnie 200 słów. Struktura:
1. Jedno zdanie werdyktu.
2. Co poszło dobrze (konkretne liczby).
3. Co wymaga uwagi — bądź szczery, nie łagodź. Jeśli widzisz ryzyko przetrenowania, niedoboru snu, zbyt małego deficytu albo zbyt wysokiego tętna, powiedz to wprost.
4. Jedna konkretna rzecz do zmiany w przyszłym tygodniu.
Bez wstępów typu "oto ocena". Zacznij od werdyktu. Nie używaj myślników em (—), pisz krótkimi zdaniami.`;
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
        // Haiku 4.5: $1/$5 za milion tokenów, 3x taniej niż Sonnet 4.6 ($3/$15).
        // Ocena tygodnia zostaje na Sonnecie — to jedno wywołanie/tydzień, warto tu jakości.
        model: type === "review" ? "claude-sonnet-4-6" : "claude-haiku-4-5-20251001",
        max_tokens: type === "review" ? 700 : 400,
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
