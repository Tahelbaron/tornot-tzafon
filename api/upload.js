import ExcelJS from "exceljs";

const PINK_ALON  = "FFE49EDD";
const PINK_ERKIM = "FFE39DD4";

const ALON_MAP = [
  {match:["מעצר"],id:"a1"},{match:["פיצול"],id:"a2"},
  {match:["משלב 1","משלב1","1+2"],id:"a3"},{match:["משלב נוסף","משלב 2"],id:"a4"},
  {match:["משלב 3"],id:"a5"},{match:["הרכב"],id:"a6"},{match:["דן יחיד"],id:"a7"},
  {match:["תזכורות וקדמים"],id:"a8"},{match:["תזכורות"],id:"a9"},
  {match:["תעבורה"],id:"a10"},{match:["עתודה 1","עתודה1"],id:"a11"},{match:["עתודה 2","עתודה2"],id:"a12"},
];
const SHAAR_MAP = [
  {match:["שער א","משמרת א"],id:"s1"},{match:["שער ב","משמרת ב"],id:"s2"},{match:["עתודה"],id:"s3"},
];

function matchCol(header, map) {
  if (!header) return null;
  const h = String(header).trim().toLowerCase();
  for (const {match, id} of map) {
    if (match.some(m => h.includes(m.toLowerCase()))) return id;
  }
  return null;
}

function parseDay(v) {
  if (!v) return null;
  const m = String(v).match(/(\d{1,2})\.(\d{1,2})\./);
  return m ? parseInt(m[1], 10) : null;
}

function getCellColor(cell) {
  try {
    const fill = cell.fill;
    if (!fill) return null;
    if (fill.fgColor?.argb) return fill.fgColor.argb;
    if (fill.fgColor?.theme !== undefined) return null;
    return null;
  } catch { return null; }
}

async function parseAlon(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  const colMap = {};
  ws.getRow(1).eachCell((cell, colNum) => {
    const id = matchCol(cell.value, ALON_MAP);
    if (id) colMap[colNum] = id;
  });
  const active = {};
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const day = parseDay(row.getCell(2).value);
    if (!day) return;
    row.eachCell((cell, colNum) => {
      const sid = colMap[colNum];
      if (!sid) return;
      const color = getCellColor(cell);
      if (color === PINK_ALON) {
        if (!active[day]) active[day] = [];
        if (!active[day].includes(sid)) active[day].push(sid);
      }
    });
  });
  return active;
}

async function parseErkim(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  const COL_SHIFT = {6:"e1", 7:"e2"};
  const active = {};
  ws.eachRow((row, rowNum) => {
    if (rowNum <= 2) return;
    const day = parseDay(row.getCell(2).value);
    if (!day) return;
    for (const [colIdx, sid] of Object.entries(COL_SHIFT)) {
      const cell = row.getCell(parseInt(colIdx));
      const color = getCellColor(cell);
      if (color === PINK_ERKIM) {
        if (!active[day]) active[day] = [];
        if (!active[day].includes(sid)) active[day].push(sid);
      }
    }
  });
  return active;
}

async function parseShaar(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  const colMap = {};
  ws.getRow(1).eachCell((cell, colNum) => {
    const id = matchCol(cell.value, SHAAR_MAP);
    if (id) colMap[colNum] = id;
  });
  const active = {};
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const day = parseDay(row.getCell(2).value);
    if (!day) return;
    row.eachCell((cell, colNum) => {
      const sid = colMap[colNum];
      if (!sid) return;
      const color = getCellColor(cell);
      if (color === PINK_ALON) {
        if (!active[day]) active[day] = [];
        if (!active[day].includes(sid)) active[day].push(sid);
      }
    });
  });
  return active;
}

function merge(...results) {
  const merged = {};
  for (const r of results) {
    for (const [day, shifts] of Object.entries(r)) {
      if (!merged[day]) merged[day] = [];
      for (const s of shifts) {
        if (!merged[day].includes(s)) merged[day].push(s);
      }
    }
  }
  return merged;
}

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({error:"Method not allowed"}); return; }

  try {
    // קרא את ה-body כ-buffer
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);

    // parse multipart manually
    const boundary = req.headers["content-type"].split("boundary=")[1];
    const parts = parseMultipart(body, boundary);

    let alonBuf = null, erkimBuf = null, shaarBuf = null;
    for (const part of parts) {
      const name = part.name;
      if (name === "alon")  alonBuf  = part.data;
      if (name === "erkim") erkimBuf = part.data;
      if (name === "shaar") shaarBuf = part.data;
    }

    const results = [];
    if (alonBuf)  results.push(await parseAlon(alonBuf));
    if (erkimBuf) results.push(await parseErkim(erkimBuf));
    if (shaarBuf) results.push(await parseShaar(shaarBuf));

    if (results.length === 0) {
      res.status(400).json({error:"לא הועלו קבצים"});
      return;
    }

    const merged = merge(...results);
    const totalShifts = Object.values(merged).reduce((a,b)=>a+b.length,0);
    const totalDays = Object.keys(merged).length;

    res.status(200).json({ ok: true, activeShiftsByDay: merged, totalDays, totalShifts });
  } catch(err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}

function parseMultipart(buffer, boundary) {
  const parts = [];
  const boundaryBuf = Buffer.from("--" + boundary);
  let start = buffer.indexOf(boundaryBuf) + boundaryBuf.length + 2;

  while (start < buffer.length) {
    const end = buffer.indexOf(boundaryBuf, start);
    if (end === -1) break;
    const part = buffer.slice(start, end - 2);
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) { start = end + boundaryBuf.length + 2; continue; }
    const headerStr = part.slice(0, headerEnd).toString();
    const data = part.slice(headerEnd + 4);
    const nameMatch = headerStr.match(/name="([^"]+)"/);
    if (nameMatch) parts.push({ name: nameMatch[1], data });
    start = end + boundaryBuf.length + 2;
  }
  return parts;
}
