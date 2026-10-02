// Assemble what Spacefast publishes: the built page at the root, the worker routes, and
// the modules they import, keeping the repository's layout so those imports resolve.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve( import.meta.dirname, '..' );
const out = path.join( root, 'dist-spacefast' );

rmSync( out, { recursive: true, force: true } );
mkdirSync( out, { recursive: true } );

cpSync( path.join( root, 'dist' ), out, { recursive: true } );
for ( const dir of [ 'functions', 'src' ] ) {
	cpSync( path.join( root, dir ), path.join( out, dir ), {
		recursive: true,
		filter: ( from ) => ! from.endsWith( '.test.ts' ),
	} );
}
cpSync( path.join( root, 'sf.jsonc' ), path.join( out, 'sf.jsonc' ) );

console.log( `Assembled ${ out }` );
