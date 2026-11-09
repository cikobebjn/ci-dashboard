/*
  Jika SUPABASE_URL dan SUPABASE_ANON_KEY kosong, aplikasi berjalan secara lokal
  (satu browser/perangkat). Setelah SQL dipasang, isi keduanya agar sinkron online.
  Gunakan hanya anon / publishable key, JANGAN service_role key.
*/
window.CILT_CONFIG = {
  SUPABASE_URL: 'https://bmnhtxalfsfaefacgtpm.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_VItBKenz-q2sYz7MsibODA_nYtLXv9Q',
  TABLE: 'cilt_hourly_checks',
  BUILDING: '6',
  TIMEZONE: 'Asia/Jakarta',
  MACHINES: ['CF 01','CF 02','CF 04','CF 05','CF 06','CF 08','CF 12','CF 13','CF 14','CF 15','CF 16','CF 17','CF 19','CF 20']
};
