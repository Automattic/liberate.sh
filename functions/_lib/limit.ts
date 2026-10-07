import { UserError } from '../../src/server/guards.ts';
import type { Database } from './store.ts';

const TABLE = `CREATE TABLE IF NOT EXISTS hits (
	visitor VARCHAR(64) NOT NULL,
	hour BIGINT NOT NULL,
	count INT NOT NULL,
	PRIMARY KEY (visitor, hour)
)`;

/** Who asked, as far as the edge can tell. */
function visitorOf( request: Request ) {
	const forwarded = request.headers.get( 'x-forwarded-for' ) ?? '';
	return (
		request.headers.get( 'cf-connecting-ip' ) ??
		request.headers.get( 'x-real-ip' ) ??
		forwarded.split( ',' )[ 0 ].trim() ??
		''
	);
}

/** Addresses are counted, not kept. */
async function fingerprint( value: string ) {
	const bytes = new TextEncoder().encode( `liberate.sh:${ value || 'unknown' }` );
	const digest = await crypto.subtle.digest( 'SHA-256', bytes );
	return [ ...new Uint8Array( digest ) ]
		.slice( 0, 16 )
		.map( ( byte ) => byte.toString( 16 ).padStart( 2, '0' ) )
		.join( '' );
}

/**
 * Count this visitor's starts for the hour and refuse past the limit. The daily budget
 * belongs to everyone, so one visitor cannot spend it alone.
 *
 * A start is counted while it is under way, so a burst can't slip past, and the returned
 * function gives it back if it doesn't go through: like the Express server, only the
 * captures that actually start count against the visitor.
 */
export async function countStart( db: Database, request: Request, perHour: number ) {
	const visitor = await fingerprint( visitorOf( request ) );
	const hour = Math.floor( Date.now() / 3_600_000 );
	// Best effort: a lost refund costs the visitor one start, not the error they should see.
	const refund = () =>
		db
			.prepare( 'UPDATE hits SET count = count - 1 WHERE visitor = ? AND hour = ? AND count > 0' )
			.bind( visitor, hour )
			.run()
			.then(
				() => undefined,
				() => undefined
			);

	await db.prepare( TABLE ).run();
	await db
		.prepare(
			'INSERT INTO hits (visitor, hour, count) VALUES (?, ?, 1)' +
				' ON DUPLICATE KEY UPDATE count = count + 1'
		)
		.bind( visitor, hour )
		.run();
	// Yesterday's counts are of no use to anyone.
	await db
		.prepare( 'DELETE FROM hits WHERE hour < ?' )
		.bind( hour - 24 )
		.run();

	const row = ( await db
		.prepare( 'SELECT count FROM hits WHERE visitor = ? AND hour = ?' )
		.bind( visitor, hour )
		.first() ) as { count?: number } | undefined;

	if ( Number( row?.count ?? 0 ) > perHour ) {
		await refund();
		throw new UserError(
			'You’ve liberated several sites already. Please try again in an hour.',
			429
		);
	}
	return refund;
}
