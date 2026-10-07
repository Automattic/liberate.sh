import { parseSiteUrl, UserError } from '../../src/server/guards.ts';
import { countStart } from '../_lib/limit.ts';
import {
	asUserError,
	fetchTitle,
	isSessionLimit,
	siteNameFrom,
	viewFrom,
} from '../../src/server/wpcom.ts';
import {
	answer,
	checkHost,
	json,
	runtime,
	verifyTurnstile,
	type Context,
} from '../_lib/runtime.ts';

export async function POST( request: Request, context: Context ) {
	return answer( async () => {
		const { config, store, client } = runtime( context.env );
		const body = ( await request.json().catch( () => ( {} ) ) ) as Record< string, unknown >;
		if ( body.consent !== true ) {
			throw new UserError( 'Please confirm that you own this site or may copy it.' );
		}
		const url = parseSiteUrl( body.url );
		const refund = await countStart( context.env.DB, request, config.jobsPerHour );
		try {
			if (
				config.turnstile &&
				! ( await verifyTurnstile( config.turnstile.secretKey, body.turnstileToken, undefined ) )
			) {
				throw new UserError( 'We couldn’t verify that you’re human. Please try again.', 403 );
			}
			await checkHost( url.hostname );

			const siteName = await fetchTitle( url.href, checkHost )
				.then( siteNameFrom )
				.catch( () => undefined );

			// A ready capture holds one of the app's five slots until it is let go, so the
			// oldest finished one makes way rather than turning visitors away.
			const start = async () => {
				try {
					return await client.create( url.href );
				} catch ( error ) {
					if ( ! isSessionLimit( error ) ) {
						throw error;
					}
					for ( const record of await store.list() ) {
						const session = await client.status( record.id ).catch( () => undefined );
						if ( session?.state === 'preview_ready' ) {
							await client.revoke( record.id ).catch( () => undefined );
							return client.create( url.href );
						}
					}
					throw error;
				}
			};
			// The second try can be refused too, and the visitor should hear why either way.
			const session = await start().catch( ( error ) => {
				throw asUserError( error );
			} );

			const now = Date.now();
			const record = {
				id: session.session_id,
				url: url.href,
				host: url.hostname,
				siteName,
				createdAt: now,
				expiresAt: now + config.retentionMs,
			};
			await store.put( record );
			return json( viewFrom( record, session ), 201 );
		} catch ( error ) {
			// Only a capture that actually starts counts against the visitor's hour.
			await refund();
			throw error;
		}
	} );
}
