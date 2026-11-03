/**
 * @payswap/provider-runtime — the Stripe GLOBAL PAYOUTS recipient-market
 * matrix (P27-B, ADR-0020 D10): the dated 107-row recipient-country ×
 * currency table and the dated receiving minima/maxima, exactly as parsed
 * from docs.stripe.com/global-payouts/recipient-countries and
 * docs.stripe.com/global-payouts/payout-methods (retrieved 2026-11-03 at the
 * P27-B station; the machine diff against the live page ran with ZERO
 * differences — see the P27-B lane report §"the dated re-verification").
 *
 * THE LAW (D10): these rows are EVIDENCE-STAMPED OBSERVATIONS with a retrieval
 * date, never permanent flags. GHANA CARRIES NO ROW (the K1 law) — the honest
 * refusal with the roadmap conditional-opportunity note is the product's
 * answer for Ghana, never a silent fill. "Currencies" = the GA column;
 * "Private preview currencies" are API-gated behind an access request (the
 * page: "Currencies in the Private preview currencies column are available
 * through the API. To send payouts in those currencies, request access.").
 */

/** One dated recipient-market row (the D10 observation record). */
export interface StripeGlobalPayoutsDatedCountryFact {
  /** ISO 3166-1 alpha-2. */
  readonly countryCode: string;
  readonly countryName?: string;
  readonly currency?: string;
  readonly currencies?: readonly string[];
  readonly privatePreviewCurrencies?: readonly string[];
  readonly minMinorUnits?: number;
  readonly maxMinorUnits?: number;
}

/**
 * THE RECIPIENT-MARKET MATRIX (107 rows, both currency columns verbatim from
 * the 2026-11-03 table). The table "applies to all supported sender countries
 * (US and UK)" per the same page.
 */
export const STRIPE_GLOBAL_PAYOUTS_RECIPIENT_MARKET_ROWS: readonly StripeGlobalPayoutsDatedCountryFact[] = Object.freeze([
  Object.freeze({ countryCode: 'AL', countryName: 'Albania', currencies: ['ALL'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'DZ', countryName: 'Algeria', currencies: ['DZD'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'AG', countryName: 'Antigua and Barbuda', currencies: ['XCD'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'AR', countryName: 'Argentina', currencies: [], privatePreviewCurrencies: ['ARS'] }),
  Object.freeze({ countryCode: 'AM', countryName: 'Armenia', currencies: ['AMD'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'AU', countryName: 'Australia', currencies: ['AUD'], privatePreviewCurrencies: ['USD'] }),
  Object.freeze({ countryCode: 'AT', countryName: 'Austria', currencies: ['EUR'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'BS', countryName: 'Bahamas', currencies: ['BSD'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'BH', countryName: 'Bahrain', currencies: ['BHD'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'BD', countryName: 'Bangladesh', currencies: [], privatePreviewCurrencies: ['USD'] }),
  Object.freeze({ countryCode: 'BE', countryName: 'Belgium', currencies: ['EUR'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'BJ', countryName: 'Benin', currencies: ['XOF'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'BT', countryName: 'Bhutan', currencies: ['BTN'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'BA', countryName: 'Bosnia and Herzegovina', currencies: ['BAM'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'BW', countryName: 'Botswana', currencies: ['BWP'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'BR', countryName: 'Brazil', currencies: [], privatePreviewCurrencies: ['BRL'] }),
  Object.freeze({ countryCode: 'BN', countryName: 'Brunei', currencies: ['BND'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'BG', countryName: 'Bulgaria', currencies: ['EUR'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'KH', countryName: 'Cambodia', currencies: [], privatePreviewCurrencies: ['KHR'] }),
  Object.freeze({ countryCode: 'CA', countryName: 'Canada', currencies: ['CAD'], privatePreviewCurrencies: ['USD'] }),
  Object.freeze({ countryCode: 'CN', countryName: 'China', currencies: [], privatePreviewCurrencies: ['CNY', 'USD'] }),
  Object.freeze({ countryCode: 'CO', countryName: 'Colombia', currencies: [], privatePreviewCurrencies: ['COP'] }),
  Object.freeze({ countryCode: 'CR', countryName: 'Costa Rica', currencies: ['CRC'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'HR', countryName: 'Croatia', currencies: ['EUR'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'CY', countryName: 'Cyprus', currencies: ['EUR'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'CZ', countryName: 'Czech Republic', currencies: ['EUR'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'CI', countryName: 'Côte d’Ivoire', currencies: ['XOF'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'DK', countryName: 'Denmark', currencies: ['DKK'], privatePreviewCurrencies: ['USD'] }),
  Object.freeze({ countryCode: 'DO', countryName: 'Dominican Republic', currencies: ['DOP'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'EC', countryName: 'Ecuador', currencies: ['USD'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'EG', countryName: 'Egypt', currencies: ['EGP'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'SV', countryName: 'El Salvador', currencies: ['USD'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'EE', countryName: 'Estonia', currencies: ['EUR'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'ET', countryName: 'Ethiopia', currencies: ['ETB'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'FI', countryName: 'Finland', currencies: ['EUR', 'USD'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'FR', countryName: 'France', currencies: ['EUR'], privatePreviewCurrencies: ['USD'] }),
  Object.freeze({ countryCode: 'GM', countryName: 'Gambia', currencies: ['GMD'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'DE', countryName: 'Germany', currencies: ['EUR'], privatePreviewCurrencies: ['USD'] }),
  Object.freeze({ countryCode: 'GR', countryName: 'Greece', currencies: ['EUR'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'GT', countryName: 'Guatemala', currencies: ['GTQ'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'GY', countryName: 'Guyana', currencies: ['GYD'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'HK', countryName: 'Hong Kong', currencies: ['HKD'], privatePreviewCurrencies: ['USD'] }),
  Object.freeze({ countryCode: 'HU', countryName: 'Hungary', currencies: ['HUF'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'IS', countryName: 'Iceland', currencies: ['EUR'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'IN', countryName: 'India', currencies: ['INR'], privatePreviewCurrencies: ['USD'] }),
  Object.freeze({ countryCode: 'ID', countryName: 'Indonesia', currencies: ['IDR'], privatePreviewCurrencies: ['USD'] }),
  Object.freeze({ countryCode: 'IE', countryName: 'Ireland', currencies: ['EUR'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'IL', countryName: 'Israel', currencies: ['ILS'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'IT', countryName: 'Italy', currencies: ['EUR'], privatePreviewCurrencies: ['USD'] }),
  Object.freeze({ countryCode: 'JM', countryName: 'Jamaica', currencies: ['JMD'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'JP', countryName: 'Japan', currencies: ['JPY'], privatePreviewCurrencies: ['USD'] }),
  Object.freeze({ countryCode: 'JO', countryName: 'Jordan', currencies: ['JOD'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'KE', countryName: 'Kenya', currencies: ['KES'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'KW', countryName: 'Kuwait', currencies: ['KWD'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'LV', countryName: 'Latvia', currencies: ['EUR'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'LI', countryName: 'Liechtenstein', currencies: ['EUR'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'LT', countryName: 'Lithuania', currencies: ['EUR'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'LU', countryName: 'Luxembourg', currencies: ['EUR'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'MG', countryName: 'Madagascar', currencies: ['MGA'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'MY', countryName: 'Malaysia', currencies: ['MYR'], privatePreviewCurrencies: ['USD'] }),
  Object.freeze({ countryCode: 'MT', countryName: 'Malta', currencies: ['EUR'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'MU', countryName: 'Mauritius', currencies: ['MUR'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'MX', countryName: 'Mexico', currencies: ['MXN'], privatePreviewCurrencies: ['USD'] }),
  Object.freeze({ countryCode: 'MD', countryName: 'Moldova', currencies: ['MDL'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'MC', countryName: 'Monaco', currencies: ['EUR'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'MN', countryName: 'Mongolia', currencies: ['MNT'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'MA', countryName: 'Morocco', currencies: ['MAD'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'MZ', countryName: 'Mozambique', currencies: ['MZN'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'NA', countryName: 'Namibia', currencies: ['NAD'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'NL', countryName: 'Netherlands', currencies: ['EUR'], privatePreviewCurrencies: ['USD'] }),
  Object.freeze({ countryCode: 'NZ', countryName: 'New Zealand', currencies: ['NZD'], privatePreviewCurrencies: ['USD'] }),
  Object.freeze({ countryCode: 'MK', countryName: 'North Macedonia', currencies: ['MKD'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'NO', countryName: 'Norway', currencies: ['NOK'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'OM', countryName: 'Oman', currencies: ['OMR'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'PK', countryName: 'Pakistan', currencies: ['PKR'], privatePreviewCurrencies: ['USD'] }),
  Object.freeze({ countryCode: 'PA', countryName: 'Panama', currencies: ['USD'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'PE', countryName: 'Peru', currencies: ['PEN'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'PH', countryName: 'Philippines', currencies: ['PHP'], privatePreviewCurrencies: ['USD'] }),
  Object.freeze({ countryCode: 'PL', countryName: 'Poland', currencies: ['PLN'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'PT', countryName: 'Portugal', currencies: ['EUR'], privatePreviewCurrencies: ['USD'] }),
  Object.freeze({ countryCode: 'QA', countryName: 'Qatar', currencies: ['QAR'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'RO', countryName: 'Romania', currencies: ['RON'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'RW', countryName: 'Rwanda', currencies: ['RWF'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'LC', countryName: 'Saint Lucia', currencies: ['XCD'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'SM', countryName: 'San Marino', currencies: ['EUR'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'SN', countryName: 'Senegal', currencies: ['XOF'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'RS', countryName: 'Serbia', currencies: ['RSD'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'SG', countryName: 'Singapore', currencies: ['SGD'], privatePreviewCurrencies: ['USD'] }),
  Object.freeze({ countryCode: 'SK', countryName: 'Slovakia', currencies: ['EUR'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'SI', countryName: 'Slovenia', currencies: ['EUR'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'ZA', countryName: 'South Africa', currencies: ['ZAR'], privatePreviewCurrencies: ['USD'] }),
  Object.freeze({ countryCode: 'KR', countryName: 'South Korea', currencies: [], privatePreviewCurrencies: ['USD'] }),
  Object.freeze({ countryCode: 'ES', countryName: 'Spain', currencies: ['EUR'], privatePreviewCurrencies: ['USD'] }),
  Object.freeze({ countryCode: 'LK', countryName: 'Sri Lanka', currencies: ['LKR'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'SE', countryName: 'Sweden', currencies: ['SEK'], privatePreviewCurrencies: ['USD'] }),
  Object.freeze({ countryCode: 'CH', countryName: 'Switzerland', currencies: ['EUR'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'TW', countryName: 'Taiwan', currencies: ['TWD'], privatePreviewCurrencies: ['USD'] }),
  Object.freeze({ countryCode: 'TZ', countryName: 'Tanzania', currencies: ['TZS'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'TH', countryName: 'Thailand', currencies: ['THB'], privatePreviewCurrencies: ['USD'] }),
  Object.freeze({ countryCode: 'TT', countryName: 'Trinidad and Tobago', currencies: ['TTD'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'TN', countryName: 'Tunisia', currencies: ['TND'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'TR', countryName: 'Turkey', currencies: ['TRY'], privatePreviewCurrencies: ['USD'] }),
  Object.freeze({ countryCode: 'AE', countryName: 'United Arab Emirates', currencies: ['AED'], privatePreviewCurrencies: ['USD'] }),
  Object.freeze({ countryCode: 'GB', countryName: 'United Kingdom', currencies: ['GBP'], privatePreviewCurrencies: ['USD'] }),
  Object.freeze({ countryCode: 'US', countryName: 'United States', currencies: ['USD'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'UZ', countryName: 'Uzbekistan', currencies: ['UZS'], privatePreviewCurrencies: [] }),
  Object.freeze({ countryCode: 'VN', countryName: 'Vietnam', currencies: ['VND'], privatePreviewCurrencies: ['USD'] }),
] as const);

/** The dated minimum receiving amounts (minor units, the 94-row live table verbatim). */
export const STRIPE_GLOBAL_PAYOUTS_MIN_RECEIVING_ROWS: readonly StripeGlobalPayoutsDatedCountryFact[] = Object.freeze([
  Object.freeze({ countryCode: 'AL', currency: 'ALL', minMinorUnits: 300000 }),
  Object.freeze({ countryCode: 'DZ', currency: 'DZD', minMinorUnits: 100 }),
  Object.freeze({ countryCode: 'AG', currency: 'XCD', minMinorUnits: 4 }),
  Object.freeze({ countryCode: 'AM', currency: 'AMD', minMinorUnits: 1210000 }),
  Object.freeze({ countryCode: 'AU', currency: 'AUD', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'AT', currency: 'EUR', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'BH', currency: 'BHD', minMinorUnits: 5 }),
  Object.freeze({ countryCode: 'BS', currency: 'BSD', minMinorUnits: 2500 }),
  Object.freeze({ countryCode: 'BE', currency: 'EUR', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'BJ', currency: 'XOF', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'BT', currency: 'BTN', minMinorUnits: 250000 }),
  Object.freeze({ countryCode: 'BA', currency: 'BAM', minMinorUnits: 5000 }),
  Object.freeze({ countryCode: 'BW', currency: 'BWP', minMinorUnits: 100 }),
  Object.freeze({ countryCode: 'BN', currency: 'BND', minMinorUnits: 100 }),
  Object.freeze({ countryCode: 'BG', currency: 'EUR', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'CA', currency: 'CAD', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'CR', currency: 'CRC', minMinorUnits: 700 }),
  Object.freeze({ countryCode: 'CI', currency: 'XOF', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'HR', currency: 'EUR', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'CY', currency: 'EUR', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'CZ', currency: 'EUR', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'DK', currency: 'DKK', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'EC', currency: 'USD', minMinorUnits: 100 }),
  Object.freeze({ countryCode: 'SV', currency: 'USD', minMinorUnits: 3000 }),
  Object.freeze({ countryCode: 'EE', currency: 'EUR', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'ET', currency: 'ETB', minMinorUnits: 100 }),
  Object.freeze({ countryCode: 'FI', currency: 'EUR', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'FR', currency: 'EUR', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'GM', currency: 'GMD', minMinorUnits: 190000 }),
  Object.freeze({ countryCode: 'DE', currency: 'EUR', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'GR', currency: 'EUR', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'GT', currency: 'GTQ', minMinorUnits: 100 }),
  Object.freeze({ countryCode: 'GY', currency: 'GYD', minMinorUnits: 630000 }),
  Object.freeze({ countryCode: 'HK', currency: 'HKD', minMinorUnits: 2000 }),
  Object.freeze({ countryCode: 'HU', currency: 'HUF', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'IS', currency: 'EUR', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'ID', currency: 'IDR', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'IE', currency: 'EUR', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'IL', currency: 'ILS', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'IT', currency: 'EUR', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'JM', currency: 'JMD', minMinorUnits: 0 }),
  Object.freeze({ countryCode: 'JO', currency: 'JOD', minMinorUnits: 10 }),
  Object.freeze({ countryCode: 'KE', currency: 'KES', minMinorUnits: 2000 }),
  Object.freeze({ countryCode: 'KW', currency: 'KWD', minMinorUnits: 1000 }),
  Object.freeze({ countryCode: 'LV', currency: 'EUR', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'LI', currency: 'EUR', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'LT', currency: 'EUR', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'LU', currency: 'EUR', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'MG', currency: 'MGA', minMinorUnits: 13230000 }),
  Object.freeze({ countryCode: 'MY', currency: 'MYR', minMinorUnits: 13300 }),
  Object.freeze({ countryCode: 'MT', currency: 'EUR', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'MU', currency: 'MUR', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'MX', currency: 'MXN', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'MA', currency: 'MAD', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'MD', currency: 'MDL', minMinorUnits: 50000 }),
  Object.freeze({ countryCode: 'MN', currency: 'MNT', minMinorUnits: 10500000 }),
  Object.freeze({ countryCode: 'MZ', currency: 'MZN', minMinorUnits: 160000 }),
  Object.freeze({ countryCode: 'NA', currency: 'NAD', minMinorUnits: 50000 }),
  Object.freeze({ countryCode: 'NL', currency: 'EUR', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'NZ', currency: 'NZD', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'MK', currency: 'MKD', minMinorUnits: 150000 }),
  Object.freeze({ countryCode: 'NO', currency: 'NOK', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'OM', currency: 'OMR', minMinorUnits: 5 }),
  Object.freeze({ countryCode: 'PK', currency: 'PKR', minMinorUnits: 400 }),
  Object.freeze({ countryCode: 'PA', currency: 'USD', minMinorUnits: 5000 }),
  Object.freeze({ countryCode: 'PE', currency: 'PEN', minMinorUnits: 5 }),
  Object.freeze({ countryCode: 'PH', currency: 'PHP', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'PL', currency: 'PLN', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'PT', currency: 'EUR', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'QA', currency: 'QAR', minMinorUnits: 100 }),
  Object.freeze({ countryCode: 'RO', currency: 'RON', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'RW', currency: 'RWF', minMinorUnits: 100 }),
  Object.freeze({ countryCode: 'LC', currency: 'XCD', minMinorUnits: 4 }),
  Object.freeze({ countryCode: 'SN', currency: 'XOF', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'RS', currency: 'RSD', minMinorUnits: 300000 }),
  Object.freeze({ countryCode: 'SG', currency: 'SGD', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'SK', currency: 'EUR', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'SI', currency: 'EUR', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'ZA', currency: 'ZAR', minMinorUnits: 10000 }),
  Object.freeze({ countryCode: 'ES', currency: 'EUR', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'LK', currency: 'LKR', minMinorUnits: 100 }),
  Object.freeze({ countryCode: 'SE', currency: 'SEK', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'CH', currency: 'EUR', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'TW', currency: 'TWD', minMinorUnits: 80000 }),
  Object.freeze({ countryCode: 'TZ', currency: 'TZS', minMinorUnits: 3500 }),
  Object.freeze({ countryCode: 'TH', currency: 'THB', minMinorUnits: 60000 }),
  Object.freeze({ countryCode: 'TT', currency: 'TTD', minMinorUnits: 10 }),
  Object.freeze({ countryCode: 'TN', currency: 'TND', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'TR', currency: 'TRY', minMinorUnits: 500 }),
  Object.freeze({ countryCode: 'AE', currency: 'AED', minMinorUnits: 500 }),
  Object.freeze({ countryCode: 'GB', currency: 'GBP', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'US', currency: 'USD', minMinorUnits: 1 }),
  Object.freeze({ countryCode: 'UZ', currency: 'UZS', minMinorUnits: 34300000 }),
  Object.freeze({ countryCode: 'VN', currency: 'VND', minMinorUnits: 81125 }),
] as const);

/** The dated maximum receiving amounts (minor units, the 14-row live table verbatim). */
export const STRIPE_GLOBAL_PAYOUTS_MAX_RECEIVING_ROWS: readonly StripeGlobalPayoutsDatedCountryFact[] = Object.freeze([
  Object.freeze({ countryCode: 'BJ', currency: 'XOF', maxMinorUnits: 50000000 }),
  Object.freeze({ countryCode: 'CI', currency: 'XOF', maxMinorUnits: 50000000 }),
  Object.freeze({ countryCode: 'IN', currency: 'INR', maxMinorUnits: 1000000000 }),
  Object.freeze({ countryCode: 'ID', currency: 'IDR', maxMinorUnits: 100000000000 }),
  Object.freeze({ countryCode: 'IL', currency: 'ILS', maxMinorUnits: 100000000 }),
  Object.freeze({ countryCode: 'KE', currency: 'KES', maxMinorUnits: 100000000 }),
  Object.freeze({ countryCode: 'MA', currency: 'MAD', maxMinorUnits: 999999999 }),
  Object.freeze({ countryCode: 'NO', currency: 'NOK', maxMinorUnits: 1000000000 }),
  Object.freeze({ countryCode: 'PE', currency: 'PEN', maxMinorUnits: 31000000 }),
  Object.freeze({ countryCode: 'RO', currency: 'RON', maxMinorUnits: 5000000 }),
  Object.freeze({ countryCode: 'SN', currency: 'XOF', maxMinorUnits: 50000000 }),
  Object.freeze({ countryCode: 'ZA', currency: 'ZAR', maxMinorUnits: 500000000 }),
  Object.freeze({ countryCode: 'SE', currency: 'SEK', maxMinorUnits: 1000000000 }),
  Object.freeze({ countryCode: 'TN', currency: 'TND', maxMinorUnits: 100000000 }),
] as const);

/* ---------------- lookup helpers over the dated rows (pure, fail-closed) ---------------- */

const RECIPIENT_MARKET_BY_CODE: ReadonlyMap<string, StripeGlobalPayoutsDatedCountryFact> = new Map(
  STRIPE_GLOBAL_PAYOUTS_RECIPIENT_MARKET_ROWS.map((row) => [row.countryCode, row]),
);

/** The dated recipient-market row for one ISO country code (undefined = absent). */
export function globalPayoutsRecipientMarketOf(countryCode: string): StripeGlobalPayoutsDatedCountryFact | undefined {
  return RECIPIENT_MARKET_BY_CODE.get(countryCode.toUpperCase());
}

/** The dated minimum receiving amount for a recipient currency (undefined = none documented). */
export function globalPayoutsMinReceivingMinorUnitsOf(currency: string, recipientCountryCode: string): number | undefined {
  const wanted = currency.toUpperCase();
  return STRIPE_GLOBAL_PAYOUTS_MIN_RECEIVING_ROWS.find(
    (row) => row.currency === wanted && row.countryCode === recipientCountryCode.toUpperCase(),
  )?.minMinorUnits;
}

/** The dated maximum receiving amount for a recipient currency (undefined = none documented). */
export function globalPayoutsMaxReceivingMinorUnitsOf(currency: string, recipientCountryCode: string): number | undefined {
  const wanted = currency.toUpperCase();
  return STRIPE_GLOBAL_PAYOUTS_MAX_RECEIVING_ROWS.find(
    (row) => row.currency === wanted && row.countryCode === recipientCountryCode.toUpperCase(),
  )?.maxMinorUnits;
}
