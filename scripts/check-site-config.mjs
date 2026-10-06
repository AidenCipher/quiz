// Fails when the public business details are missing, so a deploy can't ship legal pages without an operator.
const required = ['VITE_OPERATOR_NAME', 'VITE_OPERATOR_ADDRESS', 'VITE_OPERATOR_COUNTRY', 'VITE_CONTACT_EMAIL'];
const missing = required.filter((k) => !process.env[k]?.trim());
if (missing.length) {
  console.error(
    `Missing business details: ${missing.join(', ')}.\nSet them as GitHub repository variables (OPERATOR_NAME, OPERATOR_ADDRESS, OPERATOR_COUNTRY, CONTACT_EMAIL).`,
  );
  process.exit(1);
}
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(process.env.VITE_CONTACT_EMAIL)) {
  console.error('VITE_CONTACT_EMAIL is not a valid email address.');
  process.exit(1);
}
console.log('Business details present.');
