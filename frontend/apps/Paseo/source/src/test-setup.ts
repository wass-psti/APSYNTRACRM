import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Remove the previous rendered page before running the next test.
afterEach(() => {
  cleanup();
});
