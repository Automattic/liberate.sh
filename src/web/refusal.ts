/**
 * What to tell a visitor when the API refuses a start without a reason the page can read.
 * The edge in front of the site swaps some answers, a 429 among them, for its own HTML page,
 * so the status is all that is left of the reason.
 */
export function refusalFor( status: number ) {
	switch ( status ) {
		case 429:
			return 'You’ve liberated several sites already. Please try again in an hour.';
		case 503:
			return 'liberate.sh is copying as many sites as it can right now. Please try again later.';
		default:
			return `Something went wrong (${ status }). Please try again.`;
	}
}
