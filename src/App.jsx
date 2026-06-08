import WorkerConstraints from "./WorkerConstraints.jsx";
import ManagerApp from "./ManagerApp.jsx";
import UploadPage from "./UploadPage.jsx";

export default function App() {
  const path = window.location.pathname;
  if (path === "/manager") return <ManagerApp />;
  if (path === "/upload")  return <UploadPage />;
  return <WorkerConstraints />;
}