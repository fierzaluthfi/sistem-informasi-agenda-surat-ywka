/**
 * ===================================================================
 * GOOGLE APPS SCRIPT - SISTEM AGENDA SURAT SMA YWKA BANDUNG
 * VERSI 2.5 (NO. URUT MENGIKUTI NO. AGENDA & DRIVE AUTO-SETUP)
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

      const values = sheet.getDataRange().getValues();
      return createJsonResponse({
        status: "success",
        sheet: sheetName,
        totalRows: values.length,
        data: values.slice(3) // Data dimulai dari baris ke-4 (indeks 3)
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

      const rawKode = payload.kode_klasifikasi || "421.3";
      const kodePrefix = rawKode.endsWith("/") ? rawKode : rawKode + "/";
      const tahunSuffix = payload.tahun ? "/" + payload.tahun.replace("/", "").trim() : "/2026";
      
      // Nomor Agenda yang digunakan (misal: 608, 609, dst)
      const noAgendaStr = String(payload.no_agenda || payload.nomor_urut || "").trim();
      const bulanRomawi = payload.bulan_romawi || "X";
      const perihal = payload.perihal || "";
      const dari = payload.dari || "Syarif Hasanudin, S.Pd., Gr., M.M.";
      const kepada = payload.kepada || "";
      const petugas = payload.petugas || "";
      const keterangan = payload.keterangan || "";
      const tglSurat = payload.tanggal_surat || "";

      // Nilai lampiran: jika ada link file drive gunakan url tersebut
      let lampiranVal = "Surat Keluar";
      if (driveFileUrl) {
        lampiranVal = driveFileUrl;
      }

      // 1.B. Nomor Urut mengikuti Nomor Agenda (608, 609, dan seterusnya)
      const rowNoUrut = noAgendaStr || payload.no_urut || "609";

      // 1.C. Cek apakah nomor agenda ini sudah ada slot kosong di spreadsheet (misal baris 609-625)
      const lastRow = sheet.getLastRow();
      let targetRowIndex = -1;

      if (lastRow >= 4) {
        // Cek baris mulai baris 4
        const totalScan = lastRow - 3;
        const agendaColValues = sheet.getRange(4, 4, totalScan, 1).getValues(); // Kolom D (Agenda)
        const perihalColValues = sheet.getRange(4, 9, totalScan, 1).getValues(); // Kolom I (Perihal)

        for (let i = 0; i < agendaColValues.length; i++) {
          const rowAgenda = String(agendaColValues[i][0]).trim();
          const rowPerihal = String(perihalColValues[i][0]).trim();

          // Jika slot no agenda sama dan perihal masih kosong, gunakan baris tersebut
          if (rowAgenda === noAgendaStr && (!rowPerihal || rowPerihal === "")) {
            targetRowIndex = i + 4;
            break;
          }
        }
      }

      // Format baris sesuai kolom asli spreadsheet:
      // A: NO. URUT (mengikuti No. Agenda)
      // B: Checkbox (TRUE)
      // C: KODE KLASIFIKASI PREFIX (misal 421.7/)
      // D: NO. AGENDA (misal 609)
      // E: /SMA YWKA/TU/
      // F: BULAN ROMAWI (misal X)
      // G: TAHUN (misal /2026)
      // H: TGL SURAT
      // I: PRIHAL / ISI RINGKASAN SURAT
      // J: DARI
      // K: KEPADA
      // L: KODE KLASIFIKASI / PETUGAS
      // M: KETERANGAN
      // N: Lampiran Fisik (URL Drive atau 'Surat Keluar')
      const rowData = [
        rowNoUrut,
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
        // Perbarui baris yang sudah disediakan di spreadsheet
        sheet.getRange(targetRowIndex, 1, 1, rowData.length).setValues([rowData]);
      } else {
        // Tambahkan baris baru di paling bawah jika belum ada slot
        sheet.appendRow(rowData);
        targetRowIndex = sheet.getLastRow();
      }

      // Berikan style border tipis ke baris yang baru terisi
      try {
        sheet.getRange(targetRowIndex, 1, 1, rowData.length).setBorder(true, true, true, true, true, true);
      } catch (e) {
        // Abaikan jika permission border terbatas
      }

      const fullGenerated = `${kodePrefix}${noAgendaStr}/SMA YWKA/TU/${bulanRomawi}${tahunSuffix}`.replace(/\/{2,}/g, "/");

      return createJsonResponse({
        status: "success",
        message: "Surat Keluar berhasil disimpan ke Google Sheets & Google Drive!",
        no_agenda: noAgendaStr,
        no_urut: rowNoUrut,
        nomor_lengkap: fullGenerated,
        target_row: targetRowIndex,
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
      if (lastRow >= 4) {
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
      try {
        sheet.getRange(newRowIdx, 1, 1, rowData.length).setBorder(true, true, true, true, true, true);
      } catch (e) {}

      return createJsonResponse({
        status: "success",
        message: "Surat Masuk berhasil disimpan ke Google Sheets & Google Drive!",
        no_urut: payload.no_urut || nextNoUrut,
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
  folderKeluar.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // Folder Surat Masuk 2026
  let folderMasuk;
  const iterMasuk = mainFolder.getFoldersByName("Surat Masuk 2026");
  if (iterMasuk.hasNext()) {
    folderMasuk = iterMasuk.next();
  } else {
    folderMasuk = mainFolder.createFolder("Surat Masuk 2026");
  }
  folderMasuk.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

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
    // 1. Ambil folder Google Drive resmi SMA YWKA
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

    // 2. Buat atau ambil subfolder (Surat Keluar 2026 / Surat Masuk 2026)
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
