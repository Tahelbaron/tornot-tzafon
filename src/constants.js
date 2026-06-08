export const WORKERS = [
  { id:1,  name:"שחר",   seniority:4 },
  { id:2,  name:"תהל",   seniority:4 },
  { id:3,  name:"הגר",   seniority:3 },
  { id:4,  name:"זגורי", seniority:3 },
  { id:5,  name:"קשת",   seniority:3 },
  { id:6,  name:"מתן",   seniority:2 },
  { id:7,  name:"אוריה", seniority:2 },
  { id:8,  name:"לוטם",  seniority:2 },
  { id:9,  name:"יעל",   seniority:2 },
  { id:10, name:"רביד",  seniority:1 },
  { id:11, name:"בר",    seniority:1 },
  { id:12, name:"אמיתי", seniority:1 },
  { id:13, name:"סופיה", seniority:1 },
];
 
export const SHIFTS = [
  // אולם
  { id:"a1",  sheet:"אולם",  label:"מעצרים",         hardness:5, color:"#10B981", bg:"#D1FAE5", dark:"#064E3B", seniorRestrict:[4,3], minSeniority:1 },
  { id:"a2",  sheet:"אולם",  label:"פיצול",           hardness:4, color:"#06B6D4", bg:"#CFFAFE", dark:"#164E63", seniorRestrict:[],    minSeniority:1 },
  { id:"a3",  sheet:"אולם",  label:"משלב 1+2",        hardness:4, color:"#3B82F6", bg:"#DBEAFE", dark:"#1E3A8A", seniorRestrict:[4,3], minSeniority:1 },
  { id:"a4",  sheet:"אולם",  label:"משלב נוסף",       hardness:3, color:"#60A5FA", bg:"#EFF6FF", dark:"#1E3A8A", seniorRestrict:[4],   minSeniority:1 },
  { id:"a5",  sheet:"אולם",  label:"משלב 3",          hardness:4, color:"#6366F1", bg:"#E0E7FF", dark:"#312E81", seniorRestrict:[4,3], minSeniority:1 },
  { id:"a6",  sheet:"אולם",  label:"הרכב",            hardness:3, color:"#8B5CF6", bg:"#EDE9FE", dark:"#4C1D95", seniorRestrict:[],    minSeniority:2 },
  { id:"a7",  sheet:"אולם",  label:"דן יחיד",         hardness:3, color:"#A855F7", bg:"#F3E8FF", dark:"#581C87", seniorRestrict:[4,3], minSeniority:1 },
  { id:"a8",  sheet:"אולם",  label:"תזכורות וקדמים",  hardness:3, color:"#EC4899", bg:"#FCE7F3", dark:"#831843", seniorRestrict:[],    minSeniority:1 },
  { id:"a9",  sheet:"אולם",  label:"עתודה 1",         hardness:2, color:"#F43F5E", bg:"#FFE4E6", dark:"#881337", seniorRestrict:[],    minSeniority:1 },
  { id:"a10", sheet:"אולם",  label:"עתודה 2",         hardness:1, color:"#14B8A6", bg:"#CCFBF1", dark:"#134E4A", seniorRestrict:[],    minSeniority:1 },
  // כתיבה
  { id:"e1",  sheet:"כתיבה", label:"כתיבת עריקים",    hardness:3, color:"#EF4444", bg:"#FEE2E2", dark:"#7F1D1D", seniorRestrict:[],    minSeniority:1 },
  { id:"e2",  sheet:"כתיבה", label:"עתודה עריקים",    hardness:1, color:"#F97316", bg:"#FFEDD5", dark:"#7C2D12", seniorRestrict:[],    minSeniority:1 },
  { id:"e3",  sheet:"כתיבה", label:"משתמטים 1",       hardness:4, color:"#EAB308", bg:"#FEF9C3", dark:"#713F12", seniorRestrict:[],    minSeniority:1 },
  { id:"e4",  sheet:"כתיבה", label:"משתמטים 2",       hardness:2, color:"#CA8A04", bg:"#FEF08A", dark:"#713F12", seniorRestrict:[],    minSeniority:1 },
  { id:"e5",  sheet:"כתיבה", label:"משתמטים עתודה",   hardness:1, color:"#84CC16", bg:"#F0FDF4", dark:"#14532D", seniorRestrict:[],    minSeniority:1 },
  // שער
  { id:"s1",  sheet:"שער",   label:"שער א",           hardness:5, color:"#0EA5E9", bg:"#E0F2FE", dark:"#0C4A6E", seniorRestrict:[4],   minSeniority:1 },
  { id:"s2",  sheet:"שער",   label:"שער ב",           hardness:5, color:"#6D28D9", bg:"#DDD6FE", dark:"#2E1065", seniorRestrict:[4],   minSeniority:1 },
  { id:"s3",  sheet:"שער",   label:"עתודת שער",       hardness:1, color:"#64748B", bg:"#F1F5F9", dark:"#1E293B", seniorRestrict:[],    minSeniority:1 },
];
 
export const MONTHS_HE = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
export const DAYS_HE   = ["א׳","ב׳","ג׳","ד׳","ה׳","ו׳","ש׳"];
export const HARDNESS_COLOR = {1:"#10B981",2:"#84CC16",3:"#F59E0B",4:"#F97316",5:"#EF4444"};
export const MAX_MONTH = {4:14,3:17,2:20,1:24};
export const MAX_DAY   = {4:1, 3:2, 2:2, 1:2};
export const senColor  = s=>({4:"#10B981",3:"#3B82F6",2:"#F59E0B",1:"#EF4444"}[s]??"#64748B");
export const senLabel  = s=>({4:"שנה רביעית",3:"שנה שלישית",2:"שנה שניה",1:"שנה ראשונה"}[s]??"-");
export const SHEET_COLOR = {"אולם":"#6366F1","כתיבה":"#EF4444","שער":"#0EA5E9"};