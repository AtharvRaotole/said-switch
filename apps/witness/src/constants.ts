/** The live Telegram room. The demo gateway never publishes it. */
export const PRIVATE_TELEGRAM_ROOM_ID = '8bab483d-b9b1-4dc6-8f3c-8323fcd7916b';

/** Dedicated demo Switch. Not the current server on port 8000. */
export const DEMO_SWITCH_URL = 'http://127.0.0.1:8100';

/** Dedicated demo notary. Not the current notary on port 7410. */
export const DEMO_NOTARY_URL = 'http://127.0.0.1:8110';

export const DEMO_BUILDER_PORT = 8120;
export const DEMO_GATEWAY_PORT = 8130;
export const DEMO_MATTERMOST_PORT = 8165;
export const DEMO_HOME_NAME = '.said-demo';

/** Ports that belong to the current Telegram stack or the local console. */
export const RESERVED_PORTS = [8000, 7410, 7420, 7400, 8065] as const;
