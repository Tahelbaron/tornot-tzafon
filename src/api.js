// ─── Google Apps Script API ───────────────────────────────────────────────────
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwVguuON4jolEAXKkRKd_T_tJbVJCSifBy1ljMUGUI9qSW137WcQNRWmCwzb4o6lY9kOg/exec";

async function callScript(action, data = {}) {
  try {
    const url = `${SCRIPT_URL}?action=${action}&${new URLSearchParams(data)}`;
    const res = await fetch(url, { method: "GET" });
    return await res.json();
  } catch (e) {
    console.error("Script error:", e);
    return { error: e.message };
  }
}

async function callScriptPost(action, data = {}) {
  try {
    const res = await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action, ...data }),
    });
    return await res.json();
  } catch (e) {
    return { error: e.message };
  }
}

export const api = {
  getConstraints: (month) => callScript("getConstraints", { month }),
  saveConstraint: (data)  => callScriptPost("saveConstraint", data),
  deleteConstraint:(data) => callScriptPost("deleteConstraint", data),
  clearMonth: (month)     => callScriptPost("clearMonth", { month }),
};
