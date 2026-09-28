export const COUNTRY_DEFAULTS = Object.freeze({
  GB: Object.freeze({
    code: 'GB',
    name: 'United Kingdom',
    currency: 'GBP',
    language: 'en',
    timezone: 'Europe/London',
    defaultVat: 20,
    weekStartsOn: 'Monday',
  }),
  PT: Object.freeze({
    code: 'PT',
    name: 'Portugal',
    currency: 'EUR',
    language: 'pt',
    timezone: 'Europe/Lisbon',
    defaultVat: 23,
    weekStartsOn: 'Monday',
  }),
  ES: Object.freeze({
    code: 'ES',
    name: 'Spain',
    currency: 'EUR',
    language: 'en',
    timezone: 'Europe/Madrid',
    defaultVat: 21,
    weekStartsOn: 'Monday',
  }),
  FR: Object.freeze({
    code: 'FR',
    name: 'France',
    currency: 'EUR',
    language: 'en',
    timezone: 'Europe/Paris',
    defaultVat: 20,
    weekStartsOn: 'Monday',
  }),
});

export const COUNTRY_OPTIONS = Object.freeze(Object.values(COUNTRY_DEFAULTS));
export const REGIONAL_FIELDS = Object.freeze(['currency', 'language', 'timezone', 'defaultVat', 'weekStartsOn']);

export function regionalDefaultsFor(countryCode) {
  return COUNTRY_DEFAULTS[countryCode] || COUNTRY_DEFAULTS.GB;
}

export function nextRegionalDraft(current = {}, nextCountryCode, manualOverrides = {}) {
  const defaults = regionalDefaultsFor(nextCountryCode);
  const next = {
    ...current,
    countryCode: defaults.code,
    country: defaults.name,
  };

  REGIONAL_FIELDS.forEach((field) => {
    if (!manualOverrides[field]) next[field] = defaults[field];
  });

  return next;
}

export function regionalOverridesFromSettings(settings = {}) {
  return REGIONAL_FIELDS.reduce((overrides, field) => ({
    ...overrides,
    [field]: Boolean(settings.regionalOverrides?.[field]),
  }), {});
}
