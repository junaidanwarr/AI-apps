const docInput = document.getElementById('docInput');
const statusPanel = document.getElementById('statusPanel');
const statusSummary = document.getElementById('statusSummary');
const establishmentList = document.getElementById('establishmentList');
const startAutomationButton = document.getElementById('startAutomation');
const clearDataButton = document.getElementById('clearData');
const message = document.getElementById('message');

let parsedEstablishments = [];

const ECONOMIC_ACTIVITY_RULES = [
  { keywords: ['school', 'academy', 'college', 'university', 'training'], activity: 'Education' },
  { keywords: ['restaurant', 'cafe', 'food', 'hotel', 'bakery'], activity: 'Hospitality' },
  { keywords: ['textile', 'factory', 'manufacturing', 'mill', 'production'], activity: 'Manufacturing' },
  { keywords: ['construction', 'builder', 'contractor', 'civil'], activity: 'Construction' },
  { keywords: ['clinic', 'hospital', 'pharmacy', 'medical'], activity: 'Healthcare' },
  { keywords: ['retail', 'store', 'shop', 'mart'], activity: 'Retail' },
  { keywords: ['service', 'consultancy', 'agency', 'office'], activity: 'Services' }
];

const UNIT_TYPE_MAP = {
  Education: 'Commercial',
  Hospitality: 'Commercial',
  Retail: 'Commercial',
  Healthcare: 'Commercial',
  Services: 'Commercial',
  Manufacturing: 'Industrial',
  Construction: 'Industrial'
};

const SEASONAL_RULES = [
  { keywords: ['ice cream', 'summer camp', 'seasonal'], value: 'Seasonal' },
  { keywords: ['academy', 'private school', 'college', 'university'], value: 'Whole Time' }
];

const SUBZONE_MEDICAL_UNIT_MAP = {
  charsadda: {
    zone: 'Mardan Zone',
    medicalUnit: 'Medicare Centre Charsadda'
  },
  peshawar: {
    zone: 'Peshawar Zone',
    medicalUnit: 'Lady Reading Hospital'
  },
  mardan: {
    zone: 'Mardan Zone',
    medicalUnit: 'District Headquarters Hospital Mardan'
  },
  swabi: {
    zone: 'Mardan Zone',
    medicalUnit: 'Bacha Khan Medical Complex'
  }
};

const normalize = value => value.toLowerCase().trim();

const findEndOfCentralDirectory = data => {
  const signature = 0x06054b50;
  const maxCommentLength = 0xffff;
  const minOffset = Math.max(0, data.length - (22 + maxCommentLength));
  for (let i = data.length - 22; i >= minOffset; i -= 1) {
    if (data[i] === 0x50 && data[i + 1] === 0x4b && data[i + 2] === 0x05 && data[i + 3] === 0x06) {
      return i;
    }
  }
  return -1;
};

const extractDocxText = async arrayBuffer => {
  const data = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const eocdIndex = findEndOfCentralDirectory(data);
  if (eocdIndex === -1) {
    throw new Error('Unable to read DOCX structure.');
  }

  const centralDirectoryOffset = view.getUint32(eocdIndex + 16, true);
  let offset = centralDirectoryOffset;
  let documentEntry = null;

  while (offset < data.length) {
    const signature = view.getUint32(offset, true);
    if (signature !== 0x02014b50) break;
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraFieldLength = view.getUint16(offset + 30, true);
    const fileCommentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const fileNameBytes = data.slice(offset + 46, offset + 46 + fileNameLength);
    const fileName = new TextDecoder().decode(fileNameBytes);

    if (fileName === 'word/document.xml') {
      documentEntry = {
        localHeaderOffset,
        compressedSize
      };
      break;
    }

    offset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  if (!documentEntry) {
    throw new Error('word/document.xml not found in DOCX.');
  }

  const localHeaderOffset = documentEntry.localHeaderOffset;
  const localSignature = view.getUint32(localHeaderOffset, true);
  if (localSignature !== 0x04034b50) {
    throw new Error('Invalid DOCX file header.');
  }

  const compressionMethod = view.getUint16(localHeaderOffset + 8, true);
  const fileNameLength = view.getUint16(localHeaderOffset + 26, true);
  const extraFieldLength = view.getUint16(localHeaderOffset + 28, true);
  const dataStart = localHeaderOffset + 30 + fileNameLength + extraFieldLength;
  const compressedData = data.slice(dataStart, dataStart + documentEntry.compressedSize);

  let xmlBuffer;
  if (compressionMethod === 0) {
    xmlBuffer = compressedData;
  } else if (compressionMethod === 8) {
    const stream = new DecompressionStream('deflate-raw');
    const decompressedStream = new Response(compressedData).body.pipeThrough(stream);
    xmlBuffer = new Uint8Array(await new Response(decompressedStream).arrayBuffer());
  } else {
    throw new Error('Unsupported DOCX compression.');
  }

  const xmlText = new TextDecoder('utf-8').decode(xmlBuffer);
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
  const textNodes = Array.from(xmlDoc.getElementsByTagName('w:t'));
  const paragraphs = Array.from(xmlDoc.getElementsByTagName('w:p'));

  if (textNodes.length === 0) {
    throw new Error('No text found in DOCX file.');
  }

  const paragraphTexts = paragraphs.map(paragraph => {
    const runs = Array.from(paragraph.getElementsByTagName('w:t'));
    return runs.map(run => run.textContent).join(' ');
  });

  return paragraphTexts.join('\n');
};

const setMessage = (text, type = '') => {
  message.textContent = text;
  message.className = type;
};

const getEconomicActivity = text => {
  const lower = text.toLowerCase();
  const match = ECONOMIC_ACTIVITY_RULES.find(rule =>
    rule.keywords.some(keyword => lower.includes(keyword))
  );
  return match ? match.activity : 'Others';
};

const getUnitType = activity => UNIT_TYPE_MAP[activity] || 'Commercial';

const getSeasonalType = text => {
  const lower = text.toLowerCase();
  const match = SEASONAL_RULES.find(rule =>
    rule.keywords.some(keyword => lower.includes(keyword))
  );
  return match ? match.value : 'Whole Time';
};

const findSubzone = text => {
  const lower = text.toLowerCase();
  const subzones = Object.keys(SUBZONE_MEDICAL_UNIT_MAP);
  const match = subzones.find(subzone => lower.includes(subzone));
  return match || '';
};

const deriveZoneAndMedicalUnit = subzone => {
  if (!subzone) {
    return { zone: '', medicalUnit: '' };
  }
  const entry = SUBZONE_MEDICAL_UNIT_MAP[normalize(subzone)];
  return entry
    ? { zone: entry.zone, medicalUnit: entry.medicalUnit }
    : { zone: '', medicalUnit: '' };
};

const cleanAddress = value => {
  if (!value) return '';
  return value
    .replace(/name of unit.*?:/i, '')
    .replace(/name of establishment.*?:/i, '')
    .replace(/employer.*?:/i, '')
    .replace(/designation.*?:/i, '')
    .trim();
};

const extractDocTextFallback = arrayBuffer => {
  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(arrayBuffer));
  return decoded.replace(/[^\x20-\x7E\n\r\t]/g, ' ');
};

const parseBlock = block => {
  const lines = block
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return null;
  }

  const joined = lines.join(' ');

  const nameMatch = joined.match(/(name of unit|name of establishment|establishment name)\s*[:\-]\s*(.*)/i);
  const addressMatch = joined.match(/address\s*[:\-]\s*(.*)/i);
  const locationMatch = joined.match(/(location|district|subzone|sub zone)\s*[:\-]\s*(.*)/i);

  const name = nameMatch ? nameMatch[2].trim() : lines[0];
  const addressLine = addressMatch ? addressMatch[1].trim() : lines.slice(1).join(' ');
  const locationLine = locationMatch ? locationMatch[2].trim() : joined;

  const subzone = findSubzone(locationLine) || findSubzone(addressLine);
  const { zone, medicalUnit } = deriveZoneAndMedicalUnit(subzone);
  const economicActivity = getEconomicActivity(joined);

  return {
    establishmentName: name,
    employerName: 'Nil',
    contactNo: 'Nil',
    zone,
    subzone: subzone ? subzone[0].toUpperCase() + subzone.slice(1) : '',
    economicActivity,
    unitType: getUnitType(economicActivity),
    seasonalType: getSeasonalType(joined),
    nearestMedicalUnit: medicalUnit,
    address: cleanAddress(addressLine)
  };
};

const parseEstablishmentsFromText = text => {
  const blocks = text
    .split(/\n\s*\n/)
    .map(block => block.trim())
    .filter(Boolean);

  const entries = blocks
    .map(parseBlock)
    .filter(entry => entry && entry.establishmentName);

  return entries;
};

const renderEstablishments = entries => {
  establishmentList.innerHTML = '';
  entries.forEach(entry => {
    const li = document.createElement('li');
    li.textContent = `${entry.establishmentName} • ${entry.subzone || 'Unknown subzone'} • ${
      entry.economicActivity
    }`;
    establishmentList.appendChild(li);
  });

  statusSummary.textContent = `${entries.length} establishment${
    entries.length === 1 ? '' : 's'
  } ready for automation.`;

  statusPanel.hidden = entries.length === 0;
};

const resetState = () => {
  parsedEstablishments = [];
  renderEstablishments([]);
  startAutomationButton.disabled = true;
  clearDataButton.disabled = true;
  setMessage('');
};

const handleDocUpload = async file => {
  if (!file) return;

  setMessage('Parsing document...');

  try {
    const arrayBuffer = await file.arrayBuffer();
    const isDocx = file.name.toLowerCase().endsWith('.docx');
    const text = isDocx ? await extractDocxText(arrayBuffer) : extractDocTextFallback(arrayBuffer);
    parsedEstablishments = parseEstablishmentsFromText(text);

    if (parsedEstablishments.length === 0) {
      setMessage('No establishments found. Check the document format.', 'error');
      resetState();
      return;
    }

    renderEstablishments(parsedEstablishments);
    startAutomationButton.disabled = false;
    clearDataButton.disabled = false;
    if (!isDocx) {
      setMessage('DOC parsed with fallback mode. For better results, convert to .docx.', 'success');
    } else {
      setMessage('Document parsed successfully.', 'success');
    }
  } catch (error) {
    setMessage(`Failed to parse document: ${error.message}`, 'error');
    resetState();
  }
};

const sendAutomationRequest = async () => {
  setMessage('Sending automation request...');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.id) {
    setMessage('No active tab found.', 'error');
    return;
  }

  chrome.tabs.sendMessage(
    tab.id,
    {
      type: 'LMIS_AUTOMATION_START',
      payload: {
        establishments: parsedEstablishments
      }
    },
    response => {
      if (chrome.runtime.lastError) {
        setMessage('Unable to reach the LMIS page. Please open the LMIS portal.', 'error');
        return;
      }

      if (response?.status === 'started') {
        setMessage('Automation started. Keep the LMIS tab active.', 'success');
        return;
      }

      setMessage('Automation request sent, awaiting response.', 'success');
    }
  );
};

docInput.addEventListener('change', event => {
  const [file] = event.target.files;
  handleDocUpload(file);
});

startAutomationButton.addEventListener('click', () => {
  if (!parsedEstablishments.length) {
    setMessage('Please upload a document first.', 'error');
    return;
  }
  sendAutomationRequest();
});

clearDataButton.addEventListener('click', () => {
  docInput.value = '';
  resetState();
});

resetState();
