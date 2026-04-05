export async function register() {
  // Node.js 22+ has an experimental localStorage that may be broken.
  // Patch it to avoid SSR crashes.
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.getItem('__test__')
    } catch {
      // Replace broken localStorage with a no-op
      Object.defineProperty(globalThis, 'localStorage', {
        value: {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
          clear: () => {},
          key: () => null,
          length: 0,
        },
        writable: true,
      })
    }
  }
}
