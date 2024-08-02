import { object, string, literal, optional, email as validEmail, union, is, type Output } from 'valibot';

export const EmailContentSchema = object({
	type: union([literal('text/plain'), literal('text/html')]),
	value: string(),
});
export type EmailContent = Output<typeof EmailContentSchema>;

export const EmailContactSchema = object({
	email: string([validEmail()]),
	name: optional(string()),
});
export type EmailContact = Output<typeof EmailContactSchema>;

export const EmailDkimConfigSchema = object({
	dkim_private_key: string(),
	dkim_selector: string(),
	dkim_domain: string(),
});
export type EmailDkimConfig = Output<typeof EmailDkimConfigSchema>;
export const isEmailDkimConfig = (obj: any): obj is EmailDkimConfig => is(EmailDkimConfigSchema, obj);

export type HTTPResponse = {
	status: number;
	statusText: string;
	headers: Record<string, string>;
	body: string;
};

export interface TransactionalEmailProvider {
	sendEmail(email: {
		from: EmailContact;
		to: EmailContact[];
		subject: string;
		content: EmailContent[];
		dkim?: EmailDkimConfig;
	}): Promise<HTTPResponse>;
}

export class MockEmailProvider implements TransactionalEmailProvider {
	constructor() {}

	async sendEmail(email: {
		from: EmailContact;
		to: EmailContact[];
		subject: string;
		content: EmailContent[];
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
