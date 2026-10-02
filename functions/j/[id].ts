import { isJobId } from '../../src/shared.ts';
import { answer, runtime, type Context } from '../_lib/runtime.ts';

const escape = ( text: string ) =>
	text.replace( /[&<>"']/g, ( character ) => `&#${ character.charCodeAt( 0 ) };` );

/** Replace the content of a meta tag the page already carries. */
const setMeta = ( html: string, attribute: string, name: string, value: string ) =>
	html.replace(
		new RegExp( `(<meta\\s+${ attribute }="${ name }"\\s+content=")[^"]*(")`, 'i' ),
		`$1${ escape( value ) }$2`
	);

/**
 * A shared job link deserves to say which site it is. Crawlers don't run the page's
 * JavaScript, so the shell is served from here with that job's own title on it.
 */
export async function GET( request: Request, context: Context ) {
	return answer( async () => {
		const shell = await fetch( new URL( '/index.html', request.url ) );
		let html = await shell.text();

		const id = context.params.id;
		const record = isJobId( id ) ? await runtime( context.env ).store.get( id ) : undefined;
		const name = record?.siteName ?? record?.host;
		const title = name ? `${ name } is free · liberate.sh` : 'liberate.sh';
		const description = record
			? `${ name } left its old platform. Download it as a WordPress site you own, and host it anywhere.`
			: 'Turn any website into a WordPress site you can download and host anywhere.';

		html = html.replace( /<title>[^<]*<\/title>/i, `<title>${ escape( title ) }</title>` );
		html = setMeta( html, 'property', 'og:title', title );
		html = setMeta( html, 'property', 'og:description', description );
		html = setMeta( html, 'property', 'og:url', new URL( request.url ).href );
		html = setMeta( html, 'name', 'twitter:title', title );
		html = setMeta( html, 'name', 'twitter:description', description );
		html = setMeta( html, 'name', 'description', description );
		// The link is private: it is shareable, not searchable.
		html = setMeta( html, 'name', 'robots', 'noindex, nofollow' );
		html = html.replace(
			/<link rel="canonical" href="[^"]*" \/>/i,
			`<link rel="canonical" href="${ escape( new URL( request.url ).href ) }" />`
		);

		return new Response( html, {
			headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
		} );
	} );
}
