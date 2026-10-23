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
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (action === "ping") {
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
    if (e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else {
      payload = e.parameter || {};
    }

    const action = payload.action;
    const ss = SpreadsheetApp.getActiveSpreadsheet();

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
      if (lastRow >= 4) {
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
    // 5. SIMPAN SURAT MASUK KE SPREADSHEET
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

      const lastRow = sheet.getLastRow();
      let nextNoUrut = 1;
      let existingDuplicateRow = -1;

      // Cek apakah data surat masuk dengan no_agenda & perihal yang sama sudah ada di baris-baris akhir
      if (lastRow >= 4) {
        const scanCount = Math.min(30, lastRow - 3);
        const startRow = lastRow - scanCount + 1;
        const vals = sheet.getRange(startRow, 1, scanCount, 6).getValues();
        const targetAgenda = String(payload.no_agenda || "").trim().toLowerCase();
        const targetPerihal = String(payload.perihal || "").trim().toLowerCase();

        for (let s = scanCount - 1; s >= 0; s--) {
          const rowUrutVal = vals[s][0];
          if (!isNaN(parseInt(rowUrutVal, 10)) && parseInt(rowUrutVal, 10) >= nextNoUrut) {
            nextNoUrut = parseInt(rowUrutVal, 10) + 1;
          }
          const rowAgenda = String(vals[s][1] || "").trim().toLowerCase();
          const rowPerihal = String(vals[s][4] || "").trim().toLowerCase();

          if (targetAgenda && rowAgenda === targetAgenda) {
            existingDuplicateRow = startRow + s;
            break;
          } else if (targetPerihal && rowPerihal === targetPerihal && targetPerihal.length > 10) {
            existingDuplicateRow = startRow + s;
            break;
          }
        }
      }

      let lampiranVal = payload.lampiran || "Surat Masuk";
      if (driveFileUrl) {
        lampiranVal = driveFileUrl;
      }

      // Format Tanggal: DIJAMIN selalu DD/MM/YYYY
      const tglSuratMasuk = formatToIndoDate(payload.tanggal_surat || "");
      const tglDiterimaMasuk = formatToIndoDate(payload.tanggal_diterima || "");

      const rowData = [
        payload.no_urut || nextNoUrut,
        payload.no_agenda || "",
        tglSuratMasuk,
        tglDiterimaMasuk,
        payload.perihal || "",
        payload.dari || "",
        payload.kepada || "SMA YWKA",
        payload.kode_klasifikasi || "",
        payload.keterangan || "",
        lampiranVal
      ];

      // Jika surat ini SUDAH PERNAH TERSIMPAN sebelumnya, perbarui baris yang sudah ada (JANGAN DUPLIKAT!)
      if (existingDuplicateRow > 0) {
        sheet.getRange(existingDuplicateRow, 1, 1, rowData.length).setValues([rowData]);
        sheet.getRange(existingDuplicateRow, 3).setNumberFormat("@").setValue(tglSuratMasuk);
        sheet.getRange(existingDuplicateRow, 4).setNumberFormat("@").setValue(tglDiterimaMasuk);

        return createJsonResponse({
          status: "success",
          message: "Data Surat Masuk diperbarui pada baris yang sudah ada (duplikasi dicegah)!",
          no_urut: payload.no_urut || nextNoUrut,
          no_agenda: payload.no_agenda,
          target_row: existingDuplicateRow,
          drive_file_url: driveFileUrl
        });
      }

      sheet.appendRow(rowData);
      const newRowIdx = sheet.getLastRow();
      try {
        sheet.getRange(newRowIdx, 1, 1, rowData.length).setBorder(true, true, true, true, true, true);
        sheet.getRange(newRowIdx, 3).setNumberFormat("@").setValue(tglSuratMasuk);
        sheet.getRange(newRowIdx, 4).setNumberFormat("@").setValue(tglDiterimaMasuk);
      } catch (e) {}

      return createJsonResponse({
        status: "success",
        message: "Surat Masuk berhasil disimpan ke Google Sheets & Google Drive!",
        no_urut: payload.no_urut || nextNoUrut,
        no_agenda: payload.no_agenda,
        target_row: newRowIdx,
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
      
      let driveFileUrl = "";
      if (payload.fileBase64 && payload.fileName) {
        driveFileUrl = uploadFileToGoogleDrive(
          payload.fileBase64,
          payload.fileName,
          payload.fileMime || "application/pdf",
          "Surat Masuk 2026"
        );
      }

      const lastRow = sheet.getLastRow();
      let foundRow = -1;
      if (lastRow >= 4) {
        const totalScan = lastRow - 3;
        const agendaColValues = sheet.getRange(4, 2, totalScan, 1).getValues(); // Col B (No Agenda)
        const urutColValues = sheet.getRange(4, 1, totalScan, 1).getValues();   // Col A (No Urut)

        for (let i = 0; i < totalScan; i++) {
          const rowAgenda = String(agendaColValues[i][0]).trim();
          const rowUrut = String(urutColValues[i][0]).trim();
          if ((oldAgendaStr && rowAgenda === oldAgendaStr) || (oldNoUrutStr && rowUrut === oldNoUrutStr)) {
            foundRow = i + 4;
            break;
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
          payload.no_urut || existingValues[0],
          payload.no_agenda || existingValues[1],
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
        sheet.getRange(foundRow, 3).setNumberFormat("@").setValue(tglSuratMasuk);
        sheet.getRange(foundRow, 4).setNumberFormat("@").setValue(tglDiterimaMasuk);

        return createJsonResponse({
          status: "success",
          message: "Data Surat Masuk " + (payload.no_agenda || oldAgendaStr) + " berhasil diperbarui di Spreadsheet!",
          no_agenda: payload.no_agenda,
          target_row: foundRow,
          drive_file_url: finalLampiran
        });
      } else {
        return createJsonResponse({ status: "error", message: "Baris surat masuk " + oldAgendaStr + " tidak ditemukan di Spreadsheet!" });
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
