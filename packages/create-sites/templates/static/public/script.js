/* global document */

const button = document.querySelector('[data-action="greet"]');
const status = document.querySelector('[data-status]');

button?.addEventListener('click', () => {
  if (status) status.textContent = 'Your static Site is interactive.';
});
