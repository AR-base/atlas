// Security headers and HTTPS enforcement for every Atlas response.
//
// No inline script or style anywhere. 'wasm-unsafe-eval' is required by the
// browser to compile the SQLite WebAssembly module; it does not allow
// JavaScript eval(). GitHub hosts are allowed only for loading public repos.
const CSP = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self' https://api.github.com https://raw.githubusercontent.com",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

const SECURITY_HEADERS = Object.freeze({
  'content-security-policy': CSP,
  'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'x-permitted-cross-domain-policies': 'none',
});

const STRIP = ['x-powered-by', 'x-aspnet-version', 'x-aspnetmvc-version'];
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function httpsRedirect(request) {
  const url = new URL(request.url);
  if (url.protocol !== 'http:' || LOCAL_HOSTS.has(url.hostname)) return null;
  url.protocol = 'https:';
  return new Response(null, { status: 301, headers: { location: url.toString(), ...SECURITY_HEADERS } });
}

function withSecurityHeaders(response) {
  const out = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) out.headers.set(name, value);
  for (const name of STRIP) out.headers.delete(name);
  return out;
}

export { CSP, SECURITY_HEADERS, httpsRedirect, withSecurityHeaders };
