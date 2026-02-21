// 🧠 Amber Brain test helper
// Symuluje prawdziwe wywołanie endpointu /api/brain (lokalnie lub na Vercel dev)
export async function callBrain(text, sessionId = "test-session") {
  if (!text && text !== "") throw new Error("Missing text input in callBrain");

  try {
    const res = await fetch("http://localhost:3000/api/brain/v2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, text }),
    });

    // jeśli backend działa
    if (res.ok) {
      const data = await res.json();
      return data;
    }

    // jeśli zwraca błąd (np. 400 lub 405)
    return { ok: false, error: `HTTP ${res.status}` };
  } catch (err) {
    console.error("⚠️ callBrain error:", err.message);
    return { ok: false, error: err.message };
  }
}

// 🧠 Mock test client for local brain API tests
export const testClient = async (payload = {}) => {
  try {
    const res = await fetch('http://localhost:3000/api/brain/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('testClient error:', err.message);
    return { ok: false, error: err.message };
  }
};
