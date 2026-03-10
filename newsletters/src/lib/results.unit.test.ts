import { describe, expect, it } from 'vitest';
import { Err, NotImplemented, OK, Unreachable } from './results';

describe('results helpers', () => {
	it('creates OK and Err payloads', () => {
		expect(OK('value')).toEqual({ success: true, value: 'value' });
		expect(Err('error')).toEqual({ success: false, error: 'error' });
	});

	it('creates strict error types', () => {
		expect(new NotImplemented().message).toContain('Not implemented');
		expect(new Unreachable('x' as never).message).toContain('Unreachable');
	});
});
