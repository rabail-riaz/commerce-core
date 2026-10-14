export type CourierCredentialField = {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url';
  required?: boolean;
  placeholder?: string;
};

export type PakistanCourierDefinition = {
  code: string;
  name: string;
  description: string;
  fields: CourierCredentialField[];
};

export const PAKISTAN_COURIERS: PakistanCourierDefinition[] = [
  { code: 'TCS', name: 'TCS', description: 'Nationwide express courier and logistics.', fields: [{ key: 'apiKey', label: 'API key', type: 'password', required: true }, { key: 'username', label: 'Username', type: 'text', required: true }, { key: 'accountNumber', label: 'Account number', type: 'text' }] },
  { code: 'LEOPARDS', name: 'Leopards Courier', description: 'Domestic express and cash-on-delivery network.', fields: [{ key: 'apiKey', label: 'API key', type: 'password', required: true }, { key: 'apiPassword', label: 'API password', type: 'password', required: true }] },
  { code: 'TRAX', name: 'Trax', description: 'Formerly M&P; nationwide last-mile delivery.', fields: [{ key: 'apiKey', label: 'API key', type: 'password', required: true }, { key: 'secret', label: 'API secret', type: 'password' }] },
  { code: 'POSTEX', name: 'PostEx', description: 'COD and e-commerce fulfillment.', fields: [{ key: 'token', label: 'API token', type: 'password', required: true, placeholder: 'Merchant token from PostEx dashboard' }, { key: 'baseUrl', label: 'Base URL', type: 'url', placeholder: 'https://api.postex.pk' }] },
  { code: 'RIDER', name: 'Rider', description: 'Karachi-first last-mile courier.', fields: [{ key: 'apiKey', label: 'API key', type: 'password', required: true }, { key: 'apiSecret', label: 'API secret', type: 'password' }] },
  { code: 'CALLCOURIER', name: 'Call Courier', description: 'COD and same-day delivery across Pakistan.', fields: [{ key: 'loginId', label: 'Login ID', type: 'text', required: true }, { key: 'apiKey', label: 'API key', type: 'password', required: true }] },
  { code: 'BLUEEX', name: 'BlueEx', description: 'E-commerce courier and fulfillment.', fields: [{ key: 'username', label: 'Username', type: 'text', required: true }, { key: 'password', label: 'Password', type: 'password', required: true }] },
  { code: 'MNP', name: 'M&P', description: 'Muller & Phipps courier (legacy accounts).', fields: [{ key: 'apiKey', label: 'API key', type: 'password', required: true }, { key: 'username', label: 'Username', type: 'text' }] },
  { code: 'PAKISTANPOST', name: 'Pakistan Post', description: 'National postal and parcel service.', fields: [{ key: 'apiKey', label: 'API key', type: 'password', required: true }, { key: 'accountNumber', label: 'Account number', type: 'text' }] },
  { code: 'FASTEX', name: 'Daewoo FastEx', description: 'Daewoo express cargo and FastEx parcels.', fields: [{ key: 'apiKey', label: 'API key', type: 'password', required: true }, { key: 'username', label: 'Username', type: 'text', required: true }] },
  { code: 'SWYFT', name: 'Swyft', description: 'Karachi and nationwide e-commerce delivery.', fields: [{ key: 'apiKey', label: 'API key', type: 'password', required: true }, { key: 'apiSecret', label: 'API secret', type: 'password' }] },
  { code: 'FORRUN', name: 'Forrun', description: 'Same-day and next-day logistics.', fields: [{ key: 'apiKey', label: 'API key', type: 'password', required: true }, { key: 'token', label: 'Token', type: 'password' }] },
  { code: 'MOVEX', name: 'MoveX', description: 'Last-mile and warehouse fulfillment.', fields: [{ key: 'apiKey', label: 'API key', type: 'password', required: true }, { key: 'secret', label: 'Secret', type: 'password' }] },
  { code: 'STALLION', name: 'Stallion', description: 'COD courier for online sellers.', fields: [{ key: 'apiKey', label: 'API key', type: 'password', required: true }, { key: 'username', label: 'Username', type: 'text' }] },
  { code: 'BYKEA', name: 'Bykea', description: 'On-demand bike delivery.', fields: [{ key: 'apiKey', label: 'API key', type: 'password', required: true }, { key: 'apiSecret', label: 'API secret', type: 'password' }] },
  { code: 'DHL', name: 'DHL Pakistan', description: 'International express shipping.', fields: [{ key: 'siteId', label: 'Site ID', type: 'text', required: true }, { key: 'password', label: 'Password', type: 'password', required: true }, { key: 'accountNumber', label: 'Account number', type: 'text', required: true }] },
  { code: 'FEDEX', name: 'FedEx Pakistan', description: 'International and domestic express.', fields: [{ key: 'apiKey', label: 'API key', type: 'password', required: true }, { key: 'secret', label: 'Secret key', type: 'password', required: true }, { key: 'accountNumber', label: 'Account number', type: 'text', required: true }] },
  { code: 'TPL', name: 'TPL Logistics', description: 'TPL Trakker logistics and delivery.', fields: [{ key: 'apiKey', label: 'API key', type: 'password', required: true }, { key: 'username', label: 'Username', type: 'text' }] },
  { code: 'OVERNIGHT', name: 'Overnight', description: 'Overnight parcels and cargo.', fields: [{ key: 'apiKey', label: 'API key', type: 'password', required: true }, { key: 'username', label: 'Username', type: 'text' }] },
  { code: 'QCS', name: 'QCS Courier', description: 'Quick Courier Services nationwide.', fields: [{ key: 'apiKey', label: 'API key', type: 'password', required: true }, { key: 'password', label: 'Password', type: 'password' }] },
  { code: 'OCS', name: 'OCS Pakistan', description: 'Overseas Courier Service.', fields: [{ key: 'apiKey', label: 'API key', type: 'password', required: true }, { key: 'accountNumber', label: 'Account number', type: 'text' }] },
  { code: 'SHALIMAR', name: 'Shalimar Courier', description: 'Domestic courier network.', fields: [{ key: 'apiKey', label: 'API key', type: 'password', required: true }, { key: 'username', label: 'Username', type: 'text' }] },
  { code: 'DAREWRO', name: 'Darewro', description: 'Peshawar-based e-commerce courier.', fields: [{ key: 'apiKey', label: 'API key', type: 'password', required: true }, { key: 'apiSecret', label: 'API secret', type: 'password' }] },
  { code: 'ZIPDROP', name: 'ZipDrop', description: 'Hyperlocal and same-day delivery.', fields: [{ key: 'apiKey', label: 'API key', type: 'password', required: true }] },
  { code: 'CONNECT', name: 'Connect Logistics', description: 'E-commerce last-mile delivery.', fields: [{ key: 'apiKey', label: 'API key', type: 'password', required: true }, { key: 'token', label: 'Token', type: 'password' }] },
];

export function findPakistanCourier(code: string) {
  return PAKISTAN_COURIERS.find((courier) => courier.code === code.trim().toUpperCase());
}
