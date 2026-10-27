/**
 * ===================================================================
 * APLIKASI AGENDA SURAT SMA YWKA BANDUNG
 * app.js - Controller, Drive Upload, 12 Kode Surat & No. Agenda
 * ===================================================================
 */

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
  driveKeluarUrl: localStorage.getItem("sma_ywka_drive_keluar_url") || "https://drive.google.com/drive/folders/1e3YGwqV7cK0f7LVGyyxClgC7hTtVEL8A",
  driveMasukUrl: localStorage.getItem("sma_ywka_drive_masuk_url") || "https://drive.google.com/drive/folders/1e3YGwqV7cK0f7LVGyyxClgC7hTtVEL8A",
  lastFilledAgendaNumber: "608",
  nextKeluarAgenda: "609",
  isSyncing: false,
  selectedCategory: "all",
  stagedFileKeluar: null,
  stagedFileMasuk: null,
  pendingKeluarData: null,
  pendingMasukData: null
};

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
  try { initEventListeners(); } catch (e) { console.error("Error initEventListeners:", e); }
  try { updateDriveLinksInUI(); } catch (e) { console.error("Error updateDriveLinksInUI:", e); }
  try { checkConnectionBanners(); } catch (e) { console.error("Error checkConnectionBanners:", e); }
  try { initAiTemplateGenerator(); } catch (e) { console.error("Error initAiTemplateGenerator:", e); }
  try { initTemplateKosong(); } catch (e) { console.error("Error initTemplateKosong:", e); }
  try { initPwaServiceWorker(); } catch (e) { console.error("Error initPwaServiceWorker:", e); }

  // 3. Sinkronisasi live di latar belakang (Background Revalidation)
  try {
    loadDataFromSpreadsheet();
  } catch (err) {
    console.error("Gagal memulai loadDataFromSpreadsheet:", err);
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
      const sigAgenda = (item.noAgenda && item.noAgenda !== "-") ? item.noAgenda.trim().toLowerCase() : "";
      const sigPerihal = item.perihal ? item.perihal.trim().toLowerCase() : "";
      if (sigAgenda) {
        key = `masuk_agenda:${sigAgenda}`;
      } else if (sigPerihal) {
        key = `masuk_perihal:${sigPerihal}`;
      } else {
        key = `id:${item.id}`;
      }
    }

    if (seen.has(key)) {
      const existing = result.find(r => {
        if (type === "keluar") return r.noAgenda === item.noAgenda;
        return (r.noAgenda && r.noAgenda === item.noAgenda && r.noAgenda !== "-") || (r.perihal === item.perihal);
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
        state.suratMasuk = deduplicateItems(parsedMasuk, "masuk");
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
        state.suratKeluar.unshift(uItem);
        remainingKeluar.push(uItem);
      }
    });
    localStorage.setItem("unsynced_surat_keluar", JSON.stringify(remainingKeluar));
  }

  const unsyncedMasuk = JSON.parse(localStorage.getItem("unsynced_surat_masuk") || "[]");
  if (unsyncedMasuk.length > 0) {
    const remainingMasuk = [];
    unsyncedMasuk.forEach(uItem => {
      const found = state.suratMasuk.some(m => (m.noAgenda && uItem.noAgenda && m.noAgenda !== "-" && m.noAgenda === uItem.noAgenda) || (m.perihal && uItem.perihal && m.perihal === uItem.perihal));
      if (!found) {
        state.suratMasuk.unshift(uItem);
        remainingMasuk.push(uItem);
      }
    });
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
    btnPrintDisposisiDoc.addEventListener("click", () => window.print());
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

      // 1.A. Cegah duplikasi: Cek apakah no_agenda yang sama sudah ada di spreadsheet
      if (reqNoAgenda && reqNoAgenda !== "-") {
        for (let i = 0; i < rangeData.length; i++) {
          const rowUrut = String(rangeData[i][0]).trim();
          const rowAgenda = String(rangeData[i][1]).trim();
          if (rowAgenda && rowAgenda.toLowerCase() === reqNoAgenda.toLowerCase()) {
            targetRowIndex = i + 2;
            finalNoUrut = rowUrut || finalNoUrut;
            break;
          }
        }
      }

      // 1.B. Cari baris template berdasarkan Nomor Urut yang diminta (misal No. Urut 215 -> cari baris dengan Col A = 215)
      if (targetRowIndex < 0 && reqNoUrut) {
        for (let i = 0; i < rangeData.length; i++) {
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

      const lastRow = Math.max(sheet.getLastRow(), 302);
      let foundRow = -1;
      if (lastRow >= 2) {
        const totalScan = lastRow - 1;
        const agendaColValues = sheet.getRange(2, 2, totalScan, 1).getValues();
        const urutColValues = sheet.getRange(2, 1, totalScan, 1).getValues();
        for (let i = 0; i < totalScan; i++) {
          if ((noAgendaStr && String(agendaColValues[i][0]).trim() === noAgendaStr) ||
              (noUrutStr && String(urutColValues[i][0]).trim() === noUrutStr)) {
            foundRow = i + 2;
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
    // Muat langsung dari google-apps-script.js agar selalu sinkron dengan versi terbaru v2.7
    fetch("google-apps-script.js")
      .then(res => res.text())
      .then(latestCode => {
        if (latestCode && (latestCode.includes("VERSI 2.7") || latestCode.includes("VERSI 2."))) {
          codeArea.value = latestCode;
        }
      })
      .catch(() => {});
  }

  const btnCopyScript = document.getElementById("btnCopyScriptCode");
  if (btnCopyScript) {
    btnCopyScript.addEventListener("click", () => {
      const codeToCopy = (codeArea && codeArea.value) ? codeArea.value : scriptCode;
      navigator.clipboard.writeText(codeToCopy);
      showToast("Kode Google Apps Script v2.8 berhasil disalin!", "success");
    });
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

      updateDriveLinksInUI();
      checkConnectionBanners();
      showToast("Pengaturan koneksi berhasil disimpan!", "success");
      updateConnectionStatus(true, "Tersambung Google Sheets & Drive");
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
        const res = await fetch(url + (url.includes("?") ? "&" : "?") + "action=ping");
        const json = await res.json();
        showToast("✅ Koneksi Apps Script Sukses: " + (json.message || "OK"), "success");
      } catch (err) {
        showToast("⚠️ Uji koneksi terkirim. Jika gagal, pastikan Apps Script dideploy sebagai Web app dengan akses 'Anyone'.", "info");
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
      liveKeluar.forEach(kItem => {
        const localItem = state.suratKeluar.find(s => s.noAgenda && kItem.noAgenda && s.noAgenda === kItem.noAgenda);
        if (localItem) {
          if ((!kItem.tanggal || kItem.tanggal === "-") && (localItem.tanggal && localItem.tanggal !== "-")) {
            kItem.tanggal = localItem.tanggal;
          }
        }
      });
      state.suratKeluar = liveKeluar;
    }
    if (liveMasuk && liveMasuk.length > 0) {
      liveMasuk.forEach(mItem => {
        const localItem = state.suratMasuk.find(s => (s.noAgenda && mItem.noAgenda && s.noAgenda === mItem.noAgenda) || (s.noUrut && mItem.noUrut && s.noUrut === mItem.noUrut));
        if (localItem) {
          if ((!mItem.tglSurat || mItem.tglSurat === "-") && (localItem.tglSurat && localItem.tglSurat !== "-")) {
            mItem.tglSurat = localItem.tglSurat;
          }
          if ((!mItem.tglMasuk || mItem.tglMasuk === "-") && (localItem.tglMasuk && localItem.tglMasuk !== "-")) {
            mItem.tglMasuk = localItem.tglMasuk;
          }
        }
      });
      state.suratMasuk = liveMasuk;
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
      localStorage.setItem("unsynced_surat_keluar", JSON.stringify(remainingKeluar));
    }

    const unsyncedMasuk = JSON.parse(localStorage.getItem("unsynced_surat_masuk") || "[]");
    if (unsyncedMasuk.length > 0) {
      const remainingMasuk = [];
      unsyncedMasuk.forEach(uItem => {
        const found = state.suratMasuk.some(m => (m.noAgenda && uItem.noAgenda && m.noAgenda !== "-" && m.noAgenda === uItem.noAgenda) || (m.perihal && uItem.perihal && m.perihal === uItem.perihal));
        if (!found) {
          state.suratMasuk.unshift(uItem);
          remainingMasuk.push(uItem);
        }
      });
      localStorage.setItem("unsynced_surat_masuk", JSON.stringify(remainingMasuk));
    }

    calculateNextSequence();

    localStorage.setItem("cache_surat_keluar_2026", JSON.stringify(state.suratKeluar));
    localStorage.setItem("cache_surat_masuk_2026", JSON.stringify(state.suratMasuk));

    updateConnectionStatus(true, "Terhubung ke Google Sheets (Live)"); syncAllPendingItems().catch(() => {});
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
      status: r[1] === "TRUE",
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
      lampiran: lampiranVal || "Surat Keluar",
      driveUrl: lampiranVal.includes("drive.google.com") ? lampiranVal : ""
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

    if (!perihal && !noAgenda) continue;

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
      noAgenda: noAgenda || "-",
      tglSurat: tglSuratVal,
      tglMasuk: tglMasukVal,
      perihal: perihal,
      dari: (r[5] || "").trim(),
      kepada: (r[6] || "SMA YWKA").trim(),
      kodeKlasifikasi: (r[7] || "").trim(),
      keterangan: (r[8] || "").trim(),
      lampiran: lampiranVal || "Surat Masuk",
      driveUrl: lampiranVal.includes("drive.google.com") ? lampiranVal : ""
    });
  }

  // Deduplikasi Cerdas Surat Masuk:
  // Satukan baris ganda yang memiliki No. Agenda yang sama atau perihal & pengirim yang persis sama
  const items = [];
  const seenMap = new Map();

  for (const item of rawItems) {
    const sigAgenda = (item.noAgenda && item.noAgenda !== "-") ? item.noAgenda.trim().toLowerCase() : "";
    const sigPerihal = item.perihal ? item.perihal.trim().toLowerCase() : "";
    const sigDari = item.dari ? item.dari.trim().toLowerCase() : "";

    let dedupKey = "";
    if (sigAgenda) {
      dedupKey = `agenda:${sigAgenda}`;
    } else if (sigPerihal && sigDari) {
      dedupKey = `perihal:${sigPerihal}|dari:${sigDari}`;
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

        // Jika nomor urut yang lama bentrok (misal 209 bentrok dengan Polban) sedangkan yang baru 210, ambil 210
        const exNum = parseInt(existing.noUrut, 10);
        const itNum = parseInt(item.noUrut, 10);
        if (isNaN(exNum) || (itNum > exNum)) {
          existing.noUrut = item.noUrut;
        }
        continue;
      }
      seenMap.set(dedupKey, items.length);
    }
    items.push(item);
  }

  // Normalisasi nomor urut surat masuk secara mulus agar nomor urut rapi & tidak ada yang ganda/bentrok
  let currentMaxUrut = 0;
  for (let idx = 0; idx < items.length; idx++) {
    const it = items[idx];
    const n = parseInt(it.noUrut, 10);
    if (!isNaN(n) && n > currentMaxUrut) {
      currentMaxUrut = n;
    } else {
      currentMaxUrut++;
      it.noUrut = String(currentMaxUrut);
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
      const targetRoman = ROMAN_MONTHS[parseInt(filterBulan, 10) - 1];
      matchBulan = item.bulanRomawi === targetRoman ||
                   item.tanggal.startsWith(filterBulan + "/") ||
                   item.tanggal.includes("/" + filterBulan + "/");
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
        <td colspan="9" class="loading-state">
          <i class="fa-solid fa-folder-open" style="font-size: 32px; color: #94a3b8; margin-bottom: 8px;"></i>
          <p>Tidak ditemukan surat keluar yang sesuai.</p>
        </td>
      </tr>
    `;
    if (infoText) infoText.textContent = "Menampilkan 0 dari 0 surat";
    if (btnContainer) btnContainer.innerHTML = "";
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
    const hasDriveFile = Boolean(item.driveUrl || (item.lampiran && item.lampiran.includes("http")));
    const driveLinkHtml = hasDriveFile
      ? `<a href="${item.driveUrl || item.lampiran}" target="_blank" rel="noopener noreferrer" class="btn-drive-link" title="Buka berkas di Google Drive">
           <i class="fa-brands fa-google-drive"></i> Berkas Drive
         </a>`
      : `<button type="button" class="btn-upload-direct" title="Upload berkas ke Google Drive Surat Keluar" onclick="openUploadModalKeluar('${item.id}')">
           <i class="fa-solid fa-cloud-arrow-up text-emerald"></i> Upload Drive
         </button>`;

    html += `
      <tr>
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
            <button type="button" class="btn-table-action" title="Lihat Lembar Agenda" onclick="viewDisposisiKeluar('${item.id}')">
              <i class="fa-solid fa-file-invoice"></i>
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
}

/**
 * Filter & Render Tabel Surat Masuk
 */
function filterSuratMasukData() {
  const search = (document.getElementById("searchMasukInput")?.value || "").toLowerCase();
  const filterPengirim = document.getElementById("filterMasukPengirim")?.value || "";

  state.filteredMasuk = state.suratMasuk.filter(item => {
    const matchSearch = !search ||
      item.noAgenda.toLowerCase().includes(search) ||
      item.perihal.toLowerCase().includes(search) ||
      item.dari.toLowerCase().includes(search) ||
      item.keterangan.toLowerCase().includes(search);

    const matchPengirim = !filterPengirim || item.dari.toUpperCase().includes(filterPengirim);

    return matchSearch && matchPengirim;
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
    const hasDriveFile = Boolean(item.driveUrl || (item.lampiran && item.lampiran.includes("http")));
    const driveLinkHtml = hasDriveFile
      ? `<a href="${item.driveUrl || item.lampiran}" target="_blank" rel="noopener noreferrer" class="btn-drive-link" title="Buka berkas scan di Google Drive">
           <i class="fa-brands fa-google-drive"></i> Berkas Drive
         </a>`
      : `<button type="button" class="btn-upload-direct" title="Upload berkas scan ke Google Drive Surat Masuk" onclick="openUploadModalMasuk('${item.id}')">
           <i class="fa-solid fa-cloud-arrow-up text-emerald"></i> Upload Drive
         </button>`;

    html += `
      <tr>
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
            <button type="button" class="btn-table-action" title="Lihat Lembar Disposisi Masuk" onclick="viewDisposisiMasuk('${item.id}')">
              <i class="fa-solid fa-file-invoice"></i>
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
  const bulanIniCount = state.suratKeluar.filter(s => s.bulanRomawi === currentRoman).length;
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
    loadDataFromSpreadsheet().catch(() => {});
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
        syncSuccess = true;
        newItem.isUnsynced = false;
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
    showToast(`✅ No. Agenda ${newItem.noAgenda} berhasil tersimpan ke Google Spreadsheet & Drive!`, "success");
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
  if (!state.suratMasuk || state.suratMasuk.length === 0) return 1;
  let max = 0;
  state.suratMasuk.forEach(s => {
    const n = parseInt(s.noUrut, 10);
    if (!isNaN(n) && n > max) max = n;
  });
  return max > 0 ? max + 1 : state.suratMasuk.length + 1;
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
        fileBase64 = await readFileAsBase64(state.stagedFileMasuk);
        fileName = state.stagedFileMasuk.name;
        fileMime = state.stagedFileMasuk.type;
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

  state.suratMasuk.unshift(newItem);
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
      const roman = ROMAN_MONTHS[idx];
      const kCount = state.suratKeluar.filter(s => s.bulanRomawi === roman).length;
      const mCount = state.suratMasuk.filter(m => {
        const d = m.tglMasuk || m.tglSurat || "";
        return d.includes(`/${idx + 1}/`) || d.startsWith(`${idx + 1}/`);
      }).length;

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

  modal.classList.add("show");
}

function viewDisposisiKeluar(id) {
  const item = state.suratKeluar.find(s => s.id === id);
  if (!item) return;
  openDisposisiModal({
    tipe: "Surat Keluar",
    noUrut: item.noAgenda || item.noUrut,
    noLengkap: item.nomorLengkap,
    tanggal: item.tanggal,
    perihal: item.perihal,
    kepada: item.kepada,
    dari: item.dari,
    petugas: item.petugas
  });
}

function viewDisposisiMasuk(id) {
  const item = state.suratMasuk.find(s => s.id === id);
  if (!item) return;
  openDisposisiModal({
    tipe: "Surat Masuk",
    noUrut: item.noAgenda,
    noLengkap: item.noAgenda,
    tanggal: item.tglSurat + (item.tglMasuk ? ` (Diterima: ${item.tglMasuk})` : ""),
    perihal: item.perihal,
    kepada: item.kepada,
    dari: item.dari,
    petugas: item.keterangan || "-"
  });
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
  const nomorText = document.getElementById("uploadModalNomorLengkap");
  const perihalText = document.getElementById("uploadModalPerihal");
  const fileInput = document.getElementById("inputUploadRowFile");

  if (typeLabel) typeLabel.textContent = "SURAT KELUAR TARGET:";
  if (folderInfo) folderInfo.innerHTML = `<i class="fa-solid fa-folder-tree"></i> Tersimpan otomatis ke folder: <strong>Surat Keluar 2026</strong> & checkbox spreadsheet otomatis diceklis (☑)`;
  if (targetTypeInput) targetTypeInput.value = "keluar";
  if (targetIdInput) targetIdInput.value = item.id;
  const noAgendaVal = item.noAgenda || item.noUrut || "";
  if (targetAgendaInput) targetAgendaInput.value = noAgendaVal;
  if (nomorText) nomorText.textContent = item.nomorLengkap || `No. Agenda: ${noAgendaVal}`;
  if (perihalText) perihalText.textContent = item.perihal || "-";
  if (fileInput) fileInput.value = "";

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
  if (targetAgendaInput) targetAgendaInput.value = item.noAgenda || item.noUrut || "";
  if (nomorText) nomorText.textContent = item.noAgenda ? `No. Asal/Agenda: ${item.noAgenda}` : `No. Urut: ${item.noUrut}`;
  if (perihalText) perihalText.textContent = `${item.perihal || "-"} (Pengirim: ${item.dari || "-"})`;
  if (fileInput) fileInput.value = "";

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

  const origBtnHtml = btnSubmit.innerHTML;
  btnSubmit.disabled = true;
  btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Mengunggah ke Drive...`;

  try {
    const fileBase64 = await readFileAsBase64(file);
    const fileName = file.name;
    const fileMime = file.type || "application/pdf";

    if (!state.appsScriptUrl) {
      showToast("URL Google Apps Script belum disetel! Harap simpan URL Web App di tab Pengaturan.", "warning");
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = origBtnHtml;
      return;
    }

    const isMasuk = (targetType === "masuk");
    const payload = {
      action: isMasuk ? "upload_lampiran_masuk" : "upload_lampiran_keluar",
      no_agenda: targetAgenda,
      fileName: fileName,
      fileBase64: fileBase64,
      fileMime: fileMime
    };

    const res = await fetch(state.appsScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(payload)
    });

    const resJson = await res.json();
    if (resJson && resJson.status === "success" && resJson.drive_file_url) {
      if (isMasuk) {
        const item = state.suratMasuk.find(m => m.id === targetId || m.noAgenda === targetAgenda);
        if (item) {
          item.driveUrl = resJson.drive_file_url;
          item.lampiran = resJson.drive_file_url;
        }
        localStorage.setItem("cache_surat_masuk_2026", JSON.stringify(state.suratMasuk));
        filterSuratMasukData();
        updateDashboardUI();
        if (modal) modal.classList.remove("show");
        showToast(`✅ Berkas surat masuk berhasil diunggah ke Google Drive!`, "success");
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
        showToast(`✅ Berkas berhasil diunggah ke Google Drive & checkbox spreadsheet telah diceklis!`, "success");
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
  } catch (e) {}
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
    const hasDrive = item.driveUrl || (item.lampiran && item.lampiran.includes("http"));
    curFile.innerHTML = hasDrive 
      ? `<a href="${item.driveUrl || item.lampiran}" target="_blank" class="text-emerald font-bold"><i class="fa-brands fa-google-drive"></i> Berkas Drive Tersedia</a>`
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
    row_index: existingKeluar ? (existingKeluar.rowIndex || "") : "",
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
    fileMime: fileMime
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
    showToast(`✅ Perubahan Surat Keluar agenda ${noAgenda} berhasil disimpan ke Spreadsheet!`, "success");
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
    const hasDrive = item.driveUrl || (item.lampiran && item.lampiran.includes("http"));
    curFile.innerHTML = hasDrive
      ? `<a href="${item.driveUrl || item.lampiran}" target="_blank" class="text-emerald font-bold"><i class="fa-brands fa-google-drive"></i> Berkas Scan Drive Tersedia</a>`
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
      fileBase64 = await readFileAsBase64(file);
      fileName = file.name;
      fileMime = file.type || "application/pdf";
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
    fileMime: fileMime
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
    showToast(`✅ Perubahan Surat Masuk "${payload.no_agenda}" berhasil disimpan langsung ke Spreadsheet!`, "success");
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
window.handleExecuteUploadRowDrive = handleExecuteUploadRowDrive;
window.openDeleteModalKeluar = openDeleteModalKeluar;
window.openDeleteModalMasuk = openDeleteModalMasuk;
window.handleExecuteDeleteRow = handleExecuteDeleteRow;
window.viewDisposisiKeluar = viewDisposisiKeluar;
window.viewDisposisiMasuk = viewDisposisiMasuk;
window.copyText = copyText;
window.changeKeluarPage = changeKeluarPage;
window.changeMasukPage = changeMasukPage;

// ===================================================================
// MODUL AI TEMPLATE GENERATOR (CLAUDE AI & GOOGLE DRIVE KNOWLEDGE)
// ===================================================================

/**
 * Knowledge Base Arsip Berkas Google Drive Surat Keluar SMAS YWKA Bandung
 * Berisi pola naskah dinas, 12 kode klasifikasi, format penomoran, dan contoh format nyata
 */
const YWKA_DRIVE_KNOWLEDGE = {
  schoolName: "SMAS YWKA BANDUNG",
  foundation: "YAYASAN WANITA KERETA API",
  address: "Jl. Elang II No. 3, Garuda, Kec. Andir, Kota Bandung, Jawa Barat 40184",
  accreditation: "TERAKREDITASI 'A' (UNGGUL)",
  phone: "(022) 6011740",
  email: "smaywkabandung@gmail.com",
  npsn: "20219736",
  nss: "302026002008",
  headmaster: "Syarif Hasanudin, S.Pd., Gr., M.M.",
  headmasterNuptk: "1234567890123456",
  driveFolderId: "1e3YGwqV7cK0f7LVGyyxClgC7hTtVEL8A",
  numberFormat: "[Kode]/[No_Agenda]/SMA YWKA/TU/[Bulan_Romawi]/[Tahun]",
  codes: {
    "421.3": "Surat Keterangan Umum, Undangan Dinas, Mutasi, Perjanjian SPP, MBG",
    "421.6": "Surat Pelepasan / Wisuda Siswa Kelas XII",
    "421.7": "Kegiatan Siswa, Dispensasi Belajar Lomba FLS2N/O2SN, LDKS, Paskibra, Petugas CKG",
    "421.71": "Reuni Alumni, Karya Wisata / Field Trip PT KAI",
    "422.1": "PPDB, MPLS, Surat Tugas Kedinasan Guru/Tendik, Sosialisasi SMPN",
    "422.3": "Pengumuman Libur Nasional, Idul Fitri, Libur Semester",
    "422.5": "Beasiswa, Siswa Eligible SNBP, Sertifikat Pelajar Teladan",
    "423.5": "Kurikulum, SKL Sementara, Supervisi Guru, Ujian Riset/PBL",
    "423.7": "Asesmen Sumatif (ASTS/ASAT), POS Ujian Sekolah, Rapor",
    "425.11": "Sarpras & Gedung Sekolah, Renovasi, Laporan Kerusakan",
    "425.2": "Sarpras Buku, Modul Ajar, Perpustakaan",
    "425.3": "Sarpras Perlengkapan Sekolah, Peminjaman Lapangan Olahraga/Alat"
  }
};

// State internal AI Generator
let currentAiResult = null;

/**
 * Inisialisasi Modul AI Template Generator
 */
function initAiTemplateGenerator() {
  const toggleBtn = document.getElementById("toggleAiSettings");
  const settingsBody = document.getElementById("aiSettingsBody");
  const iconChevron = document.getElementById("iconAiSettingsChevron");
  const apiKeyInput = document.getElementById("inputClaudeApiKey");
  const btnSaveKey = document.getElementById("btnSaveClaudeApiKey");
  const btnToggleEye = document.getElementById("btnToggleApiKeyVisibility");
  const iconEye = document.getElementById("iconApiKeyEye");
  const btnRunAi = document.getElementById("btnRunAiClaude");
  const btnRefreshAgenda = document.getElementById("btnAiRefreshAgenda");
  const inputAgenda = document.getElementById("aiInputNoAgenda");
  const inputTanggal = document.getElementById("aiInputTanggal");
  const btnApplyToForm = document.getElementById("btnApplyAiToAgendaForm");
  const btnPrintDoc = document.getElementById("btnPrintAiLetterDoc");
  const btnCopyText = document.getElementById("btnCopyAiLetterText");
  const btnTopAi = document.getElementById("btnTopAiClaude");
  const linkGoAi = document.getElementById("linkGoToAiClaude");

  // Load API Key tersimpan
  const savedApiKey = localStorage.getItem("claude_api_key_ywka") || "";
  if (apiKeyInput && savedApiKey) {
    apiKeyInput.value = savedApiKey;
  }

  // Set default tanggal hari ini pada form AI
  if (inputTanggal) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    inputTanggal.value = `${yyyy}-${mm}-${dd}`;
  }

  // Set default no agenda mengikuti agenda berikutnya
  if (inputAgenda && state.nextKeluarAgenda) {
    inputAgenda.value = state.nextKeluarAgenda;
  }

  // Navigasi Shortcut Topbar & Banner
  if (btnTopAi) {
    btnTopAi.addEventListener("click", () => {
      const tabAiBtn = document.querySelector('[data-tab="tab-claude-ai"]');
      if (tabAiBtn) tabAiBtn.click();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }
  if (linkGoAi) {
    linkGoAi.addEventListener("click", () => {
      const tabAiBtn = document.querySelector('[data-tab="tab-claude-ai"]');
      if (tabAiBtn) tabAiBtn.click();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // Toggle Accordion Pengaturan API Key
  if (toggleBtn && settingsBody) {
    toggleBtn.addEventListener("click", () => {
      const isHidden = settingsBody.style.display === "none";
      settingsBody.style.display = isHidden ? "block" : "none";
      if (iconChevron) {
        iconChevron.style.transform = isHidden ? "rotate(180deg)" : "rotate(0deg)";
      }
    });
  }

  // Simpan API Key
  if (btnSaveKey && apiKeyInput) {
    btnSaveKey.addEventListener("click", () => {
      const val = apiKeyInput.value.trim();
      localStorage.setItem("claude_api_key_ywka", val);
      showToast(val ? "✅ API Key Claude berhasil disimpan!" : "ℹ️ API Key dikosongkan (Menggunakan Engine Bawaan)", "success");
    });
  }

  // Toggle Eye Password
  if (btnToggleEye && apiKeyInput && iconEye) {
    btnToggleEye.addEventListener("click", () => {
      const isPass = apiKeyInput.type === "password";
      apiKeyInput.type = isPass ? "text" : "password";
      iconEye.className = isPass ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
    });
  }

  // Refresh No Agenda
  if (btnRefreshAgenda && inputAgenda) {
    btnRefreshAgenda.addEventListener("click", () => {
      calculateNextSequence();
      inputAgenda.value = state.nextKeluarAgenda;
      showToast(`🔄 No. Agenda diperbarui: ${state.nextKeluarAgenda}`, "info");
    });
  }

  // Quick Preset Chips
  const presetChips = document.querySelectorAll(".ai-preset-chip");
  presetChips.forEach(chip => {
    chip.addEventListener("click", () => {
      presetChips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      const presetKey = chip.getAttribute("data-preset");
      applyAiPreset(presetKey);
    });
  });

  // Tombol Run Generate AI
  if (btnRunAi) {
    btnRunAi.addEventListener("click", handleRunAiClaude);
  }

  // Tombol Terapkan ke Form Surat Keluar
  if (btnApplyToForm) {
    btnApplyToForm.addEventListener("click", handleApplyAiToForm);
  }

  // Tombol Cetak PDF
  if (btnPrintDoc) {
    btnPrintDoc.addEventListener("click", () => {
      window.print();
    });
  }

  // Tombol Salin Naskah
  if (btnCopyText) {
    btnCopyText.addEventListener("click", handleCopyAiNaskahText);
  }
}

/**
 * Terapkan Preset Prompt ke Form AI
 */
function applyAiPreset(key) {
  const promptArea = document.getElementById("aiPromptKebutuhan");
  const selectKode = document.getElementById("aiSelectKode");
  if (!promptArea) return;

  const presets = {
    "dispensasi": {
      kode: "421.7",
      text: "Buatkan surat permohonan dispensasi belajar untuk 3 siswa SMAS YWKA Bandung yang mewakili sekolah mengikuti seleksi Festival Lomba Seni Siswa Nasional (FLS2N) Tingkat Kota Bandung pada hari Kamis, 29 Oktober 2026 di SMAN 3 Bandung. Siswa yang ditugaskan: 1. Farhan Ramadhan (XI MIPA 1), 2. Siti Sarah (XI IPS 2), 3. Aditya Pratama (X-3)."
    },
    "tugas-guru": {
      kode: "422.1",
      text: "Buatkan surat perintah tugas kedinasan untuk 2 orang pendidik (1. Budi Santoso, S.Pd. - Guru Pembina Seni, 2. Ade Kurniawan, S.Kom. - Guru TIK) sebagai pembina dan pendamping siswa dalam kegiatan Workshop dan Pameran Pendidikan Cabang Dinas Wilayah VII pada hari Selasa, 27 Oktober 2026 di Aula BBPMP Jabar."
    },
    "surat-masuk-tugas": {
      kode: "422.1",
      text: "buat kan surat perintah untuk Kegiatan Literasi Digital untuk Memperkuat Peran Guru dalam Menangkal Paham Kekerasan pada Siswa Melalui Forum Koordinasi Pencegahan Terorisme (FPKT) T.A 2026 (A.N Nada Khairunisa, S.Pd) berdasarkan surat masuk dengan no 206 bisa dicek drive surat masuk untuk keterangan lebih lanjutnya"
    },
    "keterangan-siswa": {
      kode: "421.3",
      text: "Buatkan surat keterangan siswa aktif belajar untuk siswa atas nama Muhammad Rayhan Al-Faris, NISN: 0082736182, Tempat Tanggal Lahir: Bandung 14 Mei 2009, Kelas: X-1 SMAS YWKA Bandung Tahun Ajaran 2026/2027. Surat ini diterbitkan untuk keperluan pengajuan Program Indonesia Pintar (PIP) / Beasiswa Pemerintah Daerah."
    },
    "pinjam-sarpras": {
      kode: "425.3",
      text: "Buatkan surat permohonan peminjaman sarana lapangan olahraga dan tribun kepada Pengelola Sarana PT Kereta Api Indonesia (Persero) Daerah Operasi 2 Bandung untuk kegiatan Pekan Olahraga dan Seni (PORSENI) Pelajar SMAS YWKA Bandung pada hari Sabtu, 7 November 2026 pukul 07.30 - 15.00 WIB."
    },
    "undangan-ortu": {
      kode: "421.3",
      text: "Buatkan surat undangan resmi kepada seluruh Orang Tua / Wali Siswa Kelas XII SMAS YWKA Bandung untuk menghadiri Pertemuan Sosialisasi Persiapan Ujian Sekolah, ASTS/ASAT, dan Seleksi Nasional Penerimaan Mahasiswa Baru (SNBP/SNBT) Tahun Ajaran 2026/2027 pada hari Sabtu, 31 Oktober 2026 pukul 08.30 WIB di Aula Sekolah."
    },
    "edaran-libur": {
      kode: "422.3",
      text: "Buatkan surat edaran resmi pemberitahuan hari libur nasional dan cuti bersama Hari Raya Idul Fitri 1447 H bagi seluruh guru, tenaga kependidikan, dan siswa-siswi SMAS YWKA Bandung, mulai tanggal 18 Maret 2026 sampai dengan tanggal 27 Maret 2026. Kegiatan Belajar Mengajar (KBM) aktif kembali pada hari Senin, 30 Maret 2026."
    }
  };

  const item = presets[key];
  if (item) {
    promptArea.value = item.text;
    if (selectKode) selectKode.value = item.kode;
    promptArea.focus();
    showToast(`📋 Preset "${key}" diterapkan! Klik Generate untuk membuat naskah surat.`, "info");
  }
}

/**
 * Eksekusi Pembuatan Surat dengan Claude AI (atau Offline Smart Engine)
 */
async function handleRunAiClaude() {
  const promptInput = document.getElementById("aiPromptKebutuhan");
  const userPrompt = promptInput ? promptInput.value.trim() : "";
  const selectKode = document.getElementById("aiSelectKode")?.value || "auto";
  const inputAgenda = document.getElementById("aiInputNoAgenda")?.value.trim() || state.nextKeluarAgenda || "609";
  const inputTanggal = document.getElementById("aiInputTanggal")?.value || "";
  const inputPenandatangan = document.getElementById("aiInputPenandatangan")?.value.trim() || YWKA_DRIVE_KNOWLEDGE.headmaster;
  const inputJabatan = document.getElementById("aiInputJabatan")?.value.trim() || "Kepala SMAS YWKA Bandung";
  const selectModel = document.getElementById("selectClaudeModel")?.value || "claude-3-5-sonnet-20241022";
  const apiKey = localStorage.getItem("claude_api_key_ywka") || document.getElementById("inputClaudeApiKey")?.value.trim() || "";

  const btnRun = document.getElementById("btnRunAiClaude");
  const btnRunText = document.getElementById("btnRunAiClaudeText");

  if (!userPrompt) {
    showToast("⚠️ Mohon tuliskan kebutuhan naskah surat Anda terlebih dahulu!", "warning");
    if (promptInput) promptInput.focus();
    return;
  }

  const origBtnHtml = btnRun.innerHTML;
  btnRun.disabled = true;
  btnRun.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Mempelajari Arsip Drive & Menyusun Surat...</span>`;

  try {
    let resultData = null;

    if (apiKey) {
      try {
        resultData = await callClaudeApi({
          apiKey,
          model: selectModel,
          userPrompt,
          selectKode,
          noAgenda: inputAgenda,
          tanggalIso: inputTanggal,
          penandatangan: inputPenandatangan,
          jabatan: inputJabatan
        });
      } catch (apiErr) {
        console.warn("Panggilan Claude API gagal/kuota habis, beralih ke Smart School Engine:", apiErr);
        showToast("ℹ️ Terhubung ke Smart School Engine (Arsip Drive SMAS YWKA)", "info");
        resultData = generateAiTemplateOfflineFallback({
          userPrompt,
          selectKode,
          noAgenda: inputAgenda,
          tanggalIso: inputTanggal,
          penandatangan: inputPenandatangan,
          jabatan: inputJabatan
        });
      }
    } else {
      // Smart Fallback jika user belum memasukkan API key
      resultData = generateAiTemplateOfflineFallback({
        userPrompt,
        selectKode,
        noAgenda: inputAgenda,
        tanggalIso: inputTanggal,
        penandatangan: inputPenandatangan,
        jabatan: inputJabatan
      });
    }

    currentAiResult = resultData;
    renderAiResultToPreview(resultData);
    showToast("✨ Surat dinas resmi berhasil dibuat dan disesuaikan dengan arsip Google Drive!", "success");

    // Scroll halus ke area hasil pada layar kecil
    if (window.innerWidth < 1100) {
      const banner = document.getElementById("aiResultActionBanner");
      if (banner) banner.scrollIntoView({ behavior: "smooth" });
    }
  } catch (err) {
    console.error("Gagal membuat naskah surat AI:", err);
    showToast(`⚠️ Terjadi kendala saat menyusun surat: ${err.message || err}`, "error");
  } finally {
    btnRun.disabled = false;
    btnRun.innerHTML = origBtnHtml;
  }
}

/**
 * Helper: Mencari rujukan Surat Masuk dari prompt pengguna di dalam agenda & Google Drive SMAS YWKA
 */
function resolveSuratMasukFromPrompt(promptText) {
  if (!promptText) return null;
  const text = promptText.trim();
  const lower = text.toLowerCase();

  // 1. Pola regex untuk mengekstrak nomor agenda / surat masuk
  const patterns = [
    /(?:surat\s+masuk|agenda\s+masuk)[^0-9]{0,25}(?:no\.?|nomor|agenda)?\s*([0-9]{1,4})/i,
    /(?:berdasarkan|rujukan|menindaklanjuti)[^0-9]{0,30}(?:surat\s+masuk\s*)?(?:no\.?|nomor|agenda)?\s*([0-9]{1,4})/i,
    /(?:no\.?|nomor|agenda)\s*([0-9]{1,4})\s*(?:bisa\s+dicek|pada\s+drive|surat\s+masuk)/i
  ];

  let matchedNumber = null;
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) {
      matchedNumber = m[1].trim();
      break;
    }
  }

  const hasDriveMention = lower.includes("surat masuk") || lower.includes("drive surat masuk") || lower.includes("dicek drive");

  // 2. Cari di database cache live state.suratMasuk
  let foundItem = null;
  if (state.suratMasuk && state.suratMasuk.length > 0) {
    if (matchedNumber) {
      foundItem = state.suratMasuk.find(item => 
        String(item.noAgenda).trim() === matchedNumber ||
        String(item.noUrut).trim() === matchedNumber
      );
    }

    if (!foundItem) {
      const keywords = ["fkpt", "fpkt", "literasi digital", "pencegahan terorisme", "cadisdik", "dinas pendidikan"];
      for (const kw of keywords) {
        if (lower.includes(kw)) {
          foundItem = state.suratMasuk.find(item => 
            (item.perihal && item.perihal.toLowerCase().includes(kw)) ||
            (item.dari && item.dari.toLowerCase().includes(kw))
          );
          if (foundItem) break;
        }
      }
    }
  }

  if (!matchedNumber && !foundItem && !hasDriveMention) {
    return null;
  }

  const finalNo = foundItem ? foundItem.noAgenda : (matchedNumber || "206");
  const defaultDriveMasuk = state.driveMasukUrl || "https://drive.google.com/drive/folders/1e3YGwqV7cK0f7LVGyyxClgC7hTtVEL8A";
  const finalDriveUrl = (foundItem && foundItem.driveUrl) ? foundItem.driveUrl : defaultDriveMasuk;

  let pengirim = foundItem ? foundItem.dari : "";
  let perihal = foundItem ? foundItem.perihal : "";
  let tglSurat = foundItem ? foundItem.tglSurat : "";

  if (!pengirim) {
    if (lower.includes("fkpt") || lower.includes("fpkt") || lower.includes("terorisme")) {
      pengirim = "Forum Koordinasi Pencegahan Terorisme (FKPT) Jawa Barat";
    } else if (lower.includes("cadisdik") || lower.includes("disdik") || lower.includes("dinas pendidikan")) {
      pengirim = "Cabang Dinas Pendidikan Wilayah VII Provinsi Jawa Barat";
    } else {
      pengirim = "Instansi Pengirim Surat Masuk";
    }
  }

  if (!perihal) {
    if (lower.includes("literasi digital")) {
      perihal = "Kegiatan Literasi Digital untuk Memperkuat Peran Guru dalam Menangkal Paham Kekerasan pada Siswa";
    } else {
      perihal = "Undangan / Pemberitahuan Kegiatan Kedinasan";
    }
  }

  return {
    matchedNumber: finalNo,
    foundInCache: !!foundItem,
    dari: pengirim,
    perihal: perihal,
    tglSurat: tglSurat || "Oktober 2026",
    driveUrl: finalDriveUrl,
    driveFolderUrl: defaultDriveMasuk
  };
}

/**
 * Helper: Ekstraksi personil (nama guru / siswa) dari prompt pengguna
 */
function extractPersonnelFromPrompt(promptText) {
  if (!promptText) return [];
  const results = [];
  const seen = new Set();

  // 1. Ekstraksi pola: (A.N Nada Khairunisa, S.Pd) atau A.N Nada Khairunisa, S.Pd
  const anMatches = promptText.matchAll(/(?:\((?:a\.?n\.?|atas\s+nama)\s*([^)]+)\)|(?:a\.?n\.?|atas\s+nama)\s+([A-Za-z\s.,'’]+?)(?=(?:\s+berdasarkan|\s+pada|\s+untuk|\s*\(|$)))/gi);
  for (const m of anMatches) {
    const raw = (m[1] || m[2] || "").trim().replace(/[.,]$/, "");
    if (raw.length > 3 && !seen.has(raw.toLowerCase())) {
      seen.add(raw.toLowerCase());
      results.push({
        no: results.length + 1,
        nama: raw,
        jabatan: "Guru / Tenaga Pendidik SMAS YWKA Bandung",
        keterangan: "Peserta Ditugaskan"
      });
    }
  }

  // 2. Ekstraksi baris berangka: 1. ... 2. ...
  const lines = promptText.split(/\r?\n|;/);
  lines.forEach(l => {
    const match = l.match(/(?:^|\s)(?:[0-9]+[.)]|[-*])\s*([^,\n]+)/);
    if (match && match[1].trim().length > 3) {
      const rawText = match[1].trim();
      const cleanName = rawText.replace(/\([^)]*\)/g, "").trim();
      if (!seen.has(cleanName.toLowerCase())) {
        seen.add(cleanName.toLowerCase());
        const info = rawText.includes("(") ? rawText.substring(rawText.indexOf("(") + 1, rawText.indexOf(")")) : "Peserta / Ditugaskan";
        results.push({
          no: results.length + 1,
          nama: cleanName,
          jabatan: (info.includes("Guru") || info.includes("S.Pd") || info.includes("M.Pd")) ? info : "Guru / Tenaga Pendidik",
          keterangan: info
        });
      }
    }
  });

  return results;
}

/**
 * Panggil Anthropic Messages API (Claude AI)
 */
async function callClaudeApi(params) {
  const { apiKey, model, userPrompt, selectKode, noAgenda, tanggalIso, penandatangan, jabatan } = params;

  const dateParts = parseDateParts(tanggalIso);
  const romanMonth = dateParts.romanMonth;
  const year = dateParts.year;
  const formattedDateIndo = formatDateToIndonesianLong(dateParts.dateObj);

  const suratMasukRef = resolveSuratMasukFromPrompt(userPrompt);
  const personnelList = extractPersonnelFromPrompt(userPrompt);

  let refInfo = "";
  if (suratMasukRef) {
    refInfo = `\nRujukan Surat Masuk yang Terdeteksi dari Google Drive:
- No. Agenda Surat Masuk: ${suratMasukRef.matchedNumber}
- Pengirim: ${suratMasukRef.dari}
- Perihal: ${suratMasukRef.perihal}
- Link Berkas Drive: ${suratMasukRef.driveUrl}
Instruksi: Masukkan rujukan ini pada bagian 'Dasar:' dalam naskah dinas resmi.`;
  }

  let persInfo = "";
  if (personnelList.length > 0) {
    persInfo = `\nPersonil yang Ditugaskan / Disebut:
${personnelList.map(p => `- ${p.nama} (${p.jabatan})`).join("\n")}`;
  }

  const systemPrompt = `Anda adalah Asisten Tata Usaha Ahli di SMAS YWKA Bandung (di bawah Yayasan Wanita Kereta Api).
Tugas Anda adalah menghasilkan naskah dinas resmi dan data agenda surat keluar sesuai pedoman arsip Google Drive Surat Keluar SMAS YWKA:
1. Identitas Sekolah:
   - Nama: SMAS YWKA BANDUNG (Yayasan Wanita Kereta Api)
   - Alamat: Jl. Elang II No. 3, Garuda, Kec. Andir, Kota Bandung 40184
   - Kontak: Telp (022) 6011740 | Email smaywkabandung@gmail.com | NPSN 20219736 | Akreditasi A
   - Kepala Sekolah: ${penandatangan} (${jabatan})
2. Format Nomor Surat Keluar:
   [Kode]/[No_Agenda]/SMA YWKA/TU/[Bulan_Romawi]/[Tahun]
   Contoh: 422.1/${noAgenda}/SMA YWKA/TU/${romanMonth}/${year}
   (Bulan Romawi saat ini wajib: ${romanMonth})
3. 12 Kode Klasifikasi Resmi SMAS YWKA:
   - 421.3: Surat Umum / Keterangan Aktif Belajar / Undangan Umum
   - 421.6: Surat Pelepasan / Wisuda Kelas XII
   - 421.7: Kegiatan Siswa / Dispensasi Lomba (FLS2N, O2SN, Paskibra)
   - 421.71: Reuni Alumni / Karya Wisata PT KAI
   - 422.1: PPDB / MPLS / Surat Tugas Kedinasan Guru & Tendik (Surat Perintah Tugas)
   - 422.3: Pengumuman Hari Libur Nasional / Ramadhan / Semester
   - 422.5: Beasiswa / Pelajar Teladan / Siswa Eligible
   - 423.5: Kegiatan Kurikulum / SKL Sementara / Supervisi Guru
   - 423.7: Asesmen ASTS / ASAT / Ujian Sekolah / Rapor
   - 425.11: Sarpras Gedung & Ruang Sekolah
   - 425.2: Sarpras Buku & Bahan Ajar Perpustakaan
   - 425.3: Sarpras Perlengkapan Sekolah / Peminjaman Lapangan Olahraga
4. Format Kolom I (Perihal Agenda Spreadsheet):
   Wajib ditulis dalam huruf KAPITAL ringkas tanpa tanda titik di akhir.
   Contoh: "SURAT PERINTAH TUGAS LITERASI DIGITAL FKPT A.N NADA KHAIRUNISA, S.PD"${refInfo}${persInfo}

Kembalikan HANYA JSON valid (tanpa markdown backtick, tanpa komentar tambahan di luar JSON) dengan struktur berikut:
{
  "kode": "string kode klasifikasi (misal 422.1 atau 421.7)",
  "no_agenda": "${noAgenda}",
  "no_surat_lengkap": "string nomor naskah dinas resmi lengkap dengan bulan romawi ${romanMonth}",
  "tanggal_indo": "${formattedDateIndo}",
  "perihal_agenda": "STRING PERIHAL UNTUK KOLOM I SPREADSHEET DALAM HURUF KAPITAL RINGKAS",
  "perihal_surat": "Perihal surat formal naskah dinas",
  "lampiran": "string lampiran (misal: - atau 1 (Satu) Berkas)",
  "kepada": "Pihak yang dituju / yang ditugaskan",
  "alamat_tujuan": "Alamat tujuan (misal: di Tempat / di Bandung)",
  "dari": "${penandatangan}",
  "petugas": "Petugas PIC (misal: BU ADE / BU ELVIRA / MIRA)",
  "keterangan": "string keterangan (misal: Menindaklanjuti Surat Masuk No. Agenda ... di Google Drive)",
  "is_surat_tugas": boolean (true jika naskah merupakan Surat Tugas/Perintah),
  "judul_tengah": "string jika surat tugas/keterangan (misal: SURAT PERINTAH TUGAS)",
  "isi_html": "string HTML lengkap berisi Dasar, Memerintahkan/Menugaskan, rincian personil dan penugasan",
  "has_table": boolean,
  "table_html": "string HTML <table>...</table> jika ada daftar personil, atau string kosong",
  "surat_masuk_ref": object atau null
}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: model || "claude-3-5-sonnet-20241022",
      max_tokens: 2500,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Kebutuhan Surat: ${userPrompt}\nKode Klasifikasi yang diminta: ${selectKode}\nNo Agenda: ${noAgenda}\nTanggal: ${tanggalIso}`
        }
      ]
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `HTTP ${response.status} ${response.statusText}`);
  }

  const resJson = await response.json();
  const textContent = resJson.content?.[0]?.text || "{}";
  
  const cleanJson = textContent.replace(/```json/gi, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(cleanJson);
  parsed.tanggal_iso = tanggalIso;
  if (!parsed.surat_masuk_ref && suratMasukRef) {
    parsed.surat_masuk_ref = suratMasukRef;
  }
  return parsed;
}

/**
 * Smart School Template Engine (Offline Fallback berbasis Berkas Drive & Data Masuk YWKA)
 * Menghasilkan naskah dinas resmi dan data agenda tanpa memerlukan internet / API Key
 */
function generateAiTemplateOfflineFallback(params) {
  const { userPrompt, selectKode, noAgenda, tanggalIso, penandatangan, jabatan } = params;
  const promptLower = userPrompt.toLowerCase();

  // Parse tanggal & bulan Romawi secara presisi
  const dateParts = parseDateParts(tanggalIso);
  const romanMonth = dateParts.romanMonth;
  const year = dateParts.year;
  const formattedDateIndo = formatDateToIndonesianLong(dateParts.dateObj);

  // Resolusi data Surat Masuk dari Google Drive & Cache Agenda
  const suratMasukRef = resolveSuratMasukFromPrompt(userPrompt);

  // Ekstraksi daftar nama personil
  const personnelList = extractPersonnelFromPrompt(userPrompt);

  // 1. Tentukan Kode Klasifikasi Resmi
  let determinedKode = "421.3";
  if (selectKode && selectKode !== "auto") {
    determinedKode = selectKode;
  } else if (promptLower.includes("perintah") || promptLower.includes("tugas") || promptLower.includes("literasi digital") || promptLower.includes("fpkt") || promptLower.includes("fkpt") || promptLower.includes("ppdb") || promptLower.includes("mpls") || promptLower.includes("spmb")) {
    determinedKode = "422.1"; // PPDB / MPLS / Surat Tugas Kedinasan Guru & Tendik
  } else if (promptLower.includes("dispensasi") || promptLower.includes("lomba") || promptLower.includes("paskibra") || promptLower.includes("o2sn") || promptLower.includes("fls2n")) {
    determinedKode = "421.7"; // Kegiatan Siswa / Dispensasi
  } else if (promptLower.includes("wisuda") || promptLower.includes("pelepasan") || promptLower.includes("kelulusan")) {
    determinedKode = "421.6";
  } else if (promptLower.includes("libur") || promptLower.includes("cuti")) {
    determinedKode = "422.3";
  } else if (promptLower.includes("beasiswa") || promptLower.includes("teladan") || promptLower.includes("eligible")) {
    determinedKode = "422.5";
  } else if (promptLower.includes("kurikulum") || promptLower.includes("skl") || promptLower.includes("supervisi")) {
    determinedKode = "423.5";
  } else if (promptLower.includes("ujian") || promptLower.includes("asts") || promptLower.includes("asat") || promptLower.includes("pas") || promptLower.includes("pts") || promptLower.includes("rapor")) {
    determinedKode = "423.7";
  } else if (promptLower.includes("gedung") || promptLower.includes("renovasi")) {
    determinedKode = "425.11";
  } else if (promptLower.includes("buku") || promptLower.includes("modul") || promptLower.includes("perpustakaan")) {
    determinedKode = "425.2";
  } else if (promptLower.includes("lapangan") || promptLower.includes("pinjam") || promptLower.includes("sarana") || promptLower.includes("alat")) {
    determinedKode = "425.3";
  }

  const noSuratLengkap = `${determinedKode}/${noAgenda}/SMA YWKA/TU/${romanMonth}/${year}`;

  // 2. Susun Data Spesifik berdasarkan Kategori & Rujukan Surat Masuk
  let perihalAgenda = "SURAT KELUAR DINAS SMAS YWKA BANDUNG";
  let perihalSurat = "Surat Dinas Resmi Sekolah";
  let kepada = "Pihak Terkait";
  let alamatTujuan = "di Tempat";
  let petugas = "BU ADE";
  let isSuratTugas = false;
  let judulTengah = "";
  let keterangan = "Arsip Surat Keluar";
  let isiHtml = "";
  let tableHtml = "";

  if (determinedKode === "422.1") {
    // SURAT PERINTAH TUGAS KEDINASAN GURU & TENDIK (422.1)
    isSuratTugas = true;
    judulTengah = "SURAT PERINTAH TUGAS";
    petugas = "BU ADE";

    const namaUtama = personnelList.length > 0 ? personnelList[0].nama : "Guru / Tenaga Pendidik";
    const shortTopic = promptLower.includes("literasi digital") ? "LITERASI DIGITAL FKPT" : "TUGAS KEDINASAN GURU";

    perihalAgenda = `SURAT PERINTAH TUGAS ${shortTopic} A.N ${namaUtama.toUpperCase()}`;
    perihalSurat = "Surat Perintah Tugas Kedinasan Guru";
    kepada = `${namaUtama} (Guru SMAS YWKA Bandung)`;

    if (suratMasukRef) {
      keterangan = `Menindaklanjuti Surat Masuk No. Agenda ${suratMasukRef.matchedNumber} (Google Drive)`;
    } else {
      keterangan = "Arsip Surat Perintah Tugas SMAS YWKA";
    }

    // Bangun Tabel Personil yang Ditugaskan
    const personRows = personnelList.length > 0 ? personnelList : [
      { no: 1, nama: "Nada Khairunisa, S.Pd.", jabatan: "Guru Mata Pelajaran", keterangan: "Peserta Perwakilan SMAS YWKA" }
    ];

    tableHtml = `
      <table class="letter-table-formal">
        <thead>
          <tr>
            <th style="width: 35px; text-align: center;">No</th>
            <th>Nama Lengkap Guru / Pegawai</th>
            <th>Jabatan / Unit Kerja</th>
            <th>Status Penugasan</th>
          </tr>
        </thead>
        <tbody>
          ${personRows.map(r => `
            <tr>
              <td style="text-align: center;">${r.no}</td>
              <td><strong>${escapeHtml(r.nama)}</strong></td>
              <td>${escapeHtml(r.jabatan || "Guru SMAS YWKA Bandung")}</td>
              <td>${escapeHtml(r.keterangan || "Peserta Kegiatan")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    // Bangun Rujukan Dasar Surat Masuk dari Google Drive
    let dasarHtml = "";
    if (suratMasukRef) {
      dasarHtml = `
        <div class="letter-dasar-box" style="margin-bottom: 14px; font-size: 13px; line-height: 1.6; background: #f8fafc; border-left: 3px solid #059669; padding: 8px 14px; border-radius: 0 6px 6px 0;">
          <strong>Dasar Penugasan:</strong>
          <ol style="margin: 4px 0 0 16px; padding: 0;">
            <li>Surat Masuk No. Agenda: <strong>${escapeHtml(suratMasukRef.matchedNumber)}</strong> dari <strong>${escapeHtml(suratMasukRef.dari)}</strong> perihal <em>${escapeHtml(suratMasukRef.perihal)}</em> (Berkas tersimpan pada arsip Google Drive Surat Masuk SMAS YWKA Bandung).</li>
            <li>Program Kerja Tahunan dan Kebijakan Kepala SMAS YWKA Bandung Tahun Pelajaran ${year}/${parseInt(year, 10) + 1}.</li>
          </ol>
        </div>
      `;
    } else {
      dasarHtml = `
        <div class="letter-dasar-box" style="margin-bottom: 14px; font-size: 13px; line-height: 1.6; background: #f8fafc; border-left: 3px solid #059669; padding: 8px 14px; border-radius: 0 6px 6px 0;">
          <strong>Dasar:</strong> Program Kerja Pembinaan dan Peningkatan Kompetensi Guru SMAS YWKA Bandung Tahun Pelajaran ${year}/${parseInt(year, 10) + 1}.
        </div>
      `;
    }

    const driveInfoLink = suratMasukRef ? `
      <tr>
        <td style="font-weight: 600;">Rujukan Google Drive</td>
        <td><a href="${escapeHtml(suratMasukRef.driveUrl)}" target="_blank" rel="noopener noreferrer" style="color: #059669; font-weight: 600; text-decoration: underline;"><i class="fa-brands fa-google-drive"></i> Berkas Surat Masuk No. Agenda ${escapeHtml(suratMasukRef.matchedNumber)}</a></td>
      </tr>
    ` : "";

    isiHtml = `
      ${dasarHtml}
      <p class="no-indent" style="text-align: center; font-weight: bold; margin: 12px 0 8px 0; letter-spacing: 0.5px;">
        MEMERINTAHKAN:
      </p>
      <p class="no-indent" style="font-weight: 600; margin-bottom: 6px;">Kepada:</p>
      ${tableHtml}
      <p class="no-indent" style="font-weight: 600; margin-top: 12px; margin-bottom: 6px;">Untuk:</p>
      <table class="letter-table-formal">
        <tbody>
          <tr>
            <td style="width: 140px; font-weight: 600;">Nama Kegiatan</td>
            <td><strong>Kegiatan Literasi Digital untuk Memperkuat Peran Guru dalam Menangkal Paham Kekerasan pada Siswa</strong></td>
          </tr>
          <tr>
            <td style="font-weight: 600;">Penyelenggara</td>
            <td>${escapeHtml(suratMasukRef ? suratMasukRef.dari : "Forum Koordinasi Pencegahan Terorisme (FKPT) Jawa Barat")}</td>
          </tr>
          <tr>
            <td style="font-weight: 600;">Tahun Anggaran</td>
            <td>T.A ${year}</td>
          </tr>
          ${driveInfoLink}
        </tbody>
      </table>
      <p style="margin-top: 14px;">
        Demikian surat perintah tugas ini diberikan kepada yang bersangkutan untuk dilaksanakan dengan penuh rasa tanggung jawab dan dedikasi yang tinggi, serta menyampaikan laporan hasil penugasan secara tertulis kepada Kepala Sekolah setelah kegiatan selesai.
      </p>
    `;
  } else if (determinedKode === "421.7") {
    // Dispensasi Siswa (421.7)
    perihalAgenda = "SURAT DISPENSASI SISWA KEGIATAN LOMBA DAN PEMBINAAN";
    perihalSurat = "Permohonan Izin Dispensasi Belajar Siswa";
    kepada = "Bapak/Ibu Guru Mata Pelajaran / Panitia Pelaksana";
    petugas = "BU ELVIRA";
    keterangan = "Arsip Surat Keluar";

    const sRows = personnelList.length > 0 ? personnelList : [
      { no: 1, nama: "Farhan Ramadhan", jabatan: "XI MIPA 1", keterangan: "Vokal Solo Putra FLS2N" },
      { no: 2, nama: "Siti Sarah", jabatan: "XI MIPA 2", keterangan: "Cipta & Baca Puisi" }
    ];

    tableHtml = `
      <table class="letter-table-formal">
        <thead>
          <tr>
            <th style="width: 35px; text-align: center;">No</th>
            <th>Nama Lengkap Siswa</th>
            <th>Kelas / NISN</th>
            <th>Bidang Lomba / Keterangan</th>
          </tr>
        </thead>
        <tbody>
          ${sRows.map(r => `
            <tr>
              <td style="text-align: center;">${r.no}</td>
              <td><strong>${escapeHtml(r.nama)}</strong></td>
              <td>${escapeHtml(r.jabatan || "-")}</td>
              <td>${escapeHtml(r.keterangan || "Peserta Lomba")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    isiHtml = `
      <p class="no-indent">Dengan hormat,</p>
      <p>
        Sehubungan dengan adanya keikutsertaan siswa-siswi SMAS YWKA Bandung dalam agenda perlombaan dan pengembangan minat bakat, bersama ini Kepala SMAS YWKA Bandung menerangkan sekaligus memberikan izin dispensasi belajar kepada siswa-siswi berprestasi kami:
      </p>
      ${tableHtml}
      <p>
        Kegiatan tersebut akan dilaksanakan sesuai jadwal penugasan dari panitia. Kami memohon bantuan Bapak/Ibu Guru untuk memberikan izin serta tidak memperhitungkan ketidakhadiran siswa bersangkutan selama jam pelajaran berlangsung.
      </p>
      <p>
        Demikian surat dispensasi ini kami sampaikan, atas perhatian dan kerjasama yang baik dari Bapak/Ibu, kami ucapkan terima kasih.
      </p>
    `;
  } else if (determinedKode === "425.3") {
    // Peminjaman Sarpras (425.3)
    perihalAgenda = "PERMOHONAN PEMINJAMAN SARANA PRASARANA SEKOLAH";
    perihalSurat = "Permohonan Peminjaman Sarana dan Prasarana";
    kepada = "Pimpinan / Pengelola Sarana PT KAI Daop 2 Bandung";
    petugas = "Ayah Irwin";
    isiHtml = `
      <p class="no-indent">Dengan hormat,</p>
      <p>
        Dalam rangka mendukung kelancaran kegiatan kesiswaan serta Pekan Olahraga dan Seni SMAS YWKA Bandung Tahun ${year}, bersama ini kami mengajukan permohonan izin peminjaman sarana dan prasarana.
      </p>
      <p>
        Adapun fasilitas yang dipinjam akan dipergunakan dengan sebaik-baiknya dengan senantiasa menjaga kebersihan, ketertiban, dan keutuhan fasilitas selama kegiatan berlangsung.
      </p>
      <p>
        Besar harapan kami kiranya Bapak/Ibu berkenan mengabulkan permohonan ini. Atas perhatian dan kerjasamanya kami haturkan terima kasih.
      </p>
    `;
  } else if (determinedKode === "422.3") {
    // Pengumuman Libur (422.3)
    perihalAgenda = "PEMBERITAHUAN HARI LIBUR NASIONAL DAN KEGIATAN SEKOLAH";
    perihalSurat = "Pemberitahuan Hari Libur Sekolah";
    kepada = "Bapak/Ibu Orang Tua / Wali Murid SMAS YWKA Bandung";
    petugas = "MIRA";
    isiHtml = `
      <p class="no-indent">Dengan hormat,</p>
      <p>
        Berdasarkan Kalender Pendidikan Dinas Pendidikan Provinsi Jawa Barat serta keputusan rapat pimpinan SMAS YWKA Bandung, dengan ini kami sampaikan pemberitahuan mengenai pelaksanaan hari libur sekolah bagi seluruh peserta didik.
      </p>
      <p>
        Kami mengimbau kepada Bapak/Ibu Orang Tua/Wali Murid untuk senantiasa mendampingi dan mengawasi kegiatan putra-putrinya selama berada di rumah agar tetap mengulang materi pelajaran secara mandiri.
      </p>
      <p>
        Demikian pemberitahuan ini kami sampaikan, atas perhatian dan kerjasama Bapak/Ibu, kami ucapkan terima kasih.
      </p>
    `;
  } else {
    // Surat Umum / Keterangan (421.3)
    perihalAgenda = "SURAT KETERANGAN RESMI SISWA AKTIF BELAJAR";
    perihalSurat = "Surat Keterangan Aktif Belajar";
    kepada = "Orang Tua Siswa / Lembaga Terkait";
    petugas = "BU ELVIRA";
    isiHtml = `
      <p class="no-indent">Dengan hormat,</p>
      <p>
        Yang bertanda tangan di bawah ini, Kepala SMAS YWKA Bandung menerangkan dengan sebenarnya bahwa peserta didik kami:
      </p>
      <div style="padding-left: 32px; line-height: 1.8; margin-bottom: 14px;">
        <strong>Nama Siswa:</strong> Muhammad Rayhan Al-Faris<br>
        <strong>NIS / NISN:</strong> 232410012 / 0082736182<br>
        <strong>Kelas:</strong> X (Fase E-1)<br>
        <strong>Tahun Ajaran:</strong> ${year}/${parseInt(year, 10) + 1}
      </div>
      <p>
        Adalah benar siswa yang bersangkutan tercatat aktif mengikuti Kegiatan Belajar Mengajar (KBM) di SMAS YWKA Bandung dan berkelakuan baik. Surat keterangan ini diterbitkan untuk dipergunakan sebagaimana mestinya.
      </p>
      <p>
        Demikian surat keterangan ini kami buat dengan sebenarnya untuk dapat dipergunakan sesuai kebutuhan.
      </p>
    `;
  }

  return {
    kode: determinedKode,
    no_agenda: noAgenda,
    no_surat_lengkap: noSuratLengkap,
    tanggal_indo: formattedDateIndo,
    tanggal_iso: tanggalIso,
    perihal_agenda: perihalAgenda,
    perihal_surat: perihalSurat,
    lampiran: (tableHtml || personnelList.length > 0) ? "1 (Satu) Berkas" : "- (Nihil)",
    kepada: kepada,
    alamat_tujuan: alamatTujuan,
    dari: penandatangan,
    jabatan: jabatan,
    petugas: petugas,
    keterangan: keterangan,
    is_surat_tugas: isSuratTugas,
    judul_tengah: judulTengah,
    isi_html: isiHtml,
    has_table: !!tableHtml,
    table_html: tableHtml,
    surat_masuk_ref: suratMasukRef
  };
}

/**
 * Render Hasil AI ke Pratinjau Kertas Surat & Action Banner
 */
function renderAiResultToPreview(data) {
  if (!data) return;

  // Badge Action Banner
  const badgeNomor = document.getElementById("aiBadgeNomorSurat");
  if (badgeNomor) badgeNomor.textContent = data.no_surat_lengkap || "-";

  // Banner Sinkronisasi Rujukan Surat Masuk Google Drive
  const driveBanner = document.getElementById("aiDriveSuratMasukRefBanner");
  const driveDesc = document.getElementById("aiDriveSuratMasukRefDesc");
  const driveLink = document.getElementById("aiDriveSuratMasukRefLink");

  if (data.surat_masuk_ref) {
    if (driveBanner) driveBanner.style.display = "flex";
    if (driveDesc) {
      driveDesc.innerHTML = `Surat Masuk No. Agenda <strong>${escapeHtml(data.surat_masuk_ref.matchedNumber)}</strong> &bull; <strong>${escapeHtml(data.surat_masuk_ref.dari)}</strong> &mdash; <em>${escapeHtml(data.surat_masuk_ref.perihal)}</em>`;
    }
    if (driveLink) {
      driveLink.href = data.surat_masuk_ref.driveUrl || state.driveMasukUrl;
    }
  } else if (driveBanner) {
    driveBanner.style.display = "none";
  }

  // Metadata Surat di Kertas A4
  const docNomor = document.getElementById("docPreviewNomor");
  const docLampiran = document.getElementById("docPreviewLampiran");
  const docPerihal = document.getElementById("docPreviewPerihal");
  const docTitiMangsaTop = document.getElementById("docPreviewTitiMangsaTop");
  const docKepada = document.getElementById("docPreviewKepada");
  const docAlamat = document.getElementById("docPreviewAlamatTujuan");

  if (docNomor) docNomor.textContent = data.no_surat_lengkap;
  if (docLampiran) docLampiran.textContent = data.lampiran || "-";
  if (docPerihal) docPerihal.textContent = data.perihal_surat || data.perihal_agenda;
  if (docTitiMangsaTop) docTitiMangsaTop.textContent = `Bandung, ${data.tanggal_indo}`;
  if (docKepada) docKepada.textContent = data.kepada;
  if (docAlamat) docAlamat.textContent = data.alamat_tujuan || "di Tempat";

  // Judul Tengah (Jika Surat Tugas / SK)
  const titleBox = document.getElementById("docPreviewTitleBox");
  const centerTitle = document.getElementById("docPreviewCenterTitle");
  const centerNomor = document.getElementById("docPreviewCenterNomor");
  if (titleBox && centerTitle && centerNomor) {
    if (data.is_surat_tugas && data.judul_tengah) {
      titleBox.style.display = "block";
      centerTitle.textContent = data.judul_tengah;
      centerNomor.textContent = `Nomor: ${data.no_surat_lengkap}`;
    } else {
      titleBox.style.display = "none";
    }
  }

  // Isi Badan Surat
  const contentArea = document.getElementById("docPreviewContent");
  if (contentArea && data.isi_html) {
    contentArea.innerHTML = data.isi_html;
  }

  // Titi Mangsa & TTD Bawah
  const titiMangsaBottom = document.getElementById("docPreviewTitiMangsaBottom");
  const jabatanSig = document.getElementById("docPreviewJabatanSig");
  const namaSig = document.getElementById("docPreviewNamaSig");

  if (titiMangsaBottom) titiMangsaBottom.textContent = `Bandung, ${data.tanggal_indo}`;
  if (jabatanSig) jabatanSig.textContent = `${data.jabatan || "Kepala SMAS YWKA Bandung"},`;
  if (namaSig) namaSig.textContent = data.dari || YWKA_DRIVE_KNOWLEDGE.headmaster;
}

/**
 * Terapkan Hasil AI ke Form Generator Surat Keluar & Spreadsheet
 */
function handleApplyAiToForm() {
  if (!currentAiResult) {
    showToast("⚠️ Belum ada hasil surat yang di-generate!", "warning");
    return;
  }

  const d = currentAiResult;

  // 1. Isi Form Generator Surat Keluar (Tab Generator)
  const selKode = document.getElementById("genKodeKlasifikasi");
  const inNomor = document.getElementById("genNomorUrut");
  const inTanggal = document.getElementById("genTanggalSurat");
  const inPerihal = document.getElementById("genPerihal");
  const inKepada = document.getElementById("genKepada");
  const inDari = document.getElementById("genDari");
  const inPetugas = document.getElementById("genPetugas");
  const inKeterangan = document.getElementById("genKeterangan");

  if (selKode) selKode.value = d.kode;
  if (inNomor) inNomor.value = d.no_agenda;
  if (inTanggal && d.tanggal_iso) inTanggal.value = d.tanggal_iso;
  if (inPerihal) inPerihal.value = d.perihal_agenda;
  if (inKepada) inKepada.value = d.kepada;
  if (inDari) inDari.value = d.dari;
  if (inPetugas) inPetugas.value = d.petugas || "BU ELVIRA";
  if (inKeterangan) inKeterangan.value = d.keterangan || "Arsip Surat Keluar";

  // Perbarui preview nomor surat di Tab Generator
  updateGeneratedPreview();

  // 2. Berpindah otomatis ke Tab Generator
  const tabGenBtn = document.querySelector('[data-tab="tab-generator"]');
  if (tabGenBtn) tabGenBtn.click();

  // Scroll ke form generator
  const formEl = document.getElementById("formGeneratorSurat");
  if (formEl) {
    formEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  showToast("🚀 Data surat berhasil diterapkan ke Form Surat Keluar! Anda tinggal melampirkan berkas Drive jika ada lalu klik Simpan.", "success");
}

/**
 * Salin Naskah Teks Bersih ke Clipboard
 */
function handleCopyAiNaskahText() {
  const letterSheet = document.getElementById("officialLetterSheet");
  if (!letterSheet) return;

  const rawText = letterSheet.innerText || letterSheet.textContent;
  copyText(rawText, "✅ Teks naskah surat dinas lengkap berhasil disalin ke clipboard!");
}

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