import { useState, useMemo, useRef } from "react";
import * as XLSX from "xlsx";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const DAYS_HE = ["א׳","ב׳","ג׳","ד׳","ה׳","ו׳","ש׳"];
const MONTHS_HE = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
const HARDNESS_LABEL = {1:"קל מאוד",2:"קל",3:"בינוני",4:"קשה",5:"קשה מאוד"};
const HARDNESS_COLOR = {1:"#10B981",2:"#84CC16",3:"#F59E0B",4:"#F97316",5:"#EF4444"};

// Pink colors per sheet type (our district color)
const PINK_ALON  = "FFE49EDD"; // אולם
const PINK_ERKIM = "FFE39DD4"; // עריקים (slightly different!)
const PINK_SHAAR = "FFE49EDD"; // שער

// ─── SHIFT DEFINITIONS ───────────────────────────────────────────────────────
// hardness 1-5, seniorRestrict: seniority years BLOCKED from this shift
// minSeniority: minimum seniority year required (e.g. הרכב requires ≥2)
const INITIAL_SHIFTS = [
  // אולם
  { id:"a1",  sheet:"אולם",   label:"מעצרים",          hardness:5, color:"#10B981", bg:"#D1FAE5", dark:"#064E3B", seniorRestrict:[4,3], minSeniority:1 },
  { id:"a2",  sheet:"אולם",   label:"פיצול",            hardness:3, color:"#06B6D4", bg:"#CFFAFE", dark:"#164E63", seniorRestrict:[],    minSeniority:1 },
  { id:"a3",  sheet:"אולם",   label:"משלב 1+2",         hardness:5, color:"#3B82F6", bg:"#DBEAFE", dark:"#1E3A8A", seniorRestrict:[4,3], minSeniority:1 },
  { id:"a4",  sheet:"אולם",   label:"משלב נוסף",        hardness:4, color:"#60A5FA", bg:"#EFF6FF", dark:"#1E3A8A", seniorRestrict:[4],   minSeniority:1 },
  { id:"a5",  sheet:"אולם",   label:"משלב 3",           hardness:5, color:"#6366F1", bg:"#E0E7FF", dark:"#312E81", seniorRestrict:[4,3], minSeniority:1 },
  { id:"a6",  sheet:"אולם",   label:"הרכב",             hardness:2, color:"#8B5CF6", bg:"#EDE9FE", dark:"#4C1D95", seniorRestrict:[],    minSeniority:2 },
  { id:"a7",  sheet:"אולם",   label:"דן יחיד",          hardness:5, color:"#A855F7", bg:"#F3E8FF", dark:"#581C87", seniorRestrict:[4,3], minSeniority:1 },
  { id:"a8",  sheet:"אולם",   label:"תזכורות וקדמים",   hardness:1, color:"#EC4899", bg:"#FCE7F3", dark:"#831843", seniorRestrict:[],    minSeniority:1 },
  { id:"a9",  sheet:"אולם",   label:"תזכורות נוספות",   hardness:1, color:"#F472B6", bg:"#FDF2F8", dark:"#831843", seniorRestrict:[],    minSeniority:1 },
  { id:"a10", sheet:"אולם",   label:"תעבורה צדדים",     hardness:2, color:"#FB7185", bg:"#FFF1F2", dark:"#881337", seniorRestrict:[],    minSeniority:1 },
  { id:"a11", sheet:"אולם",   label:"עתודה 1",          hardness:1, color:"#F43F5E", bg:"#FFE4E6", dark:"#881337", seniorRestrict:[],    minSeniority:1 },
  { id:"a12", sheet:"אולם",   label:"עתודה 2",          hardness:1, color:"#14B8A6", bg:"#CCFBF1", dark:"#134E4A", seniorRestrict:[],    minSeniority:1 },
  // כתיבה / עריקים
  { id:"e1",  sheet:"כתיבה",  label:"כתיבת עריקים",     hardness:4, color:"#EF4444", bg:"#FEE2E2", dark:"#7F1D1D", seniorRestrict:[],    minSeniority:1 },
  { id:"e2",  sheet:"כתיבה",  label:"עתודה עריקים",     hardness:2, color:"#F97316", bg:"#FFEDD5", dark:"#7C2D12", seniorRestrict:[],    minSeniority:1 },
  { id:"e3",  sheet:"כתיבה",  label:"משתמטים 1",        hardness:4, color:"#EAB308", bg:"#FEF9C3", dark:"#713F12", seniorRestrict:[],    minSeniority:1 },
  { id:"e4",  sheet:"כתיבה",  label:"משתמטים 2",        hardness:4, color:"#CA8A04", bg:"#FEF08A", dark:"#713F12", seniorRestrict:[],    minSeniority:1 },
  { id:"e5",  sheet:"כתיבה",  label:"משתמטים עתודה",    hardness:2, color:"#84CC16", bg:"#F0FDF4", dark:"#14532D", seniorRestrict:[],    minSeniority:1 },
  // שער
  { id:"s1",  sheet:"שער",    label:"שער א",            hardness:4, color:"#0EA5E9", bg:"#E0F2FE", dark:"#0C4A6E", seniorRestrict:[4],   minSeniority:1 },
  { id:"s2",  sheet:"שער",    label:"שער ב",            hardness:4, color:"#6D28D9", bg:"#DDD6FE", dark:"#2E1065", seniorRestrict:[4],   minSeniority:1 },
  { id:"s3",  sheet:"שער",    label:"עתודה שער",        hardness:1, color:"#64748B", bg:"#F1F5F9", dark:"#1E293B", seniorRestrict:[],    minSeniority:1 },
];

// Excel column header → shift id mappings per sheet type
const ALON_MAP = [
  { match:["מעצר"],              id:"a1"  },
  { match:["פיצול"],             id:"a2"  },
  { match:["משלב 1","משלב1","1+2"], id:"a3" },
  { match:["משלב נוסף","משלב 2"], id:"a4" },
  { match:["משלב 3","משלב3"],    id:"a5"  },
  { match:["הרכב"],              id:"a6"  },
  { match:["דן יחיד"],           id:"a7"  },
  { match:["תזכורות וקדמים"],    id:"a8"  },
  { match:["תזכורות"],           id:"a9"  },
  { match:["תעבורה"],            id:"a10" },
  { match:["עתודה 1","עתודה1"],  id:"a11" },
  { match:["עתודה 2","עתודה2"],  id:"a12" },
];
const ERKIM_MAP = [
  { match:["תורן"],   colOffset:0, id:"e1" },  // G col = תורן צפון
  { match:["עתודה"],  colOffset:0, id:"e2" },  // H col = עתודה צפון
];
const SHAAR_MAP = [
  { match:["משמרת א","א"],  id:"s1" },
  { match:["משמרת ב","ב"],  id:"s2" },
  { match:["עתודה"],        id:"s3" },
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
  const m = String(v).match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  return m ? parseInt(m[1], 10) : null;
}

function cleanName(v) {
  return v ? String(v).replace(/\s*\(.*?\)\s*/g,"").trim() : "";
}

// ─── EXCEL PARSERS ────────────────────────────────────────────────────────────

function parseAlonSheet(buf) {
  const wb = XLSX.read(buf, {type:"array", cellStyles:true});
  const ws = wb.Sheets[wb.SheetNames[0]];
  const range = XLSX.utils.decode_range(ws["!ref"]||"A1");
  const colMap = {};
  for (let c=range.s.c; c<=range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({r:0,c})];
    if (cell?.v) { const id = matchCol(cell.v, ALON_MAP); if(id) colMap[c]=id; }
  }
  const active = {}, existing = {};
  for (let r=1; r<=range.e.r; r++) {
    const dateCell = ws[XLSX.utils.encode_cell({r,c:1})];
    const day = parseDay(dateCell?.v); if(!day) continue;
    if(!active[day]) active[day]=new Set();
    if(!existing[day]) existing[day]={};
    for (let c=2; c<=range.e.c; c++) {
      const sid = colMap[c]; if(!sid) continue;
      const cell = ws[XLSX.utils.encode_cell({r,c})]; if(!cell) continue;
      const rgb = cell.s?.fgColor?.rgb || cell.s?.fgColor?.argb;
      if (rgb===PINK_ALON) {
        active[day].add(sid);
        if (cell.v) existing[day][sid] = cleanName(cell.v);
      }
    }
  }
  return {active, existing};
}

function parseErkimSheet(buf) {
  // Structure: row1=title, row2=headers (יום,תאריך,מרכז-תורן,מרכז-עתודה,דרום-תורן,דרום-עתודה,צפון-תורן,צפון-עתודה)
  // Our color: FFE39DD4 = cols G(6) and H(7) = צפון
  const wb = XLSX.read(buf, {type:"array", cellStyles:true});
  const ws = wb.Sheets[wb.SheetNames[0]];
  const range = XLSX.utils.decode_range(ws["!ref"]||"A1");
  const active = {}, existing = {};
  // Data starts row 3 (index 2), date in col B (index 1)
  // Col G(6)=צפון תורן→e1, Col H(7)=צפון עתודה→e2
  const ERKIM_PINK = "FFE39DD4";
  const COL_SHIFT = {6:"e1", 7:"e2"}; // 0-indexed
  for (let r=2; r<=range.e.r; r++) {
    const dateCell = ws[XLSX.utils.encode_cell({r,c:1})];
    const day = parseDay(dateCell?.v); if(!day) continue;
    if(!active[day]) active[day]=new Set();
    if(!existing[day]) existing[day]={};
    for (const [colIdx, sid] of Object.entries(COL_SHIFT)) {
      const c = parseInt(colIdx);
      const cell = ws[XLSX.utils.encode_cell({r,c})]; if(!cell) continue;
      const rgb = cell.s?.fgColor?.rgb || cell.s?.fgColor?.argb;
      if (rgb===ERKIM_PINK) {
        active[day].add(sid);
        if (cell.v) existing[day][sid] = cleanName(cell.v);
      }
    }
  }
  return {active, existing};
}

function parseShaarSheet(buf) {
  const wb = XLSX.read(buf, {type:"array", cellStyles:true});
  const ws = wb.Sheets[wb.SheetNames[0]];
  const range = XLSX.utils.decode_range(ws["!ref"]||"A1");
  const colMap = {};
  for (let c=range.s.c; c<=range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({r:0,c})];
    if (cell?.v) { const id = matchCol(cell.v, SHAAR_MAP); if(id) colMap[c]=id; }
  }
  const active = {}, existing = {};
  for (let r=1; r<=range.e.r; r++) {
    const dateCell = ws[XLSX.utils.encode_cell({r,c:1})];
    const day = parseDay(dateCell?.v); if(!day) continue;
    if(!active[day]) active[day]=new Set();
    if(!existing[day]) existing[day]={};
    for (let c=2; c<=range.e.c; c++) {
      const sid = colMap[c]; if(!sid) continue;
      const cell = ws[XLSX.utils.encode_cell({r,c})]; if(!cell) continue;
      const rgb = cell.s?.fgColor?.rgb || cell.s?.fgColor?.argb;
      if (rgb===PINK_SHAAR) {
        active[day].add(sid);
        if (cell.v) existing[day][sid] = cleanName(cell.v);
      }
    }
  }
  return {active, existing};
}

function mergeSheets(results) {
  // Merge active shifts and existing assignments from multiple sheets
  const active = {}, existing = {};
  for (const {active:a, existing:e} of results) {
    for (const [day, set] of Object.entries(a)) {
      if(!active[day]) active[day]=new Set();
      for (const sid of set) active[day].add(sid);
    }
    for (const [day, map] of Object.entries(e)) {
      if(!existing[day]) existing[day]={};
      Object.assign(existing[day], map);
    }
  }
  return {active, existing};
}

// ─── SCHEDULER ────────────────────────────────────────────────────────────────
const MAX_MONTH = {4:14, 3:17, 2:20, 1:24};
const MAX_DAY   = {4:1,  3:2,  2:2,  1:2};
// Target: ~3 shifts/week = ~13/month
const TARGET_WEEK = 3;

function getDaysInMonth(y,m){return new Date(y,m+1,0).getDate();}
function getFirstDay(y,m){return new Date(y,m,1).getDay();}

function smartGenerate(workers, shifts, constraints, year, month, activeShiftsByDay) {
  const days = getDaysInMonth(year, month);
  const schedule = {};
  const counts = {};
  workers.forEach(w=>{
    counts[w.id]={total:0,loadTotal:0};
    shifts.forEach(s=>{counts[w.id][s.id]=0;});
  });

  for (let d=1; d<=days; d++) {
    schedule[d]={};
    const todayCount={};
    workers.forEach(w=>{todayCount[w.id]=0;});

    const activeSet = activeShiftsByDay?.[d];
    const dayShifts = activeSet
      ? shifts.filter(s=>activeSet.has(s.id))
      : shifts;
    if(!dayShifts.length) continue;

    // Process hardest first → juniors absorb them
    const sorted = [...dayShifts].sort((a,b)=>b.hardness-a.hardness);

    for (const shift of sorted) {
      const eligible = workers
        .filter(w=>{
          if (shift.seniorRestrict.includes(w.seniority)) return false;
          if (w.seniority < shift.minSeniority) return false;
          if (todayCount[w.id] >= MAX_DAY[w.seniority]) return false;
          if (counts[w.id].total >= MAX_MONTH[w.seniority]) return false;
          const cs = constraints[w.id]||[];
          for (const c of cs) {
            if (c.type==="unavailable" && c.day===d) return false;
            if (c.type==="shift_off" && c.shiftId===shift.id) return false;
          }
          return true;
        })
        .sort((a,b)=>{
          // Within same seniority → equalize load
          if (a.seniority===b.seniority)
            return counts[a.id].loadTotal - counts[b.id].loadTotal;
          // Hard shifts → juniors first; easy → seniors first
          if (shift.hardness>=4) return a.seniority - b.seniority;
          if (shift.hardness<=2) return b.seniority - a.seniority;
          // Medium → fairness by load%
          return (counts[a.id].loadTotal/MAX_MONTH[a.seniority]) -
                 (counts[b.id].loadTotal/MAX_MONTH[b.seniority]);
        });

      const fallback = eligible.length>0 ? eligible : workers
        .filter(w=>{
          const cs=constraints[w.id]||[];
          return !cs.some(c=>c.type==="unavailable"&&c.day===d) &&
                 todayCount[w.id]<MAX_DAY[w.seniority] &&
                 w.seniority>=shift.minSeniority;
        })
        .sort((a,b)=>(counts[a.id].loadTotal/MAX_MONTH[a.seniority])-(counts[b.id].loadTotal/MAX_MONTH[b.seniority]));

      if (fallback.length>0) {
        const w=fallback[0];
        schedule[d][shift.id]=w.id;
        counts[w.id][shift.id]++;
        counts[w.id].total++;
        counts[w.id].loadTotal+=shift.hardness;
        todayCount[w.id]++;
      } else {
        schedule[d][shift.id]=null;
      }
    }
  }
  return {schedule,counts};
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const senLabel = s=>({4:"שנה רביעית",3:"שנה שלישית",2:"שנה שניה",1:"שנה ראשונה"}[s]??"-");
const senColor = s=>({4:"#10B981",3:"#3B82F6",2:"#F59E0B",1:"#EF4444"}[s]??"#64748B");
const SHEETS = ["אולם","כתיבה","שער"];
const SHEET_COLOR = {"אולם":"#6366F1","כתיבה":"#EF4444","שער":"#0EA5E9"};

// ─── UI ATOMS ─────────────────────────────────────────────────────────────────
const Card=({children,style={}})=>(
  <div style={{background:"#1E293B",border:"1px solid #334155",borderRadius:16,padding:18,...style}}>{children}</div>
);
const Btn=({children,onClick,variant="primary",small,disabled,style={}})=>(
  <button onClick={onClick} disabled={disabled} style={{
    padding:small?"5px 12px":"9px 20px",borderRadius:8,cursor:disabled?"not-allowed":"pointer",
    fontFamily:"'Heebo',sans-serif",fontWeight:700,fontSize:small?12:13,
    background:variant==="primary"?"linear-gradient(135deg,#3B82F6,#6366F1)":
              variant==="danger"?"#450a0a":"transparent",
    color:variant==="ghost"?"#94A3B8":"#fff",
    border:variant==="ghost"?"1px solid #334155":"none",
    boxShadow:variant==="primary"?"0 3px 10px rgba(99,102,241,0.35)":"none",
    opacity:disabled?0.5:1,...style,
  }}>{children}</button>
);
const Inp=({value,onChange,placeholder,type="text",min,max,style={}})=>(
  <input value={value} onChange={onChange} placeholder={placeholder} type={type} min={min} max={max}
    style={{padding:"8px 12px",borderRadius:8,border:"1px solid #334155",background:"#0F172A",
    color:"#E2E8F0",fontFamily:"'Heebo',sans-serif",fontSize:13,outline:"none",...style}}/>
);
const Sel=({value,onChange,children,style={}})=>(
  <select value={value} onChange={onChange} style={{padding:"8px 12px",borderRadius:8,
    border:"1px solid #334155",background:"#0F172A",color:"#E2E8F0",
    fontFamily:"'Heebo',sans-serif",fontSize:13,outline:"none",...style}}>
    {children}
  </select>
);
const TabBar=({tabs,active,onChange})=>(
  <div style={{display:"flex",gap:3,background:"#0F172A",borderRadius:10,padding:3,flexWrap:"wrap"}}>
    {tabs.map(([id,label])=>(
      <button key={id} onClick={()=>onChange(id)} style={{
        padding:"6px 13px",borderRadius:7,border:"none",cursor:"pointer",
        fontFamily:"'Heebo',sans-serif",fontWeight:700,fontSize:12,
        background:active===id?"linear-gradient(135deg,#3B82F6,#6366F1)":"transparent",
        color:active===id?"#fff":"#64748B",
      }}>{label}</button>
    ))}
  </div>
);
const HardnessPicker=({value,onChange})=>(
  <div style={{display:"flex",gap:3,alignItems:"center"}}>
    {[1,2,3,4,5].map(h=>(
      <button key={h} onClick={()=>onChange(h)} style={{
        width:25,height:25,borderRadius:5,border:"none",cursor:"pointer",fontSize:10,fontWeight:700,
        background:h<=value?HARDNESS_COLOR[value]:"#0F172A",
        color:h<=value?"#fff":"#475569",
      }}>{h}</button>
    ))}
    <span style={{fontSize:10,color:HARDNESS_COLOR[value],fontWeight:700,marginRight:4}}>
      {HARDNESS_LABEL[value]}
    </span>
  </div>
);
const LoadBar=({value,max,color})=>{
  const pct=Math.min(100,Math.round((value/(max||1))*100));
  return(
    <div style={{height:5,borderRadius:3,background:"#0F172A",overflow:"hidden",flex:1}}>
      <div style={{height:"100%",borderRadius:3,width:`${pct}%`,
        background:pct>90?"#EF4444":pct>70?"#F59E0B":color}}/>
    </div>
  );
};

// ─── EXCEL UPLOAD PANEL ───────────────────────────────────────────────────────
function UploadBox({label,color,icon,loaded,onFile,onClear}) {
  const ref=useRef();
  const [loading,setLoading]=useState(false);
  const handleChange=async(e)=>{
    const f=e.target.files?.[0]; if(!f)return;
    setLoading(true);
    const buf=await f.arrayBuffer();
    onFile(buf,f.name);
    setLoading(false);
    e.target.value="";
  };
  return (
    <div style={{flex:1,minWidth:160,border:`1px solid ${loaded?"#10B981":"#334155"}`,
      borderRadius:12,padding:14,background:loaded?"#10B98111":"#0F172A",
      display:"flex",flexDirection:"column",gap:8}}>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:18}}>{icon}</span>
        <span style={{fontWeight:700,fontSize:13,color}}>{label}</span>
      </div>
      {loaded ? (
        <div>
          <div style={{fontSize:11,color:"#10B981",fontWeight:600,marginBottom:4}}>✅ {loaded.name}</div>
          <div style={{fontSize:10,color:"#4B5563"}}>{loaded.days} ימים · {loaded.shifts} תורנויות</div>
          <button onClick={onClear} style={{marginTop:6,fontSize:10,color:"#EF4444",
            background:"none",border:"none",cursor:"pointer",padding:0}}>הסר ×</button>
        </div>
      ) : (
        <label style={{display:"inline-flex",alignItems:"center",gap:6,padding:"6px 12px",
          borderRadius:8,cursor:"pointer",background:color+"22",
          color,fontFamily:"'Heebo',sans-serif",fontWeight:700,fontSize:12,
          border:`1px solid ${color}44`,opacity:loading?0.6:1}}>
          {loading?"⏳ טוען...":"📤 בחר קובץ"}
          <input ref={ref} type="file" accept=".xlsx,.xls" onChange={handleChange} style={{display:"none"}}/>
        </label>
      )}
    </div>
  );
}

// ─── CONSTRAINT ENTRY (self-service) ─────────────────────────────────────────
// Workers can enter their own constraints via a simple form keyed by name
function SelfConstraintPanel({workers,constraints,setConstraints,daysInMonth,shifts}) {
  const [selectedWorker,setSelectedWorker]=useState("");
  const [nc,setNc]=useState({type:"unavailable",day:1,shiftId:shifts[0]?.id||""});

  const addC=()=>{
    const w=workers.find(x=>x.id===Number(selectedWorker));
    if(!w) return;
    const wid=w.id;
    setConstraints(prev=>({...prev,[wid]:[
      ...(prev[wid]||[]),
      {...nc,workerId:wid,id:Date.now(),day:Number(nc.day)}
    ]}));
  };

  const removeC=(wid,cid)=>{
    setConstraints(prev=>({...prev,[wid]:(prev[wid]||[]).filter(c=>c.id!==cid)}));
  };

  const getShift=id=>shifts.find(s=>s.id===id);

  return (
    <div>
      <Card style={{marginBottom:16}}>
        <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>🙋 הזנת אילוצים אישיים</div>
        <div style={{fontSize:12,color:"#4B5563",marginBottom:14}}>
          כל עובד יכול לדווח על ימי חופשה, עבודה מהבית, או תורנויות שאינו יכול לעשות.
        </div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
          <div>
            <div style={{fontSize:11,color:"#64748B",marginBottom:3}}>שם עובד</div>
            <Sel value={selectedWorker} onChange={e=>setSelectedWorker(e.target.value)} style={{width:130}}>
              <option value="">בחר...</option>
              {workers.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
            </Sel>
          </div>
          <div>
            <div style={{fontSize:11,color:"#64748B",marginBottom:3}}>סוג</div>
            <Sel value={nc.type} onChange={e=>setNc(c=>({...c,type:e.target.value}))} style={{width:180}}>
              <option value="unavailable">🚫 לא זמין (יום חופשה/מחלה)</option>
              <option value="wfh">🏠 עבודה מהבית</option>
              <option value="shift_off">⛔ לא יכול לתורנות מסוימת</option>
            </Sel>
          </div>
          {nc.type!=="shift_off"?(
            <div>
              <div style={{fontSize:11,color:"#64748B",marginBottom:3}}>יום בחודש</div>
              <Inp type="number" min={1} max={daysInMonth} value={nc.day}
                onChange={e=>setNc(c=>({...c,day:e.target.value}))} style={{width:65}}/>
            </div>
          ):(
            <div>
              <div style={{fontSize:11,color:"#64748B",marginBottom:3}}>תורנות</div>
              <Sel value={nc.shiftId} onChange={e=>setNc(c=>({...c,shiftId:e.target.value}))} style={{width:180}}>
                {shifts.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
              </Sel>
            </div>
          )}
          <Btn onClick={addC} disabled={!selectedWorker}>➕ הוסף</Btn>
        </div>
      </Card>

      {/* List all constraints grouped by worker */}
      {workers.map(w=>{
        const wcs=constraints[w.id]||[];
        if(!wcs.length) return null;
        return (
          <Card key={w.id} style={{marginBottom:10}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:senColor(w.seniority)}}/>
              {w.name}
              <span style={{fontSize:11,color:"#64748B"}}>{senLabel(w.seniority)}</span>
              <span style={{fontSize:11,color:"#475569",marginRight:"auto"}}>{wcs.length} אילוצים</span>
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {wcs.map(c=>{
                const icon=c.type==="unavailable"?"🚫":c.type==="wfh"?"🏠":"⛔";
                const label=c.type==="unavailable"?`יום ${c.day}`:
                            c.type==="wfh"?`מהבית יום ${c.day}`:
                            getShift(c.shiftId)?.label||c.shiftId;
                return (
                  <div key={c.id} style={{display:"flex",alignItems:"center",gap:5,
                    background:"#0F172A",borderRadius:7,padding:"4px 10px",fontSize:12}}>
                    {icon} {label}
                    <button onClick={()=>removeC(w.id,c.id)} style={{
                      background:"none",border:"none",cursor:"pointer",
                      color:"#EF4444",fontSize:15,lineHeight:1,padding:0,marginRight:2}}>×</button>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
      {Object.values(constraints).every(c=>!c.length)&&(
        <Card style={{textAlign:"center",padding:32}}>
          <div style={{fontSize:32,marginBottom:8}}>✅</div>
          <div style={{color:"#64748B",fontSize:13}}>אין אילוצים — כולם פנויים</div>
        </Card>
      )}
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const today=new Date();
  const [year,setYear]=useState(today.getFullYear());
  const [month,setMonth]=useState(today.getMonth());
  const [tab,setTab]=useState("schedule");

  const [workers,setWorkers]=useState([
    {id:1,name:"שחר",seniority:4},{id:2,name:"תהל",seniority:4},
    {id:3,name:"הגר",seniority:3},{id:4,name:"זגורי",seniority:3},{id:5,name:"קשת",seniority:3},
    {id:6,name:"מתן",seniority:2},{id:7,name:"אוריה",seniority:2},
    {id:8,name:"לוטם",seniority:2},{id:9,name:"יעל",seniority:2},
    {id:10,name:"רביד",seniority:1},{id:11,name:"בר",seniority:1},
    {id:12,name:"אמיתי",seniority:1},{id:13,name:"סופיה",seniority:1},
  ]);
  const [shifts,setShifts]=useState(INITIAL_SHIFTS);
  const [constraints,setConstraints]=useState({});

  // Excel state per sheet
  const [alonLoaded,setAlonLoaded]=useState(null);
  const [erkimLoaded,setErkimLoaded]=useState(null);
  const [shaarLoaded,setShaarLoaded]=useState(null);
  const [mergedActive,setMergedActive]=useState(null);
  const [mergedExisting,setMergedExisting]=useState(null);

  const [schedule,setSchedule]=useState(null);
  const [counts,setCounts]=useState({});
  const [dayModal,setDayModal]=useState(null);
  const [editCell,setEditCell]=useState(null);
  const [nw,setNw]=useState({name:"",seniority:1});

  const daysInMonth=getDaysInMonth(year,month);
  const firstDay=getFirstDay(year,month);

  // Merge all loaded sheets whenever any changes
  const remerge=(alon,erkim,shaar)=>{
    const results=[];
    if(alon) results.push({active:alon.active,existing:alon.existing});
    if(erkim) results.push({active:erkim.active,existing:erkim.existing});
    if(shaar) results.push({active:shaar.active,existing:shaar.existing});
    if(results.length===0){setMergedActive(null);setMergedExisting(null);return;}
    const {active,existing}=mergeSheets(results);
    setMergedActive(active);
    setMergedExisting(existing);
    setSchedule(null);
  };

  const handleAlon=async(buf,name)=>{
    const r=parseAlonSheet(buf);
    const days=Object.keys(r.active).length;
    const sh=Object.values(r.active).reduce((a,b)=>a+b.size,0);
    const loaded={name,days,shifts:sh,...r};
    setAlonLoaded(loaded);
    remerge(loaded,erkimLoaded,shaarLoaded);
  };
  const handleErkim=async(buf,name)=>{
    const r=parseErkimSheet(buf);
    const days=Object.keys(r.active).length;
    const sh=Object.values(r.active).reduce((a,b)=>a+b.size,0);
    const loaded={name,days,shifts:sh,...r};
    setErkimLoaded(loaded);
    remerge(alonLoaded,loaded,shaarLoaded);
  };
  const handleShaar=async(buf,name)=>{
    const r=parseShaarSheet(buf);
    const days=Object.keys(r.active).length;
    const sh=Object.values(r.active).reduce((a,b)=>a+b.size,0);
    const loaded={name,days,shifts:sh,...r};
    setShaarLoaded(loaded);
    remerge(alonLoaded,erkimLoaded,loaded);
  };

  const generate=()=>{
    const {schedule:s,counts:c}=smartGenerate(workers,shifts,constraints,year,month,mergedActive);
    setSchedule(s);setCounts(c);
  };

  const prevMonth=()=>{setMonth(m=>{if(m===0){setYear(y=>y-1);return 11;}return m-1;});setSchedule(null);};
  const nextMonth=()=>{setMonth(m=>{if(m===11){setYear(y=>y+1);return 0;}return m+1;});setSchedule(null);};

  const addWorker=()=>{
    if(!nw.name.trim())return;
    setWorkers(ws=>[...ws,{id:Date.now(),name:nw.name.trim(),seniority:nw.seniority}]);
    setNw({name:"",seniority:1});setSchedule(null);
  };
  const removeWorker=id=>{
    setWorkers(ws=>ws.filter(w=>w.id!==id));
    setConstraints(c=>{const n={...c};delete n[id];return n;});
    setSchedule(null);
  };

  const handleCellEdit=(shiftId,newWid)=>{
    setSchedule(prev=>({...prev,[dayModal]:{...prev[dayModal],[shiftId]:newWid===""?null:Number(newWid)}}));
    setEditCell(null);
  };

  const getWorker=id=>workers.find(w=>w.id===id);
  const getShift=id=>shifts.find(s=>s.id===id);
  const dayActiveShifts=day=>{
    if(!mergedActive)return shifts;
    const set=mergedActive[day];
    return set?shifts.filter(s=>set.has(s.id)):[];
  };

  const wfhDays=useMemo(()=>{
    const m={};
    Object.entries(constraints).forEach(([wid,cs])=>{
      cs.filter(c=>c.type==="wfh").forEach(c=>{if(!m[wid])m[wid]=new Set();m[wid].add(c.day);});
    });
    return m;
  },[constraints]);
  const unavailDays=useMemo(()=>{
    const m={};
    Object.entries(constraints).forEach(([wid,cs])=>{
      cs.filter(c=>c.type==="unavailable").forEach(c=>{if(!m[wid])m[wid]=new Set();m[wid].add(c.day);});
    });
    return m;
  },[constraints]);

  const groupStats=useMemo(()=>{
    if(!schedule)return{};
    const stats={};
    [1,2,3,4].forEach(sen=>{
      const group=workers.filter(w=>w.seniority===sen);
      if(!group.length)return;
      const loads=group.map(w=>({w,total:counts[w.id]?.total||0,load:counts[w.id]?.loadTotal||0}));
      stats[sen]={
        loads,
        avgLoad:loads.reduce((a,b)=>a+b.load,0)/loads.length,
        avgTotal:loads.reduce((a,b)=>a+b.total,0)/loads.length,
        maxLoad:Math.max(...loads.map(x=>x.load),1),
      };
    });
    return stats;
  },[counts,workers,schedule]);

  const anyLoaded=alonLoaded||erkimLoaded||shaarLoaded;
  const totalConstraints=Object.values(constraints).reduce((a,b)=>a+b.length,0);

  return (
    <div style={{minHeight:"100vh",background:"#080F1A",fontFamily:"'Heebo',sans-serif",direction:"rtl",color:"#E2E8F0"}}>
      <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet"/>

      {/* HEADER */}
      <div style={{background:"linear-gradient(180deg,#111827,#0D1526)",borderBottom:"1px solid #1F2937",
        padding:"14px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:42,height:42,borderRadius:12,
            background:"linear-gradient(135deg,#3B82F6,#6366F1)",
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:20,boxShadow:"0 0 18px rgba(99,102,241,0.5)"}}>📋</div>
          <div>
            <div style={{fontWeight:900,fontSize:18}}>מנהל תורנויות</div>
            <div style={{fontSize:11,color:"#4B5563"}}>צפון מטכל ועורף · 3 גליונות · ותק + עומס שוויוני</div>
          </div>
        </div>
        <TabBar
          tabs={[["schedule","לוח"],["load","עומס"],["constraints",`אילוצים${totalConstraints>0?` (${totalConstraints})`:""}`],["workers","עובדים"],["shifts","תורנויות"]]}
          active={tab} onChange={setTab}
        />
      </div>

      <div style={{maxWidth:1200,margin:"0 auto",padding:"20px 16px"}}>

        {/* ══ SCHEDULE ══ */}
        {tab==="schedule"&&(
          <div>
            {/* Upload boxes */}
            <Card style={{marginBottom:16}}>
              <div style={{fontWeight:700,fontSize:15,marginBottom:12}}>
                📂 העלאת קבצי אקסל לחודש
                <span style={{fontSize:11,color:"#4B5563",fontWeight:400,marginRight:10}}>
                  העלה 1 עד 3 גליונות — המערכת תרכיב את החודש המלא
                </span>
              </div>
              <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                <UploadBox label="תורנות אולם" color={SHEET_COLOR["אולם"]} icon="🏛️"
                  loaded={alonLoaded} onFile={handleAlon} onClear={()=>{setAlonLoaded(null);remerge(null,erkimLoaded,shaarLoaded);}}/>
                <UploadBox label="תורנות כתיבה / עריקים" color={SHEET_COLOR["כתיבה"]} icon="✍️"
                  loaded={erkimLoaded} onFile={handleErkim} onClear={()=>{setErkimLoaded(null);remerge(alonLoaded,null,shaarLoaded);}}/>
                <UploadBox label="תורנות שער" color={SHEET_COLOR["שער"]} icon="🚪"
                  loaded={shaarLoaded} onFile={handleShaar} onClear={()=>{setShaarLoaded(null);remerge(alonLoaded,erkimLoaded,null);}}/>
              </div>
              {anyLoaded&&(
                <div style={{marginTop:12,fontSize:12,color:"#4B5563"}}>
                  סה"כ: {mergedActive?Object.values(mergedActive).reduce((a,b)=>a+b.size,0):0} תורנויות ורודות ב-{mergedActive?Object.keys(mergedActive).length:0} ימים
                </div>
              )}
            </Card>

            {/* Month nav */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:10}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <Btn onClick={prevMonth} variant="ghost" small>‹</Btn>
                <span style={{fontWeight:900,fontSize:20,minWidth:140,textAlign:"center"}}>{MONTHS_HE[month]} {year}</span>
                <Btn onClick={nextMonth} variant="ghost" small>›</Btn>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                {!anyLoaded&&<span style={{fontSize:11,color:"#F59E0B"}}>⚠️ העלה לפחות קובץ אחד</span>}
                <Btn onClick={generate} disabled={!anyLoaded}>⚡ צור תורנות חכמה</Btn>
              </div>
            </div>

            {!schedule?(
              <Card style={{textAlign:"center",padding:60}}>
                <div style={{fontSize:52,marginBottom:14}}>🗓️</div>
                <div style={{fontWeight:800,fontSize:18,marginBottom:8}}>אין תורנות עדיין</div>
                <div style={{color:"#64748B",fontSize:14}}>
                  {anyLoaded?"לחץ ⚡ לייצור תורנות":"העלה קבצי אקסל תחילה"}
                </div>
              </Card>
            ):(
              <div style={{background:"#111827",borderRadius:18,border:"1px solid #1F2937",overflow:"hidden"}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
                  {DAYS_HE.map(d=>(
                    <div key={d} style={{padding:"10px 0",textAlign:"center",fontSize:11,
                      fontWeight:700,color:"#374151",borderBottom:"1px solid #1F2937"}}>{d}</div>
                  ))}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
                  {Array.from({length:firstDay}).map((_,i)=>(
                    <div key={`e${i}`} style={{minHeight:110,borderLeft:"1px solid #1F2937",borderBottom:"1px solid #1F2937"}}/>
                  ))}
                  {Array.from({length:daysInMonth},(_,i)=>i+1).map(day=>{
                    const isToday=day===today.getDate()&&month===today.getMonth()&&year===today.getFullYear();
                    const dayS=schedule[day]||{};
                    const active=dayActiveShifts(day);
                    const assigned=active.filter(s=>dayS[s.id]!=null).length;
                    const unassigned=active.filter(s=>dayS[s.id]===null).length;
                    const workerIds=[...new Set(active.map(s=>dayS[s.id]).filter(Boolean))];
                    const hasPink=mergedActive&&mergedActive[day]?.size>0;

                    return (
                      <div key={day} onClick={()=>active.length>0&&setDayModal(day)}
                        style={{minHeight:110,borderLeft:"1px solid #1F2937",borderBottom:"1px solid #1F2937",
                          padding:"6px",cursor:active.length>0?"pointer":"default",
                          background:isToday?"rgba(99,102,241,0.08)":hasPink?"rgba(232,93,213,0.04)":"transparent"}}
                        onMouseOver={e=>active.length>0&&(e.currentTarget.style.background="rgba(255,255,255,0.04)")}
                        onMouseOut={e=>e.currentTarget.style.background=isToday?"rgba(99,102,241,0.08)":hasPink?"rgba(232,93,213,0.04)":"transparent"}
                      >
                        <div style={{fontWeight:800,fontSize:12,color:isToday?"#6366F1":hasPink?"#C084FC":"#374151",marginBottom:3}}>
                          {day}{hasPink&&<span style={{fontSize:8,color:"#E49EDD",marginRight:2}}>●</span>}
                        </div>
                        {active.length===0&&mergedActive&&<div style={{fontSize:9,color:"#1E293B",fontStyle:"italic"}}>לא פעיל</div>}
                        <div style={{display:"flex",flexDirection:"column",gap:2}}>
                          {workerIds.slice(0,5).map(wid=>{
                            const w=getWorker(wid); if(!w)return null;
                            const wShifts=active.filter(s=>dayS[s.id]===wid);
                            const load=wShifts.reduce((a,s)=>a+s.hardness,0);
                            return (
                              <div key={wid} style={{background:`${senColor(w.seniority)}22`,
                                color:senColor(w.seniority),borderRadius:3,padding:"1px 4px",fontSize:9,fontWeight:700}}>
                                {w.name} <span style={{opacity:0.6}}>({load})</span>
                              </div>
                            );
                          })}
                          {workerIds.length>5&&<div style={{fontSize:9,color:"#374151"}}>+{workerIds.length-5}</div>}
                          {unassigned>0&&<div style={{fontSize:9,color:"#EF4444",fontWeight:700}}>⚠️{unassigned}</div>}
                        </div>
                        {active.length>0&&<div style={{marginTop:2,fontSize:8,color:"#1E3A5F"}}>{assigned}/{active.length}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ LOAD ══ */}
        {tab==="load"&&(
          <div>
            {!schedule?(
              <Card style={{textAlign:"center",padding:40}}>
                <div style={{fontSize:36,marginBottom:8}}>📊</div>
                <div style={{color:"#64748B"}}>צור תורנות תחילה</div>
              </Card>
            ):(
              [4,3,2,1].map(sen=>{
                const gs=groupStats[sen]; if(!gs)return null;
                return (
                  <div key={sen} style={{marginBottom:24}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                      <div style={{width:10,height:10,borderRadius:"50%",background:senColor(sen)}}/>
                      <span style={{fontWeight:800,fontSize:15,color:senColor(sen)}}>{senLabel(sen)}</span>
                      <span style={{fontSize:12,color:"#475569"}}>
                        ממוצע עומס: <b style={{color:"#E2E8F0"}}>{gs.avgLoad.toFixed(1)}</b> ·
                        ממוצע תורנות: <b style={{color:"#E2E8F0"}}>{gs.avgTotal.toFixed(1)}</b>
                      </span>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10}}>
                      {gs.loads.map(({w,total,load})=>{
                        const maxM=MAX_MONTH[w.seniority];
                        const diffPct=gs.avgLoad>0?Math.round(((load-gs.avgLoad)/gs.avgLoad)*100):0;
                        const diffColor=Math.abs(diffPct)<=10?"#10B981":Math.abs(diffPct)<=20?"#F59E0B":"#EF4444";
                        return (
                          <Card key={w.id} style={{padding:13}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
                              <span style={{fontWeight:800,fontSize:13}}>{w.name}</span>
                              <span style={{fontSize:10,fontWeight:700,color:diffColor,
                                background:`${diffColor}22`,borderRadius:4,padding:"2px 6px"}}>
                                {diffPct>0?"+":""}{diffPct}%
                              </span>
                            </div>
                            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                              <span style={{fontSize:11,color:"#64748B",minWidth:60}}>תורנות</span>
                              <LoadBar value={total} max={maxM} color={senColor(sen)}/>
                              <span style={{fontSize:11,fontWeight:700,minWidth:28}}>{total}</span>
                            </div>
                            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
                              <span style={{fontSize:11,color:"#64748B",minWidth:60}}>עומס</span>
                              <LoadBar value={load} max={gs.maxLoad} color={HARDNESS_COLOR[Math.min(5,Math.ceil(load/(total||1)))]}/>
                              <span style={{fontSize:11,fontWeight:700,minWidth:28}}>{load}</span>
                            </div>
                            <div style={{fontSize:10,color:"#475569",marginBottom:6}}>
                              ממוצע/תורנות: <b style={{color:"#94A3B8"}}>{total>0?(load/total).toFixed(1):"-"}</b>
                            </div>
                            {/* Shift breakdown by sheet */}
                            {SHEETS.map(sh=>{
                              const shShifts=shifts.filter(s=>s.sheet===sh&&(counts[w.id]?.[s.id]||0)>0);
                              if(!shShifts.length)return null;
                              return (
                                <div key={sh} style={{marginBottom:3}}>
                                  <span style={{fontSize:9,color:SHEET_COLOR[sh],fontWeight:700}}>{sh}: </span>
                                  {shShifts.map(s=>(
                                    <span key={s.id} style={{background:s.bg,color:s.dark,
                                      borderRadius:3,padding:"1px 4px",fontSize:9,fontWeight:700,marginLeft:3}}>
                                      {s.label.split(" ")[0]}×{counts[w.id][s.id]}
                                    </span>
                                  ))}
                                </div>
                              );
                            })}
                          </Card>
                        );
                      })}
                    </div>
                    {/* Bar chart */}
                    <div style={{marginTop:10,background:"#111827",borderRadius:12,padding:"12px 16px",border:"1px solid #1F2937"}}>
                      <div style={{fontSize:11,color:"#374151",marginBottom:8,fontWeight:700}}>פיזור עומס</div>
                      <div style={{display:"flex",gap:6,alignItems:"flex-end",height:50}}>
                        {gs.loads.map(({w,load})=>{
                          const h=Math.round((load/gs.maxLoad)*100);
                          const ok=Math.abs(load-gs.avgLoad)<=gs.avgLoad*0.15;
                          return (
                            <div key={w.id} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,flex:1}}>
                              <div style={{fontSize:9,color:ok?senColor(sen):"#EF4444",fontWeight:700}}>{load}</div>
                              <div style={{width:"100%",minHeight:4,height:`${Math.max(h,4)}%`,
                                background:ok?senColor(sen):"#EF4444",borderRadius:"3px 3px 0 0"}}/>
                              <span style={{fontSize:8,color:"#374151",fontWeight:700}}>{w.name}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ══ CONSTRAINTS (self-service) ══ */}
        {tab==="constraints"&&(
          <SelfConstraintPanel
            workers={workers} constraints={constraints}
            setConstraints={(c)=>{setConstraints(c);setSchedule(null);}}
            daysInMonth={daysInMonth} shifts={shifts}
          />
        )}

        {/* ══ WORKERS ══ */}
        {tab==="workers"&&(
          <div>
            <Card style={{marginBottom:16}}>
              <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>➕ הוספת עובד</div>
              <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
                <div>
                  <div style={{fontSize:11,color:"#64748B",marginBottom:3}}>שם</div>
                  <Inp value={nw.name} placeholder="שם העובד" onChange={e=>setNw(n=>({...n,name:e.target.value}))} style={{width:140}}/>
                </div>
                <div>
                  <div style={{fontSize:11,color:"#64748B",marginBottom:3}}>שנת ותק</div>
                  <Sel value={nw.seniority} onChange={e=>setNw(n=>({...n,seniority:Number(e.target.value)}))}>
                    <option value={4}>שנה רביעית</option>
                    <option value={3}>שנה שלישית</option>
                    <option value={2}>שנה שניה</option>
                    <option value={1}>שנה ראשונה</option>
                  </Sel>
                </div>
                <Btn onClick={addWorker}>הוסף</Btn>
              </div>
            </Card>
            {[4,3,2,1].map(sen=>{
              const group=workers.filter(w=>w.seniority===sen);
              if(!group.length)return null;
              return (
                <div key={sen} style={{marginBottom:16}}>
                  <div style={{fontSize:12,fontWeight:700,color:senColor(sen),marginBottom:8,display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:senColor(sen)}}/>
                    {senLabel(sen)} · עד {MAX_MONTH[sen]}/חודש · מקס׳ {MAX_DAY[sen]}/יום
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:10}}>
                    {group.map(w=>(
                      <Card key={w.id} style={{padding:13,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                        <div style={{display:"flex",alignItems:"center",gap:9}}>
                          <div style={{width:34,height:34,borderRadius:"50%",
                            background:`hsl(${(w.id*67)%360},55%,48%)`,
                            display:"flex",alignItems:"center",justifyContent:"center",
                            fontWeight:800,fontSize:13,color:"#fff",flexShrink:0}}>{w.name[0]}</div>
                          <div>
                            <div style={{fontWeight:700,fontSize:13}}>{w.name}</div>
                            <div style={{fontSize:10,color:"#475569"}}>
                              {(constraints[w.id]||[]).length>0&&`${(constraints[w.id]||[]).length} אילוצים`}
                            </div>
                          </div>
                        </div>
                        <button onClick={()=>removeWorker(w.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#374151",fontSize:18}}>×</button>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ══ SHIFTS ══ */}
        {tab==="shifts"&&(
          <div>
            <Card style={{marginBottom:16,background:"#0B111E",border:"1px dashed #1E3A5F"}}>
              <div style={{fontWeight:700,fontSize:13,marginBottom:6}}>⚙️ חוקי שיבוץ לפי תורנות</div>
              <div style={{color:"#4B5563",fontSize:12,lineHeight:1.8}}>
                • <b style={{color:"#94A3B8"}}>קושי 1–5</b>: משפיע על עדיפות שיבוץ ועל חישוב עומס אישי<br/>
                • <b style={{color:"#94A3B8"}}>לא לשבץ לשנה</b>: חסימה מוחלטת לאותו שנתון<br/>
                • <b style={{color:"#94A3B8"}}>מינימום ותק</b>: דרישת ניסיון מינימלית (למשל הרכב=שנה 2+)
              </div>
            </Card>
            {SHEETS.map(sh=>(
              <div key={sh} style={{marginBottom:20}}>
                <div style={{fontSize:13,fontWeight:800,color:SHEET_COLOR[sh],marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:10,height:10,borderRadius:"50%",background:SHEET_COLOR[sh]}}/>
                  תורנויות {sh}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(255px,1fr))",gap:10}}>
                  {shifts.filter(s=>s.sheet===sh).map(s=>(
                    <Card key={s.id} style={{padding:13}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                        <div style={{width:9,height:9,borderRadius:"50%",background:s.color,flexShrink:0}}/>
                        <span style={{fontWeight:700,fontSize:13}}>{s.label}</span>
                      </div>
                      <div style={{marginBottom:8}}>
                        <div style={{fontSize:10,color:"#64748B",marginBottom:4}}>קושי</div>
                        <HardnessPicker value={s.hardness}
                          onChange={h=>setShifts(ss=>ss.map(t=>t.id===s.id?{...t,hardness:h}:t))}/>
                      </div>
                      <div style={{marginBottom:8}}>
                        <div style={{fontSize:10,color:"#64748B",marginBottom:4}}>לא לשבץ לשנה:</div>
                        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                          {[4,3,2,1].map(sen=>{
                            const r=s.seniorRestrict.includes(sen);
                            return (
                              <button key={sen} onClick={()=>setShifts(ss=>ss.map(t=>t.id===s.id?{...t,seniorRestrict:r?t.seniorRestrict.filter(x=>x!==sen):[...t.seniorRestrict,sen]}:t))}
                                style={{padding:"2px 7px",borderRadius:5,border:"none",cursor:"pointer",
                                  fontSize:10,fontWeight:700,
                                  background:r?`${senColor(sen)}33`:"#0F172A",
                                  color:r?senColor(sen):"#374151"}}>שנה {sen}</button>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <div style={{fontSize:10,color:"#64748B",marginBottom:4}}>מינימום ותק:</div>
                        <div style={{display:"flex",gap:4}}>
                          {[1,2,3,4].map(sen=>(
                            <button key={sen} onClick={()=>setShifts(ss=>ss.map(t=>t.id===s.id?{...t,minSeniority:sen}:t))}
                              style={{padding:"2px 7px",borderRadius:5,border:"none",cursor:"pointer",
                                fontSize:10,fontWeight:700,
                                background:s.minSeniority===sen?senColor(sen):"#0F172A",
                                color:s.minSeniority===sen?"#fff":"#374151"}}>שנה {sen}</button>
                          ))}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ══ DAY MODAL ══ */}
      {dayModal!==null&&schedule&&(
        <div onClick={()=>{setDayModal(null);setEditCell(null);}}
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",zIndex:300,
            display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#111827",border:"1px solid #1F2937",
            borderRadius:20,padding:24,width:"100%",maxWidth:560,maxHeight:"88vh",overflowY:"auto",direction:"rtl"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div>
                <div style={{fontWeight:900,fontSize:20}}>{dayModal} {MONTHS_HE[month]} {year}</div>
                <div style={{fontSize:12,color:"#4B5563"}}>{DAYS_HE[new Date(year,month,dayModal).getDay()]} · לחץ לעריכה</div>
              </div>
              <button onClick={()=>setDayModal(null)} style={{background:"none",border:"none",color:"#6B7280",fontSize:24,cursor:"pointer"}}>×</button>
            </div>

            {/* WFH / unavail */}
            {(()=>{
              const wfhToday=workers.filter(w=>wfhDays[w.id]?.has(dayModal));
              const unavailToday=workers.filter(w=>unavailDays[w.id]?.has(dayModal));
              return (wfhToday.length>0||unavailToday.length>0)&&(
                <div style={{background:"#0F172A",borderRadius:10,padding:"8px 14px",marginBottom:12,fontSize:12,display:"flex",gap:12,flexWrap:"wrap"}}>
                  {wfhToday.length>0&&<span>🏠 {wfhToday.map(w=>w.name).join(", ")}</span>}
                  {unavailToday.length>0&&<span style={{color:"#EF4444"}}>🚫 {unavailToday.map(w=>w.name).join(", ")}</span>}
                </div>
              );
            })()}

            {/* Existing from Excel */}
            {mergedExisting?.[dayModal]&&Object.keys(mergedExisting[dayModal]).length>0&&(
              <div style={{background:"#0F172A",borderRadius:10,padding:"8px 14px",marginBottom:12,border:"1px solid #E49EDD44"}}>
                <div style={{fontSize:11,color:"#E49EDD",fontWeight:700,marginBottom:5}}>🌸 שיבוצים מהאקסל:</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {Object.entries(mergedExisting[dayModal]).map(([sid,name])=>{
                    const s=getShift(sid);
                    return s&&name?(
                      <span key={sid} style={{background:"#E49EDD22",color:"#E49EDD",borderRadius:5,padding:"2px 8px",fontSize:11,fontWeight:600}}>
                        {s.label}: {name}
                      </span>
                    ):null;
                  })}
                </div>
              </div>
            )}

            {/* Shifts grouped by sheet */}
            {SHEETS.map(sh=>{
              const shShifts=dayActiveShifts(dayModal).filter(s=>s.sheet===sh);
              if(!shShifts.length)return null;
              return (
                <div key={sh} style={{marginBottom:12}}>
                  <div style={{fontSize:11,fontWeight:700,color:SHEET_COLOR[sh],marginBottom:6}}>
                    {sh==="אולם"?"🏛️":sh==="כתיבה"?"✍️":"🚪"} {sh}
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:5}}>
                    {shShifts.map(shift=>{
                      const wid=schedule[dayModal]?.[shift.id];
                      const worker=wid?getWorker(wid):null;
                      const isEditing=editCell===shift.id;
                      return (
                        <div key={shift.id} style={{background:"#0F172A",borderRadius:10,padding:"9px 12px",
                          border:`1px solid ${worker?shift.color+"40":"#450a0a55"}`,
                          display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,flex:1,minWidth:0}}>
                            <div style={{width:7,height:7,borderRadius:"50%",background:shift.color,flexShrink:0}}/>
                            <span style={{fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{shift.label}</span>
                            <span style={{fontSize:9,color:HARDNESS_COLOR[shift.hardness],fontWeight:700,flexShrink:0}}>●{shift.hardness}</span>
                          </div>
                          {isEditing?(
                            <Sel value={wid??""} onChange={e=>handleCellEdit(shift.id,e.target.value)} style={{fontSize:12,padding:"4px 8px"}}>
                              <option value="">— לא משובץ —</option>
                              {workers.map(w=><option key={w.id} value={w.id}>{w.name} (שנה {w.seniority})</option>)}
                            </Sel>
                          ):(
                            <div style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer"}} onClick={()=>setEditCell(shift.id)}>
                              {worker?(
                                <span style={{background:shift.bg,color:shift.dark,borderRadius:6,
                                  padding:"3px 10px",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:4}}>
                                  {worker.name}
                                  <span style={{fontSize:9,opacity:0.7}}>שנה {worker.seniority}</span>
                                </span>
                              ):(
                                <span style={{fontSize:12,color:"#EF4444",fontWeight:600}}>⚠️ לא משובץ</span>
                              )}
                              <span style={{fontSize:12,color:"#374151"}}>✏️</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Worker load today */}
            <div style={{marginTop:14,borderTop:"1px solid #1F2937",paddingTop:12}}>
              <div style={{fontSize:12,color:"#374151",marginBottom:8,fontWeight:700}}>עומס עובדים היום</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {workers.map(w=>{
                  const wShifts=dayActiveShifts(dayModal).filter(s=>schedule[dayModal]?.[s.id]===w.id);
                  if(!wShifts.length)return null;
                  const load=wShifts.reduce((a,s)=>a+s.hardness,0);
                  return (
                    <div key={w.id} style={{background:"#1E293B",borderRadius:8,padding:"5px 10px",fontSize:11}}>
                      <b style={{color:senColor(w.seniority)}}>{w.name}</b>
                      <span style={{color:"#64748B"}}> · {wShifts.length} · עומס </span>
                      <b style={{color:HARDNESS_COLOR[Math.min(5,load)]}}>{load}</b>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
