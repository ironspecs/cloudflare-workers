import { Err, OK, type Result } from './results';

export type NewsletterMode = 'demo' | 'live';

export const NEWSLETTER_MODE_DEMO = 'demo';
export const NEWSLETTER_MODE_LIVE = 'live';

export const getNewsletterMode = (request: Request): Result<NewsletterMode, 'INVALID_MODE'> => {
	const rawMode = new URL(request.url).searchParams.get('mode');
	if (rawMode === null || rawMode.length === 0) {
		return OK(NEWSLETTER_MODE_LIVE);
	}

	if (rawMode === NEWSLETTER_MODE_DEMO) {
		return OK(NEWSLETTER_MODE_DEMO);
	}

	return Err('INVALID_MODE');
};
