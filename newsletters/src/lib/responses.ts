const toHeaders = (headers: HeadersInit | undefined) => new Headers(headers);

export const createMethodNotAllowedResponse = () => new Response('Method not allowed', { status: 405 });
export const createNotFoundResponse = () => new Response('Not found', { status: 404 });

export const createJSONResponse = (obj: Record<string, unknown>, status: number, headers?: HeadersInit) => {
	let body = '';

	try {
		body = JSON.stringify(obj);
	} catch (ex) {
		return new Response('Unable to parse response.', {
			status: 500,
		});
	}

	const responseHeaders = toHeaders(headers);
	responseHeaders.set('Content-Type', 'application/json');

	return new Response(body, {
		headers: responseHeaders,
		status,
	});
};
export const createHTMLResponse = (htmlContent: string, headers?: HeadersInit) =>
	new Response(htmlContent, {
		headers: {
			...Object.fromEntries(toHeaders(headers).entries()),
			'Content-Type': 'text/html',
		},
	});

export const createJavaScriptResponse = (source: string) =>
	new Response(source, {
		headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
	});
