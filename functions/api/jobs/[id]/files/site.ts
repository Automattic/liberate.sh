import { UserError } from '../../../../../src/server/guards.ts';
import { asUserError } from '../../../../../src/server/wpcom.ts';
import { isJobId } from '../../../../../src/shared.ts';
import { answer, runtime, type Context } from '../../../../_lib/runtime.ts';

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
		if ( ! session.archive_url ) {
			throw new UserError( 'This file isn’t available.', 404 );
		}
		// Worth knowing when a slot is needed, never worth failing the download over.
		await store.markDownloaded( id ).catch( () => undefined );
		// Signed and short-lived, which is why it is read fresh on every click.
		return Response.redirect( session.archive_url, 302 );
	} );
}
