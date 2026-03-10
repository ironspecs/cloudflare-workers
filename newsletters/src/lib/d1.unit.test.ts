import { describe, expect, it } from 'vitest';
import { isUniqueConstraintError } from './d1';

describe('isUniqueConstraintError', () => {
	it('matches D1 unique constraint failures', () => {
		expect(isUniqueConstraintError(new Error('D1_ERROR: UNIQUE constraint failed: subscription.email'))).toBe(true);
	});

	it('ignores non-unique errors', () => {
		expect(isUniqueConstraintError(new Error('D1_ERROR: syntax error'))).toBe(false);
	});
});
