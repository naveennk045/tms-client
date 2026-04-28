import { Navigate, Route, Routes } from "react-router-dom";
import Setup from "./routes/Setup";
import TmsBoard from "./routes/TmsBoard";
import { readStoredStore } from "./lib/storeContext";

export default function App() {
  const stored = readStoredStore();

  return (
    <Routes>
      <Route path="/" element={<Navigate to={stored ? "/tms" : "/setup"} replace />} />
      <Route path="/setup" element={<Setup />} />
      <Route path="/tms" element={<TmsBoard />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
