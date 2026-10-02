import { json, type Context } from '../_lib/runtime.ts';
import type { PublicConfig } from '../../src/shared.ts';

export async function GET( _request: Request, context: Context ) {
	const hours = Number( context.env.LIBERATE_RETENTION_HOURS ?? 72 );
	const body: PublicConfig = {
		retentionHours: Number.isFinite( hours ) && hours > 0 ? hours : 72,
		turnstileSiteKey: String( context.env.TURNSTILE_SITE_KEY ?? '' ) || undefined,
	};
	return json( body );
}
