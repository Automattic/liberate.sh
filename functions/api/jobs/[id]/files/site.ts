import { UserError } from '../../../../../src/server/guards.ts';
import { asUserError } from '../../../../../src/server/wpcom.ts';
import { isJobId } from '../../../../../src/shared.ts';
import { answer, runtime, type Context } from '../../../../_lib/runtime.ts';

export async function GET( request: Request, context: Context ) {
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
		// HEAD reaches this handler too, and only a GET takes the copy. WordPress.com counts
		// a copy's first download; the report outlives the redirect rather than holding it up.
		if ( request.method === 'GET' ) {
			const report = client
				.downloaded( id )
				.catch( ( error ) => console.error( 'download_report_failed', id, String( error ) ) );
			context.ctx?.waitUntil( report );
		}
		// Signed and short-lived, which is why it is read fresh on every click.
		return Response.redirect( session.archive_url, 302 );
	} );
}
