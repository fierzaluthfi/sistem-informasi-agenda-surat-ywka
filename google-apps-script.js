/**
 * ===================================================================
 * GOOGLE APPS SCRIPT - SISTEM AGENDA SURAT SMA YWKA BANDUNG
 * VERSI 2.6 (FITUR EDIT LENGKAP KELUAR & MASUK, FORMAT TANGGAL DD/MM/YYYY)
 * ===================================================================
 * 
 * PANDUAN PEMASANGAN (AGAR DATA LANGSUNG TERSIMPAN KE SPREADSHEET):
 * 1. Buka Google Spreadsheet SMA YWKA Anda di browser:
 *    https://docs.google.com/spreadsheets/d/1RzsLrm9_FOUUzDjyq60zyGBkrADROCtdrnRGvecST3k/edit?gid=381566345#gid=381566345
 * 2. Klik menu "Ekstensi" (Extensions) > "Apps Script".
 * 3. Hapus semua teks yang ada di editor Apps Script.
 * 4. Salin (Copy) seluruh isi file ini, lalu Tempel (Paste) ke editor tersebut.
 * 5. Klik ikon Simpan (Save).
 * 6. (PILIHAN) Pilih fungsi "setupDriveFolders" pada menu dropdown di atas editor, lalu klik "Run/Jalankan"
 *    untuk langsung membuat folder "Surat Keluar 2026" dan "Surat Masuk 2026" di Google Drive!
 * 7. Klik tombol "Deploy" (di kanan atas) > "Manage deployments" (atau "New deployment").
 * 8. Jika Manage deployments: klik ikon pensil (Edit), pilih Version: "New version",
 *    - Execute as: "Me" (email Anda)
 *    - Who has access: "Anyone" (Siapa saja yang memiliki link) -> PENTING!
 * 9. Klik "Deploy", izinkan akses (Authorize access) Google Drive & Sheets.
 * 10. Salin "Web app URL" (akhiran /exec) dan tempelkan ke aplikasi web Anda di menu "Koneksi Spreadsheet"!
 */

// Konstanta Nama Sheet sesuai berkas asli SMA YWKA
const SHEET_SURAT_KELUAR = "SURAT KELUAR 2026";
const SHEET_SURAT_MASUK = "SURAT MASUK 2026";
const FOLDER_DRIVE_ID = "1e3YGwqV7cK0f7LVGyyxClgC7hTtVEL8A"; // Folder Utama Arsip SMA YWKA
const FOLDER_DRIVE_UTAMA = "Arsip Surat SMA YWKA";
const SPREADSHEET_ID = "1RzsLrm9_FOUUzDjyq60zyGBkrADROCtdrnRGvecST3k";

/**
 * Helper: Buka spreadsheet aktif atau buka via Spreadsheet ID secara otomatis
 * Mencegah error null pointer jika script dipasang sebagai Standalone script
 */
function getTargetSpreadsheet() {
  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (e) {}
  try {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch (e) {
    throw new Error("Gagal membuka Spreadsheet SMA YWKA (ID: " + SPREADSHEET_ID + "): " + e.toString());
  }
}

/**
 * Helper untuk response JSON
 */
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Helper: Mengubah tanggal apapun menjadi format DD/MM/YYYY (contoh: 26/10/2026)
 * Mencegah Google Spreadsheet menampilkan format 2026-10-26 (strip)
 */
/**
 * Helper: Konversi nilai tanggal string (DD/MM/YYYY atau YYYY-MM-DD) menjadi objek Date resmi Google Sheets
 * agar terbaca sebagai tipe date yang valid oleh Google Visualization API & CSV
 */
function parseDateForSheet(val) {
  if (!val) return "";
  if (val instanceof Date) return val;
  var str = String(val).trim().replace(/^'+/, "");
  if (!str || str === "-" || str === "null" || str === "undefined") return "";

  var matchIso = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (matchIso) {
    return new Date(parseInt(matchIso[1], 10), parseInt(matchIso[2], 10) - 1, parseInt(matchIso[3], 10));
  }

  var matchDmy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (matchDmy) {
    var p1 = parseInt(matchDmy[1], 10);
    var p2 = parseInt(matchDmy[2], 10);
    var y = parseInt(matchDmy[3], 10);
    if (p2 > 12 && p1 <= 12) {
      return new Date(y, p1 - 1, p2);
    }
    return new Date(y, p2 - 1, p1);
  }

  return str;
}

/**
 * Otomatis perbaiki sel tanggal di spreadsheet yang sebelumnya tersimpan sebagai plain text string
 * agar kembali menjadi objek Date bertipe dd/mm/yyyy yang bisa terbaca oleh GViz & Web
 */
function repairDateCells(sheet) {
  if (!sheet) return;
  try {
    const lastRow = Math.min(sheet.getLastRow(), 310);
    if (lastRow < 4) return;
    const totalScan = lastRow - 3;
    const range = sheet.getRange(4, 3, totalScan, 2);
    const values = range.getValues();

    for (let i = 0; i < totalScan; i++) {
      const v1 = values[i][0];
      const v2 = values[i][1];
      if (typeof v1 === "string" && v1.trim() && v1.includes("/")) {
        const d1 = parseDateForSheet(v1);
        if (d1 instanceof Date) {
          sheet.getRange(i + 4, 3).setValue(d1).setNumberFormat("dd/mm/yyyy");
        }
      }
      if (typeof v2 === "string" && v2.trim() && v2.includes("/")) {
        const d2 = parseDateForSheet(v2);
        if (d2 instanceof Date) {
          sheet.getRange(i + 4, 4).setValue(d2).setNumberFormat("dd/mm/yyyy");
        }
      }
    }
  } catch (e) {
    Logger.log("repairDateCells error: " + e.toString());
  }
}

function formatToIndoDate(val) {
  if (!val) return "";
  if (val instanceof Date) {
    const d = String(val.getDate()).padStart(2, "0");
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const y = val.getFullYear();
    return d + "/" + m + "/" + y;
  }
  var str = String(val).trim().replace(/^'+/, "");
  if (!str || str === "-" || str === "null" || str === "undefined") return "";

  // 1. Cek format ISO YYYY-MM-DD atau YYYY/MM/DD
  var matchIso = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (matchIso) {
    var yIso = matchIso[1];
    var mIso = String(matchIso[2]).padStart(2, "0");
    var dIso = String(matchIso[3]).padStart(2, "0");
    return dIso + "/" + mIso + "/" + yIso;
  }

  // 2. Cek format DD-MM-YYYY atau DD/MM/YYYY (atau MM/DD/YYYY dari spreadsheet US)
  var matchDmy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (matchDmy) {
    var part1 = parseInt(matchDmy[1], 10);
    var part2 = parseInt(matchDmy[2], 10);
    var year = matchDmy[3];
    if (part2 > 12 && part1 <= 12) {
      // US format MM/DD/YYYY -> ubah ke DD/MM/YYYY
      var dUs = String(part2).padStart(2, "0");
      var mUs = String(part1).padStart(2, "0");
      return dUs + "/" + mUs + "/" + year;
    }
    var dNorm = String(part1).padStart(2, "0");
    var mNorm = String(part2).padStart(2, "0");
    return dNorm + "/" + mNorm + "/" + year;
  }

  return str;
}

/**
 * Handle HTTP GET Request
 */
function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || "ping";
    const ss = getTargetSpreadsheet();

    if (action === "ping") {
      try {
        repairDateCells(ss.getSheetByName(SHEET_SURAT_MASUK));
      } catch (e) {}
      return createJsonResponse({
        status: "success",
        message: "Koneksi Google Apps Script SMA YWKA Aktif & Siap!",
        timestamp: new Date().toISOString(),
        spreadsheetName: ss.getName()
      });
    }

    if (action === "get_drive_folders" || action === "setup_folders") {
      const folders = setupDriveFolders();
      return createJsonResponse({
        status: "success",
        message: "Folder Google Drive Surat Keluar & Masuk siap!",
        folders: folders
      });
    }

    if (action === "get_data") {
      const type = (e.parameter && e.parameter.type) || "keluar";
      const sheetName = type === "masuk" ? SHEET_SURAT_MASUK : SHEET_SURAT_KELUAR;
      const sheet = ss.getSheetByName(sheetName);
      
      if (!sheet) {
        return createJsonResponse({ status: "error", message: "Sheet tidak ditemukan: " + sheetName });
      }

      const rawValues = sheet.getDataRange().getValues();
      const rows = rawValues.slice(3); // Data dimulai dari baris ke-4 (indeks 3)

      // Pastikan tanggal selalu berformat DD/MM/YYYY
      const formattedRows = rows.map(function(row) {
        const copy = row.slice();
        if (type === "masuk") {
          copy[2] = formatToIndoDate(copy[2]); // Tanggal Surat
          copy[3] = formatToIndoDate(copy[3]); // Tanggal Diterima
        } else {
          copy[7] = formatToIndoDate(copy[7]); // Tanggal Surat
        }
        return copy;
      });

      return createJsonResponse({
        status: "success",
        sheet: sheetName,
        totalRows: rawValues.length,
        data: formattedRows
      });
    }

    return createJsonResponse({ status: "error", message: "Aksi tidak dikenal: " + action });
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handle HTTP POST Request (Simpan, Edit, Hapus baris surat + Upload file ke Google Drive)
 */
function doPost(e) {
  try {
    let payload = {};
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else {
      payload = e.parameter || {};
    }

    const action = payload.action;
    const ss = getTargetSpreadsheet();

    // ==========================================
    // 1. SIMPAN SURAT KELUAR KE SPREADSHEET
    // ==========================================
    if (action === "create_surat_keluar") {
      const sheet = ss.getSheetByName(SHEET_SURAT_KELUAR);
      if (!sheet) {
        return createJsonResponse({ status: "error", message: "Sheet " + SHEET_SURAT_KELUAR + " tidak ditemukan!" });
      }

      // 1.A. Proses Upload File ke Google Drive jika ada berkas terlampir
      let driveFileUrl = "";
      if (payload.fileBase64 && payload.fileName) {
        driveFileUrl = uploadFileToGoogleDrive(
          payload.fileBase64,
          payload.fileName,
          payload.fileMime || "application/pdf",
          "Surat Keluar 2026"
        );
      }

      const rawKode = payload.kode_klasifikasi || "421.3";
      const kodePrefix = rawKode.endsWith("/") ? rawKode : rawKode + "/";
      const tahunSuffix = payload.tahun ? "/" + payload.tahun.replace("/", "").trim() : "/2026";
      
      const noAgendaStr = String(payload.no_agenda || payload.nomor_urut || "").trim();
      const bulanRomawi = payload.bulan_romawi || "X";
      const perihal = payload.perihal || "";
      const dari = payload.dari || "Syarif Hasanudin, S.Pd., Gr., M.M.";
      const kepada = payload.kepada || "";
      const petugas = payload.petugas || "";
      const keterangan = payload.keterangan || "";
      
      // Format Tanggal: DIJAMIN selalu DD/MM/YYYY (contoh: 26/10/2026)
      const tglSurat = formatToIndoDate(payload.tanggal_surat || "");

      // Checkbox Kolom B: Diceklis (TRUE) HANYA jika file surat keluar sudah masuk ke Drive
      const isChecked = Boolean(driveFileUrl);

      // 1.B. Cek apakah nomor agenda ini sudah ada di baris template spreadsheet
      const lastRow = sheet.getLastRow();
      let targetRowIndex = -1;

      if (lastRow >= 4) {
        const totalScan = lastRow - 3;
        const agendaColValues = sheet.getRange(4, 4, totalScan, 1).getValues(); // Kolom D (Agenda)

        for (let i = 0; i < agendaColValues.length; i++) {
          const rowAgenda = String(agendaColValues[i][0]).trim();
          if (rowAgenda === noAgendaStr) {
            targetRowIndex = i + 4;
            break;
          }
        }
      }

      if (targetRowIndex > 0) {
        const existingValues = sheet.getRange(targetRowIndex, 1, 1, 14).getValues()[0];
        const existingNoUrut = existingValues[0] || noAgendaStr;
        const existingLampiran = existingValues[13] || "Surat Keluar";
        const finalLampiran = driveFileUrl ? driveFileUrl : existingLampiran;

        const rowData = [
          existingNoUrut,
          isChecked,
          kodePrefix,
          noAgendaStr,
          "/SMA YWKA TU/ ",
          bulanRomawi,
          tahunSuffix,
          tglSurat,
          perihal,
          dari,
          kepada,
          petugas,
          keterangan,
          finalLampiran
        ];

        sheet.getRange(targetRowIndex, 1, 1, rowData.length).setValues([rowData]);
        // Format teks plain (@) untuk kolom tanggal agar tidak diubah Google Sheets ke YYYY-MM-DD
        sheet.getRange(targetRowIndex, 8).setNumberFormat("@").setValue(tglSurat);
      } else {
        const prevNoUrut = lastRow >= 4 ? Number(sheet.getRange(lastRow, 1).getValue()) || (lastRow - 3) : 1;
        const newNoUrut = prevNoUrut + 1;
        const finalLampiran = driveFileUrl ? driveFileUrl : "Surat Keluar";

        const rowData = [
          newNoUrut,
          isChecked,
          kodePrefix,
          noAgendaStr,
          "/SMA YWKA TU/ ",
          bulanRomawi,
          tahunSuffix,
          tglSurat,
          perihal,
          dari,
          kepada,
          petugas,
          keterangan,
          finalLampiran
        ];

        sheet.appendRow(rowData);
        targetRowIndex = sheet.getLastRow();
        sheet.getRange(targetRowIndex, 8).setNumberFormat("@").setValue(tglSurat);
      }

      const fullGenerated = `${kodePrefix}${noAgendaStr}/SMA YWKA/TU/${bulanRomawi}${tahunSuffix}`.replace(/\/{2,}/g, "/");

      return createJsonResponse({
        status: "success",
        message: "Surat Keluar berhasil disimpan sesuai format Spreadsheet & Drive!",
        no_agenda: noAgendaStr,
        is_checked: isChecked,
        nomor_lengkap: fullGenerated,
        target_row: targetRowIndex,
        drive_file_url: driveFileUrl
      });
    }

    // ==========================================
    // 2. EDIT / PERBARUI DATA SURAT KELUAR
    // ==========================================
    if (action === "edit_surat_keluar") {
      const sheet = ss.getSheetByName(SHEET_SURAT_KELUAR);
      if (!sheet) {
        return createJsonResponse({ status: "error", message: "Sheet " + SHEET_SURAT_KELUAR + " tidak ditemukan!" });
      }

      const oldAgendaStr = String(payload.old_no_agenda || payload.no_agenda || "").trim();
      const newAgendaStr = String(payload.no_agenda || oldAgendaStr).trim();
      
      let driveFileUrl = "";
      if (payload.fileBase64 && payload.fileName) {
        driveFileUrl = uploadFileToGoogleDrive(
          payload.fileBase64,
          payload.fileName,
          payload.fileMime || "application/pdf",
          "Surat Keluar 2026"
        );
      }

      const lastRow = sheet.getLastRow();
      let targetRowIndex = -1;
      if (payload.row_index && Number(payload.row_index) >= 4 && Number(payload.row_index) <= lastRow) {
        targetRowIndex = Number(payload.row_index);
      }
      if (targetRowIndex < 0 && lastRow >= 4) {
        const totalScan = lastRow - 3;
        const agendaColValues = sheet.getRange(4, 4, totalScan, 1).getValues();
        for (let i = 0; i < agendaColValues.length; i++) {
          const rowAgenda = String(agendaColValues[i][0]).trim();
          if (rowAgenda === oldAgendaStr || rowAgenda === newAgendaStr) {
            targetRowIndex = i + 4;
            break;
          }
        }
      }

      if (targetRowIndex > 0) {
        const rawKode = payload.kode_klasifikasi || "421.3";
        const kodePrefix = rawKode.endsWith("/") ? rawKode : rawKode + "/";
        const tahunSuffix = payload.tahun ? "/" + payload.tahun.replace("/", "").trim() : "/2026";
        const bulanRomawi = payload.bulan_romawi || "X";
        const tglSurat = formatToIndoDate(payload.tanggal_surat || "");

        const existingValues = sheet.getRange(targetRowIndex, 1, 1, 14).getValues()[0];
        const existingNoUrut = existingValues[0] || newAgendaStr;
        const existingChecked = existingValues[1];
        const existingLampiran = existingValues[13] || "Surat Keluar";
        
        const finalLampiran = driveFileUrl || existingLampiran;
        const isChecked = Boolean(driveFileUrl || existingChecked || (finalLampiran && finalLampiran.includes("http")));

        const rowData = [
          existingNoUrut,
          isChecked,
          kodePrefix,
          newAgendaStr,
          "/SMA YWKA TU/ ",
          bulanRomawi,
          tahunSuffix,
          tglSurat,
          payload.perihal || "",
          payload.dari || "Syarif Hasanudin, S.Pd., Gr., M.M.",
          payload.kepada || "",
          payload.petugas || "",
          payload.keterangan || "",
          finalLampiran
        ];

        sheet.getRange(targetRowIndex, 1, 1, rowData.length).setValues([rowData]);
        sheet.getRange(targetRowIndex, 8).setNumberFormat("@").setValue(tglSurat);

        const fullGenerated = `${kodePrefix}${newAgendaStr}/SMA YWKA/TU/${bulanRomawi}${tahunSuffix}`.replace(/\/{2,}/g, "/");

        return createJsonResponse({
          status: "success",
          message: "Data Surat Keluar agenda " + newAgendaStr + " berhasil diperbarui di Spreadsheet!",
          no_agenda: newAgendaStr,
          nomor_lengkap: fullGenerated,
          target_row: targetRowIndex,
          drive_file_url: finalLampiran
        });
      } else {
        return createJsonResponse({ status: "error", message: "Baris agenda " + oldAgendaStr + " tidak ditemukan di Spreadsheet!" });
      }
    }

    // ==========================================
    // 3. UPLOAD BERKAS SURAT KELUAR LANGSUNG KE DRIVE PER AGENDA
    // ==========================================
    if (action === "upload_lampiran_keluar") {
      const sheet = ss.getSheetByName(SHEET_SURAT_KELUAR);
      if (!sheet) {
        return createJsonResponse({ status: "error", message: "Sheet " + SHEET_SURAT_KELUAR + " tidak ditemukan!" });
      }

      const noAgendaStr = String(payload.no_agenda || "").trim();
      if (!noAgendaStr) {
        return createJsonResponse({ status: "error", message: "Nomor agenda wajib disertakan!" });
      }
      if (!payload.fileBase64 || !payload.fileName) {
        return createJsonResponse({ status: "error", message: "Berkas upload tidak ditemukan!" });
      }

      const driveUrl = uploadFileToGoogleDrive(
        payload.fileBase64,
        payload.fileName,
        payload.fileMime || "application/pdf",
        "Surat Keluar 2026"
      );

      if (!driveUrl) {
        return createJsonResponse({ status: "error", message: "Gagal mengunggah berkas ke Google Drive!" });
      }

      const lastRow = sheet.getLastRow();
      let foundRow = -1;
      if (lastRow >= 4) {
        const agendaColValues = sheet.getRange(4, 4, lastRow - 3, 1).getValues();
        for (let i = 0; i < agendaColValues.length; i++) {
          if (String(agendaColValues[i][0]).trim() === noAgendaStr) {
            foundRow = i + 4;
            break;
          }
        }
      }

      if (foundRow > 0) {
        sheet.getRange(foundRow, 2).setValue(true);
        sheet.getRange(foundRow, 14).setValue(driveUrl);
      }

      return createJsonResponse({
        status: "success",
        message: "Berkas berhasil diupload ke Google Drive Surat Keluar!",
        drive_file_url: driveUrl,
        no_agenda: noAgendaStr,
        target_row: foundRow
      });
    }

    // ==========================================
    // 4. HAPUS / RESET DATA SURAT KELUAR PER AGENDA
    // ==========================================
    if (action === "delete_surat_keluar") {
      const sheet = ss.getSheetByName(SHEET_SURAT_KELUAR);
      if (!sheet) {
        return createJsonResponse({ status: "error", message: "Sheet " + SHEET_SURAT_KELUAR + " tidak ditemukan!" });
      }

      const noAgendaStr = String(payload.no_agenda || "").trim();
      if (!noAgendaStr) {
        return createJsonResponse({ status: "error", message: "Nomor agenda wajib disertakan!" });
      }

      const lastRow = sheet.getLastRow();
      let foundRow = -1;
      const rowIndex = parseInt(payload.row_index, 10);
      if (!isNaN(rowIndex) && rowIndex >= 4 && rowIndex <= lastRow) {
        foundRow = rowIndex;
      } else if (lastRow >= 4) {
        const agendaColValues = sheet.getRange(4, 4, lastRow - 3, 1).getValues();
        for (let i = 0; i < agendaColValues.length; i++) {
          if (String(agendaColValues[i][0]).trim() === noAgendaStr) {
            foundRow = i + 4;
            break;
          }
        }
      }

      if (foundRow > 0) {
        sheet.getRange(foundRow, 2).setValue(false); // Uncheck
        sheet.getRange(foundRow, 3).setValue("");    // Kosongkan kode
        sheet.getRange(foundRow, 8, 1, 6).setValues([["", "", "", "", "", ""]]); // Kosongkan H s/d M
      }

      return createJsonResponse({
        status: "success",
        message: "Data surat agenda " + noAgendaStr + " berhasil dihapus dari Spreadsheet!",
        no_agenda: noAgendaStr,
        target_row: foundRow
      });
    }

    // ==========================================
    // 5. SIMPAN SURAT MASUK KE SPREADSHEET (MENGIKUTI FORMAT SURAT MASUK 2026)
    // ==========================================
    if (action === "create_surat_masuk") {
      const sheet = ss.getSheetByName(SHEET_SURAT_MASUK);
      if (!sheet) {
        return createJsonResponse({ status: "error", message: "Sheet " + SHEET_SURAT_MASUK + " tidak ditemukan!" });
      }

      let driveFileUrl = "";
      if (payload.fileBase64 && payload.fileName) {
        driveFileUrl = uploadFileToGoogleDrive(
          payload.fileBase64,
          payload.fileName,
          payload.fileMime || "application/pdf",
          "Surat Masuk 2026"
        );
      }

      const curLastRow = sheet.getLastRow();

      // Bersihkan baris salah yang ter-append di bawah baris 302 template (misal baris 301/303 yang ter-append ke paling bawah)
      if (curLastRow > 302) {
        for (let r = curLastRow; r > 302; r--) {
          const checkColA = String(sheet.getRange(r, 1).getValue()).trim();
          const checkColB = String(sheet.getRange(r, 2).getValue()).trim();
          // Jika baris di bawah 302 terisi data append yang salah (misal no urut di col B atau Col A kosong)
          if (!checkColA || checkColB === "210" || checkColB.includes("/")) {
            try {
              sheet.deleteRow(r);
            } catch (e) {}
          }
        }
      }

      // Format Tanggal: DIJAMIN selalu DD/MM/YYYY (menggunakan /)
      const tglSuratMasuk = formatToIndoDate(payload.tanggal_surat || "");
      const tglDiterimaMasuk = formatToIndoDate(payload.tanggal_diterima || "");

      let lampiranVal = payload.lampiran || "Surat Masuk";
      if (driveFileUrl) {
        lampiranVal = driveFileUrl;
      }

      // Kolom SURAT MASUK 2026:
      // Kolom A (1): NO. URUT (1 s/d 300)
      // Kolom B (2): NO. AGENDA
      // Kolom C (3): TGL SURAT
      // Kolom D (4): TGL SURAT MASUK
      // Kolom E (5): PRIHAL/ ISI RINGKASAN SURAT
      // Kolom F (6): DARI
      // Kolom G (7): KEPADA
      // Kolom H (8): KODE KLASIFIKASI
      // Kolom I (9): KETERANGAN
      // Kolom J (10): Lampiran Fisik

      const reqNoUrut = payload.no_urut ? String(payload.no_urut).trim() : "";
      const reqNoAgenda = payload.no_agenda ? String(payload.no_agenda).trim() : "";
      const reqPerihal = payload.perihal ? String(payload.perihal).trim() : "";

      let targetRowIndex = -1;
      let finalNoUrut = reqNoUrut;

      const lastRow = Math.min(sheet.getLastRow(), 302);
      if (lastRow >= 4) {
        const totalRows = lastRow - 3;
        const rangeData = sheet.getRange(4, 1, totalRows, 5).getValues(); // Ambil Col A s/d E

        // 1.A. Cegah duplikasi: Cek apakah no_agenda atau perihal yang sama sudah ada
        for (let i = 0; i < rangeData.length; i++) {
          const rowUrut = String(rangeData[i][0]).trim();
          const rowAgenda = String(rangeData[i][1]).trim();
          const rowPerihal = String(rangeData[i][4]).trim();

          if (reqNoAgenda && rowAgenda && rowAgenda.toLowerCase() === reqNoAgenda.toLowerCase()) {
            targetRowIndex = i + 4;
            finalNoUrut = rowUrut || finalNoUrut;
            break;
          }
          if (reqPerihal && rowPerihal && reqPerihal.length > 15 && rowPerihal.toLowerCase() === reqPerihal.toLowerCase()) {
            targetRowIndex = i + 4;
            finalNoUrut = rowUrut || finalNoUrut;
            break;
          }
        }

        // 1.B. Jika belum ada, dan reqNoUrut ditentukan (misal 210), cari baris template dengan no_urut tersebut
        if (targetRowIndex < 0 && reqNoUrut) {
          for (let i = 0; i < rangeData.length; i++) {
            const rowUrut = String(rangeData[i][0]).trim();
            const rowAgenda = String(rangeData[i][1]).trim();
            const rowPerihal = String(rangeData[i][4]).trim();

            if (rowUrut === reqNoUrut) {
              if (!rowAgenda && !rowPerihal) {
                targetRowIndex = i + 4;
                finalNoUrut = rowUrut;
                break;
              }
            }
          }
        }

        // 1.C. Jika masih belum ditemukan, cari BARIS KOSONG PERTAMA di dalam template (misal tepat setelah no. 209 adalah baris 210)
        if (targetRowIndex < 0) {
          for (let i = 0; i < rangeData.length; i++) {
            const rowUrut = String(rangeData[i][0]).trim();
            const rowAgenda = String(rangeData[i][1]).trim();
            const rowPerihal = String(rangeData[i][4]).trim();

            if (!rowAgenda && !rowPerihal) {
              targetRowIndex = i + 4;
              finalNoUrut = rowUrut || (finalNoUrut ? finalNoUrut : String(i + 1));
              break;
            }
          }
        }
      }

      // 1.D. Fallback jika template 300 baris sudah terisi penuh
      if (targetRowIndex < 0) {
        targetRowIndex = sheet.getLastRow() + 1;
        if (!finalNoUrut) {
          finalNoUrut = String(targetRowIndex - 3);
        }
      }

      const rowData = [
        finalNoUrut,
        reqNoAgenda,
        tglSuratMasuk,
        tglDiterimaMasuk,
        reqPerihal,
        payload.dari || "",
        payload.kepada || "SMA YWKA",
        payload.kode_klasifikasi || "",
        payload.keterangan || "",
        lampiranVal
      ];

      // Tulis tepat ke baris target yang seharusnya (BUKAN appendRow di paling bawah!)
      sheet.getRange(targetRowIndex, 1, 1, rowData.length).setValues([rowData]);
      var dObj1 = parseDateForSheet(payload.tanggal_surat || tglSuratMasuk);
      var dObj2 = parseDateForSheet(payload.tanggal_diterima || tglDiterimaMasuk);
      if (dObj1 instanceof Date) { sheet.getRange(targetRowIndex, 3).setValue(dObj1).setNumberFormat("dd/mm/yyyy"); }
      else if (tglSuratMasuk) { sheet.getRange(targetRowIndex, 3).setValue(tglSuratMasuk); }
      if (dObj2 instanceof Date) { sheet.getRange(targetRowIndex, 4).setValue(dObj2).setNumberFormat("dd/mm/yyyy"); }
      else if (tglDiterimaMasuk) { sheet.getRange(targetRowIndex, 4).setValue(tglDiterimaMasuk); }
      try { repairDateCells(sheet); } catch (e) {}
      try {
        sheet.getRange(targetRowIndex, 1, 1, rowData.length).setBorder(true, true, true, true, true, true);
      } catch (e) {}

      return createJsonResponse({
        status: "success",
        message: "Surat Masuk no. urut " + finalNoUrut + " berhasil disimpan ke baris yang tepat (" + targetRowIndex + ") di Spreadsheet & Drive!",
        no_urut: finalNoUrut,
        no_agenda: reqNoAgenda,
        target_row: targetRowIndex,
        drive_file_url: driveFileUrl
      });
    }

    // ==========================================
    // 6. EDIT / PERBARUI DATA SURAT MASUK
    // ==========================================
    if (action === "edit_surat_masuk") {
      const sheet = ss.getSheetByName(SHEET_SURAT_MASUK);
      if (!sheet) {
        return createJsonResponse({ status: "error", message: "Sheet " + SHEET_SURAT_MASUK + " tidak ditemukan!" });
      }

      const oldAgendaStr = String(payload.old_no_agenda || payload.no_agenda || "").trim();
      const oldNoUrutStr = String(payload.old_no_urut || payload.no_urut || "").trim();
      const newAgendaStr = String(payload.no_agenda || oldAgendaStr).trim();
      const newNoUrutStr = String(payload.no_urut || oldNoUrutStr).trim();
      
      let driveFileUrl = "";
      if (payload.fileBase64 && payload.fileName) {
        driveFileUrl = uploadFileToGoogleDrive(
          payload.fileBase64,
          payload.fileName,
          payload.fileMime || "application/pdf",
          "Surat Masuk 2026"
        );
      }

      const lastRow = Math.min(sheet.getLastRow(), 310);
      let foundRow = -1;
      if (payload.row_index && Number(payload.row_index) >= 4 && Number(payload.row_index) <= sheet.getLastRow()) {
        foundRow = Number(payload.row_index);
      }
      if (foundRow < 0 && lastRow >= 4) {
        const totalScan = lastRow - 3;
        const dataScan = sheet.getRange(4, 1, totalScan, 5).getValues(); // Col A s/d E

        // 1. Cari berdasarkan no agenda lama / baru
        for (let i = 0; i < totalScan; i++) {
          const rowAgenda = String(dataScan[i][1]).trim();
          if (oldAgendaStr && rowAgenda.toLowerCase() === oldAgendaStr.toLowerCase()) {
            foundRow = i + 4;
            break;
          }
        }

        // 2. Jika belum ketemu, cari berdasarkan no urut
        if (foundRow < 0 && (oldNoUrutStr || newNoUrutStr)) {
          const searchUrut = oldNoUrutStr || newNoUrutStr;
          for (let i = 0; i < totalScan; i++) {
            const rowUrut = String(dataScan[i][0]).trim();
            if (rowUrut === searchUrut) {
              foundRow = i + 4;
              break;
            }
          }
        }

        // 3. Jika belum ketemu, cari berdasarkan perihal
        if (foundRow < 0 && payload.perihal) {
          const searchPerihal = String(payload.perihal).trim().toLowerCase();
          for (let i = 0; i < totalScan; i++) {
            const rowPerihal = String(dataScan[i][4]).trim().toLowerCase();
            if (rowPerihal && searchPerihal.length > 15 && rowPerihal === searchPerihal) {
              foundRow = i + 4;
              break;
            }
          }
        }
      }

      if (foundRow > 0) {
        const existingValues = sheet.getRange(foundRow, 1, 1, 10).getValues()[0];
        const existingLampiran = existingValues[9] || "Surat Masuk";
        const finalLampiran = driveFileUrl || existingLampiran;

        const tglSuratMasuk = formatToIndoDate(payload.tanggal_surat || "");
        const tglDiterimaMasuk = formatToIndoDate(payload.tanggal_diterima || "");

        const rowData = [
          newNoUrutStr || existingValues[0],
          newAgendaStr,
          tglSuratMasuk,
          tglDiterimaMasuk,
          payload.perihal || "",
          payload.dari || "",
          payload.kepada || "SMA YWKA",
          payload.kode_klasifikasi || "",
          payload.keterangan || "",
          finalLampiran
        ];

        sheet.getRange(foundRow, 1, 1, rowData.length).setValues([rowData]);
        var dEdit1 = parseDateForSheet(payload.tanggal_surat || tglSuratMasuk);
        var dEdit2 = parseDateForSheet(payload.tanggal_diterima || tglDiterimaMasuk);
        if (dEdit1 instanceof Date) { sheet.getRange(foundRow, 3).setValue(dEdit1).setNumberFormat("dd/mm/yyyy"); }
        else if (tglSuratMasuk) { sheet.getRange(foundRow, 3).setValue(tglSuratMasuk); }
        if (dEdit2 instanceof Date) { sheet.getRange(foundRow, 4).setValue(dEdit2).setNumberFormat("dd/mm/yyyy"); }
        else if (tglDiterimaMasuk) { sheet.getRange(foundRow, 4).setValue(tglDiterimaMasuk); }
        try { repairDateCells(sheet); } catch (e) {}

        return createJsonResponse({
          status: "success",
          message: "Data Surat Masuk " + (newAgendaStr || newNoUrutStr) + " berhasil diperbarui di Spreadsheet!",
          no_agenda: newAgendaStr,
          no_urut: newNoUrutStr || existingValues[0],
          target_row: foundRow,
          drive_file_url: finalLampiran
        });
      } else {
        return createJsonResponse({ status: "error", message: "Baris surat masuk " + (oldAgendaStr || oldNoUrutStr) + " tidak ditemukan di Spreadsheet!" });
      }
    }

    // ==========================================
    // 7. UPLOAD BERKAS SURAT MASUK KE DRIVE PER AGENDA
    // ==========================================
    if (action === "upload_lampiran_masuk") {
      const sheet = ss.getSheetByName(SHEET_SURAT_MASUK);
      if (!sheet) {
        return createJsonResponse({ status: "error", message: "Sheet " + SHEET_SURAT_MASUK + " tidak ditemukan!" });
      }

      const noAgendaStr = String(payload.no_agenda || "").trim();
      const noUrutStr = String(payload.no_urut || "").trim();
      if (!payload.fileBase64 || !payload.fileName) {
        return createJsonResponse({ status: "error", message: "Berkas upload tidak ditemukan!" });
      }

      const driveUrl = uploadFileToGoogleDrive(
        payload.fileBase64,
        payload.fileName,
        payload.fileMime || "application/pdf",
        "Surat Masuk 2026"
      );

      if (!driveUrl) {
        return createJsonResponse({ status: "error", message: "Gagal mengunggah berkas ke Google Drive!" });
      }

      const lastRow = sheet.getLastRow();
      let foundRow = -1;
      if (lastRow >= 4) {
        const totalScan = lastRow - 3;
        const agendaColValues = sheet.getRange(4, 2, totalScan, 1).getValues();
        const urutColValues = sheet.getRange(4, 1, totalScan, 1).getValues();
        for (let i = 0; i < totalScan; i++) {
          if ((noAgendaStr && String(agendaColValues[i][0]).trim() === noAgendaStr) ||
              (noUrutStr && String(urutColValues[i][0]).trim() === noUrutStr)) {
            foundRow = i + 4;
            break;
          }
        }
      }

      if (foundRow > 0) {
        sheet.getRange(foundRow, 10).setValue(driveUrl);
      }

      return createJsonResponse({
        status: "success",
        message: "Berkas berhasil diupload ke Google Drive Surat Masuk!",
        drive_file_url: driveUrl,
        no_agenda: noAgendaStr,
        target_row: foundRow
      });
    }

    // ==========================================
    // 8. HAPUS DATA SURAT MASUK (DENGAN DUKUNGAN HAPUS DUPLIKAT BERSIH)
    // ==========================================
    if (action === "delete_surat_masuk") {
      const sheet = ss.getSheetByName(SHEET_SURAT_MASUK);
      if (!sheet) {
        return createJsonResponse({ status: "error", message: "Sheet " + SHEET_SURAT_MASUK + " tidak ditemukan!" });
      }

      const noAgendaStr = String(payload.no_agenda || "").trim();
      const noUrutStr = String(payload.no_urut || "").trim();
      const lastRow = sheet.getLastRow();
      const deletedRows = [];

      // 1. Jika dikirim array row_indices (untuk menghapus semua baris duplikat sekaligus)
      if (Array.isArray(payload.row_indices) && payload.row_indices.length > 0) {
        const sortedIndices = payload.row_indices
          .map(function(n) { return parseInt(n, 10); })
          .filter(function(n) { return !isNaN(n) && n >= 4 && n <= sheet.getLastRow(); })
          .sort(function(a, b) { return b - a; }); // Hapus dari baris terbawah agar index baris atas tidak bergeser!

        for (var d = 0; d < sortedIndices.length; d++) {
          try {
            sheet.deleteRow(sortedIndices[d]);
            deletedRows.push(sortedIndices[d]);
          } catch (e) {}
        }
      } else {
        const rowIndex = parseInt(payload.row_index, 10);
        if (!isNaN(rowIndex) && rowIndex >= 4 && rowIndex <= lastRow) {
          sheet.deleteRow(rowIndex);
          deletedRows.push(rowIndex);
        }
      }

      // 2. Jika delete_all_matching true atau masih ada baris duplikat dengan no_agenda yang sama
      if (noAgendaStr && (payload.delete_all_matching || deletedRows.length === 0)) {
        const curLast = sheet.getLastRow();
        if (curLast >= 4) {
          const totalScan = curLast - 3;
          const vals = sheet.getRange(4, 2, totalScan, 1).getValues();
          for (var i = totalScan - 1; i >= 0; i--) {
            if (String(vals[i][0]).trim().toLowerCase() === noAgendaStr.toLowerCase()) {
              var rTarget = i + 4;
              sheet.deleteRow(rTarget);
              deletedRows.push(rTarget);
            }
          }
        }
      }

      return createJsonResponse({
        status: "success",
        message: "Data surat masuk " + (noAgendaStr || noUrutStr) + " (Baris: " + deletedRows.join(", ") + ") berhasil dihapus bersih dari Spreadsheet!",
        no_agenda: noAgendaStr,
        deleted_rows: deletedRows
      });
    }

    // ==========================================
    // 9. DEDUKLIKASI OTOMATIS SELURUH SPREADSHEET
    // ==========================================
    if (action === "clean_duplicates" || action === "clean_duplicate_surat_masuk") {
      const sheet = ss.getSheetByName(SHEET_SURAT_MASUK);
      if (!sheet) {
        return createJsonResponse({ status: "error", message: "Sheet " + SHEET_SURAT_MASUK + " tidak ditemukan!" });
      }

      const lastRow = sheet.getLastRow();
      var removedCount = 0;
      if (lastRow >= 5) {
        const totalRows = lastRow - 3;
        const data = sheet.getRange(4, 1, totalRows, 6).getValues();
        const seenMap = {};
        const rowsToDelete = [];

        // Scan dari baris paling awal ke akhir untuk mencatat duplikat
        for (var i = 0; i < totalRows; i++) {
          var rowAgenda = String(data[i][1] || "").trim().toLowerCase();
          var rowPerihal = String(data[i][4] || "").trim().toLowerCase();
          var actualRow = i + 4;

          var key = "";
          if (rowAgenda && rowAgenda !== "-") {
            key = "agenda:" + rowAgenda;
          } else if (rowPerihal && rowPerihal.length > 10) {
            key = "perihal:" + rowPerihal;
          }

          if (key) {
            if (seenMap[key]) {
              rowsToDelete.push(actualRow);
            } else {
              seenMap[key] = actualRow;
            }
          }
        }

        // Hapus dari bawah ke atas agar nomor baris tidak bergeser
        rowsToDelete.sort(function(a, b) { return b - a; });
        for (var r = 0; r < rowsToDelete.length; r++) {
          try {
            sheet.deleteRow(rowsToDelete[r]);
            removedCount++;
          } catch (e) {}
        }

        // Hapus juga baris apapun di bawah 302 yang salah ter-append ke paling bawah
        if (sheet.getLastRow() > 302) {
          for (var ex = sheet.getLastRow(); ex > 302; ex--) {
            try {
              sheet.deleteRow(ex);
              removedCount++;
            } catch (e) {}
          }
        }
      }

      return createJsonResponse({
        status: "success",
        message: "Deduplikasi selesai! Berhasil membersihkan " + removedCount + " baris ganda di Spreadsheet.",
        removed_count: removedCount
      });
    }

    return createJsonResponse({ status: "error", message: "Aksi tidak dikenali: " + action });
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Fungsi: Membuat/Menyiapkan Folder Google Drive Khusus Surat Keluar & Surat Masuk
 * (Bisa dijalankan langsung di Apps Script editor via tombol Run)
 */
function setupDriveFolders() {
  let mainFolder;
  try {
    mainFolder = DriveApp.getFolderById(FOLDER_DRIVE_ID);
  } catch (e) {
    const folderIter = DriveApp.getFoldersByName(FOLDER_DRIVE_UTAMA);
    if (folderIter.hasNext()) {
      mainFolder = folderIter.next();
    } else {
      mainFolder = DriveApp.createFolder(FOLDER_DRIVE_UTAMA);
    }
  }

  // Folder Surat Keluar 2026
  let folderKeluar;
  const iterKeluar = mainFolder.getFoldersByName("Surat Keluar 2026");
  if (iterKeluar.hasNext()) {
    folderKeluar = iterKeluar.next();
  } else {
    folderKeluar = mainFolder.createFolder("Surat Keluar 2026");
  }
  try {
    folderKeluar.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    Logger.log("Info: Folder Surat Keluar 2026 mewarisi hak akses folder induk.");
  }

  // Folder Surat Masuk 2026
  let folderMasuk;
  const iterMasuk = mainFolder.getFoldersByName("Surat Masuk 2026");
  if (iterMasuk.hasNext()) {
    folderMasuk = iterMasuk.next();
  } else {
    folderMasuk = mainFolder.createFolder("Surat Masuk 2026");
  }
  try {
    folderMasuk.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    Logger.log("Info: Folder Surat Masuk 2026 mewarisi hak akses folder induk.");
  }

  Logger.log("=================================================");
  Logger.log("✅ FOLDER GOOGLE DRIVE BERHASIL DISIAPKAN!");
  Logger.log("📁 Folder Surat Keluar 2026 : " + folderKeluar.getUrl());
  Logger.log("📁 Folder Surat Masuk 2026  : " + folderMasuk.getUrl());
  Logger.log("=================================================");

  return {
    mainFolderUrl: mainFolder.getUrl(),
    suratKeluarUrl: folderKeluar.getUrl(),
    suratMasukUrl: folderMasuk.getUrl()
  };
}

/**
 * Fungsi Pembantu: Mengunggah Berkas Base64 ke Google Drive di Folder Sekolah
 */
function uploadFileToGoogleDrive(base64Data, fileName, mimeType, subfolderName) {
  try {
    let mainFolder;
    try {
      mainFolder = DriveApp.getFolderById(FOLDER_DRIVE_ID);
    } catch (e) {
      const folderIter = DriveApp.getFoldersByName(FOLDER_DRIVE_UTAMA);
      if (folderIter.hasNext()) {
        mainFolder = folderIter.next();
      } else {
        mainFolder = DriveApp.createFolder(FOLDER_DRIVE_UTAMA);
      }
    }

    let targetFolder = mainFolder;
    if (subfolderName) {
      const subIter = mainFolder.getFoldersByName(subfolderName);
      if (subIter.hasNext()) {
        targetFolder = subIter.next();
      } else {
        targetFolder = mainFolder.createFolder(subfolderName);
      }
    }

    const decodedBytes = Utilities.base64Decode(base64Data);
    const blob = Utilities.newBlob(decodedBytes, mimeType, fileName);
    const driveFile = targetFolder.createFile(blob);

    try {
      driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e) {}

    return driveFile.getUrl();
  } catch (err) {
    Logger.log("Gagal upload berkas ke Google Drive: " + err.toString());
    return "";
  }
}