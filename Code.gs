const SS_ID = "1hOOM5sQ2zMcCzpoTzxM9D3bPta7HAv3iNWVKTx7zgcE";
const FOLDER_ID = "1BXNwwRXdbnDVAyf4qc3LwuLL5GRzFGjl";

/* -------------------- SERVE PAGES -------------------- */
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

/* -------------------- SLOT STATUS -------------------- */
function getLimitStatus() {
  const ss = SpreadsheetApp.openById(SS_ID);
  const limit = Number(ss.getSheetByName("Settings").getRange("D2").getValue());
  const current = ss.getSheetByName("Payment").getLastRow() - 1;
  return current >= limit ? "FULL" : "OPEN";
}

/* -------------------- ADMIN DATA -------------------- */
function getFullData() {
  return SpreadsheetApp.openById(SS_ID)
    .getSheetByName("Payment")
    .getDataRange()
    .getValues();
}

/* -------------------- REGISTER USER -------------------- */
function verifyAndSubmit(d) {
  const sheet = SpreadsheetApp.openById(SS_ID).getSheetByName("Payment");

  if (!d.name || !d.mobile || !d.persons || !d.place)
    return { status: "invalid" };

  const last = sheet.getLastRow();
  if (last > 1) {
    const mobiles = sheet.getRange(2, 2, last - 1, 1).getValues().flat();
    if (mobiles.includes(d.mobile)) return { status: "duplicate" };
  }

  const settings = SpreadsheetApp.openById(SS_ID)
    .getSheetByName("Settings")
    .getRange("A2:D2")
    .getValues()[0];

  const count = Math.max(0, last - 1);
  const dateStr = Utilities.formatDate(new Date(settings[0]), "GMT+5:30", "dd/MM/yyyy");

  let t = new Date();
  if (settings[1] instanceof Date) {
    t.setHours(settings[1].getHours(), settings[1].getMinutes() + count * settings[2], 0, 0);
  }

  const timeStr = Utilities.formatDate(t, "GMT+5:30", "hh:mm a");
  const tokenNo = String(count + 1).padStart(2, "0");

  const token = `${d.name} | ${d.mobile} | ${d.persons}P | ${dateStr} | ${timeStr} | Token ${tokenNo}`;

  sheet.appendRow([
    new Date(),
    d.mobile,
    d.name,
    d.persons,
    d.isNonKA ? d.state : d.district,
    d.place,
    "LOCKED_TXN", // 🔒 locked until txn id
    token,
    "",
    ""
  ]);

  return { status: "success" };
}

/* -------------------- SAVE TXN ID -------------------- */
function saveTxnId(mobile, txnId) {
  if (!mobile || !txnId) return { status: "error" };

  const sheet = SpreadsheetApp.openById(SS_ID).getSheetByName("Payment");
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]) === String(mobile)) {
      sheet.getRange(i + 1, 10).setValue(txnId);     // Column J
      sheet.getRange(i + 1, 7).setValue("PENDING_PRO");
      return { status: "success" };
    }
  }
  return { status: "not_found" };
}

/* -------------------- UPLOAD SCREENSHOT -------------------- */
function uploadScreenshot(e) {
  if (!e.base64 || !e.mobile) return { status: "error" };

  const sheet = SpreadsheetApp.openById(SS_ID).getSheetByName("Payment");
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]) === String(e.mobile)) {

      if (!data[i][9]) return { status: "txn_missing" };

      const file = DriveApp.getFolderById(FOLDER_ID)
        .createFile(
          Utilities.newBlob(
            Utilities.base64Decode(e.base64),
            e.type,
            e.name
          )
        );

      sheet.getRange(i + 1, 9).setValue(file.getUrl());
      sheet.getRange(i + 1, 7).setValue("PAID_VERIFIED");

      return { status: "success", token: data[i][7] };
    }
  }
  return { status: "not_found" };
}

/* -------------------- ADMIN LOGIN -------------------- */
function checkAdminLogin(pw) {
  return pw === "1234";
}

/* -------------------- SAVE SLOT SETTINGS -------------------- */
function saveSlotSettings(s) {
  SpreadsheetApp.openById(SS_ID)
    .getSheetByName("Settings")
    .getRange("A2:D2")
    .setValues([[new Date(s.date), s.time, s.duration, s.limit]]);
  return "Saved";
}
