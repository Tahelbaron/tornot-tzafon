import { useState, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { getActiveShiftsByDay } from "./juneData.js";
import { WORKERS, SHIFTS, MONTHS_HE, DAYS_HE, HARDNESS_COLOR, MAX_MONTH, MAX_DAY, senColor, senLabel, SHEET_COLOR } from "./constants.js";
import { api } from "./api.js";

// ─── EXCEL PARSERS ────────────────────────────────────────────────────────────
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
  {match:["א","משמרת א"],id:"s1"},{match:["ב","משמרת ב"],id:"s2"},{match:["עתודה"],id:"s3"},
];

function matchCol(header,map){
  if(!header)return null;
  const h=String(header).trim().toLowerCase();
  for(const{match,id}of map)if(match.some(m=>h.includes(m.toLowerCase())))return id;
  return null;
}
function parseDay(v){
  if(!v)return null;
  const m=String(v).match(/(\d{1,2})\.(\d{1,2})\./);
  return m?parseInt(m[1],10):null;
}

function parseSheet(buf,map,pinkColor){
  const wb=XLSX.read(buf,{type:"array",cellStyles:true});
  const ws=wb.Sheets[wb.SheetNames[0]];
  const range=XLSX.utils.decode_range(ws["!ref"]||"A1");
  const colMap={};
  for(let c=range.s.c;c<=range.e.c;c++){
    const cell=ws[XLSX.utils.encode_cell({r:0,c})];
    if(cell?.v){const id=matchCol(cell.v,map);if(id)colMap[c]=id;}
  }
  const active={};
  for(let r=1;r<=range.e.r;r++){
    const dateCell=ws[XLSX.utils.encode_cell({r,c:1})];
    const day=parseDay(dateCell?.v);if(!day)continue;
    if(!active[day])active[day]=new Set();
    for(let c=2;c<=range.e.c;c++){
      const sid=colMap[c];if(!sid)continue;
      const cell=ws[XLSX.utils.encode_cell({r,c})];if(!cell)continue;
      const rgb=cell.s?.fgColor?.rgb||cell.s?.fgColor?.argb;
      if(rgb===pinkColor)active[day].add(sid);
    }
  }
  return active;
}

function parseErkim(buf){
  const wb=XLSX.read(buf,{type:"array",cellStyles:true});
  const ws=wb.Sheets[wb.SheetNames[0]];
  const range=XLSX.utils.decode_range(ws["!ref"]||"A1");
  const active={};
  const COL_SHIFT={6:"e1",7:"e2"};
  for(let r=2;r<=range.e.r;r++){
    const dateCell=ws[XLSX.utils.encode_cell({r,c:1})];
    const day=parseDay(dateCell?.v);if(!day)continue;
    if(!active[day])active[day]=new Set();
    for(const[colIdx,sid]of Object.entries(COL_SHIFT)){
      const cell=ws[XLSX.utils.encode_cell({r,c:parseInt(colIdx)})];if(!cell)continue;
      const rgb=cell.s?.fgColor?.rgb||cell.s?.fgColor?.argb;
      if(rgb===PINK_ERKIM)active[day].add(sid);
    }
  }
  return active;
}

function mergeActive(results){
  const active={};
  for(const a of results){
    for(const[day,set]of Object.entries(a)){
      if(!active[day])active[day]=new Set();
      for(const sid of set)active[day].add(sid);
    }
  }
  return active;
}

// ─── SCHEDULER ────────────────────────────────────────────────────────────────
function getDaysInMonth(y,m){return new Date(y,m+1,0).getDate();}
function getFirstDay(y,m){return new Date(y,m,1).getDay();}

function smartGenerate(workers,shifts,constraints,year,month,activeShiftsByDay){
  const days = new Date(year, month + 1, 0).getDate();
  const schedule = {};
  const counts = {}; // counts[wid][sid] = כמה פעמים עשה את התורנות הזו
 
  workers.forEach(w => {
    counts[w.id] = { total: 0, loadTotal: 0 };
    shifts.forEach(s => { counts[w.id][s.id] = 0; });
  });
 
  // יעד עומס לפי שנתון — מנורמל לפי מספר העובדים בשנתון
  // ככל שהשנתון צעיר יותר — יעד עומס גבוה יותר
  const seniorityLoadTarget = { 4: 1.0, 3: 1.4, 2: 1.8, 1: 2.2 };
 
  for (let d = 1; d <= days; d++) {
    schedule[d] = {};
    const todayCount = {};
    workers.forEach(w => { todayCount[w.id] = 0; });
 
    const activeSet = activeShiftsByDay?.[d];
    const dayShifts = activeSet
      ? shifts.filter(s => activeSet.has(s.id))
      : shifts;
    if (!dayShifts.length) continue;
 
    // קשות ראשון
    const sorted = [...dayShifts].sort((a, b) => b.hardness - a.hardness);
 
    for (const shift of sorted) {
      const eligible = workers
        .filter(w => {
          if (shift.seniorRestrict.includes(w.seniority)) return false;
          if (w.seniority < (shift.minSeniority || 1)) return false;
          if (todayCount[w.id] >= ({ 4:1, 3:2, 2:2, 1:2 }[w.seniority] || 2)) return false;
          if (counts[w.id].total >= ({ 4:14, 3:17, 2:20, 1:24 }[w.seniority] || 20)) return false;
          const cs = constraints[w.id] || [];
          for (const c of cs) {
            if (c.type === "unavailable" && c.day === d) return false;
            if (c.type === "unavailable_weekday") {
              const dow = new Date(year, month, d).getDay();
              if (c.weekday === dow) return false;
            }
            if (c.type === "shift_off" && c.shiftLabel === shift.label) return false;
          }
          return true;
        })
        .sort((a, b) => {
          // 1. עדיפות לעומס נמוך יחסית לשנתון
          const targetA = seniorityLoadTarget[a.seniority] || 1;
          const targetB = seniorityLoadTarget[b.seniority] || 1;
          const maxMonth = { 4:14, 3:17, 2:20, 1:24 };
          const loadRatioA = counts[a.id].loadTotal / (maxMonth[a.seniority] * targetA);
          const loadRatioB = counts[b.id].loadTotal / (maxMonth[b.seniority] * targetB);
 
          // 2. בתוך אותו שנתון — גיוון: עדיפות למי שעשה פחות מהתורנות הזו
          if (a.seniority === b.seniority) {
            const diversityA = counts[a.id][shift.id] / Math.max(counts[a.id].total, 1);
            const diversityB = counts[b.id][shift.id] / Math.max(counts[b.id].total, 1);
            // משקל 60% עומס, 40% גיוון
            const scoreA = 0.6 * loadRatioA + 0.4 * diversityA;
            const scoreB = 0.6 * loadRatioB + 0.4 * diversityB;
            return scoreA - scoreB;
          }
 
          // 3. בין שנתונים — קשה → צעיר קודם, קל → ותיק קודם
          if (shift.hardness >= 4) return a.seniority - b.seniority;
          if (shift.hardness <= 2) return b.seniority - a.seniority;
          return loadRatioA - loadRatioB;
        });
 
      const fallback = eligible.length > 0 ? eligible : workers
        .filter(w => {
          const cs = constraints[w.id] || [];
          return !cs.some(c => c.type === "unavailable" && c.day === d) &&
                 todayCount[w.id] < ({ 4:1, 3:2, 2:2, 1:2 }[w.seniority] || 2) &&
                 w.seniority >= (shift.minSeniority || 1);
        })
        .sort((a, b) => {
          const maxMonth = { 4:14, 3:17, 2:20, 1:24 };
          return (counts[a.id].loadTotal / maxMonth[a.seniority]) -
                 (counts[b.id].loadTotal / maxMonth[b.seniority]);
        });
 
      if (fallback.length > 0) {
        const w = fallback[0];
        schedule[d][shift.id] = w.id;
        counts[w.id][shift.id]++;
        counts[w.id].total++;
        counts[w.id].loadTotal += shift.hardness;
        todayCount[w.id]++;
      } else {
        schedule[d][shift.id] = null;
      }
    }
  }
 
  return { schedule, counts };
}

// ─── UI ATOMS ─────────────────────────────────────────────────────────────────
const Card=({children,style={}})=>(
  <div style={{background:"#1E293B",border:"1px solid #334155",borderRadius:16,padding:18,...style}}>{children}</div>
);
const Btn=({children,onClick,variant="primary",small,disabled,style={}})=>(
  <button onClick={onClick} disabled={disabled} style={{
    padding:small?"5px 12px":"9px 20px",borderRadius:8,cursor:disabled?"not-allowed":"pointer",
    fontFamily:"'Heebo',sans-serif",fontWeight:700,fontSize:small?12:13,
    background:variant==="primary"?"linear-gradient(135deg,#3B82F6,#6366F1)":"transparent",
    color:variant==="ghost"?"#94A3B8":"#fff",
    border:variant==="ghost"?"1px solid #334155":"none",
    boxShadow:variant==="primary"?"0 3px 10px rgba(99,102,241,0.35)":"none",
    opacity:disabled?0.5:1,...style,
  }}>{children}</button>
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

function UploadBox({label,color,icon,loaded,onFile,onClear}){
  const ref=useRef();
  const[loading,setLoading]=useState(false);
  const handleChange=async(e)=>{
    const f=e.target.files?.[0];if(!f)return;
    setLoading(true);
    const buf=await f.arrayBuffer();
    onFile(buf,f.name);
    setLoading(false);
    e.target.value="";
  };
  return(
    <div style={{flex:1,minWidth:150,border:`1px solid ${loaded?"#10B981":"#334155"}`,
      borderRadius:12,padding:14,background:loaded?"#10B98111":"#0F172A"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
        <span style={{fontSize:16}}>{icon}</span>
        <span style={{fontWeight:700,fontSize:12,color}}>{label}</span>
      </div>
      {loaded?(
        <div>
          <div style={{fontSize:11,color:"#10B981",fontWeight:600,marginBottom:3}}>✅ {loaded.name}</div>
          <div style={{fontSize:10,color:"#4B5563"}}>{loaded.days} ימים</div>
          <button onClick={onClear} style={{marginTop:4,fontSize:10,color:"#EF4444",background:"none",border:"none",cursor:"pointer",padding:0}}>הסר ×</button>
        </div>
      ):(
        <label style={{display:"inline-flex",alignItems:"center",gap:6,padding:"6px 10px",
          borderRadius:8,cursor:"pointer",background:color+"22",color,
          fontFamily:"'Heebo',sans-serif",fontWeight:700,fontSize:11,opacity:loading?0.6:1}}>
          {loading?"⏳":"📤"} בחר קובץ
          <input ref={ref} type="file" accept=".xlsx,.xls" onChange={handleChange} style={{display:"none"}}/>
        </label>
      )}
    </div>
  );
}

// ─── MAIN MANAGER APP ─────────────────────────────────────────────────────────
export default function ManagerApp(){
  const today=new Date();
  const[year,setYear]=useState(today.getFullYear());
  const[month,setMonth]=useState(today.getMonth());
  const[tab,setTab]=useState("schedule");
  const[workers]=useState(WORKERS);
  const[shifts]=useState(SHIFTS);
  const[constraints,setConstraints]=useState({});
  const[loadingConstraints,setLoadingConstraints]=useState(false);
  const[alonLoaded,setAlonLoaded]=useState(null);
  const[erkimLoaded,setErkimLoaded]=useState(null);
  const[shaarLoaded,setShaarLoaded]=useState(null);
  const[mergedActive,setMergedActive]=useState(null);
  const[schedule,setSchedule]=useState(null);
  const[counts,setCounts]=useState({});
  const[dayModal,setDayModal]=useState(null);
  const[editCell,setEditCell]=useState(null);
  const[printMode,setPrintMode]=useState(false);

  const monthKey=`${year}-${String(month+1).padStart(2,"0")}`;
  const daysInMonth=getDaysInMonth(year,month);
  const firstDay=getFirstDay(year,month);

  const remerge=(a,e,s)=>{
    const results=[];
    if(a)results.push(a.active);
    if(e)results.push(e.active);
    if(s)results.push(s.active);
if(!results.length){
  setMergedActive(getActiveShiftsByDay(year, month));
  setSchedule(null);
  return;
}const fromExcel = mergeActive(results);
const fromStatic = getActiveShiftsByDay(year, month);
setMergedActive(Object.keys(fromExcel).length > 0 ? fromExcel : fromStatic);
    setSchedule(null);
  };

  const handleAlon=async(buf,name)=>{
    const active=parseSheet(buf,ALON_MAP,PINK_ALON);
    const loaded={name,days:Object.keys(active).length,active};
    setAlonLoaded(loaded);remerge(loaded,erkimLoaded,shaarLoaded);
  };
  const handleErkim=async(buf,name)=>{
    const active=parseErkim(buf);
    const loaded={name,days:Object.keys(active).length,active};
    setErkimLoaded(loaded);remerge(alonLoaded,loaded,shaarLoaded);
  };
  const handleShaar=async(buf,name)=>{
    const active=parseSheet(buf,SHAAR_MAP,PINK_ALON);
    const loaded={name,days:Object.keys(active).length,active};
    setShaarLoaded(loaded);remerge(alonLoaded,erkimLoaded,loaded);
  };

  const loadConstraints=async()=>{
    setLoadingConstraints(true);
    const res=await api.getConstraints(monthKey);
    if(res.ok){
      // Convert from name-based to id-based
      const byId={};
      for(const[name,cs]of Object.entries(res.constraints||{})){
        const w=workers.find(x=>x.name===name);
        if(!w)continue;
        byId[w.id]=cs.map(c=>({...c,workerId:w.id}));
      }
      setConstraints(byId);
    }
    setLoadingConstraints(false);
  };

  const generate=()=>{
    const{schedule:s,counts:c}=smartGenerate(workers,shifts,constraints,year,month,mergedActive);
    setSchedule(s);setCounts(c);
  };

  const prevMonth=()=>{setMonth(m=>{if(m===0){setYear(y=>y-1);return 11;}return m-1;});setSchedule(null);};
  const nextMonth=()=>{setMonth(m=>{if(m===11){setYear(y=>y+1);return 0;}return m+1;});setSchedule(null);};

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

  const anyLoaded = alonLoaded || erkimLoaded || shaarLoaded || getActiveShiftsByDay(year, month) !== null;;

  // ── PRINT VIEW ──────────────────────────────────────────────────────────────
  if(printMode&&schedule){
    return(
      <div style={{background:"#fff",color:"#000",fontFamily:"'Heebo',sans-serif",direction:"rtl",padding:24,minHeight:"100vh"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h2 style={{margin:0,fontSize:20}}>תורנויות {MONTHS_HE[month]} {year} — צפון מטכל ועורף</h2>
          <button onClick={()=>setPrintMode(false)} style={{padding:"6px 14px",borderRadius:8,border:"1px solid #ccc",cursor:"pointer",background:"#f5f5f5"}}>← חזור</button>
        </div>
        {Array.from({length:daysInMonth},(_,i)=>i+1).map(day=>{
          const active=dayActiveShifts(day);
          if(!active.length)return null;
          const dow=new Date(year,month,day).getDay();
          return(
            <div key={day} style={{marginBottom:16,pageBreakInside:"avoid"}}>
              <div style={{fontWeight:800,fontSize:15,borderBottom:"2px solid #000",paddingBottom:4,marginBottom:8}}>
                {DAYS_HE[dow]} {day}.{month+1}.{year}
              </div>
              {["אולם","כתיבה","שער"].map(sh=>{
                const shShifts=active.filter(s=>s.sheet===sh);
                if(!shShifts.length)return null;
                return(
                  <div key={sh} style={{marginBottom:8}}>
                    <div style={{fontWeight:700,fontSize:13,color:SHEET_COLOR[sh],marginBottom:4}}>{sh}:</div>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                      <tbody>
                        {shShifts.map(shift=>{
                          const wid=schedule[day]?.[shift.id];
                          const worker=wid?getWorker(wid):null;
                          return(
                            <tr key={shift.id} style={{borderBottom:"1px solid #eee"}}>
                              <td style={{padding:"3px 8px",fontWeight:600,width:"50%"}}>{shift.label}</td>
                              <td style={{padding:"3px 8px",color:worker?"#000":"#EF4444"}}>
                                {worker?worker.name:"⚠️ לא משובץ"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  }

  return(
    <div style={{minHeight:"100vh",background:"#080F1A",fontFamily:"'Heebo',sans-serif",direction:"rtl",color:"#E2E8F0"}}>
      <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet"/>

      {/* HEADER */}
      <div style={{background:"linear-gradient(180deg,#111827,#0D1526)",borderBottom:"1px solid #1F2937",padding:"14px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:42,height:42,borderRadius:12,background:"linear-gradient(135deg,#3B82F6,#6366F1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>📋</div>
          <div>
            <div style={{fontWeight:900,fontSize:18}}>ניהול תורנויות</div>
            <div style={{fontSize:11,color:"#4B5563"}}>צפון מטכל ועורף</div>
          </div>
        </div>
        <TabBar
          tabs={[["schedule","לוח"],["load","עומס"]]}
          active={tab} onChange={setTab}
        />
      </div>

      <div style={{maxWidth:1200,margin:"0 auto",padding:"20px 16px"}}>

        {tab==="schedule"&&(
          <div>
        
            {/* Month nav */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:10}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <Btn onClick={prevMonth} variant="ghost" small>‹</Btn>
                <span style={{fontWeight:900,fontSize:20,minWidth:140,textAlign:"center"}}>{MONTHS_HE[month]} {year}</span>
                <Btn onClick={nextMonth} variant="ghost" small>›</Btn>
              </div>
             <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
  <Btn onClick={loadConstraints} variant="ghost" small disabled={loadingConstraints}>
    {loadingConstraints?"⏳ טוען...":"🔄 טען אילוצים"}
  </Btn>
  {Object.keys(constraints).length>0&&(
    <span style={{fontSize:11,color:"#10B981",alignSelf:"center"}}>
      ✅ {Object.values(constraints).reduce((a,b)=>a+b.length,0)} אילוצים
    </span>
  )}
  {schedule&&<Btn onClick={()=>setPrintMode(true)} variant="ghost" small>🖨️ רשימה להדפסה</Btn>}
  <Btn onClick={generate} disabled={!anyLoaded}>⚡ צור תורנות</Btn>
</div>
            </div>

            {!schedule?(
              <Card style={{textAlign:"center",padding:60}}>
                <div style={{fontSize:52,marginBottom:14}}>🗓️</div>
                <div style={{fontWeight:800,fontSize:18,marginBottom:8}}>אין תורנות עדיין</div>
                <div style={{color:"#64748B",fontSize:14}}>{anyLoaded?"לחץ ⚡ לייצור":"העלה קבצי אקסל תחילה"}</div>
              </Card>
            ):(
              <div style={{background:"#111827",borderRadius:18,border:"1px solid #1F2937",overflow:"hidden"}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
                  {DAYS_HE.map(d=>(
                    <div key={d} style={{padding:"10px 0",textAlign:"center",fontSize:11,fontWeight:700,color:"#374151",borderBottom:"1px solid #1F2937"}}>{d}</div>
                  ))}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
                  {Array.from({length:firstDay}).map((_,i)=>(
                    <div key={`e${i}`} style={{minHeight:100,borderLeft:"1px solid #1F2937",borderBottom:"1px solid #1F2937"}}/>
                  ))}
                  {Array.from({length:daysInMonth},(_,i)=>i+1).map(day=>{
                    const isToday=day===today.getDate()&&month===today.getMonth()&&year===today.getFullYear();
                    const active=dayActiveShifts(day);
                    const assigned=active.filter(s=>schedule[day]?.[s.id]!=null).length;
                    const unassigned=active.filter(s=>schedule[day]?.[s.id]===null).length;
                    const workerIds=[...new Set(active.map(s=>schedule[day]?.[s.id]).filter(Boolean))];
                    const hasPink=mergedActive&&mergedActive[day]?.size>0;
                    return(
                      <div key={day} onClick={()=>active.length>0&&setDayModal(day)}
                        style={{minHeight:100,borderLeft:"1px solid #1F2937",borderBottom:"1px solid #1F2937",
                          padding:"6px",cursor:active.length>0?"pointer":"default",
                          background:isToday?"rgba(99,102,241,0.08)":hasPink?"rgba(232,93,213,0.04)":"transparent"}}
                        onMouseOver={e=>active.length>0&&(e.currentTarget.style.background="rgba(255,255,255,0.04)")}
                        onMouseOut={e=>e.currentTarget.style.background=isToday?"rgba(99,102,241,0.08)":hasPink?"rgba(232,93,213,0.04)":"transparent"}
                      >
                        <div style={{fontWeight:800,fontSize:12,color:isToday?"#6366F1":hasPink?"#C084FC":"#374151",marginBottom:3}}>
                          {day}{hasPink&&<span style={{fontSize:8,color:"#E49EDD",marginRight:2}}>●</span>}
                        </div>
                        {(() => {
  const unavail = workers.filter(w => {
    const cs = constraints[w.id] || [];
    return cs.some(c => c.type === "unavailable" && c.day === day);
  });
  return unavail.length > 0 ? (
    <div style={{fontSize:8,color:"#EF4444",marginBottom:2,fontWeight:700}}>
      🚫 {unavail.map(w=>w.name).join(", ")}
    </div>
  ) : null;
})()}
                        {active.length===0&&mergedActive&&<div style={{fontSize:9,color:"#1E293B",fontStyle:"italic"}}>לא פעיל</div>}
                        <div style={{display:"flex",flexDirection:"column",gap:2}}>
                          {workerIds.slice(0,5).map(wid=>{
                            const w=getWorker(wid);if(!w)return null;
                            const wShifts=active.filter(s=>schedule[day]?.[s.id]===wid);
                            const load=wShifts.reduce((a,s)=>a+s.hardness,0);
                            return(
                              <div key={wid} style={{background:`${senColor(w.seniority)}22`,color:senColor(w.seniority),borderRadius:3,padding:"1px 4px",fontSize:9,fontWeight:700}}>
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

        {tab==="load"&&(
          <div>
            {!schedule?(
              <Card style={{textAlign:"center",padding:40}}>
                <div style={{fontSize:36,marginBottom:8}}>📊</div>
                <div style={{color:"#64748B"}}>צור תורנות תחילה</div>
              </Card>
            ):(
              [4,3,2,1].map(sen=>{
                const group=workers.filter(w=>w.seniority===sen);
                if(!group.length)return null;
                const loads=group.map(w=>({w,total:counts[w.id]?.total||0,load:counts[w.id]?.loadTotal||0}));
                const avgLoad=loads.reduce((a,b)=>a+b.load,0)/loads.length;
                const maxLoad=Math.max(...loads.map(x=>x.load),1);
                return(
                  <div key={sen} style={{marginBottom:24}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                      <div style={{width:10,height:10,borderRadius:"50%",background:senColor(sen)}}/>
                      <span style={{fontWeight:800,fontSize:15,color:senColor(sen)}}>{senLabel(sen)}</span>
                      <span style={{fontSize:12,color:"#475569"}}>
                        ממוצע עומס: <b style={{color:"#E2E8F0"}}>{avgLoad.toFixed(1)}</b>
                      </span>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10}}>
                      {loads.map(({w,total,load})=>{
                        const maxM=MAX_MONTH[w.seniority];
                        const diffPct=avgLoad>0?Math.round(((load-avgLoad)/avgLoad)*100):0;
                        const diffColor=Math.abs(diffPct)<=10?"#10B981":Math.abs(diffPct)<=20?"#F59E0B":"#EF4444";
                        return(
                          <Card key={w.id} style={{padding:12}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                              <span style={{fontWeight:800,fontSize:13}}>{w.name}</span>
                              <span style={{fontSize:10,fontWeight:700,color:diffColor,background:`${diffColor}22`,borderRadius:4,padding:"2px 6px"}}>
                                {diffPct>0?"+":""}{diffPct}%
                              </span>
                            </div>
                            <div style={{fontSize:11,color:"#64748B",marginBottom:4}}>{total}/{maxM} תורנות · עומס {load}</div>
                            <div style={{height:4,borderRadius:2,background:"#0F172A",overflow:"hidden"}}>
                              <div style={{height:"100%",borderRadius:2,width:`${Math.min(100,(load/maxLoad)*100)}%`,background:senColor(sen)}}/>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* DAY MODAL */}
      {dayModal!==null&&schedule&&(
        <div onClick={()=>{setDayModal(null);setEditCell(null);}}
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#111827",border:"1px solid #1F2937",borderRadius:20,padding:24,width:"100%",maxWidth:560,maxHeight:"88vh",overflowY:"auto",direction:"rtl"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div>
                <div style={{fontWeight:900,fontSize:20}}>{dayModal} {MONTHS_HE[month]} {year}</div>
                <div style={{fontSize:12,color:"#4B5563"}}>{DAYS_HE[new Date(year,month,dayModal).getDay()]} · לחץ לעריכה</div>
              </div>
              <button onClick={()=>setDayModal(null)} style={{background:"none",border:"none",color:"#6B7280",fontSize:24,cursor:"pointer"}}>×</button>
            </div>
            {["אולם","כתיבה","שער"].map(sh=>{
              const shShifts=dayActiveShifts(dayModal).filter(s=>s.sheet===sh);
              if(!shShifts.length)return null;
              return(
                <div key={sh} style={{marginBottom:12}}>
                  <div style={{fontSize:11,fontWeight:700,color:SHEET_COLOR[sh],marginBottom:6}}>
                    {sh==="אולם"?"🏛️":sh==="כתיבה"?"✍️":"🚪"} {sh}
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:5}}>
                    {shShifts.map(shift=>{
                      const wid=schedule[dayModal]?.[shift.id];
                      const worker=wid?getWorker(wid):null;
                      const isEditing=editCell===shift.id;
                      return(
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
                                <span style={{background:shift.bg,color:shift.dark,borderRadius:6,padding:"3px 10px",fontSize:12,fontWeight:700}}>
                                  {worker.name} <span style={{fontSize:9,opacity:0.7}}>שנה {worker.seniority}</span>
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
          </div>
        </div>
      )}
    </div>
  );
}
