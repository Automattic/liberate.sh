import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { UserError } from './guards.ts';
import { isPublicAddress } from './network.mjs';

type Lookup = ( host: string ) => Promise< { address: string }[] >;

const defaultLookup: Lookup = ( host ) => dnsLookup( host, { all: true, verbatim: true } );

/** Reject hosts that don't resolve, or that resolve to anything but public addresses. */
export async function assertPublicHost( hostname: string, lookup: Lookup = defaultLookup ) {
	let addresses: string[];
	try {
		addresses = isIP( hostname )
			? [ hostname ]
			: ( await lookup( hostname ) ).map( ( a ) => a.address );
	} catch {
		addresses = [];
	}
	if ( ! addresses.length ) {
		throw new UserError( 'We couldn’t find that website. Check the address and try again.' );
	}
	if ( ! addresses.every( isPublicAddress ) ) {
		throw new UserError( 'That address isn’t a public website.' );
	}
}
