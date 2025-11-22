

// FaceVerify.jsx - FIXED VERSION
import React, { useRef, useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";

export default function FaceVerify() {
  const [searchParams] = useSearchParams();
  const jobId = searchParams.get("job");
  const navigate = useNavigate();

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null); // ✅ Store stream reference

  const [captured, setCaptured] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);

  const DISTANCE_THRESHOLD = 0.55;

  // Load face-api models on mount
  useEffect(() => {
    let mounted = true;
    async function loadModels() {
      if (!window.faceapi) {
        if (mounted) setError("face-api.js not loaded. Add <script src=\"https://cdn.jsdelivr.net/npm/face-api.js\"></script> in index.html");
        return;
      }
      const MODEL_URL = "/models";
      try {
        await Promise.all([
          window.faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          window.faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          window.faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        if (mounted) {
          setModelsLoaded(true);
          setError(null);
        }
      } catch (err) {
        console.error("Error loading face models:", err);
        if (mounted) setError("Failed to load face models. Make sure /public/models is present.");
      }
    }
    loadModels();
    return () => { mounted = false; };
  }, []);

  // ✅ FIXED: Start camera whenever captured is null
  useEffect(() => {
    let mounted = true;

    async function startCamera() {
      // Don't start if we already have a captured image
      if (captured) return;

      try {
        // Stop existing stream first if any
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }

        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: "user" } 
        });
        
        if (mounted && videoRef.current && !captured) {
          videoRef.current.srcObject = stream;
          streamRef.current = stream; // ✅ Store stream reference
        } else {
          stream.getTracks().forEach(t => t.stop());
        }
      } catch (err) {
        console.error("Camera start error:", err);
        if (mounted) setError("Cannot access camera. Allow camera permission.");
      }
    }

    startCamera();

    return () => {
      mounted = false;
      // Clean up stream on unmount
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, [captured]); // ✅ Re-run when captured changes

  const capture = () => {
    setError(null);
    if (!videoRef.current || !canvasRef.current) {
      setError("Camera not ready");
      return;
    }
    const v = videoRef.current;
    const c = canvasRef.current;
    c.width = v.videoWidth || 640;
    c.height = v.videoHeight || 480;
    const ctx = c.getContext("2d");
    ctx.drawImage(v, 0, 0, c.width, c.height);
    const data = c.toDataURL("image/jpeg", 0.95);
    setCaptured(data);
    setResult(null);

    // ✅ Stop camera after capturing
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  function deserializeDescriptor(arr) {
    try {
      return new Float32Array(arr);
    } catch (e) {
      return null;
    }
  }

  function euclideanDistance(a, b) {
    if (!a || !b || a.length !== b.length) return Infinity;
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const d = a[i] - b[i];
      sum += d * d;
    }
    return Math.sqrt(sum);
  }

  const verify = async () => {
    setError(null);
    setLoading(true);
    setResult(null);

    if (!modelsLoaded) {
      setError("Face models not loaded yet");
      setLoading(false);
      return;
    }
    if (!captured) {
      setError("Capture selfie first");
      setLoading(false);
      return;
    }

    try {
      const img = await window.faceapi.fetchImage(captured);
      const detection = await window.faceapi
        .detectSingleFace(img)
        .withFaceLandmarks()
        .withFaceDescriptor();
      
      if (!detection || !detection.descriptor) {
        throw new Error("No face detected in selfie. Make sure face is clear and well-lit.");
      }
      const selfieDesc = detection.descriptor;

      const docRaw = window.localStorage.getItem("docDescriptor");
      if (!docRaw) {
        throw new Error("Missing document descriptor. Re-upload the ID and ensure the face on the document was detected.");
      }
      const docArr = JSON.parse(docRaw);
      const docDesc = deserializeDescriptor(docArr);
      if (!docDesc) {
        throw new Error("Invalid document descriptor stored. Re-upload the ID image.");
      }

      const dist = euclideanDistance(selfieDesc, docDesc);
      const matched = dist <= DISTANCE_THRESHOLD;

      setResult({ matched, distance: Number(dist.toFixed(4)), threshold: DISTANCE_THRESHOLD });

      try {
        const resBlob = await fetch(captured);
        const blob = await resBlob.blob();
        const fd = new FormData();
        fd.append("jobId", jobId || "");
        fd.append("selfie", blob, "selfie.jpg");

        const resp = await fetch("http://localhost:8000/api/kyc/verify-face", { 
          method: "POST", 
          body: fd 
        });
        const json = await resp.json();
        
        if (!resp.ok || !json.success) {
          console.warn("Server verify returned error:", json);
        } else {
          if (matched && json.job && json.job.status === "verified") {
            setTimeout(() => navigate("/success"), 1200);
          }
        }
      } catch (serverErr) {
        console.warn("Failed to upload selfie to backend:", serverErr);
      }
    } catch (err) {
      console.error("Verify error:", err);
      setError(err.message || "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  // ✅ FIXED: Reset function now just clears captured state
  const reset = () => {
    setCaptured(null);
    setResult(null);
    setError(null);
    // Camera will restart automatically via useEffect
  };

  return (
    <div className="kyc-container">
      <div className="kyc-card">
        <header className="kyc-header">
          <div>
            <h1 className="kyc-title">Face Verification</h1>
            <p className="kyc-subtitle">Align your face and capture a clear selfie.</p>
          </div>
          <div className="kyc-status-area">
            <div className={`status-pill ${modelsLoaded ? "success" : "processing"}`}>
              {modelsLoaded ? "Models loaded" : "Loading models..."}
            </div>
            <button className="btn-secondary small" onClick={reset}>Reset</button>
          </div>
        </header>

        <main className="kyc-main" style={{ gridTemplateColumns: "1fr 380px" }}>
          <section className="kyc-left" style={{ textAlign: "center" }}>
            {!captured ? (
              <>
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  style={{ 
                    width: "100%", 
                    maxWidth: 720, 
                    borderRadius: 10, 
                    border: "1px solid #eee",
                    backgroundColor: "#000" // ✅ Show black background while loading
                  }} 
                />
                <div style={{ marginTop: 12 }}>
                  <button className="btn-primary" onClick={capture}>
                    Capture selfie
                  </button>
                </div>
              </>
            ) : (
              <>
                <img 
                  src={captured} 
                  alt="selfie" 
                  style={{ width: "100%", maxWidth: 720, borderRadius: 10 }} 
                />
                <div style={{ marginTop: 12 }}>
                  <button 
                    className="btn-secondary small" 
                    onClick={() => setCaptured(null)} // ✅ Just clear captured
                  >
                    Retake
                  </button>
                  <button 
                    className="btn-primary" 
                    onClick={verify} 
                    disabled={loading} 
                    style={{ marginLeft: 8 }}
                  >
                    {loading ? "Verifying..." : "Verify"}
                  </button>
                </div>
              </>
            )}
            <canvas ref={canvasRef} style={{ display: "none" }} />
          </section>

          <aside className="kyc-right">
            <div className="card-section">
              <h3>Status</h3>

              <div className="progress" style={{ marginTop: 8 }}>
                <div 
                  className="progress-bar" 
                  style={{ 
                    width: result ? "100%" : captured ? "66%" : "33%" 
                  }} 
                />
              </div>

              <div style={{ marginTop: 12 }}>
                <div className="metric-row">
                  <span>Document</span>
                  <span>
                    {window.localStorage.getItem("docDescriptor") ? "Loaded" : "Missing"}
                  </span>
                </div>
                <div className="metric-row">
                  <span>Selfie</span>
                  <span>{captured ? "Captured" : "Pending"}</span>
                </div>
                <div className="metric-row">
                  <span>Verification</span>
                  <span>
                    {result ? (result.matched ? "Matched" : "Not matched") : "Pending"}
                  </span>
                </div>
              </div>

              {error && (
                <div className="alert error" style={{ marginTop: 12 }}>
                  {error}
                </div>
              )}

              {result && (
                <div style={{ marginTop: 14, textAlign: "center" }}>
                  {result.matched ? (
                    <div className="verify-animation">
                      <svg className="verify-svg" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="38" className="verify-circle" />
                        <polyline points="30,54 44,68 74,38" className="verify-check" />
                      </svg>
                      <div style={{ marginTop: 10, fontWeight: 700, color: "var(--accent-2)" }}>
                        Identity verified
                      </div>
                      <div style={{ color: "var(--muted)", marginTop: 6 }}>
                        distance: {result.distance} (threshold {result.threshold})
                      </div>
                    </div>
                  ) : (
                    <div>
                      <strong style={{ color: "var(--danger)" }}>Not matched</strong>
                      <div style={{ marginTop: 8 }}>
                        Similarity distance: {result.distance}. Try a clearer selfie or re-upload the ID.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="card-section" style={{ marginTop: 12 }}>
              <h4 style={{ marginBottom: 8 }}>Tips to Improve Face Match</h4>
              <ul style={{ 
                paddingLeft: 18, 
                lineHeight: "1.6", 
                listStyle: "none",
                margin: 0 
              }}>
                <li>✔ Use a clear selfie with no blur or shadows.</li>
                <li>✔ Keep your face straight — not tilted.</li>
                <li>✔ Remove glasses if there's glare or reflection.</li>
                <li>✔ Ensure the Aadhaar photo is clear and not cropped.</li>
              </ul>
              <p style={{ marginTop: 10, fontSize: 14 }}>
                Once ready, tap <span style={{ fontWeight: "600" }}>Retake</span> and try again.
              </p>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}

