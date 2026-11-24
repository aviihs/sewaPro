import { type PricingType } from '../generated/client.js';

export interface SeedOffer {
  readonly service: string;
  readonly pricingType: PricingType;
  readonly price: number | null;
}

export interface SeedProvider {
  readonly fullName: string;
  readonly businessName: string;
  readonly phone: string;
  readonly email: string;
  readonly area: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly experienceYears: number;
  readonly offers: readonly SeedOffer[];
}

const fixed = (service: string, price: number): SeedOffer => ({
  service,
  pricingType: 'FIXED',
  price,
});
const hourly = (service: string, price: number): SeedOffer => ({
  service,
  pricingType: 'HOURLY',
  price,
});
const from = (service: string, price: number): SeedOffer => ({
  service,
  pricingType: 'STARTING_FROM',
  price,
});
const quote = (service: string): SeedOffer => ({
  service,
  pricingType: 'QUOTATION',
  price: null,
});

/** Sample verified providers spread around the Kathmandu valley. */
export const SEED_PROVIDERS: readonly SeedProvider[] = [
  {
    fullName: 'Ram Bahadur Thapa',
    businessName: 'Thapa Electricals',
    phone: '+9779800000101',
    email: 'ram.thapa@sewapro.local',
    area: 'Thamel',
    latitude: 27.7154,
    longitude: 85.3123,
    experienceYears: 12,
    offers: [
      hourly('Wiring and Rewiring', 800),
      fixed('Fan Installation', 500),
      quote('MCB and DB Repair'),
    ],
  },
  {
    fullName: 'Sita Maharjan',
    businessName: 'Maharjan Plumbing',
    phone: '+9779800000102',
    email: 'sita.maharjan@sewapro.local',
    area: 'Pulchowk, Lalitpur',
    latitude: 27.6781,
    longitude: 85.3188,
    experienceYears: 8,
    offers: [
      from('Leak Repair', 600),
      fixed('Water Tank Cleaning', 2500),
      quote('Bathroom Fitting'),
    ],
  },
  {
    fullName: 'Hari Shrestha',
    businessName: 'Shrestha Woodworks',
    phone: '+9779800000103',
    email: 'hari.shrestha@sewapro.local',
    area: 'Baneshwor',
    latitude: 27.6939,
    longitude: 85.342,
    experienceYears: 15,
    offers: [hourly('Furniture Repair', 700), quote('Modular Kitchen Work')],
  },
  {
    fullName: 'Bikash Gurung',
    businessName: 'Cool Air Services',
    phone: '+9779800000104',
    email: 'bikash.gurung@sewapro.local',
    area: 'Koteshwor',
    latitude: 27.6789,
    longitude: 85.3497,
    experienceYears: 6,
    offers: [fixed('AC Servicing', 1800), from('AC Repair', 1500), quote('AC Installation')],
  },
  {
    fullName: 'Anita Tamang',
    businessName: 'Sparkle Home Cleaning',
    phone: '+9779800000105',
    email: 'anita.tamang@sewapro.local',
    area: 'Boudha',
    latitude: 27.7215,
    longitude: 85.362,
    experienceYears: 5,
    offers: [fixed('Deep Home Cleaning', 6000), fixed('Kitchen Cleaning', 2500)],
  },
  {
    fullName: 'Suresh Karki',
    businessName: 'Karki Auto Care',
    phone: '+9779800000106',
    email: 'suresh.karki@sewapro.local',
    area: 'Kalanki',
    latitude: 27.6933,
    longitude: 85.2814,
    experienceYears: 10,
    offers: [fixed('Bike Servicing', 1200), from('Car Servicing', 4500)],
  },
  {
    fullName: 'Prakash Adhikari',
    businessName: 'Adhikari Electric and Plumbing',
    phone: '+9779800000107',
    email: 'prakash.adhikari@sewapro.local',
    area: 'Maharajgunj',
    latitude: 27.7369,
    longitude: 85.33,
    experienceYears: 9,
    offers: [fixed('Switch and Socket Repair', 400), from('Drain Unblocking', 800)],
  },
  {
    fullName: 'Kabita Suwal',
    businessName: 'Bhaktapur Home Services',
    phone: '+9779800000108',
    email: 'kabita.suwal@sewapro.local',
    area: 'Bhaktapur',
    latitude: 27.671,
    longitude: 85.4298,
    experienceYears: 4,
    offers: [fixed('Bathroom Cleaning', 1500), hourly('Furniture Assembly', 600)],
  },
];

export interface SeedCustomer {
  readonly fullName: string;
  readonly phone: string;
  readonly email: string;
}

export const SEED_CUSTOMERS: readonly SeedCustomer[] = [
  { fullName: 'Aarati Sharma', phone: '+9779800000201', email: 'aarati@sewapro.local' },
  { fullName: 'Nabin Rai', phone: '+9779800000202', email: 'nabin@sewapro.local' },
  { fullName: 'Pooja Lama', phone: '+9779800000203', email: 'pooja@sewapro.local' },
];
