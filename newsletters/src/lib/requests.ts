import { BaseSchema, Output, safeParseAsync } from 'valibot';
import { Err, OK, Result } from './results';
import { Env } from '../common';
import { createJSONResponse } from './responses';

const getRequestQueryData = async (request: Request): Promise<Result<Record<string, string>, never>> => {
	const url = new URL(request.url);

	const data: Record<string, string> = {};
	for (const [key, value] of url.searchParams.entries()) {
		data[key] = value;
	}

	return OK(data);
};

const getRequestBodyData = async (
	request: Request,
): Promise<Result<Record<string, unknown> | null, 'INVALID_JSON' | 'INVALID_FORMDATA'>> => {
	const contentType = request.headers.get('content-type');

	if (contentType === 'application/json') {
		try {
			return OK(await request.json());
		} catch (e: unknown) {
			return Err('INVALID_JSON');
		}
	}

	if (contentType === 'application/x-www-form-urlencoded') {
		try {
			const formData = await request.formData();
			const data: Record<string, unknown> = {};

			for (const [key, value] of formData.entries()) {
				data[key] = value;
			}
			return OK(data);
		} catch (e: unknown) {
			return Err('INVALID_FORMDATA');
		}
	}

	return OK(null);
};

/**
 * Create a request handler in a standard way for the project.
 */
export const handle = <T extends BaseSchema, R, E>(
	schema: T,
	handler: (request: Request, env: Env, data: Output<T>) => Promise<Result<R, E>>,
) => {
	return async (request: Request, env: Env): Promise<Response> => {
		const requestQueryResult = await getRequestQueryData(request);
		if (!requestQueryResult.success) {
			return createJSONResponse(requestQueryResult, 400);
		}

		const requestDataResult = await getRequestBodyData(request);
		if (!requestDataResult.success) {
			return createJSONResponse(requestDataResult, 400);
		}

		const parsedResult = await safeParseAsync(schema, {
			query: requestQueryResult.value,
			body: requestDataResult.value,
		});

		if (!parsedResult.success) {
			return createJSONResponse({ ok: false, error: parsedResult.issues.map((issue) => issue.message) }, 400);
		}

		const result = await handler(request, env, parsedResult);
		return createJSONResponse(result, result.success ? 200 : 400);
	};
};
