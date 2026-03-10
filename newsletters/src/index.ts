import { Hono } from 'hono';
import type { GenericSchema, InferOutput } from 'valibot';
import { safeParseAsync } from 'valibot';
import { email as validEmail, object, optional, picklist, pipe, string } from 'valibot';
import type { Env } from './common';
import htmlContent from '../examples/local-embed/index.html';
import { getHostnameConfigByHostname } from './db/hostname-config-records';
import type { SubscriptionRecord } from './db/subscription-records';
import { deleteApiSubscriber, listApiSubscribers } from './domain/api-subscribers';
import { subscribe, unsubscribe } from './domain/subscriptions';
import { getBrowserRequestContext } from './lib/browser';
import { createEmbedScript } from './lib/embed-script';
import { logError } from './lib/log';
import { createNewsletterSession, NewsletterSessionAction, validateNewsletterSession } from './lib/newsletter-sessions';
import { parseRequest } from './lib/requests';
import { createHTMLResponse, createJSONResponse, createJavaScriptResponse } from './lib/responses';
import { applyRateLimit, getRateLimitKey } from './lib/rate-limit';
import { authorizeServiceRequest, type ServiceAuthError } from './lib/service-auth';
import { getTurnstileSiteKey, verifyTurnstileToken } from './lib/turnstile';

const app = new Hono<{ Bindings: Env }>();
const API_SUBSCRIBERS_DEFAULT_LIMIT = 100;
const API_SUBSCRIBERS_MAX_LIMIT = 500;

const newsletterSessionSchema = object({
	query: object({}),
	body: object({
		action: picklist([NewsletterSessionAction.Subscribe, NewsletterSessionAction.Unsubscribe]),
		list_name: optional(string()),
	}),
});

const subscriptionSchema = object({
	query: object({}),
	body: object({
		email: pipe(string(), validEmail()),
		hostname: string(),
		list_name: string(),
		person_name: optional(string()),
		turnstile_token: string(),
	}),
});

const verifyQuerySchema = object({
	hostname: string(),
});

const apiSubscribersQuerySchema = object({
	hostname: string(),
	limit: optional(string()),
	list_name: optional(string()),
	offset: optional(string()),
});

const apiDeleteSubscriberQuerySchema = object({
	hostname: string(),
});

const createErrorResponse = (error: string | string[], status: number, headers?: HeadersInit) =>
	createJSONResponse({ error, success: false }, status, headers);

const createResultResponse = <T, E>(result: { success: boolean; value?: T; error?: E }, headers?: HeadersInit) =>
	createJSONResponse(result as Record<string, unknown>, result.success ? 200 : 400, headers);

const createOptionsResponse = (headers: HeadersInit) =>
	new Response(null, {
		headers,
		status: 204,
	});

const createValueResponse = <T>(value: T, headers?: HeadersInit, status = 200) =>
	createJSONResponse(
		{
			success: true,
			value,
		},
		status,
		headers,
	);

const getHeaderValue = (request: Request, headerName: string) => request.headers.get(headerName) ?? '';

const applyBrowserRateLimit = async (binding: Env['SESSION_RATE_LIMIT'], request: Request, hostname: string, headers: Headers) => {
	const rateLimitResult = await applyRateLimit(binding, getRateLimitKey(request, hostname));
	return rateLimitResult.success ? null : createErrorResponse(rateLimitResult.error, 429, headers);
};

const createParseRequestErrorResponse = (error: import('./lib/requests').ParseRequestError, headers?: HeadersInit) => {
	if (error === 'INVALID_FORMDATA' || error === 'INVALID_JSON') {
		return createErrorResponse(error, 400, headers);
	}

	if (error === 'UNSUPPORTED_CONTENT_TYPE') {
		return createErrorResponse(error, 415, headers);
	}

	return createErrorResponse(error, 400, headers);
};

const createSubscriptionOutcomeResponse = (
	outcome: Awaited<ReturnType<typeof subscribe>> | Awaited<ReturnType<typeof unsubscribe>>,
	headers: Headers,
): Response => {
	switch (outcome.code) {
		case 'ALREADY_SUBSCRIBED':
		case 'ALREADY_UNSUBSCRIBED':
		case 'RESUBSCRIBED':
		case 'SINK_ACCEPTED':
		case 'SUBSCRIBED':
		case 'UNSUBSCRIBED':
			return createValueResponse(outcome.code, headers);
		case 'NOT_FOUND':
			return createErrorResponse(outcome.code, 404, headers);
	}
};

const createApiDeleteOutcomeResponse = (outcome: Awaited<ReturnType<typeof deleteApiSubscriber>>): Response => {
	switch (outcome.code) {
		case 'DELETED':
			return createValueResponse(outcome.code);
		case 'NOT_FOUND':
			return createErrorResponse(outcome.code, 404);
	}
};

const parseBoundedInteger = (
	value: string | undefined,
	options: {
		defaultValue: number;
		maxValue: number;
		minValue?: number;
	},
): number | null => {
	if (value === undefined) {
		return options.defaultValue;
	}

	if (!/^\d+$/.test(value)) {
		return null;
	}

	const parsed = Number.parseInt(value, 10);
	const minValue = options.minValue ?? 0;
	if (!Number.isFinite(parsed) || parsed < minValue || parsed > options.maxValue) {
		return null;
	}

	return parsed;
};

const parseQuery = async <T extends GenericSchema>(request: Request, schema: T): Promise<Awaited<ReturnType<typeof safeParseAsync<T>>>> => {
	const url = new URL(request.url);
	const query: Record<string, string> = {};
	for (const [key, value] of url.searchParams.entries()) {
		query[key] = value;
	}

	return safeParseAsync(schema, query);
};

const serializeSubscriptionRecord = (record: SubscriptionRecord) => {
	return {
		created_at: record.created_at?.toISOString() ?? null,
		email: record.email,
		email_confirmed_at: record.email_confirmed_at?.toISOString() ?? null,
		hostname: record.hostname,
		id: record.id,
		list_name: record.list_name,
		person_name: record.person_name,
		unsubscribed_at: record.unsubscribed_at?.toISOString() ?? null,
	};
};

const getKnownHostnameConfig = async (env: Env, hostname: string) => {
	return getHostnameConfigByHostname(env.NewslettersD1, hostname.toLowerCase());
};

const serviceAuthStatusCodes: Record<ServiceAuthError, number> = {
	INVALID_AUTHORIZATION: 401,
	INVALID_JWT: 403,
	JWT_NOT_CONFIGURED: 403,
};

const authorizeApiHostnameRequest = async (request: Request, env: Env, hostname: string) => {
	const normalizedHostname = hostname.toLowerCase();
	const hostnameConfig = await getKnownHostnameConfig(env, normalizedHostname);
	if (hostnameConfig === null) {
		return createErrorResponse('UNKNOWN_HOSTNAME', 403);
	}

	const rateLimitResult = await applyRateLimit(env.API_RATE_LIMIT, getRateLimitKey(request, normalizedHostname));
	if (!rateLimitResult.success) {
		return createErrorResponse(rateLimitResult.error, 429);
	}

	const authResult = await authorizeServiceRequest(env, {
		hostnameConfig,
		request,
	});
	if (!authResult.success) {
		return createErrorResponse(authResult.error, serviceAuthStatusCodes[authResult.error]);
	}

	return {
		hostname: normalizedHostname,
		payload: authResult.value.payload,
	};
};

const handleNewslettersScript = async (): Promise<Response> => {
	return createJavaScriptResponse(createEmbedScript());
};

const handleNewslettersSession = async (request: Request, env: Env): Promise<Response> => {
	const browserContext = await getBrowserRequestContext(env, request);
	if (!browserContext.success) {
		return createErrorResponse(browserContext.error, 403);
	}

	const parsedRequest = await parseRequest(request, newsletterSessionSchema);
	if (!parsedRequest.success) {
		return createParseRequestErrorResponse(parsedRequest.error, browserContext.value.corsHeaders);
	}

	const rateLimitResponse = await applyBrowserRateLimit(
		env.SESSION_RATE_LIMIT,
		request,
		browserContext.value.hostname,
		browserContext.value.corsHeaders,
	);
	if (rateLimitResponse) {
		return rateLimitResponse;
	}

	const siteKey = await getTurnstileSiteKey(env, browserContext.value.hostname);
	if (!siteKey) {
		return createErrorResponse('TURNSTILE_NOT_CONFIGURED', 500, browserContext.value.corsHeaders);
	}

	const session = await createNewsletterSession(env, {
		action: parsedRequest.value.body.action,
		hostname: browserContext.value.hostname,
		origin: browserContext.value.origin,
	});

	return createResultResponse(
		{
			success: true,
			value: {
				...session,
				siteKey,
			},
		},
		browserContext.value.corsHeaders,
	);
};

const handleProtectedSubscription = async (
	request: Request,
	env: Env,
	action: NewsletterSessionAction,
	handler: typeof subscribe | typeof unsubscribe,
): Promise<Response> => {
	const browserContext = await getBrowserRequestContext(env, request);
	if (!browserContext.success) {
		return createErrorResponse(browserContext.error, 403);
	}

	const parsedRequest = await parseRequest(request, subscriptionSchema);
	if (!parsedRequest.success) {
		return createParseRequestErrorResponse(parsedRequest.error, browserContext.value.corsHeaders);
	}

	if (browserContext.value.hostname !== parsedRequest.value.body.hostname.toLowerCase()) {
		return createErrorResponse('INVALID_HOSTNAME', 403, browserContext.value.corsHeaders);
	}

	const rateLimitResponse = await applyBrowserRateLimit(
		env.SUBMIT_RATE_LIMIT,
		request,
		browserContext.value.hostname,
		browserContext.value.corsHeaders,
	);
	if (rateLimitResponse) {
		return rateLimitResponse;
	}

	const sessionValidation = await validateNewsletterSession(env, {
		action,
		hostname: browserContext.value.hostname,
		origin: browserContext.value.origin,
		submitToken: getHeaderValue(request, 'X-Submit-Token'),
	});
	if (!sessionValidation.success) {
		return createErrorResponse(sessionValidation.error, 403, browserContext.value.corsHeaders);
	}

	const turnstileResult = await verifyTurnstileToken(env, request, browserContext.value.hostname, parsedRequest.value.body.turnstile_token);
	if (!turnstileResult.success) {
		return createErrorResponse(
			turnstileResult.error,
			turnstileResult.error === 'TURNSTILE_NOT_CONFIGURED' ? 500 : 403,
			browserContext.value.corsHeaders,
		);
	}

	return createSubscriptionOutcomeResponse(await handler(env, parsedRequest.value.body), browserContext.value.corsHeaders);
};

const handleDisabledConfirmationRead = async (request: Request, env: Env): Promise<Response> => {
	const parsedQuery = await parseQuery(request, verifyQuerySchema);
	if (!parsedQuery.success) {
		return createErrorResponse(
			parsedQuery.issues.map((issue) => issue.message),
			400,
		);
	}

	const output = parsedQuery.output as InferOutput<typeof verifyQuerySchema>;
	const hostnameConfig = await getKnownHostnameConfig(env, output.hostname);
	if (hostnameConfig === null) {
		return createErrorResponse('UNKNOWN_HOSTNAME', 403);
	}

	const rateLimitResult = await applyRateLimit(env.VERIFY_RATE_LIMIT, getRateLimitKey(request, output.hostname));
	if (!rateLimitResult.success) {
		return createErrorResponse(rateLimitResult.error, 429);
	}

	return createErrorResponse('EMAIL_CONFIRMATION_DISABLED', 501);
};

const handleDisabledConfirmationWrite = async (request: Request, env: Env): Promise<Response> => {
	const browserContext = await getBrowserRequestContext(env, request);
	if (!browserContext.success) {
		return createErrorResponse(browserContext.error, 403);
	}

	const rateLimitResponse = await applyBrowserRateLimit(
		env.SUBMIT_RATE_LIMIT,
		request,
		browserContext.value.hostname,
		browserContext.value.corsHeaders,
	);
	if (rateLimitResponse) {
		return rateLimitResponse;
	}

	return createErrorResponse('EMAIL_CONFIRMATION_DISABLED', 501, browserContext.value.corsHeaders);
};

const handleOptions = async (request: Request, env: Env): Promise<Response> => {
	const browserContext = await getBrowserRequestContext(env, request);
	if (!browserContext.success) {
		return createErrorResponse(browserContext.error, 403);
	}

	return createOptionsResponse(browserContext.value.corsHeaders);
};

const handleApiSubscribersList = async (request: Request, env: Env): Promise<Response> => {
	const parsedQuery = await parseQuery(request, apiSubscribersQuerySchema);
	if (!parsedQuery.success) {
		return createErrorResponse(
			parsedQuery.issues.map((issue) => issue.message),
			400,
		);
	}

	const output = parsedQuery.output as InferOutput<typeof apiSubscribersQuerySchema>;
	const authResult = await authorizeApiHostnameRequest(request, env, output.hostname);
	if (authResult instanceof Response) {
		return authResult;
	}

	const limit = parseBoundedInteger(output.limit, {
		defaultValue: API_SUBSCRIBERS_DEFAULT_LIMIT,
		maxValue: API_SUBSCRIBERS_MAX_LIMIT,
		minValue: 1,
	});
	if (limit === null) {
		return createErrorResponse('INVALID_LIMIT', 400);
	}

	const offset = parseBoundedInteger(output.offset, {
		defaultValue: 0,
		maxValue: Number.MAX_SAFE_INTEGER,
	});
	if (offset === null) {
		return createErrorResponse('INVALID_OFFSET', 400);
	}

	const subscribers = await listApiSubscribers(env, {
		hostname: authResult.hostname,
		limit,
		list_name: parsedQuery.output.list_name,
		offset,
	});
	return createValueResponse({
		has_more: subscribers.length === limit,
		items: subscribers.map(serializeSubscriptionRecord),
		limit,
		offset,
	});
};

const handleApiSubscriberDelete = async (request: Request, env: Env, id: string): Promise<Response> => {
	const parsedQuery = await parseQuery(request, apiDeleteSubscriberQuerySchema);
	if (!parsedQuery.success) {
		return createErrorResponse(
			parsedQuery.issues.map((issue) => issue.message),
			400,
		);
	}

	const output = parsedQuery.output as InferOutput<typeof apiDeleteSubscriberQuerySchema>;
	const authResult = await authorizeApiHostnameRequest(request, env, output.hostname);
	if (authResult instanceof Response) {
		return authResult;
	}

	return createApiDeleteOutcomeResponse(
		await deleteApiSubscriber(env, {
			hostname: authResult.hostname,
			id,
		}),
	);
};

app.get('/', () => createHTMLResponse(htmlContent));
app.get('/newsletters.js', () => handleNewslettersScript());
app.post('/newsletters/session', (c) => handleNewslettersSession(c.req.raw, c.env));
app.options('/newsletters/session', (c) => handleOptions(c.req.raw, c.env));
app.post('/subscribe', (c) => handleProtectedSubscription(c.req.raw, c.env, NewsletterSessionAction.Subscribe, subscribe));
app.options('/subscribe', (c) => handleOptions(c.req.raw, c.env));
app.post('/unsubscribe', (c) => handleProtectedSubscription(c.req.raw, c.env, NewsletterSessionAction.Unsubscribe, unsubscribe));
app.options('/unsubscribe', (c) => handleOptions(c.req.raw, c.env));
app.post('/join', (c) => handleProtectedSubscription(c.req.raw, c.env, NewsletterSessionAction.Subscribe, subscribe));
app.options('/join', (c) => handleOptions(c.req.raw, c.env));
app.post('/leave', (c) => handleProtectedSubscription(c.req.raw, c.env, NewsletterSessionAction.Unsubscribe, unsubscribe));
app.options('/leave', (c) => handleOptions(c.req.raw, c.env));
app.get('/confirm', (c) => handleDisabledConfirmationRead(c.req.raw, c.env));
app.get('/verify', (c) => handleDisabledConfirmationRead(c.req.raw, c.env));
app.post('/confirm/send', (c) => handleDisabledConfirmationWrite(c.req.raw, c.env));
app.options('/confirm/send', (c) => handleOptions(c.req.raw, c.env));
app.get('/api/subscribers', (c) => handleApiSubscribersList(c.req.raw, c.env));
app.delete('/api/subscribers/:id', (c) => handleApiSubscriberDelete(c.req.raw, c.env, c.req.param('id')));

app.notFound(() => new Response('Not found', { status: 404 }));

app.onError((error, c) => {
	logError('newsletter_request_unhandled_error', error, {
		cf_ray: c.req.header('cf-ray') ?? null,
		method: c.req.method,
		origin: c.req.header('Origin') ?? null,
		pathname: new URL(c.req.url).pathname,
	});
	return createErrorResponse('INTERNAL_ERROR', 500);
});

export default {
	fetch(request: Request, env: Env): Promise<Response> {
		return Promise.resolve(app.fetch(request, env));
	},
};
