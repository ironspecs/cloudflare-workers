import type { GenericSchema, InferOutput } from 'valibot';
import { safeParseAsync } from 'valibot';
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

	if (contentType?.startsWith('application/json')) {
		try {
			return OK(await request.json());
		} catch (e: unknown) {
			return Err('INVALID_JSON');
		}
	}

	if (contentType?.startsWith('application/x-www-form-urlencoded')) {
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

export type ParseRequestError = 'INVALID_FORMDATA' | 'INVALID_JSON' | string[];

export const parseRequest = async <T extends GenericSchema>(
	request: Request,
	schema: T,
): Promise<Result<InferOutput<T>, ParseRequestError>> => {
	const requestQueryResult = await getRequestQueryData(request);
	if (!requestQueryResult.success) {
		return requestQueryResult;
	}

	const requestDataResult = await getRequestBodyData(request);
	if (!requestDataResult.success) {
		return requestDataResult;
	}

	const parsedResult = await safeParseAsync(schema, {
		query: requestQueryResult.value,
		body: requestDataResult.value,
	});

	if (!parsedResult.success) {
		return Err(parsedResult.issues.map((issue) => issue.message));
	}

	return OK(parsedResult.output);
};

export const handle = <T extends GenericSchema, R, E>(
	schema: T,
	handler: (request: Request, env: Env, data: InferOutput<T>) => Promise<Result<R, E>>,
) => {
	return async (request: Request, env: Env): Promise<Response> => {
		const parsedResult = await parseRequest(request, schema);
		if (!parsedResult.success) {
			return createJSONResponse({ ok: false, error: parsedResult.error }, 400);
		}

		const result = await handler(request, env, parsedResult.value);
		return createJSONResponse(result, result.success ? 200 : 400);
	};
};
