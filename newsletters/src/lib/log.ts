type LogFieldValue = boolean | number | string | null;
type LogFields = Record<string, LogFieldValue>;

const getErrorMessage = (error: unknown): string => {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
};

const getErrorName = (error: unknown): string => {
	if (error instanceof Error) {
		return error.name;
	}

	return 'UnknownError';
};

const createErrorFields = (error: unknown): LogFields => {
	return {
		error_message: getErrorMessage(error),
		error_name: getErrorName(error),
	};
};

const createLogFields = (event: string, fields: LogFields = {}): LogFields => {
	return {
		event,
		...fields,
	};
};

export const logInfo = (event: string, fields: LogFields = {}): void => {
	console.log(createLogFields(event, fields));
};

export const logWarn = (event: string, fields: LogFields = {}): void => {
	console.warn(createLogFields(event, fields));
};

export const logError = (event: string, error: unknown, fields: LogFields = {}): void => {
	console.error(createLogFields(event, { ...fields, ...createErrorFields(error) }));
};
