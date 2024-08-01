/*
 Hostname Config is optional.
 May provide additional settings for a signup. (LEFT JOIN)
 */
CREATE TABLE hostname_config (
	hostname VARCHAR(127) NOT NULL PRIMARY KEY,
	google_recaptcha_secret VARCHAR(127)
);
/*
 List config is optional.
 May provide additional settings for a signup. (LEFT JOIN)
 */
CREATE TABLE list_config (
	id VARCHAR(15) NOT NULL PRIMARY KEY,
	hostname VARCHAR(127) NOT NULL,
	list_name VARCHAR(15) NOT NULL,
	email_confirm VARCHAR(15)
);
CREATE UNIQUE INDEX list_config_hostname_list_name ON list_config (hostname, list_name);
/*
 Main table.
 May add or remove without JOINs.
 Unique email, hostname, list_name, but list_name can be NULL.
 */
CREATE TABLE subscription (
	id VARCHAR(15) NOT NULL PRIMARY KEY,
	/* From the request body. Must be a POST. */
	email VARCHAR(127) NOT NULL,
	/* From the request url and header origin (not header hostname). Remember to verify a match! */
	hostname VARCHAR(127) NOT NULL,
	/* Use empty string to represent no list, because NULL does not enforce uniqueness. */
	list_name VARCHAR(15) NOT NULL,
	created_at BIGINT NOT NULL,
	person_name VARCHAR(127),
	email_confirmed_at BIGINT,
	unsubscribed_at BIGINT,
	/* All hostnames must be known. */
	FOREIGN KEY (hostname) REFERENCES hostname_config(hostname)
);
CREATE UNIQUE INDEX subscription_email_hostname_list_name ON subscription(email, hostname, list_name);
/*
 Token table. The token is the id.
 May add or remove without JOINs.
 Unique subscription_id, token_type.
 A subscription may have multiple valid types of tokens but never more than one of the same type.
 Either deny new tokens or delete the old one to prevent DDOS or resource attacks.
 */
CREATE TABLE subscription_token (
	id VARCHAR(127) NOT NULL PRIMARY KEY,
	subscription_id VARCHAR(15) NOT NULL,
	token_type VARCHAR(15) NOT NULL,
	expires_at BIGINT NOT NULL,
	FOREIGN KEY (subscription_id) REFERENCES subscription(id)
);
CREATE UNIQUE INDEX subscription_token_subscription_id_token_type ON subscription_token(subscription_id, token_type);
/* Test example */
INSERT INTO hostname_config (hostname, google_recaptcha_secret)
VALUES ('example.com', null)
