/* CIL 4 Jam - menggunakan Project URL dan publishable key yang sama dengan CIL 1 Jam.
   File ../cilt-1jam/cilt-config.js dimuat sebelum file ini. Tidak perlu isi key lagi.
   Struktur database dan penyimpanan lokal dipisahkan dari CIL 1 Jam.
*/
(function(){
  'use strict';
  const shared = window.CILT_CONFIG || {};
  window.CILT_CONFIG = {
    ...shared,
    SUPABASE_URL: String(shared.SUPABASE_URL || '').trim(),
    SUPABASE_ANON_KEY: String(shared.SUPABASE_ANON_KEY || '').trim(),
    TABLE: 'cil_4hour_checks',
    BUILDING: '6',
    TIMEZONE: 'Asia/Jakarta',
    MACHINES: [
      'CF 01','CF 02','CF 04','CF 05','CF 06','CF 08','CF 12',
      'CF 13','CF 14','CF 15','CF 16','CF 17','CF 19','CF 20'
    ]
  };
})();
