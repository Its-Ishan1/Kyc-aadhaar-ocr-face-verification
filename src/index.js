import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import App from "./App";
import FaceVerify from "./FaceVerify";

import Success from "./Success";

import "./App.css";

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/face-verify" element={<FaceVerify />} />
      <Route path="/success" element={<Success />} />
    </Routes>
  </BrowserRouter>
);
