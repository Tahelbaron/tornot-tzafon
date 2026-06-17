import { useState, useMemo, useEffect } from "react";
import { WORKERS as INITIAL_WORKERS, SHIFTS, MONTHS_HE, DAYS_HE, HARDNESS_COLOR, MAX_MONTH, MAX_DAY, MAX_DAY_ALON, senColor, senLabel, SHEET_COLOR } from "./constants.js";
import { api } from "./api.js";

// ─── STORAGE ──────────────────────────────────────────────────────────────────
function saveSchedule(y,m,s,c){try{localStorage.setItem(`schedule_${y}_${m}`,JSON.stringify({schedule:s,counts:c,savedAt:new Date().toISOString()}));}catch{}}
function loadSchedule(y,m){try{const r=localStorage.getItem(`schedule_${y}_${m}`);return r?JSON.parse(r):null;}catch{return null;}}
function clearSchedule(y,m){try{localStorage.removeItem(`schedule_${y}_${m}`);}catch{}}
function saveWorkers(w){try{localStorage.setItem("workers",JSON.stringify(w));}catch{}}
function loadWorkers(){try{const r=localStorage.getItem("workers");return r?JSON.parse(r):null;}catch{return null;}}
function loadActiveShifts(y,m){
  try{
    const r=localStorage.getItem(`activeShifts_${y}_${m}`);
    if(!r)return null;
    const parsed=JSON.parse(r);
    const result={};
    for(const[day,shifts]of Object.entries(parsed)) result[Number(day)]=new Set(shifts);
    return result;
  }catch{return null;}
}

// ─── SCHEDULER ────────────────────────────────────────────────────────────────
function getDaysInMonth(y,m){return new Date(y,m+1,0).getDate();}
function getFirstDay(y,m){return new Date(y,m,1).getDay();}

const NEEDS_PREP = new Set(["a1","a3","a4","a5","a6","a7","a8","a9","a10"]);

// מגבלות גיוון חודשיות לפי תורנות
const SHIFT_MAX = {
  "a1": 1, // מעצרים — מקסימום 1
  "a2": 1, // פיצול — מקסימום 1
};
// שער א+ב ביחד — מקסימום 1 (נספר ב-shaarCount)

function getPrevWorkday(y,m,d){
  const dow=new Date(y,m,d).getDay();
  return dow===0?d-3:d-1;
}

function smartGenerate(workers,shifts,constraints,year,month,activeShiftsByDay,seed){
  const days=getDaysInMonth(year,month);
  const schedule={};
  const counts={};
  // counts[wid][sid] = כמה פעמים עשה, plus special counters
  workers.forEach(w=>{
    counts[w.id]={total:0,loadTotal:0,shaarCount:0};
    shifts.forEach(s=>{counts[w.id][s.id]=0;});
  });

  const senTarget={4:1.0,3:1.4,2:1.8,1:2.2};

  for(let d=1;d<=days;d++){
    schedule[d]={};
    const todayCount={};
    const alonCount={};
    workers.forEach(w=>{todayCount[w.id]=0;alonCount[w.id]=0;});

    const activeSet=activeShiftsByDay?.[d];
    const dayShifts=activeSet?shifts.filter(s=>activeSet.has(s.id)):shifts;
    if(!dayShifts.length) continue;
    const sorted=[...dayShifts].sort((a,b)=>b.hardness-a.hardness);

    for(const shift of sorted){
      const prevDay=getPrevWorkday(year,month,d);

      const eligible=workers.filter(w=>{
        if(shift.seniorRestrict.includes(w.seniority)) return false;
        if(w.seniority<(shift.minSeniority||1)) return false;
        if(todayCount[w.id]>=(MAX_DAY[w.seniority]||2)) return false;
        if(counts[w.id].total>=(MAX_MONTH[w.seniority]||20)) return false;
        // אחת ביום באולם
        if(shift.sheet==="אולם"&&alonCount[w.id]>=(MAX_DAY_ALON?.[w.seniority]||1)) return false;
        // מגבלות גיוון
        if(SHIFT_MAX[shift.id]&&counts[w.id][shift.id]>=(SHIFT_MAX[shift.id])) return false;
        // שער א+ב — מקסימום 1 ביחד
        if((shift.id==="s1"||shift.id==="s2")&&counts[w.id].shaarCount>=1) return false;
        // חוק יום לפני
        const cs=constraints[w.id]||[];
        for(const c of cs){
          if((c.type==="military"||c.type==="personal"||c.type==="unavailable")&&c.day===d) return false;
          if(NEEDS_PREP.has(shift.id)&&prevDay>=1){
            if((c.type==="military"||c.type==="personal"||c.type==="unavailable")&&c.day===prevDay) return false;
          }
        }
        return true;
      }).sort((a,b)=>{
        const tA=senTarget[a.seniority]||1, tB=senTarget[b.seniority]||1;
        const lA=counts[a.id].loadTotal/(MAX_MONTH[a.seniority]*tA);
        const lB=counts[b.id].loadTotal/(MAX_MONTH[b.seniority]*tB);
        if(a.seniority===b.seniority){
          // גיוון: עדיפות למי שעשה פחות מהתורנות הזו יחסית לסך הכל
          const dvA=counts[a.id][shift.id]/Math.max(counts[a.id].total,1);
          const dvB=counts[b.id][shift.id]/Math.max(counts[b.id].total,1);
          const rA=(Math.sin(seed*a.id*d*shift.id.charCodeAt(0))*0.5+0.5)*0.15;
          const rB=(Math.sin(seed*b.id*d*shift.id.charCodeAt(0))*0.5+0.5)*0.15;
          return(0.45*lA+0.4*dvA+rA)-(0.45*lB+0.4*dvB+rB);
        }
        if(shift.hardness>=4) return a.seniority-b.seniority;
        if(shift.hardness<=2) return b.seniority-a.seniority;
        return lA-lB;
      });

      let chosen=eligible[0], isConflict=false;
      if(!chosen){
        // fallback — שים מישהו גם על אילוץ
        const fb=workers.filter(w=>{
          if(shift.sheet==="אולם"&&alonCount[w.id]>=(MAX_DAY_ALON?.[w.seniority]||1)) return false;
          return todayCount[w.id]<(MAX_DAY[w.seniority]||2)&&w.seniority>=(shift.minSeniority||1);
        }).sort((a,b)=>(counts[a.id].loadTotal/MAX_MONTH[a.seniority])-(counts[b.id].loadTotal/MAX_MONTH[b.seniority]));
        chosen=fb[0]; isConflict=!!chosen;
      }

      if(chosen){
        schedule[d][shift.id]=chosen.id;
        if(isConflict) schedule[d][`${shift.id}_conflict`]=true;
        counts[chosen.id][shift.id]++;
        counts[chosen.id].total++;
        counts[chosen.id].loadTotal+=shift.hardness;
        todayCount[chosen.id]++;
        if(shift.sheet==="אולם") alonCount[chosen.id]++;
        if(shift.id==="s1"||shift.id==="s2") counts[chosen.id].shaarCount++;
      }else{
        schedule[d][shift.id]=null;
      }
    }
  }
  return{schedule,counts};
}

// ─── UI ATOMS ─────────────────────────────────────────────────────────────────
const Card=({children,style={},onClick})=>(<div onClick={onClick} style={{background:"#1E293B",border:"1px solid #334155",borderRadius:16,padding:18,cursor:onClick?"pointer":"default",...style}}>{children}</div>);
const Btn=({children,onClick,variant="primary",small,disabled,style={}})=>(<button onClick={onClick} disabled={disabled} style={{padding:small?"5px 12px":"9px 20px",borderRadius:8,cursor:disabled?"not-allowed":"pointer",fontFamily:"'Heebo',sans-serif",fontWeight:700,fontSize:small?12:13,background:variant==="primary"?"linear-gradient(135deg,#3B82F6,#6366F1)":"transparent",color:variant==="ghost"?"#94A3B8":"#fff",border:variant==="ghost"?"1px solid #334155":"none",boxShadow:variant==="primary"?"0 3px 10px rgba(99,102,241,0.35)":"none",opacity:disabled?0.5:1,...style}}>{children}</button>);
const Sel=({value,onChange,children,style={}})=>(<select value={value} onChange={onChange} style={{padding:"8px 12px",borderRadius:8,border:"1px solid #334155",background:"#0F172A",color:"#E2E8F0",fontFamily:"'Heebo',sans-serif",fontSize:13,outline:"none",...style}}>{children}</select>);
const Inp=({value,onChange,placeholder,style={}})=>(<input value={value} onChange={onChange} placeholder={placeholder} style={{padding:"8px 12px",borderRadius:8,border:"1px solid #334155",background:"#0F172A",color:"#E2E8F0",fontFamily:"'Heebo',sans-serif",fontSize:13,outline:"none",...style}}/>);
const TabBar=({tabs,active,onChange})=>(<div style={{display:"flex",gap:3,background:"#0F172A",borderRadius:10,padding:3,flexWrap:"wrap"}}>{tabs.map(([id,label])=>(<button key={id} onClick={()=>onChange(id)} style={{padding:"6px 13px",borderRadius:7,border:"none",cursor:"pointer",fontFamily:"'Heebo',sans-serif",fontWeight:700,fontSize:12,background:active===id?"linear-gradient(135deg,#3B82F6,#6366F1)":"transparent",color:active===id?"#fff":"#64748B"}}>{label}</button>))}</div>);

function DeadlineEditor(){
  const stored=localStorage.getItem("deadline");
  const[deadline,setDeadline]=useState(stored||"2026-07-20");
  const[saved,setSaved]=useState(false);
  const save=()=>{localStorage.setItem("deadline",deadline);setSaved(true);setTimeout(()=>setSaved(false),2000);};
  return(
    <div style={{background:"#1E293B",border:"1px solid #334155",borderRadius:14,padding:16,marginBottom:16}}>
      <div style={{fontWeight:700,fontSize:14,marginBottom:10}}>⏰ דדליין הגשת אילוצים</div>
      <div style={{display:"flex",gap:10,alignItems:"center"}}>
        <input type="date" value={deadline} onChange={e=>setDeadline(e.target.value)} style={{padding:"8px 12px",borderRadius:8,border:"1px solid #334155",background:"#0F172A",color:"#E2E8F0",fontFamily:"'Heebo',sans-serif",fontSize:13,outline:"none"}}/>
        <Btn onClick={save} small>{saved?"✅ נשמר!":"שמור"}</Btn>
      </div>
    </div>
  );
}

export default function ManagerApp(){
  const today=new Date();
  const[year,setYear]=useState(today.getFullYear());
  const[month,setMonth]=useState(today.getMonth());
  const[tab,setTab]=useState("schedule");
  const[workers,setWorkers]=useState(()=>loadWorkers()||INITIAL_WORKERS);
  const[shifts]=useState(SHIFTS);
  const[constraints,setConstraints]=useState({});
  const[loadingConstraints,setLoadingConstraints]=useState(false);
  const[mergedActive,setMergedActive]=useState(null);
  const[schedule,setSchedule]=useState(null);
  const[counts,setCounts]=useState({});
  const[savedAt,setSavedAt]=useState(null);
  const[dayModal,setDayModal]=useState(null);
  const[workerModal,setWorkerModal]=useState(null);
  const[constraintsModal,setConstraintsModal]=useState(null);
  const[editCell,setEditCell]=useState(null);
  const[printMode,setPrintMode]=useState(false);
  const[newWorkerName,setNewWorkerName]=useState("");
  const[newWorkerSeniority,setNewWorkerSeniority]=useState(1);

  const monthKey=`${year}-${String(month+1).padStart(2,"0")}`;
  const daysInMonth=getDaysInMonth(year,month);
  const firstDay=getFirstDay(year,month);

  useEffect(()=>{
    const active=loadActiveShifts(year,month);
    setMergedActive(active);
    const saved=loadSchedule(year,month);
    if(saved){
      setSchedule(saved.schedule);
      setSavedAt(saved.savedAt);
      // חשב מחדש counts מהסידור כדי להבטיח נכונות
      const recalc={};
      workers.forEach(w=>{recalc[w.id]={total:0,loadTotal:0,shaarCount:0};shifts.forEach(s=>{recalc[w.id][s.id]=0;});});
      for(const[day,daySchedule]of Object.entries(saved.schedule)){
        for(const[sid,wid]of Object.entries(daySchedule)){
          if(sid.endsWith("_conflict")||!wid)continue;
          const shift=shifts.find(s=>s.id===sid);
          if(!shift||!recalc[wid])continue;
          recalc[wid][sid]=(recalc[wid][sid]||0)+1;
          recalc[wid].total++;
          recalc[wid].loadTotal+=shift.hardness;
          if(sid==="s1"||sid==="s2")recalc[wid].shaarCount++;
        }
      }
      setCounts(recalc);
    }
    else{setSchedule(null);setCounts({});setSavedAt(null);}
  },[year,month]);

  useEffect(()=>{saveWorkers(workers);},[workers]);

  const loadConstraints=async()=>{
    setLoadingConstraints(true);
    const res=await api.getConstraints(monthKey);
    if(res.ok){
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
    const active=loadActiveShifts(year,month)||mergedActive;
    setMergedActive(active);
    const seed=Date.now()%10000;
    const{schedule:s,counts:c}=smartGenerate(workers,shifts,constraints,year,month,active,seed);
    setSchedule(s);setCounts(c);
    saveSchedule(year,month,s,c);
    setSavedAt(new Date().toISOString());
  };

  const clearAndRegenerate=()=>{if(window.confirm("למחוק ולצור חדשה?")){clearSchedule(year,month);generate();}};
  const prevMonth=()=>{setMonth(m=>{if(m===0){setYear(y=>y-1);return 11;}return m-1;});};
  const nextMonth=()=>{setMonth(m=>{if(m===11){setYear(y=>y+1);return 0;}return m+1;});};

  const handleCellEdit=(shiftId,newWid)=>{
    const ns={...schedule,[dayModal]:{...schedule[dayModal],[shiftId]:newWid===""?null:Number(newWid)}};
    setSchedule(ns);saveSchedule(year,month,ns,counts);setEditCell(null);
  };

  const addWorker=()=>{
    if(!newWorkerName.trim())return;
    const maxId=Math.max(...workers.map(w=>w.id),0);
    setWorkers(ws=>[...ws,{id:maxId+1,name:newWorkerName.trim(),seniority:newWorkerSeniority}]);
    setNewWorkerName("");setSchedule(null);
  };

  const removeWorker=(id)=>{
    if(!window.confirm("להסיר עובד זה?"))return;
    setWorkers(ws=>ws.filter(w=>w.id!==id));
    setConstraints(c=>{const n={...c};delete n[id];return n;});
    setSchedule(null);
  };

  const getWorker=id=>workers.find(w=>w.id===id);
  const getShift=id=>shifts.find(s=>s.id===id);
  const dayActiveShifts=day=>{
    if(!mergedActive)return shifts;
    const set=mergedActive[day];
    return set?shifts.filter(s=>set.has(s.id)):[];
  };

  const anyLoaded=!!mergedActive;

  // דוח שיבוצים על אילוץ
  const conflictReport=useMemo(()=>{
    if(!schedule||!constraints)return[];
    const report=[];
    for(let d=1;d<=daysInMonth;d++){
      const active=dayActiveShifts(d);
      for(const shift of active){
        if(!schedule[d]?.[`${shift.id}_conflict`]) continue;
        const wid=schedule[d][shift.id];
        if(!wid) continue;
        const w=getWorker(wid);
        if(!w) continue;
        // מצא את האילוץ
        const cs=constraints[wid]||[];
        const constraint=cs.find(c=>c.day===d)||(cs.find(c=>c.day===getPrevWorkday(year,month,d)&&NEEDS_PREP.has(shift.id)));
        report.push({
          day:d,
          worker:w,
          shift,
          constraint,
          isPrevDay:!cs.find(c=>c.day===d),
        });
      }
    }
    return report;
  },[schedule,constraints,daysInMonth]);

  const conflictCount=conflictReport.length;

  const groupStats=useMemo(()=>{
    if(!schedule)return{};
    const stats={};
    [1,2,3,4].forEach(sen=>{
      const group=workers.filter(w=>w.seniority===sen);
      if(!group.length)return;
      const loads=group.map(w=>({w,total:counts[w.id]?.total||0,load:counts[w.id]?.loadTotal||0}));
      stats[sen]={loads,avgLoad:loads.reduce((a,b)=>a+b.load,0)/loads.length,avgTotal:loads.reduce((a,b)=>a+b.total,0)/loads.length,maxLoad:Math.max(...loads.map(x=>x.load),1)};
    });
    return stats;
  },[counts,workers,schedule]);

  function getPrevWorkday(y,m,d){
    const dow=new Date(y,m,d).getDay();
    return dow===0?d-3:d-1;
  }

  // PRINT
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
              <div style={{fontWeight:800,fontSize:15,borderBottom:"2px solid #000",paddingBottom:4,marginBottom:8}}>{DAYS_HE[dow]} {day}.{month+1}.{year}</div>
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
                          const isConflict=schedule[day]?.[`${shift.id}_conflict`];
                          return(
                            <tr key={shift.id} style={{borderBottom:"1px solid #eee",background:isConflict?"#FFF3CD":"transparent"}}>
                              <td style={{padding:"3px 8px",fontWeight:600,width:"50%"}}>{shift.label}{isConflict?" ⚠️":""}</td>
                              <td style={{padding:"3px 8px",color:worker?"#000":"#EF4444"}}>{worker?worker.name:"⚠️ לא משובץ"}</td>
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
      <div style={{background:"linear-gradient(180deg,#111827,#0D1526)",borderBottom:"1px solid #1F2937",padding:"14px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:42,height:42,borderRadius:12,background:"linear-gradient(135deg,#3B82F6,#6366F1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>📋</div>
          <div>
            <div style={{fontWeight:900,fontSize:18}}>ניהול תורנויות</div>
            <div style={{fontSize:11,color:"#4B5563"}}>צפון מטכל ועורף</div>
          </div>
        </div>
        <TabBar tabs={[["schedule","לוח"],["load","עומס"],["conflicts","התנגשויות"],["workers","עובדים"],["settings","הגדרות"]]} active={tab} onChange={setTab}/>
      </div>

      <div style={{maxWidth:1200,margin:"0 auto",padding:"20px 16px"}}>

        {/* ══ SCHEDULE ══ */}
        {tab==="schedule"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:10}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <Btn onClick={prevMonth} variant="ghost" small>‹</Btn>
                <span style={{fontWeight:900,fontSize:20,minWidth:140,textAlign:"center"}}>{MONTHS_HE[month]} {year}</span>
                <Btn onClick={nextMonth} variant="ghost" small>›</Btn>
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                {!anyLoaded&&<span style={{fontSize:11,color:"#F59E0B"}}>⚠️ העלה אקסל ב-<a href="/upload" style={{color:"#3B82F6"}}>/upload</a></span>}
                <Btn onClick={loadConstraints} variant="ghost" small disabled={loadingConstraints}>
                  {loadingConstraints?"⏳":"🔄"} טען אילוצים
                </Btn>
                {Object.keys(constraints).length>0&&<span style={{fontSize:11,color:"#10B981"}}>✅ {Object.values(constraints).reduce((a,b)=>a+b.length,0)} אילוצים</span>}
                {conflictCount>0&&(
                  <button onClick={()=>setTab("conflicts")} style={{fontSize:11,color:"#F59E0B",background:"#F59E0B22",borderRadius:6,padding:"3px 8px",fontWeight:700,border:"none",cursor:"pointer"}}>
                    ⚠️ {conflictCount} התנגשויות
                  </button>
                )}
                {schedule&&<Btn onClick={()=>setPrintMode(true)} variant="ghost" small>🖨️</Btn>}
                {schedule
                  ?<Btn onClick={clearAndRegenerate} small style={{background:"linear-gradient(135deg,#7C3AED,#6366F1)"}}>🔀 סימולציה חדשה</Btn>
                  :<Btn onClick={generate} disabled={!anyLoaded}>⚡ צור תורנות</Btn>
                }
              </div>
            </div>

            {savedAt&&(
              <div style={{fontSize:11,color:"#475569",marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
                💾 נשמר: {new Date(savedAt).toLocaleString("he-IL")}
                <button onClick={()=>{clearSchedule(year,month);setSchedule(null);setCounts({});setSavedAt(null);}} style={{background:"none",border:"none",cursor:"pointer",color:"#EF4444",fontSize:11,padding:0}}>(מחק)</button>
              </div>
            )}

            {!schedule?(
              <Card style={{textAlign:"center",padding:60}}>
                <div style={{fontSize:52,marginBottom:14}}>🗓️</div>
                <div style={{fontWeight:800,fontSize:18,marginBottom:8}}>אין תורנות עדיין</div>
                <div style={{color:"#64748B",fontSize:14,marginBottom:20}}>{anyLoaded?"לחץ ⚡ לייצור":"העלה קבצי אקסל ב-/upload תחילה"}</div>
                {anyLoaded&&<Btn onClick={generate}>⚡ צור תורנות</Btn>}
              </Card>
            ):(
              <div style={{background:"#111827",borderRadius:18,border:"1px solid #1F2937",overflow:"hidden"}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
                  {DAYS_HE.map(d=>(<div key={d} style={{padding:"10px 0",textAlign:"center",fontSize:11,fontWeight:700,color:"#374151",borderBottom:"1px solid #1F2937"}}>{d}</div>))}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
                  {Array.from({length:firstDay}).map((_,i)=>(<div key={`e${i}`} style={{minHeight:110,borderLeft:"1px solid #1F2937",borderBottom:"1px solid #1F2937"}}/>))}
                  {Array.from({length:daysInMonth},(_,i)=>i+1).map(day=>{
                    const isToday=day===today.getDate()&&month===today.getMonth()&&year===today.getFullYear();
                    const active=dayActiveShifts(day);
                    const assigned=active.filter(s=>schedule[day]?.[s.id]!=null).length;
                    const unassigned=active.filter(s=>schedule[day]?.[s.id]===null).length;
                    const workerIds=[...new Set(active.map(s=>schedule[day]?.[s.id]).filter(Boolean))];
                    const hasPink=mergedActive&&mergedActive[day]?.size>0;
                    const hasConflict=active.some(s=>schedule[day]?.[`${s.id}_conflict`]);
                    const unavailToday=workers.filter(w=>(constraints[w.id]||[]).some(c=>(c.type==="military"||c.type==="personal"||c.type==="unavailable")&&c.day===day));
                    return(
                      <div key={day} onClick={()=>active.length>0&&setDayModal(day)}
                        style={{minHeight:110,borderLeft:"1px solid #1F2937",borderBottom:"1px solid #1F2937",padding:"5px",cursor:active.length>0?"pointer":"default",
                          background:hasConflict?"rgba(245,158,11,0.08)":isToday?"rgba(99,102,241,0.08)":hasPink?"rgba(232,93,213,0.04)":"transparent"}}
                        onMouseOver={e=>active.length>0&&(e.currentTarget.style.background="rgba(255,255,255,0.04)")}
                        onMouseOut={e=>e.currentTarget.style.background=hasConflict?"rgba(245,158,11,0.08)":isToday?"rgba(99,102,241,0.08)":hasPink?"rgba(232,93,213,0.04)":"transparent"}
                      >
                        <div style={{fontWeight:800,fontSize:12,color:isToday?"#6366F1":hasPink?"#C084FC":"#374151",marginBottom:2,display:"flex",alignItems:"center",gap:3}}>
                          {day}{hasConflict&&<span style={{fontSize:8,color:"#F59E0B"}}>⚠️</span>}{hasPink&&<span style={{fontSize:8,color:"#E49EDD"}}>●</span>}
                        </div>
                        {unavailToday.length>0&&<div style={{fontSize:8,color:"#EF4444",marginBottom:2,fontWeight:700}}>🚫 {unavailToday.map(w=>w.name).join(", ")}</div>}
                        {active.length===0&&mergedActive&&<div style={{fontSize:9,color:"#1E293B",fontStyle:"italic"}}>לא פעיל</div>}
                        <div style={{display:"flex",flexDirection:"column",gap:2}}>
                          {workerIds.slice(0,4).map(wid=>{
                            const w=getWorker(wid);if(!w)return null;
                            const wShifts=active.filter(s=>schedule[day]?.[s.id]===wid);
                            const load=wShifts.reduce((a,s)=>a+s.hardness,0);
                            const wConflict=wShifts.some(s=>schedule[day]?.[`${s.id}_conflict`]);
                            return(<div key={wid} style={{background:wConflict?"#F59E0B33":senColor(w.seniority)+"22",color:wConflict?"#F59E0B":senColor(w.seniority),borderRadius:3,padding:"1px 4px",fontSize:9,fontWeight:700}}>{w.name}{wConflict?" ⚠️":""} <span style={{opacity:0.6}}>({load})</span></div>);
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
        {tab==="load"&&(
          <div>
            {!schedule?(
              <Card style={{textAlign:"center",padding:40}}><div style={{fontSize:36,marginBottom:8}}>📊</div><div style={{color:"#64748B"}}>צור תורנות תחילה</div></Card>
            ):(
              [4,3,2,1].map(sen=>{
                const gs=groupStats[sen];if(!gs)return null;
                return(
                  <div key={sen} style={{marginBottom:24}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                      <div style={{width:10,height:10,borderRadius:"50%",background:senColor(sen)}}/>
                      <span style={{fontWeight:800,fontSize:15,color:senColor(sen)}}>{senLabel(sen)}</span>
                      <span style={{fontSize:12,color:"#475569"}}>ממוצע עומס: <b style={{color:"#E2E8F0"}}>{gs.avgLoad.toFixed(1)}</b> · ממוצע תורנות: <b style={{color:"#E2E8F0"}}>{gs.avgTotal.toFixed(1)}</b></span>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10}}>
                      {gs.loads.map(({w,total,load})=>{
                        const maxM=MAX_MONTH[w.seniority];
                        const diffPct=gs.avgLoad>0?Math.round(((load-gs.avgLoad)/gs.avgLoad)*100):0;
                        const diffColor=Math.abs(diffPct)<=10?"#10B981":Math.abs(diffPct)<=20?"#F59E0B":"#EF4444";
                        return(
                          <Card key={w.id} style={{padding:12}} onClick={()=>setWorkerModal(w.id)}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                              <span style={{fontWeight:800,fontSize:13}}>{w.name}</span>
                              <span style={{fontSize:10,fontWeight:700,color:diffColor,background:`${diffColor}22`,borderRadius:4,padding:"2px 6px"}}>{diffPct>0?"+":""}{diffPct}%</span>
                            </div>
                            <div style={{fontSize:11,color:"#64748B",marginBottom:4}}>{total}/{maxM} · עומס {load}</div>
                            <div style={{height:4,borderRadius:2,background:"#0F172A",overflow:"hidden"}}>
                              <div style={{height:"100%",borderRadius:2,width:`${Math.min(100,(load/gs.maxLoad)*100)}%`,background:senColor(sen)}}/>
                            </div>
                            <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
                              <button onClick={e=>{e.stopPropagation();setWorkerModal(w.id);}} style={{fontSize:9,color:"#3B82F6",background:"#3B82F622",border:"none",borderRadius:4,padding:"2px 6px",cursor:"pointer",fontFamily:"'Heebo',sans-serif"}}>תורנות</button>
                              <button onClick={e=>{e.stopPropagation();setConstraintsModal(w.id);}} style={{fontSize:9,color:"#F59E0B",background:"#F59E0B22",border:"none",borderRadius:4,padding:"2px 6px",cursor:"pointer",fontFamily:"'Heebo',sans-serif"}}>אילוצים</button>
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

        {/* ══ CONFLICTS ══ */}
        {tab==="conflicts"&&(
          <div>
            <div style={{fontWeight:800,fontSize:16,marginBottom:16}}>⚠️ שיבוצים על אילוץ</div>
            {!schedule?(
              <Card style={{textAlign:"center",padding:40}}><div style={{color:"#64748B"}}>צור תורנות תחילה</div></Card>
            ):conflictReport.length===0?(
              <Card style={{textAlign:"center",padding:40}}>
                <div style={{fontSize:36,marginBottom:8}}>✅</div>
                <div style={{color:"#10B981",fontWeight:700}}>אין שיבוצים על אילוץ!</div>
              </Card>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {conflictReport.map((item,i)=>{
                  const dow=new Date(year,month,item.day).getDay();
                  const cType=item.constraint?.type==="military"?"🎖️ אילוץ צבאי":"👤 אילוץ אישי";
                  const cNote=item.constraint?.shiftLabel||"";
                  const prevDay=getPrevWorkday(year,month,item.day);
                  return(
                    <div key={i} style={{background:"#1E293B",border:"1px solid #F59E0B44",borderRadius:14,padding:16}}>
                      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8,flexWrap:"wrap"}}>
                        <span style={{fontWeight:800,fontSize:14,color:"#F59E0B"}}>⚠️ {item.worker.name}</span>
                        <span style={{fontSize:12,color:"#64748B"}}>{DAYS_HE[dow]} {item.day}.{month+1}</span>
                        <span style={{background:item.shift.bg,color:item.shift.dark,borderRadius:6,padding:"2px 8px",fontSize:12,fontWeight:700}}>{item.shift.label}</span>
                      </div>
                      <div style={{fontSize:12,color:"#94A3B8"}}>
                        {item.isPrevDay?(
                          <>סיבה: יש לו אילוץ ביום {prevDay} ({DAYS_HE[new Date(year,month,prevDay).getDay()]}) — יום לפני תורנות שדורשת הכנה</>
                        ):(
                          <>סיבה: {cType}{cNote?` — ${cNote}`:""} ביום {item.day}</>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══ WORKERS ══ */}
        {tab==="workers"&&(
          <div>
            <Card style={{marginBottom:20}}>
              <div style={{fontWeight:800,fontSize:15,marginBottom:14}}>➕ הוספת עובד</div>
              <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
                <div style={{flex:2,minWidth:130}}>
                  <div style={{fontSize:11,color:"#64748B",marginBottom:4}}>שם</div>
                  <Inp value={newWorkerName} onChange={e=>setNewWorkerName(e.target.value)} placeholder="שם העובד" style={{width:"100%",boxSizing:"border-box"}}/>
                </div>
                <div style={{flex:1,minWidth:130}}>
                  <div style={{fontSize:11,color:"#64748B",marginBottom:4}}>שנת ותק</div>
                  <Sel value={newWorkerSeniority} onChange={e=>setNewWorkerSeniority(Number(e.target.value))} style={{width:"100%"}}>
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
              return(
                <div key={sen} style={{marginBottom:20}}>
                  <div style={{fontSize:12,fontWeight:700,color:senColor(sen),marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:senColor(sen)}}/>
                    {senLabel(sen)} · {group.length} עובדים
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:10}}>
                    {group.map(w=>(
                      <Card key={w.id} style={{padding:13,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          <div style={{width:34,height:34,borderRadius:"50%",background:`hsl(${(w.id*67)%360},55%,48%)`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:13,color:"#fff",flexShrink:0}}>{w.name[0]}</div>
                          <div>
                            <div style={{fontWeight:700,fontSize:13}}>{w.name}</div>
                            <div style={{fontSize:10,color:"#475569"}}>{senLabel(sen)}</div>
                          </div>
                        </div>
                        <button onClick={()=>removeWorker(w.id)} style={{background:"none",border:"1px solid #334155",borderRadius:6,cursor:"pointer",color:"#EF4444",fontSize:11,padding:"2px 8px",fontFamily:"'Heebo',sans-serif"}}>הסר</button>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ══ SETTINGS ══ */}
        {tab==="settings"&&(
          <div>
            <DeadlineEditor/>
            <Card>
              <div style={{fontWeight:700,fontSize:14,marginBottom:10}}>🔗 קישורים</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {[["📂 העלאת קבצי אקסל","/upload"],["👥 דף אילוצים לעובדים","/"]].map(([label,href])=>(
                  <a key={href} href={href} style={{color:"#3B82F6",fontSize:13,fontWeight:600}}>{label}</a>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* DAY MODAL */}
      {dayModal!==null&&schedule&&(
        <div onClick={()=>{setDayModal(null);setEditCell(null);}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#111827",border:"1px solid #1F2937",borderRadius:20,padding:24,width:"100%",maxWidth:560,maxHeight:"88vh",overflowY:"auto",direction:"rtl"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div>
                <div style={{fontWeight:900,fontSize:20}}>{dayModal} {MONTHS_HE[month]} {year}</div>
                <div style={{fontSize:12,color:"#4B5563"}}>{DAYS_HE[new Date(year,month,dayModal).getDay()]} · לחץ לעריכה</div>
              </div>
              <button onClick={()=>setDayModal(null)} style={{background:"none",border:"none",color:"#6B7280",fontSize:24,cursor:"pointer"}}>×</button>
            </div>
            {dayActiveShifts(dayModal).some(s=>schedule[dayModal]?.[`${s.id}_conflict`])&&(
              <div style={{background:"#F59E0B22",border:"1px solid #F59E0B",borderRadius:10,padding:"10px 14px",marginBottom:12,fontSize:12,color:"#F59E0B",fontWeight:700}}>
                ⚠️ יש שיבוצים על אילוץ ביום זה
              </div>
            )}
            {["אולם","כתיבה","שער"].map(sh=>{
              const shShifts=dayActiveShifts(dayModal).filter(s=>s.sheet===sh);
              if(!shShifts.length)return null;
              return(
                <div key={sh} style={{marginBottom:12}}>
                  <div style={{fontSize:11,fontWeight:700,color:SHEET_COLOR[sh],marginBottom:6}}>{sh==="אולם"?"🏛️":sh==="כתיבה"?"✍️":"🚪"} {sh}</div>
                  <div style={{display:"flex",flexDirection:"column",gap:5}}>
                    {shShifts.map(shift=>{
                      const wid=schedule[dayModal]?.[shift.id];
                      const worker=wid?getWorker(wid):null;
                      const isConflict=schedule[dayModal]?.[`${shift.id}_conflict`];
                      const isEditing=editCell===shift.id;
                      return(
                        <div key={shift.id} style={{background:"#0F172A",borderRadius:10,padding:"9px 12px",border:`1px solid ${isConflict?"#F59E0B":worker?shift.color+"40":"#450a0a55"}`,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,flex:1,minWidth:0}}>
                            <div style={{width:7,height:7,borderRadius:"50%",background:isConflict?"#F59E0B":shift.color,flexShrink:0}}/>
                            <span style={{fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{shift.label}</span>
                            <span style={{fontSize:9,color:HARDNESS_COLOR[shift.hardness],fontWeight:700,flexShrink:0}}>●{shift.hardness}</span>
                            {isConflict&&<span style={{fontSize:9,color:"#F59E0B",fontWeight:700}}>⚠️ על אילוץ</span>}
                          </div>
                          {isEditing?(
                            <Sel value={wid??""} onChange={e=>handleCellEdit(shift.id,e.target.value)} style={{fontSize:12,padding:"4px 8px"}}>
                              <option value="">— לא משובץ —</option>
                              {workers.map(w=><option key={w.id} value={w.id}>{w.name} (שנה {w.seniority})</option>)}
                            </Sel>
                          ):(
                            <div style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer"}} onClick={()=>setEditCell(shift.id)}>
                              {worker?(
                                <span style={{background:isConflict?"#F59E0B22":shift.bg,color:isConflict?"#F59E0B":shift.dark,borderRadius:6,padding:"3px 10px",fontSize:12,fontWeight:700}}>
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

      {/* WORKER MODAL */}
      {workerModal!==null&&schedule&&(()=>{
        const w=workers.find(x=>x.id===workerModal);if(!w)return null;
        const allDays=[];
        for(let d=1;d<=daysInMonth;d++){
          const ds=dayActiveShifts(d).filter(s=>schedule[d]?.[s.id]===w.id);
          if(ds.length>0)allDays.push({d,shifts:ds});
        }
        return(
          <div onClick={()=>setWorkerModal(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
            <div onClick={e=>e.stopPropagation()} style={{background:"#111827",border:"1px solid #1F2937",borderRadius:20,padding:24,width:"100%",maxWidth:480,maxHeight:"88vh",overflowY:"auto",direction:"rtl"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <div>
                  <div style={{fontWeight:900,fontSize:20}}>{w.name}</div>
                  <div style={{fontSize:12,color:"#4B5563"}}>{senLabel(w.seniority)} · {allDays.reduce((a,b)=>a+b.shifts.length,0)} תורנויות · עומס {counts[w.id]?.loadTotal||0}</div>
                </div>
                <button onClick={()=>setWorkerModal(null)} style={{background:"none",border:"none",color:"#6B7280",fontSize:24,cursor:"pointer"}}>×</button>
              </div>
              {allDays.length===0?(
                <div style={{textAlign:"center",padding:30,color:"#64748B"}}>אין תורנויות החודש</div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {allDays.map(({d,ds_shifts:ds,shifts:ds2})=>{
                    const dayShiftsToShow=ds||ds2||[];
                    return(
                      <div key={d} style={{background:"#0F172A",borderRadius:10,padding:"10px 14px"}}>
                        <div style={{fontSize:12,fontWeight:700,color:"#64748B",marginBottom:6}}>{DAYS_HE[new Date(year,month,d).getDay()]} {d}.{month+1}</div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                          {(ds2||[]).map(s=>{
                            const isConflict=schedule[d]?.[`${s.id}_conflict`];
                            return(
                              <span key={s.id} style={{background:isConflict?"#F59E0B22":s.bg,color:isConflict?"#F59E0B":s.dark,borderRadius:6,padding:"3px 10px",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:4}}>
                                {s.label}{isConflict&&<span style={{fontSize:9}}>⚠️</span>}<span style={{fontSize:9,color:HARDNESS_COLOR[s.hardness]}}>●{s.hardness}</span>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* CONSTRAINTS MODAL */}
      {constraintsModal!==null&&(()=>{
        const w=workers.find(x=>x.id===constraintsModal);if(!w)return null;
        const wcs=(constraints[w.id]||[]).filter(c=>c.month===monthKey);
        return(
          <div onClick={()=>setConstraintsModal(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
            <div onClick={e=>e.stopPropagation()} style={{background:"#111827",border:"1px solid #1F2937",borderRadius:20,padding:24,width:"100%",maxWidth:480,maxHeight:"88vh",overflowY:"auto",direction:"rtl"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <div>
                  <div style={{fontWeight:900,fontSize:20}}>{w.name}</div>
                  <div style={{fontSize:12,color:"#4B5563"}}>אילוצים — {MONTHS_HE[month]} {year}</div>
                </div>
                <button onClick={()=>setConstraintsModal(null)} style={{background:"none",border:"none",color:"#6B7280",fontSize:24,cursor:"pointer"}}>×</button>
              </div>
              {wcs.length===0?(
                <div style={{textAlign:"center",padding:30,color:"#64748B"}}>אין אילוצים החודש</div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {wcs.sort((a,b)=>(a.day||0)-(b.day||0)).map(c=>{
                    const icon=c.type==="military"?"🎖️":"👤";
                    const dow=new Date(year,month,c.day).getDay();
                    const dayStr=`${DAYS_HE[dow]} ${c.day}.${month+1}`;
                    const label=c.shiftLabel?`${dayStr} — ${c.shiftLabel}`:dayStr;
                    // האם שובץ ביום הזה?
                    const assignedShifts=dayActiveShifts(c.day).filter(s=>schedule?.[c.day]?.[s.id]===w.id);
                    return(
                      <div key={c.id} style={{background:"#0F172A",borderRadius:10,padding:"10px 14px",border:`1px solid ${assignedShifts.length?"#F59E0B44":"#1E293B"}`}}>
                        <div style={{fontSize:13,marginBottom:assignedShifts.length?6:0}}>{icon} {label}</div>
                        {assignedShifts.length>0&&(
                          <div style={{fontSize:11,color:"#F59E0B"}}>
                            ⚠️ שובץ ל: {assignedShifts.map(s=>s.label).join(", ")}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
