declare module 'express-unless' {
  import { RequestHandler } from 'express';
  
  interface UnlessOptions {
    method?: string | string[];
    path?: string | RegExp | (string | RegExp)[];
    ext?: string | string[];
    custom?: (req: any) => boolean;
    useOriginalUrl?: boolean;
  }
  
  function unless(options: UnlessOptions): (middleware: RequestHandler) => RequestHandler;
  
  export = unless;
}