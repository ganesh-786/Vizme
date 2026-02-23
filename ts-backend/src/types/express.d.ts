import 'express-serve-static-core';
import type { Logger } from 'pino';

declare module 'express-serve-static-core' {
  interface Request {
    log?: Logger;
  }
}

declare module 'pino-http' {
  import type { RequestHandler } from 'express';
  import type { Logger } from 'pino';

  function pinoHttp(options?: { logger?: Logger }): RequestHandler;
  export default pinoHttp;
}
