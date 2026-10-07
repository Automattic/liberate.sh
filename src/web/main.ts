import '@fontsource-variable/bricolage-grotesque/opsz.css';
import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';
import './style.css';
import {
	isJobId,
	PLATFORM_NAMES,
	platformFromHost,
	STEPS,
	type JobView,
	type PublicConfig,
	type Step,
} from '../shared.ts';
import { setupPrompt } from './prompt.ts';
import { refusalFor } from './refusal.ts';

declare global {
	interface Window {
		turnstile?: {
			render: ( element: HTMLElement, options: Record< string, unknown > ) => string;
			reset: ( id?: string ) => void;
		};
	}
}

const stage = document.getElementById( 'stage' )!;
const reducedMotion = window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;
const STEP_LABELS: Record< Step, string > = {
	scan: 'scan',
	capture: 'copy',
	import: 'rebuild',
	package: 'zip',
};

let config: PublicConfig = { retentionHours: 72 };

const retention = () =>
	config.retentionHours >= 48
		? `${ Math.round( config.retentionHours / 24 ) } days`
		: `${ config.retentionHours } hours`;
let teardown = () => {};

const escape = ( text: string ) =>
	text.replace( /[&<>"']/g, ( char ) => `&#${ char.charCodeAt( 0 ) };` );

/** A word crossed out by the marker stroke; `progress` is how much of it is struck. */
const strike = ( word: string, progress = 1 ) =>
	`<span class="x" style="--p: ${ progress }">${ escape( word ) }</span>`;

function hostOf( input: string ): string | undefined {
	try {
		return new URL( /^https?:\/\//i.test( input ) ? input : `https://${ input.trim() }` ).hostname;
	} catch {
		return undefined;
	}
}

function restartStrike( element: Element ) {
	if ( ! reducedMotion ) {
		element.classList.remove( 'draw' );
		void ( element as HTMLElement ).offsetWidth;
		element.classList.add( 'draw' );
	}
}

/** The products this one came from, shown one at a time in the footer. */
const MAKERS = [
	{
		name: 'WordPress Studio',
		href: 'https://developer.wordpress.com/studio/',
		logo: 'studio.svg',
		ratio: 1,
		label: 'Studio',
	},
	{ name: 'Tumblr', href: 'https://www.tumblr.com', logo: 'tumblr.svg', ratio: 73 / 15 },
	{ name: 'Woo', href: 'https://woocommerce.com', logo: 'woo.svg', ratio: 58 / 15 },
	{ name: 'Beeper', href: 'https://www.beeper.com', logo: 'beeper.svg', ratio: 73 / 15 },
	{
		name: 'Pocket Casts',
		href: 'https://pocketcasts.com',
		logo: 'pocket-casts.svg',
		ratio: 76 / 15,
	},
	{ name: 'Day One', href: 'https://dayoneapp.com', logo: 'day-one.svg', ratio: 96 / 15 },
	{ name: 'mesh', href: 'https://mesh.com', logo: 'mesh.svg', ratio: 66 / 15 },
	{ name: 'WordPress.com', href: 'https://wordpress.com', logo: 'wordpress.svg', ratio: 111 / 15 },
];

/** Cycle the footer's logos, the way the family they come from is usually introduced. */
function startMakers() {
	const link = document.querySelector< HTMLAnchorElement >( '.maker' );
	const stack = link?.querySelector< HTMLElement >( '.maker-stack' );
	if ( ! link || ! stack ) {
		return;
	}

	const widthOf = ( maker: ( typeof MAKERS )[ number ] ) =>
		`${ ( maker.label ? maker.ratio + 3.6 : maker.ratio ) * 1.07 }em`;

	stack.innerHTML = MAKERS.map(
		( maker ) =>
			`<span><img src="/makers/${ maker.logo }" alt="" />${
				maker.label ? `<span class="label">${ maker.label }</span>` : ''
			}</span>`
	).join( '' );
	const layers = [ ...stack.children ] as HTMLElement[];

	let index = 0;
	const show = () => {
		const maker = MAKERS[ index ];
		layers.forEach( ( layer, at ) => layer.classList.toggle( 'now', at === index ) );
		stack.style.width = widthOf( maker );
		link.href = maker.href;
		link.setAttribute( 'aria-label', maker.name );
	};
	show();

	window.setInterval( () => {
		index = ( index + 1 ) % MAKERS.length;
		show();
	}, 2600 );
}

/** A job's page belongs to whoever holds the link, not to search engines. */
function setIndexable( indexable: boolean ) {
	const robots = document.querySelector< HTMLMetaElement >( 'meta[name="robots"]' );
	if ( robots ) {
		robots.content = indexable ? 'index, follow, max-image-preview:large' : 'noindex, nofollow';
	}
	document
		.querySelector( 'link[rel="canonical"]' )
		?.setAttribute( 'href', indexable ? 'https://liberate.sh/' : window.location.href );
}

function route() {
	teardown();
	teardown = () => {};
	const id = window.location.pathname.match( /^\/j\/([^/]+)$/ )?.[ 1 ];
	setIndexable( ! id );
	if ( id && isJobId( id ) ) {
		watchJob( id );
	} else {
		showForm( new URLSearchParams( window.location.search ).get( 'url' ) ?? '' );
	}
}

function showForm( prefill: string ) {
	stage.innerHTML = `
		<h1 class="headline">Leave ${ strike( PLATFORM_NAMES[ 0 ] ) }<br>with everything.</h1>
		<form class="liberate" novalidate>
			<div class="field">
				<label class="visually-hidden" for="url">Your website’s address</label>
				<input id="url" name="url" type="text" inputmode="url" autocomplete="url"
					autocapitalize="none" spellcheck="false" placeholder="yoursite.com" />
				<button type="submit">Liberate</button>
			</div>
			<label class="consent">
				<input type="checkbox" name="consent" />
				<span>I own this site, or have permission to copy it.</span>
			</label>
			<div class="turnstile"></div>
			<p class="error" role="alert"></p>
		</form>
		<p class="fine">
			Your pages, images and the look, packed into a WordPress site you own. It’s free, and
			your files are deleted after ${ retention() }.
		</p>`;

	const word = stage.querySelector( '.x' )!;
	const form = stage.querySelector( 'form' )!;
	const input = form.querySelector< HTMLInputElement >( '#url' )!;
	const consent = form.querySelector< HTMLInputElement >( '[name="consent"]' )!;
	const button = form.querySelector( 'button' )!;
	const error = form.querySelector( '.error' )!;

	// Cycle through the platforms people leave, until the address names one.
	let next = 1;
	let pinned = false;
	const show = ( name: string ) => {
		if ( word.textContent !== name ) {
			word.textContent = name;
			restartStrike( word );
		}
	};
	const cycle = reducedMotion
		? undefined
		: window.setInterval( () => {
				if ( ! pinned ) {
					show( PLATFORM_NAMES[ next++ % PLATFORM_NAMES.length ] );
				}
		  }, 2600 );
	const onInput = () => {
		const platform = platformFromHost( hostOf( input.value ) ?? '' );
		pinned = !! platform;
		if ( platform ) {
			show( platform );
		}
	};
	input.addEventListener( 'input', onInput );
	input.value = prefill;
	onInput();

	let turnstileToken = '';
	let turnstileId: string | undefined;
	if ( config.turnstileSiteKey ) {
		void loadTurnstile().then( ( turnstile ) => {
			turnstileId = turnstile.render( form.querySelector< HTMLElement >( '.turnstile' )!, {
				sitekey: config.turnstileSiteKey,
				callback: ( token: string ) => ( turnstileToken = token ),
				'expired-callback': () => ( turnstileToken = '' ),
			} );
		} );
	}

	form.addEventListener( 'submit', async ( event ) => {
		event.preventDefault();
		error.textContent = '';
		if ( ! input.value.trim() ) {
			error.textContent = 'Enter the address of your website.';
			input.focus();
			return;
		}
		if ( ! consent.checked ) {
			error.textContent = 'Please confirm that you own this site or may copy it.';
			consent.focus();
			return;
		}
		button.disabled = true;
		button.textContent = 'Starting…';
		try {
			const response = await fetch( '/api/jobs', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify( { url: input.value, consent: true, turnstileToken } ),
			} );
			const body = await response.json().catch( () => ( {} ) );
			if ( ! response.ok ) {
				throw new Error( body.error ?? refusalFor( response.status ) );
			}
			window.history.pushState( null, '', `/j/${ body.id }` );
			route();
		} catch ( caught ) {
			error.textContent =
				caught instanceof TypeError
					? 'We couldn’t reach liberate.sh. Check your connection and try again.'
					: ( caught as Error ).message;
			button.disabled = false;
			button.textContent = 'Liberate';
			turnstileToken = '';
			window.turnstile?.reset( turnstileId );
		}
	} );

	teardown = () => window.clearInterval( cycle );
}

let turnstileScript: Promise< NonNullable< Window[ 'turnstile' ] > > | undefined;
function loadTurnstile() {
	turnstileScript ??= new Promise( ( resolve, reject ) => {
		const script = document.createElement( 'script' );
		script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
		script.onload = () => resolve( window.turnstile! );
		script.onerror = reject;
		document.head.append( script );
	} );
	return turnstileScript;
}

function watchJob( id: string ) {
	let phase: 'working' | 'done' | 'failed' | undefined;
	let timer: number | undefined;
	let stopped = false;

	const render = ( job: JobView ) => {
		const next = job.status === 'done' || job.status === 'failed' ? job.status : 'working';
		if ( next !== phase ) {
			phase = next;
			stage.innerHTML = { working, done, failed }[ next ]( job );
			if ( next === 'done' ) {
				wireCopyPrompt( job );
			}
			const titles = { working: 'Liberating', done: 'Free', failed: 'Couldn’t free' };
			document.title = `${ titles[ next ] }: ${ siteLabel( job ) } · liberate.sh`;
		}
		if ( next === 'working' ) {
			updateProgress( job );
		}
		return next;
	};

	const poll = async () => {
		const response = await fetch( `/api/jobs/${ id }` ).catch( () => undefined );
		if ( stopped ) {
			return;
		}
		if ( response?.status === 404 ) {
			stage.innerHTML = missing();
			return;
		}
		const working = response?.ok ? render( await response.json() ) === 'working' : true;
		if ( working ) {
			timer = window.setTimeout( poll, 3000 );
		}
	};
	void poll();

	teardown = () => {
		stopped = true;
		window.clearTimeout( timer );
	};
}

const platformLabel = ( job: JobView ) => platformFromHost( job.host ) ?? 'the old platform';

/** The site's own name when it has a usable one, else its address. */
const siteLabel = ( job: JobView ) => job.siteName ?? job.host;

const siteHeading = ( job: JobView ) =>
	`<span class="site" style="--chars: ${ siteLabel( job ).length }">${ escape(
		siteLabel( job )
	) }</span>`;

const working = ( job: JobView ) => `
	<h1 class="headline">Leaving ${ strike( platformLabel( job ), job.progress ) }…</h1>
	<p class="status" role="status"></p>
	<ol class="steps" role="progressbar" aria-label="Progress" aria-valuemin="0" aria-valuemax="100">
		${ STEPS.map( ( step ) => `<li data-step="${ step }">${ STEP_LABELS[ step ] }</li>` ).join( '' ) }
	</ol>
	<p class="fine">
		This page updates by itself. You can close it and come back: bookmark it, and your files
		will wait here for ${ retention() } once they’re ready.
	</p>`;

function updateProgress( job: JobView ) {
	const word = stage.querySelector< HTMLElement >( '.x' )!;
	word.textContent = platformLabel( job );
	word.style.setProperty( '--p', String( job.progress ) );
	stage.querySelector( '.status' )!.textContent = job.detail ?? 'Working…';
	const steps = stage.querySelector( '.steps' )!;
	steps.setAttribute( 'aria-valuenow', String( Math.round( job.progress * 100 ) ) );
	const current = job.step ? STEPS.indexOf( job.step ) : -1;
	steps.querySelectorAll( 'li' ).forEach( ( item, index ) => {
		item.className = index < current ? 'done' : index === current ? 'now' : '';
	} );
}

function summarize( { counts, siteName, host }: JobView ) {
	const pages = counts?.pages;
	const what = pages ? `${ pages } page${ pages === 1 ? '' : 's' }` : 'Your pages';
	// When the headline shows the site's name, the address still says which site it was.
	const from = siteName ? ` from ${ escape( host ) }` : '';
	return `${ what }${ from }, plus the look.`;
}

const megabytes = ( bytes = 0 ) => {
	const mb = bytes / 1024 ** 2;
	return `${ mb < 10 ? Math.max( 0.1, mb ).toFixed( 1 ) : Math.round( mb ) } MB`;
};

function expiry( timestamp: number | undefined ) {
	const hours = Math.max(
		1,
		Math.round( ( ( timestamp ?? Date.now() ) - Date.now() ) / 3_600_000 )
	);
	return new Intl.RelativeTimeFormat( 'en', { numeric: 'auto' } ).format( hours, 'hour' );
}

const done = ( job: JobView ) => `
	${
		platformFromHost( job.host )
			? `<p class="was" aria-hidden="true">${ strike( platformFromHost( job.host )! ) }</p>`
			: ''
	}
	<h1 class="headline">${ siteHeading( job ) }<br>is free.</h1>
	<p class="summary">${ summarize( job ) }</p>
	${ job.warning ? `<p class="note">${ escape( job.warning ) }</p>` : '' }
	<div class="actions">
		<a class="button primary" href="/api/jobs/${ job.id }/files/site" download>
			Download your site <small>.zip · ${ megabytes( job.bytes ) }</small>
		</a>
		<button type="button" class="button copy-prompt">
			Copy setup prompt <small>for your AI agent</small>
		</button>
	</div>
	<p class="copied" role="status"></p>
	<textarea class="prompt" readonly hidden aria-label="Setup prompt"></textarea>
	<p class="hosts">
		Give it a new home:
		<a href="https://wordpress.com/hosting/">WordPress.com</a> ·
		<a href="https://pressable.com/">Pressable</a> ·
		or any WordPress host.
	</p>
	<p class="hosts try">
		In no hurry? Open it in <a href="https://developer.wordpress.com/studio/">Studio</a>, the free
		WordPress app, and make it yours on your own machine first — change the colours, rewrite the
		words, break things. Publish when it feels like yours. Working with an AI agent that knows
		Studio? Copy the setup prompt, paste it in, and it does the setting up for you.
	</p>
	<details class="how">
		<summary>How do I move in?</summary>
		<ol>
			<li>Install <a href="https://developer.wordpress.com/studio/">Studio</a>, the free local
				WordPress app for Mac, Windows and Linux.</li>
			<li>Add a site in Studio, open its <strong>Import / Export</strong> tab, and drop this zip
				in. It replaces that site's files and database with yours.</li>
			<li>Open the site. It runs on your own machine, so you can rewrite pages, swap the theme and
				fix whatever came across badly, with nothing public and nothing to pay for.</li>
			<li>When it's ready, <strong>Connect site</strong> points Studio at a WordPress.com site —
				it can create one for you — and <strong>Push</strong> puts your copy online.
				<a href="https://developer.wordpress.com/docs/developer-tools/studio/sync/">Sync</a> keeps
				working after that: push again when you change something, pull to bring the live site
				back down.</li>
		</ol>
		<p><strong>Somewhere else?</strong> The zip holds your <code>wp-content</code> folder and your
			site's database, so you can take it to any WordPress host.</p>
	</details>
	<p class="fine">Your files are deleted ${ expiry(
		job.expiresAt
	) }. <a href="/">Liberate another site</a></p>`;

function wireCopyPrompt( job: JobView ) {
	const button = stage.querySelector< HTMLButtonElement >( '.copy-prompt' )!;
	const status = stage.querySelector< HTMLElement >( '.copied' )!;
	const fallback = stage.querySelector< HTMLTextAreaElement >( '.prompt' )!;
	button.addEventListener( 'click', async () => {
		const prompt = setupPrompt( job, window.location.origin );
		try {
			await navigator.clipboard.writeText( prompt );
			fallback.hidden = true;
			status.textContent = 'Copied. Paste it into Claude, or any agent that can use Studio.';
		} catch {
			// No clipboard (an insecure origin, a denied permission): hand it over to copy by hand.
			fallback.value = prompt;
			fallback.hidden = false;
			fallback.select();
			status.textContent = 'Couldn’t reach the clipboard. Here it is to copy yourself.';
		}
	} );
}

const failed = ( job: JobView ) => `
	<h1 class="headline">Couldn’t free<br>${ siteHeading( job ) }.</h1>
	<p class="status">${ escape( job.error ?? 'Something went wrong.' ) }</p>
	<div class="actions">
		<a class="button primary" href="/?url=${ encodeURIComponent( job.url ) }">Try again</a>
	</div>`;

const missing = () => `
	<h1 class="headline">Nothing here<br>anymore.</h1>
	<p class="status">Liberated sites are deleted after ${ retention() }, and this one is gone.</p>
	<div class="actions"><a class="button primary" href="/">Liberate a site</a></div>`;

async function start() {
	try {
		config = await ( await fetch( '/api/config' ) ).json();
	} catch {
		// Keep the defaults; the API will say if something is off.
	}
	if ( config.simulated ) {
		document.body.insertAdjacentHTML(
			'afterbegin',
			'<p class="simulated">Simulated mode: nothing is crawled, and downloads are placeholders.</p>'
		);
	}
	window.addEventListener( 'popstate', route );
	startMakers();
	route();
}

void start();
