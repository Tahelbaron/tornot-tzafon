// רץ על שרתי Vercel, עוקף את בעיית CORS
 
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzaNej_rcfKCjidNzHIvSeTyIpGUTNXtTCpm0Zzy0JPF4FPvKue-tL_vpJWj3lut-ywBA/exec";
 
export default async function handler(req, res) {
  // אפשר לכל מקור לגשת (פותר CORS)
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