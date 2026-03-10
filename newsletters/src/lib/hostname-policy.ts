const LOCAL_DEVELOPMENT_HOSTNAMES = new Set(['127.0.0.1', 'localhost']);

const RESERVED_SINK_EMAIL_HOSTNAMES = new Set(['example.com', 'example.net', 'example.org', 'invalid', 'localhost', 'test']);

export const TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000AA';
export const TURNSTILE_TEST_SECRET_KEY = '1x0000000000000000000000000000000AA';
const LOCAL_TURNSTILE_VERIFIED_HOSTNAMES = new Set(['example.com', 'localhost']);

export const isLocalDevelopmentHostname = (hostname: string): boolean => {
	return LOCAL_DEVELOPMENT_HOSTNAMES.has(hostname.toLowerCase());
};

export const getEmailHostname = (email: string): string => {
	const atIndex = email.lastIndexOf('@');
	if (atIndex <= 0 || atIndex === email.length - 1) {
		throw new Error(`Invalid email address: ${email}`);
	}

	return email.slice(atIndex + 1).toLowerCase();
};

export const isAutomaticSinkSiteHostname = (hostname: string): boolean => {
	return isLocalDevelopmentHostname(hostname);
};

export const isAutomaticSinkEmailHostname = (hostname: string): boolean => {
	const normalizedHostname = hostname.toLowerCase();
	return (
		RESERVED_SINK_EMAIL_HOSTNAMES.has(normalizedHostname) ||
		normalizedHostname.endsWith('.invalid') ||
		normalizedHostname.endsWith('.localhost') ||
		normalizedHostname.endsWith('.test')
	);
};

export const isAcceptedTurnstileHostname = (hostname: string, verifiedHostname: string): boolean => {
	const normalizedHostname = hostname.toLowerCase();
	const normalizedVerifiedHostname = verifiedHostname.toLowerCase();
	if (isLocalDevelopmentHostname(normalizedHostname)) {
		return normalizedVerifiedHostname === normalizedHostname || LOCAL_TURNSTILE_VERIFIED_HOSTNAMES.has(normalizedVerifiedHostname);
	}

	return normalizedVerifiedHostname === normalizedHostname;
};
