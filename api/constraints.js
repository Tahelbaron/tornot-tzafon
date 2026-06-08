const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz4YlCxWDo3ZmmNJUpnmqwF00Dkoa1zwz8kKd4-s6OhpgilcLpjYNAt6vollcH4MNd5/exec";

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