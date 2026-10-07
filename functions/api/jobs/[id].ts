import { UserError } from '../../../src/server/guards.ts';
import { asUserError, hasExpired, viewFrom } from '../../../src/server/wpcom.ts';
import { isJobId } from '../../../src/shared.ts';
import { answer, json, runtime, type Context } from '../../_lib/runtime.ts';

export async function GET( _request: Request, context: Context ) {
	return answer( async () => {
		const { store, client } = runtime( context.env );
		const id = context.params.id;
		const record = isJobId( id ) ? await store.get( id ) : undefined;
		if ( ! record ) {
			throw new UserError( 'This link has expired or never existed.', 404 );
		}
		const session = await client.status( id ).catch( ( error ) => {
			throw asUserError( error );
		} );
		if ( hasExpired( session ) ) {
			throw new UserError( 'This link has expired or never existed.', 404 );
		}
		// The size is worth one extra request, once, so the button can promise a number.
		if ( ! record.bytes && session.archive_url ) {
			record.bytes = await client.sizeOf( session.archive_url );
			if ( record.bytes ) {
				await store.put( record );
			}
		}
		return json( viewFrom( record, session ) );
	} );
}
