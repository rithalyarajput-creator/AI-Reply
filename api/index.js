// Single serverless entry point. vercel.json rewrites /api/* (and /r/*) here as ?__p=/<path>.
// Route modules register themselves on import; the dispatcher lives in lib/router.js.
import '../routes/accounts.js';
import '../routes/platform.js';
import '../routes/portal.js';
import '../routes/public.js';
import { dispatch } from '../lib/router.js';

// We read the raw body ourselves so webhook signatures can be verified.
export const config = { api: { bodyParser: false } };

export default dispatch;
