export function splitCustomerNumberAndName(value) {
  const s = String(value ?? '').trim();
  if (!s) return { customer_number: '', name: '' };

  const dotIdx = s.indexOf('.');
  if (dotIdx > 0 && dotIdx < 20) {
    const left = s.slice(0, dotIdx).trim();
    const right = s.slice(dotIdx + 1).trim();
    if (left) return { customer_number: left, name: right };
  }

  const m = s.match(/^(\d{2,20})\s+(.+)$/);
  if (m) return { customer_number: m[1], name: m[2].trim() };

  return { customer_number: s, name: '' };
}

export function splitStreetAndHouseNumber(value) {
  const s = String(value ?? '').trim();
  if (!s) return { street: '', house_number: '' };

  const m = s.match(/^(.*?)(\s+\d+[a-zA-Z]?([\/-]\d+[a-zA-Z]?)?)\s*$/);
  if (m) return { street: (m[1] || '').trim(), house_number: (m[2] || '').trim() };

  return { street: s, house_number: '' };
}

export function digitsOnly(v) {
  return String(v ?? '').replace(/\D/g, '');
}
