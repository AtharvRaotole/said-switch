/**
 * The only text the coding worker receives.
 * Agreement id, scope, terms, allowed paths, and the dark-mode checklist.
 */
export function buildWorkerPrompt(input: { agreementId: string; scope: string; terms: string }): string {
  return [
    `Agreement id: ${input.agreementId}`,
    `Scope: ${input.scope}`,
    `Terms: ${input.terms}`,
    '',
    'Allowed paths:',
    'src/**/*.tsx',
    'src/**/*.ts',
    'src/**/*.css',
    'index.html',
    '',
    'Dark mode checklist:',
    '- accessible toggle',
    '- keyboard operable',
    '- persists in localStorage',
    '- covers hero, pricing, footer, and background',
    '- readable contrast',
    '- focus rings visible',
  ].join('\n');
}

export function commitSubject(scope: string, agreementId: string, jobId: string): string {
  return `said: ${scope.replace(/\s+/g, ' ').trim()} (${agreementId}, ${jobId})`;
}
