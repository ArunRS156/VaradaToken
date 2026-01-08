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
   Slot status (SAFE)
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
    return "OPEN"; // never freeze UI
  }
}

/* =======================
   Admin data (FIXED)
======================= */
function getFullData() {
  try {
    const cache = CacheService.getScriptCache();
    const cached = cache.get("ADMIN_DATA");
    if (cached) return JSON.parse(cached);

    const ss = SpreadsheetApp.openById(SS_ID);
    const sheet = ss.getSheetByName("Payment");

    if (!sheet) {
      return [[
        "Time","Mobile","Name","P",
        "Location","Place","Status",
        "Token","Proof","Txn"
      ]];
    }

    const data = sheet.getDataRange().getValues();
    cache.put("ADMIN_DATA", JSON.stringify(data), 30);
    return data;

  } catch (err) {
    return [["ERROR", err.message]];
  }
}

/* =======================
   User registration
======================= */
function verifyAndSubmit(d) {
  try {
    const sheet = SpreadsheetApp.openById(SS_ID).getSheetByName("Payment");
    if (!sheet) return { status: "error" };

    if (!d.name || !d.mobile || !d.persons || !d.place) {
      return { status: "invalid" };
    }

    const last = sheet.getLastRow();
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

    const settings = SpreadsheetApp.openById(SS_ID)
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
      d.mobile,                           // B Mobile
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

  } catch (e) {
    return { status: "error" };
  }
}

/* =======================
   Save Transaction ID
======================= */
function saveTxnId(mobile, txnId) {
  try {
    if (!mobile || !txnId) return { status: "error" };

    const sheet = SpreadsheetApp.openById(SS_ID).getSheetByName("Payment");
    if (!sheet) return { status: "error" };

    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]) === String(mobile)) {
        sheet.getRange(i + 1, 10).setValue(txnId); // J
        sheet.getRange(i + 1, 7).setValue("TXN_ENTERED");
        clearAdminCache();
        return { status: "success", token: data[i][7] };
      }
    }
    return { status: "not_found" };

  } catch (e) {
    return { status: "error" };
  }
}

/* =======================
   Upload Screenshot
======================= */
function uploadScreenshot(e) {
  try {
    if (!e.base64 || !e.type || !e.mobile) {
      return { status: "error" };
    }

    const sheet = SpreadsheetApp.openById(SS_ID).getSheetByName("Payment");
    if (!sheet) return { status: "error" };

    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]) === String(e.mobile)) {

        if (!data[i][9]) {
          return { status: "txn_missing" };
        }

        const file = DriveApp.getFolderById(FOLDER_ID).createFile(
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

  } catch (e) {
    return { status: "error" };
  }
}

/* =======================
   Admin auth
======================= */
function checkAdminLogin(pw) {
  return pw === "1234";
}

/* =======================
   Save slot settings
======================= */
function saveSlotSettings(s) {
  try {
    SpreadsheetApp
      .openById(SS_ID)
      .getSheetByName("Settings")
      .getRange("A2:D2")
      .setValues([[new Date(s.date), s.time, s.duration || s.interval, s.limit]]);

    clearAdminCache();
    return "Saved";
  } catch (e) {
    return "Error";
  }
}
