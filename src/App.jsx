

import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function App() {
  const [aadhaarImage, setAadhaarImage] = useState(null);
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const [confidence, setConfidence] = useState(null);
  const fileRef = useRef(null);
  const navigate = useNavigate();

  const MAX_FILE_SIZE = 6 * 1024 * 1024;

  const openFile = () => fileRef.current && fileRef.current.click();

  const validateFile = (file) => {
    if (!file) return "No file selected";
    if (!file.type.startsWith("image/")) return "Please upload an image";
    if (file.size > MAX_FILE_SIZE) return "File too large (max 6MB)";
    return null;
  };

  // Load face-api models on mount
  useEffect(() => {
    async function loadModels() {
      if (!window.faceapi) {
        console.warn("face-api.js not loaded");
        return;
      }
      const MODEL_URL = "/models";
      try {
        await Promise.all([
          window.faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          window.faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          window.faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        console.log("✓ face-api models loaded");
      } catch (err) {
        console.error("Failed to load face models:", err);
      }
    }
    loadModels();
  }, []);

  const handleUpload = async (e) => {
    const file = e.target.files ? e.target.files[0] : e;
    setError(null);
    setDetails(null);
    setConfidence(null);
    setStatus("processing");

    const v = validateFile(file);
    if (v) { 
      setError(v); 
      setStatus("idle"); 
      return; 
    }

    // Preview image immediately
    const reader = new FileReader();
    reader.onloadend = async () => {
      setAadhaarImage(reader.result);
      
      // Try to extract face descriptor from document
      if (window.faceapi) {
        try {
          const img = await window.faceapi.fetchImage(reader.result);
          const det = await window.faceapi
            .detectSingleFace(img)
            .withFaceLandmarks()
            .withFaceDescriptor();
          
          if (det && det.descriptor) {
            window.localStorage.setItem(
              "docDescriptor", 
              JSON.stringify(Array.from(det.descriptor))
            );
            console.log("✓ Document face descriptor saved");
          } else {
            console.warn("⚠ No face detected on document");
          }
        } catch (err) {
          console.warn("Face extraction error:", err);
        }
      }
    };
    reader.readAsDataURL(file);

    // Upload to backend for OCR
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("aadhaar", file);

      const res = await fetch("http://localhost:8000/api/kyc/upload", { 
        method: "POST", 
        body: fd 
      });
      
      const data = await res.json();
      
      if (!res.ok || !data.success) {
        throw new Error(data.error || "OCR failed");
      }

      // Set all extracted details including address
      setDetails(data.data || {});
      
      // Set confidence for all fields
      if (data.data?.confidence) {
        setConfidence(data.data.confidence);
      } else {
        setConfidence(null);
      }
      
      setStatus("success");

      // Check if critical fields are missing
      const missing = [];
      if (!data.data?.name || data.data.name === "Not detected") missing.push("Name");
      if (!data.data?.aadhaarNumber || data.data.aadhaarNumber === "Not detected") missing.push("Aadhaar Number");
      
      if (missing.length > 0) {
        setError(`⚠ Could not detect: ${missing.join(", ")}. Please edit manually.`);
      }

    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to process document");
      setStatus("failed");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setAadhaarImage(null);
    setDetails(null);
    setError(null);
    setConfidence(null);
    setStatus("idle");
    if (fileRef.current) fileRef.current.value = "";
    window.localStorage.removeItem("docDescriptor");
  };

  const handleSubmitKYC = async () => {
    if (!details || !details.name || !details.aadhaarNumber) { 
      setError("⚠ Name and Aadhaar Number are required");
      return; 
    }

    // Validate Aadhaar format
    const aadhaarDigits = details.aadhaarNumber.replace(/\D/g, '');
    if (aadhaarDigits.length !== 12) {
      setError("⚠ Aadhaar Number must be 12 digits");
      return;
    }

    setLoading(true);
    setError(null);
    setStatus("processing");

    try {
      const docDescRaw = window.localStorage.getItem("docDescriptor");
      const docDescriptor = docDescRaw ? JSON.parse(docDescRaw) : null;

      if (!docDescriptor) {
        console.warn("⚠ No face descriptor found on document");
      }

      const res = await fetch("http://localhost:8000/api/kyc/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: details.name,
          aadhaarNumber: details.aadhaarNumber,
          dob: details.dob,
          gender: details.gender,
          // address: details.address, // Include manually entered address
          docDescriptor
        }),
      });

      const data = await res.json();
      
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Submission failed");
      }

      const jobId = data.jobId;
      navigate(`/face-verify?job=${jobId}`);

    } catch (err) {
      console.error(err);
      setError(err.message || "Submission failed");
      setStatus("failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="kyc-container">
      <div className="kyc-card">
        <header className="kyc-header">
          <div>
            <h1 className="kyc-title">SecureKYC • Verification</h1>
            <p className="kyc-subtitle">Upload your Aadhaar card — we'll auto-extract the details.</p>
          </div>
          <div className="kyc-status-area">
            <div className={`status-pill ${
              status === "processing" ? "processing" : 
              status === "success" ? "success" : 
              status === "failed" ? "error" : ""
            }`}>
              {status === "idle" ? "Awaiting document" : 
               status === "processing" ? "Processing..." : 
               status === "success" ? "Ready for review" : 
               "Error"}
            </div>
            <button className="btn-secondary small" onClick={handleClear}>Reset</button>
          </div>
        </header>

        <main className="kyc-main">
          <section className="kyc-left">
            <div className="upload-area" onClick={openFile} role="button" tabIndex={0}>
              <input 
                ref={fileRef} 
                type="file" 
                accept="image/*" 
                onChange={handleUpload} 
                className="hidden" 
              />
              {!aadhaarImage ? (
                <div className="upload-placeholder">
                  <div className="upload-emoji">📇</div>
                  <p className="muted">Click to upload your Aadhaar Card</p>
                  <div className="upload-actions">
                    <button 
                      className="btn-primary" 
                      onClick={(e) => { e.stopPropagation(); openFile(); }}
                    >
                      Upload Document
                    </button>
                  </div>
                </div>
              ) : (
                <div className="preview-card" onClick={(e) => e.stopPropagation()}>
                  <img src={aadhaarImage} alt="preview" className="preview-image" />
                  <div className="preview-actions">
                    <button className="btn-secondary small" onClick={() => openFile()}>
                      Change Image
                    </button>
                    <button className="btn-secondary small" onClick={handleClear}>
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="mini-guidelines">
              <h4>📋 Tips for Accurate OCR</h4>
              <ul>
                <li>Use a clear, well-lit photo (avoid shadows)</li>
                <li>Keep document flat — all corners visible</li>
                <li>Avoid glare or reflections</li>
                <li>Higher resolution images work better (1200px+ width)</li>
                <li>If extraction fails, you can manually edit the fields</li>
              </ul>
            </div>
          </section>

          <aside className="kyc-right">
            <div className="card-section">
              <h3>Auto-filled Details</h3>
              
              {loading && (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <div className="loader-spin"></div>
                  <p className="muted">Extracting information...</p>
                </div>
              )}

              {error && <div className="alert error" style={{ marginTop: 10 }}>{error}</div>}

              {!details && !loading && (
                <div className="placeholder-block muted">
                  Upload a document to extract details automatically.
                </div>
              )}

              {details && (
                <>
                  {/* {confidence && (
                    <div style={{ 
                      marginBottom: 12, 
                      padding: 10, 
                      background: "#f0f9ff", 
                      borderRadius: 8,
                      fontSize: 13
                    }}>
                      <strong>Detection Confidence:</strong>
                      <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {Object.entries(confidence).map(([key, val]) => (
                          <span 
                            key={key}
                            style={{
                              padding: "3px 8px",
                              borderRadius: 4,
                              background: val ? "#dcfce7" : "#fee2e2",
                              color: val ? "#166534" : "#991b1b",
                              fontSize: 12
                            }}
                          >
                            {key}: {val ? "✓" : "✗"}
                          </span>
                        ))}
                      </div>
                    </div>
                  )} */}
                  {confidence && (
  <div style={{ 
    marginBottom: 12, 
    padding: 10, 
    background: "#f0f9ff", 
    borderRadius: 8,
    fontSize: 13
  }}>
    <strong>Detection Confidence:</strong>
    <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
      {Object.entries(confidence)
        .filter(([key]) => key !== "address" && key !== "pincode") // 👈 hide address & pincode
        .map(([key, val]) => (
          <span 
            key={key}
            style={{
              padding: "3px 8px",
              borderRadius: 4,
              background: val ? "#dcfce7" : "#fee2e2",
              color: val ? "#166534" : "#991b1b",
              fontSize: 12
            }}
          >
            {key}: {val ? "✓" : "✗"}
          </span>
        ))}
    </div>
  </div>
)}


                  <form className="kyc-form" onSubmit={(e) => e.preventDefault()}>
                    <label className="form-row">
                      <span>Full Name *</span>
                      <input 
                        value={details.name || ""} 
                        onChange={(e) => setDetails({...details, name: e.target.value})}
                        placeholder="Enter full name"
                      />
                    </label>

                    <label className="form-row">
                      <span>Aadhaar Number *</span>
                      <input 
                        value={details.aadhaarNumber || ""} 
                        onChange={(e) => setDetails({...details, aadhaarNumber: e.target.value})}
                        placeholder="XXXX XXXX XXXX"
                        maxLength={14}
                      />
                    </label>

                    <div className="two-cols">
                      <label className="form-row">
                        <span>Date of Birth</span>
                        <input 
                          value={details.dob || ""} 
                          onChange={(e) => setDetails({...details, dob: e.target.value})}
                          placeholder="DD/MM/YYYY"
                        />
                      </label>
                      <label className="form-row">
                        <span>Gender</span>
                        <input 
                          value={details.gender || ""} 
                          onChange={(e) => setDetails({...details, gender: e.target.value})}
                          placeholder="Male/Female"
                        />
                      </label>
                    </div>

                    {/* <label className="form-row full">
                      <span>Address (Enter manually)</span>
                      <textarea 
                        rows={3} 
                        value={details.address || ""} 
                        onChange={(e) => setDetails({...details, address: e.target.value})}
                        placeholder="Enter your full address with pincode"
                      />
                    </label> */}

                    <div className="form-actions">
                      <button 
                        type="button" 
                        className="btn-outline" 
                        onClick={() => window.open("/face-verify", "_blank")}
                      >
                        Preview Face Verify
                      </button>
                      <button 
                        className="btn-primary" 
                        type="button" 
                        onClick={handleSubmitKYC} 
                        disabled={loading}
                      >
                        {loading ? "Submitting..." : "Proceed to Face Verification →"}
                      </button>
                    </div>
                  </form>
                </>
              )}

              <div className="footer-note muted small" style={{ marginTop: 12 }}>
                All fields are editable. We only store necessary verification data.
              </div>
            </div>

            <div className="card-section metrics">
              <h4>Verification Progress</h4>
              <div className="progress" style={{ marginTop: 8 }}>
                <div 
                  className="progress-bar" 
                  style={{ 
                    width: details ? "33%" : (status === "processing" ? "15%" : "0%") 
                  }} 
                />
              </div>
              <div className="metric-list" style={{ marginTop: 8 }}>
                <div className="metric-row">
                  <span>📄 Document OCR</span>
                  <span>{details ? "✓ Extracted" : "Pending"}</span>
                </div>
                <div className="metric-row">
                  <span>👤 Face Match</span>
                  <span>Pending</span>
                </div>
                <div className="metric-row">
                  <span>🎯 Liveness Check</span>
                  <span>Pending</span>
                </div>
              </div>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}