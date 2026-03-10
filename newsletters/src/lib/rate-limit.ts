import type { RateLimit } from '@cloudflare/workers-types';
import { Err, OK, type Result } from './results';

export const applyRateLimit = async (binding: RateLimit, key: string): Promise<Result<'RATE_LIMIT_OK', 'RATE_LIMITED'>> => {
	const outcome = await binding.limit({ key });
	return outcome.success ? OK('RATE_LIMIT_OK') : Err('RATE_LIMITED');
};

export const getRateLimitKey = (request: Request, hostname: string) => {
	const ipAddress = request.headers.get('cf-connecting-ip') ?? 'local';
	return `${hostname}:${ipAddress}`;
};
