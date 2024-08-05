import { MailchannelsEmailProvider } from "../email-providers/mailchannels";
import { EmailContact, EmailContent, EmailDkimConfig, HTTPResponse, TransactionalEmailProvider } from "./types";


export class MockEmailProvider implements TransactionalEmailProvider {
	constructor() { }

	async sendEmail(_email: {
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

/**
 * Get the transactional email provider based on the name.
 */
export const getTransactionalEmailProvider = (name?: string): TransactionalEmailProvider => {
	switch (name) {
		case 'mailchannels':
			return new MailchannelsEmailProvider();
		default:
			return new MockEmailProvider();
	}
};
