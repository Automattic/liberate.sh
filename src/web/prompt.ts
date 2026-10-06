import type { JobView } from '../shared.ts';

/**
 * What to paste into an AI agent so it sets the site up in Studio. It names the stable download
 * endpoint, never the signed URL behind it, which expires within minutes.
 */
export function setupPrompt( job: Pick< JobView, 'id' | 'host' | 'expiresAt' >, origin: string ) {
	const until = job.expiresAt
		? ` It works until ${ new Date( job.expiresAt ).toLocaleString( 'en', {
				dateStyle: 'long',
				timeStyle: 'short',
		  } ) }.`
		: '';
	return `I used liberate.sh to turn my website ${ job.host } into a WordPress site. Set it up for me as a new local site in WordPress Studio (https://developer.wordpress.com/studio/), start it, and give me its address.

The site is a zip: ${ origin }/api/jobs/${ job.id }/files/site
- That link redirects to a short-lived download, so request it fresh rather than reusing an old redirect.${ until }
- It holds a wp-content folder, not a full WordPress install: the theme, a plugin, the uploads, and an SQLite database at wp-content/database/.ht.sqlite. There is no SQL dump.
- Studio's import takes the zip as it is and replaces the new site's files and database with it.

If Studio isn't installed, tell me how to get it instead of using another local WordPress tool.`;
}
