const SS_ID = "1hOOM5sQ2zMcCzpoTzxM9D3bPta7HAv3iNWVKTx7zgcE";
const FOLDER_ID = "1BXNwwRXdbnDVAyf4qc3LwuLL5GRzFGjl";
const MASTER_PASSWORD = "1234";    
const SETTINGS_PASSWORD = "5678";  
const TZ = "GMT+5:30";


function doGet(e) {
  const isAdmin = e?.parameter?.mode === "admin";
  return HtmlService.createTemplateFromFile(isAdmin ? "admin" : "index")
    .evaluate().setTitle("Project Arun")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}


function checkMaster(pw) { return pw === MASTER_PASSWORD; }
function checkSettingsPw(pw) { return pw === SETTINGS_PASSWORD; }


function getSettingsData() {
  const s = SpreadsheetApp.openById(SS_ID).getSheetByName("Settings").getRange("A2:D2").getValues()[0];
  return { date: Utilities.formatDate(new Date(s[0]), TZ, "yyyy-MM-dd"), time: Utilities.formatDate(new Date(s[1]), TZ, "HH:mm"), duration: s[2], limit: s[3] };
}


function saveSlotSettings(s) {
  const sheet = SpreadsheetApp.openById(SS_ID).getSheetByName("Settings");
  sheet.getRange("A2:D2").setValues([[new Date(s.date), new Date("1970-01-01 " + s.time), Number(s.duration), Number(s.limit)]]);
}


function verifyAndSubmit(d) {
  const ss = SpreadsheetApp.openById(SS_ID);
  const sh = ss.getSheetByName("Payment");
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][2]) === String(d.mobile)) return { status: "RESUME", userStatus: data[i][7], token: data[i][0] };
  }
  const st = ss.getSheetByName("Settings");
  const lastRow = sh.getLastRow();
  const now = new Date();
  const ts = `${Utilities.formatDate(now, TZ, "dd/MM/yyyy")}\n${Utilities.formatDate(now, TZ, "hh:mm:ss a")}`;
  const [sDate, sTime, dur] = st.getRange("A2:C2").getValues()[0];
  const slot = new Date(sDate);
  slot.setHours(sTime.getHours(), sTime.getMinutes() + (lastRow - 1) * dur, 0, 0);
  const tNum = String(lastRow).padStart(2, "0");
  const tCell = `${tNum}\n${Utilities.formatDate(slot, TZ, "dd/MM/yyyy")}\n${Utilities.formatDate(slot, TZ, "hh:mm a")}`;
  sh.appendRow([tCell, ts, d.mobile, d.name, d.persons, d.isNonKA ? d.state : d.district, d.place, "PENDING", "", ""]);
  return { status: "NEW", token: tCell };
}


function saveTxnId(mobile, txnId) {
  const sh = SpreadsheetApp.openById(SS_ID).getSheetByName("Payment");
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][2]) === String(mobile)) {
      sh.getRange(i+1, 8).setValue("TXN_ENTERED");
      sh.getRange(i+1, 9).setValue(txnId);
      return { status: "success", token: data[i][0] };
    }
  }
}


function uploadScreenshot(e) {
  const sh = SpreadsheetApp.openById(SS_ID).getSheetByName("Payment");
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][2]) === String(e.mobile)) {
      const folder = DriveApp.getFolderById(FOLDER_ID);
      const file = folder.createFile(Utilities.newBlob(Utilities.base64Decode(e.base64), e.type, "Proof_" + e.mobile));
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      sh.getRange(i+1, 10).setValue(file.getUrl());
      sh.getRange(i+1, 8).setValue("PAID");
      return { status: "success", token: data[i][0] };
    }
  }
}


function getFullData() { return SpreadsheetApp.openById(SS_ID).getSheetByName("Payment").getDataRange().getValues(); }
function getLimitStatus() {
  const ss = SpreadsheetApp.openById(SS_ID);
  const used = Math.max(0, ss.getSheetByName("Payment").getLastRow() - 1);
  const max = Number(ss.getSheetByName("Settings").getRange("D2").getValue());
  return { status: used >= max ? "FULL" : "OPEN" };
}
function getDivineImage() {
  try {
    const files = DriveApp.getFolderById(FOLDER_ID).getFilesByName("Kanchi varada.gif");
    if (files.hasNext()) {
      const file = files.next();
      return "data:" + file.getMimeType() + ";base64," + Utilities.base64Encode(file.getBlob().getBytes());
    }
  } catch(e) {}
  return "https://i.ibb.co/Ldq9vV9/Kanchi-varada.gif";
}
