// Core parsing helpers (shared by client + server)

export function splitCustomerNumberAndName(value) {
  const s = String(value ?? '').trim();
  if (!s) return { customer_number: '', name: '' };

  // Typical: "12345. Händlername" or "12345.Händlername"
  const dotIdx = s.indexOf('.');
  if (dotIdx > 0) {
    const left = s.slice(0, dotIdx).trim();
    const right = s.slice(dotIdx + 1).trim();
    return {
      customer_number: left.replace(/\s+/g, ''),
      name: right
    };
  }

  // Fallback: number then space then name
  const m = s.match(/^(\d+)\s+(.+)$/);
  if (m) {
    return { customer_number: m[1], name: m[2].trim() };
  }

  // If only a number
  if (/^\d+$/.test(s)) return { customer_number: s, name: '' };

  return { customer_number: '', name: s };
}

export function splitStreetAndHouseNumber(value) {
  const s = String(value ?? '').trim();
  if (!s) return { street: '', house_number: '' };

  // Some addresses include comma separation
  const comma = s.split(',').map(x => x.trim()).filter(Boolean);
  if (comma.length >= 2) {
    // often: "Street 12, ..." -> keep first chunk, still try to split
    const first = comma[0];
    const res = splitStreetAndHouseNumber(first);
    if (res.street) return res;
  }

  // Try: "Streetname 12a" / "Streetname 12-14" / "Streetname 12/1"
  const m = s.match(/^(.*?)(?:\s+)(\d+[a-zA-Z]?(?:[\/-]\d+[a-zA-Z]?)?)$/);
  if (m) {
    return { street: m[1].trim(), house_number: m[2].trim() };
  }

  // Try: "Streetname 12 a" (space before letter)
  const m2 = s.match(/^(.*?)(?:\s+)(\d+)\s*([a-zA-Z])$/);
  if (m2) {
    return { street: m2[1].trim(), house_number: `${m2[2]}${m2[3]}` };
  }

  return { street: s, house_number: '' };
}

export function normalizePostalCode(value, countryCode) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  // keep digits only if it looks numeric-ish (some sheets format as number)
  const digits = raw.replace(/\s+/g, '').match(/^\d+$/) ? raw.replace(/\D/g, '') : raw;

  const expected = countryCode === 'DE' ? 5 : (countryCode === 'AT' ? 4 : (countryCode === 'CH' ? 4 : null));
  if (expected && /^\d+$/.test(digits) && digits.length < expected) {
    return digits.padStart(expected, '0');
  }
  return String(digits).trim();
}

export function normalizeRow({ a, b, c, d, countryCode }) {
  const { customer_number, name } = splitCustomerNumberAndName(a);
  const { street, house_number } = splitStreetAndHouseNumber(b);

  // User said: C is PLZ, (probably D is Ort). Some sheets might be shifted.
  let postal = c;
  let city = d;

  // If D empty but C contains letters, swap
  if ((!city || String(city).trim() === '') && /[a-zA-ZäöüÄÖÜ]/.test(String(postal ?? ''))) {
    city = postal;
    postal = '';
  }

  // If C looks like postal code and D is empty, keep; else if C empty and D looks postal, swap
  if ((!postal || String(postal).trim() === '') && /^\d{3,6}$/.test(String(city ?? '').trim())) {
    postal = city;
    city = '';
  }

  const postal_code = normalizePostalCode(postal, countryCode);

  return {
    country_code: countryCode,
    customer_number: String(customer_number ?? '').trim(),
    name: String(name ?? '').trim(),
    street: String(street ?? '').trim(),
    house_number: String(house_number ?? '').trim(),
    postal_code,
    city: String(city ?? '').trim(),
  };
}

export function looksLikeHeaderRow(row) {
  const s = row.map(v => String(v ?? '').toLowerCase()).join(' | ');
  return (
    s.includes('kund') ||
    s.includes('kunden') ||
    s.includes('straße') ||
    s.includes('strasse') ||
    s.includes('plz') ||
    s.includes('ort')
  );
}
