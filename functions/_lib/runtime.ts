import { UserError, verifyTurnstile } from '../../src/server/guards.ts';
import { previewClient, type PreviewClient } from '../../src/server/wpcom.ts';
import { databaseStore, type Database } from './store.ts';
import type { Config } from '../../src/server/config.ts';
import type { JobStore } from '../../src/server/store.ts';

export interface Env extends Record< string, unknown > {
	DB: Database;
}

export interface Context {
	params: Record< string, string >;
	env: Env;
}

const RESERVED_SUFFIXES = [ '.localhost', '.local', '.internal', '.test', '.example', '.invalid' ];

/**
 * A worker has no resolver, so a host is judged on its name alone and WordPress.com
 * checks the address again before it fetches anything.
 */
export async function checkHost( hostname: string ) {
	const host = hostname.toLowerCase();
	const literal = /^\d{1,3}(\.\d{1,3}){3}$/.test( host ) || host.includes( ':' );
	if (
		literal ||
		host === 'localhost' ||
		! host.includes( '.' ) ||
		RESERVED_SUFFIXES.some( ( suffix ) => host.endsWith( suffix ) )
	) {
		throw new UserError( 'That address isn’t a public website.' );
	}
}

/** Everything a route needs, from the space's environment. */
export function runtime( env: Env ): {
	config: Config;
	store: JobStore;
	client: PreviewClient;
} {
	const number = ( name: string, fallback: number ) => {
		const value = Number( env[ name ] );
		return Number.isFinite( value ) && value > 0 ? value : fallback;
	};
	const clientId = String( env.WPCOM_CLIENT_ID ?? '' ).trim();
	const clientSecret = String( env.WPCOM_CLIENT_SECRET ?? '' ).trim();
	if ( ! clientId || ! clientSecret ) {
		throw new Error( 'Set WPCOM_CLIENT_ID and WPCOM_CLIENT_SECRET on this space.' );
	}
	const turnstileSiteKey = String( env.TURNSTILE_SITE_KEY ?? '' ).trim();
	const turnstileSecretKey = String( env.TURNSTILE_SECRET_KEY ?? '' ).trim();

	const config = {
		port: 0,
		production: true,
		dataDir: '',
		retentionMs: number( 'LIBERATE_RETENTION_HOURS', 72 ) * 3_600_000,
		jobsPerHour: number( 'LIBERATE_JOBS_PER_HOUR', 3 ),
		trustProxy: 1,
		turnstile:
			turnstileSiteKey && turnstileSecretKey
				? { siteKey: turnstileSiteKey, secretKey: turnstileSecretKey }
				: undefined,
		fakePipeline: false,
		wpcom: { clientId, clientSecret },
		apiBase: String( env.WPCOM_API_BASE ?? 'https://public-api.wordpress.com' ).replace(
			/\/$/,
			''
		),
	} satisfies Config;

	return { config, store: databaseStore( env.DB ), client: previewClient( config ) };
}

export const json = ( body: unknown, status = 200 ) =>
	Response.json( body, { status, headers: { 'cache-control': 'no-store' } } );

/** Answer a route, turning a visitor-safe error into its own status. */
export async function answer( work: () => Promise< Response > ) {
	try {
		return await work();
	} catch ( error ) {
		if ( error instanceof UserError ) {
			return json( { error: error.message }, error.status );
		}
		console.error( error );
		return json( { error: 'Something went wrong. Please try again.' }, 500 );
	}
}

export { verifyTurnstile };
