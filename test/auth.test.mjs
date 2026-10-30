import { createSessionCookie, verifyToken, checkPassword } from '../lib/auth.js';

process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnopqrstuvwxyz';
process.env.APP_PASSWORD = 'correct-horse-battery-staple';

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name); }
}

const c = createSessionCookie();
check('cookie is httpOnly', c.options.httpOnly === true);
check('cookie is sameSite=strict', c.options.sameSite === 'strict');
check('fresh token verifies', verifyToken(c.value) === true);

// Tamper with the signature.
const tampered = c.value.slice(0, -2) + (c.value.slice(-2) === 'aa' ? 'bb' : 'aa');
check('tampered token rejected', verifyToken(tampered) === false);

// Expired token: correct shape, past expiry, but signature won't match -> rejected.
check('expired/garbage token rejected', verifyToken('v1.1000.deadbeef') === false);
check('null token rejected', verifyToken(null) === false);
check('undefined token rejected', verifyToken(undefined) === false);
check('random string rejected', verifyToken('not-a-token') === false);

check('correct password accepted', checkPassword('correct-horse-battery-staple') === true);
check('wrong password rejected', checkPassword('nope') === false);
check('empty password rejected', checkPassword('') === false);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
