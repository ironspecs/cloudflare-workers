import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateAuthToken, consumeAuthToken } from './subscription-tokens';
import * as cryptoModule from '../lib/crypto';
import * as Lib from '../db/subscription-token-records';
import { SubscriptionTokenType } from '../db/subscription-token-records';
import { Err, OK } from '../lib/results';
import type { Env } from '../common';

vi.mock('../lib/crypto', () => ({
	generateId: vi.fn(),
}));

vi.mock('../db/subscription-token-records', async (importOriginal) => {
	const actual = (await importOriginal()) as typeof Lib;
	return {
		...actual,
		deleteSubscriptionTokenRecordByToken: vi.fn().mockResolvedValue(undefined),
		getSubscriptionTokenRecordBySubscriptionId: vi.fn(),
		getSubscriptionTokenRecordByToken: vi.fn().mockResolvedValue(null),
		insertSubscriptionTokenRecord: vi.fn().mockResolvedValue(undefined),
	};
});

const createMock = <T>(x: unknown): T => x as T;

const env = {
	NewslettersD1: {},
} as Env;

beforeEach(() => {
	vi.resetAllMocks();
});

describe('generateAuthToken', () => {
	it('generates a new token if no existing token is found', async () => {
		vi.mocked(Lib.getSubscriptionTokenRecordBySubscriptionId).mockResolvedValue([]);
		vi.mocked(cryptoModule.generateId).mockReturnValue('newTokenId');

		const result = await generateAuthToken(env, SubscriptionTokenType.VerifyEmail, 'subId');

		expect(result).toEqual(OK('newTokenId'));
		expect(Lib.insertSubscriptionTokenRecord).toHaveBeenCalledWith(
			expect.objectContaining({}),
			expect.objectContaining({
				id: 'newTokenId',
				expires_at: expect.any(Number),
				token_type: SubscriptionTokenType.VerifyEmail,
				subscription_id: 'subId',
			}),
		);
	});

	it('returns error if an existing unexpired token is found', async () => {
		vi.mocked(Lib.getSubscriptionTokenRecordBySubscriptionId).mockResolvedValue([
			createMock({
				id: 'existingToken',
				expires_at: Date.now() + 7_200_000,
			}),
		]);

		const result = await generateAuthToken(env, SubscriptionTokenType.VerifyEmail, 'subId');

		expect(result).toEqual(Err('EXISTING_UNEXPIRED_TOKEN'));
		expect(Lib.deleteSubscriptionTokenRecordByToken).not.toHaveBeenCalled();
		expect(Lib.insertSubscriptionTokenRecord).not.toHaveBeenCalled();
	});

	it('deletes expired tokens and generates a new one', async () => {
		vi.mocked(Lib.getSubscriptionTokenRecordBySubscriptionId).mockResolvedValue([
			createMock({
				id: 'expiredToken',
				expires_at: Date.now() - 7_200_000,
			}),
		]);
		vi.mocked(cryptoModule.generateId).mockReturnValue('newTokenId');

		const result = await generateAuthToken(env, SubscriptionTokenType.VerifyEmail, 'subId');

		expect(result).toEqual(OK('newTokenId'));
		expect(Lib.deleteSubscriptionTokenRecordByToken).toHaveBeenCalledWith(env.NewslettersD1, 'expiredToken');
		expect(Lib.insertSubscriptionTokenRecord).toHaveBeenCalledWith(
			expect.objectContaining({}),
			expect.objectContaining({
				id: 'newTokenId',
				expires_at: expect.any(Number),
				token_type: SubscriptionTokenType.VerifyEmail,
				subscription_id: 'subId',
			}),
		);
	});
});

describe('consumeAuthToken', () => {
	it('returns error if token is not found', async () => {
		vi.mocked(Lib.getSubscriptionTokenRecordByToken).mockResolvedValue(null);

		const result = await consumeAuthToken(env, 'nonexistentToken');

		expect(result).toEqual(Err('TOKEN_NOT_FOUND'));
		expect(Lib.deleteSubscriptionTokenRecordByToken).not.toHaveBeenCalled();
	});

	it('returns error if token has expired', async () => {
		vi.mocked(Lib.getSubscriptionTokenRecordByToken).mockResolvedValue(
			createMock({
				id: 'expiredTokenId',
				expires_at: Date.now() - 100_000,
			}),
		);

		const result = await consumeAuthToken(env, 'expiredTokenId');

		expect(result).toEqual(Err('TOKEN_EXPIRED'));
		expect(Lib.deleteSubscriptionTokenRecordByToken).toHaveBeenCalledWith(env.NewslettersD1, 'expiredTokenId');
	});

	it('returns token record if valid and deletes it', async () => {
		const mockValidToken = createMock<Lib.SubscriptionTokenRecord>({
			id: 'validTokenId',
			expires_at: Date.now() + 100_000,
			subscription_id: 'subId',
			token_type: SubscriptionTokenType.VerifyEmail,
		});
		vi.mocked(Lib.getSubscriptionTokenRecordByToken).mockResolvedValue(mockValidToken);

		const result = await consumeAuthToken(env, 'validTokenId');

		expect(result).toEqual(OK(mockValidToken));
		expect(Lib.deleteSubscriptionTokenRecordByToken).toHaveBeenCalledWith(env.NewslettersD1, 'validTokenId');
	});
});
