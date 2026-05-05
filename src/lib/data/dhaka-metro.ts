export interface DhakaMetroStation {
  id: string;
  name: string;
  aliases: string[];
  sequence: number;
  coordinates?: [number, number];
}

export const DHAKA_METRO_STATIONS: DhakaMetroStation[] = [
  {
    id: "metro-uttara-north",
    name: "Uttara North Metro Station",
    aliases: ["uttara north", "uttara north metro", "diabari"],
    sequence: 0,
    coordinates: [23.878304, 90.357625],
  },
  {
    id: "metro-uttara-center",
    name: "Uttara Center Metro Station",
    aliases: ["uttara center", "uttara centre"],
    sequence: 1,
    coordinates: [23.865963, 90.366214],
  },
  {
    id: "metro-uttara-south",
    name: "Uttara South Metro Station",
    aliases: ["uttara south"],
    sequence: 2,
    coordinates: [23.85371, 90.364284],
  },
  {
    id: "metro-pallabi",
    name: "Pallabi Metro Station",
    aliases: ["pallabi metro", "pallabi"],
    sequence: 3,
    coordinates: [23.825634, 90.364023],
  },
  {
    id: "metro-mirpur-11",
    name: "Mirpur 11 Metro Station",
    aliases: ["mirpur 11 metro", "mirpur 11"],
    sequence: 4,
    coordinates: [23.819043, 90.36517],
  },
  {
    id: "metro-mirpur-10",
    name: "Mirpur 10 Metro Station",
    aliases: ["mirpur 10 metro", "mirpur 10"],
    sequence: 5,
    coordinates: [23.80713, 90.368676],
  },
  {
    id: "metro-kazipara",
    name: "Kazipara Metro Station",
    aliases: ["kazipara metro", "kazipara"],
    sequence: 6,
    coordinates: [23.79915, 90.371973],
  },
  {
    id: "metro-shewrapara",
    name: "Shewrapara Metro Station",
    aliases: ["shewrapara metro", "shewrapara"],
    sequence: 7,
    coordinates: [23.79088, 90.37551],
  },
  {
    id: "metro-agargaon",
    name: "Agargaon Metro Station",
    aliases: ["agargaon metro", "agargaon"],
    sequence: 8,
    coordinates: [23.778478, 90.380046],
  },
  {
    id: "metro-bijoy-sarani",
    name: "Bijoy Sarani Metro Station",
    aliases: ["bijoy sarani metro", "bijoy sarani"],
    sequence: 9,
    coordinates: [23.764938, 90.383197],
  },
  {
    id: "metro-farmgate",
    name: "Farmgate Metro Station",
    aliases: ["farmgate metro", "farmgate", "farm gate metro"],
    sequence: 10,
    coordinates: [23.758939, 90.389118],
  },
  {
    id: "metro-kawran-bazar",
    name: "Kawran Bazar Metro Station",
    aliases: ["kawran bazar metro", "karwan bazar metro", "kawran bazar"],
    sequence: 11,
    coordinates: [23.75004, 90.393405],
  },
  {
    id: "metro-shahbag",
    name: "Shahbag Metro Station",
    aliases: ["shahbag metro", "shahbag", "shahbagh metro", "shahbagh"],
    sequence: 12,
    coordinates: [23.740164, 90.396026],
  },
  {
    id: "metro-dhaka-university",
    name: "Dhaka University Metro Station",
    aliases: ["dhaka university metro", "du metro", "dhaka university"],
    sequence: 13,
    coordinates: [23.734831, 90.395544],
  },
  {
    id: "metro-secretariat",
    name: "Bangladesh Secretariat Metro Station",
    aliases: ["secretariat metro", "bangladesh secretariat metro", "secretariat"],
    sequence: 14,
    coordinates: [23.730384, 90.415118],
  },
  {
    id: "metro-motijheel",
    name: "Motijheel Metro Station",
    aliases: ["motijheel metro", "motijheel"],
    sequence: 15,
    coordinates: [23.72774, 90.41943],
  },
];

const metroFareMatrixBdt = [
  [0, 20, 20, 30, 30, 40, 40, 50, 60, 60, 70, 80, 80, 90, 90, 100],
  [20, 0, 20, 20, 30, 30, 40, 40, 50, 60, 60, 70, 80, 80, 90, 90],
  [20, 20, 0, 20, 20, 30, 30, 40, 40, 50, 60, 60, 70, 70, 80, 90],
  [30, 20, 20, 0, 20, 20, 20, 30, 30, 40, 50, 50, 60, 60, 70, 80],
  [30, 30, 20, 20, 0, 20, 20, 20, 30, 40, 40, 50, 60, 60, 70, 70],
  [40, 30, 30, 20, 20, 0, 20, 20, 20, 30, 30, 40, 50, 50, 60, 60],
  [40, 40, 30, 20, 20, 20, 0, 20, 20, 20, 30, 40, 40, 50, 50, 60],
  [50, 40, 40, 30, 20, 20, 20, 0, 20, 20, 20, 30, 40, 40, 50, 50],
  [60, 50, 40, 30, 30, 20, 20, 20, 0, 20, 20, 20, 30, 30, 40, 50],
  [60, 60, 50, 40, 40, 30, 20, 20, 20, 0, 20, 20, 20, 30, 40, 40],
  [70, 60, 60, 50, 40, 30, 30, 20, 20, 20, 0, 20, 20, 20, 30, 30],
  [80, 70, 60, 50, 50, 40, 40, 30, 20, 20, 20, 0, 20, 20, 20, 30],
  [80, 80, 70, 60, 60, 50, 40, 40, 30, 20, 20, 20, 0, 20, 20, 20],
  [90, 80, 70, 60, 60, 50, 50, 40, 30, 30, 20, 20, 20, 0, 20, 20],
  [90, 90, 80, 70, 70, 60, 50, 50, 40, 40, 30, 20, 20, 20, 0, 20],
  [100, 90, 90, 80, 70, 60, 60, 50, 50, 40, 30, 30, 20, 20, 20, 0],
] as const satisfies readonly number[][];

export function getDhakaMetroFareBdtBySequence(
  originSequence: number,
  destinationSequence: number,
) {
  return metroFareMatrixBdt[originSequence]?.[destinationSequence] ?? null;
}
