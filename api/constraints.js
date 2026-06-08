const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwymXbUo9Frztx_eQzG82gbtQfRnwsMMiPK7kRwES1CZG1XtWS7UiMqVmJNqd9N1J-IXA/exec";
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  try {
    const { action, ...params } = req.method === "POST" 
      ? req.body 
      : req.query;

    const url = `${SCRIPT_URL}?action=${action}&${new URLSearchParams(params)}`;
    const response = await fetch(url);
    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}