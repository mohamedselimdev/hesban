/** Content-Security-Policy for the renderer. Production is fully restrictive. */
export function buildCsp(mode: 'production' | 'development', devServerOrigin?: string): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'none'"],
    'script-src': ["'self'"],
    'style-src': ["'self'"],
    'img-src': ["'self'", 'data:'],
    'font-src': ["'self'"],
    'connect-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'none'"],
    'form-action': ["'none'"],
    'frame-ancestors': ["'none'"],
    'frame-src': ["'none'"],
    'worker-src': ["'none'"],
    'manifest-src': ["'none'"],
  };

  if (mode === 'development' && devServerOrigin) {
    const ws = devServerOrigin.replace(/^http/, 'ws');
    directives['script-src'] = ["'self'", "'unsafe-inline'"];
    directives['style-src'] = ["'self'", "'unsafe-inline'"];
    directives['connect-src'] = ["'self'", devServerOrigin, ws];
  }

  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}
