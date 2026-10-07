import { refusalFor } from './refusal.ts';

describe( 'refusalFor', () => {
	it( 'says to come back later when the edge has swapped a limit for its own page', () => {
		expect( refusalFor( 429 ) ).toMatch( /try again later/ );
		expect( refusalFor( 429 ) ).toBe( refusalFor( 503 ) );
	} );

	it( 'names the status of anything else, so a report says which one it was', () => {
		expect( refusalFor( 502 ) ).toBe( 'Something went wrong (502). Please try again.' );
	} );
} );
