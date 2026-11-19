/* Digunakan hanya jika file catalog CIL 4 Jam aktif belum mendefinisikan task.
   SOP pengoperasian SW/Bostar tetap perlu diverifikasi sebelum form digunakan. */
window.CIL4_TASKS = (Array.isArray(window.CIL4_TASKS) ? window.CIL4_TASKS : null)
  || (Array.isArray(window.CIL4_CATALOG) ? window.CIL4_CATALOG : null)
  || (Array.isArray(window.CIL4_CATALOG?.tasks) ? window.CIL4_CATALOG.tasks : null)
  || [
  {id:1,type:'Cleaning',equipment:'Forming',part:'Forming',instructions:'Ikuti instruksi kerja CIL 4 Jam yang telah disahkan untuk mesin terpilih.',tools:'Sesuai SOP',runStop:'Stop',durationMin:10},
  {id:2,type:'Cleaning',equipment:'Sensor Eyemark',part:'Sensor Eyemark',instructions:'Ikuti instruksi kerja CIL 4 Jam yang telah disahkan untuk mesin terpilih.',tools:'Sesuai SOP',runStop:'Stop',durationMin:3},
  {id:3,type:'Inspection',equipment:'Sensor Eyemark',part:'Sensor Eyemark',instructions:'Ikuti instruksi kerja CIL 4 Jam yang telah disahkan untuk mesin terpilih.',tools:'Sesuai SOP',runStop:'Stop',durationMin:2}
];
