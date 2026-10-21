/**
 * ===================================================================
 * GOOGLE APPS SCRIPT - SISTEM AGENDA SURAT SMA YWKA BANDUNG
 * VERSI 2.0 (DILENGKAPI FITUR AUTO-UPLOAD KE GOOGLE DRIVE)
 * ===================================================================
 * 
 * PANDUAN PEMASANGAN:
 * 1. Buka Google Spreadsheet SMA YWKA Anda di browser:
 *    https://docs.google.com/spreadsheets/d/1RzsLrm9_FOUUzDjyq60zyGBkrADROCtdrnRGvecST3k/edit?gid=381566345#gid=381566345
 * 2. Klik menu "Ekstensi" (Extensions) > "Apps Script".
 * 3. Hapus semua teks yang ada di editor Apps Script.
 * 4. Salin (Copy) seluruh isi file ini, lalu Tempel (Paste) ke editor tersebut.
 * 5. Klik ikon Simpan (Save).
 * 6. Klik tombol "Deploy" (di kanan atas) > "Manage deployments" (atau "New deployment").
 * 7. Pada tipe deployment pilih "Web app".
 * 8. Atur:
 *    - Description: "API Agenda Surat SMA YWKA v2 - Drive Upload"
 *    - Execute as: "Me" (email Anda)
 *    - Who has access: "Anyone" (Siapa saja yang memiliki link)
 * 9. Klik "Deploy", izinkan akses (Authorize access) Google Drive & Sheets.
 * 10. Salin "Web app URL" (akhiran /exec) dan tempelkan ke aplikasi web Anda!
 */

// Konstanta Nama Sheet sesuai berkas asli
const SHEET_SURAT_KELUAR = "SURAT KELUAR 2026";
const SHEET_SURAT_MASUK = "SURAT MASUK 2026";
const FOLDER_DRIVE_ID = "1e3YGwqV7cK0f7LVGyyxClgC7hTtVEL8A"; // Folder Resmi SMA YWKA
const FOLDER_DRIVE_UTAMA = "Arsip Surat SMA YWKA";

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

    if (action === "get_data") {
      const type = (e.parameter && e.parameter.type) || "keluar";
      const sheetName = type === "masuk" ? SHEET_SURAT_MASUK : SHEET_SURAT_KELUAR;
      const sheet = ss.getSheetByName(sheetName);
      
      if (!sheet) {
        return createJsonResponse({ status: "error", message: "Sheet tidak ditemukan: " + sheetName });
      }

      const values = sheet.getDataRange().getValues();
      return createJsonResponse({
        status: "success",
        sheet: sheetName,
        totalRows: values.length,
        data: values.slice(11) // Data dimulai dari baris 12 (indeks 11)
      });
    }

    return createJsonResponse({ status: "error", message: "Aksi tidak dikenal: " + action });
  } catch (err) {
    return createJsonResponse({ status: "error", message: err.toString() });
  }
}

/**
 * Handle HTTP POST Request (Simpan baris surat + Upload file ke Google Drive)
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

      const kodePrefix = payload.kode_klasifikasi.endsWith("/") 
        ? payload.kode_klasifikasi 
        : payload.kode_klasifikasi + "/";

      const tahunSuffix = payload.tahun ? "/" + payload.tahun.replace("/", "").trim() : "/2026";
      const noAgendaStr = String(payload.nomor_urut).trim();
      const bulanRomawi = payload.bulan_romawi || "I";
      const perihal = payload.perihal || "";
      const dari = payload.dari || "Syarif Hasanudin, S.Pd., Gr., M.M.";
      const kepada = payload.kepada || "";
      const petugas = payload.petugas || "";
      const keterangan = payload.keterangan || "";
      const tglSurat = payload.tanggal_surat || "";

      // Nilai lampiran: jika ada link drive gunakan rumus HYPERLINK atau link
      let lampiranVal = "Surat Keluar";
      if (driveFileUrl) {
        lampiranVal = driveFileUrl;
      }

      // 1.B. Cek apakah nomor agenda ini sudah ada slot kosong di spreadsheet (misal baris 608-625)
      const lastRow = sheet.getLastRow();
      let targetRowIndex = -1;
      let nextNoUrut = 1;

      if (lastRow >= 12) {
        // Cek apakah ada baris yang kolom D (Agenda) sama dan perihal kosong
        const agendaColValues = sheet.getRange(12, 4, lastRow - 11, 1).getValues();
        const perihalColValues = sheet.getRange(12, 9, lastRow - 11, 1).getValues();
        const noUrutValues = sheet.getRange(12, 1, lastRow - 11, 1).getValues();

        for (let i = 0; i < agendaColValues.length; i++) {
          const rowAgenda = String(agendaColValues[i][0]).trim();
          const rowPerihal = String(perihalColValues[i][0]).trim();
          const rowUrut = parseInt(noUrutValues[i][0], 10);
          if (!isNaN(rowUrut) && rowUrut >= nextNoUrut) {
            nextNoUrut = rowUrut + 1;
          }

          if (rowAgenda === noAgendaStr && (!rowPerihal || rowPerihal === "")) {
            targetRowIndex = i + 12; // 12-indexed
            break;
          }
        }
      }

      const rowData = [
        payload.no_urut || nextNoUrut,
        true,
        kodePrefix,
        noAgendaStr,
        "/SMA YWKA/TU/",
        bulanRomawi,
        tahunSuffix,
        tglSurat,
        perihal,
        dari,
        kepada,
        petugas,
        keterangan,
        lampiranVal
      ];

      if (targetRowIndex > 0) {
        // Perbarui baris yang sudah disediakan
        sheet.getRange(targetRowIndex, 1, 1, rowData.length).setValues([rowData]);
      } else {
        // Tambahkan baris baru di paling bawah
        sheet.appendRow(rowData);
        targetRowIndex = sheet.getLastRow();
      }

      // Berikan style border tipis ke baris
      sheet.getRange(targetRowIndex, 1, 1, rowData.length).setBorder(true, true, true, true, true, true);

      const fullGenerated = `${kodePrefix}${noAgendaStr}/SMA YWKA/TU/${bulanRomawi}${tahunSuffix}`;

      return createJsonResponse({
        status: "success",
        message: "Surat Keluar berhasil disimpan ke Google Sheets!",
        no_agenda: noAgendaStr,
        no_urut: payload.no_urut || nextNoUrut,
        nomor_lengkap: fullGenerated,
        drive_file_url: driveFileUrl
      });
    }

    // ==========================================
    // 2. SIMPAN SURAT MASUK KE SPREADSHEET
    // ==========================================
    if (action === "create_surat_masuk") {
      const sheet = ss.getSheetByName(SHEET_SURAT_MASUK);
      if (!sheet) {
        return createJsonResponse({ status: "error", message: "Sheet " + SHEET_SURAT_MASUK + " tidak ditemukan!" });
      }

      // 2.A. Upload berkas scan surat masuk ke Drive jika ada
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
      if (lastRow >= 12) {
        const lastVal = sheet.getRange(lastRow, 1).getValue();
        if (!isNaN(parseInt(lastVal, 10))) {
          nextNoUrut = parseInt(lastVal, 10) + 1;
        }
      }

      let lampiranVal = payload.lampiran || "Surat Masuk";
      if (driveFileUrl) {
        lampiranVal = driveFileUrl;
      }

      const rowData = [
        payload.no_urut || nextNoUrut,
        payload.no_agenda || "",
        payload.tanggal_surat || "",
        payload.tanggal_diterima || "",
        payload.perihal || "",
        payload.dari || "",
        payload.kepada || "SMA YWKA",
        payload.kode_klasifikasi || "",
        payload.keterangan || "",
        lampiranVal
      ];

      sheet.appendRow(rowData);
      const newRowIdx = sheet.getLastRow();
      sheet.getRange(newRowIdx, 1, 1, rowData.length).setBorder(true, true, true, true, true, true);

      return createJsonResponse({
        status: "success",
        message: "Surat Masuk berhasil disimpan ke Google Sheets!",
        no_urut: nextNoUrut,
        no_agenda: payload.no_agenda,
        drive_file_url: driveFileUrl
      });
    }

    return createJsonResponse({ status: "error", message: "Aksi tidak dikenali: " + action });
  } catch (err) {
    return createJsonResponse({ status: "error", message: err.toString() });
  }
}

/**
 * Fungsi Pembantu: Mengunggah Berkas Base64 ke Google Drive di Folder Sekolah
 */
function uploadFileToGoogleDrive(base64Data, fileName, mimeType, subfolderName) {
  try {
    // 1. Ambil folder Google Drive resmi SMA YWKA berdasarkan ID
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

    // 2. Cari atau buat subfolder jika diinginkan (misal: Surat Keluar 2026), atau simpan langsung di folder utama
    let targetFolder = mainFolder;
    if (subfolderName) {
      const subIter = mainFolder.getFoldersByName(subfolderName);
      if (subIter.hasNext()) {
        targetFolder = subIter.next();
      } else {
        targetFolder = mainFolder.createFolder(subfolderName);
      }
    }

    // 3. Dekode Base64 menjadi Blob berkas
    const decodedBytes = Utilities.base64Decode(base64Data);
    const blob = Utilities.newBlob(decodedBytes, mimeType, fileName);

    // 4. Buat berkas di folder Google Drive
    const driveFile = targetFolder.createFile(blob);

    // 5. Berikan izin baca publik/sekolah via tautan
    driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return driveFile.getUrl();
  } catch (err) {
    Logger.log("Gagal upload berkas ke Google Drive: " + err.toString());
    return "";
  }
}

/**
 * Helper untuk response JSON dengan CORS Header terbuka
 */
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
