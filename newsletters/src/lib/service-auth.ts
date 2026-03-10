import type { Env } from '../common';
import type { HostnameConfig } from '../db/hostname-config-records';
import { fromBase64Url, sha256Hex } from './crypto';
import { Err, OK, type Result } from './results';

const DEFAULT_JWKS_CACHE_TTL_SECONDS = 300;
const MAX_JWKS_CACHE_TTL_SECONDS = 3600;
const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

const JWT_ALGORITHMS = {
	RS256: {
		importAlgorithm: {
			hash: 'SHA-256',
			name: 'RSASSA-PKCS1-v1_5',
		},
		keyType: 'RSA',
		verifyAlgorithm: 'RSASSA-PKCS1-v1_5',
	},
} as const;

type AllowedJwtAlgorithm = keyof typeof JWT_ALGORITHMS;
type JwksKey = JsonWebKey & {
	alg?: string;
	kid?: string;
	kty?: string;
	use?: string;
};
type JwtHeader = {
	alg: AllowedJwtAlgorithm;
	kid: string;
};
export type JwtPayload = {
	exp: number;
	nbf?: number;
	sub?: string;
	[key: string]: unknown;
};
type ParsedJwt = {
	encodedHeader: string;
	header: JwtHeader;
	payload: JwtPayload;
	signature: Uint8Array;
	signingInput: string;
};
type JwksDocument = {
	keys: JwksKey[];
};
export type ServiceAuthError = 'INVALID_AUTHORIZATION' | 'INVALID_JWT' | 'JWT_NOT_CONFIGURED';

const isAllowedJwtAlgorithm = (value: unknown): value is AllowedJwtAlgorithm => {
	return typeof value === 'string' && value in JWT_ALGORITHMS;
};

const isJwtHeader = (value: unknown): value is JwtHeader => {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const header = value as Partial<JwtHeader>;
	return isAllowedJwtAlgorithm(header.alg) && typeof header.kid === 'string' && header.kid.length > 0;
};

const isJwtPayload = (value: unknown): value is JwtPayload => {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const payload = value as Partial<JwtPayload>;
	return (
		typeof payload.exp === 'number' &&
		Number.isFinite(payload.exp) &&
		(payload.nbf === undefined || (typeof payload.nbf === 'number' && Number.isFinite(payload.nbf)))
	);
};

const isJwksDocument = (value: unknown): value is JwksDocument => {
	if (!value || typeof value !== 'object') {
		return false;
	}

	return Array.isArray((value as Partial<JwksDocument>).keys);
};

const decodeBase64UrlJson = <T>(value: string): Result<T, 'INVALID_JWT'> => {
	try {
		return OK(JSON.parse(textDecoder.decode(fromBase64Url(value))) as T);
	} catch {
		return Err('INVALID_JWT');
	}
};

const parseJwt = (token: string): Result<ParsedJwt, 'INVALID_JWT'> => {
	const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
	if (!encodedHeader || !encodedPayload || !encodedSignature) {
		return Err('INVALID_JWT');
	}

	const headerResult = decodeBase64UrlJson<unknown>(encodedHeader);
	if (!headerResult.success || !isJwtHeader(headerResult.value)) {
		return Err('INVALID_JWT');
	}

	const payloadResult = decodeBase64UrlJson<unknown>(encodedPayload);
	if (!payloadResult.success || !isJwtPayload(payloadResult.value)) {
		return Err('INVALID_JWT');
	}

	try {
		return OK({
			encodedHeader,
			header: headerResult.value,
			payload: payloadResult.value,
			signature: fromBase64Url(encodedSignature),
			signingInput: `${encodedHeader}.${encodedPayload}`,
		});
	} catch {
		return Err('INVALID_JWT');
	}
};

const getBearerToken = (request: Request): Result<string, 'INVALID_AUTHORIZATION'> => {
	const authorization = request.headers.get('Authorization');
	if (!authorization?.startsWith('Bearer ')) {
		return Err('INVALID_AUTHORIZATION');
	}

	const token = authorization.slice('Bearer '.length).trim();
	return token.length > 0 ? OK(token) : Err('INVALID_AUTHORIZATION');
};

const getCacheTtlSeconds = (cacheControl: string | null): number => {
	const match = cacheControl?.match(/(?:^|,)\s*max-age=(\d+)/i);
	if (!match) {
		return DEFAULT_JWKS_CACHE_TTL_SECONDS;
	}

	const maxAge = Number.parseInt(match[1], 10);
	if (!Number.isFinite(maxAge) || maxAge < 1) {
		return DEFAULT_JWKS_CACHE_TTL_SECONDS;
	}

	return Math.min(maxAge, MAX_JWKS_CACHE_TTL_SECONDS);
};

const getJwksCacheKey = async (jwksUrl: string): Promise<string> => {
	return `jwks:${await sha256Hex(jwksUrl)}`;
};

const readCachedJwks = async (env: Pick<Env, 'JwksCacheKV'>, jwksUrl: string): Promise<JwksDocument | null> => {
	const cacheKey = await getJwksCacheKey(jwksUrl);
	const cachedValue = await env.JwksCacheKV.get(cacheKey);
	if (!cachedValue) {
		return null;
	}

	try {
		const parsedValue = JSON.parse(cachedValue) as unknown;
		return isJwksDocument(parsedValue) ? parsedValue : null;
	} catch {
		return null;
	}
};

const writeCachedJwks = async (
	env: Pick<Env, 'JwksCacheKV'>,
	jwksUrl: string,
	document: JwksDocument,
	ttlSeconds: number,
): Promise<void> => {
	const cacheKey = await getJwksCacheKey(jwksUrl);
	await env.JwksCacheKV.put(cacheKey, JSON.stringify(document), {
		expirationTtl: ttlSeconds,
	});
};

const fetchJwks = async (jwksUrl: string): Promise<Result<{ document: JwksDocument; ttlSeconds: number }, 'INVALID_JWT'>> => {
	const response = await fetch(jwksUrl);
	if (!response.ok) {
		return Err('INVALID_JWT');
	}

	const document = (await response.json()) as unknown;
	if (!isJwksDocument(document)) {
		return Err('INVALID_JWT');
	}

	return OK({
		document,
		ttlSeconds: getCacheTtlSeconds(response.headers.get('cache-control')),
	});
};

const getMatchingJwk = (document: JwksDocument, header: JwtHeader): JwksKey | null => {
	return (
		document.keys.find((key) => {
			return (
				key.kid === header.kid &&
				key.kty === JWT_ALGORITHMS[header.alg].keyType &&
				(key.alg === undefined || key.alg === header.alg) &&
				(key.use === undefined || key.use === 'sig')
			);
		}) ?? null
	);
};

const getJwtVerificationKey = async (
	env: Pick<Env, 'JwksCacheKV'>,
	jwksUrl: string,
	header: JwtHeader,
): Promise<Result<JsonWebKey, 'INVALID_JWT'>> => {
	const cachedDocument = await readCachedJwks(env, jwksUrl);
	const cachedKey = cachedDocument ? getMatchingJwk(cachedDocument, header) : null;
	if (cachedKey) {
		return OK(cachedKey);
	}

	const freshDocument = await fetchJwks(jwksUrl);
	if (!freshDocument.success) {
		return freshDocument;
	}

	await writeCachedJwks(env, jwksUrl, freshDocument.value.document, freshDocument.value.ttlSeconds);
	const freshKey = getMatchingJwk(freshDocument.value.document, header);
	return freshKey ? OK(freshKey) : Err('INVALID_JWT');
};

const isJwtTimeValid = (payload: JwtPayload): boolean => {
	const now = Math.floor(Date.now() / 1000);
	if (payload.exp <= now) {
		return false;
	}

	return payload.nbf === undefined || payload.nbf <= now;
};

const verifyJwtSignature = async (jwt: ParsedJwt, jwk: JsonWebKey): Promise<boolean> => {
	const algorithm = JWT_ALGORITHMS[jwt.header.alg];
	const key = await crypto.subtle.importKey('jwk', jwk, algorithm.importAlgorithm, false, ['verify']);
	return crypto.subtle.verify(algorithm.verifyAlgorithm, key, jwt.signature, textEncoder.encode(jwt.signingInput));
};

export const authorizeServiceRequest = async (
	env: Pick<Env, 'JwksCacheKV'>,
	options: {
		hostnameConfig: HostnameConfig;
		request: Request;
	},
): Promise<Result<{ payload: JwtPayload }, ServiceAuthError>> => {
	if (!options.hostnameConfig.jwks_url) {
		return Err('JWT_NOT_CONFIGURED');
	}

	const tokenResult = getBearerToken(options.request);
	if (!tokenResult.success) {
		return tokenResult;
	}

	const parsedJwt = parseJwt(tokenResult.value);
	if (!parsedJwt.success || !isJwtTimeValid(parsedJwt.value.payload)) {
		return Err('INVALID_JWT');
	}

	const jwkResult = await getJwtVerificationKey(env, options.hostnameConfig.jwks_url, parsedJwt.value.header);
	if (!jwkResult.success) {
		return jwkResult;
	}

	const isValid = await verifyJwtSignature(parsedJwt.value, jwkResult.value);
	return isValid ? OK({ payload: parsedJwt.value.payload }) : Err('INVALID_JWT');
};
