// Assemble what Spacefast publishes: the built page at the root, and each worker route
// bundled into one file so nothing else has to ship beside it.
import { build } from 'esbuild';
import { cpSync, globSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve( import.meta.dirname, '..' );
const out = path.join( root, 'dist-spacefast' );

rmSync( out, { recursive: true, force: true } );
mkdirSync( out, { recursive: true } );

cpSync( path.join( root, 'dist' ), out, { recursive: true } );
cpSync( path.join( root, 'sf.jsonc' ), path.join( out, 'sf.jsonc' ) );

// Routes only: anything under `_lib` is a helper, and gets inlined into the routes.
const routes = globSync( 'functions/**/*.ts', { cwd: root } ).filter(
	( file ) => ! path.basename( path.dirname( file ) ).startsWith( '_' )
);

await build( {
	entryPoints: routes.map( ( file ) => path.join( root, file ) ),
	outdir: path.join( out, 'functions' ),
	outbase: path.join( root, 'functions' ),
	bundle: true,
	format: 'esm',
	platform: 'neutral',
	target: 'es2022',
	logLevel: 'warning',
} );

// A real page for a real 404, wearing the same stylesheet as the rest of the site.
const index = readFileSync( path.join( out, 'index.html' ), 'utf8' );
const styles = [ ...index.matchAll( /<link rel="stylesheet"[^>]*>/g ) ].map( ( m ) => m[ 0 ] );
writeFileSync(
	path.join( out, '404.html' ),
	`<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<meta name="color-scheme" content="light" />
		<meta name="robots" content="noindex" />
		<title>Nothing here · liberate.sh</title>
		${ styles.join( '\n\t\t' ) }
	</head>
	<body>
		<div class="page">
			<header><a class="brand" href="/">liberate<span>.sh</span></a></header>
			<main class="stage">
				<h1 class="headline">Nothing<br />here.</h1>
				<p class="summary">That page doesn't exist. <a href="/">Liberate a site</a> instead.</p>
			</main>
		</div>
	</body>
</html>
`
);

console.log( `Assembled ${ out } with ${ routes.length } routes` );
