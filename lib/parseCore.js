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

  const compact = raw.replace(/\s+/g, '');
  const digitsOnly = /^\d+$/.test(compact) ? compact : raw;

  const expected =
    countryCode === 'DE' ? 5 :
    countryCode === 'AT' ? 4 :
    countryCode === 'CH' ? 4 :
    null;

  if (expected && /^\d+$/.test(digitsOnly) && digitsOnly.length < expected) {
    return digitsOnly.padStart(expected, '0');
  }
  return String(digitsOnly).trim();
}

// NEW: Normalize a row based on mapped fields (flexible column mapping)
export function normalizeMappedRow({ customer_number, name, street, postal_code, city, countryCode }) {
  let cn = String(customer_number ?? '').trim();
  let nm = String(name ?? '').trim();

  // If customer number column actually contains "123. Name" or "123 Name" -> split
  if (cn && !nm) {
    const sp = splitCustomerNumberAndName(cn);
    if (sp.customer_number && sp.name) {
      cn = sp.customer_number;
      nm = sp.name;
    }
  }

  // If no customer number provided but name looks like "123. Name" -> split
  if (!cn && nm) {
    const sp = splitCustomerNumberAndName(nm);
    if (sp.customer_number) {
      cn = sp.customer_number;
      nm = sp.name || nm;
    }
  }

  const addr = splitStreetAndHouseNumber(street);

  return {
    country_code: countryCode,
    customer_number: String(cn ?? '').trim(),
    name: String(nm ?? '').trim(),
    street: String(addr.street ?? '').trim(),
    house_number: String(addr.house_number ?? '').trim(),
    postal_code: normalizePostalCode(postal_code, countryCode),
    city: String(city ?? '').trim(),
  };
}

export function looksLikeHeaderRow(row) {
  const s = row.map(v => String(v ?? '').toLowerCase()).join(' | ');
  return (
    s.includes('kund') ||
    s.includes('kunden') ||
    s.includes('customer') ||
    s.includes('kunde') ||
    s.includes('name') ||
    s.includes('firma') ||
    s.includes('straße') ||
    s.includes('strasse') ||
    s.includes('street') ||
    s.includes('adresse') ||
    s.includes('address') ||
    s.includes('plz') ||
    s.includes('post') ||
    s.includes('zip') ||
    s.includes('postal') ||
    s.includes('ort') ||
    s.includes('stadt') ||
    s.includes('city')
  );
}
