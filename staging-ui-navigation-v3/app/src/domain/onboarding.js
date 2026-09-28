export const ONBOARDING_STEPS = Object.freeze(['account', 'business', 'regional', 'financial', 'departments', 'review']);

export function normalizeOnboardingDepartments(departments = []) {
  return departments
    .map((department) => ({ ...department, name: String(department?.name || '').trim() }))
    .filter((department) => department.name);
}

export function departmentNamesAreValid(departments = []) {
  const normalized = normalizeOnboardingDepartments(departments);
  return normalized.length > 0
    && normalized.length === departments.length
    && new Set(normalized.map((department) => department.name.toLocaleLowerCase())).size === normalized.length;
}

export function validateOnboardingDraft(draft = {}, step = 'review') {
  const errors = {};
  if (['business', 'regional', 'financial', 'departments', 'review'].includes(step)) {
    const companyName = String(draft.companyName || '').trim();
    if (!companyName || companyName.toLocaleLowerCase() === 'my company') errors.companyName = 'Enter your company name.';
    if (!draft.countryCode || !draft.country) errors.country = 'Choose a country.';
  }

  if (['regional', 'financial', 'departments', 'review'].includes(step)) {
    if (!draft.language) errors.language = 'Choose a language.';
    if (!/^[A-Z]{3}$/.test(String(draft.currency || ''))) errors.currency = 'Choose a valid currency.';
    if (!String(draft.timezone || '').includes('/')) errors.timezone = 'Choose a timezone.';
    if (draft.defaultVat === '' || Number(draft.defaultVat) < 0 || Number(draft.defaultVat) > 100) errors.defaultVat = 'Enter a VAT percentage between 0 and 100.';
  }

  if (['financial', 'departments', 'review'].includes(step)) {
    if (draft.weekStartsOn !== 'Monday' && draft.weekStartsOn !== 'Sunday') errors.weekStartsOn = 'Choose the first day of the week.';
    if (draft.targetGp === '' || Number(draft.targetGp) <= 0 || Number(draft.targetGp) > 100) errors.targetGp = 'Enter a target GP between 0 and 100.';
  }

  if (['departments', 'review'].includes(step) && !departmentNamesAreValid(draft.departments || [])) {
    errors.departments = 'Add at least one uniquely named department.';
  }

  return errors;
}

export function onboardingNeedsRedirect(membership, isInternalStaff = false) {
  if (isInternalStaff) return false;
  const onboardingStatus = membership?.companies?.onboarding_status;
  return Boolean(membership && onboardingStatus && onboardingStatus !== 'complete');
}
