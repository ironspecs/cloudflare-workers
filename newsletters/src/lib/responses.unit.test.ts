import { describe, expect, it } from 'vitest';
import {
	createHTMLResponse,
	createJSONResponse,
	createJavaScriptResponse,
	createMethodNotAllowedResponse,
	createNotFoundResponse,
} from './responses';

describe('responses', () => {
	it('creates JSON responses with merged headers', async () => {
		const response = createJSONResponse({ success: true }, 201, { 'X-Test': 'yes' });

		expect(response.status).toBe(201);
		expect(response.headers.get('Content-Type')).toContain('application/json');
		expect(response.headers.get('X-Test')).toBe('yes');
		expect(await response.json()).toEqual({ success: true });
	});

	it('creates HTML responses', async () => {
		const response = createHTMLResponse('<h1>Hello</h1>', { 'X-Test': 'yes' });

		expect(response.headers.get('Content-Type')).toContain('text/html');
		expect(response.headers.get('X-Test')).toBe('yes');
		expect(await response.text()).toContain('Hello');
	});

	it('creates JavaScript responses', () => {
		const response = createJavaScriptResponse('window.test = true;');

		expect(response.headers.get('Content-Type')).toContain('application/javascript');
	});

	it('creates standard 404 and 405 responses', async () => {
		expect(createMethodNotAllowedResponse().status).toBe(405);
		expect(await createNotFoundResponse().text()).toBe('Not found');
	});
});
