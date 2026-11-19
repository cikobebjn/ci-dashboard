/* Master mesin CIL. Gedung 4/7 mengikuti master Packaging Reject; Flowpack 48/49 dari revisi CIL sebelumnya. */
window.CIL_MACHINE_MASTER = [
  {
    "building": "4",
    "line": "Line 7",
    "machine": "SW 39",
    "type": "SW"
  },
  {
    "building": "4",
    "line": "Line 7",
    "machine": "SW 40",
    "type": "SW"
  },
  {
    "building": "4",
    "line": "Line 7",
    "machine": "SW 41",
    "type": "SW"
  },
  {
    "building": "4",
    "line": "Line 7",
    "machine": "SW 42",
    "type": "SW"
  },
  {
    "building": "4",
    "line": "Line 7",
    "machine": "SW 43",
    "type": "SW"
  },
  {
    "building": "4",
    "line": "Line 7",
    "machine": "SW 44",
    "type": "SW"
  },
  {
    "building": "4",
    "line": "Line 7",
    "machine": "SW 45",
    "type": "SW"
  },
  {
    "building": "4",
    "line": "Line 7",
    "machine": "SW 46",
    "type": "SW"
  },
  {
    "building": "6",
    "line": "Line 1A",
    "machine": "CF 01",
    "type": "CF"
  },
  {
    "building": "6",
    "line": "Line 1A",
    "machine": "CF 02",
    "type": "CF"
  },
  {
    "building": "6",
    "line": "Line 1A",
    "machine": "CF 19",
    "type": "CF"
  },
  {
    "building": "6",
    "line": "Line 1A",
    "machine": "CF 20",
    "type": "CF"
  },
  {
    "building": "6",
    "line": "Line 2",
    "machine": "CF 04",
    "type": "CF"
  },
  {
    "building": "6",
    "line": "Line 2",
    "machine": "CF 12",
    "type": "CF"
  },
  {
    "building": "6",
    "line": "Line 2",
    "machine": "CF 08",
    "type": "CF"
  },
  {
    "building": "6",
    "line": "Line 2",
    "machine": "CF 17",
    "type": "CF"
  },
  {
    "building": "6",
    "line": "Line 2",
    "machine": "CF 05",
    "type": "CF"
  },
  {
    "building": "6",
    "line": "Line 2",
    "machine": "CF 06",
    "type": "CF"
  },
  {
    "building": "6",
    "line": "Line 2",
    "machine": "CF 13",
    "type": "CF"
  },
  {
    "building": "6",
    "line": "Line 2",
    "machine": "CF 15",
    "type": "CF"
  },
  {
    "building": "6",
    "line": "Line 2",
    "machine": "CF 14",
    "type": "CF"
  },
  {
    "building": "6",
    "line": "Line 2",
    "machine": "CF 16",
    "type": "CF"
  },
  {
    "building": "7",
    "line": "Line 4",
    "machine": "SW 32",
    "type": "SW"
  },
  {
    "building": "7",
    "line": "Line 4",
    "machine": "SW 33",
    "type": "SW"
  },
  {
    "building": "7",
    "line": "Line 4",
    "machine": "SW 34",
    "type": "SW"
  },
  {
    "building": "7",
    "line": "Line 4",
    "machine": "SW 35",
    "type": "SW"
  },
  {
    "building": "7",
    "line": "Line 4",
    "machine": "SW 36",
    "type": "SW"
  },
  {
    "building": "7",
    "line": "Line 4",
    "machine": "SW 37",
    "type": "SW"
  },
  {
    "building": "7",
    "line": "Line 5B",
    "machine": "SW 38",
    "type": "SW"
  },
  {
    "building": "7",
    "line": "Line 5",
    "machine": "Bostar 25",
    "type": "Bostar"
  },
  {
    "building": "7",
    "line": "Line 5",
    "machine": "Bostar 26",
    "type": "Bostar"
  },
  {
    "building": "7",
    "line": "Line 5",
    "machine": "Bostar 27",
    "type": "Bostar"
  },
  {
    "building": "7",
    "line": "Line 5",
    "machine": "Bostar 28",
    "type": "Bostar"
  },
  {
    "building": "7",
    "line": "Line 5",
    "machine": "Bostar 29",
    "type": "Bostar"
  },
  {
    "building": "7",
    "line": "Line 6",
    "machine": "Bostar 30",
    "type": "Bostar"
  },
  {
    "building": "7",
    "line": "Line 6",
    "machine": "Bostar 31",
    "type": "Bostar"
  },
  {
    "building": "7",
    "line": "Line 5",
    "machine": "Flowpack 48",
    "type": "Flowpack"
  },
  {
    "building": "7",
    "line": "Line 5",
    "machine": "Flowpack 49",
    "type": "Flowpack"
  }
];
window.CIL_MACHINES_FOR_BUILDING = function(building) {
  return window.CIL_MACHINE_MASTER.filter(x => x.building === String(building));
};
window.CIL_MACHINE_INFO = function(machine) {
  return window.CIL_MACHINE_MASTER.find(x => x.machine === String(machine)) || null;
};
if (window.CILT_CONFIG) {
  window.CILT_CONFIG.MACHINES = window.CIL_MACHINE_MASTER.filter(x=>x.building==='6').map(x=>x.machine);
}
if (window.CIL4_CONFIG) {
  window.CIL4_CONFIG.MACHINES = window.CIL_MACHINE_MASTER.filter(x=>x.building==='6').map(x=>x.machine);
}
