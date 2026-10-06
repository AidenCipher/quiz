/**
 * Public business details, set at build time (see README → Deploy). Nothing is invented here:
 * anything not configured is shown as "not provided" and the deploy pipeline refuses to ship without it.
 */
const v = (k: string) => (import.meta.env[k] as string | undefined)?.trim() || '';

export const site = {
  name: 'Quiz Arena',
  operator: v('VITE_OPERATOR_NAME'),
  address: v('VITE_OPERATOR_ADDRESS'),
  country: v('VITE_OPERATOR_COUNTRY'),
  email: v('VITE_CONTACT_EMAIL'),
  /** Bump when the policies change materially. */
  policiesUpdated: '6 October 2026',
  retention: { resultsDays: 30, sessionDays: 30 },
};

export const missingBusinessDetails = (): string[] =>
  (
    [
      ['operator name', site.operator],
      ['postal address', site.address],
      ['country', site.country],
      ['contact email', site.email],
    ] as const
  )
    .filter(([, value]) => !value)
    .map(([label]) => label);
