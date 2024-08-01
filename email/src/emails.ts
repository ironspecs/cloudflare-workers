export type EmailContent = {
	type: 'text/plain' | 'text/html';
	value: string;
};

export type EmailContact = {
	email: string;
	name?: string;
};

export type EmailDkimConfig = {
	dkim_private_key: string;
	dkim_selector: string;
	dkim_domain: string;
};

export const isEmailDkimConfig = (obj: any): obj is EmailDkimConfig => {
	return typeof obj.dkim_private_key === 'string' && typeof obj.dkim_selector === 'string' && typeof obj.dkim_domain === 'string';
};

export type HTTPResponse = {
	status: number;
	statusText: string;
	headers: Record<string, string>;
	body: string;
};

export interface TransactionalEmailProvider {
	sendEmail(email: {
		from: EmailContact;
		to: EmailContact;
		subject: string;
		content: EmailContent;
		dkim?: EmailDkimConfig;
	}): Promise<HTTPResponse>;
}

export class MockEmailProvider implements TransactionalEmailProvider {
	constructor() {}

	async sendEmail(email: {
		from: EmailContact;
		to: EmailContact;
		subject: string;
		content: EmailContent;
		dkim?: EmailDkimConfig;
	}): Promise<HTTPResponse> {
		return {
			status: 200,
			statusText: 'OK',
			headers: {},
			body: 'OK',
		};
	}
}
