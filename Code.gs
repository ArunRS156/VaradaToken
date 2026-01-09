const SS_ID = "1hOOM5sQ2zMcCzpoTzxM9D3bPta7HAv3iNWVKTx7zgcE";
const FOLDER_ID = "1BXNwwRXdbnDVAyf4qc3LwuLL5GRzFGjl";

/* =======================
   Serve pages
======================= */
function doGet(e) {
  const isAdmin = e?.parameter?.mode === "admin";
  const html = HtmlService
    .createTemplateFromFile(isAdmin ? "admin" : "index")
    .evaluate()
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setTitle("Project Arun")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

  if (isAdmin) html.setSandboxMode(HtmlService.SandboxMode.IFRAME);
  return html;
}

/* =======================
   Cache helpers
======================= */
function clearAdminCache() {
  CacheService.getScriptCache().remove("ADMIN_DATA");
}

/* =======================
   Slot status (READ ONLY)
======================= */
function getLimitStatus() {
  try {
    const ss = SpreadsheetApp.openById(SS_ID);
    const settings = ss.getSheetByName("Settings");
    const payment = ss.getSheetByName("Payment");

    if (!settings || !payment) return "OPEN";

    const limit = Number(settings.getRange("D2").getValue());
    if (!limit || limit <= 0) return "OPEN";

    const current = Math.max(0, payment.getLastRow() - 1);
    return current >= limit ? "FULL" : "OPEN";
  } catch (e) {
    return "OPEN";
  }
}

/* =======================
   Admin data (READ ONLY)
======================= */
function getFullData() {
  try {
    const cache = CacheService.getScriptCache();
    const cached = cache.get("ADMIN_DATA");
    if (cached) return JSON.parse(cached);

    const sheet = SpreadsheetApp
      .openById(SS_ID)
      .getSheetByName("Payment");

    const data = sheet
      ? sheet.getDataRange().getValues()
      : [["No Data"]];

    cache.put("ADMIN_DATA", JSON.stringify(data), 30);
    return data;
  } catch (e) {
    return [["ERROR", e.message]];
  }
}

/* =======================
   Register user (LOCKED)
======================= */
function verifyAndSubmit(d) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000); // ⏳ wait up to 10 sec

  try {
    const sheet = SpreadsheetApp.openById(SS_ID).getSheetByName("Payment");
    if (!sheet) return { status: "error" };

    if (!d.name || !d.mobile || !d.persons || !d.place) {
      return { status: "invalid" };
    }

    const last = sheet.getLastRow();

    // 🔐 duplicate protection
    if (last > 1) {
      const mobiles = sheet
        .getRange(2, 2, last - 1, 1)
        .getValues()
        .flat()
        .map(String);

      if (mobiles.includes(String(d.mobile))) {
        return { status: "duplicate" };
      }
    }

    const settings = SpreadsheetApp
      .openById(SS_ID)
      .getSheetByName("Settings")
      .getRange("A2:D2")
      .getValues()[0];

    const count = Math.max(0, last - 1);

    const dateStr = Utilities.formatDate(
      new Date(settings[0]),
      "GMT+5:30",
      "dd/MM/yyyy"
    );

    let t = new Date();
    if (settings[1] instanceof Date) {
      t.setHours(
        settings[1].getHours(),
        settings[1].getMinutes() + count * settings[2],
        0,
        0
      );
    }

    const timeStr = Utilities.formatDate(t, "GMT+5:30", "hh:mm a");
    const tokenNo = String(count + 1).padStart(2, "0");

    const token =
      `${d.name} | ${d.mobile} | ${d.persons}P | ` +
      `${dateStr} | ${timeStr} | Token ${tokenNo}`;

    sheet.appendRow([
      new Date(),                         // A Time
      d.mobile,                           // B Mobile (PRIMARY KEY)
      d.name,                             // C Name
      d.persons,                          // D Persons
      d.isNonKA ? d.state : d.district,   // E Location
      d.place,                            // F Place
      "PENDING_TXN",                      // G Status
      token,                              // H Token
      "",                                 // I Screenshot
      ""                                  // J Txn ID
    ]);

    clearAdminCache();
    return { status: "success" };

  } finally {
    lock.releaseLock(); // 🔓 ALWAYS release
  }
}

/* =======================
   Save Txn ID (LOCKED)
======================= */
function saveTxnId(mobile, txnId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    if (!mobile || !txnId) return { status: "error" };

    const sheet = SpreadsheetApp.openById(SS_ID).getSheetByName("Payment");
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]) === String(mobile)) {
        sheet.getRange(i + 1, 10).setValue(txnId);   // J
        sheet.getRange(i + 1, 7).setValue("TXN_ENTERED");
        clearAdminCache();
        return { status: "success", token: data[i][7] };
      }
    }

    return { status: "not_found" };

  } finally {
    lock.releaseLock();
  }
}

/* =======================
   Upload Screenshot (LOCKED)
======================= */
function uploadScreenshot(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    if (!e.base64 || !e.type || !e.mobile) {
      return { status: "error" };
    }

    const sheet = SpreadsheetApp.openById(SS_ID).getSheetByName("Payment");
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]) === String(e.mobile)) {

        if (!data[i][9]) {
          return { status: "txn_missing" };
        }

        const file = DriveApp
          .getFolderById(FOLDER_ID)
          .createFile(
            Utilities.newBlob(
              Utilities.base64Decode(e.base64),
              e.type,
              "Proof_" + e.mobile
            )
          );

        sheet.getRange(i + 1, 9).setValue(file.getUrl()); // I
        sheet.getRange(i + 1, 7).setValue("PAID_CONFIRMED");

        clearAdminCache();
        return { status: "success", token: data[i][7] };
      }
    }

    return { status: "not_found" };

  } finally {
    lock.releaseLock();
  }
}

/* =======================
   Admin auth
======================= */
function checkAdminLogin(pw) {
  return pw === "1234";
}

/* =======================
   Save slot settings (LOCKED)
======================= */
function saveSlotSettings(s) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    SpreadsheetApp
      .openById(SS_ID)
      .getSheetByName("Settings")
      .getRange("A2:D2")
      .setValues([[new Date(s.date), s.time, s.duration || s.interval, s.limit]]);

    clearAdminCache();
    return "Saved";

  } finally {
    lock.releaseLock();
  }
}
