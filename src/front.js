import React, { useState } from "react";
import "./App.css";

function App() {
  const [aadhaarImage, setAadhaarImage] = useState(null);

  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAadhaarImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="kyc-container">
      <div className="kyc-card">
        <h1 className="kyc-title">KYC Registration Portal</h1>

        {/* Upload Section */}
        <div className="upload-box">
          <input
            type="file"
            accept="image/*"
            id="aadhaarUpload"
            onChange={handleUpload}
            className="hidden"
          />
          <label htmlFor="aadhaarUpload" className="upload-label">
            {aadhaarImage ? (
              
  <div className="image-wrapper">
    <button className="close-btn" onClick={() => setAadhaarImage(null)}>
      ✕
    </button>

    <img
      src={aadhaarImage}
      alt="Aadhaar Preview"
      className="aadhaar-image"
    />
  </div>
) : (

          
              <>
                <div className="upload-icon">📄</div>
                <p>Click to Upload Aadhaar Card</p>
                <span>Supported: JPG, PNG (Max 5MB)</span>
              </>
            )}
          </label>
        </div>

        {/* Aadhaar Details Section */}
 
        {aadhaarImage && (
          <div className="details-card">
            <h2>Aadhaar Details</h2>
            <div className="details-grid">
              <p>
                <strong>Name:</strong> Ishan Joshi
              </p>
              <p>
                <strong>Aadhaar No:</strong> 1234 5678 9012
              </p>
              <p>
                <strong>DOB:</strong> 15/07/2003
              </p>
              <p>
                <strong>Gender:</strong> Male
              </p>
              <p className="full">
                <strong>Father’s Name:</strong> X.....X Joshi
              </p>
              <p className="full">
                <strong>Address:</strong> House No. 12, Sector 9, New Delhi,
                India - 110001
              </p>
            </div>

            <button className="submit-btn">Confirm & Continue</button>
          </div>
        )}
      </div>

      <footer className="footer">© 2025 SecureKYC • Designed by Ishan Joshi</footer>
    </div>
  );
}

export default App;
