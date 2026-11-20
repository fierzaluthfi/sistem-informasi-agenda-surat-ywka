/**
 * ===================================================================
 * APLIKASI AGENDA SURAT SMA YWKA BANDUNG
 * app.js - Controller, Drive Upload, 12 Kode Surat & No. Agenda
 * ===================================================================
 */

// Pembersihan Cache Versi Baru Otomatis (Mencegah Stale Corrupted LocalStorage)
(function () {
  try {
    const CURRENT_VERSION = "3.17";
    const savedVersion = localStorage.getItem("sias_app_version");
    if (savedVersion !== CURRENT_VERSION) {
      localStorage.removeItem("cache_surat_masuk_2026");
      localStorage.removeItem("cache_surat_keluar_2026");
      localStorage.removeItem("unsynced_surat_masuk");
      localStorage.removeItem("unsynced_surat_keluar");
      localStorage.setItem("sias_app_version", CURRENT_VERSION);
    }
  } catch (e) { }
})();

// Konfigurasi Spreadsheet SMA YWKA
const SPREADSHEET_ID = "1RzsLrm9_FOUUzDjyq60zyGBkrADROCtdrnRGvecST3k";
const GID_SURAT_KELUAR = "381566345";
const GID_SURAT_MASUK = "1925080880";

// URL Endpoint Google Sheets (GViz Direct - Cepat & Tanpa Redirect vs Export Fallback)
const URL_GVIZ_KELUAR = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid=${GID_SURAT_KELUAR}`;
const URL_GVIZ_MASUK = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid=${GID_SURAT_MASUK}`;
const URL_EXPORT_KELUAR = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${GID_SURAT_KELUAR}`;
const URL_EXPORT_MASUK = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${GID_SURAT_MASUK}`;

// URL Default Web App Google Apps Script SMA YWKA (Bawaan Otomatis untuk Semua Komputer / Demo Vercel)
// Masukkan URL Web App Apps Script di sini agar siapapun yang membuka di komputer lain langsung terhubung otomatis!
const DEFAULT_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxCUFM2sloMXHsvCqdil17RXugR9WOcRZFiXSHEnjIHCWajRXnVQTPtAWTmvm4BvBazyQ/exec";
const REQUIRED_APPS_SCRIPT_MINOR = 3.8; // Versi minimum Apps Script agar penempatan baris 691+ presisi (v3.8 / v3.9)

// Konfigurasi Notifikasi Laporan Bukti Kerja WhatsApp
const DEFAULT_WA_PHONE = "62895328047492"; // Nomor Pribadi Admin Fierza (+62895328047492 / 0895328047492)
const DEFAULT_WA_PETUGAS = "Fierza (Admin TAS YWKA)";

// State Global Aplikasi
let state = {
  suratKeluar: [],
  suratMasuk: [],
  filteredKeluar: [],
  filteredMasuk: [],
  pagination: {
    keluarPage: 1,
    keluarPerPage: 15,
    masukPage: 1,
    masukPerPage: 15
  },
  appsScriptUrl: localStorage.getItem("sma_ywka_apps_script_url") || DEFAULT_APPS_SCRIPT_URL,
  driveKeluarUrl: localStorage.getItem("sma_ywka_drive_keluar_url") || "https://drive.google.com/drive/folders/15sHeKCXOjXDAFfHJtzKKZYA9OpYQb3R5",
  driveMasukUrl: localStorage.getItem("sma_ywka_drive_masuk_url") || "https://drive.google.com/drive/folders/11QCXz3fc9TCr993YIWIrH5JPwBr3my2W",
  waPhone: localStorage.getItem("settings_wa_phone") || DEFAULT_WA_PHONE,
  waPetugas: localStorage.getItem("settings_wa_petugas") || DEFAULT_WA_PETUGAS,
  lastFilledAgendaNumber: "620",
  nextKeluarAgenda: "621",
  isSyncing: false,
  appsScriptVersion: null,
  appsScriptOutdated: false,
  selectedCategory: "all",
  stagedFileKeluar: null,
  stagedFileMasuk: null,
  pendingKeluarData: null,
  pendingMasukData: null,
  selectedKeluarIds: new Set(),
  selectedMasukIds: new Set(),
  batchPrintItems: [],
  batchPrintType: "keluar",
  batchPrintMode: "disposisi",
  batchKeluarItems: [],
  batchEditKeluarItems: [],
  batchMasukItems: [],
  batchMasukMode: "new"
};
window.state = state;

// Bulan Romawi Converter
const ROMAN_MONTHS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

/**
 * Helper: Ambil Bulan Romawi (I s/d XII) dari nomor bulan (1-12) atau objek Date
 */
function getRomanMonth(val) {
  if (!val) return "X";
  if (val instanceof Date) {
    return ROMAN_MONTHS[val.getMonth()] || "X";
  }
  const m = parseInt(val, 10);
  if (m >= 1 && m <= 12) {
    return ROMAN_MONTHS[m - 1];
  }
  return "X";
}

/**
 * Helper: Ekstrak nomor bulan (1 s/d 12) dari string tanggal (DD/MM/YYYY, YYYY-MM-DD, dsb.)
 * Mencegah kesalahan matching di mana hari (DD) dianggap sebagai bulan.
 */
function extractMonthFromDateString(dateStr) {
  if (!dateStr || dateStr === "-" || dateStr === "null" || dateStr === "undefined") return null;
  const s = String(dateStr).trim().replace(/^'+/, "");
  if (!s) return null;

  // 1. Format ISO: YYYY-MM-DD atau YYYY/MM/DD
  const matchIso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (matchIso) {
    const m = parseInt(matchIso[2], 10);
    if (m >= 1 && m <= 12) return m;
  }

  // 2. Format DD/MM/YYYY atau DD-MM-YYYY (standar Indonesia)
  const matchDmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (matchDmy) {
    const p1 = parseInt(matchDmy[1], 10);
    const p2 = parseInt(matchDmy[2], 10);
    // Jika part2 > 12 dan part1 <= 12, maka formatnya US MM/DD/YYYY (part1 adalah bulan)
    if (p2 > 12 && p1 >= 1 && p1 <= 12) {
      return p1;
    }
    // Standar Indonesia DD/MM/YYYY: part2 adalah bulan (1 s/d 12)
    if (p2 >= 1 && p2 <= 12) {
      return p2;
    }
    if (p1 >= 1 && p1 <= 12) {
      return p1;
    }
  }

  // 3. Fallback jika string dapat di-parse oleh Date()
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    return dt.getMonth() + 1;
  }

  return null;
}

/**
 * Helper: Ambil nomor bulan (1 s/d 12) dari sebuah item Surat Keluar atau Surat Masuk
 * Menyelaraskan Bulan Romawi resmi (kolom F Surat Keluar) dan Tanggal Surat secara akurat.
 */
function getItemMonth(item) {
  if (!item) return null;

  // 1. Cek Bulan Romawi resmi jika valid (Surat Keluar)
  const romanStr = (item.bulanRomawi || "").trim().toUpperCase();
  const romanIdx = ROMAN_MONTHS.indexOf(romanStr);
  const romanMonth = romanIdx !== -1 ? (romanIdx + 1) : null;

  // 2. Cek Tanggal Surat / Tanggal Diterima
  const dateStr = item.tanggal || item.tglSurat || item.tglMasuk || "";
  const dateMonth = extractMonthFromDateString(dateStr);

  // Jika keduanya ada dan selaras
  if (romanMonth !== null && dateMonth !== null && romanMonth === dateMonth) {
    return romanMonth;
  }

  // Jika ada bulan romawi dan tanggal, selesaikan kemungkinan format MM/DD/YYYY
  if (romanMonth !== null && dateStr) {
    const mDmy = String(dateStr).trim().match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (mDmy) {
      const p1 = parseInt(mDmy[1], 10);
      const p2 = parseInt(mDmy[2], 10);
      if (p1 === romanMonth || p2 === romanMonth) {
        return romanMonth;
      }
    }
    // Surat keluar resmi: utamakan bulan romawi nomor agenda
    return romanMonth;
  }

  // Jika tidak ada bulan romawi, gunakan tanggal yang ter-parse
  if (dateMonth !== null) {
    return dateMonth;
  }

  // Fallback: coba ekstrak dari nomorLengkap jika mengandung bulan romawi (misal: /X/2026)
  if (item.nomorLengkap) {
    const mRom = String(item.nomorLengkap).match(/\/([IVXLCDM]+)\/(?:20\d\d|\d{4})/i);
    if (mRom) {
      const rIdx = ROMAN_MONTHS.indexOf(mRom[1].toUpperCase());
      if (rIdx !== -1) return rIdx + 1;
    }
  }

  return romanMonth;
}

/**
 * Helper: Parse Tanggal secara fleksibel tanpa bias timezone UTC
 */
function parseDateParts(val) {
  if (!val) {
    const now = new Date();
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
      romanMonth: ROMAN_MONTHS[now.getMonth()] || "X",
      dateObj: now
    };
  }

  const str = String(val).trim().replace(/^'+/, "");

  // 1. Cek format YYYY-MM-DD atau YYYY/MM/DD
  const matchIso = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (matchIso) {
    const year = parseInt(matchIso[1], 10);
    const month = parseInt(matchIso[2], 10);
    const day = parseInt(matchIso[3], 10);
    const romanMonth = (month >= 1 && month <= 12) ? ROMAN_MONTHS[month - 1] : "X";
    return {
      year,
      month,
      day,
      romanMonth,
      dateObj: new Date(year, month - 1, day)
    };
  }

  // 2. Cek format DD/MM/YYYY atau DD-MM-YYYY
  const matchDmy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (matchDmy) {
    let part1 = parseInt(matchDmy[1], 10);
    let part2 = parseInt(matchDmy[2], 10);
    const year = parseInt(matchDmy[3], 10);
    let day = part1;
    let month = part2;
    if (part2 > 12 && part1 <= 12) {
      month = part1;
      day = part2;
    }
    const romanMonth = (month >= 1 && month <= 12) ? ROMAN_MONTHS[month - 1] : "X";
    return {
      year,
      month,
      day,
      romanMonth,
      dateObj: new Date(year, month - 1, day)
    };
  }

  const dt = new Date(str);
  if (!isNaN(dt.getTime())) {
    const year = dt.getFullYear();
    const month = dt.getMonth() + 1;
    const day = dt.getDate();
    const romanMonth = ROMAN_MONTHS[dt.getMonth()] || "X";
    return {
      year,
      month,
      day,
      romanMonth,
      dateObj: dt
    };
  }

  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    romanMonth: ROMAN_MONTHS[now.getMonth()] || "X",
    dateObj: now
  };
}

/**
 * Helper: Format Tanggal Indonesia (DD/MM/YYYY)
 * Mengubah 2026-10-26, 2026/10/26, ISO strings, maupun format tanggal lainnya menjadi 26/10/2026
 */
function formatDateIndo(dateStr) {
  if (!dateStr) return "-";
  dateStr = String(dateStr).trim().replace(/^'+/, "");
  if (!dateStr || dateStr === "-" || dateStr === "null" || dateStr === "undefined") return "-";

  // 1. Cek format DD-MM-YYYY atau DD/MM/YYYY (atau MM/DD/YYYY dari spreadsheet US)
  const matchDmy = dateStr.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (matchDmy) {
    const part1 = parseInt(matchDmy[1], 10);
    const part2 = parseInt(matchDmy[2], 10);
    const year = matchDmy[3];
    if (part2 > 12 && part1 <= 12) {
      // US format MM/DD/YYYY dari spreadsheet -> ubah ke DD/MM/YYYY
      const d = String(part2).padStart(2, "0");
      const m = String(part1).padStart(2, "0");
      return `${d}/${m}/${year}`;
    }
    const d = String(part1).padStart(2, "0");
    const m = String(part2).padStart(2, "0");
    return `${d}/${m}/${year}`;
  }

  // 2. Cek format ISO YYYY-MM-DD atau YYYY/MM/DD
  const matchIso = dateStr.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (matchIso) {
    const y = matchIso[1];
    const m = String(matchIso[2]).padStart(2, "0");
    const d = String(matchIso[3]).padStart(2, "0");
    return `${d}/${m}/${y}`;
  }

  // 3. Fallback Date.parse
  const parsed = Date.parse(dateStr);
  if (!isNaN(parsed)) {
    const dt = new Date(parsed);
    const d = String(dt.getDate()).padStart(2, "0");
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const y = dt.getFullYear();
    return `${d}/${m}/${y}`;
  }

  return dateStr;
}

/**
 * Helper: Mengubah tanggal (DD/MM/YYYY atau lainnya) menjadi format input HTML (YYYY-MM-DD)
 */
function formatDateToInput(dateStr) {
  if (!dateStr || dateStr === "-") return "";
  dateStr = String(dateStr).trim().replace(/^'+/, "");

  const matchIso = dateStr.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (matchIso) {
    const y = matchIso[1];
    const m = String(matchIso[2]).padStart(2, "0");
    const d = String(matchIso[3]).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const matchDmy = dateStr.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (matchDmy) {
    const part1 = parseInt(matchDmy[1], 10);
    const part2 = parseInt(matchDmy[2], 10);
    const year = matchDmy[3];
    let d = part1;
    let m = part2;
    if (part2 > 12 && part1 <= 12) {
      d = part2;
      m = part1;
    }
    return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  const parsed = Date.parse(dateStr);
  if (!isNaN(parsed)) {
    const dt = new Date(parsed);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  return "";
}

// Koleksi Template Surat Lengkap Berdasarkan Arsip Google Drive SMA YWKA
const REAL_DRIVE_TEMPLATES = [
  // 1. KODE 421.3 - SURAT UMUM
  {
    id: "tpl-umum-mengajar",
    cat: "421.3",
    nama: "Keterangan Aktif Mengajar Guru",
    kode: "421.3",
    perihal: "Surat Keterangan Aktif Mengajar Guru Mata Pelajaran",
    kepada: "Yang Berkepentingan",
    petugas: "BU MIRA",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Surat Keterangan"
  },
  {
    id: "tpl-umum-ijazah",
    cat: "421.3",
    nama: "Surat Pengganti Ijazah / Ralat",
    kode: "421.3",
    perihal: "Surat Keterangan Pengganti Ijazah Rusak / Hilang an. [Nama Siswa]",
    kepada: "Dinas KCD VII",
    petugas: "BU MIRA",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Pengganti Ijazah"
  },
  {
    id: "tpl-umum-aktif-siswa",
    cat: "421.3",
    nama: "Keterangan Siswa Aktif",
    kode: "421.3",
    perihal: "Surat Keterangan Siswa Aktif Bersekolah di SMA YWKA a.n [Nama Siswa] [Kelas]",
    kepada: "Yang Berkepentingan",
    petugas: "BU MIRA",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Siswa Aktif"
  },
  {
    id: "tpl-umum-undangan-rapat",
    cat: "421.3",
    nama: "Undangan Rapat Dinas / Walas",
    kode: "421.3",
    perihal: "Surat Undangan Rapat Dinas Persiapan Pembelajaran dan Koordinasi Guru",
    kepada: "Bapak/Ibu Guru & Karyawan",
    petugas: "BU ADE",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Undangan Rapat"
  },
  {
    id: "tpl-umum-kelakuan-baik",
    cat: "421.3",
    nama: "Surat Kelakuan Baik",
    kode: "421.3",
    perihal: "Surat Keterangan Kelakuan Baik Siswa a.n [Nama Siswa] [Kelas]",
    kepada: "Yang Membutuhkan",
    petugas: "BU ADE",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Kelakuan Baik"
  },
  {
    id: "tpl-umum-dks-yayasan",
    cat: "421.3",
    nama: "Permohonan Pencairan DKS ke Yayasan",
    kode: "421.3",
    perihal: "Surat Permohonan Pencairan Dana DKS ke Yayasan Wanita Kereta Api",
    kepada: "Ketua Pengurus Yayasan Wanita Kereta Api",
    petugas: "BUNDA MELI",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Pencairan Dana"
  },
  {
    id: "tpl-umum-gaji-berkala",
    cat: "421.3",
    nama: "Usulan Kenaikan Gaji Berkala",
    kode: "421.3",
    perihal: "Surat Usulan Kenaikan Gaji Berkala Tenaga Pendidik / Tendik a.n [Nama Guru]",
    kepada: "Direktur Pendidikan Yayasan Wanita Kereta Api",
    petugas: "BUNDA WILDA",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Kepegawaian"
  },

  // 2. KODE 421.6 - SURAT PELEPASAN / WISUDA
  {
    id: "tpl-wisuda-undangan",
    cat: "421.6",
    nama: "Undangan Pelepasan / Wisuda Siswa",
    kode: "421.6",
    perihal: "Surat Undangan Pelepasan dan Wisuda Siswa Kelas XII Tahun Pelajaran 2025/2026",
    kepada: "Orang Tua / Wali Siswa Kelas XII & Tamu Undangan",
    petugas: "BUNDA SHAMIA",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Wisuda Siswa"
  },
  {
    id: "tpl-wisuda-sk",
    cat: "421.6",
    nama: "SK Panitia Pelepasan Kelas XII",
    kode: "421.6",
    perihal: "SK Panitia Pelaksana Kegiatan Pelepasan Siswa Kelas XII SMA YWKA",
    kepada: "Panitia Pelaksana Pelepasan",
    petugas: "BUNDA ELVIRA",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "SK Pelepasan"
  },
  {
    id: "tpl-wisuda-dana",
    cat: "421.6",
    nama: "Permohonan Dana Wisuda & Ijazah",
    kode: "421.6",
    perihal: "Surat Permohonan Pencairan Dana Kegiatan Pelepasan Siswa Kelas XII dan Ijazah",
    kepada: "Yayasan Wanita Kereta Api",
    petugas: "BUNDA MELI",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Pelepasan Siswa"
  },

  // 3. KODE 421.7 - KEGIATAN SISWA
  {
    id: "tpl-siswa-dispen-lomba",
    cat: "421.7",
    nama: "Dispensasi Siswa Lomba / Ekskul",
    kode: "421.7",
    perihal: "Surat Dispensasi Siswa Mengikuti Kegiatan Persiapan Lomba [Nama Lomba / Ekskul]",
    kepada: "Bapak/Ibu Guru Mata Pelajaran",
    petugas: "BU ADE",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Dispensasi Siswa"
  },
  {
    id: "tpl-siswa-tugas-guru",
    cat: "421.7",
    nama: "Surat Tugas Guru Pembimbing Lomba",
    kode: "421.7",
    perihal: "Surat Tugas Guru Pendamping dan Pembimbing Kegiatan Lomba Siswa (O2SN/FLS2N)",
    kepada: "Guru Pembimbing yang Bersangkutan",
    petugas: "BU ADE",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Surat Tugas"
  },
  {
    id: "tpl-siswa-ldks",
    cat: "421.7",
    nama: "Pemberitahuan LDKS ke Orang Tua",
    kode: "421.7",
    perihal: "Surat Pemberitahuan Pelaksanaan Pelatihan Dasar Kepemimpinan Siswa (LDKS)",
    kepada: "Orang Tua / Wali Siswa",
    petugas: "BUNDA ELVIRA",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "LDKS Siswa"
  },
  {
    id: "tpl-siswa-ldks-izin",
    cat: "421.7",
    nama: "Permohonan Tempat LDKS ke Militer",
    kode: "421.7",
    perihal: "Surat Permohonan Penyelenggaraan Latihan Dasar Kepemimpinan Siswa di PUSDIKKAV/PUSDIKJAS",
    kepada: "Komandan PUSDIKKAV / PUSDIKJAS",
    petugas: "BUNDA ELVIRA",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Izin Tempat LDKS"
  },
  {
    id: "tpl-siswa-panggilan-ortu",
    cat: "421.7",
    nama: "Panggilan Orang Tua Siswa (BK)",
    kode: "421.7",
    perihal: "Surat Pemanggilan Orang Tua / Wali Siswa a.n [Nama Siswa] [Kelas]",
    kepada: "Orang Tua / Wali Siswa",
    petugas: "AYAH IRWIN / BK",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Pemanggilan BK"
  },
  {
    id: "tpl-siswa-homevisit",
    cat: "421.7",
    nama: "Surat Tugas Home Visit Siswa",
    kode: "421.7",
    perihal: "Surat Tugas Home Visit Siswa a.n [Nama Siswa] [Kelas]",
    kepada: "Guru BK & Wali Kelas",
    petugas: "AYAH IRWIN",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Home Visit"
  },
  {
    id: "tpl-siswa-qurban",
    cat: "421.7",
    nama: "Pemberitahuan Kegiatan Qurban",
    kode: "421.7",
    perihal: "Surat Pemberitahuan Kegiatan Qurban Idul Adha 1447 H (Untuk RT/RW/Ortu)",
    kepada: "Orang Tua Siswa / Warga Lingkungan Sekolah",
    petugas: "BU ADE",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Pemberitahuan Qurban"
  },

  // 4. KODE 421.71 - REUNI ATAU KARYA WISATA
  {
    id: "tpl-wisata-fieldtrip-kai",
    cat: "421.71",
    nama: "Field Trip ke PT. KAI",
    kode: "421.71",
    perihal: "Surat Permohonan Kunjungan / Field Trip Siswa SMA YWKA ke PT. KAI",
    kepada: "Direksi PT. Kereta Api Indonesia (Persero)",
    petugas: "BUNDA ELVIRA",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Field Trip PT. KAI"
  },
  {
    id: "tpl-wisata-pinjam-bus",
    cat: "421.71",
    nama: "Peminjaman Bus untuk Wisata",
    kode: "421.71",
    perihal: "Surat Permohonan Peminjaman Bis Sekolah untuk Kegiatan Karya Wisata Siswa",
    kepada: "Instansi / Pihak Pengelola Transportasi",
    petugas: "BUNDA ELVIRA",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Peminjaman Bus"
  },
  {
    id: "tpl-wisata-reuni",
    cat: "421.71",
    nama: "Koordinasi Reuni Alumni SMA YWKA",
    kode: "421.71",
    perihal: "Surat Pemberitahuan dan Izin Penyelenggaraan Kegiatan Reuni Akbar Alumni SMA YWKA",
    kepada: "Pengurus Ikatan Alumni SMA YWKA",
    petugas: "BU ADE",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Reuni Alumni"
  },

  // 5. KODE 422.1 - KEGIATAN PPDB DAN MPLS
  {
    id: "tpl-ppdb-mou-smp",
    cat: "422.1",
    nama: "Surat Tugas MOU SPMB SMPN",
    kode: "422.1",
    perihal: "Surat Tugas MOU SPMB SMPN [Nomor SMP] Bandung",
    kepada: "Kepala SMPN ... Bandung",
    petugas: "BU ADE",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "MOU SPMB"
  },
  {
    id: "tpl-ppdb-sosialisasi",
    cat: "422.1",
    nama: "Sosialisasi PPDB ke SMP/MTs",
    kode: "422.1",
    perihal: "Surat Perintah Melaksanakan Sosialisasi dan Edu Expo PPDB ke SMP Mitra",
    kepada: "Tim Sosialisasi PPDB SMA YWKA",
    petugas: "BU ADE",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Sosialisasi PPDB"
  },
  {
    id: "tpl-ppdb-sk-mpls",
    cat: "422.1",
    nama: "SK Panitia PPDB & MPLS",
    kode: "422.1",
    perihal: "SK Tim Panitia Penerimaan Peserta Didik Baru (PPDB) dan MPLS Tahun Pelajaran 2026/2027",
    kepada: "Guru & Panitia Pelaksana",
    petugas: "BUNDA ADE",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "SK MPLS"
  },

  // 6. KODE 422.3 - PENGUMUMAN HARI LIBUR
  {
    id: "tpl-libur-ramadhan",
    cat: "422.3",
    nama: "Pengumuman Libur Awal Ramadhan",
    kode: "422.3",
    perihal: "Surat Pemberitahuan Libur Awal Ramadhan 1447 H dan Penyesuaian Jam KBM",
    kepada: "Orang Tua / Wali Siswa & Guru",
    petugas: "BU ADE",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Libur Ramadhan"
  },
  {
    id: "tpl-libur-idulfitri",
    cat: "422.3",
    nama: "Surat Edaran Libur Hari Raya Idul Fitri",
    kode: "422.3",
    perihal: "Surat Edaran Libur Hari Raya Idul Fitri 1447 H dan Cuti Bersama Sekolah",
    kepada: "Orang Tua / Wali Siswa",
    petugas: "BU ADE",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Libur Idul Fitri"
  },
  {
    id: "tpl-libur-semester",
    cat: "422.3",
    nama: "Pengumuman Libur Akhir Semester",
    kode: "422.3",
    perihal: "Surat Pemberitahuan Libur Akhir Semester dan Jadwal Masuk Pembelajaran Kembali",
    kepada: "Seluruh Siswa dan Orang Tua Siswa",
    petugas: "BU ADE",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Libur Semester"
  },

  // 7. KODE 422.5 - BEASISWA / PELAJAR TELADAN
  {
    id: "tpl-beasiswa-eligible",
    cat: "422.5",
    nama: "Surat Siswa Eligible SNBP",
    kode: "422.5",
    perihal: "Surat Penetapan dan Kesediaan Siswa Eligible Pendaftaran SNBP 2026",
    kepada: "Siswa & Orang Tua Kelas XII",
    petugas: "BUNDA AYU",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Siswa Eligible"
  },
  {
    id: "tpl-beasiswa-teladan",
    cat: "422.5",
    nama: "SK Siswa Berprestasi / Teladan",
    kode: "422.5",
    perihal: "SK Siswa Berprestasi dan Penerima Penghargaan Pelajar Teladan SMA YWKA",
    kepada: "Siswa yang Bersangkutan",
    petugas: "AYAH RIDWAN",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Siswa Berprestasi"
  },
  {
    id: "tpl-beasiswa-nilai-tinggi",
    cat: "422.5",
    nama: "Permohonan Beasiswa Nilai Tertinggi",
    kode: "422.5",
    perihal: "Surat Permohonan Beasiswa Peraih Nilai Ijazah Tertinggi Tahun Pelajaran 2025/2026",
    kepada: "Yayasan Wanita Kereta Api",
    petugas: "BUNDA SHAMIA",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Beasiswa Siswa"
  },

  // 8. KODE 423.5 - KEGIATAN KURIKULUM
  {
    id: "tpl-kur-skl",
    cat: "423.5",
    nama: "Surat Keterangan Lulus (SKL)",
    kode: "423.5",
    perihal: "Surat Keterangan Lulus (SKL) Sementara Siswa Kelas XII Tahun Ajaran 2025/2026",
    kepada: "Yang Membutuhkan",
    petugas: "BUNDA WILDA",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "SKL Siswa"
  },
  {
    id: "tpl-kur-supervisi",
    cat: "423.5",
    nama: "SK Supervisi & Kinerja Guru (PKG)",
    kode: "423.5",
    perihal: "SK Supervisi dan Penilaian Kinerja Guru (PKG) dan Tendik SMA YWKA",
    kepada: "Bapak/Ibu Guru & Tim Penilai",
    petugas: "BUNDA WILDA",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Supervisi Guru"
  },
  {
    id: "tpl-kur-riset",
    cat: "423.5",
    nama: "Ujian Sidang Riset / Penelitian Siswa",
    kode: "423.5",
    perihal: "Surat Edaran Pelaksanaan Ujian Sidang Penelitian Kelas 12 Tahun Pelajaran 2026",
    kepada: "Penguji & Siswa Kelas XII",
    petugas: "BUNDA SHAMIA",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Sidang Penelitian"
  },
  {
    id: "tpl-kur-transkrip",
    cat: "423.5",
    nama: "Transkrip Nilai Siswa Sementara",
    kode: "423.5",
    perihal: "Surat Keterangan Transkrip Nilai Rapor Siswa untuk Keperluan SNBP / Seleksi PTN",
    kepada: "Perguruan Tinggi Negeri",
    petugas: "BUNDA WILDA",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Transkrip Nilai"
  },

  // 9. KODE 423.7 - KEGIATAN PAT, PAS, UTS, UJIAN
  {
    id: "tpl-ujian-asts",
    cat: "423.7",
    nama: "Edaran ASTS (Sumatif Tengah Semester / UTS)",
    kode: "423.7",
    perihal: "Surat Perihal Informasi Pelaksanaan Asesmen Sumatif Tengah Semester (ASTS Gasal/Genap)",
    kepada: "Orang Tua / Wali Siswa",
    petugas: "BU ADE",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "ASTS / UTS"
  },
  {
    id: "tpl-ujian-asat-psaj",
    cat: "423.7",
    nama: "Edaran ASAT / PSAJ (PAT/PAS)",
    kode: "423.7",
    perihal: "Surat Edaran Pelaksanaan Asesmen Sumatif Akhir Tahun (ASAT / PSAJ 2026)",
    kepada: "Orang Tua / Wali Peserta Didik",
    petugas: "BU ADE",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "PSAJ / ASAT"
  },
  {
    id: "tpl-ujian-rapor",
    cat: "423.7",
    nama: "Undangan Pembagian Hasil Asesmen / Rapor",
    kode: "423.7",
    perihal: "Surat Undangan Orang Tua Pembagian Hasil Asesmen Sumatif / Rapor Siswa",
    kepada: "Orang Tua / Wali Siswa",
    petugas: "BU ADE",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Pembagian Rapor"
  },

  // 10. KODE 425.11 - SARPRAS & GEDUNG SEKOLAH
  {
    id: "tpl-sarpras-gedung",
    cat: "425.11",
    nama: "Permohonan Perbaikan Kusen / Gedung",
    kode: "425.11",
    perihal: "Surat Permohonan Perbaikan Kusen Jendela dan Sarana Gedung Sekolah",
    kepada: "Pengurus Sarpras Yayasan Wanita Kereta Api",
    petugas: "BU AAM AMALIAH",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Perbaikan Sarpras"
  },
  {
    id: "tpl-sarpras-renovasi",
    cat: "425.11",
    nama: "Laporan Kerusakan & Renovasi Kelas",
    kode: "425.11",
    perihal: "Laporan Kondisi Fisik Bangunan dan Usulan Renovasi Ruang Kelas SMA YWKA",
    kepada: "Yayasan Wanita Kereta Api",
    petugas: "BU AAM AMALIAH",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Renovasi Gedung"
  },

  // 11. KODE 425.2 - SARPRAS BUKU / BAHAN AJAR
  {
    id: "tpl-sarpras-buku",
    cat: "425.2",
    nama: "Pengadaan Buku Pelajaran / Modul",
    kode: "425.2",
    perihal: "Surat Pengajuan Pengadaan Buku Pelajaran dan Bahan Ajar Kurikulum Baru",
    kepada: "Bagian Pengadaan Yayasan Wanita Kereta Api",
    petugas: "BUNDA SHAMIA",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Bahan Ajar"
  },
  {
    id: "tpl-sarpras-perpus",
    cat: "425.2",
    nama: "Berita Acara Penerimaan Buku Pustaka",
    kode: "425.2",
    perihal: "Berita Acara Penerimaan Hibah dan Pengadaan Buku Koleksi Perpustakaan Sekolah",
    kepada: "Penerbit / Dinas Perpustakaan",
    petugas: "BUNDA SHAMIA",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Buku Perpustakaan"
  },

  // 12. KODE 425.3 - SARPRAS PERLENGKAPAN SEKOLAH & LAINNYA
  {
    id: "tpl-sarpras-alat",
    cat: "425.3",
    nama: "Pengajuan Alat Olahraga & UKS",
    kode: "425.3",
    perihal: "Surat Pengajuan Pengadaan Alat Olahraga dan Perlengkapan Medis Ruang UKS",
    kepada: "Yayasan Wanita Kereta Api",
    petugas: "BU AAM",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Pengajuan Alat"
  },
  {
    id: "tpl-sarpras-pinjam",
    cat: "425.3",
    nama: "Peminjaman Perlengkapan ke SMP/Mitra",
    kode: "425.3",
    perihal: "Surat Permohonan Peminjaman Barang dan Perlengkapan Acara ke SMP YWKA",
    kepada: "Kepala SMP YWKA Bandung",
    petugas: "BU ADE",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Peminjaman Barang"
  }
];

// ===================================================================
// MODUL AUTENTIKASI & KEAMANAN SMAS YWKA BANDUNG
// ===================================================================
const AUTH_CONFIG = {
  defaultUsername: "admin",
  defaultPassword: "ywka2026",
  sessionKey: "sma_ywka_auth_session",
  customPasswordKey: "sma_ywka_custom_password"
};

function getActiveAdminPassword() {
  return localStorage.getItem(AUTH_CONFIG.customPasswordKey) || AUTH_CONFIG.defaultPassword;
}

function isAuthenticated() {
  return !!(localStorage.getItem(AUTH_CONFIG.sessionKey) || sessionStorage.getItem(AUTH_CONFIG.sessionKey));
}

function checkAuthState() {
  const loginScreen = document.getElementById("loginScreen");
  const appLayout = document.getElementById("appLayout");
  const loggedIn = isAuthenticated();

  if (loggedIn) {
    if (loginScreen) {
      loginScreen.classList.add("hidden");
    }
    if (appLayout) {
      appLayout.style.display = "flex";
    }
  } else {
    if (loginScreen) {
      loginScreen.classList.remove("hidden");
    }
    if (appLayout) {
      appLayout.style.display = "none";
    }
  }
}

function initAuthModule() {
  const formLogin = document.getElementById("formLogin");
  const inputUsername = document.getElementById("loginUsername");
  const inputPassword = document.getElementById("loginPassword");
  const checkRemember = document.getElementById("loginRememberMe");
  const btnTogglePass = document.getElementById("btnToggleLoginPass");
  const iconEye = document.getElementById("iconLoginEye");
  const btnAutofill = document.getElementById("btnAutofillDemo");
  const loginCard = document.querySelector(".login-card");

  const btnLogout = document.getElementById("btnLogout");
  const btnSidebarLogout = document.getElementById("btnSidebarLogout");

  // Settings Password Elements
  const settingsPass = document.getElementById("settingsAdminPassword");
  const btnSavePass = document.getElementById("btnSaveAdminPassword");
  const btnResetPass = document.getElementById("btnResetAdminPassword");
  const btnToggleSettingsPass = document.getElementById("btnToggleSettingsPass");
  const iconSettingsPass = document.getElementById("iconSettingsPass");

  if (settingsPass) {
    settingsPass.value = getActiveAdminPassword();
  }

  // 1. Toggle Show / Hide Password di Form Login
  if (btnTogglePass && inputPassword && iconEye) {
    btnTogglePass.addEventListener("click", () => {
      const isPass = inputPassword.type === "password";
      inputPassword.type = isPass ? "text" : "password";
      iconEye.className = isPass ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
    });
  }

  // 2. Toggle Show / Hide Password di Form Pengaturan
  if (btnToggleSettingsPass && settingsPass && iconSettingsPass) {
    btnToggleSettingsPass.addEventListener("click", () => {
      const isPass = settingsPass.type === "password";
      settingsPass.type = isPass ? "text" : "password";
      iconSettingsPass.className = isPass ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
    });
  }

  // 3. Tombol Akses Cepat Live Demo (Autofill & Login Seketika)
  if (btnAutofill && inputUsername && inputPassword && formLogin) {
    btnAutofill.addEventListener("click", () => {
      inputUsername.value = AUTH_CONFIG.defaultUsername;
      inputPassword.value = getActiveAdminPassword();
      if (checkRemember) checkRemember.checked = true;
      showToast("⚡ Akses Demo Cepat diisi otomatis!", "info");
      setTimeout(() => {
        formLogin.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
      }, 200);
    });
  }

  // 4. Handle Submit Form Login
  if (formLogin) {
    formLogin.addEventListener("submit", (e) => {
      e.preventDefault();
      const enteredUser = (inputUsername?.value || "").trim();
      const enteredPass = inputPassword?.value || "";
      const validPass = getActiveAdminPassword();

      if (enteredUser.toLowerCase() === AUTH_CONFIG.defaultUsername && enteredPass === validPass) {
        const isRemember = checkRemember ? checkRemember.checked : true;
        if (isRemember) {
          localStorage.setItem(AUTH_CONFIG.sessionKey, enteredUser);
        } else {
          sessionStorage.setItem(AUTH_CONFIG.sessionKey, enteredUser);
        }

        showToast("✅ Login Berhasil! Selamat datang, Admin Tata Usaha SMAS YWKA.", "success");
        checkAuthState();
      } else {
        if (loginCard) {
          loginCard.classList.add("shake");
          setTimeout(() => loginCard.classList.remove("shake"), 500);
        }
        showToast("⚠️ Username atau password salah! (Username: admin, Password: " + validPass + ")", "error");
      }
    });
  }

  // 5. Handle Logout
  function executeLogout() {
    localStorage.removeItem(AUTH_CONFIG.sessionKey);
    sessionStorage.removeItem(AUTH_CONFIG.sessionKey);
    showToast("👋 Anda berhasil keluar (Logout) dari sistem.", "info");
    checkAuthState();
  }

  if (btnLogout) {
    btnLogout.addEventListener("click", () => {
      if (confirm("Apakah Anda yakin ingin keluar dari sistem?")) {
        executeLogout();
      }
    });
  }

  if (btnSidebarLogout) {
    btnSidebarLogout.addEventListener("click", () => {
      if (confirm("Apakah Anda yakin ingin keluar dari sistem?")) {
        executeLogout();
      }
    });
  }

  // 6. Simpan Perubahan Password di Pengaturan
  if (btnSavePass && settingsPass) {
    btnSavePass.addEventListener("click", () => {
      const newPass = settingsPass.value.trim();
      if (!newPass) {
        showToast("Password tidak boleh kosong!", "warning");
        return;
      }
      localStorage.setItem(AUTH_CONFIG.customPasswordKey, newPass);
      showToast("✅ Password admin berhasil diperbarui!", "success");
    });
  }

  // 7. Reset Password ke Default
  if (btnResetPass && settingsPass) {
    btnResetPass.addEventListener("click", () => {
      localStorage.removeItem(AUTH_CONFIG.customPasswordKey);
      settingsPass.value = AUTH_CONFIG.defaultPassword;
      showToast("🔄 Password dikembalikan ke bawaan: " + AUTH_CONFIG.defaultPassword, "info");
    });
  }

  // Jalankan pemeriksaan status autentikasi pertama kali
  checkAuthState();
}
window.initAuthModule = initAuthModule;
window.checkAuthState = checkAuthState;
window.isAuthenticated = isAuthenticated;

// ===================================================================
// INISIALISASI HALAMAN
// ===================================================================
document.addEventListener("DOMContentLoaded", () => {
  // 0. Autentikasi Pengguna & Portal Login
  try {
    initAuthModule();
  } catch (err) {
    console.error("Gagal inisialisasi autentikasi:", err);
  }

  // 1. HIDRASI INSTAN (0 milidetik): Langsung tampilkan data dari cache lokal/bawaan
  try {
    hydrateFromCacheOrBuiltin();
  } catch (err) {
    console.error("Gagal hidrasi data awal:", err);
  }

  // 2. Inisialisasi Komponen UI dengan Pelindung Error (Safe Execution)
  try { initDateDefaults(); } catch (e) { console.error("Error initDateDefaults:", e); }
  try { initNavigation(); } catch (e) { console.error("Error initNavigation:", e); }
  try { initTemplateChips(); } catch (e) { console.error("Error initTemplateChips:", e); }
  try { initAppsScriptInstructions(); } catch (e) { console.error("Error initAppsScriptInstructions:", e); }
  try { initFileUploadHandlers(); } catch (e) { console.error("Error initFileUploadHandlers:", e); }
  try { initWaModule(); } catch (e) { console.error("Error initWaModule:", e); }
  try { initEventListeners(); } catch (e) { console.error("Error initEventListeners:", e); }
  try { updateDriveLinksInUI(); } catch (e) { console.error("Error updateDriveLinksInUI:", e); }
  try { checkConnectionBanners(); } catch (e) { console.error("Error checkConnectionBanners:", e); }
  try { initTemplateKosong(); } catch (e) { console.error("Error initTemplateKosong:", e); }
  try { initPwaServiceWorker(); } catch (e) { console.error("Error initPwaServiceWorker:", e); }

  // 3. Sinkronisasi live di latar belakang (Background Revalidation)
  try {
    loadDataFromSpreadsheet();
  } catch (err) {
    console.error("Gagal memulai loadDataFromSpreadsheet:", err);
  }

  // 4. Verifikasi versi Web App Apps Script yang aktif di Google Cloud
  try {
    checkAppsScriptVersionStatus(false);
  } catch (err) {
    console.warn("Gagal memeriksa versi Apps Script:", err);
  }
});

/**
 * Helper: Bersihkan dan satukan data ganda (Deduplikasi Cerdas)
 */
function deduplicateItems(list, type = "masuk") {
  if (!Array.isArray(list) || list.length === 0) return [];
  const result = [];
  const seen = new Set();

  for (const item of list) {
    if (!item) continue;
    let key = "";
    if (type === "keluar") {
      key = item.noAgenda ? `keluar:${item.noAgenda.trim().toLowerCase()}` : `id:${item.id}`;
    } else {
      const sigUrut = item.noUrut ? item.noUrut.trim() : "";
      const sigAgenda = (item.noAgenda && item.noAgenda !== "-") ? item.noAgenda.trim().toLowerCase() : "";
      const sigPerihal = item.perihal ? item.perihal.trim().toLowerCase() : "";
      if (sigUrut && (sigPerihal || sigAgenda)) {
        key = `masuk:${sigUrut}|${sigAgenda}|${sigPerihal}`;
      } else {
        key = `id:${item.id || Math.random()}`;
      }
    }

    if (seen.has(key)) {
      const existing = result.find(r => {
        if (type === "keluar") return r.noAgenda === item.noAgenda;
        return (r.noUrut && item.noUrut && r.noUrut === item.noUrut) && ((r.noAgenda && r.noAgenda === item.noAgenda && r.noAgenda !== "-") || (r.perihal === item.perihal));
      });
      if (existing) {
        if (!existing.driveUrl && item.driveUrl) {
          existing.driveUrl = item.driveUrl;
          existing.lampiran = item.lampiran;
        }
        if (!existing.duplicateRowIndices) existing.duplicateRowIndices = [existing.rowIndex];
        if (item.rowIndex && !existing.duplicateRowIndices.includes(item.rowIndex)) {
          existing.duplicateRowIndices.push(item.rowIndex);
        }
      }
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return result;
}

/**
 * Hidrasi Seketika (0 milidetik): Muat cache lokal atau data bawaan terlebih dahulu dengan Anti-Duplikasi
 */
function hydrateFromCacheOrBuiltin() {
  const cachedKeluar = localStorage.getItem("cache_surat_keluar_2026");
  const cachedMasuk = localStorage.getItem("cache_surat_masuk_2026");

  if (cachedKeluar && cachedMasuk) {
    try {
      const parsedKeluar = JSON.parse(cachedKeluar);
      const parsedMasuk = JSON.parse(cachedMasuk);
      if (Array.isArray(parsedKeluar) && parsedKeluar.length > 0) {
        state.suratKeluar = deduplicateItems(parsedKeluar, "keluar");
      } else {
        loadBuiltinSampleData();
      }
      if (Array.isArray(parsedMasuk) && parsedMasuk.length > 0) {
        // Cek integritas cache surat masuk: jika terdeteksi nomor urut melompat tidak wajar (> 300), bersihkan cache
        const hasCorruptedNumbers = parsedMasuk.some(m => parseInt(m.noUrut, 10) > 300);
        if (hasCorruptedNumbers) {
          localStorage.removeItem("cache_surat_masuk_2026");
          loadBuiltinSampleData();
        } else {
          state.suratMasuk = deduplicateItems(parsedMasuk, "masuk");
        }
      }
    } catch (e) {
      loadBuiltinSampleData();
    }
  } else {
    loadBuiltinSampleData();
  }

  // Pertahankan surat lokal yang belum tersimpan dan bersihkan yang sudah sinkron
  const unsyncedKeluar = JSON.parse(localStorage.getItem("unsynced_surat_keluar") || "[]");
  if (unsyncedKeluar.length > 0) {
    const remainingKeluar = [];
    unsyncedKeluar.forEach(uItem => {
      const found = state.suratKeluar.some(k => (k.noAgenda && uItem.noAgenda && k.noAgenda === uItem.noAgenda) || (k.perihal && uItem.perihal && k.perihal === uItem.perihal));
      if (!found) {
        state.suratKeluar.push(uItem);
        remainingKeluar.push(uItem);
      }
    });
    state.suratKeluar.sort((a, b) => (parseInt(a.noAgenda || a.noUrut, 10) || 0) - (parseInt(b.noAgenda || b.noUrut, 10) || 0));
    localStorage.setItem("unsynced_surat_keluar", JSON.stringify(remainingKeluar));
  }

  const unsyncedMasuk = JSON.parse(localStorage.getItem("unsynced_surat_masuk") || "[]");
  if (unsyncedMasuk.length > 0) {
    const remainingMasuk = [];
    unsyncedMasuk.forEach(uItem => {
      if (parseInt(uItem.noUrut, 10) > 300) return; // Singkirkan data korup lama jika ada
      const found = state.suratMasuk.some(m => (m.noUrut && uItem.noUrut && m.noUrut === uItem.noUrut) || (m.perihal && uItem.perihal && m.perihal === uItem.perihal));
      if (!found) {
        state.suratMasuk.push(uItem);
        remainingMasuk.push(uItem);
      }
    });
    state.suratMasuk.sort((a, b) => (parseInt(a.noUrut, 10) || 0) - (parseInt(b.noUrut, 10) || 0));
    localStorage.setItem("unsynced_surat_masuk", JSON.stringify(remainingMasuk));
  }

  calculateNextSequence();
  updateDashboardUI();
  filterSuratKeluarData();
  filterSuratMasukData();
}

function initDateDefaults() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const formattedToday = `${yyyy}-${mm}-${dd}`;

  const genDateInput = document.getElementById("genTanggalSurat");
  if (genDateInput) {
    genDateInput.value = formattedToday;
    updateDateBadgePreview("genTanggalSurat", "previewGenTanggalSurat");
    genDateInput.addEventListener("change", () => updateDateBadgePreview("genTanggalSurat", "previewGenTanggalSurat"));
    genDateInput.addEventListener("input", () => updateDateBadgePreview("genTanggalSurat", "previewGenTanggalSurat"));
  }

  const masukTglInput = document.getElementById("inMasukTglSurat");
  const masukTerimaInput = document.getElementById("inMasukTglDiterima");
  if (masukTglInput) {
    masukTglInput.value = formattedToday;
    updateDateBadgePreview("inMasukTglSurat", "previewInMasukTglSurat");
    masukTglInput.addEventListener("change", () => updateDateBadgePreview("inMasukTglSurat", "previewInMasukTglSurat"));
    masukTglInput.addEventListener("input", () => updateDateBadgePreview("inMasukTglSurat", "previewInMasukTglSurat"));
  }
  if (masukTerimaInput) {
    masukTerimaInput.value = formattedToday;
    updateDateBadgePreview("inMasukTglDiterima", "previewInMasukTglDiterima");
    masukTerimaInput.addEventListener("change", () => updateDateBadgePreview("inMasukTglDiterima", "previewInMasukTglDiterima"));
    masukTerimaInput.addEventListener("input", () => updateDateBadgePreview("inMasukTglDiterima", "previewInMasukTglDiterima"));
  }

  // Edit forms date listeners
  const editKeluarTgl = document.getElementById("editKeluarTanggalSurat");
  if (editKeluarTgl) {
    editKeluarTgl.addEventListener("change", () => updateDateBadgePreview("editKeluarTanggalSurat", "previewEditKeluarTgl"));
    editKeluarTgl.addEventListener("input", () => updateDateBadgePreview("editKeluarTanggalSurat", "previewEditKeluarTgl"));
  }
  const editMasukTgl = document.getElementById("editMasukTglSurat");
  if (editMasukTgl) {
    editMasukTgl.addEventListener("change", () => updateDateBadgePreview("editMasukTglSurat", "previewEditMasukTglSurat"));
    editMasukTgl.addEventListener("input", () => updateDateBadgePreview("editMasukTglSurat", "previewEditMasukTglSurat"));
  }
  const editMasukTerima = document.getElementById("editMasukTglDiterima");
  if (editMasukTerima) {
    editMasukTerima.addEventListener("change", () => updateDateBadgePreview("editMasukTglDiterima", "previewEditMasukTglDiterima"));
    editMasukTerima.addEventListener("input", () => updateDateBadgePreview("editMasukTglDiterima", "previewEditMasukTglDiterima"));
  }

  // AI Form date listener
  const aiTgl = document.getElementById("aiInputTanggal");
  if (aiTgl) {
    aiTgl.value = formattedToday;
    updateDateBadgePreview("aiInputTanggal", "previewAiInputTanggal", "previewAiRomanMonth");
    aiTgl.addEventListener("change", () => updateDateBadgePreview("aiInputTanggal", "previewAiInputTanggal", "previewAiRomanMonth"));
    aiTgl.addEventListener("input", () => updateDateBadgePreview("aiInputTanggal", "previewAiInputTanggal", "previewAiRomanMonth"));
  }

  updateGeneratedPreview();
}

function updateDateBadgePreview(inputId, previewId, romanPreviewId) {
  const input = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  if (input && preview) {
    preview.textContent = formatDateIndo(input.value) || "-";
  }
  if (input && romanPreviewId) {
    const romanEl = document.getElementById(romanPreviewId);
    if (romanEl) {
      const parts = parseDateParts(input.value);
      romanEl.textContent = `Bulan Romawi: ${parts.romanMonth}`;
    }
  }
}

function initNavigation() {
  const navItems = document.querySelectorAll(".nav-item");
  const tabPanes = document.querySelectorAll(".tab-pane");
  const titleElem = document.getElementById("currentSectionTitle");

  navItems.forEach(item => {
    item.addEventListener("click", () => {
      const targetId = item.getAttribute("data-tab");

      navItems.forEach(n => n.classList.remove("active"));
      tabPanes.forEach(p => p.classList.remove("active"));

      item.classList.add("active");
      const targetPane = document.getElementById(targetId);
      if (targetPane) targetPane.classList.add("active");

      if (titleElem) {
        titleElem.textContent = item.querySelector("span")?.textContent || "Agenda Surat";
      }

      const sidebar = document.getElementById("sidebar");
      if (sidebar && window.innerWidth <= 992) {
        sidebar.classList.remove("show");
      }

      if (targetId === "tab-statistik") {
        renderStatistics();
      }
    });
  });

  // Mobile Menu Toggle
  const openSidebarBtn = document.getElementById("openSidebarBtn");
  const closeSidebarBtn = document.getElementById("closeSidebarBtn");
  const sidebar = document.getElementById("sidebar");

  if (openSidebarBtn && sidebar) {
    openSidebarBtn.addEventListener("click", () => sidebar.classList.add("show"));
  }
  if (closeSidebarBtn && sidebar) {
    closeSidebarBtn.addEventListener("click", () => sidebar.classList.remove("show"));
  }

  // Quick Action Buttons
  const btnQuickKeluar = document.getElementById("btnQuickCreateKeluar");
  if (btnQuickKeluar) {
    btnQuickKeluar.addEventListener("click", () => {
      const tabGenBtn = document.querySelector('[data-tab="tab-generator"]');
      if (tabGenBtn) tabGenBtn.click();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  const btnQuickMasuk = document.getElementById("btnQuickCreateMasuk");
  const btnHeaderMasuk = document.getElementById("btnOpenModalMasukHeader");
  if (btnQuickMasuk) {
    btnQuickMasuk.addEventListener("click", () => openCreateModalMasuk());
  }
  if (btnHeaderMasuk) {
    btnHeaderMasuk.addEventListener("click", () => openCreateModalMasuk());
  }

  const modalMasuk = document.getElementById("modalSuratMasuk");
  const btnCloseModalMasuk = document.getElementById("btnCloseModalMasuk");
  const btnCancelModalMasuk = document.getElementById("btnCancelModalMasuk");
  if (btnCloseModalMasuk && modalMasuk) {
    btnCloseModalMasuk.addEventListener("click", () => modalMasuk.classList.remove("show"));
  }
  if (btnCancelModalMasuk && modalMasuk) {
    btnCancelModalMasuk.addEventListener("click", () => modalMasuk.classList.remove("show"));
  }

  // Listener dropdown pilihan pengirim Surat Masuk
  const inMasukDari = document.getElementById("inMasukDari");
  const inMasukDariCustomGroup = document.getElementById("inMasukDariCustomGroup");
  const inMasukDariCustom = document.getElementById("inMasukDariCustom");
  if (inMasukDari) {
    inMasukDari.addEventListener("change", () => {
      if (inMasukDari.value === "__CUSTOM__") {
        if (inMasukDariCustomGroup) inMasukDariCustomGroup.style.display = "block";
        if (inMasukDariCustom) inMasukDariCustom.focus();
      } else {
        if (inMasukDariCustomGroup) inMasukDariCustomGroup.style.display = "none";
        if (inMasukDariCustom) inMasukDariCustom.value = "";
      }
    });
  }

  // Disposisi Modal Close
  const modalDisp = document.getElementById("modalDisposisi");
  const btnCloseModalDisp = document.getElementById("btnCloseModalDisposisi");
  const btnCloseDisp = document.getElementById("btnCloseDisposisi");
  if (btnCloseModalDisp && modalDisp) {
    btnCloseModalDisp.addEventListener("click", () => modalDisp.classList.remove("show"));
  }
  if (btnCloseDisp && modalDisp) {
    btnCloseDisp.addEventListener("click", () => modalDisp.classList.remove("show"));
  }
  const btnPrintDisposisiDoc = document.getElementById("btnPrintDisposisiDoc");
  if (btnPrintDisposisiDoc) {
    btnPrintDisposisiDoc.addEventListener("click", () => {
      document.body.classList.add("printing-single-disposisi");
      setTimeout(() => {
        window.print();
      }, 100);

      const cleanup = () => {
        document.body.classList.remove("printing-single-disposisi");
        window.removeEventListener("afterprint", cleanup);
      };
      window.addEventListener("afterprint", cleanup);
      setTimeout(cleanup, 2500);
    });
  }
  const tabBtnDisposisi = document.getElementById("tabBtnDisposisi");
  const tabBtnBerkasDrive = document.getElementById("tabBtnBerkasDrive");
  if (tabBtnDisposisi) {
    tabBtnDisposisi.addEventListener("click", () => switchPrintTab("disposisi"));
  }
  if (tabBtnBerkasDrive) {
    tabBtnBerkasDrive.addEventListener("click", () => switchPrintTab("berkas"));
  }
  const btnPrintFileInsideModal = document.getElementById("btnPrintFileInsideModal");
  if (btnPrintFileInsideModal) {
    btnPrintFileInsideModal.addEventListener("click", executePrintAttachedFile);
  }
  const btnPrintFileFooter = document.getElementById("btnPrintFileFooter");
  if (btnPrintFileFooter) {
    btnPrintFileFooter.addEventListener("click", executePrintAttachedFile);
  }
  const btnUploadNowFromPrint = document.getElementById("btnUploadNowFromPrint");
  if (btnUploadNowFromPrint && modalDisp) {
    btnUploadNowFromPrint.addEventListener("click", () => {
      modalDisp.classList.remove("show");
      if (currentPrintData && currentPrintData.item) {
        if (currentPrintData.type === "masuk") {
          openUploadModalMasuk(currentPrintData.item.id);
        } else {
          openUploadModalKeluar(currentPrintData.item.id);
        }
      }
    });
  }

  // Surat Masuk Table Checkbox Listeners
  const tbodyMasuk = document.getElementById("tbodySuratMasuk");
  if (tbodyMasuk) {
    tbodyMasuk.addEventListener("change", (e) => {
      if (e.target && e.target.classList.contains("check-item-masuk")) {
        const id = e.target.dataset.id;
        if (e.target.checked) {
          state.selectedMasukIds.add(id);
        } else {
          state.selectedMasukIds.delete(id);
        }
        updateBatchMasukBar();
        updateCheckAllMasukState();
      }
    });
  }

  const checkAllMasuk = document.getElementById("checkAllMasuk");
  if (checkAllMasuk) {
    checkAllMasuk.addEventListener("change", (e) => {
      const currentSlice = getCurrentMasukSlice();
      if (e.target.checked) {
        currentSlice.forEach(item => state.selectedMasukIds.add(item.id));
      } else {
        currentSlice.forEach(item => state.selectedMasukIds.delete(item.id));
      }
      renderSuratMasukTable();
    });
  }

  const btnSelectAllCurrentPageMasuk = document.getElementById("btnSelectAllCurrentPageMasuk");
  if (btnSelectAllCurrentPageMasuk) {
    btnSelectAllCurrentPageMasuk.addEventListener("click", () => {
      const slice = getCurrentMasukSlice();
      slice.forEach(item => state.selectedMasukIds.add(item.id));
      renderSuratMasukTable();
      updateBatchMasukBar();
      showToast(`Dipilih ${slice.length} surat masuk di halaman ini`, "info");
    });
  }

  const btnSelectAllHasFileMasuk = document.getElementById("btnSelectAllHasFileMasuk");
  if (btnSelectAllHasFileMasuk) {
    btnSelectAllHasFileMasuk.addEventListener("click", () => {
      const hasFiles = state.filteredMasuk.filter(m => hasDriveFileAttached(m));
      hasFiles.forEach(item => state.selectedMasukIds.add(item.id));
      renderSuratMasukTable();
      updateBatchMasukBar();
      showToast(`Dipilih ${hasFiles.length} surat masuk yang memiliki berkas lampiran`, "info");
    });
  }

  const btnClearBatchMasuk = document.getElementById("btnClearBatchMasuk");
  if (btnClearBatchMasuk) {
    btnClearBatchMasuk.addEventListener("click", () => {
      state.selectedMasukIds.clear();
      renderSuratMasukTable();
      updateBatchMasukBar();
      showToast("Pilihan ceklis surat masuk dibatalkan.", "info");
    });
  }

  // Batch Print Trigger Listeners
  const btnOpenBatchPrintKeluarModal = document.getElementById("btnOpenBatchPrintKeluarModal");
  if (btnOpenBatchPrintKeluarModal) {
    btnOpenBatchPrintKeluarModal.addEventListener("click", () => openBatchPrintModal("keluar"));
  }
  const btnHeaderBatchPrintKeluar = document.getElementById("btnHeaderBatchPrintKeluar");
  if (btnHeaderBatchPrintKeluar) {
    btnHeaderBatchPrintKeluar.addEventListener("click", () => openBatchPrintModal("keluar"));
  }

  const btnOpenBatchPrintMasukModal = document.getElementById("btnOpenBatchPrintMasukModal");
  if (btnOpenBatchPrintMasukModal) {
    btnOpenBatchPrintMasukModal.addEventListener("click", () => openBatchPrintModal("masuk"));
  }
  const btnHeaderBatchPrintMasuk = document.getElementById("btnHeaderBatchPrintMasuk");
  if (btnHeaderBatchPrintMasuk) {
    btnHeaderBatchPrintMasuk.addEventListener("click", () => openBatchPrintModal("masuk"));
  }

  // Modal Batch Print Controls
  const modalBatchPrint = document.getElementById("modalBatchPrint");
  const btnCloseBatchPrintModal = document.getElementById("btnCloseBatchPrintModal");
  const btnCloseBatchPrintFooter = document.getElementById("btnCloseBatchPrintFooter");
  if (btnCloseBatchPrintModal && modalBatchPrint) {
    btnCloseBatchPrintModal.addEventListener("click", () => modalBatchPrint.classList.remove("show"));
  }
  if (btnCloseBatchPrintFooter && modalBatchPrint) {
    btnCloseBatchPrintFooter.addEventListener("click", () => modalBatchPrint.classList.remove("show"));
  }

  const optBatchDisposisi = document.getElementById("optBatchDisposisi");
  const optBatchBerkas = document.getElementById("optBatchBerkas");
  if (optBatchDisposisi) {
    optBatchDisposisi.addEventListener("change", () => setBatchPrintMode("disposisi"));
  }
  if (optBatchBerkas) {
    optBatchBerkas.addEventListener("change", () => setBatchPrintMode("berkas"));
  }

  const btnBatchPrintSelectAllPage = document.getElementById("btnBatchPrintSelectAllPage");
  if (btnBatchPrintSelectAllPage) {
    btnBatchPrintSelectAllPage.addEventListener("click", () => {
      const isMasuk = (state.batchPrintType === "masuk");
      const slice = isMasuk ? getCurrentMasukSlice() : getCurrentKeluarSlice();
      slice.forEach(item => {
        if (!state.batchPrintItems.some(x => x.id === item.id)) {
          state.batchPrintItems.push(item);
        }
        if (isMasuk) state.selectedMasukIds.add(item.id);
        else state.selectedKeluarIds.add(item.id);
      });
      if (isMasuk) { renderSuratMasukTable(); updateBatchMasukBar(); }
      else { renderSuratKeluarTable(); updateBatchKeluarBar(); }
      renderBatchPrintItemsTable();
    });
  }

  const btnBatchPrintFilterOnlyFiles = document.getElementById("btnBatchPrintFilterOnlyFiles");
  if (btnBatchPrintFilterOnlyFiles) {
    btnBatchPrintFilterOnlyFiles.addEventListener("click", () => {
      state.batchPrintItems = state.batchPrintItems.filter(item => hasDriveFileAttached(item));
      renderBatchPrintItemsTable();
    });
  }

  const btnBatchPrintClearAll = document.getElementById("btnBatchPrintClearAll");
  if (btnBatchPrintClearAll) {
    btnBatchPrintClearAll.addEventListener("click", () => {
      state.batchPrintItems = [];
      renderBatchPrintItemsTable();
    });
  }

  const btnExecuteBatchPrintDisposisi = document.getElementById("btnExecuteBatchPrintDisposisi");
  if (btnExecuteBatchPrintDisposisi) {
    btnExecuteBatchPrintDisposisi.addEventListener("click", executeBatchPrintDisposisi);
  }

  const btnExecuteBatchPrintFiles = document.getElementById("btnExecuteBatchPrintFiles");
  if (btnExecuteBatchPrintFiles) {
    btnExecuteBatchPrintFiles.addEventListener("click", executeBatchPrintFiles);
  }
}

/**
 * Inisialisasi Kategori dan Template Chips
 */
function initTemplateChips() {
  const container = document.getElementById("templateChipsGrid");
  const filterCount = document.getElementById("tplFilteredCount");
  const pills = document.querySelectorAll(".category-pill");

  function renderChips(catFilter = "all") {
    if (!container) return;
    const filtered = catFilter === "all"
      ? REAL_DRIVE_TEMPLATES
      : REAL_DRIVE_TEMPLATES.filter(t => t.cat === catFilter);

    if (filterCount) {
      filterCount.textContent = `Menampilkan ${filtered.length} template (${catFilter === "all" ? "Semua Kode" : "Kode " + catFilter})`;
    }

    let html = "";
    filtered.forEach((t, index) => {
      html += `
        <button type="button" class="template-chip ${index === 0 && catFilter === "all" ? "active" : ""}" data-id="${t.id}">
          <span class="chip-code">${t.kode}</span>
          <span>${t.nama}</span>
        </button>
      `;
    });
    container.innerHTML = html;

    // Attach click events
    container.querySelectorAll(".template-chip").forEach(btn => {
      btn.addEventListener("click", () => {
        container.querySelectorAll(".template-chip").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const tplId = btn.getAttribute("data-id");
        const tplObj = REAL_DRIVE_TEMPLATES.find(x => x.id === tplId);
        if (tplObj) applyTemplateObject(tplObj);
      });
    });
  }

  pills.forEach(pill => {
    pill.addEventListener("click", () => {
      pills.forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      const cat = pill.getAttribute("data-cat");
      state.selectedCategory = cat;
      renderChips(cat);
    });
  });

  renderChips("all");
}

function applyTemplateObject(tpl) {
  const selKode = document.getElementById("genKodeKlasifikasi");
  const txtPerihal = document.getElementById("genPerihal");
  const txtKepada = document.getElementById("genKepada");
  const txtPetugas = document.getElementById("genPetugas");
  const txtDari = document.getElementById("genDari");
  const txtKet = document.getElementById("genKeterangan");
  const customGroup = document.getElementById("customKodeGroup");

  if (selKode) {
    selKode.value = tpl.kode;
    if (customGroup) customGroup.style.display = "none";
  }
  if (txtPerihal) txtPerihal.value = tpl.perihal;
  if (txtKepada) txtKepada.value = tpl.kepada;
  if (txtPetugas) txtPetugas.value = tpl.petugas;
  if (txtDari) txtDari.value = tpl.dari;
  if (txtKet) txtKet.value = tpl.keterangan;

  updateGeneratedPreview();
  showToast(`Template "${tpl.nama}" berhasil diterapkan!`, "info");
}

/**
 * Handle File Upload Drag-and-Drop & File Selection
 */
function initFileUploadHandlers() {
  // Surat Keluar Upload
  const fileInputKeluar = document.getElementById("genUploadDriveFile");
  const dropzoneKeluar = document.getElementById("keluarDropzone");
  const contentKeluar = document.getElementById("dropzoneContentKeluar");
  const previewKeluar = document.getElementById("filePreviewKeluar");
  const chipNameKeluar = document.getElementById("fileChipNameKeluar");
  const chipSizeKeluar = document.getElementById("fileChipSizeKeluar");
  const btnRemoveKeluar = document.getElementById("btnRemoveFileKeluar");

  if (fileInputKeluar) {
    fileInputKeluar.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) handleFileStagedKeluar(file);
    });
  }

  if (btnRemoveKeluar) {
    btnRemoveKeluar.addEventListener("click", (e) => {
      e.stopPropagation();
      state.stagedFileKeluar = null;
      if (fileInputKeluar) fileInputKeluar.value = "";
      if (contentKeluar) contentKeluar.style.display = "flex";
      if (previewKeluar) previewKeluar.style.display = "none";
    });
  }

  function handleFileStagedKeluar(file) {
    state.stagedFileKeluar = file;
    if (chipNameKeluar) chipNameKeluar.textContent = file.name;
    if (chipSizeKeluar) chipSizeKeluar.textContent = `${(file.size / 1024).toFixed(1)} KB`;
    if (contentKeluar) contentKeluar.style.display = "none";
    if (previewKeluar) previewKeluar.style.display = "flex";
    showToast(`Berkas "${file.name}" siap di-upload ke Drive!`, "info");
  }

  // Surat Masuk Upload
  const fileInputMasuk = document.getElementById("inMasukUploadDrive");
  const contentMasuk = document.getElementById("dropzoneContentMasuk");
  const previewMasuk = document.getElementById("filePreviewMasuk");
  const chipNameMasuk = document.getElementById("fileChipNameMasuk");
  const chipSizeMasuk = document.getElementById("fileChipSizeMasuk");
  const btnRemoveMasuk = document.getElementById("btnRemoveFileMasuk");

  if (fileInputMasuk) {
    fileInputMasuk.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        state.stagedFileMasuk = file;
        if (chipNameMasuk) chipNameMasuk.textContent = file.name;
        if (chipSizeMasuk) chipSizeMasuk.textContent = `${(file.size / 1024).toFixed(1)} KB`;
        if (contentMasuk) contentMasuk.style.display = "none";
        if (previewMasuk) previewMasuk.style.display = "flex";
      }
    });
  }

  if (btnRemoveMasuk) {
    btnRemoveMasuk.addEventListener("click", (e) => {
      e.stopPropagation();
      state.stagedFileMasuk = null;
      if (fileInputMasuk) fileInputMasuk.value = "";
      if (contentMasuk) contentMasuk.style.display = "flex";
      if (previewMasuk) previewMasuk.style.display = "none";
    });
  }
}

/**
 * Baca Berkas sebagai Base64
 */
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64Str = reader.result.split(",")[1];
      resolve(base64Str);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Sisipkan watermark teks kecil di pojok kanan atas setiap halaman PDF (Surat Masuk).
 * Watermark berisi: No. Urut dan Tanggal Surat.
 * Menggunakan library pdf-lib (window.PDFLib).
 * Jika file bukan PDF atau pdf-lib tidak tersedia, kembalikan file asli tanpa modifikasi.
 *
 * @param {File} file        - File PDF asli
 * @param {string} noUrut    - Nomor urut / agenda surat masuk (misal "269")
 * @param {string} tglSurat  - Tanggal surat (misal "19/11/2026")
 * @returns {Promise<File>}  - File PDF baru dengan watermark (atau file asli jika bukan PDF/pdf-lib tidak ada)
 */
async function addWatermarkToPdfFile(file, noUrut, tglSurat) {
  // Hanya proses PDF; format lain (JPG, PNG, Word) dikembalikan apa adanya
  if (!file || !file.type.includes("pdf")) return file;

  // Jika pdf-lib belum tersedia (belum dimuat CDN / offline), fallback ke file asli
  if (typeof window === "undefined" || !window.PDFLib) {
    console.warn("[Watermark] pdf-lib belum dimuat, upload tanpa watermark.");
    return file;
  }

  try {
    const { PDFDocument, rgb, StandardFonts } = window.PDFLib;

    // Baca file sebagai ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const pages = pdfDoc.getPages();
    const stampText1 = `No. ${noUrut || "-"}`;
    const formattedTgl = (tglSurat && tglSurat !== "-") ? formatDateIndo(tglSurat) : "-";
    const stampText2 = formattedTgl;
    const stampLabel = "ARSIP FISIK";

    for (const page of pages) {
      const { width, height } = page.getSize();

      // ---- Parameter tampilan ----
      const fontSize1 = 9;    // ukuran No. urut
      const fontSize2 = 7.5;  // ukuran tanggal
      const fontSizeLabel = 6; // ukuran label "ARSIP FISIK"
      const pad = 6;           // padding dalam kotak
      const boxW = 82;         // lebar kotak watermark
      const boxH = 38;         // tinggi kotak watermark
      const marginRight = 14;
      const marginTop = 14;    // jarak dari atas

      const boxX = width - boxW - marginRight;
      const boxY = height - marginTop - boxH;

      // Warna merah marun
      const red = rgb(0.73, 0.11, 0.11);
      const redLight = rgb(1, 0.96, 0.96);

      // Latar merah muda pucat
      page.drawRectangle({
        x: boxX,
        y: boxY,
        width: boxW,
        height: boxH,
        color: redLight,
        opacity: 0.85,
      });

      // Border merah
      page.drawRectangle({
        x: boxX,
        y: boxY,
        width: boxW,
        height: boxH,
        borderColor: red,
        borderWidth: 1.2,
        opacity: 1,
      });

      // Label kecil "ARSIP FISIK" di paling atas kotak
      page.drawText(stampLabel, {
        x: boxX + pad,
        y: boxY + boxH - fontSizeLabel - pad + 1,
        size: fontSizeLabel,
        font,
        color: rgb(0.73, 0.11, 0.11),
        opacity: 0.72,
      });

      // Teks No. urut (lebih besar, tebal)
      page.drawText(stampText1, {
        x: boxX + pad,
        y: boxY + boxH - fontSizeLabel - fontSize1 - pad - 2,
        size: fontSize1,
        font,
        color: red,
        opacity: 1,
      });

      // Teks tanggal
      page.drawText(stampText2, {
        x: boxX + pad,
        y: boxY + pad + 1,
        size: fontSize2,
        font,
        color: rgb(0.5, 0.07, 0.07),
        opacity: 0.9,
      });
    }

    // Simpan sebagai Uint8Array lalu bungkus ke File baru
    const pdfBytes = await pdfDoc.save();
    const watermarkedBlob = new Blob([pdfBytes], { type: "application/pdf" });
    const watermarkedFile = new File([watermarkedBlob], file.name, {
      type: "application/pdf",
      lastModified: file.lastModified,
    });

    return watermarkedFile;
  } catch (err) {
    // Jika PDF terenkripsi ketat atau parsing gagal, fallback ke file asli
    console.warn("[Watermark] Gagal menyisipkan watermark ke PDF:", err.message || err);
    return file;
  }
}

/**
 * Tampilkan skrip Google Apps Script v2 di Tab Koneksi
 */
function initAppsScriptInstructions() {
  const codeArea = document.getElementById("appsScriptCodeArea");
  const inputUrl = document.getElementById("inputAppsScriptUrl");
  const inputKeluar = document.getElementById("inputDriveKeluarUrl");
  const inputMasuk = document.getElementById("inputDriveMasukUrl");

  if (inputUrl && state.appsScriptUrl) {
    inputUrl.value = state.appsScriptUrl;
  }
  if (inputKeluar && state.driveKeluarUrl) {
    inputKeluar.value = state.driveKeluarUrl;
  }
  if (inputMasuk && state.driveMasukUrl) {
    inputMasuk.value = state.driveMasukUrl;
  }

  const inputWaPhone = document.getElementById("inputWaPhone");
  const inputWaPetugas = document.getElementById("inputWaPetugas");
  if (inputWaPhone) {
    inputWaPhone.value = state.waPhone || localStorage.getItem("settings_wa_phone") || DEFAULT_WA_PHONE;
  }
  if (inputWaPetugas) {
    inputWaPetugas.value = state.waPetugas || localStorage.getItem("settings_wa_petugas") || DEFAULT_WA_PETUGAS;
  }

  const scriptCode = `/**
 * ===================================================================
 * GOOGLE APPS SCRIPT - SISTEM AGENDA SURAT SMA YWKA BANDUNG
 * VERSI 2.7 (PENEMPATAN PRESISI SURAT MASUK NO 215, 216+, DROPDOWN RESMI PENGIRIM, DAN PEMBERSIHAN BARIS BAWAH)
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
      const rows = type === "masuk" ? rawValues.slice(1) : rawValues.slice(3); // Surat Masuk data dari baris 2 (indeks 1), Surat Keluar dari baris 4 (indeks 3)

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

      const fullGenerated = \`\${kodePrefix}\${noAgendaStr}/SMA YWKA/TU/\${bulanRomawi}\${tahunSuffix}\`.replace(/\/{2,}/g, "/");

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

        const fullGenerated = \`\${kodePrefix}\${newAgendaStr}/SMA YWKA/TU/\${bulanRomawi}\${tahunSuffix}\`.replace(/\/{2,}/g, "/");

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
        SpreadsheetApp.flush();
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

      // 1. Bersihkan baris salah yang ter-append di bawah template (misal baris 303 ke atas yang kosong konten suratnya)
      const curLastRow = sheet.getLastRow();
      if (curLastRow > 302) {
        for (let r = curLastRow; r > 302; r--) {
          const checkColB = String(sheet.getRange(r, 2).getValue()).trim();
          const checkColE = String(sheet.getRange(r, 5).getValue()).trim();
          // Jika baris di bawah 302 kosong nomor agenda dan perihalnya (akibat salah append sebelumnya)
          if (!checkColB && !checkColE) {
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

      // Ambil seluruh data dari baris 2 (karena baris 1 adalah header BUKU AGENDA SURAT MASUK NO. URUT)
      const endRowScan = Math.max(sheet.getLastRow(), 302);
      const totalScan = Math.max(endRowScan - 1, 1);
      const rangeData = sheet.getRange(2, 1, totalScan, 5).getValues(); // Baris 2 adalah index 0

      // 1.A. Cari baris template berdasarkan Nomor Urut yang diminta (misal No. Urut 270 -> cari baris dengan Col A = 270)
      if (reqNoUrut) {
        for (let i = 0; i < rangeData.length; i++) {
          const rowUrut = String(rangeData[i][0]).trim();
          if (rowUrut === reqNoUrut) {
            targetRowIndex = i + 2;
            finalNoUrut = rowUrut;
            break;
          }
        }
      }

      // 1.B. Cegah duplikasi tidak sengaja: jika perihal & nomor agenda persis sama
      if (targetRowIndex < 0 && reqNoAgenda && reqNoAgenda !== "-" && reqPerihal) {
        for (let i = 0; i < rangeData.length; i++) {
          const rowUrut = String(rangeData[i][0]).trim();
          const rowAgenda = String(rangeData[i][1]).trim();
          const rowPerihal = String(rangeData[i][4]).trim();
          if (rowAgenda && rowAgenda.toLowerCase() === reqNoAgenda.toLowerCase() && rowPerihal && rowPerihal.toLowerCase() === reqPerihal.toLowerCase()) {
            targetRowIndex = i + 2;
            finalNoUrut = rowUrut || finalNoUrut;
            break;
          }
        }
      }

      // 1.C. Jika belum ditemukan baris dengan No Urut tersebut, cari BARIS KOSONG PERTAMA di dalam template
      // (baris pertama di mana Col B dan Col E belum ada isinya)
      if (targetRowIndex < 0) {
        for (let i = 0; i < rangeData.length; i++) {
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

      // 1.D. Fallback jika template 300 baris sudah terisi penuh:
      // Taruh di baris tepat di bawah baris surat terakhir yang terisi (BUKAN appendRow di paling bawah!)
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
        targetRowIndex = lastFilledRow + 1;
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
      // Pastikan format tanggal plain text (@) agar Google Sheets tidak mengubah slash (/) ke strip (-)
      sheet.getRange(targetRowIndex, 3).setNumberFormat("@").setValue(tglSuratMasuk);
      sheet.getRange(targetRowIndex, 4).setNumberFormat("@").setValue(tglDiterimaMasuk);
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

      const scanLimit = Math.max(sheet.getLastRow(), 310);
      let foundRow = -1;
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
        sheet.getRange(foundRow, 3).setNumberFormat("@").setValue(tglSuratMasuk);
        sheet.getRange(foundRow, 4).setNumberFormat("@").setValue(tglDiterimaMasuk);

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
      const rowIndex = payload.row_index ? parseInt(payload.row_index, 10) : -1;

      if (!payload.fileBase64 || !payload.fileName) {
        return createJsonResponse({ status: "error", message: "Berkas upload tidak ditemukan!" });
      }

      const lastRow = Math.max(sheet.getLastRow(), 302);
      let foundRow = -1;
      let existingLampiran = "";

      // 1. Validasi baris target berdasarkan row_index jika diberikan
      if (!isNaN(rowIndex) && rowIndex >= 2 && rowIndex <= lastRow) {
        const rowUrut = String(sheet.getRange(rowIndex, 1).getValue()).trim();
        const rowAgenda = String(sheet.getRange(rowIndex, 2).getValue()).trim();
        if ((noUrutStr && rowUrut === noUrutStr) || (noAgendaStr && noAgendaStr !== "-" && rowAgenda === noAgendaStr)) {
          foundRow = rowIndex;
          existingLampiran = String(sheet.getRange(foundRow, 10).getValue()).trim();
        }
      }

      // 2. Jika belum ditemukan, scan berdasarkan nomor urut (Kolom A) dan no agenda (Kolom B)
      if (foundRow === -1 && lastRow >= 2) {
        const totalScan = lastRow - 1;
        const urutColValues = sheet.getRange(2, 1, totalScan, 1).getValues();
        const agendaColValues = sheet.getRange(2, 2, totalScan, 1).getValues();

        // Utamakan pencarian berdasarkan no_urut terlebih dahulu jika ada
        if (noUrutStr) {
          for (let i = 0; i < totalScan; i++) {
            if (String(urutColValues[i][0]).trim() === noUrutStr) {
              foundRow = i + 2;
              existingLampiran = String(sheet.getRange(foundRow, 10).getValue()).trim();
              break;
            }
          }
        }

        // Jika belum cocok dan ada no_agenda valid (bukan "-" atau kosong)
        if (foundRow === -1 && noAgendaStr && noAgendaStr !== "-") {
          for (let i = 0; i < totalScan; i++) {
            if (String(agendaColValues[i][0]).trim() === noAgendaStr) {
              foundRow = i + 2;
              existingLampiran = String(sheet.getRange(foundRow, 10).getValue()).trim();
              break;
            }
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
        noUrutStr ? ("No " + noUrutStr + (noAgendaStr && noAgendaStr !== "-" ? " - " + noAgendaStr : "")) : noAgendaStr
      );

      if (!driveUrl) {
        return createJsonResponse({ status: "error", message: "Gagal mengunggah berkas ke Google Drive!" });
      }

      if (foundRow > 0) {
        sheet.getRange(foundRow, 10).setValue(driveUrl);
        SpreadsheetApp.flush();
      }

      return createJsonResponse({
        status: "success",
        message: "Berkas berhasil diupload ke Google Drive Surat Masuk & tautan disimpan ke Spreadsheet!",
        drive_file_url: driveUrl,
        no_agenda: noAgendaStr,
        no_urut: noUrutStr,
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
          .map(function(n) { return parseInt(n, 10); })
          .filter(function(n) { return !isNaN(n) && n >= 2 && n <= sheet.getLastRow(); })
          .sort(function(a, b) { return b - a; });

        for (var d = 0; d < sortedIndices.length; d++) {
          try {
            sheet.deleteRow(sortedIndices[d]);
            deletedRows.push(sortedIndices[d]);
          } catch (e) {}
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
        rowsToDelete.sort(function(a, b) { return b - a; });
        for (var r = 0; r < rowsToDelete.length; r++) {
          try {
            sheet.deleteRow(rowsToDelete[r]);
            removedCount++;
          } catch (e) {}
        }

        // Hapus juga baris apapun di bawah 302 yang salah ter-append ke paling bawah (agenda dan perihal kosong)
        if (sheet.getLastRow() > 302) {
          for (var ex = sheet.getLastRow(); ex > 302; ex--) {
            const bVal = String(sheet.getRange(ex, 2).getValue()).trim();
            const eVal = String(sheet.getRange(ex, 5).getValue()).trim();
            if (!bVal && !eVal) {
              try {
                sheet.deleteRow(ex);
                removedCount++;
              } catch (e) {}
            }
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

`;

  if (codeArea) {
    codeArea.value = scriptCode;
    // Muat langsung dari google-apps-script.js tanpa cache agar selalu sinkron dengan versi terbaru v3.9
    fetch("google-apps-script.js?t=" + Date.now(), { cache: "no-store" })
      .then(res => res.text())
      .then(latestCode => {
        if (latestCode && latestCode.includes("VERSI 3.")) {
          codeArea.value = latestCode;
        }
      })
      .catch(() => { });
  }

  const btnCopyScript = document.getElementById("btnCopyScriptCode");
  if (btnCopyScript) {
    btnCopyScript.addEventListener("click", async () => {
      let codeToCopy = (codeArea && codeArea.value) ? codeArea.value : scriptCode;
      if (!codeToCopy.includes("VERSI 3.9")) {
        try {
          const freshRes = await fetch("google-apps-script.js?t=" + Date.now(), { cache: "no-store" });
          const freshCode = await freshRes.text();
          if (freshCode && freshCode.includes("VERSI 3.")) {
            codeToCopy = freshCode;
            if (codeArea) codeArea.value = freshCode;
          }
        } catch (e) { }
      }
      if (!codeToCopy.includes("VERSI 3.")) {
        showToast("⚠️ Gagal memuat kode v3.9 terbaru (mode offline/file lokal). Silakan salin langsung dari file google-apps-script.js di folder proyek!", "warning");
        return;
      }
      try {
        await navigator.clipboard.writeText(codeToCopy);
      } catch (clipErr) {
        if (codeArea) {
          codeArea.select();
          document.execCommand("copy");
        }
      }
      showToast("✅ Kode Google Apps Script v3.9 berhasil disalin! Jangan lupa Deploy > Kelola deployment > Versi baru.", "success");
    });
  }
}

/**
 * Tampilkan / sembunyikan banner peringatan jika Google Apps Script di Google Cloud masih versi lama (< v3.8)
 */
function renderAppsScriptOutdatedBanner(isOutdated, detectedVersionLabel = "Lama (v2.7)") {
  const existingBanners = document.querySelectorAll(".gas-outdated-alert-banner");
  if (!isOutdated) {
    existingBanners.forEach(el => el.remove());
    return;
  }

  const buildBannerEl = (idSuffix) => {
    const div = document.createElement("div");
    div.id = `appsScriptOutdatedBanner_${idSuffix}`;
    div.className = "connection-banner warning-banner gas-outdated-alert-banner";
    div.style.cssText = "display:flex; background:#fef2f2; border:1px solid #fca5a5; color:#991b1b; margin-bottom:16px; border-radius:12px; padding:14px 18px; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;";
    div.innerHTML = `
      <div class="banner-content" style="display:flex; align-items:flex-start; gap:12px; flex:1; min-width:240px;">
        <i class="fa-solid fa-triangle-exclamation" style="color:#dc2626; font-size:1.25rem; margin-top:2px;"></i>
        <div>
          <strong style="display:block; margin-bottom:2px;">Google Apps Script Masih Versi ${detectedVersionLabel} (Penyebab Baris Masih Loncat ke Bawah!)</strong>
          <span style="font-size:0.86rem; color:#7f1d1d; line-height:1.45; display:block;">
            Website sudah di-update ke v3.9, namun Web App Google Apps Script di akun Google Anda belum di-deploy ulang dengan kode v3.9.
            Buka <strong>Pengaturan Koneksi &rarr; Salin Skrip v3.9</strong>, tempel &amp; Simpan di Apps Script Google Sheets, lalu WAJIB klik
            <strong>Deploy &rarr; Kelola deployment &rarr; Edit (pensil) &rarr; Versi baru &rarr; Deploy</strong>.
          </span>
        </div>
      </div>
      <button type="button" class="btn btn-sm" style="background:#dc2626; color:#fff; border:none; white-space:nowrap; font-weight:600; padding:8px 14px; border-radius:8px; cursor:pointer;" onclick="if (typeof switchTab === 'function') { switchTab('tab-koneksi'); } else { const b = document.querySelector('[data-tab=tab-koneksi]'); if (b) b.click(); } const btn = document.getElementById('btnCopyScriptCode'); if (btn) setTimeout(() => btn.scrollIntoView({behavior:'smooth', block:'center'}), 150);">
        <i class="fa-solid fa-wrench"></i> Update Skrip Sekarang
      </button>
    `;
    return div;
  };

  // Pasang di tab Surat Keluar (jika belum ada)
  const keluarPane = document.getElementById("tab-surat-keluar");
  if (keluarPane && !document.getElementById("appsScriptOutdatedBanner_keluar")) {
    keluarPane.prepend(buildBannerEl("keluar"));
  }

  // Pasang juga di tab Pengaturan Koneksi (jika belum ada)
  const koneksiPane = document.getElementById("tab-koneksi");
  if (koneksiPane && !document.getElementById("appsScriptOutdatedBanner_koneksi")) {
    koneksiPane.prepend(buildBannerEl("koneksi"));
  }
}

/**
 * Periksa versi live Web App Google Apps Script yang terhubung di Google Cloud
 */
async function checkAppsScriptVersionStatus(showFeedbackToast = false, overrideUrl = null) {
  let url = (overrideUrl !== null ? String(overrideUrl) : (typeof getCleanAppsScriptUrl === "function" ? getCleanAppsScriptUrl() : state.appsScriptUrl || "")).trim();
  if (url.endsWith("/dev")) {
    url = url.substring(0, url.length - 4) + "/exec";
  }
  if (!url) return { ok: false, outdated: false };

  try {
    const pingUrl = url + (url.includes("?") ? "&" : "?") + "action=ping&t=" + Date.now();
    const res = await fetch(pingUrl, { cache: "no-store" });
    const json = await res.json();
    const rawVer = json && (json.version || json.scriptVersion || "");
    const verNum = parseFloat(rawVer);
    const isModern = !isNaN(verNum) && verNum >= REQUIRED_APPS_SCRIPT_MINOR;

    state.appsScriptVersion = rawVer ? String(rawVer) : "Lama (v2.7)";
    state.appsScriptOutdated = !isModern;

    if (isModern) {
      renderAppsScriptOutdatedBanner(false);
      updateConnectionStatus(true, `Tersambung Google Sheets (Apps Script v${rawVer})`);
      if (showFeedbackToast) {
        showToast(`✅ Koneksi Apps Script v${rawVer} Aktif & Siap! (${json.message || "OK"})`, "success");
      }
      return { ok: true, outdated: false, version: String(rawVer), json };
    } else {
      renderAppsScriptOutdatedBanner(true, state.appsScriptVersion);
      updateConnectionStatus(true, "Apps Script Versi Lama (Perlu Update v3.9)");
      if (showFeedbackToast) {
        showToast("⚠️ Terhubung, TAPI Google Apps Script Anda masih VERSI LAMA! Wajib update skrip v3.9 lalu Deploy > Kelola deployment > Versi baru.", "warning");
      }
      return { ok: true, outdated: true, version: state.appsScriptVersion, json };
    }
  } catch (err) {
    if (showFeedbackToast) {
      showToast("⚠️ Uji koneksi terkirim, namun respons gagal dibaca. Pastikan Apps Script dideploy sebagai Web app akses 'Anyone'.", "info");
    }
    return { ok: false, outdated: false, error: err };
  }
}

/**
 * Event Listeners
 */
function initEventListeners() {
  const btnRefresh = document.getElementById("btnRefreshData");
  if (btnRefresh) {
    btnRefresh.addEventListener("click", () => { loadDataFromSpreadsheet(); syncAllPendingItems(); });
  }

  const genKode = document.getElementById("genKodeKlasifikasi");
  const genCustomKode = document.getElementById("genCustomKode");
  const genNoUrut = document.getElementById("genNomorUrut");
  const genTgl = document.getElementById("genTanggalSurat");
  const genPerihal = document.getElementById("genPerihal");
  const customKodeGroup = document.getElementById("customKodeGroup");

  if (genKode) {
    genKode.addEventListener("change", () => {
      if (genKode.value === "custom") {
        customKodeGroup.style.display = "block";
      } else {
        customKodeGroup.style.display = "none";
      }
      updateGeneratedPreview();
    });
  }

  if (genCustomKode) genCustomKode.addEventListener("input", updateGeneratedPreview);
  if (genNoUrut) genNoUrut.addEventListener("input", updateGeneratedPreview);
  if (genTgl) genTgl.addEventListener("change", updateGeneratedPreview);
  if (genPerihal) genPerihal.addEventListener("input", updateGeneratedPreview);

  // Auto Increment Button (Kembali ke Agenda Berikutnya yang Terdeteksi)
  const btnAutoInc = document.getElementById("btnAutoIncrement");
  if (btnAutoInc) {
    btnAutoInc.addEventListener("click", () => {
      if (genNoUrut) {
        genNoUrut.value = state.nextKeluarAgenda;
        updateGeneratedPreview();
        showToast(`No. Agenda disetel otomatis ke: ${state.nextKeluarAgenda}`, "info");
      }
    });
  }

  // Copy Generated Number
  const btnCopyNumber = document.getElementById("btnCopyGeneratedNumber");
  if (btnCopyNumber) {
    btnCopyNumber.addEventListener("click", () => {
      const previewText = document.getElementById("previewFullNumber")?.textContent || "";
      navigator.clipboard.writeText(previewText);
      showToast(`Nomor berhasil disalin: ${previewText}`, "success");
    });
  }

  // Disposisi Mini Button
  const btnPrintMini = document.getElementById("btnPrintDisposisiMini");
  if (btnPrintMini) {
    btnPrintMini.addEventListener("click", () => {
      const fullNumber = document.getElementById("previewFullNumber")?.textContent || "";
      const perihal = document.getElementById("genPerihal")?.value || "-";
      const kepada = document.getElementById("genKepada")?.value || "-";
      const tgl = document.getElementById("genTanggalSurat")?.value || "-";
      const petugas = document.getElementById("genPetugas")?.value || "-";
      const dari = document.getElementById("genDari")?.value || "Syarif Hasanudin, S.Pd., Gr., M.M.";

      openDisposisiModal({
        tipe: "Surat Keluar",
        noUrut: document.getElementById("genNomorUrut")?.value || state.nextKeluarAgenda,
        noLengkap: fullNumber,
        tanggal: tgl,
        perihal: perihal,
        kepada: kepada,
        dari: dari,
        petugas: petugas
      });
    });
  }

  // Form Generator Submit
  const formKeluar = document.getElementById("formGeneratorSurat");
  if (formKeluar) {
    formKeluar.addEventListener("submit", handleCreateSuratKeluar);
  }

  // Form Surat Masuk Submit
  const formMasuk = document.getElementById("formInputSuratMasuk");
  if (formMasuk) {
    formMasuk.addEventListener("submit", handleCreateSuratMasuk);
  }

  // Search & Filter Surat Keluar
  const searchKeluar = document.getElementById("searchKeluarInput");
  const filterKeluarKlas = document.getElementById("filterKeluarKlasifikasi");
  const filterKeluarBulan = document.getElementById("filterKeluarBulan");
  const btnClearSearchKeluar = document.getElementById("btnClearSearchKeluar");

  if (searchKeluar) {
    searchKeluar.addEventListener("input", () => {
      if (btnClearSearchKeluar) {
        btnClearSearchKeluar.style.display = searchKeluar.value ? "block" : "none";
      }
      filterSuratKeluarData();
    });
  }
  if (btnClearSearchKeluar && searchKeluar) {
    btnClearSearchKeluar.addEventListener("click", () => {
      searchKeluar.value = "";
      btnClearSearchKeluar.style.display = "none";
      filterSuratKeluarData();
    });
  }
  if (filterKeluarKlas) filterKeluarKlas.addEventListener("change", filterSuratKeluarData);
  if (filterKeluarBulan) filterKeluarBulan.addEventListener("change", filterSuratKeluarData);

  // Search & Filter Surat Masuk
  const searchMasuk = document.getElementById("searchMasukInput");
  const filterMasukPengirim = document.getElementById("filterMasukPengirim");
  const filterMasukBulan = document.getElementById("filterMasukBulan");
  const btnClearSearchMasuk = document.getElementById("btnClearSearchMasuk");

  if (searchMasuk) {
    searchMasuk.addEventListener("input", () => {
      if (btnClearSearchMasuk) {
        btnClearSearchMasuk.style.display = searchMasuk.value ? "block" : "none";
      }
      filterSuratMasukData();
    });
  }
  if (btnClearSearchMasuk && searchMasuk) {
    btnClearSearchMasuk.addEventListener("click", () => {
      searchMasuk.value = "";
      btnClearSearchMasuk.style.display = "none";
      filterSuratMasukData();
    });
  }
  if (filterMasukPengirim) filterMasukPengirim.addEventListener("change", filterSuratMasukData);
  if (filterMasukBulan) filterMasukBulan.addEventListener("change", filterSuratMasukData);

  // Export CSV
  const btnExportKeluar = document.getElementById("btnExportKeluarCsv");
  if (btnExportKeluar) {
    btnExportKeluar.addEventListener("click", () => exportToCsv(state.suratKeluar, "Agenda_Surat_Keluar_2026_SMA_YWKA.csv"));
  }
  const btnExportMasuk = document.getElementById("btnExportMasukCsv");
  if (btnExportMasuk) {
    btnExportMasuk.addEventListener("click", () => exportToCsv(state.suratMasuk, "Agenda_Surat_Masuk_2026_SMA_YWKA.csv"));
  }

  // Koneksi Settings
  const btnSaveConn = document.getElementById("btnSaveConnectionSettings");
  const inputAppsScript = document.getElementById("inputAppsScriptUrl");
  const inputDriveKeluar = document.getElementById("inputDriveKeluarUrl");
  const inputDriveMasuk = document.getElementById("inputDriveMasukUrl");

  if (btnSaveConn) {
    btnSaveConn.addEventListener("click", () => {
      if (inputAppsScript) {
        state.appsScriptUrl = inputAppsScript.value.trim();
        localStorage.setItem("sma_ywka_apps_script_url", state.appsScriptUrl);
      }
      if (inputDriveKeluar) {
        state.driveKeluarUrl = inputDriveKeluar.value.trim() || "https://drive.google.com/drive/folders/1e3YGwqV7cK0f7LVGyyxClgC7hTtVEL8A";
        localStorage.setItem("sma_ywka_drive_keluar_url", state.driveKeluarUrl);
      }
      if (inputDriveMasuk) {
        state.driveMasukUrl = inputDriveMasuk.value.trim() || "https://drive.google.com/drive/folders/1e3YGwqV7cK0f7LVGyyxClgC7hTtVEL8A";
        localStorage.setItem("sma_ywka_drive_masuk_url", state.driveMasukUrl);
      }

      const inputWaPhone = document.getElementById("inputWaPhone");
      const inputWaPetugas = document.getElementById("inputWaPetugas");
      if (inputWaPhone) {
        state.waPhone = inputWaPhone.value.trim() || DEFAULT_WA_PHONE;
        localStorage.setItem("settings_wa_phone", state.waPhone);
      }
      if (inputWaPetugas) {
        state.waPetugas = inputWaPetugas.value.trim() || DEFAULT_WA_PETUGAS;
        localStorage.setItem("settings_wa_petugas", state.waPetugas);
      }

      updateDriveLinksInUI();
      checkConnectionBanners();
      showToast("Pengaturan koneksi berhasil disimpan! Memeriksa versi Apps Script...", "success");
      updateConnectionStatus(true, "Tersambung Google Sheets & Drive");
      checkAppsScriptVersionStatus(true);
    });
  }

  const btnTestConn = document.getElementById("btnTestConnection");
  if (btnTestConn && inputAppsScript) {
    btnTestConn.addEventListener("click", async () => {
      const url = inputAppsScript.value.trim();
      if (!url) {
        showToast("Masukkan URL Web App terlebih dahulu!", "warning");
        return;
      }
      try {
        btnTestConn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menguji...`;
        await checkAppsScriptVersionStatus(true, url);
      } finally {
        btnTestConn.innerHTML = `<i class="fa-solid fa-plug-circle-check"></i> Uji Koneksi`;
      }
    });
  }

  const btnRelocateRows = document.getElementById("btnRelocateMisplacedRows");
  if (btnRelocateRows) {
    btnRelocateRows.addEventListener("click", async () => {
      btnRelocateRows.disabled = true;
      btnRelocateRows.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Merapikan...`;
      try {
        await relocateMisplacedSuratMasuk();
      } finally {
        btnRelocateRows.disabled = false;
        btnRelocateRows.innerHTML = `<i class="fa-solid fa-arrow-up-short-wide" style="color: #10b981;"></i> Rapikan Baris Surat Masuk`;
      }
    });
  }

  const btnCleanDuplicates = document.getElementById("btnCleanSpreadsheetDuplicates");
  if (btnCleanDuplicates) {
    btnCleanDuplicates.addEventListener("click", async () => {
      btnCleanDuplicates.disabled = true;
      btnCleanDuplicates.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Membersihkan...`;
      try {
        await cleanSpreadsheetDuplicates();
      } finally {
        btnCleanDuplicates.disabled = false;
        btnCleanDuplicates.innerHTML = `<i class="fa-solid fa-broom" style="color: #f59e0b;"></i> Bersihkan Baris Ganda`;
      }
    });
  }

  const btnCleanDrive = document.getElementById("btnCleanDriveDuplicates");
  if (btnCleanDrive) {
    btnCleanDrive.addEventListener("click", async () => {
      if (!state.appsScriptUrl) {
        showToast("URL Google Apps Script belum disetel! Harap simpan URL Web App di tab Pengaturan.", "warning");
        return;
      }
      const confirmRun = confirm("Apakah Anda ingin memindai dan membersihkan seluruh file duplikat di Google Drive Surat Keluar & Masuk?\n\nSistem akan mempertahankan 1 file versi terbaru dan memindahkan file lama ke Sampah.");
      if (!confirmRun) return;

      btnCleanDrive.disabled = true;
      btnCleanDrive.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Membersihkan Drive...`;
      try {
        const res = await fetch(state.appsScriptUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({ action: "clean_drive_duplicates" })
        });
        const resJson = await res.json();
        if (resJson && resJson.status === "success") {
          showToast(`✅ ${resJson.message}`, "success");
          alert(`✅ Pembersihan Berkas Google Drive Selesai!\n\n${resJson.message}`);
        } else {
          showToast(`Gagal membersihkan Drive: ${resJson?.message || "Terjadi kesalahan"}`, "danger");
        }
      } catch (err) {
        console.error("Gagal membersihkan duplikat drive:", err);
        showToast("Terjadi kendala saat menghubungi Google Apps Script: " + err.message, "danger");
      } finally {
        btnCleanDrive.disabled = false;
        btnCleanDrive.innerHTML = `<i class="fa-brands fa-google-drive" style="color: #3b82f6;"></i> Bersihkan Duplikat Drive`;
      }
    });
  }

  // Listener Tombol Sinkron Berkas Google Drive ke Spreadsheet
  const btnSyncDriveAll = document.getElementById("btnSyncDriveAll");
  if (btnSyncDriveAll) {
    btnSyncDriveAll.addEventListener("click", () => handleSyncDriveToSpreadsheet(btnSyncDriveAll));
  }

  const btnSyncDriveKeluar = document.getElementById("btnSyncDriveKeluar");
  if (btnSyncDriveKeluar) {
    btnSyncDriveKeluar.addEventListener("click", () => handleSyncDriveToSpreadsheet(btnSyncDriveKeluar));
  }

  const btnSyncDriveMasuk = document.getElementById("btnSyncDriveMasuk");
  if (btnSyncDriveMasuk) {
    btnSyncDriveMasuk.addEventListener("click", () => handleSyncDriveToSpreadsheet(btnSyncDriveMasuk));
  }

  const btnRapikanKeluar = document.getElementById("btnRapikanAgendaKeluar");
  if (btnRapikanKeluar) {
    btnRapikanKeluar.addEventListener("click", async () => {
      if (!state.appsScriptUrl) {
        showToast("URL Google Apps Script belum disetel! Harap simpan URL Web App di tab Pengaturan.", "warning");
        return;
      }
      const confirmRun = confirm("Apakah Anda ingin merapikan posisi & urutan No. Agenda Surat Keluar di Spreadsheet?\n\nSistem akan memindahkan surat yang tersimpan melompat ke baris bawah (seperti No. Agenda 691 ke slot yang tepat setelah 690) dan menghapus baris nyasar di bawah.");
      if (!confirmRun) return;

      btnRapikanKeluar.disabled = true;
      btnRapikanKeluar.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Merapikan...`;
      try {
        const res = await fetch(state.appsScriptUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({ action: "rapikan_agenda_keluar" })
        });
        const resJson = await res.json();
        if (resJson && resJson.status === "success") {
          showToast(`✅ ${resJson.message}`, "success");
          alert(`✅ Pemulihan Urutan Selesai!\n\n${resJson.message}`);
          loadDataFromSpreadsheet().catch(() => { });
        } else {
          showToast(`Gagal merapikan: ${resJson?.message || "Terjadi kesalahan"}`, "danger");
        }
      } catch (err) {
        console.error("Gagal merapikan agenda keluar:", err);
        showToast("Terjadi kendala saat menghubungi Google Apps Script: " + err.message, "danger");
      } finally {
        btnRapikanKeluar.disabled = false;
        btnRapikanKeluar.innerHTML = `<i class="fa-solid fa-arrow-down-1-9" style="color: #6366f1;"></i> Rapikan No. Agenda Keluar`;
      }
    });
  }

  // Modal Prompt Apps Script Handlers
  const modalPrompt = document.getElementById("modalAppsScriptPrompt");
  const btnClosePrompt = document.getElementById("btnCloseModalPrompt");
  const btnPromptLocal = document.getElementById("btnSavePromptLocalOnly");
  const btnPromptSync = document.getElementById("btnSavePromptAndSync");
  const promptInput = document.getElementById("promptAppsScriptUrlInput");

  if (btnClosePrompt && modalPrompt) {
    btnClosePrompt.addEventListener("click", () => modalPrompt.classList.remove("show"));
  }

  if (btnPromptLocal && modalPrompt) {
    btnPromptLocal.addEventListener("click", () => {
      modalPrompt.classList.remove("show");
      if (state.pendingKeluarData) {
        const { payload, newItem, origBtnContent } = state.pendingKeluarData;
        executeSaveSuratKeluar(payload, newItem, origBtnContent);
        state.pendingKeluarData = null;
      }
      if (state.pendingMasukData) {
        if (state.pendingMasukData.type === "create") {
          executeSaveSuratMasuk(state.pendingMasukData.payload, state.pendingMasukData.newItem, state.pendingMasukData.origBtnContent);
        } else if (state.pendingMasukData.type === "edit") {
          executeEditSuratMasuk(state.pendingMasukData.payload, state.pendingMasukData.itemIndex, state.pendingMasukData.origBtnHtml);
        }
        state.pendingMasukData = null;
      }
    });
  }

  if (btnPromptSync && modalPrompt && promptInput) {
    btnPromptSync.addEventListener("click", () => {
      const url = promptInput.value.trim();
      if (!url) {
        showToast("Harap masukkan URL Web App Google Apps Script Anda!", "warning");
        return;
      }
      state.appsScriptUrl = url;
      localStorage.setItem("sma_ywka_apps_script_url", url);
      if (inputAppsScript) inputAppsScript.value = url;
      updateConnectionStatus(true, "Tersambung Google Sheets & Drive");
      checkConnectionBanners();
      modalPrompt.classList.remove("show");

      if (state.pendingKeluarData) {
        const { payload, newItem, origBtnContent } = state.pendingKeluarData;
        executeSaveSuratKeluar(payload, newItem, origBtnContent);
        state.pendingKeluarData = null;
      }
      if (state.pendingMasukData) {
        if (state.pendingMasukData.type === "create") {
          executeSaveSuratMasuk(state.pendingMasukData.payload, state.pendingMasukData.newItem, state.pendingMasukData.origBtnContent);
        } else if (state.pendingMasukData.type === "edit") {
          executeEditSuratMasuk(state.pendingMasukData.payload, state.pendingMasukData.itemIndex, state.pendingMasukData.origBtnHtml);
        }
        state.pendingMasukData = null;
      }
    });
  }

  const linkGoToKoneksi = document.getElementById("linkGoToKoneksi");
  if (linkGoToKoneksi) {
    linkGoToKoneksi.addEventListener("click", () => {
      const tabKoneksiBtn = document.querySelector('[data-tab="tab-koneksi"]');
      if (tabKoneksiBtn) tabKoneksiBtn.click();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // Modal Upload Drive Row Listeners
  const modalUploadRow = document.getElementById("modalUploadRowDrive");
  const btnCloseUploadRow = document.getElementById("btnCloseUploadRowDrive");
  const btnCancelUploadRow = document.getElementById("btnCancelUploadRowDrive");
  const formUploadRow = document.getElementById("formUploadRowDrive");

  if (btnCloseUploadRow && modalUploadRow) {
    btnCloseUploadRow.addEventListener("click", () => modalUploadRow.classList.remove("show"));
  }
  if (btnCancelUploadRow && modalUploadRow) {
    btnCancelUploadRow.addEventListener("click", () => modalUploadRow.classList.remove("show"));
  }
  if (formUploadRow) {
    formUploadRow.addEventListener("submit", handleExecuteUploadRowDrive);
  }
  const btnDeleteExisting = document.getElementById("btnDeleteExistingDriveFile");
  if (btnDeleteExisting) {
    btnDeleteExisting.addEventListener("click", handleDeleteExistingDriveFile);
  }

  // =========================================================================
  // BATCH UPLOAD SURAT KELUAR & CHECKBOX LISTENERS
  // =========================================================================
  const tbodyKeluar = document.getElementById("tbodySuratKeluar");
  if (tbodyKeluar) {
    tbodyKeluar.addEventListener("change", (e) => {
      if (e.target && e.target.classList.contains("check-item-keluar")) {
        const id = e.target.dataset.id;
        if (e.target.checked) {
          state.selectedKeluarIds.add(id);
        } else {
          state.selectedKeluarIds.delete(id);
        }
        updateBatchKeluarBar();
        updateCheckAllKeluarState();
      }
    });
  }

  const checkAllKeluar = document.getElementById("checkAllKeluar");
  if (checkAllKeluar) {
    checkAllKeluar.addEventListener("change", () => {
      const currentSlice = getCurrentKeluarSlice();
      if (checkAllKeluar.checked) {
        currentSlice.forEach(item => state.selectedKeluarIds.add(item.id));
      } else {
        currentSlice.forEach(item => state.selectedKeluarIds.delete(item.id));
      }
      renderSuratKeluarTable();
    });
  }

  const btnHeaderBatch = document.getElementById("btnHeaderBatchUploadKeluar");
  if (btnHeaderBatch) {
    btnHeaderBatch.addEventListener("click", () => openBatchUploadModalKeluar());
  }

  const btnOpenModalBatch = document.getElementById("btnOpenBatchUploadKeluarModal");
  if (btnOpenModalBatch) {
    btnOpenModalBatch.addEventListener("click", () => openBatchUploadModalKeluar());
  }

  // Batch Edit Event Listeners
  const btnHeaderBatchEdit = document.getElementById("btnHeaderBatchEditKeluar");
  if (btnHeaderBatchEdit) {
    btnHeaderBatchEdit.addEventListener("click", () => openBatchEditModalKeluar());
  }

  const btnOpenModalBatchEdit = document.getElementById("btnOpenBatchEditKeluarModal");
  if (btnOpenModalBatchEdit) {
    btnOpenModalBatchEdit.addEventListener("click", () => openBatchEditModalKeluar());
  }

  const modalBatchEdit = document.getElementById("modalBatchEditKeluar");
  const btnCloseBatchEdit = document.getElementById("btnCloseBatchEditKeluar");
  const btnCancelBatchEdit = document.getElementById("btnCancelBatchEditKeluar");

  if (btnCloseBatchEdit && modalBatchEdit) {
    btnCloseBatchEdit.addEventListener("click", () => modalBatchEdit.classList.remove("show"));
  }
  if (btnCancelBatchEdit && modalBatchEdit) {
    btnCancelBatchEdit.addEventListener("click", () => modalBatchEdit.classList.remove("show"));
  }

  const selBatchKode = document.getElementById("batchEditKodeKlasifikasi");
  const inputBatchCustomKode = document.getElementById("batchEditCustomKode");
  if (selBatchKode) {
    selBatchKode.addEventListener("change", () => {
      if (inputBatchCustomKode) {
        inputBatchCustomKode.style.display = selBatchKode.value === "custom" ? "block" : "none";
      }
      renderBatchEditPreview();
    });
  }
  if (inputBatchCustomKode) {
    inputBatchCustomKode.addEventListener("input", () => renderBatchEditPreview());
  }

  const selBatchTglMode = document.getElementById("batchEditTanggalMode");
  const inputBatchTgl = document.getElementById("batchEditTanggalInput");
  if (selBatchTglMode) {
    selBatchTglMode.addEventListener("change", () => {
      if (inputBatchTgl) {
        inputBatchTgl.style.display = selBatchTglMode.value === "change" ? "block" : "none";
        if (selBatchTglMode.value === "change" && !inputBatchTgl.value) {
          const now = new Date();
          inputBatchTgl.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        }
      }
      renderBatchEditPreview();
    });
  }
  if (inputBatchTgl) {
    inputBatchTgl.addEventListener("change", () => renderBatchEditPreview());
  }

  const selBatchDari = document.getElementById("batchEditDari");
  const inputBatchDariCustom = document.getElementById("batchEditDariCustom");
  if (selBatchDari && inputBatchDariCustom) {
    selBatchDari.addEventListener("change", () => {
      inputBatchDariCustom.style.display = selBatchDari.value === "custom" ? "block" : "none";
    });
  }

  const selBatchPetugasMode = document.getElementById("batchEditPetugasMode");
  const inputBatchPetugas = document.getElementById("batchEditPetugasInput");
  if (selBatchPetugasMode && inputBatchPetugas) {
    selBatchPetugasMode.addEventListener("change", () => {
      inputBatchPetugas.style.display = selBatchPetugasMode.value === "change" ? "block" : "none";
    });
  }

  const selBatchKetMode = document.getElementById("batchEditKetMode");
  const inputBatchKet = document.getElementById("batchEditKetInput");
  if (selBatchKetMode && inputBatchKet) {
    selBatchKetMode.addEventListener("change", () => {
      inputBatchKet.style.display = selBatchKetMode.value === "change" ? "block" : "none";
    });
  }

  const selBatchLampiranMode = document.getElementById("batchEditLampiranMode");
  if (selBatchLampiranMode) {
    selBatchLampiranMode.addEventListener("change", () => {
      renderBatchEditPreview();
    });
  }

  const btnSubmitBatchEdit = document.getElementById("btnSubmitBatchEditKeluar");
  if (btnSubmitBatchEdit) {
    btnSubmitBatchEdit.addEventListener("click", () => executeBatchEditKeluar());
  }

  const btnSelectAllNoDrive = document.getElementById("btnSelectAllNoDriveKeluar");
  if (btnSelectAllNoDrive) {
    btnSelectAllNoDrive.addEventListener("click", () => {
      const noDrive = state.filteredKeluar.filter(item => !item.driveUrl && (!item.lampiran || !item.lampiran.includes("http")));
      if (noDrive.length === 0) {
        showToast("Semua surat keluar pada filter ini sudah memiliki berkas Google Drive!", "info");
        return;
      }
      noDrive.forEach(item => state.selectedKeluarIds.add(item.id));
      renderSuratKeluarTable();
      updateBatchKeluarBar();
      showToast(`Dipilih ${noDrive.length} surat keluar yang belum memiliki berkas Google Drive`, "info");
    });
  }

  const btnSelectAllHasDrive = document.getElementById("btnSelectAllHasDriveKeluar");
  if (btnSelectAllHasDrive) {
    btnSelectAllHasDrive.addEventListener("click", () => {
      const hasDrive = state.filteredKeluar.filter(item => item.driveUrl || (item.lampiran && item.lampiran.includes("http")));
      if (hasDrive.length === 0) {
        showToast("Tidak ada surat keluar pada filter ini yang memiliki berkas Google Drive!", "info");
        return;
      }
      hasDrive.forEach(item => state.selectedKeluarIds.add(item.id));
      renderSuratKeluarTable();
      updateBatchKeluarBar();
      showToast(`Dipilih ${hasDrive.length} surat keluar yang memiliki berkas Google Drive`, "info");
    });
  }

  const btnSelectCurrentPage = document.getElementById("btnSelectAllCurrentPageKeluar");
  if (btnSelectCurrentPage) {
    btnSelectCurrentPage.addEventListener("click", () => {
      const slice = getCurrentKeluarSlice();
      slice.forEach(item => state.selectedKeluarIds.add(item.id));
      renderSuratKeluarTable();
      updateBatchKeluarBar();
      showToast(`Dipilih ${slice.length} surat keluar di halaman ini`, "info");
    });
  }

  const btnClearBatch = document.getElementById("btnClearBatchKeluar");
  if (btnClearBatch) {
    btnClearBatch.addEventListener("click", () => {
      state.selectedKeluarIds.clear();
      renderSuratKeluarTable();
      updateBatchKeluarBar();
      showToast("Pilihan ceklis surat keluar dibatalkan.", "info");
    });
  }

  const modalBatch = document.getElementById("modalBatchUploadKeluar");
  const btnCloseBatch = document.getElementById("btnCloseBatchUploadKeluar");
  const btnCancelBatch = document.getElementById("btnCancelBatchUploadKeluar");

  if (btnCloseBatch && modalBatch) {
    btnCloseBatch.addEventListener("click", () => modalBatch.classList.remove("show"));
  }
  if (btnCancelBatch && modalBatch) {
    btnCancelBatch.addEventListener("click", () => modalBatch.classList.remove("show"));
  }

  const dropzoneKeluar = document.getElementById("batchKeluarDropzone");
  const multiInputKeluar = document.getElementById("batchKeluarMultiInput");
  const btnBrowseKeluar = document.getElementById("btnBrowseBatchKeluarFiles") || document.getElementById("btnBrowseBatchFiles");

  if (btnBrowseKeluar && multiInputKeluar) {
    btnBrowseKeluar.addEventListener("click", (e) => {
      e.stopPropagation();
      multiInputKeluar.click();
    });
  }
  if (dropzoneKeluar && multiInputKeluar) {
    dropzoneKeluar.addEventListener("click", (e) => {
      if (e.target !== btnBrowseKeluar) multiInputKeluar.click();
    });
    dropzoneKeluar.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzoneKeluar.classList.add("dragover");
    });
    dropzoneKeluar.addEventListener("dragleave", () => {
      dropzoneKeluar.classList.remove("dragover");
    });
    dropzoneKeluar.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzoneKeluar.classList.remove("dragover");
      if (e.dataTransfer && e.dataTransfer.files) {
        handleBatchKeluarFiles(e.dataTransfer.files);
      }
    });
  }
  if (multiInputKeluar) {
    multiInputKeluar.addEventListener("change", () => {
      if (multiInputKeluar.files && multiInputKeluar.files.length > 0) {
        handleBatchKeluarFiles(multiInputKeluar.files);
        multiInputKeluar.value = "";
      }
    });
  }

  const btnBatchClearFilesKeluar = document.getElementById("btnBatchClearFiles");
  if (btnBatchClearFilesKeluar) {
    btnBatchClearFilesKeluar.addEventListener("click", () => {
      state.batchKeluarItems = [];
      renderBatchKeluarModalList();
      showToast("Seluruh daftar berkas surat keluar telah dikosongkan.", "info");
    });
  }

  const btnApplyGlobalKlasifikasiKeluar = document.getElementById("btnApplyGlobalKlasifikasiKeluar");
  if (btnApplyGlobalKlasifikasiKeluar) {
    btnApplyGlobalKlasifikasiKeluar.addEventListener("click", applyGlobalKlasifikasiToBatchKeluar);
  }

  const btnApplyGlobalTglKeluar = document.getElementById("btnApplyGlobalTglKeluar");
  if (btnApplyGlobalTglKeluar) {
    btnApplyGlobalTglKeluar.addEventListener("click", applyGlobalTglToBatchKeluar);
  }

  const btnApplyGlobalKepadaKeluar = document.getElementById("btnApplyGlobalKepadaKeluar");
  if (btnApplyGlobalKepadaKeluar) {
    btnApplyGlobalKepadaKeluar.addEventListener("click", applyGlobalKepadaToBatchKeluar);
  }

  const btnBatchKeluarRescanPdf = document.getElementById("btnBatchKeluarRescanPdf");
  if (btnBatchKeluarRescanPdf) {
    btnBatchKeluarRescanPdf.addEventListener("click", rescanAllBatchKeluarPdf);
  }

  const btnStartBatchKeluar = document.getElementById("btnStartBatchUploadKeluar");
  if (btnStartBatchKeluar) {
    btnStartBatchKeluar.addEventListener("click", executeBatchUploadKeluar);
  }

  const btnApplyPreviewBatchPdfKeluar = document.getElementById("btnApplyPreviewBatchPdfKeluar");
  if (btnApplyPreviewBatchPdfKeluar) {
    btnApplyPreviewBatchPdfKeluar.addEventListener("click", applyPreviewBatchPdfKeluar);
  }

  // =========================================================================
  // LISTENERS: BATCH UPLOAD SURAT MASUK
  // =========================================================================
  const btnHeaderBatchUploadMasuk = document.getElementById("btnHeaderBatchUploadMasuk");
  if (btnHeaderBatchUploadMasuk) {
    btnHeaderBatchUploadMasuk.addEventListener("click", () => openBatchUploadModalMasuk());
  }

  const btnOpenBatchUploadMasukModal = document.getElementById("btnOpenBatchUploadMasukModal");
  if (btnOpenBatchUploadMasukModal) {
    btnOpenBatchUploadMasukModal.addEventListener("click", () => openBatchUploadModalMasuk(Array.from(state.selectedMasukIds)));
  }

  const modalBatchMasuk = document.getElementById("modalBatchUploadMasuk");
  const btnCloseBatchUploadMasuk = document.getElementById("btnCloseBatchUploadMasuk");
  const btnCancelBatchUploadMasuk = document.getElementById("btnCancelBatchUploadMasuk");

  if (btnCloseBatchUploadMasuk && modalBatchMasuk) {
    btnCloseBatchUploadMasuk.addEventListener("click", () => modalBatchMasuk.classList.remove("show"));
  }
  if (btnCancelBatchUploadMasuk && modalBatchMasuk) {
    btnCancelBatchUploadMasuk.addEventListener("click", () => modalBatchMasuk.classList.remove("show"));
  }

  const dropzoneMasuk = document.getElementById("batchMasukDropzone");
  const multiInputMasuk = document.getElementById("batchMasukMultiInput");
  const btnBrowseMasuk = document.getElementById("btnBrowseBatchMasukFiles");

  if (btnBrowseMasuk && multiInputMasuk) {
    btnBrowseMasuk.addEventListener("click", (e) => {
      e.stopPropagation();
      multiInputMasuk.click();
    });
  }
  if (dropzoneMasuk && multiInputMasuk) {
    dropzoneMasuk.addEventListener("click", (e) => {
      if (e.target !== btnBrowseMasuk) multiInputMasuk.click();
    });
    dropzoneMasuk.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzoneMasuk.classList.add("dragover");
    });
    dropzoneMasuk.addEventListener("dragleave", () => {
      dropzoneMasuk.classList.remove("dragover");
    });
    dropzoneMasuk.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzoneMasuk.classList.remove("dragover");
      if (e.dataTransfer && e.dataTransfer.files) {
        handleBatchMasukFiles(e.dataTransfer.files);
      }
    });
  }
  if (multiInputMasuk) {
    multiInputMasuk.addEventListener("change", () => {
      if (multiInputMasuk.files && multiInputMasuk.files.length > 0) {
        handleBatchMasukFiles(multiInputMasuk.files);
        multiInputMasuk.value = "";
      }
    });
  }

  const btnBatchMasukClearFiles = document.getElementById("btnBatchMasukClearFiles");
  if (btnBatchMasukClearFiles) {
    btnBatchMasukClearFiles.addEventListener("click", () => {
      state.batchMasukItems = [];
      renderBatchMasukModalList();
      showToast("Seluruh daftar berkas surat masuk telah dikosongkan.", "info");
    });
  }

  const btnApplyGlobalPengirimMasuk = document.getElementById("btnApplyGlobalPengirimMasuk");
  if (btnApplyGlobalPengirimMasuk) {
    btnApplyGlobalPengirimMasuk.addEventListener("click", applyGlobalPengirimToBatchMasuk);
  }

  const btnApplyGlobalTglMasuk = document.getElementById("btnApplyGlobalTglMasuk");
  if (btnApplyGlobalTglMasuk) {
    btnApplyGlobalTglMasuk.addEventListener("click", applyGlobalTglToBatchMasuk);
  }

  const btnApplyGlobalDisposisiMasuk = document.getElementById("btnApplyGlobalDisposisiMasuk");
  if (btnApplyGlobalDisposisiMasuk) {
    btnApplyGlobalDisposisiMasuk.addEventListener("click", applyGlobalDisposisiToBatchMasuk);
  }

  const btnStartBatchUploadMasuk = document.getElementById("btnStartBatchUploadMasuk");
  if (btnStartBatchUploadMasuk) {
    btnStartBatchUploadMasuk.addEventListener("click", executeBatchUploadMasuk);
  }

  const btnBatchMasukRescanPdf = document.getElementById("btnBatchMasukRescanPdf");
  if (btnBatchMasukRescanPdf) {
    btnBatchMasukRescanPdf.addEventListener("click", rescanAllBatchMasukPdf);
  }

  // Modal Intip/Cek PDF Batch Surat Masuk Listeners
  const btnClosePreviewBatchPdf = document.getElementById("btnClosePreviewBatchPdf");
  const btnCancelPreviewBatchPdf = document.getElementById("btnCancelPreviewBatchPdf");
  const btnApplyPreviewBatchPdfNoAgenda = document.getElementById("btnApplyPreviewBatchPdfNoAgenda");
  const previewBatchPdfNoAgendaInput = document.getElementById("previewBatchPdfNoAgendaInput");

  if (btnClosePreviewBatchPdf) {
    btnClosePreviewBatchPdf.addEventListener("click", closePreviewBatchPdfModal);
  }
  if (btnCancelPreviewBatchPdf) {
    btnCancelPreviewBatchPdf.addEventListener("click", closePreviewBatchPdfModal);
  }
  if (btnApplyPreviewBatchPdfNoAgenda) {
    btnApplyPreviewBatchPdfNoAgenda.addEventListener("click", applyPreviewBatchPdfNoAgenda);
  }
  if (previewBatchPdfNoAgendaInput) {
    previewBatchPdfNoAgendaInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        applyPreviewBatchPdfNoAgenda();
      }
    });
  }

  // Modal Delete Surat (Keluar & Masuk) Listeners
  const modalDelete = document.getElementById("modalConfirmDelete");
  const btnCloseDelete = document.getElementById("btnCloseConfirmDelete");
  const btnCancelDelete = document.getElementById("btnCancelConfirmDelete");
  const btnExecDelete = document.getElementById("btnExecuteDeleteRow");

  if (btnCloseDelete && modalDelete) {
    btnCloseDelete.addEventListener("click", () => modalDelete.classList.remove("show"));
  }
  if (btnCancelDelete && modalDelete) {
    btnCancelDelete.addEventListener("click", () => modalDelete.classList.remove("show"));
  }
  if (btnExecDelete) {
    btnExecDelete.addEventListener("click", handleExecuteDeleteRow);
  }

  // Modal Edit Surat Keluar Listeners
  const modalEditKeluar = document.getElementById("modalEditSuratKeluar");
  const btnCloseModalEditKeluar = document.getElementById("btnCloseModalEditKeluar");
  const btnCancelModalEditKeluar = document.getElementById("btnCancelModalEditKeluar");
  const formEditSuratKeluar = document.getElementById("formEditSuratKeluar");
  const editKeluarKodeKlasifikasi = document.getElementById("editKeluarKodeKlasifikasi");
  const editKeluarCustomKode = document.getElementById("editKeluarCustomKode");

  if (btnCloseModalEditKeluar && modalEditKeluar) {
    btnCloseModalEditKeluar.addEventListener("click", () => modalEditKeluar.classList.remove("show"));
  }
  if (btnCancelModalEditKeluar && modalEditKeluar) {
    btnCancelModalEditKeluar.addEventListener("click", () => modalEditKeluar.classList.remove("show"));
  }
  if (formEditSuratKeluar) {
    formEditSuratKeluar.addEventListener("submit", handleExecuteEditSuratKeluar);
  }
  if (editKeluarKodeKlasifikasi && editKeluarCustomKode) {
    editKeluarKodeKlasifikasi.addEventListener("change", () => {
      if (editKeluarKodeKlasifikasi.value === "custom") {
        editKeluarCustomKode.style.display = "block";
      } else {
        editKeluarCustomKode.style.display = "none";
      }
    });
  }

  // Modal Edit Surat Masuk Listeners
  const modalEditMasuk = document.getElementById("modalEditSuratMasuk");
  const btnCloseModalEditMasuk = document.getElementById("btnCloseModalEditMasuk");
  const btnCancelModalEditMasuk = document.getElementById("btnCancelModalEditMasuk");
  const formEditSuratMasuk = document.getElementById("formEditSuratMasuk");

  if (btnCloseModalEditMasuk && modalEditMasuk) {
    btnCloseModalEditMasuk.addEventListener("click", () => modalEditMasuk.classList.remove("show"));
  }
  if (btnCancelModalEditMasuk && modalEditMasuk) {
    btnCancelModalEditMasuk.addEventListener("click", () => modalEditMasuk.classList.remove("show"));
  }
  if (formEditSuratMasuk) {
    formEditSuratMasuk.addEventListener("submit", handleExecuteEditSuratMasuk);
  }

  // Listener dropdown pilihan pengirim Edit Surat Masuk
  const editMasukDari = document.getElementById("editMasukDari");
  const editMasukDariCustomGroup = document.getElementById("editMasukDariCustomGroup");
  const editMasukDariCustom = document.getElementById("editMasukDariCustom");
  if (editMasukDari) {
    editMasukDari.addEventListener("change", () => {
      if (editMasukDari.value === "__CUSTOM__") {
        if (editMasukDariCustomGroup) editMasukDariCustomGroup.style.display = "block";
        if (editMasukDariCustom) editMasukDariCustom.focus();
      } else {
        if (editMasukDariCustomGroup) editMasukDariCustomGroup.style.display = "none";
        if (editMasukDariCustom) editMasukDariCustom.value = "";
      }
    });
  }
}

/**
 * Hitung dan perbarui preview nomor agenda lengkap
 */
function updateGeneratedPreview() {
  const selKode = document.getElementById("genKodeKlasifikasi");
  const customKode = document.getElementById("genCustomKode");
  const txtNoAgenda = document.getElementById("genNomorUrut");
  const dtTgl = document.getElementById("genTanggalSurat");
  const previewBox = document.getElementById("previewFullNumber");

  let kode = selKode?.value || "421.3";
  if (kode === "custom") {
    kode = customKode?.value.trim() || "421.x";
  }

  let noAgenda = txtNoAgenda?.value.trim() || state.nextKeluarAgenda || "609";

  let romanMonth = "X";
  let tahun = "2026";

  if (dtTgl && dtTgl.value) {
    const parts = parseDateParts(dtTgl.value);
    tahun = String(parts.year);
    romanMonth = parts.romanMonth;
  }

  const fullGeneratedNumber = `${kode}/${noAgenda}/SMA YWKA/TU/${romanMonth}/${tahun}`.replace(/\/{2,}/g, "/");
  if (previewBox) {
    previewBox.textContent = fullGeneratedNumber;
  }
}

/**
 * Ambil data CSV dari Google Spreadsheet secara cepat & tangguh:
 * Mengutamakan GViz Query (langsung HTTP 200, tanpa 307 redirect, ramah Brave Shields),
 * dengan fallback ke endpoint export dan timeout AbortController agar tidak pernah freeze.
 */
async function fetchSpreadsheetCsv(gvizUrl, exportUrl, timeoutMs = 6000) {
  // 1. Coba GViz query CSV langsung
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(gvizUrl, { signal: controller.signal, cache: "no-store" });
    clearTimeout(timer);
    if (res.ok) {
      const text = await res.text();
      if (text && text.length > 60) {
        return text;
      }
    }
  } catch (gvizErr) {
    console.warn("GViz fetch gagal / timeout, mencoba endpoint export fallback:", gvizErr);
  }

  // 2. Fallback ke endpoint Export jika GViz gagal
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(exportUrl, { signal: controller.signal, credentials: "omit" });
    clearTimeout(timer);
    if (res.ok) {
      const text = await res.text();
      if (text && text.length > 60) {
        return text;
      }
    }
  } catch (exportErr) {
    console.warn("Export CSV fetch gagal:", exportErr);
  }

  throw new Error("Gagal mengambil data dari Google Spreadsheet");
}

async function fetchSingleCsv(url, timeoutMs = 6000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal, credentials: "omit" });
    clearTimeout(timer);
    if (res.ok) {
      const text = await res.text();
      if (text && text.length > 60) {
        return text;
      }
    }
  } catch (err) {
    console.warn("fetchSingleCsv gagal untuk URL " + url + ":", err);
  }
  return null;
}

/**
 * Muat Data dari Google Spreadsheet (Cepat & Paralel)
 */
async function loadDataFromSpreadsheet() {
  setLoadingState(true);
  updateConnectionStatus(false, "Menyinkronkan Spreadsheet...");

  try {
    // Ambil data Surat Keluar & Surat Masuk secara PARALEL (Promise.all)
    const [csvKeluarText, csvMasukText] = await Promise.all([
      fetchSpreadsheetCsv(URL_GVIZ_KELUAR, URL_EXPORT_KELUAR, 6000),
      fetchSpreadsheetCsv(URL_GVIZ_MASUK, URL_EXPORT_MASUK, 6000)
    ]);

    const liveKeluar = parseCsvKeluar(csvKeluarText);
    const liveMasuk = parseCsvMasuk(csvMasukText);

    if (liveKeluar && liveKeluar.length > 0) {
      // PERBAIKAN OTOMATIS: Jika Google Sheets GViz mengosongkan tanggal akibat type-mismatch,
      // ambil nilai teks asli langsung dari URL_EXPORT_KELUAR untuk melengkapi tanggal yang hilang!
      const hasMissingDates = liveKeluar.some(k => (!k.tanggal || k.tanggal === "-") && k.perihal);
      if (hasMissingDates) {
        try {
          const exportCsvText = await fetchSingleCsv(URL_EXPORT_KELUAR, 5000);
          if (exportCsvText) {
            const expItems = parseCsvKeluar(exportCsvText);
            const dateMap = new Map();
            expItems.forEach(item => {
              if (item.noAgenda && item.tanggal && item.tanggal !== "-") {
                dateMap.set(String(item.noAgenda).trim().toLowerCase(), item.tanggal);
              }
            });
            liveKeluar.forEach(kItem => {
              if (!kItem.tanggal || kItem.tanggal === "-") {
                const filledDate = dateMap.get(String(kItem.noAgenda || "").trim().toLowerCase());
                if (filledDate) {
                  kItem.tanggal = filledDate;
                }
              }
            });
          }
        } catch (expErr) {
          console.warn("Cross-fetch export CSV Surat Keluar gagal:", expErr);
        }
      }

      liveKeluar.forEach(kItem => {
        const localItem = state.suratKeluar.find(s => s.noAgenda && kItem.noAgenda && s.noAgenda === kItem.noAgenda);
        if (localItem) {
          if ((!kItem.tanggal || kItem.tanggal === "-") && (localItem.tanggal && localItem.tanggal !== "-")) {
            kItem.tanggal = localItem.tanggal;
            if (!kItem.driveUrl && localItem.driveUrl) {
              kItem.driveUrl = localItem.driveUrl;
              kItem.lampiran = localItem.lampiran || localItem.driveUrl;
              kItem.status = true;
            }
          }
        }
      });
      state.suratKeluar = liveKeluar;
    }

    if (liveMasuk && liveMasuk.length > 0) {
      const hasMissingDatesMasuk = liveMasuk.some(m => (!m.tglSurat || m.tglSurat === "-" || !m.tglMasuk || m.tglMasuk === "-") && m.perihal);
      if (hasMissingDatesMasuk) {
        try {
          const exportMasukCsv = await fetchSingleCsv(URL_EXPORT_MASUK, 5000);
          if (exportMasukCsv) {
            const expMasukItems = parseCsvMasuk(exportMasukCsv);
            const dateMapMasuk = new Map();
            expMasukItems.forEach(item => {
              const key = String(item.noAgenda || item.noUrut || "").trim().toLowerCase();
              if (key) {
                dateMapMasuk.set(key, { tglSurat: item.tglSurat, tglMasuk: item.tglMasuk });
              }
            });
            liveMasuk.forEach(mItem => {
              const key = String(mItem.noAgenda || mItem.noUrut || "").trim().toLowerCase();
              if (key && dateMapMasuk.has(key)) {
                const d = dateMapMasuk.get(key);
                if ((!mItem.tglSurat || mItem.tglSurat === "-") && d.tglSurat && d.tglSurat !== "-") {
                  mItem.tglSurat = d.tglSurat;
                }
                if ((!mItem.tglMasuk || mItem.tglMasuk === "-") && d.tglMasuk && d.tglMasuk !== "-") {
                  mItem.tglMasuk = d.tglMasuk;
                }
              }
            });
          }
        } catch (expErr) {
          console.warn("Cross-fetch export CSV Surat Masuk gagal:", expErr);
        }
      }

      liveMasuk.forEach(mItem => {
        const localItem = state.suratMasuk.find(s => (s.noAgenda && mItem.noAgenda && s.noAgenda !== "-" && mItem.noAgenda !== "-" && s.noAgenda === mItem.noAgenda) || (s.noUrut && mItem.noUrut && String(s.noUrut).trim() === String(mItem.noUrut).trim()));
        if (localItem) {
          if ((!mItem.tglSurat || mItem.tglSurat === "-") && (localItem.tglSurat && localItem.tglSurat !== "-")) {
            mItem.tglSurat = localItem.tglSurat;
          }
          if ((!mItem.tglMasuk || mItem.tglMasuk === "-") && (localItem.tglMasuk && localItem.tglMasuk !== "-")) {
            mItem.tglMasuk = localItem.tglMasuk;
            if (!mItem.driveUrl && localItem.driveUrl) {
              mItem.driveUrl = localItem.driveUrl;
              mItem.lampiran = localItem.lampiran || localItem.driveUrl;
              mItem.status = true;
            }
          }
        }
      });
      state.suratMasuk = liveMasuk;
      state.suratMasuk.sort((a, b) => (parseInt(a.noUrut, 10) || 0) - (parseInt(b.noUrut, 10) || 0));
    }

    // 3. Pertahankan surat lokal yang belum tersimpan ke Google Sheets agar TIDAK HILANG saat sinkron dan bersihkan yang sudah tersinkron
    const unsyncedKeluar = JSON.parse(localStorage.getItem("unsynced_surat_keluar") || "[]");
    if (unsyncedKeluar.length > 0) {
      const remainingKeluar = [];
      unsyncedKeluar.forEach(uItem => {
        const found = state.suratKeluar.some(k => (k.noAgenda && uItem.noAgenda && k.noAgenda === uItem.noAgenda) || (k.perihal && uItem.perihal && k.perihal === uItem.perihal));
        if (!found) {
          state.suratKeluar.unshift(uItem);
          remainingKeluar.push(uItem);
        }
      });
      state.suratKeluar.sort((a, b) => (parseInt(a.noAgenda || a.noUrut, 10) || 0) - (parseInt(b.noAgenda || b.noUrut, 10) || 0));
      localStorage.setItem("unsynced_surat_keluar", JSON.stringify(remainingKeluar));
    }

    const unsyncedMasuk = JSON.parse(localStorage.getItem("unsynced_surat_masuk") || "[]");
    if (unsyncedMasuk.length > 0) {
      const remainingMasuk = [];
      unsyncedMasuk.forEach(uItem => {
        if (parseInt(uItem.noUrut, 10) > 300) return; // Singkirkan data korup lama jika ada
        const found = state.suratMasuk.some(m => (m.noUrut && uItem.noUrut && m.noUrut === uItem.noUrut) || (m.perihal && uItem.perihal && m.perihal === uItem.perihal));
        if (!found) {
          state.suratMasuk.push(uItem);
          remainingMasuk.push(uItem);
        }
      });
      state.suratMasuk.sort((a, b) => (parseInt(a.noUrut, 10) || 0) - (parseInt(b.noUrut, 10) || 0));
      localStorage.setItem("unsynced_surat_masuk", JSON.stringify(remainingMasuk));
    }

    calculateNextSequence();

    localStorage.setItem("cache_surat_keluar_2026", JSON.stringify(state.suratKeluar));
    localStorage.setItem("cache_surat_masuk_2026", JSON.stringify(state.suratMasuk));

    updateConnectionStatus(true, "Terhubung ke Google Sheets (Live)"); syncAllPendingItems().catch(() => { });
  } catch (err) {
    console.warn("Sinkronisasi live lambat / offline, menggunakan cache:", err);
    // Jika state kosong, pastikan data cache/bawaan tetap tampil
    if (!state.suratKeluar || state.suratKeluar.length === 0) {
      hydrateFromCacheOrBuiltin();
    }
    updateConnectionStatus(true, "Mode Cepat (Data Tersimpan)");
  } finally {
    setLoadingState(false);
    updateDashboardUI();
    filterSuratKeluarData();
    filterSuratMasukData();
    checkConnectionBanners();
    updateDriveLinksInUI();
  }
}

/**
 * Helper: Normalisasi URL/ID Berkas Google Drive dari kolom Spreadsheet
 * Mampu membaca format full link (http/https), /d/<id>, /<id>, atau raw File ID (20+ karakter)
 */
function normalizeDriveFileUrl(val) {
  if (!val) return "";
  const str = String(val).trim();
  if (!str || str === "Surat Keluar" || str === "Surat Masuk" || str === "-" || str === "null" || str === "undefined") {
    return "";
  }
  // 1. Full URL
  if (str.startsWith("http://") || str.startsWith("https://")) {
    return str;
  }
  // 2. Format /d/<id>
  const matchD = str.match(/\/d\/([a-zA-Z0-9_-]{15,})/);
  if (matchD && matchD[1]) {
    return `https://drive.google.com/file/d/${matchD[1]}/view?usp=drivesdk`;
  }
  // 3. Format /<id>
  const matchSlash = str.match(/^\/([a-zA-Z0-9_-]{15,})/);
  if (matchSlash && matchSlash[1]) {
    return `https://drive.google.com/file/d/${matchSlash[1]}/view?usp=drivesdk`;
  }
  // 4. Raw file ID (20 karakter atau lebih, tanpa spasi dan garis miring)
  if (/^[a-zA-Z0-9_-]{20,}$/.test(str)) {
    return `https://drive.google.com/file/d/${str}/view?usp=drivesdk`;
  }
  return "";
}

/**
 * Helper: Cek secara presisi apakah surat memiliki berkas di Google Drive
 */
function hasDriveFileAttached(item) {
  if (!item) return false;
  if (item.driveUrl && item.driveUrl.includes("http")) return true;
  if (item.fileBase64) return true;
  if (item.status === true) return true; // Checkbox di Kolom B Spreadsheet telah diceklis
  if (item.lampiran) {
    const lamp = String(item.lampiran).trim();
    if (lamp && lamp !== "Surat Keluar" && lamp !== "Surat Masuk" && lamp !== "-") {
      if (lamp.includes("drive.google.com") || lamp.startsWith("http") || lamp.startsWith("/d/") || lamp.startsWith("/1") || /^[a-zA-Z0-9_-]{20,}$/.test(lamp)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Helper: Dapatkan URL tautan berkas Google Drive dengan fallback folder
 */
function getDriveLinkHref(item, type = "keluar") {
  if (!item) return "";
  const defaultFolder = type === "keluar"
    ? (state.driveKeluarUrl || "https://drive.google.com/drive/folders/15sHeKCXOjXDAFfHJtzKKZYA9OpYQb3R5")
    : (state.driveMasukUrl || "https://drive.google.com/drive/folders/11QCXz3fc9TCr993YIWIrH5JPwBr3my2W");

  if (item.driveUrl && item.driveUrl.includes("http")) {
    return item.driveUrl;
  }
  const normLampiran = normalizeDriveFileUrl(item.lampiran);
  if (normLampiran) return normLampiran;

  return defaultFolder;
}

/**
 * Parse CSV Surat Keluar: No. Urut Mengikuti No. Agenda (Col D) dengan Anti-Duplikasi
 */
function parseCsvKeluar(csvText) {
  const rows = parseCsvRows(csvText);
  const rawItems = [];

  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 8) continue;

    // Abaikan header
    if (r[0] === "NO. URUT" || r[0] === "BUKU AGENDA SURAT KELUAR") continue;

    const noAgenda = (r[3] || "").trim();
    const perihal = (r[8] || "").trim();

    // HANYA ambil baris yang benar-benar memiliki perihal (surat yang sudah diterbitkan)
    // Baris template kosong 609-625 yang perihalnya masih kosong diabaikan agar tidak mengacaukan nomor terakhir
    if (!perihal) continue;

    // No. Urut mengikuti No. Agenda sesuai permintaan pengguna!
    const noUrut = noAgenda || (r[0] || "").trim();
    const kodePrefix = (r[2] || "").trim();
    const sekolahTag = (r[4] || "").trim();
    const bulanRomawi = (r[5] || "").trim();
    const tahun = (r[6] || "").trim();
    const lampiranVal = (r[13] || "").trim();
    const normalizedDriveUrl = normalizeDriveFileUrl(lampiranVal);
    const isChecked = r[1] === "TRUE";
    const hasDriveFile = Boolean(isChecked || normalizedDriveUrl || (lampiranVal && (lampiranVal.includes("http") || lampiranVal.startsWith("/d/") || lampiranVal.startsWith("/1") || /^[a-zA-Z0-9_-]{20,}$/.test(lampiranVal))));

    let nomorLengkap = "";
    if (kodePrefix && noAgenda) {
      nomorLengkap = `${kodePrefix}${noAgenda}${sekolahTag}${bulanRomawi}${tahun}`.replace(/\/{2,}/g, "/");
    } else if (noAgenda) {
      nomorLengkap = `${noAgenda}/SMA YWKA/TU/${bulanRomawi || 'X'}/${tahun || '2026'}`;
    }

    rawItems.push({
      id: "K-" + (i + 1),
      rowIndex: i + 1,
      noUrut: noUrut, // No. Urut mengikuti No. Agenda
      status: isChecked || hasDriveFile,
      kodeKlasifikasi: kodePrefix.replace("/", "").trim() || "421.3",
      noAgenda: noAgenda,
      nomorLengkap: nomorLengkap,
      bulanRomawi: bulanRomawi,
      tanggal: formatDateIndo((r[7] || "").trim()),
      perihal: perihal,
      dari: (r[9] || "Syarif Hasanudin, S.Pd., Gr., M.M.").trim(),
      kepada: (r[10] || "").trim(),
      petugas: (r[11] || "").trim(),
      keterangan: (r[12] || "").trim(),
      lampiran: normalizedDriveUrl || lampiranVal || (hasDriveFile ? normalizedDriveUrl : "Surat Keluar"),
      driveUrl: normalizedDriveUrl
    });
  }

  // Deduplikasi cerdas Surat Keluar (berdasarkan noAgenda unik)
  const items = [];
  const seenAgenda = new Map();

  for (const item of rawItems) {
    const key = item.noAgenda ? item.noAgenda.toLowerCase() : "";
    if (key) {
      if (seenAgenda.has(key)) {
        const exIdx = seenAgenda.get(key);
        const ex = items[exIdx];
        if (!ex.duplicateRowIndices) ex.duplicateRowIndices = [ex.rowIndex];
        ex.duplicateRowIndices.push(item.rowIndex);
        if (!ex.driveUrl && item.driveUrl) {
          ex.driveUrl = item.driveUrl;
          ex.lampiran = item.lampiran;
        }
        if (!ex.status && item.status) {
          ex.status = true;
        }
        continue;
      }
      seenAgenda.set(key, items.length);
    }
    items.push(item);
  }

  return items;
}

/**
 * Parse CSV Surat Masuk dengan Deduplikasi Cerdas & Normalisasi Nomor Urut
 */
function parseCsvMasuk(csvText) {
  const rows = parseCsvRows(csvText);
  const rawItems = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 5) continue;
    if (r[0] === "NO. URUT" || r[0] === "BUKU AGENDA SURAT MASUK" || (r[0] && String(r[0]).includes("BUKU AGENDA"))) continue;

    const perihal = (r[4] || "").trim();
    const noAgenda = (r[1] || "").trim();
    const lampiranVal = (r[9] || "").trim();
    const normalizedDriveUrlM = normalizeDriveFileUrl(lampiranVal);
    const hasDriveFileM = Boolean(normalizedDriveUrlM || (lampiranVal && (lampiranVal.includes("http") || lampiranVal.startsWith("/d/") || lampiranVal.startsWith("/1") || /^[a-zA-Z0-9_-]{20,}$/.test(lampiranVal))));

    // Abaikan baris template kosong di mana kolom B hanya berisi angka urutan (218, 219, dst) tanpa perihal
    if (!perihal && (!noAgenda || /^\d+$/.test(noAgenda))) continue;

    let tglSuratVal = formatDateIndo((r[2] || "").trim());
    let tglMasukVal = formatDateIndo((r[3] || "").trim());

    // Pemulihan otomatis jika Google Sheets GViz mengosongkan tanggal akibat type-mismatch pada baris 210 & 211
    if (noAgenda.includes("STIKep") || (r[0] || "").trim() === "210") {
      if (!tglSuratVal || tglSuratVal === "-") tglSuratVal = "16/10/2026";
      if (!tglMasukVal || tglMasukVal === "-") tglMasukVal = "23/10/2026";
    }
    if (noAgenda.includes("8704") || (r[0] || "").trim() === "211") {
      if (!tglSuratVal || tglSuratVal === "-") tglSuratVal = "23/10/2026";
      if (!tglMasukVal || tglMasukVal === "-") tglMasukVal = "23/10/2026";
    }

    rawItems.push({
      id: "M-" + (i + 1),
      rowIndex: i + 1,
      noUrut: (r[0] || "").trim(),
      status: hasDriveFileM,
      noAgenda: noAgenda || "-",
      tglSurat: tglSuratVal,
      tglMasuk: tglMasukVal,
      perihal: perihal,
      dari: (r[5] || "").trim(),
      kepada: (r[6] || "SMA YWKA").trim(),
      kodeKlasifikasi: (r[7] || "").trim(),
      keterangan: (r[8] || "").trim(),
      lampiran: normalizedDriveUrlM || lampiranVal || (hasDriveFileM ? normalizedDriveUrlM : "Surat Masuk"),
      driveUrl: normalizedDriveUrlM
    });
  }

  // Deduplikasi Presisi Surat Masuk:
  // Hanya satukan baris ganda jika memiliki Nomor Urut yang sama DAN perihal/agenda yang persis sama (misal duplikasi jaringan)
  const items = [];
  const seenMap = new Map();

  for (const item of rawItems) {
    const sigUrut = (item.noUrut || "").trim();
    const sigPerihal = item.perihal ? item.perihal.trim().toLowerCase() : "";
    const sigAgenda = (item.noAgenda && item.noAgenda !== "-") ? item.noAgenda.trim().toLowerCase() : "";

    // Kunci unik wajib menyertakan No. Urut agar TIDAK menyatukan surat berbeda yang kebetulan memiliki nomor surat asal mirip
    let dedupKey = "";
    if (sigUrut && (sigPerihal || sigAgenda)) {
      dedupKey = `${sigUrut}|${sigAgenda}|${sigPerihal}`;
    }

    if (dedupKey) {
      if (seenMap.has(dedupKey)) {
        const existingIdx = seenMap.get(dedupKey);
        const existing = items[existingIdx];

        if (!existing.duplicateRowIndices) {
          existing.duplicateRowIndices = [existing.rowIndex];
        }
        existing.duplicateRowIndices.push(item.rowIndex);

        // Pertahankan berkas Drive jika entitas baru memilikinya
        if (!existing.driveUrl && item.driveUrl) {
          existing.driveUrl = item.driveUrl;
          existing.lampiran = item.lampiran;
        }
        if (!existing.status && item.status) {
          existing.status = true;
        }
        continue;
      }
      seenMap.set(dedupKey, items.length);
    }
    items.push(item);
  }

  // Pertahankan nomor urut asli dari Google Spreadsheet (r[0])
  // Hanya jika r[0] kosong atau tidak valid, fallback ke penomoran baris
  for (let idx = 0; idx < items.length; idx++) {
    const it = items[idx];
    if (!it.noUrut || it.noUrut === "-" || isNaN(parseInt(it.noUrut, 10))) {
      it.noUrut = String(idx + 1);
    }
  }

  return items;
}

function parseCsvRows(text) {
  const p = [];
  let row = [''];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (c === '"') {
      if (inQuotes && next === '"') {
        row[row.length - 1] += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      row.push('');
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && next === '\n') { i++; }
      p.push(row);
      row = [''];
    } else {
      row[row.length - 1] += c;
    }
  }
  if (row.length > 1 || row[0] !== '') {
    p.push(row);
  }
  return p;
}

/**
 * Hitung No. Agenda Berikutnya: Terakhir 608 (Dispensasi CKG Puskesmas), Berikutnya 609
 */
function calculateNextSequence() {
  let maxFilledAgenda = 0;

  state.suratKeluar.forEach(item => {
    // Ambil angka jika perihalnya ada (artinya surat riil yang sudah terbit)
    if (item.perihal && item.noAgenda) {
      const match = item.noAgenda.match(/^(\d+)/);
      if (match) {
        const val = parseInt(match[1], 10);
        if (val > maxFilledAgenda) maxFilledAgenda = val;
      }
    }
  });

  // Nomor agenda terakhir yang tercatat di berkas riil adalah 608
  // (Surat Dispensasi untuk Siswa yang menjadi Petugas CKG bersama UPTD Puskesmas Garuda)
  if (maxFilledAgenda < 608) {
    maxFilledAgenda = 608;
  }

  state.lastFilledAgendaNumber = String(maxFilledAgenda);
  state.nextKeluarAgenda = String(maxFilledAgenda + 1);

  const inputNoAgenda = document.getElementById("genNomorUrut");
  const nextPreview = document.getElementById("nextNumberPreview");
  const topLastNumber = document.getElementById("topLastNumber");
  const statLastNumber = document.getElementById("statKeluarLastNumber");
  const statNextBadge = document.getElementById("statNextBadge");

  if (inputNoAgenda) {
    inputNoAgenda.value = state.nextKeluarAgenda;
  }
  const aiInputNoAgenda = document.getElementById("aiInputNoAgenda");
  if (aiInputNoAgenda && (!aiInputNoAgenda.value || aiInputNoAgenda.value === "609" || aiInputNoAgenda.value === String(maxFilledAgenda))) {
    aiInputNoAgenda.value = state.nextKeluarAgenda;
  }
  if (nextPreview) nextPreview.textContent = state.nextKeluarAgenda;
  if (topLastNumber) topLastNumber.textContent = state.lastFilledAgendaNumber;
  if (statLastNumber) statLastNumber.textContent = state.lastFilledAgendaNumber;
  if (statNextBadge) statNextBadge.textContent = state.nextKeluarAgenda;

  updateGeneratedPreview();
}

/**
 * Filter dan Render Tabel Surat Keluar
 */
function filterSuratKeluarData() {
  const search = (document.getElementById("searchKeluarInput")?.value || "").toLowerCase();
  const filterKlas = document.getElementById("filterKeluarKlasifikasi")?.value || "";
  const filterBulan = document.getElementById("filterKeluarBulan")?.value || "";

  state.filteredKeluar = state.suratKeluar.filter(item => {
    const matchSearch = !search ||
      item.noAgenda.toLowerCase().includes(search) ||
      item.nomorLengkap.toLowerCase().includes(search) ||
      item.perihal.toLowerCase().includes(search) ||
      item.kepada.toLowerCase().includes(search) ||
      item.petugas.toLowerCase().includes(search) ||
      item.dari.toLowerCase().includes(search);

    const matchKlas = !filterKlas || item.kodeKlasifikasi.includes(filterKlas);

    let matchBulan = true;
    if (filterBulan) {
      const targetMonth = parseInt(filterBulan, 10);
      matchBulan = (getItemMonth(item) === targetMonth);
    }

    return matchSearch && matchKlas && matchBulan;
  });

  state.pagination.keluarPage = 1;
  renderSuratKeluarTable();
}

/**
 * Render Tabel Surat Keluar (Ada Kolom No. Agenda & Kolom Google Drive)
 */
function renderSuratKeluarTable() {
  const tbody = document.getElementById("tbodySuratKeluar");
  const infoText = document.getElementById("keluarPaginationInfo");
  const btnContainer = document.getElementById("keluarPaginationBtns");

  if (!tbody) return;

  const total = state.filteredKeluar.length;
  if (total === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="loading-state">
          <i class="fa-solid fa-folder-open" style="font-size: 32px; color: #94a3b8; margin-bottom: 8px;"></i>
          <p>Tidak ditemukan surat keluar yang sesuai.</p>
        </td>
      </tr>
    `;
    if (infoText) infoText.textContent = "Menampilkan 0 dari 0 surat";
    if (btnContainer) btnContainer.innerHTML = "";
    updateCheckAllKeluarState();
    updateBatchKeluarBar();
    return;
  }

  const page = state.pagination.keluarPage;
  const perPage = state.pagination.keluarPerPage;
  const totalPages = Math.ceil(total / perPage);
  const start = (page - 1) * perPage;
  const end = Math.min(start + perPage, total);

  const currentSlice = state.filteredKeluar.slice(start, end);

  let html = "";
  currentSlice.forEach((item, idx) => {
    const rowNum = start + idx + 1;
    const isSelected = state.selectedKeluarIds ? state.selectedKeluarIds.has(item.id) : false;
    const hasDriveFile = hasDriveFileAttached(item);
    const targetDriveHref = getDriveLinkHref(item, "keluar");
    const driveLinkHtml = hasDriveFile
      ? `<a href="${targetDriveHref}" target="_blank" rel="noopener noreferrer" class="btn-drive-link" title="Berkas sudah tersedia di Google Drive (Klik untuk membuka berkas)">
           <i class="fa-brands fa-google-drive"></i> Berkas Drive
         </a>`
      : `<button type="button" class="btn-upload-direct" title="Berkas belum diunggah ke Google Drive Surat Keluar (Klik untuk mengunggah)" onclick="openUploadModalKeluar('${item.id}')">
           <i class="fa-solid fa-cloud-arrow-up"></i> Upload Drive
         </button>`;

    html += `
      <tr class="${isSelected ? 'row-selected' : ''}">
        <td style="text-align: center;">
          <input type="checkbox" class="check-item-keluar table-checkbox" data-id="${item.id}" data-agenda="${escapeHtml(item.noAgenda || item.noUrut || '')}" ${isSelected ? 'checked' : ''} aria-label="Pilih agenda ${escapeHtml(item.noAgenda || '')}">
        </td>
        <td><span class="nomor-agenda-badge"><strong>${escapeHtml(item.noAgenda || item.noUrut || "-")}</strong></span></td>
        <td>
          ${item.isUnsynced
        ? `<span class="badge-unsynced" title="Tersimpan di browser lokal, belum tersinkron ke Google Sheets"><i class="fa-solid fa-clock"></i> Belum Sync</span>`
        : `<span class="status-badge ${item.status ? 'status-active' : 'status-pending'}">${item.status ? 'Resmi' : 'Draft'}</span>`
      }
        </td>
        <td>
          <span class="nomor-surat-badge">${escapeHtml(item.nomorLengkap || "-")}</span>
        </td>
        <td><span class="date-text">${escapeHtml(formatDateIndo(item.tanggal) || "-")}</span></td>
        <td>
          <div class="perihal-cell">${escapeHtml(item.perihal || "-")}</div>
        </td>
        <td><span class="kepada-cell">${escapeHtml(item.kepada || "-")}</span></td>
        <td>
          ${item.petugas ? `<span class="tag-pic">${escapeHtml(item.petugas)}</span>` : `<span class="text-light">-</span>`}
        </td>
        <td style="text-align: center;">${driveLinkHtml}</td>
        <td style="text-align: center;">
          <div class="action-buttons">
            <button type="button" class="btn-table-action" title="Salin Nomor Surat" onclick="copyText('${escapeQuotes(item.nomorLengkap)}')">
              <i class="fa-solid fa-copy"></i>
            </button>
            <button type="button" class="btn-table-action btn-print-action" title="Cetak Lembar Disposisi & Agenda" onclick="openDirectPrint('${item.id}', 'keluar')">
              <i class="fa-solid fa-print"></i>
            </button>
            <button type="button" class="btn-table-action btn-wa-action" title="Kirim Laporan / Bukti Kerja ke WhatsApp (+62895328047492 / Grup TAS)" onclick="openWaReportForRow('${item.id}', 'keluar')">
              <i class="fa-brands fa-whatsapp"></i>
            </button>
            <button type="button" class="btn-table-action btn-edit-action" title="Edit Data Surat Keluar" onclick="openEditModalKeluar('${item.id}')">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button type="button" class="btn-table-action btn-upload-action" title="Upload Berkas ke Google Drive" onclick="openUploadModalKeluar('${item.id}')">
              <i class="fa-solid fa-cloud-arrow-up"></i>
            </button>
            <button type="button" class="btn-table-action btn-danger-action" title="Hapus Data Surat Keluar Ini" onclick="openDeleteModalKeluar('${item.id}')">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  if (infoText) {
    infoText.textContent = `Menampilkan ${start + 1} - ${end} dari ${total} surat keluar`;
  }

  if (btnContainer) {
    let btnsHtml = "";
    btnsHtml += `<button class="pagination-btn" ${page <= 1 ? "disabled" : ""} onclick="changeKeluarPage(${page - 1})"><i class="fa-solid fa-chevron-left"></i></button>`;

    for (let p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || (p >= page - 1 && p <= page + 1)) {
        btnsHtml += `<button class="pagination-btn ${p === page ? "active" : ""}" onclick="changeKeluarPage(${p})">${p}</button>`;
      } else if (p === page - 2 || p === page + 2) {
        btnsHtml += `<span style="padding: 0 4px; color: #94a3b8;">...</span>`;
      }
    }

    btnsHtml += `<button class="pagination-btn" ${page >= totalPages ? "disabled" : ""} onclick="changeKeluarPage(${page + 1})"><i class="fa-solid fa-chevron-right"></i></button>`;
    btnContainer.innerHTML = btnsHtml;
  }

  updateCheckAllKeluarState();
  updateBatchKeluarBar();
}

/**
 * Filter & Render Tabel Surat Masuk
 */
function filterSuratMasukData() {
  const search = (document.getElementById("searchMasukInput")?.value || "").toLowerCase();
  const filterPengirim = document.getElementById("filterMasukPengirim")?.value || "";
  const filterBulan = document.getElementById("filterMasukBulan")?.value || "";

  state.filteredMasuk = state.suratMasuk.filter(item => {
    const matchSearch = !search ||
      item.noAgenda.toLowerCase().includes(search) ||
      item.perihal.toLowerCase().includes(search) ||
      item.dari.toLowerCase().includes(search) ||
      item.keterangan.toLowerCase().includes(search);

    const matchPengirim = !filterPengirim || item.dari.toUpperCase().includes(filterPengirim);

    let matchBulan = true;
    if (filterBulan) {
      const targetMonth = parseInt(filterBulan, 10);
      matchBulan = (getItemMonth(item) === targetMonth);
    }

    return matchSearch && matchPengirim && matchBulan;
  });

  state.pagination.masukPage = 1;
  renderSuratMasukTable();
}

/**
 * Render Tabel Surat Masuk
 */
function renderSuratMasukTable() {
  const tbody = document.getElementById("tbodySuratMasuk");
  const infoText = document.getElementById("masukPaginationInfo");
  const btnContainer = document.getElementById("masukPaginationBtns");

  if (!tbody) return;

  const total = state.filteredMasuk.length;
  if (total === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="loading-state">
          <i class="fa-solid fa-inbox" style="font-size: 32px; color: #94a3b8; margin-bottom: 8px;"></i>
          <p>Tidak ada surat masuk yang sesuai filter.</p>
        </td>
      </tr>
    `;
    if (infoText) infoText.textContent = "Menampilkan 0 dari 0 surat";
    if (btnContainer) btnContainer.innerHTML = "";
    return;
  }

  const page = state.pagination.masukPage;
  const perPage = state.pagination.masukPerPage;
  const totalPages = Math.ceil(total / perPage);
  const start = (page - 1) * perPage;
  const end = Math.min(start + perPage, total);

  const currentSlice = state.filteredMasuk.slice(start, end);

  let html = "";
  currentSlice.forEach((item, idx) => {
    const rowNum = start + idx + 1;
    const hasDriveFile = hasDriveFileAttached(item);
    const targetDriveMasukHref = getDriveLinkHref(item, "masuk");
    const driveLinkHtml = hasDriveFile
      ? `<a href="${targetDriveMasukHref}" target="_blank" rel="noopener noreferrer" class="btn-drive-link" title="Berkas scan sudah tersedia di Google Drive (Klik untuk membuka berkas)">
           <i class="fa-brands fa-google-drive"></i> Berkas Drive
         </a>`
      : `<button type="button" class="btn-upload-direct" title="Berkas scan belum diunggah ke Google Drive Surat Masuk (Klik untuk mengunggah)" onclick="openUploadModalMasuk('${item.id}')">
           <i class="fa-solid fa-cloud-arrow-up"></i> Upload Drive
         </button>`;

    const isSelected = state.selectedMasukIds ? state.selectedMasukIds.has(item.id) : false;

    html += `
      <tr class="${isSelected ? 'row-selected' : ''}">
        <td style="text-align: center;">
          <input type="checkbox" class="check-item-masuk table-checkbox" data-id="${item.id}" data-agenda="${escapeHtml(item.noAgenda || '')}" ${isSelected ? 'checked' : ''} aria-label="Pilih surat ${escapeHtml(item.noAgenda || '')}">
        </td>
        <td><strong>${item.noUrut || rowNum}</strong></td>
        <td>
          <span class="nomor-surat-badge" style="background: #e0f2fe; color: #0369a1;">${escapeHtml(item.noAgenda)}</span>
        </td>
        <td><span class="date-text">${escapeHtml(formatDateIndo(item.tglSurat) || "-")}</span></td>
        <td><span class="date-text">${escapeHtml(formatDateIndo(item.tglMasuk) || "-")}</span></td>
        <td><div class="perihal-cell">${escapeHtml(item.perihal)}</div></td>
        <td><strong style="color: #334155; font-size: 12.5px;">${escapeHtml(item.dari || "-")}</strong></td>
        <td>${item.keterangan ? `<span class="tag-pic">${escapeHtml(item.keterangan)}</span>` : "-"}</td>
        <td style="text-align: center;">${driveLinkHtml}</td>
        <td style="text-align: center;">
          <div class="action-buttons">
            <button type="button" class="btn-table-action" title="Salin Nomor Agenda / Asal" onclick="copyText('${escapeQuotes(item.noAgenda)}')">
              <i class="fa-solid fa-copy"></i>
            </button>
            <button type="button" class="btn-table-action btn-print-action" title="Cetak Lembar Disposisi & Agenda" onclick="openDirectPrint('${item.id}', 'masuk')">
              <i class="fa-solid fa-print"></i>
            </button>
            <button type="button" class="btn-table-action btn-wa-action" title="Kirim Laporan / Bukti Kerja ke WhatsApp (+62895328047492 / Grup TAS)" onclick="openWaReportForRow('${item.id}', 'masuk')">
              <i class="fa-brands fa-whatsapp"></i>
            </button>
            <button type="button" class="btn-table-action btn-edit-action" title="Edit Data Surat Masuk" onclick="openEditModalMasuk('${item.id}')">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button type="button" class="btn-table-action btn-upload-action" title="Upload Berkas ke Google Drive Surat Masuk" onclick="openUploadModalMasuk('${item.id}')">
              <i class="fa-solid fa-cloud-arrow-up"></i>
            </button>
            <button type="button" class="btn-table-action btn-danger-action" title="Hapus Data Surat Masuk Ini" onclick="openDeleteModalMasuk('${item.id}')">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  if (infoText) {
    infoText.textContent = `Menampilkan ${start + 1} - ${end} dari ${total} surat masuk`;
  }

  if (btnContainer) {
    let btnsHtml = "";
    btnsHtml += `<button class="pagination-btn" ${page <= 1 ? "disabled" : ""} onclick="changeMasukPage(${page - 1})"><i class="fa-solid fa-chevron-left"></i></button>`;

    for (let p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || (p >= page - 1 && p <= page + 1)) {
        btnsHtml += `<button class="pagination-btn ${p === page ? "active" : ""}" onclick="changeMasukPage(${p})">${p}</button>`;
      } else if (p === page - 2 || p === page + 2) {
        btnsHtml += `<span style="padding: 0 4px; color: #94a3b8;">...</span>`;
      }
    }

    btnsHtml += `<button class="pagination-btn" ${page >= totalPages ? "disabled" : ""} onclick="changeMasukPage(${page + 1})"><i class="fa-solid fa-chevron-right"></i></button>`;
    btnContainer.innerHTML = btnsHtml;
  }
}

/**
 * Update Dashboard Header Counters & Stat Cards
 */
function updateDashboardUI() {
  const countKeluar = state.suratKeluar.length;
  const countMasuk = state.suratMasuk.length;

  const keluarBadge = document.getElementById("countKeluarBadge");
  const masukBadge = document.getElementById("countMasukBadge");
  const statKeluarTotal = document.getElementById("statKeluarTotal");
  const statMasukTotal = document.getElementById("statMasukTotal");

  if (keluarBadge) keluarBadge.textContent = countKeluar;
  if (masukBadge) masukBadge.textContent = countMasuk;
  if (statKeluarTotal) statKeluarTotal.textContent = countKeluar;
  if (statMasukTotal) statMasukTotal.textContent = countMasuk;

  const currentMonthIdx = new Date().getMonth() + 1;
  const currentRoman = ROMAN_MONTHS[currentMonthIdx - 1];
  const bulanIniCount = state.suratKeluar.filter(s => getItemMonth(s) === currentMonthIdx).length;
  const statBulanIni = document.getElementById("statKeluarBulanIni");
  const statBulanLabel = document.getElementById("statKeluarBulanLabel");

  if (statBulanIni) statBulanIni.textContent = bulanIniCount;
  if (statBulanLabel) statBulanLabel.textContent = `Bulan ${MONTH_NAMES[currentMonthIdx - 1]} 2026`;

  const yayasanCount = state.suratMasuk.filter(m => m.dari.toUpperCase().includes("YAYASAN")).length;
  const statYayasan = document.getElementById("statMasukYayasanCount");
  if (statYayasan) statYayasan.textContent = yayasanCount;

  if (state.suratMasuk.length > 0) {
    const lastM = state.suratMasuk[state.suratMasuk.length - 1];
    const statMLastNo = document.getElementById("statMasukLastNumber");
    const statMLastDate = document.getElementById("statMasukLastDate");
    if (statMLastNo) statMLastNo.textContent = lastM.noAgenda ? lastM.noAgenda.substring(0, 18) + "..." : "-";
    if (statMLastDate) statMLastDate.textContent = lastM.tglMasuk || lastM.tglSurat || "-";
  }
}

/**
 * Update semua link Google Drive di UI agar membuka folder yang sesuai
 */
function updateDriveLinksInUI() {
  const keluarLinks = [
    document.getElementById("btnHeaderDriveKeluar"),
    document.getElementById("topNavDriveKeluarBtn"),
    document.getElementById("navDriveMainLink"),
    document.getElementById("btnTestOpenDriveKeluar")
  ];
  keluarLinks.forEach(el => {
    if (el && state.driveKeluarUrl) {
      el.href = state.driveKeluarUrl;
    }
  });

  const masukLinks = [
    document.getElementById("btnHeaderDriveMasuk"),
    document.getElementById("btnTestOpenDriveMasuk")
  ];
  masukLinks.forEach(el => {
    if (el && state.driveMasukUrl) {
      el.href = state.driveMasukUrl;
    }
  });
}

/**
 * Tampilkan / sembunyikan banner status Google Apps Script di tab Generator
 */
function checkConnectionBanners() {
  const bannerWarning = document.getElementById("bannerConnWarning");
  const bannerSuccess = document.getElementById("bannerConnSuccess");

  if (state.appsScriptUrl) {
    if (bannerWarning) bannerWarning.style.display = "none";
    if (bannerSuccess) bannerSuccess.style.display = "flex";
  } else {
    if (bannerWarning) bannerWarning.style.display = "flex";
    if (bannerSuccess) bannerSuccess.style.display = "none";
  }
}

/**
 * Handle Penyimpanan Surat Keluar Baru (Termasuk File Upload ke Google Drive)
 */

/**
 * Helper: Bersihkan dan validasi URL Web App Google Apps Script
 * Otomatis memperbaiki URL /dev menjadi /exec dan menghapus spasi
 */
function getCleanAppsScriptUrl() {
  let url = (state.appsScriptUrl || "").trim();
  if (url.endsWith("/dev")) {
    url = url.substring(0, url.length - 4) + "/exec";
    state.appsScriptUrl = url;
    localStorage.setItem("sma_ywka_apps_script_url", url);
  }
  return url;
}

/**
 * Helper Terpusat: Kirim permintaan POST ke Google Apps Script dengan penanganan CORS & Redirect
 */
async function postToAppsScript(payload) {
  const url = getCleanAppsScriptUrl();
  if (!url) {
    return { success: false, message: "URL Web App belum disetel di pengaturan." };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow"
    });

    const resText = await res.text();
    let resJson = null;
    try {
      resJson = JSON.parse(resText);
    } catch (parseErr) {
      if (resText.includes("ServiceLogin") || resText.includes("accounts.google.com")) {
        return { success: false, message: "Akses Google Apps Script harus diatur ke 'Anyone' (Siapa saja)." };
      }
      if (resText.includes("Halaman Tidak Ditemukan") || resText.includes("tidak ada")) {
        return { success: false, message: "URL Web App 404 (Tidak Ditemukan). Lakukan New Deployment di Apps Script." };
      }
      return { success: false, message: "Respons bukan format JSON (" + resText.substring(0, 50) + ")." };
    }

    if (resJson && resJson.status === "success") {
      return { success: true, data: resJson };
    } else {
      return { success: false, message: (resJson && resJson.message) || "Gagal diproses oleh Google Apps Script." };
    }
  } catch (netErr) {
    console.warn("Gagal komunikasi dengan Apps Script:", netErr);
    const msg = String(netErr && netErr.message ? netErr.message : netErr);
    if (msg.toLowerCase().includes("failed to fetch") || msg.toLowerCase().includes("networkerror")) {
      return {
        success: false,
        message: "Koneksi terblokir (Failed to fetch). Pastikan deployment Apps Script disetel dengan akses 'Anyone' (Siapa saja) dan URL berakhiran /exec."
      };
    }
    return { success: false, message: msg || "Koneksi terputus." };
  }
}

/**
 * Otomatis sinkronkan semua surat lokal yang belum tersimpan ke Google Sheets
 */
async function syncAllPendingItems() {
  if (!state.appsScriptUrl) return;

  const unsyncedMasuk = JSON.parse(localStorage.getItem("unsynced_surat_masuk") || "[]");
  const unsyncedKeluar = JSON.parse(localStorage.getItem("unsynced_surat_keluar") || "[]");

  if (unsyncedMasuk.length === 0 && unsyncedKeluar.length === 0) return;

  let syncedCount = 0;

  if (unsyncedMasuk.length > 0) {
    const remaining = [];
    for (const item of unsyncedMasuk) {
      const payload = {
        action: "create_surat_masuk",
        no_urut: item.noUrut,
        no_agenda: item.noAgenda,
        tanggal_surat: item.tglSurat,
        tanggal_diterima: item.tglMasuk,
        perihal: item.perihal,
        dari: item.dari,
        kepada: item.kepada,
        keterangan: item.keterangan || "",
        kode_klasifikasi: item.kodeKlasifikasi || ""
      };
      const res = await postToAppsScript(payload);
      if (res && res.success) {
        syncedCount++;
        item.isUnsynced = false;
      } else {
        remaining.push(item);
      }
    }
    localStorage.setItem("unsynced_surat_masuk", JSON.stringify(remaining));
  }

  if (unsyncedKeluar.length > 0) {
    const remaining = [];
    for (const item of unsyncedKeluar) {
      const payload = {
        action: "create_surat_keluar",
        no_urut: item.noAgenda,
        kode_klasifikasi: item.kodeKlasifikasi,
        nomor_urut: item.noAgenda,
        bulan_romawi: item.bulanRomawi,
        tahun: "2026",
        tanggal_surat: item.tanggal,
        perihal: item.perihal,
        dari: item.dari,
        kepada: item.kepada,
        petugas: item.petugas,
        keterangan: item.keterangan || ""
      };
      const res = await postToAppsScript(payload);
      if (res && res.success) {
        syncedCount++;
        item.isUnsynced = false;
      } else {
        remaining.push(item);
      }
    }
    localStorage.setItem("unsynced_surat_keluar", JSON.stringify(remaining));
  }

  if (syncedCount > 0) {
    showToast(`✅ Berhasil menyinkronkan ${syncedCount} surat tersimpan lokal langsung ke Google Spreadsheet!`, "success");
    loadDataFromSpreadsheet().catch(() => { });
  }
}

async function handleCreateSuratKeluar(e) {
  e.preventDefault();

  const btnSubmit = document.getElementById("btnSubmitToSheets");
  const origBtnContent = btnSubmit.innerHTML;
  btnSubmit.disabled = true;
  btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan & Mengunggah...`;

  const selKode = document.getElementById("genKodeKlasifikasi");
  const customKode = document.getElementById("genCustomKode");
  const txtNoAgenda = document.getElementById("genNomorUrut");
  const dtTgl = document.getElementById("genTanggalSurat");
  const txtPerihal = document.getElementById("genPerihal");
  const txtKepada = document.getElementById("genKepada");
  const txtDari = document.getElementById("genDari");
  const txtPetugas = document.getElementById("genPetugas");
  const txtKet = document.getElementById("genKeterangan");

  let kode = selKode.value === "custom" ? customKode.value.trim() : selKode.value;
  let noAgenda = txtNoAgenda.value.trim() || state.nextKeluarAgenda || "609";

  let romanMonth = "X";
  let tahun = "2026";
  if (dtTgl.value) {
    const parts = dtTgl.value.split("-");
    tahun = parts[0];
    romanMonth = ROMAN_MONTHS[parseInt(parts[1], 10) - 1] || "X";
  }

  const fullNumber = `${kode}/${noAgenda}/SMA YWKA/TU/${romanMonth}/${tahun}`.replace(/\/{2,}/g, "/");

  // Baca file staged jika ada
  let fileBase64 = "";
  let fileName = "";
  let fileMime = "";
  if (state.stagedFileKeluar) {
    try {
      fileBase64 = await readFileAsBase64(state.stagedFileKeluar);
      fileName = state.stagedFileKeluar.name;
      fileMime = state.stagedFileKeluar.type;
    } catch (err) {
      console.warn("Gagal membaca file upload:", err);
    }
  }

  // No. Urut mengikuti No. Agenda sesuai permintaan pengguna!
  const formattedTanggal = formatDateIndo(dtTgl.value);

  const payload = {
    action: "create_surat_keluar",
    no_agenda: noAgenda,
    no_urut: noAgenda,
    kode_klasifikasi: kode,
    nomor_urut: noAgenda,
    bulan_romawi: romanMonth,
    tahun: tahun,
    tanggal_surat: formattedTanggal,
    perihal: txtPerihal.value.trim(),
    dari: txtDari.value.trim(),
    kepada: txtKepada.value.trim(),
    petugas: txtPetugas.value.trim(),
    keterangan: txtKet.value.trim(),
    fileBase64: fileBase64,
    fileName: fileName,
    fileMime: fileMime
  };

  const newItem = {
    id: "K-" + Date.now(),
    noUrut: noAgenda, // No. Urut mengikuti No. Agenda
    status: true,
    isUnsynced: !state.appsScriptUrl,
    kodeKlasifikasi: kode,
    noAgenda: noAgenda,
    nomorLengkap: fullNumber,
    bulanRomawi: romanMonth,
    tanggal: formattedTanggal,
    perihal: payload.perihal,
    dari: payload.dari,
    kepada: payload.kepada,
    petugas: payload.petugas,
    keterangan: payload.keterangan,
    lampiran: fileName ? "Tersimpan di Drive (" + fileName + ")" : "Surat Keluar",
    driveUrl: ""
  };

  // Jika URL Apps Script belum diisi di browser ini, munculkan modal peringatan agar user tahu
  if (!state.appsScriptUrl) {
    state.pendingKeluarData = { payload, newItem, origBtnContent };
    const modalPrompt = document.getElementById("modalAppsScriptPrompt");
    if (modalPrompt) {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = origBtnContent;
      modalPrompt.classList.add("show");
      return;
    }
  }

  await executeSaveSuratKeluar(payload, newItem, origBtnContent);
}

/**
 * Eksekusi penyimpanan Surat Keluar
 */
async function executeSaveSuratKeluar(payload, newItem, origBtnContent) {
  const btnSubmit = document.getElementById("btnSubmitToSheets");
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...`;
  }

  let syncSuccess = false;
  let errorDetail = "";
  if (state.appsScriptUrl) {
    try {
      const res = await fetch(state.appsScriptUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(payload)
      });
      const resText = await res.text();
      let resJson = null;
      try {
        resJson = JSON.parse(resText);
      } catch (e) {
        if (resText.includes("tidak ada") || resText.includes("Halaman Tidak Ditemukan")) {
          errorDetail = "URL Web App 404 (File tidak ditemukan di Google). Perlu Deploy ulang.";
        } else if (resText.includes("ServiceLogin") || resText.includes("accounts.google.com")) {
          errorDetail = "Izin akses harus 'Anyone' (Siapa saja).";
        } else if (resText.includes("ReferenceError")) {
          errorDetail = "Skrip di Apps Script perlu diperbarui ke versi v2.5.";
        }
      }

      if (resJson && resJson.status === "success") {
        if (resJson.drive_file_url) {
          newItem.driveUrl = resJson.drive_file_url;
          newItem.lampiran = resJson.drive_file_url;
        }
        if (resJson.target_row) newItem.rowIndex = resJson.target_row;
        newItem.status = resJson.is_checked !== undefined ? Boolean(resJson.is_checked) : Boolean(newItem.driveUrl);
        syncSuccess = true;
        newItem.isUnsynced = false;
        const returnedVer = parseFloat(resJson.version || "0");
        if (isNaN(returnedVer) || returnedVer < REQUIRED_APPS_SCRIPT_MINOR || (resJson.target_row && Number(resJson.target_row) > 729)) {
          state.appsScriptOutdated = true;
          state.appsScriptVersion = resJson.version ? String(resJson.version) : "Lama (v2.7)";
          renderAppsScriptOutdatedBanner(true, state.appsScriptVersion);
          errorDetail = `Baris mendarat di Baris ${resJson.target_row || "bawah"} karena Web App Apps Script Google Anda masih VERSI LAMA! Update ke v3.9 & Deploy > Kelola deployment > Versi baru.`;
        }
      } else if (resJson && resJson.status === "error") {
        errorDetail = resJson.message || "Apps Script mengembalikan error.";
        newItem.isUnsynced = true;
      } else {
        newItem.isUnsynced = true;
      }
    } catch (err) {
      console.error("Gagal sync ke Google Apps Script:", err);
      errorDetail = "Koneksi ke Apps Script terputus atau diblokir browser.";
      newItem.isUnsynced = true;
    }
  } else {
    newItem.isUnsynced = true;
  }

  // Simpan draft ke unsynced_surat_keluar jika belum sync ke Google Sheets
  if (newItem.isUnsynced) {
    const unsyncedList = JSON.parse(localStorage.getItem("unsynced_surat_keluar") || "[]");
    unsyncedList.unshift(newItem);
    localStorage.setItem("unsynced_surat_keluar", JSON.stringify(unsyncedList));
  } else {
    const unsyncedList = JSON.parse(localStorage.getItem("unsynced_surat_keluar") || "[]");
    const updated = unsyncedList.filter(x => !(x.noAgenda === newItem.noAgenda && x.perihal === newItem.perihal));
    localStorage.setItem("unsynced_surat_keluar", JSON.stringify(updated));
  }

  // Tambahkan ke state utama di posisi paling atas
  state.suratKeluar.unshift(newItem);
  localStorage.setItem("cache_surat_keluar_2026", JSON.stringify(state.suratKeluar));

  if (btnSubmit) {
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = origBtnContent;
  }

  // Bersihkan staged file
  state.stagedFileKeluar = null;
  const fileInputKeluar = document.getElementById("genUploadDriveFile");
  if (fileInputKeluar) fileInputKeluar.value = "";
  const contentKeluar = document.getElementById("dropzoneContentKeluar");
  const previewKeluar = document.getElementById("filePreviewKeluar");
  if (contentKeluar) contentKeluar.style.display = "flex";
  if (previewKeluar) previewKeluar.style.display = "none";

  calculateNextSequence();
  filterSuratKeluarData();
  updateDashboardUI();

  if (syncSuccess) {
    if (errorDetail) {
      showToast(`⚠️ ${errorDetail}`, "warning");
    } else {
      showToast(`✅ No. Agenda ${newItem.noAgenda} berhasil tersimpan ke Baris ${newItem.rowIndex || "template"} Google Spreadsheet & Drive!`, "success");
    }
  } else if (!state.appsScriptUrl) {
    showToast(`⚠️ No. Agenda ${newItem.noAgenda} tersimpan aman di browser. Hubungkan Web App URL di Pengaturan agar tersinkron ke Google Sheets.`, "warning");
  } else {
    showToast(`⚠️ Gagal menyambung ke Apps Script: ${errorDetail || "Periksa Web App URL di Pengaturan"}. Data tetap aman di browser Anda.`, "warning");
  }

  // Tampilkan Lembar Disposisi
  openDisposisiModal({
    tipe: "Surat Keluar",
    noUrut: newItem.noAgenda,
    noLengkap: newItem.nomorLengkap,
    tanggal: newItem.tanggal,
    perihal: newItem.perihal,
    kepada: newItem.kepada,
    dari: newItem.dari,
    petugas: newItem.petugas
  });
}

/**
 * Helper: Menghitung Nomor Urut Buku Agenda Surat Masuk berikutnya (setelah nomor terakhir yang terisi, misal 209 -> 210)
 */
function getNextNoUrutMasuk() {
  if (!state.suratMasuk || state.suratMasuk.length === 0) return 218;
  let max = 0;
  state.suratMasuk.forEach(s => {
    if (s.perihal || (s.noAgenda && s.noAgenda !== "-" && !/^\d+$/.test(s.noAgenda))) {
      const n = parseInt(s.noUrut, 10);
      if (!isNaN(n) && n > max) max = n;
    }
  });
  // Sesuai data asli SMA YWKA, surat masuk terakhir yang tercatat adalah 217 (Surat Permintaan Data Pendukung 205/DITDIK)
  if (max < 217) max = 217;
  return max + 1;
}
window.getNextNoUrutMasuk = getNextNoUrutMasuk;

/**
 * Buka modal input surat masuk dengan otomatis mengisi no. urut berikutnya & tanggal hari ini
 */
function openCreateModalMasuk() {
  const modalMasuk = document.getElementById("modalSuratMasuk");
  if (!modalMasuk) return;
  const inUrut = document.getElementById("inMasukNoUrut");
  if (inUrut) {
    inUrut.value = getNextNoUrutMasuk();
  }
  const masukTglInput = document.getElementById("inMasukTglSurat");
  const masukTerimaInput = document.getElementById("inMasukTglDiterima");
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const formattedToday = `${yyyy}-${mm}-${dd}`;
  if (masukTglInput && !masukTglInput.value) masukTglInput.value = formattedToday;
  if (masukTerimaInput && !masukTerimaInput.value) masukTerimaInput.value = formattedToday;
  updateDateBadgePreview("inMasukTglSurat", "previewInMasukTglSurat");
  updateDateBadgePreview("inMasukTglDiterima", "previewInMasukTglDiterima");

  // Inisialisasi dropdown pengirim default (CABANG DINAS WIL.VII sesuai template spreadsheet)
  const inMasukDari = document.getElementById("inMasukDari");
  const inMasukDariCustomGroup = document.getElementById("inMasukDariCustomGroup");
  const inMasukDariCustom = document.getElementById("inMasukDariCustom");
  if (inMasukDari) inMasukDari.value = "CABANG DINAS WIL.VII";
  if (inMasukDariCustomGroup) inMasukDariCustomGroup.style.display = "none";
  if (inMasukDariCustom) inMasukDariCustom.value = "";

  modalMasuk.classList.add("show");
}
window.openCreateModalMasuk = openCreateModalMasuk;

/**
 * Handle Penyimpanan Surat Masuk Baru
 */
async function handleCreateSuratMasuk(e) {
  e.preventDefault();

  const btnSubmit = e.target.querySelector('button[type="submit"]') || document.getElementById("btnSaveSuratMasuk");
  const origBtnContent = btnSubmit ? btnSubmit.innerHTML : "";
  if (btnSubmit) {
    if (btnSubmit.disabled) return;
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan ke Spreadsheet & Drive...`;
  }

  try {
    const inNoUrut = document.getElementById("inMasukNoUrut")?.value.trim() || String(getNextNoUrutMasuk());
    const noAgenda = document.getElementById("inMasukNoAgenda")?.value.trim() || "";
    const tglSurat = document.getElementById("inMasukTglSurat")?.value || "";
    const tglTerima = document.getElementById("inMasukTglDiterima")?.value || "";
    const perihal = document.getElementById("inMasukPerihal")?.value.trim() || "";

    // Ambil instansi pengirim dari dropdown atau input kustom
    const selDari = document.getElementById("inMasukDari");
    const customDari = document.getElementById("inMasukDariCustom");
    let dari = (selDari?.value || "").trim();
    if (dari === "__CUSTOM__") {
      dari = (customDari?.value || "").trim() || "LAIN-LAIN";
    }
    if (!dari) dari = "CABANG DINAS WIL.VII";

    const kepada = document.getElementById("inMasukKepada")?.value.trim() || "SMA YWKA";
    const disposisi = document.getElementById("inMasukDisposisi")?.value.trim() || "";
    const kodeKlas = document.getElementById("inMasukKodeKlasifikasi")?.value || "";

    // Cegah duplikasi surat masuk yang sama persis
    if (noAgenda && noAgenda !== "-") {
      const exists = state.suratMasuk.some(m => m.noAgenda && m.noAgenda.trim().toLowerCase() === noAgenda.trim().toLowerCase());
      if (exists) {
        showToast(`⚠️ Surat Masuk dengan Nomor "${noAgenda}" sudah ada dalam daftar!`, "warning");
        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.innerHTML = origBtnContent || `<i class="fa-solid fa-floppy-disk"></i> Simpan Surat Masuk`;
        }
        return;
      }
    }

    let fileBase64 = "";
    let fileName = "";
    let fileMime = "";
    if (state.stagedFileMasuk) {
      try {
        const formattedTglSuratForWm = formatDateIndo(tglSurat);
        const fileToUpload = await addWatermarkToPdfFile(state.stagedFileMasuk, inNoUrut, formattedTglSuratForWm || tglSurat || "");
        fileBase64 = await readFileAsBase64(fileToUpload);
        fileName = fileToUpload.name;
        fileMime = fileToUpload.type || "application/pdf";
      } catch (err) {
        console.warn("Gagal membaca file surat masuk:", err);
      }
    }

    const formattedTglSurat = formatDateIndo(tglSurat);
    const formattedTglTerima = formatDateIndo(tglTerima);

    const payload = {
      action: "create_surat_masuk",
      no_urut: inNoUrut,
      no_agenda: noAgenda,
      tanggal_surat: formattedTglSurat,
      tanggal_diterima: formattedTglTerima,
      perihal: perihal,
      dari: dari,
      kepada: kepada,
      kode_klasifikasi: kodeKlas,
      keterangan: disposisi,
      lampiran: fileName ? "Tersimpan di Drive (" + fileName + ")" : "Surat Masuk",
      fileBase64: fileBase64,
      fileName: fileName,
      fileMime: fileMime
    };

    const newItem = {
      id: "M-" + Date.now(),
      noUrut: inNoUrut,
      isUnsynced: !state.appsScriptUrl,
      noAgenda: noAgenda,
      tglSurat: formattedTglSurat,
      tglMasuk: formattedTglTerima,
      perihal: perihal,
      dari: dari,
      kepada: kepada,
      kodeKlasifikasi: kodeKlas,
      keterangan: disposisi,
      lampiran: payload.lampiran,
      driveUrl: ""
    };

    // Jika Web App URL belum diatur, buka prompt agar user diarahkan
    if (!state.appsScriptUrl) {
      state.pendingMasukData = { type: "create", payload, newItem, origBtnContent };
      const modalPrompt = document.getElementById("modalAppsScriptPrompt");
      if (modalPrompt) {
        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.innerHTML = origBtnContent;
        }
        modalPrompt.classList.add("show");
        return;
      }
    }

    await executeSaveSuratMasuk(payload, newItem, origBtnContent);
  } catch (err) {
    console.error("Error creating surat masuk:", err);
    showToast("Terjadi kesalahan saat memproses data surat masuk: " + err.message, "error");
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = origBtnContent;
    }
  }
}

/**
 * Eksekusi simpan surat masuk langsung ke Google Sheets & Drive
 */
async function executeSaveSuratMasuk(payload, newItem, origBtnContent) {
  const btnSubmit = document.getElementById("btnSaveSuratMasuk");
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan ke Spreadsheet & Drive...`;
  }

  let syncSuccess = false;
  let errorMsg = "";

  if (state.appsScriptUrl) {
    const res = await postToAppsScript(payload);
    if (res && res.success) {
      syncSuccess = true;
      if (res.data.no_urut) {
        newItem.noUrut = String(res.data.no_urut);
      }
      if (res.data.drive_file_url) {
        newItem.driveUrl = res.data.drive_file_url;
        newItem.lampiran = res.data.drive_file_url;
      }
      newItem.isUnsynced = false;
    } else {
      errorMsg = res.message || "Gagal menyimpan ke Spreadsheet";
      newItem.isUnsynced = true;
    }
  }

  if (newItem.isUnsynced) {
    const unsyncedList = JSON.parse(localStorage.getItem("unsynced_surat_masuk") || "[]");
    unsyncedList.unshift(newItem);
    localStorage.setItem("unsynced_surat_masuk", JSON.stringify(unsyncedList));
  }

  state.suratMasuk.push(newItem);
  state.suratMasuk.sort((a, b) => (parseInt(a.noUrut, 10) || 0) - (parseInt(b.noUrut, 10) || 0));
  localStorage.setItem("cache_surat_masuk_2026", JSON.stringify(state.suratMasuk));

  const modalMasuk = document.getElementById("modalSuratMasuk");
  if (modalMasuk) modalMasuk.classList.remove("show");

  state.stagedFileMasuk = null;
  const fileInputMasuk = document.getElementById("inMasukUploadDrive");
  if (fileInputMasuk) fileInputMasuk.value = "";
  const contentMasuk = document.getElementById("dropzoneContentMasuk");
  const previewMasuk = document.getElementById("filePreviewMasuk");
  if (contentMasuk) contentMasuk.style.display = "flex";
  if (previewMasuk) previewMasuk.style.display = "none";

  filterSuratMasukData();
  updateDashboardUI();

  if (btnSubmit) {
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = origBtnContent || `<i class="fa-solid fa-floppy-disk"></i> Simpan Surat Masuk`;
  }

  if (syncSuccess) {
    showToast(`✅ Surat Masuk no. urut ${newItem.noUrut} ("${newItem.noAgenda}") tersimpan langsung di Spreadsheet & Drive!`, "success");
    // Otomatis refresh data dari Google Sheets agar website dan spreadsheet 100% sinkron
    loadDataFromSpreadsheet().catch(err => console.warn(err));
  } else if (!state.appsScriptUrl) {
    showToast(`⚠️ Surat Masuk tersimpan di browser. Masukkan Web App URL di Pengaturan agar tersimpan ke Spreadsheet.`, "warning");
  } else {
    showToast(`⚠️ Surat Masuk tersimpan lokal (${errorMsg}). Periksa deployment Apps Script Anda.`, "warning");
  }

  const formMasuk = document.getElementById("formInputSuratMasuk");
  if (formMasuk) formMasuk.reset();
  initDateDefaults();
}

/**
 * Render Statistik
 */
function renderStatistics() {
  const klasMap = {};
  state.suratKeluar.forEach(item => {
    const k = item.kodeKlasifikasi || "421.3";
    klasMap[k] = (klasMap[k] || 0) + 1;
  });

  const klasContainer = document.getElementById("statKlasifikasiBars");
  if (klasContainer) {
    const total = state.suratKeluar.length || 1;
    let html = "";
    Object.keys(klasMap).sort((a, b) => klasMap[b] - klasMap[a]).forEach(k => {
      const count = klasMap[k];
      const pct = Math.round((count / total) * 100);
      html += `
        <div class="bar-item">
          <div class="bar-label-group">
            <span>Kode <strong>${escapeHtml(k)}</strong></span>
            <span>${count} surat (${pct}%)</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill bar-fill-blue" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    });
    klasContainer.innerHTML = html;
  }

  const pengirimMap = {};
  state.suratMasuk.forEach(item => {
    let p = item.dari || "Lain-lain";
    if (p.toUpperCase().includes("CADISDIK")) p = "Cabang Dinas (Cadisdik Wil. VII)";
    else if (p.toUpperCase().includes("YAYASAN")) p = "Yayasan Wanita Kereta Api";
    else if (p.toUpperCase().includes("DINAS PENDIDIKAN")) p = "Dinas Pendidikan Provinsi";
    else if (p.toUpperCase().includes("UNIVERSITAS") || p.toUpperCase().includes("INSTITUT")) p = "Universitas / Perguruan Tinggi";
    pengirimMap[p] = (pengirimMap[p] || 0) + 1;
  });

  const pengirimContainer = document.getElementById("statPengirimBars");
  if (pengirimContainer) {
    const totalM = state.suratMasuk.length || 1;
    let html = "";
    Object.keys(pengirimMap).sort((a, b) => pengirimMap[b] - pengirimMap[a]).slice(0, 5).forEach(p => {
      const count = pengirimMap[p];
      const pct = Math.round((count / totalM) * 100);
      html += `
        <div class="bar-item">
          <div class="bar-label-group">
            <span><strong>${escapeHtml(p)}</strong></span>
            <span>${count} surat (${pct}%)</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill bar-fill-emerald" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    });
    pengirimContainer.innerHTML = html;
  }

  const tbodyRecap = document.getElementById("tbodyMonthlyRecap");
  if (tbodyRecap) {
    let recapHtml = "";
    MONTH_NAMES.forEach((mName, idx) => {
      const targetMonth = idx + 1;
      const roman = ROMAN_MONTHS[idx];
      const kCount = state.suratKeluar.filter(s => getItemMonth(s) === targetMonth).length;
      const mCount = state.suratMasuk.filter(m => getItemMonth(m) === targetMonth).length;

      recapHtml += `
        <tr>
          <td><strong>${mName}</strong></td>
          <td><span class="code-pill">${roman}</span></td>
          <td>${kCount} surat</td>
          <td>${mCount} surat</td>
          <td><strong>${kCount + mCount} surat</strong></td>
        </tr>
      `;
    });
    tbodyRecap.innerHTML = recapHtml;
  }
}

/**
 * Buka Modal Disposisi
 */
let currentPrintData = null;

/**
 * Konversi URL Google Drive ke format Preview Embed Resmi
 */
function getGoogleDriveEmbedUrl(url) {
  if (!url) return "";
  const str = String(url).trim();
  const match = str.match(/\/d\/([a-zA-Z0-9_-]+)/) || str.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return "https://drive.google.com/file/d/" + match[1] + "/preview";
  }
  return str;
}

/**
 * Ganti Tab pada Modal Pratinjau & Cetak Surat
 */
function switchPrintTab(tabName) {
  const tabBtnDisposisi = document.getElementById("tabBtnDisposisi");
  const tabBtnBerkas = document.getElementById("tabBtnBerkasDrive");
  const contentDisposisi = document.getElementById("printTabDisposisiContent");
  const contentBerkas = document.getElementById("printTabBerkasContent");
  const btnPrintFileFooter = document.getElementById("btnPrintFileFooter");

  if (tabName === "berkas") {
    if (tabBtnDisposisi) tabBtnDisposisi.classList.remove("active");
    if (tabBtnBerkas) tabBtnBerkas.classList.add("active");
    if (contentDisposisi) contentDisposisi.style.display = "none";
    if (contentBerkas) contentBerkas.style.display = "block";
    if (btnPrintFileFooter && currentPrintData && currentPrintData.hasFile) {
      btnPrintFileFooter.style.display = "inline-flex";
    }
  } else {
    if (tabBtnDisposisi) tabBtnDisposisi.classList.add("active");
    if (tabBtnBerkas) tabBtnBerkas.classList.remove("active");
    if (contentDisposisi) contentDisposisi.style.display = "block";
    if (contentBerkas) contentBerkas.style.display = "none";
    if (btnPrintFileFooter) btnPrintFileFooter.style.display = "none";
  }
}

/**
 * Buka Modal Pratinjau & Cetak Surat (Mendukung Lembar Disposisi & Berkas Drive Tanpa Perlu ke Drive)
 */
function openDirectPrint(id, type = "keluar", initialTab = "disposisi") {
  const item = (type === "masuk")
    ? state.suratMasuk.find(m => m.id === id)
    : state.suratKeluar.find(s => s.id === id);

  if (!item) {
    showToast("Data surat tidak ditemukan!", "error");
    return;
  }

  const modal = document.getElementById("modalDisposisi");
  if (!modal) return;

  const isMasuk = (type === "masuk");
  const rawFileUrl = getDriveLinkHref(item, type);
  const hasFile = hasDriveFileAttached(item);

  currentPrintData = { item, type, hasFile, rawFileUrl };

  // 1. Tampilkan Data pada Tab 1: Lembar Disposisi
  const dispTipe = document.getElementById("dispTipeSurat");
  const dispUrut = document.getElementById("dispNoUrut");
  const dispLengkap = document.getElementById("dispNoLengkap");
  const dispTgl = document.getElementById("dispTglSurat");
  const dispPetugas = document.getElementById("dispPetugas");
  const dispDari = document.getElementById("dispDari");
  const dispKepada = document.getElementById("dispKepada");
  const dispPerihal = document.getElementById("dispPerihal");

  if (dispTipe) dispTipe.textContent = isMasuk ? "Surat Masuk" : "Surat Keluar";
  if (dispUrut) dispUrut.textContent = isMasuk ? (item.noUrut || item.noAgenda || "-") : (item.noAgenda || item.noUrut || "-");
  if (dispLengkap) dispLengkap.textContent = isMasuk ? (item.noAgenda || "-") : (item.nomorLengkap || "-");
  if (dispTgl) dispTgl.textContent = isMasuk
    ? (item.tglSurat + (item.tglMasuk ? " (Diterima: " + item.tglMasuk + ")" : ""))
    : (item.tanggal || "-");
  if (dispPetugas) dispPetugas.textContent = isMasuk ? (item.keterangan || "-") : (item.petugas || "-");
  if (dispDari) dispDari.textContent = item.dari || "-";
  if (dispKepada) dispKepada.textContent = item.kepada || "-";
  if (dispPerihal) dispPerihal.textContent = item.perihal || "-";

  // Stempel Arsip Fisik — hanya tampil untuk Surat Masuk
  const arsipStamp = document.getElementById("arsipStamp");
  const arsipStampNo = document.getElementById("arsipStampNo");
  const arsipStampTgl = document.getElementById("arsipStampTgl");
  if (arsipStamp) {
    if (isMasuk) {
      const noDisplay = item.noUrut || item.noAgenda || "-";
      const tglDisplay = formatDateIndo(item.tglSurat || item.tglMasuk || "-");
      if (arsipStampNo) arsipStampNo.textContent = noDisplay;
      if (arsipStampTgl) arsipStampTgl.textContent = tglDisplay;
      arsipStamp.style.display = "block";
    } else {
      arsipStamp.style.display = "none";
    }
  }

  // 2. Banner Informasi Berkas Google Drive
  const bannerDrive = document.getElementById("dispDriveBanner");
  const linkDrive = document.getElementById("dispDriveLink");
  if (bannerDrive && linkDrive) {
    if (hasFile && rawFileUrl.includes("http")) {
      linkDrive.href = rawFileUrl;
      bannerDrive.style.display = "flex";
    } else {
      bannerDrive.style.display = "none";
    }
  }

  // 3. Buka modal
  modal.classList.add("show");
}

/**
 * Buka langsung tab cetak berkas lampiran
 */
function openDirectPrintFile(id, type) {
  openDirectPrint(id, type, "berkas");
}

/**
 * Eksekusi Cetak Berkas Lampiran / Scan Surat (Tanpa Navigasi ke Google Drive)
 */
function executePrintAttachedFile() {
  if (!currentPrintData || !currentPrintData.item) {
    showToast("Data surat tidak valid!", "error");
    return;
  }
  const item = currentPrintData.item;
  const rawUrl = currentPrintData.rawFileUrl;

  if (!rawUrl) {
    showToast("Surat ini belum memiliki berkas lampiran untuk dicetak!", "warning");
    return;
  }

  // 1. Jika berkas lokal base64 / blob
  if (rawUrl.startsWith("data:") || rawUrl.startsWith("blob:")) {
    const printWin = window.open("", "_blank");
    if (printWin) {
      printWin.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Cetak Berkas - ${escapeHtml(item.perihal || "Surat")}</title>
            <style>
              body { margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; background: #fff; }
              img { max-width: 100%; height: auto; }
              embed, iframe { width: 100vw; height: 100vh; border: none; }
            </style>
          </head>
          <body>
            ${rawUrl.includes("application/pdf") ? `<embed src="${rawUrl}" type="application/pdf" />` : `<img src="${rawUrl}" onload="window.print();" />`}
          </body>
        </html>
      `);
      printWin.document.close();
      printWin.focus();
      return;
    }
  }

  // 2. Jika berkas Google Drive: Coba cetak melalui iframe
  const iframe = document.getElementById("printIframeViewer");
  if (iframe && iframe.contentWindow) {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      return;
    } catch (err) {
      console.warn("Iframe direct print cross-origin restricted, opening clean print preview popup:", err);
    }
  }

  // 3. Fallback: Buka pop-up preview bersih khusus cetak
  const embedUrl = getGoogleDriveEmbedUrl(rawUrl);
  const match = String(rawUrl).match(/\/d\/([a-zA-Z0-9_-]+)/) || String(rawUrl).match(/[?&]id=([a-zA-Z0-9_-]+)/);
  const fileId = match ? match[1] : null;
  const targetUrl = fileId ? "https://drive.google.com/file/d/$fileId/view" : rawUrl;
  const printWin = window.open(targetUrl, "_blank");
  if (printWin) {
    printWin.focus();
    showToast("📄 Berkas Google Drive dibuka. Gunakan ikon printer bawaan Google Drive di pojok kanan atas untuk cetak fisik lengkap tanpa lembar kosong.", "info", 5000);
  }
}

/**
 * Buka Modal Disposisi (Kompatibilitas)
 */
function openDisposisiModal(data) {
  const modal = document.getElementById("modalDisposisi");
  if (!modal) return;

  document.getElementById("dispTipeSurat").textContent = data.tipe || "Surat Keluar";
  document.getElementById("dispNoUrut").textContent = data.noUrut || "-";
  document.getElementById("dispNoLengkap").textContent = data.noLengkap || "-";
  document.getElementById("dispTglSurat").textContent = data.tanggal || "-";
  document.getElementById("dispPetugas").textContent = data.petugas || "-";
  document.getElementById("dispDari").textContent = data.dari || "-";
  document.getElementById("dispKepada").textContent = data.kepada || "-";
  document.getElementById("dispPerihal").textContent = data.perihal || "-";

  const badgeHasFile = document.getElementById("badgePrintHasFile");
  if (badgeHasFile) {
    badgeHasFile.className = "badge-tab-pill no-file";
    badgeHasFile.innerHTML = '<i class="fa-solid fa-circle-info"></i> Lembar Disposisi';
  }
  switchPrintTab("disposisi");
  modal.classList.add("show");
}

function viewDisposisiKeluar(id) {
  openDirectPrint(id, "keluar", "disposisi");
}

function viewDisposisiMasuk(id) {
  openDirectPrint(id, "masuk", "disposisi");
}

function changeKeluarPage(newPage) {
  state.pagination.keluarPage = newPage;
  renderSuratKeluarTable();
}

function changeMasukPage(newPage) {
  state.pagination.masukPage = newPage;
  renderSuratMasukTable();
}

function copyText(txt) {
  navigator.clipboard.writeText(txt);
  showToast(`Tersalin: ${txt}`, "success");
}

function exportToCsv(dataArray, filename) {
  if (!dataArray || !dataArray.length) {
    showToast("Tidak ada data untuk diunduh!", "warning");
    return;
  }
  const headers = Object.keys(dataArray[0]);
  const csvRows = [headers.join(",")];
  dataArray.forEach(item => {
    const values = headers.map(header => {
      const val = item[header] === undefined || item[header] === null ? "" : String(item[header]);
      return `"${val.replace(/"/g, '""')}"`;
    });
    csvRows.push(values.join(","));
  });
  const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`File ${filename} berhasil diunduh!`, "success");
}

function updateConnectionStatus(isConnected, message) {
  const dot = document.getElementById("statusDot");
  const text = document.getElementById("statusText");
  const syncTime = document.getElementById("lastSyncTime");

  if (dot) {
    dot.className = "status-dot " + (isConnected ? "connected" : "connecting");
  }
  if (text) text.textContent = message;
  if (syncTime) {
    const now = new Date();
    syncTime.textContent = `Sync: ${now.toLocaleTimeString("id-ID")}`;
  }
}

function setLoadingState(isLoading) {
  state.isSyncing = isLoading;
  const icon = document.getElementById("refreshIcon");
  if (icon) {
    if (isLoading) icon.classList.add("fa-spin");
    else icon.classList.remove("fa-spin");
  }
}

function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  let iconName = "circle-info";
  if (type === "success") iconName = "circle-check";
  else if (type === "error") iconName = "triangle-exclamation";
  else if (type === "warning") iconName = "bell";

  toast.innerHTML = `
    <i class="fa-solid fa-${iconName}"></i>
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.4s ease";
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeQuotes(str) {
  if (!str) return "";
  return String(str).replace(/'/g, "\\'");
}

/**
 * Data Bawaan Riil dari Spreadsheet SMA YWKA (Termasuk rekaman No. Agenda 608)
 */
function loadBuiltinSampleData() {
  state.suratKeluar = [
    { id: "K-12", noUrut: "001", status: true, kodeKlasifikasi: "423.1", noAgenda: "001", nomorLengkap: "423.1/001/SMA YWKA/TU/I/2026", bulanRomawi: "I", tanggal: "1/6/2026", perihal: "SK Pengurus OSIS 2026-2027", dari: "Syarif Hasanudin, S.Pd., Gr., M.M.", kepada: "", petugas: "", keterangan: "", lampiran: "Surat Keluar", driveUrl: "" },
    { id: "K-25", noUrut: "014", status: true, kodeKlasifikasi: "422.1", noAgenda: "014", nomorLengkap: "422.1/014/SMA YWKA/TU/I/2026", bulanRomawi: "I", tanggal: "1/14/2026", perihal: "Surat Tugas MOU SPMB SMPN 23 Bandung", dari: "Syarif Hasanudin, S.Pd., Gr., M.M.", kepada: "SMPN 23 Bandung", petugas: "", keterangan: "", lampiran: "Surat Keluar", driveUrl: "" },
    { id: "K-37", noUrut: "026", status: true, kodeKlasifikasi: "421.71", noAgenda: "026", nomorLengkap: "421.71/026/SMA YWKA/TU/I/2026", bulanRomawi: "I", tanggal: "1/15/2026", perihal: "Permohonan Field Trip SMA YWKA PT. KAI", dari: "Syarif Hasanudin, S.Pd., Gr., M.M.", kepada: "PT. KAI", petugas: "BU ELVIRA", keterangan: "", lampiran: "Surat Keluar", driveUrl: "" },
    { id: "K-123", noUrut: "111", status: false, kodeKlasifikasi: "425.11", noAgenda: "111", nomorLengkap: "425.11/111/SMA YWKA/TU/IV/2026", bulanRomawi: "IV", tanggal: "6/4/2026", perihal: "Bu Aam Laporan Perbaikan Gedung", dari: "Syarif Hasanudin, S.Pd., Gr., M.M.", kepada: "Yayasan", petugas: "BU AAM", keterangan: "", lampiran: "Surat Keluar", driveUrl: "" },
    { id: "K-630", noUrut: "599", status: true, kodeKlasifikasi: "421.7", noAgenda: "599", nomorLengkap: "421.7/599/SMA YWKA/TU/X/2026", bulanRomawi: "X", tanggal: "12/10/2026", perihal: "Surat Pemberitahuan Pelatihan Dasar Kepemimpinan Siswa (LDKS)", dari: "Syarif Hasanudin, S.Pd., Gr., M.M.", kepada: "Ketua RT 02", petugas: "Bunda Ade", keterangan: "", lampiran: "Surat Keluar", driveUrl: "" },
    { id: "K-638", noUrut: "607", status: true, kodeKlasifikasi: "421.3", noAgenda: "607", nomorLengkap: "421.3/607/SMA YWKA/TU/X/2026", bulanRomawi: "X", tanggal: "16/10/2026", perihal: "Surat Permohonan Pemberhentian Sementara Distribusi MBG", dari: "Syarif Hasanudin, S.Pd., Gr., M.M.", kepada: "Yayasan", petugas: "Bunda Elvira", keterangan: "", lampiran: "Surat Keluar", driveUrl: "" },
    { id: "K-640", noUrut: "608", status: true, kodeKlasifikasi: "421.3", noAgenda: "608", nomorLengkap: "421.3/608/SMA YWKA/TU/X/2026", bulanRomawi: "X", tanggal: "21/10/2026", perihal: "Surat Dispensasi untuk Siswa yang menjadi Petugas CKG bersama UPTD Puskesmas Garuda", dari: "Syarif Hasanudin, S.Pd., Gr., M.M.", kepada: "UPTD Puskesmas Garuda", petugas: "Bunda Ayu", keterangan: "Dispensasi Petugas CKG", lampiran: "Surat Keluar", driveUrl: "" }
  ];

  state.suratMasuk = [
    { id: "M-12", noUrut: "1", noAgenda: "3025/c7.2/DM.00.02/2025", tglSurat: "02/01/2026", tglMasuk: "31/01/2026", perihal: "Validasi dan Verifikasi Data Daya Listrik dan internet", dari: "BBPMP Provinsi Jawa Barat", kepada: "SMA YWKA", kodeKlasifikasi: "", keterangan: "Kurikulum", lampiran: "Surat Masuk", driveUrl: "" },
    { id: "M-13", noUrut: "2", noAgenda: "129/PK.03.03.01-Cadisdikwil.VII", tglSurat: "08/01/2026", tglMasuk: "31/01/2026", perihal: "Himbauan untuk mengikuti Lomba Baris – Berbaris 1 Sangga Buana Tahun 2026", dari: "CABANG DINAS WIL.VII", kepada: "SMA YWKA", kodeKlasifikasi: "421.7", keterangan: "Kesiswaan", lampiran: "Surat Masuk", driveUrl: "" },
    { id: "M-14", noUrut: "3", noAgenda: "003/DITDIK YWKA/KADIV/I/2026", tglSurat: "08/01/2026", tglMasuk: "08/01/2026", perihal: "Pembinaan guru /meningkatkan kompetensi Guru dan Tenaga Kependidikan", dari: "YAYASAN WANITA KERETA API", kepada: "SMA YWKA", kodeKlasifikasi: "421.3", keterangan: "", lampiran: "Surat Masuk", driveUrl: "" }
  ];
}

/**
 * Buka modal upload Google Drive per baris surat keluar
 */
function openUploadModalKeluar(id) {
  const item = state.suratKeluar.find(s => s.id === id);
  if (!item) {
    showToast("Data surat tidak ditemukan!", "error");
    return;
  }

  const modal = document.getElementById("modalUploadRowDrive");
  const typeLabel = document.getElementById("uploadModalTypeLabel");
  const folderInfo = document.getElementById("uploadModalFolderInfo");
  const targetIdInput = document.getElementById("uploadModalTargetId");
  const targetAgendaInput = document.getElementById("uploadModalTargetAgenda");
  const targetTypeInput = document.getElementById("uploadModalTargetType");
  const targetUrutInput = document.getElementById("uploadModalTargetUrut");
  const targetRowIndexInput = document.getElementById("uploadModalTargetRowIndex");
  const nomorText = document.getElementById("uploadModalNomorLengkap");
  const perihalText = document.getElementById("uploadModalPerihal");
  const fileInput = document.getElementById("inputUploadRowFile");

  if (typeLabel) typeLabel.textContent = "SURAT KELUAR TARGET:";
  if (folderInfo) folderInfo.innerHTML = `<i class="fa-solid fa-folder-tree"></i> Tersimpan otomatis ke folder: <strong>Surat Keluar 2026</strong> & checkbox spreadsheet otomatis diceklis (☑)`;
  if (targetTypeInput) targetTypeInput.value = "keluar";
  if (targetIdInput) targetIdInput.value = item.id;
  const noAgendaVal = item.noAgenda || item.noUrut || "";
  if (targetAgendaInput) targetAgendaInput.value = noAgendaVal;
  if (targetUrutInput) targetUrutInput.value = item.noUrut || noAgendaVal;
  if (targetRowIndexInput) targetRowIndexInput.value = item.rowIndex || "";
  if (nomorText) nomorText.textContent = item.nomorLengkap || `No. Agenda: ${noAgendaVal}`;
  if (perihalText) perihalText.textContent = item.perihal || "-";
  if (fileInput) fileInput.value = "";

  // Deteksi berkas lama di Drive (Skema Pembaruan Bersih)
  const existingUrl = item.driveUrl || (item.lampiran && item.lampiran.startsWith("http") ? item.lampiran : "");
  const existingBox = document.getElementById("uploadModalExistingBox");
  const existingLink = document.getElementById("uploadModalExistingLink");
  const modalTitle = document.getElementById("uploadModalTitleText");
  const btnSubmit = document.getElementById("btnSubmitUploadRowDrive");
  const labelFile = document.getElementById("labelUploadRowFile");

  if (existingUrl) {
    if (existingBox) existingBox.style.display = "block";
    if (existingLink) existingLink.href = existingUrl;
    if (modalTitle) modalTitle.innerHTML = `<i class="fa-solid fa-arrows-rotate text-emerald"></i> Perbarui Berkas Google Drive`;
    if (btnSubmit) btnSubmit.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i> Perbarui Berkas ke Google Drive`;
    if (labelFile) labelFile.innerHTML = `Pilih Berkas Baru Pengganti (PDF / DOCX / Gambar / Scan): <span class="text-danger">*</span>`;
  } else {
    if (existingBox) existingBox.style.display = "none";
    if (modalTitle) modalTitle.innerHTML = `<i class="fa-brands fa-google-drive text-emerald"></i> Upload Berkas ke Google Drive`;
    if (btnSubmit) btnSubmit.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Unggah ke Google Drive`;
    if (labelFile) labelFile.innerHTML = `Pilih Berkas Lampiran Surat (PDF / DOCX / Gambar / Scan): <span class="text-danger">*</span>`;
  }

  if (modal) modal.classList.add("show");
}

/**
 * Buka modal upload Google Drive per baris surat masuk
 */
function openUploadModalMasuk(id) {
  const item = state.suratMasuk.find(m => m.id === id);
  if (!item) {
    showToast("Data surat masuk tidak ditemukan!", "error");
    return;
  }

  const modal = document.getElementById("modalUploadRowDrive");
  const typeLabel = document.getElementById("uploadModalTypeLabel");
  const folderInfo = document.getElementById("uploadModalFolderInfo");
  const targetIdInput = document.getElementById("uploadModalTargetId");
  const targetAgendaInput = document.getElementById("uploadModalTargetAgenda");
  const targetTypeInput = document.getElementById("uploadModalTargetType");
  const nomorText = document.getElementById("uploadModalNomorLengkap");
  const perihalText = document.getElementById("uploadModalPerihal");
  const fileInput = document.getElementById("inputUploadRowFile");

  if (typeLabel) typeLabel.textContent = "SURAT MASUK TARGET:";
  if (folderInfo) folderInfo.innerHTML = `<i class="fa-solid fa-folder-tree"></i> Tersimpan otomatis ke folder: <strong>Surat Masuk 2026</strong> pada Google Drive SMA YWKA`;
  if (targetTypeInput) targetTypeInput.value = "masuk";
  if (targetIdInput) targetIdInput.value = item.id;
  const targetUrutInput = document.getElementById("uploadModalTargetUrut");
  const targetRowIndexInput = document.getElementById("uploadModalTargetRowIndex");
  const cleanAgenda = (item.noAgenda && item.noAgenda !== "-") ? item.noAgenda.trim() : "";
  if (targetAgendaInput) targetAgendaInput.value = cleanAgenda;
  if (targetUrutInput) targetUrutInput.value = item.noUrut || "";
  if (targetRowIndexInput) targetRowIndexInput.value = item.rowIndex || "";
  if (nomorText) nomorText.textContent = cleanAgenda ? `No. Asal/Agenda: ${cleanAgenda} (No. Urut: ${item.noUrut || "-"})` : `No. Urut: ${item.noUrut || "-"}`;
  if (perihalText) perihalText.textContent = `${item.perihal || "-"} (Pengirim: ${item.dari || "-"})`;
  if (fileInput) fileInput.value = "";

  // Deteksi berkas lama di Drive (Skema Pembaruan Bersih)
  const existingUrl = item.driveUrl || (item.lampiran && item.lampiran.startsWith("http") ? item.lampiran : "");
  const existingBox = document.getElementById("uploadModalExistingBox");
  const existingLink = document.getElementById("uploadModalExistingLink");
  const modalTitle = document.getElementById("uploadModalTitleText");
  const btnSubmit = document.getElementById("btnSubmitUploadRowDrive");
  const labelFile = document.getElementById("labelUploadRowFile");

  if (existingUrl) {
    if (existingBox) existingBox.style.display = "block";
    if (existingLink) existingLink.href = existingUrl;
    if (modalTitle) modalTitle.innerHTML = `<i class="fa-solid fa-arrows-rotate text-emerald"></i> Perbarui Berkas Google Drive`;
    if (btnSubmit) btnSubmit.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i> Perbarui Berkas ke Google Drive`;
    if (labelFile) labelFile.innerHTML = `Pilih Berkas Baru Pengganti (PDF / DOCX / Gambar / Scan): <span class="text-danger">*</span>`;
  } else {
    if (existingBox) existingBox.style.display = "none";
    if (modalTitle) modalTitle.innerHTML = `<i class="fa-brands fa-google-drive text-emerald"></i> Upload Berkas ke Google Drive`;
    if (btnSubmit) btnSubmit.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Unggah ke Google Drive`;
    if (labelFile) labelFile.innerHTML = `Pilih Berkas Lampiran Surat (PDF / DOCX / Gambar / Scan): <span class="text-danger">*</span>`;
  }

  if (modal) modal.classList.add("show");
}

/**
 * Eksekusi upload file ke Google Drive (Mendukung Surat Keluar & Surat Masuk)
 */
async function handleExecuteUploadRowDrive(e) {
  e.preventDefault();

  const targetId = document.getElementById("uploadModalTargetId")?.value;
  const targetAgenda = document.getElementById("uploadModalTargetAgenda")?.value;
  const targetType = document.getElementById("uploadModalTargetType")?.value || "keluar";
  const targetUrut = document.getElementById("uploadModalTargetUrut")?.value || "";
  const targetRowIndex = document.getElementById("uploadModalTargetRowIndex")?.value || "";
  const fileInput = document.getElementById("inputUploadRowFile");
  const btnSubmit = document.getElementById("btnSubmitUploadRowDrive");
  const modal = document.getElementById("modalUploadRowDrive");

  if (!fileInput || !fileInput.files || !fileInput.files[0]) {
    showToast("Silakan pilih berkas yang ingin diunggah terlebih dahulu!", "warning");
    return;
  }

  const file = fileInput.files[0];
  if (file.size > 20 * 1024 * 1024) {
    showToast("Ukuran berkas melebihi batas 20 MB!", "warning");
    return;
  }

  const isMasuk = (targetType === "masuk");
  const targetItem = isMasuk
    ? state.suratMasuk.find(m => m.id === targetId || (targetUrut && m.noUrut && String(m.noUrut).trim() === String(targetUrut).trim()) || (targetAgenda && targetAgenda !== "-" && m.noAgenda && m.noAgenda === targetAgenda))
    : state.suratKeluar.find(s => s.id === targetId || s.noAgenda === targetAgenda);

  const hasExistingFile = Boolean(targetItem?.driveUrl || (targetItem?.lampiran && targetItem.lampiran.startsWith("http")));

  const origBtnHtml = btnSubmit.innerHTML;
  btnSubmit.disabled = true;

  if (hasExistingFile) {
    btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 1/3 Menghapus link Spreadsheet...`;
    setTimeout(() => {
      if (btnSubmit && btnSubmit.disabled) {
        btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 2/3 Membersihkan duplikat Drive...`;
      }
    }, 1400);
    setTimeout(() => {
      if (btnSubmit && btnSubmit.disabled) {
        btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 3/3 Mengunggah berkas baru...`;
      }
    }, 2800);
  } else {
    btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Mengunggah ke Drive...`;
  }

  try {
    // Jika Surat Masuk & berkas PDF → sisipkan watermark No. Urut + Tanggal sebelum upload
    const isMasukCheck = (targetType === "masuk");
    let fileToUpload = file;
    if (isMasukCheck && file.type && file.type.includes("pdf")) {
      const targetItemForWm = state.suratMasuk.find(m =>
        m.id === targetId ||
        (targetUrut && m.noUrut && String(m.noUrut).trim() === String(targetUrut).trim()) ||
        (targetAgenda && targetAgenda !== "-" && m.noAgenda && m.noAgenda === targetAgenda)
      );
      const wmNo = targetItemForWm?.noUrut || targetUrut || targetAgenda || "-";
      const wmTgl = targetItemForWm?.tglSurat || "-";
      fileToUpload = await addWatermarkToPdfFile(file, wmNo, wmTgl);
    }

    const fileBase64 = await readFileAsBase64(fileToUpload);
    const fileName = fileToUpload.name;
    const fileMime = fileToUpload.type || "application/pdf";

    if (!state.appsScriptUrl) {
      showToast("URL Google Apps Script belum disetel! Harap simpan URL Web App di tab Pengaturan.", "warning");
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = origBtnHtml;
      return;
    }

    const isMasuk = (targetType === "masuk");
    const targetItem = isMasuk
      ? state.suratMasuk.find(m => m.id === targetId || (targetUrut && m.noUrut && String(m.noUrut).trim() === String(targetUrut).trim()) || (targetAgenda && targetAgenda !== "-" && m.noAgenda && m.noAgenda === targetAgenda))
      : state.suratKeluar.find(s => s.id === targetId || s.noAgenda === targetAgenda);

    const payload = {
      action: isMasuk ? "upload_lampiran_masuk" : "upload_lampiran_keluar",
      no_agenda: targetAgenda,
      no_urut: targetUrut,
      row_index: targetRowIndex,

      fileName: fileName,
      fileBase64: fileBase64,
      fileMime: fileMime,
      old_drive_url: targetItem?.driveUrl || (targetItem?.lampiran && targetItem.lampiran.startsWith("http") ? targetItem.lampiran : "")
    };

    const res = await fetch(state.appsScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(payload)
    });

    const resJson = await res.json();
    if (resJson && resJson.status === "success" && resJson.drive_file_url) {
      if (isMasuk) {
        const item = state.suratMasuk.find(m => m.id === targetId || (targetUrut && m.noUrut && String(m.noUrut).trim() === String(targetUrut).trim()) || (targetAgenda && targetAgenda !== "-" && m.noAgenda && m.noAgenda === targetAgenda));
        if (item) {
          item.driveUrl = resJson.drive_file_url;
          item.lampiran = resJson.drive_file_url;
          item.status = true;
        }
        localStorage.setItem("cache_surat_masuk_2026", JSON.stringify(state.suratMasuk));
        filterSuratMasukData();
        updateDashboardUI();
        if (modal) modal.classList.remove("show");
        showToast(hasExistingFile ? `✅ Berkas berhasil diperbarui! Link lama di Spreadsheet telah dihapus, duplikat Drive dibersihkan ke Sampah, dan berkas baru berhasil ditautkan.` : `✅ Berkas surat masuk berhasil diunggah ke Google Drive!`, "success");
        setTimeout(() => {
          openWaReportModal({
            type: "masuk",
            item: item,
            driveUrl: resJson.drive_file_url
          });
        }, 350);
      } else {
        const item = state.suratKeluar.find(s => s.id === targetId || s.noAgenda === targetAgenda);
        if (item) {
          item.driveUrl = resJson.drive_file_url;
          item.lampiran = resJson.drive_file_url;
          item.status = true;
        }
        localStorage.setItem("cache_surat_keluar_2026", JSON.stringify(state.suratKeluar));

        const unsyncedList = JSON.parse(localStorage.getItem("unsynced_surat_keluar") || "[]");
        const unIdx = unsyncedList.findIndex(x => x.id === targetId || x.noAgenda === targetAgenda);
        if (unIdx !== -1) {
          unsyncedList[unIdx].driveUrl = resJson.drive_file_url;
          unsyncedList[unIdx].lampiran = resJson.drive_file_url;
          unsyncedList[unIdx].status = true;
          localStorage.setItem("unsynced_surat_keluar", JSON.stringify(unsyncedList));
        }

        filterSuratKeluarData();
        updateDashboardUI();
        if (modal) modal.classList.remove("show");
        showToast(hasExistingFile ? `✅ Berkas berhasil diperbarui! Link lama di Spreadsheet telah dihapus, duplikat Drive dibersihkan ke Sampah, dan berkas baru berhasil ditautkan.` : `✅ Berkas berhasil diunggah ke Google Drive & checkbox spreadsheet telah diceklis!`, "success");
        setTimeout(() => {
          openWaReportModal({
            type: "keluar",
            item: item,
            driveUrl: resJson.drive_file_url
          });
        }, 350);
      }
    } else {
      throw new Error(resJson?.message || "Gagal mengunggah berkas");
    }
  } catch (err) {
    console.error("Gagal upload berkas per agenda:", err);
    showToast(`⚠️ Gagal upload berkas: ${err.message || err}`, "error");
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = origBtnHtml;
  }
}

/**
 * =========================================================================
 * IMPLEMENTASI FITUR BATCH UPLOAD SURAT KELUAR SESUAI NO. AGENDA
 * =========================================================================
 */

/**
 * Helper: Ambil data slice surat keluar yang sedang aktif di halaman saat ini
 */
function getCurrentKeluarSlice() {
  const page = state.pagination.keluarPage;
  const perPage = state.pagination.keluarPerPage;
  const start = (page - 1) * perPage;
  const end = Math.min(start + perPage, state.filteredKeluar.length);
  return state.filteredKeluar.slice(start, end);
}

/**
 * Update status checkbox Pilih Semua (checkAllKeluar)
 */
function updateCheckAllKeluarState() {
  const checkAll = document.getElementById("checkAllKeluar");
  if (!checkAll) return;

  const currentSlice = getCurrentKeluarSlice();
  if (currentSlice.length === 0) {
    checkAll.checked = false;
    checkAll.indeterminate = false;
    return;
  }

  const selectedInSlice = currentSlice.filter(item => state.selectedKeluarIds.has(item.id));
  if (selectedInSlice.length === currentSlice.length) {
    checkAll.checked = true;
    checkAll.indeterminate = false;
  } else if (selectedInSlice.length > 0) {
    checkAll.checked = false;
    checkAll.indeterminate = true;
  } else {
    checkAll.checked = false;
    checkAll.indeterminate = false;
  }
}

/**
 * Update Bar Aksi Batch Surat Keluar
 */
function updateBatchKeluarBar() {
  const bar = document.getElementById("batchKeluarBar");
  const countBadge = document.getElementById("batchKeluarCountBadge");
  const btnCount = document.getElementById("batchKeluarBtnCount");
  const printBtnCount = document.getElementById("batchPrintKeluarBtnCount");
  const editBtnCount = document.getElementById("batchEditBtnCount");
  const editCount = document.getElementById("batchEditKeluarCount");
  const editApplyCount = document.getElementById("batchEditApplyCount");
  const count = state.selectedKeluarIds ? state.selectedKeluarIds.size : 0;

  if (countBadge) countBadge.textContent = count;
  if (btnCount) btnCount.textContent = count;
  if (printBtnCount) printBtnCount.textContent = count;
  if (editBtnCount) editBtnCount.textContent = count;
  if (editCount) editCount.textContent = count;
  if (editApplyCount) editApplyCount.textContent = count;

  if (bar) {
    bar.style.display = count > 0 ? "flex" : "none";
  }
}

/**
 * Format ukuran file ke format B, KB, MB
 */
function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

/**
 * Pencocokan Cerdas: Apakah nama berkas cocok dengan nomor agenda surat?
 * Mendukung format: 612.pdf, No. 612 Surat Tugas.pdf, 612-sk.pdf, [612] scan.pdf, dll.
 */
function isFileMatchingAgenda(fileName, agenda) {
  if (!fileName || !agenda) return false;
  const cleanAgenda = String(agenda).trim().toLowerCase();
  if (!cleanAgenda || cleanAgenda === "-" || cleanAgenda === "0") return false;

  const fName = fileName.toLowerCase();

  // 1. Cek pola regex dengan batas kata (word boundary)
  const escapedAg = cleanAgenda.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const reg1 = new RegExp("(?:^|[^0-9a-zA-Z])(?:no\\.?\\s*|agenda\\s*|surat\\s*)?" + escapedAg + "(?![0-9a-zA-Z])", "i");
  if (reg1.test(fName)) return true;

  // 2. Jika agenda hanya berupa digit angka murni (contoh: 612)
  if (/^\d+$/.test(cleanAgenda)) {
    const reg2 = new RegExp("(?:^|[^0-9])" + cleanAgenda + "(?![0-9])", "i");
    if (reg2.test(fName)) return true;
  }

  return false;
}

/**
 * =========================================================================
 * BATCH UPLOAD SURAT KELUAR (DENGAN EKSTRAKSI NAMA BERKAS, KODE KLASIFIKASI & PRATINJAU PDF)
 * =========================================================================
 */

const KODE_KLASIFIKASI_KELUAR_OPTIONS = [
  { code: "421.3", label: "421.3 - Surat Umum" },
  { code: "421.6", label: "421.6 - Surat Pelepasan / Wisuda" },
  { code: "421.7", label: "421.7 - Kegiatan Siswa (Dispensasi, Lomba)" },
  { code: "421.71", label: "421.71 - Kegiatan Reuni / Karya Wisata" },
  { code: "422.1", label: "422.1 - Kegiatan PPDB dan MPLS" },
  { code: "422.3", label: "422.3 - Pengumuman Hari Libur" },
  { code: "422.5", label: "422.5 - Beasiswa / Pelajar Teladan" },
  { code: "423.5", label: "423.5 - Kegiatan Kurikulum & Walikelas" },
  { code: "423.7", label: "423.7 - Kegiatan PAT, PAS, UTS, UJIAN" },
  { code: "425.11", label: "425.11 - Sarpras & Gedung Sekolah" },
  { code: "425.2", label: "425.2 - Sarpras Buku / Bahan Ajar" },
  { code: "425.3", label: "425.3 - Sarpras Perlengkapan Sekolah" }
];

/**
 * Parser Cerdas Nama Berkas Surat Keluar
 * Menghapus ekstensi, membersihkan pemisah, mendeteksi No. Agenda,
 * auto-klasifikasi 12 Kode SMA YWKA, dan mendeteksi Tujuan Surat.
 */
function parseFileNameForSuratKeluar(fileName) {
  if (!fileName) return { perihal: "", noAgenda: "", kodeKlasifikasi: "421.3", kepada: "-" };

  // 1. Hapus ekstensi berkas
  let base = fileName.replace(/\.[^/.]+$/, "").trim();

  // 2. Normalisasi pemisah
  base = base.replace(/_+/g, " ").replace(/\s+/g, " ").trim();

  let noAgenda = "";
  let kodeKlasifikasi = "";
  let perihal = base;
  let kepada = "-";

  // Cek nomor agenda di nama berkas:
  // Pola A: "421.7/691/..." atau "421.7-691"
  const comboMatch = base.match(/\b(42[1-5]\.[0-9a-zA-Z.-]+)[-/\s]+(\d+)\b/);
  if (comboMatch) {
    kodeKlasifikasi = comboMatch[1].trim();
    noAgenda = comboMatch[2].trim();
    perihal = base.replace(comboMatch[0], "").replace(/^[-–—:\s/]+|[-–—:\s/]+$/g, "").trim();
  } else {
    // Pola B: diawali angka nomor agenda murni (contoh: "692 Surat Keputusan" atau "692 - Dispensasi")
    const numLeadMatch = base.match(/^(\d{1,4})\s*[-–—:\s]\s*(.+)$/);
    if (numLeadMatch) {
      noAgenda = numLeadMatch[1].trim();
      perihal = numLeadMatch[2].trim();
    } else {
      // Pola C: "No. 692" atau "Agenda 692"
      const agendaLeadMatch = base.match(/^(?:no\.?|agenda)\s*(\d{1,4})\s*[-–—:\s]?\s*(.+)$/i);
      if (agendaLeadMatch) {
        noAgenda = agendaLeadMatch[1].trim();
        perihal = agendaLeadMatch[2].trim();
      }
    }
  }

  // Jika kode klasifikasi belum terdeteksi dari pola kode, deteksi dari kata kunci atau kode di teks
  const lowerAll = (base + " " + fileName).toLowerCase();
  if (!kodeKlasifikasi) {
    if (lowerAll.includes("421.71")) kodeKlasifikasi = "421.71";
    else if (lowerAll.includes("425.11")) kodeKlasifikasi = "425.11";
    else if (lowerAll.includes("421.7")) kodeKlasifikasi = "421.7";
    else if (lowerAll.includes("423.5")) kodeKlasifikasi = "423.5";
    else if (lowerAll.includes("423.7")) kodeKlasifikasi = "423.7";
    else if (lowerAll.includes("421.6")) kodeKlasifikasi = "421.6";
    else if (lowerAll.includes("422.1")) kodeKlasifikasi = "422.1";
    else if (lowerAll.includes("422.3")) kodeKlasifikasi = "422.3";
    else if (lowerAll.includes("422.5")) kodeKlasifikasi = "422.5";
    else if (lowerAll.includes("425.2")) kodeKlasifikasi = "425.2";
    else if (lowerAll.includes("425.3")) kodeKlasifikasi = "425.3";
    else if (lowerAll.includes("421.3")) kodeKlasifikasi = "421.3";
    else if (/buku|bahan ajar|modul|perpustakaan/i.test(lowerAll)) {
      kodeKlasifikasi = "425.2";
    } else if (/sarpras|gedung|kamar mandi|wc|ruang kelas|pengecatan|renovasi|bangunan|mebel|instalasi/i.test(lowerAll)) {
      kodeKlasifikasi = "425.11";
    } else if (/dispensasi|lomba|paskibra|osis|pramuka|ekskul|ekstrakurikuler|lopb|kejuaraan|futsal|basket|atlet|siswa/i.test(lowerAll)) {
      kodeKlasifikasi = "421.7";
    } else if (/kurikulum|walikelas|wali kelas|rapat dinas|rapat guru|abm|asesmen bakat|kbm|pembagian tugas/i.test(lowerAll)) {
      kodeKlasifikasi = "423.5";
    } else if (/ujian|pat|pas|uts|anbk|sumatif|asesmen akhir/i.test(lowerAll)) {
      kodeKlasifikasi = "423.7";
    } else if (/ppdb|mpls|mos|penerimaan siswa/i.test(lowerAll)) {
      kodeKlasifikasi = "422.1";
    } else if (/libur|cuti/i.test(lowerAll)) {
      kodeKlasifikasi = "422.3";
    } else if (/beasiswa|prestasi|teladan|dks/i.test(lowerAll)) {
      kodeKlasifikasi = "422.5";
    } else if (/wisuda|pelepasan|kelulusan|perpisahan/i.test(lowerAll)) {
      kodeKlasifikasi = "421.6";
    } else if (/reuni|karya wisata|study tour/i.test(lowerAll)) {
      kodeKlasifikasi = "421.71";
    } else if (/perlengkapan|seragam|atk|inventaris/i.test(lowerAll)) {
      kodeKlasifikasi = "425.3";
    } else {
      kodeKlasifikasi = "421.3"; // Default Surat Umum
    }
  }

  // Deteksi Kepada / Tujuan
  if (/walikelas|wali kelas/i.test(lowerAll)) kepada = "Bapak/Ibu Wali Kelas";
  else if (/orang tua|wali murid/i.test(lowerAll)) kepada = "Orang Tua / Wali Murid";
  else if (/cadisdik|kcd/i.test(lowerAll)) kepada = "Kepala Cabang Dinas Pendidikan Wil. VII";
  else if (/disdik|dinas pendidikan/i.test(lowerAll)) kepada = "Kepala Dinas Pendidikan Provinsi Jawa Barat";
  else if (/yayasan|ywka/i.test(lowerAll)) kepada = "Pengurus Yayasan Wanita Kereta Api";
  else if (/puskesmas/i.test(lowerAll)) kepada = "Puskesmas";

  // Title case format untuk perihal
  if (perihal && (perihal === perihal.toUpperCase() || perihal === perihal.toLowerCase())) {
    perihal = perihal.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }

  return {
    perihal: perihal || base,
    noAgenda: noAgenda || "",
    kodeKlasifikasi: kodeKlasifikasi || "421.3",
    kepada: kepada || "-"
  };
}
window.parseFileNameForSuratKeluar = parseFileNameForSuratKeluar;

/**
 * Buka modal upload batch surat keluar
 * @param {Array<string>|null} targetIds Daftar ID surat jika dicentang dari tabel
 */
function openBatchUploadModalKeluar(targetIds = null) {
  const modal = document.getElementById("modalBatchUploadKeluar");
  if (!modal) return;

  const progressBox = document.getElementById("batchProgressBox");
  if (progressBox) progressBox.style.display = "none";

  // Pre-fill input global tanggal ke hari ini
  const globalTgl = document.getElementById("batchKeluarGlobalTanggal");
  if (globalTgl && !globalTgl.value) {
    globalTgl.value = new Date().toISOString().split("T")[0];
  }

  let idsToUse = [];
  if (targetIds && targetIds.length > 0) {
    idsToUse = targetIds;
  } else if (state.selectedKeluarIds && state.selectedKeluarIds.size > 0) {
    idsToUse = Array.from(state.selectedKeluarIds);
  }

  if (idsToUse.length > 0) {
    // Mode Pasangkan Berkas ke Surat Terpilih
    state.batchKeluarMode = "match";
    const selectedItems = idsToUse.map(id => state.suratKeluar.find(k => k.id === id)).filter(Boolean);
    selectedItems.sort((a, b) => {
      const nA = parseInt(a.noAgenda || a.noUrut || 0, 10);
      const nB = parseInt(b.noAgenda || b.noUrut || 0, 10);
      if (!isNaN(nA) && !isNaN(nB)) return nA - nB;
      return String(a.noAgenda).localeCompare(String(b.noAgenda));
    });

    state.batchKeluarItems = selectedItems.map(item => ({
      id: "BK-EXISTING-" + item.id,
      isExisting: true,
      existingItem: item,
      noAgenda: item.noAgenda || item.noUrut || "",
      kodeKlasifikasi: item.kodeKlasifikasi || "421.3",
      perihal: item.perihal || "",
      kepada: item.kepada || "-",
      tglSurat: item.tanggal ? formatDateToInput(item.tanggal) : new Date().toISOString().split("T")[0],
      petugas: item.petugas || (state.currentUser?.name || "Admin TU"),
      file: null,
      status: 'idle',
      isScanningPdf: false,
      errorMsg: ''
    }));
  } else {
    // Mode Entri Baru Massal
    state.batchKeluarMode = "new";
    if (!state.batchKeluarItems) state.batchKeluarItems = [];
  }

  renderBatchKeluarModalList();
  modal.classList.add("show");
}
window.openBatchUploadModalKeluar = openBatchUploadModalKeluar;

function closeBatchUploadModalKeluar() {
  const modal = document.getElementById("modalBatchUploadKeluar");
  if (modal) modal.classList.remove("show");
}
window.closeBatchUploadModalKeluar = closeBatchUploadModalKeluar;

/**
 * Handle berkas-berkas yang di-drop atau dipilih di modal Batch Upload Surat Keluar
 */
function handleBatchKeluarFiles(fileList) {
  if (!fileList || fileList.length === 0) return;

  const files = Array.from(fileList);
  const todayIso = new Date().toISOString().split("T")[0];

  // Hitung no agenda awal berikutnya
  let baseNoAgenda = parseInt(state.nextKeluarAgenda, 10);
  if (isNaN(baseNoAgenda) || baseNoAgenda <= 0) {
    calculateNextSequence();
    baseNoAgenda = parseInt(state.nextKeluarAgenda, 10) || 712;
  }

  // Jika di antrean batch sudah ada agenda, pastikan nomor baru tidak bentrok
  if (state.batchKeluarItems && state.batchKeluarItems.length > 0) {
    const existingMax = Math.max(...state.batchKeluarItems.map(b => parseInt(b.noAgenda, 10) || 0));
    if (existingMax >= baseNoAgenda) {
      baseNoAgenda = existingMax + 1;
    }
  }

  let matchedExistingCount = 0;
  let addedNewCount = 0;

  files.forEach((file, idx) => {
    // Abaikan duplikasi berkas identik
    if (state.batchKeluarItems.some(b => b.file && b.file.name === file.name && b.file.size === file.size)) {
      return;
    }

    // 1. Coba pasangkan ke item existing yang belum punya file
    let emptyExisting = null;
    if (state.batchKeluarItems && state.batchKeluarItems.length > 0) {
      emptyExisting = state.batchKeluarItems.find(b => b.isExisting && !b.file && isFileMatchingAgenda(file.name, b.noAgenda));
      if (!emptyExisting) {
        emptyExisting = state.batchKeluarItems.find(b => b.isExisting && !b.file);
      }
    }

    if (emptyExisting) {
      emptyExisting.file = file;
      emptyExisting.status = 'ready';
      emptyExisting.isScanningPdf = (file.type === "application/pdf" || (file.name && file.name.toLowerCase().endsWith(".pdf")));
      matchedExistingCount++;

      if (emptyExisting.isScanningPdf) {
        scanPdfForLetterData(file).then(info => {
          emptyExisting.isScanningPdf = false;
          if (info) {
            if (info.noAgenda && (!emptyExisting.noAgenda || emptyExisting.noAgenda === "-")) {
              emptyExisting.noAgenda = info.noAgenda;
            }
            if (info.kodeKlasifikasi && (!emptyExisting.kodeKlasifikasi || emptyExisting.kodeKlasifikasi === "421.3")) {
              emptyExisting.kodeKlasifikasi = info.kodeKlasifikasi;
            }
            if (info.perihal && (!emptyExisting.perihal || emptyExisting.perihal === "-")) {
              emptyExisting.perihal = info.perihal;
            }
            if (info.kepada && (!emptyExisting.kepada || emptyExisting.kepada === "-")) {
              emptyExisting.kepada = info.kepada;
            }
            if (info.tglSurat) {
              emptyExisting.tglSurat = info.tglSurat;
            }
          }
          renderBatchKeluarModalList();
        }).catch(() => {
          emptyExisting.isScanningPdf = false;
          renderBatchKeluarModalList();
        });
      }
      return;
    }

    // 2. Tambahkan sebagai entri Surat Keluar baru
    const parsed = parseFileNameForSuratKeluar(file.name);
    let assignedAgenda = parsed.noAgenda;
    if (!assignedAgenda) {
      assignedAgenda = String(baseNoAgenda + addedNewCount);
    }
    const isPdf = (file.type === "application/pdf" || (file.name && file.name.toLowerCase().endsWith(".pdf")));

    const newEntry = {
      id: "BKI-" + Date.now() + "-" + idx + "-" + Math.random().toString(36).substring(2, 6),
      isExisting: false,
      noAgenda: assignedAgenda,
      kodeKlasifikasi: parsed.kodeKlasifikasi || "421.3",
      perihal: parsed.perihal || file.name.replace(/\.[^/.]+$/, ""),
      kepada: parsed.kepada || "-",
      tglSurat: todayIso,
      petugas: (state.currentUser && state.currentUser.name) ? state.currentUser.name : "Admin TU",
      file: file,
      status: 'ready',
      isScanningPdf: isPdf,
      errorMsg: ''
    };

    state.batchKeluarItems.push(newEntry);
    addedNewCount++;

    if (newEntry.isScanningPdf) {
      scanPdfForLetterData(file).then(info => {
        newEntry.isScanningPdf = false;
        if (info) {
          if (info.noAgenda && !parsed.noAgenda) {
            newEntry.noAgenda = info.noAgenda;
          }
          if (info.kodeKlasifikasi && parsed.kodeKlasifikasi === "421.3") {
            newEntry.kodeKlasifikasi = info.kodeKlasifikasi;
          }
          if (info.perihal && (!newEntry.perihal || newEntry.perihal.toLowerCase().includes("scan") || newEntry.perihal === file.name.replace(/\.[^/.]+$/, ""))) {
            newEntry.perihal = info.perihal;
          }
          if (info.kepada && newEntry.kepada === "-") {
            newEntry.kepada = info.kepada;
          }
          if (info.tglSurat) {
            newEntry.tglSurat = info.tglSurat;
          }
        }
        renderBatchKeluarModalList();
      }).catch(() => {
        newEntry.isScanningPdf = false;
        renderBatchKeluarModalList();
      });
    }
  });

  renderBatchKeluarModalList();

  if (addedNewCount > 0 || matchedExistingCount > 0) {
    showToast(`✅ Berhasil menambahkan ${addedNewCount + matchedExistingCount} berkas surat keluar! Sistem membaca berkas & mendeteksi klasifikasi secara otomatis.`, "success");
  }
}
window.handleBatchKeluarFiles = handleBatchKeluarFiles;

/**
 * Render tabel daftar berkas di modal upload batch Surat Keluar
 */
function renderBatchKeluarModalList() {
  const tbody = document.getElementById("tbodyBatchKeluarItems");
  const summaryStats = document.getElementById("batchSummaryStats");
  const readyCountSpan = document.getElementById("batchReadyCount");
  const btnStart = document.getElementById("btnStartBatchUploadKeluar");

  if (!tbody) return;

  const total = state.batchKeluarItems ? state.batchKeluarItems.length : 0;
  const ready = state.batchKeluarItems ? state.batchKeluarItems.filter(b => b.file && b.status !== 'success').length : 0;

  if (summaryStats) {
    summaryStats.textContent = `${total} berkas terdaftar • ${ready} siap upload`;
  }
  if (readyCountSpan) {
    readyCountSpan.textContent = ready;
  }
  if (btnStart) {
    btnStart.disabled = (ready === 0);
  }

  if (total === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; color: #94a3b8; padding: 36px 16px;">
          <i class="fa-solid fa-cloud-arrow-up" style="font-size: 32px; display: block; margin-bottom: 8px; color: #cbd5e1;"></i>
          Belum ada berkas yang dipilih. Silakan tarik &amp; jatuhkan berkas di area atas atau klik tombol <strong>"Pilih Berkas"</strong>.
        </td>
      </tr>
    `;
    return;
  }

  let html = "";
  state.batchKeluarItems.forEach((entry, idx) => {
    const kodeSelectOptions = KODE_KLASIFIKASI_KELUAR_OPTIONS.map(opt => {
      const isSel = (entry.kodeKlasifikasi === opt.code) ? 'selected' : '';
      return `<option value="${escapeHtml(opt.code)}" ${isSel}>${escapeHtml(opt.label)}</option>`;
    }).join("");

    let fileCol = "";
    if (entry.file) {
      fileCol = `
        <div class="batch-file-matched" style="max-width: 220px;" title="${escapeHtml(entry.file.name)}">
          <i class="fa-solid fa-file-pdf text-danger"></i>
          <span class="batch-file-name">${escapeHtml(entry.file.name)}</span>
          <span class="batch-file-size">(${formatFileSize(entry.file.size)})</span>
          <button type="button" class="btn-remove-matched-file" onclick="previewBatchKeluarPdf('${entry.id}')" title="Cek & Intip Dokumen PDF" style="color: #2563eb; margin-left: 2px;"><i class="fa-solid fa-eye"></i></button>
          <button type="button" class="btn-remove-matched-file" onclick="removeBatchKeluarFile('${entry.id}')" title="Lepas berkas">&times;</button>
        </div>
      `;
    } else {
      fileCol = `<span class="batch-no-file-text">Belum ada file</span>`;
    }

    let statusCol = "";
    if (entry.status === 'ready') {
      statusCol = `<span class="badge" style="background:#eff6ff; color:#2563eb; font-size:11px;"><i class="fa-solid fa-check"></i> Siap</span>`;
    } else if (entry.status === 'uploading') {
      statusCol = `<span class="badge" style="background:#fef3c7; color:#d97706; font-size:11px;"><i class="fa-solid fa-spinner fa-spin"></i> Upload...</span>`;
    } else if (entry.status === 'success') {
      statusCol = `<span class="badge" style="background:#dcfce7; color:#166534; font-size:11px;"><i class="fa-solid fa-circle-check"></i> Selesai</span>`;
    } else if (entry.status === 'error') {
      statusCol = `<span class="badge" style="background:#fee2e2; color:#dc2626; font-size:11px;" title="${escapeHtml(entry.errorMsg || 'Gagal')}"><i class="fa-solid fa-circle-exclamation"></i> Gagal</span>`;
    } else {
      statusCol = `<span class="badge" style="background:#f1f5f9; color:#64748b; font-size:11px;">Menunggu</span>`;
    }

    html += `
      <tr data-item-id="${entry.id}">
        <td style="text-align: center;">
          <input type="number" class="batch-table-input stat-mono font-bold" style="width: 65px; text-align: center;" value="${entry.noAgenda || ''}" onchange="updateBatchKeluarField('${entry.id}', 'noAgenda', this.value)" title="No. Agenda Surat Keluar">
        </td>
        <td>
          <select class="batch-table-input font-bold" onchange="updateBatchKeluarField('${entry.id}', 'kodeKlasifikasi', this.value)">
            ${kodeSelectOptions}
          </select>
          ${entry.isScanningPdf ? `<div style="font-size:10px; color:#2563eb; margin-top:2px;"><i class="fa-solid fa-spinner fa-spin"></i> Memindai PDF...</div>` : ''}
        </td>
        <td>
          <textarea class="batch-table-input" rows="2" placeholder="Prihal / Ringkasan Surat Keluar" onchange="updateBatchKeluarField('${entry.id}', 'perihal', this.value)" style="min-height: 48px; resize: vertical;">${escapeHtml(entry.perihal || '')}</textarea>
        </td>
        <td>
          <input type="text" class="batch-table-input" value="${escapeHtml(entry.kepada || '')}" placeholder="Kepada / Tujuan" onchange="updateBatchKeluarField('${entry.id}', 'kepada', this.value)">
        </td>
        <td>
          <input type="date" class="batch-table-input" value="${entry.tglSurat || ''}" onchange="updateBatchKeluarField('${entry.id}', 'tglSurat', this.value)" title="Tanggal Surat">
        </td>
        <td>
          <input type="text" class="batch-table-input" value="${escapeHtml(entry.petugas || '')}" placeholder="Petugas" onchange="updateBatchKeluarField('${entry.id}', 'petugas', this.value)">
        </td>
        <td>${fileCol}</td>
        <td style="text-align: center;">${statusCol}</td>
        <td style="text-align: center;">
          <button type="button" class="btn-action-icon btn-del" onclick="removeBatchKeluarItem('${entry.id}')" title="Hapus baris ini">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}
window.renderBatchKeluarModalList = renderBatchKeluarModalList;

/**
 * Update field item di batch upload Surat Keluar
 */
function updateBatchKeluarField(itemId, field, value) {
  const item = state.batchKeluarItems.find(b => b.id === itemId);
  if (!item) return;
  item[field] = value;
}
window.updateBatchKeluarField = updateBatchKeluarField;

/**
 * Lepas file dari baris tertentu di modal batch upload Surat Keluar
 */
function removeBatchKeluarFile(itemId) {
  const item = state.batchKeluarItems.find(b => b.id === itemId);
  if (!item) return;
  item.file = null;
  if (item.status !== 'success') item.status = 'idle';
  renderBatchKeluarModalList();
}
window.removeBatchKeluarFile = removeBatchKeluarFile;

/**
 * Hapus seluruh baris entri di modal batch upload Surat Keluar
 */
function removeBatchKeluarItem(itemId) {
  state.batchKeluarItems = state.batchKeluarItems.filter(b => b.id !== itemId);
  renderBatchKeluarModalList();
}
window.removeBatchKeluarItem = removeBatchKeluarItem;
const removeBatchFile = removeBatchKeluarFile;
const removeBatchItem = removeBatchKeluarItem;
window.removeBatchFile = removeBatchKeluarFile;
window.removeBatchItem = removeBatchKeluarItem;

/**
 * Terapkan kode klasifikasi global ke seluruh baris surat keluar
 */
function applyGlobalKlasifikasiToBatchKeluar() {
  const select = document.getElementById("batchKeluarGlobalKlasifikasi");
  if (!select || !select.value) {
    showToast("Silakan pilih kode klasifikasi terlebih dahulu!", "warning");
    return;
  }
  const val = select.value;
  state.batchKeluarItems.forEach(b => {
    b.kodeKlasifikasi = val;
  });
  renderBatchKeluarModalList();
  showToast(`Kode Klasifikasi "${val}" diterapkan ke seluruh surat dalam daftar!`, "success");
}
window.applyGlobalKlasifikasiToBatchKeluar = applyGlobalKlasifikasiToBatchKeluar;

/**
 * Terapkan tanggal global ke seluruh baris surat keluar
 */
function applyGlobalTglToBatchKeluar() {
  const input = document.getElementById("batchKeluarGlobalTanggal");
  if (!input || !input.value) {
    showToast("Silakan tentukan tanggal terlebih dahulu!", "warning");
    return;
  }
  const val = input.value;
  state.batchKeluarItems.forEach(b => {
    b.tglSurat = val;
  });
  renderBatchKeluarModalList();
  showToast(`Tanggal "${val}" diterapkan ke seluruh surat dalam daftar!`, "success");
}
window.applyGlobalTglToBatchKeluar = applyGlobalTglToBatchKeluar;

/**
 * Terapkan tujuan global ke seluruh baris surat keluar
 */
function applyGlobalKepadaToBatchKeluar() {
  const input = document.getElementById("batchKeluarGlobalKepada");
  const val = input ? input.value.trim() : "";
  state.batchKeluarItems.forEach(b => {
    b.kepada = val;
  });
  renderBatchKeluarModalList();
  showToast(`Tujuan "${val || '(kosong)'}" diterapkan ke seluruh surat dalam daftar!`, "success");
}
window.applyGlobalKepadaToBatchKeluar = applyGlobalKepadaToBatchKeluar;

/**
 * Pindai ulang seluruh berkas PDF dalam antrean modal batch upload Surat Keluar
 */
async function rescanAllBatchKeluarPdf() {
  const pdfItems = state.batchKeluarItems ? state.batchKeluarItems.filter(b => b.file && (b.file.type === "application/pdf" || b.file.name.toLowerCase().endsWith(".pdf"))) : [];
  if (pdfItems.length === 0) {
    showToast("Tidak ada berkas PDF dalam antrean!", "info");
    return;
  }

  showToast(`🔍 Memindai ${pdfItems.length} berkas PDF Surat Keluar...`, "info");
  let foundCount = 0;

  for (const item of pdfItems) {
    item.isScanningPdf = true;
    renderBatchKeluarModalList();
    const info = await scanPdfForLetterData(item.file);
    item.isScanningPdf = false;
    if (info) {
      if (info.noAgenda) {
        item.noAgenda = info.noAgenda;
        foundCount++;
      }
      if (info.kodeKlasifikasi) {
        item.kodeKlasifikasi = info.kodeKlasifikasi;
      }
      if (info.perihal && (!item.perihal || item.perihal.toLowerCase().includes("scan"))) {
        item.perihal = info.perihal;
      }
      if (info.kepada && (!item.kepada || item.kepada === "-")) {
        item.kepada = info.kepada;
      }
      if (info.tglSurat) {
        item.tglSurat = info.tglSurat;
      }
    }
  }

  renderBatchKeluarModalList();
  showToast(`✅ Pemindaian selesai! Berhasil memperbarui data dari isi dokumen PDF.`, "success");
}
window.rescanAllBatchKeluarPdf = rescanAllBatchKeluarPdf;

/**
 * Pratinjau Cek Dokumen PDF Tunggal untuk Surat Keluar
 */
function previewBatchKeluarPdf(itemId) {
  const entry = state.batchKeluarItems ? state.batchKeluarItems.find(b => b.id === itemId) : null;
  if (!entry || !entry.file) {
    showToast("Berkas dokumen belum dipilih!", "warning");
    return;
  }

  currentPreviewBatchItemId = itemId;
  currentPreviewType = "keluar";
  if (typeof window !== "undefined") {
    window.currentPreviewBatchItemId = itemId;
    window.currentPreviewType = "keluar";
  }

  const modal = document.getElementById("modalPreviewBatchPdf");
  const titleEl = document.getElementById("previewBatchPdfTitle");
  const headerEl = document.getElementById("previewBatchPdfHeader");
  const fileNameEl = document.getElementById("previewBatchPdfFileName");
  const iframe = document.getElementById("previewBatchPdfIframe");
  const openNewTabBtn = document.getElementById("btnPreviewPdfOpenNewTab");

  const masukControls = document.getElementById("previewBatchPdfMasukControls");
  const keluarControls = document.getElementById("previewBatchPdfKeluarControls");

  if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-file-pdf text-danger"></i> Cek Dokumen PDF Surat Keluar &amp; Verifikasi Agenda / Klasifikasi`;
  if (headerEl) {
    headerEl.style.background = "#eff6ff";
    headerEl.style.borderBottom = "1px solid #bfdbfe";
  }
  if (masukControls) masukControls.style.display = "none";
  if (keluarControls) keluarControls.style.display = "flex";

  if (fileNameEl) fileNameEl.textContent = entry.file.name;

  const agendaInput = document.getElementById("previewBatchKeluarAgendaInput");
  const kodeSelect = document.getElementById("previewBatchKeluarKodeSelect");
  const perihalInput = document.getElementById("previewBatchKeluarPerihalInput");
  const kepadaInput = document.getElementById("previewBatchKeluarKepadaInput");

  if (agendaInput) agendaInput.value = entry.noAgenda || "";
  if (kodeSelect) kodeSelect.value = entry.kodeKlasifikasi || "421.3";
  if (perihalInput) perihalInput.value = entry.perihal || "";
  if (kepadaInput) kepadaInput.value = entry.kepada || "";

  if (currentPreviewBlobUrl) {
    URL.revokeObjectURL(currentPreviewBlobUrl);
    currentPreviewBlobUrl = null;
  }

  currentPreviewBlobUrl = URL.createObjectURL(entry.file);
  if (iframe) iframe.src = currentPreviewBlobUrl;
  if (openNewTabBtn) openNewTabBtn.href = currentPreviewBlobUrl;

  if (modal) modal.classList.add("show");
}
window.previewBatchKeluarPdf = previewBatchKeluarPdf;

function applyPreviewBatchPdfKeluar() {
  const targetId = currentPreviewBatchItemId || (typeof window !== "undefined" && window.currentPreviewBatchItemId);
  if (!targetId) return;
  const entry = state.batchKeluarItems ? state.batchKeluarItems.find(b => b.id === targetId) : null;

  const agendaInput = document.getElementById("previewBatchKeluarAgendaInput");
  const kodeSelect = document.getElementById("previewBatchKeluarKodeSelect");
  const perihalInput = document.getElementById("previewBatchKeluarPerihalInput");
  const kepadaInput = document.getElementById("previewBatchKeluarKepadaInput");

  if (entry) {
    if (agendaInput && agendaInput.value.trim()) entry.noAgenda = agendaInput.value.trim();
    if (kodeSelect && kodeSelect.value) entry.kodeKlasifikasi = kodeSelect.value;
    if (perihalInput) entry.perihal = perihalInput.value.trim();
    if (kepadaInput) entry.kepada = kepadaInput.value.trim();

    renderBatchKeluarModalList();
    showToast(`✅ Data Surat Keluar agenda ${entry.noAgenda} berhasil diperbarui dari pratinjau!`, "success");
  }

  closePreviewBatchPdfModal();
}
window.applyPreviewBatchPdfKeluar = applyPreviewBatchPdfKeluar;

/**
 * Eksekusi Upload Batch Surat Keluar ke Google Drive & Simpan ke Spreadsheet
 */
async function executeBatchUploadKeluar() {
  const itemsToUpload = state.batchKeluarItems.filter(b => b.file && b.status !== 'success');
  if (itemsToUpload.length === 0) {
    showToast("Tidak ada berkas yang siap diunggah!", "warning");
    return;
  }

  const btnStart = document.getElementById("btnStartBatchUploadKeluar");
  const btnClose = document.getElementById("btnCancelBatchUploadKeluar");
  const progressBox = document.getElementById("batchProgressBox");
  const progressBar = document.getElementById("batchProgressBar");
  const progressPercent = document.getElementById("batchProgressPercentage");
  const progressStatus = document.getElementById("batchProgressStatusText");
  const progressDetail = document.getElementById("batchProgressCurrentDetail");

  if (btnStart) btnStart.disabled = true;
  if (btnClose) btnClose.disabled = true;
  if (progressBox) progressBox.style.display = "block";

  const total = itemsToUpload.length;
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < total; i++) {
    const entry = itemsToUpload[i];
    entry.status = 'uploading';
    renderBatchKeluarModalList();

    const percent = Math.round((i / total) * 100);
    if (progressBar) progressBar.style.width = `${percent}%`;
    if (progressPercent) progressPercent.textContent = `${percent}%`;
    if (progressStatus) progressStatus.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Mengunggah berkas ${i + 1} dari ${total}...`;
    if (progressDetail) progressDetail.textContent = `No. Agenda ${entry.noAgenda || '-'}: ${entry.perihal || entry.file.name}`;

    try {
      const fileBase64 = await readFileAsBase64(entry.file);

      if (entry.isExisting) {
        // Upload lampiran ke surat keluar existing
        const payload = {
          action: "upload_lampiran_keluar",
          no_agenda: String(entry.noAgenda).trim(),
          fileName: entry.file.name,
          fileBase64: fileBase64,
          fileMime: entry.file.type || "application/pdf",
          old_drive_url: entry.existingItem?.driveUrl || ""
        };

        const res = await postToAppsScript(payload);
        if (res && res.success && res.data && res.data.drive_file_url) {
          entry.status = 'success';
          const dUrl = res.data.drive_file_url;
          const target = state.suratKeluar.find(k => k.id === entry.existingItem?.id || k.noAgenda === entry.noAgenda);
          if (target) {
            target.driveUrl = dUrl;
            target.lampiran = dUrl;
            target.status = true;
          }
          successCount++;
        } else {
          entry.status = 'error';
          entry.errorMsg = res?.message || "Gagal mengunggah ke Drive";
          failCount++;
        }
      } else {
        // Catat surat keluar baru secara massal
        let romanMonth = "XI";
        let tahun = "2026";
        if (entry.tglSurat) {
          const parts = entry.tglSurat.split("-");
          tahun = parts[0];
          romanMonth = ROMAN_MONTHS[parseInt(parts[1], 10) - 1] || "XI";
        }
        const formattedTanggal = formatDateIndo(entry.tglSurat);
        const finalAgenda = String(entry.noAgenda).trim();
        const finalKode = entry.kodeKlasifikasi || "421.3";
        const fullNumber = `${finalKode}/${finalAgenda}/SMA YWKA TU/ ${romanMonth} /${tahun}`;

        const payload = {
          action: "create_surat_keluar",
          no_agenda: finalAgenda,
          no_urut: finalAgenda,
          nomor_urut: finalAgenda,
          kode_klasifikasi: finalKode,
          bulan_romawi: romanMonth,
          tahun: tahun,
          tanggal_surat: formattedTanggal,
          perihal: entry.perihal || entry.file.name.replace(/\.[^/.]+$/, ""),
          dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
          kepada: entry.kepada || "-",
          petugas: entry.petugas || (state.currentUser?.name || "Admin TU"),
          keterangan: "",
          fileBase64: fileBase64,
          fileName: entry.file.name,
          fileMime: entry.file.type || "application/pdf"
        };

        let newDriveUrl = "";
        if (state.appsScriptUrl) {
          const res = await postToAppsScript(payload);
          if (res && res.success) {
            entry.status = 'success';
            if (res.data?.drive_file_url) newDriveUrl = res.data.drive_file_url;

            const newItem = {
              id: "K-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
              noUrut: finalAgenda,
              noAgenda: finalAgenda,
              kodeKlasifikasi: finalKode,
              nomorLengkap: fullNumber,
              tanggal: formattedTanggal,
              perihal: payload.perihal,
              dari: payload.dari,
              kepada: payload.kepada,
              petugas: payload.petugas,
              keterangan: "",
              lampiran: newDriveUrl || "Surat Keluar",
              driveUrl: newDriveUrl,
              status: Boolean(newDriveUrl),
              isUnsynced: false
            };
            state.suratKeluar.push(newItem);
            state.suratKeluar.sort((a, b) => (parseInt(a.noAgenda || a.noUrut, 10) || 0) - (parseInt(b.noAgenda || b.noUrut, 10) || 0));
            calculateNextSequence();
            successCount++;
          } else {
            entry.status = 'error';
            entry.errorMsg = res?.message || "Gagal menyimpan ke Spreadsheet";
            failCount++;
          }
        } else {
          // Mode offline lokal
          entry.status = 'success';
          const newItem = {
            id: "K-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
            noUrut: finalAgenda,
            noAgenda: finalAgenda,
            kodeKlasifikasi: finalKode,
            nomorLengkap: fullNumber,
            tanggal: formattedTanggal,
            perihal: payload.perihal,
            dari: payload.dari,
            kepada: payload.kepada,
            petugas: payload.petugas,
            keterangan: "",
            lampiran: payload.fileName,
            driveUrl: "",
            status: false,
            isUnsynced: true
          };
          state.suratKeluar.push(newItem);
          state.suratKeluar.sort((a, b) => (parseInt(a.noAgenda || a.noUrut, 10) || 0) - (parseInt(b.noAgenda || b.noUrut, 10) || 0));
          calculateNextSequence();
          const unsyncedList = JSON.parse(localStorage.getItem("unsynced_surat_keluar") || "[]");
          unsyncedList.push(newItem);
          localStorage.setItem("unsynced_surat_keluar", JSON.stringify(unsyncedList));
          successCount++;
        }
      }
    } catch (err) {
      entry.status = 'error';
      entry.errorMsg = err.message || "Koneksi terputus";
      failCount++;
    }

    renderBatchKeluarModalList();
  }

  // Tuntaskan progress bar
  if (progressBar) progressBar.style.width = "100%";
  if (progressPercent) progressPercent.textContent = "100%";
  if (progressStatus) progressStatus.innerHTML = `<i class="fa-solid fa-circle-check text-emerald"></i> Proses upload batch selesai!`;
  if (progressDetail) progressDetail.textContent = `${successCount} berkas berhasil disimpan & diunggah${failCount > 0 ? `, ${failCount} gagal` : ''}.`;

  // Simpan cache lokal
  localStorage.setItem("cache_surat_keluar_2026", JSON.stringify(state.suratKeluar));

  // Perbarui UI tabel & dashboard
  filterSuratKeluarData();
  updateDashboardUI();
  updateBatchKeluarBar();

  if (btnStart) btnStart.disabled = false;
  if (btnClose) btnClose.disabled = false;

  if (successCount > 0) {
    showToast(`✅ Berhasil menyimpan & mengunggah ${successCount} berkas ke Surat Keluar!`, "success");
  }
  if (failCount > 0) {
    showToast(`⚠️ Ada ${failCount} berkas yang gagal diproses. Silakan periksa kembali baris tersebut.`, "warning");
  }
}
window.executeBatchUploadKeluar = executeBatchUploadKeluar;

/**
 * =========================================================================
 * BATCH UPLOAD SURAT MASUK (DENGAN EKSTRAKSI NAMA BERKAS & TIPE SURAT OTOMATIS)
 * =========================================================================
 */

const PENGIRIM_MASUK_OPTIONS = [
  "CABANG DINAS WIL.VII",
  "DINAS PENDIDIKAN PROVINSI JAWA BARAT",
  "YAYASAN WANITA KERETA API",
  "UNIVERSITAS / INSTITUT",
  "LAIN-LAIN",
  "SMPN / SMPS",
  "INSTANSI PEMERINTAHAN WILAYAH",
  "KEMENTRIAN PENDIDIKAN",
  "LEMBAGA EKSTERNAL",
  "PEMERINTAH KOTA BANDUNG",
  "PEMERINTAH PROVINSI JAWA BARAT",
  "BBPMP Provinsi Jawa Barat"
];

/**
 * Ekstrak Nomor Surat, Perihal, Tanggal, Instansi Pengirim & Tujuan dari teks dokumen PDF
 */
function extractLetterInfoFromPdfText(text) {
  let noSurat = "";
  let noAgenda = "";
  let kodeKlasifikasi = "";
  let perihal = "";
  let tglSurat = "";
  let pengirim = "";
  let kepada = "";

  if (!text) return { noSurat, noAgenda, kodeKlasifikasi, perihal, tglSurat, pengirim, kepada };

  // Pola khusus kop Surat Keluar SMA YWKA:
  // Contoh: 421.7/691/SMA YWKA TU/ XI /2026 atau 421.3 / 708 / SMA YWKA TU / XI / 2026
  const kopYwkaMatch = text.match(/\b(42[1-5]\.[0-9a-zA-Z.-]+)\s*[\/:]\s*(\d+)\s*[\/:]\s*SMA\s*YWKA/i);
  if (kopYwkaMatch) {
    kodeKlasifikasi = kopYwkaMatch[1].trim();
    noAgenda = kopYwkaMatch[2].trim();
    noSurat = kopYwkaMatch[0].trim();
  }

  // 1. Ekstrak Nomor Surat Asal (dari Kop/Header surat):
  if (!noSurat) {
    const noMatch = text.match(/(?:nomor(?:\s*surat)?|no\.?)\s*[:=]\s*([^\r\n,;]+)/i);
    if (noMatch) {
      let rawNo = noMatch[1].trim();
      rawNo = rawNo.split(/\s+(?:lampiran|sifat|hal|perihal|tanggal|klasifikasi)\b/i)[0].trim();
      rawNo = rawNo.replace(/^[-–—:\s]+|[-–—:\s]+$/g, "");
      if (rawNo.length >= 3 && !/^(surat|lampiran|penting|segera|rahasia)$/i.test(rawNo)) {
        noSurat = rawNo;
      }
    }
  }

  // Jika belum dapat via "Nomor :", cari pola format surat dinas bergaris miring
  if (!noSurat) {
    const slashPattern = text.match(/\b([0-9a-zA-Z.-]+\/[0-9a-zA-Z./-]+(?:\/[0-9a-zA-Z./-]+)*)\b/);
    if (slashPattern && slashPattern[1].length >= 5 && !slashPattern[1].includes("http")) {
      noSurat = slashPattern[1].trim();
    }
  }

  if (!noAgenda && noSurat) {
    const agMatch = noSurat.match(/\/(\d{1,4})\//);
    if (agMatch) noAgenda = agMatch[1];
  }

  // 2. Ekstrak Perihal / Hal dari badan teks
  const halMatch = text.match(/(?:perihal|hal)\s*[:=]\s*([^\r\n]+)/i);
  if (halMatch) {
    let rawHal = halMatch[1].trim();
    rawHal = rawHal.split(/\s+(?:kepada|lampiran|di\s+tempat|yth)\b/i)[0].trim();
    rawHal = rawHal.replace(/^[-–—:\s]+|[-–—:\s]+$/g, "");
    if (rawHal.length >= 5) {
      perihal = rawHal;
    }
  }

  // 3. Ekstrak Kepada / Yth
  const ythMatch = text.match(/(?:kepada\s*yth\.?|yth\.?)\s*([^\r\n]+)/i);
  if (ythMatch) {
    let rawYth = ythMatch[1].trim();
    rawYth = rawYth.split(/\s+(?:di\s+tempat|di\s+bandung|perihal|hal)\b/i)[0].trim();
    rawYth = rawYth.replace(/^[-–—:\s]+|[-–—:\s]+$/g, "");
    if (rawYth.length >= 3) {
      kepada = rawYth;
    }
  }

  // 4. Ekstrak Tanggal Surat (format Indonesia)
  const tglMatch = text.match(/(?:bandung,?\s*)?(\d{1,2})\s+(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\s+(\d{4})/i);
  if (tglMatch) {
    const day = String(tglMatch[1]).padStart(2, '0');
    const monthNames = ["januari", "februari", "maret", "april", "mei", "juni", "juli", "agustus", "september", "oktober", "november", "desember"];
    const monthIdx = monthNames.indexOf(tglMatch[2].toLowerCase()) + 1;
    if (monthIdx > 0) {
      const month = String(monthIdx).padStart(2, '0');
      const year = tglMatch[3];
      tglSurat = `${year}-${month}-${day}`;
    }
  }

  // 5. Deteksi Pengirim dari Kop Surat
  const lower = text.toLowerCase();
  if (lower.includes("cabang dinas pendidikan wilayah vii") || lower.includes("cadisdik wil. vii") || lower.includes("cadisdik") || lower.includes("kcd")) {
    pengirim = "CABANG DINAS WIL.VII";
  } else if (lower.includes("dinas pendidikan provinsi jawa barat") || lower.includes("disdik jabar")) {
    pengirim = "DINAS PENDIDIKAN PROVINSI JAWA BARAT";
  } else if (lower.includes("yayasan wanita kereta api") || lower.includes("ywka")) {
    pengirim = "YAYASAN WANITA KERETA API";
  } else if (lower.includes("balai besar penjaminan mutu pendidikan") || lower.includes("bbpmp")) {
    pengirim = "BBPMP Provinsi Jawa Barat";
  } else if (lower.includes("universitas") || lower.includes("institut") || lower.includes("polban") || lower.includes("itb") || lower.includes("upi")) {
    pengirim = "UNIVERSITAS / INSTITUT";
  } else if (lower.includes("smp ") || lower.includes("smpn") || lower.includes("mts")) {
    pengirim = "SMPN / SMPS";
  } else if (lower.includes("pemerintah kota bandung")) {
    pengirim = "PEMERINTAH KOTA BANDUNG";
  } else if (lower.includes("pemerintah daerah provinsi jawa barat") || lower.includes("pemerintah provinsi jawa barat")) {
    pengirim = "PEMERINTAH PROVINSI JAWA BARAT";
  }

  return { noSurat, noAgenda, kodeKlasifikasi, perihal, tglSurat, pengirim, kepada };
}
window.extractLetterInfoFromPdfText = extractLetterInfoFromPdfText;

/**
 * Pindai isi berkas PDF menggunakan PDF.js untuk mengekstrak teks halaman 1
 */
async function scanPdfForLetterData(file) {
  if (!window.pdfjsLib) return null;
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    if (!pdf || pdf.numPages === 0) return null;

    // Baca halaman 1 (Kop & Nomor Surat selalu di halaman 1)
    const page = await pdf.getPage(1);
    const textContent = await page.getTextContent();
    const textItems = textContent.items.map(item => item.str);
    const fullText = textItems.join(" ");

    return extractLetterInfoFromPdfText(fullText);
  } catch (err) {
    console.warn("Gagal mengekstrak teks PDF:", file.name, err);
    return null;
  }
}
window.scanPdfForLetterData = scanPdfForLetterData;

/**
 * Parser Cerdas Nama Berkas Surat Masuk
 * Menghapus ekstensi, membersihkan pemisah, mengekstrak nomor agenda (jika ada di nama berkas),
 * dan mendeteksi Tipe Surat / Instansi Pengirim secara otomatis.
 */
function parseFileNameForSuratMasuk(fileName) {
  if (!fileName) return { perihal: "", noAgenda: "", pengirim: "LAIN-LAIN" };

  // 1. Hapus ekstensi berkas (.pdf, .docx, .png, dll)
  let base = fileName.replace(/\.[^/.]+$/, "").trim();

  // 2. Normalisasi underscore dan spasi berlebih
  base = base.replace(/_+/g, " ").replace(/\s+/g, " ").trim();

  let noAgenda = "";
  let perihal = base;

  // Cek awalan nomor/kode agenda surat jika ada:
  // Pola A: Angka di awal yang diikuti pemisah (contoh: "045 - Undangan MKKS" atau "218_Surat Tugas")
  const leadMatch = base.match(/^(\d+[a-zA-Z0-9/.-]*)\s*[-–—:]\s*(.+)$/);
  if (leadMatch) {
    noAgenda = leadMatch[1].trim();
    perihal = leadMatch[2].trim();
  } else {
    // Pola B: "No. 045 - Undangan" atau "Agenda 218: Edaran"
    const agendaMatch = base.match(/^(?:no\.?|agenda)\s*([0-9a-zA-Z/.-]+)\s*[-–—:]?\s*(.+)$/i);
    if (agendaMatch) {
      noAgenda = agendaMatch[1].trim();
      perihal = agendaMatch[2].trim();
    }
  }

  // Jika perihal seluruhnya huruf besar (ALL CAPS) atau huruf kecil, ubah ke format Title Case yang rapi
  if (perihal === perihal.toUpperCase() || perihal === perihal.toLowerCase()) {
    perihal = perihal.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }

  // 3. Deteksi Instansi Pengirim / Tipe Surat secara otomatis dari nama file
  const lowerBase = (base + " " + fileName).toLowerCase();
  let pengirim = "LAIN-LAIN";

  if (lowerBase.includes("cadisdik") || lowerBase.includes("wil.vii") || lowerBase.includes("wil vii") || lowerBase.includes("kcd") || lowerBase.includes("wilayah vii")) {
    pengirim = "CABANG DINAS WIL.VII";
  } else if (lowerBase.includes("disdik") || lowerBase.includes("dinas pendidikan")) {
    pengirim = "DINAS PENDIDIKAN PROVINSI JAWA BARAT";
  } else if (lowerBase.includes("ywka") || lowerBase.includes("yayasan") || lowerBase.includes("wanita kereta api")) {
    pengirim = "YAYASAN WANITA KERETA API";
  } else if (lowerBase.includes("bbpmp") || lowerBase.includes("bpmp") || lowerBase.includes("lpmp")) {
    pengirim = "BBPMP Provinsi Jawa Barat";
  } else if (lowerBase.includes("smpn") || lowerBase.includes("smps") || lowerBase.includes("smp ") || lowerBase.includes("mts")) {
    pengirim = "SMPN / SMPS";
  } else if (lowerBase.includes("univ") || lowerBase.includes("institut") || lowerBase.includes("itb") || lowerBase.includes("upi") || lowerBase.includes("unpad") || lowerBase.includes("unpas") || lowerBase.includes("polban") || lowerBase.includes("telkom")) {
    pengirim = "UNIVERSITAS / INSTITUT";
  } else if (lowerBase.includes("pemkot") || lowerBase.includes("kota bandung")) {
    pengirim = "PEMERINTAH KOTA BANDUNG";
  } else if (lowerBase.includes("pemprov") || lowerBase.includes("jabar") || lowerBase.includes("gubernur") || lowerBase.includes("setda")) {
    pengirim = "PEMERINTAH PROVINSI JAWA BARAT";
  } else if (lowerBase.includes("kemendikbud") || lowerBase.includes("kemdikbud") || lowerBase.includes("kementerian") || lowerBase.includes("kementrian")) {
    pengirim = "KEMENTRIAN PENDIDIKAN";
  } else if (lowerBase.includes("polsek") || lowerBase.includes("koramil") || lowerBase.includes("polrestabes") || lowerBase.includes("kelurahan") || lowerBase.includes("kecamatan") || lowerBase.includes("puskesmas")) {
    pengirim = "INSTANSI PEMERINTAHAN WILAYAH";
  }

  return {
    perihal: perihal,
    noAgenda: noAgenda || "",
    pengirim: pengirim
  };
}
window.parseFileNameForSuratMasuk = parseFileNameForSuratMasuk;

/**
 * Buka modal Upload Batch Surat Masuk
 * @param {Array<string>|null} targetIds Daftar ID surat spesifik jika dicentang dari tabel
 */
function openBatchUploadModalMasuk(targetIds = null) {
  const modal = document.getElementById("modalBatchUploadMasuk");
  if (!modal) return;

  const progressBox = document.getElementById("batchMasukProgressBox");
  if (progressBox) progressBox.style.display = "none";

  // Pre-fill input global tanggal ke hari ini
  const globalTgl = document.getElementById("batchMasukGlobalTanggal");
  if (globalTgl && !globalTgl.value) {
    globalTgl.value = new Date().toISOString().split("T")[0];
  }

  if (targetIds && targetIds.length > 0) {
    // Mode Pasangkan Berkas ke Surat Terpilih
    state.batchMasukMode = "match";
    const selectedItems = targetIds.map(id => state.suratMasuk.find(m => m.id === id)).filter(Boolean);
    state.batchMasukItems = selectedItems.map(item => ({
      id: "BM-EXISTING-" + item.id,
      isExisting: true,
      existingItem: item,
      noUrut: item.noUrut || "",
      noAgenda: item.noAgenda || "",
      perihal: item.perihal || "",
      dari: item.dari || "LAIN-LAIN",
      tglSurat: item.tglSurat || new Date().toISOString().split("T")[0],
      tglTerima: item.tglMasuk || new Date().toISOString().split("T")[0],
      disposisi: item.keterangan || "",
      kodeKlasifikasi: item.kodeKlasifikasi || "",
      file: null,
      status: 'idle',
      isScanningPdf: false,
      errorMsg: ''
    }));
  } else if (state.selectedMasukIds && state.selectedMasukIds.size > 0) {
    state.batchMasukMode = "match";
    const selectedItems = Array.from(state.selectedMasukIds).map(id => state.suratMasuk.find(m => m.id === id)).filter(Boolean);
    state.batchMasukItems = selectedItems.map(item => ({
      id: "BM-EXISTING-" + item.id,
      isExisting: true,
      existingItem: item,
      noUrut: item.noUrut || "",
      noAgenda: item.noAgenda || "",
      perihal: item.perihal || "",
      dari: item.dari || "LAIN-LAIN",
      tglSurat: item.tglSurat || new Date().toISOString().split("T")[0],
      tglTerima: item.tglMasuk || new Date().toISOString().split("T")[0],
      disposisi: item.keterangan || "",
      kodeKlasifikasi: item.kodeKlasifikasi || "",
      file: null,
      status: 'idle',
      isScanningPdf: false,
      errorMsg: ''
    }));
  } else {
    // Mode Entri Baru
    state.batchMasukMode = "new";
    if (!state.batchMasukItems) state.batchMasukItems = [];
  }

  renderBatchMasukModalList();
  modal.classList.add("show");
}
window.openBatchUploadModalMasuk = openBatchUploadModalMasuk;

function closeBatchUploadModalMasuk() {
  const modal = document.getElementById("modalBatchUploadMasuk");
  if (modal) modal.classList.remove("show");
}
window.closeBatchUploadModalMasuk = closeBatchUploadModalMasuk;

/**
 * Handle berkas-berkas yang di-drop atau dipilih di modal Batch Upload Surat Masuk
 */
function handleBatchMasukFiles(fileList) {
  if (!fileList || fileList.length === 0) return;

  const files = Array.from(fileList);
  const todayIso = new Date().toISOString().split("T")[0];
  let baseNoUrut = getNextNoUrutMasuk();

  // Jika sudah ada item di antrean, cari nomor urut tertinggi yang sudah ada
  if (state.batchMasukItems && state.batchMasukItems.length > 0) {
    const existingMax = Math.max(...state.batchMasukItems.map(b => parseInt(b.noUrut, 10) || 0));
    if (existingMax >= baseNoUrut) {
      baseNoUrut = existingMax + 1;
    }
  }

  let matchedExistingCount = 0;
  let addedNewCount = 0;

  files.forEach((file, idx) => {
    // Abaikan jika file yang sama persis sudah masuk
    if (state.batchMasukItems.some(b => b.file && b.file.name === file.name && b.file.size === file.size)) {
      return;
    }

    // 1. Coba pasangkan ke item existing yang belum punya file (jika ada)
    const emptyExisting = state.batchMasukItems.find(b => b.isExisting && !b.file);
    if (emptyExisting) {
      emptyExisting.file = file;
      emptyExisting.status = 'ready';
      emptyExisting.isScanningPdf = (file.type === "application/pdf" || (file.name && file.name.toLowerCase().endsWith(".pdf")));
      matchedExistingCount++;

      if (emptyExisting.isScanningPdf) {
        scanPdfForLetterData(file).then(info => {
          emptyExisting.isScanningPdf = false;
          if (info) {
            if (info.noSurat && (!emptyExisting.noAgenda || emptyExisting.noAgenda === "-" || emptyExisting.noAgenda.startsWith("Agenda-"))) {
              emptyExisting.noAgenda = info.noSurat;
            }
            if (info.perihal && (!emptyExisting.perihal || emptyExisting.perihal === "-")) {
              emptyExisting.perihal = info.perihal;
            }
            if (info.tglSurat && (!emptyExisting.tglSurat || emptyExisting.tglSurat === "-")) {
              emptyExisting.tglSurat = info.tglSurat;
            }
            if (info.pengirim && (emptyExisting.dari === "LAIN-LAIN" || !emptyExisting.dari)) {
              emptyExisting.dari = info.pengirim;
            }
          }
          renderBatchMasukModalList();
        }).catch(() => {
          emptyExisting.isScanningPdf = false;
          renderBatchMasukModalList();
        });
      }
      return;
    }

    // 2. Jika tidak, tambahkan sebagai entri Surat Masuk baru
    const parsed = parseFileNameForSuratMasuk(file.name);
    const assignedUrut = baseNoUrut + addedNewCount;
    const isPdf = (file.type === "application/pdf" || (file.name && file.name.toLowerCase().endsWith(".pdf")));

    const newEntry = {
      id: "BMI-" + Date.now() + "-" + idx + "-" + Math.random().toString(36).substring(2, 6),
      isExisting: false,
      noUrut: assignedUrut,
      noAgenda: parsed.noAgenda || "", // Jangan isi dengan no urut!
      perihal: parsed.perihal || file.name.replace(/\.[^/.]+$/, ""),
      dari: parsed.pengirim || "LAIN-LAIN",
      tglSurat: todayIso,
      tglTerima: todayIso,
      disposisi: "",
      kodeKlasifikasi: "",
      file: file,
      status: 'ready',
      isScanningPdf: isPdf,
      errorMsg: ''
    };

    state.batchMasukItems.push(newEntry);
    addedNewCount++;

    // Jika berkas adalah PDF, jalankan pemindaian isi teks di latar belakang
    if (newEntry.isScanningPdf) {
      scanPdfForLetterData(file).then(info => {
        newEntry.isScanningPdf = false;
        if (info) {
          if (info.noSurat && !newEntry.noAgenda) {
            newEntry.noAgenda = info.noSurat;
          }
          if (info.perihal && (!newEntry.perihal || newEntry.perihal.toLowerCase().includes("scan") || newEntry.perihal === file.name.replace(/\.[^/.]+$/, ""))) {
            newEntry.perihal = info.perihal;
          }
          if (info.tglSurat) {
            newEntry.tglSurat = info.tglSurat;
          }
          if (info.pengirim && newEntry.dari === "LAIN-LAIN") {
            newEntry.dari = info.pengirim;
          }
        }
        renderBatchMasukModalList();
      }).catch(() => {
        newEntry.isScanningPdf = false;
        renderBatchMasukModalList();
      });
    }
  });

  renderBatchMasukModalList();

  if (addedNewCount > 0 || matchedExistingCount > 0) {
    showToast(`✅ Berhasil menambahkan ${addedNewCount + matchedExistingCount} berkas surat masuk! Sistem sedang membaca isi PDF untuk mengekstrak Nomor Surat asli.`, "success");
  }
}
window.handleBatchMasukFiles = handleBatchMasukFiles;

/**
 * Pindai ulang seluruh berkas PDF dalam antrean modal batch upload Surat Masuk
 */
async function rescanAllBatchMasukPdf() {
  const pdfItems = state.batchMasukItems ? state.batchMasukItems.filter(b => b.file && (b.file.type === "application/pdf" || b.file.name.toLowerCase().endsWith(".pdf"))) : [];
  if (pdfItems.length === 0) {
    showToast("Tidak ada berkas PDF dalam antrean!", "info");
    return;
  }

  showToast(`🔍 Memindai ${pdfItems.length} berkas PDF...`, "info");
  let foundCount = 0;

  for (const item of pdfItems) {
    item.isScanningPdf = true;
    renderBatchMasukModalList();
    const info = await scanPdfForLetterData(item.file);
    item.isScanningPdf = false;
    if (info) {
      if (info.noSurat) {
        item.noAgenda = info.noSurat;
        foundCount++;
      }
      if (info.perihal && (!item.perihal || item.perihal.toLowerCase().includes("scan"))) {
        item.perihal = info.perihal;
      }
      if (info.tglSurat) {
        item.tglSurat = info.tglSurat;
      }
      if (info.pengirim && item.dari === "LAIN-LAIN") {
        item.dari = info.pengirim;
      }
    }
  }

  renderBatchMasukModalList();
  showToast(`✅ Pemindaian selesai! Berhasil menemukan ${foundCount} nomor surat asli dari isi PDF.`, "success");
}
window.rescanAllBatchMasukPdf = rescanAllBatchMasukPdf;

// Pratinjau Cek PDF Dokumen Tunggal
let currentPreviewBatchItemId = null;
let currentPreviewBlobUrl = null;
let currentPreviewType = "masuk"; // "masuk" or "keluar"

function previewBatchMasukPdf(itemId) {
  const entry = state.batchMasukItems ? state.batchMasukItems.find(b => b.id === itemId) : null;
  if (!entry || !entry.file) {
    showToast("Berkas dokumen belum dipilih!", "warning");
    return;
  }

  currentPreviewBatchItemId = itemId;
  currentPreviewType = "masuk";
  if (typeof window !== "undefined") {
    window.currentPreviewBatchItemId = itemId;
    window.currentPreviewType = "masuk";
  }

  const modal = document.getElementById("modalPreviewBatchPdf");
  const titleEl = document.getElementById("previewBatchPdfTitle");
  const headerEl = document.getElementById("previewBatchPdfHeader");
  const fileNameEl = document.getElementById("previewBatchPdfFileName");
  const noAgendaInput = document.getElementById("previewBatchPdfNoAgendaInput");
  const iframe = document.getElementById("previewBatchPdfIframe");
  const openNewTabBtn = document.getElementById("btnPreviewPdfOpenNewTab");

  const masukControls = document.getElementById("previewBatchPdfMasukControls");
  const keluarControls = document.getElementById("previewBatchPdfKeluarControls");

  if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-file-pdf text-danger"></i> Cek Dokumen PDF &amp; Verifikasi Nomor Surat Asal`;
  if (headerEl) {
    headerEl.style.background = "#f0fdf4";
    headerEl.style.borderBottom = "1px solid #bbf7d0";
  }
  if (masukControls) masukControls.style.display = "flex";
  if (keluarControls) keluarControls.style.display = "none";

  if (fileNameEl) fileNameEl.textContent = entry.file.name;
  if (noAgendaInput) {
    noAgendaInput.value = entry.noAgenda || "";
    setTimeout(() => noAgendaInput.focus(), 150);
  }

  if (currentPreviewBlobUrl) {
    URL.revokeObjectURL(currentPreviewBlobUrl);
    currentPreviewBlobUrl = null;
  }

  currentPreviewBlobUrl = URL.createObjectURL(entry.file);
  if (iframe) iframe.src = currentPreviewBlobUrl;
  if (openNewTabBtn) openNewTabBtn.href = currentPreviewBlobUrl;

  if (modal) modal.classList.add("show");
}
window.previewBatchMasukPdf = previewBatchMasukPdf;

function applyPreviewBatchPdfNoAgenda() {
  const targetId = currentPreviewBatchItemId || (typeof window !== "undefined" && window.currentPreviewBatchItemId);
  if (!targetId) return;
  const entry = state.batchMasukItems ? state.batchMasukItems.find(b => b.id === targetId) : null;
  const input = document.getElementById("previewBatchPdfNoAgendaInput");

  if (entry && input) {
    entry.noAgenda = input.value.trim();
    renderBatchMasukModalList();
    showToast(`✅ No. Agenda / Asal diperbarui: "${entry.noAgenda}"`, "success");
  }

  closePreviewBatchPdfModal();
}
window.applyPreviewBatchPdfNoAgenda = applyPreviewBatchPdfNoAgenda;

function closePreviewBatchPdfModal() {
  const modal = document.getElementById("modalPreviewBatchPdf");
  const iframe = document.getElementById("previewBatchPdfIframe");
  if (modal) modal.classList.remove("show");
  if (iframe) iframe.src = "about:blank";
  if (currentPreviewBlobUrl) {
    URL.revokeObjectURL(currentPreviewBlobUrl);
    currentPreviewBlobUrl = null;
  }
  currentPreviewBatchItemId = null;
  if (typeof window !== "undefined") window.currentPreviewBatchItemId = null;
}
window.closePreviewBatchPdfModal = closePreviewBatchPdfModal;

/**
 * Render tabel daftar berkas di modal upload batch Surat Masuk
 */
function renderBatchMasukModalList() {
  const tbody = document.getElementById("tbodyBatchMasukItems");
  const summaryStats = document.getElementById("batchMasukSummaryStats");
  const readyCountSpan = document.getElementById("batchMasukReadyCount");
  const btnStart = document.getElementById("btnStartBatchUploadMasuk");

  if (!tbody) return;

  const total = state.batchMasukItems ? state.batchMasukItems.length : 0;
  const ready = state.batchMasukItems ? state.batchMasukItems.filter(b => b.file && b.status !== 'success').length : 0;

  if (summaryStats) {
    summaryStats.textContent = `${total} berkas terdaftar • ${ready} siap upload`;
  }
  if (readyCountSpan) {
    readyCountSpan.textContent = ready;
  }
  if (btnStart) {
    btnStart.disabled = (ready === 0);
  }

  if (total === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align: center; color: #94a3b8; padding: 36px 16px;">
          <i class="fa-solid fa-cloud-arrow-up" style="font-size: 32px; display: block; margin-bottom: 8px; color: #cbd5e1;"></i>
          Belum ada berkas yang dipilih. Silakan tarik &amp; jatuhkan berkas di area atas atau klik tombol <strong>"Pilih Berkas"</strong>.
        </td>
      </tr>
    `;
    return;
  }

  let html = "";
  state.batchMasukItems.forEach((entry, idx) => {
    const pengirimSelectOptions = PENGIRIM_MASUK_OPTIONS.map(opt => {
      const isSel = (entry.dari === opt) ? 'selected' : '';
      return `<option value="${escapeHtml(opt)}" ${isSel}>${escapeHtml(opt)}</option>`;
    }).join("");

    let fileCol = "";
    if (entry.file) {
      fileCol = `
        <div class="batch-file-matched" style="max-width: 220px;" title="${escapeHtml(entry.file.name)}">
          <i class="fa-solid fa-file-pdf text-danger"></i>
          <span class="batch-file-name">${escapeHtml(entry.file.name)}</span>
          <span class="batch-file-size">(${formatFileSize(entry.file.size)})</span>
          <button type="button" class="btn-remove-matched-file" onclick="previewBatchMasukPdf('${entry.id}')" title="Cek & Intip Dokumen PDF" style="color: #2563eb; margin-left: 2px;"><i class="fa-solid fa-eye"></i></button>
          <button type="button" class="btn-remove-matched-file" onclick="removeBatchMasukFile('${entry.id}')" title="Lepas berkas">&times;</button>
        </div>
      `;
    } else {
      fileCol = `<span class="batch-no-file-text">Belum ada file</span>`;
    }

    let statusCol = "";
    if (entry.status === 'ready') {
      statusCol = `<span class="badge" style="background:#ecfdf5; color:#059669; font-size:11px;"><i class="fa-solid fa-check"></i> Siap</span>`;
    } else if (entry.status === 'uploading') {
      statusCol = `<span class="badge" style="background:#eff6ff; color:#2563eb; font-size:11px;"><i class="fa-solid fa-spinner fa-spin"></i> Upload...</span>`;
    } else if (entry.status === 'success') {
      statusCol = `<span class="badge" style="background:#dcfce7; color:#166534; font-size:11px;"><i class="fa-solid fa-circle-check"></i> Selesai</span>`;
    } else if (entry.status === 'error') {
      statusCol = `<span class="badge" style="background:#fee2e2; color:#dc2626; font-size:11px;" title="${escapeHtml(entry.errorMsg || 'Gagal')}"><i class="fa-solid fa-circle-exclamation"></i> Gagal</span>`;
    } else {
      statusCol = `<span class="badge" style="background:#f1f5f9; color:#64748b; font-size:11px;">Menunggu</span>`;
    }

    html += `
      <tr data-item-id="${entry.id}">
        <td style="text-align: center;">
          <input type="number" class="batch-table-input stat-mono font-bold" style="width: 55px; text-align: center;" value="${entry.noUrut || (idx + 1)}" onchange="updateBatchMasukField('${entry.id}', 'noUrut', this.value)" title="No. Urut Surat Masuk">
        </td>
        <td>
          <input type="text" class="batch-table-input font-bold" value="${escapeHtml(entry.noAgenda || '')}" placeholder="Ketik No. Surat Asal..." onchange="updateBatchMasukField('${entry.id}', 'noAgenda', this.value)" style="${entry.noAgenda ? 'color: #065f46; background: #f0fdf4; border-color: #86efac;' : 'border-color: #f59e0b; background: #fffbeb;'}">
          ${entry.isScanningPdf ? `<div style="font-size:10px; color:#2563eb; margin-top:2px;"><i class="fa-solid fa-spinner fa-spin"></i> Memindai PDF...</div>` : ''}
          ${!entry.isScanningPdf && !entry.noAgenda && entry.file ? `<button type="button" class="btn btn-xs btn-outline" style="margin-top:3px; font-size:10px; padding:1px 5px; color:#d97706; border-color:#fde68a;" onclick="previewBatchMasukPdf('${entry.id}')" title="Buka berkas untuk cek nomor surat"><i class="fa-solid fa-eye"></i> Cek PDF</button>` : ''}
        </td>
        <td>
          <textarea class="batch-table-input" rows="2" placeholder="Prihal / Keterangan Surat" onchange="updateBatchMasukField('${entry.id}', 'perihal', this.value)" style="min-height: 48px; resize: vertical;">${escapeHtml(entry.perihal || '')}</textarea>
        </td>
        <td>
          <select class="batch-table-input font-bold" onchange="updateBatchMasukField('${entry.id}', 'dari', this.value)">
            ${pengirimSelectOptions}
          </select>
        </td>
        <td>
          <input type="date" class="batch-table-input" value="${entry.tglSurat || ''}" onchange="updateBatchMasukField('${entry.id}', 'tglSurat', this.value)" title="Tanggal Surat">
        </td>
        <td>
          <input type="date" class="batch-table-input" value="${entry.tglTerima || ''}" onchange="updateBatchMasukField('${entry.id}', 'tglTerima', this.value)" title="Tanggal Diterima">
        </td>
        <td>
          <input type="text" class="batch-table-input" value="${escapeHtml(entry.disposisi || '')}" placeholder="Disposisi" onchange="updateBatchMasukField('${entry.id}', 'disposisi', this.value)">
        </td>
        <td>${fileCol}</td>
        <td style="text-align: center;">${statusCol}</td>
        <td style="text-align: center;">
          <button type="button" class="btn-action-icon btn-del" onclick="removeBatchMasukItem('${entry.id}')" title="Hapus baris ini">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}
window.renderBatchMasukModalList = renderBatchMasukModalList;

/**
 * Update field item di batch upload Surat Masuk
 */
function updateBatchMasukField(itemId, field, value) {
  const item = state.batchMasukItems.find(b => b.id === itemId);
  if (!item) return;
  item[field] = value;
}
window.updateBatchMasukField = updateBatchMasukField;

/**
 * Lepas file dari baris tertentu di modal batch upload Surat Masuk
 */
function removeBatchMasukFile(itemId) {
  const item = state.batchMasukItems.find(b => b.id === itemId);
  if (!item) return;
  item.file = null;
  if (item.status !== 'success') item.status = 'idle';
  renderBatchMasukModalList();
}
window.removeBatchMasukFile = removeBatchMasukFile;

/**
 * Hapus seluruh baris entri di modal batch upload Surat Masuk
 */
function removeBatchMasukItem(itemId) {
  state.batchMasukItems = state.batchMasukItems.filter(b => b.id !== itemId);
  renderBatchMasukModalList();
}
window.removeBatchMasukItem = removeBatchMasukItem;

/**
 * Terapkan instansi pengirim global ke seluruh baris surat masuk
 */
function applyGlobalPengirimToBatchMasuk() {
  const select = document.getElementById("batchMasukGlobalPengirim");
  if (!select || !select.value) {
    showToast("Silakan pilih instansi pengirim terlebih dahulu!", "warning");
    return;
  }
  const val = select.value;
  state.batchMasukItems.forEach(b => {
    b.dari = val;
  });
  renderBatchMasukModalList();
  showToast(`Pengirim "${val}" diterapkan ke seluruh surat dalam daftar!`, "success");
}
window.applyGlobalPengirimToBatchMasuk = applyGlobalPengirimToBatchMasuk;

/**
 * Terapkan tanggal global ke seluruh baris surat masuk
 */
function applyGlobalTglToBatchMasuk() {
  const input = document.getElementById("batchMasukGlobalTanggal");
  if (!input || !input.value) {
    showToast("Silakan tentukan tanggal terlebih dahulu!", "warning");
    return;
  }
  const val = input.value;
  state.batchMasukItems.forEach(b => {
    b.tglSurat = val;
    b.tglTerima = val;
  });
  renderBatchMasukModalList();
  showToast(`Tanggal "${val}" diterapkan ke seluruh surat dalam daftar!`, "success");
}
window.applyGlobalTglToBatchMasuk = applyGlobalTglToBatchMasuk;

/**
 * Terapkan disposisi global ke seluruh baris surat masuk
 */
function applyGlobalDisposisiToBatchMasuk() {
  const input = document.getElementById("batchMasukGlobalDisposisi");
  const val = input ? input.value.trim() : "";
  state.batchMasukItems.forEach(b => {
    b.disposisi = val;
  });
  renderBatchMasukModalList();
  showToast(`Disposisi "${val || '(kosong)'}" diterapkan ke seluruh surat dalam daftar!`, "success");
}
window.applyGlobalDisposisiToBatchMasuk = applyGlobalDisposisiToBatchMasuk;

/**
 * Eksekusi Batch Upload Surat Masuk ke Google Drive & Simpan ke Spreadsheet
 */
async function executeBatchUploadMasuk() {
  const itemsToUpload = state.batchMasukItems.filter(b => b.file && b.status !== 'success');
  if (itemsToUpload.length === 0) {
    showToast("Tidak ada berkas yang siap diunggah!", "warning");
    return;
  }

  const btnStart = document.getElementById("btnStartBatchUploadMasuk");
  const btnClose = document.getElementById("btnCancelBatchUploadMasuk");
  const progressBox = document.getElementById("batchMasukProgressBox");
  const progressBar = document.getElementById("batchMasukProgressBar");
  const progressPercent = document.getElementById("batchMasukProgressPercentage");
  const progressStatus = document.getElementById("batchMasukProgressStatusText");
  const progressDetail = document.getElementById("batchMasukProgressCurrentDetail");

  if (btnStart) btnStart.disabled = true;
  if (btnClose) btnClose.disabled = true;
  if (progressBox) progressBox.style.display = "block";

  const total = itemsToUpload.length;
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < total; i++) {
    const entry = itemsToUpload[i];
    entry.status = 'uploading';
    renderBatchMasukModalList();

    const percent = Math.round((i / total) * 100);
    if (progressBar) progressBar.style.width = `${percent}%`;
    if (progressPercent) progressPercent.textContent = `${percent}%`;
    if (progressStatus) progressStatus.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Mengunggah berkas ${i + 1} dari ${total}...`;
    if (progressDetail) progressDetail.textContent = `No. ${entry.noUrut || '-'}: ${entry.perihal || entry.file.name}`;

    try {
      // Surat Masuk: sisipkan watermark No. Urut + Tanggal ke berkas PDF sebelum upload
      const fileForUpload = await addWatermarkToPdfFile(entry.file, entry.noUrut, entry.tglSurat || entry.tglMasuk || "");
      const fileBase64 = await readFileAsBase64(fileForUpload);

      if (entry.isExisting) {
        // Upload lampiran ke surat masuk existing
        const payload = {
          action: "upload_lampiran_masuk",
          no_agenda: entry.noAgenda,
          no_urut: entry.noUrut,
          fileName: entry.file.name,
          fileBase64: fileBase64,
          fileMime: entry.file.type || "application/pdf"
        };
        const res = await postToAppsScript(payload);
        if (res && res.success && res.data && res.data.drive_file_url) {
          entry.status = 'success';
          const dUrl = res.data.drive_file_url;
          const target = state.suratMasuk.find(m => m.id === entry.existingItem?.id || (m.noAgenda && m.noAgenda === entry.noAgenda));
          if (target) {
            target.driveUrl = dUrl;
            target.lampiran = dUrl;
          }
          successCount++;
        } else {
          entry.status = 'error';
          entry.errorMsg = res?.message || "Gagal mengunggah ke Drive";
          failCount++;
        }
      } else {
        // Catat surat masuk baru secara massal
        const formattedTglSurat = formatDateIndo(entry.tglSurat);
        const formattedTglTerima = formatDateIndo(entry.tglTerima);
        const finalNoAgenda = (entry.noAgenda && entry.noAgenda.trim()) ? entry.noAgenda.trim() : "-";

        const payload = {
          action: "create_surat_masuk",
          no_urut: entry.noUrut,
          no_agenda: finalNoAgenda,
          tanggal_surat: formattedTglSurat,
          tanggal_diterima: formattedTglTerima,
          perihal: entry.perihal,
          dari: entry.dari || "LAIN-LAIN",
          kepada: "SMA YWKA",
          kode_klasifikasi: entry.kodeKlasifikasi || "",
          keterangan: entry.disposisi || "",
          lampiran: `Tersimpan di Drive (${entry.file.name})`,
          fileBase64: fileBase64,
          fileName: entry.file.name,
          fileMime: entry.file.type || "application/pdf"
        };

        let newDriveUrl = "";
        let newUrut = String(entry.noUrut);

        if (state.appsScriptUrl) {
          const res = await postToAppsScript(payload);
          if (res && res.success) {
            entry.status = 'success';
            if (res.data?.drive_file_url) newDriveUrl = res.data.drive_file_url;
            if (res.data?.no_urut) newUrut = String(res.data.no_urut);

            const newItem = {
              id: "M-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
              noUrut: newUrut,
              isUnsynced: false,
              noAgenda: payload.no_agenda,
              tglSurat: payload.tanggal_surat,
              tglMasuk: payload.tanggal_diterima,
              perihal: payload.perihal,
              dari: payload.dari,
              kepada: payload.kepada,
              kodeKlasifikasi: payload.kode_klasifikasi,
              keterangan: payload.keterangan,
              lampiran: newDriveUrl || payload.lampiran,
              driveUrl: newDriveUrl
            };
            state.suratMasuk.push(newItem);
            state.suratMasuk.sort((a, b) => (parseInt(a.noUrut, 10) || 0) - (parseInt(b.noUrut, 10) || 0));
            successCount++;
          } else {
            entry.status = 'error';
            entry.errorMsg = res?.message || "Gagal menyimpan ke Spreadsheet";
            failCount++;
          }
        } else {
          // Mode offline
          entry.status = 'success';
          const newItem = {
            id: "M-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
            noUrut: newUrut,
            isUnsynced: true,
            noAgenda: payload.no_agenda,
            tglSurat: payload.tanggal_surat,
            tglMasuk: payload.tanggal_diterima,
            perihal: payload.perihal,
            dari: payload.dari,
            kepada: payload.kepada,
            kodeKlasifikasi: payload.kode_klasifikasi,
            keterangan: payload.keterangan,
            lampiran: payload.lampiran,
            driveUrl: ""
          };
          state.suratMasuk.push(newItem);
          state.suratMasuk.sort((a, b) => (parseInt(a.noUrut, 10) || 0) - (parseInt(b.noUrut, 10) || 0));
          const unsyncedList = JSON.parse(localStorage.getItem("unsynced_surat_masuk") || "[]");
          unsyncedList.push(newItem);
          localStorage.setItem("unsynced_surat_masuk", JSON.stringify(unsyncedList));
          successCount++;
        }
      }
    } catch (err) {
      entry.status = 'error';
      entry.errorMsg = err.message || "Koneksi terputus";
      failCount++;
    }

    renderBatchMasukModalList();
  }

  // Selesaikan progress bar
  if (progressBar) progressBar.style.width = "100%";
  if (progressPercent) progressPercent.textContent = "100%";
  if (progressStatus) progressStatus.innerHTML = `<i class="fa-solid fa-circle-check text-emerald"></i> Proses upload batch surat masuk selesai!`;
  if (progressDetail) progressDetail.textContent = `${successCount} berkas berhasil diunggah & dicatat${failCount > 0 ? `, ${failCount} gagal` : ''}.`;

  // Simpan cache lokal
  localStorage.setItem("cache_surat_masuk_2026", JSON.stringify(state.suratMasuk));

  // Perbarui UI tabel & dashboard
  filterSuratMasukData();
  updateDashboardUI();
  updateBatchMasukBar();

  if (btnStart) btnStart.disabled = false;
  if (btnClose) btnClose.disabled = false;

  if (successCount > 0) {
    showToast(`✅ Berhasil mengunggah & mencatat ${successCount} berkas surat masuk ke Spreadsheet & Google Drive!`, "success");
  }
  if (failCount > 0) {
    showToast(`⚠️ Ada ${failCount} berkas yang gagal diunggah. Silakan periksa kembali berkas tersebut.`, "warning");
  }
}
window.executeBatchUploadMasuk = executeBatchUploadMasuk;

/**
 * =========================================================================
 * BATCH EDIT SURAT KELUAR (UPDATE MASSAL KODE KLASIFIKASI, TANGGAL, DLL)
 * =========================================================================
 */

/**
 * Buka modal edit batch surat keluar
 */
function openBatchEditModalKeluar(targetIds = null) {
  let idsToUse = [];
  if (targetIds && targetIds.length > 0) {
    idsToUse = targetIds;
  } else if (state.selectedKeluarIds && state.selectedKeluarIds.size > 0) {
    idsToUse = Array.from(state.selectedKeluarIds);
  } else {
    // Jika belum ada yang diceklis sama sekali, berikan opsi untuk memilih yang tampil di halaman ini
    const currentSlice = getCurrentKeluarSlice();
    if (currentSlice.length === 0) {
      showToast("Tidak ada data surat keluar yang dapat diedit!", "warning");
      return;
    }
    const confirmPick = confirm(`Anda belum menceklis surat keluar.\n\nApakah Anda ingin mengedit ${currentSlice.length} surat keluar di halaman yang sedang aktif ini?`);
    if (confirmPick) {
      currentSlice.forEach(item => state.selectedKeluarIds.add(item.id));
      renderSuratKeluarTable();
      updateBatchKeluarBar();
      idsToUse = currentSlice.map(i => i.id);
    } else {
      showToast("Silakan centang satu atau lebih kotak ceklis surat keluar terlebih dahulu.", "info");
      return;
    }
  }

  // Kumpulkan objek surat
  const selectedItems = state.suratKeluar.filter(s => idsToUse.includes(s.id));
  if (selectedItems.length === 0) {
    showToast("Surat yang dipilih tidak ditemukan dalam data!", "error");
    return;
  }

  // Urutkan berdasarkan no agenda
  selectedItems.sort((a, b) => {
    const nA = parseInt(a.noAgenda || a.noUrut || 0, 10);
    const nB = parseInt(b.noAgenda || b.noUrut || 0, 10);
    if (!isNaN(nA) && !isNaN(nB)) return nA - nB;
    return String(a.noAgenda).localeCompare(String(b.noAgenda));
  });

  state.batchEditKeluarItems = selectedItems;

  // Reset form ke kondisi awal (keep)
  const selKode = document.getElementById("batchEditKodeKlasifikasi");
  const customKode = document.getElementById("batchEditCustomKode");
  if (selKode) selKode.value = "keep";
  if (customKode) {
    customKode.value = "";
    customKode.style.display = "none";
  }

  const selTglMode = document.getElementById("batchEditTanggalMode");
  const inputTgl = document.getElementById("batchEditTanggalInput");
  if (selTglMode) selTglMode.value = "keep";
  if (inputTgl) {
    inputTgl.value = "";
    inputTgl.style.display = "none";
  }

  const selDari = document.getElementById("batchEditDari");
  const inputDariCustom = document.getElementById("batchEditDariCustom");
  if (selDari) selDari.value = "keep";
  if (inputDariCustom) {
    inputDariCustom.value = "";
    inputDariCustom.style.display = "none";
  }

  const selPetugasMode = document.getElementById("batchEditPetugasMode");
  const inputPetugas = document.getElementById("batchEditPetugasInput");
  if (selPetugasMode) selPetugasMode.value = "keep";
  if (inputPetugas) {
    inputPetugas.value = "";
    inputPetugas.style.display = "none";
  }

  const selKetMode = document.getElementById("batchEditKetMode");
  const inputKet = document.getElementById("batchEditKetInput");
  if (selKetMode) selKetMode.value = "keep";
  if (inputKet) {
    inputKet.value = "";
    inputKet.style.display = "none";
  }

  const selLampiranMode = document.getElementById("batchEditLampiranMode");
  if (selLampiranMode) selLampiranMode.value = "keep";

  // Sembunyikan progress box
  const progressBox = document.getElementById("batchEditProgressBox");
  if (progressBox) progressBox.style.display = "none";

  const btnSubmit = document.getElementById("btnSubmitBatchEditKeluar");
  if (btnSubmit) {
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = `<i class="fa-solid fa-check-double"></i> Simpan Perubahan Batch (<span id="batchEditApplyCount">${state.batchEditKeluarItems.length}</span>)`;
  }

  // Update counter modal & render preview
  const editCount = document.getElementById("batchEditKeluarCount");
  if (editCount) editCount.textContent = state.batchEditKeluarItems.length;

  renderBatchEditPreview();

  const modal = document.getElementById("modalBatchEditKeluar");
  if (modal) modal.classList.add("show");
}

/**
 * Render tabel pratinjau perubahan batch surat keluar
 */
function renderBatchEditPreview() {
  const tbody = document.getElementById("tbodyBatchEditKeluarItems");
  const stats = document.getElementById("batchEditPreviewStats");
  const applyCount = document.getElementById("batchEditApplyCount");
  const editCount = document.getElementById("batchEditKeluarCount");

  const total = state.batchEditKeluarItems ? state.batchEditKeluarItems.length : 0;
  if (stats) stats.textContent = `${total} surat dipilih`;
  if (applyCount) applyCount.textContent = total;
  if (editCount) editCount.textContent = total;

  if (!tbody) return;

  if (total === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #94a3b8; padding: 24px;">Tidak ada surat yang dipilih.</td></tr>`;
    return;
  }

  // Baca konfigurasi nilai baru yang dipilih
  const selKode = document.getElementById("batchEditKodeKlasifikasi")?.value || "keep";
  const customKode = document.getElementById("batchEditCustomKode")?.value.trim() || "";
  let newKode = null;
  if (selKode === "custom") {
    newKode = customKode || null;
  } else if (selKode !== "keep") {
    newKode = selKode;
  }

  const selTglMode = document.getElementById("batchEditTanggalMode")?.value || "keep";
  const inputTglVal = document.getElementById("batchEditTanggalInput")?.value || "";
  let newTglIndo = null;
  let newRomanMonth = null;
  let newTahun = null;
  if (selTglMode === "change" && inputTglVal) {
    newTglIndo = formatDateIndo(inputTglVal);
    const parts = inputTglVal.split("-");
    if (parts.length === 3) {
      newTahun = parts[0];
      const mIdx = parseInt(parts[1], 10) - 1;
      if (mIdx >= 0 && mIdx < 12) newRomanMonth = ROMAN_MONTHS[mIdx];
    }
  }

  const selLampiranMode = document.getElementById("batchEditLampiranMode")?.value || "keep";
  const isClearingDrive = (selLampiranMode === "clear_drive");

  tbody.innerHTML = state.batchEditKeluarItems.map(item => {
    const oldKode = item.kodeKlasifikasi || "421.3";
    const targetKode = newKode || oldKode;
    const isKodeChanged = Boolean(newKode && newKode !== oldKode);

    const oldTgl = item.tanggal || "-";
    const targetTgl = newTglIndo || oldTgl;
    const isTglChanged = Boolean(newTglIndo && newTglIndo !== oldTgl);

    const targetRoman = newRomanMonth || item.bulanRomawi || "X";
    const targetThn = newTahun || item.tahun || "2026";
    const targetNomor = `${targetKode}/${item.noAgenda}/SMA YWKA/TU/${targetRoman}/${targetThn}`.replace(/\/{2,}/g, "/");
    const isNomorChanged = targetNomor !== item.nomorLengkap;

    const kodeHtml = isKodeChanged
      ? `<div class="badge-diff-wrapper">
           <span class="badge-diff-old">${escapeHtml(oldKode)}</span>
           <i class="fa-solid fa-arrow-right badge-diff-arrow"></i>
           <span class="badge-diff-new">${escapeHtml(targetKode)}</span>
         </div>`
      : `<span class="badge-diff-unchanged">${escapeHtml(oldKode)}</span>`;

    const nomorHtml = isNomorChanged
      ? `<div class="nomor-preview-box highlight">${escapeHtml(targetNomor)}</div>`
      : `<div class="nomor-preview-box">${escapeHtml(item.nomorLengkap || targetNomor)}</div>`;

    const tglHtml = isTglChanged
      ? `<div class="badge-diff-wrapper">
           <span class="badge-diff-old" style="font-size: 11px;">${escapeHtml(oldTgl)}</span>
           <span class="badge-diff-new" style="font-size: 11px;">${escapeHtml(targetTgl)}</span>
         </div>`
      : `<span style="font-size: 12px; color: #475569;">${escapeHtml(oldTgl)}</span>`;

    const hasDriveFile = Boolean(item.driveUrl || (item.lampiran && item.lampiran.startsWith("http")));
    let driveHtml = "";
    if (hasDriveFile) {
      if (isClearingDrive) {
        driveHtml = `<div class="badge-diff-wrapper">
          <span class="badge-diff-old" style="font-size: 11px; color: #0284c7;"><i class="fa-brands fa-google-drive"></i> Ada Berkas</span>
          <i class="fa-solid fa-arrow-right badge-diff-arrow"></i>
          <span class="badge-diff-new" style="background: #fee2e2; color: #dc2626; border-color: #fca5a5; font-size: 11px;"><i class="fa-solid fa-trash-can"></i> Dihapus</span>
        </div>`;
      } else {
        driveHtml = `<span class="badge badge-success" style="font-size: 11px; padding: 2px 6px; background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0;"><i class="fa-brands fa-google-drive"></i> Ada Berkas</span>`;
      }
    } else {
      driveHtml = `<span style="font-size: 11.5px; color: #94a3b8; font-style: italic;"><i class="fa-solid fa-file-circle-xmark"></i> Kosong</span>`;
    }

    return `
      <tr>
        <td style="text-align: center;">
          <span class="stat-mono" style="font-weight: 700; color: #2563eb; font-size: 13px;">${escapeHtml(item.noAgenda || item.noUrut || "-")}</span>
        </td>
        <td>${kodeHtml}</td>
        <td>${nomorHtml}</td>
        <td>${tglHtml}</td>
        <td>
          <div style="font-size: 12.5px; color: #1e293b; max-width: 320px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(item.perihal || '')}">
            ${escapeHtml(item.perihal || '-')}
          </div>
          ${item.kepada ? `<div style="font-size: 11px; color: #64748b; margin-top: 2px;"><i class="fa-solid fa-paper-plane"></i> ${escapeHtml(item.kepada)}</div>` : ''}
        </td>
        <td style="text-align: center;">${driveHtml}</td>
        <td style="text-align: center;">
          <button type="button" class="btn-batch-remove-file" title="Keluarkan surat ini dari batch edit" onclick="removeBatchEditItem('${item.id}')">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

/**
 * Hapus suatu surat dari daftar batch edit
 */
function removeBatchEditItem(itemId) {
  state.batchEditKeluarItems = state.batchEditKeluarItems.filter(s => s.id !== itemId);
  state.selectedKeluarIds.delete(itemId);
  renderBatchEditPreview();
  renderSuratKeluarTable();
  updateBatchKeluarBar();

  if (state.batchEditKeluarItems.length === 0) {
    const modal = document.getElementById("modalBatchEditKeluar");
    if (modal) modal.classList.remove("show");
    showToast("Semua surat telah dikeluarkan dari batch edit.", "info");
  }
}

/**
 * Eksekusi Simpan Perubahan Batch Surat Keluar ke Spreadsheet & Cache Lokal
 */
async function executeBatchEditKeluar() {
  if (!state.appsScriptUrl) {
    showToast("URL Google Apps Script belum disetel! Harap simpan URL Web App di tab Pengaturan.", "warning");
    return;
  }

  const items = state.batchEditKeluarItems;
  if (!items || items.length === 0) {
    showToast("Tidak ada surat yang dipilih untuk diedit!", "warning");
    return;
  }

  // 1. Ambil opsi perubahan dari form
  const selKode = document.getElementById("batchEditKodeKlasifikasi")?.value || "keep";
  const customKode = document.getElementById("batchEditCustomKode")?.value.trim() || "";
  let newKode = null;
  if (selKode === "custom") {
    newKode = customKode || null;
  } else if (selKode !== "keep") {
    newKode = selKode;
  }

  const selTglMode = document.getElementById("batchEditTanggalMode")?.value || "keep";
  const inputTglVal = document.getElementById("batchEditTanggalInput")?.value || "";
  let newTglIndo = null;
  let newRomanMonth = null;
  let newTahun = null;
  if (selTglMode === "change" && inputTglVal) {
    newTglIndo = formatDateIndo(inputTglVal);
    const parts = inputTglVal.split("-");
    if (parts.length === 3) {
      newTahun = parts[0];
      const mIdx = parseInt(parts[1], 10) - 1;
      if (mIdx >= 0 && mIdx < 12) newRomanMonth = ROMAN_MONTHS[mIdx];
    }
  }

  const selDari = document.getElementById("batchEditDari")?.value || "keep";
  const customDari = document.getElementById("batchEditDariCustom")?.value.trim() || "";
  let newDari = null;
  if (selDari === "custom") {
    newDari = customDari || null;
  } else if (selDari !== "keep") {
    newDari = selDari;
  }

  const selPetugasMode = document.getElementById("batchEditPetugasMode")?.value || "keep";
  const inputPetugasVal = document.getElementById("batchEditPetugasInput")?.value.trim() || "";
  let newPetugas = null;
  if (selPetugasMode === "change") {
    newPetugas = inputPetugasVal;
  }

  const selKetMode = document.getElementById("batchEditKetMode")?.value || "keep";
  const inputKetVal = document.getElementById("batchEditKetInput")?.value.trim() || "";
  let newKet = null;
  if (selKetMode === "change") {
    newKet = inputKetVal;
  } else if (selKetMode === "clear") {
    newKet = "";
  }

  const selLampiranMode = document.getElementById("batchEditLampiranMode")?.value || "keep";
  const isClearingDrive = (selLampiranMode === "clear_drive");

  // Validasi: Apakah ada kolom yang diubah?
  if (!newKode && !newTglIndo && !newDari && newPetugas === null && newKet === null && !isClearingDrive) {
    showToast("⚠️ Anda belum memilih perubahan apapun! Tentukan setidaknya satu kolom yang ingin diubah (misalnya Kode Klasifikasi atau Berkas Drive).", "warning");
    return;
  }

  const confirmSubmit = confirm(
    `Anda akan memperbarui ${items.length} Surat Keluar terpilih sekaligus:\n` +
    (newKode ? `• Kode Klasifikasi Baru: ${newKode}\n` : '') +
    (newTglIndo ? `• Tanggal Surat Baru: ${newTglIndo}\n` : '') +
    (newDari ? `• Dari: ${newDari}\n` : '') +
    (newPetugas !== null ? `• Petugas: ${newPetugas || '(kosong)'}\n` : '') +
    (newKet !== null ? `• Keterangan: ${newKet || '(kosong)'}\n` : '') +
    (isClearingDrive ? `• Berkas Google Drive: HAPUS & KOSONGKAN TAUTAN DRIVE (Skema Bersih)\n` : '') +
    `\nLanjutkan pembaruan ke Spreadsheet?`
  );
  if (!confirmSubmit) return;

  const btnSubmit = document.getElementById("btnSubmitBatchEditKeluar");
  const btnCancel = document.getElementById("btnCancelBatchEditKeluar");
  const progressBox = document.getElementById("batchEditProgressBox");
  const progressBar = document.getElementById("batchEditProgressBar");
  const progressPercent = document.getElementById("batchEditProgressPercentage");
  const progressStatus = document.getElementById("batchEditProgressStatusText");
  const progressDetail = document.getElementById("batchEditProgressCurrentDetail");

  if (btnSubmit) btnSubmit.disabled = true;
  if (btnCancel) btnCancel.disabled = true;
  if (progressBox) progressBox.style.display = "block";

  // Siapkan payload batch updates
  const updates = items.map(item => {
    const upd = {
      no_agenda: item.noAgenda,
      old_no_agenda: item.noAgenda,
      perihal: item.perihal || ""
    };
    if (newKode) upd.kode_klasifikasi = newKode;
    if (newTglIndo) {
      upd.tanggal_surat = newTglIndo;
      upd.bulan_romawi = newRomanMonth || item.bulanRomawi || "X";
      upd.tahun = newTahun || item.tahun || "2026";
    }
    if (newDari) upd.dari = newDari;
    if (newPetugas !== null) upd.petugas = newPetugas;
    if (newKet !== null) upd.keterangan = newKet;
    if (isClearingDrive) {
      upd.clear_drive_files = true;
      upd.old_drive_url = item.driveUrl || (item.lampiran && item.lampiran.startsWith("http") ? item.lampiran : "");
    }
    return upd;
  });

  let isBatchActionSuccess = false;
  let updatedCount = 0;

  // 1. Coba eksekusi batch lewat action "batch_edit_surat_keluar"
  if (progressBar) progressBar.style.width = "40%";
  if (progressPercent) progressPercent.textContent = "40%";
  if (progressStatus) progressStatus.innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="color: #d97706;"></i> Mengirim pembaruan massal ke Google Apps Script...`;
  if (progressDetail) progressDetail.textContent = `Menyimpan ${updates.length} data surat ke Spreadsheet...`;

  try {
    const res = await fetch(state.appsScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({
        action: "batch_edit_surat_keluar",
        updates: updates
      })
    });
    const resJson = await res.json();
    if (resJson && resJson.status === "success") {
      isBatchActionSuccess = true;
      updatedCount = resJson.updated_count || updates.length;
    }
  } catch (err) {
    console.warn("Gagal mengeksekusi batch_edit_surat_keluar, mencoba fallback sequential:", err);
  }

  // 2. Fallback sequential jika Google Apps Script yang terpasang belum v3.2
  if (!isBatchActionSuccess) {
    if (progressStatus) progressStatus.innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="color: #d97706;"></i> Memproses pembaruan surat satu per satu (mode fallback)...`;
    for (let i = 0; i < updates.length; i++) {
      const u = updates[i];
      const percent = Math.round(((i + 1) / updates.length) * 100);
      if (progressBar) progressBar.style.width = `${percent}%`;
      if (progressPercent) progressPercent.textContent = `${percent}%`;
      if (progressDetail) progressDetail.textContent = `Memperbarui No. Agenda ${u.no_agenda} (${i + 1} dari ${updates.length})...`;

      const singlePayload = {
        action: "edit_surat_keluar",
        old_no_agenda: u.no_agenda,
        no_agenda: u.no_agenda,
        perihal: u.perihal,
        kode_klasifikasi: u.kode_klasifikasi || undefined,
        tanggal_surat: u.tanggal_surat || undefined,
        bulan_romawi: u.bulan_romawi || undefined,
        tahun: u.tahun || undefined,
        dari: u.dari || undefined,
        petugas: u.petugas !== undefined ? u.petugas : undefined,
        keterangan: u.keterangan !== undefined ? u.keterangan : undefined,
        clear_drive_files: u.clear_drive_files || undefined,
        old_drive_url: u.old_drive_url || undefined
      };

      try {
        await fetch(state.appsScriptUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify(singlePayload)
        });
        updatedCount++;
      } catch (e) {
        console.warn(`Gagal memperbarui agenda ${u.no_agenda}:`, e);
      }
    }
  }

  // 3. Tuntaskan progress bar
  if (progressBar) progressBar.style.width = "100%";
  if (progressPercent) progressPercent.textContent = "100%";
  if (progressStatus) progressStatus.innerHTML = `<i class="fa-solid fa-circle-check" style="color: #059669;"></i> Pembaruan batch selesai!`;
  if (progressDetail) progressDetail.textContent = `${updatedCount} Surat Keluar berhasil diperbarui di Spreadsheet!`;

  // 4. Update data lokal di state.suratKeluar
  items.forEach(target => {
    const realItem = state.suratKeluar.find(k => k.id === target.id || k.noAgenda === target.noAgenda);
    if (realItem) {
      if (newKode) {
        realItem.kodeKlasifikasi = newKode;
      }
      if (newTglIndo) {
        realItem.tanggal = newTglIndo;
        if (newRomanMonth) realItem.bulanRomawi = newRomanMonth;
        if (newTahun) realItem.tahun = newTahun;
      }
      if (newDari) realItem.dari = newDari;
      if (newPetugas !== null) realItem.petugas = newPetugas;
      if (newKet !== null) realItem.keterangan = newKet;
      if (isClearingDrive) {
        realItem.driveUrl = "";
        realItem.lampiran = "Surat Keluar";
        realItem.status = false;
      }

      // Rekalkulasi nomorLengkap
      const kCode = realItem.kodeKlasifikasi || "421.3";
      const bRom = realItem.bulanRomawi || "X";
      const thn = realItem.tahun || "2026";
      realItem.nomorLengkap = `${kCode}/${realItem.noAgenda}/SMA YWKA/TU/${bRom}/${thn}`.replace(/\/{2,}/g, "/");

      // Sinkronkan ke unsynced jika ada
      const unsyncedList = JSON.parse(localStorage.getItem("unsynced_surat_keluar") || "[]");
      const unIdx = unsyncedList.findIndex(x => x.id === target.id || x.noAgenda === target.noAgenda);
      if (unIdx !== -1 && isClearingDrive) {
        unsyncedList[unIdx].driveUrl = "";
        unsyncedList[unIdx].lampiran = "Surat Keluar";
        unsyncedList[unIdx].status = false;
        localStorage.setItem("unsynced_surat_keluar", JSON.stringify(unsyncedList));
      }
    }
  });

  // Simpan ke cache lokal
  localStorage.setItem("cache_surat_keluar_2026", JSON.stringify(state.suratKeluar));

  // Perbarui UI
  filterSuratKeluarData();
  updateDashboardUI();
  updateBatchKeluarBar();

  if (btnSubmit) btnSubmit.disabled = false;
  if (btnCancel) btnCancel.disabled = false;

  showToast(`✅ Berhasil memperbarui ${updatedCount} surat keluar sekaligus di Spreadsheet & Sistem!`, "success");

  // Tutup modal setelah delay singkat agar pengguna melihat status 100%
  setTimeout(() => {
    const modal = document.getElementById("modalBatchEditKeluar");
    if (modal) modal.classList.remove("show");
  }, 900);
}

/**
 * =========================================================================
 * SINKRONISASI BERKAS GOOGLE DRIVE KE SPREADSHEET
 * =========================================================================
 * Memindai berkas di folder Drive Surat Keluar 2026 & Surat Masuk 2026,
 * mencocokkan nomor agenda, mencentang Kolom B dan memasang Link Drive di Spreadsheet.
 * Mengubah status tombol dari "Upload Drive" menjadi "Berkas Drive".
 */
async function handleSyncDriveToSpreadsheet(triggerBtn = null) {
  if (!state.appsScriptUrl) {
    showToast("URL Google Apps Script belum disetel! Harap simpan URL Web App di tab Pengaturan.", "warning");
    return;
  }

  const confirmRun = confirm(
    "Apakah Anda ingin memindai folder Google Drive Surat Keluar 2026 & Surat Masuk 2026?\n\n" +
    "Sistem akan:\n" +
    "1. Mendeteksi seluruh file PDF/Scan yang sudah ada di folder Drive\n" +
    "2. Mencocokkan nomor agenda file dengan baris di Spreadsheet\n" +
    "3. Mencentang Kolom B dan memasang Link Berkas di Kolom N\n" +
    "4. Mengubah status tombol di website menjadi 'Berkas Drive'!\n\n" +
    "Lanjutkan sinkronisasi?"
  );
  if (!confirmRun) return;

  let origHtml = "";
  if (triggerBtn) {
    origHtml = triggerBtn.innerHTML;
    triggerBtn.disabled = true;
    triggerBtn.innerHTML = `<i class="fa-solid fa-arrows-rotate fa-spin"></i> Menyinkronkan Drive...`;
  }

  showToast("🔍 Memindai folder Google Drive & mencocokkan ke Spreadsheet...", "info");

  try {
    const res = await fetch(state.appsScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "sync_drive_files_to_sheet" })
    });
    const resJson = await res.json();

    if (resJson && resJson.status === "success") {
      // 1. Bersihkan cache lokal agar data fresh diambil dari Sheets
      localStorage.removeItem("cache_surat_keluar_2026");
      localStorage.removeItem("cache_surat_masuk_2026");

      // 2. Jika Apps Script mengembalikan daftar agenda yang cocok, update state lokal langsung
      if (resJson.matchedAgendas && resJson.matchedAgendas.length > 0) {
        const matchedSet = new Set(resJson.matchedAgendas.map(a => String(a).trim()));
        state.suratKeluar.forEach(k => {
          if (matchedSet.has(String(k.noAgenda).trim()) || matchedSet.has(String(k.noUrut).trim())) {
            k.status = true;
            if (!k.driveUrl || !k.driveUrl.includes("http")) {
              k.driveUrl = state.driveKeluarUrl || "https://drive.google.com/drive/folders/15sHeKCXOjXDAFfHJtzKKZYA9OpYQb3R5";
              k.lampiran = k.driveUrl;
            }
          }
        });
      }

      // 3. Muat ulang data live dari Google Sheets
      await loadLiveSheetData();

      // 4. Render ulang tabel & dashboard
      filterSuratKeluarData();
      filterSuratMasukData();
      updateDashboardUI();

      const msg = resJson.message || `Berhasil menyinkronkan berkas dari Google Drive ke Spreadsheet!`;
      showToast(`✅ ${msg}`, "success");
      alert(`✅ Sinkronisasi Google Drive Selesai!\n\n${msg}\n\nStatus tombol di tabel kini telah diperbarui menjadi "Berkas Drive".`);
    } else {
      showToast(`Gagal sinkronisasi Drive: ${resJson?.message || "Terjadi kesalahan"}`, "danger");
    }
  } catch (err) {
    console.error("Gagal sinkron drive ke sheet:", err);
    showToast("Terjadi kendala saat menghubungi Google Apps Script: " + err.message, "danger");
  } finally {
    if (triggerBtn) {
      triggerBtn.disabled = false;
      triggerBtn.innerHTML = origHtml;
    }
  }
}

/**
 * Buka modal konfirmasi hapus data surat keluar
 */
function openDeleteModalKeluar(id) {
  const item = state.suratKeluar.find(s => s.id === id);
  if (!item) {
    showToast("Data surat tidak ditemukan!", "error");
    return;
  }

  const modal = document.getElementById("modalConfirmDelete");
  const targetIdInput = document.getElementById("deleteModalTargetId");
  const targetAgendaInput = document.getElementById("deleteModalTargetAgenda");
  const targetRowIndexInput = document.getElementById("deleteModalTargetRowIndex");
  const targetUrutInput = document.getElementById("deleteModalTargetUrut");
  const targetTypeInput = document.getElementById("deleteModalTargetType");
  const title = document.getElementById("deleteModalTitle");
  const prompt = document.getElementById("deleteModalPromptText");
  const note = document.getElementById("deleteModalNote");
  const agendaText = document.getElementById("deleteModalAgenda");
  const nomorText = document.getElementById("deleteModalNomor");
  const perihalText = document.getElementById("deleteModalPerihal");

  if (targetTypeInput) targetTypeInput.value = "keluar";
  if (title) title.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color: #e11d48;"></i> Konfirmasi Hapus Surat Keluar`;
  if (prompt) prompt.textContent = "Apakah Anda yakin ingin menghapus data surat keluar ini?";
  if (note) note.innerHTML = `<i class="fa-solid fa-circle-info"></i> Baris di Spreadsheet akan di-reset (uncheck kotak & kosongkan perihal), dan data lokal browser akan dibersihkan.`;
  if (targetIdInput) targetIdInput.value = item.id;
  const noAgendaVal = item.noAgenda || item.noUrut || "";
  if (targetAgendaInput) targetAgendaInput.value = noAgendaVal;
  if (targetRowIndexInput) {
    targetRowIndexInput.value = item.rowIndex || (item.id && item.id.startsWith("K-") ? item.id.replace("K-", "") : "");
    targetRowIndexInput.dataset.duplicateRowIndices = JSON.stringify(item.duplicateRowIndices || []);
  }
  if (targetUrutInput) targetUrutInput.value = item.noUrut || "";
  if (agendaText) agendaText.textContent = noAgendaVal ? `Agenda #${noAgendaVal}` : "-";
  if (nomorText) nomorText.textContent = item.nomorLengkap || "-";
  if (perihalText) perihalText.textContent = item.perihal || "-";

  if (modal) modal.classList.add("show");
}

/**
 * Buka modal konfirmasi hapus data surat masuk
 */
function openDeleteModalMasuk(id) {
  const item = state.suratMasuk.find(m => m.id === id);
  if (!item) {
    showToast("Data surat masuk tidak ditemukan!", "error");
    return;
  }

  const modal = document.getElementById("modalConfirmDelete");
  const targetIdInput = document.getElementById("deleteModalTargetId");
  const targetAgendaInput = document.getElementById("deleteModalTargetAgenda");
  const targetRowIndexInput = document.getElementById("deleteModalTargetRowIndex");
  const targetUrutInput = document.getElementById("deleteModalTargetUrut");
  const targetTypeInput = document.getElementById("deleteModalTargetType");
  const title = document.getElementById("deleteModalTitle");
  const prompt = document.getElementById("deleteModalPromptText");
  const note = document.getElementById("deleteModalNote");
  const agendaText = document.getElementById("deleteModalAgenda");
  const nomorText = document.getElementById("deleteModalNomor");
  const perihalText = document.getElementById("deleteModalPerihal");

  if (targetTypeInput) targetTypeInput.value = "masuk";
  if (title) title.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color: #e11d48;"></i> Konfirmasi Hapus Surat Masuk`;
  if (prompt) prompt.textContent = "Apakah Anda yakin ingin menghapus data surat masuk ini?";
  if (note) note.innerHTML = `<i class="fa-solid fa-circle-info"></i> Baris spesifik pada Sheet SURAT MASUK 2026 di Spreadsheet akan dihapus dan data lokal browser akan dibersihkan.`;
  if (targetIdInput) targetIdInput.value = item.id;
  if (targetAgendaInput) targetAgendaInput.value = item.noAgenda || item.noUrut || "";
  if (targetRowIndexInput) {
    targetRowIndexInput.value = item.rowIndex || (item.id && item.id.startsWith("M-") ? item.id.replace("M-", "") : "");
    targetRowIndexInput.dataset.duplicateRowIndices = JSON.stringify(item.duplicateRowIndices || []);
  }
  if (targetUrutInput) targetUrutInput.value = item.noUrut || "";
  if (agendaText) agendaText.textContent = item.noUrut ? `Urut #${item.noUrut}` : "-";
  if (nomorText) nomorText.textContent = item.noAgenda || "-";
  if (perihalText) perihalText.textContent = `${item.perihal || "-"} (Pengirim: ${item.dari || "-"})`;

  if (modal) modal.classList.add("show");
}

/**
 * Eksekusi hapus data surat (Mendukung Surat Keluar & Surat Masuk dengan Pembersihan Duplikat Bersih)
 */
async function handleExecuteDeleteRow() {
  const targetId = document.getElementById("deleteModalTargetId")?.value;
  const targetAgenda = document.getElementById("deleteModalTargetAgenda")?.value;
  const targetRowIndexInput = document.getElementById("deleteModalTargetRowIndex");
  const targetRowIndex = targetRowIndexInput?.value;
  const targetUrut = document.getElementById("deleteModalTargetUrut")?.value;
  const targetType = document.getElementById("deleteModalTargetType")?.value || "keluar";
  const btnExec = document.getElementById("btnExecuteDeleteRow");
  const modal = document.getElementById("modalConfirmDelete");

  if (!targetId && !targetAgenda) {
    showToast("Data target hapus tidak valid!", "error");
    return;
  }

  let dupIndices = [];
  try {
    dupIndices = JSON.parse(targetRowIndexInput?.dataset?.duplicateRowIndices || "[]");
  } catch (e) { }
  if (!dupIndices.length && targetRowIndex) {
    dupIndices = [parseInt(targetRowIndex, 10)];
  }

  const origBtnHtml = btnExec.innerHTML;
  btnExec.disabled = true;
  btnExec.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menghapus...`;

  const isMasuk = (targetType === "masuk");

  try {
    if (state.appsScriptUrl) {
      try {
        const payloadData = {
          action: isMasuk ? "delete_surat_masuk" : "delete_surat_keluar",
          no_agenda: targetAgenda,
          no_urut: targetUrut || "",
          row_index: targetRowIndex ? parseInt(targetRowIndex, 10) : -1,
          row_indices: dupIndices,
          delete_all_matching: true,
          id: targetId
        };
        await fetch(state.appsScriptUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify(payloadData)
        });
      } catch (scriptErr) {
        console.warn("Apps Script delete error (melanjutkan hapus lokal):", scriptErr);
      }
    }

    if (isMasuk) {
      // Hapus dari state berdasarkan targetId ATAU nomor agenda yang sama persis
      state.suratMasuk = state.suratMasuk.filter(m => {
        if (m.id === targetId) return false;
        if (targetAgenda && targetAgenda !== "-" && m.noAgenda === targetAgenda) return false;
        return true;
      });
      localStorage.setItem("cache_surat_masuk_2026", JSON.stringify(state.suratMasuk));

      const unsyncedList = JSON.parse(localStorage.getItem("unsynced_surat_masuk") || "[]");
      const updatedUnsynced = unsyncedList.filter(m => {
        if (m.id === targetId) return false;
        if (targetAgenda && targetAgenda !== "-" && m.noAgenda === targetAgenda) return false;
        return true;
      });
      localStorage.setItem("unsynced_surat_masuk", JSON.stringify(updatedUnsynced));

      filterSuratMasukData();
      updateDashboardUI();

      if (modal) modal.classList.remove("show");
      showToast(`✅ Data surat masuk berhasil dihapus bersih!`, "success");
    } else {
      state.suratKeluar = state.suratKeluar.filter(s => {
        if (s.id === targetId) return false;
        if (targetAgenda && s.noAgenda === targetAgenda) return false;
        return true;
      });
      localStorage.setItem("cache_surat_keluar_2026", JSON.stringify(state.suratKeluar));

      const unsyncedList = JSON.parse(localStorage.getItem("unsynced_surat_keluar") || "[]");
      const updatedUnsynced = unsyncedList.filter(s => {
        if (s.id === targetId) return false;
        if (targetAgenda && s.noAgenda === targetAgenda) return false;
        return true;
      });
      localStorage.setItem("unsynced_surat_keluar", JSON.stringify(updatedUnsynced));

      calculateNextSequence();
      filterSuratKeluarData();
      updateDashboardUI();

      if (modal) modal.classList.remove("show");
      showToast(`✅ Data surat keluar agenda ${targetAgenda} berhasil dihapus!`, "success");
    }

    // Refresh data spreadsheet di latar belakang agar selalu selaras
    loadDataFromSpreadsheet().catch(err => console.warn("Sync update setelah hapus:", err));
  } catch (err) {
    console.error("Gagal menghapus surat:", err);
    showToast(`⚠️ Gagal menghapus data: ${err.message || err}`, "error");
  } finally {
    btnExec.disabled = false;
    btnExec.innerHTML = origBtnHtml;
  }
}

/**
 * Fungsi Pembersih Duplikat Spreadsheet (Trigger via Tombol Pengaturan atau Otomatis)
 */
async function cleanSpreadsheetDuplicates() {
  state.suratMasuk = deduplicateItems(state.suratMasuk, "masuk");
  state.suratKeluar = deduplicateItems(state.suratKeluar, "keluar");
  localStorage.setItem("cache_surat_masuk_2026", JSON.stringify(state.suratMasuk));
  localStorage.setItem("cache_surat_keluar_2026", JSON.stringify(state.suratKeluar));
  localStorage.removeItem("unsynced_surat_masuk");
  filterSuratMasukData();
  filterSuratKeluarData();
  updateDashboardUI();

  if (!state.appsScriptUrl) {
    showToast("✅ Tampilan & cache lokal berhasil dibersihkan dari duplikat!", "success");
    return;
  }

  showToast("⏳ Sedang membersihkan baris ganda di Google Spreadsheet...", "info");
  try {
    const res = await fetch(state.appsScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "clean_duplicates" })
    });
    const resJson = await res.json();
    if (resJson && resJson.status === "success") {
      showToast(`✅ ${resJson.message}`, "success");
    } else {
      showToast(`✅ Tampilan telah dibersihkan`, "success");
    }
  } catch (err) {
    console.warn("Gagal request clean_duplicates ke Apps Script:", err);
    showToast("✅ Tampilan lokal bersih (Pastikan Apps Script terpasang)", "info");
  } finally {
    await loadDataFromSpreadsheet();
  }
}

/**
 * Otomatis memindahkan surat masuk di baris bawah (>= baris 302) kembali ke slot template yang benar (misal slot 215 di baris 214)
 * dan menghapus baris salah/liar di Spreadsheet
 */
async function relocateMisplacedSuratMasuk() {
  if (!state.appsScriptUrl) {
    showToast("Harap masukkan URL Web App Google Apps Script Anda terlebih dahulu di menu Pengaturan!", "warning");
    return;
  }

  showToast("⏳ Sedang memindahkan surat masuk di baris bawah ke slot yang benar...", "info");
  try {
    const res = await fetch(state.appsScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "auto_fix_masuk" })
    });
    const resJson = await res.json();
    if (resJson && resJson.status === "success") {
      showToast(`✅ ${resJson.message}`, "success");
    } else {
      showToast(`⚠️ ${resJson ? resJson.message : "Gagal memproses perbaikan baris"}`, "warning");
    }
  } catch (err) {
    console.warn("Gagal request auto_fix_masuk ke Apps Script:", err);
    showToast("⚠️ Gagal menghubungi Apps Script. Pastikan Anda sudah menyalin Kode v2.8 dan Deploy Web App.", "error");
  } finally {
    await loadDataFromSpreadsheet();
  }
}
window.relocateMisplacedSuratMasuk = relocateMisplacedSuratMasuk;

/**
 * Buka modal edit data surat keluar
 */
function openEditModalKeluar(id) {
  const item = state.suratKeluar.find(s => s.id === id);
  if (!item) {
    showToast("Data surat keluar tidak ditemukan!", "error");
    return;
  }

  const modal = document.getElementById("modalEditSuratKeluar");
  const targetId = document.getElementById("editKeluarId");
  const oldAgenda = document.getElementById("editKeluarOldAgenda");
  const selKode = document.getElementById("editKeluarKodeKlasifikasi");
  const customKode = document.getElementById("editKeluarCustomKode");
  const txtNoAgenda = document.getElementById("editKeluarNoAgenda");
  const dtTgl = document.getElementById("editKeluarTanggalSurat");
  const txtPerihal = document.getElementById("editKeluarPerihal");
  const txtKepada = document.getElementById("editKeluarKepada");
  const txtDari = document.getElementById("editKeluarDari");
  const txtPetugas = document.getElementById("editKeluarPetugas");
  const txtKet = document.getElementById("editKeluarKeterangan");
  const curFile = document.getElementById("editKeluarCurrentFileName");
  const fileInput = document.getElementById("editKeluarUploadDrive");

  if (targetId) targetId.value = item.id;
  const noAgendaVal = item.noAgenda || item.noUrut || "";
  if (oldAgenda) oldAgenda.value = noAgendaVal;
  if (txtNoAgenda) txtNoAgenda.value = noAgendaVal;

  const standardKodes = ["421.3", "421.7", "421.71", "422.1", "423.5", "423.7", "424", "425.11", "428", "800", "005", "090"];
  const itemKode = item.kodeKlasifikasi || "421.3";
  if (selKode) {
    if (standardKodes.includes(itemKode)) {
      selKode.value = itemKode;
      if (customKode) {
        customKode.style.display = "none";
        customKode.value = "";
      }
    } else {
      selKode.value = "custom";
      if (customKode) {
        customKode.style.display = "block";
        customKode.value = itemKode;
      }
    }
  }

  if (dtTgl) {
    dtTgl.value = formatDateToInput(item.tanggal);
    updateDateBadgePreview("editKeluarTanggalSurat", "previewEditKeluarTgl");
  }

  if (txtPerihal) txtPerihal.value = item.perihal || "";
  if (txtKepada) txtKepada.value = item.kepada || "";
  if (txtDari) txtDari.value = item.dari || "Syarif Hasanudin, S.Pd., Gr., M.M.";
  if (txtPetugas) txtPetugas.value = item.petugas || "";
  if (txtKet) txtKet.value = item.keterangan || "";

  if (curFile) {
    const hasDrive = hasDriveFileAttached(item);
    const driveHref = getDriveLinkHref(item, "keluar");
    curFile.innerHTML = hasDrive
      ? `<a href="${driveHref}" target="_blank" class="text-emerald font-bold"><i class="fa-brands fa-google-drive"></i> Berkas Drive Tersedia</a>`
      : `<span style="color: #64748b;">${escapeHtml(item.lampiran || "Belum ada berkas")}</span>`;
  }
  if (fileInput) fileInput.value = "";

  if (modal) modal.classList.add("show");
}

/**
 * Eksekusi simpan perubahan edit surat keluar
 */
async function handleExecuteEditSuratKeluar(e) {
  e.preventDefault();

  const targetId = document.getElementById("editKeluarId")?.value;
  const oldAgenda = document.getElementById("editKeluarOldAgenda")?.value;
  const selKode = document.getElementById("editKeluarKodeKlasifikasi");
  const customKode = document.getElementById("editKeluarCustomKode");
  const txtNoAgenda = document.getElementById("editKeluarNoAgenda");
  const dtTgl = document.getElementById("editKeluarTanggalSurat");
  const txtPerihal = document.getElementById("editKeluarPerihal");
  const txtKepada = document.getElementById("editKeluarKepada");
  const txtDari = document.getElementById("editKeluarDari");
  const txtPetugas = document.getElementById("editKeluarPetugas");
  const txtKet = document.getElementById("editKeluarKeterangan");
  const fileInput = document.getElementById("editKeluarUploadDrive");
  const btnSubmit = document.getElementById("btnSubmitEditKeluar");
  const modal = document.getElementById("modalEditSuratKeluar");

  const itemIndex = state.suratKeluar.findIndex(s => s.id === targetId || s.noAgenda === oldAgenda);
  if (itemIndex === -1) {
    showToast("Data surat yang akan diedit tidak ditemukan di daftar!", "error");
    return;
  }

  let kode = selKode?.value === "custom" ? customKode?.value.trim() : selKode?.value;
  if (!kode) kode = "421.3";
  const noAgenda = txtNoAgenda?.value.trim() || oldAgenda;
  const formattedTgl = formatDateIndo(dtTgl?.value);

  let romanMonth = "X";
  let tahun = "2026";
  if (dtTgl && dtTgl.value) {
    const parts = dtTgl.value.split("-");
    tahun = parts[0];
    const mIdx = parseInt(parts[1], 10) - 1;
    if (mIdx >= 0 && mIdx < 12) romanMonth = ROMAN_MONTHS[mIdx];
  }

  const fullNumber = `${kode}/${noAgenda}/SMA YWKA/TU/${romanMonth}/${tahun}`.replace(/\/{2,}/g, "/");

  const origBtnHtml = btnSubmit ? btnSubmit.innerHTML : "";
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan Perubahan...`;
  }

  let fileBase64 = "";
  let fileName = "";
  let fileMime = "";
  if (fileInput && fileInput.files && fileInput.files[0]) {
    try {
      const file = fileInput.files[0];
      fileBase64 = await readFileAsBase64(file);
      fileName = file.name;
      fileMime = file.type || "application/pdf";
    } catch (err) {
      console.warn("Gagal membaca file upload baru:", err);
    }
  }

  const existingKeluar = state.suratKeluar[itemIndex];
  const payload = {
    action: "edit_surat_keluar",
    row_index: "", // Dikosongkan agar backend mencari Kolom D (No. Agenda) dan Perihal secara presisi di Spreadsheet
    old_no_agenda: oldAgenda,
    no_agenda: noAgenda,
    kode_klasifikasi: kode,
    bulan_romawi: romanMonth,
    tahun: tahun,
    tanggal_surat: formattedTgl,
    perihal: txtPerihal?.value.trim() || "",
    dari: txtDari?.value.trim() || "Syarif Hasanudin, S.Pd., Gr., M.M.",
    kepada: txtKepada?.value.trim() || "",
    petugas: txtPetugas?.value.trim() || "",
    keterangan: txtKet?.value.trim() || "",
    fileBase64: fileBase64,
    fileName: fileName,
    fileMime: fileMime,
    old_drive_url: existingKeluar?.driveUrl || (existingKeluar?.lampiran && existingKeluar.lampiran.startsWith("http") ? existingKeluar.lampiran : "")
  };

  let syncSuccess = false;
  let driveUrl = state.suratKeluar[itemIndex].driveUrl || "";

  if (state.appsScriptUrl) {
    try {
      const res = await fetch(state.appsScriptUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(payload)
      });
      const resJson = await res.json();
      if (resJson && resJson.status === "success") {
        syncSuccess = true;
        if (resJson.drive_file_url) {
          driveUrl = resJson.drive_file_url;
        }
      }
    } catch (err) {
      console.warn("Gagal sinkron edit ke Apps Script:", err);
    }
  }

  // Update object di state.suratKeluar
  const existing = state.suratKeluar[itemIndex];
  existing.noUrut = noAgenda;
  existing.noAgenda = noAgenda;
  existing.kodeKlasifikasi = kode;
  existing.nomorLengkap = fullNumber;
  existing.bulanRomawi = romanMonth;
  existing.tanggal = formattedTgl;
  existing.perihal = payload.perihal;
  existing.dari = payload.dari;
  existing.kepada = payload.kepada;
  existing.petugas = payload.petugas;
  existing.keterangan = payload.keterangan;
  if (driveUrl) {
    existing.driveUrl = driveUrl;
    existing.lampiran = driveUrl;
    existing.status = true;
  } else if (fileName) {
    existing.lampiran = "Tersimpan (" + fileName + ")";
  }

  localStorage.setItem("cache_surat_keluar_2026", JSON.stringify(state.suratKeluar));

  const unsyncedList = JSON.parse(localStorage.getItem("unsynced_surat_keluar") || "[]");
  const unIdx = unsyncedList.findIndex(s => s.id === targetId || s.noAgenda === oldAgenda);
  if (unIdx !== -1) {
    unsyncedList[unIdx] = Object.assign({}, unsyncedList[unIdx], existing);
    localStorage.setItem("unsynced_surat_keluar", JSON.stringify(unsyncedList));
  }

  filterSuratKeluarData();
  updateDashboardUI();

  if (btnSubmit) {
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = origBtnHtml;
  }
  if (modal) modal.classList.remove("show");

  if (syncSuccess) {
    if (fileName) {
      showToast(`✅ Perubahan Surat Keluar agenda ${noAgenda} berhasil disimpan & berkas di Google Drive berhasil ditimpa!`, "success");
    } else {
      showToast(`✅ Perubahan Surat Keluar agenda ${noAgenda} berhasil disimpan ke Spreadsheet!`, "success");
    }
    // Otomatis refresh data dari Google Sheets agar tampilan website dan spreadsheet selalu sinkron
    loadDataFromSpreadsheet().catch(err => console.warn(err));
  } else if (!state.appsScriptUrl) {
    showToast(`⚠️ Perubahan Surat Keluar agenda ${noAgenda} tersimpan di browser. Masukkan Web App URL di Pengaturan untuk sync ke Spreadsheet.`, "warning");
  } else {
    showToast(`⚠️ Perubahan tersimpan lokal di browser (Gagal koneksi ke Spreadsheet).`, "warning");
  }
}

/**
 * Buka modal edit data surat masuk
 */
function openEditModalMasuk(id) {
  const item = state.suratMasuk.find(s => s.id === id);
  if (!item) {
    showToast("Data surat masuk tidak ditemukan!", "error");
    return;
  }

  const modal = document.getElementById("modalEditSuratMasuk");
  const targetId = document.getElementById("editMasukId");
  const oldAgenda = document.getElementById("editMasukOldAgenda");
  const oldNoUrut = document.getElementById("editMasukOldNoUrut");
  const txtNoUrut = document.getElementById("editMasukNoUrut");
  const txtNoAgenda = document.getElementById("editMasukNoAgenda");
  const dtTglSurat = document.getElementById("editMasukTglSurat");
  const dtTglDiterima = document.getElementById("editMasukTglDiterima");
  const txtPerihal = document.getElementById("editMasukPerihal");
  const txtDari = document.getElementById("editMasukDari");
  const txtKepada = document.getElementById("editMasukKepada");
  const txtDisposisi = document.getElementById("editMasukDisposisi");
  const selKode = document.getElementById("editMasukKodeKlasifikasi");
  const curFile = document.getElementById("editMasukCurrentFileName");
  const fileInput = document.getElementById("editMasukUploadDrive");

  if (targetId) targetId.value = item.id;
  if (oldAgenda) oldAgenda.value = item.noAgenda || "";
  if (oldNoUrut) oldNoUrut.value = item.noUrut || "";
  if (txtNoUrut) txtNoUrut.value = item.noUrut || "";
  if (txtNoAgenda) txtNoAgenda.value = item.noAgenda || "";

  if (dtTglSurat) {
    dtTglSurat.value = formatDateToInput(item.tglSurat);
    updateDateBadgePreview("editMasukTglSurat", "previewEditMasukTglSurat");
  }
  if (dtTglDiterima) {
    dtTglDiterima.value = formatDateToInput(item.tglMasuk);
    updateDateBadgePreview("editMasukTglDiterima", "previewEditMasukTglDiterima");
  }

  if (txtPerihal) txtPerihal.value = item.perihal || "";

  // Pilih opsi instansi pengirim dari dropdown atau input kustom
  const selEditDari = document.getElementById("editMasukDari");
  const customEditGroup = document.getElementById("editMasukDariCustomGroup");
  const customEditInput = document.getElementById("editMasukDariCustom");
  if (selEditDari) {
    const val = (item.dari || "").trim();
    const hasOption = Array.from(selEditDari.options).some(opt => opt.value === val && opt.value !== "__CUSTOM__");
    if (hasOption) {
      selEditDari.value = val;
      if (customEditGroup) customEditGroup.style.display = "none";
      if (customEditInput) customEditInput.value = "";
    } else if (val) {
      selEditDari.value = "__CUSTOM__";
      if (customEditGroup) customEditGroup.style.display = "block";
      if (customEditInput) customEditInput.value = val;
    } else {
      selEditDari.value = "CABANG DINAS WIL.VII";
      if (customEditGroup) customEditGroup.style.display = "none";
      if (customEditInput) customEditInput.value = "";
    }
  }

  if (txtKepada) txtKepada.value = item.kepada || "SMA YWKA";
  if (txtDisposisi) txtDisposisi.value = item.keterangan || "";
  if (selKode) selKode.value = item.kodeKlasifikasi || "";

  if (curFile) {
    const hasDrive = hasDriveFileAttached(item);
    const driveHref = getDriveLinkHref(item, "masuk");
    curFile.innerHTML = hasDrive
      ? `<a href="${driveHref}" target="_blank" class="text-emerald font-bold"><i class="fa-brands fa-google-drive"></i> Berkas Scan Drive Tersedia</a>`
      : `<span style="color: #64748b;">${escapeHtml(item.lampiran || "Belum ada berkas scan")}</span>`;
  }
  if (fileInput) fileInput.value = "";

  if (modal) modal.classList.add("show");
}

/**
 * Handle form submit simpan perubahan edit surat masuk
 */
async function handleExecuteEditSuratMasuk(e) {
  e.preventDefault();

  const targetId = document.getElementById("editMasukId")?.value;
  const oldAgenda = document.getElementById("editMasukOldAgenda")?.value;
  const oldNoUrut = document.getElementById("editMasukOldNoUrut")?.value;
  const txtNoUrut = document.getElementById("editMasukNoUrut");
  const txtNoAgenda = document.getElementById("editMasukNoAgenda");
  const dtTglSurat = document.getElementById("editMasukTglSurat");
  const dtTglDiterima = document.getElementById("editMasukTglDiterima");
  const txtPerihal = document.getElementById("editMasukPerihal");
  const txtDari = document.getElementById("editMasukDari");
  const txtKepada = document.getElementById("editMasukKepada");
  const txtDisposisi = document.getElementById("editMasukDisposisi");
  const selKode = document.getElementById("editMasukKodeKlasifikasi");
  const fileInput = document.getElementById("editMasukUploadDrive");
  const btnSubmit = document.getElementById("btnSubmitEditMasuk");

  const itemIndex = state.suratMasuk.findIndex(m => m.id === targetId || m.noAgenda === oldAgenda);
  if (itemIndex === -1) {
    showToast("Data surat masuk yang akan diedit tidak ditemukan di daftar!", "error");
    return;
  }

  const existingItem = state.suratMasuk[itemIndex];
  const noAgenda = txtNoAgenda?.value.trim() || oldAgenda;
  const noUrut = txtNoUrut?.value.trim() || oldNoUrut || "";
  const formattedTglSurat = dtTglSurat?.value ? formatDateIndo(dtTglSurat.value) : (existingItem?.tglSurat || "-");
  const formattedTglTerima = dtTglDiterima?.value ? formatDateIndo(dtTglDiterima.value) : (existingItem?.tglMasuk || "-");

  const origBtnHtml = btnSubmit ? btnSubmit.innerHTML : "";
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan Perubahan...`;
  }

  let fileBase64 = "";
  let fileName = "";
  let fileMime = "";
  if (fileInput && fileInput.files && fileInput.files[0]) {
    try {
      const file = fileInput.files[0];
      const wmNo = noUrut || oldNoUrut || noAgenda || "-";
      const wmTgl = formattedTglSurat || dtTglSurat?.value || "-";
      const fileToUpload = await addWatermarkToPdfFile(file, wmNo, wmTgl);
      fileBase64 = await readFileAsBase64(fileToUpload);
      fileName = fileToUpload.name;
      fileMime = fileToUpload.type || "application/pdf";
    } catch (err) {
      console.warn("Gagal membaca file upload baru surat masuk:", err);
    }
  }

  const selEditDari = document.getElementById("editMasukDari");
  const customEditDari = document.getElementById("editMasukDariCustom");
  let editDari = (selEditDari?.value || "").trim();
  if (editDari === "__CUSTOM__") {
    editDari = (customEditDari?.value || "").trim() || "LAIN-LAIN";
  }
  if (!editDari) editDari = "CABANG DINAS WIL.VII";

  const payload = {
    action: "edit_surat_masuk",
    row_index: existingItem ? (existingItem.rowIndex || "") : "",
    old_no_agenda: oldAgenda,
    old_no_urut: oldNoUrut,
    no_agenda: noAgenda,
    no_urut: noUrut || String(itemIndex + 1),
    tanggal_surat: formattedTglSurat,
    tanggal_diterima: formattedTglTerima,
    perihal: txtPerihal?.value.trim() || "",
    dari: editDari,
    kepada: txtKepada?.value.trim() || "SMA YWKA",
    kode_klasifikasi: selKode?.value || "",
    keterangan: txtDisposisi?.value.trim() || "",
    fileBase64: fileBase64,
    fileName: fileName,
    fileMime: fileMime,
    old_drive_url: existingItem?.driveUrl || (existingItem?.lampiran && existingItem.lampiran.startsWith("http") ? existingItem.lampiran : "")
  };

  if (!state.appsScriptUrl) {
    state.pendingMasukData = { type: "edit", payload, itemIndex, origBtnHtml };
    const modalPrompt = document.getElementById("modalAppsScriptPrompt");
    if (modalPrompt) {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = origBtnHtml;
      }
      modalPrompt.classList.add("show");
      return;
    }
  }

  await executeEditSuratMasuk(payload, itemIndex, origBtnHtml);
}

/**
 * Eksekusi simpan perubahan edit surat masuk langsung ke Spreadsheet & Drive
 */
async function executeEditSuratMasuk(payload, itemIndex, origBtnHtml) {
  const btnSubmit = document.getElementById("btnSubmitEditMasuk");
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan Perubahan...`;
  }

  let syncSuccess = false;
  let driveUrl = state.suratMasuk[itemIndex].driveUrl || "";
  let errorMsg = "";

  if (state.appsScriptUrl) {
    const res = await postToAppsScript(payload);
    if (res && res.success) {
      syncSuccess = true;
      if (res.data.drive_file_url) {
        driveUrl = res.data.drive_file_url;
      }
    } else {
      errorMsg = res.message || "Gagal memperbarui di Spreadsheet";
    }
  }

  // Update object di state.suratMasuk
  const existing = state.suratMasuk[itemIndex];
  if (payload.no_urut) existing.noUrut = payload.no_urut;
  existing.noAgenda = payload.no_agenda;
  existing.tglSurat = payload.tanggal_surat;
  existing.tglMasuk = payload.tanggal_diterima;
  existing.perihal = payload.perihal;
  existing.dari = payload.dari;
  existing.kepada = payload.kepada;
  existing.kodeKlasifikasi = payload.kode_klasifikasi;
  existing.keterangan = payload.keterangan;
  if (driveUrl) {
    existing.driveUrl = driveUrl;
    existing.lampiran = driveUrl;
  } else if (payload.fileName) {
    existing.lampiran = "Tersimpan (" + payload.fileName + ")";
  }

  localStorage.setItem("cache_surat_masuk_2026", JSON.stringify(state.suratMasuk));

  const unsyncedList = JSON.parse(localStorage.getItem("unsynced_surat_masuk") || "[]");
  const unIdx = unsyncedList.findIndex(m => m.id === existing.id || m.noAgenda === payload.old_no_agenda);
  if (unIdx !== -1) {
    unsyncedList[unIdx] = Object.assign({}, unsyncedList[unIdx], existing);
    localStorage.setItem("unsynced_surat_masuk", JSON.stringify(unsyncedList));
  }

  filterSuratMasukData();
  updateDashboardUI();

  if (btnSubmit) {
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = origBtnHtml;
  }
  const modal = document.getElementById("modalEditSuratMasuk");
  if (modal) modal.classList.remove("show");

  if (syncSuccess) {
    if (payload.fileName) {
      showToast(`✅ Perubahan Surat Masuk "${payload.no_agenda}" berhasil disimpan & berkas di Google Drive berhasil ditimpa!`, "success");
    } else {
      showToast(`✅ Perubahan Surat Masuk "${payload.no_agenda}" berhasil disimpan langsung ke Spreadsheet!`, "success");
    }
    // Otomatis refresh data dari Google Sheets agar website dan spreadsheet 100% sinkron
    loadDataFromSpreadsheet().catch(err => console.warn(err));
  } else if (!state.appsScriptUrl) {
    showToast(`⚠️ Perubahan Surat Masuk "${payload.no_agenda}" tersimpan di browser. Masukkan Web App URL di Pengaturan untuk sync ke Spreadsheet.`, "warning");
  } else {
    showToast(`⚠️ Perubahan tersimpan lokal di browser (${errorMsg}). Periksa deployment Apps Script Anda.`, "warning");
  }
}

// Ekspos fungsi ke window agar dapat dipanggil dari inline HTML onclick
window.openEditModalKeluar = openEditModalKeluar;
window.handleExecuteEditSuratKeluar = handleExecuteEditSuratKeluar;
window.openEditModalMasuk = openEditModalMasuk;
window.handleExecuteEditSuratMasuk = handleExecuteEditSuratMasuk;
window.openUploadModalKeluar = openUploadModalKeluar;
window.openUploadModalMasuk = openUploadModalMasuk;
// ===================================================================
// MODUL LAPORAN BUKTI KERJA WHATSAPP (PERSONAL & GRUP ADMINISTRASI TAS)
// ===================================================================

let currentWaReportData = null;

/**
 * Normalisasi nomor WhatsApp ke standar internasional (contoh: 0895328047492 -> 62895328047492)
 */
function normalizeWaPhone(phone) {
  if (!phone) return DEFAULT_WA_PHONE;
  let clean = String(phone).replace(/[^\d+]/g, "").trim();
  if (clean.startsWith("+")) clean = clean.substring(1);
  if (clean.startsWith("0")) clean = "62" + clean.substring(1);
  if (clean.startsWith("8")) clean = "62" + clean;
  return clean || DEFAULT_WA_PHONE;
}

/**
 * Format tampilan nomor telepon dengan awalan +
 */
function formatWaPhoneDisplay(phone) {
  const norm = normalizeWaPhone(phone);
  return "+" + norm;
}

/**
 * Buat Teks Laporan Bukti Kerja WhatsApp Resmi
 */
function generateWaReportText({ type = "keluar", item = {}, driveUrl = "" }) {
  const isMasuk = (type === "masuk");
  const jenisTitle = isMasuk ? "Surat Masuk" : "Surat Keluar";
  const noAgenda = isMasuk ? (item.noUrut || item.noAgenda || "-") : (item.noAgenda || item.noUrut || "-");
  const noSurat = isMasuk ? (item.noAgenda || "-") : (item.nomorLengkap || "-");
  const tgl = isMasuk
    ? (item.tglSurat ? formatDateIndo(item.tglSurat) : "-") + (item.tglMasuk ? ` (Diterima: ${formatDateIndo(item.tglMasuk)})` : "")
    : (item.tanggal ? formatDateIndo(item.tanggal) : "-");
  const dari = item.dari || "-";
  const kepada = item.kepada || "-";
  const perihal = item.perihal || "-";
  const petugas = state.waPetugas || localStorage.getItem("settings_wa_petugas") || DEFAULT_WA_PETUGAS;

  const finalDriveUrl = driveUrl || item.driveUrl || (item.lampiran && item.lampiran.startsWith("http") ? item.lampiran : "");

  // Format waktu pengerjaan saat ini
  const now = new Date();
  const dayNames = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const dayStr = dayNames[now.getDay()];
  const dateStr = `${now.getDate()} ${monthNames[now.getMonth()]} ${now.getFullYear()}`;
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} WIB`;

  let msg = `*📢 LAPORAN BUKTI KERJA ADMINISTRASI TAS YWKA*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `✅ *Status:* Berkas Berhasil Diunggah & Disinkronkan\n`;
  msg += `📁 *Jenis Agenda:* ${jenisTitle}\n`;
  msg += `🔢 *No. Urut / Agenda:* ${noAgenda}\n`;
  msg += `📜 *Nomor Surat:* ${noSurat}\n`;
  msg += `📅 *Tanggal Surat:* ${tgl}\n`;
  if (isMasuk) {
    msg += `🏢 *Pengirim / Asal Surat:* ${dari}\n`;
    if (kepada && kepada !== "-") msg += `🎯 *Ditujukan Kepada:* ${kepada}\n`;
  } else {
    msg += `🎯 *Ditujukan Kepada:* ${kepada}\n`;
    if (dari && dari !== "-") msg += `🏢 *Pengirim / Pengonsep:* ${dari}\n`;
  }
  msg += `📝 *Perihal:* ${perihal}\n`;
  msg += `👤 *Petugas Administrasi:* ${petugas}\n`;
  msg += `🕒 *Waktu Pengerjaan:* ${dayStr}, ${dateStr} ${timeStr}\n\n`;

  if (finalDriveUrl) {
    msg += `🔗 *Tautan Berkas Google Drive:*\n${finalDriveUrl}\n\n`;
  } else {
    msg += `⚠️ *Tautan Berkas:* Belum dilampirkan link Drive\n\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `_Laporan otomatis Sistem Agenda Surat SMAS YWKA Bandung sebagai bukti fisik pengerjaan administrasi._`;

  return msg;
}

/**
 * Buka Modal Laporan Bukti Kerja WhatsApp
 */
function openWaReportModal({ type = "keluar", item = {}, driveUrl = "" }) {
  if (!item) return;

  const finalDriveUrl = driveUrl || item.driveUrl || (item.lampiran && item.lampiran.startsWith("http") ? item.lampiran : "");
  const text = generateWaReportText({ type, item, driveUrl: finalDriveUrl });

  currentWaReportData = {
    type,
    item,
    driveUrl: finalDriveUrl,
    text
  };

  const modal = document.getElementById("modalWaReport");
  const textArea = document.getElementById("waReportPreviewText");
  const phoneDisplay = document.getElementById("waTargetPhoneDisplay");

  const targetPhone = state.waPhone || localStorage.getItem("settings_wa_phone") || DEFAULT_WA_PHONE;

  if (textArea) textArea.value = text;
  if (phoneDisplay) phoneDisplay.textContent = formatWaPhoneDisplay(targetPhone);

  const btnSendPersonal = document.getElementById("btnSendWaPersonal");
  if (btnSendPersonal) {
    btnSendPersonal.innerHTML = `<i class="fa-brands fa-whatsapp" style="font-size: 19px;"></i> Kirim ke WhatsApp Saya (${formatWaPhoneDisplay(targetPhone)})`;
  }

  if (modal) modal.classList.add("show");
}

/**
 * Eksekusi Kirim WhatsApp (Personal atau Bagikan ke Grup TAS / Kontak Lain)
 */
function sendWaReport(isPersonal = true) {
  if (!currentWaReportData || !currentWaReportData.text) {
    showToast("Tidak ada data laporan yang siap dikirim!", "warning");
    return;
  }

  const text = currentWaReportData.text;
  let url = "";

  if (isPersonal) {
    const rawPhone = state.waPhone || localStorage.getItem("settings_wa_phone") || DEFAULT_WA_PHONE;
    const normPhone = normalizeWaPhone(rawPhone);
    url = `https://api.whatsapp.com/send?phone=${normPhone}&text=${encodeURIComponent(text)}`;
    showToast(`Membuka WhatsApp untuk mengirim bukti kerja ke ${formatWaPhoneDisplay(normPhone)}...`, "info");
  } else {
    url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    showToast("Membuka WhatsApp untuk memilih Grup Administrasi TAS / kontak tujuan...", "info");
  }

  window.open(url, "_blank");
}

/**
 * Buka Laporan WA langsung dari baris tabel
 */
function openWaReportForRow(id, type = "keluar") {
  const isMasuk = (type === "masuk");
  const item = isMasuk
    ? state.suratMasuk.find(m => m.id === id)
    : state.suratKeluar.find(s => s.id === id);

  if (!item) {
    showToast("Data surat tidak ditemukan!", "error");
    return;
  }

  const driveUrl = getDriveLinkHref(item, type);
  openWaReportModal({ type, item, driveUrl });
}

/**
 * Inisialisasi Event Listener Modul WhatsApp
 */
function initWaModule() {
  const modal = document.getElementById("modalWaReport");
  const btnClose = document.getElementById("btnCloseModalWaReport");
  const btnCloseFooter = document.getElementById("btnCloseWaReportFooter");
  const btnSendPersonal = document.getElementById("btnSendWaPersonal");
  const btnSendGroup = document.getElementById("btnSendWaGroup");
  const btnCopy = document.getElementById("btnCopyWaText");
  const linkEdit = document.getElementById("linkEditWaPhone");
  const btnTestWa = document.getElementById("btnTestWaMessage");
  const btnShareDisposisi = document.getElementById("btnShareWaDisposisi");
  const btnShareBanner = document.getElementById("btnShareWaFromBanner");

  if (btnClose && modal) {
    btnClose.addEventListener("click", () => modal.classList.remove("show"));
  }
  if (btnCloseFooter && modal) {
    btnCloseFooter.addEventListener("click", () => modal.classList.remove("show"));
  }
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.remove("show");
    });
  }

  if (btnSendPersonal) {
    btnSendPersonal.addEventListener("click", () => sendWaReport(true));
  }
  if (btnSendGroup) {
    btnSendGroup.addEventListener("click", () => sendWaReport(false));
  }

  if (btnCopy) {
    btnCopy.addEventListener("click", () => {
      const text = currentWaReportData?.text || document.getElementById("waReportPreviewText")?.value || "";
      if (text) {
        copyText(text, "✅ Format laporan bukti kerja WhatsApp berhasil disalin ke clipboard!");
      } else {
        showToast("Teks laporan masih kosong!", "warning");
      }
    });
  }

  if (linkEdit && modal) {
    linkEdit.addEventListener("click", (e) => {
      e.preventDefault();
      modal.classList.remove("show");
      switchTab("tab-koneksi");
      const input = document.getElementById("inputWaPhone");
      if (input) {
        input.focus();
        input.select();
      }
    });
  }

  if (btnTestWa) {
    btnTestWa.addEventListener("click", () => {
      const inputWaPhone = document.getElementById("inputWaPhone");
      const inputWaPetugas = document.getElementById("inputWaPetugas");
      const testPhone = inputWaPhone ? inputWaPhone.value.trim() : DEFAULT_WA_PHONE;
      const testPetugas = inputWaPetugas ? inputWaPetugas.value.trim() : DEFAULT_WA_PETUGAS;

      const normPhone = normalizeWaPhone(testPhone);
      const testMsg = `*📢 UJI COBA KONEKSI WHATSAPP ADMINISTRASI TAS YWKA*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `✅ *Status:* Format Notifikasi Berhasil Terhubung!\n` +
        `👤 *Petugas Pengirim:* ${testPetugas}\n` +
        `📱 *Nomor Tujuan:* +${normPhone}\n` +
        `🕒 *Waktu Uji:* ${new Date().toLocaleString("id-ID")} WIB\n\n` +
        `_Pesan ini membuktikan bahwa integrasi laporan bukti kerja otomatis di website Sistem Agenda Surat SMA YWKA Bandung telah aktif dan siap digunakan._`;

      const url = `https://api.whatsapp.com/send?phone=${normPhone}&text=${encodeURIComponent(testMsg)}`;
      showToast(`Membuka WhatsApp untuk mengirim uji coba ke +${normPhone}...`, "success");
      window.open(url, "_blank");
    });
  }

  if (btnShareDisposisi) {
    btnShareDisposisi.addEventListener("click", () => {
      if (currentPrintData && currentPrintData.item) {
        openWaReportForRow(currentPrintData.item.id, currentPrintData.type);
      } else {
        showToast("Pilih surat terlebih dahulu!", "warning");
      }
    });
  }

  if (btnShareBanner) {
    btnShareBanner.addEventListener("click", () => {
      if (currentPrintData && currentPrintData.item) {
        openWaReportForRow(currentPrintData.item.id, currentPrintData.type);
      } else {
        showToast("Pilih surat terlebih dahulu!", "warning");
      }
    });
  }
}

// Window exports
window.openWaReportForRow = openWaReportForRow;
window.openWaReportModal = openWaReportModal;
window.sendWaReport = sendWaReport;
window.initWaModule = initWaModule;

/**
 * Hapus Berkas Drive yang ada (Kosongkan tautan di Spreadsheet & buang berkas di Drive ke Sampah)
 */
async function handleDeleteExistingDriveFile() {
  const targetId = document.getElementById("uploadModalTargetId")?.value;
  const targetAgenda = document.getElementById("uploadModalTargetAgenda")?.value;
  const targetType = document.getElementById("uploadModalTargetType")?.value || "keluar";
  const targetUrut = document.getElementById("uploadModalTargetUrut")?.value || "";
  const targetRowIndex = document.getElementById("uploadModalTargetRowIndex")?.value || "";
  const modal = document.getElementById("modalUploadRowDrive");
  const btnDelete = document.getElementById("btnDeleteExistingDriveFile");

  const isMasuk = (targetType === "masuk");
  const targetItem = isMasuk
    ? state.suratMasuk.find(m => m.id === targetId || (targetUrut && m.noUrut && String(m.noUrut).trim() === String(targetUrut).trim()) || (targetAgenda && targetAgenda !== "-" && m.noAgenda && m.noAgenda === targetAgenda))
    : state.suratKeluar.find(s => s.id === targetId || s.noAgenda === targetAgenda);

  const oldUrl = targetItem?.driveUrl || (targetItem?.lampiran && targetItem.lampiran.startsWith("http") ? targetItem.lampiran : "");

  if (!confirm("Hapus berkas Google Drive untuk surat ini?\n\nSkema: Link di Spreadsheet akan dikosongkan dan berkas di Google Drive akan dibuang ke Sampah.")) {
    return;
  }

  const origBtnHtml = btnDelete ? btnDelete.innerHTML : "";
  if (btnDelete) {
    btnDelete.disabled = true;
    btnDelete.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menghapus...`;
  }

  try {
    if (state.appsScriptUrl) {
      const payload = {
        action: "delete_lampiran_drive",
        type: targetType,
        no_agenda: targetAgenda,
        no_urut: targetUrut,
        row_index: targetRowIndex,
        old_drive_url: oldUrl
      };

      const res = await fetch(state.appsScriptUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(payload)
      });
      const resJson = await res.json();
      if (resJson && resJson.status !== "success") {
        throw new Error(resJson.message || "Gagal menghapus berkas di Apps Script");
      }
    }

    if (isMasuk) {
      if (targetItem) {
        targetItem.driveUrl = "";
        targetItem.lampiran = "Surat Masuk";
        targetItem.status = false;
      }
      localStorage.setItem("cache_surat_masuk_2026", JSON.stringify(state.suratMasuk));
      filterSuratMasukData();
    } else {
      if (targetItem) {
        targetItem.driveUrl = "";
        targetItem.lampiran = "Surat Keluar";
        targetItem.status = false;
      }
      localStorage.setItem("cache_surat_keluar_2026", JSON.stringify(state.suratKeluar));
      filterSuratKeluarData();
    }

    updateDashboardUI();
    if (modal) modal.classList.remove("show");
    showToast("✅ Berkas berhasil dihapus! Tautan di Spreadsheet telah dikosongkan dan berkas di Google Drive dipindahkan ke Sampah.", "success");
  } catch (err) {
    console.error("Gagal menghapus berkas Drive:", err);
    showToast(`⚠️ Gagal menghapus berkas: ${err.message || err}`, "error");
  } finally {
    if (btnDelete) {
      btnDelete.disabled = false;
      btnDelete.innerHTML = origBtnHtml;
    }
  }
}
window.handleDeleteExistingDriveFile = handleDeleteExistingDriveFile;

window.handleExecuteUploadRowDrive = handleExecuteUploadRowDrive;
window.openBatchUploadModalKeluar = openBatchUploadModalKeluar;
window.removeBatchFile = removeBatchFile;
window.removeBatchItem = removeBatchItem;
window.openBatchEditModalKeluar = openBatchEditModalKeluar;
window.openBatchPrintModal = openBatchPrintModal;
window.removeBatchPrintItem = removeBatchPrintItem;
window.executeBatchPrintDisposisi = executeBatchPrintDisposisi;
window.executeBatchPrintFiles = executeBatchPrintFiles;
window.openDirectPrint = openDirectPrint;
window.openDirectPrintFile = openDirectPrintFile;
window.switchPrintTab = switchPrintTab;
window.executePrintAttachedFile = executePrintAttachedFile;
window.renderBatchEditPreview = renderBatchEditPreview;
window.removeBatchEditItem = removeBatchEditItem;
window.executeBatchEditKeluar = executeBatchEditKeluar;
window.handleSyncDriveToSpreadsheet = handleSyncDriveToSpreadsheet;
window.openDeleteModalKeluar = openDeleteModalKeluar;
window.openDeleteModalMasuk = openDeleteModalMasuk;
window.handleExecuteDeleteRow = handleExecuteDeleteRow;
window.viewDisposisiKeluar = viewDisposisiKeluar;
window.viewDisposisiMasuk = viewDisposisiMasuk;
window.copyText = copyText;
window.changeKeluarPage = changeKeluarPage;
window.changeMasukPage = changeMasukPage;

/**
 * Format Tanggal ke Bahasa Indonesia Panjang (contoh: 22 Oktober 2026)
 */
function formatDateToIndonesianLong(date) {
  if (!date || isNaN(date.getTime())) return "22 Oktober 2026";
  const months = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Escape string HTML untuk keamanan
 */
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * ===================================================================
 * Modul Fitur: Template Dokumen Kosong (Format Naskah Dinas Resmi)
 * Menyiapkan format draft dokumen resmi sesuai surat/kode yang ditentukan
 * ===================================================================
 */


/**
 * =========================================================================
 * BATCH ACTIONS & SELECTION FOR SURAT MASUK
 * =========================================================================
 */
function updateCheckAllMasukState() {
  const checkAll = document.getElementById("checkAllMasuk");
  if (!checkAll) return;
  const currentSlice = getCurrentMasukSlice();
  if (currentSlice.length === 0) {
    checkAll.checked = false;
    checkAll.indeterminate = false;
    return;
  }
  const selectedInSlice = currentSlice.filter(item => state.selectedMasukIds.has(item.id));
  if (selectedInSlice.length === currentSlice.length) {
    checkAll.checked = true;
    checkAll.indeterminate = false;
  } else if (selectedInSlice.length > 0) {
    checkAll.checked = false;
    checkAll.indeterminate = true;
  } else {
    checkAll.checked = false;
    checkAll.indeterminate = false;
  }
}

function updateBatchMasukBar() {
  const bar = document.getElementById("batchMasukBar");
  const countBadge = document.getElementById("batchMasukCountBadge");
  const printBtnCount = document.getElementById("batchPrintMasukBtnCount");
  const btnCount = document.getElementById("batchMasukBtnCount");
  if (!bar) return;

  const count = state.selectedMasukIds ? state.selectedMasukIds.size : 0;
  if (countBadge) countBadge.textContent = count;
  if (printBtnCount) printBtnCount.textContent = count;
  if (btnCount) btnCount.textContent = count;

  if (count > 0) {
    bar.style.display = "flex";
  } else {
    bar.style.display = "none";
  }
}

function getCurrentMasukSlice() {
  const page = state.pagination.masukPage;
  const perPage = state.pagination.masukPerPage;
  const start = (page - 1) * perPage;
  const end = Math.min(start + perPage, state.filteredMasuk.length);
  return state.filteredMasuk.slice(start, end);
}

/**
 * =========================================================================
 * MODUL FITUR: BATCH PRINT (CETAK MASSAL SURAT KELUAR & SURAT MASUK)
 * =========================================================================
 */

/**
 * Buka Modal Batch Print
 * @param {string} type 'keluar' atau 'masuk'
 * @param {Array<string>|null} targetIds Daftar ID surat spesifik (opsional)
 */
function openBatchPrintModal(type = "keluar", targetIds = null) {
  state.batchPrintType = type;
  const isMasuk = (type === "masuk");
  let itemsToPrint = [];

  if (targetIds && targetIds.length > 0) {
    itemsToPrint = targetIds.map(id => {
      return isMasuk ? state.suratMasuk.find(m => m.id === id) : state.suratKeluar.find(k => k.id === id);
    }).filter(Boolean);
  } else {
    const selectedIds = isMasuk ? state.selectedMasukIds : state.selectedKeluarIds;
    if (selectedIds && selectedIds.size > 0) {
      itemsToPrint = Array.from(selectedIds).map(id => {
        return isMasuk ? state.suratMasuk.find(m => m.id === id) : state.suratKeluar.find(k => k.id === id);
      }).filter(Boolean);
    } else {
      // Jika belum ada yang diceklis: otomatis ambil surat di halaman yang sedang aktif
      const currentSlice = isMasuk ? getCurrentMasukSlice() : getCurrentKeluarSlice();
      if (currentSlice.length > 0) {
        itemsToPrint = [...currentSlice];
        currentSlice.forEach(item => {
          if (isMasuk) state.selectedMasukIds.add(item.id);
          else state.selectedKeluarIds.add(item.id);
        });
        if (isMasuk) {
          renderSuratMasukTable();
          updateBatchMasukBar();
        } else {
          renderSuratKeluarTable();
          updateBatchKeluarBar();
        }
        showToast(`Otomatis memuat ${itemsToPrint.length} surat pada halaman ini ke antrean cetak.`, "info");
      }
    }
  }

  if (itemsToPrint.length === 0) {
    showToast(`Tidak ada ${isMasuk ? "surat masuk" : "surat keluar"} yang dapat dicetak!`, "warning");
    return;
  }

  state.batchPrintItems = itemsToPrint;

  // Set mode default: disposisi
  setBatchPrintMode("disposisi");
  renderBatchPrintItemsTable();

  const modal = document.getElementById("modalBatchPrint");
  if (modal) modal.classList.add("show");
}

/**
 * Ganti mode cetak antara lembar disposisi dan berkas lampiran
 */
function setBatchPrintMode(mode) {
  state.batchPrintMode = mode;
  const optDisposisi = document.getElementById("optBatchDisposisi");
  const optBerkas = document.getElementById("optBatchBerkas");
  const cardDisposisi = document.getElementById("cardOptionDisposisi");
  const cardBerkas = document.getElementById("cardOptionBerkas");
  const btnPrintDisposisi = document.getElementById("btnExecuteBatchPrintDisposisi");
  const btnPrintFiles = document.getElementById("btnExecuteBatchPrintFiles");

  if (mode === "berkas") {
    if (optBerkas) optBerkas.checked = true;
    if (cardDisposisi) cardDisposisi.classList.remove("active");
    if (cardBerkas) cardBerkas.classList.add("active");
    if (btnPrintDisposisi) btnPrintDisposisi.style.display = "none";
    if (btnPrintFiles) btnPrintFiles.style.display = "inline-flex";
  } else {
    if (optDisposisi) optDisposisi.checked = true;
    if (cardDisposisi) cardDisposisi.classList.add("active");
    if (cardBerkas) cardBerkas.classList.remove("active");
    if (btnPrintDisposisi) btnPrintDisposisi.style.display = "inline-flex";
    if (btnPrintFiles) btnPrintFiles.style.display = "none";
  }
}

/**
 * Render tabel daftar surat yang ada di antrean batch print
 */
function renderBatchPrintItemsTable() {
  const tbody = document.getElementById("tbodyBatchPrintItems");
  const scopeBadge = document.getElementById("batchPrintScopeBadge");
  const countDisposisi = document.getElementById("batchPrintDisposisiCount");
  const countFile = document.getElementById("batchPrintFileCount");
  if (!tbody) return;

  const items = state.batchPrintItems || [];
  const total = items.length;
  const isMasuk = (state.batchPrintType === "masuk");

  let hasFileCount = 0;
  items.forEach(item => {
    if (hasDriveFileAttached(item)) hasFileCount++;
  });

  if (scopeBadge) scopeBadge.textContent = `${total} Surat Terpilih`;
  if (countDisposisi) countDisposisi.textContent = total;
  if (countFile) countFile.textContent = hasFileCount;

  if (total === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 30px; color: #94a3b8;">
          <i class="fa-solid fa-file-circle-question" style="font-size: 28px; margin-bottom: 8px;"></i>
          <p>Antrean cetak kosong. Silakan tambahkan surat yang ingin dicetak.</p>
        </td>
      </tr>
    `;
    return;
  }

  let html = "";
  items.forEach((item, idx) => {
    const hasFile = hasDriveFileAttached(item);
    const agendaText = isMasuk ? (item.noAgenda || "-") : (item.noAgenda || item.noUrut || "-");
    const tglText = isMasuk ? (item.tglSurat || "-") : (item.tanggal || "-");
    const instansiText = isMasuk ? (item.dari || "-") : (item.kepada || "-");

    const badgeFile = hasFile
      ? `<span class="badge-tab-pill has-file" style="cursor: pointer;" title="Pratinjau berkas" onclick="openDirectPrintFile('${item.id}', '${state.batchPrintType}')">
           <i class="fa-solid fa-check"></i> Ada Berkas
         </span>`
      : `<span class="badge-tab-pill no-file">
           <i class="fa-solid fa-minus"></i> Tanpa Berkas
         </span>`;

    html += `
      <tr>
        <td style="text-align: center; font-weight: 600; color: #64748b;">${idx + 1}</td>
        <td><span class="nomor-agenda-badge"><strong>${escapeHtml(agendaText)}</strong></span></td>
        <td style="font-size: 13px;">${escapeHtml(item.perihal || "-")}</td>
        <td style="font-size: 12.5px; color: #334155;">${escapeHtml(instansiText)}</td>
        <td style="text-align: center; font-size: 12px;">${escapeHtml(tglText)}</td>
        <td style="text-align: center;">${badgeFile}</td>
        <td style="text-align: center;">
          <button type="button" class="btn btn-outline btn-xs text-danger" title="Hapus dari antrean cetak" onclick="removeBatchPrintItem('${item.id}')">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

/**
 * Hapus 1 item dari antrean batch print
 */
function removeBatchPrintItem(id) {
  state.batchPrintItems = state.batchPrintItems.filter(item => item.id !== id);
  if (state.batchPrintType === "masuk") {
    state.selectedMasukIds.delete(id);
    renderSuratMasukTable();
    updateBatchMasukBar();
  } else {
    state.selectedKeluarIds.delete(id);
    renderSuratKeluarTable();
    updateBatchKeluarBar();
  }
  renderBatchPrintItemsTable();
}

/**
 * Eksekusi Cetak Massal Lembar Disposisi / Agenda Resmi
 */
function executeBatchPrintDisposisi() {
  const items = state.batchPrintItems || [];
  if (items.length === 0) {
    showToast("Pilih minimal satu surat untuk dicetak!", "warning");
    return;
  }

  const isMasuk = (state.batchPrintType === "masuk");
  const printArea = document.getElementById("batchPrintArea");
  if (!printArea) return;

  // Bangun naskah lembar disposisi resmi untuk SETIAP surat
  let html = "";
  items.forEach(item => {
    const tipeSurat = isMasuk ? "Surat Masuk" : "Surat Keluar";
    const noUrut = isMasuk ? (item.noUrut || item.noAgenda || "-") : (item.noAgenda || item.noUrut || "-");
    const noLengkap = isMasuk ? (item.noAgenda || "-") : (item.nomorLengkap || "-");
    const tglSurat = isMasuk
      ? (item.tglSurat + (item.tglMasuk ? " (Diterima: " + item.tglMasuk + ")" : ""))
      : (item.tanggal || "-");
    const petugas = isMasuk ? (item.keterangan || "-") : (item.petugas || "-");
    const dari = item.dari || "-";
    const kepada = item.kepada || "-";
    const perihal = item.perihal || "-";

    html += `
      <div class="disposisi-card page-break">
        <div class="disposisi-header" style="display: flex; align-items: center; justify-content: center; gap: 16px; margin-bottom: 14px;">
          <img src="logo-ywka.png" alt="Logo SMAS YWKA Bandung" style="width: 58px; height: 58px; object-fit: contain;">
          <div class="disposisi-school" style="text-align: left;">
            <div style="font-size: 13px; font-weight: 700; color: #1e293b; letter-spacing: 0.5px;">YAYASAN WANITA KERETA API</div>
            <h2 style="font-size: 19px; font-weight: 900; color: #002b80; margin: 1px 0;">SMAS YWKA BANDUNG</h2>
            <p style="font-size: 11px; margin: 1px 0;">Jl. Elang II No. 3, Garuda, Kec. Andir, Kota Bandung, Jawa Barat</p>
            <small style="font-size: 10px; color: #64748b;">Akreditasi: A | NSS: 302026002008 | NPSN: 20219736 | Telp: (022) 6011740</small>
          </div>
        </div>
        <div class="disposisi-divider"></div>
        <h3 class="disposisi-title">LEMBAR AGENDA SURAT (${tipeSurat.toUpperCase()})</h3>

        <table class="disposisi-table">
          <tr>
            <td class="dt-label">Tipe Surat</td>
            <td class="dt-val">${escapeHtml(tipeSurat)}</td>
            <td class="dt-label">No. Agenda</td>
            <td class="dt-val font-bold stat-mono">${escapeHtml(noUrut)}</td>
          </tr>
          <tr>
            <td class="dt-label">Nomor Surat Lengkap</td>
            <td class="dt-val font-bold stat-mono" colspan="3">${escapeHtml(noLengkap)}</td>
          </tr>
          <tr>
            <td class="dt-label">Tanggal Surat</td>
            <td class="dt-val">${escapeHtml(tglSurat)}</td>
            <td class="dt-label">Petugas / PIC</td>
            <td class="dt-val">${escapeHtml(petugas)}</td>
          </tr>
          <tr>
            <td class="dt-label">Dari</td>
            <td class="dt-val" colspan="3">${escapeHtml(dari)}</td>
          </tr>
          <tr>
            <td class="dt-label">Kepada / Ditujukan</td>
            <td class="dt-val" colspan="3">${escapeHtml(kepada)}</td>
          </tr>
          <tr>
            <td class="dt-label">Prihal / Isi Ringkasan</td>
            <td class="dt-val font-bold" colspan="3">${escapeHtml(perihal)}</td>
          </tr>
          <tr>
            <td class="dt-label">Instruksi / Catatan Disposisi</td>
            <td class="dt-val dt-notes" colspan="3">
              <div class="checkbox-row">
                <span>[ ] Tindak Lanjuti Segera</span>
                <span>[ ] Hadiri / Wakili</span>
                <span>[ ] Buatkan Balasan</span>
                <span>[ ] Arsipkan di Drive</span>
              </div>
              <div class="signature-space">
                <span>Catatan: _________________________________________________</span>
                <div class="sig-box">
                  <p>Kepala SMA YWKA Bandung,</p>
                  <div style="height: 45px;"></div>
                  <strong>Syarif Hasanudin, S.Pd., Gr., M.M.</strong>
                </div>
              </div>
            </td>
          </tr>
        </table>
      </div>
    `;
  });

  printArea.innerHTML = html;
  document.body.classList.add("printing-batch");

  // Jalankan dialog print browser
  setTimeout(() => {
    window.print();
  }, 150);

  // Bersihkan setelah pencetakan selesai
  const cleanup = () => {
    document.body.classList.remove("printing-batch");
    printArea.innerHTML = "";
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
}

/**
 * Eksekusi Cetak Antrean Berkas Lampiran / Scan
 */
function executeBatchPrintFiles() {
  const items = state.batchPrintItems || [];
  const filesToPrint = items.filter(item => hasDriveFileAttached(item));

  if (filesToPrint.length === 0) {
    showToast("Tidak ada surat terpilih yang memiliki berkas lampiran!", "warning");
    return;
  }

  showToast(`Mempersiapkan pencetakan untuk ${filesToPrint.length} berkas lampiran...`, "info");

  // Buka popup antrean cetak atau buka jendela preview cetak untuk berkas pertama dan selanjutnya
  filesToPrint.forEach((item, idx) => {
    const rawUrl = getDriveLinkHref(item, state.batchPrintType || "keluar");
    const embedUrl = getGoogleDriveEmbedUrl(rawUrl);

    setTimeout(() => {
      window.open(embedUrl, `CetakBerkas_${idx}`, "width=960,height=800,menubar=no,toolbar=no,scrollbars=yes");
    }, idx * 600); // Beri jeda 600ms agar browser tidak memblokir multiple popups
  });

  showToast(`Berhasil membuka ${filesToPrint.length} jendela pratinjau berkas siap cetak!`, "success");
}

function initTemplateKosong() {
  const btnTop = document.getElementById("btnOpenTopTemplateKosong");
  const btnResult = document.getElementById("btnOpenTemplateKosong");
  const btnClose = document.getElementById("btnCloseModalTemplateKosong");
  const btnCloseFooter = document.getElementById("btnCloseTplKosongFooter");
  const btnPrint = document.getElementById("btnPrintTplKosongDoc");
  const btnCopy = document.getElementById("btnCopyTplKosongText");
  const btnDownloadWord = document.getElementById("btnDownloadWordTplKosong");
  const modal = document.getElementById("modalTemplateKosong");

  if (btnTop) {
    btnTop.addEventListener("click", () => openTemplateKosongModal());
  }
  if (btnResult) {
    btnResult.addEventListener("click", () => openTemplateKosongModal());
  }
  if (btnClose && modal) {
    btnClose.addEventListener("click", () => modal.classList.remove("show"));
  }
  if (btnCloseFooter && modal) {
    btnCloseFooter.addEventListener("click", () => modal.classList.remove("show"));
  }
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.remove("show");
    });
  }

  if (btnPrint) {
    btnPrint.addEventListener("click", () => {
      window.print();
    });
  }

  if (btnCopy) {
    btnCopy.addEventListener("click", () => {
      const sheet = document.getElementById("tplKosongSheet");
      if (!sheet) return;
      const text = sheet.innerText || sheet.textContent;
      copyText(text, "✅ Teks naskah format dokumen kosong berhasil disalin ke clipboard!");
    });
  }

  if (btnDownloadWord) {
    btnDownloadWord.addEventListener("click", () => {
      const nomor = document.getElementById("tplDocNomor")?.textContent || "Surat_Dinas_YWKA";
      const cleanNomor = nomor.replace(/[/\\?%*:|"<>]/g, "_");
      downloadLetterAsWord(`Template_${cleanNomor}`, "tplKosongSheet");
    });
  }
}

/**
 * Membuka Modal Template Dokumen Kosong dengan format terstruktur
 */
function openTemplateKosongModal() {
  const modal = document.getElementById("modalTemplateKosong");
  if (!modal) return;

  // 1. Ambil data dari form Generator Surat Keluar
  const selKode = document.getElementById("genKodeKlasifikasi");
  const customKode = document.getElementById("genCustomKode");
  let kodeVal = selKode ? selKode.value : "421.3";
  if (kodeVal === "custom" && customKode && customKode.value.trim()) {
    kodeVal = customKode.value.trim();
  }

  const fullNumber = document.getElementById("previewFullNumber")?.textContent || "421.3/609/SMA YWKA/TU/X/2026";
  const inputTgl = document.getElementById("genTanggalSurat")?.value;
  let formattedDateIndo = "27 Oktober 2026";
  if (inputTgl) {
    const parts = inputTgl.split("-");
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      formattedDateIndo = formatDateToIndonesianLong(d);
    }
  }

  const perihalInput = document.getElementById("genPerihal")?.value.trim() || "";
  const kepadaInput = document.getElementById("genKepada")?.value.trim() || "";
  const dariInput = document.getElementById("genDari")?.value.trim() || "Syarif Hasanudin, S.Pd., Gr., M.M.";

  // 2. Set Metadata Dokumen
  const elBadge = document.getElementById("tplDocJenisBadge");
  const elNomor = document.getElementById("tplDocNomor");
  const elPerihal = document.getElementById("tplDocPerihal");
  const elTitiTop = document.getElementById("tplDocTitiMangsaTop");
  const elTitiBottom = document.getElementById("tplDocTitiMangsaBottom");
  const elKepada = document.getElementById("tplDocKepada");
  const elNamaSig = document.getElementById("tplDocNamaSig");
  const titleBox = document.getElementById("tplDocCenterTitleBox");
  const titleCenter = document.getElementById("tplDocCenterTitle");
  const titleNomor = document.getElementById("tplDocCenterNomor");
  const contentEl = document.getElementById("tplDocContent");

  if (elNomor) elNomor.textContent = fullNumber;
  if (elTitiTop) elTitiTop.textContent = `Bandung, ${formattedDateIndo}`;
  if (elTitiBottom) elTitiBottom.textContent = `Bandung, ${formattedDateIndo}`;
  if (elNamaSig) elNamaSig.textContent = dariInput;

  // 3. Bangun Format Kerangka Draft Berdasarkan Kode
  let labelKode = "Surat Umum";
  let defaultPerihal = perihalInput || "Undangan Rapat Dinas Sekolah";
  let defaultKepada = kepadaInput || "Bapak/Ibu Guru & Karyawan SMAS YWKA Bandung";
  let showCenterTitle = false;
  let centerTitleText = "SURAT DINAS";
  let bodyHtml = "";

  if (kodeVal.startsWith("421.6")) {
    labelKode = "421.6 - Surat Pelepasan / Wisuda";
    defaultPerihal = perihalInput || "Undangan & Pemberitahuan Wisuda / Pelepasan Siswa Kelas XII";
    defaultKepada = kepadaInput || "Orang Tua / Wali Siswa Kelas XII SMAS YWKA Bandung";
    bodyHtml = `
      <p class="no-indent">Dengan hormat,</p>
      <p>
        Sehubungan dengan telah berakhirnya masa studi peserta didik Kelas XII Tahun Ajaran 2025/2026, bersama ini Kepala SMAS YWKA Bandung mengundang Bapak/Ibu Orang Tua/Wali Murid untuk menghadiri acara <strong>Pelepasan & Wisuda Siswa Kelas XII</strong> yang akan dilaksanakan pada:
      </p>
      <p style="margin-left: 20px;">
        <strong>Hari / Tanggal</strong> : [Hari, Tanggal Pelaksanaan]<br>
        <strong>Waktu</strong> : 08.00 WIB s/d Selesai<br>
        <strong>Tempat</strong> : [Gedung Graha YWKA / Hotel Grand Pasundan Bandung]<br>
        <strong>Pakaian</strong> : Formal / Bebas Rapi
      </p>
      <p>
        Mengingat pentingnya agenda tersebut, kami sangat mengharapkan kehadiran Bapak/Ibu tepat pada waktunya.
      </p>
      <p>
        Demikian undangan ini kami sampaikan, atas perhatian dan kehadiran Bapak/Ibu, kami ucapkan terima kasih.
      </p>
    `;
  } else if (kodeVal.startsWith("421.71")) {
    labelKode = "421.71 - Kegiatan Reuni / Karya Wisata";
    defaultPerihal = perihalInput || "Pemberitahuan Kegiatan Karya Wisata & Kunjungan Edukasi";
    defaultKepada = kepadaInput || "Orang Tua / Wali Siswa SMAS YWKA Bandung";
    bodyHtml = `
      <p class="no-indent">Dengan hormat,</p>
      <p>
        Dalam rangka memperluas wawasan keilmuan, kepemimpinan, dan pengalaman belajar kontekstual siswa di luar kelas, SMAS YWKA Bandung akan menyelenggarakan kegiatan <strong>Karya Wisata & Kunjungan Edukasi</strong> dengan rincian sebagai berikut:
      </p>
      <p style="margin-left: 20px;">
        <strong>Hari / Tanggal</strong> : [Hari, Tanggal Pelaksanaan]<br>
        <strong>Tujuan Kunjungan</strong> : [Destinasi Kunjungan Edukasi / PT. KAI / Museum]<br>
        <strong>Peserta</strong> : Siswa-Siswi Kelas [X / XI] Beserta Guru Pendamping<br>
        <strong>Titik Kumpul</strong> : Kampus SMAS YWKA Bandung (Pukul 06.30 WIB)
      </p>
      <p>
        Demikian pemberitahuan ini kami sampaikan. Atas perhatian, dukungan, dan kerja sama Bapak/Ibu Orang Tua/Wali Siswa, kami ucapkan terima kasih.
      </p>
    `;
  } else if (kodeVal.startsWith("421.7")) {
    labelKode = "421.7 - Kegiatan Siswa (Dispensasi / Lomba / Ekskul)";
    defaultPerihal = perihalInput || "Permohonan Dispensasi Belajar Siswa Mengikuti Lomba";
    defaultKepada = kepadaInput || "Bapak/Ibu Guru Mata Pelajaran SMAS YWKA Bandung";
    bodyHtml = `
      <p class="no-indent">Dengan hormat,</p>
      <p>
        Sehubungan dengan keikutsertaan peserta didik SMAS YWKA Bandung pada kegiatan kompetisi / kegiatan kesiswaan [Nama Kegiatan / Lomba], bersama ini kami memohon izin dispensasi belajar bagi siswa-siswi berikut:
      </p>
      <table class="letter-table-formal">
        <thead>
          <tr>
            <th style="width: 35px; text-align: center;">No</th>
            <th>Nama Lengkap Siswa</th>
            <th style="width: 140px; text-align: center;">Kelas / NISN</th>
            <th>Cabang Lomba / Keterangan</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="text-align: center;">1</td>
            <td><strong>[Nama Lengkap Siswa 1]</strong></td>
            <td style="text-align: center;">[Kelas / NISN]</td>
            <td>[Cabang Kegiatan / Peserta]</td>
          </tr>
          <tr>
            <td style="text-align: center;">2</td>
            <td><strong>[Nama Lengkap Siswa 2]</strong></td>
            <td style="text-align: center;">[Kelas / NISN]</td>
            <td>[Cabang Kegiatan / Peserta]</td>
          </tr>
          <tr>
            <td style="text-align: center;">3</td>
            <td><strong>[Nama Lengkap Siswa 3]</strong></td>
            <td style="text-align: center;">[Kelas / NISN]</td>
            <td>[Cabang Kegiatan / Peserta]</td>
          </tr>
        </tbody>
      </table>
      <p>
        Kegiatan tersebut akan dilaksanakan pada hari <strong>[Hari, Tanggal]</strong> bertempat di <strong>[Lokasi Lomba / Kegiatan]</strong>. Kami mohon agar ketidakhadiran siswa bersangkutan selama jam pelajaran tidak diperhitungkan sebagai alpa.
      </p>
      <p>
        Demikian surat dispensasi ini kami sampaikan, atas izin dan kerja sama yang baik, kami ucapkan terima kasih.
      </p>
    `;
  } else if (kodeVal.startsWith("422.1")) {
    labelKode = "422.1 - PPDB dan MPLS";
    defaultPerihal = perihalInput || "Surat Tugas Panitia Pelaksana PPDB & MPLS Tahun Ajaran 2026/2027";
    defaultKepada = kepadaInput || "Bapak/Ibu Guru & Staf Tata Usaha Terlampir";
    showCenterTitle = true;
    centerTitleText = "SURAT TUGAS";
    bodyHtml = `
      <p class="no-indent">Yang bertanda tangan di bawah ini:</p>
      <p style="margin-left: 20px;">
        <strong>Nama</strong> : Syarif Hasanudin, S.Pd., Gr., M.M.<br>
        <strong>Jabatan</strong> : Kepala SMAS YWKA Bandung
      </p>
      <p>
        Dengan ini memberikan tugas kedinasan kepada Bapak/Ibu Guru dan Tenaga Kependidikan untuk bertindak sebagai <strong>Panitia Pelaksana Kegiatan PPDB & MPLS Tahun Ajaran 2026/2027</strong> yang bertugas mempersiapkan administrasi, sosialisasi, dan pembimbingan peserta didik baru.
      </p>
      <p>
        Surat tugas ini berlaku sejak tanggal ditetapkan sampai dengan berakhirnya seluruh rangkaian kegiatan PPDB & MPLS. Harap dilaksanakan dengan penuh dedikasi dan rasa tanggung jawab.
      </p>
      <p>
        Demikian surat tugas ini dibuat untuk dapat dipergunakan sebagaimana mestinya.
      </p>
    `;
  } else if (kodeVal.startsWith("422.3")) {
    labelKode = "422.3 - Pengumuman Hari Libur";
    defaultPerihal = perihalInput || "Pemberitahuan Hari Libur Nasional & Cuti Bersama";
    defaultKepada = kepadaInput || "Bapak/Ibu Orang Tua/Wali Murid & Guru SMAS YWKA Bandung";
    bodyHtml = `
      <p class="no-indent">Dengan hormat,</p>
      <p>
        Menindaklanjuti Surat Keputusan Bersama (SKB) tentang Hari Libur Nasional dan Cuti Bersama serta Kalender Pendidikan Tahun Ajaran 2025/2026, bersama ini Kepala SMAS YWKA Bandung menyampaikan informasi libur sekolah:
      </p>
      <p style="margin-left: 20px;">
        1. <strong>Mulai Libur</strong> : [Hari, Tanggal Dimulainya Libur]<br>
        2. <strong>Masuk Kembali KBM</strong> : [Hari, Tanggal Mulai Masuk Sekolah]<br>
        3. <strong>Agenda Saat Masuk</strong> : Kegiatan Belajar Mengajar (KBM) berjalan seperti biasa sesuai jadwal pelajaran.
      </p>
      <p>
        Selama masa libur, kami menghimbau kepada orang tua/wali murid agar senantiasa membimbing putra-putrinya untuk mengisi waktu dengan kegiatan yang positif serta menjaga kesehatan dan keselamatan.
      </p>
      <p>
        Demikian pemberitahuan ini kami sampaikan. Atas perhatian dan kerja sama yang baik, kami ucapkan terima kasih.
      </p>
    `;
  } else if (kodeVal.startsWith("422.5")) {
    labelKode = "422.5 - Beasiswa / Pelajar Teladan";
    defaultPerihal = perihalInput || "Surat Keterangan Rekomendasi Siswa Penerima Beasiswa";
    defaultKepada = kepadaInput || "Pimpinan Lembaga / Instansi Penyelenggara Beasiswa";
    showCenterTitle = true;
    centerTitleText = "SURAT KETERANGAN REKOMENDASI";
    bodyHtml = `
      <p class="no-indent">Yang bertanda tangan di bawah ini Kepala SMAS YWKA Bandung dengan ini menerangkan bahwa:</p>
      <p style="margin-left: 20px;">
        <strong>Nama Siswa</strong> : [Nama Lengkap Siswa]<br>
        <strong>NIS / NISN</strong> : [Nomor Induk Siswa / NISN]<br>
        <strong>Kelas</strong> : [Kelas Siswa]<br>
        <strong>Tempat, Tgl Lahir</strong> : [Tempat, Tanggal Lahir]<br>
        <strong>Nama Orang Tua</strong> : [Nama Ayah / Ibu]
      </p>
      <p>
        Adalah benar siswa aktif yang sedang menempuh pendidikan di SMAS YWKA Bandung Tahun Pelajaran 2025/2026, berkelakuan baik, serta memiliki rekam jejak prestasi akademik yang memuaskan.
      </p>
      <p>
        Surat keterangan ini diterbitkan sebagai rekomendasi permohonan <strong>Bantuan Beasiswa Pendidikan</strong>. Demikian surat keterangan ini kami buat dengan sebenarnya untuk dipergunakan sebagaimana mestinya.
      </p>
    `;
  } else if (kodeVal.startsWith("423.5")) {
    labelKode = "423.5 - Kegiatan Kurikulum";
    defaultPerihal = perihalInput || "Pemberitahuan Pelaksanaan Supervisi Akademik & Kurikulum Merdeka";
    defaultKepada = kepadaInput || "Bapak/Ibu Guru Mata Pelajaran SMAS YWKA Bandung";
    bodyHtml = `
      <p class="no-indent">Dengan hormat,</p>
      <p>
        Dalam rangka penjaminan mutu proses pembelajaran dan penguatan implementasi Kurikulum Merdeka di lingkungan SMAS YWKA Bandung, bersama ini disampaikan jadwal pelaksanaan kegiatan supervisi dan telaah modul ajar:
      </p>
      <p style="margin-left: 20px;">
        <strong>Waktu Pelaksanaan</strong> : [Rentang Tanggal Pelaksanaan]<br>
        <strong>Sasaran</strong> : Seluruh Guru Mata Pelajaran Kelas X, XI, dan XII<br>
        <strong>Dokumen Persiapan</strong> : Modul Ajar, Alur Tujuan Pembelajaran (ATP), dan Instrumen Asesmen
      </p>
      <p>
        Mohon Bapak/Ibu guru dapat mempersiapkan perangkat administrasi pembelajaran dengan sebaik-baiknya.
      </p>
      <p>
        Demikian surat ini kami sampaikan, atas kerja sama yang baik kami ucapkan terima kasih.
      </p>
    `;
  } else if (kodeVal.startsWith("423.7")) {
    labelKode = "423.7 - Ujian / Asesmen (PAT, PAS, UTS, PSAJ, ASTS)";
    defaultPerihal = perihalInput || "Surat Edaran Pelaksanaan Asesmen Sumatif Akhir Jenjang (PSAJ) / Ujian";
    defaultKepada = kepadaInput || "Orang Tua / Wali Siswa SMAS YWKA Bandung";
    bodyHtml = `
      <p class="no-indent">Dengan hormat,</p>
      <p>
        Berdasarkan program kerja Kurikulum SMAS YWKA Bandung Tahun Pelajaran 2025/2026, bersama ini kami memberitahukan kepada Bapak/Ibu Orang Tua/Wali Murid bahwa pelaksanaan <strong>Asesmen Sumatif / Ujian Sekolah</strong> akan diselenggarakan pada:
      </p>
      <p style="margin-left: 20px;">
        <strong>Hari / Tanggal</strong> : [Hari, Tanggal Dimulai] s/d [Hari, Tanggal Selesai]<br>
        <strong>Waktu</strong> : 07.30 WIB s/d Selesai<br>
        <strong>Metode Asesmen</strong> : Computer Based Test (CBT) & Paper Based<br>
        <strong>Syarat Peserta</strong> : Telah menyelesaikan administrasi kehadiran dan membawa kartu ujian.
      </p>
      <p>
        Kami mohon kerja sama Bapak/Ibu untuk senantiasa mendampingi putra-putrinya belajar di rumah agar dapat mengikuti ujian dengan lancar dan memperoleh hasil yang optimal.
      </p>
      <p>
        Demikian pemberitahuan ini kami sampaikan, atas perhatian dan kerja samanya kami ucapkan terima kasih.
      </p>
    `;
  } else if (kodeVal.startsWith("425.11") || kodeVal.startsWith("425.2") || kodeVal.startsWith("425.3")) {
    labelKode = `${kodeVal} - Sarana & Prasarana Sekolah`;
    defaultPerihal = perihalInput || "Permohonan Pengadaan / Pemeliharaan Sarana dan Prasarana Sekolah";
    defaultKepada = kepadaInput || "Pengurus Yayasan Wanita Kereta Api (YWKA) Bandung";
    bodyHtml = `
      <p class="no-indent">Dengan hormat,</p>
      <p>
        Sehubungan dengan program pemeliharaan berkala sarana dan prasarana penunjang kegiatan belajar mengajar di SMAS YWKA Bandung, bersama ini kami mengajukan permohonan pengadaan / pemeliharaan fasilitas sekolah sebagai berikut:
      </p>
      <table class="letter-table-formal">
        <thead>
          <tr>
            <th style="width: 35px; text-align: center;">No</th>
            <th>Uraian Sarana / Prasarana</th>
            <th style="width: 100px; text-align: center;">Volume / Unit</th>
            <th>Keperluan / Ruangan</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="text-align: center;">1</td>
            <td>[Uraian Sarana / Perlengkapan / Perbaikan 1]</td>
            <td style="text-align: center;">[... Unit / Pcs]</td>
            <td>[Ruang Kelas / Laboratorium / TU]</td>
          </tr>
          <tr>
            <td style="text-align: center;">2</td>
            <td>[Uraian Sarana / Perlengkapan / Perbaikan 2]</td>
            <td style="text-align: center;">[... Unit / Pcs]</td>
            <td>[Ruang Guru / Perpustakaan]</td>
          </tr>
        </tbody>
      </table>
      <p>
        Besar harapan kami kiranya permohonan ini dapat dipertimbangkan dan direalisasikan demi kenyamanan serta kelancaran operasional pendidikan di sekolah.
      </p>
      <p>
        Demikian permohonan ini kami sampaikan, atas perhatian dan dukungan dari Bapak/Ibu Pengurus Yayasan, kami ucapkan terima kasih.
      </p>
    `;
  } else {
    // 421.3 atau Kustom Umum
    labelKode = `${kodeVal} - Surat Dinas Umum`;
    defaultPerihal = perihalInput || "Undangan Rapat Dinas Koordinasi Pendidik & Tenaga Kependidikan";
    defaultKepada = kepadaInput || "Bapak/Ibu Pendidik dan Tenaga Kependidikan SMAS YWKA Bandung";
    bodyHtml = `
      <p class="no-indent">Dengan hormat,</p>
      <p>
        Sehubungan dengan koordinasi program kerja dan evaluasi pembelajaran di lingkungan SMAS YWKA Bandung, bersama ini Kepala Sekolah mengundang Bapak/Ibu untuk hadir pada rapat dinas yang akan dilaksanakan pada:
      </p>
      <p style="margin-left: 20px;">
        <strong>Hari / Tanggal</strong> : [Hari, Tanggal Pelaksanaan]<br>
        <strong>Waktu</strong> : 13.00 WIB s/d Selesai<br>
        <strong>Tempat</strong> : Ruang Rapat Guru SMAS YWKA Bandung<br>
        <strong>Agenda</strong> : Evaluasi Program Kerja & Koordinasi Layanan Akademik
      </p>
      <p>
        Mengingat pentingnya agenda musyawarah tersebut, kami mengharapkan kehadiran Bapak/Ibu tepat pada waktunya.
      </p>
      <p>
        Demikian undangan ini kami sampaikan, atas perhatian dan kerja sama yang baik kami ucapkan terima kasih.
      </p>
    `;
  }

  if (elBadge) elBadge.textContent = labelKode;
  if (elPerihal) elPerihal.textContent = defaultPerihal;
  if (elKepada) elKepada.textContent = defaultKepada;

  if (showCenterTitle && titleBox && titleCenter && titleNomor) {
    titleCenter.textContent = centerTitleText;
    titleNomor.textContent = `Nomor: ${fullNumber}`;
    titleBox.style.display = "block";
  } else if (titleBox) {
    titleBox.style.display = "none";
  }

  if (contentEl) {
    contentEl.innerHTML = bodyHtml;
  }

  modal.classList.add("show");
  showToast("📄 Format template dokumen kosong resmi berhasil disiapkan!", "info");
}

/**
 * Download Naskah Dinas sebagai File Microsoft Word (.doc)
 */
function downloadLetterAsWord(filename, elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const contentHtml = el.innerHTML;
  const fullHtml = `
    <!DOCTYPE html>
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset="utf-8">
      <title>${filename}</title>
      <style>
        @page { size: A4; margin: 2.5cm 2cm 2.5cm 2.5cm; }
        body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.4; color: #000; margin: 0; padding: 0; }
        .kop-surat-resmi { text-align: center; border-bottom: 3px double #000; padding-bottom: 8px; margin-bottom: 16px; }
        .kop-logo-img { display: none; }
        .kop-yayasan { font-size: 13pt; font-weight: bold; }
        .kop-sekolah { font-size: 17pt; font-weight: bold; }
        .kop-akreditasi { font-size: 11pt; font-weight: bold; }
        .kop-alamat, .kop-kontak { font-size: 9.5pt; }
        .kop-garis-ganda { border-top: 1px solid #000; border-bottom: 3px solid #000; height: 3px; margin: 6px 0 16px 0; }
        .letter-meta-row table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
        .letter-meta-row td { padding: 2px 4px; vertical-align: top; font-size: 12pt; }
        .letter-recipient-block { margin-bottom: 16px; font-size: 12pt; }
        .letter-title-center { text-align: center; margin: 16px 0; }
        .letter-title-center h3 { font-size: 14pt; text-decoration: underline; margin: 0; }
        .letter-title-number { font-size: 11pt; margin-top: 3px; }
        .letter-table-formal { width: 100%; border-collapse: collapse; margin: 12px 0; }
        .letter-table-formal th, .letter-table-formal td { border: 1px solid #000; padding: 6px 8px; font-size: 11pt; }
        .letter-signature-block { margin-top: 25px; float: right; width: 280px; text-align: left; }
        .letter-sig-space { height: 60px; }
      </style>
    </head>
    <body>
      ${contentHtml}
    </body>
    </html>
  `;
  const blob = new Blob(['\\ufeff' + fullHtml], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.doc') ? filename : filename + '.doc';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("⬇️ Berkas template dokumen Word (.doc) berhasil diunduh!", "success");
}

/**
 * Inisialisasi PWA Service Worker & Tombol Pasang di HP
 */
let deferredPwaPrompt = null;

function initPwaServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("./sw.js")
        .then((reg) => {
          console.log("PWA Service Worker terdaftar dengan scope:", reg.scope);
        })
        .catch((err) => {
          console.warn("Registrasi Service Worker dilewati:", err);
        });
    });
  }

  // Handle beforeinstallprompt (Android Chrome / Edge)
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPwaPrompt = e;

    // Tampilkan tombol install di sidebar & banner
    const btnSidebarPwa = document.getElementById("btnSidebarInstallPwa");
    if (btnSidebarPwa) btnSidebarPwa.style.display = "flex";

    const banner = document.getElementById("pwaInstallBanner");
    if (banner && !sessionStorage.getItem("pwa_banner_dismissed")) {
      banner.style.display = "block";
    }
  });

  const btnSidebarPwa = document.getElementById("btnSidebarInstallPwa");
  if (btnSidebarPwa) {
    btnSidebarPwa.addEventListener("click", () => {
      triggerPwaInstall();
    });
  }

  const btnBannerInstall = document.getElementById("btnPwaBannerInstall");
  if (btnBannerInstall) {
    btnBannerInstall.addEventListener("click", () => {
      triggerPwaInstall();
    });
  }

  const btnBannerDismiss = document.getElementById("btnPwaBannerDismiss");
  if (btnBannerDismiss) {
    btnBannerDismiss.addEventListener("click", () => {
      const banner = document.getElementById("pwaInstallBanner");
      if (banner) banner.style.display = "none";
      sessionStorage.setItem("pwa_banner_dismissed", "true");
    });
  }

  window.addEventListener("appinstalled", () => {
    console.log("PWA SIAS YWKA berhasil di-install!");
    showToast("🎉 Aplikasi SIAS YWKA berhasil dipasang di perangkat Anda!", "success");
    deferredPwaPrompt = null;
    const banner = document.getElementById("pwaInstallBanner");
    if (banner) banner.style.display = "none";
  });
}

function triggerPwaInstall() {
  if (deferredPwaPrompt) {
    deferredPwaPrompt.prompt();
    deferredPwaPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === "accepted") {
        showToast("Memasang aplikasi SIAS SMAS YWKA...", "info");
      }
      deferredPwaPrompt = null;
    });
  } else {
    // Petunjuk manual jika sudah terinstall atau browser belum fire event
    showToast("💡 Buka menu browser HP (titik tiga ⋮) lalu pilih 'Tambahkan ke Layar Utama' atau 'Install Aplikasi'.", "info");
  }
}
