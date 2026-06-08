const API_URL = "/api/constraints";

async function call(action, data = {}) {
  try {
    const res = await fetch(`${API_URL}?action=${action}&${new URLSearchParams(data)}`);
    return await res.json();
  } catch (e) {
    return { error: e.message };
  }
}

async function callPost(action, data = {}) {
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...data }),
    });
    return await res.json();
  } catch (e) {
    return { error: e.message };
  }
}

export const api = {
  getConstraints:  (month) => call("getConstraints", { month }),
  saveConstraint:  (data)  => callPost("saveConstraint", data),
  deleteConstraint:(data)  => callPost("deleteConstraint", data),
  clearMonth:      (month) => callPost("clearMonth", { month }),
};