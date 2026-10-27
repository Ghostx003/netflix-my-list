const fs = require('fs');

let data = [];
if (fs.existsSync('public/netflix_enriched_kb.json')) {
  data = JSON.parse(fs.readFileSync('public/netflix_enriched_kb.json', 'utf8'));
  console.log('Using public/netflix_enriched_kb.json, records:', data.length);
} else if (fs.existsSync('netflix-my-list.json')) {
  data = JSON.parse(fs.readFileSync('netflix-my-list.json', 'utf8'));
  console.log('Using netflix-my-list.json, records:', data.length);
}

if (Array.isArray(data) && data.length > 0) {
  // Collect all unique keys
  const keysSet = new Set();
  data.forEach(item => {
    Object.keys(item).forEach(k => keysSet.add(k));
  });
  const headers = Array.from(keysSet);

  const escapeCsv = (val) => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') val = JSON.stringify(val);
    let str = String(val).replace(/"/g, '""');
    if (str.includes(',') || str.includes('\n') || str.includes('\r') || str.includes('"')) {
      return `"${str}"`;
    }
    return str;
  };

  const lines = [headers.join(',')];
  for (const item of data) {
    const row = headers.map(h => escapeCsv(item[h]));
    lines.push(row.join(','));
  }

  fs.writeFileSync('netflix_database_export.csv', lines.join('\n'), 'utf8');
  console.log('Generated netflix_database_export.csv with rows:', lines.length);
}
