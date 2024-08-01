export const createMethodNotAllowedResponse = () => new Response('Method not allowed', { status: 405 });
export const createNotFoundResponse = () => new Response('Not found', { status: 404 });
export const createJSONResponse = (obj: Record<string, unknown>, status: number) => {
	let body = '';

	try {
		body = JSON.stringify(obj);
	} catch (ex) {
		return new Response('Unable to parse response.', {
			status: 500,
		});
	}

	return new Response(body, {
		headers: { 'Content-Type': 'application/json' },
		status,
	});
};
export const createHTMLResponse = (htmlContent: string) =>
	new Response(htmlContent, {
		headers: { 'Content-Type': 'text/html' },
	});
