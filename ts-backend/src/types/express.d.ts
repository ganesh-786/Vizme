import 'express-serve-static-core';
import type { Logger } from 'pino';
import type { TokenPayload } from '@/services/auth.service.js';

declare module 'express-serve-static-core' {
  interface Request {
    log?: Logger;
    user?: TokenPayload;
    tenantId?: string;
  }
}

declare module 'pino-http' {
  import type { RequestHandler } from 'express';
  import type { Logger } from 'pino';

  function pinoHttp(options?: { logger?: Logger }): RequestHandler;
  export default pinoHttp;
}
