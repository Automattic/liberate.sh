import { GET } from './site.ts';
import type { Context, Env } from '../../../../_lib/runtime.ts';

const ID = 'a'.repeat( 32 );
const downloaded = vi.fn( async ( _id: string ) => {} );

vi.mock( '../../../../_lib/runtime.ts', async ( original ) => ( {
	...( await original< typeof import('../../../../_lib/runtime.ts') >() ),
	runtime: () => ( {
		store: {
			get: async () => ( { id: ID } ),
			markDownloaded: async () => {},
		},
		client: {
			status: async () => ( {
				session_id: ID,
				state: 'preview_ready',
				archive_url: 'https://archives.example.com/site.zip',
			} ),
			downloaded,
		},
	} ),
} ) );

/** A route's context, holding on to whatever it hands to waitUntil. */
const contextFor = () => {
	const carried: Promise< unknown >[] = [];
	const context: Context = {
		params: { id: ID },
		env: {} as Env,
		ctx: { waitUntil: ( promise ) => void carried.push( promise ) },
	};
	return { context, carried };
};

const url = `https://liberate.sh/api/jobs/${ ID }/files/site`;

beforeEach( () => downloaded.mockClear() );

describe( 'GET /api/jobs/:id/files/site on Spacefast', () => {
	it( 'redirects, and reports the download past the response', async () => {
		const { context, carried } = contextFor();
		const response = await GET( new Request( url ), context );

		expect( response.status ).toBe( 302 );
		expect( response.headers.get( 'location' ) ).toBe( 'https://archives.example.com/site.zip' );
		expect( downloaded ).toHaveBeenCalledWith( ID );
		expect( carried ).toHaveLength( 1 );
	} );

	it( 'still redirects when WordPress.com cannot take the report', async () => {
		downloaded.mockRejectedValueOnce( new Error( 'unavailable' ) );
		const { context, carried } = contextFor();
		const response = await GET( new Request( url ), context );

		expect( response.status ).toBe( 302 );
		await expect( Promise.all( carried ) ).resolves.toBeDefined();
	} );

	it( 'reports nothing for a HEAD, which takes no copy', async () => {
		const { context, carried } = contextFor();
		const response = await GET( new Request( url, { method: 'HEAD' } ), context );

		expect( response.status ).toBe( 302 );
		expect( downloaded ).not.toHaveBeenCalled();
		expect( carried ).toHaveLength( 0 );
	} );
} );
