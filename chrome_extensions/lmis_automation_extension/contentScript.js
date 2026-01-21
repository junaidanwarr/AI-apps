const LMIS_CREDENTIALS = {
  email: 'junaidanwarlmkt@gmail.com',
  password: 'essilmis'
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const waitForElement = async (selector, { timeout = 15000 } = {}) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const element = document.querySelector(selector);
    if (element) return element;
    await sleep(300);
  }
  return null;
};

const setInputValue = (input, value) => {
  if (!input) return;
  input.focus();
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
};

const clickByText = (selector, text) => {
  const elements = Array.from(document.querySelectorAll(selector));
  const match = elements.find(el => el.textContent?.trim().includes(text));
  if (match) {
    match.click();
    return true;
  }
  return false;
};

const findFieldByLabel = labelText => {
  const labels = Array.from(document.querySelectorAll('label'));
  const label = labels.find(l => l.textContent?.toLowerCase().includes(labelText.toLowerCase()));
  if (!label) return null;
  const forId = label.getAttribute('for');
  if (forId) {
    return document.getElementById(forId);
  }
  return label.querySelector('input, select, textarea') || label.parentElement?.querySelector('input, select, textarea');
};

const selectOptionByText = (selectElement, optionText) => {
  if (!selectElement) return false;
  const options = Array.from(selectElement.options || []);
  const option = options.find(opt => opt.textContent?.trim().toLowerCase() === optionText.toLowerCase());
  if (option) {
    selectElement.value = option.value;
    selectElement.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  return false;
};

const selectCustomDropdown = async (labelText, optionText) => {
  const field = findFieldByLabel(labelText);
  if (!field) return false;
  field.click();
  await sleep(300);
  const options = Array.from(document.querySelectorAll('li, div'));
  const match = options.find(option => option.textContent?.trim().toLowerCase() === optionText.toLowerCase());
  if (match) {
    match.click();
    return true;
  }
  return false;
};

const ensureLoggedIn = async () => {
  const emailInput = document.querySelector('input[type="email"], input[name*="email"], input[placeholder*="Email" i]');
  const passwordInput = document.querySelector('input[type="password"], input[name*="password"], input[placeholder*="Password" i]');

  if (emailInput && passwordInput) {
    setInputValue(emailInput, LMIS_CREDENTIALS.email);
    setInputValue(passwordInput, LMIS_CREDENTIALS.password);
    clickByText('button, input[type="submit"]', 'Login');
    await sleep(2000);
  }
};

const navigateToEstablishment = async () => {
  await waitForElement('body');
  await sleep(1500);
  clickByText('a, button, span', 'Establishment');
  await sleep(1200);
  clickByText('a, button', 'Create Establishment');
  clickByText('a, button', '+ Create Establishment');
  await sleep(1500);
};

const fillTextField = (label, value) => {
  const field = findFieldByLabel(label);
  if (field) {
    setInputValue(field, value);
    return true;
  }
  return false;
};

const setDropdownValue = async (label, value) => {
  const field = findFieldByLabel(label);
  if (!field) return false;
  if (field.tagName.toLowerCase() === 'select') {
    return selectOptionByText(field, value);
  }
  return selectCustomDropdown(label, value);
};

const fillEstablishmentForm = async entry => {
  fillTextField('Name of Unit', entry.establishmentName);
  fillTextField('Name of Establishment', entry.establishmentName);
  fillTextField('Name of Employer', entry.employerName || 'Nil');
  fillTextField('Contact', entry.contactNo || 'Nil');
  fillTextField('Address', entry.address);

  if (entry.zone) {
    await setDropdownValue('Zone', entry.zone);
  }
  if (entry.subzone) {
    await setDropdownValue('Subzone', entry.subzone);
  }
  if (entry.economicActivity) {
    await setDropdownValue('Economic Activity', entry.economicActivity);
  }
  if (entry.unitType) {
    await setDropdownValue('Unit Type', entry.unitType);
  }
  if (entry.seasonalType) {
    await setDropdownValue('Seasonal', entry.seasonalType);
    await setDropdownValue('Whole', entry.seasonalType);
  }
  if (entry.nearestMedicalUnit) {
    await setDropdownValue('Nearest Medical Unit', entry.nearestMedicalUnit);
  }

  const activeCheckbox = findFieldByLabel('Active') || document.querySelector('input[type="checkbox"][name*="active" i]');
  if (activeCheckbox && !activeCheckbox.checked) {
    activeCheckbox.click();
  }
};

const submitForm = async () => {
  const submitted = clickByText('button, input[type="submit"]', 'Submit');
  if (submitted) {
    await sleep(2000);
  }
};

const runAutomation = async establishments => {
  if (!Array.isArray(establishments) || establishments.length === 0) {
    return { status: 'no_entries' };
  }

  await ensureLoggedIn();

  for (const entry of establishments) {
    await navigateToEstablishment();
    await fillEstablishmentForm(entry);
    await submitForm();
    await sleep(2000);
  }

  return { status: 'completed' };
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'LMIS_AUTOMATION_START') {
    runAutomation(message.payload.establishments)
      .then(() => sendResponse({ status: 'started' }))
      .catch(error => sendResponse({ status: 'error', error: error.message }));
    return true;
  }
  return false;
});
