/** Six launch categories and their services. */
export interface SeedCategory {
  readonly name: string;
  readonly description: string;
  readonly services: readonly string[];
}

export const SEED_CATEGORIES: readonly SeedCategory[] = [
  {
    name: 'Electrician',
    description: 'Wiring, repairs and electrical installations',
    services: [
      'Wiring and Rewiring',
      'Switch and Socket Repair',
      'Fan Installation',
      'Inverter and Battery Setup',
      'MCB and DB Repair',
    ],
  },
  {
    name: 'Plumber',
    description: 'Leaks, fittings, tanks and drainage',
    services: [
      'Leak Repair',
      'Tap and Mixer Installation',
      'Water Tank Cleaning',
      'Bathroom Fitting',
      'Drain Unblocking',
      'Water Pump Repair',
    ],
  },
  {
    name: 'Carpenter',
    description: 'Furniture, doors, windows and woodwork',
    services: [
      'Furniture Repair',
      'Door and Window Repair',
      'Modular Kitchen Work',
      'Furniture Assembly',
    ],
  },
  {
    name: 'AC Technician',
    description: 'Air conditioner installation, servicing and repair',
    services: ['AC Installation', 'AC Servicing', 'AC Gas Refill', 'AC Repair'],
  },
  {
    name: 'Home Cleaning',
    description: 'Deep cleaning for homes and offices',
    services: [
      'Deep Home Cleaning',
      'Kitchen Cleaning',
      'Bathroom Cleaning',
      'Sofa and Carpet Cleaning',
    ],
  },
  {
    name: 'Mechanic',
    description: 'Doorstep bike and car servicing',
    services: [
      'Bike Servicing',
      'Car Servicing',
      'Doorstep Battery Replacement',
      'Tyre Puncture Repair',
    ],
  },
];
