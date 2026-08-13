const ACTIVE_ACCESS_STATUSES = new Set(['active', 'trialing']);

export function getEffectiveSubscriptionStatus(subscription, now = new Date()) {
  if (!subscription) return 'expired';

  if (
    subscription.status === 'trialing' &&
    subscription.trialEndsAt &&
    new Date(subscription.trialEndsAt).getTime() <= now.getTime()
  ) {
    return 'expired';
  }

  return subscription.status;
}

export function resolveCompanyEntitlements({
  subscription,
  planFeatureKeys = [],
  trialPlanFeatureKeys = [],
  customFeatureKeys = [],
  now = new Date(),
}) {
  const effectiveStatus = getEffectiveSubscriptionStatus(subscription, now);
  const trialIsValid =
    subscription?.status === 'trialing' &&
    subscription.trialEndsAt &&
    new Date(subscription.trialEndsAt).getTime() > now.getTime();
  const effectivePlanFeatureKeys = trialIsValid ? trialPlanFeatureKeys : planFeatureKeys;

  return {
    effectiveStatus,
    trialIsValid: Boolean(trialIsValid),
    writeAccess: ACTIVE_ACCESS_STATUSES.has(effectiveStatus) &&
      (effectiveStatus !== 'trialing' || Boolean(trialIsValid)),
    featureKeys: [...new Set([...effectivePlanFeatureKeys, ...customFeatureKeys])].sort(),
  };
}

export function hasEffectiveFeature(entitlements, featureKey) {
  return Boolean(entitlements?.featureKeys?.includes(featureKey));
}
