/**
 * ===================================================================
 * GOOGLE APPS SCRIPT - SISTEM AGENDA SURAT SMA YWKA BANDUNG
 * VERSI 3.1 (PENCEGAHAN TOTAL SALAH BARIS EDIT + AUTO-RAPIKAN AGENDA 612-620)
 * ===================================================================
 * 
 * PANDUAN CEPAT PERBAIKAN:
 * 1. Buka Google Spreadsheet SMA YWKA Anda di browser:
 *    https://docs.google.com/spreadsheets/d/1RzsLrm9_FOUUzDjyq60zyGBkrADROCtdrnRGvecST3k/edit?gid=381566345#gid=381566345
 * 2. Klik menu "Ekstensi" (Extensions) > "Apps Script".
 * 3. Hapus semua teks yang ada di editor Apps Script.
 * 4. Salin (Copy) seluruh isi file ini, lalu Tempel (Paste) ke editor tersebut.
 * 5. Klik ikon Simpan (Save).
 * 6. (PILIHAN 1): Pilih fungsi "rapikanNomorAgendaKeluar" lalu klik "Run/Jalankan"
 *    untuk langsung memulihkan susunan nomor agenda 612 s/d 620 yang sempat acak-acakan!
 * 7. (PILIHAN 2): Pilih fungsi "bersihkanDuplikatDrive" untuk otomatis membersihkan duplikat Drive!
 * 8. Klik tombol "Deploy" (di kanan atas) > "Manage deployments" (atau "New deployment").
 * 9. Jika Manage deployments: klik ikon pensil (Edit), pilih Version: "New version",
 *    - Execute as: "Me" (email Anda)
 *    - Who has access: "Anyone" (Siapa saja yang memiliki link) -> PENTING!
 * 10. Klik "Deploy", izinkan akses (Authorize access) Google Drive & Sheets.
 * 11. Salin "Web app URL" (akhiran /exec) dan tempelkan ke aplikasi web Anda di menu "Koneksi Spreadsheet"!
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
  } catch (e) { }
  try {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch (e) {
    throw new Error("Gagal membuka Spreadsheet SMA YWKA (ID: " + SPREADSHEET_ID + "): " + e.toString());
  }
}

/**
 * ===================================================================
 * FUNGSI PERBAIKAN MANDIRI (BISA LANGSUNG DIJALANKAN DARI APPS SCRIPT):
 * ===================================================================
 * Pilih fungsi ini di dropdown atas editor Apps Script lalu klik "Run/Jalankan":
 * 1. "rapikanNomorAgendaKeluar": Otomatis memulihkan urutan nomor agenda 612 s/d 620 yang sempat acak-acakan/duplikat!
 * 2. "bersihkanDuplikatDrive": Otomatis membersihkan seluruh file duplikat lama di Google Drive,
 *    menyisakan 1 file versi terbaru untuk setiap nomor agenda & nama file.
 * 3. "perbaikiBarisSuratMasuk": Otomatis merelokasi surat No. Urut 215 di baris 302 ke baris 214.
 */
/**
 * ===================================================================
 * FUNGSI PEMBERSIH DUPLIKAT GOOGLE DRIVE (BISA DIJALANKAN MANDIRI DARI APPS SCRIPT):
 * ===================================================================
 * Memindai folder "Surat Keluar 2026" dan "Surat Masuk 2026".
 * Otomatis mendeteksi file yang terduplikasi (nama file sama persis atau nomor agenda sama).
 * Menyimpan 1 file TERBARU (berdasarkan tanggal update), dan memindahkan file lama ke Sampah (Trash).
 */
function bersihkanDuplikatDrive() {
  const result = {
    keluarDibersihkan: 0,
    masukDibersihkan: 0,
    detail: []
  };

  let mainFolder;
  try {
    mainFolder = DriveApp.getFolderById(FOLDER_DRIVE_ID);
  } catch (e) {
    const folderIter = DriveApp.getFoldersByName(FOLDER_DRIVE_UTAMA);
    if (folderIter.hasNext()) {
      mainFolder = folderIter.next();
    }
  }

  if (!mainFolder) {
    Logger.log("Folder arsip utama SMA YWKA tidak ditemukan!");
    return result;
  }

  const ss = getTargetSpreadsheet();

  // 1. Bersihkan Folder Surat Keluar 2026
  const folderKeluarIter = mainFolder.getFoldersByName("Surat Keluar 2026");
  if (folderKeluarIter.hasNext()) {
    const fKeluar = folderKeluarIter.next();
    const sheetKeluar = ss ? ss.getSheetByName(SHEET_SURAT_KELUAR) : null;
    result.keluarDibersihkan = dedupFolder(fKeluar, result.detail, "Surat Keluar 2026", sheetKeluar, "keluar");
  }

  // 2. Bersihkan Folder Surat Masuk 2026
  const folderMasukIter = mainFolder.getFoldersByName("Surat Masuk 2026");
  if (folderMasukIter.hasNext()) {
    const fMasuk = folderMasukIter.next();
    const sheetMasuk = ss ? ss.getSheetByName(SHEET_SURAT_MASUK) : null;
    result.masukDibersihkan = dedupFolder(fMasuk, result.detail, "Surat Masuk 2026", sheetMasuk, "masuk");
  }

  Logger.log("=================================================");
  Logger.log("🧹 HASIL PEMBERSIHAN DUPLIKAT GOOGLE DRIVE:");
  Logger.log("📁 Surat Keluar duplikat dibuang ke Sampah: " + result.keluarDibersihkan);
  Logger.log("📁 Surat Masuk duplikat dibuang ke Sampah : " + result.masukDibersihkan);
  Logger.log("=================================================");

  return result;
}

function dedupFolder(folder, detailLog, folderName, sheet, sheetType) {
  let cleanedCount = 0;
  const filesIter = folder.getFiles();
  const fileGroups = {};

  while (filesIter.hasNext()) {
    const f = filesIter.next();
    if (f.isTrashed()) continue;

    const rawName = f.getName().trim();
    const normName = rawName.toLowerCase();

    // Deteksi nomor agenda di awal nama: "No. 619 ...", "No 619 ...", "619 - ..."
    let agendaKey = "";
    const agendaMatch = rawName.match(/^(?:no\.?|surat|agenda)?\s*([0-9]+(?:\.[a-z0-9]+)?)\b/i);
    if (agendaMatch && agendaMatch[1]) {
      agendaKey = "agenda_" + agendaMatch[1].toLowerCase();
    }

    const groupKey = agendaKey || normName;

    if (!fileGroups[groupKey]) {
      fileGroups[groupKey] = [];
    }
    fileGroups[groupKey].push({
      file: f,
      name: rawName,
      lastUpdated: f.getLastUpdated().getTime(),
      created: f.getDateCreated().getTime(),
      id: f.getId(),
      url: f.getUrl(),
      agendaNumber: agendaMatch ? agendaMatch[1] : ""
    });
  }

  // Proses setiap kelompok yang memiliki file ganda
  for (const key in fileGroups) {
    const group = fileGroups[key];
    if (group.length > 1) {
      // Urutkan dari yang paling baru diupdate ke yang lama
      group.sort(function (a, b) {
        return b.lastUpdated - a.lastUpdated;
      });

      const keptFile = group[0]; // Versi paling mutakhir dipertahankan

      for (let i = 1; i < group.length; i++) {
        const dup = group[i];
        try {
          dup.file.setTrashed(true);
          cleanedCount++;
          const logMsg = "[" + folderName + "] Membuang duplikat lama ke Sampah: \"" + dup.name + "\" (ID: " + dup.id + ") -> Menyisakan versi terbaru";
          detailLog.push(logMsg);
          Logger.log(logMsg);
        } catch (err) {
          Logger.log("Gagal membuang duplikat " + dup.name + ": " + err.toString());
        }
      }

      // Sinkronkan kembali URL berkas terbaru ke Google Spreadsheet jika ada nomor agenda
      if (sheet && keptFile.agendaNumber) {
        try {
          if (sheetType === "keluar") {
            const lastRow = sheet.getLastRow();
            if (lastRow >= 4) {
              const colD = sheet.getRange(4, 4, lastRow - 3, 1).getValues();
              for (let r = 0; r < colD.length; r++) {
                if (String(colD[r][0]).trim().toLowerCase() === keptFile.agendaNumber.toLowerCase()) {
                  sheet.getRange(r + 4, 2).setValue(true);
                  sheet.getRange(r + 4, 14).setValue(keptFile.url);
                  break;
                }
              }
            }
          } else if (sheetType === "masuk") {
            const lastRow = sheet.getLastRow();
            if (lastRow >= 2) {
              const colB = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
              for (let r = 0; r < colB.length; r++) {
                if (String(colB[r][0]).trim().toLowerCase() === keptFile.agendaNumber.toLowerCase()) {
                  sheet.getRange(r + 2, 10).setValue(keptFile.url);
                  break;
                }
              }
            }
          }
        } catch (e) {
          Logger.log("Info sinkron link sheet setelah dedup: " + e.toString());
        }
      }
    }
  }

  return cleanedCount;
}

/**
 * ===================================================================
 * FUNGSI PERBAIKAN URUTAN SURAT KELUAR (BISA DIJALANKAN MANDIRI DARI APPS SCRIPT):
 * ===================================================================
 * Memperbaiki nomor agenda Surat Keluar yang acak-acakan di baris 635 s/d 642:
 * - Baris 635 (No. Urut 656) dikembalikan ke No. Agenda 613 (Pengawas Silang TKA)
 * - Baris 636 (No. Urut 657) dipastikan No. Agenda 614 (Pengawas Silang TKA)
 * - Baris 637 (No. Urut 658) dikembalikan ke No. Agenda 615 (Pengawas Silang TKA), bukan 617 ganda!
 * - Baris 638 (No. Urut 659) dipastikan No. Agenda 616 (Surat Edaran ASAS)
 * - Baris 639 (No. Urut 660) dipastikan No. Agenda 617 (Surat Dispensasi FinExpo)
 * - Baris 640 s/d 642: No. Agenda 618, 619, 620
 * Hasilnya: urutan kembali sempurna 612, 613, 614, 615, 616, 617, 618, 619, 620!
 */
function rapikanNomorAgendaKeluar() {
  const ss = getTargetSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_SURAT_KELUAR);
  if (!sheet) return "Sheet Surat Keluar tidak ditemukan!";

  const lastRow = sheet.getLastRow();
  if (lastRow < 634) return "Data belum mencapai baris 634.";

  // Koreksi langsung baris 635 s/d 639 sesuai data riil SMA YWKA
  // 1. Baris 635 (No. Urut 656) -> Agenda 613 (Pengawas Silang TKA)
  sheet.getRange(635, 1).setValue(656);
  sheet.getRange(635, 2).setValue(true);
  sheet.getRange(635, 3).setValue("421.3/");
  sheet.getRange(635, 4).setValue("613");
  sheet.getRange(635, 5).setValue("/SMA YWKA TU/ ");
  sheet.getRange(635, 6).setValue("X");
  sheet.getRange(635, 7).setValue("/2026");
  sheet.getRange(635, 8).setValue(parseDateForSheet("26/10/2026")).setNumberFormat("dd/mm/yyyy");
  sheet.getRange(635, 9).setValue("Surat Pengawas Silang TKA an Achmad Chaidir Hidayat, S. Psi");
  sheet.getRange(635, 10).setValue("Syarif Hasanudin, S.Pd., Gr., M.M.");

  // 2. Baris 636 (No. Urut 657) -> Agenda 614 (Pengawas Silang TKA)
  sheet.getRange(636, 1).setValue(657);
  sheet.getRange(636, 2).setValue(true);
  sheet.getRange(636, 3).setValue("421.3/");
  sheet.getRange(636, 4).setValue("614");
  sheet.getRange(636, 5).setValue("/SMA YWKA TU/ ");
  sheet.getRange(636, 6).setValue("X");
  sheet.getRange(636, 7).setValue("/2026");
  sheet.getRange(636, 8).setValue(parseDateForSheet("26/10/2026")).setNumberFormat("dd/mm/yyyy");
  sheet.getRange(636, 9).setValue("Surat Pengawas Silang TKA an Achmad Chaidir Hidayat, S. Psi");
  sheet.getRange(636, 10).setValue("Syarif Hasanudin, S.Pd., Gr., M.M.");

  // 3. Baris 637 (No. Urut 658) -> Agenda 615 (Pengawas Silang TKA - membatalkan tertimpa 617)
  sheet.getRange(637, 1).setValue(658);
  sheet.getRange(637, 2).setValue(true);
  sheet.getRange(637, 3).setValue("421.3/");
  sheet.getRange(637, 4).setValue("615");
  sheet.getRange(637, 5).setValue("/SMA YWKA TU/ ");
  sheet.getRange(637, 6).setValue("X");
  sheet.getRange(637, 7).setValue("/2026");
  sheet.getRange(637, 8).setValue(parseDateForSheet("26/10/2026")).setNumberFormat("dd/mm/yyyy");
  sheet.getRange(637, 9).setValue("Surat Pengawas Silang TKA an Achmad Chaidir Hidayat, S. Psi");
  sheet.getRange(637, 10).setValue("Syarif Hasanudin, S.Pd., Gr., M.M.");

  // 4. Baris 638 (No. Urut 659) -> Agenda 616 (Surat Edaran Kegiatan ASAS)
  sheet.getRange(638, 1).setValue(659);
  sheet.getRange(638, 3).setValue("421.3/");
  sheet.getRange(638, 4).setValue("616");
  sheet.getRange(638, 5).setValue("/SMA YWKA TU/ ");
  sheet.getRange(638, 6).setValue("X");
  sheet.getRange(638, 7).setValue("/2026");
  sheet.getRange(638, 8).setValue(parseDateForSheet("26/10/2026")).setNumberFormat("dd/mm/yyyy");
  sheet.getRange(638, 9).setValue("Surat Edaran Kegiatan ASAS");

  // 5. Baris 639 (No. Urut 660) -> Agenda 617 (Surat Dispensasi FinExpo Asli)
  sheet.getRange(639, 1).setValue(660);
  sheet.getRange(639, 2).setValue(true);
  sheet.getRange(639, 3).setValue("421.7/");
  sheet.getRange(639, 4).setValue("617");
  sheet.getRange(639, 5).setValue("/SMA YWKA TU/ ");
  sheet.getRange(639, 6).setValue("X");
  sheet.getRange(639, 7).setValue("/2026");
  sheet.getRange(639, 8).setValue(parseDateForSheet("29/10/2026")).setNumberFormat("dd/mm/yyyy");
  sheet.getRange(639, 9).setValue("Surat Dispensasi untuk Lomba Cerdas Cermat SMP & SMA FINEXPO OJK2026");
  sheet.getRange(639, 10).setValue("Syarif Hasanudin, S.Pd., Gr., M.M.");

  // 6. Baris 640 s/d 642 -> Pastikan Agenda 618, 619, 620
  sheet.getRange(640, 1).setValue(661);
  sheet.getRange(640, 4).setValue("618");
  sheet.getRange(641, 1).setValue(662);
  sheet.getRange(641, 4).setValue("619");
  sheet.getRange(642, 1).setValue(663);
  sheet.getRange(642, 4).setValue("620");

  Logger.log("=================================================");
  Logger.log("✅ BERHASIL MERAPIKAN URUTAN AGENDA SURAT KELUAR!");
  Logger.log("Baris 634 (655): Agenda 612 (Pengawas Silang)");
  Logger.log("Baris 635 (656): Agenda 613 (Pengawas Silang)");
  Logger.log("Baris 636 (657): Agenda 614 (Pengawas Silang)");
  Logger.log("Baris 637 (658): Agenda 615 (Pengawas Silang)");
  Logger.log("Baris 638 (659): Agenda 616 (Surat Edaran ASAS)");
  Logger.log("Baris 639 (660): Agenda 617 (Dispensasi FinExpo)");
  Logger.log("Baris 640 (661): Agenda 618 (Guru Pendamping)");
  Logger.log("Baris 641 (662): Agenda 619 (Guru Pendamping)");
  Logger.log("Baris 642 (663): Agenda 620 (Pernyataan Peserta)");
  Logger.log("=================================================");

  return "Berhasil merapikan urutan Surat Keluar! Baris 634 s/d 642 kini tersusun rapi berurutan dari 612 hingga 620 tanpa duplikat.";
}

function perbaikiBarisSuratMasuk() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_SURAT_MASUK);
  if (!sheet) {
    Logger.log("Sheet tidak ditemukan: " + SHEET_SURAT_MASUK);
    return "Sheet tidak ditemukan";
  }
  const hasil = autoRelocateMisplacedSuratMasuk(sheet);
  Logger.log(hasil);
  return hasil;
}

/**
 * Otomatis memindahkan baris surat masuk yang tersimpan di baris bawah (baris >= 302)
 * kembali ke baris slot template yang benar di atas (misal No. Urut 215 dipindahkan ke baris 214)
 * dan menghapus baris salah/liar di bawah.
 */
function autoRelocateMisplacedSuratMasuk(sheet) {
  if (!sheet) return "Sheet tidak valid";
  const lastRow = sheet.getLastRow();
  // Template SURAT MASUK 2026 berakhir di baris 301 (No. Urut 300)
  if (lastRow <= 301) return "Tidak ada baris salah di bawah baris 301.";

  const totalRows = lastRow - 1;
  const values = sheet.getRange(2, 1, totalRows, 10).getValues();
  let relocatedCount = 0;
  let deletedCount = 0;

  // Scan mundur dari baris terbawah ke baris 302 (indeks values >= 300)
  for (let i = values.length - 1; i >= 300; i--) {
    const curRow = i + 2; // Baris fisik di spreadsheet
    const rowNoUrut = String(values[i][0]).trim();
    const rowAgenda = String(values[i][1]).trim();
    const rowPerihal = String(values[i][4]).trim();

    // Jika baris bawah ini terisi agenda atau perihal (surat yang salah tempat)
    if (rowAgenda || rowPerihal) {
      let moved = false;
      // 1. Cari baris template di atas (1..300 / baris 2..301) yang No. Urut-nya sama & masih kosong
      for (let j = 0; j < Math.min(300, values.length); j++) {
        const slotUrut = String(values[j][0]).trim();
        const slotAgenda = String(values[j][1]).trim();
        const slotPerihal = String(values[j][4]).trim();

        if (slotUrut && rowNoUrut && slotUrut === rowNoUrut && !slotAgenda && !slotPerihal) {
          const properRow = j + 2;
          const dataToMove = values[i].slice();

          sheet.getRange(properRow, 1, 1, dataToMove.length).setValues([dataToMove]);
          sheet.getRange(properRow, 3).setNumberFormat("@").setValue(dataToMove[2]);
          sheet.getRange(properRow, 4).setNumberFormat("@").setValue(dataToMove[3]);
          try {
            sheet.getRange(properRow, 1, 1, dataToMove.length).setBorder(true, true, true, true, true, true);
          } catch (e) { }

          values[j] = dataToMove;
          try {
            sheet.deleteRow(curRow);
          } catch (e) {
            sheet.getRange(curRow, 1, 1, 10).clearContent();
          }
          relocatedCount++;
          moved = true;
          break;
        }
      }

      // 2. Jika tidak ada No. Urut yang sama persis, cari slot kosong pertama di atas
      if (!moved) {
        for (let j = 0; j < Math.min(300, values.length); j++) {
          const slotUrut = String(values[j][0]).trim();
          const slotAgenda = String(values[j][1]).trim();
          const slotPerihal = String(values[j][4]).trim();

          if (!slotAgenda && !slotPerihal) {
            const properRow = j + 2;
            const dataToMove = values[i].slice();
            dataToMove[0] = slotUrut || dataToMove[0];

            sheet.getRange(properRow, 1, 1, dataToMove.length).setValues([dataToMove]);
            sheet.getRange(properRow, 3).setNumberFormat("@").setValue(dataToMove[2]);
            sheet.getRange(properRow, 4).setNumberFormat("@").setValue(dataToMove[3]);
            try {
              sheet.getRange(properRow, 1, 1, dataToMove.length).setBorder(true, true, true, true, true, true);
            } catch (e) { }

            values[j] = dataToMove;
            try {
              sheet.deleteRow(curRow);
            } catch (e) {
              sheet.getRange(curRow, 1, 1, 10).clearContent();
            }
            relocatedCount++;
            break;
          }
        }
      }
    } else {
      // Hapus baris kosong di bawah baris 301
      try {
        sheet.deleteRow(curRow);
        deletedCount++;
      } catch (e) { }
    }
  }

  return "Selesai! Berhasil memindahkan " + relocatedCount + " surat ke slot template yang benar dan merapikan " + deletedCount + " baris kosong di bawah.";
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
 * FUNGSI UTAMA: PERBAIKI SEMUA FORMAT TANGGAL DI GOOGLE SPREADSHEET
 * Klik dropdown di atas editor Apps Script, pilih "perbaikiSemuaTanggal", lalu klik "Run/Jalankan".
 * Fungsi ini akan menormalkan semua tanggal di sheet "SURAT KELUAR 2026" dan "SURAT MASUK 2026"
 * agar menjadi objek Date resmi Google Sheets (dd/mm/yyyy) sehingga langsung terbaca oleh Web App!
 */
function perbaikiSemuaTanggal() {
  const ss = getTargetSpreadsheet();
  repairDateCells(ss.getSheetByName(SHEET_SURAT_KELUAR), "keluar");
  repairDateCells(ss.getSheetByName(SHEET_SURAT_MASUK), "masuk");
  Logger.log("✅ Berhasil memperbaiki format tanggal di Surat Keluar & Surat Masuk!");
}

/**
 * Otomatis perbaiki sel tanggal di spreadsheet yang sebelumnya tersimpan sebagai plain text string
 * agar kembali menjadi objek Date bertipe dd/mm/yyyy yang bisa terbaca oleh GViz & Web
 */
function repairDateCells(sheet, type) {
  if (!sheet) return;
  try {
    const lastRow = sheet.getLastRow();
    if (lastRow < 4) return;
    const totalScan = lastRow - 3;

    if (!type) {
      type = sheet.getName().toLowerCase().includes("masuk") ? "masuk" : "keluar";
    }

    if (type === "masuk") {
      // Surat Masuk: Kolom 3 (Tgl Surat) dan Kolom 4 (Tgl Diterima)
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
    } else {
      // Surat Keluar: Kolom 8 (TGL SURAT / Kolom H)
      const range = sheet.getRange(4, 8, totalScan, 1);
      const values = range.getValues();

      for (let i = 0; i < totalScan; i++) {
        const v = values[i][0];
        if (typeof v === "string" && v.trim() && v.includes("/")) {
          const d = parseDateForSheet(v);
          if (d instanceof Date) {
            sheet.getRange(i + 4, 8).setValue(d).setNumberFormat("dd/mm/yyyy");
          }
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

    if (action === "ping" || action === "repair_dates") {
      try {
        repairDateCells(ss.getSheetByName(SHEET_SURAT_MASUK));
      } catch (e) { }
      return createJsonResponse({
        status: "success",
        message: "Koneksi Google Apps Script SMA YWKA Aktif & Format Tanggal Diperbaiki!",
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

    if (action === "auto_fix_masuk" || action === "relocate_misplaced" || action === "perbaiki_baris_masuk") {
      const msg = perbaikiBarisSuratMasuk();
      return createJsonResponse({
        status: "success",
        message: msg
      });
    }

    if (action === "get_data") {
      const type = (e.parameter && e.parameter.type) || "keluar";
      const sheetName = type === "masuk" ? SHEET_SURAT_MASUK : SHEET_SURAT_KELUAR;
      const sheet = ss.getSheetByName(sheetName);

      if (!sheet) {
        return createJsonResponse({ status: "error", message: "Sheet tidak ditemukan: " + sheetName });
      }

      // Otomatis rapikan baris jika ada data surat di bawah template
      if (type === "masuk") {
        try {
          autoRelocateMisplacedSuratMasuk(sheet);
        } catch (e) { }
      }

      const rawValues = sheet.getDataRange().getValues();
      const rows = type === "masuk" ? rawValues.slice(1) : rawValues.slice(3); // Surat Masuk data dari baris 2 (indeks 1), Surat Keluar dari baris 4 (indeks 3)

      // Pastikan tanggal selalu berformat DD/MM/YYYY
      const formattedRows = rows.map(function (row) {
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

    if (action === "clean_drive_duplicates" || action === "bersihkan_duplikat_drive") {
      const resDedup = bersihkanDuplikatDrive();
      return createJsonResponse({
        status: "success",
        message: "Pembersihan berkas duplikat di Google Drive berhasil! " +
                 resDedup.keluarDibersihkan + " berkas surat keluar dan " +
                 resDedup.masukDibersihkan + " berkas surat masuk telah dibersihkan.",
        detail: resDedup
      });
    }

    if (action === "rapikan_agenda_keluar" || action === "auto_fix_keluar") {
      const msg = rapikanNomorAgendaKeluar();
      return createJsonResponse({
        status: "success",
        message: msg
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
    // 0. PERBAIKI & RAPATKAN BARIS SURAT MASUK
    // ==========================================
    if (action === "auto_fix_masuk" || action === "relocate_misplaced" || action === "perbaiki_baris_masuk") {
      const msg = perbaikiBarisSuratMasuk();
      return createJsonResponse({
        status: "success",
        message: msg
      });
    }

    // ==========================================
    // 0.B. BERSIHKAN DUPLIKAT DI GOOGLE DRIVE (SURAT KELUAR & MASUK)
    // ==========================================
    if (action === "clean_drive_duplicates" || action === "bersihkan_duplikat_drive") {
      const resDedup = bersihkanDuplikatDrive();
      return createJsonResponse({
        status: "success",
        message: "Pembersihan berkas duplikat di Google Drive berhasil! " +
                 resDedup.keluarDibersihkan + " berkas surat keluar dan " +
                 resDedup.masukDibersihkan + " berkas surat masuk telah dibersihkan.",
        detail: resDedup
      });
    }

    if (action === "rapikan_agenda_keluar" || action === "auto_fix_keluar") {
      const msg = rapikanNomorAgendaKeluar();
      return createJsonResponse({
        status: "success",
        message: msg
      });
    }

    // ==========================================
    // 1. SIMPAN SURAT KELUAR KE SPREADSHEET
    // ==========================================
    if (action === "create_surat_keluar") {
      const sheet = ss.getSheetByName(SHEET_SURAT_KELUAR);
      if (!sheet) {
        return createJsonResponse({ status: "error", message: "Sheet " + SHEET_SURAT_KELUAR + " tidak ditemukan!" });
      }

      const noAgendaStr = String(payload.no_agenda || payload.nomor_urut || "").trim();

      // 1.A. Proses Upload File ke Google Drive jika ada berkas terlampir (Anti-Duplikasi Aktif)
      let driveFileUrl = "";
      if (payload.fileBase64 && payload.fileName) {
        driveFileUrl = uploadFileToGoogleDrive(
          payload.fileBase64,
          payload.fileName,
          payload.fileMime || "application/pdf",
          "Surat Keluar 2026",
          payload.old_drive_url || "",
          noAgendaStr
        );
      }

      const rawKode = payload.kode_klasifikasi || "421.3";
      const kodePrefix = rawKode.endsWith("/") ? rawKode : rawKode + "/";
      const tahunSuffix = payload.tahun ? "/" + payload.tahun.replace("/", "").trim() : "/2026";
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
        // Simpan sebagai Date resmi dd/mm/yyyy agar dikenali GViz Google Sheets & Web App
        const dObj = parseDateForSheet(tglSurat);
        if (dObj instanceof Date) {
          sheet.getRange(targetRowIndex, 8).setValue(dObj).setNumberFormat("dd/mm/yyyy");
        } else {
          sheet.getRange(targetRowIndex, 8).setValue(tglSurat || "");
        }
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
        const dObj = parseDateForSheet(tglSurat);
        if (dObj instanceof Date) {
          sheet.getRange(targetRowIndex, 8).setValue(dObj).setNumberFormat("dd/mm/yyyy");
        } else {
          sheet.getRange(targetRowIndex, 8).setValue(tglSurat || "");
        }
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

      const lastRow = sheet.getLastRow();
      let targetRowIndex = -1;

      // 1. CARI PRESISI BERDASARKAN NO. AGENDA LAMA DI KOLOM D (KOLOM 4)
      if (lastRow >= 4 && oldAgendaStr) {
        const totalScan = lastRow - 3;
        const agendaColValues = sheet.getRange(4, 4, totalScan, 1).getValues(); // Kolom D
        const perihalColValues = sheet.getRange(4, 9, totalScan, 1).getValues(); // Kolom I (Perihal)

        const payloadPerihal = String(payload.perihal || "").trim().toLowerCase();

        // 1.A. Jika ada lebih dari satu baris dengan nomor agenda sama (duplikat), cocokkan dengan perihal
        if (payloadPerihal) {
          for (let i = 0; i < totalScan; i++) {
            const rowAgenda = String(agendaColValues[i][0]).trim();
            const rowPerihal = String(perihalColValues[i][0]).trim().toLowerCase();
            if (rowAgenda === oldAgendaStr && rowPerihal &&
               (rowPerihal.indexOf(payloadPerihal.substring(0, 15)) !== -1 || payloadPerihal.indexOf(rowPerihal.substring(0, 15)) !== -1)) {
              targetRowIndex = i + 4;
              break;
            }
          }
        }

        // 1.B. Jika belum ditemukan via perihal, ambil baris pertama yang Kolom D = oldAgendaStr
        if (targetRowIndex < 0) {
          for (let i = 0; i < totalScan; i++) {
            const rowAgenda = String(agendaColValues[i][0]).trim();
            if (rowAgenda === oldAgendaStr) {
              targetRowIndex = i + 4;
              break;
            }
          }
        }

        // 1.C. Jika nomor agenda lama tidak ketemu, cari berdasarkan newAgendaStr
        if (targetRowIndex < 0 && newAgendaStr && newAgendaStr !== oldAgendaStr) {
          for (let i = 0; i < totalScan; i++) {
            const rowAgenda = String(agendaColValues[i][0]).trim();
            if (rowAgenda === newAgendaStr) {
              targetRowIndex = i + 4;
              break;
            }
          }
        }
      }

      // 2. VALIDASI KETAT ROW_INDEX: Jangan pernah gunakan payload.row_index secara buta!
      // Hanya izinkan jika Kolom D di baris tersebut benar-benar berisi oldAgendaStr atau newAgendaStr!
      if (targetRowIndex < 0 && payload.row_index) {
        const clientRow = Number(payload.row_index);
        if (clientRow >= 4 && clientRow <= lastRow) {
          const checkCell = String(sheet.getRange(clientRow, 4).getValue()).trim();
          if (checkCell === oldAgendaStr || checkCell === newAgendaStr) {
            targetRowIndex = clientRow;
          }
        }
      }

      // 3. JIKA SAMA SEKALI TIDAK DITEMUKAN, TOLAK UNTUK MENIMPA BARIS LAIN!
      if (targetRowIndex < 0) {
        return createJsonResponse({
          status: "error",
          message: "Gagal edit: Baris Surat Keluar dengan No. Agenda " + oldAgendaStr + " tidak ditemukan di Kolom D Spreadsheet. Sistem menolak menimpa baris lain agar urutan tidak acak-acakan!"
        });
      }

      let existingLampiran = "";
      if (targetRowIndex > 0) {
        existingLampiran = String(sheet.getRange(targetRowIndex, 14).getValue()).trim();
      }
      const oldDriveUrl = payload.old_drive_url || existingLampiran;

      let driveFileUrl = "";
      if (payload.fileBase64 && payload.fileName) {
        driveFileUrl = uploadFileToGoogleDrive(
          payload.fileBase64,
          payload.fileName,
          payload.fileMime || "application/pdf",
          "Surat Keluar 2026",
          oldDriveUrl,
          newAgendaStr,
          oldAgendaStr
        );
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
        const dObj = parseDateForSheet(tglSurat);
        if (dObj instanceof Date) {
          sheet.getRange(targetRowIndex, 8).setValue(dObj).setNumberFormat("dd/mm/yyyy");
        } else {
          sheet.getRange(targetRowIndex, 8).setValue(tglSurat || "");
        }

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

      const lastRow = sheet.getLastRow();
      let foundRow = -1;
      let existingLampiran = "";
      if (lastRow >= 4) {
        const agendaColValues = sheet.getRange(4, 4, lastRow - 3, 1).getValues();
        for (let i = 0; i < agendaColValues.length; i++) {
          if (String(agendaColValues[i][0]).trim() === noAgendaStr) {
            foundRow = i + 4;
            existingLampiran = String(sheet.getRange(foundRow, 14).getValue()).trim();
            break;
          }
        }
      }

      const oldDriveUrl = payload.old_drive_url || existingLampiran;

      const driveUrl = uploadFileToGoogleDrive(
        payload.fileBase64,
        payload.fileName,
        payload.fileMime || "application/pdf",
        "Surat Keluar 2026",
        oldDriveUrl,
        noAgendaStr
      );

      if (!driveUrl) {
        return createJsonResponse({ status: "error", message: "Gagal mengunggah berkas ke Google Drive!" });
      }

      if (foundRow > 0) {
        sheet.getRange(foundRow, 2).setValue(true);
        sheet.getRange(foundRow, 14).setValue(driveUrl);
      }

      return createJsonResponse({
        status: "success",
        message: "Berkas berhasil diupload ke Google Drive Surat Keluar (versi lama digantikan tanpa duplikat)!",
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
        // Hapus file terlampir di Google Drive jika ada
        const oldLampiran = String(sheet.getRange(foundRow, 14).getValue()).trim();
        if (oldLampiran) {
          const oldId = extractDriveFileId(oldLampiran);
          if (oldId) {
            try {
              const oldFile = DriveApp.getFileById(oldId);
              if (oldFile && !oldFile.isTrashed()) oldFile.setTrashed(true);
            } catch (e) { }
          }
        }
        sheet.getRange(foundRow, 2).setValue(false); // Uncheck
        sheet.getRange(foundRow, 3).setValue("");    // Kosongkan kode
        sheet.getRange(foundRow, 8, 1, 7).setValues([["", "", "", "", "", "", ""]]); // Kosongkan H s/d N
      }

      return createJsonResponse({
        status: "success",
        message: "Data surat agenda " + noAgendaStr + " beserta lampiran berhasil dihapus dari Spreadsheet!",
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

      const noAgendaStr = String(payload.no_agenda || "").trim();
      const noUrutStr = String(payload.no_urut || "").trim();

      let driveFileUrl = "";
      if (payload.fileBase64 && payload.fileName) {
        driveFileUrl = uploadFileToGoogleDrive(
          payload.fileBase64,
          payload.fileName,
          payload.fileMime || "application/pdf",
          "Surat Masuk 2026",
          payload.old_drive_url || "",
          noAgendaStr || noUrutStr
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
            } catch (e) { }
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
      // Kolom F (6): DARI (Dropdown Pilihan Instansi)
      // Kolom G (7): KEPADA (SMA YWKA)
      // Kolom H (8): KODE KLASIFIKASI
      // Kolom I (9): KETERANGAN
      // Kolom J (10): Lampiran Fisik

      const reqNoUrut = payload.no_urut ? String(payload.no_urut).trim() : "";
      const reqNoAgenda = payload.no_agenda ? String(payload.no_agenda).trim() : "";
      const reqPerihal = payload.perihal ? String(payload.perihal).trim() : "";

      let targetRowIndex = -1;
      let finalNoUrut = reqNoUrut;

      // Ambil seluruh data dari baris 2 sampai baris 301 (area template resmi 1..300)
      const endRowScan = Math.max(sheet.getLastRow(), 301);
      const totalScan = Math.max(endRowScan - 1, 1);
      const rangeData = sheet.getRange(2, 1, totalScan, 5).getValues(); // Baris 2 adalah index 0

      // 1.A. Cegah duplikasi: Cek apakah no_agenda yang sama sudah ada di dalam area template (baris <= 301)
      if (reqNoAgenda && reqNoAgenda !== "-") {
        for (let i = 0; i < rangeData.length; i++) {
          const rowUrut = String(rangeData[i][0]).trim();
          const rowAgenda = String(rangeData[i][1]).trim();
          if (rowAgenda && rowAgenda.toLowerCase() === reqNoAgenda.toLowerCase()) {
            if (i + 2 <= 301) {
              targetRowIndex = i + 2;
              finalNoUrut = rowUrut || finalNoUrut;
              break;
            }
          }
        }
      }

      // 1.B. Cari baris template berdasarkan Nomor Urut yang diminta (misal No. Urut 215 -> cari baris dengan Col A = 215)
      // Dibatasi HANYA di dalam area template (baris <= 301)
      if (targetRowIndex < 0 && reqNoUrut) {
        for (let i = 0; i < Math.min(300, rangeData.length); i++) {
          const rowUrut = String(rangeData[i][0]).trim();
          const rowAgenda = String(rangeData[i][1]).trim();
          const rowPerihal = String(rangeData[i][4]).trim();

          if (rowUrut === reqNoUrut) {
            // Cocok dengan No. Urut template! Jika baris ini belum terisi agenda dan perihal, gunakan langsung baris ini
            if (!rowAgenda && !rowPerihal) {
              targetRowIndex = i + 2;
              finalNoUrut = rowUrut;
              break;
            }
          }
        }
      }

      // 1.C. Jika belum ditemukan baris dengan No Urut tersebut, cari BARIS KOSONG PERTAMA di dalam template (baris <= 301)
      if (targetRowIndex < 0) {
        for (let i = 0; i < Math.min(300, rangeData.length); i++) {
          const rowUrut = String(rangeData[i][0]).trim();
          const rowAgenda = String(rangeData[i][1]).trim();
          const rowPerihal = String(rangeData[i][4]).trim();

          if (!rowAgenda && !rowPerihal) {
            targetRowIndex = i + 2;
            finalNoUrut = rowUrut || (finalNoUrut ? finalNoUrut : String(i + 1));
            break;
          }
        }
      }

      // 1.D. Pengaman Ketat: Pastikan targetRowIndex TIDAK PERNAH melebihi baris 301 jika masih ada slot kosong
      if (targetRowIndex < 0 || targetRowIndex > 301) {
        for (let i = 0; i < Math.min(300, rangeData.length); i++) {
          const rowUrut = String(rangeData[i][0]).trim();
          const rowAgenda = String(rangeData[i][1]).trim();
          const rowPerihal = String(rangeData[i][4]).trim();
          if (!rowAgenda && !rowPerihal) {
            targetRowIndex = i + 2;
            finalNoUrut = rowUrut || finalNoUrut || String(i + 1);
            break;
          }
        }
      }

      // 1.E. Fallback HANYA jika template 300 baris memang SUDAH BENAR-BENAR TERISI PENUH SELURUHNYA
      if (targetRowIndex < 0) {
        let lastFilledRow = 1;
        for (let i = rangeData.length - 1; i >= 0; i--) {
          const rowAgenda = String(rangeData[i][1]).trim();
          const rowPerihal = String(rangeData[i][4]).trim();
          if (rowAgenda || rowPerihal) {
            lastFilledRow = i + 2;
            break;
          }
        }
        targetRowIndex = Math.max(lastFilledRow + 1, 302);
        if (!finalNoUrut) {
          finalNoUrut = String(targetRowIndex - 1);
        }
      }

      const rowData = [
        finalNoUrut,
        reqNoAgenda,
        tglSuratMasuk,
        tglDiterimaMasuk,
        reqPerihal,
        payload.dari || "CABANG DINAS WIL.VII",
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
      try { repairDateCells(sheet); } catch (e) { }
      try {
        sheet.getRange(targetRowIndex, 1, 1, rowData.length).setBorder(true, true, true, true, true, true);
      } catch (e) { }

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

      const scanLimit = Math.max(sheet.getLastRow(), 310);
      let foundRow = -1;
      if (payload.row_index && Number(payload.row_index) >= 2 && Number(payload.row_index) <= sheet.getLastRow()) {
        foundRow = Number(payload.row_index);
      }
      const totalScan = Math.max(scanLimit - 1, 1);
      const dataScan = sheet.getRange(2, 1, totalScan, 5).getValues(); // Mulai dari baris 2!

      // 1. Cari berdasarkan no agenda lama / baru
      for (let i = 0; i < totalScan; i++) {
        const rowAgenda = String(dataScan[i][1]).trim();
        if (oldAgendaStr && oldAgendaStr !== "-" && rowAgenda.toLowerCase() === oldAgendaStr.toLowerCase()) {
          foundRow = i + 2;
          break;
        }
      }

      // 2. Jika belum ketemu, cari berdasarkan no urut
      if (foundRow < 0 && (oldNoUrutStr || newNoUrutStr)) {
        const searchUrut = oldNoUrutStr || newNoUrutStr;
        for (let i = 0; i < totalScan; i++) {
          const rowUrut = String(dataScan[i][0]).trim();
          if (rowUrut === searchUrut) {
            foundRow = i + 2;
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
            foundRow = i + 2;
            break;
          }
        }
      }

      let existingLampiran = "";
      if (foundRow > 0) {
        existingLampiran = String(sheet.getRange(foundRow, 10).getValue()).trim();
      }
      const oldDriveUrl = payload.old_drive_url || existingLampiran;

      let driveFileUrl = "";
      if (payload.fileBase64 && payload.fileName) {
        driveFileUrl = uploadFileToGoogleDrive(
          payload.fileBase64,
          payload.fileName,
          payload.fileMime || "application/pdf",
          "Surat Masuk 2026",
          oldDriveUrl,
          newAgendaStr || oldAgendaStr || newNoUrutStr
        );
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
          payload.dari || existingValues[5] || "CABANG DINAS WIL.VII",
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
        try { repairDateCells(sheet); } catch (e) { }

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

      const lastRow = Math.max(sheet.getLastRow(), 302);
      let foundRow = -1;
      let existingLampiran = "";
      if (lastRow >= 2) {
        const totalScan = lastRow - 1;
        const agendaColValues = sheet.getRange(2, 2, totalScan, 1).getValues();
        const urutColValues = sheet.getRange(2, 1, totalScan, 1).getValues();
        for (let i = 0; i < totalScan; i++) {
          if ((noAgendaStr && String(agendaColValues[i][0]).trim() === noAgendaStr) ||
            (noUrutStr && String(urutColValues[i][0]).trim() === noUrutStr)) {
            foundRow = i + 2;
            existingLampiran = String(sheet.getRange(foundRow, 10).getValue()).trim();
            break;
          }
        }
      }

      const oldDriveUrl = payload.old_drive_url || existingLampiran;

      const driveUrl = uploadFileToGoogleDrive(
        payload.fileBase64,
        payload.fileName,
        payload.fileMime || "application/pdf",
        "Surat Masuk 2026",
        oldDriveUrl,
        noAgendaStr || noUrutStr
      );

      if (!driveUrl) {
        return createJsonResponse({ status: "error", message: "Gagal mengunggah berkas ke Google Drive!" });
      }

      if (foundRow > 0) {
        sheet.getRange(foundRow, 10).setValue(driveUrl);
      }

      return createJsonResponse({
        status: "success",
        message: "Berkas berhasil diupload ke Google Drive Surat Masuk (versi lama digantikan tanpa duplikat)!",
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

      // 1. Jika dikirim array row_indices
      if (Array.isArray(payload.row_indices) && payload.row_indices.length > 0) {
        const sortedIndices = payload.row_indices
          .map(function (n) { return parseInt(n, 10); })
          .filter(function (n) { return !isNaN(n) && n >= 4 && n <= sheet.getLastRow(); })
          .sort(function (a, b) { return b - a; }); // Hapus dari baris terbawah agar index baris atas tidak bergeser!

        for (var d = 0; d < sortedIndices.length; d++) {
          try {
            sheet.deleteRow(sortedIndices[d]);
            deletedRows.push(sortedIndices[d]);
          } catch (e) { }
        }
      } else {
        const rowIndex = parseInt(payload.row_index, 10);
        if (!isNaN(rowIndex) && rowIndex >= 2 && rowIndex <= lastRow) {
          sheet.deleteRow(rowIndex);
          deletedRows.push(rowIndex);
        }
      }

      // 2. Jika delete_all_matching true atau masih ada baris duplikat dengan no_agenda yang sama
      if (noAgendaStr && (payload.delete_all_matching || deletedRows.length === 0)) {
        const curLast = sheet.getLastRow();
        if (curLast >= 2) {
          const totalScan = curLast - 1;
          const vals = sheet.getRange(2, 2, totalScan, 1).getValues();
          for (var i = totalScan - 1; i >= 0; i--) {
            if (String(vals[i][0]).trim().toLowerCase() === noAgendaStr.toLowerCase()) {
              var rTarget = i + 2;
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

      // 1. Relokasi otomatis jika ada baris surat di bawah template ke slot yang benar di atas
      autoRelocateMisplacedSuratMasuk(sheet);

      const lastRow = sheet.getLastRow();
      var removedCount = 0;
      if (lastRow >= 2) {
        const totalRows = lastRow - 1;
        const data = sheet.getRange(2, 1, totalRows, 6).getValues();
        const seenMap = {};
        const rowsToDelete = [];

        // Scan dari baris paling awal ke akhir untuk mencatat duplikat
        for (var i = 0; i < totalRows; i++) {
          var rowAgenda = String(data[i][1] || "").trim().toLowerCase();
          var rowPerihal = String(data[i][4] || "").trim().toLowerCase();
          var actualRow = i + 2;

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
        rowsToDelete.sort(function (a, b) { return b - a; });
        for (var r = 0; r < rowsToDelete.length; r++) {
          try {
            sheet.deleteRow(rowsToDelete[r]);
            removedCount++;
          } catch (e) { }
        }

        // Hapus juga baris apapun di bawah 302 yang salah ter-append ke paling bawah
        if (sheet.getLastRow() > 302) {
          for (var ex = sheet.getLastRow(); ex > 302; ex--) {
            try {
              sheet.deleteRow(ex);
              removedCount++;
            } catch (e) { }
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
 * Helper: Ekstrak File ID dari URL Google Drive
 */
function extractDriveFileId(url) {
  if (!url || typeof url !== "string") return "";
  if (url.indexOf("/folders/") !== -1) return ""; // Jangan sentuh folder!

  const m1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]{25,})/);
  if (m1 && m1[1]) return m1[1];

  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]{25,})/);
  if (m2 && m2[1]) return m2[1];

  const m3 = url.match(/\/d\/([a-zA-Z0-9_-]{25,})/);
  if (m3 && m3[1]) return m3[1];

  return "";
}

/**
 * Fungsi Pembantu: Mengunggah Berkas Base64 ke Google Drive di Folder Sekolah
 * Dilengkapi ANTI-DUPLIKASI OTOMATIS:
 * - Membersihkan berkas lama jika URL berkas sebelumnya dikirimkan
 * - Membersihkan berkas di folder yang memiliki nama sama persis
 * - Membersihkan berkas di folder yang memiliki nomor agenda yang sama (misal "No. 619 ")
 * Sehingga tidak pernah ada 2 file ganda/kembar di Google Drive!
 */
function uploadFileToGoogleDrive(base64Data, fileName, mimeType, subfolderName, oldFileUrl, agendaNumber, oldAgendaNumber) {
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

    const oldId = extractDriveFileId(oldFileUrl);

    // ==============================================================
    // CARA 1: MENIMPA KONTEN FILE SECARA IN-PLACE (JIKA DRIVE API AKTIF)
    // ==============================================================
    if (oldId && typeof Drive !== "undefined" && Drive.Files && Drive.Files.update) {
      try {
        const updated = Drive.Files.update(
          { title: fileName, mimeType: mimeType },
          oldId,
          blob,
          { newRevision: true }
        );
        if (updated && updated.id) {
          Logger.log("✅ Berhasil menimpa (in-place) konten berkas Drive ID: " + oldId);
          return "https://drive.google.com/file/d/" + oldId + "/view";
        }
      } catch (errInPlace) {
        Logger.log("Info: In-place update dilewati, beralih ke penggantian bersih: " + errInPlace.toString());
      }
    }

    // ==============================================================
    // CARA 2: PENGGANTIAN BERSIH (REPLACE & TRASH SELURUH VERSI LAMA)
    // ==============================================================
    // 1. Pindahkan file lama ke sampah berdasarkan oldFileId
    if (oldId) {
      try {
        const oldFile = DriveApp.getFileById(oldId);
        if (oldFile && !oldFile.isTrashed()) {
          Logger.log("🗑️ Menimpa: membuang berkas lama ke Sampah (by ID): " + oldFile.getName() + " (" + oldId + ")");
          oldFile.setTrashed(true);
        }
      } catch (e) {
        Logger.log("Info: Berkas lama ID " + oldId + " tidak ditemukan atau sudah dibuang: " + e.toString());
      }
    }

    // 2. Bersihkan file di folder yang memiliki nama sama persis (case-insensitive) atau nomor agenda sama
    const normNewName = (fileName || "").trim().toLowerCase();
    const agendasToMatch = [];
    if (agendaNumber) agendasToMatch.push(String(agendaNumber).trim());
    if (oldAgendaNumber && String(oldAgendaNumber).trim() !== String(agendaNumber).trim()) {
      agendasToMatch.push(String(oldAgendaNumber).trim());
    }

    const allFiles = targetFolder.getFiles();
    while (allFiles.hasNext()) {
      const f = allFiles.next();
      if (f.isTrashed()) continue;
      const fName = f.getName().trim();
      const fNameLower = fName.toLowerCase();

      let shouldTrash = false;
      // Nama sama persis (case-insensitive)
      if (normNewName && fNameLower === normNewName) {
        shouldTrash = true;
      }

      // Cocok dengan nomor agenda (misal No. 617, 619, dsb)
      if (!shouldTrash && agendasToMatch.length > 0) {
        for (let a = 0; a < agendasToMatch.length; a++) {
          const ag = agendasToMatch[a];
          if (!ag || ag === "-" || ag === "0") continue;
          const escapedAg = ag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const agRegex = new RegExp("(?:^|[^0-9])(?:no\\.?\\s*|agenda\\s*)?" + escapedAg + "(?![0-9a-zA-Z])", "i");
          if (agRegex.test(fName)) {
            shouldTrash = true;
            break;
          }
        }
      }

      if (shouldTrash) {
        try {
          Logger.log("🗑️ Menimpa berkas lama di Drive: " + fName + " (" + f.getId() + ")");
          f.setTrashed(true);
        } catch (e) {
          Logger.log("Gagal membuang berkas lama " + fName + ": " + e.toString());
        }
      }
    }

    // 3. Buat berkas baru pengganti di targetFolder
    const driveFile = targetFolder.createFile(blob);
    try {
      driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e) { }

    Logger.log("✅ Berkas baru berhasil disimpan menggantikan versi lama: " + driveFile.getName());
    return driveFile.getUrl();
  } catch (err) {
    Logger.log("Gagal replace berkas ke Google Drive: " + err.toString());
    return "";
  }
}