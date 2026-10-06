import { setupPrompt } from './prompt.ts';

describe( 'setupPrompt', () => {
	const job = { id: 'abc123', host: 'nickdiego.com', expiresAt: Date.UTC( 2026, 9, 9, 12 ) };

	it( 'points at the stable download endpoint on this origin', () => {
		const prompt = setupPrompt( job, 'https://liberate.sh' );
		expect( prompt ).toContain( 'https://liberate.sh/api/jobs/abc123/files/site' );
		expect( prompt ).toContain( 'nickdiego.com' );
		expect( prompt ).toContain( 'WordPress Studio' );
	} );

	it( 'says until when the download works, when it knows', () => {
		expect( setupPrompt( job, 'https://liberate.sh' ) ).toMatch( /It works until .*2026/ );
		expect( setupPrompt( { ...job, expiresAt: undefined }, 'https://liberate.sh' ) ).not.toContain(
			'It works'
		);
	} );
} );
