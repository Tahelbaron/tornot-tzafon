const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzaNej_rcfKCjidNzHIvSeTyIpGUTNXtTCpm0Zzy0JPF4FPvKue-tL_vpJWj3lut-ywBA/exec";

function callScript(action, data = {}) {
  return new Promise((resolve) => {
    const callbackName = "cb_" + Date.now();
    const params = new URLSearchParams({ action, callback: callbackName, ...data });
    const script = document.createElement("script");
    window[callbackName] = (result) => {
      resolve(result);
      delete window[callbackName];
      document.body.removeChild(script);
    };
    script.src = `${SCRIPT_URL}?${params}`;
    script.onerror = () => resolve({ error: "network error" });
    document.body.appendChild(script);
  });
}

async function callScriptPost(action, data = {}) {
  try {
    const url = `${SCRIPT_URL}?action=${action}&${new URLSearchParams(data)}`;
    const res = await fetch(url, { method: "GET", mode: "no-cors" });
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
}

export const api = {
  getConstraints: (month) => callScript("getConstraints", { month }),
  saveConstraint: (data)  => callScript("saveConstraint", data),
  deleteConstraint:(data) => callScript("deleteConstraint", data),
  clearMonth: (month)     => callScript("clearMonth", { month }),
};