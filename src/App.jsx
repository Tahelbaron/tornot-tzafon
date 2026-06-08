import { useState } from "react";
import WorkerConstraints from "./WorkerConstraints.jsx";
import ManagerApp from "./ManagerApp.jsx";

export default function App() {
  const path = window.location.pathname;
  
  if (path === "/manager") return <ManagerApp />;
  return <WorkerConstraints />;
}