import '@testing-library/jest-dom/vitest'

const localStorageValues = new Map<string, string>()

Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    clear() {
      localStorageValues.clear()
    },
    getItem(key: string) {
      return localStorageValues.get(key) ?? null
    },
    removeItem(key: string) {
      localStorageValues.delete(key)
    },
    setItem(key: string, value: string) {
      localStorageValues.set(key, value)
    },
  },
})

Object.defineProperty(window, 'scrollTo', {
  configurable: true,
  value: () => {},
})
