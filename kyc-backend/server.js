

// server.js - Complete KYC Backend Server
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 8000;

// Middleware
app.use(cors());
app.use(express.json());

// Multer setup for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 }
});

// Store KYC jobs in memory
const kycJobs = new Map();

// ============ OCR HELPER FUNCTIONS ============

async function preprocessImage(imageBuffer) {
  try {
    return await sharp(imageBuffer)
      .greyscale()
      .normalize()
      .sharpen()
      .modulate({ brightness: 1.2, contrast: 1.3 })
      .resize({ width: 2000, withoutEnlargement: true })
      .toBuffer();
  } catch (err) {
    console.warn('Preprocessing failed:', err.message);
    return imageBuffer;
  }
}

// IMPROVED: Extract Aadhaar Number
function extractAadhaarNumber(text) {
  // Remove all spaces and newlines for easier matching
  const cleanText = text.replace(/\s+/g, ' ');
  
  // Pattern 1: XXXX XXXX XXXX format (with various separators)
  const patterns = [
    /(\d{4})\s*(\d{4})\s*(\d{4})/,
    /(\d{4})[\s\-\.]+(\d{4})[\s\-\.]+(\d{4})/,
    /(\d{4})\s+(\d{4})\s+(\d{4})/,
  ];
  
  for (const pattern of patterns) {
    const match = pattern.exec(cleanText);
    if (match) {
      const num = `${match[1]} ${match[2]} ${match[3]}`;
      // Validate it's not a date or other number
      if (match[1] !== '1987' && match[1] !== '1990' && match[1] !== '2000') {
        return num;
      }
    }
  }
  
  // Pattern 2: 12 consecutive digits
  const consecutiveMatch = /\b(\d{12})\b/.exec(text.replace(/\s/g, ''));
  if (consecutiveMatch) {
    const num = consecutiveMatch[1];
    return `${num.slice(0,4)} ${num.slice(4,8)} ${num.slice(8,12)}`;
  }
  
  // Pattern 3: Find any 4-4-4 digit sequence in the text
  const allDigits = text.match(/\d+/g);
  if (allDigits) {
    const joined = allDigits.join('');
    // Look for 12 consecutive digits
    const twelveDigits = joined.match(/\d{12}/);
    if (twelveDigits) {
      const num = twelveDigits[0];
      return `${num.slice(0,4)} ${num.slice(4,8)} ${num.slice(8,12)}`;
    }
  }
  
  return null;
}

// IMPROVED: Extract DOB
function extractDOB(text) {
  const cleanText = text.replace(/\n/g, ' ');
  
  const patterns = [
    // YYYY-MM-DD format (like 2006-09-02)
    /(\d{4}[\/\-\.]\d{2}[\/\-\.]\d{2})/,
    
    // Standard DD/MM/YYYY formats
    /DOB\s*[:\-\/]?\s*(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})/i,
    /Date\s*of\s*Birth\s*[:\-]?\s*(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})/i,
    /D[O0]B\s*[:\-\/]?\s*(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})/i,
    /Birth\s*[:\-]?\s*(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})/i,
    
    // Year of Birth format
    /Year\s*of\s*Birth\s*[:\-]?\s*(\d{4})/i,
    /YOB\s*[:\-]?\s*(\d{4})/i,
    /DOB\s*[:\-]?\s*(\d{4})\b/i,
    
    // Generic date DD/MM/YYYY
    /\b(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})\b/,
  ];
  
  for (const pattern of patterns) {
    const match = pattern.exec(cleanText);
    if (match) {
      const value = match[1];
      // Return as-is, just normalize separators
      return value.replace(/[\-\.]/g, '/');
    }
  }
  
  // Fallback: Look for 4-digit year near "Year" or "Birth" keywords
  const yearMatch = cleanText.match(/(?:Year|Birth|DOB)[^\d]*(\d{4})/i);
  if (yearMatch) {
    return yearMatch[1];
  }
  
  return null;
}

// IMPROVED: Extract Gender
function extractGender(text) {
  const fullText = text.replace(/\n/g, ' ');
  
  // Look for "/ Female" or "/ Male" pattern first (most reliable on Aadhaar)
  if (/\/\s*Female/i.test(fullText)) return 'Female';
  if (/\/\s*Male(?!\s*\/)(?!Female)/i.test(fullText)) return 'Male';
  
  // Check for standalone Female/Male after पुरुष or महिला
  if (/पुरुष\s*\/?\s*Female/i.test(fullText)) return 'Female';
  if (/महिला\s*\/?\s*Male/i.test(fullText)) return 'Male';
  
  // Check English words
  if (/\bFEMALE\b/i.test(fullText)) return 'Female';
  
  // Check MALE but not part of FEMALE
  const textUpper = fullText.toUpperCase();
  const femaleCount = (textUpper.match(/FEMALE/g) || []).length;
  const maleCount = (textUpper.match(/\bMALE\b/g) || []).length;
  
  if (femaleCount > 0) return 'Female';
  if (maleCount > femaleCount) return 'Male';
  
  // Hindi only (if no English found)
  if (/पुरुष/.test(text) && !/Female/i.test(text)) return 'Male';
  if (/महिला|स्त्री/.test(text)) return 'Female';
  
  return null;
}

// IMPROVED: Extract Name
function extractName(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2);
  
  // First try to find name after "Name:" or "नाम" keyword
  const fullText = text.replace(/\n/g, ' ');
  
  // Pattern: "Name: Sid malhorta" or "नाम / Name: Sid malhorta"
  const namePatterns = [
    /Name\s*[:\-]\s*([A-Za-z][A-Za-z\s]{2,30})/i,
    /नाम\s*[\/\s]*Name\s*[:\-]?\s*([A-Za-z][A-Za-z\s]{2,30})/i,
    /नाम\s*[:\-\/]\s*([A-Za-z][A-Za-z\s]{2,30})/i,
  ];
  
  for (const pattern of namePatterns) {
    const match = fullText.match(pattern);
    if (match) {
      let name = match[1].trim();
      // Remove trailing keywords
      name = name.replace(/\s*(DOB|जन्म|Gender|Male|Female|पुरुष|महिला).*$/i, '').trim();
      
      if (name.length > 2 && !/government|india|aadhaar|unique/i.test(name)) {
        const words = name.split(/\s+/).filter(w => w.length >= 2 && /^[A-Za-z]+$/.test(w));
        if (words.length >= 1 && words.length <= 4) {
          return words.map(w => 
            w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
          ).join(' ');
        }
      }
    }
  }
  
  // Fallback: look for standalone name lines
  const excludePatterns = [
    /government/i, /india/i, /aadhaar/i, /unique/i, /identification/i,
    /authority/i, /\bmale\b/i, /\bfemale\b/i, /dob/i, /address/i, 
    /download/i, /भारत/, /सरकार/, /आधार/, /पहचान/, /\d{4}/, 
    /year|birth|issue/i, /आम\s*आदमी/, /अधिकार/, /^oo\s/i, /^qc\s/i
  ];
  
  for (const line of lines) {
    if (excludePatterns.some(p => p.test(line))) continue;
    
    const cleanLine = line.replace(/[^A-Za-z\s]/g, '').trim();
    const words = cleanLine.split(/\s+/).filter(w => w.length >= 2);
    
    if (words.length >= 2 && words.length <= 4) {
      const isValidName = words.every(w => /^[A-Za-z]+$/.test(w));
      if (isValidName) {
        return words.map(w => 
          w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
        ).join(' ');
      }
    }
  }
  
  return null;
}


// function extractAddress(text) {
//   const lines = text
//     .split('\n')
//     .map(l => l.trim())
//     .filter(l => l.length > 0);

//   const fullText = text.replace(/\n/g, ' ');

//   let addressLines = [];
//   let foundAddressKeyword = false;

//   // Method 1: Find "Address:" or "पता"
//   for (let i = 0; i < lines.length; i++) {
//     const line = lines[i];

//     if (/^(Address|पता)\s*[:\-]?/i.test(line) || /Address\s*:/i.test(line)) {
//       foundAddressKeyword = true;

//       // Part after the word "Address"
//       const afterKeyword = line.replace(/^(Address|पता)\s*[:\-]?\s*/i, '').trim();
//       if (afterKeyword && afterKeyword.length > 2) {
//         addressLines.push(afterKeyword);
//       }

//       // Collect next 4–5 lines until we hit some other section
//       for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
//         const nextLine = lines[j];

//         // stop when other sections start
//         if (/\d{4}\s*\d{4}\s*\d{4}/.test(nextLine)) break; // Aadhaar number
//         if (/^(Name|DOB|Gender|VID|Year|Issue)/i.test(nextLine)) break;
//         if (/Unique\s*Identification/i.test(nextLine)) break;
//         if (/Government\s*of\s*India/i.test(nextLine)) break;

//         if (nextLine.length < 2) continue;
//         addressLines.push(nextLine);
//       }
//       break;
//     }
//   }

//   // Method 2: S/O, D/O, W/O, C/O pattern if no "Address:" found
//   if (addressLines.length === 0) {
//     const soPattern = /[SDWC]\/[O0]\s+[A-Za-z\s]+/gi;
//     const soMatches = fullText.match(soPattern);
//     if (soMatches) {
//       addressLines.push(...soMatches);
//     }
//   }

//   // Method 3: Common address keyword patterns
//   if (addressLines.length === 0) {
//     const addressKeywords = [
//       /\b(House|H\.?\s*No|Plot|Flat)\s*[:\-]?\s*[\w\d\-\/]+/gi,
//       /\b(Floor|Gali|Lane|Street|Road|Marg)\s*[\w\s,]*/gi,
//       /\b(Mohalla|Nagar|Colony|Vihar|Enclave|Society|Apartment)\s*[\w\s,]*/gi,
//       /\b(Sector|Block|Phase|Pocket)\s*[\-\d\w]+/gi,
//       /\b(Village|Town|Tehsil|Taluk|Mandal)\s*[\w\s,]*/gi,
//       /\b(City|District|Distt)\s*[:\-]?\s*[\w\s]+/gi,
//     ];

//     for (const pattern of addressKeywords) {
//       const matches = fullText.match(pattern);
//       if (matches) {
//         addressLines.push(...matches);
//       }
//     }
//   }

//   // Method 4: Find pincode (6 digits) – but ensure it's not Aadhaar
//   let pincode = null;
//   const pincodeMatch = fullText.match(/\b(\d{6})\b/);
//   if (pincodeMatch) {
//     const idx = fullText.indexOf(pincodeMatch[1]);
//     const context = fullText.slice(Math.max(0, idx - 20), idx);
//     if (!/\d{4}\s*\d{4}\s*$/.test(context)) {
//       pincode = pincodeMatch[1];
//     }
//   }

//   if (addressLines.length === 0) return null;

//   // --- Build raw address string as before ---
//   let address = addressLines
//     .map(line =>
//       line
//         .replace(/[^\w\s,.\-\/()]/g, ' ')
//         .replace(/\s+/g, ' ')
//         .trim()
//     )
//     .filter(l => l.length > 2)
//     .filter((line, idx, arr) => arr.indexOf(line) === idx)
//     .join(', ')
//     .replace(/,\s*,/g, ', ')
//     .trim();

//   // --- NEW: Cut off anything after the pincode (gets rid of ", EERE") ---
//   if (pincode) {
//     const idx = address.indexOf(pincode);
//     if (idx !== -1) {
//       address = address.slice(0, idx + pincode.length);
//     }
//   }

//   // --- NEW: Split, de-duplicate, and remove obvious noise like "EERE" ---
//   let parts = address
//     .split(',')
//     .map(p => p.trim())
//     .filter(Boolean);

//   // 1) Deduplicate case-insensitively while keeping order
//   const seen = new Set();
//   parts = parts.filter(p => {
//     const key = p.toLowerCase();
//     if (seen.has(key)) return false;
//     seen.add(key);
//     return true;
//   });

//   // 2) Drop random short ALL-CAPS tokens that look like noise (EERE etc.),
//   //    but keep a small whitelist like STB, PO, PS if they appear.
//   const whitelistUpper = new Set(['STB', 'PO', 'PS', 'NH']);

//   parts = parts.filter(p => {
//     const hasDigit = /\d/.test(p);
//     const hasLower = /[a-z]/.test(p);
//     if (hasDigit || hasLower) return true; // looks like a normal address part

//     const up = p.toUpperCase();
//     if (whitelistUpper.has(up)) return true;

//     // Remove things like "EERE", "ABCD" etc.
//     if (/^[A-Z]{2,4}$/.test(up)) return false;

//     return true;
//   });

//   address = parts.join(', ');

//   return { address: address || null, pincode };
// }


// Main OCR function
// async function extractAadhaarDetails(imageBuffer) {
//   try {
//     const processedImage = await preprocessImage(imageBuffer);
    
//     console.log('Starting OCR...');
//     const result = await Tesseract.recognize(processedImage, 'eng+hin', {
//       logger: m => {
//         if (m.status === 'recognizing text') {
//           process.stdout.write(`\rOCR Progress: ${Math.round(m.progress * 100)}%`);
//         }
//       }
//     });
//     console.log('\nOCR Complete!');
    
//     const text = result.data.text;
//     console.log('\n--- Raw OCR Text ---\n', text, '\n-------------------\n');
    
//     const name = extractName(text);
//     const aadhaarNumber = extractAadhaarNumber(text);
//     const dob = extractDOB(text);
//     const gender = extractGender(text);
//     // const addressData = extractAddress(text) || { address: null, pincode: null };
    
//     console.log('Extracted:', { name, aadhaarNumber, dob, gender, address: addressData.address });
    
//     return {
//       success: true,
//       data: {
//         name: name || 'Not detected',
//         aadhaarNumber: aadhaarNumber || 'Not detected',
//         dob: dob || 'Not detected',
//         gender: gender || 'Not detected',
//         address: addressData?.address || 'Not detected',
//         pincode: addressData?.pincode || '',
//         confidence: {
//           name: !!name,
//           aadhaar: !!aadhaarNumber,
//           dob: !!dob,
//           gender: !!gender,
//           address: !!addressData?.address
//         }
//       }
//     };
//   } catch (error) {
//     console.error('OCR Error:', error);
//     return { success: false, error: error.message };
//   }
// }



//adhar details

// Main OCR function
async function extractAadhaarDetails(imageBuffer) {
  try {
    const processedImage = await preprocessImage(imageBuffer);
    
    console.log('Starting OCR...');
    const result = await Tesseract.recognize(processedImage, 'eng+hin', {
      logger: m => {
        if (m.status === 'recognizing text') {
          process.stdout.write(`\rOCR Progress: ${Math.round(m.progress * 100)}%`);
        }
      }
    });
    console.log('\nOCR Complete!');
    
    const text = result.data.text;
    console.log('\n--- Raw OCR Text ---\n', text, '\n-------------------\n');
    
    const name = extractName(text);
    const aadhaarNumber = extractAadhaarNumber(text);
    const dob = extractDOB(text);
    const gender = extractGender(text);

    // ⬇️ NO ADDRESS OCR ANYMORE
    console.log('Extracted:', { name, aadhaarNumber, dob, gender });

    return {
      success: true,
      data: {
        name: name || 'Not detected',
        aadhaarNumber: aadhaarNumber || 'Not detected',
        dob: dob || 'Not detected',
        gender: gender || 'Not detected',

        // Address is now always "Not detected" so user can enter manually
        address: 'Not detected',
        pincode: '',

        confidence: {
          name: !!name,
          aadhaar: !!aadhaarNumber,
          dob: !!dob,
          gender: !!gender,
          address: false,       // we are not detecting it
        }
      }
    };
  } catch (error) {
    console.error('OCR Error:', error);
    return { success: false, error: error.message };
  }
}


// ============ API ROUTES ============

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/kyc/upload', upload.single('aadhaar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    console.log(`Received file: ${req.file.originalname} (${req.file.size} bytes)`);
    const result = await extractAadhaarDetails(req.file.buffer);
    res.json(result);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.post('/api/kyc/submit', (req, res) => {
  try {
    const { name, aadhaarNumber, dob, gender, address, docDescriptor } = req.body;
    if (!name || !aadhaarNumber) {
      return res.status(400).json({ success: false, error: 'Name and Aadhaar number are required' });
    }
    const jobId = uuidv4();
    kycJobs.set(jobId, {
      id: jobId, name, aadhaarNumber, dob, gender,address,  docDescriptor,
      status: 'pending_face_verification',
      createdAt: new Date().toISOString()
    });
    console.log(`KYC Job created: ${jobId}`);
    res.json({ success: true, jobId });
  } catch (error) {
    console.error('Submit error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/api/kyc/job/:jobId', (req, res) => {
  const job = kycJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
  res.json({ success: true, job });
});

app.post('/api/kyc/verify-face/:jobId', (req, res) => {
  const job = kycJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
  const { matched, livenessScore } = req.body;
  job.status = matched ? 'verified' : 'failed';
  job.faceVerification = { matched, livenessScore, verifiedAt: new Date().toISOString() };
  kycJobs.set(job.id, job);
  res.json({ success: true, job });
});

app.listen(PORT, () => {
  console.log(`\n🚀 KYC Backend Server running on http://localhost:${PORT}\n`);
});