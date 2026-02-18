/**
 * Truck/vehicle types for logistics fleet.
 * Each type maps to a PNG in /public (van.png, boxtruck.png, etc.).
 */
export const VEHICLE_TYPES = [
  'van',
  'box_truck',
  '20ft_container',
  '40ft_container',
  'flatbed',
] as const;

export type VehicleTypeKey = (typeof VEHICLE_TYPES)[number];

export interface VehicleTypeInfo {
  key: VehicleTypeKey;
  label: string;
  imagePath: string;
}

const IMAGE_BY_KEY: Record<VehicleTypeKey, string> = {
  van: '/van.png',
  box_truck: '/boxtruck.png',
  '20ft_container': '/20fttruck.png',
  '40ft_container': '/40fttruck.png',
  flatbed: '/flatbedtruck.png',
};

const LABEL_BY_KEY: Record<VehicleTypeKey, string> = {
  van: 'Van',
  box_truck: 'Box Truck',
  '20ft_container': '20ft Container',
  '40ft_container': '40ft Container',
  flatbed: 'Flatbed',
};

export const VEHICLE_TYPE_LIST: VehicleTypeInfo[] = VEHICLE_TYPES.map((key) => ({
  key,
  label: LABEL_BY_KEY[key],
  imagePath: IMAGE_BY_KEY[key],
}));

export function getVehicleTypeInfo(type: VehicleTypeKey | string): VehicleTypeInfo {
  const key = VEHICLE_TYPES.includes(type as VehicleTypeKey) ? (type as VehicleTypeKey) : 'box_truck';
  return { key, label: LABEL_BY_KEY[key], imagePath: IMAGE_BY_KEY[key] };
}
