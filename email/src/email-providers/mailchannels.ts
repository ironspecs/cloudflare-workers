import { isHeaders } from '../common';
import { EmailContent, EmailContact, HTTPResponse, TransactionalEmailProvider } from '../emails';

export type EmailDkimConfig = {
	/**
	 * Encode in base64.
	 *
	 * Used to sign the email, and is required if you don't want your email to
	 * be marked automatically as spam.
	 */
	dkim_private_key: string;

	/**
	 * The dkim_selector is used to retrieve the public key from the DNS record, for example "my_selector" in
	 * "my_selector._domainkey.example.com" where "_domainkey" is a required string everyone uses and "example.com"
	 * is the domain used in the "From" field.
	 *
	 * Certain email services like SendGrid may require different values in the DNS record than "_domainkey",
	 * but it is rare. Check the documentation for the possibility.
	 *
	 * Note that the selector may change when you rotate your keys. You upload a new public key to a new DNS
	 * record and then change the selector to the new value. You should keep the old key in the DNS record for
	 * up to seven days to allow the receiving servers to verify the old emails that may be in transit since
	 * there is a heavy penalty that is remembered for a long time if any emails are ever marked as spam.
	 */
	dkim_selector: string;

	/** The domain used in the "From" field. */
	dkim_domain: string;
};

export type MailchannelEmail = {
	content: EmailContent[];
	from: EmailContact;
	subject: string;
	reply_to?: EmailContact;
	personalizations: (Partial<EmailDkimConfig> & {
		to: EmailContact[];
		cc?: EmailContact[];
		bcc?: EmailContact[];
		reply_to?: EmailContact;
		from?: EmailContact;
		subject?: string;
	})[];

	/** If true, don't actually send the email. */
	dry_run?: true;
};

/**
 * Convert headers to a key-value object.
 */
const getHeaderObj = (headers: any) => {
	if (!isHeaders(headers)) {
		throw new Error('Invalid headers object');
	}

	const headerObj = {} as Record<string, string>;
	headers.forEach((value, name) => {
		headerObj[name] = value;
	});
	return headerObj;
};

/**
 * Set the DKIM values from the environment. Returns appropriate error if the values are unset.
 */
const applyDkim = (email: MailchannelEmail, dkimConfig: EmailDkimConfig) => {
	email.personalizations.forEach((personalization) => {
		Object.assign(personalization, dkimConfig);
	});
};

export class MailchannelsEmailProvider implements TransactionalEmailProvider {
	constructor() {}

	async sendEmail(email: {
		from: EmailContact;
		to: EmailContact;
		subject: string;
		content: EmailContent;
		dkim?: EmailDkimConfig;
	}): Promise<HTTPResponse> {
		const mailchannelEmail: MailchannelEmail = {
			content: [email.content],
			subject: email.subject,
			from: email.from,
			personalizations: [
				{
					to: [email.to],
				},
			],
		};

		return sendMailchannelsEmail(mailchannelEmail, { dkim: email.dkim });
	}
}

/**
 * Send an email using MailChannels.
 *
 * @see https://blog.cloudflare.com/sending-email-from-workers-with-mailchannels/
 */
export const sendMailchannelsEmail = async (email: MailchannelEmail, options: { dkim?: EmailDkimConfig }): Promise<HTTPResponse> => {
	console.log('mailchannels::sendMailchannelsEmail', email);

	if (options.dkim) {
		applyDkim(email, options.dkim);
	}

	const resp = await fetch(
		new Request('https://api.mailchannels.net/tx/v1/send', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(email),
		}),
	);

	return {
		status: resp.status,
		statusText: resp.statusText,
		headers: getHeaderObj(resp.headers),
		body: await resp.text(),
	};
};
