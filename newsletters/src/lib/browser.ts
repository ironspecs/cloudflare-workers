import type { Env } from '../common';
import { type HostnameConfig, getHostnameConfigByHostname } from '../db/hostname-config-records';
import { Err, OK, type Result } from './results';

export type BrowserRequestContext = {
	corsHeaders: Headers;
	hostname: string;
	hostnameConfig: HostnameConfig;
	origin: string;
};

export type BrowserOriginContext = Omit<BrowserRequestContext, 'hostnameConfig'>;

const ALLOWED_HEADERS = 'Authorization, Content-Type, X-Submit-Token';
const ALLOWED_METHODS = 'DELETE, GET, OPTIONS, PATCH, POST';

export const getOriginUrl = (request: Request): Result<URL, 'INVALID_ORIGIN' | 'MISSING_ORIGIN'> => {
	const origin = request.headers.get('Origin');
	if (!origin) {
		return Err('MISSING_ORIGIN');
	}

	try {
		return OK(new URL(origin));
	} catch {
		return Err('INVALID_ORIGIN');
	}
};

export const createCorsHeaders = (origin: string): Headers => {
	const headers = new Headers();
	headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS);
	headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS);
	headers.set('Access-Control-Allow-Origin', origin);
	headers.set('Vary', 'Origin');
	return headers;
};

export const applyOriginCorsHeaders = (headers: Headers, origin: string): void => {
	for (const [key, value] of createCorsHeaders(origin).entries()) {
		headers.set(key, value);
	}
};

export const getBrowserOriginContext = (
	request: Request,
	expectedHostname?: string,
): Result<BrowserOriginContext, 'INVALID_HOSTNAME' | 'INVALID_ORIGIN' | 'MISSING_ORIGIN'> => {
	const originResult = getOriginUrl(request);
	if (!originResult.success) {
		return originResult;
	}

	const origin = originResult.value.origin;
	const hostname = originResult.value.hostname.toLowerCase();
	if (expectedHostname && expectedHostname.toLowerCase() !== hostname) {
		return Err('INVALID_HOSTNAME');
	}

	return OK({
		corsHeaders: createCorsHeaders(origin),
		hostname,
		origin,
	});
};

export const getBrowserRequestContext = async (
	env: Env,
	request: Request,
	expectedHostname?: string,
): Promise<Result<BrowserRequestContext, 'INVALID_HOSTNAME' | 'INVALID_ORIGIN' | 'MISSING_ORIGIN' | 'UNKNOWN_HOSTNAME'>> => {
	const originContext = getBrowserOriginContext(request, expectedHostname);
	if (!originContext.success) {
		return originContext;
	}

	const hostnameConfig = await getHostnameConfigByHostname(env.NewslettersD1, originContext.value.hostname);
	if (hostnameConfig === null) {
		return Err('UNKNOWN_HOSTNAME');
	}

	return OK({
		corsHeaders: originContext.value.corsHeaders,
		hostname: originContext.value.hostname,
		hostnameConfig,
		origin: originContext.value.origin,
	});
};
