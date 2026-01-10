/************** CONFIG **************/
const SS_ID = "1hOOM5sQ2zMcCzpoTzxM9D3bPta7HAv3iNWVKTx7zgcE";
const FOLDER_ID = "1BXNwwRXdbnDVAyf4qc3LwuLL5GRzFGjl";
const ADMIN_PASSWORD = "1234";

/************** SERVE UI **************/
function doGet(e) {
  const isAdmin = e && e.parameter && e.parameter.mode === "admin";
  return HtmlService
    .createTemplateFromFile(isAdmin ? "admin" : "index")
    .evaluate()
    .setTitle("Project Arun")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/************** SLOT STATUS (USER) **************/
function getLimitStatus() {
  try {
    const ss = SpreadsheetApp.openById(SS_ID);
    const payment = ss.getSheetByName("Payment");
    const settings = ss.getSheetByName("Settings");

    if (!payment || !settings) return "OPEN";

    const maxTokens = Number(settings.getRange("D2").getValue());
    if (!maxTokens || isNaN(maxTokens)) return "OPEN";

    const used = Math.max(0, payment.getLastRow() - 1);
    return used >= maxTokens ? "FULL" : "OPEN";

  } catch (e) {
    return "OPEN";
  }
}

/************** USER REGISTRATION **************/
function verifyAndSubmit(d) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const ss = SpreadsheetApp.openById(SS_ID);
    const sheet = ss.getSheetByName("Payment");
    const settings = ss.getSheetByName("Settings");

    if (!sheet || !settings) return { status: "error" };

    if (!d.name || !d.mobile || !d.persons || !d.place)
      return { status: "invalid" };

    const lastRow = sheet.getLastRow();
    const tokenNumber = String(lastRow).padStart(2, "0");

    // Duplicate mobile check
    if (lastRow > 1) {
      const mobiles = sheet.getRange(2, 3, lastRow - 1, 1).getValues().flat();
      if (mobiles.map(String).includes(String(d.mobile)))
        return { status: "duplicate" };
    }

    // Slot calculation
    const [slotDate, startTime, duration] =
      settings.getRange("A2:C2").getValues()[0];

    let slotTime = new Date(slotDate);
    slotTime.setHours(
      startTime.getHours(),
      startTime.getMinutes() + (lastRow - 1) * duration,
      0,
      0
    );

    const timeStr = Utilities.formatDate(
      slotTime,
      "GMT+5:30",
      "dd/MM/yyyy hh:mm a"
    );

    // Save row (MATCHES YOUR HEADINGS EXACTLY)
    sheet.appendRow([
      tokenNumber,                 // Token (01,02)
      timeStr,                     // Timestamp (AM/PM)
      d.mobile,                    // Mobile
      d.name,                      // Name
      d.persons,                   // Persons
      d.isNonKA ? d.state : d.district, // District / State
      d.place,                     // Place
      "PENDING",                   // Payment Status
      "",                           // Txn ID
      ""                            // Screenshot URL
    ]);

    CacheService.getScriptCache().remove("ADMIN_DATA");
    return { status: "success" };

  } finally {
    lock.releaseLock();
  }
}

/************** SAVE TXN ID **************/
function saveTxnId(mobile, txnId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = SpreadsheetApp.openById(SS_ID).getSheetByName("Payment");
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][2]) === String(mobile)) {
        sheet.getRange(i + 1, 9).setValue(txnId);
        sheet.getRange(i + 1, 8).setValue("TXN_ENTERED");
        CacheService.getScriptCache().remove("ADMIN_DATA");
        return { status: "success" };
      }
    }
    return { status: "not_found" };

  } finally {
    lock.releaseLock();
  }
}

/************** UPLOAD SCREENSHOT **************/
function uploadScreenshot(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = SpreadsheetApp.openById(SS_ID).getSheetByName("Payment");
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][2]) === String(e.mobile)) {

        if (!data[i][8]) return { status: "txn_missing" };

        const file = DriveApp.getFolderById(FOLDER_ID).createFile(
          Utilities.newBlob(
            Utilities.base64Decode(e.base64),
            e.type,
            "Proof_" + e.mobile
          )
        );

        sheet.getRange(i + 1, 10).setValue(file.getUrl());
        sheet.getRange(i + 1, 8).setValue("PAID");

        CacheService.getScriptCache().remove("ADMIN_DATA");
        return { status: "success" };
      }
    }
    return { status: "not_found" };

  } finally {
    lock.releaseLock();
  }
}

/************** ADMIN DATA **************/
function getFullData() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get("ADMIN_DATA");
  if (cached) return JSON.parse(cached);

  const sheet = SpreadsheetApp.openById(SS_ID).getSheetByName("Payment");
  const data = sheet.getDataRange().getValues();

  cache.put("ADMIN_DATA", JSON.stringify(data), 30);
  return data;
}

/************** ADMIN LOGIN **************/
function checkAdminLogin(pw) {
  return pw === ADMIN_PASSWORD;
}

/************** SAVE SLOT SETTINGS **************/
function saveSlotSettings(s) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    SpreadsheetApp.openById(SS_ID)
      .getSheetByName("Settings")
      .getRange("A2:D2")
      .setValues([[new Date(s.date), new Date("1970-01-01 " + s.time), s.duration, s.limit]]);

    CacheService.getScriptCache().remove("ADMIN_DATA");
    return "Saved";

  } finally {
    lock.releaseLock();
  }
}
