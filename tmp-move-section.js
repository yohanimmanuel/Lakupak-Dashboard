const fs = require('fs');
const p = 'src/components/ordershipment/CreateOrderForm.tsx';
let s = fs.readFileSync(p, 'utf8');
const marker = '          <section className="ORDER_ITEMS_MOVE';
const start = s.indexOf(marker);
const next = '          <section className="p-4">';
const end = s.indexOf(next, start);
if (start < 0 || end < 0) {
  console.log('bad', start, end);
  process.exit(1);
}
const block = s.slice(start, end).replace('ORDER_ITEMS_MOVE ', '');
s = s.slice(0, start) + s.slice(end);
const anchor = '          </section>\r\n        </div>';
const anchorLf = '          </section>\n        </div>';
let at = s.lastIndexOf(anchor);
let used = anchor;
if (at < 0) {
  at = s.lastIndexOf(anchorLf);
  used = anchorLf;
}
if (at < 0) {
  console.log('no anchor');
  process.exit(1);
}
s = s.slice(0, at) + block + s.slice(at);
fs.writeFileSync(p, s);
console.log('moved', block.length, 'nl', used.includes('\r') ? 'crlf' : 'lf');
