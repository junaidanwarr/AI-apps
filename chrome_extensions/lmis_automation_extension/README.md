# LMIS Establishment Automation Extension

This Chrome extension automates LMIS establishment creation from Word documents.

## Features

- Upload `.doc` or `.docx` documents to parse establishment entries.
- Smart field detection for economic activity, unit type, seasonal status, and subzone/medical unit mapping.
- Automated login, navigation, and form submission on the LMIS portal.

## Usage

1. Load the extension folder (`chrome_extensions/lmis_automation_extension`) as an unpacked extension.
2. Open `https://lmis.labourmisessirfid.kp.gov.pk` in Chrome.
3. Open the extension popup and upload your Word document.
4. Click **Start Automation** and keep the LMIS tab active.

## Notes

- `.docx` parsing uses browser-native decompression; `.doc` parsing runs in fallback mode and may need cleanup.
- Update `SUBZONE_MEDICAL_UNIT_MAP` in `popup.js` to expand zone and medical unit coverage.
