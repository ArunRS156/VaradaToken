const SS_ID = "1hOOM5sQ2zMcCzpoTzxM9D3bPta7HAv3iNWVKTx7zgcE";
const FOLDER_ID = "1BXNwwRXdbnDVAyf4qc3LwuLL5GRzFGjl";

// =======================
// Serve pages
// =======================
function doGet(e) {
  const isAdmin = e?.parameter?.mode === "admin";
  const html = HtmlService.createTemplateFromFile(isAdmin ? "admin" : "index")
    .evaluate()
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setTitle("Project Arun")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

  if (isAdmin) html.setSandboxMode(HtmlService.SandboxMode.IFRAME);
  return html;
}

// =======================
// Slot status (UNCHANGED)
// =======================
function getLimitStatus() {
  const ss = SpreadsheetApp.openById(SS_ID);
  const limit = Number(ss.getSheetByName("Settings").getRange("D2").getValue());
  if (!limit || limit <= 0) return "OPEN";

  const current = ss.getSheetByName("Payment").getLastRow() - 1;
  return current >= limit ? "FULL" : "OPEN";
}

// =======================
// Admin data
// =======================
function getFullData() {
  return SpreadsheetApp.openById(SS_ID)
    .getSheetByName("Payment")
    .getDataRange()
    .getValues();
}

// =======================
// Register user (UNCHANGED LOGIC)
// =======================
function verifyAndSubmit(d) {
  const sheet = SpreadsheetApp.openById(SS_ID).getSheetByName("Payment");

  if (!d.name || !d.mobile || !d.persons || !d.place) {
    return { status: "invalid" };
  }

  const last = sheet.getLastRow();
  if (last > 1) {
    const mobiles = sheet.getRange(2, 2, last - 1, 1).getValues().flat().map(String);
    if (mobiles.includes(String(d.mobile))) return { status: "duplicate" };
  }

  const s = SpreadsheetApp.openById(SS_ID)
    .getSheetByName("Settings")
    .getRange("A2:D2")
    .getValues()[0];

  const count = Math.max(0, last - 1);
  const dateStr = Utilities.formatDate(new Date(s[0]), "GMT+5:30", "dd/MM/yyyy");

  let t = new Date();
  if (s[1] instanceof Date) {
    t.setHours(s[1].getHours(), s[1].getMinutes() + count * s[2], 0, 0);
  }

  const timeStr = Utilities.formatDate(t, "GMT+5:30", "hh:mm a");
  const tokenNo = String(count + 1).padStart(2, "0");

  const token = `${d.name} | ${d.mobile} | ${d.persons}P | ${dateStr} | ${timeStr} | Token ${tokenNo}`;

  sheet.appendRow([
    new Date(),              // A Timestamp
    d.mobile,                // B Mobile (PRIMARY KEY)
    d.name,                  // C Name
    d.persons,               // D Persons
    d.isNonKA ? d.state : d.district, // E Location
    d.place,                 // F Place
    "PENDING_TXN",           // G Status
    token,                   // H Token
    "",                      // I Screenshot URL
    ""                       // J Txn ID
  ]);

  return { status: "success" };
}

// =======================
// Save Txn ID (MOBILE BASED)
// =======================
function saveTxnId(mobile, txnId) {
  if (!mobile || !txnId) return { status: "error" };

  const sheet = SpreadsheetApp.openById(SS_ID).getSheetByName("Payment");
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]) === String(mobile)) {
      sheet.getRange(i + 1, 10).setValue(txnId); // Column J
      sheet.getRange(i + 1, 7).setValue("TXN_ENTERED");
      return { status: "success", token: data[i][7] };
    }
  }
  return { status: "not_found" };
}

// =======================
// Upload screenshot (MOBILE BASED)
// =======================
function uploadScreenshot(e) {
  if (!e.base64 || !e.type || !e.mobile) return { status: "error" };

  const file = DriveApp.getFolderById(FOLDER_ID)
    .createFile(Utilities.newBlob(
      Utilities.base64Decode(e.base64),
      e.type,
      "Proof_" + e.mobile
    ));

  const sheet = SpreadsheetApp.openById(SS_ID).getSheetByName("Payment");
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]) === String(e.mobile)) {
      sheet.getRange(i + 1, 9).setValue(file.getUrl()); // Screenshot
      sheet.getRange(i + 1, 7).setValue("PAID_CONFIRMED");
      return { status: "success", token: data[i][7] };
    }
  }

  return { status: "not_found" };
}

// =======================
// Admin login
// =======================
function checkAdminLogin(pw) {
  return pw === "1234";
}

// =======================
// Save slot settings
// =======================
function saveSlotSettings(s) {
  const sheet = SpreadsheetApp.openById(SS_ID).getSheetByName("Settings");
  sheet.getRange("A2:D2")
    .setValues([[new Date(s.date), s.time, s.duration || s.interval, s.limit]]);
  return "Saved";
}
