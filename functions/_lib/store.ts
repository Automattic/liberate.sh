import type { JobRecord, JobStore } from '../../src/server/store.ts';

/** The D1-shaped binding a Functions worker gets, over the space's own MySQL. */
export interface Database {
	prepare( sql: string ): {
		bind( ...values: unknown[] ): Statement;
	} & Statement;
}

interface Statement {
	run(): Promise< unknown >;
	first(): Promise< unknown >;
	all(): Promise< unknown >;
}

const TABLE = `CREATE TABLE IF NOT EXISTS jobs (
	id VARCHAR(32) NOT NULL PRIMARY KEY,
	url TEXT NOT NULL,
	host VARCHAR(255) NOT NULL,
	siteName VARCHAR(255) NULL,
	bytes BIGINT NULL,
	createdAt BIGINT NOT NULL,
	expiresAt BIGINT NOT NULL
)`;

/** `all()` is a D1 shape; the rows may arrive bare or wrapped. */
const rowsOf = ( result: unknown ): Record< string, unknown >[] => {
	const rows = Array.isArray( result )
		? result
		: ( result as { results?: unknown[] } )?.results ?? [];
	return rows as Record< string, unknown >[];
};

const asRecord = ( row: Record< string, unknown > | undefined ): JobRecord | undefined =>
	row
		? {
				id: String( row.id ),
				url: String( row.url ),
				host: String( row.host ),
				siteName: row.siteName ? String( row.siteName ) : undefined,
				bytes: row.bytes === null || row.bytes === undefined ? undefined : Number( row.bytes ),
				createdAt: Number( row.createdAt ),
				expiresAt: Number( row.expiresAt ),
		  }
		: undefined;

/** The same few hundred bytes per job as the file store, in the space's database. */
export function databaseStore( db: Database ): JobStore {
	// A cold worker may be the first to touch it, and it is a no-op once the table is there.
	const ready = db.prepare( TABLE ).run();

	return {
		async put( record ) {
			await ready;
			await db
				.prepare(
					'REPLACE INTO jobs (id, url, host, siteName, bytes, createdAt, expiresAt)' +
						' VALUES (?, ?, ?, ?, ?, ?, ?)'
				)
				.bind(
					record.id,
					record.url,
					record.host,
					record.siteName ?? null,
					record.bytes ?? null,
					record.createdAt,
					record.expiresAt
				)
				.run();
		},

		async get( id ) {
			await ready;
			const row = ( await db
				.prepare( 'SELECT * FROM jobs WHERE id = ? AND expiresAt > ?' )
				.bind( id, Date.now() )
				.first() ) as Record< string, unknown > | undefined;
			return asRecord( row ?? undefined );
		},

		async list() {
			await ready;
			const rows = rowsOf(
				await db
					.prepare( 'SELECT * FROM jobs WHERE expiresAt > ? ORDER BY createdAt ASC LIMIT 100' )
					.bind( Date.now() )
					.all()
			);
			return rows.map( ( row ) => asRecord( row )! );
		},

		async prune( now = Date.now() ) {
			await ready;
			const rows = rowsOf(
				await db.prepare( 'SELECT id FROM jobs WHERE expiresAt <= ? LIMIT 100' ).bind( now ).all()
			);
			if ( rows.length ) {
				await db.prepare( 'DELETE FROM jobs WHERE expiresAt <= ?' ).bind( now ).run();
			}
			return rows.map( ( row ) => String( row.id ) );
		},
	};
}
