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
  } else {
    return res.status(400).json({ error: "Nieznany typ żądania (oczekiwano 'photo' lub 'text')" });
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
        max_tokens: 1000,
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
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
