const SS_ID = "1hOOM5sQ2zMcCzpoTzxM9D3bPta7HAv3iNWVKTx7zgcE";
const FOLDER_ID = "1BXNwwRXdbnDVAyf4qc3LwuLL5GRzFGjl";


// ✅ Serve user/admin pages
function doGet(e) {
  const isAdmin = e?.parameter?.mode === "admin";
  const html = HtmlService.createTemplateFromFile(isAdmin ? "admin" : "index")
    .evaluate()
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setTitle("Project Arun")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);


  if (isAdmin) {
    html.setSandboxMode(HtmlService.SandboxMode.IFRAME);
  }
  return html;
}


// ✅ Slot limit status
function getLimitStatus() {
  const ss = SpreadsheetApp.openById(SS_ID);
  const limit = Number(ss.getSheetByName("Settings").getRange("D2").getValue());
  if (!limit || limit <= 0) return "OPEN";


  const current = ss.getSheetByName("Payment").getLastRow() - 1;
  return current >= limit ? "FULL" : "OPEN";
}


// ✅ Fetch full payment sheet data (for admin)
function getFullData() {
  return SpreadsheetApp.openById(SS_ID)
    .getSheetByName("Payment")
    .getDataRange()
    .getValues();
}


// ✅ Verify and submit user registration
function verifyAndSubmit(d) {
  const sheet = SpreadsheetApp.openById(SS_ID).getSheetByName("Payment");


  // HARD validation
  if (!d.name || !d.mobile || !d.persons || !d.place) {
    return { status: "invalid" };
  }


  // Duplicate check
  const last = sheet.getLastRow();
  if (last > 1) {
    const mobiles = sheet.getRange(2, 2, last - 1, 1).getValues().flat();
    if (mobiles.includes(d.mobile)) return { status: "duplicate" };
  }


  // Slot settings
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


  // Append row
  sheet.appendRow([
    new Date(),                       // Timestamp
    d.mobile,                          // Mobile
    d.name,                            // Name
    d.persons,                         // Persons
    d.isNonKA ? d.state : d.district,  // District / State
    d.place,                           // Place
    "PENDING_PRO",                     // Status
    token,                             // Token
    "",                                // Proof URL (to upload later)
    ""                                 // txnId (optional)
  ]);


  return { status: "success", token };
}


// ✅ Upload screenshot & mark PAID_VERIFIED
function uploadScreenshot(e) {
  if (!e.base64 || !e.type || !e.name) return { status: "error" };
 
  const file = DriveApp.getFolderById(FOLDER_ID)
    .createFile(Utilities.newBlob(Utilities.base64Decode(e.base64), e.type, e.name));


  const sheet = SpreadsheetApp.openById(SS_ID).getSheetByName("Payment");
  const row = sheet.getLastRow();
  sheet.getRange(row, 7).setValue("PAID_VERIFIED");  // Status
  sheet.getRange(row, 9).setValue(file.getUrl());    // Proof URL


  return { status: "success" };
}


// ✅ Admin login check
function checkAdminLogin(pw) {
  return pw === "1234";
}


// ✅ Save slot settings from admin
function saveSlotSettings(s) {
  const sheet = SpreadsheetApp.openById(SS_ID).getSheetByName("Settings");
  sheet.getRange("A2:D2").setValues([[new Date(s.date), s.time, s.duration || s.interval, s.limit]]);
  return "Saved";
}


