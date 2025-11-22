
import React from "react";
import { useNavigate } from "react-router-dom";

export default function Success() {
  const navigate = useNavigate();

  return (
    <div className="kyc-container" style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
      <div
        className="kyc-card"
        style={{
          textAlign: "center",
          padding: "50px 40px",
          maxWidth: 500,
          width: "100%",
          borderRadius: 16,
          boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
          animation: "fadeIn 0.6s ease"
        }}
      >
        {/* Success Icon */}
        <div style={{ marginBottom: 20 }}>
          <svg
            width="90"
            height="90"
            viewBox="0 0 100 100"
            style={{ stroke: "#4caf50", fill: "none", strokeWidth: 3 }}
          >
            <circle cx="50" cy="50" r="45" style={{ strokeDasharray: 300, strokeDashoffset: 0 }} />
            <polyline points="30,55 45,70 75,40" style={{ strokeLinecap: "round", strokeLinejoin: "round" }} />
          </svg>
        </div>

        <h1 style={{ marginBottom: 10, color: "#4caf50", fontSize: 28 }}>
          KYC Verified
        </h1>

        <p style={{ fontSize: 16, color: "#555", marginBottom: 30 }}>
          Your identity has been successfully verified.
        </p>

        <button
          className="btn-primary"
          onClick={() => navigate("/")}
          style={{ padding: "10px 20px", fontSize: 16 }}
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}
