import { useState, useMemo, useEffect } from "react";
import { getActiveShiftsByDay } from "./juneData.js";
import { WORKERS, SHIFTS, MONTHS_HE, DAYS_HE, HARDNESS_COLOR, MAX_MONTH, MAX_DAY, senColor, senLabel, SHEET_COLOR } from "./constants.js";
import { api } from "./api.js";
 
// ─── STORAGE ──────────────────────────────────────────────────────────────────
function saveSchedule(year, month, schedule, counts) {
  try {
    const key = `schedule_${year}_${month}`;
    localStorage.setItem(key, JSON.stringify({ schedule, counts, savedAt: new Date().toISOString() }));
  } catch(e) { console.warn("save failed", e); }
}
 
function loadSchedule(year, month) {
  try {
    const key = `schedule_${year}_${month}`;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
 
function clearSchedule(year, month) {
  try { localStorage.removeItem(`schedule_${year}_${month}`); } catch {}
}
 
// ─── SCHEDULER ────────────────────────────────────────────────────────────────
function getDaysInMonth(y,m){return new Date(y,m+1,0).getDate();}
function getFirstDay(y,m){return new Date(y,m,1).getDay();}
 
// shuffle מוסיף אקראיות — רנדום seed שונה בכל הרצה
function shuffled(arr, seed) {
  const a = [...arr];
  for (let i = a.length-1; i > 0; i--) {
    const j = Math.floor((Math.sin(seed + i) * 0.5 + 0.5) * (i+1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
 
function smartGenerate(workers, shifts, constraints, year, month, activeShiftsByDay, seed) {
  const days = getDaysInMonth(year, month);
  const schedule = {};
  const counts = {};
 
  workers.forEach(w => {
    counts[w.id] = { total: 0, loadTotal: 0 };
    shifts.forEach(s => { counts[w.id][s.id] = 0; });
  });
 
  const seniorityLoadTarget = { 4: 1.0, 3: 1.4, 2: 1.8, 1: 2.2 };
 
  for (let d = 1; d <= days; d++) {
    schedule[d] = {};
    const todayCount = {};
    workers.forEach(w => { todayCount[w.id] = 0; });
 
    const activeSet = activeShiftsByDay?.[d];
    const dayShifts = activeSet ? shifts.filter(s => activeSet.has(s.id)) : shifts;
    if (!dayShifts.length) continue;
 
    const sorted = [...dayShifts].sort((a,b) => b.hardness - a.hardness);
 
    for (const shift of sorted) {
      let eligible = workers
        .filter(w => {
          if (shift.seniorRestrict.includes(w.seniority)) return false;
          if (w.seniority < (shift.minSeniority || 1)) return false;
          if (todayCount[w.id] >= (MAX_DAY[w.seniority] || 2)) return false;
          if (counts[w.id].total >= (MAX_MONTH[w.seniority] || 20)) return false;
          const cs = constraints[w.id] || [];
          for (const c of cs) {
            if (c.type === "unavailable" && c.day === d) return false;
            if (c.type === "unavailable_weekday") {
              if (c.weekday === new Date(year, month, d).getDay()) return false;
            }
            if (c.type === "shift_off" && c.shiftLabel === shift.label) return false;
          }
          return true;
        });
 
      // מיון: עומס + גיוון + קצת אקראיות (seed שונה בכל הרצה)
      eligible = eligible.sort((a,b) => {
        const targetA = seniorityLoadTarget[a.seniority] || 1;
        const targetB = seniorityLoadTarget[b.seniority] || 1;
        const loadRatioA = counts[a.id].loadTotal / (MAX_MONTH[a.seniority] * targetA);
        const loadRatioB = counts[b.id].loadTotal / (MAX_MONTH[b.seniority] * targetB);
 
        if (a.seniority === b.seniority) {
          const diversityA = counts[a.id][shift.id] / Math.max(counts[a.id].total, 1);
          const diversityB = counts[b.id][shift.id] / Math.max(counts[b.id].total, 1);
          // 50% עומס, 30% גיוון, 20% אקראיות
          const randA = (Math.sin(seed * a.id * d) * 0.5 + 0.5) * 0.2;
          const randB = (Math.sin(seed * b.id * d) * 0.5 + 0.5) * 0.2;
          return (0.5*loadRatioA + 0.3*diversityA + randA) - (0.5*loadRatioB + 0.3*diversityB + randB);
        }
 
        if (shift.hardness >= 4) return a.seniority - b.seniority;
        if (shift.hardness <= 2) return b.seniority - a.seniority;
        return loadRatioA - loadRatioB;
      });
 
      const fallback = eligible.length > 0 ? eligible : workers
        .filter(w => {
          const cs = constraints[w.id] || [];
          return !cs.some(c => c.type==="unavailable" && c.day===d) &&
                 todayCount[w.id] < (MAX_DAY[w.seniority] || 2) &&
                 w.seniority >= (shift.minSeniority || 1);
        })
        .sort((a,b) => (counts[a.id].loadTotal/MAX_MONTH[a.seniority]) - (counts[b.id].loadTotal/MAX_MONTH[b.seniority]));
 
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
const Card = ({children,style={},onClick}) => (
  <div onClick={onClick} style={{background:"#1E293B",border:"1px solid #334155",borderRadius:16,padding:18,cursor:onClick?"pointer":"default",...style}}>{children}</div>
);
const Btn = ({children,onClick,variant="primary",small,disabled,style={}}) => (
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
const Sel = ({value,onChange,children,style={}}) => (
  <select value={value} onChange={onChange} style={{padding:"8px 12px",borderRadius:8,border:"1px solid #334155",background:"#0F172A",color:"#E2E8F0",fontFamily:"'Heebo',sans-serif",fontSize:13,outline:"none",...style}}>
    {children}
  </select>
);
const TabBar = ({tabs,active,onChange}) => (
  <div style={{display:"flex",gap:3,background:"#0F172A",borderRadius:10,padding:3,flexWrap:"wrap"}}>
    {tabs.map(([id,label]) => (
      <button key={id} onClick={()=>onChange(id)} style={{
        padding:"6px 13px",borderRadius:7,border:"none",cursor:"pointer",
        fontFamily:"'Heebo',sans-serif",fontWeight:700,fontSize:12,
        background:active===id?"linear-gradient(135deg,#3B82F6,#6366F1)":"transparent",
        color:active===id?"#fff":"#64748B",
      }}>{label}</button>
    ))}
  </div>
);
 
// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function ManagerApp() {
  const today = new Date();
  const [year,setYear]   = useState(today.getFullYear());
  const [month,setMonth] = useState(today.getMonth());
  const [tab,setTab]     = useState("schedule");
 
  const [workers]  = useState(WORKERS);
  const [shifts]   = useState(SHIFTS);
  const [constraints,setConstraints]   = useState({});
  const [loadingConstraints,setLoadingConstraints] = useState(false);
  const [mergedActive,setMergedActive] = useState(() => getActiveShiftsByDay(today.getFullYear(), today.getMonth()));
 
  const [schedule,setSchedule]   = useState(null);
  const [counts,setCounts]       = useState({});
  const [savedAt,setSavedAt]     = useState(null);
  const [dayModal,setDayModal]   = useState(null);
  const [workerModal,setWorkerModal] = useState(null);
  const [editCell,setEditCell]   = useState(null);
  const [printMode,setPrintMode] = useState(false);
 
  const monthKey    = `${year}-${String(month+1).padStart(2,"0")}`;
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay    = getFirstDay(year, month);
 
  // טוען תורנות שמורה בכניסה / חילופי חודש
  useEffect(() => {
    const active = getActiveShiftsByDay(year, month);
    setMergedActive(active);
    const saved = loadSchedule(year, month);
    if (saved) {
      setSchedule(saved.schedule);
      setCounts(saved.counts);
      setSavedAt(saved.savedAt);
    } else {
      setSchedule(null);
      setCounts({});
      setSavedAt(null);
    }
  }, [year, month]);
 
  const loadConstraints = async () => {
    setLoadingConstraints(true);
    const res = await api.getConstraints(monthKey);
    if (res.ok) {
      const byId = {};
      for (const [name, cs] of Object.entries(res.constraints || {})) {
        const w = workers.find(x => x.name === name);
        if (!w) continue;
        byId[w.id] = cs.map(c => ({...c, workerId: w.id}));
      }
      setConstraints(byId);
    }
    setLoadingConstraints(false);
  };
 
  const generate = () => {
    const active = getActiveShiftsByDay(year, month);
    setMergedActive(active);
    // seed שונה בכל הרצה — מבטיח סימולציה שונה
    const seed = Date.now() % 10000;
    const {schedule:s, counts:c} = smartGenerate(workers, shifts, constraints, year, month, active, seed);
    setSchedule(s);
    setCounts(c);
    saveSchedule(year, month, s, c);
    setSavedAt(new Date().toISOString());
  };
 
  const clearAndRegenerate = () => {
    if (window.confirm("למחוק את התורנות הנוכחית וליצור חדשה?")) {
      clearSchedule(year, month);
      generate();
    }
  };
 
  const prevMonth = () => { setMonth(m => { if(m===0){setYear(y=>y-1);return 11;} return m-1; }); };
  const nextMonth = () => { setMonth(m => { if(m===11){setYear(y=>y+1);return 0;} return m+1; }); };
 
  const handleCellEdit = (shiftId, newWid) => {
    const newSchedule = {...schedule, [dayModal]: {...schedule[dayModal], [shiftId]: newWid===""?null:Number(newWid)}};
    setSchedule(newSchedule);
    saveSchedule(year, month, newSchedule, counts);
    setEditCell(null);
  };
 
  const getWorker = id => workers.find(w => w.id === id);
  const dayActiveShifts = day => {
    if (!mergedActive) return shifts;
    const set = mergedActive[day];
    return set ? shifts.filter(s => set.has(s.id)) : [];
  };
 
  const anyLoaded = getActiveShiftsByDay(year, month) !== null;
 
  const groupStats = useMemo(() => {
    if (!schedule) return {};
    const stats = {};
    [1,2,3,4].forEach(sen => {
      const group = workers.filter(w => w.seniority === sen);
      if (!group.length) return;
      const loads = group.map(w => ({w, total: counts[w.id]?.total||0, load: counts[w.id]?.loadTotal||0}));
      stats[sen] = {
        loads,
        avgLoad:  loads.reduce((a,b)=>a+b.load, 0)/loads.length,
        avgTotal: loads.reduce((a,b)=>a+b.total,0)/loads.length,
        maxLoad:  Math.max(...loads.map(x=>x.load),1),
      };
    });
    return stats;
  }, [counts, workers, schedule]);
 
  // ── PRINT VIEW ──────────────────────────────────────────────────────────────
  if (printMode && schedule) {
    return (
      <div style={{background:"#fff",color:"#000",fontFamily:"'Heebo',sans-serif",direction:"rtl",padding:24,minHeight:"100vh"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h2 style={{margin:0,fontSize:20}}>תורנויות {MONTHS_HE[month]} {year} — צפון מטכל ועורף</h2>
          <button onClick={()=>setPrintMode(false)} style={{padding:"6px 14px",borderRadius:8,border:"1px solid #ccc",cursor:"pointer",background:"#f5f5f5"}}>← חזור</button>
        </div>
        {Array.from({length:daysInMonth},(_,i)=>i+1).map(day => {
          const active = dayActiveShifts(day);
          if (!active.length) return null;
          const dow = new Date(year,month,day).getDay();
          return (
            <div key={day} style={{marginBottom:16,pageBreakInside:"avoid"}}>
              <div style={{fontWeight:800,fontSize:15,borderBottom:"2px solid #000",paddingBottom:4,marginBottom:8}}>
                {DAYS_HE[dow]} {day}.{month+1}.{year}
              </div>
              {["אולם","כתיבה","שער"].map(sh => {
                const shShifts = active.filter(s => s.sheet===sh);
                if (!shShifts.length) return null;
                return (
                  <div key={sh} style={{marginBottom:8}}>
                    <div style={{fontWeight:700,fontSize:13,color:SHEET_COLOR[sh],marginBottom:4}}>{sh}:</div>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                      <tbody>
                        {shShifts.map(shift => {
                          const wid = schedule[day]?.[shift.id];
                          const worker = wid ? getWorker(wid) : null;
                          return (
                            <tr key={shift.id} style={{borderBottom:"1px solid #eee"}}>
                              <td style={{padding:"3px 8px",fontWeight:600,width:"50%"}}>{shift.label}</td>
                              <td style={{padding:"3px 8px",color:worker?"#000":"#EF4444"}}>
                                {worker ? worker.name : "⚠️ לא משובץ"}
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
 
  return (
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
        <TabBar tabs={[["schedule","לוח"],["load","עומס"]]} active={tab} onChange={setTab}/>
      </div>
 
      <div style={{maxWidth:1200,margin:"0 auto",padding:"20px 16px"}}>
 
        {/* ══ SCHEDULE ══ */}
        {tab==="schedule" && (
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:10}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <Btn onClick={prevMonth} variant="ghost" small>‹</Btn>
                <span style={{fontWeight:900,fontSize:20,minWidth:140,textAlign:"center"}}>{MONTHS_HE[month]} {year}</span>
                <Btn onClick={nextMonth} variant="ghost" small>›</Btn>
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                <Btn onClick={loadConstraints} variant="ghost" small disabled={loadingConstraints}>
                  {loadingConstraints?"⏳ טוען...":"🔄 טען אילוצים"}
                </Btn>
                {Object.keys(constraints).length>0&&(
                  <span style={{fontSize:11,color:"#10B981"}}>✅ {Object.values(constraints).reduce((a,b)=>a+b.length,0)} אילוצים</span>
                )}
                {schedule&&<Btn onClick={()=>setPrintMode(true)} variant="ghost" small>🖨️ רשימה</Btn>}
                {schedule ? (
                  <Btn onClick={clearAndRegenerate} small style={{background:"linear-gradient(135deg,#7C3AED,#6366F1)"}}>🔀 סימולציה חדשה</Btn>
                ) : (
                  <Btn onClick={generate} disabled={!anyLoaded}>⚡ צור תורנות</Btn>
                )}
              </div>
            </div>
 
            {/* תורנות שמורה */}
            {savedAt && (
              <div style={{fontSize:11,color:"#475569",marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
                💾 נשמר: {new Date(savedAt).toLocaleString("he-IL")}
                <button onClick={()=>{clearSchedule(year,month);setSchedule(null);setCounts({});setSavedAt(null);}}
                  style={{background:"none",border:"none",cursor:"pointer",color:"#EF4444",fontSize:11,padding:0}}>
                  (מחק)
                </button>
              </div>
            )}
 
            {!schedule ? (
              <Card style={{textAlign:"center",padding:60}}>
                <div style={{fontSize:52,marginBottom:14}}>🗓️</div>
                <div style={{fontWeight:800,fontSize:18,marginBottom:8}}>אין תורנות עדיין</div>
                <div style={{color:"#64748B",fontSize:14,marginBottom:20}}>לחץ ⚡ לייצור תורנות</div>
                <Btn onClick={generate} disabled={!anyLoaded}>⚡ צור תורנות</Btn>
              </Card>
            ) : (
              <div style={{background:"#111827",borderRadius:18,border:"1px solid #1F2937",overflow:"hidden"}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
                  {DAYS_HE.map(d=>(
                    <div key={d} style={{padding:"10px 0",textAlign:"center",fontSize:11,fontWeight:700,color:"#374151",borderBottom:"1px solid #1F2937"}}>{d}</div>
                  ))}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
                  {Array.from({length:firstDay}).map((_,i)=>(
                    <div key={`e${i}`} style={{minHeight:110,borderLeft:"1px solid #1F2937",borderBottom:"1px solid #1F2937"}}/>
                  ))}
                  {Array.from({length:daysInMonth},(_,i)=>i+1).map(day=>{
                    const isToday = day===today.getDate()&&month===today.getMonth()&&year===today.getFullYear();
                    const active  = dayActiveShifts(day);
                    const assigned   = active.filter(s=>schedule[day]?.[s.id]!=null).length;
                    const unassigned = active.filter(s=>schedule[day]?.[s.id]===null).length;
                    const workerIds  = [...new Set(active.map(s=>schedule[day]?.[s.id]).filter(Boolean))];
                    const hasPink    = mergedActive&&mergedActive[day]?.size>0;
                    const unavailToday = workers.filter(w=>(constraints[w.id]||[]).some(c=>c.type==="unavailable"&&c.day===day));
                    return (
                      <div key={day} onClick={()=>active.length>0&&setDayModal(day)}
                        style={{minHeight:110,borderLeft:"1px solid #1F2937",borderBottom:"1px solid #1F2937",
                          padding:"5px",cursor:active.length>0?"pointer":"default",
                          background:isToday?"rgba(99,102,241,0.08)":hasPink?"rgba(232,93,213,0.04)":"transparent"}}
                        onMouseOver={e=>active.length>0&&(e.currentTarget.style.background="rgba(255,255,255,0.04)")}
                        onMouseOut={e=>e.currentTarget.style.background=isToday?"rgba(99,102,241,0.08)":hasPink?"rgba(232,93,213,0.04)":"transparent"}
                      >
                        <div style={{fontWeight:800,fontSize:12,color:isToday?"#6366F1":hasPink?"#C084FC":"#374151",marginBottom:2}}>
                          {day}{hasPink&&<span style={{fontSize:8,color:"#E49EDD",marginRight:2}}>●</span>}
                        </div>
                        {unavailToday.length>0&&(
                          <div style={{fontSize:8,color:"#EF4444",marginBottom:2,fontWeight:700}}>
                            🚫 {unavailToday.map(w=>w.name).join(", ")}
                          </div>
                        )}
                        {active.length===0&&mergedActive&&<div style={{fontSize:9,color:"#1E293B",fontStyle:"italic"}}>לא פעיל</div>}
                        <div style={{display:"flex",flexDirection:"column",gap:2}}>
                          {workerIds.slice(0,4).map(wid=>{
                            const w=getWorker(wid);if(!w)return null;
                            const wShifts=active.filter(s=>schedule[day]?.[s.id]===wid);
                            const load=wShifts.reduce((a,s)=>a+s.hardness,0);
                            return (
                              <div key={wid} style={{background:`${senColor(w.seniority)}22`,color:senColor(w.seniority),borderRadius:3,padding:"1px 4px",fontSize:9,fontWeight:700}}>
                                {w.name} <span style={{opacity:0.6}}>({load})</span>
                              </div>
                            );
                          })}
                          {workerIds.length>4&&<div style={{fontSize:9,color:"#374151"}}>+{workerIds.length-4}</div>}
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
        {tab==="load" && (
          <div>
            {!schedule?(
              <Card style={{textAlign:"center",padding:40}}>
                <div style={{fontSize:36,marginBottom:8}}>📊</div>
                <div style={{color:"#64748B"}}>צור תורנות תחילה</div>
              </Card>
            ):(
              [4,3,2,1].map(sen=>{
                const gs=groupStats[sen];if(!gs)return null;
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
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10}}>
                      {gs.loads.map(({w,total,load})=>{
                        const maxM=MAX_MONTH[w.seniority];
                        const diffPct=gs.avgLoad>0?Math.round(((load-gs.avgLoad)/gs.avgLoad)*100):0;
                        const diffColor=Math.abs(diffPct)<=10?"#10B981":Math.abs(diffPct)<=20?"#F59E0B":"#EF4444";
                        return (
                          <Card key={w.id} style={{padding:12}} onClick={()=>setWorkerModal(w.id)}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                              <span style={{fontWeight:800,fontSize:13}}>{w.name}</span>
                              <span style={{fontSize:10,fontWeight:700,color:diffColor,background:`${diffColor}22`,borderRadius:4,padding:"2px 6px"}}>
                                {diffPct>0?"+":""}{diffPct}%
                              </span>
                            </div>
                            <div style={{fontSize:11,color:"#64748B",marginBottom:4}}>{total}/{maxM} · עומס {load}</div>
                            <div style={{height:4,borderRadius:2,background:"#0F172A",overflow:"hidden"}}>
                              <div style={{height:"100%",borderRadius:2,width:`${Math.min(100,(load/gs.maxLoad)*100)}%`,background:senColor(sen)}}/>
                            </div>
                            <div style={{fontSize:9,color:"#475569",marginTop:5}}>לחץ לפרטים</div>
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
 
      {/* ══ DAY MODAL ══ */}
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
 
      {/* ══ WORKER MODAL ══ */}
      {workerModal!==null&&schedule&&(()=>{
        const w=workers.find(x=>x.id===workerModal);
        if(!w)return null;
        const allDays=[];
        for(let d=1;d<=daysInMonth;d++){
          const dayShifts=dayActiveShifts(d).filter(s=>schedule[d]?.[s.id]===w.id);
          if(dayShifts.length>0)allDays.push({d,shifts:dayShifts});
        }
        return (
          <div onClick={()=>setWorkerModal(null)}
            style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
            <div onClick={e=>e.stopPropagation()} style={{background:"#111827",border:"1px solid #1F2937",borderRadius:20,padding:24,width:"100%",maxWidth:480,maxHeight:"88vh",overflowY:"auto",direction:"rtl"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <div>
                  <div style={{fontWeight:900,fontSize:20}}>{w.name}</div>
                  <div style={{fontSize:12,color:"#4B5563"}}>
                    {senLabel(w.seniority)} · {allDays.reduce((a,b)=>a+b.shifts.length,0)} תורנויות · עומס {counts[w.id]?.loadTotal||0}
                  </div>
                </div>
                <button onClick={()=>setWorkerModal(null)} style={{background:"none",border:"none",color:"#6B7280",fontSize:24,cursor:"pointer"}}>×</button>
              </div>
              {allDays.length===0?(
                <div style={{textAlign:"center",padding:30,color:"#64748B"}}>אין תורנויות החודש</div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {allDays.map(({d,shifts})=>(
                    <div key={d} style={{background:"#0F172A",borderRadius:10,padding:"10px 14px"}}>
                      <div style={{fontSize:12,fontWeight:700,color:"#64748B",marginBottom:6}}>
                        {DAYS_HE[new Date(year,month,d).getDay()]} {d}.{month+1}
                      </div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                        {shifts.map(s=>(
                          <span key={s.id} style={{background:s.bg,color:s.dark,borderRadius:6,padding:"3px 10px",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:4}}>
                            {s.label}
                            <span style={{fontSize:9,color:HARDNESS_COLOR[s.hardness]}}>●{s.hardness}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}