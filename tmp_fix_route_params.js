const fs = require('fs');
const path = require('path');
const root = path.join('artifacts', 'api-server', 'src', 'routes');
const p1 = /parseInt\(req\.params\.([A-Za-z0-9_]+)\)/g;
const p2 = /parseInt\(req\.query\.([A-Za-z0-9_]+)(?:\s*as\s*string)?\)/g;
const files = fs.readdirSync(root).filter((f) => f.endsWith('.ts'));
for (const f of files) {
  const fp = path.join(root, f);
  let text = fs.readFileSync(fp, 'utf8');
  let newText = text.replace(p1, (m, g) => `parseInt(Array.isArray(req.params.${g}) ? req.params.${g}[0] : req.params.${g} as string)`)
                    .replace(p2, (m, g) => `parseInt(Array.isArray(req.query.${g}) ? req.query.${g}[0] : req.query.${g} as string)`);
  if (newText !== text) {
    fs.writeFileSync(fp, newText, 'utf8');
    console.log('fixed', fp);
  }
}
