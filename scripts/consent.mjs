/**
 * Record the answer to the one telemetry question.
 *
 * Usage:
 *     node consent.mjs status    # granted | denied | unset
 *     node consent.mjs on
 *     node consent.mjs off
 *
 * Until someone runs this with `on`, nothing is ever sent. `unset` and `denied`
 * behave identically; they differ only so /throughline:start knows whether the
 * question has already been asked.
 */

import { consentState, setConsent, CONFIG_PATH } from './telemetry.mjs';

const arg = (process.argv[2] ?? 'status').trim().toLowerCase();

if (arg === 'status') {
  console.log(consentState());
} else if (['on', 'yes', 'true', '1'].includes(arg)) {
  setConsent(true);
  console.log(`granted — recorded in ${CONFIG_PATH}`);
} else if (['off', 'no', 'false', '0'].includes(arg)) {
  setConsent(false);
  console.log(`denied — recorded in ${CONFIG_PATH}`);
} else {
  console.error(`unknown argument: ${arg}\nusage: node consent.mjs status|on|off`);
  process.exit(1);
}
