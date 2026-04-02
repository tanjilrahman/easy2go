export interface DhakaMetroStation {
  id: string;
  name: string;
  aliases: string[];
  sequence: number;
  fareFromNorth: number;
  coordinates?: [number, number];
}

export const DHAKA_METRO_STATIONS: DhakaMetroStation[] = [
  {
    id: "metro-uttara-north",
    name: "Uttara North Metro Station",
    aliases: ["uttara north", "uttara north metro", "diabari"],
    sequence: 0,
    fareFromNorth: 0,
    coordinates: [23.8749, 90.3989],
  },
  {
    id: "metro-uttara-center",
    name: "Uttara Center Metro Station",
    aliases: ["uttara center", "uttara centre"],
    sequence: 1,
    fareFromNorth: 20,
    coordinates: [23.8658, 90.399],
  },
  {
    id: "metro-uttara-south",
    name: "Uttara South Metro Station",
    aliases: ["uttara south"],
    sequence: 2,
    fareFromNorth: 20,
    coordinates: [23.8571, 90.3992],
  },
  {
    id: "metro-pallabi",
    name: "Pallabi Metro Station",
    aliases: ["pallabi metro", "pallabi"],
    sequence: 3,
    fareFromNorth: 40,
    coordinates: [23.8216, 90.3653],
  },
  {
    id: "metro-mirpur-11",
    name: "Mirpur 11 Metro Station",
    aliases: ["mirpur 11 metro", "mirpur 11"],
    sequence: 4,
    fareFromNorth: 40,
    coordinates: [23.8156, 90.3677],
  },
  {
    id: "metro-mirpur-10",
    name: "Mirpur 10 Metro Station",
    aliases: ["mirpur 10 metro", "mirpur 10"],
    sequence: 5,
    fareFromNorth: 50,
    coordinates: [23.8044, 90.3667],
  },
  {
    id: "metro-kazipara",
    name: "Kazipara Metro Station",
    aliases: ["kazipara metro", "kazipara"],
    sequence: 6,
    fareFromNorth: 60,
    coordinates: [23.8095, 90.3687],
  },
  {
    id: "metro-shewrapara",
    name: "Shewrapara Metro Station",
    aliases: ["shewrapara metro", "shewrapara"],
    sequence: 7,
    fareFromNorth: 60,
    coordinates: [23.7907, 90.3766],
  },
  {
    id: "metro-agargaon",
    name: "Agargaon Metro Station",
    aliases: ["agargaon metro", "agargaon"],
    sequence: 8,
    fareFromNorth: 60,
    coordinates: [23.7784, 90.3798],
  },
  {
    id: "metro-bijoy-sarani",
    name: "Bijoy Sarani Metro Station",
    aliases: ["bijoy sarani metro", "bijoy sarani"],
    sequence: 9,
    fareFromNorth: 70,
    coordinates: [23.7644, 90.3882],
  },
  {
    id: "metro-farmgate",
    name: "Farmgate Metro Station",
    aliases: ["farmgate metro", "farmgate", "farm gate metro"],
    sequence: 10,
    fareFromNorth: 80,
    coordinates: [23.7589, 90.389],
  },
  {
    id: "metro-kawran-bazar",
    name: "Kawran Bazar Metro Station",
    aliases: ["kawran bazar metro", "karwan bazar metro", "kawran bazar"],
    sequence: 11,
    fareFromNorth: 80,
    coordinates: [23.7514, 90.3938],
  },
  {
    id: "metro-shahbag",
    name: "Shahbag Metro Station",
    aliases: ["shahbag metro", "shahbag", "shahbagh metro", "shahbagh"],
    sequence: 12,
    fareFromNorth: 90,
    coordinates: [23.7398, 90.3953],
  },
  {
    id: "metro-dhaka-university",
    name: "Dhaka University Metro Station",
    aliases: ["dhaka university metro", "du metro", "dhaka university"],
    sequence: 13,
    fareFromNorth: 90,
    coordinates: [23.7334, 90.3928],
  },
  {
    id: "metro-secretariat",
    name: "Bangladesh Secretariat Metro Station",
    aliases: ["secretariat metro", "bangladesh secretariat metro", "secretariat"],
    sequence: 14,
    fareFromNorth: 100,
    coordinates: [23.7307, 90.4141],
  },
  {
    id: "metro-motijheel",
    name: "Motijheel Metro Station",
    aliases: ["motijheel metro", "motijheel"],
    sequence: 15,
    fareFromNorth: 100,
    coordinates: [23.7325, 90.4172],
  },
];
