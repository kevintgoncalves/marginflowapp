import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, LoaderCircle, Plus, Trash2 } from 'lucide-react';
import marginflowLogo from '../assets/marginflow-logo.png';
import { validateOnboardingDraft } from '../domain/onboarding.js';
import {
  COUNTRY_OPTIONS,
  nextRegionalDraft,
  regionalDefaultsFor,
  regionalOverridesFromSettings,
} from '../domain/regionalDefaults.js';
import {
  beginCustomerOnboarding,
  completeCustomerOnboarding,
  loadCustomerOnboardingState,
  saveCustomerOnboardingDepartments,
  saveCustomerOnboardingProgress,
} from '../lib/onboardingRepository.js';

const STEP_ORDER = ['account', 'business', 'regional', 'financial', 'departments', 'review'];
const STEP_LABELS = {
  account: 'Account',
  business: 'Business',
  regional: 'Regional',
  financial: 'Financial',
  departments: 'Departments',
  review: 'Review',
};

const TIMEZONES = ['Europe/London', 'Europe/Lisbon', 'Europe/Madrid', 'Europe/Paris', 'America/New_York'];
const CURRENCIES = ['GBP', 'EUR', 'USD'];

function initialDraft() {
  const defaults = regionalDefaultsFor('GB');
  return {
    companyName: '',
    countryCode: defaults.code,
    country: defaults.name,
    language: defaults.language,
    currency: defaults.currency,
    timezone: defaults.timezone,
    defaultVat: defaults.defaultVat,
    weekStartsOn: defaults.weekStartsOn,
    targetGp: 75,
    departments: [],
    regionalOverrides: {},
  };
}

function draftFromState(state) {
  const settings = state?.settings || {};
  const countryCode = settings.country_code || state?.company?.country_code || 'GB';
  const defaults = regionalDefaultsFor(countryCode);
  return {
    companyName: settings.company_name || state?.company?.name || '',
    countryCode: defaults.code,
    country: settings.country || defaults.name,
    language: settings.language || defaults.language,
    currency: settings.currency || state?.company?.currency || defaults.currency,
    timezone: settings.timezone || state?.company?.timezone || defaults.timezone,
    defaultVat: settings.default_vat_percent ?? defaults.defaultVat,
    weekStartsOn: settings.week_starts_on || defaults.weekStartsOn,
    targetGp: settings.target_gp_percent ?? 75,
    departments: (state?.departments || []).map((department) => ({ id: department.id, name: department.name })),
    regionalOverrides: regionalOverridesFromSettings(settings),
  };
}

function stepFromState(state) {
  const savedStep = state?.company?.onboarding_step;
  return ['business', 'regional', 'financial', 'departments', 'review'].includes(savedStep) ? savedStep : 'business';
}

function Field({ children, error, label }) {
  return (
    <label className="onboarding-field">
      <span>{label}</span>
      {children}
      {error && <small>{error}</small>}
    </label>
  );
}

function ReviewItem({ label, value }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

export default function OnboardingWizard({ membership = null, onCompleted, onSignOut, onWorkspaceCreated, user }) {
  const [workspaceId, setWorkspaceId] = useState('');
  const companyId = membership?.company_id || workspaceId;
  const [draft, setDraft] = useState(initialDraft);
  const [step, setStep] = useState(companyId ? 'regional' : 'account');
  const [loading, setLoading] = useState(Boolean(companyId));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [submittedStep, setSubmittedStep] = useState('');

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    loadCustomerOnboardingState(companyId)
      .then((state) => {
        if (cancelled) return;
        setDraft(draftFromState(state));
        setStep(stepFromState(state));
      })
      .catch((error) => {
        if (!cancelled) setStatus(error.message || 'Could not load onboarding progress.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const errors = useMemo(() => (submittedStep ? validateOnboardingDraft(draft, submittedStep) : {}), [draft, submittedStep]);
  const stepIndex = STEP_ORDER.indexOf(step);

  const updateDraft = (patch) => {
    setDraft((current) => ({ ...current, ...patch }));
    setStatus('');
  };

  const updateRegionalField = (field, value) => {
    updateDraft({
      [field]: value,
      regionalOverrides: { ...draft.regionalOverrides, [field]: true },
    });
  };

  const changeCountry = (countryCode) => {
    updateDraft(nextRegionalDraft(draft, countryCode, draft.regionalOverrides));
  };

  const saveProgress = async (nextStep) => {
    await saveCustomerOnboardingProgress(companyId, nextStep, draft);
    setStep(nextStep);
  };

  const next = async () => {
    const validationStep = step === 'business' ? 'business' : step;
    const validationErrors = validateOnboardingDraft(draft, validationStep);
    setSubmittedStep(validationStep);
    if (Object.keys(validationErrors).length) return;

    setBusy(true);
    setStatus('');
    try {
      if (step === 'account') {
        setStep('business');
      } else if (step === 'business') {
        if (!companyId) {
          const onboarding = await beginCustomerOnboarding(draft);
          setWorkspaceId(onboarding.company_id || '');
          await onWorkspaceCreated?.();
          setStep('regional');
        } else {
          await saveProgress('regional');
        }
      } else if (step === 'regional') {
        await saveProgress('financial');
      } else if (step === 'financial') {
        await saveProgress('departments');
      } else if (step === 'departments') {
        await saveCustomerOnboardingDepartments(companyId, draft.departments);
        setStep('review');
      } else if (step === 'review') {
        await completeCustomerOnboarding(companyId);
        await onCompleted?.();
      }
      setSubmittedStep('');
    } catch (error) {
      setStatus(error.message || 'Could not save your onboarding progress. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    const previous = STEP_ORDER[Math.max(0, stepIndex - 1)];
    setSubmittedStep('');
    setStatus('');
    setStep(previous);
  };

  const addDepartment = () => updateDraft({ departments: [...draft.departments, { id: `draft-${Date.now()}`, name: '' }] });
  const changeDepartment = (index, name) => updateDraft({
    departments: draft.departments.map((department, departmentIndex) => (
      departmentIndex === index ? { ...department, name } : department
    )),
  });
  const removeDepartment = (index) => updateDraft({ departments: draft.departments.filter((_, departmentIndex) => departmentIndex !== index) });

  if (loading) {
    return (
      <div className="onboarding-shell">
        <div className="onboarding-card onboarding-loading"><LoaderCircle aria-hidden="true" size={22} /> Loading onboarding...</div>
      </div>
    );
  }

  return (
    <main className="onboarding-shell">
      <section className="onboarding-card">
        <header className="onboarding-header">
          <img alt="MarginFlow" className="onboarding-logo" src={marginflowLogo} />
          <div>
            <p className="onboarding-eyebrow">Welcome to MarginFlow</p>
            <h1>Set up your workspace</h1>
            <p>{user?.email || 'Your account'} will own this workspace.</p>
          </div>
        </header>

        <ol className="onboarding-progress" aria-label="Onboarding progress">
          {STEP_ORDER.map((item, index) => {
            const complete = index < stepIndex;
            const current = item === step;
            return (
              <li className={`${complete ? 'complete' : ''} ${current ? 'current' : ''}`.trim()} key={item}>
                <span>{complete ? <Check aria-hidden="true" size={13} /> : index + 1}</span>
                <strong>{STEP_LABELS[item]}</strong>
              </li>
            );
          })}
        </ol>

        <div className="onboarding-content">
          {step === 'account' && (
            <>
              <div className="onboarding-title"><h2>Your account</h2><p>Confirm the account that will own this workspace before adding business details.</p></div>
              <div className="onboarding-account-summary">
                <span>Name</span><strong>{user?.user_metadata?.full_name || user?.user_metadata?.name || 'MarginFlow customer'}</strong>
                <span>Email</span><strong>{user?.email || 'Not available'}</strong>
              </div>
            </>
          )}
          {step === 'business' && (
            <>
              <div className="onboarding-title"><h2>Tell us about your business</h2><p>These details start your workspace and can be refined later.</p></div>
              <div className="onboarding-grid">
                <Field error={errors.companyName} label="Company name">
                  <input autoFocus value={draft.companyName} onChange={(event) => updateDraft({ companyName: event.target.value })} placeholder="Restaurant ABC" />
                </Field>
                <Field error={errors.country} label="Country">
                  <select value={draft.countryCode} onChange={(event) => changeCountry(event.target.value)}>
                    {COUNTRY_OPTIONS.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}
                  </select>
                </Field>
              </div>
            </>
          )}

          {step === 'regional' && (
            <>
              <div className="onboarding-title"><h2>Confirm regional settings</h2><p>Country suggestions are editable and will not replace values you change manually.</p></div>
              <div className="onboarding-grid">
                <Field error={errors.language} label="Language">
                  <select value={draft.language} onChange={(event) => updateRegionalField('language', event.target.value)}><option value="en">English</option><option value="pt">Portuguese</option></select>
                </Field>
                <Field error={errors.currency} label="Currency">
                  <select value={draft.currency} onChange={(event) => updateRegionalField('currency', event.target.value)}>{CURRENCIES.map((currency) => <option key={currency}>{currency}</option>)}</select>
                </Field>
                <Field error={errors.timezone} label="Timezone">
                  <select value={draft.timezone} onChange={(event) => updateRegionalField('timezone', event.target.value)}>{[...new Set([draft.timezone, ...TIMEZONES])].map((timezone) => <option key={timezone}>{timezone}</option>)}</select>
                </Field>
                <Field error={errors.defaultVat} label="Default VAT %">
                  <input max="100" min="0" step="0.01" type="number" value={draft.defaultVat} onChange={(event) => updateRegionalField('defaultVat', event.target.value)} />
                </Field>
                <Field error={errors.weekStartsOn} label="Week starts on">
                  <select value={draft.weekStartsOn} onChange={(event) => updateRegionalField('weekStartsOn', event.target.value)}><option>Monday</option><option>Sunday</option></select>
                </Field>
              </div>
            </>
          )}

          {step === 'financial' && (
            <>
              <div className="onboarding-title"><h2>Set your target GP</h2><p>This is a company default. Individual departments can be adjusted later.</p></div>
              <div className="onboarding-grid single">
                <Field error={errors.targetGp} label="Default target GP %">
                  <input autoFocus max="100" min="0" step="0.01" type="number" value={draft.targetGp} onChange={(event) => updateDraft({ targetGp: event.target.value })} />
                </Field>
              </div>
            </>
          )}

          {step === 'departments' && (
            <>
              <div className="onboarding-title"><h2>Create your departments</h2><p>Use the departments that match your operation. You can manage them later in Settings.</p></div>
              <div className="onboarding-departments">
                {draft.departments.map((department, index) => (
                  <div className="onboarding-department" key={department.id || index}>
                    <input aria-label={`Department ${index + 1}`} autoFocus={index === draft.departments.length - 1} value={department.name} onChange={(event) => changeDepartment(index, event.target.value)} placeholder="Department name" />
                    <button aria-label={`Remove ${department.name || 'department'}`} className="icon-button" onClick={() => removeDepartment(index)} title="Remove department" type="button"><Trash2 size={16} /></button>
                  </div>
                ))}
                <button className="secondary-button onboarding-add" onClick={addDepartment} type="button"><Plus size={16} /> Add department</button>
                {errors.departments && <small className="onboarding-inline-error">{errors.departments}</small>}
              </div>
            </>
          )}

          {step === 'review' && (
            <>
              <div className="onboarding-title"><h2>Review your workspace</h2><p>Start MarginFlow to activate your 14-day Pro trial.</p></div>
              <div className="onboarding-review">
                <ReviewItem label="Company" value={draft.companyName} />
                <ReviewItem label="Country" value={draft.country} />
                <ReviewItem label="Language" value={draft.language === 'pt' ? 'Portuguese' : 'English'} />
                <ReviewItem label="Currency" value={draft.currency} />
                <ReviewItem label="Timezone" value={draft.timezone} />
                <ReviewItem label="VAT" value={`${draft.defaultVat}%`} />
                <ReviewItem label="Week starts" value={draft.weekStartsOn} />
                <ReviewItem label="Target GP" value={`${draft.targetGp}%`} />
                <div className="onboarding-review-departments"><span>Departments</span>{draft.departments.map((department) => <strong key={department.id || department.name}>{department.name}</strong>)}</div>
              </div>
            </>
          )}
        </div>

        {status && <div className="onboarding-status error">{status}</div>}
        <footer className="onboarding-actions">
          <div>{step !== 'account' && <button className="secondary-button" disabled={busy} onClick={back} type="button"><ChevronLeft size={16} /> Back</button>}</div>
          <div>
            <button className="text-button" disabled={busy} onClick={onSignOut} type="button">Sign out</button>
            <button disabled={busy} onClick={next} type="button">
              {busy && <LoaderCircle className="spin" size={16} />}
              {step === 'review' ? 'Start MarginFlow' : 'Continue'}
            </button>
          </div>
        </footer>
      </section>
    </main>
  );
}
