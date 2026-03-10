import { safeParseAsync } from 'valibot';
import { email as validEmail, object, optional, picklist, pipe, string } from 'valibot';
import type { Env } from './common';
import htmlContent from './index.html';
import { getHostnameConfigByHostname } from './db/hostname-config-records';
import { subscribe, unsubscribe } from './domain/subscriptions';
import { getBrowserRequestContext } from './lib/browser';
import { createEmbedScript } from './lib/embed-script';
import {
	createNewsletterSession,
	deleteNewsletterSession,
	NewsletterSessionAction,
	validateNewsletterSession,
} from './lib/newsletter-sessions';
import { parseRequest } from './lib/requests';
import {
	createHTMLResponse,
	createJSONResponse,
	createJavaScriptResponse,
	createMethodNotAllowedResponse,
	createNotFoundResponse,
} from './lib/responses';
import { applyRateLimit, getRateLimitKey } from './lib/rate-limit';
import { getTurnstileSiteKey, verifyTurnstileToken } from './lib/turnstile';

type RouteHandler = (request: Request, env: Env) => Promise<Response>;

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

const createErrorResponse = (error: string | string[], status: number, headers?: HeadersInit) =>
	createJSONResponse({ error, success: false }, status, headers);

const createResultResponse = <T, E>(result: { success: boolean; value?: T; error?: E }, headers?: HeadersInit) =>
	createJSONResponse(result as Record<string, unknown>, result.success ? 200 : 400, headers);

const createOptionsResponse = (headers: HeadersInit) =>
	new Response(null, {
		headers,
		status: 204,
	});

const getHeaderValue = (request: Request, headerName: string) => request.headers.get(headerName) ?? '';

const applyBrowserRateLimit = async (binding: Env['SESSION_RATE_LIMIT'], request: Request, hostname: string, headers: Headers) => {
	const rateLimitResult = await applyRateLimit(binding, getRateLimitKey(request, hostname));
	return rateLimitResult.success ? null : createErrorResponse(rateLimitResult.error, 429, headers);
};

const getVerifyHostname = async (request: Request) => {
	const url = new URL(request.url);
	const query: Record<string, string> = {};
	for (const [key, value] of url.searchParams.entries()) {
		query[key] = value;
	}

	return safeParseAsync(verifyQuerySchema, query);
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
		return createErrorResponse(parsedRequest.error, 400, browserContext.value.corsHeaders);
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
		return createErrorResponse(parsedRequest.error, 400, browserContext.value.corsHeaders);
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
		csrfToken: getHeaderValue(request, 'X-CSRF-Token'),
		hostname: browserContext.value.hostname,
		origin: browserContext.value.origin,
		sessionId: getHeaderValue(request, 'X-Session-Id'),
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

	const result = await handler(env, parsedRequest.value.body);
	await deleteNewsletterSession(env, getHeaderValue(request, 'X-Session-Id'));

	return createResultResponse(result, browserContext.value.corsHeaders);
};

const handleSubscribe = async (request: Request, env: Env): Promise<Response> => {
	return handleProtectedSubscription(request, env, NewsletterSessionAction.Subscribe, subscribe);
};

const handleUnsubscribe = async (request: Request, env: Env): Promise<Response> => {
	return handleProtectedSubscription(request, env, NewsletterSessionAction.Unsubscribe, unsubscribe);
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

const handleDisabledConfirmationRead = async (request: Request, env: Env): Promise<Response> => {
	const parsedQuery = await getVerifyHostname(request);
	if (!parsedQuery.success) {
		return createErrorResponse(
			parsedQuery.issues.map((issue) => issue.message),
			400,
		);
	}

	const hostnameConfig = await getHostnameConfigByHostname(env.NewslettersD1, parsedQuery.output.hostname);
	if (hostnameConfig === null) {
		return createErrorResponse('UNKNOWN_HOSTNAME', 403);
	}

	const rateLimitResult = await applyRateLimit(env.VERIFY_RATE_LIMIT, getRateLimitKey(request, parsedQuery.output.hostname));
	if (!rateLimitResult.success) {
		return createErrorResponse(rateLimitResult.error, 429);
	}

	return createErrorResponse('EMAIL_CONFIRMATION_DISABLED', 501);
};

const handleOptions = async (request: Request, env: Env): Promise<Response> => {
	const browserContext = await getBrowserRequestContext(env, request);
	if (!browserContext.success) {
		return createErrorResponse(browserContext.error, 403);
	}

	return createOptionsResponse(browserContext.value.corsHeaders);
};

const routes = {
	'/confirm': {
		get: handleDisabledConfirmationRead,
	},
	'/confirm/send': {
		options: handleOptions,
		post: handleDisabledConfirmationWrite,
	},
	'/join': {
		options: handleOptions,
		post: handleSubscribe,
	},
	'/leave': {
		options: handleOptions,
		post: handleUnsubscribe,
	},
	'/subscribe': {
		options: handleOptions,
		post: handleSubscribe,
	},
	'/unsubscribe': {
		options: handleOptions,
		post: handleUnsubscribe,
	},
	'/verify': {
		get: handleDisabledConfirmationRead,
	},
	'/newsletters.js': {
		get: handleNewslettersScript,
	},
	'/newsletters/session': {
		options: handleOptions,
		post: handleNewslettersSession,
	},
} as Record<string, Record<string, RouteHandler>>;

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const pathname = new URL(request.url).pathname;
		const route = routes[pathname];
		if (route) {
			const handler = route[request.method.toLowerCase()];
			if (!handler) {
				return createMethodNotAllowedResponse();
			}

			return handler(request, env);
		}

		if (request.method === 'GET' && pathname === '/') {
			return createHTMLResponse(htmlContent);
		}

		return createNotFoundResponse();
	},
};
