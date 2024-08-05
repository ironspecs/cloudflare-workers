import {
	object,
	string,
	number,
	array,
	literal,
	optional,
	email as validEmail,
	union,
	is,
	unknown,
	type Output
} from 'valibot';

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

export const EmailPolicySchema = union([
	object({
		name: literal('email:send'),
		config: object({
			emailProviderName: optional(union([literal('mailchannels'), literal('mock')]))
		}, unknown())
	}),
	object({
		name: literal('email:log'),
		config: object({
			ttlSeconds: optional(number()),
			permissions: optional(array(union([literal('read'), literal('delete')])))
		}, unknown())
	}),
]);
export type EmailPolicy = Output<typeof EmailPolicySchema>;

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

/**
 * The schema for an API key info object.
 */
export const ApiKeyInfoSchema = object({
	tenantId: string(),
	expires: number(),
	policies: array(EmailPolicySchema),
	key: string(),
});
/**
 * The type for an API key info object.
 */
export type ApiKeyInfo = Output<typeof ApiKeyInfoSchema>;
