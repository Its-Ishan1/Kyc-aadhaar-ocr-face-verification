import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App.jsx";
import FaceVerify from "./FaceVerify.jsx";
import './App.css';

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/face-verify" element={<FaceVerify />} />
      </Routes>
    </BrowserRouter>
  );
}
