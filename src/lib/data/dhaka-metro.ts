export interface DhakaMetroStation {
  id: string;
  name: string;
  aliases: string[];
  sequence: number;
  coordinates?: [number, number];
}

// Station order and names follow the DMTCL MRT Line-6 route map.
// Coordinates are [latitude, longitude], matched to station footprints from OSM/Nominatim.
export const DHAKA_METRO_STATIONS: DhakaMetroStation[] = [
  {
    id: "metro-uttara-north",
    name: "Uttara North Metro Station",
    aliases: ["uttara north", "uttara north metro", "diabari"],
    sequence: 0,
    coordinates: [23.869305, 90.3675463],
  },
  {
    id: "metro-uttara-center",
    name: "Uttara Center Metro Station",
    aliases: ["uttara center", "uttara centre"],
    sequence: 1,
    coordinates: [23.8597545, 90.3652035],
  },
  {
    id: "metro-uttara-south",
    name: "Uttara South Metro Station",
    aliases: ["uttara south"],
    sequence: 2,
    coordinates: [23.845765, 90.3631386],
  },
  {
    id: "metro-pallabi",
    name: "Pallabi Metro Station",
    aliases: ["pallabi metro", "pallabi"],
    sequence: 3,
    coordinates: [23.826136, 90.3642417],
  },
  {
    id: "metro-mirpur-11",
    name: "Mirpur 11 Metro Station",
    aliases: ["mirpur 11 metro", "mirpur 11"],
    sequence: 4,
    coordinates: [23.8191216, 90.3652897],
  },
  {
    id: "metro-mirpur-10",
    name: "Mirpur 10 Metro Station",
    aliases: ["mirpur 10 metro", "mirpur 10"],
    sequence: 5,
    coordinates: [23.8082829, 90.3682396],
  },
  {
    id: "metro-kazipara",
    name: "Kazipara Metro Station",
    aliases: ["kazipara metro", "kazipara"],
    sequence: 6,
    coordinates: [23.7992224, 90.3719446],
  },
  {
    id: "metro-shewrapara",
    name: "Shewrapara Metro Station",
    aliases: ["shewrapara metro", "shewrapara"],
    sequence: 7,
    coordinates: [23.7909484, 90.3754461],
  },
  {
    id: "metro-agargaon",
    name: "Agargaon Metro Station",
    aliases: ["agargaon metro", "agargaon"],
    sequence: 8,
    coordinates: [23.7784201, 90.3800354],
  },
  {
    id: "metro-bijoy-sarani",
    name: "Bijoy Sarani Metro Station",
    aliases: ["bijoy sarani metro", "bijoy sarani"],
    sequence: 9,
    coordinates: [23.7665451, 90.3831114],
  },
  {
    id: "metro-farmgate",
    name: "Farmgate Metro Station",
    aliases: ["farmgate metro", "farmgate", "farm gate metro"],
    sequence: 10,
    coordinates: [23.7590418, 90.387085],
  },
  {
    id: "metro-kawran-bazar",
    name: "Karwan Bazar Metro Station",
    aliases: ["kawran bazar metro", "karwan bazar metro", "kawran bazar"],
    sequence: 11,
    coordinates: [23.7517206, 90.3926044],
  },
  {
    id: "metro-shahbag",
    name: "Shahbag Metro Station",
    aliases: ["shahbag metro", "shahbag", "shahbagh metro", "shahbagh"],
    sequence: 12,
    coordinates: [23.7400602, 90.3959828],
  },
  {
    id: "metro-dhaka-university",
    name: "Dhaka University Metro Station",
    aliases: ["dhaka university metro", "du metro", "dhaka university"],
    sequence: 13,
    coordinates: [23.7314268, 90.3970319],
  },
  {
    id: "metro-secretariat",
    name: "Bangladesh Secretariat Metro Station",
    aliases: ["secretariat metro", "bangladesh secretariat metro", "secretariat"],
    sequence: 14,
    coordinates: [23.7299879, 90.4075043],
  },
  {
    id: "metro-motijheel",
    name: "Motijheel Metro Station",
    aliases: ["motijheel metro", "motijheel"],
    sequence: 15,
    coordinates: [23.7280746, 90.4190913],
  },
];

export const DHAKA_METRO_LINE_6_SHAPE: [number, number][] = DHAKA_METRO_STATIONS
  .filter((station): station is DhakaMetroStation & { coordinates: [number, number] } =>
    Boolean(station.coordinates),
  )
  .sort((left, right) => left.sequence - right.sequence)
  .map((station) => station.coordinates);

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
